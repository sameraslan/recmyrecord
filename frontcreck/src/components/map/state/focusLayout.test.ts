import { describe, expect, it } from 'vitest';
import {
  LINE_CLEAR_PX,
  MARKER_GAP,
  MARKER_SIZE,
  MIN_LINE_ANGLE,
  MIN_LINE_PX,
  MarkerLayout,
  REC_FRAME_PX,
  SEED_FRAME_PX,
  edgePoint,
  focusCamera,
  layoutMarkers,
  markerAt,
  ringRadius,
  type MarkerBounds,
  type MarkerItem,
} from './focusLayout';
import { FRUSTUM_HALF_HEIGHT } from './zoomLimits';

function overlaps(items: MarkerItem[], gap = MARKER_GAP): number {
  let bad = 0;
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const need = (items[a].size + items[b].size) / 2 + gap;
      if (Math.abs(items[b].x - items[a].x) < need - 1 && Math.abs(items[b].y - items[a].y) < need - 1) bad++;
    }
  }
  return bad;
}

function outside(items: MarkerItem[], b: MarkerBounds): number {
  return items.filter((it) => it.x - it.size / 2 < b.left - 0.01 || it.x + it.size / 2 > b.right + 0.01 || it.y - it.size / 2 < b.top - 0.01 || it.y + it.size / 2 > b.bottom + 0.01).length;
}

type Pt = [number, number];

/** Exact distance from segment ab to a square of half size h centred on (cx, cy). */
function segRect(a: Pt, b: Pt, cx: number, cy: number, h: number): number {
  const inside = (p: Pt) => Math.abs(p[0] - cx) <= h && Math.abs(p[1] - cy) <= h;
  if (inside(a) || inside(b)) return 0;
  const ptSeg = (px: number, py: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l));
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  };
  const ptRect = (p: Pt) => Math.hypot(Math.max(Math.abs(p[0] - cx) - h, 0), Math.max(Math.abs(p[1] - cy) - h, 0));
  const cross = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (!d) return false;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const c: Pt[] = [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
  for (let i = 0; i < 4; i++) if (cross(a, b, c[i], c[(i + 1) % 4])) return 0;
  return Math.min(ptRect(a), ptRect(b), ...c.map((p) => ptSeg(p[0], p[1])));
}

/** The prototype's Focus.check: a finding for every line shorter than 24 px, cover within 6 px of another
 * cover's line, pair of lines closer than 0.2 rad, and pair of overlapping covers. Empty when the layout is clean. */
function findings(items: MarkerItem[]): string[] {
  const out: string[] = [];
  if (items.length < 2) return out;
  const s = items[0];
  const recs = items.slice(1);
  const seg = new Map<number, [Pt, Pt]>();
  for (const it of recs) seg.set(it.rank, [edgePoint(s.x, s.y, it.x, it.y, s.size / 2 + SEED_FRAME_PX), edgePoint(it.x, it.y, s.x, s.y, it.size / 2 + REC_FRAME_PX)]);
  for (const it of recs) {
    const [a, b] = seg.get(it.rank)!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < MIN_LINE_PX - 0.6) out.push(`short ${it.rank}: ${len.toFixed(1)} px`);
    for (const o of recs) {
      if (o === it) continue;
      const [oa, ob] = seg.get(o.rank)!;
      const d = segRect(oa, ob, it.x, it.y, it.size / 2 + REC_FRAME_PX);
      if (d < LINE_CLEAR_PX - 0.6) out.push(`near ${it.rank} to line ${o.rank}: ${d.toFixed(1)} px`);
      if (o.rank > it.rank) {
        let g = Math.atan2(o.y - s.y, o.x - s.x) - Math.atan2(it.y - s.y, it.x - s.x);
        while (g > Math.PI) g -= 2 * Math.PI;
        while (g < -Math.PI) g += 2 * Math.PI;
        if (Math.abs(g) < MIN_LINE_ANGLE - 0.02) out.push(`angle ${it.rank} and ${o.rank}: ${Math.abs(g).toFixed(3)} rad`);
      }
    }
    for (const o of items) {
      if (o !== it && Math.abs(o.x - it.x) < (o.size + it.size) / 2 + 2 && Math.abs(o.y - it.y) < (o.size + it.size) / 2 + 2) out.push(`overlap ${it.rank} with ${o.rank}`);
    }
  }
  return out;
}

