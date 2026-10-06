import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';
import { STOP_T } from '../data';
import { useMapStore } from './mapStore';
import { inMotion, inStep, markStep, onStepEnd } from './motion';
import { nameWidths, nameWidthsVersion } from './nameWidths';
import { chromeBlockers, layoutNames, nameFades, nameKey, namesShown, nameZoomK, type NameCandidate, type PlacedName } from './namesLayout';
import { getOverlayEl } from './overlayEls';
import { viewBounds, visibleArea, type OrthoCameraLike } from './projection';
import { getStageTop } from './stageTop';
import { coverCssPx, pxPerWorld } from './zoomLimits';

/** Extra room kept round the album picked in Explore, CSS px. */
const PICK_CLEAR_PX = 22;
/** Names grow a little with the zoom inside their band (state/namesLayout.ts nameZoomK), which changes
 * font-size in half pixel steps while the map zooms. The cheaper version, if that ever costs smoothness, is
 * `false`: every name keeps its Overview size (zoomK 1), and a zoom then writes transforms only. */
const NAMES_SCALE_WITH_ZOOM = true;
/** On the layer while the slider is between stops (styles/map.css gives the fading letters their own layer). */
const FADING_CLASS = 'is-fading';
/** On a name that took another spot when the map came to rest, while it fades in there (styles/map.css: opacity
 * only, so its transform is the map's throughout; no canvas frame). Taken off when the fade ends. */
const FADE_CLASS = 'moved';

/** What was last written to an element, as numbers, so an unchanged value is neither formatted nor written. */
interface Written {
  x: number;
  y: number;
  fontPx: number;
  alpha: number;
  halo: number;
  off: boolean;
  spot: number;
  fade: boolean;
}
const written = new WeakMap<Element, Written>();

function stateOf(el: Element): Written {
  let w = written.get(el);
  if (!w) {
    // As RegionNames renders it: hidden, nothing set.
    w = { x: NaN, y: NaN, fontPx: 0, alpha: NaN, halo: NaN, off: true, spot: 0, fade: false };
    written.set(el, w);
  }
  return w;
}

/** `rest`: the placement the map comes to rest on. A name already showing that takes another spot there leaves
 * the old one at once and fades in on the new; one that keeps its spot is not touched. */
function show(el: HTMLElement, p: PlacedName, rest: boolean): void {
  const w = stateOf(el);
  if (rest && !w.off && w.spot !== p.spot && !w.fade) {
    el.classList.add(FADE_CLASS);
    w.fade = true;
  }
  w.spot = p.spot;
  // The layout rounds x and y to a tenth of a px.
  if (w.x !== p.x || w.y !== p.y) {
    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    w.x = p.x;
    w.y = p.y;
  }
  if (w.fontPx !== p.fontPx) {
    el.style.fontSize = `${p.fontPx}px`;
    w.fontPx = p.fontPx;
  }
  if (w.alpha !== p.alpha) {
    el.style.setProperty('--a', p.alpha.toFixed(2));
    w.alpha = p.alpha;
  }
  if (w.halo !== p.halo) {
    el.style.setProperty('--h', p.halo.toFixed(2));
    w.halo = p.halo;
  }
  if (w.off) {
    el.classList.remove('off');
    w.off = false;
  }
}

function hide(el: HTMLElement | null): void {
  if (!el) return;
  const w = stateOf(el);
  if (w.off) return;
  el.classList.add('off');
  w.off = true;
  if (w.fade) {
    el.classList.remove(FADE_CLASS);
    w.fade = false;
  }
}

/** A name's fade has run out (or was cut off): the class goes, so it never lingers on a name at rest. The one
 * listener of each names layer; it runs once per name that faded, a quarter of a second after the map rested. */
function fadeEnded(e: Event): void {
  const el = e.target as Element;
  const w = written.get(el);
  if (!w?.fade) return;
  el.classList.remove(FADE_CLASS);
  w.fade = false;
}

interface WorldLabel {
  key: string;
  label: ThemeLabel;
  wx: number;
  wy: number;
  /** The placement pass that last showed it. */
  pass: number;
}

