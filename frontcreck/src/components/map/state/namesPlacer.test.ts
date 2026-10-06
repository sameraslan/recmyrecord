import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { useAppStore } from '@/lib/store';
import { DEFAULT_INPUT, useMapStore } from './mapStore';
import { clearNameWidths, nameWidths } from './nameWidths';
import { nameKey } from './namesLayout';
import { buildNamesWorld, createNamesPlacer, watchNamesRest, type NamesWorld } from './namesPlacer';
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

  it('takes the fading mark off a layer that still carries it when the placer first meets it (a remount mid-fade)', () => {
    // The layer outlived the placer that marked it: a new driver, the old class.
    layer.classList.add('is-fading');
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    expect(layer.classList.contains('is-fading')).toBe(false);
    // And a layer that is rightly marked is not written again.
    const next = createNamesPlacer();
    useMapStore.setState({ input: { ...EXPLORE, stop: 'mood' }, sliderT: 0.6 });
    place(world, cam(), W, H, POS);
    expect(layer.classList.contains('is-fading')).toBe(true);
    seen.takeRecords();
    next(world, cam(), W, H, POS);
    expect(layer.classList.contains('is-fading')).toBe(true);
    expect(seen.takeRecords().some((r) => r.target === layer)).toBe(false);
  });

  it('places nothing and says so while the canvas has no width or no height, then places once it has both', () => {
    const place = createNamesPlacer();
    expect(place(world, cam(), 0, H, POS)).toBe(false);
    expect(place(world, cam(), W, 0, POS)).toBe(false);
    expect(place(world, cam(), 0, 0, POS)).toBe(false);
    expect(shown()).toEqual([]);
    expect(seen.takeRecords()).toHaveLength(0);
    expect(place(world, cam(), W, H, POS)).toBe(true);
    expect(shown()).toEqual(KEYS.slice(0, 2));
    // Names already shown stay as they are through a moment without a size.
    seen.takeRecords();
    expect(place(world, cam(), W, 0, POS)).toBe(false);
    expect(seen.takeRecords()).toHaveLength(0);
    expect(place(world, cam(), W, H, POS)).toBe(true);
    expect(shown()).toEqual(KEYS.slice(0, 2));
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

describe('the names at rest', () => {
  // Two names 0.04 world units apart, one above the other: clear of each other at 760 px per world unit
  // (30 px), touching at 608 (24 px), where the lower priority one is nudged.
  const NEAR: ThemeData = { ...THEME, labels: { sonic: [], balanced: [lab('p', 'Warm Halo', 0.1, 0.1, 2), lab('q', 'Sombre Void', 0.1, 0.12, 1)], mood: [] } };
  const P = nameKey('balanced', 'p');
  const Q = nameKey('balanced', 'q');
  let near: NamesWorld;
  let own: Record<string, HTMLDivElement>;
  const STILL = { dragging: false, pinching: false, animating: false, rigMoving: false, nudging: false, morphing: false };

  /** Fresh, hidden elements for the two names, as RegionNames renders them. */
  function mount(): void {
    own = {};
    for (const k of [P, Q]) {
      own[k]?.remove();
      const el = document.createElement('div');
      el.className = 'rn off';
      layer.append(el);
      own[k] = el;
      setOverlayEl(k, el);
    }
  }
  const look = () => [P, Q].map((k) => [own[k].classList.contains('off'), own[k].style.transform, own[k].style.getPropertyValue('--h'), own[k].style.fontSize]);
  /** What a placer that has seen nothing else shows for this view. */
  function cold(c: OrthoCameraLike): ReturnType<typeof look> {
    const kept = own;
    mount();
    createNamesPlacer()(near, c, W, H, POS);
    const out = look();
    for (const k of [P, Q]) {
      own[k].remove();
      setOverlayEl(k, kept[k]);
    }
    own = kept;
    return out;
  }

  beforeEach(() => {
    near = buildNamesWorld(NEAR, TX);
    mount();
    useMapStore.setState(STILL);
  });

  afterEach(() => {
    for (const k of [P, Q]) setOverlayEl(k, null);
    useMapStore.setState(STILL);
  });

  it('while the map moves a nudged name keeps its nudged spot after its own point is free again, as before', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ dragging: true });
    place(near, cam(0, 0.2, 1), W, H, POS);
    const free = own[Q].style.transform;
    expect(look()).toEqual(cold(cam(0, 0.2, 1)));
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    place(near, cam(0, 0.2, 1), W, H, POS);
    expect(own[Q].style.transform).not.toBe(free);
    expect(own[P].classList.contains('ease')).toBe(false);
    expect(own[Q].classList.contains('ease')).toBe(false);
    expect(place.pending()).toBe(true);
  });

  it('once it rests every name is where a first placement of the same view puts it, and a name that changed spot eases there', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ dragging: true });
    place(near, cam(0, 0.2, 1), W, H, POS);
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    place(near, cam(0, 0.2, 1), W, H, POS);
    useMapStore.setState({ dragging: false });
    // Nothing about the camera changed: the placement still runs, because the last one was made in motion.
    expect(place(near, cam(0, 0.2, 1), W, H, POS)).toBe(true);
    expect(look()).toEqual(cold(cam(0, 0.2, 1)));
    expect(place.pending()).toBe(false);
    // Only the name that changed spot is eased (styles/map.css .rn.ease); the other was not touched.
    expect(own[Q].classList.contains('ease')).toBe(true);
    expect(own[P].classList.contains('ease')).toBe(false);
    // The next motion takes the ease off before it moves the name, so the name follows the map again.
    useMapStore.setState({ dragging: true });
    place(near, cam(0.01, 0.2, 1), W, H, POS);
    expect(own[Q].classList.contains('ease')).toBe(false);
  });

  it('rests on the same names in the same places whatever pans and zooms led to the view', () => {
    const end = cam(0.02, 0.21, 0.9);
    const want = cold(end);
    const routes: [number, number, number][][] = [
      [[0, 0.2, 1], [0, 0.2, 0.8], [0.02, 0.21, 0.9]],
      [[0, 0.2, 0.5], [0, 0.2, 0.7], [0.3, 0.2, 0.7], [0.02, 0.21, 0.9]],
      [[0.02, 0.21, 2], [0.02, 0.21, 0.6], [0.02, 0.21, 1.4], [0.02, 0.21, 0.9]],
      [[0, 0.5, 0.8], [0, 0.2, 0.8], [0, 0.2, 0.75], [0.02, 0.21, 0.9]],
    ];
    const flags = [{ dragging: true }, { animating: true }, { rigMoving: true }, { pinching: true }];
    routes.forEach((route, i) => {
      mount();
      const place = createNamesPlacer();
      useMapStore.setState({ ...STILL, ...flags[i] });
      for (const [x, y, z] of route) place(near, cam(x, y, z), W, H, POS);
      useMapStore.setState(STILL);
      place(near, end, W, H, POS);
      expect(look(), `route ${i}`).toEqual(want);
    });
  });

  it('writes nothing at rest when the names already are where a first placement puts them', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ animating: true });
    place(near, cam(0, 0.2, 1), W, H, POS);
    place(near, cam(0.05, 0.2, 1), W, H, POS);
    place(near, cam(0.1, 0.2, 1), W, H, POS);
    seen.takeRecords();
    const widthOf = vi.spyOn(nameWidths, 'widthOf');
    useMapStore.setState({ animating: false });
    expect(place.pending()).toBe(true);
    place(near, cam(0.1, 0.2, 1), W, H, POS);
    expect(seen.takeRecords()).toHaveLength(0);
    expect(place.pending()).toBe(false);
    // And once rested, a placement of the same view does not even lay out.
    widthOf.mockClear();
    place(near, cam(0.1, 0.2, 1), W, H, POS);
    expect(widthOf).not.toHaveBeenCalled();
    expect(seen.takeRecords()).toHaveLength(0);
  });

  it('does not ease a name that was hidden: it shows at its place', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ animating: true, input: { ...EXPLORE, insetLeft: 420 } });
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    expect(look().map((n) => n[0])).toEqual([true, true]);
    useMapStore.setState({ animating: false, input: EXPLORE });
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    expect(look()).toEqual(cold(cam(0, 0.2, 0.8)));
    expect(own[P].classList.contains('ease')).toBe(false);
    expect(own[Q].classList.contains('ease')).toBe(false);
  });
});

