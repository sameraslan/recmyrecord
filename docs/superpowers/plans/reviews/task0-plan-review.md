# Review: part 2 Task 0 plan ("/map opens at the approved Overview framing")

Plan reviewed: `docs/superpowers/plans/2026-10-05-trifid-theme-2-task0-overview-framing.md` (uncommitted), against `feat/trifid-theme` at `c238e72c`. Read with the build handoff, the prototype (`camera.js`, `config.js`, `data.js`, `app.js`), part 2's plan and the real code. No browser was used. All scales were recomputed in plain `node` from `public/data/positions.json`.

**Verdict: NEEDS FIXES.** The Overview formula is a faithful port and every recorded number checks out. The unit tests are sound. Five Important issues need fixing first: the "fail first" browser step cannot build, `perf.mjs` silently drops albumFlow's settle record, the budgeted perf rows are no longer measured on a clean page, the Home and About backdrop changes without being stated, and part 2 needs text edits that are listed below. None is Critical.

## What was verified

- **Formula (check 2).** The plan matches `Cam.fitOverview` term by term:
  - `max(whole, min((W - inset - 48) / (x99 - x1), (BAND_B - 0.5) / coverWorld)))`.
  - Centre x is `(x1 + x99) / 2`. Centre y is `medY + (free.top - free.bottom) / 2 / ppw`. On the app's /map, free.top is 0 and free.bottom is `bottomCover`, so this becomes `medY - bottomCover / 2 / ppw`.
  - Quantiles use the rule `sorted[floor(q * (n - 1))]` on Float32 data, as the prototype does.
  - For real data the prototype's `coverWorld` is `C.COVER_WORLD` (0.0068), the same as the app's.
  - The prototype passes inset 0. The app passes `insetCurrent`, which is 0 on /map.
  - One documented difference: "whole" is the app's `fitView` with 40 px sides and phone top 90, not the prototype's 16 px free-rectangle fit. It binds only on windows narrower than any tested.
- **Recomputed scales (check 2).** These match the plan's table to every printed digit:
  - Desktop 1440 x 836 Balanced: whole 596.653 (zoom 0.78507), Overview 1639.476 (zoom 2.15721), 11.148 px covers, camera (0.033325, 0).
  - Phone 390 x 784 with cover 165, Balanced: whole 267.847 (zoom 0.37581), Overview 402.802 (zoom 0.56516), camera (0.033325, -0.204815).
  - Sonic, Mood and 1600 x 936 also match.
  - Percentiles: x1 = -0.3912012577, x99 = 0.4578503668, medY = 0.
- **Idle nudge.** `nudgeVector` returns null at the Overview for all 11 window sizes and 3 stops in the plan, plus 3440 x 1376, 1280 x 656, 1280 x 736 and 2560 x 1016. The two cases under 0.25 coverage (844 x 330 Balanced 0.245, Mood 0.221) already sit inside the clamp.
- **Sharper gas image.** First-image texels per raw unit: Balanced 699.65, Sonic 777.8, Mood 729.1. At the desktop Overview the map shows 950.2 px per raw unit, so the sharper image is wanted. At the Whole map it shows 345.8, so it is not.
- **Album positions.** In Rainbows at the desktop Overview lands at (739, 763), (516, 813) and (819, 828) for Balanced, Sonic and Mood, as the plan says.
- **Paths, lines and symbols (check 1).** Exist as described: `bounds.ts` L1-3 and L90-106; `view.ts` L23-24 and L59; `types.ts` L19 and L50; `mapStore.ts` L12; `InitialFrame.tsx` L8-10, L47-50 and L104-113; `CameraTween.tsx` L12 and L107-113; `MapStage.tsx` L197-212, L224-252 and L229; `global.d.ts` L46; `helpers.ts` L112; `explore.spec.ts` L198; `lib.mjs` L65-66; `lib.test.mjs` L69-78; `perf.mjs` L35, L124, L184-263, L275-276, L355-363; `hover-measure.mjs` L27, L50, L55, L153, L159-160.
- **Types (check 1).** Every code block typechecks against the real types:
  - `MapInput.focus` is `Focus | null`.
  - `MapCamera` is `{ x, y, zoom }`.
  - The store has `data`, `sliderT` and `insetCurrent`.
  - `AppState.exploreCamera` exists.
  - `View` includes `'other'`.
  - `COPY.phone.mapLabel`, `COPY.nav.*` and `COPY.map.reset` exist.
  - `bounds.test.ts` already defines `flat`.
  - Vitest runs in `frontcreck/` (jsdom, `@` alias), and `contrast.test.ts` already reads `public/data` the same way.
  - The only `MapApi` and `MapInput` literals are in `CameraTween`, `MapStage` and `DEFAULT_INPUT`.
