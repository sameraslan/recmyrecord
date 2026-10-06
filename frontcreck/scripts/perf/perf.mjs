#!/usr/bin/env node
/** npm run perf: measures every budget of spec section 7 against the production build and fails on a breach. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';
import { assertNativeChrome } from '../check-native.mjs';
import { startServer } from '../serve.mjs';
import { checkBudgets, checkEffects, checkPages, formatTable, glassVars, jsonExtras, parseEffectFlags } from './lib.mjs';

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
  // Reported only and gpu only: a desktop screen at device pixel ratio 2, where the map shades four times the pixels.
  desktop2x: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
// --no-gas: do not wait for window.__rmr.gas, so a build without the gas layer can be measured with this script.
const NO_GAS = args.includes('--no-gas');
// --gas-lite off|force: measure with the full gas shader on a software renderer too ('off'), or with the lighter
// one on a GPU too ('force'), to compare the two on one build. Without it the app chooses, as for a visitor.
const GAS_LITE = opt('--gas-lite');
// --open whole: skip the fresh /map load at the opening view (the Overview since part 2's Task 0). The budget rows
// are measured at the whole map in every run, as the baseline measured them.
const OPEN = opt('--open');
if (OPEN !== null && OPEN !== 'whole') {
  console.error('--open takes whole');
  process.exit(2);
}
// --glass on|off, --twinkle on|off, --names on|off: force one effect for the whole run, for an A/B of what it
// costs. Each is read back in the page and the run fails when the page did not have what was forced.
let EFFECTS;
try {
  EFFECTS = parseEffectFlags(args);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
// --glass: glass or solid panels at any width. The four custom properties are read from globals.css (first value
// glass, last value the stylesheet's own solid fallback) and set inline on <html> before the page first paints.
const GLASS_WANT = EFFECTS.glass;
let GLASS = null;
if (GLASS_WANT) {
  try {
    GLASS = glassVars(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), GLASS_WANT);
  } catch (e) {
    console.error(`--glass ${GLASS_WANT}: ${e.message}. Measure a build that has the glass tokens; nothing was run.`);
    process.exit(2);
  }
}
// --names: the region names, through the visitor's own saved choice.
const NAMES = EFFECTS.names;
// --twinkle: the glints, through the app's own switch for tests and measurements: window.__rmrTwinkle, set before
// the page's scripts run ('off' = no glints; 'on' = glints on any renderer, also the software one, where a visitor
// gets none: src/components/map/state/twinkle.ts twinkleShown and watchTwinkleSwitch). TWINKLE_READBACK reads what the app did with it, never the global this script
// set: whether the glints' own timer says it is enabled, how many glints it has made on this page, and how many
// are in the DOM. An app that ignored the switch, or has no twinkle, reads back as that (checkEffects in lib.mjs).
const TWINKLE = EFFECTS.twinkle;
function twinkleSwitch(v) {
  window.__rmrTwinkle = v;
}
/** Runs in the page. */
const TWINKLE_READBACK = () => {
  const tw = window.__rmr?.twinkle;
  return {
    twinkleOn: typeof tw?.enabled === 'function' ? tw.enabled() : null,
    twinkleSpawned: tw?.stats?.spawned ?? null,
    twinkleNodes: document.querySelector('.tw-layer')?.childElementCount ?? null,
  };
};
const ANY_EFFECT = !!(GLASS || TWINKLE || NAMES);

/** Sets the forced effects up for every page of a browser context, before any script of the page runs. Called for
 * every context the run opens. With no flag it adds nothing.
 *
 * Glass is forced without touching a loaded page: the init script sets the four properties inline on <html> the
 * moment the parser creates the element, which is before the stylesheet applies and before first paint. So the
 * page computes its styles once, with the forced values, exactly as it would have with other values in the
 * stylesheet; there is no restyle of a finished page inside the window the startup rows cover (a restyle after
 * `load` was the first version; it invalidated the whole tree during the startup long task window). The time the
 * properties were set is kept and checked against first paint. An in-page navigation keeps inline properties (as it
 * keeps AlbumPanel's --acc); a full load runs the init script again. */
