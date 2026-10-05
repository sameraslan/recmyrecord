/** The Trifid stars: every album is one star, drawn by the album sprite shader (shaders/album.ts). This file
 * holds the numbers, the random draw of star classes and the per-album attributes; the shader mirrors the
 * formulas. */
import type { ThemeData } from '@/lib/data/theme';
import { EMBER_RGB, STAR_WHITE } from '../theme';
import { DOT_BASE_PX, DOT_SCALE_PX, dotCssPx } from './zoomLimits';

/** Share of the albums in the three brighter classes (1% brightest, 9% bright, 27% medium); the rest are small
 * (class 3). Which album gets which class is a random draw on each page load (the prototype's STAR_MIX and
 * src/data.js). Album index, order and rank play no part, here or anywhere else. */
export const STAR_MIX = [0.01, 0.09, 0.27] as const;
/** Core radius per class, CSS px at the Overview scale (12.5 px covers). */
export const STAR_RADIUS = [2.8, 1.9, 1.4, 1.1] as const;
/** Bloom strength per class. */
export const STAR_GLOW = [1, 0.55, 0.16, 0.12] as const;
export const STAR_ALPHA = [1, 0.95, 0.85, 0.72] as const;
/** How far the bloom reaches, in core radii, once the map is zoomed in enough for wide halos. */
export const STAR_WIDE = [6, 4.4, 2.6, 2.6] as const;
/** Share of the leading family's hue in a star's colour; the rest is STAR_WHITE. */
export const STAR_TINT_MIX = 0.25;
/** The dark under-disc holds the gas beside a star to this luminance, with at most this alpha. */
export const STAR_UNDER_HOLD = 0.5;
export const STAR_UNDER_MAX = 0.26;
/** The dot diameter (state/zoomLimits.ts) when covers would be 12.5 px: star sizes are relative to it. */
export const DOT_AT_OVERVIEW = DOT_BASE_PX + 12.5 / DOT_SCALE_PX;

/** A source of random numbers in 0 (included) to 1 (not included). */
export type StarRandom = () => number;

/** A small seeded generator (mulberry32, the prototype's RMR.rng): the same seed gives the same numbers. */
export function seededRandom(seed: number): StarRandom {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many of `n` albums fall in each class: STAR_MIX rounded to whole albums, the rest in class 3. */
export function starCounts(n: number): [number, number, number, number] {
  const c0 = Math.min(n, Math.round(n * STAR_MIX[0]));
  const c1 = Math.min(n - c0, Math.round(n * STAR_MIX[1]));
  const c2 = Math.min(n - c0 - c1, Math.round(n * STAR_MIX[2]));
  return [c0, c1, c2, n - c0 - c1 - c2];
}

/** Deals a class (0 brightest to 3 small) to each of `n` albums: a Fisher-Yates shuffle of the albums by
 * `random`, then the first starCounts(n)[0] of the shuffled albums get class 0, and so on. Its only inputs are
 * the number of albums and the random source, so it cannot follow album order or rank. */
export function drawStarClasses(n: number, random: StarRandom): Uint8Array {
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const [c0, c1, c2] = starCounts(n);
  const classes = new Uint8Array(n);
  for (let k = 0; k < n; k++) classes[order[k]] = k < c0 ? 0 : k < c0 + c1 ? 1 : k < c0 + c1 + c2 ? 2 : 3;
  return classes;
}

let page: { seed: number; classes: Uint8Array } | null = null;

/** This page load's star classes for `n` albums. Drawn on first use from a fresh random seed and kept for the
 * life of the page: every later call returns the same array, so an album keeps its class through slider
 * moves, pans, zooms, a remounted map and a reloaded catalogue. The seed is published as window.__rmr.starSeed;
 * a test that needs a repeatable picture sets that value before the map loads. */
export function pageStarClasses(n: number): Uint8Array {
  if (page && page.classes.length === n) return page.classes;
  const hooks = typeof window === 'undefined' ? undefined : window.__rmr;
  const given = hooks?.starSeed;
  const seed = page ? page.seed : typeof given === 'number' && Number.isFinite(given) ? given >>> 0 : Math.floor(Math.random() * 4294967296);
  page = { seed, classes: drawStarClasses(n, seededRandom(seed)) };
  if (hooks) hooks.starSeed = seed;
  return page.classes;
}

/** Forgets the page's draw, as a new page load does. For unit tests only. */
export function resetPageStars(): void {
  page = null;
}

/** Star colour, 0..255: near white with a quarter of the leading colour family's hue. */
export function starTint(lead: number): [number, number, number] {
  const hue = Number.isInteger(lead) && lead >= 0 && lead < EMBER_RGB.length ? EMBER_RGB[lead] : STAR_WHITE;
  return [0, 1, 2].map((k) => Math.round(STAR_WHITE[k] * (1 - STAR_TINT_MIX) + hue[k] * STAR_TINT_MIX)) as [number, number, number];
}

/** Alpha of the dark under-disc for gas of luminance `gasLum` behind the star (JS mirror of the vertex shader). */
export function starUnder(gasLum: number): number {
  return Math.min(STAR_UNDER_MAX, Math.max(0, 1 - STAR_UNDER_HOLD / Math.max(gasLum, 0.001)));
}

/** Diameter of a star's core in CSS px (JS mirror of the vertex shader, before the dimmed map's enlargement). */
export function starCoreCssPx(cls: number, zoom: number, canvasHeightCssPx: number): number {
  return 2 * Math.max(0.8, (STAR_RADIUS[cls] * dotCssPx(zoom, canvasHeightCssPx)) / DOT_AT_OVERVIEW);
}

export interface StarAttributes {
  /** 4 per album: class radius, glow, alpha, halo reach. */
  star: Float32Array;
  /** 3 per album: star colour, 0..255. */
  tint: Uint8Array;
  /** 3 per album: gas luminance under it at sonic, balanced, mood; 0..255 for 0..GAS_LUM_MAX. */
  bg: Uint8Array;
}

function usable(theme: ThemeData | null, n: number): theme is ThemeData {
  return !!theme && theme.n === n && theme.stars.lead.length === n && theme.stars.bg.length === 3 * n;
}

/** Per-album star attributes for the dealt `classes` (one per album). The tint and the gas luminance come from
 * the theme data and do not depend on the class; without usable theme data every star is plain white with no
 * under-disc. */
export function buildStarAttributes(classes: Uint8Array, theme: ThemeData | null): StarAttributes {
  const n = classes.length;
  const star = new Float32Array(4 * n);
  const tint = new Uint8Array(3 * n);
  const bg = new Uint8Array(3 * n);
  const ok = usable(theme, n);
  for (let i = 0; i < n; i++) {
    const c = Math.min(3, classes[i]);
    star[4 * i] = STAR_RADIUS[c];
    star[4 * i + 1] = STAR_GLOW[c];
    star[4 * i + 2] = STAR_ALPHA[c];
    star[4 * i + 3] = STAR_WIDE[c];
    const t = ok ? starTint(theme.stars.lead[i]) : STAR_WHITE;
    tint[3 * i] = t[0];
    tint[3 * i + 1] = t[1];
    tint[3 * i + 2] = t[2];
    if (ok) for (let k = 0; k < 3; k++) bg[3 * i + k] = Math.min(255, Math.max(0, Math.round(theme.stars.bg[3 * i + k])));
  }
  return { star, tint, bg };
}
