import { interpolated, type MapData } from "../data";
import { NAMES_BAND_PX } from "../theme";
import type { MapPadding } from "../types";
import { COVER_WORLD, FIT_ZOOM_MAX, FIT_ZOOM_MIN, MAX_ZOOM, pxPerWorld, visibleScale, zoomForPxPerWorld } from "./zoomLimits";

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Default percentiles of `percentileBounds`, for callers that want a box
 * that ignores outliers (the overview itself frames the full extent, see
 * getCloudBounds). In the personal site's data there was a
 * far outlier group (nearly all in the "ambient" cluster, near x = -3.7,
 * y = -2.3 once normalized) holding 2.0% to 2.45% of all albums at slider
 * positions 0.25 to 0.75. A 2nd percentile lands
 * right on that group's edge (p2 x = -1.73 at sliderT 0.6, -2.19 at 0.5),
 * so a p2..p98 box would still frame the outliers and shrink the bulk into a
 * corner. The 3rd/97th percentiles clear the group at every slider position
 * while trimming only about 1% of the bulk per side.
 */
export const FRAME_PERCENTILE_LO = 0.03;
export const FRAME_PERCENTILE_HI = 0.97;

/**
 * Percentile bounding box of a flat `[x0, y0, x1, y1, ...]` position array
 * (the layout AlbumField's positionsRef uses). Sorts copies, never the
 * caller's array. Percentile `q` reads the sorted element at
 * `floor(q * (n - 1))`.
 */
