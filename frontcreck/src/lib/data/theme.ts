import { fetchJson, idle, load, registerReset, type DataState } from '@/lib/data/client';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';

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

/** public/data/theme/theme.json as the map uses it, written by `npm run theme` (scripts/theme/build-theme.mjs).
 * In the file the two star lists are text (see readTheme); here they are numbers. */
export interface ThemeData {
  v: 4;
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
}

export const THEME_URL = '/data/theme/theme.json';

/** Where a stop's image is. `hash` is theme.json's gas.<stop>.hash: the first 10 hex characters of the SHA-256
 * of the first image and of the sharper one. The name changes whenever the content does, so a browser's cached
 * copy can never be an image of another bake (and next.config.ts lets browsers keep these files for good). */
export const gasUrl = (stop: StopId, hash: readonly [string, string], sharp = false): string =>
  `/data/theme/gas-${stop}${sharp ? '-sharp' : ''}.${hash[sharp ? 1 : 0]}.webp`;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

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

/** The stars as the file packs them: `lead` one character an album (0 to 4, or - for none), `bg` base64 of three
 * bytes an album. A number per album and stop made the file 126 KB at 10,467 albums; packed it is under half. */
function readStars(v: unknown, n: number): ThemeData['stars'] | null {
  const s = (v ?? {}) as { lead?: unknown; bg?: unknown };
  if (typeof s.lead !== 'string' || typeof s.bg !== 'string' || s.lead.length !== n || !/^[-0-4]*$/.test(s.lead)) return null;
  let bytes: string;
  try {
    bytes = atob(s.bg);
  } catch {
    return null;
  }
  if (bytes.length !== 3 * n) return null;
  return { lead: Array.from(s.lead, (c) => (c === '-' ? -1 : Number(c))), bg: Array.from(bytes, (c) => c.charCodeAt(0)) };
}

/** The theme a parsed theme.json holds, or null when it is not one this build can draw. */
export function readTheme(x: unknown): ThemeData | null {
  if (!x || typeof x !== 'object') return null;
  const t = x as Record<string, unknown>;
  if (t.v !== 4 || !isInt(t.n, 1, 1e6) || typeof t.positionsHash !== 'string' || !isNum(t.bakeHalf) || t.bakeHalf <= 0) return null;
  const gas = t.gas as Record<string, unknown> | null | undefined;
  if (!gas || !STOP_IDS.every((s) => isGas(gas[s], t.bakeHalf as number))) return null;
  const stars = readStars(t.stars, t.n as number);
  return stars && { v: 4, n: t.n as number, positionsHash: t.positionsHash, bakeHalf: t.bakeHalf, gas: gas as ThemeData['gas'], stars };
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
    () => {
      let read: ThemeData | null = null;
      return fetchJson<unknown>(THEME_URL, (v) => (read = readTheme(v)) !== null).then(() => read as unknown as ThemeData);
    },
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
