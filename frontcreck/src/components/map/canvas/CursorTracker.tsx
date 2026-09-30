"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";

import { DURATION } from "@/lib/media";
import { renderedSpriteCssSize } from "../shaders/album";
import { cssPxToWorld, pickAlbum, spriteHitRadiusCssPx } from "../state/hitTest";
import { useMapStore } from "../state/mapStore";
import { canvasRect, screenToWorld } from "../state/projection";
import { getOverviewFraming } from "../state/view";

/** After a mouse press, hover resumes once the pointer moves this far (CSS
 * px) from where it was pressed, so click jitter doesn't count as a move. */
const HOVER_RESUME_MOVE_PX = 4;

/**
 * Mouse hover/click radius in CSS px at the camera's current zoom: the drawn
 * sprite's radius once covers outgrow the 14px minimum (state/hitTest.ts).
 */
export function mouseHitRadiusCssPx(
  camera: THREE.OrthographicCamera,
  viewportHeightCssPx: number,
  pixelRatio: number,
): number {
  const sprite = renderedSpriteCssSize(
    camera.zoom,
    getOverviewFraming().zoom,
    viewportHeightCssPx,
    pixelRatio,
  );
  return spriteHitRadiusCssPx("mouse", sprite);
}

/**
 * The album under a world point, shared by hover (CursorTracker) and
 * click/tap (PickController) so a click lands on the album the hover label
 * names. Follows the shader's draw order (state/hitTest.ts pickAlbum): the
 * focused album wins anywhere inside its drawn disc, then the hovered one,
 * then the nearest centre within the pointer's hit radius.
 */
export function albumAt(
  worldX: number,
  worldY: number,
  camera: THREE.OrthographicCamera,
  viewportHeightCssPx: number,
  pixelRatio: number,
  pointerType: string,
  positions: Float32Array,
  hoverIndex: number,
): number {
  const fitZoom = getOverviewFraming().zoom;
  const toWorld = (px: number) =>
    cssPxToWorld(px, viewportHeightCssPx, camera.zoom, camera.top - camera.bottom);
  const drawnRadius = (scale: number) =>
    renderedSpriteCssSize(camera.zoom, fitZoom, viewportHeightCssPx, pixelRatio, scale) / 2;
  const focusedIndex = useMapStore.getState().input.focus?.seed ?? -1;
  return pickAlbum(
    positions,
    positions.length / 2,
    worldX,
    worldY,
    toWorld(spriteHitRadiusCssPx(pointerType, drawnRadius(1) * 2)),
    [
      // Shader scales: focused (in its own highlight set) 1.15, hovered 1.25.
      { index: focusedIndex, radiusWorld: toWorld(drawnRadius(1.15)) },
      { index: hoverIndex, radiusWorld: toWorld(drawnRadius(1.25)) },
    ],
  );
}

/**
 * World position under a canvas-relative CSS px point (what `cursorRef`
 * stores), through the camera as it is right now. Converting at read time
 * rather than at pointermove time keeps hover and the pointer cursor correct
 * after the camera moves under a resting mouse (fly-to, bounds nudges, pinch).
 */
export function cursorToWorld(
  cursorPx: [number, number],
  size: { width: number; height: number },
  camera: THREE.OrthographicCamera,
): [number, number] {
  return screenToWorld(cursorPx[0], cursorPx[1], canvasRect(size.width, size.height), camera);
}

