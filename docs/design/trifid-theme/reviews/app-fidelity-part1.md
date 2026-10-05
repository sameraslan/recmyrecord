# Part 1 fidelity: the app's gas against the prototype and the approved pictures

Date: 2026-10-05. Branch `trifid-build`, app code at commit `761accb7` (gas layer of tasks 1 to 5, plus the bitmap release and the deferred upload of Task 6, which do not change a pixel). Only the gas is judged. Stars, region names, glass panels, the header over the map, the removal of the film grain and the sky-coloured pane belong to parts 2 and 3.

This was written by the implementer of Task 6. A separate reviewer is meant to redo it from the files named here.

## Verdict

At the same framing the app's gas is the prototype's gas. Mean luma, its standard deviation, mean saturation and hue agree to within 0.8 luma levels (0.3 in every state but Overview), 0.008 saturation and 1 degree of hue in every patch of every map state that was compared (Overview, Whole map, an open album twice, full zoom). Two things differ, and one thing looks different without being a difference in the gas:

1. **Fine detail is 5 to 13% lower in the app** over the whole map area (the standard deviation of luma minus its 9 px box blur: 12% lower at the prototype's Overview framing, 13% beside The Stone Roses, 9% beside In Rainbows, 5% at Whole map, 6% at full zoom; single patches range from 4% more to 19% less). Cause: the app's stop is a 2048 px lossy WebP baked at build time; the prototype bakes 4096 px in the browser from float fields. By eye the app is very slightly softer at 1:1 and the same at a normal viewing distance. This is the price of the plan's 2048 px bake (a quarter of the memory and of the upload time). Not changed.
2. **Home is darker than the approved picture by design of the plan, not of the prototype.** The plan dims the gas to 0.6 of its strength on Home, About and 404 (`GAS_DIMMED_STRENGTH`); the prototype draws Home at full strength under a 10% veil. With everything but the canvas hidden, the app's Home gas has mean luma 12.6 against 16.5 and, in the bright patches, 34 against 50 (about a third less light). Today the old brown veil of the site also still lies over it (part 3 replaces it). Left as the plan has it, because part 3 measures its Home contrast against this dim; it is a decision for the owner whether Home should match `final-home.jpg` (set the constant to 1) once part 3's veil is in.
3. **The app opens `/map` at the framing the prototype calls Whole map**, 2.7 times further out than the prototype's Overview (`final-overview.jpg`): 686 px per world unit against 1828 at 1600 x 1000. That is the camera's fit, which part 1 does not touch. It makes the first view of the map look smaller and darker (more sky) than the approved Overview. Zoomed in to the prototype's framing the two are the same picture.

## The suspicion: an open album looked brighter, paler and flatter than `final-album.jpg`

Settled: it is not the gas. The Stone Roses was opened in both at Balanced, and the prototype was put on the app's exact framing (the app frames it at 2926 px per world unit, the prototype's own framing is 2911; albums land within 0.01 px of each other). Over the whole map area: luma 64.0 against 64.0, standard deviation 22.4 against 22.5, saturation 0.354 against 0.354, hue 13 against 13 degrees, mean colour rgb(81, 60, 54) in both. The twelve patches agree as closely (table in `app-part1/stats.md`). The pool amount is 1 in both and its centre and radius are the same. The same holds for a second album in the brightest cream gas (In Rainbows): 59.7 against 59.6, 28.4 against 28.4, 0.255 against 0.256.

So strength curve, pool amount and radius, glow and tone map are all equal. The prototype's page veil is only on Home, not beside an album. What made the earlier screenshots look different: they showed another region (cream gas is bright in both), and three things that are still today's site and sit on top of the gas: the album dots (about 4,000 warm dots at 45% alpha where the prototype has small white stars), the film grain over the whole page, and the faint grey lines. All three go in parts 2 and 3. Nothing was changed in the gas code.

## How the pairs were made

`app-part1/capture-pairs.mjs` (run from `frontcreck/`, against a production build): one headless Chromium with software WebGL, the renderer the approved pictures were taken with, 1600 x 1000 at device pixel ratio 1. For each state the app is put in the state with its own controls. The prototype (`prototype/index.html`, opened from disk) is then moved so every album sits on the same screen px as in the app (worst offset 0.00 px in every state). For Overview it is the other way round: the app's camera is moved to the prototype's own Overview framing, since the app opens further out. Numbers come from the two gas-only images: the app with everything but the canvas hidden (film grain off), the prototype with its `gasonly=1` switch (no stars), and in both every pixel within a few px of an album masked out, because the app's dots and covers are drawn in the same canvas. Patches are a 4 x 3 grid of the map area plus the whole area. Full tables: `app-part1/stats.md`, raw: `app-part1/stats.json`.

Files in `app-part1/`, JPEG quality 90:

