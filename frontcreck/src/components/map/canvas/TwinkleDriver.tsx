'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { prefersReducedMotion } from '@/lib/media';
import { addGlint, glassRects } from '../overlays/Twinkle';
import { MUTED_DOT_SCALE } from '../shaders/album';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, getPlacedMarkers } from '../state/overlayEls';
import { rendererName, softwareRenderer } from '../state/renderer';
import { getStageTop } from '../state/stageTop';
import { pageStarClasses, starCoreCssPx, starTint, type StarClass } from '../state/stars';
import {
  TWINKLE_COVER_CLEAR_PX,
  createTwinkle,
  glintArea,
  glintBlockers,
  glintFor,
  glintReach,
  pickStar,
  twinkleRuledOut,
  twinkleShown,
  watchTwinkleSwitch,
  worldToScreenMap,
  type Twinkle,
  type TwinkleHost,
} from '../state/twinkle';
import { coverFade } from '../state/zoomLimits';
import { STAR_WHITE } from '../theme';

/** The same query as REDUCED_MOTION_QUERY in @/lib/media, spelled out here on purpose: that module is part of the
 * first-load scripts, and importing an export nothing else uses (the constant) would keep it there for every page.
 * prefersReducedMotion is already kept by the other drivers. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** What the last drawn frame showed. A frame that changes none of these (a hover redraw) leaves the glints be. */
interface Drawn {
  x: number;
  y: number;
  zoom: number;
  inset: number;
  sliderT: number;
  width: number;
  height: number;
  dimmed: boolean;
  interactive: boolean;
  focus: object | null;
  /** The map's input as a whole: a new one may be a new page (About to Home changes nothing drawn). */
  input: object | null;
  hovered: boolean;
}

const STAR_CLASSES: readonly StarClass[] = [0, 1, 2, 3];

/** Star glints (state/twinkle.ts): one timer decides when, this component says whether a glint is possible and
 * whether the map is at rest, and writes the glint to the DOM layer (overlays/Twinkle.tsx). It never asks the
 * canvas for a frame. Its frame callback only notices what changed in a frame that was drawn anyway: any change
 * of camera, slider, size or route clears the glints and starts or stops the timer; a change of hover holds new
 * glints back. No glint is made while the view moves, for 500 ms after, while an album is hovered and for 500 ms
 * after, or with its bloom or flare under a glass surface. Once covers show, on a software renderer, on a page
 * where the map is only a backdrop behind other content, under reduced motion and in a hidden tab there is no
 * timer at all. Mounted after MarkerDriver, whose placed covers a glint keeps clear of, and after CursorTracker,
 * which sets the hover. */
