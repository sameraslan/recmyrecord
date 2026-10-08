import { describe, expect, it } from 'vitest';
import { COPY } from '@/lib/copy';
import type { AlbumRecord, Recs } from '@/lib/types';
import {
  buildAlbumPageData, buildCatalog, coverUrl, initialLetter, moodTags, pickShelf, pickSurprise, sharedWords, spotifyUrl, toSummary,
} from './catalog';

const vocab = ['lush', 'melancholic', 'warm', 'noisy', 'calm', 'dark', 'epic'];
const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = [
  { slug: 'the-alpha-x', t: 'The Alpha', a: 'X', s: 'A'.repeat(22), c: 'ab67616d0000b273' + 'a'.repeat(24), k: 0, d: [0, 1, 2, 3, 4, 5, 6], w: W },
  { slug: 'beta-y', t: 'Beta', a: 'Y', s: '', c: '', k: 1, d: [2, 1, 4], w: W },
  { slug: 'gamma-z', t: 'Gamma', a: 'Z', s: 'B'.repeat(22), c: 'ab67616d0000b273' + 'c'.repeat(24), k: 2, d: [], w: W },
];
const recs: Recs = {
  sonic: [[1, 2], [0, 2], [0, 1]],
  balanced: [[2, 1], [2, 0], [1, 0]],
  mood: [[1, 0, 99], [0, 2], [1, 0]],
};
const catalog = buildCatalog(albums, vocab);

describe('catalog helpers', () => {
  it('indexes slugs', () => {
    expect(catalog.bySlug.get('beta-y')).toBe(1);
    expect(catalog.bySlug.get('nope')).toBeUndefined();
  });

  it('summarises an album and rejects unknown ids', () => {
    expect(toSummary(albums, 1)).toEqual({ id: 1, slug: 'beta-y', title: 'Beta', artist: 'Y', spotifyId: '', coverId: '', cluster: 1 });
    expect(() => toSummary(albums, 7)).toThrow(RangeError);
  });

  it('limits mood tags to six by default', () => {
    expect(moodTags(albums[0], vocab)).toEqual(['lush', 'melancholic', 'warm', 'noisy', 'calm', 'dark']);
    expect(moodTags(albums[2], vocab)).toEqual([]);
  });

  it('returns no tags or shared words when max is 0', () => {
    expect(moodTags(albums[0], vocab, 0)).toEqual([]);
    expect(sharedWords(albums[0], albums[1], vocab, 0)).toEqual([]);
  });

  it('shares only words that are among the seed\'s visible tags', () => {
    // 'epic' (index 6) is the seed's seventh descriptor, so it is not a visible tag.
    expect(sharedWords(albums[0], { ...albums[1], d: [6, 1] }, vocab)).toEqual(['melancholic']);
    expect(sharedWords(albums[0], { ...albums[1], d: [6] }, vocab)).toEqual([]);
    // duplicate or out-of-range seed indexes do not repeat or invent words
    expect(sharedWords({ ...albums[1], d: [2, 2, 99, 1] }, albums[0], vocab)).toEqual(['warm', 'melancholic']);
  });

  it('lists shared words in the seed order, at most four', () => {
    expect(sharedWords(albums[0], albums[1], vocab)).toEqual(['melancholic', 'warm', 'calm']);
    expect(sharedWords(albums[1], albums[0], vocab)).toEqual(['warm', 'melancholic', 'calm']);
    expect(sharedWords(albums[0], albums[2], vocab)).toEqual([]);
    expect(sharedWords(albums[0], albums[0], vocab)).toHaveLength(4);
  });

  it('builds album page data for every stop, dropping self and bad ids', () => {
    const page = buildAlbumPageData(catalog, recs, 0);
    expect(page.seed).toMatchObject({ id: 0, title: 'The Alpha', tags: ['lush', 'melancholic', 'warm', 'noisy', 'calm', 'dark'], ambient: W });
    expect(page.recs.sonic.map((r) => r.id)).toEqual([1, 2]);
    expect(page.recs.balanced.map((r) => r.id)).toEqual([2, 1]);
    expect(page.recs.mood.map((r) => r.id)).toEqual([1]);
    expect(page.recs.sonic[0].shared).toEqual(['melancholic', 'warm', 'calm']);
    for (const stop of ['sonic', 'balanced', 'mood'] as const) {
      for (const row of page.recs[stop]) for (const w of row.shared) expect(page.seed.tags).toContain(w);
    }
  });

  it('drops duplicate recommendation ids and keeps the order, with no rank number on a row', () => {
    const dup: Recs = { sonic: [[1, 1, 2, 2, 1]], balanced: [[2, 0, 2]], mood: [[]] };
    const page = buildAlbumPageData(catalog, dup, 0);
    expect(page.recs.sonic.map((r) => r.id)).toEqual([1, 2]);
    for (const row of page.recs.sonic) expect(row).not.toHaveProperty('rank');
    expect(page.recs.balanced.map((r) => r.id)).toEqual([2]);
    expect(page.recs.mood).toEqual([]);
  });

  it('makes Spotify and cover URLs', () => {
    expect(spotifyUrl({ spotifyId: 'A'.repeat(22) })).toBe(`https://open.spotify.com/album/${'A'.repeat(22)}`);
    // No Spotify release: no link at all (the page hides it), never a search link.
    expect(spotifyUrl({ spotifyId: '' })).toBeNull();
    expect(coverUrl('', 60)).toBeNull();
    expect(coverUrl(albums[0].c, 22)).toBe('https://i.scdn.co/image/ab67616d00004851' + 'a'.repeat(24));
    expect(coverUrl(albums[0].c, 116)).toBe('https://i.scdn.co/image/ab67616d00001e02' + 'a'.repeat(24));
    expect(coverUrl(albums[0].c, 400)).toBe('https://i.scdn.co/image/ab67616d0000b273' + 'a'.repeat(24));
  });

  it('picks the shelf from albums with covers, in catalog order', () => {
    expect(pickShelf(albums, 5)).toEqual([0, 2]);
  });

  it('picks a random album with a cover', () => {
    expect(pickSurprise(albums, () => 0)).toBe(0);
    expect(pickSurprise(albums, () => 0.99)).toBe(2);
    expect(pickSurprise(albums, () => 0, 0)).toBe(2);
  });

  it('never picks the excluded album or one without a cover', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999, 1, -0.5]) {
      expect(pickSurprise(albums, () => r, 0)).toBe(2);
      expect(pickSurprise(albums, () => r, 2)).toBe(0);
      expect([0, 2]).toContain(pickSurprise(albums, () => r));
    }
  });

  it('returns 0 when no other album has a cover', () => {
    expect(pickSurprise([albums[1]], () => 0.5)).toBe(0);
    expect(pickSurprise([albums[0]], () => 0.5, 0)).toBe(0);
  });

  it('makes a typographic initial', () => {
    expect(initialLetter('The Beatles')).toBe('B');
    expect(initialLetter('"Heroes"')).toBe('H');
    expect(initialLetter('1989')).toBe('1');
    expect(initialLetter('...and justice')).toBe('A');
    expect(initialLetter('\u{1D504}lpha')).toBe('\u{1D504}');
    expect(initialLetter('\u{1F3B8} rock')).toBe('R');
    expect(initialLetter('stra\u00dfe')).toBe('S');
    expect(initialLetter('\u00dfe')).toBe('\u00df');
    expect(initialLetter('( )')).toBe(COPY.cover.noInitial);
    expect(initialLetter('')).toBe(COPY.cover.noInitial);
  });
});
