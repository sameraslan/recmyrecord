# Part 2 Task 8 (twinkle): independent review of `d0439cf0`

Reviewer read the commit by id (`git show d0439cf0:<path>`), the plan's Task 8, the implementer's report, the
committed write-up, the prototype's `twinkle.js` and `pages.css`, and the capture. Nothing was built, run in a
browser or timed. Unit tests were not run (the worktree is mid-rebase). Everything about cause below is from
reading code and the implementer's own numbers; where it is a hypothesis it says so.

## Verdicts

| | Verdict |
|---|---|
| Spec (plan + rulings) | **Pass with gaps.** Rulings followed: no store field, no setter, `window.__rmrTwinkle`, `twinkleOff(page)` kept, `perf.mjs --twinkle` has a real readback. Gaps: chrome other than header / album panel / phone slider is not kept clear (I1); the fallback ladder was not walked ((b) skipped, (c) narrowed), which needs a ruling. |
| Quality | **Good code, measurement not yet conclusive.** The pure module, the timer and the switch are clean and well unit-tested. The cost verdict for a GPU rests on runs taken under load 4 to 22, on a base that has no glass anywhere, with the first hover excluded twice over (I1, I2). |
| The software decision | **Sound as a decision, not as an explanation.** Dropping on a software renderer is the safe side of the owner's rule and costs almost no visitors. The mechanism the write-up gives is unproven and its one supporting fact ("the phone never stalled") is confounded by run order (I3). The detection reads the wrong signal (which gas shader was chosen, not which renderer) (I4). |
| Fidelity | **Pass by construction; the capture alone does not prove it.** The CSS rules, the gradient, the keyframe and the size formulas are the prototype's, character for character apart from `pointer-events`. The capture is a frozen copy of a different, smaller star and shows one visible difference to explain (the flare's horizontal arm) (I8). |

No Critical finding. Nothing here breaks a hard rule as built: one timer chain, no rAF, no `invalidate`, no
pointer listener, 0 canvas frames, at most 3 alive, every glint on an album's star.

---

## 1. The decision on software rendering

### Is dropping it there sound?

Yes. The owner's rule is "drop or cheapen without asking and tell him"; a renderer where 15 of 27 sessions showed
a 145 to 720 ms frame with glints and none without is on the wrong side of it whatever the cause. The ladder was
not followed to the letter ((b) not built, (c) applied to one renderer), but the outcome on software is stricter
than (b), so nothing was hidden. The narrowing of (c) to software only is a product call and should be put to the
orchestrator as one, with I1 and I2 settled first, because "kept on a GPU" is only as good as the GPU measurement.

### What "software" means in the code, and who falls where

`twinkleShown` (`state/twinkle.ts:275-277`) reads `window.__rmr.gasLite`, which `GasField.tsx:387-396` sets to
`override === 'force' || (override !== 'off' && /swiftshader|llvmpipe|software|basic render/i.test(UNMASKED_RENDERER))`.

| Visitor | Renderer string | Result |
|---|---|---|
| Chrome, hardware acceleration off, or GPU on the blocklist | WebGL falls back to SwiftShader ("...SwiftShader...") | dropped. Note this visitor's *page* is composited by Skia on the CPU, not by SwiftShader; it is not the pipeline that was measured (`--use-angle=swiftshader` keeps GPU compositing, on SwiftShader). Dropping is still the safe call. |
| Newer Chrome where the SwiftShader fallback for WebGL is refused | no WebGL context | no canvas, no `TwinkleDriver`: no glints. Fine. |
| Linux without a driver | "llvmpipe" | dropped |
| Windows remote desktop / no driver | "Microsoft Basic Render Driver" | dropped |
| Firefox (sanitised string), Safari ("Apple GPU"), Brave and other maskers | generic GPU name | treated as GPU |
| Weak integrated GPU, old phone | real GPU name | treated as GPU |

A weak real GPU is treated as a GPU, and I think that is right for *this* effect: one layer of at most 43 px
(plus a 1 px flare) whose opacity and transform the compositor animates is the cheapest animation a browser has.
There is no renderer-name test that would find a weak GPU anyway. The real exposure on weak GPUs and phones is
not the glint, it is what the glint damages above and around it: see I1 (glass).

