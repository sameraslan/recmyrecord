/* App: state, the hash router, the single on-demand frame, and map input.
 * Every state is in the URL hash (see README.md), so any view can be linked and screenshotted. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util, T = RMR.TEXT, COPY = RMR.COPY, Cam = RMR.Cam;
  const $ = (id) => document.getElementById(id);
  const S = (RMR.S = {
    route: { name: 'map' }, stop: 'balanced', t: 0.5, morph: null,
    focus: null, pool: null, hot: null, hover: null, hoverRegion: null, pick: null, iso: null,
    trail: [], framing: null, started: false, instant: false,
    proto: { chrome: 'trifid', gas: 'baked', data: 'real', hud: false, hulls: false }, force: {},
    amt: { pool: 0, iso: 0, hl: 0 },   // animated 0..1 amounts
  });
  const stats = (window.__rmr = { frames: 0, lastFrameMs: 0, worstFrameMs: 0, gasMs: 0 });
  const anims = {};
  let raf = 0, lastFrameEnd = 0, chained = false, ppwOverview = 1000, tipTimer = 0, cardBox = null;

  // ---------- routing ----------
  function parse(hash) {
    const h = (hash || '').replace(/^#/, ''), cut = h.indexOf('?'), path = cut < 0 ? h : h.slice(0, cut), q = new URLSearchParams(cut < 0 ? '' : h.slice(cut + 1));
    const seg = path.split('/').filter(Boolean), stopOf = (v) => (C.STOPS.includes(v) ? v : 'balanced');
    const route = seg[0] === 'album' && seg[1] ? { name: 'album', slug: decodeURIComponent(seg[1]), more: q.get('more') === '1', view: q.get('view') === 'map' ? 'map' : null, region: q.get('region') || null }
      : seg[0] === 'map' ? { name: 'map', region: q.get('region') || null, pick: q.get('pick') || null }
      : !seg.length ? { name: 'home' } : seg[0] === 'about' ? { name: 'about' } : { name: 'notfound' };
    return {
      route, stop: stopOf(route.name === 'album' ? q.get('by') : q.get('stop')),
      proto: { chrome: q.get('chrome') === 'site' ? 'site' : 'trifid', gas: q.get('gas') === 'live' ? 'live' : 'baked', data: q.get('data') === '10k' ? '10k' : 'real', hud: q.get('hud') === '1', hulls: q.get('hulls') === '1', home: q.get('home') === 'b' ? 'b' : 'a', regions: q.get('regions') === 'default' ? 'default' : 'fine' },
      force: { hover: q.get('hover'), legend: q.get('legend'), cam: q.get('cam'), fit: q.get('fit'), q: q.get('q'), bench: q.get('bench'), check: q.get('check'), idle: q.get('idle'), then: q.get('then'), morph: q.get('morph'), from: q.get('from'), scroll: q.get('scroll'), menu: q.get('menu'), focus: q.get('focus'), stats: q.get('stats'), plate: q.get('plate'), sheet: q.get('sheet'), colours: q.get('colours') },
    };
  }
  /** Hash for a route; the stop and the prototype switches ride along. */
  RMR.href = function (r, stop) {
    const q = new URLSearchParams(); stop = stop || S.stop; let path = '/map';
    if (r.name === 'album') { path = '/album/' + encodeURIComponent(r.slug); if (stop !== 'balanced') q.set('by', stop); if (r.more) q.set('more', '1'); if (r.view) q.set('view', 'map'); if (r.region) q.set('region', r.region); }
    else if (r.name !== 'map') { path = r.name === 'home' ? '/' : r.name === 'about' ? '/about' : '/404'; if (stop !== 'balanced') q.set('stop', stop); }   // pages keep the stop too
    else { if (r.region) q.set('region', r.region); if (r.pick) q.set('pick', r.pick); if (stop !== 'balanced') q.set('stop', stop); }
    if (r.name === 'map' && S.camHash && !r.region && !r.pick && S.route.name === 'map' && S.framing == null) q.set('cam', S.camHash);
    const p = S.proto; if (p.chrome === 'site') q.set('chrome', 'site'); if (p.gas === 'live') q.set('gas', 'live'); if (p.data === '10k') q.set('data', '10k'); if (p.hud) q.set('hud', '1'); if (p.hulls) q.set('hulls', '1'); if (p.home === 'b') q.set('home', 'b'); if (p.regions === 'default') q.set('regions', 'default');
    const s = q.toString(); return '#' + path + (s ? '?' + s.replace(/%2C/g, ',') : '');
  };
  RMR.go = function (r, replace, stop) {
    const h = RMR.href(r, stop);
    if (replace) { history.replaceState(null, '', h); apply(); } else if (location.hash === h) apply(); else location.hash = h;
  };
  RMR.closeAlbum = () => RMR.go({ name: 'map' });
  RMR.setMapMode = (on) => { if (S.route.name === 'album') RMR.go(Object.assign({}, S.route, { view: on ? 'map' : null }), true); };
  // on a phone the album group is framed inside the free rectangle (measured: top rows, slider, any sheet)
  const phonePad = () => { const f = Cam.free || { top: 120, bottom: 110 }; return { top: f.top + 34, right: 36, bottom: f.bottom + 34, left: 36 }; };
  // desktop, with a region card open beside the album: the group is framed to the right of the card, so no cover or line sits under it
  const cardPad = () => (!S.narrow && cardBox && S.route.region ? { top: 110, right: 96, bottom: 90, left: cardBox[0] + 64 } : null);
  const focusCam = () => RMR.Focus.camera(focusIds(), RMR.D.pos[S.stop], panelW(), S.narrow ? phonePad() : cardPad());
  RMR.setStop = (stop) => { if (stop !== S.stop && RMR.D.stops.includes(stop)) RMR.go(S.route, true, stop); };

  const panelW = () => (RMR.view.W < 900 ? 0 : RMR.view.W <= 1100 ? 480 : Math.min(RMR.view.W * 0.45, 660));
  const focusIds = () => [S.focus.seed].concat(S.focus.recs);

  function apply() {
    const p = parse(location.hash), D = RMR.D, first = !S.started, prev = S.route, prevStop = S.stop;
    const ae = document.activeElement, hadCard = $('card-slot')._key || '', prevRegion = prev.region || null;
    // camera moves are collected and run after the chrome is laid out, so a phone can frame inside the measured free rectangle
    const moves = [], fly = (to, d, e) => moves.push([to, d, e]);
    if (S.started && (p.proto.data !== S.proto.data || p.proto.regions !== S.proto.regions)) { location.reload(); return; }
    S.narrow = RMR.view.W < 900;
    S.proto = p.proto; S.force = p.force; document.documentElement.dataset.chrome = p.proto.chrome;
    S.instant = first;

    // the similarity stop: positions, gas and labels morph together
    const stop = D.stops.includes(p.stop) ? p.stop : 'balanced', stopChanged = stop !== S.stop;
    if (stopChanged || first) {
      const toT = RMR.STOP_T[stop];
      if (first || U.reducedMotion()) { S.t = toT; S.morph = null; }
      else S.morph = { from: S.morph ? (S.morph.k < 0.5 ? S.morph.from : S.morph.to) : prevStop, to: stop, fromT: S.t, toT, t0: performance.now(), k: 0 };   // an interrupted morph starts from the set that is on screen
      if (first && p.force.morph && C.STOPS.includes(p.force.from)) { const k = U.clamp(Number(p.force.morph), 0, 1), e = U.easeInOutCubic(k), fromT = RMR.STOP_T[p.force.from]; S.morph = { from: p.force.from, to: stop, fromT, toT, k: e, frozen: true }; S.t = U.lerp(fromT, toT, e); }   // morph=0.5&from=balanced: a frozen mid-morph frame
      S.stop = stop; ppwOverview = Cam.fitOverview(stop, 0).ppw; Cam.setLimits(stop); RMR.Labels.list();
    }
    const dur = stopChanged && !first ? C.DUR.morph : 0, ease = stopChanged ? U.easeInOutCubic : U.easeOut;

    const prevWord = S.route.region && RMR.D.regions[prevStop].byId.get(S.route.region) ? RMR.D.regions[prevStop].byId.get(S.route.region).word : null;
    if (!first && prev.name !== p.route.name) S.prevHash = S.lastHash; S.lastHash = location.hash;
    S.route = p.route;
    let seed = S.route.name === 'album' ? D.pointOf(D.bySlug.get(S.route.slug)) : null;
    if (S.route.name === 'album' && seed == null) S.route = { name: 'notfound' };
    const page = S.route.name !== 'album' && S.route.name !== 'map';
    S.mapMode = S.narrow && S.route.name === 'album' && S.route.view === 'map';
    if (S.route.name === 'album') {
      const recs = D.recs(S.stop, seed).slice(0, S.route.more ? C.REC_MAX : C.REC_DEFAULT), key = [seed, S.stop, recs.length].join();
      const k = S.trail.indexOf(seed); if (k >= 0) S.trail.splice(k, 1); S.trail.push(seed);
      S.pick = null; S.hot = null;
      if (prev.name === 'map' && !first) S.mapCam = { x: RMR.cam.x, y: RMR.cam.y, ppw: RMR.cam.ppw, inset: 0 };   // restored when the album closes
      if (S.route.region && !RMR.Regions.get(S.route.region)) { S.route.region = null; history.replaceState(null, '', RMR.href(S.route)); }
      if (!S.focus || S.focus.key !== key || first) {
        S.focus = { seed, recs, key, set: new Set([seed].concat(recs)) };
        const to = focusCam();
        // gas pool: a soft dim area around the group (world centre and radius)
        const P = D.pos[S.stop]; let b = [1e9, 1e9, -1e9, -1e9]; for (const i of focusIds()) b = [Math.min(b[0], P[2 * i]), Math.min(b[1], P[2 * i + 1]), Math.max(b[2], P[2 * i]), Math.max(b[3], P[2 * i + 1])];
        S.pool = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.max(Math.hypot(b[2] - b[0], b[3] - b[1]) * 0.3, 170 / to.ppw)];
        S.framing = null; S.focusFramed = true; fly(focusCam, dur || C.DUR.camera, ease);
        RMR.Ov.preload(focusIds());
      } else if ((prev.region || null) !== (S.route.region || null) && S.focusFramed && !S.narrow && !S.noFly) fly(focusCam, C.DUR.camera);   // the card opening or closing re-frames the group
      S.noFly = false;
      animate('pool', 1, C.DUR.pool);
    } else {
      const wasAlbum = prev.name === 'album' && !first;
      S.focus = null; animate('pool', 0, C.DUR.pool);
      let region = !page && S.route.region ? RMR.Regions.get(S.route.region) : null;
      // a region that is not at this stop, or whose name word differs here, closes its card
      if (region && stopChanged && !first && prevWord && prevWord !== region.word) region = null;
      if (S.route.region && !region) { if (!page) { if (!stopChanged) RMR.UI.toast(T.regionGone); S.route.region = null; history.replaceState(null, '', RMR.href(S.route)); } }
      const pick = S.route.pick ? D.pointOf(D.bySlug.get(S.route.pick)) : null;
      const noFly = S.noFly; S.noFly = false;
      const regionChanged = region && !noFly && (first || prev.region !== region.id || prev.name !== 'map' || stopChanged), pickChanged = pick != null && (first || pick !== S.pick || stopChanged);   // the camera follows a pick or a region through the morph
      S.pick = pick;
      if (first) { const kind = page || p.force.fit === 'whole' ? 'whole' : 'overview'; fly(() => framed(kind), -1); }
      else if (S.route.name === 'home' && prev.name !== 'home') fly(() => framed('whole'), C.DUR.camera);
      if (page) { /* a still backdrop */ }
      else if (regionChanged) { S.framing = null; fly(() => RMR.Regions.camera(region, 0), dur || C.DUR.fly, ease); }
      else if (pickChanged) { S.framing = null; fly(() => pickCam(pick), dur || C.DUR.fly, ease); RMR.Ov.preload([pick]); }
      else if (wasAlbum && !page) { const back = S.mapCam; fly(() => back || { x: Cam.toWorld(RMR.view.W / 2, Cam.vis().cy)[0], inset: 0 }, dur || C.DUR.panel, ease); S.mapCam = null; }   // back to the map as it was left
      else if (!first && S.route.name === 'map' && prev.name !== 'map' && prev.name !== 'album') fly(() => framed('overview'), C.DUR.camera);   // Home or About to the map lands on Overview
      else if (stopChanged && S.framing) { const kind = S.framing; fly(() => framed(kind), dur, ease); }
    }
    if (!S.mapMode) S.plate = null;
    if (first && S.mapMode && p.force.plate != null && S.focus) S.plate = S.focus.recs[Math.max(0, Number(p.force.plate) - 1)];   // plate=N: the name plate of the Nth closest album

    // forced states for screenshots
    const fh = p.force.hover;
    if (fh != null) { if (/^\d+$/.test(fh)) { S.hover = Number(fh); S.tipFor = S.hover; if (S.focus && S.focus.recs.includes(S.hover)) S.hot = S.hover; } else S.hoverRegion = fh; }
    else if (S.forced) { S.hover = null; S.hoverRegion = null; S.tipFor = null; }
    S.forced = fh != null;
    const fam = C.FAM_IDS.indexOf(p.force.legend); if (fam >= 0 || first) { S.isoPin = fam >= 0 ? fam : null; RMR.setIso(S.isoPin); RMR.UI.legendState(S.isoPin); }

    // chrome
    const album = S.route.name === 'album', a = album ? D.album(S.focus.seed) : null;
    const reg = !page && S.route.region ? RMR.Regions.get(S.route.region) : null;
    document.title = page ? RMR.Pages.title(S.route.name) : (album ? COPY.albumLabel(a.t, a.a) : (reg ? reg.display + ' · ' : '') + COPY.navMap) + ' · recmyrecord';
    if (!(S.narrow && album && !S.mapMode)) RMR.glStart();   // the phone's album list does not need WebGL until the strip shows or Map is tapped
    $('ui').style.left = (album ? panelW() : 0) + 'px';
    $('explore-here').hidden = !album; $('ui').hidden = page;
    document.documentElement.dataset.route = S.route.name; RMR.Pages.show(); RMR.Pages.fab();
    RMR.UI.panel(); RMR.UI.card(); RMR.UI.slider(); RMR.UI.plate(); syncProto(); highlight();
    if (!S.narrow || page || (album && !S.mapMode)) RMR.UI.colours(false);
    if (album) RMR.Pages.watchStrip();
    measure();
    // the camera, now that the free rectangle is known
    for (const [to, d, e] of moves) { if (d < 0) Cam.set(to()); else Cam.tween(to(), d, e); }
    if (p.force.cam && (first || p.force.cam !== S.lastCam)) { const v = p.force.cam.split(',').map(Number); if (v.length === 3 && v.every(isFinite)) { S.framing = null; S.focusFramed = false; Cam.set({ x: v[0], y: v[1], ppw: v[2] }); } }
    S.lastCam = p.force.cam;
    S.instant = false;
    if (!first) refocus(prev, ae, hadCard, prevRegion);
    if (p.force.scroll === 'strip' && album) { const sc = document.querySelector('.album-scroll'); if (sc) sc.scrollTop = sc.scrollHeight; }
    $('stress').hidden = !(D.synth || S.synthMissing); document.documentElement.toggleAttribute('data-stress', !$('stress').hidden); if (!$('stress').hidden) $('stress').textContent = D.synth ? T.stressBanner : T.stressMissing;
    if (first && p.force.menu) setTimeout(() => { if (p.force.menu === 'regions') RMR.UI.regionsMenu(true); if (p.force.menu === 'card') { const b = document.querySelector('.rc-more'); if (b) b.click(); } }, 0);   // menu=regions|card: open states for screenshots
    if (first && p.force.focus) setTimeout(() => RMR.Labels.focus(p.force.focus), 400);   // focus=<region id>: keyboard focus on a region name, for the focus-ring screenshot
    if (first && p.force.colours && S.narrow) setTimeout(() => RMR.UI.colours(true), 0);
    if (p.force.q != null && first) setTimeout(() => { if (S.narrow) RMR.Pages.sheet(true); RMR.Search.demo(p.force.q); }, 0);
    RMR.requestRender();
  }
  /** A picked album is centred in the visible map; on a phone, in the free rectangle above the sheet, and zoomed until covers begin. */
  function pickCam(pick) {
    const P = RMR.D.pos[S.stop], f = Cam.free, t = Cam.target(), ppw = S.narrow ? Math.max(t.ppw, C.BAND_B / RMR.D.coverWorld) : t.ppw;
    return { x: P[2 * pick], y: P[2 * pick + 1] + (f ? (f.top - f.bottom) / 2 / ppw : 0), ppw, inset: 0 };
  }
  /** Measure the chrome. Desktop: the similarity card's height. Phone: the free rectangle between the top row(s) and the
   * slider or the sheet resting on it (the slider's distance from the pane bottom includes the safe-area inset). */
  function measure() {
    const root = document.documentElement.style, mode = document.querySelector('.mode'), view = RMR.view, page = S.route.name !== 'map' && S.route.name !== 'album';
    modeH = mode.offsetHeight || modeH; root.setProperty('--mode-h', modeH + 'px');
    const card = $('card-slot').firstElementChild; cardBox = card ? [card.offsetWidth, card.offsetHeight] : null;
    if (!S.narrow || page) { Cam.free = null; if (!S.narrow) root.setProperty('--slider-cover', (modeH + 12) + 'px'); return; }
    const r = mode.getBoundingClientRect(), cover = r.height ? Math.round(view.H - r.top) : modeH + 12;
    const top = S.route.name === 'album' ? 116 : 60;   // one row of buttons on the map, two beside an album
    root.setProperty('--slider-cover', cover + 'px'); root.setProperty('--free-top', top + 'px');
    const plate = $('plate').hidden ? 0 : $('plate').offsetHeight + 8, sheet = cover + (card ? card.offsetHeight - 1 : plate);
    root.setProperty('--sheet-cover', sheet + 'px');
    const was = Cam.free; Cam.free = { top, bottom: sheet, cover };
    if (!was || was.top !== top || was.bottom !== sheet) Cam.setLimits(S.stop);
  }
  /** After a sheet changes height (or the window does): measure again and re-frame what the view is showing. */
  RMR.relayout = function () {
    measure(); if (!S.narrow) return RMR.requestRender();
    const region = S.route.region ? RMR.Regions.get(S.route.region) : null;
    if (region && S.route.name === 'map') Cam.tween(RMR.Regions.camera(region, 0), C.DUR.zoom);
    else if (S.route.name === 'map' && S.pick != null) Cam.tween(pickCam(S.pick), C.DUR.zoom);
    else if (S.focus && S.focusFramed) Cam.tween(focusCam(), C.DUR.zoom);
    else if (S.framing) Cam.tween(framed(S.framing), C.DUR.zoom);
    RMR.requestRender();
  };
  /** WebGL starts on demand: at boot everywhere except the phone's album list, which waits for the strip or the Map button. */
  RMR.glStart = function () {
    if (S.gl) return; S.gl = true;
    if (!RMR.Gas.init($('gl'))) $('nowebgl').hidden = false;
    RMR.Stars.init(); highlight(); RMR.requestRender();
  };
  RMR.setPlate = function (i) { if (S.plate === i || (i == null && S.plate == null)) return; S.plate = i; RMR.setHot(i != null && S.focus && S.focus.recs.includes(i) ? i : null); S.hover = i; RMR.UI.plate(); measure(); RMR.requestRender(); };

  // ---------- focus ----------
  const shown = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]');
  /** What opened a thing, so focus can go back there when it closes. */
  function openerOf(ae, keep) {
    if (S.openerHint) { const h = S.openerHint; S.openerHint = null; return h; }
    if (!ae || ae === document.body) return keep || null;
    if (ae.closest('#regions-menu')) return $('regions-btn');
    if (ae.closest('#card-slot')) return keep || null;   // a card replacing itself keeps its first opener
    return ae;
  }
  /** Focus return: when the album panel or a card closes, focus goes to its opener, else to the region's name on the map, else to the map. */
  function refocus(prev, ae, hadCard, prevRegion) {
    const key = $('card-slot')._key || '', album = S.route.name === 'album', wasAlbum = prev.name === 'album';
    if (!hadCard && key) S.cardOpener = openerOf(ae, null); else if (hadCard && key && key !== hadCard) S.cardOpener = openerOf(ae, S.cardOpener);
    if (album && !wasAlbum) S.albumOpener = openerOf(ae, null);
    const closedCard = hadCard && !key && album === wasAlbum, closedAlbum = wasAlbum && !album;
    if (!closedCard && !closedAlbum) { S.openerHint = null; return; }
    const to = closedCard ? S.cardOpener : S.albumOpener;
    setTimeout(() => {   // after the next frame, so a region name that has just come back on the map can take focus
      const now = document.activeElement; if (now && now !== document.body && shown(now)) return;   // focus is already somewhere sensible (a tap on the map)
      if (shown(to)) return to.focus({ preventScroll: true });
      if (closedCard && prevRegion && RMR.Labels.focus(prevRegion)) return;
      const fall = album && !S.mapMode ? $('seed-title') : $('ov'); if (shown(fall)) fall.focus({ preventScroll: true });
    }, 80);
  }
  // keyboard or pointer: a card opened from the keyboard takes focus
  document.addEventListener('keydown', () => (S.kbd = true), true); document.addEventListener('pointerdown', () => (S.kbd = false), true);

  // ---------- ghost clicks (the app's lib/ghost-click.ts) ----------
  // After a touch selection made on pointerup the browser still sends a mousedown and a click at the same spot, which can land
  // on whatever the selection revealed (a sheet button, a list row). Swallow that click; disarm on the next pointerdown.
  let ghost = null, ghostOn = false;
  const isGhost = (e) => !!ghost && performance.now() <= ghost.until && Math.abs(e.clientX - ghost.x) <= 12 && Math.abs(e.clientY - ghost.y) <= 12;
  RMR.suppressGhostClick = function (x, y) {
    if (!ghostOn) {
      ghostOn = true;
      document.addEventListener('pointerdown', () => (ghost = null), true);
      document.addEventListener('mousedown', (e) => { if (isGhost(e)) e.preventDefault(); }, true);
      document.addEventListener('click', (e) => { if (!ghost) return; const hit = isGhost(e); ghost = null; if (hit) { e.preventDefault(); e.stopPropagation(); } }, true);
    }
    ghost = { x, y, until: performance.now() + 700 };
  };

  function framed(kind) { S.framing = kind; return kind === 'whole' ? Cam.fitWhole(S.stop, 0) : Cam.fitOverview(S.stop, 0); }
  /** The fit button: Overview; pressed again at Overview, the whole map. Beside an album it reframes the album. */
  RMR.fit = function () {
    if (S.focus) { S.focusFramed = true; return Cam.tween(focusCam(), C.DUR.camera); }
    Cam.tween(framed(S.framing === 'overview' ? 'whole' : 'overview'), C.DUR.camera);
  };

  // ---------- small state setters ----------
  function animate(name, to, dur) {
    const from = S.amt[name]; if (from === to && !anims[name]) return;
    if (U.reducedMotion() || S.instant || !dur) { S.amt[name] = to; delete anims[name]; } else anims[name] = { from, to, t0: performance.now(), dur };
    RMR.requestRender();
  }
  function highlight() {   // stars outside the hovered (or opened) region dim by a quarter
    const id = S.hoverRegion || S.route.region, r = id ? RMR.Regions.get(id) : null;
    if (r) RMR.Stars.highlight(S.stop, r);
    animate('hl', r ? 1 : 0, 160);
  }
  RMR.setHoverRegion = function (id, onlyIf) { if (S.forced || (id == null && onlyIf && S.hoverRegion !== onlyIf) || S.hoverRegion === id) return; S.hoverRegion = id; highlight(); RMR.requestRender(); };
  RMR.setHot = function (id, onlyIf) { if ((id == null && onlyIf != null && S.hot !== onlyIf) || S.hot === id) return; S.hot = id; RMR.UI.hot(); RMR.requestRender(); };
  RMR.setIso = function (j) { if (j == null) j = S.isoPin; if (j != null) S.iso = j; animate('iso', j != null ? 1 : 0, 220); };   // hover previews; leaving returns to the pinned family, if any
  RMR.pinIso = function (j) { S.isoPin = S.isoPin === j ? null : j; RMR.UI.legendState(S.isoPin); RMR.setIso(S.isoPin); };
  RMR.toggleLabels = function (off) { S.labelsOff = off == null ? !S.labelsOff : off; try { localStorage.setItem('rmr-labels-off', S.labelsOff ? '1' : ''); } catch (e) { /* private mode */ } syncProto(); RMR.requestRender(); };
  function setHover(i) {
    if (S.forced || S.hover === i) return;
    S.hover = i; clearTimeout(tipTimer); S.tipFor = null;
    if (i != null) tipTimer = setTimeout(() => { S.tipFor = i; RMR.requestRender(); }, C.DUR.hover);
    $('ov').classList.toggle('is-pointing', i != null);
    RMR.UI.hot(); RMR.requestRender();
  }

  // ---------- the frame ----------
  RMR.requestRender = function () { if (!raf && S.started) raf = requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    const t0 = performance.now();
    let active = Cam.step(now);
    if (S.morph && !S.morph.frozen) {
      const k = U.clamp((now - S.morph.t0) / C.DUR.morph, 0, 1), e = U.easeInOutCubic(k);
      S.t = U.lerp(S.morph.fromT, S.morph.toT, e); S.morph.k = e;
      if (k >= 1) { S.morph = null; highlight(); } else active = true;
    }
    for (const name in anims) {
      const a = anims[name], k = U.clamp((now - a.t0) / a.dur, 0, 1); S.amt[name] = U.lerp(a.from, a.to, U.easeOut(k));
      if (k >= 1) delete anims[name]; else active = true;
    }
    draw(active || Cam.dragging());
    const end = performance.now();
    if (!stats.frames && window.parent !== window) window.parent.postMessage('rmr-ready', '*');   // phone.html loads its frames one at a time
    stats.frames++; stats.lastFrameMs = Math.round((chained ? end - lastFrameEnd : end - t0) * 10) / 10; stats.gasMs = Math.round(RMR.Gas.lastMs * 10) / 10;
    if (stats.frames > 3) stats.worstFrameMs = Math.max(stats.worstFrameMs, stats.lastFrameMs);
    // a slow renderer (software WebGL) gets the gas at half resolution while the view moves
    if (chained && active) { slowRun = end - lastFrameEnd > 45 ? slowRun + 1 : 0; if (slowRun >= 3) RMR.Gas.slow = true; }
    lastFrameEnd = end; chained = active;
    if (S.proto.hud) $('hud').textContent = `frame ${stats.lastFrameMs} ms   worst ${stats.worstFrameMs} ms\nframes ${stats.frames}   gas ${S.proto.gas}${RMR.Gas.slow ? ' (half res moving)' : ''}`;
    if (active) RMR.requestRender();
    else if (S.route.name === 'map' && !S.force.bench && !S.force.stats) {   // the settled camera goes into the hash, so a reload or a shared link lands on the same view
      const cam = RMR.cam, v = [cam.x.toFixed(4), cam.y.toFixed(4), cam.ppw.toFixed(0)].join(',');
      if (v !== S.lastCam && S.framing == null && !S.route.region && S.route.pick == null) { S.lastCam = v; S.camHash = v; history.replaceState(null, '', RMR.href(S.route)); S.lastHash = location.hash; }
    }
  }
  let slowRun = 0, lastT = -1, modeH = 118;
  const anchor = [0, 0];

  /** Draw everything once for the current state. */
  function draw(moving) {
    const D = RMR.D, view = RMR.view, cam = RMR.cam;
    if (S.t !== lastT) { lastT = S.t; const P = RMR.P, o = [0, 0]; for (let i = 0; i < D.n; i++) { RMR.posAt(i, S.t, o); P[2 * i] = o[0]; P[2 * i + 1] = o[1]; } }
    const cp = Cam.coverPx(), fade = Cam.coverFade();
    // zoom bands (UX.md section 2): the gas yields as covers approach; dust is gone before covers show
    const strength = cp < C.BAND_B ? 1 : cp < C.BAND_C ? U.lerp(1, 0.6, (cp - C.BAND_B) / (C.BAND_C - C.BAND_B)) : cp < C.BAND_D ? U.lerp(0.6, 0.3, (cp - C.BAND_C) / (C.BAND_D - C.BAND_C)) : 0.3;
    const dust = 1 - U.smooth(C.BAND_B, C.BAND_C, cp);

    let items = null;
    if (S.focus) items = RMR.Focus.layout(focusIds().map((id) => { Cam.toScreen(RMR.P[2 * id], RMR.P[2 * id + 1], anchor); return { id, x: anchor[0], y: anchor[1] }; }));
    const hot = S.hot != null ? S.hot : S.focus && S.focus.recs.includes(S.hover) ? S.hover : null;
    S.items = items;

    RMR.Gas.draw({ t: S.t, strength, dust, pool: S.pool, poolAmt: S.amt.pool, iso: S.iso, isoAmt: S.amt.iso, baked: S.proto.gas === 'baked', moving });
    const sizeK = RMR.Stars.sizeK(cp);
    RMR.Stars.draw({ t: S.t, alpha: (1 - fade) * U.lerp(1, 0.45, S.amt.pool) * U.clamp(sizeK * sizeK, 0.45, 1), hlAmt: S.amt.hl * (S.route.region && !S.hoverRegion ? 2 : 1), sizeK, halo: U.smooth(5, 7, cp) });   // small and dim when zoomed out, no halos under 6 px covers
    RMR.Ov.draw({ items, hot, focus: !!S.focus, focusSet: S.focus ? S.focus.set : null, pick: S.pick, hover: S.hover });

    // what labels must stay clear of: chrome, focus covers and focus lines
    const L = cam.inset, page = S.route.name !== 'map' && S.route.name !== 'album';
    // chrome rectangles: desktop has the slider top left and zoom bottom right; the phone has the slider across the bottom
    const f = Cam.free || { top: 60, bottom: modeH + 12 }, phoneMap = S.narrow && !page;
    const B = S.narrow ? [[0, view.H - f.bottom - 10, view.W, view.H], [view.W - 64, view.H - f.bottom - 150, view.W, view.H - f.bottom], [0, view.hdr, 230, view.hdr + f.top]]
      : [[L + 12, view.hdr + 12, L + 272, view.hdr + 28 + modeH], [view.W - 68, view.H - 148, view.W, view.H]];
    if (!S.narrow) B.push([L + 12, view.hdr + 28 + modeH, L + 110, view.hdr + 70 + modeH]);
    if (page) B.length = 0;
    const hintOn = fade <= 0 && !cardBox && !page && !S.narrow;   // the phone has the Colours chip instead of the sentence
    if (hintOn) B.push([L, view.H - 62, L + Math.min(760, view.W - L - 80), view.H]);
    if (cardBox && !S.narrow) B.push([L + 12, view.H - 28 - cardBox[1], L + 28 + cardBox[0], view.H]);
    if (S.focus) B.push(S.narrow ? [view.W - 110, view.hdr, view.W, view.hdr + 64] : [view.W - 200, view.hdr + 12, view.W, view.hdr + 68]);   // "Explore this area" (desktop), the List button (phone)
    if (!$('stress').hidden) { const v = Cam.vis(); B.push([v.cx - 170, view.hdr + 12, v.cx + 170, view.hdr + 56]); }
    if (cp >= C.BAND_B || S.focus) { const v = Cam.vis(), y = $('stress').hidden ? 0 : 40; B.push(S.narrow ? [v.cx - 130, view.hdr + f.top, v.cx + 130, view.hdr + f.top + 52] : v.w < 760 ? [L + 12, view.hdr + 28 + modeH, L + 280, view.hdr + 80 + modeH] : [v.cx - 130, view.hdr + 12 + y, v.cx + 130, view.hdr + 60 + y]); }
    if (S.pick != null && !S.focus) { Cam.toScreen(RMR.P[2 * S.pick], RMR.P[2 * S.pick + 1], anchor); B.push([anchor[0] - 22, anchor[1] - 22, anchor[0] + 22, anchor[1] + 22]); }   // a name never sits on the picked album
    const chromeCount = B.length; let lines = null, only = null;
    if (items) {
      const s = items[0];
      for (const it of items) { const h = it.size / 2 + 12; B.push([it.x - h, it.y - h, it.x + h, it.y + h]); }
      { const r = RMR.D.regionOf(S.stop, S.focus.seed), near = r ? [r].concat(RMR.Regions.neighbours(r, 2)) : RMR.Regions.between(S.focus.seed); only = new Set(near.map((q) => q.id)); }
      lines = items.slice(1).map((it) => [[s.x, s.y], [it.x, it.y]]);
    }
    const seedRegion = S.focus ? RMR.D.regionOf(S.stop, S.focus.seed) : null;
    RMR.Labels.update({ cp, album: !!S.focus, blockers: B, hoverId: S.hoverRegion, cardId: S.route.region, morph: S.morph, stop: S.stop, gasK: Math.pow(strength * U.lerp(1, 0.6, S.amt.pool), 1.4), ppwOverview, pointers: !page, chromeCount, modeH, labelCap: view.W < 900 ? 4 : C.LABEL_CAP, pointerCap: view.W < 900 ? C.POINTER_CAP_PHONE : C.POINTER_CAP, lines, only, phone: S.narrow, hidden: S.labelsOff, settled: !moving, seedRegion, freeTop: f.top });
    RMR.UI.hint(fade, page); RMR.Pages.strip();
    if (!moving && !page) nearList();
    if (S.tipFor != null && S.tipFor === S.hover) {
      const it = items && items.find((q) => q.id === S.hover);
      if (it) RMR.UI.tip(S.hover, 0, 0, (w, h) => tipSpot(it, items, w, h)); else { Cam.toScreen(RMR.P[2 * S.hover], RMR.P[2 * S.hover + 1], anchor); RMR.UI.tip(S.hover, anchor[0], anchor[1]); }
    } else RMR.UI.tip(null);
  }

  /** The albums nearest the centre of the view, as a screen-reader list and as the keyboard's stepping order (comma, full stop, Enter). */
  let nearKey = '', near = [], nearAt = -1;
  function nearList() {
    const cam = RMR.cam, key = [cam.x.toFixed(4), cam.y.toFixed(4), cam.ppw.toFixed(0), S.stop, S.route.name].join(); if (key === nearKey) return; nearKey = key;
    const D = RMR.D, P = RMR.P, v = Cam.vis(), f = Cam.free, w = Cam.toWorld(v.cx, v.cy + (f ? (f.top - f.bottom) / 2 : 0)), best = [];
    for (let i = 0; i < D.n; i++) { const dx = P[2 * i] - w[0], dy = P[2 * i + 1] - w[1], d = dx * dx + dy * dy; if (best.length < 12 || d < best[best.length - 1][0]) { best.push([d, i]); best.sort((a, b) => a[0] - b[0]); if (best.length > 12) best.pop(); } }
    near = best.map((q) => q[1]); nearAt = -1;
    $('near-list').innerHTML = near.map((i) => { const a = D.album(i); return `<li><a tabindex="-1" href="${RMR.href({ name: 'album', slug: a.slug })}">${U.esc(COPY.albumLabel(a.t, a.a))}</a></li>`; }).join('');
  }

  /** Where the hover plate goes for a focus cover: the side away from the seed first, clear of every other cover and line. */
  function tipSpot(it, items, w, h) {
    const s = items[0], g = it.size / 2 + 12, dx = it.x >= s.x ? 1 : -1, dy = it.y >= s.y ? 1 : -1, view = RMR.view, L = RMR.cam.inset;
    const side = (sx) => [sx > 0 ? it.x + g : it.x - g - w, it.y - h / 2], vert = (sy) => [it.x - w / 2, sy > 0 ? it.y + g : it.y - g - h];
    const corner = (sx, sy) => [sx > 0 ? it.x - 12 : it.x - w + 12, sy > 0 ? it.y + g : it.y - g - h];
    const cands = (Math.abs(it.x - s.x) >= Math.abs(it.y - s.y) ? [side(dx), vert(dy), vert(-dy)] : [vert(dy), side(dx)]).concat([corner(dx, dy), corner(-dx, dy), corner(dx, -dy), side(-dx), vert(-dy), corner(-dx, -dy)]);
    const bad = (r) => {
      if (r[0] < L + 8 || r[1] < view.hdr + 8 || r[0] + w > view.W - 8 || r[1] + h > view.H - 8) return true;
      for (const o of items) { if (o === it) continue; const k = o.size / 2 + 6; if (r[0] < o.x + k && r[0] + w > o.x - k && r[1] < o.y + k && r[1] + h > o.y - k) return true; }
      for (const o of items.slice(1)) for (let k = 0.08; k < 1; k += 0.06) { const x = U.lerp(s.x, o.x, k), y = U.lerp(s.y, o.y, k); if (x > r[0] - 5 && x < r[0] + w + 5 && y > r[1] - 5 && y < r[1] + h + 5) return true; }
      return false;
    };
    return cands.find((r) => !bad(r)) || cands[0];
  }

  // ---------- input ----------
  function hit(x, y, touch) {
    const D = RMR.D, cam = RMR.cam, P = RMR.P;
    if (S.items) for (const it of [S.items[0]].concat(S.items.slice(1))) { const h = it.size / 2 + 4; if (Math.abs(x - it.x) <= h && Math.abs(y - it.y) <= h) return it.id; }
    const cp = Cam.coverPx(), drawn = Cam.coverFade() > 0.5 ? cp : 6, r = touch ? 24 : Math.max(14, drawn / 2);
    const w = Cam.toWorld(x, y), rw = r / cam.ppw; let best = null, bd = rw * rw;
    for (let i = 0; i < D.n; i++) { const dx = P[2 * i] - w[0], dy = P[2 * i + 1] - w[1], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function click(x, y, touch) {
    const i = hit(x, y, touch), D = RMR.D, cp = Cam.coverPx();
    if (touch) RMR.suppressGhostClick(x, y);
    if (S.narrow) {   // the phone: no hover, so a first tap names an album and a second opens it; dense stars zoom instead
      const onFocus = S.focus && i != null && S.focus.set.has(i);
      if (S.mapMode) {
        if (i != null && i !== S.focus.seed && (onFocus || cp >= 16)) { if (S.plate === i) RMR.go({ name: 'album', slug: D.album(i).slug, view: 'map' }); else RMR.setPlate(i); return; }
        if (S.plate != null || $('colours').hidden === false) { RMR.setPlate(null); RMR.UI.colours(false); return; }
        if (cp < 16 && i !== S.focus.seed) { S.framing = null; S.focusFramed = false; Cam.zoomAt(C.ZOOM_STEP, x, y); }
        return;
      }
      if (!$('colours').hidden) return RMR.UI.colours(false);
      if (cp < 16) { S.framing = null; Cam.zoomAt(C.ZOOM_STEP, x, y); return; }   // covers under 16 px: dozens of albums under a finger, so zoom toward the tap
    }
    if (i == null) { if (S.route.name === 'map' && (S.pick != null || S.route.region)) RMR.go({ name: 'map' }); return; }
    if (S.focus) { if (i !== S.focus.seed) RMR.go({ name: 'album', slug: D.album(i).slug }); }
    else RMR.go({ name: 'map', pick: D.album(i).slug });
  }
  function bindInput() {
    const ov = $('ov'), pane = $('map');
    let down = null, pinch = null; const touches = new Map();
    const pinchState = () => { const [a, b] = Array.from(touches.values()); return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    // A drag or pinch that starts on a name, a pointer or the chip moves the map too: those buttons have touch-action none and
    // hand their pointer events to the same handlers; past the tap threshold the button's own click is swallowed.
    let fromLabel = false, swallow = false;
    for (const host of [$('labels'), $('pointers')]) {
      host.addEventListener('pointerdown', (e) => { if (e.button !== 0 || !e.target.closest('.rl, .ptr, .here')) return; fromLabel = true; swallow = false; try { e.target.closest('button').setPointerCapture(e.pointerId); } catch (err) { /* already released */ } onDown(e); });
      host.addEventListener('pointermove', (e) => { if (fromLabel) onMove(e); });
      host.addEventListener('pointerup', (e) => { if (fromLabel) up(e); }); host.addEventListener('pointercancel', (e) => { if (fromLabel) up(e); });
      host.addEventListener('click', (e) => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
    }
    ov.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; fromLabel = false; ov.setPointerCapture(e.pointerId); onDown(e); });
    function onDown(e) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { Cam.dragCancel(); down = null; pinch = pinchState(); S.framing = null; S.focusFramed = false; return; }
      if (touches.size > 2) return;   // fingers beyond two are ignored
      down = { x: e.clientX, y: e.clientY, t: performance.now() }; Cam.dragStart(e.clientX, e.clientY); if (S.plate == null) setHover(null);
    }
    ov.addEventListener('pointermove', onMove);
    function onMove(e) {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) { const n = pinchState(); Cam.pinch(n.d / pinch.d, n.x, n.y, n.x - pinch.x, n.y - pinch.y); pinch = n; return; }
      if (down) { if (Cam.dragMove(e.clientX, e.clientY) > 8) { S.framing = null; S.focusFramed = false; } return; }
      if (e.pointerType !== 'touch' && !S.morph && !fromLabel && S.plate == null) setHover(hit(e.clientX, e.clientY, false));
    }
    const up = (e) => {
      touches.delete(e.pointerId);
      if (pinch) { if (fromLabel) swallow = true; if (touches.size < 2) { pinch = null; const r = Array.from(touches.values())[0]; if (r) { down = { x: r.x, y: r.y, t: 0 }; Cam.dragStart(r.x, r.y); } } return; }   // after a pinch the remaining finger pans
      if (!down) return; const d0 = down; down = null; Cam.dragEnd(); RMR.requestRender();
      // a tap: under 9 px in a straight line and under 500 ms
      const tap = e.type === 'pointerup' && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 9 && performance.now() - d0.t < 500;
      if (fromLabel) { if (touches.size === 0) fromLabel = false; swallow = !tap; if (swallow) setTimeout(() => (swallow = false), 400); return; }   // a tap on a name is the button's own click
      if (tap) click(e.clientX, e.clientY, e.pointerType === 'touch'); };
    ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
    ov.addEventListener('pointerleave', () => { if (!down) setHover(null); });
    // wheel anywhere on the map (labels included): zoom about the cursor, eased
    pane.addEventListener('wheel', (e) => { e.preventDefault(); S.framing = null; S.focusFramed = false; Cam.zoomBy(1 - e.deltaY * (e.ctrlKey ? 0.00075 : 0.0015), e.clientX, e.clientY); }, { passive: false });
    ov.addEventListener('keydown', (e) => {
      const step = 80, k = e.key;
      if (k === 'ArrowLeft') Cam.panBy(-step, 0); else if (k === 'ArrowRight') Cam.panBy(step, 0); else if (k === 'ArrowUp') Cam.panBy(0, -step); else if (k === 'ArrowDown') Cam.panBy(0, step);
      else if (k === '+' || k === '=') Cam.zoomBy(C.ZOOM_STEP, null, null, true); else if (k === '-' || k === '_') Cam.zoomBy(1 / C.ZOOM_STEP, null, null, true);
      // comma and full stop step through the albums nearest the centre; Enter selects the one that is ringed
      else if ((k === '.' || k === ',') && near.length) { nearAt = (nearAt + (k === '.' ? 1 : near.length - 1) + (nearAt < 0 && k === ',' ? 1 : 0)) % near.length; S.forced = false; setHover(near[nearAt]); e.preventDefault(); return; }
      else if (k === 'Enter' && S.hover != null) { const a = RMR.D.album(S.hover); e.preventDefault(); if (S.focus) { if (S.hover !== S.focus.seed) RMR.go({ name: 'album', slug: a.slug, view: S.mapMode ? 'map' : null }); } else RMR.go({ name: 'map', pick: a.slug }); return; }
      else return;
      S.framing = null; S.focusFramed = false; e.preventDefault();
    });
    document.addEventListener('keydown', (e) => {
      const typing = e.target.closest && e.target.closest('input:not([type=range]), textarea, [contenteditable]'), plain = !e.metaKey && !e.ctrlKey && !e.altKey;
      if (plain && !typing && S.route.name !== 'home' && S.route.name !== 'about' && S.route.name !== 'notfound') {
        if (e.key === 'l' || e.key === 'L') return RMR.toggleLabels();
        if (e.key === '1' || e.key === '2' || e.key === '3') return RMR.setStop(C.STOPS[Number(e.key) - 1]);   // the three stops
        if (e.key === '0') return RMR.fit();
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Escape closes the innermost open thing: the search list and the Regions and Colours menus handle their own first
      const t = e.target; if (t && t.closest && t.closest('.combo, .proto')) return;
      if (!$('sheet').hidden) return RMR.Pages.sheet(false);
      if (!$('colours').hidden) { RMR.UI.colours(false); return $('colours-btn').focus(); }
      if (S.plate != null) return RMR.setPlate(null);
      if (S.hoverRegion && !S.forced) { S.hoverRegion = null; highlight(); return RMR.requestRender(); }   // the evidence under a name can be dismissed
      if (S.route.region && S.route.name === 'album') RMR.go(Object.assign({}, S.route, { region: null })); else if (S.route.name === 'map' && (S.route.region || S.pick != null)) RMR.go({ name: 'map' });
      else if (S.mapMode) RMR.setMapMode(false); else if (S.route.name === 'album') RMR.closeAlbum(); else if (S.route.name === 'about') RMR.Pages.aboutClose();
    });
    // a resize (rotation, the browser bar) keeps the visitor's own pan and zoom; only a framed view is framed again
    window.addEventListener('resize', () => { resize(); S.narrow = RMR.view.W < 900; apply(); if (S.focus && S.focusFramed) Cam.set(focusCam()); else if (!S.focus && S.framing) Cam.set(framed(S.framing)); });
    window.addEventListener('hashchange', apply);
  }
  function resize() {
    const view = RMR.view, dpr = Math.min(window.devicePixelRatio || 1, C.DPR_MAX), gl = $('gl');
    view.W = window.innerWidth; view.H = window.innerHeight; view.hdr = view.W < 900 ? 60 : 64;
    gl.width = Math.round(view.W * dpr); gl.height = Math.round(view.H * dpr); RMR.Ov.resize(view.W, view.H, dpr);
    if (RMR.D) { Cam.setLimits(S.stop); ppwOverview = Cam.fitOverview(S.stop, 0).ppw; }
    RMR.requestRender();
  }

  // ---------- prototype drawer ----------
  function syncProto() {
    const p = S.proto;
    document.querySelectorAll('#proto input').forEach((i) => { if (i.type === 'radio') i.checked = (i.name === 'data' ? (p.data === '10k' ? '10k' : 'real') : p[i.name]) === i.value; else i.checked = i.name === 'labelsOff' ? !!S.labelsOff : !!p[i.name]; });
    $('hud').hidden = !p.hud; $('proto-note').textContent = S.synthMissing ? T.stressMissing : '';
  }
  function bindProto() {
    $('proto-tab').addEventListener('click', () => { const b = $('proto-body'); b.hidden = !b.hidden; $('proto-tab').setAttribute('aria-expanded', String(!b.hidden)); });
    $('proto').addEventListener('change', (e) => {
      const i = e.target; if (i.name === 'labelsOff') return RMR.toggleLabels(i.checked);
      S.proto = Object.assign({}, S.proto, { [i.name]: i.type === 'radio' ? i.value : i.checked });
      const h = RMR.href(S.route);
      if (i.name === 'data' || i.name === 'regions') { location.hash = h; location.reload(); return; }
      if (i.name === 'home') { history.replaceState(null, '', h); apply(); return; }
      history.replaceState(null, '', h); RMR.Gas.invalidate(); apply();
    });
  }

  // ---------- boot ----------
  function start(useSynth) {
    const D = RMR.initData(useSynth, parse(location.hash).proto.regions);
    D.pointOf = (real) => (real == null ? null : D.src ? Array.prototype.indexOf.call(D.src, real) : real);
    RMR.P = new Float32Array(2 * D.n);
    RMR.Ov.init($('ov')); resize();
    RMR.Labels.init($('labels'), $('pointers'), $('here'), $('region-list'));
    RMR.UI.init(); RMR.Search.init(); RMR.Pages.init(); bindInput(); bindProto();
    try { S.labelsOff = !!localStorage.getItem('rmr-labels-off'); } catch (e) { /* storage blocked */ }
    $('skip').addEventListener('click', (e) => { e.preventDefault(); const n = S.route.name, t = n === 'home' ? $('home-h') : n === 'about' ? $('about-h') : n === 'notfound' ? $('nf-h') : n === 'album' && !S.mapMode ? $('seed-title') : $('ov'); if (t) t.focus(); });
    apply(); S.started = true; RMR.requestRender();
    document.documentElement.dataset.gl = S.gl ? '1' : '0';   // for the lazy-start check: 0 on the phone's album list until the strip shows
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => RMR.relayout());   // the chrome is measured again once the real fonts are in
    const f = S.force;
    if (f.idle) { setTimeout(() => (document.documentElement.dataset.idle3 = stats.frames), 3000); setTimeout(() => (document.documentElement.dataset.idle8 = stats.frames), 8000); }
    if (f.idle) setTimeout(() => { const r = (id) => { const b = $(id).getBoundingClientRect(); return [id, Math.round(b.top), Math.round(b.bottom)].join(':'); }; document.documentElement.dataset.rects = [innerHeight, document.documentElement.clientHeight, r('main'), r('map'), r('gl'), r('ui'), $('gl').height, RMR.gl ? RMR.gl.drawingBufferHeight : 'no-gl'].join(' '); }, 2000);
    if (f.idle) setTimeout(() => (document.documentElement.dataset.gl3 = S.gl ? '1' : '0'), 3000);
    if (f.bench) bench();
    if (f.check) selfCheck();
    if (f.stats) stats10k();
    // then=<hash>: go there 1.2 s after load, so a screenshot can show where an in-app transition ends
    if (f.then) setTimeout(() => { location.hash = f.then; }, 1200);
  }
  /** bench=1: a programmatic pan, drawn synchronously and flushed with readPixels so software WebGL is timed honestly. */
  function bench() {
    const gl = RMR.gl, px = new Uint8Array(4), out = {}, cam = RMR.cam, x0 = cam.x;
    const run = (name, baked, slow) => {
      S.proto.gas = baked ? 'baked' : 'live'; RMR.Gas.slow = slow; cam.x = x0; draw(true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ts = [];
      for (let i = 0; i < 20; i++) { const t0 = performance.now(); cam.x += 8 / cam.ppw; draw(true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
      ts.sort((a, b) => a - b); out[name] = { median: Math.round(ts[10]), worst: Math.round(ts[19]) };
    };
    run('live', false, false); run('liveHalfResWhileMoving', false, true); run('baked', true, false);
    RMR.Gas.slow = false; cam.x = x0;
    document.documentElement.dataset.bench = JSON.stringify(out).replace(/"/g, '');
  }
  /** check=1: lay out 40 random albums at 5 and at 10 closest albums and report what Focus.check finds. */
  function selfCheck() {
    const D = RMR.D, out = { layouts: 0, bad: 0, findings: [] }; let a = 12345; const rnd = () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 40; n++) {
      const seed = Math.floor(rnd() * D.n);
      for (const more of [C.REC_DEFAULT, C.REC_MAX]) for (const stop of ['balanced']) {
        const ids = [seed].concat(D.recs(stop, seed).slice(0, more)), P = D.pos[stop], cam = RMR.Focus.camera(ids, P, panelW(), S.narrow ? phonePad() : null);
        const items = RMR.Focus.layout(ids.map((id) => { const p = Cam.toScreen(P[2 * id], P[2 * id + 1], [0, 0], cam); return { id, x: p[0], y: p[1] }; }));
        const f = RMR.Focus.check(items); out.layouts++; if (f.length) { out.bad++; if (out.findings.length < 6) out.findings.push({ seed, more, f: f.slice(0, 3) }); }
      }
    }
    document.documentElement.dataset.check = JSON.stringify(out).replace(/"/g, '');
  }
  /** stats=1: label counts per zoom band, cover spacing at band D and star crowding at Overview (for the 10k report). */
  function stats10k() {
    draw(false);
    const D = RMR.D, nn = Array.from(RMR.nnDist(D.pos.balanced, D.n)).sort((a, b) => a - b), ov = Cam.fitOverview('balanced', 0), ppwD = C.BAND_D / D.coverWorld, out = { n: D.n };
    out.coverWorld = +D.coverWorld.toFixed(5); out.overviewCoverPx = +(ov.ppw * D.coverWorld).toFixed(1);
    out.starHitOverlapShare = +(nn.filter((d) => d * ov.ppw < 28).length / D.n).toFixed(3);
    out.bandD = { coverPx: C.BAND_D, minCentrePx: +(nn[0] * ppwD).toFixed(1), p05: +(nn[Math.floor(D.n * 0.05)] * ppwD).toFixed(1), median: +(nn[D.n >> 1] * ppwD).toFixed(1), shareCloserThanCover: +(nn.filter((d) => d * ppwD < C.BAND_D).length / D.n).toFixed(3) };
    out.rho = +RMR.Gas.densityRho('balanced', ...Cam.toWorld(0, RMR.view.H, ov), ...Cam.toWorld(RMR.view.W, RMR.view.hdr, ov)).toFixed(3);
    // contrast, computed from the same luminances the page uses (not read back from pixels)
    const now = RMR.Labels.contrast.slice().sort((p, q) => p.ratio - q.ratio); out.labelsNow = { route: S.route.name, n: now.length, weakest: now[0] || null };
    const Ymax = RMR.Gas.lumMax('balanced'), rim = Ymax * Math.pow(0.55, 2.2), core = Math.pow(Math.min(1, Math.pow(Ymax, 1 / 2.2) * 0.55 + 0.72), 2.2);
    out.star = { gasMax: +Ymax.toFixed(3), rim: +rim.toFixed(3), ratioVsRim: +((core + 0.05) / (rim + 0.05)).toFixed(2), ratioVsOpenGas: +((core + 0.05) / (Ymax + 0.05)).toFixed(2) };
    const under = (alpha) => Ymax * Math.pow(1 - alpha, 2.2), ratio = (ink, bg) => +((ink + 0.05) / (bg + 0.05)).toFixed(2);
    out.pointer = ratio(U.luminance([241, 237, 230]), under(0.95));
    out.legendWorst = Math.min(...C.FAM.map((c) => ratio(U.luminance(U.lighten(c, 0.38)), under(0.9) * 0.4)));
    if (S.route.name === 'map') out.regions = RMR.Regions.named('balanced').map((r) => { const c = RMR.Gas.rgbAt('balanced', r.wx, r.wy), mx = Math.max(...c), mn = Math.min(...c), d = mx - mn || 1; let h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; h = Math.round(((h * 60) + 360) % 360); return [r.id, r.lead >= 0 ? C.FAM_IDS[r.lead] : 'mixed', c.join(' '), 'h' + h, 's' + Math.round(100 * d / (mx || 1))].join('/'); });
    if (S.route.name !== 'map') { document.documentElement.dataset.stats = JSON.stringify(out).replace(/"/g, ''); return; }
    out.labels = {};
    for (const [band, ppw] of [['A', Cam.fitWhole('balanced', 0).ppw], ['B', ov.ppw], ['C', 17 / D.coverWorld], ['D', 28 / D.coverWorld]]) {
      Cam.set({ x: ov.x, y: ov.y, ppw, inset: 0 }); draw(false);
      const shown = Array.from(document.querySelectorAll('.rl:not(.off)'));
      out.labels[band] = { labels: shown.length, areas: shown.filter((e) => e.classList.contains('area')).length, pointers: document.querySelectorAll('.ptr:not(.off)').length };
    }
    Cam.set(ov); document.documentElement.dataset.stats = JSON.stringify(out).replace(/"/g, '');
  }
  function boot() {
    window.addEventListener('error', (e) => { $('proto-errors').textContent += (e.message || e) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno + '\n'; });
    if (parse(location.hash).proto.data === '10k') {
      const s = document.createElement('script'); s.src = 'data/synth10k.js';
      s.onload = () => { S.proto.data = '10k'; start(!!window.RMR_SYNTH); };
      s.onerror = () => { S.synthMissing = true; S.proto.data = '10k'; start(false); };
      document.head.appendChild(s);
    } else start(false);
  }
  boot();
})();
