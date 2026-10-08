# Review: Part 2 Task 7 follow-up, names' halo and rest placement (2026-10-06)

Reviewed: `543f525b` (lumWide, second halo range), `cbe02e13` (nudged halo, rest placement), picture commits `6cfead1c`, `6c71eb05`. Worktree `trifid-main`. Read-only review: code, tests, theme diff, the three captures against `final-whole.jpg`. I ran the unit tests of the touched files only (`namesPlacer`, `namesLayout`, `lib/data`, `scripts/theme`: 10 files, 157 passed, Node 22 arm64). No build, no browser: everything about motion below is from the code, not seen.

Paths are under `frontcreck/` unless said.

## Verdicts

- **Spec: pass with concerns.** The hard rules hold where I could check them from code: the driver never calls `requestRender` or `invalidate`; the rest placement is a DOM write from a microtask (0 canvas frames); no code was added to a `pointermove` handler; names are never hidden during motion; theme file is additions only; site data untouched; first-load 191.21 KB, 11 scripts per the implementer's log (`_notes/logs/p2halo2-fl.log`, not re-measured). Concerns: a hover-redraw frame now does eight more field reads than it did (M2), and three kinds of motion carry no motion flag and so re-place names mid-gesture (I1).
- **Quality: approve after I1 and I2; the rest are small.** The halo geometry is sound and tested against the bake's real function. The rest placement is path independent by construction. Its browser behaviour has no committed test.
- **Look: 1440 x 900 matches the approved picture. The short windows are lighter and legible, with two tight pairs.** The slide is the open question; see the recommendation.

## Findings

### Important

**I1. Camera steps that carry no motion flag are each treated as "rest": names hop mid-gesture.** `state/namesPlacer.ts:234` clears `sticky` on every placement where `inMotion` is false. Three gestures move the camera with every flag false:
- keyboard pan: `canvas/CameraTween.tsx:102` `panBy` calls `start(..., 0)`, which applies at once and sets `animating` false (`:54-57`). A held arrow key is a run of such steps.
- wheel zoom under reduced motion: `canvas/CameraRig.tsx:261-268` writes the camera directly and never sets `rigMoving`.
- window resize (no flag at all).

Before `cbe02e13` a name kept its spot through all three (sticky was never cleared). Now each step is solved afresh, so a name crossing a collision threshold jumps 22 to 87 px, without the ease (`settling` is false because `unsettled` is false), and can jump back on the next step. That is the flicker the sticky map exists to prevent, and it lands on keyboard and reduced-motion visitors. No test covers it; the "motion path unchanged" test only uses flagged motion. Not confirmed in a browser.
Fix: give these steps a short motion window. In `panBy` and the reduced-motion wheel branch, set a store flag that `inMotion` reads (a new `stepping`, or reuse `rigMoving`) and clear it from one timer about 150 ms after the last step (armed in the key or wheel handler; neither is the pointer-move path). The existing watcher then does the one rest placement. Check `MapApi.isAnimating()` users in e2e if `rigMoving` is reused. Resize can stay as it is (say so in the report) or use the same window. Add a placer test: several unflagged steps keep the nudged spot, the rest placement afterwards equals cold.

**I2. Nothing committed tests this in a browser.** `e2e/` is untouched by both commits; there is no `e2e/names.spec.ts`. The contrast figures, "fit equals direct", the eased frame and the slide distances come from `_notes/scratch/p2-halo/measure.mjs`. `RegionNamesDriver`'s wiring of `watchNamesRest` has no test, and rest after a drag, wheel or pinch was never run in a browser. Add `e2e/names.spec.ts` (desktop, `__rmrGasLite = 'off'`, `waitForGasSharpSettled`), asserting:
1. At 1440 x 790, 1366 x 768, 1440 x 900, 1600 x 1000, after a fit press and after a direct opening (`__rmrOpen = 'whole'`): the same set of shown `.rn` keys, centres within 1 px, equal `--h`; no `.rn` keeps a transform different from a cold placement.
2. Pixel contrast: screenshot with `.rn-layer` hidden; for each shown name take its `b` box plus 8 px, compute WCAG luminance per pixel, and assert `nameContrast(p99, inkLum, alpha, --h) >= 4.5` for every name. Record the brightest-pixel figure in the test output but do not gate on it unless stars can be pinned: star brightness is random per load.
3. Zero frames: after a drag released without a fling, the frame counter does not advance while a nudged name's transform does change (the microtask path), and 0 frames at rest afterwards.
4. Hover: a MutationObserver on `.rn-layer` (subtree, attributes) records nothing across 20 mouse moves over albums.
5. Reduced motion: no `.rn` has a running transition or animation after a fit press.

