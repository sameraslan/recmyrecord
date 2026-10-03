# Round two brief — colourful space themes with named regions

`<SCRATCH>` = `/private/tmp/claude-1247860641/-Users-saslan-19-Desktop-Tengs-reCreck-recmyrecord--claude-worktrees-galaxy-theme-ui-1e2427/11a709b0-08cc-4484-8bc8-4215cc140b27/scratchpad`

First read the round-one brief, which still applies in full (paths, data files, current UI, hard constraints, copy rules, screenshot tool, no repo edits, no WebGL, laptop-gentle): `<SCRATCH>/BRIEF.md`.

## Where we are
Round one produced 21 concepts (mockups in `<SCRATCH>/concepts/<lane>/`, each with NOTES.md and build sources you may reuse; reviews in `<SCRATCH>/reviews/final.md`, `beauty.md`, `fidelity.md`, `usability.md`). The owner has looked through them and said:

1. **Space themes only** from here. 3D is parked.
2. **Colourful.** What he liked about "Dark Site" (`concepts/hybrid/02-dark-site.png`) and "Cosmic Cliffs" (`concepts/nebula/02-cosmic-cliffs.png`) is that they are quite colourful. Look at both.
3. **Continuous map, no boundary box.** In those two, the map runs edge to edge in album view. He does NOT like the framed-chart look of Sky Atlas (`concepts/starchart/02-sky-atlas-field.png`): no border, frame, margin, graduated edge, cartouche or graticule that boxes the map in. The sky should feel like it carries on past the screen. Bleeding softly under the header and behind the panel is welcome. Do not let the album cloud read as an island with a hard glowing rim either (the "lava island" criticism of Cosmic Cliffs' overview).
4. **Named regions.** He loved areas of the map being labelled with place names, "as long as the names are actually representative of each area". We have now derived them from the data.

## Region data (use it; do not invent your own names)
`<SCRATCH>/regions/regions.json` and `regions.md` (read the md; `regions.png` is a diagnostic plot). Seventeen regions on the balanced layout, each with `name_space` (e.g. "Urban Cluster", "Improv Arm", "Aggressive Rift", "Playful Way", "Ethereal Veil", "Sombre Void", "The Quiet Deep", "Warm Halo"), `label_plain`, `strength` (strong / fair), centroid `cx, cy`, `radius`, `hull`, `n`, and an `evidence_line`; `album_region` gives each album's region id or null (22% of albums are deliberately unnamed in-between territory).
- Show the 12 strong regions; the 5 fair ones at lower emphasis or not at all.
- Labels sit at centroids, sized by `n`; regions are soft, never drawn as hard borders.
- Region identity may drive colour (each named region its own nebula hue is an obvious and good idea), but then say so in a legend-free way that is not misleading, and keep unnamed territory neutral.
- Names do not survive the similarity slider (each stop is a different layout), so design labels to fade out and in when the slider moves; do not design anything that depends on them being permanent.
- Consider the hover/tap state of a label: a one-line evidence note such as "61% of albums here are tagged playful" makes the claim checkable.
- Labels must be legible over the nebula without ugly dark smudge plates (a round-one defect), and stars must not overprint the lettering.

## What round one taught us (do not repeat these)
- Over-saturated orange where real cores and stars are cream to white; too many diffraction spikes (keep them to the brightest handful).
- Bright gas directly behind the selected album and its covers. Keep the selection area calm: dim or darken the nebula locally in album view.
- Lines to closest albums invisible or lost against same-coloured gas. They must be clearly visible (dark casing or glow, and a colour that the nebula does not use).
- Covers overlapping. Push them apart with a short leader to the true star (the real app already does this).
- Decoration that looks like data (rings, bearings, numerals). Every star is an album; no decorative background stars.
- "Brighter = higher ranked" needs a pipeline field; you may use album index in coarse classes for the first ~3,800 albums and treat the tail as median. Do not use in-degree.
- Nothing moves at idle. All beauty must be in the still frame.
- Avoid the generic purple-gradient sci-fi look. Colourful should mean the real colours of the sky: Rho Ophiuchi's blue, gold and red beside black dust; Carina's rust and steel-blue; the Hubble palette's teal and gold; Orion's rose and violet; galaxy cores cream, arms blue, H-II knots salmon.

## Deliverables (two concepts from each designer; output folder `<SCRATCH>/round2/<your-lane>/`)
For EACH concept:
1. `NN-name-overview.png` (1600x1000): the explore state, whole map, no panel, with region names. This is where the regions shine.
2. `NN-name-album.png` (1600x1000): album view with the left panel, seed, closest albums, lines, hover label, slider card, zoom buttons. Region names nearby still visible but quiet.
3. Matching `.html` for each.
Use a seed album whose neighbourhood is reasonably spread, and a different seed for each of your two concepts. Real titles, covers and mood words.
Read every PNG back and iterate at least three times; compare against the two round-one images the owner liked and make sure yours is at least as colourful and more polished. Then `NOTES.md` per concept: pitch, palette, type, how colour is derived (what data), how region labels are drawn and behave, references (URLs; say which you actually viewed as images — the built-in browser pane, tools named mcp__Claude_Browser__*, can display them if it is free; view only, no downloads), build cost against the current three.js Points + DOM overlay architecture, and the biggest weakness.
Final message: PNG paths, a two-line summary per concept, and honest weaknesses.
