'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import type { ThemeLabel } from '@/lib/data/theme';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';
import { STOP_T, rawToWorld } from '../data';
import { useMapStore } from '../state/mapStore';
import { nameWidths, nameWidthsVersion, setNamesPlacer } from '../state/nameWidths';
import { chromeBlockers, layoutNames, nameFades, nameKey, namesShown, nameZoomK, type NameCandidate, type PlacedName } from '../state/namesLayout';
import { getOverlayEl } from '../state/overlayEls';
import { viewBounds, visibleArea } from '../state/projection';
import { getStageTop } from '../state/stageTop';
import { coverCssPx, pxPerWorld } from '../state/zoomLimits';

/** Extra room kept round the album picked in Explore, CSS px. */
const PICK_CLEAR_PX = 22;
/** Names grow a little with the zoom inside their band (state/namesLayout.ts nameZoomK), which changes
 * font-size in half pixel steps while the map zooms. The cheaper version, if that ever costs smoothness, is
 * `false`: every name keeps its Overview size (zoomK 1), and a zoom then writes transforms only. */
const NAMES_SCALE_WITH_ZOOM = true;

/** What the driver last wrote to an element, so an unchanged value is never written again. */
interface Written {
  transform: string;
  fontPx: number;
  alpha: string;
  halo: string;
  off: boolean;
}
const written = new WeakMap<Element, Written>();

function stateOf(el: Element): Written {
  let w = written.get(el);
  if (!w) {
    // As RegionNames renders it: hidden, nothing set.
    w = { transform: '', fontPx: 0, alpha: '', halo: '', off: true };
    written.set(el, w);
  }
  return w;
}

