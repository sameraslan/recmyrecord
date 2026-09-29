import { useEffect, useSyncExternalStore } from 'react';
import { THUMB_URL } from '@/lib/data/sprites';

/**
 * Load state of the 2.3 MB thumbnail sheet, shared by every cover. The sheet is requested only when a
 * cover first needs it (its remote image failed), never on a normal page load; a failure is final for
 * the page, and every cover then falls back to its lettered tile.
 */
export type ThumbSheetStatus = 'idle' | 'loading' | 'ready' | 'error';

let status: ThumbSheetStatus = 'idle';
const listeners = new Set<() => void>();

function set(next: ThumbSheetStatus): void {
  status = next;
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = (): ThumbSheetStatus => status;
const serverRead = (): ThumbSheetStatus => 'idle';

/** Starts the one download of the sheet. Call from effects or event handlers, never during render. */
export function loadThumbSheet(): void {
  if (status !== 'idle') return;
  set('loading');
  const img = new Image();
  img.onload = () => set('ready');
  img.onerror = () => set('error');
  img.src = THUMB_URL;
}

/** The sheet's status; loads it once `needed` turns true. */
export function useThumbSheet(needed: boolean): ThumbSheetStatus {
  const value = useSyncExternalStore(subscribe, read, serverRead);
  useEffect(() => {
    if (needed) loadThumbSheet();
  }, [needed]);
  return value;
}
