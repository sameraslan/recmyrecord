import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { useAppStore } from '@/lib/store';
import { DEFAULT_INPUT, useMapStore } from './mapStore';
import { clearNameWidths, nameWidths } from './nameWidths';
import { nameKey } from './namesLayout';
import { buildNamesWorld, createNamesPlacer, type NamesWorld } from './namesPlacer';
import { setOverlayEl } from './overlayEls';
import type { OrthoCameraLike } from './projection';

const lab = (id: string, name: string, x: number, y: number, p: number): ThemeLabel => ({ id, name, x, y, strong: true, n: 300, p, rgb: [240, 236, 228], lum: 0.3 });
const STOP_GAS = { rect: [-1.4, -1.4, 1.1, 1.4] as [number, number, number, number], px: [1829, 2048] as [number, number], sharp: [3200, 3584] as [number, number], hash: ['0123456789', 'abcdef0123'] as [string, string] };
const THEME: ThemeData = {
  v: 3,
  n: 0,
  positionsHash: 'x',
  bakeHalf: 1.75,
  gas: { sonic: STOP_GAS, balanced: STOP_GAS, mood: STOP_GAS },
  stars: { lead: [], bg: [] },
  // Raw units; the transform below doubles them and moves the centre.
  labels: { sonic: [], balanced: [lab('a', 'Warm Halo', 0.1, 0.1, 2), lab('b', 'Sombre Void', 0.25, -0.05, 1)], mood: [lab('m', 'The Quiet Deep', 0.1, 0.1, 1)] },
};
const TX = { cx: 0.1, cy: 0, s: 2 };
const W = 1440;
const H = 836;
/** 760 px per world unit: inside the names band, above the full-halo scale. */
const cam = (x = 0, y = 0, zoom = 1): OrthoCameraLike => ({ position: { x, y }, zoom, left: (-0.55 * W) / H, right: (0.55 * W) / H, top: 0.55, bottom: -0.55, view: null });
const POS = new Float32Array(200);
const EXPLORE = { ...DEFAULT_INPUT, dimmed: false, interactive: true, explore: true };

let layer: HTMLDivElement;
let els: Record<string, HTMLDivElement>;
let world: NamesWorld;
let seen: MutationObserver;
const KEYS = [nameKey('balanced', 'a'), nameKey('balanced', 'b'), nameKey('mood', 'm')];
const shown = () => KEYS.filter((k) => !els[k].classList.contains('off'));

beforeEach(() => {
  layer = document.createElement('div');
  document.body.append(layer);
  els = {};
  for (const k of KEYS) {
    const el = document.createElement('div');
    el.className = 'rn off';
    layer.append(el);
    els[k] = el;
    setOverlayEl(k, el);
  }
  setOverlayEl('names', layer);
  world = buildNamesWorld(THEME, TX);
  useMapStore.setState({ input: EXPLORE, sliderT: 0.5, insetCurrent: 0 });
  useAppStore.setState({ namesOn: true });
  seen = new MutationObserver(() => {});
  seen.observe(layer, { subtree: true, attributes: true, childList: true });
});

afterEach(() => {
  seen.disconnect();
  for (const k of KEYS) setOverlayEl(k, null);
  setOverlayEl('names', null);
  layer.remove();
  useMapStore.setState({ input: DEFAULT_INPUT, sliderT: 0.5, insetCurrent: 0 });
  useAppStore.setState({ namesOn: true });
  vi.restoreAllMocks();
});

describe('buildNamesWorld', () => {
  it('puts each label at its world point (raw units through the positions transform)', () => {
    const a = world.byStop.balanced[0];
    expect([a.wx, a.wy]).toEqual([0, 0.2]);
    expect(world.byKey.get(nameKey('mood', 'm'))).toBe(world.byStop.mood[0]);
  });
});

