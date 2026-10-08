#!/usr/bin/env node
/**
 * Frame times on a software renderer, as a steadier number than the perf script's worst frame gap: the mean,
 * median and 95th percentile gap between animation frames over a 3 s drag, a 3 s wheel zoom and a slider move
 * (Balanced to Sonic and back), on the desktop (1440 x 900) and the phone (390 x 844, dpr 2, touch) viewports
 * of scripts/perf/perf.mjs, in headless Google Chrome on SwiftShader (the perf script's software launch).
 *
 * Run from frontcreck/ with arm64 Node. It starts nothing: give it servers that are already answering.
 *
 *   node ../docs/design/trifid-theme/reviews/perf-part1/scripts/software-frames.mjs <out.json> --rounds 3 \
 *        baseline=http://127.0.0.1:3301 full=http://127.0.0.1:3302?lite=off lighter=http://127.0.0.1:3302
 *
 * Each name=url is one variant; "?lite=off" or "?lite=force" on a url sets window.__rmrGasLite for that variant
 * (it is not sent to the server). The variants are run in turn, `rounds` times over, one browser at a time.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');
const { assertNativeChrome } = await import(pathToFileURL(path.join(CWD, 'scripts/check-native.mjs')).href);
const argv = process.argv.slice(2);
const OUT = path.resolve(argv[0]);
const ROUNDS = argv.includes('--rounds') ? Number(argv[argv.indexOf('--rounds') + 1]) : 3;
const variants = argv.filter((a) => /^\w+=http/.test(a)).map((a) => {
  const [name, ...rest] = a.split('=');
  const url = new URL(rest.join('='));
  return { name, base: url.origin, lite: url.searchParams.get('lite') };
});
const SOFTWARE = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const stats = (g) => {
  const s = [...g].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1), median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), worst: +s[s.length - 1].toFixed(1) };
};

async function measure(v, vpName) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: SOFTWARE });
  try {
    await assertNativeChrome(browser);
    const ctx = await browser.newContext(VIEWPORTS[vpName]);
    const page = await ctx.newPage();
    if (v.lite) await page.addInitScript((x) => (window.__rmrGasLite = x), v.lite);
    await page.goto(`${v.base}/map`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr.gas === undefined || window.__rmr.gas === 'ready' || window.__rmr.gas === 'off'), null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const res = await page.evaluate(async (phone) => {
      const raf = () => new Promise((r) => requestAnimationFrame((t) => r(t)));
      const c = document.querySelector('canvas.map-canvas');
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const type = phone ? 'touch' : 'mouse';
      const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: type, pointerId: 1, isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
      const settle = async () => {
        let n = window.__rmr.frames;
        let since = performance.now();
        while (performance.now() - since < 400) {
          await new Promise((res) => setTimeout(res, 50));
          if (window.__rmr.frames !== n) { n = window.__rmr.frames; since = performance.now(); }
        }
      };
      const run = async (ms, each) => {
        const gaps = [];
        const f0 = window.__rmr.frames;
        const t0 = performance.now();
        let last = await raf();
        while (performance.now() - t0 < ms) {
          each((performance.now() - t0) / 2000);
          const now = await raf();
          gaps.push(now - last);
          last = now;
        }
        return { gaps, frames: window.__rmr.frames - f0 };
      };
      const out = {};
      fire('pointerdown', cx, cy);
      out.drag = await run(3000, (k) => fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100));
      fire('pointerup', cx, cy);
      await settle();
      out.zoom = await run(3000, (k) => c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy - 40, deltaY: Math.floor(k * 2) % 2 === 0 ? -40 : 40 })));
      await settle();
      const stop0 = window.__rmr.getState().stop;
      window.__rmr.getState().setStop('sonic');
      out.morph = await run(900, () => {});
      await settle();
      window.__rmr.getState().setStop(stop0);
      const back = await run(900, () => {});
      out.morph.gaps.push(...back.gaps);
      out.morph.frames += back.frames;
      await settle();
      const f0 = window.__rmr.frames;
      await new Promise((res) => setTimeout(res, 1500));
      out.idleFrames = window.__rmr.frames - f0;
      out.gasLite = window.__rmr.gasLite ?? null;
      return out;
    }, vpName === 'phone');
    return { drag: { ...stats(res.drag.gaps), frames: res.drag.frames }, zoom: { ...stats(res.zoom.gaps), frames: res.zoom.frames }, morph: { ...stats(res.morph.gaps), frames: res.morph.frames }, idleFrames: res.idleFrames, gasLite: res.gasLite };
  } finally {
    await browser.close();
  }
}

const { execSync } = await import('node:child_process');
const load = () => execSync('uptime').toString().replace(/.*load averages?: /, '').trim();
const rows = [];
for (let round = 1; round <= ROUNDS; round++) {
  for (const v of variants) {
    for (const vp of Object.keys(VIEWPORTS)) {
      const before = load();
      const r = await measure(v, vp);
      rows.push({ round, variant: v.name, vp, loadBefore: before, ...r });
      console.log(`round ${round} ${v.name.padEnd(9)} ${vp.padEnd(7)} load ${before} | drag mean ${r.drag.mean} median ${r.drag.median} p95 ${r.drag.p95} worst ${r.drag.worst} | zoom mean ${r.zoom.mean} median ${r.zoom.median} p95 ${r.zoom.p95} worst ${r.zoom.worst} | morph mean ${r.morph.mean} median ${r.morph.median} worst ${r.morph.worst} | idle frames ${r.idleFrames} | lite ${r.gasLite}`);
    }
  }
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('\nMedian over rounds of the mean frame gap (ms), and of the worst:');
console.log('| Variant | Viewport | Drag mean | Drag worst | Zoom mean | Zoom worst | Morph mean | Morph worst |');
console.log('|---|---|---|---|---|---|---|---|');
for (const v of variants) for (const vp of Object.keys(VIEWPORTS)) {
  const mine = rows.filter((r) => r.variant === v.name && r.vp === vp);
  const m = (k, f) => med(mine.map((r) => r[k][f]));
  console.log(`| ${v.name} | ${vp} | ${m('drag', 'mean')} | ${m('drag', 'worst')} | ${m('zoom', 'mean')} | ${m('zoom', 'worst')} | ${m('morph', 'mean')} | ${m('morph', 'worst')} |`);
}
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), power: execSync('pmset -g batt | head -1').toString().trim(), rounds: ROUNDS, variants, rows }, null, 1));
console.log(`wrote ${OUT}`);
