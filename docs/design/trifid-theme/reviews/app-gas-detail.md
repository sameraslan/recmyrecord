# Gas fine detail (review item M1): experiment log and result

Date: 2026-10-05, 03:50 to 05:40 local time. Branch `trifid-build`. Before: commit `3dacd965`. After: commits `7fdca313` (bake, shader, loader) and the shader trim that follows it. Written by the implementer. **This is not a sign-off.** An independent reviewer should redo the comparison from the files named here.

The finding being answered is M1 of `app-fidelity-part1-independent.md`: large scale gas right, fine swirl missing at Overview, blur plus a blotchy mottle beside an open album, dark blue smudged, nothing captured at device pixel ratio 2.

## What shipped, in short

1. **A sharper image per stop, for desktops with a real GPU.** `gas-<stop>-sharp.webp` holds the stop at the prototype's resolution (1280 texels per raw unit, the density of the prototype's 4096 px bake). The map loads the usual image first, exactly as before, then fetches the sharper one for the stop the slider rests at once the map is idle, sends it to the GPU in 16 strips, each in its own quiet moment, swaps it in with one frame, and frees it when the slider comes to rest at another stop. Phones, tablets, software renderers, Home, About and 404 never fetch it.
2. **A better first image for everyone.** It is now the sharp bake scaled down (Lanczos), not a separate shading at 2048 px, it covers only the rectangle that holds the stop's gas, and it is encoded at WebP quality 93 where it was 84.
3. **No stand-in noise.** The shader adds noise octaves only past the resolution the bake was shaded for, as the prototype does. Before, it added them past the first image's own 640 texels per raw unit, which is what drew the mottle beside an album.

## Method

