#!/usr/bin/env node
/**
 * Fine detail of the app's gas against the Trifid prototype, by spatial band (review item M1).
 *
 * An extension of ../app-part1/capture-pairs.mjs: the same way of putting the app and the prototype on one
 * framing, but at device pixel ratio 1 and 2, with the gas-only images kept lossless, and with the measure the
 * independent review used (energy of the luma in bands between Gaussian blurs of sigma 0.7, 1.4, 2.8, 5.6 and
 * 11.2 px, albums masked) in place of the single 9 px box figure.
 *
 * Run from `frontcreck/` with arm64 Node against a production build (it starts and stops its own `next start`):
 *
 *   export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch   # arm64
 *   cd frontcreck && npm run build
 *   node ../docs/design/trifid-theme/reviews/app-gas-detail/capture-detail.mjs --out <dir> [--dpr 1,2] [--only <state>] [--sharp] [--lite]
 *
 * One headless Chromium (Playwright's own, software WebGL: the renderer the approved pictures were taken with),
 * 1600 x 1000 CSS px, one page at a time. `--sharp` asks the app for its sharper gas image, which it does not
 * load by itself on a software renderer (window.__rmrGasSharp, see GasField.tsx), and waits for it.
 * The app draws the gas with a lighter shader on a software renderer. The notes built on these captures describe
 * the full shader (what a GPU draws), so this script always asks for the full one (window.__rmrGasLite = 'off').
 * `--lite` captures the lighter shader on purpose instead; write those to a directory of their own.
 *
 * Per state and pixel ratio it writes into <dir>:
 *   <state>-d<dpr>-app.jpg             the app as a visitor sees it (JPEG quality 92)
 *   <state>-d<dpr>-app-gas.png         the app with everything but the map canvas hidden (album dots remain)
 *   <state>-d<dpr>-prototype-gas.png   the prototype's gas alone at the app's framing (its gasonly=1 switch)
 *   <state>-d<dpr>.json                the framing and the album positions on screen (for the mask)
 * and bands.json / bands.md: per band the energy (standard deviation) of the app and of the prototype, their
 * ratio, and the ratio with the noise floor taken off. The floor is what the same band reads in empty sky
 * (shader grain and dither only; captured for the prototype in state `sky`, computed from the shader's grain
 * formula for the app, whose camera cannot leave the cloud), removed as independent noise: sqrt(e^2 - floor^2).
 * Bands are in px of the image, so at dpr 2 they are device px (half the CSS size).
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
const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const OUT = path.resolve(flag('--out') ?? path.join(HERE, 'out'));
const ONLY = flag('--only');
const DPRS = (flag('--dpr') ?? '1,2').split(',').map(Number);
const SHARP = argv.includes('--sharp');
const LITE = argv.includes('--lite');
const BANDS_ONLY = argv.includes('--bands-only');
const PROTO = pathToFileURL(path.resolve(HERE, '../../prototype/index.html')).href;
const W = 1600;
const H = 1000;
const PORT = 3600;
const SIGMAS = [0.7, 1.4, 2.8, 5.6, 11.2];
const BAND_NAMES = ['under 0.7', '0.7 to 1.4', '1.4 to 2.8', '2.8 to 5.6', '5.6 to 11.2'];

fs.mkdirSync(OUT, { recursive: true });

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
/** With --sharp: waits until the sharper image of the stop on screen is in (or the app says it will not come). */
const settleSharp = async (page) => {
  if (!SHARP) return;
  await page.waitForFunction(() => { const s = window.__rmr?.gasSharp; return s !== undefined && s !== 'loading' && s !== 'waiting' && (s === 'off' || s === window.__rmr.getState().stop); }, null, { timeout: 90000, polling: 100 });
  await quietFrames(page, 400);
};

