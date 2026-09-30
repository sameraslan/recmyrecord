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
    };
  }
}

export {};
