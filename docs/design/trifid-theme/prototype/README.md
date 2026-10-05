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

Prototype switches, on any route (those down to `phoneglass` persist while you navigate):

| Parameter | Meaning |
|---|---|
| `chrome=glass\|plum\|trifid\|ink\|starlight\|site` | Chrome variant (default `glass`: see-through blurred panels) |
| `gas=baked\|live` | One pre-rendered texture per stop over the data bounds (4096 px, or the GPU's limit; default, the path that would ship), or the live shader |
| `data=10k` | Synthetic 10,000 points (Balanced only) |
| `regions=default` | With `data=10k`: the default region set instead of the finer one |
| `names=<number>\|all` | How many region names show at once. Default `NAMES_MAX` in `src/config.js` (17, which is every Balanced name that finds room). `all` is the earlier behaviour: every region that fits, strong and fair, data words included. `0` shows none. Without `names=` in the hash, the visitor's last choice on the names button applies (`localStorage` key `rmr-names`) |
| `toggle=a\|c\|0` | The names on/off button. Default (no parameter, option B): an icon button 8 px above the zoom stack. `a` a fourth button on the zoom stack, `c` the word NAMES left of the stack, `0` no button. A click flips `names=0` and is remembered in `localStorage` (`rmr-names`); earlier option pictures in `../options/toggle-*.jpg` |
| `twinkle=0\|1\|2` | Star glints (`src/twinkle.js`, a DOM layer; the WebGL canvas is not redrawn). `0` off, `1` one glint every 1.2 to 3 s, at most 3 alive (default), `2` one every 0.5 to 1.4 s, at most 5 alive, 1.3 times larger (for comparison only). Only at rest and zoomed out, never while covers show, off under reduced motion and in a hidden tab. See "Twinkle" below. Use `twinkle=0` for screenshots that must match |
| `deep=<0..1>\|old` | Gas strength left at full zoom (see "Deep zoom" below). Default `0.06` (`cfg.DEEP.floor`), a faint tint, the owner's pick. `0` is pure black sky, `0.025` the earlier default (barely there), `old` the earlier behaviour (strength stays at 0.3, no blur, no loss of colour) |
| `header=under\|below` | `under` (default): the map runs behind the see-through top bar. `below`: as the site is today, the map starts under the header, which has nothing behind it. The camera already frames the area under the header in both |
| `grain=0\|1` | `1` adds the site's film grain over everything (opacity .035, neutral tint). Default `0` |
| `albumname=1\|0` | Beside an open album: `1` (default) the seed's region name and up to two neighbours can show, `0` no region names at all |
| `phoneglass=1\|0` | Phone layout only: `1` (default) glass, `0` near-solid `rgba(10,9,14,.92)` header, slider row, zoom buttons and map pill with no blur |
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
| `glints=<n>` | Freeze n glints at their peak for a screenshot: even ones as glints, odd ones as magenta debug rings that must sit centred on a star. `rings=0` makes them all glints. The still shows n at once; live there are never more than 3 (5 at `twinkle=2`) |
| `twlog=1` | The twinkle timer's counters in `<html data-twlog>`: ticks, ticks skipped because the view was not at rest, ticks skipped at the cap, glints made (`spawned`), glints whose animation ran to its end (`played`), glints removed (`ended`), times the layer was cleared, and the longest star pick in ms (real time only; it reads 0 under the screenshot tool's virtual time) |
| `stats=1` | Names per zoom band, cover spacing, star crowding, the names' computed contrasts; result in `<html data-stats>` |

Look switches, read once at load and carried along on every link (changing one reloads the page):

| Parameter | Meaning |
|---|---|
| `look=mockup\|swirl\|photo\|marble` | Gas treatment (`LOOKS` at the top of `src/gas.js`; default `cfg.GAS.LOOK`, `swirl`) |
| `palette=mockup\|emission\|dusty\|hubble\|ember` | Hues for the default five families (`PALETTES` in `src/gas.js`); with `scheme=`, one of that scheme's palettes |
| `scheme=<id>` | A colour scheme from `data/schemes.js` (up to six channels plus neutral per album); the file is fetched only when this is set |
| `font=<id>` | Lettering of the region names (`FONTS` in `src/labels.js`; default `cfg.NAME_FONT`, `tenor`) |
| `seed=<int>` | Star sizes and brightness are dealt at random on each load, in a fixed mix (`cfg.STAR_MIX`: about 1% brightest, 9% bright, 27% medium, the rest small). Album order plays no part. `seed=` repeats a draw; without it every load is a fresh draw |

