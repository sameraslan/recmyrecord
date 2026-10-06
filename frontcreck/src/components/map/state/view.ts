import type { Bounds } from "./bounds";

const OVERVIEW_ZOOM = 2.4;

/**
 * The fitted overview framing: the album cloud's full extent
 * (state/bounds.ts getCloudBounds) and the camera centre and zoom that fit it
 * inside the padded visible area (fitView). Written by
 * canvas/InitialFrame.tsx once per data load and again (without moving the
 * camera) on every sliderT change, since each slider stop has its own extent.
 *
 * This is the single published source of the fitted zoom. Consumers:
 * CameraRig (zoom-out floor, 0.8x the fit), CameraBounds (idle nudge box) and
 * CameraTween (reset to the overview).
 *
 * Plain module-level bridge, not Zustand state, mirroring state/invalidate.ts
 * and state/overlayEls.ts: consumers read it synchronously inside wheel
 * handlers and per-frame closures, not through a React subscription.
 *
 * `OVERVIEW_ZOOM` is only the fallback before any MapData has loaded;
 * InitialFrame writes the real value in a layout effect, before the first
 * frame is drawn.
 *
 * Naming: "overview" here is the Whole map (the whole cloud fitted), named before the Trifid theme's Overview
 * existed. The map now OPENS at the Overview (state/bounds.ts fitOverview, Task 0 of the Trifid build); this
 * record stays the Whole map: the fit button, the zoom-out floor and the idle nudge box.
 */
export interface OverviewFraming {
  zoom: number;
  center: { x: number; y: number };
  bounds: Bounds;
}

let framing: OverviewFraming = {
  zoom: OVERVIEW_ZOOM,
  center: { x: 0, y: 0 },
  bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
};

export function setOverviewFraming(next: OverviewFraming): void {
  framing = next;
}

export function getOverviewFraming(): OverviewFraming {
  return framing;
}

/**
 * True once InitialFrame has applied the fit snap for the current MapData.
 * CameraBounds does nothing until then, so it can never nudge the camera
 * from its pre-load position on the first frame (before the snap lands, the
 * published bounds belong to no data or to the previous data). InitialFrame
 * clears it whenever `data` changes and sets it again after the snap.
 */
let framed = false;

export function setFramed(next: boolean): void {
  framed = next;
}

export function isFramed(): boolean {
  return framed;
}

/** A camera view: world-space centre and orthographic zoom. */
export interface CameraView {
  x: number;
  y: number;
  zoom: number;
}

/** The two framings /map can show by itself: the prototype's Overview (state/bounds.ts fitOverview) and the Whole map. */
export type OpeningKind = "overview" | "whole";

/**
 * The framing /map opens at. The owner's ruling of 2026-10-05 (build handoff, ruling 9): the Overview, as the
 * approved picture final-overview.jpg and the prototype. 'whole' gives back today's opening view (the whole cloud).
 */
export const MAP_OPENS_AT: OpeningKind = "overview";

/**
 * The framing a page load starts the map at. The Overview only on /map with no album in focus; Home, About, 404
 * and every album link start at the Whole map, as before (an album then frames itself). `override` is
 * window.__rmrOpen, a switch for tests and review captures set before the map loads; anything but the two
 * names is ignored, and it never applies outside /map.
 */
export function openingKind(input: { explore: boolean; focus: unknown }, override?: unknown): OpeningKind {
  if (!input.explore || input.focus !== null) return "whole";
  if (override === "whole" || override === "overview") return override;
  return MAP_OPENS_AT;
}

/** The framing last applied by itself (the opening snap, the fit button, the glide to the opening view), and the
 * camera it set: what a resize re-fits while the visitor has not touched the camera, and what tells an untouched
 * Overview from a moved one when the visitor leaves /map for Home. */
let fitKind: OpeningKind = "whole";
let fitCamera: CameraView | null = null;

export function setFitKind(kind: OpeningKind, camera: CameraView | null = null): void {
  fitKind = kind;
  fitCamera = camera ? { x: camera.x, y: camera.y, zoom: camera.zoom } : null;
}

export function getFitKind(): OpeningKind {
  return fitKind;
}

export function getFitCamera(): CameraView | null {
  return fitCamera;
}

/** True while `camera` is still the Overview the map opened at (or glided to): nothing the visitor did moved it.
 * Leaving /map for Home then shows the Whole map, as a fresh load of Home does (prototype app.js L114). */
export function untouchedOverview(kind: OpeningKind, opened: CameraView | null, camera: CameraView): boolean {
  if (kind !== "overview" || opened === null) return false;
  return Math.hypot(camera.x - opened.x, camera.y - opened.y) + Math.abs(camera.zoom - opened.zoom) < 1e-6;
}

/** The framing an InitialFrame snap applies: on new data the route's opening framing (openingKind); on a resize
 * before the visitor touched the camera, the framing last applied while on /map, and the Whole map on every other
 * route (a pick's fly is no camera grab, so a resize on Home after one must fit Home's own framing, as before). */
export function snapKind(newData: boolean, input: { explore: boolean; focus: unknown }, override?: unknown): OpeningKind {
  if (newData) return openingKind(input, override);
  return input.explore ? fitKind : "whole";
}

/**
 * Where releasing focus should glide the camera to: the view captured when
 * focus began (so the visitor returns to exactly what they were looking at,
 * including a pan or zoom of their own), or, when nothing was captured
 * (focus restored on a remount), the fitted overview centre and zoom.
 * Always returns a fresh object.
 */
export function releaseView(
  preFocusView: CameraView | null,
  overview: OverviewFraming,
): CameraView {
  if (preFocusView) return { x: preFocusView.x, y: preFocusView.y, zoom: preFocusView.zoom };
  return { x: overview.center.x, y: overview.center.y, zoom: overview.zoom };
}

/** `visibleScale` of the current canvas (state/zoomLimits.ts), written by canvas/InitialFrame.tsx with the
 * frustum and read where no canvas size is at hand: CameraRig's `clampZoom` and CameraBounds. 1 until a canvas has
 * been measured. */
let visibleScaleNow = 1;

export function setVisibleScale(next: number): void {
  visibleScaleNow = next;
}

export function getVisibleScale(): number {
  return visibleScaleNow;
}
