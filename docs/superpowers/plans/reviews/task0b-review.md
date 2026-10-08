# Task 0b review: fresh quiet windows in the e2e map waits

Commit reviewed: `9a646f23` on `feat/trifid-theme` ("test(e2e): waitForMapQuiet and waitForGasSharpSettled measure a fresh window on every call"), local and unpushed.
Reviewer: a fresh session, 2026-10-05, in the cloud container (Chromium 141 on SwiftShader, no GPU, 4 CPU).

**Verdict: APPROVED.** The barrier argument holds for how R3F 9.8.1 schedules frames in `frameloop="demand"`. The helper cannot hang where the old one returned. The four new tests are deterministic (40/40) and fail on the old helpers for the reason they claim. Existing waits only got stricter. The phone `explore.spec.ts:330` failure is not caused by this commit. It is a tap that the app rejects as a long press when the machine is loaded, and the old helper fails at the same rate under the same load (finding 1). Findings 1 to 5 are follow-ups, and none blocks the commit.

## What I ran

| Check | Result |
|---|---|
| `helpers.spec.ts`, desktop + phone, `--repeat-each=5` | 40 passed, no flakes |
| phone `explore.spec.ts:330` x10, new helper, alone | 10/10 passed |
| phone `explore.spec.ts:295` (red on purpose, so the worker restarts) + `:330` + an instrumented copy of `:330`, x10, **new** helper | `:330` 10/10, instrumented 10/10 |
| the same, with **old** `helpers.ts` (scratch: `git show 9a646f23^:frontcreck/e2e/helpers.ts`, `helpers.spec.ts` moved aside so the build type-checks; both restored) | `:330` 10/10, instrumented 10/10 |
| phone `:330` + the instrumented copy, x15, under CPU load (4 busy loops started once the build was done), **new** helper | 3 of 30 missed (`:330` 1/15, instrumented 2/15) |
| the same under the same load, **old** helper | 3 of 30 missed (`:330` 1/15, instrumented 2/15) |

The instrumented copy (an untracked `e2e/zz-rv330.spec.ts`, deleted afterwards) logged `pointerdown`, `pointerup`, `touchstart`, `touchend`, `click` in the capture phase, long tasks, and `__rmr.frames`. The working tree is clean, and the last `.next` build came from the clean tree.

## The barrier argument (check 1)

