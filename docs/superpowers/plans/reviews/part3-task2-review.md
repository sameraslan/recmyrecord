# Part 3, Task 2 review: glass surfaces, literal sweep, no grain

Commit reviewed: `f4b71a19` (read by id; nothing built, no browser, no git state change). All 13 captures extracted to `_notes/scratch/p3-task2-review/` and opened, with `final-overview`, `final-album`, `final-home`, `final-phone-list`, `final-phone-map`.

## Verdicts

- **Spec: pass with one deviation.** Every CSS edit in the plan and in the reconciled table is there with the planned values. The one departure is reconciled ruling C2 (remove the map wash element, not only hide it).
- **Quality: pass with concerns.** Tests are meaningful and the two changed `glass.spec` tests are not loosened. The helper change is a legitimate correction. Two real problems the tests do not see: the hint band paints over the hover label, and the pixel-reading specs that the band and the grain removal can move were not run.
- **Fidelity: matches the finals for the panels, differs where later tasks are due.** Home is worse than before this task until Task 6 (confirmed from the pictures, desktop and phone).

## Findings

### Important

**I1. The hint band paints over the hover label (and anything else on the map in the bottom 81 px).**
`frontcreck/src/styles/map.css:60` (`.map-hint`, `z-index: -1` inside `.map-ui`) with `map.css:19` (`.map-ui { z-index: 6 }`) and `map.css:10` (`.map-tip { z-index: 5 }`), `map.css:17` (`.map-sel` 4), `.mk-layer` 3.
`z-index: -1` only orders the band inside `.map-ui`'s stacking context; the whole of `.map-ui` (6) is above the hover label (5), the dot ring (4) and the marker layer (3). `OverlayDriver.tsx` clamps the label to `area.bottom - th` with `TIP_EDGE = 8`, so hovering any star in roughly the bottom 90 px of the map, at the un-zoomed view where the hint is shown (Explore with nothing picked, and beside an album), puts the label partly or wholly under a .5 to .78 dark band. Computed: paper title under band alpha .6 is about 3.2:1 on the label's own background, the dust artist line about 2.4:1; at the bottom clamp (alpha about .76) about 1.9:1. Before this task the hint was bare text and covered nothing. Not seen in any capture (no picture has a hover label) and no test covers it. Derived from the CSS, not run.
Fix (CSS only): lift the label over the band, `.map-tip { z-index: 7; }` is the smallest change (it is `pointer-events: none` and already clamped to the visible map; check it against `.map-msg`, also 7, which never shows with a hover). Add an e2e check: hover a star within 60 px of the bottom at the opening view and run `contrastOverBackdrop(page, '.map-tip', ['.map-tip .t', '.map-tip .a'])`, or at least assert the label's computed stacking is above `.map-ui`. If the label must stay under the panels, the alternative is to hide the hint while a star is hovered.

