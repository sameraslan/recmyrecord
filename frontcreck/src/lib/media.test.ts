import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNarrow, prefersReducedMotion, useMediaQuery } from './media';

type Listener = () => void;

/** Minimal MediaQueryList whose `matches` can be flipped and which fires `change`. */
function fakeMatchMedia() {
  const lists = new Map<string, { matches: boolean; listeners: Set<Listener> }>();
  const fn = vi.fn((query: string) => {
    const entry = lists.get(query) ?? { matches: false, listeners: new Set<Listener>() };
    lists.set(query, entry);
    return {
      media: query,
      get matches() {
        return entry.matches;
      },
      addEventListener: (_: string, l: Listener) => entry.listeners.add(l),
      removeEventListener: (_: string, l: Listener) => entry.listeners.delete(l),
    } as unknown as MediaQueryList;
  });
  const set = (query: string, matches: boolean) => {
    const entry = lists.get(query)!;
    entry.matches = matches;
    entry.listeners.forEach((l) => l());
  };
  return { fn, set };
}

afterEach(() => vi.unstubAllGlobals());

describe('media helpers', () => {
  it('creates one MediaQueryList per query and reuses it', () => {
    const mm = fakeMatchMedia();
    vi.stubGlobal('matchMedia', mm.fn);
    isNarrow();
    isNarrow();
    prefersReducedMotion();
    prefersReducedMotion();
    expect(mm.fn).toHaveBeenCalledTimes(2);
  });

  it('follows changes to the query and reuses the list across renders', () => {
    const mm = fakeMatchMedia();
    vi.stubGlobal('matchMedia', mm.fn);
    const h = renderHook(() => useMediaQuery('(min-width: 1234px)'));
    expect(h.result.current).toBe(false);
    act(() => mm.set('(min-width: 1234px)', true));
    expect(h.result.current).toBe(true);
    h.rerender();
    expect(mm.fn.mock.calls.filter(([q]) => q === '(min-width: 1234px)')).toHaveLength(1);
    h.unmount();
  });

  it('returns false when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(isNarrow()).toBe(false);
    const h = renderHook(() => useMediaQuery('(min-width: 1px)'));
    expect(h.result.current).toBe(false);
  });
});
