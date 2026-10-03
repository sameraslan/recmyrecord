# Round two — fresh lane

## Revision (after reviews/round2.md, round2-fidelity.md and REVISE2.md) — this section is current where it disagrees with the text below
Files: `01-remnant-overview.png`, `01-remnant-album.png` (Meddle), `02-trifid-overview.png`, `02-trifid-album.png` (The Stone Roses),
`02-trifid-album-b.png` (Bryter Layter, in the teal quiet territory), each with matching `.html`.

Both concepts
- **Colour rule.** My own rules (region hue order for Remnant, three word families for Trifid) are gone. Both now read
  `regions/colour.json` `album_weights_balanced_smoothed`: five family weights plus neutral per album, blurred over the map and
  mixed per pixel (weights raised to 2.3 before mixing so the leading family decides the hue). Saturation falls with the neutral
  share and when no family leads, so weak fits (Progressive Spiral, Eclectic Cloud, Ethereal Veil) come out pale or mixed.
  Regions are not used for colour or brightness; there is no per-region normalisation any more, so brighter does mean more albums.
  Trifid hues: rose `rgb(236,72,96)`, gold `rgb(246,172,60)`, teal `rgb(46,186,164)`, blue `rgb(60,116,244)`, violet
  `rgb(196,92,232)`, neutral `rgb(150,140,138)`. Remnant uses the same five at lower saturation.
- **Caption.** The shared one-line rule sits bottom-left in the overview (placeholder copy, needs approval).
- **Overview framing.** Fit to width (scale 930, centred x -0.17, y 0.2): albums and gas reach both side edges; the Live Belt runs
  off the top and Quiet Deep, Improv Arm and Hypnotic Orbit off the bottom (the user pans). Gas carries at low strength to all
  four edges and under the header through two extra wide density blurs plus a small constant; far-field colour falls to neutral.
- **Labels.** Larger capitals for strong regions (20 to 26 px), fair ones 70% size, italic, 66% opacity, no sub-line. Stars under
  a label are drawn at 6%. The evidence note is plain text under the underlined name, no plate. A label that hits the chrome
  is moved up to about 170 px rather than dropped (Aggressive Rift moves left of its centroid, clear of the slider card).
- **Album view.** Darkening is now centred on the seed (Gaussian, about 230 px sigma) and desaturates as well; cover gap raised
  to 22 px; at most eight spiked stars.

02 Trifid
- Dust is no longer tied to unnamed albums. In-between territory is lit and coloured by its own weights. Lanes are thin, sharp,
  about 90% dark, purely noise-shaped, and only appear where the gas is bright.
- Lines and rings a slightly paler mint `#befff0`.
- Checks against names in the overview: Raw Flare rose, Playful Way orange-gold, Warm Halo and Bittersweet gold, Urban Cluster
  violet, Sombre Void blue, Ethereal Veil pale blue-teal-gold mix, Lonely Drift and Pastoral teal, Progressive Spiral dull.
- Remaining weaknesses: the gold centre (Bittersweet Reach, the densest part of the map) burns to cream and carries most of the
  dust, so it dominates the overview; lanes still cross places where albums are (at album zoom one blotch near Eclectic Cloud
  is 150 px wide), which a viewer could read as a gap; Aggressive Rift's label sits on the blue-violet edge of its rose-and-blue
  blend, so it looks more "dark" than "fierce"; five regions are off-screen at this framing; in album view b covers 2 and 5 sit
  in a row to the right of the seed and the line to 2 is hidden under its own cover.

01 Remnant (reworked, kept after two iterations)
- Now grey smoke everywhere albums are, thinned and with deeper hollows, carrying up to about 60% of the local family colour
  where albums are dense, with fine broken lace over it. Lace brightness is the album density (26-thousandths-of-map blur)
  to the power 0.85; noise decides only where a filament runs and where it breaks, not how bright it is. No coloured cloud fill,
  no per-region glow. Violet now appears only at Urban Cluster.
- Album view: gas and lace fall to about 14% at the seed; white 1.5 px lines with a heavier dark casing.
- Remaining weaknesses: it is the less colourful of the two by design (dusty rose, straw, steel, sea-green) and may read as too
  grey for an owner who asked for colour; lace is clearest in the gold middle because that is where the albums are, so blue and
  rose areas show more smoke than lace; the smoke is still cottony at overview scale compared with Webb's finer wisps; and the
  overall rose-left, gold-right, teal-below layout is necessarily the same as Trifid's since both follow one rule.

---


Two new photographic-space concepts, both on the real `balanced` positions with the seventeen regions from
`regions/regions.json`. Everything is painted in Canvas 2D from the data; no pasted imagery; every star is an album.

Build: `src/build.py <remnant|trifid> <seed index or title> <album|overview> <out.html>` assembles `template.html`
(round-one nebula chrome) + `common.js/css` (labels, cover push-apart, lines, hover) + one `.js/.css` per concept.

Shared in both concepts
- **Stars.** Four coarse brightness classes from album order (first 40, to 400, to 1,500, to 3,800); the tail is drawn at the
  median class. Six-point or four-point spikes on the first ten albums only. Star colour is near-white with 30% of the cover accent.
