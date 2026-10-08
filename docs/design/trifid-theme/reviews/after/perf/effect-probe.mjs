#!/usr/bin/env node
/**
 * Measurements of part 3 Task 9 that `npm run perf` cannot make, each as interleaved browser sessions (one browser
 * launch per session, arms in turn, the order swapped every round). Headless Google Chrome on the real GPU (Metal),
 * against the production build. Nothing in the app is changed: an arm is a stylesheet or a saved choice injected
 * before the page's scripts run.
 *
 *   cd frontcreck && npm run build
 *   node ../docs/design/trifid-theme/reviews/after/perf/effect-probe.mjs <what> <out.json> [--n 6] [--viewport desktop|desktop2x|phone]
 *
 * <what>:
 *   header  /map at its opening view. Arms: `glass` (the header as shipped) and `solid` (the one-line fallback noted
 *           in src/styles/shell.css: no backdrop filter, background var(--color-float-solid), on .top only; every
 *           other glass surface stays). Gestures: a 2 s drag, a 2 s wheel zoom (both as perf.mjs makes them), and a
 *           fling (a 130 ms flick, then the 1.5 s after release). Every gap between animation frames is kept.
 *   names   A fresh /map (cold HTTP cache) with the region names on and off (the visitor's saved choice,
 *           localStorage 'rmr-names'): when the map first drew, when the gas was first shown
 *           (window.__rmr.gasShownMs), the long tasks until 3 s after that.
 *   home    Home at rest for 15 s. Arms: glints `on`, glints `off` (window.__rmrTwinkle), and `on-nopad` (glints on,
 *           the blur of the dark pads behind the hero removed), to see what a glint under the blurred pad costs.
 *   strip   The phone strip's copy of the gas image, re-enacted in a phone page as MapPreviewStrip.tsx makes it:
 *           `bitmap` (fetch, createImageBitmap with resize: off the main thread) and `canvas` (decode, drawImage: the
 *           fallback). Time, and the longest frame gap while it ran. Memory is not measured (see the write-up).
 *
 * Frame gaps are measured on the main thread (requestAnimationFrame). The blur itself is done by the compositor; it
 * reaches these numbers only when it makes frames late. That is what a visitor would feel as a stutter, but a cost
 * that stays inside the frame is invisible here.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');
const { startServer } = await import(pathToFileURL(path.join(CWD, 'scripts/serve.mjs')).href);
const { assertNativeChrome } = await import(pathToFileURL(path.join(CWD, 'scripts/check-native.mjs')).href);

const [what, outFile, ...rest] = process.argv.slice(2);
const opt = (name, dflt) => (rest.indexOf(name) >= 0 ? rest[rest.indexOf(name) + 1] : dflt);
const N = Number(opt('--n', '6'));
const ARMS = { header: ['glass', 'solid'], names: ['on', 'off'], home: ['on', 'off', 'on-nopad'], strip: ['bitmap', 'canvas'] }[what];
if (!ARMS || !outFile || !(N > 0)) {
  console.error('usage: effect-probe.mjs header|names|home|strip <out.json> [--n 6] [--viewport desktop|desktop2x|phone]');
  process.exit(2);
}
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  desktop2x: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const VP = opt('--viewport', what === 'strip' ? 'phone' : 'desktop');
if (!VIEWPORTS[VP]) {
  console.error('--viewport takes desktop, desktop2x or phone');
  process.exit(2);
}
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'];
const SOLID_HEADER = '.top { -webkit-backdrop-filter: none; backdrop-filter: none; background: var(--color-float-solid); }';
const NO_PAD_BLUR = '.hero::before, .hero-row::before, .shelf-now::before { filter: none !important; }';
const load = () => os.loadavg().map((x) => Math.round(x * 100) / 100);

/* Runs in the page before its scripts. */
const IN_PAGE = () => {
  const lt = [];
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) lt.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  }
  const raf = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
  window.__probe = {
    lt,
    raf,
    mapFirstFrame: null,
    /** Every gap between animation frames while `step(k)` is called once per frame for `ms`. The first gap is left
     * out: it starts at a random point of a vsync. */
    async gaps(ms, step) {
      const out = [];
      const t0 = performance.now();
      let last = t0;
      let first = true;
      while (performance.now() - t0 < ms) {
        if (step) step((performance.now() - t0) / ms);
        const now = await raf();
        if (!first) out.push(Math.round((now - last) * 10) / 10);
        first = false;
        last = now;
      }
      return out;
    },
    async quiet(quietMs = 2500, max = 45000) {
      const t0 = performance.now();
      let flag = String(window.__rmr?.gasSharp);
      let frames = window.__rmr?.frames ?? 0;
      let since = t0;
      while (performance.now() - t0 < max) {
        await new Promise((r) => setTimeout(r, 50));
        const f = String(window.__rmr?.gasSharp);
        const m = window.__rmr?.frames ?? 0;
        if (f === 'loading' || f !== flag || m !== frames) {
          flag = f;
          frames = m;
          since = performance.now();
        } else if (performance.now() - since >= quietMs) return true;
      }
      return false;
    },
  };
  const watchMap = () => {
    if ((window.__rmr?.frames ?? 0) > 0) window.__probe.mapFirstFrame = Math.round(performance.now());
    else requestAnimationFrame(watchMap);
  };
  requestAnimationFrame(watchMap);
};
const addCss = (css) => document.addEventListener('DOMContentLoaded', () => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css })));
const mapReady = (page) => page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), null, { timeout: 30000 });

