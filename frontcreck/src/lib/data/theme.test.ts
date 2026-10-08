import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataLoadError, resetDataCache } from './client';
import { THEME_URL, readTheme, loadTheme, peekTheme, themeFor, type ThemeData } from './theme';
import { useThemeLoad } from './useData';

const STOP_GAS = { rect: [-1.4, -1.4, 1.1, 1.4] as [number, number, number, number], px: [1829, 2048] as [number, number], sharp: [3200, 3584] as [number, number], hash: ['0123456789', 'abcdef0123'] as [string, string] };
const THEME: ThemeData = {
  v: 4,
  n: 2,
  positionsHash: 'a7c1dbd996fd',
  bakeHalf: 1.6,
  gas: { sonic: STOP_GAS, balanced: STOP_GAS, mood: STOP_GAS },
  stars: { lead: [0, -1], bg: [10, 20, 30, 40, 50, 255] },
};

/** The same theme as theme.json holds it: the stars packed as text. */
const FILE = { ...THEME, stars: { lead: '0-', bg: btoa(String.fromCharCode(10, 20, 30, 40, 50, 255)) } };

const serve = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  cleanup();
  resetDataCache();
  vi.unstubAllGlobals();
});

describe('readTheme', () => {
  it('reads the file the theme build writes: the packed stars come back as numbers', () => {
    expect(readTheme(FILE)).toEqual(THEME);
  });

  it.each([
    ['nothing', null],
    ['another version', { ...FILE, v: 5 }],
    ['the version before the stars were packed as text', { ...THEME, v: 3 }],
    ['stars that are lists of numbers', THEME],
    ['the version before the gas had rectangles', { ...FILE, v: 1 }],
    ['the version before the gas images were named after their content', { ...FILE, v: 2 }],
    ['a gas image with no content hash', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, hash: undefined } } }],
    ['a gas image with one content hash', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, hash: ['0123456789'] } } }],
    ['a content hash that is not 10 hex characters (it becomes part of a URL)', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, hash: ['0123456789', '../../x.js'] } } }],
    ['a content hash in capitals', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, hash: ['0123456789', 'ABCDEF0123'] } } }],
    ['no gas images', { ...FILE, gas: undefined }],
    ['a stop without gas images', { ...FILE, gas: { sonic: STOP_GAS, balanced: STOP_GAS } }],
    ['a gas rectangle that is inside out', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, rect: [1.1, -1.4, -1.4, 1.4] } } }],
    ['a gas rectangle that leaves the baked square', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, rect: [-1.7, -1.4, 1.1, 1.4] } } }],
    ['a first gas image over 2048 px', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, px: [2049, 2048] } } }],
    ['a sharper gas image over 4096 px', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, sharp: [3200, 4097] } } }],
    ['a gas image with no size', { ...FILE, gas: { ...FILE.gas, mood: { ...STOP_GAS, sharp: [3200] } } }],
    ['a lead list of the wrong length', { ...FILE, stars: { ...FILE.stars, lead: '0' } }],
    ['a lead family out of range', { ...FILE, stars: { ...FILE.stars, lead: '05' } }],
    ['a luminance list that is not three per album', { ...FILE, stars: { ...FILE.stars, bg: btoa('abc') } }],
    ['a luminance text that is not base64', { ...FILE, stars: { ...FILE.stars, bg: '!!!!!!!!' } }],
    ['no stars', { ...FILE, stars: undefined }],
    ['no bake size', { ...FILE, bakeHalf: 0 }],
  ])('rejects %s', (_, value) => {
    expect(readTheme(value)).toBeNull();
  });
});

describe('loadTheme', () => {
  it('fetches theme.json once and memoises it', async () => {
    const f = serve(FILE);
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([loadTheme(), loadTheme()]);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith(THEME_URL, { credentials: 'same-origin' });
    expect(peekTheme()).toBe(a);
  });

  it('rejects a missing or wrongly shaped file with DataLoadError and retries on the next call', async () => {
    vi.stubGlobal('fetch', serve('nope', 404));
    await expect(loadTheme()).rejects.toBeInstanceOf(DataLoadError);
    vi.stubGlobal('fetch', serve({ ...FILE, v: 5 }));
    await expect(loadTheme()).rejects.toBeInstanceOf(DataLoadError);
    expect(peekTheme()).toBeNull();
    vi.stubGlobal('fetch', serve(FILE));
    await expect(loadTheme()).resolves.toEqual(THEME);
  });

  it('is cleared by resetDataCache', async () => {
    vi.stubGlobal('fetch', serve(FILE));
    await loadTheme();
    resetDataCache();
    expect(peekTheme()).toBeNull();
  });
});

describe('themeFor', () => {
  it('drops a theme that was built for another album count', () => {
    expect(themeFor(THEME, 2)).toBe(THEME);
    expect(themeFor(THEME, 3)).toBeNull();
    expect(themeFor(null, 2)).toBeNull();
  });
});

describe('useThemeLoad', () => {
  it('gives null until the theme has loaded, then the theme', async () => {
    vi.stubGlobal('fetch', serve(FILE));
    const h = renderHook(() => useThemeLoad(true));
    expect(h.result.current.theme).toBeNull();
    await waitFor(() => expect(h.result.current).toEqual({ status: 'ready', theme: THEME }));
  });

  it('does not fetch while disabled', () => {
    const f = serve(FILE);
    vi.stubGlobal('fetch', f);
    const h = renderHook(() => useThemeLoad(false));
    expect(h.result.current).toEqual({ status: 'idle', theme: null });
    expect(f).not.toHaveBeenCalled();
  });

  it('reports an error and keeps null when the file is missing, so the map can go on without a theme', async () => {
    vi.stubGlobal('fetch', serve('nope', 404));
    const h = renderHook(() => useThemeLoad(true));
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    expect(h.result.current.theme).toBeNull();
  });
});
