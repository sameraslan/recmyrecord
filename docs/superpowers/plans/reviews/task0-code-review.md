# Task 0 code review: `/map` opens at the Overview

Commits reviewed: `cf68df0c..812274aa` on `feat/trifid-theme` (04c47301, 8576b671, 374ef32b, 812274aa), unpushed.
Spec: `2026-10-05-trifid-theme-2-task0-overview-framing.md` and `reviews/task0-plan-review.md` (re-check points A-D).
Reviewer: a fresh session, 2026-10-05, in the cloud container (Chromium 141 on SwiftShader, no GPU).

**Verdict: NEEDS FIXES.** There are 3 Important findings, and each is a small edit. The behaviour matches the rulings. Every hard rule holds except first-load JS, which is +0.6 KB over base for a reason that can be avoided (finding 1).

## What I ran

| Check | Result |
|---|---|
| `opening.spec.ts` + `map.spec.ts`, desktop, twice | 16 passed, 1 skipped (phone-only test); 16 passed, 1 skipped. No flakes. |
| `opening.spec.ts` + `map.spec.ts`, phone, twice | 11 passed, 6 skipped (desktop-only); 11 passed, 6 skipped. No flakes. |
| Deviation D mutation: `snapKind` reverted to the plan's original rule (`return fitKind`) | "after a pick's fly on /map, a resize on Home ..." fails (camera off by 1.604, the Overview against the Whole map). Restored. Claim confirmed. |
| Canvas at rest (an ad-hoc spec, deleted after the run) | Frames counted over 2 s at rest after the `/map` opening, and again after the `/map` -> Home glide (each after `waitForGasSharpSettled`): **0 and 0** on desktop and on phone. |
| `gas.spec.ts` "a software renderer draws the gas with the lighter shader ..." (L1378 at base) on **base cf68df0c** (base `frontcreck/` checked out in place, then restored) | Fails identically: `levels through deep zoom: 0.00, 2.43, 3.89, 4.38`. Not caused by Task 0. Claim confirmed. |
| First-load JS of `/` (perf.mjs's method, `scratchpad/first-load-js.mjs`), base vs head, plus bisecting builds | base 191.2 KB, head 191.8 KB. Cause and fix in finding 1. |
| capture logs (`scratchpad/task0-capture2*/capture-log-*.json`) | `map-opening-fit` equals `map-overview` exactly on both viewports. `map-opening` zoom is 2.15721 on desktop and 0.56516 on phone. |
| `budgets.json`, `public/` site data, `src/lib/copy.ts`, data-pipeline, data-retrieval | unchanged (`git diff --stat cf68df0c..HEAD` empty) |

The working tree is clean after every experiment. `.next/` holds a build of a mutated tree, so the next run must rebuild (Playwright's webServer always does).

## Findings

### 1. Important: first-load JS +0.6 KB comes from MapStage's third layout effect splitting a shared chunk, and it can be avoided

**Where:** `frontcreck/src/components/map/MapStage.tsx` L264-270 (the effect starting L266) (the new `useLayoutEffect` that calls `opening(true)`).

**Problem:** the implementer said a Next router chunk split. That is right about what happened and wrong about the cause.
- At base, `/` loads `0b5ex3ooe8ymo.js`: 36,664 B raw, 10.91 KB gzip, 33 modules (Next router internals plus `MapStage`).
- At head, the same 33 modules arrive as two chunks: `07o-9r517n309.js` (17 modules, 3.68 KB) and `3-b15nd1zmfhn.js` (16 modules, `MapStage` among them, 7.87 KB). No module entered or left the first load, and no import changed.
- Real code growth is +435 B raw, which is +94 B gzip when the two chunks are concatenated (11,170 -> 11,264 B). The other +559 B is per-file gzip overhead from the split, plus one extra script request.

Bisecting builds, all measured the same way:

| Build | `/` first-load | Chunks |
|---|---|---|
| base | 191.2 | one |
| base + 280 B of non-removable padding in MapStage | 191.4 | one |
| base + ~480 B of padding (more raw bytes than head adds) | 191.6 | one |
| head with MapStage = base + only `explore: view === 'explore'` | 191.2 | one |
| head without the third `useLayoutEffect` (everything else kept) | 191.3 | one |
| **head with the opening call merged into the existing return effect** | **191.3** | **one** |
| head as committed | 191.8 | two |

So the split is not a raw-size threshold, and no import triggers it. Adding a third layout-effect closure to `MapStage` is what makes Turbopack's chunker split this chunk group. I did not establish the reason inside Turbopack.

The plan's own acceptance check fails as committed: Step 19 says "`/` first-load JS within 0.2 KB of 191.2 KB".

**Fix:** fold the opening glide into the existing return effect. `pendingReturn` (prev `album`) and `pendingOpening` (prev `home`/`about`/`other`) are mutually exclusive, so the order does not matter. A tested copy of the result is at `scratchpad/rv/MapStage.mergedEffect.tsx`; it builds to 191.3 KB.

```ts
  useLayoutEffect(() => {
    if (view !== 'explore' || input.focus !== null) return;
    if (pendingOpening.current) {
      pendingOpening.current = false;
      apiRef.current?.opening(true);
    }
    if (!pendingReturn.current || !apiRef.current) return;
    pendingReturn.current = false;
    const saved = useAppStore.getState().exploreCamera;
    if (saved) apiRef.current.setCamera(saved, true);
    else apiRef.current.reset();
  }, [view, input]);
```

Keep the comment of the removed effect on the merged one. After the fix:
- re-run the two opening.spec Home tests and explore.spec's album-return tests;
- re-measure first-load JS (expect 191.3).

The chunker's behaviour is not predictable from source size, so any later edit to `MapStage` (part 2 or part 3) should re-measure first-load JS. A budget-only check would not catch a split like this.

### 2. Important: `perf.mjs` runs `openingFlow` before the budget rows on the same page, so the budget rows meet a warm HTTP cache

**Where:** `frontcreck/scripts/perf/perf.mjs` L402 (`...(OPEN ? {} : await openingFlow(...))` before `exploreFlow`), with `openingFlow` at L214-254.

**Problem:**
- `openingFlow` runs the 2 s wheel zoom from the Overview, which shows 11.1 px covers. Even the roughly 10 wheel events a software renderer fits into 1 s take it past `ATLAS_LOAD_PX` (13 px), so it fetches cover sheets around the centre. On a GPU desktop the Overview also fetches the sharper gas image, about 0.8 MB.
- `/data/*` is served `max-age=86400`, so all of that sits in the browser's HTTP cache.
- `exploreFlow` then loads `/map` fresh in the same page. The JS state is new, but the budgeted drag and zoom rows (and the deep zoom and idle rows) now meet a warm cache where the baseline met the network.
- At base, only `albumFlow` (Loveless's neighbourhood) had run before.

This is not like for like. It can only make the gated rows look better, so it could hide a regression. The plan prescribed this order, and the plan review missed it.

**Fix:** measure the budget rows first, exactly as the baseline did, and the opening rows last on their own page. `exploreFlow`'s `addInitScript` stays on its page, so `openingFlow` needs a new page:

```js
    ...(await albumFlow(page, vpName === 'phone')),
    ...(await exploreFlow(page, vpName === 'phone')),
    ...(OPEN ? {} : await openingFlow(await page.context().newPage(), vpName === 'phone')),
```

`openingFlow` must install `PAGE_HELPERS` (`window.__perf`) on the new page, as `measure()` does for `page`, or take the page from a small factory. Close that page afterwards.
- The opening rows are reported only, and warm caches there are acceptable. Say so in the `openingFlow` doc comment.
- Update the Step 16 text and the perf notes ("Runs before exploreFlow sets __rmrOpen").

### 3. Important: the gas-fill test's "bare sky" threshold has a margin under one 8-bit step, and its derivation ignores the grain overlay

**Where:** `frontcreck/e2e/opening.spec.ts` L238-262 (the Whole map assertion, at least 2 of 12 patches `<= SKY_LUMA + 4`) and L264 (`SKY_LUMA = 6.2`).

**Problem:**
- The bare sky reads 10.1444 on screen, which is exactly rgb(10, 10, 12), not the shader's rgb(6, 6, 9). The `.grain` overlay (`src/styles/shell.css` L20, fixed, `opacity: .035`) lifts every pixel.
- The threshold 10.2 sits between rgb(10, 10, 12) = 10.144 and rgb(10, 10, 13) = 10.217. Patch 8 already reads 10.2166 and counts as gas.
- The Whole map has exactly 3 patches at 10.144 against a requirement of 2. One more level in one channel, or a grain or sky tweak, flips them.
- `SKY_LUMA + 4` is gas.spec's floor for "this patch shows gas". Used here as the ceiling for "this patch is sky", it ignores the grain's ~4 levels, so the margin it was meant to give is used up before the test starts.

**Flakiness today:** none here. Both of my desktop runs and the implementer's runs give identical numbers on SwiftShader. But the assertion is brittle across renderers, and part 2 adds stars and part 3 restyles the chrome.

**Assessment:** the number was not deliberately tuned (it is the plan's threshold), but it passes by luck of quantisation.

The Overview half is robust: its lowest patch is 58.1 against 10.2.

**Fix:** hide the grain for this test only, e.g. `await page.addStyleTag({ content: '.grain { display: none }' })` after `openMap`. The bare sky then reads about 6.2, the shader's own sky, and the threshold keeps its intended 4-level margin. This is not loosening: it removes a confound the derivation did not model. Alternatively, read a sky reference on screen and compare against reference + 2. After the fix, put the new 24 readings in the PR description, as Step 12 asks.

### 4. Minor: `opening()` can run before InitialFrame has framed the data

**Where:** `canvas/CameraTween.tsx` L118-127.

**Problem:** the only guard is `if (!data) return;`. MusicMap writes `data` to the store in its layout effect, and InitialFrame snaps in a later commit. If the Home -> Map navigation lands in the same commit as the data, `overview()` returns view.ts's fallback framing (zoom 2.4). The Overview is then computed from a wrong `wholeZoom`, and the tween keeps flying to that wrong target after InitialFrame's correct snap. This is rare.

**Fix:** `if (!data || !isFramed()) return;`. InitialFrame then opens the map at the same framing through `openingKind`, as the MapStage comment already promises.

### 5. Minor: Home clicked during the opening glide saves a half-way camera

**Where:** `CameraTween.tsx` L129-136 (`homeBackdrop`: `if (tween.current || ...) return false`).

**Problem:** going Map -> Home within 420 ms of the glide saves the mid-glide camera as the Explore camera. The Map link then restores that half-way framing and never reaches the Overview.

**Fix:** treat a running tween whose `to` equals `getFitCamera()` (within 1e-6) as untouched: glide to the Whole map from where the camera is.

### 6. Minor: a resize during the Home -> /map glide leaves the camera at the old-size Overview

**Where:** `InitialFrame.tsx` L107-123 against a running tween.

**Problem:** the resize snap re-fits the Overview at the new size and records it as `fitCamera`. The running tween then overwrites the camera and ends at the old size's target, so the camera is not the Overview for the window, and Home will later treat it as touched. `reset()` has the same issue at base, so this is not new in kind.

**Fix (optional):** when a tween is running, the resize branch could retarget it, or `opening` could re-read the size at the end. Otherwise accept it and note it.

### 7. Minor (for the orchestrator): `/map` (untouched) -> About -> Home shows the Overview crop behind the hero

**Where:** `MapStage.tsx` L242-246, where `homeBackdrop` runs only when `prev === 'explore'`.

**Problem:** About keeps the camera, as ruled. Home reached from About then shows the Overview, not `final-home.jpg`'s framing. A resize on Home then snaps to the Whole map (`snapKind` off `/map`), which is inconsistent. Ruling 7 covers only `/map` -> Home.

**Decide:** either accept this, or call `homeBackdrop` on any arrival at Home while `untouchedOverview` holds and drop the saved Explore camera then.

### 8. Minor: the `capture.mjs --only` log guard makes the plan's Step 17 check impossible

**Where:** `docs/design/trifid-theme/reviews/baseline/capture.mjs` L1001: `if (!ONLY) fs.writeFileSync(... capture-log-${vp}.json ...)`.

**Problem:** the plan's check runs `--only map-` and then reads `capture-log-desktop.json`, which an `--only` run never writes. The implementer verified with a copy of the script that drops the guard. I checked those logs (table above), and the result holds.

**Fix:** change the script, not the check. On `--only` runs, write the log as `capture-log-${vp}.only.json`. The guard exists so that a partial run never overwrites a full log in the baseline folder; a distinct name keeps that protection and makes partial runs checkable. Defaults and full runs are unchanged. Then update Step 17's check to read that file.

### 9. Minor: plan text out of date with the code

These are not code problems. Bring the plan in line so downstream readers are not misled:
- **Step 16:** `wholeCamera` is now recorded before the first gesture (812274aa). The plan's spot read exploreFlow's `home`, the camera after the budgeted drag and wheel (zoom 5.16), so the change is correct. The plan still says "`wholeCamera.zoom` 0.785 (the whole map, put back before the idle window)".
- **Step 15:** the fail-first list misses "the fit button gives the Whole map". On old code it fails legitimately, because its `whole.zoom < opened.zoom` is false when the map opens at the Whole map.
- **Step 7:** the snap uses `snapKind` (deviation D, which the plan review asked for), not `newData ? openingKind(...) : getFitKind()`.

## Checked and fine

**Rulings**
- The fit button and `0` give the Whole map and are a fixed point (`reset()` is unchanged apart from recording the kind).
- Only `/map` with no focus opens at the Overview: `openingKind`, with unit tests.
- Album links frame as before: the whole-map snap, then `FocusFramer`.
- `__rmrOpen='whole'` reproduces the old opening to 1e-6 (the "opening switch" test).
- Home glides back only when untouched and saves `null`.
- A resize before a touch keeps the framing kind on `/map`, and gives the Whole map elsewhere (D).

**Edge cases**
- Deep links: `/map` always starts at Balanced, because MorphDriver sets `sliderT` on the first frame and only album routes carry `?by`.
- Back and forward follow the same `view` transitions as the header links.
- A saved Explore camera wins over the glide.
- A stop change at the Overview does not move the camera and does not count as a touch. A later resize re-fits the current stop's Overview.
- Opening and closing an album at the Overview restores the saved Overview.
- On the phone, the median row sits above the measured panel. The 0.25 px fallback difference is allowed for.
- Data arriving late is handled by `newData` together with `openingKind` (see finding 4 for the one gap).
- Under reduced motion, `start()` applies the move at once.

**Hard rules**
- No position code was touched.
- The new state is plain module variables, with no timers, subscriptions or `invalidate()` at rest; the frames at rest were measured as 0 (table above).
- No control was added or resized, so tap targets are unchanged. Copy, budgets and site data are unchanged.
- Nothing new is on the pointer-move path. The extra work is one sort of about 2 x 4k floats per snap.

**Tests**
- The `map.spec` rewrites are stricter (geometry, plus a fixed point in x, y and zoom).
- The `explore.spec` change is the title only.
- The `gas.spec` `beforeEach` change is justified by the old framing, and confirmed by the base run of L1378.
- Plan-review point A (`setTimeout(90_000)`) is in.

**Scripts**
- The budget rows keep the same keys and the same framing (`__rmrOpen='whole'`, wholeCamera 0.78507). Finding 2 is about the cache only.
- The `sharpSettled` waits are bounded.
- `capture.mjs` and `hover-measure.mjs` default to `--open whole`.
