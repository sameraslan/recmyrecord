# Trifid prototype

An interactive prototype of the Trifid nebula theme for the album map. Design spec: `UX.md`. Placeholder wording: `COPY.md`. Nothing here touches `frontcreck/`.

## Open it

Open `index.html` in Chrome or Safari, straight from disk. No server, no build step, no modules. Covers come from the app's atlases by relative path (`../../../../frontcreck/public/data/`), so open it from inside the repo. To host it elsewhere, set `window.RMR_ASSETS` (first lines of `src/config.js`) to where the `atlas-N.webp` files are.

Fonts load from Google Fonts; offline it falls back to system serif and sans.

## Rebuild the data

`data/data.js` holds everything the page needs (albums, positions, recommendations, family weights, regions per stop) as one script, because `fetch()` of local files is blocked on `file://`.

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
| `#/` | Home (hero, shelf, region starting points) |
| `#/map` | The map at Overview |
| `#/map?region=<id>` | Fly to a region, region card open |
| `#/map?pick=<slug>` | An album picked on the map, Explore card open |
| `#/map?stop=sonic\|balanced\|mood` | Similarity stop on the map |
| `#/album/<slug>` | Album panel and focus on the map |
| `#/album/<slug>?by=sonic\|mood` | The same at another stop |
| `#/album/<slug>?more=1` | Ten closest albums instead of five |
| `#/album/<slug>?view=map` | Phone only: the album in Map mode. Opening another album from the name plate keeps `view=map` |
| `#/album/<slug>?region=<id>` | The album with a region card open beside it |
| `#/map?cam=x,y,ppw` | Written by the page itself when the camera settles after a pan or zoom, so a reload lands on the same view |
| `#/about` | About |
| `#/404` or anything else | Not found |

The similarity stop (`stop=` or `by=`) rides along on every route, Home, About and 404 included: every link in the page is built with the current stop and the prototype switches.

Prototype switches, on any route (the first seven persist while you navigate):

