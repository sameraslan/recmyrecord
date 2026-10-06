import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkBudgets, checkEffects, checkPages, checkRun, compareRuns, fillBaseline, formatTable, glassVars, isDpr2File, jsonExtras, judgeRows,
  pagesFromText, parseEffectFlags, rowsOfRun, settingsFindings, sizeFindings, sortRunFiles, summarise,
} from './lib.mjs';

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

  it('refuses a stylesheet whose last values are not the solid fallback', () => {
    // A later block with a third value would otherwise silently become "solid".
    expect(() => glassVars(`${css}\n@media (min-width: 2000px) { :root { --glass-blur: blur(8px); } }`, 'off')).toThrow('the last --glass-blur is not none');
    expect(() => glassVars(`${css}\n.x { --panel-bg: rgba(10, 9, 14, 0.9); }`, 'off')).toThrow('the last --panel-bg is not opaque');
    expect(() => glassVars(`${css}\n.x { --top-bg: #0a090e; }`, 'on')).toThrow('the last --top-bg is not opaque');
  });

  const realCss = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/globals.css'), 'utf8');
  const hasTokens = realCss.includes('--glass-blur');
  it.skipIf(!hasTokens)(`reads the real globals.css${hasTokens ? '' : ' (SKIPPED: the glass tokens of part 3 Task 1 are not on this branch yet)'}`, () => {
    const on = glassVars(realCss, 'on');
    const off = glassVars(realCss, 'off');
    expect(on['--glass-blur']).toMatch(/^blur\(/);
    expect(off['--glass-blur']).toBe('none');
    for (const name of ['--color-float', '--panel-bg', '--top-bg']) {
      expect(on[name], name).toMatch(/^rgba\(.*, 0?\.\d+\)$/);
      expect(off[name], name).toMatch(/^rgba\(.*, 1\)$/);
    }
  });
});