/** A theme's labels at their world points. */
export interface NamesWorld {
  byStop: Record<StopId, WorldLabel[]>;
  byKey: Map<string, WorldLabel>;
}

/** Label points in world units (labels carry raw position units; `tx` is MapData.tx). The two multiplications
 * of ../data rawToWorld are written out here on purpose: data.ts is in the first-load chunk, and importing an
 * export of it that nothing else uses adds it to that chunk. */
export function buildNamesWorld(theme: ThemeData, tx: { cx: number; cy: number; s: number }): NamesWorld {
  const byStop = {} as Record<StopId, WorldLabel[]>;
  const byKey = new Map<string, WorldLabel>();
  for (const stop of STOP_IDS) {
    byStop[stop] = theme.labels[stop].map((label) => {
      const w: WorldLabel = { key: nameKey(stop, label.id), label, wx: (label.x - tx.cx) * tx.s, wy: (label.y - tx.cy) * tx.s, pass: 0 };
      byKey.set(w.key, w);
      return w;
    });
  }
  return { byStop, byKey };
}

/** Places the names from a camera, a canvas size (CSS px) and the albums' current positions. False when it
 * could not place: no labels yet, or no layer. */
export interface NamesPlacer {
  (world: NamesWorld | null, camera: OrthoCameraLike, width: number, height: number, positions: Float32Array): boolean;
  /** The last placement was made while the map moved: the names are owed one placement at rest. */
  pending: () => boolean;
  /** Told when a rest placement becomes owed (true) and when it no longer is (false). watchNamesRest sets it. */
  onOwed: ((owed: boolean) => void) | null;
}

/** The map is on its way somewhere: the covers' signal, or a run of steps that sets no flag (state/motion.ts). */
const moving = (s: Parameters<typeof inMotion>[0]): boolean => inStep() || inMotion(s);

/** The placement RegionNamesDriver runs on every drawn frame and when RegionNames asks: decides which region
 * names show and where (state/namesLayout.ts) and writes their transforms. It reads no layout, asks for no
 * frame and listens to nothing but the end of a name's fade (fadeEnded). It keeps what its last placement was
 * made from (18 values) and returns at once when none of them changed: a hover redraw (the pointer move path),
 * a cover fading in or the sharper gas image fading in costs those compares and nothing else, with no motion
 * flag read, no allocation and no DOM touched. No name shows while an album is open, once the map is zoomed
 * in, on the dimmed backdrop or while the names are off.
 * While the map moves (state/motion.ts: inMotion, or a run of steps with no flag, which is a held arrow key, a
 * wheel under reduced motion or a resize) a name keeps the spot it has, so names do not hop between spots
 * under a pan. The first placement at rest forgets those spots and solves the view afresh, so a view always
 * rests on the same names in the same places however it was reached; it writes only what differs. */
