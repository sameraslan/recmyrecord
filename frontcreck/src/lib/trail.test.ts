import { beforeEach, describe, expect, it } from 'vitest';
import { TRAIL_KEY, TRAIL_MAX, pushTrail, readTrail, visibleTrail, writeTrail } from './trail';

const it_ = (slug: string) => ({ slug, title: slug.toUpperCase() });

beforeEach(() => window.sessionStorage.clear());

describe('trail', () => {
  it('appends new albums and cuts back to a revisited one', () => {
    let t = pushTrail([], it_('a'));
    t = pushTrail(t, it_('b'));
    t = pushTrail(t, it_('c'));
    expect(t.map((x) => x.slug)).toEqual(['a', 'b', 'c']);
    expect(pushTrail(t, it_('b')).map((x) => x.slug)).toEqual(['a', 'b']);
    expect(pushTrail(t, it_('c')).map((x) => x.slug)).toEqual(['a', 'b', 'c']);
  });

  it('keeps at most TRAIL_MAX items', () => {
    let t: ReturnType<typeof pushTrail> = [];
    for (let i = 0; i < 20; i++) t = pushTrail(t, it_(`s${i}`));
    expect(t).toHaveLength(TRAIL_MAX);
    expect(t[0].slug).toBe('s8');
  });

  it('round-trips through sessionStorage and ignores junk', () => {
    writeTrail([it_('a')]);
    expect(readTrail()).toEqual([it_('a')]);
    window.sessionStorage.setItem(TRAIL_KEY, '{bad json');
    expect(readTrail()).toEqual([]);
    window.sessionStorage.setItem(TRAIL_KEY, JSON.stringify([{ slug: 1 }, it_('b')]));
    expect(readTrail()).toEqual([it_('b')]);
  });

  it('shows the last four and flags truncation', () => {
    const t = ['a', 'b', 'c', 'd', 'e'].map(it_);
    expect(visibleTrail(t).items.map((x) => x.slug)).toEqual(['b', 'c', 'd', 'e']);
    expect(visibleTrail(t).truncated).toBe(true);
    expect(visibleTrail(t.slice(0, 2)).truncated).toBe(false);
  });
});
