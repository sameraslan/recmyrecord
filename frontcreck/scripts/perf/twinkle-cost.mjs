#!/usr/bin/env node
/**
 * node scripts/perf/twinkle-cost.mjs [--mode gpu|software] [--viewport desktop|phone] [--open whole] [--first on|off] [--no-warmup] [--no-flares] [--css <file>]
 *
 * What the star glints cost in a real browser, against the production build (run `npm run build` first).
 * Per renderer and viewport: 20 s of the resting map with the glints on, then 20 s with them off; on desktop
 * the same again with the mouse moving over the map. Each run records the longest task, the longest gap
 * between animation frames, the frames the map canvas drew, and whether a long task began around a glint being
 * made. Writes scripts/perf/out/twinkle-cost-<time>.json, prints a Markdown table, and exits 1 when a rule is
 * broken. The budgets of perf.mjs are not touched: this script only adds measurements. (The hover path has its
 * own script: docs/design/trifid-theme/reviews/baseline/hover-measure.mjs.)
 *
 * The map is measured where /map opens (the Overview). --open whole measures it at the whole-cloud fit instead
 * (window.__rmrOpen), the framing of the baseline. The glints are switched through window.__rmrTwinkle, and each
 * run reads back what the app did with it (window.__rmr.twinkle.enabled()).
 *
 * Renderers. The app plays no glints on a software renderer (src/components/map/state/twinkle.ts twinkleShown):
 * the first runs of this script found long frames there. The software rows are still measured, with the glints
 * forced by the switch ('on'), so the reason stays on record and a later change can be tried; they are marked
 * "no" under "Visitors get glints" and their timings are reported, not judged. What is judged there: that a
 * page loaded with no switch made no glint, that no canvas frame is drawn for a forced glint, and the cap.
 *
 * Order. Each pair runs with the glints on first, then off (--first off swaps that). The first time the mouse
 * moves over a freshly loaded map costs a long frame or two whatever the glints do (the hover label's first paint
 * and the first hover redraws; the prototype's README records the same), and whichever run comes first would be
 * charged for it. So the mouse wanders for 4 s before the two measured mouse runs. --no-warmup leaves that out;
 * with --first off it shows the first-hover cost landing on the run without glints.
 *
 * --no-flares hides the flares with an injected style rule, to measure the first fallback of the kill rule (no
 * flares) on the same build before any code is changed. --css <file> injects a stylesheet the same way, to try a
 * cheaper variant of a rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { assertNativeChrome } from '../check-native.mjs';
import { startServer } from '../serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PORT = 3210;
let BASE = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODES = {
  software: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  gpu: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'],
};
const OPEN = opt('--open');
if (OPEN !== null && OPEN !== 'whole') {
  console.error('--open takes whole');
  process.exit(2);
}
const FIRST = opt('--first') ?? 'on';
if (FIRST !== 'on' && FIRST !== 'off') {
  console.error('--first takes on or off');
  process.exit(2);
}
const ORDER = FIRST === 'on' ? [true, false] : [false, true];
const WARMUP = !args.includes('--no-warmup');
const NO_FLARES = args.includes('--no-flares');
const CSS = opt('--css') ? fs.readFileSync(opt('--css'), 'utf8') : null;
/** Length of the unmeasured mouse wander before the mouse runs, ms. */
const WARMUP_MS = 4000;
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
/** Length of one run, ms. */
const RUN_MS = 20000;
/** One star pick and DOM write may take at most this (half a frame at 60 Hz). */
const SPAWN_LIMIT_MS = 8;
/** With the glints on, the longest task and the longest frame gap may exceed the same run without them by at
 * most this: the spread between two identical runs. */
const NOISE_MS = 8;

/* Runs in the page before its scripts. */
const IN_PAGE = () => {
  const lt = [];
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) lt.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  }
  window.__fx = {
    /** Watches the page for `ms`: long tasks, the longest gap between animation frames, glints made, frames
     * the map canvas drew. Counting animation frames does not make the map draw. */
    async watch(ms) {
      const layer = document.querySelector('.tw-layer');
      const made = [];
      const mo = new MutationObserver((records) => {
        for (const r of records) if (r.addedNodes.length) made.push(performance.now());
      });
      if (layer) mo.observe(layer, { childList: true });
      const f0 = window.__rmr?.frames ?? 0;
      const t0 = performance.now();
      let last = t0;
      let longestGap = 0;
      let mostAlive = 0;
      // Where the longest gap fell (reported, not judged): when it began, how many glints were in the layer when
      // it ended, and how long before its start the last glint had been made (null when none had).
      let gapAt = 0;
      let gapAlive = 0;
      let gapSinceGlint = null;
      while (performance.now() - t0 < ms) {
        const now = await new Promise((r) => requestAnimationFrame(() => r(performance.now())));
        if (now - last > longestGap) {
          longestGap = now - last;
          gapAt = last - t0;
          gapAlive = layer ? layer.childElementCount : 0;
          const before = made.filter((m) => m <= now);
          gapSinceGlint = before.length ? Math.round(last - before[before.length - 1]) : null;
        }
        last = now;
        if (layer) mostAlive = Math.max(mostAlive, layer.childElementCount);
      }
      mo.disconnect();
      await new Promise((r) => setTimeout(r, 150)); // the observer delivers long tasks a little late
      const tasks = lt.filter(([start]) => start >= t0 && start <= last);
      const atGlint = tasks.filter(([start, dur]) => made.some((m) => m >= start - 20 && m <= start + dur + 20));
      return {
        longTasks: tasks.length,
        longestTaskMs: Math.round(Math.max(0, ...tasks.map((t) => t[1]))),
        longestGapMs: Math.round(longestGap),
        longestGapAtMs: Math.round(gapAt),
        glintsAliveAtLongestGap: gapAlive,
        msFromLastGlintToLongestGap: gapSinceGlint,
        glints: made.length,
        mostAlive,
        longTasksAtGlint: atGlint.length,
        canvasFrames: (window.__rmr?.frames ?? 0) - f0,
      };
    },
  };
};

