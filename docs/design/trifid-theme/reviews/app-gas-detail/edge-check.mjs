#!/usr/bin/env node
/**
 * Does the gas end in plain sky with no visible edge where a stop's image ends? (run from frontcreck/ against a
 * production build; it starts and stops its own `next start`; Playwright's Chromium on software WebGL)
 *
 *   node ../docs/design/trifid-theme/reviews/app-gas-detail/edge-check.mjs <out dir>
 *
 * For each stop the map is zoomed out as far as it goes, so the whole rectangle of the stop's image is on screen,
 * and captured with everything but the canvas hidden. Written: <stop>-edge.png (the capture with levels 0 to 40
 * stretched to the full range, the image's rectangle marked by four ticks outside it) and, printed, the largest
 * step in luma across each of the rectangle's four edges (mean of the 6 px outside against the 6 px inside, per
 * 16 px run along the edge) beside the same figure 40 px further out, where there is only sky and grain.
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
const OUT = path.resolve(process.argv[2] ?? 'edge-check');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 3600, W = 1600, H = 1000;
const theme = JSON.parse(fs.readFileSync('public/data/theme/theme.json', 'utf8'));
const server = await startServer(PORT);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const stop of ['sonic', 'balanced', 'mood']) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`http://127.0.0.1:${PORT}/map`);
    await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'ready', null, { timeout: 60000 });
    if (stop !== 'balanced') await page.evaluate((s) => window.__rmr.getState().setStop(s), stop);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const api = window.__rmr.map; api.setCamera({ ...api.getCamera(), zoom: 0.01 }, false); });
    await page.waitForTimeout(800);
    // two albums give the raw to screen mapping (positions.json is in raw units)
    const map = await page.evaluate(async (s) => {
      const pos = (await (await fetch('/data/positions.json')).json())[s];
      const api = window.__rmr.map;
      let a = 0, b = 1, best = -1;
      for (let i = 0; i < pos.length / 2; i += 53) for (let j = i + 1; j < pos.length / 2; j += 59) { const d = Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]); if (d > best) { best = d; a = i; b = j; } }
      const pa = api.screenPoint(a), pb = api.screenPoint(b);
      const k = Math.hypot(pa.x - pb.x, pa.y - pb.y) / best;
      return { k, x0: pa.x - pos[2 * a] * k, y0: pa.y + pos[2 * a + 1] * k };
    }, stop);
    await page.addStyleTag({ content: 'body *{visibility:hidden!important} canvas.map-canvas{visibility:visible!important} .grain{display:none!important}' });
    await page.waitForTimeout(200);
    const png = await page.screenshot();
    await page.close();
    const [rx0, ry0, rx1, ry1] = theme.gas[stop].rect;
    const sx = (x) => map.x0 + x * map.k, sy = (y) => map.y0 - y * map.k;
    const box = { l: sx(rx0), r: sx(rx1), t: sy(ry1), b: sy(ry0) };
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const L = (x, y) => { const o = 3 * (Math.round(y) * W + Math.round(x)); return 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]; };
    const inView = (x, y) => x >= 8 && x < W - 8 && y >= 72 && y < H - 8;
    /** Largest step across a line: vertical (x fixed) or horizontal (y fixed), in 16 px runs along it. */
    const step = (vertical, at, from, to) => {
      let worst = null; // null: this line is off screen or under the header
      for (let s = from; s + 16 <= to; s += 16) {
        let a = 0, b = 0, n = 0;
        for (let i = 0; i < 16; i++) for (let d = 1; d <= 6; d++) {
          const [x1, y1, x2, y2] = vertical ? [at - d, s + i, at + d, s + i] : [s + i, at - d, s + i, at + d];
          if (!inView(x1, y1) || !inView(x2, y2)) continue;
          a += L(x1, y1); b += L(x2, y2); n++;
        }
        if (n) worst = Math.max(worst ?? 0, Math.abs(a - b) / n);
      }
      return worst;
    };
    const show = (v) => (v === null ? 'not on screen' : v.toFixed(2));
    const edges = { west: [true, box.l, box.t, box.b, -40], east: [true, box.r, box.t, box.b, 40], north: [false, box.t, box.l, box.r, -40], south: [false, box.b, box.l, box.r, 40] };
    const out = Object.entries(edges).map(([name, [v, at, from, to, away]]) => `${name} ${show(step(v, at, from, to))} (sky ${show(step(v, at + away, from, to))})`);
    console.log(`${stop}: image rectangle on screen x ${box.l.toFixed(0)} to ${box.r.toFixed(0)}, y ${box.t.toFixed(0)} to ${box.b.toFixed(0)}; largest luma step across each edge: ${out.join(', ')}`);
    const tick = (x, y, w, h) => ({ input: { create: { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)), channels: 3, background: '#00ff00' } }, left: Math.round(x), top: Math.round(y) });
    const marks = [tick(box.l, box.t - 14, 1, 10), tick(box.r, box.t - 14, 1, 10), tick(box.l - 14, box.t, 10, 1), tick(box.l - 14, box.b, 10, 1)].filter((m) => m.left >= 0 && m.top >= 0 && m.left < W && m.top < H);
    await sharp(png).removeAlpha().linear(255 / 40, 0).composite(marks).png().toFile(path.join(OUT, `${stop}-edge.png`));
  }
} finally {
  await browser.close();
  await server.stop();
}
