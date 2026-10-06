/** Budget checks and reporting for scripts/perf/perf.mjs (spec section 7). */
export const BUDGET_KEYS = [
  ['searchUsableMs', 'search usable', 'searchUsableMs', 'ms'],
  ['startupLongTaskMs', 'startup long task', 'startupLongTaskMs', 'ms'],
  ['typeToSuggestionsMs', 'typing to suggestions', 'typeToSuggestionsMs', 'ms'],
  ['selectToAlbumMs', 'select to album', 'selectToAlbumMs', 'ms'],
  ['sliderToListMs', 'slider to list', 'sliderToListMs', 'ms'],
];
const GAP_KEYS = [
  ['transitionGapMs', 'transition frame gap'],
  ['morphGapMs', 'morph frame gap'],
  ['dragGapMs', 'drag frame gap'],
  ['zoomGapMs', 'zoom frame gap'],
];
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software/i;

export function checkBudgets(r, mode, budgets, { allowSoftwareGpu = false } = {}) {
  const fails = [];
  const where = `${mode} ${r.vp}`;
  const over = (label, value, limit, unit) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value > limit) fails.push(`${where}: ${label} ${value ?? 'missing'} ${unit} > ${limit} ${unit}`);
  };
  for (const [key, label, budgetKey, unit] of BUDGET_KEYS) over(label, r[key], budgets[budgetKey], unit);
  if (!r.longTasksSupported) fails.push(`${where}: long tasks could not be measured (PerformanceObserver 'longtask' unsupported)`);
  if (typeof r.idleLongTasks !== 'number' || r.idleLongTasks > budgets.idleLongTasks) fails.push(`${where}: ${r.idleLongTasks ?? 'missing'} long tasks while idle (budget ${budgets.idleLongTasks})`);
  if (r.thumbsOnFirstLoad !== false) fails.push(`${where}: thumbs.webp was requested during the first load of / (it must load lazily, only after a cover fails)`);
  if (typeof r.idleFrames !== 'number' || r.idleFrames > budgets.idleFrames) fails.push(`${where}: ${r.idleFrames ?? 'missing'} frames while idle (budget ${budgets.idleFrames})`);
  if (mode === 'gpu') {
    const renderer = (r.renderer ?? '').trim();
    // A failed query ('n/a' or empty) must never pass as hardware rendering.
    if (renderer === '' || renderer === 'n/a') fails.push(`${where}: GPU mode ran but the renderer could not be read ("${renderer}")`);
    else if (SOFTWARE_RENDERER.test(renderer) && !allowSoftwareGpu) fails.push(`${where}: GPU mode ran without a GPU (renderer "${r.renderer}")`);
    else for (const [key, label] of GAP_KEYS) over(label, r[key], budgets.frameGapMs, 'ms');
  }
  if (r.errors?.length) fails.push(`${where}: console errors: ${r.errors.slice(0, 3).join(' | ')}`);
  return fails;
}

/** Server HTML weight and catalog-leak check (Global Constraints, RSC payload rule). */
export function checkPages(pages, budgets) {
  const fails = [];
  for (const p of pages) {
    if (typeof p.kb !== 'number' || p.kb > budgets.pageHtmlKb) fails.push(`${p.path}: server HTML ${p.kb ?? 'missing'} KB > ${budgets.pageHtmlKb} KB`);
    if (p.unrelatedSlug) fails.push(`${p.path}: server HTML contains the slug of an album it does not show (${p.unrelatedSlug}); the catalog reached the RSC payload`);
  }
  return fails;
}

