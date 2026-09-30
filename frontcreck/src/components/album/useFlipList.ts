'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { DURATION, EASE_OUT, prefersReducedMotion } from '@/lib/media';

/** Rows (elements with data-flip) that stay in the list glide from their old position; new rows fade in.
 * Only animates within one `group` (the seed); a new seed resets without animating. */
export function useFlipList(listRef: RefObject<HTMLElement | null>, group: number, key: string): void {
  const prev = useRef<{ group: number; tops: Map<string, number> }>({ group: -1, tops: new Map() });
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-flip]'));
    const tops = new Map(rows.map((r) => [r.dataset.flip!, r.getBoundingClientRect().top]));
    const animate = prev.current.group === group && prev.current.tops.size > 0 && !prefersReducedMotion();
    if (animate) {
      rows.forEach((r, n) => {
        const old = prev.current.tops.get(r.dataset.flip!);
        if (old === undefined) {
          r.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], {
            duration: 340,
            delay: 90 + n * 30,
            easing: EASE_OUT,
            fill: 'backwards',
          });
        } else {
          const d = old - tops.get(r.dataset.flip!)!;
          if (Math.abs(d) > 1) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: DURATION.rows, easing: EASE_OUT });
        }
      });
    }
    prev.current = { group, tops };
  }, [listRef, group, key]);
}
