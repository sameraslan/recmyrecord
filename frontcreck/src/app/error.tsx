'use client';

import { ErrorPanel } from '@/components/ErrorPanel';

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="page-msg">
      <ErrorPanel onRetry={reset} />
    </section>
  );
}
