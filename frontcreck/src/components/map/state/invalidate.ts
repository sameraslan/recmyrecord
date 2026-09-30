/**
 * Bridge between DOM overlays outside the <Canvas> (Slider, and the Zustand
 * store's setSliderT) and R3F's demand-mode invalidate(). A tiny component
 * mounted inside the canvas tree (InvalidateBridge in Scene.tsx) registers
 * the live invalidate function here on mount; overlays call requestRender()
 * without needing to know they're outside the fiber tree.
 */
type InvalidateFn = () => void;

let invalidateFn: InvalidateFn | null = null;

export function setInvalidate(fn: InvalidateFn | null): void {
  invalidateFn = fn;
}

export function requestRender(): void {
  invalidateFn?.();
}
