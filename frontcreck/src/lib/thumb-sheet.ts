import { useEffect, useSyncExternalStore } from 'react';
import { thumbUrl } from '@/lib/data/sprites';

/**
 * Load state of the thumbnail sheets (about 2.3 MB each), shared by every cover. A sheet is requested only when
 * a cover on it first needs it (its remote image failed), never on a normal page load; a failure is final for
 * the page, and every cover on that sheet then falls back to its lettered tile.
 */
export type ThumbSheetStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Status by sheet number; a sheet not listed is idle. */
const statuses = new Map<number, ThumbSheetStatus>();
const listeners = new Set<() => void>();

function set(sheet: number, next: ThumbSheetStatus): void {
  statuses.set(sheet, next);
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function thumbSheetStatus(sheet = 0): ThumbSheetStatus {
  return statuses.get(sheet) ?? 'idle';
}
const serverRead = (): ThumbSheetStatus => 'idle';

/** Starts the one download of a sheet. Call from effects or event handlers, never during render. */
export function loadThumbSheet(sheet = 0): void {
  if (thumbSheetStatus(sheet) !== 'idle') return;
  set(sheet, 'loading');
  const img = new Image();
  img.onload = () => set(sheet, 'ready');
  img.onerror = () => set(sheet, 'error');
  img.src = thumbUrl(sheet);
}

/** The status of `sheet`; loads it once `needed` turns true. */
export function useThumbSheet(needed: boolean, sheet = 0): ThumbSheetStatus {
  const value = useSyncExternalStore(subscribe, () => thumbSheetStatus(sheet), serverRead);
  useEffect(() => {
    if (needed) loadThumbSheet(sheet);
  }, [needed, sheet]);
  return value;
}

/** Tests only. */
export function resetThumbSheets(): void {
  statuses.clear();
  for (const l of [...listeners]) l();
}
