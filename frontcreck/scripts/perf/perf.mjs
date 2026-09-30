#!/usr/bin/env node
/** npm run perf: measures every budget of spec section 7 against the production build and fails on a breach. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';
import { assertNativeChrome } from '../check-native.mjs';
import { startServer } from '../serve.mjs';
import { checkBudgets, checkPages, formatTable } from './lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BUDGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/perf/budgets.json'), 'utf8'));
const PORT = 3200;
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
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

function sh(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${cmdArgs.join(' ')} exited ${code}`))));
  });
}

async function firstLoadJs() {
  const html = await (await fetch(`${BASE}/`)).text();
  // The budget counts every script of the page (the brief's definition); modern browsers skip `nomodule` ones.
  const tags = new Map();
  for (const m of html.matchAll(/<script([^>]*)\ssrc="([^"]+)"([^>]*)>/g)) {
    if (!tags.has(m[2])) tags.set(m[2], /\snomodule\b/i.test(`${m[1]} ${m[3]}`));
  }
  let kb = 0;
  let nomoduleKb = 0;
  let threeKb = 0;
  const files = [];
  for (const [src, nomodule] of tags) {
    const body = Buffer.from(await (await fetch(new URL(src, BASE))).arrayBuffer());
    const gz = zlib.gzipSync(body, { level: 9 }).length / 1024;
    const isThree = body.includes('WebGLRenderer');
    files.push({ src, gzKb: Math.round(gz * 10) / 10, isThree, nomodule });
    if (isThree) threeKb += gz;
    else kb += gz;
    if (nomodule && !isThree) nomoduleKb += gz;
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  return { kb: r1(kb), modernKb: r1(kb - nomoduleKb), threeKb: r1(threeKb), files };
}

/** Server HTML of `/` and of In Rainbows: size, and whether it names an album the page does not show. */
async function pageChecks() {
  const albums = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/albums.json'), 'utf8'));
  const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/recs.json'), 'utf8'));
  const ir = albums.findIndex((a) => a.slug === 'in-rainbows-radiohead');
  const shown = new Set([ir, ...Object.values(recs).flatMap((rows) => rows[ir])]);
  // A low-ranked album: never on the Home shelf (the top albums with a cover) and not among In Rainbows' rows.
  let unrelated = albums.length - 1;
  while (shown.has(unrelated)) unrelated--;
  const slug = albums[unrelated].slug;
  const pages = [];
  for (const p of ['/', '/album/in-rainbows-radiohead']) {
    const html = await (await fetch(`${BASE}${p}`)).text();
    pages.push({ path: p, kb: Math.round((Buffer.byteLength(html) / 1024) * 10) / 10, unrelatedSlug: html.includes(`"${slug}"`) || html.includes(`/album/${slug}`) ? slug : null });
  }
  return pages;
}

/* In-page steps. Each returns plain numbers; timing uses performance.now and rAF polling. */
const PAGE_HELPERS = () => {
  window.__perf = {
    raf: () => new Promise((r) => requestAnimationFrame(() => r(performance.now()))),
    vis: (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
    async until(fn, max = 5000) {
      const t0 = performance.now();
      while (performance.now() - t0 < max) {
        if (fn()) return true;
        await this.raf();
      }
      return false;
    },
    /** Waits until the map has drawn nothing for `quietMs` (an entrance animation has settled); false after `max`. */
    async settled(quietMs = 300, max = 6000) {
      const t0 = performance.now();
      let n = window.__rmr?.frames ?? 0;
      let since = t0;
      while (performance.now() - t0 < max) {
        await new Promise((r) => setTimeout(r, 50));
        const m = window.__rmr?.frames ?? 0;
        if (m !== n) {
          n = m;
          since = performance.now();
        } else if (performance.now() - since >= quietMs) return true;
      }
      return false;
    },
    async gaps(ms) {
      let longest = 0;
      let last = performance.now();
      const end = last + ms;
      while (performance.now() < end) {
        const now = await this.raf();
        longest = Math.max(longest, now - last);
        last = now;
      }
      return Math.round(longest);
    },
  };
  // When the map first draws (after the WebGL warm-up, the probe and the data): reported, not budgeted.
  window.__mapFirstFrame = null;
  const watchMap = () => {
    if ((window.__rmr?.frames ?? 0) > 0) window.__mapFirstFrame = Math.round(performance.now());
    else requestAnimationFrame(watchMap);
  };
  requestAnimationFrame(watchMap);
  window.__lt = [];
  window.__ltSupported = PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false;
  if (window.__ltSupported) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  }
};

