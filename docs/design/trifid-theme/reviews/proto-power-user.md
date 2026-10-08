# Trifid prototype: power-user review

Lens: a returning user who knows the current app, uses the keyboard, hops album to album, uses the slider, zooms into covers, and comes back weekly.

Method: read `UX.md`, `HANDOFF.md`, `README.md`, `COPY.md`; read `src/app.js`, `camera.js`, `focus.js`, `labels.js`, `regions.js`, `search.js`, `panel.js`, `overlay.js`, `pages.js`, `data.js`, the CSS; compared against `frontcreck/src`; viewed 12 of the shots; ran one headless self-check (`check=1`: 80 layouts, 0 bad) and one Node script over `data/data.js` for the search and region-id numbers below. No extra screenshots taken. Paths are relative to `prototype/` unless they start with `frontcreck/`.

Not verified at runtime: everything in section 1 is traced from the code, not clicked through in a browser. Frame times were not measured.

## 1. Bugs demonstrable from the code

**B1. A region id means different regions at different stops, and the code treats a shared id as the same region.**
Data (`data/data.js`, checked by script): `epic` is Epic Expanse at Balanced, the unnamed HEAVY region at Sonic, and ANTHEMIC at Mood (where Epic Expanse is `epic-2`). `pastoral` is Pastoral Nebula at Balanced but The Bittersweet Reach at Sonic (Balanced has that under `bittersweet`). `warm` is Warm Halo at Balanced, DANCEABLE at Sonic, and Warm Halo is `warm-2` at Mood. `playful` at Mood is ENERGETIC. `improv` at Mood is ACOUSTIC. `hypnotic` at Sonic is ATMOSPHERIC. Progressive Spiral is `progressive` at Balanced and `progressive-2` elsewhere. Of 9 ids shared by Balanced and Sonic, 4 are different regions. Of 6 shared by Balanced and Mood, 3 are.
Effects:
- `src/labels.js:72`: the "one label travels with its centroid" rule matches by id. EPIC EXPANSE slides and turns into HEAVY at the halfway point. WARM HALO turns into DANCEABLE. PASTORAL NEBULA turns into THE BITTERSWEET REACH while the real Bittersweet Reach label fades out. Progressive Spiral, which really does persist, fades out and a second one fades in.
- `src/app.js:92-93`: an open region card survives the stop change if the id exists. A Pastoral Nebula card silently becomes a Bittersweet Reach card.
- `#/map?region=epic` shows three different places depending on `stop`.
This breaks UX.md section 8 ("regions that hold across stops keep their id and name").
Fix: in `build_data.py` (or the scaling output) assign ids by identity: same approved name or same data word, confirmed by member overlap, and suffix everything else. In `labels.js:72` and `app.js:92` also require `name || word` to match before treating two regions as one.

**B2. Moving the slider with a region card or a picked album open does not move the camera.**
`src/app.js:95`: `regionChanged` and `pickChanged` ignore `stopChanged`. `src/app.js:103` only reframes when `S.framing` is set, and a region fly or a pick sets it to null (`app.js:100-101`). The stars morph away, the card stays, the region or the picked ring can end up off screen.
Fix: `regionChanged = region && (first || stopChanged || ...)`, same for `pickChanged`, tweened with the morph duration and ease as the album branch already does.

**B3. Header and page links drop the similarity stop and the prototype switches.**
`index.html:18,24,25,38`, `src/pages.js:23,44,53` are literal `#/`, `#/map`, `#/about`. `RMR.href` writes no stop for home, about or 404 (`src/app.js:35`), and `parse` defaults a missing stop to balanced (`app.js:26`). So: at Mood, open About, close it, and you are at Balanced after a morph you did not ask for. Clicking "Map" in the header beside an album at Sonic does the same. The app keeps the stop in its store (`frontcreck/src/lib/store.ts:10`) and it survives these moves. README's "the first seven persist while you navigate" is also untrue through these links.
Fix: treat a missing stop as "keep `S.stop`" (only an explicit `by` or `stop` changes it), and build the static links with `RMR.href`.

**B4. `/` stops working after any slider use.**
`src/search.js:131` returns for every `INPUT`. The slider is an `input[type=range]`, and the stop buttons hand focus to it (`src/panel.js:144`). The app exempts range inputs (`frontcreck/src/components/search/shortcut.ts`, the `type !== 'range'` test).
Fix: copy the app's test.

