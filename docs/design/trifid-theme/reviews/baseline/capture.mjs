#!/usr/bin/env node
/**
 * Baseline screenshot capture: saves the SAME named states every run, so the site can be compared like for like
 * before and after the Trifid retheme. It changes nothing in the app.
 *
 * Run from `frontcreck/` (Playwright is resolved from that directory) with arm64 Node, against a PRODUCTION build:
 *
 *   export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch     # must print arm64
 *   cd frontcreck && npm ci && npm run build
 *   node ../docs/design/trifid-theme/reviews/baseline/capture.mjs \
 *        ../docs/design/trifid-theme/reviews/baseline/shots http://127.0.0.1:3400 --start
 *
 * Arguments: <outDir> <baseURL> [--start] [--viewport desktop|phone|both] [--mode gpu|software] [--only <text>]
 *            [--gas full|lighter] [--open whole|app]
 *   --start      starts `next start` on the base URL's port for the run and stops it afterwards. Without it the
 *                script expects a server that is already answering at <baseURL> (`npx next start --port 3400`).
 *   --viewport   desktop (1440 x 900), phone (390 x 844, dpr 2, mobile, touch) or both (default).
 *   --mode       gpu (default: headless Google Chrome on Metal, what visitors see) or software (Playwright's own
 *                Chromium on SwiftShader, what the e2e tests use).
 *   --only       capture only states whose name contains <text> (for example --only album-open).
 *   --gas        which gas shader the themed app draws with: full (default: what a GPU draws and what the review
 *                notes describe; asked for explicitly, because on a software renderer the app would choose its
 *                lighter shader by itself) or lighter (to capture that one on purpose). It sets
 *                window.__rmrGasLite before the app loads and means nothing to a build without the gas.
 *   --open       where /map opens: whole (default: the whole cloud, as the site opened when the baseline was
 *                captured, so every baseline-named shot keeps its framing; it sets window.__rmrOpen before the app
 *                loads and means nothing to a build from before part 2's Task 0) or app (the app's own opening
 *                view, the Overview since Task 0). The state `map-opening` always uses the app's own opening view.
 *
 * Output: <outDir>/desktop/*.jpg|png, <outDir>/phone/*.jpg|png and <outDir>/capture-log-<viewport>.json (what was
 * captured, what failed, and the camera at each shot). JPEG quality 90; tight crops are PNG. An --only run writes
 * capture-log-<viewport>.only.json instead, so it never overwrites a full run's log.
 *
 * Determinism: albums are fixed by id (ALBUMS below), zoom steps use the app's own controls (the fly-to used by a
 * map pick, the Zoom in / Zoom out / Reset buttons), every state starts in a fresh browser context, and waits use
 * the app's readiness signals (`window.__rmr.map`, `window.__rmr.frames`, `map.isAnimating()`, cover load state,
 * finished CSS animations), as the e2e helpers do. The text caret is hidden so its blink cannot differ.
 * The exceptions are named in README.md (`slider-mid` is a timed frame; covers come from Spotify's image server).
 *
 * After the retheme: selectors live in SEL below. If a class name changes, change it there only.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
let chromium;
try {
  ({ chromium } = require('@playwright/test'));
} catch {
  console.error('Run this from frontcreck/ after npm ci: @playwright/test was not found from ' + CWD);
  process.exit(2);
}

const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--start') flags.start = true;
  else if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
if (positional.length < 2) {
  console.error('usage: node capture.mjs <outDir> <baseURL> [--start] [--viewport desktop|phone|both] [--mode gpu|software] [--only text] [--gas full|lighter] [--open whole|app]');
  process.exit(2);
}
const OUT = path.resolve(positional[0]);
const BASE = positional[1].replace(/\/$/, '');
const MODE = flags.mode ?? 'gpu';
const ONLY = flags.only ?? '';
const WHICH = flags.viewport ?? 'both';
const GAS = flags.gas ?? 'full';
if (GAS !== 'full' && GAS !== 'lighter') {
  console.error('--gas takes full or lighter');
  process.exit(2);
}
const OPEN = flags.open ?? 'whole';
if (OPEN !== 'whole' && OPEN !== 'app') {
  console.error('--open takes whole or app');
  process.exit(2);
}

const LAUNCH = {
  gpu: { channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'] },
  software: { headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
};
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Fixed albums (ids are positions in public/data/albums.json). */
const ALBUMS = {
  /** In Rainbows: the album the repo's own review shots and perf script use. */
  main: { id: 11, slug: 'in-rainbows-radiohead' },
  /** Milestones: sits in one of the densest spots of the balanced layout (15 other covers within one cover width). */
  dense: { id: 1158, slug: 'milestones-miles-davis' },
};

