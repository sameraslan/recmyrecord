import type { CSSProperties } from 'react';
import type { AlbumId } from '@/lib/types';

export const THUMB_URL = '/data/thumbs.webp';
export const THUMB_COLS = 64;
export const THUMB_ROWS = 64;
export const THUMB_PX = 48;
export const ATLAS_COLS = 32;
export const ATLAS_PER_SHEET = 1024;
export const ATLAS_PX = 96;

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
    sheet: Math.floor(id / ATLAS_PER_SHEET),
    u: (cell % ATLAS_COLS) / ATLAS_COLS,
    v: Math.floor(cell / ATLAS_COLS) / ATLAS_COLS,
    size: 1 / ATLAS_COLS,
  };
}

/** CSS background for album `id` from the 48 px thumbnail sheet, at any element size. */
export function thumbStyle(id: AlbumId): CSSProperties {
  const col = id % THUMB_COLS;
  const row = Math.floor(id / THUMB_COLS);
  return {
    backgroundImage: `url(${THUMB_URL})`,
    backgroundSize: `${THUMB_COLS * 100}% ${THUMB_ROWS * 100}%`,
    backgroundPosition: `${(col / (THUMB_COLS - 1)) * 100}% ${(row / (THUMB_ROWS - 1)) * 100}%`,
  };
}
