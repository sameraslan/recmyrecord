/** The previous in-app pathname (client navigations only; null on a direct load). */
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
