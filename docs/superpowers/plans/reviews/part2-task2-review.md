# Review: part 2 Task 2, "Stars in the one album draw"

Commits reviewed: `b1f0ac99..dd4e8539` on `feat/trifid-theme` (66e14b76 code, dd4e8539 pictures). Reviewer: fresh, independent; no code edited.
Spec: Task 2 and header of `2026-10-04-trifid-theme-2-stars-lines-names.md`; handoff `2026-10-04-trifid-theme-build-handoff.md`; prototype `docs/design/trifid-theme/prototype/`.

**Verdict: APPROVED** (no Critical or Important code defects). Finding 2 is a question for the owner that must go with step 10's tile question; it is not a blocker for Tasks 3 to 8.

## Pass 1: spec

- **Verbatim to the plan.** The shader from `const f = ...` to the end of `album.ts` is byte-identical to the plan's Step 4 block (diffed). `AlbumField.tsx`, `data.ts`, `MapPreviewStrip.tsx`, `album.test.ts` and `AlbumField.stars.test.ts` match Steps 2, 6 and 7. The only departure is the dropped `eslint-disable-next-line react-hooks/immutability` above `tint.needsUpdate` (lint passes without it, so it would have been an unused directive). Correct.
- **Star size and brightness only from the deal.** `a_star` is set once from `pageStarClasses(n)` in the `useMemo` (`AlbumField.tsx:62-63,72`); the theme effect (`AlbumField.tsx:152-162`) rewrites only `a_tint` and `a_bg`. No `data.albums`, index or rank feeds a star. Theme identity is stable (`themeFor` returns the loaded object), so the effect does not fire on stop changes.
- **Tile colour = star colour.** `album.ts:355` `col = mix(v_tint.rgb, sampleAtlas(...), v_coverT)`, as planned.
- **Cross-fade band and 50% pick alpha preserved.** `coverT = smoothstep(16, 32, coverCss)`, size mix, corner mix, `mask * mix(u_dotAlpha, 1.0, v_coverT)` with only the planned ease `smoothstep(0, 0.125, coverT)` (1.0 from about 18 px on, so at 23 px the tile is 87% opaque as in the baseline); `u_focusDim` 0.45 and `mix(1.0, u_selDim, v_coverT)` with `SELECTION_DIM` 0.5 unchanged. The `retina-selected-dense-crop` pair shows the pile showing through itself at 50%, as in the baseline.
- **Positions untouched.** `interpolatePos`, `interpolateInto`, `positions.json` not changed.
- **No new per-frame work, no extra draw calls.** `useFrame` is unchanged; uniforms are still set only on change; the new code runs in a `useMemo` and a `useEffect` keyed on `theme`. Still one `Points` draw. The theme effect builds and discards one `Float32Array(4n)` once per theme change (negligible).
- **Theme-null path.** `buildStarAttributes(classes, null)` gives white tint and `bg = 0`, so `under = clamp(1 - 0.5 / 0.001) = 0`: white stars, no under-disc. Correct.
- **Depth rule.** `layer > 0` zeroes `starA` and `under` (`album.ts` vertex), and the fragment discards only where both colour and alpha are under 0.004, as the plan's design note requires.
- **Covers legible.** At full covers (`coverT = 1`) `starA` is 0, so no star light tints a cover; covers are opaque with the keyline. The `retina-selected-dense-crop` and `album-open-crop` pairs read well. The hover ring with its new casing is easy to find on cream (`hover-map-album-crop` pair).
- **Checks re-run by the reviewer:** lint clean, typecheck clean, `npm test` 41 files / 452 tests pass; the two Task 2 test files pass (30 tests).

## Pass 2: quality, and the specific questions

### Performance: the "Deep zoom, slider between stops" row is noise, not a regression

The implementer's two runs per build gave base 120/119 ms and head 195/177 ms. I built both heads (base in a scratch worktree at `b1f0ac99`, head in the repo) and alternated `node scripts/perf/perf.mjs --mode software --viewport desktop` three more times each, one browser at a time:

| Run | base | head |
|---|---|---|
| implementer 1, 2 | 120, 119 | 195, 177 |
| reviewer 1, 2, 3 | 166, 159, 180 | 184, 92, 118 |
| median of 5 | 159 | 177 |

The two ranges overlap almost fully (base 119 to 180, head 92 to 195). The implementer's base pair happened to fall low. No other desktop row moved beyond its run-to-run spread either (medians of 5, base vs head: morph 215 vs 221, drag 281 vs 285, zoom 354 vs 372, deep drag 162 vs 166, idle frames 0 vs 0, idle long tasks 0 vs 0).

A single worst-frame reading per run is too thin to tell, so I wrote a focused probe (`scratchpad/rv2-deepmorph-probe.mjs`) that reproduces the perf script's steps exactly (same browser and flags, 1440 x 900, whole-map opening, `setCamera` zoom 1000, settle, `setStop` to the other stop, rAF gaps for 700 ms) but changes stop 8 times per page on 3 pages, twice per build, and keeps every frame interval and every long task: 48 stop changes per build (`scratchpad/rv2-deepmorph-{base,head}-{a,b}.json`).

| Over 48 stop changes each | base | head |
|---|---|---|
| Mean frame interval during the morph | 84.4 ms | 83.3 ms |
| Median frame interval | 93.8 ms | 91.8 ms |
| Worst gap per stop change, median | 130 ms | 157 ms |
| Worst gap per stop change, mean | 145 ms | 154 ms |
| P(head worst > base worst), Mann-Whitney | 0.58 (z = 1.35, not significant) | |
| Frames drawn per stop change | 8.9 | 9.0 |
| Long tasks | none | none |
| First interval after `setStop` | 2 ms | 2 ms |

Per-frame cost during the deep morph is identical, the worst frame lands mid-morph (frame 3 to 10, not the first), and there is no long task. So it is not a texture or tint upload on stop change (the first interval is 2 ms in both, and `a_tint`/`a_bg` are not touched on a stop change), not an attribute re-upload during the morph (positions are interpolated in the shader; the theme effect does not fire), and not star bloom overdraw (at full covers `coverT = 1`, so `starA = 0` and `starQuad = 0`; quads are cover-sized as before). This matches the implementer's own unthrottled per-frame probe (covers-48px desktop with gas: head 79.7/81.3 ms, base 80.7/78.8 ms). The remaining difference in the worst-gap tail (+6% in the mean, not significant) is within SwiftShader's scheduling noise. **Not real at the level the row suggested; no fix needed.** Task 9 should still read this row on a real GPU with several runs per build, and should compare medians, not single runs.

### Findings

1. **Minor: the perf evidence in the part 2 ledger.** The implementer's perf comparison quoted one pair per build for a row that varies ±30% between runs. Fix: in the ledger, record the deep-morph row as "within noise (base 119 to 180, head 92 to 195 over 5 runs each; per-frame cost equal over 48 stop changes)" and point at this review, so Task 9 does not chase it again.

