import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';
import { STOP_T } from '../data';
import { useMapStore } from './mapStore';
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

/** What was last written to an element, as numbers, so an unchanged value is neither formatted nor written. */
interface Written {
  x: number;
  y: number;
  fontPx: number;
  alpha: number;
  halo: number;
  off: boolean;
}
const written = new WeakMap<Element, Written>();

function stateOf(el: Element): Written {
  let w = written.get(el);
  if (!w) {
    // As RegionNames renders it: hidden, nothing set.
    w = { x: NaN, y: NaN, fontPx: 0, alpha: NaN, halo: NaN, off: true };
    written.set(el, w);
  }
  return w;
}

function show(el: HTMLElement, p: PlacedName): void {
  const w = stateOf(el);
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
export type NamesPlacer = (world: NamesWorld | null, camera: OrthoCameraLike, width: number, height: number, positions: Float32Array) => boolean;

/** The placement RegionNamesDriver runs on every drawn frame and when RegionNames asks: decides which region
 * names show and where (state/namesLayout.ts) and writes their transforms. It reads no layout, listens to
 * nothing and asks for no frame. It keeps what its last placement was made from (18 values) and returns at
 * once when none of them changed: a hover redraw (the pointer move path), a cover fading in or the sharper gas
 * image fading in costs those compares and nothing else, with no allocation and no DOM touched. No name shows
 * while an album is open, once the map is zoomed in, on the dimmed backdrop or while the names are off. */
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

  return (world, camera, width, height, positions) => {
    // No theme data, or the names are switched off (RegionNames renders no layer): nothing to place.
    const layer = getOverlayEl('names');
    if (!world || !layer) {
      bLayer = null;
      return false;
    }
    const { input, sliderT, insetCurrent } = useMapStore.getState();
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
      bWidths === widths
    ) {
      return true;
    }
    // A new layer (the names were switched off and on) starts without the class.
    if (bLayer !== layer) fading = false;
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
        const visible = visibleArea(inset, width, height, 0);
        visible.top = top;
        const placed = layoutNames({
          candidates,
          visible,
          blockers,
          phone,
          zoomK: NAMES_SCALE_WITH_ZOOM ? nameZoomK(coverPx) : 1,
          // Zoomed out past the scale label.lum holds at, layoutNames gives every name the full halo.
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
          if (el) show(el, p);
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
}