const SEL = {
  canvas: 'canvas.map-canvas',
  heroInput: '.hero input',
  headerInput: '.top-search input',
  option: '[role="option"]',
  empty: '.combo-empty',
  homeScroll: '.home',
  shelfLink: '.mosaic a',
  zoomIn: '.map-zoom button[aria-label="Zoom in"]',
  zoomOut: '.map-zoom button[aria-label="Zoom out"]',
  reset: '.map-zoom button[aria-label="Reset view"]',
  tip: '.map-tip',
  tipTitle: '.map-tip .t',
  card: '.card',
  marker: '.mk',
  recMarker: '.mk--rec',
  recRow: 'a.rec-main',
  recList: 'ol.rec-list',
  seedTitle: '#seed-title',
  showMore: '.show-more',
  stops: '.mode-stops button',
  slider: '.mode',
  trail: 'nav.trail',
  copyLink: '.icon-quiet',
  toast: '.toast.show',
  surprise: '.hero-row button.textbtn',
  mapError: '.map-msg[role="alert"]',
  noWebgl: '.map-msg',
  fab: '.fab-map',
  strip: '.strip',
  searchToggle: '.search-toggle',
  sheetInput: '.search-sheet input',
  albumScroll: '.album-scroll',
};

/* ---------- waits (the app's own readiness signals; mirrors frontcreck/e2e/helpers.ts) ---------- */

const warn = (name, what) => (e) => console.warn(`  [${name}] ${what}: ${String(e.message).split('\n')[0]}`);

const mapReady = (p) => p.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 30000 });

async function mapQuiet(p, quietMs = 250) {
  await p.waitForFunction(
    (quiet) => {
      const w = window;
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (w.__capF !== f) {
        w.__capF = f;
        w.__capT = now;
        return false;
      }
      return now - (w.__capT ?? now) >= quiet;
    },
    quietMs,
    { polling: 40, timeout: 20000 },
  );
}

/** Part 1's sharper gas image has settled: its flag is not 'loading' and neither it nor the frame count changed for
 * `quietMs` (longer than a failed load's 2 s retry wait). A build with no gas layer (gas absent or 'off') is settled
 * at once. Mirrors frontcreck/e2e/helpers.ts waitForGasSharpSettled. */
const sharpSettled = (p, quietMs = 2500) =>
  p.waitForFunction(
    (quiet) => {
      const g = window.__rmr?.gas;
      if (g === undefined || g === 'off') return true;
      const w = window;
      const s = String(window.__rmr?.gasSharp);
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (s === 'loading' || w.__capSF !== f || w.__capSS !== s) {
        w.__capSF = f;
        w.__capSS = s;
        w.__capST = now;
        return false;
      }
      return now - (w.__capST ?? now) >= quiet;
    },
    quietMs,
    { polling: 50, timeout: 45000 },
  );

async function cameraIdle(p) {
  await p.waitForFunction(() => window.__rmr?.map && !window.__rmr.map.isAnimating(), null, { timeout: 20000 });
  await mapQuiet(p, 250);
}

const animationsDone = (p) =>
  p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity), null, { timeout: 10000 });

const coversSettled = (p) =>
  p.waitForFunction(
    () =>
      [...document.querySelectorAll('.cover')].every((c) => {
        const r = c.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || r.width === 0) return true; // off screen or not rendered
        if (c.checkVisibility && !c.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) return true; // the hidden phone list
        const s = c.dataset.state;
        if (s === 'tile') return true;
        if (s === 'sprite') return !!c.querySelector('.spr');
        const img = c.querySelector('img.ok');
        return !!img && getComputedStyle(img).opacity === '1';
      }),
    null,
    { timeout: 12000 },
  );

/** Everything has stopped moving and loading. `map: false` for a state where the map never draws. */
async function settle(p, name, { map = true } = {}) {
  await p.evaluate(() => document.fonts.ready);
  if (map) {
    await mapReady(p);
    await cameraIdle(p).catch(warn(name, 'camera still moving'));
  }
  await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(warn(name, 'network not idle'));
  await animationsDone(p).catch(warn(name, 'CSS animations still running'));
  await coversSettled(p).catch(warn(name, 'a cover image did not finish loading'));
  if (map) await mapQuiet(p, 300).catch(warn(name, 'map still drawing'));
  // A shot at rest must not catch the sharper gas image's fade (up to 14 frames about a second after the map
  // settles; at the Overview it is wanted from the first view on a GPU).
  if (map) await sharpSettled(p).catch(warn(name, 'sharper gas image still changing'));
}

/* ---------- small actions ---------- */

const pt = (p, id) => p.evaluate((i) => window.__rmr.map.screenPoint(i), id);
const cam = (p) => p.evaluate(() => (window.__rmr?.map ? window.__rmr.map.getCamera() : null)).catch(() => null);

async function go(p, url) {
  await p.goto(`${BASE}${url}`, { waitUntil: 'load' });
  await p.addStyleTag({ content: '* { caret-color: transparent !important; }' });
}

/** The fly-to a map pick uses (centres the album and zooms until covers show), without selecting it. */
async function flyTo(p, id) {
  await p.evaluate((i) => window.__rmr.map.flyTo(i), id);
  await cameraIdle(p);
}

/** A real click or tap on an album's centre: selects it in Explore (card, frame, fly-to). */
async function pick(p, id, phone) {
  const at = await pt(p, id);
  if (phone) await p.touchscreen.tap(at.x, at.y);
  else await p.mouse.click(at.x, at.y);
  await p.waitForFunction((i) => window.__rmr.getState().selected === i, id, { timeout: 5000 });
  await p.locator(SEL.card).waitFor();
  await cameraIdle(p);
}