describe('summarise and compareRuns', () => {
  const run = (drag, idle) => [{ mode: 'gpu', vp: 'desktop', dragGapMs: drag, idleFrames: idle, zoomGapMs: null }];
  const NOW = { best: expect.any(Number), worst: expect.any(Number) };

  it('takes the median, the best and the worst of each measure per mode and viewport', () => {
    const s = summarise([run(18, 0), run(34, 0), run(20, 1)]);
    expect(s['gpu desktop'].dragGapMs).toEqual({ median: 20, best: 18, worst: 34, n: 3 });
    expect(s['gpu desktop'].idleFrames).toEqual({ median: 0, best: 0, worst: 1, n: 3 });
    expect(s['gpu desktop'].zoomGapMs).toBeUndefined();
  });

  it('takes the mean of the middle two for an even count, and the value itself for one run', () => {
    expect(summarise([run(18, 0), run(40, 0)])['gpu desktop'].dragGapMs).toEqual({ median: 29, best: 18, worst: 40, n: 2 });
    expect(summarise([run(30, 0), run(18, 0), run(40, 0), run(20, 0)])['gpu desktop'].dragGapMs).toEqual({ median: 25, best: 18, worst: 40, n: 4 });
    expect(summarise([run(19, 0)])['gpu desktop'].dragGapMs).toEqual({ median: 19, best: 19, worst: 19, n: 1 });
  });

  it('calls a median above the baseline median SLOWER and one above the worst baseline run WORSE', () => {
    // Rewritten in fix round 1. It used to assert that 33 against a baseline of 20 (18 to 34) was not a finding;
    // it now proves the opposite (slower), and still proves that WORSE is kept for a median above every baseline run.
    const base = summarise([run(18, 0), run(34, 0), run(20, 0)]);
    expect(compareRuns(base, summarise([run(30, 0), run(33, 1), run(36, 1)]))).toEqual([
      { where: 'gpu desktop', key: 'dragGapMs', baseMedian: 20, baseBest: 18, baseWorst: 34, baseN: 3, median: 33, best: 30, worst: 36, n: 3, runs: 3, worse: false, slower: true, missing: false },
      { where: 'gpu desktop', key: 'idleFrames', baseMedian: 0, baseBest: 0, baseWorst: 0, baseN: 3, median: 1, best: 0, worst: 1, n: 3, runs: 3, worse: true, slower: false, missing: false },
    ]);
  });

  it('does not call a tie slower or worse', () => {
    const base = summarise([run(18, 0), run(34, 0), run(20, 0)]);
    const [atMedian] = compareRuns(base, summarise([run(20, 0), run(20, 0), run(20, 0)]));
    expect([atMedian.slower, atMedian.worse]).toEqual([false, false]);
    // Equal to the worst baseline run: slower than the median, not above every baseline run.
    const [atWorst] = compareRuns(base, summarise([run(34, 0), run(34, 0), run(34, 0)]));
    expect([atWorst.slower, atWorst.worse]).toEqual([true, false]);
    const [faster] = compareRuns(base, summarise([run(17, 0), run(17, 0), run(18, 0)]));
    expect([faster.slower, faster.worse]).toEqual([false, false]);
  });

  it('keeps each column apart when files hold different columns, and keeps a measure that has no baseline', () => {
    // The baseline folder holds three files with the four old columns and three files made for the dpr 2 column.
    const dpr2 = (drag) => [{ mode: 'gpu', vp: 'desktop2x', dragGapMs: drag }];
    const base = summarise([dpr2(30), dpr2(40), dpr2(35)]);
    const both = summarise([run(18, 0), run(34, 0), run(20, 0), dpr2(30), dpr2(40), dpr2(35)]);
    expect(both['gpu desktop'].dragGapMs.n).toBe(3);
    expect(both['gpu desktop2x'].dragGapMs).toEqual({ median: 35, best: 30, worst: 40, n: 3 });
    const now = summarise([[{ mode: 'gpu', vp: 'desktop2x', dragGapMs: 38, gasShownMs: 700 }]]);
    expect(compareRuns(base, now)).toEqual([
      { where: 'gpu desktop2x', key: 'dragGapMs', baseMedian: 35, baseBest: 30, baseWorst: 40, baseN: 3, median: 38, best: 38, worst: 38, n: 1, runs: 1, worse: false, slower: true, missing: false },
      { where: 'gpu desktop2x', key: 'gasShownMs', baseMedian: null, baseBest: null, baseWorst: null, baseN: 0, median: 700, best: 700, worst: 700, n: 1, runs: 1, worse: false, slower: false, missing: false },
    ]);
  });

  it('summarises the two opening view rows, which an old baseline file does not have', () => {
    const now = summarise([[{ mode: 'gpu', vp: 'desktop', openingDragGapMs: 19, openingZoomGapMs: 41 }]]);
    expect(now['gpu desktop'].openingDragGapMs.median).toBe(19);
    expect(now['gpu desktop'].openingZoomGapMs.median).toBe(41);
    expect(compareRuns({}, now).map((r) => [r.key, r.baseMedian])).toEqual([
      ['openingDragGapMs', null],
      ['openingZoomGapMs', null],
    ]);
  });

  it('keeps a measure the baseline has and the current runs do not, as a missing row', () => {
    const base = summarise([run(18, 0), run(34, 0), run(20, 0)]);
    const now = summarise([[{ mode: 'gpu', vp: 'desktop', dragGapMs: 19 }]]);
    expect(compareRuns(base, now)).toMatchObject([
      { key: 'dragGapMs', median: 19, missing: false },
      { where: 'gpu desktop', key: 'idleFrames', baseMedian: 0, baseN: 3, median: null, best: null, worst: null, n: 0, missing: true, worse: false, slower: false },
    ]);
  });

  it('keeps a whole column the baseline has and the current runs do not', () => {
    const phone = [{ mode: 'gpu', vp: 'phone', dragGapMs: 19, idleFrames: 0 }];
    const rows = compareRuns(summarise([run(18, 0), phone]), summarise([run(18, 0)]));
    expect(rows.map((r) => [r.where, r.key, r.missing])).toEqual([
      ['gpu desktop', 'dragGapMs', false],
      ['gpu desktop', 'idleFrames', false],
      ['gpu phone', 'dragGapMs', true],
      ['gpu phone', 'idleFrames', true],
    ]);
  });

  it('carries how many runs gave a value, so a measure that failed in some runs cannot pass as a median of three', () => {
    const base = summarise([run(18, 0), run(34, 0), run(20, 0)]);
    const now = summarise([run(19, 0), run(null, 0), run(undefined, 0)]);
    expect(now['gpu desktop'].dragGapMs).toEqual({ median: 19, best: 19, worst: 19, n: 1 });
    const [drag, idle] = compareRuns(base, now);
    expect(drag).toMatchObject({ key: 'dragGapMs', n: 1, baseN: 3, runs: 3, ...NOW });
    expect(idle).toMatchObject({ key: 'idleFrames', n: 3, baseN: 3, runs: 3 });
    const { table, findings } = judgeRows([drag, idle], budgets);
    expect(table[0]).toContain('| 19 (19 to 19), n=1 |');
    expect(table[0]).toMatch(/FEWER RUNS \|$/);
    expect(findings).toEqual(['gpu desktop dragGapMs: a value in only 1 of 3 current runs (the baseline has 3)']);
  });
});

