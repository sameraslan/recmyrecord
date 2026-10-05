#!/usr/bin/env node
/**
 * The sharper gas image on a real GPU: does an ordinary desktop profile get it with no override, what do its
 * strips cost, and what does the fade from the first image to it cost in frames and frame gaps?
 *
 * Run from frontcreck/ with arm64 Node against a production build (npm run build):
 *
 *   node ../docs/design/trifid-theme/reviews/perf-part1/scripts/fade-measure.mjs <out.json> [--runs 5] [--port 3230]
 *
 * It starts `next start` itself and headless Google Chrome on Metal (the launch of scripts/perf/perf.mjs and of
 * baseline/capture.mjs), one browser at a time. Per device pixel ratio (1 and 2) and per run, in a fresh context
 * at 1440 x 900 with NO window.__rmrGasSharp override:
 *   1. what the gate is told (pointer, touch points, memory, renderer) and what the flag says;
 *   2. zoom in three times and wait for the sharper image: time of every strip's cut (createImageBitmap) and
 *      upload (texSubImage2D), and the last strip with its mip build;
 *   3. the fade: frames the map drew from the swap on, and every gap between animation frames in the 400 ms
 *      after the swap, against the 400 ms before it (nothing drawn: the page's own frame clock);
 *   4. "fade + drag": the same with a drag begun in the frame the sharper image came in, against the same drag a
 *      second later (no fade). The drag draws a map frame every frame, so this is the fade's cost inside motion.
 *   5. with prefers-reduced-motion: frames drawn at the swap (one).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');
const { startServer } = await import(pathToFileURL(path.join(CWD, 'scripts/serve.mjs')).href);
const { assertNativeChrome } = await import(pathToFileURL(path.join(CWD, 'scripts/check-native.mjs')).href);
const argv = process.argv.slice(2);
const opt = (name, d) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const OUT = path.resolve(argv[0] ?? 'fade-measure.json');
const RUNS = Number(opt('--runs', 5));
const PORT = Number(opt('--port', 3230));
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'];
const theme = JSON.parse(fs.readFileSync(path.join(CWD, 'public/data/theme/theme.json'), 'utf8'));
const SHARP_W = theme.gas.balanced.sharp[0];

const INIT = (sharpWidth) => {
  const m = (window.__m = { ticks: [], strips: [], cuts: [], lt: [], drag: null, onSwap: null, swapAt: null });
  // the page's own frame clock: time, frames the map has drawn, the sharper image's flag
  const tick = (now) => {
    const flag = window.__rmr?.gasSharp;
    if (m.swapAt === null && (flag === 'balanced' || flag === 'sonic' || flag === 'mood')) {
      m.swapAt = now;
      m.onSwap?.();
    }
    m.ticks.push([now, window.__rmr?.frames ?? 0, String(flag)]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) m.lt.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask' });
  const P = WebGL2RenderingContext.prototype;
  const sub = P.texSubImage2D;
  P.texSubImage2D = function (...a) {
    const src = a[a.length - 1];
    const t0 = performance.now();
    const out = sub.apply(this, a);
    if (src instanceof ImageBitmap && src.width === sharpWidth) m.strips.push([Math.round(t0), +(performance.now() - t0).toFixed(2), a[3], a[5]]);
    return out;
  };
  const gm = P.generateMipmap;
  P.generateMipmap = function (...a) {
    const t0 = performance.now();
    const out = gm.apply(this, a);
    m.mip = [Math.round(t0), +(performance.now() - t0).toFixed(2)];
    return out;
  };
  const cib = window.createImageBitmap;
  window.createImageBitmap = function (...a) {
    const t0 = performance.now();
    const p = cib.apply(this, a);
    if (a[0] instanceof ImageBitmap) m.cuts.push(+(performance.now() - t0).toFixed(2));
    return p;
  };
  m.startDrag = (ms) => {
    const c = document.querySelector('canvas.map-canvas');
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
    const run = { t0: performance.now(), gaps: [], frames0: window.__rmr.frames, done: null };
    fire('pointerdown', cx, cy);
    run.done = (async () => {
      let last = run.t0;
      while (performance.now() - run.t0 < ms) {
        const k = (performance.now() - run.t0) / 2000;
        fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
        const now = await new Promise((res) => requestAnimationFrame((t) => res(t)));
        run.gaps.push(+(now - last).toFixed(1));
        last = now;
      }
      fire('pointerup', cx, cy);
      run.frames = window.__rmr.frames - run.frames0;
    })();
    return run;
  };
};

async function one(browser, base, dpr, kind) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, reducedMotion: kind === 'reduced' ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sharpRequests = [];
  page.on('request', (r) => {
    if (/-sharp\./.test(r.url())) sharpRequests.push(new URL(r.url()).pathname);
  });
  await page.addInitScript(INIT, SHARP_W);
  await page.goto(`${base}/map`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const device = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    const dbg = g.getExtension('WEBGL_debug_renderer_info');
    return {
      override: window.__rmrGasSharp ?? null,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
      deviceMemory: navigator.deviceMemory ?? null,
      saveData: navigator.connection?.saveData ?? null,
      maxTextureSize: g.getParameter(g.MAX_TEXTURE_SIZE),
      renderer: g.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
      flagAtOverview: window.__rmr.gasSharp,
      dpr: devicePixelRatio,
    };
  });
  if (kind === 'drag') await page.evaluate(() => { window.__m.onSwap = () => { window.__m.drag = window.__m.startDrag(400); }; });
  const tZoom = await page.evaluate(() => {
    const api = window.__rmr.map;
    const cam = api.getCamera();
    api.setCamera({ ...cam, zoom: cam.zoom * 3 }, false);
    return performance.now();
  });
  await page.waitForFunction(() => window.__m.swapAt !== null, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const control = kind === 'drag' ? await page.evaluate(async () => { const run = window.__m.startDrag(400); await run.done; return { gaps: run.gaps, frames: run.frames }; }) : null;
  const res = await page.evaluate(async () => {
    const m = window.__m;
    if (m.drag) await m.drag.done;
    const i = m.ticks.findIndex((t) => t[0] >= m.swapAt);
    const gapsIn = (from, to) => {
      const out = [];
      for (let k = 1; k < m.ticks.length; k++) if (m.ticks[k][0] > from && m.ticks[k][0] <= to) out.push(+(m.ticks[k][0] - m.ticks[k - 1][0]).toFixed(1));
      return out;
    };
    const framesAt = (t) => { let f = 0; for (const x of m.ticks) { if (x[0] > t) break; f = x[1]; } return f; };
    return {
      swapAt: Math.round(m.swapAt),
      framesBeforeSwap: m.ticks[i - 1]?.[1] ?? null,
      // frames the map drew in the 400 ms from the swap on, and after that
      framesInFade: framesAt(m.swapAt + 400) - framesAt(m.swapAt - 1),
      framesAfterFade: m.ticks[m.ticks.length - 1][1] - framesAt(m.swapAt + 400),
      gapsBefore: gapsIn(m.swapAt - 400, m.swapAt - 1),
      gapsFade: gapsIn(m.swapAt, m.swapAt + 400),
      strips: m.strips,
      cuts: m.cuts,
      mip: m.mip ?? null,
      longTasks: m.lt.filter((x) => x[0] > m.swapAt - 3000),
      drag: m.drag ? { gaps: m.drag.gaps, frames: m.drag.frames } : null,
      flag: window.__rmr.gasSharp,
    };
  });
  await ctx.close();
  return { dpr, kind, device, sharpRequests, msFromZoomToSwap: Math.round(res.swapAt - tZoom), ...res, control, errors };
}

const server = await startServer(PORT);
const rows = [];
try {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU });
  await assertNativeChrome(browser);
  for (const dpr of [1, 2]) {
    for (const kind of ['rest', 'drag', 'reduced']) {
      for (let r = 0; r < (kind === 'reduced' ? 2 : RUNS); r++) {
        const row = await one(browser, server.base, dpr, kind);
        rows.push(row);
        const worst = (g) => (g && g.length ? Math.max(...g) : null);
        console.log(`dpr ${dpr} ${kind} run ${r + 1}: flag ${row.flag}, sharp requests ${row.sharpRequests.length}, ${row.msFromZoomToSwap} ms from zoom to swap; frames in fade ${row.framesInFade}, after ${row.framesAfterFade}; worst gap before ${worst(row.gapsBefore)} fade ${worst(row.gapsFade)}${row.drag ? `; drag in fade ${worst(row.drag.gaps.slice(1))} (frames ${row.drag.frames}) control drag ${worst(row.control.gaps.slice(1))} (frames ${row.control.frames})` : ''}; strips ${row.strips.length}: upload mean ${(row.strips.reduce((s, x) => s + x[1], 0) / row.strips.length).toFixed(2)} worst ${Math.max(...row.strips.map((x) => x[1]))} ms, cut mean ${(row.cuts.reduce((s, x) => s + x, 0) / row.cuts.length).toFixed(2)} worst ${Math.max(...row.cuts)} ms; long tasks ${JSON.stringify(row.longTasks)}; errors ${row.errors.length}`);
      }
    }
  }
  console.log('device as the gate sees it:', JSON.stringify(rows[0].device));
  await browser.close();
} finally {
  await server.stop();
}
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), runs: RUNS, rows }, null, 1));
console.log(`wrote ${OUT}`);
