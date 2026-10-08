# Part 1 (data and gas) against the baseline: performance and regression checklist

> Note (2026-10-07): the pictures (`.jpg`, `.png`) under `app-part1/` and `app-gas-detail/` were pruned before merge. They remain in git history at commit `03f1386c`. The documents, scripts and measurement files are still in place.

**Read this section first. It is the closing measurement of part 1 (2026-10-05) and replaces every headline below it.** The older sections are kept as history and each says at its top that it is superseded.

## Closing measurement: round 3 and the closing pass

- Builds measured in turn: **current** `37906968`, **previous head** `161d530b` (the build before round 3: no hashed names, no fence fix, no fade, no lighter shader), and for the startup, software frame and A/B runs also the **baseline** `6f10463e` (today's site; app code identical to `1e9ef508`). The closing pass then changed the app once more (`0bf30a31`: the gate, the lighter shader in deep zoom, the pointer safety, the failed first image); what was measured again after it is under "After the closing fixes".
- Date 2026-10-05, 06:38 to 09:15 local time for the round 3 data. Mains power in every run (each output file records it). Ordinary launch: plain `npm run perf`, three times per build, current and previous head alternating.
- Machine: MacBook Pro, Apple M1 Pro, 16 GB, shared with other sessions throughout. Each perf run waited for the one minute load to fall under 4 (waits of 281 to 1402 s) and began at 3.4 to 3.9. Node v22.23.3 arm64, Google Chrome headless arm64, production builds.
- The software columns of the current build draw the gas with the **lighter shader** (the script's row "Gas shader" says so); the gpu columns draw the full one. The previous head draws the full shader everywhere.
- Baseline numbers: `baseline/BASELINE-PERF.md` (four columns, three runs, 2026-10-04), its dpr 2 section (`baseline/perf/perf-dpr2-run*.json`) and, for the two deep zoom rows at dpr 1 on the gpu, `perf-part1/baseline-gpu-deep-run*.json`. The software columns have no baseline for the deep zoom rows. Budgets: `frontcreck/scripts/perf/budgets.json`, unchanged.
- Raw: `perf-part1/round3/` (`perf-current-run1..3`, `perf-prev-run1..3`, `hover`, `startup-longtask`, `startup-longtask-plain`, `software-frames`, `fade-measure`, `lite-ab/`, and `LOAD.txt` with the load and the power around every measurement).

### 1. Budgets, per run

All six runs exited 0 with "All budgets met" (the `fails` list of each of the six JSON files is empty, and each `.txt` ends with `# exit 0`).

| Run | Build | Budgets | Load before (1 min) | Load after (1, 5, 15 min) |
|---|---|---|---|---|
| current 1 | `37906968` | all met | 3.89 | 8.22, 6.61, 8.04 |
| previous head 1 | `161d530b` | all met | 3.38 | 15.20, 8.61, 7.68 |
| current 2 | `37906968` | all met | 3.75 | 5.14, 6.16, 6.86 |
| previous head 2 | `161d530b` | all met | 3.92 | 13.10, 7.69, 7.04 |
| current 3 | `37906968` | all met | 3.85 | 10.33, 7.27, 6.75 |
| previous head 3 | `161d530b` | all met | 3.93 | 5.75, 5.96, 5.99 |

Console errors: 0 in every column of every run. The map had settled before every step in every run.

### 2. Every row, every column

Median of three runs with the range in brackets. "Worse" means only that the current median is higher than the baseline median; it is marked in two grades, as asked: inside the baseline's own three runs, or above the baseline's worst run. Three runs a side is a small sample: a row marked "worse, inside the baseline's range" differs from the baseline by less than the baseline differs from itself.

| Column | Row | Current, median (range of 3) | Previous head, median (range) | Baseline, median (range) | Budget | Current against baseline |
|---|---|---|---|---|---|---|
| software desktop | Search usable (ms) | 189 (182 to 189) | 101 (96 to 179) | 121 (92 to 137) | 1000 | **WORSE, above the baseline's worst run** |
| software desktop | Startup worst long task (ms) | 50 (50 to 208) | 51 (0 to 77) | 57 (0 to 122) | 250 | better |
| software desktop | WebGL warm-up end (ms) | 3572 (3415 to 3665) | 3283 (3253 to 3433) | 3578 (3493 to 3712) | reported only | better |
| software desktop | Map first frame (ms) | 4151 (3896 to 4521) | 3732 (3708 to 3939) | 4074 (3937 to 4267) | reported only | **worse**, inside the baseline's range |
| software desktop | Nebula visible (ms) | 4459 (4204 to 4572) | 4024 (4007 to 4234) | none | reported only | no baseline |
| software desktop | Typing to suggestions (ms) | 7 (6 to 7) | 6 (5 to 6) | 6 (5 to 6) | 100 | **WORSE, above the baseline's worst run** |
| software desktop | Select to album (ms) | 27 (27 to 29) | 25 (25 to 26) | 24 (17 to 35) | 200 | **worse**, inside the baseline's range |
| software desktop | Transition worst frame gap (ms) | 1600 (770 to 1631) | 1184 (670 to 1256) | 1355 (1296 to 1642) | 50, GPU only | **worse**, inside the baseline's range |
| software desktop | Slider to list (ms) | 9 (7 to 10) | 9 (9 to 19) | 8 (7 to 13) | 150 | **worse**, inside the baseline's range |
| software desktop | Morph worst frame gap (ms) | 78 (75 to 158) | 165 (108 to 175) | 153 (141 to 219) | 50, GPU only | better |
| software desktop | Drag worst frame gap (ms) | 100 (93 to 100) | 111 (107 to 116) | 95 (85 to 105) | 50, GPU only | **worse**, inside the baseline's range |
| software desktop | Zoom worst frame gap (ms) | 255 (205 to 269) | 364 (311 to 370) | 202 (189 to 226) | 50, GPU only | **WORSE, above the baseline's worst run** |
| software desktop | Deep zoom drag worst frame gap (ms) | 53 (51 to 54) | 76 (67 to 135) | none | reported only | no baseline |
| software desktop | Deep zoom, slider between stops, worst frame gap (ms) | 49 (48 to 52) | 92 (82 to 141) | none | reported only | no baseline |
| software desktop | Long tasks while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 0 | same |
| software desktop | Frames while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 1 | same |
| software phone | Search usable (ms) | 112 (80 to 117) | 123 (112 to 132) | 127 (80 to 179) | 1000 | better |
| software phone | Startup worst long task (ms) | 0 (0 to 0) | 0 (0 to 51) | 0 (0 to 0) | 250 | same |
| software phone | WebGL warm-up end (ms) | 2423 (2367 to 2473) | 2271 (2266 to 2493) | 2455 (2360 to 2578) | reported only | better |
| software phone | Map first frame (ms) | 2871 (2814 to 2920) | 2730 (2728 to 2951) | 2903 (2811 to 3028) | reported only | better |
| software phone | Nebula visible (ms) | 3153 (3095 to 3197) | 2996 (2991 to 3229) | none | reported only | no baseline |
| software phone | Typing to suggestions (ms) | 5 (5 to 6) | 5 (4 to 5) | 5 (4 to 5) | 100 | same |
| software phone | Select to album (ms) | 18 (18 to 68) | 18 (17 to 18) | 18 (17 to 77) | 200 | same |
| software phone | Transition worst frame gap (ms) | 773 (752 to 796) | 755 (736 to 769) | 784 (738 to 892) | 50, GPU only | better |
| software phone | Slider to list (ms) | 9 (8 to 18) | 9 (8 to 9) | 16 (7 to 181) | 150 | better |
| software phone | Morph worst frame gap (ms) | 121 (117 to 123) | 123 (122 to 129) | 114 (112 to 119) | 50, GPU only | **WORSE, above the baseline's worst run** |
| software phone | Drag worst frame gap (ms) | 80 (77 to 88) | 93 (84 to 94) | 79 (74 to 117) | 50, GPU only | **worse**, inside the baseline's range |
| software phone | Zoom worst frame gap (ms) | 55 (46 to 57) | 64 (57 to 64) | 53 (49 to 55) | 50, GPU only | **worse**, inside the baseline's range |
| software phone | Deep zoom drag worst frame gap (ms) | 39 (39 to 42) | 52 (46 to 73) | none | reported only | no baseline |
| software phone | Deep zoom, slider between stops, worst frame gap (ms) | 38 (37 to 39) | 58 (52 to 63) | none | reported only | no baseline |
| software phone | Long tasks while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 0 | same |
| software phone | Frames while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 1 | same |
| gpu desktop | Search usable (ms) | 84 (82 to 85) | 84 (75 to 109) | 84 (83 to 97) | 1000 | same |
| gpu desktop | Startup worst long task (ms) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 345) | 250 | same |
| gpu desktop | WebGL warm-up end (ms) | 135 (135 to 136) | 136 (117 to 159) | 132 (132 to 145) | reported only | **worse**, inside the baseline's range |
| gpu desktop | Map first frame (ms) | 596 (565 to 598) | 583 (564 to 610) | 575 (574 to 907) | reported only | **worse**, inside the baseline's range |
| gpu desktop | Nebula visible (ms) | 641 (612 to 657) | 630 (610 to 667) | none | reported only | no baseline |
| gpu desktop | Typing to suggestions (ms) | 5 (5 to 10) | 5 (5 to 7) | 7 (6 to 10) | 100 | better |
| gpu desktop | Select to album (ms) | 18 (17 to 18) | 20 (18 to 21) | 22 (21 to 24) | 200 | better |
| gpu desktop | Transition worst frame gap (ms) | 27 (24 to 31) | 34 (24 to 34) | 28 (27 to 28) | 50 | better |
| gpu desktop | Slider to list (ms) | 6 (6 to 10) | 10 (9 to 15) | 12 (7 to 16) | 150 | better |
| gpu desktop | Morph worst frame gap (ms) | 20 (20 to 37) | 19 (18 to 19) | 18 (18 to 20) | 50 | **worse**, inside the baseline's range |
| gpu desktop | Drag worst frame gap (ms) | 21 (20 to 36) | 24 (20 to 24) | 19 (18 to 21) | 50 | **worse**, inside the baseline's range |
| gpu desktop | Zoom worst frame gap (ms) | 37 (33 to 40) | 28 (28 to 29) | 38 (34 to 43) | 50 | better |
| gpu desktop | Deep zoom drag worst frame gap (ms) | 21 (18 to 21) | 20 (18 to 21) | 18 (17 to 18) | reported only; 50 as yardstick | **WORSE, above the baseline's worst run** |
| gpu desktop | Deep zoom, slider between stops, worst frame gap (ms) | 18 (18 to 20) | 19 (18 to 19) | 18 (17 to 18) | reported only; 50 as yardstick | same |
| gpu desktop | Long tasks while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 0 | same |
| gpu desktop | Frames while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 1 | same |
| gpu phone | Search usable (ms) | 78 (72 to 79) | 74 (72 to 134) | 74 (72 to 78) | 1000 | **worse**, inside the baseline's range |
| gpu phone | Startup worst long task (ms) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 250 | same |
| gpu phone | WebGL warm-up end (ms) | 116 (115 to 120) | 118 (117 to 180) | 116 (113 to 129) | reported only | same |
| gpu phone | Map first frame (ms) | 551 (551 to 564) | 567 (553 to 629) | 554 (551 to 562) | reported only | better |
| gpu phone | Nebula visible (ms) | 596 (596 to 612) | 614 (612 to 671) | none | reported only | no baseline |
| gpu phone | Typing to suggestions (ms) | 5 (4 to 7) | 4 (4 to 8) | 5 (4 to 6) | 100 | same |
| gpu phone | Select to album (ms) | 18 (18 to 19) | 20 (18 to 23) | 19 (18 to 19) | 200 | better |
| gpu phone | Transition worst frame gap (ms) | 18 (17 to 18) | 18 (18 to 19) | 18 (18 to 18) | 50 | same |
| gpu phone | Slider to list (ms) | 8 (7 to 12) | 15 (8 to 17) | 13 (12 to 15) | 150 | better |
| gpu phone | Morph worst frame gap (ms) | 24 (18 to 26) | 19 (17 to 20) | 18 (17 to 18) | 50 | **WORSE, above the baseline's worst run** |
| gpu phone | Drag worst frame gap (ms) | 18 (17 to 21) | 19 (18 to 21) | 19 (19 to 22) | 50 | better |
| gpu phone | Zoom worst frame gap (ms) | 35 (35 to 41) | 41 (34 to 43) | 44 (42 to 53) | 50 | better |
| gpu phone | Deep zoom drag worst frame gap (ms) | 19 (18 to 20) | 20 (19 to 20) | 19 (18 to 19) | reported only; 50 as yardstick | same |
| gpu phone | Deep zoom, slider between stops, worst frame gap (ms) | 19 (18 to 19) | 19 (19 to 19) | 18 (17 to 18) | reported only; 50 as yardstick | **WORSE, above the baseline's worst run** |
| gpu phone | Long tasks while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 0 | same |
| gpu phone | Frames while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 1 | same |
| gpu desktop2x | Search usable (ms) | 84 (76 to 84) | 77 (68 to 94) | 106 (88 to 114) | none (reported only) | better |
| gpu desktop2x | Startup worst long task (ms) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | none (reported only) | same |
| gpu desktop2x | WebGL warm-up end (ms) | 127 (116 to 130) | 127 (116 to 132) | 168 (129 to 176) | reported only | better |
| gpu desktop2x | Map first frame (ms) | 567 (567 to 579) | 570 (552 to 576) | 617 (577 to 640) | reported only | better |
| gpu desktop2x | Nebula visible (ms) | 627 (620 to 627) | 617 (596 to 625) | none | reported only | no baseline |
| gpu desktop2x | Typing to suggestions (ms) | 5 (5 to 7) | 5 (5 to 7) | 6 (5 to 6) | none (reported only) | better |
| gpu desktop2x | Select to album (ms) | 20 (20 to 22) | 21 (19 to 22) | 21 (19 to 25) | none (reported only) | better |
| gpu desktop2x | Transition worst frame gap (ms) | 22 (21 to 23) | 28 (19 to 33) | 27 (26 to 28) | none; 50 as yardstick | better |
| gpu desktop2x | Slider to list (ms) | 19 (5 to 19) | 9 (6 to 13) | 6 (5 to 8) | none (reported only) | **WORSE, above the baseline's worst run** |
| gpu desktop2x | Morph worst frame gap (ms) | 23 (18 to 25) | 18 (18 to 19) | 18 (18 to 19) | none; 50 as yardstick | **WORSE, above the baseline's worst run** |
| gpu desktop2x | Drag worst frame gap (ms) | 19 (19 to 22) | 20 (19 to 20) | 18 (18 to 18) | none; 50 as yardstick | **WORSE, above the baseline's worst run** |
| gpu desktop2x | Zoom worst frame gap (ms) | 33 (31 to 42) | 31 (30 to 39) | 38 (30 to 39) | none; 50 as yardstick | better |
| gpu desktop2x | Deep zoom drag worst frame gap (ms) | 19 (18 to 19) | 19 (18 to 21) | 19 (18 to 19) | none; 50 as yardstick | same |
| gpu desktop2x | Deep zoom, slider between stops, worst frame gap (ms) | 18 (18 to 19) | 19 (19 to 22) | 17 (17 to 18) | none; 50 as yardstick | **worse**, inside the baseline's range |
| gpu desktop2x | Long tasks while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | none (reported only) | same |
| gpu desktop2x | Frames while idle (3 s) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | none (reported only) | same |

### 3. Every marked row, and its cause

Rows above the baseline's worst run first, then the rows inside the baseline's range.

**software desktop, search usable: 189 ms (182, 189, 189) against 121 (92 to 137); previous head 101 (101, 96, 179); budget 1000. Not explained.** What the data say: the mark it times (the search index being ready on Home) comes 0.1 to 0.5 s after navigation, three seconds before any map code runs on this renderer, so neither the gas nor its shader can be in it. It is the first page load after the script starts its server, in every build. The row has two modes in every build, about 75 to 135 ms and about 180 ms and up: the previous head hit the upper one once in three (179), and today's site hit it once in three in the same session (182, 74, 73, `lite-ab/software-baseline-b-run*`); the current build read 330, 77, 81 and 111, 79, 89 in that session's runs. The three formal runs of the current build all landed in the upper mode. With three runs I cannot say whether that is chance or whether the current build makes the upper mode more likely; the two first-load script files that differ between the builds are the same size (13.4 and 10.9 KB). The same row on the second column (software phone, a warm server) reads 112 (80 to 117) against 127.

**software desktop, zoom gap: 255 ms (205, 255, 269) against 202 (189 to 226); previous head 364 (311 to 370). Cause: the CPU shades the gas in every frame of the zoom, and the lighter shader takes back most of that cost but not all.** Evidence, same session, three builds in turn (section 7): today's site 208 (181 to 211), full shader 300 (270 to 348), lighter shader 218.5 (159 to 267). The mean frame gap of the zoom is back at the baseline's (48.1 against 47.1 ms); the single worst frame is still longer in about half the runs.

**software desktop, typing to suggestions: 7 ms (6, 7, 7) against 6 (5 to 6); previous head 6. Not explained.** One millisecond, budget 100.

**software phone, morph gap: 121 ms (123, 117, 121) against 114 (112 to 119); previous head 123 (122 to 129). Cause: between two stops the lighter shader reads two images for every pixel on the CPU, where today's site reads none.** This is the lighter shader's short row. Evidence, same session: today's site 116 (114 to 123), full 123 (113 to 133), lighter 125 (120 to 133): no better than the full shader on this row. Mean frame gap of the morph on the phone: baseline 32.7, full 42.2, lighter 37.4 ms.

**gpu desktop, deep zoom drag gap: 21 ms (18, 21, 21) against 18 (17 to 18); previous head 20 (18 to 21). Not explained.** Every run is a single frame (a dropped frame reads 33); the difference is 3 ms.

**gpu phone, morph gap: 24 ms (18, 26, 24) against 18 (17 to 18); previous head 19 (17 to 20). Not explained.** Phones load no sharper image, so that is not in it. 24 and 26 ms are between one frame and two. Budget 50.

**gpu phone, deep zoom with the slider between stops: 19 ms (19, 19, 18) against 18 (17 to 18); previous head 19. Not explained.** One millisecond.

**gpu desktop2x, slider to list: 19 ms (19, 19, 5) against 6 (5 to 8); previous head 9 (6 to 13). Not explained.** The dpr 1 column, which runs the same code, reads 6 (6 to 10) against 12. The column has no budget; the row's budget elsewhere is 150.

**gpu desktop2x, morph gap: 23 ms (23, 18, 25) against 18 (18 to 19); previous head 18 (18 to 19). Not explained.** At this point of the script the stop on screen holds its sharper image, which is one end of the morph, at four times the pixels of dpr 1; that would be the first thing to test. It was not isolated. No budget; 50 as yardstick.

**gpu desktop2x, drag gap 19 ms (22, 19, 19) against 18 (18 to 18), and deep zoom with the slider between stops 18 (18, 19, 18) against 17 (17 to 18). Not explained.** One millisecond each.

Inside the baseline's range (the current median is higher than the baseline's median and no higher than its worst run):

