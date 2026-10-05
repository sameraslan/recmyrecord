/** Screen-space placement of the focus covers (CSS px, canvas coordinates), and the focus framing that
 * leaves room for them. */
import type { MapCamera } from '@/lib/types';
import type { MapPadding } from '../types';
import { FRUSTUM_HALF_HEIGHT } from './zoomLimits';

export const MARKER_SIZE = { seed: 64, rec: 46 } as const;
export const MARKER_GAP = 10;
/** How far a marker's drawn frame reaches past its cover (styles/map.css): the seed's dark gap and ring, a
 * recommendation's hairline, a hot recommendation's ring and casing. Lines end on the frame's edge. */
export const SEED_FRAME_PX = 4;
export const REC_FRAME_PX = 1;
export const HOT_FRAME_PX = 3;
/** Least length of a line that shows between the seed's frame and its recommendation's frame. */
export const MIN_LINE_PX = 24;
/** Least gap between a cover and any other cover's line. */
export const LINE_CLEAR_PX = 6;
/** Least angle, in radians, between two lines leaving the seed. */
export const MIN_LINE_ANGLE = 0.2;

export interface MarkerAnchor {
  id: number;
  x: number;
  y: number;
}

export interface MarkerItem {
  id: number;
  /** 0 for the seed, 1..n for recommendations */
  rank: number;
  /** true position of the album */
  ax: number;
  ay: number;
  /** where the cover is drawn */
  x: number;
  y: number;
  size: number;
  seed: boolean;
}

/** Area every marker box must stay inside (CSS px, same space as the anchors). */
export interface MarkerBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LayoutOptions {
  bounds?: MarkerBounds;
  /** Minimum space between two marker boxes; defaults to MARKER_GAP (the preview strip uses a smaller one). */
  gap?: number;
  /** Least visible length of a line; defaults to MIN_LINE_PX (the preview strip uses a shorter one). */
  minLine?: number;
}

type Axis = 'x' | 'y';

/** Radius of the ring that recommendations too close to the seed are moved onto: clear of the seed, and
 * long enough for `recs` markers side by side (77 px for up to 7 recommendations of 46 px, 99 px for 10). */
export function ringRadius(recs: number, seedSize: number, recSize: number): number {
  return Math.max(seedSize / 2 + recSize / 2 + 22, (recs * (recSize + 16)) / (2 * Math.PI));
}

/** Where the line from (x0, y0) towards (x1, y1) leaves a square of half size `half` centred on (x0, y0). */
export function edgePoint(x0: number, y0: number, x1: number, y1: number, half: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  const k = half / (Math.max(Math.abs(dx), Math.abs(dy)) / d || 1);
  return [x0 + (dx / d) * k, y0 + (dy / d) * k];
}

/** anchors[0] is the seed. Recommendations too close to the seed go to a ring around it. Then four rules are
 * relaxed together, for up to 600 rounds (the prototype's Focus.layout): boxes stay `gap` apart, pushed along
 * the axis of least overlap; every line shows at least `minLine` px between the two frames; every cover stays
 * LINE_CLEAR_PX clear of every other cover's line; two lines leave the seed at least MIN_LINE_ANGLE apart.
 * Without `bounds` the seed never moves. With `bounds`, the laid-out group is shifted inside them as a whole
 * (which keeps every rule), and only if a marker is still outside is it held at the wall and the rules relaxed
 * again inside the walls, ending with a plain box separation so that the result has no overlaps. */
