/** The search module (Fuse and the index code) as its own lazily loaded chunk. */
export function loadSearchModule(): Promise<typeof import('@/lib/search')> {
  return import('@/lib/search');
}
