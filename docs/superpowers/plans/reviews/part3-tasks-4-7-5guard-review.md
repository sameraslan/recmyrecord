# Part 3 Tasks 4, 7 and the Task 5 guard: independent review (2026-10-06)

Worktree `wt-perf`. Commits read: `92dd7796` (Task 4), `7c0ef8c0` (Task 7), `9cca1eb1` (Task 5 guard), `3c770909` (pictures). The report names other shas (`b783affd` and so on); the subjects and contents match, so the branch was rebased after the report was written. Read-only review: no build, no browser. Unit tests run here: `contrast.test.ts`, `shaders/album.test.ts`, `src/styles` = 78 passed (Node 22 arm64).

## Verdicts

| Task | Spec | Quality |
|---|---|---|
| 4, casing | Met. One departure from the plan, and it is right. | Good. Three Minor items. |
| 7, tests | Met as the plan writes it. Not loosened in what it can catch, with one gap to close (overlapping covers) and two small tightenings. | Good. |
| 5 guard | Met, stricter than the plan. | Good, but never seen red: one bite run owed. |

Nothing Critical.

## 1. Task 7, `explore.spec.ts`: old against new

Old: `git show 9f863332:frontcreck/e2e/explore.spec.ts` L295-328. New: `frontcreck/e2e/explore.spec.ts` L333-380, helpers L52-113.

