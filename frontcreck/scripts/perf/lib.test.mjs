import { describe, expect, it } from 'vitest';
import { checkBudgets, checkPages, compareRuns, fillBaseline, formatTable, glassVars, judgeRows, summarise } from './lib.mjs';

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

  it('fails GPU mode when the renderer could not be read', () => {
    for (const renderer of ['n/a', '', undefined]) {
      expect(checkBudgets({ ...ok, renderer }, 'gpu', budgets).join('\n'), String(renderer)).toMatch(/renderer could not be read/);
      expect(checkBudgets({ ...ok, renderer }, 'gpu', budgets, { allowSoftwareGpu: true }).join('\n')).toMatch(/renderer could not be read/);
      expect(checkBudgets({ ...ok, renderer }, 'software', budgets)).toEqual([]);
    }
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

  it('prints n/a for a reported-only value a run does not have, and the value when it does', () => {
    const none = formatTable([{ mode: 'gpu', ...ok }]);
    expect(none).toContain('| Nebula visible (reported only) | n/a |');
    expect(none).toContain('| Deep zoom drag worst frame gap (reported only) | n/a |');
    expect(none).toContain('| Deep zoom, slider between stops, worst frame gap (reported only) | n/a |');
    expect(none).toContain('| Drag worst frame gap at the opening view (reported only) | n/a |');
    expect(none).toContain('| Zoom worst frame gap at the opening view (reported only) | n/a |');
    const some = formatTable([{ mode: 'gpu', ...ok, gasShownMs: 640, deepDragGapMs: 21, deepMorphGapMs: 33, openingDragGapMs: 18, openingZoomGapMs: 24 }]);
    expect(some).toContain('| Nebula visible (reported only) | 640 ms |');
    expect(some).toContain('| Deep zoom drag worst frame gap (reported only) | 21 ms |');
    expect(some).toContain('| Deep zoom, slider between stops, worst frame gap (reported only) | 33 ms |');
    expect(some).toContain('| Drag worst frame gap at the opening view (reported only) | 18 ms |');
    expect(some).toContain('| Zoom worst frame gap at the opening view (reported only) | 24 ms |');
  });

  it('formats a markdown table', () => {
    const t = formatTable([{ mode: 'gpu', ...ok }]);
    expect(t.split('\n')[0]).toBe('| Measure | gpu desktop |');
  });
});

describe('glassVars', () => {
  const css = `:root { --panel-bg: rgba(8, 7, 11, 0.7); --top-bg: rgba(7, 6, 10, 0.58); --glass-blur: blur(22px) saturate(1.2) brightness(0.58); }
@theme { --color-float: rgba(10, 9, 14, 0.66); }
@media (max-width: 899px) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 1); --panel-bg: rgba(10, 9, 14, 1); --top-bg: rgba(10, 9, 14, 1); } }`;

  it('gives the first value of each property for glass and the last for solid', () => {
    expect(glassVars(css, 'on')).toEqual({
      '--glass-blur': 'blur(22px) saturate(1.2) brightness(0.58)',
      '--color-float': 'rgba(10, 9, 14, 0.66)',
      '--panel-bg': 'rgba(8, 7, 11, 0.7)',
      '--top-bg': 'rgba(7, 6, 10, 0.58)',
    });
    expect(glassVars(css, 'off')).toEqual({
      '--glass-blur': 'none',
      '--color-float': 'rgba(10, 9, 14, 1)',
      '--panel-bg': 'rgba(10, 9, 14, 1)',
      '--top-bg': 'rgba(10, 9, 14, 1)',
    });
  });

  it('rejects anything but on and off, and a stylesheet without both values', () => {
    expect(() => glassVars(css, 'maybe')).toThrow('--glass takes on or off');
    expect(() => glassVars(':root { --glass-blur: none; }', 'on')).toThrow('--glass-blur');
  });
});

describe('summarise and compareRuns', () => {
  const run = (drag, idle) => [{ mode: 'gpu', vp: 'desktop', dragGapMs: drag, idleFrames: idle, zoomGapMs: null }];

  it('takes the median, the best and the worst of each measure per mode and viewport', () => {
    const s = summarise([run(18, 0), run(34, 0), run(20, 1)]);
    expect(s['gpu desktop'].dragGapMs).toEqual({ median: 20, best: 18, worst: 34, n: 3 });
    expect(s['gpu desktop'].idleFrames).toEqual({ median: 0, best: 0, worst: 1, n: 3 });
    expect(s['gpu desktop'].zoomGapMs).toBeUndefined();
  });

  it('flags a measure only when its median is above the worst baseline run', () => {
    const base = summarise([run(18, 0), run(34, 0), run(20, 0)]);
    expect(compareRuns(base, summarise([run(30, 0), run(33, 1), run(36, 1)]))).toEqual([
      { where: 'gpu desktop', key: 'dragGapMs', baseMedian: 20, baseBest: 18, baseWorst: 34, median: 33, worse: false },
      { where: 'gpu desktop', key: 'idleFrames', baseMedian: 0, baseBest: 0, baseWorst: 0, median: 1, worse: true },
    ]);
  });

  it('keeps each column apart when files hold different columns, and keeps a measure that has no baseline', () => {
    // The baseline folder holds three files with the four old columns and three files made for the dpr 2 column.
    const dpr2 = (drag) => [{ mode: 'gpu', vp: 'desktop2x', dragGapMs: drag }];
    const base = summarise([run(18, 0), run(34, 0), run(20, 0), dpr2(30), dpr2(40), dpr2(35)]);
    expect(base['gpu desktop'].dragGapMs.n).toBe(3);
    expect(base['gpu desktop2x'].dragGapMs).toEqual({ median: 35, best: 30, worst: 40, n: 3 });
    const now = summarise([[{ mode: 'gpu', vp: 'desktop2x', dragGapMs: 38, gasShownMs: 700 }]]);
    expect(compareRuns(base, now)).toEqual([
      { where: 'gpu desktop2x', key: 'dragGapMs', baseMedian: 35, baseBest: 30, baseWorst: 40, median: 38, worse: false },
      { where: 'gpu desktop2x', key: 'gasShownMs', baseMedian: null, baseBest: null, baseWorst: null, median: 700, worse: false },
    ]);
  });

  it('summarises the two opening view rows, which an old baseline file does not have', () => {
    const now = summarise([[{ mode: 'gpu', vp: 'desktop', openingDragGapMs: 19, openingZoomGapMs: 41 }]]);
    expect(now['gpu desktop'].openingDragGapMs.median).toBe(19);
    expect(now['gpu desktop'].openingZoomGapMs.median).toBe(41);
    expect(compareRuns(summarise([run(18, 0)]), now).map((r) => [r.key, r.baseMedian])).toEqual([
      ['openingDragGapMs', null],
      ['openingZoomGapMs', null],
    ]);
  });
});

