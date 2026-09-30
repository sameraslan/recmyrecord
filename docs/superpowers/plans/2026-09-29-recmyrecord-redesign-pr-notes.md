# recmyrecord redesign: pull request notes

## Title

Redesign recmyrecord: a static, dark listening-room site built around one persistent map

## Body outline

### 1. Summary

- A visitor searches for an album (or picks one from the shelf, "Surprise me" or the map) and gets the albums closest to it, by sound and by mood, with a slider that leans the comparison toward sound or toward mood.
- One map of 4,000+ albums stays on screen across every route: dimmed behind Home, explorable on `/map`, and framed around the album and its closest albums on each album page.
- The site is fully static: every album page is prerendered, and the data is JSON and image files in `frontcreck/public/data/`. There is no API, database or secret at runtime; the only outside requests are Spotify cover images and links out to Spotify.
- Desktop and phone layouts, keyboard paths to every action, and zero axe violations on every route and open state.

### 2. What changed

- Data pipeline (`data-pipeline/`, new): builds every served file from the recommender's feature table and the map's cover sprites, with a validator and pytest suite. Cleans glued artist credits, applies the verified cover, Spotify and artist corrections in `overrides.json`, and picks ambient colours per album.
- App rewrite (`frontcreck/`): Next 16, React 19, Tailwind 4, Zustand, and a three.js point-sprite map rendered on demand.
- Routes: Home (search, "Explore the map", "Surprise me", shelf), Explore (`/map`: hover label, card, zoom controls, hint), Album (`/album/[slug]?by=`: trail, seed header, closest albums, show more, Spotify links, copy link, linked map with numbered covers, three-stop slider with a morphing map), About, 404, and an inline data error with retry.
- Phone layouts below 900 px: single-column album with a map preview strip, a Map / List toggle, a full-screen map mode, a bottom card on Explore, a search sheet, 44 px tap targets.
- Search: lazy index built on first focus, word-prefix matching with a typo fallback, thumbnails, highlighted matches, combobox ARIA, `/` shortcut.
- Removed: Chakra UI, Emotion, framer-motion, react-icons, react-use, Prisma and its `postinstall`, the `/insights` page, `/api/albums`, `/api/artists`, `public/map.jpg` and other unused assets. Old URLs (`/recommend...`, `/insights...`) redirect to `/`.
- `frontcreck/.env` is no longer tracked and is ignored; the site needs no environment variables.

### 3. Recommendations and map now agree

- Three slider stops use the recommender's own weighting (`descriptors / slider**3`): Sonic 5, Balanced 2.0 (the default), Mood 0.5.
- Mood 0.5 is the old live behaviour, verified: In Rainbows returns the same list as the live site. A pytest and an end-to-end test both check it.
- The map layouts were regenerated with UMAP from the same feature matrix at each stop, so an album's recommendations sit in its neighbourhood on the map (median map rank about 21 to 35 instead of about 800).
- Recommendations are computed over the whole catalog, which removes the old row cap on candidates.

### 4. Quality

Final `npm run perf` (headless Chrome, 1440 x 900 and 390 x 844; software rendering is SwiftShader, GPU rendering is Metal on an Apple M1 Pro). All budgets met.

- First-load JavaScript of `/`: 189.4 KB gzipped (budget 200 KB), counting the `nomodule` polyfill that modern browsers skip; three.js is not on the first load. Server HTML: `/` 27.7 KB, an album page 33.6 KB (budget 150 KB each).

| Measure | Budget | software desktop | software phone | GPU desktop | GPU phone |
|---|---|---|---|---|---|
| Search usable after load | 1000 ms | 72 ms | 101 ms | 80 ms | 69 ms |
| Worst long task at startup | 250 ms | 0 ms | 0 ms | 0 ms | 0 ms |
| Typing to suggestions | 100 ms | 5 ms | 7 ms | 6 ms | 5 ms |
| Select to album content | 200 ms | 22 ms | 26 ms | 26 ms | 21 ms |
| Slider stop to list change | 150 ms | 6 ms | 55 ms | 12 ms | 12 ms |
| Worst frame gap: transition, morph, drag, zoom | 50 ms (GPU) | 1292, 150, 85, 192 ms | 424, 172, 72, 39 ms | 29, 18, 19, 42 ms | 18, 18, 18, 36 ms |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 |
| Frames drawn while idle (3 s) | at most 1 | 0 | 0 | 0 | 0 |

