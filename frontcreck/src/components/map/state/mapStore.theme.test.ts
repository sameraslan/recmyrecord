import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData } from '@/lib/data/theme';
import { setInvalidate } from './invalidate';
import { useMapStore } from './mapStore';

const THEME: ThemeData = { v: 2, n: 1, positionsHash: 'a7c1dbd996fd', bakeHalf: 1.6, gas: { sonic: { rect: [-1.4, -1.2, 1.1, 1.3], px: [2048, 2048], sharp: [3200, 3200] }, balanced: { rect: [-1.4, -1.4, 1.1, 1.4], px: [1829, 2048], sharp: [3200, 3584] }, mood: { rect: [-1.2, -1.4, 0.8, 1.3], px: [1517, 2048], sharp: [2560, 3456] } }, stars: { lead: [0], bg: [1, 2, 3] }, labels: { sonic: [], balanced: [], mood: [] } };

afterEach(() => {
  setInvalidate(null);
  useMapStore.getState().setTheme(null);
});

describe('map store theme', () => {
  it('starts without a theme, so the map can draw plain sky', () => {
    expect(useMapStore.getState().theme).toBeNull();
  });

  it('holds the theme and asks for one frame when it changes, none when it does not', () => {
    const invalidate = vi.fn();
    setInvalidate(invalidate);
    useMapStore.getState().setTheme(THEME);
    expect(useMapStore.getState().theme).toBe(THEME);
    expect(invalidate).toHaveBeenCalledTimes(1);
    useMapStore.getState().setTheme(THEME);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
