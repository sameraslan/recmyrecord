# What the star twinkle costs in the app (part 2, Task 8)

Rewritten in the fix round after the independent review (`docs/superpowers/plans/reviews/part2-task8-review.md`).
The first version of this page said more than its measurements showed. This one separates what was measured,
what was reasoned, and what is still open.

## Status in one paragraph

**On a GPU the glints are kept, and their cost there is not yet measured to a standard that can be quoted.**
**On a software renderer they are dropped.** The numbers below were taken on 2026-10-06 between 03:00 and 06:50,
on a machine shared with other agents (load average 4 to 22, never quiet), on a build that had **no glass
anywhere** (the header, panels and buttons got their `backdrop-filter` later), and with **the first hover left out
of every judged run** (see "The first hover"). So the GPU numbers are provisional. The run that settles them is
written out under "The quiet-machine run"; it has not been made.

What does not depend on timing, and holds by construction and by test: the map canvas draws 0 frames for a
glint; at most 3 are alive; every glint sits on an album's star; no glint, bloom and flare included, reaches
under the header or any glass surface; where no glint can be made there is no timer at all.

## How the first measurements were made

- Code: `d0439cf0`, on top of `17be7b55` (`feat/trifid-theme`). No rule in that tree used `backdrop-filter`.
- Machine: Apple M1 Pro, 16 GB, macOS 14.5, on mains power. Google Chrome 154.0.8037.98, headless, native arm64.
- Load average at the start and end of each run is given with it. It was between 4 and 22.
- Command: `node scripts/perf/twinkle-cost.mjs` (the Overview, where `/map` opens) and
  `node scripts/perf/twinkle-cost.mjs --open whole` (the whole-map fit), after `npm run build`. Each run: per
  renderer and viewport, 20 s with glints and 20 s without; on desktop the same again with the mouse moving.
- In every run the desktop viewport was measured first and the phone second, **in the same browser process**.

## The rules, and how far each is shown

| # | Rule | GPU (visitors get glints) | Software renderer (glints forced for the measurement) |
|---|---|---|---|
| 1 | No long task (50 ms or more) starts within 20 ms of a glint being made | 0 in every run made. Provisional (load, no glass) | 0 in every run made |
| 2 | Longest task and longest frame gap with glints at most 8 ms over the run without | Held in all 8 full runs **after a 4 s hover warm-up**. Not judged for the first hover. Provisional | **Failed**, repeatedly: see below |
| 3 | A glint takes at most 8 ms to make (`worstSpawnMs`) | 0.9 to 5 ms then. The write now also reads about ten layout boxes; not re-timed on a GPU | 0.6 to 4.5 ms then |
| 4 | No canvas frame in a still run | 0 in every run. Deterministic; pinned by test | 0 in every run |
| 5 | At most 3 alive | At most 2 seen. Deterministic; pinned by test | At most 2 seen |

Rules 4 and 5 are also pinned by tests (`e2e/twinkle.spec.ts` "glints play on the resting map and the canvas does
not draw one frame for them"; `twinkle.test.ts` "never has more than 3 glints alive").

## The runs of 2026-10-06 (commit `d0439cf0`, before the fix round)

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

The script exited 0 (its closing line then read "The glints cost no responsiveness where visitors get them"; the
script no longer prints that, because one session under load does not show it). The gpu phone still
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
the reason for dropping them there stays measurable: a state no visitor has. A page loaded with no switch on the
software renderer made 0 glints before the switch was set (the script checks it, and so does
`e2e/twinkle.spec.ts` "on a software renderer there are no glints and no timer, unless the switch says on").

## The software renderer: what was seen, and what is not known

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

What was measured:
- The stalls come with the glints: 15 of 27 sessions had one with glints on, and no still run without glints
  had one.
- No long task goes with them. The main thread is idle; the frame is late somewhere after it. Where the script
  recorded the moment, exactly one glint was alive, at 0, 59, 726 or 764 ms after it was made.
- Hiding the flares did not remove them once it was built into the app (3 of 6 sessions). The four clean
  sessions with `--no-flares` were chance. So the plan's first fallback, (a) no flares, was measured and does
  not pass.

What was decided, and on what:
- **The glints are dropped on a software renderer.** That is the safe side of the owner's rule whatever the
  cause is, and it costs few visitors: a browser with hardware acceleration switched off or a blocklisted GPU,
  Linux without a driver, Windows over remote desktop.
- **Fallback (b), one glint at a time every 2.5 to 5 s, was not built and not measured.** It was skipped on
  reasoning: every recorded stall had a single glint alive, so (b) would change how often a stall can happen,
  not whether one does. That reasoning is sound but it is not a measurement.
- **Fallback (c), drop the effect, was applied to software renderers only**, not everywhere as the plan wrote
  it. Keeping the glints on a GPU is only as good as the GPU measurement, which is provisional (above).

**The cause of the stall is not known.** The first version of this page said each compositor frame was the
whole page composited on the CPU, and gave "the phone viewport never stalled" as support. Neither stands:

- A cost paid on every frame would show as many slow frames in every session. What was seen is about one
  frame of 150 to 700 ms in about half the sessions.
- "The phone never stalled" is an artefact of the order of the runs. The phone was always measured second, in
  the same browser process as the desktop. Anything paid once per process was already paid by then.
- The glint has no `filter`, no `box-shadow`, no `backdrop-filter` and no blend mode: it is a gradient painted
  once into its own layer. A cheaper paint cannot be the fix, because there is no expensive paint.

Two explanations fit one stall per session better. Neither is proven:

- **H1, a one-off compile.** SwiftShader compiles each new draw program on the CPU, typically 100 ms or more.
  A glint brings programs the page has not used before: the gradient's first draw (stalls at 0 and 59 ms after
  a glint was made) and the variant used when the layer is at exactly opacity 1 and scale 1 (the keyframe holds
  that from 40 % to 58 %, which is 480 to 1044 ms into a glint; stalls at 726 and 764 ms). Once compiled they
  stay for the life of the GPU process. On a real GPU the same compiles take a few ms and are cached on disk.
