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
      /** The sharper gas image (ordinary desktops and laptops with a real GPU): 'off' when this map does not use
       * it (the device is not one of those, which is known when the map mounts except for a software renderer,
       * known a moment later; or its image failed to load twice), 'waiting' while none is held or wanted,
       * 'loading' while one is on its way, else the stop whose sharper image is on the GPU. Absent when no gas
       * layer is mounted. */
      gasSharp?: 'off' | 'waiting' | 'loading' | 'sonic' | 'balanced' | 'mood';
      /** True when the gas is drawn with the lighter shader (a software renderer), false with the full one. Set
       * when the first image of a map goes in; absent before that and when no gas layer is mounted. */
      gasLite?: boolean;
      /** Eased pool amount of the last drawn frame: 0 with no album open, 1 fully dimmed around the open one. */
      gasPool?: number;
      /** Deep zoom amount of the last drawn frame: 0 up to 32 px covers, 1 once covers are 56 px or larger. */
      gasDeep?: number;
    };
    /** Set before the map loads by review captures and tests: 'force' loads the sharper gas image on a software
     * renderer too, 'off' never loads it. */
    __rmrGasSharp?: 'force' | 'off';
    /** Set before the map loads by review captures, measurements and tests: 'force' draws the gas with the lighter
     * shader on any renderer, 'off' with the full shader on any renderer. */
    __rmrGasLite?: 'force' | 'off';
  }
}

export {};
