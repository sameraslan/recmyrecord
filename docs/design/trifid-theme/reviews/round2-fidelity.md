# Round two: fidelity to the real sky, and label/colour honesty

Reviewer brief: Part A scores how close each concept is to the real object (or print tradition) it claims; Part B scores whether names, colours and evidence notes say only what `regions/regions.json` supports. Both out of 10. Mockups judged from the overview and album PNGs plus each lane's NOTES.md.

## What I actually saw as images (built-in browser pane, view only, 800x600 screenshots)

Seen:
- M51, Hubble: https://cdn.esahubble.org/archives/images/screen/heic0506a.jpg (page https://esahubble.org/images/heic0506a/)
- M101, Hubble: https://cdn.esahubble.org/archives/images/screen/heic0602a.jpg
- Carina "Cosmic Cliffs", Webb: https://cdn.esawebb.org/archives/images/screen/weic2205a.jpg
- Pillars of Creation, Hubble 2014 (SHO): https://cdn.esahubble.org/archives/images/screen/heic1501a.jpg
- Lagoon, Hubble 2018: https://cdn.esahubble.org/archives/images/screen/heic1808a.jpg
- Cassiopeia A, Webb NIRCam: https://cdn.esawebb.org/archives/images/screen/weic2330a.jpg
- Trifid, ESO: https://cdn.eso.org/images/screen/eso0930a.jpg
- Rho Ophiuchi wide field (APOD 2019-05-13), small (about 300 px wide) on https://science.nasa.gov/image-article/apod-2019-may-13-rho-ophiuchi-wide-field/ : enough for colour layout, not for fine structure.
- JPL "Visions of the Future" gallery, thumbnails of The Grand Tour, Mars and Earth only: https://www.jpl.nasa.gov/galleries/visions-of-the-future/

Not usable or not seen:
- https://commons.wikimedia.org/wiki/File:Rho_Ophiuchi.jpg loaded, but it is the WISE infrared false-colour image (teal and red), not the visible-light scene darksite 01 imitates. Not used for scoring.
- No real screenprint or risograph example loaded (Commons Category:Risograph and File:Garden_Party,_close.jpg showed empty thumbnails). Overprint is judged against the JPL thumbnails and prior knowledge only.
- No Bonestell or other mid-century gouache original was viewed. Webb Rho Ophiuchi (weic2316a) and Chandra Cas A not opened.

What the real images have in common, which most mockups miss: colour is far less saturated than memory suggests (M101's arms are grey-blue to white, Carina's wall is ochre and brown, not flame), hues blend through gradients and depth rather than sitting side by side as patches, dust is sharp and dark against bright gas, and stars vary in colour.

## Scores

| Concept | References actually viewed | Fidelity | Honesty |
|---|---|---|---|
| galaxy 01 Long Exposure, full colour | M51 heic0506a, M101 heic0602a | 6 | 7 |
| galaxy 02 Named nebulae | M51, M101; Lagoon heic1808a for emission hues | 4 | 8 |
| nebula 01 Cosmic Cliffs | Carina weic2205a | 6 | 6 |
| nebula 02 Hubble Palette | Pillars heic1501a, Lagoon heic1808a | 5 | 5 |
| darksite 01 Rho Ophiuchi | APOD 2019-05-13 wide field (small) | 6.5 | 5 |
| darksite 02 Cover-coloured sky | same APOD image (nearest real analogue) | 4 | 4 |
| fresh 01 Remnant | Cas A weic2330a | 5 | 6.5 |
| fresh 02 Trifid | Trifid eso0930a | 7 | 6 |
| illustrated 01 Gouache | JPL Visions of the Future thumbnails | 6 | 7.5 |
| illustrated 02 Overprint | JPL thumbnails only; no screenprint seen | 7 | 5.5 |

## Checks common to all ten (Part B)