export function layoutMarkers(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options: LayoutOptions = {}): MarkerItem[] {
  const gap = options.gap ?? MARKER_GAP;
  const minLine = options.minLine ?? MIN_LINE_PX;
  const bounds = options.bounds ?? null;
  const items: MarkerItem[] = anchors.map((a, n) => ({ id: a.id, rank: n, ax: a.x, ay: a.y, x: a.x, y: a.y, size: n === 0 ? seedSize : recSize, seed: n === 0 }));
  if (items.length === 0) return items;
  const s0 = items[0];
  const recs = items.length - 1;
  if (recs > 0) {
    const ring = ringRadius(recs, s0.size, recSize);
    items.slice(1).forEach((it, n) => {
      let dx = it.ax - s0.ax;
      let dy = it.ay - s0.ay;
      let d = Math.hypot(dx, dy);
      if (d >= ring) return;
      if (d < 3) {
        const a = -Math.PI / 2 + (n * Math.PI * 2) / recs;
        dx = Math.cos(a);
        dy = Math.sin(a);
        d = 1;
      }
      it.x = s0.ax + (dx / d) * ring;
      it.y = s0.ay + (dy / d) * ring;
    });
  }

  const range = (it: MarkerItem, axis: Axis, walls: boolean): [number, number] => {
    if (!walls || !bounds) return [-Infinity, Infinity];
    const h = it.size / 2;
    return axis === 'x' ? [bounds.left + h, bounds.right - h] : [bounds.top + h, bounds.bottom - h];
  };
  /** Moves `it` by `d` along `axis`, held by the walls when `walls`; returns how far it actually moved. */
  const moveBy = (it: MarkerItem, axis: Axis, d: number, walls: boolean): number => {
    const [lo, hi] = range(it, axis, walls);
    const before = it[axis];
    it[axis] = Math.min(Math.max(before + d, lo), hi);
    return it[axis] - before;
  };
  const moveTo = (it: MarkerItem, x: number, y: number, walls: boolean): void => {
    moveBy(it, 'x', x - it.x, walls);
    moveBy(it, 'y', y - it.y, walls);
  };

  /** One round of box separation. `seedWeight` is the seed's share of a push: 0 keeps it where it is. */
  const separateOnce = (walls: boolean, seedWeight: number): boolean => {
    let moved = false;
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const p = items[a];
        const q = items[b];
        const need = (p.size + q.size) / 2 + gap;
        const ox = need - Math.abs(q.x - p.x);
        const oy = need - Math.abs(q.y - p.y);
        if (ox <= 0 || oy <= 0) continue;
        const axis: Axis = ox < oy ? 'x' : 'y';
        const d = q[axis] - p[axis];
        const sign = d === 0 ? (b % 2 ? 1 : -1) : Math.sign(d);
        const total = (axis === 'x' ? ox : oy) + 0.5;
        const wp = p.seed ? seedWeight : 0.5;
        const wq = q.seed ? seedWeight : 0.5;
        const movedP = -sign * moveBy(p, axis, (-sign * total * wp) / (wp + wq), walls);
        const movedQ = sign * moveBy(q, axis, sign * (total - movedP), walls);
        if (movedP + movedQ < total) moveBy(p, axis, -sign * (total - movedP - movedQ), walls);
        moved = true;
      }
    }
    return moved;
  };

  /** One round of the three line rules; the seed is never moved by them. */
  const linesOnce = (walls: boolean): boolean => {
    let moved = false;
    const seedHalf = s0.size / 2 + SEED_FRAME_PX;
    for (let a = 1; a < items.length; a++) {
      const it = items[a];
      // Enough line between the two frames.
      const dx = it.x - s0.x;
      const dy = it.y - s0.y;
      const d = Math.hypot(dx, dy) || 1;
      const need = (seedHalf + it.size / 2 + REC_FRAME_PX) / (Math.max(Math.abs(dx), Math.abs(dy)) / d || 1) + minLine;
      if (d < need - 0.5) {
        moveTo(it, s0.x + (dx / d) * need, s0.y + (dy / d) * need, walls);
        moved = true;
      }
      // Sideways off every other recommendation's line.
      for (let b = 1; b < items.length; b++) {
        if (b === a) continue;
        const o = items[b];
        const lx = o.x - s0.x;
        const ly = o.y - s0.y;
        const len = Math.hypot(lx, ly) || 1;
        const ux = lx / len;
        const uy = ly / len;
        const t = (it.x - s0.x) * ux + (it.y - s0.y) * uy;
        if (t <= 0 || t >= len) continue;
        const perp = (it.x - s0.x) * -uy + (it.y - s0.y) * ux;
        const reach = (it.size / 2 + REC_FRAME_PX) * (Math.abs(ux) + Math.abs(uy)) + LINE_CLEAR_PX;
        if (Math.abs(perp) >= reach) continue;
        const push = (reach - Math.abs(perp) + 0.5) * (perp === 0 ? (a % 2 ? 1 : -1) : Math.sign(perp));
        moveTo(it, it.x - uy * push, it.y + ux * push, walls);
        moved = true;
      }
    }
    // Two lines must not leave the seed in nearly the same direction: both turn, half each, about the seed.
    for (let a = 1; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const p = items[a];
        const q = items[b];
        const ap = Math.atan2(p.y - s0.y, p.x - s0.x);
        const aq = Math.atan2(q.y - s0.y, q.x - s0.x);
        let d = aq - ap;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) >= MIN_LINE_ANGLE) continue;
        const half = ((MIN_LINE_ANGLE - Math.abs(d) + 0.02) / 2) * (d >= 0 ? 1 : -1);
        for (const [it, ang] of [[p, ap - half], [q, aq + half]] as const) {
          const r = Math.hypot(it.x - s0.x, it.y - s0.y);
          moveTo(it, s0.x + Math.cos(ang) * r, s0.y + Math.sin(ang) * r, walls);
        }
        moved = true;
      }
    }
    return moved;
  };

  const relax = (walls: boolean, seedWeight: number): void => {
    for (let iter = 0; iter < 600; iter++) {
      const boxes = separateOnce(walls, seedWeight);
      const lines = linesOnce(walls);
      if (!boxes && !lines) return;
    }
  };

  relax(false, 0);
  if (bounds) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const it of items) {
      const h = it.size / 2;
      x0 = Math.min(x0, it.x - h);
      x1 = Math.max(x1, it.x + h);
      y0 = Math.min(y0, it.y - h);
      y1 = Math.max(y1, it.y + h);
    }
    const shift = (lo: number, hi: number, min: number, max: number) => (hi - lo > max - min ? 0 : lo < min ? min - lo : hi > max ? max - hi : 0);
    const sx = shift(x0, x1, bounds.left, bounds.right);
    const sy = shift(y0, y1, bounds.top, bounds.bottom);
    let held = false;
    for (const it of items) {
      it.x += sx;
      it.y += sy;
      if (moveBy(it, 'x', 0, true) !== 0) held = true;
      if (moveBy(it, 'y', 0, true) !== 0) held = true;
    }
    if (held) {
      // The group does not fit: relax inside the walls (the seed gives way a little, as before), then make
      // sure no boxes overlap, whatever the line rules could not reach.
      relax(true, 0.2);
      for (let iter = 0; iter < 300; iter++) if (!separateOnce(true, 0.2)) break;
    }
  }
  return items;
}

