#!/usr/bin/env node
/**
 * node scripts/perf/first-frame.mjs --label <name>: how long a cold load takes to put a picture in the map pane.
 * Reported only, no budgets. It measures the production build (run `npm run build` first) on `next start`.
 *
 * For Home and /map, at 1440 x 900 and at 390 x 844 (device pixel ratio 2, touch), with no throttling and with a
 * slow connection, each `--runs` times (3) in a fresh browser with an empty cache, it records:
 *   - the page's own marks (src/lib/marks.ts), first paint, first and largest contentful paint, search usable,
 *     long tasks, and every request for a data file, a nebula image or the map's code;
 *   - a screencast (the frames the browser presented, each with its time), from which it reads when the map pane
 *     first showed anything but the empty sky ("lit"), when stars first showed, and when the picture stopped
 *     changing. The pane is read only where no panel, header or text lies over it.
 * Output goes to test-results/first-frame/<label>/: results.json, one filmstrip per page and viewport (a frame
 * every 100 ms of the slow load), and the frames at first light, first stars, first nebula and the settled page.
 *
 * Options: --label <name> (required), --runs <n>, --mode gpu|software (gpu: the installed Chrome on Metal, as
 * `npm run perf`; software: SwiftShader), --only <page>:<viewport>:<profile> (for a single case), --port <n>.
 *
 * The slow profile is Lighthouse's "slow 4G" as DevTools applies it to each request: 562.5 ms added latency,
 * 1474.56 kbit/s down, 675 kbit/s up (lighthouse/core/config/constants.js, throttling.mobileSlow4G).
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
  slow4g: { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 },
};

/** Luma (0 to 255) above which a pixel is not the empty sky (#07060a is about 6.5; JPEG noise adds a few). */
const LIT_LUMA = 16;
/** Share of the free pane that must be lit for the pane to count as showing a picture. */
const LIT_SHARE = 0.02;

/** Runs in the page before its scripts: paint, largest contentful paint and long tasks, kept for the end. */
function observe() {
  const w = window;
  w.__ff = { paint: {}, lcp: null, lt: [] };
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
  // Where no panel, header or text lies over the pane: the pane is read only outside these rectangles.
  const pad = { '.hero': 90, '.shelf': 40, '.shelf-now': 40 };
  const covered = [];
  for (const sel of ['header.top', '.hero', '.shelf', '.mode', '.map-zoom', '.map-hint', '.map-explore', '.card', '.map-msg', '.about']) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const p = pad[sel] ?? 12;
      covered.push([r.left - p, r.top - p, r.right + p, r.bottom + p]);
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
  const { data, info } = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true });
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

/** What a frame shows in the free pane: the share of lit pixels, the mean luma, and how many pixels stand out of
 * their surroundings as points (stars): brighter by 28 or more than the mean of the 9 x 9 px around them. */
async function readFrame(jpeg, covered, viewport) {
  const img = await lumaOf(jpeg);
  const blurred = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 1 } }).blur(4).raw().toBuffer();
  const mask = freeMask(img.width, img.height, covered, viewport);
  let free = 0;
  let lit = 0;
  let sum = 0;
  let points = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    free++;
    const v = img.data[i];
    sum += v;
    if (v >= LIT_LUMA) lit++;
    if (v - blurred[i] >= 28) points++;
  }
  return { lit: lit / free, mean: sum / free, points: points / free, free: free / mask.length, img, mask };
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
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    if (PROFILES[profileName]) await cdp.send('Network.emulateNetworkConditions', PROFILES[profileName]);
    const shots = [];
    cdp.on('Page.screencastFrame', (f) => {
      shots.push({ wall: f.metadata.timestamp * 1000, jpeg: Buffer.from(f.data, 'base64') });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
    await page.goto(`${base}${PAGES[pageName]}`, { waitUntil: 'commit', timeout: 120_000 });
    await page.waitForFunction(() => typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off', null, { timeout: 120_000 });
    // the fade, the late stops on /map and anything else that still draws
    await page.waitForTimeout(2000);
    await cdp.send('Page.stopScreencast');
    const info = await page.evaluate(collect);
    const finalPng = await page.screenshot();
    await ctx.close();

    const frames = shots.map((s) => ({ t: s.wall - info.origin, jpeg: s.jpeg })).filter((f) => f.t >= 0);
    const read = [];
    for (const f of frames) read.push({ t: f.t, ...(await readFrame(f.jpeg, info.covered, info.viewport)) });
    const last = read.at(-1);
    const firstLit = read.find((r) => r.lit >= LIT_SHARE) ?? null;
    // Stars: a quarter of the points the settled picture has.
    const firstStars = read.find((r) => r.points >= last.points * 0.25) ?? null;
    // The picture is the settled one from the first frame after which no frame differs from the last by more than 2.
    let settledAt = null;
    for (let i = read.length - 1; i >= 0; i--) {
      if (frameDiff(read[i], last) > 2) break;
      settledAt = read[i].t;
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
      searchReady: round(info.marks['rmr-search-ready']),
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
      requests: dataFiles,
      duplicates,
      console: consoleLines,
      resources: info.resources.filter((r) => /\/data\//.test(r.url) || r.bytes > 150_000),
      trace: read.map((r) => [Math.round(r.t), Math.round(r.lit * 1000) / 1000, Math.round(r.mean * 10) / 10, Math.round(r.points * 100000) / 1000]),
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer(PORT);
  const rows = [];
  try {
    for (const pageName of Object.keys(PAGES)) {
      for (const vpName of Object.keys(VIEWPORTS)) {
        for (const profileName of Object.keys(PROFILES)) {
          if (ONLY && ONLY !== `${pageName}:${vpName}:${profileName}`) continue;
          const runs = [];
          for (let i = 0; i < RUNS; i++) {
            // The frames of the first run are kept: of the slow load for the filmstrip, of the fast one for the stills.
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
  console.log('page vp profile | first paint | FCP | LCP | search usable | pane lit | stars (frames) | map frame (mark) | nebula (mark) | settled (frames) | worst long task');
  for (const r of rows) {
    console.log(
      [
        `${r.page} ${r.vp} ${r.profile}`,
        col(r, (x) => x.firstPaint),
        col(r, (x) => x.fcp),
        col(r, (x) => x.lcp),
        col(r, (x) => x.searchReady),
        col(r, (x) => x.paneLit),
        col(r, (x) => x.paneStars),
        col(r, (x) => x.marks['rmr-map-frame']),
        col(r, (x) => x.marks['rmr-gas-drawn']),
        col(r, (x) => x.paneSettled),
        col(r, (x) => x.worstLongTask),
      ].join(' | '),
    );
  }
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
