/* Camera: a world point at the centre of the visible map (right of the album panel, under the header),
 * and ppw, CSS px per world unit. Tweens, wheel easing and drag fling all step from the one frame loop. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util;
  const cam = (RMR.cam = { x: 0, y: 0, ppw: 800, inset: 0 });
  const view = (RMR.view = { W: 1, H: 1, hdr: 64 });
  const Cam = (RMR.Cam = {});
  let tween = null, zoomTarget = null, zoomAnchor = null, fling = null, lastT = 0;

  Cam.stageH = () => view.H - view.hdr;
  Cam.vis = function (c) { c = c || cam; return { l: c.inset, t: view.hdr, r: view.W, b: view.H, w: view.W - c.inset, h: view.H - view.hdr, cx: c.inset + (view.W - c.inset) / 2, cy: view.hdr + (view.H - view.hdr) / 2 }; };
  Cam.toScreen = function (wx, wy, out, c) { c = c || cam; out = out || [0, 0]; out[0] = c.inset + (view.W - c.inset) / 2 + (wx - c.x) * c.ppw; out[1] = view.hdr + (view.H - view.hdr) / 2 - (wy - c.y) * c.ppw; return out; };
  Cam.toWorld = function (sx, sy, c) { c = c || cam; return [c.x + (sx - (c.inset + (view.W - c.inset) / 2)) / c.ppw, c.y - (sy - (view.hdr + (view.H - view.hdr) / 2)) / c.ppw]; };
  Cam.coverPx = (ppw) => Math.min(C.COVER_MAX, RMR.D.coverWorld * (ppw == null ? cam.ppw : ppw));
  Cam.coverFade = (ppw) => U.smooth(C.COVER_FADE[0], C.COVER_FADE[1], Cam.coverPx(ppw));
  Cam.maxPpw = () => (Cam.stageH() * C.MAX_ZOOM) / C.FRUSTUM * (C.COVER_WORLD / RMR.D.coverWorld);
  Cam.minPpw = (stop, inset) => Cam.fitWhole(stop, inset).ppw * C.MIN_ZOOM_FIT;

  /** Whole map: every album of the stop inside the visible area less the app's fit padding. */
  Cam.fitWhole = function (stop, inset) {
    const e = RMR.D.ext[stop], f = Cam.free, p = f ? { top: f.top + 8, right: 16, bottom: f.bottom + 8, left: 16 } : C.FIT_PAD;   // on a phone: the free rectangle between the top row and the slider or sheet
    const aw = Math.max(view.W - inset - p.left - p.right, 40), ah = Math.max(Cam.stageH() - p.top - p.bottom, 40);
    const ppw = Math.min(aw / (e.maxX - e.minX), ah / (e.maxY - e.minY));
    return { x: (e.minX + e.maxX) / 2 - (p.left - p.right) / 2 / ppw, y: (e.minY + e.maxY) / 2 + (p.top - p.bottom) / 2 / ppw, ppw, inset };
  };
  /** Overview: the 1st..99th percentile x-extent fills the width (24 px side padding), centred on the median y. */
  Cam.fitOverview = function (stop, inset) {
    const e = RMR.D.ext[stop], whole = Cam.fitWhole(stop, inset);
    // capped just under the zoom where names start to fade, so Overview is always in band B (a narrow layout leaves sky at the sides)
    const ppw = Math.max(whole.ppw, Math.min((view.W - inset - 48) / (e.x99 - e.x1), (C.BAND_B - 0.5) / RMR.D.coverWorld));
    const f = Cam.free;   // on a phone the median row sits in the middle of the free rectangle, not under the slider
    return { x: (e.x1 + e.x99) / 2, y: e.medY + (f ? (f.top - f.bottom) / 2 / ppw : 0), ppw, inset };
  };
  /** Fit a world box (x0,y0,x1,y1) with padding. */
  Cam.fitBox = function (box, inset, pad, maxPpw) {
    const aw = Math.max(view.W - inset - pad.left - pad.right, 80), ah = Math.max(Cam.stageH() - pad.top - pad.bottom, 80);
    const ppw = Math.min(maxPpw || Infinity, aw / Math.max(box[2] - box[0], 1e-4), ah / Math.max(box[3] - box[1], 1e-4));
    return { x: (box[0] + box[2]) / 2 - (pad.left - pad.right) / 2 / ppw, y: (box[1] + box[3]) / 2 + (pad.top - pad.bottom) / 2 / ppw, ppw, inset };
  };

  function clampCam(c, stop) {
    const lim = Cam.limits; c.ppw = U.clamp(c.ppw, lim.min, lim.max);
    const e = lim.box; c.x = U.clamp(c.x, e[0], e[2]); c.y = U.clamp(c.y, e[1], e[3]); return c;
  }
  Cam.limits = { min: 100, max: 30000, box: [-2, -2, 2, 2] };
  /** Phone only: px taken at the top and bottom of the stage by chrome ({top, bottom}), measured by the app; null on desktop. */
  Cam.free = null;
  Cam.setLimits = function (stop) {
    const D = RMR.D; let b = [1e9, 1e9, -1e9, -1e9];
    for (const s of D.stops) { const e = D.ext[s]; b = [Math.min(b[0], e.minX), Math.min(b[1], e.minY), Math.max(b[2], e.maxX), Math.max(b[3], e.maxY)]; }
    Cam.limits = { min: Cam.minPpw(stop, 0), max: Cam.maxPpw(), box: b };
  };

  Cam.set = function (t) { tween = null; zoomTarget = null; fling = null; Object.assign(cam, t); clampCam(cam); RMR.requestRender(); };
  Cam.target = () => (tween ? tween.to : cam);
  /** Animate to `to` ({x,y,ppw,inset}, any subset) over `dur` ms; instant under reduced motion. */
  Cam.tween = function (to, dur, ease, done) {
    const full = clampCam(Object.assign({}, Cam.target(), to));
    zoomTarget = null; fling = null;
    if (U.reducedMotion() || !dur || RMR.S.instant) { tween = null; Object.assign(cam, full); if (done) done(); RMR.requestRender(); return; }
    tween = { from: Object.assign({}, cam), to: full, t0: performance.now(), dur, ease: ease || U.easeOut, done };
    RMR.requestRender();
  };
  Cam.busy = () => !!tween;
  Cam.moving = () => !!(tween || zoomTarget || fling || drag);

  /** Wheel / pinch: multiply the zoom target, keep the world point under (sx, sy) fixed while easing. */
  Cam.zoomBy = function (factor, sx, sy, animate) {
    const v = Cam.vis();
    if (sx == null) { sx = v.cx; sy = v.cy; }
    if (animate) {   // the zoom buttons: 240 ms tween about the centre of the visible map
      const t = Cam.target(), ppw = U.clamp(t.ppw * factor, Cam.limits.min, Cam.limits.max);
      Cam.tween({ ppw }, C.DUR.zoom); return;
    }
    tween = null; fling = null;
    zoomTarget = U.clamp((zoomTarget || cam.ppw) * factor, Cam.limits.min, Cam.limits.max);
    zoomAnchor = { sx, sy, w: Cam.toWorld(sx, sy) };
    if (U.reducedMotion()) applyZoom(zoomTarget), (zoomTarget = null);
    RMR.requestRender();
  };
  /** One animated zoom step toward a screen point (a tap on dense stars): the tapped spot stays under the finger. */
  Cam.zoomAt = function (factor, sx, sy) {
    const v = Cam.vis(), t = Cam.target(), w = Cam.toWorld(sx, sy, t), ppw = U.clamp(t.ppw * factor, Cam.limits.min, Cam.limits.max);
    Cam.tween({ x: w[0] - (sx - v.cx) / ppw, y: w[1] + (sy - v.cy) / ppw, ppw }, C.DUR.zoom);
  };
  function applyZoom(ppw) {
    cam.ppw = ppw; const now = Cam.toWorld(zoomAnchor.sx, zoomAnchor.sy);
    cam.x += zoomAnchor.w[0] - now[0]; cam.y += zoomAnchor.w[1] - now[1]; clampCam(cam);
  }

  // drag pan 1:1 with fling
  let drag = null;
  Cam.dragStart = function (sx, sy) { tween = null; zoomTarget = null; fling = null; drag = { sx, sy, vx: 0, vy: 0, t: performance.now(), moved: 0 }; };
  Cam.dragMove = function (sx, sy) {
    if (!drag) return 0;
    const dx = sx - drag.sx, dy = sy - drag.sy, now = performance.now(), dt = Math.max(1, now - drag.t);
    cam.x -= dx / cam.ppw; cam.y += dy / cam.ppw; clampCam(cam);
    drag.vx = U.lerp(drag.vx, dx / dt, 0.5); drag.vy = U.lerp(drag.vy, dy / dt, 0.5);
    drag.sx = sx; drag.sy = sy; drag.t = now; drag.moved += Math.abs(dx) + Math.abs(dy);
    RMR.requestRender(); return drag.moved;
  };
  Cam.dragEnd = function () {
    if (!drag) return 0; const d = drag; drag = null;
    if (performance.now() - d.t < 60 && Math.hypot(d.vx, d.vy) > 0.15 && !U.reducedMotion()) { fling = { vx: d.vx, vy: d.vy }; RMR.requestRender(); }
    return d.moved;
  };
  Cam.dragging = () => !!drag;
  Cam.dragCancel = function () { drag = null; };
  /** Two-finger pinch: scale by f about the midpoint (sx, sy), which itself moved by (dx, dy). */
  Cam.pinch = function (f, sx, sy, dx, dy) {
    tween = null; zoomTarget = null; fling = null;
    const w = Cam.toWorld(sx - dx, sy - dy); cam.ppw = U.clamp(cam.ppw * f, Cam.limits.min, Cam.limits.max);
    const now = Cam.toWorld(sx, sy); cam.x += w[0] - now[0]; cam.y += w[1] - now[1]; clampCam(cam); RMR.requestRender();
  };
  Cam.panBy = function (dx, dy) { Cam.tween({ x: Cam.target().x + dx / cam.ppw, y: Cam.target().y - dy / cam.ppw }, 160); };

  /** Advance animations to `now`; returns true while anything is still moving. */
  Cam.step = function (now) {
    const dt = Math.min(64, lastT ? now - lastT : 16); lastT = now; let active = false;
    if (tween) {
      const k = U.clamp((now - tween.t0) / tween.dur, 0, 1), e = tween.ease(k), a = tween.from, b = tween.to;
      cam.x = U.lerp(a.x, b.x, e); cam.y = U.lerp(a.y, b.y, e); cam.inset = U.lerp(a.inset, b.inset, e);
      cam.ppw = Math.exp(U.lerp(Math.log(a.ppw), Math.log(b.ppw), e));
      if (k >= 1) { const d = tween.done; tween = null; if (d) d(); } else active = true;
    }
    if (zoomTarget) {
      const k = 1 - Math.exp(-dt / 90); let ppw = cam.ppw + (zoomTarget - cam.ppw) * k;
      if (Math.abs(zoomTarget - ppw) / zoomTarget < 0.002) { ppw = zoomTarget; applyZoom(ppw); zoomTarget = null; } else { applyZoom(ppw); active = true; }
    }
    if (fling) {
      const f = Math.pow(0.92, dt * 0.06); fling.vx *= f; fling.vy *= f;
      cam.x -= (fling.vx * dt) / cam.ppw; cam.y += (fling.vy * dt) / cam.ppw; clampCam(cam);
      if (Math.hypot(fling.vx, fling.vy) < 0.02) fling = null; else active = true;
    }
    if (!active) lastT = 0;
    return active;
  };
})();