- **Lazy chunk.** `state/bounds.ts` and `state/view.ts` are imported only from `canvas/*`, which is the lazy chunk.
- **Hint.** The hint hides on cover fade (`coverFade > 0.25`), not on zoom relative to the fit, so it shows at the Overview.

## Findings

### 1. Important: Step 15's "see it fail first" run cannot build

**Where:** plan L1155.

**Problem:** `next build` type-checks the whole project. `tsconfig` includes `**/*.ts` and `next.config` has no `ignoreBuildErrors`, and Playwright's webServer runs `npm run build`. Step 15 stashes only `canvas/` and `MapStage.tsx`, but Step 5 has already added the required `MapInput.explore` and `MapApi.opening`. Without the stashed files, MapStage's input memo has no `explore` and CameraTween's api has no `opening`, so the build fails and the "expected FAIL" assertions never run.

**Fix:** stash the interface changes too:

```
git stash push frontcreck/src/components/map/canvas frontcreck/src/components/map/MapStage.tsx frontcreck/src/components/map/types.ts frontcreck/src/components/map/state/mapStore.ts
```

Keep `global.d.ts`, which `opening.spec.ts` needs for `window.__rmrOpen`. A simpler alternative: move Steps 11-12 before Step 4 and run the spec there. Say which one the plan uses.

### 2. Important: `perf.mjs` exploreFlow's new `settled` overwrites albumFlow's

**Where:** plan L1228 and L1274-1276; `perf.mjs` L319-320.

**Problem:** `measure()` builds the result as `...(await albumFlow()), ...(await exploreFlow())`. albumFlow returns `settled: [...]`, which includes the phone map-mode entrance. Today exploreFlow returns no `settled` key. The new `res = { settled: [], sharpSettled: [] }` replaces albumFlow's array, so the WARNING loop at L357-360 stops reporting an album or phone entrance that did not settle.

**Fix:** in exploreFlow, name the field `exploreSettled`. In the warning loop, check `r.settled?.includes(false) || r.exploreSettled?.includes(false)`. Add `exploreSettled` to the list of new JSON fields in Downstream (part 3 Task 9).

### 3. Important: the budgeted drag, zoom and idle rows are not measured on a clean page

**Where:** plan L1178, L1266-1281, L1316 and L1333.

**Problem:** the budget rows now run after a 2 s drag and a 2 s wheel at the Overview on the same page. The opening wheel zooms from 11 px covers to past 13 px, so cover sheets are fetched and uploaded before the budgeted zoom row. In the baseline that cost fell inside the budgeted zoom row. On a GPU desktop the Overview also loads the sharper gas image, and `gasSharpPlan` keeps it "through any zoom". So the budgeted drag and zoom at the Whole map draw with the 3299 x 3747 sharper texture bound, which no earlier run had.

The plan's sentence "The only change ... is the order of events" understates this. The `--open whole` log line ("the opening rows equal the budget rows' conditions") is also wrong: with `--open whole` it is the opening rows that repeat the baseline's conditions, not the budget rows.

**Fix:** measure the two kinds of row on separate fresh loads:

1. `page.goto('/map')` with no switch, then wait for the sharper image to settle, then measure `openingDragGapMs` and `openingZoomGapMs`.
2. `await page.addInitScript(() => { window.__rmrOpen = 'whole'; })`, then `page.goto('/map')` again, then run today's exploreFlow body unchanged (drag, wheel, deep zoom, morph, idle). Insert only the `sharpSettled` wait before the idle window.

