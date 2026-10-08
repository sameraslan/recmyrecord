# Trifid prototype: honesty and aesthetics review

Independent review of `prototype/` against `prototype/UX.md`, `HANDOFF.md`, `regions/colour.md`, `regions/regions.json`, `scaling/name_table.json` and the chosen mockups. Code was read, not trusted. Numbers come from scripts run on `shots/map-whole.jpg` and `shots/map-overview.jpg` (1600 x 1000, baked gas, software WebGL). No prototype file was edited. No extra screenshots were taken. Three DOM dumps were run (`#/map`, `idle=1`, `check=1`).

## Headline

- The data encoding is mostly honest. Colour at empty edges is gone. Dust never sits on dense ground. Nothing moves at idle. Names and evidence numbers match the data.
- Three honesty problems remain. Brightness is only loosely tied to density inside the cloud. Label scrims darken populated gas by 34 to 47% and look like dust or voids. Star size encodes chart rank and nobody tells the visitor.
- There is a boundary box. At Whole map the smoke ends in a straight-sided square about 970 px wide. The owner said no box.
- The picture is worse than the mockup. It is flat. Highlights are 40% dimmer, structure is one third, dust is almost absent. It reads as coloured fog, not as a nebula photograph.

## Part 1. Honesty

### 1a. Claim by claim

| # | Claim | Verdict | Where | Why |
|---|---|---|---|---|
| 1 | Every star is an album at its real position | TRUE | `stars.js:18-20, 45`; `data.js:52-56` | Predicted positions land on stars within 1 px in both shots. 78% of predicted positions at Overview are brighter than 0.5 luminance. |
| 2 | Gas brightness is album density only | PARTLY | `gas.js:110-115, 139` | Density sets the envelope. Noise then multiplies it by 0.32 to 2.24. See numbers below. |
| 3 | Gas colour is the five-family blend; neutral where no family leads | PARTLY | `gas.js:91-99, 117-123` | 12 of 17 region centres match. Gold comes out orange-brown, Sombre Void grey-violet, Aggressive Rift magenta. |
| 4 | Dust only where albums are few | TRUE | `gas.js:125-130` | Gate is `1 - smoothstep(.05, .3, fine density)`. 0% of dust-dark pixels are on above-median density. |
| 5 | Far field is neutral and dark | TRUE for colour, FALSE for "runs to every edge" | `gas.js:113-114, 122, 155` | Chroma 2 to 4 of 255 beyond 0.10 raw units. But the smoke is cut by a square. |
| 6 | Region names come from data with evidence, none invented | TRUE, with three caveats | `regions.js:12-18`; `copy.js:61-64`; `data.js:99`; `build_data.py:91-107` | Numbers match. Names match the table. Caveats in 1c. |
| 7 | Nothing decorative reads as data | PARTLY | `labels.js:47-54, 111-115`; `trifid.css:9-10`; `stars.js:21-27`; `gas.js:173`; `overlay.js:25` | Scrims, star magnitude, the square, cover placeholder boxes. |
| 8 | Nothing moves at idle | TRUE | `app.js:163-187` | `idle=1` reports 2 frames at 3 s and still 2 at 8 s. CSS has two one-shot entrance animations only. |

Round-two defects:

| Defect | Verdict | Evidence |
|---|---|---|
| Saturated colour at empty edges | FIXED | Share of far-field pixels with chroma over 30: 0.000. |
| Black dust over populated areas | FIXED in the gas, BACK through label scrims | Gas: 0%. Scrims: see below. |
| Teal-tinted line casing | FIXED | `overlay.js:10`: casing `rgba(6,6,10,.8)`, lines white. |
| Off-screen regions without pointers | PARTLY | Pointers exist (`labels.js:121-150`). `config.js:47` caps them at 4; UX.md says 6. At Overview The Quiet Deep and Improv Arm (both strong, both off screen) get none. |
| Covers hiding their own line | FIXED | `check=1`: 80 layouts, 0 findings. |

#### Brightness: how much is noise

Code. `L = smoke*(1-.8*near)*(.5+b) + near*.95*(.32+1.92*b*b)` with `b` the noise in 0..1 (`gas.js:115`). Tone `Y = .42*(1-exp(-.9*I^1.6))` (`gas.js:139`).

| Case | Luminance Y |
|---|---|
| Full density, noise b = 0 / 0.3 / 0.5 / 0.7 / 1 | 0.053 / 0.098 / 0.185 / 0.294 / 0.399 |
| Half density, b = 0.3 / 0.5 / 0.7 | 0.035 / 0.073 / 0.137 |
| Brightest possible smoke with no albums | 0.040 |

