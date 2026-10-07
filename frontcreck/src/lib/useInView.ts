import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether the element is in the viewport (any part of it), from an IntersectionObserver: nothing runs on
 * scroll. False while `enabled` is false (nothing is observed then), before the first report, and where the
 * browser has no IntersectionObserver.
 */
export function useInView(ref: RefObject<Element | null>, enabled = true): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setSeen(last.isIntersecting);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      setSeen(false);
    };
  }, [ref, enabled]);
  return enabled && seen;
}
