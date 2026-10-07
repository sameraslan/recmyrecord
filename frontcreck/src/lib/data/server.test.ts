import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOP_IDS } from '@/lib/types';
import type { AlbumRecord, Positions, Recs } from '@/lib/types';
import { CATALOG_SIZE_LABEL } from '@/lib/copy';
import { TAGS_MAX } from './catalog';
import { assertDataConsistent, getAlbumPageData, getAllSlugs, getServerCatalog, getShelf, hostedCoverSize } from './server';

const raw = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', name), 'utf8')) as T;

describe('build-time data access (real public/data)', () => {
  it('lists every slug once', () => {
    const slugs = getAllSlugs();
    // One slug per row of albums.json, in its order.
    expect(slugs).toEqual(raw<AlbumRecord[]>('albums.json').map((a) => a.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs[11]).toBe('in-rainbows-radiohead');
  });

  it('holds at least as many albums as the site says it does', () => {
    // CATALOG_SIZE_LABEL is "10,000+": the rounded figure the About page states.
    const stated = Number(CATALOG_SIZE_LABEL.replace(/[,+]/g, ''));
    expect(stated).toBe(10000);
    expect(getAllSlugs().length).toBeGreaterThanOrEqual(stated);
    // And it is the rounded figure, not one far below the real count.
    expect(getAllSlugs().length).toBeLessThan(stated + 1000);
  });

  it('builds In Rainbows with the recommendations of recs.json', () => {
    const page = getAlbumPageData('in-rainbows-radiohead');
    expect(page).not.toBeNull();
    expect(page!.seed.title).toBe('In Rainbows');
    // The album carries seven descriptors; the page shows the first TAGS_MAX (six), so "ethereal", the last, is cut.
    const vocab = raw<string[]>('vocab.json');
    expect(raw<AlbumRecord[]>('albums.json')[page!.seed.id].d.map((k) => vocab[k])).toEqual([
      'lush', 'melancholic', 'bittersweet', 'mellow', 'atmospheric', 'warm', 'ethereal',
    ]);
    expect(TAGS_MAX).toBe(6);
    expect(page!.seed.tags).toEqual(['lush', 'melancholic', 'bittersweet', 'mellow', 'atmospheric', 'warm']);
    expect(page!.recs.mood.slice(0, 5).map((r) => r.title)).toEqual([
      'Glitter', 'Have You in My Wilderness', 'Carrie & Lowell Live', 'Bon Iver, Bon Iver', 'Takk...',
    ]);
    expect(page!.recs.mood[0].slug).toBe('glitter-pasteboard');
    // The mood list barely depends on audio, so it is pinned above. Sonic and balanced change with every rebuild
    // of the audio features: each stop must be the row of recs.json, in order, with the titles of albums.json.
    const albums = raw<AlbumRecord[]>('albums.json');
    const recs = raw<Recs>('recs.json');
    for (const stop of STOP_IDS) {
      expect(page!.recs[stop].map((r) => r.id)).toEqual(recs[stop][page!.seed.id]);
      expect(page!.recs[stop].map((r) => r.title)).toEqual(recs[stop][page!.seed.id].map((id) => albums[id].t));
      expect(page!.recs[stop]).toHaveLength(10);
      for (const row of page!.recs[stop]) expect(row).not.toHaveProperty('rank');
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
    expect(getServerCatalog().vocab).toHaveLength(113);
    expect(new Set(getServerCatalog().vocab).size).toBe(113);
    // Every descriptor index of every album names a word.
    for (const a of getServerCatalog().albums) for (const k of a.d) expect(k, a.slug).toBeLessThan(113);
  });
});

describe("the size of the site's own copy of a cover (real public/covers)", () => {
  it('is the width and height the pipeline recorded for a Cover Art Archive cover', () => {
    const sizes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'covers', 'index.json'), 'utf8')) as Record<string, [number, number]>;
    const album = getServerCatalog().albums.find((a) => a.c.startsWith('ca:'))!;
    const [width, height] = sizes[album.c.slice(3)];
    expect(hostedCoverSize(album.c)).toEqual({ width, height });
    expect(Math.max(width, height)).toBeLessThanOrEqual(500);
  });

  it('is unknown for any other cover, and for a copy the folder does not have', () => {
    expect(hostedCoverSize('')).toBeUndefined();
    expect(hostedCoverSize('dz:0123456789abcdef0123456789abcdef')).toBeUndefined();
    expect(hostedCoverSize('ca:00000000-0000-0000-0000-000000000000')).toBeUndefined();
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
