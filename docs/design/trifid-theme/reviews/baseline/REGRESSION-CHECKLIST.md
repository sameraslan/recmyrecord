# Regression checklist: what the site gets right before the Trifid retheme

This file describes commit `1e9ef508` (app code identical to the live site). It was written by reading the code, not by running it.
How to use it: after any retheme change, go through every item, run its "Verify" step, and tick it only if the behaviour is still there. Paths are relative to `frontcreck/`. Screenshot names are base names in `shots/desktop/` and `shots/phone/` beside this file.

Conventions used below:

- "CSS px" is layout pixels; "device px" is CSS px times the device pixel ratio (dpr).
- `window.__rmr.getState()` is the app store (`src/lib/store.ts:91-93`); `window.__rmr.map` is the camera API (`src/components/map/MapStage.tsx:210-213`, methods in `src/components/map/types.ts:41-57`); `window.__rmr.frames` counts drawn frames (`src/components/map/canvas/FrameCounter.tsx:7-9`).
- Cover size on screen is `min(64, 0.0068 * canvasHeight * zoom / 1.1)` CSS px (`src/components/map/state/zoomLimits.ts:44-56`). On a 836 px tall canvas: 16 px at zoom 3.1, 24 px at 4.6, 32 px at 6.2, 64 px from 12.4 up.

---

## 1. Overlapping covers on the map (the "nice blur effect")

Short answer: there is no blur filter anywhere. The soft look comes from translucency, mipmapped texture sampling, a one-pixel antialiased edge and the grain overlay. Each part is its own item so that none is lost by accident.

Seen in the browser (baseline shots, 2026-10-04, GPU Chrome): the look the owner most likely means is the cross-fade band. One keyboard zoom step out from the fly-to zoom, covers are about 23 px, rounded, about 40% image over their cluster colour and slightly see-through, so a pile reads as soft, overlapping tinted tiles (`map-covers-dense-fade-crop`, and at dpr 2 `retina-map-covers-dense-fade-crop`). The second place is a pick in a dense spot: every other cover drops to half alpha and the pile shows through itself (`selected-dense-crop`, `retina-selected-dense-crop`). At full cover size with nothing picked, overlap is a plain hard-edged stack (`map-covers-dense-crop`, `retina-map-covers-dense-crop`). Compare all three pairs after the retheme.

- [ ] **No real blur exists; keep it that way or replace it knowingly.**
  - Sees: overlapping covers look soft and layered, never smeared.
  - How: no `blur()`, `backdrop-filter`, `mix-blend-mode` or canvas `opacity` in any stylesheet (`src/styles/map.css:6-8` is the whole canvas rule; the only CSS `filter`s are on Home shelf images `src/styles/home.css:18` and the fallback sprite `src/styles/search.css:55`). No post-processing pass: one `<points>` draw straight to the canvas (`src/components/map/canvas/AlbumField.tsx:195`).
  - Verify: `grep -rn "blur(\|backdrop-filter\|mix-blend" src` returns only `.blur()` focus calls in `SearchBox.tsx`. Compare `map-covers-dense-crop`.

- [ ] **What reads as blur, in order of weight.**
  - Sees: softness in dense areas.
  - How: (1) covers between 16 and 32 px are part cluster colour, part image and 78 to 100% opaque (`src/components/map/shaders/album.ts:153`, `:301`, `:303`); (2) trilinear mipmap sampling of 96 px atlas cells shown at 16 to 64 CSS px (`src/components/map/canvas/AtlasManager.tsx:40-42`); (3) other covers at 50% alpha while one is picked (`album.ts:69`, `:306`) and everything outside a focus at 45% (`AlbumField.tsx:26`, `album.ts:304`); (4) a one-device-pixel smooth edge (`album.ts:289`, `:296`); (5) the film grain over the whole page at 3.5% (`src/styles/shell.css:20-23`).
  - Verify: `map-covers`, `map-covers-dense`, `map-covers-dense-crop`, `selected-cover-frame-crop`, `album-open-dense`.

- [ ] **One draw call; the later album paints over the earlier one.**
  - Sees: where two covers overlap, one is cleanly on top; the same one every time.
  - How: all albums are instances of one `THREE.Points` (`AlbumField.tsx:41-65`, `:195`), drawn in instance order, which is the order of `albums.json` (top of the chart first, `src/lib/data/catalog.ts:79-84`). Within a depth layer the later instance wins because the depth test is `LessEqual` (`AlbumField.tsx:76-78`, comment `album.ts:160-164`). So the lower-ranked album of a pair is on top.
  - Verify: `map-covers-dense-crop` (same pairs, same winner). Manual: zoom to covers, note a pair, reload, same cover on top.

- [ ] **Material settings: transparent, depth write on, standard alpha blending.**
  - Sees: translucent sprites blend with what is under them; raised sprites are never painted over.
  - How: `transparent: true`, `depthWrite: true`, `depthTest: true`, `depthFunc: THREE.LessEqualDepth` (`AlbumField.tsx:70-78`). Blending is three's default normal blending with non-premultiplied shader output (`gl_FragColor = vec4(col, alpha)`, `album.ts:339`), that is source-alpha over. `frustumCulled={false}` because the geometry has a single stub vertex (`AlbumField.tsx:189-195`).
  - Verify: e2e `explore.spec.ts` "in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed". Any new material must keep all four settings or the layers below break.

- [ ] **Depth layers: who is raised above the pile.**
  - Sees: the hovered album, the picked album and the focus albums are never hidden under a neighbour.
  - How: the vertex shader puts each sprite at a z layer (`album.ts:166-175`): 0.0 everything, 0.1 focus recommendation, 0.2 hovered, 0.3 focus seed, 0.4 the picked album in cover mode. Camera at z 5, near 0.1, far 100 (`src/components/map/canvas/Scene.tsx:95-100`).
  - Verify: `hover-map-album-crop`, `selected-cover-frame-crop`. Manual: hover a half-covered cover; it comes to the front with its square mark.

- [ ] **Transparent pixels do not write depth.**
  - Sees: no square holes cut into neighbours around a round dot or a rounded cover.
  - How: `if (alpha < 0.004) discard;` (`album.ts:337-338`). Without it the empty corners of a raised sprite's quad would block the sprites behind.
  - Verify: `hover-map-album-crop` at dot zoom: neighbours visible right up to the ring.

- [ ] **Dots are 78% opaque and add up where they overlap.**
  - Sees: at the overview dense clusters look more solid than sparse areas; single dots let the background through slightly.
  - How: `DOT_ALPHA = 0.78` (`album.ts:63`), applied as `mask * mix(u_dotAlpha, 1.0, v_coverT)` (`album.ts:303`). Three dot colours by cluster `k % 3`: clay `#c4886f`, moss `#97a077`, ochre `#c8a560` (`src/components/map/data.ts:12`).
  - Verify: `map-overview`, `map-whole`.

- [ ] **Cross-fade band: covers are tinted and see-through between 16 and 32 px.**
  - Sees: as you zoom in, a dot grows into a small cover that starts as its cluster colour and gains its image; overlapping ones show a little of what is beneath.
  - How: `coverT = smoothstep(16, 32, coverCss)` (`album.ts:153`, constants `zoomLimits.ts:29-30`); colour `mix(clusterColour, atlasTexel, coverT)` (`album.ts:298-302`); alpha `mix(0.78, 1.0, coverT)` (`album.ts:303`); size `mix(dotCss, coverCss, coverT)` (`album.ts:158`).
  - Verify: unit `zoomLimits.test.ts` "cross-fades between 16 and 32 px". Manual: `__rmr.map.setCamera({x:0,y:0,zoom:4.6})` on a desktop window (covers at 24 px, half faded); compare `map-covers`.

- [ ] **Fully shown covers are opaque.**
  - Sees: from 32 px up, the top cover hides the one beneath completely; only the edge pixel is soft.
  - How: at `coverT = 1` alpha is `mask` (`album.ts:303`), and `mask` is 1 inside the shape (`album.ts:296`).
  - Verify: `map-covers-dense-crop`: no ghosting of a lower cover through an upper one.

- [ ] **Covers are sized to overlap their nearest neighbour until they reach 64 px.**
  - Sees: at middle zooms covers overlap in dense areas like a loose pile; zoomed in far they sit apart.
  - How: `COVER_WORLD = 0.0068` world units against a median nearest-neighbour gap of 0.0049 (`zoomLimits.ts:24-27`); capped at `COVER_MAX_PX = 64` (`zoomLimits.ts:32`, `album.ts:152`); `MAX_ZOOM = 28` leaves about 100 px between median neighbours (`zoomLimits.ts:13-17`).
  - Verify: unit `zoomLimits.test.ts` "sizes covers at about 1.4x the median neighbour gap" and "leaves about 100 px between median neighbours at the maximum zoom". `map-covers-dense`.

- [ ] **One-device-pixel antialiased edge, drawn in the shader.**
  - Sees: dot and cover edges are smooth at any dpr, never stair-stepped and never fuzzy by more than a pixel.
  - How: `aa = 1.0 / u_pixelRatio` (`album.ts:289`); `mask = 1 - smoothstep(-0.5*aa, 0.5*aa, sd)` on a rounded-box signed distance (`album.ts:292-296`). The renderer has no MSAA: `antialias: false` (`Scene.tsx:110`). Everything is computed in CSS px so it is the same at every dpr (`album.ts:287-288`).
  - Verify: `map-covers-dense-crop`, `selected-dot-ring` zoomed in an image viewer: one soft pixel at the edge.

- [ ] **Corner radius: a circle that becomes a 2 px rounded square.**
  - Sees: dots are round; covers have 2 px rounded corners; the shape morphs through the cross-fade.
  - How: `corner = mix(halfSize, min(halfSize, 2.0), v_coverT)` (`album.ts:291-293`).
  - Verify: `map-covers-dense-crop` (2 px corners), `map-overview` (round dots).

