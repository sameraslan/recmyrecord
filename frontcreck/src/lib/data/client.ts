import { buildCatalog } from '@/lib/data/catalog';
import { STOP_IDS } from '@/lib/types';
import type { AlbumRecord, Catalog, Positions, Vocab } from '@/lib/types';

/** Every way a data file can fail to load: network error, HTTP error, unparsable or wrongly shaped JSON. */
export class DataLoadError extends Error {
  constructor(
    readonly url: string,
    readonly status: number | null,
    options?: ErrorOptions,
  ) {
    const reason = options?.cause instanceof Error ? `: ${options.cause.message}` : '';
    super(`Could not load ${url}${status === null ? '' : ` (HTTP ${status})`}${reason}`, options);
    this.name = 'DataLoadError';
  }
}

export async function fetchJson<T>(url: string, isValid: (v: unknown) => boolean): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin' });
  } catch (cause) {
    throw new DataLoadError(url, null, { cause });
  }
  if (!res.ok) throw new DataLoadError(url, res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new DataLoadError(url, res.status, { cause });
  }
  if (!isValid(body)) throw new DataLoadError(url, res.status, { cause: new TypeError('Unexpected data shape') });
  return body as T;
}

const isArray = (v: unknown): boolean => Array.isArray(v);
const isPositions = (v: unknown): boolean =>
  !!v && typeof v === 'object' && STOP_IDS.every((s) => Array.isArray((v as Record<string, unknown>)[s]));

/** Shared state of one data file, the same for every consumer. */
export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Status plus the number of loads started so far (the current or last attempt). Replaced, never
 * mutated, so it is a stable useSyncExternalStore snapshot.
 */
export interface DataState {
  status: DataStatus;
  attempt: number;
}

export const IDLE_DATA_STATE: DataState = { status: 'idle', attempt: 0 };

export interface Resource<T> {
  promise: Promise<T> | null;
  value: T | null;
  state: DataState;
}

const listeners = new Set<() => void>();

/**
 * Called whenever a load starts, succeeds or fails (and on reset). For useSyncExternalStore.
 * Listeners run synchronously inside loadCatalog / loadPositions, which is why those must not be
 * called during render: React would see a store update while rendering.
 */
export function subscribeData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const l of [...listeners]) l();
}

export function idle<T>(): Resource<T> {
  return { promise: null, value: null, state: IDLE_DATA_STATE };
}

let catalog = idle<Catalog>();
let positions = idle<Positions>();

/** Starts `fetcher` unless a load is in flight or done. A failed load is forgotten so the next call retries. */
export function load<T>(get: () => Resource<T>, fetcher: () => Promise<T>): Promise<T> {
  const res = get();
  if (res.promise) return res.promise;
  const p = fetcher();
  res.promise = p;
  res.state = { status: 'loading', attempt: res.state.attempt + 1 };
  // Registered before any caller can await p, so peek*() is set when callers resume.
  p.then(
    (v) => {
      if (res !== get() || res.promise !== p) return;
      res.value = v;
      res.state = { status: 'ready', attempt: res.state.attempt };
      emit();
    },
    () => {
      if (res !== get() || res.promise !== p) return;
      res.promise = null;
      res.state = { status: 'error', attempt: res.state.attempt };
      emit();
    },
  );
  emit();
  return p;
}

function buildOrFail(albums: AlbumRecord[], vocab: Vocab): Catalog {
  try {
    return buildCatalog(albums, vocab);
  } catch (cause) {
    throw new DataLoadError('/data/albums.json', null, { cause });
  }
}

/**
 * albums.json + vocab.json, fetched once per page load. Call from effects or event handlers, never
 * during render: starting a load notifies subscribeData listeners synchronously.
 */
export function loadCatalog(): Promise<Catalog> {
  return load(
    () => catalog,
    () =>
      Promise.all([
        fetchJson<AlbumRecord[]>('/data/albums.json', isArray),
        fetchJson<Vocab>('/data/vocab.json', isArray),
      ]).then(([albums, vocab]) => buildOrFail(albums, vocab)),
  );
}

/**
 * positions.json, fetched once per page load. Call from effects or event handlers, never during
 * render: starting a load notifies subscribeData listeners synchronously.
 */
export function loadPositions(): Promise<Positions> {
  return load(
    () => positions,
    () => fetchJson<Positions>('/data/positions.json', isPositions),
  );
}

export function peekCatalog(): Catalog | null {
  return catalog.value;
}

export function peekPositions(): Positions | null {
  return positions.value;
}

export function catalogState(): DataState {
  return catalog.state;
}

export function positionsState(): DataState {
  return positions.state;
}

export function catalogStatus(): DataStatus {
  return catalog.state.status;
}

export function positionsStatus(): DataStatus {
  return positions.state.status;
}

const resetters: (() => void)[] = [];

/** A data file kept in another module (the theme) registers how to forget it, so one reset clears every cache. */
export function registerReset(fn: () => void): void {
  resetters.push(fn);
}

/** Tests only. */
export function resetDataCache(): void {
  catalog = idle();
  positions = idle();
  for (const fn of resetters) fn();
  emit();
}
