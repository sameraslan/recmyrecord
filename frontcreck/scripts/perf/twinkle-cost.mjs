#!/usr/bin/env node
/**
 * node scripts/perf/twinkle-cost.mjs [--mode gpu|software] [--viewport desktop|phone|phone,desktop] [--open whole] [--first on|off|held] [--no-warmup] [--no-flares] [--css <file>]
 *
 * What the star glints cost in a real browser, against the production build (run `npm run build` first).
 * Per renderer and viewport: 20 s of the resting map with the glints on, then 20 s with them off; on desktop
 * the same again with the mouse moving over the map. Each run records the longest task, the longest gap
 * between animation frames, every frame gap over 32 ms (when, how many glints were alive, how long since a glint
 * was last made or removed), the frames the map canvas drew, and whether a long task began around a glint being
 * made. Writes scripts/perf/out/twinkle-cost-<time>.json, prints a Markdown table and the long gaps, and exits 1
 * when a rule is broken. The budgets of perf.mjs are not touched: this script only adds measurements. (The hover
 * path has its own script: docs/design/trifid-theme/reviews/baseline/hover-measure.mjs.)
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
 * --viewport phone,desktop runs the phone first in the same browser process: the first runs always ran desktop
 * first, so "the phone never stalled" could be an effect of the order.
 *
 * Order, and the first hover. Each pair runs with the glints on first, then off (--first off swaps that). The
 * first time the mouse moves over a freshly loaded map costs a long frame or two whatever the glints do (the
 * hover label's first paint and the first hover redraws). By default the mouse wanders for 4 s before the two
 * measured mouse runs, so neither is charged for it: that judges hovering after the first seconds, not the first
 * hover. --no-warmup leaves the wander out, and then the first measured mouse run IS the first hover: the watch
 * is started, and seen to be running, before the mouse first moves. To judge the first hover, compare sessions
 * of `--no-warmup --first on` with sessions of `--no-warmup --first off` (one browser launch each), interleaved.
 * Within one --no-warmup session the first mouse run is the first hover and the second is a later hover, so this
 * script does not compare those two with each other (its exit code used to, and failed on the order alone). The
 * first hover is judged across sessions instead:
 *   node scripts/perf/twinkle-cost.mjs --first-hover-verdict <saved session .json files or folders of them>
 * starts no browser, reads the first-hover row of each saved --no-warmup session, prints the three arms (median,
 * best to worst, n) and exits 1 when the median longest frame gap or longest task of the sessions with glints
 * (on, or held) is more than NOISE_MS above the median of the sessions without, or an arm has fewer than three
 * sessions (firstHoverVerdict in lib.mjs).
 *
 * --first held is the third arm: in the mouse run the glints stay off until 1.5 s after the hover label first
 * showed, and are then switched on (the stricter candidate fix; the app itself already makes no glint while an
 * album is hovered or for 500 ms after). Its pair is held, then off. In the still runs "held" is the same as on.
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
import { firstHoverVerdict } from './lib.mjs';

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
if (FIRST !== 'on' && FIRST !== 'off' && FIRST !== 'held') {
  console.error('--first takes on, off or held');
  process.exit(2);
}
/** The two runs of a pair: 'on', 'off', or 'held' (on, but in a mouse run only from HELD_MS after the hover label
 * first showed). */