describe('fillBaseline', () => {
  const deep = (where, d) => { const [mode, vp] = where.split(' '); return [{ mode, vp, dragGapMs: 99, deepDragGapMs: d, deepMorphGapMs: d + 1 }]; };

  it('takes only the deep zoom rows from the extra baseline files, only where the folder has none, and marks them', () => {
    const folder = summarise([
      [{ mode: 'gpu', vp: 'desktop', dragGapMs: 18 }],
      [{ mode: 'gpu', vp: 'desktop2x', dragGapMs: 18, deepDragGapMs: 19, deepMorphGapMs: 17 }],
    ]);
    const extra = summarise([deep('gpu desktop', 17), deep('gpu desktop', 18), deep('gpu desktop', 21), deep('gpu desktop2x', 40), deep('gpu phone', 19)]);
    const filled = fillBaseline(folder, extra);
    expect(filled['gpu desktop'].deepDragGapMs).toEqual({ median: 18, best: 17, worst: 21, n: 3, extra: true });
    expect(filled['gpu desktop'].deepMorphGapMs.median).toBe(19);
    // The folder's own values win: its drag gap is not replaced, and neither are the dpr 2 column's deep rows.
    expect(filled['gpu desktop'].dragGapMs.median).toBe(18);
    expect(filled['gpu desktop2x'].deepDragGapMs).toEqual({ median: 19, best: 19, worst: 19, n: 1 });
    // A column only the extra files have gets its deep rows and nothing else.
    expect(Object.keys(filled['gpu phone'])).toEqual(['deepDragGapMs', 'deepMorphGapMs']);
    // The folder's summary is not changed in place.
    expect(folder['gpu desktop'].deepDragGapMs).toBeUndefined();
  });

  it('fills one measure while the other is already there, and never a software column', () => {
    const folder = summarise([[{ mode: 'gpu', vp: 'desktop', deepDragGapMs: 30 }], [{ mode: 'software', vp: 'desktop', dragGapMs: 95 }]]);
    const filled = fillBaseline(folder, summarise([deep('gpu desktop', 17), deep('software desktop', 60)]));
    expect(filled['gpu desktop'].deepDragGapMs).toEqual({ median: 30, best: 30, worst: 30, n: 1 });
    expect(filled['gpu desktop'].deepMorphGapMs).toEqual({ median: 18, best: 18, worst: 18, n: 1, extra: true });
    expect(Object.keys(filled['software desktop'])).toEqual(['dragGapMs']);
    // The mark reaches the comparison row and the table.
    const rows = compareRuns(filled, summarise([deep('gpu desktop', 17)]));
    expect(rows.find((r) => r.key === 'deepMorphGapMs').extra).toBe(true);
    expect(judgeRows(rows, budgets).table.find((l) => l.includes('deepMorphGapMs'))).toContain('| 18 (18 to 18), n=1 (extra) |');
  });
});

describe('judgeRows', () => {
  const row = (over) => ({ where: 'gpu desktop', key: 'dragGapMs', baseMedian: 20, baseBest: 18, baseWorst: 22, baseN: 3, median: 21, best: 20, worst: 22, n: 3, runs: 3, worse: false, slower: false, missing: false, ...over });
  const noBase = { baseMedian: null, baseBest: null, baseWorst: null, baseN: 0 };

  it('prints n/a where the baseline has no value, and never calls such a row worse', () => {
    const { table, findings } = judgeRows(
      [
        row({ key: 'openingDragGapMs', ...noBase, median: 19, best: 18, worst: 20 }),
        row({ where: 'software desktop', key: 'gasShownMs', ...noBase, median: 700, best: 700, worst: 700, n: 1, runs: 1 }),
      ],
      budgets,
    );
    expect(table).toEqual([
      '| gpu desktop | openingDragGapMs | none (yardstick 50) | n/a | 19 (18 to 20), n=3 | n/a | |',
      '| software desktop | gasShownMs | none | n/a | 700 (700 to 700), n=1 | n/a | |',
    ]);
    expect(findings).toEqual([]);
  });

  it('flags a row that is worse than the baseline although it is inside its budget', () => {
    const { table, findings } = judgeRows([row({ median: 31, best: 30, worst: 33, worse: true })], budgets);
    expect(table).toEqual(['| gpu desktop | dragGapMs | 50 | 20 (18 to 22), n=3 | 31 (30 to 33), n=3 | +11 (+55 %) | WORSE |']);
    expect(findings).toEqual(['gpu desktop dragGapMs: median 31 is above the worst baseline run (22)']);
  });

  it('flags a row that is slower than the baseline median although it is inside the baseline spread and its budget', () => {
    // The owner's rule: any number worse than baseline is a finding. 200 ms against a baseline of 0 (0 to 345).
    const { table, findings } = judgeRows([row({ key: 'startupLongTaskMs', baseMedian: 0, baseBest: 0, baseWorst: 345, median: 200, best: 180, worst: 240, slower: true })], budgets);
    expect(table).toEqual(['| gpu desktop | startupLongTaskMs | 250 | 0 (0 to 345), n=3 | 200 (180 to 240), n=3 | +200 | SLOWER |']);
    expect(findings).toEqual(['gpu desktop startupLongTaskMs: median 200 is above the baseline median (0), inside the baseline spread (0 to 345)']);
  });

  it('prints the difference for an equal and a faster row without a mark', () => {
    const { table, findings } = judgeRows([row({ median: 20 }), row({ median: 17, best: 16, worst: 18 })], budgets);
    expect(table[0]).toMatch(/\| 0 \| \|$/);
    expect(table[1]).toMatch(/\| -3 \(-15 %\) \| \|$/);
    expect(findings).toEqual([]);
  });

  it('marks a missing row and makes it a finding', () => {
    const { table, findings } = judgeRows([row({ key: 'idleFrames', baseMedian: 0, baseBest: 0, baseWorst: 0, median: null, best: null, worst: null, n: 0, missing: true })], budgets);
    expect(table).toEqual(['| gpu desktop | idleFrames | 1 | 0 (0 to 0), n=3 | n/a | n/a | MISSING |']);
    expect(findings).toEqual(['gpu desktop idleFrames: no value in the current runs (the baseline has one)']);
  });

  it('flags fewer runs than the baseline has', () => {
    const { table, findings } = judgeRows([row({ median: 20, n: 1, runs: 1 })], budgets);
    expect(table[0]).toMatch(/FEWER RUNS \|$/);
    expect(findings).toEqual(['gpu desktop dragGapMs: a value in only 1 of 1 current runs (the baseline has 3)']);
  });

  it('marks a median over its budget, and holds unbudgeted gpu gaps against the 50 ms yardstick only', () => {
    const { table, findings } = judgeRows(
      [
        row({ median: 20 }),
        row({ median: 61, worse: true }),
        row({ where: 'software desktop', median: 400, baseMedian: 95, baseBest: 85, baseWorst: 105, worse: true }),
        row({ where: 'gpu desktop2x', median: 55 }),
        row({ key: 'deepMorphGapMs', median: 52 }),
        row({ key: 'openingZoomGapMs', where: 'software desktop', median: 1177, ...noBase }),
        row({ key: 'idleFrames', median: 2, baseMedian: 0, baseBest: 0, baseWorst: 0, worse: true }),
      ],
      budgets,
    );
    expect(table.map((l) => l.split(' | ').slice(-1)[0])).toEqual(['|', 'OVER BUDGET, WORSE |', 'WORSE |', 'OVER YARDSTICK |', 'OVER YARDSTICK |', '|', 'OVER BUDGET, WORSE |']);
    expect(table[2]).toContain('| software desktop | dragGapMs | none | 95 (85 to 105), n=3 | 400 ');
    expect(findings).toHaveLength(7);
    expect(findings[0]).toBe('gpu desktop dragGapMs: median 61 is over its budget of 50');
    expect(findings).toContain('gpu desktop2x dragGapMs: median 55 is over the 50 ms yardstick (not a budget)');
    expect(findings).toContain('gpu desktop idleFrames: median 2 is over its budget of 1');
  });
});

