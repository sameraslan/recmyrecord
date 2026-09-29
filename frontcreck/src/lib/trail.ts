import type { TrailItem } from '@/lib/types';

export const TRAIL_KEY = 'rmr-trail';
export const TRAIL_MAX = 12;
export const TRAIL_SHOWN = 4;

/** Visiting an album already on the trail cuts the trail back to it (breadcrumb back). */
export function pushTrail(trail: readonly TrailItem[], item: TrailItem): TrailItem[] {
  const at = trail.findIndex((t) => t.slug === item.slug);
  const next = at >= 0 ? trail.slice(0, at + 1) : [...trail, item];
  return next.slice(-TRAIL_MAX);
}

export function readTrail(): TrailItem[] {
  try {
    const raw = window.sessionStorage.getItem(TRAIL_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is TrailItem => !!x && typeof x.slug === 'string' && typeof x.title === 'string')
      .slice(-TRAIL_MAX);
  } catch {
    return [];
  }
}

export function writeTrail(trail: readonly TrailItem[]): void {
  try {
    window.sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail));
  } catch {
    // storage can be blocked; the trail then lasts for this page load only
  }
}

export function visibleTrail(trail: readonly TrailItem[]): { items: TrailItem[]; truncated: boolean } {
  const items = trail.slice(-TRAIL_SHOWN);
  return { items, truncated: trail.length > items.length };
}
