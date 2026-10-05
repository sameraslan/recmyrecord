import type { MapApi } from '@/components/map/types';
import type { AppState } from '@/lib/store';

declare global {
  interface Window {
    /** Hooks for Playwright and the perf script. Not read-only: getState() returns the store's setters too,
     * and map exposes the camera API, so anyone with the console can change app state through them. */
    __rmr?: {
      getState: () => AppState;
      /** Store changes (e2e counts focus updates). */
      subscribe: (listener: (state: AppState, prev: AppState) => void) => () => void;
      /** The map's camera API once the map has mounted. */
      map?: MapApi | null;
      /** Frames the map has rendered. */
      frames?: number;
      /** The gas layer. A stop is started from the moment it is scheduled: the stop on screen always, the other
       * two as soon as the map is interactive (also while their fetch waits for an idle slot). 'loading' while any
       * started stop is unsettled, 'ready' once every started stop is uploaded or has failed, 'off' when there is
       * no gas to wait for (no theme data, a stale theme, textures too large). So on the map 'ready' means all
       * three are in, and on Home, About and 404 it means the one shown is in. */
      gas?: 'loading' | 'ready' | 'off';
      /** performance.now() of the first drawn frame with a gas texture on screen. Written once per page load. */
      gasShownMs?: number;
      /** Eased pool amount of the last drawn frame: 0 with no album open, 1 fully dimmed around the open one. */
      gasPool?: number;
      /** Deep zoom amount of the last drawn frame: 0 up to 32 px covers, 1 once covers are 56 px or larger. */
      gasDeep?: number;
    };
  }
}

export {};
