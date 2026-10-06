/** Shared types for the static data contract (spec 6.2) and the client state. */
export const STOP_IDS = ['sonic', 'balanced', 'mood'] as const;
export type StopId = (typeof STOP_IDS)[number];
export const DEFAULT_STOP: StopId = 'balanced';

/** Index into albums.json. */
export type AlbumId = number;

/** [wash, wash, accent] as #rrggbb. The pipeline checks the accent at 4.5:1 on #15110d; on the Trifid room #07060a it is 4.84:1 or better. */
export type Ambient = [string, string, string];

/** One row of public/data/albums.json. */
export interface AlbumRecord {
  slug: string;
  /** title */
  t: string;
  /** artist */
  a: string;
  /** Spotify album id, 22 characters, or '' */
  s: string;
  /** cover id: https://i.scdn.co/image/ + c, or '' */
  c: string;
  /** cluster 0..7 */
  k: number;
  /** up to 10 vocab indexes, strongest first */
  d: number[];
  w: Ambient;
}

export type Vocab = string[];
/** Flat [x0, y0, x1, y1, ...] per stop, album order, values in [-1, 1]. */
export type Positions = Record<StopId, number[]>;
/** recs[stop][id] = 10 album ids, closest first. */
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
