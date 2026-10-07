# Trifid theme in the app: what is on the branch

State of `feat/trifid-theme` on 2026-10-07 (draft PR 47, issue 45). This file describes what was built, not what was planned. Where a plan under `docs/superpowers/plans/` says something else, this file and the code win. The decisions behind the look are in `HANDOFF.md`; the day by day record is the ledger, `docs/superpowers/plans/2026-10-06-trifid-theme-ledger-part2b-part3.md`.

## What the theme is

- **Gas behind the albums.** The nebula is painted once at build time (`npm run theme`) into `frontcreck/public/data/theme/`: one image per slider stop that every visit loads, and a sharper one per stop that a desktop with a real GPU fetches when the map is idle. The map draws it on its own layer behind the albums and cross-fades it as the slider moves.
- **Every star is an album.** There are no decorative stars. Each album is drawn as a star until the zoom reaches covers. Star size and brightness are dealt at random on every page load.
- **Glints at rest.** A few of the brightest stars flare for a moment while the map is still. They are DOM elements over the canvas, so a glint never redraws the map.
- **White cased lines** from an open album to its closest albums, off-white frames on covers, a selected ring with a dark casing so it reads on bright gas.
- **The map runs under the header.** The canvas starts at the top of the window and the header sits over it. Albums are framed in the area below the header.
- **Glass panels on wide screens.** The header, the album panel, the slider panel and the zoom buttons are see-through with a backdrop blur. On phones, in browsers without `backdrop-filter`, and under reduced transparency they are fully solid.
- **Home, About and 404** sit over the same nebula. Home has a scrim over the header bar and shows one row of covers in short windows.
- **Phone album page.** The strip above the list is a small picture of the map around the album, with the gas at 62 % strength.
- **No film grain.** New favicon. The colour tokens keep their names and have new values (`frontcreck/src/app/globals.css`).

Pictures of the current state: `reviews/app-part3/no-names-overview.jpg`, `no-names-album.jpg`, `no-names-phone.jpg`. The approved pictures it was built to are `options/final-*.jpg`.

## File map

All paths are under `frontcreck/`.

| Piece | Where |
|---|---|
| Bake of the gas and `theme.json` | `scripts/theme/build-theme.mjs`, `bake-core.js`, `bake-page.js`; inputs in `../data-pipeline/theme/` |
| Baked files | `public/data/theme/` (six images and `theme.json`) |
| Loading and checking the theme | `src/lib/data/theme.ts`, `src/components/map/theme.ts`; staleness guard `src/lib/data/theme.data.test.ts` |
| Gas layer and shader | `src/components/map/canvas/GasField.tsx`, `src/components/map/shaders/gas.ts` |
| Stars and covers | `src/components/map/canvas/AlbumField.tsx`, `shaders/album.ts`, `state/stars.ts` |
| Glints | `src/components/map/canvas/TwinkleDriver.tsx`, `overlays/Twinkle.tsx`, `state/twinkle.ts`; GPU or software renderer: `state/renderer.ts` |
| Map under the header | `src/lib/media.ts` (`HEADER_PX` 64, `HEADER_NARROW_PX` 60), `state/stageTop.ts`, `MapInput.insetTop` in `types.ts`, `canvas/InitialFrame.tsx`, `CameraTween.tsx`, `CameraBounds.tsx`, `state/bounds.ts` |
| Covers and lines round an open album | `state/focusLayout.ts`, `canvas/MarkerDriver.tsx`, `overlays/FocusMarkers.tsx` |
| Glass tokens and the three solid fallbacks | `src/app/globals.css` (the three one-line rules after the tokens; the first is the phone switch) |
| Surface styles | `src/styles/shell.css` (header), `map.css`, `album.css`, `home.css`, `phone.css` |
| Phone strip | `src/components/album/MapPreviewStrip.tsx` (`STRIP_GAS_STRENGTH`) |
| Contrast model | `src/lib/contrast.ts` and its test |
| Framing record | `e2e/fixtures/framing-baseline.json`, read by `e2e/framing.spec.ts`. Never record it again. |

