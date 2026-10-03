# Trifid prototype: phone review

Lens: 390 x 844, one thumb, mid-range phone, outdoors, arriving on an album page from a shared link.

How this was checked. I read `prototype/UX.md`, `README.md`, `COPY.md`, all of `src/*.js` and `src/css/*.css`, and the real app's `phone.css`, `map.css`, `MapPreviewStrip.tsx`, `PickController.tsx`, `ghost-click.ts` and `layout.tsx`. I looked at the five `shots/phone-*.jpg` and took six more at phone size (scratch dir, not in `shots/`): map Overview, album list top, Explore sheet, two zoomed-in maps, and the region sheet at 375 x 667. Numbers for framing and star size come from running the prototype's own formulas over `data/data.js` in Node. Contrast figures are pixel samples from the screenshots. Nothing was run on a real phone, so every touch finding is from reading the code. Paths below are relative to `docs/design/trifid-theme/prototype/`.

Verdict in one line: the list survives the theme, the map does not yet. Stars are about twice too big on a phone, Overview is framed under the slider, labels are desktop-sized, and the touch handling is weaker than the real app's.

## 1. Demonstrable bugs

**B1. Stars are 1.9x too big on a phone (the "soft blobs").** `src/app.js:206`, `src/stars.js:67-70`.
It is a zoom-band normalisation bug, not a device-pixel-ratio bug. `u_dpr` is correct (`stars.js:78`), and the shots are at ratio 1 anyway.
`sizeK = dot(coverPx) / dot(coverPx at Overview)`, with `dot(c) = clamp(1.8 + c/3.15, 3, 7.2)`. On desktop Overview is at 12.4 px covers, so the divisor is 5.75. On a 390 px phone Overview is at 2.7 px covers, the dot rule sits on its floor of 3, and the divisor is 3.
Result at the same zoom (12 px covers, the Stone Roses album framing): desktop `sizeK` 0.97, phone 1.87. The faintest class is drawn at 2.1 px radius instead of 1.1. The top class is 4.9 px radius with a 27 px halo. Zoomed further it reaches `sizeK` 2.4: flat white discs up to 12 px wide (extra shot 4).
The second half of the same bug: at phone Overview `sizeK` is 1, so 4,081 stars keep their desktop radii on a cloud 4.5 times smaller. Median nearest-neighbour gap there is 1.9 px against star radii of 1.1 to 2.6 px. The cloud is a white granular mass and the gas colour only shows at the fringe (extra shot 1, `shots/phone-home.jpg`).
Fix: normalise to a constant, not to Overview: `sizeK = dot(cp) / dot(12.5)`. That gives 0.52 at phone Overview and 0.97 in album Map mode. Below about 4 px covers also scale alpha with radius squared so density reads as glow, and drop the class 0 and 1 halos (`stars.js:23`) until covers are over 6 px.

**B2. Taps are eaten by finger jitter.** `src/app.js:280`, `src/camera.js:92`.
A tap counts only if `moved < 5`, and `moved` is the summed `|dx| + |dy|` over every pointermove, not the distance from the touch-down point. A finger that wobbles 1 px across five events fails. There is no time limit either, so a long press counts as a tap.
The real app uses straight-line distance, 9 px for touch, 5 for mouse, 500 ms maximum (`frontcreck/src/components/map/canvas/PickController.tsx:13-41`).
Fix: copy those three constants and measure `hypot(up - down)`. Do not start panning on touch until the 9 px is exceeded.

**B3. No ghost-click guard.** `src/app.js:259-264, 280`.
Picks happen on `pointerup`. The browser then sends a compatibility `mousedown` and `click` at the same spot. The Explore sheet covers y 510 to 680 on a phone, so a tap on a star in that band can land on "See closest albums" or on the Spotify link, which opens a new tab. In album Map mode a tap on a cover swaps in the list, and the ghost click can land on a list row.
The real app has `suppressGhostClick` for exactly this (`frontcreck/src/lib/ghost-click.ts`). The prototype dropped it. Order of the async `hashchange` against the click is not guaranteed, so this needs a device to reproduce, but the guard is missing.
Fix: port `ghost-click.ts` and arm it on every touch pick.