/** Deterministic random numbers in 0..1. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('layoutMarkers', () => {
  it('leaves well separated markers on their anchors and sizes the seed', () => {
    const out = layoutMarkers([{ id: 7, x: 100, y: 100 }, { id: 3, x: 400, y: 100 }, { id: 9, x: 100, y: 400 }], 64, 46);
    expect(out.map((m) => [m.id, m.x, m.y, m.size, m.rank])).toEqual([[7, 100, 100, 64, 0], [3, 400, 100, 46, 1], [9, 100, 400, 46, 2]]);
    expect(out[0].seed).toBe(true);
  });

  it('pushes a recommendation sitting on the seed out to a ring', () => {
    const [s, r] = layoutMarkers([{ id: 0, x: 100, y: 100 }, { id: 1, x: 100, y: 100 }], 64, 46);
    expect(Math.hypot(r.x - s.x, r.y - s.y)).toBeGreaterThanOrEqual(64 / 2 + 46 / 2 + 22 - 0.5);
    expect(r.ax).toBe(100);
  });

  it('separates a pile of eleven markers without overlaps', () => {
    const pile = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300, y: 300 }));
    expect(overlaps(layoutMarkers(pile, MARKER_SIZE.seed, MARKER_SIZE.rec))).toBe(0);
  });

  it('separates random tight clusters', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < 100; t++) {
      const anchors = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300 + rand() * 80, y: 300 + rand() * 80 }));
      expect(overlaps(layoutMarkers(anchors, 64, 46))).toBe(0);
    }
  });

  it('keeps a pile at an edge or a corner inside the bounds without overlaps', () => {
    const bounds = { left: 0, top: 0, right: 400, bottom: 400 };
    for (const [x, y] of [[10, 200], [0, 0], [395, 395], [200, 5]]) {
      const pile = Array.from({ length: 11 }, (_, i) => ({ id: i, x: x + (i % 3), y: y + (i % 2) }));
      const out = layoutMarkers(pile, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds });
      expect(outside(out, bounds), `${x},${y}`).toBe(0);
      expect(overlaps(out), `${x},${y}`).toBe(0);
    }
  });

  it('keeps spread recommendations right of an album panel', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bounds = { left: 652, top: 4, right: 1436, bottom: 836 };
    for (let t = 0; t < 200; t++) {
      const cx = 748 + rand() * 592;
      const cy = 262 + rand() * 400;
      const anchors = Array.from({ length: 11 }, (_, i) => ({
        id: i,
        x: Math.min(Math.max(cx + (i ? (rand() - 0.5) * 300 : 0), bounds.left + 60), bounds.right - 60),
        y: cy + (i ? (rand() - 0.5) * 300 : 0),
      }));
      const out = layoutMarkers(anchors, 64, 46, { bounds });
      expect(outside(out, bounds)).toBe(0);
      expect(overlaps(out)).toBe(0);
    }
  });

  it('takes a smaller gap for small markers', () => {
    const pile = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 195, y: 86 }));
    const bounds = { left: 2, top: 2, right: 388, bottom: 170 };
    const out = layoutMarkers(pile, 32, 22, { bounds, gap: 6 });
    expect(outside(out, bounds)).toBe(0);
    expect(overlaps(out, 6)).toBe(0);
  });
});

describe('edgePoint', () => {
  it('is where the line towards a point leaves a square', () => {
    expect(edgePoint(0, 0, 100, 0, 36)).toEqual([36, 0]);
    expect(edgePoint(0, 0, 0, -50, 24)).toEqual([0, -24]);
    const [x, y] = edgePoint(10, 10, 110, 60, 20);
    expect(x).toBeCloseTo(30, 6);
    expect(y).toBeCloseTo(20, 6);
  });

  it('does not divide by zero for two points on the same spot', () => {
    for (const v of edgePoint(5, 5, 5, 5, 20)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('layoutMarkers keeps covers off the lines (prototype Focus.check)', () => {
  it('leaves no finding in random clusters of one, two, five and ten recommendations', () => {
    for (const n of [1, 2, 5, 10]) {
      const rand = lcg(11 + n);
      for (let t = 0; t < 300; t++) {
        const spread = 40 + rand() * 500;
        const anchors = Array.from({ length: n + 1 }, (_, i) => ({ id: i, x: 600 + (i ? (rand() - 0.5) * spread : 0), y: 400 + (i ? (rand() - 0.5) * spread : 0) }));
        expect(findings(layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec)), `${n} recs, round ${t}`).toEqual([]);
      }
    }
  });

  it('leaves no finding in a pile of eleven on one spot', () => {
    const pile = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300, y: 300 }));
    expect(findings(layoutMarkers(pile, MARKER_SIZE.seed, MARKER_SIZE.rec))).toEqual([]);
  });

  it('never moves the seed when there are no bounds', () => {
    const rand = lcg(5);
    for (let t = 0; t < 100; t++) {
      const anchors = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300 + rand() * 80, y: 300 + rand() * 80 }));
      const out = layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec);
      expect([out[0].x, out[0].y]).toEqual([anchors[0].x, anchors[0].y]);
    }
  });

  it('lays out a seed alone and a seed with one recommendation', () => {
    expect(layoutMarkers([{ id: 4, x: 50, y: 60 }], 64, 46).map((m) => [m.x, m.y])).toEqual([[50, 60]]);
    const two = layoutMarkers([{ id: 0, x: 100, y: 100 }, { id: 1, x: 104, y: 100 }], 64, 46);
    expect(two.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y))).toBe(true);
    expect(findings(two)).toEqual([]);
  });

  it('fans out recommendations that all sit on one side of the seed', () => {
    for (const n of [5, 10]) {
      const rand = lcg(99 + n);
      for (let t = 0; t < 200; t++) {
        const anchors = [{ id: 0, x: 300, y: 300 }, ...Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 420 + rand() * 300, y: 300 + (rand() - 0.5) * 30 }))];
        expect(findings(layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec)), `${n} recs, round ${t}`).toEqual([]);
      }
    }
    const row = [{ id: 0, x: 300, y: 300 }, ...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, x: 420 + 40 * i, y: 300 }))];
    expect(findings(layoutMarkers(row, MARKER_SIZE.seed, MARKER_SIZE.rec))).toEqual([]);
  });

  it('takes a shorter minimum line for small markers', () => {
    const pile = Array.from({ length: 6 }, (_, i) => ({ id: i, x: 195, y: 86 }));
    const loose = layoutMarkers(pile, 38, 28, { gap: 8 });
    const tight = layoutMarkers(pile, 38, 28, { gap: 8, minLine: 10 });
    const reach = (items: MarkerItem[]) => Math.max(...items.map((m) => Math.hypot(m.x - items[0].x, m.y - items[0].y)));
    expect(reach(tight)).toBeLessThan(reach(loose));
  });
});

describe('MarkerLayout (layoutMarkers for every drawn frame, steady from frame to frame)', () => {
  const bounds: MarkerBounds = { left: 8, top: 8, right: 382, bottom: 671 };
  type A = { id: number; x: number; y: number };
  const cluster = (rand: () => number, x: number, y: number, n = 10, spread = 160): A[] =>
    Array.from({ length: n + 1 }, (_, i) => ({ id: 100 + i, x: x + (i ? (rand() - 0.5) * spread : 0), y: y + (i ? (rand() - 0.5) * spread : 0) }));
  const moved = (anchors: A[], dx: number, dy: number) => anchors.map((a) => ({ id: a.id, x: a.x + dx, y: a.y + dy }));
  /** The albums spread out (f > 1) or drawn in (f < 1) about the seed, as a zoom or a morph moves them. */
  const zoomed = (anchors: A[], f: number) => anchors.map((a) => ({ id: a.id, x: anchors[0].x + (a.x - anchors[0].x) * f, y: anchors[0].y + (a.y - anchors[0].y) * f }));
  /** Largest distance between two layouts of the same markers, in px, over every field a caller reads. */
  const gapTo = (a: readonly MarkerItem[], b: readonly MarkerItem[]) => {
    expect(a.map((m) => [m.id, m.rank, m.size, m.seed])).toEqual(b.map((m) => [m.id, m.rank, m.size, m.seed]));
    return Math.max(...a.map((m, i) => Math.max(Math.abs(m.x - b[i].x), Math.abs(m.y - b[i].y), Math.abs(m.ax - b[i].ax), Math.abs(m.ay - b[i].ay))));
  };
  const offsets = (items: readonly MarkerItem[]) => items.map((m) => [m.x - items[0].x, m.y - items[0].y]);

  it('opens an album exactly as layoutMarkers lays it out, the same every time', () => {
    const rand = lcg(3);
    for (let t = 0; t < 50; t++) {
      const a = cluster(rand, 195, 340);
      const one = new MarkerLayout().layout(a, 64, 46, { bounds, moving: true });
      expect(one).toEqual(layoutMarkers(a, 64, 46, { bounds }));
      expect(new MarkerLayout().layout(a, 64, 46, { bounds })).toEqual(one);
    }
  });

  it('does no work and returns the same array when nothing moved (a hover redraw, a gas fade frame)', () => {
    const cache = new MarkerLayout();
    const a = cluster(lcg(4), 195, 340);
    const first = cache.layout(a, 64, 46, { bounds });
    const objects = [...first];
    const copy = first.map((m) => ({ ...m }));
    const version = cache.version;
    const again = cache.layout(a.map((p) => ({ ...p })), 64, 46, { bounds: { ...bounds } });
    expect(again).toBe(first);
    expect(again).toEqual(copy);
    expect(again.every((m, i) => m === objects[i])).toBe(true);
    expect(cache.version).toBe(version);
    expect(cache.stats).toEqual({ solves: 1, settles: 0, moves: 0, rides: 0, unchanged: 1 });
  });

  it('moves the layout exactly and in place with a pan that meets no wall, and solves the view afresh at rest', () => {
    const rand = lcg(5);
    let eased = 0;
    for (let t = 0; t < 100; t++) {
      const cache = new MarkerLayout();
      let a = cluster(rand, 600, 400, 10, 60 + rand() * 300);
      let prev = cache.layout(a, 64, 46).map((m) => ({ ...m }));
      const array = cache.layout(a, 64, 46);
      const objects = [...array];
      for (let f = 0; f < 20; f++) {
        const dx = (rand() - 0.5) * 40;
        const dy = (rand() - 0.5) * 40;
        a = moved(a, dx, dy);
        const out = cache.layout(a, 64, 46, { moving: true });
        // In place: the same array and the same marker objects, nothing new.
        expect(out).toBe(array);
        expect(out.every((m, i) => m === objects[i])).toBe(true);
        out.forEach((m, i) => {
          expect(m.x - prev[i].x).toBeCloseTo(dx, 9);
          expect(m.y - prev[i].y).toBeCloseTo(dy, 9);
        });
        expect(cache.settledFrom).toBeNull();
        prev = out.map((m) => ({ ...m }));
      }
      expect(cache.stats).toMatchObject({ solves: 1, moves: 20, rides: 0, settles: 0 });
      expect(cache.unsettled).toBe(true);
      // pointerup: the same view at rest is solved afresh, so a view always rests on the same layout.
      const rest = cache.layout(a, 64, 46);
      expect(gapTo(rest, layoutMarkers(a, 64, 46))).toBe(0);
      expect(cache.unsettled).toBe(false);
      if (cache.settledFrom) eased++;
    }
    // A fresh solve can land elsewhere on rounding noise alone; that is rare, and then the covers ease over.
    expect(eased).toBeLessThan(5);
  });

  it('carries the group rigidly with the seed through a zoom or a morph, inside the bounds with no overlap', () => {
    const rand = lcg(6);
    for (let t = 0; t < 100; t++) {
      const cache = new MarkerLayout();
      const a0 = cluster(rand, 195, 340, 10, 60 + rand() * 300);
      const opened = offsets(cache.layout(a0, 64, 46, { bounds }));
      const grow = rand() < 0.5 ? 2.5 : 0.4;
      for (let f = 1; f <= 30; f++) {
        const a = moved(zoomed(a0, grow ** (f / 30)), f * 2, -f);
        const out = cache.layout(a, 64, 46, { bounds, moving: true });
        expect(outside([...out], bounds), `round ${t}, frame ${f}`).toBe(0);
        expect(overlaps([...out]), `round ${t}, frame ${f}`).toBe(0);
        expect(out.map((m) => [m.ax, m.ay])).toEqual(a.map((p) => [p.x, p.y]));
        expect(cache.settledFrom).toBeNull();
        // Rigid: where no wall holds a marker, every cover keeps its offset from the seed's cover.
        if (cache.stats.rides === f && opened.length) {
          const now = offsets(out);
          const free = now.every((o, i) => Math.abs(o[0] - opened[i][0]) < 1e-6 && Math.abs(o[1] - opened[i][1]) < 1e-6);
          const touches = out.some((m) => m.x - m.size / 2 <= bounds.left + 1e-6 || m.x + m.size / 2 >= bounds.right - 1e-6 || m.y - m.size / 2 <= bounds.top + 1e-6 || m.y + m.size / 2 >= bounds.bottom - 1e-6);
          expect(free || touches, `round ${t}, frame ${f}`).toBe(true);
        }
      }
      expect(cache.stats.solves).toBe(1);
      expect(cache.unsettled).toBe(true);
    }
  });

  it('settles on the fresh layout of the view at rest, from where the group was carried, once', () => {
    const rand = lcg(7);
    for (let t = 0; t < 100; t++) {
      const cache = new MarkerLayout();
      const a0 = cluster(rand, 195, 340, 10, 60 + rand() * 300);
      cache.layout(a0, 64, 46, { bounds });
      let a = a0;
      for (let f = 1; f <= 10; f++) cache.layout((a = zoomed(a0, 1 + f / 10)), 64, 46, { bounds, moving: true });
      const carried = cache.layout(a, 64, 46, { bounds, moving: true }).map((m) => [m.x, m.y]);
      // The motion has ended (the flags cleared, or pointerup): the same view, not moving.
      const rest = cache.layout(a, 64, 46, { bounds });
      expect(gapTo(rest, layoutMarkers(a, 64, 46, { bounds }))).toBe(0);
      // The driver eases from where the covers were carried; a settle that moves none 0.5 px needs no ease.
      if (cache.settledFrom) expect(Array.from(cache.settledFrom)).toEqual(carried.flat());
      else expect(Math.max(...rest.map((m, i) => Math.max(Math.abs(m.x - carried[i][0]), Math.abs(m.y - carried[i][1]))))).toBeLessThan(0.5);
      expect(cache.unsettled).toBe(false);
      expect(cache.stats.settles).toBe(1);
      expect(cache.layout(a, 64, 46, { bounds })).toBe(rest);
      expect(cache.settledFrom).toBeNull();
    }
  });

  it('settles straight away when a frame at rest changes the view (a keyboard pan into a wall)', () => {
    const cache = new MarkerLayout();
    const pile = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 200 + (i % 3), y: 300 + (i % 2) }));
    const narrow = { left: 0, top: 0, right: 220, bottom: 800 };
    cache.layout(pile, 64, 46, { bounds: narrow });
    const panned = moved(pile, -150, 0);
    const out = cache.layout(panned, 64, 46, { bounds: narrow });
    expect(gapTo(out, layoutMarkers(panned, 64, 46, { bounds: narrow }))).toBe(0);
    expect(cache.settledFrom).not.toBeNull();
    expect(cache.stats).toMatchObject({ solves: 1, settles: 1 });
  });

  it('holds a group larger than the bounds at the walls with a plain box separation while a drag goes on', () => {
    const rand = lcg(8);
    for (let t = 0; t < 50; t++) {
      const cache = new MarkerLayout();
      let a = cluster(rand, 195, 340, 10, 500);
      cache.layout(a, 64, 46, { bounds });
      for (let f = 0; f < 30; f++) {
        a = moved(a, 6, 3);
        const out = cache.layout(a, 64, 46, { bounds, moving: true });
        expect(outside([...out], bounds)).toBe(0);
        expect(overlaps([...out])).toBe(0);
      }
      // Settled, or (when no wall held it) moved exactly: a fresh layout up to the projection's rounding.
      const rest = cache.layout(a, 64, 46, { bounds });
      expect(gapTo(rest, layoutMarkers(a, 64, 46, { bounds }))).toBeLessThan(1e-9);
      expect(cache.unsettled).toBe(false);
    }
  });

  it('opens on the layout of the camera tween\'s target view and carries it there, so the settle moves nothing', () => {
    const rand = lcg(10);
    let eased = 0;
    for (let t = 0; t < 100; t++) {
      const cache = new MarkerLayout();
      // The view the framing tween lands on, and the view it starts from (zoomed out 2.5 times, elsewhere).
      const target = cluster(rand, 195, 340, 10, 120 + rand() * 300);
      const start = moved(zoomed(target, 0.4), -60, 40);
      const first = cache.layout(start, 64, 46, { bounds, moving: true, target: { anchors: target, bounds } });
      expect(first.map((m) => [m.ax, m.ay])).toEqual(start.map((p) => [p.x, p.y]));
      expect(cache.stats.solves).toBe(1);
      for (let f = 1; f <= 20; f++) {
        const k = f / 20;
        const a = start.map((p, i) => ({ id: p.id, x: p.x + (target[i].x - p.x) * k, y: p.y + (target[i].y - p.y) * k }));
        const out = cache.layout(a, 64, 46, { bounds, moving: true });
        expect(outside([...out], bounds)).toBe(0);
        expect(overlaps([...out])).toBe(0);
      }
      // Landed: carried onto the target, it is already the target view's fresh layout.
      const landed = cache.layout(target, 64, 46, { bounds, moving: true }).map((m) => ({ ...m }));
      expect(gapTo(landed, layoutMarkers(target, 64, 46, { bounds }))).toBeLessThan(1e-9);
      const rest = cache.layout(target, 64, 46, { bounds });
      expect(gapTo(rest, landed)).toBeLessThan(1e-9);
      if (cache.settledFrom) eased++;
    }
    expect(eased).toBe(0);
  });

  it('solves for a new target when the tween is sent elsewhere, and still lands with nothing to settle', () => {
    const cache = new MarkerLayout();
    const rand = lcg(11);
    const t1 = cluster(rand, 195, 340, 10, 200);
    const t2 = moved(zoomed(t1, 1.4), 30, -20);
    const start = zoomed(t1, 0.5);
    cache.layout(start, 64, 46, { bounds, moving: true, target: { anchors: t1, bounds } });
    cache.layout(zoomed(t1, 0.7), 64, 46, { bounds, moving: true, target: { anchors: t2, bounds } });
    expect(cache.stats.solves).toBe(2);
    cache.layout(t2, 64, 46, { bounds, moving: true });
    const rest = cache.layout(t2, 64, 46, { bounds });
    expect(gapTo(rest, layoutMarkers(t2, 64, 46, { bounds }))).toBeLessThan(1e-9);
    expect(cache.settledFrom).toBeNull();
  });

  it('keeps a group pressed into a corner steady: no cover jumps more than 30 px beyond its album between frames', () => {
    const rand = lcg(12);
    const jump = (prev: { x: number; y: number; ax: number; ay: number }[], cur: readonly MarkerItem[]) =>
      Math.max(...cur.map((m, i) => Math.hypot(m.x - prev[i].x - (m.ax - prev[i].ax), m.y - prev[i].y - (m.ay - prev[i].ay))));
    let worst = 0;
    for (let t = 0; t < 60; t++) {
      const cache = new MarkerLayout();
      let a = cluster(rand, 195, 340, 10, 250 + rand() * 350);
      let prev = cache.layout(a, 64, 46, { bounds }).map((m) => ({ ...m }));
      const dx = 8 * (rand() < 0.5 ? 1 : -1) * 0.894;
      const dy = 8 * (rand() < 0.5 ? 1 : -1) * 0.447;
      for (let f = 0; f < 60; f++) {
        a = moved(a, dx, dy);
        const out = cache.layout(a, 64, 46, { bounds, moving: true });
        expect(outside([...out], bounds), `round ${t}, frame ${f}`).toBe(0);
        expect(overlaps([...out]), `round ${t}, frame ${f}`).toBe(0);
        worst = Math.max(worst, jump(prev, out));
        prev = out.map((m) => ({ ...m }));
      }
    }
    expect(worst).toBeLessThanOrEqual(30);
  });

  describe('in bounds too small for a clean layout (a phone held sideways is about 828x209 above the slider)', () => {
    const CROWDED: [number, number][] = [[150, 150], [250, 200], [828, 209], [360, 684], [300, 500]];
    const FRAMES = 300;
    const box = (w: number, h: number): MarkerBounds => ({ left: 8, top: 8, right: 8 + w, bottom: 8 + h });
    /** Eleven albums about the middle of the bounds, and a pan of them: out for 150 frames, most of the way back. */
    const pan = (rand: () => number, b: MarkerBounds): A[][] => {
      const w = b.right - b.left;
      const h = b.bottom - b.top;
      const start = cluster(rand, b.left + w / 2, b.top + h / 2, 10, Math.min(w, h) * 0.9);
      const angle = Math.PI * 2 * rand();
      return Array.from({ length: FRAMES + 1 }, (_, f) => {
        const d = f <= FRAMES / 2 ? 2.5 * f : 1.25 * FRAMES - 2 * (f - FRAMES / 2);
        return moved(start, Math.cos(angle) * d, Math.sin(angle) * d);
      });
    };

    it.each(CROWDED)('never solves afresh and makes no new array on the %i x %i frames of a pan', (w, h) => {
      const b = box(w, h);
      const rand = lcg(4100 + w);
      for (let t = 0; t < 20; t++) {
        const frames = pan(rand, b);
        const cache = new MarkerLayout();
        const array = cache.layout(frames[0], 64, 46, { bounds: b, moving: true });
        const objects = [...array];
        for (let f = 1; f <= FRAMES; f++) {
          const out = cache.layout(frames[f], 64, 46, { bounds: b, moving: true });
          // In place: the array and the marker objects of the album's opening, on every frame.
          expect(out, `round ${t}, frame ${f}`).toBe(array);
          expect(out.every((m, i) => m === objects[i]), `round ${t}, frame ${f}`).toBe(true);
          expect(outside([...out], b), `round ${t}, frame ${f}`).toBe(0);
          expect(out.map((m) => [m.ax, m.ay])).toEqual(frames[f].map((p) => [p.x, p.y]));
          expect(cache.settledFrom).toBeNull();
        }
        // The opening is the only solve of the whole motion.
        expect(cache.stats, `round ${t}`).toMatchObject({ solves: 1, settles: 0 });
        expect(cache.stats.moves + cache.stats.rides).toBe(FRAMES);
        expect(cache.unsettled).toBe(true);
      }
    });

    it.each(CROWDED)('settles %i x %i once at the end of the pan, on the layout a cold solve gives', (w, h) => {
      const b = box(w, h);
      const rand = lcg(4100 + w);
      for (let t = 0; t < 20; t++) {
        const frames = pan(rand, b);
        const cache = new MarkerLayout();
        for (const a of frames) cache.layout(a, 64, 46, { bounds: b, moving: true });
        const carried = cache.layout(frames[FRAMES], 64, 46, { bounds: b, moving: true }).map((m) => [m.x, m.y]);
        const rest = cache.layout(frames[FRAMES], 64, 46, { bounds: b });
        expect(cache.stats, `round ${t}`).toMatchObject({ solves: 1, settles: 1 });
        expect(gapTo(rest, layoutMarkers(frames[FRAMES], 64, 46, { bounds: b }))).toBe(0);
        expect(gapTo(rest, new MarkerLayout().layout(frames[FRAMES], 64, 46, { bounds: b }))).toBe(0);
        if (cache.settledFrom) expect(Array.from(cache.settledFrom)).toEqual(carried.flat());
        else expect(Math.max(...rest.map((m, i) => Math.max(Math.abs(m.x - carried[i][0]), Math.abs(m.y - carried[i][1]))))).toBeLessThan(0.5);
        expect(cache.unsettled).toBe(false);
        // Settled: a redraw of the same view does nothing more.
        expect(cache.layout(frames[FRAMES], 64, 46, { bounds: b })).toBe(rest);
        expect(cache.stats).toMatchObject({ solves: 1, settles: 1 });
      }
    });

    it('carries a layout with overlaps as one rigid body, stopped at the walls and never squeezed', () => {
      for (const [w, h] of CROWDED) {
        const b = box(w, h);
        const rand = lcg(4100 + w);
        let crowded = 0;
        for (let t = 0; t < 20; t++) {
          const frames = pan(rand, b);
          const cache = new MarkerLayout();
          const opened = cache.layout(frames[0], 64, 46, { bounds: b, moving: true });
          // The shape (every cover's offset from the seed's) of the opening when it has an overlap, or else of
          // the first frame that shows one: the box separation has failed, and no later frame of the motion may
          // change the shape.
          let shape = overlaps([...opened]) ? offsets(opened) : null;
          const fromOpening = !!shape;
          for (let f = 1; f <= FRAMES; f++) {
            const out = cache.layout(frames[f], 64, 46, { bounds: b, moving: true });
            const now = offsets(out);
            if (shape) expect(Math.max(...now.map((o, i) => Math.max(Math.abs(o[0] - shape![i][0]), Math.abs(o[1] - shape![i][1])))), `${w}x${h}, round ${t}, frame ${f}`).toBeLessThan(1e-6);
            else if (overlaps([...out])) shape = now;
          }
          if (shape) crowded++;
          // An opening with no overlap never gains one on the way: its group fits, and is shifted as a whole.
          if (!fromOpening) expect(shape, `${w}x${h}, round ${t}`).toBeNull();
        }
        // Snapshots of what the solver does with these clusters today, not a requirement: a solver that finds
        // room in more of them changes the three counts, and they should then be updated, not defended.
        if (w === 150 || w === 250) expect(crowded).toBe(20);
        if (w === 828) expect(crowded).toBe(13);
        if (w === 360) expect(crowded).toBe(0);
      }
    });

    it('tries the box separation once when walls close in on a clean layout, then carries what it left', () => {
      const rand = lcg(31);
      for (let t = 0; t < 20; t++) {
        // Opened with no walls (a clean layout, wider than 150 px), then carried between walls it cannot fit.
        const b = box(150, 150);
        const frames = pan(rand, b);
        const cache = new MarkerLayout();
        const array = cache.layout(frames[0], 64, 46, { moving: true });
        expect(overlaps([...array])).toBe(0);
        const first = cache.layout(frames[1], 64, 46, { bounds: b, moving: true });
        expect(first).toBe(array);
        expect(outside([...first], b)).toBe(0);
        expect(overlaps([...first]), `round ${t}`).toBeGreaterThan(0);
        const shape = offsets(first);
        for (let f = 2; f <= FRAMES; f++) {
          const out = cache.layout(frames[f], 64, 46, { bounds: b, moving: true });
          expect(out).toBe(array);
          expect(outside([...out], b), `round ${t}, frame ${f}`).toBe(0);
          expect(Math.max(...offsets(out).map((o, i) => Math.max(Math.abs(o[0] - shape[i][0]), Math.abs(o[1] - shape[i][1])))), `round ${t}, frame ${f}`).toBeLessThan(1e-6);
        }
        expect(cache.stats).toMatchObject({ solves: 1, settles: 0 });
        const rest = cache.layout(frames[FRAMES], 64, 46, { bounds: b });
        expect(gapTo(rest, layoutMarkers(frames[FRAMES], 64, 46, { bounds: b }))).toBe(0);
        expect(cache.stats).toMatchObject({ solves: 1, settles: 1 });
      }
    });

    it('settles at once, with an ease, when a frame at rest changes a crowded view (a keyboard pan)', () => {
      const b = box(150, 150);
      const frames = pan(lcg(77), b);
      const cache = new MarkerLayout();
      cache.layout(frames[0], 64, 46, { bounds: b });
      const out = cache.layout(frames[40], 64, 46, { bounds: b });
      expect(gapTo(out, layoutMarkers(frames[40], 64, 46, { bounds: b }))).toBe(0);
      expect(cache.stats).toMatchObject({ solves: 1, settles: 1 });
      // The ease starts from where the group was carried: what a moving frame of the same view shows, in the walls.
      const twin = new MarkerLayout();
      twin.layout(frames[0], 64, 46, { bounds: b });
      const carried = twin.layout(frames[40], 64, 46, { bounds: b, moving: true });
      expect(outside([...carried], b)).toBe(0);
      expect(cache.settledFrom).not.toBeNull();
      expect(Array.from(cache.settledFrom!)).toEqual(carried.flatMap((m) => [m.x, m.y]));
      expect(cache.unsettled).toBe(false);
    });

    /** How far another cover lies over the seed's (px along the axis of least overlap; 0 when none does). */
    const overSeed = (items: readonly MarkerItem[]) =>
      Math.max(0, ...items.slice(1).map((m) => Math.min((m.size + items[0].size) / 2 - Math.abs(m.x - items[0].x), (m.size + items[0].size) / 2 - Math.abs(m.y - items[0].y))));

    it('makes room again when the walls move under a crowded group: no cover is pressed flat over the picked one', () => {
      // The album panel or the slider cover sliding: a layout that opens clean at 828x400, the bottom wall rising
      // 4 px a frame to 209 and coming back, every frame moving.
      const rand = lcg(977);
      let clusters = 0;
      let deepest = 0;
      let covered = 0;
      for (let t = 0; t < 60; t++) {
        const b = box(828, 400);
        const a = cluster(rand, 8 + 414, 8 + 200, 10, 360);
        if (overlaps(layoutMarkers(a, 64, 46, { bounds: b })) > 0) continue;
        clusters++;
        const cache = new MarkerLayout();
        const array = cache.layout(a, 64, 46, { bounds: b, moving: true });
        for (let f = 1; f <= 96; f++) {
          b.bottom = 8 + Math.max(209, f <= 48 ? 400 - 4 * f : 209 + 4 * (f - 48));
          const out = cache.layout(a, 64, 46, { bounds: b, moving: true });
          expect(out, `round ${t}, frame ${f}`).toBe(array);
          expect(outside([...out], b), `round ${t}, frame ${f}`).toBe(0);
          const d = overSeed(out);
          deepest = Math.max(deepest, d);
          if (d > 0.01) covered++;
        }
        expect(cache.stats, `round ${t}`).toMatchObject({ solves: 1, settles: 0 });
        const rest = cache.layout(a, 64, 46, { bounds: b });
        expect(gapTo(rest, layoutMarkers(a, 64, 46, { bounds: b }))).toBe(0);
      }
      expect(clusters).toBe(60);
      // The separation runs again on every frame where the walls moved. What is left is where it has no room at
      // all: today 55 of the 5,760 frames, 18.8 px at the deepest. Holding the group rigid through moving walls
      // gave 890 frames and 46 px, a whole cover. The caps: under half a cover, on under 2% of the frames.
      expect(deepest).toBeLessThan(MARKER_SIZE.rec / 2);
      expect(covered).toBeLessThan(0.02 * 60 * 96);
    });

    it('carries a crowded group rigidly through a zoom or a pinch, with no solve', () => {
      const b = box(150, 150);
      const rand = lcg(53);
      for (let t = 0; t < 20; t++) {
        const a0 = cluster(rand, 83, 83, 10, 135);
        const cache = new MarkerLayout();
        const array = cache.layout(a0, 64, 46, { bounds: b, moving: true });
        expect(overlaps([...array])).toBeGreaterThan(0);
        const shape = offsets(array);
        const grow = t % 2 ? 2.5 : 0.4;
        for (let f = 1; f <= 30; f++) {
          const out = cache.layout(moved(zoomed(a0, grow ** (f / 30)), f, -f / 2), 64, 46, { bounds: b, moving: true });
          expect(out).toBe(array);
          expect(outside([...out], b), `round ${t}, frame ${f}`).toBe(0);
          expect(Math.max(...offsets(out).map((o, i) => Math.max(Math.abs(o[0] - shape[i][0]), Math.abs(o[1] - shape[i][1])))), `round ${t}, frame ${f}`).toBeLessThan(1e-6);
        }
        expect(cache.stats).toMatchObject({ solves: 1, settles: 0, rides: 30 });
      }
    });

    it('opens an album into crowded bounds on the layout of the tween target, and lands with nothing to settle', () => {
      const b = box(150, 150);
      const rand = lcg(59);
      for (let t = 0; t < 20; t++) {
        const target = cluster(rand, 83, 83, 10, 135);
        const start = moved(zoomed(target, 0.4), -30, 20);
        const cache = new MarkerLayout();
        const array = cache.layout(start, 64, 46, { bounds: b, moving: true, target: { anchors: target, bounds: b } });
        for (let f = 1; f <= 20; f++) {
          const k = f / 20;
          const out = cache.layout(start.map((p, i) => ({ id: p.id, x: p.x + (target[i].x - p.x) * k, y: p.y + (target[i].y - p.y) * k })), 64, 46, { bounds: b, moving: true });
          expect(out).toBe(array);
          expect(outside([...out], b), `round ${t}, frame ${f}`).toBe(0);
        }
        const landed = cache.layout(target, 64, 46, { bounds: b, moving: true }).map((m) => ({ ...m }));
        expect(gapTo(landed, layoutMarkers(target, 64, 46, { bounds: b }))).toBeLessThan(1e-9);
        expect(overlaps(landed)).toBeGreaterThan(0);
        const rest = cache.layout(target, 64, 46, { bounds: b });
        expect(gapTo(rest, landed)).toBeLessThan(1e-9);
        expect(cache.settledFrom).toBeNull();
        expect(cache.stats).toMatchObject({ solves: 1, settles: 0 });
      }
    });

    it('is as any other layout again once it has settled in bounds with room', () => {
      const tight = box(150, 150);
      const rand = lcg(61);
      for (let t = 0; t < 20; t++) {
        const frames = pan(rand, tight);
        const cache = new MarkerLayout();
        for (let f = 0; f <= 40; f++) cache.layout(frames[f], 64, 46, { bounds: tight, moving: true });
        // At rest in a window that has grown: settled, as a new layout opens that view.
        const fresh = new MarkerLayout();
        const a = moved(frames[40], 110, 250);
        expect(gapTo(cache.layout(a, 64, 46, { bounds }), fresh.layout(a, 64, 46, { bounds }))).toBe(0);
        for (let f = 1; f <= 60; f++) {
          const next = moved(a, 6 * f, 3 * f);
          const one = cache.layout(next, 64, 46, { bounds, moving: true });
          const two = fresh.layout(next, 64, 46, { bounds, moving: true });
          expect(gapTo(one, two), `round ${t}, frame ${f}`).toBe(0);
          expect(overlaps([...one]), `round ${t}, frame ${f}`).toBe(0);
        }
      }
    });
  });

  it('solves again for other albums, sizes, gap or minimum line', () => {
    const cache = new MarkerLayout();
    const a = cluster(lcg(9), 300, 300, 5);
    cache.layout(a, 64, 46);
    cache.layout(a.map((p, i) => (i === 4 ? { ...p, id: 999 } : p)), 64, 46, { moving: true });
    cache.layout(a.slice(0, 5), 64, 46);
    cache.layout(a.slice(0, 5), 38, 28);
    cache.layout(a.slice(0, 5), 38, 28, { gap: 6 });
    expect(cache.layout(a.slice(0, 5), 38, 28, { gap: 6, minLine: 10 })).toEqual(layoutMarkers(a.slice(0, 5), 38, 28, { gap: 6, minLine: 10 }));
    expect(cache.stats.solves).toBe(6);
  });

  it('lays out nothing and a seed alone', () => {
    const cache = new MarkerLayout();
    expect(cache.layout([], 64, 46)).toEqual([]);
    expect(cache.layout([{ id: 1, x: 5, y: 6 }], 64, 46).map((m) => [m.x, m.y])).toEqual([[5, 6]]);
    expect(cache.layout([{ id: 1, x: 15, y: 6 }], 64, 46, { moving: true }).map((m) => [m.x, m.y, m.ax])).toEqual([[15, 6, 15]]);
  });
});