const ORDER = FIRST === 'on' ? ['on', 'off'] : FIRST === 'off' ? ['off', 'on'] : ['held', 'off'];
/** The third arm: how long after the hover label first showed the glints are switched on, ms. */
const HELD_MS = 1500;
/** A frame gap longer than this is listed with what the glints were doing, ms (two frames at 60 Hz). */
const GAP_LOG_MS = 32;
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
    /** True from the moment a watch has taken its first time stamp until it ends: the script waits for it before
     * it first moves the mouse, so the first hover is inside the watch. */
    watching: false,
    /** Watches the page for `ms`: long tasks, the longest gap between animation frames and every gap over
     * `gapLogMs`, glints made, frames the map canvas drew. Counting animation frames does not make the map draw.
     * With `heldMs` set, the glints are switched on that long after the hover label first shows. */
    async watch(ms, gapLogMs, heldMs) {
      const layer = document.querySelector('.tw-layer');
      const made = [];
      // Every time a glint was added to or removed from the layer.
      const changed = [];
      const mo = new MutationObserver((records) => {
        const now = performance.now();
        for (const r of records) {
          if (r.addedNodes.length) made.push(now);
          if (r.addedNodes.length || r.removedNodes.length) changed.push(now);
        }
      });
      if (layer) mo.observe(layer, { childList: true });
      const f0 = window.__rmr?.frames ?? 0;
      const t0 = performance.now();
      window.__fx.watching = true;
      // When the hover label first showed in this watch (its opacity is written inline by the map's driver).
      const tip = document.querySelector('.map-tip');
      let labelAt = null;
      let heldOnAt = null;
      const tipMo = new MutationObserver(() => {
        if (labelAt !== null || tip.style.opacity !== '1') return;
        labelAt = performance.now();
        if (heldMs !== null) {
          setTimeout(() => {
            window.__rmrTwinkle = 'on';
            heldOnAt = performance.now();
          }, heldMs);
        }
      });
      if (tip) tipMo.observe(tip, { attributes: true, attributeFilter: ['style'] });
      let last = t0;
      let longestGap = 0;
      let mostAlive = 0;
      // Where the longest gap fell (reported, not judged): when it began, how many glints were in the layer when
      // it ended, and how long before its start the last glint had been made (null when none had).
      let gapAt = 0;
      let gapAlive = 0;
      let gapSinceGlint = null;
      const longGaps = [];
      while (performance.now() - t0 < ms) {
        const now = await new Promise((r) => requestAnimationFrame(() => r(performance.now())));
        const gap = now - last;
        if (gap > longestGap || gap > gapLogMs) {
          const alive = layer ? layer.childElementCount : 0;
          const madeBefore = made.filter((m) => m <= now);
          const changedBefore = changed.filter((m) => m <= now);
          if (gap > longestGap) {
            longestGap = gap;
            gapAt = last - t0;
            gapAlive = alive;
            gapSinceGlint = madeBefore.length ? Math.round(last - madeBefore[madeBefore.length - 1]) : null;
          }
          if (gap > gapLogMs) {
            longGaps.push({
              atMs: Math.round(last - t0),
              gapMs: Math.round(gap),
              glintsAlive: alive,
              // Negative: the glint was made or removed inside the gap, that long after it began.
              msSinceGlintMadeOrRemoved: changedBefore.length ? Math.round(last - changedBefore[changedBefore.length - 1]) : null,
              msSinceLabelFirstShown: labelAt === null ? null : Math.round(last - labelAt),
            });
          }
        }
        last = now;
        if (layer) mostAlive = Math.max(mostAlive, layer.childElementCount);
      }
      mo.disconnect();
      tipMo.disconnect();
      window.__fx.watching = false;
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
        longGaps,
        labelFirstShownAtMs: labelAt === null ? null : Math.round(labelAt - t0),
        heldOnAtMs: heldOnAt === null ? null : Math.round(heldOnAt - t0),
        firstGlintAtMs: made.length ? Math.round(made[0] - t0) : null,
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
  // As a visitor gets it, before any switch is set: does this renderer play glints (the app's own verdict on the
  // renderer, state/renderer.ts, whatever gas shader was chosen), and has it made any so far?
  const visitor = await page.evaluate(() => ({ software: window.__rmr.twinkle.software?.() ?? null, made: window.__rmr.twinkle.stats.spawned }));
  const shown = visitor.software === false;
  const base = { mode, vp: vpName, shown, softwareVerdict: visitor.software, madeBeforeSwitch: visitor.made };
  /** Sets the switch for a run and lets it take: 1 s, in which nothing is measured and the mouse is still. A
   * held run starts with the glints off. */
  const arm = (kind, mouse) =>
    page.evaluate(
      async (v) => {
        window.__rmrTwinkle = v;
        window.__rmr.twinkle.stats.worstSpawnMs = 0;
        await new Promise((r) => setTimeout(r, 1000));
      },
      kind === 'off' || (kind === 'held' && mouse) ? 'off' : 'on',
    );
  /** Starts the watch and resolves once it is running in the page, with `done`, the promise of its result (in an
   * object: an async function that returned the promise itself would wait for the whole watch). */
  const startWatch = async (kind, mouse) => {
    const done = page.evaluate(
      async ([ms, gapLog, held]) => {
        const r = await window.__fx.watch(ms, gapLog, held);
        const tw = window.__rmr.twinkle;
        return { ...r, worstSpawnMs: tw.stats.worstSpawnMs, hoverHeld: tw.stats.hoverHeld ?? null, enabled: tw.enabled() };
      },
      [RUN_MS, GAP_LOG_MS, kind === 'held' && mouse ? HELD_MS : null],
    );
    await page.waitForFunction(() => window.__fx.watching === true, null, { polling: 'raf', timeout: 10000 });
    return { done };
  };
  for (const kind of ORDER) {
    await arm(kind, false);
    rows.push({ ...base, run: 'still', twinkle: kind, ...(await (await startWatch(kind, false)).done) });
  }
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
    let firstHover = !WARMUP;
    for (const kind of ORDER) {
      // The switch is set and has taken, and the watch is running in the page, before the mouse first moves:
      // with --no-warmup the first measured run holds the first hover of this page load, from its first event.
      await arm(kind, true);
      const { done } = await startWatch(kind, true);
      await wander(RUN_MS);
      rows.push({ ...base, run: 'mouse moving', twinkle: kind, firstHover, ...(await done) });
      firstHover = false;
      await page.mouse.move(5, 5);
    }
  }
  await ctx.close();
  return rows;
}