describe('reading run files', () => {
  it('sorts the files by name with the dpr 2 files last, and takes only the dpr 2 column from those', () => {
    expect(isDpr2File('perf-dpr2-run1.json')).toBe(true);
    expect(isDpr2File('perf-run1.json')).toBe(false);
    expect(sortRunFiles(['perf-run2.json', 'perf-dpr2-run1.json', 'notes.json', 'perf-run1.json', 'perf-run1.txt', 'glass-on.json'])).toEqual(['perf-run1.json', 'perf-run2.json', 'perf-dpr2-run1.json']);
    const rows = [{ mode: 'gpu', vp: 'desktop', dragGapMs: 18 }, { mode: 'gpu', vp: 'desktop2x', dragGapMs: 19 }];
    expect(rowsOfRun({ file: 'perf-dpr2-run1.json', rows })).toEqual([rows[1]]);
    expect(rowsOfRun({ file: 'perf-run1.json', rows })).toEqual(rows);
  });

  it('refuses a file that is not a perf run, by name', () => {
    expect(() => checkRun('a.json', { rows: 'x' })).toThrow('a.json: not a perf JSON file (no rows)');
    expect(() => checkRun('a.json', { rows: [null] })).toThrow('a.json: row 1 is not a result with a mode and a viewport');
    expect(() => checkRun('a.json', { rows: [{ mode: 'gpu' }] })).toThrow('a.json: row 1 is not a result');
    expect(() => checkRun('a.json', null)).toThrow('a.json: not a perf JSON file');
  });

  it('reads a file of the old script and of the new one', () => {
    const old = checkRun('perf-run1.json', { js: { kb: 190.5, threeKb: 0 }, rows: [{ mode: 'gpu', vp: 'desktop' }], fails: ['x'] }, 'Server HTML: / 28.3 KB, /album/in-rainbows-radiohead 34 KB (budget 150 KB each)\n');
    expect(old).toMatchObject({ file: 'perf-run1.json', fails: ['x'], settings: '', pages: [{ path: '/', kb: 28.3 }, { path: '/album/in-rainbows-radiohead', kb: 34 }] });
    const now = checkRun('perf-run1.json', { js: { kb: 191 }, pages: [{ path: '/', kb: 29, unrelatedSlug: null }], rows: [], open: 'app', effects: { glass: 'off', twinkle: null, names: null }, flags: { noGas: true } });
    expect(now.pages).toEqual([{ path: '/', kb: 29 }]);
    expect(now.settings).toBe('open=app glass=off noGas');
    expect(checkRun('x.json', { rows: [] }).pages).toBeNull();
  });

  it('reads the page sizes from the console output of a run that did not save them', () => {
    expect(pagesFromText('First-load JS ...\nServer HTML: / 28.3 KB, /album/in-rainbows-radiohead 34 KB (budget 150 KB each)\n')).toEqual([
      { path: '/', kb: 28.3 },
      { path: '/album/in-rainbows-radiohead', kb: 34 },
    ]);
    expect(pagesFromText('nothing here')).toBeNull();
    expect(pagesFromText(null)).toBeNull();
  });
});