**B4. The first touch that moves at all deletes the colour sentence for good.** `src/app.js:277`, `src/app.js:153`.
`markPanned()` runs on any pointermove while a finger is down, before the 4 px check on the same line. A wobbly tap sets `localStorage['rmr-panned']`. After that a phone user has no legend anywhere on the map.
Fix: call it only once the drag threshold is passed. See F5 for whether the sentence should exist in this form at all.

**B5. Overview on a phone is centred under the slider.** `src/camera.js:28-33`, `src/config.js:25`.
`fitOverview` centres the median y on the middle of the stage. `fitWhole` uses the desktop padding (bottom 115). On a phone the slider card covers the bottom 163 px and the colour sentence another 75. Extra shot 1: 180 px of empty sky under the header, the lower third of the cloud under the sentence and the slider, a label cut by the slider's top edge.
Fix: on narrow layouts fit and centre inside the free rectangle (top 16, bottom `--slider-cover` + 16).

**B6. A picked album is hidden under a region label and sits just above the sheet.** `src/app.js:101`, `src/app.js:209-227`.
Tapping a star tweens x and y only, to the stage centre, with no zoom change. The pick ring is not in the label blocker list. Extra shot 3: the ring for The Stone Roses is under the letters of PROGRESSIVE SPIRAL, 60 px above the Explore sheet, in a mass of stars.
Fix: add the ring to the blockers. On narrow layouts centre the pick in the free area above the sheet and zoom to at least 13 px covers if below it.

**B7. The "you are here" chip is placed for a desktop layout on a phone.** `src/labels.js:163-165`, `src/app.js:220`.
When the map is under 760 px wide the chip goes to `left: 20px; top: hdr + 36 + sliderHeight`, which assumes the slider is top left. On a phone the slider is at the bottom, so the chip lands about 246 px down the left edge, and the inline style overrides the phone rule at `src/css/pages.css:186`. The matching blocker rectangle is wrong the same way. From code only: my two zoomed shots had no named region under the centre, so the chip did not show.
Fix: branch on `S.narrow` and leave the CSS position alone.

**B8. Label and pointer hit areas overlap.** `src/labels.js:92`, `src/css/pages.css:189`, `src/labels.js:134-142`, `src/css/trifid.css:33`.
Placement uses a box of text plus 4 px vertical. The phone CSS pads labels by 10 px. Two labels the placer thinks are clear can overlap by 12 px of hit area.
Edge pointers are laid out as 22 px tall with 30 px between rows, but their hit area is 44 px. `shots/phone-region-sheet.jpg`: URBAN CLUSTER and PLAYFUL WAY are 31 px apart, so 13 px of each target belongs to the other.
Fix: give the placer the real hit box (44 px minimum height) and 8 px between boxes.

**B9. Safe-area insets are dead.** `index.html:5`, `src/app.js:124`.
The viewport meta has no `viewport-fit=cover` (the real app has it, `frontcreck/src/app/layout.tsx:36`), so every `env(safe-area-inset-bottom)` in `pages.css` is 0 and nothing in the prototype tests the notch or home-indicator case. When it is added, `--slider-cover` is set to `sliderHeight + 12` without the inset, while the slider itself moves up by the inset (`pages.css:156`). Sheets, zoom buttons and the sentence would then overlap the slider by 34 px on an iPhone.
Fix: add `viewport-fit=cover` and measure the cover as `pane bottom - slider top`, as the real app does.

**B10. A drag or pinch that starts on a label does nothing.** `src/css/trifid.css:6`, `src/app.js:269`.
Labels, pointers and the chip are DOM buttons above the canvas. Pointer handlers are on `#ov` only, and the buttons have default `touch-action`. A pan that starts on a name is dead. A pinch with one finger on a name zooms the page, not the map. At phone Overview six labels with sub-lines cover roughly a fifth of the cloud.
Fix: `touch-action: none` on `.rl, .ptr, .here` and forward their pointer events to the camera, treating them as a tap only under the B2 threshold.

