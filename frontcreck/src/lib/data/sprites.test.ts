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

  it('handles row, sheet and catalog boundaries', () => {
    expect(atlasSlot(64)).toEqual({ sheet: 0, u: 0, v: 2 / 32, size: 1 / 32 });
    expect(atlasSlot(1023)).toEqual({ sheet: 0, u: 31 / 32, v: 31 / 32, size: 1 / 32 });
    expect(atlasSlot(1024)).toEqual({ sheet: 1, u: 0, v: 0, size: 1 / 32 });
    expect(atlasSlot(4080)).toEqual({ sheet: 3, u: 16 / 32, v: 31 / 32, size: 1 / 32 });
    expect(atlasCount(1024)).toBe(1);
    expect(atlasCount(1025)).toBe(2);
    const pos = (id: number) => String(thumbStyle(id).backgroundPosition).split(' ').map((p) => parseFloat(p));
    expect(pos(64)).toEqual([0, expect.closeTo(100 / 63, 9)]);
    expect(pos(1023)[0]).toBeCloseTo((63 / 63) * 100, 9);
    expect(pos(1023)[1]).toBeCloseTo((15 / 63) * 100, 9);
    expect(pos(4080)[0]).toBeCloseTo((48 / 63) * 100, 9);
    expect(pos(4080)[1]).toBe(100);
  });

  it('positions a thumbnail with size-independent percentages', () => {
    expect(thumbStyle(0)).toEqual({ backgroundImage: 'url(/data/thumbs.webp)', backgroundSize: '6400% 6400%', backgroundPosition: '0% 0%' });
    expect(thumbStyle(63).backgroundPosition).toBe('100% 0%');
    expect(thumbStyle(64 * 63).backgroundPosition).toBe('0% 100%');
  });
});