export function TwinkleDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const twinkle = useRef<Twinkle | null>(null);
  const drawn = useRef<Drawn>({ x: NaN, y: NaN, zoom: NaN, inset: NaN, sliderT: NaN, width: 0, height: 0, dimmed: false, interactive: false, focus: null, input: null, hovered: false });

  useEffect(() => {
    const host: TwinkleHost = {
      hidden: () => document.hidden,
      reducedMotion: prefersReducedMotion,
      possible: () => {
        // Never on a renderer known to be a software one, unless the switch forces them (state/twinkle.ts).
        if (twinkleRuledOut(softwareRenderer(), window.__rmrTwinkle)) return false;
        // Where the map is what the visitor looks at: Explore, an album on desktop, the phone's map mode
        // (all `interactive`) and Home. Not About, 404 or the phone's album list, which cover the map.
        // An attribute read, not a layout read. (Until the layer is there the answer is yes: the timer waits.)
        const s = useMapStore.getState();
        const layer = getOverlayEl('twinkle');
        if (!s.input.interactive && layer && layer.closest<HTMLElement>('.map-pane')?.dataset.view !== 'home') return false;
        // Stars only: none once covers begin to show (16 px).
        return coverFade(camera.zoom, get().size.height) <= 0;
      },
      resting: () => {
        const s = useMapStore.getState();
        if (!getOverlayEl('twinkle') || !s.data) return false;
        if (s.dragging || s.animating || s.nudging || s.rigMoving || s.morphing) return false;
        // The renderer must be known to be a GPU (or the switch forces glints). The gas layer asks for its name
        // when its first image goes in; where that has not happened (no gas, or not yet), it is asked for here,
        // once, on this tick: the map is at rest, so the GPU has nothing queued and the answer is quick.
        const sw = window.__rmrTwinkle;
        if (sw !== 'on' && softwareRenderer() === undefined) rendererName(gl.getContext());
        return twinkleShown(softwareRenderer(), sw);
      },
      // Read from the map store on the tick: no listener, and nothing on the pointer's path.
      hovered: () => useMapStore.getState().hoveredIndex !== null,
      spawn: (ended) => {
        const s = useMapStore.getState();
        const layer = getOverlayEl('twinkle');
        if (!layer || !s.data) return null;
        const { width, height } = get().size;
        const classes = pageStarClasses(s.data.n);
        // Each class's star radius as the shader draws it (larger on the dimmed Home map), and from it how far
        // that class's glint reaches: the pick keeps the whole glint, not only the star, inside the visible map
        // and clear of every glass surface.
        const radius = STAR_CLASSES.map((cls) => (starCoreCssPx(cls, camera.zoom, height) / 2) * (s.input.dimmed ? MUTED_DOT_SCALE : 1));
        const reach = STAR_CLASSES.map((cls) => glintReach(cls, radius[cls]));
        const area = glintArea({ width, height, top: getStageTop(), inset: s.insetCurrent, bottomCover: s.input.bottomCover });
        // The glass surfaces as they are laid out now: read here, on the timer's tick, at most once every 1.2 s
        // (overlays/Twinkle.tsx glassRects says why they are measured each time and not kept).
        const blockers = glintBlockers(glassRects(layer));
        // Beside an open album: never under one of its covers (as MarkerDriver last placed them).
        const covers = s.input.focus ? getPlacedMarkers().map((m) => ({ x: m.x, y: m.y, half: m.drawn / 2 + TWINKLE_COVER_CLEAR_PX })) : [];
        const pick = pickStar(positionsRef.current, classes, worldToScreenMap(camera, width, height), area, covers, Math.random, reach, blockers);
        if (!pick) return null;
        const cls = classes[pick.index] as StarClass;
        const tint = s.theme ? starTint(s.theme.stars.lead[pick.index]) : STAR_WHITE;
        return addGlint(layer, glintFor(pick, cls, radius[cls], tint, s.input.focus !== null, Math.random), ended);
      },
    };
    const tw = createTwinkle(host, {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      now: () => performance.now(),
      random: Math.random,
    });
    twinkle.current = tw;
    // For tests and measurements only (nothing in the app reads it back): the counters, what the switch last told
    // this timer, and the renderer's verdict as the glints see it.
    if (window.__rmr) window.__rmr.twinkle = { stats: tw.stats, enabled: tw.enabled, software: softwareRenderer };
    const sync = () => tw.sync();
    document.addEventListener('visibilitychange', sync);
    const motion = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null;
    motion?.addEventListener('change', sync);
    // Starts the timer, unless the switch (window.__rmrTwinkle; no control on screen), the tab or the motion
    // setting says no. A later change of the switch stops or starts it inside the assignment: the glints go
    // from the DOM at once, and no canvas frame is asked for.
    const unwatch = watchTwinkleSwitch(window, tw.setEnabled);
    return () => {
      unwatch();
      document.removeEventListener('visibilitychange', sync);
      motion?.removeEventListener('change', sync);
      tw.dispose();
      twinkle.current = null;
      if (window.__rmr) delete window.__rmr.twinkle;
    };
  }, [camera, gl, get, positionsRef]);

  useFrame(() => {
    const tw = twinkle.current;
    if (!tw) return;
    const { input, sliderT, insetCurrent, hoveredIndex } = useMapStore.getState();
    const { width, height } = get().size;
    const d = drawn.current;
    const { x, y } = camera.position;
    // A hover began or ended in this frame (CursorTracker ran before this): no new glint for a moment. This is a
    // frame the hover drew anyway; nothing is added to the pointer's path but this comparison.
    if (d.hovered !== (hoveredIndex !== null)) {
      d.hovered = hoveredIndex !== null;
      tw.hoverChanged();
    }
    // A new input may be a new page with nothing drawn differently (About to Home): start or stop the timer.
    if (d.input !== input) {
      d.input = input;
      tw.sync();
    }
    if (
      d.x === x &&
      d.y === y &&
      d.zoom === camera.zoom &&
      d.inset === insetCurrent &&
      d.sliderT === sliderT &&
      d.width === width &&
      d.height === height &&
      d.dimmed === input.dimmed &&
      d.interactive === input.interactive &&
      d.focus === input.focus
    ) {
      return;
    }
    d.x = x;
    d.y = y;
    d.zoom = camera.zoom;
    d.inset = insetCurrent;
    d.sliderT = sliderT;
    d.width = width;
    d.height = height;
    d.dimmed = input.dimmed;
    d.interactive = input.interactive;
    d.focus = input.focus;
    tw.viewChanged();
  });

  return null;
}
