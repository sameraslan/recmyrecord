import Fuse from 'fuse.js';
import type { HighlightRange } from '@/lib/highlight';
import type { AlbumId, AlbumRecord } from '@/lib/types';

export const SEARCH_LIMIT = 6;

/** A lowercased, accent-free copy of a string; map[i] is the index in the original of folded char i,
 * and map[text.length] is the original length. */
export interface Folded {
  src: string;
  text: string;
  map: number[];
}

const EXTRA: Record<string, string> = {
  ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', '&': 'and', '’': "'", '‘': "'",
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

const WORD_SPLIT = /[^\p{L}\p{N}']+/u;

export function queryWords(q: string): string[] {
  return fold(q).text.split(WORD_SPLIT).filter(Boolean);
}

const joinWords = (text: string) => text.split(WORD_SPLIT).filter(Boolean).join(' ');

/** First occurrence of each word, mapped back to the original string and merged. */
export function highlightRanges(f: Folded, words: readonly string[]): HighlightRange[] {
  const found: HighlightRange[] = [];
  for (const w of words) {
    const k = f.text.indexOf(w);
    if (k < 0 || !w) continue;
    const lastOrig = f.map[k + w.length - 1];
    let end = f.map[k + w.length];
    if (end <= lastOrig) {
      const cp = f.src.codePointAt(lastOrig) ?? 0;
      end = lastOrig + (cp > 0xffff ? 2 : 1);
    }
    found.push({ start: f.map[k], end });
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
  /** title words joined by single spaces */
  tn: string;
  /** artist words joined by single spaces */
  an: string;
  /** title and artist folded text, for word containment */
  full: string;
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
  const entries = albums.map((r, id) => {
    const t = fold(r.t);
    const a = fold(r.a);
    return { id, t, a, tn: joinWords(t.text), an: joinWords(a.text), full: `${t.text} ${a.text}` };
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

/** Every query word must appear in title + artist; ranked exact > prefix > word start > anywhere,
 * then by catalog rank. Only when nothing matches exactly does Fuse (threshold 0.2) try typo matches,
 * so exact results are never diluted by fuzzy noise. */
export function searchAlbums(index: SearchIndex, query: string, limit = SEARCH_LIMIT): SearchHit[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const q = words.join(' ');
  const ranked: [number, AlbumId][] = [];
  for (const e of index.entries) {
    if (!words.every((w) => e.full.includes(w))) continue;
    const tier =
      e.tn === q || e.an === q ? 0
        : e.tn.startsWith(q) || e.an.startsWith(q) ? 1
          : ` ${e.tn} ${e.an}`.includes(` ${q}`) ? 2
            : 3;
    ranked.push([tier, e.id]);
  }
  ranked.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const ids = ranked.slice(0, limit).map((x) => x[1]);
  if (ids.length === 0 && q.length >= 4) {
    for (const r of index.fuse.search(q, { limit: limit * 2 })) {
      if (!ids.includes(r.item.id)) ids.push(r.item.id);
      if (ids.length === limit) break;
    }
  }
  return ids.map((id) => {
    const e = index.entries[id];
    return { id, title: highlightRanges(e.t, words), artist: highlightRanges(e.a, words) };
  });
}
