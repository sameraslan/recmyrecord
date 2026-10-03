# Trifid prototype: UX design and build spec

This is the design for the interactive prototypes in this folder and the reasoning behind it. It describes what the prototype does, not what the app does today. Nothing in `frontcreck/` is changed. All wording is placeholder until the owner approves it (list in `COPY.md`).

The current app is the reference for behaviour. Where this document is silent, do what the app does (see "App behaviour to reproduce" at the end).

## 1. Principles

1. **Every mark is data or it is chrome.** Stars are albums. Gas brightness is how many albums are near. Gas colour is the five-family blend of the albums near. Dust is where albums are few. Nothing else is drawn on the map.
2. **The map is the place, the panel is the album.** On the map the only accent is starlight white, because every hue is taken by a family. The per-album accent colour lives in the panel only.
3. **Names are claims.** A region name shows its evidence on demand, changes with the similarity slider, and is absent where the data does not support one.
4. **Still at rest.** No twinkle, drift or pulse. Render on demand only.
5. **The gas yields to the album.** The closer you get to albums and the more is selected, the quieter the gas becomes.

## 2. Coordinates and zoom

- World units as in the app: `world = (raw - balancedMedian) * scale`, scale chosen so balanced's 5th..95th percentile half-extent is 0.55; the same transform for all three stops. y up. Region centres and hulls are stored raw and need the same transform.
- `ppw` = CSS px per world unit. App constants kept: `COVER_WORLD = 0.0068` (cover px = `min(64, COVER_WORLD * ppw)`), dot to cover cross-fade `smoothstep(16, 32, coverPx)`, max zoom `ppw = stageHeight * 28 / 1.1`.
- Two named framings:
  - **Whole map**: the app's fit (everything visible, padding top 55, right 40, bottom 115, left 40). Minimum zoom is 0.8 of this. Empty sky at the sides is fine.
  - **Overview** (the default landing view of the map, and what the fit button returns to): cropped to fill the width. Fit the 1st..99th percentile x-extent of the current stop to the visible width with 24 px side padding, vertically centred on the median y. Regions above and below run off screen and get edge pointers. Pressing the fit button a second time while at Overview goes to Whole map.
- Zoom bands, by `coverPx` so they scale with density (at 10,000 albums `COVER_WORLD` shrinks with the nearest-neighbour gap, and the bands move with it):

| Band | coverPx | Gas | Dust | Stars | Map labels |
|---|---|---|---|---|---|
| A whole map | under 6 | 100% | yes | points, 4 magnitude classes | level-0 areas if present, else top-priority regions |
| B overview | 6 to 13 | 100% | yes | points | all regions that fit (priority order), edge pointers |
| C approach | 13 to 22 | falls to 60% | fades out | grow, start to become covers at 16 | none (a label is shown at full strength or not at all); "you are here" chip appears |
| D covers | over 22 | falls to 30% at 32 px and stays | none | covers | no map labels; chip only |

- Label size is fixed per tier in px and grows gently with zoom: `size = base * clamp((ppw / ppwOverview) ^ 0.3, 0.85, 1.35)`.

## 3. The gas (defect fixes 1 and 2)

Inputs per stop, computed once from positions and per-album family weights (`album_weights`, not the balanced-smoothed variant, so the same recipe works on every stop): density grids at several blur widths and six weight grids (five families plus neutral).

- **Brightness** follows album density. No per-region normalisation. Noise shapes the filaments but only within a factor of 2 (measured rank correlation between gas brightness and album density: 0.96), so a dense area is always brighter than a sparse one. Normalise by a percentile of the density so the densest core does not burn out; the same rule must hold at 10,000 points.
- **Cores glow, stars still read.** Dense cores may reach about 0.5 relative luminance. Every star carries a soft dark under-disc, invisible on dark sky, which keeps it at 3:1 against its surround on the brightest gas. (The first build capped the gas at 0.30 instead; reviewers measured it as flat and a third as structured as the chosen mockup.)
- **Colour**: the family hues are mixed in a perceptual colour space (OKLab) by sharpened local shares, so neighbouring families grade into each other and mixed ground comes out pale. Rose against blue is the one guarded pair: the stronger takes the hue and a tie goes dusky, because a free blend gives a mauve close to the urban violet. Saturation falls with the neutral share and when no family leads. Hues: rose, gold, teal, blue, violet as in the mockup, adjusted so the five also differ in luminance and stay apart under protanopia and deuteranopia (measured minimum distance 15 to 27 CIE76 depending on density). Colour is never the only carrier: wherever a family is shown, its word is written too.
- **Neutral far field (fix 1).** Saturation is multiplied by a near-density term, so colour exists only where albums are. Beyond the cloud the gas is dim neutral smoke (luminance about 1 to 3%) that thins with distance from the albums and never ends at a straight edge. No saturated colour where there are no albums.
- **Dust is absence (fix 2).** Dust lanes are multiplied by `1 - smoothstep(fine density)`: a lane can only darken ground where few albums are, and it breaks wherever stars are. Maximum darkening 75%. Dust is therefore true: dark means few albums.
- **Zoom**: noise is anchored in world space. Two finer octaves fade in with zoom so the gas keeps texture; overall strength follows the band table.
- **Focus pool**: when an album is open, gas everywhere drops to 60% and a soft pool around the focus group drops to 25% and half saturation (400 ms).
- **Slider**: the three stops' field textures are mixed by the same piecewise `sliderT` the positions use.
- Rendering: WebGL2 fragment shader over field textures, drawn only when the camera or state changes. By default the same shader is rendered once per stop into a 4096 px texture over the data bounds and only that texture is drawn each frame (the path that would ship). `gas=live` runs the shader every frame, for comparison.