- **H2, layer churn.** The glint is an animated composited layer under the region names, the markers, the
  hover label and the controls. The browser must keep what is painted above an animated layer in layers of
  their own, so the first glint, and each removal, can re-split and re-raster them. Cheap on a GPU, slow when
  the CPU does it.

The experiment that would separate them, if anyone wants glints back for software visitors (not planned: the
visitors are few and the effect is decoration):

```bash
# phone first, then desktop, in one browser process; then the same again. If only the very first run with
# glints stalls, whatever its viewport, it is H1: one hitch per browser session, not a cost per glint.
node scripts/perf/twinkle-cost.mjs --mode software --viewport phone,desktop
```

Also unmeasured: a visitor whose Chrome has hardware acceleration off is composited by Skia on the CPU, which
is not the pipeline measured here (`--use-angle=swiftshader` keeps GPU compositing, on SwiftShader). Dropping
the glints there is still the safe call.

What "software" means in the code: the renderer's own name (`state/renderer.ts`: swiftshader, llvmpipe,
software, basic render), asked once per map and published apart from which gas shader was chosen. Until a
graphics context has answered, the renderer is unknown, and unknown gets no glints. A weak real GPU is treated
as a GPU.

## The first hover on a GPU: not judged yet

The first time the mouse moves over a freshly loaded map, one frame is long whatever the glints do (the hover
label's first paint, its cover image, the first hover redraws). Two things kept that moment out of every judged
run of the first measurements:

1. the 4 s mouse warm-up before the two measured mouse runs, which the first version named;
2. a 1 s sleep inside the watch, after the switch was set, **while the mouse was already moving**. So even with
   `--no-warmup` the first second of hovering was never measured. The first version did not say this.

So "every rule holds on a GPU" meant "after the first seconds of hovering". The sessions without a warm-up
(gpu desktop only, load 4 to 17), longest frame gap between 1 s and 20 s after the first mouse move:

| First run | Sessions | Longest frame gap in that first run (ms) | In the second run (ms) |
|---|---|---|---|
| Glints on | 5 | 70, 74, 58, 48, 65 (two of them with one long task of 52 and 59 ms, not at a glint) | 21, 22, 24, 27, 30 (off) |
| Glints off | 4 | 25, 29, 21, 67 | 23, 27, 22, 23 (on) |

A frame of 48 to 74 ms in 5 of 5 sessions that began with glints on, and in 1 of 4 that began with them off.
That is about p = 0.05 one-sided: not noise to wave away, and not proof under that load. Later hovering with
glints was level (23, 27, 22, 23 ms).

What has been done about it without waiting for the measurement (the owner's rule: speed first):

- **No glint is made while an album is hovered, nor for 500 ms after the hover ends**
  (`TWINKLE_HOVER_HOLD_MS`). The glints already playing finish. This keeps a new glint out of the frames in
  which the hover label does its first-time work. It is one constant and one condition, to be re-judged by the
  run below and removed if it buys nothing.
- **The script now measures the first hover.** The switch is set and has taken, and the watch is running in the
  page, before the mouse first moves. Every frame gap over 32 ms is listed with its time, the glints alive, the
  time since a glint was last made or removed, and the time since the hover label first showed.
- **A third arm** (`--first held`): glints stay off until 1.5 s after the hover label first showed.

## Glass: not measured at all

The first measurements were taken on a tree with no glass. Since then the header (which the map runs under),
the panels, the album panel, the zoom buttons, the names toggle and the message boxes blur what is behind them.
A layer that animates under a blurred surface makes the browser work that blur out again on every frame, for
the 1.2 to 1.8 s of a glint. That has not been measured. It has been designed out instead:

- a star is eligible only if its glint's whole extent (bloom, and flare on the two brightest classes: up to
  about 34 px each way at the Overview) lies 22 px clear of the header and of every glass surface, and as far
  inside the visible map;
- the surfaces are read from the page when a glint is about to be made (on the timer's tick, at most once
  every 1.2 s, never in a frame), not from a list of fixed positions;
- `e2e/twinkle.spec.ts` samples 15 glints on `/map` (desktop and phone) and beside an open album at 1280 x 720
  and checks every one against every element whose computed style blurs its backdrop.

Whether a glint that is near a glass surface, but not under it, still makes the blur recompute is not known;
the 22 px (the blur's radius) is a margin, not a measured distance.

## The quiet-machine run

Not made yet. Conditions: mains power, load average under 2 (`uptime`), no other browser job, the current
`feat/trifid-theme` (with the glass), `npm run build` first. One browser launch per session.

```bash
cd frontcreck && npm run build

# 1. The first hover, with and without glints: 12 sessions each, interleaved, in the same hour.
for i in $(seq 1 12); do
  node scripts/perf/twinkle-cost.mjs --mode gpu --viewport desktop --no-warmup --first on
  node scripts/perf/twinkle-cost.mjs --mode gpu --viewport desktop --no-warmup --first off
done

# 2. The third arm: glints held until 1.5 s after the hover label first showed. 12 sessions.
for i in $(seq 1 12); do
  node scripts/perf/twinkle-cost.mjs --mode gpu --viewport desktop --no-warmup --first held
done

# 3. The still runs and the warmed-up hover, both framings, both viewports, as before but with the glass.
node scripts/perf/twinkle-cost.mjs --mode gpu
node scripts/perf/twinkle-cost.mjs --mode gpu --open whole

# 4. The project's own budget rows, five each: the hover row must not move.
for i in 1 2 3 4 5; do npm run perf -- --mode gpu --viewport desktop --twinkle on; npm run perf -- --mode gpu --viewport desktop --twinkle off; done
```

Each session writes `scripts/perf/out/twinkle-cost-<time>.json`; the row marked `firstHover` is the first
mouse run of that page load. How to decide (the kill rule's own number): the glints cost the first hover if the
median longest frame gap of the first-hover run with glints is more than 8 ms over the median without, or if
the number of sessions with a gap over 40 ms differs between the two by Fisher's exact test at p under 0.05.
If they do, compare the third arm: if holding the glints until 1.5 s after the first label removes it, lengthen
the hold for the first hover of a page load; if not, record a trace of three such sessions
(`devtools.timeline,cc,viz,gpu,blink`) and read what the long frame is made of before changing anything. If
the app's 500 ms hold already levels the two, keep it; if the two are level even with the hold taken out,
remove it. Without a `--twinkle` flag, `npm run perf` on a GPU now fails if the idle map made no glint.

## Against the prototype (the first measurements, provisional as above)

| | Prototype (README, "Twinkle"; Chromium 148, Metal, 1600 x 1000, 20 s) | App, GPU, 1440 x 900 and 390 x 844, 20 s |
|---|---|---|
| Glints made per 20 s | 8 to 11 | 8 to 12 |
| Most alive | 2 | 2 |
| Longest star pick and write | 2.3 to 3.1 ms | 0.9 to 5 ms (most runs 1 to 3) |
| Long task within 20 ms of a glint | none | none |
| Tasks of 60 to 160 ms in the first seconds of hovering, with or without glints | yes | one long frame on the first hover, see "The first hover" |
| Canvas redrawn for a glint | never | never (0 frames in every still run) |

## What animates, and what repaints

A glint is two nodes: a positioned `<i>` and a `<b>`. The one keyframe (`tw-glint`) animates `opacity` and
`transform` on the `<b>` and nothing else (`Twinkle.test.tsx` reads the stylesheet and checks it). The `<b>` has
`will-change: opacity, transform`, so it is painted once into its own layer when it is added (its radial
gradient and, on the two brightest classes, the flare's two pseudo-elements) and the compositor then fades and
scales that layer. Nothing repaints while it plays, nothing is laid out, and the map canvas is not drawn.
Adding and removing the node are the only DOM writes. While a glint plays the compositor does draw (the page
is not idle for it, which is what makes the glass matter, and is a small battery cost on the resting map).

## Other changes to the measurement

- The switch is `window.__rmrTwinkle` (`'off'`, `'on'`), not a field of the app store, which is part of the
  first-load scripts. Each row reads back what the app's timer did with it (`window.__rmr.twinkle.enabled()`), and
  a run fails if they disagree or if a glint is made with the switch off. `'on'` also forces glints on a software
  renderer: a state no visitor has, and the scripts say so when they measure it.
- `--open whole`, `--first on|off|held`, `--no-warmup`, `--no-flares`, `--css <file>` and
  `--viewport phone,desktop`. Each row's JSON has every frame gap over 32 ms (`longGaps`), when the hover label
  first showed, and when the first glint was made.
- With the hover hold in the app, a mouse run can make few glints or none; the script reports how many ticks
  the hold skipped instead of failing such a run.
- Raw results of the first measurements: `frontcreck/scripts/perf/out/twinkle-cost-2026-10-06T*.json` (not in git).
