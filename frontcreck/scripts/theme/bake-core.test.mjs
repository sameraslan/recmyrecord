import { describe, expect, it } from 'vitest';
import './bake-core.js';

const T = globalThis.RMR_THEME;

describe('bake-core (the DOM-free half of the theme build)', () => {
  it('builds the seeded noise table of the prototype', () => {
    const t = T.noiseTable();
    expect(t.length).toBe(65536);
    expect(Array.from(t.slice(0, 8))).toEqual([2, 15, 250, 178, 133, 103, 119, 61]);
    expect(t[65535]).toBe(213);
    expect(t.reduce((s, v) => s + v, 0)).toBe(8329196);
  });

  it('blurs without losing light away from the edges', () => {
    const n = 64;
    const d = new Float32Array(n * n);
    d[32 * n + 32] = 1;
    T.blur(d, n, n, 3);
    let sum = 0;
    for (const v of d) sum += v;
    expect(sum).toBeCloseTo(1, 4);
    expect(d[32 * n + 32]).toBeGreaterThan(d[32 * n + 36]);
    expect(d[32 * n + 36]).toBeCloseTo(d[36 * n + 32], 6);
  });

  it('leads a star with a family only over 0.3 and over the neutral share', () => {
    const w = [50, 20, 10, 10, 0, 10, 30, 30, 10, 10, 0, 20, 10, 10, 10, 10, 20, 40, 0, 0, 0, 0, 45, 40];
    expect(Array.from(T.leadFamilies(w, 4))).toEqual([0, -1, -1, 4]);
  });

  it('takes the bake and field squares from the layout extent', () => {
    const h = T.halves({ sonic: [0.2, -1], balanced: [0.5, 0.5], mood: [-0.7, 0.1] });
    expect(h.bakeHalf).toBeCloseTo(1.6, 10);
    expect(h.rawHalf).toBeCloseTo(1.75, 10);
  });

  it('packs density and colour weights into five float fields', () => {
    const fields = T.fieldData(new Float32Array([0, 0]), [0, 100, 0, 0, 0, 0], 1, 1.75);
    const n = T.GAS.GRID;
    expect(fields).toHaveLength(5);
    for (const f of fields) expect(f.length).toBe(4 * n * n);
    const centre = 4 * ((n / 2) * n + n / 2);
    const corner = 0;
    expect(fields[0][centre]).toBeGreaterThan(0.5); // fine density, normalised at the album
    expect(fields[0][corner]).toBe(0);
    expect(fields[1][centre + 1]).toBeGreaterThan(0); // local weight of family 1 (warm)
    expect(fields[1][centre]).toBe(0); // none of family 0
    expect(fields[2][centre + 2]).toBe(0); // no neutral share
  });

  it('mirrors the app transform: balanced median to 0, 5th to 95th percentile to 0.55', () => {
    const b = [];
    for (let i = 0; i < 100; i++) b.push((i % 10) * 0.1 + 0.3, Math.floor(i / 10) * 0.1 - 0.3);
    const tx = T.positionsTransform(b);
    expect(tx.cx).toBeCloseTo(0.7, 6);
    expect(tx.cy).toBeCloseTo(0.1, 6);
    expect(tx.s).toBeCloseTo(0.55 / 0.5, 6);
  });

  it('reads luminance from the grid in raw units, rows running south to north', () => {
    const n = T.GAS.LUM;
    expect(T.lumCell(-1.75, -1.75, 1.75)).toBe(0);
    expect(T.lumCell(1.75, 1.75, 1.75)).toBe(n * n - 1);
    expect(T.lumCell(1.75, -1.75, 1.75)).toBe(n - 1);
    expect(T.luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(T.luminance([0, 0, 0])).toBe(0);
    const lum = new Float32Array(n * n);
    lum[T.lumCell(0.1, 0.1, 1.75)] = 0.4;
    expect(T.lumIn(lum, 1.75, 0, 0, 0.2, 0.2)).toBeCloseTo(0.4, 6);
    expect(T.lumIn(lum, 1.75, -0.4, -0.4, -0.2, -0.2)).toBe(0);
  });

  it('sizes and inks a name as the prototype does', () => {
    expect(T.labelFontPx(true, 346)).toBeCloseTo(0.88 * 24, 6);
    expect(T.labelFontPx(false, 0)).toBeCloseTo(0.88 * 15, 6);
    const [hw, hh] = T.labelBox('Warm Halo', true, 346, 0.5);
    expect(hw).toBeCloseTo((0.47 * 0.88 * 24 * 9 + 30) / 600 / 0.5, 6);
    expect(hh).toBeCloseTo((0.525 * 0.88 * 24 + 28) / 600 / 0.5, 6);
    expect(T.labelInk([120, 60, 30])).toEqual([255, 230, 217]);
    expect(T.labelInk([0, 0, 0])).toEqual([204, 204, 204]);
  });

  it('assembles theme.json from the luminance renders', () => {
    const n = T.GAS.LUM;
    const px = new Uint8Array(4 * n * n);
    for (let i = 0; i < n * n; i++) px.set([60, 30, 15, 255], 4 * i);
    const region = { id: 'warm', name: 'Warm Halo', word: 'warm', strength: 'strong', level: 1, n: 106, priority: 2.3104, cx: 0.262, cy: 0.248, radius: 0.112 };
    const input = {
      n: 2,
      positionsHash: 'a7c1dbd996fd',
      positions: { sonic: [0, 0, 1, 1], balanced: [0, 0, 1, 1], mood: [0, 0, 1, 1] },
      weights: [50, 20, 10, 10, 0, 10, 10, 10, 10, 10, 20, 40],
      regions: { sonic: [], balanced: [region, { ...region, id: 'area', level: 0 }, { ...region, id: 'bare', name: null }], mood: [] },
    };
    const theme = T.assemble(input, { sonic: px, balanced: px, mood: px }, 1.6, 1.75);
    const byte = Math.min(255, Math.round((T.luminance([60, 30, 15]) / 0.6) * 255));
    expect(theme).toEqual({
      v: 1,
      n: 2,
      positionsHash: 'a7c1dbd996fd',
      bakeHalf: 1.6,
      stars: { lead: [0, -1], bg: [byte, byte, byte, byte, byte, byte] },
      labels: {
        sonic: [],
        balanced: [{ id: 'warm', name: 'Warm Halo', x: 0.262, y: 0.248, strong: true, n: 106, p: 2.3104, rgb: [255, 230, 217], lum: Math.round(T.luminance([60, 30, 15]) * 1000) / 1000 }],
        mood: [],
      },
    });
  });
});
