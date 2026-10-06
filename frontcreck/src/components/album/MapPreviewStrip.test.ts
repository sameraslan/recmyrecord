import { describe, expect, it, vi } from 'vitest';
import { gasUrl } from '@/components/map/shaders/gas';
import { FRAME_RGB, SKY_RGB, STAR_WHITE } from '@/components/map/theme';
import { STOP_IDS } from '@/lib/types';
import type { AlbumRecord } from '@/lib/types';
import { STRIP_GAS_STRENGTH, drawStrip, gasCopySize, stripGasUrl } from './MapPreviewStrip';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = Array.from({ length: 30 }, (_, i) => ({ slug: `a${i}`, t: `A${i}`, a: 'X', s: '', c: '', k: i % 8, d: [], w: W }));
const pos = albums.flatMap((_, i) => [(i % 6) / 6 - 0.5, Math.floor(i / 6) / 6 - 0.5]);
const FOCUS = { seed: 7, recs: [8, 13, 1] };

/** Records every method call and every property set, in order. */
function fakeCtx() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => { calls.push(`${k}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : a)).join(',')})`); }),
    set: (t, k: string, v) => { t[k] = v; calls.push(`${k}=${v}`); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const count = (calls: string[], prefix: string) => calls.filter((c) => c.startsWith(prefix)).length;

describe('drawStrip', () => {
  it('draws everything without the gas image: sky, a star per album, cased lines, tiles and numbered badges', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    // The sky is filled first, so the strip is never an empty box while the image loads or after it failed.
    expect(calls.slice(0, 2)).toEqual([`fillStyle=rgba(${SKY_RGB.join(',')},1)`, 'fillRect(0,0,390,172)']);
    expect(count(calls, 'drawImage(')).toBe(0);
    expect(count(calls, 'arc(')).toBeGreaterThan(10);
    expect(count(calls, 'lineTo(')).toBe(2 * 3); // a dark casing and a white line per recommendation
    expect(count(calls, 'fillRect(')).toBe(1 + 1 + 4 + 3); // sky, the seed's backing, four tiles (no cover ids), three badges
    expect(calls.filter((c) => c.startsWith('fillText(')).map((c) => c.split(',')[0])).toEqual(['fillText(1', 'fillText(2', 'fillText(3']);
  });

  it("draws the gas under the stars, placed by the stop's own rectangle in the strip's scale", () => {
    const { ctx, calls } = fakeCtx();
    const image = { toString: () => 'GAS' } as unknown as CanvasImageSource;
    // Not square and not centred, so a swapped edge or a square assumption shows.
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, { image, rect: [-1.4, -1.2, 1.1, 1.4] }, vi.fn());
    // Scale 336 px per unit, centred on (-0.25, -0.3333): west -1.4 is x = -191.4, north 1.4 is y = -496.4,
    // 2.5 units wide is 840 px, 2.6 units tall is 873.6 px.
    const at = calls.indexOf('drawImage(GAS,-191,-496,840,874)');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(calls.findIndex((c) => c.startsWith('arc(')));
    // The image holds light only (black where there is no gas), so it is added to the sky, as the map's shader
    // does, and nothing after it is drawn that way.
    expect(calls[at - 2]).toBe('globalCompositeOperation=lighter');
    expect(calls[at + 2]).toBe('globalCompositeOperation=source-over');
    expect(count(calls, 'globalCompositeOperation=')).toBe(2);
    // The gas is stepped back, as the map steps it back beside an open album: covers and stars are the subject.
    // Only the gas is drawn at that strength; everything after it is at full alpha again.
    expect(STRIP_GAS_STRENGTH).toBe(0.62);
    expect(calls[at - 1]).toBe('globalAlpha=0.62');
    expect(calls[at + 1]).toBe('globalAlpha=1');
    expect(count(calls, 'globalAlpha=')).toBe(2);
  });

  it('uses the theme colours: star-white dots of one size, off-white frames, no cluster colours', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    expect(calls).toContain(`fillStyle=rgba(${STAR_WHITE.join(',')},0.7)`);
    // One size for every star: nothing in the strip depends on an album's place in the list (no order, no rank).
    const radii = new Set(calls.filter((c) => c.startsWith('arc(')).map((c) => c.split(',')[2]));
    expect(radii.size).toBe(1);
    expect(calls).toContain(`strokeStyle=rgba(${FRAME_RGB.join(',')},1)`);
    expect(calls.some((c) => /196,136,111|151,160,119|200,165,96|237,229,213/.test(c))).toBe(false);
  });
});

describe('the strip’s gas image', () => {
  it('is named as the map names its first image, never the sharper one, and keeps its aspect in the copy', () => {
    const hash = ['0123456789', 'abcdef0123'] as const;
    for (const stop of STOP_IDS) expect(stripGasUrl(stop, hash)).toBe(gasUrl(stop, hash));
    expect(stripGasUrl('mood', hash)).not.toContain('sharp');
    expect(gasCopySize([1803, 2048])).toEqual([451, 512]);
    expect(gasCopySize([2048, 1970])).toEqual([512, 493]);
  });
});
