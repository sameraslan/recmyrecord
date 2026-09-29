import Fuse from 'fuse.js';
import type { HighlightRange } from '@/lib/highlight';
import type { AlbumId, AlbumRecord } from '@/lib/types';

export const SEARCH_LIMIT = 6;
/** The typo fallback (Fuse) only runs for folded queries up to this length: its cost grows with length. */
export const FUZZY_MAX_CHARS = 32;

/** A lowercased, accent-free copy of a string; map[i] is the index in the original of folded char i,
 * and map[text.length] is the original length. Apostrophes fold to nothing, so "Don't" is "dont". */
export interface Folded {
  src: string;
  text: string;
  map: number[];
}

const EXTRA: Record<string, string> = {
  ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', '&': 'and',
  "'": '', '’': '', '‘': '', 'ʼ': '',
};

export function fold(s: string): Folded {
  let text = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const f = EXTRA[lower] ?? lower.normalize('NFKD').replace(/\p{M}+/gu, '');
    for (let u = 0; u < f.length; u++) {
      text += f[u];
      map.push(i);
    }
    i += ch.length;
  }
  map.push(s.length);
  return { src: s, text, map };
}

/** A word is a maximal run of letters and digits, so "m.A.A.d" is m, a, a, d. */
const WORD = /[\p{L}\p{N}]+/gu;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

interface Word {
  w: string;
  /** index of the word's first char in the folded text */
  at: number;
}

function wordsOf(text: string): Word[] {
  return Array.from(text.matchAll(WORD), (m) => ({ w: m[0], at: m.index }));
}

const wordList = (folded: string): string[] => Array.from(folded.matchAll(WORD), (m) => m[0]);

export function queryWords(q: string): string[] {
  return wordList(fold(q).text);
}

/** Folded range [s, e) mapped back to the original string, whole characters (and trailing marks) included. */
function toOriginal(f: Folded, s: number, e: number): HighlightRange {
  const last = f.map[e - 1];
  let end = last + ((f.src.codePointAt(last) ?? 0) > 0xffff ? 2 : 1);
  while (end < f.src.length && /\p{M}/u.test(f.src[end])) end++;
  return { start: f.map[s], end };
}

/**
 * The matched word prefixes of `f`, mapped back to the original string. When the whole query
 * (words joined by single spaces) occurs as one run starting at a word start, that run is one range
 * ("Kid A" is one underline). Otherwise each query word marks the prefix of the first word it starts,
 * preferring a word no earlier query word took. Letters inside a word are never marked.
 */
export function highlightRanges(f: Folded, words: readonly string[]): HighlightRange[] {
  const ws = words.filter(Boolean);
  if (!ws.length) return [];
  const fw = wordsOf(f.text);
  const q = ws.join(' ');
  for (const x of fw) if (f.text.startsWith(q, x.at)) return [toOriginal(f, x.at, x.at + q.length)];
  const used = new Set<number>();
  const found: HighlightRange[] = [];
  for (const w of ws) {
    let k = fw.findIndex((x, i) => !used.has(i) && x.w.startsWith(w));
    if (k < 0) k = fw.findIndex((x) => x.w.startsWith(w));
    if (k < 0) continue;
    used.add(k);
    found.push(toOriginal(f, fw[k].at, fw[k].at + w.length));
  }
  found.sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];
  for (const r of found) {
    const prev = merged[merged.length - 1];
    if (prev && r.start <= prev.end) prev.end = Math.max(prev.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

interface Entry {
  id: AlbumId;
  t: Folded;
  a: Folded;
  /** folded title words */
  tw: string[];
  /** folded artist words */
  aw: string[];
  /** title words joined by single spaces */
  tn: string;
  /** artist words joined by single spaces */
  an: string;
}

export interface SearchIndex {
  entries: Entry[];
  fuse: Fuse<Entry>;
}

export interface SearchHit {
  id: AlbumId;
  title: HighlightRange[];
  artist: HighlightRange[];
}

export function buildSearchIndex(albums: readonly AlbumRecord[]): SearchIndex {
  const entries = albums.map((r, id): Entry => {
    const t = fold(r.t);
    const a = fold(r.a);
    const tw = wordList(t.text);
    const aw = wordList(a.text);
    return { id, t, a, tw, aw, tn: tw.join(' '), an: aw.join(' ') };
  });
  const fuse = new Fuse(entries, {
    keys: [
      { name: 'tn', weight: 0.6 },
      { name: 'an', weight: 0.4 },
    ],
    threshold: 0.2,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return { entries, fuse };
}

const startsSome = (list: readonly string[], w: string) => list.some((x) => x.startsWith(w));

/** 0 title equals the query, 1 title starts with it, 2 every word in the title, 3 split with the artist,
 * 4 every word in the artist; null when some query word starts no word of the title or artist. */
function tierOf(e: Entry, unique: readonly string[], q: string): number | null {
  let inTitle = 0;
  for (const w of unique) {
    const t = startsSome(e.tw, w);
    if (t) inTitle++;
    else if (!startsSome(e.aw, w)) return null;
  }
  if (e.tn === q) return 0;
  if (e.tn.startsWith(q)) return 1;
  if (inTitle === unique.length) return 2;
  return inTitle > 0 ? 3 : 4;
}

/**
 * Every query word must start a word of the title or artist (accent-folded, case-insensitive,
 * apostrophes ignored). Ranked by tierOf, ties in catalog order. Only when nothing matches does Fuse
 * (threshold 0.2) try typo matches, for queries up to FUZZY_MAX_CHARS; those carry no highlights.
 */
export function searchAlbums(index: SearchIndex, query: string, limit = SEARCH_LIMIT): SearchHit[] {
  if (!HAS_WORD_CHAR.test(query)) return [];
  const words = queryWords(query);
  if (!words.length) return [];
  const q = words.join(' ');
  const unique = [...new Set(words)];
  const ranked: [number, AlbumId][] = [];
  for (const e of index.entries) {
    const tier = tierOf(e, unique, q);
    if (tier !== null) ranked.push([tier, e.id]);
  }
  ranked.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const hits: SearchHit[] = ranked.slice(0, limit).map(([, id]) => {
    const e = index.entries[id];
    return { id, title: highlightRanges(e.t, words), artist: highlightRanges(e.a, words) };
  });
  if (hits.length === 0 && q.length >= 4 && q.length <= FUZZY_MAX_CHARS) {
    for (const r of index.fuse.search(q, { limit })) hits.push({ id: r.item.id, title: [], artist: [] });
  }
  return hits;
}
