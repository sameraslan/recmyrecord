# Trifid theme against the old site: speed, part 3 (glass, header, Home, strip, pages)

Measured 2026-10-06 in the same session as part 2 (`app-perf-part2.md`). **Read the conditions at the top of part 2 first**: builds (`f8f8a61e`, app code of `daef1189`, against `6f10463e`), a busy shared M1 Pro, everything through the lock under `nice`, on mains until about 19:30 and **on battery after**, numbers that are approximations, `budgets.json` unchanged. Part 2 has the old against new table, the three gate verdicts in one table, the twinkle and the names.

Raw output: `after/perf/probe/` (the probes and their script, `after/perf/effect-probe.mjs`), `after/perf/glass-gpu-desktop/`, `glass-gpu-desktop2x/`, `glass-gpu-desktop2x-b/`, `glass-gpu-phone/`.

## 1. Gate 1: the header's backdrop blur over a moving map

**What was compared.** `/map` at its opening view with the header as shipped (`blur(22px) saturate(1.2) brightness(0.58)` over `rgba(7, 6, 10, 0.58)`) against the one-line solid fallback noted in `frontcreck/src/styles/shell.css` ("Speed fallback 2": `.top { backdrop-filter: none; background: var(--color-float-solid); }`), injected as a stylesheet before the page's scripts run. Only the header differs: every other glass surface stays as shipped in both arms. Nothing in the app was changed and the fallback was not applied. Each arm read back in the page what it had (`none` and `rgb(10, 9, 14)` for the solid arm).

**How.** `effect-probe.mjs header`: 6 sessions an arm, alternating, a new browser for each, real GPU. In each: a 2 s drag and a 2 s wheel zoom (the same gestures as `perf.mjs`), then a fling (a 130 ms flick released while moving, and the 1.5 s after it; the map reported itself animating after the release in all 24 sessions and drew 90 or 91 frames). Every gap between animation frames is kept, so the table has the longest gap, the 95th percentile and the count over 20 ms. On mains. Load before a session 5.3 to 8.4 at 1440 x 900 and 4.0 to 7.8 at device pixel ratio 2.

1440 x 900, device pixel ratio 1:

| Measure (ms unless a count) | Glass header, median (best to worst) | Solid header, median (best to worst) |
|---|---|---|
| drag: longest gap | 18.5 (17.8 to 18.8) | 18.3 (17.3 to 19.7) |
| drag: p95 gap | 18 (16.9 to 18.3) | 17.2 (16.9 to 17.9) |
| drag: gaps over 20 ms | 0 (0 to 0) | 0 (0 to 0) |
| drag: frames | 120 (119 to 120) | 120 (120 to 121) |
| zoom: longest gap | 19.7 (18.2 to 20.7) | 18.7 (17.6 to 20.1) |
| zoom: p95 gap | 18.3 (17.5 to 18.4) | 17.6 (17.1 to 18.8) |
| zoom: gaps over 20 ms | 0 (0 to 1) | 0 (0 to 1) |
| zoom: frames | 121 (120 to 121) | 120 (120 to 121) |
| fling: longest gap | 18.5 (17.3 to 19.2) | 17.5 (17.3 to 17.8) |
| fling: p95 gap | 17.2 (16.9 to 18.3) | 17.1 (16.9 to 17.3) |
| fling: gaps over 20 ms | 0 (0 to 0) | 0 (0 to 0) |
| fling: map frames drawn | 91 (91 to 91) | 91 (91 to 91) |

1440 x 900, device pixel ratio 2 (four times the pixels under the blur):