describe('the names placer', () => {
  it('shows the names of the stop on screen at their points, and no other stop', () => {
    const place = createNamesPlacer();
    expect(place(world, cam(), W, H, POS)).toBe(true);
    expect(shown()).toEqual(KEYS.slice(0, 2));
    // Label a is at world (0, 0.2): 760 px per unit, canvas centre (720, 418).
    expect(els[KEYS[0]].style.transform).toBe('translate3d(720.0px, 266.0px, 0) translate(-50%, -50%)');
    expect(els[KEYS[0]].style.getPropertyValue('--a')).toBe('1.00');
    expect(Number(els[KEYS[0]].style.getPropertyValue('--h'))).toBeGreaterThanOrEqual(0.65);
  });

  it('cannot place without labels or without the layer, and says so', () => {
    const place = createNamesPlacer();
    expect(place(null, cam(), W, H, POS)).toBe(false);
    setOverlayEl('names', null);
    expect(place(world, cam(), W, H, POS)).toBe(false);
    expect(shown()).toEqual([]);
  });

  it('writes nothing and measures nothing when nothing it reads has changed (a hover frame)', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    seen.takeRecords();
    const widthOf = vi.spyOn(nameWidths, 'widthOf');
    // A hover changes `hot` and the input object, nothing the names read.
    useMapStore.setState({ input: { ...EXPLORE, hot: 7 }, hoveredIndex: 7 });
    expect(place(world, cam(), W, H, POS)).toBe(true);
    expect(seen.takeRecords()).toHaveLength(0);
    expect(widthOf).not.toHaveBeenCalled();
  });

  it('moves a name only when its place changed, and lays out again when the camera moved', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    seen.takeRecords();
    place(world, cam(0.1, 0), W, H, POS);
    expect(els[KEYS[0]].style.transform).toBe('translate3d(644.0px, 266.0px, 0) translate(-50%, -50%)');
    // Only the transforms: size, fade, halo and visibility are as they were.
    expect(seen.takeRecords().every((r) => r.attributeName === 'style')).toBe(true);
    expect(shown()).toEqual(KEYS.slice(0, 2));
  });

  it('hides every name while an album is open: its focus set, or its panel in place', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    useMapStore.setState({ input: { ...EXPLORE, focus: { seed: 1, recs: [] } as never } });
    place(world, cam(), W, H, POS);
    expect(shown()).toEqual([]);
    useMapStore.setState({ input: EXPLORE });
    place(world, cam(), W, H, POS);
    expect(shown()).toHaveLength(2);
    useMapStore.setState({ input: { ...EXPLORE, insetLeft: 420 } });
    place(world, cam(), W, H, POS);
    expect(shown()).toEqual([]);
  });

  it('hides every name on the dimmed backdrop, once the map is zoomed in, and while switched off with the layer still there', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    useMapStore.setState({ input: { ...EXPLORE, dimmed: true } });
    place(world, cam(), W, H, POS);
    expect(shown()).toEqual([]);
    useMapStore.setState({ input: EXPLORE });
    place(world, cam(), W, H, POS);
    expect(shown()).toHaveLength(2);
    // Covers at 13 px or more: 0.0068 world units at 1912 px per unit and up.
    place(world, cam(0, 0.2, 2.6), W, H, POS);
    expect(shown()).toEqual([]);
    place(world, cam(), W, H, POS);
    expect(shown()).toHaveLength(2);
    useAppStore.setState({ namesOn: false });
    place(world, cam(), W, H, POS);
    expect(shown()).toEqual([]);
  });

  it('lays the names out again when their widths were measured again (the face arrived)', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    const widthOf = vi.spyOn(nameWidths, 'widthOf');
    clearNameWidths();
    place(world, cam(), W, H, POS);
    expect(widthOf).toHaveBeenCalled();
  });

  it('places again on a new layer after the names were switched off and on', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    // RegionNames renders a fresh layer with fresh, hidden names.
    const next = document.createElement('div');
    document.body.append(next);
    for (const k of KEYS) {
      const el = document.createElement('div');
      el.className = 'rn off';
      next.append(el);
      els[k] = el;
      setOverlayEl(k, el);
    }
    setOverlayEl('names', next);
    place(world, cam(), W, H, POS);
    expect(shown()).toEqual(KEYS.slice(0, 2));
    expect(els[KEYS[0]].style.transform).toBe('translate3d(720.0px, 266.0px, 0) translate(-50%, -50%)');
    next.remove();
  });

  it('marks the layer while the slider is between stops, and only then', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    expect(layer.classList.contains('is-fading')).toBe(false);
    useMapStore.setState({ input: { ...EXPLORE, stop: 'mood' }, sliderT: 0.6 });
    place(world, cam(), W, H, POS);
    expect(layer.classList.contains('is-fading')).toBe(true);
    expect(shown()).toEqual(KEYS.slice(0, 2));
    expect(Number(els[KEYS[0]].style.getPropertyValue('--a'))).toBeLessThan(1);
    seen.takeRecords();
    useMapStore.setState({ sliderT: 0.62 });
    place(world, cam(), W, H, POS);
    // Mid-fade the layer's class is not written again.
    expect(seen.takeRecords().some((r) => r.target === layer)).toBe(false);
    useMapStore.setState({ sliderT: 1 });
    place(world, cam(), W, H, POS);
    expect(layer.classList.contains('is-fading')).toBe(false);
    expect(shown()).toEqual([KEYS[2]]);
    expect(els[KEYS[2]].style.getPropertyValue('--a')).toBe('1.00');
  });
});