**gpu desktop, morph gap 20 ms (37, 20, 20) against 18 (18 to 20), and drag gap 21 (36, 20, 21) against 19 (18 to 21). The 37 and 36 of run 1 are not explained.** They are one dropped frame each, in two different page loads of the same column of the same run. They are not in run 2 or run 3 (20 and 20; 20 and 21). The previous head has no such spike in its three runs (morph 19, 18, 19; drag 20, 24, 24). The load does not sort it out: after current run 1 the one minute load was 8.22, after current run 3 it was 10.33 with no spike, and after the previous head's runs 1 and 2 it was 15.20 and 13.10 with no spike. So: seen once in three runs of the current build, never in three of the previous head, not tied to the load that was recorded. The medians (20 and 21) are single frames, 2 ms over the baseline's.

**software desktop, drag gap 100 ms (93, 100, 100) against 95 (85 to 105).** Cause as for the zoom row: the gas on the CPU, lighter shader; same session 86 (83 to 97) for today's site against 98.5 (90 to 105).

**software desktop, transition gap 1600 ms (770, 1631, 1600) against 1355 (1296 to 1642). Not explained.** The row reads 670 to 1631 across the six runs of both builds. Not budgeted in software.

**software desktop, map first frame 4151 ms (3896 to 4521) against 4074 (3937 to 4267). Not explained.** Reported only. It follows the warm-up's end, which is a 3 s cap plus load; run 3 (4521) is the run with the 208 ms startup task (section 4).

