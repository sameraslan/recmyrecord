'use client';

import { createElement, useEffect, useSyncExternalStore, type ComponentType } from 'react';
import { dropEarlyGas, startEarlyGas } from '@/lib/data/early';
import { markOnce } from '@/lib/marks';
import { useAppStore } from '@/lib/store';
import { DEFAULT_STOP, type StopId } from '@/lib/types';
import { parseBy, slugFromPathname } from '@/lib/url-state';
import { mapShown, setMapReveal, subscribeMapReveal } from './state/reveal';
import { isWebGLAvailable, warmUpWebGL } from './state/webgl';
import type { MusicMapProps } from './types';

type MapComponent = ComponentType<MusicMapProps>;

/** Where the map's code is: not asked for yet, on its way, in (with the component), or failed. Replaced, never
 * mutated, so it is a stable useSyncExternalStore snapshot. */
interface MapCode {
  status: 'idle' | 'loading' | 'ready' | 'error';
  Map: MapComponent | null;
}

const IDLE: MapCode = { status: 'idle', Map: null };
let code: MapCode = IDLE;
let chunk: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setCode(next: MapCode): void {
  code = next;
  for (const l of [...listeners]) l();
}

function subscribeCode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const idleCode = (): MapCode => IDLE;

/**
 * Asks for the map's code (three.js and the canvas: its own chunk, never a script of the page) once per page
 * load; a load that failed is asked for again by the next call. Never rejects: the outcome is in the status.
 *
 * A plain import(), not next/dynamic or React.lazy: those show the component through a Suspense boundary, and
 * React holds a boundary's content back until 300 ms after its fallback was shown. The fallback here was nothing
 * to see, but the map still mounted about 300 ms after its code and data were in (measured: the canvas was added
 * to the document 310 ms after the data arrived, with no long task in between). The loaded component is kept here
 * and rendered directly (MapWhenLoaded), so the map mounts in the commit in which the last thing it needs arrives.
 */
export function loadMapChunk(): Promise<void> {
  if (!chunk) {
    markOnce('rmr-chunk-start');
    setCode({ status: 'loading', Map: null });
    chunk = import('./MusicMap').then(
      (m) => setCode({ status: 'ready', Map: m.default }),
      () => {
        chunk = null;
        setCode({ status: 'error', Map: null });
      },
    );
  }
  return chunk;
}

/** True when the map's code failed to load (a dropped connection): MapStage shows its error panel, whose retry
 * calls loadMapChunk again. */
export function useMapCodeFailed(): boolean {
  return useSyncExternalStore(subscribeCode, () => code, idleCode).status === 'error';
}

/** The map, once its code is in; nothing before that. */
export function MapWhenLoaded(props: MusicMapProps) {
  const { Map } = useSyncExternalStore(subscribeCode, () => code, idleCode);
  return Map ? createElement(Map, props) : null;
}

/** Tests only. */
export function resetMapCode(): void {
  chunk = null;
  setCode(IDLE);
}

/** No nebula will come on this page load (theme.json failed, or is for another album list): the stand-in of the
 * first paint fades out, the image asked for early is freed (no gas layer will mount to take it: it is 14 MB
 * decoded), and the tests that wait for the gas to settle are told there is none (e2e/helpers.ts waitForMap). */
export function noNebula(): void {
  setMapReveal('sky');
  dropEarlyGas();
  if (window.__rmr) window.__rmr.gas = 'off';
}

/** True once the canvas is shown (state/reveal.ts mapShown), for the controls that come in with it. */
export function useMapShown(): boolean {
  return useSyncExternalStore(subscribeMapReveal, mapShown, () => false);
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
 * Only drawing waits for the probe: MapStage mounts the map (MapWhenLoaded) once `webgl` is 'ok'. Without WebGL the downloads were
 * for nothing; that is the price of not making every other visitor wait for the probe.
 */
export function useMapBoot(): void {
  useEffect(() => {
    startEarlyGas(openingStop(window.location.pathname, window.location.search));
    const warmUp = new AbortController();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        void loadMapChunk();
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