## 4. Stars

- One point per album, additive, near-white with 25% of the album's leading family colour.
- Magnitude: four classes by album index (first 40, to 400, to 1,500, the rest); indexes from 3,824 on are treated as the median class because the tail is not chart rank. Sizes about 2.6, 1.9, 1.4, 1.1 px radius at Overview, scaling with the app's dot rule as you zoom. Soft halo on the first two classes. Diffraction spikes on none: they read as ornament.
- Hit target: `max(14 px, drawn size / 2)`, 24 px for touch, as in the app. Hover priority as in the app.
- Cross-fade to covers at 16 to 32 px as in the app. Covers get a 1 px dark keyline so they hold on bright gas.

## 5. Region labels

- Lettering: Cormorant Garamond 600, capitals, letter-spacing .17em. Strong regions 17 to 24 px by size (`n`). Fair regions the same capitals at 500 weight, 13 to 15 px, 75% opacity. No italics anywhere in map lettering.
- Under a strong region's name at Overview: the plain words in sans 12.5 px ("raw · angry").
- A region with no approved place name shows only its data word in the same capitals (for example `ACOUSTIC`), never an invented name.
- Colour: the region's family blend lightened 70% toward white.
- **Contrast**: each label has a tight dark halo around its letters (an outline stroke plus one soft shadow), strong enough for 4.5:1 against the gas behind it. No plate and no wide scrim: reviewers measured the first build's elliptical scrims darkening the gas by 34 to 47%, which reads as dust. Stars are not hidden under labels.
- **Density rule**: labels are placed in priority order (strong before fair, then size, then evidence margin). A label is dropped when its box would overlap a higher-priority label, chrome, a focus cover or a focus line. Budget: at most one label per 160 x 90 px of free map, hard cap 14 on desktop and 6 on phone. With a hierarchy (level 0 broad areas, level 1 regions) band A shows level 0 only and band B shows level 1 with level 0 names as a faint large watermark or not at all.
- **Hover or focus** a label (desktop): the name turns white with a hairline under it, the evidence sentence appears below it followed by the family tag (for example "Gold · warm"), stars outside the region dim by 25%. No hull outline is drawn.
- **Names can be turned off** with `L` (remembered).
- **Click or tap** a label: fly to the region (fit its hull with padding) and open the region card.
- **Keyboard**: labels are buttons in the tab order; Enter does the same as click. A screen-reader-only list of regions sits in the map landmark.
- **Edge pointers (fix 4)**: in bands A and B, a strong region whose label is off screen gets a small chip pinned to the nearest edge with an arrow and its name, for example `↑ THE LIVE BELT`. At most 4 (3 on phone), nearest first, in the same haloed lettering at a smaller size. Click flies there. Hidden in album view.
- **You are here chip**: in bands C and D, a small chip at the top centre of the visible map names the region under the centre of the view, or shows nothing when the centre is in unnamed ground. Click opens the region card without moving the camera.

## 6. Regions as navigation

- **Region card** (same slot as the Explore card: bottom left on desktop, bottom sheet on phone). Contents: name in map lettering; family tag and plain words; the evidence sentence; "Best known here" row of 6 covers (one click opens the album); "Show more" for a scrollable list of up to 24 albums by title and artist, which is also the path for people who cannot use the map; "Next to" neighbours as links forming one loop per stop; copy link; close.
- **Search stays an album search.** Albums always come first and Enter always opens an album when one matches. A region appears below the albums only when the query matches a whole word of its name. An empty field shows nothing. (The first build listed regions first; two reviewers found that typing "raw" or "live" and pressing Enter landed on a region instead of Raw Power or Live at Leeds.)
- **Regions menu**: a quiet "Regions" button under the similarity card lists the current stop's regions with their family and plain words. This is the browse path.
- **Album panel**: a line under the artist: `IN PLAYFUL WAY` (link, small capitals, with a family-colour dot). For the fifth of albums in no region: `Between Playful Way and Warm Halo` (the two nearest regions) so no album is forced into a name. Click opens the region card on the map while the album stays open.
- **Explore card** (album picked on the map without opening it): adds the same region line.
- **Deep link**: `#/map?region=<id>` lands on a region with its card open. Home offers regions as starting points (section 9).

## 7. Album view on the map (fixes 3 and 5)