| Measure (ms unless a count) | Glass header, median (best to worst) | Solid header, median (best to worst) |
|---|---|---|
| drag: longest gap | 18.5 (17.2 to 19.4) | 18.3 (17.9 to 19) |
| drag: p95 gap | 17.6 (17 to 18.5) | 17.4 (17 to 18.1) |
| drag: gaps over 20 ms | 0 (0 to 0) | 0 (0 to 0) |
| drag: frames | 120.5 (120 to 121) | 120 (120 to 121) |
| zoom: longest gap | 19.1 (18.3 to 20.7) | 19 (18.1 to 19.3) |
| zoom: p95 gap | 18.1 (17.3 to 19.1) | 17.9 (17.4 to 18.5) |
| zoom: gaps over 20 ms | 0 (0 to 2) | 0 (0 to 0) |
| zoom: frames | 120 (120 to 121) | 120 (120 to 120) |
| fling: longest gap | 18.6 (17.6 to 18.9) | 18.4 (17.6 to 19.5) |
| fling: p95 gap | 17.5 (16.9 to 18.4) | 17.5 (17 to 18) |
| fling: gaps over 20 ms | 0 (0 to 0) | 0 (0 to 0) |
| fling: map frames drawn | 91 (91 to 91) | 91 (90 to 91) |

**Verdict: PASS on frame gaps.** In 24 sessions (48 s of dragging, 48 s of wheel zoom, 36 s of fling) neither arm dropped a frame: the longest gap anywhere is 20.7 ms and a dropped frame would be 33 ms. The glass header's longest gaps are 0.1 to 1.0 ms above the solid header's in the medians, and the arms' ranges overlap in every row. That difference is no larger than the spread (0.5 to 2.5 ms within an arm) and far below a frame, so the blur costs no frames that this can see, at either pixel ratio.

**What this cannot show.** The blur is done by the compositor on the GPU, and these gaps are measured on the main thread. A blur that takes GPU time but still fits in the frame is invisible here; it would show as heat or battery use, or as dropped frames on a weaker GPU than an M1 Pro. So the verdict is "no dropped or late frame on this machine", not "free". If the owner sees a stutter by hand, or on another machine, the fallback is the one line above, with the test pin named beside it in `shell.css`.

One thing that differs from `perf.mjs`, and is not explained: here the wheel zoom's longest gap is 18 to 21 ms in both arms, while `perf.mjs` reports 28 to 46 ms for the same wheel events at the same view (its opening view rows, section 2). The two scripts differ in small ways (this probe waits 800 ms after the drag before it zooms, `perf.mjs` 500 ms; this probe leaves out the first gap of a gesture). Which of these, or the cover sheet uploads of part 2's section 5, makes the difference was not tracked down. For this gate it means both arms were free of that hitch, so the comparison of the two headers is clean; it also means the two-frame gap in `perf.mjs`'s zoom rows may partly be the script's own timing and deserves a look before anyone spends effort on it.

## 2. Glass everywhere: panels, zoom buttons, header

