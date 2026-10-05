// Cost of the focus cover layout (state/focusLayout.ts), in two parts.
//
// 1. Per call, over every album: for each album at every stop, on a desktop and a phone viewport, the seed and
//    its ten recommendations are framed as CameraTween frames them (focusCamera, once when an album opens or
//    changes), projected to CSS px and laid out from scratch with the visible bounds (layoutMarkers). Each call
//    runs 5 times and the fastest is kept, so the numbers are the code's cost, not the machine's noise.
// 2. Per drawn frame, as MarkerDriver lays an open album out: frame sequences replayed for the worst albums
//    (phone 3278 at Balanced, desktop 2436 at Mood) and a seeded random sample: hover only (nothing moves,
//    30 frames), a pan (60 frames of 8 px; again at twice the zoom), a zoom (30 frames to 2.5 times), a slider
//    morph to the next stop (30 frames) and, on the desktop, the album panel sliding in (20 frames). The
//    current file is timed through its MarkerLayout (one per sequence, as one MarkerDriver keeps one; motion
//    frames drawn "moving", then one frame at rest that settles), each older file passed with --old through
//    its layoutMarkers on every frame, as MarkerDriver used to call it. Each sequence runs 3 times and each
//    frame's fastest run is kept. Also reported: the settle frame's cost, how far covers jump between frames
//    beyond their own album's (and the seed's) move, now and with a fresh solve every frame, and frames with an
//    overlap or a cover outside the bounds where a fresh solve has none.
//
//   node scripts/perf/layout-cost.mjs [--old path/to/focusLayout.ts ...] [--no-calls] [--sample N]
//
// Run from frontcreck/. An older focusLayout.ts (git show <rev>:frontcreck/src/components/map/state/focusLayout.ts)
// must import zoomLimits by an absolute path when it lies outside src/.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const olds = args.flatMap((a, i) => (args[i - 1] === '--old' ? [path.resolve(a)] : []));
const calls = !args.includes('--no-calls');
const sampleAt = args.indexOf('--sample');
const SAMPLE = sampleAt >= 0 ? Number(args[sampleAt + 1]) : 300;

const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src') } });
const current = await jiti.import(path.join(root, 'src/components/map/state/focusLayout.ts'));
const older = [];
for (const file of olds) older.push({ name: path.basename(file), mod: await jiti.import(file) });
const { normalizePositions } = await jiti.import(path.join(root, 'src/components/map/data.ts'));
const { FRUSTUM_HALF_HEIGHT, MIN_ZOOM, MAX_ZOOM } = await jiti.import(path.join(root, 'src/components/map/state/zoomLimits.ts'));
const { MARKER_SIZE, focusCamera, layoutMarkers, MarkerLayout } = current;

const positions = normalizePositions(JSON.parse(readFileSync(path.join(root, 'public/data/positions.json'), 'utf8')));
const recs = JSON.parse(readFileSync(path.join(root, 'public/data/recs.json'), 'utf8'));
const STOPS = Object.keys(positions);
const RECS_SHOWN = 10;
const MARKER_EDGE = 8;
// MapStage's DESKTOP_PADDING and an open album panel; PHONE_PADDING above the slider's fallback cover.
const VIEWS = {
  desktop: { width: 1440, height: 900, inset: 648, pad: { top: 262, right: 96, bottom: 90, left: 96 }, bottomCover: 0, worst: ['mood', 2436] },
  phone: { width: 390, height: 844, inset: 0, pad: { top: 80, right: 60, bottom: 169, left: 60 }, bottomCover: 165, worst: ['balanced', 3278] },
};
const clampZoom = (z) => Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
const boundsFor = (v, inset) => ({ left: inset + MARKER_EDGE, top: MARKER_EDGE, right: v.width - MARKER_EDGE, bottom: Math.min(v.height - MARKER_EDGE, v.height - v.bottomCover - MARKER_EDGE) });
const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
const us = (ms) => `${(ms * 1000).toFixed(1)} us`;
const summary = (xs) => {
  const s = Float64Array.from(xs).sort();
  return `mean ${us(xs.reduce((a, b) => a + b, 0) / xs.length)}, p99 ${us(pct(s, 0.99))}, max ${us(s[s.length - 1])}`;
};
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Warm up the JIT on a few hundred cases first.
for (const mod of [current, ...older.map((o) => o.mod)]) {
  for (let i = 0; i < 300; i++) mod.layoutMarkers([{ id: 0, x: 300, y: 300 }, ...recs.balanced[i].slice(0, RECS_SHOWN).map((id, k) => ({ id, x: 300 + k * 7, y: 300 + (k % 3) }))], 64, 46);
}

