/* The DOM-free half of the theme build (npm run theme). A classic script with no imports or exports, so one file
 * serves three readers: the bake page loads it with a script tag, and Node and vitest import it for its side
 * effect. Everything hangs off globalThis.RMR_THEME.
 * Ported from docs/design/trifid-theme/prototype/src/gas.js, data.js, stars.js and labels.js (gas look `swirl`,
 * palette `ember`). The site never imports from docs/; this copy is the production one. */
(function () {
  'use strict';

  const GAS = {
    GRID: 512,
    // Gaussian widths in raw layout units: fine, local colour, big, wide colour, huge, far, very far
    BLUR: { fine: 0.016, col: 0.034, big: 0.05, wide: 0.13, huge: 0.14, far: 0.3, vfar: 0.62 },
    BAKE: 2048, // px of the longer side of a baked stop; WebGL2 guarantees textures this large
    // The sharper image of a stop holds what a square bake of this many px over the whole square holds, which is
    // the prototype's bake. It covers only the stop's rectangle, so it is smaller than this.
    SHARP: 4096,
    PROBE: 512, // px of the coarse bake of the whole square that finds where a stop's gas is
    RECT_PAD: 0.06, // raw units of empty sky kept around the gas inside a stop's rectangle
    LUM: 512, // px of the luminance copy that stars and names read
    LUM_PPR: 1000, // px per raw unit the luminance copy is shaded for
    BAKE_MARGIN: 0.6, // the bake reaches this far past the outermost album, where the gas has already ended
    RAW_MARGIN: 0.75, // the fields reach a little further, past the widest blur that still lights anything
    LUM_MAX: 0.6, // a byte of 255 in stars.bg
    LABEL_REF_PPW: 600, // px per world unit names are boxed at: the desktop overview of the app
    LABEL_WIDE_PPW: 400, // and for the second, wider box (lumWide): the whole map in a short laptop window
  };
  const EMBER = { hues: [[232, 96, 60], [244, 190, 120], [150, 200, 214], [66, 110, 190], [120, 140, 220]], neutral: [138, 138, 146] };
  const STOPS = ['sonic', 'balanced', 'mood'];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /** The prototype's seeded 256 x 256 random table (mulberry32, seed 7). The runtime builds the same one. */
  function noiseTable() {
    let a = 7;
    const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nt = new Uint8Array(256 * 256);
    for (let i = 0; i < nt.length; i++) nt[i] = Math.floor(rnd() * 256);
    return nt;
  }

  /** Three box passes in place, close to a Gaussian of `sigmaCells`. */
  function blur(d, w, h, sigmaCells) {
    const r = Math.max(1, Math.round(sigmaCells)), t = new Float32Array(w * h), inv = 1 / (2 * r + 1);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x <= r; x++) s += d[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[o + x] = s * inv; s += d[o + Math.min(w - 1, x + r + 1)] - d[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { d[y * w + x] = s * inv; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    }
    return d;
  }

  /** Bilinear read of an n x n grid at grid coordinates. */
  function at(d, n, gx, gy) {
    gx = clamp(gx, 0, n - 1.001); gy = clamp(gy, 0, n - 1.001);
    const xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, o = yi * n + xi;
    return d[o] * (1 - fx) * (1 - fy) + d[o + 1] * fx * (1 - fy) + d[o + n] * (1 - fx) * fy + d[o + n + 1] * fx * fy;
  }

  /** Half sizes, in raw units, of the baked square and of the field grids, from the outermost album of any stop. */
  function halves(positions) {
    let ext = 0;
    for (const stop of STOPS) for (const v of positions[stop]) ext = Math.max(ext, Math.abs(v));
    return { bakeHalf: ext + GAS.BAKE_MARGIN, rawHalf: ext + GAS.RAW_MARGIN };
  }

  /** The raw rectangle [x0, y0, x1, y1] that holds all the gas of a stop: the box of every lit cell of a coarse
   * bake of the whole square (px: RGBA, n x n, rows from the south edge), plus RECT_PAD of empty sky, rounded
   * outwards to a thousandth and kept inside the square. Outside it the stop is plain sky. */
  function gasRect(px, n, bakeHalf) {
    let c0 = n, r0 = n, c1 = -1, r1 = -1;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const o = 4 * (r * n + c);
      if (px[o] | px[o + 1] | px[o + 2]) { if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r; }
    }
    if (c1 < 0) throw new Error('the coarse bake holds no gas');
    const cell = (2 * bakeHalf) / n, P = GAS.RECT_PAD;
    const lo = (i) => Math.max(-bakeHalf, Math.floor((-bakeHalf + i * cell - P) * 1000) / 1000);
    const hi = (i) => Math.min(bakeHalf, Math.ceil((-bakeHalf + (i + 1) * cell + P) * 1000) / 1000);
    return [lo(c0), lo(r0), hi(c1), hi(r1)];
  }
  /** Sizes in px of the two images of a stop's rectangle: `px`, whose longer side is BAKE, and `sharp`, which has
   * SHARP / (2 bakeHalf) texels per raw unit (never a side over SHARP). */
  function gasSizes(rect, bakeHalf) {
    const w = rect[2] - rect[0], h = rect[3] - rect[1], long = Math.max(w, h);
    const d = Math.min(GAS.SHARP / (2 * bakeHalf), GAS.SHARP / long);
    return { px: [Math.round((w / long) * GAS.BAKE), Math.round((h / long) * GAS.BAKE)], sharp: [Math.round(w * d), Math.round(h * d)] };
  }

  /** Album density at five blurs and the seven colour weights at two, for one stop, normalised by percentiles taken
   * at the album positions (so the rule is the same at 4,000 or 10,000 points), as five RGBA float grids:
   *   0: fine, big, huge, far      1: local weights 0..3      2: local 4, 5, neutral; very far
   *   3: wide weights 0..3         4: wide 4, 5, neutral
   * raw: flat xy of the stop. w6: six integer shares 0..100 per album (five families, then neutral). Rows run from
   * raw y = -rawHalf upwards. Channel 5 is unused by the five-family scheme and stays empty. */
  function fieldData(raw, w6, N, rawHalf) {
    const n = GAS.GRID, cell = (2 * rawHalf) / n, B = GAS.BLUR;
    const g = new Float32Array(n * n), w7 = [0, 1, 2, 3, 4, 5, 6].map(() => new Float32Array(n * n));
    const gxs = new Float32Array(N), gys = new Float32Array(N), W = new Float32Array(7);
    for (let i = 0; i < N; i++) {
      const gx = (raw[2 * i] + rawHalf) / cell - 0.5, gy = (raw[2 * i + 1] + rawHalf) / cell - 0.5; gxs[i] = gx; gys[i] = gy;
      const xi = Math.floor(gx), yi = Math.floor(gy); if (xi < 0 || yi < 0 || xi >= n - 1 || yi >= n - 1) continue;
      for (let j = 0; j < 5; j++) W[j] = w6[6 * i + j] / 100;
      W[5] = 0; W[6] = w6[6 * i + 5] / 100;
      const fx = gx - xi, fy = gy - yi, o = yi * n + xi, k = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], oo = [o, o + 1, o + n, o + n + 1];
      for (let c = 0; c < 4; c++) { g[oo[c]] += k[c]; for (let j = 0; j < 7; j++) w7[j][oo[c]] += k[c] * W[j]; }
    }
    const mk = (src, sigma) => blur(Float32Array.from(src), n, n, sigma / cell);
    const fine = mk(g, B.fine), big = mk(g, B.big), huge = mk(g, B.huge), far = mk(g, B.far), vfar = mk(g, B.vfar);
    const wide = w7.map((q) => mk(q, B.wide)); w7.forEach((q) => blur(q, n, n, B.col / cell));
    const pct = (d, q) => { const v = []; for (let i = 0; i < N; i += 2) v.push(at(d, n, gxs[i], gys[i])); v.sort((a, b) => a - b); return v[Math.floor(v.length * q)] || 1e-6; };
    const nb = pct(big, 0.6), nh = pct(huge, 0.6), nf = pct(fine, 0.85), nfar = pct(far, 0.5), nvf = pct(vfar, 0.5);
    const T = [0, 1, 2, 3, 4].map(() => new Float32Array(4 * n * n));
    for (let i = 0; i < n * n; i++) {
      const o = 4 * i;
      T[0][o] = fine[i] / nf; T[0][o + 1] = big[i] / nb; T[0][o + 2] = huge[i] / nh; T[0][o + 3] = far[i] / nfar;
      for (let j = 0; j < 4; j++) { T[1][o + j] = w7[j][i] / nb; T[3][o + j] = wide[j][i] / nh; }
      for (let j = 0; j < 3; j++) { T[2][o + j] = w7[4 + j][i] / nb; T[4][o + j] = wide[4 + j][i] / nh; }
      T[2][o + 3] = vfar[i] / nvf;
    }
    return T;
  }

  /** Leading colour family per album (0..4), or -1 when no family is over 0.3 or the neutral share is larger. */
  function leadFamilies(w6, N) {
    const lead = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      let m = 0, mj = -1;
      for (let j = 0; j < 5; j++) { const v = w6[6 * i + j] / 100; if (v > m) { m = v; mj = j; } }
      lead[i] = m > 0.3 && m > w6[6 * i + 5] / 100 ? mj : -1;
    }
    return lead;
  }

  const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
  /** The app's raw to world transform (src/components/map/data.ts positionsTransform), from the flat balanced layout. */
  function positionsTransform(balanced) {
    const n = balanced.length / 2, xs = new Float64Array(n), ys = new Float64Array(n);
    for (let i = 0; i < n; i++) { xs[i] = balanced[2 * i]; ys[i] = balanced[2 * i + 1]; }
    xs.sort(); ys.sort();
    const cx = quantile(xs, 0.5), cy = quantile(ys, 0.5);
    const ext = Math.max(quantile(xs, 0.95) - cx, cx - quantile(xs, 0.05), quantile(ys, 0.95) - cy, cy - quantile(ys, 0.05)) || 1;
    return { cx, cy, s: 0.55 / ext };
  }

  const srgb2lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const luminance = (c) => 0.2126 * srgb2lin(c[0]) + 0.7152 * srgb2lin(c[1]) + 0.0722 * srgb2lin(c[2]);
  /** Cell of the luminance copy that holds raw point (x, y). The copy covers the field square; row 0 is the south edge. */
  function lumCell(x, y, rawHalf) {
    const n = GAS.LUM, g = (v) => clamp(Math.round(((v + rawHalf) / (2 * rawHalf)) * n - 0.5), 0, n - 1);
    return g(y) * n + g(x);
  }
  /** Luminance per cell of an RGBA render of the luminance copy. */
  function lumGrid(px) {
    const n = GAS.LUM, out = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) out[i] = luminance([px[4 * i], px[4 * i + 1], px[4 * i + 2]]);
    return out;
  }
  /** Brightest luminance inside a raw box. */
  function lumIn(lum, rawHalf, x0, y0, x1, y1) {
    const n = GAS.LUM, a = lumCell(x0, y0, rawHalf), b = lumCell(x1, y1, rawHalf);
    const xa = Math.min(a % n, b % n), xb = Math.max(a % n, b % n), ya = Math.min((a / n) | 0, (b / n) | 0), yb = Math.max((a / n) | 0, (b / n) | 0);
    let m = 0;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const v = lum[y * n + x]; if (v > m) m = v; }
    return m;
  }

  /** Font size in px of a region name in Tenor Sans (the prototype's fontSize with the face's 0.88 factor). */
  function labelFontPx(strong, n) {
    const k = Math.min(1, Math.sqrt(n / 346));
    return 0.88 * (strong ? 17 + 7 * k : 15 + 3 * k);
  }
  /** Half width and half height, in raw units, of the area a name may cover at the overview: wide capitals at
   * about 0.94 em a letter (advance plus 0.26 em tracking), plus room for the nudges the placement may apply.
   * `ppw` is the map scale the name is boxed at, px per world unit: the smaller it is, the more map the name covers. */
  function labelBox(name, strong, n, s, ppw = GAS.LABEL_REF_PPW) {
    const fs = labelFontPx(strong, n);
    return [(0.47 * fs * name.length + 30) / ppw / s, (0.525 * fs + 28) / ppw / s];
  }
  /** Ink of a name: the gas colour under it at full brightness, then 80% of the way to white. */
  function labelInk(rgb) {
    const m = Math.max(rgb[0], rgb[1], rgb[2], 1);
    return rgb.map((v) => { const c = (v / m) * 255; return Math.round(c + (255 - c) * 0.8); });
  }

  /** theme.json. input: { n, positionsHash, positions, weights, regions }; lumPx: per stop, the RGBA bytes of the
   * luminance copy (rows from the south edge); gas: per stop, { rect, px, sharp } of its images. */
  function assemble(input, lumPx, bakeHalf, rawHalf, gas) {
    const { n, positions, weights, regions } = input;
    const tx = positionsTransform(positions.balanced), bg = new Array(3 * n).fill(0), labels = {};
    STOPS.forEach((stop, k) => {
      const px = lumPx[stop], lum = lumGrid(px), P = positions[stop];
      for (let i = 0; i < n; i++) bg[3 * i + k] = Math.min(255, Math.round((lum[lumCell(P[2 * i], P[2 * i + 1], rawHalf)] / GAS.LUM_MAX) * 255));
      labels[stop] = regions[stop].filter((r) => r.level === 1 && r.name).map((r) => {
        const strong = r.strength === 'strong', c = 4 * lumCell(r.cx, r.cy, rawHalf), [hw, hh] = labelBox(r.name, strong, r.n, tx.s);
        const [ww, wh] = labelBox(r.name, strong, r.n, tx.s, GAS.LABEL_WIDE_PPW);
        return {
          id: r.id, name: r.name, x: r.cx, y: r.cy, strong, n: r.n, p: r.priority,
          rgb: labelInk([px[c], px[c + 1], px[c + 2]]),
          lum: Math.round(lumIn(lum, rawHalf, r.cx - hw, r.cy - hh, r.cx + hw, r.cy + hh) * 1000) / 1000,
          // the same in the wider box: the map shows the name over this much gas once it is zoomed out past LABEL_REF_PPW
          lumWide: Math.round(lumIn(lum, rawHalf, r.cx - ww, r.cy - wh, r.cx + ww, r.cy + wh) * 1000) / 1000,
        };
      });
    });
    return { v: 3, n, positionsHash: input.positionsHash, bakeHalf: Math.round(bakeHalf * 1e4) / 1e4, gas, stars: { lead: Array.from(leadFamilies(weights, n)), bg }, labels };
  }

  /** A gas image is named after its own bytes: the first 10 hex characters of their SHA-256, between the stem and
   * the extension. theme.json records the hashes (gas.<stop>.hash: first image, sharper image). */
  const GAS_HASH_LEN = 10;
  const gasHash = (sha256Hex) => sha256Hex.slice(0, GAS_HASH_LEN);
  const gasFile = (stem, hash) => `${stem}.${hash}.webp`;
  /** Every gas file a theme names. */
  const gasFiles = (gas) => STOPS.flatMap((s) => [gasFile(`gas-${s}`, gas[s].hash[0]), gasFile(`gas-${s}-sharp`, gas[s].hash[1])]);

  globalThis.RMR_THEME = Object.assign(globalThis.RMR_THEME || {}, {
    GAS_HASH_LEN, gasHash, gasFile, gasFiles,
    GAS, EMBER, STOPS, noiseTable, blur, at, halves, gasRect, gasSizes, fieldData, leadFamilies, positionsTransform,
    luminance, lumCell, lumGrid, lumIn, labelFontPx, labelBox, labelInk, assemble,
  });
})();
