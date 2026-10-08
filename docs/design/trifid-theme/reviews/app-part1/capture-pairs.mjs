#!/usr/bin/env node
/**
 * Like for like pairs of the app and the Trifid prototype for the part 1 fidelity check (the gas only).
 *
 * Run from `frontcreck/` with arm64 Node against a production build (it starts and stops its own `next start`):
 *
 *   export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch   # arm64
 *   cd frontcreck && npm run build
 *   node ../docs/design/trifid-theme/reviews/app-part1/capture-pairs.mjs [--only <state>] [--out <dir>] [--lite]
 *
 * One headless Chromium (Playwright's own, software WebGL: the renderer the approved pictures were taken with),
 * 1600 x 1000 at device pixel ratio 1, one page at a time. For every state it writes, as JPEG quality 90:
 *
 *   <state>-app.jpg                 the app in the state of the approved picture
 *   <state>-prototype.jpg           the prototype put at the app's exact framing (same world point on the same
 *                                   screen px): the pair that differs only in the implementation
 *   <state>-prototype-own.jpg       the prototype at its own framing, which is the approved picture's
 *   <state>-app-gas.jpg             the app with everything but the map canvas hidden (album dots and covers
 *                                   remain: they are drawn in the same canvas)
 *   <state>-prototype-gas.jpg       the prototype's gas alone at the app's framing (its `gasonly=1` debug switch)
 *
 * The app draws the gas with a lighter shader on a software renderer. The notes built on these captures describe
 * the full shader (what a GPU draws), so this script always asks for the full one (window.__rmrGasLite = 'off').
 * `--lite` captures the lighter shader on purpose instead; write those to a directory of their own (--out).
 *
 * and `stats.json` / `stats.md`: mean and standard deviation of luma, mean saturation, hue of the mean colour and a
 * fine-detail figure (standard deviation of luma minus its 9 px box blur) over a 4 x 3 grid of patches of the
 * map area, in both gas-only images, with every pixel within a few px of an album masked out of both.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');
const sharp = require('sharp');
const { startServer } = await import(pathToFileURL(path.join(CWD, 'scripts/serve.mjs')).href);

const HERE = import.meta.dirname;
const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const OUT = path.resolve(flag('--out') ?? HERE);
const ONLY = flag('--only');
const LITE = argv.includes('--lite');
const PROTO = pathToFileURL(path.resolve(HERE, '../../prototype/index.html')).href;
const W = 1600;
const H = 1000;
const PORT = 3600;
const STONE_ROSES = { id: 203, slug: 'the-stone-roses-the-stone-roses' };
/** The world point of the approved deep zoom picture (prototype/decide.html, "C. Faint"). */
const DEEP_AT = { x: 0.1837, y: -0.0562 };

fs.mkdirSync(OUT, { recursive: true });

const settleApp = async (page, quiet = 400) => {
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), null, { timeout: 30000 });
  await page.waitForFunction(() => !window.__rmr.map.isAnimating(), null, { timeout: 15000 });
  await quietFrames(page, quiet);
};
const quietFrames = (page, quiet) =>
  page.waitForFunction(
    (q) => {
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (window.__qf !== f) {
        window.__qf = f;
        window.__qt = now;
        return false;
      }
      return now - window.__qt >= q;
    },
    quiet,
    { polling: 50, timeout: 30000 },
  );