async function press(p, selector, times = 1, phone = false) {
  for (let i = 0; i < times; i++) {
    if (phone) await p.locator(selector).tap();
    else await p.locator(selector).click();
    await cameraIdle(p);
  }
}

/** A key on the map canvas (the app's own keys: + and - zoom by 1.4x, arrows pan 70 px, 0 resets). */
async function mapKey(p, key, times = 1) {
  await p.locator(SEL.canvas).focus();
  for (let i = 0; i < times; i++) {
    await p.keyboard.press(key);
    await cameraIdle(p);
  }
  await p.evaluate(() => document.activeElement?.blur()); // no focus ring in the shot
}

async function hoverAlbum(p, id) {
  const at = await pt(p, id);
  await p.mouse.move(at.x - 40, at.y - 30);
  await p.mouse.move(at.x, at.y, { steps: 5 });
  await p.waitForFunction(([s, t]) => !!document.querySelector(s)?.textContent && getComputedStyle(document.querySelector(t)).opacity === '1', [SEL.tipTitle, SEL.tip], { timeout: 5000 });
  await mapQuiet(p, 250);
  return at;
}

async function type(p, selector, text) {
  await p.locator(selector).click();
  await p.locator(selector).pressSequentially(text);
}

const around = (at, w, h = w) => ({ x: at.x - w / 2, y: at.y - h / 2, width: w, height: h });