2. **Important for the owner, not a code defect: the keyline rim on the about-23 px tiles.** `frontcreck/src/components/map/shaders/album.ts:356-357`:
   `col = mix(col, CASING, 0.9 * v_coverT * smoothstep(-1.0 - 0.5 * aa, -1.0 + 0.5 * aa, sd));`
   It is in the plan and in the prototype, so it is not a deviation:
   - Plan, Global Constraints L68: "**Covers stay legible:** a fully shown cover that is not stepping back is opaque, with a dark keyline, and is never tinted by star light."
   - Plan, Task 2 L791: "The new 1 px dark keyline inside each cover's edge is an addition. It comes in with the image (it is scaled by `coverT`), so it does not ring the small tinted tiles at the start of the fade."
   - Plan, Step 4 shader (L1257): "A 1 px dark keyline just inside the edge keeps a pale cover apart from bright gas; it comes in with the image."
   - Prototype `src/overlay.js` L96: "map covers: cross-fade in from 16 to 32 px, each with a 1 px dark keyline so it holds on bright gas", drawn at L110 as `frame(x, y, cpx / 2, 1, 'rgba(6,6,10,.9)')` under `ctx.globalAlpha = fade * fade`.

   But the plan's own reason only holds at the very start of the band. At 23 px `coverT = smoothstep(16, 32, 23) = 0.41`, so the rim is 37% casing on a tile that is 87% opaque. In the `map-covers-dense-fade-crop` pairs every tile now has a distinct dark outline, and where two tiles overlap the upper one's rim draws a line across the lower one. The baseline pile (no rim) reads as soft, merging tinted tiles. That is the look the owner calls "a nice blur effect", and the rim works against it more than the paler tint does. (In the prototype the rim fades with the cover as `fade²`, about 15% at 23 px, but its covers are themselves only 17% opaque there, so the prototype never showed this combination.) Fix: show the owner the tiles with the rim as built and with the rim held back to the end of the fade, and let him choose. A one-line change for the second option: `0.9 * smoothstep(0.6, 1.0, v_coverT)` in place of `0.9 * v_coverT` (no rim below about 25 px, full rim at 32 px and over, where the plan needs it on bright gas). Do this in step 10, not before. If he takes the held-back version, pin the new factor in `album.test.ts`.

3. **Minor, owner question already planned (step 10): paler, greyer tiles.** At 23 px the tile is 59% `v_tint`, and `starTint` is `STAR_WHITE` mixed only slightly with the family hue (`state/stars.ts:99-102`), so every tile starts near off-white where the baseline started from saturated clay, moss and ochre. Over blue-grey gas the pile reads washed out. A small extra: at 23 px the star is still lit (`starA` multiplied by `1 - coverT` = 0.59), and its pale light adds through the 13% of the tile that is not opaque and as a halo around it, which adds a little to the paleness. If the owner wants more colour, the cheap option is to start the tile from the family hue itself (`EMBER_RGB[lead]`, or a fixed mix towards it) in a separate attribute or uniform table, not from the star tint. That is a design change, so it waits for his answer.

4. **Minor: the small stars are faint on the brightest cream** (`map-opening-cream-crop.jpg`). The class-3 stars are barely visible there; the bright classes and under-discs hold. This is Task 9's fidelity check (the acceptance item "warm dots on cream and rust"); no change in Task 2. Note it in the ledger as an item to recheck on `--still` captures.

5. **Minor: the tests are mostly source-text pins.** Both new test files assert regexes against shader and component source. They do catch the regressions the plan names (a second deal, a rewrite of `a_star`, a read of album records, the depth settings, the band formulas, the 50% pick alpha, no darkening towards the page colour) and they were red first as the plan predicted. They are not tautological, but they cannot see what renders. Nothing was loosened: the old `album.test.ts` cases are unchanged apart from the import line, and no e2e file was edited (`explore.spec.ts:295` is red on `isLamp`, as the plan predicts, and part 3 owns it). Gap: the keyline factor is not pinned. If finding 2 changes it, add a regex for the chosen factor.

6. **Minor, design check: hover on a star hides its star light.** A hovered album is on layer 0.2, so `starA = 0` and the star becomes the ring plus a white core. That follows the plan's depth rule and looks right in the hover pair. Recorded only so Task 9 does not report it as a bug.

No Critical findings.

## Evidence

- Reviewer perf runs: `scratchpad/rv2-perf-{base,head}-{1,2,3}.{txt,json}`, summary `scratchpad/rv2-perf-summary.txt`, runner `scratchpad/rv2-perf-loop.sh`.
- Deep-morph probe: `scratchpad/rv2-deepmorph-probe.mjs`, results `scratchpad/rv2-deepmorph-{base,head}-{a,b}.json`.
- Shader identity check: `scratchpad/plan-shader.txt` vs `scratchpad/head-shader.txt` (no difference).
