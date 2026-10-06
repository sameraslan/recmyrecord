# Part 2 Task 5 review: region names layout (pure)

Reviewed 2026-10-06. Commit `4c3cfed2` on `task5-names` (parent `1907f1fd`). Files: `frontcreck/src/components/map/state/namesLayout.ts`, `namesLayout.test.ts`. Spec: Task 5 of `2026-10-04-trifid-theme-2-stars-lines-names.md`, prototype `docs/design/trifid-theme/prototype/src/labels.js`, approved `final-overview.jpg`.

**Verdict: APPROVED.** No blocking findings. The timing script ships with this review as `frontcreck/scripts/perf/names-cost.cjs` (finding 1 covers the one-line change it needed).

## Checks run

- `npm run lint`: clean, including the new script. `npm run typecheck`: clean.
- `npm run test`: 480 of 480 passed. Two of four full runs had 1 failure in `SearchBox.test.tsx` ("keystroke ... under 5 ms"), a wall-clock test that this commit does not touch. It passed when run on its own and in the other two runs. It fails when the machine is loaded, and Task 5 did not cause it.
- **Tests are the plan's, byte for byte.** `diff` of the plan's Step 1 block against `namesLayout.test.ts` is empty.
- **Implementation is the plan's apart from `layoutNames`.** `diff` of the plan's Step 3 block against `namesLayout.ts` shows changes only in the declared allocation rework. That covers `overlapsAny` → `hitsAny`, the boxes array → a module `Float64Array` (`taken`), filter+sort → a module scratch array (`order`) with `try/finally`, and `haloFor` per call → a `WeakMap` cache keyed by label (`haloOf`). Every other export is unchanged.
- **The rework is behaviour-identical.** Rolldown bundled the plan's version and the reworked one side by side. Both ran over (a) the timing script's 410 cases x 400 rounds = 164,000 calls, with one sticky map per case per version, and (b) 100,000 fuzz calls. The fuzz used random window sizes, desktop and phone, chrome with header offset, inset and card, 1 to 40 candidates drawn from all three stops, tied priorities, alpha 0 / partial / 1, `fullHalo`, `pxPerWorld` at exactly 600, and one sticky map carried across calls and occasionally reset. The outputs (`JSON.stringify`) and sticky-map contents were compared after every call. **0 of 164,000 and 0 of 100,000 differed**, over 1,001,200 and 425,697 placed names. Of those, 186,400 had a solved (under 1) halo, so the cached-halo path was exercised.

## Prototype fidelity

- Shown band: `coverPx < 13` (prototype `cp < BAND_B`, 13). There are no names with an album open, which is the prototype's `albumname=0` and the owner's decision. Pinned `NAMES_BAND_PX (13) < COVER_FADE_START_PX (16)`, so there are no names once covers show.
- Caps: 17 desktop, 4 phone, one per 160 x 90 px of free map. These match `config.js` `NAMES_MAX: 17, NAMES_MAX_PHONE: 4` and labels.js L130-133. The phone test is meaningful. Without the phone cap the same nine candidates all fit (checked: 9 placed), and with it 4 are placed at 15 px.
- Sizes: the two tiers at k = 0.88 (Tenor) and the phone clamp of 13 to 16 match labels.js L66-70 and L140 (`13 * min(1, 0.88 + 0.15)` = 13). The third (broad-area) tier is not used, as the plan declares.
- Candidates: theme.json holds 7 / 17 / 6 labels (Sonic / Balanced / Mood), all named. The approved Balanced Overview (`final-overview.jpg`) shows the 10 of 17 whose points are on screen, which is what the layout's on-screen test does.
- Morph: out over the first 40%, in over the last 40%, with no names travelling. The prototype let a name travel when its id and word matched. The plan drops that on purpose ("Names do not travel"), so this is a decision and not a defect.
- Size reference: see finding 2.

## Contrast and halo (4.5:1)

The formula matches labels.js `haloFor` exactly (h from 0.50 in 0.05 steps, +0.15, cap 1). The model treats the halo as a black layer of opacity h over the gas, blended in gamma space, with the ink composited over it. That is the right reading of "the halo is the immediate surround".

The solved halo, contrast ratio and full-halo ratio were computed for every label in theme.json against its `lum` (the brightest gas under the unmoved box). Fair names were computed at 0.82 opacity. The check was then repeated with exact per-channel sRGB compositing of the label's own ink colour, in place of the 2.2-gamma luminance shortcut:

- Solved halos range from 0.65 to 0.80. The worst ratio is **6.92:1 exact** (7.28 by the model), for Balanced "Epic Expanse" (fair, lum 0.625, halo 0.70). Every other label is higher. The lowest ink luminance is 0.857.
- At full halo the worst is 12.26:1.
- The prototype ran `haloFor` with ink opacity 1 for fair names and scaled `bg` down by `gasK`. The port uses 0.82 for fair names and the unscaled `lum`. Both changes give a stronger halo, so the port is stricter than the prototype, not looser.
- The full halo is forced in every case where `lum` no longer describes the gas behind the name: under 600 px per world unit, when the name is nudged, during a morph, and on a phone (the phone case is set by the Task 7 driver). The test pins both sides of 600 exactly.

