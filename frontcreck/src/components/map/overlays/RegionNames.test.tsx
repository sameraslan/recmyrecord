import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { useAppStore } from '@/lib/store';
import { setInvalidate } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { nameWidthsVersion, setNamesPlacer } from '../state/nameWidths';
import { RegionNames } from './RegionNames';

const lab = (id: string, name: string, strong: boolean): ThemeLabel => ({ id, name, x: 0, y: 0, strong, n: 100, p: 1, rgb: [240, 236, 228], lum: 0.3 });
/** One stop's gas images as theme.json version 3 describes them (the fixture of src/lib/data/theme.test.ts); unused here. */
const STOP_GAS = { rect: [-1.4, -1.4, 1.1, 1.4] as [number, number, number, number], px: [1829, 2048] as [number, number], sharp: [3200, 3584] as [number, number], hash: ['0123456789', 'abcdef0123'] as [string, string] };
const THEME: ThemeData = {
  v: 3,
  n: 0,
  positionsHash: 'x',
  bakeHalf: 1.75,
  gas: { sonic: STOP_GAS, balanced: STOP_GAS, mood: STOP_GAS },
  stars: { lead: [], bg: [] },
  labels: { sonic: [], balanced: [lab('a', 'Warm Halo', true), lab('b', 'Eclectic Cloud', false)], mood: [lab('a', 'The Quiet Deep', true)] },
};

afterEach(() => {
  useMapStore.setState({ theme: null });
  useAppStore.setState({ namesOn: true });
  setNamesPlacer(null);
  setInvalidate(null);
});

describe('RegionNames', () => {
  it('renders nothing without theme data', () => {
    useMapStore.setState({ theme: null });
    const { container, unmount } = render(<RegionNames />);
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it('renders nothing while names are switched off', () => {
    useMapStore.setState({ theme: THEME });
    useAppStore.setState({ namesOn: false });
    const { container, unmount } = render(<RegionNames />);
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it('renders one plain, hidden name per label of every stop, and none for a stop with no labels', () => {
    useMapStore.setState({ theme: THEME });
    const { container, unmount } = render(<RegionNames />);
    const layer = container.querySelector('.rn-layer')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const names = [...container.querySelectorAll<HTMLElement>('.rn')];
    expect(names.map((n) => [n.dataset.stop, n.textContent])).toEqual([
      ['balanced', 'Warm Halo'],
      ['balanced', 'Eclectic Cloud'],
      ['mood', 'The Quiet Deep'],
    ]);
    // Hidden until the driver places them; the second Balanced name is not a strong one.
    expect(names.every((n) => n.classList.contains('off'))).toBe(true);
    expect(names.map((n) => n.classList.contains('fair'))).toEqual([false, true, false]);
    expect(names[0].style.getPropertyValue('--lc')).toBe('rgb(240,236,228)');
    // Plain lettering: nothing to focus, click or hover, and no explanation attached.
    expect(container.querySelectorAll('a, button, [tabindex], [role], [title]')).toHaveLength(0);
    unmount();
  });

  it('has the driver place the names when they appear, without drawing a map frame; switching them off draws none either', () => {
    const frame = vi.fn();
    const place = vi.fn(() => true);
    setInvalidate(frame);
    setNamesPlacer(place);
    useMapStore.setState({ theme: THEME });
    const { rerender, container, unmount } = render(<RegionNames />);
    expect(place).toHaveBeenCalledTimes(1);
    useAppStore.setState({ namesOn: false });
    rerender(<RegionNames />);
    expect(container.firstChild).toBeNull();
    useAppStore.setState({ namesOn: true });
    rerender(<RegionNames />);
    expect(place).toHaveBeenCalledTimes(2);
    expect(frame).not.toHaveBeenCalled();
    unmount();
  });

  it('asks for one map frame when the names appear before the driver is there (the driver places on its first frame)', () => {
    const frame = vi.fn();
    setInvalidate(frame);
    useMapStore.setState({ theme: THEME });
    const { unmount } = render(<RegionNames />);
    expect(frame).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('asks for one map frame when the driver is there but has no labels yet (the theme arrived after the map)', () => {
    const frame = vi.fn();
    const place = vi.fn(() => false);
    setInvalidate(frame);
    setNamesPlacer(place);
    useMapStore.setState({ theme: THEME });
    const { unmount } = render(<RegionNames />);
    expect(place).toHaveBeenCalledTimes(1);
    expect(frame).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('places again when the theme is replaced', () => {
    const place = vi.fn(() => true);
    setNamesPlacer(place);
    useMapStore.setState({ theme: THEME });
    const { rerender, unmount } = render(<RegionNames />);
    useMapStore.setState({ theme: { ...THEME, labels: { ...THEME.labels, sonic: [lab('s', 'Raw Flare', true)] } } });
    rerender(<RegionNames />);
    expect(place).toHaveBeenCalledTimes(2);
    unmount();
  });

  describe('when a font finishes loading late', () => {
    let fonts: EventTarget;
    let style: HTMLStyleElement;
    const arrive = (families: string[] | null) => {
      const e = new Event('loadingdone');
      if (families) Object.assign(e, { fontfaces: families.map((family) => ({ family })) });
      fonts.dispatchEvent(e);
    };
    beforeEach(() => {
      fonts = new EventTarget();
      Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
      style = document.createElement('style');
      style.textContent = '.rn-layer { font-family: "Tenor Sans", "Tenor Sans Fallback", sans-serif; }';
      document.head.append(style);
    });
    afterEach(() => {
      style.remove();
      Reflect.deleteProperty(document, 'fonts');
    });

    it('measures and places the names again for their own face, without drawing a map frame', () => {
      const frame = vi.fn();
      const place = vi.fn(() => true);
      setInvalidate(frame);
      setNamesPlacer(place);
      useMapStore.setState({ theme: THEME });
      const { unmount } = render(<RegionNames />);
      const v = nameWidthsVersion();
      arrive(['"Tenor Sans"']);
      expect(nameWidthsVersion()).toBe(v + 1);
      expect(place).toHaveBeenCalledTimes(2);
      // A browser that does not say which faces arrived: measure again to be safe.
      arrive(null);
      expect(nameWidthsVersion()).toBe(v + 2);
      expect(place).toHaveBeenCalledTimes(3);
      expect(frame).not.toHaveBeenCalled();
      unmount();
    });

    it('ignores a face the names do not use', () => {
      const place = vi.fn(() => true);
      setNamesPlacer(place);
      useMapStore.setState({ theme: THEME });
      const { unmount } = render(<RegionNames />);
      const v = nameWidthsVersion();
      arrive(['Cormorant Garamond']);
      expect(nameWidthsVersion()).toBe(v);
      expect(place).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('stops listening once the names are switched off, and after it unmounts', () => {
      const frame = vi.fn();
      const place = vi.fn(() => true);
      setInvalidate(frame);
      setNamesPlacer(place);
      useMapStore.setState({ theme: THEME });
      const { rerender, unmount } = render(<RegionNames />);
      useAppStore.setState({ namesOn: false });
      rerender(<RegionNames />);
      const v = nameWidthsVersion();
      arrive(['Tenor Sans']);
      expect(nameWidthsVersion()).toBe(v);
      expect(place).toHaveBeenCalledTimes(1);
      useAppStore.setState({ namesOn: true });
      rerender(<RegionNames />);
      unmount();
      arrive(['Tenor Sans']);
      expect(nameWidthsVersion()).toBe(v);
      expect(place).toHaveBeenCalledTimes(2);
      expect(frame).not.toHaveBeenCalled();
    });
  });
});
