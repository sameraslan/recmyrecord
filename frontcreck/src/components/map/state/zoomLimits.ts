/**
 * The one home of the map's zoom range and of the zoom-to-screen-size relations that the shader,
 * the camera, the atlas loader and the overlays share.
 *
 * World units are the normalised positions of `../data` (the balanced layout's 5th..95th percentile
 * spans ±0.55). The frustum is 2 * FRUSTUM_HALF_HEIGHT world units tall at zoom 1, so a canvas H CSS px
 * tall shows `pxPerWorld = H * zoom / (2 * FRUSTUM_HALF_HEIGHT)`.
 */

/** Half the frustum height in world units at zoom 1 (the width follows the canvas aspect). */
export const FRUSTUM_HALF_HEIGHT = 0.55;

/** Absolute zoom range. MIN is only a safety floor: the camera's real floor is 0.8x the fitted overview
 * (a phone fits the whole cloud at about 0.4).
 *
 * MAX is set by the map of 10,467 albums. Its positions lie on a grid of 0.001 layout units, about 0.00077
 * world units, and no two albums share a point (data-pipeline layout.py); the median distance from an album
 * to its nearest neighbour is about 0.0032 (0.0049 with 4,081 albums). Covers stop growing at COVER_MAX_PX
 * (zoom 12.4 on an 836 px canvas), so past that only the gaps grow. Two albums one grid step apart, side by
 * side or one above the other, are fully clear of each other once a step is at least a cover, 64 px: zoom 109
 * on a 1440 x 900 window (836 px canvas) and 116 on a 390 x 844 phone (784 px canvas). At 120 a step is 70 px
 * on that window and 66 px on that phone, so every album is clear of its nearest neighbour on both (the owner
 * asked for this after trying the map on his phone). The densest part of the map then shows two or three
 * covers on a phone. At 80 a step was 47 px and 89% of albums were clear; at the first 28, 53%. */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 120;
/** The fitted overview zoom is clamped to this range. */
export const FIT_ZOOM_MIN = MIN_ZOOM;
export const FIT_ZOOM_MAX = 5;
/** The visitor can zoom out to 0.8x the fitted overview, not further. */
export const MIN_ZOOM_FIT_MULTIPLE = 0.8;

/** Cover edge in world units, linear in the map scale up to COVER_MAX_PX as in the mockup. It was set as
 * 1.4x the median distance between an album and its nearest neighbour on the map of 4,081 albums (0.0049 in
 * the sonic and balanced layouts). With 10,467 albums that distance is about 0.0032, so a cover is about 2.1x
 * it: covers overlap while they grow and come apart past COVER_MAX_PX (see MAX_ZOOM). */
export const COVER_WORLD = 0.0068;
/** Cover cross-fade: covers start to show at 16 CSS px and are fully shown at 32. */
export const COVER_FADE_START_PX = 16;
export const COVER_FADE_END_PX = 32;
/** Largest cover on screen (atlas cells are 96 px). */
export const COVER_MAX_PX = 64;
/** Atlases start loading a little before covers start to show. */
export const ATLAS_LOAD_PX = 13;

/** Dot diameter in CSS px, the mockup's dots (radius clamp(.9 + k/600, 1.5, 3.6) for its scale k, where
 * its covers are 0.0105 k px): `clamp(1.8 + pxPerWorld * COVER_WORLD / 3.15, 3, 7.2)`. About 3 px at the
 * desktop and phone overviews, about 6.9 px as covers start, at most 7.2. */
export const DOT_BASE_PX = 1.8;
export const DOT_SCALE_PX = 3.15;
export const DOT_MIN_PX = 3;
export const DOT_MAX_PX = 7.2;

export function pxPerWorld(zoom: number, canvasHeightCssPx: number): number {
  return (canvasHeightCssPx * zoom) / (2 * FRUSTUM_HALF_HEIGHT);
}

/** Zoom at which one world unit spans `px` CSS px on a canvas `canvasHeightCssPx` tall. */
export function zoomForPxPerWorld(px: number, canvasHeightCssPx: number): number {
  return (px * 2 * FRUSTUM_HALF_HEIGHT) / Math.max(canvasHeightCssPx, 1);
}

/** Cover size in CSS px (before the cross-fade), linear in the map scale. */
export function coverCssPx(zoom: number, canvasHeightCssPx: number): number {
  return Math.min(COVER_MAX_PX, COVER_WORLD * pxPerWorld(zoom, canvasHeightCssPx));
}

/** Zoom at which covers are `px` CSS px (below COVER_MAX_PX). */
export function zoomForCoverPx(px: number, canvasHeightCssPx: number): number {
  return zoomForPxPerWorld(px / COVER_WORLD, canvasHeightCssPx);
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 0 = dots, 1 = covers fully shown (the shader's cross-fade, assuming the atlas sheet is loaded). */
export function coverFade(zoom: number, canvasHeightCssPx: number): number {
  return smoothstep(COVER_FADE_START_PX, COVER_FADE_END_PX, coverCssPx(zoom, canvasHeightCssPx));
}

export function dotCssPx(zoom: number, canvasHeightCssPx: number): number {
  const d = DOT_BASE_PX + (pxPerWorld(zoom, canvasHeightCssPx) * COVER_WORLD) / DOT_SCALE_PX;
  return Math.min(DOT_MAX_PX, Math.max(DOT_MIN_PX, d));
}
