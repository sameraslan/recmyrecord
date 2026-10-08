/** WCAG 2 relative luminance and contrast ratio for #rrggbb colours. */
import { hexToRgb } from '@/lib/color';

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type Rgb = [number, number, number];
/** A see-through colour: `rgba(r, g, b, alpha)`. */
export interface Tint {
  rgb: Rgb;
  alpha: number;
}
/** The colour part of `backdrop-filter: blur(...) saturate(s) brightness(k)`. */
export interface GlassFilter {
  saturate: number;
  brightness: number;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, v));

export const rgbToHex = (rgb: Rgb): string => `#${rgb.map((c) => Math.round(clamp255(c)).toString(16).padStart(2, '0')).join('')}`;

/** CSS `saturate(s)` then `brightness(k)` on an sRGB colour, as `backdrop-filter` applies them (the filter
 * functions work on the sRGB values, each result clamped). A blur leaves a flat backdrop unchanged, so this is
 * what a glass panel sees of a uniformly bright area behind it. */
export function filterBackdrop([r, g, b]: Rgb, { saturate: s, brightness: k }: GlassFilter): Rgb {
  const sat = [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ];
  // Clamped between the two steps; a browser that folds both into one matrix may not. Same result for white and cream.
  return sat.map((c) => clamp255(clamp255(c) * k)) as Rgb;
}

/** `top` at `alpha` painted over the opaque `bottom` (source-over in sRGB, as the browser composites). */
export function paintOver(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

/** The colour a panel shows over `backdrop`, as #rrggbb: the backdrop filtered (glass) or left as it is
 * (`filter` null: the solid fallback has no backdrop-filter), then the panel's tint painted over it. */
export function surfaceOver(backdrop: Rgb, filter: GlassFilter | null, tint: Tint): string {
  return rgbToHex(paintOver(tint.rgb, tint.alpha, filter ? filterBackdrop(backdrop, filter) : backdrop));
}
