'use client';

import { useEffect, type RefObject } from 'react';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';

/**
 * Publishes the album panel's width as the map inset (0 on narrow screens) while the panel is mounted, and
 * clears it on unmount. Shared by AlbumPanel and the loading skeleton, so a navigation from one to the other
 * keeps the map where it is: the old cleanup and the next first measure land in the same commit, and the map
 * never sees 0 in between.
 */
export function usePanelInset(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (isNarrow()) return useAppStore.getState().setPanelInset(0);
      // React hides a mounted panel (display: none) while a navigation suspends without a loading state; the
      // panel is still there and comes back, so the map keeps its inset instead of jumping to full width.
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
