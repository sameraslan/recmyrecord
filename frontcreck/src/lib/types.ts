/** Shared types for the static data contract (spec 6.2) and the client state. */
export const STOP_IDS = ['sonic', 'balanced', 'mood'] as const;
export type StopId = (typeof STOP_IDS)[number];
export const DEFAULT_STOP: StopId = 'balanced';

/** Index into albums.json. */
export type AlbumId = number;

/** [wash, wash, accent] as #rrggbb. The accent passes 4.5:1 on #15110d. */
export type Ambient = [string, string, string];

/** Listen links beyond Spotify, by service (see `listenLink` in data/catalog.ts for the URL of each). */
export interface ListenLinks {
  /** Apple Music: `<storefront>/<album id>` */
  am?: string;
  /** Bandcamp: host and path */
  bc?: string;
  /** Deezer album id */
  dz?: string;
  /** YouTube video id */
  yt?: string;
  /** SoundCloud path */
  sc?: string;
}

/** One row of public/data/albums.json. Keys in order: slug, t, a, s, c, k, d, w, then the optional l and n. */
export interface AlbumRecord {
  slug: string;
  /** title */
  t: string;
  /** artist */
  a: string;
  /** Spotify album id, 22 characters, or '' */
  s: string;
  /** cover id: '', a Spotify image id, or `dz:`, `am:`, `bc:`, `yt:` plus that host's reference (`coverUrl`) */
  c: string;
  /** cluster 0..7 */
  k: number;
  /** vocab indexes, strongest first (up to 10 in the first data set, up to 8 in the catalog build) */
  d: number[];
  w: Ambient;
  /** listen links beyond Spotify; present only when `s` is empty */
  l?: ListenLinks;
  /** 1 when the album has no audio: its sonic and balanced rows in recs.json are empty */
  n?: 1;
}

export type Vocab = string[];
/** Flat [x0, y0, x1, y1, ...] per stop, album order, values in [-1, 1]. */
export type Positions = Record<StopId, number[]>;
/** recs[stop][id] = 10 album ids, closest first; none at sonic and balanced for an album without audio. */
export type Recs = Record<StopId, AlbumId[][]>;

export interface Catalog {
  albums: AlbumRecord[];
  vocab: Vocab;
  bySlug: Map<string, AlbumId>;
}

export interface AlbumSummary {
  id: AlbumId;
  slug: string;
  title: string;
  artist: string;
  spotifyId: string;
  coverId: string;
  cluster: number;
  /** Only on albums that have listen links beyond Spotify. */
  links?: ListenLinks;
}

export interface RecRow extends AlbumSummary {
  /** 1-based rank at this stop */
  rank: number;
  /** up to 4 mood words shared with the seed, in the seed's order */
  shared: string[];
}

export interface SeedData extends AlbumSummary {
  /** up to 6 mood tags */
  tags: string[];
  ambient: Ambient;
  /** Only on an album without audio: it has mood recommendations only. */
  noAudio?: true;
}

export interface AlbumPageData {
  seed: SeedData;
  recs: Record<StopId, RecRow[]>;
}

/** What the map highlights in album view: the seed and the visible recommendations, in rank order. */
export interface Focus {
  seed: AlbumId;
  recs: AlbumId[];
}

/** Map camera in world units: the point at the centre of the visible map area, and the orthographic zoom. */
export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface TrailItem {
  slug: string;
  title: string;
}