describe('sizeFindings', () => {
  const full = (kb, pages = [{ path: '/', kb: 28.3 }, { path: '/album/in-rainbows-radiohead', kb: 34 }], threeKb = 0) => ({ file: `perf-${kb}.json`, js: { kb, modernKb: kb - 38, threeKb }, pages });
  const base = [full(190.5), full(190.5), full(190.5)];

  it('finds nothing when the sizes equal the baseline', () => {
    const { lines, findings } = sizeFindings(base, base, budgets);
    expect(findings).toEqual([]);
    expect(lines[0]).toContain('baseline 190.5, 190.5, 190.5; now 190.5, 190.5, 190.5');
  });

  it('flags first-load JS above the baseline although it is inside the budget, with the difference', () => {
    const { lines, findings } = sizeFindings(base, [full(192.1), full(192.1), full(192.1)], budgets);
    expect(findings).toEqual(['first-load JS 192.1 KB is above the baseline (190.5 KB) by 1.6 KB; the budget is 200 KB']);
    expect(lines.join('\n')).toContain('+1.6 KB');
  });

  it('flags first-load JS over the budget and three.js in the first load, per run', () => {
    const { findings } = sizeFindings(base, [full(201, undefined, 12)], budgets);
    expect(findings).toContain('perf-201.json: first-load JS 201 KB is over 200 KB');
    expect(findings).toContain('perf-201.json: the three.js chunk (12 KB) is in the first load');
    expect(findings).toContain('1 full run(s) in the current set: the rule is about three');
  });

  it('flags a page whose server HTML grew, and one over the budget', () => {
    const grown = [{ path: '/', kb: 29.1 }, { path: '/album/in-rainbows-radiohead', kb: 151 }];
    const { findings } = sizeFindings(base, [full(190.5, grown), full(190.5, grown), full(190.5, grown)], budgets);
    expect(findings).toEqual([
      'server HTML of / is 29.1 KB, above the baseline (28.3 KB) by 0.8 KB; the budget is 150 KB',
      'server HTML of /album/in-rainbows-radiohead is 151 KB, above the baseline (34 KB) by 117 KB; the budget is 150 KB',
      'server HTML of /album/in-rainbows-radiohead is 151 KB, over 150 KB',
    ]);
  });

  it('says so when a side has no sizes instead of passing them', () => {
    const { findings } = sizeFindings(base, [{ file: 'a.json', js: null, pages: null }, full(190.5), full(190.5)], budgets);
    expect(findings).toContain('a.json: no first-load JS size in the file');
    expect(findings).toContain('a.json: no server HTML sizes in the file or in a .txt beside it');
    const noBasePages = sizeFindings([full(190.5, null)], base, budgets);
    expect(noBasePages.findings).toContain('the baseline has no server HTML sizes: the pages are judged against the budget only');
  });
});

describe('settingsFindings', () => {
  const r = (file, settings) => ({ file, settings });

  it('passes plain runs on both sides', () => {
    expect(settingsFindings([r('a', ''), r('b', '')], [r('c', 'open=app'), r('d', 'open=app')]).findings).toEqual([]);
  });

  it('flags a side whose runs were not all made the same way', () => {
    const { findings, lines } = settingsFindings([r('a', '')], [r('c', 'open=app'), r('d', 'open=app glass=off')]);
    expect(findings[0]).toBe('the current runs were not all made the same way: c (open=app), d (open=app glass=off)');
    expect(lines.join('\n')).toContain('d: open=app glass=off');
  });

  it('flags current runs made with a forcing flag, unless that is allowed', () => {
    const cur = [r('c', 'open=app glass=off'), r('d', 'open=app glass=off')];
    expect(settingsFindings([r('a', '')], cur).findings).toEqual(['the current runs were made with flags (open=app glass=off): not the site as a visitor gets it (pass --allow-flags for an A/B)']);
    expect(settingsFindings([r('a', '')], cur, { allowFlags: true }).findings).toEqual([]);
    expect(settingsFindings([r('a', '')], [r('c', 'open=whole noGas')]).findings).toHaveLength(1);
    // The baseline side may be a build measured with --no-gas --open whole (today's site); only its consistency counts.
    expect(settingsFindings([r('a', 'open=whole noGas')], [r('c', 'open=app')]).findings).toEqual([]);
  });
});