/** A marker as MarkerDriver last drew it: `drawn` is its box edge on screen (1.16x when hot). */
export interface PlacedMarker extends MarkerItem {
  drawn: number;
}

/** CSS px of slack around a marker box for a hit: a mouse gets the mockup's 4 px, a finger more. */
const HIT_SLACK = { mouse: 4, touch: 8 } as const;

/** The album whose marker box contains the canvas point (x, y), or -1. The markers never overlap; the seed,
 * drawn on top, is tested first. */
export function markerAt(placed: readonly PlacedMarker[], x: number, y: number, pointerType = 'mouse'): number {
  const slack = pointerType === 'mouse' ? HIT_SLACK.mouse : HIT_SLACK.touch;
  for (const it of placed) {
    const h = it.drawn / 2 + slack;
    if (Math.abs(x - it.x) <= h && Math.abs(y - it.y) <= h) return it.id;
  }
  return -1;
}

/** World units: a tight cluster is framed as if it spanned at least this much, so it is not zoomed to the maximum. */
const MIN_FOCUS_SPAN = 0.15;
/** Rounds of "lay the markers out, zoom out until they fit". */
const FIT_ROUNDS = 6;
/** Marker offsets never zoom the framing out more than this factor below the fit of the true positions. */
const MAX_MARKER_ZOOM_OUT = 0.5;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Marker boxes (CSS px, around the world point (cx, cy), y down) laid out at `k` px per world unit. */
function markerBox(ids: readonly number[], positions: Float32Array, cx: number, cy: number, k: number): Box {
  const anchors = ids.map((id) => ({ id, x: (positions[2 * id] - cx) * k, y: -(positions[2 * id + 1] - cy) * k }));
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const it of layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec)) {
    const h = it.size / 2;
    box.x0 = Math.min(box.x0, it.x - h);
    box.x1 = Math.max(box.x1, it.x + h);
    box.y0 = Math.min(box.y0, it.y - h);
    box.y1 = Math.max(box.y1, it.y + h);
  }
  return box;
}

/** Camera that fits the focus (`ids[0]` the seed) inside the padded visible area right of `insetPx`, with room
 * for the cover markers. The true positions are fitted first, with a recommendation marker's width to spare;
 * then the markers are laid out as MarkerDriver lays them out (ring and separation, in CSS px), the framing
 * zooms out while their boxes do not fit, and it is centred on the boxes. The camera position is the centre of
 * the visible area (applyFrustum), so the fit is computed around it. `clampZoom` applies the camera's zoom range.
 * Markers that still do not fit (a pile the ring spreads wider than the area) are held inside by MarkerDriver. */
export function focusCamera(
  ids: readonly number[],
  positions: Float32Array,
  width: number,
  height: number,
  insetPx: number,
  pad: MapPadding,
  clampZoom: (zoom: number) => number,
): MapCamera {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    const x = positions[2 * id];
    const y = positions[2 * id + 1];
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const spanX = Math.max(x1 - x0, MIN_FOCUS_SPAN);
  const spanY = Math.max(y1 - y0, MIN_FOCUS_SPAN);
  const availW = Math.max(width - insetPx - pad.left - pad.right, 80);
  const availH = Math.max(height - pad.top - pad.bottom, 80);
  const m = MARKER_SIZE.rec;
  // CSS px per world unit.
  const kAnchors = Math.min(Math.max(availW - m, 40) / spanX, Math.max(availH - m, 40) / spanY);
  const kMin = kAnchors * MAX_MARKER_ZOOM_OUT;
  let k = kAnchors;
  for (let round = 0; round < FIT_ROUNDS && k > kMin; round++) {
    const b = markerBox(ids, positions, cx, cy, k);
    const fit = Math.min(availW / (b.x1 - b.x0), availH / (b.y1 - b.y0));
    if (fit >= 1) break;
    k = Math.max(kMin, k * fit);
  }
  const worldH = 2 * FRUSTUM_HALF_HEIGHT;
  const zoom = clampZoom((k * worldH) / height);
  const kz = (height * zoom) / worldH;
  const b = markerBox(ids, positions, cx, cy, kz);
  return {
    x: cx + (b.x0 + b.x1) / 2 / kz - (pad.left - pad.right) / 2 / kz,
    y: cy - (b.y0 + b.y1) / 2 / kz + (pad.top - pad.bottom) / 2 / kz,
    zoom,
  };
}
