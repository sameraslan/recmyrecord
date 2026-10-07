import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AlbumRecord } from '@/lib/types';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, markerKey } from '../state/overlayEls';
import { FocusMarkers } from './FocusMarkers';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((t, i) => ({ slug: t.toLowerCase(), t, a: 'Someone', s: '', c: '', k: i, d: [], w: W }));
const setFocus = (focus: { seed: number; recs: number[] } | null) => useMapStore.setState((s) => ({ input: { ...s.input, focus } }));

afterEach(() => {
  cleanup();
  setFocus(null);
});

describe('FocusMarkers', () => {
  it('draws the seed and its closest albums as covers and lines only: no number, no badge, nothing to read', () => {
    setFocus({ seed: 2, recs: [0, 3, 1] });
    const { container } = render(<FocusMarkers albums={albums} />);
    const layer = container.querySelector('.mk-layer')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    // The covers keep the order of the list (closest first), seed first; the order is not written on them.
    expect([...layer.querySelectorAll<HTMLElement>('.mk')].map((el) => Number(el.dataset.albumId))).toEqual([2, 0, 3, 1]);
    expect(layer.querySelectorAll('.mk--seed')).toHaveLength(1);
    expect([...layer.children].map((el) => el.getAttribute('class')!.split(' ')[0])).toEqual(['mk-lines', 'mk', 'mk', 'mk', 'mk']);
    expect(layer.querySelector('.mk-n, .mk-badges')).toBeNull();
    expect(layer.textContent).not.toMatch(/\d/);
    // Every cover is registered for MarkerDriver; nothing else is (no badge element to place per frame).
    for (const id of [2, 0, 3, 1]) expect(getOverlayEl(markerKey(id))).not.toBeNull();
    for (const id of [2, 0, 3, 1]) expect(getOverlayEl(`badge-${id}`)).toBeNull();
  });

  it('draws nothing without an open album', () => {
    const { container } = render(<FocusMarkers albums={albums} />);
    expect(container.firstChild).toBeNull();
  });
});
