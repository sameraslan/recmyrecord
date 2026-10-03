# Trifid theme: what I would ship, what it costs, what you need to decide

Short version of the work in this folder. The design is in `prototype/UX.md`, the working prototype in `prototype/` (open `screens.html` first), the growth plan in `SCALING.md`, the independent reviews in `reviews/proto-*.md`.

## What I would ship

1. **The Trifid map as the site's map**, with the five fixes from the last review built in: no colour where there are no albums, dust only where albums are few, white cased lines, edge pointers for off-screen regions, and a layout rule that keeps every cover off its own line (checked on 80 layouts, none failing).
2. **Gas baked to one image per slider stop**, drawn behind the stars. It is the same picture as the live shader at about a quarter of the cost on software rendering (about 30 ms a frame against 110 to 150).
3. **Named regions as places you can use**: hover or tap a name for its evidence, click for a region card (best-known albums, neighbours), a Regions menu, a region line in the album panel, "Between A and B" for the fifth of albums in no region.
4. **Search stays an album search.** A region shows below the albums only when you type its name.
5. **The sentence as the legend**: "Every star is an album. Albums close together sound or feel alike." and the colour rule, with each colour word a toggle that isolates its family. No legend box.
6. **Trifid's cool dark chrome tokens on the site's existing type, layout and components.** With the site's amber, the slider thumb and focus rings sit on the map in the same hue as the "warm" family. Starlight white avoids that. The per-album accent stays inside the panel. Both variants are in the prototype (`chrome=site`).
7. **Regions and colours produced by the pipeline**, carried forward between builds, with names from a table you edit (`SCALING.md`).

What I would not ship yet: Sonic and Mood region names (most have no approved name), the phone map mode until it has been tried on a real phone (an independent review scored it 4.5 out of 10; the findings were then fixed, but no touch behaviour has been exercised), and star brightness by chart rank (needs the `rank` field and your approval of the claim).

## What it costs against the real three.js app

From the architecture facts in `reviews/usability.md`. Sizes are my estimate, not measured work.

| Piece | What changes | Size |
|---|---|---|
| Gas | A second mesh behind the points (z below 0), one texture per stop mixed by the existing `u_sliderT`, strength driven by cover size and focus state. Bake script in the pipeline or build. | Medium |
| Stars | A size attribute and tint attribute; hit test taught about size; soft glow needs premultiplied-alpha output so covers in the same draw stay opaque, plus one extra draw for the dark under-disc. | Medium |
| Lines, frames, badges | SVG `<path>` with two strokes; colours from tokens. | Small |
| Labels, pointers, chip | A new DOM layer placed each rendered frame, driven like `OverlayDriver`; collision and priority logic; `regions.json` loaded with positions. | Medium to large (the largest new client piece) |
| Region card, Regions menu, panel line, search rows | New components; one new route parameter. | Medium |
| Chrome tokens | CSS variables, shader constants `PAPER`/`LAMP`/`ROOM`, `CLUSTER_RGB`, `themeColor`, about 16 raw colour lines, the phone strip's literal colours. | Small to medium |
| Phone strip | Canvas 2D redraw with a small baked gas image. | Small |
| Tests | Two pixel assertions expect the amber frame and a luminance drop on dimming; idle-frame test unaffected if nothing animates. New tests for label placement and region data. | Small |
| Pipeline | `regions.py`, frozen colour projection, validation, name table, previous-regions file (`SCALING.md` sections 3 to 6). Prototype code exists in `scaling/`. | Medium |

The approved redesign spec bans blue-black and starfields; you are overriding that knowingly, so the spec needs a line saying so.

## Decisions for you

1. **Chrome**: Trifid tokens (my recommendation) or the site's warm room and amber.
2. **Theme toggle or replacement**: does Trifid replace the current look or sit beside it? A toggle roughly doubles the token and test work. I would replace.
3. **Names.** The 17 Balanced names are still placeholders. Two are weak by the data (Hypnotic Orbit, The Bittersweet Reach) and automation drops or shrinks them. Sonic needs 4 names and Mood 14 before those stops can show place names; until then they show the plain data word in capitals.
4. **Broad areas** (the level above regions, needed at 10k): name them, or leave them as plain words.
5. **Star brightness**: say that brighter means higher on the chart (and wait for `rank`), or make all stars the same.
6. **Colour families at 10k**: the five colours depend on named sound traits that new albums will not have. Pick one of the three routes in `SCALING.md` section 6. I recommend testing predicted traits first.
7. **Region size at 10k**: about 20 regions of today's size plus a finer level, or 40 small ones with much more unnamed ground. I recommend the first.
8. **Layout anchoring**: ask the 10k work to start each layout from the previous one so albums stay roughly where returning visitors left them.
9. **Home**: variant A (cover shelf kept, four region links added) or B (region tiles replace the shelf). I recommend A.
10. **Phone**: the compact one-row similarity control and tap-to-zoom in dense areas are departures from today's phone layout. Worth a device test before deciding.

## Copy that needs your approval

Everything new is listed with its location in `prototype/COPY.md`. The ones that make claims:

- The hint line: "Every star is an album. Albums close together sound or feel alike."
- The colour sentence: "Rose where the music is fierce, gold where it is warm, teal where it is quiet, blue where it is dark, violet where it is urban."
- Evidence sentences, for example "61% of albums here are tagged playful, against 21% across the map." The percentages count the full descriptor table, not only the handpicked words shown on an album.
- "Place names change with this setting." under the similarity note.
- The About section "Reading the map", including the sentence that brighter stars are higher on the chart.
- Region lines: "In Playful Way", "Between Eclectic Cloud and The Bittersweet Reach".
- All region place names, and the plain forms used for regions without one (Danceable, Instrumental, Live, Quiet).

## What has not been verified

- Nothing was tested on a real phone, in Safari, or with a screen reader. Keyboard and touch paths were checked by reading the code, not by use.
- Animation in flight (the slider morph, camera moves) was checked from frozen frames only.
- Frame times are from software rendering on this laptop, plus one reading on its GPU.
- The 10,000-album results use a synthetic cloud made from today's map.