**I2. The band's "dark from 50% down" promise breaks when the hint wraps to two lines.**
`map.css:60`: stop at `50%`, padding `44px 120px 18px 20px`, 13 px text (19.5 px line). One line: text starts at 44 / 81.5 = 54% (alpha at least .62, good). Beside an album the hint is `COPY.map.hintAlbum`, about 457 px wide in `task2-desktop-album.jpg`; at viewport widths 900 to about 1080 px the map is 420 to 600 px wide, minus 140 px of padding, so it wraps. Two lines: band is 101 px, the first line starts at 43.6% where alpha is about .54, and paper over white there is about 3.9:1, under the 4.5 that `contrast.test.ts` "the map hint is paper on a band..." claims to pin. Widths estimated from the picture; verify at 1000 px wide.
Fix: give the stop in pixels no lower than the top padding, for example `linear-gradient(rgba(4, 4, 8, 0), rgba(4, 4, 8, .62) 44px, rgba(4, 4, 8, .78))`, and make the unit test read both the stop and `padding-top` and assert `stop <= padding-top` (today nothing ties the text's position to the stop).

**I3. Specs that read screen pixels or the hint were not run after two changes that move pixels.**
Report "Not verified": `explore`, `flows`, `map`, `focus`, `gas`, `smoke` not run. Removing `.grain` lowers every pixel a few levels and the band darkens the bottom 81 px of the canvas on desktop; `gas.spec.ts` reads gas pixels from screenshots and `explore.spec.ts` asserts on `.map-hint` in seven places. `opening.spec.ts` was run and passed; the others are unknown.
Fix: run `gas.spec.ts` and `explore.spec.ts` on desktop (one project each, through the lock) before Task 3 builds on this, and record the result; `explore:295` stays red on purpose.

**I4. Reconciled ruling C2 not followed: the map wash element is still rendered.**
`frontcreck/src/components/map/MapStage.tsx:13, :154, :360` still import and render `<AmbientLayers variant="map" />`; `album.css:3-5, :9` keep the `.map-amb` rules; `glass.test.ts:61-63` asserts only `display: none`. The reconciled note (which wins over the plan) rules: remove the element in Task 2, delete the `.map-amb` rules, assert `MapStage.tsx` has no `AmbientLayers` and no sheet has `.map-amb`. The report says the brief moved this to a later task; I cannot see the brief. If so, it must be written into Task 3's brief (it is also Task 3's 288 bytes of room in `MapStage.tsx`, 19,936 bytes now, at the limit). Until then MapStage keeps a dead store subscription (`s.ambient`) and a hidden element whose children still get animation classes.

**I5. `.map-tip` now carries a 22 px backdrop blur on an element moved every hover frame; unmeasured.**
`shell.css:32-34` lists `.map-tip`; `OverlayDriver.tsx:46` moves it with `translate3d` per frame while a star is hovered. This is the plan's list, so not a spec fault, but it is the surface closest to the hard rule "nothing on the pointer-move path" and the report measured nothing (battery). There is no one-line switch for this surface alone: taking it out means editing the selector list and the pinned list in `glass.test.ts:18-20`.
Fix: in Task 9 time the first hover and a hover sweep with `.map-tip` in and out of the list, on mains; if any cost shows, make the label opaque (`background: var(--color-room-2)`, as the search popover) and drop it from the list. Decide it there, not by default.

**I6. `contrastOverBackdrop` is a box percentile, not "the brightest pixel behind the glyphs"; say so and harden it before Tasks 3, 4 and 6 use it.**
`frontcreck/e2e/helpers.ts:259-322`. See the helper section below. Concrete additions: throw when the measured rectangle is empty or clipped by the viewport (today `Math.max(1, x1 - x0)` silently samples a 1 px sliver, `helpers.ts:311`); commit the implementer's scratch check (pan the brightest gas under the hint, measure the text's own rectangle) as a test, because the acceptance item "hint holds on the brightest cream gas" is otherwise proven only by an uncommitted script (5.84 at the 95th percentile, 5.43 at the brightest pixel).

### Minor

