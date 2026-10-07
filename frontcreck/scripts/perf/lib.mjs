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
const OPAQUE = /^rgba\([^)]*,\s*1(\.0+)?\s*\)$/;

/** The four custom properties that make the panels glass ('on') or solid ('off'), read from globals.css: the first
 * value of each is the glass one, the last is the solid fallback the stylesheet itself uses (phones, no
 * backdrop-filter, reduced transparency). perf.mjs sets them inline on <html> to force either at any width.
 * "Last is solid" is by position in the file, so it is checked: the last blur must be `none` and the last colours
 * opaque, or a later block with a third value would silently be taken for the fallback. */
export function glassVars(css, want) {
  if (want !== 'on' && want !== 'off') throw new Error(`--glass takes on or off, not ${want}`);
  return Object.fromEntries(
    GLASS_PROPS.map((name) => {
      const all = [...css.matchAll(new RegExp(`(?<![\\w-])${name}\\s*:\\s*([^;}]+)[;}]`, 'g'))].map((m) => m[1].trim());
      if (all.length < 2) throw new Error(`${name}: expected a glass and a solid value in globals.css`);
      const last = all[all.length - 1];
      if (name === '--glass-blur' ? last !== 'none' : !OPAQUE.test(last)) {
        throw new Error(`the last ${name} is not ${name === '--glass-blur' ? 'none' : 'opaque (rgba(..., 1) expected)'}: ${last}`);
      }
      return [name, want === 'on' ? all[0] : last];
    }),
  );
}

/** --glass and --twinkle of perf.mjs: 'on', 'off', or null when the flag is absent. Anything else throws.
 * --names is refused: the map's region names were removed (October 2026), so there is nothing to switch. */
export function parseEffectFlags(args) {
  if (args.includes('--names')) throw new Error('--names is gone: the region names were removed from the map, so there is nothing to switch. Run without it.');
  const out = {};
  for (const name of ['glass', 'twinkle']) {
    const i = args.indexOf(`--${name}`);
    const v = i >= 0 ? args[i + 1] : null;
    if (i >= 0 && v !== 'on' && v !== 'off') throw new Error(`--${name} takes on or off`);
    out[name] = v;
  }
  return out;
}

/** What perf.mjs writes into its JSON beside { js, pages, rows, fails }: how the run was made. A run with no flag
 * gets `open` and nothing else; `effects` and `flags` appear only when one of theirs was set, so compare.mjs can
 * tell a forced run from the site as a visitor gets it. */
export function jsonExtras({ open, glass, twinkle, noGas, gasLite, allowSoftwareGpu }) {
  const out = { open: open ?? 'app' };
  if (glass || twinkle) out.effects = { glass: glass ?? null, twinkle: twinkle ?? null };
  const flags = { ...(noGas ? { noGas: true } : {}), ...(gasLite ? { gasLite } : {}), ...(allowSoftwareGpu ? { allowSoftwareGpu: true } : {}) };
  if (Object.keys(flags).length) out.flags = flags;
  return out;
}

const SURFACES = [['header', 'the header'], ['panel', 'the panel'], ['album', 'the album panel']];

/** Whether a run had what its flags forced. `seen` is the list of readbacks perf.mjs takes in the page (on the
 * album, on /map, at the opening view): the computed --glass-blur, the computed backdrop-filter of the header, of
 * a panel and of the album panel (null where the page has none), and when the glass
 * properties were set against first paint. Returns one line per thing that is not as forced; perf.mjs adds them to
 * its fails, so an A/B in which nothing changed can never read as "costs nothing". */
