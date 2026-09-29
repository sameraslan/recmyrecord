// Placeholder so nav links resolve; replaced by the Explore page (Task 6).
import type { Metadata } from 'next';
import { COPY } from '@/lib/copy';

export const metadata: Metadata = { title: COPY.titles.map };

export default function MapPage() {
  return <h1 className="sr-only">{COPY.nav.map}</h1>;
}
