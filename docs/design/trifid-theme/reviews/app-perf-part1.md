# Part 1 (data and gas) against the baseline: performance and regression checklist

- Commit measured: `761accb7` on `trifid-build` (tasks 1 to 5, plus Task 6's two changes to `GasField`: decoded gas images are freed after upload, and late gas images are uploaded only when the map is left alone).
- Date: 2026-10-05, 01:30 to 01:50 local time.
- Machine: MacBook Pro, Apple M1 Pro, 16 GB, shared with other work. Load average before the three runs: 4.5, 4.8, 6.3. Node v22.23.3 arm64, Google Chrome 154.0.8037.93 headless arm64, production build.
- Renderers: gpu `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`; software `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`.
- Baseline: `baseline/BASELINE-PERF.md` and `baseline/perf/` (today's site, commit `1e9ef508`). Budgets: `frontcreck/scripts/perf/budgets.json`, unchanged.

## Read this first: how these runs differ from the baseline's

**The laptop was on battery at 20% or less.** There Chrome's Energy Saver holds every page at 30 frames a second, so every frame gap reads 33 to 36 ms, on today's site exactly as on this build (checked: a drag on the baseline commit and on this one both drew 62 frames in 2 s, median gap 33.3 ms). The first three runs were taken like that before this was noticed; they are kept as `perf-part1/energy-saver-30fps-run1.json` to `run3.json` and their frame gaps are not used. No command-line switch turns Energy Saver off. The three runs reported here (`perf-part1/perf-run1.json` to `perf-run3.json` and `.txt`) were started as

```bash
node --import ./scripts/perf/no-energy-saver.mjs scripts/perf/perf.mjs
```

`scripts/perf/no-energy-saver.mjs` (new) makes the script's `chromium.launch()` start the same Chrome with the same arguments on a throwaway profile whose Energy Saver is off, and changes nothing else. With it the same drag draws 122 frames in 2 s (median gap 16.7 ms, worst 20.8). The baseline was measured at 60 frames a second with an ordinary launch, as was its dpr 2 column added in this task (battery was above 20% then).

What this does and does not affect:

- The gpu columns: comparable with the baseline. Startup, typing, select and frame gaps are in the baseline's range (tables).
- The software columns started more slowly on the throwaway profile than with an ordinary launch (search usable 241 ms against 109, map first frame 5129 ms against 3726 on software desktop). For the software columns' startup rows the ordinary-launch numbers are therefore given under each table as well; they are the ones to compare with the baseline. Software frame gaps come from the runs reported here.
- The hover runs used the same preload. There every fresh load is also a fresh browser, where the baseline reused one browser for its five loads. That can only make the first hover slower, not faster.
- **Not verified: the whole comparison should be run once more on mains power with an ordinary launch** (`npm run perf` three times, then the hover script), which is the baseline's exact method. It takes about fifteen minutes.

## Sizes (same in all runs)

| Measure | Baseline | Part 1 | Budget |
|---|---|---|---|
| First-load JS of `/`, gzip, with nomodule scripts | 190.5 KB | 191.1 KB (+0.6) | 200 KB |
| First-load JS of `/`, gzip, without nomodule scripts | 151.9 KB | 152.5 KB (+0.6) | reported only |
| three.js chunk in the first-load scripts | 0 KB | 0 KB | must be 0 |
| Server HTML of `/` | 28.3 KB | 28.3 KB | 150 KB |
| Server HTML of `/album/in-rainbows-radiohead` | 34 KB | 34 KB | 150 KB |

First-load JS is unchanged by Task 6 (191.1 KB after Task 5 and now); 8.9 KB of the budget are left for parts 2 and 3. Not on the first load: the lazy map chunk (three.js and the map) went from 248.2 KB to 252.7 KB gzip (+4.5 KB: the gas shader, `GasField` and the noise table code), measured on the two builds' `.next/static` files; the second map chunk is 10.8 KB before and 10.9 KB now. New downloads after first paint: `theme.json` 53.9 KB on disk and one gas image (188 KB for Balanced; Sonic 190 KB, Mood 141 KB, fetched only on an interactive map, at idle). The import check of the brief prints the five expected lines and no other (`canvas/GasField.tsx` and `shaders/gas.test.ts` import `shaders/gas`, `canvas/Scene.tsx` imports `GasField`, `shaders/gas.ts` and `shaders/gas.test.ts` import `theme`).

## Summary of medians (three runs)

| Median | software desktop | software phone | gpu desktop | gpu phone | gpu desktop2x |
|---|---|---|---|---|---|
| Startup worst long task (ms), now / baseline | **268 / 57** | **241 / 0** | 0 / 0 | 0 / 0 | 0 / 0 |
| Map first frame (ms) | 5129 / 4074 (ordinary launch: 3726) | 2403 / 2903 | 608 / 575 | 579 / 554 | 610 / 617 |
| Nebula visible (ms), after the map's first frame | 5423, +294 | 2669, +266 | 661, +53 | 622, +43 | 653, +43 |
| Transition worst frame gap (ms) | 1214 / 1355 | 747 / 784 | 24 / 28 | 24 / 18 | 25 / 27 |
| Morph worst frame gap (ms) | 105 / 153 | 133 / 114 | 19 / 18 | 19 / 18 | 18 / 18 |
| Drag worst frame gap (ms) | 116 / 95 | 96 / 79 | 20 / 19 | 21 / 19 | 21 / 18 |
| Zoom worst frame gap (ms) | 323 / 202 | 60 / 53 | 35 / 38 | 37 / 44 | 33 / 38 |
| Deep zoom drag worst frame gap (ms) | 70 / none | 56 / none | 19 / 18 | 19 / 19 | 21 / 19 |
| Deep zoom, slider between stops, worst frame gap (ms) | 71 / none | 56 / none | 18 / 18 | 19 / 18 | 18 / 17 |
| Long tasks while idle, frames while idle | 0, 0 | 0, 0 | 0, 0 | 0, 0 | 0, 0 |

On the GPU the gas costs no frame: every frame gap but the zoom row's is one frame (18 to 25 ms; a dropped frame reads 33), at device pixel ratio 1 and 2, at the overview and in the worst case (full zoom with the slider between stops: 18, 19 and 18 ms). The zoom row reads 33 to 37 ms, as it does in the baseline (38 to 44). The two rows closest to their limit in the baseline did not get worse: gpu phone zoom 37 ms (baseline 44, budget 50) and first-load JS 191.1 KB (budget 200). **One budget is missed: the startup long task on a software renderer** (section "What got worse").

## Every run, per combination

The baseline of the two deep zoom rows in the gpu desktop and gpu phone columns comes from three extra runs of today's site (commit `6f10463e`) with the extended script, `npm run perf -- --mode gpu --no-gas`, kept as `perf-part1/baseline-gpu-deep-run1.json` to `run3.json`; the baseline folder itself has them only for dpr 2. The software columns have no baseline for those rows.

### software desktop

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 250 | 237 | 241 | 241 | 121 | 92 to 137 | 1000 | worse |
| Startup worst long task (ms) | 262 | 268 | 273 | 268 | 57 | 0 to 122 | 250 | worse, MEDIAN OVER BUDGET |
| Map first frame (ms) | 5243 | 5129 | 5083 | 5129 | 4074 | 3937 to 4267 | reported only | worse |
| Nebula visible (ms) | 5533 | 5423 | 5382 | 5423 | none | none | reported only | no baseline; 294 ms after the map's first frame |
| Typing to suggestions (ms) | 6 | 5 | 5 | 5 | 6 | 5 to 6 | 100 | same |
| Select to album (ms) | 28 | 21 | 24 | 24 | 24 | 17 to 35 | 200 | same |
| Transition worst frame gap (ms) | 1214 | 1351 | 850 | 1214 | 1355 | 1296 to 1642 | 50 (GPU only; not checked in software) | better |
| Slider to list (ms) | 25 | 15 | 16 | 16 | 8 | 7 to 13 | 150 | worse |
| Morph worst frame gap (ms) | 101 | 184 | 105 | 105 | 153 | 141 to 219 | 50 (GPU only; not checked in software) | better |
| Drag worst frame gap (ms) | 116 | 106 | 118 | 116 | 95 | 85 to 105 | 50 (GPU only; not checked in software) | worse |
| Zoom worst frame gap (ms) | 247 | 336 | 323 | 323 | 202 | 189 to 226 | 50 (GPU only; not checked in software) | worse |
| Deep zoom drag worst frame gap (ms) | 76 | 65 | 70 | 70 | none | none | reported only | no baseline; beside the same column's drag: now 116, baseline 95 |
| Deep zoom, slider between stops, worst frame gap (ms) | 70 | 71 | 71 | 71 | none | none | reported only | no baseline; beside the same column's morph: now 105, baseline 153 |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: [[5171, 52], [5270, 262]]; [[5154, 268]]; [[5109, 273]].
The same column in the three runs taken with an ordinary launch while Energy Saver held Chrome at 30 frames a second (frame gaps there are not comparable): search usable 146/80/109, startup worst long task 286/270/276, map first frame 3902/3726/3478, nebula visible 4214/4026/3775, typing 6/5/5, select 30/19/18, slider to list 16/20/14, idle long tasks 0/0/0, idle frames 0/0/0.

### software phone

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 447 | 194 | 71 | 194 | 127 | 80 to 179 | 1000 | worse |
| Startup worst long task (ms) | 245 | 241 | 238 | 241 | 0 | 0 to 0 | 250 | worse |
| Map first frame (ms) | 2419 | 2403 | 2132 | 2403 | 2903 | 2811 to 3028 | reported only | better |
| Nebula visible (ms) | 2690 | 2669 | 2396 | 2669 | none | none | reported only | no baseline; 266 ms after the map's first frame |
| Typing to suggestions (ms) | 5 | 4 | 4 | 4 | 5 | 4 to 5 | 100 | same |
| Select to album (ms) | 19 | 17 | 69 | 19 | 18 | 17 to 77 | 200 | same |
| Transition worst frame gap (ms) | 747 | 726 | 751 | 747 | 784 | 738 to 892 | 50 (GPU only; not checked in software) | same |
| Slider to list (ms) | 27 | 19 | 23 | 23 | 16 | 7 to 181 | 150 | same |
| Morph worst frame gap (ms) | 133 | 144 | 119 | 133 | 114 | 112 to 119 | 50 (GPU only; not checked in software) | worse |
| Drag worst frame gap (ms) | 96 | 81 | 104 | 96 | 79 | 74 to 117 | 50 (GPU only; not checked in software) | same |
| Zoom worst frame gap (ms) | 58 | 60 | 64 | 60 | 53 | 49 to 55 | 50 (GPU only; not checked in software) | worse |
| Deep zoom drag worst frame gap (ms) | 56 | 57 | 46 | 56 | none | none | reported only | no baseline; beside the same column's drag: now 96, baseline 79 |
| Deep zoom, slider between stops, worst frame gap (ms) | 56 | 63 | 47 | 56 | none | none | reported only | no baseline; beside the same column's morph: now 133, baseline 114 |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true, true], [true, true], [true, true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: [[2444, 245]]; [[2428, 241]]; [[2156, 238]].
The same column in the three runs taken with an ordinary launch while Energy Saver held Chrome at 30 frames a second (frame gaps there are not comparable): search usable 113/80/143, startup worst long task 261/261/258, map first frame 2815/2767/2870, nebula visible 3100/3065/3158, typing 4/5/5, select 17/21/17, slider to list 16/16/25, idle long tasks 0/0/0, idle frames 0/0/0.

### gpu desktop

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 86 | 110 | 84 | 86 | 84 | 83 to 97 | 1000 | same |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 | 0 to 345 | 250 | same |
| Map first frame (ms) | 584 | 631 | 608 | 608 | 575 | 574 to 907 | reported only | same |
| Nebula visible (ms) | 637 | 680 | 661 | 661 | none | none | reported only | no baseline; 53 ms after the map's first frame |
| Typing to suggestions (ms) | 8 | 5 | 7 | 7 | 7 | 6 to 10 | 100 | same |
| Select to album (ms) | 30 | 19 | 21 | 21 | 22 | 21 to 24 | 200 | same |
| Transition worst frame gap (ms) | 24 | 30 | 21 | 24 | 28 | 27 to 28 | 50 | better |
| Slider to list (ms) | 17 | 16 | 13 | 16 | 12 | 7 to 16 | 150 | same |
| Morph worst frame gap (ms) | 19 | 19 | 18 | 19 | 18 | 18 to 20 | 50 | same |
| Drag worst frame gap (ms) | 20 | 19 | 20 | 20 | 19 | 18 to 21 | 50 | same |
| Zoom worst frame gap (ms) | 38 | 35 | 31 | 35 | 38 | 34 to 43 | 50 | same |
| Deep zoom drag worst frame gap (ms) | 19 | 20 | 19 | 19 | 18 (today's site, extra runs with the extended script) | 17 to 18 | reported only; 50 as yardstick | worse |
| Deep zoom, slider between stops, worst frame gap (ms) | 18 | 22 | 18 | 18 | 18 (today's site, extra runs with the extended script) | 17 to 18 | reported only; 50 as yardstick | same |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: []; []; [].
The same column in the three runs taken with an ordinary launch while Energy Saver held Chrome at 30 frames a second (frame gaps there are not comparable): search usable 104/93/70, startup worst long task 0/0/0, map first frame 682/639/614, nebula visible 717/673/647, typing 6/5/6, select 20/26/21, slider to list 5/5/14, idle long tasks 0/0/0, idle frames 0/0/0.

### gpu phone

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 76 | 258 | 77 | 77 | 74 | 72 to 78 | 1000 | same |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 250 | same |
| Map first frame (ms) | 579 | 755 | 570 | 579 | 554 | 551 to 562 | reported only | worse |
| Nebula visible (ms) | 620 | 805 | 622 | 622 | none | none | reported only | no baseline; 43 ms after the map's first frame |
| Typing to suggestions (ms) | 4 | 4 | 5 | 4 | 5 | 4 to 6 | 100 | same |
| Select to album (ms) | 18 | 18 | 18 | 18 | 19 | 18 to 19 | 200 | same |
| Transition worst frame gap (ms) | 270 | 18 | 24 | 24 | 18 | 18 to 18 | 50 | worse |
| Slider to list (ms) | 18 | 9 | 19 | 18 | 13 | 12 to 15 | 150 | worse |
| Morph worst frame gap (ms) | 19 | 20 | 18 | 19 | 18 | 17 to 18 | 50 | worse |
| Drag worst frame gap (ms) | 21 | 22 | 19 | 21 | 19 | 19 to 22 | 50 | same |
| Zoom worst frame gap (ms) | 35 | 38 | 37 | 37 | 44 | 42 to 53 | 50 | better |
| Deep zoom drag worst frame gap (ms) | 23 | 19 | 18 | 19 | 19 (today's site, extra runs with the extended script) | 18 to 19 | reported only; 50 as yardstick | same |
| Deep zoom, slider between stops, worst frame gap (ms) | 19 | 18 | 19 | 19 | 18 (today's site, extra runs with the extended script) | 17 to 18 | reported only; 50 as yardstick | worse |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true, true], [true, true], [true, true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: []; []; [].
The same column in the three runs taken with an ordinary launch while Energy Saver held Chrome at 30 frames a second (frame gaps there are not comparable): search usable 75/71/70, startup worst long task 0/0/0, map first frame 630/593/583, nebula visible 664/626/616, typing 5/4/4, select 20/17/18, slider to list 8/14/14, idle long tasks 0/0/0, idle frames 0/0/0.

### gpu desktop2x

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 97 | 89 | 79 | 89 | 106 | 88 to 114 | none (reported only) | same |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | none (reported only) | same |
| Map first frame (ms) | 616 | 610 | 597 | 610 | 617 | 577 to 640 | none (reported only) | same |
| Nebula visible (ms) | 660 | 649 | 653 | 653 | none | none | none (reported only) | no baseline; 43 ms after the map's first frame |
| Typing to suggestions (ms) | 5 | 6 | 5 | 5 | 6 | 5 to 6 | none (reported only) | same |
| Select to album (ms) | 19 | 21 | 19 | 19 | 21 | 19 to 25 | none (reported only) | same |
| Transition worst frame gap (ms) | 25 | 30 | 21 | 25 | 27 | 26 to 28 | none; 50 as yardstick | better |
| Slider to list (ms) | 14 | 8 | 12 | 12 | 6 | 5 to 8 | none (reported only) | worse |
| Morph worst frame gap (ms) | 18 | 18 | 21 | 18 | 18 | 18 to 19 | none; 50 as yardstick | same |
| Drag worst frame gap (ms) | 27 | 21 | 20 | 21 | 18 | 18 to 18 | none; 50 as yardstick | worse |
| Zoom worst frame gap (ms) | 33 | 40 | 33 | 33 | 38 | 30 to 39 | none; 50 as yardstick | same |
| Deep zoom drag worst frame gap (ms) | 21 | 21 | 19 | 21 | 19 | 18 to 19 | none; 50 as yardstick | worse |
| Deep zoom, slider between stops, worst frame gap (ms) | 21 | 18 | 18 | 18 | 17 | 17 to 18 | none; 50 as yardstick | same |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | none (reported only) | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | none (reported only) | same |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: []; []; [].
The same column in the three runs taken with an ordinary launch while Energy Saver held Chrome at 30 frames a second (frame gaps there are not comparable): search usable 75/67/73, startup worst long task 0/0/0, map first frame 630/630/630, nebula visible 663/664/663, typing 5/5/6, select 21/24/20, slider to list 5/9/11, idle long tasks 0/0/0, idle frames 0/0/0.

## Budget results per run

- Run 1: software desktop: startup long task 262 ms > 250 ms; gpu phone: transition frame gap 270 ms > 50 ms
- Run 2: software desktop: startup long task 268 ms > 250 ms
- Run 3: software desktop: startup long task 273 ms > 250 ms

The software desktop miss is in every run and its median is over budget: it is real and is explained below. The gpu phone transition gap of 270 ms is a single run (18 and 24 ms in the other two, 35 ms, which is one frame at 30 a second, in each of the three Energy Saver runs); its cause was not found, and the baseline has single outliers of the same kind (a 345 ms startup long task, a 181 ms slider to list). The three Energy Saver runs each missed the two software startup long task budgets (desktop 286, 270, 276 ms; phone 261, 261, 258 ms) and two of them the gpu desktop zoom gap (54 ms, which is two frames at 30 a second and says nothing about the build).

## Hover path

`baseline/hover-measure.mjs`, five fresh loads per mode, with the Energy Saver preload (see the top). Raw: `app-hover-part1.json`, `app-hover-part1.txt`. Median (min to max), ms; baseline in brackets.

| | gpu 1st | gpu 2nd | gpu 3rd | software 1st | software 2nd | software 3rd |
|---|---|---|---|---|---|---|
| Pointer move to tip visible | 152 (147.1 to 155.7) [150.3 (135.7 to 169.3)] | 101.8 (88.3 to 114.4) [101.2 (90.6 to 106.8)] | 90.8 (84.9 to 101.9) [90.3 (89.7 to 115.7)] | 133.4 (131.7 to 146.7) [135.5 (133 to 149.4)] | 91 (87.9 to 104.6) [91.6 (85.9 to 107.7)] | 92.4 (86.6 to 93.2) [88.1 (84.9 to 93.1)] |
| Longest long task | 0 (0 to 0) [0 (0 to 55)] | 0 [0] | 0 [0] | 0 [0] | 0 [0] | 0 [0] |
| Longest frame gap | 33.3 (16.8 to 33.4) [33.3 (16.8 to 50)] | 16.8 (16.7 to 16.8) [16.8 (16.7 to 16.8)] | 16.8 (16.8 to 16.8) [16.8 (16.7 to 16.8)] | 83.3 (66.7 to 83.4) [66.7 (49.9 to 66.7)] | 99.9 (66.7 to 100) [66.7 (66.7 to 83.3)] | 100 (83.4 to 100.1) [66.7 (50.1 to 83.4)] |

Every hover drew 3 map frames, as in the baseline. On the GPU all nine medians lie inside the baseline's range and no load had a long task (the baseline had one of 55 ms). On the software renderer the time to the tip is unchanged and the longest frame gap grew by one frame (16.7 ms) on the first hover and by two on the later ones: each of the three frames of a hover now shades the gas on the CPU.

## What got worse, and why

By the rule of the brief a median above the baseline's worst run is "worse". Every such row:

**Over budget, not fixed: the startup long task on a software renderer.** Software desktop 268 ms (262 to 273; budget 250; baseline 57, 0 to 122), software phone 241 ms (238 to 245; baseline 0). With an ordinary launch: desktop 276 ms (270 to 286), phone 261 ms (258 to 261), so both columns are over budget there. It is one task, the upload of the first gas image (a 2048 px texture and its mips) to SwiftShader on the main thread; it starts about 25 ms after the map's first frame (`startupLongTasks` in the raw JSON) and the same call was timed directly at 220 to 380 ms for the next image during a drag and 90 to 100 ms at rest (`app-part1/late-gas-before.txt`, `late-gas-after.txt`). On the GPU the same upload takes 6 to 11 ms and the startup long task is 0 in all nine gpu column runs. Both ways of counting, as asked: the baseline's script stopped collecting long tasks 4 s after load; this script also waits for the nebula. On software phone the task lies inside the 4 s either way (it starts at 2.2 to 2.4 s). On software desktop it starts at 5.1 to 5.3 s on the throwaway profile and at 3.5 to 3.9 s with an ordinary launch, so the baseline's window would have caught it in some runs and missed it in others; it is counted here in all. The brief's cheaper version for this row (a longer idle timeout before the other two images) does not touch it: the task is the first image, and the other two are now uploaded only at rest (below). What would: a 1024 px image on slow renderers (a quarter of the upload), or warming the upload path in the existing WebGL warm-up worker. Neither was built: both change what is loaded or how the map starts, and the first also the look. **Stopped here for the owner**: accept it for software renderers (where every map frame already takes 60 to 300 ms), or have one of the two built.

**Software frame gaps (reported, not budgeted).** The gas is shaded on the CPU there. Software desktop: drag 116 ms (baseline 95, +21), zoom 323 ms (202, +121); transition and morph are inside or under the baseline's range. Software phone: morph 133 ms (114, +19), zoom 60 ms (53, +7), drag 96 ms (79; the baseline's runs reach 117). Deep zoom rows 56 to 71 ms, lower than the same columns' overview drag. Accepted: this is the cost of shading every pixel without a GPU, and it has no cheaper version that keeps the look.

**Software desktop search usable 241 ms (baseline 121) and map first frame 5129 ms (4074); software phone search usable 194 ms (127).** An effect of the throwaway profile on the software renderer's start, not of the build: with an ordinary launch the same build gave 146, 80, 109 ms and 3902, 3726, 3478 ms on software desktop (inside or better than the baseline) and 113, 80, 143 ms on software phone.

**Slider to list, every column: 5 to 8 ms slower** (gpu desktop 16 ms against 12, in range; gpu phone 18 against 13; dpr 2 12 against 6; software desktop 16 against 8; software phone 23 against 16), budget 150. The measure ends at the first animation frame after the list changed, and the frame that starts the morph now also binds the second stop's gas for the first time. That is the likely cause; it was not isolated. Accepted at a ninth of the budget, and named here so parts 2 and 3 can watch it.

**GPU frame gaps one to three ms over the baseline's worst run** (gpu desktop deep zoom drag 19 against 17 to 18; gpu phone morph 19 against 17 to 18 and deep zoom morph 19 against 17 to 18; dpr 2 drag 21 against 18 and deep zoom drag 21 against 18 to 19). All are one frame at 60 a second plus timer jitter; none is a dropped frame, which reads 33 ms. Not a finding beyond the rule's wording.

**gpu phone transition 24 ms (baseline 18 in all three runs)**, and its single run of 270 ms. 24 ms is one late frame, not a dropped one; gpu desktop reads 24 (baseline 28) and dpr 2 reads 25 (27) for the same step. Accepted; the 270 ms run is unexplained (above).

**gpu phone map first frame 579 ms (baseline 554, 551 to 562).** 25 ms later; gpu desktop (608 against 575, in range) and dpr 2 (610 against 617) do not show it. Not isolated. The nebula follows the first frame by 43 to 53 ms on the GPU.

## What was dropped or made cheaper for speed

Nothing of the look. None of the six cheaper versions of the brief was applied: no gpu median is over 50 ms or above the baseline's worst run by more than jitter, at dpr 1 or 2, including the worst case (deep zoom with the slider between stops: 18, 19, 18 ms). The glow, the detail octaves, the deep zoom blur and the full shader on phones are all in.

Two things were changed for speed, neither visible:

1. **Decoded gas images are freed after upload** (commit `2b29135a`). Three 2048 px images, 16 MB each decoded, were kept for the life of the map only so a restored WebGL context could upload them again. After a lost context they are now fetched again from the HTTP cache. Browser test: "the gas comes back after the WebGL context is lost and restored".
2. **Late gas images are uploaded only when the map is left alone** (commit `761accb7`). Measured with `app-part1/late-gas-measure.mjs`, which holds the two late images back and releases them 700 ms into a 3.5 s drag (four loads each; a control drag with all images in):

| Worst frame gap of the drag, median (max), ms | Control | Before | After |
|---|---|---|---|
| gpu desktop, drag | 17.8 (18.2) | 26.6 (35) | 17.6 (18.5) |
| gpu phone, drag | 18.1 (19.5) | 25.7 (37.7) | 18.5 (20.3) |
| gpu desktop, wheel zoom | 35.6 (37.6) | 33.5 (35.6) | 33.6 (34.9) |
| software desktop, drag | 96 (414) | 270 (389), two long tasks per load of 221 to 379 and 98 to 115 ms | 98 (107), no long task |

Before, both uploads ran back to back inside the drag (6 to 11 ms each on the GPU): one dropped frame in most loads, under the 50 ms budget but worse than the control, and two long tasks per load on the software renderer. After, no gas upload runs inside the gesture in any mode (0 ms against 12 to 20 ms on the GPU and 325 to 490 ms in software); the images go in one at a time once 250 ms have passed without input or a drawn frame and the main thread is idle. The wheel zoom rows did not change because their worst gap comes from the cover sheets the zoom loads (uploads of 12 to 35 ms each, in the control too; one "after" load had a 52 ms gap outside the arrival window from such a sheet). That is today's site's behaviour and was left alone; it is the reason the zoom row sits near its budget. Browser test: "gas images that arrive during a drag are not uploaded until the map is left alone". Raw: `app-part1/late-gas-before.txt` and `.json` (before; these were taken at 60 frames a second, before the battery fell to 20%), `late-gas-after.txt` and `.json`.

## Luma read by the gas browser tests (for part 3's thresholds)

Software WebGL, 1440 x 900, with the old brown pane still behind the canvas. Test 1 (overview, 80 px patch on In Rainbows, median): 165.8 (bound 18.6). Test 2: beside the open album 96.1, the same patch with the album closed 195.2. Test 3: bare gas at full zoom 26.5, the same point at 32 px covers 85.4. Test 4 (300 px middle of the window): 143.2 with Balanced standing in for Mood, 124.8 with Mood in (bound 12.4). Context test: 165.8 before the loss and 165.8 after.

## Regression checklist

`baseline/REGRESSION-CHECKLIST.md`, 234 items in 18 sections, against the build of commit `761accb7`. How it was walked, so nobody reads more into it than was done:

- **Screenshots.** `baseline/capture.mjs` was run on this build (gpu Chrome, as the baseline; two phone states timed out on `page.goto` in the full run and were taken again alone without trouble: `explore-here`, `reduced-motion`). All 186 files have the baseline's names. Every pair was compared pixel by pixel (a pixel counts as different when its three channels differ by more than 36 in sum): 47 pairs are identical, among them every shot that shows no map (the album panel, the search sheet, About, the trail, toasts, the no-WebGL pages, the error state) and the full zoom shots, where the faint gas is within that tolerance of the old pane. In the other 139 the different pixels lie inside the map pane (the boxes start under the 64 px header and right of the album panel, or are crops of the map). Opened by eye, baseline beside part 1: `map-covers-dense-fade-crop`, `map-covers-dense-crop`, `selected-dense-crop`, `hover-map-album-crop` (saved side by side in `app-part1/covers/`), and the overview, album and full zoom states at 1600 x 1000 for the fidelity check. **The other pairs were not opened by eye.**
- **Browser tests.** The whole suite ran, one worker: desktop 102 passed, 13 skipped (phone only), 2 failed; phone 68 passed, 47 skipped, 2 failed; no-WebGL 2 passed. The failures: the expected one in both projects (below); on desktop the new deep zoom gas test once, because it read a flag before the frame that writes it had been drawn while another job loaded the machine (it now polls the flag; 4 of 4 reruns pass); on phone `"Explore this area" drops the album and leaves the map where it was` once, the camera's y off by 0.00011 world units (4 of 4 reruns pass, desktop 4 of 4). That phone failure was not explained beyond "it did not repeat"; part 1 does not touch the camera.
- **Unit tests** 325 pass (321 before Task 6), typecheck and lint clean. **Greps**: `grep -rn "blur(\|backdrop-filter\|mix-blend" src` returns only the `.blur()` focus calls of `SearchBox.tsx` and its test. `shaders/album.ts`, `canvas/AlbumField.tsx`, `canvas/AtlasManager.tsx` and every stylesheet are byte for byte the baseline's (`git diff 6f10463e HEAD` is empty for them), so the way covers, dots, hover marks, markers, lines and badges are drawn cannot have changed; only what is behind them has.
- **Perf budgets**: sections above.
- **"Manual:" probes** were not done (no browser was started for them): routed to part 3, listed at the end.

| Section | Items | Hold | Not simply holding |
|---|---|---|---|
| 1. Overlapping covers on the map | 23 | 18 | 1 changed on purpose, 4 wait for part 2 or 3 (and the manual half of 5 items routed) |
| 2. Hover on the map | 14 | 6 | 1 waits for part 2, 7 routed |
| 3. Selection in Explore and the card | 13 | 9 | 1 waits for part 3, 3 routed |
| 4. Dots turning into covers by zoom | 7 | 4 | 3 routed |
| 5. Album view: marker and neighbour layout | 14 | 13 | 1 routed |
| 6. Lines, rank badges and the two-way hot link | 7 | 7 | |
| 7. Trail of visited albums, and toasts | 11 | 9 | 2 routed |
| 8. Keyboard | 11 | 11 | |
| 9. Focus management and focus rings | 16 | 14 | 2 routed |
| 10. Search | 15 | 15 | |
| 11. Similarity slider | 10 | 7 | 3 routed |
| 12. URL, state restore, Back, titles | 10 | 8 | 2 routed |
| 13. Camera | 13 | 8 | 5 routed |
| 14. Reduced motion | 10 | 6 | 4 routed |
| 15. Loading and error states | 12 | 10 | 2 routed (one of them also changed on purpose in what follows it) |
| 16. Phone (under 900 px) | 19 | 17 | 2 routed |
| 17. Home, About, header, ambient colour, contrast, copy | 19 | 17 | 2 changed on purpose |
| 18. Performance niceties | 10 | 8 | 2 regressed on software renderers only (both rest on the startup long task budget) |

"Hold" means the item's own check (its test, grep or unit test) passes, or its screenshot differs from the baseline only in the map background. No item of sections 1 to 6 or 13 was found regressed.

Items that do not simply hold:

- "Canvas and renderer settings." (section 1): **changed on purpose in part 1.** The canvas settings are the same, but the gas quad is opaque, so the album's colour wash no longer shows through the map under the dots (`album-open`).
- "Ambient colour wash behind an album." (section 17): **changed on purpose in part 1**, the same thing: the panel half of the wash is unchanged, the map half is now hidden under the gas. Its e2e test passes (it reads the styles, not the pixels). Part 3 decides what becomes of the map half.
- "Dimmed map behind Home, About and 404: fainter, slightly larger dots" (section 17): **changed on purpose in part 1**: the dots are as before and the gas is behind them at 0.6 of its strength, under the old veil (`home-top`, `about`, `notfound`).
- "Before the map data loads: a quiet empty pane." (section 15): **changed on purpose in part 1** in what follows it: the pane is the old brown until the first gas image is in (43 to 53 ms after the map's first frame on the GPU, about 280 ms on software), then gas. The brown flash goes when part 3 makes the pane the sky colour. Its manual probe is routed.
- "Material settings: transparent, depth write on, standard alpha blending, no tone mapping.", "Other covers dim to 50% while an album is picked in Explore." (section 1) and "Cover mode: the shader draws the picked cover large with a lamp frame" (section 3): **wait for part 3.** Their shared e2e test, `explore.spec.ts` "in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed", fails as the brief expected: it measures the dimming against the old pane's luma of 19 and there is gas behind the covers now (desktop: dimmed 57.4, limit 45.3; phone: 59.8, limit 46.4). The behaviour itself holds by eye: in `selected-dense-crop` the picked cover is large and framed and the others are at half alpha in the same piles as the baseline. Part 3 rewrites the check (its Task 7). Not touched here.
- "Dots are 78% opaque and add up where they overlap." (section 1) and "Hover mark on a dot: a paper ring of radius 7 with a paper centre" (section 2): **wait for part 2.** Both are drawn exactly as before, but over the bright cream gas today's warm dots and the thin ring have little contrast (`hover-map-album-crop`: the ring on In Rainbows is hard to find). Part 2 replaces the dots with stars; the ring's contrast over bright gas should be looked at there.
- "Cross-fade band: covers are tinted and see-through between 16 and 32 px." (section 1): **waits for part 2 or 3**, as a legibility note, not a change: see "Covers over the gas" below.
- "Grain overlay sits over the map too." (section 1): holds; part 3 removes the grain on purpose.
- "A lost WebGL context recovers, or gives way to the message after 3 s." (section 15): the recover half is now covered by a browser test (the gas test forces a loss and a restore); the 3 s message half stays a manual probe, routed.
- "All budgets." and "WebGL is warmed up in a worker." (section 18): **regressed on software renderers only**: `startupLongTaskMs` 250 is missed on software desktop (268 ms) in every run. Not fixed; see "What got worse".

### Covers over the gas (the picked cover and the overlapping covers)

Compared with `map-covers-dense-fade-crop`, `retina-map-covers-dense-fade-crop`, `selected-dense-crop` and `map-covers-dense-crop` (Milestones, the baseline's dense spot; side by side in `app-part1/covers/`): the sprites are unchanged. The same soft, tinted, slightly see-through tiles in the 16 to 32 px band, the same piles with the same cover on top, the picked cover large with its frame, the others at half alpha. The only difference is the background: dim blue-grey gas instead of the brown pane. That spot is in dim gas, so the same four states were also taken on the brightest cream gas, around In Rainbows (`app-part1/covers/bright-*.jpg`, software WebGL). Plainly:

- **Full-size covers (32 px and over)**: legible. The gas has yielded to 0.3 of its strength there and reads as a mid-dark taupe; covers stand clear of it.
- **A pick at 32 px**: the picked cover is crisp and framed. The other covers, at half alpha, let the gas through and look washed out; they are still recognisable, less so than over the old dark pane.
- **The cross-fade band (about 23 px)**: weakest. The tiles are small, pale and see-through by design, and over the brightest gas (still at about 0.57 of its strength) many of them have little contrast; pale tiles nearly merge with the cream. They are easy to see over dim gas (the Milestones crops). Nothing was changed: the tiles are today's, and whether the band needs help over bright gas is a question for part 2, which redraws the albums.

### Manual probes, routed to part 3

None of these was done here. Each line gives the section, the item and the probe's own words.

- 1 **One draw call; the later album paints over the earlier one.** (also checked another way; the manual part is routed): "Manual: zoom to covers, note a pair, reload, same cover on top."
- 1 **Depth layers: who is raised above the pile.** (also checked another way; the manual part is routed): "Manual: hover a half-covered cover; it comes to the front with its square mark."
- 1 **Cross-fade band: covers are tinted and see-through between 16 and 32 px.** (also checked another way; the manual part is routed): "Manual: `__rmr.map.setCamera({x:0,y:0,zoom:4.6})` on a desktop window (covers at 24 px, half faded); compare `map-covers`."
- 1 **Atlas filtering: trilinear with mipmaps, no anisotropy.** (also checked another way; the manual part is routed): "Manual: slow wheel zoom from dots to covers; no shimmering."
- 1 **An album whose sheet has not loaded stays a dot among covers.** (also checked another way; the manual part is routed): "Manual: throttle the network, zoom in fast."
- 2 **80 ms settle before the label and mark appear.** (also checked another way; the manual part is routed): "Manual: fast sweep shows nothing."
- 2 **Label placement and edge avoidance.** (manual only): "Manual: hover albums in each corner of the map; the label stays 8 px inside. `hover-map-album`."
- 2 **Label shows and hides at once (no fade), and is hidden when empty.** (manual only): "Manual: move off an album; the label is gone in the same frame."
- 2 **No hover right after a click until the mouse moves 4 px.** (manual only): "Manual: click an album in Explore and keep the mouse still; only the card shows."
- 2 **Hover follows the camera under a resting mouse.** (manual only): "Manual: rest the mouse on the map and press `+` on the keyboard with the canvas focused."
- 2 **Cursor shape.** (manual only): "Manual."
- 2 **The hover mark gets its own frame.** (manual only): "Manual: with the map idle, rest on a dot; the ring shows."
- 2 **Hover ends when the map stops taking input or the mouse leaves.** (manual only): "Manual: hover an album in Explore, press the wordmark link with the keyboard; no label remains on Home."
- 3 **The switch between ring and frame happens at half fade, and only with the sheet loaded.** (also checked another way; the manual part is routed): "Manual: pick a dot, zoom in slowly."
- 3 **Clicking the picked album again flies back to it.** (manual only): "Manual."
- 3 **The card rises in on every pick.** (manual only): "Manual: pick two albums in a row."
- 3 **Reset with a card open goes to the picked album.** (manual only): "Manual: pick, pan away, press the third zoom button."
- 4 **Sheets load one at a time, the most visible first.** (manual only): "Manual with a throttled network: the area in view fills first."
- 4 **A failed sheet does not block the rest.** (manual only): "Manual: block `/data/atlas-1.webp` in dev tools, zoom in."
- 4 **A sheet arriving draws a frame by itself.** (manual only): "Manual: zoom in with the buttons and take hands off."
- 5 **Markers appear only once placed.** (manual only): "Manual: open an album from Home and watch the map."
- 7 **Older items are cut off with an ellipsis.** (manual only): "Manual: visit five albums."
- 7 **Toast call site 2: clipboard fallback, success or the link in words.** (also checked another way; the manual part is routed): "Manual: deny clipboard permission and press the button."
- 7 **Toast call site 3: "Surprise me" when the albums did not load.** (manual only): "Manual: block `/data/albums.json`, press "Surprise me" on Home."
- 9 **Map canvas focus ring is inset.** (manual only): "Manual: Tab to the map in Explore."
- 9 **Clicking a slider stop name moves focus to the slider.** (manual only): "Manual."
- 11 **The thumb snaps; there are no in-between values.** (manual only): "Manual: drag slowly."
- 11 **In Explore a stop change never moves the camera.** (manual only): "Manual: `__rmr.map.getCamera()` before and after a stop change in Explore."
- 11 **The list reorders with a glide (FLIP).** (manual only): "Manual: change the stop beside an album; perf budget `sliderToListMs` 150."
- 12 **Back and Forward restore the stop of that history entry.** (manual only): "Manual: open an album, set Mood, open a neighbour, set Sonic, press Back."
- 12 **Share metadata.** (manual only): "Manual: view source of an album page."
- 13 **A window resize refits only if you have not touched the map.** (manual only): "Manual."
- 13 **Zoom limits.** (manual only): "Manual: `__rmr.map.zoomBy(1000)` then `__rmr.map.getCamera().zoom` is 28; `zoomBy(0.0001)` gives 0.8 times the overview zoom."
- 13 **Fling after a flick, none after a hold.** (manual only): "Manual on a trackpad or mouse."
- 13 **Pinch zoom on touch, anchored between the fingers, with no fling after.** (also checked another way; the manual part is routed): "Manual on a phone."
- 13 **Camera glides ease out, and zoom is interpolated on a log scale.** (manual only): "Manual."
- 13 **Your own input always wins over a glide.** (manual only): "Manual."
- 13 **The map draws only when something changes.** (also checked another way; the manual part is routed): "Manual: read `__rmr.frames` twice a few seconds apart."
- 14 **Camera glides jump.** (manual only): "Manual with the OS setting on: press Reset."
- 14 **No fling.** (manual only): "Manual."
- 14 **Wheel zoom is immediate but still anchored at the cursor.** (manual only): "Manual."
- 14 **The list does not glide.** (manual only): "Manual."
- 15 **Before the map data loads: a quiet empty pane.** (manual only): "Manual with a throttled network on `/map`."
- 15 **A lost WebGL context recovers, or gives way to the message after 3 s.** (manual only): "Manual: `document.querySelector('canvas.map-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()` and wait 3 s."
- 16 **The strip loads nothing on desktop.** (manual only): "Manual: network tab on a desktop album page with WebGL off."
- 16 **The Explore card is a bottom sheet resting on the slider panel.** (manual only): "Manual on a phone viewport: pick an album in Explore."
