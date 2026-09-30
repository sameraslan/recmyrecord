import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { SHELF_SIZE, buildAlbumPageData, buildCatalog, pickShelf, toSummary } from '@/lib/data/catalog';
import { STOP_IDS } from '@/lib/types';
import type { AlbumPageData, AlbumRecord, AlbumSummary, Catalog, Positions, Recs, Vocab } from '@/lib/types';

// Relies on the working directory being frontcreck/, which holds for `next build`, `next dev` and Vitest.
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;
}

/** Fails the build when recs.json or positions.json does not match the number of albums in albums.json. */
export function assertDataConsistent(albumCount: number, recs: Recs, positions: Positions): void {
  for (const stop of STOP_IDS) {
    const rows = recs[stop]?.length ?? 0;
    if (rows !== albumCount) {
      throw new Error(`recs.json: ${stop} has ${rows} rows but albums.json has ${albumCount} albums`);
    }
    const values = positions[stop]?.length ?? 0;
    if (values !== 2 * albumCount) {
      throw new Error(
        `positions.json: ${stop} has ${values} values but albums.json has ${albumCount} albums (expected ${2 * albumCount})`,
      );
    }
  }
}

let cache: { catalog: Catalog; recs: Recs } | null = null;

function load(): { catalog: Catalog; recs: Recs } {
  if (!cache) {
    const albums = readJson<AlbumRecord[]>('albums.json');
    const recs = readJson<Recs>('recs.json');
    // positions.json is only read to check it; the client fetches it.
    assertDataConsistent(albums.length, recs, readJson<Positions>('positions.json'));
    cache = { catalog: buildCatalog(albums, readJson<Vocab>('vocab.json')), recs };
  }
  return cache;
}

export function getServerCatalog(): Catalog {
  return load().catalog;
}

export function getAllSlugs(): string[] {
  return load().catalog.albums.map((a) => a.slug);
}

export function getAlbumPageData(slug: string): AlbumPageData | null {
  const { catalog, recs } = load();
  const id = catalog.bySlug.get(slug);
  return id === undefined ? null : buildAlbumPageData(catalog, recs, id);
}

export function getShelf(count = SHELF_SIZE): AlbumSummary[] {
  const { catalog } = load();
  return pickShelf(catalog.albums, count).map((id) => toSummary(catalog.albums, id));
}
