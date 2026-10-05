#!/usr/bin/env node
/**
 * Is the baked gas still exactly under the albums? (run from frontcreck/)
 *
 *   node ../docs/design/trifid-theme/reviews/app-gas-detail/registration.mjs [<captures dir>]
 *
 * 1. Files. Every album's raw position is mapped into both images of its stop with the map shader's own rule
 *    (gas.ts: u = (x - west) / width, v = (north - y) / height of theme.json's rectangle) and the gas luma there
 *    is compared with theme.json's stars.bg for that album, which the bake takes from a separate render of the
 *    whole square. Reported: the correlation for the true mapping and for the mapping mirrored east to west,
 *    north to south, both, and shifted by 0.01 raw units (5.5 thousandths of a world unit, 10 px at Overview)
 *    each way. Mean luma under the albums is reported too, as the earlier bake task did.
 * 2. Screen (when a captures dir of capture-detail.mjs is given). The app's gas-only picture against the
 *    prototype's at the same framing: correlation of luma away from albums at shifts of -2 to 2 px each way.
 *    The peak must be at no shift.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const sharp = require('sharp');
const theme = JSON.parse(fs.readFileSync('public/data/theme/theme.json', 'utf8'));
const positions = JSON.parse(fs.readFileSync('public/data/positions.json', 'utf8'));
const STOPS = ['sonic', 'balanced', 'mood'];
const corr = (a, b) => {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) { if (Number.isNaN(a[i])) continue; n++; sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; }
  return (sab / n - (sa / n) * (sb / n)) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
};
console.log('1. Files: gas luma under each album against theme.json stars.bg (n albums per stop: ' + theme.n + ')');
console.log('stop      image   mean luma  r true   r mirrored EW  NS     both   shifted +x     -x     +y     -y');
for (const [k, stop] of STOPS.entries()) {
  const g = theme.gas[stop], P = positions[stop], bg = Array.from({ length: theme.n }, (_, i) => theme.stars.bg[3 * i + k]);
  for (const [kind, file] of [['first', `gas-${stop}.webp`], ['sharp', `gas-${stop}-sharp.webp`]]) {
    const { data, info } = await sharp(path.join('public/data/theme', file)).raw().toBuffer({ resolveWithObject: true });
    const [x0, y0, x1, y1] = g.rect;
    const sample = (fx, fy, dx, dy) => Array.from({ length: theme.n }, (_, i) => {
      let x = P[2 * i] + dx, y = P[2 * i + 1] + dy;
      if (fx) x = x0 + x1 - x;
      if (fy) y = y0 + y1 - y;
      const u = (x - x0) / (x1 - x0), v = (y1 - y) / (y1 - y0);
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
      const o = info.channels * (Math.floor(v * info.height) * info.width + Math.floor(u * info.width));
      return 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
    });
    const t = sample(false, false, 0, 0);
    const f = (v) => v.toFixed(3).padStart(6);
    console.log(`${stop.padEnd(9)} ${kind.padEnd(7)} ${(t.reduce((s, v) => s + v, 0) / t.length).toFixed(1).padStart(9)}  ${f(corr(t, bg))}   ${f(corr(sample(true, false, 0, 0), bg))}        ${f(corr(sample(false, true, 0, 0), bg))} ${f(corr(sample(true, true, 0, 0), bg))}   ${f(corr(sample(false, false, 0.01, 0), bg))}      ${f(corr(sample(false, false, -0.01, 0), bg))} ${f(corr(sample(false, false, 0, 0.01), bg))} ${f(corr(sample(false, false, 0, -0.01), bg))}`);
  }
}
const dir = process.argv[2];
if (dir) {
  console.log('\n2. Screen: app against prototype, correlation of luma at shifts of the app picture (px); * marks the peak');
  for (const file of fs.readdirSync(dir).filter((f) => /-d\d\.json$/.test(f) && !f.startsWith('sky')).sort()) {
    const name = file.replace('.json', ''), geo = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), dpr = geo.dpr;
    const load = async (f) => { const { data, info } = await sharp(path.join(dir, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const L = new Float32Array(info.width * info.height); for (let i = 0; i < L.length; i++) L[i] = 0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2]; return { L, w: info.width, h: info.height }; };
    const A = await load(`${name}-app-gas.png`), B = await load(`${name}-prototype-gas.png`);
    const w = A.w, h = A.h, keep = new Uint8Array(w * h).fill(1), focus = new Set(geo.focus);
    geo.pts.forEach(([px, py], id) => { const r = (focus.has(id) ? 66 : Math.max(6, geo.coverPx * 0.5 + 3) + 4) * dpr; for (let y = Math.max(0, Math.floor(py * dpr - r)); y <= Math.min(h - 1, Math.ceil(py * dpr + r)); y++) for (let x = Math.max(0, Math.floor(px * dpr - r)); x <= Math.min(w - 1, Math.ceil(px * dpr + r)); x++) keep[y * w + x] = 0; });
    const c = geo.canvas, m = 20 * dpr;
    let best = [-2, 0, 0]; const rows = [];
    for (let dy = -2; dy <= 2; dy++) { const row = []; for (let dx = -2; dx <= 2; dx++) {
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let y = Math.round(c.y * dpr) + m; y < h - m; y += 2) for (let x = m; x < w - m; x += 2) { const i = y * w + x; if (!keep[i]) continue; const a = A.L[(y + dy) * w + x + dx], b = B.L[i]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
      const r = (sab / n - (sa / n) * (sb / n)) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2)); row.push(r); if (r > best[0]) best = [r, dx, dy];
    } rows.push(row); }
    console.log(`${name}: peak ${best[0].toFixed(4)} at shift (${best[1]}, ${best[2]})`);
    rows.forEach((row, j) => console.log('   ' + row.map((r, i) => (r.toFixed(4) + (i - 2 === best[1] && j - 2 === best[2] ? '*' : ' ')).padStart(8)).join('')));
  }
}
