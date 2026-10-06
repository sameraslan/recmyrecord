# Review: part 2, Task 3, "Cover layout that keeps covers off the lines" (with the performance design)

Reviewer: a new reviewer, 2026-10-06. Range `1907f1fd..ebfa4d23` on `feat/trifid-theme` (local, not pushed):
87a7e564 (the plan's layout), 5e617160 (`layout-cost.mjs`), eed56bcc (MarkerLayout, and a faster `layoutMarkers` that should give bit-identical results),
060d3a5e (the group rides rigidly while the map moves and settles with a 180 ms ease), ebfa4d23 (an opening album is solved at the tween's target view).

**Verdict: NEEDS FIXES.** I found three Important problems and no Critical ones. The layout is the plan's, and the faster
`layoutMarkers` gives bit-identical results. The album-open path meets the rulings: no ease, and no frames at rest. The
pinch zoom path and the end of wheel zooms and flings do not. The wall-held ride can also jump much further from one frame
to the next than either the fresh solve or the old layout.

## What I checked, and how

| Check | Result |
|---|---|
| 87a7e564 `layoutMarkers` and `edgePoint` against the plan's Step 3 code block | Same text, diffed character for character. The rules match the prototype's `Focus.layout` (`focus.js` L15-69). The app's ring, wall shift and held relax are kept around them, as the plan says. |
| HEAD `layoutMarkers` against 87a7e564, bit for bit | My own random check, 120,000 cases: 1 to 11 markers, piles, near-piles, tight random bounds that force the held path and its cycles, `gap`/`minLine` 8/10, sizes 38/28. **0 cases differ** (compared with `Object.is`). The current version is 5.5 times faster on these cases. The implementer's real-data check (`scratchpad/exact-final.txt`, 293,832 cases) also found 0 differences. The proof also holds on paper: `Directions` is re-aimed after every move and at the start of each round, `CLEARLY_APART` leaves a 0.01 rad margin, and `iterate` skips repeated rounds, which is safe because a round depends only on the positions. |
| Unit tests | `focusLayout.test.ts` and `screen.test.ts`: 40 pass. eslint passes on the changed files. `tsc --noEmit` is clean. |
| No pre-existing test was loosened | `git diff 1907f1fd..HEAD` on `focusLayout.test.ts` and `e2e/focus.spec.ts` removes nothing except the import lines, which are rewritten to import more. The tests 060d3a5e removed were added in eed56bcc, in the same unpushed range. |
| e2e: focus, explore and map specs, desktop and phone (`--workers=1`) | 50 pass, 12 skipped, 2 fail. Both failures are `explore.spec.ts:295` on desktop and phone, which is red on purpose (ENV.md). |
| Real `/album/<slug>` open on desktop, from the map card (the panel slides in during the framing tween) | `__rmr.markerLayout()`: **eases 0, settles 0**, freshGap 0 or 2e-13. **0 frames** in 1.5 s at rest. A direct load of `/album/in-rainbows-radiohead` gives the same result. |
| Drag with an album open, held, then released (no fling) | 1 settle frame within 30 ms, then 0 frames, apart from one frame about 545 ms after release. That frame also appears after a plain click, and on a base build (1907f1fd) at the same delay, so it was already there and has nothing to do with the markers. A drag held at the wall then released: the same. settles 1, eases 0, freshGap 0. |
| Wheel zoom with an album open, base build against HEAD (4 wheels, run twice each) | Frames within 400 ms after `isAnimating()` turns false: **base 0,0,0,0 twice; HEAD 1,1,1,1 twice.** See finding 2. |
| Pinch with an album open, phone, `/map` with a focus set, synthetic two-pointer pinch from 0.60 to 2.08 zoom | **22 pinch frames: 23 settles and 23 eases.** `markerLayout()` returns null (an ease is running) at every sample during the pinch. See finding 1. |
| `layout-cost.mjs --no-calls --sample 10 --old <plan> --old <base>` | Ran it again. It matches the implementer's numbers: per drawn frame the current code takes 1-50 us on average (p99 under 170 us), against 60-3,300 us for the plan's layout called on every frame. The settle frame: mean 100 us, p99 492 us, max 698 us, gap to a fresh solve 0. The numbers hold up, but one row shows a regression, see finding 3. |
| Heap allocation in the reuse and ride paths (node, 200k frames each, pan / zoom / wall) | 1.6-4.9 B per frame. That is effectively nothing: the `carry` closure does not escape. |

## Findings

### 1. Important: a pinch zoom is not "in motion", so every pinch frame runs a fresh solve and starts and cancels an ease

`frontcreck/src/components/map/canvas/MarkerDriver.tsx:29-31` (`inMotion`). With `frontcreck/src/components/map/canvas/CameraRig.tsx:144-150` (a second finger sets `dragging` false) and `:160-181` (pinch moves set no store flag).

During a two-finger pinch, `dragging`, `rigMoving` and `animating` are all false. So every pinch frame goes down the at-rest
branch (`focusLayout.ts:517`). It runs a full solve, which on a phone takes up to 3-5 ms for the worst albums (layout-cost
`phone` rows). It also starts a new 180 ms ease every frame, which the next frame cancels (`MarkerDriver.tsx:224-243`), so
the covers are drawn at the previous frame's carried positions plus one ease step. Measured: 22 pinch frames gave 23 settles
and 23 eases. This is exactly the per-frame solve the design was built to remove, on the device where it costs the most, and
it breaks the rule "during motion the group rides rigidly; one fresh solve when motion ends".

**Fix:** publish the pinch as motion. For example, keep `dragging` true for the whole gesture, or add a `pinching` flag that
CameraRig sets in `onDown` for the second pointer and clears in `endDrag`, and test it in `inMotion`. Releasing the pinch
then reaches the subscription, which asks for the one settle frame. Add an e2e test on the phone project (a synthetic
two-pointer pinch: stub `setPointerCapture` and dispatch `PointerEvent`s with `pointerType: 'touch'`) that checks `settles`
goes up by exactly 1.

### 2. Important: one extra canvas frame after every wheel zoom, fling or other motion that ends inside a frame

`frontcreck/src/components/map/canvas/MarkerDriver.tsx:145-147` (the store subscription).

CameraRig, and likewise CameraTween and the inset animation, clear their flag inside their own `useFrame`, which runs
before MarkerDriver's (mount order in `Scene.tsx:164-176`). The zustand `set` runs the subscription synchronously. At that
moment `layout.unsettled` is still true and `inMotion` is false, so it calls `invalidate()`. In r3f 9, an `invalidate()`
from inside a `useFrame` sets `internal.frames = 2`, which is one additional frame. MarkerDriver then settles in that same
frame, so the extra frame draws nothing new. Measured against the base build: 0 frames after a wheel zoom on base, 1 on
HEAD, every time. Flings show the same pattern. The ruling allows the one settle frame only where the motion ends outside a
frame (pointerup after a drag, the end of a nudge). The e2e tests miss this because they wait out a quiet period before
they start counting.

**Fix:** defer the check until the current frame has finished, for example
`queueMicrotask(() => { if (work.current?.layout.unsettled && !inMotion(useMapStore.getState())) invalidate(); })`. After
the r3f rAF callback has run, a layout that settled in the frame is no longer `unsettled`. Add a test like my probe: count
the frames after `isAnimating()` turns false following `page.mouse.wheel` with a focus open, and expect 0.

### 3. Important: the wall-held ride is less steady than both a fresh solve and the old layout (phone, worst album)

`frontcreck/src/components/map/state/focusLayout.ts:489-506` (`carry`, then `separateAtWalls`).

The ruling put steadiness ahead of exactness. When a pan or drag pushes the group into the walls, each frame re-carries the
*unbounded* rule solution (`free`), clamps every marker to the wall on its own (`shiftInside`), and then runs the plain box
separation from that collapsed state. Box separation is order-dependent and not continuous, so a small change in the input
can produce a very different arrangement. On the phone's worst album (3278, balanced), panning 8 px per frame towards a
corner, the cover-jump row reads: now **max 340.8 px** (p99 190), against 225.9 px for a fresh solve every frame. The base
build's `layoutMarkers` stays under 30 px on every frame of the same sequence. My probe gave per-frame jumps of 56, 75, 116,
190 and 341 px, all on the `moves` path and none through the `relaxHeld` fallback. The random-sample rows show no such
jumps, so this needs a crowded group pressed against a wall, but that is the case the "wall-held drags" ruling was written
for.

**Fix:** while carried and held, carry from the *previous frame's* positions, moved by the seed's delta (or by the group's
clamped rigid shift), instead of from `free`, and then run `separateAtWalls`. That way each frame starts from the arrangement
just drawn. Another option: move the whole group as one rigid body and stop it at the wall (clamp the shift, not each
marker), and fall back to per-marker holding only when the group is larger than the bounds along that axis. Add a
MarkerLayout unit test that bounds the frame-to-frame jump on a held pan (for example, at most the pan step plus a few px).

### 4. Minor: hit-testing and the hover label use the settled positions while the covers ease

`MarkerDriver.tsx:245-253` and `:255-268`. `setPlacedMarkers(drawn)` and the tooltip use `placed` (the target), while the
DOM shows `w.settle.now`. For up to 180 ms, a click or hover can hit where a cover is going rather than where it is drawn.
The ease's rAF `step` does not update the hit boxes. **Fix:** in `step`, also update the x and y of the published placed
markers, or have hit-testing read the same `now` array. The other option is to accept and document it, since the window is
only 180 ms.

### 5. Minor: the effect cleanup cancels the ease's rAF but leaves `w.settle` set

`MarkerDriver.tsx:165-170`. If the effect runs again while the driver instance survives (React StrictMode in dev, or a new
`invalidate` identity), `w.settle` stays non-null with a cancelled rAF. Every later frame then writes the frozen `now`
positions until the layout's version changes. **Fix:** set `work.current.settle = null` after `cancelAnimationFrame`.

### 6. Minor: a few small allocations on every frame remain in the driver, and one comment is wrong

`MarkerDriver.tsx:121-122`. `tweenTarget` builds the 8-element `fresh` array and a `some` closure on **every** frame while a
camera tween runs, not "only then" as the doc comment at `:103-105` says. Other per-frame allocations: the options object
at `:216`, the `drawn` array and spread objects at `:245-249`, the `NodeList` and `rank` closure in `writeMarkers`, and
`worldToScreen` results. The last few were already in the base code. They cost little next to the solve that was removed.
**Fix:** compare the target in place against the stored array, and correct the comment. The rest is optional.

### 7. Minor: the `__rmr.markerLayout` test hook is installed in production and is not removed on unmount

`MarkerDriver.tsx:149-164`. `window.__rmr` always exists (`lib/store.ts:92`), so the hook is installed in production. It
costs nothing per frame and runs `layoutMarkers` only when called, which meets the requirement. After the Scene unmounts,
it still reads the old `work` ref. **Fix (optional):** delete it in the cleanup.

### 8. Minor: `layout-cost.mjs` does not flag the regression in finding 3

`frontcreck/scripts/perf/layout-cost.mjs:236-240` prints the jump rows but does not compare "now" with the old file's
layout. The phone `pan (worst album)` row, where "now" is worse than "fresh", is easy to miss. **Fix (optional):** also
compute the jump rows for each `--old` file, and mark any row where "now" exceeds the best older value.

## Things that are right (no action)

- **Motion detection:** `animating`, `rigMoving`, `morphing`, `nudging`, `dragging`, the pending morph (`sliderT` not at its
  stop) and the sliding panel (`insetCurrent`) are all covered. Pinch is the one gap (finding 1). `nudging` never applies
  with a focus open (`CameraBounds.tsx:90`).
- **Settle paths:** after a tween, the panel and a morph, the settle happens in the frame where the flag clears, because
  those producers run first in the frame. CameraTween's own end-of-tween `invalidate()` was already there. Pointerup with
  no fling gives the single settle frame (measured). A fling or wheel zoom settles in its last frame, plus the extra frame
  from finding 2. I found no path where a layout stays unsettled at rest: every flag that ends motion is a store write, and
  the subscription catches it.
- **The ease:** it is DOM only, never calls `invalidate`, stops after 180 ms (`p >= 1`), and is cancelled when the
  version changes, when the focus closes (`:180-183`) and on unmount. Reduced motion skips it.
- **Album close or change:** `w.focus` resets on close. A new focus or a new set of ids gives a fresh solve. The 300 ms
  retarget window re-solves for the target only while the opening is in progress, and later reframings settle.
- **Pointer moves:** the only new work on the pointer-move path is the subscription's check, a few boolean tests that
  usually stop at `unsettled`.
- **New contract tests:** they are meaningful: exact reuse in place, rigidity or wall contact, settling to a fresh solve,
  landing on the target with nothing to settle, re-solving on retarget, and 0 frames at rest in e2e. None of them covers
  steadiness at the walls (finding 3) or a pinch (finding 1).