- **Names.** All seventeen `name_space` strings appear verbatim in every overview (checked in the HTML and, for the galaxy lane, in `data-common.js`). The sub-lines where shown ("sombre · cold", "live recordings") are `label_plain` verbatim.
- **Centroids.** Fitting each overview's scale from Live Belt and Improv Arm and predicting the rest, labels land within about 20 px of `cx, cy` except where nudged: Sombre Void about 55 px left/down in galaxy 01/02 (notes say "a few pixels"); Urban Cluster about 85 px to the south-east and Sombre Void about 55 px left in Gouache, both hanging off the edge of their own cloud; Pastoral Nebula about 35 px up in the fresh lane. All stay inside the region radius. None is on the wrong region.
- **Evidence notes.** Every note shown is correct against regions.json: playful 61% (0.607; 21% overall), urban 89% (0.892; 15%), warm 74% (0.736; 23%), sombre 76% (0.764), improvisation 82% (0.821; 11%). Seed region lines are correct too (A Tábua de Esmeralda and Thriller are `warm`, Ghost Reveries `sombre`, Before and After Science `ethereal`).
- **One caveat for whichever ships.** "61% of albums here are tagged playful" is computed on the full descriptor table, not the handpicked words shown on each album. A user counting visible tags in a region will get a lower number. Either compute coverage on shipped words or word the note so it does not invite that count.
- **Per-region normalisation.** galaxy 02, fresh 01 and both illustrated concepts normalise each region's glow to its own peak, so inside named regions brightness no longer means "more albums" (Sombre Void, n=106, glows like Improv Arm, n=290). Harmless if no caption claims brightness = density; nebula 02's caption does ("Brighter gas, more albums") and its picture mostly honours it.

## Per-concept findings

### galaxy 01 — Long Exposure, full colour (fidelity 6, honesty 7)
Fidelity. Right: cream-white core, salmon knots, brown extinction rather than black paint, spikes on a handful, mostly dark frame. Wrong against M51/M101: the blue is a saturated royal blue where the real arms are grey-blue to white; the dust is a dozen soft brown blobs where the real lanes are thin threads that trace the arms with the pink knots strung along them; and colour splits the picture into a blue half and a gold half, where a real disc is gold in the middle and blue around it. There is no arm structure, so it reads as a two-tone nebula more than a galaxy.
Fix (fidelity): desaturate the blue by about 40% toward M101's grey-blue-white and let it whiten in knots; that single change moves it most of the way from "nebula" to "galaxy photograph".
Honesty. Rule: blue = hot mood words, gold = mellow, each album pulled half-way to its region mean; the caption says so and the picture follows it. Strong vs fair is the clearest of the photographic set (two-line capitals vs small italic). Risks: the rule is the astronomer's (blue stars are hot) but the opposite of lay intuition, so "Raw Flare" and "Aggressive Rift" in blue and "Lonely Drift" and "The Quiet Deep" in warm gold only make sense after reading the caption; "Warm Halo" sits on the blue/dark edge, not in the gold. The half-pull to the region mean makes regions look more uniform than the albums are. Salmon knots (density maxima) look like special objects. Dust blobs are real gaps, which is honest, but their inner texture is not data.
Fix (honesty): drop the half-way pull to the region mean (colour each album by its own words only) so the map does not manufacture region character, and keep the caption.

### galaxy 02 — A galaxy of named nebulae (fidelity 4, honesty 8)
Fidelity. No galaxy has emerald, green-gold, magenta and lilac districts a fifth of the disc wide; in M51 and M101 emission shows only as small pink beads on the arms. The airbrushed patches over a white middle read as a colour-coded chart laid on a galaxy. Stars and core are good.
Fix (fidelity): shrink each region's colour from a district-sized wash to a tight cluster of knot-sized nebulae at the region's densest points, on neutral starlight, and let the tinted lettering carry the rest.
Honesty. The most honest photographic concept. Rule: `album_region` only, one hue per strong region, everything else neutral; caption says "Each named region glows in its own colour"; names are tinted to match. Hues mostly agree with names (Warm copper, Sombre steel blue, Quiet ice cyan, Aggressive crimson next to Raw vermilion, which really are related: aggressive is 76% in Raw Flare). Problems: fair regions are named but do not glow, which contradicts the caption's "each named region"; The Bittersweet Reach (fair) sits on the brightest white core and so looks like the most important place; Urban magenta, Playful rose and Aggressive crimson form a pink-red family across three unrelated regions.
Fix (honesty): change the caption to say only the twelve strongest regions glow, or give the five fair regions a faint grey-tinted glow so "named but neutral" is not confused with "unnamed".