### What causes a 145 to 720 ms frame from one small node?

Not the raster of a blurred bloom. There is no `filter`, no `box-shadow`, no `backdrop-filter` and no blend mode
on the glint: it is a `radial-gradient` painted once into its own layer (`will-change: opacity, transform`,
`map.css` `.tw b`) and two 1 px `linear-gradient` pseudo-elements. So the question "would a pre-rasterised image
or a filter-free gradient pass on software?" has a plain answer: **the glint already is the filter-free form, so a
cheaper paint cannot be what fixes it.** The implementer's own data agrees: the main thread was idle, no long
task, flares made no difference.

The write-up's explanation (every compositor frame is the whole 1440 x 900 page composited on the CPU; the phone
is smaller so it never stalled) does not fit its own numbers well: a per-frame cost would show as many slow
frames in every session, not one 150 to 700 ms frame in about half of them. And the phone fact is confounded:
`twinkle-cost.mjs:254-258` runs desktop then phone **in the same browser process**. Two hypotheses fit better;
neither is proven:

- **H1, one-off program compile on SwiftShader.** SwiftShader JIT-compiles each new draw program, typically
  100 ms or more each. A glint introduces programs the page has not used: the gradient raster and first draw
  (stalls at 0 and 59 ms after a glint was made), and the variant used when the quad is at exactly opacity 1 and
  scale 1 (the 40 % keyframe is at 480 to 720 ms; stalls at 726 and 764 ms). Once compiled they stay for the life
  of the GPU process, which is why the phone run, coming second, never stalled, and why it is about one stall per
  session. On a real GPU the same compiles take a few ms and are cached on disk.
- **H2, layer churn.** A composited, transform-animated layer at `z-index: 1` sits under the region names
  (z 2), markers (z 3), hover label and controls. Chrome must keep everything painted above an animated layer in
  layers of its own; if those were squashed into one overlay layer before, the first glint (and each removal)
  re-splits and re-rasters them. Cheap on a GPU, slow on SwiftShader.

Either way the stall is a property of SwiftShader doing GPU work on the CPU, and neither bites a real GPU in the
same way. One experiment separates them and tests the write-up's claim, if anyone wants glints back for software
visitors: `--mode software`, phone **before** desktop, and the still-on run twice in a row in one process. If
only the very first run with glints stalls, whatever its viewport, it is H1 and the cost is one hitch per browser
session, not per glint.

### Recommendation

1. Keep the drop on software. Do not spend more on making it pass there: the visitors are few and the effect is
   decoration.
2. Do not build (b). It changes how often, not what, as the implementer says; but say in the write-up that this
   is reasoning and that the cause is not known, and remove "the phone never stalled" as evidence for an
   area-dependent cost (I3).
3. Fix the detection signal (I4).
4. Treat the GPU verdict as open until I1 and I2 are measured on a quiet machine after the rebase.

---

## 2. The first hover on a GPU

### Is the warm-up hiding a real cost?

It may be, and the script hides more than the report says. Two separate things remove the first hover from the
judgement:

- the 4 s warm-up (`twinkle-cost.mjs:203-207`), which the report names;
- `watch()` sets the switch and then sleeps 1000 ms before it starts measuring (`:185`), while `wander()` starts
  moving the mouse at once (`:209-210`). So even with `--no-warmup` **the first second of hovering is never
  measured.** The 48 to 74 ms frames in the table happened between 1 s and 20 s after the first mouse move, not
  at it.

That second point changes how to read the table. The sessions say: early hovering with glints is long (5 of 5),
early hovering without is mostly not (1 of 4), later hovering with glints is not (23, 27, 22, 23 ms). 5 of 5
against 1 of 4 is p of about 0.05 one-sided: not noise to wave away, not proof under load 4 to 17.

### What in the code could couple a glint to early hovering

- **Not the pointer path.** No listener was added. `TwinkleDriver`'s `useFrame` (`:118-150`) runs on hover
  redraws but is ten comparisons and a return. A glint does not ask for a canvas frame.
