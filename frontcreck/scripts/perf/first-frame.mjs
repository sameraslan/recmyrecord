#!/usr/bin/env node
/**
 * node scripts/perf/first-frame.mjs --label <name>: how long a cold load takes to put a picture in the map pane.
 * Reported only, no budgets. It measures the production build (run `npm run build` first) on `next start`.
 *
 * For Home and /map, at 1440 x 900 and at 390 x 844 (device pixel ratio 2, touch), with no throttling and on two
 * throttled connections, each `--runs` times (3) in a fresh browser with an empty cache, it records:
 *   - the page's own marks (src/lib/marks.ts), first paint, first and largest contentful paint, long tasks, every
 *     request with its first priority, and two times for search: "search field usable", when the search box is
 *     hydrated and takes focus and keystrokes (the mark rmr-search-ready), and "search answers", when the search
 *     code and the album list are in and the index is built (Home at desktop size starts that by itself);
 *   - a screencast (the frames the browser presented, each with its time), from which it reads when the map pane
 *     first showed anything but the empty sky ("lit"), when stars first showed, and when the picture stopped
 *     changing. The pane is read only where no panel, header or text lies over it.
 * Output goes to test-results/first-frame/<label>/: results.json, one filmstrip per page and viewport (a frame
 * every 100 ms of the slow load), and the frames at first light, first stars, first nebula and the settled page.
 *
 * Options: --label <name> (required), --runs <n>, --mode gpu|software (gpu: the installed Chrome on Metal, as
 * `npm run perf`; software: SwiftShader), --only <page>:<viewport>:<profile> (for a single case), --port <n>,
 * --hold-gas <ms> (the opening nebula image is held back that long, to see the stars arrive before it),
 * --profiles none,fast4g (only these), --pages home (only these), --base <url> (a server already running; none is started), --stills (no timing: full-resolution PNGs of the stand-in alone, with the
 * album list held back, for Home, /map and an album page at 1440 x 900, 390 x 844 and 2560 x 1440, and of the drawn
 * Home and /map at 2560 x 1440, into <label>/png/ or --out <dir>).
 * Each run also lists the frames that were darker than the one before them (mean luma of the whole frame, panels
 * and text included, down by 0.75 of a level or more): a load should only ever gain light.
 *
 * The throttled profiles are applied with CDP Network.emulateNetworkConditions, to every request of the page:
 *   slow4g  Lighthouse's "slow 4G" as DevTools applies it: 562.5 ms added latency, 1474.56 kbit/s down, 675 kbit/s
 *           up (lighthouse/core/config/constants.js, throttling.mobileSlow4G). The page is then short of
 *           bandwidth from start to end: what counts is how many bytes the first picture needs.
 *   fast4g  DevTools' "Fast 4G" preset: 165 ms added latency, 8.1 Mbit/s down, 1.35 Mbit/s up (9 and 1.5 Mbit/s
 *           times its 0.9 factor, 60 ms times 2.75). Here the waits between requests count.
 * `next start` serves HTTP/1.1 with gzip; a deployment serves HTTP/2 or 3 with Brotli, so the numbers are for
 * comparing two builds, not a forecast.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { assertNativeChrome } from '../check-native.mjs';
import { startServer } from '../serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const LABEL = opt('--label');
if (!LABEL || !/^[a-z0-9-]+$/.test(LABEL)) {
  console.error('--label <name> is required (lower-case letters, digits, dashes)');
  process.exit(2);
}
const RUNS = Number(opt('--runs', '3'));
const MODE = opt('--mode', 'gpu');
const PORT = Number(opt('--port', '3210'));
const ONLY = opt('--only');
const HOLD_GAS = Number(opt('--hold-gas', '0'));
const ONLY_PROFILES = opt('--profiles')?.split(',') ?? null;
const ONLY_PAGES = opt('--pages')?.split(',') ?? null;
const STILLS = args.includes('--stills');
// --base <url>: measure a server that is already running (several builds side by side) instead of starting one.
const BASE_URL = opt('--base');
// --out <dir under test-results/first-frame>: where --stills writes, instead of <label>/png.
const STILLS_DIR = opt('--out');
const OUT = path.join(ROOT, 'test-results/first-frame', LABEL);

const MODES = {
  software: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  gpu: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'],
};
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const PAGES = { home: '/', map: '/map' };
const PROFILES = {
  none: null,
  fast4g: { offline: false, latency: 165, downloadThroughput: (9_000_000 * 0.9) / 8, uploadThroughput: (1_500_000 * 0.9) / 8 },
  slow4g: { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 },
};

/** Luma (0 to 255) above which a pixel is not the empty sky (#07060a is about 6.5; JPEG noise adds a few). */
const LIT_LUMA = 16;
/** Share of the free pane that must be lit for the pane to count as showing a picture. */
const LIT_SHARE = 0.01;