- Focus markers as in the app: seed 64 px, visible recs 46 px, hot rec x1.16, numbered badges on recs, 5 shown by default and 10 after "Show more".
- **Lines (fix 3)**: white `rgba(255,255,255,.92)` 1.5 px over a dark casing `rgba(6,6,10,.8)` 4.5 px. Hot line pure white 2.25 px. No family colour, no mint, no amber on the map.
- Seed frame: 2 px white with a 2 px dark gap. Hot rec: 2 px white frame and inverted badge (white ground, dark digits). Badges otherwise dark ground, white digits.
- **A cover never hides its own line (fix 5)**: lines run from the seed marker's edge to the rec marker's edge (centre to centre, clipped at both boxes). Layout guarantees at least 24 px of visible line. A marker box must also clear every other rec's line by 6 px; the declutter pass pushes it sideways until it does. When a marker is moved more than 6 px from its album's true position, a thin leader runs to an anchor dot at the true position.
- Non-focus stars at 45% as in the app. Gas focus pool as in section 3.
- Region labels in album view: only the seed's region and at most two neighbours, full strength, never over a cover or line, no sub-line. If none can be placed, the seed's region shows as a small chip at the top of the map.
- Hover card: opaque dark plate as in the app.

## 8. The similarity slider

- Each stop has its own regions, names and gas. Region sets come from the automated recipe (`../scaling/`). Regions that hold across stops keep their id and name.
- While the slider moves (520 ms): stars morph as in the app; gas fields cross-fade; the outgoing label set fades out over the first 40%, the incoming set fades in over the last 40%; a region present in both sets under the same name word keeps one label that travels with its centroid. A region that keeps its albums but changes its word gets a new label, never a label that changes text in place. With an album, a pick or a region card open, the camera follows it through the morph.
- The slider card keeps the app's three notes and adds one small line on every stop: "Place names change with this setting." (placeholder copy).
- What Sonic and Mood need before shipping: their own region sets with approved place names (the vocabulary differs: sound traits on Sonic, mood words on Mood), their own baked gas, and acceptance that only a few regions exist on Sonic.
- The open region card closes when the stop changes unless the region exists in the new stop.

## 9. First visit, without a legend

- **The sentence is the legend.** Bottom left on the map, two quiet lines: "Every star is an album. Albums close together sound or feel alike." (changed copy), then the colour rule with each colour word set in its own hue. Each colour word is a toggle button: pressing it isolates that family (other gas desaturates and dims), pressing again restores. Hidden once covers show, as today.
- **Names explain themselves** on hover or tap through the evidence sentence.
- **Home**: the nebula at Whole map framing is the backdrop, glowing behind the hero with a local scrim under the text only. No lettering on the backdrop. Hero and search unchanged. Under the hero row, four region links, one from each of four families, each with its plain words beneath; the cover shelf stays. No modal, no tour.
- **About**: one added section, "Reading the map", with the colour sentence and one sentence on names (new copy, needs approval).
- Phone: a "Colours" chip in map mode opens a small sheet with five toggle rows (swatch, colour name, meaning).

## 10. Chrome: two variants, switchable

- **Site chrome**: the app's tokens unchanged (room `#15110d`, paper `#ede5d5`, lamp amber `#e6a856`, per-album accent in the panel).
- **Trifid chrome**: cool near-black `#07060a` panels at 95%, text `#f1ece4`, controls in starlight (paper) instead of amber, per-album accent kept inside the panel.
- Both keep the site's type (Cormorant Garamond and Schibsted Grotesk), layout, radii and components. The map itself is identical in both.

## 11. Phone

- Album view stays a list with the 220 px strip and the Map pill. The strip shows the same nebula (from the baked gas image), stars, white cased lines, covers and badges, and the region name of the seed in small capitals at the top left of the strip.
- Map mode: full nebula; at most 4 labels (13 to 16 px, no sub-lines) and 3 edge pointers; tap a label for the region sheet (peek and full heights, scrollable); tap targets 44 px; the similarity control is one compact row at the bottom; a Regions button in the top row.
- Touch has no hover, so a tap on an album shows its name plate with an Open button and a second tap opens it. Where albums are too dense to tell apart (covers under 16 px), a tap zooms in instead of opening one of the dozens of albums under the finger.

## 12. Prototype-only controls

A small "Prototype" drawer, visibly separate from the design: chrome variant, gas live or baked, data real or synthetic 10,000, show region hulls (debug), frame-time readout.

## App behaviour to reproduce

Header 64 px with wordmark, centred search and Map/About nav. Album panel `min(45vw, 660px)` on the left with trail, seed header, tags (lit only for the hot rec), "Closest albums" rows with "Shares" words, Show more. Similarity card top left of the visible map. Zoom buttons bottom right (x1.6 steps, 240 ms). Wheel zoom anchored on the cursor with easing, drag pan with fling. Hover label after 80 ms. Explore: click picks an album, flies to it and shows the Explore card. Album view: click on another album opens it. Focus framing with the app's padding, 420 ms. Slider morph 520 ms ease-in-out, sonic to mood passes through balanced. Search: word-prefix matcher, 6 results, arrows, Enter, Escape, `/`. Phone under 900 px: list, strip, pill, bottom slider. Reduced motion makes everything instant.
