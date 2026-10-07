# Part 1 fidelity: the app's gas against the prototype and the approved pictures

> Note (2026-10-07): the pictures (`.jpg`, `.png`) under `app-part1/` were pruned before merge. They remain in git history at commit `03f1386c`. The documents, scripts and measurement files are still in place.

Date: 2026-10-05. Branch `trifid-build`, app code at commit `6c225edd` (gas layer of tasks 1 to 5, plus Task 6's changes to when gas images are uploaded, which do not change a pixel). All pairs and numbers below were taken again on that commit. Only the gas is judged. Stars, region names, glass panels, the header over the map, the removal of the film grain and the sky-coloured pane belong to parts 2 and 3.

This was written by the implementer of Task 6 and is **not a sign-off**. The plan asks for a reviewer who did not write the part; that reviewer redoes the comparison from the files named here.

## Verdict

At the same framing the app's gas is the prototype's gas at all three stops. Mean luma agrees to within 1.0 luma level in every patch of every map state that was compared, and its standard deviation to within 0.2 over each whole map area (Overview at Balanced, Mood and Sonic, Whole map, an open album twice, full zoom) and mean saturation to within 0.008. Hue agrees to 0 to 2 degrees in every patch with saturation over 0.3; in near-grey patches, where hue is ill defined, it differs by up to 6 (Whole map r2c3: 334 against 328). Two things differ, one thing looks different without being a difference in the gas, and one thing sits on top of the gas:

1. **Fine detail is lower in the app: about 12% at Overview and 17% beside an album**, more in single patches. The figure is the standard deviation of luma minus its 9 px box blur. It has a floor that is not gas: the grain and dither of empty sky read 0.92 in the app and 0.94 in the prototype (Whole map r1c4). Taking that floor off as independent noise (square root of the difference of squares), the app has 12% less at the prototype's Overview framing (Balanced and Mood; 9% at Sonic), 17% less beside The Stone Roses, 11% less beside In Rainbows and 7% less at Whole map; single patches go to 31% less (a dim Overview patch) and 26% less (album). Taking the floor off by plain subtraction, as the reviewer of this task did, gives 15% at Overview and 23% beside the album. Without removing the floor the same numbers read 12%, 13%, 9% and 5%, which is what the first version of this note gave and understates it. At full zoom both sides are at the floor (0.91 against 0.97), so there is no gas detail left to compare, as intended. Cause: the app's stop is a 2048 px lossy WebP baked at build time; the prototype bakes 4096 px in the browser from float fields. By eye, at 1:1, the app is softer in the finest filaments and the same at a normal viewing distance. It is the price of the plan's 2048 px bake (a quarter of the memory and upload). Not changed; a 4096 px bake, or a higher WebP quality, are the two things that could be tried, and which of the two the loss comes from was not separated.
2. **Home is darker than the approved picture by design of the plan, not of the prototype.** The plan dims the gas to 0.6 of its strength on Home, About and 404 (`GAS_DIMMED_STRENGTH`); the prototype draws Home at full strength under a 10% veil. With everything but the canvas hidden, the app's Home gas has mean luma 12.6 against 16.5 and, in the bright patches, 34 against 50 (about a third less light). Today the old brown veil of the site also still lies over it (part 3 replaces it). Left as the plan has it, because part 3 measures its Home contrast against this dim; it is a decision for the owner whether Home should match `final-home.jpg` (set the constant to 1) once part 3's veil is in.
3. (Framing, not gas.) **The app opens `/map` at the framing the prototype calls Whole map**, 2.7 times further out than the prototype's Overview (`final-overview.jpg`): 686 px per world unit against 1828 at 1600 x 1000. That is the camera's fit, which part 1 does not touch. It makes the first view of the map look smaller and darker (more sky) than the approved Overview. Zoomed in to the prototype's framing the two are the same picture.

4. (On top of the gas.) **The site's film grain lifts the whole picture by about 4 luma levels.** In the app's full screenshots empty sky reads 10.1 where the approved pictures read 6.1, and bright gas reads 3 to 5 levels higher than in the approved picture at the same place. With the grain hidden the app reads 6.4, like the prototype. Part 3 removes the grain.

## The suspicion: an open album looked brighter, paler and flatter than `final-album.jpg`

Settled: it is not the gas. The Stone Roses was opened in both at Balanced, and the prototype was put on the app's exact framing (the app frames it at 2926 px per world unit, the prototype's own framing is 2911; albums land within 0.01 px of each other). Over the whole map area: luma 64.0 against 64.0, standard deviation 22.4 against 22.5, saturation 0.354 against 0.354, hue 13 against 13 degrees, mean colour rgb(81, 60, 54) in both. The twelve patches agree as closely (table in `app-part1/stats.md`). The pool amount is 1 in both and its centre and radius are the same. The same holds for a second album in the brightest cream gas (In Rainbows): 59.7 against 59.6, 28.4 against 28.4, 0.255 against 0.256.