export function percentileBounds(
  xy: Float32Array,
  lo = FRAME_PERCENTILE_LO,
  hi = FRAME_PERCENTILE_HI,
): Bounds {
  const n = Math.floor(xy.length / 2);
  if (n === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = xy[i * 2];
    ys[i] = xy[i * 2 + 1];
  }
  // Typed-array sort is numeric by default.
  xs.sort();
  ys.sort();
  const at = (arr: Float32Array, q: number) =>
    arr[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  return { minX: at(xs, lo), maxX: at(xs, hi), minY: at(ys, lo), maxY: at(ys, hi) };
}

/** Flat `[x0, y0, ...]` interpolated positions of every album at `sliderT`. */
export function interpolatedPositions(data: MapData, sliderT: number): Float32Array {
  return interpolated(data, sliderT);
}

/**
 * The album cloud's framing box at `sliderT`: the full min/max extent of the
 * interpolated positions, so the overview shows every album (as the mockup
 * does). Used for the overview framing (fitView) and CameraBounds' idle nudge.
 */
export function getCloudBounds(data: MapData, sliderT: number): Bounds {
  return percentileBounds(interpolatedPositions(data, sliderT), 0, 1);
}

/** Midpoint of a bounding box. */
export function cloudCenter(cloud: Bounds): { x: number; y: number } {
  return { x: (cloud.minX + cloud.maxX) / 2, y: (cloud.minY + cloud.maxY) / 2 };
}

export interface FitArea {
  /** Canvas size in CSS px. */
  width: number;
  height: number;
  /** CSS px covered by the album panel on the left. */
  insetLeft: number;
  /** CSS px covered by the header along the top. */
  insetTop: number;
  /** CSS px kept clear around the cloud inside the visible area. */
  padding: MapPadding;
}

/**
 * The overview camera: the zoom at which the `cloud` box fits the visible
 * area (right of `insetLeft`, below `insetTop`) less `padding`, clamped to
 * [FIT_ZOOM_MIN, FIT_ZOOM_MAX] in the size that range has on screen when
 * nothing covers the canvas, and the camera position that centres the box
 * in the padded area. camera.position is the centre of the visible area
 * (canvas/InitialFrame.tsx applyFrustum), so uneven padding shifts it and the
 * insets do not.
 */
export function fitView(cloud: Bounds, area: FitArea): { zoom: number; center: { x: number; y: number } } {
  const { width, height, insetLeft, insetTop, padding: pad } = area;
  // Guard against a degenerate (zero-size) cloud so a single-point dataset
  // never divides by zero; the clamp then caps it at FIT_ZOOM_MAX.
  const w = Math.max(cloud.maxX - cloud.minX, 1e-6);
  const h = Math.max(cloud.maxY - cloud.minY, 1e-6);
  const availW = Math.max(width - insetLeft - pad.left - pad.right, 40);
  const availH = Math.max(height - insetTop - pad.top - pad.bottom, 40);
  const scale = Math.min(availW / w, availH / h);
  // The fit range in the size it has on screen when nothing covers the canvas (zoomLimits visibleScale).
  const s = visibleScale(height, insetTop);
  const zoom = Math.max(FIT_ZOOM_MIN * s, Math.min(FIT_ZOOM_MAX * s, zoomForPxPerWorld(scale, height)));
  const wpp = 1 / pxPerWorld(zoom, height);
  const c = cloudCenter(cloud);
  return {
    zoom,
    center: { x: c.x - ((pad.left - pad.right) / 2) * wpp, y: c.y + ((pad.top - pad.bottom) / 2) * wpp },
  };
}

/** Overview: CSS px kept clear at each side of the 1st..99th percentile span (prototype camera.js L31, `- 48`). */
export const OVERVIEW_SIDE_PAD_PX = 24;
/** Overview: the closest it frames, half a pixel under the covers at which names go (prototype `BAND_B - 0.5`),
 * so the opening view always shows names and never loads a cover sheet (ATLAS_LOAD_PX is 13). */
export const OVERVIEW_COVER_MAX_PX = NAMES_BAND_PX - 0.5;

export interface OverviewExtent {
  /** 1st and 99th percentile of x, and the median of y, of one layout (world units). */
  x1: number;
  x99: number;
  medY: number;
}

export interface OverviewArea {
  /** Canvas size in CSS px. */
  width: number;
  height: number;
  /** CSS px covered by the album panel on the left. */
  insetLeft: number;
  /** CSS px covered by the header along the top. */
  insetTop: number;
  /** CSS px covered by the phone slider panel at the bottom (MapInput.bottomCover; 0 on desktop). */
  bottomCover: number;
}

/** The Overview's percentiles of a flat [x0, y0, ...] layout, with the prototype's quantile rule
 * (`sorted[floor(q * (n - 1))]`, prototype data.js L7 and L122). Sorts copies, never the caller's array. */
export function overviewExtent(xy: Float32Array): OverviewExtent {
  const n = Math.floor(xy.length / 2);
  if (n === 0) return { x1: 0, x99: 0, medY: 0 };
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = xy[i * 2];
    ys[i] = xy[i * 2 + 1];
  }
  xs.sort();
  ys.sort();
  const at = (arr: Float32Array, q: number) => arr[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  return { x1: at(xs, 0.01), x99: at(xs, 0.99), medY: at(ys, 0.5) };
}

/**
 * The Overview, the framing /map opens at (prototype camera.js L27-34, `Cam.fitOverview`): the 1st..99th
 * percentile x-span fills the width right of the album panel less 24 px a side, capped at 12.5 px covers, never
 * wider than the Whole map (`wholeZoom`, fitView's zoom). Centred on the span in x and on the median row in y; on a
 * phone the median row sits in the middle of the band above the slider panel (the prototype's free rectangle).
 * Regions above and below run off screen. camera.position is the centre of the visible area (applyFrustum), which
 * is below the header's `insetTop`: the centre needs no term for it, and only the zoom ceiling does (MAX_ZOOM in
 * the size it has on screen when nothing covers the canvas).
 */
export function fitOverview(ext: OverviewExtent, wholeZoom: number, area: OverviewArea): { zoom: number; center: { x: number; y: number } } {
  const { width, height, insetLeft, insetTop, bottomCover } = area;
  const whole = pxPerWorld(wholeZoom, height);
  const across = Math.max(width - insetLeft - 2 * OVERVIEW_SIDE_PAD_PX, 40) / Math.max(ext.x99 - ext.x1, 1e-6);
  const cap = OVERVIEW_COVER_MAX_PX / COVER_WORLD;
  const zoom = Math.min(MAX_ZOOM * visibleScale(height, insetTop), zoomForPxPerWorld(Math.max(whole, Math.min(across, cap)), height));
  const ppw = pxPerWorld(zoom, height);
  return { zoom, center: { x: (ext.x1 + ext.x99) / 2, y: ext.medY - bottomCover / 2 / ppw } };
}

/** The Overview of the layout at `sliderT` (the positions on screen). */
export function overviewView(data: MapData, sliderT: number, area: OverviewArea, wholeZoom: number): { zoom: number; center: { x: number; y: number } } {
  return fitOverview(overviewExtent(interpolatedPositions(data, sliderT)), wholeZoom, area);
}

export interface ViewportWorldRect {
  halfW: number;
  halfH: number;
}

export interface OrthoFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom: number;
}

/**
 * Half-width/half-height of the visible viewport, in the same world units as
 * the camera's own frustum and `getCloudBounds`'s box. `THREE.Viewport`'s
 * `getCurrentViewport` is built for perspective cameras and returns figures
 * in the wrong scale for this manual orthographic camera, which was the root
 * cause of `CameraBounds` treating an in-view album cloud as "off screen".
 * The correct figure is just the frustum size scaled down by zoom.
 */
export function viewportWorldRect(cam: OrthoFrustum): ViewportWorldRect {
  return {
    halfW: (cam.right - cam.left) / (2 * cam.zoom),
    halfH: (cam.top - cam.bottom) / (2 * cam.zoom),
  };
}

/** viewportWorldRect of the part of the canvas below the header, which the camera's position is the centre of.
 * `scale` is the visible share of the canvas height (state/zoomLimits.ts visibleScale): what is behind the header
 * does not count as in view. */