**software desktop, select to album 27 ms (27, 29, 27) against 24 (17 to 35), and slider to list 9 (7, 9, 10) against 8 (7 to 13). Not explained.** 3 ms and 1 ms.

**software phone, drag gap 80 ms (77, 80, 88) against 79 (74 to 117), and zoom gap 55 (57, 55, 46) against 53 (49 to 55).** The gas on the CPU, lighter shader; 1 and 2 ms.

**gpu desktop, warm-up end 135 ms (135, 135, 136) against 132 (132 to 145), and map first frame 596 (598, 565, 596) against 575 (574 to 907). Not explained.** Reported only. The warm-up ends before any map code runs.

**gpu phone, search usable 78 ms (78, 72, 79) against 74 (72 to 78). Not explained.** 4 ms, before any map code.

### 4. The startup long task on the software desktop column

**Correction.** An earlier version of this file said the task had the "same timestamp as 'warm-up end' in all six runs", and that "the baseline's two tasks sit at the same place". That was wrong. In those runs (commit `6c225edd`) the three part 1 tasks did start at the warm-up's end (3447 against 3450, 3734 against 3736, 3628 against 3629 ms). Of the baseline's three runs one had no long task, one had a task of 57 ms at 3997 ms, which is 419 ms after its warm-up ended (3578) and 77 ms before its first frame, and one had a task of 122 ms at 3711 against a warm-up end of 3712. So one of the baseline's two tasks sat there, not both.