So strength curve, pool amount and radius, glow and tone map are all equal. The prototype's page veil is only on Home, not beside an album. What made the earlier screenshots look different: they showed another region (cream gas is bright in both), and three things that are still today's site and sit on top of the gas: the film grain over the whole page, which lifts every pixel by about 4 luma levels and so makes the picture paler and flatter (measured below), the album dots (about 4,000 warm dots at 45% alpha where the prototype has small white stars), and the faint grey lines. All three go in parts 2 and 3. Nothing was changed in the gas code.

## How the pairs were made

`app-part1/capture-pairs.mjs` (run from `frontcreck/`, against a production build): one headless Chromium with software WebGL, the renderer the approved pictures were taken with, 1600 x 1000 at device pixel ratio 1. For each state the app is put in the state with its own controls. The prototype (`prototype/index.html`, opened from disk) is then moved so every album sits on the same screen px as in the app (worst offset 0.00 px in every state). For Overview it is the other way round: the app's camera is moved to the prototype's own Overview framing, since the app opens further out. Numbers come from the two gas-only images: the app with everything but the canvas hidden (film grain off), the prototype with its `gasonly=1` switch (no stars), and in both every pixel within a few px of an album masked out, because the app's dots and covers are drawn in the same canvas. Patches are a 4 x 3 grid of the map area plus the whole area. Full tables: `app-part1/stats.md`, raw: `app-part1/stats.json`.

Files in `app-part1/`, JPEG quality 90:

| State | App | Prototype at the app's framing | Prototype at its own framing | Gas only, app and prototype | Approved picture |
|---|---|---|---|---|---|
| Overview | `overview-app.jpg` | `overview-prototype.jpg` | `overview-prototype-own.jpg` | `overview-app-gas.jpg`, `overview-prototype-gas.jpg` | `options/final-overview.jpg` |
| Whole map | `whole-app.jpg` | `whole-prototype.jpg` | `whole-prototype-own.jpg` | `whole-app-gas.jpg`, `whole-prototype-gas.jpg` | `options/final-whole.jpg` |
| Album (The Stone Roses, Balanced) | `album-app.jpg` | `album-prototype.jpg` | `album-prototype-own.jpg` | `album-app-gas.jpg`, `album-prototype-gas.jpg` | `options/final-album.jpg` |
| Overview at Mood | `overview-mood-app.jpg` | `overview-mood-prototype.jpg` | `overview-mood-prototype-own.jpg` | `overview-mood-app-gas.jpg`, `overview-mood-prototype-gas.jpg` | `options/final-mood.jpg` |
| Overview at Sonic | `overview-sonic-app.jpg` | `overview-sonic-prototype.jpg` | `overview-sonic-prototype-own.jpg` | `overview-sonic-app-gas.jpg`, `overview-sonic-prototype-gas.jpg` | none exists |
| Album in bright gas (In Rainbows) | `album-bright-app.jpg` | `album-bright-prototype.jpg` | `album-bright-prototype-own.jpg` | `album-bright-app-gas.jpg`, `album-bright-prototype-gas.jpg` | none (added to settle the suspicion) |
| Home | `home-app.jpg` | `home-prototype.jpg` | `home-prototype-own.jpg` | `home-app-gas.jpg`, `home-prototype-gas.jpg` | `options/final-home.jpg` |
| Full zoom | `deep-app.jpg` | `deep-prototype.jpg` | `deep-prototype-own.jpg` | `deep-app-gas.jpg`, `deep-prototype-gas.jpg` | `options/q-deep.jpg`, panel C "Faint" |

