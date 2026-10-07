import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataLoadError, resetDataCache } from './client';
import { THEME_URL, isTheme, loadTheme, peekTheme, themeFor, type ThemeData } from './theme';
import { useThemeLoad } from './useData';

const STOP_GAS = { rect: [-1.4, -1.4, 1.1, 1.4] as [number, number, number, number], px: [1829, 2048] as [number, number], sharp: [3200, 3584] as [number, number], hash: ['0123456789', 'abcdef0123'] as [string, string] };
const THEME: ThemeData = {
  v: 3,
  n: 2,
  positionsHash: 'a7c1dbd996fd',
  bakeHalf: 1.6,
  gas: { sonic: STOP_GAS, balanced: STOP_GAS, mood: STOP_GAS },
  stars: { lead: [0, -1], bg: [10, 20, 30, 40, 50, 255] },
};

const serve = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  cleanup();
  resetDataCache();
  vi.unstubAllGlobals();
});

describe('isTheme', () => {
  it('accepts the shape the theme build writes', () => {
    expect(isTheme(THEME)).toBe(true);
  });

  it.each([
    ['nothing', null],
    ['another version', { ...THEME, v: 4 }],
    ['the version before the gas had rectangles', { ...THEME, v: 1 }],
    ['the version before the gas images were named after their content', { ...THEME, v: 2 }],
    ['a gas image with no content hash', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, hash: undefined } } }],
    ['a gas image with one content hash', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, hash: ['0123456789'] } } }],
    ['a content hash that is not 10 hex characters (it becomes part of a URL)', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, hash: ['0123456789', '../../x.js'] } } }],
    ['a content hash in capitals', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, hash: ['0123456789', 'ABCDEF0123'] } } }],
    ['no gas images', { ...THEME, gas: undefined }],
    ['a stop without gas images', { ...THEME, gas: { sonic: STOP_GAS, balanced: STOP_GAS } }],
    ['a gas rectangle that is inside out', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, rect: [1.1, -1.4, -1.4, 1.4] } } }],
    ['a gas rectangle that leaves the baked square', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, rect: [-1.7, -1.4, 1.1, 1.4] } } }],
    ['a first gas image over 2048 px', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, px: [2049, 2048] } } }],
    ['a sharper gas image over 4096 px', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, sharp: [3200, 4097] } } }],
    ['a gas image with no size', { ...THEME, gas: { ...THEME.gas, mood: { ...STOP_GAS, sharp: [3200] } } }],
    ['a lead list of the wrong length', { ...THEME, stars: { ...THEME.stars, lead: [0] } }],
    ['a lead family out of range', { ...THEME, stars: { ...THEME.stars, lead: [0, 5] } }],
    ['a luminance list that is not three per album', { ...THEME, stars: { ...THEME.stars, bg: [1, 2, 3] } }],
    ['a luminance that is not a byte', { ...THEME, stars: { ...THEME.stars, bg: [10, 20, 30, 40, 50, 256] } }],
    ['no bake size', { ...THEME, bakeHalf: 0 }],
  ])('rejects %s', (_, value) => {
    expect(isTheme(value)).toBe(false);
  });
});

describe('loadTheme', () => {
  it('fetches theme.json once and memoises it', async () => {
    const f = serve(THEME);
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
    vi.stubGlobal('fetch', serve({ ...THEME, v: 4 }));
    await expect(loadTheme()).rejects.toBeInstanceOf(DataLoadError);
    expect(peekTheme()).toBeNull();
    vi.stubGlobal('fetch', serve(THEME));
    await expect(loadTheme()).resolves.toEqual(THEME);
  });

  it('is cleared by resetDataCache', async () => {
    vi.stubGlobal('fetch', serve(THEME));
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
    vi.stubGlobal('fetch', serve(THEME));
    const h = renderHook(() => useThemeLoad(true));
    expect(h.result.current.theme).toBeNull();
    await waitFor(() => expect(h.result.current).toEqual({ status: 'ready', theme: THEME }));
  });

  it('does not fetch while disabled', () => {
    const f = serve(THEME);
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
