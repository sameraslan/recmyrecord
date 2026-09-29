// Placeholder so nav links resolve; replaced by the About page (Task 10).
import type { Metadata } from 'next';
import { COPY } from '@/lib/copy';

export const metadata: Metadata = { title: COPY.titles.about };

export default function AboutPage() {
  return <h1 className="sr-only">{COPY.nav.about}</h1>;
}
