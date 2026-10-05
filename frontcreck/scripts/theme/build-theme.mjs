#!/usr/bin/env node
/** npm run theme: bakes the map theme into public/data/theme/ (three gas textures and theme.json).
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

/** Checks one baked stop, writes it as WebP (lossy colour, lossless dust channel) and a flattened preview. */
async function writeGas(stop, rgba, size) {
  let light = 0;
  let minA = 255;
  for (let i = 0; i < rgba.length; i += 4) {
    light += rgba[i] + rgba[i + 1] + rgba[i + 2];
    if (rgba[i + 3] < minA) minA = rgba[i + 3];
  }
  const mean = light / (3 * size * size);
  // dust lets through at least 1 - 0.8 = 0.2 (51 of 255); a blank or fully see-through bake means the shader broke
  if (mean < 2 || minA < 45) throw new Error(`gas-${stop}: the bake looks wrong (mean colour ${mean.toFixed(1)}, lowest dust ${minA})`);
  const raw = { raw: { width: size, height: size, channels: 4 } };
  const webp = await sharp(rgba, raw).webp({ quality: 84, alphaQuality: 100, effort: 5 }).toBuffer();
  // Decode it again: the colour must stay close everywhere, also under dust (a premultiplied encode would darken
  // exactly those pixels), and the dust channel must come back as written.
  const back = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  if (back.info.width !== size || back.info.height !== size || back.info.channels !== 4) throw new Error(`gas-${stop}: decoded as ${back.info.width}x${back.info.height}x${back.info.channels}`);
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
  const meanErr = err / (3 * size * size);
  const meanDustErr = dustPx ? dustErr / (3 * dustPx) : 0;
  if (meanErr > 4 || meanDustErr > 8 || alphaErr > 2) throw new Error(`gas-${stop}: the WebP differs from the bake (colour ${meanErr.toFixed(2)}, colour under dust ${meanDustErr.toFixed(2)}, dust ${alphaErr})`);
  writeAtomic(path.join(OUT, `gas-${stop}.webp`), webp);
  await sharp(rgba, raw).flatten({ background: SKY }).resize(768, 768).png().toFile(path.join(PREVIEW, `gas-${stop}.png`));
  return webp.length;
}

async function main() {
  const input = loadInput();
  const { bakeHalf, rawHalf } = T.halves(input.positions);
  const size = T.GAS.BAKE;
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PREVIEW, { recursive: true });
  const lumPx = {};
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
    for (const stop of T.STOPS) {
      const t0 = Date.now();
      lumPx[stop] = new Uint8Array(Buffer.from(await page.evaluate((s) => globalThis.RMR_THEME.renderStop(s), stop), 'base64'));
      const rgba = Buffer.alloc(4 * size * size);
      for (let y0 = 0; y0 < size; y0 += STRIP_ROWS) {
        const strip = Buffer.from(await page.evaluate(([y, rows]) => globalThis.RMR_THEME.readRows(y, rows), [y0, STRIP_ROWS]), 'base64');
        // GL rows run from the south edge up; the file is stored upright, row 0 at the north edge.
        for (let r = 0; r < STRIP_ROWS; r++) strip.copy(rgba, 4 * size * (size - 1 - (y0 + r)), 4 * size * r, 4 * size * (r + 1));
      }
      const bytes = await writeGas(stop, rgba, size);
      console.log(`gas-${stop}.webp ${Math.round(bytes / 1024)} KB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    if (errors.length) throw new Error(`the bake page reported: ${errors.join('; ')}`);
  } finally {
    await browser.close();
  }
  const theme = T.assemble(input, lumPx, bakeHalf, rawHalf);
  writeAtomic(path.join(OUT, 'theme.json'), `${JSON.stringify(theme)}\n`);
  const names = T.STOPS.map((s) => `${s} ${theme.labels[s].length}`).join(', ');
  console.log(`theme.json ${Math.round(fs.statSync(path.join(OUT, 'theme.json')).size / 1024)} KB (names: ${names}; positions ${theme.positionsHash})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
