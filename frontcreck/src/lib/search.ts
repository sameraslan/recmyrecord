import Fuse from 'fuse.js';
import type { HighlightRange } from '@/lib/highlight';
import type { AlbumId, AlbumRecord } from '@/lib/types';

export const SEARCH_LIMIT = 6;
/** The typo fallback (Fuse) only runs for folded queries of 4 to this many characters. */
export const FUZZY_MIN_CHARS = 4;
export const FUZZY_MAX_CHARS = 16;

/** A lowercased, accent-free copy of a string; map[i] is the index in the original of folded char i,
 * and map[text.length] is the original length. Apostrophes fold to nothing, so "Don't" is "dont";
 * "&" stays "&", which is not a word. */
export interface Folded {
  src: string;
  text: string;
  map: number[];
}

const EXTRA: Record<string, string> = {
  ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i',
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

/** A word is a maximal run of letters and digits, so "m.A.A.d" is m, a, a, d, and "&" is no word. */
const WORD = /[\p{L}\p{N}]+/gu;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
/** "and" in a query, like "&" or "and" in a credit, is an optional connector, not a word to match. */
const CONNECTOR = 'and';

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

/** The words every match needs: the query words without connectors (unless there is nothing else). */
function requiredWords(words: readonly string[]): string[] {
  const req = words.filter((w) => w !== CONNECTOR);
  return req.length ? req : [...words];
}

/** Folded range [s, e) mapped back to the original string, whole characters (and trailing marks) included. */
function toOriginal(f: Folded, s: number, e: number): HighlightRange {
  const last = f.map[e - 1];
  let end = last + ((f.src.codePointAt(last) ?? 0) > 0xffff ? 2 : 1);
  while (end < f.src.length && /\p{M}/u.test(f.src[end])) end++;
  return { start: f.map[s], end };
}

/** The whole query as one run from a word start: words separated by one space, with an optional
 * "and" or "&" between any two (the last word may be a prefix). */
function contiguousRun(words: readonly string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join(' (?:(?:and|&) )?')}`, 'u');
}

/**
 * The matched word prefixes of `f`, mapped back to the original string. When the whole query occurs
 * as one run starting at a word start (connectors optional), that run is one range ("Kid A", "Marley &
 * The Wailers"). Otherwise each query word marks the prefix of the first word it starts, preferring a
 * word no earlier query word took. Letters inside a word, and a bare "&", are never marked.
 */
export function highlightRanges(f: Folded, words: readonly string[]): HighlightRange[] {
  const ws = requiredWords(words.filter(Boolean));
  if (!ws.length) return [];
  const run = contiguousRun(ws).exec(f.text);
  if (run) return [toOriginal(f, run.index, run.index + run[0].length)];
  const fw = wordsOf(f.text);
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
  /** title words without connectors, joined by single spaces (for the exact and prefix tiers) */
  tc: string;
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
    return { id, t, a, tw, aw, tn: tw.join(' '), an: aw.join(' '), tc: tw.filter((w) => w !== CONNECTOR).join(' ') };
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

/** Number of words in `list` starting with `w`, counting no further than `need`. */
function countStarts(list: readonly string[], w: string, need: number): number {
  let n = 0;
  for (const x of list) if (x.startsWith(w) && ++n === need) break;
  return n;
}

/**
 * 0 title equals the query, 1 title starts with it, 2 every word in the title, 3 split with the artist,
 * 4 every word in the artist; null when some query word is missing. A word the query repeats needs as
 * many different words starting with it in the title, or in the artist ("the the" is the band, not any
 * album with "The" in both title and artist).
 */
function tierOf(e: Entry, need: ReadonlyMap<string, number>, q: string): number | null {
  let inTitle = 0;
  for (const [w, n] of need) {
    if (countStarts(e.tw, w, n) === n) inTitle++;
    else if (countStarts(e.aw, w, n) < n) return null;
  }
  if (e.tc === q) return 0;
  if (e.tc.startsWith(q)) return 1;
  if (inTitle === need.size) return 2;
  return inTitle > 0 ? 3 : 4;
}

/**
 * The keystroke path: every required query word must start a word of the title or artist
 * (accent-folded, case-insensitive, apostrophes ignored, "and" and "&" optional). Ranked by tierOf,
 * ties in catalog order. Never runs Fuse, so it stays well under a millisecond.
 */
export function prefixSearch(index: SearchIndex, query: string, limit = SEARCH_LIMIT): SearchHit[] {
  if (!HAS_WORD_CHAR.test(query)) return [];
  const words = queryWords(query);
  if (!words.length) return [];
  const req = requiredWords(words);
  const q = req.join(' ');
  const need = new Map<string, number>();
  for (const w of req) need.set(w, (need.get(w) ?? 0) + 1);
  const ranked: [number, AlbumId][] = [];
  for (const e of index.entries) {
    const tier = tierOf(e, need, q);
    if (tier !== null) ranked.push([tier, e.id]);
  }
  ranked.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return ranked.slice(0, limit).map(([, id]) => {
    const e = index.entries[id];
    return { id, title: highlightRanges(e.t, words), artist: highlightRanges(e.a, words) };
  });
}

/** Whether a query may use the typo fallback: its folded words span FUZZY_MIN_CHARS to FUZZY_MAX_CHARS. */
export function fuzzyEligible(query: string): boolean {
  const n = queryWords(query).join(' ').length;
  return n >= FUZZY_MIN_CHARS && n <= FUZZY_MAX_CHARS;
}

/** Typo matches through Fuse (threshold 0.2), without highlights; [] for queries outside the range.
 * Costs tens of milliseconds, so callers run it off the keystroke path, after the user pauses. */
export function fuzzySearch(index: SearchIndex, query: string, limit = SEARCH_LIMIT): SearchHit[] {
  if (!fuzzyEligible(query)) return [];
  const q = queryWords(query).join(' ');
  return index.fuse.search(q, { limit }).map((r) => ({ id: r.item.id, title: [], artist: [] }));
}

/** Prefix matches, or when there are none, typo matches. Both steps run synchronously: for tests and
 * callers off the keystroke path. SearchBox runs the two steps separately. */
export function searchAlbums(index: SearchIndex, query: string, limit = SEARCH_LIMIT): SearchHit[] {
  const hits = prefixSearch(index, query, limit);
  return hits.length ? hits : fuzzySearch(index, query, limit);
}
