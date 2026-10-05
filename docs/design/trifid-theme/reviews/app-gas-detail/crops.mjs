#!/usr/bin/env node
/**
 * Side by side crops for review item M1 (run from frontcreck/, after capture-detail.mjs):
 *
 *   node ../docs/design/trifid-theme/reviews/app-gas-detail/crops.mjs <out.png> <x,y,w,h in CSS px> <scale> <label=file> [<label=file> ...]
 *
 * Every file is cropped to the same CSS px rectangle (a file wider than 1600 px is taken as dpr 2 and so on), then
 * enlarged `scale` times without smoothing, so one screen px stays one square. Labels are written above each panel.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const sharp = require('sharp');
const [out, rectArg, scaleArg, ...items] = process.argv.slice(2);
const [x, y, w, h] = rectArg.split(',').map(Number);
const scale = Number(scaleArg);
const GAP = 8, TOP = 26;
const panels = [];
for (const item of items) {
  const [label, file] = [item.slice(0, item.indexOf('=')), item.slice(item.indexOf('=') + 1)];
  const meta = await sharp(file).metadata();
  const k = meta.width / 1600;
  const pw = Math.round(w * scale), ph = Math.round(h * scale);
  const buf = await sharp(file).removeAlpha().extract({ left: Math.round(x * k), top: Math.round(y * k), width: Math.round(w * k), height: Math.round(h * k) }).resize(pw, ph, { kernel: 'nearest', fit: 'fill' }).png().toBuffer();
  panels.push({ label, buf, pw, ph });
}
const W = panels.reduce((s, p) => s + p.pw, 0) + GAP * (panels.length - 1), H = TOP + panels[0].ph;
const text = panels.map((p, i) => `<text x="${panels.slice(0, i).reduce((s, q) => s + q.pw + GAP, 0) + 4}" y="18" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#fff">${p.label}</text>`).join('');
const comps = [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TOP}">${text}</svg>`), left: 0, top: 0 }];
let left = 0;
for (const p of panels) { comps.push({ input: p.buf, left, top: TOP }); left += p.pw + GAP; }
await sharp({ create: { width: W, height: H, channels: 3, background: '#202020' } }).composite(comps).png().toFile(out);
console.log(out, W, H);
