import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMarks } from '@/lib/marks';
import { GAS_BITMAP, bakedGasUrl, dropEarlyGas, resetEarlyGas, startEarlyGas, takeEarlyGas } from './early';
import { THEME_BAKE } from './theme.generated';

const bitmapOf = (name: string) => ({ name, close: vi.fn() }) as unknown as ImageBitmap & { name: string; close: ReturnType<typeof vi.fn> };

const BALANCED = bakedGasUrl('balanced');

describe('the opening nebula image, asked for as the page opens', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let decode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetEarlyGas();
    resetMarks();
    // This build serves the committed theme (next.config.ts sets it; a build for another data set leaves it empty).
    vi.stubEnv('RMR_EARLY_GAS', '1');
    // No blob(): the image is read as bytes (see fetchBitmap in early.ts for why).
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'image/webp' }), arrayBuffer: async () => new ArrayBuffer(3) }));
    decode = vi.fn(async () => bitmapOf('early'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', decode);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is named by the committed theme\'s hash', () => {
    expect(BALANCED).toBe(`/data/theme/gas-balanced.${THEME_BAKE.stops.balanced.hash[0]}.webp`);
    expect(bakedGasUrl('mood')).toBe(`/data/theme/gas-mood.${THEME_BAKE.stops.mood.hash[0]}.webp`);
  });

  it('is fetched once, decoded as gas, and handed over once', async () => {
    startEarlyGas('balanced');
    startEarlyGas('balanced');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(BALANCED, { credentials: 'same-origin' });
    const taken = takeEarlyGas(BALANCED);
    expect(taken).not.toBeNull();
    const bitmap = await taken!;
    expect((bitmap as unknown as { name: string }).name).toBe('early');
    // the dust channel is data: never multiplied into the colour
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), GAS_BITMAP);
    const blob = decode.mock.calls[0][0] as Blob;
    expect([blob.size, blob.type]).toEqual([3, 'image/webp']);
    expect(GAS_BITMAP.premultiplyAlpha).toBe('none');
    // the map owns it now: a second ask (a lost WebGL context) gets nothing and fetches for itself
    expect(takeEarlyGas(BALANCED)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(performance.getEntriesByName('rmr-gas-fetch').length).toBeGreaterThan(0);
  });

  it('starts nothing in a build that serves another data set', () => {
    vi.stubEnv('RMR_EARLY_GAS', '');
    startEarlyGas('balanced');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(takeEarlyGas(BALANCED)).toBeNull();
  });

  it('is not handed to a map that asks for another image', async () => {
    startEarlyGas('balanced');
    expect(takeEarlyGas('/data/theme/gas-balanced.0000000000.webp')).toBeNull();
    expect(takeEarlyGas(bakedGasUrl('mood'))).toBeNull();
    // still there for the map that asks for it
    expect(takeEarlyGas(BALANCED)).not.toBeNull();
  });

  it('an album link that opens on another stop gets that stop\'s image, and no other', async () => {
    startEarlyGas('mood');
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([bakedGasUrl('mood')]);
    expect(takeEarlyGas(BALANCED)).toBeNull();
    await expect(takeEarlyGas(bakedGasUrl('mood'))).resolves.toBeTruthy();
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('a failed image rejects for the map that takes it, as its own load would', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404 }));
    startEarlyGas('balanced');
    await expect(takeEarlyGas(BALANCED)).rejects.toThrow('HTTP 404');
    expect(decode).not.toHaveBeenCalled();
  });

  it('is freed when no map will take it: without WebGL, or when the theme names other images', async () => {
    const bitmap = bitmapOf('dropped');
    decode.mockResolvedValue(bitmap);
    startEarlyGas('balanced');
    // a theme that names this image keeps it
    dropEarlyGas([BALANCED]);
    expect(bitmap.close).not.toHaveBeenCalled();
    dropEarlyGas(['/data/theme/gas-balanced.0000000000.webp']);
    await vi.waitFor(() => expect(bitmap.close).toHaveBeenCalledTimes(1));
    expect(takeEarlyGas(BALANCED)).toBeNull();
  });
});
