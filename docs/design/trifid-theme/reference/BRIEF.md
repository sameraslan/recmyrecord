# Shared brief for concept designers — recmyrecord theme exploration

## What the owner asked for
recmyrecord is an album recommendation site. Its main UI is a 2D map of 4,000+ albums (a UMAP layout: nearby = similar). In album view, thin lines run from the chosen album to its closest albums, which already looks like a constellation. The owner wants to push that into a full, properly beautiful theme — galaxy / outer space first, but also open to other nature-inspired worlds — possibly behind a theme toggle, possibly with a 3D map. They want MANY concrete options shown as images, "really really aesthetic, super cool, fun", while keeping all current functionality. They asked that designs be grounded in what the real thing actually looks like (real galaxies, nebulae, star charts, or whatever natural phenomenon your lane uses).

You are one of several designers, each with a different lane. Deliver **3 clearly different concepts** in your lane, each as a rendered PNG mockup.

## Paths
- Repo (read-only for you — do NOT edit anything in it, do NOT npm install, do NOT start dev servers):
  `/Users/saslan.19/Desktop/Tengs/reCreck/recmyrecord/.claude/worktrees/galaxy-theme-ui-1e2427`
- Real data you should plot: `frontcreck/public/data/positions.json` (`{sonic, balanced, mood}`, each a flat `[x,y,x,y,...]` array in [-1,1]; use `balanced`), `albums.json` (records `{slug,t,a,s,c,k,d,w}`: title, artist, …, cluster k 0-7, mood-word indexes d, ambient colours w=[wash,wash,accent]), `recs.json` (closest albums per album), `vocab.json` (mood words), `thumbs.webp` / `atlas-*.webp` (cover sprites). Inspect the shapes yourself before using them.
- What the UI looks like today: `docs/readme/map.gif`, `search.gif`, `slider.gif`, `phone.gif` (Read them), CSS in `frontcreck/src/styles/*.css`, tokens in `frontcreck/src/app/globals.css`.
- Your output folder: `<SCRATCH>/concepts/<your-lane>/` where
  `<SCRATCH>` = `/private/tmp/claude-1247860641/-Users-saslan-19-Desktop-Tengs-reCreck-recmyrecord--claude-worktrees-galaxy-theme-ui-1e2427/11a709b0-08cc-4484-8bc8-4215cc140b27/scratchpad`
- Screenshot tool (the ONLY way to run a browser; it is serialised with a lock because the laptop overheats — never launch Chrome/Playwright yourself, never run things in parallel, keep scripts light):
  `<SCRATCH>/shot.sh /abs/path/mock.html /abs/path/out.png 1600 1000`
  It is a headless Chromium with no GPU: use Canvas 2D, SVG and CSS only (no WebGL). For 3D, project points yourself in Canvas 2D. `file://` fetch of sibling files is allowed, but inlining data into the HTML with a small python3 script is more reliable. Rendering must finish synchronously or within a couple of seconds.

## Current UI (must be preserved functionally)
- Mood today: "Listening Room" — warm dark brown `#15110d`, text `#ede5d5`, amber accent `#e6a856`, dots clay/moss/ochre `#c4886f #97a077 #c8a560`, Cormorant Garamond (titles, italic wordmark) + Schibsted Grotesk (UI), 2px radii, faint grain. Dots are flat discs 3–7px, no glow. Dots cross-fade into album covers when you zoom in.
- Chrome: 64px header (wordmark "recmyrecord", centred search, nav "Map" / "About"); similarity slider card top-left with three stops (Sonic / Balanced / Mood) that morphs the layout; zoom + reset buttons bottom-right; hover label (thumb, title, artist).
- Album view: left panel `min(45vw, 660px)` with a "Visited" trail, seed header (cover, artist, title, up to 6 mood tags, "Open in Spotify", copy link), "Closest albums" rows (rank, cover, title, artist, "Shares …" mood words, Spotify icon), "Show more". On the map: seed cover (64px) and recommendation covers (46px) with numbered badges, lines from seed to each rec, everything else dimmed. Per-album ambient colour wash from the cover.
- Dot colour today is decorative (cluster k % 3), there are no genre labels. Clusters are very unbalanced (3 big ones). You may propose a more meaningful encoding (e.g. brightness/size/colour from real data fields) but say what data it uses.
- Copy rules: never show the owner's name; say "4,000+" albums, never an exact count; never state a number of recommendations; mood words are "handpicked". Use real album titles/artists from albums.json in the mockup.

## Hard constraints to respect or explicitly flag
- **Positions carry meaning.** Nearby = similar. Do not rearrange albums into pretty shapes (spiral arms, etc.) unless you can explain how similarity survives; dressing the real point cloud (density-derived haze, glow, colour, background layers) is safe.
- **Performance budget:** today the canvas draws on demand and *nothing moves at idle* (budget: 1 idle frame). Twinkle, drift, auto-rotation break this. Either design a still-beautiful static state and motion only in response to input, or flag clearly that the budget would need changing.
- Existing approved spec banned "pure black, blue-black, purple, neon, glassmorphism, starfields". The owner is knowingly overriding this for the exploration — but its spirit (album art supplies the colour; don't look like a generic sci-fi template) is still a good warning. Avoid the stock "purple gradient space SaaS" look.
- Readability: text ≥ 4.5:1 contrast, album covers must stay legible, 44px tap targets on phone.
- A theme toggle is on the table: say whether your concept is a standalone theme, pairs with the current Listening Room as a second theme, or includes its own light/dark pair.

## Grounding in the real thing
Before designing, spend a few minutes looking at real reference imagery for your lane (WebSearch / WebFetch; NASA, ESA/Webb, Hubble, ESO, museum/library scans, scientific photography). View actual images, not just descriptions. Note what makes the real thing beautiful — structure, colour relationships, how brightness is distributed, what is dark — and name the specific references each concept draws on (with URLs). Do not download or save reference images to disk, and do not embed third-party images in mockups; paint everything procedurally.

## Deliverables (in your output folder)
1. For each concept: `NN-short-name.html` and `NN-short-name.png` at 1600×1000 showing the **album view** (left panel + map with seed, recs and lines) — this is the signature screen. The full real point cloud must be plotted. Include header, slider card and zoom buttons.
2. Optional but encouraged for your strongest concept: a second PNG (overview/explore state, a phone 390×844 frame, or for 3D an alternate camera angle).
3. Read every PNG back with the Read tool and critique it honestly; iterate at least twice per concept until it looks genuinely finished and beautiful — no overlapping text, no empty-looking or muddy maps, no placeholder boxes. If a concept isn't working, replace it.
4. `NOTES.md`: for each concept — name, one-paragraph pitch, palette (hex), typefaces, how albums/lines/selection/hover are drawn, what data drives the encoding, real-world references (URLs), theme-toggle fit, idle-motion stance, implementation cost against the current three.js orthographic Points + DOM overlay architecture (low / medium / high and why), and its biggest weakness.

Your final message: the list of PNG paths and a 2-line summary per concept, plus which one you'd pick and why. Be honest about weaknesses.