**What the alternating runs show** (software desktop, fresh browser per load; the worst main-thread task of 50 ms or more during startup, 0 when there was none; the Long Tasks API does not report shorter ones):

| Set | Baseline `6f10463e` | Previous head `161d530b` | Current `37906968` |
|---|---|---|---|
| `startup-longtask`, 6 rounds in turn, WebGL calls timed, load 4.0 to 7.6 | 0, 0, 0, 0, 0, 0 | 131, 0, 0, 0, 52, 0 | 51, 66, 0, 0, 52, 73 |
| `startup-longtask-plain`, 5 rounds in turn, nothing timed, load 4.9 to 6.1 | 0, 55, 0, 0, 0 | not run | 0, 0, 50, 0, 162 |
| the three formal `npm run perf` runs | 0, 57, 122 (the day before) | 0, 51, 77 | 50, 50, 208 |
| `lite-ab` perf runs, load 8 to 11 | 67, 85, 0 | not run | lighter: 0, 0, 0 and 0, 0, 300 (with a second task of 96); full shader: 79, 0, 50 |

Two different tasks are in these numbers, and both exist in all three builds:

1. A task that starts at the millisecond the warm-up worker gives up, when the warm-up ends by its 3 s cap and not by finishing. Baseline: 55 (plain round 2), 122, 67, 85. Previous head: 131, 77. Current: 51, 66, 73, 50, 50, 208, 162, 79, 96. It does not come with every capped warm-up: the baseline capped in instrumented rounds 1, 2 and 4, the previous head in rounds 3 and 6 and the current build in round 4, each with no task of 50 ms.
2. A task of 50 to 57 ms that ends about 60 ms before the map's first frame, with the warm-up long over. Baseline: 57. Previous head: 52, 51 (and 51 once on the phone column). Current: 52, 50, 50. In the two instrumented cases it holds seven `texImage2D` calls of under 1 ms together, so the time is not in WebGL.

