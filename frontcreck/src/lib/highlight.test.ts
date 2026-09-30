import { describe, expect, it } from 'vitest';
import { splitHighlights } from './highlight';

describe('splitHighlights', () => {
  it('splits text into marked and plain parts', () => {
    expect(splitHighlights('Björk', [{ start: 0, end: 2 }])).toEqual([
      { text: 'Bj', mark: true },
      { text: 'örk', mark: false },
    ]);
    expect(splitHighlights('In Rainbows', [{ start: 3, end: 7 }])).toEqual([
      { text: 'In ', mark: false },
      { text: 'Rain', mark: true },
      { text: 'bows', mark: false },
    ]);
    expect(splitHighlights('Kid A', [])).toEqual([{ text: 'Kid A', mark: false }]);
  });
});
