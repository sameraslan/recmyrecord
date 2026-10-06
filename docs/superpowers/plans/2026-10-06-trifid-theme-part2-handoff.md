# Trifid theme: handoff after part 2 tasks 0 to 5 (2026-10-06)

Read this first, after the build handoff (`2026-10-04-trifid-theme-build-handoff.md`). Where they disagree, this note wins for part 2 and part 3 work from here on.

## Where things stand

Branch `feat/trifid-theme` (draft PR 47, stacked on PR 32), issue 45.

| Task | What | State |
|---|---|---|
| Part 1 | Theme data and gas | Complete (its own ledger) |
| 2.0 | `/map` opens at the Overview; fit button and `0` give the Whole map | Complete |
| 2.0b | `waitForMapQuiet` / `waitForGasSharpSettled` measure a fresh window per call; `{ since: await mapFrames(page) }` | Complete |
| 2.1 | Random star classes, tints, attributes | Complete |
| 2.2 | Stars in the album draw | Complete. Owner has two open tile questions (below) |
| 2.3 | Cover layout off the lines, plus a steady, cheap per-frame design | Complete |
| 2.5 | Region names layout (pure) | Complete |
| 2.6 | Names toggle | Built, NOT reviewed, NOT on the branch: `wip/2026-10-06-part2-task6-names-toggle.patch` (applies cleanly with `git am`). See "Task 6" below |
| 2.4 | White cased lines, frames, badges | Not started. Touches `MarkerDriver.tsx`, which Task 3 rewrote: read Task 3's review first |
| 2.7 | Region names layer | Not started (needs 5, and 6 for the flag) |
| 2.8 | Twinkle | Not started. Reuse `waitForGasSharpSettled` from helpers.ts, don't redefine |
| 2.9 | End-to-end checks, baseline comparison, perf, fidelity | Not started |
| Part 3 | 11 tasks | Not started. Read `2026-10-05-trifid-theme-part3-reconcile-notes.md` and Task 0's Downstream list first |

Ledger with every decision and number: `2026-10-05-trifid-theme-ledger-part2.md`. Reviews: `reviews/`.

## Owner's direction (2026-10-06)

- The core goal is a really smooth UI and UX. Speed is a big part of that, but do not compromise the feel, which is already good. Motion changes need his eye on the preview.
- He finds the pace too slow. Go faster:
  - Run independent tasks in parallel, in git worktrees.
  - For small or pure tasks, use one review and only the affected specs.
  - Keep full review rounds and the full suite for risky tasks: drawing, motion, speed, first-load. Run the full suite once per task, at the end.
  - Log minor findings for Task 9 instead of looping on them.

## Rulings made in part 2 (all reversible)

- **Opening framing and Home.**
  - `/map` opens at the Overview. Home glides back to the Whole map on any arrival while the camera is still untouched; leaving during the opening glide counts as untouched.
  - The fit button keeps its "Reset view" label. This is pending the owner, since it no longer returns to the opening view.
  - The opening-view perf rows are reported only. The budgeted rows are still measured at the Whole map, after a reload with `__rmrOpen = 'whole'`.
- **Task 3 per-frame design, chosen because steadiness matters more than matching a fresh solve; the layout has several fixed points, and a fresh solve per frame jumps hundreds of px.**
  - A fresh solve runs only when the input set changes. An album open is solved at the camera tween's target view, so no ease runs at the end of an open.
  - A pan with no wall contact moves the existing layout as an exact translation.
  - During any motion, including pinch (the `pinching` flag), the group rides rigidly with the seed. Wall-held drags carry the layout from where it was drawn and separate the boxes at the walls.
  - One fresh solve runs when the motion ends, with a 180 ms ease on the DOM only. The ease is skipped under reduced motion, and it never adds canvas frames at rest.
- **Tiles and keyline.** Cross-fade tiles take the star colour, and the keyline stays as in the plan and prototype, until the owner answers.

## Open owner questions

