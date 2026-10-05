# Part 1 regression pass by eye

Date: 2026-10-05, build of commit `6c225edd`. The states were taken again with `baseline/capture.mjs` (gpu Chrome, 1440 x 900 and the phone viewport, as the baseline) and opened one pair at a time, the baseline on the left and part 1 on the right. The pairs are saved as `app-part1/covers/<name>-baseline-left-part1-right.jpg` (phone ones start with `phone-`); the magenta bar divides the halves. Written by the implementer; the counts and the method of the full checklist are in `app-perf-part1.md`.

Nothing that part 1 does not own was found changed. In every pair the only difference is what lies behind the albums: gas where the brown pane was.

| Pair | What was looked for | What was seen |
|---|---|---|
| `map-covers-dense-fade-crop`, `retina-map-covers-dense-fade-crop` (covers in the 16 to 32 px cross-fade band, dpr 1 and 2) | The same soft, tinted, slightly see-through tiles, the same overlaps | Same tiles in the same places, same tints, same rounded corners, the same tile on top in every pile. Over this spot's dim blue-grey gas they are as easy to see as before |
| `map-covers-dense-crop` (full-size covers in the dense spot) | Opaque covers, same pile order, 2 px corners | Identical piles; no cover shows through another |
| `selected-dense-crop`, `retina-selected-dense-crop` (a pick in the dense spot) | Picked cover large with its lamp frame, the others at half alpha | Same. The half-alpha covers now let gas through instead of brown and look a little greyer |
| `selected-cover-frame-crop` (a pick on bright gas) | The same | Picked cover crisp and framed. The half-alpha covers around it are washed out by the bright gas; still recognisable |
| `album-open-dense-crop` (open album, markers pushed apart) | Seed 64 px with its ring, neighbours 46 px, badges 1 to 5, leader lines, no overlap | Identical layout, badges and frames |
| `album-open`, `slider-sonic`, `slider-mood` (album beside the panel at three stops) | Panel, slider panel, markers, lines, hint line | Panel and slider panel pixel for pixel the same; markers and badges in the same places. The thin lines from the seed and the hint line at the bottom are drawn as before but are hard to follow where they cross bright cream gas |
| `hover-map-album-crop` (hover on a dot at the overview) | Tip with cover, title and artist; paper ring on the dot | Tip identical. The ring is drawn but hard to find on bright gas, and so are today's warm dots there |
| `hover-map-cover-crop` (hover on a cover) | Tip, and the square mark 3 px outside the cover | Identical, and clear over the gas |
| `search-header-suggestions` (search open over the map) | Field with its amber focus border, three rows, the active row | Identical; the list is opaque, nothing of the gas shows through it |
| `map-covers-fade` (whole window in the cross-fade band) | Slider panel, zoom buttons, hint hidden once covers show | Same chrome; the tiles over the brightest gas are the weak spot described in `app-perf-part1.md` ("Covers over the gas") |
| `phone-album-list` | The phone list is unchanged (no map on it) | Identical to the pixel (0.0% of pixels differ) |
| `phone-album-mapmode` | Map mode: both top buttons, markers above the slider panel, zoom buttons | Same layout and markers; gas behind |
| `phone-map-covers-dense-fade-crop`, `phone-map-overview` | Tiles and dots on a phone | Same tiles and dots; gas behind |

Three things to carry into part 2, all about contrast over bright gas and none a regression of part 1's own code: the dots and the hover ring at the overview, the seed lines and the hint line, and the tiles of the cross-fade band.

Not looked at by eye: the other 168 of the 186 pairs (compared by pixel difference: 47 identical, the rest differ only inside the map pane), motion, and everything the checklist marks "Manual:".
