/** Screen-space placement of the focus covers (CSS px, canvas coordinates), and the focus framing that
 * leaves room for them. */
import type { MapCamera } from '@/lib/types';
import type { MapPadding } from '../types';
import { FRUSTUM_HALF_HEIGHT } from './zoomLimits';

export const MARKER_SIZE = { seed: 64, rec: 46 } as const;
export const MARKER_GAP = 10;

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
}

type Axis = 'x' | 'y';

/** Radius of the ring that recommendations too close to the seed are moved onto: clear of the seed, and
 * long enough for `recs` markers side by side (77 px for up to 7 recommendations of 46 px, 99 px for 10). */
export function ringRadius(recs: number, seedSize: number, recSize: number): number {
  return Math.max(seedSize / 2 + recSize / 2 + 22, (recs * (recSize + 16)) / (2 * Math.PI));
}

/** anchors[0] is the seed. Recommendations too close to the seed go to a ring around it; overlapping boxes are
 * then separated along the axis of least overlap (the seed moves less than the others). With `bounds`, the
 * separated group is first shifted inside them as a whole (which keeps it overlap free), then any marker still
 * outside is held at the wall and separation runs again, a marker that is held passing its share of each push
 * to the other one. */
export function layoutMarkers(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options: LayoutOptions = {}): MarkerItem[] {
  const gap = options.gap ?? MARKER_GAP;
  const bounds = options.bounds ?? null;
  const items: MarkerItem[] = anchors.map((a, n) => ({ id: a.id, rank: n, ax: a.x, ay: a.y, x: a.x, y: a.y, size: n === 0 ? seedSize : recSize, seed: n === 0 }));
  if (items.length > 1) {
    const s0 = items[0];
    const recs = items.length - 1;
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
  const separate = (walls: boolean) => {
    for (let iter = 0; iter < 300; iter++) {
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
          const wp = p.seed ? 0.2 : 0.5;
          const wq = q.seed ? 0.2 : 0.5;
          const movedP = -sign * moveBy(p, axis, (-sign * total * wp) / (wp + wq), walls);
          const movedQ = sign * moveBy(q, axis, sign * (total - movedP), walls);
          if (movedP + movedQ < total) moveBy(p, axis, -sign * (total - movedP - movedQ), walls);
          moved = true;
        }
      }
      if (!moved) return;
    }
  };

  separate(false);
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
    for (const it of items) {
      it.x += sx;
      it.y += sy;
      moveBy(it, 'x', 0, true);
      moveBy(it, 'y', 0, true);
    }
    separate(true);
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
