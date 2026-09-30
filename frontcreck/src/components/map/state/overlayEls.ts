/** DOM overlays positioned every rendered frame by the drivers (no React state per frame). */
const els = new Map<string, Element>();

export function setOverlayEl(key: string, el: Element | null): void {
  if (el) els.set(key, el);
  else els.delete(key);
}

export function getOverlayEl<T extends Element = HTMLElement>(key: string): T | null {
  return (els.get(key) as T | undefined) ?? null;
}

export const markerKey = (id: number): string => `marker-${id}`;
