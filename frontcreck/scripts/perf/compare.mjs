#!/usr/bin/env node
/** Applies the perf rule to two sets of `npm run perf` runs. For every measure it prints the median of the runs in
 * <current> beside its budget and beside the median and the min to max of the runs in <baseline>, and marks a
 * median over its budget and a median above the worst baseline run (a finding even inside budget). It also prints
 * the sizes of every run and every single run that missed a budget.
 *
 * <baseline> and <current> are each a directory of perf-*.json files as perf.mjs writes them
 * ({ js: { kb, modernKb, threeKb, files }, rows: [...], fails: [...] }; files of an older perf.mjs, with fewer
 * measures, are read the same way), or one such JSON file (a single run, for an A/B pair such as glass on against
 * glass off: the "worst baseline run" is then that one run, so read a small difference as noise).
 * Files named perf-dpr2-*.json are the runs made only for the `gpu desktop2x` column (the baseline has three): only
 * their desktop2x rows are used, and they are left out of the size lines, so they never add to another column.
 * [extra baseline files...] are perf JSON files that hold the baseline of the deep zoom rows, which today's site
 * was measured for separately (docs/design/trifid-theme/reviews/perf-part1/baseline-gpu-deep-run*.json). Only
 * deepDragGapMs and deepMorphGapMs are taken from them, and only for a column the baseline itself has no value for.
 * The dpr 2 column, the deep zoom rows and the opening view rows have no budget; the 50 ms frame gap is their
 * yardstick in the GPU columns, named as such. A measure with no baseline value shows "n/a".
 * Exit code: 0 whatever the findings (they are printed); 2 on a usage error.
 * Usage: node scripts/perf/compare.mjs <baselineDir|file> <currentDir|file> [extra baseline files...] */
import fs from 'node:fs';
import path from 'node:path';
import { compareRuns, fillBaseline, judgeRows, summarise } from './lib.mjs';

const USAGE = 'usage: node scripts/perf/compare.mjs <baselineDir|file> <currentDir|file> [extra baseline files...]';
const [basePath, curPath, ...extraPaths] = process.argv.slice(2);
if (!basePath || !curPath) {
  console.error(USAGE);
  process.exit(2);
}
const BUDGETS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'budgets.json'), 'utf8'));
const DPR2 = 'gpu desktop2x';

const isDpr2File = (f) => /^perf-dpr2-/.test(f);
const readRun = (file) => {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(j.rows)) throw new Error(`${file}: not a perf JSON file (no rows)`);
  return { file: path.basename(file), js: j.js ?? null, rows: j.rows, fails: j.fails ?? [] };
};
const load = (p) => {
  if (!fs.existsSync(p)) throw new Error(`${p}: no such file or directory`);
  if (!fs.statSync(p).isDirectory()) return [readRun(p)];
  return fs
    .readdirSync(p)
    .filter((f) => /^perf-.*\.json$/.test(f))
    // By name, the dpr 2 files last: the table then lists the columns in the order perf.mjs measures them.
    .sort((x, y) => isDpr2File(x) - isDpr2File(y) || (x < y ? -1 : 1))
    .map((f) => readRun(path.join(p, f)));
};
/** The rows a file contributes: all of them, or only the dpr 2 column of a file made for that column. */
const rowsOf = (r) => (isDpr2File(r.file) ? r.rows.filter((x) => `${x.mode} ${x.vp}` === DPR2) : r.rows);

let base;
let cur;
let extra;
try {
  base = load(basePath);
  cur = load(curPath);
  extra = extraPaths.map((p) => {
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) throw new Error(`${p}: an extra baseline must be a perf JSON file`);
    return readRun(p);
  });
} catch (e) {
  console.error(`${e.message}\n${USAGE}`);
  process.exit(2);
}
const baseFull = base.filter((r) => !isDpr2File(r.file));
const curFull = cur.filter((r) => !isDpr2File(r.file));
if (!baseFull.length || !curFull.length) {
  console.error(`no full perf-*.json run in ${baseFull.length ? curPath : basePath}`);
  process.exit(2);
}
const sizeFindings = [];
if (curFull.length !== 3) sizeFindings.push(`${curFull.length} full run(s) in ${curPath}: the rule is about three`);

const list = (runs, f) => runs.map((r) => (r.js ? f(r.js) : 'n/a')).join(', ');
console.log(`First-load JS of / (KB, per full run): baseline ${list(baseFull, (js) => js.kb)}; now ${list(curFull, (js) => js.kb)} (budget ${BUDGETS.firstLoadJsKb})`);
console.log(`three.js chunk in the first load (KB, per full run): baseline ${list(baseFull, (js) => js.threeKb)}; now ${list(curFull, (js) => js.threeKb)} (must be 0)`);
if (extra.length) console.log(`Deep zoom baseline from: ${extra.map((r) => r.file).join(', ')} (only where ${basePath} has none)`);
console.log('');
for (const r of curFull) {
  if (!r.js) continue;
  if (r.js.kb > BUDGETS.firstLoadJsKb) sizeFindings.push(`${r.file}: first-load JS ${r.js.kb} KB is over ${BUDGETS.firstLoadJsKb} KB`);
  if (r.js.threeKb > 0) sizeFindings.push(`${r.file}: the three.js chunk (${r.js.threeKb} KB) is in the first load`);
}

const baseline = fillBaseline(summarise(base.map(rowsOf)), summarise(extra.map((r) => r.rows)));
const { table, findings: rowFindings } = judgeRows(compareRuns(baseline, summarise(cur.map(rowsOf))), BUDGETS);
const findings = [...sizeFindings, ...rowFindings];
console.log('| Where | Measure | Budget | Baseline median (min to max) | Now, median | |\n|---|---|---|---|---|---|');
console.log(table.join('\n'));

console.log('\nSingle runs over budget (each is named and explained in the write-up):');
const single = cur.flatMap((r) => r.fails.map((f) => `${r.file}: ${f}`));
console.log(single.length ? single.join('\n') : 'none');
console.log(findings.length ? `\nFindings (${findings.length}):\n${findings.join('\n')}` : '\nNo median is over its budget, over the yardstick or above the worst baseline run.');
