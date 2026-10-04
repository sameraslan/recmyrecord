# Trifid prototype

An interactive prototype of the Trifid nebula theme for the album map. Wording: `COPY.md`. `UX.md` is the earlier, larger design (region cards, colour legend, Regions menu) and is partly superseded; this file describes what the prototype does now. Nothing here touches `frontcreck/`.

## Open it

Open `index.html` in Chrome or Safari, straight from disk. No server, no build step, no modules. Covers come from the app's atlases by relative path (`../../../../frontcreck/public/data/`), so open it from inside the repo. To host it elsewhere, set `window.RMR_ASSETS` (first lines of `src/config.js`) to where the `atlas-N.webp` files are.

Fonts load from Google Fonts; offline it falls back to system serif and sans.

## Rebuild the data

`data/data.js` holds everything the page needs (albums, positions, recommendations, family weights, regions per stop; the page does not use every field) as one script, because `fetch()` of local files is blocked on `file://`.

```bash
python3 docs/design/trifid-theme/prototype/build_data.py            # Balanced uses the hand-made regions
python3 docs/design/trifid-theme/prototype/build_data.py --auto-balanced   # Balanced from the automated recipe too
```

It reads `frontcreck/public/data/*.json`, `../regions/regions.json`, `../regions/colour.json` and, when present, `../scaling/out/regions_all.json` (Sonic and Mood regions; without it those stops have no regions and the map still works). Python 3 standard library only.

The same script converts `../scaling/out/synth10k.json`, when present, into `data/synth10k.js` (`window.RMR_SYNTH = {n, positions, src, regions_default, regions_fine}`), which `data=10k` uses for the Balanced stop.

## Hash parameters

Every state is in the URL hash.

