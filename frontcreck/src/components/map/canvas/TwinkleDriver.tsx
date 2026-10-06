'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { prefersReducedMotion } from '@/lib/media';
import { addGlint } from '../overlays/Twinkle';
import { MUTED_DOT_SCALE } from '../shaders/album';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, getPlacedMarkers } from '../state/overlayEls';
import { getStageTop } from '../state/stageTop';
import { pageStarClasses, starCoreCssPx, starTint, type StarClass } from '../state/stars';
import { TWINKLE_COVER_CLEAR_PX, TWINKLE_EDGE_PX, createTwinkle, glintFor, pickStar, twinkleShown, watchTwinkleSwitch, worldToScreenMap, type Twinkle, type TwinkleHost } from '../state/twinkle';
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
}

/** Star glints (state/twinkle.ts): one timer decides when, this component says whether the map is at rest and
 * writes the glint to the DOM layer (overlays/Twinkle.tsx). It never asks the canvas for a frame. Its frame
 * callback only notices that the view changed: any change of camera, slider, size or route clears the glints,
 * and none is made while the view moves, for 500 ms after, once covers show, under reduced motion, in a
 * hidden tab or on a software renderer. Mounted after MarkerDriver, whose placed covers a glint keeps clear of. */
export function TwinkleDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const twinkle = useRef<Twinkle | null>(null);
  const drawn = useRef<Drawn>({ x: NaN, y: NaN, zoom: NaN, inset: NaN, sliderT: NaN, width: 0, height: 0, dimmed: false, interactive: false, focus: null });

  useEffect(() => {
    const host: TwinkleHost = {
      hidden: () => document.hidden,
      reducedMotion: prefersReducedMotion,
      resting: () => {
        const s = useMapStore.getState();
        const layer = getOverlayEl('twinkle');
        if (!layer || !s.data) return false;
        // Not on a software renderer (state/twinkle.ts twinkleShown). The renderer test is the gas layer's own,
        // made once when its first image goes in (canvas/GasField.tsx chooseShader publishes it); it is not asked
        // for again here, since the question costs a round trip to the GPU process.
        if (!twinkleShown(window.__rmr?.gasLite, window.__rmrTwinkle)) return false;
        // Where the map is what the visitor looks at: Explore, an album on desktop, the phone's map mode
        // (all `interactive`) and Home. Not About, 404 or the phone's album list, which cover the map.
        // An attribute read, not a layout read.
        if (!s.input.interactive && layer.closest<HTMLElement>('.map-pane')?.dataset.view !== 'home') return false;
        if (s.dragging || s.animating || s.nudging || s.rigMoving || s.morphing) return false;
        // Stars only: none once covers begin to show (16 px).
        return coverFade(camera.zoom, get().size.height) <= 0;
      },
      spawn: (ended) => {
        const s = useMapStore.getState();
        const layer = getOverlayEl('twinkle');
        if (!layer || !s.data) return null;
        const { width, height } = get().size;
        const classes = pageStarClasses(s.data.n);
        // Inside the visible map: right of the album panel, below the header, above the phone's slider panel.
        const area = {
          left: Math.max(0, s.insetCurrent) + TWINKLE_EDGE_PX,
          top: getStageTop() + TWINKLE_EDGE_PX,
          right: width - TWINKLE_EDGE_PX,
          bottom: height - s.input.bottomCover - TWINKLE_EDGE_PX,
        };
        // Beside an open album: never under one of its covers (as MarkerDriver last placed them).
        const covers = s.input.focus ? getPlacedMarkers().map((m) => ({ x: m.x, y: m.y, half: m.drawn / 2 + TWINKLE_COVER_CLEAR_PX })) : [];
        const pick = pickStar(positionsRef.current, classes, worldToScreenMap(camera, width, height), area, covers, Math.random);
        if (!pick) return null;
        const cls = classes[pick.index] as StarClass;
        // The star's own radius as the shader draws it (larger on the dimmed Home map), and its own tint.
        const radius = (starCoreCssPx(cls, camera.zoom, height) / 2) * (s.input.dimmed ? MUTED_DOT_SCALE : 1);
        const tint = s.theme ? starTint(s.theme.stars.lead[pick.index]) : STAR_WHITE;
        return addGlint(layer, glintFor(pick, cls, radius, tint, s.input.focus !== null, Math.random), ended);
      },
    };
    const tw = createTwinkle(host, {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      now: () => performance.now(),
      random: Math.random,
    });
    twinkle.current = tw;
    // Test and measurement hook: the counters, and what the switch last told this timer.
    if (window.__rmr) window.__rmr.twinkle = { stats: tw.stats, enabled: tw.enabled };
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
  }, [camera, get, positionsRef]);

  useFrame(() => {
    const tw = twinkle.current;
    if (!tw) return;
    const { input, sliderT, insetCurrent } = useMapStore.getState();
    const { width, height } = get().size;
    const d = drawn.current;
    const { x, y } = camera.position;
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