async function runs(browser, mode, vpName) {
  const rows = [];
  const ctx = await browser.newContext(VIEWPORTS[vpName]);
  const page = await ctx.newPage();
  await page.addInitScript(IN_PAGE);
  if (NO_FLARES) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.tw b.tw-flare::before, .tw b.tw-flare::after { display: none !important; }' }))));
  if (CSS) await page.addInitScript((css) => document.addEventListener('DOMContentLoaded', () => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }))), CSS);
  if (OPEN) await page.addInitScript((v) => { window.__rmrOpen = v; }, OPEN);
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  // The map has drawn, the glints are there, the camera rests, and part 1's gas has settled ('ready': all three
  // stops are in; 'off': there is none), as e2e/helpers.ts waitForMap asks.
  await page.waitForFunction(
    () => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && !!window.__rmr?.twinkle && !window.__rmr.map.isAnimating() && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(2500); // fonts, names and the first frames have settled
  // Part 1's sharper gas image (gpu desktop only) is fetched about a second after the map settles and fades in over
  // up to 14 frames: wait until it is not on its way and neither its flag nor the frame count has changed for 2.5 s
  // (e2e/helpers.ts waitForGasSharpSettled), so the still runs count no frame of it.
  await page.waitForFunction(
    (quiet) => {
      const s = String(window.__rmr?.gasSharp);
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (s === 'loading' || window.__gsF !== f || window.__gsS !== s) {
        window.__gsF = f;
        window.__gsS = s;
        window.__gsT = now;
        return false;
      }
      return now - window.__gsT >= quiet;
    },
    2500, // longer than GAS_SHARP_RETRY_MS (2000, shaders/gas.ts): a failed load goes back to 'waiting' and retries
    { polling: 50, timeout: 45000 },
  );
  // As a visitor gets it, before any switch is set: does this renderer play glints, and has it made any so far?
  const visitor = await page.evaluate(() => ({ software: window.__rmr?.gasLite === true, made: window.__rmr.twinkle.stats.spawned }));
  const shown = !visitor.software;
  const base = { mode, vp: vpName, shown, madeBeforeSwitch: visitor.made };
  const watch = (on) =>
    page.evaluate(
      async ([enabled, ms]) => {
        const tw = window.__rmr.twinkle;
        window.__rmrTwinkle = enabled ? 'on' : 'off';
        tw.stats.worstSpawnMs = 0;
        await new Promise((r) => setTimeout(r, 1000));
        const r = await window.__fx.watch(ms);
        return { ...r, worstSpawnMs: tw.stats.worstSpawnMs, enabled: tw.enabled() };
      },
      [on, RUN_MS],
    );
  for (const on of ORDER) rows.push({ ...base, run: 'still', twinkle: on ? 'on' : 'off', ...(await watch(on)) });
  if (vpName === 'desktop') {
    // The mouse wanders over the map, rests, and wanders again: a hover redraws the map; the glints must add nothing to it.
    const wander = async (ms) => {
      const t0 = Date.now();
      let k = 0;
      while (Date.now() - t0 < ms) {
        k++;
        await page.mouse.move(520 + 380 * Math.sin(k / 9), 470 + 200 * Math.cos(k / 13), { steps: 2 });
        await page.waitForTimeout(k % 40 < 30 ? 30 : 400);
      }
    };
    if (WARMUP) {
      await wander(WARMUP_MS);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(600);
    }
    for (const on of ORDER) {
      const pending = watch(on);
      await wander(RUN_MS);
      rows.push({ ...base, run: 'mouse moving', twinkle: on ? 'on' : 'off', ...(await pending) });
      await page.mouse.move(5, 5);
    }
  }
  await ctx.close();
  return rows;
}

