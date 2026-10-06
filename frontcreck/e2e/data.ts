import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlbumRecord, Recs, StopId } from '../src/lib/types';

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
 * same list as the img-src hosts of next.config.ts). Today's data only uses the first.
 */
export const COVER_HOSTS = ['i.scdn.co', 'cdn-images.dzcdn.net', 'is1-ssl.mzstatic.com', 'f4.bcbits.com', 'i.ytimg.com'] as const;
/** Any URL on a cover host: for `page.route` (holding or failing every remote cover) and for telling a failed cover from another failed request. */
export const COVER_URL_RE = new RegExp(`^https://(?:${COVER_HOSTS.map((h) => h.replaceAll('.', '\\.')).join('|')})/`);
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

/**
 * The first album whose closest row at `stop` has no Spotify release while its second row has one, so a test
 * can see a row without the Spotify link next to a row with it.
 */
export function albumWhoseFirstRecHasNoSpotify(stop: StopId): { slug: string; first: ExpectedRec; second: ExpectedRec } {
  const { albums, recs } = data();
  for (let id = 0; id < albums.length; id++) {
    const [a, b] = recs[stop][id];
    // An album without audio has no sonic or balanced rows.
    if (a === undefined || b === undefined) continue;
    if (albums[a].s === '' && albums[b].s !== '') {
      const [first, second] = recsOf(albums[id].slug, stop);
      return { slug: albums[id].slug, first, second };
    }
  }
  throw new Error(`no album's first ${stop} row is an album without a Spotify release (followed by one with a release)`);
}
