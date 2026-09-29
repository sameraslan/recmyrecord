'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadCatalog, loadPositions, peekCatalog, peekPositions } from '@/lib/data/client';
import type { Catalog, Positions } from '@/lib/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

function useLoaded<T>(load: () => Promise<T>, peek: () => T | null, enabled: boolean) {
  const [value, setValue] = useState<T | null>(() => peek());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || value) return;
    let live = true;
    load().then(
      (v) => {
        if (live) setValue(v);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, value, attempt, load]);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((a) => a + 1);
  }, []);
  const status: LoadStatus = value ? 'ready' : failed ? 'error' : enabled ? 'loading' : 'idle';
  return { status, value, retry };
}

export function useCatalog(enabled = true): { status: LoadStatus; catalog: Catalog | null; retry: () => void } {
  const { status, value, retry } = useLoaded(loadCatalog, peekCatalog, enabled);
  return { status, catalog: value, retry };
}

export function usePositions(enabled = true): { status: LoadStatus; positions: Positions | null; retry: () => void } {
  const { status, value, retry } = useLoaded(loadPositions, peekPositions, enabled);
  return { status, positions: value, retry };
}
