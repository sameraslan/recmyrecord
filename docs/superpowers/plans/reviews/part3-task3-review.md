# Part 3 Task 3 review: the map runs behind the glass header

Reviewed by id, read-only: `57a0b2a9` (fixture), `45848882` (tests and code), `df9a9fc9` (pictures), against `8246458a`. Nothing was built, run in a browser or run as a test; every statement below is from reading the trees, the logs under `_notes/logs/p3t3-*`, and the nine pictures in `_notes/scratch/p3-task3-review/`. File:line references are to the tree of `45848882` under `frontcreck/`.

## Verdicts

| | Verdict |
|---|---|
| Spec (plan Task 3 + reconciled rulings) | **Met.** Constants in `lib/media.ts` re-exported from `map/types.ts`; wash element removed; states `opening` / `whole` / `floor`; tolerance 0.75 px; twinkle steps left as `// TODO(part2-task8)`; `albumSpread`, `capture.mjs`, `layout-cost.mjs`, `frustumCamera`, the third `visibleArea` call in MarkerDriver and the `fitOverview` pair are all done. |
| Quality | **Good, no Critical.** The maths is right at every call site I could find; nothing new per frame; nothing on the pointer-move path. |
| Framing proof | **Sound.** The spec can fail, the fixture is pre-change (evidence below), no short-circuit when `FRAMING_RECORD` is unset. It is backed by assertions that do not depend on the fixture. Gaps are listed with reasoning. |
| Fidelity | **Overview and album: match. Whole map: does not match `final-whole.jpg`** (8 of 17 region names sit off their centres; not caused by this task's maths, but nobody looked). **Home is not pictured or measured** and has a real contrast hole (I1). |

## Findings

### Critical
None.

### Important

**I1. Home: the clear header now sits over raw nebula, with no glass and no measured contrast.** `src/styles/shell.css:29` and `:40` make `.top.top--home` transparent with no backdrop filter (on phones too: there is no media query on that rule). Before this task the stage started under the header, so the Home header was over the page background. Now the canvas is behind it, with the gas at full strength and only the `.1` veil (`styles/map.css:194`). On a fresh Home the Whole map leaves the strip near black, so the approved look holds. But Home keeps a camera the visitor moved (`e2e/opening.spec.ts`, "Moved by the visitor: Home keeps the camera"): zoom into the cream on `/map`, click the wordmark, and the wordmark and the two links (paper, luminance about 0.84) are over gas the shots file measures at 0.91 to 0.99. By calculation that is about 1.1:1 against the 4.5:1 rule. The new `glass.spec.ts` header test runs on `/map` only, and the analytic floor in `lib/contrast.test.ts` (5.44 for dust over white) is for the glass, which Home does not have. Not measured by me (no browser).
Fix: (a) add to `e2e/glass.spec.ts` a Home case: move the camera on `/map` so `panBrightestGasUnder` puts the brightest gas under `.wordmark` and under a `.navbtn`, go Home, `contrastOverBackdrop` at least 4.5, on desktop and phone; (b) if it fails as calculated, give `.top.top--home` a static top scrim, for example `background: linear-gradient(rgba(7, 6, 10, .78), rgba(7, 6, 10, 0))` (no blur, so no speed cost; invisible over the default Whole map framing). It changes a look the owner approved as "clear", so show him a picture first.

**I2. The Whole map reached with the fit button does not look like `final-whole.jpg`.** In `task3-whole-desktop.jpg` the gas and the unmoved names are at the approved pixels (PLAYFUL WAY 780, 323; WARM HALO, PROGRESSIVE SPIRAL, SOMBRE VOID, ETHEREAL VEIL, HYPNOTIC ORBIT, RAW FLARE the same), but eight names are nudged by exactly the placer's offsets: THE LIVE BELT +22 (150 to 172), LONELY DRIFT, PASTORAL NEBULA, THE QUIET DEEP and IMPROV ARM -22, EPIC EXPANSE -46 (330 to 284), AGGRESSIVE RIFT +78 (267 to 344, so it now reads below EPIC EXPANSE instead of above it), URBAN CLUSTER by (-70, -30), off its blue cluster. Cause: `state/namesPlacer.ts:142` keeps one `sticky` map for the life of the map and `state/namesLayout.ts:218` tries the last offset first, so nudges picked up while the names crowd together during the glide from the Overview are kept at rest even where the true centre is free. Since `/map` opens at the Overview, the fit button is the normal way to the Whole map, so this is what visitors see. It is part 2 Task 7's behaviour, not this task's: the placement is the old one translated by the header height (`visibleArea(..., top)`, `chromeBlockers` with `top`, candidates in canvas px), so Task 3 cannot have changed which offset wins. I could not confirm that by running the old build; one capture on `8246458a` through the fit button would settle it.
Fix (follow-up, own task): when the camera comes to rest (`MapApi.isAnimating()` false, or the motion flag MarkerDriver already uses), run the layout once with the sticky map cleared, so a name returns to offset 0 when it is free; one layout at rest, nothing per frame. Add an e2e: Overview, fit, idle, then every name's offset index is what a fresh `__rmrOpen = 'whole'` load gives. The implementer's report said only "nothing behind the bar" for this picture; it was not compared by eye.

**I3. The header's blur now has a live canvas behind it and no number says what that costs.** `backdrop-filter: blur(22px)` over 1440 x 64 px re-runs on every map frame of a pan or zoom on desktop (it was over a still background before), and the canvas is 7.7 percent taller. The report runs no timing (not in its brief). This is the one place the task can hurt the core requirement. Not a defect in the commit; a gate: do not merge the branch until part 3 Task 9 Step 6 has the glass-on / glass-off pair, dpr 2 included. The cheap fallback is already written down at `styles/shell.css:31-36` (solid header).

### Minor

- **M1. Dead code left by the wash removal.** `components/album/AmbientWash.tsx:9-17` and `:39` still carry the `'map'` variant (and `AmbientWash.test.ts:10` its expectation); nothing renders it. `lib/store.ts:26, :39, :67, :79` `ambient` / `setAmbient` are written by `AlbumPanel.tsx:65, :78` and read by no component, only by `e2e/album.spec.ts:163`, `explore.spec.ts:278`, `pages.spec.ts:173-209`. `canvas/Scene.tsx:110` comment still says the wash shows through the canvas. Follow-up: drop the variant and its test; either drop the store field and move the three e2e reads to `--acc` (which AlbumPanel also sets), or keep it with a comment that it is test-only. The first-load drop (191.21 to 190.82 KB, 11 scripts, `_notes/logs/p3t3-run3.log:44-47`) is consistent with `AmbientWash` (2.3 KB source, with `hexToRgb`) and one store subscription leaving MapStage's chunk for the album panel's; nothing that belongs in first-load moved out. `MapStage.tsx` is 19,732 bytes (`git show | wc -c`), pinned at 19,936 by `stage.test.ts`.
- **M2. Resize during a camera tween (known gap).** `canvas/InitialFrame.tsx:128-151` writes the re-fitted camera directly while `CameraTween` (`:216-233`) keeps writing its own tween, so the tween ends at the old size's target with `fitKind` saying otherwise. Visible only when the last resize event falls inside the 420 ms of a glide (a phone rotated just after a tap on fit, a snap-to-half-screen during the opening glide); while a window is dragged, later resize events repair it. This task adds one trigger (crossing 900 px) that only occurs during a resize anyway. Not a merge blocker. Fix in Task 10: in the snap branch call the tween's own path (`getCameraControl()?.setCamera(view, false)`, which clears `tween.current`) or export a `stopCameraTween()` beside `stopCameraRig()`. FocusFramer's resize path already goes through `frameFocus(false)` and is not affected.
- **M3. No test would fail if these lines were deleted:** `MarkerDriver.tsx:226` (`k[8]`), `FocusFramer.tsx:12` (`insetTop` in the key), `InitialFrame.tsx:166-169` (`lastSize.insetTop`), `CameraBounds.tsx:104` (`halfH *= getVisibleScale()`). The 900 px crossing is not exercised in a browser (the report says so). Fix: one e2e that resizes 1000 to 880 px wide on an untouched `/map` and on an open album and asserts `overviewMiss` empty and markers 8 px under the bar; one unit test of `nudgeVector` fed a rect scaled by `visibleScale`.
- **M4. The sprite cap grew.** `canvas/AlbumField.tsx:179` `u_maxSpritePx = size.height * MAX_SPRITE_VIEWPORT_FRACTION` is now 7.7 percent larger (the report notes it). It binds only for the picked cover at the deepest zoom on windows under about 771 px tall, where the cover is now up to 11.5 px bigger than before: a visible difference from the baseline in a corner case. Fix: `(state.size.height - input.insetTop)`; the hit test in `CursorTracker` uses the same helper and must get the same height.
- **M5. `FRAMING_RECORD=1` still overwrites the fixture silently** (`e2e/framing.spec.ts:47-52`). The fixture is meant never to be recorded again. Fix: in record mode `expect(canvas.y).toBeGreaterThan(0)` first (it can only be recorded on a tree whose canvas starts below the header), or delete the record branch now that the fixture is in.
- **M6. Hover label for an album under the bar.** The canvas captures the pointer during a drag, so `CursorTracker.tsx:148-149` records positions under the header and the frame hit test (`:178` on) can light the album that was dragged under the glass; its label is then pinned 8 px under the bar. Whether it lingers after the release depends on the browser sending `pointerleave` when capture ends (not verified). Fix: in the frame callback treat `c[1] < input.insetTop` as no cursor (one compare per rendered frame, not on the pointer-move path); extend the drag test to assert `.map-tip` opacity 0 after the release under the bar.
- **M7. Phone: 60 px of canvas under an opaque header on `/map` and albums** (7.1 percent of the fragment work at dpr 3, no visible gain there; it does show on phone Home, whose header is clear). Leave as planned, but Task 9 should read the phone numbers with that in mind; a scissor on narrow non-Home views is the cheap cut if needed. No safe-area change: the header has no `safe-area-inset-top` before or after.
- **M8. Two sources for one number.** The names read `getStageTop()` (`state/namesPlacer.ts:159`), everything else `input.insetTop`. Both are set in one effect (`MusicMap.tsx:38-39`), so they cannot disagree today. Fold into `input.insetTop` when part 2 Task 8 lands, or pin the pair in `stage.test.ts` (it already pins the call).
- **M9. The spec that recorded the fixture is not the committed spec byte for byte.** The record log shows the "same place" tests at lines 140 to 183; in `45848882` they are at 145 to 188. The recording version was not kept. Five lines of difference, six probes in both, same keys; almost certainly comments or the `again` flag. Noted, no action.
- **M10. A moved camera on a height resize** now scales with the canvas height, not the visible height (for 900 to 700 px: 0.778 instead of 0.761). Transient, not a framing at rest. No action.
- **M11.** The canvas focus ring uses `.map-host:has(...)`; the `@supports not selector(:has(a))` fallback is pinned as text only. Fine.

## 1. The framing proof

What it compares: `e2e/framing.spec.ts:26-27` reads `window.__rmr.map.screenPoint(id)` (client px, through `state/projection.ts` and the canvas's own rectangle) for six albums `[0, 11, 42, 1158, 2000, 4000]`, plus the real DOM boxes (`x, y, w, h`) of every `.mk` marker. The mapping is a uniform scale and a translation, so two points pin it; six do, on and off screen (the `deepest` record has points at -5758 and 10175 px, where a 1 in 10,000 scale error is over a pixel). States: `opening`, `whole`, `floor`, `whole` again, `pick`, `album` (6 markers), `search` (desktop, 6 markers), `deepest`; 13 keys, 7 desktop and 6 phone.

Can it fail: yes. Without `FRAMING_RECORD` every call reaches the `expect`s; a missing key fails (`:54`); marker ids must match. A caller that ignored the inset would be 32 px (30 on phone) off; a zoom limit left unscaled would move `deepest` and `floor`.

Was the fixture recorded before the change: yes, on four counts. (1) `57a0b2a9` has `8246458a` as parent and contains the JSON only; `45848882` does not touch it (blob identical). (2) `_notes/logs/p3t3-record.log` (03:37:11, before the fixture commit at 03:37:36 and the code commit at 04:31) shows the same run's replay failing `expect(canvas.y).toBe(0)`: the build that recorded had its canvas below the header. (3) `_notes/scratch/p3-task3/framing-baseline.at-record.json` is equal to the committed fixture. (4) The fixture is self-consistent with the old geometry (`desktop/pick` album 11 at 720, 482 = 64 + 836 / 2; `phone/pick` at 195, 452 = 60 + 784 / 2).

What it leans on: `screenPoint` is the app's own projection. `screen.test.ts` ties that to three.js (`Vector3.project`) with top insets 64 and 120, and adds the "taller canvas with the inset equals the shorter canvas" case. Two checks do not depend on the fixture at all: `overviewMiss` / `wholeMapMiss` (absolute 24 px margins, median row, fit box, unchanged formulas, about ten uses in `opening.spec.ts`) and the Task 0 zoom constants. And the pictures: gas features, markers and lines in `task3-overview-desktop.jpg` and `task3-album-desktop.jpg` are at the approved pixels.

## 2. The maths

Derivation. Header height T, window height H, old canvas H0 = H - T. A canvas of height h shows `h * zoom / 1.1` px per world unit, so the same size on screen needs `zoom = zoom0 * H0 / H` (`visibleScale`). `camera.position` must be drawn at the centre of the visible window, y = T + H0 / 2 = H / 2 + T / 2, so the drawing shifts down by T / 2: view offset y = -T / 2 (three scales the offset by 1 / zoom, so this holds at every zoom).

| Function | Should be | Code | OK |
|---|---|---|---|
| `applyFrustum` / `frustumCamera` (`InitialFrame.tsx:23-56`) | offset (-inset / 2, -T / 2), enabled if either is non-zero, disabled otherwise | as derived; T clamped to h / 2 | yes |
| `visibleArea` (`projection.ts:75`) | top = T + edge | yes | yes |
| `fitView` (`bounds.ts:95-112`) | availH = H - T - pads; zoom by the canvas height; clamp range times s; centre unchanged | yes | yes |
| `fitOverview` (`bounds.ts:166-174`) | only the `MAX_ZOOM` ceiling scales; `across`, the 12.5 px cap and the centre have no T term | yes | yes |
| `focusCamera` (`focusLayout.ts:695-741`) | availH less T; `zoom = k * 1.1 / H`; centre from pads only | yes | yes |
| `flyTarget` (`CameraTween.tsx:68-88`) | the phone band in px of the visible map | `visible = height - insetTop` | yes |
| `clampZoom` (`CameraRig.tsx:46-48`) | ceiling `MAX_ZOOM * s`; floor 0.8 of the fitted zoom (already scaled) | yes | yes |
| `CameraBounds.tsx:102-104` | half height of the visible window: `(1.1 / 2 / zoom) * s` | multiplies a fresh object's `halfH` (`viewportWorldRect` allocates one per call, as before) | yes |
| Wheel and pinch anchoring (`CameraRig.tsx:171-183, :263-270`, `zoomMath.ts`) | world point from `screenToWorld` with the view offset; `camera.position` is drawn at a fixed screen point, so `anchoredZoom` holds the point under the pointer | unchanged and still exact | yes |
| Drag scale (`CameraRig.tsx:197`), `panBy` (`CameraTween.tsx:105`) | world per px = 1.1 / (canvas height * zoom) | unchanged, right for the taller canvas | yes |
| Dot, cover, fade, atlas thresholds (`zoomLimits.ts`, `AlbumField.tsx:178`, `AtlasManager.tsx:245`, `namesPlacer.ts:206`) | all in px through `pxPerWorld(zoom, canvasHeight)` | no raw zoom threshold found | yes |

`pinchZoom` clamps to the raw `MAX_ZOOM` first and `clampZoom` re-clamps to the scaled ceiling: fine. Callers by `git grep` on the tree: the report's table is complete (`OverlayDriver`, `MarkerDriver` x3, `namesPlacer`, `InitialFrame` x3, `CameraTween` x4, `layout-cost.mjs` through one helper that checks `focusCamera.length`). No plain-JS caller was missed; `perf.mjs` and `capture.mjs` dispatch on the canvas or read `#stage`.

## 3. Pointer mapping

`CursorTracker.tsx:148-149`, `PickController.tsx:42-62` and `CameraRig.tsx:171, :265` all subtract the canvas's own `getBoundingClientRect()` (now top 0) and convert through the camera with its view offset, so hover, click and anchor land on the album under the pointer; drag deltas are differences and use the canvas height. The header (z-index 60, a fixed full-width box above the stage) takes every pointer and wheel event in its 64 px, as it should: an album behind the glass cannot be hovered, clicked or tapped, and a click on the bar picks nothing (`framing.spec.ts` "the header takes the pointer"). A drag begun on the map continues under the bar by pointer capture. The one soft spot is M6.

## 4. Per-frame code

No new allocation, layout read or loop. `OverlayDriver.tsx:42-43` two reads of `input.insetTop`; `MarkerDriver` one number in `Work`, one slot in a `Float64Array(9)` made once; `CameraBounds` one multiply; `namesPlacer` one call instead of two lines; `clampZoom` one module read. `insetTop` is in every key that needs it: `tweenTarget` `k[8]`, `FocusFramer` key, `InitialFrame` `lastSize` and effect deps, the names basis `bTop`. Crossing 900 px: the canvas size and the input can land in different commits; `InitialFrame` re-fits on either (that is why `insetTop` is in `lastSize`), so at worst one frame is drawn 2 px off during a resize. Nothing was added to any `pointermove` handler. Frames at rest: no new `invalidate`; the focus ring is CSS.

## 5. Changed assertions, classified

| File | Change | Class |
|---|---|---|
| `e2e/opening.spec.ts:38-39` Overview zoom | `zoom * canvasH / (canvas.bottom - stage.top)` against the same constant, 3 decimals | Equivalent: px per world unit is `zoom * canvasH / 1.1`, so this is the zoom a canvas of the visible height would have. If the stage top were wrong the factor would be wrong and it would fail. |
| `:43` 12.5 px cover check | same formula with that zoom and `h = bottom - stage top` | Equivalent (true cover size) |
| `:53` Whole zoom | same conversion | Equivalent |
| `:100` "not the Overview's zoom" | same conversion, still `> 0.05` | Equivalent |
| `e2e/helpers.ts:222-224` `albumSpread.top` | `#stage` top instead of the canvas top | Equivalent (same pixel as before) |
| `e2e/focus.spec.ts:86-91` | top bound 0 became the header's bottom | Tightened |
| `styles/glass.test.ts:84-93` | "`.map-amb { display: none }` exists" became "no sheet names it, MapStage renders none, the panel's wash still exists" | Tightened |
| `screen.test.ts`, `bounds.test.ts`, `focusLayout.test.ts` old cases | an explicit 0 top inset added | Equivalent (same numbers) |
| `screen.test.ts` `frustumCamera` | five more cases and a stand-alone assertion | Tightened |
| New: `framing.spec.ts` (11), `stage.test.ts` (8), `glass.spec.ts` header contrast, unit pairs | | Added |

Nothing was loosened. Other specs with raw zooms (`gas.spec.ts`, `explore.spec.ts`, `pages.spec.ts`) compare a camera with itself or with another read in the same run.

## 6. MapStage and first-load

See M1. Removed: the `AmbientLayers` import, the `ambient` subscription, the JSX comment and element, and the `.map-amb` rules in `album.css`. Bytes 19,936 to 19,732.

## 7. Header over the map

Contrast on the glass is safe by construction, not by the 5.93 measurement: `lib/contrast.test.ts:82-93` pins the header glass over pure white at `#424244`, where paper is 8.69 and dust 5.44, and `stage.test.ts` keeps ash out of the header. So the e2e test does not need to be worst-case; 5.93 on the software renderer sits above the 5.44 floor as it must. The floor does not cover Home (I1).

Behind the bar at the Overview: 151 album dots, blurred, by design (the Overview is a crop; before, they were off the top of the canvas). Nothing else can be there: names are laid out inside `visibleArea(..., top)` (highest name top 87 px in the capture), markers and the hover label are clamped 8 px under the bar, the names toggle and zoom buttons are bottom-anchored in `.map-ui` / the host, covers never show at the Overview. A picked album's ring can be panned under the bar, as it could be panned off the canvas before.

Pictures: `task3-overview-desktop.jpg` beside `final-overview.jpg`: rust, cream and blue show through the bar, same hairline at the bar's bottom as the approved picture, no step in the gas at 64 px, names and gas at the same pixels. `task3-album-desktop.jpg` beside `final-album.jpg`: markers, badges and lines at the same pixels (the approved picture's ECLECTIC CLOUD name is correctly absent in the app: no names while an album is open). `task3-header-bright-desktop.jpg`: About reads clearly over the cream. `task3-hover-under-bar-desktop.jpg`: label below the bar; its cover thumbnail is blank in the capture (not this task; worth a look by whoever owns the hover label). `task3-whole-desktop.jpg`: see I2.

## 8. Phone

Header solid `rgb(10, 9, 14)`, nothing shows through on `/map` and albums; four names; framing 0.000 px on all six phone states. Cost and Home: M7 and I1.

## 9. The known gap

M2: rare, self-repairing in a dragged resize, wrong framing until the next resize otherwise. Fix in Task 10, not before merge.

## Views not covered by a framing state

| View | Covered? | Reasoning from the code |
|---|---|---|
| Album open on a phone, list mode | no | The map is hidden under the full-width panel; map mode is `phone/album`. |
| Album opened in-app (card or row click), not by direct load | no | Same `focusTarget()` to `focusCamera`; only the start of the glide differs. `desktop/search` is an in-app open and is 0.000. |
| Search selection on a phone | no (skipped) | Lands on the list; its map is the `phone/album` state. |
| `/album/<slug>` direct load | yes | That is how the `album` state is reached. |
| Sonic and Mood stops, and the morph between stops | no | The stop only changes the positions fed to `getCloudBounds` / `overviewExtent`; every inset term is stop-independent, and the unit pairs use arbitrary clouds. |
| Other window sizes, widths 900 to 1100, tablets under 900 | no | The unit pairs (`fitView`, `fitOverview`, `focusCamera`, `screen.test`) prove taller-canvas-with-inset equals shorter canvas for both header heights, not for one size. |
| Resize of an untouched map | partly | `opening.spec` resize tests pass (not across 900 px): M3. |
| Resize with a moved camera | no | Scale now follows the canvas height: M10, transient. |
| Deep zoom | yes | `deepest`, both projects; pins the ceiling on screen. |
| The opening glide's end (Home or About to `/map`) | not in the fixture | `api.opening` calls the same `overviewView` with `insetTop` as the snap; `opening.spec` checks `overviewMiss` after the glide. |
| Home, About, 404 backdrop | no | The Whole fit is `fitView`, same as `whole`; `opening.spec`'s `expectHomeFraming` and `wholeMapMiss` pass. Header contrast on Home: I1. |
| Phone pick where the album is moved into the band above the sheet | no | At 390 x 844 the centred album is inside the band (`phone/pick` is at the visible centre), so that branch did not run. Its three expressions are the old ones with `visible = height - insetTop` equal to the old canvas height. |
| Region name positions | no (not in the fixture) | A translation of the old layout by the header height; the Overview picture matches name for name. The Whole map after fit differs for the sticky reason in I2. |
| Hover label and selected ring positions | bound only | Same projection as `screenPoint`; the label's top clamp gained the inset. |
| Picked cover size on short windows | no | M4. |
| Reduced motion | no | Only tween durations differ; targets are the same functions. |
