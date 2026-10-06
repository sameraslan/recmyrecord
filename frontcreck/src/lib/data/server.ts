import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { REC_MAX, SHELF_SIZE, buildAlbumPageData, buildCatalog, pickShelf, toSummary } from '@/lib/data/catalog';
import { STOP_IDS } from '@/lib/types';
import type { AlbumPageData, AlbumRecord, AlbumSummary, Catalog, Positions, Recs, Vocab } from '@/lib/types';

/**
 * The folder under public/ that holds the data: `data` unless RMR_DATA_DIR names another one, for building
 * and testing against a data set that is not the committed one (next.config.ts then serves it at /data).
 */
export function dataDirName(value: string | undefined = process.env.RMR_DATA_DIR): string {
  if (!value) return 'data';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`RMR_DATA_DIR must be the name of a folder under public/, got "${value}"`);
  return value;
}

// Relies on the working directory being frontcreck/, which holds for `next build`, `next dev` and Vitest.
const DATA_DIR = path.join(process.cwd(), 'public', dataDirName());

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

/**
 * Fails the build when a row of recs.json has the wrong number of albums: `expected` (ten) for every album at
 * every stop, except that an album without audio (`n`) has none at sonic and balanced, and is in no other
 * album's sonic or balanced row.
 */
export function assertRecsConsistent(albums: readonly AlbumRecord[], recs: Recs, expected = REC_MAX): void {
  for (const stop of STOP_IDS) {
    const byAudio = stop !== 'mood';
    for (let id = 0; id < albums.length; id++) {
      const row = recs[stop]?.[id];
      const count = Array.isArray(row) ? row.length : 0;
      if (byAudio && albums[id].n) {
        if (count !== 0) throw new Error(`recs.json: ${stop} row of ${albums[id].slug} has ${count} albums but the album has no audio (expected none)`);
        continue;
      }
      if (count !== expected) throw new Error(`recs.json: ${stop} row of ${albums[id].slug} has ${count} albums (expected ${expected})`);
      if (!byAudio) continue;
      for (const j of row) {
        if (albums[j]?.n) throw new Error(`recs.json: ${stop} row of ${albums[id].slug} lists ${albums[j].slug}, which has no audio`);
      }
    }
  }
}

/**
 * The album pages to prerender: all of them, unless RMR_PRERENDER asks for fewer (a test build of a large data
 * set on a small disk). Its value is a comma list of a count (that many leading albums) and slugs.
 */
export function prerenderSlugs(slugs: readonly string[], value: string | undefined = process.env.RMR_PRERENDER): string[] {
  if (!value) return [...slugs];
  const known = new Set(slugs);
  const out = new Set<string>();
  for (const part of value.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (/^\d+$/.test(part)) slugs.slice(0, Number(part)).forEach((s) => out.add(s));
    else if (known.has(part)) out.add(part);
  }
  return slugs.filter((s) => out.has(s));
}

let cache: { catalog: Catalog; recs: Recs } | null = null;

function load(): { catalog: Catalog; recs: Recs } {
  if (!cache) {
    const albums = readJson<AlbumRecord[]>('albums.json');
    const recs = readJson<Recs>('recs.json');
    // positions.json is only read to check it; the client fetches it.
    assertDataConsistent(albums.length, recs, readJson<Positions>('positions.json'));
    assertRecsConsistent(albums, recs);
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

/** The slugs `generateStaticParams` prerenders (every album unless RMR_PRERENDER limits it). */
export function getPrerenderSlugs(): string[] {
  return prerenderSlugs(getAllSlugs());
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
