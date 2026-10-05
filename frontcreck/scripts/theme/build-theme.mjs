#!/usr/bin/env node
/** npm run theme: bakes the map theme into public/data/theme/ (two gas images per slider stop and theme.json).
 * Each gas image carries the first 10 hex characters of the SHA-256 of its own bytes in its name, and theme.json
 * records them: /data is cached by browsers for a day, so an image whose content changed must change its name,
 * or a visitor could draw an old image into a new rectangle. Images of an earlier bake are deleted.
 * One headless Chromium on software WebGL does the shading, so the output is the same on every machine.
 * Inputs: data-pipeline/theme/{weights,regions}.json and public/data/{albums,positions}.json. It refuses to run
 * when the inputs were made for other albums or layouts. Previews for a human go to test-results/theme/. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { assertNativeChrome } from '../check-native.mjs';
import './bake-core.js';

const T = globalThis.RMR_THEME;
const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '../..');
const DATA = path.join(ROOT, 'public/data');
const OUT = path.join(DATA, 'theme');
const INPUTS = path.resolve(ROOT, '../data-pipeline/theme');
const PREVIEW = path.join(ROOT, 'test-results/theme');
// Software WebGL in headless Chrome, as playwright.config.ts and scripts/perf/perf.mjs start it.
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SKY = { r: 6, g: 6, b: 9 };
const STRIP_ROWS = 256;
// Colour quality of the gas images. At 84 the flow lines one or two texels wide were smeared and dark gas showed
// blocks. At 95 every band of fine detail reads as in the lossless bake; 93 loses about one part in a hundred of
// the finest two bands and keeps the image every visitor downloads first near 300 KB (reviews/app-gas-detail.md).
const WEBP_QUALITY = { first: 93, sharp: 95 };

const shortHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function writeAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function loadInput() {
  const albums = readJson(path.join(DATA, 'albums.json'));
  const positionsBytes = fs.readFileSync(path.join(DATA, 'positions.json'));
  const positions = JSON.parse(positionsBytes.toString('utf8'));
  const weights = readJson(path.join(INPUTS, 'weights.json'));
  const regions = readJson(path.join(INPUTS, 'regions.json'));
  const n = albums.length;
  const positionsHash = shortHash(positionsBytes);
  const again = 'Refresh data-pipeline/theme (see its README), then run npm run theme again.';
  if (weights.n !== n || weights.weights.length !== 6 * n) throw new Error(`weights.json covers ${weights.n} albums but albums.json has ${n}. ${again}`);
  if (weights.slugsHash !== shortHash(Buffer.from(albums.map((a) => a.slug).join('\n'), 'utf8'))) throw new Error(`weights.json was made for another album list. ${again}`);
  if (regions.positionsHash !== positionsHash) throw new Error(`regions.json was made for other layouts. ${again}`);
  for (const stop of T.STOPS) {
    if (!Array.isArray(positions[stop]) || positions[stop].length !== 2 * n) throw new Error(`positions.json: ${stop} does not hold ${n} points`);
    if (!Array.isArray(regions[stop])) throw new Error(`regions.json: no ${stop} list. ${again}`);
  }
  return { n, positions, positionsHash, weights: weights.weights, regions };
}

/** What is asked of every gas image before it is written: it holds gas, the dust channel is sane, and its outer
 * `ring` px are plain sky: no dust and no light over `trace` levels of 255 (0 in the bake; a lossy encode may put
 * a level into flat black, which the map's shader fades out over the outer fiftieth of the image). So the map
 * can end the gas at the image's edge with no step. */
function checkGas(name, rgba, w, h, ring, trace) {
  let light = 0;
  let minA = 255;
  for (let i = 0; i < rgba.length; i += 4) {
    light += rgba[i] + rgba[i + 1] + rgba[i + 2];
    if (rgba[i + 3] < minA) minA = rgba[i + 3];
  }
  const mean = light / (3 * w * h);
  // dust lets through at least 1 - 0.8 = 0.2 (51 of 255); a blank or fully see-through bake means the shader broke
  if (mean < 2 || minA < 45) throw new Error(`${name}: the bake looks wrong (mean colour ${mean.toFixed(1)}, lowest dust ${minA})`);
  for (let y = 0; y < h; y++) {
    const inner = y >= ring && y < h - ring;
    for (let x = 0; x < w; x += inner && x === ring - 1 ? w - 2 * ring + 1 : 1) {
      const o = 4 * (y * w + x);
      if (Math.max(rgba[o], rgba[o + 1], rgba[o + 2]) > trace || rgba[o + 3] !== 255) throw new Error(`${name}: gas or dust at the edge of its rectangle (px ${x}, ${y}). Raise GAS.RECT_PAD in bake-core.js.`);
    }
  }
}