| Parameter | Meaning |
|---|---|
| `chrome=site\|trifid` | Chrome variant (default trifid) |
| `gas=baked\|live` | One pre-rendered texture per stop over the data bounds (4096 px, or the GPU's limit; default, the path that would ship), or the live shader |
| `data=10k` | Synthetic 10,000 points (Balanced only) |
| `regions=default` | With `data=10k`: the default region set instead of the finer one |
| `home=b` | Home with regions in place of the cover shelf |
| `hud=1` | Frame-time readout |
| `hulls=1` | Region hulls (debug) |
| `cam=x,y,ppw` | Explicit camera: world centre and CSS px per world unit |
| `fit=whole` | Start at the Whole map framing instead of Overview |
| `hover=<album index or region id>` | Force a hover state |
| `legend=fierce\|warm\|quiet\|dark\|urban` | Force one family isolated |
| `q=<text>` | Open the search list with a query (on a phone it opens the sheet) |
| `menu=regions\|card` | Open the Regions menu, or expand the open region card's album list |
| `focus=<region id>` | Put keyboard focus on a region name (shows the focus ring) |
| `plate=<n>` | Phone map mode: the name plate of the nth closest album, as after a first tap |
| `colours=1` | Phone: the Colours sheet open |
| `sheet=full` | Phone: the region or Explore sheet at its full height (default is the peek) |
| `morph=<0..1>&from=<stop>` | A frozen mid-morph frame from `from` to the route's stop |
| `scroll=strip` | Phone album list scrolled to the map strip |
| `then=<url-encoded hash>` | Go to that hash 1.2 s after load (shows where a transition ends) |
| `bench=1` | Programmatic pan, timed; result in `<html data-bench>` |
| `idle=1` | Frame counter at 3 s and 8 s in `<html data-idle3 data-idle8>`; `data-gl` and `data-gl3` say whether WebGL has been started (0 on the phone's album list until the strip is scrolled into view or Map is tapped) |
| `check=1` | Focus layout self-check over 40 albums at 5 and 10 closest; result in `<html data-check>` |
| `stats=1` | Labels per zoom band, cover spacing, star crowding, luminance against density (Spearman), region centroid colours, computed contrasts; result in `<html data-stats>` |

Keys: `/` focuses search (also after using the slider, and on Home), `L` hides or shows the map names (remembered), `1` `2` `3` choose Sonic, Balanced, Mood, `0` is the fit button. With the map focused: arrows pan, plus and minus zoom, comma and full stop step through the twelve albums nearest the centre and Enter selects the ringed one. Left and Right step through regions when a region card has focus. Escape closes the innermost open thing, in this order: search list, phone search sheet, Colours sheet or Regions menu, name plate, the evidence under a focused name, the region or Explore card, phone map mode (back to the list), the album, About (back to where it was opened from).

Focus: an album's title takes focus when it opens. When the album panel, a card, the Regions menu or a sheet closes, focus returns to what opened it (a region name on the map, the Regions button, the search field, the chip); if that is gone, to the region's name on the map, else to the map.

## Phone layout (under 900 px wide)

- The album view is the list. WebGL is not started and no gas is baked until the map strip scrolls into view or Map is tapped (`src/app.js` `RMR.glStart`, `src/pages.js` `Pages.watchStrip`).
- Map mode and Explore fit inside the free rectangle: between the top row (two rows beside an album) and the slider or the sheet resting on it. The rectangle is measured from the DOM (`measure()` in `src/app.js`), including the safe-area inset, and written to `Cam.free`; Overview, the whole map, region framing, album framing and the picked album all use it.
- Taps: a tap on a numbered cover, or on any album once covers are 16 px or more, shows the name plate (cover, title, artist, "Open"); a second tap or the button opens it with `view=map`. Under 16 px a tap on stars zooms one step toward the tap. On the plain map the same rule decides between the Explore sheet and a zoom step. A tap counts under 9 px of travel and 500 ms. Region names stay tappable.
- The similarity control is one row of three segments (a radio group; the desktop range input is hidden) with the note on one line under it.
- "Colours" (top row) opens a sheet with five toggle rows; it replaces the colour sentence.
- Region and Explore sheets open at a peek height; the grabber (a button; it also takes a swipe) switches to the full height. Sheets scroll, and the zoom buttons move up to stay above them.
- Ghost clicks after a touch pick are swallowed (port of the app's `lib/ghost-click.ts`). `viewport-fit=cover` is set and bottom-anchored chrome adds the safe-area inset. Names, pointers and the chip have `touch-action: none` and hand drags and pinches to the map; every other button and link has `touch-action: manipulation`. Search fields are 16 px.

None of the touch behaviour can be exercised by the headless screenshots: it needs a real phone.

The same switches are in the "Prototype" drawer on the right edge. `window.__rmr = {frames, lastFrameMs, worstFrameMs, gasMs}` is always there.

## Other pages

- `screens.html`: a labelled gallery of the key states, each with a link that opens it live.
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
| `src/regions.js` | Evidence sentences, neighbours, region card |
| `src/labels.js` | Labels, scrims, edge pointers, "you are here" chip |
| `src/search.js` | Search over albums and regions |
| `src/panel.js` | Album panel, cards, slider, hint and colour sentence |
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
tools/shot.sh '#/map?region=playful' "$PWD/shots/x.png" 1600 1000
tools/shot.sh '#/map?bench=1' --dom 1600 1000 0     # last argument 0 = real time, needed for timings
```

The browser path inside `tools/shot.sh` is machine-specific. It runs software WebGL (SwiftShader) and holds the same lock as `../reference/shot.sh`, so only one browser runs at a time. The JPG step needs PIL (`arch -x86_64 python3` on this machine).

## Not built

The search typo fallback; a persisted trail; region label watermark for broad areas (left out as clutter); a pipeline alias table for regions that move or disappear between rebuilds; audio-trait reasons ("Shares ...") at the Sonic stop; a 1,024 px gas image per stop for phones (the phone bakes the same texture as desktop, only later). Safari, a real phone and a screen reader have not been tested.