/** Runs in the page before its scripts: paint, largest contentful paint and long tasks, kept for the end. */
function observe() {
  const w = window;
  w.__ff = { paint: {}, lcp: null, lt: [], searchIndex: null };
  // When search can answer: the search code and the album list are in and the index is built
  // (components/search/searchIndex.ts sets data-search-index on <html>). On Home at desktop size the field takes
  // focus as the page hydrates, which starts this; elsewhere it starts at the first focus, so there it stays null.
  const seen = () => {
    if (w.__ff.searchIndex === null && document.documentElement?.dataset.searchIndex === 'ready') w.__ff.searchIndex = performance.now();
  };
  new MutationObserver(seen).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-search-index'] });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__ff.paint[e.name] = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__ff.lcp = { at: e.startTime, what: e.element ? `${e.element.tagName.toLowerCase()}.${e.element.className}`.slice(0, 60) : null };
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__ff.lt.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // an entry type this browser does not report
  }
}

/** Runs in the page at the end: everything the page knows about its own load. */
function collect() {
  const mark = (name) => performance.getEntriesByName(name)[0]?.startTime ?? null;
  const names = ['rmr-data-start', 'rmr-data-end', 'rmr-chunk-start', 'rmr-chunk-end', 'rmr-gas-fetch', 'rmr-gas-decoded', 'rmr-map-frame', 'rmr-gas-drawn', 'rmr-map-shown', 'rmr-search-ready', 'rmr-webgl-warm'];
  const resources = performance
    .getEntriesByType('resource')
    .filter((r) => /\/data\/|\/_next\/static\/chunks\//.test(r.name))
    .map((r) => ({ url: new URL(r.name).pathname, start: Math.round(r.startTime), end: Math.round(r.responseEnd), bytes: r.transferSize, type: r.initiatorType }));
  // Where no text, cover or control lies over the pane: the pane is read only outside these rectangles. The soft
  // dark pads behind Home's text are not left out (the nebula shows through them, dimmed, as a visitor sees it).
  const covered = [];
  for (const sel of ['header.top', '.hero h1', '.hero .lede', '.hero .combo', '.hero-row', '.shelf-now', '.mosaic', '.mode', '.map-zoom', '.map-hint', '.map-explore', '.card', '.map-msg', '.about']) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      covered.push([r.left - 8, r.top - 8, r.right + 8, r.bottom + 8]);
    }
  }
  let renderer = 'n/a';
  try {
    const g = document.createElement('canvas').getContext('webgl2');
    renderer = g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  } catch {
    // no WebGL
  }
  return {
    origin: performance.timeOrigin,
    marks: Object.fromEntries(names.map((n) => [n, mark(n)])),
    paint: window.__ff.paint,
    lcp: window.__ff.lcp,
    longTasks: window.__ff.lt,
    searchIndex: window.__ff.searchIndex,
    allResources: performance.getEntriesByType('resource').map((r) => [new URL(r.name).host === location.host ? new URL(r.name).pathname : new URL(r.name).host, Math.round(r.startTime), Math.round(r.responseEnd), r.transferSize, r.initiatorType]),
    gasShownMs: window.__rmr?.gasShownMs ?? null,
    gas: window.__rmr?.gas ?? null,
    frames: window.__rmr?.frames ?? 0,
    resources,
    covered,
    renderer,
    viewport: [window.innerWidth, window.innerHeight],
  };
}

/** Luma of every pixel of a frame, with its size. */
async function lumaOf(jpeg) {
  const { data, info } = await sharp(jpeg).greyscale().toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`a frame decoded to ${info.channels} channels`);
  return { data, width: info.width, height: info.height };
}

/** 1 where the pane is free of panels and text, per pixel of a frame. */
function freeMask(width, height, covered, viewport) {
  const sx = width / viewport[0];
  const sy = height / viewport[1];
  const mask = new Uint8Array(width * height).fill(1);
  for (const [l, t, r, b] of covered) {
    const x0 = Math.max(0, Math.floor(l * sx));
    const x1 = Math.min(width, Math.ceil(r * sx));
    const y0 = Math.max(0, Math.floor(t * sy));
    const y1 = Math.min(height, Math.ceil(b * sy));
    for (let y = y0; y < y1; y++) mask.fill(0, y * width + x0, y * width + x1);
  }
  return mask;
}