function check(rows) {
  const fails = [];
  for (const r of rows) {
    if (r.enabled !== (r.twinkle !== 'off') && !(r.twinkle === 'held' && r.run === 'mouse moving' && r.labelFirstShownAtMs === null)) fails.push(`${r.mode} ${r.vp} ${r.run}: the switch said ${r.twinkle} but the app's timer reads enabled ${r.enabled}`);
    if (r.twinkle === 'off' && r.glints > 0) fails.push(`${r.mode} ${r.vp} ${r.run}: ${r.glints} glints were made with the switch off, so the comparison is void`);
    if (!r.shown && r.madeBeforeSwitch > 0) fails.push(`${r.mode} ${r.vp} ${r.run}: ${r.madeBeforeSwitch} glints were made on a software renderer before the switch forced them`);
  }
  for (const r of rows.filter((q) => q.twinkle === 'held' && q.run === 'mouse moving')) {
    const where = `${r.mode} ${r.vp} ${r.run}`;
    if (r.labelFirstShownAtMs === null) fails.push(`${where}: held run: the hover label never showed, so the glints were never switched on`);
    else if (r.firstGlintAtMs !== null && r.firstGlintAtMs < r.labelFirstShownAtMs + HELD_MS) fails.push(`${where}: held run: a glint was made ${r.firstGlintAtMs - r.labelFirstShownAtMs} ms after the hover label first showed (held for ${HELD_MS} ms)`);
  }
  for (const r of rows.filter((q) => q.twinkle !== 'off')) {
    const where = `${r.mode} ${r.vp} ${r.run}`;
    const off = rows.find((q) => q.mode === r.mode && q.vp === r.vp && q.run === r.run && q.twinkle === 'off');
    // In a mouse run the app holds new glints back while an album is hovered and for 500 ms after: a run in which
    // every tick was held made none, and says so in the notes below instead of failing.
    if (r.glints === 0 && !(r.run === 'mouse moving' && r.hoverHeld > 0)) fails.push(`${where}: no glint was made in ${RUN_MS / 1000} s, so nothing was measured`);
    if (r.mostAlive > 3) fails.push(`${where}: ${r.mostAlive} glints alive at once (at most 3)`);
    if (r.run === 'still' && r.canvasFrames !== 0) fails.push(`${where}: the map canvas drew ${r.canvasFrames} frames while glints played (must be 0)`);
    // The timing rules judge what a visitor gets. Forced glints on a renderer that plays none are reported only.
    if (!r.shown) continue;
    if (r.worstSpawnMs > SPAWN_LIMIT_MS) fails.push(`${where}: making a glint took ${r.worstSpawnMs} ms (limit ${SPAWN_LIMIT_MS} ms)`);
    if (r.longTasksAtGlint > 0) fails.push(`${where}: ${r.longTasksAtGlint} long tasks began around a glint being made`);
    // A pair that holds a first hover (--no-warmup) is a first hover beside a later one: the order decides it, not
    // the glints. It is judged across sessions (--first-hover-verdict), not here.
    if (r.firstHover || off?.firstHover) continue;
    if (off && r.longestTaskMs > off.longestTaskMs + NOISE_MS) fails.push(`${where}: longest task ${r.longestTaskMs} ms with glints, ${off.longestTaskMs} ms without`);
    if (off && r.longestGapMs > off.longestGapMs + NOISE_MS) fails.push(`${where}: longest frame gap ${r.longestGapMs} ms with glints, ${off.longestGapMs} ms without`);
  }
  return fails;
}

