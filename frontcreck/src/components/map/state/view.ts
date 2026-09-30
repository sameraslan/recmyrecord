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