**I3. The ease is cut short by a jump when the map moves again within 0.2 s, and the slide itself is doubtful (owner decision).** `namesPlacer.ts:53-57` removes `ease` in the same write as the new transform on the first motion placement, so the transition is cancelled and the name snaps from mid-slide to its tracked position: correct tracking, visible jump of up to tens of px. It happens on drag-release-then-grab, and where `CameraBounds` (mounted after the driver, `canvas/Scene.tsx:179-183`) starts a nudge in the frame the driver has just rested in: rest, slide, snap, nudge, rest again. See the recommendation: a fade at the new spot has no such failure.

### Minor

**M1. `pending()` can stick at true, and then every store change at rest, hover included, queues a microtask and a `place()` call.** `namesPlacer.ts:173-178` returns before `unsettled` is updated when there is no layer, no world or no size. Press the names toggle during a tween or a fling: `unsettled` stays true, and until the names are switched on again each hover in or out runs `check` and `place` (which returns false). Fix: set `unsettled = false` on both early returns (`:174` and `:178`); the next real placement has a different layer or size, so it lays out in full anyway. Add a watcher test with the real placer: layer removed mid-motion, motion ends, hover changes, `place` called at most once.

**M2. `inMotion(store)` is read before the basis compare on every drawn frame, hover redraws included** (`namesPlacer.ts:181`, used at `:188`). At rest all eight terms are evaluated. Fix, same behaviour: do the 18 compares first, then `if (same && (!unsettled || inMotion(store))) return true;` and compute `moving` only after. A hover frame then costs one boolean more than before the commit.

**M3. `watchNamesRest` runs on every store change** (`namesPlacer.ts:331`). What actually changes the store: plain mouse movement does not (CursorTracker only records the cursor); a hover target change does, at most once per frame or once per 80 ms timer (`setHoveredIndex` skips equal values); during a drag or pinch `registerInteraction()` fires on every pointermove (`CameraRig.tsx:163`), so the subscriber runs per pointermove there: one call, `asked`, `pending()`, then `inMotion` short-circuiting at `dragging` (five reads). Each wheel event: three store writes. No allocation, no DOM. It is created once per effect, removed on cleanup, safe under Strict Mode (`on = false` stops a queued check), cannot loop (the placer writes nothing to the store), cannot run inside a frame (the microtask runs after the rAF callback returns, before paint), and lives in the lazy map chunk. A selector would not help: zustand's plain `subscribe` calls every listener regardless. If zero work on hover is wanted literally: let the placer call an `onOwed` callback when `unsettled` goes false to true, subscribe there, unsubscribe in `check` once placed (one Set add and delete per gesture). `MarkerDriver.tsx:270` and `CameraBounds.tsx:55` already do more per store change, so I rate this optional.

**M4. The rest placement comes late after a wheel zoom or a fling.** Wheel easing settles at a zoom difference under 1e-4 with a 0.09 s time constant (about 0.6 s after the last wheel event); a fling runs until 1e-5 world units per frame (about a second after it looks still). The names then move on a map that has visibly stopped. With a slide that reads as a delayed shuffle. Either accept, or treat `rigMoving` as ended for names once the per-frame camera change is under about 0.25 px.

**M5. `ease` stays on the element at rest** until its next placement (`:54`). Harmless today (every later write removes it in the same call), but any future write path that skips `show` would animate. If the slide is kept, remove it on `transitionend` or keep as is with a test that a non-motion placement (resize, picked album) never leaves a name with both a new transform and `ease`.