**B5. `/` does nothing on Home (desktop).**
`src/search.js:135` picks the first box whose `offsetParent` is not null. On Home the header search is `visibility: hidden` (`src/css/pages.css:12`), which still has an `offsetParent`, and it is first in `boxes` (attached in `Pages.init`, `src/pages.js:127`). `focus()` on a hidden element fails, and `preventDefault` has already run (`search.js:132`).
Fix: the app's `isShown` (client rects plus computed visibility), newest box first.

**B6. Focus is dropped on every album hop.**
`src/panel.js:29` replaces the panel's `innerHTML`. `#seed-title` has `tabindex="-1"` (`panel.js:37`) but nothing ever focuses it (the only `.focus()` calls are `panel.js:74,144`, `pages.js:67,79`, `search.js:123,132`). The app focuses the title after every in-app navigation (`frontcreck/src/components/album/AlbumPanel.tsx:86-90`). In the prototype, Enter on a closest album destroys the focused link and focus falls to `body`. The panel comes after the whole map in the DOM (`index.html:30-67`), so the tab path to the list is header, canvas, up to 8 region labels, slider, Explore this area, zoom buttons, and only then the panel. No screen-reader announcement of the new album either.
Fix: focus `#seed-title` when the seed changes and `S.started`.

**B7. Focus is lost when a region card or Explore card closes.**
`src/panel.js:82` empties the slot; `src/app.js:295` (Escape) and `panel.js:134` (close button) do not move focus. It falls to `body`, so arrow keys no longer pan (`app.js:285` listens on `#ov` only).
Fix: remember the opener (label, pointer, chip) and refocus it; otherwise focus `#ov`.

**B8. Entering the map from Home or About lands on Whole map, not Overview.**
`src/app.js:97-103`: on first load a page route sets `framed('whole')`. Going to `#/map` afterwards hits none of the branches, so the camera stays at Whole map (band A, label cap 8, `labels.js:82`). UX.md section 2 says Overview is the landing view. The fit button then goes to Overview, which reads as inverted.
Fix: when `prev` was a page and the new route is a bare map, tween to `framed('overview')`.

**B9. Closing an album never returns to where you were.**
`src/app.js:102` keeps the album camera for close, Escape and the header nav alike. The app saves the Explore camera on leaving and restores it on close, and only "Explore this area" stays put (`frontcreck/src/components/map/MapStage.tsx:215-232`). In the prototype Close and "Explore this area" are the same action (`app.js:44`, `panel.js:148`).
Fix: save the camera when leaving the map route, restore it in `closeAlbum`, keep the current behaviour for `#explore-here`.

**B10. Region labels in the fade band fail the 4.5:1 rule by construction.**
`src/labels.js:65` takes text opacity to 0.35 between cover sizes 13 and 22 px. `labels.js:111` solves the scrim for full-opacity text and then multiplies the scrim by the same 0.35. `shots/zoom-c.jpg` shows it: EPIC EXPANSE and ECLECTIC CLOUD are close to unreadable. The region fly lands in this band on purpose (`src/regions.js:56`, cap at 15.5 px covers, label alpha about 0.82), so every region-card view has under-contrast labels (`shots/map-region-card.jpg`).
Fix: full opacity until a single threshold, then off (the 200 ms CSS opacity transition is enough). Or solve the scrim for the faded opacity as the album branch does.

**B11. A label can sit on a focus line.**
`src/app.js:225` blocks a line with ten 24 px boxes at 10% steps. On a line longer than about 500 px the gaps between boxes (line length / 10 minus 24) exceed a label's height. The line to closest album 3 in `shots/album-5.jpg` is about 610 px. UX.md section 7 says never.
Fix: test the label box against the segment itself (`segRect` in `src/focus.js:77` already does this).

**B12. Region-card arrow keys are not a consistent walk.**
`src/panel.js:140` sorts the region and its 3 nearest by x and steps one place. From the data: at Balanced, Urban Cluster and Pastoral Nebula have no Right; The Quiet Deep, Aggressive Rift and Sombre Void have no Left; Right then Left fails to return for 6 of 17 regions. At Mood, Urban Cluster is not in any other card's "Next to" list (`src/regions.js:23`), so it cannot be reached by neighbours at all. A neighbour straight above counts as left or right by a hair.
Fix: one fixed order per stop (for example by angle around the map centre) so Left and Right are inverses and every region is on the loop. Up and Down can stay unused.