This keeps the budget rows exactly like the baseline's: a fresh page, first gesture, Whole map, cold atlas, no sharper image. `--open whole` then only skips step 1. Fix the L1316 and L1333 texts to match.

### 4. Important: the Home and About backdrop after a visit to /map is now the Overview crop, and the plan does not say so

**Where:** plan "What decides the opening framing" (L134-140) and Step 7's resize branch.

**Problem:** going /map to Home or About does not move the camera. That is today's behaviour; the prototype instead flies Home to the Whole map (`app.js` L118 area: `S.route.name === 'home'` uses `framed('whole')`). Until now an untouched visitor's Home backdrop was the whole cloud. After this task, a visitor who lands on /map and clicks Home sees a dimmed Overview crop behind the hero. A resize while on Home also re-fits it to the Overview, because `getFitKind()` is still `'overview'`. That contradicts "Home still opens at the Whole map" and `final-home.jpg` (Downstream, part 3 Task 6) for the commonest path. It is not among the orchestrator's decisions.

**Fix:** pick one and state it:

- (a) Add open question 7 (owner flag) and a Downstream note for part 3 Task 6 and its review shots. Leave the code.
- (b) Follow the prototype. In MapStage's first view-change effect, when `view` becomes `home` and `prev === 'explore'`, the visitor has not touched the camera (`lastCameraGrab === 0`) and `getFitKind() === 'overview'`, call `apiRef.current?.reset()` (420 ms glide to the Whole map). Pin it with an e2e test in `opening.spec.ts`.

Either way, record it in the "Changed from today's site" list for part 3 Task 10.

### 5. Important: part 2 needs these exact text edits to fit Task 0 (check 6)

All references are to `2026-10-04-trifid-theme-2-stars-lines-names.md`.

- **L11, L25, L134 and L74 (helper ownership):**
  - L11: "new `waitForGasSharpSettled` helper" becomes "`waitForGasSharpSettled` reused from Task 0".
  - L25: "new `waitForGasSharpSettled`" becomes "reuses Task 0's `waitForGasSharpSettled`".
  - L74 and L134: "(added in Task 8 step 11)" becomes "(added in Task 0, step 11)".
