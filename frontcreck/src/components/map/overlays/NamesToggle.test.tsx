import { act, fireEvent, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import type { MapApi } from '../types';
import { NamesToggle } from './NamesToggle';
import { ZoomControls } from './ZoomControls';

const api = { current: null } as React.RefObject<MapApi | null>;

/** The zoom corner as MapStage draws it, and the toggle as the map's own chunk (MusicMap) mounts it: in a sibling
 * tree, later in the document. `corner` false is a view without the zoom corner (Home, the phone album list). */
function Corner({ corner = true, shown = corner }: { corner?: boolean; shown?: boolean }) {
  return (
    <>
      {corner ? <ZoomControls api={api} /> : null}
      <div className="map-host">
        <NamesToggle shown={shown} />
      </div>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ namesOn: true });
});
afterEach(() => {
  useAppStore.setState({ namesOn: true });
  vi.restoreAllMocks();
});

describe('NamesToggle', () => {
  it('is an icon-only pressed button that switches the names off and on and saves the choice', () => {
    const { getByRole, unmount } = render(<Corner />);
    const button = getByRole('button', { name: 'Place names' });
    expect(COPY.map.names).toBe('Place names');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('map-names');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('stroke-width', '1.6');
    expect(button.querySelector('mask')).toBeNull();
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('mask')).not.toBeNull();
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('rmr-names')).toBe('1');
    unmount();
  });

  it('keeps one fixed accessible name in both states: only the pressed state changes', () => {
    const { getByRole, unmount } = render(<Corner />);
    const button = getByRole('button', { name: COPY.map.names });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', COPY.map.names);
    expect(getByRole('button', { name: COPY.map.names, pressed: false })).toBe(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', COPY.map.names);
    expect(getByRole('button', { name: COPY.map.names, pressed: true })).toBe(button);
    unmount();
  });

  it("draws the prototype's glyph: the same letters in both states, off at 42% behind a masked slash", () => {
    const { getByRole, unmount } = render(<Corner />);
    const button = getByRole('button', { name: COPY.map.names });
    const svg = button.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-linecap', 'round');
    expect(svg).toHaveAttribute('stroke-linejoin', 'round');
    expect(svg).toHaveAttribute('focusable', 'false');
    const glyph = (root: Element) => [...root.querySelectorAll(':scope > path, :scope > circle')].map((e) => e.outerHTML);
    const on = glyph(button.querySelector('svg')!);
    expect(on).toEqual(['<path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2"></path>', '<circle cx="17.6" cy="14.6" r="3.2"></circle>', '<path d="M20.8 11.2V18"></path>']);
    fireEvent.click(button);
    const off = button.querySelector('svg')!;
    for (const a of ['viewBox', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'aria-hidden', 'focusable']) expect(off.getAttribute(a), a).toBe(svg.getAttribute(a));
    const dim = off.querySelector('g')!;
    expect(glyph(dim)).toEqual(on);
    expect(dim).toHaveAttribute('opacity', '0.42');
    const mask = off.querySelector('mask')!;
    expect(dim).toHaveAttribute('mask', `url(#${mask.id})`);
    expect(mask).toHaveAttribute('maskUnits', 'userSpaceOnUse');
    const cut = mask.querySelector('path')!;
    expect(cut).toHaveAttribute('d', 'M1.5 22.5 22.5 1.5');
    expect(cut).toHaveAttribute('stroke-width', '4.4');
    expect(cut).toHaveAttribute('stroke-linecap', 'butt');
    expect(mask.id).toBe('rmr-names-cut');
    const slash = off.querySelector(':scope > path')!;
    expect(slash).toHaveAttribute('d', 'M4 20 20 4');
    expect(slash).toHaveAttribute('stroke-width', '1.2');
    expect(slash).toHaveAttribute('opacity', '0.95');
    unmount();
  });

  it('is the first child of the zoom corner, one button before Zoom in', () => {
    const { container, getAllByRole, unmount } = render(<Corner />);
    const zoom = container.querySelector('.map-zoom')!;
    expect(zoom.firstElementChild).toBe(getAllByRole('button')[0]);
    expect(zoom.firstElementChild).toHaveClass('map-names');
    expect(zoom.children).toHaveLength(4);
    // Document order is Tab order here (no tabindex): the toggle, then the three zoom buttons.
    expect(getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([COPY.map.names, COPY.map.zoomIn, COPY.map.zoomOut, COPY.map.reset]);
    expect(getAllByRole('button').every((b) => b.tabIndex === 0 && b.parentElement === zoom)).toBe(true);
    unmount();
    expect(document.querySelector('.map-names')).toBeNull();
  });

  it('leaves the corner as it was before it arrives: the three zoom buttons, Zoom in first', () => {
    const { container, getAllByRole, unmount } = render(<ZoomControls api={api} />);
    const zoom = container.querySelector('.map-zoom')!;
    expect(zoom.children).toHaveLength(3);
    // styles/map.css keeps the toggle's place free with `.map-zoom > button:first-child:not(.map-names)`.
    expect(zoom.querySelector(':scope > button:first-child:not(.map-names)')).toBe(getAllByRole('button', { name: COPY.map.zoomIn })[0]);
    expect(getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([COPY.map.zoomIn, COPY.map.zoomOut, COPY.map.reset]);
    unmount();
  });

  it('once it is in, no zoom button is the first child any more, so the kept place closes', () => {
    const { container, unmount } = render(<Corner />);
    expect(container.querySelector('.map-zoom > button:first-child:not(.map-names)')).toBeNull();
    expect(container.querySelector('.map-zoom > .map-names + button')).toHaveAttribute('aria-label', COPY.map.zoomIn);
    unmount();
  });

  it('comes and goes with the zoom corner, and keeps the choice across it', () => {
    const { queryByRole, rerender, unmount } = render(<Corner corner={false} />);
    expect(queryByRole('button', { name: COPY.map.names })).toBeNull();
    rerender(<Corner />);
    fireEvent.click(queryByRole('button', { name: COPY.map.names })!);
    rerender(<Corner corner={false} />);
    expect(queryByRole('button', { name: COPY.map.names })).toBeNull();
    expect(document.querySelector('.map-names')).toBeNull();
    rerender(<Corner />);
    // A new corner: the button is the first child of the one on screen, still off, drawn off.
    const button = queryByRole('button', { name: COPY.map.names, pressed: false })!;
    expect(button).toBe(document.querySelector('.map-zoom')!.firstElementChild);
    expect(button.querySelector('mask')).not.toBeNull();
    expect(document.querySelectorAll('.map-names')).toHaveLength(1);
    unmount();
  });

  it('keeps the same button, and so the keyboard focus, across a press', () => {
    const { getByRole, unmount } = render(<Corner />);
    const button = getByRole('button', { name: COPY.map.names });
    button.focus();
    fireEvent.click(button);
    expect(getByRole('button', { name: COPY.map.names })).toBe(button);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(document.activeElement).toBe(button);
    unmount();
  });

  it('follows a choice made elsewhere (the saved one applied, a test hook)', () => {
    const { getByRole, unmount } = render(<Corner />);
    const button = getByRole('button', { name: COPY.map.names });
    act(() => useAppStore.setState({ namesOn: false }));
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('mask')).not.toBeNull();
    unmount();
  });

  it('makes exactly one button under Strict Mode (mount, unmount, mount again), and it is the one that works', () => {
    const tree = (corner: boolean) => (
      <StrictMode>
        <Corner corner={corner} />
      </StrictMode>
    );
    const { getByRole, rerender, unmount } = render(tree(true));
    const check = () => {
      expect(document.querySelectorAll('.map-names')).toHaveLength(1);
      const button = getByRole('button', { name: COPY.map.names });
      expect(button).toBe(document.querySelector('.map-zoom')!.firstElementChild);
      expect(document.querySelector('.map-zoom')!.children).toHaveLength(4);
      return button;
    };
    const button = check();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(check()).toBe(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    // The corner goes and comes back, still under Strict Mode: one button again, drawn off.
    rerender(tree(false));
    expect(document.querySelectorAll('.map-names')).toHaveLength(0);
    rerender(tree(true));
    expect(check()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(check());
    expect(useAppStore.getState().namesOn).toBe(true);
    unmount();
    expect(document.querySelectorAll('.map-names')).toHaveLength(0);
  });

  it('draws nothing without the corner, even when told it is shown', () => {
    const { queryByRole, container, unmount } = render(<Corner corner={false} shown />);
    expect(queryByRole('button')).toBeNull();
    expect(container.querySelector('.map-host')!.childNodes).toHaveLength(0);
    expect(document.querySelector('.map-names')).toBeNull();
    unmount();
  });

  it('does nothing when the map re-renders around it (a hover beside an album)', () => {
    const { rerender, getByRole, unmount } = render(<Corner />);
    const button = getByRole('button', { name: COPY.map.names });
    const lookups = vi.spyOn(document, 'querySelector');
    const observed: MutationRecord[] = [];
    const mo = new MutationObserver((r) => observed.push(...r));
    mo.observe(document.body, { subtree: true, childList: true, attributes: true });
    for (let i = 0; i < 5; i++) {
      useAppStore.getState().setHot(i);
      rerender(<Corner />);
    }
    observed.push(...mo.takeRecords());
    mo.disconnect();
    expect(lookups).not.toHaveBeenCalled();
    expect(observed).toHaveLength(0);
    expect(getByRole('button', { name: COPY.map.names })).toBe(button);
    useAppStore.getState().setHot(null);
    unmount();
  });
});