- **Not a style recalc over `.tw-layer`.** It is empty or holds at most six nodes; `addGlint` reads no layout.
- **Glints are made while the mouse hovers.** `resting()` (`:51-66`) does not look at hover, so during the mouse
  runs a glint spawn (pick over 4,081 albums, 1 to 5 ms measured, plus a style and layer update) lands inside
  frames that are already redrawing the canvas for the hover. That is constant across runs, so alone it cannot
  explain early-only.
- **What is early-only:** the hover label's first paints. `.map-tip` has a 28 px `box-shadow`, a cover image
  that must be fetched and decoded for each album hovered for the first time, and serif text shaped for the first
  time. The wander path (`:199`) keeps reaching new albums for many seconds, so "first-time label work" lasts well
  past the first second. The label sits above `.tw-layer`. With a live glint under it, the label and everything
  else above the glint have to be layered above an animated layer (H2 above): a label paint that would otherwise
  be a small repaint of one overlay layer becomes a layer-tree change and a larger raster and commit. That is the
  one coupling I can see that is specific to "glint alive AND label doing first-time work".
- A fresh Playwright profile also has an empty on-disk shader cache every launch, so program compiles for the
  label and for the glint can land in the same frame. A returning visitor does not pay that; a first-time one does.

### The measurement that settles it

On a quiet machine (load under 2, mains, nothing else using a browser), GPU desktop, **after the rebase onto the
glass header**:

1. Fix the script first: move the 1 s settle so that the watch has started **before** the first
   `page.mouse.move` (set the switch, wait 1 s, start `__fx.watch`, then start `wander`), and record every frame
   gap over 32 ms with its time, glints alive, and ms since the last glint was added or removed, not only the
   longest.
2. One browser launch per session (as now). Alternate `--no-warmup --first on` and `--no-warmup --first off`,
   12 sessions each, interleaved, same hour.
3. Add a third arm, 12 sessions: glints on but none made until 1.5 s after the hover label first showed (the
   candidate fix, injected or behind a flag).
4. For three "on" sessions that show the long frame, record a trace (CDP `Tracing.start`, categories
   `devtools.timeline,cc,viz,gpu,blink`) and read what the long frame is made of: main-thread
   `Layerize`/`Paint`/`Commit`, raster, image decode, or GPU program compile.
5. Decide by the kill rule's own number: if the median longest gap of the first mouse run with glints is more
   than 8 ms over the median without, or the count of sessions over 40 ms differs by Fisher exact p under 0.05,
   it is real. Also run the project's own hover row (`npm run perf`, GPU desktop) with `--twinkle on` and
   `--twinkle off`, five each: that row is the budget, and it must not move.

### The fix if it is real

In order of preference:

1. **Make no glint while the hover label is showing first-time content.** Simplest honest form: in `resting()`,
   return false while an album is hovered and for 500 ms after the hover last changed, read from the map store in
   the timer's tick (no listener, nothing on the pointer path). If that hides glints too often for a visitor who
   rests the mouse on the map, restrict it to "until the first hover of this page load has been drawn plus 1.5 s".
2. If the trace shows layer churn (H2): stop the layer tree changing when a glint comes and goes, by keeping the
   layers above the glint permanently separate (for example a standing composited `.tw-layer` and the overlay
   layers above it promoted once at load), and re-measure memory and the at-rest numbers.
3. If neither removes it: the ladder. (a) no flares does not address this; go to (b) or (c).

Do not change the glint itself for this; its paint is not the suspect.

---

## 3. Mechanics (checked by reading)