export function createNamesPlacer(): NamesPlacer {
  // What the last placement was made from, written in place.
  let bLayer: Element | null = null;
  let bWorld: NamesWorld | null = null;
  let bx = 0;
  let by = 0;
  let bZoom = 0;
  let bWidth = 0;
  let bHeight = 0;
  let bSliderT = 0;
  let bInset = 0;
  let bStop: StopId = 'balanced';
  let bFocus: object | null = null;
  let bSelected: number | null = null;
  let bDimmed = false;
  let bInsetLeft = 0;
  let bBottomCover = 0;
  let bNamesOn = false;
  let bTop = 0;
  let bWidths = 0;
  // The stop the slider last rested on: a morph fades its names out and the target's in.
  let rest: StopId = useMapStore.getState().input.stop;
  const sticky = new Map<string, number>();
  // Candidates are reused between placements.
  const pool: NameCandidate[] = [];
  const candidates: NameCandidate[] = [];
  let pass = 0;
  let fading = false;
  // The last placement was made in motion (spots kept from earlier views).
  let unsettled = false;
  const owe = (next: boolean): void => {
    if (unsettled === next) return;
    unsettled = next;
    place.onOwed?.(next);
  };

  const run = (world: NamesWorld | null, camera: OrthoCameraLike, width: number, height: number, positions: Float32Array): boolean => {
    // No theme data, or the names are switched off (RegionNames renders no layer): nothing to place, and
    // nothing owed. The next placement meets a new layer and solves it afresh.
    const layer = getOverlayEl('names');
    if (!world || !layer) {
      bLayer = null;
      owe(false);
      return false;
    }
    // A canvas with no size yet (or a collapsed one) has no map to place names on. Names placed in motion are
    // solved afresh once it has a size again, whatever that size is.
    if (!(width > 0 && height > 0)) {
      if (unsettled) {
        bLayer = null;
        owe(false);
      }
      return false;
    }
    const store = useMapStore.getState();
    const { input, sliderT, insetCurrent } = store;
    const namesOn = useAppStore.getState().namesOn;
    // CSS px of the canvas under the site header: 0 while the stage starts below it (state/stageTop.ts).
    const top = getStageTop();
    const widths = nameWidthsVersion();
    const { x, y } = camera.position;
    if (
      bLayer === layer &&
      bWorld === world &&
      bx === x &&
      by === y &&
      bZoom === camera.zoom &&
      bWidth === width &&
      bHeight === height &&
      bSliderT === sliderT &&
      bInset === insetCurrent &&
      bStop === input.stop &&
      bFocus === input.focus &&
      bSelected === input.selected &&
      bDimmed === input.dimmed &&
      bInsetLeft === input.insetLeft &&
      bBottomCover === input.bottomCover &&
      bNamesOn === namesOn &&
      bTop === top &&
      bWidths === widths &&
      // Nothing changed. Only when the last placement was made in motion is there more to ask: has it ended?
      (!unsettled || moving(store))
    ) {
      return true;
    }
    if (bLayer !== layer) {
      // A new layer (the names were switched off and on) starts without the class; one that outlived the placer
      // that marked it (a remount mid-fade) still has it, and loses it below.
      fading = layer.classList.contains(FADING_CLASS);
      layer.addEventListener('animationend', fadeEnded);
      layer.addEventListener('animationcancel', fadeEnded);
    } else if (bWidth !== width || bHeight !== height) {
      // The window is being resized: a run of steps, like a held key.
      markStep();
    }
    const inMove = moving(store);
    bLayer = layer;
    bWorld = world;
    bx = x;
    by = y;
    bZoom = camera.zoom;
    bWidth = width;
    bHeight = height;
    bSliderT = sliderT;
    bInset = insetCurrent;
    bStop = input.stop;
    bFocus = input.focus;
    bSelected = input.selected;
    bDimmed = input.dimmed;
    bInsetLeft = input.insetLeft;
    bBottomCover = input.bottomCover;
    bNamesOn = namesOn;
    bTop = top;
    bWidths = widths;

    // At rest every name is tried on its own point first, whatever spot it had on the way here.
    const settling = !inMove && unsettled;
    if (!inMove) sticky.clear();
    owe(inMove);
    if (sliderT === STOP_T[input.stop]) rest = input.stop;
    const coverPx = coverCssPx(camera.zoom, height);
    // An album is open from the moment its panel takes its place (insetLeft) or its focus is set, whichever
    // comes first; on a phone only the focus says so.
    const albumOpen = input.focus !== null || input.insetLeft > 0;
    // Overview and Whole map only; never beside an open album, and never on the dimmed backdrop (Home, About, 404).
    const on = namesOn && !input.dimmed && namesShown(coverPx, albumOpen);
    const now = ++pass;
    let morph = false;

    if (on) {
      const fades = nameFades(sliderT, rest, input.stop);
      // Between two stops: the leaving stop's names fade out, then the target's fade in.
      morph = fades.length !== 1 || fades[0].alpha < 1;
      // World to canvas CSS px, as state/projection.ts worldToScreen does it, with the bounds worked out once.
      const vb = viewBounds(camera);
      const sx = width / (vb.right - vb.left);
      const sy = height / (vb.top - vb.bottom);
      candidates.length = 0;
      for (const f of fades) {
        for (const w of world.byStop[f.stop]) {
          const n = candidates.length;
          let c = pool[n];
          if (!c) {
            c = { key: w.key, label: w.label, x: 0, y: 0, alpha: 0 };
            pool[n] = c;
          }
          c.key = w.key;
          c.label = w.label;
          c.x = (w.wx - x - vb.left) * sx;
          c.y = (vb.top - (w.wy - y)) * sy;
          c.alpha = f.alpha;
          candidates.push(c);
        }
      }
      if (candidates.length) {
        // The animated inset: after an album closes, names follow the map while its panel slides away.
        const inset = Math.max(0, insetCurrent);
        const phone = isNarrow();
        const blockers = chromeBlockers({ width, height, top, inset, phone, bottomCover: input.bottomCover, card: input.selected !== null });
        if (input.selected !== null) {
          // A name never sits on the album picked in Explore.
          const px = (positions[2 * input.selected] - x - vb.left) * sx;
          const py = (vb.top - (positions[2 * input.selected + 1] - y)) * sy;
          blockers.push({ left: px - PICK_CLEAR_PX, top: py - PICK_CLEAR_PX, right: px + PICK_CLEAR_PX, bottom: py + PICK_CLEAR_PX });
        }
        const visible = visibleArea(inset, width, height, 0, top);
        const placed = layoutNames({
          candidates,
          visible,
          blockers,
          phone,
          zoomK: NAMES_SCALE_WITH_ZOOM ? nameZoomK(coverPx) : 1,
          // Zoomed out past the scale label.lum holds at, layoutNames solves for label.lumWide, then the full halo.
          pxPerWorld: pxPerWorld(camera.zoom, height),
          // label.lum was measured under the name's box on a desktop. On a phone the same name covers far more
          // of the map, and mid-morph the gas is between two stops: the full halo in both cases.
          fullHalo: phone || morph,
          widthOf: nameWidths.widthOf,
          sticky,
        });
        for (const p of placed) {
          const w = world.byKey.get(p.key);
          if (w) w.pass = now;
          const el = getOverlayEl(p.key);
          if (el) show(el, p, settling);
        }
      }
    }
    for (const stop of STOP_IDS) {
      for (const w of world.byStop[stop]) if (w.pass !== now) hide(getOverlayEl(w.key));
    }
    // Written twice per morph, on its first and last frame, never in between.
    if (fading !== morph) {
      layer.classList.toggle(FADING_CLASS, morph);
      fading = morph;
    }
    return true;
  };
  const place: NamesPlacer = Object.assign(run, { pending: () => unsettled, onOwed: null });
  return place;
}

