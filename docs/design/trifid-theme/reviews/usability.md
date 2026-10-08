# Usability and feasibility review: 21 theme concepts

Reviewer read all 39 PNGs, the seven NOTES.md files, the brief, and the map code (`frontcreck/src/components/map/**`, `styles/*.css`, `e2e/`, `scripts/perf/`). Nothing was run in a browser. Contrast figures were sampled from the PNG pixels with `reviews/contrast.py` (PIL). On small anti-aliased text the sampled value under-reads; the "peak" column of that script is closest to the CSS colour, and that is the number quoted below.

## Facts about the real architecture that the scores rest on

- One instanced `Points` draw, `transparent: true`, **depth write on**, depth used as a draw-order layer (`shaders/album.ts` L160-173, `AlbumField.tsx` L70-78). Dots and covers are the same sprites in the same draw. "Additive glow" therefore cannot be switched on for the material without also making covers additive. It needs premultiplied-alpha output (glow texels with alpha 0, cover texels with alpha 1) or a second pass. No designer mentioned this.
- The canvas is `alpha: true` with a transparent clear (`Scene.tsx` L110, L124). Anything fixed to the viewport (paper, sky gradient, tree trunks, vignette) is free as CSS under the canvas. Anything that must pan and zoom with the map (density haze, isophotes, contours) has to be a second mesh in the scene or a DOM layer moved every frame.
- Slider morph is `mix()` of three position attributes in the vertex shader by `u_sliderT`. A baked background per stop can be mixed by the same uniform at no cost, but halfway through it shows two ghosted hazes, not the haze of the moving points. Acceptable for soft haze, visible for hard contours.
- Zoom range is roughly 80x (fit zoom about 0.35 to `MAX_ZOOM` 28). Dots are 3 to 7.2 CSS px today and cross-fade to covers at 16 to 32 px. Any background baked at overview resolution is a blur at album zoom.
- Dot size is uniform; hit testing mirrors it (`renderedSpriteCssSize`). Per-album magnitude needs a size attribute and the hit test taught about it. Small.
- The album index is available free in the shader as `gl_InstanceID`; cluster `k` is already an attribute. **In-degree is not available on the client**: `recs.json` (600 KB) is read only on the server at build time (`lib/data/server.ts` L36); the map fetches `albums.json` and `positions.json` only. In-degree needs a new field in `albums.json` (pipeline plus `validate.py` contract) or a 600 KB fetch at map start.
- Lines are SVG `<line>` elements placed each frame by `MarkerDriver`. Curves, dashes and double strokes are cheap (`<path>`); SVG blur filters updated every pan frame are not.
- `focusLayout.layoutMarkers` already pushes focus covers apart and draws leader lines. Several mockups show stacked covers and call it "true to today's UI"; it is not. The real thing declutters better than the galaxy, hybrid 01 and three-d mockups show.
- Phone album view is the list plus a **Canvas 2D** strip (`MapPreviewStrip.tsx`, literal colours, `CLUSTER_RGB`), with a Map/List switch; the slider sits at the bottom in map mode. Every theme has to restyle that strip separately, and none of the WebGL haze reaches it.
- e2e runs on SwiftShader (`playwright.config.ts`), about 100 ms per frame today. Two pixel assertions are theme-sensitive: `isLamp` expects the selected frame near rgb(230,168,86), and a `meanLuma` check expects dimming to lower luminance (`e2e/explore.spec.ts` L75, L285-325). A changed accent or a light theme breaks them unless tests pin the default theme.
- Idle budget: `map.spec.ts` L17-21 allows at most 1 frame in 1.2 s. Every concept as drawn is static, so all pass as long as nobody adds twinkle, blink, wing-beat or caustics later.
- Per-album accent `w[2]` is guaranteed 4.5:1 only on `#15110d` (`data-pipeline/rmr_pipeline/constants.py` L50-51). Near-black themes can reuse it. Light themes cannot.

## Summary table

