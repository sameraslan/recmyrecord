import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { useAppStore } from '@/lib/store';
import { gasFirstBegin, gasFirstEnd, NAMES_GAS_WAIT_MS } from './gasFirst';
import { DEFAULT_INPUT, useMapStore } from './mapStore';
import { inStep, markStep, STEP_HOLD_MS } from './motion';
import { clearNameWidths, nameWidths } from './nameWidths';
import { nameKey } from './namesLayout';
import { buildNamesWorld, createNamesPlacer, watchNamesRest, type NamesPlacer, type NamesWorld } from './namesPlacer';
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
const cam = (x = 0, y = 0, zoom = 1, w = W, h = H): OrthoCameraLike => ({ position: { x, y }, zoom, left: (-0.55 * w) / h, right: (0.55 * w) / h, top: 0.55, bottom: -0.55, view: null });
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

  it('reads none of the motion flags on a frame that changed nothing the names read (a hover frame at rest)', () => {
    const place = createNamesPlacer();
    place(world, cam(), W, H, POS);
    useMapStore.setState({ input: { ...EXPLORE, hot: 7 }, hoveredIndex: 7 });
    const read: string[] = [];
    const state = useMapStore.getState();
    vi.spyOn(useMapStore, 'getState').mockReturnValue(
      new Proxy(state, {
        get(t, k) {
          read.push(String(k));
          return t[k as keyof typeof t];
        },
      }),
    );
    expect(place(world, cam(), W, H, POS)).toBe(true);
    // What the basis is compared with, and nothing of state/motion.ts inMotion.
    expect([...read].sort()).toEqual(['input', 'insetCurrent', 'sliderT']);
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

  describe('before the first gas image is on screen', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      gasFirstEnd();
      vi.useRealTimers();
    });

    it('shows no name while the gas is still loading its first image, and all of them in the placement after it', () => {
      const place = createNamesPlacer();
      gasFirstBegin(() => {});
      expect(place(world, cam(), W, H, POS)).toBe(true);
      expect(shown()).toEqual([]);
      // Nothing was written to a name: they are hidden as RegionNames rendered them.
      expect(seen.takeRecords()).toHaveLength(0);
      // Still waiting, a moving map: still none.
      place(world, cam(0.1, 0), W, H, POS);
      expect(shown()).toEqual([]);
      // The image is in (or failed, or the gas is off): the frame that shows it places the names, though
      // nothing else the placer reads has changed.
      gasFirstEnd();
      expect(place(world, cam(0.1, 0), W, H, POS)).toBe(true);
      expect(shown()).toEqual(KEYS.slice(0, 2));
      expect(els[KEYS[0]].style.transform).toBe('translate3d(644.0px, 266.0px, 0) translate(-50%, -50%)');
      // No fade mark: they come in as hidden names do.
      expect(els[KEYS[0]].className).toBe('rn');
    });

    it('never keeps them hidden for good: a slow image is given up on, and the names are placed without a frame', () => {
      const place = createNamesPlacer();
      const now = vi.fn(() => place(world, cam(), W, H, POS));
      gasFirstBegin(now);
      place(world, cam(), W, H, POS);
      expect(shown()).toEqual([]);
      vi.advanceTimersByTime(NAMES_GAS_WAIT_MS);
      expect(now).toHaveBeenCalledTimes(1);
      expect(shown()).toEqual(KEYS.slice(0, 2));
    });

    it('a map whose gas never begins (no WebGL gas) places the names at once', () => {
      const place = createNamesPlacer();
      place(world, cam(), W, H, POS);
      expect(shown()).toEqual(KEYS.slice(0, 2));
    });

    it('hides names that were showing if the gas starts over, and owes no rest placement for it', () => {
      const place = createNamesPlacer();
      place(world, cam(), W, H, POS);
      expect(shown()).toHaveLength(2);
      gasFirstBegin(() => {});
      place(world, cam(), W, H, POS);
      expect(shown()).toEqual([]);
      expect(place.pending()).toBe(false);
    });

    it('with the names switched off nothing is placed or awaited, as before', () => {
      setOverlayEl('names', null);
      const place = createNamesPlacer();
      gasFirstBegin(() => {});
      expect(place(world, cam(), W, H, POS)).toBe(false);
      gasFirstEnd();
      expect(place(world, cam(), W, H, POS)).toBe(false);
      expect(seen.takeRecords()).toHaveLength(0);
    });
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
  /** On a name that took another spot at rest (styles/map.css fades it in there). */
  const FADE = 'moved';
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
  function cold(c: OrthoCameraLike, w = W, h = H): ReturnType<typeof look> {
    const kept = own;
    mount();
    createNamesPlacer()(near, c, w, h, POS);
    const out = look();
    for (const k of [P, Q]) {
      own[k].remove();
      setOverlayEl(k, kept[k]);
    }
    own = kept;
    return out;
  }
  /** The browser's event when a name's fade has run out. */
  const fadeEnds = (el: Element) => el.dispatchEvent(new Event('animationend', { bubbles: true }));

  beforeEach(() => {
    vi.useFakeTimers();
    near = buildNamesWorld(NEAR, TX);
    mount();
    useMapStore.setState(STILL);
  });

  afterEach(() => {
    // No step may outlive its test: state/motion.ts keeps it for the page.
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
    expect(own[P].classList.contains(FADE)).toBe(false);
    expect(own[Q].classList.contains(FADE)).toBe(false);
    expect(place.pending()).toBe(true);
  });

  it('once it rests every name is where a first placement of the same view puts it, and a name that changed spot fades in there', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ dragging: true });
    place(near, cam(0, 0.2, 1), W, H, POS);
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    place(near, cam(0, 0.2, 1), W, H, POS);
    useMapStore.setState({ dragging: false });
    // Nothing about the camera changed: the placement still runs, because the last one was made in motion.
    expect(place(near, cam(0, 0.2, 1), W, H, POS)).toBe(true);
    // The name is on its new spot at once: its transform is the map's, never one on the way there.
    expect(look()).toEqual(cold(cam(0, 0.2, 1)));
    expect(place.pending()).toBe(false);
    // Only the name that changed spot fades in (styles/map.css .rn.moved); the other was not touched.
    expect(own[Q].classList.contains(FADE)).toBe(true);
    expect(own[P].classList.contains(FADE)).toBe(false);
    expect(own[P].className).toBe('rn');
  });

  it('a name still fading in follows the map exactly when the map moves again, and loses the mark when its fade ends', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ dragging: true });
    place(near, cam(0, 0.2, 1), W, H, POS);
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    place(near, cam(0, 0.2, 1), W, H, POS);
    useMapStore.setState({ dragging: false });
    place(near, cam(0, 0.2, 1), W, H, POS);
    expect(own[Q].classList.contains(FADE)).toBe(true);
    // A drag begins inside the fade: the fade goes on (opacity only), the transform is the map's.
    useMapStore.setState({ dragging: true });
    const tracked = cold(cam(0.01, 0.2, 1));
    seen.takeRecords();
    place(near, cam(0.01, 0.2, 1), W, H, POS);
    expect(own[Q].classList.contains(FADE)).toBe(true);
    expect(look()).toEqual(tracked);
    const moved = seen.takeRecords();
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((r) => r.attributeName === 'style')).toBe(true);
    // The fade ends: the mark goes, and nothing else is written.
    fadeEnds(own[Q]);
    expect(own[Q].className).toBe('rn');
    expect(seen.takeRecords().map((r) => [r.target, r.attributeName])).toEqual([[own[Q], 'class']]);
    // An event from a name that was not fading (or from its letters) writes nothing.
    fadeEnds(own[P]);
    fadeEnds(own[Q]);
    expect(seen.takeRecords()).toHaveLength(0);
    // And the next placement does not write the class again.
    place(near, cam(0.02, 0.2, 1), W, H, POS);
    expect(seen.takeRecords().every((r) => r.attributeName === 'style')).toBe(true);
    expect(own[Q].className).toBe('rn');
  });

  it('a name hidden while it fades in loses the mark with it, and is not marked when it shows again', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ dragging: true });
    place(near, cam(0, 0.2, 1), W, H, POS);
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    place(near, cam(0, 0.2, 1), W, H, POS);
    useMapStore.setState({ dragging: false });
    place(near, cam(0, 0.2, 1), W, H, POS);
    expect(own[Q].classList.contains(FADE)).toBe(true);
    useMapStore.setState({ input: { ...EXPLORE, insetLeft: 420 }, insetCurrent: 420 });
    place(near, cam(0, 0.2, 1), W, H, POS);
    expect(own[Q].className.split(' ').sort()).toEqual(['off', 'rn']);
    useMapStore.setState({ input: EXPLORE, insetCurrent: 0 });
    place(near, cam(0, 0.2, 1), W, H, POS);
    expect(own[Q].className).toBe('rn');
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
    // No name changed spot: no fade, no write of any kind.
    expect(seen.takeRecords()).toHaveLength(0);
    expect(place.pending()).toBe(false);
    // And once rested, a placement of the same view does not even lay out.
    widthOf.mockClear();
    place(near, cam(0.1, 0.2, 1), W, H, POS);
    expect(widthOf).not.toHaveBeenCalled();
    expect(seen.takeRecords()).toHaveLength(0);
  });

  it('does not fade a name that was hidden: it shows at its place', () => {
    const place = createNamesPlacer();
    useMapStore.setState({ animating: true, input: { ...EXPLORE, insetLeft: 420 } });
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    expect(look().map((n) => n[0])).toEqual([true, true]);
    useMapStore.setState({ animating: false, input: EXPLORE });
    place(near, cam(0, 0.2, 0.8), W, H, POS);
    expect(look()).toEqual(cold(cam(0, 0.2, 0.8)));
    expect(own[P].classList.contains(FADE)).toBe(false);
    expect(own[Q].classList.contains(FADE)).toBe(false);
  });

  // Motions made of single steps, each applied at once with no flag in the store. CameraRig marks a key or a
  // reduced-motion wheel step (state/motion.ts markStep); the placer sees a resize by itself.
  describe('through a motion made of steps', () => {
    /** The driver's wiring: a frame placement and the watcher's own. */
    function driver(view: () => [OrthoCameraLike, number, number]) {
      const place = createNamesPlacer();
      const atRest = vi.fn(() => {
        const [c, w, h] = view();
        place(near, c, w, h, POS);
      });
      const stop = watchNamesRest(place, atRest);
      return { place, atRest, stop };
    }

    it.each([
      // Zoomed out the two names touch and one is nudged; back in, its own point is free again.
      ['a wheel under reduced motion', [[0, 0.2, 1], [0, 0.2, 0.8], [0, 0.2, 0.9], [0, 0.2, 1]]],
      // Panned to the bottom edge both names are pushed up; panned back, their own points are free again.
      ['a held arrow key', [[0, 0.2, 1], [0, 0.725, 1], [0, 0.65, 1], [0, 0.6, 1]]],
    ] as [string, [number, number, number][]][])('%s: names keep their spots through the steps, then rest once', (_name, steps) => {
      let c = cam(...steps[0]);
      const { place, atRest, stop } = driver(() => [c, W, H]);
      place(near, c, W, H, POS);
      for (const step of steps.slice(1)) {
        // 30 ms apart, as a key repeats.
        vi.advanceTimersByTime(30);
        markStep();
        c = cam(...step);
        place(near, c, W, H, POS);
        expect(place.pending()).toBe(true);
      }
      // Not solved afresh on the last step: at least one name is still on the spot it was pushed to.
      const want = cold(c);
      expect(look()).not.toEqual(want);
      expect(own[P].classList.contains(FADE) || own[Q].classList.contains(FADE)).toBe(false);
      vi.advanceTimersByTime(STEP_HOLD_MS - 1);
      expect(atRest).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      // The one rest placement, from the timer: no frame is drawn for it.
      expect(atRest).toHaveBeenCalledTimes(1);
      expect(look()).toEqual(want);
      expect(place.pending()).toBe(false);
      expect(own[P].classList.contains(FADE) || own[Q].classList.contains(FADE)).toBe(true);
      // Nothing more afterwards, whatever the store does.
      useMapStore.setState({ hoveredIndex: 3 });
      vi.advanceTimersByTime(1000);
      expect(atRest).toHaveBeenCalledTimes(1);
      stop();
    });

    it('a resize: names keep their spots while the window changes size, then rest once', () => {
      let size: [number, number] = [W, H];
      const view = (): [OrthoCameraLike, number, number] => [cam(0, 0.2, 1, size[0], size[1]), size[0], size[1]];
      const { place, atRest, stop } = driver(view);
      place(near, ...view(), POS);
      // The first placement of a size is not a step.
      expect(inStep()).toBe(false);
      for (const h of [700, 660, 760, H]) {
        vi.advanceTimersByTime(16);
        size = [W, h];
        place(near, ...view(), POS);
        expect(inStep()).toBe(true);
        expect(place.pending()).toBe(true);
      }
      const want = cold(...view());
      expect(look()).not.toEqual(want);
      vi.advanceTimersByTime(STEP_HOLD_MS - 1);
      expect(atRest).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(atRest).toHaveBeenCalledTimes(1);
      expect(look()).toEqual(want);
      expect(place.pending()).toBe(false);
      // The rest placement itself is not a step.
      expect(inStep()).toBe(false);
      stop();
    });

    it('a step that ends inside a flagged motion waits for that motion', async () => {
      let c = cam(0, 0.2, 1);
      const { place, atRest, stop } = driver(() => [c, W, H]);
      place(near, c, W, H, POS);
      markStep();
      c = cam(0, 0.2, 0.8);
      place(near, c, W, H, POS);
      useMapStore.setState({ dragging: true });
      vi.advanceTimersByTime(STEP_HOLD_MS);
      expect(atRest).not.toHaveBeenCalled();
      useMapStore.setState({ dragging: false });
      await Promise.resolve();
      expect(atRest).toHaveBeenCalledTimes(1);
      stop();
    });
  });

  describe('when it cannot place', () => {
    it('owes nothing once the names were switched off in the middle of a motion: no placement on later store changes', async () => {
      const place = createNamesPlacer();
      const atRest = vi.fn(() => place(near, cam(0, 0.2, 1), W, H, POS));
      const stop = watchNamesRest(place, atRest);
      useMapStore.setState({ dragging: true });
      place(near, cam(0, 0.2, 1), W, H, POS);
      place(near, cam(0, 0.2, 0.8), W, H, POS);
      expect(place.pending()).toBe(true);
      // The toggle: RegionNames renders no layer. No frame is drawn before the drag ends.
      setOverlayEl('names', null);
      useMapStore.setState({ dragging: false });
      await Promise.resolve();
      expect(place.pending()).toBe(false);
      // Hovers at rest: nothing runs.
      for (let i = 0; i < 5; i++) {
        useMapStore.setState({ hoveredIndex: i });
        await Promise.resolve();
      }
      expect(atRest.mock.calls.length).toBeLessThanOrEqual(1);
      stop();
    });

    it('owes nothing while the canvas has no size, and solves the view afresh once it has one again', () => {
      const place = createNamesPlacer();
      useMapStore.setState({ dragging: true });
      place(near, cam(0, 0.2, 1), W, H, POS);
      place(near, cam(0, 0.2, 0.8), W, H, POS);
      place(near, cam(0, 0.2, 1), W, H, POS);
      expect(place.pending()).toBe(true);
      useMapStore.setState({ dragging: false });
      expect(place(near, cam(0, 0.2, 1), W, 0, POS)).toBe(false);
      expect(place.pending()).toBe(false);
      // The same view and size as the last placement: still laid out, on the names' own spots.
      expect(place(near, cam(0, 0.2, 1), W, H, POS)).toBe(true);
      expect(look()).toEqual(cold(cam(0, 0.2, 1)));
    });
  });
});