- Noise alone swings luminance 7.5 times at fixed density in theory, 3 times across the usual b range of 0.3 to 0.7.
- A fold in the densest ground (0.098) is darker than a vein over half-density ground (0.137). So noise can swap the order of two populated areas whose density differs by a factor of two.
- Noise cannot make empty sky look populated. Smoke tops out at 0.040. Measured: far-field p95 is 0.038, densest-quintile p05 is 0.097.
- `near = smoothstep(.02, 1.6, pop)` saturates early. Median album sits at near = 0.82. 36% of albums sit above 0.9. So the upper third of the density range has almost no brightness left to use, and noise fills the gap.
- The zoom band strength and the focus pool also scale brightness (declared in UX.md).
- A constant smoke term of 0.03 exists everywhere inside a square, albums or not (`gas.js:113`).

#### Colour where density is near zero

`c = mix(NEU, c, smoothstep(.02, .4, dB*.65 + dH*.4))` (`gas.js:122`). Replicated on the CPU for all three stops:

| Distance from nearest album (raw units) | Colour gate mean / max | Model luminance mean / max |
|---|---|---|
| 0.05 to 0.10 | 0.47 / 1.00 | 0.018 / 0.066 |
| 0.10 to 0.15 | 0.12 / 0.55 | 0.009 / 0.026 |
| 0.15 to 0.25 | 0.01 / 0.20 | 0.005 / 0.017 |
| over 0.25 | 0.00 | under 0.008 |

Colour does reach a little past the last album, but the gas there is too dim for it to show. Fine. The additive base `vec3(.02,.018,.03)` (`gas.js:144`) is faintly blue-violet. It is invisible at that level.

#### Dust

- Gate uses the fine density (sigma 0.016 raw), normalised by the 85th percentile at album positions (`gas.js:42, 129`). That is local album density. TRUE.
- Share of albums on ground where any dust is possible (dF under 0.30): 10.6% balanced, 7.6% sonic, 8.1% mood. Where a lane keeps half its strength or more (dF under 0.175): 1.9%, 1.0%, 1.9%. Where a full lane is possible: 0.0%.
- Maximum darkening is not 75% as UX.md says. The 0.25 factor is applied before the power-1.6 tone curve. Live path: luminance falls to 12 to 21% of its value (79 to 88% darkening). Baked path: `pow(A, .5)` in sRGB gives 78%. The two paths disagree.
- Over populated ground the worst realistic case is a half-strength lane: about 50% darkening, for under 2% of albums.

#### Stars

- Size and alpha come from four classes by album index (`data.js:67`, `stars.js:15-27`). Real data: 40 / 360 / 1,357 / 2,324 stars in classes 0 to 3. Class 0 and 1 also get a halo. This is chart rank. UX.md declares it. The UI does not. The colour sentence and About say nothing about star size. A visitor will read big haloed stars as something. Undeclared to the reader.
- Tail: the 257 albums from index 3,824 on get class 2 (radius 1.4, alpha 0.85). That is brighter than the 2,324 ranked albums in class 3 (radius 1.1, alpha 0.72). Unranked albums look more important than ranks 1,501 to 3,824. UX.md calls class 2 "the median class". It is not; the median album is class 3.
- 10k synthetic: different rule. Copies of top-400 albums get class 2, never 0 or 1. Tail sources (627 points) get class 3, not 2. Counts 40 / 360 / 3,174 / 6,426. Inconsistent with the real rule.
- Star tint is 25% of the leading family colour (`stars.js:49-50`). Declared, consistent with the gas.
- Dimming: stars fade as covers fade in (replaced, fine). 45% beside an album (declared). 25% outside a hovered region (declared; barely visible in `map-label-hover.jpg`). At Whole map class 3 radius drops under 0.8 px and alpha is scaled by 0.79 (`stars.js:22`). Nothing is hidden outright by the star pass.
- Stars and covers under a label scrim are dimmed by the scrim, because the scrim is a DOM layer above the canvas. UX.md says "Stars are not hidden under labels". In `album-teal.jpg` the covers under LONELY DRIFT (700-1100, 520-640) and PASTORAL NEBULA (1250-1600, 540-650) are nearly black. That hides data.

#### Label scrims

`trifid.css:9-10`: radial gradient, alpha 1 at the centre, 0.68 at half radius. `labels.js:111-115`: opacity up to 0.8, size `2.5w+130` by `3h+130`. Measured at Overview (DOM dump plus image):

