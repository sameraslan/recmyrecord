import { STOP_T } from '../data';
import type { MapStore } from './mapStore';

/** True while the view is still on its way somewhere, so that another drawn frame is coming or the visitor still
 * holds the map: a camera tween, a fling or wheel easing, a slider morph (also the frame before it starts), a
 * bounds nudge, the album panel sliding, a drag or a pinch. */
export function inMotion(s: MapStore): boolean {
  return s.animating || s.rigMoving || s.morphing || s.nudging || s.dragging || s.pinching || s.sliderT !== STOP_T[s.input.stop] || s.insetCurrent !== s.input.insetLeft;
}

/** How long after its last step a motion made of steps still counts as one, ms. A held key repeats every 30 ms
 * or so, a wheel sends an event every frame or two and a window being resized draws every frame. */
export const STEP_HOLD_MS = 150;

let stepTimer: ReturnType<typeof setTimeout> | null = null;
let stepEnd: (() => void) | null = null;

function endStep(): void {
  stepTimer = null;
  stepEnd?.();
}

/** Marks a camera step that is applied at once and sets no flag in the store: an arrow key's pan, a wheel
 * notch under reduced motion (canvas/CameraRig.tsx), a resize (state/namesPlacer.ts). A run of them is one
 * motion for the region names, which keep their spots until it stops. Called from a key or wheel handler or a
 * resize frame, never from a pointer move. One timer at most; nothing runs per frame. The covers do not read
 * this: inMotion is theirs and stays as it was. */
export function markStep(): void {
  if (stepTimer !== null) clearTimeout(stepTimer);
  stepTimer = setTimeout(endStep, STEP_HOLD_MS);
}

/** True from a step until STEP_HOLD_MS after the last one. */
export function inStep(): boolean {
  return stepTimer !== null;
}

/** `fn` is called when a run of steps has stopped (inStep is false by then), outside any frame. One listener
 * (the names' rest placement); returns its removal, which leaves a later listener alone. */
export function onStepEnd(fn: () => void): () => void {
  stepEnd = fn;
  return () => {
    if (stepEnd === fn) stepEnd = null;
  };
}
