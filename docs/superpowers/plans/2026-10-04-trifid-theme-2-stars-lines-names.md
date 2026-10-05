# Trifid Theme Part 2: Stars, Lines and Names Implementation Plan

## Reconciled with part 1 as built (2026-10-05)

This part was written before part 1 was built. It has been checked against the code on `feat/trifid-theme` and against `2026-10-04-trifid-theme-build-handoff.md` (which wins where they differ). **Precondition: part 1's ledger (`2026-10-04-trifid-theme-ledger-part1.md`) must say "Task 6: complete" before Task 1 starts (Task 0 may run before).** **A new Task 0, "the map opens at the Overview framing", comes before Task 1 and is written separately**; the notes below that mention Task 0 only say which statements of this part its framing changes. What changed in this file, one line each (old -> new):

- Global: "commit, do not push" (Global Constraints and every commit step) -> commit, then push to `feat/trifid-theme` once the task's review has passed; messages keep `Refs #45`.
- Global: four constraints added from the handoff: the sharper gas image's bounded fade is the one exception to "nothing draws at rest" and frame counting waits for it; browser checks that read gas pixels force the full shader (`window.__rmrGasLite = 'off'`); names and twinkle add no work on the pointer move path; first-load JS is 191.2 KB of 200 after part 1 and new code goes in the lazy map chunk.
- Review Focus: item 9 added (the names driver's new skip rule must not skip a frame it needs).
- Interfaces: `ThemeData { v: 1; ... }` -> `{ v: 3; ...; gas: Record<StopId, ThemeGas> }`, with `ThemeGas` (rect, px, sharp, hash), the hashed gas file names and the theme.json path `public/data/theme/theme.json`; "measured at 600 px per world unit" -> names the constant `LABEL_REF_PPW` in `scripts/theme/bake-core.js`; "confirmed against part 1 (its Task 5)" -> confirmed against the code: `setTheme`, `useThemeLoad`, `themeFor`, `GasField` at `canvas/GasField.tsx`, its draw settings, part 1's `window.__rmr` fields and `waitForMap`'s gas wait.
- Interfaces (produced): `capture.mjs` L380 -> L390; `--still` also waits for the sharper gas image; `waitForGasSharpSettled` reused from Task 0; names driver skip rule and `clearNameWidths` / `nameWidthsVersion`.
- 1, step 1: "part 1 adds its own fields" -> lists the fields part 1 added and where `starSeed` goes.
- 1, step 2: `stars.test.ts` fixture `theme()` `v: 1` with no `gas` -> `v: 3` with a `gas` stub (typecheck covers test files).
- 2: design note added on how the stars sit over `GasField` (opaque quad, `renderOrder -1`, no depth; transparent canvas before the first gas texture and without a theme).
- 2: inherited acceptance list added (hover ring on a dot, dots on cream and rust, 45 percent dots, cross-fade tiles at about 23 px, half transparent covers around a pick, checked on the brightest cream gas; today's overlapping cover handling must survive).
- 2, step 8: no browser check -> also runs `gas.spec.ts` and `map.spec.ts` on both projects, with what to do if a gas reading moves.
- 2, new step 10: capture the cross-fade tiles and show them to the owner before Task 9 closes (tile colour = star colour, never seen rendered).
- 2, broken e2e note: `explore.spec.ts` picked cover test "broken by this task" -> already red since part 1 (`meanLuma`), this task adds `isLamp`.
- 4: inherited acceptance item added (neighbour lines beside an open album, on the brightest cream gas).
- 5: "fitted overview 595.8 px per world unit, the default view, full halo" -> that is the Whole map: 596.7 px per world unit at Balanced (full halo), 708.5 at Sonic and 618.2 at Mood (over 600: solved halo for an unmoved name at rest); Task 0's Overview opening view is 1,639.5 at Balanced, so names there take the solved halo; the 12.5 px reference is the prototype's `Cam.fitOverview` cap.
- 6: first-load note added (the toggle, its preference, the flag, icons and string are first-load code through `MapStage`).
- 7: `MusicMap.tsx` "L38-39 today, L41-42 after part 1" -> L41-42; `Scene.tsx` "L26 / L171-172 today" -> L27 and L176-177; "part 1 adds its gas mesh" -> part 1's `<GasField />` line.
- 7: `RegionNames.test.tsx` fixture `v: 1` -> `v: 3` with a `gas` stub.
- 7: `RegionNamesDriver` laid names out on every drawn frame -> keeps the inputs of its last placement and returns after a few compares when none changed (a hover frame, a cover fade, the gas fade); `nameWidths.ts` gains `clearNameWidths()` and `nameWidthsVersion()`, which `RegionNames` uses in place of `nameWidths.clear()`.
- 8: `helpers.ts` `waitForAnimations` "L61-66 / L67-72" -> L68-73; reuses Task 0's `waitForGasSharpSettled`; `gas.spec.ts` "one line in `lumaAt` (if part 1 named it otherwise ...)" -> `lumaAt` at L45 plus the registration test's second screenshot reader (L1287).
- 8: `twinkle.spec.ts` `openAtRest` waits for the sharper gas image before counting frames; `twinkle-cost.mjs` waits for `gas` ready or off and for the sharper image; note that the app picks its gas shader as for a visitor; mains power.
- 9: `names.spec.ts` forces the full gas shader (its pictures go to the owner), its idle test waits for the sharper gas image, and its zoom comment no longer assumes the whole cloud opening view.
- 9, step 6: suites run -> `gas.spec.ts` added on both projects, and the `nowebgl` project.
- 9, step 7: perf rows named as the script prints them (plus the gas shader row); `--no-gas` and `--gas-lite` not used; first-load compared with part 1's 191.2 KB as well as the baseline's 190.5, threshold "1 KB over 190.5" -> "1 KB over 191.2"; deep zoom baseline files `perf-part1/baseline-gpu-deep-run*.json`; section name "gpu desktop at dpr 2, added later with the same script"; part 1's numbers beside every row; old and new builds in turn, mains power.
- 9, step 8: note on the sharper gas image's fade possibly landing in a hover window after Task 0.
- 9, step 9: `capture.mjs` edits rewritten to the script as part 1 left it (header L13-24 with `--gas`, flag loop L57, usage L62, after L71-74, `mapReady` L132, `settle` L178-179, `go` L195-198, context L900-902 with part 1's `__rmrGasLite` init script kept); `--still` settle also waits for the sharper gas image; `--gas full` named.
- 9, step 11: reviewer told which pictures use the lighter gas shader, given two more crops, and asked to recheck the inherited weak marks on the brightest cream gas.
- Independent check (2026-10-05) folded in: precondition (ledger "Task 6: complete"); sharper image wait default 1.5 s -> 2.5 s (longer than `GAS_SHARP_RETRY_MS` 2000) in the helper, `twinkle-cost.mjs` and `capture.mjs`; the flag's wording on the test browser ('waiting' or 'off'); Task 7 `nameWidths.test.ts` added; `setStageTop` needs a `requestRender()` from part 3 (four frame request cases); Task 9 step 7 note on `perf.mjs` idle window vs the sharper image fade (Task 0's fix); Task 9 step 3 label count wording; Task 2 part 1 evidence crops named; Task 8 step 11 wording on the twinkle switch's listener.
- Self-review: test edit list and type consistency updated for the above.
- 1, as built (2026-10-05): review follow-up folded into Task 1's code blocks (client-only `pageStarClasses`, `StarClass`, four more tests, 28 in all); Task 8's driver casts its class to `StarClass`.
- Task 0 (2026-10-05, `2026-10-05-trifid-theme-2-task0-overview-framing.md`): Task 0 owns `waitForGasSharpSettled`, the perf idle wait and the capture/hover sharper-image waits; Task 8 and Task 9 reuse them. Task 5's halo numbers, the `names.spec.ts` zoom comment, Task 9 steps 7, 8, 9 and 11 updated to Task 0's framing (the map opens at the Overview; `map-opening.jpg` is the Overview picture, `map-overview.jpg` stays the whole-cloud fit).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every album as a Trifid star inside the existing single instanced draw, with star sizes dealt at random on each page load and a quiet twinkle on top; replace the focus lines with white cased lines and the cover layout that keeps covers off them; add the region names layer with its on/off toggle.

**Architecture:** The album sprite shader moves to premultiplied-alpha output with `THREE.CustomBlending` (`One`, `OneMinusSrcAlpha`), so one fragment can add star light and darken with the under-disc at once; covers, frames and hover marks stay in the same draw and keep their depth layers and today's handling of overlapping covers. Each album's star class (size and brightness) comes from one random deal per page load, never from album order. The twinkle is a DOM layer over the canvas driven by one timer; it never asks the canvas for a frame. Focus lines stay SVG, drawn as a casing group under a core group, with the layout rules of the prototype's `Focus.layout` merged into `layoutMarkers`. Region names are DOM lettering placed by a `useFrame` driver from a pure layout module; the toggle is one zustand flag saved in `localStorage`.

**Tech Stack:** Next 16, React 19, three 0.186 via @react-three/fiber 9, zustand 5, Tailwind 4 (plain CSS files in `src/styles/`), vitest (jsdom), Playwright (SwiftShader).

**Spec:** `docs/superpowers/plans/2026-10-04-trifid-theme.md`, section "Decisions made on 2026-10-04" (it wins over everything else), then `docs/design/trifid-theme/HANDOFF.md` (section "Current state: decisions made on 2026-10-04") and the prototype in `docs/design/trifid-theme/prototype/`.

This is part 2 of 3. Part 1 (`...-1-...`) provides the theme data and the gas mesh. Part 3 (`...-3-...`) provides the colour tokens, glass panels, the stage under the header, the phone strip, Home and About, and the theme-coupled test updates. Run part 1 first, then this part, then part 3.

Tracking issue: 45. Pull request: 47.

All commands start from the worktree root. Before any `npm`, `npx` or `node` command in a shell:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
node -p process.arch   # must print arm64
```

## Global Constraints

- **Album positions never move:** no task changes `positions.json`, `normalizePositions` or `interpolateInto`.
- **The map canvas does not redraw at rest:** no `requestAnimationFrame` loop, no `invalidate()` from a frame that changed nothing, and nothing outside the canvas asks it for a frame while the map rests. The one thing that moves at rest is the star twinkle (Task 8): DOM and CSS only (opacity and transform), on a timer, and it never draws a canvas frame. No other repeating animation is added. The idle frame test (`e2e/map.spec.ts`, "renders on demand") and the idle budget count canvas frames (`window.__rmr.frames`, written by `canvas/FrameCounter.tsx`) and stay exactly as they are.
- **Snappiness is a core requirement.** No effect may cost responsiveness. Each effect this part adds (stars, twinkle, names, cased lines) is measured. If one costs speed it is dropped or replaced by its cheaper version without asking the owner again, and he is told afterwards. Budgets in `frontcreck/scripts/perf/budgets.json` do not change. Watch the hover path too: the prototype showed tasks of about 100 ms in the first second or two of hovering; the app must not (Task 9 measures the first hover).
- **No regressions against the current site.** The current site was captured before this work: screenshots of every state, a full performance run and a regression checklist, in `docs/design/trifid-theme/reviews/baseline/` (`REGRESSION-CHECKLIST.md`, `BASELINE-PERF.md`, the raw perf JSON under `perf/`, screenshots under `shots/`). Compare against it at the end of this part (Task 9). A number that got worse than baseline while still inside its budget is a finding to explain or fix, not a pass. The details the owner values in the current site stay: how overlapping covers are handled on the map (Task 2 says exactly what that is and which lines keep it), the hover tip, the selected ring, the cover fade, the marker layout, the trail, toasts and every keyboard path.
- **Stars are random.** Star size and brightness are dealt at random on each page load, in the mix 1% brightest, 9% bright, 27% medium, the rest small. Album index, order and rank are not used for stars anywhere. The per-album colour tint from the theme data is not random.
- **Every star is an album:** no decorative points, no extra instances. A twinkle glint sits on an album's star; it is not a new star.
- **Text reaches 4.5:1** against what is behind it (region names: against the dark halo solved for the gas under them).
- **Covers stay legible:** a fully shown cover that is not stepping back is opaque, with a dark keyline, and is never tinted by star light.
- **Tap targets are at least 44 px** on a phone.
- **Existing site data files are not edited:** `albums.json`, `positions.json`, `recs.json`, `vocab.json` and the atlases gain no fields and do not change. The theme only adds files beside them (part 1).
- **Nothing in this part hard-codes where the stage starts.** Today `.stage` starts below the header (`top: var(--hdr)`); part 3 extends it under the header. Whatever this part places from the top of the map (region names, their chrome rectangles, glints) reads `getStageTop()` (`state/stageTop.ts`, Task 7), which is 0 today.
- Copy rules: never show the owner's name; the catalogue is "4,000+" albums; never a number of recommendations; mood words are "handpicked"; no dashes or emoji in site copy. Any new wording needs the owner's approval before it ships.
- Machine rules: arm64 Node 22.23.3 (`export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"`; `node -p process.arch` must print `arm64`), one browser at a time, one Playwright project at a time, jobs serial, gentle on the laptop (no parallel test runs). Every Playwright command carries `--workers=1` (the config default is 2) and sets the PATH itself, so it can be pasted alone.
- Every commit message carries `Refs #45` and ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Push after each verified task** (handoff of 2026-10-05, which withdraws the old "commit, do not push"). The owner said Vercel previews do not need his go-ahead; only merging does, after he has checked the preview. Commit at each commit step; once the task has passed its review, push it to `feat/trifid-theme` (`git push origin feat/trifid-theme`). Every commit message carries `Refs #45`.
- **The map canvas at rest, as part 1 built it.** Part 1's sharper gas image (ordinary desktops and laptops with a real GPU only; `window.__rmr.gasSharp`) is fetched in a quiet moment about a second after the map settles and fades in over up to 14 bounded frames. It is the one exception to "nothing draws at rest", and it is part 1's. Any check this part adds that counts canvas frames at rest first waits for the sharper image to settle, as `e2e/gas.spec.ts` does: `waitForGasSharpSettled(page)` in `e2e/helpers.ts` (added in Task 0, step 11), or the same wait inlined in a script.
- **The gas shader in tests.** The test browser renders in software, where the app draws the gas with its lighter shader (`GAS_LITE`). A browser check that reads gas pixels, or takes a picture a reviewer or the owner judges the gas by, asks for the full shader first with an init script (`window.__rmrGasLite = 'off'`, as `e2e/gas.spec.ts` does in its `beforeEach`). `capture.mjs` asks for the full shader by default (`--gas full`).
- **No work on the pointer move path.** `GasField` tracks pointer and wheel activity at window level so that no gas upload lands inside a gesture. The names layer (Task 7) and the twinkle (Task 8) add no pointer listener and do no layout, style or DOM work on a frame that only a hover drew: their frame callbacks compare a few numbers with the last frame's and return.
- **First-load JS is 191.2 KB of 200 KB after part 1** (baseline 190.5). New code goes in the lazy map chunk: anything imported only from `components/map/MusicMap.tsx` and its tree. The only first-load additions this part makes are the ones Task 9 step 7's size check lists (the names toggle and its preference, two store flags, two icons, one string).
- Never loosen an existing test to make it pass. Where this plan rewrites or edits an existing test, it says what the test still proves.
- Region names explain nothing: no hover, click, tooltip, legend, card, menu, pointer or search row. They are plain lettering, `aria-hidden`, and take no pointer events.

## Review Focus

The failure modes most likely to bite that would otherwise slip past the task tests. Each is pinned by a named test in the owning task.

1. **Theme data is null, or does not match the albums** (failed load, stale file). Stars must render white with no under-disc, in their random sizes, and no names must render. Pinned in Task 1 (`buildStarAttributes` "falls back to white stars..." tests) and Task 7 (`RegionNames.test.tsx` "renders nothing without theme data").
2. **No name can be placed**: a stop with zero labels, or a viewport so narrow or short that no box fits. The layout must return an empty list without throwing, and the driver must hide every name. Pinned in Task 5 ("returns nothing for a stop with no labels" and "returns nothing when no name fits").
3. **`localStorage` is unavailable or holds junk.** The toggle must default to on, never throw, and still work for the page load. Pinned in Task 6 (`namesPref.test.ts` "survives storage throwing on read and on write", "treats junk as on"; `store.test.ts` "still switches names off for the page load when storage is blocked").
4. **Tenor Sans has not loaded when names are first measured.** Widths measured with the fallback face must be thrown away when the face arrives. Pinned in Task 5 (`createWidthCache` "measures again after clear") and wired in Task 7 (`loadingdone` listener in `RegionNames.tsx`).
5. **Fewer recommendations than expected, or all on one side of the seed.** Zero or one recommendation must not divide by zero; a narrow fan must still end with every line at least 0.2 rad apart. Pinned in Task 3 ("lays out a seed alone and a seed with one recommendation", "fans out recommendations that all sit on one side of the seed").
6. **Star sizes creep back to album order, or change within a page load.** Pinned in Task 1 ("does not follow album order...", "deals once and returns the same array from then on...") and Task 2 (`AlbumField.stars.test.ts`).
7. **A glint costs a canvas frame, piles up, or takes a pointer event.** Pinned in Task 8 (`twinkle.test.ts` "never has more than 3 glints alive", "makes nothing while the view is not at rest..."; `e2e/twinkle.spec.ts` "glints play on the resting map and the canvas does not draw one frame for them", "a glint sits on an album star, is two nodes, and takes no pointer events").
8. **Overlapping covers lose today's look.** Pinned in Task 2 (`album.test.ts` "keeps today's handling of overlapping covers...") and checked against the baseline screenshots in Task 9.
9. **The names driver skips a frame it should not have** (its compare of the last placement's inputs, Task 7, misses one). Names would then stay where they were after a toggle, a slider move, a zoom or the face arriving. Pinned in Task 9 (`names.spec.ts` "the names toggle hides the names ... and brings them back", "the slider swaps one stop's names for the other's", "region names are gone once the map is zoomed in, and back at the overview"); the face arriving bumps `nameWidthsVersion()`, pinned in Task 7 (`nameWidths.test.ts`).

## Interfaces shared with the other parts

Consumed from part 1 (not defined here; checked against the code as built on 2026-10-05):

```ts
// frontcreck/src/lib/data/theme.ts (served from frontcreck/public/data/theme/theme.json, THEME_URL '/data/theme/theme.json')
export interface ThemeLabel { id: string; name: string; x: number; y: number; strong: boolean; n: number; p: number; rgb: [number, number, number]; lum: number }
export interface ThemeGas { rect: [number, number, number, number]; px: [number, number]; sharp: [number, number]; hash: [string, string] }
export interface ThemeData { v: 3; n: number; positionsHash: string; bakeHalf: number; gas: Record<StopId, ThemeGas>; stars: { lead: number[]; bg: number[] }; labels: Record<StopId, ThemeLabel[]> }
// Gas image names carry their content hash (gas-<stop>.<hash>.webp, gas-<stop>-sharp.<hash>.webp): anything that
// names a gas file reads it from theme.json (shaders/gas.ts gasUrl(stop, theme.gas[stop].hash, sharp)). This part
// names none. A unit test fixture of ThemeData needs the `gas` field; copy STOP_GAS from src/lib/data/theme.test.ts.

// frontcreck/src/components/map/theme.ts  (all colours are [r, g, b] in 0..255)
export const SKY_RGB, EMBER_RGB /* five families */, NEUTRAL_RGB, STAR_WHITE, FRAME_RGB;
export const NAMES_BAND_PX = 13;
export const GAS_LUM_MAX = 0.6;

// frontcreck/src/components/map/data.ts
export function rawToWorld(data: Pick<MapData, 'tx'>, x: number, y: number): [number, number];
```

`ThemeLabel.lum` is measured by part 1's build at 600 px per world unit (`LABEL_REF_PPW: 600` in `frontcreck/scripts/theme/bake-core.js`). This part treats 600 as the scale under which that measurement no longer holds (`NAME_LUM_PX_PER_WORLD`, Task 5). If part 1 changes the scale it measures at, change that one constant.

**Confirmed against part 1 as built:** the theme is in the map store, read as `useMapStore((s) => s.theme)` with type `ThemeData | null`, set by `setTheme`; `MapStage` loads it with `useThemeLoad`, passes `themeFor(loaded, mapData.n)` (null for a stale bake) to `MusicMap` as the `theme` prop, and `MusicMap` writes it to the store in a layout effect. `canvas/Scene.tsx` mounts `<GasField data={data} theme={theme} />` (`frontcreck/src/components/map/canvas/GasField.tsx`) just before `<AlbumField />`, only when the theme is there. The gas quad is opaque, `renderOrder = -1`, depth test and depth write off, and stays hidden until its first texture is in, so before that (and with no theme at all) the canvas is transparent over the pane's sky colour. `window.__rmr` already carries part 1's fields `gas`, `gasShownMs`, `gasSharp`, `gasLite`, `gasLiteLod`, `gasPool`, `gasDeep`, and `window.__rmrGasSharp` / `window.__rmrGasLite` are its test switches (`src/types/global.d.ts`). `e2e/helpers.ts` `waitForMap` already waits for `window.__rmr.gas` to be `'ready'` or `'off'`. Task 2 step 1 still checks that the theme landed in the store and stops if it did not.

Produced by this part for part 3:

- **Random stars.** `frontcreck/src/components/map/state/stars.ts`: `STAR_MIX = [0.01, 0.09, 0.27]`, `type StarRandom = () => number`, `seededRandom(seed: number): StarRandom`, `starCounts(n: number): [number, number, number, number]`, `drawStarClasses(n: number, random: StarRandom): Uint8Array`, `pageStarClasses(n: number): Uint8Array` (the page load's one deal, the same array on every call), `STAR_RADIUS`, `STAR_GLOW`, `STAR_ALPHA`, `STAR_WIDE`, `starTint(lead: number)`, `starCoreCssPx(cls, zoom, canvasHeightCssPx)`, `buildStarAttributes(classes: Uint8Array, theme: ThemeData | null): StarAttributes`. Part 3's phone strip draws every star at one size and one brightness (its Task 5). If it is ever made to vary them, it must take the classes from `pageStarClasses(n)` (with `STAR_RADIUS[cls]` and `STAR_ALPHA[cls]`); it must not deal its own and must never use the album index, order or rank.
- Shader attributes of the album draw: `a_star` (vec4: class radius, glow, alpha, halo reach), `a_tint` (vec3, normalised bytes), `a_bg` (vec3, normalised bytes). `a_clusterId` and `u_clusterColors` are gone.
- `CLUSTER_RGB` is **removed** from `frontcreck/src/components/map/data.ts`. Task 2 puts a two-line stand-in in `MapPreviewStrip.tsx` (white dots from `STAR_WHITE`) so the build stays green; part 3 restyles the strip.
- `layoutMarkers` gains `options.minLine` (default 24). The phone strip should pass `minLine: 10` (prototype `pages.js` L120).
- `edgePoint(x0, y0, x1, y1, half): [number, number]`, `SEED_FRAME_PX = 4`, `REC_FRAME_PX = 1`, `HOT_FRAME_PX = 3` from `state/focusLayout.ts`, for drawing the strip's lines the same way.
- `frontcreck/src/components/map/state/stageTop.ts`: `getStageTop(): number` and `setStageTop(px: number): void`. 0 today. Part 3's task that extends the stage under the header calls `setStageTop(<header height in CSS px>)`; names and glints then keep below the header. `setStageTop` asks for no frame and the names driver skips frames whose inputs did not change, so part 3 calls `requestRender()` after `setStageTop` unless a resize frame follows.
- `useAppStore` gains `namesOn: boolean` and `setNamesOn(v: boolean): void`; the saved choice is `localStorage` key `rmr-names` (`'0'` off, anything else on), in `frontcreck/src/lib/namesPref.ts` (`NAMES_KEY`, `readNamesOn()`, `writeNamesOn(on)`).
- `COPY.map.names = 'Place names'`: the names toggle's one fixed accessible label (wording still awaiting the owner's approval). The button is `button.map-names` with `aria-pressed`, the first child of `.map-zoom`.
- Twinkle: `frontcreck/src/components/map/state/twinkle.ts` (`createTwinkle(host, env): Twinkle`, `pickStar`, `glintFor`, the `TWINKLE_*` settings), `overlays/Twinkle.tsx` (`TwinkleLayer`, `addGlint`), `canvas/TwinkleDriver.tsx`.
- Names driver: `canvas/RegionNamesDriver.tsx` keeps the inputs of its last placement and places nothing on a frame where none changed (a hover redraw, a cover fading in, part 1's gas fade). Part 3 Task 3 Step 8 edits its `visibleArea(inset, width, height, 0)` line, which stays as written here; `getStageTop()` is one of the compared inputs, so a `setStageTop` call takes effect on the next drawn frame. `state/nameWidths.ts` exports `clearNameWidths()` and `nameWidthsVersion()` beside `nameWidths` and `setNameFontFamily`.
- `useAppStore` gains `twinkleOn: boolean` (true, not saved, no control on screen) and `setTwinkleOn(v: boolean): void`: the switch for tests, measurements and still screenshots, reached as `window.__rmr.getState().setTwinkleOn(false)`.
- Test hooks on `window.__rmr`: `starSeed?: number` (the seed of the page's star deal; a test may set it before the map loads for a repeatable sky) and `twinkle?: { stats: TwinkleStats }` (the glints' counters). `e2e/helpers.ts` gains `twinkleOff(page)`: any check that reads screenshot pixels while stars show calls it first; and it already has `waitForGasSharpSettled(page)` (added in Task 0, step 11): any check that counts canvas frames at rest calls it first (part 1's sharper gas image may fade in about a second after the map settles).
- CSS classes `.tw-layer`, `.tw`, `.tw-flare`, `.rn-layer`, `.rn`, `.map-names`, `.mk-case`, `.mk-core`. Selectors tests wait on: `.rn:not(.off)` (a placed name), `.tw-layer .tw` (a live glint, with `data-album="<index>"`), `svg.mk-lines g.mk-case line[data-case]`.
- `frontcreck/scripts/perf/twinkle-cost.mjs`: the twinkle cost measurement (Task 8; Task 9 runs it again on the final build). Part 3 can rerun it with glass on.
- `docs/design/trifid-theme/reviews/baseline/capture.mjs` gains `--still` (Task 9 step 9): star seed fixed at 20261004 by an init script, glints off after every load and before every settle, the map ready only once `window.__rmr.gas` is `'ready'` or `'off'` (with `--still` the flag is required: the option is for builds with the theme), and every settle waits for part 1's sharper gas image to settle (that wait is Task 0's, in `settle` for every run). Every capture from Task 9 on, part 3's included, uses `--still` (with the script's default `--gas full`, which part 1 added). Part 1's captures ran before the option existed and stay without it. Part 3 Task 10 changes one other line of the same script (L390 since part 1's edits, where the edge hover state reads the canvas top; it becomes `#stage`); this part's edit does not touch that line, and after it that line is a few lines lower. Task 0 may also edit this script (the opening view), so every edit here is found by its text, not by its line number.

---

### Task 1: Random star classes, tints and per-album attributes (pure)

**Files:**
- Create: `frontcreck/src/components/map/state/stars.ts`
- Test: `frontcreck/src/components/map/state/stars.test.ts`
- Modify: `frontcreck/src/types/global.d.ts` (one field on `window.__rmr`)

**Interfaces:**
- Consumes: `ThemeData` (`@/lib/data/theme`); `EMBER_RGB`, `STAR_WHITE` (`../theme`); `DOT_BASE_PX`, `DOT_SCALE_PX`, `dotCssPx` (`./zoomLimits`).
- Produces:
  ```ts
  export const STAR_MIX: readonly [0.01, 0.09, 0.27];
  export const STAR_RADIUS: readonly [2.8, 1.9, 1.4, 1.1];
  export const STAR_GLOW: readonly [1, 0.55, 0.16, 0.12];
  export const STAR_ALPHA: readonly [1, 0.95, 0.85, 0.72];
  export const STAR_WIDE: readonly [6, 4.4, 2.6, 2.6];
  export const STAR_UNDER_HOLD = 0.5;
  export const STAR_UNDER_MAX = 0.26;
  export const DOT_AT_OVERVIEW: number;            // 1.8 + 12.5 / 3.15
  export type StarClass = 0 | 1 | 2 | 3;
  export type StarRandom = () => number;           // 0 (included) to 1 (not included)
  export function seededRandom(seed: number): StarRandom;
  export function starCounts(n: number): [number, number, number, number];
  export function drawStarClasses(n: number, random: StarRandom): Uint8Array;   // one class 0..3 per album
  export function pageStarClasses(n: number): Uint8Array;                       // this page load's one deal (client only; a throwaway deal on the server)
  export function resetPageStars(): void;                                       // unit tests only
  export function starTint(lead: number): [number, number, number];
  export function starUnder(gasLum: number): number;
  export function starCoreCssPx(cls: StarClass, zoom: number, canvasHeightCssPx: number): number;
  export interface StarAttributes { star: Float32Array; tint: Uint8Array; bg: Uint8Array }
  export function buildStarAttributes(classes: Uint8Array, theme: ThemeData | null): StarAttributes;
  // window.__rmr.starSeed?: number
  ```

**The rule (decision of 2026-10-04, prototype `src/config.js` `STAR_MIX` and `src/data.js` L67-77).** Size and brightness class are dealt at random on each page load: 1% of the albums brightest, 9% bright, 27% medium, the rest small. The deal is a Fisher-Yates shuffle of the albums by a seeded generator (mulberry32, the prototype's `RMR.rng`), then the first `round(n * 0.01)` shuffled albums get class 0, the next `round(n * 0.09)` class 1, the next `round(n * 0.27)` class 2. For the 4,081 albums of today that is 41, 367, 1,102 and 2,571. Album index, order and rank are not read anywhere: there is no `starClass(index)` and no cut-off by index. The per-album colour tint (from `theme.stars.lead`) and the gas luminance under each album are not random and work as before.

**Once per page load.** `pageStarClasses(n)` makes the deal on first use from a fresh random seed and keeps it in the module for the life of the page; every later call returns the same array. So an album keeps its class through slider moves, pans, zooms, a remounted map and a reloaded catalogue, and the phone strip (part 3) and the twinkle (Task 8) see the same classes as the map. The seed is published as `window.__rmr.starSeed`; a test that needs a repeatable sky sets that field before the map loads.

**How the tests stay strong without depending on one random outcome.** Every test passes its own seeded generator into `drawStarClasses` or sets the page seed, so nothing depends on `Math.random`:
- *The mix is exact:* the histogram of classes equals `starCounts(n)` for the real album count read from `public/data/albums.json`, for five seeds, and each count is within 0.5 of `n` times its share (the tolerance is rounding to a whole album).
- *Two seeds differ:* seeds 1 and 2 disagree on more than 40% of the albums (two independent deals of this mix disagree on about 52%).
- *Stable within a page load:* `pageStarClasses(n)` returns the very same array object on every call, with unchanged contents. Slider moves, pans and zooms can only call it again, and Task 2's `AlbumField.stars.test.ts` proves the draw component calls it in one place and never rewrites the `a_star` attribute.
- *No code path reads album index or rank:* proven three ways. By construction: `drawStarClasses` has exactly two parameters, the album count and the random source (asserted), so no album record can reach it. By behaviour: over 400 seeds, the first 41 albums (the chart's top 1%) land in the brightest class 170 times of 16,400, where a fair deal expects 165 and any rule that followed album order gives 16,400; the first 408 albums land in the two brightest classes 16,187 times of 163,200 (fair: 16,316); and the brightest stars' mean index is 2,050 (the middle of the list is 2,040). By use: `buildStarAttributes` takes the dealt classes and a test shows the same albums with another deal get other sizes and the same tints.

These numbers were computed with plain `node` on the code below while the plan was written; the deal matches the prototype's for the same seed, album for album.

**As built (2026-10-05, review follow-up after `23d93e4a`, review `docs/superpowers/plans/reviews/part2-task1-review.md` findings 1 to 6).** The two code blocks below are the files as committed. Changes from the first version: `pageStarClasses` is client only and on the server returns a throwaway deal without keeping it (test "on the server deals afresh..."); a test that classes 1 and 2 do not follow album order (first 1,510 albums in classes 0 to 2 over seeds 1 to 400 within 6 sd of 223,484, and the mean index of class 1 within 20 and of class 2 within 10 of 2,040); the arity check's comment says what `length` does and does not prove, and the self-equality check is replaced by "two different constant sources give different deals"; a golden test pins seed 20261004 to the prototype's deal (class counts, the first 24 classes, FNV-1a of the first 200 and of all 4,081, computed from a verbatim copy of `src/data.js` L70-75 and `RMR.rng`); `StarClass = 0 | 1 | 2 | 3` types `starCoreCssPx`'s class (checked by `expectTypeOf`); the seed choice is an if/else chain instead of a nested ternary. Task 8's driver casts `classes[pick.index] as StarClass`.

- [ ] **Step 1: Add the test hook's type**

In `frontcreck/src/types/global.d.ts`, after the lines

```ts
      /** Frames the map has rendered. */
      frames?: number;
```

add:

```ts
      /** The seed of this page load's random star sizes (components/map/state/stars.ts), published once the
       * stars are dealt. A test may set it before the map loads to get a repeatable sky. */
      starSeed?: number;
```

(Part 1 has already added its own fields to the same object, right after `frames` (`gas`, `gasShownMs`, `gasSharp`, `gasLite`, `gasLiteLod`, `gasPool`, `gasDeep`), and `__rmrGasSharp` and `__rmrGasLite` beside `__rmr` on `Window`; keep them all. `starSeed` goes between `frames` and `gas`.)

- [ ] **Step 2: Write the failing test**

Create `frontcreck/src/components/map/state/stars.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ThemeData } from '@/lib/data/theme';
import { EMBER_RGB, STAR_WHITE } from '../theme';
import { hitRadiusCssPx } from './hitTest';
import { DOT_MAX_PX, zoomForCoverPx } from './zoomLimits';
import {
  DOT_AT_OVERVIEW,
  STAR_ALPHA,
  STAR_GLOW,
  STAR_MIX,
  STAR_RADIUS,
  STAR_WIDE,
  buildStarAttributes,
  drawStarClasses,
  pageStarClasses,
  resetPageStars,
  seededRandom,
  starCoreCssPx,
  starCounts,
  starTint,
  starUnder,
} from './stars';

const H = 836;
/** The real catalogue size, so the mix is checked for the number of stars the site draws. */
const N = (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as unknown[]).length;

/** One stop's gas images as theme.json version 3 describes them (the fixture of src/lib/data/theme.test.ts); unused here. */
const STOP_GAS = { rect: [-1.4, -1.4, 1.1, 1.4] as [number, number, number, number], px: [1829, 2048] as [number, number], sharp: [3200, 3584] as [number, number], hash: ['0123456789', 'abcdef0123'] as [string, string] };
function theme(n: number, lead: number[], bg: number[]): ThemeData {
  return { v: 3, n, positionsHash: 'x', bakeHalf: 1.75, gas: { sonic: STOP_GAS, balanced: STOP_GAS, mood: STOP_GAS }, stars: { lead, bg }, labels: { sonic: [], balanced: [], mood: [] } };
}
const histogram = (classes: Uint8Array): number[] => {
  const h = [0, 0, 0, 0];
  for (const c of classes) h[c]++;
  return h;
};
/** FNV-1a, 32 bit, over the class bytes: a compact fingerprint of a whole deal. */
const fnv1a = (bytes: Uint8Array): number => {
  let h = 0x811c9dc5;
  for (const v of bytes) h = Math.imul(h ^ v, 0x01000193) >>> 0;
  return h;
};

describe('seededRandom', () => {
  it('gives the same numbers for the same seed, different ones for another, all in 0 to 1', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const as = Array.from({ length: 200 }, a);
    expect(as).toEqual(Array.from({ length: 200 }, b));
    expect(as).not.toEqual(Array.from({ length: 200 }, c));
    expect(as.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('is the prototype generator (mulberry32)', () => {
    const r = seededRandom(7);
    expect([r(), r(), r()]).toEqual([0.011704753153026104, 0.06195825757458806, 0.97690763277933]);
  });
});

describe('starCounts (the 1%, 9%, 27% mix in whole albums)', () => {
  it('is exact for the real catalogue: each class within half an album of its share, the rest small', () => {
    const counts = starCounts(N);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(N);
    // Tolerance: rounding to a whole album, so at most 0.5 from the exact share.
    for (let k = 0; k < 3; k++) expect(Math.abs(counts[k] - N * STAR_MIX[k])).toBeLessThanOrEqual(0.5);
    expect(counts[3]).toBe(N - counts[0] - counts[1] - counts[2]);
    expect(starCounts(4081)).toEqual([41, 367, 1102, 2571]);
  });

  it('never deals more albums than there are', () => {
    expect(starCounts(0)).toEqual([0, 0, 0, 0]);
    expect(starCounts(1)).toEqual([0, 0, 0, 1]);
    expect(starCounts(2)).toEqual([0, 0, 1, 1]);
    expect(starCounts(100)).toEqual([1, 9, 27, 63]);
  });
});

describe('drawStarClasses (the random deal)', () => {
  it('deals exactly the mix for the real catalogue, whatever the seed', () => {
    for (const seed of [1, 2, 3, 99, 4294967295]) expect(histogram(drawStarClasses(N, seededRandom(seed))), `seed ${seed}`).toEqual(starCounts(N));
  });

  it('gives the same assignment for the same seed', () => {
    expect(drawStarClasses(N, seededRandom(5))).toEqual(drawStarClasses(N, seededRandom(5)));
  });

  it('gives a different assignment for a different seed', () => {
    const a = drawStarClasses(N, seededRandom(1));
    const b = drawStarClasses(N, seededRandom(2));
    let differ = 0;
    for (let i = 0; i < N; i++) if (a[i] !== b[i]) differ++;
    // Two independent deals of this mix differ on about 52% of the albums (1 - 0.01^2 - 0.09^2 - 0.27^2 - 0.63^2).
    expect(differ).toBeGreaterThan(N * 0.4);
  });

  it('does not follow album order: the first albums are bright no more often than any others', () => {
    // Over 400 seeds, count how often one of the first 41 albums (the chart's top 1%) is in the brightest class.
    // A fair deal expects 400 * 41 * 41 / 4081 = 165 of 16,400; a rule that followed album order gives 16,400.
    // The same for the first 408 albums (the top 10%) in the two brightest classes: a fair deal expects 16,316
    // of 163,200; a rule that followed album order gives 163,200.
    let top1 = 0;
    let top10 = 0;
    let indexSum = 0;
    let brightest = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const c = drawStarClasses(4081, seededRandom(seed));
      for (let i = 0; i < 4081; i++) {
        if (c[i] === 0) {
          if (i < 41) top1++;
          indexSum += i;
          brightest++;
        }
        if (i < 408 && c[i] <= 1) top10++;
      }
    }
    expect(top1).toBeGreaterThan(100);
    expect(top1).toBeLessThan(240);
    expect(top10).toBeGreaterThan(15500);
    expect(top10).toBeLessThan(17100);
    // The brightest stars sit, on average, in the middle of the album list (index 2,040), not at its start.
    expect(Math.abs(indexSum / brightest - 2040)).toBeLessThan(60);
  });

  it('does not follow album order in the bright and medium classes either', () => {
    // The same 400 seeds. The first 1,510 albums (the chart's top 37%) land in the three brighter classes
    // 400 * 1,510 * 1,510 / 4,081 = 223,484 times in a fair deal (sd 298); a rule that followed album order for any
    // of classes 0 to 2 pushes this towards 604,000. Bounds are 6 sd each side (seeds 1 to 400 give 223,568; 49
    // other windows of 400 seeds gave 222,901 to 224,349).
    // And each class on its own sits, on average, in the middle of the album list (index 2,040): a fair deal's mean
    // index has sd 2.9 for class 1 (367 albums a deal) and 1.5 for class 2 (1,102), so 20 and 10 are about 6.7 sd
    // (seeds 1 to 400 give 2,041.2 and 2,038.4; the 49 other windows stayed within 6.6 and 4.7).
    let top37 = 0;
    const sum = [0, 0, 0, 0];
    const count = [0, 0, 0, 0];
    for (let seed = 1; seed <= 400; seed++) {
      const c = drawStarClasses(4081, seededRandom(seed));
      for (let i = 0; i < 4081; i++) {
        sum[c[i]] += i;
        count[c[i]]++;
        if (i < 1510 && c[i] <= 2) top37++;
      }
    }
    expect(top37).toBeGreaterThan(221700);
    expect(top37).toBeLessThan(225300);
    expect(Math.abs(sum[1] / count[1] - 2040)).toBeLessThan(20);
    expect(Math.abs(sum[2] / count[2] - 2040)).toBeLessThan(10);
  });

  it('takes the number of albums and the random source, and the order comes from the source', () => {
    // Two required parameters, the count and the source; no album record, index list or rank is among them.
    // (`length` does not see a parameter with a default or a variable the function closes over: Task 2's source
    // test on AlbumField guards what the callers pass.)
    expect(drawStarClasses.length).toBe(2);
    // The deal follows the source: two different constant sources give two different deals, where a function that
    // ignored `random` (or dealt by index) would give the same one. Each is still exactly the mix.
    const zero = drawStarClasses(50, () => 0);
    const half = drawStarClasses(50, () => 0.5);
    expect(zero).not.toEqual(half);
    for (const c of [zero, half, drawStarClasses(50, () => 0.999999)]) expect(histogram(c)).toEqual(starCounts(50));
  });

  it('deals seed 20261004 (the still screenshots\' seed) album for album as the prototype does', () => {
    // Expected values come from a verbatim copy of the prototype's deal (src/data.js L70-75, RMR.rng from
    // src/config.js) for 4,081 albums: the class counts, the first 24 classes, and FNV-1a fingerprints of the first
    // 200 classes and of the whole deal. A changed shuffle direction or cut-off keeps the mix but fails here.
    const c = drawStarClasses(4081, seededRandom(20261004));
    expect(histogram(c)).toEqual([41, 367, 1102, 2571]);
    expect(Array.from(c.subarray(0, 24)).join('')).toBe('333333232232332233123322');
    expect(fnv1a(c.subarray(0, 200))).toBe(3530857145);
    expect(fnv1a(c)).toBe(4280700235);
  });

  it('copes with no albums and with one', () => {
    expect(drawStarClasses(0, seededRandom(1))).toEqual(new Uint8Array(0));
    expect(drawStarClasses(1, seededRandom(1))).toEqual(new Uint8Array([3]));
  });
});

describe('pageStarClasses (one deal per page load)', () => {
  beforeEach(() => {
    resetPageStars();
    // The test hooks object as the store module leaves it, with no seed on it.
    window.__rmr = { ...window.__rmr! };
    delete window.__rmr.starSeed;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetPageStars();
  });

  it('deals once and returns the same array from then on, so slider moves, pans and zooms cannot change a class', () => {
    const first = pageStarClasses(N);
    const copy = Uint8Array.from(first);
    // Whatever happens later in the page load, the next call hands back the very same array, unchanged.
    for (let k = 0; k < 5; k++) expect(pageStarClasses(N)).toBe(first);
    expect(first).toEqual(copy);
    expect(histogram(first)).toEqual(starCounts(N));
  });

  it('publishes the seed it used, and the deal is the one that seed gives', () => {
    const classes = pageStarClasses(N);
    const seed = window.__rmr!.starSeed!;
    expect(Number.isInteger(seed)).toBe(true);
    expect(classes).toEqual(drawStarClasses(N, seededRandom(seed)));
  });

  it('deals afresh on the next page load', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    const first = Uint8Array.from(pageStarClasses(N));
    expect(window.__rmr!.starSeed).toBe(Math.floor(0.25 * 4294967296));
    resetPageStars(); // what a reload does
    delete window.__rmr!.starSeed;
    const second = pageStarClasses(N);
    expect(window.__rmr!.starSeed).toBe(Math.floor(0.75 * 4294967296));
    expect(second).not.toEqual(first);
  });

  it('uses a seed a test put on window.__rmr before the map loaded', () => {
    window.__rmr!.starSeed = 7;
    expect(pageStarClasses(N)).toEqual(drawStarClasses(N, seededRandom(7)));
    expect(window.__rmr!.starSeed).toBe(7);
  });

  it('on the server deals afresh on every call and keeps nothing for the page', () => {
    // Client only: a module on the server lives across requests, so a kept deal there would be shared by every
    // visitor and could differ from the client's. Server calls get a throwaway deal, and the page's own deal is
    // still made on the client's first call.
    vi.stubGlobal('window', undefined);
    try {
      const a = pageStarClasses(N);
      const b = pageStarClasses(N);
      expect(a).not.toBe(b);
      expect(histogram(a)).toEqual(starCounts(N));
    } finally {
      vi.unstubAllGlobals();
    }
    window.__rmr!.starSeed = 7;
    expect(pageStarClasses(N)).toEqual(drawStarClasses(N, seededRandom(7)));
    expect(pageStarClasses(N)).toBe(pageStarClasses(N));
  });

  it('keeps the page seed if the number of albums changes', () => {
    window.__rmr!.starSeed = 7;
    pageStarClasses(N);
    expect(pageStarClasses(100)).toEqual(drawStarClasses(100, seededRandom(7)));
  });
});

describe('starTint', () => {
  it('is three quarters star white and one quarter the leading family hue', () => {
    const want = [0, 1, 2].map((k) => Math.round(STAR_WHITE[k] * 0.75 + EMBER_RGB[2][k] * 0.25));
    expect(starTint(2)).toEqual(want);
  });

  it('is plain star white for an album with no leading family, or a family that does not exist', () => {
    expect(starTint(-1)).toEqual([...STAR_WHITE]);
    expect(starTint(9)).toEqual([...STAR_WHITE]);
  });
});

describe('starUnder (how much dark disc the gas behind a star needs)', () => {
  it('is nothing on gas no brighter than 0.5, and never more than 0.26', () => {
    expect(starUnder(0)).toBe(0);
    expect(starUnder(0.5)).toBe(0);
    expect(starUnder(0.6)).toBeCloseTo(1 - 0.5 / 0.6, 6);
    expect(starUnder(10)).toBe(0.26);
  });
});

describe('buildStarAttributes', () => {
  it('packs each album its dealt class radius, glow, alpha and halo reach, with the tint and gas luminance from the theme', () => {
    const a = buildStarAttributes(new Uint8Array([3, 0, 2]), theme(3, [0, -1, 4], [10, 20, 30, 40, 50, 60, 70, 80, 90]));
    const row = (i: number) => [...a.star.slice(4 * i, 4 * i + 4)].map((v) => +v.toFixed(2));
    expect(row(0)).toEqual([STAR_RADIUS[3], STAR_GLOW[3], STAR_ALPHA[3], STAR_WIDE[3]]);
    expect(row(1)).toEqual([STAR_RADIUS[0], STAR_GLOW[0], STAR_ALPHA[0], STAR_WIDE[0]]);
    expect(row(2)).toEqual([STAR_RADIUS[2], STAR_GLOW[2], STAR_ALPHA[2], STAR_WIDE[2]]);
    expect([...a.tint.slice(0, 3)]).toEqual(starTint(0));
    expect([...a.tint.slice(3, 6)]).toEqual([...STAR_WHITE]);
    expect([...a.tint.slice(6, 9)]).toEqual(starTint(4));
    expect([...a.bg]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it('takes size and brightness from the deal alone: the same albums with another deal get other sizes, the same tints', () => {
    const t = theme(3, [0, 1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const a = buildStarAttributes(new Uint8Array([0, 1, 2]), t);
    const b = buildStarAttributes(new Uint8Array([2, 0, 1]), t);
    expect([...a.star]).not.toEqual([...b.star]);
    expect([...a.tint]).toEqual([...b.tint]);
    expect([...a.bg]).toEqual([...b.bg]);
  });

  it('falls back to white stars with no under-disc when the theme data is missing', () => {
    const a = buildStarAttributes(new Uint8Array([3, 1]), null);
    expect([...a.tint]).toEqual([...STAR_WHITE, ...STAR_WHITE]);
    expect([...a.bg]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(+a.star[4].toFixed(2)).toBe(STAR_RADIUS[1]);
  });

  it('falls back to white stars when the theme data is for a different number of albums', () => {
    const wrongN = buildStarAttributes(new Uint8Array(2), theme(3, [0, 1, 2], [9, 9, 9, 9, 9, 9, 9, 9, 9]));
    const short = buildStarAttributes(new Uint8Array(2), theme(2, [0], [9, 9, 9]));
    for (const a of [wrongN, short]) {
      expect([...a.tint]).toEqual([...STAR_WHITE, ...STAR_WHITE]);
      expect([...a.bg]).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });
});

describe('star size against the dot size the hit test uses', () => {
  it('uses the dot rule relative to its value at 12.5 px covers', () => {
    expect(DOT_AT_OVERVIEW).toBeCloseTo(1.8 + 12.5 / 3.15, 10);
    expect(starCoreCssPx(0, zoomForCoverPx(12.5, H), H)).toBeCloseTo(2 * STAR_RADIUS[0], 6);
  });

  it('takes one of the four classes, so a class outside them does not compile', () => {
    expectTypeOf(starCoreCssPx).parameter(0).toEqualTypeOf<0 | 1 | 2 | 3>();
  });

  it('never draws a star core wider than the dot, so the 14 px and 24 px hit radii still cover it', () => {
    for (const cover of [1, 4, 8, 12.5, 16, 24, 32, 64]) {
      for (const cls of [0, 1, 2, 3] as const) {
        const core = starCoreCssPx(cls, zoomForCoverPx(cover, H), H);
        expect(core).toBeLessThanOrEqual(DOT_MAX_PX);
        expect(core / 2).toBeLessThan(hitRadiusCssPx('mouse'));
        expect(core / 2).toBeLessThan(hitRadiusCssPx('touch'));
      }
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/stars.test.ts)`
Expected: FAIL, `Failed to resolve import "./stars"`.

- [ ] **Step 4: Write the implementation**

Create `frontcreck/src/components/map/state/stars.ts`:

```ts
/** The Trifid stars: every album is one star, drawn by the album sprite shader (shaders/album.ts). This file
 * holds the numbers, the random draw of star classes and the per-album attributes; the shader mirrors the
 * formulas. */
import type { ThemeData } from '@/lib/data/theme';
import { EMBER_RGB, STAR_WHITE } from '../theme';
import { DOT_BASE_PX, DOT_SCALE_PX, dotCssPx } from './zoomLimits';

/** Share of the albums in the three brighter classes (1% brightest, 9% bright, 27% medium); the rest are small
 * (class 3). Which album gets which class is a random draw on each page load (the prototype's STAR_MIX and
 * src/data.js). Album index, order and rank play no part, here or anywhere else. */
export const STAR_MIX = [0.01, 0.09, 0.27] as const;
/** Core radius per class, CSS px at the Overview scale (12.5 px covers). */
export const STAR_RADIUS = [2.8, 1.9, 1.4, 1.1] as const;
/** Bloom strength per class. */
export const STAR_GLOW = [1, 0.55, 0.16, 0.12] as const;
export const STAR_ALPHA = [1, 0.95, 0.85, 0.72] as const;
/** How far the bloom reaches, in core radii, once the map is zoomed in enough for wide halos. */
export const STAR_WIDE = [6, 4.4, 2.6, 2.6] as const;
/** Share of the leading family's hue in a star's colour; the rest is STAR_WHITE. */
export const STAR_TINT_MIX = 0.25;
/** The dark under-disc holds the gas beside a star to this luminance, with at most this alpha. */
export const STAR_UNDER_HOLD = 0.5;
export const STAR_UNDER_MAX = 0.26;
/** The dot diameter (state/zoomLimits.ts) when covers would be 12.5 px: star sizes are relative to it. */
export const DOT_AT_OVERVIEW = DOT_BASE_PX + 12.5 / DOT_SCALE_PX;

/** A star class: 0 brightest, 1 bright, 2 medium, 3 small. */
export type StarClass = 0 | 1 | 2 | 3;

/** A source of random numbers in 0 (included) to 1 (not included). */
export type StarRandom = () => number;

/** A small seeded generator (mulberry32, the prototype's RMR.rng): the same seed gives the same numbers. */
export function seededRandom(seed: number): StarRandom {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many of `n` albums fall in each class: STAR_MIX rounded to whole albums, the rest in class 3. */
export function starCounts(n: number): [number, number, number, number] {
  const c0 = Math.min(n, Math.round(n * STAR_MIX[0]));
  const c1 = Math.min(n - c0, Math.round(n * STAR_MIX[1]));
  const c2 = Math.min(n - c0 - c1, Math.round(n * STAR_MIX[2]));
  return [c0, c1, c2, n - c0 - c1 - c2];
}

/** Deals a class (0 brightest to 3 small) to each of `n` albums: a Fisher-Yates shuffle of the albums by
 * `random`, then the first starCounts(n)[0] of the shuffled albums get class 0, and so on. Its only inputs are
 * the number of albums and the random source, so it cannot follow album order or rank. */
export function drawStarClasses(n: number, random: StarRandom): Uint8Array {
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const [c0, c1, c2] = starCounts(n);
  const classes = new Uint8Array(n);
  for (let k = 0; k < n; k++) classes[order[k]] = k < c0 ? 0 : k < c0 + c1 ? 1 : k < c0 + c1 + c2 ? 2 : 3;
  return classes;
}

let page: { seed: number; classes: Uint8Array } | null = null;

const freshSeed = (): number => Math.floor(Math.random() * 4294967296);

/** This page load's star classes for `n` albums. Client only. Drawn on first use from a fresh random seed and
 * kept for the life of the page: every later call returns the same array, so an album keeps its class through
 * slider moves, pans, zooms, a remounted map and a reloaded catalogue of the same size. The seed is published as
 * window.__rmr.starSeed; a test that needs a repeatable picture sets that value before the map loads. On the
 * server (no window) it returns a throwaway deal and keeps nothing, since a server module outlives one page. */
export function pageStarClasses(n: number): Uint8Array {
  if (typeof window === 'undefined') return drawStarClasses(n, seededRandom(freshSeed()));
  if (page && page.classes.length === n) return page.classes;
  const hooks = window.__rmr;
  const given = hooks?.starSeed;
  let seed: number;
  if (page) seed = page.seed;
  else if (typeof given === 'number' && Number.isFinite(given)) seed = given >>> 0;
  else seed = freshSeed();
  page = { seed, classes: drawStarClasses(n, seededRandom(seed)) };
  if (hooks) hooks.starSeed = seed;
  return page.classes;
}

/** Forgets the page's draw, as a new page load does. For unit tests only. */
export function resetPageStars(): void {
  page = null;
}

/** Star colour, 0..255: near white with a quarter of the leading colour family's hue. */
export function starTint(lead: number): [number, number, number] {
  const hue = Number.isInteger(lead) && lead >= 0 && lead < EMBER_RGB.length ? EMBER_RGB[lead] : STAR_WHITE;
  return [0, 1, 2].map((k) => Math.round(STAR_WHITE[k] * (1 - STAR_TINT_MIX) + hue[k] * STAR_TINT_MIX)) as [number, number, number];
}

/** Alpha of the dark under-disc for gas of luminance `gasLum` behind the star (JS mirror of the vertex shader). */
export function starUnder(gasLum: number): number {
  return Math.min(STAR_UNDER_MAX, Math.max(0, 1 - STAR_UNDER_HOLD / Math.max(gasLum, 0.001)));
}

/** Diameter of a star's core in CSS px (JS mirror of the vertex shader, before the dimmed map's enlargement). */
export function starCoreCssPx(cls: StarClass, zoom: number, canvasHeightCssPx: number): number {
  return 2 * Math.max(0.8, (STAR_RADIUS[cls] * dotCssPx(zoom, canvasHeightCssPx)) / DOT_AT_OVERVIEW);
}

export interface StarAttributes {
  /** 4 per album: class radius, glow, alpha, halo reach. */
  star: Float32Array;
  /** 3 per album: star colour, 0..255. */
  tint: Uint8Array;
  /** 3 per album: gas luminance under it at sonic, balanced, mood; 0..255 for 0..GAS_LUM_MAX. */
  bg: Uint8Array;
}

function usable(theme: ThemeData | null, n: number): theme is ThemeData {
  return !!theme && theme.n === n && theme.stars.lead.length === n && theme.stars.bg.length === 3 * n;
}

/** Per-album star attributes for the dealt `classes` (one per album). The tint and the gas luminance come from
 * the theme data and do not depend on the class; without usable theme data every star is plain white with no
 * under-disc. */
export function buildStarAttributes(classes: Uint8Array, theme: ThemeData | null): StarAttributes {
  const n = classes.length;
  const star = new Float32Array(4 * n);
  const tint = new Uint8Array(3 * n);
  const bg = new Uint8Array(3 * n);
  const ok = usable(theme, n);
  for (let i = 0; i < n; i++) {
    const c = Math.min(3, classes[i]);
    star[4 * i] = STAR_RADIUS[c];
    star[4 * i + 1] = STAR_GLOW[c];
    star[4 * i + 2] = STAR_ALPHA[c];
    star[4 * i + 3] = STAR_WIDE[c];
    const t = ok ? starTint(theme.stars.lead[i]) : STAR_WHITE;
    tint[3 * i] = t[0];
    tint[3 * i + 1] = t[1];
    tint[3 * i + 2] = t[2];
    if (ok) for (let k = 0; k < 3; k++) bg[3 * i + k] = Math.min(255, Math.max(0, Math.round(theme.stars.bg[3 * i + k])));
  }
  return { star, tint, bg };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/stars.test.ts)`
Expected: PASS, 28 tests (24 as first planned, 4 added by the review follow-up).

If "is the prototype generator (mulberry32)" fails, the generator was changed: the three expected numbers are what the prototype's `RMR.rng(7)` returns. If "does not follow album order" fails, do not widen its bounds: print the three counts and look for a use of the album index in `drawStarClasses`.

- [ ] **Step 6: Typecheck and commit**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)`
Expected: clean.

```bash
git add frontcreck/src/components/map/state/stars.ts frontcreck/src/components/map/state/stars.test.ts frontcreck/src/types/global.d.ts
git commit -m "feat(map): random star classes per page load, tints and star attributes

Size and brightness are dealt at random on each load in the mix 1%, 9%,
27%, rest small. Album order and rank are not used.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

---

### Task 2: Stars in the one album draw (shader, material, attributes)

**Files:**
- Modify: `frontcreck/src/components/map/shaders/album.ts` (imports L1-14; comments L16-21 and L35-41; shaders L83-341)
- Modify: `frontcreck/src/components/map/shaders/album.test.ts` (imports L3-4; append tests after L85)
- Modify: `frontcreck/src/components/map/canvas/AlbumField.tsx` (L9, L30-38, L40, L45-64, L67-99, L101, new effect after L133)
- Test: `frontcreck/src/components/map/canvas/AlbumField.stars.test.ts` (new)
- Modify: `frontcreck/src/components/map/data.ts` (L1, L9-12)
- Modify: `frontcreck/src/components/album/MapPreviewStrip.tsx` (L6, L14-15: stand-in only, part 3 owns the restyle)

**Interfaces:**
- Consumes: `buildStarAttributes`, `pageStarClasses`, `DOT_AT_OVERVIEW`, `STAR_UNDER_HOLD`, `STAR_UNDER_MAX` (Task 1); `FRAME_RGB`, `GAS_LUM_MAX`, `STAR_WHITE` (`../theme`, part 1); `useMapStore((s) => s.theme): ThemeData | null` (part 1).
- Produces: `ALBUM_VERTEX_SHADER`, `ALBUM_FRAGMENT_SHADER` with attributes `a_star` (vec4), `a_tint` (vec3), `a_bg` (vec3); `a_clusterId`, `u_clusterColors` and `CLUSTER_RGB` are gone. `spriteCssSize`, `renderedSpriteCssSize`, `selectedSpriteCssSize`, `selectedIsProminent` and every exported constant (`SELECTION_DIM`, `DOT_ALPHA`, `MUTED_DOT_SCALE` and the rest) keep their signatures and values.

**Design notes the implementer needs.**

*Blending.* The fragment writes premultiplied colour: `vec4(rgb, a)` blended with `src = One`, `dst = OneMinusSrcAlpha`. A star fragment is `vec4(light, underAlpha)`: its light adds, its alpha (the under-disc) darkens what is behind. A cover fragment is `vec4(rgb * a, a)`, which is ordinary alpha blending. One draw does both.

*Depth layers with wide glow quads.* The material keeps `depthWrite: true` and `depthFunc: LessEqual`; the vertex shader puts each sprite at z = layer (0 default, 0.1 focus neighbour, 0.2 hover, 0.3 seed, 0.4 picked). A fragment that is not discarded writes depth over its whole footprint, so a wide glow on an elevated sprite would stop later neighbours from drawing inside its halo. The rule: **a sprite on any layer above 0 has no star light and no under-disc** (`starA = 0.0; under = 0.0;` in the vertex shader), and the fragment shader discards every fragment with neither colour nor alpha. Why this is correct:
  - All layer-0 fragments are written at the same depth, and `LessEqual` passes equal depth, so layer-0 halos blend over each other in instance order exactly as if the depth test were off. No halo can block another layer-0 sprite.
  - An elevated sprite keeps only its own shape (hover ring and core, anchor ring, picked cover with mat and frame). Those are the only pixels where it writes the nearer depth, and they are exactly the pixels where it should hide later, lower sprites. Everywhere else it is discarded, so it writes no depth and punches no hole.
  - An elevated sprite drawn after a neighbour's halo passes the depth test and paints over it; drawn before, the neighbour's halo is rejected only under the elevated shape.

*Hit test: nothing changes.* `albumAt` (`canvas/CursorTracker.tsx` L41-46) takes `renderedSpriteCssSize(...) / 2` as the drawn radius and `spriteHitRadiusCssPx` returns `max(14 or 24, size / 2)`. `renderedSpriteCssSize` still returns the dot or cover size, which this task does not change. A star's core diameter is `2 * STAR_RADIUS[c] * dot / DOT_AT_OVERVIEW`; the largest is `2 * 2.8 * 7.2 / 5.768 = 6.99` CSS px, under the 7.2 px dot and far under the 28 px mouse target. Task 1's "never draws a star core wider than the dot" test pins it. The glow is light, not the album, and is not a hit target.

*Known difference from the prototype.* The prototype draws all under-discs, then all star light. In one draw they interleave, so a later star's under-disc (at most 26%) can dim an earlier neighbour's glow where they overlap. Accepted.

*Over part 1's gas, as built.* `GasField` draws one opaque quad in the opaque pass (`transparent: false`, `renderOrder = -1`, `depthTest: false`, `depthWrite: false`), so it is always under the album points, writes no depth and cannot disturb the depth layers above. The premultiplied output blends over it as designed. Two cases have no gas under the stars: before the first gas texture is in (the quad is hidden until then) and with no usable theme (no `GasField` at all). There the canvas is cleared to transparent (`setClearColor(0x000000, 0)`, `alpha: true`) and the page composites it over the pane's sky colour: a star's light (colour with near zero alpha) adds to the sky and its under-disc (alpha with no colour) darkens it, which over the near black sky is what the gas-less map should look like. No theme also means no under-disc (`a_bg` is 0). Nothing in this task touches `GasField.tsx`, and part 1's draw order in `Scene.tsx` (`MorphDriver`, then `GasField`, then `AlbumField`) stays.

**Acceptance list inherited from part 1** (handoff of 2026-10-05, from the independent fidelity review `docs/design/trifid-theme/reviews/app-fidelity-part1-independent.md`, which names the crops and the places of the brightest gas: the cream centre of the Overview, the rust above it). This task owns these, and its review checks each again **on the brightest cream gas**, with pictures from `capture.mjs` (full shader by default; after-pictures `map-covers-dense-fade-crop` and `album-open`) against the same crops of the part 1 review (`docs/design/trifid-theme/reviews/app-part1/covers/bright-covers-fade-23px.jpg` for the 23 px tiles, `app-part1/album-app.jpg` and `app-part1/album-bright-app.jpg` for the 45 percent dots beside an open album):
- The hover ring on a dot (`hover-map-album-crop`): it must be easy to find on cream. Part 3 Task 4 adds the selected ring's casing; the hover mark's casing is this task's.
- Warm dots on cream and rust, and the 45 percent dots beside an open album (`phone-map-overview`, `album-open`): the stars must hold on the brightest gas without reading as clutter over it.
- Cross-fade tiles at about 23 px (`map-covers-dense-fade-crop` and its `retina-` version): soft, tinted, slightly see-through, piled softly, as the owner's "nice blur effect". The tile colour is now each album's star colour, which nobody has seen rendered: **show the owner first** (step 10).
- Half transparent covers around a picked album (`selected-dense-crop`): 50 percent alpha with the pile showing through itself, kept.
- Already fine and must stay so: full covers at 32 px and over, the picked cover and its frame, the hover square on a cover.
Today's handling of overlapping covers (the 16 to 32 px cross-fade band and the 50 percent alpha around a pick) must survive this task; the baseline crops are `baseline/shots/desktop/retina-map-covers-dense-fade-crop.png` and `selected-dense-crop.png`.

*Random stars.* The `a_star` attribute is built from `pageStarClasses(n)` (Task 1), once, when the geometry is built. The effect that follows the theme data rewrites only `a_tint` and `a_bg`. Nothing in this file reads `data.albums`, the album index or a rank to size a star; `AlbumField.stars.test.ts` (step 2) pins that from the source, because the component itself needs WebGL to run. (Albums are still drawn in album order, as today: that decides which of two overlapping covers is on top, not how a star looks.)

*What the current site does where covers overlap, and which lines keep it.* The owner values how two overlapping covers are handled on the map today (he describes "a nice blur effect"). No line of today's code blurs anything. The baseline's `REGRESSION-CHECKLIST.md`, section 1, takes the look apart; the pictures are `map-covers-dense-fade-crop`, `selected-dense-crop` and `map-covers-dense-crop` in `docs/design/trifid-theme/reviews/baseline/shots/` (and their `retina-` versions). The look comes from six things in `shaders/album.ts` and `canvas/AlbumField.tsx` as they are before this task. All six stay.

1. **The cross-fade band: soft, tinted, slightly see-through tiles.** This is most likely what he means. Between 16 and 32 px a cover is a rounded tile that starts as its dot's colour and gains its image, 78% to 100% opaque, growing from the dot's size to the cover's, its corners going from a full circle to 2 px. A pile of them reads as soft, overlapping tinted tiles. Today: `coverT = smoothstep(16, 32, coverCss)` (`album.ts` L153), size `mix(dotCss, coverCss, coverT)` (L158), colour `mix(clusterColour, atlasTexel, coverT)` (L298-302), alpha `mask * mix(u_dotAlpha, 1.0, v_coverT)` with `u_dotAlpha` 0.78 (L303), corner `mix(halfSize, min(halfSize, 2.0), v_coverT)` (L291-293).

   Kept, formula for formula, in the fragment shader below: `col = mix(v_tint.rgb, sampleAtlas(...), v_coverT);` and `alpha = mask * mix(u_dotAlpha, 1.0, v_coverT) * smoothstep(0.0, 0.125, v_coverT);` (the same `u_dotAlpha` uniform as today, 0.78 on the full map and 0.34 on the dimmed one, declared in the fragment shader as it is today), with the same `coverT`, size and corner lines. Two things differ, and only these two. The tile's starting colour is the album's own star colour (`v_tint`), because the three cluster colours leave with the old palette. And the tile's alpha is eased in over the first eighth of the fade (covers of 16 to about 19 px), because under it there is now a star, smaller than the old dot, and without the ease a full-size tile would pop in at 16 px. From there on the alpha is today's. An earlier draft of this task faded the cover in as `coverT * coverT` over the star with no tile colour; at 23 px that is 16% opaque where today is 87%, which would have lost this look. It is gone from the plan.
2. **Covers that step back turn see-through.** While an album is picked in Explore, every other cover's alpha is multiplied by `mix(1.0, u_selDim, v_coverT)`, which is 0.5 at full covers, so the pile shows through itself (`album.ts` L305-306; `SELECTION_DIM = 0.5`, L68-69). Beside an open album, everything outside the focus is multiplied by `u_focusDim`, 0.45 (`album.ts` L304; `FOCUS_DIM`, `AlbumField.tsx` L25-26). Kept: the fragment shader below has the same two lines, `if (v_dim > 0.5) alpha *= u_focusDim;` and `if (v_selDim > 0.5) alpha *= mix(1.0, u_selDim, v_coverT);`, and both constants keep their values. The earlier draft darkened the stepped-back covers towards the page colour and left them opaque (the prototype's `overlay.js` does that); that too is gone from the plan.
3. **One draw, album order; fully shown covers are opaque.** Every album is one instance of one draw, so inside a depth layer a later album paints over an earlier one, the same one every time, and from 32 px up the top cover hides the one beneath (`album.ts` L160-165, L175, L303; `AlbumField.tsx` L70-78: `transparent`, `depthWrite`, `depthTest`, `LessEqualDepth`). Kept: the vertex shader's layer block is unchanged, the material keeps those four settings, and at `coverT = 1` the alpha is `mask`. The output becomes premultiplied (`rgb * a, a` blended One, OneMinusSrcAlpha), which for a cover is the same picture as today's source-alpha blend.
4. **Lifting by depth.** The hovered album (layer 0.2), the focus seed (0.3) and its neighbours (0.1) and the picked album once covers show (0.4, drawn 1.8 times larger on an opaque backing with a frame) are raised whole above the covers they overlap (`album.ts` L166-173, L190, L307-316). Kept: the same five `layer =` lines, the same `SELECTED_*` constants, the same frame position and width. The picked cover's backing is today's too: 1 px round the cover, in the new page colour, with the map showing through the 4 px gap up to the frame (`float back = 1.0 - smoothstep(1.0 - 0.5 * aa, 1.0 + 0.5 * aa, squareSd(p, halfSize));`, `alpha = max(alpha, back);`). The approved material does not show an Explore pick at cover zoom in the app's form (the prototype's `overlay.js` L117-119 strokes a frame on the cover's own edge, with no enlarged cover and no gap; `final-album.jpg` shows only the seed marker, which is DOM), so the no regressions rule decides and only the frame and backing colours change. Two things around it change on purpose and are to be looked at in Task 9 step 9: the hover mark gains a dark casing, so its sprite is 4 px larger (`+ 6.0` and `21.0` where today has `+ 2.0` and `17.0`); and the mark on a focus album's true position is a 12 px hollow ring where today it is a 5 px paper dot at 0.8 alpha.
5. **Soft edges and soft small covers.** One device pixel of antialiasing on every edge (`album.ts` L289, L296), and trilinear, mip-mapped atlas sampling (`canvas/AtlasManager.tsx` L40-42), which is what softens covers drawn far under their 96 px cells. Kept: the mask lines are unchanged and this task does not touch `AtlasManager.tsx`.
6. **No depth from empty texels.** Fragments with nothing in them are discarded, so a cover's transparent corner never hides the cover under it (`album.ts` L337-338). Kept, and extended to the star's light (the new last lines of the fragment shader).

The checklist names a seventh part of the softness, the film grain over the whole page (`styles/shell.css` L20-23). This task does not touch it; the owner has decided to remove it, and part 3 does that.

The new 1 px dark keyline inside each cover's edge is an addition. It comes in with the image (it is scaled by `coverT`), so it does not ring the small tinted tiles at the start of the fade. `album.test.ts` pins items 1, 2, 4 and 6 from the shader text, `AlbumField.stars.test.ts` pins item 3's depth settings, and Task 9 compares the three baseline pictures above with the same views of this build.

- [ ] **Step 1: Check part 1's hand-off**

Run:

```bash
grep -n "theme" frontcreck/src/components/map/state/mapStore.ts
grep -n "export function rawToWorld\|export const \(FRAME_RGB\|STAR_WHITE\|EMBER_RGB\|GAS_LUM_MAX\|NAMES_BAND_PX\)" frontcreck/src/components/map/data.ts frontcreck/src/components/map/theme.ts
```

Expected: the first prints a `theme: ThemeData | null` field on `MapStore`; the second prints six lines. If the store has no `theme` field, or any export is missing, stop and report the mismatch between parts 1 and 2 to the orchestrator; do not invent the missing piece.

- [ ] **Step 2: Write the failing tests**

In `frontcreck/src/components/map/shaders/album.test.ts`, replace the import on L4:

```ts
import { ALBUM_VERTEX_SHADER, renderedSpriteCssSize, selectedIsProminent, selectedSpriteCssSize, spriteCssSize } from "./album";
```

with:

```ts
import { ALBUM_FRAGMENT_SHADER, ALBUM_VERTEX_SHADER, DOT_ALPHA, SELECTION_DIM, renderedSpriteCssSize, selectedIsProminent, selectedSpriteCssSize, spriteCssSize } from "./album";
```

and append at the end of the file:

```ts
describe("stars in the album draw", () => {
  it("takes the star, tint and gas attributes, and no cluster colour", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec4 a_star;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec3 a_tint;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec3 a_bg;/);
    expect(ALBUM_VERTEX_SHADER + ALBUM_FRAGMENT_SHADER).not.toMatch(/a_clusterId|u_clusterColors|v_clusterId/);
  });

  it("mixes the gas luminance by the slider with the same piecewise rule as the positions", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float t = u_sliderT \* 2\.0;\s*return mix\(a_bg\.x, a_bg\.y, t\);/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/float t = \(u_sliderT - 0\.5\) \* 2\.0;\s*return mix\(a_bg\.y, a_bg\.z, t\);/);
  });

  it("sizes the star from the dot rule at Overview and fades it out as the cover fades in", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float sizeK = dotCss \/ 5\.7683;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/\* \(1\.0 - coverT\) \* clamp\(sizeK \* sizeK, 0\.45, 1\.0\)/);
  });

  it("holds the under-disc to gas of luminance 0.5 with at most 0.26 alpha", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float under = clamp\(1\.0 - 0\.5000 \/ max\(interpolateBg\(\) \* 0\.6000, 0\.001\), 0\.0, 0\.2600\);/);
  });

  it("gives a sprite on an elevated layer no glow and no under-disc, so its halo cannot write depth", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(layer > 0\.0\) \{\s*starA = 0\.0;\s*under = 0\.0;\s*\}/);
  });

  it("keeps the sprite quad to the star's reach", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float reach = r \* mix\(2\.6, a_star\.w, haloT\) \+ 1\.0;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/quadCss = min\(max\(quadCss, starQuad\), capCss\);/);
  });

  it("writes premultiplied colour and discards fragments with neither colour nor alpha", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/vec3 rgb = col \* alpha \+ v_tint\.rgb \* light \* \(1\.0 - alpha\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float a = alpha \+ under \* \(1\.0 - alpha\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(a < 0\.004 && max\(rgb\.r, max\(rgb\.g, rgb\.b\)\) < 0\.004\) discard;/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/gl_FragColor = vec4\(rgb, a\);/);
  });

  it("uses the Trifid frame and backing colours, and none of the old lamp, paper or room literals", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/const vec3 FRAME = vec3\(0\.9451, 0\.9255, 0\.8941\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/const vec3 BACKING = vec3\(0\.0275, 0\.0235, 0\.0392\);/);
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/\b(PAPER|LAMP|ROOM)\b/);
  });
});

describe("overlapping covers are handled as before the theme", () => {
  it("keeps today's handling of overlapping covers: a cover that steps back turns see-through, it is not darkened", () => {
    // Outside an open album's focus (0.45) and, for the cover part only, while another album is picked (0.5).
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(v_dim > 0\.5\) alpha \*= u_focusDim;/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(v_selDim > 0\.5\) alpha \*= mix\(1\.0, u_selDim, v_coverT\);/);
    expect(SELECTION_DIM).toBe(0.5);
    // No opaque darkening towards the page colour in place of the fade.
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/mix\(col, BACKING, [^)]*(u_selDim|0\.6)/);
  });

  it("still lifts the hovered, the focused and the picked album above the covers they overlap", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(u_focusedAlbumIndex >= 0\.0 && isHighlighted\(instanceIndex\)\) layer = 0\.1;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(abs\(u_hoverIndex - instanceIndex\) < 0\.5\) layer = 0\.2;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(abs\(u_focusedAlbumIndex - instanceIndex\) < 0\.5\) layer = 0\.3;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(v_sel > 0\.5\) layer = 0\.4;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/vec4 mvPos = modelViewMatrix \* vec4\(worldPos, layer, 1\.0\);/);
  });

  it("keeps the cross-fade band: a rounded tile from 16 to 32 px, growing from the dot size, 78% to 100% opaque", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float coverT = smoothstep\(16\.0000, 32\.0000, coverCss\)/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/float baseCss = mix\(dotCss, coverCss, coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float corner = mix\(halfSize, min\(halfSize, 2\.0\), v_coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float mask = 1\.0 - smoothstep\(-0\.5 \* aa, 0\.5 \* aa, sd\);/);
    expect(DOT_ALPHA).toBe(0.78);
  });

  it("tints the fading tile with the album's own star colour and eases it in from the star", () => {
    // Today's colour and alpha formulas, with the star colour where the cluster colour was and an ease over the
    // first eighth of the fade. Not the square of the fade: that left a half-faded cover 16% opaque.
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/col = mix\(v_tint\.rgb, sampleAtlas\(int\(v_atlasIndex\), v_atlasRect\.xy \+ local \* v_atlasRect\.zw\), v_coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/uniform float u_dotAlpha;/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/alpha = mask \* mix\(u_dotAlpha, 1\.0, v_coverT\) \* smoothstep\(0\.0, 0\.125, v_coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/v_coverT \* v_coverT/);
  });

  it("keeps the picked cover's 1 px backing and lets the map show through the gap up to its frame", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float back = 1\.0 - smoothstep\(1\.0 - 0\.5 \* aa, 1\.0 \+ 0\.5 \* aa, squareSd\(p, halfSize\)\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/alpha = max\(alpha, back\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/band\(squareSd\(p, halfSize \+ 4\.0000\), 2\.0000, aa\)/);
  });
});
```

Create `frontcreck/src/components/map/canvas/AlbumField.stars.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** AlbumField needs WebGL to run, so these checks read its source, as shaders/album.test.ts reads the shader. */
const src = fs.readFileSync(path.join(process.cwd(), 'src/components/map/canvas/AlbumField.tsx'), 'utf8');

describe('AlbumField and the random stars', () => {
  it("takes the star classes from the page load's one deal, in one place", () => {
    expect(src.match(/pageStarClasses\(/g)).toHaveLength(1);
    expect(src).toMatch(/const classes = pageStarClasses\(n\);/);
  });

  it('sets the star size attribute once and never rewrites it: only the tint and the gas luminance follow the theme', () => {
    expect(src.match(/"a_star"/g)).toHaveLength(1);
    expect(src).not.toMatch(/getAttribute\("a_star"\)/);
    expect(src).toMatch(/getAttribute\("a_tint"\)/);
    expect(src).toMatch(/getAttribute\("a_bg"\)/);
  });

  it('reads nothing of the album record, its index or a rank to draw a star', () => {
    expect(src).not.toMatch(/data\.albums/);
    expect(src).not.toMatch(/a_clusterId|CLUSTER_RGB|starClass\(|\brank\b/);
  });

  it('keeps the depth settings that order overlapping covers', () => {
    expect(src).toMatch(/depthWrite: true,\s*depthTest: true,\s*depthFunc: THREE\.LessEqualDepth,/);
  });
});
```

What these source checks prove, and what they do not: they fail if a second deal, a rewrite of `a_star`, or any read of the album records appears in the one component that draws the stars, and if the depth settings change. They cannot prove what reaches the screen; Task 9's browser check (`e2e/stars.spec.ts`) and the fidelity review do that.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/shaders/album.test.ts src/components/map/canvas/AlbumField.stars.test.ts)`
Expected: FAIL. In `album.test.ts`, the 8 tests of "stars in the album draw" fail, for example `expected '…' to match /attribute vec4 a_star;/`. Of the five tests of "overlapping covers are handled as before the theme", the first three and the last (the picked cover's backing) already pass, because they describe today's shader, and must keep passing after step 4; the fourth fails until the tile takes the star colour. The earlier tests still pass. In `AlbumField.stars.test.ts` the first three tests fail (`pageStarClasses` is not there yet, `data.albums` and `a_clusterId` still are) and the depth test passes.

- [ ] **Step 4: Rewrite the shaders**

In `frontcreck/src/components/map/shaders/album.ts`, replace the import block (L1-14) with:

```ts
import { FRAME_RGB, GAS_LUM_MAX } from "../theme";
import { DOT_AT_OVERVIEW, STAR_UNDER_HOLD, STAR_UNDER_MAX } from "../state/stars";
import {
  COVER_FADE_END_PX,
  COVER_FADE_START_PX,
  COVER_MAX_PX,
  COVER_WORLD,
  DOT_BASE_PX,
  DOT_MAX_PX,
  DOT_MIN_PX,
  DOT_SCALE_PX,
  FRUSTUM_HALF_HEIGHT,
  coverCssPx,
  coverFade,
  dotCssPx,
} from "../state/zoomLimits";
```

Replace the comment on L16-20 with:

```ts
/**
 * Sprite sizes (see state/zoomLimits.ts): the album's body is a dot of 3 to 7 CSS px that grows gently with the
 * map scale, cross-fading to a cover whose size is linear in the map scale (COVER_WORLD world units, 16 to 32
 * CSS px during the fade, at most 64). While it is a dot, what is drawn is a star inside that dot size
 * (state/stars.ts) with a soft glow around it; the star fades out as the cover fades in. An album whose atlas
 * sheet has not loaded yet stays a star.
 */
```

Leave L22-81 (the JS mirrors and constants) as they are. Replace everything from `const f = (v: number) => v.toFixed(4);` (L83) to the end of the file with:

```ts
const f = (v: number) => v.toFixed(4);
const v3 = (c: readonly number[]) => `vec3(${c.map((v) => f(v / 255)).join(", ")})`;

/** The page colour (#07060a): the 1 px backing round the picked cover. */
const BACKING_RGB = [7, 6, 10] as const;
/** The dark casing under white marks, the same as the focus lines' casing (rgb 6, 6, 10). */
const CASING_RGB = [6, 6, 10] as const;

export const ALBUM_VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_pos_sonic;
  attribute vec2 a_pos_balanced;
  attribute vec2 a_pos_mood;
  attribute vec4 a_atlasUV;       // (u, v, w, h)
  attribute float a_atlasIndex;   // float so vertex attribs work
  attribute vec4 a_star;          // class radius (CSS px at Overview), glow, alpha, halo reach in radii
  attribute vec3 a_tint;          // star colour (sRGB, 0..1)
  attribute vec3 a_bg;            // gas luminance under the album at sonic, balanced, mood (0..1 of GAS_LUM_MAX)

  uniform float u_sliderT;
  uniform float u_zoom;          // real camera.zoom
  uniform float u_canvasHeight;  // CSS px
  uniform float u_pixelRatio;
  uniform float u_focusedAlbumIndex;
  uniform float u_neighborMask[12];  // focus album indices (seed first), padded with -1
  uniform float u_hoverIndex;   // -1 = no hover target
  uniform float u_selectedIndex; // album picked in Explore, -1 = none (always -1 in album view)
  uniform float u_maxSpritePx;  // device px cap, viewportHeightCssPx * 0.18 * dpr
  uniform float u_atlasLoaded[5];
  uniform float u_dotAlpha;     // eases from DOT_ALPHA to DOT_ALPHA_DIMMED as the map dims

  varying vec4 v_atlasRect;     // atlas cell: origin.xy, size.zw
  varying float v_atlasIndex;
  varying float v_dim;          // 1 = outside the focus in album view
  varying float v_hovered;      // 1 = this instance is the hover target
  varying float v_anchor;       // 1 = focus album, drawn as a small ring under its DOM cover
  varying float v_coverT;       // 0 = star, 1 = cover fully shown
  varying vec4 v_size;          // CSS px: body (dot or cover), point sprite, dot at this zoom, hover mark gap
  varying float v_sel;          // 1 = the picked album, drawn large and framed (cover mode)
  varying float v_selDim;       // 1 = another album while one is picked
  varying vec4 v_star;          // core radius and light reach (CSS px), glow, wide-halo amount
  varying vec4 v_tint;          // star colour, star alpha
  varying float v_under;        // alpha of the dark under-disc

  vec2 interpolatePos() {
    if (u_sliderT <= 0.5) {
      float t = u_sliderT * 2.0;
      return mix(a_pos_sonic, a_pos_balanced, t);
    }
    float t = (u_sliderT - 0.5) * 2.0;
    return mix(a_pos_balanced, a_pos_mood, t);
  }

  // The same piecewise rule as the positions, so the under-disc follows the gas through a slider morph.
  float interpolateBg() {
    if (u_sliderT <= 0.5) {
      float t = u_sliderT * 2.0;
      return mix(a_bg.x, a_bg.y, t);
    }
    float t = (u_sliderT - 0.5) * 2.0;
    return mix(a_bg.y, a_bg.z, t);
  }

  bool isHighlighted(float instanceIndex) {
    for (int i = 0; i < 12; i++) {
      if (abs(u_neighborMask[i] - instanceIndex) < 0.5) return true;
    }
    return false;
  }

  float atlasLoaded(int idx) {
    if (idx == 0) return u_atlasLoaded[0];
    if (idx == 1) return u_atlasLoaded[1];
    if (idx == 2) return u_atlasLoaded[2];
    if (idx == 3) return u_atlasLoaded[3];
    if (idx == 4) return u_atlasLoaded[4];
    return 0.0;
  }

  void main() {
    float instanceIndex = float(gl_InstanceID);
    vec2 worldPos = interpolatePos();

    // Sizes mirror spriteCssSize (shaders/album.ts) and state/zoomLimits.ts.
    float pxPerWorld = u_canvasHeight * u_zoom / ${f(2 * FRUSTUM_HALF_HEIGHT)};
    float dotCss = clamp(${f(DOT_BASE_PX)} + pxPerWorld * ${f(COVER_WORLD / DOT_SCALE_PX)}, ${f(DOT_MIN_PX)}, ${f(DOT_MAX_PX)});
    float coverCss = min(${f(COVER_MAX_PX)}, ${f(COVER_WORLD)} * pxPerWorld);
    float coverT = smoothstep(${f(COVER_FADE_START_PX)}, ${f(COVER_FADE_END_PX)}, coverCss)
      * step(0.5, atlasLoaded(int(a_atlasIndex)));
    // Star scale (state/stars.ts): the dot rule relative to its value at Overview, before the dimmed enlargement.
    float sizeK = dotCss / ${f(DOT_AT_OVERVIEW)};
    // The dimmed backdrop (Home, About, 404) draws larger, fainter stars (mockup muted), eased with the alpha.
    float mutedT = clamp((${f(DOT_ALPHA)} - u_dotAlpha) / ${f(DOT_ALPHA - DOT_ALPHA_DIMMED)}, 0.0, 1.0);
    dotCss *= 1.0 + ${f(MUTED_DOT_SCALE - 1)} * mutedT;
    float baseCss = mix(dotCss, coverCss, coverT);

    // Draw-order layers via depth (the material writes depth, LessEqual
    // test). All albums share one instanced draw, so without this a later
    // instance paints over an earlier one. Layers, toward the camera:
    // focused 0.3 > hovered 0.2 > highlighted neighbour 0.1 > everything
    // else 0.0. Same-layer sprites keep plain painter's order.
    // The picked album in cover mode (Explore) is above everything: 0.4.
    float layer = 0.0;
    if (u_focusedAlbumIndex >= 0.0 && isHighlighted(instanceIndex)) layer = 0.1;
    if (abs(u_hoverIndex - instanceIndex) < 0.5) layer = 0.2;
    if (abs(u_focusedAlbumIndex - instanceIndex) < 0.5) layer = 0.3;
    float isSelected = (u_selectedIndex >= 0.0 && abs(u_selectedIndex - instanceIndex) < 0.5) ? 1.0 : 0.0;
    v_sel = (isSelected > 0.5 && coverT > 0.5) ? 1.0 : 0.0;
    v_selDim = (u_selectedIndex >= 0.0 && isSelected < 0.5) ? 1.0 : 0.0;
    if (v_sel > 0.5) layer = 0.4;

    vec4 mvPos = modelViewMatrix * vec4(worldPos, layer, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // The star: core radius, how far its light reaches, and the dark disc the gas behind it needs.
    float r = a_star.x * sizeK * (1.0 + ${f(MUTED_DOT_SCALE - 1)} * mutedT);
    float faint = min(1.0, r / 0.8);   // a star smaller than 0.8 px is drawn at 0.8 px, fainter
    r = max(r, 0.8);
    float haloT = smoothstep(5.0, 7.0, coverCss);   // no wide halos while the map is zoomed far out
    float wideStar = step(3.0, a_star.w);           // the two brightest classes
    float reach = r * mix(2.6, a_star.w, haloT) + 1.0;
    float under = clamp(1.0 - ${f(STAR_UNDER_HOLD)} / max(interpolateBg() * ${f(GAS_LUM_MAX)}, 0.001), 0.0, ${f(STAR_UNDER_MAX)});
    float starA = a_star.z * faint * (1.0 - coverT) * clamp(sizeK * sizeK, 0.45, 1.0) * (u_dotAlpha / ${f(DOT_ALPHA)});
    // Depth rule: only layer-0 sprites reach past their own shape. An elevated sprite (focus, hover, picked)
    // writes a nearer depth wherever it is not discarded, so a glow on it would hide its neighbours.
    if (layer > 0.0) {
      starA = 0.0;
      under = 0.0;
    }

    v_dim = 0.0;
    v_anchor = 0.0;
    if (u_focusedAlbumIndex >= 0.0) {
      if (isHighlighted(instanceIndex)) {
        v_anchor = 1.0;   // focus albums are drawn as DOM covers; the point is a small ring on the true position
        baseCss = 12.0;
        coverT = 0.0;
      } else {
        v_dim = 1.0;   // same size as in the overview (mockup), only fainter
      }
    }
    v_hovered = (abs(u_hoverIndex - instanceIndex) < 0.5 && v_anchor < 0.5 && v_sel < 0.5) ? 1.0 : 0.0;
    if (v_sel > 0.5) baseCss = max(baseCss * ${f(SELECTED_SCALE)}, ${f(SELECTED_MIN_PX)});
    // Hover mark (mockup): a ring of radius 7 around a dot, a square stroke 3 px outside a cover, and in
    // between a stroke that follows the drawn shape at a gap that shrinks to 3 px. The sprite grows to hold it
    // and its dark casing (2 px either side of the stroke's centre).
    float markGap = mix(max(7.0 - 0.5 * baseCss, 3.0), 3.0, coverT);
    float quadCss = v_hovered > 0.5 ? max(baseCss + 2.0 * markGap + 6.0, 21.0) : baseCss;
    if (v_sel > 0.5) quadCss = baseCss + ${f(SELECTED_QUAD_EXTRA)};
    // Clamp at 240 device-px (most GPUs cap GL_POINTS sprites around 256) and at u_maxSpritePx (a
    // viewport-relative cap so a single cover never dominates a short window).
    float capCss = min(240.0, u_maxSpritePx) / u_pixelRatio;
    if (v_sel > 0.5 && quadCss > capCss) {
      // The frame keeps its size; the cover gives way (selectedSpriteCssSize mirrors this).
      baseCss = capCss - ${f(SELECTED_QUAD_EXTRA)};
      quadCss = capCss;
    } else if (quadCss > capCss) {
      baseCss *= capCss / quadCss;
      quadCss = capCss;
    }
    // The quad is only as large as the star needs: its light's reach, or the under-disc (gone at 3 r + 1).
    float starQuad = starA > 0.003 ? 2.0 * (max(reach, under > 0.0 ? 3.0 * r + 1.0 : 0.0) + 1.0) : 0.0;
    quadCss = min(max(quadCss, starQuad), capCss);
    gl_PointSize = quadCss * u_pixelRatio;

    v_coverT = coverT;
    v_size = vec4(baseCss, quadCss, dotCss, markGap);
    v_atlasRect = a_atlasUV;
    v_atlasIndex = a_atlasIndex;
    v_star = vec4(r, reach, a_star.y * mix(1.0, mix(0.3, 1.0, haloT), wideStar), wideStar * haloT);
    v_tint = vec4(a_tint, starA);
    v_under = under;
  }
`;

export const ALBUM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D u_atlas0;
  uniform sampler2D u_atlas1;
  uniform sampler2D u_atlas2;
  uniform sampler2D u_atlas3;
  uniform sampler2D u_atlas4;
  uniform float u_pixelRatio;
  uniform float u_dotAlpha;   // 0.78, 0.34 when the map is dimmed (the tile's alpha at the start of the cross-fade, as before the theme)
  uniform float u_focusDim;   // alpha factor of stars and covers outside the focus
  uniform float u_selDim;     // alpha factor of the other covers while an album is picked

  const vec3 FRAME = ${v3(FRAME_RGB)};
  const vec3 BACKING = ${v3(BACKING_RGB)};
  const vec3 CASING = ${v3(CASING_RGB)};

  varying vec4 v_atlasRect;
  varying float v_atlasIndex;
  varying float v_dim;
  varying float v_hovered;
  varying float v_anchor;
  varying float v_coverT;
  varying vec4 v_size;
  varying float v_sel;
  varying float v_selDim;
  varying vec4 v_star;
  varying vec4 v_tint;
  varying float v_under;

  /** Signed distance to a sharp-cornered square of half size h. */
  float squareSd(vec2 p, float h) {
    vec2 q = abs(p) - vec2(h);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }

  vec3 sampleAtlas(int idx, vec2 uv) {
    if (idx == 0) return texture2D(u_atlas0, uv).rgb;
    if (idx == 1) return texture2D(u_atlas1, uv).rgb;
    if (idx == 2) return texture2D(u_atlas2, uv).rgb;
    if (idx == 3) return texture2D(u_atlas3, uv).rgb;
    return texture2D(u_atlas4, uv).rgb;
  }

  /** 1 inside a band of width w centred on d = 0, with a one-device-pixel soft edge. */
  float band(float d, float w, float aa) {
    return 1.0 - smoothstep(0.5 * w - 0.5 * aa, 0.5 * w + 0.5 * aa, abs(d));
  }

  /** Colour c at coverage a over (col, alpha), both straight alpha. */
  void over(inout vec3 col, inout float alpha, vec3 c, float a) {
    float outA = a + alpha * (1.0 - a);
    col = (c * a + col * alpha * (1.0 - a)) / max(outA, 0.0001);
    alpha = outA;
  }

  void main() {
    // Colours are authored in sRGB; ShaderMaterial does not apply the linear->sRGB output
    // conversion, so the literal values go straight to the framebuffer.
    // Everything below is in CSS px from the sprite centre (y down), so it is the same at every dpr.
    vec2 p = (gl_PointCoord - vec2(0.5)) * v_size.y;
    float aa = 1.0 / max(u_pixelRatio, 0.0001);   // one device pixel
    float d = length(p);

    // The star: a crisp core with a bloom that falls to nothing at its reach (light, added), and under it a
    // dark disc, strongest out to 0.8 r and gone by 3 r + 1 (alpha only). Both are zero on elevated sprites.
    float starA = v_tint.a * (v_dim > 0.5 ? u_focusDim : 1.0);
    float light = 0.0;
    float under = 0.0;
    if (starA > 0.0) {
      float r = v_star.x;
      float win = clamp(1.0 - d / v_star.y, 0.0, 1.0);
      float core = 1.0 - smoothstep(r - 0.6 * aa, r + 0.6 * aa, d);
      float x = d / r;
      float bloom = v_star.z * (0.5 * exp(-x * x * 0.3) + 0.2 * v_star.w * exp(-x * x * 0.045)) * win * win;
      light = (core + bloom * (1.0 - core)) * starA;
      float fall = clamp(1.0 - (d - r * 0.8) / (r * 2.2 + 1.0), 0.0, 1.0);
      under = v_under * min(1.0, starA * 1.4) * fall * fall;
    }

    // The album's body: a rounded box whose corner shrinks from a full circle (dot size) to 2 px (cover).
    float halfSize = 0.5 * v_size.x;
    float corner = mix(halfSize, min(halfSize, 2.0), v_coverT);
    vec2 q = abs(p) - vec2(halfSize - corner);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float mask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, sd);

    vec3 col = BACKING;
    float alpha = 0.0;
    if (v_coverT > 0.0) {
      vec2 local = clamp(p / max(v_size.x, 0.0001) + 0.5, 0.0, 1.0);
      // The cross-fade band, as before the theme: a rounded tile that starts as the album's own colour (its
      // star colour, where the cluster colour used to be) and gains its image, 78% to 100% opaque, so a pile
      // of half-faded covers reads as soft, overlapping tinted tiles.
      col = mix(v_tint.rgb, sampleAtlas(int(v_atlasIndex), v_atlasRect.xy + local * v_atlasRect.zw), v_coverT);
      // A 1 px dark keyline just inside the edge keeps a pale cover apart from bright gas; it comes in with the image.
      col = mix(col, CASING, 0.9 * v_coverT * smoothstep(-1.0 - 0.5 * aa, -1.0 + 0.5 * aa, sd));
      // Today's alpha, eased in over the first eighth of the fade: the star under it is smaller than the old dot.
      alpha = mask * mix(u_dotAlpha, 1.0, v_coverT) * smoothstep(0.0, 0.125, v_coverT);
      // A cover that steps back turns see-through, exactly as before the theme: outside an open album's focus,
      // and (the cover part only) while another album is picked. Where two such covers overlap, the lower one
      // shows through the upper.
      if (v_dim > 0.5) alpha *= u_focusDim;
      if (v_selDim > 0.5) alpha *= mix(1.0, u_selDim, v_coverT);
    }
    if (v_sel > 0.5) {
      // As before the theme: a 1 px page-coloured backing round the cover, then a 2 px frame 4 px outside it.
      // The map shows through the gap between the two.
      float back = 1.0 - smoothstep(1.0 - 0.5 * aa, 1.0 + 0.5 * aa, squareSd(p, halfSize));
      col = mix(BACKING, col, mask);
      alpha = max(alpha, back);
      over(col, alpha, FRAME, band(squareSd(p, halfSize + ${f(SELECTED_FRAME_GAP_PX)}), ${f(SELECTED_FRAME_PX)}, aa));
    }
    if (v_anchor > 0.5) {
      // A hollow ring on the album's true position (a filled dot would read as a bright star).
      float ring = d - 3.4;
      col = CASING;
      alpha = band(ring, 3.5, aa) * 0.8;
      over(col, alpha, FRAME, band(ring, 1.3, aa));
    }

    if (v_hovered > 0.5) {
      // A 1.5 px stroke v_size.w outside the drawn shape, on a dark casing: a circle around a star (radius
      // 7), a square with sharp corners around a full cover, following the shape through the cross-fade.
      float markHalf = halfSize + v_size.w;
      float markCorner = mix(markHalf, 0.0, v_coverT);
      vec2 mq = abs(p) - vec2(markHalf - markCorner);
      float msd = length(max(mq, 0.0)) + min(max(mq.x, mq.y), 0.0) - markCorner;
      // In star mode a core dot stands for the album, fading out as the cover fades in.
      float coreR = max(0.5 * v_size.z, 2.2);
      float core = (1.0 - smoothstep(coreR - 0.5 * aa, coreR + 0.5 * aa, d)) * (1.0 - smoothstep(0.0, 0.5, v_coverT));
      over(col, alpha, CASING, band(msd, 4.0, aa) * 0.8);
      over(col, alpha, FRAME, max(band(msd, 1.5, aa), core) * mix(0.95, 0.9, v_coverT));
    }

    // Premultiplied output (blend One, OneMinusSrcAlpha): the album's shape over the star's light, and the
    // under-disc as alpha with no colour, so it only darkens what is behind it.
    vec3 rgb = col * alpha + v_tint.rgb * light * (1.0 - alpha);
    float a = alpha + under * (1.0 - alpha);
    // Nothing here: write no colour and no depth.
    if (a < 0.004 && max(rgb.r, max(rgb.g, rgb.b)) < 0.004) discard;
    gl_FragColor = vec4(rgb, a);
  }
`;
```

- [ ] **Step 5: Run the shader tests to verify they pass**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/shaders/album.test.ts)`
Expected: PASS, all tests (the two older source checks, "keep their overview size ... and only fade" and "draws its dots 1.35 times larger", still pass: the `v_dim = 1.0;` branch and the `mutedT` lines are unchanged; and the first three "overlapping covers" tests pass as they did before the rewrite, now joined by the fourth).

- [ ] **Step 6: Remove `CLUSTER_RGB` and put the stand-in in the phone strip**

In `frontcreck/src/components/map/data.ts`, delete L1 (`import { hexToRgb } from '@/lib/color';`) and L9-12:

```ts
const rgb = (hex: string): [number, number, number] => hexToRgb(hex).map((v) => v / 255) as [number, number, number];

/** Dot colours by cluster k (k % 3: clay, moss, ochre), written straight to the framebuffer as sRGB literals. */
export const CLUSTER_RGB: [number, number, number][] = Array.from({ length: 8 }, (_, k) => rgb(['#c4886f', '#97a077', '#c8a560'][k % 3]));
```

In `frontcreck/src/components/album/MapPreviewStrip.tsx`, replace L6:

```ts
import { CLUSTER_RGB } from '@/components/map/data';
```

with:

```ts
import { STAR_WHITE } from '@/components/map/theme';
```

and replace L14-15:

```ts
/** The map's three dot colours (CLUSTER_RGB, by cluster % 3) at the strip's lower opacity. */
const DOT = CLUSTER_RGB.slice(0, 3).map(([r, g, b]) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},.42)`);
```

with:

```ts
/** Stand-in until the strip is restyled (Trifid plan part 3): every dot in star white at the strip's lower opacity. */
const DOT = [0, 1, 2].map(() => `rgba(${STAR_WHITE.join(',')},.42)`);
```

- [ ] **Step 7: Feed the attributes and the blending to the material**

In `frontcreck/src/components/map/canvas/AlbumField.tsx`:

Replace L9:

```ts
import { CLUSTER_RGB, interpolateInto, type MapData } from "../data";
```

with:

```ts
import { interpolateInto, type MapData } from "../data";
import { buildStarAttributes, pageStarClasses } from "../state/stars";
```

After L33 (`const invalidate = useThree((s) => s.invalidate);`) add:

```ts
  // Colour families and the gas luminance under each album; null until loaded, or when the load failed.
  const theme = useMapStore((s) => s.theme);
```

Replace L40:

```ts
  const { geometry, material } = useMemo(() => {
```

with:

```ts
  const { geometry, material, classes } = useMemo(() => {
```

Replace L46-57:

```ts
    const atlasUV = new Float32Array(n * 4);
    const atlasIdx = new Float32Array(n);
    const clusterIds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const slot = atlasSlot(i);
      atlasUV[i * 4 + 0] = slot.u;
      atlasUV[i * 4 + 1] = slot.v;
      atlasUV[i * 4 + 2] = slot.size;
      atlasUV[i * 4 + 3] = slot.size;
      atlasIdx[i] = slot.sheet;
      clusterIds[i] = data.albums[i].k;
    }
```

with:

```ts
    const atlasUV = new Float32Array(n * 4);
    const atlasIdx = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const slot = atlasSlot(i);
      atlasUV[i * 4 + 0] = slot.u;
      atlasUV[i * 4 + 1] = slot.v;
      atlasUV[i * 4 + 2] = slot.size;
      atlasUV[i * 4 + 3] = slot.size;
      atlasIdx[i] = slot.sheet;
    }
    // Star size and brightness: this page load's one random deal (state/stars.ts), the same array however
    // often this geometry is rebuilt. White, with no under-disc, until the theme data arrives (the effect
    // below fills tint and gas).
    const classes = pageStarClasses(n);
    const stars = buildStarAttributes(classes, null);
```

Replace L64:

```ts
    pointsGeom.setAttribute("a_clusterId", new THREE.InstancedBufferAttribute(clusterIds, 1));
```

with:

```ts
    pointsGeom.setAttribute("a_star", new THREE.InstancedBufferAttribute(stars.star, 4));
    pointsGeom.setAttribute("a_tint", new THREE.InstancedBufferAttribute(stars.tint, 3, true));
    pointsGeom.setAttribute("a_bg", new THREE.InstancedBufferAttribute(stars.bg, 3, true));
```

Replace L70-78:

```ts
      transparent: true,
      // Depth carries the focus/hover draw-order layers (see `layer` in the
      // vertex shader). Three's default depthFunc is LessEqual, so sprites
      // in the same layer still draw in plain instance order; the fragment
      // shader discards outside the disc, so the sprite quad's corners never
      // write depth.
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
```

with:

```ts
      transparent: true,
      // The fragment shader writes premultiplied colour: a star adds its light and darkens with its
      // under-disc in one fragment (rgb = light, a = under-disc), a cover is ordinary alpha (rgb * a, a).
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      // Depth carries the focus/hover draw-order layers (see `layer` in the
      // vertex shader). Three's default depthFunc is LessEqual, so sprites
      // in the same layer still draw in plain instance order. Only layer-0
      // sprites have a glow; an elevated sprite keeps its own shape and
      // discards the rest, so its quad never writes depth over a neighbour.
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
```

Delete L98:

```ts
        u_clusterColors: { value: CLUSTER_RGB.map((c) => new THREE.Vector3(...c)) },
```

Replace L101:

```ts
    return { geometry: pointsGeom, material: mat };
```

with:

```ts
    return { geometry: pointsGeom, material: mat, classes };
```

`u_selDim: { value: SELECTION_DIM }` (L88) and `u_focusDim: { value: FOCUS_DIM }` (L91) stay as they are, and so does `const FOCUS_DIM = 0.45;` (L26): they are the see-through factors of item 2 above.

After the "Push texture changes into uniforms" effect (it ends at L133 with `}, [atlasTextures, material, invalidate]);`) add:

```ts
  // The theme data arrives after the albums (or not at all): rewrite the tint and gas attributes in place.
  // The star sizes are not touched: they were dealt once for this page load.
  useEffect(() => {
    const stars = buildStarAttributes(classes, theme);
    const tint = geometry.getAttribute("a_tint") as THREE.InstancedBufferAttribute;
    const bg = geometry.getAttribute("a_bg") as THREE.InstancedBufferAttribute;
    (tint.array as Uint8Array).set(stars.tint);
    (bg.array as Uint8Array).set(stars.bg);
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    tint.needsUpdate = true;
    bg.needsUpdate = true;
    invalidate();
  }, [theme, classes, geometry, invalidate]);
```

- [ ] **Step 8: Typecheck, lint and run the unit tests**

Run, one at a time:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test)
```

Expected: typecheck clean (no remaining reference to `CLUSTER_RGB`, `hexToRgb` in `data.ts`, or `u_clusterColors`). Lint clean; if lint reports `react-hooks/immutability` on `bg.needsUpdate = true`, add the same `// eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design` line above it. All unit tests pass, `AlbumField.stars.test.ts` included (4 tests).

Then the browser checks that now see stars over part 1's gas, one at a time:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/gas.spec.ts e2e/map.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/gas.spec.ts e2e/map.spec.ts --project=phone --workers=1)
```

Expected: all pass as they did after part 1 (`gas.spec.ts` forces the full gas shader itself). Its tests read the gas between the albums; the stars' glow is light added beside each album, so a test that now fails on a luminance reading is reporting that the stars changed what part 1 measured. Do not loosen it: print the patch, look at it, and report to the orchestrator. The one known candidate is the registration test, which samples bare map at least 7 px from every album; from the Overview scale on, the 1 percent brightest stars' bloom reaches about 18 px (2.8 px radius times a reach of 6, plus 1).

- [ ] **Step 9: Commit**

```bash
git add frontcreck/src/components/map/shaders/album.ts frontcreck/src/components/map/shaders/album.test.ts frontcreck/src/components/map/canvas/AlbumField.tsx frontcreck/src/components/map/canvas/AlbumField.stars.test.ts frontcreck/src/components/map/data.ts frontcreck/src/components/album/MapPreviewStrip.tsx
git commit -m "feat(map): draw albums as Trifid stars in the one instanced draw

Premultiplied output with custom blending: star light adds, the under-disc
darkens, covers blend as before: the tinted cross-fade tiles and the
see-through stepping back are kept. Star sizes come from the page load's
random deal. Elevated sprites have no
glow, so depth layers survive the wider quads. CLUSTER_RGB is removed.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

- [ ] **Step 10: Show the owner the cross-fade tiles before Task 9 closes**

The tile colour of the cross-fade band is now the album's star colour (a ruling made on the owner's behalf; the handoff asks that he sees it first). Build and capture the dense cover states of this commit with the baseline's script (full gas shader by default; `--still` does not exist yet, so the star sizes are one random deal, which does not matter at cover zoom), into a folder that is not committed:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch; cd frontcreck && npm run build && node ../docs/design/trifid-theme/reviews/baseline/capture.mjs test-results/tiles-task2 http://127.0.0.1:3400 --start --viewport desktop --only map-dense && node ../docs/design/trifid-theme/reviews/baseline/capture.mjs test-results/tiles-task2 http://127.0.0.1:3400 --start --viewport desktop --only retina-crops)
```

Open `test-results/tiles-task2/desktop/map-covers-dense-fade-crop.png` and its `retina-` version beside `docs/design/trifid-theme/reviews/baseline/shots/desktop/` of the same names (Read tool), check the band still reads as soft, tinted, slightly see-through tiles, and show the pairs to the owner with one question: are the paler tiles (star colour where the cluster colour was) all right. Tasks 3 to 8 do not depend on his answer and go on meanwhile; Task 9 does not close before it. If he does not like them, stop and report to the orchestrator: the tile colour is a design decision, not a speed fallback. Record his answer in `docs/design/trifid-theme/HANDOFF.md` only once he has given it.

**Existing end-to-end checks this task breaks (part 3 updates them; do not edit them here):**
- `e2e/explore.spec.ts` "in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed" (L295-328) is already red since part 1 (its `meanLuma` against `PANE_LUMA = 19`, L318-327, sees gas behind the covers now; the handoff lists it as red on purpose until part 3 Task 7). This task adds a second reason: `isLamp` (L75) at L309, because the picked cover's frame is now `FRAME_RGB` (241, 236, 228), not lamp amber. Other covers still fade to half alpha while a pick lasts, as today.

---

### Task 3: Cover layout that keeps covers off the lines

**Files:**
- Modify: `frontcreck/src/components/map/state/focusLayout.ts` (L7-8 constants, L38-42 options, L52-145 `layoutMarkers`)
- Test: `frontcreck/src/components/map/state/focusLayout.test.ts` (import L2; new `describe` blocks after L82)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export const SEED_FRAME_PX = 4;      // the seed's drawn frame reaches this far past its cover
  export const REC_FRAME_PX = 1;       // a recommendation's hairline
  export const HOT_FRAME_PX = 3;       // a hot recommendation's ring and casing
  export const MIN_LINE_PX = 24;       // least visible length of a line between two frames
  export const LINE_CLEAR_PX = 6;      // least gap between a cover and another cover's line
  export const MIN_LINE_ANGLE = 0.2;   // radians between two lines leaving the seed
  export interface LayoutOptions { bounds?: MarkerBounds; gap?: number; minLine?: number }
  export function edgePoint(x0: number, y0: number, x1: number, y1: number, half: number): [number, number];
  export function layoutMarkers(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options?: LayoutOptions): MarkerItem[];
  ```
  `layoutMarkers` keeps its signature. Without `bounds` the seed never moves. With `bounds` the group is shifted inside them as before, so the seed moves only when the bounds force it.

The rules are the prototype's `Focus.layout` (`docs/design/trifid-theme/prototype/src/focus.js` L15-69): after the ring and the box separation, every line shows at least 24 px between the two frames, every cover stays 6 px clear of every other cover's line, and two lines leave the seed at least 0.2 rad apart, relaxed together for up to 600 rounds. The app's bounds handling (shift the group, hold at the walls, separate again) is kept around it, so a pile in a corner still ends inside the bounds with no overlaps.

**What stays from today's marker layout** (`state/focusLayout.ts` L52-145 as it is before this task; the owner values it and it must not regress):
- Recommendations closer to the seed than the ring radius go onto a ring round it, a pile on one spot fanned out evenly from the top (L61-79). Kept line for line.
- Two cover boxes are never closer than `MARKER_GAP` (10 px): overlapping boxes are pushed apart along the axis of least overlap, half each (L93-118). Kept as `separateOnce`.
- With bounds, the laid-out group is first shifted inside them as a whole, and only a marker still outside is held at the wall, passing its share of a push to the other one (L120-143). Kept.
- A moved cover keeps a leader back to its album's true position (drawn by `MarkerDriver`; Task 4 keeps it).
- `ringRadius`, `markerAt`, `focusCamera`, `MARKER_SIZE` and the hot scale of 1.16 are untouched.
- One effect of the new rules on framing, to be looked at and not hidden: `focusCamera` sizes its fit from `layoutMarkers`, and a cover now sits at least 84 px from the seed (up to 109 px on a diagonal) where today's ring is 77 px. The boxes it fits are a little wider, so an open album can be framed slightly further out than today. Task 9 step 9 compares `album-open` and `album-open-dense` with the baseline for this by name. Part 3's framing record (`e2e/framing.spec.ts`) is taken after this task, so it does not see the difference.
- `MarkerDriver` calls `layoutMarkers` on every drawn frame while an album is open, as today. The new passes cost more per call than today's. The perf script's transition and morph rows are measured on an album page, so they show it; if either median is worse than the baseline's worst run and the names and stars are ruled out (Task 9 step 7), the cheaper version is to keep the last layout while the anchors have not moved by more than half a pixel (compare the anchors in `MarkerDriver` before calling `layoutMarkers`), taken without asking.

The existing tests of `focusLayout.test.ts` (the `layoutMarkers`, `ringRadius`, `focusCamera` and `markerAt` blocks) are not edited and must pass unchanged; this task only adds tests. One behaviour changes on purpose: without bounds the seed no longer moves at all (today it takes a 0.2 share of each push), so the seed cover sits exactly on its album; when the bounds force it, it still gives way with the same 0.2 share.

- [ ] **Step 1: Write the failing tests**

In `frontcreck/src/components/map/state/focusLayout.test.ts`, replace L2:

```ts
import { MARKER_GAP, MARKER_SIZE, focusCamera, layoutMarkers, markerAt, ringRadius, type MarkerBounds, type MarkerItem } from './focusLayout';
```

with:

```ts
import {
  LINE_CLEAR_PX,
  MARKER_GAP,
  MARKER_SIZE,
  MIN_LINE_ANGLE,
  MIN_LINE_PX,
  REC_FRAME_PX,
  SEED_FRAME_PX,
  edgePoint,
  focusCamera,
  layoutMarkers,
  markerAt,
  ringRadius,
  type MarkerBounds,
  type MarkerItem,
} from './focusLayout';
```

After the `outside` helper (L18) add the port of the prototype's `Focus.check`:

```ts
type Pt = [number, number];

/** Exact distance from segment ab to a square of half size h centred on (cx, cy). */
function segRect(a: Pt, b: Pt, cx: number, cy: number, h: number): number {
  const inside = (p: Pt) => Math.abs(p[0] - cx) <= h && Math.abs(p[1] - cy) <= h;
  if (inside(a) || inside(b)) return 0;
  const ptSeg = (px: number, py: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l));
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  };
  const ptRect = (p: Pt) => Math.hypot(Math.max(Math.abs(p[0] - cx) - h, 0), Math.max(Math.abs(p[1] - cy) - h, 0));
  const cross = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (!d) return false;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const c: Pt[] = [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
  for (let i = 0; i < 4; i++) if (cross(a, b, c[i], c[(i + 1) % 4])) return 0;
  return Math.min(ptRect(a), ptRect(b), ...c.map((p) => ptSeg(p[0], p[1])));
}

/** The prototype's Focus.check: a finding for every line shorter than 24 px, cover within 6 px of another
 * cover's line, pair of lines closer than 0.2 rad, and pair of overlapping covers. Empty when the layout is clean. */
function findings(items: MarkerItem[]): string[] {
  const out: string[] = [];
  if (items.length < 2) return out;
  const s = items[0];
  const recs = items.slice(1);
  const seg = new Map<number, [Pt, Pt]>();
  for (const it of recs) seg.set(it.rank, [edgePoint(s.x, s.y, it.x, it.y, s.size / 2 + SEED_FRAME_PX), edgePoint(it.x, it.y, s.x, s.y, it.size / 2 + REC_FRAME_PX)]);
  for (const it of recs) {
    const [a, b] = seg.get(it.rank)!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < MIN_LINE_PX - 0.6) out.push(`short ${it.rank}: ${len.toFixed(1)} px`);
    for (const o of recs) {
      if (o === it) continue;
      const [oa, ob] = seg.get(o.rank)!;
      const d = segRect(oa, ob, it.x, it.y, it.size / 2 + REC_FRAME_PX);
      if (d < LINE_CLEAR_PX - 0.6) out.push(`near ${it.rank} to line ${o.rank}: ${d.toFixed(1)} px`);
      if (o.rank > it.rank) {
        let g = Math.atan2(o.y - s.y, o.x - s.x) - Math.atan2(it.y - s.y, it.x - s.x);
        while (g > Math.PI) g -= 2 * Math.PI;
        while (g < -Math.PI) g += 2 * Math.PI;
        if (Math.abs(g) < MIN_LINE_ANGLE - 0.02) out.push(`angle ${it.rank} and ${o.rank}: ${Math.abs(g).toFixed(3)} rad`);
      }
    }
    for (const o of items) {
      if (o !== it && Math.abs(o.x - it.x) < (o.size + it.size) / 2 + 2 && Math.abs(o.y - it.y) < (o.size + it.size) / 2 + 2) out.push(`overlap ${it.rank} with ${o.rank}`);
    }
  }
  return out;
}

/** Deterministic random numbers in 0..1. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
```

After the `describe('layoutMarkers', ...)` block (it closes on L82) add:

```ts
describe('edgePoint', () => {
  it('is where the line towards a point leaves a square', () => {
    expect(edgePoint(0, 0, 100, 0, 36)).toEqual([36, 0]);
    expect(edgePoint(0, 0, 0, -50, 24)).toEqual([0, -24]);
    const [x, y] = edgePoint(10, 10, 110, 60, 20);
    expect(x).toBeCloseTo(30, 6);
    expect(y).toBeCloseTo(20, 6);
  });

  it('does not divide by zero for two points on the same spot', () => {
    for (const v of edgePoint(5, 5, 5, 5, 20)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('layoutMarkers keeps covers off the lines (prototype Focus.check)', () => {
  it('leaves no finding in random clusters of one, two, five and ten recommendations', () => {
    for (const n of [1, 2, 5, 10]) {
      const rand = lcg(11 + n);
      for (let t = 0; t < 300; t++) {
        const spread = 40 + rand() * 500;
        const anchors = Array.from({ length: n + 1 }, (_, i) => ({ id: i, x: 600 + (i ? (rand() - 0.5) * spread : 0), y: 400 + (i ? (rand() - 0.5) * spread : 0) }));
        expect(findings(layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec)), `${n} recs, round ${t}`).toEqual([]);
      }
    }
  });

  it('leaves no finding in a pile of eleven on one spot', () => {
    const pile = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300, y: 300 }));
    expect(findings(layoutMarkers(pile, MARKER_SIZE.seed, MARKER_SIZE.rec))).toEqual([]);
  });

  it('never moves the seed when there are no bounds', () => {
    const rand = lcg(5);
    for (let t = 0; t < 100; t++) {
      const anchors = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300 + rand() * 80, y: 300 + rand() * 80 }));
      const out = layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec);
      expect([out[0].x, out[0].y]).toEqual([anchors[0].x, anchors[0].y]);
    }
  });

  it('lays out a seed alone and a seed with one recommendation', () => {
    expect(layoutMarkers([{ id: 4, x: 50, y: 60 }], 64, 46).map((m) => [m.x, m.y])).toEqual([[50, 60]]);
    const two = layoutMarkers([{ id: 0, x: 100, y: 100 }, { id: 1, x: 104, y: 100 }], 64, 46);
    expect(two.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y))).toBe(true);
    expect(findings(two)).toEqual([]);
  });

  it('fans out recommendations that all sit on one side of the seed', () => {
    for (const n of [5, 10]) {
      const rand = lcg(99 + n);
      for (let t = 0; t < 200; t++) {
        const anchors = [{ id: 0, x: 300, y: 300 }, ...Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 420 + rand() * 300, y: 300 + (rand() - 0.5) * 30 }))];
        expect(findings(layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec)), `${n} recs, round ${t}`).toEqual([]);
      }
    }
    const row = [{ id: 0, x: 300, y: 300 }, ...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, x: 420 + 40 * i, y: 300 }))];
    expect(findings(layoutMarkers(row, MARKER_SIZE.seed, MARKER_SIZE.rec))).toEqual([]);
  });

  it('takes a shorter minimum line for small markers', () => {
    const pile = Array.from({ length: 6 }, (_, i) => ({ id: i, x: 195, y: 86 }));
    const loose = layoutMarkers(pile, 38, 28, { gap: 8 });
    const tight = layoutMarkers(pile, 38, 28, { gap: 8, minLine: 10 });
    const reach = (items: MarkerItem[]) => Math.max(...items.map((m) => Math.hypot(m.x - items[0].x, m.y - items[0].y)));
    expect(reach(tight)).toBeLessThan(reach(loose));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/focusLayout.test.ts)`
Expected: FAIL. The new blocks fail on the missing exports (`edgePoint is not a function`); the older tests still pass.

- [ ] **Step 3: Write the implementation**

In `frontcreck/src/components/map/state/focusLayout.ts`, after L8 (`export const MARKER_GAP = 10;`) add:

```ts
/** How far a marker's drawn frame reaches past its cover (styles/map.css): the seed's dark gap and ring, a
 * recommendation's hairline, a hot recommendation's ring and casing. Lines end on the frame's edge. */
export const SEED_FRAME_PX = 4;
export const REC_FRAME_PX = 1;
export const HOT_FRAME_PX = 3;
/** Least length of a line that shows between the seed's frame and its recommendation's frame. */
export const MIN_LINE_PX = 24;
/** Least gap between a cover and any other cover's line. */
export const LINE_CLEAR_PX = 6;
/** Least angle, in radians, between two lines leaving the seed. */
export const MIN_LINE_ANGLE = 0.2;
```

Replace the `LayoutOptions` interface (L38-42) with:

```ts
export interface LayoutOptions {
  bounds?: MarkerBounds;
  /** Minimum space between two marker boxes; defaults to MARKER_GAP (the preview strip uses a smaller one). */
  gap?: number;
  /** Least visible length of a line; defaults to MIN_LINE_PX (the preview strip uses a shorter one). */
  minLine?: number;
}
```

Replace everything from the `layoutMarkers` doc comment (L52) through the closing brace of `layoutMarkers` (L145) with:

```ts
/** Where the line from (x0, y0) towards (x1, y1) leaves a square of half size `half` centred on (x0, y0). */
export function edgePoint(x0: number, y0: number, x1: number, y1: number, half: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  const k = half / (Math.max(Math.abs(dx), Math.abs(dy)) / d || 1);
  return [x0 + (dx / d) * k, y0 + (dy / d) * k];
}

/** anchors[0] is the seed. Recommendations too close to the seed go to a ring around it. Then four rules are
 * relaxed together, for up to 600 rounds (the prototype's Focus.layout): boxes stay `gap` apart, pushed along
 * the axis of least overlap; every line shows at least `minLine` px between the two frames; every cover stays
 * LINE_CLEAR_PX clear of every other cover's line; two lines leave the seed at least MIN_LINE_ANGLE apart.
 * Without `bounds` the seed never moves. With `bounds`, the laid-out group is shifted inside them as a whole
 * (which keeps every rule), and only if a marker is still outside is it held at the wall and the rules relaxed
 * again inside the walls, ending with a plain box separation so that the result has no overlaps. */
export function layoutMarkers(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options: LayoutOptions = {}): MarkerItem[] {
  const gap = options.gap ?? MARKER_GAP;
  const minLine = options.minLine ?? MIN_LINE_PX;
  const bounds = options.bounds ?? null;
  const items: MarkerItem[] = anchors.map((a, n) => ({ id: a.id, rank: n, ax: a.x, ay: a.y, x: a.x, y: a.y, size: n === 0 ? seedSize : recSize, seed: n === 0 }));
  if (items.length === 0) return items;
  const s0 = items[0];
  const recs = items.length - 1;
  if (recs > 0) {
    const ring = ringRadius(recs, s0.size, recSize);
    items.slice(1).forEach((it, n) => {
      let dx = it.ax - s0.ax;
      let dy = it.ay - s0.ay;
      let d = Math.hypot(dx, dy);
      if (d >= ring) return;
      if (d < 3) {
        const a = -Math.PI / 2 + (n * Math.PI * 2) / recs;
        dx = Math.cos(a);
        dy = Math.sin(a);
        d = 1;
      }
      it.x = s0.ax + (dx / d) * ring;
      it.y = s0.ay + (dy / d) * ring;
    });
  }

  const range = (it: MarkerItem, axis: Axis, walls: boolean): [number, number] => {
    if (!walls || !bounds) return [-Infinity, Infinity];
    const h = it.size / 2;
    return axis === 'x' ? [bounds.left + h, bounds.right - h] : [bounds.top + h, bounds.bottom - h];
  };
  /** Moves `it` by `d` along `axis`, held by the walls when `walls`; returns how far it actually moved. */
  const moveBy = (it: MarkerItem, axis: Axis, d: number, walls: boolean): number => {
    const [lo, hi] = range(it, axis, walls);
    const before = it[axis];
    it[axis] = Math.min(Math.max(before + d, lo), hi);
    return it[axis] - before;
  };
  const moveTo = (it: MarkerItem, x: number, y: number, walls: boolean): void => {
    moveBy(it, 'x', x - it.x, walls);
    moveBy(it, 'y', y - it.y, walls);
  };

  /** One round of box separation. `seedWeight` is the seed's share of a push: 0 keeps it where it is. */
  const separateOnce = (walls: boolean, seedWeight: number): boolean => {
    let moved = false;
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const p = items[a];
        const q = items[b];
        const need = (p.size + q.size) / 2 + gap;
        const ox = need - Math.abs(q.x - p.x);
        const oy = need - Math.abs(q.y - p.y);
        if (ox <= 0 || oy <= 0) continue;
        const axis: Axis = ox < oy ? 'x' : 'y';
        const d = q[axis] - p[axis];
        const sign = d === 0 ? (b % 2 ? 1 : -1) : Math.sign(d);
        const total = (axis === 'x' ? ox : oy) + 0.5;
        const wp = p.seed ? seedWeight : 0.5;
        const wq = q.seed ? seedWeight : 0.5;
        const movedP = -sign * moveBy(p, axis, (-sign * total * wp) / (wp + wq), walls);
        const movedQ = sign * moveBy(q, axis, sign * (total - movedP), walls);
        if (movedP + movedQ < total) moveBy(p, axis, -sign * (total - movedP - movedQ), walls);
        moved = true;
      }
    }
    return moved;
  };

  /** One round of the three line rules; the seed is never moved by them. */
  const linesOnce = (walls: boolean): boolean => {
    let moved = false;
    const seedHalf = s0.size / 2 + SEED_FRAME_PX;
    for (let a = 1; a < items.length; a++) {
      const it = items[a];
      // Enough line between the two frames.
      const dx = it.x - s0.x;
      const dy = it.y - s0.y;
      const d = Math.hypot(dx, dy) || 1;
      const need = (seedHalf + it.size / 2 + REC_FRAME_PX) / (Math.max(Math.abs(dx), Math.abs(dy)) / d || 1) + minLine;
      if (d < need - 0.5) {
        moveTo(it, s0.x + (dx / d) * need, s0.y + (dy / d) * need, walls);
        moved = true;
      }
      // Sideways off every other recommendation's line.
      for (let b = 1; b < items.length; b++) {
        if (b === a) continue;
        const o = items[b];
        const lx = o.x - s0.x;
        const ly = o.y - s0.y;
        const len = Math.hypot(lx, ly) || 1;
        const ux = lx / len;
        const uy = ly / len;
        const t = (it.x - s0.x) * ux + (it.y - s0.y) * uy;
        if (t <= 0 || t >= len) continue;
        const perp = (it.x - s0.x) * -uy + (it.y - s0.y) * ux;
        const reach = (it.size / 2 + REC_FRAME_PX) * (Math.abs(ux) + Math.abs(uy)) + LINE_CLEAR_PX;
        if (Math.abs(perp) >= reach) continue;
        const push = (reach - Math.abs(perp) + 0.5) * (perp === 0 ? (a % 2 ? 1 : -1) : Math.sign(perp));
        moveTo(it, it.x - uy * push, it.y + ux * push, walls);
        moved = true;
      }
    }
    // Two lines must not leave the seed in nearly the same direction: both turn, half each, about the seed.
    for (let a = 1; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const p = items[a];
        const q = items[b];
        const ap = Math.atan2(p.y - s0.y, p.x - s0.x);
        const aq = Math.atan2(q.y - s0.y, q.x - s0.x);
        let d = aq - ap;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) >= MIN_LINE_ANGLE) continue;
        const half = ((MIN_LINE_ANGLE - Math.abs(d) + 0.02) / 2) * (d >= 0 ? 1 : -1);
        for (const [it, ang] of [[p, ap - half], [q, aq + half]] as const) {
          const r = Math.hypot(it.x - s0.x, it.y - s0.y);
          moveTo(it, s0.x + Math.cos(ang) * r, s0.y + Math.sin(ang) * r, walls);
        }
        moved = true;
      }
    }
    return moved;
  };

  const relax = (walls: boolean, seedWeight: number): void => {
    for (let iter = 0; iter < 600; iter++) {
      const boxes = separateOnce(walls, seedWeight);
      const lines = linesOnce(walls);
      if (!boxes && !lines) return;
    }
  };

  relax(false, 0);
  if (bounds) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const it of items) {
      const h = it.size / 2;
      x0 = Math.min(x0, it.x - h);
      x1 = Math.max(x1, it.x + h);
      y0 = Math.min(y0, it.y - h);
      y1 = Math.max(y1, it.y + h);
    }
    const shift = (lo: number, hi: number, min: number, max: number) => (hi - lo > max - min ? 0 : lo < min ? min - lo : hi > max ? max - hi : 0);
    const sx = shift(x0, x1, bounds.left, bounds.right);
    const sy = shift(y0, y1, bounds.top, bounds.bottom);
    let held = false;
    for (const it of items) {
      it.x += sx;
      it.y += sy;
      if (moveBy(it, 'x', 0, true) !== 0) held = true;
      if (moveBy(it, 'y', 0, true) !== 0) held = true;
    }
    if (held) {
      // The group does not fit: relax inside the walls (the seed gives way a little, as before), then make
      // sure no boxes overlap, whatever the line rules could not reach.
      relax(true, 0.2);
      for (let iter = 0; iter < 300; iter++) if (!separateOnce(true, 0.2)) break;
    }
  }
  return items;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/focusLayout.test.ts)`
Expected: PASS, every test, including the older `layoutMarkers`, `ringRadius`, `focusCamera` and `markerAt` blocks unchanged. (This algorithm was run against all of these cases while the plan was written: no findings, no overlaps, nothing outside the bounds.)

- [ ] **Step 5: Typecheck and commit**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)`
Expected: clean.

```bash
git add frontcreck/src/components/map/state/focusLayout.ts frontcreck/src/components/map/state/focusLayout.test.ts
git commit -m "feat(map): cover layout keeps covers off the focus lines

Ports the prototype's rules into layoutMarkers: 24 px of every line
visible, 6 px clearance from other lines, 0.2 rad between lines. The seed
no longer moves unless the bounds force it.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

---

### Task 4: White cased lines, frames and badges

**Files:**
- Modify: `frontcreck/src/components/map/overlays/FocusMarkers.tsx` (L34-41, the `<svg>`)
- Modify: `frontcreck/src/components/map/canvas/MarkerDriver.tsx` (L6, L17-18, L76-90)
- Modify: `frontcreck/src/styles/map.css` (L72-95)
- Test: `frontcreck/e2e/focus.spec.ts` (L42 and L73-90, check (d))

**Interfaces:**
- Consumes: `edgePoint`, `SEED_FRAME_PX`, `REC_FRAME_PX`, `HOT_FRAME_PX` (Task 3); tokens `--color-lamp` (off-white `#f1ece4`) and `--color-room` (`#07060a`) from part 3.
- Produces: DOM contract for the lines: `svg.mk-lines > g.mk-case` (all casings) before `g.mk-core` (all cores). Core lines keep `line[data-to="<id>"]` and `line[data-leader="<id>"]`; casings are `line[data-case="<id>"]` and `line[data-leader-case="<id>"]`. `data-hot="true"` is set on a hot recommendation's casing and core.

Small restyles that come with the cased lines, so the regression reviewer does not read them as lost: the badge sits 7 px out where it sat 6 (`BADGE_OFFSET`); the cover's hard drop shadow (`1px 3px 0`) becomes a soft one on the marker (`0 4px 14px`); the hot ring sits flush with the cover's frame (`inset: -2px`) where it stood 2 px off it (`inset: -4px`); the gap inside the seed ring is filled dark. All four follow the prototype's markers and go on part 3's list of things changed on purpose (its Task 10); the fidelity reviewer checks them against `final-album.jpg`.

The per-album accent `--acc` is no longer used on the map: seed and hot rings and the hot badge use the lamp token. Until part 3 changes the token values the rings show in the old amber; that is expected between the parts.

**What stays, untouched by this task:** the hover tip beside a hovered marker and its placement inside the visible map (`MarkerDriver.tsx` L91-104), the hot scale of 1.16 and the edge margin (L12-14), the badges in their own layer above every cover, the markers taking no pointer events (the canvas hit-tests their boxes, so a drag or pinch that starts on a cover still pans or zooms), the leader from a moved cover to its album's true position, and the cover fade of the DOM covers (`components/Cover.tsx`, not edited). The selected ring `.map-sel` (`styles/map.css` L17-18) is not in the block this task replaces and is not edited; part 3 gives it its dark casing.

**Acceptance item inherited from part 1** (handoff of 2026-10-05): the neighbour lines beside an open album were nearly invisible on the cream gas with today's thin grey lines (`album-app.jpg`, `album-bright-app.jpg` in `docs/design/trifid-theme/reviews/app-fidelity-part1-independent.md`). This task's review checks them again on the brightest cream gas: capture `album-open` with `capture.mjs` (full gas shader by default) after step 7 and look at the lines where they cross the brightest gas; they must read as white lines on a dark edge, as in `final-album.jpg`.

**Check (d) of `e2e/focus.spec.ts` is rewritten, not loosened.** Before, it proved that each line joins the two cover centres within 2 px. The lines now end on the frames, so it proves instead that each line lies on the straight line through the two centres within 1.5 px (tighter than before), that it starts on the seed's frame and ends on its cover's frame within 1.5 px, and that at least 23 px of it shows. Checks (a), (b) and (c) are not edited.

- [ ] **Step 1: Write the failing end-to-end check**

In `frontcreck/e2e/focus.spec.ts`, after L42 (`await expect(page.locator('svg.mk-lines line[data-to]')).toHaveCount(5);`) add:

```ts
  // Every line is a dark casing under a white core, and all casings are drawn below all cores.
  await expect(page.locator('svg.mk-lines g.mk-case line[data-case]')).toHaveCount(5);
  expect(await page.locator('svg.mk-lines > g').evaluateAll((gs) => gs.map((g) => g.getAttribute('class')))).toEqual(['mk-case', 'mk-core']);
```

Replace check (d), from the comment on L73 through the closing brace of its `for` loop on L90:

```ts
  // (d) each line runs from the seed cover's centre to its recommendation's cover centre
  const lines = await page.locator('svg.mk-lines line[data-to]').evaluateAll((els) => {
    const svg = (els[0] as SVGLineElement).ownerSVGElement!.getBoundingClientRect();
    return els.map((l) => ({
      to: Number(l.getAttribute('data-to')),
      x1: svg.left + Number(l.getAttribute('x1')),
      y1: svg.top + Number(l.getAttribute('y1')),
      x2: svg.left + Number(l.getAttribute('x2')),
      y2: svg.top + Number(l.getAttribute('y2')),
    }));
  });
  for (const l of lines) {
    const end = boxes.find((b) => b.id === l.to)!;
    expect(Math.abs(l.x1 - seed.cx), `line ${l.to} x1`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.y1 - seed.cy), `line ${l.to} y1`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.x2 - end.cx), `line ${l.to} x2`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.y2 - end.cy), `line ${l.to} y2`).toBeLessThanOrEqual(2);
  }
```

with:

```ts
  // (d) each line runs from the edge of the seed's frame (4 px outside its cover) to the edge of its
  // recommendation's frame (1 px outside), along the straight line between the two centres, and at least
  // 24 px of it shows.
  const lines = await page.locator('svg.mk-lines line[data-to]').evaluateAll((els) => {
    const svg = (els[0] as SVGLineElement).ownerSVGElement!.getBoundingClientRect();
    return els.map((l) => ({
      to: Number(l.getAttribute('data-to')),
      x1: svg.left + Number(l.getAttribute('x1')),
      y1: svg.top + Number(l.getAttribute('y1')),
      x2: svg.left + Number(l.getAttribute('x2')),
      y2: svg.top + Number(l.getAttribute('y2')),
    }));
  });
  const cheb = (x: number, y: number, b: { cx: number; cy: number }) => Math.max(Math.abs(x - b.cx), Math.abs(y - b.cy));
  for (const l of lines) {
    const end = boxes.find((b) => b.id === l.to)!;
    expect(Math.abs(cheb(l.x1, l.y1, seed) - (seed.w / 2 + 4)), `line ${l.to} starts on the seed frame`).toBeLessThanOrEqual(1.5);
    expect(Math.abs(cheb(l.x2, l.y2, end) - (end.w / 2 + 1)), `line ${l.to} ends on its cover's frame`).toBeLessThanOrEqual(1.5);
    // Collinear with the two centres: the cross product of (end - seed) and (point - seed) is near zero.
    const dx = end.cx - seed.cx;
    const dy = end.cy - seed.cy;
    const len = Math.hypot(dx, dy);
    for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) expect(Math.abs(dx * (y - seed.cy) - dy * (x - seed.cx)) / len, `line ${l.to} aims at the centres`).toBeLessThanOrEqual(1.5);
    expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), `line ${l.to} shows`).toBeGreaterThanOrEqual(23);
  }
```

Check that `boxes` in that test carries `w`, `cx`, `cy` and `id` (it does: L62-64 use `boxes[a].w`, `.cx`, `.cy`, `.id`).

- [ ] **Step 2: Run it to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/focus.spec.ts --project=desktop -g "numbered covers" --workers=1)`
Expected: FAIL at `g.mk-case line[data-case]` (count 0).

- [ ] **Step 3: Render the casing and core groups**

In `frontcreck/src/components/map/overlays/FocusMarkers.tsx`, replace the `<svg>` element (L34-41):

```tsx
      <svg className="mk-lines" ref={(el) => { setOverlayEl('lines', el); }}>
        {focus.recs.map((id) => (
          <line key={`to-${id}`} data-to={id} data-hot={isHot(id) ? 'true' : undefined} />
        ))}
        {ids.map((id) => (
          <line key={`leader-${id}`} data-leader={id} style={{ display: 'none' }} />
        ))}
      </svg>
```

with:

```tsx
      <svg className="mk-lines" ref={(el) => { setOverlayEl('lines', el); }}>
        {/* Every dark casing first, then every white core, so no casing ever crosses a core. */}
        <g className="mk-case">
          {focus.recs.map((id) => (
            <line key={`case-${id}`} data-case={id} data-hot={isHot(id) ? 'true' : undefined} />
          ))}
          {ids.map((id) => (
            <line key={`leader-case-${id}`} data-leader-case={id} style={{ display: 'none' }} />
          ))}
        </g>
        <g className="mk-core">
          {focus.recs.map((id) => (
            <line key={`to-${id}`} data-to={id} data-hot={isHot(id) ? 'true' : undefined} />
          ))}
          {ids.map((id) => (
            <line key={`leader-${id}`} data-leader={id} style={{ display: 'none' }} />
          ))}
        </g>
      </svg>
```

- [ ] **Step 4: Place the lines from frame edge to frame edge**

In `frontcreck/src/components/map/canvas/MarkerDriver.tsx`, replace L6:

```ts
import { MARKER_SIZE, layoutMarkers, type PlacedMarker } from '../state/focusLayout';
```

with:

```ts
import { HOT_FRAME_PX, MARKER_SIZE, REC_FRAME_PX, SEED_FRAME_PX, edgePoint, layoutMarkers, type PlacedMarker } from '../state/focusLayout';
```

Replace L17-18:

```ts
/** Rank badge offset from the cover's top-left corner (mockup: 6 px up and left). */
const BADGE_OFFSET = 6;
```

with:

```ts
/** Rank badge offset from the cover's top-left corner (prototype: 0.4 of the 18 px badge, up and left). */
const BADGE_OFFSET = 7;
```

Replace L76-90:

```ts
    const svg = getOverlayEl<SVGSVGElement>('lines');
    if (svg && placed.length) {
      const seed = placed[0];
      const byId = new Map(placed.map((p) => [p.id, p]));
      svg.querySelectorAll<SVGLineElement>('line[data-to]').forEach((l) => {
        const it = byId.get(Number(l.dataset.to));
        if (it) setLine(l, seed.x, seed.y, it.x, it.y);
      });
      svg.querySelectorAll<SVGLineElement>('line[data-leader]').forEach((l) => {
        const it = byId.get(Number(l.dataset.leader));
        const show = !!it && Math.hypot(it.x - it.ax, it.y - it.ay) > LEADER_MIN_PX;
        l.style.display = show ? '' : 'none';
        if (show && it) setLine(l, it.ax, it.ay, it.x, it.y);
      });
    }
```

with:

```ts
    const svg = getOverlayEl<SVGSVGElement>('lines');
    if (svg && drawn.length) {
      const seed = drawn[0];
      const byId = new Map(drawn.map((p) => [p.id, p]));
      const seedHalf = seed.drawn / 2 + SEED_FRAME_PX;
      /** Half size of a marker's cover plus its frame: where its lines end. */
      const frameHalf = (it: PlacedMarker) => it.drawn / 2 + (it.seed ? SEED_FRAME_PX : it.drawn !== it.size ? HOT_FRAME_PX : REC_FRAME_PX);
      // From the edge of the seed's frame to the edge of the recommendation's frame; casing and core alike.
      svg.querySelectorAll<SVGLineElement>('line[data-to], line[data-case]').forEach((l) => {
        const it = byId.get(Number(l.dataset.to ?? l.dataset.case));
        if (!it) return;
        const [x1, y1] = edgePoint(seed.x, seed.y, it.x, it.y, seedHalf);
        const [x2, y2] = edgePoint(it.x, it.y, seed.x, seed.y, frameHalf(it));
        setLine(l, x1, y1, x2, y2);
      });
      // A thin leader from a moved cover's frame back to the album's true position (the shader draws a ring
      // there); none while the true position is still under the cover.
      svg.querySelectorAll<SVGLineElement>('line[data-leader], line[data-leader-case]').forEach((l) => {
        const it = byId.get(Number(l.dataset.leader ?? l.dataset.leaderCase));
        const half = it ? frameHalf(it) : 0;
        const show = !!it && Math.hypot(it.x - it.ax, it.y - it.ay) > LEADER_MIN_PX && Math.max(Math.abs(it.ax - it.x), Math.abs(it.ay - it.y)) > half;
        l.style.display = show ? '' : 'none';
        if (show && it) {
          const [x1, y1] = edgePoint(it.x, it.y, it.ax, it.ay, half);
          setLine(l, x1, y1, it.ax, it.ay);
        }
      });
    }
```

- [ ] **Step 5: Restyle lines, frames and badges**

In `frontcreck/src/styles/map.css`, replace L72-95 (from the comment `/* focus markers: the mockup's canvas drawing ...` through the `.mk-n[data-hot]` rule) with:

```css
/* focus markers: the Trifid prototype's drawing (overlay.js L32-74). On the map the only accent is white. */
.mk-layer { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
.mk-lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* White lines on a dark casing, so they hold on any gas; every casing lies under every core. */
.mk-lines line { stroke-linecap: round; }
.mk-case line { stroke: rgba(6, 6, 10, .8); stroke-width: 4.5; }
.mk-case line[data-hot] { stroke-width: 5.25; }
.mk-case line[data-leader-case] { stroke-width: 3; }
.mk-core line { stroke: rgba(255, 255, 255, .92); stroke-width: 1.5; }
.mk-core line[data-hot] { stroke: #fff; stroke-width: 2.25; }
.mk-core line[data-leader] { stroke: rgba(255, 255, 255, .7); stroke-width: 1; }
/* Markers take no pointer events: the canvas hit-tests their boxes, so drags and pinches that start on a cover reach it. */
.mk { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; background: var(--color-room); box-shadow: 0 4px 14px rgba(0, 0, 0, .6); }
.mk .cover { width: 100% !important; }
/* Square frames (an outline would follow the cover's 2 px radius). A recommendation: a white hairline with a
 * dark hairline outside it. The seed: a 2 px dark gap, then a 2 px lamp ring. A hot recommendation: a 2 px lamp
 * ring with a dark hairline outside it. MarkerDriver ends the lines on these frames (SEED_FRAME_PX 4,
 * REC_FRAME_PX 1, HOT_FRAME_PX 3). */
.mk::after { content: ""; position: absolute; inset: -1px; border: 1px solid rgba(255, 255, 255, .6); box-shadow: 0 0 0 1px rgba(6, 6, 10, .7); pointer-events: none; }
.mk--seed { z-index: 3; }
.mk--seed::after { inset: -4px; border: 2px solid var(--color-lamp); box-shadow: inset 0 0 0 2px var(--color-room); }
.mk[data-hot] { z-index: 2; }
.mk[data-hot]::after { inset: -2px; border: 2px solid var(--color-lamp); box-shadow: 0 0 0 1px rgba(6, 6, 10, .8); }
/* Badges in their own layer above every cover and ring (drawn last). Solid, not glass: digits must hold on any gas. */
.mk-badges { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.mk-n {
  position: absolute; left: 0; top: 0; min-width: 18px; will-change: transform; height: 18px; padding: 0 4px; display: grid; place-items: center;
  background: #0b0a0f; border: 1px solid rgba(255, 255, 255, .55); color: #fff; font: 600 11px/1 var(--font-sans);
}
/* Inverted when hot: room-coloured digits on the lamp token (17:1 with the Trifid values). */
.mk-n[data-hot] { background: var(--color-lamp); border-color: var(--color-room); color: var(--color-room); }
```

- [ ] **Step 6: Run the checks**

Run, one at a time:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/focus.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/focus.spec.ts --project=phone --workers=1)
```

Expected: typecheck and lint clean; `focus.spec.ts` passes on both projects, including the new casing count and check (d). If check (b) (boxes at least the 10 px gap apart) or (c) (seed cover within 40 px of its album) fails, stop: the layout from Task 3 is wrong, not the test. If only the "shows" assertion of check (d) fails on the phone project, a marker was held at the edge of the visible map; report the measured length instead of loosening the check.

- [ ] **Step 7: Commit**

```bash
git add frontcreck/src/components/map/overlays/FocusMarkers.tsx frontcreck/src/components/map/canvas/MarkerDriver.tsx frontcreck/src/styles/map.css frontcreck/e2e/focus.spec.ts
git commit -m "feat(map): white cased focus lines from frame edge to frame edge

Casings under cores, round caps, leaders back to the true position, and
white frames and badges in place of the per-album accent.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

---

### Task 5: Region names layout (pure)

**Files:**
- Create: `frontcreck/src/components/map/state/namesLayout.ts`
- Test: `frontcreck/src/components/map/state/namesLayout.test.ts`

**Interfaces:**
- Consumes: `ThemeLabel` (`@/lib/data/theme`); `NAMES_BAND_PX` (`../theme`); `STOP_T` (`../data`); `ViewBounds` (`./projection`); `StopId` (`@/lib/types`). The test also reads `COVER_FADE_START_PX` (`./zoomLimits`).
- Produces:
  ```ts
  export const NAMES_MAX = 17;
  export const NAMES_MAX_PHONE = 4;
  export const NAME_SIZE_K = 0.88;
  export const NAME_TRACK_EM = 0.26;
  export const NAME_EDGE_PX = 10;
  export const NAME_CONTRAST = 4.5;
  export const NAME_LUM_PX_PER_WORLD = 600;
  export const NAME_FAIR_ALPHA = 0.82;
  export const NAME_OFFSETS: readonly (readonly [number, number])[];
  export const nameKey: (stop: StopId, id: string) => string;          // "name:<stop>:<id>"
  export function namesShown(coverPx: number, albumOpen: boolean): boolean;
  export function nameZoomK(coverPx: number): number;
  export function nameFontPx(label: Pick<ThemeLabel, 'strong' | 'n'>, phone: boolean, zoomK: number): number;
  export interface NameFade { stop: StopId; alpha: number }
  export function nameFades(sliderT: number, from: StopId, to: StopId): NameFade[];
  export function luminance(rgb: readonly number[]): number;
  export function nameContrast(bgLum: number, inkLum: number, inkAlpha: number, halo: number): number;
  export function haloFor(bgLum: number, inkLum: number, inkAlpha?: number, ratio?: number): number;
  export interface NameCandidate { key: string; label: ThemeLabel; x: number; y: number; alpha: number }
  export interface PlacedName { key: string; x: number; y: number; fontPx: number; alpha: number; halo: number }
  export interface NamesInput { candidates: readonly NameCandidate[]; visible: ViewBounds; blockers: readonly ViewBounds[]; phone: boolean; zoomK: number; pxPerWorld: number; fullHalo: boolean; widthOf: (label: ThemeLabel, fontPx: number) => number; sticky: Map<string, number> }
  export function layoutNames(input: NamesInput): PlacedName[];
  export interface ChromeInput { width: number; height: number; top: number; inset: number; phone: boolean; bottomCover: number; card: boolean }
  export function chromeBlockers(c: ChromeInput): ViewBounds[];
  export interface WidthCache { widthOf: (label: ThemeLabel, fontPx: number) => number; clear: () => void }
  export function createWidthCache(measure100: (text: string) => number): WidthCache;
  ```

**Rules, from the prototype's `labels.js` and the 2026-10-04 decisions.**
- Names show while covers would be under `NAMES_BAND_PX` (13 px) and are gone above it. No partial fade by zoom. That band ends before covers begin to show (16 px), so there are never names once covers show; a test pins `NAMES_BAND_PX < COVER_FADE_START_PX` so the two cannot drift apart.
- **No names while an album is open**, at any zoom (decision of 2026-10-04; the prototype's `albumname=0`). `namesShown(coverPx, albumOpen)` carries the rule, and because of it the layout knows nothing about focus covers, focus lines or the album view's controls.
- All labels of the current stop are candidates, highest `p` first; the cap is 17 on desktop and 4 on a phone, and never more than one name per 160 x 90 px of free map.
- During a slider morph the outgoing stop's names fade out over the first 40% and the incoming stop's fade in over the last 40%. Names do not travel.
- Size tiers (labels.js L66-70, k = 0.88): strong `0.88 * (17 + 7 * min(1, sqrt(n / 346)))`, others `0.88 * (15 + 3 * min(1, sqrt(n / 346)))`; times a zoom factor `clamp((coverPx / 12.5) ^ 0.3, 0.85, 1.35)` on desktop, in half-pixel steps; on a phone `clamp(size * 0.72, 13, 16)`. `ThemeLabel` has no broad-area level, so the prototype's third tier is not used. The zoom factor is relative to 12.5 px covers, the same reference the stars use (inferred: the prototype measures it against its Overview framing, `Cam.fitOverview`, which is capped at 12.5 px covers, just under the names band; the app gains an Overview framing in Task 0, and the reference stays 12.5 px whatever Task 0's framing measures on a given window).
- A name tries its true centre, then the prototype's twelve nudges (`OFFSETS`), keeping its last spot first. A box must stay 10 px inside the visible map and clear of chrome, of other names and of the album picked in Explore.
- **Halo and contrast.** The dark halo round the glyphs is the name's immediate surround, so contrast is measured against it. With gas luminance `bg`, ink luminance `ink`, ink opacity `a` and halo strength `h`: the surround is `b = bg * (1 - h)^2.2` (the gas seen through a black layer of opacity `h`, blended in gamma space), the ink over it is `t = (a * ink^(1/2.2) + (1 - a) * b^(1/2.2))^2.2`, and the ratio is `(t + 0.05) / (b + 0.05)`. `haloFor` takes the first `h` in 0.50, 0.55 … 1.00 that reaches 4.5 and adds 0.15 (capped at 1).
- **When the halo is at full strength (1).** `label.lum` is the brightest gas under the unmoved name's box, at rest, measured by part 1's build at 600 px per world unit (part 1 Task 3). It says nothing about any other case, so the halo is full: **whenever the view is under 600 px per world unit** (`NAME_LUM_PX_PER_WORLD`; zoomed further out, a name covers more of the map than was measured), for a name that was nudged off its centre, for every name during a slider morph, and for every name on a phone. Only an unmoved name at rest on a desktop at 600 px per world unit or closer in gets the solved, lighter halo. For scale: the Whole map of a 1440 x 900 window is 596.7 px per world unit at Balanced (just under 600: every name has the full halo), 708.5 at Sonic and 618.2 at Mood (over 600: an unmoved name at rest gets the solved halo); at Balanced the solved halo applies once the visitor zooms in a little (names last until 13 px covers, 1,912 px per world unit). Task 0 makes the map open at the Overview framing, which is closer in (1,639.5 px per world unit at Balanced, 11.15 px covers, names zoom factor 0.966; 1,534.7 at Sonic; 1,838.2 at Mood, capped at 12.5 px), so on the opening view an unmoved name at rest gets the solved halo. The full halo at the Whole map is left as built and is judged by eye in Task 9 (step 9's `map-opening` and `map-opening-fit` pictures and step 11's review), not changed here. The layout helper takes the scale as `pxPerWorld` and its test pins both sides of 600 with exact values.
- Chrome rectangles are fixed numbers read from `styles/map.css` and `styles/phone.css`, not measured, so no layout is read per frame. The zoom corner is the taller one: the detached names toggle (one box) 8 px above the three zoom buttons. Only Explore's controls are listed: with an album open there are no names. Everything anchored to the top of the map is offset by `ChromeInput.top`, the part of the canvas under the site header (`getStageTop()`, Task 7): 0 today, the header's height once part 3 extends the stage under it. The bottom-anchored rectangles do not depend on it.

- [ ] **Step 1: Write the failing test**

Create `frontcreck/src/components/map/state/namesLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ThemeLabel } from '@/lib/data/theme';
import { NAMES_BAND_PX } from '../theme';
import { COVER_FADE_START_PX } from './zoomLimits';
import {
  NAMES_MAX_PHONE,
  NAME_EDGE_PX,
  NAME_LUM_PX_PER_WORLD,
  chromeBlockers,
  createWidthCache,
  haloFor,
  layoutNames,
  luminance,
  nameContrast,
  nameFades,
  nameFontPx,
  nameKey,
  namesShown,
  nameZoomK,
  type NameCandidate,
  type NamesInput,
} from './namesLayout';

function label(id: string, p: number, extra: Partial<ThemeLabel> = {}): ThemeLabel {
  return { id, name: 'Playful Way', x: 0, y: 0, strong: true, n: 300, p, rgb: [240, 236, 228], lum: 0.4, ...extra };
}
function cand(id: string, x: number, y: number, p: number, extra: Partial<ThemeLabel> = {}, alpha = 1): NameCandidate {
  return { key: nameKey('balanced', id), label: label(id, p, extra), x, y, alpha };
}
const widths = createWidthCache((text) => text.length * 62);
const DESKTOP = { width: 1440, height: 836, top: 0, inset: 0, phone: false, bottomCover: 0, card: false };

function input(over: Partial<NamesInput>): NamesInput {
  return {
    candidates: [],
    visible: { left: 0, top: 0, right: 1440, bottom: 836 },
    blockers: chromeBlockers(DESKTOP),
    phone: false,
    zoomK: 1,
    pxPerWorld: NAME_LUM_PX_PER_WORLD,
    fullHalo: false,
    widthOf: widths.widthOf,
    sticky: new Map(),
    ...over,
  };
}

describe('when names show', () => {
  it('is while covers would be under 13 px, and not above', () => {
    expect(namesShown(4, false)).toBe(true);
    expect(namesShown(12.9, false)).toBe(true);
    expect(namesShown(13, false)).toBe(false);
    expect(namesShown(32, false)).toBe(false);
  });

  it('is never once covers show: the band ends before the cover fade starts', () => {
    expect(NAMES_BAND_PX).toBeLessThan(COVER_FADE_START_PX);
    for (const cover of [COVER_FADE_START_PX, 20, 32, 64]) expect(namesShown(cover, false)).toBe(false);
  });

  it('is never while an album is open, whatever the zoom', () => {
    for (const cover of [1, 4, 12.9, 13, 32]) expect(namesShown(cover, true)).toBe(false);
  });
});

describe('name sizes', () => {
  it('follows the two tiers at k = 0.88, in half-pixel steps', () => {
    expect(nameFontPx({ strong: true, n: 346 }, false, 1)).toBe(21);
    expect(nameFontPx({ strong: true, n: 300 }, false, 1)).toBe(20.5);
    expect(nameFontPx({ strong: false, n: 346 }, false, 1)).toBe(16);
    expect(nameFontPx({ strong: false, n: 50 }, false, 0.85)).toBe(12);
  });

  it('is clamped to 13 to 16 px on a phone, whatever the zoom', () => {
    expect(nameFontPx({ strong: true, n: 1000 }, true, 1.35)).toBe(15);
    expect(nameFontPx({ strong: false, n: 10 }, true, 0.85)).toBe(13);
  });

  it('scales gently with the zoom, between 0.85 and 1.35', () => {
    expect(nameZoomK(12.5)).toBe(1);
    expect(nameZoomK(1)).toBe(0.85);
    expect(nameZoomK(64)).toBe(1.35);
  });
});

describe('nameFades (slider morph)', () => {
  it('shows the current stop at rest', () => {
    expect(nameFades(0.5, 'balanced', 'balanced')).toEqual([{ stop: 'balanced', alpha: 1 }]);
    expect(nameFades(1, 'balanced', 'mood')).toEqual([{ stop: 'mood', alpha: 1 }]);
  });

  it('fades the outgoing names out over the first 40% and the incoming in over the last 40%', () => {
    expect(nameFades(0.5, 'balanced', 'mood')).toEqual([{ stop: 'balanced', alpha: 1 }]);
    const early = nameFades(0.6, 'balanced', 'mood');
    expect(early).toHaveLength(1);
    expect(early[0].stop).toBe('balanced');
    expect(early[0].alpha).toBeCloseTo(0.5, 6);
    expect(nameFades(0.75, 'balanced', 'mood')).toEqual([]);
    const late = nameFades(0.9, 'balanced', 'mood');
    expect(late).toHaveLength(1);
    expect(late[0].stop).toBe('mood');
    expect(late[0].alpha).toBeCloseTo(0.5, 6);
  });

  it('works across the middle stop and backwards', () => {
    expect(nameFades(0.5, 'sonic', 'mood')).toEqual([]);
    expect(nameFades(0.9, 'mood', 'sonic')[0]).toEqual({ stop: 'mood', alpha: expect.closeTo(0.75, 6) });
  });
});

describe('halo strength and contrast', () => {
  it('reaches 4.5:1 against the brightest gas, for full and for fair names', () => {
    let worst = Infinity;
    for (let bg = 0; bg <= 1.0001; bg += 0.05) {
      for (const ink of [0.5, 0.7, luminance([240, 236, 228]), 1]) {
        for (const a of [1, 0.82]) worst = Math.min(worst, nameContrast(bg, ink, a, haloFor(bg, ink, a)));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it('is weaker on dim gas than on bright gas, and never under 0.65', () => {
    expect(haloFor(0.1, 0.8)).toBe(0.65);
    expect(haloFor(1, 0.8)).toBeGreaterThan(haloFor(0.1, 0.8));
    expect(haloFor(1, 0.8)).toBeLessThanOrEqual(1);
  });

  it('is full when no halo can reach the ratio', () => {
    expect(haloFor(1, 0.1)).toBe(1);
  });

  it('measures luminance as WCAG does', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(luminance([0, 0, 0])).toBe(0);
  });
});

describe('layoutNames', () => {
  it('places the higher priority name on its centre and nudges the other, with a full halo once nudged', () => {
    const sticky = new Map<string, number>();
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5), cand('b', 705, 405, 9)], sticky }));
    expect(out.map((p) => p.key)).toEqual([nameKey('balanced', 'b'), nameKey('balanced', 'a')]);
    expect([out[0].x, out[0].y]).toEqual([705, 405]);
    expect(out[0].halo).toBe(haloFor(0.4, luminance([240, 236, 228])));
    expect([out[1].x, out[1].y]).not.toEqual([700, 400]);
    expect(out[1].halo).toBe(1);
    expect(sticky.get(nameKey('balanced', 'b'))).toBe(0);
  });

  it('keeps a name on the spot it had, so it does not jump while the map moves', () => {
    const sticky = new Map<string, number>([[nameKey('balanced', 'a'), 2]]);
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5)], sticky }));
    expect([out[0].x, out[0].y]).toEqual([700, 422]);
  });

  it('skips names whose album cloud is off screen, and names fully faded out', () => {
    const out = layoutNames(input({ candidates: [cand('off', 2000, 400, 9), cand('gone', 700, 400, 8, {}, 0), cand('in', 700, 600, 1)] }));
    expect(out.map((p) => p.key)).toEqual([nameKey('balanced', 'in')]);
  });

  it('never puts a name over the slider card, the zoom corner or the hint line, or within 10 px of the edge', () => {
    const blockers = chromeBlockers(DESKTOP);
    const cands = [cand('slider', 140, 80, 9), cand('zoom', 1410, 740, 8), cand('hint', 150, 825, 7), cand('edge', 30, 400, 6)];
    const out = layoutNames(input({ candidates: cands }));
    for (const p of out) {
      const w = widths.widthOf(label('x', 0), p.fontPx) / 2 + 6;
      const h = (p.fontPx * 1.05) / 2 + 4;
      const box = { left: p.x - w, top: p.y - h, right: p.x + w, bottom: p.y + h };
      for (const k of blockers) expect(box.left < k.right && box.right > k.left && box.top < k.bottom && box.bottom > k.top, p.key).toBe(false);
      expect(box.left).toBeGreaterThanOrEqual(NAME_EDGE_PX);
      expect(box.right).toBeLessThanOrEqual(1440 - NAME_EDGE_PX);
    }
  });

  it('shows at most four names on a phone', () => {
    const phone = { width: 390, height: 780, top: 0, inset: 0, phone: true, bottomCover: 165, card: false };
    const cands = Array.from({ length: 9 }, (_, i) => cand(`n${i}`, 195, 60 + 55 * i, i));
    const out = layoutNames(input({ candidates: cands, phone: true, visible: { left: 0, top: 0, right: 390, bottom: 780 }, blockers: chromeBlockers(phone) }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(NAMES_MAX_PHONE);
    for (const p of out) expect(p.fontPx).toBeGreaterThanOrEqual(13);
  });

  it('gives every name the full halo during a morph', () => {
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5, {}, 0.5)], fullHalo: true }));
    expect(out[0].halo).toBe(1);
    expect(out[0].alpha).toBe(0.5);
  });

  it('gives every name the full halo whenever the view is under 600 px per world unit, and the solved one from 600 up', () => {
    expect(NAME_LUM_PX_PER_WORLD).toBe(600);
    const at = (pxPerWorld: number) => layoutNames(input({ candidates: [cand('a', 700, 400, 5)], pxPerWorld }))[0];
    // Zoomed out past the scale label.lum was measured at: the name covers more gas than was measured.
    for (const scale of [120, 247, 595.8, 599.99]) expect(at(scale).halo, `${scale} px per world unit`).toBe(1);
    // At that scale and closer in, an unmoved name at rest gets the halo solved for its gas (lum 0.4: 0.65).
    for (const scale of [600, 600.01, 900, 1900]) {
      expect([at(scale).x, at(scale).y]).toEqual([700, 400]);
      expect(at(scale).halo, `${scale} px per world unit`).toBe(0.65);
    }
    expect(haloFor(0.4, luminance([240, 236, 228]))).toBe(0.65);
    // On brighter gas the solved halo is stronger, and still the full one under 600.
    const bright = (pxPerWorld: number) => layoutNames(input({ candidates: [cand('b', 700, 400, 5, { lum: 0.9 })], pxPerWorld }))[0].halo;
    expect(bright(600)).toBe(0.75);
    expect(bright(599.99)).toBe(1);
  });

  it('returns nothing for a stop with no labels', () => {
    expect(layoutNames(input({ candidates: [] }))).toEqual([]);
  });

  it('returns nothing when no name fits (a very narrow or very short map)', () => {
    expect(layoutNames(input({ candidates: [cand('a', 60, 40, 5)], visible: { left: 0, top: 0, right: 120, bottom: 80 }, blockers: [] }))).toEqual([]);
    expect(layoutNames(input({ candidates: [cand('a', 700, 20, 5)], visible: { left: 0, top: 0, right: 1440, bottom: 40 }, blockers: [] }))).toEqual([]);
  });
});

describe('chromeBlockers', () => {
  it('covers the slider card, the taller zoom corner (toggle plus zoom stack) and the hint line on desktop', () => {
    const b = chromeBlockers(DESKTOP);
    expect(b).toContainEqual({ left: 12, top: 12, right: 272, bottom: 154 });
    expect(b).toContainEqual({ left: 1440 - 68, top: 836 - 196, right: 1440, bottom: 836 });
    expect(b).toContainEqual({ left: 0, top: 836 - 46, right: 380, bottom: 836 });
    expect(b).toHaveLength(3);
  });

  it('follows the album panel while it slides away, and swaps the hint for the card', () => {
    const b = chromeBlockers({ ...DESKTOP, inset: 648 });
    expect(b).toContainEqual({ left: 660, top: 12, right: 920, bottom: 154 });
    expect(b).toContainEqual({ left: 648, top: 836 - 46, right: 648 + 380, bottom: 836 });
    const withCard = chromeBlockers({ ...DESKTOP, card: true });
    expect(withCard).toContainEqual({ left: 12, top: 836 - 200, right: 428, bottom: 836 });
    expect(withCard).not.toContainEqual({ left: 0, top: 836 - 46, right: 380, bottom: 836 });
  });

  it('covers the bottom slider and the zoom corner above it on a phone', () => {
    const b = chromeBlockers({ width: 390, height: 780, top: 0, inset: 0, phone: true, bottomCover: 165, card: false });
    expect(b).toContainEqual({ left: 0, top: 780 - 165 - 10, right: 390, bottom: 780 });
    expect(b).toContainEqual({ left: 390 - 64, top: 780 - 165 - 200, right: 390, bottom: 780 - 165 });
    expect(b).toHaveLength(2);
  });

  it('moves the controls at the top down by the header cover, and leaves the ones at the bottom alone', () => {
    // A stage that runs under a 64 px header is 900 px tall on a 1440 x 900 window.
    const b = chromeBlockers({ ...DESKTOP, height: 900, top: 64 });
    expect(b).toContainEqual({ left: 12, top: 76, right: 272, bottom: 218 });
    expect(b).toContainEqual({ left: 1440 - 68, top: 900 - 196, right: 1440, bottom: 900 });
    expect(b).toContainEqual({ left: 0, top: 900 - 46, right: 380, bottom: 900 });
  });
});

describe('createWidthCache', () => {
  it('measures a name once at 100 px, adds the tracking and scales', () => {
    let calls = 0;
    const cache = createWidthCache((text) => {
      calls++;
      expect(text).toBe('PLAYFUL WAY');
      return 620;
    });
    expect(cache.widthOf(label('a', 1), 20)).toBeCloseTo(((620 + 100 * 0.26 * 11) * 20) / 100, 6);
    cache.widthOf(label('a', 1), 16);
    expect(calls).toBe(1);
  });

  it('measures again after clear (the face arrived after the first measurement)', () => {
    let width = 500;
    const cache = createWidthCache(() => width);
    const before = cache.widthOf(label('a', 1), 20);
    width = 620;
    expect(cache.widthOf(label('a', 1), 20)).toBe(before);
    cache.clear();
    expect(cache.widthOf(label('a', 1), 20)).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/namesLayout.test.ts)`
Expected: FAIL, `Failed to resolve import "./namesLayout"`.

- [ ] **Step 3: Write the implementation**

Create `frontcreck/src/components/map/state/namesLayout.ts`:

```ts
/** Region names: which show, how large, where, and how strong a halo each needs. Pure; RegionNamesDriver
 * feeds it screen positions each rendered frame and writes the result to the DOM. Ported from the Trifid
 * prototype's labels.js. Names are plain lettering: nothing here knows about hover, click or focus. They
 * never show while an album is open, so nothing here knows about focus covers or focus lines either. */
import type { ThemeLabel } from '@/lib/data/theme';
import type { StopId } from '@/lib/types';
import { STOP_T } from '../data';
import { NAMES_BAND_PX } from '../theme';
import type { ViewBounds } from './projection';

/** Most names at once on desktop (every approved Balanced name) and on a phone. */
export const NAMES_MAX = 17;
export const NAMES_MAX_PHONE = 4;
/** Tenor Sans runs wide: its sizes are 0.88 of the original lettering's. */
export const NAME_SIZE_K = 0.88;
/** Letter spacing in em (styles/map.css .rn b uses the same value). */
export const NAME_TRACK_EM = 0.26;
/** Covers are this size at the zoom the size tiers were drawn for. */
const NAME_REF_COVER_PX = 12.5;
/** A name stays this far inside the visible map. */
export const NAME_EDGE_PX = 10;
/** One name per this much free map, at most. */
const NAME_AREA_PX = 160 * 90;
export const NAME_CONTRAST = 4.5;
/** The map scale, in CSS px per world unit, at which part 1's build measured ThemeLabel.lum under each name's
 * box. Under this scale a name covers more of the map than was measured, so its halo is at full strength. */
export const NAME_LUM_PX_PER_WORLD = 600;
/** Opacity of a name that is not `strong` (styles/map.css .rn.fair). */
export const NAME_FAIR_ALPHA = 0.82;
/** Nudges tried in order when the true centre is taken; small, so a name stays on its region. */
export const NAME_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0], [0, -22], [0, 22], [-40, 0], [40, 0], [0, -46], [0, 46], [-70, -30], [70, 30], [70, -30], [-70, 30], [0, -78], [0, 78],
];

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Overlay key of a name's element (ids repeat across stops, so the stop is part of it). */
export const nameKey = (stop: StopId, id: string): string => `name:${stop}:${id}`;

/** Names show at Whole map and Overview and are gone once the map is zoomed in (so long before covers show,
 * which starts at 16 px), and they never show while an album is open. No partial fade. */
export function namesShown(coverPx: number, albumOpen: boolean): boolean {
  return !albumOpen && coverPx < NAMES_BAND_PX;
}

export function nameZoomK(coverPx: number): number {
  return clamp(Math.pow(coverPx / NAME_REF_COVER_PX, 0.3), 0.85, 1.35);
}

/** Font size in CSS px, in half-pixel steps so the element's font-size is rewritten only on a visible change. */
export function nameFontPx(label: Pick<ThemeLabel, 'strong' | 'n'>, phone: boolean, zoomK: number): number {
  const s = Math.min(1, Math.sqrt(label.n / 346));
  const base = NAME_SIZE_K * (label.strong ? 17 + 7 * s : 15 + 3 * s);
  const px = phone ? clamp(base * 0.72, 13, 16) : base * zoomK;
  return Math.round(px * 2) / 2;
}

export interface NameFade {
  stop: StopId;
  alpha: number;
}

/** Which stops' names show at slider position `sliderT` on the way from stop `from` to stop `to`: the outgoing
 * names fade out over the first 40% of the way, the incoming fade in over the last 40%. Names do not travel:
 * ids differ between stops. */
export function nameFades(sliderT: number, from: StopId, to: StopId): NameFade[] {
  const a = STOP_T[from];
  const b = STOP_T[to];
  if (a === b) return [{ stop: to, alpha: 1 }];
  const k = clamp((sliderT - a) / (b - a), 0, 1);
  const out: NameFade[] = [];
  const fadeOut = clamp(1 - k / 0.4, 0, 1);
  const fadeIn = clamp((k - 0.6) / 0.4, 0, 1);
  if (fadeOut > 0) out.push({ stop: from, alpha: fadeOut });
  if (fadeIn > 0) out.push({ stop: to, alpha: fadeIn });
  return out;
}

const linear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of an sRGB colour, 0..255 per channel. */
export function luminance(rgb: readonly number[]): number {
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** Contrast of ink (luminance `inkLum`, opacity `inkAlpha`) against its dark halo of strength `halo` over gas
 * of luminance `bgLum`. The halo is the name's immediate surround, so it is what the ink is measured against. */
export function nameContrast(bgLum: number, inkLum: number, inkAlpha: number, halo: number): number {
  const b = bgLum * Math.pow(Math.max(0, 1 - halo), 2.2);
  const t = Math.pow(inkAlpha * Math.pow(inkLum, 1 / 2.2) + (1 - inkAlpha) * Math.pow(b, 1 / 2.2), 2.2);
  return (t + 0.05) / (b + 0.05);
}

/** Halo strength (the CSS --h, 0.65..1) that brings a name to `ratio`:1 over gas of luminance `bgLum`: the
 * first strength from 0.5 in steps of 0.05 that reaches it, plus 0.15. Full when none does. */
export function haloFor(bgLum: number, inkLum: number, inkAlpha = 1, ratio = NAME_CONTRAST): number {
  for (let step = 10; step <= 20; step++) {
    const h = step / 20;
    if (nameContrast(bgLum, inkLum, inkAlpha, h) >= ratio) return Math.min(1, h + 0.15);
  }
  return 1;
}

export interface NameCandidate {
  key: string;
  label: ThemeLabel;
  /** Screen position of the label's point, canvas CSS px. */
  x: number;
  y: number;
  /** 1, or less while its stop fades in or out during a slider morph. */
  alpha: number;
}

export interface PlacedName {
  key: string;
  /** Centre of the name, canvas CSS px. */
  x: number;
  y: number;
  fontPx: number;
  alpha: number;
  halo: number;
}

export interface NamesInput {
  candidates: readonly NameCandidate[];
  /** The part of the canvas that shows the map. */
  visible: ViewBounds;
  /** Rectangles no name may touch: chrome, the picked album. */
  blockers: readonly ViewBounds[];
  phone: boolean;
  zoomK: number;
  /** The map scale, CSS px per world unit: under NAME_LUM_PX_PER_WORLD every name gets the full halo. */
  pxPerWorld: number;
  /** Every name gets the full halo whatever the scale (during a slider morph and on a phone, when label.lum
   * does not describe the gas behind the name). */
  fullHalo: boolean;
  /** Width of a name's text at a font size, CSS px. */
  widthOf: (label: ThemeLabel, fontPx: number) => number;
  /** The offset each name last used; read and written, so a name does not jump while the map moves. */
  sticky: Map<string, number>;
}

const overlapsAny = (a: ViewBounds, list: readonly ViewBounds[]): boolean => list.some((k) => a.left < k.right && a.right > k.left && a.top < k.bottom && a.bottom > k.top);

/** Places names in priority order. Returns only the names that found a spot; the caller hides the rest. */
export function layoutNames(input: NamesInput): PlacedName[] {
  const { visible: v, blockers, phone, zoomK, sticky } = input;
  // label.lum holds for the unmoved name at rest, at NAME_LUM_PX_PER_WORLD or closer in.
  const fullHalo = input.fullHalo || input.pxPerWorld < NAME_LUM_PX_PER_WORLD;
  let blocked = 0;
  for (const k of blockers) {
    blocked += Math.max(0, Math.min(k.right, v.right) - Math.max(k.left, v.left)) * Math.max(0, Math.min(k.bottom, v.bottom) - Math.max(k.top, v.top));
  }
  const area = Math.max(0, v.right - v.left) * Math.max(0, v.bottom - v.top);
  const budget = Math.min(phone ? NAMES_MAX_PHONE : NAMES_MAX, Math.max(1, Math.floor((area - blocked) / NAME_AREA_PX)));
  const cands = input.candidates.filter((c) => c.alpha > 0).sort((p, q) => q.label.p - p.label.p || (p.key < q.key ? -1 : 1));
  const placed: PlacedName[] = [];
  const boxes: ViewBounds[] = [];
  for (const c of cands) {
    if (placed.length >= budget) break;
    if (c.x < v.left || c.x > v.right || c.y < v.top || c.y > v.bottom) continue;
    const fontPx = nameFontPx(c.label, phone, zoomK);
    const w = input.widthOf(c.label, fontPx) / 2 + 6;
    const h = (fontPx * 1.05) / 2 + 4;
    const keep = sticky.get(c.key) ?? 0;
    let box: ViewBounds | null = null;
    let used = 0;
    // The spot it had last time first, then the others in order.
    for (let n = 0; n <= NAME_OFFSETS.length && !box; n++) {
      const k = n === 0 ? keep : n - 1;
      if ((n > 0 && k === keep) || !NAME_OFFSETS[k]) continue;
      const x = c.x + NAME_OFFSETS[k][0];
      const y = c.y + NAME_OFFSETS[k][1];
      const b = { left: x - w, top: y - h, right: x + w, bottom: y + h };
      if (b.left < v.left + NAME_EDGE_PX || b.right > v.right - NAME_EDGE_PX || b.top < v.top + NAME_EDGE_PX || b.bottom > v.bottom - NAME_EDGE_PX) continue;
      if (overlapsAny(b, blockers) || overlapsAny(b, boxes)) continue;
      box = b;
      used = k;
    }
    if (!box) continue;
    sticky.set(c.key, used);
    boxes.push(box);
    placed.push({
      key: c.key,
      x: Math.round((box.left + box.right) * 5) / 10,
      y: Math.round((box.top + box.bottom) * 5) / 10,
      fontPx,
      alpha: c.alpha,
      // label.lum is the brightest gas under the unmoved name: a nudged name takes the full halo too.
      halo: fullHalo || used !== 0 ? 1 : haloFor(c.label.lum, luminance(c.label.rgb), c.label.strong ? 1 : NAME_FAIR_ALPHA),
    });
  }
  return placed;
}

export interface ChromeInput {
  /** Canvas size, CSS px. */
  width: number;
  height: number;
  /** CSS px at the top of the canvas covered by the site header (state/stageTop.ts): 0 while the stage starts
   * below the header. Everything anchored to the top of the map sits this much lower. */
  top: number;
  /** CSS px covered on the left by the album panel while it slides away (names only show once no album is open). */
  inset: number;
  phone: boolean;
  /** CSS px covered by the phone slider panel along the bottom (MapInput.bottomCover). */
  bottomCover: number;
  /** Explore with a picked album: its card is shown (and the hint is not). */
  card: boolean;
}

/** Height of the zoom corner: the names toggle, an 8 px gap, three zoom buttons (40 px each; 44 on a phone). */
const ZOOM_CORNER_DESKTOP_PX = 40 + 8 + 3 * 40;
const ZOOM_CORNER_PHONE_PX = 44 + 8 + 3 * 44;

/** The map's controls as rectangles in canvas CSS px, from the fixed positions in styles/map.css and
 * styles/phone.css with a few px to spare (nothing is measured, so no layout is read per frame). Only the
 * controls of Explore: names never show while an album is open. The header itself is kept clear by the
 * caller, which starts the visible area at `top`. */
export function chromeBlockers(c: ChromeInput): ViewBounds[] {
  const { width: W, height: H, inset: L, top: T } = c;
  const out: ViewBounds[] = [];
  if (c.phone) {
    // The slider panel across the bottom, and the zoom corner 8 px above it on the right.
    out.push({ left: 0, top: H - c.bottomCover - 10, right: W, bottom: H });
    out.push({ left: W - 64, top: H - c.bottomCover - 16 - ZOOM_CORNER_PHONE_PX, right: W, bottom: H - c.bottomCover });
    if (c.card) out.push({ left: 0, top: H - c.bottomCover - 160, right: W, bottom: H });
    return out;
  }
  out.push({ left: L + 12, top: T + 12, right: L + 272, bottom: T + 154 }); // the slider card, top left
  out.push({ left: W - 68, top: H - 28 - ZOOM_CORNER_DESKTOP_PX, right: W, bottom: H }); // toggle plus zoom stack
  if (c.card) out.push({ left: L + 12, top: H - 200, right: L + 428, bottom: H });
  else out.push({ left: L, top: H - 46, right: L + Math.min(380, W - L - 80), bottom: H }); // the hint line
  return out;
}

export interface WidthCache {
  widthOf: (label: ThemeLabel, fontPx: number) => number;
  /** Forget every width (the lettering face arrived, or changed). */
  clear: () => void;
}

/** Text widths, measured once per name at 100 px by `measure100` (the capitals, without tracking) and scaled.
 * Widths taken before the face loaded are wrong: call clear() when it arrives. */
export function createWidthCache(measure100: (text: string) => number): WidthCache {
  const at100 = new Map<string, number>();
  return {
    widthOf(label, fontPx) {
      let w = at100.get(label.name);
      if (w === undefined) {
        w = measure100(label.name.toUpperCase()) + 100 * NAME_TRACK_EM * label.name.length;
        at100.set(label.name, w);
      }
      return (w * fontPx) / 100;
    },
    clear() {
      at100.clear();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/namesLayout.test.ts)`
Expected: PASS, 28 tests. (Run with plain `node` against this code while the plan was written: all 28 pass, and `haloFor(0.4, luminance([240, 236, 228]))` is exactly 0.65.)

- [ ] **Step 5: Commit**

```bash
git add frontcreck/src/components/map/state/namesLayout.ts frontcreck/src/components/map/state/namesLayout.test.ts
git commit -m "feat(map): region names layout, sizes, morph fades and halo contrast

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

---

### Task 6: Names toggle (saved preference, store flag, detached button)

**Approval status.** The control is **approved**: option B, chosen by the owner on 2026-10-04 (`docs/design/trifid-theme/options/toggle-b-on.jpg`, `toggle-b-off.jpg`, `toggle-options.jpg`). It is built exactly as the prototype's `namesToggle()` builds it (`docs/design/trifid-theme/prototype/src/app.js` L463-489, and the names block of `src/css/pages.css` L206-213, variant `b`): an icon button put in as the first child of `.map-zoom`, 8 px above the three zoom buttons, with the zoom-in button's top border restored; one `aria-pressed` state; the "Aa" glyph, and when off the same glyph at 42% cut by a mask along a thin slash; the choice kept in `localStorage` under `rmr-names`.

**Screen reader label: built as proposed, wording still awaiting the owner's approval.** One fixed accessible label, "Place names", with an on/off pressed state (`aria-pressed`). The label never swaps: a label that changed to "Show place names" together with `aria-pressed="false"` would say the opposite of itself. The string is marked as pending in `copy.ts` and in the component. Do not ship it without his yes; if he chooses other words, only `COPY.map.names` changes. Option B was never rendered on a phone; Task 9 step 5 takes the 390 x 844 screenshots he sees with the label question.

**Files:**
- Create: `frontcreck/src/lib/namesPref.ts`
- Test: `frontcreck/src/lib/namesPref.test.ts`
- Modify: `frontcreck/src/lib/store.ts` (L2 import, L8-41 `AppState`, L56-88 store, L90-93 test hooks)
- Test: `frontcreck/src/lib/store.test.ts` (append inside the top-level `describe`)
- Modify: `frontcreck/src/components/Icon.tsx` (L30, new entries after `list`)
- Modify: `frontcreck/src/lib/copy.ts` (after L79, `exploreHere`)
- Create: `frontcreck/src/components/map/overlays/NamesToggle.tsx`
- Test: `frontcreck/src/components/map/overlays/NamesToggle.test.tsx`
- Modify: `frontcreck/src/components/map/overlays/ZoomControls.tsx` (L3-9)
- Modify: `frontcreck/src/styles/map.css` (new rules after the `.mk-n[data-hot]` rule from Task 4)

**Interfaces:**
- Consumes: `Icon` (`@/components/Icon`), `COPY`, `useAppStore`.
- Produces:
  ```ts
  // src/lib/namesPref.ts
  export const NAMES_KEY = 'rmr-names';
  export function readNamesOn(): boolean;          // default true; never throws
  export function writeNamesOn(v: boolean): void;  // never throws
  // src/lib/store.ts (AppState)
  namesOn: boolean;
  setNamesOn: (v: boolean) => void;
  // src/components/Icon.tsx
  IconName gains 'names' | 'namesOff'
  // src/lib/copy.ts
  COPY.map.names: 'Place names';   // the one fixed label; wording pending the owner's approval
  // src/components/map/overlays/NamesToggle.tsx
  export function NamesToggle(): React.JSX.Element;   // <button class="map-names" aria-label="Place names" aria-pressed>
  ```

**Shown wherever the zoom buttons are, as in the prototype.** That includes beside an open album, where names never show (decision of 2026-10-04): the prototype keeps the button there too, the choice it stores still applies once the album closes, and hiding it would make the corner jump when an album opens. It is one more Tab stop before Zoom in on every map view. This is on the list of things for the owner to see.

**Placement (as the prototype does it).** The prototype's `namesToggle()` calls `document.querySelector('.map-zoom').prepend(b)` and styles it with `margin-bottom: 8px`. Here too the button is the **first child of `.map-zoom`** in `ZoomControls.tsx`, with `margin-bottom: 8px` and its own full border, not a sibling. That way the existing phone rules apply to it with no new CSS: `.has-card .map-zoom { display: none; }` hides it with the zoom stack while the Explore card is open, and `.map-zoom { bottom: calc(var(--slider-cover, …) + 8px); }` keeps the whole corner above the slider panel. It takes the generic `.map-zoom button` size and glass style (40 px; 44 px on a phone from `styles/phone.css` L46), which part 3 owns.

**First-load JS.** This is the one task whose code lands on the first load: `ZoomControls` is imported by `MapStage`, which the root layout (`src/app/layout.tsx`) imports, so `NamesToggle.tsx`, `lib/namesPref.ts`, the store flag, the two icons and the string are first-load code. Part 1 left 191.2 KB of the 200 KB budget used (handoff), so keep them as written here (no new dependency, no import from `components/map/state/*`, `shaders/*` or `three`); Task 9 step 7 measures the growth.

**No hydration mismatch.** The store starts with `namesOn: true` on the server and in the first client render. The saved value is applied in the store module's existing browser-only block. Nothing rendered on the server depends on `namesOn`: the toggle (inside `ZoomControls`) and the names (inside the dynamically imported `MusicMap`) both mount only on the client after the map data has loaded. Task 9 checks a reload with the preference off for hydration errors.

**The icon.** The prototype's drawing, number for number (`src/app.js` L466 and L484-486, `src/css/pages.css` L210-211). On: the "Aa" glyph at stroke width 1.6 with round caps and joins. Off: the same glyph at 42% opacity, **cut by a mask** along the diagonal (a 4.4 unit band in the 24 unit box, about 2.9 px at 16 px), with a thin slash (1.2 units, about 0.8 px, at 95%) drawn in the gap. That leaves about 1 px of clear panel on each side of the slash; a mask, unlike a stroke in the panel colour, also works on a see-through glass panel. The app's `Icon` component draws at stroke width 1.7 by default, so the toggle passes `strokeWidth={1.6}`.

On:

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false">
  <g stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2"/>
    <circle cx="17.6" cy="14.6" r="3.2"/>
    <path d="M20.8 11.2V18"/>
  </g>
</svg>
```

Off:

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false">
  <mask id="rmr-names-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
    <rect width="24" height="24" fill="#fff" stroke="none"/>
    <path d="M1.5 22.5 22.5 1.5" stroke="#000" stroke-width="4.4" stroke-linecap="butt"/>
  </mask>
  <g mask="url(#rmr-names-cut)" opacity="0.42" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2"/>
    <circle cx="17.6" cy="14.6" r="3.2"/>
    <path d="M20.8 11.2V18"/>
  </g>
  <path d="M4 20 20 4" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>
</svg>
```

- [ ] **Step 1: Write the failing preference test**

Create `frontcreck/src/lib/namesPref.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAMES_KEY, readNamesOn, writeNamesOn } from './namesPref';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('names preference', () => {
  it('is on by default', () => {
    expect(readNamesOn()).toBe(true);
  });

  it('round-trips off and on through localStorage', () => {
    writeNamesOn(false);
    expect(window.localStorage.getItem(NAMES_KEY)).toBe('0');
    expect(readNamesOn()).toBe(false);
    writeNamesOn(true);
    expect(window.localStorage.getItem(NAMES_KEY)).toBe('1');
    expect(readNamesOn()).toBe(true);
  });

  it('treats junk as on', () => {
    for (const junk of ['', 'false', 'off', '{bad json', 'null', '00']) {
      window.localStorage.setItem(NAMES_KEY, junk);
      expect(readNamesOn(), junk).toBe(true);
    }
  });

  it('survives storage throwing on read and on write', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    expect(readNamesOn()).toBe(true);
    expect(() => writeNamesOn(false)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/namesPref.test.ts)`
Expected: FAIL, `Failed to resolve import "./namesPref"`.

- [ ] **Step 3: Write the preference module**

Create `frontcreck/src/lib/namesPref.ts`:

```ts
/** Whether the map's region names are shown: remembered on this device, on by default. */
export const NAMES_KEY = 'rmr-names';

/** Only an exact '0' means off; a missing value, junk or blocked storage all mean on. */
export function readNamesOn(): boolean {
  try {
    return window.localStorage.getItem(NAMES_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeNamesOn(on: boolean): void {
  try {
    window.localStorage.setItem(NAMES_KEY, on ? '1' : '0');
  } catch {
    // storage can be blocked; the choice then lasts for this page load only
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/namesPref.test.ts)`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing store tests**

In `frontcreck/src/lib/store.test.ts`, add before the closing `});` of the top-level `describe`:

```ts
  it('shows region names by default, and saves the choice when it changes', () => {
    window.localStorage.clear();
    expect(useAppStore.getState().namesOn).toBe(true);
    const calls = countNotifications(() => {
      useAppStore.getState().setNamesOn(true);
      useAppStore.getState().setNamesOn(false);
      useAppStore.getState().setNamesOn(false);
    });
    expect(calls).toBe(1);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
  });

  it('still switches names off for the page load when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    useAppStore.getState().setNamesOn(false);
    expect(useAppStore.getState().namesOn).toBe(false);
  });

  it('starts from the saved choice in the browser', async () => {
    window.localStorage.setItem('rmr-names', '0');
    vi.resetModules();
    const fresh = await import('./store');
    expect(fresh.useAppStore.getState().namesOn).toBe(false);
    window.localStorage.clear();
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/store.test.ts)`
Expected: FAIL, `setNamesOn is not a function` and `expected undefined to be true`.

- [ ] **Step 7: Add the flag to the store**

In `frontcreck/src/lib/store.ts`:

After L2 (`import { pushTrail, readTrail, writeTrail } from '@/lib/trail';`) add:

```ts
import { readNamesOn, writeNamesOn } from '@/lib/namesPref';
```

In `AppState`, after the `toast` field (L28) add:

```ts
  /** Whether the map's region names are shown (the names toggle; remembered on this device). */
  namesOn: boolean;
```

and after `clearToast: () => void;` (L40) add:

```ts
  setNamesOn: (namesOn: boolean) => void;
```

In the store, after `toast: null,` (L67) add:

```ts
  // On for the server render and the first client render; the saved choice is applied below, in the browser.
  namesOn: true,
```

and after `clearToast: () => set({ toast: null }),` (L87) add:

```ts
  setNamesOn: (namesOn) => {
    if (get().namesOn === namesOn) return;
    set({ namesOn });
    writeNamesOn(namesOn);
  },
```

Replace the test-hooks block (L90-93):

```ts
// Test hooks (Playwright, the perf script). getState includes the setters, so these can change state as well.
if (typeof window !== 'undefined') {
  window.__rmr = { ...window.__rmr, getState: useAppStore.getState, subscribe: useAppStore.subscribe };
}
```

with:

```ts
if (typeof window !== 'undefined') {
  // The saved names choice. Safe before hydration: nothing rendered on the server depends on it (the toggle
  // and the names mount only on the client, once the map data has loaded).
  useAppStore.setState({ namesOn: readNamesOn() });
  // Test hooks (Playwright, the perf script). getState includes the setters, so these can change state as well.
  window.__rmr = { ...window.__rmr, getState: useAppStore.getState, subscribe: useAppStore.subscribe };
}
```

- [ ] **Step 8: Run the store tests to verify they pass**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/store.test.ts)`
Expected: PASS, every test.

- [ ] **Step 9: Add the icons and the proposed label**

In `frontcreck/src/components/Icon.tsx`, after the `list` entry (L30) add:

```tsx
  // The names toggle (the Trifid prototype's namesToggle drawing): off is the letters at 42%, cut by a mask
  // along a thin slash.
  names: (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2" />
      <circle cx="17.6" cy="14.6" r="3.2" />
      <path d="M20.8 11.2V18" />
    </g>
  ),
  namesOff: (
    <>
      <mask id="rmr-names-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" stroke="none" />
        <path d="M1.5 22.5 22.5 1.5" stroke="#000" strokeWidth="4.4" strokeLinecap="butt" />
      </mask>
      <g mask="url(#rmr-names-cut)" opacity="0.42" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2" />
        <circle cx="17.6" cy="14.6" r="3.2" />
        <path d="M20.8 11.2V18" />
      </g>
      <path d="M4 20 20 4" strokeWidth="1.2" strokeLinecap="round" opacity="0.95" />
    </>
  ),
```

In `frontcreck/src/lib/copy.ts`, after L79 (`exploreHere: 'Explore this area',`) add:

```ts
    /** The names toggle's one fixed label; its on/off state is aria-pressed, the label never changes.
     * PENDING OWNER APPROVAL (proposed wording, 2026-10-04). */
    names: 'Place names',
```

- [ ] **Step 10: Write the failing toggle test**

Create `frontcreck/src/components/map/overlays/NamesToggle.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import { NamesToggle } from './NamesToggle';

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ namesOn: true });
});
afterEach(() => useAppStore.setState({ namesOn: true }));

describe('NamesToggle', () => {
  it('is an icon-only pressed button that switches the names off and on and saves the choice', () => {
    const { getByRole, unmount } = render(<NamesToggle />);
    const button = getByRole('button', { name: 'Place names' });
    expect(COPY.map.names).toBe('Place names');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('stroke-width', '1.6');
    expect(button.querySelector('mask')).toBeNull();
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('mask')).not.toBeNull();
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('rmr-names')).toBe('1');
    unmount();
  });

  it('keeps one fixed accessible name in both states: only the pressed state changes', () => {
    const { getByRole, unmount } = render(<NamesToggle />);
    const button = getByRole('button', { name: COPY.map.names });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', COPY.map.names);
    expect(getByRole('button', { name: COPY.map.names, pressed: false })).toBe(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', COPY.map.names);
    expect(getByRole('button', { name: COPY.map.names, pressed: true })).toBe(button);
    unmount();
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/overlays/NamesToggle.test.tsx)`
Expected: FAIL, `Failed to resolve import "./NamesToggle"`.

- [ ] **Step 12: Write the toggle and mount it above the zoom stack**

Create `frontcreck/src/components/map/overlays/NamesToggle.tsx`:

```tsx
'use client';

import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';

/** Region names on or off: a separate box 8 px above the zoom stack (the owner's option B, approved
 * 2026-10-04, as the Trifid prototype's namesToggle builds it). Icon only; the choice is remembered on this
 * device (lib/namesPref.ts). One fixed accessible label with a pressed state; the label never swaps.
 * PENDING OWNER APPROVAL: the label's wording (COPY.map.names). */
export function NamesToggle() {
  const on = useAppStore((s) => s.namesOn);
  return (
    <button type="button" className="map-names" aria-pressed={on} aria-label={COPY.map.names} onClick={() => useAppStore.getState().setNamesOn(!on)}>
      <Icon name={on ? 'names' : 'namesOff'} strokeWidth={1.6} />
    </button>
  );
}
```

In `frontcreck/src/components/map/overlays/ZoomControls.tsx`, replace L3-9:

```tsx
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import type { MapApi } from '../types';

export function ZoomControls({ api }: { api: React.RefObject<MapApi | null> }) {
  return (
    <div className="map-zoom">
```

with:

```tsx
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import type { MapApi } from '../types';
import { NamesToggle } from './NamesToggle';

export function ZoomControls({ api }: { api: React.RefObject<MapApi | null> }) {
  return (
    <div className="map-zoom">
      {/* First child, so the phone rules that lift or hide the zoom stack (styles/map.css) cover it too. */}
      <NamesToggle />
```

In `frontcreck/src/styles/map.css`, directly after the `.mk-n[data-hot]` rule (the last rule of the block Task 4 wrote) add:

```css

/* names toggle: its own box 8 px above the zoom stack (the owner's option B). It is the first child of
 * .map-zoom, so it takes the zoom buttons' size and glass, and the phone rules that lift or hide the stack. */
.map-zoom .map-names { margin-bottom: 8px; }
/* The zoom-in button under it gets its top border back (.map-zoom button + button removes it). */
.map-zoom .map-names + button { border-top: 1px solid var(--color-rule); }
```

- [ ] **Step 13: Run the checks**

Run, one at a time:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/overlays/NamesToggle.test.tsx src/lib/copy.test.ts)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run lint)
```

Expected: PASS, 2 tests in `NamesToggle.test.tsx` (the copy rules test reads the new string: no dashes, no emoji, no owner name); typecheck and lint clean.

- [ ] **Step 14: Commit**

```bash
git add frontcreck/src/lib/namesPref.ts frontcreck/src/lib/namesPref.test.ts frontcreck/src/lib/store.ts frontcreck/src/lib/store.test.ts frontcreck/src/components/Icon.tsx frontcreck/src/lib/copy.ts frontcreck/src/components/map/overlays/NamesToggle.tsx frontcreck/src/components/map/overlays/NamesToggle.test.tsx frontcreck/src/components/map/overlays/ZoomControls.tsx frontcreck/src/styles/map.css
git commit -m "feat(map): names toggle above the zoom stack, remembered on the device

Option B (detached box), approved 2026-10-04, as the prototype builds it.
One fixed label with a pressed state; its wording still awaits the owner's
approval.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

---

### Task 7: Region names layer (font, DOM layer, frame driver)

**Files:**
- Modify: `frontcreck/src/app/layout.tsx` (L2, L17-22, L41)
- Create: `frontcreck/src/components/map/state/nameWidths.ts`
- Test: `frontcreck/src/components/map/state/nameWidths.test.ts`
- Create: `frontcreck/src/components/map/state/stageTop.ts`
- Test: `frontcreck/src/components/map/state/stageTop.test.ts`
- Create: `frontcreck/src/components/map/overlays/RegionNames.tsx`
- Test: `frontcreck/src/components/map/overlays/RegionNames.test.tsx`
- Create: `frontcreck/src/components/map/canvas/RegionNamesDriver.tsx`
- Modify: `frontcreck/src/components/map/MusicMap.tsx` (L5-6 imports; L41-42, below part 1's `setTheme` layout effect)
- Modify: `frontcreck/src/components/map/canvas/Scene.tsx` (the `PickController` import, L27 since part 1 added the `GasField` import above it; `<MarkerDriver />` and `<FrameCounter />`, L176-177 since part 1 added `<GasField />`)
- Modify: `frontcreck/src/styles/map.css` (new rules after the names toggle rules from Task 6)

**Interfaces:**
- Consumes: Task 5 (`namesLayout.ts`); Task 6 (`useAppStore` `namesOn`); `useMapStore((s) => s.theme)`, `rawToWorld`, `NAMES_BAND_PX` (part 1); `getOverlayEl`, `setOverlayEl` (`state/overlayEls.ts`); `canvasRect`, `visibleArea`, `worldToScreen` (`state/projection.ts`); `coverCssPx`, `pxPerWorld` (`state/zoomLimits.ts`); `requestRender` (`state/invalidate.ts`); `isNarrow` (`@/lib/media`).
- Produces:
  ```ts
  // state/nameWidths.ts
  export const nameWidths: WidthCache;
  export function setNameFontFamily(family: string): void;
  export function clearNameWidths(): void;          // forget every width (the face arrived) and bump the version
  export function nameWidthsVersion(): number;      // the driver lays names out again when it changes
  // state/stageTop.ts
  export function getStageTop(): number;            // CSS px of the canvas under the site header; 0 today
  export function setStageTop(px: number): void;    // part 3 calls this when the stage runs under the header
  // overlays/RegionNames.tsx
  export function RegionNames(): React.JSX.Element | null;   // <div class="rn-layer" aria-hidden="true"> of <div class="rn off" data-stop><b>name</b></div>
  // canvas/RegionNamesDriver.tsx
  export function RegionNamesDriver(props: { positionsRef: React.RefObject<Float32Array> }): null;
  ```
  CSS variable `--font-names-face` on `<html>` (Tenor Sans 400).

**When names show.** At Whole map and Overview (covers under 13 px), with the names switched on, on the interactive map. Never while an album is open (from the moment the album's focus is set or its panel takes its place, whichever comes first), never once the map is zoomed in (so never once covers show), never on the dimmed backdrop (Home, About, 404). They are plain lettering: `aria-hidden`, `pointer-events: none`, nothing to hover, click or focus, no legend, card, menu, pointer or search row.

**No hard-coded stage offset.** The top of the visible map and the top-anchored chrome rectangles come from `getStageTop()` (`state/stageTop.ts`, created in this task): 0 today, where the stage starts below the header. When part 3 extends the stage under the header it calls `setStageTop` with the header's height and names keep below the header with no change here.

**How it stays cheap.** The names are 30 DOM elements at most (17 + 7 + 6), each its own compositor layer. The driver runs only on frames the map already renders (`frameloop="demand"`), never asks for a frame, and reads no layout. It keeps the inputs of its last placement (camera position and zoom, canvas size, slider position, the animated inset, the input fields it reads, the names switch, the stage top, the layer element, the label set and the width cache's version) and returns at once on a frame where none of them changed: a hover redraw (the pointer move path, handoff of 2026-10-05), a cover fading in, or part 1's sharper gas image fading in costs it a dozen compares and nothing else. When it does place, it writes `transform` (and the two custom properties `--a`, `--h`) only when the value differs from what it wrote last; `font-size` changes only in half-pixel steps while the zoom changes. A frame is requested from outside the driver in exactly four cases: the names mount or unmount (theme loaded, toggle), a web font finishes loading, and the stage top changes (part 3, which calls `requestRender()` after `setStageTop`).

- [ ] **Step 1: Load Tenor Sans off the critical path**

In `frontcreck/src/app/layout.tsx`, replace L2:

```ts
import { Cormorant_Garamond, Schibsted_Grotesk } from 'next/font/google';
```

with:

```ts
import { Cormorant_Garamond, Schibsted_Grotesk, Tenor_Sans } from 'next/font/google';
```

After the `sans` declaration (L17-22) add:

```ts
// The map's region names. Not preloaded: it is fetched when the names first render, after the map has loaded.
const names = Tenor_Sans({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-names-face',
  display: 'swap',
  preload: false,
});
```

Replace L41:

```tsx
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
```

with:

```tsx
    <html lang="en" className={`${serif.variable} ${sans.variable} ${names.variable}`}>
```

- [ ] **Step 2: Write the failing component test**

Create `frontcreck/src/components/map/overlays/RegionNames.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { useAppStore } from '@/lib/store';
import { useMapStore } from '../state/mapStore';
import { RegionNames } from './RegionNames';

const lab = (id: string, name: string, strong: boolean): ThemeLabel => ({ id, name, x: 0, y: 0, strong, n: 100, p: 1, rgb: [240, 236, 228], lum: 0.3 });
/** One stop's gas images as theme.json version 3 describes them (the fixture of src/lib/data/theme.test.ts); unused here. */
const STOP_GAS = { rect: [-1.4, -1.4, 1.1, 1.4] as [number, number, number, number], px: [1829, 2048] as [number, number], sharp: [3200, 3584] as [number, number], hash: ['0123456789', 'abcdef0123'] as [string, string] };
const THEME: ThemeData = {
  v: 3,
  n: 0,
  positionsHash: 'x',
  bakeHalf: 1.75,
  gas: { sonic: STOP_GAS, balanced: STOP_GAS, mood: STOP_GAS },
  stars: { lead: [], bg: [] },
  labels: { sonic: [], balanced: [lab('a', 'Warm Halo', true), lab('b', 'Eclectic Cloud', false)], mood: [lab('a', 'The Quiet Deep', true)] },
};

afterEach(() => {
  useMapStore.setState({ theme: null });
  useAppStore.setState({ namesOn: true });
});

describe('RegionNames', () => {
  it('renders nothing without theme data', () => {
    useMapStore.setState({ theme: null });
    const { container, unmount } = render(<RegionNames />);
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it('renders nothing while names are switched off', () => {
    useMapStore.setState({ theme: THEME });
    useAppStore.setState({ namesOn: false });
    const { container, unmount } = render(<RegionNames />);
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it('renders one plain, hidden name per label of every stop, and none for a stop with no labels', () => {
    useMapStore.setState({ theme: THEME });
    const { container, unmount } = render(<RegionNames />);
    const layer = container.querySelector('.rn-layer')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const names = [...container.querySelectorAll<HTMLElement>('.rn')];
    expect(names.map((n) => [n.dataset.stop, n.textContent])).toEqual([
      ['balanced', 'Warm Halo'],
      ['balanced', 'Eclectic Cloud'],
      ['mood', 'The Quiet Deep'],
    ]);
    // Hidden until the driver places them; the second Balanced name is not a strong one.
    expect(names.every((n) => n.classList.contains('off'))).toBe(true);
    expect(names.map((n) => n.classList.contains('fair'))).toEqual([false, true, false]);
    expect(names[0].style.getPropertyValue('--lc')).toBe('rgb(240,236,228)');
    // Plain lettering: nothing to focus, click or hover, and no explanation attached.
    expect(container.querySelectorAll('a, button, [tabindex], [role], [title]')).toHaveLength(0);
    unmount();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/overlays/RegionNames.test.tsx)`
Expected: FAIL, `Failed to resolve import "./RegionNames"`.

- [ ] **Step 4: Write the stage top holder, the width holder and the DOM layer**

Create `frontcreck/src/components/map/state/stageTop.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { getStageTop, setStageTop } from './stageTop';

afterEach(() => setStageTop(0));

describe('stageTop (how much of the canvas the header covers)', () => {
  it('is 0 until someone says otherwise: the stage starts below the header', () => {
    expect(getStageTop()).toBe(0);
  });

  it('keeps the value it is given, and treats junk as 0', () => {
    setStageTop(64);
    expect(getStageTop()).toBe(64);
    for (const junk of [-4, Number.NaN, Number.POSITIVE_INFINITY]) {
      setStageTop(junk);
      expect(getStageTop()).toBe(0);
    }
  });
});
```

Create `frontcreck/src/components/map/state/stageTop.ts`:

```ts
/** CSS px at the top of the map canvas that the site header covers. 0 today: the stage, and the canvas with
 * it, starts below the header (styles/shell.css `.stage { top: var(--hdr) }`). When the stage is extended under
 * the header (Trifid plan part 3), that task calls setStageTop with the header's height, and the region names,
 * their chrome rectangles and the star glints keep below the header with no other change. A plain module-level
 * value, like state/overlayEls.ts, so the per-frame drivers read it without reading layout. */
let stageTop = 0;

export function getStageTop(): number {
  return stageTop;
}

export function setStageTop(px: number): void {
  stageTop = Number.isFinite(px) && px > 0 ? px : 0;
}
```

Create `frontcreck/src/components/map/state/nameWidths.test.ts` first, and run it to see it fail (`Failed to resolve import "./nameWidths"`):

```ts
import { describe, expect, it } from 'vitest';
import { clearNameWidths, nameWidthsVersion, setNameFontFamily } from './nameWidths';

describe('nameWidths version (the names driver lays names out again when it changes)', () => {
  it('rises by one when the widths are cleared', () => {
    const v = nameWidthsVersion();
    clearNameWidths();
    expect(nameWidthsVersion()).toBe(v + 1);
  });

  it('rises when the lettering face changes, and not when it is set to the same face again', () => {
    setNameFontFamily('"Tenor Sans Test A", sans-serif');
    const v = nameWidthsVersion();
    setNameFontFamily('"Tenor Sans Test B", sans-serif');
    expect(nameWidthsVersion()).toBe(v + 1);
    setNameFontFamily('"Tenor Sans Test B", sans-serif');
    expect(nameWidthsVersion()).toBe(v + 1);
  });
});
```

Then create `frontcreck/src/components/map/state/nameWidths.ts`:

```ts
import { createWidthCache, type WidthCache } from './namesLayout';

/** The page's one cache of region name widths, measured with a 2D canvas in the lettering face. A plain
 * module-level bridge, like state/overlayEls.ts: RegionNames sets the face and clears it, the driver reads it. */
let family = 'sans-serif';
let ctx: CanvasRenderingContext2D | null | undefined;

function measure100(text: string): number {
  if (ctx === undefined) {
    try {
      ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
  }
  // No canvas (tests, a locked-down browser): a rough width, so names still keep apart.
  if (!ctx) return text.length * 66;
  ctx.font = `400 100px ${family}`;
  return ctx.measureText(text).width;
}

export const nameWidths: WidthCache = createWidthCache(measure100);

let version = 0;

/** Forgets every width (the lettering face arrived, or changed) and bumps the version, so RegionNamesDriver,
 * which otherwise skips a frame whose inputs did not change, lays the names out again on the next frame. */
export function clearNameWidths(): void {
  nameWidths.clear();
  version++;
}

export function nameWidthsVersion(): number {
  return version;
}

/** The computed font-family of the names layer (next/font gives the face a generated name). */
export function setNameFontFamily(next: string): void {
  if (!next || next === family) return;
  family = next;
  clearNameWidths();
}
```

Create `frontcreck/src/components/map/overlays/RegionNames.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import { requestRender } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { clearNameWidths, setNameFontFamily } from '../state/nameWidths';
import { nameKey } from '../state/namesLayout';
import { setOverlayEl } from '../state/overlayEls';

/** The region names: plain lettering over the map, placed by RegionNamesDriver. Nothing to hover, focus or
 * click, no explanation, hidden from assistive technology, and no pointer events (styles/map.css). One element
 * per label of every stop, each hidden (`off`) until the driver shows it. Renders nothing without theme data
 * or while the names are switched off. */
export function RegionNames() {
  const theme = useMapStore((s) => s.theme);
  const namesOn = useAppStore((s) => s.namesOn);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const shown = !!theme && namesOn;

  useEffect(() => {
    // Mounted, unmounted or relabelled: the driver places (or stops placing) names on the next frame.
    requestRender();
    const layer = layerRef.current;
    if (!shown || !layer) return;
    setNameFontFamily(getComputedStyle(layer).fontFamily);
    const fonts = document.fonts;
    if (!fonts) return;
    // Widths measured before the face arrived are the fallback's: measure again and place again. Only when the
    // names' own face arrived: another font finishing late must not draw a map frame at rest.
    const family = getComputedStyle(layer).fontFamily;
    const again = (e: Event) => {
      const faces = (e as FontFaceSetLoadEvent).fontfaces;
      if (faces && !faces.some((f) => family.includes(f.family.replace(/["']/g, ''))) return;
      clearNameWidths();
      requestRender();
    };
    fonts.addEventListener('loadingdone', again);
    return () => fonts.removeEventListener('loadingdone', again);
  }, [shown, theme]);

  if (!theme || !namesOn) return null;
  return (
    <div
      className="rn-layer"
      aria-hidden="true"
      ref={(el) => {
        layerRef.current = el;
        setOverlayEl('names', el);
      }}
    >
      {STOP_IDS.flatMap((stop) =>
        theme.labels[stop].map((label) => (
          <div
            key={nameKey(stop, label.id)}
            className={`rn off${label.strong ? '' : ' fair'}`}
            data-stop={stop}
            style={{ '--lc': `rgb(${label.rgb.join(',')})` } as React.CSSProperties}
            ref={(el) => {
              setOverlayEl(nameKey(stop, label.id), el);
            }}
          >
            <b>{label.name}</b>
          </div>
        )),
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/overlays/RegionNames.test.tsx src/components/map/state/stageTop.test.ts src/components/map/state/nameWidths.test.ts)`
Expected: PASS, 3 tests, 2 tests and 2 tests. (`STOP_IDS` is `['sonic', 'balanced', 'mood']` in `@/lib/types`; if its order differs, the expected order in the third test follows it.)

- [ ] **Step 6: Write the frame driver**

Create `frontcreck/src/components/map/canvas/RegionNamesDriver.tsx`:

```tsx
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import type { ThemeLabel } from '@/lib/data/theme';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';
import { STOP_T, rawToWorld } from '../data';
import { useMapStore } from '../state/mapStore';
import { nameWidths, nameWidthsVersion } from '../state/nameWidths';
import { chromeBlockers, layoutNames, nameFades, nameKey, namesShown, nameZoomK, type NameCandidate, type PlacedName } from '../state/namesLayout';
import { getOverlayEl } from '../state/overlayEls';
import { canvasRect, visibleArea, worldToScreen } from '../state/projection';
import { getStageTop } from '../state/stageTop';
import { coverCssPx, pxPerWorld } from '../state/zoomLimits';

/** Extra room kept round the album picked in Explore, CSS px. */
const PICK_CLEAR_PX = 22;

/** What the driver last wrote to an element, so an unchanged value is never written again. */
interface Written {
  transform: string;
  fontPx: number;
  alpha: string;
  halo: string;
  off: boolean;
}
const written = new WeakMap<Element, Written>();

function stateOf(el: Element): Written {
  let w = written.get(el);
  if (!w) {
    // As RegionNames renders it: hidden, nothing set.
    w = { transform: '', fontPx: 0, alpha: '', halo: '', off: true };
    written.set(el, w);
  }
  return w;
}

function show(el: HTMLElement, p: PlacedName): void {
  const w = stateOf(el);
  const transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
  if (w.transform !== transform) {
    el.style.transform = transform;
    w.transform = transform;
  }
  if (w.fontPx !== p.fontPx) {
    el.style.fontSize = `${p.fontPx}px`;
    w.fontPx = p.fontPx;
  }
  const alpha = p.alpha.toFixed(2);
  if (w.alpha !== alpha) {
    el.style.setProperty('--a', alpha);
    w.alpha = alpha;
  }
  const halo = p.halo.toFixed(2);
  if (w.halo !== halo) {
    el.style.setProperty('--h', halo);
    w.halo = halo;
  }
  if (w.off) {
    el.classList.remove('off');
    w.off = false;
  }
}

function hide(el: HTMLElement | null): void {
  if (!el) return;
  const w = stateOf(el);
  if (w.off) return;
  el.classList.add('off');
  w.off = true;
}

interface WorldLabel {
  key: string;
  label: ThemeLabel;
  wx: number;
  wy: number;
}

/** What the last placement was made from. A drawn frame that changes none of these (a hover redraw, which is the
 * pointer move path; a cover fading in; part 1's sharper gas image fading in) places nothing and writes nothing. */
interface Basis {
  layer: Element;
  world: object;
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  sliderT: number;
  inset: number;
  stop: StopId;
  focus: object | null;
  selected: number | null;
  dimmed: boolean;
  insetLeft: number;
  bottomCover: number;
  namesOn: boolean;
  top: number;
  widths: number;
}

/** Every rendered frame: decides which region names show and where (state/namesLayout.ts) and writes their
 * transforms. It never asks for a frame and reads no layout, so nothing happens at rest. No name shows while
 * an album is open, once the map is zoomed in, or on the dimmed backdrop. */
export function RegionNamesDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const theme = useMapStore((s) => s.theme);
  const data = useMapStore((s) => s.data);
  // Label points in world units, once per theme (labels carry raw position units).
  const world = useMemo(() => {
    if (!theme || !data) return null;
    const out = {} as Record<StopId, WorldLabel[]>;
    for (const stop of STOP_IDS) {
      out[stop] = theme.labels[stop].map((label) => {
        const [wx, wy] = rawToWorld(data, label.x, label.y);
        return { key: nameKey(stop, label.id), label, wx, wy };
      });
    }
    return out;
  }, [theme, data]);
  // The stop the slider last rested on: a morph fades its names out and the target's in.
  const rest = useRef<StopId>(useMapStore.getState().input.stop);
  const sticky = useRef(new Map<string, number>());
  const last = useRef<Basis | null>(null);

  useFrame(() => {
    // No theme data, or the names are switched off (RegionNames renders no layer): nothing to place.
    const layer = getOverlayEl('names');
    if (!world || !layer) {
      last.current = null;
      return;
    }
    const { input, sliderT, insetCurrent } = useMapStore.getState();
    const { width, height } = get().size;
    const namesOn = useAppStore.getState().namesOn;
    // CSS px of the canvas under the site header: 0 while the stage starts below it (state/stageTop.ts).
    const top = getStageTop();
    const widths = nameWidthsVersion();
    const { x, y } = camera.position;
    const b = last.current;
    if (
      b &&
      b.layer === layer &&
      b.world === world &&
      b.x === x &&
      b.y === y &&
      b.zoom === camera.zoom &&
      b.width === width &&
      b.height === height &&
      b.sliderT === sliderT &&
      b.inset === insetCurrent &&
      b.stop === input.stop &&
      b.focus === input.focus &&
      b.selected === input.selected &&
      b.dimmed === input.dimmed &&
      b.insetLeft === input.insetLeft &&
      b.bottomCover === input.bottomCover &&
      b.namesOn === namesOn &&
      b.top === top &&
      b.widths === widths
    ) {
      return;
    }
    last.current = {
      layer,
      world,
      x,
      y,
      zoom: camera.zoom,
      width,
      height,
      sliderT,
      inset: insetCurrent,
      stop: input.stop,
      focus: input.focus,
      selected: input.selected,
      dimmed: input.dimmed,
      insetLeft: input.insetLeft,
      bottomCover: input.bottomCover,
      namesOn,
      top,
      widths,
    };
    if (sliderT === STOP_T[input.stop]) rest.current = input.stop;
    const coverPx = coverCssPx(camera.zoom, height);
    // An album is open from the moment its panel takes its place (insetLeft) or its focus is set, whichever
    // comes first; on a phone only the focus says so.
    const albumOpen = input.focus !== null || input.insetLeft > 0;
    // Overview and Whole map only; never beside an open album, and never on the dimmed backdrop (Home, About, 404).
    const on = namesOn && !input.dimmed && namesShown(coverPx, albumOpen);
    const fades = on ? nameFades(sliderT, rest.current, input.stop) : [];
    const rect = canvasRect(width, height);

    const candidates: NameCandidate[] = [];
    for (const f of fades) {
      for (const w of world[f.stop]) {
        const p = worldToScreen(w.wx, w.wy, rect, camera);
        candidates.push({ key: w.key, label: w.label, x: p.x, y: p.y, alpha: f.alpha });
      }
    }

    let placed: PlacedName[] = [];
    if (candidates.length) {
      // The animated inset: after an album closes, names follow the map while its panel slides away.
      const inset = Math.max(0, insetCurrent);
      const phone = isNarrow();
      const blockers = chromeBlockers({ width, height, top, inset, phone, bottomCover: input.bottomCover, card: input.selected !== null });
      if (input.selected !== null) {
        // A name never sits on the album picked in Explore.
        const pos = positionsRef.current;
        const p = worldToScreen(pos[2 * input.selected], pos[2 * input.selected + 1], rect, camera);
        blockers.push({ left: p.x - PICK_CLEAR_PX, top: p.y - PICK_CLEAR_PX, right: p.x + PICK_CLEAR_PX, bottom: p.y + PICK_CLEAR_PX });
      }
      const visible = visibleArea(inset, width, height, 0);
      visible.top = top;
      placed = layoutNames({
        candidates,
        visible,
        blockers,
        phone,
        zoomK: nameZoomK(coverPx),
        // Under 600 px per world unit layoutNames gives every name the full halo.
        pxPerWorld: pxPerWorld(camera.zoom, height),
        // label.lum was measured under the name's box on a desktop. On a phone the same name covers far more
        // of the map, and mid-morph the gas is between two stops: the full halo in both cases.
        fullHalo: phone || fades.length !== 1 || fades[0].alpha < 1,
        widthOf: nameWidths.widthOf,
        sticky: sticky.current,
      });
    }

    const shown = new Set<string>();
    for (const p of placed) {
      shown.add(p.key);
      const el = getOverlayEl(p.key);
      if (el) show(el, p);
    }
    for (const stop of STOP_IDS) {
      for (const w of world[stop]) if (!shown.has(w.key)) hide(getOverlayEl(w.key));
    }
  });

  return null;
}
```

- [ ] **Step 7: Mount the layer and the driver**

In `frontcreck/src/components/map/MusicMap.tsx`, replace L5-6:

```ts
import { FocusMarkers } from './overlays/FocusMarkers';
import { HoverLabel } from './overlays/HoverLabel';
```

with:

```ts
import { FocusMarkers } from './overlays/FocusMarkers';
import { HoverLabel } from './overlays/HoverLabel';
import { RegionNames } from './overlays/RegionNames';
```

and replace L41-42:

```tsx
      <Scene initialCamera={initialCamera} onApi={onApi} />
      <FocusMarkers albums={data.albums} />
```

with:

```tsx
      <Scene initialCamera={initialCamera} onApi={onApi} />
      {/* Under the focus markers, the hover label and the map's controls (z-index 2). */}
      <RegionNames />
      <FocusMarkers albums={data.albums} />
```

Part 1 added a `theme` prop and one layout effect (`setTheme`) to `MusicMap` and left this fragment as it was, so the before text matches the code as it is now.

In `frontcreck/src/components/map/canvas/Scene.tsx`, after the import `import { PickController } from "./PickController";` (L27) add:

```ts
import { RegionNamesDriver } from "./RegionNamesDriver";
```

and replace L176-177:

```tsx
      <MarkerDriver positionsRef={positionsRef} />
      <FrameCounter />
```

with:

```tsx
      <MarkerDriver positionsRef={positionsRef} />
      {/* Region names: placed on every drawn frame, hidden while an album is open or the map is zoomed in. */}
      <RegionNamesDriver positionsRef={positionsRef} />
      <FrameCounter />
```

Part 1's `{theme ? <GasField data={data} theme={theme} /> : null}` sits in `SceneInner` just above `<AlbumField />`; these lines are below it and do not depend on it.

- [ ] **Step 8: Style the names**

In `frontcreck/src/styles/map.css`, directly after the two names toggle rules from Task 6 add:

```css

/* region names: plain lettering over the map (RegionNamesDriver places them). Nothing to hover, focus or
 * click; hidden from assistive technology. Tenor Sans, wide capitals. */
.rn-layer { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; font-family: var(--font-names-face), var(--font-sans); }
.map-pane.is-dimmed .rn-layer { display: none; }
.rn { position: absolute; left: 0; top: 0; padding: 4px 8px; text-align: center; white-space: nowrap; font-size: 16px; pointer-events: none; will-change: transform; contain: layout style; transition: opacity .2s var(--out), visibility 0s; }
.rn.off { opacity: 0; visibility: hidden; transition: opacity .2s var(--out), visibility 0s linear .2s; }
.rn b {
  display: block; font-weight: 400; font-style: normal; letter-spacing: .26em; padding-left: .26em; text-transform: uppercase; line-height: 1.05; color: var(--lc); opacity: var(--a, 1);
  /* The halo: a dark stroke under the fill and soft stacked shadows, as strong as the gas behind needs (--h,
   * solved by state/namesLayout.ts haloFor so the ink is 4.5:1 against it). */
  -webkit-text-stroke: 2.1px rgba(4, 4, 8, calc(var(--h, .85) * .85)); paint-order: stroke fill;
  text-shadow: 0 0 2px rgba(4, 4, 8, var(--h, .85)), 0 0 4px rgba(4, 4, 8, var(--h, .85)), 0 0 4px rgba(4, 4, 8, var(--h, .85)), 0 0 8px rgba(4, 4, 8, var(--h, .85)), 0 0 8px rgba(4, 4, 8, var(--h, .85)), 0 0 14px rgba(4, 4, 8, var(--h, .85)), 0 0 14px rgba(4, 4, 8, var(--h, .85)), 0 0 26px rgba(4, 4, 8, calc(var(--h, .85) * .85)), 0 0 44px rgba(4, 4, 8, calc(var(--h, .85) * .6));
}
.rn.fair b { opacity: calc(var(--a, 1) * .82); }
```

- [ ] **Step 9: Run the checks**

Run, one at a time:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test)
```

Expected: typecheck and lint clean; all unit tests pass. If lint flags the `layerRef.current = el` assignment in the ref callback or the module-level `WeakMap` in the driver, follow the file's existing convention: a single `// eslint-disable-next-line <rule> -- <reason>` on that line, with the rule name lint printed.

- [ ] **Step 10: Commit**

```bash
git add frontcreck/src/app/layout.tsx frontcreck/src/components/map/state/nameWidths.ts frontcreck/src/components/map/state/nameWidths.test.ts frontcreck/src/components/map/state/stageTop.ts frontcreck/src/components/map/state/stageTop.test.ts frontcreck/src/components/map/overlays/RegionNames.tsx frontcreck/src/components/map/overlays/RegionNames.test.tsx frontcreck/src/components/map/canvas/RegionNamesDriver.tsx frontcreck/src/components/map/MusicMap.tsx frontcreck/src/components/map/canvas/Scene.tsx frontcreck/src/styles/map.css
git commit -m "feat(map): region names in Tenor Sans, shown at Overview and Whole map

Plain lettering placed each rendered frame; gone when zoomed in, while an
album is open, on the dimmed backdrop and while switched off. Transform
only writes, no frame requested at rest.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

---

### Task 8: Twinkle (star glints on a timer, DOM and CSS only)

**Approval status.** Approved by the owner on 2026-10-04 after seeing it live in the prototype, with one condition: if it costs any responsiveness in the app it is dropped or cheapened, and he is told afterwards (step 13 measures it and holds the rule).

**Files:**
- Modify: `frontcreck/src/types/global.d.ts` (one import, one field on `window.__rmr`)
- Modify: `frontcreck/src/lib/store.ts` (one flag and its setter, beside `namesOn` from Task 6)
- Test: `frontcreck/src/lib/store.test.ts` (one appended test)
- Create: `frontcreck/src/components/map/state/twinkle.ts`
- Test: `frontcreck/src/components/map/state/twinkle.test.ts`
- Create: `frontcreck/src/components/map/overlays/Twinkle.tsx`
- Test: `frontcreck/src/components/map/overlays/Twinkle.test.tsx`
- Create: `frontcreck/src/components/map/canvas/TwinkleDriver.tsx`
- Modify: `frontcreck/src/components/map/MusicMap.tsx` (one import, one element after `<Scene />`)
- Modify: `frontcreck/src/components/map/canvas/Scene.tsx` (one import, one element after `<RegionNamesDriver />`)
- Modify: `frontcreck/src/styles/map.css` (new rules after the region names rules from Task 7)
- Modify: `frontcreck/e2e/helpers.ts` (`waitForAnimations`, L68-73 since part 1 lengthened `waitForMap` above it; new `twinkleOff` (`waitForGasSharpSettled` is Task 0's))
- Modify: `frontcreck/e2e/a11y.spec.ts` (L12-13, the wait before the audit)
- Modify: `frontcreck/e2e/gas.spec.ts` (part 1's file: one line in `lumaAt`, one line before the registration test's screenshot, one import)
- Create: `frontcreck/e2e/twinkle.spec.ts`
- Create: `frontcreck/scripts/perf/twinkle-cost.mjs`
- Create: `docs/design/trifid-theme/reviews/app-twinkle-cost.md`

**Interfaces:**
- Consumes: `pageStarClasses`, `starCoreCssPx`, `starTint`, `seededRandom`, `drawStarClasses` (Task 1); `MUTED_DOT_SCALE` (`shaders/album.ts`); `getStageTop` (Task 7); `getOverlayEl`, `setOverlayEl`, `getPlacedMarkers` (`state/overlayEls.ts`); `viewBounds`, `worldToScreen`, `canvasRect`, `OrthoCameraLike`, `ViewBounds` (`state/projection.ts`); `coverFade` (`state/zoomLimits.ts`); `useMapStore` (`input`, `insetCurrent`, `sliderT`, `dragging`, `animating`, `nudging`, `rigMoving`, `morphing`, `data`, `theme`); `useAppStore` (`@/lib/store`); `REDUCED_MOTION_QUERY`, `prefersReducedMotion` (`@/lib/media`); `STAR_WHITE` (`../theme`); `window.__rmr.frames` (`canvas/FrameCounter.tsx`).
- Produces:
  ```ts
  // state/twinkle.ts
  export const TWINKLE_WAIT_MS: readonly [1200, 3000];
  export const TWINKLE_MAX = 3;
  export const TWINKLE_DUR_MS: readonly [1200, 1800];
  export const TWINKLE_REMOVE_SLACK_MS = 300;
  export const TWINKLE_WEIGHT: readonly [12, 7, 2.5, 1];
  export const TWINKLE_BLOOM: readonly [5.5, 5];
  export const TWINKLE_FLARE = 12;
  export const TWINKLE_PEAK = 1;
  export const TWINKLE_PEAK_FOCUS = 0.6;
  export const TWINKLE_SETTLE_MS = 500;
  export const TWINKLE_EDGE_PX = 6;
  export const TWINKLE_COVER_CLEAR_PX = 6;
  export interface WorldToScreen { ox: number; oy: number; kx: number; ky: number }
  export function worldToScreenMap(c: OrthoCameraLike, width: number, height: number): WorldToScreen;
  export interface TwinkleCover { x: number; y: number; half: number }
  export interface StarPick { index: number; x: number; y: number }
  export function pickStar(positions: Float32Array, classes: Uint8Array, to: WorldToScreen, area: ViewBounds, covers: readonly TwinkleCover[], random: () => number): StarPick | null;
  export interface Glint { index: number; x: number; y: number; radius: number; flare: number | null; rgb: [number, number, number]; peak: number; durMs: number }
  export function glintFor(pick: StarPick, cls: number, starRadiusPx: number, tint: readonly number[], besideAlbum: boolean, random: () => number): Glint;
  export function glintBackground(rgb: readonly number[]): string;
  export interface GlintHandle { durMs: number; remove: () => void }
  export interface TwinkleHost { hidden: () => boolean; reducedMotion: () => boolean; resting: () => boolean; spawn: (ended: () => void) => GlintHandle | null }
  export interface TwinkleEnv { setTimeout: (fn: () => void, ms: number) => number; clearTimeout: (id: number) => void; now: () => number; random: () => number }
  export interface TwinkleStats { ticks: number; notResting: number; capped: number; spawned: number; played: number; ended: number; cleared: number; alive: number; worstSpawnMs: number }
  export interface Twinkle { sync: () => void; viewChanged: () => void; setEnabled: (on: boolean) => void; dispose: () => void; stats: TwinkleStats }
  export function createTwinkle(host: TwinkleHost, env: TwinkleEnv): Twinkle;
  // overlays/Twinkle.tsx
  export function TwinkleLayer(): React.JSX.Element;                                   // <div class="tw-layer" aria-hidden="true">
  export function addGlint(layer: HTMLElement, glint: Glint, ended: () => void): GlintHandle;   // <i class="tw" data-album><b/></i>
  // canvas/TwinkleDriver.tsx
  export function TwinkleDriver(props: { positionsRef: React.RefObject<Float32Array> }): null;
  // src/lib/store.ts (AppState)
  twinkleOn: boolean;                          // true; not saved; no control on screen
  setTwinkleOn: (twinkleOn: boolean) => void;  // tests and measurements: window.__rmr.getState().setTwinkleOn(false)
  // window.__rmr.twinkle?: { stats: TwinkleStats }
  // e2e/helpers.ts
  export async function twinkleOff(page: Page): Promise<void>;
  ```
- Consumes (from Task 0, already in `e2e/helpers.ts`): `waitForGasSharpSettled(page: Page, quietMs = 2500): Promise<void>`, called before counting idle frames.

**What it is.** Now and then one star catches the light. A port of the prototype's `src/twinkle.js` and the twinkle block of `src/css/pages.css` (L225-236), with the settings of the prototype README, section "Twinkle":

| Setting | Value | Constant |
|---|---|---|
| Wait between two glints | a fresh random 1.2 to 3 s each time | `TWINKLE_WAIT_MS` |
| Most alive at once | 3 | `TWINKLE_MAX` |
| One glint, in and out | 1.2 to 1.8 s | `TWINKLE_DUR_MS` |
| Opacity over its life | 0, to the peak at 40%, held to 58%, back to 0; ease-in-out | keyframe `tw-glint` |
| Scale over its life | 0.4, 1, 1, 0.6 | keyframe `tw-glint` |
| Peak opacity | 1; 0.6 beside an open album, where the stars are dimmed | `TWINKLE_PEAK`, `TWINKLE_PEAK_FOCUS` |
| Bloom radius | 5.5 times the star's drawn radius, plus 5 px (about 22 to 43 px across from the Overview scale in; 18.8 px on the smallest star at the whole-map zoom) | `TWINKLE_BLOOM` |
| Bloom fill | the star's tint three quarters of the way to white: solid to 16% of the radius, 0.62 at 32%, 0.24 at 56%, 0.07 at 80%, 0 at the edge. Plain alpha, no blend mode | `glintBackground` |
| Flare | on the two brightest classes only: two 1 px lines, 12 star radii long each way, white fading to nothing at the tips | `TWINKLE_FLARE`, `.tw-flare` |
| Which star | any album on screen and not under a focus cover; brighter classes likelier by 12, 7, 2.5, 1 (about one glint in three has a flare) | `TWINKLE_WEIGHT`, `pickStar` |
| After the view changes | every glint goes at once; none is made for 500 ms | `TWINKLE_SETTLE_MS` |

**Rules that hold in the app.**
- DOM and CSS only. A glint is two nodes (a positioned `<i>` and an animated `<b>`; the flare is the `<b>`'s two pseudo-elements). The one keyframe animates `opacity` and `transform` and nothing else, so the compositor runs it; nothing in it triggers layout, and nothing paints the canvas.
- One `setTimeout` between glints and one per glint as a fallback removal. No `requestAnimationFrame`, no frame loop, and no call to `invalidate()` or `requestRender()` anywhere in the three new files: the map canvas is never redrawn for a glint. The driver's `useFrame` callback only runs on frames the map already draws.
- No layout or style reads: no `getBoundingClientRect`, no `getComputedStyle`, no `offsetWidth`. The position comes from the album positions the map already holds. The writes are one `appendChild` with inline styles and one `remove()`.
- Nothing during a pan, a zoom, a fling or a slider move: any change of camera, slider position, canvas size, focus or route clears the layer in the frame that draws it, the timer makes nothing while the store says something is moving, and nothing for 500 ms after. A hover redraw changes none of those and leaves the glints alone.
- None once covers begin to show (16 px). None under `prefers-reduced-motion` (the timer never starts and the layer is `display: none`). None in a hidden tab (`visibilitychange` stops the timer). None on About and 404, or on the phone's album list, where the map is covered.
- Every glint sits on an album's star: `pickStar` returns an album index and that album's own screen position. A glint is not a new star.
- The layer and the glints take no pointer events and are `aria-hidden`.
- Cleaned up on unmount: the timer is cleared, every glint removed, the two listeners and the store subscription removed, the test hook deleted.
- One switch, for tests and measurements only: `twinkleOn` in the app store, on by default, not saved, with no control on screen (the owner asked for a names toggle, not a twinkle toggle). Part 3 uses the same flag for its perf comparison and its still screenshots.

**With an album open (checked in the prototype, and followed).** The prototype keeps the glints playing beside an open album: `resting()` in `src/twinkle.js` L50-56 returns false only for About, 404, the phone's album list, showing covers and a moving view. It makes them quieter there (`--peak` is `lerp(1, 0.6, pool)`, L92) and never puts one under a focus cover (L76). The app does the same: beside an open album on desktop, and in the phone's map mode, glints play at a peak of 0.6 and keep 6 px clear of every focus cover. The peak is a fixed 0.6 while an album is open, where the prototype eases it with the pool (`lerp(1, 0.6, pool)`); the fixed value was accepted by the owner on 2026-10-04. This is unlike the region names, which the owner ruled out while an album is open.

**Home.** The prototype also plays them on Home, behind the hero. So does the app: the dimmed map there is under the veil, which dims the glints with it.

**One difference from the prototype.** On a phone the glints keep above the slider panel (`input.bottomCover`); the prototype let them fall under it. A glint under a solid panel is work nobody sees.

**What it costs, by construction** (step 13 measures it): at most 6 DOM nodes; at most 3 compositor animations; per glint one pass over the album positions (0.06 ms for 4,081 albums in plain `node`; the prototype measured 2.4 to 3.1 ms for its whole spawn in Chromium) and one DOM write; nothing at all between glints.

- [ ] **Step 1: Add the test hook's type and the store switch**

In `frontcreck/src/types/global.d.ts`, after the first import line (`import type { MapApi } from '@/components/map/types';`) add:

```ts
import type { TwinkleStats } from '@/components/map/state/twinkle';
```

and after the `starSeed?: number;` field Task 1 added, add:

```ts
      /** The star glints' counters (components/map/canvas/TwinkleDriver.tsx), there while the map is mounted.
       * To switch the glints off, use getState().setTwinkleOn(false). */
      twinkle?: { stats: TwinkleStats };
```

In `frontcreck/src/lib/store.test.ts`, add before the closing `});` of the top-level `describe` (after the tests Task 6 added):

```ts
  it('plays the star glints by default, and switches them off and on without saving anything', () => {
    window.localStorage.clear();
    expect(useAppStore.getState().twinkleOn).toBe(true);
    const calls = countNotifications(() => {
      useAppStore.getState().setTwinkleOn(true);
      useAppStore.getState().setTwinkleOn(false);
      useAppStore.getState().setTwinkleOn(false);
    });
    expect(calls).toBe(1);
    expect(useAppStore.getState().twinkleOn).toBe(false);
    expect(window.localStorage.length).toBe(0);
    useAppStore.getState().setTwinkleOn(true);
  });
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/store.test.ts)`
Expected: FAIL, `setTwinkleOn is not a function`.

In `frontcreck/src/lib/store.ts`, in `AppState`, after the `namesOn: boolean;` field Task 6 added, add:

```ts
  /** Whether the star glints play (components/map/canvas/TwinkleDriver.tsx). On; there is no control for it on
   * screen and it is not saved. Tests, the perf scripts and still screenshots switch it off through
   * window.__rmr.getState(). */
  twinkleOn: boolean;
```

after `setNamesOn: (namesOn: boolean) => void;` add:

```ts
  setTwinkleOn: (twinkleOn: boolean) => void;
```

in the store, after `namesOn: true,` add:

```ts
  twinkleOn: true,
```

and after the `setNamesOn` implementation (it ends with `},`) add:

```ts
  setTwinkleOn: (twinkleOn) => set((s) => (s.twinkleOn === twinkleOn ? s : { twinkleOn })),
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/store.test.ts)`
Expected: PASS, every test.

- [ ] **Step 2: Write the failing unit test**

Create `frontcreck/src/components/map/state/twinkle.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasRect, worldToScreen } from './projection';
import { drawStarClasses, seededRandom } from './stars';
import {
  TWINKLE_BLOOM,
  TWINKLE_DUR_MS,
  TWINKLE_FLARE,
  TWINKLE_MAX,
  TWINKLE_SETTLE_MS,
  TWINKLE_WAIT_MS,
  TWINKLE_WEIGHT,
  createTwinkle,
  glintBackground,
  glintFor,
  pickStar,
  worldToScreenMap,
  type TwinkleHost,
} from './twinkle';

/** A scheduler on vitest's fake timers, with a host whose answers the test sets. */
function harness(random: () => number = () => 0) {
  const state = { hidden: false, reduced: false, resting: true, durMs: 1500, noStar: false };
  const glints: { ended: () => void; removed: boolean }[] = [];
  const delays: number[] = [];
  const host: TwinkleHost = {
    hidden: () => state.hidden,
    reducedMotion: () => state.reduced,
    resting: () => state.resting,
    spawn: (ended) => {
      if (state.noStar) return null;
      const g = { ended, removed: false };
      glints.push(g);
      return {
        durMs: state.durMs,
        remove: () => {
          g.removed = true;
        },
      };
    },
  };
  const tw = createTwinkle(host, {
    setTimeout: (fn, ms) => {
      delays.push(ms);
      return setTimeout(fn, ms) as unknown as number;
    },
    clearTimeout: (id) => clearTimeout(id),
    now: () => Date.now(),
    random,
  });
  return { tw, state, glints, delays };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the settings are the prototype\'s (README, section Twinkle)', () => {
  it('one glint every 1.2 to 3 s, at most 3 alive, 1.2 to 1.8 s each, weights 12, 7, 2.5, 1', () => {
    expect([...TWINKLE_WAIT_MS]).toEqual([1200, 3000]);
    expect(TWINKLE_MAX).toBe(3);
    expect([...TWINKLE_DUR_MS]).toEqual([1200, 1800]);
    expect([...TWINKLE_WEIGHT]).toEqual([12, 7, 2.5, 1]);
    expect([...TWINKLE_BLOOM]).toEqual([5.5, 5]);
    expect(TWINKLE_FLARE).toBe(12);
    expect(TWINKLE_SETTLE_MS).toBe(500);
  });
});

describe('the timer', () => {
  it('waits between 1.2 and 3 s before each glint, a fresh random wait each time', () => {
    // Glints that live 5 s, so their removal timers (5.3 s) can be told from the waits.
    const h = harness(seededRandom(4));
    h.state.durMs = 5000;
    h.tw.sync();
    vi.advanceTimersByTime(60_000);
    const waits = h.delays.filter((d) => d < 5000);
    expect(waits.length).toBeGreaterThanOrEqual(20);
    expect(waits.length).toBeLessThanOrEqual(51);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(1200);
    expect(Math.max(...waits)).toBeLessThan(3000);
    expect(new Set(waits).size).toBeGreaterThan(10);
    expect(h.tw.stats.ticks).toBe(waits.length - 1);
  });

  it('takes the shortest wait for a random 0 and stays under the longest for a random just under 1', () => {
    const low = harness(() => 0);
    low.tw.sync();
    expect(low.delays).toEqual([1200]);
    const high = harness(() => 0.999999);
    high.tw.sync();
    expect(high.delays[0]).toBeGreaterThan(2999);
    expect(high.delays[0]).toBeLessThan(3000);
  });

  it('makes a glint on a tick, and removes it when its animation ends', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1199);
    expect(h.tw.stats.spawned).toBe(0);
    vi.advanceTimersByTime(1);
    expect(h.tw.stats.spawned).toBe(1);
    expect(h.tw.stats.alive).toBe(1);
    h.glints[0].ended();
    expect(h.glints[0].removed).toBe(true);
    expect(h.tw.stats.alive).toBe(0);
    expect(h.tw.stats.played).toBe(1);
    // Its fallback removal (at 3,000 ms) finds it gone and counts nothing twice; by then a second glint is alive.
    vi.advanceTimersByTime(1900);
    expect(h.tw.stats.ended).toBe(1);
    expect(h.tw.stats.alive).toBe(1);
  });

  it('removes a glint 300 ms after its animation should have ended, if the end never came', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    vi.advanceTimersByTime(1799);
    expect(h.glints[0].removed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(h.glints[0].removed).toBe(true);
    expect(h.tw.stats.played).toBe(0);
  });

  it('never has more than 3 glints alive', () => {
    const h = harness();
    h.state.durMs = 100_000; // glints that outlive the test
    h.tw.sync();
    let most = 0;
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(1200);
      most = Math.max(most, h.tw.stats.alive, h.glints.filter((g) => !g.removed).length);
    }
    expect(most).toBe(3);
    expect(h.tw.stats.spawned).toBe(3);
    expect(h.tw.stats.capped).toBe(17);
  });

  it('makes nothing while the view is not at rest (a pan, a zoom, a slider move, covers showing)', () => {
    const h = harness();
    h.tw.sync();
    h.state.resting = false;
    vi.advanceTimersByTime(12_000);
    expect(h.tw.stats.spawned).toBe(0);
    expect(h.tw.stats.notResting).toBe(10);
    h.state.resting = true;
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('clears every glint when the view changes, and makes none for 500 ms after', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(2400);
    expect(h.tw.stats.alive).toBe(2);
    vi.advanceTimersByTime(700); // 3100 ms: the next tick is at 3600
    h.tw.viewChanged();
    expect(h.tw.stats.alive).toBe(0);
    expect(h.glints.every((g) => g.removed)).toBe(true);
    vi.advanceTimersByTime(500); // the tick at 3600 is exactly 500 ms after the change: still held
    expect(h.tw.stats.spawned).toBe(2);
    expect(h.tw.stats.notResting).toBe(1);
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(3);
  });

  it('never starts under reduced motion, and starts when the setting is lifted', () => {
    const h = harness();
    h.state.reduced = true;
    h.tw.sync();
    expect(h.delays).toEqual([]);
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.ticks).toBe(0);
    expect(h.glints).toEqual([]);
    h.state.reduced = false;
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('stops and clears in a hidden tab, and starts again when the tab shows', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.alive).toBe(1);
    h.state.hidden = true;
    h.tw.sync(); // what the visibilitychange listener calls
    expect(h.tw.stats.alive).toBe(0);
    expect(h.glints[0].removed).toBe(true);
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.ticks).toBe(1);
    h.state.hidden = false;
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(2);
  });

  it('stops on its own tick if the tab was hidden without the event arriving', () => {
    const h = harness();
    h.tw.sync();
    h.state.hidden = true;
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.ticks).toBe(0);
    expect(h.delays).toEqual([1200]);
  });

  it('keeps one timer however often it is synced', () => {
    const h = harness();
    h.tw.sync();
    h.tw.sync();
    h.tw.sync();
    expect(h.delays).toEqual([1200]);
  });

  it('counts nothing when no star can be picked, and tries again on the next tick', () => {
    const h = harness();
    h.state.noStar = true;
    h.tw.sync();
    vi.advanceTimersByTime(2400);
    expect(h.tw.stats.spawned).toBe(0);
    expect(h.tw.stats.ticks).toBe(2);
    h.state.noStar = false;
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('can be switched off and on (tests and the cost measurement use this)', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    h.tw.setEnabled(false);
    expect(h.tw.stats.alive).toBe(0);
    vi.advanceTimersByTime(9000);
    expect(h.tw.stats.spawned).toBe(1);
    h.tw.setEnabled(true);
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(2);
  });

  it('is finished by dispose: the timer is cleared, every glint removed, and sync cannot restart it', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(2400);
    h.tw.dispose();
    expect(h.tw.stats.alive).toBe(0);
    expect(h.glints.every((g) => g.removed)).toBe(true);
    h.tw.sync();
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.spawned).toBe(2);
  });
});

describe('pickStar', () => {
  // x = world x, y = world y: a projection that changes nothing.
  const to = { ox: 0, oy: 0, kx: 1, ky: -1 };
  const area = { left: 6, top: 6, right: 194, bottom: 194 };

  it('picks only an album that is on screen: every glint is on a real star', () => {
    const positions = new Float32Array([10, 10, 50, 50, 90, 90, 500, 500]);
    const classes = new Uint8Array([3, 3, 3, 0]);
    const random = seededRandom(3);
    const seen = new Set<number>();
    for (let k = 0; k < 500; k++) {
      const p = pickStar(positions, classes, to, area, [], random)!;
      seen.add(p.index);
      expect([p.x, p.y]).toEqual([positions[2 * p.index], positions[2 * p.index + 1]]);
    }
    // The brightest album is off screen and is never picked.
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('skips a star under a focus cover', () => {
    const positions = new Float32Array([10, 10, 50, 50, 90, 90]);
    const classes = new Uint8Array([3, 0, 3]);
    const random = seededRandom(5);
    const seen = new Set<number>();
    for (let k = 0; k < 500; k++) seen.add(pickStar(positions, classes, to, area, [{ x: 50, y: 50, half: 29 }], random)!.index);
    expect([...seen].sort()).toEqual([0, 2]);
  });

  it('returns nothing when no star is on screen', () => {
    expect(pickStar(new Float32Array([10, 10]), new Uint8Array([0]), to, { left: 200, top: 200, right: 300, bottom: 300 }, [], seededRandom(1))).toBeNull();
    expect(pickStar(new Float32Array(0), new Uint8Array(0), to, area, [], seededRandom(1))).toBeNull();
  });

  it('picks brighter classes more often, by the weights 12, 7, 2.5, 1', () => {
    const positions = new Float32Array([10, 10, 20, 20, 30, 30, 40, 40]);
    const classes = new Uint8Array([0, 1, 2, 3]);
    const random = seededRandom(11);
    const count = [0, 0, 0, 0];
    for (let k = 0; k < 22_500; k++) count[pickStar(positions, classes, to, area, [], random)!.index]++;
    // Expected 12,000, 7,000, 2,500 and 1,000 of 22,500; within 6%.
    [12_000, 7000, 2500, 1000].forEach((want, c) => expect(Math.abs(count[c] - want), `class ${c}`).toBeLessThan(want * 0.06 + 30));
  });

  it('gives about one glint in three a flare with the real mix of stars', () => {
    const n = 4081;
    const classes = drawStarClasses(n, seededRandom(5));
    const random = seededRandom(9);
    const positions = new Float32Array(2 * n);
    for (let i = 0; i < 2 * n; i++) positions[i] = 10 + random() * 180;
    let flares = 0;
    for (let k = 0; k < 3000; k++) if (classes[pickStar(positions, classes, to, area, [], random)!.index] < 2) flares++;
    // (41 * 12 + 367 * 7) / (41 * 12 + 367 * 7 + 1102 * 2.5 + 2571) = 0.365
    expect(flares / 3000).toBeGreaterThan(0.32);
    expect(flares / 3000).toBeLessThan(0.41);
  });
});

describe('worldToScreenMap', () => {
  it('gives the same screen point as worldToScreen, with and without the album panel offset', () => {
    const base = { position: { x: 0.13, y: -0.07 }, zoom: 1.7, left: -0.947, right: 0.947, top: 0.55, bottom: -0.55 };
    const cameras = [
      { ...base, view: null },
      { ...base, view: { enabled: true, fullWidth: 1440, fullHeight: 836, offsetX: -324, offsetY: 0, width: 1440, height: 836 } },
    ];
    for (const camera of cameras) {
      const m = worldToScreenMap(camera, 1440, 836);
      for (const [wx, wy] of [[0, 0], [0.3, -0.2], [-0.5, 0.41]]) {
        const p = worldToScreen(wx, wy, canvasRect(1440, 836), camera);
        expect(m.ox + wx * m.kx).toBeCloseTo(p.x, 6);
        expect(m.oy - wy * m.ky).toBeCloseTo(p.y, 6);
      }
    }
  });
});

describe('glintFor', () => {
  const pick = { index: 5, x: 100, y: 50 };

  it('is a bloom of radius 5.5 r + 5 on the star, with a flare 12 r each way on the two brightest classes', () => {
    const g = glintFor(pick, 0, 2.8, [255, 250, 244], false, () => 0.5);
    expect(g).toEqual({ index: 5, x: 100, y: 50, radius: expect.closeTo(20.4, 6), flare: expect.closeTo(67.2, 6), rgb: [255, 254, 252], peak: 1, durMs: 1500 });
    expect(glintFor(pick, 1, 1.9, [255, 250, 244], false, () => 0).flare).toBeCloseTo(45.6, 6);
    expect(glintFor(pick, 2, 1.4, [255, 250, 244], false, () => 0).flare).toBeNull();
    expect(glintFor(pick, 3, 1.1, [255, 250, 244], false, () => 0).flare).toBeNull();
  });

  it('is about 22 to 43 px across at the Overview scale and closer, and 18.8 px on the smallest star drawn', () => {
    // Star radii at 12.5 px covers run from 1.1 px (small) to 2.8 px (brightest), and up to about 3.5 px closer in.
    expect(2 * glintFor(pick, 3, 1.1, [255, 250, 244], false, () => 0).radius).toBeCloseTo(22.1, 6);
    expect(2 * glintFor(pick, 0, 3.0, [255, 250, 244], false, () => 0).radius).toBeCloseTo(43, 6);
    // Zoomed out to the whole map, the shader draws no star smaller than 0.8 px.
    expect(2 * glintFor(pick, 3, 0.8, [255, 250, 244], false, () => 0).radius).toBeCloseTo(18.8, 6);
  });

  it('takes the star tint three quarters of the way to white, lasts 1.2 to 1.8 s, and is quieter beside an open album', () => {
    const g = glintFor(pick, 3, 1.1, [248, 212, 198], true, () => 0);
    expect(g.rgb).toEqual([253, 244, 241]);
    expect(g.peak).toBe(0.6);
    expect(g.durMs).toBe(1200);
    expect(glintFor(pick, 3, 1.1, [248, 212, 198], false, () => 0.999999).durMs).toBe(1800);
  });

  it('paints a solid core that falls to nothing, in plain alpha with no blend mode', () => {
    expect(glintBackground([255, 254, 252])).toBe(
      'radial-gradient(circle closest-side, rgba(255,254,252,1) 0, rgba(255,254,252,1) 16%, rgba(255,254,252,.62) 32%, rgba(255,254,252,.24) 56%, rgba(255,254,252,.07) 80%, rgba(255,254,252,0) 100%)',
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/twinkle.test.ts)`
Expected: FAIL, `Failed to resolve import "./twinkle"`.

- [ ] **Step 4: Write the pure module**

Create `frontcreck/src/components/map/state/twinkle.ts`:

```ts
/** Twinkle: every so often one star on screen catches the light. Ported from the Trifid prototype
 * (docs/design/trifid-theme/prototype/src/twinkle.js and its README, section Twinkle). This file is the pure
 * part: the settings, which star is picked, what its glint looks like, and the timer that decides when. The
 * DOM is written by overlays/Twinkle.tsx and canvas/TwinkleDriver.tsx. The map canvas is never redrawn for a
 * glint: nothing here asks for a frame. */
import { viewBounds, type OrthoCameraLike, type ViewBounds } from './projection';

/** Wait between two glints, ms: a fresh random value in this range each time. */
export const TWINKLE_WAIT_MS = [1200, 3000] as const;
/** Most glints alive at once. */
export const TWINKLE_MAX = 3;
/** One glint, in and out, ms. */
export const TWINKLE_DUR_MS = [1200, 1800] as const;
/** A glint whose `animationend` never came is removed this long after its animation should have ended. */
export const TWINKLE_REMOVE_SLACK_MS = 300;
/** How much likelier a star of each class is to glint (brighter stars more often). */
export const TWINKLE_WEIGHT = [12, 7, 2.5, 1] as const;
/** Bloom radius in CSS px: [0] times the star's drawn radius, plus [1]. */
export const TWINKLE_BLOOM = [5.5, 5] as const;
/** The two brightest classes also get a thin four point flare, this many star radii long each way. */
export const TWINKLE_FLARE = 12;
/** Peak opacity, and the quieter peak beside an open album, where the stars are dimmed. */
export const TWINKLE_PEAK = 1;
export const TWINKLE_PEAK_FOCUS = 0.6;
/** No glint is made for this long after the view last changed. */
export const TWINKLE_SETTLE_MS = 500;
/** Glints keep this far inside the visible map, and this far clear of a focus cover. */
export const TWINKLE_EDGE_PX = 6;
export const TWINKLE_COVER_CLEAR_PX = 6;

/** Screen position of a world point, canvas CSS px: x = ox + wx * kx, y = oy - wy * ky. */
export interface WorldToScreen {
  ox: number;
  oy: number;
  kx: number;
  ky: number;
}

/** The camera's projection as four numbers, so a pass over every album allocates nothing (the same result as
 * state/projection.ts worldToScreen with canvasRect). */
export function worldToScreenMap(c: OrthoCameraLike, width: number, height: number): WorldToScreen {
  const b = viewBounds(c);
  const kx = width / (b.right - b.left);
  const ky = height / (b.top - b.bottom);
  return { ox: -(c.position.x + b.left) * kx, oy: (b.top + c.position.y) * ky, kx, ky };
}

/** A focus cover no glint may sit under: its centre and half size (clearance included), canvas CSS px. */
export interface TwinkleCover {
  x: number;
  y: number;
  half: number;
}

export interface StarPick {
  /** Album index: a glint always sits on an album's star. */
  index: number;
  x: number;
  y: number;
}

/** One album whose star is inside `area` and not under a cover, brighter classes likelier: a weighted
 * reservoir, one pass and no list. `positions` is flat [x0, y0, x1, y1, ...] in world units. Null when no star
 * qualifies. */
export function pickStar(
  positions: Float32Array,
  classes: Uint8Array,
  to: WorldToScreen,
  area: ViewBounds,
  covers: readonly TwinkleCover[],
  random: () => number,
): StarPick | null {
  const n = Math.min(classes.length, positions.length >> 1);
  let index = -1;
  let total = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const x = to.ox + positions[2 * i] * to.kx;
    const y = to.oy - positions[2 * i + 1] * to.ky;
    if (x < area.left || x > area.right || y < area.top || y > area.bottom) continue;
    let under = false;
    for (const c of covers) {
      if (Math.abs(x - c.x) < c.half && Math.abs(y - c.y) < c.half) {
        under = true;
        break;
      }
    }
    if (under) continue;
    const w = TWINKLE_WEIGHT[classes[i]] ?? 1;
    total += w;
    if (random() * total < w) {
      index = i;
      px = x;
      py = y;
    }
  }
  return index < 0 ? null : { index, x: px, y: py };
}

export interface Glint {
  /** The album it sits on. */
  index: number;
  /** Centre, canvas CSS px: the star's own position. */
  x: number;
  y: number;
  /** Bloom radius, CSS px. */
  radius: number;
  /** Flare length from tip to tip, CSS px; null on the two fainter classes. */
  flare: number | null;
  /** The star's tint three quarters of the way to white, 0..255. */
  rgb: [number, number, number];
  peak: number;
  durMs: number;
}

/** The glint of a picked star. `starRadiusPx` is the star's radius as the shader draws it, `tint` its colour. */
export function glintFor(pick: StarPick, cls: number, starRadiusPx: number, tint: readonly number[], besideAlbum: boolean, random: () => number): Glint {
  return {
    index: pick.index,
    x: pick.x,
    y: pick.y,
    radius: TWINKLE_BLOOM[0] * starRadiusPx + TWINKLE_BLOOM[1],
    flare: cls < 2 ? 2 * TWINKLE_FLARE * starRadiusPx : null,
    rgb: [0, 1, 2].map((k) => Math.round((tint[k] + 765) / 4)) as [number, number, number],
    peak: besideAlbum ? TWINKLE_PEAK_FOCUS : TWINKLE_PEAK,
    durMs: Math.round(TWINKLE_DUR_MS[0] + random() * (TWINKLE_DUR_MS[1] - TWINKLE_DUR_MS[0])),
  };
}

/** The bloom: near white with alpha (a solid core, then a soft fall to nothing), so it shows on dark sky and on
 * bright gas without a blend mode. */
export function glintBackground(rgb: readonly number[]): string {
  const c = rgb.join(',');
  return `radial-gradient(circle closest-side, rgba(${c},1) 0, rgba(${c},1) 16%, rgba(${c},.62) 32%, rgba(${c},.24) 56%, rgba(${c},.07) 80%, rgba(${c},0) 100%)`;
}

/** A glint in the DOM: how long its animation runs, and how to take it out. */
export interface GlintHandle {
  durMs: number;
  remove: () => void;
}

export interface TwinkleHost {
  /** The tab is hidden. */
  hidden: () => boolean;
  reducedMotion: () => boolean;
  /** Stars are dots, the map is what the visitor is looking at, and nothing is moving. */
  resting: () => boolean;
  /** Puts one glint on a star, wired to call `ended` when its animation ends. Null when no star could be picked. */
  spawn: (ended: () => void) => GlintHandle | null;
}

export interface TwinkleEnv {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
  random: () => number;
}

export interface TwinkleStats {
  ticks: number;
  /** Ticks skipped because the view was not at rest. */
  notResting: number;
  /** Ticks skipped at the cap. */
  capped: number;
  spawned: number;
  /** Glints whose animation ran to its end. */
  played: number;
  /** Glints removed, played or not. */
  ended: number;
  /** Times the layer was cleared with glints in it. */
  cleared: number;
  alive: number;
  /** Longest star pick and DOM write, ms. */
  worstSpawnMs: number;
}

export interface Twinkle {
  /** Starts or stops the timer to match the tab, the motion setting and the switch. Call when one of them changes. */
  sync: () => void;
  /** The view changed (camera, slider, size, route): every glint goes, and none is made for TWINKLE_SETTLE_MS. */
  viewChanged: () => void;
  /** A switch for tests and measurements; on by default. */
  setEnabled: (on: boolean) => void;
  /** Stops for good: the timer is cleared and every glint removed. */
  dispose: () => void;
  stats: TwinkleStats;
}

/** One timer between glints and one per glint as a fallback removal. No frame loop, and no frame is requested. */
export function createTwinkle(host: TwinkleHost, env: TwinkleEnv): Twinkle {
  const stats: TwinkleStats = { ticks: 0, notResting: 0, capped: 0, spawned: 0, played: 0, ended: 0, cleared: 0, alive: 0, worstSpawnMs: 0 };
  const live = new Set<{ handle: GlintHandle | null }>();
  let timer: number | null = null;
  let lastMove = env.now();
  let enabled = true;
  let disposed = false;

  const running = (): boolean => enabled && !disposed && !host.hidden() && !host.reducedMotion();
  const clear = (): void => {
    if (live.size) stats.cleared++;
    for (const g of live) g.handle?.remove();
    live.clear();
    stats.alive = 0;
  };
  const finish = (g: { handle: GlintHandle | null }, played: boolean): void => {
    if (!live.delete(g)) return;
    g.handle?.remove();
    stats.alive = live.size;
    stats.ended++;
    if (played) stats.played++;
  };
  const schedule = (): void => {
    timer = env.setTimeout(tick, TWINKLE_WAIT_MS[0] + env.random() * (TWINKLE_WAIT_MS[1] - TWINKLE_WAIT_MS[0]));
  };
  function tick(): void {
    timer = null;
    if (!running()) return;
    stats.ticks++;
    if (!host.resting() || env.now() - lastMove <= TWINKLE_SETTLE_MS) stats.notResting++;
    else if (live.size >= TWINKLE_MAX) stats.capped++;
    else {
      const t0 = env.now();
      const g: { handle: GlintHandle | null } = { handle: null };
      const handle = host.spawn(() => finish(g, true));
      if (handle) {
        g.handle = handle;
        live.add(g);
        stats.spawned++;
        stats.alive = live.size;
        env.setTimeout(() => finish(g, false), handle.durMs + TWINKLE_REMOVE_SLACK_MS);
        stats.worstSpawnMs = Math.max(stats.worstSpawnMs, Math.round((env.now() - t0) * 100) / 100);
      }
    }
    schedule();
  }
  const sync = (): void => {
    if (!running()) {
      if (timer !== null) env.clearTimeout(timer);
      timer = null;
      clear();
      return;
    }
    if (timer === null) schedule();
  };
  return {
    sync,
    viewChanged: () => {
      lastMove = env.now();
      clear();
    },
    setEnabled: (on) => {
      enabled = on;
      sync();
    },
    dispose: () => {
      disposed = true;
      sync();
    },
    stats,
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/twinkle.test.ts)`
Expected: PASS, 25 tests. (The timer, the pick, the projection and the glint maths were run with plain `node` against these tests while the plan was written: all pass.)

- [ ] **Step 6: Write the failing layer test**

Create `frontcreck/src/components/map/overlays/Twinkle.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getOverlayEl } from '../state/overlayEls';
import type { Glint } from '../state/twinkle';
import { TwinkleLayer, addGlint } from './Twinkle';

const GLINT: Glint = { index: 42, x: 100, y: 50, radius: 20, flare: 67.2, rgb: [255, 254, 252], peak: 1, durMs: 1500 };
const numbers = (text: string): number[] => (text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('TwinkleLayer', () => {
  it('is an empty decorative layer that registers itself for the driver and leaves when unmounted', () => {
    const { container, unmount } = render(<TwinkleLayer />);
    const layer = container.querySelector('.tw-layer')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer.childElementCount).toBe(0);
    expect(getOverlayEl('twinkle')).toBe(layer);
    unmount();
    expect(getOverlayEl('twinkle')).toBeNull();
  });
});

describe('addGlint', () => {
  it('adds two nodes centred on the star and named after its album, with nothing to focus, click or read', () => {
    const layer = document.createElement('div');
    const handle = addGlint(layer, GLINT, () => {});
    expect(layer.querySelectorAll('*')).toHaveLength(2);
    const el = layer.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('I');
    expect(el.className).toBe('tw');
    expect(el.dataset.album).toBe('42');
    // Top left corner at the star minus the radius, so the box (two radii wide) is centred on the star.
    expect(numbers(el.style.transform)).toEqual([80, 30]);
    expect(parseFloat(el.style.width)).toBe(40);
    expect(parseFloat(el.style.height)).toBe(40);
    const dot = el.firstElementChild as HTMLElement;
    expect(dot.tagName).toBe('B');
    expect(dot.className).toBe('tw-flare');
    expect(dot.style.getPropertyValue('--fl')).toBe('67.2px');
    expect(dot.style.getPropertyValue('--peak')).toBe('1.00');
    expect(dot.style.animationDuration).toBe('1500ms');
    expect(layer.querySelectorAll('a, button, input, [tabindex], [role], [title]')).toHaveLength(0);
    expect(layer.textContent).toBe('');
    expect(handle.durMs).toBe(1500);
  });

  it('has no flare on the two fainter classes, and a quieter peak beside an open album', () => {
    const layer = document.createElement('div');
    addGlint(layer, { ...GLINT, flare: null, peak: 0.6 }, () => {});
    const dot = layer.querySelector('b') as HTMLElement;
    expect(dot.className).toBe('');
    expect(dot.style.getPropertyValue('--fl')).toBe('');
    expect(dot.style.getPropertyValue('--peak')).toBe('0.60');
  });

  it('reports the end of its animation, and remove takes it out (twice is harmless)', () => {
    const layer = document.createElement('div');
    const ended = vi.fn();
    const handle = addGlint(layer, GLINT, ended);
    layer.querySelector('b')!.dispatchEvent(new Event('animationend'));
    expect(ended).toHaveBeenCalledTimes(1);
    handle.remove();
    expect(layer.childElementCount).toBe(0);
    expect(() => handle.remove()).not.toThrow();
  });
});
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/overlays/Twinkle.test.tsx)`
Expected: FAIL, `Failed to resolve import "./Twinkle"`.

- [ ] **Step 7: Write the layer and the glint writer**

Create `frontcreck/src/components/map/overlays/Twinkle.tsx`:

```tsx
'use client';

import { setOverlayEl } from '../state/overlayEls';
import { glintBackground, type Glint, type GlintHandle } from '../state/twinkle';

/** The star glints' layer: over the map canvas and under the region names. Empty as far as React knows;
 * TwinkleDriver adds and removes the glints itself (two nodes each, at most three glints at once). Decoration
 * only: hidden from assistive technology, and nothing in it takes pointer events (styles/map.css). */
export function TwinkleLayer() {
  return (
    <div
      className="tw-layer"
      aria-hidden="true"
      ref={(el) => {
        setOverlayEl('twinkle', el);
      }}
    />
  );
}

/** Puts one glint in the layer: a positioned <i> the size of the bloom, centred on the star, holding one <b>
 * that the CSS keyframe `tw-glint` animates (opacity and transform only); the flare is the <b>'s two
 * pseudo-elements. Nothing is read from layout or style: the writes are one appendChild with inline styles and,
 * later, one remove(). `ended` is called when the animation ends. */
export function addGlint(layer: HTMLElement, glint: Glint, ended: () => void): GlintHandle {
  const el = document.createElement('i');
  const dot = document.createElement('b');
  el.className = 'tw';
  // Which album's star this sits on (browser tests check the glint is centred on it).
  el.dataset.album = String(glint.index);
  el.style.transform = `translate(${(glint.x - glint.radius).toFixed(2)}px,${(glint.y - glint.radius).toFixed(2)}px)`;
  el.style.width = `${(2 * glint.radius).toFixed(2)}px`;
  el.style.height = `${(2 * glint.radius).toFixed(2)}px`;
  dot.style.background = glintBackground(glint.rgb);
  dot.style.setProperty('--peak', glint.peak.toFixed(2));
  if (glint.flare !== null) {
    dot.className = 'tw-flare';
    dot.style.setProperty('--fl', `${glint.flare.toFixed(1)}px`);
  }
  dot.style.animationDuration = `${glint.durMs}ms`;
  dot.addEventListener('animationend', ended);
  el.appendChild(dot);
  layer.appendChild(el);
  return { durMs: glint.durMs, remove: () => el.remove() };
}
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/overlays/Twinkle.test.tsx)`
Expected: PASS, 4 tests. If jsdom hands back `animationDuration` in another spelling (for example `1.5s`), compare the number and the unit instead of the string; do not drop the assertion.

- [ ] **Step 8: Write the driver**

Create `frontcreck/src/components/map/canvas/TwinkleDriver.tsx`:

```tsx
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { REDUCED_MOTION_QUERY, prefersReducedMotion } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import { addGlint } from '../overlays/Twinkle';
import { MUTED_DOT_SCALE } from '../shaders/album';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, getPlacedMarkers } from '../state/overlayEls';
import { getStageTop } from '../state/stageTop';
import { pageStarClasses, starCoreCssPx, starTint, type StarClass } from '../state/stars';
import { TWINKLE_COVER_CLEAR_PX, TWINKLE_EDGE_PX, createTwinkle, glintFor, pickStar, worldToScreenMap, type Twinkle, type TwinkleHost } from '../state/twinkle';
import { coverFade } from '../state/zoomLimits';
import { STAR_WHITE } from '../theme';

/** What the last drawn frame showed. A frame that changes none of these (a hover redraw) leaves the glints be. */
interface Drawn {
  x: number;
  y: number;
  zoom: number;
  inset: number;
  sliderT: number;
  width: number;
  height: number;
  dimmed: boolean;
  interactive: boolean;
  focus: object | null;
}

/** Star glints (state/twinkle.ts): one timer decides when, this component says whether the map is at rest and
 * writes the glint to the DOM layer (overlays/Twinkle.tsx). It never asks the canvas for a frame. Its frame
 * callback only notices that the view changed: any change of camera, slider, size or route clears the glints,
 * and none is made while the view moves, for 500 ms after, once covers show, under reduced motion or in a
 * hidden tab. Mounted after MarkerDriver, whose placed covers a glint keeps clear of. */
export function TwinkleDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const twinkle = useRef<Twinkle | null>(null);
  const drawn = useRef<Drawn>({ x: NaN, y: NaN, zoom: NaN, inset: NaN, sliderT: NaN, width: 0, height: 0, dimmed: false, interactive: false, focus: null });

  useEffect(() => {
    const host: TwinkleHost = {
      hidden: () => document.hidden,
      reducedMotion: prefersReducedMotion,
      resting: () => {
        const s = useMapStore.getState();
        const layer = getOverlayEl('twinkle');
        if (!layer || !s.data) return false;
        // Where the map is what the visitor looks at: Explore, an album on desktop, the phone's map mode
        // (all `interactive`) and Home. Not About, 404 or the phone's album list, which cover the map.
        // An attribute read, not a layout read.
        if (!s.input.interactive && layer.closest<HTMLElement>('.map-pane')?.dataset.view !== 'home') return false;
        if (s.dragging || s.animating || s.nudging || s.rigMoving || s.morphing) return false;
        // Stars only: none once covers begin to show (16 px).
        return coverFade(camera.zoom, get().size.height) <= 0;
      },
      spawn: (ended) => {
        const s = useMapStore.getState();
        const layer = getOverlayEl('twinkle');
        if (!layer || !s.data) return null;
        const { width, height } = get().size;
        const classes = pageStarClasses(s.data.n);
        // Inside the visible map: right of the album panel, below the header, above the phone's slider panel.
        const area = {
          left: Math.max(0, s.insetCurrent) + TWINKLE_EDGE_PX,
          top: getStageTop() + TWINKLE_EDGE_PX,
          right: width - TWINKLE_EDGE_PX,
          bottom: height - s.input.bottomCover - TWINKLE_EDGE_PX,
        };
        // Beside an open album: never under one of its covers (as MarkerDriver last placed them).
        const covers = s.input.focus ? getPlacedMarkers().map((m) => ({ x: m.x, y: m.y, half: m.drawn / 2 + TWINKLE_COVER_CLEAR_PX })) : [];
        const pick = pickStar(positionsRef.current, classes, worldToScreenMap(camera, width, height), area, covers, Math.random);
        if (!pick) return null;
        const cls = classes[pick.index] as StarClass;
        // The star's own radius as the shader draws it (larger on the dimmed Home map), and its own tint.
        const radius = (starCoreCssPx(cls, camera.zoom, height) / 2) * (s.input.dimmed ? MUTED_DOT_SCALE : 1);
        const tint = s.theme ? starTint(s.theme.stars.lead[pick.index]) : STAR_WHITE;
        return addGlint(layer, glintFor(pick, cls, radius, tint, s.input.focus !== null, Math.random), ended);
      },
    };
    const tw = createTwinkle(host, {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      now: () => performance.now(),
      random: Math.random,
    });
    twinkle.current = tw;
    // Test and measurement hook: the counters. The switch is the app store's twinkleOn (no control on screen).
    if (window.__rmr) window.__rmr.twinkle = { stats: tw.stats };
    const unsubscribe = useAppStore.subscribe((s, prev) => {
      if (s.twinkleOn !== prev.twinkleOn) tw.setEnabled(s.twinkleOn);
    });
    const sync = () => tw.sync();
    document.addEventListener('visibilitychange', sync);
    const motion = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
    motion?.addEventListener('change', sync);
    // Starts the timer, unless the store, the tab or the motion setting says no.
    tw.setEnabled(useAppStore.getState().twinkleOn);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', sync);
      motion?.removeEventListener('change', sync);
      tw.dispose();
      twinkle.current = null;
      if (window.__rmr) delete window.__rmr.twinkle;
    };
  }, [camera, get, positionsRef]);

  useFrame(() => {
    const tw = twinkle.current;
    if (!tw) return;
    const { input, sliderT, insetCurrent } = useMapStore.getState();
    const { width, height } = get().size;
    const d = drawn.current;
    const { x, y } = camera.position;
    if (
      d.x === x &&
      d.y === y &&
      d.zoom === camera.zoom &&
      d.inset === insetCurrent &&
      d.sliderT === sliderT &&
      d.width === width &&
      d.height === height &&
      d.dimmed === input.dimmed &&
      d.interactive === input.interactive &&
      d.focus === input.focus
    ) {
      return;
    }
    d.x = x;
    d.y = y;
    d.zoom = camera.zoom;
    d.inset = insetCurrent;
    d.sliderT = sliderT;
    d.width = width;
    d.height = height;
    d.dimmed = input.dimmed;
    d.interactive = input.interactive;
    d.focus = input.focus;
    tw.viewChanged();
  });

  return null;
}
```

- [ ] **Step 9: Mount the layer and the driver**

In `frontcreck/src/components/map/MusicMap.tsx`, after the import Task 7 added (`import { RegionNames } from './overlays/RegionNames';`) add:

```ts
import { TwinkleLayer } from './overlays/Twinkle';
```

and replace:

```tsx
      <Scene initialCamera={initialCamera} onApi={onApi} />
      {/* Under the focus markers, the hover label and the map's controls (z-index 2). */}
      <RegionNames />
```

with:

```tsx
      <Scene initialCamera={initialCamera} onApi={onApi} />
      {/* Star glints: over the canvas, under the region names (z-index 1). */}
      <TwinkleLayer />
      {/* Under the focus markers, the hover label and the map's controls (z-index 2). */}
      <RegionNames />
```

In `frontcreck/src/components/map/canvas/Scene.tsx`, after the import Task 7 added (`import { RegionNamesDriver } from "./RegionNamesDriver";`) add:

```ts
import { TwinkleDriver } from "./TwinkleDriver";
```

and replace:

```tsx
      <RegionNamesDriver positionsRef={positionsRef} />
      <FrameCounter />
```

with:

```tsx
      <RegionNamesDriver positionsRef={positionsRef} />
      {/* After MarkerDriver: a glint keeps clear of the covers it placed. It never asks for a frame. */}
      <TwinkleDriver positionsRef={positionsRef} />
      <FrameCounter />
```

- [ ] **Step 10: Style the glints**

In `frontcreck/src/styles/map.css`, directly after the `.rn.fair b` rule (the last region names rule from Task 7) add:

```css

/* twinkle (canvas/TwinkleDriver.tsx): star glints in a layer over the map canvas and under the region names.
 * Only opacity and transform animate. Decoration: nothing here takes pointer events. */
.tw-layer { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.map-pane[data-view="about"] .tw-layer, .map-pane[data-view="other"] .tw-layer { display: none; }
.tw { position: absolute; left: 0; top: 0; display: block; pointer-events: none; }
.tw b { position: relative; display: block; width: 100%; height: 100%; border-radius: 50%; opacity: 0; will-change: opacity, transform; animation: tw-glint 1.5s ease-in-out both; }
/* the two brightest star classes: a thin four point flare, --fl long from tip to tip */
.tw b.tw-flare::before, .tw b.tw-flare::after { content: ""; position: absolute; left: 50%; top: 50%; width: var(--fl, 40px); height: 1px; margin: -.5px 0 0 calc(var(--fl, 40px) / -2); background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, .9) 50%, rgba(255, 255, 255, 0)); }
.tw b.tw-flare::after { transform: rotate(90deg); }
@keyframes tw-glint { 0% { opacity: 0; transform: scale(.4); } 40% { opacity: var(--peak, 1); transform: scale(1); } 58% { opacity: var(--peak, 1); transform: scale(1); } 100% { opacity: 0; transform: scale(.6); } }
@media (prefers-reduced-motion: reduce) { .tw-layer { display: none; } }
```

These are the prototype's rules with its ids turned into classes (`#twinkle` is `.tw-layer`) and its two debug variants (`tw-hold`, `tw-ring`) left out.

- [ ] **Step 11: Teach two waits and the gas spec's pixel readers about the glints**

Existing test helpers wait for, or look at, a page that is now never fully still. Each edit below is as narrow as it can be, and says what the check still proves. The sharper image wait `waitForGasSharpSettled` is already in `helpers.ts` (Task 0); do not add a second copy. The browser checks of this task and of Task 9 call it before they count canvas frames at rest (handoff of 2026-10-05).

In `frontcreck/e2e/helpers.ts`, replace `waitForAnimations` (L68-73, with its doc comment; part 1's longer `waitForMap` sits above it):

```ts
/** Waits until every finite CSS animation and transition on the page has finished. */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
  );
}
```

with:

```ts
/** Waits until every finite CSS animation and transition on the page has finished. The star glints (inside
 * .tw-layer) are left out, as endless animations already are: a new one starts every 1.2 to 3 s for as long as
 * the map rests, so waiting for them would never end. */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      if (a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity) return true;
      const target = (a.effect as KeyframeEffect | null)?.target;
      return target instanceof Element && target.closest('.tw-layer') !== null;
    }),
  );
}

/** Switches the star glints off for this page load. A check that reads screenshot pixels while stars show
 * calls this first: a glint is a bright spot of up to 43 px at a random place and time. */
export async function twinkleOff(page: Page): Promise<void> {
  await page.evaluate(() => window.__rmr?.getState().setTwinkleOn(false));
}
```

What `waitForAnimations` still proves: every other animation and transition on the page (panels, cards, rows, fades) has finished before its callers take a screenshot or measure. Only animations whose target is inside `.tw-layer` are skipped.

In `frontcreck/e2e/a11y.spec.ts`, replace L12-13:

```ts
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 2000 })
```

with:

```ts
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          // The star glints never settle (one starts every 1.2 to 3 s). They are aria-hidden decoration over
          // the canvas and change no colour that axe reads, so the audit does not wait for them.
          const target = (a.effect as KeyframeEffect | null)?.target;
          return a.playState !== 'running' || (target instanceof Element && target.closest('.tw-layer') !== null);
        }),
      null,
      { timeout: 2000 },
    )
```

What the audit still proves: axe runs on every route only once every panel, card and fade has settled, with the same 2 s bound and the same error that names what is still running. The glints are the one thing it no longer waits for.

In `frontcreck/e2e/gas.spec.ts` (written by part 1), add `twinkleOff` to the names imported from `'./helpers'` (today `isPhone, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap, waitForMapQuiet`), and make it the first statement of `lumaAt` (L50 after Task 0's `beforeEach` comment; find it by text), the helper that takes the screenshot:

```ts
async function lumaAt(page: Page, r: Rect, q = 0.5): Promise<number> {
  await twinkleOff(page);
```

The file has one other reader: the registration test ("on screen the gas lies under the albums it was baked for: ..."), which samples a 16 px grid of bare map points in `sharp(await page.screenshot())` (L1287). Put `await twinkleOff(page);` on its own line directly before `const shotPng = await sharp(await page.screenshot())`. A glint is up to 43 px across and would put a bright spot on its grid.

What it still proves: the same assertions on the same pixels of the gas; the only thing removed is a random bright spot that could land in the measured patch. Switching the glints off is an app store change whose only listener, TwinkleDriver, removes glints from the DOM and requests no canvas frame (Task 8 step 8), so it draws no canvas frame and leaves the frame counts of the sharper image test as they were. Then run `grep -n "screenshot(" frontcreck/e2e/*.ts` and look at every reader. `helpers.ts` `shot` (review pictures) needs nothing. `explore.spec.ts` `pixels` and `meanLuma` read at cover zoom, where there are no glints, and need nothing. Any other reader that samples pixels while stars show gets the same first line; name it in the commit body.

- [ ] **Step 12: Write the browser checks**

Create `frontcreck/e2e/twinkle.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

const IR = '/album/in-rainbows-radiohead';
const GLINT = '.tw-layer .tw';

const stats = (page: Page) => page.evaluate(() => ({ ...window.__rmr!.twinkle!.stats }));
/** The frame counter the idle checks use (canvas/FrameCounter.tsx): one count per frame the map canvas draws. */
const frames = (page: Page) => page.evaluate(() => window.__rmr!.frames ?? 0);

async function openAtRest(page: Page, url = '/map'): Promise<void> {
  await page.goto(url);
  await waitForMap(page);
  await waitForCameraIdle(page);
  // The names' face has arrived and been measured: nothing is left that could ask the canvas for a late frame.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForMapQuiet(page, 400);
  // Part 1's sharper gas image (desktops with a real GPU) fades in about a second after the map settles; wait for
  // it, so the frame counts below see only what the glints do. On the test browser its flag says 'waiting' or 'off'.
  await waitForGasSharpSettled(page);
}

test('glints play on the resting map and the canvas does not draw one frame for them', async ({ page }) => {
  await openAtRest(page);
  const s0 = await stats(page);
  const f0 = await frames(page);
  // Three more glints: at one every 1.2 to 3 s that is under 10 s.
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThanOrEqual(s0.spawned + 3);
  // Long enough for the first of them to have played to its end.
  await expect.poll(async () => (await stats(page)).played, { timeout: 10_000, intervals: [250] }).toBeGreaterThan(s0.played);
  expect((await frames(page)) - f0).toBe(0);
  const s1 = await stats(page);
  expect(s1.alive).toBeLessThanOrEqual(3);
  expect(await page.locator(GLINT).count()).toBeLessThanOrEqual(3);
  // The star pick and the DOM write together stay far under one frame.
  expect(s1.worstSpawnMs).toBeLessThan(16);
});

test('a glint sits on an album star, is two nodes, and takes no pointer events', async ({ page }) => {
  await openAtRest(page);
  const seen = await page.waitForFunction(
    () => {
      const g = document.querySelector<HTMLElement>('.tw-layer .tw');
      if (!g) return null;
      const r = g.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const star = window.__rmr!.map!.screenPoint(Number(g.dataset.album));
      const top = document.elementFromPoint(cx, cy);
      return {
        album: g.dataset.album ?? '',
        off: star ? Math.hypot(star.x - cx, star.y - cy) : 999,
        size: r.width,
        nodes: g.querySelectorAll('*').length + 1,
        hitIsGlint: !!top?.closest('.tw-layer'),
        pointerEvents: getComputedStyle(g).pointerEvents,
        layerPointerEvents: getComputedStyle(g.parentElement!).pointerEvents,
        hidden: g.closest('[aria-hidden="true"]') !== null,
        animated: getComputedStyle(g.firstElementChild!).animationName,
      };
    },
    null,
    { timeout: 20_000, polling: 100 },
  );
  const g = await seen.jsonValue();
  const albums: unknown[] = await page.evaluate(async () => (await fetch('/data/albums.json')).json());
  // Every star is an album, and a glint is not a new star: it carries an album's index and is centred on it.
  expect(Number(g!.album)).toBeGreaterThanOrEqual(0);
  expect(Number(g!.album)).toBeLessThan(albums.length);
  expect(g!.off).toBeLessThanOrEqual(1);
  // 18.8 px across on the smallest star at the whole-map zoom, up to about 43 px on the brightest closer in.
  expect(g!.size).toBeGreaterThanOrEqual(18);
  expect(g!.size).toBeLessThanOrEqual(46);
  expect(g!.nodes).toBe(2);
  expect(g!.hitIsGlint).toBe(false);
  expect(g!.pointerEvents).toBe('none');
  expect(g!.layerPointerEvents).toBe('none');
  expect(g!.hidden).toBe(true);
  expect(g!.animated).toBe('tw-glint');
});

test('a pan clears the glints at once and none is made while the map moves', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await openAtRest(page);
  await page.waitForFunction(() => document.querySelectorAll('.tw-layer .tw').length > 0, null, { timeout: 20_000, polling: 100 });
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2 + 30, vp.height / 2 + 10, { steps: 3 });
  await expect(page.locator(GLINT)).toHaveCount(0);
  const during = (await stats(page)).spawned;
  // Keep panning for 4 s: longer than the longest wait between two glints.
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(vp.width / 2 + 30 + (i % 2 ? 40 : -40), vp.height / 2 + 10 + (i % 3) * 8, { steps: 2 });
    await page.waitForTimeout(100);
  }
  expect((await stats(page)).spawned).toBe(during);
  await expect(page.locator(GLINT)).toHaveCount(0);
  await page.mouse.up();
  await waitForCameraIdle(page);
  // At rest again, they come back.
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(during);
});

test('no glints once covers show', async ({ page }) => {
  await openAtRest(page);
  await page.locator('canvas.map-canvas').focus();
  // Zoom in until covers show (the Explore hint is marked data-zoomed once the cover fade passes a quarter).
  for (let i = 0; i < 14 && (await page.locator('.map-hint').getAttribute('data-zoomed')) !== '1'; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect(page.locator('.map-hint')).toHaveAttribute('data-zoomed', '1');
  await waitForMapQuiet(page, 400);
  await expect(page.locator(GLINT)).toHaveCount(0);
  const before = await stats(page);
  await page.waitForTimeout(7000); // at least two ticks of the timer
  const after = await stats(page);
  expect(after.spawned).toBe(before.spawned);
  expect(after.notResting).toBeGreaterThan(before.notResting);
  await expect(page.locator(GLINT)).toHaveCount(0);
});

test('no glints under reduced motion: the timer never starts and the layer is not shown', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAtRest(page);
  await page.waitForTimeout(7000);
  const s = await stats(page);
  expect(s.ticks).toBe(0);
  expect(s.spawned).toBe(0);
  expect(await page.locator('.tw-layer').evaluate((el) => getComputedStyle(el).display)).toBe('none');
});

test('no glints in a hidden tab, and they return when it shows again', async ({ page }) => {
  await openAtRest(page);
  await page.waitForFunction(() => document.querySelectorAll('.tw-layer .tw').length > 0, null, { timeout: 20_000, polling: 100 });
  // A headless page cannot be put in the background: stand in for it by answering `hidden` and sending the event.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator(GLINT)).toHaveCount(0);
  const before = await stats(page);
  await page.waitForTimeout(7000);
  const after = await stats(page);
  expect(after.ticks).toBe(before.ticks);
  expect(after.spawned).toBe(before.spawned);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(after.spawned);
});

test('beside an open album glints are quieter and never under a cover; the phone album list has none', async ({ page, isMobile }) => {
  await openAtRest(page, IR);
  if (isMobile) {
    // The list covers the map: the timer ticks but makes nothing.
    await page.waitForTimeout(7000);
    expect((await stats(page)).spawned).toBe(0);
    await expect(page.locator(GLINT)).toHaveCount(0);
    return;
  }
  await expect(page.locator('.mk')).not.toHaveCount(0);
  // Sample the glints of 12 s: each one's peak, and whether its star lies under a focus cover.
  const samples = await page.evaluate(async () => {
    const out: { peak: string; underCover: boolean }[] = [];
    const seenEls = new Set<Element>();
    const t0 = performance.now();
    while (performance.now() - t0 < 12_000) {
      for (const g of document.querySelectorAll<HTMLElement>('.tw-layer .tw')) {
        if (seenEls.has(g)) continue;
        seenEls.add(g);
        const r = g.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const underCover = [...document.querySelectorAll('.mk')].some((m) => {
          const b = m.getBoundingClientRect();
          return cx > b.left && cx < b.right && cy > b.top && cy < b.bottom;
        });
        out.push({ peak: (g.firstElementChild as HTMLElement).style.getPropertyValue('--peak'), underCover });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  });
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter((s) => s.underCover)).toEqual([]);
  expect([...new Set(samples.map((s) => s.peak))]).toEqual(['0.60']);
});

test('About shows no glints', async ({ page }) => {
  await page.goto('/about');
  await waitForMap(page);
  await waitForMapQuiet(page, 400);
  await page.waitForTimeout(7000);
  expect((await stats(page)).spawned).toBe(0);
  expect(await page.locator('.tw-layer').evaluate((el) => getComputedStyle(el).display)).toBe('none');
});
```

The first test is the one the decision asks for: it reads `window.__rmr.frames`, the counter `canvas/FrameCounter.tsx` increments once per drawn canvas frame and that the idle check of `e2e/map.spec.ts` and the `idleFrames` budget of `scripts/perf/perf.mjs` both read, before and after at least three glints, and demands a difference of exactly 0.

Run, one at a time (each waits for the one before it):

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/twinkle.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/twinkle.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/map.spec.ts e2e/a11y.spec.ts e2e/pages.spec.ts e2e/gas.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/map.spec.ts e2e/phone.spec.ts e2e/pages.spec.ts --project=phone --workers=1)
```

Expected: typecheck and lint clean; all unit tests pass; `twinkle.spec.ts` passes 8 tests on desktop, and 7 with 1 skipped (the mouse drag) on the phone project; the other specs pass as before. `e2e/map.spec.ts` "renders on demand" is not edited: it still sees at most one canvas frame in its idle window, now with glints playing in it. If lint flags the `delete window.__rmr.twinkle` line or a ref mutation in the driver, follow the file's convention: one `// eslint-disable-next-line <rule> -- <reason>` on that line, with the rule name lint printed.

If "glints play on the resting map and the canvas does not draw one frame for them" fails on the frame count, find what asked for the frame (search the three new files for `invalidate` and `requestRender`: there must be none) and fix it. Do not change 0 to 1.

- [ ] **Step 13: Measure what it costs in a real browser, and hold the rule**

Create `frontcreck/scripts/perf/twinkle-cost.mjs`:

```js
#!/usr/bin/env node
/**
 * node scripts/perf/twinkle-cost.mjs [--mode gpu|software] [--viewport desktop|phone]
 *
 * What the star glints cost in a real browser, against the production build (run `npm run build` first).
 * Per renderer and viewport: 20 s of the resting map with the glints on, then 20 s with them off; on desktop
 * the same again with the mouse moving over the map. Each run records the longest task, the longest gap
 * between animation frames, the frames the map canvas drew, and whether a long task began around a glint being
 * made. Writes scripts/perf/out/twinkle-cost-<time>.json, prints a Markdown table, and exits 1 when a rule is
 * broken. The budgets of perf.mjs are not touched: this script only adds measurements. (The hover path has its
 * own script: docs/design/trifid-theme/reviews/baseline/hover-measure.mjs.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { assertNativeChrome } from '../check-native.mjs';
import { startServer } from '../serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PORT = 3210;
let BASE = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODES = {
  software: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  gpu: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Metal'],
};
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
/** Length of one run, ms. */
const RUN_MS = 20000;
/** One star pick and DOM write may take at most this (half a frame at 60 Hz). */
const SPAWN_LIMIT_MS = 8;
/** With the glints on, the longest task and the longest frame gap may exceed the same run without them by at
 * most this: the spread between two identical runs. */
const NOISE_MS = 8;

/* Runs in the page before its scripts. */
const IN_PAGE = () => {
  const lt = [];
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) lt.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  }
  window.__fx = {
    /** Watches the page for `ms`: long tasks, the longest gap between animation frames, glints made, frames
     * the map canvas drew. Counting animation frames does not make the map draw. */
    async watch(ms) {
      const layer = document.querySelector('.tw-layer');
      const made = [];
      const mo = new MutationObserver((records) => {
        for (const r of records) if (r.addedNodes.length) made.push(performance.now());
      });
      if (layer) mo.observe(layer, { childList: true });
      const f0 = window.__rmr?.frames ?? 0;
      const t0 = performance.now();
      let last = t0;
      let longestGap = 0;
      let mostAlive = 0;
      while (performance.now() - t0 < ms) {
        const now = await new Promise((r) => requestAnimationFrame(() => r(performance.now())));
        longestGap = Math.max(longestGap, now - last);
        last = now;
        if (layer) mostAlive = Math.max(mostAlive, layer.childElementCount);
      }
      mo.disconnect();
      await new Promise((r) => setTimeout(r, 150)); // the observer delivers long tasks a little late
      const tasks = lt.filter(([start]) => start >= t0 && start <= last);
      const atGlint = tasks.filter(([start, dur]) => made.some((m) => m >= start - 20 && m <= start + dur + 20));
      return {
        longTasks: tasks.length,
        longestTaskMs: Math.round(Math.max(0, ...tasks.map((t) => t[1]))),
        longestGapMs: Math.round(longestGap),
        glints: made.length,
        mostAlive,
        longTasksAtGlint: atGlint.length,
        canvasFrames: (window.__rmr?.frames ?? 0) - f0,
      };
    },
  };
};

async function runs(browser, mode, vpName) {
  const rows = [];
  const ctx = await browser.newContext(VIEWPORTS[vpName]);
  const page = await ctx.newPage();
  await page.addInitScript(IN_PAGE);
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  // The map has drawn, the glints are there, the camera rests, and part 1's gas has settled ('ready': all three
  // stops are in; 'off': there is none), as e2e/helpers.ts waitForMap asks.
  await page.waitForFunction(
    () => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && !!window.__rmr?.twinkle && !window.__rmr.map.isAnimating() && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(2500); // fonts, names and the first frames have settled
  // Part 1's sharper gas image (gpu desktop only) is fetched about a second after the map settles and fades in over
  // up to 14 frames: wait until it is not on its way and neither its flag nor the frame count has changed for 2.5 s
  // (e2e/helpers.ts waitForGasSharpSettled), so the still runs count no frame of it.
  await page.waitForFunction(
    (quiet) => {
      const s = String(window.__rmr?.gasSharp);
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (s === 'loading' || window.__gsF !== f || window.__gsS !== s) {
        window.__gsF = f;
        window.__gsS = s;
        window.__gsT = now;
        return false;
      }
      return now - window.__gsT >= quiet;
    },
    2500, // longer than GAS_SHARP_RETRY_MS (2000, shaders/gas.ts): a failed load goes back to 'waiting' and retries
    { polling: 50, timeout: 45000 },
  );
  const watch = (on) =>
    page.evaluate(
      async ([enabled, ms]) => {
        const tw = window.__rmr.twinkle;
        window.__rmr.getState().setTwinkleOn(enabled);
        tw.stats.worstSpawnMs = 0;
        await new Promise((r) => setTimeout(r, 1000));
        const r = await window.__fx.watch(ms);
        return { ...r, worstSpawnMs: tw.stats.worstSpawnMs };
      },
      [on, RUN_MS],
    );
  for (const on of [true, false]) rows.push({ mode, vp: vpName, run: 'still', twinkle: on ? 'on' : 'off', ...(await watch(on)) });
  if (vpName === 'desktop') {
    // The mouse wanders over the map, rests, and wanders again: a hover redraws the map; the glints must add nothing to it.
    for (const on of [true, false]) {
      const pending = watch(on);
      const t0 = Date.now();
      let k = 0;
      while (Date.now() - t0 < RUN_MS) {
        k++;
        await page.mouse.move(520 + 380 * Math.sin(k / 9), 470 + 200 * Math.cos(k / 13), { steps: 2 });
        await page.waitForTimeout(k % 40 < 30 ? 30 : 400);
      }
      rows.push({ mode, vp: vpName, run: 'mouse moving', twinkle: on ? 'on' : 'off', ...(await pending) });
      await page.mouse.move(5, 5);
    }
  }
  await ctx.close();
  return rows;
}

function check(rows) {
  const fails = [];
  for (const r of rows.filter((q) => q.twinkle === 'on')) {
    const where = `${r.mode} ${r.vp} ${r.run}`;
    const off = rows.find((q) => q.mode === r.mode && q.vp === r.vp && q.run === r.run && q.twinkle === 'off');
    if (r.glints === 0) fails.push(`${where}: no glint was made in ${RUN_MS / 1000} s, so nothing was measured`);
    if (r.mostAlive > 3) fails.push(`${where}: ${r.mostAlive} glints alive at once (at most 3)`);
    if (r.run === 'still' && r.canvasFrames !== 0) fails.push(`${where}: the map canvas drew ${r.canvasFrames} frames while glints played (must be 0)`);
    if (r.worstSpawnMs > SPAWN_LIMIT_MS) fails.push(`${where}: making a glint took ${r.worstSpawnMs} ms (limit ${SPAWN_LIMIT_MS} ms)`);
    if (r.longTasksAtGlint > 0) fails.push(`${where}: ${r.longTasksAtGlint} long tasks began around a glint being made`);
    if (off && r.longestTaskMs > off.longestTaskMs + NOISE_MS) fails.push(`${where}: longest task ${r.longestTaskMs} ms with glints, ${off.longestTaskMs} ms without`);
    if (off && r.longestGapMs > off.longestGapMs + NOISE_MS) fails.push(`${where}: longest frame gap ${r.longestGapMs} ms with glints, ${off.longestGapMs} ms without`);
  }
  return fails;
}

function table(rows) {
  const head = '| Renderer | Viewport | Run | Glints | Made | Most alive | Longest task (ms) | Long tasks | Long tasks at a glint | Longest frame gap (ms) | Canvas frames | Longest glint write (ms) |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|';
  const line = (r) => `| ${r.mode} | ${r.vp} | ${r.run} | ${r.twinkle} | ${r.glints} | ${r.mostAlive} | ${r.longestTaskMs} | ${r.longTasks} | ${r.longTasksAtGlint} | ${r.longestGapMs} | ${r.canvasFrames} | ${r.worstSpawnMs} |`;
  return [head, sep, ...rows.map(line)].join('\n');
}

async function main() {
  const server = await startServer(PORT);
  BASE = server.base;
  const rows = [];
  try {
    for (const mode of opt('--mode') ? [opt('--mode')] : Object.keys(MODES)) {
      const browser = await chromium.launch({ channel: 'chrome', headless: true, args: MODES[mode] });
      await assertNativeChrome(browser); // a translated (x86_64) Chrome inflates every timing about 50x
      try {
        for (const vp of opt('--viewport') ? [opt('--viewport')] : Object.keys(VIEWPORTS)) rows.push(...(await runs(browser, mode, vp)));
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.stop();
  }
  const fails = check(rows);
  console.log(`\n${table(rows)}\n`);
  const outDir = path.join(ROOT, 'scripts/perf/out');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `twinkle-cost-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ rows, fails }, null, 1));
  console.log(`Saved ${path.relative(ROOT, file)}`);
  if (fails.length) {
    console.error(`FAIL\n${fails.join('\n')}`);
    process.exit(1);
  }
  console.log('The glints cost no responsiveness.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

The app chooses its gas shader as it does for a visitor: the lighter one (`GAS_LITE`) under the software renderer, the full one on the GPU. That is what is measured; the script sets no `__rmrGasLite`.

Build once and run it (about five minutes; it launches Chrome with the software renderer, then with the GPU, one after the other; nothing else may be running a browser or loading the machine; on mains power, since on battery under 20 percent Chrome caps pages at 30 frames a second):

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch; cd frontcreck && npm run build && node scripts/perf/twinkle-cost.mjs)
```

Expected: `arm64`, a table of twelve rows (per renderer: desktop still on and off, desktop with the mouse moving on and off, phone still on and off), a saved `scripts/perf/out/twinkle-cost-<time>.json`, and the line `The glints cost no responsiveness.`

**The rule.** The twinkle costs responsiveness if the script reports any of these, on either renderer:
1. a long task (50 ms or more) that began within 20 ms of a glint being made;
2. with the glints on, a longest task or a longest frame gap more than 8 ms over the same run with them off (8 ms is the spread between two identical runs; if a first run fails only on this, run the script once more, and treat it as real if it repeats);
3. one glint taking more than 8 ms to make (`worstSpawnMs`, half a frame);
4. any canvas frame drawn during a still run with the glints on;
5. more than 3 glints alive at once.

If none is reported, the twinkle stays as built. If any is, do not ask the owner: apply the first of these that makes the script pass, rerun it, and tell him afterwards.
- *Cheaper, first:* no flares. In `overlays/Twinkle.tsx` delete the `if (glint.flare !== null) { ... }` block, and delete the two `.tw-flare` rules from `map.css`. In `Twinkle.test.tsx` the first test then expects `dot.className` to be `''` and `--fl` to be `''`; say in the test's title that flares were dropped for speed.
- *Cheaper, second:* one glint at a time, less often: `TWINKLE_MAX = 1` and `TWINKLE_WAIT_MS = [2500, 5000]`. Update the numbers the unit tests pin (the settings test, the cadence bounds, the cap test) to the new values and say in their titles that they are the cheapened settings.
- *Dropped:* remove the two mounts of step 9 (`<TwinkleLayer />`, `<TwinkleDriver />`) and their imports, delete `e2e/twinkle.spec.ts`, and keep the module, the store flag and their unit tests so it can come back.

Write `docs/design/trifid-theme/reviews/app-twinkle-cost.md` with: the date, the commit (`git rev-parse --short HEAD`), the machine and Chrome version, the command, the table the script printed, the five rules with pass or fail beside each, a comparison with the prototype's own numbers (prototype README, section "Twinkle": longest star pass 2.3 to 3.1 ms, no task over 50 ms within 20 ms of a glint), and one line of outcome: "kept as built", "kept without flares", "kept at one glint every 2.5 to 5 s" or "dropped", with the failing numbers if it was cheapened or dropped. If it was cheapened or dropped, also report it to the orchestrator in this task's hand-back so the owner is told.

- [ ] **Step 14: Commit**

```bash
git add frontcreck/src/types/global.d.ts frontcreck/src/lib/store.ts frontcreck/src/lib/store.test.ts frontcreck/src/components/map/state/twinkle.ts frontcreck/src/components/map/state/twinkle.test.ts frontcreck/src/components/map/overlays/Twinkle.tsx frontcreck/src/components/map/overlays/Twinkle.test.tsx frontcreck/src/components/map/canvas/TwinkleDriver.tsx frontcreck/src/components/map/MusicMap.tsx frontcreck/src/components/map/canvas/Scene.tsx frontcreck/src/styles/map.css frontcreck/e2e/helpers.ts frontcreck/e2e/a11y.spec.ts frontcreck/e2e/gas.spec.ts frontcreck/e2e/twinkle.spec.ts frontcreck/scripts/perf/twinkle-cost.mjs docs/design/trifid-theme/reviews/app-twinkle-cost.md
git commit -m "feat(map): star twinkle on a timer, DOM and CSS only

One glint every 1.2 to 3 s, at most three alive, on real album stars. The
map canvas is never redrawn for it; nothing while the view moves, once
covers show, under reduced motion or in a hidden tab. Cost measured in
docs/design/trifid-theme/reviews/app-twinkle-cost.md.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

---

### Task 9: End-to-end checks, comparison with the baseline, performance and fidelity

**Files:**
- Create: `frontcreck/e2e/names.spec.ts`
- Create: `frontcreck/e2e/stars.spec.ts`
- Create: `docs/design/trifid-theme/reviews/app-perf-part2.md`, with its raw numbers in `docs/design/trifid-theme/reviews/perf-part2/` (three perf runs, `.txt` and `.json`, and the hover run's console output `hover.txt`)
- Create: `docs/design/trifid-theme/reviews/app-hover-part2.json` (the hover measure's own output)
- Create: `docs/design/trifid-theme/reviews/app-fidelity-part2.md`
- Modify: `docs/design/trifid-theme/reviews/baseline/capture.mjs` (a `--still` option: the header comment L13-24, the flag loop L57, the usage line L62, after L74, L132, L178-179, L195-198, L900-902; line numbers as part 1 left the script, and Task 0 may move them, so each edit is found by its text; the baseline shots are not retaken)

**Interfaces:**
- Consumes: `e2e/helpers.ts` (`act`, `camera`, `shot`, `tabTo`, `waitForCameraIdle`, `waitForGasSharpSettled`, `waitForMap`, `waitForMapQuiet`), `COPY`, `window.__rmr` (`frames`, `starSeed`, `map`, `getState`, part 1's `gas` and `gasSharp`), part 1's `window.__rmrGasLite` switch; `scripts/perf/perf.mjs` and `scripts/perf/twinkle-cost.mjs`; the baseline in `docs/design/trifid-theme/reviews/baseline/` (`README.md`, `REGRESSION-CHECKLIST.md`, `BASELINE-PERF.md`, `capture.mjs`, `hover-measure.mjs`, raw numbers under `perf/`, screenshots under `shots/`).
- Produces: screenshots `frontcreck/test-results/shots/{desktop,phone}-names-toggle-{on,off}.png` for the owner; the two review notes above.

These checks need part 1's theme data file to be served, so that names exist at all.

- [ ] **Step 1: Write the names spec**

Create `frontcreck/e2e/names.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, camera, shot, tabTo, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

/** A region name the driver has placed. */
const SHOWN = '.rn:not(.off)';

// The test browser renders in software, where the app would draw the gas with its lighter shader. The pictures
// this spec saves go to the owner and the fidelity reviewer, so they show the full shader, as a GPU draws it
// (the same init script as e2e/gas.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
});

async function openMap(page: Page, expectNames = true): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  if (expectNames) await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  // The lettering face has arrived and the names have been measured again with it.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForMapQuiet(page, 300);
}

test('region names show at the overview, as plain lettering inside the map', async ({ page, isMobile }) => {
  await openMap(page);
  const count = await page.locator(SHOWN).count();
  if (isMobile) expect(count).toBeLessThanOrEqual(4);
  else expect(count).toBeGreaterThan(4);
  await expect(page.locator('.rn-layer')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('.rn-layer').evaluate((el) => el.querySelectorAll('a, button, [tabindex], [role], [title]').length)).toBe(0);
  const vp = page.viewportSize()!;
  const boxes = await page.locator(`${SHOWN} b`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })));
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(vp.width);
    expect(b.bottom).toBeLessThanOrEqual(vp.height);
  }
  // No name sits on the site header (true wherever the stage starts: below the header today, under it once
  // part 3 extends it), on the slider card or on the zoom corner.
  for (const sel of ['header.top', '.mode', '.map-zoom']) {
    const k = (await page.locator(sel).boundingBox())!;
    for (const b of boxes) expect(b.left < k.x + k.width && b.right > k.x && b.top < k.y + k.height && b.bottom > k.y, `a name over ${sel}`).toBe(false);
  }
  // Wide capitals in Tenor Sans.
  const style = await page.locator(`${SHOWN} b`).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { transform: cs.textTransform, tenor: document.fonts.check(`400 16px ${cs.fontFamily}`), size: parseFloat(cs.fontSize) };
  });
  expect(style.transform).toBe('uppercase');
  expect(style.tenor).toBe(true);
  if (isMobile) {
    expect(style.size).toBeGreaterThanOrEqual(13);
    expect(style.size).toBeLessThanOrEqual(16);
  }
});

test('region names are gone once the map is zoomed in, and back at the overview', async ({ page }) => {
  await openMap(page);
  await page.locator('canvas.map-canvas').focus();
  // Eight key steps of 1.4 (14.8 times): covers are then over 13 px on both projects, whatever the map opens on
  // (Task 0's Overview, the opening view: 11.1 px on desktop, 2.7 px on the phone; the whole cloud, which '0' and
  // the fit button give: about 4 px on desktop and about 1.8 px on the phone (267.8 px per world unit), where four
  // steps would still leave them under 13. Names show at both framings).
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect(page.locator(SHOWN)).toHaveCount(0);
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  await expect.poll(() => page.locator(SHOWN).count()).toBeGreaterThan(0);
});

test('region names never take pointer events', async ({ page, isMobile }) => {
  await openMap(page);
  const centres = await page.locator(SHOWN).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, onName: !!top?.closest('.rn-layer'), onCanvas: !!top?.classList.contains('map-canvas') };
    }),
  );
  expect(centres.length).toBeGreaterThan(0);
  expect(centres.filter((c) => c.onName)).toEqual([]);
  expect(await page.locator('.rn-layer').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  if (isMobile) return;
  // A drag that starts on a name pans the map under it.
  const start = centres.find((c) => c.onCanvas)!;
  const before = await camera(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40, { steps: 6 });
  await page.mouse.up();
  await waitForCameraIdle(page);
  expect((await camera(page)).x).toBeLessThan(before.x);
});

test('no region names while an album is open, whatever the zoom, and they return when it closes', async ({ page, isMobile }) => {
  await openMap(page);
  const overview = await camera(page);
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  if (isMobile) await page.locator('.fab-map').tap(); // the phone's map mode
  await waitForCameraIdle(page);
  // Zoom out with the album still open until the map is as far out as the overview, where names would show.
  for (let i = 0; i < 6; i++) {
    await act(page.getByRole('button', { name: COPY.map.zoomOut }), isMobile);
    await waitForCameraIdle(page);
  }
  expect((await camera(page)).zoom).toBeLessThanOrEqual(overview.zoom * 1.3);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.getState().focus !== null)).toBe(true);
  await expect(page.locator(SHOWN)).toHaveCount(0);
  // The names are on (the button says so); it is the open album that hides them.
  await expect(page.getByRole('button', { name: COPY.map.names })).toHaveAttribute('aria-pressed', 'true');
  if (isMobile) return;
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForCameraIdle(page);
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 10_000 }).toBeGreaterThan(0);
});

test('with names on, the idle map still draws at most one frame', async ({ page }) => {
  await openMap(page);
  // Part 1's sharper gas image may fade in about a second after the map settles (desktops with a real GPU): wait.
  await waitForGasSharpSettled(page);
  expect(await page.locator(SHOWN).count()).toBeGreaterThan(0);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200); // nothing should happen: the idle window in which the map must not draw
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1).toBeLessThanOrEqual(1);
});

test('the slider swaps one stop\'s names for the other\'s', async ({ page }) => {
  await openMap(page);
  await expect(page.locator(`${SHOWN}[data-stop="balanced"]`).first()).toBeVisible();
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(() => page.locator(`${SHOWN}[data-stop="mood"]`).count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await waitForMapQuiet(page, 300);
  await expect(page.locator(`${SHOWN}:not([data-stop="mood"])`)).toHaveCount(0);
});

test('the names toggle hides the names, is remembered across a reload, and brings them back', async ({ page, isMobile }, info) => {
  const hydration: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /hydrat/i.test(m.text())) hydration.push(m.text());
  });
  await openMap(page);
  // One button with one fixed name; only its pressed state changes.
  const toggle = page.getByRole('button', { name: COPY.map.names, exact: true });
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // A separate box of the zoom buttons' size, 8 px above the stack; 44 px on a phone.
  const box = (await toggle.boundingBox())!;
  const zoomIn = (await page.getByRole('button', { name: COPY.map.zoomIn }).boundingBox())!;
  expect([box.width, box.height]).toEqual([zoomIn.width, zoomIn.height]);
  expect(Math.round(zoomIn.y - (box.y + box.height))).toBe(8);
  expect(Math.round(box.x)).toBe(Math.round(zoomIn.x));
  if (isMobile) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await shot(page, info, 'names-toggle-on');

  await act(toggle, isMobile);
  await expect(page.locator('.rn')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAttribute('aria-label', COPY.map.names);
  expect(await page.evaluate(() => window.localStorage.getItem('rmr-names'))).toBe('0');
  await waitForMapQuiet(page, 300);
  await shot(page, info, 'names-toggle-off');

  await page.reload();
  await openMap(page, false);
  await expect(page.getByRole('button', { name: COPY.map.names, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rn')).toHaveCount(0);
  expect(hydration).toEqual([]);

  await act(page.getByRole('button', { name: COPY.map.names, exact: true }), isMobile);
  await expect(page.getByRole('button', { name: COPY.map.names, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator(SHOWN).count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.localStorage.getItem('rmr-names'))).toBe('1');
});

test('the names toggle is reachable and usable with the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await openMap(page);
  await tabTo(page, (el, label) => el.getAttribute('aria-label') === label, 40, COPY.map.names);
  const toggle = page.getByRole('button', { name: COPY.map.names, exact: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('.rn')).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator(SHOWN).count()).toBeGreaterThan(0);
});

test('the dimmed map behind Home shows no names', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect(page.locator(SHOWN)).toHaveCount(0);
  await expect(page.locator('.rn-layer')).toBeHidden();
});
```

- [ ] **Step 2: Write the stars spec**

Create `frontcreck/e2e/stars.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { waitForCameraIdle, waitForMap } from './helpers';

const seed = (page: Page) => page.evaluate(() => window.__rmr!.starSeed);

async function openMap(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
}

test('star sizes are dealt once per page load, and afresh on the next', async ({ page }) => {
  await openMap(page);
  const first = await seed(page);
  expect(Number.isInteger(first)).toBe(true);
  // A slider move, a pan and a zoom later, the page still has the same deal.
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await waitForCameraIdle(page);
  await page.locator('canvas.map-canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('+');
  await waitForCameraIdle(page);
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  expect(await seed(page)).toBe(first);
  // Two more loads: three seeds drawn from 4,294,967,296 values, all different.
  await page.reload();
  await waitForMap(page);
  const second = await seed(page);
  await page.reload();
  await waitForMap(page);
  const third = await seed(page);
  expect(new Set([first, second, third]).size).toBe(3);
});

test('a test can ask for a repeatable sky by setting the seed before the map loads', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __rmr: { starSeed: number } }).__rmr = { starSeed: 7 };
  });
  await openMap(page);
  expect(await seed(page)).toBe(7);
});
```

- [ ] **Step 3: Run both on desktop**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/names.spec.ts e2e/stars.spec.ts --project=desktop --workers=1)`
Expected: PASS, 9 tests in `names.spec.ts` and 2 in `stars.spec.ts`. Wait for it to finish before the next command (one browser at a time).

If "region names show at the overview" fails on the count (`toBeGreaterThan(4)`), print how many labels the theme file holds for Balanced and how many the driver placed before changing anything: the layout is expected to place most of the labels whose centre is on screen at Task 0's opening view.

- [ ] **Step 4: Run both on the phone project**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/names.spec.ts e2e/stars.spec.ts --project=phone --workers=1)`
Expected: PASS, 8 tests and 1 skipped (keyboard) in `names.spec.ts`, 2 in `stars.spec.ts`. The first names test holds the phone to at most four names.

- [ ] **Step 5: Phone screenshots of the toggle, for the owner**

Option B was never rendered on a phone. The phone project's viewport is 390 x 844, and steps 3 and 4 saved:

```
frontcreck/test-results/shots/phone-names-toggle-on.png
frontcreck/test-results/shots/phone-names-toggle-off.png
frontcreck/test-results/shots/desktop-names-toggle-on.png
frontcreck/test-results/shots/desktop-names-toggle-off.png
```

Open the two phone images and check, before showing them: the toggle is a separate 44 px box 8 px above the three zoom buttons, the whole corner clears the slider panel, there are at most four names, and in the off image the slash is crisp with a clear gap through the dimmed letters. Then show all four to the owner with the one open question: the wording of the screen reader label ("Place names", with an on/off pressed state). Record his answer in `docs/design/trifid-theme/HANDOFF.md` only when he has given it; do not write the approval yourself.

- [ ] **Step 6: Run the suites this part touches, one at a time**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/map.spec.ts e2e/focus.spec.ts e2e/album.spec.ts e2e/a11y.spec.ts e2e/flows.spec.ts e2e/search.spec.ts e2e/pages.spec.ts e2e/twinkle.spec.ts e2e/gas.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/map.spec.ts e2e/focus.spec.ts e2e/phone.spec.ts e2e/album.spec.ts e2e/pages.spec.ts e2e/twinkle.spec.ts e2e/gas.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test --project=nowebgl --workers=1)
```

Expected: all pass. `gas.spec.ts` is part 1's and this part edited two of its lines (Task 8 step 11); `nowebgl.spec.ts` still sees no request for a theme file, with the names and the twinkle in the build. `e2e/map.spec.ts` "renders on demand" still sees at most one idle canvas frame with the names on and the glints playing. `e2e/a11y.spec.ts` passes axe on `/map` with the names layer and the twinkle layer present (both are `aria-hidden`) and on the hot badge (room-coloured digits on the lamp token). `flows`, `search`, `album` and `pages` cover the trail, the toasts, the keyboard paths and the hover tip, which this part must not have changed.

Do **not** run or fix `e2e/explore.spec.ts` here: its `isLamp` and `meanLuma` assertions are expected to fail after Task 2 and belong to part 3 (listed at the end of Task 2). Every other failure in an existing spec is a regression of this part: fix the code, not the test.

- [ ] **Step 7: Performance runs and the size check, compared with the baseline**

The baseline (`docs/design/trifid-theme/reviews/baseline/BASELINE-PERF.md`) is three full runs of `npm run perf` on the current site, with a "Sizes" table, a "Medians (three runs)" table and, under "Every run, per combination", one table per column with the rows `Run 1 | Run 2 | Run 3 | Median | Min to max | Budget`. Its raw files are `baseline/perf/perf-run1.txt` to `perf-run3.txt` and `.json`. Do the same here, so the numbers compare like for like. Each run measures software and GPU rendering on desktop and phone, one browser at a time, plus part 1's reported only `gpu desktop2x` column, and takes a little longer than the baseline's 90 s. Nothing else may be using a browser or loading the machine while they run; the baseline was taken on a shared machine and says so, so read the spread, not only the median. Run on mains power: on battery under 20 percent Chrome caps pages at 30 frames a second (handoff). Run `npm run perf` with no flags: part 1's `--no-gas` and `--gas-lite off|force` are for comparisons, and without them the app picks its gas shader as for a visitor (the lighter one in the software columns).

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch   # must print arm64
mkdir -p docs/design/trifid-theme/reviews/perf-part2
(cd frontcreck && npm run build)
for i in 1 2 3; do (cd frontcreck && npm run perf > ../docs/design/trifid-theme/reviews/perf-part2/perf-run$i.txt 2>&1; cp "$(ls -t scripts/perf/out/perf-*.json | head -1)" ../docs/design/trifid-theme/reviews/perf-part2/perf-run$i.json); sleep 20; done
grep -h "First-load JS\|Server HTML\|All budgets met\|FAIL" docs/design/trifid-theme/reviews/perf-part2/perf-run*.txt
tail -n 30 docs/design/trifid-theme/reviews/perf-part2/perf-run3.txt
```

Each `.txt` holds the line `First-load JS of / (gzip): <n> KB with nomodule scripts (budget 200 KB), <n> KB without; three.js chunk on first load: <n> KB`, the `Server HTML:` line, a table with the four judged columns (`software desktop`, `software phone`, `gpu desktop`, `gpu phone`) and, since part 1's change to the perf script, a fifth, reported only column `gpu desktop2x` (dpr 2) and four reported only rows: "Gas shader (reported only)" (`gasLite` in the JSON: lighter or full), "Nebula visible (reported only)" (`gasShownMs`), "Deep zoom drag worst frame gap (reported only)" (`deepDragGapMs`) and "Deep zoom, slider between stops, worst frame gap (reported only)" (`deepMorphGapMs`), and either `All budgets met.` or `FAIL` with the misses. To repeat one column: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone)` (modes `software`, `gpu`; viewports `desktop`, `phone`).

**How speed is judged (the same rule in all three parts).** Run `npm run perf` three times, one after another. Each measure is judged on the median of the three runs: the median must be inside its budget, and it is compared with the baseline's median and min to max in `BASELINE-PERF.md`. A median above the baseline's worst run is a finding even when it is inside budget. Any single run over budget is named and explained in the write-up (the baseline has three such single run outliers: a 345 ms startup long task on gpu desktop, a 53 ms zoom frame gap on gpu phone, a 181 ms slider to list on software phone).

The budgets in `frontcreck/scripts/perf/budgets.json` are not edited, and no run is thrown away. A median over a budget means this part broke it; a median above the baseline's worst run is a finding to explain or fix. Do not relax a budget and do not move on with a failing median. Compare each number with part 1's as well (`docs/design/trifid-theme/reviews/app-perf-part1.md`, raw files in `perf-part1/`), so what this part changed is told apart from what part 1 did. On this machine the only trustworthy comparison of two builds is to run them in turn in the same session (handoff: other sessions keep the load between 5 and 15): before calling a number worse than part 1's or the baseline's, build the commit before Task 1 of this part in a temporary worktree and run the two builds alternately, as part 1 did in its fix rounds, and record both.

**The size check.** Read the first-load JS number from the perf script's own line (the `grep` above; it is the same in all three runs). Baseline: 190.5 KB with nomodule scripts, 151.9 KB without, budget 200 KB; after part 1: 191.2 KB and 152.6 KB (`app-perf-part1.md`); the three.js chunk on first load is 0 KB and must stay 0. What this part adds to the first load is small by construction: `lib/namesPref.ts` and the two flags in `lib/store.ts`, `overlays/NamesToggle.tsx` (through `ZoomControls`, which `MapStage` imports), the two icons in `Icon.tsx`, one string in `copy.ts`, the stand-in constant in `MapPreviewStrip.tsx`, and the larger `state/focusLayout.ts` where the strip pulls it in. Everything else (stars, shader, names layout, names layer and driver, twinkle, stage top) is imported only under `MusicMap`, which is the lazy map chunk. Tenor Sans is CSS and a font file, not JS, and is not preloaded. If the number is over 200 KB, or the three.js chunk is not 0, stop: something from the map chunk is imported by first-load code (look for an import of `state/stars`, `state/twinkle`, `state/namesLayout`, `shaders/album` or `three` outside `components/map/MusicMap.tsx`'s tree). A rise of more than 1 KB over part 1's 191.2 KB is a finding to explain even under the budget; say how much of the 8.8 KB part 1 left is used, since part 3 needs the rest.

**Per frame work: which effect, and the cheaper version of each.** The measure with the least room is the GPU zoom frame gap: baseline median 38 ms on desktop (34 to 43) and 44 ms on phone (42 to 53) against a budget of 50. Three things this part adds run on, or are drawn in, every zoom and drag frame. If the median of the GPU zoom, drag or morph frame gap is above the baseline's worst run (43, 21, 20 on desktop; 53, 22, 18 on phone) or over 50, tell the three apart with the one column that shows it, three runs each, changing one thing at a time on the working tree and putting it back afterwards (`git checkout -- <file>`; nothing of this is committed):

| Effect | How to measure it alone | Cheaper version, taken without asking (the owner is told afterwards) |
|---|---|---|
| Names layer, placed on every drawn frame whose view changed (`RegionNamesDriver`; a hover frame only compares) | Remove the line `<RegionNamesDriver positionsRef={positionsRef} />` from `canvas/Scene.tsx`, build, run the column three times, compare the medians | First: no font size change while zooming, so the driver writes transforms only and no name is laid out or repainted during a zoom: in `RegionNamesDriver.tsx` pass `zoomK: 1` in place of `zoomK: nameZoomK(coverPx)`. Second: a lighter halo to composite: in `map.css` `.rn b`, cut the `text-shadow` list to its 2 px, 8 px and 26 px entries (the stroke and `--h` stay, so the 4.5:1 rule still holds; rerun `names.spec.ts`). If neither is enough, stop and report the numbers to the orchestrator: hiding names while the camera moves would need a frame to bring them back, which the driver must not ask for |
| Star glow fill rate (the star quads are larger than the old dots: up to about 46 CSS px on the 1% brightest, 25 on the bright 9%, 12 to 15 on the rest, at most, against 3 to 7.2 px dots) | In `shaders/album.ts` replace `float haloT = smoothstep(5.0, 7.0, coverCss);` by `float haloT = 0.0;`, build, run the column three times | First: keep that line (`haloT = 0.0`: no wide halos, every bloom ends at 2.6 radii, so the largest quad is about 25 px, set by the under-disc); the shader test "keeps the sprite quad to the star's reach" still passes. Second: also no under-disc (`under = 0.0;` after the `float under = ...` line; the quad is then the bloom only) and update the under-disc test's title to say it was dropped for speed. Do not shrink the star cores or drop the tile cross-fade |
| Twinkle (one compare of ten numbers per drawn frame, and clearing at most three glints when the view starts to move) | `scripts/perf/twinkle-cost.mjs` (step 8), and remove `<TwinkleDriver positionsRef={positionsRef} />` from `canvas/Scene.tsx` for the column | Task 8 step 13's list: no flares, then one glint at a time, then dropped |

The star glow's cheaper versions also apply if the drag or zoom frame gap median of the `gpu desktop2x` column is over 50 ms or above its baseline's worst run: at dpr 2 the star quads cover four times the pixels.

The lines cannot be the cause on the Explore map (they exist only with an album open); for the album transition and the morph compare with the commit before Task 3 (the marker layout runs on every drawn frame beside an open album; its cheaper version is in Task 3's notes).

One case `npm run perf` does not reach: a slider move on `/map` with names showing. Its morph row is measured on an album page, where names never show, and during a morph on the map the driver writes each fading name's `--a` on every frame, which repaints that name's lettering with its halo. Measure it once by hand on the GPU build before writing the note: on `/map` at the overview, press Sonic with the names on and then with them off (the toggle), and read the worst frame gap of each with the same loop the perf script uses for its morph row (`window.__perf.gaps(700)` is only present under the perf script, so paste its few lines into one `page.evaluate` of a throwaway script run from `frontcreck/`, one browser, headless Chrome with the perf script's GPU flags). If names on is over 50 ms or more than 10 ms worse than names off, take the cheaper version without asking: write the fade as `opacity` on the `.rn` element (it has its own layer) in place of `--a` on its `<b>`, and rerun `names.spec.ts`. Record both numbers in `app-perf-part2.md` either way. After a cheaper version is taken, run all three full runs again and write down which version shipped and the numbers that made the call.

Then write `docs/design/trifid-theme/reviews/app-perf-part2.md` with:
- the date, the commit, the machine and Chrome version, the commands, and the load on the machine during the runs;
- the sizes table as in the baseline's "Sizes" section (first-load JS with and without nomodule scripts, the three.js chunk on first load, the two server HTML weights) with the baseline's values (190.5 KB, 151.9 KB, 0 KB, 28.3 KB, 34 KB) and part 1's (191.2 KB, 152.6 KB, 0 KB, and its two HTML weights from `app-perf-part1.md`) beside this part's, and the 200 KB budget;
- one table per column (`software desktop`, `software phone`, `gpu desktop`, `gpu phone`) with the baseline's thirteen rows (search usable, startup worst long task, WebGL warm-up end, map first frame, typing to suggestions, select to album, transition worst frame gap, slider to list, morph, drag and zoom worst frame gaps, long tasks while idle, frames while idle): baseline median and min to max, this part's run 1, run 2, run 3, median and min to max, the budget, and a verdict;
- the verdict for each row: "same or better" (the median is no worse than the baseline's worst run), "worse, explained" or "worse, fixed". **A median above the baseline's worst run is a finding even when it is inside budget.** It is explained in a sentence that names the cause (for example "the gas mesh adds one textured quad to every drag frame") or it is fixed. "Within budget" is not an explanation;
- a table for the reported only column `gpu desktop2x` and the reported only rows (`deepDragGapMs`, `deepMorphGapMs`, `gasShownMs`, and which gas shader drew each column) in every column that prints them, judged by the same median rule against their baselines: for `gpu desktop2x`, `baseline/perf/perf-dpr2-run1.json` to `perf-dpr2-run3.json` (made in part 1 Task 6) and the section "gpu desktop at dpr 2, added later with the same script" of `BASELINE-PERF.md`; for the two deep zoom rows of the gpu columns at dpr 1, `perf-part1/baseline-gpu-deep-run1.json` to `run3.json` (today's site with the extended script; the software columns have no baseline for them); and part 1's own numbers beside them. They have no budget; the 50 ms frame gap is the yardstick;
- every single run over a budget, named with the other two values beside it and what explains it;
- the idle rows on their own line: frames while idle must be at most 1 and long tasks while idle 0 in all four columns of all three runs, with the glints playing (the script does not switch them off). The baseline is 0 and 0 everywhere;
- Task 0 already waits for the sharper image before the idle window (`sharpSettled`, with `idleSharpSettled` and `sharpFlag` in the JSON); an `idleFrames` over 1 is not the fade unless `idleSharpSettled` is `false`. Never change the budget. The two rows at the opening view (`openingDragGapMs`, `openingZoomGapMs`, Task 0) are reported only: put them in the reported only table, judged against 50 ms by hand (no baseline);
- which version of each effect shipped (as built, or the cheaper one from the table above).

- [ ] **Step 8: First hover, with the baseline's own script, and the twinkle cost once more**

The prototype showed tasks of 60 to 160 ms in the first second or two of hovering. The app must not. The baseline measured the hover path of the current site with `docs/design/trifid-theme/reviews/baseline/hover-measure.mjs` (arguments `<outFile.json> <baseURL> [--start] [--mode gpu|software|both] [--loads 5]`, run from `frontcreck/`; desktop only, five fresh loads per renderer, gpu then software; its header has the method; the baseline's output is `baseline/perf/hover.json` and `hover.txt`). Run the same script on the same production build (`--start` starts and stops `next start` on port 3500 itself):

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch; cd frontcreck && node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs ../docs/design/trifid-theme/reviews/app-hover-part2.json http://127.0.0.1:3500 --start > ../docs/design/trifid-theme/reviews/perf-part2/hover.txt 2>&1; tail -n 12 ../docs/design/trifid-theme/reviews/perf-part2/hover.txt)
```

The glints are left on, as a visitor has them. A glint does not redraw the canvas, so "map frames drawn" must not change.

Baseline, median with min to max, on the GPU: pointer move to tip visible 150.3 ms (135.7 to 169.3) on the first hover after a load, 101.2 ms (90.6 to 106.8) on the second, 90.3 ms (89.7 to 115.7) on the third; longest long task 0 ms (one of five first hovers showed 55 ms); longest frame gap 33.3 ms on the first hover and 16.8 ms after; three map frames per hover. On the software renderer: tip visible 135.5 (133 to 149.4), 91.6 (85.9 to 107.7) and 88.1 ms (84.9 to 93.1), no long task, frame gaps of 66.7 ms.

The rules for this part:
1. **No first-hover long task that the baseline does not have.** On the GPU the median longest long task must be 0 and no load may show one over 55 ms; on the software renderer there must be none at all, as in the baseline. A task of about 100 ms, as the prototype had, fails this part.
2. The median "pointer move to tip visible" of each of the three hovers is no worse than the baseline's worst load for that hover, or is explained or fixed like any other number that got worse.
3. Map frames per hover stay at 3.

`hover-measure.mjs` waits for the sharper image before the idle (Task 0) and hovers at the Whole map by default (`--open whole`, the baseline's framing), so the run above is like for like. Run it again with `--open app` for the opening view (the Overview), into `app-hover-part2-opening.json`, and report it beside the first; the three rules apply to the default run, and the opening run's numbers are judged by the same rules without a baseline.

If a rule fails, find the cause before going on. The hover path is `CursorTracker` (hit test), `setHoveredIndex`, the `HoverLabel` render with its 40 px cover, and the map frames that draw the hover mark. What this part could have added to it: the wider star quads making those frames slower (the frame gap shows it; cheaper version in step 7's table), the region names pass on the hover frames (the driver returns after its compares when nothing it reads changed, Task 7; check that a hover changes none of them, so it neither lays names out nor rewrites transforms), or the twinkle driver's per-frame comparison (ten number compares; it must not clear the glints on a hover). Fix it, or take the cheaper version of the effect that causes it, and tell the owner afterwards.

Then run the twinkle cost again, since the build has changed since Task 8:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node scripts/perf/twinkle-cost.mjs)
```

Expected: `The glints cost no responsiveness.` If it now fails, Task 8 step 13's rule applies as written there.

Add a section "Hover and twinkle" to `app-perf-part2.md`: the hover medians and spreads beside the baseline's for each renderer and each of the three hovers (the layout of the baseline's "Hover path" table), the three rules with pass or fail, and the twinkle table with its JSON file's name.

- [ ] **Step 9: The regression checklist and the baseline screenshots**

First give the baseline's capture script a `--still` option, so that two runs of a themed build give the same picture: one fixed star deal, no glints, and the gas in (part 1's sharper image included). Without `--still` the script behaves exactly as it does today. The baseline shots under `baseline/shots/` are not retaken and not touched. This is the one edit this part makes to `docs/design/trifid-theme/reviews/baseline/capture.mjs`; do not touch its L390 (the edge hover state's `document.querySelector('canvas.map-canvas').getBoundingClientRect().top`; L380 before part 1's edits), which part 3 Task 10 changes. Part 1 already gave the script a `--gas full|lighter` option (default `full`: it sets `window.__rmrGasLite` to `'off'` in an init script, so the gas is the full shader even on a software renderer); `--still` sits beside it and changes nothing of it. The line numbers below are as part 1 left the script; Task 0 may have moved them, so find each edit by its text.

In the header comment, replace (L13):

```js
 * Arguments: <outDir> <baseURL> [--start] [--viewport desktop|phone|both] [--mode gpu|software] [--only <text>]
```

with:

```js
 * Arguments: <outDir> <baseURL> [--start] [--still] [--viewport desktop|phone|both] [--mode gpu|software] [--only <text>]
```

and after the `--gas` paragraph of the same comment, which ends (L24):

```js
 *                window.__rmrGasLite before the app loads and means nothing to a build without the gas.
```

add:

```js
 *   --still      for builds with the Trifid theme: the same picture on every run. One fixed star deal (STILL_SEED
 *                is put on window.__rmr before any page script runs), the star glints switched off after every
 *                page load and before every settle, and the map counts as ready only once the gas has settled
 *                (every settle already waits for the sharper gas image of a desktop GPU, since part 2's Task 0).
 *                Without it the script behaves as it did for the baseline.
```

Replace (L57):

```js
  if (argv[i] === '--start') flags.start = true;
```

with:

```js
  if (argv[i] === '--start') flags.start = true;
  else if (argv[i] === '--still') flags.still = true;
```

In the usage line (L62) replace `[--start] [--viewport` with `[--start] [--still] [--viewport`.

After (L71-74):

```js
if (GAS !== 'full' && GAS !== 'lighter') {
  console.error('--gas takes full or lighter');
  process.exit(2);
}
```

add:

```js
const STILL = !!flags.still;
/** --still: the seed of the page's star deal (frontcreck/src/components/map/state/stars.ts reads window.__rmr.starSeed). */
const STILL_SEED = 20261004;
```

Replace (L132):

```js
const mapReady = (p) => p.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 30000 });
```

with:

```js
/** The map has drawn. With --still, also: the gas has settled ('ready' or 'off').
 * A state whose gas never settles fails by name, as any state that cannot be reached does. */
const mapReady = (p) =>
  p.waitForFunction(
    (still) => {
      const r = window.__rmr;
      if (!r?.map || (r.frames ?? 0) <= 0) return false;
      // --still is for builds with the theme: the gas flag must say settled. (A site without the flag, such as
      // the baseline's, is captured without --still.)
      return !still || r.gas === 'ready' || r.gas === 'off';
    },
    STILL,
    { timeout: 30000 },
  );

/** --still: no star glints. A no-op on a build without them. A full page load resets the store, so this runs
 * after every load (go) and before every settle. */
const stillGlints = (p) => (STILL ? p.evaluate(() => window.__rmr?.getState?.().setTwinkleOn?.(false)) : Promise.resolve());
```

Replace (L178-179):

```js
async function settle(p, name, { map = true } = {}) {
  await p.evaluate(() => document.fonts.ready);
```

with:

```js
async function settle(p, name, { map = true } = {}) {
  await stillGlints(p);
  await p.evaluate(() => document.fonts.ready);
```

(The end of `settle` is not changed here: since Task 0 it ends with `sharpSettled`, the sharper gas image wait, for every run with or without `--still`.)

Replace (L195-198):

```js
async function go(p, url) {
  await p.goto(`${BASE}${url}`, { waitUntil: 'load' });
  await p.addStyleTag({ content: '* { caret-color: transparent !important; }' });
}
```

with:

```js
async function go(p, url) {
  await p.goto(`${BASE}${url}`, { waitUntil: 'load' });
  await p.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  await stillGlints(p);
}
```

`go` is the script's only `goto`; run `grep -n "\.goto(\|\.reload(" docs/design/trifid-theme/reviews/baseline/capture.mjs` and, if another navigation has appeared, put `await stillGlints(p);` after it too. Replace (L900-902, where part 1 put its gas shader init script):

```js
      const ctx = await browser.newContext({ ...VIEWPORTS[vp], ...(state.context ?? {}) });
      await ctx.addInitScript((v) => { window.__rmrGasLite = v; }, GAS === 'lighter' ? 'force' : 'off');
      if (OPEN === 'whole' && state.open !== 'app') await ctx.addInitScript(() => { window.__rmrOpen = 'whole'; });
      const page = await ctx.newPage();
```

(the `__rmrOpen` line is Task 0's) with:

```js
      const ctx = await browser.newContext({ ...VIEWPORTS[vp], ...(state.context ?? {}) });
      await ctx.addInitScript((v) => { window.__rmrGasLite = v; }, GAS === 'lighter' ? 'force' : 'off');
      if (OPEN === 'whole' && state.open !== 'app') await ctx.addInitScript(() => { window.__rmrOpen = 'whole'; });
      // Before any page script: the store module spreads the object it finds (src/lib/store.ts), so the seed stays.
      if (STILL) await ctx.addInitScript((seed) => { window.__rmr = { ...(window.__rmr || {}), starSeed: seed }; }, STILL_SEED);
      const page = await ctx.newPage();
```

Why this works: `pageStarClasses` (Task 1) takes `window.__rmr.starSeed` when it is a number before the first deal (its unit test "uses a seed a test put on window.__rmr before the map loaded" and `e2e/stars.spec.ts` pin it), and `src/lib/store.ts` assigns `window.__rmr = { ...window.__rmr, getState, subscribe }`, which keeps the field. Check the script still parses and still refuses bad arguments, then commit it on its own:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node --check docs/design/trifid-theme/reviews/baseline/capture.mjs && git diff --stat -- docs/design/trifid-theme/reviews/baseline/capture.mjs)
git add docs/design/trifid-theme/reviews/baseline/capture.mjs
git commit -m "docs(design): capture.mjs --still: fixed star seed, no glints, gas settled

For repeatable screenshots of the themed build. Without the option the
script behaves as it did for the baseline; the baseline shots are untouched.

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

Then retake the baseline's screenshots of this build with it (186 named states, one browser at a time; longer than the baseline's four minutes, since every settle now also waits 2.5 s for the sharper gas image), into a folder that is not committed:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch; cd frontcreck && node ../docs/design/trifid-theme/reviews/baseline/capture.mjs test-results/after-part2 http://127.0.0.1:3400 --start --still)
```

Its arguments are `<outDir> <baseURL> [--start] [--still] [--viewport desktop|phone|both] [--mode gpu|software] [--only <text>] [--gas full|lighter] [--open whole|app]`. The default `--open whole` (Task 0) opens every baseline-named state at the Whole map, as the baseline did, so `map-overview` stays the whole-cloud fit and every pair compares like for like; the new state `map-opening` always takes the app's own opening view and writes `map-opening.jpg` (the Overview) and `map-opening-fit.jpg` (the fit button's Whole map) (`--gas full`, the default, is what these pictures need: the full gas shader, as a GPU draws it); it is run from `frontcreck/` on the production build of step 7, `--start` starts and stops `next start` on port 3400, and the pictures land in `test-results/after-part2/desktop/` and `phone/` (full views `.jpg`, crops `.png`) with a `capture-log-<viewport>.json` beside them. With `--still` two runs of this build give the same stars and no glint, so its own pictures can be compared file by file from run to run (Spotify cover images aside, as the baseline's README says). Against the baseline the star sizes still differ by design: the baseline has dots of one size, this build has stars of four sizes in the fixed deal of seed 20261004. If `selected-dense-crop` or another state is in doubt, take it again with `--only <state name> --still`.

It exits non-zero and leaves a `FAILED-<state>.jpg` if a state could not be reached: that is a regression to fix (the script finds its way by the class names in `SEL` at its top and by `window.__rmr`; this part renames none of them).

Then open `docs/design/trifid-theme/reviews/baseline/REGRESSION-CHECKLIST.md` and go through every one of its items, running each item's "Verify" line. Where it names a screenshot, open the baseline picture (`baseline/shots/desktop/` or `phone/`) and this build's (`frontcreck/test-results/after-part2/desktop/` or `phone/`) one after the other with the Read tool; no browser. The colours, the gas and the stars differ by design (with `--still` there is no glint in any picture and the star sizes are those of the fixed seed); what must not differ is the behaviour each item describes. Section 1 of the checklist, overlapping covers, is the one the owner singled out. Compare these three pairs with care, on desktop and at dpr 2 (`retina-` files), and say in a sentence each what you see:
- `map-covers-dense-fade-crop`: the cross-fade band. Rounded tiles, part colour and part image, slightly see-through, piled softly. The tile colour is now the star colour where it was the cluster colour (Task 2, item 1).
- `selected-dense-crop`: a pick in a dense spot. The picked cover large and framed on top, every other cover at half alpha with the pile showing through itself. The map still shows through the gap between the picked cover and its frame, as in the baseline (Task 2, item 4).
- `map-covers-dense-crop`: fully shown covers, a plain hard-edged stack, the same cover of each pair on top as in the baseline.

And these, which the owner also named: the hover tip (`hover-map-album`, `hover-map-cover`, `hover-map-edge`), the selected ring among stars (`selected-dot-ring`; still lamp-coloured until part 3), the cover fade (`map-covers-fade`), the marker layout (`album-open`, `album-open-dense`, `album-mapmode`; compare how far out the album is framed and how far the covers sit from the seed, which Task 3 may have widened, and the true position mark, now a small hollow ring where it was a dot), the trail (`trail`, `trail-long`), the toasts (`toast-link-copied`, `toast-copy-failed`, `toast-surprise-error`) and the keyboard paths (the `focus-` pictures and the checklist's keyboard items; the Tab order now has the names toggle before Zoom in).

Write the result as the first section of `docs/design/trifid-theme/reviews/app-fidelity-part2.md`, "Regression checklist against the current site": the count of items that are "same", then one line for every item that is "changed on purpose" (with the task or decision that says so, for example the dot colours, the line colours, the names, the removed cluster colours) or "regressed". Every "regressed" is fixed in the task that owns it, and its check run again, before step 11. Items that only part 3 can settle (panel colours, the grain, the header) are listed as "part 3". No "Manual:" probe of the checklist may be left as "not run": each one that this step did not do from the pictures, the specs or the code is recorded by its item number as "routed to part 3". Part 3's Task 10 regression reviewer does those that can be done from a running build and stills or by reading code; the rest go on the owner's trial list in part 3 Task 11.

- [ ] **Step 10: Commit the specs and the performance note**

```bash
git add frontcreck/e2e/names.spec.ts frontcreck/e2e/stars.spec.ts docs/design/trifid-theme/reviews/app-perf-part2.md docs/design/trifid-theme/reviews/app-hover-part2.json docs/design/trifid-theme/reviews/perf-part2
git commit -m "test(e2e): region names, the names toggle and the random stars; part 2 performance against baseline

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

- [ ] **Step 11: Fidelity check of this part (one reviewer subagent, no browser)**

Dispatch one fresh reviewer subagent that did not write this part. Give it only the paths below and this brief. It opens the images one at a time with the Read tool and starts no browser.

> Compare what part 2 built with the approved pictures and list every difference, worst first. App images, under `frontcreck/test-results/shots/` (written by the runs of steps 3, 4 and 6): `desktop-explore.png`, `desktop-explore-zoomed.png`, `desktop-explore-hover.png`, `desktop-focus.png`, `desktop-album.png`, `desktop-names-toggle-on.png`, `desktop-names-toggle-off.png`, `phone-names-toggle-on.png`, `phone-album-mapmode.png`; and under `frontcreck/test-results/after-part2/desktop/` (step 9): `map-opening.jpg` (the Overview, judge against `final-overview.jpg`), `map-opening-fit.jpg` (the fit button's Whole map, judge against `final-whole.jpg`), `map-whole.jpg` (the zoom-out floor, 0.8 of the Whole map), `map-covers-dense-fade-crop.png`, `album-open.jpg`, `hover-map-album-crop.png`, `selected-dense-crop.png`. The `test-results/shots/` pictures of the older specs (explore, focus, album) were taken on the test browser's software renderer, where the app draws the gas with its lighter shader; the names toggle pictures and the `after-part2` pictures ask for the full shader. Judge the gas only in the latter, and the marks in all. Approved, under `docs/design/trifid-theme/options/`: `final-overview.jpg`, `final-whole.jpg`, `final-album.jpg`, `toggle-b-on.jpg`, `toggle-b-off.jpg`, `final-phone-map.jpg`, `q-twinkle-live.jpg`. Judge only what this part built: the stars (four sizes in a random mix with a few bright ones, tint, glow, the dark disc under them on bright gas; their positions are the albums and must match, their sizes are dealt at random on each load and will not match star for star), a glint if one was caught (a soft white bloom on a star, a thin four point flare on a bright one, never a new star), covers and their keyline, the white cased lines and where they start and end, frames and rank badges, the region names (face, capitals, spacing, size, halo, which show, none over a control, none in any picture with an album open, at most four on the phone) and the names button (a separate box above the zoom stack, the on and off icons). Look again, on the brightest cream gas, at the marks part 1's independent review found weak there (`docs/design/trifid-theme/reviews/app-fidelity-part1-independent.md`): the hover ring on a star, the stars on cream and rust and beside an open album, the cross-fade tiles at about 23 px, the half transparent covers around a pick, and the lines beside an open album; each must now read clearly. Mark each difference "worse than approved", "equal" or "expected until part 3". The only expected ones: rings, focus outlines and the hot badge are still amber, panels and the header are still solid warm brown with no map behind the header, the pane beyond the gas is still brown, the film grain is still there, and the selected ring has no dark casing, because part 3 changes those. One approved picture is out of date on purpose: `final-album.jpg` shows a region name beside the open album, and the owner has since ruled that out.

Fix every "worse than approved" item in the task that owns it, run that task's checks again and have the same reviewer look again. Save its final list as the second section of `docs/design/trifid-theme/reviews/app-fidelity-part2.md`, "Fidelity against the approved pictures", under the regression checklist of step 9, and commit it:

```bash
git add docs/design/trifid-theme/reviews/app-fidelity-part2.md
git commit -m "docs(design): part 2 regression checklist and fidelity notes

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit. Once this task's review has passed, push: `git push origin feat/trifid-theme` (Global Constraints).

The reviewer sees stills only. It cannot judge motion in flight (the name fades during a slider move, the star to cover cross-fade, a glint easing in and out) or a real phone, which is why the owner's own preview checklist in part 3 stays.

---

## Self-review

Revised on 2026-10-04 to match the owner's decisions of that day (overview, section "Decisions made on 2026-10-04"). Task numbers: 1 to 7 are unchanged, the twinkle is the new Task 8, and the former Task 8 is Task 9.

**Decision coverage** (overview "Decisions made on 2026-10-04", then HANDOFF "Current state"):

| Decision or requirement | Task |
|---|---|
| Snappiness is a core requirement: each effect measured, dropped or cheapened without asking, owner told afterwards; budgets unchanged | Global Constraints; 8 (step 13), 9 (steps 7 and 8) |
| No regressions: compare with the baseline screenshots, performance run and checklist at the end of the part; worse inside budget is a finding | Global Constraints; 9 (steps 7, 8 and 9) |
| Overlapping covers handled as today (the "nice blur"): what it is, and the lines that keep it | 2 (design note, `album.test.ts`, `AlbumField.stars.test.ts`), 9 (step 9) |
| Hover tip, selected ring, cover fade, marker layout, trail, toasts, keyboard paths survive | 2, 3, 4 (the "what stays" notes), 9 (steps 6 and 9) |
| Stars are random on each page load, mix 1%, 9%, 27%, rest small; album index, order and rank never used | 1, 2 |
| 75% star white + 25% Ember family tint, not random; white with no under-disc when theme data is missing | 1, 2 |
| Stars in the one existing draw, premultiplied output, `CustomBlending` One / OneMinusSrcAlpha | 2 |
| Under-disc: max 0.26, strongest to 0.8 r, gone at 3 r + 1, `clamp(1 - 0.5 / bg, 0, 0.26)`, gas mixed by slider | 2 |
| Stars fade as covers fade in (16 to 32 px) | 2 |
| Depth layers survive wide glow quads (rule and proof) | 2 |
| `a_clusterId`, `u_clusterColors`, `CLUSTER_RGB` removed; Trifid frame and backing colours | 2 |
| Hit test and `renderedSpriteCssSize` unchanged, with proof | 1 (test), 2 (note) |
| Dimmed Home and About map still eases alpha and size | 2 (the `mutedT` lines and their existing test are kept) |
| Layout: 24 px of line, 6 px clearance, 0.2 rad, 600 rounds, seed never moves | 3 |
| Lines: casing `rgba(6,6,10,.8)` under white core, 4.5/1.5, hot 5.25/2.25, leader 3/1, round caps, casings below cores, frame edge to frame edge | 4 |
| Frames and badges per prototype, lamp token, no `--acc` on the map | 4 |
| Names: Tenor Sans 400 via `next/font`, `preload: false`, wide capitals, .26em, size tiers at k = 0.88, colour from `label.rgb`, stroke and shadow halo from `label.lum` | 5, 7 |
| Names only under `NAMES_BAND_PX`, so none once covers show; none while an album is open; morph fades 40% / 40%; phone at most four, 13 to 16 px | 5, 7, 9 |
| Halo at full strength whenever the view is under 600 px per world unit, with exact values | 5 (`layoutNames`, its test), 7 (the driver passes the scale) |
| Blockers: slider card, zoom corner including the toggle, hint line or card, the picked album, edge margin; the header through the stage top | 5, 7 |
| 4.5:1 formula and unit test | 5 |
| Names are plain lettering: no hover, click, legend, card, menu, pointer or search row; `aria-hidden`; `pointer-events: none` | 7, 9 |
| Transform-only writes, only on change, the canvas not redrawn at rest | 7, 9 (idle frame test) |
| Toggle is option B as the prototype's `namesToggle()`: first child of `.map-zoom`, 8 px above the stack, remembered in `rmr-names`, default on, junk and blocked storage safe, no hydration mismatch, keyboard | 6, 9 |
| Toggle label: one fixed "Place names" with `aria-pressed`, no swapping; wording still awaiting the owner's approval | 6, 9 |
| Twinkle: one glint about every 1.2 to 3 s, at most 3 alive, soft white bloom, thin four point flare on the brighter stars, DOM and CSS only, on a timer, never a canvas frame, nothing while the view moves, none once covers show, off under reduced motion and in hidden tabs, on real album stars, no pointer events, cleaned up on unmount | 8 |
| Twinkle with an album open: follows the prototype (plays, quieter, never under a cover) | 8 |
| Twinkle tests: scheduler on fake timers, the canvas frame counter does not move, cost measured in a real browser and written down | 8 (steps 2, 12, 13) |
| "Nothing animates at rest" reads "the map canvas does not redraw at rest"; idle frame test and budget unchanged | Global Constraints; 8 |
| Nothing hard-codes where the stage starts | Global Constraints; 5 (`ChromeInput.top`), 7 (`stageTop.ts`), 8 (glint bounds), 9 (the header check in `names.spec.ts`) |
| Existing site data files not edited | Global Constraints (no task touches them) |
| Machine rules; `Refs #45` and the trailer on every commit; never loosen a test | Global Constraints; every commit step; the notes beside each edited test |
| End of part: three perf runs on software and GPU, desktop and phone, judged on the median against the baseline in `app-perf-part2.md`; the size check; first hover in `app-hover-part2.json`; the cheaper version of each per frame effect; fidelity in `app-fidelity-part2.md` | 9 (steps 7, 8, 9 and 11) |

**Existing tests this part edits, and what each still proves** (nothing is loosened):
- `shaders/album.test.ts`: one import line and appended tests only (Task 2). No existing assertion changes.
- `state/focusLayout.test.ts`: one import line, helpers and appended tests only (Task 3).
- `e2e/focus.spec.ts` check (d): rewritten because lines now end on the frames; it is tighter on direction (1.5 px against 2 px) and adds the frame ends and the visible length (Task 4).
- `lib/store.test.ts`: appended tests only (Tasks 6 and 8).
- `e2e/helpers.ts` `waitForAnimations` and the audit wait in `e2e/a11y.spec.ts`: both skip animations inside `.tw-layer` only, and still wait for every other animation on the page (Task 8, step 11).
- `e2e/gas.spec.ts` (part 1's): `lumaAt` and the registration test switch the glints off before reading pixels; the assertions are unchanged (Task 8, step 11).
- `e2e/helpers.ts` has `waitForGasSharpSettled` from Task 0 (step 11), an addition: no existing helper changes for it. `e2e/twinkle.spec.ts`, the idle test of `e2e/names.spec.ts`, `scripts/perf/twinkle-cost.mjs` and `capture.mjs --still` wait for part 1's sharper gas image before they count frames or take pictures (handoff of 2026-10-05).
- Not edited and expected to fail until part 3: the `isLamp` and `meanLuma` assertions of `e2e/explore.spec.ts` (listed at the end of Task 2; the test has been red on purpose since part 1).

**Not covered here, on purpose:** the DOM ring round the Explore pick among stars (`.map-sel`, `styles/map.css` L17-18, positioned by `canvas/OverlayDriver.tsx` L60-76, rendered by `SelectedRing` in `MusicMap.tsx`) keeps its lamp border with no dark casing; this part does not edit it, and part 3 gives it the casing when it changes the tokens. The film grain, the glass and the stage under the header are part 3's. The prototype showed the seed's region name beside an open album; the owner has ruled that out, and no name shows while an album is open.

**Open for the owner (built as proposed, flagged in the code):** the toggle's label wording, "Place names".

**Placeholder scan:** no "TBD", "TODO", "similar to", or "add error handling" in any step; every new file is given in full, every edit as before and after. Three steps say what to do if lint flags a line (Task 2 step 8, Task 7 step 9, Task 8 step 12); they name the exact comment to add.

**Checked while revising** (plain `node`, arm64, on the code in this file): the random deal matches the prototype's for the same seed, album for album, and gives 41, 367, 1,102 and 2,571 for 4,081 albums; the 24 star tests, the 28 names layout tests, the 25 twinkle tests and the 2 stage top tests pass against the code as written here (run again by an independent checker under the repo's vitest in a scratch copy: stars 24, focusLayout 21 with the 13 existing tests unchanged, namesLayout 28, namesPref 4, stageTop 2, twinkle 25, all passing); `haloFor(0.4, ...)` is exactly 0.65 and `haloFor(0.9, ...)` exactly 0.75; `twinkle-cost.mjs` parses. Not run: anything that needs the app, a browser or WebGL (the shaders, the React components, every Playwright spec, both perf scripts).

**Type consistency:** `StarAttributes` (`star` Float32Array x4, `tint` and `bg` Uint8Array x3) matches the three `InstancedBufferAttribute` sizes in Task 2 and the shader's `vec4 a_star`, `vec3 a_tint`, `vec3 a_bg`. `buildStarAttributes(classes, theme)` is called with `pageStarClasses(n)` in `AlbumField` and nowhere with a count. `pageStarClasses(n)` is the one source of classes for `AlbumField` (Task 2) and `TwinkleDriver` (Task 8), and the one part 3's strip must use. `edgePoint`, `SEED_FRAME_PX`, `REC_FRAME_PX`, `HOT_FRAME_PX` are defined in Task 3 and used with the same signatures in Task 4 and its CSS insets (4, 1, 3). `ViewBounds` is the one rectangle type for `layoutNames`, `chromeBlockers`, `visibleArea` and `pickStar`. `nameKey(stop, id)` is the overlay key in `RegionNames` and `RegionNamesDriver`. `ChromeInput` is `{ width, height, top, inset, phone, bottomCover, card }` in Task 5, its tests and the driver of Task 7; `NamesInput` has `pxPerWorld` and no `lines` in all three. `namesShown(coverPx, albumOpen)` has two parameters in Task 5, its tests and the driver. `getStageTop()` is defined in Task 7 and read in Tasks 7 and 8. `namesOn` / `setNamesOn` are added to `AppState` in Task 6 and read in Tasks 6, 7 and 9; `twinkleOn` / `setTwinkleOn` are added in Task 8 and used by its driver, `twinkleOff` and `twinkle-cost.mjs`. `COPY.map.names` is added in Task 6 and used in Tasks 6 and 9; `namesHide` and `namesShow` no longer exist anywhere. `clearNameWidths()` and `nameWidthsVersion()` are defined in `state/nameWidths.ts` (Task 7) and used by `RegionNames` and `RegionNamesDriver`; `waitForGasSharpSettled(page, quietMs?)` is defined in `e2e/helpers.ts` (Task 0) and used by `twinkle.spec.ts` and `names.spec.ts`. The `ThemeData` fixtures of `stars.test.ts` and `RegionNames.test.tsx` are version 3 with a `gas` field, as `lib/data/theme.ts` requires since part 1. `GlintHandle`, `Glint`, `TwinkleHost` and `TwinkleStats` are defined in `state/twinkle.ts` and used with the same shapes in `overlays/Twinkle.tsx`, `canvas/TwinkleDriver.tsx`, `types/global.d.ts`, `e2e/twinkle.spec.ts` and `scripts/perf/twinkle-cost.mjs`.