| Label | Scrim size px | Opacity | Gas luminance core / ring | Ratio |
|---|---|---|---|---|
| Playful Way | 395 x 206 | 0.42 | 0.107 / 0.202 | 0.53 |
| Warm Halo | 354 x 203 | 0.26 | 0.085 / 0.154 | 0.55 |
| Progressive Spiral | 525 x 204 | 0.26 | 0.095 / 0.165 | 0.57 |
| Eclectic Cloud | 353 x 166 | 0.32 | 0.135 / 0.229 | 0.59 |
| Ethereal Veil | 421 x 204 | 0.37 | 0.101 / 0.168 | 0.60 |
| Urban Cluster | 450 x 206 | 0.37 | 0.060 / 0.095 | 0.63 |
| The Bittersweet Reach | 468 x 167 | 0.42 | 0.120 / 0.180 | 0.66 |
| Sombre Void | 381 x 203 | 0.05 | 0.079 / 0.083 | 0.95 |

A scrim removes 34 to 47% of the gas luminance over an ellipse 350 to 525 px wide. A half-strength dust lane removes about 50%. So at Overview seven named regions carry a dark patch at their centre that is as strong as dust and far larger. It sits on the most populated part of each region. In album view the opacity goes higher and the patches are black (`album-teal.jpg`). In `stress-overview.jpg` PROGRESSIVE SPIRAL sits on a dark red slab (350-620, 370-420). This brings back round-two defect 2 by another route.

#### Other decoration

- Glow pass (`gas.js:173`): adds 14% of a blurred copy. Spreads light about 16 to 32 px. Harmless.
- Luminance cap: UX.md says 0.30 so a white star holds 3:1. `config.js:37` sets 0.42 and the glow adds to it. Measured gas p99 at Overview: 0.404. White on that is 2.3:1. The spec is not met.
- Edge pointers: small text chips with arrows. Read as chrome. Fine.
- Chip and list dots (`regions.js:38`): the region's blended colour. Playful Way is orange and Aggressive Rift is mauve (`phone-search-sheet.jpg`). Neither colour is in the five-word sentence. Mauve sits next to Urban Cluster's violet. This is the "known risk" in `colour.md`, now real.
- Far-field smoke: neutral, driven by the two widest density blurs plus a constant. Reads as sky. Fine apart from the square.
- Home ghost names: low contrast, not interactive, positioned at true centroids. They collide with the hero text and read as a rendering fault more than as data (Part 2).
- Band C: faint square outlines at star positions in `gas-baked-band-c.jpg` and `gas-live-band-c.jpg` (for example 400,95; 760,380; 1500,270). These are half-faded covers or the `#262019` placeholder of `overlay.js:25` with their keyline. They look like markers on some albums and not others.

### 1b. Measurements

Registration: camera computed from `camera.js` (`fitWhole`, `fitOverview`). Whole: centre (0.1568, -0.1330), 686.2 px per world unit, 397.7 px per raw unit. Overview: centre (0.0333, 0), 1827.9 px per world unit. Best star-luminance offset is (-1, 0) px and (-1, -1) px. Error about 1 px. Stars and lettering were removed with a 9 px median filter. Chrome rectangles were masked.

Gas luminance against album density (Gaussian kernel, sigma in raw units):

| Shot | Sigma | Pearson | Spearman | Pearson, gas blurred to the same sigma |
|---|---|---|---|---|
| Whole | 0.016 | 0.71 | 0.58 | 0.71 |
| Whole | 0.05 | 0.82 | 0.77 | 0.84 |
| Whole | 0.14 | 0.84 | 0.90 | 0.94 |
| Overview | 0.016 | 0.56 | 0.68 | 0.56 |
| Overview | 0.05 | 0.70 | 0.76 | 0.75 |
| Overview | 0.14 | 0.74 | 0.79 | 0.86 |

Luminance spread at fixed density (pixels above the 40th percentile of density, sigma 0.05, five equal bins):

| Density bin | Whole p05 / p50 / p95 | Ratio | Overview p05 / p50 / p95 | Ratio |
|---|---|---|---|---|
| 1 (sparsest) | 0.003 / 0.011 / 0.024 | 8.6 | 0.072 / 0.149 / 0.305 | 4.2 |
| 2 | 0.005 / 0.020 / 0.045 | 8.6 | 0.080 / 0.172 / 0.333 | 4.2 |
| 3 | 0.016 / 0.049 / 0.108 | 6.9 | 0.110 / 0.192 / 0.342 | 3.1 |
| 4 | 0.039 / 0.089 / 0.232 | 6.0 | 0.112 / 0.207 / 0.381 | 3.4 |
| 5 (densest) | 0.056 / 0.119 / 0.332 | 5.9 | 0.097 / 0.202 / 0.406 | 4.2 |

