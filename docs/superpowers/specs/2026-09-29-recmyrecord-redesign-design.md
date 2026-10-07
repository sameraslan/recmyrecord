# recmyrecord redesign: design spec

Date: 2026-09-29
Status: Approved in chat by the owner on 2026-09-29 (design, structure and copy direction). Build may proceed.
Branch: `claude/recmyrecord-redesign-16ce4b`, PR base `main`.

## 1. Goal

Replace the 2023 Chakra UI front end of recmyrecord.com with a fast, clean, dark "listening room" interface built around one persistent interactive map, and make the map and the recommendations agree with each other. UX and UI first. No accounts, no new product features beyond the quick wins listed here.

Success means: a visitor can go from "an album I like" to a list of close albums in one action, from either search or the map, on desktop and phone, with no lag, no dead ends and no bugs.

## 2. Decisions already made by the owner

| Topic | Decision |
|---|---|
| Visual direction | The "Listening Room" mockup (`design/mockups/final/`). Warm dark, album art supplies the colour. |
| Must not | Look like the owner's personal site (no paper/cream theme). |
| Entry points | Simple. Start from search or from the map. Do not bombard the user. The split view is a state you arrive at. |
| Home | Combine the two mockup variants: live map behind the hero AND a shelf of album covers, plus an "Explore the map" button and a "Surprise me" button. |
| Number of recommendations | Not fixed at five, and copy never mentions a number. |
| Attribution | The owner's name appears nowhere on the site. |
| Catalog size | Never state the exact count. Say "4,000+". |
| Credits copy | Mood descriptors are from RateYourMusic and were handpicked (one word carries it: "handpicked"). Sound values are from Spotify. |
| Slider | Three stops: Sonic, Balanced, Mood. |
| Process | Subagents implement and verify. The PR must be clean. |

## 3. Decisions made in this spec (defaults, easy to change)

| Topic | Decision | Reason |
|---|---|---|
| Runtime architecture | Fully static. Recommendations, map positions and metadata are precomputed JSON served from `public/data`. No Heroku call, no Spotify call, no database at runtime. | Instant results, no cold starts, removes the album 4001+ crash, the fetch race and every runtime secret. |
| Default slider stop | Balanced. | The owner intended the default to be a mix. The old live setting behaved as mood-only. |
| Slider values | Sonic = 5, Balanced = 1.765, Mood = 0.5, in the recommender's own `descriptors / slider**3` weighting. | Mood reproduces what the live site returns today. 1.765 (a descriptor divisor of about 5.5) is the owner's tuned value from the original site: the old React frontend's default slider position. 5 is effectively sound-only. |
| Map layouts | Regenerated with UMAP (n_neighbors 15, min_dist 0.1, random_state 42) from the recommender's exact feature matrix at each stop, Procrustes-aligned to the balanced layout, scaled to [-1, 1], stacked points spread. | Puts recommendations in the seed's neighbourhood (median map rank about 21 to 35 instead of about 800). |
| Recommendations shown | 5 by default, "Show more" reveals up to 10. 10 are stored per album per stop. | All default rows fit without scrolling on a laptop. |
| Candidate pool | All albums present in both the feature table and the map (about 4,081). | Removes the 4,000-row cap bug. |
| Stack | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, three.js + @react-three/fiber for the map, zustand, Fuse.js, Vitest, Playwright. Node 20. | Same stack as the owner's personal site, whose map code is ported. |
| App location | Rewrite in place in `frontcreck/`. | The Vercel project root already points there. |
| Removed | Chakra UI, Emotion, framer-motion, react-icons, react-use, Prisma, the `/insights` page, the `/api/albums` and `/api/artists` routes, the static map JPG, unused assets. | Dead or replaced. The insights API is already failing in production. |
| Old URLs | `/recommend/album` and `/insights` redirect to `/`. | Keep old links alive. |

## 4. Information architecture

One persistent surface. The map canvas is mounted once in the root layout and never reloads. Routes only change which panels sit around it.

| Route | State | Contents |
|---|---|---|
| `/` | Home | Dimmed live map behind. Hero line, one search field, "Explore the map" and "Surprise me" buttons, cover shelf. |
| `/map` | Explore | Full-screen map. Search in the header. Slider top-left. Hover shows a label. Click opens a compact card. |
| `/album/[slug]` | Album | Split view: panel on the left (about 45%), map on the right (about 55%). Optional `?by=sonic|balanced|mood`; absent means balanced. |
| `/about` | About | Short page over the dimmed map. |
| anything else | 404 | Short message, search field, link to the map. |

