import { DEFAULT_STOP, STOP_IDS, type StopId } from '@/lib/types';

export type View = 'home' | 'explore' | 'album' | 'about' | 'other';

export function isStopId(v: unknown): v is StopId {
  return typeof v === 'string' && (STOP_IDS as readonly string[]).includes(v);
}

/** What the address bar says for each stop. The first stop is named "Sound" on the slider, so its address is
 * `?by=sound`; the stop's id in the code, the data keys and the file names stays `sonic`. Only this file
 * translates, on the way in (parseBy) and on the way out (byParam). */
const BY_PARAM: Record<StopId, string> = { sonic: 'sound', balanced: 'balanced', mood: 'mood' };

/** The `?by=` value of a stop. */
export function byParam(stop: StopId): string {
  return BY_PARAM[stop];
}

/** `?by=` value to a stop; absent or unknown means balanced (`sonic` is unknown: it was never released). */
export function parseBy(value: string | null | undefined): StopId {
  return STOP_IDS.find((s) => BY_PARAM[s] === value) ?? DEFAULT_STOP;
}

export function albumHref(slug: string, by: StopId = DEFAULT_STOP): string {
  const base = `/album/${encodeURIComponent(slug)}`;
  return by === DEFAULT_STOP ? base : `${base}?by=${byParam(by)}`;
}

export function hrefWithBy(href: string, by: StopId): string {
  const u = new URL(href, 'http://x.invalid');
  if (by === DEFAULT_STOP) u.searchParams.delete('by');
  else u.searchParams.set('by', byParam(by));
  return u.pathname + u.search + u.hash;
}

/** Stops the app itself wrote with replaceBy that the URL has not caught up with yet, oldest first (see isOwnBy).
 * Several can be pending: Next may apply an older write after a newer one was already made. */
let ownBys: StopId[] = [];
if (typeof window !== 'undefined') {
  // Back and forward bring back URLs the app did not just write.
  window.addEventListener('popstate', () => {
    ownBys = [];
  });
}

/** Writes `?by=` without a navigation or a new history entry (Next syncs useSearchParams). */
export function replaceBy(by: StopId): void {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search + window.location.hash;
  const next = hrefWithBy(current, by);
  if (next === current) return;
  ownBys = [...ownBys.slice(-7), by];
  window.history.replaceState(null, '', next);
}

/**
 * True when `by` is a stop the app itself wrote with replaceBy that the URL had not caught up with, and forgets
 * it with every older one. Next applies such a URL in a transition, so it can arrive after the slider has
 * already moved on; the store is then ahead of the URL and must not be set back to it.
 */
export function isOwnBy(by: StopId): boolean {
  const i = ownBys.indexOf(by);
  if (i < 0) return false;
  ownBys = ownBys.slice(i + 1);
  return true;
}

/** Whether isOwnBy(by) would be true, without forgetting anything, for rendering. */
export function isPendingOwnBy(by: StopId): boolean {
  return ownBys.includes(by);
}

/** An album view is exactly a pathname that `slugFromPathname` accepts. */
export function viewFromPathname(pathname: string | null): View {
  if (!pathname || pathname === '/') return 'home';
  if (pathname === '/map') return 'explore';
  if (slugFromPathname(pathname) !== null) return 'album';
  if (pathname === '/about') return 'about';
  return 'other';
}

/** Slug of `/album/<slug>` (one segment, optional trailing slash); null otherwise or when the escape is malformed. */
export function slugFromPathname(pathname: string | null): string | null {
  const m = pathname?.match(/^\/album\/([^/?#]+)\/?$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function absoluteUrl(
  path: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'https://recmyrecord.com',
): string {
  return new URL(path, origin).toString();
}