No timed WebGL call of the gas is inside either: the gas's own upload comes about 300 ms after the first frame, behind the fence (5 ms on the main thread in the round looked at).

**Conclusion.** Part 1 does not add a new startup task, and none of these is the gas upload. Whether part 1 makes the existing tasks longer cannot be told apart from noise with certainty at this load, but the alternating runs lean towards yes, by a little: a task crossed the 50 ms reporting line in 6 of 11 loads of the current build against 1 of 11 of the baseline in turn with it (previous head: 2 of 6), and when it crossed, it read 50 to 79 ms in 9 of the current build's 12 cases, which is what a task of 40 to 50 ms grown by a few ms would look like. Three cases are large (162, 208 and 300 ms; the 300 ended at the map's first frame, in a load that also had a task of 96 at the warm-up's end); the baseline's largest is 122. The cause of the extra was not found (candidates: the larger map chunk to compile, 258 against 249 KB; the theme file parsed near that moment). Every case but one is inside the budget of 250; the 300 was a single `lite-ab` run at load 11 of an earlier commit of the lighter shader (`0fe67fd1`), and no formal run missed the budget. Software phone, where the warm-up finishes by itself: 0, 0, 0 (previous head 0, 0, 51; baseline 0, 0, 0).

### 5. Hover

`baseline/hover-measure.mjs` on the current build, five fresh loads per mode, load 4.0 before. Median (range) in ms, the baseline's in square brackets. Raw: `perf-part1/round3/hover.*`.

