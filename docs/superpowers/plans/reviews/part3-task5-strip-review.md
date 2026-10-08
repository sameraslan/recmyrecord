# Review: part 3 Task 5, strip half (69a0fe3d, 72f3b6df)

Reviewer: independent, read-only. Ran `MapPreviewStrip.test.ts` (arm64): 4 passed. Read the four captures, the prototype strip (`prototype/src/pages.js` L99-114), the real `theme.json`, the component and both test versions.

## Verdicts
- Spec: PASS. One deviation (`lighter`, ruled accepted) and 62 % (ruled) are both implemented and pinned.
- Quality: PASS with minor findings. No Critical or Important code defects.
- Look: PASS with an owner decision. The star field is the busiest element; recommendation below.

## 1. Drawing maths (verified)
- Real rects and px (`theme.json`): sonic 2048x1970 over [-1.485,-1.204,1.148,1.329] (2.633/2.533 = 1.0395 = 2048/1970); balanced 1803x2048 over [-1.454,-1.454,1.123,1.473] (0.8804 both); mood 1537x2048 over [-1.254,-1.454,0.854,1.354] (0.7507 both). Aspect kept, no stretch; `drawImage(img, sx(west), sy(north), (east-west)*k, (north-south)*k)` (MapPreviewStrip.tsx:152-155) is the right mapping (north up, row 0 north, same as `gasRectUniform` in gas.ts:70).
- Pinned case: k = min((390-60)/max(x1-x0,.3), (172-60)/max(y1-y0,.3)) = 336 for the test data; sx(-1.4) = -191.4, sy(1.4) = -496.4, 840 x 873.6, so `drawImage(GAS,-191,-496,840,874)` is right.
- Projection is the map's: raw `positions[stop]` in the units the rect is in; strip scale is only a uniform k plus bbox centre, so album positions never move relative to the gas. `gasCopySize` keeps aspect (451x512, 512x493).

## 2. Imports (verified clean)
Transitive read: `map/theme.ts` (no imports), `map/state/focusLayout` (types + `zoomLimits`, no three), `lib/data/theme` (client + types), `Cover`, `catalog`, `useData`, `media`. No `shaders/gas.ts`, no three.js, no GLSL. The only import the old file lacked beyond `theme.ts` is `lib/data/theme` (already in the first-load graph via `useData`). `gasUrl` is imported only in the test. Pinned equal across all three stops (test 4).

## 3. Lifecycle (verified)
- One draw per real input change: rAF coalesced via `cancelAnimationFrame(raf)`; `ResizeObserver` draws only when size differs from the last drawn size (rAF runs before RO delivery in the frame, so `dw/dh` are set); no loop, no timers; `ro.disconnect()` and `cancelAnimationFrame` on cleanup; cover callbacks gated by `live`. `IntersectionObserver` disconnects on unmount and as soon as `near` flips (effect deps).
- Gas load: only after `near`; `decode()` async; wrong-size image refused; one 512 px copy per URL cached in `gasCopies` (promise cache, so concurrent strips share it); failure deletes the cache entry and the component swallows the rejection, so sky, stars, lines, covers still draw (the `gas` stays null). `themeFor(loaded, count)` guards a stale bake. Stop change while loading: `stopGas` goes null, redraw without gas; cached gas resolves before the next frame so no flash.
- Redraw on gas arrival re-runs the whole effect (new RO); harmless, one draw.

## 4. Composite and alpha restore
`lighter`/0.62 are restored at L156-157 on the normal path. There is no early return between set and restore. Not wrapped in try/finally, but each draw begins by assigning `canvas.width`, which resets context state, so a throw in `drawImage` cannot leak state into the next draw.

## 5. Tests
- Old single test: nothing weakened. `lineTo` 3 to 6 (casing + line, explained), `fillRect` 7 to 9 (sky + seed backing added), badge texts unchanged, arc count unchanged. The 62 % commit only moved the neighbour indices by one and added the alpha pins (count of `globalAlpha=` is exactly 2, so nothing else is dimmed).
- Red-first was reported for all 4; the 4 tests are meaningful for placement, order, composite pair, URL pin, copy sizes.