/** The app's states: how to reach each one with the app's own controls. */
const STATES = {
  // The app opens /map at the framing the prototype calls Whole map; the prototype's Overview is 2.7 times
  // closer. So for this state the app's camera is moved to the prototype's own Overview framing.
  overview: {
    approved: 'final-overview.jpg',
    approvedFile: 'final-overview.jpg',
    proto: '#/map?twinkle=0&seed=1004',
    appFollowsPrototype: true,
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/map`);
      await settleApp(page);
    },
  },
  // Sonic and Mood at the prototype's Overview framing of that stop. final-mood.jpg is the approved Mood picture;
  // Sonic has none.
  'overview-mood': {
    approved: 'final-mood.jpg',
    approvedFile: 'final-mood.jpg',
    proto: '#/map?stop=mood&twinkle=0&seed=1004',
    appFollowsPrototype: true,
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/map`);
      await settleApp(page);
      await page.evaluate(() => window.__rmr.getState().setStop('mood'));
      await page.waitForTimeout(900);
      await settleApp(page);
    },
  },
  'overview-sonic': {
    approved: 'none (Sonic has no approved picture)',
    proto: '#/map?stop=sonic&twinkle=0&seed=1004',
    appFollowsPrototype: true,
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/map`);
      await settleApp(page);
      await page.evaluate(() => window.__rmr.getState().setStop('sonic'));
      await page.waitForTimeout(900);
      await settleApp(page);
    },
  },
  whole: {
    approved: 'final-whole.jpg',
    approvedFile: 'final-whole.jpg',
    proto: '#/map?fit=whole&twinkle=0&seed=1004',
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/map`);
      await settleApp(page);
    },
  },
  album: {
    approved: 'final-album.jpg',
    approvedFile: 'final-album.jpg',
    proto: `#/album/${STONE_ROSES.slug}?twinkle=0&seed=1004`,
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/album/${STONE_ROSES.slug}`);
      await settleApp(page, 800);
    },
  },
  // A second album, in the brightest cream gas (not an approved picture: it settles whether an open album
  // there is brighter or flatter than the prototype).
  'album-bright': {
    approved: 'none (In Rainbows, in the bright cream region)',
    proto: '#/album/in-rainbows-radiohead?twinkle=0&seed=1004',
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/album/in-rainbows-radiohead`);
      await settleApp(page, 800);
    },
  },
  home: {
    approved: 'final-home.jpg',
    approvedFile: 'final-home.jpg',
    proto: '#/?twinkle=0&seed=1004',
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await settleApp(page, 800);
    },
  },
  deep: {
    approved: 'q-deep.jpg (panel C, "Faint")',
    approvedFile: 'q-deep.jpg',
    // panel C is the lower right quarter of a contact sheet: this rectangle of the 2472 x 1660 file, by eye
    approvedCrop: { left: 1248, top: 843, width: 1199, height: 749 },
    proto: `#/map?seed=1004&names=0&twinkle=0&cam=${DEEP_AT.x},${DEEP_AT.y},99999`,
    app: async (page) => {
      await page.goto(`http://127.0.0.1:${PORT}/map`);
      await settleApp(page);
      await page.evaluate((at) => window.__rmr.map.setCamera({ x: at.x, y: at.y, zoom: 1000 }, false), DEEP_AT);
      await settleApp(page, 1500); // cover sheets arrive
    },
  },
};

const jpg = (png, name) => sharp(png).jpeg({ quality: 90 }).toFile(path.join(OUT, name));

/** Screen px of every album in the app, and the canvas rectangle. */
const appGeometry = (page) =>
  page.evaluate(() => {
    const api = window.__rmr.map;
    const pts = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      pts.push([p.x, p.y]);
    }
    const r = document.querySelector('canvas.map-canvas').getBoundingClientRect();
    const s = window.__rmr.getState();
    return { pts, canvas: { x: r.left, y: r.top, w: r.width, h: r.height }, camera: api.getCamera(), gasPool: window.__rmr.gasPool, gasDeep: window.__rmr.gasDeep, stop: s.stop };
  });

