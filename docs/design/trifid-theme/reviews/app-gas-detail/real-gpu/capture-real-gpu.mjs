#!/usr/bin/env node
/**
 * The app's gas on a real GPU against the Trifid prototype, as a visitor's own browser gets it: no override of
 * the sharper image, so a desktop takes it by the app's own rule and a phone keeps the first image.
 *
 * The framing code is that of capture-detail.mjs beside this folder (the app and the prototype put on one
 * framing, the gas-only pictures compared band by band); what differs is the browser: headless Google Chrome on
 * Metal, the launch of scripts/perf/perf.mjs and baseline/capture.mjs, where every earlier fidelity capture was
 * software WebGL with the sharper image forced on.
 *
 * Run from `frontcreck/` with arm64 Node against a production build (it starts and stops its own `next start`):
 *
 *   node ../docs/design/trifid-theme/reviews/app-gas-detail/real-gpu/capture-real-gpu.mjs [--only <state,state>]
 *
 * States: desktop 1440 x 900 at dpr 1 and 2 (overview: the prototype's Overview framing; album: beside The Stone
 * Roses as the app frames it; overview-sonic: Overview on the Sonic stop, dpr 1) and phone 390 x 844 at dpr 3,
 * mobile and touch (phone-opening: /map as it opens; phone-album: The Stone Roses in the phone's map mode, the
 * state of options/final-phone-map.jpg). Written next to this script, JPEG quality 90:
 *   <state>-app-gas.jpg, <state>-prototype-gas.jpg   everything but the map canvas hidden / the prototype's gas
 *                                                    alone at the same framing. At dpr 2 these are the middle
 *                                                    1440 x 900 device px of the frame, not the whole frame.
 *   <state>-crop.png                                 above dpr 1: a tight pair at device px, app left and
 *                                                    prototype right
 *   phone-album-app.jpg                              the phone as a visitor sees it
 *   real-gpu.json, real-gpu.md                       renderer, what the gate was told, the sharper image's flag,
 *                                                    framing residual, band energies (app over prototype)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CWD = process.cwd();
const require = createRequire(path.join(CWD, 'package.json'));
const { chromium } = require('@playwright/test');
const sharp = require('sharp');

const HERE = import.meta.dirname;
const OUT = HERE;
const argv = process.argv.slice(2);
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const PROTO = pathToFileURL(path.resolve(HERE, '../../../prototype/index.html')).href;
const PORT = 3610;
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal', '--allow-file-access-from-files'];
const SIGMAS = [0.7, 1.4, 2.8, 5.6, 11.2];
const BAND_NAMES = ['under 0.7', '0.7 to 1.4', '1.4 to 2.8', '2.8 to 5.6', '5.6 to 11.2'];
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
let W = DESKTOP.width;
let H = DESKTOP.height;

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
    { polling: 50, timeout: 60000 },
  );
const settleApp = async (page, quiet = 400) => {
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), null, { timeout: 60000 });
  await page.waitForFunction(() => !window.__rmr.map.isAnimating(), null, { timeout: 30000 });
  await quietFrames(page, quiet);
};
/** Waits until the sharper image of the stop on screen is in and its fade is over, or the app says it will not
 * come ('off'), or the view does not ask for one (still 'waiting' after 4 s of rest). No override is set. */