Header on every route: wordmark `recmyrecord` (links home), search (hidden on Home where the hero has it), nav `Map`, `About`.

### 4.1 Home

- Full-bleed map behind everything at low contrast. It is the live canvas, not a picture, but pointer events on it are off while the hero is shown, except that clicking empty map area or "Explore the map" goes to `/map`.
- Hero, centred: one display line, one supporting line, the search field (autofocus on desktop only).
- Under the field, two quiet buttons side by side: "Explore the map", "Surprise me".
- Cover shelf at the bottom: label "Or start from one of these", two rows on desktop (12 per row), two rows of four on phones. Covers are dimmed and come to full colour on hover or focus, with the title and artist shown in one line above the shelf. Clicking a cover opens that album. Shelf albums are the top-ranked catalog albums that have a cover.
- "Surprise me" opens a random album.

### 4.2 Explore

- Drag to pan, wheel or pinch to zoom anchored at the pointer, arrow keys pan, `+` `-` `0` zoom.
- Dots at overview zoom, cross-fading to cover art as zoom increases.
- Hover (desktop): label with title and artist after about 80 ms.
- Click or tap a point: a compact card with cover, title, artist, primary action "See closest albums", secondary "Spotify". On phones the card is a bottom sheet.
- One hint line bottom-left. No genre labels, no region washes, no auto-tour. Idle drift is off.

### 4.3 Album

Panel (left):
- Breadcrumb trail of albums visited this session ("Visited"), quiet, each item clickable. Close control (also Escape) returns to `/map` with the camera where it was.
- Seed header: cover (116 px), artist, title in the display face, up to 6 mood tags, primary button "Open in Spotify", quiet icon button "Copy link".
- Heading "Closest albums".
- Rows, ranked: number, cover, title, artist, "Shares lush, melancholic" (up to 4 mood words the two albums share; omit the line when none). The whole row is a link that goes deeper (navigates to that album, keeping the current `by`). One small icon button per row opens Spotify.
- "Show more" reveals rows 6 to 10.
- Hovering or focusing a row highlights its point on the map and lights the shared tags in the seed header. Hovering a point highlights its row.

Map (right):
- Camera fits the seed and its visible recommendations with padding, clear of the slider panel.
- Seed and recommendations render as covers with numbers matching the list, joined to the seed by faint lines. All other points dim.
- Slider top-left: label "Similarity", stops Sonic, Balanced, Mood, one line under it describing the current stop. Changing the stop morphs point positions (about 520 ms), swaps the list to that stop's recommendations (albums that remain glide to their new rank), and updates `?by=`.
- Ambient colour: two dominant colours of the seed cover, darkened and desaturated, as a soft wash behind the seed header and the map; cross-fades over about 400 ms between albums.

Entering Album from Home or Explore is one continuous transition of about 400 ms: the panel slides in while the map shifts over. Instant under reduced motion.

### 4.4 Phone (under 640 px)

- Home: hero, search, the two buttons, shelf (two rows of four). The map behind stays.
- Album: compact seed header, then the rows immediately, then a map preview strip. A floating "Map" button opens the full-screen map focused on the seed and its recommendations; there it becomes "List".
- Explore: full-screen map, tap a point for a bottom card. One-finger pan, two-finger pinch.
- Search: the header search icon opens a full-screen search sheet.
- Tap targets at least 44 px.

### 4.5 Search

- Fuse.js over title and artist, accent-insensitive, at most 6 results, each with a cover thumbnail, title, artist, matched text highlighted.
- Combobox pattern with proper ARIA. Up, down, Enter, Escape. `/` focuses search from anywhere.
- No matches: "No album matches {query}. Try the artist's name, or fewer words."
- The search index is built lazily on first focus.

### 4.6 About

Draft copy (section 8). No owner name. No exact catalog count.

## 5. Visual language

Tokens (Tailwind v4 `@theme` in `globals.css`), dark only:

| Token | Value | Use |
|---|---|---|
| `--color-room` | `#15110d` | Page background |
| `--color-room-2` | `#1c1712` | Surfaces |
| `--color-room-3` | `#262019` | Raised surfaces, hovered rows |
| `--color-room-4` | `#322a21` | Borders on raised surfaces |
| `--color-paper` | `#ede5d5` | Primary text |
| `--color-dust` | `#b3a792` | Secondary text |
| `--color-ash` | `#a39887` | Tertiary text |
| `--color-rule` | `rgba(237,229,213,0.11)` | Hairlines |
| `--color-lamp` | `#e6a856` | Brand accent, primary button |
| `--color-lamp-ink` | `#1a130b` | Text on lamp |
| `--color-clay` | `#c4886f` | Map dots |
| `--color-moss` | `#97a077` | Map dots |
| `--color-ochre` | `#c8a560` | Map dots |

Note, 2026-10-04: the table above is the original warm theme and is kept as the record of it. The Trifid theme keeps these token names and changes their values; the current values are in `frontcreck/src/app/globals.css`.

- Fonts via `next/font/google`: Cormorant Garamond (500, 600, italic) for the wordmark, album titles and headings; Schibsted Grotesk for interface text. Small uppercase captions with letter-spacing only for real labels.
- Covers: 2 px radius, no glow. One soft shadow at most on floating cards.
- Static film grain via CSS, subtle.
- Never: pure black, blue-black, purple, neon, glassmorphism, starfields.
- Exception, 2026-10-04: for the Trifid theme the owner knowingly set aside three items of the line above (blue-black, glassmorphism and starfields), and the film grain is removed. The decisions and the reasons are in `docs/design/trifid-theme/HANDOFF.md`, section "Current state: decisions made on 2026-10-04", and in `docs/superpowers/plans/2026-10-04-trifid-theme.md`, section "Decisions made on 2026-10-04". What was built is described in `docs/design/trifid-theme/IMPLEMENTATION-NOTES.md`.
- Motion: 180 to 450 ms, ease-out. Nothing moves under a resting cursor. `prefers-reduced-motion` makes all transitions instant.
- The mockup's `design/mockups/final/src.html` is the visual reference for spacing, sizes and states.

## 6. Data

### 6.1 Pipeline

A committed, reproducible Python pipeline in `data-pipeline/` generates everything the site serves. It reads:

- `data-retrieval/Recommender/data/all_data_norm.pkl` (feature table: 13 min-max audio features, 175 descriptor columns).
- Cover sprites and cover URLs from the map pipeline outputs of the owner's personal site (path passed as an argument; outputs are committed so the site builds without it).

It replicates the live algorithm exactly (drops the 56 lyric and theme descriptor columns, divides the remaining descriptor columns by `slider**3`, euclidean nearest neighbours) and is verified against a fixed expectation: album "In Rainbows" at slider 0.5 over the first 4,000 rows returns Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom, in that order.

### 6.2 Files served from `frontcreck/public/data/`

| File | Contents |
|---|---|
| `albums.json` | Array; index is the album id. `{ slug, t, a, s, c, k, d, w }`: slug, title, artist, Spotify album id, cover id (`https://i.scdn.co/image/` + c, may be empty), cluster 0..7, top 10 mood descriptor indexes, ambient colours `[hex, hex, accentHex]` |
| `vocab.json` | Mood descriptor words. Excludes vocals descriptors, "instrumental", "concept album", "Descriptor Count" and the 56 dropped lyric and theme words. |
| `positions.json` | `{ sonic: [x,y,...], balanced: [...], mood: [...] }`, flat arrays in album order, 3 decimals |
| `recs.json` | `{ sonic: [[i1..i10], ...], balanced: [...], mood: [...] }` |
| `atlas-0.webp` .. `atlas-3.webp` | Cover sprite sheets, 96 px sprites, 1,024 per sheet, in album index order (sheet = floor(i / 1024), cell = i % 1024, 32 columns) |
| `thumbs.webp` | One 48 px sprite sheet for list and search thumbnails, 64 columns |

Slugs are `kebab(title)-kebab(artist)`, ASCII-folded, with a numeric suffix on collision, stable across runs.

### 6.3 Known data problems (documented, not fixed in this work)

- 34 Spotify URIs in the feature table are assigned to two or three different albums. The pipeline keeps the first occurrence.
- Some covers are wrong (Joni Mitchell, "Blue" shows a tribute album). `data-pipeline/overrides.json` allows manual cover and Spotify id corrections keyed by slug; it ships with the corrections that can be verified from data already on disk, otherwise empty.
- The catalog is frozen because Spotify no longer serves audio features.