const stats = (gaps) => {
  const s = [...gaps].sort((a, b) => a - b);
  const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
  return { frames: s.length, maxMs: s.length ? s[s.length - 1] : null, p95Ms: q(0.95), medianMs: q(0.5), over20: s.filter((g) => g > 20).length, over34: s.filter((g) => g > 34).length };
};

async function header(page, arm) {
  if (arm === 'solid') await page.addInitScript(addCss, SOLID_HEADER);
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  await mapReady(page);
  await page.waitForTimeout(1500);
  const raw = await page.evaluate(async () => {
    const P = window.__probe;
    const settled = await P.quiet();
    const top = document.querySelector('header.top');
    const res = { settled, headerBackdrop: getComputedStyle(top).backdropFilter, headerBackground: getComputedStyle(top).backgroundColor, camera: window.__rmr.map.getCamera() };
    const c = document.querySelector('canvas.map-canvas');
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
    fire('pointerdown', cx, cy);
    res.drag = await P.gaps(2000, (k) => fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100));
    fire('pointerup', cx, cy);
    await new Promise((r2) => setTimeout(r2, 800));
    res.zoom = await P.gaps(2000, (k) => c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy - 40, deltaY: k < 0.5 ? -40 : 40 })));
    await new Promise((r2) => setTimeout(r2, 1200));
    // The fling: a quick downward flick, released while it still moves; then what the map does alone.
    let y = cy - 60;
    fire('pointerdown', cx, y);
    await P.gaps(130, () => fire('pointermove', cx + 6, (y += 22)));
    fire('pointerup', cx + 6, y);
    const f0 = window.__rmr.frames;
    res.flingAnimating = window.__rmr.map.isAnimating();
    res.fling = await P.gaps(1500, null);
    res.flingFrames = window.__rmr.frames - f0;
    res.longTasks = P.lt.slice();
    return res;
  });
  return { ...raw, dragStats: stats(raw.drag), zoomStats: stats(raw.zoom), flingStats: stats(raw.fling) };
}

async function names(page, arm) {
  await page.addInitScript((v) => {
    try {
      window.localStorage.setItem('rmr-names', v);
    } catch {}
  }, arm === 'on' ? '1' : '0');
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off', null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const P = window.__probe;
    const gas = window.__rmr.gasShownMs ?? null;
    const lt = P.lt.filter(([start]) => gas === null || start <= gas + 3000);
    return {
      mapFirstFrameMs: P.mapFirstFrame,
      gasShownMs: gas === null ? null : Math.round(gas),
      gasAfterFirstFrameMs: gas === null || P.mapFirstFrame === null ? null : Math.round(gas - P.mapFirstFrame),
      longestTaskMs: Math.max(0, ...lt.map((t) => t[1])),
      longTaskTotalMs: lt.reduce((a, t) => a + t[1], 0),
      longTasks: lt,
      namesOn: window.__rmr.getState().namesOn,
      namesShown: document.querySelector('.rn-layer')?.childElementCount ?? null,
    };
  });
}

