import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AlbumRecord } from '@/lib/types';
import { FUZZY_MAX_CHARS, buildSearchIndex, fold, fuzzyEligible, fuzzySearch, highlightRanges, prefixSearch, queryWords, searchAlbums } from './search';

const albums = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as AlbumRecord[];
const index = buildSearchIndex(albums);
const titles = (q: string) => searchAlbums(index, q).map((h) => albums[h.id].t);
const artists = (q: string) => searchAlbums(index, q).map((h) => albums[h.id].a);

describe('fold', () => {
  it('lowercases, strips accents and keeps a map back to the original', () => {
    expect(fold('Björk').text).toBe('bjork');
    expect(fold('Korowód').text).toBe('korowod');
    const f = fold('Æther & Sons');
    expect(f.text).toBe('aether & sons');
    expect(f.map.slice(0, 3)).toEqual([0, 0, 1]);
    expect(f.map[f.text.length]).toBe('Æther & Sons'.length);
  });

  it('splits queries into folded words', () => {
    expect(queryWords('  Good kid, m.A.A.d  ')).toEqual(['good', 'kid', 'm', 'a', 'a', 'd']);
    expect(queryWords('   ')).toEqual([]);
  });

  it('drops straight and curly apostrophes, keeping the map to the original', () => {
    expect(fold("Don't").text).toBe('dont');
    expect(fold('Don\u2019t').text).toBe('dont');
    expect(fold('\u2018Allelujah').text).toBe('allelujah');
    expect(queryWords("don't stop")).toEqual(['dont', 'stop']);
    expect(highlightRanges(fold("Don't"), ['dont'])).toEqual([{ start: 0, end: 5 }]);
    expect(highlightRanges(fold("Don't"), ['don'])).toEqual([{ start: 0, end: 3 }]);
  });

  it('maps highlight ranges back to original characters', () => {
    expect(highlightRanges(fold('Björk'), ['bjork'])).toEqual([{ start: 0, end: 5 }]);
    expect(highlightRanges(fold('Æther'), ['a'])).toEqual([{ start: 0, end: 1 }]);
    expect(highlightRanges(fold('In Rainbows'), ['rain', 'in'])).toEqual([{ start: 0, end: 2 }, { start: 3, end: 7 }]);
  });

  it('highlights word prefixes only, never letters inside a word', () => {
    expect(highlightRanges(fold('Radiohead'), ['a'])).toEqual([]);
    expect(highlightRanges(fold('Slave to the Grind'), ['kid', 'a'])).toEqual([]);
    expect(highlightRanges(fold('Aesop Rock'), ['kid', 'a'])).toEqual([{ start: 0, end: 1 }]);
    expect(highlightRanges(fold('The Impossible Kid'), ['kid', 'a'])).toEqual([{ start: 15, end: 18 }]);
  });

  it('highlights a contiguous whole-query run at a word start as one range', () => {
    expect(highlightRanges(fold('Kid A'), ['kid', 'a'])).toEqual([{ start: 0, end: 5 }]);
    expect(highlightRanges(fold('Sigur Rós'), ['sigur', 'ros'])).toEqual([{ start: 0, end: 9 }]);
    expect(highlightRanges(fold('Kid Amnesiae'), ['kid', 'a'])).toEqual([{ start: 0, end: 5 }]);
  });

  it('gives repeated query words distinct words when it can', () => {
    expect(highlightRanges(fold('good kid, m.A.A.d city'), ['kid', 'a'])).toEqual([{ start: 5, end: 8 }, { start: 12, end: 13 }]);
    expect(highlightRanges(fold('good kid, m.A.A.d city'), ['m', 'a', 'a', 'd'])).toEqual([
      { start: 10, end: 11 },
      { start: 12, end: 13 },
      { start: 14, end: 15 },
      { start: 16, end: 17 },
    ]);
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

  it('matches every query word as a word prefix of the title or artist', () => {
    const t = titles('kid a');
    expect(t[0]).toBe('Kid A');
    expect(t).toContain('The Impossible Kid');
    expect(t).toContain('good kid, m.A.A.d city');
    expect(t).not.toContain('Slave to the Grind');
    expect(t).not.toContain('Man on the Moon: The End of Day');
    expect(artists('sigur ros')[0]).toBe('Sigur Rós');
    expect(searchAlbums(index, 'sigur ros')[0].artist).toEqual([{ start: 0, end: 9 }]);
  });

  it('ranks all-in-title matches above matches split with the artist', () => {
    const t = titles('kid a');
    expect(t.indexOf('good kid, m.A.A.d city')).toBeLessThan(t.indexOf('The Impossible Kid'));
    const hit = searchAlbums(index, 'kid a').find((h) => albums[h.id].t === 'The Impossible Kid')!;
    expect(hit.title).toEqual([{ start: 15, end: 18 }]);
    expect(hit.artist).toEqual([{ start: 0, end: 1 }]);
  });

  it('highlights a single-letter query only at word starts', () => {
    const hits = searchAlbums(index, 'a');
    expect(hits.length).toBe(6);
    for (const h of hits) {
      for (const [text, ranges] of [
        [albums[h.id].t, h.title],
        [albums[h.id].a, h.artist],
      ] as const) {
        for (const r of ranges) {
          expect(r.end - r.start, text).toBe(1);
          expect(fold(text.slice(r.start, r.end)).text, text).toBe('a');
          expect(r.start === 0 || !/[\p{L}\p{N}]/u.test(text[r.start - 1]), text).toBe(true);
        }
      }
    }
  });

  it('finds titles with apostrophes without typing them, and ignores punctuation-only queries', () => {
    expect(titles('dont go outside')[0]).toBe("I Don't Like Shit, I Don't Go Outside");
    expect(titles("don\u2019t mess")[0]).toBe("You Don't Mess Around With Jim");
    expect(searchAlbums(index, "' \u2019 . , ! ?")).toEqual([]);
    expect(searchAlbums(index, '&')).toEqual([]);
    expect(searchAlbums(index, '...')).toEqual([]);
  });

  it('keeps typo matches free of highlight ranges', () => {
    const hit = searchAlbums(index, 'radiohed').find((h) => albums[h.id].a === 'Radiohead')!;
    expect(hit.title).toEqual([]);
    expect(hit.artist).toEqual([]);
  });

  it('answers a very long query with no match quickly and emptily', () => {
    const long = 'qzxv'.repeat(50);
    searchAlbums(index, long);
    const t0 = performance.now();
    expect(searchAlbums(index, long)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(20);
    const words = Array.from({ length: 40 }, (_, i) => `zq${i}x`).join(' ');
    const t1 = performance.now();
    expect(searchAlbums(index, words)).toEqual([]);
    expect(performance.now() - t1).toBeLessThan(20);
  });

  it('matches each occurrence of a repeated query word with a different word of one field', () => {
    const all = searchAlbums(index, 'the the', 5000);
    const found = all.map((h) => `${albums[h.id].t} / ${albums[h.id].a}`);
    expect(found).toContain('Soul Mining / The The');
    expect(found).toContain('The Dark Side of the Moon / Pink Floyd');
    expect(found).not.toContain('The Velvet Underground & Nico / The Velvet Underground & Nico');
    expect(titles('the the soul')[0]).toBe('Soul Mining');
  });

  it('treats and and & as optional connectors, never as a word that a or an can match', () => {
    const hit = searchAlbums(index, 'marley and the wailers')[0];
    expect(albums[hit.id].a).toBe('Bob Marley & The Wailers');
    expect(hit.artist).toEqual([{ start: 4, end: 24 }]);
    expect(artists('marley & the wailers')[0]).toBe('Bob Marley & The Wailers');
    expect(artists('bob marley the wailers')[0]).toBe('Bob Marley & The Wailers');
    expect(titles('velvet underground and nico')[0]).toBe('The Velvet Underground & Nico');
    expect(titles('rise and fall ziggy')[0]).toBe('The Rise and Fall of Ziggy Stardust and the Spiders From Mars');
  });

  it('keeps the typo fallback out of prefix search and limits it to short queries', () => {
    const spy = vi.spyOn(index.fuse, 'search');
    expect(prefixSearch(index, 'radiohed')).toEqual([]);
    expect(prefixSearch(index, 'q'.repeat(32))).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect(FUZZY_MAX_CHARS).toBe(16);
    expect(fuzzyEligible('abc')).toBe(false);
    expect(fuzzyEligible('radiohed')).toBe(true);
    expect(fuzzyEligible('a'.repeat(16))).toBe(true);
    expect(fuzzyEligible('a'.repeat(17))).toBe(false);
    expect(fuzzySearch(index, 'a'.repeat(17))).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect(fuzzySearch(index, 'radiohed').map((h) => albums[h.id].a)).toContain('Radiohead');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('answers the synchronous prefix step for a 32-character no-match query in under 5 ms', () => {
    const q = 'qzxvbnmkqzxvbnmkqzxvbnmkqzxvbnmk';
    prefixSearch(index, q);
    fuzzyEligible(q);
    const t0 = performance.now();
    expect(prefixSearch(index, q)).toEqual([]);
    fuzzyEligible(q);
    expect(performance.now() - t0).toBeLessThan(5);
  });

  it('finds through the word index exactly what a scan of every album finds, in the same order', () => {
    const byHand = [
      'r', 't', 'th', 'the', 'a', 'an', 'and', 'in', 'i', '1', '19', 'x', 'zz', 'q',
      'radiohead', 'radio', 'kid a', 'in rainbows', 'the the', 'the the soul', 'blue', 'blue train', 'love', 'live at', 'live at the',
      'marley and the wailers', 'marley & the wailers', 'velvet underground and nico', 'rise and fall ziggy', 'bjork', 'sigur ros',
      'm a a d', 'dont', "don't", 'ok computer radiohead', 'computer ok', 'a a', 'the a', 'of the', 'de la', 'la la la',
      'qzxv', 'radiohed', 'zzkq the', 'the zzkq', 'the qzxvbnmkqzxvbnmk radiohead',
    ];
    // A word of every hundredth album, whole and cut short, alone and with a word of its artist.
    const fromData = albums.flatMap((a, i) => {
      if (i % 100) return [];
      const [t] = queryWords(a.t);
      const [r] = queryWords(a.a);
      return t && r ? [t, t.slice(0, 3), `${t} ${r}`, `${r.slice(0, 2)} ${t}`] : [];
    });
    expect(fromData.length).toBeGreaterThan(350);
    const ids = (q: string, limit: number, scanAll: boolean) => prefixSearch(index, q, limit, scanAll).map((h) => h.id);
    let narrowed = 0;
    // Every match of the hand-written queries (a limit above the size of the catalog), the first 300 of the others.
    for (const [list, limit] of [[byHand, albums.length + 1], [fromData, 300]] as const) {
      for (const q of list) {
        const all = ids(q, limit, true);
        expect(ids(q, limit, false), q).toEqual(all);
        if (all.length > 0 && all.length < 300) narrowed++;
      }
    }
    expect(narrowed).toBeGreaterThan(200);
    // The hits themselves, with their highlight ranges, are the same too.
    for (const q of ['radiohead', 'kid a', 'the the', 'marley and the wailers', 'th']) expect(prefixSearch(index, q), q).toEqual(prefixSearch(index, q, 6, true));
  }, 20_000);

  it('keeps one sorted entry per word, each with the albums that have it, in catalog order', () => {
    expect(index.words.length).toBe(index.posts.length);
    expect(index.words.length).toBeGreaterThan(5000);
    for (let i = 1; i < index.words.length; i++) expect(index.words[i - 1] < index.words[i], index.words[i]).toBe(true);
    const at = index.words.indexOf('radiohead');
    expect(at).toBeGreaterThanOrEqual(0);
    const ids = index.posts[at];
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(albums.flatMap((a, id) => (queryWords(`${a.t} ${a.a}`).includes('radiohead') ? [id] : [])));
  });

  it('returns highlight ranges on the original strings', () => {
    const hit = searchAlbums(index, 'bjork')[0];
    expect(hit.artist).toEqual([{ start: 0, end: 5 }]);
    expect(hit.title).toEqual([]);
  });
});

describe('searchAlbums ranking (fixture)', () => {
  const rec = (t: string, a: string): AlbumRecord => ({ slug: `${t}-${a}`, t, a, s: '', c: '', k: 0, d: [], w: ['#111111', '#222222', '#d9a066'] });
  const fixture = [
    rec('Songs', 'Blue Train'), // 0: all in the artist
    rec('Blue Nights', 'Train'), // 1: split between title and artist
    rec('Train of Blue', 'Z'), // 2: all words in the title
    rec('Blue Trains Forever', 'Z'), // 3: title starts with the query
    rec('Blue Train', 'Z'), // 4: title equals the query
    rec('Blue Train', 'Y'), // 5: title equals the query, later in the catalog
    rec('Bluegrass', 'Strain'), // 6: no match ("train" is not a word prefix of "Strain")
    rec('Rock & Roll', 'Z'), // 7: "&" is not a word
  ];
  const fx = buildSearchIndex(fixture);

  it('orders exact title, title prefix, all in title, split, all in artist, then catalog order', () => {
    expect(searchAlbums(fx, 'blue train').map((h) => h.id)).toEqual([4, 5, 3, 2, 1, 0]);
    expect(searchAlbums(fx, 'Blue Train', 3).map((h) => h.id)).toEqual([4, 5, 3]);
  });

  it('never lets a or an match a bare &', () => {
    expect(prefixSearch(fx, 'rock a')).toEqual([]);
    expect(prefixSearch(fx, 'rock an')).toEqual([]);
    expect(prefixSearch(fx, 'rock and roll').map((h) => h.id)).toEqual([7]);
    expect(prefixSearch(fx, 'rock & roll')[0].title).toEqual([{ start: 0, end: 11 }]);
  });
});
