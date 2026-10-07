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

  it('finds the rectangle that holds a stop\'s gas, padded and rounded outwards, inside the square', () => {
    const n = 64;
    const px = new Uint8Array(4 * n * n);
    // lit cells: columns 20 to 40, rows 10 to 50 (rows run from the south edge); blue alone counts, alpha does not
    for (let r = 10; r <= 50; r++) for (let c = 20; c <= 40; c++) px[4 * (r * n + c) + 2] = 1;
    px[4 * (60 * n + 60) + 3] = 255;
    const cell = 3.2 / n;
    const [x0, y0, x1, y1] = T.gasRect(px, n, 1.6);
    expect(T.GAS.RECT_PAD).toBe(0.06);
    expect(x0).toBeCloseTo(Math.floor((-1.6 + 20 * cell - 0.06) * 1000) / 1000, 9);
    expect(y0).toBeCloseTo(Math.floor((-1.6 + 10 * cell - 0.06) * 1000) / 1000, 9);
    expect(x1).toBeCloseTo(Math.ceil((-1.6 + 41 * cell + 0.06) * 1000) / 1000, 9);
    expect(y1).toBeCloseTo(Math.ceil((-1.6 + 51 * cell + 0.06) * 1000) / 1000, 9);
    // every lit cell lies inside with the padding to spare
    expect(x0).toBeLessThanOrEqual(-1.6 + 20 * cell - 0.06);
    expect(y1).toBeGreaterThanOrEqual(-1.6 + 51 * cell + 0.06);
    // gas up to the edge of the square: the rectangle stops at the square
    px[0] = 9;
    px[4 * (n * n - 1)] = 9;
    expect(T.gasRect(px, n, 1.6)).toEqual([-1.6, -1.6, 1.6, 1.6]);
    expect(() => T.gasRect(new Uint8Array(4 * n * n), n, 1.6)).toThrow(/no gas/);
  });

  it('sizes the two images of a rectangle: 2048 px on the longer side, and the prototype\'s texels per raw unit', () => {
    expect([T.GAS.BAKE, T.GAS.SHARP]).toEqual([2048, 4096]);
    const tall = T.gasSizes([-1.4, -1.5, 1.1, 1.5], 1.6);
    expect(tall.px).toEqual([Math.round((2.5 / 3) * 2048), 2048]);
    // 4096 px over the 3.2 raw units of the square is 1280 a unit
    expect(tall.sharp).toEqual([3200, 3840]);
    const wide = T.gasSizes([-1.5, -1, 1.5, 1], 1.6);
    expect(wide.px).toEqual([2048, Math.round((2 / 3) * 2048)]);
    expect(wide.sharp).toEqual([3840, 2560]);
    // the whole square is the prototype's own bake
    expect(T.gasSizes([-1.6, -1.6, 1.6, 1.6], 1.6)).toEqual({ px: [2048, 2048], sharp: [4096, 4096] });
    // texels stay square to within a px
    expect(tall.sharp[0] / 2.5).toBeCloseTo(tall.sharp[1] / 3, 6);
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
  });

  it('names a gas image after its own bytes, and lists every file a theme names', () => {
    expect(T.GAS_HASH_LEN).toBe(10);
    expect(T.gasHash('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe('0123456789');
    expect(T.gasFile('gas-mood', '0123456789')).toBe('gas-mood.0123456789.webp');
    expect(T.gasFile('gas-mood-sharp', 'abcdef0123')).toBe('gas-mood-sharp.abcdef0123.webp');
    const g = { hash: ['0123456789', 'abcdef0123'] };
    expect(T.gasFiles({ sonic: g, balanced: g, mood: g })).toEqual([
      'gas-sonic.0123456789.webp', 'gas-sonic-sharp.abcdef0123.webp',
      'gas-balanced.0123456789.webp', 'gas-balanced-sharp.abcdef0123.webp',
      'gas-mood.0123456789.webp', 'gas-mood-sharp.abcdef0123.webp',
    ]);
  });

  it('assembles theme.json from the luminance renders, the stars packed as text (one character and three bytes an album)', () => {
    const n = T.GAS.LUM;
    const px = new Uint8Array(4 * n * n);
    for (let i = 0; i < n * n; i++) px.set([60, 30, 15, 255], 4 * i);
    const input = {
      n: 2,
      positionsHash: 'a7c1dbd996fd',
      positions: { sonic: [0, 0, 1, 1], balanced: [0, 0, 1, 1], mood: [0, 0, 1, 1] },
      weights: [50, 20, 10, 10, 0, 10, 10, 10, 10, 10, 20, 40],
    };
    const gas = { sonic: { rect: [-1, -1, 1, 1], px: [2048, 2048], sharp: [2560, 2560], hash: ['0123456789', 'abcdef0123'] }, balanced: { rect: [-1, -1, 1, 1], px: [2048, 2048], sharp: [2560, 2560], hash: ['0123456789', 'abcdef0123'] }, mood: { rect: [-1, -1, 1, 1], px: [2048, 2048], sharp: [2560, 2560], hash: ['0123456789', 'abcdef0123'] } };
    const theme = T.assemble(input, { sonic: px, balanced: px, mood: px }, 1.6, 1.75, gas);
    const byte = Math.min(255, Math.round((T.luminance([60, 30, 15]) / 0.6) * 255));
    // no names and no regions: the map has none (2026-10-06)
    expect(theme).toEqual({
      v: 4,
      n: 2,
      positionsHash: 'a7c1dbd996fd',
      bakeHalf: 1.6,
      gas,
      stars: { lead: '0-', bg: Buffer.from([byte, byte, byte, byte, byte, byte]).toString('base64') },
    });
  });

  it('packs the stars so that they read back exactly: every family and none, every byte', () => {
    expect(T.packLead(Int8Array.from([-1, 0, 1, 2, 3, 4]))).toBe('-01234');
    const all = Uint8Array.from({ length: 70_000 }, (_, i) => i % 256);
    expect([...Buffer.from(T.packBytes(all), 'base64')]).toEqual([...all]);
    expect(T.packBytes(new Uint8Array(0))).toBe('');
  });
});