/** What a frame shows in the free pane: the share of lit pixels, the mean luma, and the share of pixels that stand
 * out of their surroundings as points (stars): brighter by 24 or more than the same frame blurred. The soft
 * stand-in nebula has none; the map's stars are thousands. */
async function readFrame(jpeg, covered, viewport) {
  const img = await lumaOf(jpeg);
  const soft = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 1 } }).blur(3).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  if (soft.info.channels !== 1) throw new Error(`a blurred frame has ${soft.info.channels} channels`);
  const blurred = soft.data;
  const mask = freeMask(img.width, img.height, covered, viewport);
  let free = 0;
  let lit = 0;
  let sum = 0;
  let points = 0;
  let all = 0;
  for (let i = 0; i < mask.length; i++) {
    all += img.data[i];
    if (!mask[i]) continue;
    free++;
    const v = img.data[i];
    sum += v;
    if (v >= LIT_LUMA) lit++;
    if (v - blurred[i] >= 24) points++;
  }
  // `whole`: the mean luma of the whole frame, panels and text included (a panel that comes in darkens it).
  return { lit: lit / free, mean: sum / free, whole: all / mask.length, points: points / free, free: free / mask.length, img, mask };
}

/** Mean absolute luma difference of two frames in the free pane. */
function frameDiff(a, b) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.mask.length; i++) {
    if (!a.mask[i]) continue;
    sum += Math.abs(a.img.data[i] - b.img.data[i]);
    n++;
  }
  return sum / n;
}

