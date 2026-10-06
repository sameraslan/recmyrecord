import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AlbumRecord, Recs } from '@/lib/types';
import { assertRecsConsistent, dataDirName, prerenderSlugs } from './server';

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
