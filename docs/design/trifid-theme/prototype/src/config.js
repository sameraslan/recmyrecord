/* Trifid prototype: constants and small helpers. Classic scripts share one global, window.RMR. */
(function () {
  'use strict';
  const RMR = (window.RMR = window.RMR || {});

  // Where the app's cover atlases live, relative to index.html. Re-point this when the prototype is published.
  // Covers: straight from the app's data folder when opened from the repo (file:// or a local server);
  // from a sibling assets/ folder when the prototype is published somewhere else.
  const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  window.RMR_ASSETS = window.RMR_ASSETS || (local ? '../../../../frontcreck/public/data/' : 'assets/');

  RMR.cfg = {
    STOPS: ['sonic', 'balanced', 'mood'],
    // world transform (as the app): balanced 5th..95th percentile half-extent spans this many world units
    HALF_EXTENT: 0.55,
    FRUSTUM: 1.1,            // world units the stage height shows at zoom 1
    MAX_ZOOM: 28,
    MIN_ZOOM_FIT: 0.8,       // the visitor can zoom out to 0.8x the whole-map fit
    COVER_WORLD: 0.0068,     // cover edge in world units (scaled down for the 10k stress data)
    COVER_MAX: 64,
    COVER_FADE: [16, 32],
    ATLAS_LOAD_PX: 13,
    // zoom bands by cover px (UX.md section 2)
    BAND_A: 6, BAND_B: 13, BAND_C: 22, BAND_D: 32,
    // deep zoom (RMR.gasCurve below): past BAND_D the gas goes on fading, from 0.3 to `floor` at `end` px covers, eased
    // out, so full-size covers sit in near-black space. Over the same stretch the gas loses `desat` of its colour, its
    // fine detail fades out and it is read from a blurred copy of the bake (the mean of mip levels `lod`), so the faint
    // colour that remains is smooth. deep=<0..1> in the hash overrides `floor`; deep=old is the earlier floor of 0.3.
    DEEP: { end: 56, floor: 0.025, desat: 0.35, lod: [4.5, 6] },
    // focus
    MARKER: { seed: 64, rec: 46, gap: 10, hot: 1.16 },
    FOCUS_PAD: { top: 262, right: 96, bottom: 90, left: 96 },
    FIT_PAD: { top: 55, right: 40, bottom: 115, left: 40 },
    MIN_FOCUS_SPAN: 0.15,
    REC_DEFAULT: 5, REC_MAX: 10,
    // durations (ms)
    DUR: { panel: 400, morph: 520, camera: 420, fly: 450, zoom: 240, hover: 80, pool: 400 },
    ZOOM_STEP: 1.6,
    // gas: grids live in raw layout units (the app's positions before the world transform)
    GAS: {
      GRID: 512, RAW_HALF: 1.75,   // RAW_HALF is reset at load to the data extent plus margin
      // Gaussian widths of the mockup, in raw units: fine, local colour, big, wide colour, huge, far, very far
      BLUR: { fine: 0.016, col: 0.034, big: 0.05, wide: 0.13, huge: 0.14, far: 0.3, vfar: 0.62 },
      BAKE: 4096, LUM: 512,
      LOOK: 'swirl',   // the default look (src/gas.js LOOKS); look=<id> in the hash overrides it
    },
    // family hues (fierce, warm, quiet, dark, urban: rose, gold, teal, blue, violet) and neutral, as the mockup. The gas
    // takes its hues from its palette (src/gas.js); these colour the debug hulls.
    FAM: [[236, 72, 96], [246, 172, 60], [46, 186, 164], [60, 116, 244], [196, 92, 232]],
    NEU: [150, 140, 138],
    // star magnitude classes: the share of albums in the three brighter classes (about 1%, 9%, 27%; the rest are small).
    // Which album gets which class is a random draw on each load (src/data.js; seed=<int> in the hash repeats a draw).
    // Album order plays no part.
    STAR_MIX: [0.01, 0.09, 0.27],
    STAR_RADIUS: [2.8, 1.9, 1.4, 1.1],
    STAR_GLOW: [1, 0.55, 0.16, 0.12],   // bloom around the core, per class (the first two fade out with their halos when zoomed far out)
    STAR_UNDER: [0.5, 0.26],             // dark under-disc: the gas luminance it holds the star's surround to, and its greatest alpha
    STAR_ALPHA: [1, 0.95, 0.85, 0.72],
    // the most region names shown at once: at Overview and Whole map on desktop (names=<number> in the hash overrides it),
    // on a phone, beside an album, and with names=all (the earlier behaviour)
    NAME_FONT: 'tenor',   // lettering of the region names (src/labels.js FONTS); font=<id> in the hash overrides it
    NAMES_MAX: 17, NAMES_MAX_PHONE: 4, NAMES_MAX_ALBUM: 8, NAMES_ALL_CAP: 14,
    DPR_MAX: 2,
    // twinkle (src/twinkle.js): per level, the wait between glints in ms [min, max], peak opacity, size factor, most alive at once
    TWINKLE: { 1: { wait: [2000, 5000], peak: 0.85, size: 1, max: 2 }, 2: { wait: [700, 2000], peak: 1, size: 1.2, max: 3 } },
    TWINKLE_DUR: [1200, 1800],        // one glint, in and out, ms
    TWINKLE_WEIGHT: [8, 5, 2.5, 1],   // how much likelier a star of each magnitude class is to glint (brighter stars more often)
    TWINKLE_BLOOM: [4, 3],            // bloom radius in px = [0] * the star's radius + [1]
    TWINKLE_FLARE: 9,                 // the two brightest classes also get a thin four-point flare, this many star radii long each way
  };
  /** Gas strength for a cover size in px, and how far into deep zoom the view is (0..1).
   * strength: 1 under BAND_B; a straight line to 0.6 at BAND_C; a straight line to 0.3 at BAND_D; then
   * 0.3 + (floor - 0.3) * e with u = (cp - BAND_D) / (DEEP.end - BAND_D) clamped to 0..1 and e = 1 - (1 - u)^2.
   * deep: e (0 for deep=old, which also holds the strength at 0.3). The shader applies strength as 1 - (1 - c)^strength. */
  RMR.gasCurve = function (cp, floor) {
    const C = RMR.cfg, U = RMR.util, old = floor === 'old';
    if (cp < C.BAND_B) return { strength: 1, deep: 0 };
    if (cp < C.BAND_C) return { strength: U.lerp(1, 0.6, (cp - C.BAND_B) / (C.BAND_C - C.BAND_B)), deep: 0 };
    if (cp < C.BAND_D) return { strength: U.lerp(0.6, 0.3, (cp - C.BAND_C) / (C.BAND_D - C.BAND_C)), deep: 0 };
    if (old) return { strength: 0.3, deep: 0 };
    const u = U.clamp((cp - C.BAND_D) / (C.DEEP.end - C.BAND_D), 0, 1), e = 1 - (1 - u) * (1 - u);
    return { strength: U.lerp(0.3, floor == null ? C.DEEP.floor : floor, e), deep: e };
  };
  /** One hash parameter, read straight from the URL (for modules that read a switch once at load). */
  RMR.param = (k) => { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.hash); return m ? decodeURIComponent(m[1]) : null; };
  /** A small seeded generator (mulberry32): the same seed gives the same draw. */
  RMR.rng = function (seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  const U = (RMR.util = {});
  U.clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  U.easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // the site's easing, cubic-bezier(.22,.72,.2,1), solved numerically
  U.easeOut = (function () {
    const x1 = 0.22, y1 = 0.72, x2 = 0.2, y2 = 1;
    const bez = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (bez(m, x1, x2) < x) lo = m; else hi = m; }
      return bez((lo + hi) / 2, y1, y2);
    };
  })();
  U.hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  U.rgb = (c, a) => (a == null ? `rgb(${c.map(Math.round)})` : `rgba(${c.map(Math.round)},${a})`);
  U.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  U.el = function (tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.srgb2lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  U.luminance = (c) => 0.2126 * U.srgb2lin(c[0]) + 0.7152 * U.srgb2lin(c[1]) + 0.0722 * U.srgb2lin(c[2]);

  /** Family blend (the mockup's famCol): leading family decides the hue, weak fits and neutral share lose colour.
   * w: five family weights + neutral share at offset o. Returns [r,g,b] 0..255. */
  U.famCol = function (w, o) {
    const C = RMR.cfg; o = o || 0; let s = 0, j1 = 0, j2 = 0, f1 = 0, f2 = 0;
    for (let j = 0; j < 5; j++) s += Math.max(0, w[o + j]);
    if (s < 1e-9) return C.NEU.slice();
    for (let j = 0; j < 5; j++) { const f = Math.max(0, w[o + j]) / s; if (f > f1) { f2 = f1; j2 = j1; f1 = f; j1 = j; } else if (f > f2) { f2 = f; j2 = j; } }
    const lean = 0.5 * Math.pow(f2 / f1, 5), neu = w[o + 5] / (s + w[o + 5] + 1e-9), sat = U.smooth(0.2, 0.5, f1) * (1 - 0.7 * neu);
    return [0, 1, 2].map((k) => { const h = C.FAM[j1][k] + (C.FAM[j2][k] - C.FAM[j1][k]) * lean; return C.NEU[k] + (h - C.NEU[k]) * sat; });
  };
  U.lighten = (c, k) => c.map((v) => v + (255 - v) * k);

  /** CSS for an atlas sprite of album `i` at `size` px (32 x 32 grid of covers, 1,024 per sheet). */
  U.coverCSS = function (i, size) {
    const sheet = Math.floor(i / 1024), cell = i % 1024, col = cell % 32, row = Math.floor(cell / 32);
    // percentages, so the same sprite works at any rendered size (fluid shelf covers, phone sizes)
    return `background-image:url(${window.RMR_ASSETS}atlas-${sheet}.webp);background-size:3200% 3200%;background-position:${(col / 31 * 100).toFixed(3)}% ${(row / 31 * 100).toFixed(3)}%;`;
  };
  U.cover = function (i, size, cls) {
    return `<span class="cover ${cls || ''}" style="width:${size}px;height:${size}px"><span class="spr" style="${U.coverCSS(i, size)}"></span></span>`;
  };

  const ICON = {
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
  };
  U.icon = (name, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.7}" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;
})();