/** A reported-only value that an older build or a run with --no-gas may not have: never throws. */
const ms = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v} ms` : 'n/a');

const ROWS = [
  ['Renderer', (r) => r.renderer],
  ['Gas shader (reported only)', (r) => (r.gasLite === true ? 'lighter' : r.gasLite === false ? 'full' : 'n/a')],
  ['Search usable', (r) => `${r.searchUsableMs} ms`],
  ['Startup worst long task', (r) => `${r.startupLongTaskMs} ms`],
  ['WebGL warm-up end (reported only)', (r) => (r.warmUp ? `${r.warmUp.ms} ms (${r.warmUp.why})` : 'none')],
  ['Map first frame (reported only)', (r) => `${r.mapFirstFrameMs} ms`],
  ['Nebula visible (reported only)', (r) => ms(r.gasShownMs)],
  ['Typing to suggestions', (r) => `${r.typeToSuggestionsMs} ms`],
  ['Select to album', (r) => `${r.selectToAlbumMs} ms`],
  ['Transition worst frame gap', (r) => `${r.transitionGapMs} ms`],
  ['Slider to list', (r) => `${r.sliderToListMs} ms`],
  ['Morph worst frame gap', (r) => `${r.morphGapMs} ms`],
  ['Drag worst frame gap', (r) => `${r.dragGapMs} ms`],
  ['Zoom worst frame gap', (r) => `${r.zoomGapMs} ms`],
  ['Drag worst frame gap at the opening view (reported only)', (r) => ms(r.openingDragGapMs)],
  ['Zoom worst frame gap at the opening view (reported only)', (r) => ms(r.openingZoomGapMs)],
  ['Deep zoom drag worst frame gap (reported only)', (r) => ms(r.deepDragGapMs)],
  ['Deep zoom, slider between stops, worst frame gap (reported only)', (r) => ms(r.deepMorphGapMs)],
  ['Long tasks while idle (3 s)', (r) => String(r.idleLongTasks)],
  ['Frames rendered while idle (3 s)', (r) => String(r.idleFrames)],
];

export function formatTable(rows) {
  const head = `| Measure | ${rows.map((r) => `${r.mode} ${r.vp}`).join(' | ')} |`;
  const sep = `|---|${rows.map(() => '---').join('|')}|`;
  return [head, sep, ...ROWS.map(([name, f]) => `| ${name} | ${rows.map(f).join(' | ')} |`)].join('\n');
}

const GLASS_PROPS = ['--glass-blur', '--color-float', '--panel-bg', '--top-bg'];

/** The four custom properties that make the panels glass ('on') or solid ('off'), read from globals.css: the first
 * value of each is the glass one, the last is the solid fallback the stylesheet itself uses (phones, no
 * backdrop-filter, reduced transparency). perf.mjs sets them inline on <html> to force either at any width. */
export function glassVars(css, want) {
  if (want !== 'on' && want !== 'off') throw new Error(`--glass takes on or off, not ${want}`);
  return Object.fromEntries(
    GLASS_PROPS.map((name) => {
      const all = [...css.matchAll(new RegExp(`(?<![\\w-])${name}\\s*:\\s*([^;}]+)[;}]`, 'g'))].map((m) => m[1].trim());
      if (all.length < 2) throw new Error(`${name}: expected a glass and a solid value in globals.css`);
      return [name, want === 'on' ? all[0] : all[all.length - 1]];
    }),
  );
}

/** The numbers perf.mjs reports per mode and viewport. Lower is better for every one. */
export const COMPARE_KEYS = [
  'searchUsableMs', 'startupLongTaskMs', 'mapFirstFrameMs', 'typeToSuggestionsMs', 'selectToAlbumMs', 'transitionGapMs',
  'sliderToListMs', 'morphGapMs', 'dragGapMs', 'zoomGapMs',
  // The opening view (part 2's Task 0), reported only. Today's site was never measured there: no baseline.
  'openingDragGapMs', 'openingZoomGapMs',
  'idleLongTasks', 'idleFrames',
  // Part 1's reported only measures. The baseline has them only where part 1 measured today's site for them.
  'deepDragGapMs', 'deepMorphGapMs', 'gasShownMs',
];
/** The measures taken from extra baseline files (part 1's deep zoom runs of today's site). */
export const DEEP_KEYS = ['deepDragGapMs', 'deepMorphGapMs'];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Per "mode viewport" and measure: the median, the best (min) and the worst (max) of several runs. Each run is the
 * `rows` array of one perf JSON file. A measure a run did not report as a number is left out of that run, so a file
 * written by an older perf.mjs (no gas, deep zoom or opening rows) is read like any other. */
export function summarise(runs) {
  const values = {};
  for (const rows of runs) {
    for (const r of rows) {
      const where = `${r.mode} ${r.vp}`;
      for (const key of COMPARE_KEYS) {
        if (typeof r[key] !== 'number' || !Number.isFinite(r[key])) continue;
        ((values[where] ??= {})[key] ??= []).push(r[key]);
      }
    }
  }
  const out = {};
  for (const [where, byKey] of Object.entries(values)) {
    out[where] = {};
    for (const [key, xs] of Object.entries(byKey)) out[where][key] = { median: median(xs), best: Math.min(...xs), worst: Math.max(...xs), n: xs.length };
  }
  return out;
}

/** The baseline folder's summary with the deep zoom rows of the extra baseline files added, only for a column and
 * measure the folder itself has no value for (the folder's own runs always win, and no measure ends up with the
 * runs of two sets mixed). Nothing else is taken from the extra files. Returns a new summary. */
export function fillBaseline(base, extra, keys = DEEP_KEYS) {
  const out = Object.fromEntries(Object.entries(base).map(([where, byKey]) => [where, { ...byKey }]));
  for (const [where, byKey] of Object.entries(extra)) {
    for (const key of keys) {
      if (byKey[key] && !out[where]?.[key]) (out[where] ??= {})[key] = byKey[key];
    }
  }
  return out;
}

/** One row per measure the current set has: the baseline's median and its min to max, the current median, and
 * `worse` when the current median is above the worst baseline run (a finding even inside budget; a median inside
 * the baseline's own spread is run to run noise). A measure the baseline does not have keeps its row, with nulls
 * for the baseline and `worse` false: it is printed as "n/a", never dropped. */
export function compareRuns(baseline, current) {
  const rows = [];
  for (const where of Object.keys(current)) {
    for (const key of COMPARE_KEYS) {
      const b = baseline[where]?.[key];
      const c = current[where]?.[key];
      if (!c) continue;
      if (!b) rows.push({ where, key, baseMedian: null, baseBest: null, baseWorst: null, median: c.median, worse: false });
      else rows.push({ where, key, baseMedian: b.median, baseBest: b.best, baseWorst: b.worst, median: c.median, worse: c.median > b.worst });
    }
  }
  return rows;
}

/** Measures with a budget of their own name, and the frame gaps, which share one budget and are judged in the
 * budgeted GPU columns only (not in software, not in the reported only dpr 2 column). */
const DIRECT = ['searchUsableMs', 'startupLongTaskMs', 'typeToSuggestionsMs', 'selectToAlbumMs', 'sliderToListMs', 'idleLongTasks', 'idleFrames'];
const GAPS = ['transitionGapMs', 'morphGapMs', 'dragGapMs', 'zoomGapMs'];
/** Frame gaps that have no budget in any column: the 50 ms frame gap is their yardstick in the GPU columns. */
const REPORTED_GAPS = [...DEEP_KEYS, 'openingDragGapMs', 'openingZoomGapMs'];
const DPR2 = 'gpu desktop2x';

const budgetOf = (where, key, budgets) => {
  if (where === DPR2) return null;
  if (DIRECT.includes(key)) return budgets[key];
  return GAPS.includes(key) && where.startsWith('gpu ') ? budgets.frameGapMs : null;
};
/** Not a budget: what a frame gap is held against where none applies (every gap of the dpr 2 column, and the deep
 * zoom and opening view gaps of every GPU column). Software gaps have neither: the opening rows run on a cold
 * cache, and a software value there is never a size. */
const yardstickOf = (where, key, budgets) => {
  if (!where.startsWith('gpu ')) return null;
  if (REPORTED_GAPS.includes(key)) return budgets.frameGapMs;
  return where === DPR2 && GAPS.includes(key) ? budgets.frameGapMs : null;
};

/** The perf rule applied to compareRuns' rows: one markdown table line per row and the list of findings. A median
 * over its budget is OVER BUDGET, a GPU gap with no budget over 50 ms is OVER YARDSTICK, and a median above the
 * worst baseline run is WORSE, which is a finding even when the median is inside its budget. A row with no
 * baseline shows "n/a" and is judged against its budget or yardstick alone. */
export function judgeRows(rows, budgets) {
  const table = [];
  const findings = [];
  for (const r of rows) {
    const budget = budgetOf(r.where, r.key, budgets);
    const yardstick = budget === null ? yardstickOf(r.where, r.key, budgets) : null;
    const over = budget !== null && r.median > budget;
    const overYardstick = yardstick !== null && r.median > yardstick;
    if (over) findings.push(`${r.where} ${r.key}: median ${r.median} is over its budget of ${budget}`);
    if (overYardstick) findings.push(`${r.where} ${r.key}: median ${r.median} is over the ${yardstick} ms yardstick (not a budget)`);
    if (r.worse) findings.push(`${r.where} ${r.key}: median ${r.median} is above the worst baseline run (${r.baseWorst})`);
    const mark = [over ? 'OVER BUDGET' : '', overYardstick ? 'OVER YARDSTICK' : '', r.worse ? 'WORSE' : ''].filter(Boolean).join(', ');
    const limit = budget !== null ? String(budget) : yardstick !== null ? `none (yardstick ${yardstick})` : 'none';
    const was = r.baseMedian === null ? 'n/a' : `${r.baseMedian} (${r.baseBest} to ${r.baseWorst})`;
    table.push(`| ${r.where} | ${r.key} | ${limit} | ${was} | ${r.median} |${mark ? ` ${mark}` : ''} |`);
  }
  return { table, findings };
}
