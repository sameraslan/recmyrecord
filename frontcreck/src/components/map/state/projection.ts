/** Screen and world conversion for the map's orthographic camera: the one implementation behind overlay
 * placement, picking, focus framing and marker layout. It mirrors three r169's
 * OrthographicCamera.updateProjectionMatrix exactly, including zoom and the view offset that applyFrustum
 * (canvas/InitialFrame.tsx) uses to centre the camera right of the album panel and below the header. */

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OrthoCameraLike {
  position: { x: number; y: number };
  zoom: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  view: { enabled: boolean; fullWidth: number; fullHeight: number; offsetX: number; offsetY: number; width: number; height: number } | null;
}

export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The camera-space rectangle three.js projects onto the whole canvas (same steps as updateProjectionMatrix). */
export function viewBounds(c: OrthoCameraLike): ViewBounds {
  const dx = (c.right - c.left) / (2 * c.zoom);
  const dy = (c.top - c.bottom) / (2 * c.zoom);
  const cx = (c.right + c.left) / 2;
  const cy = (c.top + c.bottom) / 2;
  let left = cx - dx;
  let right = cx + dx;
  let top = cy + dy;
  let bottom = cy - dy;
  const v = c.view;
  if (v && v.enabled) {
    const scaleW = (c.right - c.left) / v.fullWidth / c.zoom;
    const scaleH = (c.top - c.bottom) / v.fullHeight / c.zoom;
    left += scaleW * v.offsetX;
    right = left + scaleW * v.width;
    top -= scaleH * v.offsetY;
    bottom = top - scaleH * v.height;
  }
  return { left, right, top, bottom };
}

/** Client (or canvas-local, with `canvasRect`) pixel position of a world point. */
export function worldToScreen(wx: number, wy: number, rect: ScreenRect, c: OrthoCameraLike): { x: number; y: number } {
  const b = viewBounds(c);
  return {
    x: rect.left + ((wx - c.position.x - b.left) / (b.right - b.left)) * rect.width,
    y: rect.top + ((b.top - (wy - c.position.y)) / (b.top - b.bottom)) * rect.height,
  };
}

/** World point under a client (or canvas-local) pixel position. */
export function screenToWorld(clientX: number, clientY: number, rect: ScreenRect, c: OrthoCameraLike): [number, number] {
  const b = viewBounds(c);
  const fx = (clientX - rect.left) / rect.width;
  const fy = (clientY - rect.top) / rect.height;
  return [c.position.x + b.left + fx * (b.right - b.left), c.position.y + b.top - fy * (b.top - b.bottom)];
}

/** The canvas's own rectangle, for drivers that position DOM overlays inside the map pane. */
export const canvasRect = (width: number, height: number): ScreenRect => ({ left: 0, top: 0, width, height });

/** The part of the canvas that shows the map (right of the album panel inset, below the header's `insetTop`), less
 * `edge` CSS px on every side: the one area the hover label, the focus markers and the region names are kept
 * inside. */
export function visibleArea(insetLeft: number, width: number, height: number, edge: number, insetTop: number): ViewBounds {
  return { left: insetLeft + edge, top: insetTop + edge, right: width - edge, bottom: height - edge };
}
