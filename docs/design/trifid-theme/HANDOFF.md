# Trifid theme: handoff

The chosen direction for a space theme on the album map, after two rounds of concept mockups and independent review (2026-10-03). Nothing in `frontcreck/` has been changed; this folder holds static mockups, the data behind them, and the reviews.

## Current state: decisions made on 2026-10-04 (read this first)

After seeing the first prototype Samer changed direction: beauty and simplicity first, "just a vibe", nothing explained. He chose from rendered option images (`options/`). This section supersedes anything below or in `RECOMMENDATION.md`, `prototype/UX.md` and `SCALING.md` that conflicts with it.

| Decision | Choice |
|---|---|
| Gas | The original mockup's swirl, ported line by line, with colour carried by the flow (`prototype/src/gas.js`, look `swirl`, called "look 2"). This look was my default; he has not objected to it. |
| Map colours | **Ember** palette on the existing five colour families (rust, cream, pale ice, blue, steel-lavender). |
| Region names | **Tenor Sans**, wide capitals. **All** names shown at Overview and Whole map, gone when zoomed in. Plain lettering: no hover, no click, no explanation. |
| Names toggle | He wants an on/off toggle for the names in the real site so he can decide later whether to keep them. |
| Site colours | **Glass**: see-through blurred panels over the map (`chrome=glass`), so the map is the main thing. Untested on a real phone; plum was his second choice. |
| Background | Near-black with a faint blue-violet cast, the same as the map's empty sky (`rgb(6,6,9)`; page `#07060a`). Not pure black, not navy. |
| Removed | The colour sentence and toggles, evidence on hover, region cards, Regions menu, edge pointers, "you are here" chip, region rows in search, region line in the album panel, "start from a place on the map" on Home, the About "Reading the map" section. Regions are an Easter egg, not navigation. |
| Kept from the earlier work | White cased lines to the closest albums, the cover layout that keeps covers off lines, the dark under-disc that keeps stars visible, gas baked once per slider stop (about 30 ms a frame on software WebGL against 110 to 150 live), nothing drawn at rest. |

