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

/** Rounds of the four rules (the prototype's Focus.layout), and of the plain box separation that ends a layout
 * held by the walls. */
const RULE_ROUNDS = 600;
const SEPARATE_ROUNDS = 300;

/** The markers' own area, or null for no walls. */
type Walls = MarkerBounds | null;

/** Moves `it` by `d` along `axis`, held by the walls if there are any; returns how far it actually moved. */
function moveBy(it: MarkerItem, axis: Axis, d: number, walls: Walls): number {
  const before = it[axis];
  if (!walls) {
    it[axis] = before + d;
  } else {
    const h = it.size / 2;
    const lo = axis === 'x' ? walls.left + h : walls.top + h;
    const hi = axis === 'x' ? walls.right - h : walls.bottom - h;
    it[axis] = Math.min(Math.max(before + d, lo), hi);
  }
  return it[axis] - before;
}

function moveTo(it: MarkerItem, x: number, y: number, walls: Walls): void {
  moveBy(it, 'x', x - it.x, walls);
  moveBy(it, 'y', y - it.y, walls);
}

/** One round of box separation. `seedWeight` is the seed's share of a push: 0 keeps it where it is. */
function separateOnce(items: MarkerItem[], gap: number, walls: Walls, seedWeight: number): boolean {
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
}

/** Each marker's direction from the seed, kept up to date as the line rules move markers so that a round
 * computes it once per move instead of once per pair: `len` the distance (1 when on the seed) and (`ux`, `uy`)
 * the unit vector (0, 0 when on the seed). Every value is the same expression the rules would compute in place. */
interface Directions {
  len: Float64Array;
  ux: Float64Array;
  uy: Float64Array;
}

function directions(n: number): Directions {
  return { len: new Float64Array(n), ux: new Float64Array(n), uy: new Float64Array(n) };
}

function aim(items: MarkerItem[], dir: Directions, i: number): void {
  const s0 = items[0];
  const lx = items[i].x - s0.x;
  const ly = items[i].y - s0.y;
  const len = Math.hypot(lx, ly) || 1;
  dir.len[i] = len;
  dir.ux[i] = lx / len;
  dir.uy[i] = ly / len;
}

/** Two lines whose unit vectors have a dot product below this are more than MIN_LINE_ANGLE + 0.01 rad apart,
 * so the angle rule can pass them without measuring their angles. */
const CLEARLY_APART = Math.cos(MIN_LINE_ANGLE + 0.01);

/** One round of the three line rules; the seed is never moved by them. */
function linesOnce(items: MarkerItem[], minLine: number, walls: Walls, dir: Directions): boolean {
  let moved = false;
  const s0 = items[0];
  const seedHalf = s0.size / 2 + SEED_FRAME_PX;
  // The box separation that ran before may have moved any marker, the seed too.
  for (let i = 1; i < items.length; i++) aim(items, dir, i);
  for (let a = 1; a < items.length; a++) {
    const it = items[a];
    // Enough line between the two frames.
    const dx = it.x - s0.x;
    const dy = it.y - s0.y;
    const d = dir.len[a];
    const need = (seedHalf + it.size / 2 + REC_FRAME_PX) / (Math.max(Math.abs(dx), Math.abs(dy)) / d || 1) + minLine;
    if (d < need - 0.5) {
      moveTo(it, s0.x + (dx / d) * need, s0.y + (dy / d) * need, walls);
      aim(items, dir, a);
      moved = true;
    }
    // Sideways off every other recommendation's line.
    for (let b = 1; b < items.length; b++) {
      if (b === a) continue;
      const len = dir.len[b];
      const ux = dir.ux[b];
      const uy = dir.uy[b];
      const t = (it.x - s0.x) * ux + (it.y - s0.y) * uy;
      if (t <= 0 || t >= len) continue;
      const perp = (it.x - s0.x) * -uy + (it.y - s0.y) * ux;
      const reach = (it.size / 2 + REC_FRAME_PX) * (Math.abs(ux) + Math.abs(uy)) + LINE_CLEAR_PX;
      if (Math.abs(perp) >= reach) continue;
      const push = (reach - Math.abs(perp) + 0.5) * (perp === 0 ? (a % 2 ? 1 : -1) : Math.sign(perp));
      moveTo(it, it.x - uy * push, it.y + ux * push, walls);
      aim(items, dir, a);
      moved = true;
    }
  }
  // Two lines must not leave the seed in nearly the same direction: both turn, half each, about the seed.
  for (let a = 1; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const ua = dir.ux[a];
      const va = dir.uy[a];
      const ub = dir.ux[b];
      const vb = dir.uy[b];
      if (ua * ub + va * vb < CLEARLY_APART && (ua !== 0 || va !== 0) && (ub !== 0 || vb !== 0)) continue;
      const p = items[a];
      const q = items[b];
      const ap = Math.atan2(p.y - s0.y, p.x - s0.x);
      const aq = Math.atan2(q.y - s0.y, q.x - s0.x);
      let d = aq - ap;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) >= MIN_LINE_ANGLE) continue;
      const half = ((MIN_LINE_ANGLE - Math.abs(d) + 0.02) / 2) * (d >= 0 ? 1 : -1);
      const rp = Math.hypot(p.x - s0.x, p.y - s0.y);
      moveTo(p, s0.x + Math.cos(ap - half) * rp, s0.y + Math.sin(ap - half) * rp, walls);
      aim(items, dir, a);
      const rq = Math.hypot(q.x - s0.x, q.y - s0.y);
      moveTo(q, s0.x + Math.cos(aq + half) * rq, s0.y + Math.sin(aq + half) * rq, walls);
      aim(items, dir, b);
      moved = true;
    }
  }
  return moved;
}

