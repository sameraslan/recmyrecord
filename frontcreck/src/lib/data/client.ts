import { buildCatalog } from '@/lib/data/catalog';
import type { AlbumRecord, Catalog, Positions, Vocab } from '@/lib/types';

export class DataLoadError extends Error {
  constructor(
    readonly url: string,
    readonly status: number | null,
  ) {
    super(`Could not load ${url}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'DataLoadError';
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin' });
  } catch {
    throw new DataLoadError(url, null);
  }
  if (!res.ok) throw new DataLoadError(url, res.status);
  return (await res.json()) as T;
}

let catalogPromise: Promise<Catalog> | null = null;
let catalogValue: Catalog | null = null;
let positionsPromise: Promise<Positions> | null = null;
let positionsValue: Positions | null = null;

/** albums.json + vocab.json, fetched once per page load. A failed load is forgotten so the next call retries. */
export function loadCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    const p = Promise.all([fetchJson<AlbumRecord[]>('/data/albums.json'), fetchJson<Vocab>('/data/vocab.json')]).then(
      ([albums, vocab]) => (catalogValue = buildCatalog(albums, vocab)),
    );
    catalogPromise = p;
    p.catch(() => {
      if (catalogPromise === p) catalogPromise = null;
    });
  }
  return catalogPromise;
}

export function loadPositions(): Promise<Positions> {
  if (!positionsPromise) {
    const p = fetchJson<Positions>('/data/positions.json').then((v) => (positionsValue = v));
    positionsPromise = p;
    p.catch(() => {
      if (positionsPromise === p) positionsPromise = null;
    });
  }
  return positionsPromise;
}

export function peekCatalog(): Catalog | null {
  return catalogValue;
}

export function peekPositions(): Positions | null {
  return positionsValue;
}

/** Tests only. */
export function resetDataCache(): void {
  catalogPromise = null;
  catalogValue = null;
  positionsPromise = null;
  positionsValue = null;
}
