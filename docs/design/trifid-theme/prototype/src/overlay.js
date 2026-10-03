/* 2D overlay canvas: map covers (file:// images would taint WebGL, so covers are Canvas 2D drawImage),
 * focus lines, anchor dots, focus covers and badges, the hover and selection rings, debug hulls.
 * On the map the only accent is starlight white: every hue belongs to a family. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util;
  const Ov = (RMR.Ov = {});
  let cv, ctx, dpr = 1;
  const sheets = [];
  const DARK = 'rgba(6,6,10,.8)';

  Ov.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); };
  Ov.resize = function (w, h, ratio) { dpr = ratio; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); };

  /** Atlas sheet, loaded on first need; null until it has decoded. */
  function sheet(k) {
    let s = sheets[k];
    if (!s) { s = sheets[k] = { img: new Image(), ok: false }; s.img.onload = () => { s.ok = true; RMR.requestRender(); }; s.img.src = `${window.RMR_ASSETS}atlas-${k}.webp`; }
    return s.ok ? s.img : null;
  }
  Ov.preload = function (ids) { for (const i of ids) sheet(Math.floor(RMR.D.cover(i) / 1024)); };
  Ov.loaded = () => sheets.filter((q) => q && q.ok).length;
  function drawCover(i, x, y, size, g) {
    const c = RMR.D.cover(i), img = sheet(Math.floor(c / 1024)), cell = c % 1024; g = g || ctx;
    if (!img) { g.fillStyle = '#262019'; g.fillRect(x - size / 2, y - size / 2, size, size); return; }
    const k = img.width / 32;
    g.drawImage(img, (cell % 32) * k, Math.floor(cell / 32) * k, k, k, x - size / 2, y - size / 2, size, size);
  }
  function frame(x, y, half, w, style, g) { g = g || ctx; g.lineWidth = w; g.strokeStyle = style; g.strokeRect(x - half - w / 2, y - half - w / 2, 2 * half + w, 2 * half + w); }

  /** Focus lines, covers, frames and badges into any 2D context (the map overlay, or the phone strip). */
  Ov.focusInto = function (g, items, hot, o) {
    {
      const seed = items[0], F = RMR.Focus, hot0 = hot;
      g.lineCap = 'round';
      const sh = seed.size / 2 + F.SEED_FRAME;
      const seg = (it) => {
        const isHot = it.id === hot, hh = (it.size * (isHot ? C.MARKER.hot : 1)) / 2 + (isHot ? 3 : F.REC_FRAME);
        return [F.edge(seed.x, seed.y, it.x, it.y, sh), F.edge(it.x, it.y, seed.x, seed.y, hh)];
      };
      const stroke = (a, b, w, style) => { g.lineWidth = w; g.strokeStyle = style; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
      for (let pass = 0; pass < 2; pass++) for (const it of items.slice(1)) {
        const isHot = it.id === hot, [a, b] = seg(it), moved = Math.hypot(it.x - it.ax, it.y - it.ay) > 6;
        if (pass === 0) {   // dark casing under every line, so white holds on any gas
          stroke(a, b, isHot ? 5.25 : 4.5, DARK);
          if (moved) { const e = F.edge(it.x, it.y, it.ax, it.ay, it.size / 2 + F.REC_FRAME); stroke(e, [it.ax, it.ay], 3, DARK); }
        } else {
          stroke(a, b, isHot ? 2.25 : 1.5, isHot ? '#fff' : 'rgba(255,255,255,.92)');
          if (moved) {      // a thin leader back to the album's true position
            const e = F.edge(it.x, it.y, it.ax, it.ay, it.size / 2 + F.REC_FRAME); stroke(e, [it.ax, it.ay], 1, 'rgba(255,255,255,.7)');
            // a hollow ring marks the album's true position: a filled dot read as a bright (famous) star
            g.lineWidth = 3.5; g.strokeStyle = DARK; g.beginPath(); g.arc(it.ax, it.ay, 3.4, 0, 7); g.stroke();
            g.lineWidth = 1.3; g.strokeStyle = '#fff'; g.beginPath(); g.arc(it.ax, it.ay, 3.4, 0, 7); g.stroke();
          }
        }
      }
      for (const it of items.slice(1).concat([seed])) {
        const isHot = it.id === hot, size = it.size * (isHot ? C.MARKER.hot : 1), h = size / 2;
        g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 14; g.shadowOffsetY = 4;
        g.fillStyle = '#07060a'; g.fillRect(it.x - h, it.y - h, size, size);
        g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
        drawCover(it.id, it.x, it.y, size, g);
        if (it.seed) { frame(it.x, it.y, h, 2, '#07060a', g); frame(it.x, it.y, h + 2, 2, '#fff', g); }
        else if (isHot) { frame(it.x, it.y, h, 2, '#fff', g); frame(it.x, it.y, h + 2, 1, DARK, g); }
        else { frame(it.x, it.y, h, 1, 'rgba(255,255,255,.6)', g); frame(it.x, it.y, h + 1, 1, 'rgba(6,6,10,.7)', g); }
      }
      g.font = `600 ${o.font || 11}px "Schibsted Grotesk", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const it of items.slice(1)) {   // numbered badges, drawn last; the hot one inverted
        const isHot = it.id === hot, h = (it.size * (isHot ? C.MARKER.hot : 1)) / 2, label = String(it.rank), B = o.badge || 18, w = Math.max(B, g.measureText(label).width + B / 2);
        const bx = it.x - h - B * 0.4, by = it.y - h - B * 0.4;
        g.fillStyle = isHot ? '#fff' : '#0b0a0f'; g.fillRect(bx, by, w, B);
        g.lineWidth = 1; g.strokeStyle = isHot ? '#07060a' : 'rgba(255,255,255,.55)'; g.strokeRect(bx + 0.5, by + 0.5, w - 1, B - 1);
        g.fillStyle = isHot ? '#07060a' : '#fff'; g.fillText(label, bx + w / 2, by + B / 2 + 0.5);
      }
    }

  };

  Ov.draw = function (st) {
    const view = RMR.view, cam = RMR.cam, P = RMR.P, D = RMR.D, S = RMR.S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, view.W, view.H);
    // nothing is drawn under the header or the album panel
    ctx.save(); ctx.beginPath(); ctx.rect(RMR.cam.inset, view.hdr, view.W - RMR.cam.inset, view.H - view.hdr); ctx.clip();
    const v = RMR.Cam.vis(), cxs = v.cx, cys = v.cy, ppw = cam.ppw;
    const sx = (i) => cxs + (P[2 * i] - cam.x) * ppw, sy = (i) => cys - (P[2 * i + 1] - cam.y) * ppw;

    if (S.proto.hulls) {
      ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      for (const r of RMR.Regions.current()) {
        if (!r.hullW.length) continue; ctx.strokeStyle = U.rgb(U.lighten(r.col, 0.3), r.level === 0 ? 0.5 : 0.9); ctx.beginPath();
        r.hullW.forEach((p, k) => { const q = RMR.Cam.toScreen(p[0], p[1]); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // map covers: cross-fade in from 16 to 32 px, each with a 1 px dark keyline so it holds on bright gas
    const cpx = RMR.Cam.coverPx(), fade = RMR.Cam.coverFade();
    if (cpx >= C.ATLAS_LOAD_PX) for (let k = 0; k < Math.ceil(D.bySlug.size / 1024); k++) sheet(k);
    const focusSet = st.focusSet;
    if (fade > 0) {
      const h = cpx / 2 + 2;
      ctx.globalAlpha = fade * fade;   // squared: half-faded covers read as dark boxes on the gas
      for (let i = D.n - 1; i >= 0; i--) {
        const x = sx(i), y = sy(i);
        if (x < -h || y < view.hdr - h || x > view.W + h || y > view.H + h || (focusSet && focusSet.has(i))) continue;
        drawCover(i, x, y, cpx);
        // beside an album the other covers step back by darkening toward the ground, so they stay crisp
        if (st.focus) { ctx.fillStyle = 'rgba(7,6,10,.6)'; ctx.fillRect(x - cpx / 2, y - cpx / 2, cpx, cpx); }
        frame(x, y, cpx / 2, 1, 'rgba(6,6,10,.9)');
      }
      ctx.globalAlpha = 1;
    }

    if (st.items && st.items.length) Ov.focusInto(ctx, st.items, st.hot, {});

    // hover ring and the Explore selection, in white with a dark casing
    const ring = (i, r, w, dot) => {
      const x = sx(i), y = sy(i);
      if (fade > 0.5) { frame(x, y, cpx / 2, 2, '#fff'); frame(x, y, cpx / 2 + 2, 1.5, DARK); return; }
      ctx.lineWidth = w + 2.5; ctx.strokeStyle = DARK; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      if (dot) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); }
    };
    if (st.pick != null) ring(st.pick, 11, 2, true);
    if (st.hover != null && !(focusSet && focusSet.has(st.hover)) && st.hover !== st.pick) ring(st.hover, 9, 1.4, false);
    ctx.restore();
  };
})();