/** Runs `step` (one round over the markers, true when it moved one) until a round moves nothing, for at most
 * `rounds` rounds. A round depends on the marker positions alone, so once the positions repeat (markers pushed
 * into a wall and held there every round, or a few rounds that undo each other) every later round is known:
 * a round that leaves every marker where it was ends the loop at once, and a longer cycle (Brent's cycle
 * detection) skips the rounds left down to those that set where the cycle stands when the last round ends.
 * The result is the same, to the bit, as running every round. */
function iterate(items: MarkerItem[], rounds: number, step: () => boolean): void {
  const n = items.length;
  const saved = new Float64Array(2 * n);
  const prev = new Float64Array(2 * n);
  const copy = (to: Float64Array) => {
    for (let i = 0; i < n; i++) {
      to[2 * i] = items[i].x;
      to[2 * i + 1] = items[i].y;
    }
  };
  const repeats = (of: Float64Array) => {
    for (let i = 0; i < n; i++) if (of[2 * i] !== items[i].x || of[2 * i + 1] !== items[i].y) return false;
    return true;
  };
  copy(saved);
  copy(prev);
  let power = 1;
  let period = 0;
  for (let round = 0; round < rounds; round++) {
    if (!step()) return;
    // Held still by the walls: every round left would do the same.
    if (repeats(prev)) return;
    copy(prev);
    period++;
    if (repeats(saved)) {
      for (let left = (rounds - 1 - round) % period; left > 0; left--) if (!step()) return;
      return;
    }
    if (period === power) {
      copy(saved);
      power *= 2;
      period = 0;
    }
  }
}

/** The four rules together, for up to RULE_ROUNDS rounds. */
function relax(items: MarkerItem[], gap: number, minLine: number, walls: Walls, seedWeight: number): void {
  const dir = directions(items.length);
  iterate(items, RULE_ROUNDS, () => {
    const boxes = separateOnce(items, gap, walls, seedWeight);
    const lines = linesOnce(items, minLine, walls, dir);
    return boxes || lines;
  });
}

function startItems(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number): MarkerItem[] {
  const items: MarkerItem[] = anchors.map((a, n) => ({ id: a.id, rank: n, ax: a.x, ay: a.y, x: a.x, y: a.y, size: n === 0 ? seedSize : recSize, seed: n === 0 }));
  const recs = items.length - 1;
  if (recs > 0) {
    const s0 = items[0];
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
  return items;
}

/** Shifts the laid-out group inside the bounds as a whole (which keeps every rule) and holds at the wall any
 * marker still outside. True when one was held: the group is larger than the bounds. Allocates nothing. */
function shiftInside(items: MarkerItem[], bounds: MarkerBounds): boolean {
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
    if (moveBy(it, 'x', 0, bounds) !== 0) held = true;
    if (moveBy(it, 'y', 0, bounds) !== 0) held = true;
  }
  return held;
}

/** The group does not fit: relax inside the walls (the seed gives way a little, as before), then make sure no
 * boxes overlap, whatever the line rules could not reach. */