function table(rows) {
  const head = '| Renderer | Viewport | Visitors get glints | Run | Glints | Made | Most alive | Longest task (ms) | Long tasks | Long tasks at a glint | Longest frame gap (ms) | Canvas frames | Longest glint write (ms) |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const line = (r) => `| ${r.mode} | ${r.vp} | ${r.shown ? 'yes' : 'no (forced here)'} | ${r.run}${r.firstHover ? ' (first hover)' : ''} | ${r.twinkle} | ${r.glints} | ${r.mostAlive} | ${r.longestTaskMs} | ${r.longTasks} | ${r.longTasksAtGlint} | ${r.longestGapMs} | ${r.canvasFrames} | ${r.worstSpawnMs} |`;
  return [head, sep, ...rows.map(line)].join('\n');
}

/** Every frame gap over GAP_LOG_MS, one line each: which run, when, how long, and what the glints were doing. */
function gapLines(rows) {
  const out = [];
  for (const r of rows) {
    for (const g of r.longGaps ?? []) {
      out.push(
        `  ${r.mode} ${r.vp} ${r.run}${r.firstHover ? ' (first hover)' : ''}, glints ${r.twinkle}: ${g.gapMs} ms at ${g.atMs} ms; ${g.glintsAlive} alive; ` +
          `${g.msSinceGlintMadeOrRemoved === null ? 'no glint made or removed yet' : `${g.msSinceGlintMadeOrRemoved} ms after a glint was made or removed`}; ` +
          `${g.msSinceLabelFirstShown === null ? 'hover label not shown yet' : `${g.msSinceLabelFirstShown} ms after the hover label first showed`}`,
      );
    }
  }
  return out;
}

/** --first-hover-verdict: no browser; reads saved --no-warmup sessions and judges the first hover across them. */
function verdict(paths) {
  const files = paths.flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => /^twinkle-cost-.*\.json$/.test(f)).sort().map((f) => path.join(p, f)) : [p]));
  if (!files.length) {
    console.error('--first-hover-verdict takes saved twinkle-cost session files, or folders of them');
    process.exit(2);
  }
  const v = firstHoverVerdict(files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))), NOISE_MS);
  const cell = (x) => (x ? `${x.median} (${x.best} to ${x.worst})` : 'n/a');
  console.log(`First hover across ${files.length} saved session(s)${v.skipped ? `, ${v.skipped} left out (warmed up, no mouse run, or glints forced where visitors get none)` : ''}. One row per session: its first measured mouse run.\n`);
  console.log('| Glints | Sessions | Longest frame gap, median (best to worst), ms | Longest task, median (best to worst), ms | Median above every off session (gap / task) |\n|---|---|---|---|---|');
  for (const arm of ['on', 'off', 'held']) {
    const a = v.arms[arm];
    if (a) console.log(`| ${arm} | ${a.gap.n} | ${cell(a.gap)} | ${cell(a.task)} | ${arm === 'off' ? '' : `${a.gapBeyondOffSpread ?? 'n/a'} / ${a.taskBeyondOffSpread ?? 'n/a'}`} |`);
  }
  if (v.fails.length) {
    console.error(`\nFAIL\n${v.fails.join('\n')}`);
    process.exit(1);
  }
  console.log(`\nThe median first hover with glints (on, held) is within ${NOISE_MS} ms of the median without, in both measures.`);
}