## Per approved picture

Whole map area, app / prototype. "Detail" is the fine-detail figure described above.

| Approved picture | Framing of the pair | Remaining difference in framing | Luma mean | Luma sd | Saturation | Hue | Detail | Verdict on the gas |
|---|---|---|---|---|---|---|---|---|
| `final-overview.jpg` | The prototype's own Overview (1828 px per world unit); the app zoomed in to it | none (0.00 px). The app's canvas starts under its 64 px header, the prototype's runs behind it, so the top 64 px cannot be compared | 90.5 / 90.3 | 53.9 / 53.9 | 0.330 / 0.330 | 354 / 353 | 3.47 / 3.93 | equal but for fine detail (12% less) |
| `final-mood.jpg` | The prototype's own Overview at Mood (1838); the app zoomed in to it | none (0.00 px) | 66.2 / 66.0 | 53.0 / 53.0 | 0.281 / 0.282 | 283 / 283 | 2.93 / 3.29 | equal but for fine detail (12% less) |
| none (Sonic) | The prototype's own Overview at Sonic (1711); the app zoomed in to it | none (0.00 px) | 95.0 / 94.8 | 53.8 / 53.8 | 0.296 / 0.295 | 359 / 358 | 4.20 / 4.61 | equal but for fine detail (9% less) |
| `final-whole.jpg` | The app as `/map` opens, which is the prototype's Whole map (686 in both) | none (0.00 px) | 16.5 / 16.5 | 24.3 / 24.2 | 0.340 / 0.339 | 260 / 260 | 1.43 / 1.51 | equal |
| `final-album.jpg` | The app's own framing of The Stone Roses (2926); the prototype's own is 2911, 0.5% wider | none in the pair; against the approved picture the app is 0.5% closer and the albums sit up to about 10 px away | 64.0 / 64.0 | 22.4 / 22.5 | 0.354 / 0.354 | 13 / 13 | 1.72 / 1.98 | equal but for fine detail (17% less) |
| `final-home.jpg` | Whole map in both (686) | none (0.00 px) | 12.6 / 16.5 | 16.0 / 24.2 | 0.342 / 0.339 | 258 / 260 | 1.18 / 1.51 | darker and flatter: the plan's 0.6 dim on Home (see 2 above). Hue and saturation equal |
| `q-deep.jpg` panel C | The picture's own camera (world 0.1837, -0.0562 at full zoom, 64 px covers) | none (0.00 px) | 32.8 / 32.7 | 3.3 / 3.3 | 0.139 / 0.137 | 14 / 14 | 0.91 / 0.97 | equal: mean colour rgb(36, 32, 31) in both, against the prototype README's rgb(35, 31, 30) for this spot |

Per region, from the patches (app / prototype, luma then hue): rust top left of Overview 95.3 / 95.2 and 338 / 337; the dark blue and the cream agree as closely in `stats.md`. The largest differences in any patch of any map state: 1.0 luma (one Sonic Overview patch; 0.8 at Balanced, 0.6 at Mood, 0.3 or less elsewhere) and 0.008 saturation.

## Against the approved files themselves

The numbers above compare the app with a prototype render made today. Two more checks tie that to the approved JPEG files.