function relaxHeld(items: MarkerItem[], gap: number, minLine: number, bounds: MarkerBounds): void {
  relax(items, gap, minLine, bounds, 0.2);
  iterate(items, SEPARATE_ROUNDS, () => separateOnce(items, gap, bounds, 0.2));
}

/** anchors[0] is the seed. Recommendations too close to the seed go to a ring around it. Then four rules are
 * relaxed together, for up to 600 rounds (the prototype's Focus.layout): boxes stay `gap` apart, pushed along
 * the axis of least overlap; every line shows at least `minLine` px between the two frames; every cover stays
 * LINE_CLEAR_PX clear of every other cover's line; two lines leave the seed at least MIN_LINE_ANGLE apart.
 * Without `bounds` the seed never moves. With `bounds`, the laid-out group is shifted inside them as a whole
 * (which keeps every rule), and only if a marker is still outside is it held at the wall and the rules relaxed
 * again inside the walls, ending with a plain box separation so that the result has no overlaps. Rounds that
 * only repeat earlier ones are skipped (`iterate`). For every drawn frame, use a MarkerLayout. */
export function layoutMarkers(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options: LayoutOptions = {}): MarkerItem[] {
  const gap = options.gap ?? MARKER_GAP;
  const minLine = options.minLine ?? MIN_LINE_PX;
  const bounds = options.bounds ?? null;
  const items = startItems(anchors, seedSize, recSize);
  if (items.length === 0) return items;
  relax(items, gap, minLine, null, 0);
  if (bounds && shiftInside(items, bounds)) relaxHeld(items, gap, minLine, bounds);
  return items;
}

/** Two group shapes (each album's offset from the seed, CSS px) closer than this are the same shape: only
 * rounding noise from the projection tells them apart, as between two frames of a pan. */
export const SHAPE_SAME_PX = 1e-3;
/** A settle that moves no marker this far needs no ease. */
export const SETTLE_EASE_PX = 0.5;

/** MarkerLayout.layout's options: `moving` while the view is on its way somewhere; `target`, on the first frame of
 * a camera tween with a known end (an album opening, the focus framing), the anchors and bounds of the view it
 * will land on. */
export interface MarkerLayoutOptions extends LayoutOptions {
  moving?: boolean;
  target?: { anchors: readonly MarkerAnchor[]; bounds: MarkerBounds | null };
}

/** What a MarkerLayout did, call by call: solved from scratch (an album opened or another input set), settled a
 * layout that had ridden with the seed, moved its last solve exactly (a pan), carried the group with the seed
 * through a motion, or returned the last layout untouched. */
export interface MarkerLayoutStats {
  solves: number;
  settles: number;
  moves: number;
  rides: number;
  unchanged: number;
}

/** The old layout's plain box separation inside the walls (the seed gives way a little): cheap, and leaves
 * nothing outside the bounds. Allocates nothing. False when boxes still overlap after SEPARATE_ROUNDS rounds. */
function separateAtWalls(items: MarkerItem[], gap: number, bounds: MarkerBounds): boolean {
  for (let round = 0; round < SEPARATE_ROUNDS; round++) if (!separateOnce(items, gap, bounds, 0.2)) return true;
  return false;
}

/** layoutMarkers for a driver that lays the same focus out on every drawn frame, steady from frame to frame.
 *
 * - Opening an album, or any other change of albums, sizes, gap or minimum line: a fresh solve, the same as
 *   layoutMarkers, so the same album in the same view always gets the same layout. When a camera tween is
 *   taking the view somewhere known (`target`), the solve is of that view and the group rides there with the
 *   seed, so it lands on its settled layout with nothing to ease.
 * - Nothing moved (a hover redraw, a cover or gas fade): the same array, untouched, no work.
 * - The group kept its shape (a pan, the album panel sliding) and no marker meets a wall: the last solve moved
 *   exactly with the seed, which is what a fresh solve gives up to the projection's rounding.
 * - Otherwise, while `moving` (a zoom, a slider morph, a fling, wheel easing, a camera tween, a bounds nudge, a
 *   drag): the group rides rigidly with the seed, as the last solve laid it out, shifted inside the bounds and,
 *   where it is larger than them, held at the walls with the plain box separation. No full solve per frame.
 * - The first call that is not `moving` after the layout was carried (a ride or a pan) settles it: a fresh solve
 *   of that view, with `settledFrom` holding where the markers were when one moves SETTLE_EASE_PX or more, so the
 *   driver can ease them over. So a view at rest always shows the fresh layout of that view. A frame at rest that
 *   changes the view (a keyboard pan, a resize) settles at once.
 *
 * The returned array is the layout's own: the next call rewrites it in place. Every path but a solve or a settle
 * allocates nothing. */