`perf.mjs --glass on|off` forces every glass surface at once (header, album panel, side panel, zoom buttons, names switch), three interleaved pairs per column. All on battery. This is the measure for the album panel and for the four blurred zoom buttons (the ledger's M7); none was measured alone.

**gpu desktop** (load before a run 3.9 to 6.9):

| Measure | Glass off, median (min to max) | Glass on, median (min to max) | Delta | Flag |
|---|---|---|---|---|
| searchUsableMs | 75 (71 to 97) | 76 (74 to 84) | +1 (+1 %) | SLOWER |
| mapFirstFrameMs | 582 (550 to 653) | 558 (556 to 602) | -24 (-4 %) |  |
| selectToAlbumMs | 27 (23 to 33) | 25 (23 to 25) | -2 (-7 %) |  |
| transitionGapMs | 22 (21 to 31) | 22 (21 to 25) | 0 |  |
| morphGapMs | 19 (18 to 21) | 20 (18 to 21) | +1 (+5 %) | SLOWER |
| dragGapMs | 19 (18 to 22) | 18 (18 to 19) | -1 (-5 %) |  |
| zoomGapMs | 34 (30 to 41) | 31 (29 to 42) | -3 (-9 %) |  |
| openingDragGapMs | 19 (19 to 20) | 18 (18 to 18) | -1 (-5 %) |  |
| openingZoomGapMs | 38 (37 to 40) | 35 (32 to 36) | -3 (-8 %) |  |
| deepDragGapMs | 19 (19 to 20) | 18 (18 to 19) | -1 (-5 %) |  |
| deepMorphGapMs | 18 (18 to 18) | 17 (17 to 18) | -1 (-6 %) |  |
| gasShownMs | 641 (591 to 711) | 599 (598 to 661) | -42 (-7 %) |  |

Two flags, both +1 ms and inside the spread (search usable; morph 20 against 19 with both arms at 18 to 21). Every gap row is level or lower with glass. **Verdict: no cost seen at device pixel ratio 1.**

**gpu desktop2x**, first set (load 4.8 to 7.9):

| Measure | Glass off, median (min to max) | Glass on, median (min to max) | Delta | Flag |
|---|---|---|---|---|
| searchUsableMs | 99 (88 to 115) | 106 (103 to 114) | +7 (+7 %) | SLOWER |
| mapFirstFrameMs | 700 (618 to 719) | 678 (674 to 688) | -22 (-3 %) |  |
| selectToAlbumMs | 36 (26 to 40) | 35 (31 to 39) | -1 (-3 %) |  |
| transitionGapMs | 23 (18 to 44) | 34 (29 to 49) | +11 (+48 %) | SLOWER |
| morphGapMs | 22 (17 to 37) | 17 (17 to 21) | -5 (-23 %) |  |
| dragGapMs | 18 (18 to 18) | 18 (17 to 18) | 0 |  |
| zoomGapMs | 36 (31 to 37) | 36 (32 to 36) | 0 |  |
| openingDragGapMs | 18 (18 to 18) | 18 (17 to 18) | 0 |  |
| openingZoomGapMs | 36 (34 to 39) | 38 (38 to 40) | +2 (+6 %) | SLOWER |
| deepDragGapMs | 20 (18 to 23) | 18 (18 to 21) | -2 (-10 %) |  |
| deepMorphGapMs | 17 (17 to 18) | 17 (17 to 18) | 0 |  |
| gasShownMs | 754 (671 to 767) | 736 (720 to 743) | -18 (-2 %) |  |

**gpu desktop2x**, second set, made because the first left the album transition open (load 7.3 to 18.3, the busiest stretch of the session):

| Measure | Glass off, median (min to max) | Glass on, median (min to max) | Delta | Flag |
|---|---|---|---|---|
| searchUsableMs | 76 (74 to 101) | 85 (77 to 169) | +9 (+12 %) | SLOWER |
| mapFirstFrameMs | 567 (564 to 606) | 627 (569 to 757) | +60 (+11 %) | WORSE |
| selectToAlbumMs | 27 (23 to 27) | 24 (22 to 28) | -3 (-11 %) |  |
| transitionGapMs | 33 (27 to 42) | 46 (28 to 126) | +13 (+39 %) | WORSE |
| morphGapMs | 19 (18 to 25) | 20 (18 to 23) | +1 (+5 %) | SLOWER |
| dragGapMs | 18 (17 to 22) | 18 (17 to 18) | 0 |  |
| zoomGapMs | 34 (33 to 35) | 32 (30 to 33) | -2 (-6 %) |  |
| openingDragGapMs | 18 (17 to 18) | 18 (18 to 18) | 0 |  |
| openingZoomGapMs | 34 (32 to 36) | 31 (30 to 33) | -3 (-9 %) |  |
| deepDragGapMs | 18 (17 to 18) | 18 (17 to 18) | 0 |  |
| deepMorphGapMs | 17 (17 to 18) | 17 (17 to 18) | 0 |  |
| gasShownMs | 608 (605 to 656) | 699 (612 to 805) | +91 (+15 %) | WORSE |

- **Album transition at dpr 2: not resolved, possibly real under load.** Longest gap while the album panel slides in, per run: glass on 34, 29, 49 and then 126, 46, 28; glass off 23, 44, 18 and then 42, 27, 33. Medians 34 against 23 and 46 against 33: SLOWER in the first set (inside the spread), WORSE in the second (the median is above every off run, but the on runs span 28 to 126). Over the six pairs glass was the higher one in four. Against that: in the old against new runs, made on mains at load 4.5 to 5.4 with glass on as shipped, the same row was 18 (17 to 21), level with the old site's 20. So on a calm machine the glass panel at dpr 2 costs nothing visible, and on a loaded one on battery its transition looks more fragile than the solid panel's, with one very bad frame (126 ms at load 18). Six noisy pairs do not prove it. This is the one place in this session where glass may cost frames. The row has no budget at dpr 2 (yardstick 50 ms: one glass run over it, one at 49). Cheapest remedies, if a quiet run or the owner's eye confirms it: first "Speed fallback 1" in `globals.css` (blur 22 px to 14 px, one value); if that is not enough, a solid album panel only (the same one line as the header's fallback, on `.album`), which keeps the header and the small surfaces glass.
- Second set, map first frame 627 against 567 and gas shown 699 against 608: WORSE by the rule. The on runs span 569 to 757 and 612 to 805; the first set had them the other way round (678 against 700, 736 against 754), and the names probe on a calm machine shows 550 ms. Load, not glass.
- Search usable +7 and +9 ms, opening zoom +2 ms (first set; the second has it 3 ms lower), morph +1 ms: inside the spread.
- Drag, wheel zoom, deep zoom, opening drag: level or lower with glass in both sets.

