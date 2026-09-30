import type { MapApi } from '@/components/map/types';
import type { AppState } from '@/lib/store';

declare global {
  interface Window {
    /** Read-only hooks for Playwright and the perf script. */
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
