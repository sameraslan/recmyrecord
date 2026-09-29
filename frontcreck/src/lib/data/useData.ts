'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  catalogStatus,
  loadCatalog,
  loadPositions,
  peekCatalog,
  peekPositions,
  positionsStatus,
  subscribeData,
  type DataStatus,
} from '@/lib/data/client';
import type { Catalog, Positions } from '@/lib/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// Server snapshots are constants so they are stable and ignore any client cache (hydration-safe).
const serverValue = (): null => null;
const serverStatus = (): DataStatus => 'idle';
const ignore = (): void => {};

/**
 * Reads the shared module cache in client.ts, so every consumer of the same file shows the same
 * status and any consumer's `retry` recovers all of them. A disabled consumer reports 'idle' until
 * the data is ready. A failed load is not retried automatically; `retry` starts a new one.
 */
function useLoaded<T>(load: () => Promise<T>, peek: () => T | null, shared: () => DataStatus, enabled: boolean) {
  const value = useSyncExternalStore(subscribeData, peek, serverValue);
  const sharedStatus = useSyncExternalStore(subscribeData, shared, serverStatus);
  useEffect(() => {
    if (enabled && sharedStatus === 'idle') load().catch(ignore);
  }, [enabled, sharedStatus, load]);
  const retry = useCallback(() => {
    load().catch(ignore);
  }, [load]);
  const status: LoadStatus = value ? 'ready' : !enabled ? 'idle' : sharedStatus === 'error' ? 'error' : 'loading';
  return { status, value, retry };
}

export function useCatalog(enabled = true): { status: LoadStatus; catalog: Catalog | null; retry: () => void } {
  const { status, value, retry } = useLoaded(loadCatalog, peekCatalog, catalogStatus, enabled);
  return { status, catalog: value, retry };
}

export function usePositions(enabled = true): { status: LoadStatus; positions: Positions | null; retry: () => void } {
  const { status, value, retry } = useLoaded(loadPositions, peekPositions, positionsStatus, enabled);
  return { status, positions: value, retry };
}
