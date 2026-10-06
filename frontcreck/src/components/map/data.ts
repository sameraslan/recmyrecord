import { hexToRgb } from '@/lib/color';
import { MAX_ATLAS_SHEETS, atlasCount, atlasUrl } from '@/lib/data/sprites';
import { STOP_IDS } from '@/lib/types';
import type { AlbumRecord, Positions, StopId } from '@/lib/types';

/** Slider position of each stop in the shader (0 sonic, 0.5 balanced, 1 mood). */
export const STOP_T: Record<StopId, number> = { sonic: 0, balanced: 0.5, mood: 1 };

const rgb = (hex: string): [number, number, number] => hexToRgb(hex).map((v) => v / 255) as [number, number, number];

/** Dot colours by cluster k (k % 3: clay, moss, ochre), written straight to the framebuffer as sRGB literals. */
export const CLUSTER_RGB: [number, number, number][] = Array.from({ length: 8 }, (_, k) => rgb(['#c4886f', '#97a077', '#c8a560'][k % 3]));

export interface MapData {
  n: number;
  albums: AlbumRecord[];
  /** Normalised flat positions per stop, album order. */
  pos: Record<StopId, Float32Array>;
  atlasUrls: string[];
}

function quantile(sorted: Float64Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/** Centre on the balanced layout's median and scale its 5th..95th percentile extent to 0.55 world units
 * (the camera constants ported from the personal site assume this). The same transform is applied to all
 * three stops so the aligned layouts stay aligned. */
export function normalizePositions(p: Positions): Record<StopId, Float32Array> {
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
  const s = 0.55 / ext;
  const out = {} as Record<StopId, Float32Array>;
  for (const stop of STOP_IDS) {
    const src = p[stop];
    const f = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 2) {
      f[i] = (src[i] - cx) * s;
      f[i + 1] = (src[i + 1] - cy) * s;
    }
    out[stop] = f;
  }
  return out;
}

export function buildMapData(albums: AlbumRecord[], positions: Positions): MapData {
  for (const stop of STOP_IDS) {
    if (positions[stop].length !== albums.length * 2) {
      throw new Error(`positions.${stop} has ${positions[stop].length} numbers for ${albums.length} albums`);
    }
  }
  return {
    n: albums.length,
    albums,
    pos: normalizePositions(positions),
    // Sheets the map could not draw (shaders/album.ts) are not downloaded; their albums stay dots.
    atlasUrls: Array.from({ length: Math.min(atlasCount(albums.length), MAX_ATLAS_SHEETS) }, (_, i) => atlasUrl(i)),
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
