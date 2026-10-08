# Part 2 Task 3 carry: review of 19b42fef (no re-solve on moving frames in crowded bounds)

Reviewed: `git diff 3d8ee1f4..19b42fef` in `wt-carry` (`focusLayout.ts`, its test, `scripts/perf/layout-cost.mjs`).
Read-only review. No builds, no browser. Evidence is the source, the unit test file (46 pass here), and throwaway
pure-Node scripts in a scratch directory that load the old file (`3d8ee1f4`) and the new one side by side through
jiti, under `nice`, on arm64 Node 22. Counts below are exact; I quote no timings as evidence (not on mains).

## Verdicts

- **Spec: MET for the case asked (a pan, zoom or pinch in fixed crowded bounds), with one gap (finding 1).** A moving
  frame cannot solve or return a new array on any path: the only solves left are a new input set, the tween target,
  and the settle. The settle is one solve. Views with room are unchanged by construction.
- **Quality: APPROVED WITH ONE IMPORTANT FIX.** The state machine is small and right for fixed walls. It is wrong
  when the walls move while the flag is set, which no test or probe covers.

## What I confirmed independently

- **Solve counts, old against new, on the committed pan** (same seeds as the tests): old 6000 / 2425 / 298 / 0 / 21
  moving-frame solves at 150x150 / 250x200 / 828x209 / 360x684 / 300x500; new 0 in all five. This matches the
  report's table exactly, so tests 1 and 2 do fail on the old code for the right reason in four of five bounds
  (360x684 passes on both, as reported).
- **Keyboard pan at rest in 150x150:** old `{solves: 2, settles: 0}`, no `settledFrom`; new
  `{solves: 1, settles: 1}`, `settledFrom` set. Matches the report.
- **Uncrowded is the same by construction, not only by sampling.** While `crowded` is false the carried branch runs
  the old expression to the letter (`shiftInside(items, bounds)` with `whole` false gives the old formula, then
  `(held || overlapping) && !separateAtWalls`). The code only departs from the old path at the two points where the
  old code went on to `relaxHeld` and `carrySolve`. So "uncrowded" means exactly: no solve that was held by the walls
  left an overlap, and no carried separation failed. Differential fuzz, clean openings only, pan / zoom / pan and
  zoom / rest segments, fixed bounds, 5,521 sequences and 1,228,104 frames: **0 differing frames** at 360x684,
  374x663, 776x884 and 1424x884. All 77 diverging sequences were at 250x200, 828x209 and one at 300x500, each after
  a settle whose own solve was crowded. The flag was never set on a carried frame when the bounds did not change.
- **Nothing outside the walls** in any run (0 markers outside, over about 1.9 million frames).
- **Test file is additions only:** numstat 131 added, 0 removed. No existing assertion touched.
- **No test-only counter in production.** The tests use the existing `stats`. The temporary counter the report
  mentions is not in the diff.
- **Dead code:** none. `relaxHeld` is still used by `solve` and `layoutMarkers`. The `if (bounds)` guard in the
  crowded branch is needed (the flag can be set with no walls).

## Findings

### 1. Important: when the walls move while `crowded` is set, covers are flattened onto each other and onto the picked cover, and stay overlapped after the walls open again

`frontcreck/src/components/map/state/focusLayout.ts:526-528` (the `if (this.crowded)` branch) and `:300-323`
(`shiftInside` with `whole`).

The flag means "the separation failed inside *these* walls", but it is never tied to the walls. Once set it holds for
the rest of the motion whatever the bounds do. In that state the only wall handling is `shiftInside(..., true)`, which
clamps each marker to the wall on its own. So:

- Walls that keep closing press the group flat a few px per frame, with no separation at all.
- Walls that open again leave the overlaps in place although there is now room.

Counter-example (scratch probe, 11 markers, 200 clusters that open clean at 828x400, bottom wall rising 4 px a frame
to 209 and back, all frames `moving`):

| | Frames with one cover over another | Frames with a cover over the picked cover | Deepest cover over cover | Deepest over the picked cover | Frames too close while the walls reopen | Solves | New arrays |
|---|---|---|---|---|---|---|---|
| old (3d8ee1f4) | 4 of 19,200 | 0 | 5.8 px | 0 px | 5 of 9,600 | 187 | 187 |
| new (19b42fef) | 5,111 | 2,323 | **46 px** (a cover fully hidden) | **46 px** | 7,379 | 0 | 0 |
| suggested fix | 507 | 113 | 32.2 px | 15 px | 308 | 0 | 0 |

To 150 px high the new code has a cover over the picked cover on 12,040 of 25,200 frames (old 0).

How it is reached in the app: bounds change during motion when the album panel inset slides
(`insetCurrent !== input.insetLeft` counts as motion), when the inset arrives late after an album open (the laptop
check still owed in the handoff), and on a rotation or window resize during a tween, fling or morph. On a 1440 desktop
the bounds stay roomy, so this needs a small window or a sideways phone. It always ends at the settle (rest gap to a
cold solve 0 in every run). So it is transient and narrow, but it breaks "covers stay legible" and the ruled line
"wall-held drags ... separate the boxes at the walls", and it is the one place where the new code is clearly worse
than the old for the visitor.

It also contradicts the test title "never squeezed": true only for fixed walls.