**M6. Two rules for the same geometry.** Spot 0 uses the scale thresholds (`namesLayout.ts:238-239`), which rest on the assumed 0.47/0.48 em letter width; nudged spots use `nudgedHalo`, which uses the measured width. `nudgedHalo` with a zero nudge would be one rule checked against real widths, and would also close the report's Minor 1 (`600 x min(1, zoomK)` unsound for names drawn above full size). It moves pinned thresholds (`at(600, 1.2)`), so it needs its own change.

**M7. `nudgedHalo` repeats `0.47`, `30`, `0.525`, `28` from `scripts/theme/bake-core.js:175`** (`namesLayout.ts:218-219`). The 5,460-check test does use the bake's real `labelBox` (imported from `bake-core.js` via `globalThis.RMR_THEME`, and it pins the two scales), so drift fails the test. Acceptable. The test draws names with a synthetic 0.70 em face; at run time the rule uses the measured width, so soundness does not depend on that.

**M8. Path independence is proved on a two-name fixture** (four routes, four flags). Add one case over the committed theme's 17 Balanced names at the four window sizes' cameras: random flagged routes, then rest equals cold.

**M9. Contrast margin.** At p99 the worst name is 6.50:1 (44% above 4.5). At the single brightest pixel it is 4.93:1 (under 10% above), and that pixel is a star whose brightness is random per load, so another load can land under 4.5 at one pixel. Both figures are the model fed with screen pixels, not ink against the painted halo. I accept p99 as the measure; it should be the committed assertion (I2).

**M10. Theme data.** Verified: removing the 30 `,"lumWide":n` insertions from the new `theme.json` gives the old file byte for byte (54,229 to 54,707 B); all 30 values are numbers in `[lum, 1]`. The loader accepts a label without it (tested). The validator not checking it is acceptable: `haloOf` takes anything but a finite number as missing and never believes a value under `lum`, and `theme.data.test.ts` pins the committed file. Report slip: 15 labels have `lumWide` above `lum`, not 13.

**M11. Tests loosened: none.** The one removed assertion (nudged name full at 478) was this task's own from round 1 and is replaced by a stricter test. No existing e2e or perf file changed.

## Look

- **1440 x 900:** every name sits where the approved picture has it; halos read as light as the approved. Sombre Void and The Bittersweet Reach still share a baseline with a small gap and read close to one line (known F3).
- **1366 x 768:** lighter, legible. "SOMBRE VOID THE BITTERSWEET REACH" reads as one line more strongly here (gap about 15 px). Epic Expanse under Aggressive Rift and Playful Way over Eclectic Cloud are tight but separate.
- **1440 x 790 (right half):** lighter than before. Aggressive Rift over Epic Expanse now reads as a two-line block at the left edge of the cloud, and Hypnotic Orbit sits about 20 px above The Quiet Deep. The Quiet Deep is pushed left, partly off its bright gas. No collision. The four fainter names (Epic Expanse, Eclectic Cloud, The Bittersweet Reach, Hypnotic Orbit) are the weakest for legibility on bright gas, as in the approved picture.
- The short-window displacement is a layout question (margins and sizes when the map is under about 500 px per world unit), rightly left out of this task.

## Slide or cross-fade: recommendation for the owner

From the code, I expect the slide to read as a shuffle more than as settling: 7 to 9 of 17 names move at once, in different directions (up, down, sideways, diagonal), by 22 to 87 px, on a map that is already nearly still (the tween's last frames, or later still after a wheel or fling, M4). Settling would be everything easing the same way with the map; this is lettering rearranging itself.

Recommend a **fade in at the new spot** instead: the name leaves its old spot at once and fades in at the new one over about 0.25 s (one CSS keyframe animation on opacity, started by the same class; no transform transition). It suits "plain lettering, just a vibe", hides the simultaneous halo change, costs the compositor the same, and removes I3 entirely: opacity can keep animating while the name tracks the map exactly, so a new gesture causes no snap. A true cross-fade (old spot fading out while the new fades in) needs a second element per name and I would not build it unless the plain fade looks abrupt. The owner should compare slide and fade on the preview after a fit press, a drag release and a wheel stop, and with reduced motion on.

## Not verified

No build or browser run: first-load, frame counts, the slide's look and I1's hop are from code and the implementer's logs. Phone and `nowebgl` not considered beyond code reading (`fullHalo` is always true on a phone).