- **L4026 (Task 8 Files):** "new `twinkleOff` and `waitForGasSharpSettled`" becomes "new `twinkleOff` (`waitForGasSharpSettled` is Task 0's)".
- **L4075 (Task 8 Interfaces):** move `waitForGasSharpSettled` from Produces to Consumes ("from Task 0").
- **L5183 and L5214-5245 (Task 8 Step 11):**
  - L5183: "One helper is new: `waitForGasSharpSettled`" becomes "The sharper image wait `waitForGasSharpSettled` is already in `helpers.ts` (Task 0); do not add a second copy".
  - Delete the helper's code block (its doc comment and function, from `/** Waits until part 1's sharper gas image has settled` through its closing `}`). Keep `twinkleOff`.
  - `lumaAt` "(L45)" becomes "(L50 after Task 0's `beforeEach` comment; find it by text)".
- **L6471 and L6482:** "(Task 8, step 11)" and "defined in `e2e/helpers.ts` (Task 8)" become "(Task 0)".
- **L20 and L2261 (Task 5, halo):**
  - Replace "the fitted whole cloud of a 1440 x 900 window ... is 0.784 * 836 / 1.1 = 595.8 px per world unit, just under 600, so there every name has the full halo" with: "the Whole map of a 1440 x 900 window is 596.7 px per world unit at Balanced (just under 600: every name has the full halo), 708.5 at Sonic and 618.2 at Mood (over 600: an unmoved name at rest gets the solved halo)".
  - Replace "(at most 12.5 px covers, 1,838 px per world unit; read the exact scale Task 0 records ...)" with "(1,639.5 px per world unit at Balanced, 11.15 px covers, names zoom factor 0.966; 1,534.7 at Sonic; 1,838.2 at Mood, capped at 12.5 px)".
- **L5855-5856 (names.spec comment):** "about 1.7 px on the phone" becomes "about 1.8 px on the phone (267.8 px per world unit); Task 0's Overview is 11.1 px on desktop and 2.7 px on the phone". Also note that `'0'` now gives the Whole map, where names show (4.1 px covers).
- **L6132 (Task 9 Step 7, perf idle note):** replace the advice with: "Task 0 already waits for the sharper image before the idle window (`sharpSettled`, with flags in the JSON); an `idleFrames` over 1 is not the fade unless `sharpSettled` holds a `false`".
- **L6152 (Task 9 Step 8, hover):** replace "If a hover shows more than 3 frames, first check whether that fade landed ..." with: "`hover-measure.mjs` waits for the sharper image before the idle (Task 0) and hovers at the Whole map by default; run it again with `--open app` for the opening view".
- **L137, L6191-6195, L6258-6283 and L6296-6310 (Task 9 Step 9, `--still`):**
  - Task 0's `settle` already ends with `sharpSettled`. Delete `stillGasSharp` (the same wait, sharing the `__capS*` window fields) and the replacement of the end of `settle`. Its before-text no longer matches, because Task 0 inserted a line there.
  - Keep "the sharper gas image ... included" in the header, attributed to `settle` (Task 0).
- **L6337-6348 (Task 9 Step 9, context lines L900-902):** after Task 0, a line `if (OPEN === 'whole' && state.open !== 'app') await ctx.addInitScript(...)` sits between the `__rmrGasLite` init script and `const page = await ctx.newPage();`. Put that line into both the before-text and the after-text. Insert the `STILL` seed line after it.
- **L6370-6373 (capture run):** say that the default `--open whole` keeps `map-overview` at the Whole map, and that `map-opening.jpg` and `map-opening-fit.jpg` are the new opening-view shots.
- **L6403 (Task 9 Step 11 reviewer brief):**
  - App images: replace `map-overview.jpg` with "`map-opening.jpg` (the Overview, judge against `final-overview.jpg`), `map-opening-fit.jpg` (the fit button's Whole map, judge against `final-whole.jpg`)". `map-whole.jpg` is the zoom-out floor.
  - Approved list: add `final-whole.jpg`.
- **L30 and L33 change log:** add one line: "Task 0 owns `waitForGasSharpSettled`, the perf idle wait and the capture/hover sharper-image waits; Task 8 and Task 9 reuse them".

### 6. Minor: no browser test pins the new desktop GPU behaviour, the sharper image at the opening view

**Where:** plan Step 12.

**Problem:** gas.spec runs at `__rmrOpen = 'whole'`, which is a justified opt-out (see "Tests" below). `opening.spec`'s idle check runs on software, where the flag goes 'off'. Nothing checks in a browser that the Overview asks for the sharper image without a zoom (950 > 700) and that its fade ends. The same mechanism is pinned after a zoom-in in gas.spec "a zoomed-in desktop map ...".

**Fix:** add a desktop test to `opening.spec.ts`:

1. Init script sets `__rmrGasSharp = 'force'`.
2. `openMap`.
3. Expect one request for `gas-balanced-sharp.<hash>.webp` with no camera move.
4. Poll `gasSharp` until it reads `'balanced'`, then `waitForGasSharpSettled`.
5. Expect 0 frames in 1000 ms.

### 7. Minor: the resize test can read the new canvas before the re-fit has run

**Where:** plan L967-977.

**Problem:** right after `setViewportSize`, `waitForCameraIdle` may pass before R3F's ResizeObserver has re-run `InitialFrame` on a slow software renderer.

**Fix:** after each `setViewportSize`, wait for the new size before waiting for the camera:

```ts
await expect.poll(() => page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().width)).toBe(1280);
```

Then `waitForCameraIdle`. Use 1440 for the second resize.

### 8. Minor: the "an album link" test cannot see a framing that starts at the Overview

**Where:** plan L920-940.

**Problem:** FocusFramer tweens to the same album framing from any start, so the end cameras are equal whether or not the page first snapped to the Overview. The test proves only "same end state". The guarantee rests on the `openingKind` unit test.

**Fix:** say that in "What each test proves", or log the camera at the first drawn frame and assert it is the Whole map's zoom. An init script polling `__rmr.map.getCamera()` on the first frame where `frames > 0` would do.

### 9. Minor: gas-fill thresholds are derived from the image, not the screen

**Where:** plan L979-1001 and L1039.

**Problem:** the thresholds (SKY + 4) come from the image file, not from the rendered screen. The plan already forbids lowering them.

**Fix:** add "record the 12 Overview and 12 Whole-map numbers in the PR body on the first green run". A future change to the gas curve then has a reference, and nobody needs to retune silently.

### 10. Minor: `capture.mjs` insertion point is off by one

**Where:** plan L1450.

**Problem:** "After the `map-zoom-steps` state (after L318)" points inside the state. L318 is `    },` (end of `run`) and L319 is `  },` (end of the state). Inserting after L318 is a syntax error.

**Fix:** "after L319 (the state's closing `},`)".

### 11. Minor: line references slightly off

All of these are found by text anyway; correct them so a literal reading also works:

- `gas.spec.ts` `beforeEach` is L25-29, not L24-28.
- `types.ts` `MapApi` is L42-58, not L42-56.
- `perf.mjs` "after L321 (`...exploreFlow...`)": the spread is L320.
- Downstream "part 2 L2260" is L2261.

### 12. Minor: open questions that are already decided

**Where:** plan "Open questions" L1617-1624.

**Problem:** the orchestrator has already decided questions 1, 3, 4, 5 and 6, and question 2 is an owner flag.

**Fix:** mark them "Decided (orchestrator, 2026-10-05): ..." so the implementer does not wait on them. Keep question 2 as the label flag, and add question 7 from finding 4.

### 13. Minor: commit attribution

**Where:** Step 20, L1577.

**Fix:** end the commit with the implementing session's attribution lines: `Co-Authored-By` plus its `Claude-Session:` line, as that session's system reminder gives them. The plan has only `Co-Authored-By`.

### 14. Minor (optional): one fewer sort per framing

`overviewExtent` re-sorts the same interpolated positions that `getCloudBounds` just sorted, about 8k floats, once per snap or resize re-fit. That is well under 1 ms and not on the pointer path. The sorts could be shared, but nothing needs to change.

## Tests (check 3)

- **`map.spec` "keyboard ... 0 gives the whole map" and "zoom buttons work":** at least as strong as before. The old check was "zoom back to the start to 3 decimals". The new one checks that the albums land in the padded box, tight on one axis, and that the camera is a fixed point to 1e-6 in x, y and zoom. The arrow, `+` and Zoom in checks are kept, and the phone project still runs the keyboard test.
- **`explore.spec` title:** the body is unchanged and still proves hint shows, hides over covers, and returns after the fit button.
- **`gas.spec` `beforeEach __rmrOpen = 'whole'`:** justified, not a dodge. "a zoomed-in desktop map" asserts `gasSharp === 'waiting'` and no request at open, which is true only at the Whole map. The lighter shader's mip floor and the registration test's px tolerances are also Whole-map facts. The switch reproduces the old opening to 1e-6 (pinned by "the opening switch"). It also makes gas.spec's Home-to-map navigations glide to the Whole map, matching the old behaviour. Gas at the Overview is covered by `opening.spec` (and by finding 6).
- **Thresholds:**
  - `overviewMiss` and `wholeMapMiss` use 1 px, derived from geometry: the camera is computed in float64 from the same Float32 positions that `screenPoint` uses. On the phone the camera uses cover 165 while the DOM measures 164.5, which moves the median row by 0.25 px.
  - Zoom `toBeCloseTo(..., 3)` is exact for the fixed canvas sizes.
- **Determinism:** the software renderer never loads the sharper image ('waiting' or 'off'), and every wait has a timeout. The exception is finding 7.

## Hard rules (check 4)

- Positions: untouched.
- Canvas at rest: the opening snap is inside the existing layout effect. The Home-to-map glide is a 420 ms tween that ends. The sharper-image fade is bounded (14 frames) and every frame-counting check waits for it.
- Tap targets: no control added.
- Copy: no `copy.ts` change; "Reset view" is kept.
- Budgets: `budgets.json` untouched.
- Site data: read only.
- First-load JS: only the `explore` flag and the small effect in `MapStage` (root layout). Everything else is in `canvas/` and `state/`, which only the lazy chunk imports.

## Perf and capture scripts (check 5)

- **`sharpSettled` waits.** Correct: not `'loading'`, flag and frames unchanged for 2.5 s, which is more than `GAS_SHARP_RETRY_MS` 2000. A failed load's retry starts after at least 2000 ms plus a quiet moment, inside the window.
- **No hang:** on phones (`'off'`), on software (`'waiting'`, then `'off'` once the view would want the image), and on builds without gas (`'undefined'` / `gas === undefined`). Bounded at 45 s.
- **Old behaviour:** reproducible in `capture.mjs` and `hover-measure.mjs`, whose defaults use `--open whole` and whose waits return at once on a build without gas. `perf.mjs` is not, per finding 3.
- **The new `map-opening` / `map-opening-fit` shots:** these are new names, so no baseline name changes framing.

## Speed (check 7)

- Nothing is added on the pointer-move path.
- On load: one extra sort of 2 x 4081 floats per snap.
- Extra frames: only the Home/About/404-to-map glide (420 ms, as in the prototype).
- The accepted sharper-image download on desktop GPUs at /map.

---

# Re-check after the writer's revision (2026-10-05)

I re-read the Task 0 plan (untracked) and `git diff` of part 2's plan against the real code: `store.ts` `saveExploreCamera(camera: MapCamera | null)`, `Header.tsx` `a.wordmark`, `CameraTween`, `InitialFrame`, `MapStage`, `GasField`'s sharper image rules, and `perf.mjs`. No browser was used.

**Verdict: CLEAN.** All 13 findings are addressed (14 was optional and skipped as allowed). Four new Minor points are listed below; none blocks the task. All four are one-line text or code edits that can be made at implementation time.

## Status of each finding

1. **ADDRESSED.** Step 15 now stashes `canvas/`, `MapStage.tsx`, `types.ts` and `state/mapStore.ts` and keeps `global.d.ts`. The stashed tree builds. The expected pass and fail lists match the old code, including the two new Home tests.
2. **ADDRESSED.** `exploreFlow` no longer writes `settled`. The new keys (`openingSharpSettled`, `openingCamera`, `opening*GapMs`, `idleSharpSettled`, `sharpFlag`, `wholeCamera`) do not clash with `albumFlow`'s, and both sharper-image flags have a WARNING line.
3. **ADDRESSED.** `openingFlow` runs on its own fresh `/map` and is reported only. `exploreFlow` adds `__rmrOpen = 'whole'`, loads `/map` fresh and runs today's body unchanged, adding only the sharper-image wait before the idle window. The budget rows meet a fresh page at the Whole map with no sharper image bound, as in the baseline. `--open whole` now only skips the opening rows, and the log text says so.
4. **ADDRESSED, as ruled.**
   - `homeBackdrop` glides to `overview()` only when no tween is running and `untouchedOverview(getFitKind(), getFitCamera(), current())` holds (within 1e-6). It sets the fit kind to the Whole map, so a resize on Home fits the Whole map. MapStage then saves `null` as the Explore camera.
   - A moved camera returns false and is saved as today; the visitor's own moves (drag, wheel, keys, zoom buttons) change the camera, and a pick's fly moves it too.
   - About and 404 are untouched.
   - Tween end values come from `exp(log ...)`, about 1e-16 off, so the 1e-6 test is safe. The opening snap and every re-fit record the camera they set.
   - The browser tests cover the glide, the Map link opening at the Overview again, a moved camera staying, and the resize on Home (compared with a fresh Home at 1280 x 800). The phone's 0.25 px centre difference is allowed for explicitly.
5. **ADDRESSED.** Every listed part 2 edit is in:
   - The helper's ownership moved to Task 0, and Task 8's copy and its Produces line were removed.
   - The halo numbers are fixed in L20 and L2262.
   - The names.spec comment now says 1.8 px.
   - The Task 9 step 7 and step 8 notes are updated.
   - `stillGasSharp` and the replacement of the end of `settle` are gone (no references remain).
   - The before and after texts of the context lines include Task 0's `__rmrOpen` line.
   - The step 11 brief now judges `map-opening.jpg` against `final-overview.jpg` and `map-opening-fit.jpg` against `final-whole.jpg`.
   - The change log has a Task 0 line.
6. **ADDRESSED.** The new test, with the sharper image forced: one sharper-image request with no camera move, then `'balanced'`, then settled, then 0 frames in 1 s. See new point A.
7. **ADDRESSED.** Each resize waits for the canvas width before `waitForCameraIdle`, in both resize tests.
8. **ADDRESSED.** "What each test proves" now says the album-link test cannot see the first frame and that the guarantee rests on the `openingKind` unit test.
9. **ADDRESSED.** The 24 readings go into the PR description on the first green run.
10. **ADDRESSED.** The insertion is now after L319.
11. **ADDRESSED.** The corrected line references are in the plan.
12. **ADDRESSED.** Questions 1 and 3-7 are marked decided, and question 2 stays with the owner.
13. **ADDRESSED.** The commit message now has a `Claude-Session:` line, but it is the wrong session's; see new point B.
14. **Skipped**, as allowed.

## New points (all Minor)

**A. The sharper-image test can run out of time on a slow software renderer.** The test is "on a desktop with a GPU the Overview asks for the sharper gas image ..." (plan, Step 12). It allows up to 20 s for the request and 30 s for the upload, plus loading and a 2.5 s settle, inside Playwright's default 45 s test limit. gas.spec's comparable test, "a sharper image that fails to load ...", sets `test.setTimeout(90_000)`. **Fix:** add `test.setTimeout(90_000);` as the first line of the test.

**B. The commit attribution names the wrong session.** Step 20 hardcodes this review session's URL, `Claude-Session: https://claude.ai/code/session_018o5wEPKTzFy2Pafgts8FKM`. **Fix:** replace the line with "the implementing session's own `Claude-Session:` line, from its system reminder".

