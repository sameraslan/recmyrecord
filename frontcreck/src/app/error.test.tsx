import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COPY } from '@/lib/copy';
import RouteError from './error';

describe('RouteError', () => {
  it('shows the inline error and Try again calls retry', () => {
    const retry = vi.fn();
    render(<RouteError error={new Error('chunk failed')} retry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.error.body);
    fireEvent.click(screen.getByRole('button', { name: COPY.error.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
