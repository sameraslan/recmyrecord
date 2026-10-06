# Part 3 review: Task 6 (Home, About, 404 over the nebula), fix round on Tasks 1 and 8, Task 2 fix round 1

Commits read by id: `dc0dce9c`, `8d556119`, `40b868a8`. Read-only: nothing built, no browser run. Every number below that is not from the implementer's report was measured by me on the committed JPEGs (`_notes/scratch/p3-task6-review/`, `lum.py`), which are software-renderer captures at 1440 x 900 against an approved picture at 1600 x 1000. Paths are under `frontcreck/` unless they start with `docs/`.

## Verdicts

| | Verdict |
|---|---|
| Spec (plan Task 6 + reconciled section + rulings) | **Met with declared departures.** `GAS_DIMMED_STRENGTH = 1`, veil, pad, scrim, `gas.test.ts` rewrite, the extra brightness test are all in. Three values left the plan's ladder (pad shape, shelf .82, 404 .73); each is declared and has a measurement behind it. |
| Quality (code and tests) | **Good, with two test holes** (I2, I3): the worst case the values were tuned on is not in a committed test, and `panBrightestGasUnder` does not check that the gas arrived. |
| Fidelity of Home | **Falls short of `final-home.jpg` on desktop; phone is fine.** The nebula is still there and the page is not murky, but the part the pad change dims is the brightest band of the picture, and on a real laptop window it will be worse than the capture shows (I1). 404 is murky (I4). |

## 1. Fidelity of Home (the important part)

What I see, capture beside approved picture:

- **Phone Home: good.** The whole bright core sits between the links and the shelf, undimmed. Nothing to change.
- **Desktop Home: the nebula is present but it is no longer what the eye lands on.** In the approved picture the links sit on the upper edge of a cream and blue ridge about 250 px tall that runs on, softened, behind the caption into the covers. In the capture that ridge is a strip about 100 px tall between the pad's tail and a hard dark floor at the shelf.
- Measured (mean luma 0 to 255, same relative regions): band just under the links **94.8 approved, 49.9 capture** (95th percentile 188 against 100). Lower core 89 against 77. Behind the caption 61 against 33. So the band directly under the links is at about half the approved brightness; that is the pad's extra 24 px of reach plus its blur tail (about 50 px more), plus .78 for .72.
- Not all of the gap is this task. Left of the hero, outside the pad, the rust gas is 44.5 approved against 19.5 capture: the software renderer and the smaller canvas draw a dimmer, smaller nebula than the prototype. The committed captures cannot separate "pad too dark" from "renderer dimmer". See I5.
- The approved picture itself does not hold 4.5:1: I measure its link backdrop at a level that gives dust about 4:1 at the 80th percentile and its caption about 3.8:1. Some dimming beyond the approved picture is forced by the hard rule. The question is only how much area pays for it.
- Two further differences on every desktop load, not from Task 6 but on the same page: the focused search field is an opaque slab with a 2 px off-white frame (the approved field is see-through with a faint edge); the header strip (Task 3, known).

**I1 (Important). The pad fix dims a 650 px wide, about 80 px deep band of the brightest gas to protect two words about 240 px wide; and at real window heights it leaves no bright nebula at all.** `src/styles/home.css:10` and `:64`.
- The pad and the shelf scrim are both `z-index: -1` in the `.home` stacking context and the shelf is pinned to the bottom (`margin: auto auto 0`). At 900 px of height they are about 100 px apart. A 1440 x 900 laptop gives a browser about 780 to 800 px of page height, 1366 x 768 about 650: there the pad's tail and the scrim's ramp meet or overlap and the core is double-dimmed. The capture at a 900 px viewport is the kind case. Nobody has looked at 1440 x 790 or 1280 x 720.
- Why the plan's pad measured 2.55: the helper measures the link's **content box, which is the 44 px tap target**, not the words. The glyphs are 15 px tall in the middle of it; the bottom 14 px of the box is empty and lies in the pad's thinnest part. The measurement is honest but harsher than what a reader sees, and the fix was sized to it.

### Recommended alternative