**B13. About closes to the map, not to where you came from.**
`src/app.js:295` and `src/pages.js:44`. The app goes back (`frontcreck/src/components/AboutClose.tsx:16-20`). Open About from an album and Escape: the album is gone.
Fix: `history.back()` when there is an in-app previous route.

**B14. A region link that no longer resolves is dropped without a word.**
`src/app.js:93` rewrites the URL and shows Overview. Same for a link opened at the wrong stop (`#/map?region=lonely` with `stop=sonic`).
Fix: toast, and try the other stops before giving up.

**B15. An interrupted morph labels the wrong set.**
Dragging the range from Sonic to Mood fires two `input` events. The second morph starts from the current `S.t` but `from` is `balanced` (`src/app.js:65`), so `labels.js:71` shows Balanced names at full strength while the stars are still near their Sonic positions.
Fix: when a morph is replaced mid-flight, keep the outgoing label set that is actually on screen.

Rough edges, not bugs:
- Label tab order is creation order (`src/labels.js:37`), so it is neither spatial nor by priority and changes as you pan.
- `selfCheck` covers Balanced only, at the framed camera (`src/app.js:363`). Sonic, Mood and user zoom are untested.
- README says "every state is in the URL hash". The camera is read from `cam=` (`app.js:105`) but never written.
- Labels re-place every frame. A blocked label jumps to another offset (22 to 78 px, `labels.js:11,94-99`) with no transition on `transform`, so names hop during a pan.
- `POINTER_CAP` is 4 (`src/config.js:47`); UX.md says 6.
- UX.md says fair labels are at 75% opacity. The CSS does not do that (`trifid.css:13`). Keep the CSS, fix the doc.

## 2. Design findings, ranked

**1. Blocker. Search now puts regions in the way of albums.**
Evidence: with a query, region rows come first and row 0 is preselected (`src/search.js:88-98`). The region matcher prefix-matches the name, the plain words and `top_words` (`search.js:60-61`). Typing `raw` and Enter goes to Raw Flare, not Raw Power. `live` goes to The Live Belt, not Live at Leeds. `dark` goes to a region, not The Dark Side of the Moon. At Balanced, 290 of 4,081 albums have a first title word that alone matches a region, and 550 by their first three letters. Also, focusing the empty field drops a 17-row region menu over the middle of the map (`shots/search-browse.jpg`); the app shows nothing until you type (`frontcreck/src/components/search/SearchBox.tsx:319-321`). So every `/` flashes a menu, and "type, Enter" lands somewhere new.
Fix: albums first, regions after them. Never preselect a region when an album matches. Match regions on name words only. Show nothing on empty focus; put the region menu behind its own control (a "Regions" button on the similarity card, or a `#` prefix).

**2. Blocker. The slider destroys your bearings.**
Evidence: B1, B2, B15. Even with those fixed, 8 of 17 Balanced names do not exist at Sonic and 11 do not at Mood, and nothing on screen says which albums went where. `shots/slider-sonic.jpg` has HEAVY where Epic Expanse was.
Fix: fix ids first. During the morph keep the camera on an anchor: the picked album, else the open region, else the album nearest the view centre, and keep a white ring on it through the morph. Persisting names travel; others fade in place. After the morph, one quiet line on the similarity card: "Named by sound: 6 of these places are new."

**3. Major. The keyboard loop is slower than the app.**
Evidence: B4, B5, B6, B7. Labels add up to 14 tab stops between the canvas and the slider, plus pointers, plus five colour words. No shortcut for the stops, for the next closest album, or for labels.
Fix: the four bug fixes. Take labels out of the tab sequence (roving tabindex: one stop, arrows move between names). Add `1` `2` `3` for stops, `j` `k` to move through closest albums with Enter to open, `l` to toggle names, `0` for fit.

**4. Major. The band between names and covers is the worst-looking part of the map, and it is where people rest.**
Evidence: cover size 13 to 26 px has names at 35 to 82% (B10), covers as half-faded dark boxes (`src/overlay.js:99`), gas at 60%. One press of `+` from Overview lands at 20 px: names dimmed, covers at 2% alpha, nothing gained. Region fly lands at 15.5 px. `shots/zoom-c.jpg`.
Fix: names at full strength to 18 px, then off in one step with the chip taking over at the same moment. Covers fade 20 to 28 px. Cap the region fly at 12.5 px so it stays in band B with pointers and full-strength names.

