# Part 2 Task 4 review: white cased lines, frames and badges

Reviewed: `git diff 3d8ee1f4..d8feb77b` in `wt-task4` (`94b7782b` code and tests, `d8feb77b` two pictures).
Method: read the diff, the plan's Task 4 section, the driver in full, `edgePoint` in `focusLayout.ts`; looked at
the three pictures and decoded their pixels to measure line profiles and the gas beside the lines. No build, no
browser, no perf run. Nothing was executed against the app.

## Verdicts

| Area | Verdict |
| --- | --- |
| Spec compliance | **Pass.** Markup, attributes, group order, CSS values, `BADGE_OFFSET` and the test edits match the plan. One departure (the driver's line block), which is equivalent in output. |
| Code quality | **Pass with findings.** The departure is sound and cheaper in garbage. The index pairing is protected only by comments, not by a test. Cost is unmeasured. |
| Fidelity | **Pass on what the pictures show; the acceptance item is not proven by them.** The lines match `final-album.jpg`. The pictures do not show a line on gas anywhere near luminance 208. |

## 1. Spec compliance

Checked value by value against the plan (L2018-2298).

- `FocusMarkers.tsx:37-52`: `g.mk-case` then `g.mk-core`; `line[data-case]`, `line[data-leader-case]`, `line[data-to]`,
  `line[data-leader]`; `data-hot` on the casing and the core of a hot recommendation; leaders start `display: none`.
  Exact. The only addition is one sentence in the comment about the order contract.
- `map.css:72-102`: all 17 rules are the plan's text, character for character. `--acc` is gone from the block;
  `--color-lamp` is on the seed ring, the hot ring and the hot badge; `--color-room` on the marker background, the
  seed gap and the hot badge. Nothing outside the block changed.
- `MarkerDriver.tsx:23`: `BADGE_OFFSET = 7` with the plan's comment.
- `focus.spec.ts`: the two edits as written. The comment says 23 px where the plan's comment said 24; it now
  agrees with its own assertion.
- Nothing extra: six files in the diff, `MapStage.tsx` untouched (19,936 bytes), no data, budget or copy change.

### The departure: `edgeT` against `edgePoint`

`edgePoint(x0, y0, x1, y1, half)` returns `x0 + (dx/d) * half / (max(|dx|,|dy|)/d)`, which is
`x0 + dx * half / max(|dx|,|dy|)`. `edgeT` returns `half / (max(|dx|,|dy|) || 1)` and the caller multiplies by
`dx`, `dy`. Same point in every case:

| Case | `edgePoint` | `edgeT` | Same |
| --- | --- | --- | --- |
| General | `x0 + dx * half / max` | `x0 + dx * half / max` | yes (last-bit rounding only, far under the 0.1 px of `toFixed(1)`) |
| Far end of a line | `edgePoint(it, seed)` = `it.x - dx * b` | `it.x - dx * b` (`MarkerDriver.tsx:146`) | yes |
| Zero length | `d` falls back to 1, `dx/d = 0`, stays on the centre | divisor falls back to 1, `dx * half = 0`, stays on the centre | yes |
| Line shorter than the two frames (`a + b > 1`) | no clamp, the two ends cross over | no clamp, the two ends cross over | yes, the same crossed segment |
| Seed and recommendation with different frames | two calls, two halves | `a` from `frameHalf(seed)`, `b` from `frameHalf(it)` | yes |
| Hot recommendation | `drawn !== size` picks `HOT_FRAME_PX` | the same test in `frameHalf` (`MarkerDriver.tsx:54-56`) | yes |
| Leader | `edgePoint(it, anchor, half)` | `it.x + dx * t` with `dx = ax - x` | yes |

The crossed case cannot happen on a settled layout: the layout keeps 24 px between frames at rest, and a hot
recommendation eats 5.7 px of it (46 px cover at 1.16, 3 px frame against 1), leaving about 18 px. It can only
happen while markers are held at a wall during a motion, and the plan's code would do the same.

The seed cannot be hot (`FocusMarkers.tsx:30` excludes it), so `frameHalf` and the CSS never disagree about it.

### Can the index pairing go out of step?

No, as the code stands.

- Both groups are rendered by one component from the same two arrays in the same order, so React commits them
  together. `paint` runs from a frame callback or an animation-frame callback, never in the middle of a commit.
- Showing or hiding a leader changes `style.display`, not the child count.
- A change in the number of markers changes both groups in the same commit.
- The 180 ms ease calls the same `paint`.
- When the store is one frame ahead of the DOM, the id comes from the core's own `data-to` / `data-leader`, and a
  missing marker is skipped or hidden. That is why reading `dataset` is the right choice over pairing with `drawn`
  by index.

What is not checked is that the casing at index j carries the same id as the core at index j. See finding I1.

## 2. Per-frame cost in `paint`

- **Allocation in the line block:** none of lists, arrays, maps or closures. What remains is four `toFixed`
  strings per line and the string each `dataset` read returns. Before, there were two `NodeList`s and three
  closures per frame on top of the same strings. `svg.children` and `g.children` are live collections cached on
  their elements.
- **Layout reads:** none. `children`, `dataset` and `style` writes do not force layout.
- **Closures:** none in the line block. One remains further down, `drawn.find((p) => p.id === hovered)`
  (`MarkerDriver.tsx:167`), created on frames where something is hovered. It predates this task.
- **DOM writes per line:** a recommendation line, 8 `setAttribute` (4 before). A leader, 2 `style.display` writes
  (1 before) and 8 `setAttribute` when shown (4 before). With five recommendations and six leaders the worst case
  is 100 writes a frame against 50.
- **Unchanged values:** not skipped, and they were not skipped before. Frames where nothing moved do occur while an
  album is open (a hover redraw, a cover fade, a gas fade), and on those every attribute is rewritten with the
  same string. I did not verify whether the browser short-circuits a same-value `setAttribute` on an SVG line; the
  code should not rely on it.
- **At rest:** `paint` is called only from `useFrame` (demand frame loop) and from the settle step, which stops at
  `p >= 1`. This task did not touch either. Not run, so not observed.

## 3. Tests

`git diff 3d8ee1f4..94b7782b -- frontcreck/e2e/focus.spec.ts` shows two hunks and nothing else.

- Check (d) is tightened as the plan says: start on the seed frame and end on the cover's frame within 1.5 px
  (Chebyshev distance against `w/2 + 4` and `w/2 + 1`), both ends within 1.5 px of the line through the centres
  (was 2 px to the centres), length at least 23 px. Checks (a), (b), (c) and the rest of the file are untouched.
  Nothing is loosened.
- **Casings drawn above cores:** caught, by the group order assertion (`focus.spec.ts:45`), as long as each line
  is in the right group. Only `data-case` lines are counted inside `g.mk-case`; a leader casing placed in the
  core group would pass.
- **A casing that does not follow its core:** not caught. No test reads a casing's `x1..y2`, its `data-hot`, or
  a leader casing's `display`. A casing left at `0,0`, or paired with the wrong core, passes every test. The
  plan's test has the same gap; the index pairing makes it matter more.

## 4. CSS

Confined to the focus-markers block, values verbatim, lamp token where the plan says. No finding. The rebase
conflict the implementer expects after `.mk-n[data-hot]` is real and trivial.

## 5. Fidelity and the cream acceptance item

### What the pictures show

Pixel profiles across the lines (luminance, one row or column through a line):

| Picture | Profile | Reading |
| --- | --- | --- |
| `final-album.jpg` (1600 wide) | `46, 235, 109, 15` / `18, 113, 240, 30` / `12, 67, 244, 76, 13` | about 1.5 px of white, about 1 px of dark each side |
| app desktop (1440 wide) | `26, 111, 236, 113, 24` / `54, 235, 163, 23` / `23, 185, 216, 39` | about 1.5 to 2 px of white, about 1 px of dark each side |
| app phone (dpr 2) | `25, 24, 30, 206, 235, 235, 155, 26, 24, 24` | 3 device px of white, 3 of dark each side |

- **"The core looks slightly thinner than the approved picture": not supported.** The app's core is the same
  width as the approved picture's, to the pixel, or a hair wider. Not a defect. The plan's 1.5 px is right.
- Frames, badges and the seed's dark gap match the approved picture. The amber seed ring is the expected state
  between the parts.
- **The phone "bead": not a defect of this task, but worth a note for part 3.** Recommendation 3's true position
  lies on its own 24 px line, so the shader's ring sits on the line and the leader lies on top of it. It reads as
  a small node on the line. It is tidy at this size and the ring is restyled in part 3.

### The acceptance item is not proven by the pictures

The report says the line to recommendation 4 crosses gas "up to luminance 208". Sampled 7 px to either side of
that line along its whole length, the gas is 56 to 122, mostly 60 to 100. The surroundings of every line cut I
measured, on desktop and phone, are 50 to 113. The approved picture's are 35 to 65. The 208 is most likely a star
under the line, not gas. So the two pictures show white cased lines on mid-tone gas, where they read very well;
they do not show a line on the brightest cream.

### What the values say about cream of luminance about 208 (rgb 220, 206, 188)

Computed, WCAG contrast, casing composited at its alpha over the cream, core over the casing:

| Line | Core against casing | Casing against cream | Core against cream | Dark edge each side |
| --- | --- | --- | --- | --- |
| Normal (1.5 on 4.5) | 11.6 : 1 | 8.7 : 1 | 1.3 : 1 | 1.5 px |
| Hot (2.25 on 5.25) | 13.4 : 1 | 8.7 : 1 | 1.5 : 1 | 1.5 px |
| Leader (1 on 3, core at 0.7) | 7.4 : 1 | 8.7 : 1 | 1.2 : 1 | 1 px |

- Normal and hot lines: low risk. The white core is invisible against cream on its own, as expected; the casing
  carries it at 8.7 : 1 and the core stands at over 11 : 1 inside it. They will read as white lines on a dark edge.
- Leaders: moderate risk of reading wrong, not of vanishing. A 1 px core at 0.7 that does not land on a pixel
  boundary spreads over two pixels at about half strength, which is roughly 3 : 1 against the casing. On cream a
  leader will then read as a 3 px dark line with a faint grey centre, not as a thin white line. Nobody has looked
  at one.

## 6. Hard rules

- No data file, budget, `MapStage.tsx` or copy change. No new wording.
- Both commits carry a `Claude-Session:` trailer. RULES.md asks for exactly one trailer and forbids copying that
  line. If the harness adds it by itself this is not the implementer's doing, but the rule as written is broken.
- "Smoothness is the core": the change doubles the line writes and the stroked area, and no timing was taken (the
  rules forbade it without a brief). Unverified, not shown wrong.

## Findings

### Critical

None.

### Important

- **I1. No test ties a casing to its core.** `frontcreck/e2e/focus.spec.ts:44-45` counts casings and checks group
  order only. Fix: in the same test, read both groups' children and assert, index by index, that the casing's id
  (`data-case` / `data-leader-case`) equals the core's (`data-to` / `data-leader`), that `x1, y1, x2, y2` are equal
  for every recommendation pair, and that each leader pair has the same `display`. In the hover test
  (`focus.spec.ts:109`, `:116`) also assert `line[data-case="<id>"]` has `data-hot="true"`.
- **I2. The acceptance item "lines read on the brightest cream gas" is not shown by the pictures.**
  `docs/design/trifid-theme/reviews/app-part2/task4-album-open-desktop.png` and `-phone.png` have gas of 56 to 122
  beside the lines, not 208. Fix: either capture an album whose line crosses gas of median luminance 180 or more
  (measure a band beside the line, stars excluded, not the peak under it), or record that the item is accepted on
  the computed contrast above and correct the report's "up to 208".
- **I3. Cost unmeasured.** `MarkerDriver.tsx:31-45`, `:134-163`: up to 100 DOM writes a frame against 50, and
  twice the stroked area in a full-layer SVG. Fix: one hover and pan timing run on mains before this merges, with
  an album open, against `3d8ee1f4`.

### Minor

- **M1. Leader on cream never looked at.** `map.css:79`, `:82`. Fix: capture one moved cover on bright gas; if the
  core reads grey, raise the leader core to `rgba(255, 255, 255, .92)` (needs a plan change, the value is the
  plan's).
- **M2. Same-value attribute writes are not skipped.** `MarkerDriver.tsx:36-44`, `:157-158`. Fix: keep the last
  four tenths per line in a `Float64Array` on `Work` (index `4 * j`) and the last shown flag per leader, and
  return before the writes when they are equal. No allocation, and it makes hover, cover-fade and gas-fade frames
  write nothing to the SVG.
- **M3. A leader casing in the wrong group would pass.** `focus.spec.ts:44`. Fix: also assert
  `g.mk-case line[data-leader-case]` has count 6 and `g.mk-core line[data-case], g.mk-case line[data-to]` has
  count 0. Covered if I1 is done by index.
- **M4. The phone bead.** A true-position ring on a recommendation's own minimum-length line, with the leader on
  top of the line. Fix: none here; note for part 3's ring restyle, or hide a leader whose end lies on its own
  recommendation line.
- **M5. `Claude-Session:` trailer on `94b7782b` and `d8feb77b`.** Fix: reword without it if the commits are
  rewritten for the rebase anyway; otherwise record it.
- **M6. Report wording.** `p2-task4-report.md` says "built per frame: nothing"; true of the line block, not of
  `paint` (`MarkerDriver.tsx:167` closure when hovered, the style strings). It also says the core is thinner than
  the approved picture, which the pixels do not support. Fix: correct both sentences.
- **M7. Silent skip.** `MarkerDriver.tsx:127` draws no lines at all if the SVG does not have exactly two children.
  Fix: fine as a guard; I1's test is what makes it safe.