**Fix (prototyped in scratch, not in the repo):** tie the flag to the walls it failed in. Keep a copy of the bounds
when the flag is set (in `solve` and on the carried frame). In the carried branch take the rigid path only when
`crowded` and the bounds equal that copy (four compares); otherwise clear the flag and run the old line
(`shiftInside` then `separateAtWalls`), setting the flag and the copy again if it fails. `separateAtWalls` is not a
solve and allocates nothing, so the requirement still holds. With this change: 0 solves and 0 new arrays in the
moving-wall probe, the committed pan is identical to 19b42fef to the bit in all five bounds (gap 0, 0 solves, 0 new
arrays), and the overlap numbers are the "suggested fix" row above. Cost: the separation runs once per frame only on
frames where the walls actually moved. Add a unit test: clean opening, walls close in over N moving frames and open
again; assert `solves` 1, same array, nothing outside, and a cap on cover over the seed.

### 2. Minor: the flag is not restored when a tween lands back on the solved view

`focusLayout.ts:499-511` (the `atSolved` branch). An album open solves the target view (flag false if it is clean),
then a carried frame on the way can set the flag (start walls tighter than the target's). Landing restores the
solved, clean layout but leaves `crowded` true. Reproduced 399 of 399 times in a contrived start view. It is harmless
while the bounds stay fixed (a group that fits is shifted the same way by either path), and it turns into finding 1
if the walls then move. **Fix:** keep the solve's own value (`solvedCrowded`) and assign it in the `atSolved` branch;
with the fix for finding 1 the two together close every way the flag can outlive its cause.

### 3. Minor: tests do not cover the flag's other transitions

`focusLayout.test.ts:454-583`. The 11 tests are meaningful: they assert solve and settle counts, array and object
identity, bounds, and the settle against a cold solve, never timing. Missing:

- moving walls while crowded (finding 1);
- a zoom or pinch in crowded bounds (the ride branch with the flag set; only pans are tested);
- an album open with `target` into crowded bounds (lands with no settle, flag from the target solve);
- the flag clearing: after a settle in bounds that now have room, a pan must match the old behaviour again.

The keyboard-pan test (`:572-582`) covers the reported behaviour change, but only checks `settledFrom` is not null.
**Fix:** also assert `settledFrom` equals the carried positions and that they are inside the bounds, as test 2 does.

### 4. Minor: the pinned crowd counts in test 3 are solver snapshots

`focusLayout.test.ts:541-543` pins 20 / 20 / 13 / 0 crowded clusters. Any later solver improvement (the report's own
Minor 1) will break these for a good reason. **Fix:** say so in a comment on those lines, or loosen to "at least one
at 828x209, none at 360x684" in the task that changes the solver, not here.

### 5. Minor: `layout-cost.mjs --crowded` only pans in fixed bounds

`scripts/perf/layout-cost.mjs:82-177`. The method is sound for what it measures: counts come from `stats.solves` and
array identity (exact, machine independent, and I reproduced the old column with my own harness), times keep the
fastest of 3 runs per frame, pair and overlap columns are computed on the first run only. Limits: a 1 microsecond call
timed with one `performance.now()` pair is at the timer's floor, so the "mean per frame" after column is indicative
only (the report says so); and the probe has no zoom and no moving walls, so it cannot show finding 1. The real-album
before and after tables in the report come from a script that was not committed, so the sideways-phone numbers cannot
be re-run. **Fix:** add a moving-wall case to `--crowded` (walls close and reopen), and either commit the real-album
comparison or drop its numbers from the record.

### 6. Minor: commit trailer

`19b42fef` carries a `Claude-Session:` line. RULES.md says not to copy it; the report says the opposite. **Fix:**
reword the commit message before it is merged (the orchestrator's call; nothing is pushed).

### 7. Minor (existing, not from this change): `shiftInside` still builds a closure per call

`focusLayout.ts:312`. The doc comment says "Allocates nothing". It now also captures `whole`. The tests assert array
identity, not allocation. **Fix (optional):** inline the two `shift` calls or lift the function out with `whole` as
an argument.

## Answers to the seven points

1. **State machine.** Set: end of a solve that was held and still overlaps; a carried frame whose separation fails.
   Cleared: every solve (new input set, target, settle). A rotation or slider resize at rest settles, so it clears.
   A different album clears. A pinch does not change the group (it rides rigidly), so the flag is still right. It
   sticks wrongly in two ways: the walls move during the motion (finding 1), and a tween lands on a clean solved
   view (finding 2). Covers never leave the walls. Covers can end up over the picked cover only through finding 1.
2. **Uncrowded as before.** True by construction, under the definition above; fuzz found no counter-example in
   fixed roomy bounds. The counter-example class is moving walls.
3. **Keyboard pan at rest in a crowded view.** Right: it now follows the documented rule ("a frame at rest that
   changes the view settles at once") instead of a silent jump counted as a solve, and reduced motion is still
   honoured by the driver. Covered by one test, which should assert a little more (finding 3).
4. **The trade.** See below.
5. **Tests.** Meaningful, count-based, additions only, nothing weakened. Gaps in finding 3.
6. **Test-only counter.** None added.
7. **Probe.** Sound for fixed-bounds pans; gaps in finding 5.

## Judgement on the trade (point 4)

In fixed crowded bounds the trade is right: the covers ride exactly as they stood at rest, so a drag shows nothing
worse than the visitor already saw before touching the map, and the old "clean-ups" were full solves that threw covers
127 to 249 px in one frame, which is the opposite of smooth. There is no cheap way to get both on a moving frame:
the old clean layouts came only from a fresh solve of a view a few px away, the cheap separation fails by definition
where the flag is set, and a re-solve on a pause mid-drag would jump under the finger and still leaves pairs too
close in about half of the sideways openings. The existing settle is already the one bounded re-solve. The remaining
legibility problem is the solver's rest result in short wide bounds (pairs closer than 10 px at rest), which should
be its own task. The part of the trade that is not acceptable is finding 1, and that one does have a cheap fix.