- At Whole map density reads well: medians rise 11 times from bin 1 to bin 5. Only 2.1% of densest-bin pixels are darker than the middle bin's median.
- At Overview density barely reads. Medians rise 1.36 times across the bins while noise spreads each bin 3 to 4 times. 45.6% of densest-bin pixels are darker than the middle bin's median. 38.6% of bin-2 pixels are brighter than the densest bin's median. Overview is the default view. Inside the cloud, brightness there is mostly texture.

Hue at region centroids (disc of 0.04 raw units, brighter half of the pixels):

| Region | Expected (`colour.md`) | Whole map rgb, hue, sat | Name | Match | Overview |
|---|---|---|---|---|---|
| The Live Belt | rose, clear | 126 61 73, 349, 0.51 | rose | yes | off screen |
| Urban Cluster | violet, clear | 130 81 146, 285, 0.44 | violet | yes | violet, yes |
| Improv Arm | teal, clear | 58 101 92, 168, 0.43 | teal | yes | off screen |
| The Quiet Deep | teal, clear | 39 107 119, 189, 0.67 | teal | yes | off screen |
| Pastoral Nebula | teal, clear | 87 163 134, 157, 0.47 | teal | yes | off screen |
| Lonely Drift | teal, clear | 46 102 94, 171, 0.55 | teal | yes | off screen |
| The Bittersweet Reach | gold, clear | 188 141 73, 36, 0.61 | gold | yes | gold, yes |
| Warm Halo | gold, clear | 153 104 74, 23, 0.52 | orange-brown | NO | orange-brown, NO |
| Playful Way | gold, mixed | 129 84 62, 19, 0.52 | orange-brown | NO | orange-brown, NO |
| Eclectic Cloud | mixed or neutral | 151 98 92, 6, 0.39 | muted rose | acceptable | muted rose |
| Progressive Spiral | neutral | 80 76 76, sat 0.05 | neutral | yes | neutral, yes |
| Ethereal Veil | pale, mixed | 84 81 79, sat 0.05 | neutral | yes | neutral, yes |
| Aggressive Rift | rose, clear | 122 78 114, 311, 0.36 | magenta-mauve | NO | off screen |
| Raw Flare | rose, clear | 219 82 108, 349, 0.63 | rose | yes | off screen |
| Epic Expanse | rose, clear | 193 85 120, 341, 0.56 | rose | yes | rose, yes |
| Sombre Void | blue, mixed | 79 67 85, 282, 0.21 | grey-violet | NO | grey-violet, NO |
| Hypnotic Orbit | blue | 80 115 205, 223, 0.61 | blue | yes | off screen |

13 of 17 acceptable. The four misses are all predictable from `colour.md`: Warm Halo has 0.29 urban, Playful Way 0.39 fierce, Aggressive Rift 0.41 dark, Sombre Void 0.20 fierce and 0.21 warm. The blend is honest arithmetic. The sentence on screen names five colours, and the map shows orange, mauve and grey-violet as well. The tone curve makes it worse for gold: at luminance under about 0.2 gold is brown.

Far field (distance from the nearest album):

| Shot | Distance | Pixels | Mean luminance | p95 luminance | Mean chroma (0..255) | p95 chroma | Mean rgb |
|---|---|---|---|---|---|---|---|
| Whole | over 0.10 raw | 1,029,077 | 0.0055 | 0.018 | 2.6 | 5 | 14 14 16 |
| Whole | over 0.25 raw | 846,235 | 0.0037 | 0.011 | 2.4 | 5 | 11 11 13 |
| Whole | over 0.40 raw | 659,434 | 0.0027 | 0.008 | 2.3 | 5 | 8 8 10 |
| Overview | over 0.10 raw | 146,652 | 0.0245 | 0.038 | 4.2 | 9 | 45 42 45 |
| Overview | over 0.15 raw | 83,994 | 0.0206 | 0.028 | 3.3 | 5 | 41 38 41 |
| Overview | over 0.25 raw | 7,549 | 0.0158 | 0.018 | 3.0 | 3 | 35 33 36 |

Neutral and dark. For comparison, pixels within 0.03 raw of an album have mean chroma 61 (Whole) and 76 (Overview). UX.md asks for far-field smoke at 3 to 6% luminance. Measured 1.6 to 2.5% at Overview and 0.3 to 0.6% at Whole. It is darker than specified, which is why the cloud reads as an island at Whole map.