### nebula 01 — Cosmic Cliffs, done right (fidelity 6, honesty 6)
Fidelity. Palette family is right and the filament warp is the best gas structure in the set. Against the real Carina frame: the real thing is two continuous masses (a smooth, star-filled blue haze above and an ochre-brown wall below) meeting at one lit ridge, with almost no black; the mockup is amber tongues and blue tongues of the same curling texture on a mostly black ground, which reads as fire and smoke. The amber is flame orange where Webb's is ochre and tan with deep brown shadow. Stars are uniform white dots; the real field has blue, gold and red stars.
Fix (fidelity): take the warm ramp from flame (`#db541c` to `#ffa852`) to ochre-tan with brown shadows and reserve cream for ridge edges only.
Honesty. Rule: brightness = density, amber/blue = hot/cold word lists; captioned and followed. Strong vs fair is weak: same italic face, slightly smaller and dimmer (Epic Expanse and Raw Flare look the same rank). Contradictions a viewer would notice: Warm Halo sits in dark, blue-edged gas; Aggressive Rift and Raw Flare, the hottest names, sit in the dimmest rust, while Improv Arm (acoustic, energy z -0.7) is the brightest flame on the map; The Bittersweet Reach and Pastoral Nebula are cold blue. The far-field wisps are navy, the "cold" colour, in sky with no albums, so the picture implies cold-mood territory out to the screen edge. The two word lists are editorial.
Fix (honesty): make the far-field and noise-only gas a neutral grey-brown instead of navy, so blue appears only where albums actually score cold.

### nebula 02 — Hubble Palette (fidelity 5, honesty 5)
Fidelity. The ingredients are SHO (teal, gold, red-brown, umber) but the arrangement is not. In the Pillars and the Lagoon, teal is the ambient glow that fills the frame, umber and gold are dust in front of it, and colours pass into each other through gradients. The mockup is separate saturated puffs (near-neon cyan, lemon yellow, coral) laid side by side on brown. Stars are white where SHO stars go magenta-orange.
Fix (fidelity): make teal the continuous background glow behind everything and render regions as gold-to-rust dust in front of it, so colour is layered by depth as in the Pillars.
Honesty. Rule: region id to a hand-picked hue in the teal/gold/red range, "cold and quiet regions teal to blue, bright and warm ones gold to amber". The picture breaks its own rule: Urban Cluster (valence +0.9, danceability +1.6) is the brightest teal on the map and shares it with Hypnotic Orbit and Ethereal Veil; Improv Arm (quiet, acoustic) shares gold with Playful Way and Pastoral Nebula; The Quiet Deep, Progressive Spiral and Sombre Void are one blue. A viewer will read three or four colour families as kinship that the data does not have. Epic Expanse (fair) is painted salmon as vividly as Aggressive Rift (strong). "Neutral" unnamed territory is a warm umber close to Warm Halo's and Bittersweet's hues. Strong vs fair in the lettering is weak, as in 01.
Fix (honesty): either give Urban Cluster a warm hue and stop reusing one hue for unrelated regions, or state the rule as "colour = family" and derive the family from data (the audio z-scores) rather than by hand.