**C. Stale text in the plan.**
- L79: the Files entry for `view.ts` says "after L59, `isFramed`". Step 5 now inserts after L66, after `CameraView`.
- L84: the Files entry for `CameraTween.tsx` names only `opening`. It should be "new `opening` and `homeBackdrop` after `flyTo`".
- L1506: "(open question 3 asks whether they should gate)" should be "(decided: reported only, open question 3)".

**D. A resize on Home after a pick's fly re-fits to the Overview crop.** This is a rare edge case.
- **Problem:** `flyTo` does not count as a camera grab, so after a pick's fly InitialFrame still treats the camera as untouched. A visitor who picks an album on `/map` (the camera flies) and then goes Home keeps the flown camera, which is correct by the ruling. But a resize on Home then re-fits to the Overview, because the fit kind is still `'overview'`. Before this task the same path re-fit to the Whole map, and the ruling says a resize on Home fits the Whole map.
- **Fix:** in Step 7, choose the kind for the resize branch by route:

  ```ts
  const kind = newData ? openingKind(input, window.__rmrOpen) : (input.explore ? getFitKind() : "whole")
  ```

  Off `/map`, a resize re-fit then always gives the Whole map, as today. It changes nothing on `/map`, and needs no new test beyond the existing resize-on-Home test.

## The new code

- **It compiles against the real types.**
  - `saveExploreCamera` accepts `null`.
  - `CameraView` is declared before its first use (the insertion is after L66).
  - `tween.current` and `current()` are in `homeBackdrop`'s closure.
  - `MapApi.homeBackdrop` is implemented only in `CameraTween`.
  - `a.wordmark` exists (`Header.tsx`).
  - `window.__rmrGasSharp` is declared.
- **It adds nothing on the pointer-move path and draws nothing at rest.**
  - `homeBackdrop` runs once, in MapStage's view-change layout effect, as a 420 ms tween that ends.
  - `setFitKind` and `getFitCamera` are plain module variables, with no timers or subscriptions.
  - `untouchedOverview` is a single arithmetic check.
- **It is deterministic on a slow software renderer.**
  - Every new wait is on `isAnimating`, frames, the canvas width or the sharper-image flag.
  - The Home tests compare cameras, not pixels.
  - `openingFlow` copies `exploreFlow`'s gestures exactly, and its sharper-image wait stops after 45 s at most.
  - The exception is the time limit in point A.
