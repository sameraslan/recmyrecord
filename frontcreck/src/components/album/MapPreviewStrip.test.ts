import { describe, expect, it, vi } from 'vitest';
import type { AlbumRecord } from '@/lib/types';
import { drawStrip } from './MapPreviewStrip';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = Array.from({ length: 30 }, (_, i) => ({ slug: `a${i}`, t: `A${i}`, a: 'X', s: '', c: '', k: i % 8, d: [], w: W }));
const pos = albums.flatMap((_, i) => [(i % 6) / 6 - 0.5, Math.floor(i / 6) / 6 - 0.5]);

function fakeCtx() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => { calls.push(`${k}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : a)).join(',')})`); }),
    set: (t, k: string, v) => { t[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('drawStrip', () => {
  it('draws dots, one line per recommendation, a cover or tile per album and numbered badges', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, { seed: 7, recs: [8, 13, 1] }, '#d78242', vi.fn());
    expect(calls.filter((c) => c.startsWith('arc(')).length).toBeGreaterThan(10);
    expect(calls.filter((c) => c.startsWith('lineTo(')).length).toBe(3);
    expect(calls.filter((c) => c.startsWith('fillRect(')).length).toBe(4 + 3); // four tiles (no cover ids) + three badges
    expect(calls.filter((c) => c.startsWith('fillText(')).map((c) => c.split(',')[0])).toEqual(['fillText(1', 'fillText(2', 'fillText(3']);
  });
});