**gpu phone** (load 4.4 to 8.9). A phone ships with solid panels, so here "off" is the site as shipped and "on" is the forced glass that the phone switch in `globals.css` would give:

| Measure | Glass off, median (min to max) | Glass on, median (min to max) | Delta | Flag |
|---|---|---|---|---|
| searchUsableMs | 104 (73 to 118) | 110 (91 to 140) | +6 (+6 %) | SLOWER |
| mapFirstFrameMs | 658 (589 to 720) | 683 (614 to 718) | +25 (+4 %) | SLOWER |
| selectToAlbumMs | 24 (24 to 34) | 32 (24 to 36) | +8 (+33 %) | SLOWER |
| transitionGapMs | 18 (17 to 18) | 17 (17 to 18) | -1 (-6 %) |  |
| morphGapMs | 22 (18 to 32) | 20 (18 to 21) | -2 (-9 %) |  |
| dragGapMs | 18 (18 to 19) | 18 (17 to 27) | 0 |  |
| zoomGapMs | 37 (36 to 53) | 40 (37 to 41) | +3 (+8 %) | SLOWER |
| openingDragGapMs | 18 (17 to 19) | 18 (18 to 18) | 0 |  |
| openingZoomGapMs | 41 (30 to 43) | 40 (36 to 44) | -1 (-2 %) |  |
| deepDragGapMs | 18 (18 to 18) | 18 (17 to 18) | 0 |  |
| deepMorphGapMs | 18 (17 to 18) | 18 (17 to 18) | 0 |  |
| gasShownMs | 706 (696 to 805) | 751 (671 to 765) | +45 (+6 %) | SLOWER |

Six flags, all SLOWER and all inside the spread: search usable +6, map first frame +25 (both arms span 100 to 130 ms), select to album 32 against 24 (on 36, 32, 24; off 24, 34, 24), slider to list +1, wheel zoom 40 against 37 (off had a run at 53), gas shown +45 (off spans 696 to 805). No gap row is resolvably slower with glass. **This says nothing about a real phone**: it is a phone-sized viewport on a laptop GPU. It does not argue for or against deleting the phone switch; the owner's trial on his own phone decides that.