if (calls) {
  for (const { name: label, mod } of [{ name: 'current', mod: current }, ...older]) {
    console.log(`\n## Per call, every album (${label}), 5 runs per call, fastest kept`);
    for (const [name, v] of Object.entries(VIEWS)) {
      const bounds = boundsFor(v, v.inset);
      const cam = [];
      const lay = [];
      let worst = null;
      for (const stop of STOPS) {
        const pos = positions[stop];
        recs[stop].forEach((list, seed) => {
          const ids = [seed, ...list.slice(0, RECS_SHOWN)];
          const fastest = (fn) => {
            let best = Infinity;
            let out;
            for (let r = 0; r < 5; r++) {
              const t0 = performance.now();
              out = fn();
              best = Math.min(best, performance.now() - t0);
            }
            return [best, out];
          };
          const [tc, c] = fastest(() => mod.focusCamera(ids, pos, v.width, v.height, v.inset, v.pad, clampZoom));
          const k = (v.height * c.zoom) / (2 * FRUSTUM_HALF_HEIGHT);
          const cx = v.inset + (v.width - v.inset) / 2;
          const anchors = ids.map((id) => ({ id, x: cx + (pos[2 * id] - c.x) * k, y: v.height / 2 - (pos[2 * id + 1] - c.y) * k }));
          const [tl] = fastest(() => mod.layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds }));
          cam.push(tc);
          lay.push(tl);
          if (!worst || tl > worst.tl) worst = { stop, seed, tl };
        });
      }
      console.log(`${name} focusCamera (once per album open): n ${cam.length}, ${summary(cam)}`);
      console.log(`${name} layoutMarkers with bounds (a full solve): n ${lay.length}, ${summary(lay)}; worst album ${worst.seed} at ${worst.stop}`);
    }
  }
}

/** The frames of one sequence: each is { anchors, bounds }. */
function sequences(v, stop, seed) {
  const ids = [seed, ...recs[stop][seed].slice(0, RECS_SHOWN)];
  const pos = positions[stop];
  const c = focusCamera(ids, pos, v.width, v.height, v.inset, v.pad, clampZoom);
  const k0 = (v.height * c.zoom) / (2 * FRUSTUM_HALF_HEIGHT);
  const frame = (p, camX, camY, k, inset) => {
    const cx = inset + (v.width - inset) / 2;
    return { anchors: ids.map((id) => ({ id, x: cx + (p[2 * id] - camX) * k, y: v.height / 2 - (p[2 * id + 1] - camY) * k })), bounds: boundsFor(v, inset) };
  };
  const out = {};
  out.hover = Array.from({ length: 31 }, () => frame(pos, c.x, c.y, k0, v.inset));
  // 8 px a frame, down and to the right, so the group runs into the walls on a phone.
  out.pan = Array.from({ length: 61 }, (_, f) => frame(pos, c.x - (f * 8 * 0.894) / k0, c.y + (f * 8 * 0.447) / k0, k0, v.inset));
  // The same pan zoomed in twice as far: more groups are wider than the bounds and held at a wall.
  out['pan at 2x zoom'] = Array.from({ length: 61 }, (_, f) => frame(pos, c.x - (f * 8 * 0.894) / k0 / 2, c.y + (f * 8 * 0.447) / k0 / 2, k0 * 2, v.inset));
  out.zoom = Array.from({ length: 31 }, (_, f) => frame(pos, c.x, c.y, k0 * 2.5 ** (f / 30), v.inset));
  const next = STOPS[(STOPS.indexOf(stop) + 1) % STOPS.length];
  const to = positions[next];
  const mix = new Float32Array(pos.length);
  out.morph = Array.from({ length: 31 }, (_, f) => {
    const t = f / 30;
    const e = t * t * (3 - 2 * t);
    for (let i = 0; i < pos.length; i++) mix[i] = pos[i] + (to[i] - pos[i]) * e;
    return frame(mix, c.x, c.y, k0, v.inset);
  });
  if (v.inset > 0) out.panel = Array.from({ length: 21 }, (_, f) => frame(pos, c.x, c.y, k0, (v.inset * f) / 20));
  return out;
}