In order of preference; measure each (one number per run, as the plan's ladder says).

**A. Keep the prototype's pad (`.72`, `-4px`) and give the link row its own small pad.** In `home.css`: `.hero-row { position: relative; }` and
`.hero-row::before { content: ""; position: absolute; inset: 4px calc(50% - 150px) -6px; z-index: -1; background: rgba(5, 4, 8, .5); border-radius: 22px; filter: blur(12px); pointer-events: none; }` (start at .5, ladder up by .06).
- What it buys: the dimmed area below the links shrinks from about 650 x 80 px to about 300 x 30 px, so the cream ridge left, right and below the links stays as approved; the rust behind the heading goes back to .72.
- Cost: one more static pseudo-element and one more pinned number; a risk that the pill reads as a smudge if it has to go above about .6 (look at it on the brightest-gas view, not only a fresh load). No colour change, nothing for the owner to approve. Arithmetic says it should pass: over veiled cream, dust needs a combined darkness of about .67; the pad's tail gives roughly .45 at the row, the pill at .5 brings it to about .72.

**B. If the owner accepts brighter links: paper instead of dust for the two hero links** (`.hero-row .textbtn { color: var(--color-paper); }`). Paper tolerates a backdrop twice as bright (ratio x 1.6). From the implementer's own table: `.72` with `-16px` would give about 6.0 on a fresh load and about 5.4 with the brightest gas, so the pad goes back to .72 and gives up 12 of its 24 extra px. With A as well, the pill can drop to about .3.
- Cost: a colour change (owner's approval); the links lose their hover colour step (dust to paper), so "Surprise me" needs another hover cue (an underline that appears); the links then weigh the same as the heading and outrank the lede.

**C. Measure the words, not the tap target, for these two selectors** (`contrastOverBackdrop(..., { box: 'text' })`, the option added in `40b868a8` for exactly "a wide block with a short text"). Worth about 11 px of pad reach. It is a change of what the test measures and must be decided by the orchestrator and written into the commit message; I would only take it together with A or B, and keep the brightest-gas test (I2) on the content box of the lede and the caption.

Not recommended:
- **Text-shadow halo.** Cheap to paint (static text), but `contrastOverBackdrop` forces `text-shadow: none` (`e2e/helpers.ts`, the style tag), so the test cannot credit it; teaching the helper to credit halos weakens it for every other caller. The region-name halo the brief mentions is not in this tree (no `text-shadow` anywhere in `src`). A pad shaped to the row (A) is the same idea in a form the helper can measure.
- **Heavier weight.** WCAG's 3:1 allowance starts at 18.66 px bold; these are 15 px. No gain without making them a different element.
- **Lamp-colour links.** `--color-lamp` is `#f1ece4`, the same as paper for this purpose: it is option B.

**I4 (Important). The 404 at `.73` is the murky page.** `home.css:45`. A full-screen scrim at .73 over the whole nebula to protect a text block about 520 x 200 px; in `task6-desktop-404.jpg` and `task6-phone-404.jpg` the nebula is a grey-brown ghost. It contradicts "swirl and beauty first" more than Home does (no approved picture exists, so this is judgement). Fix: scrim back to about `.3` (About's value) and a blurred pad behind the text, as the hero has: `.notfound::before, .page-msg::before { content: ""; position: absolute; left: 50%; top: 50%; width: min(680px, 100%); height: 380px; transform: translate(-50%, -50%); z-index: -1; background: rgba(5, 4, 8, .78); border-radius: 40px; filter: blur(26px); pointer-events: none; }` (`.notfound` is a stacking context already; ladder the .78). Pin both in `glass.test.ts`, measured by the existing e2e.

**I5 (Important). The captures cannot settle the fidelity question.** They are 1440 x 900 on the software renderer; the approved picture is 1600 x 1000 on a GPU. Before the owner is shown Home, capture it on a GPU at 1600 x 1000 (like for like), and at 1440 x 790 and 1280 x 720 (what a laptop window gives), with the current CSS and with alternative A. Show the owner images first, as his rule says.

**I6 (Important, owner's call; from the Task 2 round, visible on Home).** `src/styles/search.css:45` (M4) makes the hero field opaque on every desktop load, because the field takes the focus on load; with the lamp token now off-white the focus border is a bright white frame, the loudest thing on the page. The approved picture shows a see-through field with a faint edge. The implementer raises it as question 2. Suggested: on the hero only, stay glass until something is typed (`.combo--hero .combo-field:focus-within:has(input:not(:placeholder-shown)) { background: var(--color-room-3); }` in place of line 45) and ask the owner about the frame. Also Minor: while the field is opaque it still carries `backdrop-filter` (wasted blur during the Home to map glide); add `-webkit-backdrop-filter: none; backdrop-filter: none;` to whatever rule makes it opaque.

Shelf scrim `.82` for `.76`: **accepted** (Minor M1). `.76` measured 4.47; ash over veiled cream needs about .76 flat, and a 95th percentile with stars in it needs a step more. The visual difference between .76 and .82 behind the covers is small. What does show is the scrim's **edge**: 0 to .82 in 30 px across the full width draws a floor line through the nebula's tail (capture y about 600) where the approved picture lets the gas run into the covers. Try a longer ramp that still reaches .82 at the caption: `inset: -40px -50vw 0` with the stop at `76px`. Alternatively, with the owner's leave, `.shelf-now .cap` in dust lets the scrim return to the prototype's .7 (5.20 over cream by the reconciled table).

## 2. `gas.test.ts` rewrite

- Old test proved: the constant is inside (0.3, 1), i.e. the shader dims the backdrop pages somewhat and never to nothing. It never proved that `GasField` applies the constant.
- New test proves: the constant is exactly 1.
- No longer proved by any unit test: that the gas is dimmer on these pages than on the map. That property was reversed by the owner's ruling, so it cannot be kept. What stands in for the old upper bound's purpose (text sits on something darker than bare gas): exact CSS pins in `glass.test.ts` and the browser measurement in `pages.spec.ts`.
- **Not loosened.** A range became an exact value, the reason is in the test comment and the commit message, and the replacement tests are stricter than a constant. One reservation: the browser test that stands for "Home's nebula is as approved" was never seen red (section 5).
- Minor M2: `GasField.tsx:999-1002` now eases 1 to 1 (dead code) and comments in `MapStage.tsx`, `AlbumField.tsx`, `home.css:1` still say "dimmed map". Left on purpose per the reconcile; tidy when `GasField` is next touched.

## 3. Speed

- `GAS_DIMMED_STRENGTH = 1`: no shader text change, no extra pass, the uniform was already written each drawn frame. It removes work: the 0.6 to 1 easing on Home to map used to keep the gas drawing for about 0.7 s; the dots' own easing still does.
- `.hero::before` and the (proposed) pads: `filter: blur()` on a flat, static pseudo-element. Nothing in `home.css` animates it; it is not a backdrop filter, so its input is its own flat fill, not the canvas. At rest the canvas draws nothing, so nothing re-composites. It is re-filtered only where something under or over it is damaged: the caret blink (a few pixels), the Home to map fade (`.home` fades, about 0.4 s), and, **once part 2 Task 8 lands, any glint that plays under the pad**. Minor M3: when Task 9 times Home, time it with glints on; if the pad shows up, the same look with no filter is a box-shadow raster (`background: none; box-shadow: 0 0 52px 26px rgba(5, 4, 8, .78)` on a box inset by 26 px), which is painted once into the tile.
- `.shelf::before` and the 404 scrim are plain gradients/fills: free.
- "0 frames at rest" (`pages.spec.ts:275`): real. It counts `window.__rmr.frames` over 3 s after `waitForGasSharpSettled`, on all three pages, the same pattern as the glass test. It is a guard (it passed before the change too) and it counts canvas draws only, not compositor cost; the test comment in `glass.spec.ts:102` now says so, this one should say the same. Compositor cost is untimed (battery): still open for Task 9.

## 4. Contrast tests

- Scrolling: `scrollIntoViewIfNeeded` only scrolls when the element is out of view. On Home (desktop and phone) every measured element is in view at load, so nothing moves and the test measures what a visitor sees at load. Only About's credits scroll, and they are on the glass card. No flattering here.
- The hardened helper refuses cut and empty rectangles; that caught a real sliver (About's credits). Good.
- **I2 (Important). The worst case is only a scratch probe.** `pages.spec.ts:244` measures one backdrop per page: a fresh load at the project's viewport. The values that left the plan were chosen on a different measurement (brightest gas panned under each element at 1x and 3x; `.72` at 28 px passed fresh at 4.58 and failed there at 4.14; shelf `.76` gave 4.47 there). That measurement is in `_notes/scratch/p3-task6/`, not in the repo. So nothing committed explains or defends `.78` and `.82` except exact-value pins, and any other viewport size (which puts other gas under the links) is untested. Fix: add a committed test "Home text keeps 4.5:1 with the brightest gas under it" using `panBrightestGasUnder(page, sel, '.home, header.top')` for `.hero .lede`, both links and `.shelf-now .cap`, and the same for the 404's sub line and link; first check that Home keeps a panned view (the report says a visitor reaches it by moving the map and going Home: then the test should do exactly that, pan on `/map`, then client-navigate to `/`).
- **I3 (Important). `panBrightestGasUnder` does not check that the gas arrived.** `e2e/helpers.ts:347-387`: it returns `move.m`, the mean of the window it found **before** the pan. `CameraBounds` clamps the camera to the padded cloud box (`state/bounds.ts:260-272`); the hint sits in the bottom-left corner, so the pan that would bring the core there can be clamped, and the test at `glass.spec.ts:195` would then assert `> 0.4` on a number that no longer describes what is under the words. The measured 5.54 is below the flat-gas arithmetic (about 6.3), which suggests bright gas did arrive this time, but the helper cannot tell. Fix: after `waitForMapQuiet`, take a second screenshot with `hide` applied and return the mean luminance of the target's own rectangle; assert on that.
- Minor M4: the percentile caveat in the report (3.75 and 3.54 against the single brightest pixel, a star) is inherent in the helper and was accepted in the Task 2 review; star brightness is random per load, so margins near 4.5 can flake. The lowest committed fresh-load number is 5.14 (404 link); fine.

## 5. Tests never seen red: can each fail for the right reason?

| Test | Verdict |
|---|---|
| `pages.spec.ts:289` "Home shows the nebula nearly as bright as the map" | **Probably, not shown.** It compares the 20 brightest 40 px cells, same camera asserted, hero and shelf hidden, veil kept. The claim "0.6 fails" is `0.6 x 0.9 = 0.54`, which assumes screenshot luma is linear in the shader's strength. The brightest cells are the ones most likely to sit in the shader's highlight roll-off, where a 0.6 strength costs less than 40 percent; S1's "half as bright at 0.6" supports the claim but was measured on a different region. **See it red once** (set the constant to 0.6, run this one test on desktop, restore): one browser run. Also note what it does not cover: it hides `.home`, so it says nothing about how much the pad and scrim leave visible (that is I1). Minor: the dots are still dimmed on Home and are inside those cells; with 0.90 measured against the veil's 0.9 their share is negligible. |
| `glass.spec.ts:153` hover label over the hint band | **Yes.** Three independent checks would fail if the fix were undone: computed z-index against `.map-ui`, `filter: none` and solid background, and the brightest pixel of each line against the line's colour (a .62 to .78 band over the label would bring it to about 0.3). |
| `glass.spec.ts:195` hint over the brightest gas | **Yes for a weaker band, with the hole in I3** (it can pass on dark sky without noticing). |
| `glass.spec.ts:213` wrapped hint over white | **Yes.** White is forced, the wrap is asserted, the words' rectangle is measured; the old 50% stop gives 3.9 by arithmetic and the unit test for the same rule was seen red. |
| `glass.test.ts` surface list (9) and "hover label is solid and above the hint band" | **Yes.** Re-adding `.map-tip` to the glass rule, adding a `backdrop-filter`, or lowering the z-index each fail it. |
| `glass.test.ts` "focused Home search field" | **Yes, weakly:** it only checks the rule's text exists after the hero rule. Enough for a pin. |
| `contrast.test.ts` "hover label is paper and dust on a solid surface" | Seen red. Fine. |

None is unable to fail. Two need work: `:289` (see it red) and `:195` (I3).

## 6. Task 2 fix round

- **Hover label at `z-index: 7`** (`src/styles/map.css:11`): **not a regression.** It used to slide under the slider panel, card and zoom buttons, where on desktop it was blurred through glass and unreadable; now it lies over them for as long as the pointer is on a star beside them, like any tooltip. It has `pointer-events: none`, so nothing under it is blocked. It stays under the album panel (10) and the header (60).
- **Cleaner fix?** Putting the band in a lower layer means taking it out of `.map-ui` (a stacking context at 6): a second element that must follow `.map-ui`'s animated `left` and the hint's two hidden states. More DOM and state for no visible gain. The one-line z-index is the cleaner fix. Keep.
- **Wrapped hint** (`map.css:63`): stop at `44px` = top padding, tied together by `contrast.test.ts`. Correct; a third line would still start below the stop.
- **Solid hover label:** `rgba(10, 9, 14, 1)` is the value every panel takes on phones, without `backdrop-filter` support and with reduced transparency, with the same border and shadow, so it belongs. Over dark sky it is indistinguishable from glass; over bright gas it is a shade darker and flatter than the panel next to it. Acceptable for the element that moves every hover frame. Minor M5: it is a bare literal repeated from `globals.css`; a `--color-float-solid` token would keep the four copies together.
- **Helper hardening:** the cut/empty refusal and `{ box: 'text' }` are right. Open: I3.

## 7. Favicon

- `favicon-sizes.png`, 16 px entry of the ico: **yes, it now reads as three stars joined by a triangle of lines.** The level top line and 1 px lines at 70 percent did it. Before, it was one blob.
- `icon.svg` drawn at 16 px (what a Chrome or Firefox tab uses): three stars and a triangle are legible; the tilted top line is two rows of half-bright pixels and the two small stars are about 2 px. **Good enough**: at tab size it reads as the mark. The panel is a librsvg render, not Chrome; nobody has looked at a real tab (not verified).
- Minor M6: the three sources no longer agree. `icon-16.svg` has a level top line, `icon.svg` a tilted thin one with small stars (r 3, r 5), `apple-icon.svg` the old thick lines and big stars. At 32 px (retina tab, the ico's 32 and 48 entries) the mark is now noticeably lighter than the apple icon. If the soft line bothers anyone, level the top line in `icon.svg` only (the apple icon is never seen beside it).
- `icons.test.mjs` binary tests: real (seen red on the stale ico). Four sample points per image, as the report says.

## 8. Hard rules, wording, first load

- No change to data files, `budgets.json`, `MapStage.tsx` (19,936 bytes), positions. No new site string. First-load 191.21 KB, 11 scripts (report; +0.04 KB against 191.17, not explained, within noise of CSS-free JS: ask for the per-chunk table if it matters).
- Contrast 4.5:1: holds on every committed measurement; the worst case is uncommitted (I2).
- 0 frames at rest: tested on all three pages.
- Not rerun on the final tree: explore, map, focus, flows after the last two CSS values changed (they do not open Home or a 404; acceptable). `phone`, `opening`, `search`, `album` specs not run in the session.
- `// TODO(part2-task8): twinkleOff(page)` stands in three tests; the 4.5:1 test on Home will need it the day glints land (tracked in the reconcile).

## Findings

**Critical:** none.

**Important**
- I1 `src/styles/home.css:10`, `:64`: the hero pad (.78, 28 px below the links) halves the brightness of the band under the links (94.8 to 49.9 mean luma) across the hero's full width, and at laptop window heights its tail meets the shelf scrim so no bright core is left. Fix: alternative A (prototype pad + a small pad behind `.hero-row`), optionally B and C.
- I2 `e2e/pages.spec.ts:244`: the brightest-gas measurement that set `.78` and `.82` is a scratch probe, not a committed test. Add it with `panBrightestGasUnder`.
- I3 `e2e/helpers.ts:347-387`: `panBrightestGasUnder` returns the pre-pan brightness; a clamped pan passes unnoticed (`glass.spec.ts:195`). Re-measure under the target after the pan and assert on that.
- I4 `src/styles/home.css:45`: the 404's full-screen `.73` scrim turns the nebula to mud. Fix: scrim about `.3` plus a blurred pad behind the text block.
- I5 captures: software renderer at 1440 x 900 against an approved 1600 x 1000 GPU picture. Capture on a GPU at 1600 x 1000, 1440 x 790 and 1280 x 720 before the owner sees Home.
- I6 `src/styles/search.css:45`: the focused hero field is opaque with a bright white frame on every desktop load; the approved field is see-through. Owner's call; suggested rule above.
- I7 `e2e/pages.spec.ts:289`: never seen red and its "0.6 fails" is arithmetic that ignores highlight roll-off in the brightest cells. Run it once at 0.6.

**Minor**
- M1 `home.css:19`: shelf `.82` accepted; the 30 px ramp draws a floor line through the nebula's tail. Try `inset: -40px -50vw 0` with the stop at 76 px.
- M2 `GasField.tsx:999-1002` inert easing; "dimmed map" comments in `MapStage.tsx`, `AlbumField.tsx`, `home.css:1`.
- M3 `home.css:10`: the blurred pad is re-filtered where glints (part 2 Task 8) play under it; time Home with glints in Task 9; box-shadow version if it shows.
- M4 random star brightness per load against a box percentile: watch for flakes near 4.5.
- M5 `map.css:11`: `rgba(10, 9, 14, 1)` literal; a token would keep it with the other solid values.
- M6 `src/app/icon.svg`, `scripts/icons/icon-16.svg`, `apple-icon.svg`: three different drawings of the mark; real browser tab not looked at.
- M7 `pages.spec.ts:275`: say in the comment that it counts canvas draws only (as `glass.spec.ts:102` now does).
- M8 `search.css:45`: an opaque field still carries `backdrop-filter`; switch it off in the same rule.
