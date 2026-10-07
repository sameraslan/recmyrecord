import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenLink, listenText } from '../src/lib/data/catalog';
import { ATLAS_PER_SHEET, atlasCount } from '../src/lib/data/sprites';
import { bracketStart, isLatinChar } from '../src/lib/display-text';
import { buildSearchIndex, prefixSearch } from '../src/lib/search';
import type { AlbumId, AlbumRecord, Positions, Recs, StopId } from '../src/lib/types';

/**
 * The data the site under test was built from (public/data), read in the test process. Sonic and balanced
 * lists change whenever the pipeline rebuilds the audio features, so tests take those expectations from here
 * and never name a title. Mood lists barely depend on audio and stay pinned in the specs.
 */
// RMR_DATA_DIR: the opt-in folder for another data set (see src/lib/data/server.ts).
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', process.env.RMR_DATA_DIR || 'data');
const readJson = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;

/**
 * The hosts remote covers come from, one per form of the cover id (`coverUrlAt` in src/lib/data/catalog.ts; the
 * same list as the img-src hosts of next.config.ts). A Cover Art Archive cover has none: it is one of the site's
 * own files, /covers/<mbid>.jpg (public/covers).
 */
export const COVER_HOSTS = ['i.scdn.co', 'cdn-images.dzcdn.net', 'is1-ssl.mzstatic.com', 'f4.bcbits.com', 'i.ytimg.com'] as const;
/** The site's own copy of a Cover Art Archive cover, on any origin. */
export const HOSTED_COVER_RE = /\/covers\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jpg$/;
/** Any host a cover must never be asked from: the page serves its own copy of a Cover Art Archive cover. */
export const ARCHIVE_HOST_RE = /^https?:\/\/(?:[a-z0-9.-]+\.)?(?:coverartarchive|archive|musicbrainz)\.org\//;
/** Any cover: a URL on a cover host, or one of the site's own copies. For `page.route` (holding or failing every cover) and for telling a failed cover from another failed request. */
export const COVER_URL_RE = new RegExp(`^https://(?:${COVER_HOSTS.map((h) => h.replaceAll('.', '\\.')).join('|')})/|${HOSTED_COVER_RE.source}`);
/** A thumbnail sheet: thumbs.webp, then thumbs-1.webp, ... (one per 4,096 albums). */
export const THUMB_SHEET_RE = /\/data\/thumbs(-\d+)?\.webp$/;
/** A map atlas sheet: atlas-0.webp, ... (one per 1,024 albums, so two digits from the eleventh). */
export const ATLAS_SHEET_RE = /\/data\/atlas-\d+\.webp$/;

let cache: { albums: AlbumRecord[]; recs: Recs } | null = null;
function data(): { albums: AlbumRecord[]; recs: Recs } {
  cache ??= { albums: readJson<AlbumRecord[]>('albums.json'), recs: readJson<Recs>('recs.json') };
  return cache;
}

export interface ExpectedRec {
  slug: string;
  title: string;
  /** '' when the album has no Spotify release. */
  spotifyId: string;
}

/** The rows the album page of `slug` lists at `stop`, closest first. */
export function recsOf(slug: string, stop: StopId): ExpectedRec[] {
  const { albums, recs } = data();
  const id = albums.findIndex((a) => a.slug === slug);
  if (id < 0) throw new Error(`no album with slug ${slug} in public/data/albums.json`);
  return recs[stop][id].map((r) => ({ slug: albums[r].slug, title: albums[r].t, spotifyId: albums[r].s }));
}

const hasNoLink = (a: AlbumRecord): boolean => a.s === '' && a.l === undefined;
const hasOtherService = (a: AlbumRecord): boolean => a.s === '' && a.l !== undefined;

/**
 * The first album whose closest row at `stop` is an album with no place to listen at all (no Spotify release and
 * no other link) while its second row has a Spotify release, so a test can see a row without a link next to a
 * row with one.
 */
export function albumWhoseFirstRecHasNoLink(stop: StopId): { slug: string; first: ExpectedRec; second: ExpectedRec } {
  const { albums, recs } = data();
  for (let id = 0; id < albums.length; id++) {
    const [a, b] = recs[stop][id];
    // An album without audio has no sonic or balanced rows.
    if (a === undefined || b === undefined) continue;
    if (hasNoLink(albums[a]) && albums[b].s !== '') {
      const [first, second] = recsOf(albums[id].slug, stop);
      return { slug: albums[id].slug, first, second };
    }
  }
  throw new Error(`no album's first ${stop} row is an album without any listen link (followed by one with a Spotify release)`);
}

export interface PickedAlbum {
  id: AlbumId;
  slug: string;
  title: string;
  artist: string;
}

const picked = (id: AlbumId): PickedAlbum => {
  const a = data().albums[id];
  return { id, slug: a.slug, title: a.t, artist: a.a };
};

function firstAlbum(what: string, test: (a: AlbumRecord, id: AlbumId) => boolean): PickedAlbum {
  const id = data().albums.findIndex(test);
  if (id < 0) throw new Error(`public/data/albums.json has no album ${what}`);
  return picked(id);
}

/** The service and URL the pages link to for an album that is not on Spotify but has another link (`listenLink`). */
export interface OtherService {
  /** As in COPY.listen.services, e.g. "YouTube". */
  name: string;
  /** The seed's button, e.g. "Open in YouTube". */
  open: string;
  url: string;
}

