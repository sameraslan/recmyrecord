/* Album view on the map: where the seed and its closest albums' covers go, and the camera that frames them.
 * The ring and box separation are the app's (focusLayout.ts). On top of them, UX.md section 7:
 * a cover never hides its own line (at least 24 px of line shows) and stays 6 px clear of every other line. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg;
  const Focus = (RMR.Focus = {});
  const M = C.MARKER, MIN_LINE = 24, LINE_CLEAR = 6, MIN_ANGLE = 0.2;   // radians between two lines leaving the seed
  // drawn frames reach past the cover: the seed's dark gap and white frame, a hairline on the others
  Focus.SEED_FRAME = 4; Focus.REC_FRAME = 1;

  const ringRadius = (recs, seed, rec) => Math.max(seed / 2 + rec / 2 + 22, (recs * (rec + 16)) / (2 * Math.PI));

  /** anchors[0] is the seed; each {id, x, y} in CSS px. Returns items {id, rank, ax, ay, x, y, size, seed}. */
  Focus.layout = function (anchors, gap, o) {
    gap = gap == null ? M.gap : gap; o = o || {};
    const SEED = o.seed || M.seed, REC = o.rec || M.rec, LINE = o.minLine == null ? MIN_LINE : o.minLine, bounds = o.bounds || null;
    const items = anchors.map((a, n) => ({ id: a.id, rank: n, ax: a.x, ay: a.y, x: a.x, y: a.y, size: n === 0 ? SEED : REC, seed: n === 0 }));
    if (items.length < 2) return items;
    const s0 = items[0], recs = items.length - 1, ring = ringRadius(recs, SEED, REC);
    items.slice(1).forEach((it, n) => {   // too close to the seed: out to the ring, keeping the direction
      let dx = it.ax - s0.ax, dy = it.ay - s0.ay, d = Math.hypot(dx, dy);
      if (d >= ring) return;
      if (d < 3) { const a = -Math.PI / 2 + (n * Math.PI * 2) / recs; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
      it.x = s0.ax + (dx / d) * ring; it.y = s0.ay + (dy / d) * ring;
    });
    for (let iter = 0; iter < 600; iter++) {
      let moved = false;
      // boxes apart along the axis of least overlap; the seed stays put
      for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
        const p = items[a], q = items[b], need = (p.size + q.size) / 2 + gap;
        const ox = need - Math.abs(q.x - p.x), oy = need - Math.abs(q.y - p.y);
        if (ox <= 0 || oy <= 0) continue;
        const ax = ox < oy ? 'x' : 'y', d = q[ax] - p[ax], sign = d === 0 ? (b % 2 ? 1 : -1) : Math.sign(d), total = (ax === 'x' ? ox : oy) + 0.5;
        if (p.seed) q[ax] += sign * total; else { p[ax] -= sign * total / 2; q[ax] += sign * total / 2; }
        moved = true;
      }
      for (let a = 1; a < items.length; a++) {
        const it = items[a];
        // enough line between the two frames
        let dx = it.x - s0.x, dy = it.y - s0.y, d = Math.hypot(dx, dy) || 1;
        const need = (SEED / 2 + Focus.SEED_FRAME + REC / 2 + Focus.REC_FRAME) / (Math.max(Math.abs(dx), Math.abs(dy)) / d) + LINE;
        if (d < need - 0.5) { it.x = s0.x + (dx / d) * need; it.y = s0.y + (dy / d) * need; moved = true; }
        // sideways off every other closest album's line
        for (let b = 1; b < items.length; b++) {
          if (b === a) continue;
          const o = items[b], lx = o.x - s0.x, ly = o.y - s0.y, len = Math.hypot(lx, ly) || 1, ux = lx / len, uy = ly / len;
          const t = (it.x - s0.x) * ux + (it.y - s0.y) * uy; if (t <= 0 || t >= len) continue;
          const perp = (it.x - s0.x) * -uy + (it.y - s0.y) * ux, reach = (it.size / 2 + Focus.REC_FRAME) * (Math.abs(ux) + Math.abs(uy)) + LINE_CLEAR;
          if (Math.abs(perp) >= reach) continue;
          const push = (reach - Math.abs(perp) + 0.5) * (perp === 0 ? (a % 2 ? 1 : -1) : Math.sign(perp));
          it.x += -uy * push; it.y += ux * push; moved = true;
        }
      }
      // two lines must not leave the seed in nearly the same direction: turn the nearer cover away
      for (let a = 1; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
        const p = items[a], q = items[b], ap = Math.atan2(p.y - s0.y, p.x - s0.x), aq = Math.atan2(q.y - s0.y, q.x - s0.x);
        let d = aq - ap; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) >= MIN_ANGLE) continue;
        // both turn, half each, about the seed
        const half = (MIN_ANGLE - Math.abs(d) + 0.02) / 2 * (d >= 0 ? 1 : -1);
        for (const [it, ang] of [[p, ap - half], [q, aq + half]]) { const r = Math.hypot(it.x - s0.x, it.y - s0.y); it.x = s0.x + Math.cos(ang) * r; it.y = s0.y + Math.sin(ang) * r; }
        moved = true;
      }
      if (bounds) for (const it of items) { const h = it.size / 2; it.x = Math.min(Math.max(it.x, bounds[0] + h), bounds[2] - h); it.y = Math.min(Math.max(it.y, bounds[1] + h), bounds[3] - h); }
      if (!moved) break;
    }
    return items;
  };

  /** Where the line from (x0,y0) toward (x1,y1) leaves a square of half-size h centred on (x0,y0). */
  Focus.edge = function (x0, y0, x1, y1, h) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, k = h / (Math.max(Math.abs(dx), Math.abs(dy)) / d);
    return [x0 + (dx / d) * k, y0 + (dy / d) * k];
  };

  function segRect(a, b, cx, cy, h) {   // exact distance from segment ab to a square of half-size h
    const inside = (p) => Math.abs(p[0] - cx) <= h && Math.abs(p[1] - cy) <= h;
    if (inside(a) || inside(b)) return 0;
    const ptSeg = (px, py) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)); return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); };
    const ptRect = (p) => Math.hypot(Math.max(Math.abs(p[0] - cx) - h, 0), Math.max(Math.abs(p[1] - cy) - h, 0));
    // crossing test: the segment against each edge
    const cross = (p1, p2, p3, p4) => { const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]); if (!d) return false; const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d, u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
    const c = [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
    for (let i = 0; i < 4; i++) if (cross(a, b, c[i], c[(i + 1) % 4])) return 0;
    return Math.min(ptRect(a), ptRect(b), ...c.map((p) => ptSeg(p[0], p[1])));
  }
  /** Debug self-check of a layout: own-line visible length under 24 px, any cover within 6 px of another's line,
   * and two lines closer than the minimum angle. Returns a list of findings (empty when the layout is clean). */
  Focus.check = function (items) {
    const out = [], s = items[0], sh = s.size / 2 + Focus.SEED_FRAME, segs = {};
    for (const it of items.slice(1)) segs[it.rank] = [Focus.edge(s.x, s.y, it.x, it.y, sh), Focus.edge(it.x, it.y, s.x, s.y, it.size / 2 + Focus.REC_FRAME)];
    for (const it of items.slice(1)) {
      const [a, b] = segs[it.rank], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < MIN_LINE - 0.6) out.push({ kind: 'short', rec: it.rank, px: +len.toFixed(1) });
      for (const o of items.slice(1)) {
        if (o === it) continue;
        const d = segRect(segs[o.rank][0], segs[o.rank][1], it.x, it.y, it.size / 2 + Focus.REC_FRAME);
        if (d < LINE_CLEAR - 0.6) out.push({ kind: 'near', rec: it.rank, line: o.rank, px: +d.toFixed(1) });
        if (o.rank > it.rank) { let g = Math.atan2(o.y - s.y, o.x - s.x) - Math.atan2(it.y - s.y, it.x - s.x); while (g > Math.PI) g -= 2 * Math.PI; while (g < -Math.PI) g += 2 * Math.PI; if (Math.abs(g) < MIN_ANGLE - 0.02) out.push({ kind: 'angle', rec: it.rank, line: o.rank, rad: +Math.abs(g).toFixed(3) }); }
      }
      for (const o of items) if (o !== it && Math.abs(o.x - it.x) < (o.size + it.size) / 2 + 2 && Math.abs(o.y - it.y) < (o.size + it.size) / 2 + 2) out.push({ kind: 'overlap', rec: it.rank, with: o.rank });
    }
    return out;
  };

  function box(ids, pos, cx, cy, k) {
    const items = Focus.layout(ids.map((id) => ({ id, x: (pos[2 * id] - cx) * k, y: -(pos[2 * id + 1] - cy) * k })));
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const it of items) { const h = it.size / 2; b.x0 = Math.min(b.x0, it.x - h); b.x1 = Math.max(b.x1, it.x + h); b.y0 = Math.min(b.y0, it.y - h); b.y1 = Math.max(b.y1, it.y + h); }
    return b;
  }

  /** The app's focusCamera: fit the true positions, then zoom out while the laid-out covers do not fit. */
  Focus.camera = function (ids, pos, inset, pad) {
    pad = pad || C.FOCUS_PAD; const view = RMR.view, H = RMR.Cam.stageH();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const id of ids) { const x = pos[2 * id], y = pos[2 * id + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sx = Math.max(x1 - x0, C.MIN_FOCUS_SPAN), sy = Math.max(y1 - y0, C.MIN_FOCUS_SPAN);
    const aw = Math.max(view.W - inset - pad.left - pad.right, 80), ah = Math.max(H - pad.top - pad.bottom, 80);
    const kA = Math.min(Math.max(aw - M.rec, 40) / sx, Math.max(ah - M.rec, 40) / sy), kMin = kA * 0.5;
    let k = kA;
    for (let r = 0; r < 6 && k > kMin; r++) { const b = box(ids, pos, cx, cy, k), fit = Math.min(aw / (b.x1 - b.x0), ah / (b.y1 - b.y0)); if (fit >= 1) break; k = Math.max(kMin, k * fit); }
    k = Math.min(Math.max(k, RMR.Cam.limits.min), RMR.Cam.limits.max);
    const b = box(ids, pos, cx, cy, k);
    return { x: cx + (b.x0 + b.x1) / 2 / k - (pad.left - pad.right) / 2 / k, y: cy - (b.y0 + b.y1) / 2 / k + (pad.top - pad.bottom) / 2 / k, ppw: k, inset };
  };
})();
