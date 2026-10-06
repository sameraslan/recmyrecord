import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AlbumRecord, Recs } from '@/lib/types';
import { MAX_ATLAS_SHEETS } from './sprites';
import { LINK_REF_RE, assertAtlasSheets, assertLinksValid, assertRecsConsistent, dataDirName, prerenderSlugs } from './server';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const album = (slug: string, extra: Partial<AlbumRecord> = {}): AlbumRecord => ({ slug, t: slug, a: 'X', s: '', c: '', k: 0, d: [], w: W, ...extra });
const row = (...ids: number[]) => ids;

describe('recommendation rows per album', () => {
  const albums = [album('a'), album('b'), album('c', { n: 1 })];
  const ok: Recs = { sonic: [row(1), row(0), []], balanced: [row(1), row(0), []], mood: [row(2), row(2), row(0)] };

  it('accepts full rows, and empty sonic and balanced rows for an album without audio', () => {
    expect(() => assertRecsConsistent(albums, ok, 1)).not.toThrow();
  });

  it('rejects an empty row for an album that has audio', () => {
    expect(() => assertRecsConsistent(albums, { ...ok, sonic: [[], row(0), []] }, 1)).toThrow('recs.json: sonic row of a has 0 albums (expected 1)');
    expect(() => assertRecsConsistent(albums, { ...ok, mood: [row(2), row(2), []] }, 1)).toThrow('recs.json: mood row of c has 0 albums (expected 1)');
  });

  it('rejects sonic or balanced rows for an album without audio', () => {
    expect(() => assertRecsConsistent(albums, { ...ok, balanced: [row(1), row(0), row(0)] }, 1)).toThrow(
      'recs.json: balanced row of c has 1 albums but the album has no audio (expected none)',
    );
  });

  it('rejects an album without audio in another album’s sonic or balanced row, but not in its mood row', () => {
    expect(() => assertRecsConsistent(albums, { ...ok, sonic: [row(2), row(0), []] }, 1)).toThrow(
      'recs.json: sonic row of a lists c, which has no audio',
    );
  });

  it('holds for the committed data: ten rows everywhere, no album without audio', () => {
    const raw = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', name), 'utf8')) as T;
    expect(() => assertRecsConsistent(raw<AlbumRecord[]>('albums.json'), raw<Recs>('recs.json'))).not.toThrow();
  });
});

describe('listen links (the mirror of LINK_REF_RE in data-pipeline/rmr_pipeline/links.py)', () => {
  const withLinks = (l: AlbumRecord['l'], extra: Partial<AlbumRecord> = {}) => [album('a'), album('b', { l, ...extra })];

  it('accepts the form of every service', () => {
    expect(() =>
      assertLinksValid(withLinks({ am: 'us/1440650428', bc: 'joannanewsom.bandcamp.com/album/ys', dz: '302127', yt: 'AfChn_NjI9w', sc: 'joanna-newsom/sets/ys-39' })),
    ).not.toThrow();
    expect(() => assertLinksValid(withLinks({ bc: 'music.sufjan.com/track/a-b_c.d~e%20f' }))).not.toThrow();
    expect(() => assertLinksValid(withLinks({ sc: 'artist/record' }))).not.toThrow();
    expect(() => assertLinksValid([album('a'), album('b')])).not.toThrow();
  });

  it('rejects a reference that is not of its service’s form, naming the album', () => {
    const bad: [keyof typeof LINK_REF_RE, string][] = [
      ['am', 'us/album/1440650428'], ['am', 'USA/1'], ['am', 'us/'],
      ['bc', 'https://x.bandcamp.com/album/y'], ['bc', 'x.bandcamp.com/album/y?utm=1'], ['bc', 'x.bandcamp.com/album/y.'], ['bc', 'x.bandcamp.com/music'],
      ['dz', '302127/'], ['dz', 'album/302127'], ['dz', ''],
      ['yt', 'AfChn_NjI9'], ['yt', 'AfChn_NjI9w&t=1'], ['yt', 'AfChn_NjI9w\n'],
      ['sc', 'artist'], ['sc', 'artist/sets/'], ['sc', 'artist/a/b'], ['sc', 'artist/record?x=1'],
    ];
    for (const [key, ref] of bad) {
      expect(() => assertLinksValid(withLinks({ [key]: ref })), `${key}: ${JSON.stringify(ref)}`).toThrow(`albums.json: b has a bad ${key} link ${JSON.stringify(ref)}`);
    }
  });

  it('rejects a key that is no service, and a value that is not a string', () => {
    expect(() => assertLinksValid(withLinks({ tidal: '1' } as unknown as AlbumRecord['l']))).toThrow('albums.json: b has a link for "tidal", which is not a service (am, bc, dz, yt, sc)');
    expect(() => assertLinksValid(withLinks({ dz: 302127 } as unknown as AlbumRecord['l']))).toThrow('albums.json: b has a bad dz link 302127');
    expect(() => assertLinksValid(withLinks([] as unknown as AlbumRecord['l']))).toThrow('albums.json: l of b must be an object of listen links');
  });

  it('holds for the committed data', () => {
    const albums = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'albums.json'), 'utf8')) as AlbumRecord[];
    expect(() => assertLinksValid(albums)).not.toThrow();
  });
});

describe('the atlas sheets the map can draw', () => {
  it('accepts as many albums as the sheets hold, and fails beyond', () => {
    expect(() => assertAtlasSheets(4081)).not.toThrow();
    expect(() => assertAtlasSheets(10467)).not.toThrow();
    expect(() => assertAtlasSheets(MAX_ATLAS_SHEETS * 1024)).not.toThrow();
    expect(() => assertAtlasSheets(MAX_ATLAS_SHEETS * 1024 + 1)).toThrow(
      `albums.json: 16385 albums need 17 atlas sheets but the map draws at most ${MAX_ATLAS_SHEETS} (16384 albums)`,
    );
  });
});

describe('the opt-in data folder (RMR_DATA_DIR)', () => {
  it('defaults to public/data', () => {
    expect(dataDirName(undefined)).toBe('data');
    expect(dataDirName('')).toBe('data');
  });

  it('accepts a plain folder name under public and nothing else', () => {
    expect(dataDirName('data-10k')).toBe('data-10k');
    expect(() => dataDirName('../secrets')).toThrow(/RMR_DATA_DIR/);
    expect(() => dataDirName('/tmp/x')).toThrow(/RMR_DATA_DIR/);
  });
});

describe('the opt-in prerender subset (RMR_PRERENDER)', () => {
  const slugs = ['a', 'b', 'c', 'd', 'e'];
  it('prerenders every album by default', () => {
    expect(prerenderSlugs(slugs, undefined)).toEqual(slugs);
    expect(prerenderSlugs(slugs, '')).toEqual(slugs);
  });

  it('takes a count of leading albums and named slugs, each once, ignoring unknown ones', () => {
    expect(prerenderSlugs(slugs, '2')).toEqual(['a', 'b']);
    expect(prerenderSlugs(slugs, '2,e,b,zzz')).toEqual(['a', 'b', 'e']);
    expect(prerenderSlugs(slugs, 'd')).toEqual(['d']);
  });
});