describe('watchNamesRest', () => {
  const STILL = { dragging: false, pinching: false, animating: false, rigMoving: false, nudging: false, morphing: false };
  afterEach(() => useMapStore.setState(STILL));

  it('places once, after the task, when a motion ends and the last placement was made in motion', async () => {
    let pending = true;
    const place = vi.fn(() => {
      pending = false;
    });
    useMapStore.setState({ ...STILL, dragging: true });
    const stop = watchNamesRest(() => pending, place);
    // Still moving: nothing.
    useMapStore.setState({ hoveredIndex: 3 });
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
    // The drag ends (two store writes in one task): one placement, not in the store's own notification.
    useMapStore.setState({ dragging: false });
    useMapStore.setState({ hoveredIndex: 4 });
    expect(place).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(place).toHaveBeenCalledTimes(1);
    // Rested: later store changes (a hover) ask for nothing.
    useMapStore.setState({ hoveredIndex: 5 });
    await Promise.resolve();
    expect(place).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not place when the motion ended inside a frame that already placed, when another motion began, or after it stopped watching', async () => {
    let pending = true;
    const place = vi.fn();
    useMapStore.setState({ ...STILL, animating: true });
    const stop = watchNamesRest(() => pending, place);
    // The frame that ended the tween placed at rest before the task was over.
    useMapStore.setState({ animating: false });
    pending = false;
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
    // A motion ends and another begins in the same task.
    pending = true;
    useMapStore.setState({ animating: true });
    useMapStore.setState({ animating: false });
    useMapStore.setState({ rigMoving: true });
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
    stop();
    useMapStore.setState({ rigMoving: false });
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
  });
});