| # | Old assertion | What it proved | New assertion | Class |
|---|---|---|---|---|
| 1 | Four points 36 px out (right, left, top, top + 20) within 30/30/35 of amber | The pick is drawn 64 px (a 32 px cover's frame would be 20 px out), framed, in the frame colour, with nothing over the frame at those points (on top) | Same four points within 16/16/18 of `rgb(241, 236, 228)` (L352) | Tightened window. The colour is less distinctive than amber (a white sleeve or pale gas could match), which is what row 2 is for |
| 2 | none | | With the pick cleared the four points are not all frame-coloured (L379) | New. Proves at least one of the four was the frame, not all four (Minor M1) |
| 3 | `.map-sel` opacity 0 | The DOM ring gives way to the shader's frame | Same line (L353) | Equivalent |
| 4 | Click 24 px out on both axes keeps the album selected, card visible | Hit area follows the drawn 64 px size | Same lines (L355-359) | Equivalent |
| 5 | Mean luma of one band, less 19, under 0.7 of its undimmed value | Other covers step back by at least 30 percent, averaged over a band that held lone covers, overlapping covers and bare pane | Mean luma standard deviation inside 20 px boxes on up to 12 lone covers under 0.7 of undimmed (L375) | Changed in kind. See below |
| 6 | none | | At least 4 lone covers (L368); undimmed detail above 6 (L374) | New guards: the measure cannot pass on nothing |
| 7 | Ran on desktop and phone | | Same; phone has 12 boxes | Equivalent |

**Is the detail ratio the same quantity as the old luma ratio?** Not the same statistic, the same parameter. A lone cover at alpha `a` over a backdrop that is flat across the box shows pixel `a*C + (1-a)*B`. The old measure took the mean above a known floor (scales by `a` only when `B` is the constant 19); the new takes the spread (scales by `a` for any `B` that is flat over 20 px). Both read the cover's alpha factor. The measured 0.48 and 0.50 against `SELECTION_DIM = 0.5` confirm it reads alpha and that the gas adds no detail of its own at that scale. The old measure is truly invalid now: `B` is gas of unknown brightness, so a mean can move either way.

**Can the new test fail?** Dimming removed: ratio 1, fails at L375. Frame the wrong colour: fails at L352 (pure white fails on green, 19 off). Pick not large: the frame is not at 36 px, fails at L352. Pick not on top: a cover over the frame at any of the four points fails L352, as before. Yes on all four.

**Is the stand-alone measure a sidestep?** No at the level of the mechanism, yes at the level of what a browser test now looks at.
- The shader has one dimming line for every other cover, per fragment: `if (v_selDim > 0.5) alpha *= mix(1.0, u_selDim, v_coverT);` (`shaders/album.ts` L372). There is no path by which a lone cover dims and an overlapped one does not. `shaders/album.test.ts` L186-189 pins that line, pins `SELECTION_DIM` at exactly 0.5, and forbids darkening towards the backing colour. So the constant cannot drift under the 0.7 line unnoticed.
- But the old band did include the piles, and the new boxes exclude every cover with a neighbour within 27 px. A change that altered only how stepped-back covers lie on each other (blend order, depth writes, a discard) would have moved the old number and cannot move the new one. The owner's "nice blur effect" is exactly that look. Finding I1.
- The 0.7 line is the same number on an easier sample: lone covers sit at 0.50, while the old band (lone at 0.5, piles nearer 0.7) sat higher, so the same line now leaves more room. The unit pin covers it; finding M2 tightens it anyway.

## 2. Task 7, the rest

- Amber grep: `grep -rn -i "amber" frontcreck/src frontcreck/e2e` prints nothing here too. It only finds the word. It would not find an amber value.
- `--acc: #d9a066` (`globals.css` L35): used by two rules only, `.tags li.lit` (`album.css` L33) and `.rec-main::before` (`album.css` L42). Both are inside the album panel, where `AlbumPanel.tsx` L66 sets `--acc` from the album in an effect. `lit` depends on a hovered or focused row (`AlbumPanel.tsx` L42), and the bar is `opacity: 0` until then, so neither can show before the effect has run. A visitor never sees the default. Leaving it is right.
- `#2c241c` (`search.css` L50): fallback for `--fb`; `Cover.tsx` L35 always sets `--fb` inline. Never shown. (`TILE` in `Cover.tsx` L10 is still three brownish tones, `#3b2a22`, `#2c3024`, `#3b3120`: shown while a cover has no image. Not this task's table; noted as M8.)
- Other files in the commit: `types.ts` comment only. No other test touched. `search.spec.ts` was already done.
- Plan Step 7 (whole suite, three projects) not run: stated in the report; owed after the rebase per the reconciled note.

## 3. Task 4

- **The departure is correct.** `.fab-map--on:focus-visible` (0,2,0) outranks `.fab-map` (0,1,0, `phone.css` L36, z-index 12), so the plan's rule would have dropped a focused List button to z-index 1. It would also have made stacking contexts of `.map-explore` and `.card .x` for nothing. The split rule is pinned both ways in `contrast.test.ts` (`Object.keys(cased)` is `['box-shadow']`; the zoom rule is exactly `{ 'z-index': '1' }`).
- **Stacking.** `.map-zoom` is positioned with no z-index, so the lifted button sits at 1 inside `.map-ui`'s context: above the hint (-1) and the z-auto siblings (card, slider panel, Explore button), below `.map-tip` and `.map-msg` (7, outside). It overlaps none of them: desktop card is bottom left; on phone the corner is hidden with a card (`map.css` L202) and ends 8 px above the slider, so the 7 px band stops 1 px short of the panel. Nothing is raised over something it should sit under.
- **Clipping.** Zoom stack: handled by the lift (picture 1: the band lies over the top 7 px of zoom-out and comes within 1 px of the names button; reads fine). List button: 12 px from the stage's top and right, band 7 px, clear. Explore: 20 px (12 on phone), clear.
- **Size, position, hit targets.** Box shadow and z-index only. The browser tests assert the focused control's box is equal before and after, and the ring's box is square, under 21 px and centred within 0.51 px. `.map-sel` is `pointer-events: none`.
- **Where it is drawn.** CSS only (`map.css` L30-31). No shader edit. Nothing new per frame: `OverlayDriver` L66-74 writes the same four styles as before; the shadow repaints a 22 px element only when its size changes (zooming among dots).
- **Wide enough at 1x?** The three pictures are all 2x. At 2x the selected ring is a clear bullseye and the hover ring reads on the palest cream. At 1x the casing is 2 device px outside and 1 inside, and the report's 1x numbers (10.25 on casing, 11.76 casing on gas) are sampled unblended, so it carries; but nobody has looked at a 1x picture. M3.
- **`.map-explore` over white, not gas: acceptable.** White is worse than any gas a view can put there, and the ring on its casing is at least 10:1 over any backdrop, so one pair always holds. It also covers the case the report did not reach (album open, visitor zooms out to dots, gas back at full strength).
- **Hover ring on a dot:** see M4.

## 4. The phone bead

Looked at `task4-rings-phone.jpg` (right pair). Between cover 3 and the seed there is a 24 px line with a small ring on it, like a bead on a string. At 1x it is about 10 px across on a line 2 px wide.

- Who draws what: the ring is the shader's (`shaders/album.ts` L382-388, `v_anchor`, radius 3.4, casing band 3.5 px), on the album's true position. The line is `MarkerDriver`'s SVG, seed frame to cover frame (`MarkerDriver.tsx` L158-166), and the leader from the cover back to the true position is the same driver (L169-185). Here the layout pushed cover 3 outwards along the line to keep `MIN_LINE_PX = 24` (`focusLayout.ts` L15), so the true position lies on the line and the leader lies on top of it. Not a phone-only case: the same 24 px rule runs on desktop.
- Is it a defect? Small. It is truthful (the album really is there) and it is not confusing, but it is a shape no approved picture shows, and a visitor who notices it sees a stray knob on one line. It is not Task 4's doing: the ring and its casing came with part 2.
- Recommendation: **do not fix it inside this task; show the 2x crop to the owner with the next visual round.** If the owner wants it gone, the smallest sound fix is to hide the ring when its true position lies on the seed line: a per-album "no ring" flag written by `MarkerDriver` when the layout settles, read where `v_anchor` is set. Condition: the true position is within about 5 px of the seed-to-cover segment and between the two frames. Cost: one small uniform, written only when the set of flags changes (compare at most ten values on layout frames, nothing at rest, nothing on the pointer path), one extra canvas frame when it flips. It touches the shader and part 2's files, so it is its own change with its own test.
- Not the other two: ending the line at the ring's edge leaves a 4 px stub and a cover that looks cut off from its seed; dropping the ring's casing there makes the ring vanish on bright gas while the line still shows a bump.

## 5. Task 5 guard (`e2e/phone.spec.ts` L224-277)

By reading:
- Names button missing: fails at `toBeVisible` on `.map-zoom .map-names`, and again on the count (exactly 4).
- A button under 44 px: fails on `b.w` or `b.h` (rounded, so 43.5 passes, as in the plan). A hidden button is filtered out and then fails the count.
- Corner over the slider at 360 px: fails on `mode.y - (last.y + last.h) >= 7`. `.mode` is the panel itself (`SimilaritySlider.tsx` L13, `mode panel`).
- Against the plan: stricter everywhere. Exactly 4 in both states (plan: at least 4, at least 3); every button wholly on screen; the top button must be the names button with at least 7 px under it; waits for the names button and for animations. Nothing loosened.
- Never seen red: I2.

## 6. The four desktop failures in the combined run

From `_notes/logs/p3-t475-final-desktop.log`: `explore.spec.ts:201` and `:342` (via `pickKnown` L24) timed out in `waitForCameraIdle` at `helpers.ts:45` (10 s for `isAnimating()` to clear); `:239` in `waitForMap` at `helpers.ts:36` (20 s); `:264` in `waitForMapQuiet` at `helpers.ts:74` (15 s). One test took 5.0 minutes of wall clock to report a 15 s timeout, which means the page itself was stalled. None is a race in the test's logic: each waits on a real state, with a fixed wall-clock budget, and the software-rendered map did not get frames under load 12 to 17. Plainly load. Green twice alone confirms it. Not worth changing now; if it recurs on a quiet machine, the tightest one is the 10 s at `helpers.ts:45` (raising a wait budget is not loosening an assertion). Record `explore.spec.ts` desktop as load-sensitive in a combined run beside the known flaky list.

## 7. Hard rules

- First load: CSS, a comment and tests only; meter 190.82 KB, 11 scripts, unchanged. `MapStage.tsx` 19,732 bytes, untouched.
- `framing-baseline.json`, `budgets.json`, `public/data`, pipeline files: not in the diff (ten files changed, listed above).
- Nothing at rest, nothing on pointer move. No new wording. Text contrast untouched; marks hold 3:1 by test.
- Tests: additions, plus the one rewrite classified above. Twinkle TODOs left for part 2 Task 8 as the reconciled note says.

## Findings

**Important**

- **I1. No browser check looks at overlapping covers any more.** `frontcreck/e2e/explore.spec.ts` L92-109 (`otherCoverBoxes` drops any cover with a neighbour within 27 px), L375. The old band averaged the piles too. Fix: keep the lone measure as it is and add a second sample in the same test: 20 px boxes on covers that do have a neighbour within 16 px (same canvas and pick exclusions), detail with the pick under detail without it by a line set from one logged run (expect about 0.55 to 0.75; assert under 0.85). It fails if piles stop stepping back, and it puts a number on the look the owner asked to keep. Also have the states reviewer compare `explore-selected-cover` (the test's own screenshot) with the baseline for the piles.
- **I2. The phone guard was never seen red.** `frontcreck/e2e/phone.spec.ts` L224-277. Project rule: see it fail for the right reason. Fix: one bite run at the next slot through the lock, for example `.map-zoom .map-names { margin-bottom: 0 }` (expect the 7 px line at L257 to fail) or `--zb: 40px` in `phone.css` L44 (expect L244), then revert and record the red output in the report.

**Minor**

- **M1.** `explore.spec.ts` L379: `every(isFrame)` false proves one point of four. Fix: `expect((await pixels(page, framePoints)).map(isFrame)).toEqual([false, false, false, false])`; if a point is honestly pale without the pick, use another album as the plan says, not a weaker line.
- **M2.** `explore.spec.ts` L375: 0.7 on lone covers leaves more room than 0.7 did on a band with piles (measured 0.48, 0.50). Fix: 0.6. `album.test.ts` L187 already pins 0.5, so this is belt and braces.
- **M3.** No 1x picture of the selected ring or the hover ring. Fix: add one 1x crop to `task4-rings-desktop.jpg` (or a second file) and look at it at native size.
- **M4.** The hover ring on a dot has a measurement and no test. It is the shader's and part 2's, but it is the same risk as the selected ring. Fix: one desktop test in `glass.spec.ts` in a 2x context (`browser.newContext({ deviceScaleFactor: 2 })`), where the 1.5 px stroke is 3 device px and can be sampled clean: reuse the brightest-gas pick, move the mouse onto the album, wait for the label, sample the stroke at radius 7 and the casing 1.5 px either side on four sides, gas from a second shot with no hover; stroke on casing at least 3, gas on casing at least 3, gas above 0.4.
- **M5.** `.fab-map--on:focus-visible` has a unit pin and no browser check. Fix: a phone-project test that Tabs to the List button in map mode, asserts its box unchanged and its computed `z-index` still 12 and `box-shadow` the 7 px band.
- **M6.** `map.css` L39 also cases `.card .x` (positioned, so its band paints over the card's text): a focused close button puts an 80 percent dark band over the last 7 px of a full-width title line (`.card .t` keeps only 28 px clear, the band reaches 51 px from the card's right edge). Fix: capture the card with a long title and the close button focused; if a glyph is cut, raise `.card .t` `padding-right` to 40 px. Do not change the pinned selector.
- **M7.** The bead (section 4): owner's call, not this task.
- **M8.** Noted outside the tasks: `Cover.tsx` L10 `TILE` and `e2e/gas.spec.ts:38` still carry the old brown palette or its comment; the report's item 6 covers the second.
- **M9.** The report's commit shas are stale after the rebase. Fix: update the table to `92dd7796`, `7c0ef8c0`, `9cca1eb1`, `3c770909`.