console.log(`\n## Per drawn frame, an open album, 3 runs per sequence, fastest kept`);
console.log(`albums: the worst album of each viewport plus ${SAMPLE} random (album, stop) pairs (seed 2026)`);
console.log(`frame 0 (the album opening, a fresh solve) is not counted; every motion frame is drawn "moving", and one more`);
console.log(`frame at the same view, not moving, ends it (the settle: pointerup, or the motion's flags clearing).`);
/** Overlapping boxes (gap 10, 1 px slack) and boxes outside the bounds (0.01 px slack) in one layout. */
function faults(items, b) {
  let bad = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (p.x - p.size / 2 < b.left - 0.01 || p.x + p.size / 2 > b.right + 0.01 || p.y - p.size / 2 < b.top - 0.01 || p.y + p.size / 2 > b.bottom + 0.01) bad++;
    for (let j = i + 1; j < items.length; j++) {
      const q = items[j];
      const need = (p.size + q.size) / 2 + 10;
      if (Math.abs(q.x - p.x) < need - 1 && Math.abs(q.y - p.y) < need - 1) bad++;
    }
  }
  return bad;
}
/** Largest jump of a cover between two frames beyond its own album's move, and beyond the seed's move. */
function jumps(prev, cur) {
  let own = 0;
  let seed = 0;
  const ds = [cur[0].ax - prev[0].ax, cur[0].ay - prev[0].ay];
  cur.forEach((m, i) => {
    const dx = m.x - prev[i].x;
    const dy = m.y - prev[i].y;
    own = Math.max(own, Math.hypot(dx - (m.ax - prev[i].ax), dy - (m.ay - prev[i].ay)));
    seed = Math.max(seed, Math.hypot(dx - ds[0], dy - ds[1]));
  });
  return [own, seed];
}
const snap = (items) => items.map((m) => ({ x: m.x, y: m.y, ax: m.ax, ay: m.ay }));
for (const [name, v] of Object.entries(VIEWS)) {
  const rand = seeded(2026);
  const picks = [v.worst, ...Array.from({ length: SAMPLE }, () => [STOPS[Math.floor(rand() * 3)], Math.floor(rand() * recs.balanced.length)])];
  const rows = {};
  const settle = { t: [], worst: null, gap: 0, faultsFresh: 0 };
  for (const [pi, [stop, seed]] of picks.entries()) {
    for (const [kind, frames] of Object.entries(sequences(v, stop, seed))) {
      const row = (rows[`${kind}${pi === 0 ? ' (worst album)' : ''}`] ??= { cur: [], old: older.map(() => []), jumpNow: [], jumpFresh: [], faults: 0, faultsFresh: 0, frames: 0 });
      const motion = kind !== 'hover';
      const best = new Float64Array(frames.length + 1).fill(Infinity);
      const oldBest = older.map(() => new Float64Array(frames.length).fill(Infinity));
      for (let run = 0; run < 3; run++) {
        const cache = new MarkerLayout();
        let prevNow = null;
        let prevFresh = null;
        frames.forEach((fr, f) => {
          const t0 = performance.now();
          const got = cache.layout(fr.anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds: fr.bounds, moving: motion && f > 0 });
          best[f] = Math.min(best[f], performance.now() - t0);
          if (run > 0) return;
          const fresh = layoutMarkers(fr.anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds: fr.bounds });
          if (f > 0) {
            row.frames++;
            const fFresh = faults(fresh, fr.bounds);
            if (fFresh) row.faultsFresh++;
            else if (faults(got, fr.bounds)) row.faults++;
            row.jumpNow.push(jumps(prevNow, got));
            row.jumpFresh.push(jumps(prevFresh, fresh));
          }
          prevNow = snap(got);
          prevFresh = snap(fresh);
        });
        // The frame that ends the motion: the same view, not moving.
        const lastFr = frames[frames.length - 1];
        const t0 = performance.now();
        const rest = cache.layout(lastFr.anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds: lastFr.bounds });
        const t = performance.now() - t0;
        best[frames.length] = Math.min(best[frames.length], t);
        if (run === 0) {
          const fresh = layoutMarkers(lastFr.anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds: lastFr.bounds });
          rest.forEach((m, i) => (settle.gap = Math.max(settle.gap, Math.abs(m.x - fresh[i].x), Math.abs(m.y - fresh[i].y))));
        }
        older.forEach(({ mod }, oi) => {
          frames.forEach((fr, f) => {
            const t1 = performance.now();
            mod.layoutMarkers(fr.anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds: fr.bounds });
            oldBest[oi][f] = Math.min(oldBest[oi][f], performance.now() - t1);
          });
        });
      }
      for (let f = 1; f < frames.length; f++) {
        row.cur.push(best[f]);
        older.forEach((_, oi) => row.old[oi].push(oldBest[oi][f]));
      }
      if (motion) {
        settle.t.push(best[frames.length]);
        if (!settle.worst || best[frames.length] > settle.worst.t) settle.worst = { t: best[frames.length], stop, seed, kind };
      }
    }
  }
  console.log(`\n### ${name}`);
  const q = (xs, p) => Float64Array.from(xs).sort()[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1)))];
  for (const [kind, r] of Object.entries(rows)) {
    console.log(`${kind}: ${r.frames} frames; now (MarkerLayout) ${summary(r.cur)}`);
    older.forEach((o, oi) => console.log(`  ${o.name} (layoutMarkers every frame) ${summary(r.old[oi])}`));
    const jn = r.jumpNow;
    const jf = r.jumpFresh;
    console.log(
      `  steadiness, cover jump beyond its album's move p99 / max: now ${q(jn.map((j) => j[0]), 0.99).toFixed(1)} / ${q(jn.map((j) => j[0]), 1).toFixed(1)} px, fresh every frame ${q(jf.map((j) => j[0]), 0.99).toFixed(1)} / ${q(jf.map((j) => j[0]), 1).toFixed(1)} px;` +
        ` beyond the seed's move: now ${q(jn.map((j) => j[1]), 0.99).toFixed(1)} / ${q(jn.map((j) => j[1]), 1).toFixed(1)} px, fresh ${q(jf.map((j) => j[1]), 0.99).toFixed(1)} / ${q(jf.map((j) => j[1]), 1).toFixed(1)} px`,
    );
    console.log(`  frames with an overlap or a cover outside the bounds: now ${r.faults} where a fresh solve has none; fresh solve itself ${r.faultsFresh}`);
  }
  console.log(`settle frame (the motion's end, a fresh solve): n ${settle.t.length}, ${summary(settle.t)}; worst ${settle.worst.kind} of album ${settle.worst.seed} at ${settle.worst.stop}; largest gap to a fresh solve ${settle.gap.toExponential(2)} px`);
}