`data/schemes.js` is written by `build_data.py` from `../colour-options/schemes.json` when that file exists.

## The gas

`src/gas.js` is the mockup's recipe (`../mockups/src/trifid.js`) as a WebGL2 shader: the same noise table, blur widths, percentile normalisers and exponential tone map. Every noise lookup is displaced along one slow flow field, which makes the swirl; the colour weights are read through the same flow, so colours interleave at their borders. Kept from the earlier build: every star is an album at its true position; colour comes from the albums near; light and colour end in plain dark sky away from the albums, with no edge; nothing is drawn at rest. Each stop is rendered once to a texture (`gas=baked`, default); `gas=live` runs the shader per frame. Dust, zoom dimming and the dimming around an open album are applied in one shared last step, so the two paths match.

## Option images

`../options/` holds the images the owner chooses from (`index.html` shows them all). `tools/options.sh <list>` renders `name|hash` lines into that folder as JPG.

Keys: `/` focuses search (also after using the slider, and on Home), `1` `2` `3` choose Sonic, Balanced, Mood, `0` is the fit button. With the map focused: arrows pan, plus and minus zoom, comma and full stop step through the twelve albums nearest the centre and Enter selects the ringed one. Escape closes the innermost open thing, in this order: search list, phone search sheet, name plate, the Explore card, phone map mode (back to the list), the album, About (back to where it was opened from).

Focus: an album's title takes focus when it opens. When the album panel or the Explore card closes, focus returns to what opened it (the search field, the map); if that is gone, to the map.

## Deep zoom

The gas fades as covers grow, and at full-size covers the view is near-black sky with a very faint trace of the local colour. The real app should copy this exactly. It is `RMR.gasCurve` in `src/config.js`, with `cp` the cover size in px (`min(64, coverWorld * ppw)`):

| Cover size `cp` | Strength `s` |
|---|---|
| under 13 (`BAND_B`) | 1 |
| 13 to 22 (`BAND_C`) | straight line from 1 to 0.6 |
| 22 to 32 (`BAND_D`) | straight line from 0.6 to 0.3 |
| 32 to 56 (`DEEP.end`) | `0.3 + (floor - 0.3) * e`, with `u = (cp - 32) / (56 - 32)` and `e = 1 - (1 - u)^2` |
| 56 and over | `floor` = 0.06 (`DEEP.floor`; `deep=` in the hash) |

The first three rows are unchanged. The fourth is new: before, the strength stayed at 0.3. Its slope at 32 px is close to the slope before it, so there is no step.

The shader (`finish()` in `src/gas.js`) applies the strength to each colour channel as `c = 1 - (1 - c)^k`, with `k = s * dust * pool` (the same as scaling the light before the tone map), then adds the sky colour `rgb(6, 6, 9)` and the grain. Three more things follow `e` (the uniform `u_deep`), so that what is left is smooth and quiet:

- Colour: the gas is mixed toward its own grey by `0.35 * e` (`DEEP.desat`). With an album open this combines with the pool's own loss of colour as `1 - (1 - pool) * (1 - 0.35 * e)`.
- Detail: the extra noise octaves drawn past the bake's resolution are multiplied by `1 - e`. At strength 0.3 they showed as blotches on bright gas.
- Focus: the baked texture is mixed by `e` toward a blurred copy of itself, the mean of mip levels 4.5 and 6 (`DEEP.lod`; the bake is 4096 px). `gas=live` has no mips and skips this step.

The grain in `finish()` stays (it is the dither of the gas). The final pass adds half an 8-bit level of noise, because the glow it adds is a smooth sum that would otherwise band in very dark gradients.

Measured on the brightest cream gas at full zoom (1600 x 1000, software WebGL), the background is about `rgb(6, 6, 9)` at `deep=0`, `rgb(18, 17, 18)` at `deep=0.025` (the earlier default), `rgb(35, 31, 30)` at the default of 0.06 and `rgb(135, 116, 94)` before. On dimmer gas the default is closer to black.

With an album open the pool multiplies the strength by 0.6 far from the group down to 0.25 at its centre, as before, so an open album at deep zoom is darker still and never brighter. The default album framing sits under 32 px covers and is unchanged. The phone map strip, the label halos and the stars' under-discs read the gas at strength 1 and are unchanged.

## Twinkle