| Claim | Finding |
|---|---|
| One `setTimeout` chain | Yes. `schedule()` is called only at the end of `tick` and from `sync` when `timer === null` (`twinkle.ts:216-248`). Plus one fallback removal timer per glint (`:234`), never cleared but harmless (`finish` is a no-op once removed). |
| No rAF, no canvas frame | Yes. No `requestAnimationFrame`, `invalidate` or `requestRender` in the three files. `useFrame` only observes frames others asked for. |
| No pointer listener | Yes. Listeners: `visibilitychange`, the reduced-motion media query. |
| Stops when hidden / reduced motion / switch off / unmount | Yes: `running()` false ends the chain in `tick` and `sync` clears it. |
| Stops when covers show | **The timer does not stop; it ticks and makes nothing** (`resting()` false, counted in `notResting`). Same on a software renderer, on About, and behind the phone's album list: one wake every 1.2 to 3 s for as long as the page is open. Negligible, and the prototype does the same, but "the timer stops when covers show" is not literally true (M1). |
| At most 3 alive | Yes (`:224`), unit-tested. |
| Only a real on-screen star | Yes: `pickStar` over album positions; e2e checks the centre is within 1 px of `screenPoint(album)`. |
| Not under chrome; `getStageTop()` | Uses `getStageTop() + 6` (`TwinkleDriver.tsx:76`), `insetCurrent + 6` and `bottomCover`. At `d0439cf0` nothing calls `setStageTop` (it is 0 and the pane starts below the header); on the main line `MusicMap` calls `setStageTop(input.insetTop)`, so after the rebase the *star* is kept 6 px below the header. Not handled: the bloom and flare (see I1), the zoom buttons, the names toggle, the desktop slider panel, the message box. |
| Uses that star's class | Yes: `pageStarClasses(n)[index]`, `starCoreCssPx(cls, zoom, height)`, `starTint(lead[index])`. |
| Random per page load | Yes: `Math.random` for the wait, the pick and the duration; classes are the page's own deal. |
| What animates | `opacity` and `transform` on `<b>` only; the stylesheet test pins it. No layout, no repaint while it plays. |
| `will-change` | `opacity, transform` on `.tw b` only, for the life of the node. |
| Layers | One per live glint (at most 3). The flare's pseudo-elements paint into it. Unknown and worth one look in DevTools Layers on a GPU: whether a live glint forces the names, markers and controls above it into extra layers (H2). |

`d.focus === input.focus` (`:135`) is an identity test; `focus` comes from the app store through a `useMemo`
(`MapStage.tsx:147, 197-212`), so it is stable and a hover does not clear the glints. Good.

---

## 4. The switch

- **How a mid-session change is seen:** `watchTwinkleSwitch` (`twinkle.ts:287-302`) replaces the field with an
  accessor on `window`; the setter calls `tw.setEnabled` inside the assignment. No polling, no timer.
- **Cost at rest:** none. The getter is read once per tick in `resting()`.
- **Synchronous and frameless off:** `setEnabled(false)` → `sync()` → `clear()` → `el.remove()` for each glint, in
  the assignment. No canvas frame. The e2e test `twinkleOff takes the playing glints out at once...` reads the
  DOM in the next `evaluate` and the frame counter after 7 s: a real proof.
- **Can a page script break it:** yes, trivially (`delete window.__rmrTwinkle`, or a second `defineProperty`),
  after which assignments are plain and ignored. Only tests write it, so this is acceptable. Two watchers at once
  would also break each other on unwatch, but React runs the old effect's cleanup before the new effect, so it
  does not happen.
