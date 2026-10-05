# Baseline of the current site, before the Trifid retheme

Captured on 2026-10-04 from commit `1e9ef508` (branch `trifid-build`; the app code is identical to the live site). Nothing in the app was changed to make it.

| File | What it is |
|---|---|
| `capture.mjs` | Takes the same named screenshots every run. Re-run it after the retheme and compare file by file. |
| `shots/desktop/`, `shots/phone/` | The baseline screenshots (186 files). `shots/capture-log-*.json` records the URL and camera at each shot. |
| `hover-measure.mjs` | Times the hover path on the map (pointer move to tip, long tasks). |
| `perf/` | Raw output of three `npm run perf` runs and of the hover measurement. |
| `BASELINE-PERF.md` | Every performance number, per run, with medians, spread and budgets. |
| `REGRESSION-CHECKLIST.md` | 234 small things the current site gets right, each with where it is done in the code and how to check it. |

## Re-running the screenshots

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch   # must print arm64
cd frontcreck
npm ci && npm run build
node ../docs/design/trifid-theme/reviews/baseline/capture.mjs <outDir> http://127.0.0.1:3400 --start
```

`<outDir>` gets `desktop/` and `phone/`. Use a new directory after the retheme (for example `../docs/design/trifid-theme/reviews/after/shots`), not the baseline one. Options: `--viewport desktop|phone|both`, `--mode gpu|software`, `--only <part of a state name>`; without `--start` it expects a production server already answering at the URL. A full run takes about four minutes and uses one browser at a time. The script exits non-zero and leaves a `FAILED-<state>.jpg` if a state could not be reached.

How it was run for this baseline: GPU mode (headless Google Chrome 154.0.8037.93, arm64, Metal on an Apple M1 Pro), production build served by `next start`. Desktop is 1440 x 900 at dpr 1; phone is 390 x 844 at dpr 2 with mobile and touch emulation (the same descriptor the repo's e2e tests and perf script use). Full views are JPEG quality 90; crops are PNG.

What keeps it repeatable: albums are fixed by id (In Rainbows, id 11; Milestones by Miles Davis, id 1158, in one of the densest spots of the map); zoom uses the app's own steps (the fly-to that a map pick uses, the Zoom in / Zoom out / Reset buttons, the `+` and `-` keys); each state starts in a fresh browser context; waits use `window.__rmr.map`, `window.__rmr.frames`, `map.isAnimating()`, cover load state and finished CSS animations, as `frontcreck/e2e/helpers.ts` does. A second run of the map states gave byte-identical PNG crops.

What is not exactly repeatable:

- `slider-mid` is one frame 170 ms after a click on a stop. It shows the morph in progress, not a fixed frame of it.
- Covers in the panel, the tip, the card and the map markers come from Spotify's image server. On a second run a few covers differed by up to 3 levels out of 255, and `album-open-more-crop` differed in more pixels. Compare those by eye or with a tolerance.
- The text caret is hidden by an injected style so its blink cannot differ. Nothing else is injected.

After the retheme the script needs `window.__rmr` (`getState`, `map.flyTo`, `map.screenPoint`, `map.getCamera`, `map.isAnimating`, `frames`) and the class names listed in `SEL` at the top of the file. If a class is renamed, change it in `SEL` only.

## The screenshots

Names are the same in `shots/desktop/` and `shots/phone/` unless a column says otherwise. "Crop" files are PNG; the rest are JPEG.

### Home, About, 404

| File | State | Desktop | Phone |
|---|---|---|---|
| `home-top` | Home on load: hero, search (focused on desktop), the two text buttons, dimmed map with larger, fainter dots behind | yes | yes |
| `home-shelf` | Home scrolled to the bottom: the cover shelf. The site has no footer; the shelf is the last thing on the page. At 1440 x 900 the page does not scroll, so this equals `home-top` | yes | yes |
| `home-shelf-hover` | Pointer on the third shelf cover: it loses its dimming and the line above names it | yes | no |
| `about`, `about-bottom` | About, top and scrolled to the sign-off and credits | yes | yes |
| `notfound` | An unknown URL: message, search box, link to the map, over the dimmed map | yes | yes |

### Map (Explore)

| File | State | Desktop | Phone |
|---|---|---|---|
| `map-overview` | `/map` on load: the whole cloud fitted, dots only. This is the site's default view | yes | yes |
| `map-whole` | Zoom out pressed twice: the floor, 0.8 times the overview (the second press does nothing) | yes | yes |
| `map-overview-sonic`, `map-overview-mood` | The overview at the other two slider stops | yes | yes |
| `map-covers`, `map-covers-crop` | Fly-to In Rainbows: covers fully shown at 32 px | yes | yes |
| `map-covers-fade`, `map-covers-fade-crop` | One `-` key step out (1.4x): covers about 23 px, 40% through the dot to cover cross-fade | yes | yes |
| `map-covers-in1` | One Zoom in press from the fly-to zoom (1.6x): covers about 51 px | yes | yes |
| `map-covers-in2` | Two presses (2.56x): covers at their 64 px cap | yes | yes |
| `map-max-zoom` | Zoom in until it stops (zoom 28): 64 px covers spread apart | yes | yes |
| `map-covers-dense`, `map-covers-dense-crop` | Fly-to Milestones: covers overlapping each other at 32 px. The crop is the tight view of the overlap | yes | yes |
| `map-covers-dense-fade`, `map-covers-dense-fade-crop` | The same spot one `-` step out: overlapping, rounded, part dot part cover, slightly see-through. The soft look | yes | yes |
| `map-covers-dense-in2`, `map-covers-dense-in2-crop` | The same spot at the 64 px cap | yes | yes |
| `selected-dense`, `selected-dense-crop` | Milestones picked in the dense spot: large framed cover on top, every other cover at half alpha and showing through its neighbours | yes | yes |
| `selected-cover-frame`, `selected-cover-frame-crop` | In Rainbows picked by a real click or tap: cover drawn 1.8x with the lamp frame, the card, other covers dimmed | yes | yes |
| `selected-dot-ring`, `selected-dot-ring-crop` | The same pick zoomed back out to dots: the round ring with a centre dot marks it | yes | yes |
| `map-card-crop` | The Explore card (a bottom sheet on phones) | yes | yes |
| `explore-here` | "Explore this area" pressed beside In Rainbows: Explore with the camera left where the album had it | yes | yes |
| `retina-map-covers-dense-crop`, `retina-map-covers-dense-fade-crop`, `retina-selected-dense-crop` | The three overlap crops again at dpr 2 (what a MacBook screen shows) | yes | no |

### Album open

| File | State | Desktop | Phone |
|---|---|---|---|
| `album-open` | `/album/in-rainbows-radiohead`: panel open, five neighbours as covers on the map with lines and rank badges, slider, "Explore this area", hint line | yes | no |
| `album-open-crop` | Tight crop of the markers: lines, seed frame, neighbour frames, badges, anchor dots | yes | no |
| `album-panel-crop` | The panel alone: ambient wash, cover, title, buttons, mood words, rows | yes | no |
| `album-open-more`, `album-open-more-crop` | After "Show more": ten rows and ten markers | yes | no |
| `album-open-dense`, `album-open-dense-crop` | Milestones open: markers pushed apart where the albums sit on top of each other, with leader lines back to their dots (phone: in map mode) | yes | yes |
| `album-long-title` | Ziggy Stardust: the long-title type size | yes | yes |
| `retina-album-open-crop`, `retina-album-open-dense-crop` | Marker crops at dpr 2 | yes | no |
| `album-list` | Phone album view: the list | no | yes |
| `album-list-scrolled` | The list scrolled 420 px | no | yes |
| `album-list-strip`, `album-list-strip-crop` | The list scrolled to its end: the small map strip and its "Open map" bar | no | yes |
| `album-mapmode`, `album-mapmode-crop` | Phone map mode (Map button tapped): full map with markers, slider panel at the bottom, List button, "Explore this area" | no | yes |

### Hover and focus (desktop only; a phone has neither)

| File | State |
|---|---|
| `hover-map-album`, `hover-map-album-crop` | Overview, pointer on In Rainbows' dot: ring round the dot, tip with cover, title and artist up and to the right |
| `hover-map-cover`, `hover-map-cover-crop` | After the fly-to, pointer on the cover: square stroke round the cover, tip |
| `hover-map-edge` | The album moved to the top right corner: the tip flips to the left of it and below it |
| `hover-neighbour`, `hover-neighbour-crop` | Album open, pointer on the second neighbour's cover on the map: its frame, line and badge take the album's accent colour, its list row lights up, shared mood words light up |
| `hover-list-row`, `hover-list-row-crop` | Pointer on the fourth list row: the same link the other way round |
| `hover-album-other`, `hover-album-other-crop` | Album open, pointer on a map album that is not a neighbour (id 7): tip and hover mark over the dimmed field |
| `focus-skip-link`, `focus-wordmark`, `focus-search`, `focus-header-link` | Keyboard focus, reached with Tab on `/map`: skip link, wordmark, header search, the Map link. Each has a `-crop` |
| `focus-map-canvas`, `focus-slider`, `focus-zoom-button` | The map canvas (inset ring), the slider thumb (glow), the Zoom in button. Each has a `-crop` |
| `focus-card-primary`, `focus-card-close` | The Explore card's "See closest albums" and its close button. Each has a `-crop` |
| `focus-panel-close`, `focus-panel-spotify`, `focus-panel-copy`, `focus-panel-control`, `focus-panel-row-spotify`, `focus-panel-show-more`, `focus-explore-here` | Album panel: close, Open in Spotify, copy link, the first list row (inset ring; its marker lights up), a row's Spotify link, Show more, "Explore this area". Each has a `-crop` |
| `focus-home-search`, `focus-home-explore`, `focus-home-shelf` | Home: the hero search as focused on load, "Explore the map", a shelf cover (un-dimmed, named above). The last two have a `-crop` |

### Search

| File | State | Desktop | Phone |
|---|---|---|---|
| `search-suggestions`, `search-suggestions-crop` | Home, "radiohead" typed, first suggestion active after Arrow Down | yes | yes |
| `search-none` | Home, "zzkq": the no-match line | yes | yes |
| `search-typo` | Home, "lovelss": what the typo step finds | yes | yes |
| `search-header-suggestions`, `search-header-suggestions-crop` | `/map`, "in rain" in the header field, first suggestion active | yes | no |
| `search-sheet-empty`, `search-sheet`, `search-sheet-none` | Phone search sheet: just opened, with "radiohead", with "zzkq" | no | yes |

### Slider

Stops are Sonic, Balanced (default) and Mood. On phones these are taken in map mode, where the slider is.

| File | State | Desktop | Phone |
|---|---|---|---|
| `slider-balanced` | In Rainbows at the default stop | yes | yes |
| `slider-sonic`, `slider-sonic-crop` | After pressing Sonic: list, markers and map morphed; URL has `?by=sonic` | yes | yes |
| `slider-mood` | After pressing Mood | yes | yes |
| `slider-mid` | One frame 170 ms into the move from Mood to Sonic (rows fading and moving, markers and dots between positions) | yes | yes |
| `slider-keyboard-balanced` | From Sonic, Arrow Right on the focused range input: one stop | yes | no |
| `slider-crop` | The slider panel alone at Balanced | yes | yes |

### Trail and toasts

| File | State | Desktop | Phone |
|---|---|---|---|
| `trail`, `trail-crop` | Three albums visited by following list rows: "Visited" with two links and the current album | yes | yes |
| `trail-long`, `trail-long-crop` | Six visited: the trail shows the last four after an ellipsis | yes | yes |
| `toast-link-copied`, `toast-link-copied-crop` | Copy link pressed: "Link copied" | yes | yes |
| `toast-copy-failed`, `toast-copy-failed-crop` | Copy link pressed with both copy routes refused: "Could not copy. The link is ..." | yes | yes |
| `toast-surprise-error` | Home with `albums.json` blocked, "Surprise me" pressed: the load-error toast | yes | yes |

These three are every toast the site has (`showToast` is called only in `CopyLinkButton.tsx` and `HomeHero.tsx`).

### Reduced motion, errors

| File | State | Desktop | Phone |
|---|---|---|---|
| `rm-map-overview` | `/map` with `prefers-reduced-motion: reduce` | yes | yes |
| `rm-album-open` | In Rainbows open with reduced motion (phone: map mode) | yes | yes |
| `rm-album-list` | The phone list with reduced motion | no | yes |
| `rm-slider-sonic-60ms` | 60 ms after pressing Sonic with reduced motion: already the final state, no morph | yes | yes |
| `error-map` | `/map` with `albums.json` blocked: the error panel with "Try again" | yes | yes |
| `nowebgl-map`, `nowebgl-album` | WebGL turned off (`--disable-3d-apis`, Playwright's Chromium): the message on the map; the album list still works | yes | no |

## Not captured, and why

- A footer: the site has none.
- Hover and focus rings on the phone: touch has no hover (the map ignores touch for hover), and focus rings are a keyboard matter, captured on desktop.
- A WebGL context loss and the cover fallback tiles: they need a fault injected mid-session. The checklist gives manual probes.
- A deterministic mid-morph frame: the app exposes no way to hold the morph, so `slider-mid` is timed.

## Performance and hover

See `BASELINE-PERF.md`. To repeat: `npm run perf` in `frontcreck/` (three times), and

```bash
node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs <out.json> http://127.0.0.1:3500 --start
```