## 6. Look (captures: fierce, urban, warm, compare)
Constants confirmed: `STAR_PX = 1.3` (every arc, one size), `STAR` alpha 0.7, `STRIP_SEED = 38`, `STRIP_REC = 28`, `minLine: 10`, gas 0.62.
- Covers legible in all three, frames off-white, seed on dark backing, lines white on dark casing read on every gas, no covers overlap. Badge numbers readable at 2x.
- The star field is the busiest thing on the strip. Warm (Big Star) and fierce show about 400-600 white 2.6 px dots at 0.7 around 28 px covers; the dots are the same weight as the badge numerals and the lines, and several sit against cover edges. At 100 % gas (compare image, left) they vanish into the bright cloud; at 62 % (right) they read, but as a noisy sprinkle.
- Prototype (0.8 px at 0.38) is faint specks: the nebula is the picture, the covers the subject. The built version reads more like a star chart. For the owner: the prototype's values read better for "vibe over explanation" and for covers; the built values read better on bright gas only if the gas were at 100 %, which was rejected. Suggested middle: radius 1.0 at 0.55 (still one size). Owner's call.
- Note for the owner: the hard rule "star size and brightness are random per page load" does not hold in the strip (one size by the plan). Fine if intended; say so.
- The page chrome around the strip is still the old brown (Task 1 tokens pending), so `ROOM` `#07060a` is hard-coded and will differ from `--color-room` until then (MapPreviewStrip.tsx:23-24).

## 7. Speed and weight
- +654 B gzip is mostly the new loader and observer code; nothing sizeable to cut (no new heavy import). Not avoidable except by dropping the lazy gating, which would be worse.
- The one-time downscale is the open risk (see Important 1).

## Findings

### Critical
None.

### Important
1. MapPreviewStrip.tsx:75 `ctx.drawImage(im, 0, 0, cw, ch)` is a synchronous main-thread 2048 to 512 downscale of a ~15 MB decoded image, and it runs the moment the strip becomes visible, i.e. mid-scroll. If the browser has dropped the decoded image (low-memory phones) it re-decodes synchronously inside this call. Untimed. Fix: `createImageBitmap(im, { resizeWidth: cw, resizeHeight: ch, resizeQuality: 'high' })` and draw the bitmap (canvas copy as the fallback when it rejects or ignores the options, e.g. older Safari); optionally wrap in `requestIdleCallback`. Needs a phone timing in Task 9.

### Minor
1. MapPreviewStrip.tsx:75 the 4x downscale uses the default smoothing quality (bilinear, no mip), so fine dust aliases into the 512 copy. Fix: `ctx.imageSmoothingQuality = 'high'` before the copy (the prototype did) or the `createImageBitmap` route above.
2. MapPreviewStrip.test.ts "uses the theme colours" (radii check): `fakeCtx` rounds numbers, so `arc(x,y,1.3,...)` is recorded as radius 1; the "one size" assertion passes for any radius in 0.5 to 1.49 and does not pin 1.3. Fix: record the unrounded radius for `arc`, or assert on `STAR_PX` through an export; also `minLine: 10` and `STRIP_SEED/REC` are untested (a `layoutMarkers` call spy or size assertions on the tiles would pin them).
3. MapPreviewStrip.tsx:153-157 composite and alpha restore not in try/finally; safe today because the next draw resets the canvas, but `drawStrip` is exported. Fix: wrap the gas block in try/finally.
4. MapPreviewStrip.tsx:209 badge font 9 px in a 14 px square (the prototype used 11 px in 16 px). Legible in the captures at 2x, small for a phone. Fix: 10 px font if the badge grows to 15 px; check it does not hide more of a 28 px cover.
5. MapPreviewStrip.tsx:247 `rootMargin: '300px'` does nothing inside the list panel's own scroller (the implementer's note is right), so loading starts only when visible. Fix: pass `root` as the scroll container if early loading is wanted; otherwise delete the margin so the code does not promise it.
6. MapPreviewStrip.tsx:296-297 every draw reassigns `canvas.width/height`, reallocating the backing store even when the size is unchanged (only on real input changes, so cheap). Fix only if draws ever get frequent: set size only when it changed and `clearRect` otherwise.
7. Phone memory: the map's texture and the strip each decode the same 2048 px image (two ~15 MB decodes close together). Not avoidable without sharing across the lazy chunk boundary; note for Task 9's phone memory check.