| # | Concept | Usability | Feasibility | Cost (mine) | Designer said | Idle budget ok? | Toggle fit |
|---|---|---|---|---|---|---|---|
| G1 | galaxy 01 Long Exposure | 7 | 7 | medium | medium | yes | good: second dark theme, same fonts and layout |
| G2 | galaxy 02 Resolved | 7 | 8 | low for the map, low-medium with its chrome | low | yes | fair: new mono/grotesk chrome is more than tokens |
| G3 | galaxy 03 Inclined Disc | 4 | 3 | high | high | yes | poor: a view mode plus a different chrome |
| N1 | nebula 01 Veil | 5 | 4 | medium-high | medium (too low) | yes | good on tokens; canvas layer is bespoke |
| N2 | nebula 02 Cosmic Cliffs | 5 | 3 | high | high | yes at rest; pan frames are the risk | fair: blue-black showpiece |
| N3 | nebula 03 Plate negative | 8 | 7 | medium | low-medium (too low) | yes | good as the light partner; needs light accents |
| S1 | starchart 01 Firmamentum | 6 | 5 | medium-high | medium-high | yes | fair: light, three new font families |
| S2 | starchart 02 Sky Atlas | 8 | 8 | medium (map low; labels, frame, key are the cost) | low-medium (a little low) | yes | best: ships its own dark/light pair on the existing fonts and accent |
| S3 | starchart 03 Plate | 5 | 6 | medium | medium | yes | poor: costume fonts, grey UI |
| T1 | three-d 01 Cluster | 3 | 2 | high | high | yes, but depth is unreadable without motion | view mode, not a theme |
| T2 | three-d 02 Armillary | 4 | 2 | high | high | yes | own theme only; loses the overview |
| T3 | three-d 03 Disc | 6 | 5 | medium-high; high as pictured | medium (too low) | yes | view mode under any dark theme |
| O1 | ocean 01 Sea Sparkle | 6 | 7 | low-medium | medium | yes | fair: second dark, pure blue-black |
| O2 | ocean 02 Chart of the Sound | 6 | 3 | high | high | yes | fair: light, own fonts |
| O3 | ocean 03 The Bank | 4 | 6 | medium | medium | yes | poor |
| W1 | wildcard 01 Thin Section | 4 | 2 | high | high | yes | chrome fits; map does not |
| W2 | wildcard 02 Murmuration | 7 | 7 | medium | low-medium (too low: it is a light theme) | yes | good as a light partner |
| W3 | wildcard 03 Fireflies | 6 | 8 | low | low | yes | good: second dark, no data change |
| H1 | hybrid 01 Warm Night Sky | 9 | 9 | low-medium | low-medium | yes | best: can ship without a toggle |
| H2 | hybrid 02 Dark Site | 6 | 6 | medium-high | medium-high | yes | second theme |
| H3 | hybrid 03 Theme toggle system | 8 | 6 | medium for Room + Night Sky; high with Daylight | medium-high | yes | it is the toggle |

## Per concept

### G1 galaxy 01 Long Exposure
- Chrome complete (header, search, slider, three zoom buttons, trail, tags, rows, badges, legend).
- Contrast: panel body passes. "VISITED" sits on the ambient wash and peaks at 3.7:1 (fail); "by sound and mood" 4.9:1; "Shares" 5.2:1. The NOTES claim "tertiary raised to about 5:1" holds on flat panel only. In 01b the star-name artist line over gold haze peaks at 3.2:1 (fail); the text shadow is not enough.
- Covers hold up because of their frames, but four of eight rec covers overlap the seed or each other, badge 4 is hidden, and only two lines are visible. Real `layoutMarkers` would fix part of that.
- Lines: 1 px warm white over warm haze. The hot gold line is clear; the idle ones nearly vanish.
- Decoration as data: dust lanes are noise texture inside real gaps, and pink knots look like bright albums. Blue vs gold needs the legend. Spikes are data (rank) but read as ornament.
- Feasibility: one baked KDE texture per stop on a quad, mixed by `u_sliderT`; soft sprite with size and temperature attributes; premultiplied-alpha blending. The temperature score needs a derived per-album value (from `d`, computable on the client). Rank is free from the index. Survives morph as a cross-fade. At album zoom the 800 px texture is mush, so the haze must fade out as covers fade in; the mockup's album view is zoomed out further than the real focus framing, so the picture flatters this.
- Software WebGL: fine. Phone: strip gets none of it.
- **Fix:** cut haze luminance by about half inside the focus neighbourhood and behind any label, and fade it to zero between cover sizes 16 and 32 px.