**B11. After a pinch the remaining finger cannot pan.** `src/app.js:271, 280`.
Pinch start sets `down = null`. When one finger lifts, `pinch` is cleared but `down` stays null, so the finger still on the glass moves nothing until it is lifted and put down again. A third finger restarts a drag while `pinch` is still set, and `dragMove` then takes deltas from whichever pointer moved last, so the camera jumps.
Fix: on leaving a pinch with one pointer left, call `Cam.dragStart` at that pointer and set `moved` past the tap threshold. Ignore pointers beyond two.

**B12. No `touch-action: manipulation` on buttons.** `src/css/app.css:31`.
Fast repeat taps on zoom in are a double-tap to iOS Safari, which zooms the page. The real app sets it on search options only, so this is partly inherited.
Fix: `button, a, [role=option] { touch-action: manipulation; }`.

**B13. The region sheet framing uses a fixed 470 px.** `src/regions.js:56`.
The sheet is about 305 px tall when "Next to" wraps to two rows, plus the slider. At 375 x 667 the map keeps 137 px and the region is not visibly framed at all (extra shot 5).
Fix: measure the card (`cardBox` already exists in `app.js:126`) and shrink the sheet (F6).

**B14. Small ones.**
- `src/css/trifid.css:77`: `.opt--region html[data-stress] .here` can never match. Paste error.
- `src/css/trifid.css:78`: a second `.fam-dot` rule resizes every family dot to 10 px, including the one in the album panel line.
- `src/app.js:212`: the phone blocker for the List button is applied on the plain map route too, where there is no List button.
- `src/app.js:297`: any resize (rotation, browser bar) resets the camera to the album framing and throws away the user's pan.
- `src/css/app.css:73`: the search field is 15 px, so iOS Safari zooms the page when the sheet's field takes focus. Inherited from the real app. Use 16 px on narrow layouts.
- `src/labels.js:115` with `src/css/trifid.css:10`: the scrim is solved for its centre, but the gradient is down to about 65% of that at the ends of a long name. The ends of PROGRESSIVE SPIRAL get less than the 4.5:1 the solver promised.

## 2. Design findings, ranked

**F1. Blocker. Any stray tap in Map mode opens some other album and drops you back to a list.** `src/app.js:254-263`.
The touch radius is 24 px at every zoom. At phone Overview an average of 91 albums lie inside that circle, so a tap in the cloud picks an arbitrary one. In album Map mode a tap within 24 px of any star, not just the five numbered covers, navigates to that album, and because `view=map` is not carried over the list slides back in. The real app has the same two rules, but its dots are small and sparse at its phone zoom. With B1 the stars fill the screen, so almost every tap hits.
Fix: on touch in album Map mode, only the numbered covers navigate. Other stars need 16 px covers or more, and the first tap shows a name plate (F2). Keep `view=map` when moving between albums in Map mode. On the plain map, a tap below 13 px covers should zoom toward the point, not pick.

**F2. Blocker. Touch users get no album names in Map mode.**
Desktop has the list beside the map and a hover plate. In phone Map mode the list is hidden and there is no hover. Covers 1 to 5 are 46 px pictures with a number. The only way to learn what number 3 is, is to tap it, which leaves the album.
Fix: first tap on a cover or star shows the existing plate (`UI.tip`, cover, title, artist) with an "Open" action. Second tap or the action opens it. Tap elsewhere clears it.

**F3. Major. Stars.** See B1. Until that is fixed the theme's main claim on a phone (colour shows character, brightness shows density) is not visible: the cloud is white.

