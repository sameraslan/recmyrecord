#!/usr/bin/env node
/**
 * Hover path timing on the map at Overview, which `npm run perf` does not cover.
 *
 * On a FRESH page load of /map (a new browser context every time), the pointer moves onto an album for the first
 * time, then onto a second and a third. For each hover it records:
 *   - tipMs:        pointer move (the pointermove event's own timestamp) to the hover tip being visible: it has its
 *                   text and its computed opacity is 1 (the site fills the tip, then places and shows it from the
 *                   map's next drawn frame). This is the number to compare;
 *   - tipDomMs:     the same, to the tip's text being in the DOM (still invisible);
 *   - tipPaintMs:   the same, to the first animation frame after the tip became visible (the earliest paint);
 *   - longTaskMs:   the longest main-thread long task (PerformanceObserver 'longtask', so only tasks of 50 ms or
 *                   more exist; 0 means none reached 50 ms);
 *   - frameGapMs:   the longest gap between animation frames from the move until 300 ms after the tip showed
 *                   (catches main-thread stalls shorter than 50 ms);
 *   - eventMs:      the longest pointer event duration the Event Timing API reported (8 ms resolution, 16 ms floor);
 *   - frames:       map frames drawn in that window (`window.__rmr.frames`).
 * The site waits 80 ms (DURATION.hoverLabel) before it shows the tip, so tipMs cannot be under 80.
 *
 * Run from `frontcreck/` with arm64 Node, against a production build:
 *
 *   export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch     # must print arm64
 *   cd frontcreck && npm run build
 *   node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs \
 *        ../docs/design/trifid-theme/reviews/baseline/perf/hover.json http://127.0.0.1:3500 --start
 *
 * Arguments: <outFile.json> <baseURL> [--start] [--mode gpu|software|both] [--loads 5]
 * Desktop only (1440 x 900): a phone has no hover. Browsers run one at a time, one page at a time.
 * Both modes use headless Google Chrome, as `npm run perf` does (software = SwiftShader, gpu = Metal).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');

const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--start') flags.start = true;
  else if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
if (positional.length < 2) {
  console.error('usage: node hover-measure.mjs <outFile.json> <baseURL> [--start] [--mode gpu|software|both] [--loads 5]');
  process.exit(2);
}
const OUT = path.resolve(positional[0]);
const BASE = positional[1].replace(/\/$/, '');
const LOADS = Number(flags.loads ?? 5);
const MODES = {
  software: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  gpu: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'],
};
const WHICH = !flags.mode || flags.mode === 'both' ? ['gpu', 'software'] : [flags.mode];
/** Albums tried in this order; the first three that are on the canvas and not under another element are hovered. */
const CANDIDATES = [11, 42, 300, 7, 100, 250, 500, 900];
const TIP_TITLE = '.map-tip .t';

const INIT = () => {
  window.__hv = { lt: [], ev: [], move: null };
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__hv.lt.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  }
  if (PerformanceObserver.supportedEntryTypes?.includes('event')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name.startsWith('pointer') || e.name.startsWith('mouse')) window.__hv.ev.push([e.startTime, e.duration]);
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  }
  // The pointermove's own timestamp (when the browser received the input), read before any handler of the app.
  window.addEventListener(
    'pointermove',
    (e) => {
      if (window.__hv.armed) {
        window.__hv.armed = false;
        window.__hv.move = e.timeStamp;
      }
    },
    true,
  );
};

/** Arms the in-page watcher; resolves once the tip has shown and 300 ms have passed (or after `max`). */
const WATCH = ([sel, max]) =>
  new Promise((resolve) => {
    const H = window.__hv;
    const t0 = performance.now();
    const f0 = window.__rmr?.frames ?? 0;
    H.move = null;
    H.armed = true;
    let tip = null;
    let tipPaint = null;
    let gap = 0;
    let last = null;
    let tipDom = null;
    const text = () => document.querySelector(sel)?.textContent ?? '';
    const shown = () => {
      const el = document.querySelector(sel)?.closest('.map-tip') ?? document.querySelector(sel);
      return !!el && Number(getComputedStyle(el).opacity) >= 0.99;
    };
    const mo = new MutationObserver(() => {
      if (!text()) return;
      if (tipDom === null) tipDom = performance.now();
      if (tip === null && shown()) {
        tip = performance.now();
        requestAnimationFrame((t) => {
          tipPaint = t;
        });
      }
    });
    mo.observe(document.querySelector('.map-tip') ?? document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
    window.__hvWatching = true;
    const tick = (now) => {
      // Frame gaps count only from the pointer move on.
      if (H.move !== null) {
        if (last !== null) gap = Math.max(gap, now - last);
        last = now;
      }
      const done = (tip !== null && tipPaint !== null && now - tip >= 300) || now - t0 > max;
      if (!done) return requestAnimationFrame(tick);
      mo.disconnect();
      const from = H.move ?? t0;
      const to = performance.now();
      const within = (rows) => rows.filter(([s, d]) => s + d >= from && s <= to);
      const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
      resolve({
        title: text() || null,
        tipMs: tip !== null && H.move !== null ? r1(tip - H.move) : null,
        tipDomMs: tipDom !== null && H.move !== null ? r1(tipDom - H.move) : null,
        tipPaintMs: tipPaint !== null && H.move !== null ? r1(tipPaint - H.move) : null,
        longTaskMs: Math.max(0, ...within(H.lt).map((x) => Math.round(x[1]))),
        longTasks: within(H.lt).map((x) => [Math.round(x[0] - from), Math.round(x[1])]),
        frameGapMs: r1(gap),
        eventMs: Math.max(0, ...within(H.ev).map((x) => Math.round(x[1]))),
        frames: (window.__rmr?.frames ?? 0) - f0,
      });
    };
    requestAnimationFrame(tick);
  });

async function oneLoad(browser, load) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(INIT);
  try {
    await page.mouse.move(4, 4); // parked on the header's corner, off the map
    await page.goto(`${BASE}/map`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 30000 });
    await page.waitForFunction(() => !window.__rmr.map.isAnimating(), null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2000); // idle: the first hover starts from a quiet page, as a visitor's would
    const targets = await page.evaluate((ids) => {
      const out = [];
      for (const id of ids) {
        const p = window.__rmr.map.screenPoint(id);
        if (!p || p.x < 60 || p.y < 120 || p.x > innerWidth - 120 || p.y > innerHeight - 120) continue;
        if (!document.elementFromPoint(p.x, p.y)?.classList.contains('map-canvas')) continue;
        out.push({ id, x: p.x, y: p.y });
        if (out.length === 3) break;
      }
      return out;
    }, CANDIDATES);
    if (targets.length < 3) throw new Error('fewer than three hover targets on screen');
    const startupLongTaskMs = await page.evaluate(() => Math.max(0, ...window.__hv.lt.map((x) => Math.round(x[1]))));
    const hovers = [];
    for (let i = 0; i < 3; i++) {
      const t = targets[i];
      const watching = page.evaluate(WATCH, [TIP_TITLE, 4000]);
      await page.waitForFunction(() => window.__hv.armed === true);
      await page.mouse.move(t.x, t.y); // one move, straight onto the album
      hovers.push({ n: i + 1, id: t.id, ...(await watching) });
      // Off the map again, so the next hover starts with no tip.
      await page.mouse.move(4, 4);
      await page.waitForFunction((s) => !document.querySelector(s)?.textContent, TIP_TITLE, { timeout: 5000 });
      await page.waitForTimeout(500);
    }
    return { load, startupLongTaskMs, hovers, errors };
  } finally {
    await ctx.close();
  }
}

