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