**F4. Major. Labels are desktop-sized on a phone.** `src/labels.js:24-27, 82`, extra shot 1.
Names are 17 to 24 px with .17em tracking plus a 12.5 px sub-line. PROGRESSIVE SPIRAL is 280 px wide on a cloud 340 px wide. Six labels with scrims make a dark smear across the middle of the map, and a name that wide cannot say where its region is. Fair regions at 75% opacity (EPIC EXPANSE) are close to unreadable over stars. The scrim solver handles gas well: I measured 6:1 to 7:1 for the capitals against their local ground. It does not know about stars, and thin 12.5 px sub-lines render at about 2.6:1 to 3.5:1 at ratio 1 against a nominal 8:1. In sunlight the sub-lines are gone.
Fix on narrow layouts: names 13 to 16 px, no sub-lines on the map (the sheet has the words), cap 4, strong regions only at Overview, fair ones from 6 px covers. Tap height padded to 44 px in the placer (B8).

**F5. Major. Map mode chrome takes 43% of the screen before any sheet opens.** `shots/phone-map-mode.jpg`.
Header 60, Explore and List row 68, colour sentence 75, slider card 162. That leaves about 480 of 844 px. The slider card spends 150 px on three stops: a "SIMILARITY" caption, a 44 px track, a 44 px row of stop names, and a note.
The colour sentence is three lines of 12.5 px text over stars. Its colour words are 19 px tall buttons that isolate a family on focus or emulated hover. On touch that is undiscoverable, sticky, under 44 px, and it switches the gas from the baked texture to the live shader (`src/gas.js:282`), which is the path the spec says not to ship on phones.
Fix: slider card on narrow layouts is one 56 px row: three segment buttons, no caption, no note. Replace the sentence with a 44 px "Colours" chip above the slider that opens a small sheet with five rows (swatch, word, 48 px tall). Tapping a row can dim the other families using a second baked tint, or do nothing. Keep the chip, drop the "goes after the first pan" rule (B4).

**F6. Major. The region sheet plus the slider cover 55% of the screen.** `shots/phone-region-sheet.jpg`, extra shot 5.
The content is right: name, plain words, evidence, six covers, neighbours. This is the touch replacement for hovering a name, and it works. But it is 305 px tall, the slider stays at full height under it, and the zoom buttons disappear (`src/css/pages.css:181`). Dismissal is a 44 px X, or a tap on empty map, which in the cloud almost always hits a star and swaps to the Explore card instead (F1). No swipe down. The six covers have names only in a `title` attribute, so on touch they are unlabelled pictures, and tapping one replaces the region sheet with no way back except the browser's back button.
Fix: two heights. Peek (about 120 px): name, plain words, evidence, a grabber. Full: covers and neighbours. Swipe or tap the grabber to change. While any sheet is open the slider collapses to its one-row form. "Next to" becomes one row of two chips. A cover tap shows the name plate inside the sheet with "Open", and keeps the sheet.

**F7. Major. Arrival cost on a shared link.** `src/gas.js:215-219, 262-271, 318-331`, `src/pages.js:106`.
The landing view is the list, but before it can respond the page parses a 1.6 MB data script, blurs 17 grids of 384 x 384 for each of three stops on the main thread, renders and reads back three 512 x 512 luminance maps, then for the strip bakes a 2048 x 2048 gas texture with mipmaps and reads back a 1024 x 1024 copy. All of it is synchronous. Memory if all three stops are visited: three baked textures at about 22 MB each, 15 half-float field textures, four 3072 x 3072 cover atlases at about 38 MB each decoded. That is tab-kill territory on older iPhones.
The prototype says the shipped path is one pre-rendered texture per stop. Hold it to that, and add: on narrow layouts do not create the WebGL context until the strip scrolls into view or Map is tapped; ship a 1024 px gas image per stop for phones (the whole cloud is under 450 px wide at Overview and the gas is at 30% by the time 2048 would matter); ship the label luminance map as data; load a stop's gas when the slider first goes there.
The frame itself is fine: baked gas is one textured triangle at CSS resolution, stars are one draw of 4,081 points with about one screen of overdraw, covers are a 2D loop. `generateMipmap` on the screen-sized target every frame (`gas.js:306`) is wasted work.

