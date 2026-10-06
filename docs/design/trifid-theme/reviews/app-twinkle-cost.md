# What the star twinkle costs in the app (part 2, Task 8)

- Date: 2026-10-06, 03:00 to 06:50 local.
- Code: the commit that adds this file, on top of `17be7b55` (`feat/trifid-theme`).
- Machine: Apple M1 Pro, 16 GB, macOS 14.5, on mains power. Google Chrome 154.0.8037.98, headless, native arm64.
- The machine was shared with other agents throughout. Load average at the start and end of each run is given;
  it was between 4 and 22 and never quiet. Every timing below should be read with that in mind.
- Command: `node scripts/perf/twinkle-cost.mjs` (the Overview, where `/map` opens) and
  `node scripts/perf/twinkle-cost.mjs --open whole` (the whole-map fit, the framing of the baseline), after
  `npm run build`. Each run: per renderer and viewport, 20 s with glints and 20 s without; on desktop the same
  again with the mouse moving over the map.

## Outcome

**Kept as built where the browser draws on a GPU. Dropped on a software renderer.**

On a GPU (what a visitor's desktop, laptop or phone uses) every rule holds in every run that was made. On a
software renderer (the CPU draws and composites every frame; this is the test browser, and a visitor whose
browser has no GPU acceleration) a glint cost frames of 150 to 700 ms in roughly half the page loads measured.
Neither of the plan's cheaper versions helps there: no flares was measured and still fails, and one glint at a
time lowers how often a glint is on screen but not what one costs. So on a software renderer the app plays no
glints at all (`state/twinkle.ts` `twinkleShown`, read from the gas layer's own renderer test), and the owner
should be told. This is narrower than the plan's last fallback (dropped everywhere): the effect is removed only
where a cost was measured. Dropping it everywhere is two lines (the two mounts) if that is preferred.

One thing is not settled: the very first mouse movement over a freshly loaded map on a GPU. See "Open".

## The rules

| # | Rule | GPU (visitors get glints) | Software renderer (glints forced for the measurement) |
|---|---|---|---|
| 1 | No long task (50 ms or more) starts within 20 ms of a glint being made | Pass: 0 in every run | Pass: 0 in every run |
| 2 | Longest task and longest frame gap with glints at most 8 ms over the run without | Pass in all 8 full runs with the hover warm-up, 4 at each framing; the GPU path was the same code in all of them (see "Open" for the first hover) | **Fail**, repeatedly: see below |
| 3 | A glint takes at most 8 ms to make (`worstSpawnMs`) | Pass: 0.9 to 5 ms | Pass: 0.6 to 4.5 ms |
| 4 | No canvas frame in a still run | Pass: 0 in every run | Pass: 0 in every run |
| 5 | At most 3 alive | Pass: at most 2 seen | Pass: at most 2 seen |

Rules 4 and 5 are deterministic and are also pinned by tests (`e2e/twinkle.spec.ts` "glints play on the resting
map and the canvas does not draw one frame for them"; `twinkle.test.ts` "never has more than 3 glints alive").

## The final runs (this commit)

Opening framing: the Overview (the app's own). Glints on first. Mouse warm-up: 4 s. Load 13.6 before, 4.7 after.

| Renderer | Viewport | Visitors get glints | Run | Glints | Made | Most alive | Longest task (ms) | Long tasks | Long tasks at a glint | Longest frame gap (ms) | Canvas frames | Longest glint write (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| software | desktop | no (forced here) | still | on | 10 | 2 | 0 | 0 | 0 | 718 | 0 | 1.2 |
| software | desktop | no (forced here) | still | off | 0 | 0 | 0 | 0 | 0 | 22 | 0 | 0 |
| software | desktop | no (forced here) | mouse moving | on | 9 | 2 | 0 | 0 | 0 | 104 | 229 | 0.7 |
| software | desktop | no (forced here) | mouse moving | off | 0 | 0 | 0 | 0 | 0 | 75 | 227 | 0 |
| software | phone | no (forced here) | still | on | 9 | 1 | 0 | 0 | 0 | 24 | 0 | 2.4 |
| software | phone | no (forced here) | still | off | 0 | 0 | 0 | 0 | 0 | 23 | 0 | 0 |
| gpu | desktop | yes | still | on | 10 | 2 | 0 | 0 | 0 | 20 | 0 | 1.3 |
| gpu | desktop | yes | still | off | 0 | 0 | 0 | 0 | 0 | 24 | 0 | 0 |
| gpu | desktop | yes | mouse moving | on | 10 | 2 | 0 | 0 | 0 | 23 | 303 | 3.2 |
| gpu | desktop | yes | mouse moving | off | 0 | 0 | 0 | 0 | 0 | 22 | 305 | 0 |
| gpu | phone | yes | still | on | 9 | 2 | 0 | 0 | 0 | 26 | 0 | 1.2 |
| gpu | phone | yes | still | off | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 0 |

The script's verdict: "The glints cost no responsiveness where visitors get them." (exit 0). The gpu phone still
pair differs by 6 ms (26 against 20), inside the rule's 8 ms.

Opening framing: the whole map (`--open whole`). Glints on first. Mouse warm-up: 4 s. Load 4.7 before, 3.9 after.

| Renderer | Viewport | Visitors get glints | Run | Glints | Made | Most alive | Longest task (ms) | Long tasks | Long tasks at a glint | Longest frame gap (ms) | Canvas frames | Longest glint write (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| software | desktop | no (forced here) | still | on | 8 | 2 | 0 | 0 | 0 | 394 | 0 | 4.4 |
| software | desktop | no (forced here) | still | off | 0 | 0 | 0 | 0 | 0 | 27 | 0 | 0 |
| software | desktop | no (forced here) | mouse moving | on | 8 | 2 | 0 | 0 | 0 | 120 | 178 | 0.9 |
| software | desktop | no (forced here) | mouse moving | off | 0 | 0 | 0 | 0 | 0 | 192 | 178 | 0 |
| software | phone | no (forced here) | still | on | 9 | 1 | 0 | 0 | 0 | 21 | 0 | 4.5 |
| software | phone | no (forced here) | still | off | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 0 |
| gpu | desktop | yes | still | on | 9 | 2 | 0 | 0 | 0 | 21 | 0 | 1.5 |
| gpu | desktop | yes | still | off | 0 | 0 | 0 | 0 | 0 | 22 | 0 | 0 |
| gpu | desktop | yes | mouse moving | on | 10 | 2 | 0 | 0 | 0 | 23 | 269 | 2.7 |
| gpu | desktop | yes | mouse moving | off | 0 | 0 | 0 | 0 | 0 | 21 | 269 | 0 |
| gpu | phone | yes | still | on | 10 | 2 | 0 | 0 | 0 | 22 | 0 | 1.2 |
| gpu | phone | yes | still | off | 0 | 0 | 0 | 0 | 0 | 22 | 0 | 0 |

Verdict: exit 0, same line.

In these runs the software rows are made with the glints forced by the switch (`window.__rmrTwinkle = 'on'`), so
the reason for dropping them there stays measurable. A page loaded with no switch on the software renderer made
0 glints before the switch was set (the script checks it, and so does `e2e/twinkle.spec.ts` "on a software
renderer there are no glints unless the switch says on").

## What was found on the software renderer

Software desktop, glints on, every session made (1440 x 900). "Stall" is a frame gap of 145 ms or more in a run
with glints that the paired run without did not have.

| Build | Sessions | Sessions with a stall | Stalls seen (ms) |
|---|---|---|---|
| As the plan wrote it (flares) | 10 | 8 | 380, 402, 388, 406, 186, 185, 381, 308, 383 |
| Flares hidden by an injected rule (`--no-flares`) | 4 | 0 | none |
| The flare's upright line drawn without `rotate(90deg)` (tried, not kept) | 5 | 2 | 164, 390 |
| No flares on a software renderer, built into the app (tried, not kept) | 6 | 3 | 145, 606, 388 |
| Final: glints forced on software | 2 | 2 | 718, 394 |

Without glints the same runs had: still 18 to 27 ms in all 27 sessions; mouse moving 74 to 192 ms, and one 384 ms
on a first hover with no warm-up.

What the numbers say:
- The stalls are real and they come with the glints: in still runs, 6 of 27 sessions had a 300 to 720 ms frame
  with glints on and none had one with glints off.
- No long task goes with them. The main thread is idle; the frame is late in the compositor. Where the script
  recorded the moment, exactly one glint was alive, at any point of its life (0, 59, 726, 764 ms after it was made).
- Flares are not the cause. The four clean sessions with `--no-flares` were chance: the same thing built into
  the app stalled in 3 of 6. So the plan's first fallback (no flares) does not pass, and was not kept.
- The second fallback (one glint at a time, every 2.5 to 5 s) was not built: every recorded stall had a single
  glint alive, so the cap is not what is exceeded. It would make a stall rarer, not remove it.
- The likely mechanism, not proven: a glint is a compositor animation, so for its 1.2 to 1.8 s the compositor
  makes a frame at every screen refresh, and on a software renderer each of those is the whole 1440 x 900 page
  composited on the CPU, beside the map's own software draws. The phone viewport (390 x 844) never stalled.
- The 8 ms allowance of rule 2 is narrower than this renderer's own spread: two identical runs without glints
  with the mouse moving differed by up to 118 ms (74 to 192).

## Open: the first mouse movement on a GPU

The first time the mouse moves over a freshly loaded map, one frame is long whatever the glints do (the
prototype's README records the same for the prototype). The script therefore moves the mouse for 4 s before the
two measured mouse runs; without that, whichever run comes first is charged for it. With the warm-up the GPU
passes every time. Without it (`--no-warmup`, gpu desktop only), longest frame gap in the first mouse run:

| First run | Sessions | Longest frame gap in that first run (ms) | In the second run (ms) |
|---|---|---|---|
| Glints on | 5 | 70, 74, 58, 48, 65 (two of them with one long task of 52 and 59 ms, not at a glint) | 21, 22, 24, 27, 30 (off) |
| Glints off | 4 | 25, 29, 21, 67 | 23, 27, 22, 23 (on) |

So the first hover showed a 48 to 74 ms frame in 5 of 5 sessions that began with glints on and in 1 of 4 that
began with them off. That is too few sessions, under load between 4 and 17, to call: it may be that a glint
alive during the very first hover makes that one frame about 30 to 40 ms longer, once per page load, or it may
be the order of the runs. It is not a repeating cost (the second run, and every run after a warm-up, is level:
20 to 26 ms with glints against 19 to 25 without). To settle it on a quiet machine:
`node scripts/perf/twinkle-cost.mjs --mode gpu --viewport desktop --no-warmup --first on` and `--first off`,
ten sessions each. If it holds and counts as a cost, the fix to try first is to hold the glints back until the
first pointer move has been drawn, not to change the glint.

## Against the prototype

| | Prototype (README, "Twinkle"; Chromium 148, Metal, 1600 x 1000, 20 s) | App, GPU, 1440 x 900 and 390 x 844, 20 s |
|---|---|---|
| Glints made per 20 s | 8 to 11 | 8 to 12 |
| Most alive | 2 | 2 |
| Longest star pick and write | 2.3 to 3.1 ms | 0.9 to 5 ms (most runs 1 to 3) |
| Long task within 20 ms of a glint | none | none |
| Tasks of 60 to 160 ms in the first seconds of hovering, with or without glints | yes | one long frame on the first hover, see "Open" |
| Canvas redrawn for a glint | never | never (0 frames in every still run) |

## What animates, and what repaints

A glint is two nodes: a positioned `<i>` and a `<b>`. The one keyframe (`tw-glint`) animates `opacity` and
`transform` on the `<b>` and nothing else (`Twinkle.test.tsx` reads the stylesheet and checks it). The `<b>` has
`will-change: opacity, transform`, so it is painted once into its own layer when it is added (its radial
gradient and, on the two brightest classes, the flare's two pseudo-elements) and the compositor then fades and
scales that layer. Nothing repaints while it plays, nothing is laid out, and the map canvas is not drawn.
Adding and removing the node are the only DOM writes.

## Other changes to the measurement since the plan

- The switch is `window.__rmrTwinkle` (`'off'`, `'on'`), not a field of the app store, which is part of the
  first-load scripts. Each row reads back what the app's timer did with it (`window.__rmr.twinkle.enabled()`), and
  a run fails if they disagree or if a glint is made with the switch off.
- `--open whole`, `--first on|off`, `--no-warmup`, `--no-flares` and `--css <file>` were added, and each row's
  JSON says when its longest frame gap began, how many glints were alive and how long after the last one was made.
- Raw results: `frontcreck/scripts/perf/out/twinkle-cost-2026-10-06T*.json` (not in git).