function otherServiceOf(a: AlbumRecord): OtherService {
  const link = listenLink({ spotifyId: a.s, links: a.l });
  if (!link || link.service === 'spotify') throw new Error(`${a.slug} has no link to a service other than Spotify`);
  const text = listenText(link.service);
  return { name: text.short, open: text.open, url: link.url };
}

let bulk: ((id: AlbumId) => boolean) | null = null;
/**
 * Whether the album sits in the middle of the balanced map (between the 10th and 90th percentile on both axes).
 * A map test that flies to an album picks one of these: beside an album at the very edge of the map the idle
 * camera eases back toward the cloud after the fly (CameraBounds), which takes seconds in software rendering.
 */
function inBulkOfMap(id: AlbumId): boolean {
  if (!bulk) {
    const xy = readJson<Positions>('positions.json').balanced;
    const range = (offset: number): [number, number] => {
      const v = xy.filter((_, i) => i % 2 === offset).sort((a, b) => a - b);
      return [v[Math.floor(0.1 * (v.length - 1))], v[Math.floor(0.9 * (v.length - 1))]];
    };
    const [x0, x1] = range(0);
    const [y0, y1] = range(1);
    bulk = (i) => xy[2 * i] >= x0 && xy[2 * i] <= x1 && xy[2 * i + 1] >= y0 && xy[2 * i + 1] <= y1;
  }
  return bulk(id);
}

/**
 * The first album with no place to listen at all: no Spotify release and no other link. One with audio, so its
 * page lists albums. `onMap`: one in the middle of the map, for a test that flies to it.
 */
export function albumWithNoLink({ onMap = false } = {}): PickedAlbum {
  return firstAlbum('without any listen link (and with audio)', (a, id) => hasNoLink(a) && !a.n && (!onMap || inBulkOfMap(id)));
}

/** The first album that is not on Spotify but has a link to another service, with that link. `onMap` as above. */
export function albumOnAnotherService({ onMap = false } = {}): PickedAlbum & { listen: OtherService } {
  const album = firstAlbum('with a listen link but no Spotify release', (a, id) => hasOtherService(a) && !a.n && (!onMap || inBulkOfMap(id)));
  return { ...album, listen: otherServiceOf(data().albums[album.id]) };
}

/**
 * The first album whose closest row at `stop` is an album on another service only, with that row's link, so a
 * test can see a row that links out to a service other than Spotify.
 */
export function albumWhoseFirstRecIsOnAnotherService(stop: StopId): { slug: string; first: ExpectedRec; listen: OtherService } {
  const { albums, recs } = data();
  for (let id = 0; id < albums.length; id++) {
    const a = recs[stop][id][0];
    if (a !== undefined && hasOtherService(albums[a])) return { slug: albums[id].slug, first: recsOf(albums[id].slug, stop)[0], listen: otherServiceOf(albums[a]) };
  }
  throw new Error(`no album's first ${stop} row is an album on another service only`);
}

/** The first album without audio (`n`): no sonic or balanced rows, ten mood rows. */
export function albumWithoutAudio(): PickedAlbum {
  return firstAlbum('without audio', (a) => a.n === 1);
}

/**
 * The first album whose title is in another script with a Latin form in square brackets after it
 * (`native [Latin]`), with the two parts of the title as the page splits them.
 */
export function albumWithBracketedTitle(): PickedAlbum & { native: string; bracket: string } {
  const startsNonLatin = (t: string) => {
    const first = t.match(/[\p{L}\p{N}]/u)?.[0];
    return first !== undefined && !isLatinChar(first);
  };
  const album = firstAlbum('with a bracketed title in another script', (a) => bracketStart(a.t) >= 0 && startsNonLatin(a.t));
  const at = bracketStart(album.title);
  return { ...album, native: album.title.slice(0, at).trimEnd(), bracket: album.title.slice(at) };
}

/** The number of the last atlas sheet, and the albums on it that have a cover id (their sprite is a cover, not a lettered tile). */
export function lastAtlasSheet(): { sheet: number; albums: PickedAlbum[] } {
  const { albums } = data();
  const sheet = atlasCount(albums.length) - 1;
  const out: PickedAlbum[] = [];
  for (let id = sheet * ATLAS_PER_SHEET; id < albums.length; id++) if (albums[id].c !== '') out.push(picked(id));
  return { sheet, albums: out };
}

/**
 * An album without a cover id that the search lists first for its own title and artist, with that query; null
 * when every album has a cover id (the pipeline keeps adding covers, so no album is named here).
 */
export function albumWithoutCover(): (PickedAlbum & { query: string }) | null {
  const { albums } = data();
  const index = buildSearchIndex(albums);
  for (let id = 0; id < albums.length; id++) {
    if (albums[id].c !== '') continue;
    const query = `${albums[id].t} ${albums[id].a}`.replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    // Typed into the search box as it is: plain Latin words only, and not so long that typing it is slow.
    if (!/^[a-z0-9 ]{3,40}$/.test(query)) continue;
    if (prefixSearch(index, query)[0]?.id === id) return { ...picked(id), query };
  }
  return null;
}

/** The first album whose cover is a Cover Art Archive one (`ca:<release-group MBID>`, served from public/covers), with that id. */
export function albumWithArchiveCover(): PickedAlbum & { mbid: string } {
  const album = firstAlbum('with a Cover Art Archive cover', (a) => a.c.startsWith('ca:'));
  return { ...album, mbid: data().albums[album.id].c.slice(3) };
}