async function boxOf(p, selector, pad = 24) {
  const b = await p.evaluate((s) => {
    const rs = [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (!rs.length) return null;
    return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
  }, selector);
  if (!b) throw new Error(`nothing visible matches ${selector}`);
  return { x: b.l - pad, y: b.t - pad, width: b.r - b.l + 2 * pad, height: b.b - b.t + 2 * pad };
}

/** Presses Tab until the focused element matches `selector` (and shows :focus-visible). */
async function tabTo(p, selector, max = 60) {
  for (let i = 0; i < max; i++) {
    await p.keyboard.press('Tab');
    if (await p.evaluate((s) => !!document.activeElement?.matches(s), selector)) return;
  }
  throw new Error(`could not reach ${selector} with Tab`);
}

/* ---------- states ----------
 * Each state gets a fresh context. `s.shot(name)` saves the viewport as JPEG; `s.crop(name, box)` saves a PNG crop.
 * `on`: 'desktop', 'phone' or 'both'. */

const STATES = [
  {
    name: 'home', on: 'both',
    async run(p, s) {
      await go(p, '/');
      await settle(p, 'home');
      await s.shot('home-top');
      await p.locator(SEL.homeScroll).evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await settle(p, 'home');
      await s.shot('home-shelf');
      if (s.phone) return;
      // The shelf names the cover under the pointer in the line above it, and un-dims that cover.
      await p.locator(SEL.shelfLink).nth(2).hover();
      await animationsDone(p);
      await s.shot('home-shelf-hover');
    },
  },
  {
    name: 'map-zoom-steps', on: 'both',
    async run(p, s) {
      await go(p, '/map');
      await settle(p, 'map');
      await s.shot('map-overview'); // the default view: the whole cloud fitted
      await press(p, SEL.zoomOut, 2, s.phone); // the floor is 0.8x the fitted overview; the second press is a no-op
      await settle(p, 'map');
      await s.shot('map-whole');
      await press(p, SEL.reset, 1, s.phone);
      await flyTo(p, ALBUMS.main.id); // covers fully shown (32 CSS px)
      await settle(p, 'map');
      await s.shot('map-covers');
      await s.crop('map-covers-crop', around(await pt(p, ALBUMS.main.id), s.phone ? 300 : 420));
      await mapKey(p, '-'); // 1.4x out with the keyboard: covers about 23 px, 40% through the dot to cover cross-fade
      await settle(p, 'map');
      await s.shot('map-covers-fade');
      await s.crop('map-covers-fade-crop', around(await pt(p, ALBUMS.main.id), s.phone ? 300 : 420));
      await mapKey(p, '+');
      await press(p, SEL.zoomIn, 1, s.phone); // 1.6x in from the fly-to zoom
      await settle(p, 'map');
      await s.shot('map-covers-in1');
      await press(p, SEL.zoomIn, 1, s.phone); // 2.56x in: covers at their 64 px cap
      await settle(p, 'map');
      await s.shot('map-covers-in2');
      await press(p, SEL.zoomIn, 6, s.phone); // to the zoom ceiling
      await settle(p, 'map');
      await s.shot('map-max-zoom');
    },
  },
  {
    // The map as a visitor opens it since part 2's Task 0: the Overview (compare with options/final-overview.jpg),
    // then the fit button's Whole map, which must be the framing of the baseline's `map-overview`. Not in the
    // baseline. Always the app's own opening view, whatever --open says.
    name: 'map-opening', on: 'both', open: 'app',
    async run(p, s) {
      await go(p, '/map');
      await settle(p, 'map');
      await s.shot('map-opening');
      await press(p, SEL.reset, 1, s.phone);
      await settle(p, 'map');
      await s.shot('map-opening-fit');
    },
  },
  {
    name: 'map-dense', on: 'both',
    async run(p, s) {
      const id = ALBUMS.dense.id;
      const size = s.phone ? 300 : 420;
      await go(p, '/map');
      await settle(p, 'map');
      await flyTo(p, id);
      await settle(p, 'map');
      await s.shot('map-covers-dense');
      await s.crop('map-covers-dense-crop', around(await pt(p, id), size));
      await mapKey(p, '-'); // mid cross-fade: half-transparent, part dot part cover
      await settle(p, 'map');
      await s.shot('map-covers-dense-fade');
      await s.crop('map-covers-dense-fade-crop', around(await pt(p, id), size));
      await mapKey(p, '+');
      await press(p, SEL.zoomIn, 2, s.phone);
      await settle(p, 'map');
      await s.shot('map-covers-dense-in2');
      await s.crop('map-covers-dense-in2-crop', around(await pt(p, id), size));
      // A pick in the dense spot: the other covers drop to half alpha and show through each other.
      await press(p, SEL.zoomOut, 2, s.phone);
      await pick(p, id, s.phone);
      await settle(p, 'map');
      await s.shot('selected-dense');
      await s.crop('selected-dense-crop', around(await pt(p, id), size));
    },
  },
  {
    name: 'selected', on: 'both',
    async run(p, s) {
      const id = ALBUMS.main.id;
      await go(p, '/map');
      await settle(p, 'map');
      await flyTo(p, id);
      await pick(p, id, s.phone);
      await settle(p, 'map');
      await s.shot('selected-cover-frame'); // large cover, lamp frame, the card, other covers dimmed
      await s.crop('selected-cover-frame-crop', around(await pt(p, id), 260));
      // Back to dots, where the DOM ring marks the pick. On phones the card covers the zoom buttons, so the keys do it.
      if (s.phone) await mapKey(p, '-', 6);
      else await press(p, SEL.zoomOut, 4, false);
      await settle(p, 'map');
      await s.shot('selected-dot-ring');
      await s.crop('selected-dot-ring-crop', around(await pt(p, id), 200));
      await s.crop('map-card-crop', await boxOf(p, SEL.card, 16));
    },
  },
  {
    name: 'hover-map', on: 'desktop',
    async run(p, s) {
      const id = ALBUMS.main.id;
      await go(p, '/map');
      await settle(p, 'map');
      let at = await hoverAlbum(p, id); // dot mode: ring round the dot, tip beside it
      await coversSettled(p).catch(warn('hover', 'tip cover'));
      await s.shot('hover-map-album');
      await s.crop('hover-map-album-crop', { x: at.x - 140, y: at.y - 110, width: 420, height: 220 });
      await p.mouse.move(5, 450);
      await flyTo(p, id);
      await settle(p, 'map');
      at = await hoverAlbum(p, id); // cover mode: square stroke round the cover
      await coversSettled(p).catch(warn('hover', 'tip cover'));
      await s.shot('hover-map-cover');
      await s.crop('hover-map-cover-crop', { x: at.x - 140, y: at.y - 110, width: 420, height: 220 });
      // Near the top right corner the tip flips to the left of the album and below it to stay on screen.
      await p.mouse.move(5, 450);
      await p.evaluate((i) => {
        const api = window.__rmr.map;
        const a = api.screenPoint(i);
        const top = document.querySelector('#stage').getBoundingClientRect().top;
        api.panBy(-(innerWidth - 30 - a.x), -(a.y - (top + 24)));
      }, id);
      await cameraIdle(p);
      const edge = await pt(p, id);
      if (edge && edge.x < 1440 && edge.y < 900) {
        await hoverAlbum(p, id).catch(warn('hover', 'edge hover'));
        await s.shot('hover-map-edge');
      }
    },
  },
  {
    name: 'album-open', on: 'both',
    async run(p, s) {
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      if (s.phone) {
        await settle(p, 'album');
        await s.shot('album-list'); // the phone album view is the list
        await p.locator(SEL.albumScroll).evaluate((el) => el.scrollTo(0, 420));
        await settle(p, 'album');
        await s.shot('album-list-scrolled');
        await p.locator(SEL.strip).scrollIntoViewIfNeeded();
        await p.locator(SEL.albumScroll).evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await settle(p, 'album');
        await p.waitForTimeout(400); // the strip draws its own small canvas once it is on screen
        await s.shot('album-list-strip');
        await s.crop('album-list-strip-crop', await boxOf(p, SEL.strip, 8));
        await p.locator(SEL.albumScroll).evaluate((el) => el.scrollTo(0, 0));
        await p.locator(SEL.fab).tap();
        await p.locator(SEL.marker).first().waitFor();
        await settle(p, 'album');
        await s.shot('album-mapmode'); // full map, slider panel at the bottom, List button
        await s.crop('album-mapmode-crop', await boxOf(p, SEL.marker, 28));
        await s.crop('slider-crop', await boxOf(p, SEL.slider, 8));
        return;
      }
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      await s.shot('album-open');
      await s.crop('album-open-crop', await boxOf(p, SEL.marker, 28)); // lines, frames, rank badges
      await s.crop('album-panel-crop', { x: 0, y: 0, width: 520, height: 900 });
      await s.crop('slider-crop', await boxOf(p, SEL.slider, 8));
      await p.locator(SEL.showMore).click(); // ten rows and ten markers
      await settle(p, 'album');
      await s.shot('album-open-more');
      await s.crop('album-open-more-crop', await boxOf(p, SEL.marker, 28));
    },
  },
  {
    name: 'album-dense', on: 'both',
    async run(p, s) {
      await go(p, `/album/${ALBUMS.dense.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      if (s.phone) {
        await settle(p, 'album');
        await p.locator(SEL.fab).tap();
      }
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      await s.shot('album-open-dense');
      await s.crop('album-open-dense-crop', await boxOf(p, SEL.marker, 28));
    },
  },
  {
    name: 'album-long-title', on: 'both',
    async run(p, s) {
      await go(p, '/album/the-rise-and-fall-of-ziggy-stardust-and-the-spiders-from-mars-david-bowie');
      await p.locator(SEL.recRow).first().waitFor();
      await settle(p, 'album');
      await s.shot('album-long-title');
    },
  },
  {
    name: 'hover-album', on: 'desktop',
    async run(p, s) {
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      // A neighbour's cover on the map: markers take no pointer events, the canvas hit-tests their boxes.
      const b = await p.locator(SEL.recMarker).nth(1).boundingBox();
      await p.mouse.move(b.x - 60, b.y - 60);
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
      await p.waitForFunction(() => window.__rmr.getState().hot !== null, null, { timeout: 5000 });
      await mapQuiet(p, 250);
      await animationsDone(p);
      await s.shot('hover-neighbour'); // marker frame, line, badge, list row and shared mood words light up
      await s.crop('hover-neighbour-crop', await boxOf(p, SEL.marker, 28));
      // A row in the list: the same link the other way round.
      await p.mouse.move(700, 880);
      await p.locator(SEL.recRow).nth(3).hover();
      await p.waitForFunction(() => window.__rmr.getState().hot !== null, null, { timeout: 5000 });
      await mapQuiet(p, 250);
      await animationsDone(p);
      await s.shot('hover-list-row');
      await s.crop('hover-list-row-crop', await boxOf(p, SEL.marker, 28));
      // A map album that is not a neighbour: tip and hover mark over the dimmed field.
      const far = await p.evaluate(() => {
        const api = window.__rmr.map;
        const f = window.__rmr.getState().focus;
        const taken = new Set([f.seed, ...f.recs]);
        const boxes = [...document.querySelectorAll('.mk')].map((e) => e.getBoundingClientRect());
        for (let id = 0; id < 4081; id++) {
          if (taken.has(id)) continue;
          const q = api.screenPoint(id);
          if (!q || q.x < 620 || q.y < 300 || q.x > innerWidth - 200 || q.y > innerHeight - 160) continue;
          if (boxes.some((r) => q.x > r.left - 30 && q.x < r.right + 30 && q.y > r.top - 30 && q.y < r.bottom + 30)) continue;
          if (document.elementFromPoint(q.x, q.y)?.classList.contains('map-canvas')) return id;
        }
        return null;
      });
      if (far !== null) {
        await p.mouse.move(700, 880);
        const at = await hoverAlbum(p, far);
        await coversSettled(p).catch(warn('hover', 'tip cover'));
        s.note('hover-album-other', { id: far });
        await s.shot('hover-album-other');
        await s.crop('hover-album-other-crop', { x: at.x - 140, y: at.y - 110, width: 420, height: 220 });
      }
    },
  },
  {
    name: 'focus-rings', on: 'desktop',
    async run(p, s) {
      const ring = async (name, selector, pad = 36) => {
        await tabTo(p, selector);
        await animationsDone(p);
        await mapQuiet(p, 200).catch(() => {});
        await s.shot(name);
        const b = await p.evaluate(() => {
          const r = document.activeElement.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        });
        const big = b.width > 700; // the canvas: crop a corner of its inset ring instead of the whole map
        await s.crop(`${name}-crop`, big ? { x: b.x, y: b.y, width: 360, height: 240 } : { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad });
      };
      await go(p, '/map');
      await settle(p, 'map');
      await ring('focus-skip-link', '.skip');
      await ring('focus-wordmark', '.wordmark');
      await ring('focus-search', SEL.headerInput);
      await ring('focus-header-link', '.navbtn');
      await ring('focus-map-canvas', SEL.canvas);
      await ring('focus-slider', '.mode input[type=range]');
      await ring('focus-zoom-button', '.map-zoom button');
      // The card's controls (Explore pick).
      await flyTo(p, ALBUMS.main.id);
      await pick(p, ALBUMS.main.id, false);
      await settle(p, 'map');
      await ring('focus-card-primary', '.card .btn-lamp');
      await ring('focus-card-close', '.card .x');
      // The album panel's controls.
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      await ring('focus-panel-close', '.album-close');
      await ring('focus-panel-spotify', '.seed-actions .btn-lamp');
      await ring('focus-panel-copy', SEL.copyLink);
      await ring('focus-panel-control', SEL.recRow); // a list row: inset ring, and its map marker lights up
      await ring('focus-panel-row-spotify', '.rec-sp');
      await ring('focus-panel-show-more', SEL.showMore);
      await ring('focus-explore-here', '.map-explore');
      // Home: the hero search takes focus on load (desktop); a shelf cover un-dims on focus.
      await go(p, '/');
      await settle(p, 'home');
      await s.shot('focus-home-search');
      await ring('focus-home-explore', '.hero-row a.textbtn');
      await ring('focus-home-shelf', SEL.shelfLink);
    },
  },
  {
    name: 'search', on: 'both',
    async run(p, s) {
      await go(p, '/');
      await settle(p, 'home');
      await type(p, SEL.heroInput, 'radiohead');
      await p.locator(SEL.option).first().waitFor();
      await p.keyboard.press('ArrowDown');
      await settle(p, 'home');
      await s.shot('search-suggestions');
      await s.crop('search-suggestions-crop', await boxOf(p, '.hero .combo', 16));
      await p.locator(SEL.heroInput).fill('');
      await type(p, SEL.heroInput, 'zzkq');
      await p.locator(SEL.empty).waitFor();
      await settle(p, 'home');
      await s.shot('search-none');
      // A typo: the fuzzy step still finds the album.
      await p.locator(SEL.heroInput).fill('');
      await type(p, SEL.heroInput, 'lovelss');
      await p.locator(`${SEL.option}, ${SEL.empty}`).first().waitFor();
      await p.waitForTimeout(400);
      await settle(p, 'home');
      await s.shot('search-typo');
      // The header field (desktop) or the search sheet (phone), over the map.
      await go(p, '/map');
      await settle(p, 'map');
      if (s.phone) {
        await p.locator(SEL.searchToggle).tap();
        await p.locator(SEL.sheetInput).waitFor();
        await animationsDone(p);
        await s.shot('search-sheet-empty');
        await p.locator(SEL.sheetInput).pressSequentially('radiohead');
        await p.locator(SEL.option).first().waitFor();
        await settle(p, 'map');
        await s.shot('search-sheet');
        await p.locator(SEL.sheetInput).fill('');
        await p.locator(SEL.sheetInput).pressSequentially('zzkq');
        await p.locator(SEL.empty).waitFor();
        await settle(p, 'map');
        await s.shot('search-sheet-none');
      } else {
        await type(p, SEL.headerInput, 'in rain');
        await p.locator(SEL.option).first().waitFor();
        await p.keyboard.press('ArrowDown');
        await settle(p, 'map');
        await s.shot('search-header-suggestions');
        await s.crop('search-header-suggestions-crop', await boxOf(p, '.top-search .combo', 16));
      }
    },
  },
  {
    name: 'slider', on: 'both',
    async run(p, s) {
      const stop = async (label) => {
        const b = p.locator(SEL.stops, { hasText: label });
        if (s.phone) await b.tap();
        else await b.click();
      };
      const list = () => p.evaluate(() => [...document.querySelectorAll('ol.rec-list .rec-title')].map((e) => e.textContent).join('|'));
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      if (s.phone) {
        await settle(p, 'album');
        await p.locator(SEL.fab).tap();
      }
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      await s.shot('slider-balanced');
      const before = await list();
      await stop('Sonic');
      await p.waitForFunction((b) => [...document.querySelectorAll('ol.rec-list .rec-title')].map((e) => e.textContent).join('|') !== b, before);
      await p.waitForURL(/by=sonic/);
      await settle(p, 'album');
      await s.shot('slider-sonic');
      await s.crop('slider-sonic-crop', await boxOf(p, SEL.slider, 8));
      await stop('Mood');
      await p.waitForURL(/by=mood/);
      await settle(p, 'album');
      await s.shot('slider-mood');
      // One frame mid-move (the morph is 520 ms; rows reorder over 420 ms). Timed, so only roughly repeatable.
      await stop('Sonic');
      await p.waitForTimeout(170);
      await s.shot('slider-mid');
      await settle(p, 'album');
      // Keyboard: the range input steps one stop per arrow key.
      if (!s.phone) {
        await p.locator('.mode input[type=range]').focus();
        await p.keyboard.press('ArrowRight');
        await p.waitForFunction(() => window.__rmr.getState().stop === 'balanced');
        await settle(p, 'album');
        await s.shot('slider-keyboard-balanced');
      }
      // The whole map at each stop (Explore).
      await go(p, '/map');
      await settle(p, 'map');
      await stop('Sonic');
      await settle(p, 'map');
      await s.shot('map-overview-sonic');
      await stop('Mood');
      await settle(p, 'map');
      await s.shot('map-overview-mood');
    },
  },
  {
    name: 'trail', on: 'both',
    async run(p, s) {
      const seen = new Set([`/album/${ALBUMS.main.slug}`]);
      // The first row not yet visited: visiting an album already on the trail would cut the trail back to it.
      const next = async () => {
        const before = p.url();
        const hrefs = await p.locator(SEL.recRow).evaluateAll((els) => els.map((e) => new URL(e.href).pathname));
        const n = hrefs.findIndex((h) => !seen.has(h));
        seen.add(hrefs[n]);
        const row = p.locator(SEL.recRow).nth(n);
        if (s.phone) await row.tap();
        else await row.click();
        await p.waitForURL((u) => u.toString() !== before);
        await p.locator(SEL.recRow).first().waitFor();
        await settle(p, 'trail');
      };
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      await settle(p, 'trail');
      await next();
      await next();
      await s.shot('trail');
      await s.crop('trail-crop', await boxOf(p, SEL.trail, 10));
      await next();
      await next();
      await next();
      await s.shot('trail-long'); // more albums than the trail shows: older ones are cut with an ellipsis
      await s.crop('trail-long-crop', await boxOf(p, SEL.trail, 10));
    },
  },
  {
    name: 'toast-link-copied', on: 'both',
    context: { permissions: ['clipboard-read', 'clipboard-write'] },
    async run(p, s) {
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      await settle(p, 'toast');
      if (s.phone) await p.locator(SEL.copyLink).tap();
      else await p.locator(SEL.copyLink).click();
      await p.locator(SEL.toast).waitFor();
      await animationsDone(p);
      await s.shot('toast-link-copied');
      await s.crop('toast-link-copied-crop', await boxOf(p, SEL.toast, 24));
    },
  },
  {
    name: 'toast-copy-failed', on: 'both',
    async run(p, s) {
      // Both copy routes fail (clipboard API rejected, execCommand refused): the toast spells the link out.
      await p.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
        document.execCommand = () => false;
      });
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      await settle(p, 'toast');
      if (s.phone) await p.locator(SEL.copyLink).tap();
      else await p.locator(SEL.copyLink).click();
      await p.locator(SEL.toast).waitFor();
      await animationsDone(p);
      await s.shot('toast-copy-failed');
      await s.crop('toast-copy-failed-crop', await boxOf(p, SEL.toast, 24));
    },
  },
  {
    name: 'toast-surprise-error', on: 'both',
    async run(p, s) {
      // The catalog does not load: Surprise me answers with the error toast (Home shows no map error panel).
      await p.route('**/data/albums.json', (r) => r.abort());
      await go(p, '/');
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(1500);
      if (s.phone) await p.locator(SEL.surprise).tap();
      else await p.locator(SEL.surprise).click();
      await p.locator(SEL.toast).waitFor({ timeout: 15000 });
      await animationsDone(p);
      await s.shot('toast-surprise-error');
    },
  },
  {
    name: 'pages', on: 'both',
    async run(p, s) {
      await go(p, '/about');
      await settle(p, 'about');
      await s.shot('about');
      await p.locator('.about-page').evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await settle(p, 'about');
      await s.shot('about-bottom');
      await go(p, '/this-page-is-not-here');
      await settle(p, '404');
      await s.shot('notfound');
    },
  },
  {
    name: 'error-map', on: 'both',
    async run(p, s) {
      await p.route('**/data/albums.json', (r) => r.abort());
      await go(p, '/map');
      await p.locator(SEL.mapError).waitFor({ timeout: 20000 });
      await settle(p, 'error', { map: false });
      await s.shot('error-map');
    },
  },
  {
    name: 'explore-here', on: 'both',
    async run(p, s) {
      // "Explore this area": leaves the album for Explore with the camera left where it was.
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      if (s.phone) {
        await settle(p, 'album');
        await p.locator(SEL.fab).tap();
      }
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      if (s.phone) await p.locator('.map-explore').tap();
      else await p.locator('.map-explore').click();
      await p.waitForURL(/\/map$/);
      await settle(p, 'map');
      await s.shot('explore-here');
    },
  },
  {
    name: 'reduced-motion', on: 'both',
    context: { reducedMotion: 'reduce' },
    async run(p, s) {
      await go(p, '/map');
      await settle(p, 'map');
      await s.shot('rm-map-overview');
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      if (s.phone) {
        await settle(p, 'album');
        await s.shot('rm-album-list');
        await p.locator(SEL.fab).tap();
      }
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      await s.shot('rm-album-open');
      // Under reduced motion a stop change lands at once: this frame is the final state, 60 ms after the click.
      const b = p.locator(SEL.stops, { hasText: 'Sonic' });
      if (s.phone) await b.tap();
      else await b.click();
      await p.waitForTimeout(60);
      await s.shot('rm-slider-sonic-60ms');
    },
  },
  {
    // The same overlap crops at device pixel ratio 2 (a MacBook's own screen), where the soft edges are finer.
    name: 'retina-crops', on: 'desktop', context: { deviceScaleFactor: 2 },
    async run(p, s) {
      const id = ALBUMS.dense.id;
      await go(p, '/map');
      await settle(p, 'map');
      await flyTo(p, id);
      await settle(p, 'map');
      await s.crop('retina-map-covers-dense-crop', around(await pt(p, id), 420));
      await mapKey(p, '-');
      await settle(p, 'map');
      await s.crop('retina-map-covers-dense-fade-crop', around(await pt(p, id), 420));
      await mapKey(p, '+');
      await pick(p, id, false);
      await settle(p, 'map');
      await s.crop('retina-selected-dense-crop', around(await pt(p, id), 420));
      await go(p, `/album/${ALBUMS.dense.slug}`);
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      await s.crop('retina-album-open-dense-crop', await boxOf(p, SEL.marker, 28));
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.marker).first().waitFor();
      await settle(p, 'album');
      await s.crop('retina-album-open-crop', await boxOf(p, SEL.marker, 28));
    },
  },
  {
    name: 'nowebgl', on: 'desktop', launch: { headless: true, args: ['--disable-3d-apis'] },
    async run(p, s) {
      await go(p, '/map');
      await p.locator(SEL.noWebgl).waitFor({ timeout: 20000 });
      await settle(p, 'nowebgl', { map: false });
      await s.shot('nowebgl-map');
      await go(p, `/album/${ALBUMS.main.slug}`);
      await p.locator(SEL.recRow).first().waitFor();
      await settle(p, 'nowebgl', { map: false });
      await s.shot('nowebgl-album');
    },
  },
];

/* ---------- runner ---------- */

async function answers() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (!fs.existsSync(path.join(CWD, '.next/BUILD_ID'))) throw new Error('no production build in ' + CWD + ': run npm run build first');
  if (await answers()) throw new Error(`${BASE} is already serving; stop that server or drop --start`);
  const port = new URL(BASE).port || '80';
  const child = spawn(path.join(CWD, 'node_modules/.bin/next'), ['start', '--port', port], { cwd: CWD, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  for (let i = 0; i < 120; i++) {
    if (await answers()) return stop;
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error('next start did not come up');
}

async function runViewport(vp, assertNativeChrome) {
  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  const log = { viewport: vp, mode: MODE, gasShader: GAS, open: OPEN, base: BASE, date: new Date().toISOString(), nodeArch: process.arch, browser: null, renderer: null, shots: [], notes: {}, failed: [] };
  let browser = await chromium.launch(LAUNCH[MODE]);
  let special = false;
  try {
    log.browserArch = await assertNativeChrome(browser);
    log.browser = browser.version();
    for (const state of STATES) {
      if (state.on !== 'both' && state.on !== vp) continue;
      if (ONLY && !state.name.includes(ONLY)) continue;
      if (!!state.launch !== special) {
        // One browser at a time: close the current one before starting another kind.
        await browser.close();
        browser = await chromium.launch(state.launch ?? LAUNCH[MODE]);
        special = !!state.launch;
      }
      const ctx = await browser.newContext({ ...VIEWPORTS[vp], ...(state.context ?? {}) });
      await ctx.addInitScript((v) => { window.__rmrGasLite = v; }, GAS === 'lighter' ? 'force' : 'off');
      if (OPEN === 'whole' && state.open !== 'app') await ctx.addInitScript(() => { window.__rmrOpen = 'whole'; });
      const page = await ctx.newPage();
      const t0 = Date.now();
      const s = {
        phone: vp === 'phone',
        note: (k, v) => {
          log.notes[k] = v;
        },
        async shot(name) {
          const file = path.join(dir, `${name}.jpg`);
          await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
          log.shots.push({ name, file: `${vp}/${name}.jpg`, url: page.url().replace(BASE, ''), camera: await cam(page) });
        },
        async crop(name, box) {
          const { width: W, height: H } = VIEWPORTS[vp].viewport;
          const x = Math.max(0, Math.min(W - 1, Math.round(box.x)));
          const y = Math.max(0, Math.min(H - 1, Math.round(box.y)));
          const clip = { x, y, width: Math.max(1, Math.min(W - x, Math.round(box.width))), height: Math.max(1, Math.min(H - y, Math.round(box.height))) };
          const file = path.join(dir, `${name}.png`);
          await page.screenshot({ path: file, type: 'png', clip });
          log.shots.push({ name, file: `${vp}/${name}.png`, clip });
        },
      };
      try {
        await state.run(page, s);
        if (!log.renderer && !state.launch) {
          log.renderer = await page.evaluate(() => {
            try {
              const g = document.createElement('canvas').getContext('webgl');
              return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
            } catch {
              return 'n/a';
            }
          });
        }
        console.log(`${vp} ${state.name}: ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      } catch (e) {
        // One broken state must not cost the later ones; the run still exits non-zero.
        const msg = String(e.message).split('\n').slice(0, 3).join(' ');
        log.failed.push({ state: state.name, error: msg });
        console.error(`${vp} ${state.name}: FAILED ${msg}`);
        await page.screenshot({ path: path.join(dir, `FAILED-${state.name}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  // A partial (--only) run never overwrites a full run's log: it writes capture-log-<viewport>.only.json.
  fs.writeFileSync(path.join(OUT, `capture-log-${vp}${ONLY ? '.only' : ''}.json`), JSON.stringify(log, null, 1));
  return log;
}

async function main() {
  if (process.platform === 'darwin' && process.arch !== 'arm64') throw new Error(`Node is ${process.arch}, not arm64 (Rosetta). See the top of this file.`);
  const { assertNativeChrome } = await import(pathToFileURL(path.join(CWD, 'scripts/check-native.mjs')).href);
  fs.mkdirSync(OUT, { recursive: true });
  const stop = flags.start ? await startServer() : null;
  if (!stop && !(await answers())) throw new Error(`${BASE} is not answering; start the production server or pass --start`);
  const failed = [];
  try {
    for (const vp of WHICH === 'both' ? ['desktop', 'phone'] : [WHICH]) {
      const log = await runViewport(vp, assertNativeChrome);
      console.log(`${vp}: ${log.shots.length} files, ${log.failed.length} failed states, ${log.browser}, ${log.renderer}`);
      failed.push(...log.failed.map((f) => `${vp} ${f.state}: ${f.error}`));
    }
  } finally {
    if (stop) await stop();
  }
  if (failed.length) {
    console.error(`${failed.length} state(s) failed:\n${failed.join('\n')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
