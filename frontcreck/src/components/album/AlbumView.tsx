'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { AlbumPageData } from '@/lib/types';
import { parseBy } from '@/lib/url-state';
import { AlbumPanel } from './AlbumPanel';

/** The list renders from the store's stop once the store has caught up with `?by=`, and from `?by=` until then.
 * A direct `?by=` load and back or forward to an entry with another `by` therefore render the right list on the
 * first render: no balanced list first, no rows gliding into place, one focus for the map. After that the store
 * leads: the slider writes the store first and the URL a frame later (Task 7), and in-app links carry the
 * store's stop. */
export function AlbumView({ data }: { data: AlbumPageData }) {
  const urlStop = parseBy(useSearchParams().get('by'));
  const storeStop = useAppStore((s) => s.stop);
  // Whether the store has reached `?by=` since `?by=` last changed (state adjusted while rendering, React's
  // pattern for deriving from changed inputs).
  const [urlSeen, setUrlSeen] = useState(urlStop);
  const [caughtUp, setCaughtUp] = useState(storeStop === urlStop);
  if (urlSeen !== urlStop) {
    setUrlSeen(urlStop);
    setCaughtUp(storeStop === urlStop);
  } else if (!caughtUp && storeStop === urlStop) {
    setCaughtUp(true);
  }
  useEffect(() => {
    useAppStore.getState().setStop(urlStop);
  }, [urlStop]);
  const stop = caughtUp ? storeStop : urlStop;
  return <AlbumPanel data={data} stop={stop} />;
}