- **First-load:** the watcher and `twinkleShown` live in `state/twinkle.ts`, imported only by `TwinkleDriver`
  and `overlays/Twinkle.tsx`; the `global.d.ts` import is type-only. The +0 claim (195,832 B gzip, per-chunk
  equal to Task 7's table) is consistent with the code. I did not build to re-measure it.
- **One wart:** `'on'` means two things, "not off" for the timer and "also on a software renderer" for
  `twinkleShown`. So every Playwright test that wants glints runs a configuration no visitor has (forced on
  software). Unavoidable with a software test browser; see I7.

---

## 5. Tests

**Unit (31 + 5 + 2).** Meaningful. The timer tests drive fake time through every stop condition; `pickStar`
tests the area, the cover skip and the weights; the switch tests check the descriptor left behind. The stylesheet
test is a string match on single-line rules: it will break if someone reformats the rule, which is the right way
round. Weak spot: nothing unit-tests the driver's `resting()` or the area it builds.

**e2e, test by test: can it fail for the right reason?**

| Test | Verdict |
|---|---|
| glints play, 0 canvas frames | Yes. Note `worstSpawnMs < 16` where the kill rule says 8 (M3). |
| sits on an album star, two nodes, no pointer events | Yes. Does not check the area (I6). |
| a pan clears the glints at once | **Not for "at once".** `toHaveCount(0)` retries for 5 s; a glint lives at most 1.8 s and a drag blocks new ones, so the count reaches 0 even if `viewChanged` never ran (I5). The "none made while panning" half is sound. |
| no glints once covers show | Yes (`spawned` unchanged over 7 s, `notResting` rising). |
| reduced motion | Yes (`ticks === 0`). |
| hidden tab | Timer half yes (`ticks` unchanged). "Cleared at once" has the same 5 s retry weakness (I5). |
| beside an open album | Yes for peak 0.60 and never under a cover; guarded by `coverPx < 16` so it is not vacuous. See I7 for what it no longer shows. |
| About | Yes. |
| twinkleOff | Yes, and synchronously. |
| switch before load | Yes. |
| software renderer, no switch | Yes; skips on a GPU. `notResting === ticks` is a good pin. |

**The Playwright gap.** Default-on on a GPU is covered only by `twinkleShown`'s unit test (the logic) and by
manual runs of the cost script (the wiring). Nothing automated would notice if glints stopped appearing for
real visitors. Acceptable only with a cheap backstop: see I7.

**1440 x 900 and the open album.** Moving the test to 1280 x 720 does not weaken what it asserts. But it moved
because of a product fact that is a departure from what the ruling was meant to give: at 1440 x 900 an open album
rests with covers at 16.5 px or more, so **no glints play beside an open album at 1440 x 900 or larger**, and the
quieter 0.6 peak is only ever seen in small windows. The rule is the prototype's (`Cam.coverFade() > 0`), so the
code follows the prototype; the outcome does not match what the owner saw there if the prototype framed albums
below the cut-off. This is the owner's call, not a bug (I7).

**Tests-first.** Not kept for e2e (stated). Given the table above, the only tests that would have been caught by
a red-first run are the two "at once" ones.

---

## 6. Changes outside the plan

- `e2e/helpers.ts` `waitForAnimations`, `e2e/a11y.spec.ts`: animations inside `.tw-layer` are skipped. Not a
  loosening in practice: glints are `aria-hidden`, change no colour axe reads, and on the test browser there are
  none unless forced. Everything else is still waited for.
- `e2e/opening.spec.ts` `medianLuma`, `e2e/gas.spec.ts` `lumaAt` and the registration test call `twinkleOff`
  first. A strengthening (removes a random bright spot), not a loosening. Side effect: glints stay off for the
  rest of that page load; none of those tests asserts on glints.
- `gas.spec.ts` sets `__rmrGasLite = 'off'` for the whole file, which makes `gasLite` false and so **turns
  glints on by default in every gas test on the software browser** (I4). The pixel readers are guarded; the two
  frame-gap tests already listed as flaky on software now also run with glints, which on software is exactly
  the configuration measured to stall. Expect them to get flakier until I4 is fixed.
- The four red `gas.spec` desktop tests: the report says "not shown red on origin". They are:
  `_notes/reports/gas-spec-bisect-report.md` bisects the same four to `6f763691` (region names) on a separate
  worktree, with the same failing line. Not caused by this commit.
- `scripts/perf/perf.mjs` / `lib.mjs`: the readback is real. It reads the timer's own `enabled()`, the timer's
  `spawned` count and the DOM node count, not the global the script set; `checkEffects` fails when the timer
  disagrees, when the hook is missing, when anything was made under `off`, and when nothing was made under `on`.
  Unit-tested both ways.
- **`--twinkle on` on a software renderer does show glints** (the init script writes `'on'`, which
  `twinkleShown` honours). So `perf.mjs --mode software --twinkle on` measures a configuration no visitor gets,
  and will show the stalls. The flag's help text says so in a comment; the run's printed "A/B run" line should
  say it too (M4).

---

## 7. Fidelity

Looked at `twinkle-glint-app-under-prototype.jpg` (prototype row above, app row below).

- **Shape, core, bloom:** the same. Solid near-white core, soft fall-off, centred on the star, grows, peaks, fades
  to the bare star.
- **Size relative to the star:** the app's glint is smaller, as it should be for a class 1 star against the
  prototype's brightest class. Consistent with the same formula; not a like-for-like frame.
- **Flare:** in the prototype's "Brightest" frame the two arms are equal and long. In the app's the vertical arm
  is clear and long and **the horizontal arm is short and faint**, also in "Growing". Likely causes, none
  confirmed: a 1 px line at a fractional y on a 2x screen spreading over two rows (the `<i>` is placed with
  two-decimal translate, so each glint's arms land differently), the copy-into-a-holder step shifting the
  sub-pixel position, or the pale gas behind that arm. It is not a difference in the CSS, which is identical.
- **Colour:** both near white with the star's tint; no visible difference at this size.

**Is a frozen copy an honest basis?** It is honestly labelled, in the picture's caption and in the report. It is
not sufficient: it shows the node's style at four keyframe points, not what the compositor shows in real time,
and it compares a different class of star in a different place. Fidelity here rests on the code being a
character-for-character port, which I checked (`pages.css` twinkle block against `map.css`; `twinkle.js`
`spawn` against `glintFor` / `glintBackground` / `addGlint`). To close it properly: one live capture on a GPU
(headed Chrome or a screen recording), of a brightest-class star, at 1x and at 2x, and a look at whether both
flare arms show (I8).

---

## Findings

### Important

- **I1. The GPU verdict was measured without the glass, and glints are not kept clear of it.**
  `frontcreck/src/components/map/canvas/TwinkleDriver.tsx:74-79`. `d0439cf0` sits on `17be7b55`, where no rule
  uses `backdrop-filter`. The main line (22 commits on) gives `.top, .panel, .album, .map-zoom button, .map-names,
  .map-msg` a `blur(22px) saturate(1.2) brightness(0.58)` backdrop, and the map runs under the 64 px header. A
  layer animating under or within the blur's reach of a backdrop-filtered element makes the browser redo that
  blur on every compositor frame of the glint's 1.2 to 1.8 s. The star is kept 6 px below the header, but the
  bloom is up to 21 px in radius and the flare up to about 36 px each way, so they run under the header; nothing
  keeps a glint out from under the zoom buttons or the names toggle. Fix: (1) rerun `twinkle-cost.mjs` after the
  rebase, on a quiet machine, before the GPU "pass" is quoted; (2) make the area radius-aware: pick with a margin
  of the largest flare half-length (or re-check the picked star's own bloom/flare box against the area), and add
  the control rectangles (zoom corner, names toggle, desktop slider panel) as exclusion boxes, measured on resize,
  not per glint; (3) add an e2e test for it (I6).
- **I2. The first hover is not judged at all, even with `--no-warmup`.**
  `frontcreck/scripts/perf/twinkle-cost.mjs:185` (1 s sleep inside `watch` while `wander` has already started at
  `:209-210`) and `:203-207`. Fix and measurement in section 2. Until then the write-up's "On a GPU every rule
  holds" should read "every rule holds after the first seconds of hovering".
- **I3. The write-up's mechanism for the software stall is unsupported, and "the phone never stalled" is an
  artefact of order.** `docs/design/trifid-theme/reviews/app-twinkle-cost.md`, "What the numbers say";
  `twinkle-cost.mjs:254-258` (desktop then phone in one browser process). Fix: reword to "cause not known", list
  H1 and H2, drop the area argument, and say (b) was skipped on reasoning. Optional experiment in section 1.
- **I4. The software test reads which gas shader was chosen, not which renderer is in use.**
  `frontcreck/src/components/map/state/twinkle.ts:275-277`, `TwinkleDriver.tsx:58`,
  `canvas/GasField.tsx:387-396`. Consequences: `__rmrGasLite = 'off'` (all of `gas.spec.ts`, two tests in
  `opening.spec.ts`) plays glints on the software browser; `'force'` on a GPU drops them; before the first gas
  image is in, and for good when there is no gas, a software renderer counts as a GPU. Fix: in `chooseShader`,
  publish the renderer's verdict on its own (`gasSoftwareRenderer(renderer())`, before the override is applied)
  through a small module value in `state/` (as `stageTop.ts` does), have `resting()` read that, and treat "not
  known yet" as not resting. Keep the e2e software test; add a unit case for "unknown means no glint".
- **I5. Two e2e assertions named "at once" cannot fail for that reason.**
  `frontcreck/e2e/twinkle.spec.ts:100` and `:152`. `toHaveCount(0)` retries for 5 s, longer than a glint lives.
  Fix: read `document.querySelectorAll('.tw-layer .tw').length` in a plain `page.evaluate` straight after the
  action (as the `twinkleOff` test does), or assert `stats.cleared` rose by one.
- **I6. Nothing tests where a glint may be.** The driver's area (header, album panel, phone slider) has no
  test, and its header term changes from 0 to 64 with the rebase. Fix: an e2e test that samples glints for 12 s on
  `/map` and on an album at 1280 x 720 and asserts every glint's box (bloom, and flare when present) lies below
  the header's bottom edge, right of the album panel, and on phone above the slider panel.
- **I7. Two things the owner should be told with the software drop, and one backstop.** (a) At 1440 x 900 and
  larger no glints play beside an open album (covers rest at 16.5 px or more, past the 16 px cut-off); the 0.6
  peak shows only in smaller windows. Either accept it, or let glints run beside an open album up to a higher
  cut-off; his call. Pin whichever is chosen with a test at 1440 x 900. (b) Default-on for real visitors has no
  automated check. Backstop: in `perf.mjs`, on GPU runs with no `--twinkle` flag, read `TWINKLE_READBACK` and
  fail if no page made a glint (`frontcreck/scripts/perf/perf.mjs`, `effectsSeen` is only called when a flag is
  set).
- **I8. The capture does not settle fidelity, and shows uneven flare arms.**
  `docs/design/trifid-theme/reviews/app-part2/twinkle-glint-app-under-prototype.jpg`. Fix: one live GPU capture
  of a brightest-class star at 1x and 2x beside the prototype's; if the horizontal arm is faint live at 2x, snap
  the `<i>`'s translate to device pixels (round `x - radius`, `y - radius` to 1/dpr) so both 1 px arms land on
  whole rows and columns.

### Minor

- **M1.** The timer keeps ticking where it can make nothing (covers showing, software renderer, About, phone
  album list): `twinkle.ts:223`. One wake per 1.2 to 3 s. Leave it, but the commit message and report should not
  say it "stops" there.
- **M2.** At rest the page is no longer idle for the compositor: a glint is on screen for more than half the
  time, so the compositor draws at the screen's refresh rate for most of every minute the map is open. "0 canvas
  frames" holds; "nothing is drawn at rest" no longer does. Inherent to the approved effect; worth one line to
  the owner as a battery note, and it is what makes I1 matter.
- **M3.** `e2e/twinkle.spec.ts:46` allows `worstSpawnMs < 16`; the kill rule is 8. Fine for a loaded software
  test browser; say why in the comment or it reads as the limit.
- **M4.** `perf.mjs --mode software --twinkle on` measures a state no visitor has. Print that in the run's
  "A/B run" line, not only in a source comment.
- **M5.** `twinkleShown` depends on `window.__rmr`, documented as a test hook (`lib/store.ts:95` creates it
  unconditionally today). Fixed by I4.
- **M6.** `TwinkleDriver.tsx:99` publishes `window.__rmr.twinkle` only `if (window.__rmr)`; fine today, same
  dependency.
- **M7.** The per-glint fallback timer is not cleared on `clear()` or `dispose()` (`twinkle.ts:234`). Harmless
  (it finds nothing), up to 2.1 s late.
- **M8.** `TWINKLE_EDGE_PX = 6` is the prototype's; with I1's margin it becomes moot.

## Not verified by this review

Bundle size (+0), every timing, the e2e and unit results, and layer counts: all taken from the implementer's
report or reasoned from code. H1 and H2 are hypotheses.