async function presetEffects(ctx) {
  if (GLASS) {
    await ctx.addInitScript((vars) => {
      const apply = () => {
        const el = document.documentElement;
        if (!el) return false;
        for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
        window.__perfGlassAt = performance.now();
        return true;
      };
      if (!apply()) {
        const mo = new MutationObserver(() => {
          if (apply()) mo.disconnect();
        });
        mo.observe(document, { childList: true });
      }
    }, GLASS);
  }
  // The names choice is the visitor's saved one (src/lib/namesPref.ts: key 'rmr-names', only an exact '0' is off);
  // the map's chunk reads it when it loads. Storage is blocked on about:blank, hence the try.
  if (NAMES) {
    await ctx.addInitScript((v) => {
      try {
        window.localStorage.setItem('rmr-names', v);
      } catch {}
    }, NAMES === 'on' ? '1' : '0');
  }
  if (TWINKLE) await ctx.addInitScript(twinkleSwitch, TWINKLE);
}

/** What the page actually has, read back so a run proves its flags took effect (checkEffects in lib.mjs judges
 * it). Only called when a flag is set, and only after the measures of the page it reads. */
const effectsSeen = async (page, at) => ({ ...(await effectsSeenBase(page, at)), ...(await page.evaluate(TWINKLE_READBACK)) });
const effectsSeenBase = (page, at) =>
  page.evaluate((where) => {
    const backdrop = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backdropFilter : null;
    };
    let names = null;
    try {
      names = window.localStorage.getItem('rmr-names');
    } catch {}
    const paint = performance.getEntriesByType('paint').find((e) => e.name === 'first-paint');
    const html = document.documentElement;
    return {
      at: where,
      path: location.pathname,
      glassBlur: getComputedStyle(html).getPropertyValue('--glass-blur').trim() || null,
      glassInline: html.style.getPropertyValue('--glass-blur') || null,
      header: backdrop('header.top'),
      panel: backdrop('.panel'),
      album: backdrop('.album'),
      headerBackground: document.querySelector('header.top') ? getComputedStyle(document.querySelector('header.top')).backgroundColor : null,
      namesSaved: names,
      namesOn: window.__rmr?.getState?.().namesOn ?? null,
      forcedMs: typeof window.__perfGlassAt === 'number' ? Math.round(window.__perfGlassAt) : null,
      firstPaintMs: paint ? Math.round(paint.startTime) : null,
    };
  }, at);

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
    /** Waits until part 1's sharper gas image has settled: the flag is not 'loading' and neither it nor the frame
     * count changed for `quietMs` (longer than the 2 s retry wait of a failed load, shaders/gas.ts
     * GAS_SHARP_RETRY_MS). Phones say 'off', software renderers 'waiting' or 'off', a page with no gas layer has no
     * flag. Resolves false after `max`. */
    async sharpSettled(quietMs = 2500, max = 45000) {
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

/** The opening view, reported only: a fresh /map as a visitor opens it (the Overview since part 2's Task 0), its
 * first drag and first wheel zoom, the same gestures as exploreFlow's. Runs last, in its own browser context (cold
 * HTTP cache, no __rmrOpen), so the budget rows before it meet the network exactly as in the baseline; its wheel
 * zoom fetches cover sheets and, on a GPU desktop, the sharper gas image, which must not warm their cache. */
async function openingFlow(browser, vpName, errors) {
  const ctx = await browser.newContext(VIEWPORTS[vpName]);
  try {
    await presetEffects(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(PAGE_HELPERS);
    if (GAS_LITE) await page.addInitScript((v) => (window.__rmrGasLite = v), GAS_LITE);
    const res = await openingSteps(page, vpName === 'phone');
    if (ANY_EFFECT) res.openingEffectsSeen = await effectsSeen(page, 'opening view');
    return res;
  } finally {
    await ctx.close();
  }
}

async function openingSteps(page, isPhone) {
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  await page.waitForFunction((noGas) => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (noGas || window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), NO_GAS, { timeout: 20000 });
  await page.waitForTimeout(1500);
  return page.evaluate(async (phone) => {
    const P = window.__perf;
    const res = { openingSharpSettled: await P.sharpSettled(), openingCamera: window.__rmr.map.getCamera() };
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
    res.openingDragGapMs = Math.round(longest);
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
    res.openingZoomGapMs = Math.round(longest);
    return res;
  }, isPhone);
}

async function exploreFlow(page, isPhone) {
  // The budget rows are measured where the baseline measured them: a fresh /map at the whole map (the site's
  // opening view before part 2's Task 0). The init script applies to this load and any later one of this page.
  await page.addInitScript(() => {
    window.__rmrOpen = 'whole';
  });
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  await page.waitForFunction((noGas) => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (noGas || window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), NO_GAS, { timeout: 20000 });
  await page.waitForTimeout(1500);
  return page.evaluate(async (phone) => {
    const P = window.__perf;
    // The camera the budget rows start from: the whole map (__rmrOpen above), as in the baseline.
    const res = { wholeCamera: window.__rmr.map.getCamera() };
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
    // Deep zoom, reported only: the same drag with covers at full size, where the gas is read from a blurred
    // copy. setCamera clamps the zoom to its maximum. The camera is put back before the idle window is measured.
    const api = window.__rmr.map;
    const home = api.getCamera();
    api.setCamera({ ...home, zoom: 1000 }, false);
    await P.settled();
    fire('pointerdown', cx, cy);
    longest = 0;
    last = performance.now();
    const t2 = last;
    while (performance.now() - t2 < 2000) {
      const k = (performance.now() - t2) / 2000;
      fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
      const now = await P.raf();
      longest = Math.max(longest, now - last);
      last = now;
    }
    fire('pointerup', cx, cy);
    res.deepDragGapMs = Math.round(longest);
    res.deepZoom = window.__rmr.gasDeep ?? null;
    // The worst case for the gas, reported only: still at full zoom, another stop is chosen, so both stops are
    // bound and the blurred copy is read from both while the albums morph. Then the stop is put back.
    await P.settled();
    const stop0 = window.__rmr.getState().stop;
    window.__rmr.getState().setStop(stop0 === 'sonic' ? 'mood' : 'sonic');
    res.deepMorphGapMs = await P.gaps(700);
    await P.settled();
    window.__rmr.getState().setStop(stop0);
    await P.settled();
    api.setCamera(home, false);
    // Full zoom makes the atlas fetch cover sheets; wait until the map has stopped drawing so a late sheet
    // cannot land in the idle window measured below.
    await P.settled();
    await new Promise((r2) => setTimeout(r2, 1500));
    // Part 1's sharper gas image: the deep zoom and the stop change above make it be fetched (or freed and fetched
    // again) at rest, and its fade draws up to 14 frames. The idle window starts once it has settled.
    res.idleSharpSettled = await P.sharpSettled();
    res.sharpFlag = String(window.__rmr?.gasSharp);
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
  await presetEffects(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(PAGE_HELPERS);
  if (GAS_LITE) await page.addInitScript((v) => (window.__rmrGasLite = v), GAS_LITE);
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
  // The gas of the stop Home shows arrives after the first frame; wait for it so its upload is inside the startup
  // long tasks and its time can be reported. A page with no gas (or --no-gas) is not waited for.
  if (!NO_GAS) await page.waitForFunction(() => typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off', null, { timeout: 20000 }).catch(() => {});
  const startup = await page.evaluate(() => ({
    gasShown: window.__rmr?.gasShownMs ?? null,
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
    gasShownMs: typeof startup.gasShown === 'number' ? Math.round(startup.gasShown) : null,
    warmUp: startup.warm,
    startupLongTasks: startup.lt,
    ...(await albumFlow(page, vpName === 'phone')),
  };
  // What the forced effects look like in the page (only with a flag): on the album, after its measures, where the
  // header, a panel and the album panel all exist; then on /map after the budget rows; then at the opening view.
  const seen = ANY_EFFECT ? [await effectsSeen(page, 'album')] : null;
  Object.assign(result, {
    ...(await exploreFlow(page, vpName === 'phone')),
    ...(seen ? { effectsSeen: [...seen, await effectsSeen(page, 'map')] } : {}),
    // The opening rows last, in a fresh context: the budget rows above are measured exactly as in the baseline.
    ...(OPEN ? {} : await openingFlow(browser, vpName, errors)),
  });
  // Which gas shader drew the map (reported only): the lighter one on a software renderer, the full one on a GPU.
  result.gasLite = await page.evaluate(() => window.__rmr?.gasLite ?? null);
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
        if (vp === 'desktop2x' && mode !== 'gpu') continue; // dpr 2 is measured on the GPU only
        const r = await measure(mode, vp);
        rows.push(r);
        // The dpr 2 column is reported only: it has no budget and is never checked.
        if (vp !== 'desktop2x') fails.push(...checkBudgets(r, mode, BUDGETS, { allowSoftwareGpu: args.includes('--allow-software-gpu') }));
        // A forced effect the page did not have fails the run in every column: its numbers are not an A/B.
        if (ANY_EFFECT) fails.push(...checkEffects(`${mode} ${vp}`, [...r.effectsSeen, ...(r.openingEffectsSeen ? [r.openingEffectsSeen] : [])], EFFECTS, GLASS));
      }
    }
    console.log(`\n${formatTable(rows)}\n`);
    if (rows.some((r) => r.vp === 'desktop2x')) console.log('The desktop2x column (1440 x 900 at device pixel ratio 2, gpu only) is reported only: it has no budget and cannot fail the run.\n');
    if (NO_GAS) console.log('Run with --no-gas: the script did not wait for a gas layer.\n');
    if (GAS_LITE) console.log(`Run with --gas-lite ${GAS_LITE}: the gas shader was not the app's own choice.\n`);
    if (ANY_EFFECT) {
      console.log(`Run with${GLASS ? ` --glass ${GLASS_WANT}` : ''}${TWINKLE ? ` --twinkle ${TWINKLE}` : ''}${NAMES ? ` --names ${NAMES}` : ''}: an A/B run, not the site as a visitor gets it. Read back in the page:`);
      for (const r of rows) for (const e of [...r.effectsSeen, ...(r.openingEffectsSeen ? [r.openingEffectsSeen] : [])]) console.log(`  ${r.mode} ${r.vp}, ${e.at}: ${JSON.stringify(e)}`);
      console.log('');
    }
    if (OPEN) console.log('Run with --open whole: the opening view rows were not measured (n/a). The budget rows are measured at the whole map in every run.\n');
    for (const r of rows) {
      // settled() gives up after 6 s; the next step then measures a map that is still animating.
      if (r.settled?.includes(false)) console.warn(`WARNING ${r.mode} ${r.vp}: the map did not settle before a step (settled: ${JSON.stringify(r.settled)})`);
      if (r.openingSharpSettled === false || r.idleSharpSettled === false) console.warn(`WARNING ${r.mode} ${r.vp}: the sharper gas image did not settle before a step (opening ${r.openingSharpSettled}, idle ${r.idleSharpSettled})`);
    }
    const outDir = path.join(ROOT, 'scripts/perf/out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `perf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ js, pages, rows, fails, ...jsonExtras({ open: OPEN, ...EFFECTS, noGas: NO_GAS, gasLite: GAS_LITE, allowSoftwareGpu: args.includes('--allow-software-gpu') }) }, null, 1));
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
