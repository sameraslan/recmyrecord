import { describe, expect, it } from 'vitest';
import { hexToRgb } from './color';

describe('hexToRgb', () => {
  it('parses #rrggbb in either case', () => {
    expect(hexToRgb('#15110d')).toEqual([21, 17, 13]);
    expect(hexToRgb('#E6A856')).toEqual([230, 168, 86]);
  });
});