**The approved pictures are what the prototype renders today.** Median luma of each of the twelve patches of `final-overview.jpg`, `final-mood.jpg`, `final-whole.jpg`, `final-album.jpg` and `final-home.jpg` against today's full prototype render at its own framing (`<state>-prototype-own.jpg`), no mask: every patch within 1.5 levels (for example Overview whole area 99.5 against 99.2, Mood 84.0 against 83.7, album 52.0 against 52.0, Home 7.6 against 7.6). So nothing in the prototype has drifted since the pictures were approved, and "equal to the prototype" means "equal to the approved gas". Raw: `app-part1/approved-vs-full.json`.

**The app against the approved files directly.** Two ways, both in `stats.md` under each state and in `approved-vs-full.json`:

- Gas only (the app with everything but the canvas hidden) against the approved file, medians per patch with the albums masked: at full zoom the app, the approved panel C and the prototype all read rgb(36, 32, 31), median luma 32.8 / 32.8 / 32.7, largest patch difference 0.9. At Whole map 6.4 / 6.1 / 6.5 over the whole area, largest patch difference 1.1. At Overview the approved file reads darker than both the app's gas and the prototype's gas by the same amount (whole area 69.6 app, 64.3 approved, 69.6 prototype; Mood 40.2, 37.2, 40.0): that difference is what later parts put on top of the gas in the approved picture (the dark halos under region names and stars, the glass slider panel in the top left patch, the dark strip behind the hint line along the bottom), not gas. Beside the album only the two right-hand columns of patches can be compared this way, because the app's canvas runs under its panel and the approved picture's panel covers the left ones.
- The app's full screenshot against the approved file, medians per patch, nothing masked: the app reads higher in almost every patch, by 3 to 10 levels (Overview whole area 108.5 against 99.5; album, right-hand patches, 54.5 to 110.0 against 51.1 to 105.6; empty sky 10.1 against 6.1). Due to later parts: the film grain (about +4 everywhere; part 3), the warm dots where the approved picture has small stars with dark under-discs (part 2), no dark halos under names and no glass panels (parts 2 and 3). Due to part 1 itself: nothing was found, since with those hidden the app's gas matches.

What each comparison shows about the parts of the look:

- **Brightness, saturation, contrast, hue per region**: equal (tables).
- **Amount of fine detail**: lower in the app, about 12% at Overview and 17% beside an album with the empty-sky floor removed (2048 px lossy bake); see 1 at the top.
- **The dim around an open album**: equal. The pool amount, centre and radius match and the dimmed gas has the same luma patch by patch (The Stone Roses: 44.6 / 44.5 at the far corner to 108.1 / 108.1 in the cream).
- **The deep zoom fade**: equal at full zoom (above). The curve between 32 and 56 px covers is pinned by a unit test against the prototype's own function at every 0.01 px (Task 4); the browser test reads luma 26.5 at full zoom against 85.4 at 32 px covers on the same point of the map.
- **Glow**: no separate figure. A glow that was too strong or too weak would show as a difference in mean luma and in contrast; there is none.

## Not judged here

- Motion: the slider cross-fade, the pool easing, the fade into deep zoom while zooming. Stills cannot show them.
- The pool when going from album to album or moving the slider with an album open: its centre and radius jump in one frame and only its amount eases. The prototype does the same (`src/app.js` `apply()` assigns `S.pool` at once and animates only `S.amt.pool`), so the app was left as it is. One small difference remains: the app keeps the pool's smallest radius at 170 px on screen at the current zoom, the prototype fixes it in world units at the zoom the album opens with. They are equal at the default framing and differ only if the visitor zooms with an album open.
- Sonic and Mood beside an open album and at full zoom: the Sonic and Mood pairs are at Overview only.
- A real GPU: the pairs were taken with software WebGL, like the approved pictures. (The regression captures, on the GPU, are described in `app-regression-part1.md`.)
- Safari. The gas relies on `createImageBitmap` with `premultiplyAlpha: 'none'`. Playwright's WebKit is not installed on this machine and was not downloaded, so no WebKit pixel check was made. It is on the owner's list to look at the map in real Safari: if Safari multiplied the dust channel into the colour, the gas would look darker and dirtier along the dust lanes.
- A phone.