export function visibleWorldRect(cam: OrthoFrustum, scale: number): ViewportWorldRect {
  const rect = viewportWorldRect(cam);
  rect.halfH *= scale;
  return rect;
}

// Below this fraction of the cloud's bounding-box area actually inside the
// viewport, the idle camera is considered to have wandered off the cloud and
// gets nudged back. Above it (including "zoomed out enough to see the whole
// cloud at once"), the camera is left alone: seeing all of it, or panning to
// an edge region, is not a bug to correct. This is the zoomed-in threshold:
// past the fitted zoom the viewport is smaller than the cloud, so even a
// well-placed view covers only part of its box.
export const VISIBLE_FRACTION_THRESHOLD = 0.25;
// At or below the fitted zoom the viewport is at least as big as the cloud's
// box, so a view showing under 60% of it is mostly empty paper with the
// cloud off to one side, and gets eased back.
export const FIT_VISIBLE_FRACTION_THRESHOLD = 0.6;

/**
 * Coverage threshold for `nudgeVector` at the given camera zoom:
 * `FIT_VISIBLE_FRACTION_THRESHOLD` at or below `fitZoom` (with a small
 * relative tolerance for float noise from a glide landing on it), else
 * `VISIBLE_FRACTION_THRESHOLD`.
 */
export function visibleFractionThreshold(zoom: number, fitZoom: number): number {
  return zoom <= fitZoom * (1 + 1e-3)
    ? FIT_VISIBLE_FRACTION_THRESHOLD
    : VISIBLE_FRACTION_THRESHOLD;
}

/**
 * Decides whether the idle camera should be nudged back toward the album
 * cloud, and by how much. Returns `null` when no correction is needed: the
 * cloud's bounding box is at least `threshold` visible in the viewport (by
 * area; defaults to `VISIBLE_FRACTION_THRESHOLD`, CameraBounds passes
 * `visibleFractionThreshold(zoom, fitZoom)`), or the camera is already sitting at the clamp
 * target. Otherwise returns the raw (un-eased) correction vector; the caller
 * eases into it rather than snapping.
 */
export function nudgeVector(
  camPos: { x: number; y: number },
  viewport: ViewportWorldRect,
  cloud: Bounds,
  margin: number,
  threshold: number = VISIBLE_FRACTION_THRESHOLD,
): { x: number; y: number } | null {
  const { halfW, halfH } = viewport;
  const cloudW = cloud.maxX - cloud.minX;
  const cloudH = cloud.maxY - cloud.minY;
  if (cloudW <= 0 || cloudH <= 0) return null;

  const viewMinX = camPos.x - halfW;
  const viewMaxX = camPos.x + halfW;
  const viewMinY = camPos.y - halfH;
  const viewMaxY = camPos.y + halfH;

  const overlapW = Math.max(0, Math.min(viewMaxX, cloud.maxX) - Math.max(viewMinX, cloud.minX));
  const overlapH = Math.max(0, Math.min(viewMaxY, cloud.maxY) - Math.max(viewMinY, cloud.minY));
  // Fraction of the cloud's own box area that the viewport currently
  // overlaps, not the fraction of the viewport occupied by the cloud. A
  // fully-zoomed-out viewport that contains the whole cloud (and then some)
  // reads as 1.0 here, same as a tight viewport that exactly frames it.
  const cloudCoverage = (overlapW * overlapH) / (cloudW * cloudH);

  if (cloudCoverage >= threshold) return null;

  // Clamp the camera so the viewport sits over the margin-padded cloud box.
  // When the viewport is wider/taller than the box on a given axis (zoomed
  // out far enough that the whole cloud already fits on that axis), loX
  // exceeds hiX and the min/max clamp on that axis has no valid range to
  // hold the camera inside, making it inert; fall back to centering on the
  // box midpoint for that axis instead. This branch is a safety net, not the
  // common path: a viewport that large almost always already clears the
  // cloudCoverage gate above and returns null before reaching here.
  const loX = cloud.minX - margin + halfW;
  const hiX = cloud.maxX + margin - halfW;
  const tx = loX <= hiX ? Math.max(loX, Math.min(hiX, camPos.x)) : (cloud.minX + cloud.maxX) / 2;
  const loY = cloud.minY - margin + halfH;
  const hiY = cloud.maxY + margin - halfH;
  const ty = loY <= hiY ? Math.max(loY, Math.min(hiY, camPos.y)) : (cloud.minY + cloud.maxY) / 2;

  const dx = tx - camPos.x;
  const dy = ty - camPos.y;
  // Below this squared distance the camera is already effectively at the
  // clamp target (floating-point noise, not a real correction).
  if (dx * dx + dy * dy < 1e-12) return null;
  return { x: dx, y: dy };
}