### G2 galaxy 02 Resolved
- Chrome complete, but the search box became a bare underline (weaker affordance) and the wordmark, titles and tags all changed face.
- Contrast passes everywhere sampled (5.8 to 7.8:1); hot pink rank 6.8:1.
- Seed vs recs vs rest is the clearest of the galaxy lane: reticle, offset outlines, corner rank tags.
- Decoration as data: the pink "tight cluster" knots are the same size and brightness as top-class stars and are not clickable.
- Feasibility: closest to today's renderer; size classes and colour as attributes, thin spikes in the fragment shader. The knots are positioned from density peaks, so they need a per-stop list and will pop during the morph. Designer's "low" is right for the map only.
- **Fix:** drop the knots (or make them a faint wash), and keep Cormorant + Schibsted so it is a token-level theme.

### G3 galaxy 03 Inclined Disc
- Chrome is present but restyled (floating rounded panel, pill nav and trail, tilt dial). "Visited" italic peaks at 3.8:1 (fail).
- The map is the muddiest in the set: far side compressed to about half, covers 4/5/6 stacked, stems and drop-lines add ink. Height encodes "sonic vs mood disagreement", which nobody will decode.
- The two reference ellipses are pure decoration that reads as a boundary.
- Feasibility: tilted camera breaks `projection.ts`, `hitTest.ts`, `bounds.ts`, `focusLayout.ts`, marker placement, and the z-as-layer depth trick; orbit conflicts with pan on touch. Morph must animate height. High is correct.
- **Fix:** do not build as a theme; if tilt is wanted, treat it as T3's orthographic z=0 experiment on top of G1.

### N1 nebula 01 Veil
- Chrome complete; contrast is the best of the dark set (7 to 8:1).
- The overview is the most striking single image of the 39. The album view is not: threads all run one way and read as hair.
- **Decoration as data, serious:** filaments look like paths between albums. In album view the orange rec lines run parallel to orange filaments, so the selection lines are hard to tell from the gas. The flow direction is partly noise, so it implies routes the data does not have.
- Feasibility: I count roughly 300k line segments for the full cloud. GL lines are 1 device px and cannot be thickened, so the 0.6 to 0.75 px weights only exist at dpr 2. There is no morph (designer admits fade-swap-fade), and no single trace survives an 80x zoom range; the mockups re-trace per zoom, which hides this (designer admits). On SwiftShader 300k additive lines per frame is a real e2e slowdown. Medium-high, not medium.
- **Fix:** keep it as the overview/home hero only (static, baked to a texture per stop) and switch to plain stars before album zoom; never draw filaments under selection lines.

### N2 nebula 02 Cosmic Cliffs
- Chrome complete; text 6 to 9:1.
- Covers survive on frames; white cased lines are the most legible lines over a busy ground in the set. The background is still the busiest: bright rims pass straight under covers.
- Decoration as data: lanes and billows are map-anchored noise; the hard bright rim says "the map ends here" far more strongly than a UMAP edge deserves. Overview reads as a lava island (designer admits).
- Feasibility: as specified it is a full-screen fragment shader with 5 to 6 fbm octaves on every pan frame at dpr 2. That is a frame-gap risk on phones and would crawl on SwiftShader. Baking kills it at zoom. High is right; I would not ship the live-shader version.
- **Fix:** bake one large tile per stop for overview only, fade to near-black by the time covers show.

