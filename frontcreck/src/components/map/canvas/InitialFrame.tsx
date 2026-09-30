"use client";

import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";

import type { MapData } from "../data";
import { cloudCenter, fitZoom, getCloudBounds } from "../state/bounds";
import { useMapStore } from "../state/mapStore";
import { setFramed, setOverviewFraming } from "../state/view";

/**
 * Half the frustum height in world units. Fixed; the half-width follows the
 * canvas aspect (FRUSTUM_HALF_HEIGHT * width / height) so world units are
 * square on screen and a round cluster renders round.
 */
export const FRUSTUM_HALF_HEIGHT = 0.55;

/**
 * Symmetric frustum for a `width` x `height` CSS px canvas, with the drawing shifted so `camera.position`
 * lands at the centre of the area right of `insetPx` (the album panel). state/projection.ts mirrors this.
 */
export function applyFrustum(camera: THREE.OrthographicCamera, width: number, height: number, insetPx: number): void {
  const halfW = FRUSTUM_HALF_HEIGHT * (width / height);
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = FRUSTUM_HALF_HEIGHT;
  camera.bottom = -FRUSTUM_HALF_HEIGHT;
  const inset = Math.min(Math.max(insetPx, 0), width * 0.9);
  // Draw the canvas shifted left by half the inset (CSS px of the full canvas). three scales a view offset by
  // 1 / zoom itself, so camera.position stays at the centre of the visible area right of the inset at every zoom.
  if (inset > 0) camera.setViewOffset(width, height, -inset / 2, 0, width, height);
  else if (camera.view) camera.view.enabled = false;
  camera.updateProjectionMatrix();
}

/**
 * Owns the orthographic frustum and the overview framing.
 *
 * - Frustum: on mount and on every canvas resize, applyFrustum sets
 *   `left/right` to `±FRUSTUM_HALF_HEIGHT * aspect` (top/bottom stay
 *   `±FRUSTUM_HALF_HEIGHT`) with the current panel inset. The camera is
 *   `manual`, so R3F never touches these itself.
 * - Framing: computes the cloud's percentile bounds, their centre and the
 *   fitted zoom for the live frustum, and publishes them (state/view.ts) for
 *   CameraRig, AlbumField, AtlasManager, CameraBounds and CameraTween. Recomputed on data, sliderT and size changes.
 * - Snap: once per MapData the camera jumps, without animation, to the
 *   framing centre and fitted zoom. A resize re-snaps only while the user
 *   has not yet grabbed the camera and no album is in focus; a slider change
 *   never moves the camera.
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
  const framedData = useRef<MapData | null>(null);
  const lastSize = useRef<{ width: number; height: number } | null>(null);
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
    const center = cloudCenter(bounds);
    // Fit the visible area only (right of the album panel), which is centred on camera.position.
    const halfW = FRUSTUM_HALF_HEIGHT * (width / Math.max(height, 1));
    const f = width > 0 ? Math.min(useMapStore.getState().insetCurrent / width, 0.9) : 0;
    const zoom = fitZoom(bounds, {
      left: -halfW * (1 - f),
      right: halfW * (1 - f),
      top: FRUSTUM_HALF_HEIGHT,
      bottom: -FRUSTUM_HALF_HEIGHT,
    });
    setOverviewFraming({ zoom, center, bounds });

    const newData = framedData.current !== data;
    // New data invalidates the previous snap until the one below lands.
    if (newData) setFramed(false);
    const { lastCameraGrab, input } = useMapStore.getState();
    const untouched = lastCameraGrab === 0 && input.focus === null;
    if (newData || (sizeChanged && untouched)) {
      framedData.current = data;
      // eslint-disable-next-line react-hooks/immutability -- mutating the R3F camera in place (position/zoom/frustum) is the standard R3F pattern; the camera is a long-lived GPU-backed object, not React-owned state, and this is not itself inside a hook callback.
      camera.position.x = center.x;
      camera.position.y = center.y;
      // eslint-disable-next-line react-hooks/immutability -- see the comment above.
      camera.zoom = zoom;
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
      applyFrustum(camera, width, height, useMapStore.getState().insetCurrent);
    }
    const sizeChanged =
      lastSize.current !== null &&
      (lastSize.current.width !== width || lastSize.current.height !== height);
    lastSize.current = { width, height };

    recomputeFraming(sizeChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height, camera, invalidate]);

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