`app-gas-detail/capture-detail.mjs` extends `app-part1/capture-pairs.mjs`: same framing rule (the prototype is put where every album sits on the same screen px as in the app, worst offset 0.00 px in every capture; for Overview the app follows the prototype's own framing), 1600 x 1000 CSS px, Playwright's Chromium on software WebGL, at device pixel ratio 1 and 2. Gas-only pictures are kept lossless for measuring. The app's sharper image is forced on for these captures with `window.__rmrGasSharp = 'force'`, because the app does not load it on a software renderer by itself.

Band energy is the reviewer's measure: luma, albums masked (and the markers of an open album with a 60 px box), energy as the standard deviation between Gaussian blurs of sigma 0.7, 1.4, 2.8, 5.6 and 11.2 px. Bands are in px of the image, so at dpr 2 they are device px. Two figures per band:

- **ratio**: app over prototype, as in the review.
- **floor off**: the same with the noise floor removed from both sides as independent noise. The floor is what empty sky reads in that band (shader grain and dither). The prototype's is captured; the app's is computed from the shader's grain formula, because the app's camera cannot leave the cloud. At dpr 1 the two floors agree (0.67 and 0.68 in the finest band), which checks the computed one.

Check of the method against the review, on the old code at dpr 1: Overview 0.82 0.84 0.94 0.98 1.00 here, 0.81 0.86 0.94 1.00 1.02 in the review (which measured JPEGs). The review's 6 to 9 percent excess at 5.6 to 11.2 px beside an album does not show with this mask (1.00); the mottle is plain in the crops all the same.

Two cautions. The finest band beside an album is nearly all grain (energy 0.73 to 0.77 against a floor of 0.67), so its floor off figure is not reliable and is given in brackets. At dpr 2 the finest band of the app is its per device px grain, which the prototype stretches from CSS px, so the plain ratio there (about 2) says nothing about gas.

## Result: band numbers

App as a share of the prototype. Bands left to right: under 0.7, 0.7 to 1.4, 1.4 to 2.8, 2.8 to 5.6, 5.6 to 11.2 px. First line ratio, second line floor off. Full tables: `app-gas-detail/measurements/bands-before.md`, `bands-first.md`, `bands-sharp.md`.

### dpr 1

| State | Before | First image only (phones, tablets, software; a desktop's first second) | With the sharper image (desktops) |
|---|---|---|---|
| Overview, Balanced | 0.82 0.84 0.94 0.98 1.00 | 0.87 0.93 0.98 0.99 1.00 | 0.99 1.01 1.00 1.00 1.00 |
| floor off | 0.70 0.83 0.94 0.98 1.00 | 0.79 0.92 0.98 0.99 1.00 | 0.99 1.01 1.00 1.00 1.00 |
| Overview, Mood | 0.86 0.86 0.94 0.98 0.99 | 0.90 0.94 0.98 0.99 1.00 | 0.97 1.00 1.00 1.00 1.00 |
| floor off | 0.71 0.85 0.94 0.98 0.99 | 0.81 0.94 0.98 0.99 1.00 | 0.96 1.00 1.00 1.00 1.00 |
| Album, The Stone Roses | 0.90 0.85 0.90 0.96 1.00 | 0.89 0.83 0.92 0.98 1.00 | 0.95 0.98 1.00 1.00 1.00 |
| floor off | (0.51) 0.81 0.90 0.96 1.00 | (0.49) 0.78 0.92 0.98 1.00 | (0.81) 0.98 1.00 1.00 1.00 |
| Album, In Rainbows (bright cream) | 0.91 0.90 0.94 0.98 1.00 | 0.90 0.83 0.91 0.98 1.00 | 0.94 0.98 1.00 1.00 1.01 |
| floor off | (0.55) 0.87 0.94 0.98 1.00 | (0.48) 0.79 0.91 0.98 1.00 | (0.79) 0.98 1.00 1.00 1.01 |

### dpr 2 (bands in device px)

| State | Before | First image only | With the sharper image |
|---|---|---|---|
| Overview, Balanced | 1.88 0.97 0.91 0.97 0.99 | 1.91 1.05 1.01 1.01 1.00 | 2.07 1.35 1.16 1.05 1.01 |
| floor off | 0.90 0.92 0.92 0.97 0.99 | 1.06 1.03 1.02 1.01 1.00 | 1.80 1.40 1.17 1.06 1.01 |
| Overview, Mood | 1.98 1.00 0.92 0.97 0.99 | 2.00 1.08 1.02 1.01 1.00 | 2.10 1.33 1.15 1.05 1.02 |
| floor off | 0.89 0.94 0.93 0.97 0.99 | 1.06 1.05 1.03 1.02 1.00 | 1.79 1.39 1.17 1.06 1.02 |
| Album, The Stone Roses | 2.14 1.04 0.86 0.92 0.97 | 2.14 1.03 0.83 0.94 0.99 | 2.16 1.17 1.02 1.02 1.01 |
| floor off | (0) 0.85 0.89 0.92 0.97 | (0) 0.82 0.86 0.94 0.99 | (0) 1.20 1.07 1.02 1.01 |
| Album, In Rainbows | 2.14 1.07 0.91 0.96 0.99 | 2.14 1.04 0.84 0.93 0.98 | 2.16 1.16 1.02 1.02 1.01 |
| floor off | (0) 0.92 0.96 0.97 0.99 | (0) 0.83 0.87 0.94 0.98 | (0) 1.20 1.08 1.02 1.01 |

### Where this lands against the aim

The aim was the two finest bands within a few percent of the prototype and no excess at 6 to 11 px.

- **Desktop at dpr 1, with the sharper image: met at Overview** (0.99 and 1.01; Mood 0.97 and 1.00). **Beside an album the second band is met (0.98) and the finest reads 0.94 to 0.95**, in a band that is nearly all grain there. I have not found what the last 5 percent is (the encode at quality 95 and the different order of glow and resampling in the two renderers are the candidates). No excess at 5.6 to 11.2 px anywhere (1.00 to 1.01).
- **Desktop at dpr 2, with the sharper image: the app is sharper than the prototype**, by 17 percent at 1.4 to 2.8 device px and 35 to 40 percent at 0.7 to 1.4 at Overview. This is not added texture. The prototype draws its gas at CSS resolution and stretches it to the screen, so on a 2x screen it cannot show anything finer than two device px. The app draws the same bake at device resolution. Nothing at 5.6 to 11.2 px (1.01). Whether the owner wants the 2x screen to look like the stretched prototype or like the bake is a choice; see "Decisions for the owner".
- **First image only: better than before at Overview, not at the aim; beside an album as soft as before, without the mottle.** Overview at dpr 1 goes from 0.70 and 0.83 to 0.79 and 0.92 (floor off). Beside an album the second band reads 0.78 to 0.79 against 0.81 to 0.87 before: lower, because the blotches that were counted as detail before are gone; the third band rises from 0.90 to 0.92. This is what phones, tablets and software renderers keep, and what a desktop shows for about a second.

## What the eye sees

Crops are in `app-gas-detail/crops/`, five panels each: before, first image only, with the sharper image, prototype, approved JPEG (where one exists). One screen px is one square: dpr 1 crops are enlarged 2 times without smoothing, dpr 2 crops are shown one device px to one px. The app panels carry the album dots (they are drawn in the same canvas); the approved panel carries stars and lettering. The approved album picture is 0.5 percent wider and up to 10 px off, as `app-fidelity-part1.md` says.

| Crop | CSS px (dpr 1 file) | What I see |
|---|---|---|
| `overview-cream-d1.png` | 950,380 300 x 240 | Before: smooth surfaces, the swirl rings at lower right absent. Sharper: the rings and the thin parallel lines are there and sit where the prototype's sit; hairline dust filaments are continuous. First only: the rings are visible but soft |
| `overview-rust-d1.png` | 380,80 300 x 240 | Sharper: flow lines in the rust as in the prototype |
| `overview-blue-dust-d1.png` | 60,260 300 x 240 | Sharper: dust hairlines crisp, the pale wisps in the blue present. Before: fuzzy and broken |
| `overview-dark-d1.png` | 0,620 300 x 240 | Sharper: filaments in the dark blue; no flat patches or blocks that I can see |
| `mood-dark-blue-d1.png` | 60,400 300 x 240 | Before: smudged flat patches. Sharper: the dark filaments of the prototype. First only: filaments present, softer; no block structure |
| `album-swirl-d1.png` | 1280,560 280 x 240 | Before: blur covered in a cellular mottle. Sharper: concentric rings and striations as in the prototype and the approved picture, no mottle. First only: a clean blur with the larger rings, no mottle |
| `album-upper-d1.png`, `album-bright-d1.png` | 680,230 and 1150,200 | The same |
| the `-d2` files | smaller areas inside the above | Sharper: finer and crisper than the prototype's stretched picture. First only: about as sharp as the prototype at Overview, softer beside an album |

Full pictures: `app-gas-detail/pairs/` (JPEG quality 92): for the four states at dpr 1 the app's gas before, with the first image only and with the sharper image, the prototype's gas, and the full app screenshot; for Overview and the album at dpr 2 the app with each image and the prototype.

What I could not judge from stills is listed under "Not verified".

## Experiments

### 0. Baseline with the new measure
Old code, both pixel ratios. Numbers in the tables above. Old files: 2048 x 2048, 190, 188 and 141 KB (Sonic, Balanced, Mood).

### a. Tighter bake bounds
Measured the extent of non-zero gas in the old bakes: 1604 x 1544, 1560 x 1784 and 1264 x 1704 px of 2048. So the cloud fills about four fifths of the square, not half, and one rectangle per stop gains 9 to 22 percent in texels per raw unit at the same longer side (700, 729 and 778 against 640), less memory, not more. Kept, because the sharper image needs a rectangle per stop anyway to fit the memory budget. The rectangle is found by the build from a coarse bake, padded by 0.06 raw units, and the outer half of the padding is set to exact sky. Proxy result for resolution alone (lossless, resampled to the Overview framing, against a lossless 4096 px bake): whole square 2048 px 0.61 0.76 0.91; tight rectangle 0.64 0.79 0.92. A small gain by itself.

A lossy encode can leave one level of 255 in flat black (seen at quality 93: a green value of 1 at the image's bottom edge), so the build cannot promise an exactly black edge. The shader therefore fades the outer fiftieth of an image to sky, which lies inside the padding. `app-gas-detail/edge-check.mjs` measures the step in luma across the image's edges with the map zoomed all the way out: 0.23 to 0.38 levels at the west, east and south edges of the three stops, against 0.24 to 0.37 in plain sky beside them (grain); the north edge is under the header. Stretched pictures: `measurements/*-edge.png`.

### b. Encoding
Proxy (the image resampled to the Overview and album framings, bands against the lossless 4096 px bake, with a second figure over dark gas only). Balanced:

| Image | Size | Overview, three finest bands | Same, dark gas only |
|---|---|---|---|
| 2048 square, quality 84 (old) | 184 KB | 0.55 0.70 0.87 | 0.56 0.60 0.74 |
| 2048 square, lossless | | 0.61 0.76 0.91 | 0.66 0.76 0.90 |
| tight, quality 84 | 200 KB | 0.57 0.73 0.88 | 0.59 0.63 0.77 |
| tight, quality 90 | 239 KB | 0.63 0.77 0.91 | 0.66 0.75 0.87 |
| tight, quality 93 | 280 KB | 0.64 0.78 0.91 | 0.70 0.80 0.90 |
| tight, quality 95 | 313 KB | 0.65 0.79 0.92 | 0.73 0.82 0.93 |
| tight, quality 90 with sharp YUV | 242 KB | 0.63 0.77 0.91 | 0.67 0.75 0.87 |
| tight, quality 93, presets photo and picture | 273 KB | 0.64 0.78 0.92 | 0.70 0.81 0.91 |
| tight, quality 90 with smart deblock | 239 KB | 0.58 0.74 0.90 | 0.61 0.70 0.85 |
| tight, near lossless 60 | 1091 KB | 0.65 0.79 0.92 | 0.71 0.79 0.91 |
| sharp, quality 80 / 86 / 90 / 93 | 479 / 530 / 603 / 719 KB | 0.78 0.88 0.95 / 0.84 0.92 0.97 / 0.91 0.96 0.99 / 0.93 0.97 0.99 | 0.78 / 0.82 / 0.86 / 0.94 in the finest |
| sharp, quality 95 / 96 / 97 | 799 / 838 / 903 KB | 0.99 0.99 1.00 / 0.99 1.00 1.00 / 1.01 1.00 1.00 | 1.02 to 1.04 |

Findings: quality 84 cost about a tenth of the two finest bands overall and a quarter in dark gas (the smudge the reviewer saw). From 93 up the encode is no longer the limit; resolution is. Sharp YUV, the presets and near lossless bought nothing for their size; smart deblock lost detail. Chosen: 93 for the first image, 95 for the sharper one. Keeping the dust channel in a separate file was not tried: it is already stored lossless inside the WebP.

### c. Resolution
A whole 4096 px square with mips is 85 MiB, over the desktop budget next to the three first images. Shaded over the stop's rectangle at the prototype's 1280 texels per raw unit it is 3370 x 3242, 3299 x 3747 and 2698 x 3594 px: 56, 63 and 49 MiB with mips, and identical in content to the prototype's bake wherever there is gas. This is the sharper image. Real capture with it: the "With the sharper image" columns above.

Then the first image was changed from its own shading at 2048 px to the sharp bake scaled down. The bake shader drops a noise octave once its cells are under four texels, which is cautious; a Lanczos resample keeps what the smaller grid can carry. Proxy, lossless, Overview: own shading 0.64 0.79 0.92; Lanczos 3 from the sharp bake 0.68 0.86 0.95; Lanczos 2 and cubic 0.63 0.82 0.94; Mitchell 0.56 0.76 0.91. Lanczos 3 kept. It overshoots beside sharp dust lanes (dust came back denser than the bake's densest, 30 of 255 against 51), so the dust channel is clamped to the bake's own minimum, and colour and dust are resampled apart so dust is never multiplied into colour.

### d. The shader's fine octaves
The prototype adds octaves past its bake's 1280 texels per raw unit: none at Overview (1005 px per raw unit), a trace beside an album (1609). The app used the same formula with its own 640, so at Overview and beside an album it was adding two and three octaves of plain value noise to stand in for swirl the image could not hold. Both images now hold the octaves of the sharp bake, so the shader's test reads that resolution (`u_octPpr`) for both. Result: exactly the prototype's rule on every device; fewer texture reads per pixel at Overview (two fewer) and beside an album (one fewer), never more. Shaping the octaves along the flow was considered and not built: it needs the flow direction per pixel, which costs texture reads (ruled out) or screen space derivatives of a magnified texture (blocky), and with the sharper image there is nothing left for it to do.

### Loading the sharper image without a hitch
One upload of a whole image this size would hold the main thread for tens of ms (the site's 3072 px cover sheets take 12 to 41 ms each on this GPU). The image is sent in 16 strips instead. Measured with `app-gas-detail/sharp-measure.mjs` on the GPU (headless Chrome, Metal, Apple M1 Pro; mains; load 6 to 9), three loads per case at dpr 1 and 2; raw in `measurements/sharp-measure-d1.json` and `-d2.json`:

| Measure | dpr 1 | dpr 2 |
|---|---|---|
| From zooming in to the sharper image on screen, map at rest | 1001 to 1167 ms | 991 to 1099 ms |
| Main thread per strip: mean, and the longest of the 16 | 0.7 to 2.1 ms, longest 0.9 to 4.3 ms | 0.7 to 2.0 ms, longest 0.9 to 3.6 ms |
| Allocation, and mip build, on the main thread | 0 ms, 0 to 0.1 ms | 0 ms, 0 ms |
| Long tasks | none | none |
| Frames drawn from the start of loading to 800 ms after it is in | 1 | 1 |
| A drag started the moment the first strip went in: strips sent during the drag | 0 | 0 |
| That drag's worst frame gap, and a control drag afterwards | 19.0 to 20.7 ms, control 18.6 to 19.5 ms | 19.2 to 21.2 ms, control 18.2 to 22.2 ms |

So an interaction that begins during the upload waits at most for the strip in hand (4.3 ms at worst here) and the rest of the upload waits for the interaction to end.

## Sizes and memory

| | Before | After |
|---|---|---|
| First image (every map visit, before the nebula shows): Sonic, Balanced, Mood | 190, 188, 141 KB | 371, 327, 251 KB (a visit opens on Balanced: 327 KB) |
| Sharper image (desktops, at idle, one stop at a time) | none | 808, 819, 609 KB |
| `theme.json` | 53.9 KB | 54.1 KB |
| GPU memory, phones, tablets, software: three first images with mips | 64 MiB (67 MB) | 55 MiB (58 MB) |
| GPU memory, desktops: the above plus one sharper image | 64 MiB | 105 to 118 MiB (110 to 124 MB), 118 with Balanced's |
| Decoded copy in page memory | freed after upload | freed after upload (47 MiB for about a second while the strips go in) |
| Texture reads per pixel at a stop | 1 gas, 2 glow, 1 grain, plus 2 noise at Overview and 3 beside an album | 1 gas, 2 glow, 1 grain, plus 0 at Overview and 2 beside an album |

The size guards in `src/lib/data/theme.data.test.ts` now hold a first image under 400 KB and a sharper one under 1 MB (it was one guard of 1.5 MB on a 188 KB file), check the pixel sizes against `theme.json`, and check both memory totals.

## Registration

`app-gas-detail/registration.mjs`; output in `measurements/registration-sharp.txt` and `registration-first-screen.txt`. Since round 3 the check of the files runs in `npm test` (`src/lib/data/theme.data.test.ts`) and the map is checked on screen by a browser test (`e2e/gas.spec.ts`, "on screen the gas lies under the albums it was baked for": r 0.995 in place, 0.954 to 0.963 moved by 0.03 raw units, 0.66 and 0.74 mirrored).

- Files: gas luma under each of the 4,081 albums, mapped with the shader's own rule, against `theme.json`'s brightness under that album (from a separate render). Correlation 0.962 to 0.964 for both images of every stop; mirrored east to west 0.13 to 0.32, north to south 0.20 to 0.54, both 0.05 to 0.18; shifted by 0.01 raw units (10 px at Overview) 0.896 to 0.913 in each of the four directions. Mean luma under the albums 114.6 to 117.0.
- Screen: the app's gas against the prototype's at the same framing, correlation at shifts of minus 2 to 2 px. The peak is at no shift in all sixteen captures (0.998 to 0.9998).
- `albums.json`, `positions.json`, `recs.json` and `data-pipeline/` are untouched.

The bake is deterministic: two runs of `npm run theme` gave identical bytes for all seven files.

## Speed

Appended to `app-perf-part1.md` ("M1 follow-up"). In short: three ordinary runs of `npm run perf` on mains at load 8 to 14; two met every budget and one missed one (gpu phone zoom frame gap 53 ms against 50). Interleaved runs of the old and the new build on the same column do not show a difference (old 33 to 46 ms, median 35; new 32 to 43, median 37). Nebula visible is unchanged or a little earlier. Idle frames and idle long tasks 0 in every run.

## Decisions for the owner

1. **A 2x screen is now sharper than the prototype's own 2x picture.** I think that is the wanted outcome (the same bake, in focus). If the stretched look is wanted instead, half a mip level of bias at dpr 2 would give it at no cost.
2. **First image of 327 KB where it was 188 KB.** Quality 90 would be about 285 KB for a loss of about two parts in a hundred in the finest two bands.
3. **Phones and tablets keep the first image.** See below for what that leaves out and what it would cost.

## What detail is still missing

- **Devices on the first image only (phones, tablets, software renderers, desktops with small textures, little memory or data saving), and every desktop for about a second.** At the approved Overview framing on a 1600 px wide screen the image is magnified 1.4 times (it was 1.57): the thin lines are there but softer (0.79 and 0.92 in the two finest bands). Beside an album it is magnified 2.2 to 2.3 times and the 1 to 3 px striations are not there (0.78 and 0.92); what remains is a clean soft swirl with no mottle. Getting the rest on such a device means its GPU holding a sharper image: 49 to 63 MiB more, which breaks the phone budget. I have not captured the phone's own framing, where fewer CSS px cover each texel.
- **The finest band beside an album on desktop reads 0.94 to 0.95**, cause not found.
- Ideas not run: a mild pre-emphasis of the first image to offset the softening of magnification (risk of halos round dust lanes); AVIF for the sharper image (smaller, slower to decode, another codec to trust with a data channel); a sharper image at twice the prototype's density for 2x screens (over the memory budget).

## Not verified

- A real phone, Safari and Firefox. In particular the strip upload (WebGL2 `texSubImage2D` from an `ImageBitmap` with a row offset) has only run in Chromium.
- Fidelity on a real GPU: every fidelity capture is software WebGL with the sharper image forced on. On the GPU I measured timing and that the image arrives, not pixels.
- GPUs weaker than an M1 Pro: strip times there are not known.
- Motion: no shimmer check while zooming with the sharper image, and the moment of the swap has not been watched by a person.
- The map does not yet open at Overview. Opening there, every capable desktop visit will fetch the 819 KB image about a second after the map is interactive; today it is fetched only once the visitor zooms in about 1.9 times.
- The hover measurement (`baseline/hover-measure.mjs`) was not run again.
- Browser specs run: gas, map and explore on desktop and phone. The other specs were not run.

## How to reproduce

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch   # arm64
cd frontcreck
npm run theme && npm test && npm run build
D=../docs/design/trifid-theme/reviews/app-gas-detail
node $D/capture-detail.mjs --out /some/dir/first            # first image only, dpr 1 and 2
node $D/capture-detail.mjs --out /some/dir/sharp --sharp    # with the sharper image
node $D/registration.mjs /some/dir/sharp
node $D/edge-check.mjs /some/dir/edge
node $D/sharp-measure.mjs /some/dir/sharp-measure.json --loads 3   # GPU, mains
node $D/crops.mjs out.png 950,380,300,240 2 "before=a.png" "after=b.png"
```

## Round 3: the gas on a real GPU, with no override (2026-10-05)

Every picture above this section is software WebGL with the sharper image forced on. These are headless Google Chrome on Metal (`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)`), the launch of `npm run perf` and of `baseline/capture.mjs`, with nothing set by the capture: the app decides for itself. Script, pictures and numbers: `app-gas-detail/real-gpu/` (`capture-real-gpu.mjs`, `real-gpu.md`, `real-gpu.json`). The pictures are the builder's own captures and reading, not a sign-off.

**Does an ordinary desktop get the sharper image by itself?** Yes. The gate was told: fine pointer, 0 touch points, 16 GB (Chrome's report), textures up to 16384 px, the renderer above. At the app's opening framing the flag reads `waiting` (the first image is not magnified there). At Overview and beside an album it fetched one sharper image (Balanced; Sonic after the slider moved) and the flag named the stop, in all five desktop captures and in all thirty loads of `perf-part1/scripts/fade-measure.mjs`. A phone profile (390 x 844, dpr 3, touch) says `off` from the start and fetched none.

| State | Sharper image | Bands, app over prototype (under 0.7, to 1.4, to 2.8, to 5.6, to 11.2 device px) |
|---|---|---|
| Overview, dpr 1 | balanced | 1.00 1.02 1.00 1.00 1.00 |
| Overview, dpr 2 | balanced | 2.10 1.43 1.19 1.06 1.02 |
| Beside The Stone Roses, dpr 1 | balanced | 0.95 0.99 1.00 1.00 1.00 |
| Beside The Stone Roses, dpr 2 | balanced | 2.06 1.19 1.06 1.03 1.01 |
| Overview on Sonic, dpr 1 | sonic | 0.98 1.00 1.00 1.00 1.01 |
| Phone, opening framing, dpr 3 | off | 1.05 1.29 1.11 1.05 1.01 |
| Phone, The Stone Roses in map mode, dpr 3 | off | 1.10 1.23 1.13 1.07 1.02 |

Framing residual 0 px in every state. The bands are the measure of the tables above, without the sky floor taken off, so the finest band holds grain on both sides.

**What I see, desktop.** At dpr 1 the app and the prototype are the same picture at Overview, beside The Stone Roses and on Sonic: the same flow lines, the same hairline dust, the same tone. I cannot tell them apart except by the album dots. The numbers agree with the software captures (0.99 to 1.02 where those read 0.99 to 1.01; the 0.95 in the finest band beside an album is the band the second look called grain). At dpr 2 the app is crisper than the prototype's own 2x picture, as on software (the prototype draws at CSS resolution and is stretched): `overview-d2-crop.png` and `album-d2-crop.png` show the same lines, thinner. Nothing in these looks different from the software captures, so the GPU adds no new finding.

**What I see, phone.** At the opening framing the whole cloud is drawn smaller than the image, and the app's picture is the prototype's with slightly finer dust (the prototype is stretched three times from CSS px). In map mode with The Stone Roses open (the state of `options/final-phone-map.jpg`; 1403 px per world unit, so about 772 CSS px and 2315 device px per raw unit against the first image's 700 texels) the first image is magnified about 3.3 times in device px. Plainly: at the phone's own pixel grid it is soft. Single device px carry no detail, the hairline dust is two to three device px wide, and the finest flow lines of the approved picture are faint. It is not softer than the prototype on the same screen (the bands read 1.10 to 1.23, the app a little ahead, because the prototype is softer still at dpr 3), and in CSS px it holds about 0.9 texels per px, so it is close to what `final-phone-map.jpg` shows at its own 390 px width: the same swirl rings, dust lanes and tone, with the thinnest striations weaker. What a phone does not get is the extra sharpness its screen could show. Whether that is enough is the owner's call on a real phone; a headless capture at dpr 3 is not a hand held screen. A sharper image for phones would cost 47 to 63 MB of GPU memory against a budget of 58 for all three first images, which is why it is not there.

**Not seen here.** Motion and the fade by eye (frame counts and gaps are measured, `perf-part1/round3/fade-measure.txt`), Safari, Firefox, a real phone, a weak GPU.
