import { COPY } from '@/lib/copy';
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
    if (out.length >= max) break;
    const w = vocab[k];
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * The seed's visible mood tags (`moodTags`) that the other album also carries anywhere in its
 * descriptors, in the seed's order (strongest first), at most `max`. Every word returned is one
 * of the seed's visible tags, so the UI can light it up.
 */
export function sharedWords(seed: AlbumRecord, other: AlbumRecord, vocab: Vocab, max = SHARED_MAX): string[] {
  const theirs = new Set<string>();
  for (const k of other.d) if (vocab[k]) theirs.add(vocab[k]);
  return moodTags(seed, vocab)
    .filter((w) => theirs.has(w))
    .slice(0, Math.max(0, max));
}

export function buildAlbumPageData(catalog: Catalog, recs: Recs, id: AlbumId): AlbumPageData {
  const { albums, vocab } = catalog;
  const seedRecord = albums[id];
  if (!seedRecord) throw new RangeError(`No album with id ${id}`);
  const seed = { ...toSummary(albums, id), tags: moodTags(seedRecord, vocab), ambient: seedRecord.w };
  const byStop = {} as Record<StopId, RecRow[]>;
  for (const stop of STOP_IDS) {
    const ids = [...new Set(recs[stop][id] ?? [])].filter(
      (j) => Number.isInteger(j) && j >= 0 && j < albums.length && j !== id,
    );
    byStop[stop] = ids.slice(0, REC_MAX).map((j, n) => ({
      ...toSummary(albums, j),
      rank: n + 1,
      shared: sharedWords(seedRecord, albums[j], vocab),
    }));
  }
  return { seed, recs: byStop };
}

/** The album's Spotify page; null when it has no Spotify release (the page then shows no Spotify link). */
export function spotifyUrl(a: Pick<AlbumSummary, 'spotifyId'>): string | null {
  return a.spotifyId ? `https://open.spotify.com/album/${a.spotifyId}` : null;
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

/**
 * A random album that has a cover and is not `exclude`. The return type has no empty value, so
 * when no such album exists (never the case with the real catalog) it returns 0, which may then be
 * the excluded or a coverless album.
 */
export function pickSurprise(albums: readonly AlbumRecord[], rand: () => number = Math.random, exclude?: AlbumId): AlbumId {
  const pool: AlbumId[] = [];
  for (let i = 0; i < albums.length; i++) if (albums[i].c && i !== exclude) pool.push(i);
  if (!pool.length) return 0;
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(rand() * pool.length)))];
}

/**
 * Letter for the typographic cover tile: the first letter or digit after a leading "The ",
 * upper-cased (whole code points, so astral characters stay intact). Falls back to
 * `COPY.cover.noInitial` when the title has no letter or digit.
 */
export function initialLetter(title: string): string {
  const m = title.replace(/^the\s+/i, '').match(/[\p{L}\p{N}]/u);
  if (!m) return COPY.cover.noInitial;
  const upper = m[0].toUpperCase();
  // Some letters upper-case to two (for example the sharp s); keep the tile to one character.
  return [...upper].length === 1 ? upper : m[0];
}
