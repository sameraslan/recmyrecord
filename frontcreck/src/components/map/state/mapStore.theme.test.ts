import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData } from '@/lib/data/theme';
import { setInvalidate } from './invalidate';
import { useMapStore } from './mapStore';

const THEME: ThemeData = { v: 1, n: 1, positionsHash: 'a7c1dbd996fd', bakeHalf: 1.6, stars: { lead: [0], bg: [1, 2, 3] }, labels: { sonic: [], balanced: [], mood: [] } };

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
