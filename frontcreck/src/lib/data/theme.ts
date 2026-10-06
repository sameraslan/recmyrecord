import { fetchJson, idle, load, registerReset, type DataState } from '@/lib/data/client';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';

/** A region name on the map, in the raw units of positions.json (components/map/data.ts rawToWorld). */
export interface ThemeLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  strong: boolean;
  /** Albums in the region. */
  n: number;
  /** Priority: higher shows first. */
  p: number;
  /** Ink: near white with a breath of the gas colour under the name. */
  rgb: [number, number, number];
  /** Brightest gas luminance (0..1) in the name's box at Overview, at full gas strength. */
  lum: number;
  /** The same in a wider box, for the map zoomed out further (the Whole map in a short window): the name's box
   * at 400 px per world unit, where `lum`'s is at 600. Never under `lum`. Missing in a theme baked before it. The loader does not check it (this
   * file is in the first-load JS); state/namesLayout.ts takes anything but a number as missing. */
  lumWide?: number;
}

/** The baked gas of one stop. */
export interface ThemeGas {
  /** The raw rectangle both images cover: west, south, east, north. Outside it the stop is plain sky. */
  rect: [number, number, number, number];
  /** Width and height in px of the first image (the longer side is 2048). */
  px: [number, number];
  /** Width and height in px of the sharper image (no side over 4096). */
  sharp: [number, number];
  /** First 10 hex characters of the SHA-256 of the first image's bytes and of the sharper image's. They are part
   * of the file names (gas-<stop>.<hash>.webp, gas-<stop>-sharp.<hash>.webp), so this theme.json can only ever be
   * drawn with the images it was baked with. */
  hash: [string, string];
}

/** public/data/theme/theme.json, written by `npm run theme` (scripts/theme/build-theme.mjs). */
export interface ThemeData {
  v: 3;
  /** Album count the theme was built for. */
  n: number;
  /** First 12 hex characters of the SHA-256 of the positions.json it was built for. */
  positionsHash: string;
  /** All gas lies inside the raw square from -bakeHalf to bakeHalf on both axes. */
  bakeHalf: number;
  /** Per stop, its two gas images (components/map/shaders/gas.ts gasUrl). */
  gas: Record<StopId, ThemeGas>;
  stars: {
    /** Per album: leading colour family 0..4 (fierce, warm, quiet, dark, urban) or -1. */
    lead: number[];
    /** Per album, three bytes (sonic, balanced, mood): gas luminance 0..GAS_LUM_MAX at the album. */
    bg: number[];
  };
  labels: Record<StopId, ThemeLabel[]>;
}

export const THEME_URL = '/data/theme/theme.json';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

function isLabel(v: unknown): v is ThemeLabel {
  if (!v || typeof v !== 'object') return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    isNum(l.x) &&
    isNum(l.y) &&
    typeof l.strong === 'boolean' &&
    isNum(l.n) &&
    isNum(l.p) &&
    Array.isArray(l.rgb) &&
    l.rgb.length === 3 &&
    l.rgb.every((c) => isInt(c, 0, 255)) &&
    isNum(l.lum)
  );
}

function isGas(v: unknown, half: number): v is ThemeGas {
  if (!v || typeof v !== 'object') return false;
  const g = v as Record<string, unknown>;
  const size = (s: unknown, max: number): boolean => Array.isArray(s) && s.length === 2 && s.every((n) => isInt(n, 1, max));
  if (!Array.isArray(g.rect) || g.rect.length !== 4 || !g.rect.every((n) => isNum(n) && Math.abs(n) <= half)) return false;
  const [x0, y0, x1, y1] = g.rect as number[];
  // (the hashes go into URLs: nothing but lower-case hex)
  const hashes = Array.isArray(g.hash) && g.hash.length === 2 && g.hash.every((h) => typeof h === 'string' && /^[0-9a-f]{10}$/.test(h));
  return x0 < x1 && y0 < y1 && size(g.px, 2048) && size(g.sharp, 4096) && hashes;
}

export function isTheme(x: unknown): x is ThemeData {
  if (!x || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  if (t.v !== 3 || !isInt(t.n, 1, 1e6) || typeof t.positionsHash !== 'string' || !isNum(t.bakeHalf) || t.bakeHalf <= 0) return false;
  const n = t.n as number;
  const gas = t.gas as Record<string, unknown> | null | undefined;
  if (!gas || !STOP_IDS.every((s) => isGas(gas[s], t.bakeHalf as number))) return false;
  const stars = t.stars as { lead?: unknown; bg?: unknown } | null | undefined;
  if (!stars || !Array.isArray(stars.lead) || !Array.isArray(stars.bg)) return false;
  if (stars.lead.length !== n || stars.bg.length !== 3 * n) return false;
  if (!stars.lead.every((v) => isInt(v, -1, 4)) || !stars.bg.every((v) => isInt(v, 0, 255))) return false;
  const labels = t.labels as Record<string, unknown> | null | undefined;
  return !!labels && STOP_IDS.every((s) => Array.isArray(labels[s]) && (labels[s] as unknown[]).every(isLabel));
}

let theme = idle<ThemeData>();
registerReset(() => {
  theme = idle();
});

/**
 * theme.json, fetched once per page load. Call from effects or event handlers, never during render
 * (starting a load notifies subscribeData listeners synchronously). The map works without it.
 */
export function loadTheme(): Promise<ThemeData> {
  return load(
    () => theme,
    () => fetchJson<ThemeData>(THEME_URL, isTheme),
  );
}

export function peekTheme(): ThemeData | null {
  return theme.value;
}

export function themeState(): DataState {
  return theme.state;
}

/** The theme if it was built for this album count, else null: a stale bake must not colour the wrong albums. */
export function themeFor(loaded: ThemeData | null, n: number): ThemeData | null {
  return loaded && loaded.n === n ? loaded : null;
}
