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

async function fetchJson<T>(url: string, isValid: (v: unknown) => boolean): Promise<T> {
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

interface Resource<T> {
  promise: Promise<T> | null;
  value: T | null;
  status: DataStatus;
}

const listeners = new Set<() => void>();

/** Called whenever a load starts, succeeds or fails (and on reset). For useSyncExternalStore. */
export function subscribeData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const l of [...listeners]) l();
}

function idle<T>(): Resource<T> {
  return { promise: null, value: null, status: 'idle' };
}

let catalog = idle<Catalog>();
let positions = idle<Positions>();

/** Starts `fetcher` unless a load is in flight or done. A failed load is forgotten so the next call retries. */
function load<T>(get: () => Resource<T>, fetcher: () => Promise<T>): Promise<T> {
  const res = get();
  if (res.promise) return res.promise;
  const p = fetcher();
  res.promise = p;
  res.status = 'loading';
  // Registered before any caller can await p, so peek*() is set when callers resume.
  p.then(
    (v) => {
      if (res !== get() || res.promise !== p) return;
      res.value = v;
      res.status = 'ready';
      emit();
    },
    () => {
      if (res !== get() || res.promise !== p) return;
      res.promise = null;
      res.status = 'error';
      emit();
    },
  );
  emit();
  return p;
}

/** albums.json + vocab.json, fetched once per page load. */
export function loadCatalog(): Promise<Catalog> {
  return load(
    () => catalog,
    () =>
      Promise.all([
        fetchJson<AlbumRecord[]>('/data/albums.json', isArray),
        fetchJson<Vocab>('/data/vocab.json', isArray),
      ]).then(([albums, vocab]) => buildCatalog(albums, vocab)),
  );
}

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

export function catalogStatus(): DataStatus {
  return catalog.status;
}

export function positionsStatus(): DataStatus {
  return positions.status;
}

/** Tests only. */
export function resetDataCache(): void {
  catalog = idle();
  positions = idle();
  emit();
}