### N3 nebula 03 Plate negative
- Chrome complete and calm. Contrast: "Shares" 5.9:1, rank numerals 4.8:1 (marginal), mono caption on plate 5.4:1, red tags 5.1:1.
- Best figure/ground of any concept: black stars, red ink lines, covers as prints. Seed, recs and rest are unmistakable.
- Decoration as data: the hover mark (ring plus cross-hair on "Kid A") is nearly identical to the top-26 halation ring plus cross-hair. The measuring grid implies meaningful axes. The fake scratch is harmless.
- Feasibility: dark discs sized by index, one grey density texture per stop, CSS grain. The cost is that it is a light theme: accents need a light variant, `PAPER/LAMP/ROOM` shader constants become uniforms, the 2D strip and the `meanLuma` test need attention. Medium, not low-medium.
- **Fix:** give hover a different mark from the bright-star glyph (red ellipse only, no cross-hair).

### S1 starchart 01 Firmamentum
- Chrome complete plus a magnitude legend and a graduated frame.
- Contrast is the weakest of the set on the panel: "Shares" italic 3.5:1 (fail), artist 4.3:1 (fail), "in order of nearness" 4.5:1, region names 3.9:1, vermilion Greek 4.2:1 (passes only as large text). Designer flagged legibility but not the failures.
- Greek letters instead of 1 to 5 slow the list-to-map match, and they stop working past omega-ish counts once "Show more" is used.
- Decoration as data: grid figures (-10, +20) and the piano-key border state coordinates that mean nothing; region names in wide tracking collide with stars and titles.
- Feasibility: glyph sprite atlas, three Fell families (about 150 KB against a 200 KB first-load JS budget is separate, but it is still weight and a font swap on toggle), contour wash per stop, named-star labels with collision each frame, region label file per stop. Medium-high is fair. The frame eats phone width.
- **Fix:** keep Schibsted for all text under 16 px and numerals for ranks; reserve Fell for titles and map lettering.

### S2 starchart 02 Sky Atlas (Field + Desk)
- Chrome complete, legend and key chart added. Panel text passes in both editions (Field 5.6 to 10:1, Desk 4.9 to 5.6:1; Desk "Shares" is right on the line).
- Region names fail in both: 3.5 to 4.1:1 at about 11 px. They are orientation aids, but they are text.
- Seed/recs/rest very clear; amber lines and badges carry over from today. Named bright stars give the map landmarks for the first time.
- Decoration as data: grid figures and the graduated border imply coordinates; black "holes" inside the isophotes look like lakes.
- Feasibility: flat discs with size attribute and knockout ring (trivial), isophotes by thresholding a mixed density texture (cheap, morphs acceptably). The hidden cost is everything else: about 20 star labels and a dozen region labels placed with collision avoidance every frame, a label file per stop, the frame, the minimap. That makes it medium, not low-medium. The phone mockup shows a map-over-sheet layout that does not exist in the app; on the real phone map the frame, legend and key will fight the bottom slider.
- **Fix:** ship stars + isophotes + named stars first; raise region names to at least 4.5:1 and drop the coordinate figures and frame on phone.

### S3 starchart 03 Plate
- Chrome complete. Courier everywhere makes rows wider and titles weaker. "Shares" 4.5:1 (marginal), legend caption 5.6:1, region names 4.2:1 (fail).
- Handwritten star names measure 4.6 to 5.8:1 on the grey, so the designer's own worry is borne out only in the darkest fog; the bigger problem is that Caveat at this size is slow to read.
- Seed/recs clear (red ring, stickers).
- Feasibility: soft blob is a one-line shader change; fog is the same density texture; grain is CSS. Two more fonts. Medium is fair.
- **Fix:** if kept, merge into N3 (same idea, cleaner type) and use handwriting for one caption only.

### T1 three-d 01 Cluster
- Chrome complete plus a 2D/3D switch and gizmo; text 6 to 15:1.
- Usability problem is the concept: screen distance no longer means similarity (the designer says so and shows it with the alt view). Depth has no cue at idle. Range rings, spokes and stalks are decoration that looks like data. Stars behind others cannot be picked. Orbit demotes pan.
- Feasibility: perspective camera touches about ten files, breaks the depth-layer trick, needs a 3D UMAP run and data format change. The z in the mockup is synthetic. High.
- **Fix:** do not ship; prototype only if a real 3D embedding is computed first.