| | gpu 1st | gpu 2nd | gpu 3rd | software 1st | software 2nd | software 3rd |
|---|---|---|---|---|---|---|
| Pointer move to tip visible | 141.2 (131.7 to 167.9) [150.3 (135.7 to 169.3)] | 93.9 (91.6 to 119.9) [101.2 (90.6 to 106.8)] | 93.9 (92.2 to 120.5) [90.3 (89.7 to 115.7)] **worse**, inside the range | 123.4 (122.3 to 132.6) [135.5 (133 to 149.4)] | 93.9 (86 to 94.7) [91.6 (85.9 to 107.7)] **worse**, inside the range | 94.3 (86.8 to 110.7) [88.1 (84.9 to 93.1)] **WORSE**, above the worst run |
| Longest long task | 0 (0 to 0) [0 (0 to 55)] | 0 [0] | 0 [0] | 0 [0] | 0 [0] | 0 [0] |
| Longest frame gap | 33.3 (16.8 to 33.3) [33.3 (16.8 to 50)] | 16.8 (16.7 to 16.8) [16.8 (16.7 to 16.8)] | 16.8 (16.8 to 16.8) [16.8 (16.7 to 16.8)] | 66.6 (49.9 to 100) [66.7 (49.9 to 66.7)] | 83.3 (66.6 to 83.3) [66.7 (66.7 to 83.3)] **worse**, inside the range | 83.3 (83.3 to 100.1) [66.7 (50.1 to 83.4)] **worse**, inside the range |

No hover had a long task in any of the ten loads. On the gpu the first and second hover are quicker than the baseline's and the third is 3.6 ms slower in the median, inside the baseline's range: not explained (load 4 of the 5 loads read 120 ms on both later hovers, the others 92 to 95). On the software renderer, which now draws the lighter shader, the later hovers' longest frame is one refresh longer (83.3 against 66.7 ms) and the third hover's tip is 6.2 ms later. Probable cause: each of a hover's three map frames also shades the gas on the CPU, which pushes a frame of just under four refreshes to five; the tip shows from the map's next frame. Not isolated: the hover script was not run against today's site in the same session, so the baseline here is the day before's.

### 6. The fade to the sharper image

`perf-part1/scripts/fade-measure.mjs`, gpu, no override, **24 loads**: at dpr 1 and at dpr 2 each, five at rest, five with a drag begun at the swap and two with reduced motion. Load 12.8 before.

- The sharper image was fetched once and the flag named the stop in 24 of 24 loads; the swap came 1238 to 1275 ms after the zoom.
- At rest (10 loads): 13 or 14 frames drawn in the fade (14 in seven loads, 13 in three), then 0 frames. Every frame gap before and during the fade 16.6 to 16.8 ms.
- A drag begun at the swap (10 loads): worst gap in the fade 16.7 or 16.8 ms, the control drag after it 16.7 or 16.8 ms.
- Reduced motion (4 loads): 1 frame, then 0.
- The 16 strips: upload 0.54 to 1.99 ms on average per load, 5.1 ms at most; the cut 0.52 to 1.71 ms on average, 6.9 ms at most. No long task and no error in any load.

### 7. The lighter shader, same session A/B

Three builds or settings in turn in one session, so the machine is the same for all (`lite-ab/`, plain `npm run perf --mode software`, load 8 to 11; "lighter" is two sets of three). Median (range).

| Row (worst frame gap, ms) | Today's site, 3 runs | Full shader, 3 runs | Lighter shader, 6 runs |
|---|---|---|---|
| software desktop, morph | 143 (76 to 160; n 3) | 166 (145 to 204; n 3) | 150.5 (70 to 165; n 6) |
| software desktop, drag | 86 (83 to 97; n 3) | 105 (104 to 108; n 3) | 98.5 (90 to 105; n 6) |
| software desktop, zoom | 208 (181 to 211; n 3) | 300 (270 to 348; n 3) | 218.5 (159 to 267; n 6) |
| software desktop, deep zoom drag | none | 66 (66 to 79; n 3) | 57.5 (48 to 67; n 6) |
| software desktop, deep zoom, slider between stops | none | 77 (74 to 89; n 3) | 56 (50 to 63; n 6) |
| software phone, morph | 116 (114 to 123; n 3) | 123 (113 to 133; n 3) | 125 (120 to 133; n 6) |
| software phone, drag | 77 (74 to 83; n 3) | 97 (82 to 117; n 3) | 83 (82 to 96; n 6) |
| software phone, zoom | 59 (58 to 59; n 3) | 60 (52 to 88; n 3) | 59.5 (55 to 67; n 6) |
| software phone, deep zoom drag | none | 49 (46 to 59; n 3) | 46.5 (37 to 57; n 6) |
| software phone, deep zoom, slider between stops | none | 64 (60 to 78; n 3) | 40 (37 to 44; n 6) |

Mean frame gap over a whole gesture (`software-frames`, three rounds in turn, load 4 rising to 20 during the run; median of the rounds, ms):

