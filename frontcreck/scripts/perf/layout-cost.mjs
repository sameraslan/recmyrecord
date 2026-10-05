// Cost of the focus cover layout (state/focusLayout.ts) over every album, at every stop, on a desktop and a phone
// viewport. For each album the seed and its ten recommendations are framed as CameraTween frames them
// (focusCamera, once when an album opens or changes), projected to CSS px, and laid out as MarkerDriver lays
// them out on a drawn frame while the album is open (layoutMarkers with the visible bounds). Each call is
// repeated and its fastest run kept, so the numbers are the code's cost, not the machine's noise.
//
//   node scripts/perf/layout-cost.mjs [path/to/focusLayout.ts]   (from frontcreck/; default: the current file)
//
// Pass an older copy of focusLayout.ts to compare two versions on the same machine.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src') } });
const file = path.resolve(process.argv[2] ?? path.join(root, 'src/components/map/state/focusLayout.ts'));
const { MARKER_SIZE, focusCamera, layoutMarkers } = await jiti.import(file);
const { normalizePositions } = await jiti.import(path.join(root, 'src/components/map/data.ts'));
const { FRUSTUM_HALF_HEIGHT, MIN_ZOOM, MAX_ZOOM } = await jiti.import(path.join(root, 'src/components/map/state/zoomLimits.ts'));

const positions = normalizePositions(JSON.parse(readFileSync(path.join(root, 'public/data/positions.json'), 'utf8')));
const recs = JSON.parse(readFileSync(path.join(root, 'public/data/recs.json'), 'utf8'));
const REPEAT = 5;
const RECS_SHOWN = 10;
const MARKER_EDGE = 8;
// MapStage's DESKTOP_PADDING and an open album panel; PHONE_PADDING above the slider's fallback cover.
const VIEWS = {
  desktop: { width: 1440, height: 900, inset: 648, pad: { top: 262, right: 96, bottom: 90, left: 96 }, bottomCover: 0 },
  phone: { width: 390, height: 844, inset: 0, pad: { top: 80, right: 60, bottom: 169, left: 60 }, bottomCover: 165 },
};
const clampZoom = (z) => Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);

function fastest(fn) {
  let best = Infinity;
  let out;
  for (let r = 0; r < REPEAT; r++) {
    const t0 = performance.now();
    out = fn();
    best = Math.min(best, performance.now() - t0);
  }
  return [best, out];
}

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
const fmt = (ms) => `${(ms * 1000).toFixed(0)} us`;

// Warm up the JIT on a few hundred cases first.
for (let i = 0; i < 300; i++) layoutMarkers([{ id: 0, x: 300, y: 300 }, ...recs.balanced[i].slice(0, RECS_SHOWN).map((id, k) => ({ id, x: 300 + k, y: 300 }))], 64, 46);

console.log(`layout: ${path.relative(root, file)}, ${REPEAT} runs per call, fastest kept`);
for (const [name, v] of Object.entries(VIEWS)) {
  const bounds = { left: v.inset + MARKER_EDGE, top: MARKER_EDGE, right: v.width - MARKER_EDGE, bottom: Math.min(v.height - MARKER_EDGE, v.height - v.bottomCover - MARKER_EDGE) };
  const cam = [];
  const lay = [];
  let worst = null;
  for (const stop of Object.keys(positions)) {
    const pos = positions[stop];
    recs[stop].forEach((list, seed) => {
      const ids = [seed, ...list.slice(0, RECS_SHOWN)];
      const [tc, c] = fastest(() => focusCamera(ids, pos, v.width, v.height, v.inset, v.pad, clampZoom));
      const k = (v.height * c.zoom) / (2 * FRUSTUM_HALF_HEIGHT);
      const cx = v.inset + (v.width - v.inset) / 2;
      const anchors = ids.map((id) => ({ id, x: cx + (pos[2 * id] - c.x) * k, y: v.height / 2 - (pos[2 * id + 1] - c.y) * k }));
      const [tl] = fastest(() => layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds }));
      cam.push(tc);
      lay.push(tl);
      if (!worst || tl > worst.tl) worst = { stop, seed, tl, tc };
    });
  }
  for (const [label, xs] of [['focusCamera (once per album open)', cam], ['layoutMarkers with bounds (per drawn frame)', lay]]) {
    const s = Float64Array.from(xs).sort();
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`${name} ${label}: n ${xs.length}, mean ${fmt(mean)}, median ${fmt(pct(s, 0.5))}, p99 ${fmt(pct(s, 0.99))}, max ${fmt(s[s.length - 1])}`);
  }
  console.log(`${name} worst layout: album ${worst.seed} at ${worst.stop}, layoutMarkers ${fmt(worst.tl)}, focusCamera ${fmt(worst.tc)}`);
}
