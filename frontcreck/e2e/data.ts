import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlbumRecord, Recs, StopId } from '../src/lib/types';

/**
 * The data the site under test was built from (public/data), read in the test process. Sonic and balanced
 * lists change whenever the pipeline rebuilds the audio features, so tests take those expectations from here
 * and never name a title. Mood lists barely depend on audio and stay pinned in the specs.
 */
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const readJson = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;

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
    if (albums[a].s === '' && albums[b].s !== '') {
      const [first, second] = recsOf(albums[id].slug, stop);
      return { slug: albums[id].slug, first, second };
    }
  }
  throw new Error(`no album's first ${stop} row is an album without a Spotify release (followed by one with a release)`);
}