async function home(page, arm) {
  await page.addInitScript((v) => (window.__rmrTwinkle = v), arm === 'off' ? 'off' : 'on');
  if (arm === 'on-nopad') await page.addInitScript(addCss, NO_PAD_BLUR);
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__rmr?.frames ?? 0) > 0 && (typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off'), null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  const raw = await page.evaluate(async () => {
    const P = window.__probe;
    const tw = window.__rmr.twinkle;
    const g0 = tw?.stats?.spawned ?? null;
    const f0 = window.__rmr.frames;
    P.lt.length = 0;
    const gaps = await P.gaps(15000, null);
    await new Promise((r) => setTimeout(r, 150));
    const pad = getComputedStyle(document.querySelector('.hero'), '::before').filter;
    return { gaps, glints: g0 === null ? null : tw.stats.spawned - g0, twinkleEnabled: typeof tw?.enabled === 'function' ? tw.enabled() : null, canvasFrames: window.__rmr.frames - f0, longTasks: P.lt.slice(), padFilter: pad };
  });
  const { gaps, ...keep } = raw;
  return { ...keep, gapStats: stats(gaps), longestTaskMs: Math.max(0, ...raw.longTasks.map((t) => t[1])) };
}

async function strip(page, arm) {
  // A page of the site with no map gesture going on, so the copy is the only thing being timed.
  await page.goto(`${BASE}/about`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return page.evaluate(async (kind) => {
    const P = window.__probe;
    const theme = await (await fetch('/data/theme/theme.json')).json();
    const gas = theme.gas.balanced;
    const url = `/data/theme/gas-balanced.${gas.hash[0]}.webp`;
    const k = 512 / Math.max(gas.px[0], gas.px[1]);
    const cw = Math.max(1, Math.round(gas.px[0] * k));
    const ch = Math.max(1, Math.round(gas.px[1] * k));
    let done = false;
    const watching = (async () => {
      const out = [];
      let last = await P.raf();
      while (!done) {
        const now = await P.raf();
        out.push(Math.round((now - last) * 10) / 10);
        last = now;
      }
      return out;
    })();
    await P.raf();
    P.lt.length = 0;
    const t0 = performance.now();
    let size;
    if (kind === 'bitmap') {
      const blob = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(blob, { resizeWidth: cw, resizeHeight: ch, resizeQuality: 'high' });
      size = [bitmap.width, bitmap.height];
    } else {
      const im = new Image();
      im.decoding = 'async';
      im.src = url;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, 0, 0, cw, ch);
      ctx.getImageData(0, 0, 1, 1); // make the draw happen now, not at the next paint
      size = [c.width, c.height];
    }
    const copyMs = Math.round((performance.now() - t0) * 10) / 10;
    await P.raf();
    done = true;
    const gaps = await watching;
    await new Promise((r) => setTimeout(r, 150));
    return { copyMs, longestGapMs: Math.max(0, ...gaps), framesDuring: gaps.length, longestTaskMs: Math.max(0, ...P.lt.map((t) => t[1])), copyPx: size, copyBytes: size[0] * size[1] * 4, sourcePx: gas.px, sourceDecodedBytes: gas.px[0] * gas.px[1] * 4 };
  }, arm);
}

const STEP = { header, names, home, strip }[what];
let BASE = '';
const server = await startServer(3220);
BASE = server.base;
const sessions = [];
try {
  for (let i = 0; i < N; i++) {
    const order = i % 2 ? [...ARMS].reverse() : ARMS;
    for (const arm of order) {
      const before = load();
      const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU });
      try {
        await assertNativeChrome(browser);
        const ctx = await browser.newContext(VIEWPORTS[VP]);
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(IN_PAGE);
        const r = await STEP(page, arm);
        sessions.push({ round: i + 1, arm, vp: VP, loadBefore: before, loadAfter: load(), errors, ...r });
        console.log(`${what} ${VP} round ${i + 1} ${arm}: load ${before[0]} -> ${load()[0]}`);
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  await server.stop();
}
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ what, vp: VP, n: N, arms: ARMS, date: new Date().toISOString(), sessions }, null, 1));