const openApp = async (page, url) => {
  await page.goto(`http://127.0.0.1:${PORT}${url}`);
  await settleApp(page);
};
const STATES = {
  overview: { proto: '#/map?twinkle=0&seed=1004', follow: true, app: (p) => openApp(p, '/map') },
  'overview-mood': {
    proto: '#/map?stop=mood&twinkle=0&seed=1004',
    follow: true,
    app: async (p) => {
      await openApp(p, '/map');
      await p.evaluate(() => window.__rmr.getState().setStop('mood'));
      await p.waitForTimeout(900);
      await settleApp(p);
    },
  },
  album: { proto: '#/album/the-stone-roses-the-stone-roses?twinkle=0&seed=1004', album: true, app: (p) => openApp(p, '/album/the-stone-roses-the-stone-roses') },
  'album-bright': { proto: '#/album/in-rainbows-radiohead?twinkle=0&seed=1004', album: true, app: (p) => openApp(p, '/album/in-rainbows-radiohead') },
  // Empty sky far from the cloud, at the Overview zoom: only the shader's grain and the prototype's dither.
  sky: {
    proto: '#/map?twinkle=0&seed=1004&names=0',
    follow: true,
    sky: true,
    app: (p) => openApp(p, '/map'),
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
/** The app's empty sky, computed: its shader writes SKY + (table[x & 255][y & 255] - 0.5) * 0.012 there and nothing
 * else (gas.ts), and the camera's limits keep real empty sky off most of the screen. The prototype's is captured. */
async function appSkyFloor(dpr) {
  await import(pathToFileURL(path.join(CWD, 'scripts/theme/bake-core.js')).href);
  const table = globalThis.RMR_THEME.noiseTable();
  const w = W * dpr, h = H * dpr, L = new Float32Array(w * h), SKY = [0.024, 0.022, 0.034], K = [0.2126, 0.7152, 0.0722];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = (table[(y & 255) * 256 + (x & 255)] / 255 - 0.5) * 0.012;
    let l = 0;
    for (let c = 0; c < 3; c++) l += K[c] * Math.round(255 * Math.min(1, Math.max(0, SKY[c] + n)));
    L[y * w + x] = l;
  }
  const geo = JSON.parse(fs.readFileSync(path.join(OUT, `sky-d${dpr}.json`), 'utf8'));
  return bandEnergies({ L, w, h }, masks({ ...geo, pts: [], focus: [] }, dpr, w, h, 6));
}
async function bandsFor(name, dpr) {
  const geo = JSON.parse(fs.readFileSync(path.join(OUT, `${name}-d${dpr}.json`), 'utf8'));
  const A = await lumaOf(path.join(OUT, `${name}-d${dpr}-app-gas.png`));
  const P = await lumaOf(path.join(OUT, `${name}-d${dpr}-prototype-gas.png`));
  const m = masks(geo, dpr, A.w, A.h, Math.max(6, geo.coverPx * 0.5 + 3));
  let used = 0;
  for (let i = 0; i < m.use.length; i++) used += m.use[i];
  return { app: bandEnergies(A, m), prototype: bandEnergies(P, m), usedShare: used / m.use.length };
}

const HIDE_APP = 'body *{visibility:hidden!important} canvas.map-canvas{visibility:visible!important} .grain{display:none!important}';

async function capture() {
  const { startServer } = await import(pathToFileURL(path.join(CWD, 'scripts/serve.mjs')).href);
  const server = await startServer(PORT);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  try {
    for (const dpr of DPRS) {
      for (const [name, st] of Object.entries(STATES)) {
        if (ONLY && !ONLY.split(',').includes(name)) continue;
        const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
        if (SHARP) await ctx.addInitScript(() => { window.__rmrGasSharp = 'force'; });
        await ctx.addInitScript((v) => { window.__rmrGasLite = v; }, LITE ? 'force' : 'off');
        const app = await ctx.newPage();
        const errors = [];
        app.on('pageerror', (e) => errors.push(e.message));
        await st.app(app);
        if (st.follow) {
          const ref = await openPrototype(ctx, st.proto);
          const ppw = await appToPrototype(app, ref);
          await ref.close();
          if (st.sky) {
            // 3 world units to the right of the cloud: outside every bake, inside the quad
            await app.evaluate(() => { const api = window.__rmr.map; api.setCamera({ ...api.getCamera(), x: 3, y: 0 }, false); });
            await settleApp(app, 400);
            st.ppw = ppw;
          }
        }
        await settleSharp(app);
        const geo = await appGeometry(app);
        if (!st.sky) await sharp(await app.screenshot({ timeout: 180000 })).jpeg({ quality: 92 }).toFile(path.join(OUT, `${name}-d${dpr}-app.jpg`));
        await app.addStyleTag({ content: HIDE_APP });
        await app.waitForTimeout(150);
        fs.writeFileSync(path.join(OUT, `${name}-d${dpr}-app-gas.png`), await app.screenshot({ timeout: 180000 }));
        await app.close();

        const gas = await openPrototype(ctx, `${st.proto}&gasonly=1`);
        let m = { ppw: st.ppw, worstPx: 0, coverPx: 6, poolAmt: 0 };
        if (st.sky) {
          await gas.evaluate((ppw) => { const R = window.RMR; R.Cam.limits = { min: 1, max: 1e9, box: [-99, -99, 99, 99] }; R.S.framing = null; R.Cam.set({ x: 3, y: 0, ppw, inset: R.cam.inset }); R.Gas.invalidate(); R.requestRender(); }, st.ppw);
        } else m = await matchPrototype(gas, geo, !!st.album);
        await gas.waitForTimeout(300);
        await quietFrames(gas, 500);
        fs.writeFileSync(path.join(OUT, `${name}-d${dpr}-prototype-gas.png`), await gas.screenshot({ timeout: 180000 }));
        await gas.close();
        await ctx.close();
        if (st.sky) { geo.pts = []; geo.focus = []; }
        fs.writeFileSync(path.join(OUT, `${name}-d${dpr}.json`), JSON.stringify({ ...geo, dpr, coverPx: m.coverPx, protoPpw: m.ppw, worstAlbumOffsetPx: m.worstPx, poolAmt: m.poolAmt, errors }));
        console.log(`${name} dpr ${dpr}: framing residual ${m.worstPx.toFixed(2)} px, ${m.ppw.toFixed(0)} px per world unit, sharper image: ${geo.gasSharp}, page errors ${errors.length}`);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

async function report() {
  const all = {};
  const md = ['# Gas detail by spatial band (written by capture-detail.mjs)', '', 'Energy is the standard deviation of the luma in the band, albums masked, over the map canvas. Bands are in px of the image: CSS px at dpr 1, device px at dpr 2. "Ratio" is app over prototype; "floor off" removes what empty sky reads in the same band (grain and dither) from both sides first.', ''];
  const r2 = (v) => v.toFixed(2);
  for (const dpr of DPRS) {
    const has = (n) => fs.existsSync(path.join(OUT, `${n}-d${dpr}.json`));
    const floor = has('sky') ? { app: await appSkyFloor(dpr), prototype: (await bandsFor('sky', dpr)).prototype } : null;
    md.push(`## dpr ${dpr}`, '', `| State | Row | ${BAND_NAMES.join(' | ')} |`, `|---|---|${BAND_NAMES.map(() => '---').join('|')}|`);
    if (floor) md.push(`| empty sky (app computed, prototype captured) | app / prototype | ${floor.app.map((v, i) => `${r2(v)} / ${r2(floor.prototype[i])}`).join(' | ')} |`);
    for (const name of Object.keys(STATES)) {
      if (name === 'sky' || !has(name)) continue;
      const b = await bandsFor(name, dpr);
      const ratio = b.app.map((v, i) => v / b.prototype[i]);
      const off = (e, f) => Math.sqrt(Math.max(0, e * e - f * f));
      const clean = floor ? b.app.map((v, i) => off(v, floor.app[i]) / off(b.prototype[i], floor.prototype[i])) : null;
      all[`${name}-d${dpr}`] = { ...b, ratio, ratioFloorOff: clean, floor };
      md.push(`| ${name} | app / prototype | ${b.app.map((v, i) => `${r2(v)} / ${r2(b.prototype[i])}`).join(' | ')} |`);
      md.push(`| ${name} | ratio | ${ratio.map(r2).join(' | ')} |`);
      if (clean) md.push(`| ${name} | ratio, floor off | ${clean.map(r2).join(' | ')} |`);
      console.log(`${name} d${dpr} ratio ${ratio.map(r2).join(' ')}${clean ? `  floor off ${clean.map(r2).join(' ')}` : ''}`);
    }
    md.push('');
  }
  fs.writeFileSync(path.join(OUT, 'bands.json'), JSON.stringify(all, null, 1));
  fs.writeFileSync(path.join(OUT, 'bands.md'), md.join('\n'));
}

if (!BANDS_ONLY) await capture();
await report();
