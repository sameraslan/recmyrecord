#!/usr/bin/env node
/** Applies the perf rule to two sets of `npm run perf` runs and exits 1 when anything is worse than the baseline.
 * For every measure it prints the median (min to max) and the number of runs of <current> beside its budget and
 * beside the same of <baseline>, with the difference of the medians, and marks (each mark is a finding):
 *   OVER BUDGET, OVER YARDSTICK   the median against its budget, or against 50 ms where a GPU gap has no budget
 *   WORSE                         the median is above the worst baseline run
 *   SLOWER                        the median is above the baseline median, inside the baseline spread
 *   MISSING, FEWER RUNS           the baseline has the measure and the current runs do not, or not all of them
 * WORSE and SLOWER are findings inside budget too: any number worse than baseline is one. Sizes (first-load JS,
 * the three.js chunk, server HTML per page) are held against the budget and against the baseline the same way.
 * It also lists every single run that missed a budget, and how the runs were made when a file records it.
 *
 * <baseline> and <current> are each a directory of perf-*.json files as perf.mjs writes them
 * ({ js, pages, rows, fails, open, effects?, flags? }; files of an older perf.mjs, with fewer measures and no
 * pages, are read the same way, the page sizes then from the .txt of the same name), or one such JSON file (a
 * single run: with one baseline run every difference is a finding, so read small ones as noise).
 * Files named perf-dpr2-*.json are the runs made only for the `gpu desktop2x` column (the baseline has three): only
 * their desktop2x rows are used, and they are left out of the size lines, so they never add to another column.
 * [extra baseline files...] are perf JSON files that hold the baseline of the deep zoom rows, which today's site
 * was measured for separately (docs/design/trifid-theme/reviews/perf-part1/baseline-gpu-deep-run*.json). Only
 * deepDragGapMs and deepMorphGapMs are taken from them, only in GPU columns and only where the baseline itself has
 * no value; such a row is marked "(extra)".
 * The dpr 2 column, the deep zoom rows and the opening view rows have no budget; the 50 ms frame gap is their
 * yardstick in the GPU columns, named as such. A measure with no baseline value shows "n/a".
 *
 * --no-fail      exit 0 whatever the findings (they are still printed): for exploring
 * --allow-flags  the current runs were made with --glass, --names, --no-gas and so on, on purpose (an A/B)
 * --only="gpu desktop"  compare that one column (a current set made with --mode and --viewport); without it every
 *                column of the baseline that the current set lacks is MISSING
 * Exit code: 0 no finding, 1 a finding, 2 a usage error. Behind a pipe (`| tee`) use `set -o pipefail`.
 * Usage: node scripts/perf/compare.mjs [--no-fail] [--allow-flags] [--only="<mode> <viewport>"] <baselineDir|file> <currentDir|file> [extra baseline files...] */
import fs from 'node:fs';
import path from 'node:path';
import { checkRun, compareRuns, fillBaseline, isDpr2File, judgeRows, rowsOfRun, settingsFindings, sizeFindings, sortRunFiles, summarise } from './lib.mjs';

const USAGE = 'usage: node scripts/perf/compare.mjs [--no-fail] [--allow-flags] [--only="<mode> <viewport>"] <baselineDir|file> <currentDir|file> [extra baseline files...]';
const usage = (why) => {
  console.error(`${why}\n${USAGE}`);
  process.exit(2);
};
const argv = process.argv.slice(2);
const options = argv.filter((a) => a.startsWith('--'));
const unknown = options.find((o) => o !== '--no-fail' && o !== '--allow-flags' && !o.startsWith('--only='));
const only = options.find((o) => o.startsWith('--only='))?.slice(7) ?? null;
if (unknown) usage(`unknown option ${unknown}`);
const [basePath, curPath, ...extraPaths] = argv.filter((a) => !a.startsWith('--'));
if (!basePath || !curPath) usage('two sets of runs are needed');
const BUDGETS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'budgets.json'), 'utf8'));

const readRun = (file) => {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: ${e.message}`);
  }
  const txt = file.replace(/\.json$/, '.txt');
  return checkRun(path.basename(file), json, fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8') : null);
};
const load = (p) => {
  if (!fs.existsSync(p)) throw new Error(`${p}: no such file or directory`);
  if (!fs.statSync(p).isDirectory()) return [readRun(p)];
  return sortRunFiles(fs.readdirSync(p)).map((f) => readRun(path.join(p, f)));
};

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
  usage(e.message);
}
const baseFull = base.filter((r) => !isDpr2File(r.file));
const curFull = cur.filter((r) => !isDpr2File(r.file));
if (!baseFull.length || !curFull.length) usage(`no full perf-*.json run in ${baseFull.length ? curPath : basePath}`);

const sizes = sizeFindings(baseFull, curFull, BUDGETS);
const settings = settingsFindings(base, cur, { allowFlags: options.includes('--allow-flags') });
console.log(`Baseline: ${basePath} (${base.map((r) => r.file).join(', ')})\nCurrent: ${curPath} (${cur.map((r) => r.file).join(', ')})`);
console.log([...sizes.lines, ...settings.lines].join('\n'));
if (extra.length) console.log(`Deep zoom baseline, rows marked (extra), from: ${extra.map((r) => r.file).join(', ')} (GPU columns, only where ${basePath} has none)`);

/** --only: one column of both sides, for a current set that was made for that column alone. */
const column = (summary) => (only ? Object.fromEntries(Object.entries(summary).filter(([where]) => where === only)) : summary);
const baseline = column(fillBaseline(summarise(base.map(rowsOfRun)), summarise(extra.map((r) => r.rows))));
const current = column(summarise(cur.map(rowsOfRun)));
if (only && !Object.keys(baseline).length && !Object.keys(current).length) usage(`--only=${only}: neither side has that column`);
if (only) console.log(`Only the column ${only} is compared.`);
const judged = judgeRows(compareRuns(baseline, current), BUDGETS);
console.log('\n| Where | Measure | Budget | Baseline median (min to max), runs | Now, median (min to max), runs | Difference | |\n|---|---|---|---|---|---|---|');
console.log(judged.table.join('\n'));

console.log('\nSingle runs over budget or with a failed check (each is named and explained in the write-up):');
const single = cur.flatMap((r) => r.fails.map((f) => `${r.file}: ${f}`));
console.log(single.length ? single.join('\n') : 'none');
// A forced effect that did not take effect makes the run worthless as an A/B: a finding, not a note.
const notForced = single.filter((f) => f.includes('forced effect'));
const findings = [...sizes.findings, ...settings.findings, ...notForced, ...judged.findings];
if (findings.length) {
  console.log(`\nFindings (${findings.length}):\n${findings.join('\n')}`);
  if (!options.includes('--no-fail')) process.exitCode = 1;
} else {
  console.log('\nNo finding: no median is over its budget or its yardstick or above the baseline median, no measure or run is missing, and no size grew.');
}
