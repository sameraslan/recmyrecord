import { STOP_T } from '../data';
import type { MapStore } from './mapStore';

/** True while the view is still on its way somewhere, so that another drawn frame is coming or the visitor still
 * holds the map: a camera tween, a fling or wheel easing, a slider morph (also the frame before it starts), a
 * bounds nudge, the album panel sliding, a drag or a pinch. */
export function inMotion(s: MapStore): boolean {
  return s.animating || s.rigMoving || s.morphing || s.nudging || s.dragging || s.pinching || s.sliderT !== STOP_T[s.input.stop] || s.insetCurrent !== s.input.insetLeft;
}
