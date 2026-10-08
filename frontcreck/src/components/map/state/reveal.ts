import { markOnce } from '@/lib/marks';

/**
 * How far the map's first picture has come. The pane shows a stand-in nebula from the first paint
 * (overlays/GasPlaceholder.tsx), and the canvas over it stays see-through until there is something to show:
 *   'wait'   nothing of the map is shown yet: the stand-in alone.
 *   'stars'  the canvas shows the stars over the stand-in: the nebula did not come within MAP_REVEAL_BUDGET_MS of
 *            the canvas's first frame.
 *   'gas'    the canvas has drawn the nebula. It covers the stand-in, which is taken away.
 *   'sky'    no nebula will come (no theme, an image that failed): the stand-in fades out and the stars stand on
 *            the plain sky.
 * It only ever moves forward ('gas' and 'sky' are final). A module-level bridge like state/invalidate.ts: the
 * canvas (in the map's own chunk) writes it, the stand-in (in the page's first chunk) reads it.
 */
export type MapReveal = 'wait' | 'stars' | 'gas' | 'sky';

/** How long the canvas waits for the nebula after its first frame before it shows the stars alone. With the image
 * asked for early it is on the GPU within a frame or two of the first one, so the two arrive as one picture; a
 * slow image or a software renderer must not hold the stars back for long. */
export const MAP_REVEAL_BUDGET_MS = 240;
/** The canvas fades in over this long (styles/map.css `.map-canvas`); the stand-in goes once it is covered. */
export const MAP_REVEAL_FADE_MS = 200;

let state: MapReveal = 'wait';
const listeners = new Set<() => void>();

export function getMapReveal(): MapReveal {
  return state;
}

export function subscribeMapReveal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMapReveal(next: MapReveal): void {
  if (next === state || state === 'gas' || state === 'sky' || next === 'wait') return;
  state = next;
  // When the map first showed anything (lib/marks.ts).
  markOnce('rmr-map-shown');
  for (const l of [...listeners]) l();
}

/** True once the canvas is shown ('stars', 'gas' or 'sky'). MapStage shows the controls that stand on the map (the
 * hint line with its band, the zoom buttons) with it, never ahead of it. Kept here, with the bridge, so the page's
 * first chunk reads it without the map's code. */
export function mapShown(): boolean {
  return state !== 'wait';
}

/** Tests only. */
export function resetMapReveal(): void {
  state = 'wait';
  for (const l of [...listeners]) l();
}
