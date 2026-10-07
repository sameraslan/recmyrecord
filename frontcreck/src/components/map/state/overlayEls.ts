import type { PlacedMarker } from './focusLayout';

/** DOM overlays positioned every rendered frame by the drivers (no React state per frame). */
const els = new Map<string, Element>();

export function setOverlayEl(key: string, el: Element | null): void {
  if (el) els.set(key, el);
  else els.delete(key);
}

export function getOverlayEl<T extends Element = HTMLElement>(key: string): T | null {
  return (els.get(key) as T | undefined) ?? null;
}

const sizes = new Map<string, { width: number; height: number }>();

/** Cached CSS px size of an overlay, measured by its component after its content changes. */
export function setOverlaySize(key: string, width: number, height: number): void {
  sizes.set(key, { width, height });
}

export function getOverlaySize(key: string): { width: number; height: number } {
  return sizes.get(key) ?? { width: 0, height: 0 };
}

export const markerKey = (id: number): string => `marker-${id}`;

let placedMarkers: readonly PlacedMarker[] = [];

/** The focus markers as MarkerDriver last placed them (canvas CSS px), for hover and pick hit tests. The markers
 * themselves take no pointer events, so a drag or pinch that starts on a cover still reaches the canvas. */
export function setPlacedMarkers(placed: readonly PlacedMarker[]): void {
  placedMarkers = placed;
}

export function getPlacedMarkers(): readonly PlacedMarker[] {
  return placedMarkers;
}

let mapZoomed = false;

/** Whether the last drawn frame showed covers (OverlayDriver), so Explore's hint can start hidden when it mounts
 * over a map that is already zoomed in and no new frame is drawn (demand frameloop). */
export function setMapZoomed(zoomed: boolean): void {
  mapZoomed = zoomed;
}

export function isMapZoomed(): boolean {
  return mapZoomed;
}
