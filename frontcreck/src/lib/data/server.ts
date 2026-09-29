import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { SHELF_SIZE, buildAlbumPageData, buildCatalog, pickShelf, toSummary } from '@/lib/data/catalog';
import type { AlbumPageData, AlbumRecord, AlbumSummary, Catalog, Recs, Vocab } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;
}

let cache: { catalog: Catalog; recs: Recs } | null = null;

function load(): { catalog: Catalog; recs: Recs } {
  if (!cache) {
    cache = {
      catalog: buildCatalog(readJson<AlbumRecord[]>('albums.json'), readJson<Vocab>('vocab.json')),
      recs: readJson<Recs>('recs.json'),
    };
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