/** Puts the prototype's camera where every album sits on the same screen px as in the app. */
async function matchPrototype(page, geo, isAlbum) {
  return page.evaluate(
    ([pts, album]) => {
      const R = window.RMR;
      const P = R.D.pos[R.S.stop];
      // the two albums furthest apart on the app's screen give the scale
      let a = 0;
      let b = 1;
      let best = -1;
      for (let i = 0; i < pts.length; i += 37) {
        for (let j = i + 1; j < pts.length; j += 41) {
          const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (d > best) {
            best = d;
            a = i;
            b = j;
          }
        }
      }
      const ppw = best / Math.hypot(P[2 * a] - P[2 * b], P[2 * a + 1] - P[2 * b + 1]);
      const inset = R.cam.inset;
      const view = R.view;
      const cam = {
        x: P[2 * a] - (pts[a][0] - inset - (view.W - inset) / 2) / ppw,
        y: P[2 * a + 1] + (pts[a][1] - view.hdr - (view.H - view.hdr) / 2) / ppw,
        ppw,
        inset,
      };
      const own = { x: R.cam.x, y: R.cam.y, ppw: R.cam.ppw, inset: R.cam.inset, pool: R.S.pool ? [...R.S.pool] : null };
      R.Cam.limits = { min: 1, max: 1e9, box: [-99, -99, 99, 99] }; // the app's framing may lie outside the prototype's own limits
      R.S.framing = null;
      R.S.focusFramed = false;
      R.Cam.set(cam);
      if (album && R.S.focus) {
        // the pool as the prototype computes it when an album opens at this framing (app.js apply())
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const i of [R.S.focus.seed, ...R.S.focus.recs]) {
          x0 = Math.min(x0, P[2 * i]);
          y0 = Math.min(y0, P[2 * i + 1]);
          x1 = Math.max(x1, P[2 * i]);
          y1 = Math.max(y1, P[2 * i + 1]);
        }
        R.S.pool = [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(Math.hypot(x1 - x0, y1 - y0) * 0.3, 170 / ppw)];
      }
      R.Gas.invalidate();
      R.requestRender();
      // residual: how far the albums land from the app's px
      let worst = 0;
      const o = [0, 0];
      for (let i = 0; i < pts.length; i += 13) {
        R.Cam.toScreen(P[2 * i], P[2 * i + 1], o);
        worst = Math.max(worst, Math.hypot(o[0] - pts[i][0], o[1] - pts[i][1]));
      }
      return { own, set: { x: R.cam.x, y: R.cam.y, ppw: R.cam.ppw, inset: R.cam.inset, pool: R.S.pool ? [...R.S.pool] : null }, worstPx: worst, coverPx: R.Cam.coverPx(), poolAmt: R.S.amt.pool };
    },
    [geo.pts, isAlbum],
  );
}

/** Moves the app's camera until its albums sit on the screen px the prototype shows them at (its own framing). */
async function appToPrototype(app, proto) {
  const want = await proto.evaluate(() => {
    const R = window.RMR;
    const P = R.D.pos[R.S.stop];
    const pts = [];
    const o = [0, 0];
    for (let i = 0; i < R.D.n; i++) {
      R.Cam.toScreen(P[2 * i], P[2 * i + 1], o);
      pts.push([o[0], o[1]]);
    }
    return { pts, ppw: R.cam.ppw };
  });
  for (let round = 0; round < 4; round++) {
    await app.evaluate(
      ([pts]) => {
        const api = window.__rmr.map;
        const a = 0;
        const b = 2000;
        const pa = api.screenPoint(a);
        const pb = api.screenPoint(b);
        const k = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]) / Math.hypot(pa.x - pb.x, pa.y - pb.y);
        const cam = api.getCamera();
        api.setCamera({ ...cam, zoom: cam.zoom * k }, false);
      },
      [want.pts],
    );
    await settleApp(app, 200);
    await app.evaluate(
      ([pts, ppw]) => {
        const api = window.__rmr.map;
        const pa = api.screenPoint(0);
        const cam = api.getCamera();
        api.setCamera({ ...cam, x: cam.x + (pa.x - pts[0][0]) / ppw, y: cam.y - (pa.y - pts[0][1]) / ppw }, false);
      },
      [want.pts, want.ppw],
    );
    await settleApp(app, 200);
  }
  await settleApp(app, 500);
}

async function openPrototype(ctx, hash) {
  const page = await ctx.newPage();
  await page.goto(PROTO + hash);
  await page.waitForFunction(() => (window.__rmr?.frames ?? 0) > 0 && window.RMR?.Gas?.ok, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700); // the pool and the camera ease in
  await quietFrames(page, 500);
  return page;
}

