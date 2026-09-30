'use client';

import { useEffect, type RefObject } from 'react';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';

/**
 * Publishes the album panel's width as the map inset (0 on narrow screens) while the panel is mounted, and
 * clears it on unmount. From one album to the next, the old panel's cleanup and the new panel's first measure
 * land in the same commit, so the map never sees 0 in between.
 */
export function usePanelInset(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (isNarrow()) return useAppStore.getState().setPanelInset(0);
      // A panel React has hidden (display: none, while a navigation suspends) measures 0 wide; it comes back,
      // so the map keeps its inset instead of jumping to full width.
      if (el.getClientRects().length === 0) return;
      useAppStore.getState().setPanelInset(Math.round(el.getBoundingClientRect().width));
    };
    update();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      useAppStore.getState().setPanelInset(0);
    };
  }, [ref]);
}