function show(el: HTMLElement, p: PlacedName): void {
  const w = stateOf(el);
  const transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
  if (w.transform !== transform) {
    el.style.transform = transform;
    w.transform = transform;
  }
  if (w.fontPx !== p.fontPx) {
    el.style.fontSize = `${p.fontPx}px`;
    w.fontPx = p.fontPx;
  }
  const alpha = p.alpha.toFixed(2);
  if (w.alpha !== alpha) {
    el.style.setProperty('--a', alpha);
    w.alpha = alpha;
  }
  const halo = p.halo.toFixed(2);
  if (w.halo !== halo) {
    el.style.setProperty('--h', halo);
    w.halo = halo;
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

/** What the last placement was made from. A drawn frame that changes none of these (a hover redraw, which is the
 * pointer move path; a cover fading in; part 1's sharper gas image fading in) places nothing and writes nothing.
 * One object for the driver's life, written in place. */
interface Basis {
  layer: Element | null;
  world: object | null;
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  sliderT: number;
  inset: number;
  stop: StopId;
  focus: object | null;
  selected: number | null;
  dimmed: boolean;
  insetLeft: number;
  bottomCover: number;
  namesOn: boolean;
  top: number;
  widths: number;
}

/** Decides which region names show and where (state/namesLayout.ts) and writes their transforms: on every
 * rendered frame, and when RegionNames asks (state/nameWidths.ts placeNamesNow). It never asks for a frame,
 * listens to nothing and reads no layout, so nothing happens at rest. No name shows while an album is open,
 * once the map is zoomed in, or on the dimmed backdrop. */
export function RegionNamesDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const theme = useMapStore((s) => s.theme);
  const data = useMapStore((s) => s.data);
  // Label points in world units, once per theme (labels carry raw position units).
  const world = useMemo(() => {
    if (!theme || !data) return null;
    const byStop = {} as Record<StopId, WorldLabel[]>;
    const byKey = new Map<string, WorldLabel>();
    for (const stop of STOP_IDS) {
      byStop[stop] = theme.labels[stop].map((label) => {
        const [wx, wy] = rawToWorld(data, label.x, label.y);
        const w: WorldLabel = { key: nameKey(stop, label.id), label, wx, wy, pass: 0 };
        byKey.set(w.key, w);
        return w;
      });
    }
    return { byStop, byKey };
  }, [theme, data]);
  // The stop the slider last rested on: a morph fades its names out and the target's in.
  const rest = useRef<StopId>(useMapStore.getState().input.stop);
  const sticky = useRef(new Map<string, number>());
  const last = useRef<Basis>({ layer: null, world: null, x: 0, y: 0, zoom: 0, width: 0, height: 0, sliderT: 0, inset: 0, stop: 'balanced', focus: null, selected: null, dimmed: false, insetLeft: 0, bottomCover: 0, namesOn: false, top: 0, widths: 0 });
  // Candidates are reused between placements: a moving map allocates none here.
  const pool = useRef<NameCandidate[]>([]);
  const candidates = useRef<NameCandidate[]>([]);
  const pass = useRef(0);

  const place = () => {
    const b = last.current;
    // No theme data, or the names are switched off (RegionNames renders no layer): nothing to place.
    const layer = getOverlayEl('names');
    if (!world || !layer) {
      b.layer = null;
      return;
    }
    const { input, sliderT, insetCurrent } = useMapStore.getState();
    const { width, height } = get().size;
    const namesOn = useAppStore.getState().namesOn;
    // CSS px of the canvas under the site header: 0 while the stage starts below it (state/stageTop.ts).
    const top = getStageTop();
    const widths = nameWidthsVersion();
    const { x, y } = camera.position;
    if (
      b.layer === layer &&
      b.world === world &&
      b.x === x &&
      b.y === y &&
      b.zoom === camera.zoom &&
      b.width === width &&
      b.height === height &&
      b.sliderT === sliderT &&
      b.inset === insetCurrent &&
      b.stop === input.stop &&
      b.focus === input.focus &&
      b.selected === input.selected &&
      b.dimmed === input.dimmed &&
      b.insetLeft === input.insetLeft &&
      b.bottomCover === input.bottomCover &&
      b.namesOn === namesOn &&
      b.top === top &&
      b.widths === widths
    ) {
      return;
    }
    b.layer = layer;
    b.world = world;
    b.x = x;
    b.y = y;
    b.zoom = camera.zoom;
    b.width = width;
    b.height = height;
    b.sliderT = sliderT;
    b.inset = insetCurrent;
    b.stop = input.stop;
    b.focus = input.focus;
    b.selected = input.selected;
    b.dimmed = input.dimmed;
    b.insetLeft = input.insetLeft;
    b.bottomCover = input.bottomCover;
    b.namesOn = namesOn;
    b.top = top;
    b.widths = widths;

    if (sliderT === STOP_T[input.stop]) rest.current = input.stop;
    const coverPx = coverCssPx(camera.zoom, height);
    // An album is open from the moment its panel takes its place (insetLeft) or its focus is set, whichever
    // comes first; on a phone only the focus says so.
    const albumOpen = input.focus !== null || input.insetLeft > 0;
    // Overview and Whole map only; never beside an open album, and never on the dimmed backdrop (Home, About, 404).
    const on = namesOn && !input.dimmed && namesShown(coverPx, albumOpen);
    const now = ++pass.current;

    if (on) {
      const fades = nameFades(sliderT, rest.current, input.stop);
      // World to canvas CSS px, as state/projection.ts worldToScreen does it, with the bounds worked out once.
      const vb = viewBounds(camera);
      const sx = width / (vb.right - vb.left);
      const sy = height / (vb.top - vb.bottom);
      const cands = candidates.current;
      cands.length = 0;
      for (const f of fades) {
        for (const w of world.byStop[f.stop]) {
          const n = cands.length;
          let c = pool.current[n];
          if (!c) {
            c = { key: w.key, label: w.label, x: 0, y: 0, alpha: 0 };
            pool.current[n] = c;
          }
          c.key = w.key;
          c.label = w.label;
          c.x = (w.wx - x - vb.left) * sx;
          c.y = (vb.top - (w.wy - y)) * sy;
          c.alpha = f.alpha;
          cands.push(c);
        }
      }
      if (cands.length) {
        // The animated inset: after an album closes, names follow the map while its panel slides away.
        const inset = Math.max(0, insetCurrent);
        const phone = isNarrow();
        const blockers = chromeBlockers({ width, height, top, inset, phone, bottomCover: input.bottomCover, card: input.selected !== null });
        if (input.selected !== null) {
          // A name never sits on the album picked in Explore.
          const pos = positionsRef.current;
          const px = (pos[2 * input.selected] - x - vb.left) * sx;
          const py = (vb.top - (pos[2 * input.selected + 1] - y)) * sy;
          blockers.push({ left: px - PICK_CLEAR_PX, top: py - PICK_CLEAR_PX, right: px + PICK_CLEAR_PX, bottom: py + PICK_CLEAR_PX });
        }
        const visible = visibleArea(inset, width, height, 0);
        visible.top = top;
        const placed = layoutNames({
          candidates: cands,
          visible,
          blockers,
          phone,
          zoomK: NAMES_SCALE_WITH_ZOOM ? nameZoomK(coverPx) : 1,
          // Under 600 px per world unit layoutNames gives every name the full halo.
          pxPerWorld: pxPerWorld(camera.zoom, height),
          // label.lum was measured under the name's box on a desktop. On a phone the same name covers far more
          // of the map, and mid-morph the gas is between two stops: the full halo in both cases.
          fullHalo: phone || fades.length !== 1 || fades[0].alpha < 1,
          widthOf: nameWidths.widthOf,
          sticky: sticky.current,
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
  };

  // The latest placement, for RegionNames to call when only the names changed (no map frame is drawn for it).
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  });
  useEffect(() => {
    setNamesPlacer(() => placeRef.current());
    return () => setNamesPlacer(null);
  }, []);

  useFrame(place);

  return null;
}