- **M1.** `glass.spec.ts:109` "glass over the map costs no frame at rest" is true but cannot fail because of glass: `window.__rmr.frames` counts canvas draws and a backdrop filter never causes one. It is a second idle guard with glass confirmed on (`:118`), correctly ordered (`waitForGasSharpSettled` at `:119` before the count, 0 frames, stricter than the rule's "at most one"). Rename to say what it proves ("the canvas stays still with glass on") so nobody reads it as a cost measure. Compositor cost is Task 9's.
- **M2.** `glass.spec.ts:88-107` reads gas pixels without `waitForGasSharpSettled`; `__rmrGasLite = 'off'` is set (`:89-91`). Add the settle wait before each `contrastOverBackdrop` call so the ratios in the log are of the final image.
- **M3.** Glass on `.about`, `.combo--hero .combo-field`, `.map-tip`, `.map-msg`, `.card` is never read in a browser; only the selector list is pinned (`glass.test.ts:15-21`) and four surfaces are computed (`glass.spec.ts:39-55`). Add `.about` and the hero field to the first `glass.spec` test (two lines).
- **M4.** The hero field loses its focus background. `search.css:43` (`.combo--hero .combo-field { background: var(--color-float) }`) has the same specificity as `search.css:9-12` (`.combo-field:focus-within { background: var(--color-room-3) }`) and comes later, so on Home the focused field stays see-through. Visible in `task2-desktop-home.jpg` (field focused, lamp border, gas showing through). If intended (the prototype), say so; if not, add `.combo--hero .combo-field:focus-within { background: var(--color-room-3); }`.
- **M5.** Focus rings: on panels they are fine (lamp on dark glass; the slider thumb ring is now cased, `map.css:47-48`). The zoom buttons, `.map-explore` and `.map-canvas` rings (`shell.css:15`, 3 px outside the element, bare lamp) fall on the open nebula and vanish on cream gas. That is Task 4's ("casing for focus rings on the map"); make sure its brief names the zoom buttons and `.map-explore`, not only the canvas.
- **M6.** The fallbacks are honest one-liners in CSS, each with test pins to move: (1) blur 22 to 14, one value at `globals.css:42`, pins `glass.spec.ts:4` and the `blur\(22px\)` regex in `contrast.test.ts:35`; (2) header solid needs a new rule line after `shell.css:35` plus `glass.spec.ts:48`; (3) all desktop glass off, one `:root` line after `globals.css:52`, which turns three desktop `glass.spec` expectations red by design. Fine; write the three lines as comments next to the fallback blocks so Task 9 does not have to find them in a report.
- **M7.** Four separate backdrop filters for the zoom stack (`.map-zoom button`, three buttons and the names button), each its own blur pass. Plan's list; if Task 9 shows cost, one filter on a wrapper is the cheaper form.
- **M8.** The built-CSS test (`glass.spec.ts:82-84`) checks the first value of the `@supports not` block only; the other three solid values are pinned in source (`glass.test.ts:34-43`), not in the build. Acceptable.
- **M9.** The hint with its band now also shows beside an open album (`task2-desktop-album.jpg`); `final-album.jpg` has no hint line there. The line itself is today's behaviour, the band makes it heavier. For the owner's list of visible changes.
- **M10.** `--acc: #d9a066` (`globals.css:36`) and the tile fallback `#2c241c` (`search.css:50`) are still warm, left on purpose by the reconciled note and outside the test's old-colour list. Noted so they are not taken for misses.
- **M11.** Phone glass later: if the phone line in `globals.css:50` is deleted, `.top` and `.album` gain a backdrop filter and become containing blocks for fixed descendants. `SearchSheet` is portalled and `Toast` is outside both, so nothing breaks today; keep it that way.

## 1. Spec

Checked each row of the reconciled table against `git show f4b71a19:<file>`:

- `shell.css`: grain rule gone; glass rule and `.top.top--home` clear rule after the Home header rule (`:30-35`), prefixed line first; `--color-lamp-hover`; `--color-rule-3` and `rgba(241, 236, 228, .05)`; underline `.35`; toast `calc(28px + env(safe-area-inset-bottom))` (`:74`).
- `layout.tsx`: grain element removed, nothing else. `opening.spec.ts`: the three grain lines removed, thresholds untouched. `git grep grain` over `src`, `e2e`, `scripts` finds only `glass.test.ts` and the shader's own grain (a different thing).
- `map.css`: track `--color-rule-3`; both thumbs `--color-room-2`; both focus rings cased; hint band as planned; veil `rgba(7, 6, 10, .1)`. Focus-markers block untouched (still holds `237, 229, 213` and `10, 8, 6`: part 2 Task 4's).
- `album.css`: `--panel-bg`, `.amb` `opacity: .9`, `.map-amb { display: none; }`, three cool literals.
- `home.css`: `.3` backdrop, `--panel-bg`, `#e0dbd3`, `.55` scrim. `search.css`: lamp underline, hero field `--color-float`, cool fallback letter. `phone.css`: veil rule and comment deleted, `.album` `--color-room`.
- Literal sweep of the six sheets (every `#hex` and `rgb()`): only black shadows, the planned `241, 236, 228` and `243, 238, 231` tints, the band's `4, 4, 8`, the scrims' `5, 4, 8`, the veil, `#e0dbd3`, `#2c241c` (kept on purpose). No old-theme literal outside the focus-markers block.
- Solid fallbacks: three identical blocks in `globals.css:50-52`. Phone: `--top-bg`, `--color-float`, `--panel-bg` all alpha 1 and blur `none`, album `--color-room`; the header is solid in every phone capture except Home, where it is clear by design. `@supports not` present in source and proven in the build as text; not exercised in a browser without the property (cannot be here). Reduced transparency exercised through CDP.
- Not done: C2 (I4). `twinkleOff` left as two TODO comments, as the reconciled note says.

## 2. The helper change (content box instead of border box)

**Legitimate correction, not a loosening.** The threshold (4.5) and the percentile (95th) are unchanged. What moved is the rectangle:

- The border: a mood tag's own 1 px `--color-rule-2` line is about 11% of a small chip's border box, so the 95th percentile was reading the border, which is not behind any glyph. Excluding it is right.
- The padding: the hint's 44 px top padding is the clear end of its band and holds no text. Excluding it is right.

Can text sit in the area now ignored? In this site, barely: with `line-height: 1` (`.tags li`, `.rec-n`) ascenders and descenders overhang the content box by about a pixel into the padding, never into the border; ellipsis clipping ends at the content edge. Text placed by negative indent or margin, or a child with its own offset, would be missed; none of the measured selectors does that. The inward `ceil`/`floor` rounding trims up to one more device pixel per side.

Is it still worst case? Not in the strict sense, and it was not before either:

- It is the 95th percentile of the whole content box, not of the pixels behind glyphs. For a wide block with short text the box is mostly empty: the hint's content box is about 1300 x 20 px for a 300 px line, so a bright patch under the words smaller than 5% of the box (about 65 px wide) is ignored. By luck the wide box helps at the opening view: it reaches over the cream gas at the bottom centre and reads 7.86, where the words themselves sit on dark blue (15.9 by the implementer's scratch measure).
- It measures the first visible element of each selector at one camera position, not the worst place a panel can be.

What it proves now: for the first visible element, with the map as it happens to lie, 95% of the pixels in the box where the text is laid out are dark enough for the text's nominal colour to hold 4.5:1. What it no longer covers: the element's own border and padding. What it never proved: the brightest pixel behind a glyph, or the worst backdrop. The worst case is carried by the unit tests (`contrast.test.ts`, white backdrop through the filter). Keep both; see I6 for the hardening.

## 3. The two `glass.spec` tests that differ from the plan

- **Reduced transparency, polled (`:65-68`): not loosened.** Same selectors, same exact expected object; `expect.poll` only waits out the header's `background-color` transition (`shell.css:27`, `--dur` .4 s). The end state is stable, so polling cannot pass on a transient.
- **Built CSS (`:82-84`): not loosened, slightly stricter.** Either order of the two alternatives, exactly one plain and one prefixed (the sorted pair check), and the block must open `:root{--glass-blur:none`, which the plan's regex did not require.

## 4. Tests

- `glass.test.ts` (11): the plan's ten verbatim plus the `.album` single-background test, which is a real link between the panel rule and the surface `contrast.test.ts` models. All read source text; right reasons.
- `contrast.test.ts` (+4): verbatim. The hint test models only the 50% stop (I2).
- `glass.spec.ts` (5): `__rmrGasLite = 'off'` set in the one pixel-reading test; the frames test waits for the sharp image first. M1, M2, M3.
- `nowebgl.spec.ts` (+1): no gas, no init script needed. `phone.spec.ts` toast test: geometric, real.
- `opening.spec.ts`: three lines removed, nothing weakened.
- Not run: I3.

## 5. Speed

- Diff adds no `will-change`, no transform, no forced layer, no transition on `backdrop-filter` (the header transitions `background-color` and `border-color` only; `.card`'s `rise` animation of opacity and transform predates this). The two `will-change: transform` in `map.css` are part 2's marker rules. No filter over the whole canvas: each blur is the surface's own box.
- Large blurred boxes by design: `.album` (up to 660 px wide, full height), `.top` (full width, 64 px), `.about` (680 px wide). Their cost appears whenever the canvas draws (pan, zoom, slider, hover), not at rest. Unmeasured; Task 9.
- `.map-tip`: I5. Zoom stack: M7. Fallbacks: M6.
- First-load JS: no JS import added. The only non-test source change outside CSS is one deleted `<div>` in `layout.tsx`; `ambientBackground` is imported by a test file only. `MapStage.tsx` unchanged at 19,936 bytes. `budgets.json` untouched. The reported 191.17 KB is consistent with that.

## 6. Fidelity, surface by surface

| Surface | Capture against final |
|---|---|
| Header | Flat near-black bar on map, album, About, search; the finals show the nebula through it. Expected until Task 3. On desktop Home the header strip reads as a slightly darker band above the nebula. Phone header solid, as decided. |
| Slider panel | Matches `final-overview` and `final-album`: dark frosted, text clean, no star inside a word. Phone: solid, the site's own slider (the final's three-button row was not chosen). |
| Album panel | Glass, text and tags clean. Much darker and bluer at the top than `final-album`, where the wash is a clear green and red glow; different album, so not like for like, but worth one capture of The Stone Roses to compare. Phone list solid with the wash, close to `final-phone-list`. |
| Zoom buttons, Explore this area | Match. Phone: solid. |
| Picked-album card | `task2-desktop-map-pick.jpg`, `task2-phone-map-pick.jpg`: glass on desktop, solid on phone, all text clean over dense covers. |
| Hover label | In no capture. Not verified by anyone; see I1 and I5. |
| Search | Popover opaque over the map (desktop), sheet solid (phone). Match. |
| Toast | In no capture. Rule and phone test read; fine. |
| Hint line | Band and paper text as `final-overview`. On the brightest cream (`task2-desktop-map-hint-bright.jpg`) the line is readable. Also shown beside an album, where the final has none (M9). |
| Home | **Confirmed hard to read.** Desktop: the lede "Get the most similar albums, by sound and by mood." runs over rust and cream gas and is broken up from "albums" to "sound"; "Explore the map" and "Surprise me" sit on cream with dark filaments through the letters. Phone: the lede is on black and fine, but "Explore the map" and "Surprise me" lie straight on rust and cream and are the hardest text in the set. The nebula is also brighter than `final-home`. The headline holds by size. Nothing measures this until Task 6: do not show Task 2 on a preview without Task 6. |
| About | Glass card over an almost black backdrop; body text clear. No approved picture. |

Nothing else is hard to read in the 13 pictures. Still to come from other tasks and not held against this one: white cased lines and frames, region names, the phone strip gas.

## 7. Accessibility

- Focus rings on glass: visible on the panels; the slider thumb ring is cased. Rings that fall on the open map are Task 4's (M5).
- Toast: `bottom: calc(28px + env(safe-area-inset-bottom))` (`shell.css:74`), pinned by `glass.test.ts:78-81` and a phone geometry test. The known overlap with the slider panel if Map is tapped within 2.6 s stays open, as the plan records.
- Contrast holes: I1 (hover label under the band), I2 (wrapped hint), Home until Task 6.

## 8. Hard rules

No budget change, no data or pipeline file touched, `MapStage.tsx` size unchanged, no new wording (test titles only), nothing added to the pointer-move path in JS (CSS blur on the hover label: I5), canvas at rest still 0 frames by the report. Commit message has `Refs #45` and the one trailer. The 4.5:1 rule is where the findings are.