describe('the names at rest on the real theme', () => {
  const STILL = { dragging: false, pinching: false, animating: false, rigMoving: false, nudging: false, morphing: false };
  const theme = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../public/data/theme/theme.json'), 'utf8')) as ThemeData;
  // public/data/positions.json's transform is not needed: any transform that puts the cloud on screen will do.
  // Raw label points span about 3 units; this one puts them in a box about 2.2 world units wide.
  const xs = theme.labels.balanced.map((l) => l.x);
  const ys = theme.labels.balanced.map((l) => l.y);
  const tx = { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, s: 1.6 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) };
  const keys = theme.labels.balanced.map((l) => nameKey('balanced', l.id));
  let real: NamesWorld;
  let own: Record<string, HTMLDivElement>;

  function mount(): void {
    own = {};
    for (const k of keys) {
      const el = document.createElement('div');
      el.className = 'rn off';
      layer.append(el);
      own[k] = el;
      setOverlayEl(k, el);
    }
  }
  const look = () => keys.map((k) => (own[k].classList.contains('off') ? 'off' : `${own[k].style.transform} ${own[k].style.getPropertyValue('--h')} ${own[k].style.fontSize}`));
  /** A small seeded generator (mulberry32), so a failure can be run again. */
  function seeded(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    real = buildNamesWorld(theme, tx);
    useMapStore.setState(STILL);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    for (const k of keys) setOverlayEl(k, null);
    useMapStore.setState(STILL);
  });

  it('has the 17 Balanced names of the committed theme', () => {
    expect(keys).toHaveLength(17);
  });

  // The four window sizes the names were measured at, each at a Whole map zoom that shows the whole cloud.
  it.each([
    [1440, 790],
    [1366, 768],
    [1440, 900],
    [1600, 1000],
  ])('at %i x %i: random routes under every kind of motion all rest on the first placement of the view', (w, h) => {
    const end = cam(0, 0, 0.5, w, h);
    mount();
    createNamesPlacer()(real, end, w, h, POS);
    const want = look();
    const shownAtRest = want.filter((n) => n !== 'off').length;
    // The view is a crowded one: most names show, and some of them off their own point.
    expect(shownAtRest).toBeGreaterThanOrEqual(12);
    const rand = seeded(w * 31 + h);
    const kinds: (Partial<typeof STILL> | 'step')[] = [{ dragging: true }, { animating: true }, { rigMoving: true }, { pinching: true }, { nudging: true }, 'step'];
    let differed = 0;
    for (let route = 0; route < 24; route++) {
      for (const k of keys) own[k].remove();
      mount();
      const place = createNamesPlacer();
      const kind = kinds[route % kinds.length];
      if (kind !== 'step') useMapStore.setState({ ...STILL, ...kind });
      // A walk of pans and zooms that ends on the view.
      const n = 4 + Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) {
        const k = 1 - (i + 1) / n;
        const c = cam((rand() - 0.5) * 1.2 * k, (rand() - 0.5) * 1.2 * k, 0.5 * Math.exp((rand() - 0.5) * 2.4 * k), w, h);
        if (kind === 'step') markStep();
        place(real, i === n - 1 ? end : c, w, h, POS);
      }
      expect(place.pending(), `route ${route}`).toBe(true);
      if (look().join('|') !== want.join('|')) differed++;
      // The motion ends: one placement of the same view.
      useMapStore.setState(STILL);
      vi.advanceTimersByTime(STEP_HOLD_MS);
      place(real, end, w, h, POS);
      expect(look(), `route ${route}`).toEqual(want);
      expect(place.pending()).toBe(false);
    }
    // The routes do leave names on other spots than the first placement's, or this would prove nothing.
    expect(differed).toBeGreaterThan(0);
    for (const k of keys) own[k].remove();
  });
});