/** Makes the outer `m` px of a bake plain sky. The rectangle was found on a coarse bake, so the last trace of
 * gas (one or two levels of 255) can reach a little further than it showed there; left in, a lossy encode would
 * smear it to the very edge. Refuses when there is more than a trace: then the rectangle is too tight. */
function clearEdge(name, rgba, w, h, m) {
  let most = 0;
  for (let y = 0; y < h; y++) {
    const inner = y >= m && y < h - m;
    for (let x = 0; x < w; x++) {
      if (inner && x === m) x = w - m;
      const o = 4 * (y * w + x);
      most = Math.max(most, rgba[o], rgba[o + 1], rgba[o + 2], 255 - rgba[o + 3]);
      rgba[o] = rgba[o + 1] = rgba[o + 2] = 0;
      rgba[o + 3] = 255;
    }
  }
  if (most > 2) throw new Error(`${name}: gas or dust (${most} of 255) in the outer ${m} px of its rectangle. Raise GAS.RECT_PAD in bake-core.js.`);
}

/** The smaller image of a stop: the sharp bake resampled (Lanczos), which keeps more of the fine swirl than
 * shading at the smaller size does. Colour and dust are resampled apart: the dust channel is data, not opacity,
 * and must not be multiplied into the colour. */
async function downsample(rgba, w, h, w2, h2) {
  const src = () => sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
  const rgb = await src().removeAlpha().resize(w2, h2, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const a = await src().extractChannel(3).resize(w2, h2, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  // The kernel overshoots beside a sharp dust lane; the dust never gets denser than the bake made it.
  let minA = 255;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < minA) minA = rgba[i];
  const out = Buffer.alloc(4 * w2 * h2);
  for (let i = 0; i < w2 * h2; i++) {
    out[4 * i] = rgb[3 * i];
    out[4 * i + 1] = rgb[3 * i + 1];
    out[4 * i + 2] = rgb[3 * i + 2];
    out[4 * i + 3] = Math.max(minA, a[i]);
  }
  return out;
}

/** Writes one image as WebP (lossy colour at a quality that keeps lines one texel wide, lossless dust channel)
 * after checking it, and checks the file once more as a browser will decode it. `stem` is the name without the
 * hash of the content, which is added here; returns the size and that hash. */
async function writeGas(stem, rgba, w, h, quality) {
  const name = `${stem}.webp`;
  checkGas(name, rgba, w, h, 16, 0);
  const raw = { raw: { width: w, height: h, channels: 4 } };
  const webp = await sharp(rgba, raw).webp({ quality, alphaQuality: 100, effort: 5 }).toBuffer();
  // Decode it again: the colour must stay close everywhere, also under dust (a premultiplied encode would darken
  // exactly those pixels), the dust channel must come back as written, and the edge must still be plain sky.
  const back = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  if (back.info.width !== w || back.info.height !== h || back.info.channels !== 4) throw new Error(`${name}: decoded as ${back.info.width}x${back.info.height}x${back.info.channels}`);
  let err = 0;
  let dustErr = 0;
  let dustPx = 0;
  let alphaErr = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const d = Math.abs(rgba[i] - back.data[i]) + Math.abs(rgba[i + 1] - back.data[i + 1]) + Math.abs(rgba[i + 2] - back.data[i + 2]);
    err += d;
    if (rgba[i + 3] < 200) {
      dustErr += d;
      dustPx++;
    }
    alphaErr = Math.max(alphaErr, Math.abs(rgba[i + 3] - back.data[i + 3]));
  }
  const meanErr = err / (3 * w * h);
  const meanDustErr = dustPx ? dustErr / (3 * dustPx) : 0;
  if (meanErr > 2 || meanDustErr > 4 || alphaErr > 2) throw new Error(`${name}: the WebP differs from the bake (colour ${meanErr.toFixed(2)}, colour under dust ${meanDustErr.toFixed(2)}, dust ${alphaErr})`);
  checkGas(name, back.data, w, h, 16, 2);
  const hash = T.gasHash(crypto.createHash('sha256').update(webp).digest('hex'));
  writeAtomic(path.join(OUT, T.gasFile(stem, hash)), webp);
  return { bytes: webp.length, hash };
}

