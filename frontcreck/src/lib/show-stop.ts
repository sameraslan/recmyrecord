import { useAppStore } from '@/lib/store';
import type { StopId } from '@/lib/types';
import { replaceBy } from '@/lib/url-state';

/**
 * Moves the slider to `stop` from inside the album view, as the slider itself does: the list and the map react
 * to the store at once, and `?by=` is written a frame later, off the interaction path.
 */
export function showStop(stop: StopId): void {
  useAppStore.getState().setStop(stop);
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() =>
    window.setTimeout(() => {
      if (window.location.pathname.startsWith('/album/') && useAppStore.getState().stop === stop) replaceBy(stop);
    }, 0),
  );
}
