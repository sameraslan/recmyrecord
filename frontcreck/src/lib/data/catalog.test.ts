import { describe, expect, it } from 'vitest';
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
    expect(page.recs.balanced.map((r) => [r.id, r.rank])).toEqual([[2, 1], [1, 2]]);
    expect(page.recs.mood.map((r) => r.id)).toEqual([1]);
    expect(page.recs.sonic[0].shared).toEqual(['melancholic', 'warm', 'calm']);
  });

  it('makes Spotify and cover URLs', () => {
    expect(spotifyUrl({ spotifyId: 'A'.repeat(22), title: 'T', artist: 'A' })).toBe(`https://open.spotify.com/album/${'A'.repeat(22)}`);
    expect(spotifyUrl({ spotifyId: '', title: 'Beta', artist: 'Y' })).toBe('https://open.spotify.com/search/Beta%20Y');
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

  it('makes a typographic initial', () => {
    expect(initialLetter('The Beatles')).toBe('B');
    expect(initialLetter('( )')).toBe('(');
    expect(initialLetter('')).toBe('·');
  });
});