export function CursorTracker({
  cursorRef,
  hoverRef,
  positionsRef,
}: {
  /** Canvas-relative CSS px of the mouse, or null when it is off the canvas. */
  cursorRef: React.RefObject<[number, number] | null>;
  /** -1 = no hover target. Written at most once per rendered frame. */
  hoverRef: React.RefObject<number>;
  /** Flat [x0,y0,x1,y1,...] interpolated positions, owned by AlbumField. */
  positionsRef: React.RefObject<Float32Array>;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // Debounces the tooltip's 80ms hover-in delay; cleared whenever the hover
  // target changes before it fires. A ref (not a local var in the effect)
  // because it's read and cleared from both the pointer-event effect (on
  // unmount) and the useFrame hit-test gate below.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True from a mouse press until the pointer next moves more than
  // HOVER_RESUME_MOVE_PX from where it was pressed (see the useFrame below).
  const hoverSuppressedRef = useRef(false);

  function setHover(index: number | null) {
    useMapStore.getState().setHoveredIndex(index);
    useMapStore.getState().callbacks.onHover(index);
  }

  function clearHoverTimer() {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  useEffect(() => {
    const canvas = gl.domElement;
    // Only records the latest pointer position here; the actual hit test
    // (an O(n) scan) runs at most once per rendered frame in the useFrame
    // below, not once per pointermove event. Multiple moves
    // between frames collapse into a single hit test against the latest
    // position, same as browser event coalescing would give us, but
    // guaranteed rather than relied upon.
    let pressAt: [number, number] | null = null;
    const interactive = () => useMapStore.getState().input.interactive;
    function onDown(e: PointerEvent) {
      if (e.pointerType === "touch" || !interactive()) return;
      hoverSuppressedRef.current = true;
      pressAt = [e.clientX, e.clientY];
      invalidate();
    }
    function onMove(e: PointerEvent) {
      // Hover has no meaning on touch: there is no "cursor" resting over a
      // point between touches, and a finger is always covering whatever it
      // could hover, so a touch pointermove (drag/pinch) must never arm the
      // hover ring or the 80ms hover-label timer.
      if (e.pointerType === "touch" || !interactive()) return;
      if (
        hoverSuppressedRef.current &&
        (!pressAt ||
          Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > HOVER_RESUME_MOVE_PX)
      ) {
        hoverSuppressedRef.current = false;
      }
      const rect = canvas.getBoundingClientRect();
      cursorRef.current = [e.clientX - rect.left, e.clientY - rect.top];
      invalidate();
    }
    function onLeave(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      cursorRef.current = null;
      invalidate();
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [gl, cursorRef, invalidate]);

  useEffect(() => clearHoverTimer, []);

  // The actual hit test: runs once per rendered frame (frameloop="demand"
  // means this only fires when something invalidated, e.g. the pointermove
  // handler above), never once per pointer event. Every camera animation
  // (fly-to, bounds nudge, pinch) also renders frames, and the
  // cursor is re-projected through the live camera on each of them, so the
  // hover target follows whatever is under a resting mouse.
  // eslint-disable-next-line react-hooks/immutability -- this per-frame callback sets canvas.style.cursor directly on the R3F canvas DOM node (see below); a plain DOM style write is cheaper than routing cursor state through React here and matches the rest of this hot path's ref-based, non-React-render pattern.
  useFrame((state) => {
    const canvas = gl.domElement;
    // A route that turns the map non-interactive (Home, About) ends the hover even without a pointerleave.
    const c = useMapStore.getState().input.interactive ? cursorRef.current : null;

    if (!c) {
      if (hoverRef.current !== -1) {
        hoverRef.current = -1;
        clearHoverTimer();
        setHover(null);
      }
      // eslint-disable-next-line react-hooks/immutability -- see the useFrame-level comment above.
      canvas.style.cursor = "";
      return;
    }

    const cam = camera as THREE.OrthographicCamera;
    const [wx, wy] = cursorToWorld(c, state.size, cam);
    // Right after a click the camera flies the focused album to the centre
    // and some unrelated album slides under the resting cursor; hover stays
    // off until the pointer actually moves, so that album doesn't pop up a
    // second label next to the one just clicked.
    const idx = hoverSuppressedRef.current
      ? -1
      : albumAt(
          wx,
          wy,
          cam,
          state.size.height,
          gl.getPixelRatio(),
          "mouse",
          positionsRef.current,
          hoverRef.current,
        );
    canvas.style.cursor = idx >= 0 ? "pointer" : "";

    if (idx !== hoverRef.current) {
      hoverRef.current = idx;
      clearHoverTimer();
      if (idx >= 0) {
        hoverTimerRef.current = setTimeout(() => {
          hoverTimerRef.current = null;
          setHover(idx);
          invalidate();
        }, DURATION.hoverLabel);
      } else {
        setHover(null);
      }
    }
  });

  return null;
}