## Reentrancy of the shared buffers

`order` (L181) and `taken` (L156) are module state. A nested `layoutNames` call made from inside `input.widthOf` would empty `order` and overwrite `taken`. The outer call would then stop early and miss overlaps. That is the only way to re-enter: the module is synchronous, and JS runs one call at a time. The planned driver (Task 7) passes `nameWidths.widthOf` from `state/nameWidths.ts`. That is `createWidthCache(measure100)`, and `measure100` only calls `CanvasRenderingContext2D.measureText`, so it cannot call `layoutNames`. **Safe as planned.** The `try/finally` also clears `order` if `widthOf` throws. `taken` holds `NAMES_MAX` boxes, and the budget is `min(NAMES_MAX or NAMES_MAX_PHONE, ...)`, so it cannot overflow (see finding 4).

## Performance

The script was run three times from `frontcreck/`, for 164,000 calls each. Mean 2.49 to 2.80 us, p50 about 1.7 us, p99 8.3 to 9.9 us, p99.9 46 to 115 us, with an average of 6.1 names placed per call. About 190 bytes are allocated per call (the result array and objects). `chromeBlockers` takes about 0.1 to 0.2 us. The implementer's three saved runs agree (mean 2.45 to 2.57 us, p99 8.4 to 9.0 us).

The single-call maxima (0.5 to 18 ms) are scheduler noise: the empty-call control loop in the same run shows maxima of 0.4 to 2 ms, and the slowest case changes between runs. The heaviest case by mean is a desktop morph with both stops' names (up to about 70 us mean in one run, 40 us in another). That is still a small share of a 16.7 ms frame. **The claims are plausible.**

## Findings

1. **Low: the timing script failed lint as-is, and writes build output into the repo.** In `frontcreck/scripts/perf/names-cost.cjs`, the three `require()` calls (L9, L10, L22 after the added line) tripped `@typescript-eslint/no-require-imports`, which made `npm run lint` fail. This review adds one line at the top, `/* eslint-disable @typescript-eslint/no-require-imports -- ... */`, and changes nothing else. The script also bundles to `path.join(__dirname, 'namesLayout.mjs')` (L12), so every run leaves an untracked `scripts/perf/namesLayout.mjs` that could be committed by mistake. Fix: write the bundle to `os.tmpdir()`, or add `scripts/perf/namesLayout.mjs` to `frontcreck/.gitignore`.
2. **Low (plan inference, judge in Task 9): the size reference differs from the prototype at the Overview.** `namesLayout.ts:19` and `:46` use 12.5 px covers as the reference. The prototype divides by `ppwOverview` (app.js L82, L324), the stop's own Overview scale, which is capped at 12.5 px only when the 1st-to-99th-percentile fit would go past it. So the prototype's names are at factor 1.0 at every Overview. The app's Overview gives 0.966 at Balanced (11.15 px) and 0.947 at Sonic (10.44 px). A strong name with n ≥ 346 then shows at 20.5 px (Balanced) or 20 px (Sonic), against the 21.1 px of the approved pictures, about 1 px smaller. Mood is unchanged. The plan pins `nameZoomK(12.5) === 1`, so nothing changes in Task 5. Fix if the Task 9 comparison shows it: have the driver pass coverPx relative to the stop's Overview framing, or change `NAME_REF_COVER_PX`, as a plan amendment.
3. **Low (test, plan-owned): the chrome-clearance test passes even if nothing is placed.** In `namesLayout.test.ts:161`, only 1 of the 4 candidates is placed ("hint", nudged to y 747). Every assertion runs over `out`, so if the layout returned `[]` the test would still pass. The tests must equal the plan, so they were not edited. Fix (plan amendment): add `expect(out.length).toBeGreaterThan(0)`.
4. **Info: the fixed buffer is tied to `NAMES_MAX`.** `taken = new Float64Array(4 * NAMES_MAX)` (L156). Typed arrays drop writes past their end without an error. If a future cap above `NAMES_MAX` were added (for example the prototype's `names=all` mode), boxes beyond 17 would be dropped and names would overlap with no error. Fix (optional): size the buffer from the larger of the caps, or add a comment on `NAMES_MAX` saying `taken` depends on it. A one-line "not reentrant: `widthOf` must not call `layoutNames`" comment on `layoutNames` (L184) would also record the reentrancy condition above.
5. **Info: the halo cache assumes labels never change.** `solvedHalo` (L170) is a `WeakMap` keyed by label object. Theme labels are parsed JSON and are never changed in place, and a new theme brings new objects, so this is correct. A label changed in place would keep its old halo.
6. **Info: contrast during a morph.** A name fading in or out at opacity under 1 drops below 4.5:1 for a moment even at full halo, because the halo fades with the element. This is inherent to a cross-fade, matches the prototype, and lasts only while the slider moves. No change.