1. **Tile colour:** star colour (now) or today's cluster colour.
2. **The thin dark rim on 16 to 32 px tiles:** keep it, or use `0.9 * smoothstep(0.6, 1.0, v_coverT)`, which gives no rim below about 25 px. Pairs are in `docs/design/trifid-theme/reviews/app-part2/`.
3. **The names button's label:** "Place names", with an on/off state. It is marked pending in `copy.ts` by the Task 6 patch.
4. **The "Reset view" label** on the fit button.
5. **The README theme section wording,** and pruning about 55 MB of review images before merge.

## Task 6: what the next session must do

- Apply the patch: `git am docs/superpowers/plans/wip/2026-10-06-part2-task6-names-toggle.patch`. Then delete the `wip/` file in the same push.
- **First-load JS must come down.** It is 191.2 KB before the patch and 192.1 KB after (+0.94 KB):
  - +0.61 KB is the router chunk split again. `NamesToggle` lands in the MapStage chunk and pushes it past the split point. This is the same split Task 0 hit; see `reviews/task0-code-review.md` for the about 20,000-byte trigger.
  - +0.33 KB is store, copy and icons.
  - Find a placement that keeps option B's look, Tab order and 44 px phone target without the split. One option is a tiny shell in MapStage's chunk with the logic lazy-loaded.
- `focus.spec.ts:322` measures the `.map-zoom` box, which is now 48 px taller on phone. Run focus.spec.
- Then review it as usual.

## Carried findings (fix in the owning task, or in Task 9)

- **Task 3:**
  - In bounds too small for any clean solve (phone landscape 828x209, or 150x150), the wall fallback re-solves on many moving frames. It averages 0.46 to 1.2 ms per frame, the worst frame is 21 to 30 ms, and it allocates. Fix: remember when the last solve was itself crowded and skip the fallback while that holds. This is speed: treat it as Important, for Task 4 or before.
  - Laptop checks still owed: phone wall-held pans, the settle frame (up to about 3 ms here), and the `/album/<slug>` open when the panel inset arrives more than 300 ms late.
- **Task 5:**
  - `scripts/perf/names-cost.cjs` writes its bundle into `scripts/perf/`; use `os.tmpdir()`.
  - Names are sized against 12.5 px covers rather than each stop's own Overview zoom, so strong names show at 20 to 20.5 px instead of 21.1 at Balanced and Sonic. Judge this in Task 9.
  - The chrome-clearance test should assert that at least one name is placed.
  - Cap the `taken` buffer and add a "not reentrant" comment.
- **Task 2:**
  - Small stars are faint on the brightest cream. Recheck on `--still` captures.
  - A hovered star loses its glow; this is by plan.
  - Read the deep-zoom slider perf row as a median of several runs. It is noisy: medians are 159 vs 177 ms on software.
- **Tests:**
  - Phone `touchscreen.tap` can miss under CPU load. Playwright's touchStart and touchEnd can arrive more than 500 ms apart, which is longer than `TOUCH_MAX_MS`. Proposed fix: a test-side `tapAt` helper that re-taps only when the gap is over 500 ms. Keep `TOUCH_MAX_MS` as it is.
  - helpers.ts docstring: `since` must be read in the same document.
  - Task 9 step 9: port the per-call token, the barrier and `since` into the baseline `capture.mjs` `mapQuiet` / `sharpSettled`.
- **Known red:**
  - Red on purpose: `explore.spec.ts:295`, both projects, until part 3 rewrites it. It now fails at `isLamp`.
  - Cloud only, because i.scdn.co is blocked: `pages.spec:60` on both projects and `search.spec:215` on desktop.
  - Software-renderer noise, record and don't weaken: the two gas.spec frame-gap tests.
  - Flaky: `flows.spec:118` on desktop, and the `SearchBox` 5 ms unit test.

## Running checks in a cloud container

`2026-10-06-trifid-cloud-env.md` has the Playwright browser symlinks, the Chrome shim for perf and the commands. Cloud timings compare old and new builds only; never compare them with the laptop baseline. The laptop runs are still owed for every part: the perf comparison against the baseline, the hover measure, and real GPU captures.

## MapStage size trap

`frontcreck/src/components/map/MapStage.tsx` must stay under about 20,000 bytes of source (19,936 now), or a Next router chunk splits and adds 0.6 KB to first-load JS. Re-measure first-load JS after any change in MapStage's chunk.
