'use client';

import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import type { AlbumPageData } from '@/lib/types';
import { parseBy } from '@/lib/url-state';
import { AlbumPanel } from './AlbumPanel';

/** The store holds the stop; the list renders from it. `?by=` feeds the store when it changes (direct
 * load, back and forward); the slider writes the store first and the URL a frame later (Task 7), and in-app
 * links always carry the store's stop, so the two only differ for the first frame of a direct ?by= load. */
export function AlbumView({ data }: { data: AlbumPageData }) {
  const urlStop = parseBy(useSearchParams().get('by'));
  const stop = useAppStore((s) => s.stop);
  return <AlbumPanel data={data} stop={stop} syncStop={urlStop} />;
}