**5. Major. Using a region costs you your place.**
Evidence: the chip appears only when zoomed in (`src/labels.js:156`), and clicking it flies out to 15.5 px covers centred on the hull (`src/regions.js:56`). "IN PLAYFUL WAY" in the panel closes the album (`regions.js:43`). A "Best known here" cover replaces the region card with the Explore card (`src/panel.js:135`), then needs "See closest albums": three actions from region to album, and the region card is gone.
Fix: the chip opens the card without moving the camera. A best-known cover opens the album directly (hover already names it). Beside an album, the region line opens the card over the map and keeps the panel. Keep the region name as a line on the Explore card with a back link (it is there; make it reopen the card without a fly).

**6. Major. No way to turn names off, and they churn on every hop.**
Evidence: beside an album up to 8 names at 60% are re-placed each time the camera reframes (`labels.js:82,104`), with 200 ms fades. For someone hopping every few seconds this is motion that carries no new information.
Fix: a names toggle on the map (and `l`), remembered locally. Beside an album show only the seed's region and at most two neighbours.

**7. Major. Nothing protects a weekly visitor from a rebuild.**
Evidence: B14. Ids are already unstable across stops (B1), so they will be across rebuilds. No signal that a name moved or went.
Fix: the pipeline emits an alias table (old id to new id, or to "gone, nearest is X"). The app redirects and says so once: "Playful Way is now part of Warm Halo." Stable ids by member overlap, as HANDOFF already asks.

**8. Major. Map state is only half linkable, and Back is lossy.**
Evidence: no camera in the hash; B8, B9, B13. There is a copy-link button on the album only.
Fix: write `cam=` with `replaceState` when the camera settles (debounced), restore the Explore camera on close, add copy link to the region card.

**9. Minor. "Why are these two close" is unanswered at Sonic.**
Evidence: rows say "Shares melodic, uplifting" at every stop (`panel.js:48`), which are mood words. At Sonic that is the wrong reason.
Fix: at Sonic show the two closest audio traits ("similar tempo and loudness"). At Balanced show one of each.

**10. Minor. Covers beside an album at cover zoom are busier than the app.**
Evidence: `shots/album-gold-covers.jpg`. The similarity card and "Explore this area" sit on covers, lines cross dimmed covers, and the 30% gas gives a mid-brown ground where the app has near-black.
Fix: gas to 15% in band D and beside an album. Dim non-focus covers to 30% rather than 40%.

**11. Minor. Edge pointers are the weakest text on the map.**
Evidence: 12.5 px, shadow only, no scrim solve (`trifid.css:30-32`), on the brightest rose gas along the top edge (`shots/map-overview.jpg`). They vanish at 13 px covers, so a region view has none.
Fix: give them the label scrim solve, or a plate like the chip.

**12. Minor. The anchor dot reads as a bright star.**
Evidence: white 2.4 px dot with a dark ring (`overlay.js:51-52`) against a 2.6 px first-class star. It is at a true album position, so it is honest, but it suggests a famous album.
Fix: a hollow ring.

**13. Minor. "Between A and B" can contradict the map.**
Evidence: `shots/album-5.jpg`: the panel says between Eclectic Cloud and The Bittersweet Reach, the map shows PLAYFUL WAY directly over the group. `regions.js:28` ranks by centre distance minus radius, not by hull.
Fix: rank by distance to the hull, or show nothing.

**14. Minor. Small losses against the app.** No typo fallback, no persisted trail (both declared in README), "Show more" resets on every hop.

## 3. What works

- Selection over gas: white lines with dark casing, white seed frame, inverted hot badge. Readable on rose, gold and teal in the shots. Self-check: 80 layouts at 5 and 10 closest albums, none with a hidden line, a cover on a line, or an overlap (Balanced only).
- Still at rest. One on-demand frame loop; no timers that draw.
- The evidence sentence under a hovered name, and the same sentence on the card.
- "Best known here" gives keyboard users their first way to reach an album from the map without search.
- Album, stop, list length, region and pick are all in the hash, and slider moves do not pile up history entries.

## 4. Scores

| | /10 |
|---|---|
| Speed of the core loop | 5 |
| Legibility of selection | 8 |
| Usefulness of regions | 5 |
| Keyboard | 4 |
| Overall | 5 |

The map and the selection drawing are ready. The interaction layer is not: search and the keyboard path are both worse than the current app, and region identity across stops is wrong in the data.