/* ---------- statistics ---------- */
async function raw(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height };
}
function maskOf(geo, radius) {
  const m = new Uint8Array(W * H);
  const r = Math.ceil(radius);
  for (const [px, py] of geo.pts) {
    if (px < -r || py < -r || px > W + r || py > H + r) continue;
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H - 1, Math.ceil(py + r)); y++) {
      for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W - 1, Math.ceil(px + r)); x++) m[y * W + x] = 1;
    }
  }
  return m;
}
function lumaPlane(img) {
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = 0.2126 * img.d[3 * i] + 0.7152 * img.d[3 * i + 1] + 0.0722 * img.d[3 * i + 2];
  return L;
}
function boxBlur(L, r) {
  const t = new Float32Array(W * H);
  const o = new Float32Array(W * H);
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += L[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      t[y * W + x] = s / n;
      s += L[y * W + Math.min(W - 1, x + r + 1)] - L[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      o[y * W + x] = s / n;
      s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x];
    }
  }
  return o;
}
function patchStats(img, L, blur, mask, wide, rect) {
  let n = 0, sl = 0, sl2 = 0, ss = 0, sr = 0, sg = 0, sb = 0, nd = 0, sd = 0, sd2 = 0, total = 0;
  for (let y = Math.round(rect.y); y < Math.round(rect.y + rect.h); y++) {
    for (let x = Math.round(rect.x); x < Math.round(rect.x + rect.w); x++) {
      const i = y * W + x;
      total++;
      if (mask[i]) continue;
      const r = img.d[3 * i], g = img.d[3 * i + 1], b = img.d[3 * i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      n++;
      sl += L[i];
      sl2 += L[i] * L[i];
      ss += mx > 0 ? (mx - mn) / mx : 0;
      sr += r;
      sg += g;
      sb += b;
      if (!wide[i]) {
        const hp = L[i] - blur[i];
        nd++;
        sd += hp;
        sd2 += hp * hp;
      }
    }
  }
  if (n < 50) return null;
  const mr = sr / n, mg = sg / n, mb = sb / n;
  const mx = Math.max(mr, mg, mb), mn = Math.min(mr, mg, mb);
  let hue = 0;
  if (mx - mn > 0.5) {
    hue = mx === mr ? ((mg - mb) / (mx - mn)) % 6 : mx === mg ? (mb - mr) / (mx - mn) + 2 : (mr - mg) / (mx - mn) + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    used: Math.round((100 * n) / total),
    luma: r1(sl / n),
    lumaSd: r1(Math.sqrt(Math.max(0, sl2 / n - (sl / n) ** 2))),
    sat: Math.round((1000 * ss) / n) / 1000,
    rgb: [Math.round(mr), Math.round(mg), Math.round(mb)],
    hue: Math.round(hue),
    detail: nd > 50 ? Math.round(100 * Math.sqrt(Math.max(0, sd2 / nd - (sd / nd) ** 2))) / 100 : null,
  };
}

async function compare(appPng, protoPng, geo, coverPx) {
  const A = await raw(appPng);
  const B = await raw(protoPng);
  // dots are at most 7.2 px across, covers coverPx; mask a little more than half of the larger
  const radius = Math.max(6, coverPx * 0.5 + 3);
  const mask = maskOf(geo, radius);
  const wide = maskOf(geo, radius + 5);
  const LA = lumaPlane(A), LB = lumaPlane(B);
  const bA = boxBlur(LA, 4), bB = boxBlur(LB, 4);
  const c = geo.canvas;
  const area = { x: Math.max(0, c.x) + 8, y: Math.max(0, c.y) + 8, w: Math.min(W, c.x + c.w) - Math.max(0, c.x) - 16, h: Math.min(H, c.y + c.h) - Math.max(0, c.y) - 16 };
  const rows = [];
  const cols = 4, lines = 3;
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i < cols; i++) {
      const rect = { x: area.x + (area.w * i) / cols, y: area.y + (area.h * j) / lines, w: area.w / cols, h: area.h / lines };
      rows.push({ patch: `r${j + 1}c${i + 1}`, rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }, app: patchStats(A, LA, bA, mask, wide, rect), prototype: patchStats(B, LB, bB, mask, wide, rect) });
    }
  }
  rows.push({ patch: 'whole map area', rect: { x: Math.round(area.x), y: Math.round(area.y), w: Math.round(area.w), h: Math.round(area.h) }, app: patchStats(A, LA, bA, mask, wide, area), prototype: patchStats(B, LB, bB, mask, wide, area) });
  return { maskRadiusPx: radius, rows };
}