Dust on dense ground. Dust-dark pixel: luminance under 0.55 of its 14 px surround, surround over 0.03.

| Shot | Dust-dark pixels | Share of lit pixels | Share on above-median fine density | Albums within 6 px |
|---|---|---|---|---|
| Whole | 20 | 0.01% | 0.000 | 0 of 4,081 |
| Overview | 337 | 0.03% | 0.000 | 0 of 2,661 |

The claim holds. It holds mainly because there is almost no dust at all.

### 1c. Region evidence and names

Five evidence sentences against `regions/regions.json`:

| Region | Sentence shown | regions.json | Match |
|---|---|---|---|
| Playful Way | 61% tagged playful, against 21% | 0.607, 0.212 | yes |
| Warm Halo | 74% tagged warm, against 23% | 0.736, 0.229 | yes |
| Urban Cluster | 89% tagged urban, against 15% | 0.892, 0.146 | yes |
| Sombre Void | 76% tagged sombre, against 14% | 0.764, 0.140 | yes |
| Aggressive Rift | 97% tagged aggressive, against 14% | 0.967, 0.143 | yes |

Caveats:

1. The Bittersweet Reach says 56% against 22%. True. But `max_other_region` is 0.575: another region is more bittersweet than the one named for it. Hypnotic Orbit: 39% here, 41% in another region. The sentence hides this. Both are "fair" regions.
2. The two audio sentences use superlatives: "than anywhere else on the map" and "the quietest corner of the map" (`copy.js:62-63`). The data behind them is one z-score each (liveness +3.17, loudness -2.06). Probably true, not shown.
3. Carried ids do not keep their meaning across stops. Sonic: id `pastoral` shows THE BITTERSWEET REACH, id `warm` shows DANCEABLE, id `epic` shows HEAVY, id `hypnotic` shows ATMOSPHERIC. Mood: id `improv` shows ACOUSTIC, id `playful` shows ENERGETIC, id `epic` shows ANTHEMIC. `labels.js:72` moves one label between stops when the id is shared. So during the slider morph "Pastoral Nebula" travels and turns into "The Bittersweet Reach" while Balanced's own Bittersweet Reach fades out. UX.md section 8 says regions that hold keep their id and name. Here the id holds and the name does not. Deep links (`?region=warm`) also land on a different place per stop. Inferred from code and data; not seen in motion.

Names against `scaling/name_table.json`:

- Sonic (14 regions) and Mood (26 regions): every region that shows a place name has the table's name for its word. No flags. Regions without a table entry show the data word (HEAVY, ATMOSPHERIC, LUSH, QUIRKY, LONGING, MELLOW, SOOTHING and so on) or the audio word (DANCEABLE).
- Level-0 areas `area-urban`, `area-bittersweet`, `area-improvisation` have table words but show the plain word. Correct: the place name belongs to the level-1 region.
- Balanced hand-made: `live` and `quiet` carry word `liveness` and `loudness` without the sign the table uses (`liveness+`, `loudness-`). Names are right. Key mismatch only.
- 10k synthetic sets: no flags.
- A data word and an approved place name are set in the same capitals. A reader cannot tell HEAVY from RAW FLARE as kinds of name. That is the spec, but note it.

### 1d. Boundary box

There is one. `gas.js:114` fades the smoke with `max(abs(x), abs(y))`, a square in raw space. `gas.js:155` then blends the baked square into empty sky at its border.

Measured in `map-whole.jpg` (mean grey level, 0..255, rows 250 to 750):

| x | 250-306 | 314 | 322 | 338 | 354 | 370 | 394 | ... | 1180 | 1212 | 1244 | 1268 | 1284-1324 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| level | 6.67 flat | 6.9 | 8.0 | 11.5 | 16.1 | 22.5 | 34.2 | | 22.6 | 16.9 | 10.9 | 7.7 | 6.67 flat |

- Left edge starts at x = 314, right edge ends at x = 1284. That is raw -1.22 and +1.22, exactly the shader constant.
- The half-level crossing of the left edge stays within x 366 to 397 over 780 px of height. Right edge: x 1211 to 1234. Straight vertical lines.
- Bottom edge: level falls from 25.9 at y 900 to 6.6 at y 988. The top edge is behind the header (level 16.5 at y 66, cut).
- Outside the square the page is perfectly flat at 6.67. No smoke, no grain.
- A x6 contrast stretch shows a clean rounded square. On a good display at normal brightness the left and right edges are faintly visible as given.
- The same square is behind Home (`home-a.jpg`, `home-b.jpg`) and the 10k whole view (`stress-whole.jpg`).