async function albumFlow(page, isPhone) {
  return page.evaluate(async (phone) => {
    const P = window.__perf;
    const res = { settled: [] };
    const input = document.querySelector('.hero input[role="combobox"]');
    input.focus();
    await P.until(() => document.documentElement.dataset.searchIndex === 'ready', 10000);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    let t = performance.now();
    setter.call(input, 'loveless');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const typed = await P.until(() => [...document.querySelectorAll('[role="option"]')].some(P.vis));
    res.typeToSuggestionsMs = typed ? Math.round(performance.now() - t) : null;
    const opt = [...document.querySelectorAll('[role="option"]')].find(P.vis);
    if (!opt) return res; // the missing measurements are reported as failures by checkBudgets
    t = performance.now();
    opt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, isPrimary: true }));
    const shown = await P.until(() => document.querySelector('#seed-title')?.textContent === 'Loveless' && [...document.querySelectorAll('a.rec-main')].some(P.vis));
    res.selectToAlbumMs = shown ? Math.round(performance.now() - t) : null;
    res.transitionGapMs = await P.gaps(600);
    await new Promise((r) => setTimeout(r, 1200));
    res.settled.push(await P.settled());
    if (phone) {
      document.querySelector('.fab-map')?.click();
      await new Promise((r) => setTimeout(r, 700));
      // With a software renderer each map frame takes about 100 ms and the map-mode entrance runs well past
      // 700 ms; a slider tap during it would time the entrance's frames, not the slider.
      res.settled.push(await P.settled());
    }
    const list = () => [...document.querySelectorAll('ol.rec-list .rec-title')].map((e) => e.textContent).join('|');
    const before = list();
    const sonic = [...document.querySelectorAll('.mode-stops button')].find((b) => P.vis(b) && b.textContent.trim() === 'Sonic');
    if (!sonic) return res;
    t = performance.now();
    sonic.click();
    const changed = await P.until(() => list() !== before);
    res.sliderToListMs = changed ? Math.round(performance.now() - t) : null;
    res.morphGapMs = await P.gaps(700);
    return res;
  }, isPhone);
}

async function exploreFlow(page, isPhone) {
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  return page.evaluate(async (phone) => {
    const P = window.__perf;
    const res = {};
    const c = document.querySelector('canvas.map-canvas');
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const type = phone ? 'touch' : 'mouse';
    const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: type, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
    fire('pointerdown', cx, cy);
    let longest = 0;
    let last = performance.now();
    const t0 = last;
    while (performance.now() - t0 < 2000) {
      const k = (performance.now() - t0) / 2000;
      fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
      const now = await P.raf();
      longest = Math.max(longest, now - last);
      last = now;
    }
    fire('pointerup', cx, cy);
    res.dragGapMs = Math.round(longest);
    await new Promise((r2) => setTimeout(r2, 500));
    longest = 0;
    last = performance.now();
    const t1 = last;
    while (performance.now() - t1 < 2000) {
      const k = (performance.now() - t1) / 2000;
      c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy - 40, deltaY: k < 0.5 ? -40 : 40 }));
      const now = await P.raf();
      longest = Math.max(longest, now - last);
      last = now;
    }
    res.zoomGapMs = Math.round(longest);
    await new Promise((r2) => setTimeout(r2, 1500));
    window.__lt.length = 0;
    const f0 = window.__rmr.frames;
    await new Promise((r2) => setTimeout(r2, 3000));
    res.idleLongTasks = window.__lt.length;
    res.idleFrames = window.__rmr.frames - f0;
    return res;
  }, isPhone);
}