/** Median luma, median colour and median saturation of the unmasked pixels of a rectangle: robust against
 * what lies on top of the gas in a full picture (stars, dots, lettering). */
function medianStats(img, mask, rect) {
  const L = [], R = [], G = [], B = [], S = [];
  for (let y = Math.round(rect.y); y < Math.round(rect.y + rect.h); y++) {
    for (let x = Math.round(rect.x); x < Math.round(rect.x + rect.w); x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      const r = img.d[3 * i], g = img.d[3 * i + 1], b = img.d[3 * i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      L.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
      R.push(r);
      G.push(g);
      B.push(b);
      S.push(mx > 0 ? (mx - mn) / mx : 0);
    }
  }
  if (L.length < 50) return null;
  const med = (v) => v.sort((a, b) => a - b)[v.length >> 1];
  return { luma: Math.round(med(L) * 10) / 10, rgb: [med(R), med(G), med(B)], sat: Math.round(med(S) * 1000) / 1000 };
}

/** The approved JPEG itself against the app's gas and the prototype's gas, on the same patches (medians). */
async function compareApproved(file, crop, appPng, protoPng, geo, coverPx) {
  let a = sharp(path.resolve(HERE, '../../options', file));
  if (crop) a = a.extract(crop);
  const approved = await raw(await a.resize(W, H, { fit: 'fill' }).png().toBuffer());
  const A = await raw(appPng);
  const P = await raw(protoPng);
  // stars carry a bloom wider than a dot, so the mask is a little wider here
  const mask = maskOf(geo, Math.max(9, coverPx * 0.5 + 5));
  const c = geo.canvas;
  const area = { x: Math.max(0, c.x) + 8, y: Math.max(0, c.y) + 8, w: Math.min(W, c.x + c.w) - Math.max(0, c.x) - 16, h: Math.min(H, c.y + c.h) - Math.max(0, c.y) - 16 };
  const rows = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 4; i++) {
      const rect = { x: area.x + (area.w * i) / 4, y: area.y + (area.h * j) / 3, w: area.w / 4, h: area.h / 3 };
      rows.push({ patch: `r${j + 1}c${i + 1}`, app: medianStats(A, mask, rect), approved: medianStats(approved, mask, rect), prototype: medianStats(P, mask, rect) });
    }
  }
  rows.push({ patch: 'whole map area', app: medianStats(A, mask, area), approved: medianStats(approved, mask, area), prototype: medianStats(P, mask, area) });
  return rows;
}

const HIDE_APP = 'body *{visibility:hidden!important} canvas.map-canvas{visibility:visible!important} .grain{display:none!important}';

