# Part 1 (data and gas) against the baseline: performance and regression checklist

- Commit measured: `6c225edd` on `trifid-build` (tasks 1 to 5, Task 6's changes to `GasField`, and fix round 1).
- Date: 2026-10-05, 02:40 to 03:25 local time. **On mains power, with an ordinary launch: plain `npm run perf`, three times, and `baseline/hover-measure.mjs`, exactly as the baseline was taken.** No preload, no changed browser arguments.
- Machine: MacBook Pro, Apple M1 Pro, 16 GB, shared with other sessions the whole time. Each run waited up to fifteen minutes for the one-minute load to fall under 4; it never did. Load before the runs: 6.5, 5.9, 6.1 (the baseline was taken at 5 to 13). Node v22.23.3 arm64, Google Chrome 154.0.8037.93 headless arm64, production build.
- Renderers: gpu `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`; software `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`.
- Baseline: `baseline/BASELINE-PERF.md` and `baseline/perf/` (today's site, commit `1e9ef508`). Budgets: `frontcreck/scripts/perf/budgets.json`, unchanged.
- Raw: `perf-part1/perf-run1.json` to `perf-run3.json` and `.txt`, `app-hover-part1.json` and `.txt`.

## Headline

**Budgets.** Runs 1 and 3 met every budget. Run 2 missed one: software desktop "select to album" 240 ms against 200 (25 and 33 ms in the other two runs, 17 to 35 in the baseline), a single run on a loaded machine; its median is 33 ms. No median is over budget. The startup long task on software renderers, which missed its budget in every earlier run of part 1 on both software columns (268 and 276 ms on desktop, 241 and 261 ms on phone, depending on the launch), is now 155 ms on desktop (120 to 164) and 0 ms on phone, against a budget of 250.

**Still worse than the baseline** (median above the baseline's worst run), every row, with its cause; details in "What is still worse":

| Row | Now | Baseline | Cause |
|---|---|---|---|
| software desktop, startup long task | 155 ms (120 to 164) | 57 ms (0 to 122) | Not the gas. It is the same task as in the baseline, the main-thread WebGL probe that starts the moment the warm-up worker gives up (same timestamp as "warm-up end" in all six runs); 33 to 42 ms longer than the baseline's worst run, on a busier machine. Cause of the extra not established |
| software desktop, search usable | 352 ms (113 to 355) | 121 ms (92 to 137) | Happens 100 to 350 ms after load, seconds before any map code runs. Machine load; see below for the reruns |
| software desktop, drag and zoom gap | 110 and 231 ms | 95 and 202 ms | The CPU shades the gas in every frame |
| software phone, morph and zoom gap | 133 and 56 ms | 114 and 53 ms | The same |
| software hover, longest frame gap | 66.8, 83.4, 83.3 ms | 66.7, 66.7, 66.7 ms | The same: one more frame of 16.7 ms on the second hover; first and third are within 0.1 ms of, or inside, the baseline's range |
| software hover 3, tip visible | 96.6 ms (94 to 105.2) | 88.1 ms (84.9 to 93.1) | The same (the tip shows from the map's next drawn frame, which is slower) |
| gpu desktop2x, transition gap | 33 ms (30 to 38) | 27 ms (26 to 28; 21 to 35 in the second set of baseline runs) | Traced: the late frame is the one in which a cover sheet is uploaded (16 to 33 ms each, today's site's own behaviour), now with the gas to shade in the same frame at four times the pixels. No gas upload falls in the window |
| gpu desktop deep zoom drag, gpu phone deep zoom morph | 19 ms | 18 ms (17 to 18) | One frame plus a millisecond of timer jitter; not a dropped frame |
| gpu phone, search usable | 80 ms (77 to 88) | 74 ms (72 to 78) | 6 ms, before any map code runs |

Everything else is inside or better than the baseline's range, including slider to list (5 to 9 ms in all five columns; it was 5 to 8 ms slower before the fix round) and every other gpu frame gap.

**Nebula visible** (reported only, no baseline): 640, 612 and 644 ms on gpu desktop, gpu phone and dpr 2, which is 58, 50 and 56 ms after the map's first frame. Before the fix round it followed the first frame by 53, 43 and 43 ms (battery runs with the preload). So waiting for the GPU costs the nebula about 5 to 13 ms on a GPU. On software: 315 and 282 ms after the first frame, as before (300 and 288 with an ordinary launch), but now without blocking the main thread.

## What these runs are, and what changed in the script

- **Method per column.** All five part 1 columns: ordinary launch, mains. Baseline, four columns: `baseline/perf/perf-run*.json`, ordinary launch. Baseline at dpr 2: `baseline/perf/perf-dpr2-run*.json`, ordinary launch (taken in this task above 20% battery, at 60 frames a second). Baseline of the two deep zoom rows at dpr 1: `perf-part1/baseline-gpu-deep-run*.json`, today's site with the extended script, ordinary launch; these three runs also hold a second set of all gpu rows of today's site, used above where it helps to judge spread. The software columns have no baseline for the deep zoom rows.
- **Two budgeted rows are measured after different steps than in the baseline** (the plan's script edits, they loosen nothing): "Long tasks while idle" and "Frames while idle" now follow the deep zoom drag and two stop changes at full zoom; "Startup worst long task" now also waits for the nebula before it reads the long tasks, where the baseline read them 4 s after load. Startup both ways: in these runs every startup long task started before 4 s and ended before the read (software desktop: one task per run, at 3.4 to 3.7 s; all other columns none), so the number is the same by either method.
- **Battery runs, not used for any number above**: `perf-part1/battery/`. `energy-saver-30fps-run*.json` are ordinary launches under Chrome's Energy Saver (30 frames a second; frame gaps useless); `perf-run*.json` and `hover-no-energy-saver.*` used the preload `scripts/perf/no-energy-saver.mjs`. All of them are commit `761accb7`, before the fix round. They are kept as the "before" of the fix round.

## Sizes (same in all runs)

| Measure | Baseline | Part 1 | Budget |
|---|---|---|---|
| First-load JS of `/`, gzip, with nomodule scripts | 190.5 KB | 191.1 KB (+0.6) | 200 KB |
| First-load JS of `/`, gzip, without nomodule scripts | 151.9 KB | 152.5 KB (+0.6) | reported only |
| three.js chunk in the first-load scripts | 0 KB | 0 KB | must be 0 |
| Server HTML of `/` | 28.3 KB | 28.3 KB | 150 KB |
| Server HTML of `/album/in-rainbows-radiohead` | 34 KB | 34 KB | 150 KB |

First-load JS has been 191.1 KB since Task 5; 8.9 KB of the budget are left for parts 2 and 3. Not on the first load: the lazy map chunk (three.js and the map) was 248.2 KB gzip on the baseline build and 252.7 KB before the fix round; the fix round adds about 0.5 KB of scheduling code to it (not measured again to the tenth). New downloads after first paint: `theme.json` 53.9 KB and one gas image (188 KB for Balanced; Sonic 190 KB and Mood 141 KB only on an interactive map, at idle). The import check of the brief prints the five expected lines and no other.

## Summary of medians (three runs; now / baseline)

| Median | software desktop | software phone | gpu desktop | gpu phone | gpu desktop2x |
|---|---|---|---|---|---|
| Search usable (ms) | 352 / 121 | 148 / 127 | 85 / 84 | 80 / 74 | 81 / 106 |
| Startup worst long task (ms) | 155 / 57 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Map first frame (ms) | 4221 / 4074 | 2925 / 2903 | 582 / 575 | 562 / 554 | 588 / 617 |
| Nebula visible (ms) | 4536 / none | 3207 / none | 640 / none | 612 / none | 644 / none |
| Typing to suggestions (ms) | 6 / 6 | 4 / 5 | 5 / 7 | 5 / 5 | 5 / 6 |
| Select to album (ms) | 33 / 24 | 20 / 18 | 18 / 22 | 18 / 19 | 18 / 21 |
| Transition worst frame gap (ms) | 899 / 1355 | 792 / 784 | 23 / 28 | 18 / 18 | 33 / 27 |
| Slider to list (ms) | 8 / 8 | 9 / 16 | 5 / 12 | 8 / 13 | 5 / 6 |
| Morph worst frame gap (ms) | 146 / 153 | 133 / 114 | 18 / 18 | 17 / 18 | 18 / 18 |
| Drag worst frame gap (ms) | 110 / 95 | 88 / 79 | 18 / 19 | 17 / 19 | 18 / 18 |
| Zoom worst frame gap (ms) | 231 / 202 | 56 / 53 | 33 / 38 | 36 / 44 | 33 / 38 |
| Deep zoom drag worst frame gap (ms) | 67 / none | 55 / none | 19 / 18 | 18 / 19 | 18 / 19 |
| Deep zoom, slider between stops, worst frame gap (ms) | 78 / none | 56 / none | 18 / 18 | 19 / 18 | 18 / 17 |
| Long tasks while idle | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Frames while idle | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

On the GPU the gas costs no frame at dpr 1: every frame gap but the zoom row's is one frame (17 to 23 ms; a dropped frame reads 33), at the overview and in the worst case (full zoom with the slider between stops: 18 and 19 ms). The zoom row reads 33 to 36 ms, as it does in the baseline (38 to 44). At dpr 2 the same holds except for the transition row (33 ms; see below).

## Every run, per combination

### software desktop

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 113 | 352 | 355 | 352 | 121 | 92 to 137 | 1000 | worse |
| Startup worst long task (ms) | 155 | 120 | 164 | 155 | 57 | 0 to 122 | 250 | worse |
| Map first frame (ms) | 4045 | 4290 | 4221 | 4221 | 4074 | 3937 to 4267 | reported only | same |
| Nebula visible (ms) | 4362 | 4606 | 4536 | 4536 | none | none | reported only | no baseline; 315 ms after the map's first frame |
| Typing to suggestions (ms) | 6 | 8 | 6 | 6 | 6 | 5 to 6 | 100 | same |
| Select to album (ms) | 25 | 240 | 33 | 33 | 24 | 17 to 35 | 200 | same |
| Transition worst frame gap (ms) | 677 | 1591 | 899 | 899 | 1355 | 1296 to 1642 | 50 (GPU only; not checked in software) | better |
| Slider to list (ms) | 9 | 8 | 8 | 8 | 8 | 7 to 13 | 150 | same |
| Morph worst frame gap (ms) | 199 | 144 | 146 | 146 | 153 | 141 to 219 | 50 (GPU only; not checked in software) | same |
| Drag worst frame gap (ms) | 106 | 110 | 110 | 110 | 95 | 85 to 105 | 50 (GPU only; not checked in software) | worse |
| Zoom worst frame gap (ms) | 193 | 231 | 245 | 231 | 202 | 189 to 226 | 50 (GPU only; not checked in software) | worse |
| Deep zoom drag worst frame gap (ms) | 67 | 68 | 65 | 67 | none | none | reported only | no baseline; beside the same column's drag: now 110, baseline 95 |
| Deep zoom, slider between stops, worst frame gap (ms) | 78 | 74 | 84 | 78 | none | none | reported only | no baseline; beside the same column's morph: now 146, baseline 153 |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: cap, cap, cap. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: [[3447, 155]]; [[3734, 120]]; [[3628, 164]].

### software phone

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 853 | 81 | 148 | 148 | 127 | 80 to 179 | 1000 | same |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 250 | same |
| Map first frame (ms) | 3019 | 2819 | 2925 | 2925 | 2903 | 2811 to 3028 | reported only | same |
| Nebula visible (ms) | 3305 | 3097 | 3207 | 3207 | none | none | reported only | no baseline; 282 ms after the map's first frame |
| Typing to suggestions (ms) | 5 | 4 | 4 | 4 | 5 | 4 to 5 | 100 | same |
| Select to album (ms) | 25 | 20 | 18 | 20 | 18 | 17 to 77 | 200 | same |
| Transition worst frame gap (ms) | 801 | 792 | 788 | 792 | 784 | 738 to 892 | 50 (GPU only; not checked in software) | same |
| Slider to list (ms) | 9 | 8 | 9 | 9 | 16 | 7 to 181 | 150 | same |
| Morph worst frame gap (ms) | 133 | 125 | 133 | 133 | 114 | 112 to 119 | 50 (GPU only; not checked in software) | worse |
| Drag worst frame gap (ms) | 84 | 88 | 88 | 88 | 79 | 74 to 117 | 50 (GPU only; not checked in software) | same |
| Zoom worst frame gap (ms) | 68 | 54 | 56 | 56 | 53 | 49 to 55 | 50 (GPU only; not checked in software) | worse |
| Deep zoom drag worst frame gap (ms) | 58 | 54 | 55 | 55 | none | none | reported only | no baseline; beside the same column's drag: now 88, baseline 79 |
| Deep zoom, slider between stops, worst frame gap (ms) | 52 | 65 | 56 | 56 | none | none | reported only | no baseline; beside the same column's morph: now 133, baseline 114 |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true, true], [true, true], [true, true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: []; []; [].

### gpu desktop

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 85 | 81 | 106 | 85 | 84 | 83 to 97 | 1000 | same |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 | 0 to 345 | 250 | same |
| Map first frame (ms) | 582 | 582 | 594 | 582 | 575 | 574 to 907 | reported only | same |
| Nebula visible (ms) | 629 | 643 | 640 | 640 | none | none | reported only | no baseline; 58 ms after the map's first frame |
| Typing to suggestions (ms) | 5 | 5 | 5 | 5 | 7 | 6 to 10 | 100 | better |
| Select to album (ms) | 17 | 18 | 19 | 18 | 22 | 21 to 24 | 200 | better |
| Transition worst frame gap (ms) | 22 | 28 | 23 | 23 | 28 | 27 to 28 | 50 | better |
| Slider to list (ms) | 5 | 5 | 5 | 5 | 12 | 7 to 16 | 150 | better |
| Morph worst frame gap (ms) | 17 | 18 | 18 | 18 | 18 | 18 to 20 | 50 | same |
| Drag worst frame gap (ms) | 19 | 17 | 18 | 18 | 19 | 18 to 21 | 50 | same |
| Zoom worst frame gap (ms) | 32 | 35 | 33 | 33 | 38 | 34 to 43 | 50 | better |
| Deep zoom drag worst frame gap (ms) | 19 | 18 | 19 | 19 | 18 (today's site, extra runs with the extended script) | 17 to 18 | reported only; 50 as yardstick | worse |
| Deep zoom, slider between stops, worst frame gap (ms) | 18 | 18 | 19 | 18 | 18 (today's site, extra runs with the extended script) | 17 to 18 | reported only; 50 as yardstick | same |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: []; []; [].

### gpu phone

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 88 | 77 | 80 | 80 | 74 | 72 to 78 | 1000 | worse |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 250 | same |
| Map first frame (ms) | 576 | 550 | 562 | 562 | 554 | 551 to 562 | reported only | same |
| Nebula visible (ms) | 640 | 612 | 609 | 612 | none | none | reported only | no baseline; 50 ms after the map's first frame |
| Typing to suggestions (ms) | 5 | 5 | 5 | 5 | 5 | 4 to 6 | 100 | same |
| Select to album (ms) | 18 | 18 | 25 | 18 | 19 | 18 to 19 | 200 | same |
| Transition worst frame gap (ms) | 18 | 19 | 18 | 18 | 18 | 18 to 18 | 50 | same |
| Slider to list (ms) | 8 | 6 | 17 | 8 | 13 | 12 to 15 | 150 | better |
| Morph worst frame gap (ms) | 17 | 17 | 18 | 17 | 18 | 17 to 18 | 50 | same |
| Drag worst frame gap (ms) | 17 | 17 | 18 | 17 | 19 | 19 to 22 | 50 | better |
| Zoom worst frame gap (ms) | 35 | 37 | 36 | 36 | 44 | 42 to 53 | 50 | better |
| Deep zoom drag worst frame gap (ms) | 19 | 18 | 18 | 18 | 19 (today's site, extra runs with the extended script) | 18 to 19 | reported only; 50 as yardstick | same |
| Deep zoom, slider between stops, worst frame gap (ms) | 19 | 17 | 19 | 19 | 18 (today's site, extra runs with the extended script) | 17 to 18 | reported only; 50 as yardstick | worse |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 0 | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | 1 | same |

Map settled before each step: [true, true], [true, true], [true, true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: []; []; [].

### gpu desktop2x

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict |
|---|---|---|---|---|---|---|---|---|
| Search usable (ms) | 81 | 80 | 81 | 81 | 106 | 88 to 114 | none (reported only) | better |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | none (reported only) | same |
| Map first frame (ms) | 588 | 586 | 594 | 588 | 617 | 577 to 640 | none (reported only) | same |
| Nebula visible (ms) | 640 | 644 | 653 | 644 | none | none | none (reported only) | no baseline; 56 ms after the map's first frame |
| Typing to suggestions (ms) | 6 | 5 | 5 | 5 | 6 | 5 to 6 | none (reported only) | same |
| Select to album (ms) | 18 | 20 | 18 | 18 | 21 | 19 to 25 | none (reported only) | better |
| Transition worst frame gap (ms) | 33 | 30 | 38 | 33 | 27 | 26 to 28 | none; 50 as yardstick | worse |
| Slider to list (ms) | 6 | 5 | 5 | 5 | 6 | 5 to 8 | none (reported only) | same |
| Morph worst frame gap (ms) | 18 | 18 | 17 | 18 | 18 | 18 to 19 | none; 50 as yardstick | same |
| Drag worst frame gap (ms) | 17 | 19 | 18 | 18 | 18 | 18 to 18 | none; 50 as yardstick | same |
| Zoom worst frame gap (ms) | 33 | 32 | 36 | 33 | 38 | 30 to 39 | none; 50 as yardstick | same |
| Deep zoom drag worst frame gap (ms) | 18 | 19 | 18 | 18 | 19 | 18 to 19 | none; 50 as yardstick | same |
| Deep zoom, slider between stops, worst frame gap (ms) | 17 | 18 | 18 | 18 | 17 | 17 to 18 | none; 50 as yardstick | same |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | none (reported only) | same |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 | 0 to 0 | none (reported only) | same |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false. Startup long tasks [start, ms]: []; []; [].

## Budget results per run

- Run 1: all budgets met
- Run 2: software desktop: select to album 240 ms > 200 ms
- Run 3: all budgets met

The one miss is a single run: 25 and 33 ms in the other two (baseline 17 to 35), nothing in the gas runs between a pick in the search list and the album showing, and the load average rose from 5.9 to 8.9 during that run. Not explained further. The gpu phone transition gap of 270 ms seen once in the battery runs did not come back: 18, 18 and 18 ms here, and no gpu frame gap of any row is over 38 ms in any of the three runs.

## Hover path

`baseline/hover-measure.mjs`, five fresh loads per mode, ordinary launch, mains (load 7.0 before). Raw: `app-hover-part1.json`, `app-hover-part1.txt`. Median (min to max) in ms, the baseline in square brackets, then the verdict.

| | gpu 1st | gpu 2nd | gpu 3rd | software 1st | software 2nd | software 3rd |
|---|---|---|---|---|---|---|
| Pointer move to tip visible | 134.8 (118.7 to 142.2) [150.3 (135.7 to 169.3)] better | 94 (89.1 to 109.9) [101.2 (90.6 to 106.8)] same | 92.7 (91.1 to 94.1) [90.3 (89.7 to 115.7)] same | 125.1 (115.5 to 137.3) [135.5 (133 to 149.4)] better | 93.8 (93.3 to 94.4) [91.6 (85.9 to 107.7)] same | 96.6 (94 to 105.2) [88.1 (84.9 to 93.1)] worse |
| Longest long task | 0 (0 to 0) [0 (0 to 55)] same | 0 [0] same | 0 [0] same | 0 [0] same | 0 [0] same | 0 [0] same |
| Longest frame gap | 16.8 (16.8 to 33.3) [33.3 (16.8 to 50)] same | 16.7 (16.7 to 16.8) [16.8 (16.7 to 16.8)] same | 16.8 (16.7 to 16.8) [16.8 (16.7 to 16.8)] same | 66.8 (66.6 to 83.3) [66.7 (49.9 to 66.7)] worse by 0.1 | 83.4 (83.3 to 100) [66.7 (66.7 to 83.3)] worse | 83.3 (83.2 to 100) [66.7 (50.1 to 83.4)] same |

Every hover drew 3 map frames, as in the baseline, and no load had a long task. On the GPU nothing is worse and the first hover is quicker. On the software renderer the later hovers' frames take one frame longer, because each of a hover's three frames now shades the gas on the CPU, and the tip of the third hover, which shows from the map's next frame, is 8 ms later.

## What is still worse, and why

**Software desktop startup long task: 155 ms (155, 120, 164) against 57 (0, 57, 122); budget 250.** This is no longer the gas. In each of the three runs the task starts at the millisecond the warm-up worker gives up ("WebGL warm-up end": 3450, 3736, 3629 ms; task starts: 3447, 3734, 3628 ms), 500 to 600 ms before the map's first frame; the baseline's two tasks sit at the same place (3711 against a warm-up end of 3712). It is the site's own first WebGL context on the main thread. It reads 33 to 42 ms longer than the baseline's worst run; whether that is the busier machine or something part 1 adds to that moment (the theme file is parsed around then) was not established. Software phone, where the warm-up finishes by itself, has no startup long task at all (0 in three runs, as the baseline).

What the gas's own startup task was, measured (fix round 1): hooking every WebGL call on the software renderer showed the 250 to 290 ms long task after the first frame was not the upload. `texSubImage2D` of the first 2048 px image took 12 to 20 ms. The time went in `gl.getExtension()`, which three calls when it uploads its first mipmapped texture: a call that needs an answer from the renderer and so blocks the main thread until the renderer has finished drawing the map's first frame (236 and 275 ms in two loads). The same upload at rest costs 9 to 16 ms. Fix: an image that is needed on screen waits for a WebGL fence (asked for when the image arrives, polled from timers, which blocks nothing) before it is uploaded. After: no long task after the first frame in any software run, and the nebula shows 282 to 315 ms after the first frame, as before.

**Software desktop search usable: 352 ms (113, 352, 355) against 121 (92 to 137); budget 1000.** It is measured on Home 100 to 350 ms after load, about four seconds before the map's code runs on a software renderer, so the gas cannot be in it. The battery runs of the same code path with an ordinary launch read 146, 80 and 109 ms. Reruns of this column alone are in the report of the fix round. Treated as load on a shared machine; named because the rule asks for it.

**Software frame gaps (reported, not budgeted).** The gas is shaded on the CPU. Software desktop: drag 110 ms (baseline 95, +15), zoom 231 ms (202, +29); transition 899 and morph 146 are under the baseline's. Software phone: morph 133 ms (114, +19), zoom 56 ms (53, +3); drag 88 ms is inside the baseline's range (74 to 117). Deep zoom rows 55 to 78 ms. Accepted: it is the price of shading every pixel without a GPU and has no cheaper version that keeps the look.

**gpu desktop2x transition gap: 33 ms (33, 30, 38) against 27 (26 to 28).** Traced with a script that logs every frame gap and every WebGL call of 1.5 ms or more during the 600 ms after an album opens, four loads: the late frames are the frames in which a cover sheet is uploaded (`texSubImage2D` 16 to 33 ms, two sheets per transition, at about 320 and 470 ms). That upload is today's site's and is in the baseline's 26 to 28 ms (and in the 21, 27, 35 ms of the second set of baseline runs). No gas image is uploaded inside the window: the two late gas images are fetched and decoded in the first 50 ms and wait. What part 1 adds is the gas to shade in that same frame, at four times the pixels of dpr 1, which pushes a 20 to 30 ms frame over the next refresh more often. Four more runs of this column read 22, 34, 34, 32 ms. Under the 50 ms yardstick; the cheaper versions of the brief are for the drag and zoom rows, which are at the baseline (18 and 33 ms). Left as it is; spreading the cover sheet upload would fix it for today's site too and is not part 1's.

**gpu desktop deep zoom drag 19 ms and gpu phone deep zoom morph 19 ms against 18 (17 to 18)**: one frame plus timer jitter. **gpu phone search usable 80 ms against 74 (72 to 78)**: 6 ms, before any map code.

## What was dropped or made cheaper for speed

Nothing of the look. None of the six cheaper versions of the brief was applied: no gpu median is over 50 ms, and the drag, zoom and deep zoom rows are at the baseline at dpr 1 and 2, including the worst case (deep zoom with the slider between stops: 18, 19, 18 ms). The glow, the detail octaves, the deep zoom blur and the full shader on phones are all in.

Changed for speed, none of it visible:

1. **Decoded gas images are freed after upload** (`2b29135a`): three 16 MB bitmaps are no longer kept for the life of the map; after a lost context they are fetched again from the HTTP cache. Until the first one is back (fetch and decode, about 50 ms from the cache) the map shows the pane without gas; the stop on screen is fetched first and shown the moment it is uploaded, the others follow at idle. Keeping that gap shorter would mean keeping the bitmaps.
2. **Late gas images are uploaded only when the map is left alone** (`761accb7`, `6c225edd`): 250 ms after the last input and the last drawn frame, on an idle main thread, 34 ms apart. Measured before the fix round with `app-part1/late-gas-measure.mjs` (images released 700 ms into a 3.5 s drag; at 60 frames a second):

| Worst frame gap of the drag, median (max), ms | Control | Uploads at once | Uploads deferred |
|---|---|---|---|
| gpu desktop, drag | 17.8 (18.2) | 26.6 (35) | 17.6 (18.5) |
| gpu phone, drag | 18.1 (19.5) | 25.7 (37.7) | 18.5 (20.3) |
| gpu desktop, wheel zoom | 35.6 (37.6) | 33.5 (35.6) | 33.6 (34.9) |
| software desktop, drag | 96 (414) | 270 (389), two long tasks per load | 98 (107), none inside the drag |

   On the software renderer the deferred upload itself, at rest after the drag, still took 90 to 100 ms on the main thread for the first image and 7 to 12 ms for the second in those runs: a long task by definition, outside any gesture. The wheel zoom rows do not change because their worst gap is the cover sheets' upload.
3. **A slider move no longer uploads inside the click** (`6c225edd`). Before, every waiting image was uploaded synchronously in the store update, also a stop the morph never shows; that was the 5 to 8 ms that "slider to list" had gained in every column (the perf script clicks about 300 ms after the map's last frame, when one image was usually still waiting). Now only the stops on the morph's path are taken, after the frame that paints the new list, and the stop on screen stands in until they are in. Slider to list after: 8, 9, 5, 8, 5 ms (baseline 8, 16, 12, 13, 6).
4. **An image never waits more than 4 s for a quiet map** (`6c225edd`): after that it goes in at the next idle moment, one image at a time, so a visitor who never stops moving still gets all three stops.
5. **An image needed on screen waits for the GPU, not for a blocking call** (`6c225edd`; see the startup long task above).

Browser tests for 1 to 4 are in `e2e/gas.spec.ts`: "the gas comes back after the WebGL context is lost and restored", "gas images that arrive during a drag are not uploaded until the map is left alone", "a slider move uploads only the waiting images its morph shows, after the click, and never a blank frame", "a visitor who never stops moving still gets the late images, one at a time".

## Luma read by the gas browser tests (for part 3's thresholds)

Software WebGL, 1440 x 900, with the old brown pane still behind the canvas. Test 1 (overview, 80 px patch on In Rainbows, median): 165.8 (bound 18.6). Test 2: beside the open album 96.1, the same patch with the album closed 195.2. Test 3: bare gas at full zoom 26.5, the same point at 32 px covers 85.4. Test 4 (300 px middle of the window): 143.2 with Balanced standing in for Mood, 124.8 with Mood in (bound 12.4). Context test: 165.8 before the loss and 165.8 after. (Read before the fix round; the fix round changes when images are uploaded, not what is drawn.)

## Regression checklist

`baseline/REGRESSION-CHECKLIST.md`, 234 items in 18 sections, against the build of commit `6c225edd` (everything below was run again after fix round 1). How it was walked, so nobody reads more into it than was done:

- **Screenshots.** `baseline/capture.mjs` was run on this build (gpu Chrome, as the baseline; no state failed). All 186 files have the baseline's names. Every pair was compared pixel by pixel (a pixel counts as different when its three channels differ by more than 36 in sum): 47 pairs are identical, among them every shot that shows no map (the album panel, the search sheet, About, the trail, toasts, the no-WebGL pages, the error state) and the full zoom shots, where the faint gas is within that tolerance of the old pane. In the other 139 the different pixels lie inside the map pane (the boxes start under the 64 px header and right of the album panel, or are crops of the map). Eighteen pairs were then opened by eye, baseline beside part 1; what was seen is in `app-regression-part1.md`, and the pairs are saved side by side in `app-part1/covers/`. **The other pairs were compared by pixel difference only** (the pixel comparison itself was made on the captures before fix round 1; the fix round changes when images are uploaded, not what is drawn).
- **Browser tests.** The whole suite, one worker, after the last code change: desktop 105 passed, 13 skipped (phone only), 1 failed; phone 69 passed, 49 skipped, 1 failed; no-WebGL 2 passed. The one failure in each project is the expected one (below). The phone test `"Explore this area" drops the album and leaves the map where it was`, which failed once before the fix round, passed here and in 4 of 4 reruns then; the gas code never writes the camera (it only reads its zoom), so a deferred upload cannot move it.
- **Unit tests** 327 pass (321 before Task 6), typecheck and lint clean. **Greps**: `grep -rn "blur(\|backdrop-filter\|mix-blend" src` returns only the `.blur()` focus calls of `SearchBox.tsx` and its test. `shaders/album.ts`, `canvas/AlbumField.tsx`, `canvas/AtlasManager.tsx` and every stylesheet are byte for byte the baseline's (`git diff 6f10463e HEAD` is empty for them), so the way covers, dots, hover marks, markers, lines and badges are drawn cannot have changed; only what is behind them has.
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
| 18. Performance niceties | 10 | 10 | |

"Hold" means the item's own check (its test, grep or unit test) passes, or its screenshot differs from the baseline only in the map background. No item of sections 1 to 6 or 13 was found regressed.

Items that do not simply hold:

- "Canvas and renderer settings." (section 1): **changed on purpose in part 1.** The canvas settings are the same, but the gas quad is opaque, so the album's colour wash no longer shows through the map under the dots (`album-open`).
- "Ambient colour wash behind an album." (section 17): **changed on purpose in part 1**, the same thing: the panel half of the wash is unchanged, the map half is now hidden under the gas. Its e2e test passes (it reads the styles, not the pixels). Part 3 decides what becomes of the map half.
- "Dimmed map behind Home, About and 404: fainter, slightly larger dots" (section 17): **changed on purpose in part 1**: the dots are as before and the gas is behind them at 0.6 of its strength, under the old veil (`home-top`, `about`, `notfound`).
- "Before the map data loads: a quiet empty pane." (section 15): **changed on purpose in part 1** in what follows it: the pane is the old brown until the first gas image is in (50 to 58 ms after the map's first frame on the GPU, about 300 ms on software), then gas. The brown flash goes when part 3 makes the pane the sky colour. Its manual probe is routed.
- "Material settings: transparent, depth write on, standard alpha blending, no tone mapping.", "Other covers dim to 50% while an album is picked in Explore." (section 1) and "Cover mode: the shader draws the picked cover large with a lamp frame" (section 3): **wait for part 3.** Their shared e2e test, `explore.spec.ts` "in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed", fails as the brief expected: it measures the dimming against the old pane's luma of 19 and there is gas behind the covers now (desktop: dimmed 57.4, limit 45.3; phone: 59.8, limit 46.4). The behaviour itself holds by eye: in `selected-dense-crop` the picked cover is large and framed and the others are at half alpha in the same piles as the baseline. Part 3 rewrites the check (its Task 7). Not touched here.
- "Dots are 78% opaque and add up where they overlap." (section 1) and "Hover mark on a dot: a paper ring of radius 7 with a paper centre" (section 2): **wait for part 2.** Both are drawn exactly as before, but over the bright cream gas today's warm dots and the thin ring have little contrast (`hover-map-album-crop`: the ring on In Rainbows is hard to find). Part 2 replaces the dots with stars; the ring's contrast over bright gas should be looked at there.
- "Cross-fade band: covers are tinted and see-through between 16 and 32 px." (section 1): **waits for part 2 or 3**, as a legibility note, not a change: see "Covers over the gas" below.
- "Grain overlay sits over the map too." (section 1): holds; part 3 removes the grain on purpose.
- "A lost WebGL context recovers, or gives way to the message after 3 s." (section 15): the recover half is now covered by a browser test (the gas test forces a loss and a restore); the 3 s message half stays a manual probe, routed.
- "All budgets." and "WebGL is warmed up in a worker." (section 18): hold again. Before fix round 1 the startup long task budget was missed on software renderers; it is met now (155 ms and 0 ms against 250).
- Seen by eye and worth part 2's attention, neither a change in how things are drawn: the thin lines from the seed to its neighbours and the hint line at the bottom of the map have little contrast where they cross bright gas (`slider-mood`, `album-open`).

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

## M1 follow-up: the sharper gas image and the new first images (2026-10-05, 04:49 to 05:30)

- Commits measured: `7fdca313` (three full runs, the interleaved gpu runs and the first software pairs) and the commit after it, which only moves the shader's fade at an image's edge from once per texture read to once per pixel (pixel identical: the Overview and album captures are byte for byte the same; software desktop pairs "after trim").
- Mains power, ordinary launch, plain `npm run perf`. Load before the three runs: 13.8, 10.1, 8.2 (the mains runs above were taken at 5.9 to 6.5). The machine was busier, so every number here was also compared with the old build measured in the same minutes.
- Raw: `perf-part1/m1/run1.txt` to `run3.txt` (full runs), `gpu4.txt` to `gpu6.txt` (three more gpu runs), `perf-part1/m1/ab/` (old and new build in turn: five pairs on gpu phone, four on gpu desktop, three on each software column, four more on software desktop after the trim). The old build is commit `3dacd965` built in a scratch copy.
- What changed that could cost time: the first images are smaller in px (3.1 to 4.0 Mpx against 4.2) and larger in bytes (251 to 371 KB against 141 to 190); the shader reads each image over its own rectangle and reads two fewer noise octaves at Overview, one fewer beside an album; on gpu desktop columns the sharper image is fetched and uploaded in strips at quiet moments once the map is zoomed in (in this script: after an album opens).

### Budgets

Runs 1 and 2 met every budget. Run 3 missed one: **gpu phone zoom frame gap 53 ms against 50** (36 and 45 in runs 1 and 2). Phones do not load the sharper image. In five interleaved pairs on that column the old build read 33, 35, 36, 33, 46 ms (median 35) and the new 37, 43, 34, 40, 32 (median 37); over all eleven runs of the new build the row reads 32 to 53, median 40. I cannot show a difference between the builds and cannot rule out one of a few ms; the row sits between two and three frames in both, as in the baseline (38 to 44).

### Three full runs: median (run 1, run 2, run 3), and the mains median of this file above

| Row | software desktop | software phone | gpu desktop | gpu phone | gpu desktop2x |
|---|---|---|---|---|---|
| Search usable (ms) | 79 (72, 79, 118); was 352 | 80 (80, 74, 147); was 148 | 87 (87, 91, 76); was 85 | 75 (92, 71, 75); was 80 | 81 (87, 81, 81); was 81 |
| Startup worst long task (ms) | 0 (0, 0, 60); was 155 | 0 (0, 0, 0); was 0 | 0; was 0 | 0; was 0 | 0; was 0 |
| Map first frame (ms) | 3772 (3772, 3729, 3908); was 4221 | 2776 (2724, 2776, 2865); was 2925 | 576 (576, 576, 572); was 582 | 566 (590, 547, 566); was 562 | 600 (603, 600, 588); was 588 |
| Nebula visible (ms) | 4061 (4061, 4021, 4212); was 4536 | 3047 (2994, 3047, 3143); was 3207 | 627 (637, 627, 617); was 640 | 610 (637, 593, 610); was 612 | 647 (661, 642, 647); was 644 |
| Nebula after the map's first frame (ms) | 292 (289, 292, 304); was 315 | 271 (270, 271, 278); was 282 | 51 (61, 51, 45); was 58 | 46 (47, 46, 44); was 50 | 58 (58, 42, 59); was 56 |
| Typing to suggestions (ms) | 5; was 6 | 4; was 4 | 6; was 5 | 5; was 5 | 5; was 5 |
| Select to album (ms) | 26 (26, 19, 26); was 33 | 18 (19, 17, 18); was 20 | 22 (22, 22, 22); was 18 | 18 (22, 18, 18); was 18 | 19 (23, 17, 19); was 18 |
| Transition worst frame gap (ms) | 1241 (1241, 1488, 684); was 899 | 770 (770, 789, 758); was 792 | 25 (27, 25, 23); was 23 | 18 (18, 18, 19); was 18 | 24 (21, 24, 24); was 33 |
| Slider to list (ms) | 8 (8, 9, 5); was 8 | 7 (8, 7, 7); was 9 | 9 (9, 6, 10); was 5 | 8 (8, 7, 16); was 8 | 10 (10, 6, 10); was 5 |
| Morph worst frame gap (ms) | 173 (173, 183, 112); was 146 | 131 (131, 135, 121); was 133 | 18 (17, 18, 18); was 18 | 18 (20, 17, 18); was 17 | 20 (17, 20, 24); was 18 |
| Drag worst frame gap (ms) | 107 (111, 107, 99); was 110 | 94 (94, 98, 84); was 88 | 19 (18, 19, 19); was 18 | 19 (23, 18, 19); was 17 | 20 (21, 19, 20); was 18 |
| Zoom worst frame gap (ms) | 270 (194, 308, 270); was 231 | 64 (60, 136, 64); was 56 | 34 (33, 34, 44); was 33 | 45 (36, 45, 53); was 36 | 38 (29, 38, 40); was 33 |
| Deep zoom drag worst frame gap (ms) | 75 (71, 75, 77); was 67 | 54 (50, 63, 54); was 55 | 20 (22, 20, 19); was 19 | 20 (20, 18, 22); was 18 | 22 (23, 22, 18); was 18 |
| Deep zoom, slider between stops (ms) | 69 (77, 69, 69); was 78 | 49 (49, 44, 65); was 56 | 18 (17, 22, 18); was 18 | 18 (19, 18, 17); was 19 | 19 (18, 19, 19); was 18 |
| Long tasks while idle | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 |
| Frames while idle | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 |

First-load JS of `/`: 191.2 KB with nomodule scripts (191.1 before; budget 200), 152.6 KB without (152.5). three.js chunk on first load 0 KB. The gas code is in the lazy map chunk.

### Rows that read higher than the mains medians above, each against the old build in the same minutes

The old build was measured in turn with the new one because the mains medians above were taken on a quieter machine. "Old" and "new" are the single runs in order.

| Row | Full runs now; mains median above | Old build, same minutes | New build, same minutes | Reading |
|---|---|---|---|---|
| gpu desktop, slider to list | 9 (9, 6, 10); 5 | 10, 10, 22, 7 | 5, 15, 6, 10 | The old build reads 7 to 22 today. No difference shown |
| gpu desktop, select to album | 22; 18 | 25, 22, 26, 21 | 22, 19, 19, 21 | The same |
| gpu desktop, zoom gap | 34 (33, 34, 44); 33 | 32, 45, 38, 42 | 35, 33, 29, 37 | No difference shown |
| gpu desktop, drag gap | 19; 18 | 19, 22, 22, 33 | 18, 18, 21, 21 | No difference shown |
| gpu desktop, transition gap | 25; 23 | 32, 23, 36, 20 | 21, 34, 29, 23 | No difference shown |
| gpu phone, zoom gap | 45 (36, 45, 53); 36 | 33, 35, 36, 33, 46 | 37, 43, 34, 40, 32 | See "Budgets". No difference shown; a few ms not ruled out |
| gpu phone, drag gap | 19 (23, 18, 19); 17 | 22, 24, 19, 20, 25 | 19, 19, 21, 19, 19 | No difference shown |
| gpu desktop2x, slider to list, morph, drag, zoom, deep zoom drag | 10, 20, 20, 38, 22; 5, 18, 18, 33, 18 | not measured in turn | not measured in turn | One frame or less in every row; three more gpu runs (`gpu4.txt` to `gpu6.txt`) read zoom 28, 31, 28, drag 20, 19, 35, morph 18, 18, 19. Not compared with the old build at dpr 2: owed |
| software desktop, zoom gap | 270 (194, 308, 270); 231 | 282, 195, 261; after the trim 202, 299, 312, 267 | 365, 294, 259; after the trim 315, 299, 185, 305 | The row jumps between about 190 and 310 in both builds. No difference shown |
| software desktop, drag gap | 107; 110 | 109, 103, 104; after the trim 111, 118, 107, 99 | 139, 103, 119; after the trim 118, 108, 100, 101 | Before the trim two of three runs read higher than the old build; after it, level. This is why the trim was made |
| software desktop, transition and morph gap | 1241 and 173; 899 and 146 | after the trim: transition 1610, 896, 914, 741; morph 157, 141, 175, 354 | after the trim: transition 1654, 583, 929, 1343; morph 167, 148, 156, 170 | Not budgeted in software; no difference shown |
| software phone, zoom and drag gap | 64 and 94; 56 and 88 | zoom 58, 60, 62; drag 80, 92, 86 | zoom 62, 58, 82; drag 90, 82, 82 | No difference shown |

Nebula visible in the same pairs: gpu phone old 717, 648, 641, 630, 613 ms, new 643, 607, 622, 623, 611; gpu desktop old 642, 610, 611, 593, new 596, 593, 610, 592; software desktop old 4218, 4241, 4060, new 3944, 3916, 3979. The larger file does not delay the nebula.

### The sharper image itself (gpu, not part of `npm run perf`)

`app-gas-detail/sharp-measure.mjs`, three loads per case at dpr 1 and 2, mains, load 6 to 9. The image is on screen 1.0 to 1.17 s after the map is zoomed in and left alone. Its 16 strip uploads hold the main thread 0.7 to 2.1 ms each on average, 4.3 ms at most; allocation and the mip build read 0 to 0.1 ms; no long task; one frame is drawn (the swap). A drag started the moment the first strip went in: no strip was sent during the drag, and its worst frame gap was 19.0 to 21.2 ms against 18.2 to 22.2 ms for a control drag afterwards. In `npm run perf` the sharper image loads on the gpu desktop columns after the album opens; the idle window of that script read 0 frames and 0 long tasks in every run.

### Not measured

The hover path (`baseline/hover-measure.mjs`) was not run again. The dpr 2 column was not compared with the old build in turn. The three full runs are of `7fdca313`; after the trim only the software desktop column was measured again.