### darksite 01 — Dark Site, Rho Ophiuchi (fidelity 6.5, honesty 5)
Fidelity. The three-colour idea is the real complex's: pink emission, blue reflection, a yellow patch, brown dust, most of the frame dark, near-neutral stars. Against the APOD frame the colours are too even and too large: the real ones are compact pockets that brighten to near-white around individual bright stars, set in a dense grey-brown star field with strongly drawn dark lanes; the mockup is three airbrushed thirds with little internal structure, and the pink is candy rather than rose-red.
Fix (fidelity): concentrate each cloud around its brightest stars with a whitening core and a fast fall-off, instead of an even wash over the whole region.
Honesty. Names, sub-lines and strong/fair treatment are the best in the set. The colour rule (audio z-scores to three anchors) is reproducible from regions.json but is not stated on the map, and its results contradict the printed words: Sombre Void, with "SOMBRE · COLD" lettered beneath it, glows hot pink-red; The Live Belt is the same red as Aggressive Rift; Progressive Spiral is "quiet acoustic" blue with acousticness -0.15. Five regions share one red and three one gold, so the map reads as three super-regions ("the red north-west") that regions.json does not contain. Internal dust lanes are noise.
Fix (honesty): add a blue-leaning term for low valence without energy so Sombre Void lands blue-violet, and put the one-line rule on the map.

### darksite 02 — Cover-coloured sky (fidelity 4, honesty 4)
Fidelity. The star field and dust ground are good, but six hues in small patches is not any real field; it reads as confetti. Rho Ophiuchi has three hues in a few large pockets.
Fix (fidelity): fold the classes into three sky hues (rose, gold, blue) plus dust, and double the blur radius so patches are few and large.
Honesty. Labels are plain cream, so no false name-to-colour link is asserted, and the notes shown are right. But there is no caption, and coloured patches sitting under region names will be read as belonging to those regions or as sub-regions with boundaries. The designer's own note says cover colour is nearly independent of position, so the pattern is local chance and would reshuffle with the catalogue. It is true to the covers and misleading about the map.
Fix (honesty): if kept, caption it on the map ("the sky takes its colour from the covers here, not from the music") and cut saturation to a tint; otherwise drop it.

### fresh 01 — Remnant (fidelity 5, honesty 6.5)
Fidelity. Right: grey-lavender smoke, hollows, lots of black, spiked stars. Wrong against Webb's Cas A: the real lace is one colour family (coral, pink, white, a little violet) in thin broken filaments along a shell; the mockup has seventeen hues in soft clouds with no shell, and in album view the violet, blue and cyan regions saturate into the stock purple-space look the brief warned about.
Fix (fidelity): thin the coloured gas into fine broken filaments and knots over the grey smoke, and cap saturation, so hue is a tint on lace rather than a cloud.
Honesty. Rule: region id to hue, with hue order taken from each region's energy/valence angle; followed, but not captioned on the map (only tinted names). Because order is data-derived, neighbouring hues do mean "similar feel", which is more defensible than hand-picking. Still: Warm Halo, Urban Cluster and The Bittersweet Reach are one gold; Live Belt, Epic Expanse and Aggressive Rift one pink-red; Lonely Drift and The Quiet Deep one teal. Noise lace and knots look like data: the brightest object on the overview is a pink knot inside Epic Expanse, a fair region. Evidence card with the "against 21% across the map" baseline is the best note format in the set.
Fix (honesty): tie lace brightness to album density only (no noise-made knots) and hold fair regions visibly below every strong one.

### fresh 02 — Trifid (fidelity 7, honesty 6)
Fidelity. Closest to its reference: rose emission, blue reflection beside it, cream cores, dark lanes, a believable billow. Differences from the ESO frame: the real lanes are sharp black silhouettes cut into the brightest pink; here they are soft and brown. The real Trifid has no gold nebula; the gold third is borrowed from Rho Ophiuchi. The star field is sparse and uniformly white.
Fix (fidelity): sharpen and darken the dust lanes where they cross bright gas, so they silhouette as in the real Trifid.
Honesty. Rule: three mood-word families as three channels, independent of regions, so names act as a check. Not captioned on the map. Where the check fails, the picture says the wrong thing: Improv Arm is rose, the "fierce" colour; Urban Cluster is violet; the lower half of Epic Expanse (heavy metal) is "cold/quiet" blue; there is a gold patch at Hypnotic Orbit. Dust lanes are drawn where unnamed albums are, so the darkest parts of the cloud contain albums; a viewer will read them as empty gaps and as borders between regions.
Fix (honesty): do not darken where albums are: keep unnamed territory as neutral lit gas and reserve dark lanes for real low-density gaps.