Consequences for the scaling plan: names are decoration now, so the honesty gates, evidence and region navigation in `SCALING.md` matter much less. What still matters at 10,000 albums: the gas needs per-album colour weights (today from `regions/colour.json`, which depends on Spotify's named sound traits), names need positions per slider stop, and both must be regenerated when the layout changes (`scaling/` has the code).

Not verified: anything on a real phone, Safari, touch and keyboard paths, the glass blur's cost over a live WebGL canvas, animation in flight.

Next step: plan and build this in `frontcreck/`.

## Update: interactive prototype and scaling plan (2026-10-03, later session)

The asks above have been worked through. Start here:

| Path | Contents |
|---|---|
| `RECOMMENDATION.md` | What to ship, what it costs in the three.js app, the decisions still open, the copy that needs approval. |
| `prototype/` | Interactive HTML prototype on the real data. Open `screens.html` for a gallery of states with live links, `index.html` for the prototype, `phone.html` for phone frames. `UX.md` is the design and its reasoning, `COPY.md` lists every new string, `README.md` the routes and parameters. |
| `SCALING.md` | How regions, names, colours, labels and rendering stay clean to about 10,000 albums, with what was tested and what is only reasoned. |
| `scaling/` | The automated region recipe (`auto_regions.py`, `carry_forward.py`), the name table, growth and colour-family tests, and `RESULTS.md` with all numbers. |
| `reviews/proto-*.md`, `reviews/scaling-factcheck.md` | Six independent reviews of the prototype and the scaling write-up. |

The five Trifid defects listed below under "Open problems" are fixed in the prototype. `regions/merge.json` is superseded by the automated recipe. Nothing in `frontcreck/` or `data-pipeline/` was changed.

## What was chosen and why

Samer picked **Trifid**: luminous nebula gas filling the whole screen in five colours, thin dark dust lanes, region names in letterspaced capitals. See `mockups/02-trifid-overview.jpg`, `02-trifid-album.jpg`, `02-trifid-album-b.jpg`.

His stated preferences, in his words where possible:

- Space themes; "all the photography ones are sick"; Trifid "the most", "super cool".
- Colourful.
- The map must be continuous with no boundary box or frame around it.
- The whole-map view cropped to fill the screen width "is fine and good". Empty sky at the sides is also fine.
- Named regions are "a sick idea", "as long as the names are actually representative of each area".
- He does not like the lettering in the Rho Ophiuchi concept (`reference/darksite-01-rho-ophiuchi-album.jpg`), which sets region names in Cormorant Garamond italic. Keep Trifid's lettering.
- 3D is parked ("we may get to that eventually").
- Next step he asked for: expand the design, make the UX "super clean", and build HTML prototypes.

## What is in this folder

| Path | Contents |
|---|---|
| `mockups/` | The three Trifid mockups as HTML and JPG, the designer's `NOTES.md`, and `src/` (build script, template, CSS, JS). The `01-remnant` material in `NOTES.md` and `src/remnant.*` is a sibling concept that was not chosen. |
| `regions/` | `regions.json` and `regions.md`: 17 named regions on the Balanced layout with evidence. `colour.json` and `colour.md`: the five-family colour rule with per-album weights. Diagnostic plots and the scripts that built them. |
| `reviews/` | `round2-final.md` (final scores and remaining defects), `round2-fidelity.md` (likeness to real nebulae, name and colour honesty), `usability.md` (round one; has the architecture facts and performance constraints). |
| `reference/` | The briefs given to the designers, the Rho Ophiuchi album and phone frames (useful for how the real phone layout looks), the Hubble Palette overview, and `shot.sh`. |

Rebuild a mockup from the repo root:

```bash
python3 docs/design/trifid-theme/mockups/src/build.py trifid "The Stone Roses" album docs/design/trifid-theme/mockups/02-trifid-album.html
```

Modes are `album` and `overview`; the seed is an album title or index. The mockups are Canvas 2D and load cover sprites from `frontcreck/public/data/` by relative path, so open them from this folder. `reference/shot.sh` screenshots an HTML file with a headless Chromium one at a time (the laptop overheats; do not run browsers in parallel). Its browser path is machine-specific.

## How the design works

- **Positions are untouched.** Every star is an album at its real Balanced position. There are no decorative stars.
- **Colour** comes from `regions/colour.json`: each album has weights across five families derived from descriptor words and audio features together. Rose is fierce, gold is warm, teal is quiet, blue is dark, violet is urban. The gas is the smoothed blend; brighter means more albums.
- **Regions** come from `regions/regions.json`. Twelve are strong, five are fair and drawn smaller. About a fifth of albums are in no region. Hovering a name shows its evidence, for example "61% of albums here are tagged playful, against 21% across the map."
- **Nothing moves at rest.** The site's performance budget allows one idle frame.

## Open problems to solve next

From `reviews/round2-final.md`, for Trifid specifically:

1. Saturated violet and blue run to screen edges where there are no albums. Far-field gas should be neutral.
2. Black dust sits on well-populated gold areas and can read as gaps. Dust must never imply "no albums here".
3. The line casing to closest albums is teal-tinted, and teal is now a family colour. Use white or another colour no family uses.
4. With the whole-map view cropped to width, The Live Belt, The Quiet Deep, Improv Arm and Hypnotic Orbit start off screen. Edge pointers were suggested.
5. In album views some covers still line up and hide their own line.

Design questions nobody has answered yet:

- **The similarity slider.** Region names only hold on Balanced. Sonic and Mood are different layouts, so they need their own regions, names and baked gas, with a fade between stops. Only Balanced has been analysed.
- **Zoom.** How gas, dust and labels behave from whole map down to album covers (the app's range is about 80×).
- **Chrome.** Trifid has its own dark chrome. Whether to keep the site's existing panel, type and amber accent around the new map has not been decided. He dislikes the italic serif region labels, not necessarily the existing panel.
- **Other screens.** Home, About, 404, search, the Explore card, and the phone layout (a list with a 220px map strip and a Map/List pill) have not been designed in this theme.
- **Theme toggle.** Whether this replaces the current look or sits beside it.
- **Star brightness.** The mockups size stars by position in `albums.json`, which follows chart rank only for roughly the first 3,800 albums. A real build needs a rank field from the pipeline.

## Two further asks from Samer

**Think deeply about the UX in the new theme.** Not only a restyle: reconsider how the whole experience works once the map is a nebula with named regions. For example, whether regions become things you can navigate to, search for or land on; how a first-time visitor learns what the colours and names mean without a legend; how the selection, hover and album panel read over bright gas; what the home page shows; how the phone experience uses the regions.

**Design for the catalogue growing.** Scaling the map to about 10,000 albums is happening in parallel. When albums are added the layout changes, so regions, their names, the colour families and the baked gas all change with it. The design and the data process need to stay clean through that:

- Regions and names must be regenerated by the pipeline on each rebuild, with the honesty thresholds in `regions/regions.md` applied automatically, so a name disappears or changes instead of becoming untrue.
- The current regions were found by mean-shift on the 2D layout, then merged and named by hand (`regions/merge.json`). That manual step does not scale and needs automating or replacing, with a small owner-editable table from data word to approved place name.
- Decide how names stay stable for returning visitors when the map shifts: for example matching new regions to old ones by member overlap so "Urban Cluster" stays "Urban Cluster" if most of its albums are still together.
- The number of regions will change. Labels need a density rule (how many show at each zoom level, which take priority) that works for 12 regions or 40, and probably a hierarchy: a few broad areas at whole-map zoom, finer names as you zoom in.
- The five colour families came from a factorisation of the current 4,081 albums. Check whether they hold with a larger catalogue, and decide whether hues are pinned to family meaning so the palette does not reshuffle.
- Gas, dust and star rendering must hold up at 2.5 times the density: more overlap, a brighter core, smaller hit targets. Check the performance budget at 10,000 points.
- All of the above per slider position, since Sonic, Balanced and Mood are three layouts.

## Constraints

- The approved redesign spec (`docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md`) bans blue-black, purple and starfields. Samer is knowingly overriding that for this theme.
- Performance budgets in `frontcreck/scripts/perf/budgets.json`: one frame at idle, 50 ms frame gap during pan, zoom and morph. E2E tests run on software WebGL.
- The map is three.js with an orthographic camera, one instanced Points draw, and DOM/SVG overlays. `reviews/usability.md` lists what a baked background layer and a label layer would touch.
- All copy in the mockups is placeholder: region names, the colour sentence, the hover notes. Anything shipped under his name needs his approval. Site copy rules: never show the owner's name, say "4,000+" albums, never state a number of recommendations, mood words are "handpicked".
- Evidence percentages are computed on the full descriptor table, not on the handpicked words shown per album, so a user counting visible tags would get a lower number.

## History

Round one explored 21 concepts across galaxy, nebula, star chart, 3D, ocean and other nature themes. Round two narrowed to nine colourful space concepts with named regions. Trifid ranked first in the final review (beauty 9, colour 9, continuity 9). Rho Ophiuchi ranked second and is the same direction in a different texture.
