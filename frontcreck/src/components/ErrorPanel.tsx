import { COPY } from '@/lib/copy';

export function ErrorPanel({ onRetry, className = 'rec-error' }: { onRetry: () => void; className?: string }) {
  return (
    <div className={className} role="alert">
      <p className="e1">{COPY.error.body}</p>
      <button type="button" className="btn btn-line" onClick={onRetry}>
        {COPY.error.retry}
      </button>
    </div>
  );
}