**One single run over budget, to be named:** `glass-gpu-phone/off/perf-run1` (the shipped phone state), wheel zoom gap 53 ms against the 50 ms budget, at load 8.8 on battery. The other two runs of that arm are 37 and 36. The baseline has the same single-run miss (gpu phone zoom 53). The zoom row is a two-frame gap in every run of both builds (part 2, section 5); this run had one frame more. It is in the arm without glass, so it is not the glass.

## 3. Home: glints under the blurred pad

Home at rest for 15 s, 6 sessions an arm, alternating; real GPU, on battery, load 3.9 to 8.1. `on-nopad` has the glints on and the blur of the dark pads behind the hero removed, to see whether a glint moving under a blurred pad costs anything.

| Measure | Glints on | Glints off | Glints on, pad blur removed |
|---|---|---|---|
| Longest frame gap (ms), median (best to worst) | 21 (18.2 to 23.2) | 19 (17.8 to 25.9) | 19.6 (18.5 to 20.8) |
| 95th percentile gap (ms) | 17.5 (17.4 to 17.5) | 17.4 (17.1 to 17.6) | 17.4 (17.2 to 17.6) |
| Gaps over 20 ms in 15 s | 1 (0 to 2) | 0 (0 to 3) | 0.5 (0 to 1) |
| Frames in 15 s | 900 (900 to 901) | 901 (901 to 901) | 901 (900 to 901) |
| Longest task (ms) | 0 | 0 | 0 |
| Glints made | 7.5 (7 to 9) | 0 | 7 (6 to 9) |
| Map canvas frames | 0 | 0 | 0 |

**Verdict: no cost seen.** No dropped frame in any of the 18 sessions (the longest gap anywhere is 25.9 ms, in an arm with no glints), no long task, and the canvas draws nothing while glints play. Glints on is 2 ms above glints off in the median longest gap, inside the spread (the off arm alone spans 8 ms). Removing the pad's blur changes nothing resolvable, which fits what the pad is: a still, pre-blurred shape, not a backdrop filter. The same limit as in section 1 applies (main-thread gaps, not GPU time).

## 4. The phone strip's copy of the gas image

The strip makes one small copy (longer side 512 px) of a stop's gas image. `effect-probe.mjs strip` re-enacts the two ways `MapPreviewStrip.tsx` does it, in a phone-sized page with nothing else going on, 6 sessions each; on battery, load 5.2 to 7.8. It is a re-enactment of the same calls with the same image, not the strip's own code path.

| Measure | Off the main thread (`createImageBitmap` with resize) | Fallback (decode, then `drawImage` on a canvas) |
|---|---|---|
| Time to the copy (ms), median (best to worst) | 36 (29.6 to 46.8) | 67.1 (57.1 to 75.5) |
| Longest frame gap while it ran (ms) | 17 (16.7 to 20.5) | 45.3 (37.6 to 50.6) |
| Longest task (ms) | 0 | 0 |
| Size of the copy | 451 x 512, 923,648 bytes | the same |

- **Time: fine where the first way works.** 36 ms in the background and no frame lost (longest gap 17 ms). Headless Chrome takes this way.
- **The fallback loses two frames, once per stop.** 45 ms longest gap in the median, every session over 37 ms: the scaled draw of the 2048 px image runs on the main thread. It only runs where `createImageBitmap` cannot resize. Whether Safari takes the first way was **not measured**. If it does not, cheapest remedy: ship a ready-made 512 px strip image per stop from the theme build (three small files), so no browser scales anything.
- **Memory: computed, not measured.** The copy is 0.9 MB (451 x 512 x 4). Decoding the 1803 x 2048 source takes about 14.8 MB for a moment in either way, off the main thread in the first. The ledger's question about two decodes of the gas image on a phone (the map's and the strip's at once, about 30 MB for a moment) was not measured: headless Chrome gives no honest number for decoded image memory, and a real phone is where it matters.

## 5. Pages

