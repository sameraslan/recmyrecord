import { create } from 'zustand';
import type { ThemeData } from '@/lib/data/theme';
import type { MapData } from '../data';
import type { MapCallbacks, MapInput } from '../types';
import { requestRender } from './invalidate';

export const DEFAULT_INPUT: MapInput = {
  stop: 'balanced',
  focus: null,
  hot: null,
  selected: null,
  interactive: false,
  explore: false,
  dimmed: true,
  insetLeft: 0,
  framePadding: { top: 96, right: 96, bottom: 96, left: 96 },
  fitPadding: { top: 55, right: 40, bottom: 115, left: 40 },
  bottomCover: 0,
};

const NO_CALLBACKS: MapCallbacks = { onHover: () => {}, onPick: () => {}, onEmpty: () => {}, onContextLost: () => {} };

export interface MapStore {
  data: MapData | null;
  /** Gas, star colours and region names; null while it loads and when there is none (plain sky, white stars). */
  theme: ThemeData | null;
  input: MapInput;
  callbacks: MapCallbacks;
  /** Animated slider position: 0 sonic, 0.5 balanced, 1 mood. */
  sliderT: number;
  /** Album under the mouse after the 80 ms settle (or the hovered focus marker), null otherwise. */
  hoveredIndex: number | null;
  /** Current (animated) left inset in CSS px. */
  insetCurrent: number;
  lastInteraction: number;
  lastCameraGrab: number;
  dragging: boolean;
  animating: boolean;
  /** True while CameraBounds eases the camera back towards the cloud. */
  nudging: boolean;
  /** True while CameraRig's own wheel-zoom easing or drag fling is still moving the camera. */
  rigMoving: boolean;
  /** True while MorphDriver animates sliderT towards the current stop. */
  morphing: boolean;
  /** Date.now() of the last Reset while focused: camera grabs before it no longer stop the focus framing. */
  focusRearmedAt: number;
  setData: (data: MapData | null) => void;
  setTheme: (theme: ThemeData | null) => void;
  setInput: (input: MapInput) => void;
  setCallbacks: (callbacks: MapCallbacks) => void;
  setSliderT: (t: number) => void;
  setHoveredIndex: (i: number | null) => void;
  setInsetCurrent: (px: number) => void;
  registerInteraction: () => void;
  registerCameraGrab: () => void;
  setDragging: (dragging: boolean) => void;
  setAnimating: (animating: boolean) => void;
  setNudging: (nudging: boolean) => void;
  setRigMoving: (rigMoving: boolean) => void;
  setMorphing: (morphing: boolean) => void;
  rearmFocus: () => void;
}

export const useMapStore = create<MapStore>()((set, get) => ({
  data: null,
  theme: null,
  input: DEFAULT_INPUT,
  callbacks: NO_CALLBACKS,
  sliderT: 0.5,
  hoveredIndex: null,
  insetCurrent: 0,
  lastInteraction: 0,
  lastCameraGrab: 0,
  dragging: false,
  animating: false,
  nudging: false,
  rigMoving: false,
  morphing: false,
  focusRearmedAt: 0,
  setData: (data) => set({ data }),
  setTheme: (theme) => {
    if (get().theme === theme) return;
    set({ theme });
    requestRender();
  },
  setInput: (input) => {
    set({ input });
    requestRender();
  },
  setCallbacks: (callbacks) => set({ callbacks }),
  setSliderT: (t) => {
    set({ sliderT: Math.min(1, Math.max(0, t)) });
    requestRender();
  },
  setHoveredIndex: (hoveredIndex) => set((s) => (s.hoveredIndex === hoveredIndex ? s : { hoveredIndex })),
  setInsetCurrent: (insetCurrent) => set({ insetCurrent }),
  registerInteraction: () => set({ lastInteraction: Date.now() }),
  registerCameraGrab: () => set({ lastCameraGrab: Date.now() }),
  setDragging: (dragging) => set({ dragging }),
  setAnimating: (animating) => set((s) => (s.animating === animating ? s : { animating })),
  setNudging: (nudging) => set((s) => (s.nudging === nudging ? s : { nudging })),
  setRigMoving: (rigMoving) => set((s) => (s.rigMoving === rigMoving ? s : { rigMoving })),
  setMorphing: (morphing) => set((s) => (s.morphing === morphing ? s : { morphing })),
  rearmFocus: () => set({ focusRearmedAt: Date.now() }),
}));
