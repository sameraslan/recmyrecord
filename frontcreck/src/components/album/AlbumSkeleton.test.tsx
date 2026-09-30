import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COPY } from '@/lib/copy';
import { AlbumSkeleton } from './AlbumSkeleton';

describe('AlbumSkeleton', () => {
  it('is a busy album region with five placeholder rows and a status message', () => {
    const { container } = render(<AlbumSkeleton />);
    expect(screen.getByRole('region', { name: COPY.album.loading })).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('li.rec')).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent(COPY.album.loading);
  });
});