### illustrated 01 — Gouache (fidelity 6, honesty 7.5)
Fidelity (to the print tradition). Brush streaks, wobbling cut edges and the dark painted ground are convincing paint. But the JPL posters seen are built from three to five flat colours on a single strong composition with geometric shapes; this has twelve hues plus five muted ones, stepped tonal bands that read as a contour map, and soft "wonky" lettering that is 1970s record sleeve rather than mid-century poster. It reads as an illustrated atlas or board-game map. No gouache original was viewed.
Fix (fidelity): cut to a limited palette of four or five paint colours used in tints and shades, which is what makes the real posters look printed rather than rendered.
Honesty. Best agreement between names and colours: Warm orange, Sombre blue, Aggressive red, Quiet pale mint, Lonely indigo. Caption explains clouds, bare sky and star size plainly. Strong vs fair is clear. Evidence note with baseline is correct. Problems: flat bands with crisp edges are hard borders, which regions.json does not have (regions are trimmed interiors with soft, sometimes overlapping hulls); Improv Arm and Sombre Void are the same blue, Progressive Spiral and The Quiet Deep the same teal family; Urban's lime green is arbitrary; the Urban and Sombre labels hang off their own clouds.
Fix (honesty): dissolve the outermost band into dry-brush stipple so the edge reads as "roughly here", not as a border.

### illustrated 02 — Overprint (fidelity 7, honesty 5.5)
Fidelity (to the print tradition). Angled line screens, a five-ink set, misregistered second ink on the lettering and knockouts all read as screenprint or risograph at once. What is wrong is the light: the inks glow on a midnight stock like a neon screen. Real inks are translucent and darken where they cross (two inks make a third, darker colour); on dark stock they would be matte and duller than the paper white. Judged without a real screenprint reference.
Fix (fidelity): make crossings multiply to a darker third colour and dull the inks to matte, so it reads as ink on paper, not light on glass.
Honesty. Names exact; strong vs fair is the most separated of all (fair names are small grey and close to illegible). Evidence note correct. The colour system misleads by construction: five inks for twelve regions means shared inks, and the caption ("Each ink is a named region, two inks where it took two") is false as written and invites reading Warm Halo (red + pink) as a mix of Aggressive Rift (red) and Urban Cluster (pink). Lonely Drift prints hot magenta. Urban, Warm, Ethereal, Lonely and Playful are all pink-family. Fair regions print in the same grey screen as unnamed albums while the caption calls grey "the albums in between". Screens have hard hull-like edges.
Fix (honesty): choose ink pairs from data (two regions share an ink only if they share a leading word or audio profile) and reword the caption; otherwise give each strong region a distinct screen angle or pattern so identity does not rest on a shared ink.

## Ranking
Fidelity: fresh 02 Trifid and illustrated 02 Overprint (7), darksite 01 (6.5), galaxy 01, nebula 01, illustrated 01 (6), nebula 02, fresh 01 (5), galaxy 02, darksite 02 (4).
Honesty: galaxy 02 (8), illustrated 01 (7.5), galaxy 01 (7), fresh 01 (6.5), nebula 01, fresh 02 (6), illustrated 02 (5.5), nebula 02, darksite 01 (5), darksite 02 (4).
No concept is strong on both. The honest ones colour by region identity and look like charts; the sky-like ones colour by a hand-made mood rule that contradicts some names. The cheapest route to both is a real-sky treatment with few hues (galaxy 01, darksite 01 or fresh 02) whose colour rule is derived from data, captioned in one line, and checked so that no name is contradicted by its colour (Sombre, Warm, Quiet, Aggressive, Raw are the test cases).
