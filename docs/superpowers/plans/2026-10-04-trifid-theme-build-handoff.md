# Trifid theme build: handoff after part 1

Written 2026-10-05 by the session that revised the plan, captured the baseline and built part 1. Read this before the three plan parts. Where this note and a plan part disagree, this note wins, because it records what happened after the parts were written.

Branch `feat/trifid-theme` (draft PR 47, stacked on draft PR 32). Tracking issue 45, on the board as In progress.

## State

| Piece | State |
|---|---|
| Plan parts 1 to 3 revised to the 2026-10-04 decisions and cross-checked | Done |
| Baseline of today's site (`docs/design/trifid-theme/reviews/baseline/`) | Done |
| Part 1, tasks 1 to 6 (theme data, bake, gas shader, `GasField`, browser checks) | Built and reviewed. See "Part 1 closing" below for the last open items |
| Part 2 (stars, lines, names, toggle, twinkle), 9 tasks plus one new task | Not started |
| Part 3 (glass, header, ring casing, phone, Home, tests, favicon, perf, review panel, docs), 11 tasks | Not started |

### Part 1 closing

**Update, 2026-10-05: the original session on the owner's laptop is finishing this. Other sessions must not redo it.** Parts 2 and 3 were started as cloud sessions before the closing pass ended. They proceed with their own steps and leave part 1's open list alone. Two sessions push to this branch, so fetch and rebase before every push and never force push. The original session only touches `docs/design/trifid-theme/reviews/`, this note, the part 1 ledger, and at most a last small gas fix in `GasField.tsx`, `shaders/gas.ts` or `e2e/gas.spec.ts`.

**Cloud sessions and speed.** The baseline and every part 1 timing were taken on the owner's M1 Pro with headless Chrome on the real GPU. A cloud machine very likely has no GPU and a different CPU, so its numbers cannot be compared with the baseline and the GPU rows may not be measurable there. In the cloud, compare old and new builds in turn for relative cost and say so. The comparison against the baseline, the hover measure and real GPU captures for parts 2 and 3 still have to be run on the laptop before the owner is shown a final result.

The last pass (minor fixes from the final review, the perf write-up recomputed from the raw files, the full browser suite on all three projects, cleanup) was in flight when this note was written. Its result is in `docs/design/trifid-theme/reviews/app-perf-part1.md` (headline section) and in the part 1 ledger copied to `docs/superpowers/plans/2026-10-04-trifid-theme-ledger-part1.md`. If the ledger's last lines do not say "Task 6: complete", finish that first: the open list is at the end of the ledger.

## Rules that changed since the plan parts were written

