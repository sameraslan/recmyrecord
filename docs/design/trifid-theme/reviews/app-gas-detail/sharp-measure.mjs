#!/usr/bin/env node
/**
 * What the sharper gas image costs on a real GPU (review item M1): how long it takes to arrive once the map is
 * zoomed in and left alone, how long each of its WebGL calls holds the main thread, whether a long task or an
 * extra frame comes with it, and what happens to the frame gaps of a drag that starts while it is being sent.
 *
 * Run from `frontcreck/` with arm64 Node against a production build, on mains power (it starts and stops its
 * own `next start`; headless Google Chrome on the GPU, as scripts/perf/perf.mjs launches it):
 *
 *   node ../docs/design/trifid-theme/reviews/app-gas-detail/sharp-measure.mjs <out.json> [--loads 4] [--dpr 1]
 *
 * Per load, case "rest": the map is zoomed to three times its opening zoom and left alone until the sharper image
 * is in. Case "drag": the same, but a 2.5 s drag starts the moment the image has begun to go to the GPU, so the
 * rest of it must wait; the drag's frame gaps are compared with a control drag after everything is in.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');
const { startServer } = await import(pathToFileURL(path.join(CWD, 'scripts/serve.mjs')).href);

const argv = process.argv.slice(2);
const OUT = path.resolve(argv[0] ?? 'sharp-measure.json');
const opt = (n, d) => (argv.includes(n) ? Number(argv[argv.indexOf(n) + 1]) : d);
const LOADS = opt('--loads', 4);
const DPR = opt('--dpr', 1);
const PORT = 3700;

const INIT = () => {
  window.__lt = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
  window.__up = [];
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap']) {
    const orig = P[fn];
    P[fn] = function (...a) {
      const t0 = performance.now();
      const r = orig.apply(this, a);
      // the sharper image is the only ImageBitmap the page hands to WebGL a strip at a time (fewer rows than it has)
      const src = a[a.length - 1];
      const sharp = fn === 'texSubImage2D' && a.length === 9 && src instanceof ImageBitmap && a[5] < src.height;
      const size = src && typeof src === 'object' && 'width' in src ? `${src.width} x ${src.height}` : '';
      window.__up.push([fn, Math.round(t0), Math.round((performance.now() - t0) * 100) / 100, sharp, size]);
      return r;
    };
  }
  window.__sharp = [];
  let last;
  setInterval(() => {
    const s = window.__rmr?.gasSharp;
    if (s !== last) {
      last = s;
      window.__sharp.push([String(s), Math.round(performance.now()), window.__rmr?.frames ?? 0]);
    }
  }, 4);
};

async function oneLoad(browser, kind) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  await page.goto(`http://127.0.0.1:${PORT}/map`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const res = await page.evaluate(async (drag) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = document.querySelector('canvas.map-canvas');
    const b = c.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
    const dragFor = async (ms) => {
      const gaps = [];
      fire('pointerdown', cx, cy);
      const t0 = performance.now();
      let last = t0;
      while (performance.now() - t0 < ms) {
        const k = (performance.now() - t0) / 2000;
        fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
        const now = await raf();
        gaps.push(Math.round((now - last) * 10) / 10);
        last = now;
      }
      fire('pointerup', cx, cy);
      return { t0: Math.round(t0), t1: Math.round(performance.now()), gaps };
    };
    window.__lt.length = 0;
    window.__up.length = 0;
    const api = window.__rmr.map;
    const cam = api.getCamera();
    const zoomedAt = Math.round(performance.now());
    api.setCamera({ ...cam, zoom: cam.zoom * 3 }, false);
    let during = null;
    if (drag) {
      // wait until the first strip has gone in, then start dragging at once
      const until = performance.now() + 15000;
      while (!window.__up.some((u) => u[3]) && performance.now() < until) await sleep(1);
      during = await dragFor(2500);
    }
    const until = performance.now() + 20000;
    while (window.__rmr.gasSharp !== 'balanced' && performance.now() < until) await sleep(5);
    const inAt = Math.round(performance.now());
    const framesAtIn = window.__rmr.frames;
    await sleep(800);
    const framesAfter = window.__rmr.frames;
    const up = window.__up.slice();
    const lt = window.__lt.slice();
    const control = await dragFor(2500);
    return { zoomedAt, inAt, framesAtIn, framesAfter, up, lt, sharp: window.__sharp.slice(), during, control, state: window.__rmr.gasSharp };
  }, kind === 'drag');
  await ctx.close();
  const calls = res.up.filter((u) => u[1] >= res.zoomedAt);
  const strips = calls.filter((u) => u[3]);
  const others = calls.filter((u) => !u[3] && u[2] >= 1);
  const loading = res.sharp.find((s) => s[0] === 'loading');
  const arrived = res.sharp.find((s) => s[0] === 'balanced');
  const worst = (g) => (g ? Math.max(...g.gaps.slice(1)) : null);
  return {
    kind,
    state: res.state,
    zoomToInMs: arrived ? arrived[1] - res.zoomedAt : null,
    loadingToInMs: arrived && loading ? arrived[1] - loading[1] : null,
    framesFromLoadingToIn: arrived && loading ? arrived[2] - loading[2] : null,
    framesIn800msAfter: res.framesAfter - res.framesAtIn,
    strips: strips.length,
    stripMs: { max: Math.max(0, ...strips.map((u) => u[2])), mean: strips.length ? Math.round((strips.reduce((s, u) => s + u[2], 0) / strips.length) * 100) / 100 : 0 },
    // every other WebGL upload call of 1 ms or more after the zoom (cover sheets, which today's site uploads the same way)
    otherCallsOver1Ms: others.map((u) => [u[0], u[2], u[4]]),
    mipBuildMs: Math.max(0, ...calls.filter((u) => u[0] === 'generateMipmap').map((u) => u[2])),
    longTasks: res.lt.filter((l) => l[0] >= res.zoomedAt),
    stripsDuringDrag: res.during ? strips.filter((u) => u[1] > res.during.t0 + 50 && u[1] < res.during.t1).length : null,
    dragWorstGapMs: worst(res.during),
    controlDragWorstGapMs: worst(res.control),
  };
}

const server = await startServer(PORT);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'] });
const out = { date: new Date().toISOString(), dpr: DPR, loads: [] };
try {
  const probe = await browser.newPage();
  out.renderer = await probe.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  await probe.close();
  console.log(`renderer: ${out.renderer}; dpr ${DPR}`);
  for (let i = 0; i < LOADS; i++) {
    for (const kind of ['rest', 'drag']) {
      const r = await oneLoad(browser, kind);
      out.loads.push(r);
      console.log(JSON.stringify(r));
    }
  }
} finally {
  await browser.close();
  await server.stop();
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
