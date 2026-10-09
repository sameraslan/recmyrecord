/**
 * Marks on the way to the map's first picture, one `performance.mark` each, set once per page load. They cost
 * nothing to leave in, show in the browser's performance panel, and are read by scripts/perf/first-frame.mjs.
 *   rmr-data-start   the first of albums.json and positions.json is asked for
 *   rmr-data-end     both are in and checked
 *   rmr-chunk-start  the map's code (three.js and the canvas) is asked for
 *   rmr-chunk-end    it has run
 *   rmr-gas-fetch    the opening stop's nebula image is asked for
 *   rmr-gas-decoded  it is decoded
 *   rmr-map-frame    the canvas has drawn its first frame
 *   rmr-gas-drawn    the first frame with the nebula in it
 *   rmr-map-shown    the canvas is shown for the first time (components/map/state/reveal.ts)
 * (rmr-search-ready and rmr-webgl-warm are older and set where they happen.)
 */
export type LoadMark =
  | 'rmr-data-start'
  | 'rmr-data-end'
  | 'rmr-chunk-start'
  | 'rmr-chunk-end'
  | 'rmr-gas-fetch'
  | 'rmr-gas-decoded'
  | 'rmr-map-frame'
  | 'rmr-gas-drawn'
  | 'rmr-map-shown';

const done = new Set<LoadMark>();

/** Sets the mark the first time it is called with this name in a page load; later calls do nothing. */
export function markOnce(name: LoadMark): void {
  if (typeof window === 'undefined' || done.has(name)) return;
  done.add(name);
  try {
    performance.mark(name);
  } catch {
    // No User Timing here: the marks are for measuring, never for the page.
  }
}

/** Tests only. */
export function resetMarks(): void {
  done.clear();
}