At Overview the square is outside the frame, so the default view is clean.

## Part 2. Aesthetics

### Mockup against prototype, measured

Map area only, stars median-filtered out.

| Image | Mean lum | Median lum | p95 lum | p99 lum | Mean chroma | Structure at 25 px | Fine detail at 4 px | Dust-like area |
|---|---|---|---|---|---|---|---|---|
| Mockup overview | 0.146 | 0.072 | 0.559 | 0.843 | 44 | 0.437 | 0.128 | 2.35% |
| Prototype overview, baked | 0.146 | 0.133 | 0.338 | 0.404 | 62 | 0.159 | 0.045 | 0.90% |
| Prototype overview, live | 0.146 | 0.133 | 0.338 | 0.404 | 62 | 0.160 | 0.046 | 0.91% |
| Mockup album | 0.126 | 0.098 | 0.323 | 0.565 | 35 | 0.572 | 0.220 | 6.39% |
| Prototype album-5 | 0.086 | 0.076 | 0.141 | 0.333 | 45 | 0.570 | 0.210 | 0.94% |

Same mean brightness as the mockup. Twice the median. Highlights 40% lower at p95 and half at p99. Structure about one third. Dust under half. More saturated. In plain words: everything is the same mid tone. No bright cores, no deep folds.

### Scores

| Aspect | Score | Why, with locations |
|---|---|---|
| Beauty | 6.5 | Pleasant colour wash. No focal point. The gold block (940-1200, 300-620) is a flat mustard slab with soft square corners. Mockup was a 9. |
| Colourfulness | 8 | More saturated than the mockup. Rose (380-660, 80-400) and violet (1330-1600, 80-260) are vivid. Gold is brown-orange at Warm Halo (1220-1400, 380-520). |
| Likeness to a nebula photograph | 4.5 | Marbled fog. No filaments, no bright rims, no depth. Dust is a few hairline squiggles (250-290, 290; 1280-1320, 600-640; 1370-1420, 330). The mockup had ink-like lanes and glowing cores. |
| Continuity | 8 at Overview, 3 at Whole map | Overview: no edge in frame; left and right fade to grey smoke. Whole: an island with a measurable square around it. |
| Lettering | 6.5 | Letterspaced capitals kept, no italics anywhere on the map. Good. Fair labels at 500 weight are thin and stars cut through them (ECLECTIC CLOUD 700-860, 408; THE BITTERSWEET REACH 930-1180, 681). Pointers are tiny (AGGRESSIVE RIFT, RAW FLARE, THE LIVE BELT along y 83). Band C labels at 35% are speckled and weak (`zoom-c.jpg`: PROGRESSIVE SPIRAL 310-620, 808). |
| Legibility of covers and lines | 7.5 | White cased lines hold everywhere in `album-5.jpg`. In the covers band (`album-gold-covers.jpg`, `album-teal.jpg`) lines thread between dimmed covers and are easy to lose (line to 3 at 1140-1150, 590-710). Covers 6, 10, 9 in `album-10-hot.jpg` (938-1100, 855-905) are packed 5 px apart. |
| Calmness of the album view | 8 sparse, 5 in the covers band | `album-5.jpg` is calm. `album-teal.jpg` has two black blobs and 60%-dimmed covers that look like mud. |
| Chrome, Trifid | 7.5 | Cool near-black panels sit well. The PROTOTYPE tab is fine. |
| Chrome, Site | 7 | Works. Amber knob and Spotify button are the only warm accents and they compete with the gold gas (`chrome-site-album.jpg` 170-330, 220-258). The brown panel next to a rose and violet sky is a weaker match than the cool one. |
| Home A | 5 | Nebula is a small island on black. Ghost names collide with the hero: THE LIVE BELT above the headline (625-790, 139), URBAN CLUSTER cut by "you like." (930-1080, 278), ETHEREAL VEIL under "Explore the map" (600-760, 531), THE QUIET DEEP under the shelf caption (443-640, 748). |
| Home B | 5.5 | Same backdrop. IMPROV ARM ghost shows through the region cards (600-760, 815-840). Cards themselves are clean. |
| Phone | 6 | Region sheet and search sheet are good. `phone-map-mode.jpg`: stars are large soft blobs, like bokeh, and swamp the gas. `phone-home.jpg`: RAW FLARE and CLUSTER ghosts sit behind the subtitle and search field. |
| 10k stress | 6 | Overview is fine and labels hold. Whole: stars bury the gas and the labels; IMPROVISATION (515-740, 756) is unreadable. Covers view is fine. |