| State | App | Prototype at the app's framing | Prototype at its own framing | Gas only, app and prototype | Approved picture |
|---|---|---|---|---|---|
| Overview | `overview-app.jpg` | `overview-prototype.jpg` | `overview-prototype-own.jpg` | `overview-app-gas.jpg`, `overview-prototype-gas.jpg` | `options/final-overview.jpg` |
| Whole map | `whole-app.jpg` | `whole-prototype.jpg` | `whole-prototype-own.jpg` | `whole-app-gas.jpg`, `whole-prototype-gas.jpg` | `options/final-whole.jpg` |
| Album (The Stone Roses, Balanced) | `album-app.jpg` | `album-prototype.jpg` | `album-prototype-own.jpg` | `album-app-gas.jpg`, `album-prototype-gas.jpg` | `options/final-album.jpg` |
| Album in bright gas (In Rainbows) | `album-bright-app.jpg` | `album-bright-prototype.jpg` | `album-bright-prototype-own.jpg` | `album-bright-app-gas.jpg`, `album-bright-prototype-gas.jpg` | none (added to settle the suspicion) |
| Home | `home-app.jpg` | `home-prototype.jpg` | `home-prototype-own.jpg` | `home-app-gas.jpg`, `home-prototype-gas.jpg` | `options/final-home.jpg` |
| Full zoom | `deep-app.jpg` | `deep-prototype.jpg` | `deep-prototype-own.jpg` | `deep-app-gas.jpg`, `deep-prototype-gas.jpg` | `options/q-deep.jpg`, panel C "Faint" |

## Per approved picture

Whole map area, app / prototype. "Detail" is the fine-detail figure described above.

| Approved picture | Framing of the pair | Remaining difference in framing | Luma mean | Luma sd | Saturation | Hue | Detail | Verdict on the gas |
|---|---|---|---|---|---|---|---|---|
| `final-overview.jpg` | The prototype's own Overview (1828 px per world unit); the app zoomed in to it | none (0.00 px). The app's canvas starts under its 64 px header, the prototype's runs behind it, so the top 64 px cannot be compared | 90.5 / 90.3 | 53.9 / 53.9 | 0.330 / 0.330 | 354 / 353 | 3.47 / 3.93 | equal, a little less fine detail |
| `final-whole.jpg` | The app as `/map` opens, which is the prototype's Whole map (686 in both) | none (0.00 px) | 16.5 / 16.5 | 24.3 / 24.2 | 0.340 / 0.339 | 260 / 260 | 1.43 / 1.51 | equal |
| `final-album.jpg` | The app's own framing of The Stone Roses (2926); the prototype's own is 2911, 0.5% wider | none in the pair; against the approved picture the app is 0.5% closer and the albums sit up to about 10 px away | 64.0 / 64.0 | 22.4 / 22.5 | 0.354 / 0.354 | 13 / 13 | 1.72 / 1.98 | equal, a little less fine detail |
| `final-home.jpg` | Whole map in both (686) | none (0.00 px) | 12.6 / 16.5 | 16.0 / 24.2 | 0.342 / 0.339 | 258 / 260 | 1.18 / 1.51 | darker and flatter: the plan's 0.6 dim on Home (see 2 above). Hue and saturation equal |
| `q-deep.jpg` panel C | The picture's own camera (world 0.1837, -0.0562 at full zoom, 64 px covers) | none (0.00 px) | 32.8 / 32.7 | 3.3 / 3.3 | 0.139 / 0.137 | 14 / 14 | 0.91 / 0.97 | equal: mean colour rgb(36, 32, 31) in both, against the prototype README's rgb(35, 31, 30) for this spot |

Per region, from the patches (app / prototype, luma then hue): rust top left of Overview 95.3 / 95.2 and 338 / 337; the dark blue and the cream agree as closely in `stats.md`. No patch in any map state differs by more than 0.8 luma (one Overview patch; 0.3 elsewhere) or 0.008 saturation. Hue differs by 0 to 1 degree in every patch with saturation over 0.3; in near-grey patches, where hue is ill defined, by up to 6.

What each comparison shows about the parts of the look:

- **Brightness, saturation, contrast, hue per region**: equal (tables).
- **Amount of fine detail**: 5 to 13% lower in the app over the whole map area (2048 px bake).
- **The dim around an open album**: equal. The pool amount, centre and radius match and the dimmed gas has the same luma patch by patch (The Stone Roses: 44.6 / 44.5 at the far corner to 108.1 / 108.1 in the cream).
- **The deep zoom fade**: equal at full zoom (above). The curve between 32 and 56 px covers is pinned by a unit test against the prototype's own function at every 0.01 px (Task 4); the browser test reads luma 26.5 at full zoom against 85.4 at 32 px covers on the same point of the map.
- **Glow**: no separate figure. A glow that was too strong or too weak would show as a difference in mean luma and in contrast; there is none.

## Not judged here

- Motion: the slider cross-fade, the pool easing, the fade into deep zoom while zooming. Stills cannot show them.
- The pool when going from album to album or moving the slider with an album open: its centre and radius jump in one frame and only its amount eases. The prototype does the same (`src/app.js` `apply()` assigns `S.pool` at once and animates only `S.amt.pool`), so the app was left as it is. One small difference remains: the app keeps the pool's smallest radius at 170 px on screen at the current zoom, the prototype fixes it in world units at the zoom the album opens with. They are equal at the default framing and differ only if the visitor zooms with an album open.
- Sonic and Mood: the pairs are all at Balanced, as the approved pictures are (`final-mood.jpg` was not compared like for like).
- A real GPU: the pairs were taken with software WebGL, like the approved pictures.
- Safari. The gas relies on `createImageBitmap` with `premultiplyAlpha: 'none'`. Playwright's WebKit is not installed on this machine and was not downloaded, so no WebKit pixel check was made. It is on the owner's list to look at the map in real Safari: if Safari multiplied the dust channel into the colour, the gas would look darker and dirtier along the dust lanes.
- A phone.