**F8. Major. The strip is a thumbnail of the whole map, and its text is too small.** `src/pages.js:102, 113-123`.
The scale uses a minimum span of 0.3 world units against 112 px of usable height, which gives 373 px per unit: almost the phone Overview scale. For The Stone Roses, 2,438 of 4,081 albums are inside the strip as grey grain, the five covers are pushed out from a 60 px knot onto leaders, and their positions are layout, not data. The nebula colour does come through and looks good. The region name is 11 px serif capitals and the badges use 9 px digits: neither is readable outdoors. A fifth of albums are in no region and get no name at all (this one included).
"Open map" (48 px bar) and the Map pill sit 60 px apart and do the same thing.
Fix: minimum span 0.12 so the strip shows the neighbourhood. Stars at 0.8 px. Name at 13 px sans capitals on a small dark plate, and "Between A and B" for unnamed albums. Badges 16 px with 11 px digits. Drop the "Open map" bar and give the canvas the 48 px back, with the whole strip as the button.

**F9. Minor. Tap targets under 44 px.**
- "IN PLAYFUL WAY" in the album header: 28 px (`src/css/pages.css:139`).
- "Between A and B": two inline 13 px links on wrapped lines, about 17 px each (extra shot 2).
- "You are here" chip: 32 px (`src/css/trifid.css:40`).
- Colour words: about 19 px (`src/css/trifid.css:87`).
- Fair region labels without a sub-line: about 35 px.
Everything else checks out at 44 or more: nav, search toggle, rows, Spotify links, slider track and stops, zoom, sheet close, covers in the sheet, search rows (46), Map pill (48).

**F10. Minor. The empty search sheet.** `shots/phone-search-sheet.jpg`.
Rows are 46 px and clear. But the field takes focus on open, so the keyboard covers the lower half and about six of 17 regions show (26 at Mood). The order is internal priority, which reads as random. For someone who came to find an album, the first thing the search shows is a list of place names they have never seen.
Fix: show the top six with "All regions" under them, or order by map position with the family dot leading, and keep the heading as "Places on the map".

**F11. Minor. Home on a phone.** `shots/phone-home.jpg`.
The backdrop region names show through behind the lede and the search field at 32% opacity and fight the hero text. The five region links take three rows (140 px) and push the cover shelf to the bottom edge.
Fix: no backdrop labels on narrow layouts. One row of three region links, or use variant b.

**F12. Minor. Edge pointers.** Plain text with a glow and no plate. I measured about 5:1 to 6:1 over gold gas, which passes, but 12.5 px letterspaced serif is weak in glare. Give them the chip's dark plate on narrow layouts and cap at 2.

## 3. What works

- The list. Solid `#07060a` ground, no gas behind text, the same layout as the real app, 44 px targets on every control. It reads as well as the current site.
- White cased lines and white frames hold on every gas colour in the strip and in Map mode. The amber and mint problem is gone.
- The region sheet's content is the right touch answer to "why is this called that". It rests on the slider with a shared edge and the camera frames the region in the space above it.
- Search rows for regions: dot, name, plain words, 46 px. Easy to scan.
- Nothing animates at rest. Rendering is on demand, the only CSS animation is the one-shot card rise, and reduced motion is honoured.

## 4. What to cut on a phone

Sub-lines under map labels. Fair-region labels at Overview. Star halos. The slider's caption and note. The colour sentence in its current form. The "Open map" bar. The third "Next to" link. Backdrop labels on Home. The second-press behaviour of the fit button. One of the three edge pointers.

## 5. Scores

| Area | Score |
|---|---|
| List view | 7 / 10 |
| Strip | 5 / 10 |
| Map mode | 3 / 10 |
| Regions on phone | 5 / 10 |
| Overall | 4.5 / 10 |

The list keeps the overall score from being lower. Map mode needs B1, B2, B3, B5, F1 and F2 fixed before it is worth testing on a device.
