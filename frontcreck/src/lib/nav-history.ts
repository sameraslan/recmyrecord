/** The last recorded pathname and the one before it (client navigations only; previous is null on a direct load). */
let current: string | null = null;
let previous: string | null = null;

export function recordPath(pathname: string): void {
  if (pathname === current) return;
  previous = current;
  current = pathname;
}

export function previousPath(): string | null {
  return previous;
}

/** The last recorded path. During the render of a new route this is usually still the route being left. */
export function recordedPath(): string | null {
  return current;
}

/** How an album panel for `path` arrived: 'slide' from any other route, 'fade' from another album, 'none' on a
 * direct load. The route tracker may already have recorded `path` itself (on a direct load the page's content
 * renders on the client after the first commit, because useSearchParams bails out of the static HTML); then the
 * path before it counts. */
export function entryFrom(path: string, recorded: string | null, previous: string | null): 'slide' | 'fade' | 'none' {
  const from = recorded === path ? previous : recorded;
  return from === null ? 'none' : from.startsWith('/album/') ? 'fade' : 'slide';
}