`MapStage.tsx` must stay under about 20,000 bytes of source (19,705 now). Past that the bundler splits a first-load chunk and first-load JS grows for nothing. A module added to the first-load graph can do the same: measure, do not assume.

## Hard rules the theme keeps

1. **Album positions never move.** The theme changes how albums are drawn, not where. `framing.spec.ts` holds every framing to the record made before the map ran under the header: 0.000 px on every line at the last full run. The opening view itself was changed on purpose (the map opens at the Overview, not the whole cloud), so the claim is "the same as before the map ran under the header", not "the same as the old site".
2. **No redraw at rest.** The canvas draws 0 frames while nothing changes. Glints are DOM and add none.
3. **Nothing on the pointer-move path.** Moving the mouse over empty map costs one frame per move and no layout work was added to it.
4. **Text keeps 4.5:1**, on glass over the brightest backdrop and on the solid fallback. Computed in `contrast.test.ts`, measured on painted pixels in `e2e/glass.spec.ts` and `pages.spec.ts`.
5. **Phone tap targets are at least 44 px.**
6. **Every star is an album**, with size and brightness random per load.
7. `scripts/perf/budgets.json` is unchanged, and so are `albums.json`, `positions.json` and `recs.json`.

## Dropped or held back for speed

| What | State |
|---|---|
| Hover label | A solid tint, not glass. It moves on every hover frame, and a backdrop blur there was the one effect dropped outright. |
| Glints on a software renderer | Off. The app asks the renderer's name and plays no glints when the CPU is shading the pixels. |
| Glints while hovering | No new glint while an album is hovered and for 500 ms after. None while the view moves and for 500 ms after. |
| Glass on phones | Off. Phones get solid panels. One line in `globals.css` switches it on; it waits for the owner's trial on a real phone. |
| Phone strip gas | 62 % strength, copied off the main thread. |
| Sharper gas image | Only on a desktop with a real GPU, fetched when the map is idle. |

One fallback is written down beside the code and not applied: a solid header ("Speed fallback 2" in `shell.css`). It was not needed on the measured machine.

## Removed

- **Region names and their button.** Built in part 2, then removed on the owner's instruction on 2026-10-06: the layer, the toggle, the store state, the CSS, the copy, the web font it loaded and its tests. The map has no names. Left in place and ignored by the app: the `labels` block in `public/data/theme/theme.json` and the code in `scripts/theme/` that computes it.
- **The numbers beside the closest albums.** Removed on the owner's instruction on 2026-10-07 (the model is only so accurate): the number in each list row, the numbered badges on the covers round an open album, and those drawn on the phone strip, with their CSS and the `rank` field of a list row. The lists and the covers keep their order, closest first.
- **The hint band beside an open album** (`COPY.map.hintAlbum`), to match the approved album picture.
- **The film grain overlay**, and the warm ambient wash over the map.

## Speed against the old site

Full write-up: `reviews/app-perf-part2.md` (conditions, old against new, glints) and `reviews/app-perf-part3.md` (glass, header, Home, strip). The numbers are approximations: a busy shared laptop, partly on battery. Read the conditions at the top of part 2 before quoting any of them.

- No budget missed, 0 idle frames.
- Header blur against a solid header on a moving map: no dropped frame in 24 sessions, longest gaps within 1 ms of each other.
- Glints on against off at the first hover: 61 against 64 ms, inside the noise.
- Slower than the old site: opening an album from a pick by 3 to 5 ms, and the first map frame on a desktop GPU by about 19 ms. The owner accepted both as not noticeable; they were not chased.
- On a software renderer the gas makes zooming much slower than the old site. The owner chose to keep the nebula everywhere.
- First-load JS: 190.68 KB in 11 scripts, against 190.5 before the theme.

## Known open items

None blocks the owner's trial. From the final review (`440d2073`) and the ledger:

- **Phone, album at the cloud's lower edge** (checklist 16.11): fixed on this branch for phones (`136ed758`, `80eca19f`; `state/bounds.ts`, `canvas/CameraBounds.tsx`). The idle camera pull-back used to rest a picked album under the card. Now, on a phone, the camera may rest lower by the height of the panels covering the bottom of the screen, capped so the lowest album rests no higher than the middle of the visible band; the cap protects a phone on its side. Desktop is unchanged. The old site (`main`) still has the fault. See `reviews/app-part2/REGRESSION-RESULTS.md`.
- A zoom while the covers round an open album are crowded against the map's edge still has one code path that carries and then eases them. Not reproduced in a browser; no unit test pins it.
- Arrow-key pan at a wall with an album open: covers ease 14 to 17 px after the stop.
- Window resize with an album open: covers trail the map by up to 79 px for about 24 frames. Not compared with the old site.
- Taking over the map during the 420 ms opening tween snaps the covers to the fresh layout in one frame.
- A zoom frame with an album open allocates new arrays in the layout solve (as the old site did): 5 to 26 microseconds mean, 0.74 ms worst.
- `Header.tsx` marks Map as `aria-current="page"` on album pages; `aria-current="true"` would be the exact value.
- Leftovers: store field `ambient` is written and read only by tests; class `is-dimmed` still set in `MapStage.tsx`; `GAS_DIMMED_STRENGTH` is a constant 1; `rawToWorld` in `components/map/data.ts` has no caller.
- `explore.spec.ts` "Explore this area" once read a camera y off by 0.00011 on a phone under load. Not explained.
- Known load-sensitive tests: the `SearchBox` 5 ms unit test, `flows.spec` desktop, phone tap tests, the two `gas.spec` frame-gap tests on software rendering, phone `twinkle.spec` glint write under 8 ms.
- Not judged by any test or reviewer: motion in flight, a real phone, Safari, Firefox, Reduce Motion by hand. The Safari prefix and the no-support fallback are checked in the built CSS only.

## Running the tests

From `frontcreck/`, on arm64 Node (see `frontcreck/README.md`, Requirements).

```bash
npm run typecheck && npm run lint && npm test
npx playwright test --project=desktop --workers=1
npx playwright test --project=phone --workers=1
npx playwright test --project=nowebgl --workers=1
```

One project at a time and one worker: the timing tests share the machine with the browser. Each run builds and serves the site on port 3100.

Switches the tests and scripts use (none has a control on screen):

- `window.__rmrTwinkle = 'off' | 'on'`: the glints.
- `window.__rmrGasLite = 'off'`: the full gas shader on a software renderer, for tests that read gas pixels.
- `window.__rmrOpen = 'whole'`: open on the whole cloud, as the old site did.
- `E2E_GPU=1 npx playwright test <spec> -g "<name>" --project=desktop --workers=1`: named tests in the installed Chrome on the real GPU. By hand only.

Last full run, at `440d2073`: unit 713 of 714 (the `SearchBox` timing test, under load), desktop 210 passed and 25 skipped, phone 135 passed, 99 skipped and 1 failed (a new pinch test whose reference frame could be one early; the test was fixed in `7f080e5b` and passed 10 of 10 after), no-WebGL 3 of 3. Framing 0.000 px.

## Running the speed scripts

They need a build, Google Chrome, mains power and a quiet machine to mean anything.

```bash
npm run build
npm run perf                                             # the budgets, four columns
npm run perf -- --mode gpu --viewport desktop --glass off   # or --glass on, --twinkle on|off
node scripts/perf/compare.mjs <baselineDir> <currentDir>    # two sets of runs side by side
node scripts/perf/twinkle-cost.mjs                           # what the glints cost
node scripts/perf/layout-cost.mjs                            # the cover layout per frame
node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs <out.json> http://127.0.0.1:3500 --start
node ../docs/design/trifid-theme/reviews/after/perf/effect-probe.mjs header <out.json> --n 6
```

How each published number was made is at the end of `reviews/app-perf-part2.md` (section 7) and `app-perf-part3.md` (section 8). First-load JS is the sum of the scripts the built `/` page loads.
