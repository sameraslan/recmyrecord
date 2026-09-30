import { describe, expect, it } from 'vitest';
import type { AlbumRecord, Positions } from '@/lib/types';
import { STOP_T, buildMapData, interpolateInto, interpolated, normalizePositions } from './data';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const album = (i: number): AlbumRecord => ({ slug: `a-${i}`, t: `A${i}`, a: 'X', s: '', c: '', k: i % 8, d: [], w: W });

function grid(n: number, scale: number, shift: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((i % 10) * scale + shift, Math.floor(i / 10) * scale - shift);
  return out;
}

describe('map data', () => {
  it('maps stops to slider positions', () => {
    expect(STOP_T).toEqual({ sonic: 0, balanced: 0.5, mood: 1 });
  });

  it('normalises all stops with the balanced transform (median to 0, p5..p95 to 0.55)', () => {
    const p: Positions = { sonic: grid(100, 0.02, 0.5), balanced: grid(100, 0.1, 0.3), mood: grid(100, 0.1, 0.3) };
    const out = normalizePositions(p);
    const xs = Array.from({ length: 100 }, (_, i) => out.balanced[2 * i]).sort((a, b) => a - b);
    expect(Math.abs(xs[49])).toBeLessThan(0.07);
    expect(Math.max(Math.abs(xs[5]), Math.abs(xs[94]))).toBeCloseTo(0.55, 1);
    expect(Array.from(out.mood)).toEqual(Array.from(out.balanced));
    expect(out.sonic[0]).not.toBe(out.balanced[0]);
  });

  it('interpolates piecewise between the three stops', () => {
    const data = buildMapData([album(0)], { sonic: [0, 0], balanced: [1, 1], mood: [3, 3] });
    const at = (t: number) => Array.from(interpolated(data, t));
    const [s, b, m] = [at(0), at(0.5), at(1)];
    expect(at(0.25)[0]).toBeCloseTo((s[0] + b[0]) / 2, 6);
    expect(at(0.75)[0]).toBeCloseTo((b[0] + m[0]) / 2, 6);
    const out = new Float32Array(2);
    expect(interpolateInto(out, data, 1)).toBe(out);
    expect(Array.from(out)).toEqual(m);
  });

  it('builds atlas URLs for the album count and checks lengths', () => {
    const albums = Array.from({ length: 2049 }, (_, i) => album(i));
    const pos = Array.from({ length: 2049 * 2 }, (_, i) => (i % 7) / 7);
    const data = buildMapData(albums, { sonic: pos, balanced: pos, mood: pos });
    expect(data.n).toBe(2049);
    expect(data.atlasUrls).toEqual(['/data/atlas-0.webp', '/data/atlas-1.webp', '/data/atlas-2.webp']);
    expect(() => buildMapData(albums, { sonic: [0, 0], balanced: [0, 0], mood: [0, 0] })).toThrow();
  });
});
