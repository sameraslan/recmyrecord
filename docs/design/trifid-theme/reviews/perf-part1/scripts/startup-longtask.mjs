#!/usr/bin/env node
/**
 * The startup long task on a software renderer, traced: which builds have it, when, and what the main thread was
 * waiting for. Loads `/` exactly as scripts/perf/perf.mjs does for its "Startup worst long task" row (headless
 * Google Chrome on SwiftShader, 1440 x 900, wait 4 s, then for the map's first frame and for the nebula), with
 * every WebGL call timed. A call into WebGL that needs an answer from the GPU process blocks the main thread
 * until the renderer has finished what is queued, so the slow calls inside a long task name its cause.
 *
 * Run from frontcreck/ with arm64 Node. It starts nothing: give it servers that are already answering.
 *
 *   node ../docs/design/trifid-theme/reviews/perf-part1/scripts/startup-longtask.mjs <out.json> --rounds 5 \
 *        baseline=http://127.0.0.1:3301 current=http://127.0.0.1:3302 [--plain]
 *
 * The variants are run in turn, `rounds` times over, one browser at a time. --plain leaves the WebGL calls
 * untimed (only the long tasks are recorded), to show that the timing itself does not make or hide a task.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');
const { assertNativeChrome } = await import(pathToFileURL(path.join(CWD, 'scripts/check-native.mjs')).href);
const argv = process.argv.slice(2);
const OUT = path.resolve(argv[0]);
const ROUNDS = argv.includes('--rounds') ? Number(argv[argv.indexOf('--rounds') + 1]) : 5;
const PLAIN = argv.includes('--plain');
const variants = argv.filter((a) => /^\w+=http/.test(a)).map((a) => ({ name: a.slice(0, a.indexOf('=')), base: a.slice(a.indexOf('=') + 1) }));
const SOFTWARE = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const INIT = (plain) => {
  const t = (window.__t = { lt: [], gl: [], frames: [], marks: [] });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) t.lt.push([Math.round(e.startTime), Math.round(e.duration), e.attribution?.[0]?.containerType ?? '']);
  }).observe({ type: 'longtask', buffered: true });
  // when the map draws: the frame counter, looked at every animation frame and every 4 ms
  let seen = 0;
  const look = () => {
    const f = window.__rmr?.frames ?? 0;
    if (f !== seen) {
      seen = f;
      t.frames.push([Math.round(performance.now()), f]);
    }
  };
  setInterval(look, 4);
  if (plain) return;
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d || typeof d.value !== 'function') continue;
      const orig = d.value;
      proto[name] = function (...a) {
        const t0 = performance.now();
        const out = orig.apply(this, a);
        const dt = performance.now() - t0;
        // every call of 3 ms and more, and every texture upload and fence whatever it took
        if (dt >= 3 || /^tex(Sub)?Image2D$|^texStorage2D$|^fenceSync$|^generateMipmap$/.test(name)) {
          const src = a[a.length - 1];
          const what = name === 'getExtension' || name === 'getParameter' ? String(a[0]) : src && src.width ? `${src.width}x${src.height}` : '';
          t.gl.push([name, Math.round(t0), +dt.toFixed(1), what, this.canvas?.className || (this.canvas instanceof OffscreenCanvas ? 'offscreen' : 'other')]);
        }
        return out;
      };
    }
  }
};

async function one(v) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: SOFTWARE });
  try {
    await assertNativeChrome(browser);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(INIT, PLAIN);
    await page.goto(`${v.base}/`, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    await page.waitForFunction(() => (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => window.__rmr?.gas === undefined || typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off', null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
    return await page.evaluate(() => {
      const t = window.__t;
      const warm = performance.getEntriesByName('rmr-webgl-warm').map((m) => ({ ms: Math.round(m.startTime), why: m.detail }))[0] ?? null;
      const inTask = (x) => t.lt.some(([s, d]) => x[1] + x[2] > s - 2 && x[1] < s + d + 2);
      return {
        longTasks: t.lt,
        worst: Math.max(0, ...t.lt.map((x) => x[1])),
        warmUp: warm,
        firstFrames: t.frames.slice(0, 4),
        gasShownMs: typeof window.__rmr?.gasShownMs === 'number' ? Math.round(window.__rmr.gasShownMs) : null,
        gasLite: window.__rmr?.gasLite ?? null,
        // the timed WebGL calls that fall inside a long task, and the uploads and fences wherever they fall
        glInLongTasks: t.gl.filter(inTask),
        uploadsAndFences: t.gl.filter((x) => /^tex|^fence|^generate/.test(x[0])),
        slowGl: t.gl.filter((x) => x[2] >= 20),
      };
    });
  } finally {
    await browser.close();
  }
}

const load = () => execSync('uptime').toString().replace(/.*load averages?: /, '').trim();
const rows = [];
for (let round = 1; round <= ROUNDS; round++) {
  for (const v of variants) {
    const before = load();
    const r = await one(v);
    rows.push({ round, variant: v.name, loadBefore: before, ...r });
    console.log(`round ${round} ${v.name.padEnd(9)} load ${before} | long tasks ${JSON.stringify(r.longTasks.map((x) => x.slice(0, 2)))} | warm-up end ${r.warmUp ? `${r.warmUp.ms} (${r.warmUp.why})` : 'none'} | first frames ${JSON.stringify(r.firstFrames)} | nebula ${r.gasShownMs ?? 'none'} | WebGL calls inside long tasks: ${r.glInLongTasks.map((x) => `${x[0]}(${x[3]}) at ${x[1]} for ${x[2]} ms on ${x[4]}`).join('; ') || 'none'}`);
  }
}
console.log('\nWorst startup long task per run (ms):');
for (const v of variants) {
  const w = rows.filter((r) => r.variant === v.name).map((r) => r.worst);
  console.log(`${v.name}: ${w.join(', ')} (median ${[...w].sort((a, b) => a - b)[Math.floor(w.length / 2)]}; runs with a task of 50 ms or more: ${w.filter((x) => x >= 50).length} of ${w.length})`);
}
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), power: execSync('pmset -g batt | head -1').toString().trim(), plain: PLAIN, rounds: ROUNDS, variants, rows }, null, 1));
console.log(`wrote ${OUT}`);
