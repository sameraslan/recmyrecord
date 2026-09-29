import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AlbumRecord } from '@/lib/types';
import { buildSearchIndex, fold, highlightRanges, queryWords, searchAlbums } from './search';

const albums = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as AlbumRecord[];
const index = buildSearchIndex(albums);
const titles = (q: string) => searchAlbums(index, q).map((h) => albums[h.id].t);
const artists = (q: string) => searchAlbums(index, q).map((h) => albums[h.id].a);

describe('fold', () => {
  it('lowercases, strips accents and keeps a map back to the original', () => {
    expect(fold('Björk').text).toBe('bjork');
    expect(fold('Korowód').text).toBe('korowod');
    const f = fold('Æther & Sons');
    expect(f.text).toBe('aether and sons');
    expect(f.map.slice(0, 3)).toEqual([0, 0, 1]);
    expect(f.map[f.text.length]).toBe('Æther & Sons'.length);
  });

  it('splits queries into folded words', () => {
    expect(queryWords('  Good kid, m.A.A.d  ')).toEqual(['good', 'kid', 'm', 'a', 'a', 'd']);
    expect(queryWords('   ')).toEqual([]);
  });

  it('maps highlight ranges back to original characters', () => {
    expect(highlightRanges(fold('Björk'), ['bjork'])).toEqual([{ start: 0, end: 5 }]);
    expect(highlightRanges(fold('Æther'), ['a'])).toEqual([{ start: 0, end: 1 }]);
    expect(highlightRanges(fold('In Rainbows'), ['rain', 'in'])).toEqual([{ start: 0, end: 2 }, { start: 3, end: 7 }]);
  });
});

describe('searchAlbums (real catalog)', () => {
  it('finds an exact title first', () => {
    expect(titles('loveless')[0]).toBe('Loveless');
    expect(titles('Kid A')[0]).toBe('Kid A');
  });

  it('ranks an artist query by catalog rank', () => {
    const r = searchAlbums(index, 'radiohead');
    expect(r.length).toBe(6);
    expect(artists('radiohead').every((a) => a === 'Radiohead')).toBe(true);
    expect(albums[r[0].id].t).toBe('OK Computer');
  });

  it('is accent-insensitive', () => {
    const a = artists('bjork');
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.every((x) => x === 'Björk')).toBe(true);
    expect(titles('korowod')[0]).toBe('Korowód');
  });

  it('matches words across title and artist', () => {
    expect(titles('in rainbows radiohead')[0]).toBe('In Rainbows');
    expect(titles('radiohead rainbows')[0]).toBe('In Rainbows');
  });

  it('tolerates a typo through Fuse', () => {
    expect(artists('radiohed')).toContain('Radiohead');
  });

  it('returns nothing for nonsense or empty queries and caps results at 6', () => {
    expect(searchAlbums(index, 'zzkq')).toEqual([]);
    expect(searchAlbums(index, '   ')).toEqual([]);
    expect(searchAlbums(index, 'the').length).toBe(6);
  });

  it('returns highlight ranges on the original strings', () => {
    const hit = searchAlbums(index, 'bjork')[0];
    expect(hit.artist).toEqual([{ start: 0, end: 5 }]);
    expect(hit.title).toEqual([]);
  });
});
