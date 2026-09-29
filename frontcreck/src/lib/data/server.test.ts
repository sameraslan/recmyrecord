import { describe, expect, it } from 'vitest';
import { getAlbumPageData, getAllSlugs, getServerCatalog, getShelf } from './server';

describe('build-time data access (real public/data)', () => {
  it('lists every slug once', () => {
    const slugs = getAllSlugs();
    expect(slugs.length).toBe(4081);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs[11]).toBe('in-rainbows-radiohead');
  });

  it('builds In Rainbows with the fixed recommendations', () => {
    const page = getAlbumPageData('in-rainbows-radiohead');
    expect(page).not.toBeNull();
    expect(page!.seed.title).toBe('In Rainbows');
    expect(page!.seed.tags).toEqual(['lush', 'melancholic', 'bittersweet', 'mellow', 'atmospheric', 'warm']);
    expect(page!.recs.mood.slice(0, 5).map((r) => r.title)).toEqual([
      'Tindersticks', 'Avalon', 'So', 'You Will Never Know Why', 'Imperial Bedroom',
    ]);
    expect(page!.recs.balanced[0].title).toBe('undun');
    for (const stop of ['sonic', 'balanced', 'mood'] as const) {
      expect(page!.recs[stop]).toHaveLength(10);
      expect(page!.recs[stop].map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    expect(page!.seed.ambient).toHaveLength(3);
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