| Route | Meaning |
|---|---|
| `#/` | Home (the app's hero and cover shelf over the nebula) |
| `#/map` | The map at Overview |
| `#/map?pick=<slug>` | An album picked on the map, Explore card open |
| `#/map?stop=sonic\|balanced\|mood` | Similarity stop on the map |
| `#/album/<slug>` | Album panel and focus on the map |
| `#/album/<slug>?by=sonic\|mood` | The same at another stop |
| `#/album/<slug>?more=1` | Ten closest albums instead of five |
| `#/album/<slug>?view=map` | Phone only: the album in Map mode. Opening another album from the name plate keeps `view=map` |
| `#/map?cam=x,y,ppw` | Written by the page itself when the camera settles after a pan or zoom, so a reload lands on the same view |
| `#/about` | About |
| `#/404` or anything else | Not found |

The similarity stop (`stop=` or `by=`) rides along on every route, Home, About and 404 included: every link in the page is built with the current stop and the prototype switches.

A `region=` parameter in an old link is ignored.

Prototype switches, on any route (the first seven persist while you navigate):

| Parameter | Meaning |
|---|---|
| `chrome=site\|trifid` | Chrome variant (default trifid) |
| `gas=baked\|live` | One pre-rendered texture per stop over the data bounds (4096 px, or the GPU's limit; default, the path that would ship), or the live shader |
| `data=10k` | Synthetic 10,000 points (Balanced only) |
| `regions=default` | With `data=10k`: the default region set instead of the finer one |
| `names=<number>\|all` | How many region names show at once. Default `NAMES_MAX` in `src/config.js` (9). `all` is the earlier behaviour: every region that fits, strong and fair, data words included. `0` shows none |
| `toggle=a\|b\|c` | A names on/off control (default none): `a` a fourth button on the zoom stack, `b` the same button 8 px above it, `c` the word NAMES left of the stack. A click flips `names=0`; options in `../options/toggle-*.jpg` |
| `hud=1` | Frame-time readout |
| `hulls=1` | Region hulls (debug) |
| `cam=x,y,ppw` | Explicit camera: world centre and CSS px per world unit |
| `fit=whole` | Start at the Whole map framing instead of Overview |
| `hover=<album index>` | Force the hover state of an album |
| `q=<text>` | Open the search list with a query (on a phone it opens the sheet) |
| `plate=<n>` | Phone map mode: the name plate of the nth closest album, as after a first tap |
| `sheet=full` | Phone: the Explore sheet at its full height (default is the peek) |
| `morph=<0..1>&from=<stop>` | A frozen mid-morph frame from `from` to the route's stop |
| `scroll=strip` | Phone album list scrolled to the map strip |
| `then=<url-encoded hash>` | Go to that hash 1.2 s after load (shows where a transition ends) |
| `bench=1` | Programmatic pan, timed; result in `<html data-bench>` |
| `idle=1` | Frame counter at 3 s and 8 s in `<html data-idle3 data-idle8>`; `data-gl` and `data-gl3` say whether WebGL has been started (0 on the phone's album list until the strip is scrolled into view or Map is tapped) |
| `check=1` | Focus layout self-check over 40 albums at 5 and 10 closest; result in `<html data-check>` |
| `stats=1` | Names per zoom band, cover spacing, star crowding, the names' computed contrasts; result in `<html data-stats>` |

Look switches, read once at load and carried along on every link (changing one reloads the page):

| Parameter | Meaning |
|---|---|
| `look=mockup\|swirl\|photo\|marble` | Gas treatment (`LOOKS` at the top of `src/gas.js`; default `cfg.GAS.LOOK`, `swirl`) |
| `palette=mockup\|emission\|dusty\|hubble\|ember` | Hues for the default five families (`PALETTES` in `src/gas.js`); with `scheme=`, one of that scheme's palettes |
| `scheme=<id>` | A colour scheme from `data/schemes.js` (up to six channels plus neutral per album); the file is fetched only when this is set |
| `font=<id>` | Lettering of the region names (`FONTS` in `src/labels.js`; default `cfg.NAME_FONT`, `marcellus`) |

`data/schemes.js` is written by `build_data.py` from `../colour-options/schemes.json` when that file exists.

## The gas

`src/gas.js` is the mockup's recipe (`../mockups/src/trifid.js`) as a WebGL2 shader: the same noise table, blur widths, percentile normalisers and exponential tone map. Every noise lookup is displaced along one slow flow field, which makes the swirl; the colour weights are read through the same flow, so colours interleave at their borders. Kept from the earlier build: every star is an album at its true position; colour comes from the albums near; light and colour end in plain dark sky away from the albums, with no edge; nothing is drawn at rest. Each stop is rendered once to a texture (`gas=baked`, default); `gas=live` runs the shader per frame. Dust, zoom dimming and the dimming around an open album are applied in one shared last step, so the two paths match.

## Option images

`../options/` holds the images the owner chooses from (`index.html` shows them all). `tools/options.sh <list>` renders `name|hash` lines into that folder as JPG.

Keys: `/` focuses search (also after using the slider, and on Home), `1` `2` `3` choose Sonic, Balanced, Mood, `0` is the fit button. With the map focused: arrows pan, plus and minus zoom, comma and full stop step through the twelve albums nearest the centre and Enter selects the ringed one. Escape closes the innermost open thing, in this order: search list, phone search sheet, name plate, the Explore card, phone map mode (back to the list), the album, About (back to where it was opened from).

Focus: an album's title takes focus when it opens. When the album panel or the Explore card closes, focus returns to what opened it (the search field, the map); if that is gone, to the map.

## Region names

Region names are plain lettering on the map: not buttons, no hover, no focus, no click, hidden from screen readers (`src/labels.js`). They show at Whole map and Overview and are gone once covers reach 13 px (`BAND_B`). Beside an open album only the seed's region and its two nearest neighbours can show.

- At most `NAMES_MAX` (9) at once on desktop, 4 on a phone, 8 beside an album; `names=` overrides the first.
- Only strong regions are candidates. On Sonic and Mood, only regions with an approved place name (a non-null `name` in the data); a region with only a data word shows nothing. `names=all` lifts both rules.
- Chosen by the data's priority order; a name is skipped when its centre is off screen or it would sit on chrome, a cover, a line or another name. At Overview on Balanced that leaves six.
- While the slider moves, a name travels only when its id and word match at both stops; the others fade out, then the new ones fade in.

## Phone layout (under 900 px wide)

- The album view is the list. WebGL is not started and no gas is baked until the map strip scrolls into view or Map is tapped (`src/app.js` `RMR.glStart`, `src/pages.js` `Pages.watchStrip`).
- Map mode and Explore fit inside the free rectangle: under the header (under the row with "Explore this area" and List beside an album) and above the slider or the sheet resting on it. The rectangle is measured from the DOM (`measure()` in `src/app.js`), including the safe-area inset, and written to `Cam.free`; Overview, the whole map, album framing and the picked album all use it.
- Taps: a tap on a numbered cover, or on any album once covers are 16 px or more, shows the name plate (cover, title, artist, "Open"); a second tap or the button opens it with `view=map`. Under 16 px a tap on stars zooms one step toward the tap. On the plain map the same rule decides between the Explore sheet and a zoom step. A tap counts under 9 px of travel and 500 ms.
- The similarity control is one row of three segments (a radio group; the desktop range input is hidden) with the note on one line under it.
- The Explore sheet opens at a peek height; the grabber (a button; it also takes a swipe) switches to the full height. The zoom buttons move up to stay above it.
- The hint line is desktop only.
- Ghost clicks after a touch pick are swallowed (port of the app's `lib/ghost-click.ts`). `viewport-fit=cover` is set and bottom-anchored chrome adds the safe-area inset. Buttons and links have `touch-action: manipulation`. Search fields are 16 px.

None of the touch behaviour can be exercised by the headless screenshots: it needs a real phone.

The chrome, gas, data, hulls and frame-time switches are also in the "Prototype" drawer on the right edge. `window.__rmr = {frames, lastFrameMs, worstFrameMs, gasMs}` is always there.

## Other pages

- `screens.html`: a labelled gallery of the key states, each with a link that opens it live. The pictures in `shots/` were taken before the simplification and the gas rework and have not been regenerated; the links are current.
- `phone.html`: three live 390 x 844 frames of the phone layout, loaded one after another.

## Files

| Path | What |
|---|---|
| `index.html` | Markup and script order |
| `build_data.py`, `data/data.js` | Data build and its output |
| `src/config.js` | Constants, helpers, icons, `RMR_ASSETS` |
| `src/copy.js` | App strings (`RMR.COPY`) and new placeholder strings (`RMR.TEXT`) |
| `src/data.js` | Data model, world transform, 10k adaptor |
| `src/camera.js` | Camera, framings, tweens, wheel and drag |
| `src/gas.js` | Field grids, gas shader, baked path, luminance map |
| `src/stars.js` | One additive points draw |
| `src/focus.js` | Cover layout and framing beside an album |
| `src/overlay.js` | 2D canvas: covers, lines, markers, rings |
| `src/regions.js` | Which regions sit near an album |
| `src/labels.js` | Region names on the map: which show, where, and their contrast halo |
| `src/search.js` | Search over albums and artists |
| `src/panel.js` | Album panel, Explore card, slider, hint, phone name plate |
| `src/pages.js` | Home, About, 404; phone search sheet, Map / List button, map strip |
| `src/app.js` | State, router, frame loop, input, prototype drawer |
| `src/css/app.css` | The app's chrome with tokens as variables |
| `src/css/trifid.css` | What the theme adds, and the drawer |
| `src/css/pages.css` | Home, About, 404 and the phone layout |
| `tools/shot.sh` | One headless screenshot or DOM dump at a time |
| `tools/shots_all.sh` | Regenerates every shot in `screens.html` and converts to JPG |
| `shots/` | Screenshots used by `screens.html` |

## Screenshots

```bash
tools/shots_all.sh            # all of them, serially (about ten minutes)
tools/shots_all.sh phone      # only names starting with "phone"
tools/shot.sh '#/map?names=all' "$PWD/shots/x.png" 1600 1000
tools/shot.sh '#/map?bench=1' --dom 1600 1000 0     # last argument 0 = real time, needed for timings
```

The browser path inside `tools/shot.sh` is machine-specific. It runs software WebGL (SwiftShader) and holds the same lock as `../reference/shot.sh`, so only one browser runs at a time. The JPG step needs PIL (`arch -x86_64 python3` on this machine).

## Not built

The search typo fallback; a persisted trail; audio-trait reasons ("Shares ...") at the Sonic stop; a 1,024 px gas image per stop for phones (the phone bakes the same texture as desktop, only later). Safari, a real phone and a screen reader have not been tested.