- [ ] **Atlas filtering: trilinear with mipmaps, no anisotropy.**
  - Sees: small covers are smooth and slightly soft, without sparkle or moire while zooming.
  - How: `minFilter = LinearMipmapLinearFilter`, `magFilter = LinearFilter`, `generateMipmaps = true` (`AtlasManager.tsx:40-42`); anisotropy is never set (three's default 1; point sprites face the screen so it would not matter). `flipY = false` (`AtlasManager.tsx:34`). Cells are 96 px, 32 per row, 1024 per sheet, no gutter (`src/lib/data/sprites.ts:8-10`, `:30-38`); the UV is clamped to the cell (`album.ts:300`). At dpr 2 a 64 px cover is 128 device px, so it is magnified 1.33x and slightly soft; below 48 CSS px it is minified through the mip chain.
  - Verify: `map-covers-dense-crop`, `selected-cover-frame-crop`. Manual: slow wheel zoom from dots to covers; no shimmering.

- [ ] **Colours go to the screen unconverted.**
  - Sees: cover and dot colours match the DOM covers and the CSS tokens.
  - How: `gl.outputColorSpace = THREE.LinearSRGBColorSpace` (`Scene.tsx:118-123`), atlas `colorSpace = THREE.NoColorSpace` (`AtlasManager.tsx:35-39`), bitmap decode with `premultiplyAlpha: "none"` and `imageOrientation: "none"` (`AtlasManager.tsx:17-18`), only `.rgb` of the atlas is read (`album.ts:260-266`), shader constants are sRGB literals (`album.ts:235-237`, `:285-286`).
  - Verify: `album-open-crop`: a marker cover (DOM) and the same album's WebGL cover in Explore have the same colour.

- [ ] **Canvas and renderer settings.**
  - Sees: the map sits on the pane colour and, beside an album, on the ambient wash.
  - How: `gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}` (`Scene.tsx:110`); clear colour transparent (`Scene.tsx:124`); `dpr={[1, narrow ? 1.5 : 2]}` (`Scene.tsx:111-113`); orthographic, `frameloop="demand"` (`Scene.tsx:93-94`). Behind the canvas: `.map-pane` background `--color-pane` `#17120e` (`src/styles/map.css:1`, `src/app/globals.css:24`) and the ambient layers (`MapStage.tsx:333-334`).
  - Verify: `album-open` (wash visible under the dots), `map-overview`.

- [ ] **Grain overlay sits over the map too.**
  - Sees: a very faint paper grain across the whole page, covers included.
  - How: `.grain` is `position: fixed; inset: 0; z-index: 150; pointer-events: none; opacity: .035` with an SVG `feTurbulence` noise (`src/styles/shell.css:20-23`), rendered in `src/app/layout.tsx:46`.
  - Verify: `map-covers-dense-crop` at 400% in an image viewer shows the noise.

- [ ] **Other covers dim to 50% while an album is picked in Explore.**
  - Sees: the picked cover stands out; the covers around it go half transparent and show each other and the background through; dots do not change.
  - How: `SELECTION_DIM = 0.5` (`album.ts:68-69`, uniform `AlbumField.tsx:88`); `v_selDim` is set for every other album (`album.ts:172`); `alpha *= mix(1.0, u_selDim, v_coverT)` so only the cover part dims (`album.ts:305-306`).
  - Verify: `selected-cover-frame`, `selected-cover-frame-crop`; e2e `explore.spec.ts` "in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed".

- [ ] **Albums outside a focus dim to 45% in album view, same size as before.**
  - Sees: beside an album the rest of the map is fainter but keeps its dot and cover sizes.
  - How: `FOCUS_DIM = 0.45` (`AlbumField.tsx:25-26`, `:91`); `v_dim = 1` for albums not in the focus mask (`album.ts:180-187`); `alpha *= u_focusDim` (`album.ts:304`).
  - Verify: `album-open`, `album-open-dense`; unit `album.test.ts` "keep their overview size, as in the mockup, and only fade (hit tests use the same size)".

- [ ] **An album whose sheet has not loaded stays a dot among covers.**
  - Sees: while cover sheets arrive, some albums are still dots; no empty or black squares.
  - How: `coverT` is multiplied by `step(0.5, atlasLoaded(a_atlasIndex))` (`album.ts:153-154`); loaded flags pushed in `AlbumField.tsx:121-133`.
  - Verify: unit `album.test.ts` "stays a dot while the album's atlas sheet is not loaded". Manual: throttle the network, zoom in fast.

- [ ] **Sprite size caps.**
  - Sees: no cover ever grows past 18% of the map height or 240 device px.
  - How: `MAX_SPRITE_VIEWPORT_FRACTION = 0.18` (`album.ts:30-33`), uniform set each frame (`AlbumField.tsx:151`), clamp in `album.ts:196-206`.
  - Verify: unit `album.test.ts` "applies the 18%-of-viewport cap" and "applies the 240 device-px cap on a high-dpr screen".

- [ ] **Hover and click in a pile pick the nearest centre, with the raised album first.**
  - Sees: the label names the album whose centre is nearest the cursor; once an album is hovered it stays hovered anywhere inside its drawn shape.
  - How: `pickAlbum` (`src/components/map/state/hitTest.ts:103-128`) checks priority albums first, in this order: the prominent picked album out to its frame, the focus seed, the current hover (`src/components/map/canvas/CursorTracker.tsx:59-65`); otherwise nearest centre within 14 px (mouse) or 24 px (touch), or half the drawn sprite if larger (`hitTest.ts:2-20`).
  - Verify: unit `hitTest.test.ts` "lets a priority album win anywhere inside its own disc" and "checks candidates in order and skips index -1".

- [ ] **The DOM focus covers (album view) never overlap at all.**
  - Sees: the seed cover and the numbered neighbour covers sit side by side with a gap, even when their albums are on top of each other on the map.
  - How: `layoutMarkers` (`src/components/map/state/focusLayout.ts:57-145`): neighbours closer to the seed than the ring radius go onto a ring (`:46-50`, `:61-79`); overlapping boxes are pushed apart along the axis of least overlap until at least `MARKER_GAP = 10` px apart, the seed moving 0.2 against 0.5 (`:93-118`); then the group is shifted and held inside the visible area (`:121-143`).
  - Verify: unit `focusLayout.test.ts` "separates a pile of eleven markers without overlaps" and "keeps a pile at an edge or a corner inside the bounds without overlaps"; `album-open-dense`.

- [ ] **Stacking of the DOM overlay layers.**
  - Sees: rank badges are always above every cover; the seed is above a hot neighbour, which is above the others; lines are under the covers.
  - How: `.mk-layer` z-index 3 with `overflow: hidden` (`map.css:73`); lines first in the layer (`src/components/map/overlays/FocusMarkers.tsx:34-41`); `.mk--seed` z 3, `.mk[data-hot]` z 2 (`map.css:84-86`); `.mk-badges` z 4 (`map.css:88-89`). Hover label z 5, selected ring z 4, controls z 6 (`map.css:10`, `:17`, `:19`).
  - Verify: `album-open-crop`, `hover-neighbour`.

---

## 2. Hover on the map

- [ ] **Hover label content.**
  - Sees: a small card with a 40 px cover, the title in serif and the artist under it.
  - How: `src/components/map/overlays/HoverLabel.tsx:31-43`; style `.map-tip` (`map.css:9-16`): max-width 290 px, padding `8px 12px 8px 8px`, background `--color-float`, 1 px `--color-rule-2` border, radius 2 px, shadow `0 10px 28px -10px rgba(0,0,0,.8)`; title 18 px/600 serif, artist 13 px dust. `aria-hidden="true"`.
  - Verify: `hover-map-album`, `hover-map-album-crop`.

- [ ] **80 ms settle before the label and mark appear.**
  - Sees: sweeping the mouse across the map does not flash labels; resting on an album shows it almost at once.
  - How: `DURATION.hoverLabel = 80` (`src/lib/media.ts:7`); timer in `CursorTracker.tsx:224-229`, cleared whenever the target changes (`:218-220`).
  - Verify: e2e `map.spec.ts` "hover shows a label, drag pans, wheel zooms, click selects and flies". Manual: fast sweep shows nothing.

- [ ] **Label placement and edge avoidance.**
  - Sees: the label sits up and to the right of the album and never leaves the visible map or slips under the album panel.
  - How: `src/components/map/canvas/OverlayDriver.tsx:36-47`: 16 px right, `height + 12` px above the album's point; flips to the left when it would pass 8 px from the right edge; drops to 18 px below when it would be less than 8 px from the top; then clamped to `visibleArea(insetLeft, width, height, 8)` (`src/components/map/state/projection.ts:72-76`).
  - Verify: Manual: hover albums in each corner of the map; the label stays 8 px inside. `hover-map-album`.

- [ ] **Label size is measured once per content change, not per frame.**
  - Sees: no jank while moving the mouse.
  - How: `HoverLabel.tsx:14-19` measures after each hover change; a `ResizeObserver` catches late web fonts (`:20-30`); the driver reads the cached size (`OverlayDriver.tsx:37-38`).
  - Verify: perf budget `frameGapMs` 50 in `scripts/perf/budgets.json`.

- [ ] **Label shows and hides at once (no fade), and is hidden when empty.**
  - Sees: the label appears and disappears without animation.
  - How: opacity is set directly to `'1'` or `'0'` (`OverlayDriver.tsx:34`, `:47`); `.map-tip` has no transition (`map.css:9-12`); `.map-tip:empty { display: none; }` (`map.css:13`).
  - Verify: Manual: move off an album; the label is gone in the same frame.

- [ ] **No hover right after a click until the mouse moves 4 px.**
  - Sees: after clicking an album and the map flying, the album that slides under the resting cursor does not pop a second label.
  - How: `HOVER_RESUME_MOVE_PX = 4` (`CursorTracker.tsx:17-19`); set on mouse press (`:129-134`), released on a move further than 4 px (`:141-147`), applied in the frame (`:201-203`).
  - Verify: Manual: click an album in Explore and keep the mouse still; only the card shows.

- [ ] **Touch never hovers.**
  - Sees: on a phone no hover ring or label ever appears; a tap goes straight to the card or the album.
  - How: touch pointer events return early (`CursorTracker.tsx:130`, `:136-140`, `:153`).
  - Verify: e2e `map.spec.ts` "tap selects an album".

- [ ] **Hover follows the camera under a resting mouse.**
  - Sees: when the map moves under a still cursor (fly-to, zoom buttons), the hovered album updates.
  - How: the cursor is kept in canvas px and re-projected each drawn frame (`CursorTracker.tsx:69-81`, `:176-193`).
  - Verify: Manual: rest the mouse on the map and press `+` on the keyboard with the canvas focused.

- [ ] **Cursor shape.**
  - Sees: open hand over the map, closed hand while dragging, pointer over an album or marker.
  - How: `.map-canvas { cursor: grab }`, `:active { cursor: grabbing }` (`map.css:6-7`); inline `cursor: pointer` when something is under the mouse (`CursorTracker.tsx:216`), cleared otherwise (`:188`).
  - Verify: Manual.

- [ ] **Hover mark on a dot: a paper ring of radius 7 with a paper core.**
  - Sees: a hovered dot turns paper-coloured with a thin ring round it.
  - How: gap `max(7 - 0.5 * baseCss, 3)` so the ring radius is 7 CSS px for small dots (`album.ts:191-193`); ring stroke 1.5 px (`:332`); core radius `max(0.5 * dot, 2.2)` fading out as the cover fades in (`:329-331`); alpha 0.95; colour `PAPER #ede5d5` (`:235`); the sprite quad grows to at least 17 px to hold the ring (`:194`).
  - Verify: `hover-map-album-crop` at overview zoom.

- [ ] **Hover mark on a cover: a square stroke 3 px outside it.**
  - Sees: a hovered cover gets a thin paper square frame with sharp corners, and comes to the front.
  - How: `markGap` shrinks to 3 px at `coverT = 1` (`album.ts:193`); mark corner `mix(markHalf, 0.0, v_coverT)` so the ring morphs into a square through the cross-fade (`:325-328`); stroke 1.5 px, alpha 0.9 (`:332`); layer 0.2 (`:168`). The cover itself does not change size.
  - Verify: `hover-map-album-crop` at cover zoom.

- [ ] **The hover mark gets its own frame.**
  - Sees: the ring appears even when nothing else is moving.
  - How: `invalidate()` when the hover uniform changes (`AlbumField.tsx:173-179`) and after the 80 ms timer (`CursorTracker.tsx:228`).
  - Verify: Manual: with the map idle, rest on a dot; the ring shows.

- [ ] **Hover ends when the map stops taking input or the mouse leaves.**
  - Sees: going to Home or About, or moving off the canvas, clears the label and ring.
  - How: `CursorTracker.tsx:152-156` (pointerleave), `:178-190` (non-interactive route).
  - Verify: Manual: hover an album in Explore, press the wordmark link with the keyboard; no label remains on Home.

- [ ] **Hover in album view: a neighbour cover lights up at once and gets a side label.**
  - Sees: hovering a numbered cover highlights it immediately (no 80 ms wait) and shows the label to its right, vertically centred.
  - How: marker boxes are hit-tested first (`CursorTracker.tsx:198-205`, `focusLayout.ts:152-164`, slack 4 px mouse, 8 px touch); immediate hover (`CursorTracker.tsx:221-223`); label 14 px right of the drawn cover, flipped left if it would leave the area, clamped (`src/components/map/canvas/MarkerDriver.tsx:91-104`); the Explore placement skips focus albums (`OverlayDriver.tsx:33`).
  - Verify: `hover-neighbour`; e2e `focus.spec.ts` "hot album is highlighted and a hovered marker shows its label".

---

## 3. Selection in Explore and the card

- [ ] **Dot mode: a lamp ring drawn in the DOM.**
  - Sees: a picked dot gets an amber circle round it with a small amber centre.
  - How: `.map-sel` (`src/components/map/MusicMap.tsx:11-22`; `map.css:17-18`): 2 px `--color-lamp` border, round, 5 px centre dot; size `max(18, sprite + 8)` px, centred on the album each frame (`OverlayDriver.tsx:60-75`).
  - Verify: `selected-dot-ring`.

- [ ] **Cover mode: the shader draws the picked cover large with a lamp frame.**
  - Sees: once covers show, the picked cover is 1.8 times larger (at least 64 px), on top of everything, with a 2 px amber frame 4 px outside it and a 1 px dark line between.
  - How: constants `SELECTED_SCALE 1.8`, `SELECTED_MIN_PX 64`, `SELECTED_FRAME_GAP_PX 4`, `SELECTED_FRAME_PX 2` (`album.ts:53-61`); size `album.ts:190`, `:195`; frame and `ROOM #15110d` backing `album.ts:307-316`; layer 0.4 (`:173`); when the size cap bites, the frame keeps its size and the cover gives way (`:199-202`).
  - Verify: `selected-cover-frame`, `selected-cover-frame-crop`; unit `album.test.ts` "is at least 64 px, then 1.8 times the cover" and "keeps its frame inside the viewport-relative sprite cap".

- [ ] **The switch between ring and frame happens at half fade, and only with the sheet loaded.**
  - Sees: never both marks at once, never neither.
  - How: `selectedIsProminent` is `loaded && coverFade > 0.5` (`album.ts:71-74`), the same test in the shader (`album.ts:171`) and for the DOM ring (`OverlayDriver.tsx:64-66`).
  - Verify: unit `album.test.ts` "is prominent only once covers are more than half faded in, and only with its atlas sheet". Manual: pick a dot, zoom in slowly.

- [ ] **A click or tap picks the album and flies to it.**
  - Sees: the card opens and the map glides to the album, zooming in until covers are fully shown; it never zooms out.
  - How: `MapStage.tsx:294-302` (pick), `:262-276` (fly once the card is measured on phones); `flyTarget` zooms to `max(current, zoom for 32 px covers)` (`src/components/map/canvas/CameraTween.tsx:67-85`); `FLY_MS = 450`, ease-out cubic (`CameraTween.tsx:18`, `:113`, `:177-183`).
  - Verify: e2e `map.spec.ts` "hover shows a label, drag pans, wheel zooms, click selects and flies".

- [ ] **Click thresholds: a drag is not a click.**
  - Sees: dragging the map never opens an album; a long press on a phone does nothing.
  - How: `MOUSE_MOVE_PX 5`, `TOUCH_MOVE_PX 9`, `TOUCH_MAX_MS 500` (`src/components/map/canvas/PickController.tsx:13-15`, `:39-41`); a second finger or a non-primary button cancels (`:26-31`).
  - Verify: e2e `focus.spec.ts` "a drag that starts on a cover pans the map".

- [ ] **Clicking the picked album again flies back to it.**
  - Sees: after panning away, a click on the same album re-centres it.
  - How: `MapStage.tsx:298`.
  - Verify: Manual.

- [ ] **Clicking empty map closes the card.**
  - Sees: the card goes away and nothing is picked.
  - How: `PickController.tsx:63-64` calls `onEmpty`; `MapStage.tsx:308-310`.
  - Verify: e2e `explore.spec.ts` "the card closes with its button, with Escape and with a click on empty map".

- [ ] **The Explore card.**
  - Sees: bottom left, 400 px wide: an 88 px cover, the title in 26 px serif, the artist, "See closest albums" (amber) and "Spotify" (outlined, opens a new tab), and a close cross.
  - How: `src/components/map/overlays/MapCard.tsx:13-39`; `.card` (`map.css:60-69`); `role="region"` labelled "{title} by {artist}"; the Spotify link carries a hidden "(opens in a new tab)". The primary link keeps the current slider stop (`MapCard.tsx:23`).
  - Verify: `selected-dot-ring` or `selected-cover-frame` (card in frame); e2e `explore.spec.ts` "explore shows the hint, focuses its heading after in-app navigation, and a pick opens the card".

- [ ] **The card rises in on every pick.**
  - Sees: each newly picked album's card fades up 6 px over 0.3 s.
  - How: `animation: rise .3s var(--out) both` (`map.css:61`, keyframes `:70`); `key={selected}` remounts the card (`MapStage.tsx:363-364`).
  - Verify: Manual: pick two albums in a row.

- [ ] **No Spotify button for an album without a Spotify release.**
  - Sees: the card shows only "See closest albums".
  - How: `MapCard.tsx:26`; `spotifyUrl` returns null for an empty id (`catalog.ts:66-69`).
  - Verify: e2e `explore.spec.ts` "an album with no Spotify id shows the card without the Spotify action".

- [ ] **The hint line gives way to the card and to covers.**
  - Sees: "Albums that sit close together sound or feel alike." at the bottom left, gone while a card is open or once covers show, back at the overview.
  - How: `src/components/map/overlays/MapHint.tsx:9-22`; `.map-hint` fades in 0.25 s with a soft text shadow (`map.css:58-59`); `data-zoomed` set when `coverFade > 0.25` (`OverlayDriver.tsx:51-58`); starts from the last drawn state on mount (`MapHint.tsx:16-17`, `src/components/map/state/overlayEls.ts:41-51`); not rendered while the data is missing (`MapStage.tsx:360-361`).
  - Verify: e2e `explore.spec.ts` "the hint hides once covers show and returns at the overview" and "the hint stays hidden over covers after a trip to About and back".

- [ ] **Selection belongs to Explore only.**
  - Sees: leaving Explore drops the card; album view never shows the amber ring.
  - How: `MapStage.tsx:193` (input), `:227-230` (dropped on leaving); `AlbumField.tsx:163-164`.
  - Verify: e2e `explore.spec.ts` "leaving an album by the header nav leaves the album state clean and frames the whole map".

- [ ] **Reset with a card open goes to the picked album.**
  - Sees: the reset button re-centres the picked album instead of the whole map.
  - How: `CameraTween.tsx:107-112`.
  - Verify: Manual: pick, pan away, press the third zoom button.

---

## 4. Dots turning into covers by zoom

- [ ] **Dot size grows gently: 3 px at the overview, about 7 px as covers start.**
  - Sees: dots are small at the whole-map view and a little larger as you zoom in.
  - How: `clamp(1.8 + pxPerWorld * 0.0068 / 3.15, 3, 7.2)` (`zoomLimits.ts:36-42`, `:73-76`; shader `album.ts:151`).
  - Verify: unit `zoomLimits.test.ts` "grows dots gently with the map scale, from 3 px to about 7 px as covers start, at most 7.2"; `map-overview`.

- [ ] **Cover size is linear in the map scale and capped at 64 px.**
  - Sees: covers grow with zoom, then stop growing and spread apart.
  - How: `coverCssPx` (`zoomLimits.ts:53-56`), shader `album.ts:152`.
  - Verify: unit `album.test.ts` "caps covers at 64 px".

- [ ] **Cover sheets load only when covers are about to show.**
  - Sees: the overview loads no cover images; the first zoom-in fetches them.
  - How: `ATLAS_LOAD_PX = 13` (`zoomLimits.ts:33-34`); gate in `AtlasManager.tsx:243-248`.
  - Verify: e2e `pages.spec.ts` "the first load requests no thumbnail sprite and no map atlas, shelf included".

- [ ] **Sheets load one at a time, the most visible first.**
  - Sees: covers on screen arrive before covers off screen.
  - How: sheet 0 first, then whichever unloaded sheet has most albums on screen, recounted after each load (`AtlasManager.tsx:82-110`, `:184-208`, `:237-240`).
  - Verify: Manual with a throttled network: the area in view fills first.

- [ ] **A failed sheet does not block the rest.**
  - Sees: if one sheet fails, its albums stay dots and the others still load.
  - How: `AtlasManager.tsx:230-236`.
  - Verify: Manual: block `/data/atlas-1.webp` in dev tools, zoom in.

- [ ] **A sheet arriving draws a frame by itself.**
  - Sees: covers pop in without having to move the mouse.
  - How: `invalidate()` in `AlbumField.tsx:120-133`; `requestRender()` in `AtlasManager.tsx:228`.
  - Verify: Manual: zoom in with the buttons and take hands off.

- [ ] **Hit areas follow what is drawn.**
  - Sees: the whole cover is clickable once covers show; an album still drawn as a dot has a dot-sized target.
  - How: `renderedSpriteCssSize` mirrors the shader (`album.ts:35-51`); per-album radius by sheet state (`CursorTracker.tsx:40-46`, `:58`).
  - Verify: unit `hitTest.test.ts` "uses each album's own radius".

---

## 5. Album view: marker and neighbour layout

- [ ] **Marker sizes: seed 64 px, neighbours 46 px.**
  - Sees: the album's own cover is larger than its numbered neighbours.
  - How: `MARKER_SIZE = { seed: 64, rec: 46 }` (`focusLayout.ts:7`); rendered with `Cover` at those sizes, eagerly loaded (`FocusMarkers.tsx:52`).
  - Verify: `album-open-crop`; unit `focusLayout.test.ts` "leaves well separated markers on their anchors and sizes the seed".

- [ ] **Neighbours too close to the seed go onto a ring round it.**
  - Sees: no neighbour cover hides under the seed cover; a tight cluster fans out in a circle.
  - How: ring radius `max(seed/2 + rec/2 + 22, recs * (rec + 16) / (2π))`, 77 px for up to 7 neighbours, 99 px for 10 (`focusLayout.ts:46-50`); albums within 3 px of the seed are spread evenly starting at the top (`:70-75`).
  - Verify: unit `focusLayout.test.ts` "pushes a recommendation sitting on the seed out to a ring" and "is 77 px for a few recommendations and grows so that ten fit"; `album-open-dense`.

- [ ] **Markers stay inside the visible map, 8 px from its edges.**
  - Sees: covers and badges are never cut off by the map edge, the album panel or (phones) the slider panel.
  - How: `MARKER_EDGE = 8` (`MarkerDriver.tsx:13-14`); bounds from `visibleArea` and `bottomCover` (`:44-55`); wall handling in `focusLayout.ts:81-92`, `:121-143`.
  - Verify: e2e `focus.spec.ts` "focus draws numbered covers joined to the seed, framed on screen" and "on a phone the focus markers stay above the slider panel".

- [ ] **A displaced cover keeps a leader line to its true position.**
  - Sees: a thin line from a cover that was moved back to a small dot where the album really is.
  - How: leader shown when the cover is more than `LEADER_MIN_PX = 6` px from its anchor (`MarkerDriver.tsx:15-16`, `:84-89`); stroke `rgba(237,229,213,.35)` 1 px (`map.css:77`).
  - Verify: `album-open-dense`, `album-open-crop`.

- [ ] **Anchor dots under the focus albums.**
  - Sees: a small paper-coloured dot at each focus album's true map position.
  - How: the shader draws focus albums as a 5 px dot, `PAPER` at alpha 0.8, never as a cover (`album.ts:180-184`, `:317-320`); they are excluded from the hover mark (`:189`).
  - Verify: `album-open-crop`.

- [ ] **Cover styling on the map: hairline, drop shadow, seed ring.**
  - Sees: each neighbour cover has a faint 1 px light edge and a small hard shadow; the seed has a 2 px ring in the album's accent colour, 3 px away from the cover.
  - How: `.mk .cover { box-shadow: 1px 3px 0 rgba(10,8,6,.55) }` (`map.css:80`); `.mk::after` hairline `rgba(237,229,213,.28)` (`map.css:83`); `.mk--seed::after { inset: -5px; border: 2px solid var(--acc) }` (`map.css:85`). Square rings on purpose (`map.css:81-82`).
  - Verify: `album-open-crop`.

- [ ] **The camera frames the seed and its visible neighbours with room for the covers.**
  - Sees: opening an album fits its covers into the map area, clear of the slider card and the zoom buttons.
  - How: `focusCamera` (`focusLayout.ts:194-247`): fits true positions, then lays the markers out and zooms out up to 6 rounds until their boxes fit, at most 0.5x; a tight cluster is treated as spanning at least 0.15 world units (`:166-171`). Padding `DESKTOP_PADDING { top: 262, right: 96, bottom: 90, left: 96 }`, phone `{ top: 80, right: 60, bottom: slider + 4, left: 60 }` (`MapStage.tsx:26-37`, `:181-187`).
  - Verify: unit `focusLayout.test.ts` "frames spread albums inside the padded area right of the inset" and "zooms out so a tight cluster pushed onto the ring still fits"; `album-open`.

- [ ] **The map shifts right of the album panel, and follows it while it slides.**
  - Sees: the framed albums are centred in the visible map, not behind the panel; as the panel slides in the map glides with it.
  - How: panel width published as `panelInset` (`src/components/album/usePanelInset.ts:12-31`); view offset in `applyFrustum` (`src/components/map/canvas/InitialFrame.tsx:23-35`); inset tween 400 ms ease-out cubic (`CameraTween.tsx:156-168`, `DURATION.panel` in `media.ts:7`); markers use the animated inset (`MarkerDriver.tsx:45-47`); controls follow via `.map-ui { transition: left var(--dur) var(--out) }` (`map.css:19`, `MapStage.tsx:354`).
  - Verify: e2e `album.spec.ts` "the map stays right of the panel and a map click goes to that album"; unit `screen.test.ts` "draws camera.position at the centre of the area right of the inset, at every zoom".

- [ ] **The framing follows "Show more" and the slider, unless you moved the map.**
  - Sees: showing rows 6 to 10 adds their covers and reframes; after you pan or zoom yourself, the map stays where you put it until Reset.
  - How: focus is the visible rows (`src/components/album/AlbumPanel.tsx:38-40`, `:60-62`); `FocusFramer` reframes on any change of seed, rows, stop, inset or padding unless `lastCameraGrab` is newer than the focus or the last Reset (`src/components/map/canvas/FocusFramer.tsx:8-39`); a new seed always frames; Reset re-arms (`CameraTween.tsx:107-110`).
  - Verify: e2e `focus.spec.ts` "a zoom from the buttons survives a stop change until Reset re-arms the focus framing"; e2e `flows.spec.ts` "show more".

- [ ] **Markers appear only once placed.**
  - Sees: no cover flashes at the top-left corner before jumping into place.
  - How: `visibility: hidden` until `MarkerDriver` positions them (`FocusMarkers.tsx:12`, `:48-49`, `:62`; `MarkerDriver.tsx:67`, `:71`).
  - Verify: Manual: open an album from Home and watch the map.

- [ ] **A drag or pinch that starts on a cover still moves the map.**
  - Sees: covers do not block panning.
  - How: `.mk { pointer-events: none }` (`map.css:78-79`); the canvas hit-tests the placed boxes (`overlayEls.ts:29-39`, `PickController.tsx:51-60`).
  - Verify: e2e `focus.spec.ts` "a drag that starts on a cover pans the map".

- [ ] **Clicking a neighbour cover opens that album; clicking the seed does nothing.**
  - Sees: a click on cover 3 goes to album 3, keeping the slider stop.
  - How: `MapStage.tsx:303-306`; hover is cleared first because the marker is about to move (`PickController.tsx:54-59`).
  - Verify: e2e `focus.spec.ts` "clicking a marker picks its album"; e2e `flows.spec.ts` "map click to album".

- [ ] **Clicking any other album on the map beside an album opens it too.**
  - Sees: the hint says "Select one to start from it", and a click on a dimmed dot navigates.
  - How: same `onPick` branch (`MapStage.tsx:303-306`); hint copy `COPY.map.hintAlbum` (`src/lib/copy.ts:64-65`, `MapStage.tsx:361`).
  - Verify: e2e `album.spec.ts` "the map beside an album shows the hint line on desktop, as in the mockup".

- [ ] **The marker layer is hidden from assistive technology.**
  - Sees: screen readers and the Tab key reach these albums through the list, not the map covers.
  - How: `aria-hidden="true"` on `.mk-layer` (`FocusMarkers.tsx:33`), comment `:14-18`.
  - Verify: e2e `a11y.spec.ts` "open states pass axe".

---

## 6. Lines, rank badges and the two-way hot link

- [ ] **A line from the seed to every neighbour cover.**
  - Sees: thin light lines join the seed cover to each numbered cover.
  - How: one `<line data-to>` per neighbour (`FocusMarkers.tsx:34-37`), set from cover centre to cover centre each frame (`MarkerDriver.tsx:76-83`); stroke `rgba(237,229,213,.22)`, 1 px, round caps (`map.css:74-75`).
  - Verify: `album-open-crop`; e2e `focus.spec.ts` "focus draws numbered covers joined to the seed, framed on screen".

- [ ] **Rank badges 1 to n at each cover's top-left corner.**
  - Sees: a small dark square with the rank number, 6 px up and left of the cover's corner, above every cover.
  - How: `BADGE_OFFSET = 6` (`MarkerDriver.tsx:17-18`, `:68-72`); `.mk-n` min 18 x 18 px, `--color-float` background, 1 px `rgba(237,229,213,.35)` border, 600 11 px sans (`map.css:90-93`); own layer (`FocusMarkers.tsx:55-67`).
  - Verify: `album-open-crop`.

- [ ] **Hovering or focusing a list row lights its cover on the map.**
  - Sees: the row's cover on the map grows by 16%, gets a 2 px accent ring 2 px outside it, its line turns accent and thicker, and its badge turns accent with dark digits.
  - How: row sets `hot` on mouse enter and focus, clears on blur and when the mouse leaves the list (`src/components/album/RecRow.tsx:22-24`, `src/components/album/RecList.tsx:20`); `isHot` (`FocusMarkers.tsx:30`); `HOT_SCALE = 1.16` (`MarkerDriver.tsx:12`, `:59`); `.mk[data-hot]::after { inset: -4px; border: 2px solid var(--acc) }` (`map.css:86-87`); hot line `stroke: var(--acc); stroke-opacity: .9; stroke-width: 1.5` (`map.css:76`); hot badge (`map.css:94-95`).
  - Verify: `hover-list-row`; e2e `album.spec.ts` "rows and map markers highlight each other and light shared tags".

- [ ] **Hovering a cover on the map lights its list row.**
  - Sees: the row gets a faint lighter background and a 2 px accent bar on its left.
  - How: map hover calls `setHot` in album view (`MapStage.tsx:291-293`); `.rec.hot` (`RecRow.tsx:13`, `:17`; `src/styles/album.css:43-45`), 0.22 s transitions (`album.css:41`, `:43`).
  - Verify: `hover-neighbour`; same e2e test as above.

- [ ] **The hot row lights the mood tags it shares with the seed.**
  - Sees: the seed's mood tags that the hovered album also has turn bright with an accent border and a faint accent fill.
  - How: `lit` set from the hot row's shared words (`AlbumPanel.tsx:41-42`); `.tags li.lit` with `color-mix(in srgb, var(--acc) 16%, transparent)` and 0.2 s transitions (`src/components/album/SeedHeader.tsx:31-38`, `album.css:33-34`).
  - Verify: `hover-list-row`; unit `contrast.test.ts` "a lit mood tag passes 4.5:1 for every album accent".

- [ ] **The hot badge keeps readable digits for every album accent.**
  - Sees: dark digits on the accent-coloured badge.
  - How: `.mk-n[data-hot] { background: var(--acc); color: var(--color-room) }` (`map.css:94-95`).
  - Verify: unit `contrast.test.ts` "the hot rank badge on the map passes 4.5:1 for every album accent"; e2e `a11y.spec.ts` "the hot rank badge on the map passes axe".

- [ ] **Hot state is cleaned up when the album closes.**
  - Sees: no stale highlight on the next album.
  - How: `AlbumPanel.tsx:71-83`.
  - Verify: e2e `album.spec.ts` "close and Escape return to the map and leave the store clean".

---

## 7. Trail of visited albums, and toasts

- [ ] **The trail shows the last four albums visited, oldest first.**
  - Sees: a "VISITED" label and up to four titles separated by small chevrons, above the album header.
  - How: `TRAIL_SHOWN = 4` (`src/lib/trail.ts:5`, `:35-38`); `src/components/album/Trail.tsx:10-27`; chevron drawn with two 1 px borders rotated 45 degrees (`album.css:16`); 13.5 px dust text, 28 px tall (`album.css:13-19`).
  - Verify: `trail`; unit `trail.test.ts` "shows the last four and flags truncation".

- [ ] **Older items are cut off with an ellipsis.**
  - Sees: "…" before the first title once more than four albums were visited.
  - How: `Trail.tsx:18`, `COPY.album.trailMore` (`copy.ts:37-38`); the ellipsis item is `aria-hidden`.
  - Verify: Manual: visit five albums.

- [ ] **Up to twelve albums are remembered, for this tab only.**
  - Sees: the trail survives a reload in the same tab and is empty in a new tab.
  - How: `TRAIL_MAX = 12`, key `rmr-trail` in `sessionStorage` (`trail.ts:3-4`, `:14-33`); first visit of a page load continues the saved trail (`store.ts:77-85`).
  - Verify: unit `store.test.ts` "restores the trail from sessionStorage on the first visit of a page load"; unit `trail.test.ts` "keeps at most TRAIL_MAX items".

- [ ] **Going back to an album already on the trail cuts the trail back to it.**
  - Sees: clicking the second of four titles leaves two titles.
  - How: `pushTrail` (`trail.ts:7-12`).
  - Verify: e2e `flows.spec.ts` "going deeper and breadcrumb back"; unit `trail.test.ts` "appends new albums and cuts back to a revisited one".

- [ ] **The current album is plain text, the others are links that keep the slider stop.**
  - Sees: the last title is bright and not clickable; the others underline on hover.
  - How: `aria-current="page"` span against `Link href={albumHref(t.slug, stop)}` (`Trail.tsx:21`); hover underline with 3 px offset (`album.css:18-19`); long titles truncate with an ellipsis (`album.css:14`, `:17`).
  - Verify: `trail`; e2e `album.spec.ts` "going deeper keeps by, fills the trail, and the trail goes back".

- [ ] **With fewer than two albums the trail is an empty spacer of the same height.**
  - Sees: the header does not jump when the trail first appears.
  - How: `Trail.tsx:12` renders an `aria-hidden` `.trail` div; height 28 px (`album.css:13`).
  - Verify: `album-open` (first album, no trail, same header position as `trail`).

- [ ] **The trail works with storage blocked.**
  - Sees: no error; the trail lasts for the page load.
  - How: try/catch in `trail.ts:14-33`.
  - Verify: e2e `flows.spec.ts` "works with web storage blocked".

- [ ] **Toast: look, position and timing.**
  - Sees: a small paper-coloured pill at the bottom centre that slides up 12 px, stays about 2.6 s and fades.
  - How: `src/components/shell/Toast.tsx:6-18`, timeout 2600 ms (`:10`); `.toast` fixed, `bottom: 28px`, z-index 140, paper background, lamp-ink text, 0.2 s opacity and transform (`shell.css:70-76`); `role="status" aria-live="polite"`; each toast gets a new id so a repeated message restarts the timer (`store.ts:54`, `:86`).
  - Verify: `toast-link-copied`; unit `store.test.ts` "gives each toast a new id".

- [ ] **Toast call site 1: "Link copied".**
  - Sees: pressing the link icon beside "Open in Spotify" copies the album URL (with `?by=` when not balanced) and says "Link copied".
  - How: `src/components/album/CopyLinkButton.tsx:29-39`, toast at `:35`; URL from `absoluteUrl(albumHref(slug, stop))` (`:31`).
  - Verify: `toast-link-copied`; e2e `album.spec.ts` "copy link puts the album URL (with by) on the clipboard and says so".

- [ ] **Toast call site 2: clipboard fallback, success or the link in words.**
  - Sees: when the clipboard API is refused, the old copy command is tried; on success "Link copied", otherwise "Could not copy. The link is recmyrecord.com/album/…".
  - How: `CopyLinkButton.tsx:36-38` (toast at `:37`); `legacyCopy` gives focus back to the button (`:9-27`).
  - Verify: unit `CopyLinkButton.test.tsx` "keeps focus on the button when it falls back to the legacy copy". Manual: deny clipboard permission and press the button.

- [ ] **Toast call site 3: "Surprise me" when the albums did not load.**
  - Sees: "The albums didn't load. Check your connection, then try again."
  - How: `src/components/home/HomeHero.tsx:27-38`, toast at `:34`.
  - Verify: Manual: block `/data/albums.json`, press "Surprise me" on Home.

---

## 8. Keyboard

- [ ] **Skip link is the first Tab stop.**
  - Sees: the first Tab shows an amber "Skip to content" button at the top left; Enter moves to the main area.
  - How: `layout.tsx:43-45`, target `main#main tabIndex={-1}` (`:49`); `.skip` off screen at `top: -60px`, `top: 12px` on focus, lamp background, z-index 300 (`shell.css:18-19`).
  - Verify: e2e `smoke.spec.ts` "skip link is the first focusable element and targets main"; e2e `a11y.spec.ts` "keyboard: the skip link comes first and targets main".

- [ ] **Tab order of the shell and Home.**
  - Sees: skip link, wordmark, (header search on every page but Home), Map, About, then the page: on Home the search field, "Explore the map", "Surprise me", the shelf covers.
  - How: DOM order in `layout.tsx:43-55` and `src/components/shell/Header.tsx:12-25`; the header search is `visibility: hidden` on Home (`shell.css:39`).
  - Verify: e2e `a11y.spec.ts` "keyboard: every Home action in order, with visible focus".

- [ ] **Tab order on the map and album view.**
  - Sees: after the header: the map canvas, the slider, "Explore this area" (album view), zoom in, zoom out, reset, the card's controls (Explore), then the album panel: close, trail links, Spotify, copy link, each row and its Spotify link, "Show more".
  - How: `MapStage` is before the route's children (`layout.tsx:51-52`); overlay order `MapStage.tsx:355-373`; panel order `AlbumPanel.tsx:120-138`. The slider's three name buttons are `tabIndex={-1}` (`src/components/map/overlays/SimilaritySlider.tsx:38`).
  - Verify: e2e `a11y.spec.ts` "keyboard: the map, its controls and the album list are all reachable".

- [ ] **Map canvas keys: arrows pan, plus and minus zoom, 0 resets.**
  - Sees: with the map focused, arrow keys move the view 70 px at once; `+` or `=` zooms in by 1.4, `-` or `_` zooms out, over 240 ms; `0` resets over 420 ms.
  - How: `src/components/map/canvas/CameraRig.tsx:48-50`, `:277-309`; ignored with Alt, Ctrl or Meta (`:278`); `panBy` is instant (`CameraTween.tsx:101-106`), `zoomBy` uses `ZOOM_STEP_MS = 240` (`:19`, `:94-100`).
  - Verify: e2e `map.spec.ts` "keyboard pans and zooms, 0 resets".

- [ ] **The canvas is focusable only while the map takes input, and says so.**
  - Sees: on Home, About and 404 Tab skips the map; in Explore and beside an album it stops on it.
  - How: `tabIndex` 0 or -1 and the label "Map of albums. Drag or use arrow keys to pan, plus and minus to zoom." or "Map of albums" (`Scene.tsx:40-55`, `:125-130`; `copy.ts:66-68`); `role="img"`.
  - Verify: e2e `map.spec.ts` "Home shows the map dimmed and not interactive".

- [ ] **`/` focuses search from anywhere.**
  - Sees: pressing `/` puts the cursor in the visible search field (on phones it opens the search sheet); a small `/` key hint sits in the field and hides while it is focused.
  - How: `src/components/search/shortcut.ts:14-25`: ignored with Meta, Ctrl or Alt, in text fields, textareas, selects and editable content (a range input is allowed); the most recently registered visible target wins. Registered by the hero and header fields (`src/components/search/SearchBox.tsx:162-165`) and the phone toggle (`src/components/search/HeaderSearch.tsx:17`). Hint `.kbd` (`SearchBox.tsx:325-329`, `src/styles/search.css:21-22`).
  - Verify: e2e `search.spec.ts` "slash focuses search from anywhere and a click chooses" and "slash is ignored while typing in a field and with modifier keys".

- [ ] **Search field keys.**
  - Sees: Down and Up move through the suggestions and wrap; Enter opens the active one (the first by default); Escape closes the list, a second Escape clears the text, a third leaves the field; Tab moves on and closes the list.
  - How: `SearchBox.tsx:239-268`; typing preselects the first option (`:312-318`); IME composition keys are left alone (`:240-241`).
  - Verify: e2e `search.spec.ts` "arrow keys move the active option and Escape closes then clears" and "Tab and a click elsewhere close the list"; unit `SearchBox.test.tsx` "ignores an Escape that belongs to an IME composition".

- [ ] **Escape order across layers.**
  - Sees: Escape acts on the innermost open thing only: search popover, then phone search sheet, then (phone) map mode back to the list, then the album (back to the map), the Explore card, or About.
  - How: search input stops and handles its own (`SearchBox.tsx:253-265`, popover `:339-345`); sheet `preventDefault` (`src/components/search/SearchSheet.tsx:36-42`); document listeners skip handled events, text inputs, `[aria-modal="true"]` and `.combo` (`AlbumPanel.tsx:92-109`, `MapStage.tsx:245-260`, `src/components/AboutClose.tsx:21-32`).
  - Verify: e2e `album.spec.ts` "Escape inside the search popover or the phone search sheet keeps the album open"; e2e `explore.spec.ts` "Escape in the header search does not close the card".

- [ ] **Escape closes an album and returns to the map.**
  - Sees: Escape beside an album goes to `/map` with the camera where Explore last had it.
  - How: `AlbumPanel.tsx:44`, `:92-109`. Works with focus on the slider (range inputs are allowed, `:97`).
  - Verify: e2e `album.spec.ts` "close and Escape return to the map and leave the store clean".

- [ ] **Slider keys.**
  - Sees: with the slider focused, Left and Right (and Home, End) move between Sonic, Balanced and Mood; a screen reader hears the stop's name.
  - How: a native `input type="range" min=0 max=2 step=1` with `aria-valuetext` (`SimilaritySlider.tsx:21-31`), labelled "Similarity" (`:14-16`).
  - Verify: e2e `album.spec.ts` "a held arrow key on the slider ends on the last stop, even when a URL write lands just after it".

- [ ] **A full keyboard-only journey works.**
  - Sees: search, open an album, go deeper, come back to the map, without a mouse.
  - How: all of the above.
  - Verify: e2e `flows.spec.ts` "keyboard-only search, deeper and back to the map".

---

## 9. Focus management and focus rings

- [ ] **Default focus ring.**
  - Sees: keyboard focus shows a 2 px amber outline 3 px outside the control, with slightly rounded corners; mouse clicks show none.
  - How: `:focus-visible { outline: 2px solid var(--color-lamp); outline-offset: 3px; border-radius: 2px; }` (`shell.css:15`); `--color-lamp: #e6a856` (`globals.css:19`).
  - Verify: `focus-header-link`, `focus-zoom-button`, `focus-panel-control`.

- [ ] **Headings that receive focus by script show no ring.**
  - Sees: after a navigation the title is focused for screen readers but nothing is outlined.
  - How: `[tabindex="-1"]:focus { outline: none; }` (`shell.css:16`).
  - Verify: `album-open` (no outline on the title after arriving from search).

- [ ] **Map canvas focus ring is inset.**
  - Sees: the focused map shows the amber outline 4 px inside its edge, so the header and panel do not clip it.
  - How: `.map-canvas:focus-visible { outline: 2px solid var(--color-lamp); outline-offset: -4px; }` (`map.css:8`).
  - Verify: Manual: Tab to the map in Explore.

- [ ] **List row focus ring is inset.**
  - Sees: the focused row's outline sits just inside the row.
  - How: `.rec-main:focus-visible { outline-offset: -2px; }` (`album.css:46`).
  - Verify: `focus-panel-control` and `focus-panel-control-crop` (they show the first list row focused, with its map marker lit).

- [ ] **Search field focus: border turns amber with a soft halo, nothing moves.**
  - Sees: the field's 1 px border becomes amber with a fainter 1 px line outside it and a slightly lighter fill.
  - How: `.combo-field:focus-within` (`search.css:8-12`): `border-color: var(--color-lamp)`, `box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-lamp) 45%, transparent)`, background `--color-room-3`; the input itself has `outline: none` (`search.css:18`); forced-colours fallback `outline: 2px solid Highlight` (`search.css:13-15`).
  - Verify: `focus-search`; e2e `search.spec.ts` "the focused field shows a lamp border with a softer halo, without moving" and "in forced-colors mode the focused field gets a system outline".

- [ ] **Slider focus: a halo round the thumb.**
  - Sees: the focused slider's amber thumb gains a soft 5 px amber glow; no rectangle round the track.
  - How: `map.css:46-48`: `box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 5px rgba(230,168,86,.35)`.
  - Verify: `focus-slider`.

- [ ] **Shelf cover focus restores full colour.**
  - Sees: a focused shelf cover goes from muted to full colour, like on hover, and the line above names it.
  - How: `.mosaic a:focus-visible .cover img { filter: none; }` and opacity 1 (`home.css:20-21`); `onFocus` in `src/components/home/Shelf.tsx:41`.
  - Verify: e2e `pages.spec.ts` "hovering or focusing a cover names it; clicking opens it".

- [ ] **In-app navigation moves focus to the new view's heading; a direct load does not.**
  - Sees: after clicking through, a screen reader announces the new page; on a fresh load the first Tab still reaches the skip link.
  - How: `src/components/FocusOnMount.tsx:11-17` (Explore `src/app/map/page.tsx:11-14`, About `src/app/about/page.tsx:13`, `:28`, 404 `src/app/not-found.tsx:16`, `:26`); album title `AlbumPanel.tsx:85-90`; the gate is `previousPath() !== null` (`src/lib/nav-history.ts:11-13`); always `preventScroll: true`.
  - Verify: e2e `explore.spec.ts` "a direct load of /map leaves focus alone, so the first Tab reaches the skip link"; e2e `album.spec.ts` "a direct load leaves focus alone: the first Tab reaches the skip link"; e2e `pages.spec.ts` "a direct load of About or a 404 leaves focus alone: the first Tab reaches the skip link".

- [ ] **Home focuses the search field on desktop, the heading on phones.**
  - Sees: on a desktop you can type at once; on a phone the keyboard does not pop up.
  - How: `SearchBox.tsx:158-160` (`autoFocus && !isNarrow()`); `HomeHero.tsx:20-25`.
  - Verify: e2e `pages.spec.ts` "coming back to Home moves focus: the search on desktop, the heading on a phone".

- [ ] **Closing the Explore card keeps focus on the map.**
  - Sees: after closing the card with its button or Escape, keyboard focus is on the map, not lost.
  - How: `keepFocusOnMap` (`MapStage.tsx:108-111`), called at `:255` and `:368`.
  - Verify: e2e `explore.spec.ts` "the card closes with its button, with Escape and with a click on empty map".

- [ ] **Clicking a slider stop name moves focus to the slider.**
  - Sees: after clicking "Mood", arrow keys work straight away.
  - How: `SimilaritySlider.tsx:40-43`.
  - Verify: Manual.

- [ ] **Choosing a search result leaves the field empty and unfocused.**
  - Sees: after picking an album the header field is clear and focus is on the new album's title.
  - How: `SearchBox.tsx:205-218`; header field remounts per route (`key={pathname}`, `HeaderSearch.tsx:31`).
  - Verify: e2e `flows.spec.ts` "search to album".

- [ ] **Phone search sheet traps focus and gives it back.**
  - Sees: with the sheet open nothing behind it can be reached; closing returns focus to the search icon.
  - How: skip link, header and main set `inert` and restored only if the sheet set them (`SearchSheet.tsx:12-28`); field focused on open (`:22-23`); focus back to the toggle after unmount (`HeaderSearch.tsx:19-24`).
  - Verify: e2e `search.spec.ts` "the header icon opens a full-screen sheet; choosing navigates; close returns focus" and "the sheet makes the page behind inert, locks scrolling and restores only what it changed".

- [ ] **Phone map mode moves focus to the one button that switches back.**
  - Sees: after "Open map" focus is on "List"; the hidden list cannot be tabbed into.
  - How: `AlbumPanel.tsx:45-50`; panel `aria-hidden` and `inert` in map mode (`:117-118`).
  - Verify: e2e `phone.spec.ts` "list first, then the map strip; the Map button toggles a full-screen map".

- [ ] **Search error: Tab reaches "Try again", which returns focus to the field.**
  - Sees: when the albums fail to load the popover shows the message and a button that can be reached by Tab.
  - How: `SearchBox.tsx:266-281`, `:392-399`.
  - Verify: e2e `search.spec.ts` "when the albums fail to load, Tab reaches Retry and Retry returns focus to the field".

- [ ] **A tap on empty map moves focus off the focused control (phones).**
  - Sees: tapping the map after using the slider blurs the slider as usual.
  - How: only picks arm the ghost-click guard (`PickController.tsx:45-50`).
  - Verify: e2e `explore.spec.ts` "a tap on empty map moves focus off the focused control".

---

## 10. Search

- [ ] **Search code and data load on first focus, not on page load.**
  - Sees: the page loads fast; the first focus of the field fetches the album list and the search code.
  - How: `wanted` set on focus or input (`SearchBox.tsx:101-102`, `:312-322`); `getSearch` loads the module chunk and the catalog once (`src/components/search/searchIndex.ts:19-40`, `src/components/search/loadSearchModule.ts:2-4`); marks `data-search-index="ready"` on `<html>` (`searchIndex.ts:31`).
  - Verify: e2e `search.spec.ts` "builds the index lazily, suggests, highlights and navigates with the keyboard".

- [ ] **Ranking rules.**
  - Sees: an exact title comes first, then titles starting with the query, then all words in the title, then words split between title and artist, then all words in the artist; ties in chart order; at most six.
  - How: `tierOf` (`src/lib/search.ts:168-184`), sort and `SEARCH_LIMIT = 6` (`:5`, `:191-209`).
  - Verify: unit `search.test.ts` "orders exact title, title prefix, all in title, split, all in artist, then catalog order".

- [ ] **Matching is forgiving.**
  - Sees: case, accents and apostrophes do not matter; "and" and "&" are optional; every word must start a word of the title or artist.
  - How: `fold` and the `EXTRA` table (`search.ts:19-39`), word rule (`:41-45`), connectors (`:63-67`), repeated words need as many matches (`:161-166`, `:174-179`).
  - Verify: unit `search.test.ts` "is accent-insensitive", "finds titles with apostrophes without typing them, and ignores punctuation-only queries", "matches every query word as a word prefix of the title or artist".

- [ ] **Typo fallback only after a pause, only when nothing matched.**
  - Sees: a misspelt name still finds the album a moment after you stop typing; typing itself never stutters.
  - How: Fuse with threshold 0.2, for 4 to 16 characters (`search.ts:6-8`, `:149-157`, `:211-223`); run after `TYPO_PAUSE_MS = 160` in an idle slot of at most 200 ms (`SearchBox.tsx:37-39`, `:169-190`); stale results dropped (`:134`).
  - Verify: unit `SearchBox.test.tsx` "never runs the typo step synchronously on input, and runs it once after a 160 ms pause" and "discards a typo result that arrives for a query that is no longer current".

- [ ] **Each suggestion row.**
  - Sees: a 44 px cover, the title in 19 px serif, the artist under it in 13.5 px; long text ends in an ellipsis; rows are at least 56 px tall.
  - How: `SearchBox.tsx:348-388`; `.opt`, `.opt-t`, `.opt-a` (`search.css:29-34`); popover `.combo-pop` 6 px under the field with shadow `0 18px 40px -12px rgba(0,0,0,.7)` (`search.css:23-27`).
  - Verify: `search-suggestions`.

- [ ] **Match highlighting.**
  - Sees: the matched start of each word is bright with a thin amber underline; no yellow marker background.
  - How: ranges from `highlightRanges` (`search.ts:83-112`), split by `splitHighlights` (`src/lib/highlight.ts:7-17`), rendered as `<mark>` (`SearchBox.tsx:61-67`); `.opt mark { background: none; color: var(--color-paper); box-shadow: inset 0 -1px 0 rgba(230,168,86,.8); }` (`search.css:35`). Typo matches have no highlight.
  - Verify: `search-suggestions`; unit `search.test.ts` "returns highlight ranges on the original strings".

- [ ] **Active option.**
  - Sees: the active row has a lighter background and a 2 px amber bar on its left; moving the mouse over a row makes it active.
  - How: `.opt[aria-selected="true"]` (`search.css:30-31`); `onMouseMove` (`SearchBox.tsx:373-375`); `aria-activedescendant` on the input (`:308`).
  - Verify: `search-suggestions`.

- [ ] **The active option's page is prefetched.**
  - Sees: choosing a suggestion opens the album almost at once.
  - How: `router.prefetch` in `SearchBox.tsx:200-203`.
  - Verify: perf budget `selectToAlbumMs` 200.

- [ ] **Mouse chooses on press, touch on release.**
  - Sees: a click feels instant; on a phone you can scroll the list without choosing, and the tap does not also hit what appears under it.
  - How: `SearchBox.tsx:359-372`; ghost-click guard `suppressGhostClick` (`src/lib/ghost-click.ts:5-6`, `:33-41`); right-click and Ctrl+click on macOS do not choose (`SearchBox.tsx:42-45`, `:283-286`).
  - Verify: e2e `search.spec.ts` "a Ctrl+click on an option on macOS opens no album" and "a press on the message or a right-click on an option does not keep the popover open".

- [ ] **Empty state text.**
  - Sees: "No album matches **query**. Try the artist's name, or fewer words." with the query in bold; it never flashes while a typo search is pending; a long unbroken query wraps.
  - How: `NoMatches` (`SearchBox.tsx:69-82`), gate `emptyShown` (`:139-140`); `.combo-empty { overflow-wrap: anywhere }` (`search.css:36-37`); copy `copy.ts:22`.
  - Verify: `search-none`; e2e `search.spec.ts` "shows the no-match message"; unit `SearchBox.test.tsx` "shows the no-match sentence only once the typo step has finished empty, and announces only then".

- [ ] **Screen reader announcements.**
  - Sees (hears): "Matching albums listed" or "No albums found" 350 ms after the results settle, again for each new query.
  - How: polite live region (`SearchBox.tsx:401-403`), set after 350 ms (`:192-198`), cleared on each edit (`:316`); usage hint through `aria-describedby` (`:309`, `:331-333`, `copy.ts:17`).
  - Verify: unit `SearchBox.test.tsx` "clears the announcement for a new query so an unchanged message is announced again".

- [ ] **Combobox semantics.**
  - Sees: assistive technology reads a combobox with a listbox of options.
  - How: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` (`SearchBox.tsx:298-309`); `role="listbox"` and `role="option"` (`:347`, `:355`); `type="search"`, `autoComplete="off"`, `autoCapitalize="off"`, `spellCheck={false}`, `enterKeyHint="go"`, `maxLength={80}` (`:298-304`, `:35`); the browser's clear button is hidden (`search.css:20`).
  - Verify: e2e `a11y.spec.ts` "open states pass axe".

- [ ] **The list closes when focus leaves, but not during a press inside it.**
  - Sees: clicking elsewhere closes the suggestions; pressing on the list does not make it vanish under the finger.
  - How: `SearchBox.tsx:148-150`, `:220-237`, `:278-281`, `:337-338`.
  - Verify: e2e `search.spec.ts` "Tab and a click elsewhere close the list".

- [ ] **Three field sizes.**
  - Sees: hero field 58 px tall with 17 px text (54 px on phones); header field 44 px, at most 440 px wide; sheet and 404 fields 48 px on phones.
  - How: `search.css:3-7`, `:39`, `:42-45`, `:65`, `:76-78`.
  - Verify: `home-top`, `focus-search`, `notfound`, phone `search-sheet`.

- [ ] **Phone search sheet.**
  - Sees: the header shows a magnifier icon; tapping it opens a full-screen sheet with the field and a close button on one row and the results below, which stay until the sheet closes.
  - How: toggle (`HeaderSearch.tsx:33-42`, `search.css:60`, `:69-71`); sheet portal, `role="dialog" aria-modal="true"` (`SearchSheet.tsx:30-52`); layout (`search.css:61-67`); results persist (`SearchBox.tsx:95-96`, `:130`); page scroll locked (`SearchSheet.tsx:19-21`).
  - Verify: phone `search-sheet`; e2e `search.spec.ts` "the header icon opens a full-screen sheet; choosing navigates; close returns focus".

---

## 11. Similarity slider

- [ ] **Three stops with a note line.**
  - Sees: a small card "SIMILARITY" with a track, three tick dots, an amber thumb, the names Sonic, Balanced, Mood, and one line: "Closest in sound." / "Sound and mood together." / "Closest in mood."
  - How: `SimilaritySlider.tsx:9-52`; `.mode` 244 px wide at top left 20 px (`map.css:37`); track and ticks (`:38-40`); thumb 16 px amber with a 3 px float-coloured border and 1 px amber outline (`:44-45`); names (`:49-54`); note (`:55`); copy `copy.ts:56-60`.
  - Verify: `slider-sonic`, `slider-balanced`, `slider-mood`.

- [ ] **The thumb snaps; there are no in-between values.**
  - Sees: dragging lands on one of the three stops.
  - How: `step={1}`, `min={0}`, `max={2}` (`SimilaritySlider.tsx:24-28`).
  - Verify: Manual: drag slowly.

- [ ] **Stop names are clickable and show the current one.**
  - Sees: clicking "Mood" selects it; the current name is bright.
  - How: buttons with `aria-pressed` (`SimilaritySlider.tsx:34-47`; `map.css:54`).
  - Verify: e2e `flows.spec.ts` "slider change".

- [ ] **The map morphs between stops over 520 ms.**
  - Sees: every album glides to its place in the new layout, easing in and out.
  - How: `MorphDriver` animates `sliderT` to 0, 0.5 or 1 with `easeInOutCubic` over `DURATION.morph = 520` (`src/components/map/canvas/MorphDriver.tsx:15-43`, `media.ts:7`, `:10`; `data.ts:7`); the shader interpolates positions piecewise (`album.ts:120-127`); hit-test positions are recomputed with it (`AlbumField.tsx:104-118`).
  - Verify: `slider-mid`; e2e `focus.spec.ts` "the slider morphs the layout and changes the stop" and "the morph is animated, and instant under reduced motion".

- [ ] **Beside an album the camera reframes for the new stop.**
  - Sees: the map glides to fit the album's neighbours at the new stop while the layout morphs.
  - How: `FocusFramer` reacts to the stop in its key (`FocusFramer.tsx:8-13`); target computed at the destination layout (`CameraTween.tsx:86-92`), 420 ms ease-out cubic (`DURATION.camera`).
  - Verify: e2e `focus.spec.ts` "the slider morphs the layout and changes the stop".

- [ ] **In Explore a stop change never moves the camera.**
  - Sees: only the albums move.
  - How: `InitialFrame` recomputes the overview framing on `sliderT` at most once per animation frame without touching the camera (`InitialFrame.tsx:47-60`, `:134-154`).
  - Verify: Manual: `__rmr.map.getCamera()` before and after a stop change in Explore.

- [ ] **The list reorders with a glide (FLIP).**
  - Sees: rows that stay slide to their new place over 420 ms; rows that are new fade in from 8 px left over 340 ms, staggered by 30 ms.
  - How: `src/components/album/useFlipList.ts:8-34`: `DURATION.rows = 420`, easing `cubic-bezier(.22,.72,.2,1)`; new rows `delay: 90 + n * 30`; only within one seed; moves under 1 px are skipped.
  - Verify: Manual: change the stop beside an album; perf budget `sliderToListMs` 150.

- [ ] **The URL gets `?by=` a frame later, without a history entry.**
  - Sees: the address bar shows `?by=sonic` or `?by=mood` (nothing for balanced); Back does not step through slider moves.
  - How: `onStop` writes the store first, then `replaceBy` after a frame and a timeout (`MapStage.tsx:278-287`); `history.replaceState` (`src/lib/url-state.ts:36-44`); balanced omits the parameter (`:14-24`); only in album view (`MapStage.tsx:281`).
  - Verify: e2e `album.spec.ts` "the slider swaps the list in place and writes ?by= without a navigation".

- [ ] **A late URL write never sets the slider back.**
  - Sees: holding an arrow key on the slider ends on the last stop.
  - How: the app's own writes are remembered and ignored when they arrive (`url-state.ts:26-61`, `src/components/album/AlbumView.tsx:20-34`).
  - Verify: e2e `album.spec.ts` "a held arrow key on the slider ends on the last stop, even when a URL write lands just after it"; unit `url-state.test.ts` "recognises an older own write that Next applies after a newer one".

- [ ] **The stop is shared everywhere.**
  - Sees: links from the shelf, search, trail, rows, the card and "Surprise me" all keep the current stop.
  - How: `albumHref(slug, stop)` in `Shelf.tsx:38`, `SearchBox.tsx:214`, `Trail.tsx:21`, `RecRow.tsx:20`, `MapCard.tsx:23`, `HomeHero.tsx:32`, `MapStage.tsx:305`.
  - Verify: e2e `album.spec.ts` "going deeper keeps by, fills the trail, and the trail goes back".

---

## 12. URL, state restore, Back, titles

- [ ] **A direct `?by=` load shows the right list at once.**
  - Sees: opening `/album/x?by=mood` shows the mood list immediately, with no balanced list first and no row animation.
  - How: `AlbumView` renders from the URL until the store has caught up (`AlbumView.tsx:15-36`); server HTML shows balanced inside a `Suspense` fallback (`src/app/album/[slug]/page.tsx:42-47`); unknown values mean balanced (`url-state.ts:9-12`).
  - Verify: e2e `album.spec.ts` "a direct ?by=mood load renders the mood list at once: no row animation, one focus".

- [ ] **Back and Forward restore the stop of that history entry.**
  - Sees: going Back to an album opened at "Sonic" shows Sonic again.
  - How: `popstate` clears the pending own writes (`url-state.ts:29-34`); the effect then sets the store from the URL (`AlbumView.tsx:29-33`).
  - Verify: Manual: open an album, set Mood, open a neighbour, set Sonic, press Back.

- [ ] **Explore remembers its camera across an album visit.**
  - Sees: closing an album (cross, Escape, Back, the Map link) returns the map to where Explore was; if Explore was never visited it frames the whole map.
  - How: camera saved on leaving Explore, restored or reset on return from an album once the focus is gone (`MapStage.tsx:215-243`, store `store.ts:17-18`, `:72`).
  - Verify: e2e `explore.spec.ts` "closing an album returns to the map where it was" and "browser Back from an album returns to the map where it was".

- [ ] **"Explore this area" keeps the map exactly where the album had it.**
  - Sees: a button at the top right of the map beside an album; pressing it drops the album and leaves the view untouched.
  - How: `src/components/map/overlays/ExploreHere.tsx:6-13`; `.map-explore` (`map.css:22-25`); `onExploreHere` clears the focus first and skips the camera restore (`MapStage.tsx:218-232`, `:316-321`).
  - Verify: e2e `explore.spec.ts` "\"Explore this area\" drops the album and leaves the map where it was".

- [ ] **One map for the whole session.**
  - Sees: moving between Home, Explore, an album and About never reloads or resets the map.
  - How: `MapStage` is mounted in the root layout (`layout.tsx:50-52`); routes only change its inputs (`MapStage.tsx:137-203`).
  - Verify: e2e `pages.spec.ts` "a prefetched navigation never paints a cleared album state".

- [ ] **Album to album never flashes an empty state or loses the map inset.**
  - Sees: going from one album to the next, the panel content fades and the map stays shifted.
  - How: old panel cleanup and new panel measure land in one commit (`usePanelInset.ts:8-11`); a hidden panel keeps the inset (`:18-20`); `setFocus` ignores equal values (`store.ts:43-47`, `:69`).
  - Verify: e2e `pages.spec.ts` "a slow navigation whose prefetch failed keeps the map inset while it waits".

- [ ] **Document titles.**
  - Sees: Home "recmyrecord"; "Map · recmyrecord"; "About · recmyrecord"; "{title} by {artist} · recmyrecord"; "Not found · recmyrecord".
  - How: `layout.tsx:24-29`; `map/page.tsx:5`; `about/page.tsx:6`; `album/[slug]/page.tsx:18-36`; 404 also sets it on the client (`not-found.tsx:8`, `:13-14`, `src/components/DocumentTitle.tsx:6-11`); copy `copy.ts:125-132`.
  - Verify: e2e `a11y.spec.ts` "every route passes axe, has its own title, one h1 and landmarks".

- [ ] **Share metadata.**
  - Sees: a shared album link shows the album title and its cover.
  - How: canonical and Open Graph image 640 px from Spotify (`album/[slug]/page.tsx:22-35`); `themeColor: '#15110d'`, `colorScheme: 'dark'`, `viewportFit: 'cover'` (`layout.tsx:31-37`).
  - Verify: Manual: view source of an album page.

- [ ] **Scrolling: the page itself never scrolls; a new album starts at the top.**
  - Sees: only the album list, Home and About scroll inside the stage; opening another album resets the list to the top; Back does not restore the old scroll position.
  - How: `body { overflow: hidden }` (`shell.css:5`), `.stage` fixed (`shell.css:68`); `.album-scroll` with `overscroll-behavior: contain` and a thin scrollbar (`album.css:9`); `scrollTo({ top: 0 })` on each album (`AlbumPanel.tsx:85-86`).
  - Verify: e2e `smoke.spec.ts` "no horizontal scroll and no console errors on the shell"; e2e `phone.spec.ts` "no horizontal scroll at 360 and 1600 px".

- [ ] **Old URLs redirect to Home.**
  - Sees: `/recommend`, `/recommend/album/...` and `/insights/...` land on Home.
  - How: `next.config.ts` `redirects()`.
  - Verify: e2e `flows.spec.ts` "old URL redirects"; e2e `smoke.spec.ts` "old URLs redirect home".

---

## 13. Camera

- [ ] **Initial view fits every album, clear of the controls.**
  - Sees: the whole cloud is visible, sitting a little above centre, clear of the slider card and the hint.
  - How: full extent (`src/components/map/state/bounds.ts:59-66`), `fitView` (`:83-106`) with `DESKTOP_FIT_PADDING { top: 55, right: 40, bottom: 115, left: 40 }` or the phone padding `{ top: 90, right: 40, bottom: slider + 4, left: 40 }` (`MapStage.tsx:38-42`); fitted zoom clamped to 0.2 to 5 (`zoomLimits.ts:18-20`); snapped in a layout effect before the first frame (`InitialFrame.tsx:99-113`, `:121-132`).
  - Verify: `map-overview`, `map-whole`; unit `bounds.test.ts` "fits the box on its tighter axis".

- [ ] **A window resize refits only if you have not touched the map.**
  - Sees: resizing a fresh map keeps the cloud fitted; after you pan or zoom, a resize leaves your view alone.
  - How: `untouched = lastCameraGrab === 0 && input.focus === null` (`InitialFrame.tsx:102-104`); in album view a resize reframes the focus unless you moved (`FocusFramer.tsx:41-44`).
  - Verify: Manual.

- [ ] **Zoom limits.**
  - Sees: you can zoom out to a little beyond the whole map and in until covers are 64 px with space between them.
  - How: floor `0.8 x` the fitted zoom (`zoomLimits.ts:21-22`, `CameraRig.tsx:17-21`), ceiling `MAX_ZOOM = 28` (`zoomLimits.ts:17`), `clampZoom` (`CameraRig.tsx:44-46`).
  - Verify: Manual: `__rmr.map.zoomBy(1000)` then `__rmr.map.getCamera().zoom` is 28; `zoomBy(0.0001)` gives 0.8 times the overview zoom.

- [ ] **Wheel zoom is smooth and anchored at the cursor.**
  - Sees: the album under the cursor stays under it while zooming; the zoom eases rather than stepping.
  - How: sensitivity 0.0015 per wheel unit, 0.00075 for trackpad pinch (`ctrlKey`) (`CameraRig.tsx:22-24`, `:251-276`); eased with a 0.09 s time constant, frame delta clamped to 1/30 s (`:25-30`, `:352-379`); anchor maths (`src/components/map/state/zoomMath.ts:26-36`); the page never scrolls (`preventDefault`, `:253`).
  - Verify: unit `zoomMath.test.ts` "keeps the cursor's world point projecting to the same screen point after a zoom change"; e2e `map.spec.ts` "hover shows a label, drag pans, wheel zooms, click selects and flies".

- [ ] **Drag pans one to one, even past the canvas edge.**
  - Sees: the map follows the pointer exactly; dragging out of the map area keeps panning.
  - How: world units per CSS px (`CameraRig.tsx:184-203`); pointer capture (`:120-126`, `:205-210`); `touch-action: none` on the canvas (`map.css:6`).
  - Verify: e2e `map.spec.ts` "hover shows a label, drag pans, wheel zooms, click selects and flies".

- [ ] **Fling after a flick, none after a hold.**
  - Sees: letting go while moving glides the map to a stop; holding still before letting go leaves it exactly there.
  - How: velocity is the mean of the last 3 moves (`CameraRig.tsx:38-39`, `:221-237`); no fling when the last move was over 80 ms ago (`:40-42`); friction 0.92 per 60 Hz frame, scaled by real frame time (`:31-33`, `:331-349`); stops below `1e-10` squared speed (`:34-37`).
  - Verify: Manual on a trackpad or mouse.

- [ ] **Pinch zoom on touch, anchored between the fingers, with no fling after.**
  - Sees: two fingers zoom about their midpoint; lifting one finger does not make the map jump.
  - How: `CameraRig.tsx:137-152`, `:162-182`, `:239-249`; `pinchZoom` uses the ratio to the starting distance (`zoomMath.ts:42-53`).
  - Verify: unit `zoomMath.test.ts` "scales startZoom by the ratio of current distance to start distance". Manual on a phone.

- [ ] **Zoom buttons and Reset.**
  - Sees: three stacked 40 px buttons at the bottom right: plus, minus, fit. Plus and minus zoom by 1.6 over 240 ms about the centre; repeated presses add up; the third resets over 420 ms.
  - How: `src/components/map/overlays/ZoomControls.tsx:7-21`; `.map-zoom` (`map.css:26-30`); `zoomBy` compounds from the pending target (`CameraTween.tsx:94-100`); `reset` (`:107-112`); labels "Zoom in", "Zoom out", "Reset view" (`copy.ts:69-71`).
  - Verify: `focus-zoom-button`; e2e `map.spec.ts` "zoom buttons work".

- [ ] **Camera glides ease out, and zoom is interpolated on a log scale.**
  - Sees: fly-to and reset slow down smoothly into place and zoom feels even.
  - How: `easeOutCubic` (`media.ts:9`); log-space zoom (`CameraTween.tsx:177-184`).
  - Verify: Manual.

- [ ] **Your own input always wins over a glide.**
  - Sees: grabbing or wheeling during a fly-to stops the glide at once; starting a glide stops any leftover wheel easing or fling.
  - How: a camera grab newer than the tween cancels it (`CameraTween.tsx:170-176`); `stopCameraRig()` before every tween (`CameraTween.tsx:50-51`, `CameraRig.tsx:52-56`, `:98-110`).
  - Verify: Manual.

- [ ] **The idle Explore camera is eased back if it wanders off the albums.**
  - Sees: if you pan until the cloud is mostly out of view and let go, half a second later the map drifts back; normal panning to an edge is left alone.
  - How: `src/components/map/canvas/CameraBounds.tsx:11-22`, `:81-127`: `EASE 0.1` per frame, `MARGIN 0.04`, `RELEASE_MS 500`; only when interactive, no focus, no tween, no drag; thresholds 60% of the cloud visible at or below the fitted zoom, 25% above (`bounds.ts:136-159`).
  - Verify: unit `bounds.test.ts` "at or below fit zoom, nudges a view showing under 60% of the cloud even above 25%" and "returns null when the cloud is already mostly visible (centered, zoomed to fit)".

- [ ] **The map draws only when something changes.**
  - Sees: an idle map uses no CPU or GPU.
  - How: `frameloop="demand"` (`Scene.tsx:94`); every animation asks for its next frame and stops when settled (for example `CameraRig.tsx:28-30`, `:375-379`; `AlbumField.tsx:158-159`; `MorphDriver.tsx:38`); DOM code asks through `requestRender` (`src/components/map/state/invalidate.ts:16-18`, bridge `Scene.tsx:31-38`).
  - Verify: e2e `map.spec.ts` "the map is a lazily loaded WebGL canvas that renders on demand"; perf budgets `idleFrames` 1 and `idleLongTasks` 0. Manual: read `__rmr.frames` twice a few seconds apart.

- [ ] **On Home, About and 404 the map takes no input.**
  - Sees: the map behind is a still backdrop; clicks and wheel do nothing to it.
  - How: `.map-host { pointer-events: none }` for those views (`map.css:3-5`); the R3F wrapper inherits it (`Scene.tsx:114-116`); every handler also checks `input.interactive` (`CameraRig.tsx:114`, `:121`, `:252`, `:278`).
  - Verify: e2e `map.spec.ts` "Home shows the map dimmed and not interactive".

---

## 14. Reduced motion (`prefers-reduced-motion: reduce`)

- [ ] **All CSS transitions and animations become instant.**
  - Sees: no fades, slides or rises anywhere in the DOM.
  - How: `shell.css:84-86`: durations `.01ms`, one iteration, no delay, on every element and pseudo-element.
  - Verify: `rm-map-overview`, `rm-album-open`.

- [ ] **Camera glides jump.**
  - Sees: fly-to, reset, zoom buttons and focus framing land at once.
  - How: `CameraTween.tsx:53-56`.
  - Verify: Manual with the OS setting on: press Reset.

- [ ] **The panel inset jumps with the panel.**
  - Sees: the map is in its shifted position in the same frame the panel appears.
  - How: `CameraTween.tsx:160`.
  - Verify: e2e `phone.spec.ts` "reduced motion makes the panel appear at once".

- [ ] **No fling.**
  - Sees: the map stops where the drag ended.
  - How: `CameraRig.tsx:223`.
  - Verify: Manual.

- [ ] **Wheel zoom is immediate but still anchored at the cursor.**
  - Sees: each wheel step lands at once with the album under the cursor held.
  - How: `CameraRig.tsx:262-270`.
  - Verify: Manual.

- [ ] **The slider morph is instant.**
  - Sees: albums jump to the new layout.
  - How: `MorphDriver.tsx:24-29`.
  - Verify: e2e `focus.spec.ts` "the morph is animated, and instant under reduced motion".

- [ ] **The dim between Home and the map is instant.**
  - Sees: dots switch between faint and full without easing.
  - How: `AlbumField.tsx:156`.
  - Verify: `rm-map-overview`.

- [ ] **The list does not glide.**
  - Sees: rows swap in place.
  - How: `useFlipList.ts:15`.
  - Verify: Manual.

- [ ] **The album panel does not slide or fade in.**
  - Sees: the panel is simply there.
  - How: entry forced to `'none'` (`AlbumPanel.tsx:28-31`).
  - Verify: `rm-album-open`; e2e `phone.spec.ts` "reduced motion makes the panel appear at once".

- [ ] **Phone Map and List switch within a frame.**
  - Sees: no half-slid panel.
  - How: `phone.css:49-53` removes the transition properties.
  - Verify: e2e `phone.spec.ts` "under reduced motion the Map and List buttons switch within a frame".

---

## 15. Loading and error states

- [ ] **Before the map data loads: a quiet empty pane.**
  - Sees: the dark pane with the slider card; no hint, no zoom buttons, no spinner.
  - How: `MapStage.tsx:335-339` (map only with data), `:359-361` (zoom buttons and hint need data); pane background `map.css:1`.
  - Verify: Manual with a throttled network on `/map`.

- [ ] **The album page is readable before any script runs.**
  - Sees: the album, its tags and its closest albums are in the HTML.
  - How: every album is prerendered (`album/[slug]/page.tsx:10-14`, `:38-47`).
  - Verify: e2e `album.spec.ts` "renders the seed, tags and the closest albums (balanced by default)"; perf budget `pageHtmlKb` 150.

- [ ] **Data load failure shows an inline message with "Try again".**
  - Sees: a card in the middle of the visible map: "The albums didn't load." in serif, "Check your connection, then try again." and a button. Not shown on Home.
  - How: `src/components/ErrorPanel.tsx:4-14` (`role="alert"`); `MapStage.tsx:323`, `:344-352`; `.map-msg` (`map.css:31-34`), centred right of the album panel on desktop (`map.css:126-130`); retry restarts both files (`MapStage.tsx:347-350`); a failed load is never retried by itself (`src/lib/data/useData.ts:32-40`).
  - Verify: `error-map`; e2e `pages.spec.ts` "a failed data load shows an inline error that retries"; e2e `a11y.spec.ts` "the data error state passes axe".

- [ ] **Every consumer of the data shares one error and one retry.**
  - Sees: retrying from the map also recovers search.
  - How: module cache in `src/lib/data/client.ts:82-109`; `useLoaded` (`useData.ts:41-71`).
  - Verify: unit `useData.test.ts` "shares loading, error and retry across every consumer".

- [ ] **Search shows its own error block in the popover.**
  - Sees: "The albums didn't load. Check your connection, then try again." with "Try again".
  - How: `SearchBox.tsx:141`, `:392-399`; `.combo-error` (`search.css:38`).
  - Verify: unit `SearchBox.test.tsx` "shows the shared error, clears it when another consumer recovers, and shows loading on retry".

- [ ] **No WebGL: a short message, everything else works.**
  - Sees: "The map needs WebGL, which this browser has turned off. Search and lists still work." in the map area; not on Home.
  - How: probe (`src/components/map/state/webgl.ts:1-11`), status set after first paint (`MapStage.tsx:155-165`); `src/components/map/overlays/NoWebGL.tsx:3-9` (`role="note"`), shown at `MapStage.tsx:343`.
  - Verify: e2e `nowebgl.spec.ts` "without WebGL the map shows a message and search still works" and "without WebGL the album list, the similarity slider and links still work".

- [ ] **A lost WebGL context recovers, or gives way to the message after 3 s.**
  - Sees: after a GPU reset the map redraws; if it cannot, the no-WebGL message appears.
  - How: `CONTEXT_RESTORE_MS = 3000`, `preventDefault` on `webglcontextlost`, redraw on restore (`Scene.tsx:57-85`); `onContextLost` sets `webgl` to unavailable (`MapStage.tsx:311`).
  - Verify: Manual: `document.querySelector('canvas.map-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()` and wait 3 s.

- [ ] **Cover images: empty box while loading, then a fade in.**
  - Sees: a cover is a plain dark square until its image arrives, then fades in over 0.35 s; no letter flashes.
  - How: `src/components/Cover.tsx:26-67`; `.cover { background-color: var(--color-room-3) }`, `img { opacity: 0; transition: opacity .35s }`, `img.ok { opacity: 1 }` (`search.css:47-57`); already-cached images are caught in the ref (`Cover.tsx:49-53`); lazy unless `eager` (`:58`).
  - Verify: e2e `search.spec.ts` "while the remote image loads the box is empty, with no letter".

- [ ] **Cover fallback 1: the 48 px sprite.**
  - Sees: when Spotify's image fails, a small local copy of the cover appears, slightly muted.
  - How: state `'sprite'` (`Cover.tsx:30-32`, `:45`); `thumbStyle` (`sprites.ts:40-49`); `.spr { filter: saturate(.92) contrast(.96) }` (`search.css:55`); the 2.3 MB sheet is requested only then (`src/lib/thumb-sheet.ts:4-8`, `:29-46`).
  - Verify: e2e `flows.spec.ts` "covers fall back to the thumbnail sprite, then to the lettered tile".

- [ ] **Cover fallback 2: a lettered tile.**
  - Sees: with no cover at all, a coloured tile with the title's first letter (after a leading "The"), in serif.
  - How: tile colours by `cluster % 3`: `#3b2a22`, `#2c3024`, `#3b3120` (`Cover.tsx:9-10`, `:35`); letter size 48% of the cover (`:36`); `initialLetter` (`catalog.ts:98-109`); `.fb` colour `rgba(237,229,213,.78)` (`search.css:50-54`); "·" when the title has no letter or digit (`copy.ts:82-83`).
  - Verify: e2e `search.spec.ts` "falls back to the sprite, then to the lettered tile" and "an album without a cover shows its tile and requests nothing"; unit `catalog.test.ts` "makes a typographic initial".

- [ ] **404 page.**
  - Sees: over the dimmed map: "That page isn't here.", a line of help, a search field and "Explore the map".
  - How: `not-found.tsx:10-29`; `.notfound` with a `rgba(12,10,8,.55)` backdrop (`home.css:35-39`); unknown album slugs are 404s (`album/[slug]/page.tsx:10`, `:41`).
  - Verify: `notfound`; e2e `pages.spec.ts` "unknown pages are a 404 with search and a way to the map"; e2e `album.spec.ts` "unknown album slugs are 404s".

- [ ] **Route error boundary.**
  - Sees: the same inline error with "Try again", centred over the dimmed map.
  - How: `src/app/error.tsx:6-12`; `.page-msg` (`home.css:36`, `album.css:64-67`).
  - Verify: unit `error.test.tsx` "shows the inline error and Try again calls retry".

---

## 16. Phone (under 900 px)

- [ ] **The album view is the list first.**
  - Sees: the album fills the screen: trail, header with a 92 px cover, full-width action buttons, the list with 56 px covers and wrapping titles.
  - How: `phone.css:10-32`; breakpoint `(max-width: 899px)` (`media.ts:3`); the map takes no input behind it (`MapStage.tsx:172`).
  - Verify: phone `album-list`; e2e `phone.spec.ts` "list first, then the map strip; the Map button toggles a full-screen map".

- [ ] **Map preview strip under the list.**
  - Sees: a 220 px band with a small picture of the album and its neighbours (dots, lines, small covers, tiny numbered badges) and an "Open map" bar under it.
  - How: `src/components/album/MapPreviewStrip.tsx:140-190`; drawn on a 2D canvas (`:50-138`): dots radius 1.3 px at alpha 0.42 (`:14-15`, `:80-92`), seed 38 px, neighbours 28 px (`:16-18`), kept 6 px inside (`:93-97`), lines `rgba(237,229,213,.22)` (`:98-105`), seed ring in the accent 4 px out (`:118-121`), 14 px badges with 9 px digits drawn last (`:123-137`); dpr capped at 2 (`:160`); covers drawn only once decoded, tiles until then (`:21-48`, `:111-117`); `.strip` (`phone.css:34-37`).
  - Verify: phone `album-list-strip-crop`; unit `MapPreviewStrip.test.ts` "draws dots, one line per recommendation, a cover or tile per album and numbered badges".

- [ ] **The strip loads nothing on desktop.**
  - Sees: no extra requests on wide screens.
  - How: `useCatalog(narrow)`, `usePositions(narrow)` (`MapPreviewStrip.tsx:142-145`); `.strip { display: none }` by default (`album.css:78`).
  - Verify: Manual: network tab on a desktop album page with WebGL off.

- [ ] **Map button (FAB) and the List button.**
  - Sees: a paper-coloured pill "Map" at the bottom right; in map mode it becomes a squared dark "List" button at the top right.
  - How: `src/components/album/MapModeButton.tsx:6-13`; `.fab-map` 48 px tall, radius 24 px, `bottom: calc(16px + env(safe-area-inset-bottom))`, shadow `0 10px 26px -8px rgba(0,0,0,.8)`; `.fab-map--on` at top 12 px, right 12 px (`phone.css:39-44`); labels "Open the map" / "Back to the list" (`copy.ts:81`).
  - Verify: phone `album-list`, `album-mapmode`.

- [ ] **Map mode slides the list away and back.**
  - Sees: the list slides off to the left over 0.4 s and the full map with markers takes the screen; "List" or Escape slides it back.
  - How: `.album--hidden { transform: translateX(-101%); visibility: hidden }` with a delayed visibility switch and `content-visibility: hidden` (`phone.css:11-13`); state per album (`AlbumPanel.tsx:32-36`, `store.ts:19-21`, `MapStage.tsx:150-152`); leaves map mode when the screen turns wide (`AlbumPanel.tsx:52-54`); Escape (`:100-104`).
  - Verify: phone `album-mapmode`; e2e `phone.spec.ts` "an album entered from Home still slides away for the map".

- [ ] **A pick in map mode opens the next album as a list.**
  - Sees: tapping a neighbour cover on the full map opens that album's list, focused, with a fade.
  - How: map mode is scoped to one slug (`MapStage.tsx:151-152`); cleanup (`AlbumPanel.tsx:79`).
  - Verify: e2e `phone.spec.ts` "a map pick in map mode opens that album as a list, focused, with a fade".

- [ ] **Slider panel at the bottom, clear of the home indicator.**
  - Sees: the similarity card spans the bottom of the map with 12 px margins, above the safe area.
  - How: `.mode { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); width: auto }` (`map.css:98`); its real cover is measured and published as `--slider-cover` (`MapStage.tsx:44-75`, `:331`), fallback 165 px (`:28-30`).
  - Verify: phone `album-mapmode`; e2e `focus.spec.ts` "on a phone a larger bottom inset still keeps markers and zoom controls above the slider panel".

- [ ] **44 px tap targets on the slider.**
  - Sees: the track band and the stop names are each 44 px tall and do not overlap.
  - How: `map.css:102-111`.
  - Verify: e2e `focus.spec.ts` "the slider has 44 px tap targets on a phone".

- [ ] **Zoom controls sit 8 px above the slider panel and are 44 px.**
  - Sees: the three buttons never overlap the slider card.
  - How: `map.css:99-101`; `phone.css:46`.
  - Verify: phone `album-mapmode`.

- [ ] **The Explore card is a bottom sheet resting on the slider panel.**
  - Sees: the card spans the width just above the slider, their borders meeting in one line; the zoom buttons hide while it is open; cover 72 px.
  - How: `map.css:116-123` (`bottom: calc(var(--slider-cover) - 1px)`, `.has-card .map-zoom { display: none }`); `MapCard.tsx:18`; class set in `MapStage.tsx:354`.
  - Verify: Manual on a phone viewport: pick an album in Explore.

- [ ] **A picked album lands above the sheet.**
  - Sees: the map flies so the album is visible above the card, not under it.
  - How: card cover measured before the fly (`MapStage.tsx:77-106`, `:262-276`); frame padding raised to card + 16 px (`:32-33`, `:181-187`); target shifted into the free band (`CameraTween.tsx:73-84`).
  - Verify: e2e `map.spec.ts` "tap selects an album".

- [ ] **Markers stay above the slider panel.**
  - Sees: no neighbour cover hides behind the bottom card.
  - How: `bottomCover` (`MapStage.tsx:199-200`), `MarkerDriver.tsx:48-49`.
  - Verify: e2e `focus.spec.ts` "on a phone the focus markers stay above the slider panel".

- [ ] **"Explore this area" moves to the top left, opposite List.**
  - Sees: a 48 px button at the top left in map mode.
  - How: `map.css:113-115`.
  - Verify: phone `album-mapmode`.

- [ ] **No hint line on phones.**
  - Sees: the bottom-left hint is absent.
  - How: `.map-hint { display: none }` (`map.css:112`).
  - Verify: phone `album-mapmode`.

- [ ] **Tap targets are at least 44 px.**
  - Sees: every control is easy to hit.
  - How: `.navbtn, .icon-btn` and `.btn` min 44 px (`shell.css:41-42`, `:50-51`); phone rules for the wordmark, skip link, trail links, action buttons, copy button (`phone.css:7-8`, `:18-19`, `:26-27`); row Spotify link 44 px (`album.css:53`).
  - Verify: e2e `phone.spec.ts` "tap targets are at least 44 px".

- [ ] **Ghost-click guard after a touch pick.**
  - Sees: tapping an album on the map never also presses the card button or row that appears under the finger.
  - How: `ghost-click.ts:5-41`: 12 px radius, 700 ms, disarmed on the next pointerdown; armed by map picks (`PickController.tsx:47-50`) and search options (`SearchBox.tsx:365-370`).
  - Verify: unit `ghost-click.test.ts` "swallows the compatibility click at the same spot, once" and "disarms on the next pointerdown so a real second tap works".

- [ ] **Lower pixel ratio cap on phones.**
  - Sees: panning and pinching stay smooth.
  - How: dpr capped at 1.5 under 900 px (`Scene.tsx:111-113`).
  - Verify: perf budget `frameGapMs` 50 at 390 x 844.

- [ ] **Phone header.**
  - Sees: wordmark, search icon, Map, About on one row; on Home the search icon is hidden because the hero field is there.
  - How: `shell.css:78-82`; `search.css:69-74`.
  - Verify: phone `album-list`.

- [ ] **Phone album list bottom padding clears the Map button.**
  - Sees: the last row and the strip can scroll above the floating button.
  - How: `.album-scroll { padding: 12px var(--gut) 110px }` (`phone.css:14`); the desktop close cross is hidden (`phone.css:15`).
  - Verify: phone `album-list-strip-crop`.

---

## 17. Home, About, header, ambient colour, contrast, copy

- [ ] **Home hero.**
  - Sees: "Start with an album you like." in large serif, a one-line lede, a large search field, then "Explore the map" (underlined) · "Surprise me".
  - How: `HomeHero.tsx:40-57`; `.hero` width `min(640px, 100% - 32px)`, top padding `clamp(32px, 10vh, 112px)`; h1 `clamp(42px, 5.8vw, 80px)`, line-height .98 (`home.css:5-9`); short laptops get a smaller top (`home.css:41-45`); copy `copy.ts:12-13`, `:26-28`.
  - Verify: `home-top`; e2e `pages.spec.ts` "hero, search, buttons and shelf over the dimmed map".

- [ ] **Home shelf.**
  - Sees: two rows of twelve muted covers at the bottom, the second row fainter; hovering or focusing one shows it in full colour and names it in the line above ("Or start from one of these" otherwise).
  - How: 24 top albums with covers (`catalog.ts:8`, `:79-84`, `src/app/page.tsx:10`); `Shelf.tsx:12-50`; images `filter: saturate(.5) brightness(.52)`, back to `none` over 0.25 s; second row `opacity: .55` (`home.css:11-21`); 8 columns and 16 covers under 1180 px, 4 columns and 8 covers on phones (`home.css:47-51`, `:57-59`).
  - Verify: `home-shelf`; e2e `flows.spec.ts` "Home shelf"; e2e `pages.spec.ts` "hovering or focusing a cover names it; clicking opens it".

- [ ] **The shelf-name line keeps its height.**
  - Sees: nothing jumps when a cover is hovered.
  - How: `.shelf-now { height: 30px; white-space: nowrap; overflow: hidden }` (`home.css:12-14`); it is `aria-hidden` because each link has its own label (`Shelf.tsx:17`, `:39`).
  - Verify: `home-shelf`.

- [ ] **Dimmed map behind Home, About and 404: fainter, slightly larger dots.**
  - Sees: the map is a quiet backdrop of soft dots.
  - How: `DOT_ALPHA_DIMMED = 0.34`, `MUTED_DOT_SCALE = 1.35` (`album.ts:62-66`); shader `album.ts:155-157`; the alpha eases with a 0.12 s time constant, frame delta clamped to 1/30 s, so entering the map brightens smoothly (`AlbumField.tsx:152-160`); `dimmed` from the route (`MapStage.tsx:173`).
  - Verify: `home-top`, `about`, `notfound`; unit `album.test.ts` "draws its dots 1.35 times larger, easing with the dot alpha (mockup muted)".

- [ ] **Home veil: darker round the hero, and a click on it opens the map.**
  - Sees: the map is darkest behind the heading; clicking empty space beside the hero goes to Explore; the veil fades out over 0.4 s on leaving Home.
  - How: `.veil` radial gradient `rgba(21,17,13,.72)` to `.3` at 70% to `.15`, `cursor: pointer` (`map.css:132-136`); fade and `visibility` handling (`:137-139`); click handler (`MapStage.tsx:340-342`); `.home` lets clicks through except on its children (`home.css:3-4`); darker veil on phones (`phone.css:4-6`).
  - Verify: `home-top`; e2e `pages.spec.ts` "clicking empty map area goes to the map".

- [ ] **Surprise me.**
  - Sees: opens a random album that has a cover, at the current slider stop; pressing twice quickly does nothing extra.
  - How: `HomeHero.tsx:27-38` (`busy` guard, `aria-busy`); `pickSurprise` (`catalog.ts:86-96`).
  - Verify: e2e `flows.spec.ts` "Surprise me".

- [ ] **Header.**
  - Sees: a 64 px bar (60 px on phones) with the italic serif wordmark, the search field in the middle, Map and About on the right; the current page's link is bright with a 1 px amber underline; on Home the bar is transparent and has no search field.
  - How: `Header.tsx:8-27`; `.top` `rgba(21,17,13,.96)` with a bottom rule and 0.4 s colour transitions; `.top--home` transparent (`shell.css:26-33`); wordmark (`:34-37`); `.navbtn[aria-current="page"] { box-shadow: inset 0 -1px 0 var(--color-lamp) }` (`:46`); heights `globals.css:33`, `:45`.
  - Verify: `focus-header-link`, `home-top`, `map-overview`.

- [ ] **About.**
  - Sees: a 680 px card over a dark backdrop with the dimmed map behind: "How it works", the paragraphs under small headings, an amber italic sign-off, and the credits under a rule.
  - How: `about/page.tsx:8-31`; `.about-page` backdrop `rgba(12,10,8,.72)`; `.about` padding `44px 48px 40px`, shadow `0 30px 80px -30px #000` (`home.css:23-33`); full screen on phones (`home.css:62-65`).
  - Verify: `about`; e2e `pages.spec.ts` "About explains the site and closes back".

- [ ] **Closing About goes back to where you came from.**
  - Sees: the cross, Escape or a press on the backdrop returns to the previous page; on a direct load they go Home. A press on the backdrop's scrollbar does not close.
  - How: `AboutClose.tsx:13-48`: `router.back()` when there is a previous path, else `push('/')` (`:16-20`); backdrop press excludes the scrollbar (`:33-42`).
  - Verify: e2e `pages.spec.ts` "a press on the backdrop around the About card closes it; a press on the card does not".

- [ ] **Album header.**
  - Sees: a 116 px cover with a deep shadow, the artist, the title in large serif that shrinks for long titles (48, 40 or 28 px, two lines at most), "Open in Spotify" (amber), a copy-link icon button, and up to six mood tags.
  - How: `SeedHeader.tsx:9-41` (`len-m` over 12 characters, `len-l` over 22); `album.css:21-34`; tags `catalog.ts:9`, `:24-32`; no Spotify button without a Spotify id (`SeedHeader.tsx:12-13`, `:22`).
  - Verify: `album-open`; e2e `album.spec.ts` "an album with no Spotify release shows no Spotify links".

- [ ] **List rows.**
  - Sees: an italic rank number, a 60 px cover, the title in 23 px serif, the artist, "Shares word, word" with the words slightly brighter, and a Spotify icon link at the right; five rows, "Show more" reveals up to ten.
  - How: `RecRow.tsx:12-49`; `album.css:36-56`; `REC_DEFAULT_VISIBLE = 5`, `REC_MAX = 10`, up to 4 shared words (`catalog.ts:6-7`, `:10`); toggle with `aria-expanded` and `aria-controls` (`RecList.tsx:25-29`); the shared line is hidden between 900 and 1100 px (`album.css:58-60`); one accessible name per row (`copy.ts:51-52`).
  - Verify: `album-open`; e2e `album.spec.ts` "show more reveals rows 6 to 10 and show fewer hides them".

- [ ] **Panel entry motion.**
  - Sees: from Home, Explore or About the panel slides in from the left over 0.4 s; from another album the content fades up 4 px over 0.38 s; on a direct load nothing moves.
  - How: `entryFrom` (`nav-history.ts:20-27`); classes (`AlbumPanel.tsx:28-31`, `:114`, `:126`); keyframes (`album.css:70-77`); easing `--out: cubic-bezier(.22,.72,.2,1)`, `--dur: .4s` (`globals.css:31-32`).
  - Verify: e2e `phone.spec.ts` "entering an album slides the panel in; album to album fades the content"; unit `nav-history.test.ts` "slides in from another route, fades between albums, and is still on a direct load".

- [ ] **Ambient colour wash behind an album.**
  - Sees: the top of the panel glows softly in two of the album's colours, and the map has a faint glow of the second colour at its centre; changing album cross-fades the colours over 0.42 s.
  - How: `src/components/album/AmbientWash.tsx:9-13`: panel `radial-gradient(60% 70% at 16% 20%, colour0 at .85, transparent 72%)` plus `radial-gradient(55% 60% at 88% 6%, colour1 at .8, transparent 70%)` over the top 440 px (`album.css:2`); map `radial-gradient(60% 65% at 50% 48%, colour1 at .42, transparent 78%)` under the transparent canvas (`MapStage.tsx:333-334`); two stacked layers swap (`AmbientWash.tsx:15-44`, `album.css:3-8`).
  - Verify: `album-open`; e2e `album.spec.ts` "ambient colour and accent follow the album"; unit `AmbientWash.test.ts` "builds the panel wash from both colours and the map wash from the second".

- [ ] **Per-album accent colour.**
  - Sees: the seed ring, the hot ring, line and badge, the row's left bar and lit tags all take the album's accent.
  - How: `--acc` set on `<html>` from the album's third ambient colour and removed on close (`AlbumPanel.tsx:64-67`, `:80`); default `--acc: #d9a066` (`globals.css:36`).
  - Verify: unit `contrast.test.ts` "every album accent passes 4.5:1 on the room colour".

- [ ] **Contrast rules.**
  - Sees: all text is readable on its surface.
  - How: WCAG maths in `src/lib/contrast.ts:4-18`; the tests read the tokens from `globals.css:9-28`.
  - Verify: unit `contrast.test.ts` "every text token passes 4.5:1 on every surface it is used on" and "reads the tokens from globals.css". A retheme that changes tokens must keep this test green without loosening it.

- [ ] **Copy rules.**
  - Sees: no em or en dashes, no emoji, no owner name, "4,000+" and never an exact count, never a count of recommendations, typographic apostrophes.
  - How: every string is in `src/lib/copy.ts` (rules in the header comment, `:1-6`; `CATALOG_SIZE_LABEL`, `:6`).
  - Verify: unit `copy.test.ts` "never uses em or en dashes or emoji", "uses the typographic apostrophe, never the straight one", "never names the owner or counts recommendations or the catalog", "keeps em dashes and the owner name out of every source file", "has the approved key strings".

- [ ] **Type and base tokens.**
  - Sees: Cormorant Garamond for titles, Schibsted Grotesk for text, antialiased; small uppercase caps labels.
  - How: fonts with `display: 'swap'` (`layout.tsx:10-22`), stacks (`globals.css:26-27`); body 16 px/1.5 (`shell.css:4-7`); `.cap` 11.5 px, .09em tracking, uppercase (`shell.css:24`); panels: `--color-float` background, 1 px rule border, 2 px radius, shadow `0 10px 30px -14px rgba(0,0,0,.8)` (`map.css:21`).
  - Verify: `home-top`, `album-open`.

- [ ] **Buttons.**
  - Sees: amber primary buttons that lighten on hover, outlined secondary buttons, quiet text buttons with a faint underline that turns amber on hover.
  - How: `.btn`, `.btn-lamp` (hover `#efb86c`), `.btn-line`, `.textbtn`, `.textbtn.u` (`shell.css:49-64`), 0.2 s transitions.
  - Verify: `album-open`, `home-top`.

- [ ] **Links that leave the site say so.**
  - Sees (hears): Spotify links announce "(opens in a new tab)".
  - How: `SeedHeader.tsx:26`, `MapCard.tsx:30`, `RecRow.tsx:43` (`copy.ts:40`, `:53`); all use `rel="noopener noreferrer"`.
  - Verify: e2e `a11y.spec.ts` "open states pass axe".

---

## 18. Performance niceties

- [ ] **three.js loads after first paint, as its own chunk.**
  - Sees: the page is usable before the map code arrives.
  - How: `dynamic(() => import('./MusicMap'), { ssr: false })` (`MapStage.tsx:24`); mounted only after two animation frames and an idle slot (timeout 600 ms) (`MapStage.tsx:113-135`, `:167`, `:336-338`).
  - Verify: e2e `map.spec.ts` "the map is a lazily loaded WebGL canvas that renders on demand"; perf budget `firstLoadJsKb` 200 (the script also reports the three.js share of first-load JS).

- [ ] **WebGL is warmed up in a worker.**
  - Sees: no long freeze when the map first appears.
  - How: `warmUpWebGL` creates throwaway contexts in a Blob worker until one takes under 30 ms or 8 were made, capped 1 s after the first and 5 s overall (`webgl.ts:13-22`, `:24-58`, `:69-120`); started after first paint and aborted on unmount (`MapStage.tsx:155-165`); the CSP allows `worker-src 'self' blob:` (`next.config.ts`).
  - Verify: unit `webgl.test.ts` "caps the wait after the first context at capMs"; perf budget `startupLongTaskMs` 250.

- [ ] **Map data is fetched only once the map can use it.**
  - Sees: Home does not download positions before the map is ready to draw.
  - How: `useCatalog(enabled)`, `usePositions(enabled)` with `enabled = painted && webgl === 'ok'` (`MapStage.tsx:167-170`).
  - Verify: e2e `nowebgl.spec.ts` tests (no map data needed for lists).

- [ ] **Cover sheets decode off the main thread and are released.**
  - Sees: no hitch when covers arrive.
  - How: `ImageBitmapLoader` (`AtlasManager.tsx:12-18`); textures and bitmaps disposed on unmount or data change, stale loads dropped by epoch (`:52-59`, `:150-178`, `:210-219`).
  - Verify: perf budget `frameGapMs` 50.

- [ ] **The thumbnail sheet is never loaded on a normal page.**
  - Sees: the 2.3 MB `thumbs.webp` is requested only after a remote cover fails.
  - How: `thumb-sheet.ts:4-8`, `Cover.tsx:22-25`, `:31`, `:45`.
  - Verify: e2e `pages.spec.ts` "the first load requests no thumbnail sprite and no map atlas, shelf included".

- [ ] **Pointer work happens once per frame, in refs.**
  - Sees: moving the mouse never re-renders React.
  - How: cursor and hover in refs (`Scene.tsx:140-146`); one O(n) hit test per drawn frame (`CursorTracker.tsx:119-126`, `:169-176`); overlays positioned with `translate3d` on cached elements (`OverlayDriver.tsx:18`, `overlayEls.ts:3-13`); store setters skip equal values (`src/components/map/state/mapStore.ts:84`, `:89-92`).
  - Verify: perf budgets `frameGapMs` 50 and `idleLongTasks` 0.

- [ ] **Search stays under 100 ms per keystroke.**
  - Sees: suggestions keep up with typing.
  - How: prefix matching only on the keystroke path (`SearchBox.tsx:131-132`, `search.ts:186-190`); Fuse runs later (see section 10).
  - Verify: perf budgets `typeToSuggestionsMs` 100 and `searchUsableMs` 1000.

- [ ] **The slider updates the list before the URL.**
  - Sees: the list and map react at once.
  - How: `MapStage.tsx:278-287`.
  - Verify: perf budget `sliderToListMs` 150.

- [ ] **Data files are cached.**
  - Sees: repeat visits do not re-download the album data or cover sheets.
  - How: `/data/*` served with `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` and `Cross-Origin-Resource-Policy: same-origin` (`next.config.ts` `headers()`).
  - Verify: e2e `smoke.spec.ts` "removed API routes are gone and data files are served with caching".

- [ ] **All budgets.**
  - Sees: the site stays fast.
  - How: `scripts/perf/budgets.json`: `searchUsableMs` 1000, `startupLongTaskMs` 250, `typeToSuggestionsMs` 100, `selectToAlbumMs` 200, `sliderToListMs` 150, `frameGapMs` 50, `idleLongTasks` 0, `idleFrames` 1, `firstLoadJsKb` 200, `pageHtmlKb` 150.
  - Verify: `npm run perf` passes at 1440 x 900 and 390 x 844 with the same budget file (do not raise a budget to make a retheme pass).