export function checkEffects(where, seen, want, vars) {
  const fails = [];
  if (want.glass) {
    const flag = `--glass ${want.glass}`;
    for (const s of seen) {
      if (typeof s.forcedMs !== 'number') {
        fails.push(`${where}: forced effect not applied: the glass properties were never set on <html> (${s.at})`);
        continue;
      }
      if (s.glassBlur !== vars['--glass-blur']) fails.push(`${where}: forced effect not applied: ${flag}, but --glass-blur is ${s.glassBlur}, not ${vars['--glass-blur']} (${s.at})`);
      for (const [key, label] of SURFACES) {
        if (s[key] === null || s[key] === undefined) continue;
        if ((s[key] === 'none') !== (want.glass === 'off')) fails.push(`${where}: forced effect not applied: ${flag}, but ${label} has backdrop-filter ${s[key]} (${s.at})`);
      }
      if (typeof s.firstPaintMs === 'number' && s.forcedMs > s.firstPaintMs) {
        fails.push(`${where}: forced effect applied late: the glass properties were set at ${s.forcedMs} ms, after first paint at ${s.firstPaintMs} ms (${s.at})`);
      }
    }
    for (const [key, label] of SURFACES) {
      if (!seen.some((s) => typeof s[key] === 'string')) fails.push(`${where}: forced effect not verified: ${flag}, but ${label} was never found to read back`);
    }
  }
  // The glints: what the app's own timer says its switch is (window.__rmr.twinkle.enabled(), null when the app
  // publishes none), how many glints it has made on that page, and how many are in the DOM. Off needs none of
  // either on every page; on needs at least one page where a glint had been made, or the run proved nothing.
  if (want.twinkle) {
    const flag = `--twinkle ${want.twinkle}`;
    for (const s of seen) {
      if (s.twinkleOn !== (want.twinkle === 'on')) fails.push(`${where}: forced effect not applied: ${flag}, but the glints' timer reads enabled ${s.twinkleOn ?? null} (${s.at})`);
      if (want.twinkle === 'off' && ((s.twinkleSpawned ?? 0) > 0 || (s.twinkleNodes ?? 0) > 0)) {
        fails.push(`${where}: forced effect not applied: ${flag}, but ${s.twinkleSpawned} glints were made and ${s.twinkleNodes} are on the page (${s.at})`);
      }
    }
    if (want.twinkle === 'on' && !seen.some((s) => s.twinkleSpawned > 0)) fails.push(`${where}: forced effect not verified: ${flag}, but no glint had been made on any page read back`);
  }
  return fails;
}

/** The numbers perf.mjs reports per mode and viewport. Lower is better for every one. */
/** The same test as src/components/map/state/renderer.ts isSoftwareRenderer, on the name perf.mjs reads from a
 * canvas of its own. */
const SOFTWARE_NAME = /swiftshader|llvmpipe|software|basic render/i;

/** The backstop for "glints are on by default": the browser tests draw in software, where a visitor gets no
 * glints, so nothing else would notice if they stopped appearing for everyone. `row` is one measured column of
 * perf.mjs: `renderer` is the name the script read itself, `idleGlints` how many glints the app's timer made in
 * the idle window (null when the app publishes no count), `reducedMotion` what the page's media query said and
 * `twinkleSoftware` what the app took the renderer for (reported in the message). `flag` is --twinkle (null when
 * absent: only then is the run the site as a visitor gets it). Returns the lines to add to the run's fails. */
