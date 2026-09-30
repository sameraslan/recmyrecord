/** Hover and click radius for a mouse, in CSS px (spec 4.4.3). */
export const MOUSE_HIT_RADIUS_CSS_PX = 14;
/** Tap radius for touch and pen, in CSS px: a fingertip is far less precise
 * than a cursor, so taps get a larger target. */
export const TOUCH_HIT_RADIUS_CSS_PX = 24;

/** Hit radius in CSS px for a PointerEvent's `pointerType`. */
export function hitRadiusCssPx(pointerType: string): number {
  return pointerType === "mouse" ? MOUSE_HIT_RADIUS_CSS_PX : TOUCH_HIT_RADIUS_CSS_PX;
}

/**
 * Hit radius in CSS px for a sprite drawn `spriteCssPx` wide: the pointer's
 * minimum target, or the drawn disc itself once covers are larger than
 * that, so the whole cover is hoverable and clickable when zoomed in, not
 * just the 14px around its centre.
 */
export function spriteHitRadiusCssPx(pointerType: string, spriteCssPx: number): number {
  return Math.max(hitRadiusCssPx(pointerType), spriteCssPx / 2);
}

/**
 * Converts a length in CSS px to world units under an orthographic camera:
 * one world unit spans `zoom * viewportHeightCssPx / frustumHeight` CSS px,
 * where `frustumHeight` is `camera.top - camera.bottom`. Shared by hover
 * (CursorTracker) and click/tap (FocusController) so both use the same
 * on-screen radius at every zoom.
 */
export function cssPxToWorld(
  px: number,
  viewportHeightCssPx: number,
  zoom: number,
  frustumHeight: number,
): number {
  return px / ((zoom * viewportHeightCssPx) / frustumHeight);
}

/**
 * O(n) nearest-point hit test over a flat, interleaved [x0,y0,x1,y1,...]
 * position array. Used by CursorTracker once per rendered frame and by
 * FocusController on each tap, against the
 * current interpolated positions AlbumField maintains (see AlbumField.tsx),
 * so it stays a typed-array scan rather than an array-of-objects walk.
 */
export function nearestWithin(
  positions: Float32Array,
  n: number,
  x: number,
  y: number,
  radiusWorld: number,
): number {
  let best = -1;
  let bestD2 = radiusWorld * radiusWorld;
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 2] - x;
    const dy = positions[i * 2 + 1] - y;
    const d2 = dx * dx + dy * dy;
    // Strict less-than: on a tie the earlier index (already stored in
    // `best`) is kept, matching "ties pick the first" in the task brief.
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

/** A hit-test candidate that wins over nearest-centre when the point is
 * inside its own drawn disc (radius in world units). */
export interface PriorityHit {
  index: number;
  radiusWorld: number;
}

/**
 * Hit test in draw order. Sprites overlap once zoomed in, and the shader
 * draws the focused album on top, then the hovered one; a plain nearest-
 * centre test would name a neighbour whose centre is closer even though the
 * cursor is on the cover drawn above it. So each `priority` candidate
 * (topmost first; index -1 skipped) wins anywhere inside its own disc, and
 * everything else falls back to `nearestWithin`.
 */
export function pickAlbum(
  positions: Float32Array,
  n: number,
  x: number,
  y: number,
  radiusWorld: number,
  priority: readonly PriorityHit[],
): number {
  for (const p of priority) {
    if (p.index < 0 || p.index >= n) continue;
    const dx = positions[p.index * 2] - x;
    const dy = positions[p.index * 2 + 1] - y;
    if (dx * dx + dy * dy < p.radiusWorld * p.radiusWorld) return p.index;
  }
  return nearestWithin(positions, n, x, y, radiusWorld);
}
