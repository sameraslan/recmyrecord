/* Region names: plain lettering on the map. Nothing to hover, focus or click, and hidden from screen readers.
 * They show at Whole map and Overview (and beside an open album) and are gone once the visitor zooms in.
 * Placement runs every drawn frame: priority order, a cap (cfg.NAMES_MAX, or names= in the hash), and no name over
 * chrome, a cover or a line. Contrast comes from a dark halo around the glyphs, solved from the gas luminance under the name. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util;
  const Labels = (RMR.Labels = {});
  let host, mctx;
  const els = new Map(), widths = new Map(), sticky = new Map();
  // nudges tried in order when the true centre is taken; small, so a name stays on its region
  const OFFSETS = [[0, 0], [0, -22], [0, 22], [-40, 0], [40, 0], [0, -46], [0, 46], [-70, -30], [70, 30], [70, -30], [-70, 30], [0, -78], [0, 78]];

  /* Lettering options (font=<id> in the hash; default cfg.NAME_FONT). Each is tuned on its own: weight, tracking in em,
   * case ('upper', 'lower' or 'title' = as written) and size relative to the Cormorant original. Never italic. `g` is the Google Fonts family spec, loaded on demand. */
  const FONTS = {
    cormorant: { name: 'Cormorant Garamond 600, wide capitals (the original)', fam: 'Cormorant Garamond', w: 600, track: 0.17, cs: 'upper', size: 1.1, g: null },
    'cormorant-light': { name: 'Cormorant Garamond 400, larger, tighter capitals', fam: 'Cormorant Garamond', w: 400, track: 0.09, cs: 'upper', size: 1.25, g: 'Cormorant+Garamond:wght@400' },
    bodoni: { name: 'Bodoni Moda 500, capitals', fam: 'Bodoni Moda', w: 500, track: 0.17, cs: 'upper', size: 1.0, g: 'Bodoni+Moda:opsz,wght@6..96,500' },
    playfair: { name: 'Playfair Display 500, capitals', fam: 'Playfair Display', w: 500, track: 0.15, cs: 'upper', size: 0.95, g: 'Playfair+Display:wght@500' },
    fraunces: { name: 'Fraunces 300, capitals', fam: 'Fraunces', w: 300, track: 0.13, cs: 'upper', size: 1.0, g: 'Fraunces:opsz,wght@9..144,300' },
    instrument: { name: 'Instrument Serif, mixed case', fam: 'Instrument Serif', w: 400, track: 0.01, cs: 'title', size: 1.45, g: 'Instrument+Serif' },
    marcellus: { name: 'Marcellus, inscriptional capitals', fam: 'Marcellus', w: 400, track: 0.2, cs: 'upper', size: 0.98, g: 'Marcellus' },
    cinzel: { name: 'Cinzel 500, classical capitals', fam: 'Cinzel', w: 500, track: 0.14, cs: 'upper', size: 0.92, g: 'Cinzel:wght@500' },
    forum: { name: 'Forum, classical capitals', fam: 'Forum', w: 400, track: 0.17, cs: 'upper', size: 1.12, g: 'Forum' },
    jost: { name: 'Jost 300, thin wide capitals', fam: 'Jost', w: 300, track: 0.36, cs: 'upper', size: 0.92, g: 'Jost:wght@300' },
    josefin: { name: 'Josefin Sans 300, thin wide capitals', fam: 'Josefin Sans', w: 300, track: 0.32, cs: 'upper', size: 0.96, g: 'Josefin+Sans:wght@300' },
    tenor: { name: 'Tenor Sans, wide capitals', fam: 'Tenor Sans', w: 400, track: 0.26, cs: 'upper', size: 0.88, g: 'Tenor+Sans' },
    schibsted: { name: 'Schibsted Grotesk 500, small tracked capitals (the site\u2019s body face)', fam: 'Schibsted Grotesk', w: 500, track: 0.24, cs: 'upper', size: 0.76, g: null },
    'jost-lower': { name: 'Jost 300, lower case', fam: 'Jost', w: 300, track: 0.16, cs: 'lower', size: 1.18, g: 'Jost:wght@300' },
    julius: { name: 'Julius Sans One, wide capitals', fam: 'Julius Sans One', w: 400, track: 0.22, cs: 'upper', size: 0.9, g: 'Julius+Sans+One' },
    italiana: { name: 'Italiana, fine display capitals', fam: 'Italiana', w: 400, track: 0.22, cs: 'upper', size: 1.08, g: 'Italiana' },
    poiret: { name: 'Poiret One, deco capitals', fam: 'Poiret One', w: 400, track: 0.24, cs: 'upper', size: 1.06, g: 'Poiret+One' },
    raleway: { name: 'Raleway 300, wide capitals', fam: 'Raleway', w: 300, track: 0.3, cs: 'upper', size: 0.9, g: 'Raleway:wght@300' },
    montserrat: { name: 'Montserrat 300, wide capitals', fam: 'Montserrat', w: 300, track: 0.3, cs: 'upper', size: 0.82, g: 'Montserrat:wght@300' },
    syncopate: { name: 'Syncopate, extended capitals', fam: 'Syncopate', w: 400, track: 0.2, cs: 'upper', size: 0.7, g: 'Syncopate' },
    gilda: { name: 'Gilda Display, capitals', fam: 'Gilda Display', w: 400, track: 0.2, cs: 'upper', size: 0.98, g: 'Gilda+Display' },
    didone: { name: 'Antic Didone, capitals', fam: 'Antic Didone', w: 400, track: 0.2, cs: 'upper', size: 1.0, g: 'Antic+Didone' },
    michroma: { name: 'Michroma, technical capitals', fam: 'Michroma', w: 400, track: 0.2, cs: 'upper', size: 0.68, g: 'Michroma' },
    quattrocento: { name: 'Quattrocento, classical capitals', fam: 'Quattrocento', w: 400, track: 0.22, cs: 'upper', size: 0.95, g: 'Quattrocento' },
    'tenor-tight': { name: 'Tenor Sans, larger, tighter capitals', fam: 'Tenor Sans', w: 400, track: 0.14, cs: 'upper', size: 1.0, g: 'Tenor+Sans' },
    'tenor-title': { name: 'Tenor Sans, mixed case', fam: 'Tenor Sans', w: 400, track: 0.06, cs: 'title', size: 1.15, g: 'Tenor+Sans' },
    plexmono: { name: 'IBM Plex Mono, small capitals (star chart)', fam: 'IBM Plex Mono', w: 400, track: 0.2, cs: 'upper', size: 0.74, g: 'IBM+Plex+Mono:wght@400' },
  };
  let F;
  Labels.fonts = FONTS;
  const cased = (t) => (F.cs === 'upper' ? t.toUpperCase() : F.cs === 'lower' ? t.toLowerCase() : t);

  Labels.init = function (h) {
    host = h; mctx = document.createElement('canvas').getContext('2d');
    const id = (/[?&]font=([^&]*)/.exec(location.hash) || [])[1]; F = FONTS[id] || FONTS[C.NAME_FONT];
    if (F.g) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${F.g}&display=swap`; document.head.appendChild(l); }
    const st = host.style;
    st.setProperty('--rl-font', `"${F.fam}"`); st.setProperty('--rl-weight', F.w); st.setProperty('--rl-track', F.track + 'em');
    st.setProperty('--rl-case', F.cs === 'upper' ? 'uppercase' : F.cs === 'lower' ? 'lowercase' : 'none'); st.setProperty('--rl-stroke', (F.w <= 300 ? 1.7 : 2.1) + 'px');
    // names are measured again once their face has arrived
    const again = () => { widths.clear(); RMR.requestRender(); };
    if (document.fonts) { if (document.fonts.ready) document.fonts.ready.then(again); document.fonts.addEventListener('loadingdone', again); }
  };

  function textW(text, fs) {
    let w = widths.get(text);
    if (w == null) { mctx.font = `${F.w} 100px "${F.fam}", serif`; w = mctx.measureText(cased(text)).width + 100 * F.track * text.length; widths.set(text, w); }
    return (w * fs) / 100;
  }
  function fontSize(r) {
    const k = F.size;
    if (r.level === 0) return k * (21 + 6 * Math.min(1, Math.sqrt(r.n / 1500)));
    return k * (r.strong ? 17 + 7 * Math.min(1, Math.sqrt(r.n / 346)) : 15 + 3 * Math.min(1, Math.sqrt(r.n / 346)));
  }
  /** Ink of a name: near white, with a breath of the gas colour under it. */
  function inkOf(r) {
    if (r._ink) return r._ink;
    const c = RMR.Gas.ok ? RMR.Gas.rgbAt(r.stop, r.wx, r.wy) : [240, 236, 228], m = Math.max(c[0], c[1], c[2], 1);
    return (r._ink = U.lighten(c.map((v) => (v / m) * 255), 0.8));
  }

  function ensure(r) {
    let e = els.get(r.id);
    if (!e) { e = U.el('div', 'rl off', '<b></b>'); host.appendChild(e); els.set(r.id, e); }
    if (e._r !== r) { e._r = r; e.firstChild.textContent = r.display; e.style.setProperty('--lc', U.rgb(inkOf(r))); e.classList.toggle('fair', !r.strong); e.classList.toggle('area', r.level === 0); }
    return e;
  }

  /** Opacity of the dark glyph halo that brings ink of luminance `ink` at opacity `a` to `ratio`:1 over gas of
   * luminance `bg`. The halo is the label's immediate surround, so it is what the contrast is measured against. */
  function haloFor(bg, ink, a, ratio) {
    for (let h = 0.5; h <= 1; h += 0.05) {
      const b = bg * Math.pow(1 - h, 2.2), t = Math.pow(a * Math.pow(ink, 1 / 2.2) + (1 - a) * Math.pow(b, 1 / 2.2), 2.2);
      if ((t + 0.05) / (b + 0.05) >= ratio) return Math.min(1, h + 0.15);
    }
    return 1;
  }
  Labels.contrast = [];   // measured at the last update: {id, ratio} per shown label (for stats=1)
  function segHitsBox(a, b, r, pad) {   // Liang-Barsky: does segment ab cross the box grown by pad?
    const x0 = r[0] - pad, y0 = r[1] - pad, x1 = r[2] + pad, y1 = r[3] + pad, dx = b[0] - a[0], dy = b[1] - a[1]; let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
      if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
    }
    return true;
  }
  const hits = (a, list) => list.some((k) => a[0] < k[2] && a[2] > k[0] && a[1] < k[3] && a[3] > k[1]);

  /** st: {cp, album, quietAlbum, blockers, lines, only, morph:{from,to,k}|null, stop, gasK, ppwOverview, phone, names}
   * names: null (cfg.NAMES_MAX, strong regions, approved place names only on Sonic and Mood), a number (that many), or
   * 'all' (every region that fits, strong and fair, data words included). */
  Labels.update = function (st) {
    const Cam = RMR.Cam, D = RMR.D, vis = Cam.vis(), cp = st.cp, all = st.names === 'all';
    // No partial fades: names are at full strength through the whole-map and Overview bands, then gone.
    // Beside an album only the seed's region and its neighbours show, whatever the zoom.
    const on = st.quietAlbum ? !st.album && cp < C.BAND_B : st.album || cp < C.BAND_B;   // albumname=0: no names at all beside an open album
    const zoomK = U.clamp(Math.pow(RMR.cam.ppw / st.ppwOverview, 0.3), 0.85, 1.35);

    // candidates: this stop's regions, or both sets while the slider moves (a shared id travels with its centroid)
    let cands = [];
    if (st.morph) {
      const a = D.regions[st.morph.from], b = D.regions[st.morph.to], k = st.morph.k;
      for (const r of a.list) { let o = b.byId.get(r.id); if (o && o.word !== r.word) o = null;   // a label travels only when id and name word both match
        if (o) cands.push({ r: k < 0.5 ? r : o, wx: U.lerp(r.wx, o.wx, k), wy: U.lerp(r.wy, o.wy, k), a: 1 }); else cands.push({ r, wx: r.wx, wy: r.wy, a: U.clamp(1 - k / 0.4, 0, 1) }); }
      for (const r of b.list) if (!(a.byId.has(r.id) && a.byId.get(r.id).word === r.word)) cands.push({ r, wx: r.wx, wy: r.wy, a: U.clamp((k - 0.6) / 0.4, 0, 1) });
    } else cands = D.regions[st.stop].list.map((r) => ({ r, wx: r.wx, wy: r.wy, a: 1 }));
    // which regions may be named: strong ones, and on Sonic and Mood only those with an approved place name
    const named = (r) => (all ? !st.phone || r.strong || r.level === 0 : (r.stop === 'balanced' || !!r.name) && r.level !== 0);   // every named region, strong and fair; never a bare data word
    cands = cands.filter((c) => c.a > 0 && named(c.r));
    // hierarchy: broad areas alone at whole-map zoom, regions from Overview in; without areas, the top regions
    const hasAreas = cands.some((c) => c.r.level === 0), bandA = cp < C.BAND_A;
    cands = cands.filter((c) => (hasAreas ? (bandA && !st.album ? c.r.level === 0 : c.r.level !== 0) : true) && (!st.only || st.only.has(c.r.id)));
    cands.sort((p, q) => q.r.priority - p.r.priority);

    let blocked = 0; for (const k of st.blockers) blocked += Math.max(0, Math.min(k[2], vis.r) - Math.max(k[0], vis.l)) * Math.max(0, Math.min(k[3], vis.b) - Math.max(k[1], vis.t));
    const most = all ? C.NAMES_ALL_CAP : st.names != null ? st.names : C.NAMES_MAX;
    const cap = Math.min(most, st.phone ? C.NAMES_MAX_PHONE : Infinity, st.album || (all && bandA && !hasAreas) ? C.NAMES_MAX_ALBUM : Infinity);
    const budget = Math.min(cap, Math.max(1, Math.floor((vis.w * vis.h - blocked) / (160 * 90))));
    const placed = [], shown = new Set(); Labels.contrast = [];

    if (on) for (const c of cands) {
      if (placed.length >= budget) break;
      const r = c.r, p = Cam.toScreen(c.wx, c.wy);
      if (p[0] < vis.l || p[0] > vis.r || p[1] < vis.t || p[1] > vis.b) continue;
      const fs = st.phone ? U.clamp(fontSize(r) * 0.72, 13 * Math.min(1, F.size + 0.15), 16) : fontSize(r) * zoomK * (st.album ? 0.92 : 1);
      const w = textW(r.display, fs) / 2 + 6, h = (fs * 1.05) / 2 + 4;
      // a name tries its last spot first, so it does not jump about while the map moves
      const keep = sticky.get(r.id) || 0, order = [keep].concat(OFFSETS.map((_, k) => k).filter((k) => k !== keep));
      let box = null, used = 0;
      for (const k of order) {
        const x = p[0] + OFFSETS[k][0], y = p[1] + OFFSETS[k][1], b = [x - w, y - h, x + w, y + h];
        if (b[0] < vis.l + 10 || b[2] > vis.r - 10 || b[1] < vis.t + 10 || b[3] > vis.b - 10 || hits(b, st.blockers) || hits(b, placed) || (st.lines && st.lines.some((l) => segHitsBox(l[0], l[1], b, 8)))) continue;
        box = b; used = k; break;
      }
      if (!box) continue;
      sticky.set(r.id, used); placed.push(box); shown.add(r.id);
      const e = ensure(r), x = (box[0] + box[2]) / 2, y = (box[1] + box[3]) / 2;
      // contrast comes from a tight dark halo around the glyphs, its strength solved from the gas luminance under the label
      const w0 = Cam.toWorld(box[0], box[3]), w1 = Cam.toWorld(box[2], box[1]);
      let bg = RMR.Gas.lumIn(st.morph ? st.morph.from : st.stop, w0[0], w0[1], w1[0], w1[1]);
      if (st.morph) bg = Math.max(bg, RMR.Gas.lumIn(st.morph.to, w0[0], w0[1], w1[0], w1[1]));
      bg *= st.gasK;
      const ink = U.luminance(inkOf(r)), halo = haloFor(bg, ink, 1, st.album ? 5.5 : 4.5), hb = bg * Math.pow(1 - halo, 2.2);
      Labels.contrast.push({ id: r.id, ratio: +((ink + 0.05) / (hb + 0.05)).toFixed(2), gas: +bg.toFixed(3) });
      e.style.setProperty('--h', halo.toFixed(2));
      e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
      e.firstChild.style.fontSize = fs.toFixed(1) + 'px';
      e.style.setProperty('--a', c.a.toFixed(2));   // full strength, except a name fading in or out while the slider moves
      e.classList.remove('off');
    }
    els.forEach((e, id) => { if (!shown.has(id)) e.classList.add('off'); });
  };
})();