describe('watchNamesRest', () => {
  const STILL = { dragging: false, pinching: false, animating: false, rigMoving: false, nudging: false, morphing: false };
  /** A placer as the watcher sees it: whether a rest placement is owed, and where it reports that changing. */
  function owing(start = false): Pick<NamesPlacer, 'pending' | 'onOwed'> & { set: (owed: boolean) => void } {
    let owed = start;
    const p = {
      pending: () => owed,
      onOwed: null as NamesPlacer['onOwed'],
      set(next: boolean) {
        if (owed === next) return;
        owed = next;
        p.onOwed?.(next);
      },
    };
    return p;
  }
  /** How many listeners the map store has through `subscribe` calls made since. */
  function countSubscribers(): () => number {
    let n = 0;
    const subscribe = useMapStore.subscribe;
    vi.spyOn(useMapStore, 'subscribe').mockImplementation(((fn: Parameters<typeof subscribe>[0]) => {
      n++;
      const off = subscribe(fn);
      let gone = false;
      return () => {
        if (!gone) n--;
        gone = true;
        off();
      };
    }) as typeof subscribe);
    return () => n;
  }
  afterEach(() => useMapStore.setState(STILL));

  it('places once, after the task, when a motion ends and the last placement was made in motion', async () => {
    const placer = owing();
    const place = vi.fn(() => placer.set(false));
    useMapStore.setState({ ...STILL, dragging: true });
    const stop = watchNamesRest(placer, place);
    // A frame of the drag placed the names in motion.
    placer.set(true);
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
    const placer = owing();
    const place = vi.fn();
    useMapStore.setState({ ...STILL, animating: true });
    const stop = watchNamesRest(placer, place);
    placer.set(true);
    // The frame that ended the tween placed at rest before the task was over.
    useMapStore.setState({ animating: false });
    placer.set(false);
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
    // A motion ends and another begins in the same task.
    useMapStore.setState({ animating: true });
    placer.set(true);
    useMapStore.setState({ animating: false });
    useMapStore.setState({ rigMoving: true });
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
    stop();
    useMapStore.setState({ rigMoving: false });
    await Promise.resolve();
    expect(place).not.toHaveBeenCalled();
  });

  it('listens to the store only while a rest placement is owed: at rest a hover runs no names code at all', async () => {
    const subscribers = countSubscribers();
    const placer = owing();
    const pending = vi.spyOn(placer, 'pending');
    const place = vi.fn(() => placer.set(false));
    const stop = watchNamesRest(placer, place);
    expect(subscribers()).toBe(0);
    pending.mockClear();
    for (let i = 0; i < 5; i++) useMapStore.setState({ hoveredIndex: i, input: { ...useMapStore.getState().input, hot: i } });
    await Promise.resolve();
    expect(pending).not.toHaveBeenCalled();
    expect(place).not.toHaveBeenCalled();
    // A motion's first placement: one listener. Its rest placement: none again.
    useMapStore.setState({ dragging: true });
    placer.set(true);
    expect(subscribers()).toBe(1);
    placer.set(true);
    expect(subscribers()).toBe(1);
    useMapStore.setState({ dragging: false });
    await Promise.resolve();
    expect(place).toHaveBeenCalledTimes(1);
    expect(subscribers()).toBe(0);
    // A motion that the frame itself brought to rest: the listener goes with it.
    placer.set(true);
    expect(subscribers()).toBe(1);
    placer.set(false);
    expect(subscribers()).toBe(0);
    // Owed when the watching began (the driver's effect ran again mid-motion): armed from the start.
    stop();
    placer.set(true);
    expect(subscribers()).toBe(0);
    const again = watchNamesRest(placer, place);
    expect(subscribers()).toBe(1);
    again();
    expect(subscribers()).toBe(0);
    expect(placer.onOwed).toBeNull();
  });

  it('with the real placer: no listener before a motion, one through it, none once the names rest', () => {
    const subscribers = countSubscribers();
    const place = createNamesPlacer();
    const stop = watchNamesRest(place, () => place(world, cam(0.1, 0), W, H, POS));
    place(world, cam(), W, H, POS);
    expect(subscribers()).toBe(0);
    useMapStore.setState({ animating: true });
    place(world, cam(0.05, 0), W, H, POS);
    place(world, cam(0.1, 0), W, H, POS);
    expect(subscribers()).toBe(1);
    // The tween's last frame places at rest.
    useMapStore.setState({ animating: false });
    place(world, cam(0.1, 0), W, H, POS);
    expect(subscribers()).toBe(0);
    stop();
  });

  it('on a drag, a pointer move costs the watcher one look at the drag flag and nothing else', () => {
    const placer = owing();
    const place = vi.fn();
    useMapStore.setState({ ...STILL, dragging: true });
    placer.set(true);
    const pending = vi.spyOn(placer, 'pending');
    const read: string[] = [];
    type Subscribe = typeof useMapStore.subscribe;
    // What the watcher's listener reads of the state it is handed.
    let listener: Parameters<Subscribe>[0] | null = null;
    vi.spyOn(useMapStore, 'subscribe').mockImplementation(((fn: Parameters<Subscribe>[0]) => {
      listener = fn;
      return () => {};
    }) as Subscribe);
    const again = watchNamesRest(placer, place);
    const state = useMapStore.getState();
    const spied = new Proxy(state, {
      get(t, k) {
        read.push(String(k));
        return t[k as keyof typeof t];
      },
    });
    expect(listener).not.toBeNull();
    pending.mockClear();
    listener!(spied, spied);
    expect(read).toEqual(['dragging']);
    expect(pending).not.toHaveBeenCalled();
    again();
  });
});