describe('perf.mjs flags', () => {
  it('reads on and off, and nothing when a flag is absent', () => {
    expect(parseEffectFlags([])).toEqual({ glass: null, twinkle: null, names: null });
    expect(parseEffectFlags(['--mode', 'gpu', '--glass', 'off', '--names', 'on'])).toEqual({ glass: 'off', twinkle: null, names: 'on' });
    expect(parseEffectFlags(['--twinkle', 'off'])).toEqual({ glass: null, twinkle: 'off', names: null });
  });

  it('refuses any other value and a flag with no value', () => {
    expect(() => parseEffectFlags(['--glass', 'maybe'])).toThrow('--glass takes on or off');
    expect(() => parseEffectFlags(['--names'])).toThrow('--names takes on or off');
    expect(() => parseEffectFlags(['--twinkle', '--glass', 'on'])).toThrow('--twinkle takes on or off');
  });

  it('adds nothing but `open` to the JSON of a run with no flag, and records every flag that was set', () => {
    expect(jsonExtras({ open: null, glass: null, twinkle: null, names: null, noGas: false, gasLite: null, allowSoftwareGpu: false })).toEqual({ open: 'app' });
    expect(Object.keys(jsonExtras({ open: null }))).toEqual(['open']);
    expect(jsonExtras({ open: 'whole', glass: 'off', twinkle: null, names: 'on', noGas: true, gasLite: 'off', allowSoftwareGpu: true })).toEqual({
      open: 'whole',
      effects: { glass: 'off', twinkle: null, names: 'on' },
      flags: { noGas: true, gasLite: 'off', allowSoftwareGpu: true },
    });
    expect(jsonExtras({ open: null, gasLite: 'force' })).toEqual({ open: 'app', flags: { gasLite: 'force' } });
  });
});

describe('checkEffects', () => {
  const vars = { '--glass-blur': 'none' };
  const seen = (over) => ({ at: 'map', glassBlur: 'none', header: 'none', panel: 'none', album: null, namesOn: false, forcedMs: 3, firstPaintMs: 120, ...over });
  const all = [seen({ at: 'album', album: 'none' }), seen(), seen({ at: 'opening view' })];

  it('passes when the page had what was forced', () => {
    expect(checkEffects('gpu desktop', all, { glass: 'off', names: 'off' }, vars)).toEqual([]);
    const blur = 'blur(22px) saturate(1.2) brightness(0.58)';
    const on = all.map((s) => ({ ...s, glassBlur: blur, header: blur, panel: blur, album: s.album && blur, namesOn: true }));
    expect(checkEffects('gpu desktop', on, { glass: 'on', names: 'on' }, { '--glass-blur': blur })).toEqual([]);
    expect(checkEffects('gpu desktop', all, { glass: null, names: null }, null)).toEqual([]);
  });

  it('fails a glass off run in which a surface still blurs, naming it', () => {
    const fails = checkEffects('gpu desktop', [all[0], seen({ panel: 'blur(22px)' }), all[2]], { glass: 'off', names: null }, vars);
    expect(fails).toEqual(['gpu desktop: forced effect not applied: --glass off, but the panel has backdrop-filter blur(22px) (map)']);
  });

  it('fails a glass on run in which a surface does not blur, or the property is not the forced one', () => {
    const blur = 'blur(22px)';
    const on = all.map((s) => ({ ...s, glassBlur: blur, header: blur, panel: blur, album: s.album && blur }));
    on[1] = { ...on[1], header: 'none', glassBlur: 'blur(14px)' };
    expect(checkEffects('gpu phone', on, { glass: 'on', names: null }, { '--glass-blur': blur })).toEqual([
      'gpu phone: forced effect not applied: --glass on, but --glass-blur is blur(14px), not blur(22px) (map)',
      'gpu phone: forced effect not applied: --glass on, but the header has backdrop-filter none (map)',
    ]);
  });

  it('fails when one of the three surfaces was never found, or the properties were set after first paint', () => {
    expect(checkEffects('gpu desktop', [seen(), seen({ at: 'opening view' })], { glass: 'off', names: null }, vars)).toEqual(['gpu desktop: forced effect not verified: --glass off, but the album panel was never found to read back']);
    expect(checkEffects('gpu desktop', [all[0], seen({ forcedMs: 400 }), seen({ at: 'opening view', forcedMs: null })], { glass: 'off', names: null }, vars)).toEqual([
      'gpu desktop: forced effect applied late: the glass properties were set at 400 ms, after first paint at 120 ms (map)',
      'gpu desktop: forced effect not applied: the glass properties were never set on <html> (opening view)',
    ]);
  });

  it('passes a twinkle run whose page did what was forced, read from the app and from the DOM', () => {
    const off = [seen({ at: 'album', twinkleOn: false, twinkleSpawned: 0, twinkleNodes: 0 }), seen({ twinkleOn: false, twinkleSpawned: 0, twinkleNodes: 0 })];
    expect(checkEffects('gpu desktop', off, { glass: null, names: null, twinkle: 'off' }, null)).toEqual([]);
    // On: the timer says enabled on every page, and at least one page had made a glint by the time it was read.
    const on = [seen({ at: 'album', twinkleOn: true, twinkleSpawned: 0, twinkleNodes: 0 }), seen({ twinkleOn: true, twinkleSpawned: 9, twinkleNodes: 2 })];
    expect(checkEffects('gpu desktop', on, { glass: null, names: null, twinkle: 'on' }, null)).toEqual([]);
    expect(checkEffects('gpu desktop', on, { glass: null, names: null, twinkle: null }, null)).toEqual([]);
  });

  it('fails a twinkle run in which the app ignored the switch, has no twinkle, or never made a glint', () => {
    const want = (twinkle) => ({ glass: null, names: null, twinkle });
    expect(checkEffects('gpu desktop', [seen({ twinkleOn: true, twinkleSpawned: 4, twinkleNodes: 1 })], want('off'))).toEqual([
      'gpu desktop: forced effect not applied: --twinkle off, but the glints\' timer reads enabled true (map)',
      'gpu desktop: forced effect not applied: --twinkle off, but 4 glints were made and 1 are on the page (map)',
    ]);
    // An app without the twinkle (or with its hook renamed) publishes nothing: that is not "off", it is unverified.
    expect(checkEffects('gpu desktop', [seen({ twinkleOn: null, twinkleSpawned: null, twinkleNodes: null })], want('off'))).toEqual([
      'gpu desktop: forced effect not applied: --twinkle off, but the glints\' timer reads enabled null (map)',
    ]);
    expect(checkEffects('gpu desktop', [seen({ twinkleOn: false, twinkleSpawned: 0, twinkleNodes: 0 })], want('on'))).toEqual([
      'gpu desktop: forced effect not applied: --twinkle on, but the glints\' timer reads enabled false (map)',
      'gpu desktop: forced effect not verified: --twinkle on, but no glint had been made on any page read back',
    ]);
    expect(checkEffects('gpu desktop', [seen({ twinkleOn: true, twinkleSpawned: 0, twinkleNodes: 0 })], want('on'))).toEqual([
      'gpu desktop: forced effect not verified: --twinkle on, but no glint had been made on any page read back',
    ]);
  });

  it('fails a names run in which the store disagrees', () => {
    expect(checkEffects('gpu desktop', [seen({ namesOn: true })], { glass: null, names: 'off' }, null)).toEqual(['gpu desktop: forced effect not applied: --names off, but the store has namesOn true (map)']);
    expect(checkEffects('gpu desktop', [seen({ namesOn: null })], { glass: null, names: 'on' }, null)).toEqual(['gpu desktop: forced effect not applied: --names on, but the store has namesOn null (map)']);
  });
});