export class MarkerLayout {
  readonly stats: MarkerLayoutStats = { solves: 0, settles: 0, moves: 0, rides: 0, unchanged: 0 };
  /** Set by a call that settled: x, y of each marker just before (rank order). Null after any other call. */
  settledFrom: Float64Array | null = null;
  /** Bumped whenever a call changes where a marker is. */
  version = 0;
  private items: MarkerItem[] = [];
  private seedSize = NaN;
  private recSize = NaN;
  private gap = NaN;
  private minLine = NaN;
  /** True when the markers have been carried since the last solve (a pan, a motion), so that a call at rest
   * solves the view afresh. */
  private pending = false;
  /** Each album's offset from the seed's album at the last solve. */
  private rel = new Float64Array(0);
  /** The rules' result at the last solve (before the bounds step), as offsets from the seed's album. */
  private free = new Float64Array(0);
  /** The anchors and bounds of the last call. */
  private last = new Float64Array(0);
  private lastBounds: MarkerBounds | null = null;
  private readonly boundsCopy: MarkerBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  /** The last solve's result, the seed's album it was solved at, and its bounds. */
  private solved = new Float64Array(0);
  private readonly solvedAt = [NaN, NaN];
  private solvedBounds: MarkerBounds | null = null;
  private readonly solvedBoundsCopy: MarkerBounds = { left: 0, top: 0, right: 0, bottom: 0 };

  /** True when the layout has been carried with the seed since its last solve and waits for a call that is
   * not moving to settle it on a fresh solve of the view. */
  get unsettled(): boolean {
    return this.pending;
  }

