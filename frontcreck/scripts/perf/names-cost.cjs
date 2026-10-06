/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS perf script run with node, not bundled. */
/* Times layoutNames (frontcreck/src/components/map/state/namesLayout.ts) in its worst cases.
 * Run from frontcreck/:  node --expose-gc --max-semi-space-size=512 <this file>
 * Bundles the current source with rolldown, then for every stop, desktop and phone, several zooms and pans, at rest
 * and during each slider morph (both stops' names), plus a pile-up case (every name on one point, so every name tries
 * all 13 spots), calls layoutNames as the frame driver would (sticky map kept between calls) and prints per call
 * mean, p99 and max, and the bytes allocated per call (heap growth with the young generation large enough that no
 * scavenge runs inside the window). */
const os = require('os');
const path = require('path');
const { build } = require(require.resolve('rolldown', { paths: [process.cwd()] }));
// Outside the repo, so a run leaves nothing to commit by mistake.
const OUT = path.join(os.tmpdir(), `rmr-namesLayout-${process.pid}.mjs`);

async function main() {
  await build({
    input: 'src/components/map/state/namesLayout.ts',
    resolve: { alias: { '@': path.resolve('src') } },
    output: { format: 'esm', file: OUT },
    write: true,
    logLevel: 'warn',
  });
  const L = await import(OUT + '?t=' + Date.now());
  const theme = require(path.resolve('public/data/theme/theme.json'));
  const STOPS = ['sonic', 'balanced', 'mood'];
  const widths = L.createWidthCache((text) => text.length * 70); // Tenor Sans capitals run about 0.7 em

  const screens = [
    { name: 'desktop', W: 1440, H: 836, phone: false, bottomCover: 0 },
    { name: 'phone', W: 390, H: 780, phone: true, bottomCover: 165 },
  ];
  // px per world unit: Whole map, Overview at each stop, closer in up to the end of the names band; label x, y used
  // as world units around the screen centre, with pans so the regions sit at the edges and over the chrome.
  const SCALES = [250, 596.7, 618.2, 708.5, 1534.7, 1639.5, 1838.2, 1912];
  const PANS = [[0, 0], [0.3, 0], [-0.3, 0.2], [0, -0.35], [0.45, 0.45]];

  const cases = [];
  for (const s of screens) {
    const blockers = L.chromeBlockers({ width: s.W, height: s.H, top: 0, inset: 0, phone: s.phone, bottomCover: s.bottomCover, card: false });
    const visible = { left: 0, top: 0, right: s.W, bottom: s.H };
    const fadeSets = [];
    for (const st of STOPS) fadeSets.push({ fades: [{ stop: st, alpha: 1 }], morph: false });
    for (const [a, b] of [['sonic', 'balanced'], ['balanced', 'mood']]) fadeSets.push({ fades: [{ stop: a, alpha: 0.4 }, { stop: b, alpha: 0.4 }], morph: true }); // both stops' names, worst case
    for (const fs of fadeSets) {
      for (const ppw of SCALES) {
        for (const [px, py] of PANS) {
          const candidates = [];
          for (const f of fs.fades) for (const lab of theme.labels[f.stop]) {
            candidates.push({ key: L.nameKey(f.stop, lab.id), label: lab, x: s.W / 2 + (lab.x - px) * ppw * 0.5, y: s.H / 2 + (lab.y - py) * ppw * 0.5, alpha: f.alpha });
          }
          const zoomK = L.nameZoomK((ppw / 1639.5) * 11.15);
          cases.push({ label: `${s.name} ${fs.fades.map((f) => f.stop).join('>')} ${ppw}`, input: { candidates, visible, blockers, phone: s.phone, zoomK, pxPerWorld: ppw, fullHalo: fs.morph || s.phone, widthOf: widths.widthOf, sticky: new Map() } });
        }
      }
      // pile-up: every name of the set on one point near the middle
      const candidates = [];
      for (const f of fs.fades) for (const lab of theme.labels[f.stop]) candidates.push({ key: L.nameKey(f.stop, lab.id), label: lab, x: s.W / 2, y: s.H / 2, alpha: f.alpha });
      cases.push({ label: `${s.name} pile-up ${fs.fades.map((f) => f.stop).join('>')}`, input: { candidates, visible, blockers, phone: s.phone, zoomK: 1, pxPerWorld: 1639.5, fullHalo: fs.morph || s.phone, widthOf: widths.widthOf, sticky: new Map() } });
    }
  }

  // warm up (JIT, width cache)
  for (let r = 0; r < 200; r++) for (const c of cases) L.layoutNames(c.input);

  const ROUNDS = 400;
  const times = new Float64Array(ROUNDS * cases.length);
  let ti = 0;
  const perCase = new Map();
  const caseSum = new Map();
  let placedTotal = 0;
  for (let r = 0; r < ROUNDS; r++) {
    for (const c of cases) {
      const t0 = performance.now();
      const out = L.layoutNames(c.input);
      const dt = performance.now() - t0;
      placedTotal += out.length;
      times[ti++] = dt;
      perCase.set(c.label, Math.max(perCase.get(c.label) || 0, dt));
      caseSum.set(c.label, (caseSum.get(c.label) || 0) + dt);
    }
  }
  times.sort();
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const pct = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
  const fmt = (ms) => (ms * 1000).toFixed(2) + ' us';
  console.log(`layoutNames: ${cases.length} cases x ${ROUNDS} rounds = ${times.length} calls, ${(placedTotal / times.length).toFixed(1)} names placed per call on average`);
  console.log(`  mean ${fmt(mean)}  p50 ${fmt(pct(0.5))}  p99 ${fmt(pct(0.99))}  max ${fmt(times[times.length - 1])}`);
  const worst = [...perCase.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('  slowest single calls by case: ' + worst.map(([k, v]) => `${k}: ${fmt(v)}`).join('; '));

  const heavy = [...caseSum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log('  heaviest cases by mean: ' + heavy.map(([k, v]) => `${k}: ${fmt(v / ROUNDS)}`).join('; '));
  // control: the same timing loop around a call that does nothing, to show the machine's own jitter
  const ctl = new Float64Array(ROUNDS * cases.length);
  let ci = 0;
  const noop = (x) => x;
  for (let r = 0; r < ROUNDS; r++) for (const c of cases) { const t0 = performance.now(); noop(c); ctl[ci++] = performance.now() - t0; }
  ctl.sort();
  console.log(`control (empty call, same loop): p99 ${fmt(ctl[Math.floor(0.99 * ctl.length)])}  p99.9 ${fmt(ctl[Math.floor(0.999 * ctl.length)])}  max ${fmt(ctl[ctl.length - 1])}`);
  console.log(`layoutNames p99.9 ${fmt(pct(0.999))}; calls over 100 us: ${times.filter((t) => t > 0.1).length} of ${times.length}; over 200 us: ${times.filter((t) => t > 0.2).length}`);

  // chromeBlockers, called once per frame by the driver
  const tb = performance.now();
  for (let i = 0; i < 100000; i++) L.chromeBlockers({ width: 1440, height: 836, top: 0, inset: 0, phone: false, bottomCover: 0, card: i & 1 ? true : false });
  console.log(`chromeBlockers: mean ${fmt((performance.now() - tb) / 100000)}`);

  // allocation per call
  if (global.gc) {
    const pile = cases.filter((c) => c.label.includes('pile-up'));
    const N = 20000;
    for (const set of [{ name: 'all cases', list: cases }, { name: 'pile-up cases', list: pile }]) {
      global.gc();
      const h0 = process.memoryUsage().heapUsed;
      let calls = 0;
      for (let i = 0; calls < N; i++) { L.layoutNames(set.list[i % set.list.length].input); calls++; }
      const h1 = process.memoryUsage().heapUsed;
      console.log(`allocation (${set.name}): about ${Math.round((h1 - h0) / calls)} bytes per call` + (h1 < h0 ? ' (a GC ran inside the window; rerun with a larger --max-semi-space-size)' : ''));
    }
  }
}
main();