async function main() {
  const input = loadInput();
  const { bakeHalf, rawHalf } = T.halves(input.positions);
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PREVIEW, { recursive: true });
  const lumPx = {};
  const gas = {};
  const browser = await chromium.launch({ args: WEBGL_ARGS });
  try {
    await assertNativeChrome(browser);
    const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<!doctype html><canvas id="gl" width="16" height="16"></canvas>');
    await page.addScriptTag({ path: path.join(HERE, 'bake-core.js') });
    await page.addScriptTag({ path: path.join(HERE, 'bake-page.js') });
    const info = await page.evaluate((i) => globalThis.RMR_THEME.start(i), { n: input.n, positions: input.positions, weights: input.weights });
    console.log(`baking ${input.n} albums, raw square of half ${info.bakeHalf.toFixed(2)}, on ${info.renderer}`);
    const bytes = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
    for (const stop of T.STOPS) {
      const t0 = Date.now();
      lumPx[stop] = bytes(await page.evaluate((s) => globalThis.RMR_THEME.renderLum(s), stop));
      // Where this stop's gas is, then that rectangle alone at the prototype's resolution.
      const rect = T.gasRect(bytes(await page.evaluate((s) => globalThis.RMR_THEME.probe(s), stop)), T.GAS.PROBE, bakeHalf);
      const { px, sharp: big } = T.gasSizes(rect, bakeHalf);
      const [w, h] = big;
      await page.evaluate(([s, r, ww, hh]) => globalThis.RMR_THEME.renderStop(s, r, ww, hh), [stop, rect, w, h]);
      const rgba = Buffer.alloc(4 * w * h);
      for (let y0 = 0; y0 < h; y0 += STRIP_ROWS) {
        const rows = Math.min(STRIP_ROWS, h - y0);
        const strip = Buffer.from(await page.evaluate(([y, n]) => globalThis.RMR_THEME.readRows(y, n), [y0, rows]), 'base64');
        // GL rows run from the south edge up; the file is stored upright, row 0 at the north edge.
        for (let r = 0; r < rows; r++) strip.copy(rgba, 4 * w * (h - 1 - (y0 + r)), 4 * w * r, 4 * w * (r + 1));
      }
      // half of the padding becomes exact sky: over 16 px (a codec block) in the smaller image too
      clearEdge(`gas-${stop}`, rgba, w, h, Math.floor((T.GAS.RECT_PAD * w) / (rect[2] - rect[0]) / 2));
      const small = await downsample(rgba, w, h, px[0], px[1]);
      const files = [await writeGas(`gas-${stop}`, small, px[0], px[1], WEBP_QUALITY.first), await writeGas(`gas-${stop}-sharp`, rgba, w, h, WEBP_QUALITY.sharp)];
      const kb = files.map((f) => Math.round(f.bytes / 1024));
      const hash = files.map((f) => f.hash);
      await sharp(small, { raw: { width: px[0], height: px[1], channels: 4 } }).flatten({ background: SKY }).resize(768, 768, { fit: 'contain', background: SKY }).png().toFile(path.join(PREVIEW, `gas-${stop}.png`));
      gas[stop] = { rect, px, sharp: big, hash };
      console.log(`${T.gasFile(`gas-${stop}`, hash[0])} ${px.join(' x ')}, ${kb[0]} KB; ${T.gasFile(`gas-${stop}-sharp`, hash[1])} ${big.join(' x ')}, ${kb[1]} KB; raw x ${rect[0]} to ${rect[2]}, y ${rect[1]} to ${rect[3]} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    if (errors.length) throw new Error(`the bake page reported: ${errors.join('; ')}`);
  } finally {
    await browser.close();
  }
  const theme = T.assemble(input, lumPx, bakeHalf, rawHalf, gas);
  writeAtomic(path.join(OUT, 'theme.json'), `${JSON.stringify(theme)}\n`);
  // Only after theme.json names the new images: the images of an earlier bake (and the names without a hash).
  const keep = new Set(T.gasFiles(theme.gas));
  for (const f of fs.readdirSync(OUT)) {
    if (/^gas-.*\.webp$/.test(f) && !keep.has(f)) fs.rmSync(path.join(OUT, f));
  }
  const names = T.STOPS.map((s) => `${s} ${theme.labels[s].length}`).join(', ');
  console.log(`theme.json ${Math.round(fs.statSync(path.join(OUT, 'theme.json')).size / 1024)} KB (names: ${names}; positions ${theme.positionsHash})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
