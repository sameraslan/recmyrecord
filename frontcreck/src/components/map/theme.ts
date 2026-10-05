/**
 * Constants of the nebula theme shared by the gas, the stars, the region names and the chrome.
 * Colours are sRGB bytes. The gas itself is baked with the same palette (scripts/theme/bake-core.js).
 */

/** The empty sky: the gas shader's SKY, vec3(.024, .022, .034), and the map pane's CSS background. */
export const SKY_RGB: [number, number, number] = [6, 6, 9];
/** The Ember palette, one hue per colour family: fierce, warm, quiet, dark, urban. */
export const EMBER_RGB: [number, number, number][] = [[232, 96, 60], [244, 190, 120], [150, 200, 214], [66, 110, 190], [120, 140, 220]];
/** Thin or mixed gas, and albums that no family leads. */
export const NEUTRAL_RGB: [number, number, number] = [138, 138, 146];
export const STAR_WHITE: [number, number, number] = [255, 250, 244];
/** The off-white accent (frames, focus rings); equals --color-lamp once the theme's CSS tokens are in. */
export const FRAME_RGB: [number, number, number] = [241, 236, 228];
/** Region names show, and the gas is at full strength, while covers are smaller than this (CSS px). */
export const NAMES_BAND_PX = 13;
/** Gas luminance that a byte of 255 in ThemeData.stars.bg stands for. */
export const GAS_LUM_MAX = 0.6;