describe('fillBaseline', () => {
  const deep = (where, d) => { const [mode, vp] = where.split(' '); return [{ mode, vp, dragGapMs: 99, deepDragGapMs: d, deepMorphGapMs: d + 1 }]; };

  it('takes only the deep zoom rows from the extra baseline files, and only where the folder has none', () => {
    const folder = summarise([
      [{ mode: 'gpu', vp: 'desktop', dragGapMs: 18 }],
      [{ mode: 'gpu', vp: 'desktop2x', dragGapMs: 18, deepDragGapMs: 19, deepMorphGapMs: 17 }],
    ]);
    const extra = summarise([deep('gpu desktop', 17), deep('gpu desktop', 18), deep('gpu desktop', 21), deep('gpu desktop2x', 40), deep('gpu phone', 19)]);
    const filled = fillBaseline(folder, extra);
    expect(filled['gpu desktop'].deepDragGapMs).toEqual({ median: 18, best: 17, worst: 21, n: 3 });
    expect(filled['gpu desktop'].deepMorphGapMs.median).toBe(19);
    // The folder's own values win: its drag gap is not replaced, and neither are the dpr 2 column's deep rows.
    expect(filled['gpu desktop'].dragGapMs.median).toBe(18);
    expect(filled['gpu desktop2x'].deepDragGapMs).toEqual({ median: 19, best: 19, worst: 19, n: 1 });
    // A column only the extra files have gets its deep rows and nothing else.
    expect(Object.keys(filled['gpu phone'])).toEqual(['deepDragGapMs', 'deepMorphGapMs']);
    // The folder's summary is not changed in place.
    expect(folder['gpu desktop'].deepDragGapMs).toBeUndefined();
  });
});

describe('judgeRows', () => {
  const row = (over) => ({ where: 'gpu desktop', key: 'dragGapMs', baseMedian: 20, baseBest: 18, baseWorst: 22, median: 21, worse: false, ...over });

  it('prints n/a where the baseline has no value, and never calls such a row worse', () => {
    const { table, findings } = judgeRows(
      [
        { where: 'gpu desktop', key: 'openingDragGapMs', baseMedian: null, baseBest: null, baseWorst: null, median: 19, worse: false },
        { where: 'software desktop', key: 'gasShownMs', baseMedian: null, baseBest: null, baseWorst: null, median: 700, worse: false },
      ],
      budgets,
    );
    expect(table).toEqual([
      '| gpu desktop | openingDragGapMs | none (yardstick 50) | n/a | 19 | |',
      '| software desktop | gasShownMs | none | n/a | 700 | |',
    ]);
    expect(findings).toEqual([]);
  });

  it('flags a row that is worse than the baseline although it is inside its budget', () => {
    const { table, findings } = judgeRows([row({ median: 31, worse: true })], budgets);
    expect(table).toEqual(['| gpu desktop | dragGapMs | 50 | 20 (18 to 22) | 31 | WORSE |']);
    expect(findings).toEqual(['gpu desktop dragGapMs: median 31 is above the worst baseline run (22)']);
  });

  it('marks a median over its budget, and holds unbudgeted gpu gaps against the 50 ms yardstick only', () => {
    const { table, findings } = judgeRows(
      [
        row({ median: 20 }),
        row({ median: 61, worse: true }),
        row({ where: 'software desktop', median: 400, baseMedian: 95, baseBest: 85, baseWorst: 105, worse: true }),
        row({ where: 'gpu desktop2x', median: 55 }),
        row({ key: 'deepMorphGapMs', median: 52 }),
        row({ key: 'openingZoomGapMs', where: 'software desktop', median: 1177, baseMedian: null, baseBest: null, baseWorst: null }),
        row({ key: 'idleFrames', median: 2, baseMedian: 0, baseBest: 0, baseWorst: 0, worse: true }),
      ],
      budgets,
    );
    expect(table.map((l) => l.split(' | ').slice(-1)[0])).toEqual(['|', 'OVER BUDGET, WORSE |', 'WORSE |', 'OVER YARDSTICK |', 'OVER YARDSTICK |', '|', 'OVER BUDGET, WORSE |']);
    expect(table[2]).toContain('| software desktop | dragGapMs | none | 95 (85 to 105) | 400 |');
    expect(findings).toHaveLength(7);
    expect(findings[0]).toBe('gpu desktop dragGapMs: median 61 is over its budget of 50');
    expect(findings).toContain('gpu desktop2x dragGapMs: median 55 is over the 50 ms yardstick (not a budget)');
    expect(findings).toContain('gpu desktop idleFrames: median 2 is over its budget of 1');
  });
});
