import type { CSSProperties } from 'react';
import type { AlbumId } from '@/lib/types';

/**
 * The one home of the sprite sheet geometry, shared with the data pipeline (data-pipeline/rmr_pipeline/images.py).
 * Thumbnails: 48 px sprites, 64 x 64 = 4,096 per 3072 px sheet; album i is on sheet floor(i / 4096).
 * Atlases (the map): 96 px sprites, 32 x 32 = 1,024 per 3072 px sheet; album i is on sheet floor(i / 1024).
 */
export const THUMB_COLS = 64;
export const THUMB_ROWS = 64;
export const THUMB_PX = 48;
export const THUMB_PER_SHEET = THUMB_COLS * THUMB_ROWS;
export const ATLAS_COLS = 32;
export const ATLAS_PX = 96;
export const ATLAS_PER_SHEET = ATLAS_COLS * ATLAS_COLS;
/** Edge of an atlas sheet in px. */
export const ATLAS_SHEET_PX = ATLAS_COLS * ATLAS_PX;
/**
 * Most atlas sheets the map can draw: one texture unit each, and 16 is what every WebGL2 fragment shader may
 * sample (MAX_TEXTURE_IMAGE_UNITS is at least 16). 16 sheets hold 16,384 albums; beyond that the sheets must
 * get denser or the shader must change (shaders/album.ts).
 */
export const MAX_ATLAS_SHEETS = 16;

/** Sheet 0 keeps the name it had when there was one sheet. */
export function thumbUrl(sheet: number): string {
  return sheet === 0 ? '/data/thumbs.webp' : `/data/thumbs-${sheet}.webp`;
}
export const THUMB_URL = thumbUrl(0);

export function thumbSheetOf(id: AlbumId): number {
  return Math.floor(id / THUMB_PER_SHEET);
}

export function atlasSheetOf(id: AlbumId): number {
  return Math.floor(id / ATLAS_PER_SHEET);
}

export interface AtlasSlot {
  sheet: number;
  /** left edge as a fraction of the sheet */
  u: number;
  /** top edge as a fraction of the sheet (row 0 at the top) */
  v: number;
  /** sprite size as a fraction of the sheet */
  size: number;
}

export function atlasUrl(sheet: number): string {
  return `/data/atlas-${sheet}.webp`;
}

export function atlasCount(n: number): number {
  return Math.ceil(n / ATLAS_PER_SHEET);
}

export function atlasSlot(id: AlbumId): AtlasSlot {
  const cell = id % ATLAS_PER_SHEET;
  return {
    sheet: atlasSheetOf(id),
    u: (cell % ATLAS_COLS) / ATLAS_COLS,
    v: Math.floor(cell / ATLAS_COLS) / ATLAS_COLS,
    size: 1 / ATLAS_COLS,
  };
}

/** CSS background for album `id` from its 48 px thumbnail sheet, at any element size. */
export function thumbStyle(id: AlbumId): CSSProperties {
  const cell = id % THUMB_PER_SHEET;
  const col = cell % THUMB_COLS;
  const row = Math.floor(cell / THUMB_COLS);
  return {
    backgroundImage: `url(${thumbUrl(thumbSheetOf(id))})`,
    backgroundSize: `${THUMB_COLS * 100}% ${THUMB_ROWS * 100}%`,
    backgroundPosition: `${(col / (THUMB_COLS - 1)) * 100}% ${(row / (THUMB_ROWS - 1)) * 100}%`,
  };
}