### T2 armillary
- Chrome complete; text 7 to 12:1; the brass ring is handsome.
- Half the map is always hidden, the outside view crowds eight covers into one patch, and the mock mapping shears by about 4x at the rim (designer admits). Graticule, equator scale and meridian ring are all decoration that reads as coordinates.
- Feasibility: haversine UMAP, spherical alignment of three stops, slerp morph, great-circle lines, second projection for the dome. Highest cost in the set.
- **Fix:** do not ship.

### T3 three-d 03 Disc
- Chrome complete plus 2D/3D switch; text fine.
- Keeps the 2D reading at moderate tilt. The edge-on PNG shows honestly that it collapses past about 65 degrees.
- Feasibility: the designer costs the cheap orthographic z=0 variant as medium, but the picture shows perspective, thickness and per-album haze blobs. Even the cheap variant changes `projection.ts`, `hitTest.ts`, `bounds.ts`, `focusLayout.ts`, `MarkerDriver`, `CameraRig` gestures and the e2e camera helpers. Medium-high; high as pictured.
- **Fix:** if 3D is wanted at all, build only the orthographic tilt as an optional view on top of the chosen 2D theme, clamped at 60 degrees.

### O1 ocean 01 Sea Sparkle
- Chrome complete; text 6 to 9:1 (blue "Shares" 9.3:1).
- The wake lines are the best-looking rec lines in the set and the ripple rings mark the seed well. Covers are legible on black.
- It reads as a blue starfield (designer admits). The horizontal swell streaks are procedural and look like currents linking albums.
- Brightness uses in-degree, which the client does not have (see facts).
- Feasibility: glow sprite, one density texture per stop, wake as a double-stroked SVG path (no need for a particle mesh). Low-medium; designer's medium is cautious.
- **Fix:** drop the swell streaks or tie them strictly to density, and bring one warm colour in so it is not the stock blue-on-black.

### O2 ocean 02 Chart of the Sound
- Chrome complete with chart title block. Teal "Shares" italic 5.2:1, soundings 4.5:1, bearings 5.7:1.
- Covers as stamps are very legible. Place names are a real feature.
- **Decoration as data, serious:** hundreds of sounding numerals sit among the albums and will be read as scores or ranks; the compass rose and "078°" bearing give direction a meaning it does not have; green reads as land, and the legend says "DEEP · FEW ALBUMS" which inverts the usual "deep = more".
- Feasibility: contours, five tints, soundings and curved place names regenerated per stop with zoom-aware collision. Hard contours ghost visibly in the morph. High is right. Some names are nonsense ("Sampling Bank").
- **Fix:** remove soundings and bearings entirely; keep tints, names and the rose ring.

### O3 ocean 03 The Bank
- Chrome complete; panel text 6 to 9:1; slider card over water 5.9:1.
- White wake lines over pale sand are close to invisible (lines to recs 1, 3, 5). Saturated teal competes with every cover. Dots flip dark/light with depth, so the same album changes colour across the morph.
- Feasibility: one texture per stop plus a density lookup for the dot flip. Medium is fair.
- **Fix:** not worth fixing; the designer ranks it last too.

### W1 wildcard 01 Thin Section
- Chrome present, but rows are rearranged ("Shares" right-aligned), and a PPL/XPL switch is added. Text 5.6 to 12:1.
- Covers sit on a saturated mosaic and are hard to pick out; the pale vein lines are lost (one of eight is clearly visible). Twin-striped grains look like "no cover" placeholders. Brightness and stripes are hashes of the index, i.e. decoration presented as data.
- At overview dense areas are confetti.
- Feasibility: `Points` cannot draw cells. Cone or jump-flood Voronoi needs a second instanced mesh that fights the existing depth-layer scheme, re-tessellates through the morph, and would be very slow on SwiftShader. "Cover fills its grain" contradicts square cover sprites. High.
- **Fix:** do not ship.

