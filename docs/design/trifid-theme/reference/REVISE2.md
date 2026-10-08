# Round-two revision: changes that apply to every concept

`<SCRATCH>` as in BRIEF2.md. Reviews to read for your lane: `<SCRATCH>/reviews/round2.md` (look, colour, continuity, labels, usability; defects with pixel locations) and `<SCRATCH>/reviews/round2-fidelity.md` (likeness to the real sky, and whether colour agrees with the region names). Overwrite the same filenames unless told otherwise, update NOTES.md, read every PNG back, iterate until the defects are visibly gone.

## 1. One shared colour rule (replaces your own data-to-colour rule)
Reviewers found each lane's home-made rule contradicted some region names (a "sombre · cold" region in hot pink, an upbeat region in "cold" teal, unrelated regions sharing a hue). Use the shared, validated rule in `<SCRATCH>/regions/colour.json` (explained in `colour.md`, diagnostic `colour.png`):
- Five families derived from the data: **fierce** (emission rose), **warm** (gold), **quiet** (teal), **dark** (reflection blue), **urban** (violet-mauve), plus neutral.
- `album_weights` gives every album six weights (fierce, warm, quiet, dark, urban, neutral); `album_weights_balanced_smoothed` is the version to use for gas so it does not speckle. `region_family` gives each region's weights, dominant family and fit.
- You may tune the five hues to your palette (e.g. a Carina palette can render fierce as rust-red and warm as amber; a Hubble palette can lean teal and gold) but each family must stay recognisably its own colour, the mapping must be the same everywhere in your image, and no region's colour may contradict its name. Keep urban a pinker, saturated violet so rose + blue blends (Aggressive Rift) do not collide with it; colour by leading family and use mixing for subtlety.
- Weak fits must not be drawn as a confident single colour: Progressive Spiral neutral; Eclectic Cloud a rose-gold mix, low saturation; Ethereal Veil pale blue-gold mix, never gold. The Live Belt paler than Raw Flare. Aggressive Rift and Epic Expanse duskier (they carry a lot of "dark") than Raw Flare. Playful Way toward orange-gold, Warm Halo gold toward violet.
- In-between albums outside named regions are characterful too: colour them by their weights, do not grey them out and do not turn them into dark dust lanes (dark must not mean "albums here").
- Put the rule on the map as one quiet line, bottom-left, in the overview (placeholder copy): "Rose where the music is fierce, gold where it is warm, teal where it is quiet, blue where it is dark, violet where it is urban." No other legend.
- It should still look like sky, not a chart: let families bleed and layer into each other, vary brightness with album density, keep real dark.

## 2. Whole-map view must feel continuous (the main failure this round)
Every overview showed one cloud mid-screen with empty dark bands left of x≈380 and right of x≈1180. Fix both ways:
- Frame the overview so the album cloud fills the screen width (the cloud is taller than wide: fit to width and let the top and bottom run off the screen; the user pans). The picture should have albums and gas reaching, or nearly reaching, the left and right edges.
- No outline or silhouette to the cloud: gas and dust thin out gradually and carry at low strength to all four edges and under the header, so nothing reads as an island. Far-field gas with no albums must be neutral in hue (not a family colour).
- Keep album views edge to edge as they already are.

## 3. Labels
- Strong regions clearly distinguished from the five fair ones (smaller, lighter, no sub-line).
- Lettering heavy enough that stars never overprint it: hold stars back under the glyphs and use a tight glyph-shaped shadow or soft glow, no plates.
- The hover evidence note should not be a heavy dark tooltip plate; use the format with the baseline, e.g. "61% of albums here are tagged playful, against 21% across the map."
- Sombre Void and Progressive Spiral collide at their centroids; nudge within the region.

## 4. Album view
- Selection area calm: gas darkened and desaturated within roughly 300px of the seed.
- Every line to a closest album drawn in the same clearly visible cased style, in a colour none of the five families uses (white or mint work); no grey stubs.
- Covers spread so none touch, with a leader to the true star; where several lines leave in the same direction, fan the covers so the lines do not read as a chain.
- At most eight spikes; cores cream to white, not saturated orange.