async function main() {
  const vi = args.indexOf('--first-hover-verdict');
  if (vi >= 0) return verdict(args.slice(vi + 1));
  const server = await startServer(PORT);
  BASE = server.base;
  const rows = [];
  try {
    for (const mode of opt('--mode') ? [opt('--mode')] : Object.keys(MODES)) {
      const browser = await chromium.launch({ channel: 'chrome', headless: true, args: MODES[mode] });
      await assertNativeChrome(browser); // a translated (x86_64) Chrome inflates every timing about 50x
      try {
        for (const vp of opt('--viewport') ? opt('--viewport').split(',') : Object.keys(VIEWPORTS)) rows.push(...(await runs(browser, mode, vp)));
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.stop();
  }
  const fails = check(rows);
  console.log(`\nOpening framing: ${OPEN === 'whole' ? 'the whole map (--open whole)' : 'the Overview (the app\'s own)'}. Glints ${FIRST} first. Mouse warm-up: ${WARMUP ? `${WARMUP_MS / 1000} s` : 'none'}.${NO_FLARES ? ' Flares hidden (--no-flares).' : ''}${CSS ? ` Extra CSS: ${opt('--css')}.` : ''}\n\n${table(rows)}\n`);
  const gaps = gapLines(rows);
  console.log(gaps.length ? `Frame gaps over ${GAP_LOG_MS} ms (reported; the table's longest gap is what is judged):\n${gaps.join('\n')}\n` : `No frame gap over ${GAP_LOG_MS} ms in any run.\n`);
  for (const r of rows.filter((q) => q.run === 'mouse moving' && q.twinkle !== 'off')) {
    console.log(`${r.mode} ${r.vp} mouse moving, glints ${r.twinkle}: ${r.glints} glints made while the mouse moved; the hover hold has skipped ${r.hoverHeld ?? 'n/a'} ticks on this page so far.${r.glints === 0 ? ' No glint was made in this run: it measured the hover with no new glint, which is what a visitor gets while hovering.' : ''}`);
  }
  if (rows.some((r) => !r.shown && r.twinkle !== 'off')) console.log('Glints were forced on a software renderer for these rows (window.__rmrTwinkle = "on"): a state no visitor has.\n');
  const outDir = path.join(ROOT, 'scripts/perf/out');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `twinkle-cost-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ open: OPEN ?? 'app', first: FIRST, warmup: WARMUP, flares: !NO_FLARES, css: opt('--css'), rows, fails }, null, 1));
  console.log(`Saved ${path.relative(ROOT, file)}`);
  if (fails.length) {
    console.error(`FAIL\n${fails.join('\n')}`);
    process.exit(1);
  }
  const forced = rows.filter((r) => !r.shown && r.twinkle !== 'off');
  for (const r of forced) {
    const off = rows.find((q) => q.mode === r.mode && q.vp === r.vp && q.run === r.run && q.twinkle === 'off');
    if (off && (r.longestGapMs > off.longestGapMs + NOISE_MS || r.longestTaskMs > off.longestTaskMs + NOISE_MS)) {
      console.log(`Reported only (${r.mode} ${r.vp} ${r.run}, glints forced where visitors get none): longest frame gap ${r.longestGapMs} ms with glints, ${off.longestGapMs} ms without; longest task ${r.longestTaskMs} ms, ${off.longestTaskMs} ms.`);
    }
  }
  console.log(`No rule of this script was broken where visitors get glints${WARMUP ? ' (the first hover was warmed up and is not in these numbers: see --no-warmup)' : ' (the first hover is in the table but is not judged inside one session: judge it across sessions with --first-hover-verdict)'}. One session is not a verdict: see docs/design/trifid-theme/reviews/app-twinkle-cost.md for the runs that are.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