function check(rows) {
  const fails = [];
  for (const r of rows) {
    if (r.enabled !== (r.twinkle === 'on')) fails.push(`${r.mode} ${r.vp} ${r.run}: the switch said ${r.twinkle} but the app's timer reads enabled ${r.enabled}`);
    if (r.twinkle === 'off' && r.glints > 0) fails.push(`${r.mode} ${r.vp} ${r.run}: ${r.glints} glints were made with the switch off, so the comparison is void`);
    if (!r.shown && r.madeBeforeSwitch > 0) fails.push(`${r.mode} ${r.vp} ${r.run}: ${r.madeBeforeSwitch} glints were made on a software renderer before the switch forced them`);
  }
  for (const r of rows.filter((q) => q.twinkle === 'on')) {
    const where = `${r.mode} ${r.vp} ${r.run}`;
    const off = rows.find((q) => q.mode === r.mode && q.vp === r.vp && q.run === r.run && q.twinkle === 'off');
    if (r.glints === 0) fails.push(`${where}: no glint was made in ${RUN_MS / 1000} s, so nothing was measured`);
    if (r.mostAlive > 3) fails.push(`${where}: ${r.mostAlive} glints alive at once (at most 3)`);
    if (r.run === 'still' && r.canvasFrames !== 0) fails.push(`${where}: the map canvas drew ${r.canvasFrames} frames while glints played (must be 0)`);
    // The timing rules judge what a visitor gets. Forced glints on a renderer that plays none are reported only.
    if (!r.shown) continue;
    if (r.worstSpawnMs > SPAWN_LIMIT_MS) fails.push(`${where}: making a glint took ${r.worstSpawnMs} ms (limit ${SPAWN_LIMIT_MS} ms)`);
    if (r.longTasksAtGlint > 0) fails.push(`${where}: ${r.longTasksAtGlint} long tasks began around a glint being made`);
    if (off && r.longestTaskMs > off.longestTaskMs + NOISE_MS) fails.push(`${where}: longest task ${r.longestTaskMs} ms with glints, ${off.longestTaskMs} ms without`);
    if (off && r.longestGapMs > off.longestGapMs + NOISE_MS) fails.push(`${where}: longest frame gap ${r.longestGapMs} ms with glints, ${off.longestGapMs} ms without`);
  }
  return fails;
}

function table(rows) {
  const head = '| Renderer | Viewport | Visitors get glints | Run | Glints | Made | Most alive | Longest task (ms) | Long tasks | Long tasks at a glint | Longest frame gap (ms) | Canvas frames | Longest glint write (ms) |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const line = (r) => `| ${r.mode} | ${r.vp} | ${r.shown ? 'yes' : 'no (forced here)'} | ${r.run} | ${r.twinkle} | ${r.glints} | ${r.mostAlive} | ${r.longestTaskMs} | ${r.longTasks} | ${r.longTasksAtGlint} | ${r.longestGapMs} | ${r.canvasFrames} | ${r.worstSpawnMs} |`;
  return [head, sep, ...rows.map(line)].join('\n');
}

async function main() {
  const server = await startServer(PORT);
  BASE = server.base;
  const rows = [];
  try {
    for (const mode of opt('--mode') ? [opt('--mode')] : Object.keys(MODES)) {
      const browser = await chromium.launch({ channel: 'chrome', headless: true, args: MODES[mode] });
      await assertNativeChrome(browser); // a translated (x86_64) Chrome inflates every timing about 50x
      try {
        for (const vp of opt('--viewport') ? [opt('--viewport')] : Object.keys(VIEWPORTS)) rows.push(...(await runs(browser, mode, vp)));
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.stop();
  }
  const fails = check(rows);
  console.log(`\nOpening framing: ${OPEN === 'whole' ? 'the whole map (--open whole)' : 'the Overview (the app\'s own)'}. Glints ${FIRST} first. Mouse warm-up: ${WARMUP ? `${WARMUP_MS / 1000} s` : 'none'}.${NO_FLARES ? ' Flares hidden (--no-flares).' : ''}${CSS ? ` Extra CSS: ${opt('--css')}.` : ''}\n\n${table(rows)}\n`);
  const outDir = path.join(ROOT, 'scripts/perf/out');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `twinkle-cost-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ open: OPEN ?? 'app', first: FIRST, warmup: WARMUP, flares: !NO_FLARES, css: opt('--css'), rows, fails }, null, 1));
  console.log(`Saved ${path.relative(ROOT, file)}`);
  if (fails.length) {
    console.error(`FAIL\n${fails.join('\n')}`);
    process.exit(1);
  }
  const forced = rows.filter((r) => !r.shown && r.twinkle === 'on');
  for (const r of forced) {
    const off = rows.find((q) => q.mode === r.mode && q.vp === r.vp && q.run === r.run && q.twinkle === 'off');
    if (off && (r.longestGapMs > off.longestGapMs + NOISE_MS || r.longestTaskMs > off.longestTaskMs + NOISE_MS)) {
      console.log(`Reported only (${r.mode} ${r.vp} ${r.run}, glints forced where visitors get none): longest frame gap ${r.longestGapMs} ms with glints, ${off.longestGapMs} ms without; longest task ${r.longestTaskMs} ms, ${off.longestTaskMs} ms.`);
    }
  }
  console.log('The glints cost no responsiveness where visitors get them.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