async function measure(mode, vpName) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: MODES[mode] });
  await assertNativeChrome(browser); // a translated (x86_64) Chrome inflates every timing about 50x
  const ctx = await browser.newContext(VIEWPORTS[vpName]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(PAGE_HELPERS);
  let thumbsOnFirstLoad = false;
  const onRequest = (r) => {
    if (r.url().endsWith('/data/thumbs.webp')) thumbsOnFirstLoad = true;
  };
  page.on('request', onRequest);
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  page.off('request', onRequest);
  const renderer = await page.evaluate(() => {
    try {
      const g = document.createElement('canvas').getContext('webgl');
      return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    } catch {
      return 'n/a';
    }
  });
  // A slow start (a cold software renderer) can draw the map after the 4 s window; wait for it so it is reported.
  await page.waitForFunction(() => window.__mapFirstFrame !== null, null, { timeout: 20000 }).catch(() => {});
  const startup = await page.evaluate(() => ({
    lt: window.__lt.slice(),
    supported: window.__ltSupported,
    ready: performance.getEntriesByName('rmr-search-ready')[0]?.startTime ?? null,
    mapFirstFrame: window.__mapFirstFrame,
    warm: performance.getEntriesByName('rmr-webgl-warm').map((m) => ({ ms: Math.round(m.startTime), why: m.detail }))[0] ?? null,
  }));
  const result = {
    mode,
    vp: vpName,
    renderer,
    errors,
    longTasksSupported: startup.supported,
    thumbsOnFirstLoad,
    searchUsableMs: startup.ready === null ? null : Math.round(startup.ready),
    startupLongTaskMs: Math.max(0, ...startup.lt.map((x) => x[1])),
    mapFirstFrameMs: startup.mapFirstFrame,
    warmUp: startup.warm,
    startupLongTasks: startup.lt,
    ...(await albumFlow(page, vpName === 'phone')),
    ...(await exploreFlow(page, vpName === 'phone')),
  };
  await browser.close();
  return result;
}

async function main() {
  if (args.includes('--build') || !fs.existsSync(path.join(ROOT, '.next/BUILD_ID'))) await sh('npm', ['run', 'build']);
  const server = await startServer(PORT);
  BASE = server.base;
  const rows = [];
  const fails = [];
  try {
    const js = await firstLoadJs();
    console.log(
      `First-load JS of / (gzip): ${js.kb} KB with nomodule scripts (budget ${BUDGETS.firstLoadJsKb} KB), ${js.modernKb} KB without; three.js chunk on first load: ${js.threeKb} KB`,
    );
    if (js.kb > BUDGETS.firstLoadJsKb) fails.push(`first-load JS ${js.kb} KB > ${BUDGETS.firstLoadJsKb} KB`);
    if (js.threeKb > 0) fails.push(`the three.js chunk (${js.threeKb} KB) is in the first-load scripts of /; MapStage must load it after first paint`);
    const pages = await pageChecks();
    console.log(`Server HTML: ${pages.map((p) => `${p.path} ${p.kb} KB`).join(', ')} (budget ${BUDGETS.pageHtmlKb} KB each)`);
    fails.push(...checkPages(pages, BUDGETS));
    for (const mode of opt('--mode') ? [opt('--mode')] : Object.keys(MODES)) {
      for (const vp of opt('--viewport') ? [opt('--viewport')] : Object.keys(VIEWPORTS)) {
        const r = await measure(mode, vp);
        rows.push(r);
        fails.push(...checkBudgets(r, mode, BUDGETS, { allowSoftwareGpu: args.includes('--allow-software-gpu') }));
      }
    }
    console.log(`\n${formatTable(rows)}\n`);
    for (const r of rows) {
      // settled() gives up after 6 s; the next step then measures a map that is still animating.
      if (r.settled?.includes(false)) console.warn(`WARNING ${r.mode} ${r.vp}: the map did not settle before a step (settled: ${JSON.stringify(r.settled)})`);
    }
    const outDir = path.join(ROOT, 'scripts/perf/out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `perf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ js, rows, fails }, null, 1));
  } finally {
    await server.stop();
  }
  if (fails.length) {
    console.error(`FAIL\n${fails.join('\n')}`);
    process.exit(1);
  }
  console.log('All budgets met.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