const settleSharp = async (page) => {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => [window.__rmr.gasSharp, window.__rmr.getState().stop]);
    if (s[0] === 'off' || s[0] === s[1]) break;
    if (s[0] === 'waiting' && Date.now() - t0 > 4000) break;
    if (Date.now() - t0 > 60000) throw new Error(`the sharper image did not settle (${s[0]})`);
    await page.waitForTimeout(100);
  }
  await quietFrames(page, 500);
};
const openApp = async (page, url) => {
  await page.goto(`http://127.0.0.1:${PORT}${url}`);
  await settleApp(page);
};
const STATES = {
  overview: { vp: 'desktop', dprs: [1, 2], proto: '#/map?twinkle=0&seed=1004', follow: true, app: (p) => openApp(p, '/map') },
  album: { vp: 'desktop', dprs: [1, 2], proto: '#/album/the-stone-roses-the-stone-roses?twinkle=0&seed=1004', album: true, app: (p) => openApp(p, '/album/the-stone-roses-the-stone-roses') },
  'overview-sonic': {
    vp: 'desktop',
    dprs: [1],
    proto: '#/map?stop=sonic&twinkle=0&seed=1004',
    follow: true,
    app: async (p) => {
      await openApp(p, '/map');
      await p.evaluate(() => window.__rmr.getState().setStop('sonic'));
      await p.waitForTimeout(900);
      await settleApp(p);
    },
  },
  'phone-opening': { vp: 'phone', dprs: [3], proto: '#/map?twinkle=0&seed=1004', app: (p) => openApp(p, '/map') },
  'phone-album': {
    vp: 'phone',
    dprs: [3],
    proto: '#/album/the-stone-roses-the-stone-roses?view=map&twinkle=0&seed=1004',
    album: true,
    full: true,
    app: async (p) => {
      await openApp(p, '/album/the-stone-roses-the-stone-roses');
      // the phone opens an album as a list; the round map button turns it to the map (final-phone-map.jpg)
      await p.locator('.fab-map').click();
      await p.waitForTimeout(900);
      await settleApp(p, 600);
    },
  },
};

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
    const focus = s.focus ? [s.focus.seed, ...(s.focus.recs ?? [])] : [];
    return { pts, focus, canvas: { x: r.left, y: r.top, w: r.width, h: r.height }, camera: api.getCamera(), stop: s.stop, gasSharp: window.__rmr.gasSharp ?? null };
  });

/** Puts the prototype's camera where every album sits on the same screen px as in the app (capture-pairs.mjs). */
async function matchPrototype(page, geo, isAlbum) {
  return page.evaluate(
    ([pts, album]) => {
      const R = window.RMR;
      const P = R.D.pos[R.S.stop];
      let a = 0, b = 1, best = -1;
      for (let i = 0; i < pts.length; i += 37) {
        for (let j = i + 1; j < pts.length; j += 41) {
          const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (d > best) { best = d; a = i; b = j; }
        }
      }
      const ppw = best / Math.hypot(P[2 * a] - P[2 * b], P[2 * a + 1] - P[2 * b + 1]);
      const inset = R.cam.inset;
      const view = R.view;
      const cam = { x: P[2 * a] - (pts[a][0] - inset - (view.W - inset) / 2) / ppw, y: P[2 * a + 1] + (pts[a][1] - view.hdr - (view.H - view.hdr) / 2) / ppw, ppw, inset };
      R.Cam.limits = { min: 1, max: 1e9, box: [-99, -99, 99, 99] };
      R.S.framing = null;
      R.S.focusFramed = false;
      R.Cam.set(cam);
      if (album && R.S.focus) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const i of [R.S.focus.seed, ...R.S.focus.recs]) { x0 = Math.min(x0, P[2 * i]); y0 = Math.min(y0, P[2 * i + 1]); x1 = Math.max(x1, P[2 * i]); y1 = Math.max(y1, P[2 * i + 1]); }
        R.S.pool = [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(Math.hypot(x1 - x0, y1 - y0) * 0.3, 170 / ppw)];
      }
      R.Gas.invalidate();
      R.requestRender();
      let worst = 0;
      const o = [0, 0];
      for (let i = 0; i < pts.length; i += 13) { R.Cam.toScreen(P[2 * i], P[2 * i + 1], o); worst = Math.max(worst, Math.hypot(o[0] - pts[i][0], o[1] - pts[i][1])); }
      return { ppw: R.cam.ppw, worstPx: worst, coverPx: R.Cam.coverPx(), poolAmt: R.S.amt.pool };
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
    for (let i = 0; i < R.D.n; i++) { R.Cam.toScreen(P[2 * i], P[2 * i + 1], o); pts.push([o[0], o[1]]); }
    return { pts, ppw: R.cam.ppw };
  });
  for (let round = 0; round < 4; round++) {
    await app.evaluate(([pts]) => {
      const api = window.__rmr.map;
      const pa = api.screenPoint(0), pb = api.screenPoint(2000);
      const k = Math.hypot(pts[0][0] - pts[2000][0], pts[0][1] - pts[2000][1]) / Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const cam = api.getCamera();
      api.setCamera({ ...cam, zoom: cam.zoom * k }, false);
    }, [want.pts]);
    await settleApp(app, 200);
    await app.evaluate(([pts, ppw]) => {
      const api = window.__rmr.map;
      const pa = api.screenPoint(0);
      const cam = api.getCamera();
      api.setCamera({ ...cam, x: cam.x + (pa.x - pts[0][0]) / ppw, y: cam.y - (pa.y - pts[0][1]) / ppw }, false);
    }, [want.pts, want.ppw]);
    await settleApp(app, 200);
  }
  await settleApp(app, 500);
  return want.ppw;
}