describe('compare.mjs', () => {
  const script = path.join(import.meta.dirname, 'compare.mjs');
  const runIt = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: 'utf8' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmr-compare-'));
  const write = (sub, name, { drag = 19, kb = 190.5, extra = {}, rows } = {}) => {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    const json = { js: { kb, modernKb: 151.9, threeKb: 0, files: [] }, pages: [{ path: '/', kb: 28.3 }], rows: rows ?? [{ mode: 'gpu', vp: 'desktop', dragGapMs: drag, idleFrames: 0 }], fails: [], ...extra };
    fs.writeFileSync(path.join(dir, sub, name), JSON.stringify(json));
  };
  for (const i of [1, 2, 3]) {
    write('base', `perf-run${i}.json`, { drag: 18 + i });
    write('same', `perf-run${i}.json`, { drag: 18 + i });
    write('slow', `perf-run${i}.json`, { drag: 20 + i });
    write('big', `perf-run${i}.json`, { drag: 18 + i, kb: 192 });
    write('forced', `perf-run${i}.json`, { drag: 18 + i, extra: { open: 'app', effects: { glass: 'off', twinkle: null, names: null } } });
    write('nocol', `perf-run${i}.json`, { rows: [{ mode: 'gpu', vp: 'phone', dragGapMs: 19, idleFrames: 0 }] });
  }
  // A dpr 2 file that also holds a desktop row: that row must not reach the desktop column.
  write('base', 'perf-dpr2-run1.json', { rows: [{ mode: 'gpu', vp: 'desktop', dragGapMs: 900 }, { mode: 'gpu', vp: 'desktop2x', dragGapMs: 18 }] });
  write('same', 'perf-dpr2-run1.json', { rows: [{ mode: 'gpu', vp: 'desktop', dragGapMs: 900 }, { mode: 'gpu', vp: 'desktop2x', dragGapMs: 18 }] });
  write('forced', 'perf-dpr2-run1.json', { rows: [{ mode: 'gpu', vp: 'desktop2x', dragGapMs: 18 }], extra: { open: 'app', effects: { glass: 'off', twinkle: null, names: null } } });
  fs.writeFileSync(path.join(dir, 'bad.json'), '{"rows":[null]}');

  it('exits 0 and says so when nothing is worse', () => {
    const r = runIt(path.join(dir, 'base'), path.join(dir, 'same'));
    expect(r.stdout).toContain('No finding');
    expect(r.stdout).toContain('| gpu desktop | dragGapMs | 50 | 20 (19 to 21), n=3 | 20 (19 to 21), n=3 | 0 | |');
    expect(r.stdout).toContain('| gpu desktop2x | dragGapMs | none (yardstick 50) | 18 (18 to 18), n=1 | 18 (18 to 18), n=1 | 0 | |');
    expect(r.status).toBe(0);
  });

  it('exits 1 on a slower median inside its budget, and 0 with --no-fail', () => {
    const r = runIt(path.join(dir, 'base'), path.join(dir, 'slow'));
    expect(r.stdout).toContain('gpu desktop dragGapMs: median 22 is above the worst baseline run (21)');
    expect(r.status).toBe(1);
    const soft = runIt(path.join(dir, 'base'), path.join(dir, 'slow'), '--no-fail');
    expect(soft.stdout).toContain('Findings (');
    expect(soft.status).toBe(0);
  });

  it('exits 1 when first-load JS grew inside its budget', () => {
    const r = runIt(path.join(dir, 'base'), path.join(dir, 'big'));
    expect(r.stdout).toContain('first-load JS 192 KB is above the baseline (190.5 KB) by 1.5 KB');
    expect(r.status).toBe(1);
  });

  it('exits 1 when a column of the baseline is not in the current runs', () => {
    const r = runIt(path.join(dir, 'base'), path.join(dir, 'nocol'));
    expect(r.stdout).toContain('gpu desktop dragGapMs: no value in the current runs');
    expect(r.stdout).toMatch(/\| gpu desktop \| idleFrames \|.*MISSING \|/);
    expect(r.status).toBe(1);
  });

  it('exits 1 for runs made with a forcing flag unless --allow-flags is given', () => {
    expect(runIt(path.join(dir, 'base'), path.join(dir, 'forced')).status).toBe(1);
    const ok = runIt(path.join(dir, 'base'), path.join(dir, 'forced'), '--allow-flags');
    expect(ok.stdout).toContain('glass=off');
    expect(ok.status).toBe(0);
  });

  it('compares one column alone with --only, and refuses a column neither side has', () => {
    // Without it the baseline's other columns are MISSING in a current set made for one column.
    expect(runIt(path.join(dir, 'base'), path.join(dir, 'nocol'), '--only=gpu phone').stdout).not.toContain('MISSING');
    const r = runIt(path.join(dir, 'base'), path.join(dir, 'slow'), '--only=gpu desktop');
    expect(r.stdout).toContain('Only the column gpu desktop');
    expect(r.stdout).not.toContain('desktop2x');
    expect(r.status).toBe(1);
    expect(runIt(path.join(dir, 'base'), path.join(dir, 'same'), '--only=gpu watch').status).toBe(2);
  });

  it('takes one file for either side', () => {
    const r = runIt(path.join(dir, 'base', 'perf-run1.json'), path.join(dir, 'same', 'perf-run1.json'), '--no-fail');
    expect(r.stdout).toContain('| gpu desktop | dragGapMs | 50 | 19 (19 to 19), n=1 | 19 (19 to 19), n=1 | 0 | |');
    expect(r.status).toBe(0);
  });

  it('exits 2 on a usage error, with the reason', () => {
    expect(runIt().status).toBe(2);
    expect(runIt(path.join(dir, 'base')).status).toBe(2);
    const gone = runIt(path.join(dir, 'base'), path.join(dir, 'nowhere'));
    expect(gone.stderr).toContain('no such file or directory');
    expect(gone.status).toBe(2);
    const bad = runIt(path.join(dir, 'base'), path.join(dir, 'bad.json'));
    expect(bad.stderr).toContain('bad.json: row 1 is not a result');
    expect(bad.status).toBe(2);
    expect(runIt(path.join(dir, 'base'), path.join(dir, 'same'), '--what').status).toBe(2);
    expect(runIt(path.join(dir, 'base'), path.join(dir, 'same'), path.join(dir, 'base')).status).toBe(2);
  });

  it('finds nothing in the committed baseline against itself, and misses the deep zoom rows once the extra files give them', () => {
    const reviews = path.join(import.meta.dirname, '../../../docs/design/trifid-theme/reviews');
    const r = runIt(path.join(reviews, 'baseline/perf'), path.join(reviews, 'baseline/perf'));
    expect(r.stdout).toContain('Server HTML of / (KB, per full run): baseline 28.3, 28.3, 28.3; now 28.3, 28.3, 28.3');
    expect(r.stdout).toContain('No finding');
    expect(r.status).toBe(0);
    // With part 1's deep zoom runs as extra baseline files the GPU columns have a deep zoom baseline, which the
    // old runs standing in as "current" never measured: four missing rows, and nothing else.
    const extras = [1, 2, 3].map((i) => path.join(reviews, `perf-part1/baseline-gpu-deep-run${i}.json`));
    const x = runIt(path.join(reviews, 'baseline/perf'), path.join(reviews, 'baseline/perf'), ...extras);
    expect(x.stdout).toContain('| gpu desktop | deepDragGapMs | none (yardstick 50) | 18 (17 to 18), n=3 (extra) | n/a | n/a | MISSING |');
    expect(x.stdout).toContain('Findings (4):');
    expect(x.status).toBe(1);
  });
});
