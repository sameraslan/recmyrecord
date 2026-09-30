'use client';

import { ErrorPanel } from '@/components/ErrorPanel';

/** Route error boundary. `retry` re-fetches and re-renders the segment (a failed RSC or chunk fetch). */
export default function RouteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="page-msg">
      <ErrorPanel onRetry={retry} />
    </section>
  );
}
