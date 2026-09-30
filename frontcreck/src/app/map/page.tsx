import type { Metadata } from 'next';
import { FocusOnMount } from '@/components/FocusOnMount';
import { COPY } from '@/lib/copy';

export const metadata: Metadata = { title: COPY.titles.map };

/** Explore: the map itself is the persistent MapStage in the root layout; this route only names the view. */
export default function MapPage() {
  return (
    <>
      <h1 className="sr-only" id="map-h" tabIndex={-1}>
        {COPY.map.heading}
      </h1>
      <FocusOnMount selector="#map-h" />
    </>
  );
}