  layout(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options: MarkerLayoutOptions = {}): readonly MarkerItem[] {
    const gap = options.gap ?? MARKER_GAP;
    const minLine = options.minLine ?? MIN_LINE_PX;
    const bounds = options.bounds ?? null;
    const moving = options.moving ?? false;
    this.settledFrom = null;
    const target = options.target;
    if (target && target.anchors.length === anchors.length && target.anchors.every((a, i) => a.id === anchors[i].id)) {
      // A camera tween is under way to a known view: lay out that view, and carry it there with the seed.
      this.stats.solves++;
      this.solve(target.anchors, seedSize, recSize, gap, minLine, target.bounds);
      return this.layout(anchors, seedSize, recSize, { gap, minLine, bounds: bounds ?? undefined, moving: true });
    }
    const items = this.items;
    const n = anchors.length;
    let same = n === items.length && seedSize === this.seedSize && recSize === this.recSize && gap === this.gap && minLine === this.minLine;
    for (let i = 0; same && i < n; i++) same = anchors[i].id === items[i].id;
    if (!same) {
      this.stats.solves++;
      return this.solve(anchors, seedSize, recSize, gap, minLine, bounds);
    }
    if (n === 0) return items;
    const { rel, free, last } = this;
    const lb = this.lastBounds;
    let still = bounds && lb ? bounds.left === lb.left && bounds.top === lb.top && bounds.right === lb.right && bounds.bottom === lb.bottom : bounds === lb;
    for (let i = 0; still && i < n; i++) still = anchors[i].x === last[2 * i] && anchors[i].y === last[2 * i + 1];
    if (still && (!this.pending || moving)) {
      this.stats.unchanged++;
      return items;
    }
    // The last solve carried with the seed: exact for a pan that meets no wall, rigid otherwise.
    const x0 = anchors[0].x;
    const y0 = anchors[0].y;
    let shapeSame = true;
    for (let i = 0; shapeSame && i < n; i++) {
      shapeSame = Math.abs(anchors[i].x - x0 - rel[2 * i]) < SHAPE_SAME_PX && Math.abs(anchors[i].y - y0 - rel[2 * i + 1]) < SHAPE_SAME_PX;
    }
    // Back at the view of the last solve (a tween landing on its target): its layout, exactly.
    const sb = this.solvedBounds;
    const atSolved =
      shapeSame &&
      Math.abs(x0 - this.solvedAt[0]) < SHAPE_SAME_PX &&
      Math.abs(y0 - this.solvedAt[1]) < SHAPE_SAME_PX &&
      (bounds && sb ? bounds.left === sb.left && bounds.top === sb.top && bounds.right === sb.right && bounds.bottom === sb.bottom : !bounds && !sb);
    if (atSolved) {
      for (let i = 0; i < n; i++) {
        const it = items[i];
        it.ax = anchors[i].x;
        it.ay = anchors[i].y;
        it.x = this.solved[2 * i] + (x0 - this.solvedAt[0]);
        it.y = this.solved[2 * i + 1] + (y0 - this.solvedAt[1]);
      }
      this.record(bounds);
      this.pending = false;
      this.stats.moves++;
      return items;
    }
    if (!still) {
      const carry = () => {
        for (let i = 0; i < n; i++) {
          const it = items[i];
          it.ax = anchors[i].x;
          it.ay = anchors[i].y;
          it.x = x0 + free[2 * i];
          it.y = y0 + free[2 * i + 1];
        }
        return !!bounds && shiftInside(items, bounds);
      };
      // Held at a wall: the old layout's box separation. On the rare frame where that leaves an overlap, the full
      // rules inside the walls from the carried group, as a fresh solve runs them.
      if (carry() && bounds && !separateAtWalls(items, gap, bounds)) {
        carry();
        relaxHeld(items, gap, minLine, bounds);
      }
    }
    if (moving) {
      this.record(bounds);
      this.pending = true;
      if (shapeSame) this.stats.moves++;
      else this.stats.rides++;
      return items;
    }
    // At rest: settle on a fresh solve of this view, from where the group has just been carried. A pan that met no
    // wall is already there, up to the projection's rounding: then no ease is needed.
    const from = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      from[2 * i] = items[i].x;
      from[2 * i + 1] = items[i].y;
    }
    this.stats.settles++;
    const out = this.solve(anchors, seedSize, recSize, gap, minLine, bounds);
    let moved = false;
    for (let i = 0; !moved && i < n; i++) moved = Math.abs(out[i].x - from[2 * i]) >= SETTLE_EASE_PX || Math.abs(out[i].y - from[2 * i + 1]) >= SETTLE_EASE_PX;
    if (moved) this.settledFrom = from;
    return out;
  }

  private solve(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, gap: number, minLine: number, bounds: MarkerBounds | null): MarkerItem[] {
    const items = startItems(anchors, seedSize, recSize);
    const n = items.length;
    this.items = items;
    this.seedSize = seedSize;
    this.recSize = recSize;
    this.gap = gap;
    this.minLine = minLine;
    this.pending = false;
    if (this.rel.length !== 2 * n) {
      this.rel = new Float64Array(2 * n);
      this.free = new Float64Array(2 * n);
      this.last = new Float64Array(2 * n);
      this.solved = new Float64Array(2 * n);
    }
    if (n > 0) {
      relax(items, gap, minLine, null, 0);
      const x0 = items[0].ax;
      const y0 = items[0].ay;
      for (let i = 0; i < n; i++) {
        this.rel[2 * i] = items[i].ax - x0;
        this.rel[2 * i + 1] = items[i].ay - y0;
        this.free[2 * i] = items[i].x - x0;
        this.free[2 * i + 1] = items[i].y - y0;
      }
      if (bounds && shiftInside(items, bounds)) relaxHeld(items, gap, minLine, bounds);
      this.solvedAt[0] = x0;
      this.solvedAt[1] = y0;
      for (let i = 0; i < n; i++) {
        this.solved[2 * i] = items[i].x;
        this.solved[2 * i + 1] = items[i].y;
      }
    }
    if (bounds) {
      Object.assign(this.solvedBoundsCopy, bounds);
      this.solvedBounds = this.solvedBoundsCopy;
    } else {
      this.solvedBounds = null;
    }
    this.record(bounds);
    return items;
  }

  /** Keeps this call's anchors and bounds, and counts a change of layout. */
  private record(bounds: MarkerBounds | null): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      this.last[2 * i] = items[i].ax;
      this.last[2 * i + 1] = items[i].ay;
    }
    if (bounds) {
      Object.assign(this.boundsCopy, bounds);
      this.lastBounds = this.boundsCopy;
    } else {
      this.lastBounds = null;
    }
    this.version++;
  }
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