const label = (text, width) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="18"><rect width="100%" height="100%" fill="#111"/><text x="4" y="13" font-family="Menlo, monospace" font-size="11" fill="#ddd">${text}</text></svg>`);

/** A contact sheet: the frame on screen at every 100 ms from the navigation to `until`, each with its time. */
async function filmstrip(frames, until, file, thumbWidth) {
  const ticks = [];
  for (let t = 0; t <= until + 100; t += 100) ticks.push(t);
  const first = await sharp(frames[0].jpeg).metadata();
  const thumbHeight = Math.round((thumbWidth * first.height) / first.width);
  const cols = Math.min(ticks.length, thumbWidth > 200 ? 8 : 14);
  const rows = Math.ceil(ticks.length / cols);
  const cellH = thumbHeight + 18;
  const parts = [];
  for (const [i, t] of ticks.entries()) {
    // the last frame presented at or before this time; before the first frame the page is blank
    const frame = frames.findLast((f) => f.t <= t);
    const left = (i % cols) * (thumbWidth + 4);
    const top = Math.floor(i / cols) * (cellH + 4);
    if (frame) parts.push({ input: await sharp(frame.jpeg).resize(thumbWidth, thumbHeight).jpeg({ quality: 82 }).toBuffer(), left, top: top + 18 });
    parts.push({ input: label(`${t} ms${frame ? '' : ' (blank)'}`, thumbWidth), left, top });
  }
  await sharp({ create: { width: cols * (thumbWidth + 4), height: rows * (cellH + 4), channels: 3, background: '#222' } })
    .composite(parts)
    .jpeg({ quality: 85 })
    .toFile(file);
}

async function runOnce(base, pageName, vpName, profileName, saveTo) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: MODES[MODE] });
  try {
    await assertNativeChrome(browser);
    const ctx = await browser.newContext(VIEWPORTS[vpName]);
    const page = await ctx.newPage();
    const consoleLines = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text()}`.slice(0, 300));
    });
    page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`.slice(0, 300)));
    const requests = [];
    page.on('request', (r) => {
      const p = new URL(r.url()).pathname;
      if (/\/data\//.test(p)) requests.push(p);
    });
    await page.addInitScript(observe);
    if (HOLD_GAS > 0) {
      await page.route(/\/data\/theme\/gas-balanced\.[0-9a-f]+\.webp$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, HOLD_GAS));
        await route.continue();
      });
    }
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    if (PROFILES[profileName]) await cdp.send('Network.emulateNetworkConditions', PROFILES[profileName]);
    const priorities = {};
    cdp.on('Network.requestWillBeSent', (e) => {
      try {
        const u = new URL(e.request.url);
        priorities[u.host === new URL(base).host ? u.pathname : u.host] ??= e.request.initialPriority;
      } catch {
        // a data: or blob: address
      }
    });
    const shots = [];
    cdp.on('Page.screencastFrame', (f) => {
      shots.push({ wall: f.metadata.timestamp * 1000, jpeg: Buffer.from(f.data, 'base64') });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
    await page.goto(`${base}${PAGES[pageName]}`, { waitUntil: 'commit', timeout: 120_000 });
    try {
      await page.waitForFunction(() => typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off', null, { timeout: 120_000 });
    } catch (e) {
      // What the page had got to, so a load that never showed the nebula can be explained.
      const state = await page.evaluate(() => ({
        gas: window.__rmr?.gas ?? null,
        webgl: window.__rmr?.getState().webgl ?? null,
        frames: window.__rmr?.frames ?? 0,
        marks: performance.getEntriesByType('mark').map((m) => `${m.name}@${Math.round(m.startTime)}`),
        pending: performance.getEntriesByType('resource').filter((r) => r.responseEnd === 0).map((r) => new URL(r.name).pathname),
        done: performance.getEntriesByType('resource').filter((r) => /\/data\/|chunks/.test(r.name)).map((r) => `${new URL(r.name).pathname.split('/').pop()} ${Math.round(r.startTime)}-${Math.round(r.responseEnd)}`),
      })).catch(() => null);
      throw new Error(`${pageName} ${vpName} ${profileName}: no nebula after 120 s. ${JSON.stringify(state)} console: ${JSON.stringify(consoleLines)}`, { cause: e });
    }
    // the fade, the late stops on /map and anything else that still draws
    await page.waitForTimeout(2000);
    await cdp.send('Page.stopScreencast');
    const info = await page.evaluate(collect);
    const finalPng = await page.screenshot();
    await ctx.close();

    // Frames from before the page's first paint show the blank page the tab started on, not this page.
    const painted = info.paint['first-paint'] ?? 0;
    const frames = shots.map((s) => ({ t: s.wall - info.origin, jpeg: s.jpeg })).filter((f) => f.t >= painted - 4);
    const read = [];
    for (const f of frames) read.push({ t: f.t, ...(await readFrame(f.jpeg, info.covered, info.viewport)) });
    const last = read.at(-1);
    const firstLit = read.find((r) => r.lit >= LIT_SHARE) ?? null;
    // Stars: a quarter of the points the settled picture has.
    const firstStars = last.points > 0 ? (read.find((r) => r.points >= last.points * 0.25) ?? null) : null;
    // Settled: the first frame from which every frame is the settled picture, to within a tenth of the largest
    // change any frame shows against it (and at least 0.25 of a level, the noise of the JPEG frames).
    const diffs = read.map((r) => frameDiff(r, last));
    const tolerance = Math.max(0.25, Math.max(...diffs) * 0.1);
    let settledAt = null;
    for (let i = read.length - 1; i >= 0; i--) {
      if (diffs[i] > tolerance) break;
      settledAt = read[i].t;
    }
    // Frames darker than the one before them, as [time, mean before, mean now].
    const darker = [];
    for (let i = 1; i < read.length; i++) {
      if (read[i].whole <= read[i - 1].whole - 0.75) darker.push([Math.round(read[i].t), Math.round(read[i - 1].whole * 10) / 10, Math.round(read[i].whole * 10) / 10]);
    }
    const round = (v) => (v === null || v === undefined ? null : Math.round(v));
    const dataFiles = requests.filter((p) => /\/data\/(albums|positions|vocab)\.json$|\/data\/theme\//.test(p));
    const duplicates = [...new Set(dataFiles.filter((p, i) => dataFiles.indexOf(p) !== i))];
    const result = {
      page: pageName,
      vp: vpName,
      profile: profileName,
      renderer: info.renderer,
      firstPaint: round(info.paint['first-paint']),
      fcp: round(info.paint['first-contentful-paint']),
      lcp: round(info.lcp?.at),
      lcpWhat: info.lcp?.what ?? null,
      // The search field is hydrated (it takes focus and keystrokes): the first SearchBox's first effect.
      searchReady: round(info.marks['rmr-search-ready']),
      // Search can answer (see the observer above).
      searchIndex: round(info.searchIndex),
      // When the nebula was first drawn, as the page itself notes it (also on builds without the marks).
      nebulaShown: round(info.gasShownMs),
      // Every request: [path or host, start, end, bytes, initiator], and what priority the browser gave it at first.
      waterfall: info.allResources,
      priorities,
      worstLongTask: Math.max(0, ...info.longTasks.map((l) => l[1])),
      marks: Object.fromEntries(Object.entries(info.marks).map(([k, v]) => [k, round(v)])),
      // read from the presented frames
      paneLit: round(firstLit?.t),
      paneStars: round(firstStars?.t),
      paneSettled: round(settledAt),
      freeShare: Math.round(last.free * 100) / 100,
      finalLit: Math.round(last.lit * 1000) / 1000,
      finalMean: Math.round(last.mean * 10) / 10,
      screencastFrames: frames.length,
      darker,
      requests: dataFiles,
      duplicates,
      console: consoleLines,
      resources: info.resources.filter((r) => /\/data\//.test(r.url) || r.bytes > 150_000),
      // per frame: time, share lit, mean luma, share of points (per cent), difference from the settled frame
      trace: read.map((r, i) => [Math.round(r.t), Math.round(r.lit * 1000) / 1000, Math.round(r.mean * 10) / 10, Math.round(r.points * 100000) / 1000, Math.round(diffs[i] * 100) / 100]),
    };
    if (saveTo) {
      fs.mkdirSync(saveTo, { recursive: true });
      const at = (t) => (t === null ? null : frames.find((f) => f.t >= t) ?? null);
      const save = (name, frame) => {
        if (frame) fs.writeFileSync(path.join(saveTo, `${name}-${Math.round(frame.t)}ms.jpg`), frame.jpeg);
      };
      save('1-first-paint', frames[0]);
      save('2-pane-lit', at(firstLit?.t ?? null));
      save('3-stars', at(firstStars?.t ?? null));
      // the canvas once its fade has run (when it is shown before the nebula, this is the stars over the stand-in)
      if (info.marks['rmr-map-shown'] !== null) save('3b-map-shown', at(info.marks['rmr-map-shown'] + 230));
      // (a frame is presented a moment after the mark of the script that drew it)
      save('4-nebula', at(info.marks['rmr-gas-drawn']));
      fs.writeFileSync(path.join(saveTo, '5-settled.png'), finalPng);
      if (frames.length) await filmstrip(frames, Math.min(settledAt ?? last.t, 30_000) + 300, path.join(saveTo, 'filmstrip.jpg'), vpName === 'phone' ? 110 : 260);
    }
    return result;
  } finally {
    await browser.close();
  }
}

const median = (xs) => {
  const s = xs.filter((x) => x !== null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const spread = (xs) => {
  const s = xs.filter((x) => x !== null);
  if (!s.length) return 'n/a';
  return `${median(xs)} (${Math.min(...s)} to ${Math.max(...s)})`;
};

/** Full-resolution PNGs of the stand-in alone: the album list never arrives, so the map never mounts. */
async function stills(base) {
  const dir = STILLS_DIR ? path.join(ROOT, 'test-results/first-frame', STILLS_DIR) : path.join(OUT, 'png');
  fs.mkdirSync(dir, { recursive: true });
  const sizes = { '1440x900': VIEWPORTS.desktop, '390x844': VIEWPORTS.phone, '2560x1440': { viewport: { width: 2560, height: 1440 } } };
  const pages = { ...PAGES, album: '/album/in-rainbows-radiohead' };
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: MODES[MODE] });
  try {
    for (const [sizeName, vp] of Object.entries(sizes)) {
      for (const [pageName, url] of Object.entries(pages)) {
        const ctx = await browser.newContext(vp);
        const page = await ctx.newPage();
        await page.route('**/data/albums.json', () => {});
        await page.goto(`${base}${url}`, { waitUntil: 'commit' });
        await page.waitForSelector('.gas-ph', { timeout: 30_000 });
        // the fonts, the covers of Home's shelf, the album panel's slide
        await page.waitForTimeout(2500);
        const file = path.join(dir, `${pageName}-${sizeName}.png`);
        await page.screenshot({ path: file });
        console.log(path.relative(ROOT, file));
        await ctx.close();
      }
    }
    // And the drawn pages on the large screen, to hold the stand-in against.
    for (const [pageName, url] of Object.entries(PAGES)) {
      const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
      await page.goto(`${base}${url}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off', null, { timeout: 60_000 });
      await page.waitForTimeout(2500);
      const file = path.join(dir, `${pageName}-2560x1440-settled.png`);
      await page.screenshot({ path: file });
      console.log(path.relative(ROOT, file));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = BASE_URL ? { base: BASE_URL, stop: async () => {} } : await startServer(PORT);
  if (STILLS) {
    try {
      await stills(server.base);
    } finally {
      await server.stop();
    }
    return;
  }
  const rows = [];
  try {
    for (const pageName of Object.keys(PAGES)) {
      for (const vpName of Object.keys(VIEWPORTS)) {
        for (const profileName of Object.keys(PROFILES)) {
          if (ONLY && ONLY !== `${pageName}:${vpName}:${profileName}`) continue;
          if (ONLY_PROFILES && !ONLY_PROFILES.includes(profileName)) continue;
          if (ONLY_PAGES && !ONLY_PAGES.includes(pageName)) continue;
          const runs = [];
          for (let i = 0; i < RUNS; i++) {
            // The frames of the first run of every case are kept: the stills and a filmstrip.
            const saveTo = i === 0 ? path.join(OUT, `${pageName}-${vpName}-${profileName}`) : null;
            const r = await runOnce(server.base, pageName, vpName, profileName, saveTo);
            runs.push(r);
            console.log(`${pageName} ${vpName} ${profileName} run ${i + 1}: lit ${r.paneLit}, stars ${r.paneStars}, nebula mark ${r.marks['rmr-gas-drawn']}, settled ${r.paneSettled}; fcp ${r.fcp}, lcp ${r.lcp}; ${r.renderer}`);
          }
          rows.push({ page: pageName, vp: vpName, profile: profileName, runs });
        }
      }
    }
  } finally {
    await server.stop();
  }
  const file = path.join(OUT, ONLY ? `results-${ONLY.replace(/:/g, '-')}.json` : 'results.json');
  fs.writeFileSync(file, JSON.stringify({ label: LABEL, mode: MODE, runs: RUNS, profiles: PROFILES, rows }, null, 1));
  const col = (r, pick) => spread(r.runs.map(pick));
  console.log(`\n${LABEL} (${MODE}; median of ${RUNS}, range in brackets; ms from navigation start)\n`);
  console.log('page vp profile | first paint | FCP | LCP | search field usable | search answers | pane lit (frames) | stars (frames) | map frame (mark) | map shown (mark) | nebula (mark) | settled (frames) | worst long task');
  for (const r of rows) {
    console.log(
      [
        `${r.page} ${r.vp} ${r.profile}`,
        col(r, (x) => x.firstPaint),
        col(r, (x) => x.fcp),
        col(r, (x) => x.lcp),
        col(r, (x) => x.searchReady),
        col(r, (x) => x.searchIndex),
        col(r, (x) => x.paneLit),
        col(r, (x) => x.paneStars),
        col(r, (x) => x.marks['rmr-map-frame']),
        col(r, (x) => x.marks['rmr-map-shown']),
        col(r, (x) => x.marks['rmr-gas-drawn']),
        col(r, (x) => x.paneSettled),
        col(r, (x) => x.worstLongTask),
      ].join(' | '),
    );
  }
  const dips = rows.flatMap((r) => r.runs.flatMap((x, i) => x.darker.map((d) => `${r.page} ${r.vp} ${r.profile} run ${i + 1}: at ${d[0]} ms the frame's mean luma went ${d[1]} -> ${d[2]}`)));
  console.log(dips.length ? `\nFrames darker than the one before:\n${dips.join('\n')}` : '\nNo frame was darker than the one before it.');
  const dup = rows.flatMap((r) => r.runs.flatMap((x) => x.duplicates.map((d) => `${r.page} ${r.vp} ${r.profile}: ${d}`)));
  console.log(dup.length ? `\nRequested more than once:\n${[...new Set(dup)].join('\n')}` : '\nNo data file or nebula image was requested twice.');
  const lines = rows.flatMap((r) => r.runs.flatMap((x) => x.console.map((c) => `${r.page} ${r.vp} ${r.profile}: ${c}`)));
  console.log(lines.length ? `\nConsole warnings and errors:\n${[...new Set(lines)].join('\n')}` : 'No console warnings or errors.');
  console.log(`\nRenderer: ${[...new Set(rows.flatMap((r) => r.runs.map((x) => x.renderer)))].join('; ')}`);
  console.log(`Written to ${path.relative(ROOT, OUT)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