export function checkDefaultGlints(row, flag) {
  if (flag) return [];
  const where = `${row.mode} ${row.vp}`;
  const software = SOFTWARE_NAME.test(row.renderer ?? '');
  if (software) {
    return row.idleGlints > 0 ? [`${where}: ${row.idleGlints} glints were made while the map was idle on a software renderer with no --twinkle flag: visitors there must get none`] : [];
  }
  // 'n/a': the script could not read a renderer at all (no WebGL): nothing to judge.
  if (row.mode !== 'gpu' || !row.renderer || row.renderer === 'n/a' || row.reducedMotion) return [];
  if (row.idleGlints > 0) return [];
  const read = row.twinkleSoftware === true || row.twinkleSoftware === false ? String(row.twinkleSoftware) : 'unknown';
  return [`${where}: no glint was made while the map was idle, on a GPU (${row.renderer}) with motion allowed and no --twinkle flag: visitors with a GPU get none. The app reads the renderer as software: ${read}${row.idleTwinkle ? `; the timer's ticks in the window: ${JSON.stringify(row.idleTwinkle)}` : ''}`];
}

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
const DPR2 = 'gpu desktop2x';

/** Files named perf-dpr2-*.json are runs made only for the dpr 2 column. */
export const isDpr2File = (name) => /^perf-dpr2-/.test(name);
/** The perf-*.json files of a folder, by name, the dpr 2 files last: the columns then come in the order perf.mjs
 * measures them. Anything else in the folder (A/B files, .txt) is not a run of the set. */
export const sortRunFiles = (names) => names.filter((f) => /^perf-.*\.json$/.test(f)).sort((x, y) => isDpr2File(x) - isDpr2File(y) || (x < y ? -1 : 1));
/** The rows a file contributes: all of them, or only the dpr 2 column of a file made for that column, so such a
 * file never adds a run to another column. */
export const rowsOfRun = (run) => (isDpr2File(run.file) ? run.rows.filter((x) => `${x.mode} ${x.vp}` === DPR2) : run.rows);

/** The page sizes from perf.mjs's console output, for a JSON file written before the sizes were saved in it. */
export function pagesFromText(txt) {
  const line = typeof txt === 'string' ? /^Server HTML: (.*?) \(budget/m.exec(txt) : null;
  if (!line) return null;
  const pages = [...line[1].matchAll(/(\/\S*) ([\d.]+) KB/g)].map((m) => ({ path: m[1], kb: Number(m[2]) }));
  return pages.length ? pages : null;
}

/** One perf JSON file, checked and reduced to what compare.mjs uses. Throws with the file's name when it is not a
 * perf run. `txt` is the console output saved beside it, if any (page sizes of an older file). `settings` says how
 * the run was made ('' for a file of the old script). */
export function checkRun(file, json, txt = null) {
  if (!json || !Array.isArray(json.rows)) throw new Error(`${file}: not a perf JSON file (no rows)`);
  json.rows.forEach((r, i) => {
    if (!r || typeof r.mode !== 'string' || typeof r.vp !== 'string') throw new Error(`${file}: row ${i + 1} is not a result with a mode and a viewport`);
  });
  const e = json.effects ?? {};
  const f = json.flags ?? {};
  const settings = [
    json.open ? `open=${json.open}` : '', e.glass ? `glass=${e.glass}` : '', e.twinkle ? `twinkle=${e.twinkle}` : '',
    // (a run recorded before the region names were removed may still say it forced them)
    e.names ? `names=${e.names}` : '',
    f.noGas ? 'noGas' : '', f.gasLite ? `gasLite=${f.gasLite}` : '', f.allowSoftwareGpu ? 'allowSoftwareGpu' : '',
  ].filter(Boolean).join(' ');
  const pages = Array.isArray(json.pages) ? json.pages.map((p) => ({ path: p.path, kb: p.kb })) : pagesFromText(txt);
  return { file, js: json.js ?? null, pages, rows: json.rows, fails: json.fails ?? [], settings };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Per "mode viewport" and measure: the median, the best (min) and the worst (max) of several runs, and `n`, the
 * number of runs that reported the measure as a number. Each run is the `rows` array of one perf JSON file. A
 * measure a run did not report is left out of that run (a file of an older perf.mjs has no gas, deep zoom or
 * opening rows); compareRuns shows `n`, so a measure that failed in some runs cannot pass for a median of all. */
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

/** The baseline folder's summary with the deep zoom rows of the extra baseline files added: GPU columns only (that
 * is what part 1 measured today's site for), and only for a column and measure the folder itself has no value for
 * (the folder's own runs always win, and no measure ends up with the runs of two sets mixed). A filled value is
 * marked `extra`, and the table says so: it comes from another set of runs, made on another day. Nothing else is
 * taken from the extra files. Returns a new summary. */
export function fillBaseline(base, extra, keys = DEEP_KEYS) {
  const out = Object.fromEntries(Object.entries(base).map(([where, byKey]) => [where, { ...byKey }]));
  for (const [where, byKey] of Object.entries(extra)) {
    if (!where.startsWith('gpu ')) continue;
    for (const key of keys) {
      if (byKey[key] && !out[where]?.[key]) (out[where] ??= {})[key] = { ...byKey[key], extra: true };
    }
  }
  return out;
}

/** One row per measure that the baseline or the current set has, for every column either has.
 * - `slower`: the current median is above the baseline median but not above every baseline run. A finding: the
 *   owner's rule is that any number worse than baseline is one, and one outlier among three baseline runs must not
 *   widen what passes.
 * - `worse`: the current median is above the worst baseline run. The stronger finding.
 * - `missing`: the baseline has the measure and no current run does (a failed measure, a column that did not run).
 *   The row is kept with nulls; it is never dropped.
 * - `n` of `runs`: how many current runs gave a value, of the runs that column has; `baseN` the same for the
 *   baseline. A measure the baseline does not have keeps its row with a null baseline ("n/a"), never slower. */
export function compareRuns(baseline, current) {
  const rows = [];
  const columns = [...Object.keys(current), ...Object.keys(baseline).filter((w) => !(w in current))];
  for (const where of columns) {
    const runs = Math.max(0, ...Object.values(current[where] ?? {}).map((v) => v.n));
    for (const key of COMPARE_KEYS) {
      const b = baseline[where]?.[key];
      const c = current[where]?.[key];
      if (!b && !c) continue;
      const base = b ? { baseMedian: b.median, baseBest: b.best, baseWorst: b.worst, baseN: b.n, ...(b.extra ? { extra: true } : {}) } : { baseMedian: null, baseBest: null, baseWorst: null, baseN: 0 };
      if (!c) rows.push({ where, key, ...base, median: null, best: null, worst: null, n: 0, runs, worse: false, slower: false, missing: true });
      else {
        const worse = !!b && c.median > b.worst;
        rows.push({ where, key, ...base, median: c.median, best: c.best, worst: c.worst, n: c.n, runs, worse, slower: !!b && !worse && c.median > b.median, missing: false });
      }
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

const r1 = (n) => Math.round(n * 10) / 10;
const signed = (n) => (n > 0 ? `+${n}` : String(n));

/** The perf rule applied to compareRuns' rows: one markdown table line per row and the list of findings. Marks,
 * each of which is a finding: OVER BUDGET (median over its budget), OVER YARDSTICK (a GPU gap with no budget over
 * 50 ms), WORSE (median above the worst baseline run), SLOWER (median above the baseline median, inside the
 * baseline spread), MISSING (the baseline has the measure, the current runs do not), FEWER RUNS (a value in fewer
 * current runs than the column has, or than the baseline has). WORSE and SLOWER are findings inside budget too.
 * The table shows median (min to max), n on both sides and the difference of the medians. A row with no baseline
 * shows "n/a" and is judged against its budget or yardstick alone; a baseline value taken from the extra baseline
 * files is marked "(extra)". */
export function judgeRows(rows, budgets) {
  const table = [];
  const findings = [];
  for (const r of rows) {
    const name = `${r.where} ${r.key}`;
    const budget = budgetOf(r.where, r.key, budgets);
    const yardstick = budget === null ? yardstickOf(r.where, r.key, budgets) : null;
    const limit = budget !== null ? String(budget) : yardstick !== null ? `none (yardstick ${yardstick})` : 'none';
    const was = r.baseMedian === null ? 'n/a' : `${r.baseMedian} (${r.baseBest} to ${r.baseWorst}), n=${r.baseN}${r.extra ? ' (extra)' : ''}`;
    if (r.missing) {
      findings.push(`${name}: no value in the current runs (the baseline has one)`);
      table.push(`| ${r.where} | ${r.key} | ${limit} | ${was} | n/a | n/a | MISSING |`);
      continue;
    }
    const over = budget !== null && r.median > budget;
    const overYardstick = yardstick !== null && r.median > yardstick;
    const fewer = r.n < r.runs || r.n < r.baseN;
    if (over) findings.push(`${name}: median ${r.median} is over its budget of ${budget}`);
    if (overYardstick) findings.push(`${name}: median ${r.median} is over the ${yardstick} ms yardstick (not a budget)`);
    if (r.worse) findings.push(`${name}: median ${r.median} is above the worst baseline run (${r.baseWorst})`);
    if (r.slower) findings.push(`${name}: median ${r.median} is above the baseline median (${r.baseMedian}), inside the baseline spread (${r.baseBest} to ${r.baseWorst})`);
    if (fewer) findings.push(`${name}: a value in only ${r.n} of ${r.runs} current runs (the baseline has ${r.baseN})`);
    const mark = [over ? 'OVER BUDGET' : '', overYardstick ? 'OVER YARDSTICK' : '', r.worse ? 'WORSE' : '', r.slower ? 'SLOWER' : '', fewer ? 'FEWER RUNS' : ''].filter(Boolean).join(', ');
    let delta = 'n/a';
    if (r.baseMedian !== null) {
      const d = r1(r.median - r.baseMedian);
      delta = d !== 0 && r.baseMedian > 0 ? `${signed(d)} (${signed(Math.round((d / r.baseMedian) * 100))} %)` : signed(d);
    }
    table.push(`| ${r.where} | ${r.key} | ${limit} | ${was} | ${r.median} (${r.best} to ${r.worst}), n=${r.n} | ${delta} |${mark ? ` ${mark}` : ''} |`);
  }
  return { table, findings };
}

/** Sizes of the full runs (not the dpr 2 files) of both sets: first-load JS, the three.js chunk and the server HTML
 * of each page. Each is judged against its budget and against the baseline: a size above the baseline's largest is
 * a finding even inside the budget, printed with the difference. A file with no sizes is a finding, never a pass. */
export function sizeFindings(baseFull, curFull, budgets) {
  const lines = [];
  const findings = [];
  if (curFull.length !== 3) findings.push(`${curFull.length} full run(s) in the current set: the rule is about three`);
  const list = (runs, f) => runs.map((r) => (r.js ? f(r.js) : 'n/a')).join(', ');
  const maxOf = (xs) => (xs.length ? Math.max(...xs) : null);
  const baseKb = maxOf(baseFull.filter((r) => r.js).map((r) => r.js.kb));
  const curKb = maxOf(curFull.filter((r) => r.js).map((r) => r.js.kb));
  const grew = baseKb !== null && curKb !== null && curKb > baseKb;
  lines.push(`First-load JS of / (KB, per full run): baseline ${list(baseFull, (js) => js.kb)}; now ${list(curFull, (js) => js.kb)} (budget ${budgets.firstLoadJsKb})${grew ? `: ${signed(r1(curKb - baseKb))} KB against the baseline` : ''}`);
  lines.push(`three.js chunk in the first load (KB, per full run): baseline ${list(baseFull, (js) => js.threeKb)}; now ${list(curFull, (js) => js.threeKb)} (must be 0)`);
  if (grew) findings.push(`first-load JS ${curKb} KB is above the baseline (${baseKb} KB) by ${r1(curKb - baseKb)} KB; the budget is ${budgets.firstLoadJsKb} KB`);
  for (const r of curFull) {
    if (!r.js) {
      findings.push(`${r.file}: no first-load JS size in the file`);
      continue;
    }
    if (r.js.kb > budgets.firstLoadJsKb) findings.push(`${r.file}: first-load JS ${r.js.kb} KB is over ${budgets.firstLoadJsKb} KB`);
    if (r.js.threeKb > 0) findings.push(`${r.file}: the three.js chunk (${r.js.threeKb} KB) is in the first load`);
  }
  for (const r of curFull) if (!r.pages) findings.push(`${r.file}: no server HTML sizes in the file or in a .txt beside it`);
  const kbOf = (runs, p) => runs.map((r) => r.pages?.find((x) => x.path === p)?.kb).map((v) => (typeof v === 'number' ? v : null));
  const paths = [...new Set([...baseFull, ...curFull].flatMap((r) => (r.pages ?? []).map((x) => x.path)))];
  const basePages = baseFull.some((r) => r.pages);
  if (!basePages && paths.length) findings.push('the baseline has no server HTML sizes: the pages are judged against the budget only');
  for (const p of paths) {
    const b = kbOf(baseFull, p);
    const c = kbOf(curFull, p);
    const bMax = maxOf(b.filter((v) => v !== null));
    const cMax = maxOf(c.filter((v) => v !== null));
    const show = (xs) => xs.map((v) => v ?? 'n/a').join(', ');
    const up = bMax !== null && cMax !== null && cMax > bMax;
    lines.push(`Server HTML of ${p} (KB, per full run): baseline ${show(b)}; now ${show(c)} (budget ${budgets.pageHtmlKb})${up ? `: ${signed(r1(cMax - bMax))} KB against the baseline` : ''}`);
    if (up) findings.push(`server HTML of ${p} is ${cMax} KB, above the baseline (${bMax} KB) by ${r1(cMax - bMax)} KB; the budget is ${budgets.pageHtmlKb} KB`);
    if (cMax !== null && cMax > budgets.pageHtmlKb) findings.push(`server HTML of ${p} is ${cMax} KB, over ${budgets.pageHtmlKb} KB`);
    if (basePages && bMax === null) findings.push(`server HTML of ${p}: no baseline value`);
    if (cMax === null && curFull.some((r) => r.pages)) findings.push(`server HTML of ${p}: no value in the current runs (the baseline has one)`);
  }
  return { lines, findings };
}

/** How the runs of each set were made (checkRun's `settings`). A set whose runs were not all made the same way is a
 * finding (a leftover forced run would be averaged into the median), and so is a current set made with any flag
 * that changes the site or the script's waits, unless `allowFlags` says the comparison is an A/B on purpose. The
 * baseline may be a build measured with --no-gas --open whole (today's site); only its consistency counts. */
export function settingsFindings(base, cur, { allowFlags = false } = {}) {
  const lines = [];
  const findings = [];
  for (const [label, runs] of [['baseline', base], ['current', cur]]) {
    const kinds = [...new Set(runs.map((r) => r.settings))];
    if (kinds.some((k) => k !== '')) lines.push(`How the ${label} runs were made: ${runs.map((r) => `${r.file}: ${r.settings || 'no record (old script)'}`).join('; ')}`);
    if (kinds.length > 1) findings.push(`the ${label} runs were not all made the same way: ${runs.map((r) => `${r.file} (${r.settings || 'no record'})`).join(', ')}`);
  }
  const forced = [...new Set(cur.map((r) => r.settings).filter((k) => k !== '' && k !== 'open=app'))];
  if (forced.length && !allowFlags) findings.push(`the current runs were made with flags (${forced.join('; ')}): not the site as a visitor gets it (pass --allow-flags for an A/B)`);
  return { lines, findings };
}

/** The first hover with the glints on, off or held, judged across browser sessions (twinkle-cost.mjs
 * --first-hover-verdict). `sessions` are the saved files of `twinkle-cost.mjs --no-warmup --first on|off|held`, one
 * browser launch each. Only one row of each is read: the first measured mouse run, which holds the first hover of
 * that page load, on a renderer where visitors get glints. The second mouse run of the same session is a later
 * hover (about a third as long, whatever the glints do), so the two are never compared with each other.
 *
 * Per arm: median, best and worst of the longest frame gap and of the longest task. An arm with glints fails when
 * its median is more than `noiseMs` above the median of the off sessions; fewer than `minN` sessions in an arm is a
 * failure too (no verdict). `gapBeyondOffSpread` and `taskBeyondOffSpread` say whether the arm's median is above
 * every off session: reported, so a difference inside the allowance is still seen. */
export function firstHoverVerdict(sessions, noiseMs, minN = 3) {
  const by = { on: [], off: [], held: [] };
  let skipped = 0;
  for (const s of sessions) {
    const row = s.warmup === false ? (s.rows ?? []).find((r) => r.run === 'mouse moving' && r.firstHover === true && r.shown && r.vp === 'desktop') : null;
    if (!row || !by[row.twinkle]) skipped += 1;
    else by[row.twinkle].push(row);
  }
  const stat = (xs) => ({ median: median(xs), best: Math.min(...xs), worst: Math.max(...xs), n: xs.length });
  const arms = {};
  const fails = [];
  for (const [arm, rows] of Object.entries(by)) if (rows.length) arms[arm] = { gap: stat(rows.map((r) => r.longestGapMs)), task: stat(rows.map((r) => r.longestTaskMs)) };
  if (by.off.length < minN) fails.push(`first hover: ${by.off.length} session(s) with glints off first; a verdict needs at least ${minN} per arm`);
  for (const arm of ['on', 'held']) {
    if (!arms[arm]) continue;
    if (by[arm].length < minN) {
      fails.push(`first hover, glints ${arm}: ${by[arm].length} session(s); a verdict needs at least ${minN} per arm`);
      continue;
    }
    if (by.off.length < minN) continue;
    for (const [key, name] of [['gap', 'longest frame gap'], ['task', 'longest task']]) {
      const a = arms[arm][key];
      const o = arms.off[key];
      arms[arm][`${key}BeyondOffSpread`] = a.median > o.worst;
      if (a.median > o.median + noiseMs) fails.push(`first hover, glints ${arm}: median ${name} ${a.median} ms (${a.best} to ${a.worst}, n=${a.n}), ${o.median} ms with glints off (${o.best} to ${o.worst}, n=${o.n}): ${a.median - o.median} ms more, allowance ${noiseMs} ms`);
    }
  }
  return { arms, fails, skipped };
}
