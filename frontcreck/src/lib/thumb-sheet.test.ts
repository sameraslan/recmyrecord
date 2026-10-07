import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadThumbSheet, resetThumbSheets, thumbSheetStatus } from './thumb-sheet';

class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.made.push(this);
  }
}

describe('thumbnail sheet loading, one status per sheet', () => {
  beforeEach(() => {
    FakeImage.made = [];
    vi.stubGlobal('Image', FakeImage);
    resetThumbSheets();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('requests only the sheet that is needed, once', () => {
    loadThumbSheet(2);
    loadThumbSheet(2);
    expect(FakeImage.made.map((i) => i.src)).toEqual(['/data/thumbs-2.webp']);
    expect(thumbSheetStatus(2)).toBe('loading');
    expect(thumbSheetStatus(0)).toBe('idle');
    expect(thumbSheetStatus(1)).toBe('idle');
  });

  it('keeps each sheet’s outcome apart', () => {
    loadThumbSheet();
    loadThumbSheet(1);
    expect(FakeImage.made.map((i) => i.src)).toEqual(['/data/thumbs.webp', '/data/thumbs-1.webp']);
    FakeImage.made[0].onerror?.();
    FakeImage.made[1].onload?.();
    expect(thumbSheetStatus(0)).toBe('error');
    expect(thumbSheetStatus(1)).toBe('ready');
    // A failure is final for the page.
    loadThumbSheet(0);
    expect(FakeImage.made).toHaveLength(2);
  });
});
