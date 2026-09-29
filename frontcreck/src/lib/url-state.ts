import { DEFAULT_STOP, STOP_IDS, type StopId } from '@/lib/types';

export type View = 'home' | 'explore' | 'album' | 'about' | 'other';

export function isStopId(v: unknown): v is StopId {
  return typeof v === 'string' && (STOP_IDS as readonly string[]).includes(v);
}

/** `?by=` value to a stop; absent or unknown means balanced. */
export function parseBy(value: string | null | undefined): StopId {
  return isStopId(value) ? value : DEFAULT_STOP;
}

export function albumHref(slug: string, by: StopId = DEFAULT_STOP): string {
  const base = `/album/${encodeURIComponent(slug)}`;
  return by === DEFAULT_STOP ? base : `${base}?by=${by}`;
}

export function hrefWithBy(href: string, by: StopId): string {
  const u = new URL(href, 'http://x.invalid');
  if (by === DEFAULT_STOP) u.searchParams.delete('by');
  else u.searchParams.set('by', by);
  return u.pathname + u.search + u.hash;
}

/** Writes `?by=` without a navigation or a new history entry (Next syncs useSearchParams). */
export function replaceBy(by: StopId): void {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search + window.location.hash;
  const next = hrefWithBy(current, by);
  if (next !== current) window.history.replaceState(null, '', next);
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