- Sizes (from the six old against new runs, identical in each): first-load JS of Home 190.8 KB against 190.5 KB (+0.3 KB, budget 200); server HTML of Home 28.2 against 28.3 KB, of an album page 33.9 against 34.0 KB; no three.js in the first load.
- Home's startup rows (search usable, startup long task, map first frame, nebula visible) are in part 2, section 1: on the GPU, search usable is level (73 against 74, 69 against 70, 71 against 68 ms), no startup long task in any run, the map's first frame +19 ms on gpu desktop.
- Home at rest: section 3 above.
- About and 404 were not timed. They are static text over the map as a backdrop with a still, blurred pad; the probe's strip arm loads `/about` 12 times with no long task, which is all that can be said.

## 6. Timings the ledger owed to this task

| Owed | State |
|---|---|
| Header blur over the moving map (merge gate) | Section 1: PASS on frame gaps |
| Glass panels on mains (part 3 Task 2) | Section 2, but **on battery**: no cost at dpr 1; the album transition at dpr 2 not resolved |
| Four blur passes of the zoom stack (M7) | Inside the glass pairs of section 2, not alone |
| Home glints under the blurred pad | Section 3: no cost seen |
| Phone strip: downscale cost and memory | Section 4: time measured, memory computed only |
| `separateAtWalls` worst case | Part 2, section 5 |
| Names on against off at startup (merge gate), pan, zoom, morph with names | Part 2, section 4 |
| First hover with glints (merge gate) | Part 2, section 3 |
| Gesture tests' frame-gap branch and names contrast on the GPU | Part 2, section 5: one gesture test fails on the GPU |
| Hover and pan with an album open against `3d8ee1f4` (lines) | Not measured: no script |
| Phone glass pair for the phone switch | Section 2: no slowdown on a laptop GPU; a real phone not measured |

## 7. Not measured

- A real phone, Safari, Firefox; any GPU but the M1 Pro's.
- A quiet machine; mains power for sections 2 to 4.
- GPU time, heat and battery cost of the blur (section 1).
- The header's blur on a phone (phones ship solid), and at a wider or 4K window.
- Each glass surface alone, apart from the header.
- The software renderer for every pair and probe (GPU only), so the runbook's `software desktop` and `software phone` glass pairs.
- The strip's own code path in a real album page, decoded image memory, and which way Safari takes.
- About and 404 timings.

## 8. How to reproduce

Setup (PATH, builds, `$NEW`, `$A`, the lock) as in part 2, section 7. From `$NEW` (`frontcreck/` of the worktree), each through the lock:

```bash
P=$A/effect-probe.mjs
node $P header $A/probe/header-desktop.json --n 6 --viewport desktop
node $P header $A/probe/header-desktop2x.json --n 6 --viewport desktop2x
node $P home $A/probe/home-desktop.json --n 6
node $P strip $A/probe/strip-phone.json --n 6

# Glass pairs: three interleaved pairs per column (on off, off on, on off), 20 s between runs;
# each run's scripts/perf/out/perf-*.json moved to $A/glass-gpu-<viewport>/<on|off>/perf-runN.json
npm run perf -- --mode gpu --viewport desktop --glass on      # and --glass off; also --viewport desktop2x, phone
node scripts/perf/compare.mjs --allow-flags --only="gpu desktop" $A/glass-gpu-desktop/off $A/glass-gpu-desktop/on
node scripts/perf/compare.mjs --allow-flags --only="gpu desktop2x" $A/glass-gpu-desktop2x/off $A/glass-gpu-desktop2x/on
node scripts/perf/compare.mjs --allow-flags --only="gpu desktop2x" $A/glass-gpu-desktop2x-b/off $A/glass-gpu-desktop2x-b/on
node scripts/perf/compare.mjs --allow-flags --only="gpu phone" $A/glass-gpu-phone/off $A/glass-gpu-phone/on
```

`effect-probe.mjs` says at its top what each arm injects. It changes nothing in the app.