## 7. Quality bars

Performance (measured in headless Chrome, 1440x900 and 390x844):

| Measure | Target |
|---|---|
| Search field usable after load | under 1 s |
| Any single long task at startup | under 250 ms |
| Typing to suggestions | under 100 ms |
| Selecting an album to album content visible | under 200 ms |
| Slider stop to list change | under 150 ms |
| Frame gaps during pan, zoom, morph (GPU) | under 50 ms |
| Long tasks while idle | none |
| JavaScript for first load of `/` excluding three.js chunk | under 200 KB gzipped |

The map (three.js) is loaded on the client only, after first paint. Atlases load lazily when zoom passes the cover threshold. The canvas renders on demand, not in an idle loop.

Accessibility: WCAG AA contrast, visible focus rings, labelled inputs, skip link, landmarks, per-route `<title>`, full keyboard path to every action (the list is the keyboard route to albums; the map supports pan and zoom keys).

Robustness: cover load failure falls back to the thumbnail sprite, then to a typographic tile. WebGL unavailable: the map area shows a static message and every list, search and link still works. Data fetch failure: inline error with retry. No horizontal scroll from 360 to 1600 px. No console errors.

Tests: Vitest unit tests for data access, slugs, search, shared descriptors and URL state. Playwright end-to-end tests at desktop and phone sizes for: search to album, going deeper, breadcrumb back, slider change, show more, map click to album, Home shelf, Surprise me, old URL redirects, 404, keyboard-only search. A data validation script checks every JSON file against the contract. `lint`, `typecheck`, `test`, `build` all pass.

## 8. Copy (draft; the owner signs off on the PR before merge)

Rules: plain and precise, no em dashes, no hype, no emoji, no owner name, no exact catalog count, no count of recommendations.

| Place | Text |
|---|---|
| Wordmark | recmyrecord |
| Nav | Map, About |
| Hero | Start with an album you like. |
| Hero sub | Get the albums closest to it, by sound and by mood. |
| Search placeholder | Search albums or artists |
| Home buttons | Explore the map / Surprise me |
| Shelf label | Or start from one of these |
| No matches | No album matches {query}. Try the artist's name, or fewer words. |
| Trail label | Visited |
| Seed actions | Open in Spotify / Copy link / Link copied |
| List heading | Closest albums |
| Row | Shares {words} |
| More | Show more / Show fewer |
| Slider | Similarity: Sonic, Balanced, Mood |
| Stop notes | Closest in sound. / Sound and mood together. / Closest in mood. |
| Map hint | Albums that sit close together sound or feel alike. |
| Map card | See closest albums / Spotify |
| Phone | Map / List |
| Error | The albums didn't load. Check your connection, then try again. / Try again |
| No WebGL | The map needs WebGL, which this browser has turned off. Search and lists still work. |
| 404 | That page isn't here. Search for an album, or explore the map. |
| About title | How it works |
| About body 1 | Every album here is described two ways. Its sound comes from Spotify's audio values, such as energy, tempo and acousticness. Its mood comes from handpicked RateYourMusic descriptors, such as melancholic, lush or atmospheric. |
| About body 2 | Pick an album and you get the ones closest to it once both are combined. The slider leans the comparison toward sound or toward mood. |
| About body 3 | The map places 4,000+ albums so that ones that sound or feel alike sit close together. |
| About credits | Mood descriptors handpicked from RateYourMusic. Sound values from Spotify. Cover art from Spotify. |
| Page titles | recmyrecord / {Album} by {Artist} · recmyrecord / Map · recmyrecord / About · recmyrecord |
| Meta description | Pick an album you like and get the albums closest to it, by sound and by mood. |

## 9. Out of scope

- Rotating the credentials committed in the repository history (owner action). This work stops tracking `frontcreck/.env` and ignores it, and removes every runtime use of secrets.
- Removing the committed Python virtualenv `recVenv/` and other repository bloat.
- Shutting down the Heroku app or changing Vercel project settings, including which branch production deploys from.
- Fixing the map on the owner's personal site (same import bug; separate repository).
- New features: accounts, playlists, audio previews, adding albums.