### Where the prototype is worse than the mockup, and what to change

1. **No luminous cores.** `near` saturates at the median album and the cap is flat. Fix in `gas.js:111-115`: replace `near=sm(.02,1.6,pop)` with a curve that keeps rising, for example `near=pop/(pop+.9)`, and add a core term driven by fine density, `+ .45*sm(.7,1.9,dF)`, with the cap allowed to reach about 0.55 only there. This gives bright hearts where albums cluster. It is more honest, not less, because the brightest gas would then be the densest ground. Stars over those cores need the dark keyline or a hold-back.
2. **Low-frequency noise carries too much.** The first two octaves of `fbmG` make 100 to 300 px blobs that compete with density. Fix in `gas.js:115`: change `(.32+1.92*b*b)` to about `(.6+.9*b*b)` for the base octaves, and move the lost contrast into fine ridged detail (`1-abs(2*fbm-1)` at 4 to 8 times the frequency, amplitude about 0.25). Texture stays, the density reading improves. Target: Spearman at Overview, sigma 0.05, above 0.85.
3. **Dust is nearly gone.** The lane thresholds are very tight. Fix in `gas.js:127-128`: `sm(.9,.96,rd)` to `sm(.82,.94,rd)`, `sm(.93,.975,rd2)` to `sm(.88,.96,rd2)`, gate `sm(.5,.66,...)` to `sm(.4,.6,...)`. Keep the `dF` gate exactly as it is. Lanes will then fill the true gaps between clusters, which is where real dust would be. Also make the two paths agree: apply `A` after the tone curve in the live path, or use `pow(A,1.6)`-equivalent in the bake.
4. **Gold reads as brown.** At luminance under 0.2, hue 35 is brown. Fix: give warm a floor. In the tone step (`gas.js:139-141`) lift `Y` by up to 30% in proportion to the warm share, or move the warm hue toward yellow (`config.js:40`, 246 172 60 to about 250 190 70). And colour by the leading family, using the second weight only for saturation, as `colour.md` suggests. That also fixes the mauve Aggressive Rift and keeps the map inside its five named colours.
5. **Soft at Overview.** The bake is 2048 px over 2.5 raw units, 819 px per unit. Overview needs 1,059 px per unit at 1x and twice that on a retina screen. So the default path is magnified 1.3 to 2.6 times. `gas-baked-band-c.jpg` against `gas-live-band-c.jpg` shows it: baked is grain on blur, live has thin filaments. Fix: bake to the data bounds, not a square of half 1.25 (`gas.js:11`), at 4096 on the long side; or ship the live shader where the GPU allows and keep the bake as fallback.
6. **Scrims.** Replace the ellipse with a tight text halo. `trifid.css:9-10`: cut the gradient to the text box plus 16 px. `labels.js:111`: cap opacity at 0.2 and drop the `* 1.05`. Get the rest of the contrast from the text shadow, a 1 px dark stroke, and a hold-back of stars under the glyph box only. In album view remove scrims; drop the label if it cannot reach contrast.
7. **The box.** `gas.js:114`: delete the `max(abs(x),abs(y))` fade. Let the smoke depend on `dV` and `dFar` only, which already fall off with distance from the data, plus a small constant floor (about 0.02) that continues to infinity. `gas.js:155`: beyond the bake return the same floor with the same grain, not empty sky. Then raise the far smoke to the 3 to 6% UX.md asks for so the Whole map is not an island.

### Rendering bugs

- Square boundary of the smoke (above).
- Faint square outlines at star positions in band C (`gas-baked-band-c.jpg`: 400,95; 760,380; 1500,270; many more). Half-faded covers or placeholders. `overlay.js:25, 99-106`: do not draw a cover or its keyline until its atlas sheet has loaded, and start the keyline later than the image.
- Covers show through the header and the album panel as ghosts (`album-gold-covers.jpg`: 450,45; 560,490; `zoom-d.jpg`: 610,45; 940,50). `overlay.js:102` culls at the header edge but not at the panel inset. Clip the cover pass to the visible map rectangle.
- Pointer and legend collide: LONELY DRIFT pointer starts where the colour sentence ends (775-930, 981) in `map-overview.jpg` and `zoom-b.jpg`. THE QUIET DEEP pointer (230-365, 921) sits 6 px above the hint line. Widen the hint blocker in `app.js:214` by 20 px.
- Home ghost names overlap hero text (locations above). Hide the label layer on Home or keep only names that clear the hero box.
- THE BITTERSWEET REACH is pressed against the bottom edge in `album-10-hot.jpg` (1150-1400, 975).
- Phone star size: blobs with halos at 390 px wide. `stars.js:22-24` scales by the desktop Overview rule; cap radius at about 1.8 px on narrow screens.
- No banding or texture blockiness seen. The 384 grid is smooth at these zooms. No seams. Text is crisp at 1x.

