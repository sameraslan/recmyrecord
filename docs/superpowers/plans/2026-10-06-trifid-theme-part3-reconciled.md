# Trifid part 3, reconciled with the code (2026-10-05)

Read beside `docs/superpowers/plans/2026-10-04-trifid-theme-3-chrome-tests.md` ("the plan"). Checked against `feat/trifid-theme` at `177baab9` (part 2 Task 6, the names toggle, is on the branch). Paths are under `frontcreck/` unless they start with `docs/`. "L" numbers of code are today's; plan line numbers are the plan's own. Nothing was built or run: every first-load and timing statement here is from the reviews, not measured by me.

## Rules that replace the plan's Global Constraints (plan L13-37)

| Plan says | Now |
|---|---|
| "Commit, do not push" (L33, L34, end of every task, Task 11 Step 5, Self-review row J) | Withdrawn. Push to `feat/trifid-theme` after each task passes review (`git push origin HEAD:feat/trifid-theme`, never a bare push: see memory "push default upstream trap"). Only merging asks. Task 11's stop moves to "before the merge"; its Step 5 message ("Shall I push the branch") is dropped, Step 8's "ask before each push" too. A trial branch for phone glass may also be pushed without asking. |
| First-load JS 190.5 KB, 9.5 KB of room (L3530, L3853, L3877) | 190.5 is the baseline of today's site and stays the baseline column. The branch is 191.2 KB after part 1 and 191.17 after part 2 Task 2 (8.8 KB of room). Part 2 Task 6 measured 192.1 KB as a patch (+0.61 chunk split, +0.33 code); it is now committed, so **measure HEAD before any part 3 task and record the number and the chunk count**. |
| "at most one frame in 3 idle seconds" (L17) | Still the rule, measured after the sharper gas image has settled: `waitForGasSharpSettled(page)` (`e2e/helpers.ts` L157, exists) in tests, `P.sharpSettled()` in `perf.mjs` (L136, already called before the idle window at L354). |
| Tests that read gas pixels | Add `await page.addInitScript(() => { window.__rmrGasLite = 'off'; });` before the first `goto` (as `e2e/opening.spec.ts` L313 does). Applies to every `contrastOverBackdrop` caller and every screenshot-reading test below; listed per task. |
| "the overview" as the opening view | `/map` opens at the **Overview** (crop; `state/bounds.ts` `fitOverview`). The fit button (`COPY.map.reset`, "Reset view") and key `0` give the **Whole map** (`fitView`; `getOverviewFraming()` still means the Whole map). Zoom floor = 0.8 x Whole map. Home, About, 404 and album links open at the Whole map. Tests can force the old opening with `window.__rmrOpen = 'whole'` before load. |
| "This part adds and changes no site string" (L29) | Still true of `copy.ts`. See the wording list at the end for README, spec and PR text. |
| Order (L36) | See the dependency table at the end. |

Not on the branch yet (part 2 Tasks 4, 7, 8): `state/stageTop.ts`, `canvas/RegionNamesDriver.tsx`, `.rn-layer`, `state/twinkle.ts`, `.tw-layer`, `twinkleOff`, `twinkleOn`/`setTwinkleOn`, the cased lines and badge changes of `map.css` L72-95. On the branch: `namesOn`/`setNamesOn`, `button.map-names` (first child of `.map-zoom`), `COPY.map.names`.

---

## Task 1: Tokens, glass switch, contrast function (plan L153-497)

Buildable now. No JS in any chunk (CSS, tests).

