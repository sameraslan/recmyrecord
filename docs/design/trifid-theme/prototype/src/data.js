/* Data model: albums, world positions per stop, family weights, recommendations and regions.
 * Everything downstream reads RMR.D, so the synthetic 10k stress data only has to be adapted here. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util;

  function quantile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]; }

  /** Median distance from a point to its nearest neighbour (flat xy array), on a hash grid. */
  function nnDist(xy, n) {
    const cell = 0.02, grid = new Map();
    for (let i = 0; i < n; i++) { const k = Math.floor(xy[2 * i] / cell) + ',' + Math.floor(xy[2 * i + 1] / cell); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = xy[2 * i], y = xy[2 * i + 1], gx = Math.floor(x / cell), gy = Math.floor(y / cell); let best = 1e9;
      for (let r = 1; r <= 6 && best > (r - 1) * cell; r++)
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
          if (Math.max(Math.abs(a), Math.abs(b)) !== r && r > 1) continue;
          const l = grid.get((gx + a) + ',' + (gy + b)); if (!l) continue;
          for (const j of l) if (j !== i) { const q = Math.hypot(xy[2 * j] - x, xy[2 * j + 1] - y); if (q < best) best = q; }
        }
      d[i] = best;
    }
    return d;
  }
  RMR.nnDist = nnDist;
  const medianGap = (xy, n) => Array.from(nnDist(xy, n)).sort((a, b) => a - b)[n >> 1];

  RMR.initData = function (useSynth, regionSet) {
    const R = window.RMR_DATA, S = useSynth ? window.RMR_SYNTH : null;
    const D = (RMR.D = { synth: !!S, vocab: R.vocab, caption: R.caption });

    // World transform from the real balanced layout (the app's normalizePositions).
    const b = R.positions.balanced, n0 = R.n;
    const xs = new Float64Array(n0), ys = new Float64Array(n0);
    for (let i = 0; i < n0; i++) { xs[i] = b[2 * i]; ys[i] = b[2 * i + 1]; }
    xs.sort(); ys.sort();
    const cx = quantile(xs, 0.5), cy = quantile(ys, 0.5);
    const ext = Math.max(quantile(xs, 0.95) - cx, cx - quantile(xs, 0.05), quantile(ys, 0.95) - cy, cy - quantile(ys, 0.05)) || 1;
    const s = C.HALF_EXTENT / ext;
    D.tx = { cx, cy, s };
    D.toWorld = (rx, ry) => [(rx - cx) * s, (ry - cy) * s];

    const n = (D.n = S ? S.n : n0);
    D.src = S ? S.src : null;                       // synthetic point -> real album it copies
    D.real = (i) => (D.src ? D.src[i] : i);
    D.album = (i) => R.albums[D.real(i)];
    D.cover = D.real;                               // atlas cell of a point

    // positions: raw (for the gas grids) and world (for everything on screen)
    D.raw = {}; D.pos = {};
    for (const stop of C.STOPS) {
      const src = S ? S.positions : R.positions[stop];   // the stress data only has a balanced layout
      const raw = new Float32Array(2 * n), w = new Float32Array(2 * n);
      for (let i = 0; i < 2 * n; i += 2) { raw[i] = src[i]; raw[i + 1] = src[i + 1]; w[i] = (src[i] - cx) * s; w[i + 1] = (src[i + 1] - cy) * s; }
      D.raw[stop] = raw; D.pos[stop] = w;
    }
    D.stops = S ? ['balanced'] : C.STOPS;

    // family weights (0..1), leading family and star class per point
    D.w = new Float32Array(6 * n); D.lead = new Int8Array(n); D.cls = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = D.real(i); let m = 0, mj = -1;
      for (let j = 0; j < 6; j++) { const v = R.weights[6 * r + j] / 100; D.w[6 * i + j] = v; if (j < 5 && v > m) { m = v; mj = j; } }
      D.lead[i] = m > 0.3 && m > D.w[6 * i + 5] ? mj : -1;
      const k = C.STAR_CLASS;
      D.cls[i] = r < k[0] ? 0 : r < k[1] ? 1 : r < k[2] ? 2 : 3;   // by the source album's chart rank; the unranked tail is faintest
    }

    // cover size: at 10k the layout is denser, so covers shrink with the nearest-neighbour gap
    D.coverWorld = C.COVER_WORLD;
    if (S) {
      const real = new Float32Array(2 * n0); for (let i = 0; i < 2 * n0; i++) real[i] = (b[i] - (i % 2 ? cy : cx)) * s;
      D.coverWorld = C.COVER_WORLD * Math.min(1, medianGap(D.pos.balanced, n) / medianGap(real, n0));
    }

    D.bySlug = new Map(); for (let i = 0; i < n0; i++) D.bySlug.set(R.albums[i].slug, i);
    D.tags = (i) => { const out = []; for (const k of D.album(i).d) { const w = R.vocab[k]; if (!out.includes(w)) out.push(w); if (out.length === 6) break; } return out; };
    D.shared = (seed, rec) => { const d = D.album(rec).d; return D.tags(seed).filter((t) => d.includes(R.vocab.indexOf(t))).slice(0, 4); };

    // recommendations: the app's lists for real data; nearest map neighbours for the stress data
    D.recs = function (stop, i) {
      if (!S) return R.recs[stop][i];
      const p = D.pos.balanced, x = p[2 * i], y = p[2 * i + 1], best = [];
      for (let j = 0; j < n; j++) { if (j === i) continue; const d = (p[2 * j] - x) ** 2 + (p[2 * j + 1] - y) ** 2; if (best.length < 10 || d < best[9][0]) { best.push([d, j]); best.sort((a, c) => a[0] - c[0]); if (best.length > 10) best.pop(); } }
      return best.map((q) => q[1]);
    };

    // regions per stop, moved into world units
    D.regions = {};
    for (const stop of C.STOPS) {
      const src = S ? (stop === 'balanced' ? (regionSet === 'default' ? S.regions_default : S.regions_fine || S.regions_default) : null) : R.regions[stop];
      const list = (src ? src.regions : []).map((r, k) => {
        const [wx, wy] = D.toWorld(r.cx, r.cy);
        const fam = U.famCol(r.fw, 0);
        return Object.assign({}, r, {
          k, stop, wx, wy, wr: r.radius * s, hullW: (r.hull || []).map((p) => D.toWorld(p[0], p[1])),
          strong: r.strength === 'strong',
          display: r.name || RMR.TEXT.audioWords[r.word] || (r.named_from === 'audio' ? r.plain.split(' · ')[0] : r.word),
          col: fam,   // the debug hulls are drawn in it
        });
      });
      D.regions[stop] = { list, of: src ? src.album_region : null, byId: new Map(list.map((r) => [r.id, r])) };
    }
    D.regionOf = (stop, i) => { const g = D.regions[stop]; if (!g.of) return null; const k = g.of[i]; return k >= 0 && g.list[k] && g.list[k].level !== 0 ? g.list[k] : null; };

    // per stop: bounding box and percentile extents (world), for the two framings
    D.ext = {};
    for (const stop of C.STOPS) {
      const p = D.pos[stop], ax = new Float32Array(n), ay = new Float32Array(n);
      for (let i = 0; i < n; i++) { ax[i] = p[2 * i]; ay[i] = p[2 * i + 1]; }
      ax.sort(); ay.sort();
      D.ext[stop] = { minX: ax[0], maxX: ax[n - 1], minY: ay[0], maxY: ay[n - 1], x1: quantile(ax, 0.01), x99: quantile(ax, 0.99), medY: quantile(ay, 0.5) };
    }
    return D;
  };

  /** Position of point i at slider t (0 sonic, 0.5 balanced, 1 mood), piecewise linear as in the app. */
  RMR.posAt = function (i, t, out) {
    const D = RMR.D, lo = t <= 0.5, a = lo ? D.pos.sonic : D.pos.balanced, b = lo ? D.pos.balanced : D.pos.mood, f = lo ? t * 2 : (t - 0.5) * 2;
    out[0] = a[2 * i] + (b[2 * i] - a[2 * i]) * f; out[1] = a[2 * i + 1] + (b[2 * i + 1] - a[2 * i + 1]) * f; return out;
  };
  RMR.STOP_T = { sonic: 0, balanced: 0.5, mood: 1 };
})();
