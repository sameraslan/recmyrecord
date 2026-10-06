import { COPY } from '@/lib/copy';
import { STOP_IDS } from '@/lib/types';
import type { AlbumId, AlbumPageData, AlbumRecord, AlbumSummary, Catalog, ListenLinks, RecRow, Recs, SeedData, StopId, Vocab } from '@/lib/types';

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
  const summary: AlbumSummary = { id, slug: r.slug, title: r.t, artist: r.a, spotifyId: r.s, coverId: r.c, cluster: r.k };
  // Only where present, so an album without extra links serialises exactly as before.
  if (r.l) summary.links = r.l;
  return summary;
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
  const seed: SeedData = { ...toSummary(albums, id), tags: moodTags(seedRecord, vocab), ambient: seedRecord.w };
  if (seedRecord.n) seed.noAudio = true;
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

export type ListenService = 'spotify' | keyof ListenLinks;

/** Services other than Spotify in the order the one link is chosen, with the URL each reference stands for. */
const LISTEN_ORDER: readonly [keyof ListenLinks, (ref: string) => string][] = [
  ['am', (ref) => `https://music.apple.com/${ref.replace('/', '/album/')}`],
  ['bc', (ref) => `https://${ref}`],
  ['dz', (ref) => `https://www.deezer.com/album/${ref}`],
  ['yt', (ref) => `https://www.youtube.com/watch?v=${ref}`],
  ['sc', (ref) => `https://soundcloud.com/${ref}`],
];

/**
 * The one place to listen that the page links to: Spotify when the album is there, otherwise its first other
 * service (Apple Music, Bandcamp, Deezer, YouTube, SoundCloud); null when it has none (the page then shows no
 * link, never a search link).
 */
export function listenLink(a: Pick<AlbumSummary, 'spotifyId' | 'links'>): { service: ListenService; url: string } | null {
  const spotify = spotifyUrl(a);
  if (spotify) return { service: 'spotify', url: spotify };
  for (const [service, url] of LISTEN_ORDER) {
    const ref = a.links?.[service];
    if (ref) return { service, url: url(ref) };
  }
  return null;
}

/** The link's wording for a service: the button, the short form on the map card, and a row's accessible name. */
export function listenText(service: ListenService): { open: string; short: string; row: (title: string) => string } {
  if (service === 'spotify') return { open: COPY.album.openInSpotify, short: COPY.map.cardSpotify, row: COPY.album.rowSpotify };
  const name = COPY.listen.services[service];
  return { open: COPY.listen.openIn(name), short: name, row: (title) => COPY.listen.rowOpenIn(title, name) };
}

/** Fixed sizes of the hosts that have them (mirrors data-pipeline/rmr_pipeline/covers.py). */
const DEEZER_SIZES = [56, 250, 500, 1000] as const;
/** [px, file-name suffix] */
const BANDCAMP_SIZES = [[100, 3], [210, 9], [350, 2], [700, 16], [1200, 10]] as const;

/** True for a cover that is a 4:3 video frame, shown as its centre square. */
export function isFrameCover(coverId: string): boolean {
  return coverId.startsWith('yt:');
}

/**
 * The URL of cover `coverId` at about `px` image pixels (the smallest size at least that wide where the host
 * has fixed sizes); null when the album has no cover id. Mirrors `cover_url` in the pipeline's covers.py:
 *   <id>       Spotify, https://i.scdn.co/image/<id>, with the size prefix swapped for ids that carry one
 *   dz:<md5>   Deezer        am:<path>  Apple        bc:<number>  Bandcamp
 *   yt:<id>    YouTube: a 4:3 video frame in one size
 */
export function coverUrlAt(coverId: string, px: number): string | null {
  if (!coverId) return null;
  const colon = coverId.indexOf(':');
  const kind = colon < 0 ? '' : coverId.slice(0, colon);
  const ref = coverId.slice(colon + 1);
  if (kind === 'dz') {
    const n = DEEZER_SIZES.find((s) => s >= px) ?? DEEZER_SIZES[DEEZER_SIZES.length - 1];
    return `https://cdn-images.dzcdn.net/images/cover/${ref}/${n}x${n}-000000-80-0-0.jpg`;
  }
  if (kind === 'am') {
    const n = Math.ceil(px);
    return `https://is1-ssl.mzstatic.com/image/thumb/${ref}/${n}x${n}bb.jpg`;
  }
  if (kind === 'bc') {
    const suffix = (BANDCAMP_SIZES.find(([size]) => size >= px) ?? BANDCAMP_SIZES[BANDCAMP_SIZES.length - 1])[1];
    return `https://f4.bcbits.com/img/a${ref}_${suffix}.jpg`;
  }
  if (kind === 'yt') return `https://i.ytimg.com/vi/${ref}/hqdefault.jpg`;
  const prefix = px <= 64 ? 'ab67616d00004851' : px <= 300 ? 'ab67616d00001e02' : 'ab67616d0000b273';
  return COVER_BASE + (coverId.startsWith('ab67616d') && coverId.length > 16 ? prefix + coverId.slice(16) : coverId);
}

/** Remote cover sized for `px` CSS pixels at 2x density; null when the album has no cover id. */
export function coverUrl(coverId: string, px: number): string | null {
  return coverUrlAt(coverId, px * 2);
}

/** The cover as a link-preview image, with the pixel size that host serves for a 640 px request; null without a cover id. */
export function ogCover(coverId: string): { url: string; width: number; height: number } | null {
  const url = coverUrlAt(coverId, 640);
  if (!url) return null;
  if (isFrameCover(coverId)) return { url, width: 480, height: 360 };
  const side = coverId.startsWith('dz:') ? 1000 : coverId.startsWith('bc:') ? 700 : 640;
  return { url, width: side, height: side };
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