/** Calls `place` once when the map's motion has ended and the names were last placed in motion (`pending`):
 * the rest placement. A motion that ends inside a drawn frame (a tween, wheel easing, a fling) has usually been
 * placed at rest by that frame; one that ends outside a frame (pointer up on a drag or a pinch, a run of steps
 * stopping) has not, and no frame is drawn for it: the names are DOM. Checked once the current task is over,
 * as MarkerDriver does for the covers.
 * It listens to the map store only while a rest placement is owed (the placer says when: onOwed), so at rest
 * a store change, a hover included, runs no names code at all. While a drag or pinch has names owed, each of
 * its pointer moves costs this listener one call and one or two flags. Returns the stop. */
export function watchNamesRest(placer: Pick<NamesPlacer, 'pending' | 'onOwed'>, place: () => void): () => void {
  let asked = false;
  let on = true;
  let unsubscribe: (() => void) | null = null;
  const check = () => {
    asked = false;
    if (on && placer.pending() && !moving(useMapStore.getState())) place();
  };
  const listen = (s: Parameters<typeof inMotion>[0]) => {
    // The flags of a held map first: they are what a pointer move meets.
    if (asked || s.dragging || s.pinching || moving(s)) return;
    asked = true;
    queueMicrotask(check);
  };
  const owed = (next: boolean) => {
    if (next) unsubscribe ??= useMapStore.subscribe(listen);
    else if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
  placer.onOwed = owed;
  // A run of steps ends on a timer, with no store change: placed from there, if no other motion has begun.
  const offStep = onStepEnd(check);
  if (placer.pending()) owed(true);
  return () => {
    on = false;
    if (placer.onOwed === owed) placer.onOwed = null;
    offStep();
    owed(false);
  };
}
