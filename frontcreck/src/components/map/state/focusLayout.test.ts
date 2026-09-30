import { describe, expect, it } from 'vitest';
import { MARKER_GAP, MARKER_SIZE, focusCamera, layoutMarkers, markerAt, ringRadius, type MarkerBounds, type MarkerItem } from './focusLayout';
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
    const cam = focusCamera(ids, pos, W, H, inset, pad, noClamp);
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
    const cam = focusCamera(ids, pos, 390, 400, 0, small, noClamp);
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
    expect(focusCamera([0, 1], pos, W, H, 0, pad, () => 1.5).zoom).toBe(1.5);
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