The frame-gap budget applies to GPU rendering; software rendering is reported for reference. A known flake: the GPU phone zoom gap can pass 50 ms in about one run in ten while a cover sheet uploads; it did not occur in this run.

- Accessibility: axe (WCAG 2 A and AA, 2.1 A and AA) reports zero violations on every route and every open state (search list, card, phone sheet, map mode, About, 404, data error); skip link, landmarks, a title per route, visible focus rings, keyboard paths to every action, 44 px tap targets on phones.
- Tests in the final run: Vitest 241 passed; Playwright 164 passed and 50 skipped by design (94 desktop, 68 phone, 2 with WebGL turned off; the skips are desktop-only or phone-only tests in the other project); pytest all passed (one test skipped: it compares sprites with the map's atlases and needs the map checkout); the data validator passed; lint, typecheck and build passed.

### 5. Copy for sign-off

The full table is below ("Copy table for sign-off"). Every visible string and every screen-reader label comes from `frontcreck/src/lib/copy.ts`.

### 6. Screenshots

`npm run shots` writes these to `frontcreck/test-results/review/` (attached to the PR). Sizes: `d1440` (1440 x 900), `d1280` (1280 x 800), `m390` (390 x 844, phone).

- `a1-home`, `a2-home-search`, `a3-search-none`: Home, with suggestions, with no match.
- `c1-explore`, `c2-explore-card`, `c3-explore-zoomed`: Explore overview, a picked album's card, zoomed in to covers with a hover label.
- `d1-album`, `d2-album-sonic`, `d3-album-mood`: In Rainbows at each slider stop.
- `d4-album-deeper`: one step deeper, with the trail.
- `d5-album-longtitle`: a long title.
- `e2-error`: the data error with retry.
- `f1-about`: About.
- `g1-transition-mid` (desktop only): the entry transition from Explore into an album, mid-way.
- `h1-album-mapmode` (phone only): the album's full-screen map mode.

### 7. Known data problems

From `data-pipeline/README.md`:

- 34 Spotify URIs in the feature table are assigned to two or three different albums (69 rows); the pipeline keeps the first row and drops the other 35.
- Some Spotify URIs point at a different album. The verified ones (19, from a list kept in the personal-site repository, `<personal-site-repo>`) are corrected in `overrides.json` with images under `data-pipeline/overrides/`: the right Spotify link, cover, sprites and ambient colours, and for one album the credited artist (the Magnolia Electric Co. album is now credited to Songs: Ohia). Their positions and recommendations still come from the wrong album's audio features, because Spotify no longer serves audio features.
- "One" by Neal Morse shows a Neal Francis sleeve. Unverified, so not corrected.
- "Chill Out" (The KLF), "Gimix" (The Avalanches) and "Dark & Long" (Underworld) have no Spotify release: no Spotify link is shown for them, and they show a typographic letter tile instead of a cover.
- "Spiritual Unity" (Albert Ayler Trio) has no cover and shows a letter tile.
- 73 albums have no mood descriptors and 2,169 have fewer than ten.
- The feature table has 176 descriptor columns (the design spec says 175).
- Cluster ids from the map pipeline are unbalanced; the site only uses them for dot colours.
- Artist cleaning only drops a glued tail that repeats a name from the credit.
- The catalog is frozen because Spotify no longer serves audio features.

### 8. Owner actions, out of scope

- `frontcreck/.env` is no longer tracked; the site needs no environment variables. The old variables in the Vercel project are unused and can be removed from the Vercel dashboard.
- Remove the legacy virtualenv `recVenv/` when convenient.
- Shut down the Heroku app; nothing calls it any more.
- Production deploys from the `recmyrecord` branch, so merging this PR into `main` does not deploy it. When ready, point Vercel's production branch at `main`, or merge `main` into `recmyrecord`.

### 9. UX review punch list

All items are ticked; see "UX review punch list" below.

### 10. For the owner to decide

See "For the owner to decide" below. Each item names the choice made, the alternative, and what it costs if the choice is wrong.

### 11. Dependency audit

- `npm audit` flagged two dev-only packages: `vitest` 4.1.6 through `@vitest/mocker` (moderate: path traversal through a redirect mock) and `postcss` 8.5.14 (high: arbitrary `.map` file reads through source map auto-loading).
- Both have patched releases in the same major. The exact pins were bumped to `vitest` 4.1.11 and `postcss` 8.5.28, the lockfile was regenerated with npm 11, and stock `npm ci` (npm 10) installs it.
- `npm audit` now reports 0 vulnerabilities. Neither package reaches the served site: both run only in tests and the build.

### 12. Last line

The body ends with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Deployment note

- Vercel project root: `frontcreck/`. Node: `20.x` (`engines.node`).
- No environment variables are needed. The old ones in the Vercel project are unused; remove them when convenient.
- `next build` prerenders one page per album, 4,000+ pages. A local build takes about 18 s; `.next/server/app/album` holds about 24,500 files and 391 MB on disk (each album has its HTML, its RSC payload and per-segment prefetch files).
- Production deploys from the `recmyrecord` branch today, so merging to `main` does not ship by itself.
- To check on the PR's Vercel preview before merging: that the build fits Vercel's output limits with this many prerendered files (each album has its HTML, its RSC payload and Next 16.3's per-segment prefetch files), and that `npm ci` works on Vercel's Linux image with the lockfile generated by npm 11 (it includes the Linux binaries; stock npm 10 `npm ci` works locally).

## README drafts for review

Both READMEs were rewritten: `README.md` (what the project is, the repository layout, how to run the site and rebuild the data) and `frontcreck/README.md` (requirements, commands, how the app works, deployment). Please read them together with the copy table below; they follow the same copy rules.

## UX review punch list

Every state at every size was compared with the approved mockup's screenshot of the same state (`d1280` states without a mockup shot were compared with the `d1440` shot). Each difference is either fixed, with its commit, or marked approved with the reason. No item is open.

Fixed:

- [x] d1440, d1280, m390 d1-album to d5-album-longtitle, g1-transition-mid, h1-album-mapmode: the dots around an album were drawn at 0.85 of their overview size, visibly smaller than the mockup's, which only fades them -> the shader keeps their size and only fades them (`fix(frontcreck): keep map dots at their overview size in album view`).
- [x] d1440, d1280, m390 a1-home, f1-about: the dimmed map's dots were smaller than the mockup's muted dots (radius x 1.35) -> the dimmed map draws its dots 1.35 times larger, easing with the dim (`fix(frontcreck): draw the dimmed map's dots larger, as the mockup does`).
- [x] d1440, d1280, m390 e2-error: the error message was one paragraph in the interface face; the mockup sets the first sentence as a serif heading line and the second under it -> heading line and detail line, same text (`fix(frontcreck): show the data error as a heading line and a detail line`).
- [x] d1440, d1280, m390 every state with a search field: the placeholder and query sat 2 px left of the mockup's (Tailwind's preflight removes the browser's default input padding that the mockup keeps) -> the padding is restored (`fix(frontcreck): restore the search input's inner padding`).
- [x] d1440, d1280 d1-album to d5-album-longtitle, g1-transition-mid: the mockup keeps the hint line under the map beside an album ("... Select one to start from it."); ours only showed it in Explore -> shown beside an album on desktop with the mockup's wording, a new `copy.ts` string listed in the copy table (`fix(frontcreck): show the map hint beside an album on desktop`).
- [x] d1440, d1280 c3-explore-zoomed: the mockup shot hovers In Rainbows and shows its label; the review script did not hover -> the script now points at In Rainbows once the zoom settles; the label, its position and the hover mark match the mockup (script change only).

Approved differences (not changed):

- [x] d1440, d1280, m390 a1-home, a2-home-search, a3-search-none: Home combines the map background (Home A) with the cover shelf (Home B) and "Explore the map" and "Surprise me"; the header stays transparent and there is no Home B glow -> approved change (combined Home).
- [x] all sizes a1-home: the hero sub reads "Get the albums closest to it, by sound and by mood." and the link reads "Explore the map" -> approved copy (no count of recommendations).
- [x] d1440, d1280 a1-home: the search field is focused on load, so its border is lamp and the "/" key hint is hidden -> spec 4.1 (desktop Home autofocuses the hero search). The focus border's strength is listed for the owner below.
- [x] d1440, d1280 a1-home: the shelf shows 12 covers per row and reaches the page gutters (the mockup shows 10) -> spec 4.1 (12 per row), controller ruling.
- [x] m390 a2-home-search: suggestions open under the field near the top of the page, where mockup Home A had its hero at the bottom -> follows from the combined Home layout.
- [x] m390 a1-home: the lede wraps to two short, even lines -> `text-wrap: balance`; listed for the owner below.
- [x] m390 a1-home: the Home map sits lower and reads a little brighter than in mockup Home A, where the hero sits at the bottom of the screen -> follows from the combined Home layout; the dot size is fixed above.
- [x] d1440, d1280, m390 c2-explore-card: a pick flies in until covers show, and the pick is drawn large, framed in lamp, with the other covers dimmed; the mockup shot was staged at dot level -> controller ruling (the mockup's own pick path lands in cover mode); listed for the owner below.
- [x] d1440, d1280 c2-explore-card: the card is 400 px wide (mockup 380 px) -> room for the label "See closest albums" (approved copy).
- [x] d1440, d1280, m390 c3-explore-zoomed: the zoom level differs a little from the mockup shot -> a capture difference (the script zooms from In Rainbows by a fixed factor), not a layout difference.
- [x] all sizes d1-album: no "Visited" trail and no hovered row -> the mockup shot was staged after visiting Kid A with row 2 hovered; ours is a direct load. d4-album-deeper shows the trail.
- [x] all sizes d1-album, d2-album-sonic, d5-album-longtitle: some "Shares" lines list fewer words than the mockup (no "romantic", "ethereal", "quirky") -> shared words are limited to the seed's visible tags, so that hovering a row can light each one up (Task 4 ruling).
- [x] all sizes d1-album to d5-album-longtitle: a "Show more" link under the list -> spec 4.3 (more rows on request, "Show more" / "Show fewer").
- [x] all sizes d1-album to d5-album-longtitle: the heading reads "Closest albums" -> approved change (the mockup's heading stated a count).
- [x] all sizes d4-album-deeper: the hot badge, seed frame and hot line use a different accent colour from the mockup -> accents are computed per album by the pipeline (the mockup's were hand-picked); badge digits use the room colour for contrast (controller ruling).
- [x] all sizes d1-album to d5-album-longtitle: ambient wash hues differ slightly from the mockup's hand-picked pairs -> Task 2d washes, a draft pending the owner's approval (listed below).
- [x] all sizes d5-album-longtitle: markers are spread apart where the mockup lets cover 5 overlap the seed -> focus marker layout keeps every cover readable (Task 7).
- [x] all sizes f1-about: no stop diagrams, no data table, no "Made by" and no catalog count -> approved changes (About copy per spec 8).
- [x] all sizes f1-about: the header stays visible and undimmed above About -> spec 4 (header on every route; About is a page over the dimmed map, not a modal over the header).
- [x] m390 c1-explore to c3-explore-zoomed, d1-album, h1-album-mapmode: the similarity panel is taller than the mockup's -> 44 px tap targets for the stops and the range on phones (controller ruling); marker, card and zoom positions follow its measured height.
- [x] m390 d4-album-deeper: the trail row is 44 px tall, so the seed sits 16 px lower than in the mockup -> 44 px tap targets for trail links.
- [x] m390 h1-album-mapmode: the List button shows a list glyph where the mockup reuses the map glyph -> kept: the glyph matches the label (Task 11).
- [x] all sizes e2-error: the mockup shows a recommendations error inside the album list; ours is the data-fetch error on the map -> album pages are fully static, so only the data fetch can fail (controller ruling; the message style now matches).

## For the owner to decide

Each item: the choice made; the alternative; what it costs if the choice is wrong.

Design and behaviour:

- Ambient washes (Task 2d, a draft): the pipeline picks each album's two wash colours to read like the mockup's hand-picked pairs (second colour by hue distance, the more visible one first). Alternative: the earlier washes (the two most dominant colours). A contact sheet of before and after will be sent separately for approval. If wrong: one pipeline rebuild reverts the `w` field of `albums.json`.
- First-load JavaScript budget: the perf script counts every `<script src>` of `/`, including the `nomodule` polyfill that modern browsers never download (189.3 KB gzipped with it, 150.7 KB without; budget 200 KB). Alternative: count modern bundles only. If wrong: the budget has less headroom than it shows, and a later change could fail on bytes no user downloads.
- Search: every query word must start a word of the title or artist, ranked title first; Fuse.js runs only as a typo fallback when nothing matches (4 to 16 characters, after a 160 ms pause). The spec says "Fuse.js over title and artist". Alternative: Fuse.js for every query. If wrong: `search.ts` and the SearchBox scheduling change; typo suggestions appear a moment later today.
- Search field focus: a 1 px lamp border with a soft 1 px lamp halo (and a solid outline in forced-colours mode), instead of the global 2 px focus ring, to keep the mockup's look. Alternative: the standard 2 px ring. If wrong: one CSS rule.
- A pick on the map flies in until covers show and draws the pick large and framed, with the other covers dimmed (the mockup's own pick path lands there; its screenshot was staged at dot level). Alternative: stop at dot level. If wrong: one zoom target.
- Phone map mode: a pick in the album's full-screen map opens that album in list view, and map mode belongs to the album it was opened on. Alternative: the mockup's Explore-style card on the map. If wrong: a change in the album panel and map mode state.
- Phone Map / List button: accessible names are "Open the map" and "Back to the list" (they contain the visible words, as WCAG 2.5.3 asks, and match the mockup). Alternative: names equal to the visible "Map" and "List". If wrong: two strings.
- Phone Home lede uses `text-wrap: balance`, so it breaks into two short, even lines. Alternative: normal wrapping (one long line and a short one). If wrong: one CSS property.
- Default slider stop is Balanced (2.0). Alternative: Mood (0.5), which is what the old live site returned. If wrong: one default; album URLs without `?by=` would show the other list.
- Trail: revisiting an album already on the trail cuts the trail back to it (as the mockup does). Alternative: keep appending. If wrong: a small change in `trail.ts`.
- Album view hint: the hint line under the map beside an album uses the mockup's wording, "Albums that sit close together sound or feel alike. Select one to start from it." (new string, not in the spec's draft). Alternative: the Explore hint only, or no hint beside an album. If wrong: one string or one condition.
- Narrow layout breakpoint is 899 px (the mockup's), not the spec's "under 640 px"; every phone requirement still holds at 640 px and below. If wrong: one media query constant and `phone.css`.
- The hover label appears after an 80 ms settle (a show delay, not a transition). If wrong: one constant.
- A cover shows an empty reserved box while its image loads; the letter tile is only for failures. Alternative: a letter tile while loading. If wrong: one state in `Cover.tsx`.
- The three albums with no Spotify release, and "Spiritual Unity", show a letter tile instead of their sprite; no Spotify link is shown for them. Alternative: a data field so the cover component can use the sprite. If wrong: a data-contract field and a few lines in `Cover.tsx`.
- Visible copy uses the typographic apostrophe, as the mockup does.
- Map drawing follows the mockup over the plan's sprite formulas (cover size linear in map scale, dots of 3 to 7 px that grow gently with zoom, maximum zoom 28). If wrong: constants in one module.
- Markers over the map take no pointer input; the map hit-tests them, so a drag can start on a cover. If wrong: dragging from covers regresses (an end-to-end test guards it).
- On phones the similarity panel is measured at runtime and treated as a bottom exclusion for framing and markers (Safari's toolbar changes its height). If wrong: a little extra code.
- The similarity stops and range are 44 px tap targets on phones (the mockup's are smaller). If wrong: one media query.
- On the dimmed map (Home, About, 404) the canvas is labelled as a non-interactive image. If wrong: two lines.
- Album pages have no loading route: they are fully static, so it would never show in production, and mounting it delayed hydration and broke Escape. If wrong: a three-line file restores it.

Testing and scope:

- The keyboard-only search flow and the sandboxed-iframe flow run at desktop size only (the spec lists the flows at desktop and phone sizes). If wrong: two phone variants to add.
- Slug generation is tested in the Python pipeline (pytest), not with Vitest (the spec lists slugs among the Vitest unit tests). If wrong: a small Vitest file.
- About 35 screen-reader and helper strings are not in the spec's copy table; all are in the copy table below for sign-off.
- The `window.__rmr` test hook ships in the production build, because the end-to-end tests run against it. Alternative: gate it behind a query flag. If wrong: a few lines and a test setting.
- The perf script fails GPU mode when the renderer string is empty or "n/a", so a failed query never passes as hardware. If wrong: one condition.

Data:

- "One" by Neal Morse shows a Neal Francis sleeve; unverified, so not in `overrides.json`. If wrong: one override entry.
- `overrides.json` has an optional artist field; the corrected album's slug follows the corrected artist (keyed by the feature-table slug). Album pages did not exist yet, so no published URL changed. If wrong: one slug reverts.
- Albums with no Spotify release reuse the contract's empty Spotify id. If wrong: a contract field.
- Glued artist credits are cleaned in the pipeline before slugs are made (added as Task 2b, outside the plan). If wrong: one rebuild of `albums.json`.
- The data README keeps the counts of data defects (albums without mood descriptors, duplicate URIs); they describe problems, not the catalog size. If wrong: two README lines.

Repository and process:

- `frontcreck/AGENTS.md` and `frontcreck/CLAUDE.md` are untracked files written by `next dev`; they are not in this PR. Choose: delete them, commit them, or add them to `.gitignore`. If left alone: they reappear as untracked files after every `next dev`.
- The `design/` folder (the mockups, about 110 MB) is untracked and lives only in the working copy this work was done in; it is not in the PR. Decide whether to keep it somewhere.
- A local, untracked `frontcreck/.env`, if one is present in a checkout, is still read by `next build`; the site does not use it. Delete it locally when convenient.
- Commit co-author trailers are mixed: 41 commits name Claude Opus 5.5 and 8 name Claude Fable 5.1. If this matters: squash on merge, or reword before merging.
- `next` and `eslint-config-next` were moved to 16.3.3, the lowest patched 16.x, because the planned version had a critical advisory.
- The lockfile is generated with npm 11 (stock npm 10 crashes resolving vitest 4); stock `npm ci` installs it. Verify `npm ci` on Vercel's Linux image with the PR preview.
- `favicon.ico` was re-encoded as RGBA because `next build` rejected the original. If wrong: replace the icon.
- The Vercel project's dashboard environment variables are outside the repository; check and remove them.
- `/map` and `/about` had placeholder pages until they were built, so every link target existed at every commit. One commit carried an expected-failing test until the data files landed.
- The album search prefetches album URLs without a placeholder album route (album pages came later in the plan).
- Tasks 1 and 2 (data) ran alongside Task 3 (app scaffold) on disjoint files; a pre-flight conflict scan was delegated and its findings folded in as fix rounds.
- In Task 2b the implementing agent edited data-pipeline files through the shell after its file tools were refused in the data working copy; the changes are confined to `data-pipeline/` and `albums.json`.
- Publishable text (READMEs, these notes) follows the copy rules: no owner name, no exact catalog size ("4,000+"), no count of recommendations, and placeholders instead of home-directory paths.
- Log entries mentioning the owner with no decision attached: implementers and reviewers ran on the model the owner asked for; one session was paused and resumed at the owner's request.

## Copy table for sign-off

### Spec section 8, as shipped

| Place | Text as shipped | Note |
|---|---|---|
| Wordmark | recmyrecord | |
| Nav | Map, About | |
| Hero | Start with an album you like. | |
| Hero sub | Get the albums closest to it, by sound and by mood. | |
| Search placeholder | Search albums or artists | |
| Home buttons | Explore the map / Surprise me | |
| Shelf label | Or start from one of these | shown in small capitals |
| No matches | No album matches {query}. Try the artist’s name, or fewer words. | typographic apostrophe |
| Trail label | Visited | |
| Seed actions | Open in Spotify / Copy link / Link copied | |
| List heading | Closest albums | |
| Row | Shares {words} | |
| More | Show more / Show fewer | |
| Slider | Similarity: Sonic, Balanced, Mood | |
| Stop notes | Closest in sound. / Sound and mood together. / Closest in mood. | |
| Map hint | Albums that sit close together sound or feel alike. | Explore; beside an album see `map.hintAlbum` |
| Map card | See closest albums / Spotify | |
| Phone | Map / List | |
| Error | The albums didn’t load. Check your connection, then try again. / Try again | (differs from spec: shown as a heading line and a detail line, same words; typographic apostrophe) |
| No WebGL | The map needs WebGL, which this browser has turned off. Search and lists still work. | |
| 404 | That page isn’t here. Search for an album, or explore the map. | typographic apostrophe |
| About title | How it works | |
| About body 1 | Every album here is described two ways. Its sound comes from Spotify’s audio values, such as energy, tempo and acousticness. Its mood comes from handpicked RateYourMusic descriptors, such as melancholic, lush or atmospheric. | |
| About body 2 | Pick an album and you get the ones closest to it once both are combined. The slider leans the comparison toward sound or toward mood. | |
| About body 3 | The map places 4,000+ albums so that ones that sound or feel alike sit close together. | |
| About credits | Mood descriptors handpicked from RateYourMusic. Sound values from Spotify. Cover art from Spotify. | |
| Page titles | recmyrecord / {Album} by {Artist} · recmyrecord / Map · recmyrecord / About · recmyrecord | 404: Not found · recmyrecord (differs from spec: the spec lists no 404 title) |
| Meta description | Pick an album you like and get the albums closest to it, by sound and by mood. | |

### Every string in `copy.ts`

Generated from `frontcreck/src/lib/copy.ts` with the TypeScript compiler. Placeholders: {title}, {artist}, {query}, {url}, {words} (a list joined with commas). Strings that are not in the spec's draft are marked.

| Key | Text | Note |
|---|---|---|
| `CATALOG_SIZE_LABEL` | 4,000+ | the only catalog number; used in About body 3 |
| `wordmark` | recmyrecord |  |
| `skip` | Skip to content | not in the spec's draft: skip link |
| `nav.label` | Main | not in the spec's draft: label of the header navigation |
| `nav.map` | Map |  |
| `nav.about` | About |  |
| `hero` | Start with an album you like. |  |
| `heroSub` | Get the albums closest to it, by sound and by mood. |  |
| `search.placeholder` | Search albums or artists |  |
| `search.label` | Search albums or artists | not in the spec's draft: label of every search field |
| `search.hint` | Type to see matching albums. Up and down arrows move, Enter chooses. | not in the spec's draft: screen-reader hint on every search field |
| `search.listLabel` | Matching albums | not in the spec's draft: label of the suggestion list |
| `search.open` | Search albums | not in the spec's draft: phone header search button |
| `search.close` | Close search | not in the spec's draft: phone search sheet close button |
| `search.sheetLabel` | Search albums | not in the spec's draft: label of the phone search sheet |
| `search.noMatches()` | No album matches {query}. Try the artist’s name, or fewer words. |  |
| `search.found` | Matching albums listed | not in the spec's draft: screen-reader announcement when suggestions appear |
| `search.none` | No albums found | not in the spec's draft: screen-reader announcement when nothing matches |
| `home.explore` | Explore the map |  |
| `home.surprise` | Surprise me |  |
| `home.shelfLabel` | Or start from one of these |  |
| `home.shelfListLabel` | Albums to start from | not in the spec's draft: label of the shelf list |
| `home.albumLabel()` | {title} by {artist} | not in the spec's draft: label of each shelf cover |
| `album.trailLabel` | Visited |  |
| `album.trailNav` | Albums visited | not in the spec's draft: label of the trail navigation |
| `album.trailMore` | … | not in the spec's draft: glyph for trail entries left out |
| `album.openInSpotify` | Open in Spotify |  |
| `album.newTab` | (opens in a new tab) | not in the spec's draft: added to the label of every link that opens a new tab |
| `album.copyLink` | Copy link |  |
| `album.copyLinkLabel` | Copy link to this page | not in the spec's draft: label of the copy link button |
| `album.linkCopied` | Link copied |  |
| `album.copyFailed()` | Could not copy. The link is {url} | not in the spec's draft: toast when the clipboard is blocked |
| `album.listHeading` | Closest albums |  |
| `album.shares()` | Shares {words} |  |
| `album.showMore` | Show more |  |
| `album.showFewer` | Show fewer |  |
| `album.close` | Close and return to the map | not in the spec's draft: label of the album close button |
| `album.tagsLabel` | Mood descriptors | not in the spec's draft: label of the mood tags |
| `album.rowLabel()` | {title} by {artist}. Shares {words} | not in the spec's draft: label of each row link (the "Shares" part only when there are shared words) |
| `album.rowSpotify()` | Open {title} in Spotify (opens in a new tab) | not in the spec's draft: label of each row's Spotify button |
| `album.regionLabel()` | {title} and the closest albums | not in the spec's draft: label of the album region |
| `slider.label` | Similarity |  |
| `slider.stops.sonic` | Sonic |  |
| `slider.stops.balanced` | Balanced |  |
| `slider.stops.mood` | Mood |  |
| `slider.notes.sonic` | Closest in sound. |  |
| `slider.notes.balanced` | Sound and mood together. |  |
| `slider.notes.mood` | Closest in mood. |  |
| `map.heading` | Map of albums | not in the spec's draft: visually hidden heading of /map |
| `map.hint` | Albums that sit close together sound or feel alike. |  |
| `map.hintAlbum` | Albums that sit close together sound or feel alike. Select one to start from it. | not in the spec's draft: hint beside an album, from the approved mockup |
| `map.canvasLabel` | Map of albums. Drag or use arrow keys to pan, plus and minus to zoom. | not in the spec's draft: label of the map canvas |
| `map.canvasLabelStatic` | Map of albums | not in the spec's draft: label of the dimmed map canvas |
| `map.zoomIn` | Zoom in | not in the spec's draft: zoom button label |
| `map.zoomOut` | Zoom out | not in the spec's draft: zoom button label |
| `map.reset` | Reset view | not in the spec's draft: reset view button label |
| `map.cardPrimary` | See closest albums |  |
| `map.cardSpotify` | Spotify |  |
| `map.cardClose` | Close | not in the spec's draft: label of the card close button |
| `map.noWebgl` | The map needs WebGL, which this browser has turned off. Search and lists still work. |  |
| `map.preview` | Map preview of the album and its closest albums | not in the spec's draft: label of the phone map preview strip |
| `map.openMap` | Open map | not in the spec's draft: phone map preview strip link |
| `phone.map` | Map |  |
| `phone.list` | List |  |
| `phone.mapLabel` | Open the map | not in the spec's draft: accessible name of the Map button |
| `phone.listLabel` | Back to the list | not in the spec's draft: accessible name of the List button |
| `cover.noInitial` | · | not in the spec's draft: letter tile glyph for a title with no letter or digit |
| `error.body` | The albums didn’t load. Check your connection, then try again. | spec text; the whole message, where it is one line (search list, toast) |
| `error.title` | The albums didn’t load. | not in the spec's draft: first line of the error panel |
| `error.detail` | Check your connection, then try again. | not in the spec's draft: second line of the error panel |
| `error.retry` | Try again |  |
| `notFound.title` | Not found | not in the spec's draft: 404 page title, shown as 'Not found · recmyrecord' |
| `notFound.body` | That page isn’t here. Search for an album, or explore the map. |  |
| `notFound.mapLink` | Explore the map | not in the spec's draft: 404 link to the map |
| `about.title` | How it works |  |
| `about.body[0]` | Every album here is described two ways. Its sound comes from Spotify’s audio values, such as energy, tempo and acousticness. Its mood comes from handpicked RateYourMusic descriptors, such as melancholic, lush or atmospheric. |  |
| `about.body[1]` | Pick an album and you get the ones closest to it once both are combined. The slider leans the comparison toward sound or toward mood. |  |
| `about.body[2]` | The map places 4,000+ albums so that ones that sound or feel alike sit close together. |  |
| `about.credits` | Mood descriptors handpicked from RateYourMusic. Sound values from Spotify. Cover art from Spotify. |  |
| `about.close` | Close | not in the spec's draft: label of the About close button |
| `titles.home` | recmyrecord |  |
| `titles.template` | %s · recmyrecord | not in the spec's draft: page title template (%s is the page name) |
| `titles.map` | Map |  |
| `titles.about` | About |  |
| `titles.album()` | {title} by {artist} |  |
| `metaDescription` | Pick an album you like and get the albums closest to it, by sound and by mood. |  |