async function openPrototype(ctx, hash) {
  const page = await ctx.newPage();
  await page.goto(PROTO + hash);
  await page.waitForFunction(() => (window.__rmr?.frames ?? 0) > 0 && window.RMR?.Gas?.ok, null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await quietFrames(page, 500);
  return page;
}

/* ---------- band energies ---------- */
async function lumaOf(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = new Float32Array(info.width * info.height);
  for (let i = 0; i < L.length; i++) L[i] = 0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2];
  return { L, w: info.width, h: info.height };
}
/** Separable Gaussian of `src * keep`, divided by the same blur of `keep`: masked pixels do not bleed into the rest. */
function blurMasked(src, keep, w, h, sigma) {
  const r = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * r + 1);
  let ks = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); ks += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const pass = (a, horizontal) => {
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -r; i <= r; i++) {
          const xx = horizontal ? Math.min(w - 1, Math.max(0, x + i)) : x;
          const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + i));
          s += k[i + r] * a[yy * w + xx];
        }
        o[y * w + x] = s;
      }
    }
    return o;
  };
  const num = new Float32Array(w * h);
  for (let i = 0; i < num.length; i++) num[i] = src[i] * keep[i];
  const a = pass(pass(num, true), false);
  const b = pass(pass(keep, true), false);
  for (let i = 0; i < a.length; i++) a[i] = b[i] > 1e-3 ? a[i] / b[i] : 0;
  return a;
}
/** keep: 1 where the gas is bare. use: 1 where a band may be read (further from albums, inside the canvas). */
function masks(geo, dpr, w, h, radiusCss) {
  const keep = new Float32Array(w * h).fill(1);
  const use = new Uint8Array(w * h).fill(1);
  const stamp = (arr, cx, cy, r, v) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) arr[y * w + x] = v;
  };
  const focus = new Set(geo.focus);
  geo.pts.forEach(([px, py], id) => {
    // markers of an open album and its neighbours are up to 64 px wide, with a frame and a label under them
    const r = (focus.has(id) ? 60 : radiusCss) * dpr;
    stamp(keep, px * dpr, py * dpr, r, 0);
    stamp(use, px * dpr, py * dpr, r + 6 * dpr, 0);
  });
  const c = geo.canvas;
  const x0 = Math.max(0, c.x) + 16, y0 = Math.max(0, c.y) + 16, x1 = Math.min(W, c.x + c.w) - 16, y1 = Math.min(H, c.y + c.h) - 16;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < x0 * dpr || x >= x1 * dpr || y < y0 * dpr || y >= y1 * dpr) { use[y * w + x] = 0; keep[y * w + x] = 0; }
  return { keep, use };
}
function bandEnergies(img, m) {
  const { L, w, h } = img;
  let prev = L;
  const out = [];
  for (const sigma of SIGMAS) {
    const g = blurMasked(L, m.keep, w, h, sigma);
    let n = 0, s = 0, s2 = 0;
    for (let i = 0; i < L.length; i++) {
      if (!m.use[i]) continue;
      const d = prev[i] - g[i];
      n++; s += d; s2 += d * d;
    }
    out.push(Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)));
    prev = g;
  }
  return out;
}

