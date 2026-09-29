import { describe, expect, it } from 'vitest';
import { atlasCount, atlasSlot, atlasUrl, thumbStyle } from './sprites';

describe('sprite maths', () => {
  it('places albums on atlas sheets in index order', () => {
    expect(atlasSlot(0)).toEqual({ sheet: 0, u: 0, v: 0, size: 1 / 32 });
    expect(atlasSlot(33)).toEqual({ sheet: 0, u: 1 / 32, v: 1 / 32, size: 1 / 32 });
    expect(atlasSlot(1024 + 31)).toEqual({ sheet: 1, u: 31 / 32, v: 0, size: 1 / 32 });
    expect(atlasCount(4081)).toBe(4);
    expect(atlasUrl(2)).toBe('/data/atlas-2.webp');
  });

  it('positions a thumbnail with size-independent percentages', () => {
    expect(thumbStyle(0)).toEqual({ backgroundImage: 'url(/data/thumbs.webp)', backgroundSize: '6400% 6400%', backgroundPosition: '0% 0%' });
    expect(thumbStyle(63).backgroundPosition).toBe('100% 0%');
    expect(thumbStyle(64 * 63).backgroundPosition).toBe('0% 100%');
  });
});
