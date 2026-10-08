# Trifid theme against the old site: speed, part 2 (stars, lines, names, twinkle, gas)

Measured 2026-10-06, 18:42 to 20:43 local time. Part 3 (`app-perf-part3.md`) has the glass, the header, Home, the phone strip and the pages. Both parts come from one session and share the conditions below.

## Conditions, read first

- **Builds.** New: `f8f8a61e`, which is `daef1189` (`origin/feat/trifid-theme`) plus one commit that touches only `scripts/perf/` (the app code and the built site are `daef1189`'s). Old: `6f10463e`, the site before the theme (app code identical to `1e9ef508`), built in a scratch worktree with the new `perf.mjs`, `lib.mjs` and `compare.mjs` copied over it. Both built in this session, production builds.
- **Machine.** MacBook Pro, Apple M1 Pro, 16 GB. Node v22.23.3 arm64 (`node -p process.arch` printed `arm64`; every script also checks that Chrome is native). Headless Google Chrome, GPU runs on Metal.
- **Not a quiet machine.** The owner ruled that it need not be. Other sessions were working throughout and another agent's screenshot jobs took turns with these runs through the shared lock (`_tools/heavy.sh`), so no two heavy jobs ran at once but the machine was never idle. One minute load average at the start of a run: 2.8 to 11.4, mostly 4 to 7. Every run went through the lock, which starts it under `nice -n 10`; old and new, and both arms of every pair, were treated the same.
- **Power.** On mains until about 19:30, then **on battery** for the rest of the session (the charger came out between 19:29:50 and 19:31:23; low power mode was off; everything ran under `caffeinate -i`). On mains: the old against new runs, the header probe, the names probe, twinkle rounds 1 to 4 and part of 5. On battery: twinkle rounds 5 to 12, every `--glass` and `--names` pair of `perf.mjs`, Home, the strip, the hover runs, the layout timing and the GPU browser tests. Each output file records the power source and the load before and after.
- **The numbers are approximations.** Three runs a side for `perf.mjs`, 6 to 12 sessions an arm for the probes. `compare.mjs` flags every median above the other side's median with no tolerance (SLOWER: above the median; WORSE: above the worst run). Each flag below has a noise judgement: whether the difference is larger than the spread of the runs. Nobody has yet judged the smoothness by hand, which the owner will do.
- `frontcreck/scripts/perf/budgets.json` is unchanged.

Raw output: `after/perf/` (`session.txt`, `ab/`, `names-gpu-desktop/`, `twinkle/`, `probe/`, `hover-*.{json,txt}`, `layout-cost-crowded.txt`, `e2e-gpu/`). Logs of the jobs: `.claude/worktrees/_notes/logs/p3t9run-*.log` (not in the repository).

## The three merge gates

| Gate | Verdict | Numbers |
|---|---|---|
| 1. The header's 22 px backdrop blur over a moving map | **PASS on frame gaps**, with one thing it cannot show (part 3, section 1) | Longest frame gap, glass against the solid fallback, median of 6 sessions (best to worst). Drag 18.5 (17.8 to 18.8) against 18.3 (17.3 to 19.7) ms; wheel zoom 19.7 (18.2 to 20.7) against 18.7 (17.6 to 20.1); fling 18.5 (17.3 to 19.2) against 17.5 (17.3 to 17.8). At device pixel ratio 2: 18.5 against 18.3, 19.1 against 19.0, 18.6 against 18.4. No frame was dropped in either arm in 24 sessions. |
| 2. The twinkle's effect on the first hover | **PASS** | Longest frame gap of the first hover, 12 sessions an arm, median (best to worst): glints on 61 ms (45 to 71), off 64 ms (49 to 78), held 60 ms (46 to 75). The arms differ by 1 to 4 ms and each arm spreads over 26 to 29 ms. Later hovers 21 to 22 ms in every arm. |
| 3. Map first frame and first gas with the region names on and off | **PASS** | Fresh `/map`, 8 sessions an arm, median (best to worst). First frame: on 550.5 ms (538 to 565), off 548.5 (536 to 564). Gas first shown: on 592.5 (580 to 607), off 591 (579 to 606). The gas follows the first frame by 43 ms with names and 42 without. No long task in any of the 16 loads. |

The details of gates 2 and 3 are in sections 3 and 4 below; gate 1 is in part 3.

## 1. Old against new, in turn

Three full runs a side, alternating (old, new; new, old; old, new), 18:43 to 19:00, on mains. Both sides ran with `--open whole` so each run does the same work; the old side also with `--no-gas` (it has no gas to wait for). Command and loads are in section 7.

| Run | Budgets | Load before (1 min) | Load after (1, 5, 15 min) |
|---|---|---|---|
| old 1 | all met | 11.41 | 6.28, 6.81, 7.04 |
| new 1 | all met | 5.44 | 5.00, 6.13, 6.72 |
| new 2 | all met | 4.47 | 5.02, 5.80, 6.47 |
| old 2 | all met | 5.17 | 6.83, 6.23, 6.52 |
| old 3 | all met | 5.91 | 5.18, 5.77, 6.27 |
| new 3 | all met | 4.69 | 6.35, 6.15, 6.33 |

The three old runs exit 1 for one reason only: the new script checks that a GPU run made a glint while idle, and the old site has none. That is expected and is not a budget. No budget was missed in any of the six runs, no console error in any column, 0 frames and 0 long tasks at rest everywhere. Old run 1 began at the highest load of the session (11.4); its numbers are not visibly different from old runs 2 and 3.

Sizes: first-load JS 190.8 KB against 190.5 KB (+0.3 KB, budget 200; flagged by `compare.mjs`, explained by the theme's code in the first load). Server HTML 28.2 against 28.3 KB (Home) and 33.9 against 34.0 KB (album). No three.js in the first load on either side.

Every row (`after/perf/ab/compare.txt`). "Against the spread" is filled in for flagged rows only.

| Column | Measure | Budget | Old, median (min to max) | New, median (min to max) | Delta | Flag | Against the spread |
|---|---|---|---|---|---|---|---|
| software desktop | searchUsableMs | 1000 | 75 (68 to 727) | 109 (84 to 323) | +34 (+45 %) | SLOWER | inside the spread |
| software desktop | startupLongTaskMs | 250 | 0 (0 to 113) | 0 (0 to 0) | 0 |  |  |
| software desktop | mapFirstFrameMs | none | 3686 (3653 to 4863) | 4448 (4391 to 4638) | +762 (+21 %) | SLOWER | inside the spread |
| software desktop | typeToSuggestionsMs | 100 | 5 (4 to 5) | 5 (4 to 5) | 0 |  |  |
| software desktop | selectToAlbumMs | 200 | 18 (17 to 19) | 21 (21 to 22) | +3 (+17 %) | WORSE | every run above every old run |
| software desktop | transitionGapMs | none | 1238 (1191 to 1261) | 625 (622 to 640) | -613 (-50 %) |  |  |
| software desktop | sliderToListMs | 150 | 7 (7 to 9) | 6 (6 to 6) | -1 (-14 %) |  |  |
| software desktop | morphGapMs | none | 151 (141 to 154) | 178 (115 to 195) | +27 (+18 %) | WORSE | median above every old run, ranges overlap |
| software desktop | dragGapMs | none | 90 (83 to 138) | 116 (116 to 120) | +26 (+29 %) | SLOWER | inside the spread |
| software desktop | zoomGapMs | none | 179 (174 to 180) | 287 (214 to 290) | +108 (+60 %) | WORSE | every run above every old run |
| software desktop | idleLongTasks | 0 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| software desktop | idleFrames | 1 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| software desktop | deepDragGapMs | none | 51 (50 to 52) | 76 (73 to 77) | +25 (+49 %) | WORSE | every run above every old run |
| software desktop | deepMorphGapMs | none | 49 (47 to 52) | 72 (67 to 74) | +23 (+47 %) | WORSE | every run above every old run |
| software desktop | gasShownMs | none | n/a | 4807 (4725 to 5009) | n/a |  |  |
| software phone | searchUsableMs | 1000 | 68 (64 to 123) | 117 (71 to 772) | +49 (+72 %) | SLOWER | inside the spread |
| software phone | startupLongTaskMs | 250 | 0 (0 to 0) | 0 (0 to 57) | 0 |  |  |
| software phone | mapFirstFrameMs | none | 2742 (2684 to 2797) | 2878 (2848 to 2959) | +136 (+5 %) | WORSE | every run above every old run |
| software phone | typeToSuggestionsMs | 100 | 5 (5 to 5) | 5 (4 to 5) | 0 |  |  |
| software phone | selectToAlbumMs | 200 | 16 (16 to 17) | 21 (21 to 27) | +5 (+31 %) | WORSE | every run above every old run |
| software phone | transitionGapMs | none | 739 (738 to 772) | 848 (834 to 861) | +109 (+15 %) | WORSE | every run above every old run |
| software phone | sliderToListMs | 150 | 21 (14 to 40) | 10 (8 to 12) | -11 (-52 %) |  |  |
| software phone | morphGapMs | none | 120 (112 to 122) | 121 (117 to 125) | +1 (+1 %) | SLOWER | inside the spread |
| software phone | dragGapMs | none | 73 (73 to 77) | 87 (87 to 88) | +14 (+19 %) | WORSE | every run above every old run |
| software phone | zoomGapMs | none | 57 (55 to 60) | 52 (52 to 70) | -5 (-9 %) |  |  |
| software phone | idleLongTasks | 0 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| software phone | idleFrames | 1 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| software phone | deepDragGapMs | none | 44 (43 to 47) | 45 (42 to 46) | +1 (+2 %) | SLOWER | inside the spread |
| software phone | deepMorphGapMs | none | 45 (36 to 47) | 44 (42 to 49) | -1 (-2 %) |  |  |
| software phone | gasShownMs | none | n/a | 3158 (3118 to 3237) | n/a |  |  |
| gpu desktop | searchUsableMs | 1000 | 74 (68 to 76) | 73 (71 to 75) | -1 (-1 %) |  |  |
| gpu desktop | startupLongTaskMs | 250 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop | mapFirstFrameMs | none | 562 (561 to 565) | 581 (572 to 583) | +19 (+3 %) | WORSE | every run above every old run |
| gpu desktop | typeToSuggestionsMs | 100 | 5 (5 to 7) | 6 (5 to 6) | +1 (+20 %) | SLOWER | inside the spread |
| gpu desktop | selectToAlbumMs | 200 | 21 (18 to 22) | 26 (24 to 27) | +5 (+24 %) | WORSE | every run above every old run |
| gpu desktop | transitionGapMs | 50 | 22 (21 to 22) | 24 (21 to 27) | +2 (+9 %) | WORSE | median above every old run, ranges overlap |
| gpu desktop | sliderToListMs | 150 | 8 (5 to 13) | 11 (6 to 19) | +3 (+38 %) | SLOWER | inside the spread |
| gpu desktop | morphGapMs | 50 | 18 (18 to 19) | 18 (18 to 19) | 0 |  |  |
| gpu desktop | dragGapMs | 50 | 19 (18 to 20) | 20 (19 to 34) | +1 (+5 %) | SLOWER | inside the spread |
| gpu desktop | zoomGapMs | 50 | 32 (29 to 34) | 28 (28 to 34) | -4 (-12 %) |  |  |
| gpu desktop | idleLongTasks | 0 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop | idleFrames | 1 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop | deepDragGapMs | none (yardstick 50) | 20 (18 to 21) | 20 (18 to 21) | 0 |  |  |
| gpu desktop | deepMorphGapMs | none (yardstick 50) | 18 (17 to 18) | 19 (18 to 19) | +1 (+6 %) | WORSE | median above every old run, ranges overlap |
| gpu desktop | gasShownMs | none | n/a | 623 (614 to 625) | n/a |  |  |
| gpu phone | searchUsableMs | 1000 | 70 (70 to 75) | 69 (69 to 72) | -1 (-1 %) |  |  |
| gpu phone | startupLongTaskMs | 250 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu phone | mapFirstFrameMs | none | 549 (543 to 549) | 551 (551 to 554) | +2 (0 %) | WORSE | every run above every old run |
| gpu phone | typeToSuggestionsMs | 100 | 5 (5 to 6) | 4 (4 to 5) | -1 (-20 %) |  |  |
| gpu phone | selectToAlbumMs | 200 | 21 (18 to 24) | 25 (22 to 26) | +4 (+19 %) | WORSE | median above every old run, ranges overlap |
| gpu phone | transitionGapMs | 50 | 18 (17 to 19) | 18 (18 to 19) | 0 |  |  |
| gpu phone | sliderToListMs | 150 | 15 (14 to 17) | 15 (10 to 18) | 0 |  |  |
| gpu phone | morphGapMs | 50 | 18 (18 to 19) | 19 (19 to 21) | +1 (+6 %) | SLOWER | inside the spread |
| gpu phone | dragGapMs | 50 | 19 (18 to 27) | 21 (20 to 22) | +2 (+11 %) | SLOWER | inside the spread |
| gpu phone | zoomGapMs | 50 | 32 (32 to 33) | 30 (30 to 31) | -2 (-6 %) |  |  |
| gpu phone | idleLongTasks | 0 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu phone | idleFrames | 1 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu phone | deepDragGapMs | none (yardstick 50) | 19 (18 to 19) | 19 (19 to 20) | 0 |  |  |
| gpu phone | deepMorphGapMs | none (yardstick 50) | 18 (17 to 19) | 18 (17 to 19) | 0 |  |  |
| gpu phone | gasShownMs | none | n/a | 597 (594 to 608) | n/a |  |  |
| gpu desktop2x | searchUsableMs | none | 68 (68 to 70) | 71 (70 to 77) | +3 (+4 %) | WORSE | median above every old run, ranges overlap |
| gpu desktop2x | startupLongTaskMs | none | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop2x | mapFirstFrameMs | none | 561 (545 to 565) | 564 (555 to 585) | +3 (+1 %) | SLOWER | inside the spread |
| gpu desktop2x | typeToSuggestionsMs | none | 5 (4 to 6) | 5 (4 to 6) | 0 |  |  |
| gpu desktop2x | selectToAlbumMs | none | 18 (17 to 22) | 23 (23 to 25) | +5 (+28 %) | WORSE | every run above every old run |
| gpu desktop2x | transitionGapMs | none (yardstick 50) | 20 (20 to 21) | 18 (17 to 21) | -2 (-10 %) |  |  |
| gpu desktop2x | sliderToListMs | none | 9 (7 to 14) | 9 (7 to 14) | 0 |  |  |
| gpu desktop2x | morphGapMs | none (yardstick 50) | 22 (19 to 23) | 18 (17 to 18) | -4 (-18 %) |  |  |
| gpu desktop2x | dragGapMs | none (yardstick 50) | 20 (19 to 20) | 20 (18 to 34) | 0 |  |  |
| gpu desktop2x | zoomGapMs | none (yardstick 50) | 28 (28 to 29) | 30 (27 to 30) | +2 (+7 %) | WORSE | median above every old run, ranges overlap |
| gpu desktop2x | idleLongTasks | none | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop2x | idleFrames | none | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop2x | deepDragGapMs | none (yardstick 50) | 19 (19 to 19) | 19 (19 to 24) | 0 |  |  |
| gpu desktop2x | deepMorphGapMs | none (yardstick 50) | 19 (18 to 19) | 18 (17 to 19) | -1 (-5 %) |  |  |
| gpu desktop2x | gasShownMs | none | n/a | 622 (596 to 643) | n/a |  |  |

`gasShownMs` (when the nebula is first visible, Home's load): software desktop 4807 ms (4725 to 5009), software phone 3158 (3118 to 3237), gpu desktop 623 (614 to 625), gpu phone 597 (594 to 608), gpu desktop2x 622 (596 to 643). The old site has no gas, so there is nothing to compare. The opening view rows were not measured in these runs (`--open whole`); they are in the pairs of section 4 and part 3.

The same three new runs against the committed baseline of 2026-10-04 (another day, another load; `after/perf/ab/compare-committed-baseline.txt`) give 10 SLOWER and 9 WORSE, and agree on the one flag that matters below: select to album is 4 to 6 ms slower on the GPU.

## 2. Every flag, with a judgement

31 findings: 30 rows and the first-load JS. Grouped by what they are.

**Real: select to album, +3 to +5 ms in all five columns.** Old 16 to 24 ms, new 21 to 27 ms. In four of the five columns every new run is above every old run; in the fifth (gpu phone) the ranges overlap by 2 ms. The committed baseline says the same. It is 13 percent of the 200 ms budget and under one frame, but it is slower than the old site and repeats everywhere, so it is a finding. The cause was not isolated. It is not the glass (with glass forced off 27 ms, on 25 ms, part 3) and the names pair does not settle it (on 26, off 24, ranges touching). Cheapest next step: one recorded profile of the album opening on both builds to see which part of the commit grew (the panel has more in it than before); no remedy can be named honestly before that.

**Real: map first frame on the GPU desktop, +19 ms (581 against 562).** Every new run is above every old run. gpu phone +2 ms and gpu desktop2x +3 ms carry flags too but are inside 3 to 20 ms of spread. So about 3 percent on one column and nothing resolvable on the others. Names on or off does not move it (section 4). Reported only, no budget. No remedy proposed: nothing cheap is known to be in that path.

**Real: the software renderer is slower with the gas.** Software desktop: wheel zoom 287 against 179 ms (+60 percent), deep zoom drag 76 against 51, deep zoom morph 72 against 49, each with every run above every old run; slider morph 178 against 151 (ranges overlap); drag 116 against 90 (inside the spread, old had one run at 138); map first frame 4448 against 3686 (inside the spread, old had one run at 4863). Software phone: drag 87 against 73, album transition 848 against 739, map first frame 2878 against 2742, each with every run above every old run. These columns have no frame budget, because a software renderer is not what most visitors have, but they are worse than the old site and the cause is plain: the gas is one more full-screen layer for a CPU to shade, even with the lighter shader. One row went the other way: software desktop album transition 625 against 1238 ms. Cheapest remedy, if the owner wants visitors without a GPU to lose nothing: draw no gas on a software renderer (plain sky, as a browser without WebGL already gets). The app already knows the renderer (it plays no glints there).

**Not resolved: one dropped frame in a drag, twice.** GPU drag gap: new 20 (19 to 34) on desktop and 20 (18 to 34) at dpr 2, old 19 (18 to 20) and 20 (19 to 20). Two of the six new desktop-class runs had a single 34 ms gap (one dropped frame) in the whole-map drag; no old desktop run did (the old phone column had one 27 ms gap). The medians differ by 0 to 1 ms. It did not come back in the 24 header probe sessions of part 3 (no drag gap over 20 ms in 48 s of dragging) or in the 12 later `perf.mjs` runs of the desktop pairs (drag 18 to 22 ms). Two in six against none in six cannot be told from chance. Worth a look by hand; nothing to remedy yet.

**Noise: GPU frame gap rows that differ by 1 to 2 ms.** gpu desktop transition 24 against 22 (new 21 to 27, old 21 to 22: WORSE by the rule, ranges overlap), deep zoom morph 19 against 18, drag 20 against 19; gpu phone morph 19 against 18, drag 21 against 19; gpu desktop2x wheel zoom 30 against 28. A frame is 16.7 ms and these values are all one frame plus timer jitter. None is larger than its spread except in the sense that an old range of 1 ms is easy to exceed. The wheel zoom is a two-frame gap (28 to 34 ms) on the old site and the new one alike: see section 5 for the likely cause.

**Noise: the rest.** Search usable on software (109 against 75, and 117 against 68): the old side has a run at 727 and the new one at 772, so inside the spread. gpu desktop2x search usable 71 (70 to 77) against 68 (68 to 70): WORSE by the rule, 3 ms, ranges touching at 70. Typing to suggestions +1 ms, slider to list +3 ms on gpu desktop (ranges 5 to 13 and 6 to 19), software phone morph +1 ms, software phone deep drag +1 ms: all inside the spread.

## 3. Twinkle (gate 2)

`twinkle-cost.mjs --mode gpu --viewport desktop --no-warmup --first <arm>`, one browser launch per session, 12 rounds of three sessions (on, off, held first; the order rotates every round), 19:13 to 20:20. In each session the first measured mouse run is the first hover of that page load. Rounds 1 to 4 were on mains, round 5 straddles the change, rounds 6 to 12 were on battery. Load before a session 2.8 to 10.6.

| First hover, longest frame gap (ms) | Glints on | Glints off | Glints held |
|---|---|---|---|
| All 12 sessions, median (best to worst) | 61 (45 to 71) | 64 (49 to 78) | 60 (46 to 75) |
| On mains | 61 (45 to 71), n=4 | 69 (49 to 78), n=5 | 60 (46 to 62), n=4 |
| On battery | 60 (48 to 68), n=8 | 59 (49 to 72), n=7 | 61 (49 to 75), n=8 |
| Sessions with a long task (50 ms or more) in the first hover | 3 of 12 | 4 of 12 | 1 of 12 |
| Later hover in the same session, longest gap | 22 (18 to 30) | 21 (19 to 29) | n/a |

"Held" starts the glints 1.5 s after the hover label first shows. Still map, 36 runs with glints and 36 without: longest gap 20.5 (18 to 27) against 20 (18 to 28) ms, the map canvas drew 0 frames in all 72, 8 to 11 glints per 20 s run, the slowest glint write 6.8 ms.

**Verdict: PASS.** With glints the first hover is 3 ms shorter in the median than without, and each arm spreads over 26 to 29 ms; the power source does not change the picture. The earlier rough numbers (on 53 and 55, off 50 and 49, held 49) sit inside these ranges.

Two things to know that the verdict does not hide:

- **The first hover has one long frame whatever the glints do: 45 to 78 ms in 36 of 36 sessions**, and exactly one gap over 32 ms each time. Glints are not its cause (the off arm has it). This script cannot run on the old site (it needs the theme's twinkle hooks), so it does not say whether that frame is new. The baseline's own hover script can, and says it is not: section 5.
- Two of the 12 sessions with glints on (rounds 6 and 9) broke the script's rule "no long task began around a glint being made". In both, the long task is the first hover's own (it is there in 4 of 12 sessions without glints) and a glint happened to be made within 20 ms of it; in round 6 the glint was written 6 ms into the 68 ms gap. The app holds new glints only once an album is hovered, so a glint can land in the same frame as the first hover. It adds nothing measurable (61 against 64 ms), but if the owner wants the coincidence gone, the cheapest change is to hold new glints from the first pointer move over the map, not from the first hovered album.

**The script fix (commit `f8f8a61e`).** Under `--no-warmup` the exit code compared a session's first mouse run with its second: the first hover against a later hover, 60 against 21 ms, an effect of the order and not of the glints. That pair is no longer compared (the 24 sessions that began with glints, on or held, would all have failed on it; 34 of the 36 now exit 0 and the two that do not are the rule above). The first hover is judged across sessions: `node scripts/perf/twinkle-cost.mjs --first-hover-verdict <folder>` reads the first-hover row of each saved session and fails when the median longest frame gap or longest task with glints (on, or held) is more than the script's own 8 ms allowance above the median without, or when an arm has fewer than three sessions. What the rule now proves: that across separate page loads the typical first hover is not slower with glints by more than 8 ms. It does not prove anything about a single worst session, and it does not judge the first hover's own length. Unit tests: `scripts/perf/lib.test.mjs`, "firstHoverVerdict" (7 tests, written first and seen to fail).

## 4. Names (gate 3)

**Startup on a fresh `/map`** (`effect-probe.mjs names`, 8 sessions an arm, alternating, each a new browser with a cold cache; on mains, load 4.6 to 5.8):

| Measure | Names on, median (best to worst) | Names off | Delta | Against the spread |
|---|---|---|---|---|
| Map first frame (ms) | 550.5 (538 to 565) | 548.5 (536 to 564) | +2 | inside (27 ms) |
| Gas first shown (ms) | 592.5 (580 to 607) | 591 (579 to 606) | +1.5 | inside (27 ms) |
| Gas after the first frame (ms) | 43 (41 to 44) | 42 (41 to 44) | +1 | inside (3 ms) |
| Longest task (ms) | 0 | 0 | 0 | |
| Names in the layer after 3 s | 30 | none | | |

**Verdict: PASS.** The names do not delay the first frame or the first gas by anything this can see. The server is on the same machine, so the gas image arrives at once; on a slow network the names wait for the first gas image by design and that wait was not measured here.

**Everything else with names on against off** (`perf.mjs --mode gpu --viewport desktop --names on|off`, three interleaved pairs, on battery, load 3.1 to 5.2; `after/perf/names-gpu-desktop/`):

| Column | Measure | Budget | Off, median (min to max) | On, median (min to max) | Delta | Flag | Against the spread |
|---|---|---|---|---|---|---|---|
| gpu desktop | searchUsableMs | 1000 | 71 (71 to 75) | 69 (69 to 77) | -2 (-3 %) |  |  |
| gpu desktop | startupLongTaskMs | 250 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop | mapFirstFrameMs | none | 568 (561 to 585) | 569 (546 to 569) | +1 (0 %) | SLOWER | inside the spread |
| gpu desktop | typeToSuggestionsMs | 100 | 7 (5 to 7) | 6 (6 to 7) | -1 (-14 %) |  |  |
| gpu desktop | selectToAlbumMs | 200 | 24 (17 to 25) | 26 (26 to 29) | +2 (+8 %) | WORSE | every run above every off run |
| gpu desktop | transitionGapMs | 50 | 24 (23 to 28) | 24 (21 to 25) | 0 |  |  |
| gpu desktop | sliderToListMs | 150 | 11 (10 to 14) | 11 (7 to 15) | 0 |  |  |
| gpu desktop | morphGapMs | 50 | 18 (18 to 27) | 21 (18 to 21) | +3 (+17 %) | SLOWER | inside the spread |
| gpu desktop | dragGapMs | 50 | 19 (18 to 20) | 18 (18 to 19) | -1 (-5 %) |  |  |
| gpu desktop | zoomGapMs | 50 | 30 (28 to 30) | 33 (30 to 36) | +3 (+10 %) | WORSE | median above every off run, ranges overlap |
| gpu desktop | openingDragGapMs | none (yardstick 50) | 18 (18 to 19) | 18 (17 to 18) | 0 |  |  |
| gpu desktop | openingZoomGapMs | none (yardstick 50) | 38 (35 to 46) | 35 (30 to 39) | -3 (-8 %) |  |  |
| gpu desktop | idleLongTasks | 0 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop | idleFrames | 1 | 0 (0 to 0) | 0 (0 to 0) | 0 |  |  |
| gpu desktop | deepDragGapMs | none (yardstick 50) | 18 (18 to 20) | 18 (18 to 19) | 0 |  |  |
| gpu desktop | deepMorphGapMs | none (yardstick 50) | 18 (18 to 18) | 17 (17 to 18) | -1 (-6 %) |  |  |
| gpu desktop | gasShownMs | none | 610 (605 to 624) | 611 (607 to 612) | +1 (0 %) | SLOWER | inside the spread |

- Wheel zoom at the whole map: on 33 (30, 33, 36), off 30 (28, 30, 30). WORSE by the rule and the median is above every off run. But the same gesture at the opening view, where more names are on screen, goes the other way: on 35 (30 to 39), off 38 (35 to 46). The two disagree, so this is **not resolved** at three runs; if anything is there it is 3 ms on a gap that is already two frames. No remedy proposed.
- Select to album 26 (26 to 29) against 24 (17 to 25): WORSE by the rule, ranges touch. The names are taken away when an album opens, so a millisecond or two is plausible, but this pair cannot separate it from the spread.
- Morph 21 against 18 (off had a run at 27), map first frame +1 ms, gas shown +1 ms: inside the spread.
- Drag, deep zoom, idle: level or better with names.

Only gpu desktop was paired for names. The phone (at most four names) and dpr 2 were not.

`names-cost.cjs` (the layout function in Node) was not rerun; nothing in it changed since its last report.

## 5. Stars, lines and gas

**The stars' own cost** is inside the drag, zoom and morph rows of section 1: on the GPU every one is level with the old site to within a frame's jitter. A run with every switch off (the runbook's step 5) was not made; the pairs make it unnecessary for a verdict but it would have given the stars and gas alone.

**The first hover, old against new, with the baseline's own script** (`hover-measure.mjs --mode gpu`, 5 fresh loads each, on battery, load 4.2 to 4.8):

| First hover | Old | New, whole map | New, opening view |
|---|---|---|---|
| Pointer move to the label visible (ms), median (best to worst) | 121.7 (117 to 149.2) | 144.1 (122.4 to 153.9) | 119 (111.8 to 147.4) |
| Longest frame gap (ms) | 33.3 (16.7 to 33.4) | 33.3 (33.3 to 33.4) | 33.4 (16.8 to 50) |
| Longest long task (ms) | 0 | 0 | 0 (0 to 50) |
| Second and third hover, label (ms) | 94 and 92.3 | 93.6 and 92.8 | 90.7 and 90.8 |

At the whole map the first label comes 22 ms later than on the old site, with ranges that overlap (four of five new loads are above four of five old ones): **probably real, not proven at five loads**. At the opening view, which is what a visitor gets, it is 119 ms, level with the old site. The first hover's frame gap is one dropped frame on both builds; one new load at the opening view had a 50 ms task. Later hovers are level. This script moves the pointer onto one album; the twinkle script wanders over many, which is why its first-hover gap is longer (section 3). Cheapest remedy if the owner wants the whole-map case looked at: profile the first hover frame there; nothing can be named before that.

**Cover sheets are uploaded inside a wheel zoom, on the old site too.** Found by the GPU run of the gesture tests below: four 3072 px texture uploads of 15 to 24 ms each landed inside one held wheel zoom, each with a 32 to 39 ms gap. The site has four cover sheets. The wheel zoom row of `perf.mjs` is a two-frame gap in every GPU column of both builds (old 28 to 34 ms, new 27 to 34 ms), and these uploads are the likely reason, but that link is an inference: `perf.mjs` does not record uploads, and the header probe of part 3, which zooms 800 ms after a drag, has no such gap. Whatever its share, it is not a regression and not the theme's. Cheapest remedy: hold a cover sheet's upload while a wheel zoom or drag is going on, as the gas images already are, or upload it in strips as the sharper gas image is.

**The gas gesture tests' frame-gap branch on the real GPU** (`E2E_GPU=1`, once, on battery, load 6.8 to 7.6; `after/perf/e2e-gpu/gas-gestures.txt`): 2 passed, **1 failed**.

- Passed: "a drag that begins while a late image waits behind the GPU fence gets no upload, and has the frame gaps of a drag with nothing waiting"; "a drag that begins between two strips of a sharper image, or inside one, gets no further strip". Both compared their frame gaps with a control drag on the GPU, which they cannot do on the software renderer.
- Failed: "a drag or a wheel zoom held longer than the longest wait gets no upload until it ends". Its drag half passed. In its wheel half the gas rule held (no gas upload inside the gesture: that assertion passed), and the next assertion, that no texture upload of any kind began inside the gesture, failed on the four cover sheet uploads described above. So the product rule the test is about is intact on the GPU; the test's wider net caught a cost that exists on the old site as well. It passes on the software renderer of the normal suite. One run, not repeated. The test was not changed: either the cover sheets get the remedy above, or the test's blanket check is narrowed to gas textures, and that is the owner's call.

**The names contrast test on the real GPU** (`E2E_GPU=1 npx playwright test e2e/names.spec.ts -g "4.5:1"`, once; `after/perf/e2e-gpu/names-contrast.txt`): 6 passed, 1 skipped (the phone test, in the desktop project). Worst contrast against the painted halo 4.63 (The Bittersweet Reach, Overview, 1440 x 900), the limit is 4.5; worst over the 99th percentile under the letters 6.22.

**Lines and the open album's covers.** The ledger owed the worst case of `separateAtWalls`: the box separation failing on every frame while a wall moves (the album panel sliding in, the slider's cover rising), up to 300 rounds each time. `layout-cost.mjs --crowded` plays that (200 clusters that open clean at 828 x 400, the bottom wall rising 4 px a frame to 209 and back, 19,200 moving frames) but printed only counts, so one timing per frame was added to that part of the script (a script-only commit; the layout keeps state, so a frame cannot be replayed and the fastest of several cannot be taken). In Node on this laptop, on battery at load 9.8 (`after/perf/layout-cost-crowded.txt`):

| Moving walls | Frames | Mean per frame | Worst frame |
|---|---|---|---|
| Every moving frame | 19,200 | 0.010 ms | 1.543 ms |
| Frames where the separation left an overlap (the worst case: it is tried again on the next frame) | 406 | 0.149 ms | 0.403 ms |

No frame ran a fresh solve (0 of 19,200) and no cover left the walls. Crowded bounds that do not move cost 0.001 ms a frame (worst 0.006 ms) and the one settle frame at rest 0.05 to 0.32 ms (worst 1.1 ms). **Verdict: not a cost.** The failing separation is 0.4 ms at worst, 2 percent of a frame; a phone's CPU a few times slower would still be near 1 to 2 ms. The single 1.5 ms frame is one timing on a loaded machine, among frames whose separation succeeded. What this does not measure is the DOM side of the open album (the lines and covers written per frame), which has no script: section 6.

## 6. Not measured

- A real phone, Safari, Firefox. Everything here is headless Chrome on one M1 Pro; the phone columns are a phone-sized viewport on a laptop GPU.
- A quiet machine, and mains power for the second half of the session.
- GPU time. Frame gaps are measured on the main thread; an effect that costs GPU time but still fits in the frame is invisible here (it would show as heat or battery, or as dropped frames on a weaker GPU).
- Hover and pan with an album open against `3d8ee1f4` (the lines' DOM writes per frame; owed from part 2 Task 4). No script exists for it.
- The names pair on a phone and at dpr 2; the names' wait for the gas on a slow network.
- Twinkle on the phone and through `perf.mjs --twinkle` (the runbook's four-column pair): only the first-hover sessions and their still runs were made.
- The three plain full runs against the committed baseline (the runbook's step 1) and the run with every switch off (step 5). The old against new runs in turn were made instead, and their new side was also compared with the committed baseline.
- The software renderer in the pairs and probes (GPU only).
- The gas gesture tests and the contrast test on the GPU more than once.

## 7. How to reproduce

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch   # arm64
set -o pipefail; pmset -g batt; uptime
ROOT=/Users/saslan.19/Desktop/Tengs/reCreck/recmyrecord
NEW=$ROOT/.claude/worktrees/wt-perf/frontcreck; OLD=$ROOT/.claude/worktrees/wt-perf-old/frontcreck
B=$NEW/../docs/design/trifid-theme/reviews; A=$B/after/perf; H=$ROOT/.claude/worktrees/_tools/heavy.sh
git -C $ROOT worktree add --detach $ROOT/.claude/worktrees/wt-perf-old 6f10463e
cp $NEW/scripts/perf/perf.mjs $NEW/scripts/perf/lib.mjs $NEW/scripts/perf/compare.mjs $OLD/scripts/perf/
(cd $OLD && npm ci && npm run build); (cd $NEW && npm run build)

# Section 1: old and new in turn (each line through the lock: $H <label> -- <command>)
cd $OLD && npm run perf -- --no-gas --open whole    # old run; move scripts/perf/out/perf-*.json to $A/ab/old/perf-runN.json
cd $NEW && npm run perf -- --open whole             # new run; to $A/ab/new/perf-runN.json. Order: old new, new old, old new; 20 s between
cd $NEW && node scripts/perf/compare.mjs --allow-flags $A/ab/old $A/ab/new | tee $A/ab/compare.txt

# Section 3: 12 rounds of three sessions, order rotating; each saved file moved to $A/twinkle/twinkle-cost-rNN-<arm>.json
node scripts/perf/twinkle-cost.mjs --mode gpu --viewport desktop --no-warmup --first on    # and --first off, --first held
node scripts/perf/twinkle-cost.mjs --first-hover-verdict $A/twinkle | tee $A/twinkle/verdict.txt

# Section 4
node $A/effect-probe.mjs names $A/probe/names-desktop.json --n 8
npm run perf -- --mode gpu --viewport desktop --names on     # and off; three pairs, on off, off on, on off
node scripts/perf/compare.mjs --allow-flags --only="gpu desktop" $A/names-gpu-desktop/off $A/names-gpu-desktop/on

# Section 5
node $B/baseline/hover-measure.mjs $A/hover-new.json http://127.0.0.1:3500 --start --mode gpu
node $B/baseline/hover-measure.mjs $A/hover-new-open-app.json http://127.0.0.1:3500 --start --mode gpu --open app
(cd $OLD && node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs $A/hover-old.json http://127.0.0.1:3500 --start --mode gpu)
E2E_GPU=1 npx playwright test e2e/gas.spec.ts -g "has the frame gaps of a drag|held longer than the longest wait|between two strips" --project=desktop --workers=1
E2E_GPU=1 npx playwright test e2e/names.spec.ts -g "4.5:1" --project=desktop --workers=1
node scripts/perf/layout-cost.mjs --crowded
```

The session's own job scripts (the loops, the load and power stamps around every run) are in `.claude/worktrees/_notes/scratch/p3-task9-runs/`. They delete nothing: a run's JSON is found by being newer than a marker file.
