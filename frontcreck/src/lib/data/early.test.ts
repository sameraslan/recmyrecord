import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMarks } from '@/lib/marks';
import { GAS_BITMAP, PRELOADED_GAS_URL, bakedGasUrl, dropEarlyGas, resetEarlyGas, startEarlyGas, takeEarlyGas } from './early';
import { THEME_BAKE } from './theme.generated';

const bitmapOf = (name: string) => ({ name, close: vi.fn() }) as unknown as ImageBitmap & { name: string; close: ReturnType<typeof vi.fn> };

function preloadLink(href: string): void {
  const link = document.createElement('link');
  link.setAttribute('rel', 'preload');
  link.setAttribute('as', 'fetch');
  link.setAttribute('href', href);
  link.setAttribute('crossorigin', '');
  document.head.appendChild(link);
}

describe('the opening nebula image, asked for as the page opens', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let decode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetEarlyGas();
    resetMarks();
    document.head.innerHTML = '';
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['x']), arrayBuffer: async () => new ArrayBuffer(1) }));
    decode = vi.fn(async () => bitmapOf('early'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', decode);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is named by the committed theme\'s hash', () => {
    expect(PRELOADED_GAS_URL).toBe(`/data/theme/gas-balanced.${THEME_BAKE.stops.balanced.hash[0]}.webp`);
    expect(bakedGasUrl('mood')).toBe(`/data/theme/gas-mood.${THEME_BAKE.stops.mood.hash[0]}.webp`);
  });

  it('is fetched once, with the request the preload link made, decoded as gas, and handed over once', async () => {
    preloadLink(PRELOADED_GAS_URL);
    startEarlyGas('balanced');
    startEarlyGas('balanced');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // CORS mode (fetch's default) with same-origin credentials: what <link rel="preload" as="fetch" crossorigin> asked.
    expect(fetchMock).toHaveBeenCalledWith(PRELOADED_GAS_URL, { credentials: 'same-origin' });
    const taken = takeEarlyGas(PRELOADED_GAS_URL);
    expect(taken).not.toBeNull();
    const bitmap = await taken!;
    expect((bitmap as unknown as { name: string }).name).toBe('early');
    // the dust channel is data: never multiplied into the colour
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), GAS_BITMAP);
    expect(GAS_BITMAP.premultiplyAlpha).toBe('none');
    // the map owns it now: a second ask (a lost WebGL context) gets nothing and fetches for itself
    expect(takeEarlyGas(PRELOADED_GAS_URL)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(performance.getEntriesByName('rmr-gas-fetch').length).toBeGreaterThan(0);
  });

  it('starts nothing on a page whose HTML did not ask for the image (another data set)', () => {
    startEarlyGas('balanced');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(takeEarlyGas(PRELOADED_GAS_URL)).toBeNull();
  });

  it('is not handed to a map that asks for another image', async () => {
    preloadLink(PRELOADED_GAS_URL);
    startEarlyGas('balanced');
    expect(takeEarlyGas('/data/theme/gas-balanced.0000000000.webp')).toBeNull();
    expect(takeEarlyGas(bakedGasUrl('mood'))).toBeNull();
    // still there for the map that asks for it
    expect(takeEarlyGas(PRELOADED_GAS_URL)).not.toBeNull();
  });

  it('an album link that opens on another stop gets that stop\'s image, and the preloaded one is still claimed', async () => {
    preloadLink(PRELOADED_GAS_URL);
    startEarlyGas('mood');
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([PRELOADED_GAS_URL, bakedGasUrl('mood')].sort());
    expect(takeEarlyGas(PRELOADED_GAS_URL)).toBeNull();
    await expect(takeEarlyGas(bakedGasUrl('mood'))).resolves.toBeTruthy();
    // only the opening stop's image was decoded
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('a failed image rejects for the map that takes it, as its own load would', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404 }));
    preloadLink(PRELOADED_GAS_URL);
    startEarlyGas('balanced');
    await expect(takeEarlyGas(PRELOADED_GAS_URL)).rejects.toThrow('HTTP 404');
    expect(decode).not.toHaveBeenCalled();
  });

  it('is freed when no map will take it: without WebGL, or when the theme names other images', async () => {
    preloadLink(PRELOADED_GAS_URL);
    const bitmap = bitmapOf('dropped');
    decode.mockResolvedValue(bitmap);
    startEarlyGas('balanced');
    // a theme that names this image keeps it
    dropEarlyGas([PRELOADED_GAS_URL]);
    expect(bitmap.close).not.toHaveBeenCalled();
    dropEarlyGas(['/data/theme/gas-balanced.0000000000.webp']);
    await vi.waitFor(() => expect(bitmap.close).toHaveBeenCalledTimes(1));
    expect(takeEarlyGas(PRELOADED_GAS_URL)).toBeNull();
  });
});
