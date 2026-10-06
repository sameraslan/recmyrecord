import { act, cleanup, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { gasUrl } from '@/components/map/shaders/gas';
import { layoutMarkers } from '@/components/map/state/focusLayout';
import { FRAME_RGB, SKY_RGB, STAR_WHITE } from '@/components/map/theme';
import { resetDataCache } from '@/lib/data/client';
import type { ThemeData, ThemeGas } from '@/lib/data/theme';
import { STOP_IDS } from '@/lib/types';
import type { AlbumRecord } from '@/lib/types';
import {
  MapPreviewStrip,
  STRIP_GAS_STRENGTH,
  STRIP_REC,
  STRIP_SEED,
  STRIP_STAR_ALPHA,
  STRIP_STAR_PX,
  drawStrip,
  gasCopySize,
  loadStripGas,
  stripGasUrl,
  webpSize,
} from './MapPreviewStrip';

// The real layout, spied on: the strip's cover sizes and its shorter line are options it passes.
vi.mock('@/components/map/state/focusLayout', async () => {
  const real = await vi.importActual<typeof import('@/components/map/state/focusLayout')>('@/components/map/state/focusLayout');
  return { ...real, layoutMarkers: vi.fn(real.layoutMarkers) };
});

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = Array.from({ length: 30 }, (_, i) => ({ slug: `a${i}`, t: `A${i}`, a: 'X', s: '', c: '', k: i % 8, d: [], w: W }));
const pos = albums.flatMap((_, i) => [(i % 6) / 6 - 0.5, Math.floor(i / 6) / 6 - 0.5]);
const FOCUS = { seed: 7, recs: [8, 13, 1] };

// The component's data, for the tests that mount it: a phone, the fixture catalog, one stop's gas.
const GAS: ThemeGas = { rect: [-1.4, -1.2, 1.1, 1.4], px: [1803, 2048], sharp: [3299, 3747], hash: ['0123456789', 'abcdef0123'] };
const data = vi.hoisted(() => ({ catalog: null as unknown, positions: null as unknown, theme: null as unknown }));
data.catalog = { albums };
data.positions = { sonic: pos, balanced: pos, mood: pos };
data.theme = { n: albums.length, gas: { sonic: GAS, balanced: GAS, mood: GAS } } as unknown as ThemeData;
vi.mock('@/lib/media', () => ({ useIsNarrow: () => true }));
vi.mock('@/lib/data/useData', () => ({
  useCatalog: () => ({ status: 'ready', catalog: data.catalog, retry: () => {} }),
  usePositions: () => ({ status: 'ready', positions: data.positions, retry: () => {} }),
}));
vi.mock('@/lib/data/theme', async () => {
  const real = await vi.importActual<typeof import('@/lib/data/theme')>('@/lib/data/theme');
  return { ...real, loadTheme: () => Promise.resolve(data.theme) };
});

/** Records every method call and every property set, in order. Numbers are rounded, except a star's radius. */
function fakeCtx() {
  const calls: string[] = [];
  const show = (k: string, a: unknown, i: number) => (typeof a === 'number' && !(k === 'arc' && i === 2) ? Math.round(a) : a);
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => { calls.push(`${k}(${args.map((a, i) => show(k, a, i)).join(',')})`); }),
    set: (t, k: string, v) => { t[k] = v; calls.push(`${k}=${v}`); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const count = (calls: string[], prefix: string) => calls.filter((c) => c.startsWith(prefix)).length;
const named = <T extends object>(name: string, o: T): T => Object.assign(o, { toString: () => name });

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
    // Badge numbers: 10 px in a 14 px square ("10", the widest, measures 10.5 px against 12 px inside the edge).
    expect(calls).toContain('font=600 10px system-ui, sans-serif');
    expect(calls.filter((c) => /^fillRect\(-?\d+,-?\d+,14,14\)$/.test(c))).toHaveLength(3);
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

  it('puts alpha and compositing back when the gas image cannot be drawn', () => {
    const { ctx, calls } = fakeCtx();
    (ctx as unknown as Record<string, unknown>).drawImage = () => {
      throw new Error('the image is gone');
    };
    const image = {} as CanvasImageSource;
    expect(() => drawStrip(ctx, 390, 172, albums, pos, FOCUS, { image, rect: [-1.4, -1.2, 1.1, 1.4] }, vi.fn())).toThrow('the image is gone');
    expect(calls.slice(-2)).toEqual(['globalAlpha=1', 'globalCompositeOperation=source-over']);
  });

  it('uses the theme colours: quiet star-white dots of one size, off-white frames, no cluster colours', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    // Stars are specks: the gas is the picture and the covers the subject.
    expect([STRIP_STAR_PX, STRIP_STAR_ALPHA]).toEqual([1, 0.55]);
    expect(calls).toContain(`fillStyle=rgba(${STAR_WHITE.join(',')},0.55)`);
    // One size for every star, the radius as written (not rounded): nothing in the strip depends on an album's
    // place in the list (no order, no rank).
    const radii = new Set(calls.filter((c) => c.startsWith('arc(')).map((c) => c.split(',')[2]));
    expect([...radii]).toEqual(['1']);
    expect(calls).toContain(`strokeStyle=rgba(${FRAME_RGB.join(',')},1)`);
    expect(calls.some((c) => /196,136,111|151,160,119|200,165,96|237,229,213/.test(c))).toBe(false);
  });

  it('lays the covers out at the strip sizes, seed 38 px and the others 28 px, with a 10 px shortest line', () => {
    const spy = vi.mocked(layoutMarkers);
    spy.mockClear();
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    expect([STRIP_SEED, STRIP_REC]).toEqual([38, 28]);
    expect(spy).toHaveBeenCalledTimes(1);
    const [items, seed, rec, options] = spy.mock.calls[0];
    expect(items.map((it) => it.id)).toEqual([7, 8, 13, 1]);
    expect([seed, rec]).toEqual([38, 28]);
    expect(options?.minLine).toBe(10);
    expect(options?.bounds).toEqual({ left: 6, top: 6, right: 384, bottom: 166 });
    // The tiles are drawn at those sizes: three of 28 px and the seed's of 38 px, last.
    const tiles = calls.filter((c) => /^fillRect\(-?\d+,-?\d+,(28,28|38,38)\)$/.test(c)).map((c) => c.split(',')[2]);
    expect(tiles).toEqual(['28', '28', '28', '38']);
  });
});

