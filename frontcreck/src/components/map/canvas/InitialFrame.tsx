"use client";

import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";

import type { MapCamera } from "@/lib/types";
import type { MapData } from "../data";
import { fitView, getCloudBounds, overviewView } from "../state/bounds";
import { useMapStore } from "../state/mapStore";
import { setFitKind, setFramed, setOverviewFraming, setVisibleScale, snapKind } from "../state/view";
import type { OrthoCameraLike } from "../state/projection";
import { FRUSTUM_HALF_HEIGHT, visibleScale } from "../state/zoomLimits";

/**
 * Half the frustum height in world units (state/zoomLimits.ts). Fixed; the
 * half-width follows the canvas aspect so world units are square on screen.
 */
export { FRUSTUM_HALF_HEIGHT };

/** The camera as applyFrustum would set it for `view`, a panel inset and the header's top inset, for projecting a
 * view the camera is not at yet (the end of a tween). */
export function frustumCamera(view: MapCamera, width: number, height: number, insetPx: number, insetTopPx: number): OrthoCameraLike {
  const halfW = FRUSTUM_HALF_HEIGHT * (width / height);
  const inset = Math.min(Math.max(insetPx, 0), width * 0.9);
  const top = Math.min(Math.max(insetTopPx, 0), height * 0.5);
  return {
    position: { x: view.x, y: view.y },
    zoom: view.zoom,
    left: -halfW,
    right: halfW,
    top: FRUSTUM_HALF_HEIGHT,
    bottom: -FRUSTUM_HALF_HEIGHT,
    view: inset > 0 || top > 0 ? { enabled: true, fullWidth: width, fullHeight: height, offsetX: -inset / 2, offsetY: -top / 2, width, height } : null,
  };
}

/**
 * Symmetric frustum for a `width` x `height` CSS px canvas, with the drawing shifted so `camera.position`
 * lands at the centre of the visible map: right of `insetPx` (the album panel) and below `insetTopPx` (the
 * header, which the canvas runs under). state/projection.ts mirrors this.
 */
export function applyFrustum(camera: THREE.OrthographicCamera, width: number, height: number, insetPx: number, insetTopPx: number): void {
  const halfW = FRUSTUM_HALF_HEIGHT * (width / height);
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = FRUSTUM_HALF_HEIGHT;
  camera.bottom = -FRUSTUM_HALF_HEIGHT;
  const inset = Math.min(Math.max(insetPx, 0), width * 0.9);
  const top = Math.min(Math.max(insetTopPx, 0), height * 0.5);
  // Draw the canvas shifted left by half the inset and down by half the top inset (CSS px of the full canvas).
  // three scales a view offset by 1 / zoom itself, so camera.position stays at the centre of the visible area at
  // every zoom.
  if (inset > 0 || top > 0) camera.setViewOffset(width, height, -inset / 2, -top / 2, width, height);
  else if (camera.view) camera.view.enabled = false;
  camera.updateProjectionMatrix();
}

/** What the framing was last fitted for. */
export interface FramedSize {
  width: number;
  height: number;
  insetTop: number;
}

/** True when the canvas or the header over it is not the size the framing was last fitted for: a new header
 * height (the window crossed 900 px wide) counts as a new size, also when it arrives without a canvas resize.
 * False the first time (nothing was fitted yet). */
export function sizeChanged(last: FramedSize | null, width: number, height: number, insetTop: number): boolean {
  return last !== null && (last.width !== width || last.height !== height || last.insetTop !== insetTop);
}

/**
 * Owns the orthographic frustum and the overview framing.
 *
 * - Frustum: on mount and on every canvas resize, applyFrustum sets
 *   `left/right` to `±FRUSTUM_HALF_HEIGHT * aspect` (top/bottom stay
 *   `±FRUSTUM_HALF_HEIGHT`) with the current panel inset. The camera is
 *   `manual`, so R3F never touches these itself.
 * - Framing: computes the cloud's full extent and the camera that fits it
 *   inside the visible area less MapInput.fitPadding, and publishes them (state/view.ts) for
 *   CameraRig, AlbumField, AtlasManager, CameraBounds and CameraTween. Recomputed on data, sliderT and size changes.
 * - Snap: once per MapData the camera jumps, without animation, to the
 *   opening framing (state/view.ts openingKind): the Overview on /map
 *   (state/bounds.ts fitOverview), the whole-cloud fit everywhere else. The
 *   published framing stays the whole-cloud fit. A resize re-snaps only while
 *   the user has not yet grabbed the camera and no album is in focus: on /map
 *   to the framing last applied (getFitKind), elsewhere to the whole-cloud
 *   fit (state/view.ts snapKind). A slider change never moves the camera.
 *
 * A layout effect, so all of this lands before R3F draws the first frame.
 *
 * Dragging the mood slider can dispatch a new `sliderT` many times within a
 * single animation frame; recomputing `getCloudBounds` (a sort of every
 * album's position) on each one is wasted work between paints. The initial
 * frame, and any resize/data change, still recompute synchronously in the
 * same layout effect that resizes the frustum, so there is never a frame
 * where the framing lags the frustum. Pure `sliderT` changes instead store
 * the latest value and recompute at most once per rAF.
 */