### W2 wildcard 02 Murmuration
- Chrome complete. Text is uniformly just over the line (about 5.1:1 for grey, 6.2:1 for rust), with no headroom; the italic caption samples at 4.0 and peaks 5.1.
- The overview is beautiful and reads immediately as "one flock, near = alike". In album view the black hairlines are very faint and covers bunch.
- Decoration as data: bird heading and pose suggest direction and motion; the fixed horizon will not move when the map pans, which will feel wrong.
- No per-album colour and no magnitude: least informative map.
- Feasibility: two-pose sprite with rotation in the fragment shader, CSS sky under the alpha canvas, one haze texture per stop. Cheap for the canvas, but it is a light theme (accents, shader constants, `meanLuma` test, strip), so medium overall.
- **Fix:** make rec lines 1.5 px rust with a paper casing, and remove the horizon in map view (keep it for Home).

### W3 wildcard 03 Fireflies
- Chrome complete; text 6.8 to 14:1.
- Dashed arcs are clearly visible; covers hold on the dark ground.
- Decoration as data: tree trunks cross the cloud and darken the albums behind them, so they look like gaps in the map. Bokeh discs look like extra-large albums. The legend "three colours, three families of sound" over-claims: it is cluster `k % 3` from another pipeline.
- Feasibility: genuinely low. Rank from `gl_InstanceID`, colour from the existing cluster attribute, glow sprite (premultiplied blend), trunks as CSS under the canvas. No data change.
- **Fix:** move trunks to the margins outside the cloud's bounding box (or Home only) and cap additive glow in dense areas.

### H1 hybrid 01 Warm Night Sky
- Chrome complete and unchanged, including "Explore this area"; the phone frame matches the real phone map mode. Text 5.7 to 7.8:1.
- Seed/recs/rest clear; square badges and the dotted mutual-rec lines are a real improvement. Covers 3 and seed overlap in the mock; real layout handles it.
- Weakness is the designer's own: it is "the same map with nicer dots", and the haze is so subtle it may not show on a dim screen.
- Data: uses in-degree, which needs a pipeline field. In-degree is also a hubness artefact: the brightest stars would be "V", "Grim Fandango", "Keep an Eye on the Sky" (computed from `recs.json`), its rank correlation with chart order is -0.06, and it changes per stop (Spearman 0.34 between sonic and balanced). Use the index instead (see chart-rank answer).
- Feasibility: two attributes, soft falloff, three small haze textures. Low-medium is right.
- **Fix:** drive magnitude from album index, not in-degree, and lift haze contrast one step.

### H2 hybrid 02 Dark Site
- Chrome complete; region labels measure 6.6 to 10.9:1 thanks to large italic and shadow, though "pastoral · longing" on the brightest haze drops to about 5:1.
- Bright haze under the focus covers; spikes on about 40 stars add clutter around the selection. Dust lanes are invented texture (designer admits).
- The nebula tinted by the seed's own `w` colours is the best single idea in the lane.
- Feasibility: H1 plus a second tinted quad, spike sprite, per-stop region labels as DOM. Medium-high is right.
- **Fix:** keep the cover-tinted nebula and region labels, drop the dust lanes and halve the haze under the selection.

### H3 hybrid 03 Theme toggle system
- The header control (three icon segments plus popover) is clear; popover text 5.7 to 6.3:1. The icon-only segments need labels for screen readers and a 44 px target on phone.
- Daylight band: text 5.1 to 6.8:1; the map is brown dots on beige (designer admits).
- The NOTES cost list is accurate against the code: shader constants `album.ts` L235-237, `CLUSTER_RGB` in `data.ts` L12, literals in `MapPreviewStrip.tsx`, `themeColor` in `layout.tsx`, about 16 CSS lines with raw rgba/hex, and accents tuned for `#15110d`. Add the two theme-sensitive e2e assertions.
- **Fix:** ship two dark themes on one token set first; defer Daylight until a light accent exists in `albums.json`.

## Chart-rank question

**What the order of `albums.json` is.** It is the row order of the recommender's feature table, with duplicate Spotify URIs and albums missing from the map removed, and no sorting.

