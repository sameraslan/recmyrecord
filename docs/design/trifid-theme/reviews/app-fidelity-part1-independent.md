# Part 1 gas: independent fidelity review

> Note (2026-10-07): the pictures (`.jpg`, `.png`) under `app-part1/` were pruned before merge. They remain in git history at commit `03f1386c`. The documents, scripts and measurement files are still in place.

Date: 2026-10-05. Reviewer did not build part 1. Read-only: the files in `app-part1/`, the approved pictures in `options/`, the baseline shots, the builder's two notes, the baked files `frontcreck/public/data/theme/gas-*.webp` and the bake and shader sources. No browser, build or server was run. Crops and measurements were made with Pillow and numpy from the saved JPEGs (quality 90, dpr 1, software WebGL), so every number here carries JPEG noise on both sides.

## Verdict

**Matches with listed differences that should be fixed now.**

At large scale the app's gas is the approved gas: shape, position, hue of every region, brightness, saturation, the dust lanes, the outer edge and the deep zoom remnant all agree, and I confirm the builder's patch numbers by eye. At small scale it is not the approved gas. The fine swirl lines (the thin, silky striations that make the approved pictures look like flowing gas) are largely missing at Overview and almost entirely missing beside an open album, where they are replaced by blur plus a blotchy noise mottle. The builder's "12 to 17 percent less fine detail" is a true number for one metric and understates what the eye sees. Home does not match `final-home.jpg`.

## Ranked findings

### Must fix before part 2

**M1. The fine swirl is lost; beside an open album the gas has a different character.**
- Evidence, Overview (`overview-app-gas.jpg` against `overview-prototype-gas.jpg`, crops at 3x): cream centre (950,380 to 1250,620), rust (380,80 to 680,320), blue with dust (60,260 to 360,500). In the prototype every surface carries thin parallel flow lines 1 to 3 px wide and dust filaments are crisp hairlines. In the app the flow lines are mostly gone, surfaces are smooth plastic, and hairline dust filaments are fuzzy and broken.
- Evidence, open album (`album-app-gas.jpg` against `album-prototype-gas.jpg`, 1280,560 to 1560,800 and 680,230 to 960,470; `album-bright-*` 1150,200 to 1430,440): the prototype shows concentric swirl rings and striations; the app shows a blurred shape covered in a cellular, slightly grid-aligned mottle about 6 to 10 px across. Against `final-album.jpg` at the same place the difference is the same. This is the worst state.
- Evidence, dark gas (`overview-app-gas.jpg` 0,620 to 300,860 contrast-stretched; `overview-mood-app-gas.jpg` 60,400 to 360,640): the dark blue is smudged into flat patches with faint block structure; the prototype has clear fine filaments there.
- Numbers (luma, albums masked, band-pass by Gaussian sigma; app as a share of prototype):

| State | under 0.7 px | 0.7 to 1.4 | 1.4 to 2.8 | 2.8 to 5.6 | 5.6 to 11.2 |
|---|---|---|---|---|---|
| Overview | 0.81 | 0.86 | 0.94 | 1.00 | 1.02 |
| Overview Mood | 0.82 | 0.86 | 0.94 | 1.00 | 1.02 |
| Overview Sonic | 0.83 | 0.88 | 0.95 | 1.00 | 1.03 |
| Album (Stone Roses) | 0.88 | 0.87 | 0.91 | 1.01 | 1.06 |
| Album (In Rainbows) | 0.90 | 0.90 | 0.94 | 1.03 | 1.09 |
| Whole map | 0.94 | 0.96 | 0.98 | 1.01 | 1.03 |

  The sky floor is 0.26 in the finest band on both sides, so with the floor removed the finest band at Overview is about 20% down. Beside an album the app has 6 to 9% MORE energy at 6 to 11 px than the prototype: that is the mottle, energy the approved look does not have. The builder's single 9 px box metric adds the loss and the gain together, which is why it reads small.
- Cause, two separate things:
  1. Resolution. `theme.json` gives `bakeHalf` 1.6 raw units, so the 2048 px bake holds 640 texels per raw unit, about 1164 per world unit. At the approved Overview framing (1828 px per world unit) one texel covers 1.57 CSS px; beside an album (2926) it covers 2.5 CSS px. The prototype's 4096 bake is at 0.79 and 1.26. So the approved pictures were never magnified at Overview; the app always is.
  2. Compression. `build-theme.mjs` writes WebP at quality 84: 188 KB for 2048 x 2048 (141 KB for Mood), about 0.36 bits per pixel. Decoded and viewed 1:1, the bake itself already lacks the striations and shows smeared flat patches and block structure in dark gas (crop of `gas-balanced.webp` at 448,384, 192 px). A clean 2048 render would still carry 1 to 2 texel lines; this file does not. The cover atlases next to it are 2.2 MB each, so the gas is not where bytes are being saved.
  3. The mottle is the shader's "fine octaves past the bake's resolution" (`gas.ts`, the `vn` value-noise loop). It is isotropic value noise on an axis-aligned lattice multiplied into the colour, so it reads as blotches and faint grid lines, not as flow.
