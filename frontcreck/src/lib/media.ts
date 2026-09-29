import { useCallback, useSyncExternalStore } from 'react';

export const NARROW_MEDIA_QUERY = '(max-width: 899px)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const EASE_OUT = 'cubic-bezier(.22,.72,.2,1)';
/** Milliseconds. */
export const DURATION = { panel: 400, morph: 520, camera: 420, ambient: 400, rows: 420, fade: 380, hoverLabel: 80 } as const;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const lists = new Map<string, MediaQueryList>();

/** One MediaQueryList per query for the page's lifetime; null where matchMedia is missing. */
function mediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  let mq = lists.get(query);
  if (!mq) {
    mq = window.matchMedia(query);
    lists.set(query, mq);
  }
  return mq;
}

function matches(query: string): boolean {
  return mediaQueryList(query)?.matches ?? false;
}

export const prefersReducedMotion = (): boolean => matches(REDUCED_MOTION_QUERY);
export const isNarrow = (): boolean => matches(NARROW_MEDIA_QUERY);

export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = mediaQueryList(query);
      if (!mq) return () => {};
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matches(query), () => serverValue);
}

export const useIsNarrow = (): boolean => useMediaQuery(NARROW_MEDIA_QUERY);
export const useReducedMotion = (): boolean => useMediaQuery(REDUCED_MOTION_QUERY);
