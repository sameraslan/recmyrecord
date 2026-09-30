'use client';

import { useEffect } from 'react';
import { previousPath } from '@/lib/nav-history';

/**
 * Moves focus to `selector` once when the route mounts, without scrolling, so screen readers announce the new
 * view. Only after an in-app navigation (mockup focusQuiet, like AlbumPanel): a direct load leaves focus alone,
 * so the first Tab still reaches the skip link.
 */
export function FocusOnMount({ selector }: { selector: string }) {
  useEffect(() => {
    if (previousPath() === null) return;
    document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }, [selector]);
  return null;
}