## Ranked findings

### Blockers

1. **Boundary box at Whole map, Home and 10k whole.** Square smoke, edges at raw +-1.22, straight to within +-15 px. Fix: `gas.js:114` and `:155` as in item 7 above.
2. **Label scrims read as dust and dim the data.** 34 to 47% darkening over 350 to 525 px at Overview; black blobs over covers in album view. Fix: item 6 above.

### Major

3. **Brightness does not track density at Overview.** Medians rise 1.36 times across density bins; noise spreads 3 to 4 times; 46% of the densest pixels are darker than the mid-density median. Fix: items 1 and 2 above.
4. **Flat picture, no luminous cores, almost no dust.** p95 luminance 0.34 against 0.56; structure 0.16 against 0.44; dust 0.9% against 2.35%. Fix: items 1, 2, 3.
5. **Star magnitude is an undeclared encoding, and inconsistent.** Chart rank with halos, unexplained; unranked tail drawn brighter than ranks 1,501 to 3,824; a different rule at 10k. Fix: either say it in one clause of the hint ("brighter stars are better known") and put the tail in class 3, or draw all stars one size. `data.js:67`.
6. **Gold is orange-brown; off-legend colours appear.** Warm Halo and Playful Way hue 18 to 23; Aggressive Rift mauve; Sombre Void grey-violet. Fix: item 4.
7. **Baked gas is under-resolved at Overview.** Fix: item 5.
8. **Shared ids change names across stops.** Fix: in `scaling/carry_forward.py` give a region a new id when its name word changes; or in `labels.js:72` travel a label only when `display` is equal in both sets.
9. **Home backdrop.** Island plus colliding ghost names. Fix: frame Home at Overview, not Whole; drop the ghost names or mask them under the hero.

### Minor

10. Luminance cap 0.42 against the 0.30 in UX.md; white on brightest gas is 2.3:1. `config.js:37`. Either meet the spec or change it with the core term in mind.
11. Dust strength differs: live 79 to 88%, baked 78%, spec 75%. `gas.js:138, 163`.
12. Pointer cap is 4, spec says 6; The Quiet Deep and Improv Arm get no pointer at Overview. `config.js:47`.
13. Evidence sentences for fair regions hide that another region scores higher (bittersweet, hypnotic). Add "also common in ..." or pick the next word.
14. Superlative audio sentences rest on one z-score. Soften to "far more ... than the rest of the map".
15. Band C cover outlines; ghost covers through header and panel; pointer and legend collision; phone star size (see rendering bugs).
16. Site chrome: amber accents compete with gold gas. Use paper for the knob on the map card only.
17. Covers 6, 10, 9 packed in the ten-up layout. Raise `MARKER.gap` to 14 when more than 7 are shown.

## The five changes worth most

1. Remove the square: smoke from the wide density fields plus a floor that never ends; same floor beyond the bake.
2. Give brightness back to density: unsaturated `near`, a fine-density core term up to about 0.55, less low-frequency noise, more fine ridged detail.
3. Replace elliptical scrims with a tight text halo and a star hold-back; none in album view.
4. Bring dust back in the true gaps: wider lane thresholds, same density gate, one strength for both paths.
5. Fix the colours the sentence promises: leading-family hue with the second weight as saturation, a luminance floor or a yellower hue for warm, and a bake at data bounds and 4096 so the result is sharp.

## Not verified

- Retina (2x) rendering and a real GPU. All shots are 1x SwiftShader.
- Safari.
- Anything in motion: the slider morph, label travel, the focus pool, hover dimming. Finding 8 is from code and data.
- Scrim opacities in album view were not dumped; judged from `album-teal.jpg`.
- Pixel registration was done for Balanced only. Sonic and Mood were checked through the replicated density fields and by eye.
- The noise function was not ported. Its range is taken from the formula and from measured spread.
- The dust-dark detector is a proxy (local luminance ratio). It could miss wide, soft lanes.
- JPEG compression shifts chroma slightly; hue names near a boundary (gold against orange) carry a few degrees of error.
- Whether the "anywhere else" claims in the two audio sentences are literally true.
