#!/usr/bin/env node
/**
 * Does the upload of the two late gas images (texture upload and mip build on the main thread) land inside a pan
 * or a zoom and cost a long task or a frame gap? The two images are held back with route interception and let go
 * 700 ms into a 3.5 s drag or wheel zoom, so they arrive while the gesture runs.
 *
 * Run from `frontcreck/` with arm64 Node against a production build (it starts and stops its own `next start`):
 *
 *   node ../docs/design/trifid-theme/reviews/app-part1/late-gas-measure.mjs <out.json> [--loads 4]
 *
 * Per load it reports: the worst frame gap and the long tasks of the whole gesture, the same inside the arrival
 * window (from the release of the images to 150 ms after the gas flag turns 'ready'), every WebGL upload call
 * that took 1 ms or more with its start time, and whether a gas upload began while the gesture was still running.
 * A control load runs the same gesture with all three images already in.
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
const OUT = path.resolve(argv[0] ?? 'late-gas.json');
const LOADS = Number(argv.includes('--loads') ? argv[argv.indexOf('--loads') + 1] : 4);
const PORT = 3700;
const MODES = {
  gpu: { channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'] },
  software: { channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
};
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const INIT = () => {
  window.__lt = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
  // main-thread time of every WebGL upload call
  window.__up = [];
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap']) {
    const orig = P[fn];
    P[fn] = function (...a) {
      const t0 = performance.now();
      const r = orig.apply(this, a);
      const dt = performance.now() - t0;
      if (dt >= 1) window.__up.push([fn, Math.round(t0), Math.round(dt * 10) / 10]);
      return r;
    };
  }
  window.__flag = [];
  let last;
  const watch = () => {
    const g = window.__rmr?.gas;
    if (g !== last) {
      last = g;
      window.__flag.push([g ?? null, Math.round(performance.now())]);
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
};

async function oneLoad(browser, vp, gesture, late) {
  const ctx = await browser.newContext(VIEWPORTS[vp]);
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  let release = () => {};
  const held = new Promise((r) => {
    release = r;
  });
  if (late) {
    // (the images carry the hash of their content in their name: gas-<stop>.<10 hex>.webp)
    await page.route(/\/data\/theme\/gas-(sonic|mood)\.[0-9a-f]{10}\.webp$/, async (route) => {
      await held;
      await route.continue();
    });
  }
  await page.goto(`http://127.0.0.1:${PORT}/map`, { waitUntil: 'load' });
  await page.waitForFunction((want) => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === want, late ? 'loading' : 'ready', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const run = page.evaluate(
    async ([kind, phone]) => {
      const c = document.querySelector('canvas.map-canvas');
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const type = phone ? 'touch' : 'mouse';
      const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: type, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
      const raf = () => new Promise((res) => requestAnimationFrame(() => res(performance.now())));
      const gaps = [];
      window.__lt.length = 0;
      window.__up.length = 0;
      const t0 = performance.now();
      if (kind === 'drag') fire('pointerdown', cx, cy);
      let last = t0;
      while (performance.now() - t0 < 3500) {
        const k = (performance.now() - t0) / 2000;
        if (kind === 'drag') fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
        else c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy - 40, deltaY: Math.floor(k * 2) % 2 === 0 ? -40 : 40 }));
        const now = await raf();
        gaps.push([Math.round(last), Math.round((now - last) * 10) / 10]);
        last = now;
      }
      if (kind === 'drag') fire('pointerup', cx, cy);
      const t1 = performance.now();
      // the upload may have been put off until the gesture ended: wait for the flag, then a little more
      const until = performance.now() + 6000;
      while (window.__rmr.gas !== 'ready' && performance.now() < until) await raf();
      await new Promise((res) => setTimeout(res, 400));
      return { t0: Math.round(t0), t1: Math.round(t1), gaps, lt: window.__lt.slice(), up: window.__up.slice(), flag: window.__flag.slice() };
    },
    [gesture, vp === 'phone'],
  );
  let releasedAt = null;
  if (late) {
    await page.waitForTimeout(700);
    releasedAt = await page.evaluate(() => Math.round(performance.now()));
    release();
  }
  const res = await run;
  await ctx.close();
  const ready = res.flag.filter((f) => f[0] === 'ready').pop()?.[1] ?? null;
  const w0 = releasedAt ?? res.t0;
  const w1 = late ? Math.min((ready ?? res.t1) + 150, res.t1) : res.t1;
  const inWin = (t, d = 0) => t + d >= w0 && t <= w1;
  const inGesture = (t) => t >= res.t0 && t <= res.t1;
  const big = res.up.filter((u) => u[2] >= 1);
  return {
    gesture,
    late,
    worstGapMs: Math.max(...res.gaps.map((g) => g[1])),
    worstGapInWindowMs: Math.max(0, ...res.gaps.filter((g) => inWin(g[0], g[1])).map((g) => g[1])),
    longTasks: res.lt.filter((l) => inGesture(l[0])),
    longTasksInWindow: res.lt.filter((l) => inWin(l[0], l[1])),
    uploads: big,
    uploadMsDuringGesture: Math.round(big.filter((u) => inGesture(u[1])).reduce((s, u) => s + u[2], 0) * 10) / 10,
    uploadMsAfterGesture: Math.round(big.filter((u) => u[1] > res.t1).reduce((s, u) => s + u[2], 0) * 10) / 10,
    releasedAfterStartMs: releasedAt === null ? null : releasedAt - res.t0,
    readyAfterStartMs: ready === null ? null : ready - res.t0,
    gestureMs: res.t1 - res.t0,
  };
}

const med = (v) => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)];

async function main() {
  const server = await startServer(PORT);
  const out = [];
  try {
    for (const [mode, vp, gestures] of [['gpu', 'desktop', ['drag', 'wheel']], ['gpu', 'phone', ['drag']], ['software', 'desktop', ['drag']]]) {
      const browser = await chromium.launch(MODES[mode]);
      await assertNativeChrome(browser);
      for (const gesture of gestures) {
        const rows = [];
        for (const late of [false, true]) {
          for (let i = 0; i < (late ? LOADS : 2); i++) {
            const r = await oneLoad(browser, vp, gesture, late);
            rows.push(r);
            console.log(`${mode} ${vp} ${gesture} ${late ? 'late ' : 'control'} load ${i + 1}: worst gap ${r.worstGapMs} ms (in window ${r.worstGapInWindowMs}), long tasks ${JSON.stringify(r.longTasks)}, upload on main thread during gesture ${r.uploadMsDuringGesture} ms, after ${r.uploadMsAfterGesture} ms, ready ${r.readyAfterStartMs} ms after start (released at ${r.releasedAfterStartMs}), uploads ${JSON.stringify(r.uploads)}`);
          }
        }
        const lateRows = rows.filter((r) => r.late);
        const ctl = rows.filter((r) => !r.late);
        console.log(`== ${mode} ${vp} ${gesture}: late median worst gap in window ${med(lateRows.map((r) => r.worstGapInWindowMs))} ms (max ${Math.max(...lateRows.map((r) => r.worstGapInWindowMs))}), control worst gap ${med(ctl.map((r) => r.worstGapMs))} ms (max ${Math.max(...ctl.map((r) => r.worstGapMs))}), long tasks in window ${lateRows.reduce((s, r) => s + r.longTasksInWindow.length, 0)}`);
        out.push({ mode, vp, gesture, rows });
      }
      await browser.close();
    }
  } finally {
    await server.stop();
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
