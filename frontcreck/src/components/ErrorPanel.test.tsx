import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '@/lib/copy';
import { ErrorPanel } from './ErrorPanel';

describe('ErrorPanel', () => {
  afterEach(cleanup);

  it('shows the approved message and retries', () => {
    const onRetry = vi.fn();
    render(<ErrorPanel onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.error.body);
    expect(screen.getByRole('alert')).toHaveClass('rec-error');
    // Mockup: the first sentence is the heading line, the second the detail under it.
    expect(screen.getByText(COPY.error.title)).toHaveClass('e1');
    expect(screen.getByText(COPY.error.detail)).toHaveClass('e2');
    fireEvent.click(screen.getByRole('button', { name: COPY.error.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('takes the map message class', () => {
    render(<ErrorPanel onRetry={() => {}} className="map-msg" />);
    expect(screen.getByRole('alert')).toHaveClass('map-msg');
  });
});