| Variant | Viewport | Drag mean | Drag worst | Zoom mean | Zoom worst | Morph mean | Morph worst |
|---|---|---|---|---|---|---|---|
| today's site | desktop | 80.3 | 400 | 47.1 | 66.7 | 30.7 | 50.1 |
| full shader | desktop | 93.4 | 416.7 | 60.3 | 83.4 | 57.3 | 83.4 |
| lighter shader | desktop | 82 | 383.4 | 48.1 | 66.8 | 31.3 | 66.6 |
| today's site | phone | 62.8 | 83.4 | 41.2 | 66.7 | 32.7 | 50.1 |
| full shader | phone | 73.4 | 100.1 | 51.7 | 83.4 | 42.2 | 83.4 |
| lighter shader | phone | 67.4 | 83.4 | 44.1 | 83.4 | 37.4 | 66.7 |

What the lighter shader recovers: on the desktop the mean frame of a drag, a zoom and a morph is within 2 ms of today's site (the full shader costs 13 to 27 ms a frame). What it does not recover: the phone's morph (mean 37.4 against 32.7; worst gap 125 against 116 in the perf rows, no better than the full shader), a few ms of the phone's drag and zoom means (67.4 against 62.8, 44.1 against 41.2), the worst frame of a morph in this script on both viewports (66.6 and 66.7 against 50.1, one refresh), and the worst frame of the desktop zoom in about half the perf runs (section 3). What it gives up to get there is in `app-gas-detail.md` ("Closing pass").

### 8. Load

The one minute load before and after every run is in section 1 and in `perf-part1/round3/LOAD.txt`, which also holds the first and last line of every output file and the measurement script itself. In short: every perf run began at 3.4 to 3.9 and ended at 5.1 to 15.2; hover began at 4.0; the startup rounds ran at 4.0 to 7.6; the software frame rounds began at 4.0 and ran up to 20; the fade ran at 12.8 falling to 8.6. The baseline file was taken at 5 to 13.

### 9. Sizes

From a fresh build of the closing code (`0bf30a31`), measured as the perf script does it (every script of `/`, gzip level 9), and the same on a build of the baseline:

| Measure | Baseline | Now | Budget |
|---|---|---|---|
| First-load JS of `/`, gzip, with nomodule scripts | 190.5 KB | 191.2 KB (+0.7) | 200 KB |
| First-load JS of `/`, gzip, without nomodule scripts | 151.9 KB | 152.6 KB (+0.7) | reported only |
| three.js in the first-load scripts | 0 KB | 0 KB | must be 0 |
| Gas shader text in any first-load script | none | none (searched for `u_gasA`, `u_liteLod`, `GAS_LITE` in all 11) | must be none |
| The lazy map chunk (three.js, the map and the gas), gzip | 249.1 KB | 258.0 KB (+8.9) | none |

8.8 KB of the first-load budget are left for parts 2 and 3. (Earlier sections give the lazy chunk as 248.2 and 252.7 KB; those were not measured the same way and are replaced by this row.)

### 10. After the closing fixes

The closing pass changed the app after the six runs (`0bf30a31`). What that commit can and cannot have moved:

- **gpu columns: the shader and the per-frame code they run are unchanged.** The full shader's text has no change, the lighter shader's level is computed only when the lighter shader is in use, and the other changes are in listeners and in failure paths (two clock reads and a set operation per pointer event). The gate change does not alter what this machine gets (it had a fine, hovering pointer and no touch points).
- **software columns: one changed input.** The lighter shader's single read now takes a fractional mip level (trilinear, the filter the texture already had) where it took a whole one, and in deep zoom a higher one. Same number of reads.

**Not measured again: this is owed.** The brief asked for one more `npm run perf` on the final build and a rerun of `perf-part1/scripts/software-frames.mjs`. Neither was run: the laptop went from mains to battery during the closing pass (it was on mains at 09:16 and on battery from before 11:00), timing on battery is not comparable (the rule of this file), and a script that waited 25 minutes for mains power (11:02 to 11:27) gave up with nothing measured. So every number in sections 1 to 8 is of `37906968`, and whether the fractional level costs the software columns anything is **not known**. The closing build did pass the whole browser suite (software renderer, both shaders), and its sizes are in section 9.

To close it, on mains, from `frontcreck/` after `npm run build`: `npm run perf` once, and, with today's site (`6f10463e`) served on 3301 and this build on 3302, `node ../docs/design/trifid-theme/reviews/perf-part1/scripts/software-frames.mjs out.json --rounds 3 baseline=http://127.0.0.1:3301 "full=http://127.0.0.1:3302?lite=off" lighter=http://127.0.0.1:3302`; compare the lighter rows with section 7.

### 11. What is still open

**Still worse than today's site** (current median above the baseline's worst run, or a new cost with no baseline):

