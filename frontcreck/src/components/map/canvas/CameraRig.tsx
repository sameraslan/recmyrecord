"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { prefersReducedMotion } from "@/lib/media";
import { useMapStore } from "../state/mapStore";
import { screenToWorld } from "../state/projection";
import { getOverviewFraming, getVisibleScale } from "../state/view";
import { MAX_ZOOM, MIN_ZOOM_FIT_MULTIPLE } from "../state/zoomLimits";
import { anchoredZoom, flingStopSpeedSq, pinchZoom } from "../state/zoomMath";
import { getCameraControl } from "./CameraTween";

export { MAX_ZOOM };

/** Dynamic zoom-out floor: 0.8x the fitted overview zoom (the fit is clamped
 * to FIT_ZOOM_MAX, far below MAX_ZOOM). */
function getMinZoom(): number {
  return MIN_ZOOM_FIT_MULTIPLE * getOverviewFraming().zoom;
}
// Trackpad pinch (ctrlKey) uses half the sensitivity of a mouse wheel notch.
const WHEEL_SENSITIVITY = 0.0015;
const PINCH_SENSITIVITY = 0.00075;
// Exponential time constant (seconds) the frame loop uses to approach
// targetZoom.
const ZOOM_TIME_CONSTANT_S = 0.09;
// Below this the smoothed zoom is treated as settled: snap to the exact
// target and stop invalidating, or frameloop="demand" would never go idle.
const ZOOM_SETTLE_EPSILON = 1e-4;
// Fling decay per 60 Hz frame. Applied per elapsed time (FRICTION ** (delta * 60)), so a fling lasts
// as long and travels as far on a slow renderer as on a 60 fps one.
const FRICTION = 0.92;
// Below flingStopSpeedSq(zoom) (a squared speed in world units/frame, 1e-10 up to zoom 28 and the same speed on
// screen past it) inertia is treated as settled: stop nudging the camera and stop re-invalidating every frame,
// or frameloop="demand" would never go idle after a pan.
// Fling velocity averages the last 3 move deltas.
const VELOCITY_HISTORY_LEN = 3;
// A release this long after the last move is a hold-then-let-go, not a
// flick: no fling, so the camera stays exactly where the drag left it.
const FLING_MAX_IDLE_MS = 80;

/** The ceiling is MAX_ZOOM in the size it has on screen when nothing covers the canvas (zoomLimits visibleScale):
 * with the canvas running under the header, the deepest zoom shows albums exactly as far apart as before. */
export function clampZoom(z: number): number {
  return Math.max(getMinZoom(), Math.min(MAX_ZOOM * getVisibleScale(), z));
}

/** Keyboard steps: CSS px per arrow press and zoom factor per +/- press. */
const KEY_PAN_PX = 70;
const KEY_ZOOM_FACTOR = 1.4;