const HIDE_APP = 'body *{visibility:hidden!important} canvas.map-canvas{visibility:visible!important} .grain{display:none!important}';
const rawOf = async (png) => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = new Float32Array(info.width * info.height);
  for (let i = 0; i < L.length; i++) L[i] = 0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2];
  return { L, w: info.width, h: info.height };
};

async function capture() {
  const { startServer } = await import(pathToFileURL(path.join(CWD, 'scripts/serve.mjs')).href);
  const { assertNativeChrome } = await import(pathToFileURL(path.join(CWD, 'scripts/check-native.mjs')).href);
  const server = await startServer(PORT);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU });
  const rows = [];
  try {
    await assertNativeChrome(browser);
    for (const [name, st] of Object.entries(STATES)) {
      if (ONLY && !ONLY.includes(name)) continue;
      for (const dpr of st.dprs) {
        const phone = st.vp === 'phone';
        ({ width: W, height: H } = phone ? PHONE : DESKTOP);
        const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
        const app = await ctx.newPage();
        const errors = [];
        const sharpRequests = [];
        app.on('pageerror', (e) => errors.push(e.message));
        app.on('request', (r) => { if (/-sharp\./.test(r.url())) sharpRequests.push(new URL(r.url()).pathname); });
        await st.app(app);
        if (st.follow) {
          const ref = await openPrototype(ctx, st.proto);
          await appToPrototype(app, ref);
          await ref.close();
        }
        await settleSharp(app);
        const geo = await appGeometry(app);
        const device = await app.evaluate(() => {
          const g = document.createElement('canvas').getContext('webgl2');
          const dbg = g.getExtension('WEBGL_debug_renderer_info');
          return { override: window.__rmrGasSharp ?? null, coarsePointer: matchMedia('(pointer: coarse)').matches, maxTouchPoints: navigator.maxTouchPoints, deviceMemory: navigator.deviceMemory ?? null, maxTextureSize: g.getParameter(g.MAX_TEXTURE_SIZE), renderer: g.getParameter(dbg.UNMASKED_RENDERER_WEBGL), gasLite: window.__rmr.gasLite ?? null, dpr: devicePixelRatio };
        });
        const tag = st.dprs.length > 1 ? `${name}-d${dpr}` : name;
        if (st.full) await sharp(await app.screenshot({ timeout: 180000 })).jpeg({ quality: 90 }).toFile(path.join(OUT, `${tag}-app.jpg`));
        await app.addStyleTag({ content: HIDE_APP });
        await app.waitForTimeout(150);
        const appPng = await app.screenshot({ timeout: 180000 });
        await app.close();
        const gas = await openPrototype(ctx, `${st.proto}&gasonly=1`);
        const m = await matchPrototype(gas, geo, !!st.album);
        await gas.waitForTimeout(300);
        await quietFrames(gas, 500);
        const protoPng = await gas.screenshot({ timeout: 180000 });
        await gas.close();
        await ctx.close();
        // bands, from the lossless captures
        const A = await rawOf(appPng);
        const P = await rawOf(protoPng);
        const mk = masks(geo, dpr, A.w, A.h, Math.max(6, m.coverPx * 0.5 + 3));
        const ea = bandEnergies(A, mk);
        const ep = bandEnergies(P, mk);
        const ratio = ea.map((v, i) => +(v / ep[i]).toFixed(3));
        // pictures: the whole frame, or at dpr 2 its middle 1440 x 900 device px
        const whole = { left: 0, top: 0, width: A.w, height: A.h };
        const mid = dpr === 2 ? { left: Math.round(A.w / 2 - 720), top: Math.round(A.h / 2 - 450), width: 1440, height: 900 } : whole;
        await sharp(appPng).extract(mid).jpeg({ quality: 90 }).toFile(path.join(OUT, `${tag}-app-gas.jpg`));
        await sharp(protoPng).extract(mid).jpeg({ quality: 90 }).toFile(path.join(OUT, `${tag}-prototype-gas.jpg`));
        // a tight pair at device px: 360 x 360 beside the middle of the canvas (the seed's markers sit in the middle)
        const c = geo.canvas;
        const side = 360;
        const cx = Math.round((Math.max(0, c.x) + Math.min(W, c.x + c.w)) / 2 * dpr + (phone ? 0 : 260 * dpr));
        const cy = Math.round((Math.max(0, c.y) + Math.min(H, c.y + c.h)) / 2 * dpr - (phone ? 300 * dpr / 3 : 120 * dpr));
        const box = { left: Math.max(0, Math.min(A.w - side, cx - side / 2)), top: Math.max(0, Math.min(A.h - side, cy - side / 2)), width: side, height: side };
        const l = await sharp(appPng).extract(box).png().toBuffer();
        const r = await sharp(protoPng).extract(box).png().toBuffer();
        // (only above dpr 1, where the JPEG of the frame's middle cannot show single device px)
        if (dpr > 1) await sharp({ create: { width: 2 * side + 8, height: side, channels: 3, background: '#000' } }).composite([{ input: l, left: 0, top: 0 }, { input: r, left: side + 8, top: 0 }]).png({ compressionLevel: 9 }).toFile(path.join(OUT, `${tag}-crop.png`));
        const row = { state: name, dpr, viewport: `${W} x ${H}`, device, gasSharp: geo.gasSharp, sharpRequests, stop: geo.stop, pxPerWorld: +m.ppw.toFixed(0), coverPx: +m.coverPx.toFixed(1), framingResidualPx: +m.worstPx.toFixed(2), crop: box, bands: { app: ea.map((v) => +v.toFixed(3)), prototype: ep.map((v) => +v.toFixed(3)), ratio }, errors };
        rows.push(row);
        console.log(`${tag}: renderer ${device.renderer}; sharper image ${geo.gasSharp} (${sharpRequests.length} requests, override ${device.override}); lighter shader ${device.gasLite}; ${row.pxPerWorld} px per world unit, covers ${row.coverPx} px, framing residual ${row.framingResidualPx} px; bands app/prototype ${ratio.join(' ')}; page errors ${errors.length}`);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  return rows;
}

const rows = await capture();
const file = path.join(OUT, 'real-gpu.json');
const before = ONLY && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).rows.filter((r) => !rows.some((n) => n.state === r.state && n.dpr === r.dpr)) : [];
const all = [...before, ...rows];
fs.writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), rows: all }, null, 1));
const md = ['# The gas on a real GPU (written by capture-real-gpu.mjs)', '', `Renderer: ${all[0]?.device.renderer}. No override of the sharper image. Bands: standard deviation of the luma between Gaussian blurs, albums masked, in device px; app over prototype.`, '', `| State | Viewport, dpr | Sharper image | px per world unit | Covers (px) | Framing residual (px) | ${BAND_NAMES.join(' | ')} |`, `|---|---|---|---|---|---|${BAND_NAMES.map(() => '---').join('|')}|`];
for (const r of all) md.push(`| ${r.state} | ${r.viewport}, ${r.dpr} | ${r.gasSharp} (${r.sharpRequests.length} fetched) | ${r.pxPerWorld} | ${r.coverPx} | ${r.framingResidualPx} | ${r.bands.ratio.map((v) => v.toFixed(2)).join(' | ')} |`);
fs.writeFileSync(path.join(OUT, 'real-gpu.md'), md.join('\n') + '\n');
