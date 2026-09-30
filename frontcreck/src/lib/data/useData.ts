'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  IDLE_DATA_STATE,
  catalogState,
  loadCatalog,
  loadPositions,
  peekCatalog,
  peekPositions,
  positionsState,
  subscribeData,
  type DataState,
} from '@/lib/data/client';
import type { Catalog, Positions } from '@/lib/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// Server snapshots are constants so they are stable and ignore any client cache (hydration-safe).
const serverValue = (): null => null;
const serverState = (): DataState => IDLE_DATA_STATE;
const ignore = (): void => {};

/**
 * The first attempt whose failure this consumer reports: the one in flight when it was enabled,
 * otherwise the one its own effect is about to start. Earlier failures are not its own.
 */
function firstCounted(state: DataState): number {
  return state.status === 'loading' ? state.attempt : state.attempt + 1;
}

/**
 * Reads the shared module cache in client.ts, so every consumer of the same file shows the same
 * data, and any consumer's `retry` recovers all of them.
 * - A consumer that mounts enabled, or becomes enabled, starts a load unless one is in flight or
 *   done (including after an earlier failure), and reports 'loading' until that attempt settles.
 * - A failed load is never retried automatically: the effect depends on `enabled` only, not on the
 *   status. Consumers watching the attempt that failed show 'error' until someone calls `retry`.
 * - A disabled consumer reports 'idle' until the data is ready.
 */
function useLoaded<T>(load: () => Promise<T>, peek: () => T | null, read: () => DataState, enabled: boolean) {
  const value = useSyncExternalStore(subscribeData, peek, serverValue);
  const state = useSyncExternalStore(subscribeData, read, serverState);
  // Read directly (not the hydration snapshot) so a consumer hydrating after a failure starts clean.
  const [from, setFrom] = useState(() => firstCounted(read()));
  const [wasEnabled, setWasEnabled] = useState(enabled);
  let counted = from;
  if (enabled !== wasEnabled) {
    // Adjusting state while rendering on a prop change (React's documented pattern), not in an effect.
    setWasEnabled(enabled);
    if (enabled) {
      counted = firstCounted(state);
      setFrom(counted);
    }
  }
  useEffect(() => {
    // load() returns the in-flight or finished promise, or starts a new attempt when idle or failed.
    if (enabled) load().catch(ignore);
  }, [enabled, load]);
  const retry = useCallback(() => {
    load().catch(ignore);
  }, [load]);
  const status: LoadStatus = value
    ? 'ready'
    : !enabled
      ? 'idle'
      : state.status === 'error' && state.attempt >= counted
        ? 'error'
        : 'loading';
  return { status, value, retry };
}

export function useCatalog(enabled = true): { status: LoadStatus; catalog: Catalog | null; retry: () => void } {
  const { status, value, retry } = useLoaded(loadCatalog, peekCatalog, catalogState, enabled);
  return { status, catalog: value, retry };
}

export function usePositions(enabled = true): { status: LoadStatus; positions: Positions | null; retry: () => void } {
  const { status, value, retry } = useLoaded(loadPositions, peekPositions, positionsState, enabled);
  return { status, positions: value, retry };
}