- Fix, in order of cost: (a) bake at a much higher WebP quality or near-lossless and look again; (b) bake 4096, or 4096 for the lit centre only; (c) reduce the amplitude of the added octaves or replace them with something that follows the flow (noise stretched along the bake's gradient direction), and never let them be the main texture a viewer sees. (a) alone will not restore Overview to the approved sharpness because of the 1.57x magnification; (b) is what the approved pictures were made with.
- Would the owner notice: at Overview side by side with `final-overview.jpg`, yes, as "softer, less silky". Beside an album, yes without a side by side: it looks grainy and out of focus.

### Should fix

**S1. Home is far from `final-home.jpg`.** Full screenshots, lower centre swirl (600,520 to 1000,720): approved mean luma 96.4, 95th percentile 194.5; app 46.8 and 78.8. Blue arm (380,330 to 500,600): saturation 0.45 approved, 0.16 app. Sky: rgb 6,6,8 approved, 13,13,13 app. Gas alone: app 78.0 against prototype 108.7 in the swirl (95th percentile 163 against 219). The approved picture is the prototype render exactly (96.4 against 96.3), so the prototype is the closer one by definition, and the app reads as a dim brown smudge where the approved picture has a glowing blue and cream core under the search box. Two causes stack: the 0.6 constant (about 28% of the light) and the old brown veil and grain (part 3). Also, the approved veil is not uniform: it takes the rust at the top to 0.6 of the bare gas but leaves the lower core at 0.89. A uniform strength of 0.6 cannot give that shape. Fix: set `GAS_DIMMED_STRENGTH` to 1 and let part 3's veil do the dimming, matched against `final-home.jpg`; or have the owner approve a new Home picture.

**S2. `/map` opens at the Whole-map framing, not at the approved Overview.** 686 against 1828 px per world unit. The first view is a small cloud in a lot of black (`whole-app.jpg`), not the full-bleed `final-overview.jpg`. Builder flagged it as framing; I rank it higher because it is the first impression and because part 2's region-name bands depend on the opening zoom. Needs a decision before names are placed.

**S3. Lines, hint text and marks vanish on bright gas (for part 2 and 3 to fix, but they are broken today in the shipped look of part 1).**
- Neighbour lines beside an open album: nearly invisible in `album-app.jpg` and `album-bright-app.jpg` (thin grey at low alpha on cream). The approved picture has 2 px white lines with a dark edge.
- Hint line at the bottom of the map: unreadable over gas in both album shots.
- Hover ring on a dot: hard to find on cream (`hover-map-album-crop` pair). Warm dots on cream and rust: low contrast at Overview; the dots also read as clutter over the gas, most of all the 45% alpha dots beside an open album and on the phone overview, where they cover most of the lit gas (`phone-map-overview` pair).
- Cross-fade tiles at about 23 px on bright gas (`bright-covers-fade-23px.jpg`): weak, tinted blobs with no readable art. The same tiles on dim gas are fine.
- Half-alpha covers round a pick (`bright-selected-32px.jpg`, `retina-selected-dense-crop` pair): washed grey; recognisable, clearly worse than on the old pane.
- Full covers at 32 px and over, the picked cover and its frame, the hover square on a cover, badges: fine.

### Notes for the owner

- **N1. Film grain and warm sky.** I confirm the builder: +4 levels in empty sky (10.1,10.1,12.1 against 6.1,6.1,8.1), about +2 in bright gas (124.8 against 122.7 in a cream patch), +3.3 at deep zoom. It also turns the blue-black sky a neutral grey-brown. It explains part of "paler and flatter" beside an album, not all of it: the 45% dots and M1 are the rest. The builder's write-up credits grain, dots and lines only.
- **N2. Deep zoom matches.** Panel C of `q-deep.jpg`, the app and the prototype read the same tone (rgb 36,32,31) and under a hard contrast stretch show the same broad shapes with no banding or blotches. The app's full shot is about 3 levels lighter (grain).
- **N3. Sonic and Mood** are the same quality as Balanced: same shape, hue and brightness as the prototype, same softness (M1), no hard edges, nothing thin or off centre. Mood's large dark areas show the compression smudge most.
- **N4. Artifacts.** No visible quad edge, seam, colour fringe or banding in the outer falloff (Whole map stretched to 0 to 40). The only artifacts are those in M1.
- **N5. The canvas starts under the 64 px header** in the app; in the approved pictures gas runs behind a see-through header (`q-header.jpg`). Part 3 will need the canvas to extend under it.
- **N6. Outer edge at Whole map**: under a stretch the prototype's faint outer halo carries a little more filament structure; not visible at normal levels.

## Answers to the nine questions, briefly

1. Gas against approved: large-scale look equal in every state; fine detail and swirl not equal (M1). Softness is visible at Overview and obvious beside an album.
2. Dim around an album: depth and pool equal by measurement and by eye at large scale; the map still looks flatter because of M1, the dots and the grain. The 4-level grain figure is right for dark areas and about 2 in bright ones.
3. Deep zoom: as faint, as smooth, same tone (N2).
4. Home: very different; the prototype is the approved picture (S1).
5. Sonic and Mood: same as Balanced (N3).
6. Artifacts: compression smudge and noise mottle only (M1, N4).
7. Covers and marks: weak states listed in S3.
8. Regression: in the 18 saved pairs I see no change outside the map pane. I could not check the builder's pixel comparison of the other 168 pairs: the re-captured shots are not saved in the repo, and the saved pairs are half-size composites.
9. Builder's write-up: the measurements I could repeat hold. What is wrong or missing: "the same at a normal viewing distance" is not true beside an album; the single detail metric hides the added mottle; the loss was not split between resolution and compression (both contribute, shown above); the texel-per-pixel magnification is not stated; Home's difference is described as a third less light when the screenshot a visitor sees is half as bright with 40% of the highlights; the non-uniform Home veil is not mentioned; no pair was taken at dpr 2.

## What stills cannot tell

- Motion: pan, zoom, the slider morph, the pool easing, the fade into deep zoom, any shimmer of the added noise or of mip levels while zooming.
- Device pixel ratio 2. Every fidelity pair is dpr 1. On a Retina screen each bake texel covers about 3 device px at Overview and 5 beside an album; I expect the softness to look the same in angular terms as in these crops and nothing to look sharper than them, but I have not seen it.
- A real GPU for fidelity (the pairs are software WebGL; only the regression pairs are GPU), a real phone, and Safari (the builder's `premultiplyAlpha` risk along dust lanes is unchecked).

## Second look, after the M1 fix

Date: 2026-10-05, commits `7fdca313`, `7d4e2fbe`, `161d530b`. Same rules: read-only, no browser. Looked at `app-gas-detail.md`, the pictures in `app-gas-detail/pairs/` (JPEG quality 92; the lossless captures the builder measured are not in the repo), the builder's edge picture, the six baked files in `frontcreck/public/data/theme/`, and the loader and shader for the rules. My own crops: first image, sharper image and prototype side by side at the regions of the first look, at 3x for dpr 1 and 1:1 for dpr 2.

### Verdict for M1

**Fixed on desktop with a stated shortfall on first image devices.** With one condition that stills cannot settle: nobody has yet seen the sharper image arrive on a real GPU, and every fidelity capture forced it on.

### 1. With the sharper image

- Flow lines, hairline dust and swirl rings are there, in the prototype's places, at the prototype's crispness. Overview cream (950,380), rust (380,80), blue with dust (60,260); beside The Stone Roses (1300,560 and 700,230); beside In Rainbows (1170,200). I cannot tell the app from the prototype in these crops except by the dots.
- The mottle is gone, in the sharper and in the first image.
- The dark blue smudge on Mood is gone (60,400, stretched): the dark filaments match the prototype's.
- New artifacts: none seen. No halos or ringing beside dust lanes, no sharpened look, no blocks in the sharp bake viewed 1:1. Edge of the baked rectangle: the outer border of all three first images and of Balanced's sharp one is black to within 1 level of 255 (mean 0.00 to 0.11), gas first appears about 4% in, and the builder's stretched edge picture shows no step. I did not have a new Whole-map capture of my own to stretch.
- The handover: first and sharper image agree in tone (mean rgb differs by 0.2 levels in every state; largest local change over a 4 px area 5.6 to 7.4 levels, all of it detail arriving). So the swap is a snap into focus, not a change of brightness or colour. It happens in one frame about a second after the map settles. Whether that reads as a pleasant sharpening or as a pop is for a person watching it; a cross-fade of 150 to 250 ms would hide it if it reads as a pop.

### 2. With the first image only

- Against the prototype at the same desktop framing: a clean, soft swirl. At Overview the larger rings and most dust hairlines are there, the 1 px flow lines are faint. Beside an album the shapes and the larger rings are there and the fine striations are not. No mottle, no smudge, no blocks. Better than before the fix at Overview; beside an album about as soft as before but clean, which is a real improvement in character.
- Against the approved pictures: at Overview I think a viewer without the approved picture beside it would not object. Beside an album at the desktop's zoom it is a visible shortfall against `final-album.jpg`: out of focus rather than wrong.
- As the phone's look: acceptable, with a note for the owner. What I can say: the tone, shape and cleanliness are right, and at the framing a phone opens with (the whole cloud in 390 CSS px) the image is drawn smaller than its own resolution, so nothing is lost there. What I cannot say: how it looks at dpr 3 once a phone user pinches in to album scale. No phone-framed capture exists, and `final-phone-map.jpg` shows crisp striations at about that scale. A software rendered desktop keeps this look permanently at desktop zoom; that is the case where the shortfall is plainest.

### 3. dpr 2

The app with the sharper image is crisper than the prototype's own 2x picture (overview 2000,860 600 px and album 2700,1200 600 px, device px). It looks like the same picture in better focus: the same lines, thinner; dust edges cleaner. It does not look busier, noisier or sharpened, and the large forms and tones are unchanged. **Recommend: leave sharp.** The approved pictures were made at dpr 1, where their lines are 1 px; the sharp 2x render is closer to those than the prototype's stretched 2x is. With the first image only, dpr 2 at Overview is level with the prototype and beside an album softer (0.88 at 1.4 to 2.8 device px).

### 4. Band energies, my masks, on the new pairs

App as a share of the prototype; same bands as the first look (dpr 2 in device px, right half of the frame).

| State | Before | First image | Sharper image |
|---|---|---|---|
| Overview, dpr 1 | 0.81 0.86 0.94 1.00 1.02 | 0.85 0.93 0.98 1.01 1.02 | 1.02 1.01 1.00 1.01 1.02 |
| Overview Mood, dpr 1 | 0.82 0.86 0.94 1.00 1.02 | 0.87 0.94 0.99 1.01 1.03 | 1.00 1.00 1.00 1.02 1.03 |
| Album, The Stone Roses, dpr 1 | 0.87 0.87 0.91 1.01 1.07 | 0.85 0.84 0.93 1.03 1.06 | 0.99 0.99 1.00 1.04 1.07 |
| Album, In Rainbows, dpr 1 | 0.89 0.90 0.94 1.03 1.09 | 0.86 0.84 0.92 1.03 1.08 | 0.99 1.00 1.00 1.05 1.08 |
| Overview, dpr 2 | | 1.15 1.03 1.02 1.01 1.02 | 1.48 1.33 1.15 1.05 1.02 |
| Album, dpr 2 | | 1.10 0.95 0.88 0.96 1.03 | 1.17 1.11 1.04 1.02 1.04 |

The builder's numbers hold: mine agree within 0.03 in every band that is not dominated by grain.

**A correction to my first look.** The 6 to 9% excess at 5.6 to 11.2 px beside an album is still there by my measure (1.07, 1.08) now that the mottle is visibly gone. So it was never the mottle. It is my mask: the 45% alpha dots beside an open album fall under my difference threshold and are counted as gas. The builder's wider mask reads 1.00 and is the better measure. The mottle was real (it is plain in the old crops and gone in the new) but that number was not evidence for it.

### 5. The 0.94 to 0.95 in the finest band beside an album

I cannot see anything missing there, and by my measure the band reads 0.99 to 1.00. That band beside an album is almost all grain (the builder says so), so a few percent either way is the grain and the encoder, not gas. Not worth chasing.

### 6. The builder's log

Accurate and candid where I could check it. What is missing or should be said more plainly:

- **The sharper image is only fetched once the visitor has zoomed in about 1.9 times, and the map opens at the Whole-map framing.** The log mentions this under "Not verified". Its consequence belongs in the result: a desktop visitor who opens `/map` and zooms sees the first image, then a snap, on every stop change and every return.
- **All "sharper" pictures are software WebGL with the image forced on.** On a real GPU only timing and arrival were measured. Whether a real desktop is classed as capable (the test in `gasSharpBlocked`), and what the picture looks like there, is unseen.
- **Only one sharper image is held.** After a slider move the new stop shows its first image for about a second; the log says so in the mechanism but not as something the owner will see.
- **No Sonic capture** and no phone-framed capture.
- The first image grew from 188 to 327 KB on every map visit; stated, and I think it is the right trade.

### Remaining, ranked

- **Must fix before part 2:** nothing in M1.
- **Should fix:** (a) have a person watch the swap on a real GPU at dpr 2, at Overview and beside an album, after a zoom and after a slider move, and add a short cross-fade if it reads as a pop; (b) confirm on real hardware that an ordinary desktop does get the sharper image without the override; (c) capture a phone-framed pair at dpr 3 pinched in to album scale, to settle whether the first image is enough there.
- **Note for the owner:** phones, tablets and software rendered desktops keep the soft look; it is clean and right in tone, and short of `final-album.jpg` in fine detail when zoomed in. A 2x desktop is now crisper than the prototype's 2x picture; I recommend leaving it. S1, S2 and S3 of the first look are untouched by this fix and still stand.
