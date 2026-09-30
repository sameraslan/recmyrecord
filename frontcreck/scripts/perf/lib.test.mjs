import { describe, expect, it } from 'vitest';
import { checkBudgets, checkPages, formatTable } from './lib.mjs';

const budgets = {
  searchUsableMs: 1000, startupLongTaskMs: 250, typeToSuggestionsMs: 100, selectToAlbumMs: 200,
  sliderToListMs: 150, frameGapMs: 50, idleLongTasks: 0, idleFrames: 1, firstLoadJsKb: 200, pageHtmlKb: 150,
};
const ok = {
  vp: 'desktop', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', errors: [],
  longTasksSupported: true, thumbsOnFirstLoad: false,
  searchUsableMs: 400, startupLongTaskMs: 120, typeToSuggestionsMs: 30, selectToAlbumMs: 90, sliderToListMs: 20,
  transitionGapMs: 30, morphGapMs: 25, dragGapMs: 20, zoomGapMs: 22, idleLongTasks: 0, idleFrames: 0,
};

describe('checkBudgets', () => {
  it('passes a result inside every budget', () => {
    expect(checkBudgets(ok, 'gpu', budgets)).toEqual([]);
  });

  it('reports every breach with its mode and viewport', () => {
    const bad = { ...ok, typeToSuggestionsMs: 180, idleLongTasks: 2, dragGapMs: 90, errors: ['boom'] };
    const fails = checkBudgets(bad, 'gpu', budgets);
    expect(fails).toHaveLength(4);
    expect(fails[0]).toMatch(/^gpu desktop: typing to suggestions 180 ms > 100 ms$/);
  });

  it('ignores frame gaps in software mode but not in GPU mode', () => {
    const slow = { ...ok, renderer: 'ANGLE (Google, SwiftShader Device)', dragGapMs: 400 };
    expect(checkBudgets(slow, 'software', budgets)).toEqual([]);
    expect(checkBudgets(slow, 'gpu', budgets).join('\n')).toMatch(/without a GPU/);
    expect(checkBudgets(slow, 'gpu', budgets, { allowSoftwareGpu: true }).join('\n')).toMatch(/drag frame gap/);
  });

  it('fails when the map keeps rendering while idle', () => {
    expect(checkBudgets({ ...ok, idleFrames: 40 }, 'software', budgets)[0]).toMatch(/40 frames while idle/);
  });

  it('treats a missing measurement as a failure', () => {
    expect(checkBudgets({ ...ok, selectToAlbumMs: null }, 'software', budgets)[0]).toMatch(/select to album/);
    expect(checkBudgets({ ...ok, idleLongTasks: undefined }, 'software', budgets).join('\n')).toMatch(/long tasks while idle/);
    expect(checkBudgets({ ...ok, longTasksSupported: false }, 'software', budgets).join('\n')).toMatch(/long tasks could not be measured/);
  });

  it('fails when the thumbnail sprite loads with the page', () => {
    expect(checkBudgets({ ...ok, thumbsOnFirstLoad: true }, 'software', budgets).join('\n')).toMatch(/thumbs\.webp/);
  });
});

describe('checkPages', () => {
  it('passes small pages that show only their own albums', () => {
    expect(checkPages([{ path: '/', kb: 60, unrelatedSlug: null }], budgets)).toEqual([]);
  });

  it('reports a heavy page and a leaked catalog', () => {
    const fails = checkPages([{ path: '/', kb: 900, unrelatedSlug: 'zz-album-zz-artist' }], budgets);
    expect(fails).toHaveLength(2);
    expect(fails.join('\n')).toMatch(/900 KB > 150 KB/);
    expect(fails.join('\n')).toMatch(/zz-album-zz-artist/);
  });

  it('formats a markdown table', () => {
    const t = formatTable([{ mode: 'gpu', ...ok }]);
    expect(t.split('\n')[0]).toBe('| Measure | gpu desktop |');
  });
});