- **Region labels.** DOM text at the centroid, letterspaced Cormorant Garamond capitals, 17 to 22 px by `n`; strong regions
  carry the plain two-word label underneath in the overview; the five fair regions are smaller, italic, 74% opacity, no sub-line.
  No plates: the lettering has a tight dark text-shadow, the gas is thinned by up to 60 to 70% in a soft ellipse under each
  name, and stars under a name are drawn at 10%. Labels move a little (22 to 90 px) to avoid each other, covers, lines and the
  chrome, and are dropped if nothing fits. In album view they drop to 62% opacity and lose the sub-line.
  Hover or tap underlines the name and shows a one-line evidence card ("61% of albums here are tagged playful, against 21%
  across the map."). Labels are a per-layout set: intended to fade out by the slider's mid-point and the next set to fade in.
- **Album view.** Gas is dimmed overall and by a further 75 to 80% in a soft disc around the chosen album and its closest
  albums. Covers are pushed at least 14 px apart; a dot marks the true star and a leader joins it to a moved cover. Lines
  have a dark casing and a soft glow. Seven rows plus "Show more".
- **No box.** The canvas runs under the header (84 to 95% scrim) and behind the panel (94 to 95% scrim); no frame or rim.
- **Idle motion.** None.
- **Theme fit.** Each is a standalone dark theme, or the "sky" half of a toggle beside Listening Room.

Copy that would ship and needs approval: the evidence sentences (two templates plus the two audio-named regions:
"Concert recordings: far more crowd and room sound than anywhere else on the map." and "The quietest corner of the map:
far lower loudness than anywhere else."). Region names and plain labels are from `regions.json` unchanged.

References actually viewed as images this session (browser pane, view only)
- Cassiopeia A, Webb NIRCam: https://esawebb.org/images/weic2330a/ — grey-lavender smoke in round wisps with hollows; coral, pink
  and white lace in broken arcs; blue-white spiked stars; black sky.
- Cassiopeia A, Chandra element map (page thumbnail only): https://chandra.harvard.edu/photo/2017/casa_life/ — each colour is a
  different element, so colour means "what it is made of".
- Crab Nebula, Hubble: https://esahubble.org/images/heic0515a/ — blue-white inner glow, green-gold then orange filament cage.
- Trifid Nebula, ESO: https://www.eso.org/public/images/eso0930a/ — pink emission lobe cut by dark dust lanes, blue reflection
  nebula beside it.
- Orion Nebula, Hubble: https://esahubble.org/images/heic0601a/ — rose, mauve and ochre gas, cream-white core, brown dust.
- Tarantula, Webb: https://esawebb.org/images/weic2212a/ — rust outer gas, cream filaments, blue cluster in a cavity.
- Also viewed and rejected: Helix (https://esahubble.org/images/opo0432d/), Stephan's Quintet
  (https://esawebb.org/images/weic2208a/), Antennae (https://esahubble.org/images/heic0615a/). See "Tried and dropped".
- Not viewed: MeerKAT / Spitzer galactic centre, Lagoon, the Veil.

---

## 01 — Remnant
Files: `01-remnant-overview.png`, `01-remnant-album.png` (seed: Meddle, Pink Floyd), matching `.html`.

**Pitch.** The collection as a supernova remnant in the manner of Webb's Cassiopeia A, with Chandra's rule that colour says
what a thing is made of. Neutral grey-lavender smoke lies wherever albums are; only the named regions carry coloured ejecta,
one hue each, as soft smoke with brighter lace and knots. Unnamed in-between territory stays grey.

- **Palette.** ground `#05060a`, panel `rgba(7,8,12,.94)`, text `#efebe4`, secondary `#b7b3ad`, tertiary `#959189`, button
  `#efe9dc` on `#101014`. Smoke `rgb(150,146,190)` at low light. Region hues (HSL hue, 80% saturation, 59% lightness; greens
  held to 50%): Warm Halo 46, Urban Cluster 36, Playful Way 25, Eclectic Cloud 17, Raw Flare 8, Live Belt 358, Epic Expanse 349,
  Aggressive Rift 338, Sombre Void 266, Hypnotic Orbit 244, Progressive Spiral 226, Ethereal Veil 206, Quiet Deep 189,
  Lonely Drift 171, Pastoral Nebula 148, Improv Arm 96, Bittersweet Reach 60. Lines and rings white.
- **Type.** Cormorant Garamond + Schibsted Grotesk, unchanged.
- **How colour comes from data.** Region identity. The order of hues is not arbitrary: regions are sorted by their angle on the
  energy/valence mood wheel (the audio z-scores in `regions.json`) and laid round the colour wheel in that order, so
  similar-feeling regions get neighbouring hues (the build asserts the order). The exact hue values were then spaced by hand so
  neighbours on the map differ. Fair regions get 75% saturation and about half the gas. Each name is lettered in a pale tint of
  its own gas, which is the only legend.
- **How structure comes from data.** Smoke = total album density at three blur radii; coloured gas = density of that region's
  member albums (normalised per region so sparse regions such as Sombre Void still show); star tint = cover accent. The wisp,
  hollow and lace patterns are noise anchored to map coordinates: decoration, not data.
- **Lines / selection / hover.** White 1.3 px lines with dark casing; seed cover in a white ring; white badges; hover ring
  and card.
- **Build cost: medium to high.** One full-screen fragment shader under the existing Points layer, fed by two small baked
  textures per layout (density; region colour and weight), with about 25 noise taps per pixel; redraw only on pan, zoom or
  slider. Cheaper route: bake the whole sky to a 2048 px texture per layout and add one detail-noise octave in the shader
  (medium). Labels, evidence cards and cover push-apart are DOM and already exist in spirit. Regions per layout are a
  pipeline step.
- **Biggest weakness.** In the overview the coloured gas reads as soft coloured clouds more than as Cas A's fine lace, so it is
  less specifically "a remnant" than the reference. Seventeen hues is close to a rainbow; the warm quarter (Warm, Urban,
  Playful, Eclectic, Raw, Live) is hard to tell apart by colour alone, and the hue spacing was tuned by hand. Violet and blue
  regions together (Sombre, Hypnotic, Progressive) drift toward the stock purple-space look in some album views.

## 02 — Trifid
Files: `02-trifid-overview.png`, `02-trifid-album.png` (seed: The Stone Roses), matching `.html`.

**Pitch.** One continuous emission-and-reflection nebula. Colour is a three-filter composite, like a Hubble-palette image, but
the three filters are families of the handpicked mood words: rose where the music is fierce, blue where it is cold or quiet,
gold where it is warm. Dark dust lanes run through the in-between albums that belong to no named region, so the named regions
read as separate glowing lobes without any border being drawn.

- **Palette.** ground `#07060a`, panel `rgba(9,8,12,.95)`, text `#f1ece4`, secondary `#bab4ac`, tertiary `#97918a`, button
  `#f1ece4` on `#121016`. Gas: rose `rgb(238,74,92)`, blue `rgb(62,118,244)`, gold `rgb(246,170,58)`; highlights roll off to
  cream; dust residue `rgb(40,24,18)`. Lines, seed ring, badges and slider knob aqua `#a8f5e4`, a colour the gas never uses.
- **Type.** Cormorant Garamond + Schibsted Grotesk.
- **How colour comes from data.** Per album, from its mood words (`d` in `albums.json`), three weights: fierce (heavy, raw,
  aggressive, angry, noisy, manic, chaotic ...), cold/quiet (sombre, lonely, cold, ethereal, nocturnal, calm, sad ...), warm
  (warm, playful, uplifting, summer, romantic, happy ...); the word lists are in `src/build.py`. The weights are blurred over
  the map and mixed per pixel, so colour is continuous and exists in unnamed territory too. Region names are not used for
  colour at all, which makes them a check on it: Aggressive Rift and Raw Flare come out rose, Sombre Void, Quiet Deep and
  Hypnotic Orbit blue, Warm Halo, Playful Way and Bittersweet Reach gold. Labels are tinted with their region's own mix.
- **How structure comes from data.** Gas brightness = album density (three radii) times billow noise; cream lift where albums
  are very dense; dust-lane strength = local share of albums with no region. Lane shapes and billows are noise.
- **Lines / selection / hover.** Aqua 1.4 px lines with dark casing and glow; seed in an aqua ring; aqua badges; hover ring.
- **Build cost: medium to high**, same shape as Remnant: one fragment shader, baked density and three-channel mood texture
  per layout (the mood texture is one RGB image, simpler than per-region colour). Needs the three word lists agreed and kept
  in the pipeline. Region labels are independent of the colour, so they can be shipped, changed or hidden without repainting.
- **Biggest weakness.** Three colours only, so the map has three kinds of place, not seventeen; mixed regions go mauve or
  brownish (Urban Cluster reads violet, Live Belt is dull because live albums are thinly tagged, Improv Arm comes out
  rose-gold from "passionate" and "energetic", which is not what jazz suggests). The family word lists are my judgement and
  need a human pass. It is also the closest of my two to the nebula lane's territory, differing in palette and in what the
  colour means rather than in kind.

---

## Tried and dropped
- **Quintet (each region its own galaxy, Stephan's Quintet).** Built and rendered: cream cores, pearl halos, coral knots,
  galaxy type from region energy against acousticness. The regions touch, so the halos merged into one grey-white fog and the
  result was the least colourful thing in the folder. Deleted.
- **Planetary-nebula "eyes" per region (Helix).** Not built: seventeen copies of one concentric motif would read as a pattern,
  the rings would look like data, and planetary nebulae do not occur in groups.

## Against the two round-one favourites
Both overviews carry more colour than Dark Site and Cosmic Cliffs and neither has a rim or frame. Album views keep the area
behind the seed and covers dark, lines are cased and in a colour the gas does not use (white on Remnant, aqua on Trifid), and
covers do not overlap. Still weaker than Dark Site in one respect: star density near the seed is lower, because both draw the
tail of the catalogue small.