/* The table: per arm and measure the median of the sessions and their best to worst. */
const med = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!s.length) return 'n/a';
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return `${Math.round(m * 10) / 10} (${s[0]} to ${s[s.length - 1]})`;
};
const MEASURES = {
  header: [
    ['drag: longest gap', (s) => s.dragStats.maxMs], ['drag: p95 gap', (s) => s.dragStats.p95Ms], ['drag: gaps over 20 ms', (s) => s.dragStats.over20], ['drag: frames', (s) => s.dragStats.frames],
    ['zoom: longest gap', (s) => s.zoomStats.maxMs], ['zoom: p95 gap', (s) => s.zoomStats.p95Ms], ['zoom: gaps over 20 ms', (s) => s.zoomStats.over20], ['zoom: frames', (s) => s.zoomStats.frames],
    ['fling: longest gap', (s) => s.flingStats.maxMs], ['fling: p95 gap', (s) => s.flingStats.p95Ms], ['fling: gaps over 20 ms', (s) => s.flingStats.over20], ['fling: map frames drawn', (s) => s.flingFrames],
  ],
  names: [['map first frame, ms', (s) => s.mapFirstFrameMs], ['gas first shown, ms', (s) => s.gasShownMs], ['gas after first frame, ms', (s) => s.gasAfterFirstFrameMs], ['longest task, ms', (s) => s.longestTaskMs], ['long tasks, total ms', (s) => s.longTaskTotalMs], ['names in the layer', (s) => s.namesShown]],
  home: [['longest gap, ms', (s) => s.gapStats.maxMs], ['p95 gap, ms', (s) => s.gapStats.p95Ms], ['gaps over 20 ms', (s) => s.gapStats.over20], ['frames in 15 s', (s) => s.gapStats.frames], ['longest task, ms', (s) => s.longestTaskMs], ['glints made', (s) => s.glints], ['canvas frames', (s) => s.canvasFrames]],
  strip: [['copy, ms', (s) => s.copyMs], ['longest frame gap during, ms', (s) => s.longestGapMs], ['longest task, ms', (s) => s.longestTaskMs], ['copy bytes', (s) => s.copyBytes]],
}[what];
console.log(`\n${what}, ${VP}, ${N} sessions per arm, median (best to worst). Load average over the run: ${Math.min(...sessions.flatMap((s) => [s.loadBefore[0], s.loadAfter[0]]))} to ${Math.max(...sessions.flatMap((s) => [s.loadBefore[0], s.loadAfter[0]]))}.\n`);
console.log(`| Measure | ${ARMS.join(' | ')} |\n|---|${ARMS.map(() => '---').join('|')}|`);
for (const [name, get] of MEASURES) console.log(`| ${name} | ${ARMS.map((a) => med(sessions.filter((s) => s.arm === a).map(get))).join(' | ')} |`);
const seen = (s) => (what === 'header' ? `${s.headerBackdrop} / ${s.headerBackground} / fling animating ${s.flingAnimating}` : what === 'names' ? `namesOn ${s.namesOn}` : what === 'home' ? `twinkle ${s.twinkleEnabled}, pad ${s.padFilter}` : `${s.copyPx}`);
console.log(`\nRead back in the page, per arm: ${ARMS.map((a) => `${a}: ${[...new Set(sessions.filter((s) => s.arm === a).map(seen))].join(' ; ')}`).join(' | ')}`);
const errs = sessions.filter((s) => s.errors.length);
if (errs.length) console.log(`Page errors: ${JSON.stringify(errs.map((s) => [s.round, s.arm, s.errors]))}`);
console.log(`Saved ${outFile}`);