Now and then one star catches the light: a near-white bloom with a solid core, of radius `5.5 * r + 5` px (about 22 to 43 px across) (`r` the star's drawn radius; `TWINKLE_BLOOM`) and, on the two brightest star classes only, a thin four-point flare `12 * r` long each way (`TWINKLE_FLARE`). It eases in and out over 1.2 to 1.8 s (`TWINKLE_DUR`): opacity 0 to the peak at 40%, held to 58%, back to 0, with the scale going .4, 1, .6. The peak opacity is 1. The colour is the star's tint three quarters of the way to white. Brighter classes are likelier to be picked, by weights 12, 7, 2.5, 1 (`TWINKLE_WEIGHT`), so about one glint in three has a flare. The glint is plain near-white with alpha, which on any background equals a screen blend of white, so it shows on dark sky and on cream gas without `mix-blend-mode`.

What it costs:

- DOM: two nodes per glint (a positioned `<i>` and an animated `<b>`, the flare is its two pseudo-elements). At most 3 glints alive (5 at `twinkle=2`), so at most 6 nodes (10).
- Animation: one CSS keyframe animation per glint, on `opacity` and `transform` only, both run by the compositor.
- Timers: one `setTimeout` between glints, and one per glint as a fallback removal. No `requestAnimationFrame`, no frame loop.
- Layout: no reads. No `getBoundingClientRect`, no `getComputedStyle`. The position comes from the star positions the map already holds. The writes are one `appendChild` with inline styles and one `remove()`.
- Script per glint: one pass over the star positions to pick a star on screen (4,000 albums, 10,000 in the stress data). Nothing runs between glints.
- WebGL: never redrawn for a glint.
- While the view moves: nothing. Any camera or slider change clears the layer in the same draw, and no glint is made during a pan, a zoom, a fling, a slider morph or for 500 ms after. None is made once covers begin to show (16 px), under reduced motion, in a hidden tab, or on About.

The one place it could touch input: a tick that lands in the same frame as the first event of a gesture runs its star pass before that event is handled. `twlog=1` reports the longest pass as `worstSpawnMs`.

Hovering does not clear glints. A hover redraws the map, but `Twinkle.camera()` compares the camera, the slider position, the view size and the route with the last draw and clears only when one of them changed.

Checked in real time (Chromium 148 new headless with the Metal GPU, 1600 x 1000, 20 s each, 2026-10-04; `options/q-twinkle-live.jpg` is one glint from these runs):

| Run | Glints made | Played to the end | Most alive | Longest star pass |
|---|---|---|---|---|
| Still, 1x | 9 | 9 | 2 | 2.4 ms |
| Still, 2x | 8 | 8 | 2 | 2.3 ms |
| Mouse moving over the map, resting on it, then on the header, one wheel zoom; 1x | 11 | 10, and 1 cleared by the wheel zoom | 2 | 2.5 ms |
| The same, 2x | 10 | 10 | 2 | 3.1 ms |

No task over 50 ms started within 20 ms of a glint being made. Tasks of 60 to 160 ms do occur during the first second or two of hovering, and they occur the same with `twinkle=0`, so they belong to the hover redraw and not to the glints. With Reduce motion emulated the timer never starts and the layer is `display: none` (0 glints in 12 s). Not checked: Safari, Firefox, and the 10,000 album stress data in real time.

Before this change the glints already played correctly in real time (6 made and 6 played in 20 s) but were 15 to 28 px across at a peak opacity of 0.85, one every 2 to 5 s, and were easy to miss on bright gas.


## Region names

Region names are plain lettering on the map: not buttons, no hover, no focus, no click, hidden from screen readers (`src/labels.js`). They show at Whole map and Overview and are gone once covers reach 13 px (`BAND_B`). Beside an open album only the seed's region and its two nearest neighbours can show (`albumname=0` hides those too).

- At most `NAMES_MAX` (17) at once on desktop, 4 on a phone, 8 beside an album; `names=` overrides the first.
- Only strong regions are candidates. On Sonic and Mood, only regions with an approved place name (a non-null `name` in the data); a region with only a data word shows nothing. `names=all` lifts both rules.
- Chosen by the data's priority order; a name is skipped when its centre is off screen or it would sit on chrome, a cover, a line or another name. At Overview on Balanced at 1600 x 1000 that leaves nine.
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
- `decide.html`: the open design questions, one section each, with a comparison picture (`../options/q-*.jpg`) and links to the live states.

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
| `src/twinkle.js` | Star glints as a DOM layer, on a timer |
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