- `data-pipeline/rmr_pipeline/build.py` L50-57 and L85-94: albums are emitted `for r in range(len(sub))` after `dedupe_table` and a keep-filter; nothing reorders them.
- `data-pipeline/rmr_pipeline/table.py` L34: "The feature table in catalog-rank order ... (row = album number - 1)". `data-pipeline/README.md` Inputs: "4,000+ rows in catalog-rank order".
- `data-retrieval/README.md`: the table was built from "a list of top 5,000 albums ... from RateYourMusic".
- I checked it against the scraped chart `data-retrieval/rymscraper-master/Scraped Data/top5000records.pkl` (columns Rank, Artist, Album, Date, Genres, RYM Rating, Ratings, Reviews; read with `pickletools`, not unpickled). For roughly the first 3,820 albums, `albums.json` order matches the chart order with Spearman 0.97; the few inversions are duplicate titles such as "Live".
- **The tail is not rank.** Roughly the last 260 entries (index about 3,824 onward) are not in that chart list at all (EPs, mixtapes, DJ mixes: "Twoism", "Pop 2", "Barter 6"), and the final dozen are high-ranked albums that were re-added late: "Lift Your Skinny Fists Like Antennas to Heaven!" (4073), "Either / Or" (4075, chart position about 72), "Blackstar" (4076). Using raw index would make those the faintest stars on the map.

So the designers' assumption is mostly right: index is the RateYourMusic all-time chart position at scrape time (2022) for about 94% of the catalog, and wrong for the appended tail.

**Is there a real popularity/rank/rating field?** Not in anything the site serves. `albums.json` has only `slug, t, a, s, c, k, d, w`. The feature table's non-feature columns are `Title, Artist, URI, Descriptor Count` (`constants.py` L29, META). The scraped pickle does hold Rank, RYM Rating, Ratings and Reviews, but the pipeline never reads it, it has no Spotify URI (join would be on title + artist), and it is a frozen snapshot. In-degree from `recs.json` is the only other candidate and it is a poor one (see H1).

**Recommendation.** Use the index as magnitude, in coarse classes (the starchart cut points 30 / 120 / 400 / 1100 / 2400 are sensible), and treat everything from about index 3,824 on as the median class rather than the faintest. A proper fix is a small `r` field written by the pipeline from the scraped chart. Legend copy that says "higher ranked" or "higher in the charts" introduces a claim the site does not make today and needs the owner's sign-off.

## Top 8: best balance of beautiful and shippable

1. **H1 Warm Night Sky**: lowest risk, keeps every approved decision, already reads as sky. The base to build on.
2. **S2 Sky Atlas (Field, with Desk as the light pair)**: the only concept that brings its own dark/light pair on the existing fonts and accent, and it adds landmarks.
3. **G1 Long Exposure**: the "wow" version of H1; same plumbing plus a stronger baked haze. Needs the haze tamed under covers.
4. **G2 Resolved**: cheapest dark look and the right zoomed-in state for G1 (crisp classes, no haze).
5. **W2 Murmuration**: the most original light theme and a metaphor that explains the map by itself.
6. **N3 Plate negative**: the cleanest figure/ground in the set; the sober light option.
7. **W3 Fireflies**: lowest cost of all, no data change, fun; fix the trunks.
8. **O1 Sea Sparkle**: mainly for its wake lines and ripple selection, which could be lifted into any dark theme.

Ideas to carry regardless of the pick: H2's nebula tinted by the seed cover and its region mood labels; H1's dotted mutual-rec lines; N2's dark-cased line for any bright ground; H3's token plumbing (Room + one dark theme first).

## Impractical as specified

- **T1 Cluster, T2 Armillary**: need a new embedding, a new camera model through about ten files, and they make similarity harder to read.
- **W1 Thin Section**: cannot be drawn by the Points pipeline; covers and lines lose to the mosaic.
- **N2 Cosmic Cliffs**: per-pixel fbm on every pan frame; hostile to phones and SwiftShader; busiest ground behind covers.
- **O2 Chart of the Sound**: per-stop contours, soundings and curved labels; the soundings actively mislead.
- **G3 Inclined Disc**: 3D cost for a muddier picture.
- Borderline: **N1 Veil** (no morph, no level-of-detail answer, filaments masquerade as connections) is worth keeping only as a static hero image; **S1 Firmamentum** and **S3 Plate** are buildable but fail contrast and lean on costume type.
