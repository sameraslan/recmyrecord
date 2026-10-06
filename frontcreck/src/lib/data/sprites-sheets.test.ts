import { describe, expect, it } from 'vitest';
import { ATLAS_PER_SHEET, ATLAS_PX, ATLAS_SHEET_PX, MAX_ATLAS_SHEETS, THUMB_PER_SHEET, atlasCount, atlasSheetOf, atlasSlot, atlasUrl, thumbSheetOf, thumbStyle, thumbUrl } from './sprites';

/** Sprite geometry at catalog size (10,467 albums): several thumbnail sheets, eleven atlas sheets. */
describe('thumbnail sheets', () => {
  it('names sheet 0 as today and numbers the rest', () => {
    expect(thumbUrl(0)).toBe('/data/thumbs.webp');
    expect(thumbUrl(1)).toBe('/data/thumbs-1.webp');
    expect(thumbUrl(2)).toBe('/data/thumbs-2.webp');
  });

  it('puts album i on sheet floor(i / 4096), cell i % 4096', () => {
    expect(THUMB_PER_SHEET).toBe(4096);
    expect(thumbSheetOf(0)).toBe(0);
    expect(thumbSheetOf(4095)).toBe(0);
    expect(thumbSheetOf(4096)).toBe(1);
    expect(thumbSheetOf(8191)).toBe(1);
    expect(thumbSheetOf(8192)).toBe(2);
    expect(thumbSheetOf(10466)).toBe(2);
    expect(thumbStyle(4096)).toEqual({ backgroundImage: 'url(/data/thumbs-1.webp)', backgroundSize: '6400% 6400%', backgroundPosition: '0% 0%' });
    expect(thumbStyle(4096 + 63).backgroundPosition).toBe('100% 0%');
    expect(thumbStyle(8192 + 64 * 63).backgroundPosition).toBe('0% 100%');
    expect(thumbStyle(8192 + 65).backgroundImage).toBe('url(/data/thumbs-2.webp)');
    // The same cell on another sheet has the same position.
    expect(thumbStyle(10466).backgroundPosition).toBe(thumbStyle(10466 - 8192).backgroundPosition);
  });
});

describe('atlas sheets', () => {
  it('needs eleven sheets for 10,467 albums and places the last album', () => {
    expect(atlasCount(10467)).toBe(11);
    expect(atlasSlot(10466)).toEqual({ sheet: 10, u: ((10466 % 1024) % 32) / 32, v: Math.floor((10466 % 1024) / 32) / 32, size: 1 / 32 });
    expect(atlasSheetOf(10466)).toBe(10);
    expect(atlasSheetOf(1023)).toBe(0);
    expect(atlasUrl(10)).toBe('/data/atlas-10.webp');
  });

  it('keeps the sheet geometry in one place', () => {
    expect(ATLAS_SHEET_PX).toBe(3072);
    expect(ATLAS_SHEET_PX / ATLAS_PX).toBe(32);
    expect(ATLAS_PER_SHEET).toBe(1024);
  });

  it('has room for the catalog within the sheets a WebGL2 fragment shader can always sample', () => {
    expect(MAX_ATLAS_SHEETS).toBe(16);
    expect(atlasCount(10467)).toBeLessThanOrEqual(MAX_ATLAS_SHEETS);
  });
});
