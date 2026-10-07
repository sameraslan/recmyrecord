/**
 * Pure math for cursor-anchored zoom (spec 4.4.4). The orthographic camera
 * projects a world point to screen offset from centre as
 * `(world - cameraPos) * zoom` (in the camera's frustum units), so keeping a
 * world point fixed on screen across a zoom change means solving for the new
 * camera position that preserves that projection.
 */

import { MAX_ZOOM, MIN_ZOOM } from "./zoomLimits";

export interface CameraLike {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Returns the camera position that keeps `cursorWorld` projecting to the
 * same screen point after the camera's zoom changes from `cam.zoom` to
 * `nextZoom`.
 *
 * Derivation: projection is invariant when
 * `(cursorWorld - newPos) * nextZoom === (cursorWorld - cam) * cam.zoom`,
 * so `newPos = cursorWorld - (cursorWorld - cam) * (cam.zoom / nextZoom)`.
 */
export function anchoredZoom(
  cam: CameraLike,
  cursorWorld: [number, number],
  nextZoom: number,
): { x: number; y: number } {
  const ratio = cam.zoom / nextZoom;
  return {
    x: cursorWorld[0] - (cursorWorld[0] - cam.x) * ratio,
    y: cursorWorld[1] - (cursorWorld[1] - cam.y) * ratio,
  };
}

/** A raw two-finger pinch is clamped to the absolute zoom range (state/zoomLimits.ts); CameraRig
 * clamps again with its dynamic floor (0.8x the fitted overview) after calling this. */
export { MAX_ZOOM, MIN_ZOOM } from "./zoomLimits";

/**
 * Two-finger pinch zoom: the zoom factor is the ratio of the current
 * inter-finger distance to the distance when the pinch started, applied to
 * the zoom the camera was at when the pinch started (not the current zoom),
 * so re-reading `startDist`/`startZoom` every frame from the pinch's origin
 * gives a stable, non-compounding result. Clamped to [MIN_ZOOM, MAX_ZOOM].
 */
export function pinchZoom(startDist: number, currDist: number, startZoom: number): number {
  if (!(startDist > 0)) return MAX_ZOOM;
  const factor = currDist / startDist;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, startZoom * factor));
}

/** Speed, in world units per 60 Hz frame, below which a fling counts as settled, up to FLING_STOP_REF_ZOOM. */
export const FLING_STOP_SPEED = 1e-5;
/** The zoom up to which FLING_STOP_SPEED is used as it is (the maximum zoom it was set for). */
export const FLING_STOP_REF_ZOOM = 28;

/**
 * The squared speed (world units per 60 Hz frame) below which a fling has settled at `zoom`. A world speed is
 * `zoom` times as fast on screen: 1e-5 is 0.2 px per frame at zoom 28 on an 836 px canvas, but 0.9 px at the
 * maximum zoom of 120, where the map would stop while still visibly gliding. Past FLING_STOP_REF_ZOOM the
 * threshold shrinks with the zoom, so a fling ends at the same speed on screen as it does at 28. Up to that zoom
 * it is the constant it always was.
 */
export function flingStopSpeedSq(zoom: number): number {
  const speed = zoom > FLING_STOP_REF_ZOOM ? (FLING_STOP_SPEED * FLING_STOP_REF_ZOOM) / zoom : FLING_STOP_SPEED;
  return speed * speed;
}
