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
      GRID: 448, RAW_HALF: 1.5,   // RAW_HALF is reset at load to the data extent plus margin
      // Gaussian widths of the mockup, in raw units: fine, local colour, big, wide colour, huge, far, very far
      BLUR: { fine: 0.016, col: 0.024, big: 0.05, wide: 0.13, huge: 0.14, far: 0.3, vfar: 0.62 },
      BAKE: 4096, LUM: 512,
      // tone: Y = FLOOR_Y + smoke + LUM_CAP * (1 - exp(-EXPO * E)) * tex * family factor, E = .1*near + (d / D_REF) ^ D_POW,
      // d = .58 medium + .32 fine + .10 wide density. TEX is the range noise may move luminance over (2x, applied
      // after the shoulder so it is 2x on screen). LUM_MAX is the hard cap. WARP, WARP2: raw units per unit of noise.
      LUM_CAP: 0.42, LUM_MAX: 0.56, FLOOR_Y: 0.0014, SMOKE: 0.012,
      D_REF: 0.92, D_POW: 3.0, EXPO: 0.62, TEX: [0.5, 1.0], WARP: 0.1, WARP2: 0.035,
      WHITE: 0.35,      // how far the brightest cores lift toward warm white
      CHROMA: 1.12,    // chroma of a clear fit relative to the family hue as listed
      NEU_LUM: 0.78,   // luminance factor of mixed (neutral) ground, beside FAM_LUM
      MIX_POW: 3.0,    // sharpening of the family shares before the hues are mixed (1 = free blend)
      BLEED: 0.35,      // share of the wide colour average (sigma BLUR.wide) in the blend where albums are
    },
    // family hues (fierce, warm, quiet, dark, urban) and neutral
    // rose, gold, teal, blue, violet. Chosen with FAM_LUM so every pair stays apart under protanopia and deuteranopia
    // (CIE76 20 or more at equal density): blue deeper, violet lighter and pinker, teal lighter than rose.
    FAM: [[236, 72, 96], [252, 194, 70], [56, 206, 180], [44, 84, 216], [214, 124, 240]],
    FAM_LUM: [0.85, 1.34, 1.28, 0.66, 1.0],
    NEU: [150, 140, 138],
    FAM_IDS: ['fierce', 'warm', 'quiet', 'dark', 'urban'],
    // star magnitude classes by album index: first 40, to 400, to 1,500, the rest; the tail from 3,824 is not chart rank
    STAR_CLASS: [40, 400, 1500, 3824],
    STAR_RADIUS: [2.8, 1.9, 1.4, 1.1],
    STAR_GLOW: [1, 0.55, 0.16, 0.12],   // bloom around the core, per class (the first two fade out with their halos when zoomed far out)
    STAR_UNDER: [0.3, 0.5],             // dark under-disc: the gas luminance it holds the star's surround to, and its greatest alpha
    STAR_ALPHA: [1, 0.95, 0.85, 0.72],
    LABEL_CAP: 14, POINTER_CAP: 4, LABEL_CAP_PHONE: 6, POINTER_CAP_PHONE: 3,
    DPR_MAX: 2,
  };

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
  /** Leading family of six weights, or -1 when the fit is weak (no family reaches 40% of the five). */
  U.lead = function (w, o) { o = o || 0; let s = 0, m = 0, j1 = -1; for (let j = 0; j < 5; j++) s += w[o + j]; for (let j = 0; j < 5; j++) if (w[o + j] > m) { m = w[o + j]; j1 = j; } return s > 0 && m / s >= 0.4 ? j1 : -1; };
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
    arrow: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
  };
  U.icon = (name, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.7}" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;
})();
