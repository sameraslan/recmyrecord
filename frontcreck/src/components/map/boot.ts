'use client';

import { useEffect } from 'react';
import { dropEarlyGas, startEarlyGas } from '@/lib/data/early';
import { markOnce } from '@/lib/marks';
import { useAppStore } from '@/lib/store';
import { DEFAULT_STOP, type StopId } from '@/lib/types';
import { parseBy, slugFromPathname } from '@/lib/url-state';
import { isWebGLAvailable, warmUpWebGL } from './state/webgl';

let chunk: Promise<unknown> | null = null;

/** Asks for the map's code (three.js and the canvas) once. It is the module MapStage's dynamic() imports, so the
 * two are one download, and the map mounts without waiting for it again. */
export function loadMapChunk(): Promise<unknown> {
  if (!chunk) {
    markOnce('rmr-chunk-start');
    chunk = import('./MusicMap');
    chunk.catch(() => {
      chunk = null; // MapStage's own import asks again when it renders the map
    });
  }
  return chunk;
}

/** The stop a page load opens on: an album link can name one (`?by=`), every other page opens on the default. */
export function openingStop(pathname: string, search: string): StopId {
  return slugFromPathname(pathname) === null ? DEFAULT_STOP : parseBy(new URLSearchParams(search).get('by'));
}

/**
 * Starts everything the map needs, side by side, as the page opens. MapStage's data hooks ask for the album list,
 * the positions and the theme in the same commit (the server HTML has already asked for them: app/MapPreloads.tsx).
 *   - At once: the opening stop's nebula image, fetched and decoded off the main thread (lib/data/early.ts).
 *   - After first paint (two animation frames): the map's code, and the WebGL warm-up and probe. Running three.js
 *     and starting a graphics context are main-thread and GPU work, which must not compete with the page's first
 *     paint; a download alone does not, so nothing waits for an idle slot any more, nor for each other.
 * Only drawing waits for the probe: MapStage mounts the map once `webgl` is 'ok'. Without WebGL the downloads were
 * for nothing; that is the price of not making every other visitor wait for the probe.
 */
export function useMapBoot(): void {
  useEffect(() => {
    startEarlyGas(openingStop(window.location.pathname, window.location.search));
    const warmUp = new AbortController();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        void loadMapChunk().catch(() => {});
        // A worker starts the GPU backend first, so neither the probe (which creates and releases a WebGL context)
        // nor the renderer blocks the main thread on it.
        void warmUpWebGL({ signal: warmUp.signal }).then(() => {
          if (warmUp.signal.aborted) return;
          const ok = isWebGLAvailable();
          if (!ok) dropEarlyGas();
          useAppStore.getState().setWebgl(ok ? 'ok' : 'unavailable');
        });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      // On unmount the worker is terminated.
      warmUp.abort();
    };
  }, []);
}