- **Frame counting.** `FrameCounter` (`src/components/map/canvas/FrameCounter.tsx:7`) is a `useFrame`, so `__rmr.frames` goes up once per R3F `update()`, before `gl.render`.
- **Scheduling.** The canvas is `frameloop="demand"` (`Scene.tsx:95`). In R3F 9.8.1, `invalidate()` sets `internal.frames` to 1, or to 2 when it is called inside a `useFrame`. If the loop is not running, it calls `requestAnimationFrame(loop)` right away. While the loop is running, each tick asks for the next one first (`frame = requestAnimationFrame(loop)`) and cancels it only when nothing is left to draw.
- **Why the barrier holds.** rAF callbacks run in the order they were asked for, and a callback asked for during a tick runs in the next tick. So a frame that was asked for before the predicate's first poll runs no later than barrier rAF #1, in the same tick. A second frame asked for from inside that `useFrame`, or the loop's own next tick, was asked for before rAF #1 asked for rAF #2, so it runs before rAF #2 in the next tick. `ready` then reads a count that includes both. `setCamera(c, false)` calls `invalidate()` synchronously (`CameraTween.tsx:51-62`), so a camera move made just before the call is covered. This holds however late the tick comes, as `holdNextTick` simulates.
- **What it does not cover, as the docstring says.** Frames asked for later, from React effects, timers or texture loads. Examples are `GasField.takeForMorph`'s rAF + `setTimeout`, `InitialFrame`'s rAF framing, and atlas or gas texture `onload`. These are what `since` is for. Stop changes are also covered by `isAnimating()`'s `morphPending`.
- **Can it hang?**
  - A canvas that draws nothing returns after the barrier plus `quietMs`; helpers.spec test 3 checks this.
  - nowebgl does not use these helpers. Without a canvas the frame count stays at 0 and rAF still ticks, so the wait returns.
  - On Home the map draws nothing at rest (Task 0's review measured 0 frames). If something drew continuously there, the old helper would also time out.
  - The only new way to hang is a page whose rAF never fires (a hidden page). No caller waits on a page other than the front one; the only `newPage()` is `search.spec.ts:241`, which does not touch the map.
- **`since`.** It is safe for its documented use: an action that must draw, measured within one document. See finding 4 for the one edge case.

## Findings

### 1. Minor (not this commit): phone taps are rejected as long presses when the machine is loaded. `:330` is one victim.

**Where:** `frontcreck/src/components/map/canvas/PickController.tsx:15,41` (`TOUCH_MAX_MS = 500`). The test side is `frontcreck/e2e/explore.spec.ts:26` (`pickKnown`) and the other `touchscreen.tap` sites: `explore.spec.ts:11,165,178,312`, `flows.spec.ts:76`, `phone.spec.ts:69,132`, `map.spec.ts:133`, `focus.spec.ts:116` and `a11y.spec.ts:69`.

**Cause.** In every miss the tap landed on the canvas at the album's centre (`{x:195,y:452}`, the same point as in the passes), with the camera at rest. The pick data was not stale. What changed is the time between `pointerdown` and `pointerup`:

```
pass (loaded):   5600.8 pointerdown  ...  5602.0 pointerup     (1 ms)
miss (new):      3376.9 pointerdown  ...  5003.9 pointerup     (1627 ms)
miss (new):      3393.7 pointerdown  ...  5222.9 pointerup     (1829 ms)
miss (old):      3433.3 pointerdown  ...  4909.9 pointerup     (1477 ms)
miss (old):      3882.5 pointerdown  ...  6208.1 pointerup     (2326 ms)
```

`PickController.onUp` drops a touch that lasted longer than 500 ms, so `selected` stays `null`. Playwright's `tap` sends touchStart and touchEnd as two CDP calls, and when the CPU is busy the second one arrives 1.5 to 2.3 s later. At most one map frame and a long task of 120 to 150 ms fell inside that gap, so the delay is in input dispatch, not the app. The barrier and the frame order do not take part in this. The full suite is the loaded case (build, other workers, SwiftShader at dpr 2), which explains 2/16 there. The "0/4 old" sample was too small to compare. With equal load the rates are equal (3/30 vs 3/30), and without load both are 0/20+.

**Fix (separate ticket, test-side).** Add a `tapAt(page, x, y)` helper in `e2e/helpers.ts` and use it at the tap sites above:
1. Install a one-shot capture-phase listener that records `pointerdown` and `pointerup` `performance.now()` for that pointer.
2. Call `page.touchscreen.tap`.
3. If the recorded gap is over 500 ms, tap once more and say so in the test output (`test.info().annotations`).

This retries only when the environment turned a tap into a long press, so it cannot hide a pick bug. Do not raise `TOUCH_MAX_MS`: it is product behaviour.

### 2. Minor: gas.spec's `cameraDrawn` can now use `since` (recommendation; not done)

**Where:** `frontcreck/e2e/gas.spec.ts:1460-1469` (from 0563a218).

The local fix (`expect.poll(frames > before)`, then `waitForCameraIdle`, then `waitForMapQuiet(300)`) is correct as it stands. The helper now does the same job in one call: `await waitForMapQuiet(page, 300, { since: before })`. `waitForCameraIdle` is not needed, because `setCamera(c, false)` does not tween. If its `isAnimating` check is wanted for a rig or nudge, use `waitForCameraIdle(page, { since: before })` followed by `waitForMapQuiet(page, 300)`.

Do it at the next edit of that test, not as its own change. One thing is lost: the poll's message, "the frame that draws the new camera", would become a generic 15 s `waitForFunction` timeout. Keeping the poll for its message is also acceptable.

### 3. Minor: the baseline `capture.mjs` copies have the same stale shape; Task 9 should fix them

**Where:** `docs/design/trifid-theme/reviews/baseline/capture.mjs:144-160` (`mapQuiet`, state on `window.__capF/__capT`) and `:165-184` (`sharpSettled`, `__capSF/__capSS/__capST`). The comment at `:162-164` says it "Mirrors frontcreck/e2e/helpers.ts waitForGasSharpSettled", which is no longer true.

**Recommendation.** Yes: part 2 Task 9 step 9 should port both fixes when it adds `--still`. That edit already rewrites `settle`, and every capture from Task 9 on (part 3's included) goes through it. The port is:
- a per-call token and the two-rAF barrier in `mapQuiet`;
- a per-call token in `sharpSettled`;
- `since` at the steps that move the camera and then call `mapQuiet` (`:525`, `:533`, and the hover steps at `:188` and `:276`, if they follow a camera or pointer move).

Calls at `:221`/`:224` after a fresh `goto` are not affected, because the window state is new after a load. Add one line to the Task 9 plan so this is not lost. Part 1's and the baseline's captures need no rerun: the stale wait can only have caught a view one frame early, and those images were reviewed by eye.

### 4. Nit: `since` across a reload never resolves

**Where:** `frontcreck/e2e/helpers.ts:59-72` (docstring) and `:99`.

`__rmr.frames` is a window global and is not reset by client-side navigation, so a count read before a route change is fine. After a full load (`goto`, `reload`) the count starts from 0, so `since` read before it waits until the new document has drawn more frames than the old one, and may time out. Add to the docstring: "read `since` in the same document (no `goto`/`reload` in between)."

### 5. Nit: test 3 assumes nothing draws after `mapAtRest`

**Where:** `frontcreck/e2e/helpers.spec.ts:77-84` (`expect(await mapFrames(page)).toBe(f0)`).

`mapAtRest` waits for the map to be ready and quiet for 300 ms, but not for `waitForGasSharpSettled`. If a texture landed late (atlas or sharper gas), it could draw a frame and fail the equality, though not the timing assertion that is the point of the test. It passed 10/10 here (5 desktop, 5 phone). For robustness, call `waitForGasSharpSettled(page)` in `mapAtRest`, or drop the equality. Optional.

## Check 2: do the tests prove the race is closed?

- **Test 1 (`holdNextTick` 400 ms, quiet 200 ms).** The old helper passes at once on its stale stamp. A token-only fix without the barrier would also fail it, because the window would start at the call and 200 < 400. Only the barrier passes it, so the test pins the barrier rather than just the fresh window. The override catches R3F's `requestAnimationFrame(loop)` because R3F calls the global at call time, and `setCamera(..., false)` invalidates synchronously, so the loop's request joins the held tick before barrier #1.
- **Test 2 (`holdNextCallback` 600 ms, `since`).** The map's own callback is late while the barrier's are on time, so only `since` can catch it. The final assertion is guaranteed by `since`'s own condition, but the test still shows the late frame is waited for and the call does not time out. The old helper (no `since`) fails it.
- **Test 3.** Pins "a fresh window of at least `quietMs`" (the old helper returned in 7 ms).
- **Test 4.** Pins the per-call token in `waitForGasSharpSettled` (the old one returned in 8 ms after a 600 ms gap).

All four are deterministic here (40/40) and red on the old bodies (`scratchpad/helpers-red.txt`, matching the failure messages).

## Check 4: nothing loosened

The commit touches only `e2e/helpers.ts` and the new `e2e/helpers.spec.ts`; no existing test or expectation changed. In every case the new `waitForMapQuiet` returns no earlier than the old one:
- the old version measured from the last frame it had seen, carried over from earlier calls;
- the new one measures from the later of the barrier and the last frame after it;
- `since` only adds a condition.

`waitForGasSharpSettled` is the old predicate with its state reset per call. `waitForCameraIdle`'s new `opts` is optional and only passed through. In the full run, the only failure outside the known list was the phone `:330` (finding 1). `gas.spec.ts:903`, also failing in that run, failed the same way in the runs before this commit (`r1-full-failing.txt`, `e2e-full-task0-failing.txt`). The ledger's line "known 7 + flows:118" should count gas:903 as a known red rather than flows:118.

Refs #45
