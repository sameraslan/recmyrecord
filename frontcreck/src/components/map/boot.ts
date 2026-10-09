'use client';

import { createElement, useEffect, useState, useSyncExternalStore, type ComponentType } from 'react';
import { searchWanted } from '@/components/search/searchIndex';
import { loadCatalog, peekCatalog } from '@/lib/data/client';
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

// The album list first, as soon as the page's script runs (before it hydrates): search needs it and so does the
// map, and it is the largest file by far. (Not in tests, which load what they mean to.)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  queueMicrotask(() => void loadCatalog().catch(() => {}));
}

/**
 * Starts what the map needs as the page opens, in this order of claim on the connection:
 *   1. The page's own scripts. Nothing of the map is asked for by the HTML: preload links for its data started with
 *      the scripts, at their priority, and on a slow connection took bandwidth from them. With Home's 24 covers
 *      doing the same, the search field was usable 0.8 s later than without them (issue 78, measured on a throttled
 *      line; the stand-in nebula covers the wait instead and costs no request).
 *   2. The album list, asked for above the moment this script runs.
 *   3. After first paint (two animation frames), side by side: the opening stop's nebula image, fetched and
 *      decoded off the main thread (lib/data/early.ts); the map's code; the positions and the theme (MapStage's
 *      hooks, switched on by this hook's result). And the WebGL warm-up and probe, which are main-thread and GPU
 *      work that must not compete with the first paint, and no download at all.
 *      But when a visitor is at the search field (searchWanted: Home at desktop size focuses it as the page
 *      opens), step 3's downloads wait until the album list is in: search answers once it and the search code
 *      are, and on a slow line every byte beside it makes that later (0.4 s on a fast 4G line, 2 s on a slow one).
 * Nothing waits for an idle slot, for the probe or for each other beyond that. Only drawing waits for the probe:
 * MapStage mounts the map (MapWhenLoaded) once `webgl` is 'ok'. Without WebGL the downloads were for nothing; that
 * is the price of not making every other visitor wait for the probe.
 *
 * Returns true once step 3 has started: MapStage's positions and theme hooks load from then.
 */
export function useMapBoot(): boolean {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    let live = true;
    const warmUp = new AbortController();
    let raf2 = 0;
    const start = () => {
      if (!live) return;
      startEarlyGas(openingStop(window.location.pathname, window.location.search));
      void loadMapChunk();
      setStarted(true);
    };
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // The album list is asked for above; here in case that was skipped or failed. It settles either way.
        if (searchWanted() && !peekCatalog()) loadCatalog().then(start, start);
        else start();
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
      live = false;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      // On unmount the worker is terminated.
      warmUp.abort();
    };
  }, []);
  return started;
}