async function main() {
  const server = await startServer(PORT);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const all = fs.existsSync(path.join(OUT, 'stats.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'stats.json'), 'utf8')) : {};
  try {
    for (const [name, st] of Object.entries(STATES)) {
      if (ONLY && name !== ONLY) continue;
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await ctx.addInitScript((v) => { window.__rmrGasLite = v; }, LITE ? 'force' : 'off');
      const app = await ctx.newPage();
      const errors = [];
      app.on('pageerror', (e) => errors.push(e.message));
      await st.app(app);
      if (st.appFollowsPrototype) {
        const ref = await openPrototype(ctx, st.proto);
        await appToPrototype(app, ref);
        await ref.close();
      }
      const geo = await appGeometry(app);
      await jpg(await app.screenshot(), `${name}-app.jpg`);
      await app.addStyleTag({ content: HIDE_APP });
      await app.waitForTimeout(150);
      const appGas = await app.screenshot();
      await jpg(appGas, `${name}-app-gas.jpg`);
      await app.close();

      const own = await openPrototype(ctx, st.proto);
      await jpg(await own.screenshot(), `${name}-prototype-own.jpg`);
      const m = await matchPrototype(own, geo, name === 'album');
      await own.waitForTimeout(300);
      await quietFrames(own, 500);
      await jpg(await own.screenshot(), `${name}-prototype.jpg`);
      await own.close();

      const gas = await openPrototype(ctx, `${st.proto}&gasonly=1`);
      const m2 = await matchPrototype(gas, geo, name === 'album');
      await gas.waitForTimeout(300);
      await quietFrames(gas, 500);
      const protoGas = await gas.screenshot();
      await jpg(protoGas, `${name}-prototype-gas.jpg`);
      await gas.close();
      await ctx.close();

      const cmp = await compare(appGas, protoGas, geo, m.coverPx);
      if (st.approvedFile) cmp.approvedRows = await compareApproved(st.approvedFile, st.approvedCrop, appGas, protoGas, geo, m.coverPx);
      all[name] = { approved: st.approved, prototypeHash: st.proto, app: { camera: geo.camera, canvas: geo.canvas, gasPool: geo.gasPool, gasDeep: geo.gasDeep, errors }, prototype: { ownCamera: m.own, matchedCamera: m.set, worstAlbumOffsetPx: Math.round(m.worstPx * 100) / 100, coverPx: Math.round(m.coverPx * 10) / 10, poolAmt: m2.poolAmt }, ...cmp };
      console.log(`${name}: framing residual ${m.worstPx.toFixed(2)} px, covers ${m.coverPx.toFixed(1)} px, prototype own ppw ${m.own.ppw.toFixed(0)} against app ${m.set.ppw.toFixed(0)}`);
      for (const r of cmp.rows) console.log(`  ${r.patch.padEnd(15)} app ${JSON.stringify(r.app)}\n  ${''.padEnd(15)} pro ${JSON.stringify(r.prototype)}`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(all, null, 1));
  const md = ['# Gas statistics per pair (written by capture-pairs.mjs)', ''];
  for (const [name, s] of Object.entries(all)) {
    md.push(`## ${name} (approved: ${s.approved})`, '', `Prototype at the app's framing: worst album offset ${s.prototype.worstAlbumOffsetPx} px; covers ${s.prototype.coverPx} px; album mask radius ${s.maskRadiusPx} px.`, '', '| Patch (x, y, w, h) | Share used % | Luma mean app / proto | Luma sd app / proto | Saturation app / proto | Hue app / proto | Mean rgb app / proto | Fine detail app / proto |', '|---|---|---|---|---|---|---|---|');
    for (const r of s.rows) {
      const a = r.app, p = r.prototype;
      if (!a || !p) continue;
      md.push(`| ${r.patch} (${r.rect.x}, ${r.rect.y}, ${r.rect.w}, ${r.rect.h}) | ${a.used} | ${a.luma} / ${p.luma} | ${a.lumaSd} / ${p.lumaSd} | ${a.sat} / ${p.sat} | ${a.hue} / ${p.hue} | ${a.rgb.join(' ')} / ${p.rgb.join(' ')} | ${a.detail} / ${p.detail} |`);
    }
    md.push('');
    if (s.approvedRows) {
      md.push(`Against the approved file itself (${s.approved}): medians of the same patches, albums masked. The approved picture also holds stars, region names, glass panels and the header over the map (parts 2 and 3), which the gas-only images do not; r1c1 lies under the similarity panel in the map states.`, '', '| Patch | Median luma app / approved / prototype | Median rgb app | Median rgb approved | Median rgb prototype | Median saturation app / approved / prototype |', '|---|---|---|---|---|---|');
      for (const r of s.approvedRows) {
        if (!r.app || !r.approved || !r.prototype) continue;
        md.push(`| ${r.patch} | ${r.app.luma} / ${r.approved.luma} / ${r.prototype.luma} | ${r.app.rgb.join(' ')} | ${r.approved.rgb.join(' ')} | ${r.prototype.rgb.join(' ')} | ${r.app.sat} / ${r.approved.sat} / ${r.prototype.sat} |`);
      }
      md.push('');
    }
  }
  fs.writeFileSync(path.join(OUT, 'stats.md'), md.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