describe('the strip’s gas image', () => {
  const URL_MOOD = stripGasUrl('mood', GAS.hash);
  /** The first 30 bytes of a WebP file in the extended format, `w` by `h` px. */
  const head = (w: number, h: number): Uint8Array => {
    const b = new Uint8Array(30);
    b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
    b.set([(w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16, (h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16], 24);
    return b;
  };
  /** A fetch that answers with a file starting with `bytes`; `blob.slice(0, 30)` is what the strip reads. */
  const fetchOf = (bytes: Uint8Array) => {
    const blob = { slice: (a: number, b: number) => ({ arrayBuffer: async () => bytes.slice(a, b).buffer }) };
    return { blob, fetch: vi.fn(async () => ({ ok: true, status: 200, blob: async () => blob })) };
  };
  /** An Image that decodes at once to `w` by `h`; every one made is counted. */
  const imageOf = (w: number, h: number) => {
    const made: { src: string }[] = [];
    class FakeImage {
      src = '';
      decoding = '';
      naturalWidth = w;
      naturalHeight = h;
      constructor() {
        made.push(this);
      }
      decode = () => Promise.resolve();
    }
    vi.stubGlobal('Image', FakeImage);
    return made;
  };
  let copyCtx: ReturnType<typeof fakeCtx>;

  beforeEach(() => {
    resetDataCache(); // forgets the copies of earlier tests
    copyCtx = fakeCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => copyCtx.ctx as never);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is named as the map names its first image, never the sharper one, and keeps its aspect in the copy', () => {
    const hash = ['0123456789', 'abcdef0123'] as const;
    for (const stop of STOP_IDS) expect(stripGasUrl(stop, hash)).toBe(gasUrl(stop, hash));
    expect(stripGasUrl('mood', hash)).not.toContain('sharp');
    expect(gasCopySize([1803, 2048])).toEqual([451, 512]);
    expect(gasCopySize([2048, 1970])).toEqual([512, 493]);
  });

  it('reads the size of the real gas images from their first bytes, as theme.json has it', () => {
    const dir = path.join(process.cwd(), 'public/data/theme');
    const theme = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')) as ThemeData;
    for (const stop of STOP_IDS) {
      const file = fs.readFileSync(path.join(process.cwd(), 'public', stripGasUrl(stop, theme.gas[stop].hash)));
      expect(webpSize(new Uint8Array(file.subarray(0, 30)))).toEqual(theme.gas[stop].px);
    }
    expect(webpSize(head(1803, 2048))).toEqual([1803, 2048]);
    expect(webpSize(head(1803, 2048).slice(0, 29))).toBeNull(); // cut short
    expect(webpSize(new Uint8Array(30))).toBeNull(); // not that format
  });

  it('makes its copy off the main thread: the file is decoded and resized in one step, once per image', async () => {
    const { blob, fetch } = fetchOf(head(1803, 2048));
    const bitmap = { width: 451, height: 512, close: vi.fn() };
    const create = vi.fn(async () => bitmap);
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('createImageBitmap', create);
    const made = imageOf(1803, 2048);
    await expect(loadStripGas('mood', GAS)).resolves.toBe(bitmap);
    expect(fetch).toHaveBeenCalledWith(URL_MOOD);
    expect(create).toHaveBeenCalledWith(blob, { resizeWidth: 451, resizeHeight: 512, resizeQuality: 'high' });
    // No image element, no canvas: nothing was decoded or scaled on the main thread.
    expect(made).toHaveLength(0);
    expect(copyCtx.calls).toEqual([]);
    // Asked for again (another strip, the stop chosen again): the same copy, no second download or decode.
    await expect(loadStripGas('mood', GAS)).resolves.toBe(bitmap);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no createImageBitmap', undefined],
    ['createImageBitmap refuses the resize options', vi.fn(async () => Promise.reject(new TypeError('options')))],
    ['createImageBitmap ignores the resize options', vi.fn(async () => ({ width: 1803, height: 2048, close: vi.fn() }))],
  ])('falls back to a smoothed canvas copy when %s', async (_why, create) => {
    vi.stubGlobal('fetch', fetchOf(head(1803, 2048)).fetch);
    vi.stubGlobal('createImageBitmap', create);
    const made = imageOf(1803, 2048);
    const copy = (await loadStripGas('mood', GAS)) as HTMLCanvasElement;
    expect(copy).toBeInstanceOf(HTMLCanvasElement);
    expect([copy.width, copy.height]).toEqual([451, 512]);
    expect(made.map((im) => im.src)).toEqual([URL_MOOD]);
    expect(copyCtx.calls).toEqual(['imageSmoothingQuality=high', 'drawImage([object Object],0,0,451,512)']);
    // A full-size bitmap that came back in place of the small one is let go.
    const ignored = create ? await create.mock.results[0]?.value.catch(() => null) : null;
    if (ignored) expect(ignored.close).toHaveBeenCalledTimes(1);
    await loadStripGas('mood', GAS);
    expect(made).toHaveLength(1);
  });

  it('refuses an image of another bake on both paths, and forgets the failure so the next strip tries again', async () => {
    const create = vi.fn(async () => ({ width: 451, height: 512, close: vi.fn() }));
    vi.stubGlobal('createImageBitmap', create);
    // The file says 2048 x 1970, theme.json says 1803 x 2048.
    const wrong = fetchOf(head(2048, 1970));
    vi.stubGlobal('fetch', wrong.fetch);
    await expect(loadStripGas('mood', GAS)).rejects.toThrow('another bake');
    expect(create).not.toHaveBeenCalled();
    vi.stubGlobal('createImageBitmap', undefined);
    imageOf(2048, 1970);
    await expect(loadStripGas('mood', GAS)).rejects.toThrow('another bake');
    expect(copyCtx.calls).toEqual([]);
    // The right file afterwards is loaded: the failures were not kept.
    vi.stubGlobal('createImageBitmap', create);
    vi.stubGlobal('fetch', fetchOf(head(1803, 2048)).fetch);
    await expect(loadStripGas('mood', GAS)).resolves.toMatchObject({ width: 451 });
  });

  describe('in the mounted strip', () => {
    type Seen = { cb: IntersectionObserverCallback; options?: IntersectionObserverInit; disconnect: Mock<() => void> };
    let seen: Seen[];
    let resizes: { disconnect: Mock<() => void> }[];
    let finish: (b: unknown) => void;
    let create: Mock<() => Promise<unknown>>;
    let fetched: ReturnType<typeof fetchOf>['fetch'];
    const bitmap = named('GAS', { width: 451, height: 512, close: vi.fn() });
    const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 20)));
    const strip = () => createElement(MapPreviewStrip, { focus: FOCUS, stop: 'mood', onOpen: () => {} });
    const comeOnScreen = () => act(() => seen.at(-1)!.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    const gasDraws = () => count(copyCtx.calls, 'drawImage(GAS,');
    const skyFills = () => count(copyCtx.calls, 'fillRect(0,0,390,172)');

    beforeEach(() => {
      seen = [];
      resizes = [];
      vi.stubGlobal('IntersectionObserver', class {
        constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          this.me = { cb, options, disconnect: vi.fn<() => void>() };
          seen.push(this.me);
        }
        me: Seen;
        observe() {}
        disconnect() {
          this.me.disconnect();
        }
      });
      vi.stubGlobal('ResizeObserver', class {
        me = { disconnect: vi.fn<() => void>() };
        constructor() {
          resizes.push(this.me);
        }
        observe() {}
        disconnect() {
          this.me.disconnect();
        }
      });
      vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(() => f(0), 0));
      vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
      vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390, height: 172 } as DOMRect);
      fetched = fetchOf(head(1803, 2048)).fetch;
      create = vi.fn(() => new Promise<unknown>((r) => { finish = r; }));
      vi.stubGlobal('fetch', fetched);
      vi.stubGlobal('createImageBitmap', create);
    });

    it('asks for the gas only once the strip is on screen, and draws once when the copy is ready', async () => {
      render(strip());
      await flush();
      // Off screen: the strip is drawn without gas and nothing was asked for. The watch has no margin and no root:
      // "on screen" means visible in whatever scrolls the list.
      expect(seen).toHaveLength(1);
      expect(seen[0].options).toBeUndefined();
      expect(fetched).not.toHaveBeenCalled();
      expect([skyFills(), gasDraws()]).toEqual([1, 0]);
      comeOnScreen();
      await flush();
      expect(seen[0].disconnect).toHaveBeenCalled();
      expect(create).toHaveBeenCalledTimes(1);
      expect([skyFills(), gasDraws()]).toEqual([1, 0]); // still waiting: no draw for nothing
      await act(async () => finish(bitmap));
      await flush();
      expect([skyFills(), gasDraws()]).toEqual([2, 1]);
      await flush();
      expect([skyFills(), gasDraws()]).toEqual([2, 1]); // and then it rests
    });

    it('draws nothing and keeps nothing waiting when it is taken away before the copy is ready', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = render(strip());
      await flush();
      comeOnScreen();
      await flush();
      expect(create).toHaveBeenCalledTimes(1);
      const before = copyCtx.calls.length;
      unmount();
      // Every watch of the strip that left is over.
      expect(seen.every((s) => s.disconnect.mock.calls.length > 0)).toBe(true);
      expect(resizes.length).toBeGreaterThan(0);
      expect(resizes.every((r) => r.disconnect.mock.calls.length > 0)).toBe(true);
      await act(async () => finish(bitmap));
      await flush();
      expect(copyCtx.calls.length).toBe(before);
      expect(errors).not.toHaveBeenCalled();
      // The copy is not lost: it is the one kept per image, and the next strip draws it without a second
      // download or decode.
      expect(bitmap.close).not.toHaveBeenCalled();
      render(strip());
      await flush();
      comeOnScreen();
      await flush();
      await flush();
      expect(fetched).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      expect(gasDraws()).toBe(1);
    });
  });
});