let stopRig: (() => void) | null = null;
/** Cancels any wheel-zoom easing and drag fling in progress (CameraTween calls this before every tween). */
export function stopCameraRig(): void {
  stopRig?.();
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const dragging = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const velocity = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Last few move deltas (world units, already scaled), newest last. Averaged
  // on release into the fling velocity, so a single jittery final move can't
  // dominate the fling.
  const moveHistory = useRef<{ x: number; y: number }[]>([]);
  // performance.now() of the last pan move, for the fling staleness check.
  const lastMoveAt = useRef(0);

  // All currently-down pointers, keyed by pointerId (screen px). Used to
  // detect a two-finger pinch: single-pointer pan is handled by the existing
  // dragging/lastPointer refs above, driven only while this map holds
  // exactly one entry.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchActive = useRef(false);
  const pinchStartDist = useRef(0);
  const pinchStartZoom = useRef(1);

  // Target zoom the frame loop eases camera.zoom toward. Kept in sync with
  // camera.zoom whenever no wheel gesture is in flight, so it never fights
  // CameraTween's direct camera.zoom writes during a glide.
  const targetZoom = useRef(camera.zoom);
  const zooming = useRef(false);
  // World point under the cursor at the most recent wheel event; held fixed
  // on screen while the smoothed zoom eases toward targetZoom.
  const zoomAnchor = useRef<[number, number] | null>(null);

  const registerInteraction = useMapStore((s) => s.registerInteraction);
  const registerCameraGrab = useMapStore((s) => s.registerCameraGrab);
  const setDragging = useMapStore((s) => s.setDragging);

  useEffect(() => {
    stopRig = () => {
      zooming.current = false;
      zoomAnchor.current = null;
      velocity.current.x = 0;
      velocity.current.y = 0;
      targetZoom.current = camera.zoom;
      useMapStore.getState().setRigMoving(false);
    };
    return () => {
      stopRig = null;
    };
  }, [camera]);

  useEffect(() => {
    const canvas = gl.domElement;
    const interactive = () => useMapStore.getState().input.interactive;
    // Tracks whether the current drag has moved yet, so the grab is only
    // registered once the pointer actually moves with the button down,
    // matching "pointerdown-drag" rather than every click.
    let dragMoved = false;

    const onDown = (e: PointerEvent) => {
      if (!interactive()) return;
      // Captures the pointer to the canvas so drag/pinch events keep
      // arriving even once a finger leaves the canvas bounds;
      // released per-pointer on pointerup/pointercancel below.
      canvas.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      registerInteraction();

      if (pointers.current.size === 1) {
        dragging.current = true;
        dragMoved = false;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        velocity.current = { x: 0, y: 0 };
        moveHistory.current = [];
        setDragging(true);
        registerCameraGrab();
      } else if (pointers.current.size === 2) {
        // A second finger arrived mid-gesture: this is now a pinch, not a
        // pan. Cancel any in-flight single-finger drag so it can't leave
        // stale velocity behind (no fling after a pinch, spec/Task 11
        // item 2), then start the pinch from the two current points.
        dragging.current = false;
        setDragging(false);
        lastPointer.current = null;
        velocity.current = { x: 0, y: 0 };
        moveHistory.current = [];
        const pts = Array.from(pointers.current.values());
        pinchStartDist.current = dist(pts[0], pts[1]);
        pinchStartZoom.current = camera.zoom;
        pinchActive.current = true;
        // Published as motion (state/motion.ts), so the focus covers ride through the pinch and settle once.
        useMapStore.getState().setPinching(true);
        registerCameraGrab();
      }
      // A 3rd+ pointer is ignored: the existing pinch (or pan) continues
      // driven by whichever two/one pointers were already tracked.
    };
    const onMove = (e: PointerEvent) => {
      // Only moves that are part of a drag or pinch count as interaction (not plain hovering).
      if (!interactive() || !pointers.current.has(e.pointerId)) return;
      registerInteraction();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinchActive.current && pointers.current.size === 2) {
        const pts = Array.from(pointers.current.values());
        const currDist = dist(pts[0], pts[1]);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const rect = canvas.getBoundingClientRect();
        const midWorld = screenToWorld(midX, midY, rect, camera);
        const rawZoom = pinchZoom(pinchStartDist.current, currDist, pinchStartZoom.current);
        const nextZoom = clampZoom(rawZoom);
        const nextPos = anchoredZoom(
          { x: camera.position.x, y: camera.position.y, zoom: camera.zoom },
          midWorld,
          nextZoom,
        );
        camera.position.x = nextPos.x;
        camera.position.y = nextPos.y;
        camera.zoom = nextZoom;
        camera.updateProjectionMatrix();
        invalidate();
        return;
      }

      if (!dragging.current || !lastPointer.current || pointers.current.size !== 1) return;
      if (!dragMoved) {
        dragMoved = true;
        registerCameraGrab();
      }
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // World units per CSS px, so the map follows the pointer exactly.
      const scale = (camera.top - camera.bottom) / (canvas.getBoundingClientRect().height * camera.zoom);
      const wdx = -dx * scale;
      const wdy = dy * scale;
      camera.position.x += wdx;
      camera.position.y += wdy;
      moveHistory.current.push({ x: wdx, y: wdy });
      lastMoveAt.current = performance.now();
      if (moveHistory.current.length > VELOCITY_HISTORY_LEN) {
        moveHistory.current.shift();
      }
      invalidate();
    };
    const endDrag = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      if (pointers.current.size < 2) {
        // Pinch ends the moment fewer than two fingers remain.
        pinchActive.current = false;
        useMapStore.getState().setPinching(false);
      }

      if (pointers.current.size === 0) {
        dragging.current = false;
        setDragging(false);
        lastPointer.current = null;
        const hist = moveHistory.current;
        const fresh = performance.now() - lastMoveAt.current <= FLING_MAX_IDLE_MS;
        if (hist.length > 0 && fresh && !prefersReducedMotion()) {
          let sx = 0;
          let sy = 0;
          for (const v of hist) {
            sx += v.x;
            sy += v.y;
          }
          velocity.current = { x: sx / hist.length, y: sy / hist.length };
          // Publish at once, so MapApi.isAnimating() is true before the first fling frame.
          useMapStore.getState().setRigMoving(true);
          // frameloop="demand": start the fling now. Without this the
          // stored velocity sat until some unrelated frame rendered (a
          // hover, a later wake) and the camera lurched then.
          invalidate();
        }
        moveHistory.current = [];
      } else {
        // One finger remains after a pinch (or a 3rd+ pointer lifted): don't
        // resume a seamless pan from here, and don't fling, the remaining
        // finger's position vs. the lifted one would otherwise read as a
        // sudden jump. A fresh pointerdown starts a clean pan.
        dragging.current = false;
        setDragging(false);
        lastPointer.current = null;
        velocity.current = { x: 0, y: 0 };
        moveHistory.current = [];
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!interactive()) return;
      e.preventDefault();
      registerInteraction();
      registerCameraGrab();
      const sensitivity = e.ctrlKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
      const factor = 1 - e.deltaY * sensitivity;
      const base = zooming.current ? targetZoom.current : camera.zoom;
      targetZoom.current = clampZoom(base * factor);
      const rect = canvas.getBoundingClientRect();
      zoomAnchor.current = screenToWorld(e.clientX, e.clientY, rect, camera);
      if (prefersReducedMotion()) {
        // No easing: land on the target now, keeping the point under the cursor fixed.
        const next = anchoredZoom({ x: camera.position.x, y: camera.position.y, zoom: camera.zoom }, zoomAnchor.current, targetZoom.current);
        camera.position.x = next.x;
        camera.position.y = next.y;
        camera.zoom = targetZoom.current;
        camera.updateProjectionMatrix();
        zooming.current = false;
        zoomAnchor.current = null;
      } else {
        zooming.current = true;
        useMapStore.getState().setRigMoving(true);
      }
      invalidate();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!interactive() || e.altKey || e.ctrlKey || e.metaKey) return;
      const api = getCameraControl();
      if (!api) return;
      switch (e.key) {
        case "ArrowLeft":
          api.panBy(-KEY_PAN_PX, 0);
          break;
        case "ArrowRight":
          api.panBy(KEY_PAN_PX, 0);
          break;
        case "ArrowUp":
          api.panBy(0, KEY_PAN_PX);
          break;
        case "ArrowDown":
          api.panBy(0, -KEY_PAN_PX);
          break;
        case "+":
        case "=":
          api.zoomBy(KEY_ZOOM_FACTOR);
          break;
        case "-":
        case "_":
          api.zoomBy(1 / KEY_ZOOM_FACTOR);
          break;
        case "0":
          api.reset();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", endDrag);
    // pointerleave no longer ends the drag: setPointerCapture keeps move/up
    // events targeting the canvas even once the cursor leaves it. Only a real
    // pointercancel (e.g. the OS taking over the gesture) ends it early.
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    return () => {
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("wheel", onWheel);
      if (pinchActive.current) {
        pinchActive.current = false;
        useMapStore.getState().setPinching(false);
      }
    };
  }, [camera, gl, registerInteraction, registerCameraGrab, setDragging, invalidate]);

  // eslint-disable-next-line react-hooks/immutability -- this per-frame callback mutates the R3F camera in place throughout (pan inertia and zoom below); the standard R3F pattern for a hot path that must redraw the canvas every frame without triggering a React re-render.
  useFrame((_state, delta) => {
    if (!dragging.current) {
      const speedSq = velocity.current.x * velocity.current.x + velocity.current.y * velocity.current.y;
      if (speedSq > flingStopSpeedSq(camera.zoom)) {
        // velocity is in world units per 60 Hz frame; scale by the real frame time.
        const frames = Math.min(delta, 0.1) * 60;
        // eslint-disable-next-line react-hooks/immutability -- see the useFrame-level comment above.
        camera.position.x += velocity.current.x * frames;
        camera.position.y += velocity.current.y * frames;
        const decay = Math.pow(FRICTION, frames);
        velocity.current.x *= decay;
        velocity.current.y *= decay;
        // Inertia still has visible speed: keep the demand loop alive for
        // another frame.
        invalidate();
      } else {
        velocity.current.x = 0;
        velocity.current.y = 0;
      }
    }

    if (zooming.current) {
      const prevZoom = camera.zoom;
      const prevX = camera.position.x;
      const prevY = camera.position.y;
      const diff = targetZoom.current - prevZoom;
      // Clamped: the first frame after an idle stretch reports a long delta, which would jump.
      let nextZoom = prevZoom + diff * (1 - Math.exp(-Math.min(delta, 1 / 30) / ZOOM_TIME_CONSTANT_S));
      const settled = Math.abs(targetZoom.current - nextZoom) < ZOOM_SETTLE_EPSILON;
      if (settled) nextZoom = targetZoom.current;

      if (zoomAnchor.current) {
        const nextPos = anchoredZoom(
          { x: prevX, y: prevY, zoom: prevZoom },
          zoomAnchor.current,
          nextZoom,
        );
        camera.position.x = nextPos.x;
        camera.position.y = nextPos.y;
      }
      // eslint-disable-next-line react-hooks/immutability -- see the useFrame-level comment above.
      camera.zoom = nextZoom;
      camera.updateProjectionMatrix();

      if (settled) {
        zooming.current = false;
      } else {
        invalidate();
      }
    } else {
      // No wheel gesture in flight: keep targetZoom tracking the real zoom
      // (which CameraTween may be driving directly) so the next wheel event
      // starts from the current value instead of a stale target.
      targetZoom.current = camera.zoom;
    }

    const moving =
      zooming.current ||
      velocity.current.x * velocity.current.x + velocity.current.y * velocity.current.y > flingStopSpeedSq(camera.zoom);
    if (moving !== useMapStore.getState().rigMoving) useMapStore.getState().setRigMoving(moving);
  });

  return null;
}