| File | Anchor today | Note |
|---|---|---|
| `src/lib/contrast.ts` | 18 lines, ends with `contrastRatio` | Append as planned. |
| `src/lib/contrast.test.ts` | 96 lines | Whole-file replace as planned. |
| `src/app/globals.css` | L9-38 (`@theme {` to the `:root` block's `}`); width blocks L40-46 | Matches the plan's "before". |
| `src/styles/shell.css` | L30 `background: rgba(21, 17, 13, .96); border-bottom:` | Matches. |
| `src/app/layout.tsx` | L32 `themeColor: '#15110d',` | L32 (part 2 Task 7's names font is not in yet; it will move to about L40). |
| `e2e/smoke.spec.ts` | L14 `expect(bg).toBe('rgb(21, 17, 13)');` | Matches. |
| `e2e/search.spec.ts` | L227 `'rgb(38, 32, 25)'` | Matches. |

Checked: `--color-clay|moss|ochre` are used nowhere in `src` but `globals.css`. `.wordmark` (L34), `.navbtn, .icon-btn` (L41), `.btn-lamp` (L56), `.skip` (L18), `.top` (L27) are the selectors the test's `rule()` reads; `.tags li.lit` is `album.css` L34 with `color-mix(in srgb, var(--acc) 16%, transparent)`; `.mk-n[data-hot]` is `map.css` L95 (`background: var(--acc)`, `color: var(--color-room)`), and `resolve()` also handles part 2 Task 4's later `var(--color-lamp)`.

Wrong assumptions: Step 8's "Part 2 removes `CLUSTER_RGB` and leaves a stand-in" is true (`MapPreviewStrip.tsx` L14-15). Step 9 "do not push": withdrawn.

Tests: the rewritten file keeps all five old tests and is stricter (plan L345 is right). One gap to close in the same task, not a loosening: the old "every text token on every opaque surface" loop included `float`; the new file checks float as glass and as solid, which covers it.

Mid-state warning: after Task 1 alone, desktop panels are see-through with no blur until Task 2 adds the glass rule. Push Tasks 1 and 2 together.

## Task 2: Glass surfaces, literal sweep, no grain (plan L499-1026)

Buildable now except two selectors noted below. No JS added; one `<div>` removed from `layout.tsx`.

### Every literal the sweep must touch, as the CSS stands

| File:line | Text to find | Edit |
|---|---|---|
| `shell.css` L20-23 | `.grain {` ... data URL | Delete the rule. |
| `shell.css` after L33 | `.top.top--home { background: transparent; border-color: transparent; }` | Insert the glass rule and `.top.top--home { -webkit-backdrop-filter: none; backdrop-filter: none; }`. |
| `shell.css` L57 | `.btn-lamp:hover { background: #efb86c; }` | `var(--color-lamp-hover)` |
| `shell.css` L59 | `rgba(237, 229, 213, .4)`, `rgba(237, 229, 213, .04)` | `var(--color-rule-3)`, `rgba(241, 236, 228, .05)` |
| `shell.css` L63 | `text-decoration-color: rgba(237, 229, 213, .35)` | `rgba(241, 236, 228, .35)` |
| `shell.css` L72 | `position: fixed; left: 50%; bottom: 28px;` | `bottom: calc(28px + env(safe-area-inset-bottom));` |
| `layout.tsx` L46 | `<div className="grain" aria-hidden="true" />` | Delete. |
| `map.css` L39 | `.mode-track::before { ... background: var(--color-rule-2); }` | `var(--color-rule-3)` |
| `map.css` L44, L45 | `border: 3px solid var(--color-float);` (both thumbs) | `var(--color-room-2)` |
| `map.css` L47, L48 | `0 0 0 5px rgba(230, 168, 86, .35)` | `0 0 0 3px var(--color-room), 0 0 0 5px var(--color-lamp)` |
| `map.css` L58 | `.map-hint { position: absolute; left: 20px; bottom: 20px; right: 90px;` | Band version as planned. |
| `map.css` L75, L77, L80, L83, L92 | `rgba(237, 229, 213, ...)`, `rgba(10, 8, 6, .55)` | **Not this task**: part 2 Task 4 owns the "focus markers" block (L72-101 today, names toggle rules L96-101 included). `glass.test.ts`'s `mine()` strips from `/* focus markers` to the first `\n@media` (L103), which covers them. |
| `map.css` L141 | veil `rgba(21, 17, 13, .72)` ... (block starts L138 `/* Home: a radial veil`) | Task 6 Step 3, pulled forward by Task 2 Step 8. **Plan says L135; it is L141.** |
| `album.css` L1 | `.album { ... background: var(--color-room);` | `var(--panel-bg)` |
| `album.css` L2 | `.amb { ... pointer-events: none; }` | add `opacity: .9;` |
| `album.css` L8 | `.map-amb { position: absolute; inset: 0; pointer-events: none; }` | `.map-amb { display: none; }` (see contradiction C2) |
| `album.css` L30, L44, L54 | `rgba(237, 229, 213, .4)`, `.045`, `.06` | `var(--color-rule-3)`, `rgba(241, 236, 228, .06)`, `rgba(241, 236, 228, .07)` |
| `home.css` L24 | `background: rgba(12, 10, 8, .72);` | `rgba(5, 4, 8, .3)` |
| `home.css` L25 | `.about { ... background: var(--color-room);` | `var(--panel-bg)` |
| `home.css` L30 | `color: #d9d0bf;` | `#e0dbd3` |
| `home.css` L36 | `background: rgba(12, 10, 8, .55);` | `rgba(5, 4, 8, .55)` (may rise in Task 6, see there) |
| `search.css` L35 | `rgba(230, 168, 86, .8)` | `var(--color-lamp)` |
| `search.css` L43 | `.combo--hero .combo-field { height: 58px; padding: 0 16px 0 18px; }` | add `background: var(--color-float);` |
| `search.css` L53 | `color: rgba(237, 229, 213, .78);` | `rgba(243, 238, 231, .78)` |
| `phone.css` L6 | veil `rgba(21, 17, 13, .8)` (L4-6 with its comment) | Deleted (Task 6 Step 3 text). |
| `phone.css` L11 | `  .album { width: 100%; border-right: 0; transition:` | add `background: var(--color-room);` |

Left as they are (plan's table holds): black shadows, `search.css` L50 `#2c241c`, `globals.css` `--acc`.

### `.grain` and `.map-amb` removals: what the plan misses

- **`e2e/opening.spec.ts` L316-318** hides the grain for one test: comment "The page's grain overlay (.grain, 3.5 % opacity) lifts bare sky ..." and `await page.addStyleTag({ content: '.grain { display: none !important; }' });`. The plan's claim (L662) that `grep grain` finds only two places is stale. Delete those three lines in this task. Not a loosening: the thresholds (`SKY_LUMA + 4`) are untouched and the sky is now the shader's `rgb(6, 6, 9)` with nothing over it. Also update the plan's "afterwards it finds only the new test": the grep still finds the word in `shaders/gas.ts`, `gas.test.ts`, `gas.spec.ts` L1441 and `scripts/theme/bake-page.js` (shader grain, a different thing; leave).
- `.map-amb` is rendered by `MapStage.tsx` L359-360 (`<AmbientLayers ... variant="map" />`) through `AmbientWash.tsx` L39. The plan hides it in CSS and "leaves the code". See C2: removing the element is the cheap way to pay for Task 3's bytes.
- `docs/.../baseline/capture.mjs` `SEL` does not name `.grain` or `.map-amb` (plan's claim holds).

### Other corrections

- Glass rule list: `.map-names` exists now. `.map-explore` and `.card` carry the `panel` class (`ExploreHere.tsx` L8, `MapCard.tsx` L17), so `.panel` covers them; the reduced-transparency test's `'.map-explore'` works.
- `e2e/glass.spec.ts` (new) and the new `nowebgl.spec.ts` test read gas pixels through `contrastOverBackdrop`: add the `__rmrGasLite = 'off'` init script at the top of "text on the panels keeps 4.5:1 over the map" (not needed in nowebgl: no gas). "text on the panels" opens `/map` at the Overview now, where gas fills the screen: a harder backdrop than the plan assumed for `.mode .cap`, `.mode-stops button`, `.mode-note`, `.map-hint`. Keep it; if a selector fails, the plan's tint ladder applies.
- `twinkleOff(page)` in `glass.spec.ts` (plan adds it in Task 3 Step 10) needs part 2 Task 8. Until then no glint exists, so leave it out; add the two calls in the commit that lands Task 8.
- Until part 2 Task 4 lands, `.mk-n` keeps `var(--color-float)`: see-through and unblurred on desktop (plan's note L519; paper 5.7 over white).
- Phone toast test: `.mode` is not in the DOM on the phone album list (the slider renders only when `interactive`; `MapStage.tsx` L381), so `toHaveCount(0)` holds.

Tests: all new; `glass.test.ts` "no colour of the old warm theme" depends on the Task 6 Step 3 veil edits (pull them forward as the plan says). Nothing replaced, nothing weakened.

Risk: `backdrop-filter` on the hover label (`.map-tip`) and zoom buttons over a live canvas; measured in Task 9. Zero JS.

## Task 3: The map runs behind the glass header (plan L1028-2331)

### Call sites as they are today

| Symbol | Definition | Callers (non-test) |
|---|---|---|
| `visibleArea(insetLeft, width, height, edge)` | `state/projection.ts` L74 | `canvas/OverlayDriver.tsx` L43; `canvas/MarkerDriver.tsx` L120 (hover label of a marker, from `w.inset, w.width, w.height`), L168 (`tweenTarget`), L261 (frame callback). **Three in MarkerDriver, not two.** Part 2 Task 7's `RegionNamesDriver` will add one. |
| `applyFrustum(camera, width, height, insetPx)` | `canvas/InitialFrame.tsx` L41 | `InitialFrame.tsx` L152; `canvas/CameraTween.tsx` L191, L203 |
| `frustumCamera(view, width, height, insetPx)` | `InitialFrame.tsx` L27 (new since the plan) | `MarkerDriver.tsx` L164. **The plan does not know this function.** |
| `fitView(cloud, area)` / `FitArea` | `state/bounds.ts` L91 / L74 | `InitialFrame.tsx` L112 |
| `fitOverview(ext, wholeZoom, area)` / `overviewView(data, sliderT, area, wholeZoom)` / `OverviewArea` | `bounds.ts` L156 / L167 / about L122 | `overviewView`: `InitialFrame.tsx` L132 (the snap), `CameraTween.tsx` L126 (`api.opening`). `fitOverview`: only through `overviewView`. |
| `focusCamera(ids, positions, width, height, insetPx, pad, clampZoom)` | `state/focusLayout.ts` L664 | `CameraTween.tsx` L92 (`focusTarget`); **`scripts/perf/layout-cost.mjs` L93, L113, L271** (plain JS through jiti: the typecheck will not catch them; a missed call silently passes `pad` as the top inset). |
| `clampZoom` / `MAX_ZOOM` | `canvas/CameraRig.tsx` L44-46 | `bounds.ts` L161 also clamps `fitOverview` to `MAX_ZOOM`; `state/zoomMath.ts` L52 `pinchZoom` clamps to the raw limits and CameraRig L172 re-clamps with `clampZoom` (no edit). |
| Change key, `FocusFramer.tsx` | L8-13 `focusKey`: `seed|recs|stop|insetLeft|padding` | Add `insetTop`. |
| Change key, `MarkerDriver.tsx` | L151 `moved`: `k[0..7]` = to.x, to.y, to.zoom, insetLeft, stop, width, height, bottomCover; `target: new Float64Array(8)` at L246; `Work.inset/width/height` L53-56, written L288-290 | Add `insetTop` as `k[8]` (array of 9), and `Work.top`. |
| Canvas top read by tests and scripts | `e2e/helpers.ts` L214 (`albumSpread`: `top: r.top`), `docs/.../baseline/capture.mjs` L441 (`hover-map-edge`) | Both must read the stage's top. **The plan misses `albumSpread`.** |

### Corrected edits (where the plan's "before" no longer matches)

1. **`InitialFrame.tsx`.** Imports are L9-13 now: `import { fitView, getCloudBounds, overviewView } from "../state/bounds";`, `import { setFitKind, setFramed, setOverviewFraming, snapKind } from "../state/view";`, `import { FRUSTUM_HALF_HEIGHT } from "../state/zoomLimits";`. Add `setVisibleScale` and `visibleScale` to the last two. `applyFrustum` is L41-53 (plan's body is right). `fitView` call L112-117 (plan's edit is right). The snap's `overviewView(...)` call L132 gains `insetTop: input.insetTop` in its area. `const sliderT` is L89, `lastSize` L91, the synchronous effect L150-161 (plan's edit is right).
   `frustumCamera` (L27-39) gains `insetTopPx: number` and must mirror `applyFrustum`:
   ```ts
   const top = Math.min(Math.max(insetTopPx, 0), height * 0.5);
   view: inset > 0 || top > 0 ? { enabled: true, fullWidth: width, fullHeight: height, offsetX: -inset / 2, offsetY: -top / 2, width, height } : null,
   ```
2. **`bounds.ts`.** Import is L4: `import { COVER_WORLD, FIT_ZOOM_MAX, FIT_ZOOM_MIN, MAX_ZOOM, pxPerWorld, zoomForPxPerWorld } from "./zoomLimits";` (add `visibleScale`). `FitArea` L74-82, `fitView` L91-107: plan's replacement is right. **New:** `OverviewArea` gains a required `insetTop: number`; in `fitOverview` only the cap changes: `Math.min(MAX_ZOOM * visibleScale(height, insetTop), ...)`. I checked the algebra: `across` and the 12.5 px cap do not depend on height, `zoomForPxPerWorld(..., height)` is right for the taller canvas, and the centre stays `ext.medY - bottomCover / 2 / ppw` because `camera.position` is drawn at the centre of the area below the header, so the median row lands in the middle of the band between the header and the slider panel with the same formula. No other term.
3. **`focusLayout.ts`.** `focusCamera` is L664-711; the `availH` line is `const availH = Math.max(height - pad.top - pad.bottom, 80);` (plan's edit is right).
4. **`CameraTween.tsx`.** `flyTarget` L68-86 (plan's edit is right; `const pad = useMapStore.getState().input.framePadding;` is L77). `focusTarget` L92. `api.opening` L126: add `insetTop: input.insetTop` to the area. Frame callback `applyFrustum` calls L191 and L203 (plan says L153, L165).
5. **`CameraRig.tsx`** L10, L44-46 and **`CameraBounds.tsx`** L9, L101-102 (`const viewport = viewportWorldRect(cam);`): plan's edits are right.
6. **`OverlayDriver.tsx`** L42-43: right.
7. **`MarkerDriver.tsx`** (rewritten by part 2 Task 3; the plan's L47 and L96 do not exist):
   - L120: `visibleArea(w.inset, w.width, w.height, TIP_EDGE, w.top)`; add `top: number` to `Work` (L53-56, initial 0 at L239) and `w.top = input.insetTop;` beside L288-290.
   - L151 and L153-160: add `|| k[8] !== input.insetTop` and `k[8] = input.insetTop;`; L246 `new Float64Array(9)`; update the comment at L59 to list it.
   - L164: `frustumCamera(to, width, height, input.insetLeft, input.insetTop)`.
   - L168 and L261: pass `input.insetTop`.
8. **`FocusFramer.tsx`** L12: add `|${s.input.insetTop}` to the key (a window crossing 900 px changes the header by 4 px; the width effect at L41-44 usually covers it, but the input can arrive in a different commit from the canvas resize).
9. **`types.ts`.** Imports are L1-4 (four lines, not two); `insetLeft` is L25-26. **`mapStore.ts`**: import is L4, `insetLeft: 0,` is L15.
10. **`MusicMap.tsx`** L32-34 is the `setInput` effect (plan's edit is right; `setInput` already calls `requestRender()`, `mapStore.ts` L90-93, so a top change draws one frame and the names driver's compare sees it. Reconcile note L37's "call `requestRender()` after `setStageTop`" is therefore satisfied as long as both stay in this one effect).
11. **`e2e/helpers.ts` L214** (missed by the plan). `albumSpread` returns the canvas's edges; `overviewMiss` (L230-240) and `wholeMapMiss` (L245-259) measure from `s.top`, and `e2e/opening.spec.ts` uses them in about ten tests. With the canvas top at 0 they would all fail. Edit: `top: document.querySelector('#stage')!.getBoundingClientRect().top` (keep `left/right/bottom` and `cover` from the canvas) and say so in the `Spread` comment. Same pixel as today, so no assertion changes meaning.
12. **`scripts/perf/layout-cost.mjs`** L93, L113, L271: insert `0` (or the viewport's header height, if the script's `v` gains one) as the sixth argument.
13. **`docs/.../baseline/capture.mjs` L441**: do the plan's Task 10 Step 3 one-line edit (`#stage` instead of `canvas.map-canvas`) **in this task**. `#stage`'s top equals the canvas's top until this task lands, so it is safe at any time, and part 2 Task 9 captures between now and Task 10 would otherwise hover under the header.
14. **CSS.** `shell.css` L66-68 (stage) matches. `map.css` L1, L8, L19, L31 match the plan's "before". `e2e/focus.spec.ts` L54-60 matches.
15. **`screen.test.ts`** is 68 lines and has a `describe('frustumCamera', ...)` (L55-68) that the plan's whole-file replacement would delete. **That would weaken the suite.** Keep it, import `frustumCamera` in the new file, and extend it: every case gets a top inset variant (for example `[300, 3.2, -0.3, 0.05, 64]`, `[0, 1, 0, 0, 60]`), comparing `frustumCamera(view, w, h, inset, top)` with a camera after `applyFrustum(..., inset, top)`.
16. **`bounds.test.ts`.** Import is L22 (`ATLAS_LOAD_PX, COVER_WORLD, FIT_ZOOM_MAX, FIT_ZOOM_MIN, pxPerWorld, zoomForPxPerWorld`; `pxPerWorld` is already there). `fitView` calls to give `insetTop: 0`: L138, L146, L156, L157, L164, L165, **and L337, L348, L367, L380**. `fitOverview`/`overviewView` areas to give `insetTop: 0`: L269, L293, L298, L309 (spread), L339, L349, L368, L381. Add, beside the plan's two `fitView` tests, the same pair for `fitOverview`: a 1440 x 900 canvas with `insetTop: 64` gives the same px per world unit and centre as 1440 x 836 with 0, and 390 x 844 with 60 and `bottomCover: 165` the same as 390 x 784.
17. **`focusLayout.test.ts`.** The three calls are L499, L518, L532 (plan says L109, L128, L142).

### MapStage size trap

`MapStage.tsx` is 19,936 bytes. Measured in `reviews/task0-code-review.md` (re-check): 20,001 bytes one chunk, 20,033 two chunks (+0.6 KB first-load). The plan's verbatim edits cost **+383 bytes** (import +44, the three inserted lines +270, the L36 comment +69): 20,319, split.

Second fact, from the part 2 handoff: Task 6's patch split the chunk again **without touching MapStage.tsx** (`NamesToggle` joined the chunk through `ZoomControls`). So the trigger is not only this file's size; treat "anything new in MapStage's chunk" as a risk and measure. In particular the plan's `import { HEADER_NARROW_PX, HEADER_PX, type ... } from './types'` turns `types.ts` from a type-only import (erased) into a real module in the first-load chunk.

Proposal (comments and one import only; no behaviour change), net **-77 bytes, 19,859**:

| # | Edit in `MapStage.tsx` | Bytes |
|---|---|---|
| 1 | L9 `import { useIsNarrow } from '@/lib/media';` becomes `import { HEADER_NARROW_PX, HEADER_PX, useIsNarrow } from '@/lib/media';` | +29 |
| 2 | After L206 (`insetLeft: view === 'album' && !narrow ? panelInset : 0,`) insert exactly `      insetTop: narrow ? HEADER_NARROW_PX : HEADER_PX,` (the literal `stage.test.ts` pins), with no comment above it | +55 |
| 3 | L23 `import type { MapApi, MapCallbacks, MapInput, MapPadding } from './types';` unchanged | 0 |
| 4 | L36 comment unchanged (the plan's longer wording goes on `MapInput.framePadding` in `types.ts`) | 0 |
| 5 | Delete L40 `// The mockup's fitTarget fits h - 170 and shifts the cloud up 30 px: top 85 - 30, bottom 85 + 30.` and put the sentence on `MapInput.fitPadding` in `types.ts` (L28) | -99 |
| 6 | Delete L42 `// Phone: clear of the bottom slider panel (bottom measured).` (L39 already says it) | -62 |

The two constants are defined in `src/lib/media.ts` beside `NARROW_MEDIA_QUERY` (L3), which MapStage already imports as a value, so no module joins the chunk; `types.ts` re-exports them (`export { HEADER_NARROW_PX, HEADER_PX } from '@/lib/media';`) so `stage.test.ts`, `mapStore.ts` and the plan's "Produces" line keep importing from `components/map/types`. The explanatory comment the plan puts above the constants goes in `media.ts`. Compiled cost in first-load: two numeric constants and one object key, a few tens of bytes; that is unavoidable.

Further room if wanted (recommended, see C2), **-288 bytes more, 19,571**: once Task 2 hides `.map-amb`, the map-variant wash in MapStage is dead. Remove L13 `import { AmbientLayers } from '@/components/album/AmbientWash';` (-64), L154 `const ambient = useAppStore((s) => s.ambient);` (-49), L359 the JSX comment (-93) and L360 `<AmbientLayers ambient={view === 'album' ? ambient : null} variant="map" />` (-82). That also takes a store subscription and a component out of the first-load chunk.

Keep the "Keep this file under 20,000 bytes" comment (L256-257). After the edit: `wc -c src/components/map/MapStage.tsx`, then build and compare `/` first-load and the chunk count with the number recorded on HEAD before the task.

### Wrong assumptions in the plan's tests, and the corrected tests

`e2e/framing.spec.ts` (plan L1142-1517):

- **"the overview and the whole map" (L1267-1281).** The map opens at the Overview; two zoom-outs from there do not reach the floor (Overview is about 2.75 x the Whole map at 1440 x 900; two presses are 2.56). Corrected sequence and keys: record `opening` on load; press the fit button, idle, record `whole`; zoom out twice, record `floor`; press the fit button, compare `whole` again ("the fit button comes back to the Whole map exactly"). Twelve keys in the record instead of eleven (`desktop/` and `phone/` x `opening`, `whole`, `floor`, `pick`, `album`, `deepest`, plus `desktop/search`); update the expected key list in Step 2 (plan L1531).
- **"after every fit nothing is behind the header" (L1337-1338).** At the Overview albums run off the top by design. Replace the first assertion with `expect(overviewMiss(await albumSpread(page))).toEqual([])` (with fix 11 its `top` is the header's bottom, so it pins the median row in the middle of the area below the bar and the 24 px side margins), then press the fit button and assert `highestAlbum >= bottom + (isMobile ? 90 : 55) - 1` and `wholeMapMiss(...)` empty. Both framings pinned; nothing dropped.
- **"markers stay below the header, also after the visitor has moved the map" (L1356-1374).** Part 2 Task 3 eases covers for 180 ms in the DOM after a motion ends (`MARKER_SETTLE_MS`, rAF driven, not a CSS animation, so `waitForAnimations` does not see it). Before reading `tops()` wait until `window.__rmr.markerLayout?.()` is non-null (it returns null while an ease runs; `MarkerDriver.tsx` L203-217). Check both during and after if wanted; do not relax the 7.5 px.
- Record step (plan Step 2): add the same wait before every `sameAsRecorded` that has markers, and call `waitForGasSharpSettled` nowhere here (positions only).
- **"glints never start under the header" (L1481-1516)** needs `.tw-layer` (part 2 Task 8). See blocked steps.
- "the hover label never slides under the header": one zoom-in from the Overview gives about 17.8 px covers (cross-fade band); hover still works. Keep.
- "keyboard order": ten stops match the code now (names button is in).
- `e2e/glass.spec.ts` "header text keeps 4.5:1 with the brightest gas behind the bar" (plan L2238-2283): add the `__rmrGasLite = 'off'` init script; `theme.stars.bg` exists (12,243 bytes = 3 x 4081). `twinkleOff` needs Task 8.

`src/styles/stage.test.ts`: as planned. Its `setStageTop(input.insetTop);` assertion needs `state/stageTop.ts`.

Record timing: `framing-baseline.json` stores `.mk` boxes. Part 2 Task 4 (cased lines, frames, badges) and the Task 3 carry-over change marker drawing. **Record only after part 2 Task 4 is on the branch**, on the commit just before this task's code; otherwise the "never record again" rule and Task 4 collide (C5).

### What can be built before part 2 Tasks 7 and 8

| Step | Needs | Without it |
|---|---|---|
| Steps 1-7, 9, 11 and the corrections above | nothing from 7 or 8 | Build now (after part 2 Task 4, for the record). |
| Step 8, `setStageTop(input.insetTop)` in `MusicMap.tsx`; `stage.test.ts` "the names and the glints are told the same height" | `setStageTop` from `state/stageTop.ts` (part 2 Task 7) | Recommended: create `state/stageTop.ts` and `stageTop.test.ts` here, verbatim from part 2's plan (L3530-3570); Task 7 then finds them and skips its "Create". |
| Step 8, names driver `visibleArea(inset, width, height, 0, top)` | `canvas/RegionNamesDriver.tsx` (Task 7) | Task 7 writes the five-argument call itself; note it in Task 7's brief. Its `Basis` compare already includes `top`. |
| `framing.spec.ts` "glints never start under the header" | `.tw-layer`, `.tw` (Task 8), and `getStageTop()` read by `TwinkleDriver` | Do not commit a red or skipped test: add it in the commit that lands Task 8. |
| `glass.spec.ts` `twinkleOff(page)` calls | `twinkleOff` in `e2e/helpers.ts` (Task 8) | Add with Task 8. |

### Tests: what each proves

- `framing.spec.ts` "same place": album and marker positions equal to the pre-change record within 0.75 px at six states per project: the proof that the header change moved nothing.
- Unit pairs (`screen`, `bounds` incl. the new `fitOverview` pair, `focusLayout`, `zoomLimits`): a canvas with a top inset equals a shorter canvas; catches a caller that ignores the inset without a browser.
- `focus.spec.ts` L54-60 tightened (top bound from 0 to the header's bottom): stricter.
- `stage.test.ts`: CSS and camera use the same two heights at one breakpoint.

### Risks

- First-load: the MapStage trap above; `media.ts` gains two constants.
- Speed: a 64 px taller canvas is 7.7 percent more pixels for the gas and the header's blur now has a moving canvas behind it. Task 9 Step 6 measures; the dpr 2 column is the one to watch.
- `GasField` sharper-image threshold moves slightly with the taller canvas (reconcile note L23); no edit.
- Known gap carried from Task 0 (resize during a camera tween ends at the old size's target): this task adds one more resize-like trigger (crossing 900 px). Not in scope; log it for Task 10.

## Task 4: Dark casing for the selected ring and map focus rings (plan L2333-2611)

Buildable after Tasks 1-3 (it uses `brightestAlbums` and the glass spec from Task 3). CSS and tests only.

| File | Anchor today |
|---|---|
| `src/styles/map.css` | `.map-sel` L17, `.map-sel::after` L18, `.map-ui > * { pointer-events: auto; }` L20: all match the plan's "before" |
| `src/components/map/MusicMap.tsx` | L11 `/** Amber ring around the album selected in Explore; positioned by OverlayDriver. */` |
| `src/lib/contrast.test.ts`, `e2e/glass.spec.ts` | append |

Corrections:
- Both new browser tests read screenshot pixels: add the `__rmrGasLite = 'off'` init script to each.
- "at the overview a pick is marked by the DOM ring": true at the Overview too (11.1 px covers, dots). The brightest album may be off screen there (the Overview is a crop); the test already walks the forty brightest and takes the first on the canvas. Keep the count at forty; if none is free, open with `__rmrOpen = 'whole'` rather than lowering anything.
- `twinkleOff`: needs part 2 Task 8 (same rule as Task 3).
- `tabTo` exists (`e2e/helpers.ts` L145).
- The focus casing rule `.map-ui :focus-visible:not(input), .fab-map--on:focus-visible` now also covers `button.map-names` (it is inside `.map-ui`). `.map-zoom .map-names + button` gets its top border back (`map.css` L101); the `z-index: 1` of the casing rule still lifts a focused grid item. Have the states reviewer look at `c7-explore-names-focus`.
- Step 4 "do not push": withdrawn.

Tests: additions only. Risk: none to JS; a `box-shadow` on a positioned 18 px ring is cheap.

## Task 5: Phone strip on the nebula, and the phone layout guard (plan L2613-3047)

Buildable now (needs Task 1's tokens only for the two hex constants). The guard test passes today's markup (names button is in).

### What the plan assumed and what is real

| Plan | Real |
|---|---|
| `/data/theme/gas-${stop}.webp` | `gas-<stop>.<hash>.webp`; name from `theme.gas[stop].hash[0]` (`gasUrl(stop, hash)` in `shaders/gas.ts` L51). Phones use the first image, never `-sharp`. |
| Square image over `[-bakeHalf, bakeHalf]^2`; `StripGas { image; bakeHalf }` | Each stop has its own rectangle `theme.gas[stop].rect = [west, south, east, north]` in raw units (the units of `positions.json`, which the strip draws in) and size `px = [w, h]`: sonic 2048 x 1970 over `[-1.485, -1.204, 1.148, 1.329]`, balanced 1803 x 2048 over `[-1.454, -1.454, 1.123, 1.473]`, mood 1537 x 2048 over `[-1.254, -1.454, 0.854, 1.354]`. Stored upright (row 0 is north). Outside the rectangle: plain sky. |
| A 512 x 512 copy | The copy keeps the aspect: longer side 512. |
| `loadTheme()` gives `bakeHalf` | `loadTheme()` (`lib/data/theme.ts` L114) gives `ThemeData` v3; guard it with `themeFor(theme, catalog.albums.length)` (L130) so a stale bake draws no gas. |
| `drawStrip` stand-in | Today's file is 181 lines; `drawStrip(ctx, w, h, albums, pos, focus, accent, onReady)`, dots drawn in three passes with `DOT` (L15), `ctx.clearRect` first (L62). Whole-file replace still applies. `layoutMarkers` has `options.minLine` (`focusLayout.ts` L54). |

### Corrected drawing

```ts
/** The gas of one slider stop, drawn under the strip's stars. */
export interface StripGas {
  image: CanvasImageSource;
  /** The raw rectangle the image covers: west, south, east, north (theme.json gas[stop].rect), north up. */
  rect: readonly [number, number, number, number];
}
const GAS_PX = 512;
/** The first gas image of a stop: the same name as shaders/gas.ts gasUrl(stop, hash). Written out here because
 * gas.ts holds the gas shaders and belongs to the lazy map chunk (MapPreviewStrip.test.ts keeps the two equal). */
export const stripGasUrl = (stop: StopId, hash: readonly [string, string]): string => `/data/theme/gas-${stop}.${hash[0]}.webp`;
/** Size of the strip's copy: the image's own aspect, longer side GAS_PX. */
export function gasCopySize(px: readonly [number, number]): [number, number] {
  const k = GAS_PX / Math.max(px[0], px[1]);
  return [Math.max(1, Math.round(px[0] * k)), Math.max(1, Math.round(px[1] * k))];
}
```

`loadGas(stop, gas: ThemeGas)`: cache by URL (the hash is in it), `im.src = stripGasUrl(stop, gas.hash)`, after `decode()` refuse an image whose `naturalWidth`/`naturalHeight` differ from `gas.px` (the rule of `gasImageFits`, `gas.ts` L56), then draw it into a canvas of `gasCopySize(gas.px)` and drop the `Image` (the full decode is about 15 MB). In `drawStrip`:

```ts
if (gas) {
  const [west, south, east, north] = gas.rect;
  ctx.drawImage(gas.image, sx(west), sy(north), (east - west) * k, (north - south) * k);
}
```

The effect: `loadTheme()` then `themeFor(theme, catalog.albums.length)`; if null, no gas; else `loadGas(stop, t.gas[stop])` and `setGas({ stop, image, rect: t.gas[stop].rect })`. `catalog` joins the effect's dependencies. Everything else of the plan's file stands (sky fill first, one-size stars, cased lines, seed backing, `minLine: 10`).

### Corrected pinned test (replaces plan L2664-2671)

```ts
it("draws the gas under the stars, placed by the stop's own rectangle in the strip's scale", () => {
  const { ctx, calls } = fakeCtx();
  const image = { toString: () => 'GAS' } as unknown as CanvasImageSource;
  // Not square and not centred, so a swapped edge or a square assumption shows.
  drawStrip(ctx, 390, 172, albums, pos, FOCUS, { image, rect: [-1.4, -1.2, 1.1, 1.4] }, vi.fn());
  // Scale 336 px per unit, centred on (-0.25, -0.3333): west -1.4 is x = -191.4, north 1.4 is y = -496.4,
  // 2.5 units wide is 840 px, 2.6 units tall is 873.6 px.
  expect(calls).toContain('drawImage(GAS,-191,-496,840,874)');
  expect(calls.indexOf('drawImage(GAS,-191,-496,840,874)')).toBeLessThan(calls.findIndex((c) => c.startsWith('arc(')));
});

it('names the first gas image as the map does, never the sharper one, and keeps its aspect in the copy', () => {
  const hash = ['0123456789', 'abcdef0123'] as const;
  for (const stop of STOP_IDS) expect(stripGasUrl(stop, hash)).toBe(gasUrl(stop, hash));
  expect(stripGasUrl('mood', hash)).not.toContain('sharp');
  expect(gasCopySize([1803, 2048])).toEqual([451, 512]);
  expect(gasCopySize([2048, 1970])).toEqual([512, 493]);
});
```

(Arithmetic checked: k = 112 / (1/3) = 336; 195 + (-1.4 + 0.25) x 336 = -191.4; 86 - (1.4 + 1/3) x 336 = -496.4.) The plan's other two tests stand unchanged (they pass `null` for the gas). The old file's one test is fully covered by the first new test (plan L2689 is right), so nothing is weaker.

### Would importing `gasUrl` pull `shaders/gas.ts` into the album chunk?

`shaders/gas.ts` is 33,346 bytes of source, mostly GLSL template strings built at module level, and imports `../state/zoomLimits` and `../theme`. `MapPreviewStrip` is imported by `AlbumPanel.tsx` L14 (the album route's chunk, loaded on every `/album/...` first load). Whether Turbopack drops the unused shader strings is not something to rely on, and today nothing outside the lazy map imports that file. So: **do not import it in the component**; use the one-line `stripGasUrl` above and import `gasUrl` only in the test. `lib/data/theme.ts` (`loadTheme`, `themeFor`) is already first-load through MapStage, so it adds nothing.

### Other notes

- 2D canvas premultiplies alpha: look at thin dust on the strip by eye (reconcile note L21).
- The image URL is the one `GasField` fetches (`GasField.tsx` L66, `fetch(url)`), so the phone list does not download the stop's gas twice; it is decoded twice (once per consumer).
- At a tight focus the strip scale can reach 5000 px per unit while the copy has about 200 px per unit: the gas is soft there. It is a backdrop; judge it in the phone review.
- Guard test (plan L2974-3018): selector `.map-zoom button, button.map-names, .map-names button` matches four buttons now. `e2e/focus.spec.ts` L322 already measures the taller `.map-zoom` box (handoff). `waitForMap` after the Map tap is right.
- "Look at `phone-album-list.png`": taken on the software browser; fine for layout, not for gas colour.

Risk: one more image decode on the phone album list (async, off the main thread) and one 2048 px to 512 px `drawImage` per stop on the main thread, once. Measure the phone "select to album" row in Task 9 against part 2's number.

## Task 6: Home, About and 404 over the nebula (plan L3049-3182)

Buildable now except `twinkleOff` (part 2 Task 8; glints play on Home, so this test should land with or after Task 8, or add the call then).

### What the handoff and reconcile notes call for

1. **`GAS_DIMMED_STRENGTH` 0.6 becomes 1** (`shaders/gas.ts` L41; used at `GasField.tsx` L999 `const dimTarget = input.dimmed ? GAS_DIMMED_STRENGTH : 1;`). Ledger ruling, part 1 L36; fidelity finding S1: the approved Home is the prototype's render, which has no such constant; at 0.6 the lower core is half as bright as approved.
2. **The uneven veil** is not a new gradient. In the prototype it is exactly what the plan's Steps 3 and 4 already write: a uniform `.veil { background: rgba(7, 6, 10, .1); }` (prototype `pages.css` L6; that is the "lower core at 0.89") plus the blurred pad behind the hero, `rgba(5, 4, 8, .72)` with `filter: blur(26px)` (prototype `pages.css` L22; that is the "rust at the top to 0.6"). So the plan's CSS stands; only the constant was missing. The plan's shelf scrim (`inset: 0 -50vw`, `.7` from 30 px) is wider and starts sooner than the prototype's (`inset: 10px 0 0`, `.7` at 40 percent, shelf width only): tell the fidelity reviewer it is deliberate (ruling 7).
3. **Files list gains** `src/components/map/shaders/gas.ts` and `gas.test.ts`. Leave `GasField.tsx`'s easing code alone (with the constant at 1 it is inert, and the shader text is pinned by other tests).

### `gas.test.ts` today, and the rewrite

L610-613:
```ts
it("dims the gas on the dimmed pages", () => {
  expect(GAS_DIMMED_STRENGTH).toBeGreaterThan(0.3);
  expect(GAS_DIMMED_STRENGTH).toBeLessThan(1);
});
```
1 breaks the second line. The property "the gas is dimmer on Home" is reversed on purpose by the owner's ruling, so the test cannot be kept; it is replaced by tests that pin where the dimming now lives, each exact rather than a range:

```ts
it("leaves the gas at full strength on Home, About and 404: the approved Home (final-home.jpg) is dimmed by the veil and the hero's pad in CSS, not in the shader", () => {
  expect(GAS_DIMMED_STRENGTH).toBe(1);
});
```
and in `src/styles/glass.test.ts` (new `describe('Home over the nebula')`):
```ts
expect(rule(map, '.veil').background).toBe('rgba(7, 6, 10, .1)');
expect(rule(home, '.hero::before').background).toMatch(/^rgba\(5, 4, 8, ([\d.]+)\)$/);   // .72 or what Step 5's ladder ends on
expect(rule(home, '.hero::before').filter).toBe('blur(26px)');
expect(read('styles/phone.css')).not.toMatch(/\.veil\b/);
```
(`glass.test.ts` has no `rule()` helper; copy the one in `stage.test.ts`.) What the set still proves: the old lower bound (the gas is never dimmed away, `> 0.3`) holds since 1 > 0.3; the old upper bound's intent (text on the dimmed pages sits on something darker than the bare gas) is now proved by measurement in `pages.spec.ts` "text over the nebula keeps 4.5:1" instead of by a constant. Say this in the commit message, as reconcile note L24 asks.

Recommended extra, so fidelity is pinned and not only contrast (new, not in the plan): in `pages.spec.ts`, full shader forced, compare the same client rectangle on a fresh `/` and on `/map` opened with `__rmrOpen = 'whole'` (the same camera): mean luma in the lower core, clear of the hero and shelf, at least 0.8 of the map's (approved picture: 0.89). Rectangle from S1, scaled to the test viewport (S1 used 600,520 to 1000,720 on a full screenshot).

### Contrast table for Home, recomputed for full-strength gas (WCAG 2; veil .1 then the pad or scrim, over a flat backdrop)

| Surface | Over white | Over cream gas `rgb(244, 238, 222)` |
|---|---|---|
| Hero pad .72 | paper 8.48, dust 5.31 | paper 9.06, dust 5.67 |
| Shelf scrim .70 | ash 3.61, dust 4.84 | **ash 3.88**, dust 5.20 |
| Shelf scrim .76 | ash 4.46 | ash 4.71 |
| Shelf scrim .82 | ash 5.44 | ash 5.65 |
| 404 scrim .55 (no veil) | paper 3.98, dust 2.49 | paper 4.44, dust 2.78 |
| 404 scrim .73 | paper 7.91, dust 4.95 | paper 8.49, dust 5.32 |
| 404 scrim .79 | paper 9.99, dust 6.25, ash 4.67 | paper 10.54, dust 6.60, ash 4.93 |

So with the gas at full strength the shelf caption (ash) fails the worst case at the plan's `.7` and passes over cream at `.76`; expect Step 5's ladder to take one step if bright gas sits under the caption at the Whole map. The pad's blur thins it at its edges, so the measured hero numbers can be lower than the flat ones: the measurement decides. The 404 scrim's worst case fails at `.55`; see C4.

### Anchors

| File | Today |
|---|---|
| `src/styles/home.css` | `.home` L3, `.hero` L5, `.shelf` L11, phone `.hero { padding-top: 40px; }` L54: all match |
| `src/styles/map.css` | veil block L138-142 (plan: L132-136) |
| `src/styles/phone.css` | L4-6 match |
| `e2e/pages.spec.ts` | import L3: `import { shot, waitForAnimations, waitForMap, waitForMapQuiet } from './helpers';` |

Test corrections: add the `__rmrGasLite = 'off'` init script at the top of the new test (it applies to all three `goto`s). Take Home on a fresh load of `/` (the test does). Step 2's expected red state may differ: with strength 1 more selectors can fail first.

Other: Home's backdrop is the Whole map on both paths (fresh load, and from an untouched `/map`, which glides back in 420 ms); a visitor who moved the map sees their own view behind the hero, so the 4.5:1 test's worst case is the table above, not the Whole map's.

Risk: none to JS. `filter: blur(26px)` on a static pseudo-element is rasterised once.

## Task 7: Theme-coupled tests (plan L3184-3375)

Buildable now for `search.spec.ts` (after Task 1) and `types.ts`; the `explore.spec.ts` rewrite can land any time after Task 1 (the frame is already `FRAME_RGB`, `shaders/album.ts` L274, L372; `SELECTION_DIM = 0.5` L73).

| File | Anchor today |
|---|---|
| `e2e/explore.spec.ts` | `meanLuma` L53-74, `isLamp` L75 (plan: L52-75); the test L295-328 with `const PANE_LUMA = 19; // #17120e` L326 |
| `e2e/search.spec.ts` | L137, L143, L145 match |
| `src/lib/types.ts` | L9 `/** [wash, wash, accent] as #rrggbb. The accent passes 4.5:1 on #15110d. */` |
| "amber" grep | only `MusicMap.tsx` L11 (Task 4 rewrites it) |

Corrections:
- The rewritten cover test reads gas-backed pixels: add the `__rmrGasLite = 'off'` init script.
- It is the branch's known-red test ("red on purpose", fails at `isLamp`). It turns green here.
- After Task 3 covers can sit under the header; `otherCoverBoxes` uses `elementFromPoint` on the four corners, which excludes them. Fine.
- `pickKnown` at the Overview: `flyTo` zooms in to covers as before.

Is the rewrite weaker? No: `isFrame` tolerances are tighter (16, 16, 18 against 30, 30, 35), the last line adds a negative check, the 0.7 threshold is kept, and the measure (detail inside lone covers) fails if the dimming is lost. One thing to hold: the old test ran its dimming check on the phone too; the new one needs at least four lone covers there. If the phone has fewer, use another album (plan L3349), never a lower count.

Step 7 (whole suite): run once, after the task is rebased on the branch (ledger ruling). Known reds to expect instead: the cloud-only `i.scdn.co` tests and the two software frame-gap tests in `gas.spec.ts` (handoff).

## Task 8: Favicon (plan L3377-3511)

Buildable now; independent of everything but Task 1's hex values and `glass.test.ts` existing (Task 2). Anchors: `src/app/icon.svg` (6 lines), `scripts/icons/icon-16.svg`, `scripts/icons/apple-icon.svg` each have 3 `<circle ` and 1 `<path `; old colours as the plan lists (`#cdc2ad` is in `icon-16.svg` only; `apple-icon.svg` has no `#322a21`). `scripts/icons/build.mjs` does not exist. No JS in any chunk.

Corrections: Step 4 runs a build and a headless Chromium: serialise through the shared lock (ledger). "Do not push": withdrawn; pushing changes the favicon on the preview, which is fine.

## Task 9: Speed against the baseline (plan L3513-3980)

### `scripts/perf/perf.mjs` today (481 lines)

| Lines | What |
|---|---|
| L10 | `import { checkBudgets, checkPages, formatTable } from './lib.mjs';` |
| L16-20 | `args`, `opt(name)` |
| L21-31 | `MODES`, `VIEWPORTS` (`desktop`, `phone`, `desktop2x`) |
| L32-43 | `NO_GAS` (`--no-gas`), `GAS_LITE` (`--gas-lite off|force`), `OPEN` (`--open whole`, exits 2 on anything else) |
| L44 | `function sh(cmd, cmdArgs) {` : the plan's insert point for `GLASS`, `TWINKLE`, `NAMES`, `forceEffects` still works (directly before it) |
| L94-168 | `PAGE_HELPERS` (in-page `window.__perf`: `settled`, `sharpSettled` L136, frame-gap helpers) |
| L170-210 | `albumFlow(page, isPhone)` (in-page navigation from `/`) |
| L216-230 | `openingFlow(browser, vpName, errors)`: **a new browser context**, cold cache, adds `PAGE_HELPERS` and the `GAS_LITE` init script, no `__rmrOpen` |
| L232-272 | `openingSteps(page, isPhone)`: `await page.goto(`${BASE}/map`, { waitUntil: 'load' });` at **L233** |
| L274-363 | `exploreFlow(page, isPhone)`: `addInitScript(() => { window.__rmrOpen = 'whole'; })` L277, `goto /map` at **L280**, `idleSharpSettled` L354, `idleFrames` L360 |
| L365-428 | `measure(mode, vpName)`: `goto /` at **L382**; runs `albumFlow`, `exploreFlow`, then `openingFlow` unless `--open whole` (L419-422) |
| L430-481 | `main`: loops modes and viewports, `checkBudgets` skipped for `desktop2x` (L452), writes `{ js, rows, fails, open }` (L467) |

Where the plan's hooks go, corrected:
- **Three full page loads, not two.** "Each of the two `goto` lines is in the file once" is false: `${BASE}/map` is loaded at L233 and L280. Call `await forceEffects(page);` directly after **L233, L280 and L382**. With no flag `forceEffects` does nothing, so default runs are unchanged.
- In `openingFlow` the page is new, so the inline glass properties and the store settings must be applied there too (that is the L233 call).
- `--names` uses `window.__rmr.getState().setNamesOn(v)`: exists now (it also writes `localStorage` through `namesPref.ts`; each context is fresh, so no leak between runs).
- `--twinkle` needs `window.__rmr.twinkle` and `setTwinkleOn` (part 2 Task 8). Before Task 8, `forceEffects` would wait 30 s and throw.

### `scripts/perf/lib.mjs` today (79 lines)

`BUDGET_KEYS` L2, `GAP_KEYS` L9, `checkBudgets` L17, `checkPages` L40, `ROWS` L52-73 (already has "Gas shader", "Nebula visible", the two opening rows and the two deep zoom rows), `formatTable` L75. Append `glassVars`, `COMPARE_KEYS`, `summarise`, `compareRuns` at the end as planned. `lib.test.mjs` L2 import matches.

Corrections to `COMPARE_KEYS` and `compare.mjs`:
- Add `'openingDragGapMs', 'openingZoomGapMs'` to `COMPARE_KEYS` (rows exist since part 2 Task 0; no baseline value, so they print "no baseline"). In `compare.mjs` put both in the yardstick list for GPU columns (50 ms, "reported only"), as the Task 0 ruling says. Remember the opening rows run on a cold cache (software desktop measured 1177 ms for the opening zoom): never read the software value as a size.
- **The deep zoom baseline is not in `baseline/perf/`.** It is `docs/design/trifid-theme/reviews/perf-part1/baseline-gpu-deep-run1.json` to `run3.json` (gpu columns, dpr 1). `compare.mjs`'s `load()` only reads `perf-*.json` from one folder, so the deep rows would print "no baseline". Fix: let `compare.mjs` take extra baseline files after the two folders and use only `deepDragGapMs` and `deepMorphGapMs` from them; do not copy or rename baseline files.
- `baseline/perf/` holds `perf-run1..3.json`, `perf-dpr2-run1..3.json`, `hover.json` as the plan says.
- Budget rows are measured at the Whole map (`__rmrOpen = 'whole'`), so they stay like for like with the baseline.

Other stale points:
- L3530, L3853, L3877: 190.5 KB is the baseline; "now" starts from the number measured on HEAD (see top). Report part 3's own growth separately; it should be near zero (Task 3's constants only).
- Step 7 hover: run `hover-measure.mjs` twice, default (`--open whole`, like the baseline) and `--open app` (the Overview); it already lets the sharper image settle.
- Step 7 `twinkle-cost.mjs` and Step 8's "part 2's Task 9 step 7 table": exist only after part 2 Tasks 8 and 9.
- Step 5: timing runs need mains power (`pmset -g batt`), no `nice`, nothing else heavy, old and new builds in turn in the same session; a cloud run compares old against new only.
- Idle rows: the sharper-image wait is already in `exploreFlow` (L354). If `idleFrames` is over 0, look at `sharpFlag` and `idleSharpSettled` in the JSON before anything else.
- Part 1's three open rows (handoff "Part 1 closing": software desktop search usable 189 against 121 ms, slider to list at dpr 2, gpu phone morph gap, startup tasks of 50 ms or more in 6 of 11 loads) must be explained or fixed in this task's write-up.
- Step 4 and Step 10 "do not push": withdrawn.

Buildable before part 2 Tasks 7 and 8: Steps 1-4 (tools), with `--twinkle` untested. Steps 5-9 need the whole theme.

Tests: `lib.test.mjs` additions only. Add one case for the extra-baseline-files rule if it is implemented in `lib.mjs`.

## Task 10: Review rounds (plan L3982-4248)

Needs everything. Corrections:

- `scripts/review-shots.mjs` is 143 lines: `SIZES` L14-18, `mapReady` L20 (waits for `gas` ready or off), `STATES` from L22, `'a1-home'` L23, `'c1-explore'` L37, `'c3-explore-zoomed'` ends about L60, `'d5-album-longtitle'` L69, `'h1-album-mapmode'` L88-93. The plan's inserts apply by text.
- It has no gas shader option and no sharper-image wait. Its pictures go to the fidelity reviewer, so add to its page setup `addInitScript(() => { window.__rmrGasLite = 'off'; })`, and before each picture wait for the sharper image to settle (port `sharpSettled` from `perf.mjs` L136) and switch the glints off except in `c10`.
- **`c1-explore` is now the Overview** and pairs with `final-overview.jpg`: right as it is.
- **`c4-explore-whole`** as written zooms out once from the Overview, which is neither the Whole map nor the floor. Corrected: `await p.evaluate(() => window.__rmr.map.reset());`, wait until `!isAnimating()`, then `zoomBy(1 / 1.6)` (clamps at the floor) for `final-whole.jpg`.
- `c5` uses `localStorage` key `rmr-names` with `'0'`: confirmed (`src/lib/namesPref.ts`, `NAMES_KEY`; only an exact `'0'` means off).
- Capture: `capture.mjs` takes `--gas full|lighter` (default full) and `--open whole|app` (default whole). The Overview picture to judge against `final-overview.jpg` is `map-opening.jpg`; `map-overview.jpg` stays the whole-cloud fit and `map-whole.jpg` the floor. `--still` exists only after part 2 Task 9. The `hover-map-edge` line is L441 and should already have been changed in Task 3 (correction 13).
- Step 3's "camera zoom smaller by 836/900": true of the Whole map states; the opening state has no baseline counterpart.
- Fidelity brief (Step 4): add to the intended differences: the Home shelf scrim is full width; pair `d1600-c1-explore.png` is the opening view.
- Regression brief (Step 6), add to "changed on purpose": the map opens at the Overview; from the untouched Overview, Home glides back to the Whole map; on a desktop with a GPU the opening view fetches the stop's sharper gas image (about 0.8 MB); Home's gas at full strength under a light veil. Also carry the acceptance list of the build handoff (marks on the brightest cream gas) and part 2's carried findings (handoff "Carried findings").
- Open owner questions to carry into the PR: tile colour, the tile rim, "Place names", "Reset view" label, README wording, pruning about 55 MB of review images.
- "No one creates that preview here, and nothing is pushed here": withdrawn; previews exist from every push.

## Task 11: Docs, PR, owner's trial (plan L4250-4425)

Needs everything. Anchors hold: design spec L128 (`--color-ochre` row) and L133 (`- Never: pure black, ...`); `frontcreck/README.md` has `## Map theme data` L49 and `## Deployment` L75, the `npm run theme` row L32.

Corrections:
- Steps 5, 6 and 8: the push is not gated. Replace Step 5 with: push, update PR 47's body, then move issue 45 and send the checklist. The stop is before the merge.
- PR body and the "Changed from today's site" list say "Every framing is held to the pixel of the current site" and "Album positions on screen are the same as today's to the pixel" (item 4). False for the opening view since part 2 Task 0. Reword to "the same as before the map ran under the header", and add the three Task 0 items (see Task 10).
- README "Theme" section: if the constants live in `src/lib/media.ts` (Task 3 proposal), the sentence naming `src/components/map/types.ts` needs "re-exported from"; or name `media.ts`.
- Step 4's `git diff --stat ... frontcreck/src/lib/copy.ts`: shows part 2's `names` string only, as the plan expects.
- Step 8 phone glass switch: unchanged.

---

## (a) Dependencies and what can run in parallel

| Task | Needs first | Shares files with | Can run beside |
|---|---|---|---|
| 3.1 tokens | nothing | `globals.css`, `shell.css` L30, `contrast.test.ts`, `layout.tsx`, `search.spec.ts` (3.7) | 3.8, part 2 Tasks 4, 7, 8 |
| 3.2 glass | 3.1 | `shell.css`, `map.css` L39-58 and the veil, `album.css`, `home.css` (3.6), `phone.css` (3.6), `contrast.test.ts`, `helpers.ts` (append; part 2 Task 8 also appends), `layout.tsx`, `opening.spec.ts`, `phone.spec.ts` (3.5 appends too), `nowebgl.spec.ts` | 3.8 after `glass.test.ts` exists; 3.5's component work; part 2 Task 4 if it stays inside `map.css` L72-101 |
| 3.3 header | 3.2; **part 2 Task 4** (marker drawing, same file `MarkerDriver.tsx`) | `MapStage.tsx`, `MusicMap.tsx` (3.4 comment; part 2 Tasks 7, 8 add imports), `types.ts`, `mapStore.ts`, `InitialFrame.tsx`, `CameraTween.tsx`, `CameraRig.tsx`, `CameraBounds.tsx`, `OverlayDriver.tsx`, `MarkerDriver.tsx`, `FocusFramer.tsx`, `bounds.ts`, `projection.ts`, `focusLayout.ts`, `view.ts`, `zoomLimits.ts`, `media.ts`, `map.css` L1-31, `shell.css` L66-68, `helpers.ts`, `focus.spec.ts`, `glass.spec.ts`, `layout-cost.mjs`, `capture.mjs` | Nothing that touches the map canvas code. Serial with part 2 Tasks 4 and 7 (both read or edit the same drivers). 3.5, 3.6, 3.8 are safe beside it. |
| 3.4 casing | 3.3 (`brightestAlbums`, `glass.spec.ts`) | `map.css` L17-20, `MusicMap.tsx` L11, `contrast.test.ts`, `glass.spec.ts` | 3.5, 3.6, 3.8 |
| 3.5 strip | 3.1 | `MapPreviewStrip.tsx` and its test (nobody else), `phone.spec.ts` (3.2 appends) | everything except 3.2's `phone.spec.ts` append (merge order only) |
| 3.6 Home | 3.2 | `home.css`, `map.css` veil, `phone.css`, `pages.spec.ts`, `shaders/gas.ts` L41, `gas.test.ts` L610-613, `glass.test.ts` | 3.3, 3.4, 3.5, 3.8. Not beside a part 1 gas fix in `gas.ts`. |
| 3.7 tests | 3.1; 3.4 for the "amber" grep | `explore.spec.ts`, `search.spec.ts`, `types.ts` L9 | 3.3 (different files), 3.5, 3.6, 3.8 |
| 3.8 favicon | 3.1 values; `glass.test.ts` from 3.2 | `glass.test.ts` (append; 3.6 appends too) | everything |
| 3.9 perf | tools: 3.1; runs: all of parts 2 and 3 | `perf.mjs`, `lib.mjs` (part 2 Task 9 may touch `perf.mjs`) | tools beside anything; runs alone, on mains |
| 3.10 reviews | everything | `review-shots.mjs`, `capture.mjs` | nothing heavy |
| 3.11 docs, PR | everything | README, spec | nothing |

Shortest safe order: (3.1 + 3.2) and 3.8 and 3.5 in parallel now, with part 2 Tasks 4, 7, 8 proceeding; then 3.6 and 3.7; 3.3 after part 2 Task 4 (creating `stageTop.ts` if Task 7 has not); 3.4; the `twinkleOff` and glint test additions with part 2 Task 8; 3.9; 3.10; 3.11.

## (b) New wording part 3 introduces

Site copy (`copy.ts`), labels, aria-labels, hint lines: **none.** The hint line keeps `COPY.map.hint` / `hintAlbum`; only its colour and band change. No new aria-label (the casing, the glass and the favicon carry no text).

Pending from part 2, shown again because part 3's tests and reviews use them: `'Place names'` (`COPY.map.names`), and the fit button's `'Reset view'` (`COPY.map.reset`), which no longer returns to the opening view.

Text outside the site that ships in the public repo or under the owner's account, quoted from the plan:

1. `frontcreck/README.md`, new section (plan L4293-4302):
   > ## Theme
   >
   > The look is the Trifid nebula theme; the decisions behind it are in [`../docs/design/trifid-theme/HANDOFF.md`](../docs/design/trifid-theme/HANDOFF.md). The colour tokens are in `src/app/globals.css`.
   >
   > Panels over the map are see-through glass on wide screens. On phones, in browsers without `backdrop-filter`, and when the system asks for reduced transparency, they are fully solid instead: three one-line rules next to the tokens do this. The first of them is the phone glass switch: removing that one line gives phones glass.
   >
   > The map canvas starts at the top of the window, behind the header, and the header is glass over it. The camera knows the header's height as `MapInput.insetTop` (`HEADER_PX`, and `HEADER_NARROW_PX` under 900 px wide, in `src/components/map/types.ts`: the two values of `--hdr`), so albums are framed in the area below the header. `e2e/framing.spec.ts` holds every framing to positions recorded before that change (`e2e/fixtures/framing-baseline.json`); do not record that file again.
   >
   > `npm run perf -- --glass on` and `--glass off` force glass or solid panels, `--twinkle on` and `--twinkle off` the glints, and `--names on` and `--names off` the region names, to measure what each costs. `node scripts/perf/compare.mjs <baselineDir> <currentDir>` sets a set of runs beside another. `src/lib/contrast.test.ts` checks that every text colour keeps 4.5:1 on glass over a white backdrop and on the solid fallback.
2. Design spec, two lines (plan L4266, L4272):
   > Note, 2026-10-04: the table above is the original warm theme and is kept as the record of it. The Trifid theme keeps these token names and changes their values; the current values are in `frontcreck/src/app/globals.css`.

   > - Exception, 2026-10-04: for the Trifid theme the owner knowingly set aside three items of the line above (blue-black, glassmorphism and starfields), and the film grain is removed. The decisions and the reasons are in `docs/design/trifid-theme/HANDOFF.md`, section "Current state: decisions made on 2026-10-04", and in `docs/superpowers/plans/2026-10-04-trifid-theme.md`, section "Decisions made on 2026-10-04".
3. PR 47 title: `Trifid theme in the app: nebula map behind a glass header, phone fallback`, and its body (plan L4333-4365), which needs the framing sentence corrected (Task 11 above).
4. Test titles: `'in cover mode the picked album is drawn large on top, framed in off-white, with the other covers dimmed'`, `'the focused field shows an off-white border with a softer halo, without moving'`, and the new test names of Tasks 2 to 6.
5. The nineteen-point checklist to the owner (plan L4398-4421); the "Shall I push" message (plan L4374) is dropped.

## (c) Contradictions I could not resolve, with a recommended ruling

- **C1. What triggers the chunk split.** The Task 0 re-review proves a source-size threshold of MapStage.tsx between 20,002 and 20,033 bytes; the part 2 handoff reports the same split from Task 6 with MapStage.tsx unchanged. Both cannot be the whole story, and Task 6 is now committed with its first-load fix status unknown to me. Ruling: measure `/` first-load and the chunk count on HEAD before Task 3; keep MapStage.tsx under 19,936 bytes (proposal above gives 19,859) and add no module to its chunk; if HEAD is already split, that is part 2 Task 6's to fix, not something Task 3's trim will undo.
- **C2. The map wash: hide in CSS and "leave the code" (plan L139, L698-705), or remove the element.** Removing `AmbientLayers variant="map"` from MapStage frees 288 bytes and a little first-load JS. Ruling: remove it in Task 2, delete the `.map-amb` rules in `album.css` (L3-5 selectors, L8), and make `glass.test.ts`'s "the album wash stays inside the panel" assert that `MapStage.tsx` does not contain `AmbientLayers` and no stylesheet contains `.map-amb`. That proves more than `display: none` did. Leave `AmbientWash.tsx`'s `'map'` variant and its test alone.
- **C3. Where `HEADER_PX` and `HEADER_NARROW_PX` live.** Plan, README text and `stage.test.ts` say `components/map/types.ts`; importing them from there makes `types.ts` a first-load module. Ruling: define in `src/lib/media.ts`, re-export from `types.ts`, adjust the README sentence.
- **C4. `GAS_DIMMED_STRENGTH = 1` also brightens About and 404.** The ruling names Home only; the constant serves all three; the prototype has no dimming on any of them. At full strength the 404 scrim's worst case fails at `.55` (dust 2.78 over cream). Ruling: one constant at 1, as the prototype; let the measured test decide, and allow the plan's ladder for the 404 scrim (to `.79`) and the shelf scrim (to `.88`). If the owner wants only Home brighter, it is a second constant and a `view` check in `GasField.tsx` L999.
- **C5. "Never record `framing-baseline.json` again" against part 2 Task 4 not being built.** Task 4 changes how markers are drawn, and the record stores marker boxes. Ruling: Task 3 starts only after part 2 Task 4 is on the branch (they edit `MarkerDriver.tsx` anyway). If the order cannot be kept, record album points for all states now and add the marker boxes of `album` and `search` in Task 4's own commit is not possible (the pre-header build is gone), so keep the order.
- **C6. Framing states.** The plan's `overview`/`whole` keys mean the old opening view and the floor. Ruling: keys `opening`, `whole`, `floor` with the sequence given under Task 3.
- **C7. Steps of Tasks 3, 4 and 6 that need part 2 Task 8 (`twinkleOff`, `.tw-layer`).** Ruling: do not block the tasks; add those lines and the glint test in the commit that lands Task 8, and name them in Task 8's brief so they are not lost. Never commit them skipped.
- **C8. `capture.mjs` L441.** The plan edits it in Task 10; Task 3 breaks the state the moment it lands, and part 2 Task 9 captures in between. Ruling: make the edit in Task 3.
- **C9. Deep zoom baseline location** (`perf-part1/` against `baseline/perf/`). Ruling: `compare.mjs` takes the three files as extra arguments; no baseline file is moved.
- **C10. Push wording in user-facing text.** The PR body, the Task 11 message and the "Not verified" paragraph still describe a gated push. Ruling: reword when the PR body is written; the owner sees the body before the merge in any case.
- **C11. The fit button's label.** Tests in part 3 press `COPY.map.reset` to reach the Whole map; if the owner renames it ("Whole map"), only `copy.ts` changes. No action in part 3 beyond keeping tests on the `COPY` key, never on the literal.