* **Push after each verified task.** The plan parts say "commit, do not push" at every commit step. That is withdrawn. The owner said on 2026-10-05 that Vercel previews do not need his go-ahead; only merging does, after he has checked the preview. Push to `feat/trifid-theme` after each task passes its review.
* **The map opens on the Overview.** `/map` opens at the approved Overview framing (gas filling the screen, as in `final-overview.jpg`; the prototype's default), and the fit button gives the Whole map. Today's site opens on the whole cloud. This is a new task at the start of part 2, before the names layout: the default camera fit, every framing test, the perf script's assumptions about the opening view, and the capture script. The owner was told and has not objected; it is one constant to reverse.
* **Home follows `final-home.jpg`.** The plan's `GAS_DIMMED_STRENGTH = 0.6` has no counterpart in the prototype and leaves Home about half as bright as approved. Part 3 task 6 sets it to match the picture, reproduces the prototype's uneven veil, and holds text contrast with the pads. Part 3's contrast table for Home must be recomputed.
* **Judging speed.** Median of three runs against the budget and against the baseline's median and spread; any single run over budget explained. On this machine the only trustworthy comparison is old and new builds run in turn in the same session (other sessions keep the load between 5 and 15). Mains power only: on battery under 20 percent Chrome caps pages at 30 frames a second.

## What part 1 built that parts 2 and 3 do not know about

The plan parts were written against part 1 as planned, not as built. Before starting part 2, have a subagent reconcile parts 2 and 3 with the real code (names, paths, flags), then have a second one check the result. The differences:

* `GasField` lives at `frontcreck/src/components/map/canvas/GasField.tsx`.
* `theme.json` is version 3: per stop bake rectangle, image sizes and content hashes. Gas images are `gas-<stop>.<hash>.webp` and `gas-<stop>-sharp.<hash>.webp`. Anything that names a gas file must read the name from `theme.json`.
* A sharper image per stop is fetched at idle by ordinary desktops and laptops only, uploaded in strips, and faded in over a fifth of a second. Flag: `window.__rmr.gasSharp`. Phones, tablets and software renderers never fetch it.
* Software renderers draw the gas with a lighter shader (`GAS_LITE`). The test browser is software, so `e2e/gas.spec.ts` forces the full shader; capture scripts ask for the full shader by name. New browser tests that read gas pixels must do the same.
* No gas upload happens inside a gesture. `GasField` tracks pointer and wheel activity at window level. The twinkle (2.8) and the names layer (2.7) must not add work to the pointer move path.
* The fade to the sharper image draws up to 14 frames about a second after the map settles. Tests that assert "no frames at rest" must wait for `gasSharp` to settle first, as the gas spec does.
* The perf script has new reported rows (deep zoom drag, deep zoom between stops, nebula visible, a dpr 2 desktop column) and a `--gas-lite` flag. Budgets and budget checks are unchanged.
* First-load JS is 191.2 KB of 200 KB. The lazy map chunk is where new code goes.
* One existing browser test is red on purpose until part 3 task 7 rewrites it: the picked cover check in `e2e/explore.spec.ts`.

## Acceptance list inherited by parts 2 and 3

The independent fidelity reviewer found these weak or unreadable on bright gas with today's marks. Stars, cased lines and glass are the planned fixes; each item must be checked again on the brightest cream gas when the task that owns it is reviewed.

* Neighbour lines beside an open album (2.4).
* The hint line at the bottom of the map (3.2).
* The hover ring on a dot (2.2, 3.4).
* Warm dots on cream and rust, and the 45 percent dots beside an album (2.2).
* Cross-fade tiles at about 23 px (2.2). The tile colour is now each album's star colour; nobody has seen it rendered. Show the owner first.
* Half transparent covers around a picked album (2.2).
* Fine as they are: full covers at 32 px and over, the picked cover and its frame, the hover square on a cover, badges.

Today's handling of overlapping covers (the 16 to 32 px cross-fade band of soft, tinted, slightly see-through tiles, and 50 percent alpha around a pick) is what the owner called "a nice blur effect". It must survive 2.2. Baseline crops: `baseline/shots/desktop/retina-map-covers-dense-fade-crop.png`, `selected-dense-crop.png`.

## Rulings made on the owner's behalf

Each is reversible; the cost if wrong is stated.

1. Perf is judged on the median of three runs against budget and baseline. Cost: a real regression hidden as noise.
2. Twinkle with an album open and on Home follows the prototype. Cost: one condition.
3. Cross-fade tile colour is the album's star colour. Cost: the owner may dislike pale tiles.
4. Phone is fully solid, header included. Cost: one value.
5. The gas image of the stop on screen loads first, the others at idle. Cost: none seen.
6. A reported dpr 2 perf column, measured on today's site too. Cost: run time.
7. The focus ring on the map gets a dark casing (3.4); the toast gets a safe area inset (3.2); `theme.json` is guarded under 80 KB; solid panels wherever blur is off; the Home shelf gets a scrim behind it for contrast; manual checklist probes go to the regression reviewer (3.10) and the owner's trial (3.11); `capture.mjs` gets a still mode in 2.9.
8. Decoded gas images are freed after upload and fetched again after a lost WebGL context. Cost: a brief gap in the gas after a context restore.
9. The map opens on the Overview. Cost: one constant; changes today's first view.
10. Home follows `final-home.jpg`. Cost: part 3's Home contrast table is recomputed.
11. Screens at dpr 2 keep the sharper gas, crisper than the prototype's own stretched picture. Cost: half a mip level of bias reverts it.
12. The first gas image is 327 KB at quality 93, up from 188 KB. Cost: download size on first map visit.
13. Touch screen laptops get the sharper image. Cost: a tablet with a trackpad may spend about 60 MB more GPU memory.
14. Software renderers get the lighter gas shader. Cost: slightly less glow and detail on machines with no GPU acceleration.
15. The sharper image fades in over 200 ms. Cost: up to 14 bounded frames at the swap.

## Waiting for the owner (none blocks the build)

* The screen reader label of the names button. Proposed: "Place names", with an on or off state.
* The wording of the theme section in `frontcreck/README.md`.
* Confirming the Overview as the opening view.
* About 55 MB of review screenshots are committed under `docs/design/trifid-theme/reviews/`. Prune before merge, or keep.
* On a real phone zoomed in to album scale the gas is softer than `final-phone-map.jpg` in its thinnest lines, because phones keep the first image only. Raising it would break the phone memory cap.

## Nobody has seen

Safari and Firefox (the gas decode option and the strip upload have only run in Chromium), a real phone, a GPU weaker than an M1 Pro, the fade and the slider morph in motion.

## Working method that held up

* One fresh implementer per task, then a fresh reviewer, using `superpowers:subagent-driven-development`. Reviewers found real defects in every large task; never skip them.
* An independent fidelity reviewer who compares stills with the approved pictures and with the prototype at the same framing, and who looks again after each fix. Its first look found the missing fine swirl that the builder's own numbers had hidden.
* Ask for the instrumenting script to be saved with every timing claim. Earlier rounds did not, and those claims now rest on reports alone.
* Tell agents to commit each finished piece, to wait on their own background jobs before handing back, and to capture failing test names to a file. Agents stalled or handed back early when the machine was busy.
* Machine: arm64 Node 22.23.3 (`export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"`), Playwright with `--workers=1`, one browser at a time, everything serial, mains power for timing.
