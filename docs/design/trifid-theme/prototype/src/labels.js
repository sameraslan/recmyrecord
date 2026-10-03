/* Region labels, edge pointers and the "you are here" chip (UX.md section 5). All real buttons in the DOM.
 * Placement runs every drawn frame: priority order, a density budget, and no label over chrome, a cover or a line.
 * Each label sits on a soft elliptical scrim whose strength is computed from the gas luminance under it. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util, T = RMR.TEXT;
  const Labels = (RMR.Labels = {});
  let host, ptrHost, chip, srList, mctx;
  const els = new Map(), ptrs = new Map(), widths = new Map(), sticky = new Map();
  // nudges tried in order when the true centre is taken; small, so a name stays on its region
  const OFFSETS = [[0, 0], [0, -22], [0, 22], [-40, 0], [40, 0], [0, -46], [0, 46], [-70, -30], [70, 30], [70, -30], [-70, 30], [0, -78], [0, 78]];

  Labels.init = function (h, p, c, sr) {
    host = h; ptrHost = p; chip = c; srList = sr; mctx = document.createElement('canvas').getContext('2d');
    chip.addEventListener('click', () => { if (!chip._r) return; const S = RMR.S; S.noFly = true; RMR.go(S.route.name === 'album' ? Object.assign({}, S.route, { region: chip._r.id }) : { name: 'map', region: chip._r.id }); });   // opens the card in place; beside an album the album stays
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { widths.clear(); ptrs.forEach((e) => (e._w = 0)); RMR.requestRender(); });
  };

  function textW(text, weight, fs) {
    const key = weight + text; let w = widths.get(key);
    if (w == null) { mctx.font = `${weight} 100px "Cormorant Garamond", serif`; w = mctx.measureText(text.toUpperCase()).width + 17 * text.length; widths.set(key, w); }
    return (w * fs) / 100;
  }
  function fontSize(r) {
    if (r.level === 0) return 21 + 6 * Math.min(1, Math.sqrt(r.n / 1500));
    return r.strong ? 17 + 7 * Math.min(1, Math.sqrt(r.n / 346)) : 14 + 2 * Math.min(1, Math.sqrt(r.n / 346));
  }

  function ensure(r) {
    let e = els.get(r.id);
    if (!e) {
      e = U.el('button', 'rl off', '<span class="rl-scrim" aria-hidden="true"></span><b></b><span class="rl-sub"></span><span class="rl-ev"></span>');
      e.type = 'button';
      const on = () => RMR.setHoverRegion(e._r.id), off = () => RMR.setHoverRegion(null, e._r.id);
      e.addEventListener('mouseenter', on); e.addEventListener('mouseleave', off); e.addEventListener('focus', on); e.addEventListener('blur', off);
      e.addEventListener('click', () => RMR.go({ name: 'map', region: e._r.id }));
      host.appendChild(e); els.set(r.id, e);
    }
    if (e._r !== r) {
      e._r = r; e.children[1].textContent = r.display; e.children[2].textContent = RMR.Regions.plain(r); e.children[3].innerHTML = RMR.Regions.evidenceTagged(r);
      e.style.setProperty('--lc', r.ink); e.classList.toggle('fair', !r.strong); e.classList.toggle('area', r.level === 0);
      e.setAttribute('aria-label', `${r.display}. ${RMR.Regions.tagLine(r)}. ${RMR.Regions.evidenceText(r)}`);
    }
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
  Labels.contrast = [];   // measured at the last update: {id, ratio} per shown label (for the report)
  function segHitsBox(a, b, r, pad) {   // Liang-Barsky: does segment ab cross the box grown by pad?
    const x0 = r[0] - pad, y0 = r[1] - pad, x1 = r[2] + pad, y1 = r[3] + pad, dx = b[0] - a[0], dy = b[1] - a[1]; let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
      if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
    }
    return true;
  }
  const hits = (a, list) => list.some((k) => a[0] < k[2] && a[2] > k[0] && a[1] < k[3] && a[3] > k[1]);

  /** The screen-reader list of every region at the current stop (labels dropped for space are still reachable). */
  Labels.list = function () {
    srList.innerHTML = RMR.Regions.named().map((r) => `<li><a tabindex="-1" href="${RMR.href({ name: 'map', region: r.id })}">${U.esc(r.display)}. ${U.esc(RMR.Regions.tagLine(r))}. ${U.esc(RMR.Regions.evidenceText(r))}</a></li>`).join('');
  };

  /** Focus the placed label of a region (focus returns here when its card closes). False when it is not on the map. */
  Labels.focus = function (id) { const e = els.get(id); if (!e || e.classList.contains('off')) return false; e.focus({ preventScroll: true }); return document.activeElement === e; };
  /** st: {cp, album, blockers, hoverId, cardId, morph:{from,to,k}|null, stop, gasK, ppwOverview, pointers} */
  Labels.update = function (st) {
    const Cam = RMR.Cam, D = RMR.D, vis = Cam.vis(), cp = st.cp;
    // No partial fades: names are at full strength through the whole-map and Overview bands, then gone (the chip takes over).
    // Beside an album only the seed's region and its neighbours show, whatever the zoom.
    const bandAlpha = st.hidden ? 0 : st.album ? 1 : cp < C.BAND_B ? 1 : 0;
    const zoomK = U.clamp(Math.pow(RMR.cam.ppw / st.ppwOverview, 0.3), 0.85, 1.35);

    // candidates: this stop's regions, or both sets while the slider moves (a shared id travels with its centroid)
    let cands = [];
    if (st.morph) {
      const a = D.regions[st.morph.from], b = D.regions[st.morph.to], k = st.morph.k;
      for (const r of a.list) { let o = b.byId.get(r.id); if (o && o.word !== r.word) o = null;   // a label travels only when id and name word both match
        if (o) cands.push({ r: k < 0.5 ? r : o, wx: U.lerp(r.wx, o.wx, k), wy: U.lerp(r.wy, o.wy, k), a: 1 }); else cands.push({ r, wx: r.wx, wy: r.wy, a: U.clamp(1 - k / 0.4, 0, 1) }); }
      for (const r of b.list) if (!(a.byId.has(r.id) && a.byId.get(r.id).word === r.word)) cands.push({ r, wx: r.wx, wy: r.wy, a: U.clamp((k - 0.6) / 0.4, 0, 1) });
    } else cands = D.regions[st.stop].list.map((r) => ({ r, wx: r.wx, wy: r.wy, a: 1 }));
    // hierarchy: broad areas alone at whole-map zoom, regions from Overview in; without areas, the top regions
    const hasAreas = cands.some((c) => c.r.level === 0), bandA = cp < C.BAND_A;
    cands = cands.filter((c) => c.a > 0 && (hasAreas ? (bandA && !st.album ? c.r.level === 0 : c.r.level !== 0) : true) && (!st.only || st.only.has(c.r.id)) && (!st.phone || c.r.strong || c.r.level === 0));
    const first = (c) => (c.r.id === st.hoverId ? 2 : c.r.id === st.cardId ? 1 : 0);
    cands.sort((p, q) => first(q) - first(p) || q.r.priority - p.r.priority);

    let blocked = 0; for (const k of st.blockers) blocked += Math.max(0, Math.min(k[2], vis.r) - Math.max(k[0], vis.l)) * Math.max(0, Math.min(k[3], vis.b) - Math.max(k[1], vis.t));
    const cap = Math.min(st.labelCap, st.album || (bandA && !hasAreas) ? 8 : C.LABEL_CAP);
    const budget = Math.min(cap, Math.max(1, Math.floor((vis.w * vis.h - blocked) / (160 * 90))));
    const placed = [], shown = new Set(), offscreen = []; Labels.contrast = [];

    for (const c of cands) {
      const r = c.r, isOn = r.id === st.hoverId, p = Cam.toScreen(c.wx, c.wy);
      if (p[0] < vis.l || p[0] > vis.r || p[1] < vis.t || p[1] > vis.b) { if (r.strong && c.a >= 1) offscreen.push({ r, x: p[0], y: p[1] }); continue; }
      if (bandAlpha <= 0 || (placed.length >= budget && !isOn)) continue;
      const fs = st.phone ? U.clamp(fontSize(r) * 0.72, 13, 16) : fontSize(r) * zoomK * (st.album ? 0.92 : 1), weight = r.strong ? 600 : 500;
      const sub = r.strong && r.level !== 0 && !st.album && !st.phone && cp < C.BAND_B && !isOn && !!RMR.Regions.plain(r);
      // on a phone the box used for placement is the real 44 px tap box plus 8 px
      const w = Math.max(textW(r.display, weight, fs), isOn ? 400 : 0) / 2 + (st.phone ? 16 : 6), h = st.phone ? 26 : (fs * 1.05 + (isOn ? 30 : sub ? 19 : 0)) / 2 + 4;
      // the hovered label never moves (it would slide out from under the pointer); others try their last spot first
      const keep = sticky.get(r.id) || 0, order = isOn ? [keep] : [keep].concat(OFFSETS.map((_, k) => k).filter((k) => k !== keep));
      let box = null, used = 0;
      for (const k of order) {
        const x = p[0] + OFFSETS[k][0], y = p[1] + OFFSETS[k][1], b = [x - w, y - h, x + w, y + h];
        if (!isOn && (b[0] < vis.l + 10 || b[2] > vis.r - 10 || b[1] < vis.t + 10 || b[3] > vis.b - 10 || hits(b, st.blockers) || hits(b, placed) || (st.lines && st.lines.some((l) => segHitsBox(l[0], l[1], b, 8))))) continue;
        box = b; used = k; break;
      }
      if (!box) { if (r.strong && c.a >= 1 && hits([p[0] - 30, p[1] - 12, p[0] + 30, p[1] + 12], st.blockers.slice(0, st.chromeCount))) offscreen.push({ r, x: p[0], y: p[1], inside: true }); continue; }
      sticky.set(r.id, used); placed.push(box); shown.add(r.id);
      const e = ensure(r), x = (box[0] + box[2]) / 2, y = (box[1] + box[3]) / 2;
      const alpha = c.a, textA = isOn ? 1 : alpha;   // full strength or not at all, beside an album too
      // contrast comes from a tight dark halo around the glyphs, its strength solved from the gas luminance under the label
      const w0 = Cam.toWorld(box[0], box[3]), w1 = Cam.toWorld(box[2], box[1]);
      let bg = RMR.Gas.lumIn(st.morph ? st.morph.from : st.stop, w0[0], w0[1], w1[0], w1[1]);
      if (st.morph) bg = Math.max(bg, RMR.Gas.lumIn(st.morph.to, w0[0], w0[1], w1[0], w1[1]));
      bg *= st.gasK;
      const ink = sub || isOn ? 0.78 : U.luminance(U.lighten(r.col, 0.86)), halo = haloFor(bg, ink, 1, st.album ? 5.5 : 4.5);
      { const hb = bg * Math.pow(1 - halo, 2.2), a2 = 1, t = Math.pow(a2 * Math.pow(ink, 1 / 2.2) + (1 - a2) * Math.pow(hb, 1 / 2.2), 2.2); Labels.contrast.push({ id: r.id, ratio: +((t + 0.05) / (hb + 0.05)).toFixed(2), gas: +bg.toFixed(3) }); }
      e.style.setProperty('--h', halo.toFixed(2));
      e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`; e._x = Math.round(x / 80); e._y = Math.round(y / 60);
      e.children[1].style.fontSize = fs.toFixed(1) + 'px';
      e.style.setProperty('--a', textA.toFixed(2));
      const sc = e.children[0].style; sc.width = Math.round(2 * w + 16) + 'px'; sc.height = Math.round(2 * h + 8) + 'px'; sc.opacity = (Math.min(0.2, bg * 0.6) * c.a).toFixed(2);
      e.classList.toggle('on', isOn); e.classList.toggle('sub', sub); e.classList.remove('off');
    }
    els.forEach((e, id) => { if (!shown.has(id)) { e.classList.add('off'); e.classList.remove('on'); } });
    Labels.boxes = placed;
    // tab order follows the map: top to bottom, then left to right; re-sorted only once the view has settled and no name has focus
    if (st.settled && !host.contains(document.activeElement)) {
      const want = Array.from(els.values()).filter((e) => !e.classList.contains('off')).sort((a, b) => (a._y - b._y) || (a._x - b._x)), key = want.map((e) => e._r.id).join();
      if (key !== Labels._order) { Labels._order = key; for (const e of want) host.appendChild(e); }
    }

    // edge pointers: strong regions off screen, nearest first, in the whole-map and Overview bands only
    const want = new Map();
    if (st.pointers && cp < C.BAND_B && !st.album && !st.morph) {
      const dist = (o) => (o.inside ? -1 : 0) + Math.hypot(o.x - U.clamp(o.x, vis.l, vis.r), o.y - U.clamp(o.y, vis.t, vis.b));
      const chips = [];
      for (const o of offscreen.filter((q) => (hasAreas ? (bandA ? q.r.level === 0 : q.r.level !== 0) : true)).sort((p, q) => dist(p) - dist(q)).slice(0, st.pointerCap)) {
        let e = ptrs.get(o.r.id);
        if (!e) {
          e = U.el('button', 'ptr off', `${U.icon('arrow', 2)}<span></span>`); e.type = 'button';
          e.addEventListener('click', () => RMR.go({ name: 'map', region: e._r.id })); ptrHost.appendChild(e); ptrs.set(o.r.id, e);
        }
        if (e._r !== o.r) { e._r = o.r; e.lastChild.textContent = o.r.display; e.setAttribute('aria-label', T.pointerLabel(o.r.display)); e._w = 0; }
        if (!e._w) e._w = e.offsetWidth || 120;
        const hw = e._w / 2, hh = st.phone ? 22 : 11, rowStep = st.phone ? 50 : 30;   // on a phone the box is the real 44 px tap area, so two pointers never share it
        // slide along the edge until clear of chrome, labels and other pointers; if the edge is full, step inward
        const all = st.blockers.concat(placed, chips), bx = U.clamp(o.x, vis.l + 10 + hw, vis.r - 10 - hw), by = U.clamp(o.y, vis.t + 8 + hh, vis.b - 8 - hh);
        const horiz = o.inside ? true : by <= vis.t + 9 + hh || by >= vis.b - 9 - hh, inward = horiz ? (by > vis.cy ? -1 : 1) : bx > vis.cx ? -1 : 1;
        let x = bx, y = by, ok = false;
        for (let row = 0; row < 4 && !ok; row++) for (let n = 0; n < 31 && !ok; n++) {
          const d = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 24;
          x = horiz ? U.clamp(bx + d, vis.l + 10 + hw, vis.r - 10 - hw) : bx + inward * row * rowStep; y = horiz ? by + inward * row * rowStep : U.clamp(by + d, vis.t + 8 + hh, vis.b - 8 - hh);
          ok = !hits([x - hw - 6, y - hh - 4, x + hw + 6, y + hh + 4], all);
        }
        if (!ok) { e.classList.add('off'); continue; }
        chips.push([x - hw, y - hh, x + hw, y + hh]);
        e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
        e.firstChild.style.transform = `rotate(${(Math.atan2(o.y - y, o.x - x) * 180 / Math.PI + 90).toFixed(0)}deg)`;
        e.classList.remove('off'); want.set(o.r.id, 1);
      }
    }
    ptrs.forEach((e, id) => { if (!want.has(id)) e.classList.add('off'); });

    // "you are here": the region under the centre of the view, once names have faded from the map
    let here = null;
    // not beside an album (the panel names the album's own region), not for the region whose card is open, never with its map label
    if (cp >= C.BAND_B && !st.morph && !st.album) here = RMR.Regions.at(RMR.cam.x, RMR.cam.y);
    if (here && (here.id === st.cardId || shown.has(here.id))) here = null;
    // beside an album whose region name found no free spot, the chip carries the name instead
    if (st.album && !st.hidden && !shown.size && st.seedRegion && st.seedRegion.id !== st.cardId) here = st.seedRegion;
    if (here !== chip._r) {
      chip._r = here;
      if (here) { chip.innerHTML = `${RMR.Regions.dot(here)}<span>${U.esc(here.display)}</span>`; chip.setAttribute('aria-label', T.hereLabel(here.display)); }
    }
    chip.classList.toggle('off', !here);
    if (here) {   // top centre of the visible map; under the similarity card when the map is too narrow for both
      const tight = !st.phone && vis.w < 760;   // a phone has the slider at the bottom: the chip sits centred under the top row
      chip.style.left = (tight ? vis.l + 20 : vis.cx).toFixed(0) + 'px'; chip.style.top = st.phone ? (vis.t + st.freeTop + 4) + 'px' : tight ? (vis.t + 36 + st.modeH) + 'px' : ''; chip.style.transform = tight ? 'none' : '';
    }
  };
})();
