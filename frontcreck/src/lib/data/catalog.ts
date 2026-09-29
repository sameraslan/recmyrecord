import { STOP_IDS } from '@/lib/types';
import type { AlbumId, AlbumPageData, AlbumRecord, AlbumSummary, Catalog, RecRow, Recs, StopId, Vocab } from '@/lib/types';

export const COVER_BASE = 'https://i.scdn.co/image/';
export const REC_DEFAULT_VISIBLE = 5;
export const REC_MAX = 10;
export const SHELF_SIZE = 24;
export const TAGS_MAX = 6;
export const SHARED_MAX = 4;

export function buildCatalog(albums: AlbumRecord[], vocab: Vocab): Catalog {
  const bySlug = new Map<string, AlbumId>();
  albums.forEach((a, i) => bySlug.set(a.slug, i));
  return { albums, vocab, bySlug };
}

export function toSummary(albums: readonly AlbumRecord[], id: AlbumId): AlbumSummary {
  const r = albums[id];
  if (!r) throw new RangeError(`No album with id ${id}`);
  return { id, slug: r.slug, title: r.t, artist: r.a, spotifyId: r.s, coverId: r.c, cluster: r.k };
}

export function moodTags(album: AlbumRecord, vocab: Vocab, max = TAGS_MAX): string[] {
  const out: string[] = [];
  for (const k of album.d) {
    const w = vocab[k];
    if (w && !out.includes(w)) out.push(w);
    if (out.length === max) break;
  }
  return out;
}

/** Mood words both albums carry, in the seed's order (strongest first), at most `max`. */
export function sharedWords(seed: AlbumRecord, other: AlbumRecord, vocab: Vocab, max = SHARED_MAX): string[] {
  const theirs = new Set(other.d);
  const out: string[] = [];
  for (const k of seed.d) {
    const w = vocab[k];
    if (w && theirs.has(k)) out.push(w);
    if (out.length === max) break;
  }
  return out;
}

export function buildAlbumPageData(catalog: Catalog, recs: Recs, id: AlbumId): AlbumPageData {
  const { albums, vocab } = catalog;
  const seedRecord = albums[id];
  if (!seedRecord) throw new RangeError(`No album with id ${id}`);
  const seed = { ...toSummary(albums, id), tags: moodTags(seedRecord, vocab), ambient: seedRecord.w };
  const byStop = {} as Record<StopId, RecRow[]>;
  for (const stop of STOP_IDS) {
    const ids = (recs[stop][id] ?? []).filter((j) => Number.isInteger(j) && j >= 0 && j < albums.length && j !== id);
    byStop[stop] = ids.slice(0, REC_MAX).map((j, n) => ({
      ...toSummary(albums, j),
      rank: n + 1,
      shared: sharedWords(seedRecord, albums[j], vocab),
    }));
  }
  return { seed, recs: byStop };
}

export function spotifyUrl(a: Pick<AlbumSummary, 'spotifyId' | 'title' | 'artist'>): string {
  return a.spotifyId
    ? `https://open.spotify.com/album/${a.spotifyId}`
    : `https://open.spotify.com/search/${encodeURIComponent(`${a.title} ${a.artist}`)}`;
}

/** Remote cover sized for `px` CSS pixels at 2x density; null when the album has no cover id. */
export function coverUrl(coverId: string, px: number): string | null {
  if (!coverId) return null;
  const need = px * 2;
  const prefix = need <= 64 ? 'ab67616d00004851' : need <= 300 ? 'ab67616d00001e02' : 'ab67616d0000b273';
  return COVER_BASE + (coverId.startsWith('ab67616d') && coverId.length > 16 ? prefix + coverId.slice(16) : coverId);
}

/** Top-ranked albums that have a cover, in catalog order. */
export function pickShelf(albums: readonly AlbumRecord[], count = SHELF_SIZE): AlbumId[] {
  const out: AlbumId[] = [];
  for (let i = 0; i < albums.length && out.length < count; i++) if (albums[i].c) out.push(i);
  return out;
}

export function pickSurprise(albums: readonly AlbumRecord[], rand: () => number = Math.random, exclude?: AlbumId): AlbumId {
  const pool: AlbumId[] = [];
  for (let i = 0; i < albums.length; i++) if (albums[i].c && i !== exclude) pool.push(i);
  if (!pool.length) return 0;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Letter for the typographic cover tile. */
export function initialLetter(title: string): string {
  return title.replace(/^the\s+/i, '').charAt(0).toUpperCase() || '·';
}