describe('ringRadius', () => {
  it('is 77 px for a few recommendations and grows so that ten fit', () => {
    expect(ringRadius(5, 64, 46)).toBe(77);
    expect(ringRadius(10, 64, 46)).toBeCloseTo((10 * 62) / (2 * Math.PI), 6);
  });
});

describe('focusCamera', () => {
  const W = 1440;
  const H = 900;
  const pad = { top: 262, right: 96, bottom: 90, left: 96 };
  const noClamp = (z: number) => z;
  const pxPerWorld = (zoom: number) => (H * zoom) / (2 * FRUSTUM_HALF_HEIGHT);

  /** Screen px of world points for a camera centred on the visible area right of `inset`. */
  function project(cam: { x: number; y: number; zoom: number }, inset: number, pos: Float32Array, ids: number[]) {
    const k = pxPerWorld(cam.zoom);
    const cx = inset + (W - inset) / 2;
    return ids.map((id) => ({ id, x: cx + (pos[2 * id] - cam.x) * k, y: H / 2 - (pos[2 * id + 1] - cam.y) * k }));
  }

  it('frames spread albums inside the padded area right of the inset', () => {
    const pos = new Float32Array([0, 0, 0.3, 0.1, -0.2, 0.25, 0.1, -0.3]);
    const ids = [0, 1, 2, 3];
    const inset = 648;
    const cam = focusCamera(ids, pos, W, H, inset, 0, pad, noClamp);
    const markers = layoutMarkers(project(cam, inset, pos, ids), MARKER_SIZE.seed, MARKER_SIZE.rec);
    for (const m of markers) {
      expect(m.x - m.size / 2).toBeGreaterThanOrEqual(inset + pad.left - 0.5);
      expect(m.x + m.size / 2).toBeLessThanOrEqual(W - pad.right + 0.5);
      expect(m.y - m.size / 2).toBeGreaterThanOrEqual(pad.top - 0.5);
      expect(m.y + m.size / 2).toBeLessThanOrEqual(H - pad.bottom + 0.5);
    }
  });

  it('zooms out so a tight cluster pushed onto the ring still fits', () => {
    // Ten recommendations almost on the seed, which sits at the edge of the group.
    const pos = new Float32Array(22);
    for (let i = 1; i <= 10; i++) {
      pos[2 * i] = 0.001 * i;
      pos[2 * i + 1] = 0.0005 * (i % 3);
    }
    const ids = Array.from({ length: 11 }, (_, i) => i);
    const small = { top: 20, right: 20, bottom: 20, left: 20 };
    const cam = focusCamera(ids, pos, 390, 400, 0, 0, small, noClamp);
    const k = (400 * cam.zoom) / (2 * FRUSTUM_HALF_HEIGHT);
    const anchors = ids.map((id) => ({ id, x: 195 + (pos[2 * id] - cam.x) * k, y: 200 - (pos[2 * id + 1] - cam.y) * k }));
    const markers = layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec);
    for (const m of markers) {
      expect(m.x - m.size / 2).toBeGreaterThanOrEqual(small.left - 2);
      expect(m.x + m.size / 2).toBeLessThanOrEqual(390 - small.right + 2);
      expect(m.y - m.size / 2).toBeGreaterThanOrEqual(small.top - 2);
      expect(m.y + m.size / 2).toBeLessThanOrEqual(400 - small.bottom + 2);
    }
  });

  it('passes the zoom through the clamp', () => {
    const pos = new Float32Array([0, 0, 0.3, 0.1]);
    expect(focusCamera([0, 1], pos, W, H, 0, 0, pad, () => 1.5).zoom).toBe(1.5);
  });

  it('frames below a top inset exactly as on a canvas that starts under the header', () => {
    const pos = new Float32Array([0, 0, 0.3, 0.1, -0.2, 0.25, 0.1, -0.3]);
    const ids = [0, 1, 2, 3];
    // The desktop header (64 px) and the phone's (60 px).
    for (const TOP of [64, 60]) {
      const before = focusCamera(ids, pos, W, H - TOP, 648, 0, pad, noClamp);
      const after = focusCamera(ids, pos, W, H, 648, TOP, pad, noClamp);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
      // The same px per world unit: zoom times canvas height.
      expect(after.zoom * H).toBeCloseTo(before.zoom * (H - TOP), 6);
    }
  });
});

describe('markerAt', () => {
  const placed = [
    { id: 11, rank: 0, ax: 100, ay: 100, x: 100, y: 100, size: 64, seed: true, drawn: 64 },
    { id: 4, rank: 1, ax: 200, ay: 100, x: 200, y: 100, size: 46, seed: false, drawn: 46 },
    { id: 9, rank: 2, ax: 100, ay: 220, x: 100, y: 220, size: 46, seed: false, drawn: 46 * 1.16 },
  ];

  it('finds the marker under a point, with a few px of slack', () => {
    expect(markerAt(placed, 100, 100)).toBe(11);
    expect(markerAt(placed, 200 + 23 + 3, 100)).toBe(4);
    expect(markerAt(placed, 200 + 23 + 6, 100)).toBe(-1);
    expect(markerAt(placed, 150, 160)).toBe(-1);
  });

  it('uses the drawn (hot) size and a larger slack for touch', () => {
    expect(markerAt(placed, 100 + 26.68 + 3, 220)).toBe(9);
    expect(markerAt(placed, 200 + 23 + 7, 100)).toBe(-1);
    expect(markerAt(placed, 200 + 23 + 7, 100, 'touch')).toBe(4);
  });
});
