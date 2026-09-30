import { COPY } from '@/lib/copy';

/** Inline data error with retry: the first sentence as a heading line, the second under it (mockup `.rec-error`). */
export function ErrorPanel({ onRetry, className = 'rec-error' }: { onRetry: () => void; className?: string }) {
  return (
    <div className={className} role="alert">
      <p className="e1">{COPY.error.title}</p>{' '}
      <p className="e2">{COPY.error.detail}</p>
      <button type="button" className="btn btn-line" onClick={onRetry}>
        {COPY.error.retry}
      </button>
    </div>
  );
}
