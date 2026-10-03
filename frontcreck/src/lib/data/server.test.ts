import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOP_IDS } from '@/lib/types';
import type { AlbumRecord, Positions, Recs } from '@/lib/types';
import { assertDataConsistent, getAlbumPageData, getAllSlugs, getServerCatalog, getShelf } from './server';

const raw = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', name), 'utf8')) as T;

describe('build-time data access (real public/data)', () => {
  it('lists every slug once', () => {
    const slugs = getAllSlugs();
    expect(slugs.length).toBe(4081);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs[11]).toBe('in-rainbows-radiohead');
  });

  it('builds In Rainbows with the recommendations of recs.json', () => {
    const page = getAlbumPageData('in-rainbows-radiohead');
    expect(page).not.toBeNull();
    expect(page!.seed.title).toBe('In Rainbows');
    expect(page!.seed.tags).toEqual(['lush', 'melancholic', 'bittersweet', 'mellow', 'atmospheric', 'warm']);
    expect(page!.recs.mood.slice(0, 5).map((r) => r.title)).toEqual([
      'Tindersticks', 'Avalon', 'So', 'You Will Never Know Why', 'Imperial Bedroom',
    ]);
    // The mood list barely depends on audio, so it is pinned above. Sonic and balanced change with every rebuild
    // of the audio features: each stop must be the row of recs.json, in order, with the titles of albums.json.
    const albums = raw<AlbumRecord[]>('albums.json');
    const recs = raw<Recs>('recs.json');
    for (const stop of STOP_IDS) {
      expect(page!.recs[stop].map((r) => r.id)).toEqual(recs[stop][page!.seed.id]);
      expect(page!.recs[stop].map((r) => r.title)).toEqual(recs[stop][page!.seed.id].map((id) => albums[id].t));
      expect(page!.recs[stop]).toHaveLength(10);
      expect(page!.recs[stop].map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    expect(page!.seed.ambient).toHaveLength(3);
    for (const stop of ['sonic', 'balanced', 'mood'] as const) {
      for (const row of page!.recs[stop]) for (const w of row.shared) expect(page!.seed.tags).toContain(w);
    }
  });

  it('returns null for an unknown slug', () => {
    expect(getAlbumPageData('not-an-album')).toBeNull();
  });

  it('builds the shelf from top-ranked albums with covers', () => {
    const shelf = getShelf(24);
    expect(shelf).toHaveLength(24);
    expect(shelf[0].title).toBe('OK Computer');
    expect(shelf.every((a) => a.coverId !== '')).toBe(true);
  });

  it('exposes the vocabulary', () => {
    expect(getServerCatalog().vocab).toHaveLength(114);
  });
});

describe('data consistency check', () => {
  const recs: Recs = { sonic: [[1], [0]], balanced: [[1], [0]], mood: [[1], [0]] };
  const positions: Positions = { sonic: [0, 0, 1, 1], balanced: [0, 0, 1, 1], mood: [0, 0, 1, 1] };

  it('accepts files that agree with albums.json', () => {
    expect(() => assertDataConsistent(2, recs, positions)).not.toThrow();
  });

  it('names recs.json and both counts when a stop has the wrong number of rows', () => {
    expect(() => assertDataConsistent(2, { ...recs, mood: [[1]] }, positions)).toThrow(
      'recs.json: mood has 1 rows but albums.json has 2 albums',
    );
    expect(() => assertDataConsistent(2, { sonic: recs.sonic, balanced: recs.balanced } as Recs, positions)).toThrow(
      'recs.json: mood has 0 rows but albums.json has 2 albums',
    );
  });

  it('names positions.json and both counts when a stop has the wrong number of values', () => {
    expect(() => assertDataConsistent(2, recs, { ...positions, sonic: [0, 0, 1] })).toThrow(
      'positions.json: sonic has 3 values but albums.json has 2 albums (expected 4)',
    );
  });
});
