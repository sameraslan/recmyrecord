/* Twinkle: every so often one star on screen catches the light. A DOM layer over the star canvas and under the names;
 * the WebGL canvas is never redrawn for it. One timer (setTimeout), no frame loop. A glint is one positioned element
 * with one animated child: a soft near-white bloom about four times the star's radius and, on the two brightest
 * classes only, a thin four-point flare. Its keyframe animates only opacity and transform, and the element is removed
 * when the animation ends. Brighter stars glint more often (cfg.TWINKLE_WEIGHT).
 * Cost: at most cfg.TWINKLE[level].max glints alive (two DOM nodes each), one timer, no layout or style reads (the
 * position comes from the star positions the map already holds), one pass over the star positions per glint.
 * Only at rest and while stars are dots: any camera or slider change clears the glints, and none is made while the
 * view moves. Off under reduced motion and in a hidden tab. twinkle=0|1|2 in the hash (cfg.TWINKLE).
 * Debug: glints=<n> freezes n glints at their peak for a screenshot (odd ones as magenta rings, to check that a glint
 * sits exactly on its star; rings=0 makes them all glints); twlog=1 writes the timer's counters to <html data-twlog>. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util;
  const Tw = (RMR.Twinkle = {});
  let host = null, timer = 0, lastKey = '', lastMove = 0, alive = 0;
  const pt = [0, 0], rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const st = (Tw.stats = { ticks: 0, notResting: 0, capped: 0, spawned: 0, ended: 0, cleared: 0, worstSpawnMs: 0 });
  const log = () => { if (RMR.S.force.twlog) document.documentElement.dataset.twlog = JSON.stringify(st).replace(/"/g, ''); };

  const level = () => RMR.S.proto.twinkle || 0;
  const forced = () => { const n = Number(RMR.S.force.glints); return n > 0 ? Math.min(n, 200) : 0; };
  const running = () => !!host && level() > 0 && !forced() && !document.hidden && !(rm && rm.matches);

  Tw.init = function (el) {
    host = el; if (!host) return;
    document.addEventListener('visibilitychange', Tw.sync);
    if (rm) { if (rm.addEventListener) rm.addEventListener('change', Tw.sync); else if (rm.addListener) rm.addListener(Tw.sync); }
    Tw.sync();
  };
  /** Start or stop the timer to match the switch, the tab and the motion setting. */
  Tw.sync = function () {
    if (!host) return;
    if (!running()) { clearTimeout(timer); timer = 0; if (!forced()) clear(); return; }
    if (!timer) schedule();
  };
  function schedule() {
    const w = C.TWINKLE[level()].wait;
    timer = setTimeout(tick, w[0] + Math.random() * (w[1] - w[0]));
  }
  function tick() {
    timer = 0; if (!running()) return;
    st.ticks++;
    if (!resting()) st.notResting++; else if (alive >= C.TWINKLE[level()].max) st.capped++; else { const t0 = performance.now(); spawn(Math.random, false); st.worstSpawnMs = Math.max(st.worstSpawnMs, Math.round((performance.now() - t0) * 100) / 100); }
    log(); schedule();
  }
  function clear() { if (host && host.firstChild) { host.textContent = ''; st.cleared++; } alive = 0; }

  /** Stars are dots, nothing is moving, and the map is what the visitor is looking at. */
  function resting() {
    const S = RMR.S, Cam = RMR.Cam, n = S.route.name;
    if (!S.gl || !RMR.Stars.ok || n === 'about' || n === 'notfound') return false;
    if (S.narrow && n === 'album' && !S.mapMode) return false;   // the phone's album list covers the map
    if (Cam.coverFade() > 0 || Cam.moving() || S.morph) return false;
    return performance.now() - lastMove > 500;
  }

  /** Called at the end of every draw: any change of view clears the glints (a hover redraw changes nothing here). */
  Tw.camera = function () {
    if (!host) return;
    const S = RMR.S, cam = RMR.cam, v = RMR.view;
    const key = [cam.x.toFixed(5), cam.y.toFixed(5), cam.ppw.toFixed(1), cam.inset.toFixed(1), S.t.toFixed(4), v.W, v.H, S.route.name, S.focus ? S.focus.key : '', S.mapMode ? 1 : 0].join();
    if (key === lastKey) return;
    lastKey = key; lastMove = performance.now(); clear();
    const n = forced(); if (n && RMR.Stars.ok) { const rnd = RMR.rng(7), rings = S.force.rings !== '0'; for (let k = 0; k < n; k++) spawn(rnd, k % 2 && rings ? 'ring' : 'hold'); }
  };

  /** One glint on a star that is on screen and not under a focus cover; brighter classes are likelier. */
  function spawn(rnd, mode) {
    const S = RMR.S, D = RMR.D, P = RMR.P, Cam = RMR.Cam, cam = RMR.cam, v = RMR.view, items = S.items || [], W = C.TWINKLE_WEIGHT;
    const l = cam.inset + 6, t = v.hdr + 6, r = v.W - 6, b = v.H - 6;
    let pick = -1, total = 0, px = 0, py = 0;
    for (let i = 0; i < D.n; i++) {
      Cam.toScreen(P[2 * i], P[2 * i + 1], pt);
      if (pt[0] < l || pt[0] > r || pt[1] < t || pt[1] > b) continue;
      let under = false; for (const it of items) { const h = it.size / 2 + 6; if (Math.abs(pt[0] - it.x) < h && Math.abs(pt[1] - it.y) < h) { under = true; break; } }
      if (under) continue;
      const w = W[D.cls[i]]; total += w;
      if (rnd() * total < w) { pick = i; px = pt[0]; py = pt[1]; }   // weighted reservoir: one pass, no list
    }
    if (pick < 0) return;
    const L = C.TWINKLE[level()] || C.TWINKLE[1], col = RMR.Stars.col, cls = D.cls[pick];
    const sr = Math.max(0.8, C.STAR_RADIUS[cls] * RMR.Stars.sizeK(Cam.coverPx()));   // the star's own radius, as the shader draws it
    const R = mode === 'ring' ? 7 : (C.TWINKLE_BLOOM[0] * sr + C.TWINKLE_BLOOM[1]) * L.size;
    const c = [0, 1, 2].map((k) => Math.round((col[4 * pick + k] + 255) / 2)).join();   // the star's tint, half way to white
    const g = document.createElement('i'), dot = document.createElement('b');
    g.className = 'tw'; g.style.transform = `translate(${(px - R).toFixed(2)}px,${(py - R).toFixed(2)}px)`; g.style.width = g.style.height = (2 * R).toFixed(2) + 'px';
    const dur = Math.round(C.TWINKLE_DUR[0] + (mode ? 0 : rnd()) * (C.TWINKLE_DUR[1] - C.TWINKLE_DUR[0]));
    if (mode === 'ring') dot.className = 'tw-ring';
    else {
      dot.style.background = `radial-gradient(circle closest-side, rgba(${c},1) 0, rgba(${c},.95) 14%, rgba(${c},.5) 30%, rgba(${c},.18) 55%, rgba(${c},.05) 80%, rgba(${c},0) 100%)`;
      dot.style.setProperty('--peak', (L.peak * U.lerp(1, 0.6, S.amt.pool)).toFixed(2));   // quieter beside an open album, where the stars are dimmed
      if (cls < 2) { dot.className = 'tw-flare'; dot.style.setProperty('--fl', (2 * C.TWINKLE_FLARE * sr * L.size).toFixed(1) + 'px'); }
      if (mode === 'hold') dot.className += ' tw-hold'; else dot.style.animationDuration = dur + 'ms';
    }
    g.appendChild(dot); host.appendChild(g);
    if (mode) return;
    alive++; st.spawned++;
    const done = () => { if (g.parentNode) { g.remove(); alive = Math.max(0, alive - 1); st.ended++; } };
    dot.addEventListener('animationend', done); setTimeout(done, dur + 300);
  }
})();