- Software renderers: the worst frame of a zoom on the desktop (255 against 202 ms), the morph on the phone (121 against 114 ms), and one refresh more in the later hovers' longest frame (83.3 against 66.7 ms) with the third hover's tip 6 ms later. This is with the lighter shader; the full shader was worse.
- Software desktop startup: a main-thread task of 50 ms or more in more loads than today's site (6 of 11 against 1 of 11 in turn), usually 50 to 73 ms, three times 162 to 300; inside the budget in every formal run.
- gpu: frame gaps of one frame plus 1 to 6 ms over the baseline's in six rows (gpu desktop deep zoom drag; gpu phone morph and deep zoom morph; dpr 2 morph, drag and deep zoom morph), all under half the budget, and slider to list at dpr 2 (19 against 6 ms).
- The lazy map chunk is 8.9 KB larger; first-load JS 0.7 KB larger.
- After the map's first frame the nebula is a further 43 to 61 ms on the gpu and about 280 to 310 ms on software (51 once, in the run whose first frame was itself late) (no baseline: today's site has none).

**Unexplained** (said so above): software desktop search usable (189 against 121 ms); the single 37 and 36 ms frames of gpu desktop in current run 1; the gpu rows that are one frame plus a few ms; slider to list at dpr 2; the gpu's third hover; the extra in the startup task; software desktop transition gap and first frame; the 1 to 4 ms rows.

**Never measured:** the closing build's own perf run and software frames (section 10: the laptop was on battery); Safari and Firefox (the strip upload from a cut `ImageBitmap` and whether they keep its alpha unmultiplied; the fence; the memory rule, which they do not report); a real phone; a weak or integrated GPU (every gpu number here is an M1 Pro); a touch screen laptop or a tablet with a mouse (the gate was tested with a reported touch point count, not on a device); the fade and the lighter shader by eye in motion; the hover path against today's site in the same session.

---

# History: everything below is superseded by the section above

The sections below are the measurements of earlier commits, kept as they were written. Their headlines, their "still worse" tables and their sizes are **superseded**. The regression checklist and the list of manual probes further down are of commit `6c225edd`; they were not walked again in the closing pass (the browser suite was: see the closing report). One sentence in them was wrong and is corrected in section 4 above (the startup long task's timestamp).

## Superseded: first measurement on mains (commit `6c225edd`, 2026-10-05 02:40 to 03:25)

- Commit measured: `6c225edd` on `trifid-build` (tasks 1 to 5, Task 6's changes to `GasField`, and fix round 1).
- Date: 2026-10-05, 02:40 to 03:25 local time. **On mains power, with an ordinary launch: plain `npm run perf`, three times, and `baseline/hover-measure.mjs`, exactly as the baseline was taken.** No preload, no changed browser arguments.
- Machine: MacBook Pro, Apple M1 Pro, 16 GB, shared with other sessions the whole time. Each run waited up to fifteen minutes for the one-minute load to fall under 4; it never did. Load before the runs: 6.5, 5.9, 6.1 (the baseline was taken at 5 to 13). Node v22.23.3 arm64, Google Chrome 154.0.8037.93 headless arm64, production build.
- Renderers: gpu `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`; software `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`.
- Baseline: `baseline/BASELINE-PERF.md` and `baseline/perf/` (today's site, commit `1e9ef508`). Budgets: `frontcreck/scripts/perf/budgets.json`, unchanged.
- Raw: `perf-part1/perf-run1.json` to `perf-run3.json` and `.txt`, `app-hover-part1.json` and `.txt`.

### Superseded headline

**Budgets.** Runs 1 and 3 met every budget. Run 2 missed one: software desktop "select to album" 240 ms against 200 (25 and 33 ms in the other two runs, 17 to 35 in the baseline), a single run on a loaded machine; its median is 33 ms. No median is over budget. The startup long task on software renderers, which missed its budget in every earlier run of part 1 on both software columns (268 and 276 ms on desktop, 241 and 261 ms on phone, depending on the launch), is now 155 ms on desktop (120 to 164) and 0 ms on phone, against a budget of 250.

**Still worse than the baseline** (median above the baseline's worst run), every row, with its cause; details in "What is still worse":

| Row | Now | Baseline | Cause |
|---|---|---|---|
| software desktop, startup long task | 155 ms (120 to 164) | 57 ms (0 to 122) | Not the gas. It is the same task as in the baseline, the main-thread WebGL probe that starts the moment the warm-up worker gives up (same timestamp as "warm-up end" in all six runs) [WRONG: true of the three part 1 runs and of one of the baseline's two tasks; corrected in section 4 of the closing measurement]; 33 to 42 ms longer than the baseline's worst run, on a busier machine. Cause of the extra not established |
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

**Software desktop startup long task: 155 ms (155, 120, 164) against 57 (0, 57, 122); budget 250.** This is no longer the gas. In each of the three runs the task starts at the millisecond the warm-up worker gives up ("WebGL warm-up end": 3450, 3736, 3629 ms; task starts: 3447, 3734, 3628 ms), 500 to 600 ms before the map's first frame; the baseline's two tasks sit at the same place (3711 against a warm-up end of 3712) [WRONG: only that one does; the other started 419 ms after its warm-up ended; see section 4 of the closing measurement]. It is the site's own first WebGL context on the main thread. It reads 33 to 42 ms longer than the baseline's worst run; whether that is the busier machine or something part 1 adds to that moment (the theme file is parsed around then) was not established. Software phone, where the warm-up finishes by itself, has no startup long task at all (0 in three runs, as the baseline).

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

## Superseded: M1 follow-up, the sharper gas image and the new first images (2026-10-05, 04:49 to 05:30)

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