async function answers() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (!fs.existsSync(path.join(CWD, '.next/BUILD_ID'))) throw new Error('no production build: run npm run build first');
  if (await answers()) throw new Error(`${BASE} is already serving; stop that server or drop --start`);
  const child = spawn(path.join(CWD, 'node_modules/.bin/next'), ['start', '--port', new URL(BASE).port || '80'], { cwd: CWD, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  for (let i = 0; i < 120; i++) {
    if (await answers()) return stop;
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error('next start did not come up');
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round(((s[s.length / 2 - 1] + s[s.length / 2]) / 2) * 10) / 10;
};

async function main() {
  if (process.platform === 'darwin' && process.arch !== 'arm64') throw new Error(`Node is ${process.arch}, not arm64 (Rosetta).`);
  const { assertNativeChrome } = await import(pathToFileURL(path.join(CWD, 'scripts/check-native.mjs')).href);
  const stop = flags.start ? await startServer() : null;
  if (!stop && !(await answers())) throw new Error(`${BASE} is not answering; start the production server or pass --start`);
  const result = { date: new Date().toISOString(), base: BASE, nodeArch: process.arch, loads: LOADS, modes: {} };
  try {
    for (const mode of WHICH) {
      const browser = await chromium.launch({ channel: 'chrome', headless: true, args: MODES[mode] });
      try {
        const browserArch = await assertNativeChrome(browser);
        const loads = [];
        let renderer = null;
        for (let i = 1; i <= LOADS; i++) {
          loads.push(await oneLoad(browser, i));
          console.log(`${mode} load ${i}: ${loads.at(-1).hovers.map((h) => `#${h.n} tip ${h.tipMs} ms, long task ${h.longTaskMs} ms, gap ${h.frameGapMs} ms`).join(' | ')}`);
        }
        const p = await browser.newPage();
        await p.goto(`${BASE}/about`);
        renderer = await p.evaluate(() => {
          try {
            const g = document.createElement('canvas').getContext('webgl');
            return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
          } catch {
            return 'n/a';
          }
        });
        await p.close();
        const summary = [1, 2, 3].map((n) => {
          const rows = loads.map((l) => l.hovers[n - 1]);
          const stat = (k) => ({ median: median(rows.map((r) => r[k])), min: Math.min(...rows.map((r) => r[k] ?? Infinity)), max: Math.max(...rows.map((r) => r[k] ?? -Infinity)), values: rows.map((r) => r[k]) });
          return { hover: n, tipMs: stat('tipMs'), tipDomMs: stat('tipDomMs'), tipPaintMs: stat('tipPaintMs'), longTaskMs: stat('longTaskMs'), frameGapMs: stat('frameGapMs'), eventMs: stat('eventMs'), frames: stat('frames') };
        });
        result.modes[mode] = { browser: browser.version(), browserArch, renderer, summary, loads };
      } finally {
        await browser.close();
      }
    }
  } finally {
    if (stop) await stop();
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  for (const [mode, m] of Object.entries(result.modes)) {
    console.log(`\n${mode} (${m.renderer})`);
    for (const s of m.summary) console.log(`  hover ${s.hover}: tip ${s.tipMs.median} ms (${s.tipMs.min} to ${s.tipMs.max}), longest long task ${s.longTaskMs.median} ms (${s.longTaskMs.min} to ${s.longTaskMs.max}), frame gap ${s.frameGapMs.median} ms (${s.frameGapMs.min} to ${s.frameGapMs.max})`);
  }
  console.log(`\nwrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
