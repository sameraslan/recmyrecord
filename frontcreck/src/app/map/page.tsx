import type { Metadata } from 'next';
import { COPY } from '@/lib/copy';

export const metadata: Metadata = { title: COPY.titles.map };

export default function MapPage() {
  return (
    <h1 className="sr-only" id="map-h" tabIndex={-1}>
      {COPY.map.heading}
    </h1>
  );
}