export function InitialFrame() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const invalidate = useThree((s) => s.invalidate);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const data = useMapStore((s) => s.data);
  const sliderT = useMapStore((s) => s.sliderT);
  // The header's height over the canvas (64 px, or 60 px under 900 px wide): followed like the canvas size.
  const insetTop = useMapStore((s) => s.input.insetTop);
  const framedData = useRef<MapData | null>(null);
  const lastSize = useRef<FramedSize | null>(null);
  const rafId = useRef<number | null>(null);
  // The sliderT value the most recent recompute (synchronous or throttled)
  // already accounted for; lets the sliderT effect below skip scheduling a
  // redundant rAF for a value the synchronous effect just handled.
  const lastHandledSliderT = useRef<number | null>(null);

  const recomputeFraming = (sizeChanged: boolean) => {
    const currentSliderT = useMapStore.getState().sliderT;
    lastHandledSliderT.current = currentSliderT;

    if (!data || data.n === 0) {
      framedData.current = null;
      setFramed(false);
      invalidate();
      return;
    }

    const bounds = getCloudBounds(data, currentSliderT);
    // Fit the whole cloud inside the visible area (right of the album panel, below the header), less the overview
    // padding.
    const { input } = useMapStore.getState();
    const { zoom, center } = fitView(bounds, {
      width,
      height,
      insetLeft: useMapStore.getState().insetCurrent,
      insetTop: input.insetTop,
      padding: input.fitPadding,
    });
    setOverviewFraming({ zoom, center, bounds });

    const newData = framedData.current !== data;
    // New data invalidates the previous snap until the one below lands.
    if (newData) setFramed(false);
    const { lastCameraGrab } = useMapStore.getState();
    const untouched = lastCameraGrab === 0 && input.focus === null;
    if (newData || (sizeChanged && untouched)) {
      framedData.current = data;
      // A page load opens at the route's framing; a resize on /map re-fits the framing on screen (the fit button
      // may have turned the Overview into the whole map), and on any other route the whole map.
      const kind = snapKind(newData, input, window.__rmrOpen);
      const view =
        kind === "overview"
          ? overviewView(data, currentSliderT, { width, height, insetLeft: useMapStore.getState().insetCurrent, insetTop: input.insetTop, bottomCover: input.bottomCover }, zoom)
          : { zoom, center };
      setFitKind(kind, { x: view.center.x, y: view.center.y, zoom: view.zoom });
      // eslint-disable-next-line react-hooks/immutability -- mutating the R3F camera in place (position/zoom/frustum) is the standard R3F pattern; the camera is a long-lived GPU-backed object, not React-owned state, and this is not itself inside a hook callback.
      camera.position.x = view.center.x;
      camera.position.y = view.center.y;
      // eslint-disable-next-line react-hooks/immutability -- see the comment above.
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
      setFramed(true);
    }
    invalidate();
  };

  // Synchronous: frustum resize plus the initial/data/size-driven framing
  // and snap. Deliberately excludes sliderT so a slider drag alone never
  // re-runs this effect; see the throttled effect below.
  // eslint-disable-next-line react-hooks/immutability -- this effect mutates the R3F camera's frustum/position/zoom in place (see the mutation sites inside); the standard R3F pattern.
  useLayoutEffect(() => {
    if (width > 0 && height > 0) {
      applyFrustum(camera, width, height, useMapStore.getState().insetCurrent, insetTop);
      // Before the fit below and before any clampZoom: the zoom limits in this canvas's own scale.
      setVisibleScale(visibleScale(height, insetTop));
    }
    const resized = sizeChanged(lastSize.current, width, height, insetTop);
    lastSize.current = { width, height, insetTop };

    recomputeFraming(resized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height, insetTop, camera, invalidate]);

  // Throttled: pure sliderT changes (the effect above already handled the
  // sliderT value in effect at mount/data/size time, so this skips that
  // one) recompute framing at most once per animation frame, using
  // whichever sliderT is current when the rAF fires rather than every
  // intermediate value.
  // eslint-disable-next-line react-hooks/immutability -- indirectly calls recomputeFraming, which mutates the R3F camera in place on the rare newData/sizeChanged branch; same R3F pattern as the effect above.
  useLayoutEffect(() => {
    if (sliderT === lastHandledSliderT.current) return;
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      recomputeFraming(false);
    });
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliderT]);

  return null;
}
