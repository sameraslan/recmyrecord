import { MAX_ATLAS_SHEETS, atlasCount, atlasUrl } from '@/lib/data/sprites';
import { STOP_IDS } from '@/lib/types';
import type { AlbumRecord, Positions, StopId } from '@/lib/types';

/** Slider position of each stop in the shader (0 sonic, 0.5 balanced, 1 mood). */
export const STOP_T: Record<StopId, number> = { sonic: 0, balanced: 0.5, mood: 1 };

/** Raw layout units (positions.json) to world units: world = (raw - centre) * s. */
export interface MapTransform {
  cx: number;
  cy: number;
  s: number;
}

export interface MapData {
  n: number;
  albums: AlbumRecord[];
  /** Normalised flat positions per stop, album order. */
  pos: Record<StopId, Float32Array>;
  atlasUrls: string[];
  /** The transform that made `pos`; theme data stored in raw units goes through rawToWorld. */
  tx: MapTransform;
}

function quantile(sorted: Float64Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/** Centre on the balanced layout's median and scale its 5th..95th percentile extent to 0.55 world units
 * (the camera constants ported from the personal site assume this). */
export function positionsTransform(p: Positions): MapTransform {
  const b = p.balanced;
  const n = b.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = b[2 * i];
    ys[i] = b[2 * i + 1];
  }
  xs.sort();
  ys.sort();
  const cx = quantile(xs, 0.5);
  const cy = quantile(ys, 0.5);
  const ext = Math.max(quantile(xs, 0.95) - cx, cx - quantile(xs, 0.05), quantile(ys, 0.95) - cy, cy - quantile(ys, 0.05)) || 1;
  return { cx, cy, s: 0.55 / ext };
}

/** The same transform is applied to all three stops so the aligned layouts stay aligned. */
export function normalizePositions(p: Positions, tx: MapTransform = positionsTransform(p)): Record<StopId, Float32Array> {
  const out = {} as Record<StopId, Float32Array>;
  for (const stop of STOP_IDS) {
    const src = p[stop];
    const f = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 2) {
      f[i] = (src[i] - tx.cx) * tx.s;
      f[i + 1] = (src[i + 1] - tx.cy) * tx.s;
    }
    out[stop] = f;
  }
  return out;
}

/** A point in raw layout units (region centres, the gas bake square) in the world units of `data.pos`. */
export function rawToWorld(data: Pick<MapData, 'tx'>, x: number, y: number): [number, number] {
  return [(x - data.tx.cx) * data.tx.s, (y - data.tx.cy) * data.tx.s];
}

export function buildMapData(albums: AlbumRecord[], positions: Positions): MapData {
  for (const stop of STOP_IDS) {
    if (positions[stop].length !== albums.length * 2) {
      throw new Error(`positions.${stop} has ${positions[stop].length} numbers for ${albums.length} albums`);
    }
  }
  const tx = positionsTransform(positions);
  return {
    n: albums.length,
    albums,
    pos: normalizePositions(positions, tx),
    // Sheets the map could not draw (shaders/album.ts) are not downloaded; their albums stay stars.
    atlasUrls: Array.from({ length: Math.min(atlasCount(albums.length), MAX_ATLAS_SHEETS) }, (_, i) => atlasUrl(i)),
    tx,
  };
}

/** Positions at slider t (piecewise linear sonic..balanced..mood), written into `out`. */
export function interpolateInto(out: Float32Array, data: MapData, t: number): Float32Array {
  const lo = t <= 0.5;
  const a = lo ? data.pos.sonic : data.pos.balanced;
  const b = lo ? data.pos.balanced : data.pos.mood;
  const f = lo ? t * 2 : (t - 0.5) * 2;
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * f;
  return out;
}

export function interpolated(data: MapData, t: number): Float32Array {
  return interpolateInto(new Float32Array(data.n * 2), data, t);
}
