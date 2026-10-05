# Trifid Theme Part 3: Glass Chrome, Phone and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the real app (`frontcreck/`) the Trifid prototype's glass chrome: cool near-black tokens, see-through blurred panels over the nebula on desktop, the map running behind a glass header, solid panels on phones at launch and wherever glass is unsupported or unwanted, every text colour proven at 4.5:1 in the worst case, no film grain, a dark casing on the selected ring, the phone strip and the Home, About and 404 pages restyled, a favicon in the Trifid colours, the theme-coupled tests rewritten without weakening them, and the measurements against the baseline, the review rounds, the docs and the pull request update planned.

**Architecture:** The existing token names keep their names and change their values in `@theme` in `src/app/globals.css`, so components need no renames. Three surface colours (`--color-float`, `--panel-bg`, `--top-bg`) and one filter (`--glass-blur`) decide glass or solid; one CSS rule in `shell.css` applies `backdrop-filter: var(--glass-blur)` to every glass surface, and three one-line blocks in `globals.css` switch all four values to the solid fallback (phone width, no `backdrop-filter` support, reduced transparency). The first of those three lines is the phone glass switch. Worst-case contrast is a pure function in `src/lib/contrast.ts` (CSS `saturate` and `brightness` on the backdrop, then the panel tint painted over it) tested against the values parsed from the stylesheets; text that sits directly on the nebula, and the header's text over the brightest gas, are measured from screenshots in Playwright. The map pane, and the canvas in it, start at the top of the window, the header's height above the stage (`--hdr`: 64 px, and 60 px under 900 px wide), and the header is glass over them. The camera keeps today's framing through one number, `MapInput.insetTop`: the frustum's view offset draws `camera.position` at the centre of the area below the header, every fit works in that area, and the zoom limits are scaled so they are the same size on screen. `e2e/framing.spec.ts` compares album positions on screen with positions recorded before the change.

**Tech Stack:** Next 16, React 19, Tailwind 4.3 (`@theme`), plain CSS in `src/styles/`, vitest (jsdom), Playwright on SwiftShader (projects `desktop`, `phone`, `nowebgl`), `scripts/perf/perf.mjs` and `scripts/review-shots.mjs` on Chrome, the baseline tools in `docs/design/trifid-theme/reviews/baseline/` (`capture.mjs`, `hover-measure.mjs`).

**Spec:** docs/design/trifid-theme/HANDOFF.md (section "Current state: decisions made on 2026-10-04") and the section "Decisions made on 2026-10-04" of `docs/superpowers/plans/2026-10-04-trifid-theme.md`, which wins wherever the two differ. Tracking issue 45. Pull request 47 (draft, stacked on draft PR 32).

## Global Constraints

- Trifid replaces the current look. There is no theme switch and no second set of tokens.
- Album positions never move: nothing in this part touches `positions.json` or the layout of the map. Task 3 changes where the canvas starts and how the camera centres, and holds every framing to the pixel of today's (`e2e/framing.spec.ts`, 0.75 px).
- The map canvas does not redraw at rest: the map still draws at most one frame in 3 idle seconds (`idleFrames` in `budgets.json`, and the idle window of `e2e/map.spec.ts`). Part 2's twinkle is DOM and CSS on a timer and never redraws the canvas; nothing this part adds animates without user input.
- Snappiness is a core requirement: no effect may cost responsiveness. Measure each one. If it costs speed (the glass blur, the star glow, the names layer, the twinkle) it is dropped or replaced by its cheaper version without asking the owner again, and he is told afterwards. The budgets in `frontcreck/scripts/perf/budgets.json` do not change: one idle frame, 50 ms frame gap, 200 KB first-load JS, 250 ms startup long task, and the other six values as they are.
- Perf rule, the same words in all three parts: Run `npm run perf` three times, one after another. Each measure is judged on the median of the three runs: the median must be inside its budget, and it is compared with the baseline's median and min to max in `BASELINE-PERF.md`. A median above the baseline's worst run is a finding even when it is inside budget. Any single run over budget is named and explained in the write-up (the baseline has three such single run outliers).
- No regressions against the current site: the baseline screenshots, performance run and regression checklist are in `docs/design/trifid-theme/reviews/baseline/` (`REGRESSION-CHECKLIST.md`, `BASELINE-PERF.md`, the raw perf output under `perf/`, the screenshots under `shots/`, and the capture script `capture.mjs`). A number that got worse than baseline while still inside budget is a finding to explain or fix.
- Text holds 4.5:1 against what is behind it, in the worst case (numbers in Task 1, Task 2 and Task 3). The album accent is a mark, never a text colour, and is held to 3:1; both facts are pinned by tests (Task 1, Task 2).
- Covers stay legible: no tint, blur or scrim is drawn over a cover in the album list, the shelf or the map markers.
- 44 px tap targets on phone (`e2e/phone.spec.ts`, "tap targets are at least 44 px", must stay green).
- No explanatory UI: no legend, no label for a colour or a region, no card, menu, pointer or search row for a region, nothing about regions on Home or About.
- Every star is an album: this part adds no decorative dots; the phone strip draws one dot per album and nothing else, all one size, never by album order or rank.
- Home's cover shelf stays as it is, including its order: `src/components/home/Shelf.tsx` and `src/app/page.tsx` are not edited.
- Existing site data files are not edited: `frontcreck/public/data/albums.json`, `positions.json`, `recs.json`, the cover sheets, and `data-pipeline/rmr_pipeline/validate.py`, `constants.py`, `build.py`. The theme files under `public/data/theme/` are part 1's output and are only read here.
- Never loosen a test to make it pass. Wherever this plan rewrites a test it says what the rewritten test still proves.
- Copy rules: never show the owner's name, say "4,000+" albums, never state a number of recommendations, mood words are "handpicked", no dashes or emoji. Any new or changed site wording is listed for the owner's approval before it ships. This part adds and changes no site string.
- Machine rules: arm64 Node 22.23.3 only (`export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"`; `node -p process.arch` must print `arm64`). One browser at a time, never several: every Playwright command takes `--workers=1` and one `--project`; never start a second run while one is going. Jobs run one after the other, never side by side. Be gentle by day: prefix long commands with `nice -n 10` (not the timing runs of Task 9, which must be run the way the baseline was). Every command below that needs Node, in a `bash` block or on a `Run:` line, sets the PATH itself and runs in its own subshell from the worktree root, so each line can be pasted alone or a block run as it is.
- Commits: at least one per task, conventional message, then a blank line, `Refs #45`, a blank line and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before the owner sees anything: the full unit suite, typecheck, lint, and the full browser suite on all three Playwright projects, green (Task 10 Step 1, and again after the last fix).
- Commit, do not push. A push to this branch makes Vercel build a preview deployment, so commits that change anything under `frontcreck/` or `data-pipeline/` are not pushed until the owner says yes (Task 11 Step 5 asks). Commits that touch only documents may be pushed, but a push sends every commit before it too, so a documents commit that sits on top of unpushed app commits waits with them. No step of Tasks 1 to 10 pushes.
- A preview deployment needs the owner's go-ahead. This plan stops and asks (Task 11 Step 5); it never pushes app code or deploys by itself.
- Paths in this plan are relative to the worktree root. Run `git` from the root and `npm`/`npx` from `frontcreck/`.
- Order: Tasks 1 and 2 can start at once. Tasks 3 to 7 need parts 1 and 2 on the branch (the gas, `src/components/map/theme.ts`, `src/lib/data/theme.ts`, the off-white frame in the shader, the names layer, the twinkle layer). Task 3 also needs Task 2 (the glass header and `contrastOverBackdrop`). Tasks 9, 10 and 11 need everything.

## Review Focus

The failure modes most likely to bite that an ordinary task test would not cover, and the test that pins each:

1. **A browser without `backdrop-filter`** shows unblurred see-through panels over bright gas. Pinned by `src/styles/glass.test.ts` ("phones, browsers without backdrop-filter and reduced transparency get the same solid panels") and by `e2e/glass.spec.ts` ("the built CSS keeps the Safari prefix and the no-support fallback"). Task 2.
2. **The reduced-transparency preference** is ignored. Pinned by `e2e/glass.spec.ts` ("with reduced transparency the panels are solid and unblurred"), which emulates the media feature through CDP. Task 2.
3. **The weakest album accent (`#d44f4f`, Making Movies) on glass over the brightest gas.** Pinned by `src/lib/contrast.test.ts` ("every album accent passes 4.5:1 on the room colour, and 3:1 as a mark on the panels", and "the album accent is never a text colour" in `glass.test.ts`) and by `e2e/glass.spec.ts` ("text on the panels keeps 4.5:1 over the map, with the weakest accent"). Tasks 1 and 2.
4. **The `nowebgl` project: no gas at all behind see-through panels.** Pinned by the new test in `e2e/nowebgl.spec.ts` ("without WebGL the see-through panels sit on the plain sky and keep 4.5:1"). Task 2.
5. **The phone strip before the gas image has loaded (or when it fails).** Pinned by `src/components/album/MapPreviewStrip.test.ts` ("draws everything without the gas image"). Task 5.
6. **Safari's `-webkit-backdrop-filter` dropped by the CSS build.** Pinned by `e2e/glass.spec.ts` ("the built CSS keeps the Safari prefix and the no-support fallback"), which reads the served stylesheets as text. Task 2.
7. **axe stops judging contrast on glass.** With a canvas behind a see-through panel axe reports text contrast as "incomplete", not as a violation, so `e2e/a11y.spec.ts` no longer proves contrast there. Pinned by `contrastOverBackdrop` (Task 2), which measures the real pixels behind the text on the album panel, the slider, the hint, the header, Home, About and 404. Tasks 2, 3 and 6.
8. **The framing drifts when the canvas grows by the header's height.** The canvas is taller by the header's height (64 px, 60 px on a phone), so a zoom number means a different size on screen and the canvas centre is no longer the centre of what the visitor sees. Pinned by `e2e/framing.spec.ts` ("same place as before the map ran under the header": album positions recorded before the change, compared to 0.75 px at the overview, the whole map, a pick, an open album, an album opened from search and the deepest zoom) and by the unit tests that compare a canvas with a top inset with a shorter canvas (`screen.test.ts`, `bounds.test.ts`, `focusLayout.test.ts`, `zoomLimits.test.ts`). Task 3.
9. **An album, a marker or the hover label ends up behind the header.** Pinned by `e2e/framing.spec.ts` ("after every fit nothing is behind the header", "markers stay below the header, also after the visitor has moved the map", "the hover label never slides under the header") and by the tightened check in `e2e/focus.spec.ts`. Task 3.
10. **The header's text over the brightest gas, with names and glints able to pass under it.** Pinned by `src/lib/contrast.test.ts` (the header's two tokens over a white backdrop, brighter than any gas, name or glint) and measured by `e2e/glass.spec.ts` ("header text keeps 4.5:1 with the brightest gas behind the bar"). Tasks 1 and 3.
11. **The selected ring disappears on bright gas** (off-white on cream is 1.02:1). Pinned by `src/lib/contrast.test.ts` ("the selected ring is the lamp token on a dark casing that holds 3:1 on the brightest backdrops") and measured by `e2e/glass.spec.ts` ("the selected ring reads on the brightest gas"). Task 4.
12. **A glint starts under the header**, where nobody sees it and the header's blur has to redo its work for nothing. Pinned by `e2e/framing.spec.ts` ("glints never start under the header"). Task 3.

## Reference: final token table

| Token | Old | New | Where |
|---|---|---|---|
| `--color-room` | `#15110d` | `#07060a` | `@theme` |
| `--color-room-2` | `#1c1712` | `#0e0d13` | `@theme` |
| `--color-room-3` | `#262019` | `#17161d` | `@theme` |
| `--color-room-4` | `#322a21` | `#24222c` | `@theme` |
| `--color-paper` | `#ede5d5` | `#f3eee7` | `@theme` |
| `--color-dust` | `#b3a792` | `#c4beb6` | `@theme` |
| `--color-ash` | `#a39887` | `#aaa49d` | `@theme` |
| `--color-rule` | `rgba(237, 229, 213, 0.11)` | `rgba(241, 236, 228, 0.14)` | `@theme` |
| `--color-rule-2` | `rgba(237, 229, 213, 0.2)` | `rgba(241, 236, 228, 0.26)` | `@theme` |
| `--color-rule-3` | none | `rgba(241, 236, 228, 0.45)` | `@theme`, new |
| `--color-lamp` | `#e6a856` | `#f1ece4` | `@theme` |
| `--color-lamp-hover` | literal `#efb86c` | `#ffffff` | `@theme`, new |
| `--color-lamp-ink` | `#1a130b` | `#121016` | `@theme` |
| `--color-clay`, `--color-moss`, `--color-ochre` | `#c4886f`, `#97a077`, `#c8a560` | removed | unused once part 2 removes `CLUSTER_RGB` |
| `--color-pane` | `#17120e` | `#07060a` | `@theme` |
| `--color-float` | `#1a1511` | `rgba(10, 9, 14, 0.66)`; solid `rgba(10, 9, 14, 1)` | `@theme`; fallback blocks |
| `--panel-bg` | none (`--color-room`) | `rgba(8, 7, 11, 0.7)`; solid `rgba(10, 9, 14, 1)` | `:root`, new |
| `--top-bg` | literal `rgba(21, 17, 13, .96)` | `rgba(7, 6, 10, 0.58)`; solid `rgba(10, 9, 14, 1)` | `:root`, new |
| `--glass-blur` | none | `blur(22px) saturate(1.2) brightness(0.58)`; solid `none` | `:root`, new |
| `--acc` (default accent) | `#d9a066` | unchanged | `:root`; per album from `AlbumPanel.tsx` |

Solid means fully solid: opacity 1, on the phone header too. The owner ruled that "solid panels at launch" on phones leaves nothing of the map showing through. The same one solid value serves the other two fallbacks (no `backdrop-filter`, reduced transparency), so there is one glass look and one solid look and nothing in between.

## Reference: worst-case contrast (computed with `node`, WCAG 2 formula, on 2026-10-04)

Backdrop model: the brightest thing that can be behind a panel is pure white (a white cover on the map); the brightest gas is cream `rgb(244, 238, 222)`. `backdrop-filter` applies `saturate(1.2)` then `brightness(.58)` in sRGB, then the panel tint is painted over. The blur does not change a flat backdrop.

| Surface | Over white | Over cream gas | paper | dust | ash | lamp |
|---|---|---|---|---|---|---|
| `--panel-bg` glass (.7) | `rgb(50, 49, 52)` | `rgb(48, 46, 46)` | 11.20 / 11.69 | 7.01 / 7.32 | 5.24 / 5.47 | 10.99 / 11.48 |
| `--color-float` glass (.66) | `rgb(57, 56, 60)` | `rgb(55, 53, 52)` | 10.08 / 10.57 | 6.31 / 6.62 | 4.71 / 4.94 | 9.89 / 10.38 |
| `--top-bg` glass (.58) | `rgb(66, 66, 68)` | `rgb(64, 61, 59)` | 8.69 / 9.34 | 5.44 / 5.84 | 4.06 / 4.37, not used | 8.53 / 9.16 |
| Solid fallback (opaque, no filter) | `rgb(10, 9, 14)` | `rgb(10, 9, 14)` | 17.19 | 10.76 | 8.04 | 16.87 |

(Each cell: over white / over cream. The solid fallback is opaque, so the backdrop does not matter and each cell has one number.) Findings that changed the numbers:

- **Header:** ash would fail on the header glass (4.06). The header only sets paper (wordmark) and dust (nav links, icon), and its search field is opaque, so nothing is raised; the test pins that the header rules use paper and dust.
- **Home search field:** the prototype's `rgba(10, 9, 14, .5)` fails for its ash placeholder (3.35 over white) and for dust (4.48). Raised to `var(--color-float)` (.66): ash 4.71.
- **Album wash:** at full strength the brightest wash (`#545721`, A Tab in the Ocean) puts dust at 4.49. With the prototype's `.amb { opacity: .9 }` it is 4.70 on glass, 5.40 on the solid fallback. So `opacity: .9` is required, not cosmetic. Ash at the centre of that wash is 3.51 (3.2 in today's warm theme); no ash text sits in the wash's centre, and this part does not make it worse.
- **Weakest accent `#d44f4f`:** 4.84 on the new room (4.50 on the old), 3.10 on glass over white, 3.23 over cream, 4.75 on the solid fallback. It cannot reach 4.5 on glass: even a .9 tint gives 4.35 and `brightness(.3)` gives 4.06. It does not need to: no rule uses the accent as a text colour (lit tag: paper text, 7.14 worst; hot row bar and lit tag border: marks, 3:1 applies; hot badge: opaque accent with room digits, 4.84). The test pins both facts.
- **Hint line** (text directly on the map): paper on a `rgba(4, 4, 8, .62)` band over unfiltered white is 5.19.
- **Home hero** behind its dark pad and the veil, over unfiltered white: dust 5.33. The shelf caption (ash) depends on how far part 1 dims the gas on Home, so it is measured in Task 6, not computed.
- **Header over the map (Task 3):** the map now runs behind the header, so the header's glass really has the worst case of the table's third row behind it: paper 8.69 and dust 5.44 over white, 9.34 and 5.84 over the cream gas. Region names (off-white lettering) and glints (a white bloom) can pass under the bar; neither is brighter than white, so that row covers them. Where the bar is solid (phones, no blur, reduced transparency) it is opaque, nothing shows through it, and paper is 17.19 and dust 10.76. It is also measured in the browser with the brightest gas slid behind each header item.
- **Selected ring (Task 4):** the ring is the lamp token `#f1ece4`. On the brightest gas it cannot be seen: 1.02:1 on cream, 1.18:1 on white. With a casing of `rgba(4, 4, 8, .8)` the ring is 10.24:1 against its casing over white and 10.71:1 over cream, and the casing is 12.04:1 against white and 10.87:1 against cream. On the empty sky the ring is 17.18:1 by itself. The requirement for a mark that is not text is 3:1.
- **Favicon (Task 8):** on its `#07060a` tile the lines `#aaa49d` are 8.18:1, the small stars `#c4beb6` 10.96:1 and the large star `#f1ece4` 17.18:1.

## Reference: every colour literal under `frontcreck/src`

| File and line | Literal | Decision |
|---|---|---|
| `app/globals.css` L10-25 | tokens | New values (table above). Task 1. |
| `app/globals.css` L36 | `--acc: #d9a066` | Leave: the default accent before an album sets one; it stays inside the album panel; 5.65 on the worst glass panel. |
| `app/layout.tsx` L32 | `themeColor: '#15110d'` | `'#07060a'`. Task 1. |
| `app/icon.svg` L1-5 | `#15110d`, `#322a21`, `#b3a792`, `#c4886f`, `#97a077`, `#e6a856` | New colours from the tokens, no amber dot. Task 8. |
| `styles/shell.css` L20-23 | the film grain overlay (`.grain`: an SVG noise image tinted `1 / .95 / .85`) | Removed, with its element in `app/layout.tsx` L46. The approved pictures have no grain and the owner chose none. Task 2. |
| `styles/shell.css` L30 | `rgba(21, 17, 13, .96)` | `var(--top-bg)`. Task 2. |
| `styles/shell.css` L57 | `#efb86c` | `var(--color-lamp-hover)`. Task 2. |
| `styles/shell.css` L59 | `rgba(237, 229, 213, .4)`, `rgba(237, 229, 213, .04)` | `var(--color-rule-3)`, `rgba(241, 236, 228, .05)`. Task 2. |
| `styles/shell.css` L63 | `rgba(237, 229, 213, .35)` | `rgba(241, 236, 228, .35)`. Task 2. |
| `styles/map.css` L11, L21 | `rgba(0, 0, 0, .8)` shadows | Leave: neutral black shadow. |
| `styles/map.css` L8 | canvas focus outline in `--color-lamp` (no literal) | Drawn on `.map-host` instead, inside the visible map, with a casing of `rgba(4, 4, 8, .8)`. Task 3. |
| `styles/map.css` L17, L18 | `.map-sel`: lamp border and dot (no literal) | Casing `rgba(4, 4, 8, .8)` added. Task 4. |
| `styles/map.css` L47, L48 | `rgba(230, 168, 86, .35)` focus halo | `0 0 0 3px var(--color-room), 0 0 0 5px var(--color-lamp)`. Task 2. |
| `styles/map.css` L75, L77, L80, L83, L92 | `rgba(237, 229, 213, …)`, `rgba(10, 8, 6, .55)` | Part 2 owns L75-95. Not touched here. |
| `styles/map.css` L135 | veil `rgba(21, 17, 13, .72/.3/.15)` | `rgba(7, 6, 10, .1)`. Task 6. |
| `styles/phone.css` L6 | veil `rgba(21, 17, 13, .8/.52/.4)` | Rule removed. Task 6. |
| `styles/phone.css` L41 | `rgba(0, 0, 0, .8)` shadow | Leave. |
| `styles/home.css` L24 | `rgba(12, 10, 8, .72)` | `rgba(5, 4, 8, .3)`. Task 2. |
| `styles/home.css` L25 | `#000` shadow | Leave. |
| `styles/home.css` L30 | `#d9d0bf` | `#e0dbd3` (9.38 on the worst glass panel). Task 2. |
| `styles/home.css` L36 | `rgba(12, 10, 8, .55)` | `rgba(5, 4, 8, .55)`. Task 2. |
| `styles/album.css` L22 | `rgba(0, 0, 0, .85)` shadow | Leave. |
| `styles/album.css` L30 | `rgba(237, 229, 213, .4)` | `var(--color-rule-3)`. Task 2. |
| `styles/album.css` L44 | `rgba(237, 229, 213, .045)` | `rgba(241, 236, 228, .06)`. Task 2. |
| `styles/album.css` L54 | `rgba(237, 229, 213, .06)` | `rgba(241, 236, 228, .07)`. Task 2. |
| `styles/search.css` L25 | `rgba(0, 0, 0, .7)` shadow | Leave. |
| `styles/search.css` L35 | `rgba(230, 168, 86, .8)` | `var(--color-lamp)`. Task 2. |
| `styles/search.css` L50 | `#2c241c` | Leave: fallback for `--fb`, which `Cover.tsx` always sets. |
| `styles/search.css` L53 | `rgba(237, 229, 213, .78)` | `rgba(243, 238, 231, .78)`. Task 2. |
| `components/Cover.tsx` L10 | `TILE` `#3b2a22`, `#2c3024`, `#3b3120` | Leave: mirrors `FALLBACK_TILE` in `data-pipeline/rmr_pipeline/constants.py` L59, which `images.py` bakes into the map's cover sheets. `constants.py` must not be edited, so changing one side would make a lettered tile differ between the list and the map. A failure state only. |
| `components/album/AmbientWash.tsx` L7-12 | `rgba(...)` built from the album's own washes | Leave the code; the panel layer gets `opacity: .9` and the map layer is hidden in CSS (the approved look has no album wash over the map: `final-album.jpg`, and the prototype only has the panel's `.amb`). Task 2. |
| `components/album/MapPreviewStrip.tsx` L15, L98, L118, L131, L133, L135, L166 | cluster dots, warm lines, frames, badge, default accent | Rewritten on `STAR_WHITE`, `FRAME_RGB`, `SKY_RGB`. Task 5. |
| `components/map/data.ts` L12 | `CLUSTER_RGB` | Part 2 removes it. |
| `components/map/shaders/album.ts` L235-237 | `PAPER`, `LAMP`, `ROOM` | Part 2. |
| `lib/contrast.test.ts` L50-51 | `#000000`, `#ffffff`, `#777777` | Leave: reference ratios. |
| `lib/contrast.test.ts` L55-56 | `#15110d`, `#1a130b` | `#07060a`, `#121016`. Task 1. |
| `lib/types.ts` L9 | comment `#15110d` | Comment extended. Task 7. |
| `lib/color.test.ts` L6-7 | `#15110d`, `#E6A856` | Leave: sample inputs for the hex parser, not theme values. |
| Test fixtures (`SearchBox.test.tsx` L38, `data.test.ts` L5, `MapPreviewStrip.test.ts` L5 and L21, `AmbientWash.test.ts` L6-10, `search.test.ts` L217, `catalog.test.ts` L9, `client.test.ts` L4, `useData.test.ts` L8) | made-up album colours | Leave, except `MapPreviewStrip.test.ts`, rewritten in Task 5. |

Coupled literals outside `src`: `e2e/smoke.spec.ts` L14, `e2e/search.spec.ts` L143, L145, L227 (Task 1 and Task 7), `e2e/explore.spec.ts` L75, L326 (Task 7), `scripts/icons/*.svg` (Task 8).

---

### Task 1: Tokens, glass switch and the worst-case contrast function

**Files:**
- Modify: `frontcreck/src/lib/contrast.ts` (append after L18)
- Modify: `frontcreck/src/lib/contrast.test.ts` (whole file, L1-96)
- Modify: `frontcreck/src/app/globals.css` L9-38
- Modify: `frontcreck/src/app/layout.tsx` L32 (L40 once part 2 has added the names font above it)
- Modify: `frontcreck/e2e/smoke.spec.ts` L14
- Modify: `frontcreck/e2e/search.spec.ts` L227

**Interfaces:**
- Consumes: `hexToRgb` from `src/lib/color.ts`; `public/data/albums.json` (`w[2]` accents).
- Produces: tokens of the table above; CSS custom properties `--panel-bg`, `--top-bg`, `--glass-blur` and the three fallback blocks; from `src/lib/contrast.ts`: `type Rgb = [number, number, number]`, `interface Tint { rgb: Rgb; alpha: number }`, `interface GlassFilter { saturate: number; brightness: number }`, `rgbToHex(rgb: Rgb): string`, `filterBackdrop(rgb: Rgb, filter: GlassFilter): Rgb`, `paintOver(top: Rgb, alpha: number, bottom: Rgb): Rgb`, `surfaceOver(backdrop: Rgb, filter: GlassFilter | null, tint: Tint): string`.

- [ ] **Step 1: Replace `frontcreck/src/lib/contrast.test.ts` with the failing test**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hexToRgb } from '@/lib/color';
import type { AlbumRecord } from '@/lib/types';
import { contrastRatio, paintOver, rgbToHex, surfaceOver, type GlassFilter, type Rgb, type Tint } from './contrast';

const css = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
const GLOBALS = css('app/globals.css');

/** The hex colour tokens as globals.css defines them (`--color-room` → `room`, `--acc` → `acc`). */
const TOKENS: Record<string, string> = Object.fromEntries(
  [...GLOBALS.matchAll(/--(?:color-)?([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]),
);
const tok = (name: string) => {
  const v = TOKENS[name];
  if (!v) throw new Error(`no colour token --${name} in globals.css`);
  return v;
};

/** The three see-through surfaces. Their first value in globals.css is the glass one; every later one is a solid fallback. */
type Surface = 'color-float' | 'panel-bg' | 'top-bg';
const SURFACES: Surface[] = ['color-float', 'panel-bg', 'top-bg'];
function tints(name: Surface): Tint[] {
  const re = new RegExp(`--${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`, 'g');
  const out = [...GLOBALS.matchAll(re)].map((m): Tint => ({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) }));
  if (!out.length) throw new Error(`no rgba value for --${name} in globals.css`);
  return out;
}
const GLASS = Object.fromEntries(SURFACES.map((s) => [s, tints(s)[0]])) as Record<Surface, Tint>;
const SOLID = Object.fromEntries(SURFACES.map((s) => [s, tints(s).slice(1)])) as Record<Surface, Tint[]>;
/** What the glass does to the map behind a panel (the blur does not change a flat colour). */
const FILTER: GlassFilter = (() => {
  const m = /--glass-blur:\s*blur\(22px\) saturate\(([\d.]+)\) brightness\(([\d.]+)\);/.exec(GLOBALS);
  if (!m) throw new Error('no glass filter (--glass-blur) in globals.css');
  return { saturate: Number(m[1]), brightness: Number(m[2]) };
})();

/** The brightest things a panel can sit over: a white cover, and the brightest (cream) gas. */
const WHITE: Rgb = [255, 255, 255];
const CREAM: Rgb = [244, 238, 222];
/** The text tokens each surface carries. The header sets only paper and dust (checked below). */
const TEXT_ON: Record<Surface, string[]> = {
  'color-float': ['paper', 'dust', 'ash', 'lamp'],
  'panel-bg': ['paper', 'dust', 'ash', 'lamp'],
  'top-bg': ['paper', 'dust'],
};

/** The declarations of the first rule whose selector is exactly `selector` in a stylesheet. */
function rule(sheet: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(sheet);
  if (!m) throw new Error(`no rule ${selector}`);
  return Object.fromEntries(
    m[1].split(';').map((d) => d.split(':')).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  );
}

/** A value's colour: a token (`var(--color-x)`), or the album accent for `var(--acc)`. */
function resolve(value: string, acc: string): string {
  const v = /var\(--(?:color-)?([a-z0-9-]+)\)/.exec(value)?.[1];
  if (!v) throw new Error(`not a token: ${value}`);
  return v === 'acc' ? acc : tok(v);
}

const ALBUMS = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as AlbumRecord[];
/** Every accent the page can show: each album's, plus the default before an album sets one. */
const ACCENTS: Array<[string, string]> = [['default', tok('acc')], ...ALBUMS.map((a): [string, string] => [a.slug, a.w[2]])];

describe('WCAG AA contrast', () => {
  it('computes reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('reads the tokens, the glass surfaces and the glass filter from globals.css', () => {
    expect(tok('room')).toBe('#07060a');
    expect(tok('lamp-ink')).toBe('#121016');
    expect(GLASS['color-float']).toEqual({ rgb: [10, 9, 14], alpha: 0.66 });
    expect(GLASS['panel-bg']).toEqual({ rgb: [8, 7, 11], alpha: 0.7 });
    expect(GLASS['top-bg']).toEqual({ rgb: [7, 6, 10], alpha: 0.58 });
    expect(FILTER).toEqual({ saturate: 1.2, brightness: 0.58 });
    // Solid is fully solid (alpha 1): nothing of the map shows through, on the phone header too.
    const solid: Tint = { rgb: [10, 9, 14], alpha: 1 };
    // Three fallback blocks (phone width, no backdrop-filter, reduced transparency), the same value in each.
    for (const s of SURFACES) expect(SOLID[s], s).toEqual([solid, solid, solid]);
  });

  it('models a glass panel: saturate, brightness, then the tint', () => {
    expect(surfaceOver(WHITE, FILTER, GLASS['panel-bg'])).toBe('#323134');
    expect(surfaceOver(WHITE, FILTER, GLASS['color-float'])).toBe('#39383c');
    expect(surfaceOver(WHITE, FILTER, GLASS['top-bg'])).toBe('#424244');
    expect(surfaceOver(WHITE, null, SOLID['panel-bg'][0])).toBe('#0a090e');
    expect(rgbToHex(paintOver([255, 255, 255], 0.5, [0, 0, 0]))).toBe('#808080');
  });

  it('every text token passes 4.5:1 on every opaque surface', () => {
    for (const fg of ['paper', 'dust', 'ash', 'lamp'].map(tok)) {
      for (const bg of ['room', 'room-2', 'room-3', 'room-4', 'pane'].map(tok)) {
        expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const sel of ['.btn-lamp', '.skip']) {
      const r = rule(css('styles/shell.css'), sel);
      expect(contrastRatio(resolve(r.color, ''), resolve(r.background, '')), sel).toBeGreaterThanOrEqual(4.5);
    }
    // The hovered lamp button, and the paper pills (toast, phone map button), set lamp-ink.
    expect(contrastRatio(tok('lamp-ink'), tok('lamp-hover'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tok('lamp-ink'), tok('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('every text token passes 4.5:1 on glass over the brightest backdrop', () => {
    for (const [name, backdrop] of [['white', WHITE], ['cream gas', CREAM]] as const) {
      for (const s of SURFACES) {
        const bg = surfaceOver(backdrop, FILTER, GLASS[s]);
        for (const t of TEXT_ON[s]) expect(contrastRatio(tok(t), bg), `${t} on --${s} glass over ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the header sets only paper and dust, the two tokens that pass on its glass', () => {
    const shell = css('styles/shell.css');
    expect(rule(shell, '.wordmark').color).toBe('var(--color-paper)');
    expect(rule(shell, '.navbtn, .icon-btn').color).toBe('var(--color-dust)');
    expect(rule(shell, '.top').background).toBe('var(--top-bg)');
  });

  it('every text token passes 4.5:1 on the solid fallback over an unfiltered white backdrop', () => {
    for (const s of SURFACES) {
      for (const tint of SOLID[s]) {
        const bg = surfaceOver(WHITE, null, tint);
        for (const t of ['paper', 'dust', 'ash', 'lamp']) expect(contrastRatio(tok(t), bg), `${t} on solid --${s} (${bg})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('every album accent passes 4.5:1 on the room colour, and 3:1 as a mark on the panels', () => {
    const room = tok('room');
    const glassPanel = surfaceOver(WHITE, FILTER, GLASS['panel-bg']);
    const solidPanel = surfaceOver(WHITE, null, SOLID['panel-bg'][0]);
    const bad = ACCENTS.flatMap(([s, acc]) => [
      contrastRatio(acc, room) < 4.5 ? `${s} ${acc} on the room ${contrastRatio(acc, room).toFixed(2)}` : '',
      contrastRatio(acc, glassPanel) < 3 ? `${s} ${acc} on the glass panel ${contrastRatio(acc, glassPanel).toFixed(2)}` : '',
      contrastRatio(acc, solidPanel) < 3 ? `${s} ${acc} on the solid panel ${contrastRatio(acc, solidPanel).toFixed(2)}` : '',
    ]).filter(Boolean);
    expect(bad).toEqual([]);
  });

  it('the hot rank badge on the map passes 4.5:1 for every album accent', () => {
    const hot = rule(css('styles/map.css'), '.mk-n[data-hot]');
    const bad = ACCENTS.filter(([, acc]) => contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)) < 4.5).map(
      ([s, acc]) => `${s} ${acc} ${contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)).toFixed(2)}`,
    );
    expect(bad).toEqual([]);
  });

  it('a lit mood tag passes 4.5:1 for every album accent, on the glass panel and on the solid one', () => {
    const lit = rule(css('styles/album.css'), '.tags li.lit');
    const mix = /color-mix\(in srgb, var\(--acc\) (\d+)%, transparent\)/.exec(lit.background);
    expect(mix, lit.background).not.toBeNull();
    const pct = Number(mix![1]) / 100;
    const panels = [surfaceOver(WHITE, FILTER, GLASS['panel-bg']), surfaceOver(WHITE, null, SOLID['panel-bg'][0])];
    const bad = ACCENTS.flatMap(([s, acc]) =>
      panels.filter((p) => contrastRatio(resolve(lit.color, acc), rgbToHex(paintOver(hexToRgb(acc), pct, hexToRgb(p)))) < 4.5).map((p) => `${s} ${acc} on ${p}`),
    );
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/contrast.test.ts)`
Expected: FAIL, the file does not load: `Error: no rgba value for --color-float in globals.css`.

What the rewritten file still proves. All five tests of the old file are in it, none weaker: the reference ratios (unchanged); the tokens read from `globals.css` (new values, and now the glass and solid values too); every text token at 4.5:1 on every opaque surface (the same loop without `float`, which is no longer opaque and is checked as glass and as solid instead, plus the hovered lamp button); every album accent at 4.5:1 on the room colour (kept, with the 3:1 mark check added); the hot rank badge for every accent (unchanged); a lit mood tag for every accent (the same computation, now over the worst glass panel and over the solid panel, both brighter than the old opaque panel, so it is stricter).

- [ ] **Step 3: Add the pure functions to `frontcreck/src/lib/contrast.ts`**

Append after the last line (`contrastRatio`, L18):

```ts

export type Rgb = [number, number, number];
/** A see-through colour: `rgba(r, g, b, alpha)`. */
export interface Tint {
  rgb: Rgb;
  alpha: number;
}
/** The colour part of `backdrop-filter: blur(...) saturate(s) brightness(k)`. */
export interface GlassFilter {
  saturate: number;
  brightness: number;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, v));

export const rgbToHex = (rgb: Rgb): string => `#${rgb.map((c) => Math.round(clamp255(c)).toString(16).padStart(2, '0')).join('')}`;

/** CSS `saturate(s)` then `brightness(k)` on an sRGB colour, as `backdrop-filter` applies them (the filter
 * functions work on the sRGB values, each result clamped). A blur leaves a flat backdrop unchanged, so this is
 * what a glass panel sees of a uniformly bright area behind it. */
export function filterBackdrop([r, g, b]: Rgb, { saturate: s, brightness: k }: GlassFilter): Rgb {
  const sat = [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ];
  return sat.map((c) => clamp255(clamp255(c) * k)) as Rgb;
}

/** `top` at `alpha` painted over the opaque `bottom` (source-over in sRGB, as the browser composites). */
export function paintOver(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

/** The colour a panel shows over `backdrop`, as #rrggbb: the backdrop filtered (glass) or left as it is
 * (`filter` null: the solid fallback has no backdrop-filter), then the panel's tint painted over it. */
export function surfaceOver(backdrop: Rgb, filter: GlassFilter | null, tint: Tint): string {
  return rgbToHex(paintOver(tint.rgb, tint.alpha, filter ? filterBackdrop(backdrop, filter) : backdrop));
}
```

- [ ] **Step 4: Change the tokens in `frontcreck/src/app/globals.css`**

Replace L9-38 (the `@theme` block and the `:root` block) with:

```css
@theme {
  --color-room: #07060a;
  --color-room-2: #0e0d13;
  --color-room-3: #17161d;
  --color-room-4: #24222c;
  --color-paper: #f3eee7;
  --color-dust: #c4beb6;
  --color-ash: #aaa49d;
  --color-rule: rgba(241, 236, 228, 0.14);
  --color-rule-2: rgba(241, 236, 228, 0.26);
  --color-rule-3: rgba(241, 236, 228, 0.45);
  --color-lamp: #f1ece4;
  --color-lamp-hover: #ffffff;
  --color-lamp-ink: #121016;
  --color-pane: #07060a;
  --color-float: rgba(10, 9, 14, 0.66);
  --font-serif: var(--font-serif-face), "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  --font-sans: var(--font-sans-face), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

:root {
  --out: cubic-bezier(.22, .72, .2, 1);
  --dur: .4s;
  --hdr: 64px;
  --gut: 32px;
  --panel: min(45vw, 660px);
  --acc: #d9a066;
  /* Glass: the album panel and the header are see-through like --color-float, and every glass surface blurs and
     dims the map behind it with --glass-blur (the one rule that uses it is in styles/shell.css). The numbers are
     checked for 4.5:1 text contrast over a white backdrop in src/lib/contrast.test.ts. */
  --panel-bg: rgba(8, 7, 11, 0.7);
  --top-bg: rgba(7, 6, 10, 0.58);
  --glass-blur: blur(22px) saturate(1.2) brightness(0.58);
  color-scheme: dark;
}

/* Solid panels instead of glass, in three cases, the same four values in each. Solid is fully solid (alpha 1, kept
   in rgba() form so the tests and the perf script read one format): nothing of the map shows through. The first
   line is the phone glass switch: phones launch with solid panels, and deleting that one line is the whole change
   that gives them glass. It stays until the owner has tried glass on his own phone and the blur timings show no
   slowdown. */
@media (max-width: 899px) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 1); --panel-bg: rgba(10, 9, 14, 1); --top-bg: rgba(10, 9, 14, 1); } }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 1); --panel-bg: rgba(10, 9, 14, 1); --top-bg: rgba(10, 9, 14, 1); } }
@media (prefers-reduced-transparency: reduce) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 1); --panel-bg: rgba(10, 9, 14, 1); --top-bg: rgba(10, 9, 14, 1); } }
```

L40-46 of the file (the two width blocks that set `--gut`, `--panel` and, under 900 px, `--hdr: 60px`) are not part of the replacement and stay as they are, after the three new lines.

**The phone glass switch** is the line that starts `@media (max-width: 899px) { :root { --glass-blur: none;`. Phones launch with solid panels, fully solid: the panels, the zoom buttons and the header have opacity 1 there. Deleting that single line is the whole change that gives phones glass. It stays in until the owner has tried a preview on his own phone and Task 9's phone pair (glass on against off) shows no slowdown; Task 11 Step 8 lists the three test expectations that change with it. The phone album list is opaque either way (`phone.css`, Task 2).

`--color-clay`, `--color-moss` and `--color-ochre` are gone. Confirm nothing uses them: `grep -rn "color-clay\|color-moss\|color-ochre" frontcreck/src` must print nothing.

- [ ] **Step 5: Point the header at its token in `frontcreck/src/styles/shell.css`**

The test in Step 1 reads `.top`'s background. L30, before:

```css
  background: rgba(21, 17, 13, .96); border-bottom: 1px solid var(--color-rule);
```

after:

```css
  background: var(--top-bg); border-bottom: 1px solid var(--color-rule);
```

- [ ] **Step 6: Run the unit test to pass**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/contrast.test.ts)`
Expected: PASS, 10 tests.

- [ ] **Step 7: Update the three places that pin a token's value**

`frontcreck/src/app/layout.tsx` L32 (L40 after part 2), before: `  themeColor: '#15110d',` after: `  themeColor: '#07060a',`

`frontcreck/e2e/smoke.spec.ts` L14, before: `  expect(bg).toBe('rgb(21, 17, 13)');` after: `  expect(bg).toBe('rgb(7, 6, 10)');`

`frontcreck/e2e/search.spec.ts` L227 (an empty cover box shows `--color-room-3`), before: `    await expect(cover).toHaveCSS('background-color', 'rgb(38, 32, 25)');` after: `    await expect(cover).toHaveCSS('background-color', 'rgb(23, 22, 29)');`

Both e2e lines still prove what they proved: the body paints the room token, and a loading cover is an empty box in the raised-surface colour.

- [ ] **Step 8: Typecheck, lint, full unit run**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint && npm run test)`
Expected: all pass. (Part 2 removes `CLUSTER_RGB` and leaves a stand-in in `MapPreviewStrip.tsx`, so the strip and its test still load and pass here; Task 5 rewrites both. Nothing in this task touches them or the shader test.)

- [ ] **Step 9: Commit**

```bash
git add frontcreck/src/lib/contrast.ts frontcreck/src/lib/contrast.test.ts frontcreck/src/app/globals.css frontcreck/src/app/layout.tsx frontcreck/src/styles/shell.css frontcreck/e2e/smoke.spec.ts frontcreck/e2e/search.spec.ts
git commit -m "feat(theme): Trifid glass tokens, solid fallback switch and worst-case contrast checks

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 2: Glass surfaces, the literal sweep, and no film grain

**Files:**
- Create: `frontcreck/src/styles/glass.test.ts`
- Create: `frontcreck/e2e/glass.spec.ts`
- Modify: `frontcreck/src/lib/contrast.test.ts` (imports at L6, new `describe` appended)
- Modify: `frontcreck/e2e/helpers.ts` (append `contrastOverBackdrop`)
- Modify: `frontcreck/e2e/nowebgl.spec.ts` (imports L1-2, new test appended)
- Modify: `frontcreck/src/styles/shell.css` L20-23 (the grain rule, removed), L33, L57, L59, L63, L72 (the toast's bottom edge)
- Modify: `frontcreck/e2e/phone.spec.ts` (one test appended: the toast on a phone)
- Modify: `frontcreck/src/app/layout.tsx` L46 (the grain element, removed; L54 once part 2 has added the names font above it)
- Modify: `frontcreck/src/styles/map.css` L39, L44, L45, L47, L48, L58 (never the focus markers block, which part 2 owns: L72-95 today, L72 to about L123 once part 2 has rewritten it and added the names rules)
- Modify: `frontcreck/src/styles/album.css` L1, L2, L8, L30, L44, L54
- Modify: `frontcreck/src/styles/home.css` L24, L25, L30, L36
- Modify: `frontcreck/src/styles/search.css` L35, L43, L53
- Modify: `frontcreck/src/styles/phone.css` L11

**Interfaces:**
- Consumes: Task 1's tokens and `surfaceOver`, `paintOver`, `rgbToHex`; `ambientBackground(a, 'panel')` from `src/components/album/AmbientWash.tsx`; from part 1, a WebGL canvas with the gas behind the panels (the e2e checks measure whatever is there).
- Produces: one CSS rule that makes `.top, .panel, .album, .map-zoom button, .map-names, .map-tip, .map-msg, .about, .combo--hero .combo-field, .fab-map--on` glass. `.map-names` is part 2's names toggle (its names toggle task): a `<button class="map-names">` that is the first child of `.map-zoom`, 8 px above the three zoom buttons. `.map-zoom button` already matches it, so it takes the zoom buttons' size and glass; `.map-names` stays in the list so the rule still covers it if it is ever moved out of the stack. `e2e/helpers.ts` exports `contrastOverBackdrop(page: Page, scope: string, selectors: string[]): Promise<Array<{ selector: string; ratio: number }>>`.
- Note on part 2 (not edited here): its plan replaces `map.css` L72-95 and makes the rank badge `.mk-n` opaque, and the hot badge room digits on `--color-lamp`. If it lands after this task and `.mk-n` still uses `var(--color-float)`, the badge is see-through and unblurred for that while: paper digits still pass (5.7 over white).

- [ ] **Step 1: Write the failing structure test, `frontcreck/src/styles/glass.test.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
const SHEETS = ['app/globals.css', 'styles/shell.css', 'styles/home.css', 'styles/search.css', 'styles/map.css', 'styles/album.css', 'styles/phone.css'];
const SOLID = '--glass-blur: none; --color-float: rgba(10, 9, 14, 1); --panel-bg: rgba(10, 9, 14, 1); --top-bg: rgba(10, 9, 14, 1);';

/** A stylesheet without the map marker rules (map.css, "focus markers" up to the phone block): the map-markers
 * work restyles those itself. */
const mine = (file: string) => (file === 'styles/map.css' ? read(file).replace(/\/\* focus markers[\s\S]*?(?=\n@media)/, '') : read(file));

describe('glass', () => {
  it('one rule gives every glass surface the blur, with the Safari prefix first', () => {
    const m = /\n([^{}\n]+)\{\s*-webkit-backdrop-filter: var\(--glass-blur\); backdrop-filter: var\(--glass-blur\);\s*\}/.exec(read('styles/shell.css'));
    expect(m, 'the glass rule in shell.css').not.toBeNull();
    expect(m![1].split(',').map((s) => s.trim())).toEqual([
      '.top', '.panel', '.album', '.map-zoom button', '.map-names', '.map-tip', '.map-msg', '.about', '.combo--hero .combo-field', '.fab-map--on',
    ]);
  });

  it('no surface sets a blur of its own, so --glass-blur switches all of them', () => {
    // globals.css only defines the property (and names backdrop-filter in its @supports test); the rules are in styles/.
    for (const f of SHEETS.filter((s) => s !== 'app/globals.css')) {
      const own = [...read(f).matchAll(/backdrop-filter:\s*([^;]+);/g)].map((x) => x[1]).filter((v) => v !== 'var(--glass-blur)' && v !== 'none');
      expect(own, f).toEqual([]);
    }
  });

  it('the Home header stays clear', () => {
    expect(read('styles/shell.css')).toContain('.top.top--home { -webkit-backdrop-filter: none; backdrop-filter: none; }');
  });

  it('phones, browsers without backdrop-filter and reduced transparency get the same solid panels', () => {
    const globals = read('app/globals.css');
    for (const block of [
      `@media (max-width: 899px) { :root { ${SOLID} } }`,
      `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { :root { ${SOLID} } }`,
      `@media (prefers-reduced-transparency: reduce) { :root { ${SOLID} } }`,
    ]) {
      expect(globals).toContain(block);
    }
  });

  it('the album panel is glass on wide screens and opaque as the phone list', () => {
    expect(read('styles/album.css')).toMatch(/^\.album \{[^}]*background: var\(--panel-bg\);/m);
    expect(read('styles/phone.css')).toMatch(/\n {2}\.album \{[^}]*background: var\(--color-room\);/);
  });

  it('the album wash stays inside the panel', () => {
    expect(read('styles/album.css')).toContain('.map-amb { display: none; }');
  });

  it('no colour of the old warm theme is left in the stylesheets', () => {
    const OLD = ['237, 229, 213', '21, 17, 13', '12, 10, 8', '230, 168, 86', '#efb86c', '#d9d0bf', '#15110d', '#1a1511', '#17120e', '#e6a856'];
    for (const f of SHEETS) {
      const text = mine(f);
      expect(OLD.filter((c) => text.includes(c)), f).toEqual([]);
    }
  });

  it('the album accent is never a text colour', () => {
    for (const f of SHEETS) expect(/(?:^|[\s;{])color:\s*var\(--acc\)/m.test(read(f)), f).toBe(false);
  });

  it('the toast keeps clear of the bottom safe area', () => {
    // A phone with a home indicator: 28 px above the inset, not 28 px above the glass edge.
    expect(read('styles/shell.css')).toMatch(/\.toast \{\s*position: fixed; left: 50%; bottom: calc\(28px \+ env\(safe-area-inset-bottom\)\);/);
  });

  it('the film grain overlay is gone', () => {
    for (const f of SHEETS) {
      const text = read(f);
      expect(/\.grain\b/.test(text), f).toBe(false);
      expect(text.includes('feTurbulence'), f).toBe(false);
    }
    expect(read('app/layout.tsx')).not.toContain('grain');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/styles/glass.test.ts)`
Expected: FAIL. "the glass rule in shell.css: expected null not to be null", the album and wash tests fail, and the old-colour test lists `237, 229, 213` and others in `shell.css`, `map.css`, `home.css`, `album.css`, `search.css`, `phone.css`. "the film grain overlay is gone" fails on `.grain` in `shell.css`, and "the toast keeps clear of the bottom safe area" fails (today's rule says `bottom: 28px`). ("the album accent is never a text colour" and the three fallback blocks already pass.)

- [ ] **Step 3: Edit `frontcreck/src/styles/shell.css`**

The line numbers in this step are today's; the grain rule, four lines above them, is removed last so they stay valid.

After L33 (`.top.top--home { background: transparent; border-color: transparent; }`) insert:

```css
/* Glass: these surfaces blur and dim the map behind them. --glass-blur is `none` wherever panels are solid
   (phones, no backdrop-filter, reduced transparency: see globals.css). The prefixed line is for Safari before 18. */
.top, .panel, .album, .map-zoom button, .map-names, .map-tip, .map-msg, .about, .combo--hero .combo-field, .fab-map--on {
  -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
}
.top.top--home { -webkit-backdrop-filter: none; backdrop-filter: none; }
```

L57, before: `.btn-lamp:hover { background: #efb86c; }` after: `.btn-lamp:hover { background: var(--color-lamp-hover); }`

L59, before: `.btn-line:hover { border-color: rgba(237, 229, 213, .4); background: rgba(237, 229, 213, .04); }` after: `.btn-line:hover { border-color: var(--color-rule-3); background: rgba(241, 236, 228, .05); }`

L63, before: `.textbtn.u span { text-decoration: underline; text-decoration-color: rgba(237, 229, 213, .35); text-underline-offset: 5px; }` after: `.textbtn.u span { text-decoration: underline; text-decoration-color: rgba(241, 236, 228, .35); text-underline-offset: 5px; }`

The toast, a small fix made here because this task is in the file anyway. Today `.toast` is `position: fixed; bottom: 28px` (L71-72) with no safe area inset, and `phone.css` has no rule for it, so on a phone with a home indicator it sits lower than every other bottom control of the site, which all add `env(safe-area-inset-bottom)` (the slider panel, the Map button, the shelf, the About card). L72, before:

```css
  position: fixed; left: 50%; bottom: 28px; transform: translate(-50%, 12px); z-index: 140; opacity: 0; pointer-events: none; max-width: calc(100% - 32px);
```

after:

```css
  position: fixed; left: 50%; bottom: calc(28px + env(safe-area-inset-bottom)); transform: translate(-50%, 12px); z-index: 140; opacity: 0; pointer-events: none; max-width: calc(100% - 32px);
```

Where the inset is 0 (every desktop, and the emulated phone of the tests) nothing moves. Nothing else about the toast changes: it is opaque paper with dark ink, on `body` above the stage (z-index 140), and no glass surface or layer of this part covers it.

What holds today on a phone, and after this line. The site has three toasts: two from the copy link button in the album list, one from "Surprise me" on Home. The slider panel exists only in map mode and in Explore, where there is no copy button, so a toast and the slider are on screen together only if the visitor taps Map within the toast's 2.6 seconds; the toast then lies over the top of the slider panel until it fades. That is so today and is not changed here (moving the toast above the slider would need the slider's measured height outside the map pane; it is reported as open, not improvised). In the list, the short "Link copied" toast is level with the Map button but clear of it sideways (at 390 px and at 360 px wide); the long "Could not copy" toast can reach under it, today and after. So the phone test added in Step 12 checks what can be checked on the real path: the toast clears the bottom edge by its 28 px and does not touch the Map button.

Last, remove the film grain. The approved pictures have none and the owner chose none (`docs/design/trifid-theme/options/q-grain.jpg`). In `shell.css` delete the whole rule at L20-23:

```css
.grain {
  position: fixed; inset: 0; z-index: 150; pointer-events: none; opacity: .035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .95 0 0 0 0 .85 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

(the `background-image` line is one long data URL holding an SVG `feTurbulence` filter). In `frontcreck/src/app/layout.tsx` delete L46 (L54 after part 2), the element that carried it:

```tsx
        <div className="grain" aria-hidden="true" />
```

Nothing else refers to it: before the edit `grep -rn "grain" frontcreck/src frontcreck/e2e frontcreck/scripts` finds only these two places, so no browser test, script or other stylesheet changes; afterwards it finds only the new test in `src/styles/glass.test.ts`. The baseline's `REGRESSION-CHECKLIST.md` lists the grain among the things the old site had; the regression reviewer of Task 10 is told it was removed on purpose.

- [ ] **Step 4: Edit `frontcreck/src/styles/map.css` (all six lines are above the focus markers block, so part 2 does not move them)**

L39, before: `.mode-track::before { content: ""; position: absolute; left: 8px; right: 8px; top: 10px; height: 2px; background: var(--color-rule-2); }` after: the same with `background: var(--color-rule-3);`

L44, in `::-webkit-slider-thumb`, before: `border: 3px solid var(--color-float);` after: `border: 3px solid var(--color-room-2);`

L45, in `::-moz-range-thumb`, before: `border: 3px solid var(--color-float);` after: `border: 3px solid var(--color-room-2);`

L47, before: `.mode input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 5px rgba(230, 168, 86, .35); }` after: `.mode input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 3px var(--color-room), 0 0 0 5px var(--color-lamp); }`

L48, before: `.mode input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 5px rgba(230, 168, 86, .35); }` after: `.mode input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 3px var(--color-room), 0 0 0 5px var(--color-lamp); }`

L58 (the hint is text directly on the map, so it gets the prototype's band: `docs/design/trifid-theme/prototype/src/css/trifid.css` L16-19), before:

```css
.map-hint { position: absolute; left: 20px; bottom: 20px; right: 90px; font-size: 13px; color: var(--color-ash); pointer-events: none; text-shadow: 0 1px 8px var(--color-pane); transition: opacity .25s var(--out), visibility 0s; }
```

after:

```css
/* Text straight on the nebula: a soft full-width band under it (z-index -1 keeps it under the zoom buttons and the
 * card), dark enough from 50% down that paper holds 4.5:1 over a white backdrop (contrast.test.ts). */
.map-hint { position: absolute; left: 0; right: 0; bottom: 0; z-index: -1; padding: 44px 120px 18px 20px; font-size: 13px; color: var(--color-paper); pointer-events: none; background: linear-gradient(rgba(4, 4, 8, 0), rgba(4, 4, 8, .62) 50%, rgba(4, 4, 8, .78)); transition: opacity .25s var(--out), visibility 0s; }
```

L135 (the veil) is changed in Task 6.

- [ ] **Step 5: Edit `frontcreck/src/styles/album.css`**

L1, before: `background: var(--color-room);` after: `background: var(--panel-bg);` (rest of the line unchanged).

L2, before: `.amb { position: absolute; left: 0; right: 0; top: 0; height: 440px; pointer-events: none; }` after: `.amb { position: absolute; left: 0; right: 0; top: 0; height: 440px; pointer-events: none; opacity: .9; }`

L8, before: `.map-amb { position: absolute; inset: 0; pointer-events: none; }` after:

```css
/* The album's wash stays inside the panel: over the nebula a per-album tint would fight the map's own colours. */
.map-amb { display: none; }
```

This follows the approved look: `docs/design/trifid-theme/options/final-album.jpg` shows the wash inside the panel only, and the prototype has no wash layer over the map (`prototype/src/panel.js` L11 and L29 build the panel's `.amb`; `prototype/src/css/app.css` L187 styles it; nothing else). Today's site does tint the map behind an open album, so this is on the list "Changed from today's site, for the owner to see" at the end of this plan.

L30, before: `.icon-quiet:hover { color: var(--color-paper); border-color: rgba(237, 229, 213, .4); }` after: `.icon-quiet:hover { color: var(--color-paper); border-color: var(--color-rule-3); }`

L44, before: `.rec.hot .rec-main { background: rgba(237, 229, 213, .045); }` after: `.rec.hot .rec-main { background: rgba(241, 236, 228, .06); }`

L54, before: `.rec-sp:hover { color: var(--color-paper); background: rgba(237, 229, 213, .06); }` after: `.rec-sp:hover { color: var(--color-paper); background: rgba(241, 236, 228, .07); }`

- [ ] **Step 6: Edit `frontcreck/src/styles/home.css` (About and 404 surfaces; the hero, shelf and veil are Task 6)**

L24, before: `background: rgba(12, 10, 8, .72); }` after: `background: rgba(5, 4, 8, .3); }`

L25, before: `background: var(--color-room);` after: `background: var(--panel-bg);`

L30, before: `.about p { font-size: 16.5px; line-height: 1.65; color: #d9d0bf; margin-top: 16px; }` after: `.about p { font-size: 16.5px; line-height: 1.65; color: #e0dbd3; margin-top: 16px; }`

L36, before: `background: rgba(12, 10, 8, .55); }` after: `background: rgba(5, 4, 8, .55); }`

- [ ] **Step 7: Edit `frontcreck/src/styles/search.css` and `frontcreck/src/styles/phone.css`**

`search.css` L35, before: `.opt mark { background: none; color: var(--color-paper); box-shadow: inset 0 -1px 0 rgba(230, 168, 86, .8); }` after: `.opt mark { background: none; color: var(--color-paper); box-shadow: inset 0 -1px 0 var(--color-lamp); }`

`search.css` L43 (the prototype's `.5` tint fails for the ash placeholder; `--color-float` passes at 4.71), before: `.combo--hero .combo-field { height: 58px; padding: 0 16px 0 18px; }` after: `.combo--hero .combo-field { height: 58px; padding: 0 16px 0 18px; background: var(--color-float); }`

`search.css` L53, before: `color: rgba(237, 229, 213, .78);` after: `color: rgba(243, 238, 231, .78);`

The search popover (`.combo-pop`, `--color-room-2`) and the phone search sheet (`--color-room`) stay opaque: no edit.

`phone.css` L11, before: `  .album { width: 100%; border-right: 0; transition: transform var(--dur) var(--out), visibility 0s; }` after: `  .album { width: 100%; border-right: 0; background: var(--color-room); transition: transform var(--dur) var(--out), visibility 0s; }`

- [ ] **Step 8: Run the structure test to pass**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/styles/glass.test.ts)`
Expected: 9 of the 10 pass. "no colour of the old warm theme is left in the stylesheets" still fails, and lists `21, 17, 13` for `styles/map.css` and `styles/phone.css` and nothing else: that is the Home veil (`map.css` L135, `phone.css` L6). Make the two edits of Task 6 Step 3 now and rerun: PASS, 10 tests. (Task 6 Step 3 then finds them already made.)

- [ ] **Step 9: Add the wash, About and hint contrast tests to `frontcreck/src/lib/contrast.test.ts`**

Add after the `hexToRgb` import (L4): `import { ambientBackground } from '@/components/album/AmbientWash';`

Append at the end of the file:

```ts

describe('text over washes and bands', () => {
  const WORST_PANEL = hexToRgb(surfaceOver(WHITE, FILTER, GLASS['panel-bg']));

  it('paper and dust pass 4.5:1 on every album wash at full strength, on the brightest glass panel', () => {
    const opacity = Number(rule(css('styles/album.css'), '.amb').opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(1);
    const bad: string[] = [];
    for (const a of ALBUMS) {
      // The alphas ambientBackground gives the two washes (the panel variant paints w[0], then w[1]).
      const alphas = [...ambientBackground(a.w, 'panel').matchAll(/rgba\(\d+,\d+,\d+,([\d.]+)\)/g)].map((m) => Number(m[1]));
      a.w.slice(0, 2).forEach((wash, i) => {
        const bg = rgbToHex(paintOver(hexToRgb(wash), alphas[i] * opacity, WORST_PANEL));
        for (const t of ['paper', 'dust']) {
          if (contrastRatio(tok(t), bg) < 4.5) bad.push(`${a.slug} ${wash} ${t} ${contrastRatio(tok(t), bg).toFixed(2)}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('the About card is the glass panel and its body text passes on it', () => {
    const home = css('styles/home.css');
    expect(rule(home, '.about').background).toBe('var(--panel-bg)');
    expect(contrastRatio(rule(home, '.about p').color, rgbToHex(WORST_PANEL))).toBeGreaterThanOrEqual(4.5);
  });

  it('the Home search field is the float surface, on which its ash placeholder passes', () => {
    expect(rule(css('styles/search.css'), '.combo--hero .combo-field').background).toBe('var(--color-float)');
  });

  it('the map hint is paper on a band that holds 4.5:1 over an unfiltered white backdrop', () => {
    const hint = rule(css('styles/map.css'), '.map-hint');
    expect(hint.color).toBe('var(--color-paper)');
    const band = /rgba\(4, 4, 8, ([\d.]+)\) 50%/.exec(hint.background);
    expect(band, hint.background).not.toBeNull();
    const bg = surfaceOver(WHITE, null, { rgb: [4, 4, 8], alpha: Number(band![1]) });
    expect(contrastRatio(tok('paper'), bg), bg).toBeGreaterThanOrEqual(4.5);
  });
});
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/contrast.test.ts)`
Expected: PASS, 14 tests. To see the wash test bite, set `.amb`'s `opacity: .9` to `1` for one run: it fails with `a-tab-in-the-ocean-nektar #545721 dust 4.49`. Put `.9` back.

- [ ] **Step 10: Add the pixel contrast helper to `frontcreck/e2e/helpers.ts`**

Append at the end of the file:

```ts

/**
 * WCAG contrast of the text of each selector's first visible element against what is really painted behind it.
 * axe cannot judge text over a canvas or over a see-through panel (it reports "incomplete"), so this does: the text
 * under `scope` is made transparent for one screenshot, and the background is the 95th-percentile relative
 * luminance inside the element's box (a lone star does not decide it; a bright patch does).
 */
export async function contrastOverBackdrop(page: Page, scope: string, selectors: string[]): Promise<Array<{ selector: string; ratio: number }>> {
  const targets = await page.evaluate(
    (sels) =>
      sels.map((selector) => {
        const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
        if (!el) return { selector, rect: null, rgb: [0, 0, 0] };
        const r = el.getBoundingClientRect();
        const rgb = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        return { selector, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, rgb };
      }),
    selectors,
  );
  const missing = targets.filter((t) => !t.rect).map((t) => t.selector);
  if (missing.length) throw new Error(`contrastOverBackdrop: not visible: ${missing.join(', ')}`);
  const style = await page.addStyleTag({
    content: `${scope}, ${scope} * { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; transition: none !important; }`,
  });
  const png = (await page.screenshot()).toString('base64');
  await style.evaluate((el) => el.remove());
  return page.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return list.map((t) => {
        const x0 = Math.max(0, Math.round(t.rect!.x * k));
        const y0 = Math.max(0, Math.round(t.rect!.y * k));
        const x1 = Math.min(img.width, Math.round((t.rect!.x + t.rect!.w) * k));
        const y1 = Math.min(img.height, Math.round((t.rect!.y + t.rect!.h) * k));
        const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
        const lums: number[] = [];
        for (let i = 0; i < d.length; i += 4) lums.push(lum(d[i], d[i + 1], d[i + 2]));
        lums.sort((a, b) => a - b);
        const bg = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.95))];
        const fg = lum(t.rgb[0], t.rgb[1], t.rgb[2]);
        return { selector: t.selector, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) };
      });
    },
    [png, targets] as const,
  );
}
```

- [ ] **Step 11: Write `frontcreck/e2e/glass.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { contrastOverBackdrop, waitForAnimations, waitForCameraIdle, waitForMap } from './helpers';

const GLASS = 'blur(22px) saturate(1.2) brightness(0.58)';
/** Solid is fully solid; the browser reports rgba(10, 9, 14, 1) as rgb(10, 9, 14). */
const SOLID = 'rgb(10, 9, 14)';
/** The album whose accent has the lowest contrast in the catalog (#d44f4f). */
const WEAKEST = '/album/making-movies-dire-straits';

const styleOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { filter: cs.backdropFilter, bg: cs.backgroundColor };
  });

test('panels are glass on wide screens and solid on phones; the Home header is clear', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await expect(page.locator('.map-zoom button').first()).toBeVisible();
  if (isMobile) {
    for (const sel of ['.mode.panel', 'header.top', '.map-zoom button']) expect(await styleOf(page, sel), sel).toEqual({ filter: 'none', bg: SOLID });
  } else {
    expect(await styleOf(page, '.mode.panel')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
    expect(await styleOf(page, '.map-zoom button')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
    expect(await styleOf(page, 'header.top')).toEqual({ filter: GLASS, bg: 'rgba(7, 6, 10, 0.58)' });
  }
  await page.goto('/album/in-rainbows-radiohead');
  // The phone album list is opaque; the desktop panel is glass.
  expect(await styleOf(page, 'section.album')).toEqual(isMobile ? { filter: 'none', bg: 'rgb(7, 6, 10)' } : { filter: GLASS, bg: 'rgba(8, 7, 11, 0.7)' });
  await page.goto('/');
  expect(await styleOf(page, 'header.top')).toEqual({ filter: 'none', bg: 'rgba(0, 0, 0, 0)' });
});

test('with reduced transparency the panels are solid and unblurred', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones are already solid');
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  await expect(page.locator('.map-zoom button').first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), 'the browser must emulate the preference').toBe(true);
  for (const sel of ['.mode.panel', 'section.album', 'header.top', '.map-zoom button', '.map-explore']) {
    expect(await styleOf(page, sel), sel).toEqual({ filter: 'none', bg: SOLID });
  }
});

test('the built CSS keeps the Safari prefix and the no-support fallback', async ({ page }) => {
  await page.goto('/map');
  const cssText = await page.evaluate(async () => {
    const linked = await Promise.all([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => fetch(l.href).then((r) => r.text())));
    return [...linked, ...[...document.querySelectorAll('style')].map((s) => s.textContent ?? '')].join('\n');
  });
  // Read as text: Chromium drops the prefixed property from the parsed rules, Safari before 18 needs it.
  expect(cssText).toMatch(/-webkit-backdrop-filter:\s*var\(--glass-blur\)/);
  expect(cssText).toMatch(/[;{]\s*backdrop-filter:\s*var\(--glass-blur\)/);
  expect(cssText).toMatch(/@supports\s+not\s*\(\(backdrop-filter:\s*blur\(1px\)\)\s*or\s*\(-webkit-backdrop-filter:\s*blur\(1px\)\)\)/);
  expect(cssText).toMatch(/prefers-reduced-transparency:\s*reduce/);
});

test('text on the panels keeps 4.5:1 over the map, with the weakest accent', async ({ page, isMobile }) => {
  await page.goto(WEAKEST);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  const results = await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.seed-title', '.tags li', '.recs-h', '.rec-n', '.rec-title', '.rec-artist', '.rec-shared']);
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  // The hint is desktop only (display: none under 900 px).
  results.push(...(await contrastOverBackdrop(page, '.map-ui', ['.mode .cap', '.mode-stops button', '.mode-note', ...(isMobile ? [] : ['.map-hint'])])));
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});
```

- [ ] **Step 12: Add the no-WebGL check to `frontcreck/e2e/nowebgl.spec.ts`**

L1-2, before:

```ts
import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
```

after:

```ts
import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { contrastOverBackdrop, waitForAnimations } from './helpers';
```

Append at the end of the file:

```ts

test('without WebGL the see-through panels sit on the plain sky and keep 4.5:1', async ({ page }) => {
  await page.goto('/album/making-movies-dire-straits');
  await expect(page.locator('li.rec')).toHaveCount(5);
  await expect(page.getByText(COPY.map.noWebgl)).toBeVisible();
  await waitForAnimations(page);
  // No gas behind the glass: the pane is the plain sky colour, which the glass panels must not turn muddy or pale.
  expect(await page.locator('.map-pane').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 6, 10)');
  const results = [
    ...(await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.tags li', '.rec-n', '.rec-artist', '.rec-shared'])),
    ...(await contrastOverBackdrop(page, '.map-pane', ['.map-msg', '.mode .cap', '.mode-stops button', '.mode-note'])),
  ];
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});
```

Append at the end of `frontcreck/e2e/phone.spec.ts` (the file already imports `COPY`, `waitForAnimations` and has `IR`):

```ts

test('the "Link copied" toast keeps clear of the bottom edge and of the Map button', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(IR);
  await expect(page.locator('li.rec')).toHaveCount(5);
  // The copy button is in the album list; the slider panel is not on screen here (it belongs to map mode).
  await expect(page.locator('.mode')).toHaveCount(0);
  await page.getByRole('button', { name: COPY.album.copyLinkLabel }).tap();
  const toast = page.getByRole('status').filter({ hasText: COPY.album.linkCopied });
  await expect(toast).toBeVisible();
  await waitForAnimations(page);
  const t = (await toast.boundingBox())!;
  const vp = page.viewportSize()!;
  // 28 px above the bottom edge plus the safe area inset (0 in this emulation; glass.test.ts pins the env() term).
  expect(vp.height - (t.y + t.height)).toBeGreaterThanOrEqual(27.5);
  const fab = (await page.getByRole('button', { name: COPY.phone.mapLabel }).boundingBox())!;
  const apart = t.x + t.width <= fab.x || fab.x + fab.width <= t.x || t.y + t.height <= fab.y || fab.y + fab.height <= t.y;
  expect(apart, 'the toast and the Map button do not overlap').toBe(true);
});
```

If `.mode` is in the DOM on the phone list (hidden, not absent), change that one line to `await expect(page.locator('.mode')).toBeHidden();` and say so in the commit.

- [ ] **Step 13: Run the browser checks, one at a time**

Each command builds the site first (several minutes). Wait for one to finish before starting the next.

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/glass.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/glass.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/phone.spec.ts --project=phone --workers=1 -g "Link copied")
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/nowebgl.spec.ts --project=nowebgl --workers=1)
```

Expected: desktop 4 passed; phone 3 passed, 1 skipped; the toast test 1 passed; nowebgl 3 passed. If "with reduced transparency" fails on its `matchMedia` line, the bundled Chromium does not emulate the feature through CDP: do not delete the test; replace the `cdp.send` line with `await page.emulateMedia({ reducedTransparency: 'reduce' } as Parameters<typeof page.emulateMedia>[0]);`, and if that fails too, report it (the unit test in Step 1 still pins the block). If "text on the panels" fails for a selector, raise that surface's tint alpha in `globals.css` by .04, update the pinned values in `contrast.test.ts` ("reads the tokens", "models a glass panel"), rerun both, and record the final number in the PR body.

- [ ] **Step 14: Typecheck, lint, unit tests, commit**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint && npm run test)`
Expected: all pass.

```bash
git add frontcreck/src/styles frontcreck/src/app/layout.tsx frontcreck/src/lib/contrast.test.ts frontcreck/e2e/glass.spec.ts frontcreck/e2e/helpers.ts frontcreck/e2e/nowebgl.spec.ts frontcreck/e2e/phone.spec.ts
git commit -m "feat(theme): glass panels over the map with a solid fallback, cool literals throughout, no film grain

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 3: The map runs behind the glass header

Today `.stage` starts at `top: var(--hdr)` (`shell.css` L68) and the map pane fills it, so the header has nothing behind it. This task lets the map pane alone reach up to the top of the window; the stage and every page layer in it stay where they are. The canvas becomes taller by the header's height, so the camera is told that height (`MapInput.insetTop`) and keeps every framing exactly where it is today. The header is 64 px tall on wide screens and 60 px under 900 px wide (`globals.css` L33 and L45), so the inset is one of two numbers, chosen at the same breakpoint as the CSS.

**How it is built, and why this way.** Read before starting.

- **CSS.** `.stage` keeps `top: var(--hdr)` and loses `overflow: hidden`. `.map-pane` gets `top: calc(-1 * var(--hdr))` and takes over the clipping. `.map-ui` (slider, zoom corner, hint, card, "Explore this area") and `.map-msg` are pushed back down by `--hdr`. Nothing else moves: the album panel, Home, About, 404, the phone list and its buttons are children of the stage, not of the pane. So `#stage` is still "the area below the header", and every test that reads it keeps its meaning.
- **Camera.** `applyFrustum` already shifts the picture sideways so that `camera.position` is drawn at the centre of the area right of the album panel. It gets the same shift downwards for the header: `camera.setViewOffset(width, height, -insetLeft / 2, -insetTop / 2, width, height)`. `state/projection.ts` already mirrors both offsets, so hover, pick, drag, wheel and every overlay keep working in canvas pixels with no edit. The fits (`fitView`, `focusCamera`, the phone band in `flyTarget`) subtract `insetTop` from the height they may use. Sizes on screen go through `pxPerWorld(zoom, canvasHeight)`, which is still true of the taller canvas, so no size helper changes; only the three absolute zoom limits (`MAX_ZOOM`, `FIT_ZOOM_MIN`, `FIT_ZOOM_MAX`) are multiplied by `visibleScale = (canvasHeight - insetTop) / canvasHeight`, which keeps each the same size on screen as today. Checked with plain `node`: a 1440 x 900 canvas with a 64 px top inset fits a cloud to the same 832.5 px per world unit as today's 1440 x 836 canvas, with the same camera centre, and draws it from y = 119 to y = 785 (64 + 55 to 900 - 115); the deepest zoom gives 21280 px per world unit in both. The phone is the same algebra with its own numbers: a 390 x 844 canvas with a 60 px top inset against today's 390 x 784 canvas (unit tests in Step 3 hold both cases).
- **The pointer over the map under the header.** Decided from the code: the header keeps the pointer over its whole height, exactly as today, and the map under it takes no hover, click, tap or drag start.
  - `.top` is one fixed flex box across the window at `z-index: 60`; the stage is below it in the stacking order. Letting the gaps of the bar through would need `pointer-events: none` on `.top` and `auto` on its children, which turns a click on the bar (nothing today) into a pick of an album the visitor cannot make out through a 22 px blur. Not done.
  - Hover ends when the pointer moves onto the bar: `CursorTracker` clears it on `pointerleave`, as it does today at the canvas's top edge.
  - A drag that starts on the map carries on while the pointer is over the bar: `CameraRig` captures the pointer on `pointerdown`, as today when the pointer leaves the canvas.
  - A wheel over the bar does nothing, as today.
  - No markup moves, so the keyboard order is unchanged: skip link, header controls, canvas, map controls. The canvas's focus ring moves from the canvas's own outline (whose top edge would now be under the bar) to a ring on `.map-host`, inset to the visible map.
- **Layer order (decided here, with part 2's two DOM layers).** The header is outside the stage and above all of it; everything of the map is inside the pane:

  | Layer | z-index | In |
  |---|---|---|
  | Skip link, toast | 300, 140 | `body` |
  | Search popover | 80 | header |
  | Header `.top` (glass) | 60 | `body`, fixed |
  | Phone Map/List button `.fab-map` | 12 | stage |
  | Album panel `.album` | 10 | stage |
  | Home, About, 404 layers | 8 | stage |
  | `.map-msg` | 7 | pane |
  | `.map-ui` (slider, zoom corner with the names toggle, hint, card) | 6 | pane |
  | Hover label `.map-tip` | 5 | pane (canvas pixels) |
  | Selected ring `.map-sel`, Home veil | 4 | pane |
  | Focus markers `.mk-layer` | 3 | pane (canvas pixels) |
  | Region names `.rn-layer` (part 2) | 2 | pane (canvas pixels) |
  | Glints `.tw-layer` (part 2) | 1 | pane (canvas pixels) |
  | Canvas: gas, stars, covers | auto | pane |

  Names and glints are therefore always under the header, never over its text. Where a name slides under the bar while the visitor pans, the glass blurs and dims it like the gas; on phones the bar is opaque and nothing shows through it. The header's contrast is computed against a white backdrop, which is brighter than any name or glint, so it holds (worst case paper 8.69, dust 5.44 on glass; 17.19 and 10.76 on the solid bar). At rest no name is placed under the bar (its layout gets the visible area) and no glint starts there (a glint under the bar would be invisible work for the blur).
- **Phone.** The same code path at every width, with the phone's own header height. `--hdr` is 60 px under 900 px wide (`globals.css` L45) and 64 px above, so the top inset is `HEADER_NARROW_PX = 60` there and `HEADER_PX = 64` elsewhere. `MapStage` picks between them with its existing `narrow` flag (`useIsNarrow()`, the media query `(max-width: 899px)` of `src/lib/media.ts`, the same breakpoint as the CSS), which already picks the phone paddings in the same memo. The header is fully solid there (Task 1's phone glass switch), so the visitor sees nothing of the map through it; the framing is held exactly as on desktop, and the map under the bar is what phone glass would show if it is ever switched on.

**Files:**
- Create: `frontcreck/e2e/framing.spec.ts`
- Create: `frontcreck/e2e/fixtures/framing-baseline.json` (recorded by Step 2, committed)
- Create: `frontcreck/src/styles/stage.test.ts`
- Modify: `frontcreck/src/components/map/types.ts` (L1-3, L21-27)
- Modify: `frontcreck/src/components/map/state/mapStore.ts` L3, L13
- Modify: `frontcreck/src/components/map/MapStage.tsx` L22, L35-42, L196
- Modify: `frontcreck/src/components/map/state/projection.ts` L72-76
- Modify: `frontcreck/src/components/map/state/zoomLimits.ts` (append), `zoomLimits.test.ts` (import, one `describe` appended)
- Modify: `frontcreck/src/components/map/state/view.ts` (append)
- Modify: `frontcreck/src/components/map/state/bounds.ts` L3, L73-106, `bounds.test.ts` L13, L122-158
- Modify: `frontcreck/src/components/map/state/focusLayout.ts` L200-246, `focusLayout.test.ts` L109, L128, L142 and one test added
- Modify: `frontcreck/src/components/map/state/screen.test.ts` (whole file)
- Modify: `frontcreck/src/components/map/canvas/InitialFrame.tsx` L8-11, L19-35, L68-70, L88-96, L121-132
- Modify: `frontcreck/src/components/map/canvas/CameraTween.tsx` L67-92, L153, L165
- Modify: `frontcreck/src/components/map/canvas/CameraRig.tsx` L10, L44-46
- Modify: `frontcreck/src/components/map/canvas/CameraBounds.tsx` L9, L101-102
- Modify: `frontcreck/src/components/map/canvas/OverlayDriver.tsx` L42-43
- Modify: `frontcreck/src/components/map/canvas/MarkerDriver.tsx` L47, L96
- Modify: `frontcreck/src/components/map/MusicMap.tsx` (the `setInput` layout effect), part 2's names driver (one call), Step 8
- Modify: `frontcreck/src/styles/shell.css` L66-68, `frontcreck/src/styles/map.css` L1, L8, L19, L31
- Modify: `frontcreck/e2e/focus.spec.ts` L54-60, `frontcreck/e2e/glass.spec.ts` (one test appended)

Line numbers are today's; parts 1 and 2 and Tasks 1 and 2 have moved some of them, so find each place by the text quoted in the step.

**Interfaces:**
- Gas readiness (part 1, consumed as it is): only the shown stop's gas image loads first; the other two load at idle once the map is interactive; Home, About and 404 load one. `window.__rmr.gas === 'ready'` means every started stop has settled, and it goes back to `'loading'` when a page that showed one stop turns into the interactive map without a reload (Home to the map, or the phone album list to map mode). `waitForMap` (and `mapReady` in the scripts) waits for the flag, so it must be called again after such a change and before pixels are read or anything is measured. Where that happens in this part: `openAlbum` in `e2e/framing.spec.ts` (the phone's Map tap), the phone layout guard of Task 5, and the `h2` state of `scripts/review-shots.mjs` (Task 10); each has the second call. Every other test and state of this part reaches the map by `page.goto`, a full load, with `waitForMap` after it: `glass.spec.ts` (all tests), `pages.spec.ts` (Home, About and 404 each loaded on their own, one stop each), `framing.spec.ts` (`openMap`; the search test goes from the map to an album, both interactive, so the flag does not drop), `nowebgl.spec.ts` (no gas, the flag is `'off'`). `hover-measure.mjs` and `capture.mjs --still` load each state fresh. In `scripts/perf/perf.mjs` the album flow leaves Home by an in-page navigation and measures the transition and the morph while the other two stops may still be arriving; that is what a visitor gets, the flow is part 1's, and this part adds no wait to it (Task 9 says how to read it).
- Consumes: Task 1's `--top-bg` and Task 2's glass rule and `contrastOverBackdrop`. From part 1: `theme.json` with `stars.bg` (three bytes per album; Balanced is the second) at `/data/theme/theme.json`. From part 2: `state/stageTop.ts` (`getStageTop(): number`, `setStageTop(px: number): void`, 0 until this task sets it), which its names driver, its `chromeBlockers` (`ChromeInput.top`) and its twinkle driver read for the top of the visible map; the names layer `.rn-layer` (z-index 2); the twinkle layer `.tw-layer` (z-index 1) with one `.tw` element per glint; the twinkle switch, which is the app store's `setTwinkleOn(on)` (reached as `window.__rmr.getState().setTwinkleOn(on)`; `window.__rmr.twinkle` holds only the counters, `{ stats }`), and `twinkleOff(page)` in `e2e/helpers.ts`. These names were checked against part 2 after its revision; if a build finds one missing, look first (`grep -rn "setStageTop\|getStageTop\|twinkleOff\|tw-layer" frontcreck/src frontcreck/e2e`) and use what is there, here and in Tasks 9 and 10.
- Produces: `HEADER_PX = 64`, `HEADER_NARROW_PX = 60` and `MapInput.insetTop: number` in `components/map/types.ts`; `visibleScale(canvasHeightCssPx, insetTopCssPx): number` in `state/zoomLimits.ts`; `setVisibleScale(next: number): void` and `getVisibleScale(): number` in `state/view.ts`; `applyFrustum(camera, width, height, insetPx, insetTopPx)`; `FitArea.insetTop: number`; `focusCamera(ids, positions, width, height, insetPx, insetTopPx, pad, clampZoom)`; `visibleArea(insetLeft, width, height, edge, insetTop)`. All five changed signatures take the new value as a required argument, so the typecheck finds every caller.

**Every place that reads a rectangle of the map or converts a pointer position** (checked one by one; "no edit" means it works in canvas pixels through `canvas.getBoundingClientRect()` or `canvasRect`, which follow the canvas wherever it starts):

| Place | What it reads | Edit |
|---|---|---|
| `canvas/CursorTracker.tsx` L148-149 | pointer to canvas pixels | No edit |
| `canvas/PickController.tsx` L42, L53, L61 | pointer to canvas pixels and to world | No edit |
| `canvas/CameraRig.tsx` L167 (pinch centre), L193 (drag scale by canvas height), L260-261 (wheel anchor) | canvas rectangle | No edit: world units per px uses the canvas height, which is right for the taller canvas |
| `canvas/CameraRig.tsx` L44-46 `clampZoom` | `MAX_ZOOM` | Scaled by `getVisibleScale()` (Step 7) |
| `canvas/CameraTween.tsx` L123 `screenPoint` | canvas rectangle | No edit |
| `canvas/CameraTween.tsx` L102-103 `panBy` | canvas height for world units per px | No edit |
| `canvas/CameraTween.tsx` L67-85 `flyTarget` | the framing band on phones | Works in the visible height (Step 7) |
| `canvas/CameraTween.tsx` L86-92 `focusTarget`, L153, L165 | fit and frustum | Pass `insetTop` (Step 7) |
| `canvas/InitialFrame.tsx` L23-35, L91-96, L123 | frustum and overview fit | Pass `insetTop` (Step 7) |
| `canvas/CameraBounds.tsx` L102 | the viewport in world units | Only the part below the header counts (Step 7) |
| `canvas/OverlayDriver.tsx` L39-45 | hover label inside the visible area | `insetTop` (Step 7) |
| `canvas/MarkerDriver.tsx` L47-49, L96 | marker bounds and marker label | `insetTop` (Step 7) |
| `canvas/AlbumField.tsx` L150-151, `canvas/AtlasManager.tsx` L245, part 1's `GasField` | canvas height for sizes in px | No edit: `pxPerWorld(zoom, canvasHeight)` is still true. One bounded difference, left as it is: the sprite cap `u_maxSpritePx` is 18 percent of the canvas height, so it rises by 11.5 px (0.18 x 64; 10.8 px on a phone, 0.18 x 60). It only binds for the picked cover at the deepest zoom (127.2 px with its frame) on a window under 771 px tall at device pixel ratio 1; at 1440 x 900 (cap 150.5 px before, 162 after), 1280 x 800 (132.5, 144), the phone (141.1, 151.9) and every 2x screen (120 in both, from the 240 device px limit) nothing changes. Passing the visible height instead would mean a second height argument through part 2's shader helpers and both hit tests. |
| `MapStage.tsx` L61, L97 | pane bottom minus the slider's or the card's top | No edit: the pane's bottom edge does not move |
| Part 2's names driver | `getStageTop()` for its chrome rectangles and the top of the area a name may sit in; one `visibleArea` call | Step 8: `setStageTop` is called, and the `visibleArea` call takes the new argument |
| Part 2's twinkle driver | `getStageTop() + TWINKLE_EDGE_PX` as the top of the area a glint may start in | No edit once `setStageTop` is called (Step 8) |
| `album/usePanelInset.ts`, `album/MapPreviewStrip.tsx`, `AboutClose.tsx`, `lib/ghost-click.ts`, `search/SearchBox.tsx` | their own elements | No edit |
| `scripts/perf/perf.mjs` `exploreFlow` | canvas centre for its drag and wheel | No edit: the canvas centre is 32 px above the visible centre, still on the map and 386 px below the bar at 1440 x 900 |
| `scripts/review-shots.mjs`, `docs/design/trifid-theme/reviews/baseline/hover-measure.mjs` | `screenPoint` and `elementFromPoint` for hovers | No edit |
| `docs/design/trifid-theme/reviews/baseline/capture.mjs` | `screenPoint` for crops and hovers; L380 reads the canvas's top edge for the `hover-map-edge` state; the `focus-map-canvas-crop` crop starts at the canvas's top left corner | One line changed in Task 10 Step 3 (L380 reads `#stage` instead, the same pixel as when the baseline was taken); the crop is left as it is and the reviewers are told |

**Every test that depends on framing or pixel positions** (unit and browser), and what happens to it:

| Test | Depends on | Edit |
|---|---|---|
| `state/screen.test.ts` (all) | `applyFrustum`, projection | Rewritten with a top inset added (Step 3). Still proves the conversion matches three.js and where `camera.position` is drawn; adds the header cases. |
| `state/bounds.test.ts` `fitView` (4 tests) | fit area | `insetTop: 0` added to each call, two tests added (Step 3). The four keep their numbers. |
| `state/focusLayout.test.ts` `focusCamera` (3 tests) | fit area | `0` added as the top inset to each call, one test added (Step 3). The three keep their numbers. |
| `state/zoomLimits.test.ts` | zoom to px | One `describe` added (Step 3). |
| `state/hitTest.test.ts`, `state/zoomMath.test.ts`, `state/view.test.ts`, `focusLayout.test.ts` `layoutMarkers` and `markerAt` | canvas pixels only | No edit |
| `e2e/focus.spec.ts` "focus draws numbered covers joined to the seed, framed on screen" L54-60 | markers inside the window | Tightened (Step 10): the top bound was `0`, which a marker under the header would now pass; it becomes the header's bottom edge. Still proves every marker is on screen, and now also that none is behind the bar. |
| `e2e/focus.spec.ts` "hot album is highlighted and a hovered marker shows its label" L109 | moves the pointer to `y = 20` to leave the map | No edit: `y = 20` was above the canvas and is now on the header over it; in both the canvas gets `pointerleave`. |
| `e2e/focus.spec.ts` the two phone slider tests, "a drag that starts on a cover pans the map", "the slider morphs", "the morph is animated", "a zoom from the buttons survives" | marker and album positions relative to the slider, or to themselves | No edit |
| `e2e/explore.spec.ts` `emptyMapPoint`, `otherCoverBoxes` (Task 7), "explore shows the hint", "closing an album returns to the map where it was", "Explore this area", "leaving an album by the header nav", "browser Back", "the hint stays hidden", the picked cover test | `screenPoint`, `elementFromPoint`, camera values compared with themselves | No edit: `elementFromPoint` skips anything under the header by itself, and every camera comparison is with a value read in the same run |
| `e2e/map.spec.ts` "hover shows a label, drag pans, wheel zooms", "keyboard pans and zooms, 0 resets", "zoom buttons work" | window centre, camera compared with itself | No edit |
| `e2e/album.spec.ts` "the map stays right of the panel", "rows and map markers highlight each other" | marker boxes against the panel's right edge | No edit |
| `e2e/pages.spec.ts` "clicking empty map area goes to the map" | a click at (40, 320) | No edit |
| `e2e/phone.spec.ts` "list first, then the map strip", the zoom corner guard (Task 5) | slider and buttons against the stage and the header | No edit: the stage does not move |
| `e2e/a11y.spec.ts` "keyboard: the map, its controls and the album list are all reachable" | Tab order | No edit; the order is also pinned in the new spec |
| `e2e/helpers.ts` `visibleAlbumPoint` | `y >= 120` and `elementFromPoint` | No edit |
| `e2e/framing.spec.ts` (new) | recorded positions, the header's edge | Steps 1 and 2 |

- [ ] **Step 1: Write `frontcreck/e2e/framing.spec.ts` (the whole file, before changing anything)**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, visibleAlbumPoint, waitForAnimations, waitForCameraIdle, waitForMap } from './helpers';

/** Album positions on screen, recorded while the map still started below the header (FRAMING_RECORD=1, run once on
 * the commit before the change). Every "same place" test compares with it, so the framing is today's to the pixel. */
const BASELINE = path.join(process.cwd(), 'e2e/fixtures/framing-baseline.json');
const RECORD = process.env.FRAMING_RECORD === '1';
const TOLERANCE_PX = 0.75;
const IR = '/album/in-rainbows-radiohead';
const IN_RAINBOWS = 11;
/** Albums spread over the catalogue (indices into albums.json). One that is off screen still has a position. */
const PROBES = [0, 11, 42, 1158, 2000, 4000];

type Pt = { x: number; y: number };
type Box = { id: number; x: number; y: number; w: number; h: number };
type Entry = { points: Pt[]; markers: Box[] };

const headerBottom = (page: Page) => page.locator('header.top').evaluate((el) => el.getBoundingClientRect().bottom);
const pointOf = async (page: Page, id: number) => (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
const points = (page: Page) => page.evaluate((ids) => ids.map((id) => window.__rmr!.map!.screenPoint(id)!), PROBES);
const markers = (page: Page) =>
  page.locator('.mk').evaluateAll((els) =>
    els
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { id: Number((e as HTMLElement).dataset.albumId), x: r.x, y: r.y, w: r.width, h: r.height };
      })
      .sort((a, b) => a.id - b.id),
  );

/** Records this state's album positions and marker boxes (FRAMING_RECORD=1), or compares them with the record. */
async function sameAsRecorded(page: Page, info: TestInfo, state: string): Promise<void> {
  const key = `${info.project.name}/${state}`;
  const now: Entry = { points: await points(page), markers: await markers(page) };
  const all: Record<string, Entry> = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  if (RECORD) {
    all[key] = now;
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, `${JSON.stringify(all, null, 1)}\n`);
    return;
  }
  const was = all[key];
  expect(was, `no recorded framing for ${key}: record it on the commit before the header change`).toBeTruthy();
  expect(now.points.length).toBe(was.points.length);
  now.points.forEach((p, i) => {
    expect(Math.abs(p.x - was.points[i].x), `${key} album ${PROBES[i]} x`).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(p.y - was.points[i].y), `${key} album ${PROBES[i]} y`).toBeLessThanOrEqual(TOLERANCE_PX);
  });
  expect(now.markers.map((m) => m.id)).toEqual(was.markers.map((m) => m.id));
  now.markers.forEach((m, i) => {
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(m[k] - was.markers[i][k]), `${key} marker ${m.id} ${k}`).toBeLessThanOrEqual(TOLERANCE_PX);
  });
}

async function openMap(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
}

/** Flies to an album, then clicks or taps it for real (as explore.spec does), so the card opens and, on a phone,
 * the album settles above the sheet. */
async function pick(page: Page, isMobile: boolean, id: number): Promise<void> {
  await page.evaluate((i) => window.__rmr!.map!.flyTo(i), id);
  await waitForCameraIdle(page);
  const p = await pointOf(page, id);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).toBe(id);
  await expect(page.locator('.card')).toBeVisible();
  await waitForCameraIdle(page);
  await waitForAnimations(page);
}

/** An open album with its map showing: the split view on desktop, map mode on a phone. */
async function openAlbum(page: Page, isMobile: boolean): Promise<void> {
  await page.goto(IR);
  await waitForMap(page);
  if (isMobile) {
    await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
    // Map mode makes the map interactive, which starts the other two stops' gas: wait for it to settle again.
    await waitForMap(page);
  }
  await expect(page.locator('.mk')).toHaveCount(6);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
}

/** The highest album on screen, in client px. */
const highestAlbum = (page: Page) =>
  page.evaluate(async () => {
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    let top = Infinity;
    for (let id = 0; id < n; id++) top = Math.min(top, window.__rmr!.map!.screenPoint(id)!.y);
    return top;
  });

/** A focus that reaches the top edge: the highest album on screen as the seed, the albums closest to it on screen
 * (which the ring pushes around it) and the lowest album (so the framing is limited vertically). The mirror of
 * focus.spec's bottomEdgeFocus. */
async function topEdgeFocus(page: Page): Promise<{ seed: number; recs: number[] }> {
  return page.evaluate(() => {
    const api = window.__rmr!.map!;
    const pts: { id: number; x: number; y: number }[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      pts.push({ id, ...p });
    }
    const high = pts.reduce((a, b) => (b.y < a.y ? b : a));
    const low = pts.reduce((a, b) => (b.y > a.y ? b : a));
    const near = pts
      .filter((p) => p.id !== high.id && p.id !== low.id)
      .sort((a, b) => Math.hypot(a.x - high.x, a.y - high.y) - Math.hypot(b.x - high.x, b.y - high.y))
      .slice(0, 6)
      .map((p) => p.id);
    return { seed: high.id, recs: [...near, low.id] };
  });
}

test.describe('same place as before the map ran under the header', () => {
  test('the overview and the whole map', async ({ page, isMobile }, info) => {
    await openMap(page);
    await sameAsRecorded(page, info, 'overview');
    // The zoom-out floor is 0.8 of the fitted overview; the second press is a no-op.
    const zoomOut = page.getByRole('button', { name: COPY.map.zoomOut });
    for (let i = 0; i < 2; i++) {
      await act(zoomOut, isMobile);
      await waitForCameraIdle(page);
    }
    await sameAsRecorded(page, info, 'whole');
    // Reset comes back to the overview exactly.
    await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
    await waitForCameraIdle(page);
    await sameAsRecorded(page, info, 'overview');
  });

  test('a picked album', async ({ page, isMobile }, info) => {
    await openMap(page);
    await pick(page, isMobile, IN_RAINBOWS);
    await sameAsRecorded(page, info, 'pick');
  });

  test('an open album and its closest albums', async ({ page, isMobile }, info) => {
    await openAlbum(page, isMobile);
    await sameAsRecorded(page, info, 'album');
  });

  test('an album opened from the header search', async ({ page, isMobile }, info) => {
    test.skip(isMobile, 'the phone search sheet lands on the album list; its map is the "open album" state');
    await openMap(page);
    const field = page.locator('.top-search').getByRole('combobox');
    await field.click();
    await field.pressSequentially('loveless');
    await page.getByRole('option').first().click();
    await expect(page).toHaveURL(/\/album\/loveless/);
    await expect(page.locator('.mk')).toHaveCount(6);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await sameAsRecorded(page, info, 'search');
  });

  test('the deepest zoom', async ({ page }, info) => {
    await openMap(page);
    await page.evaluate((i) => window.__rmr!.map!.flyTo(i), IN_RAINBOWS);
    await waitForCameraIdle(page);
    // Far past the ceiling: the clamp decides where it stops, so this pins the ceiling's size on screen.
    await page.evaluate(() => window.__rmr!.map!.zoomBy(1000));
    await waitForCameraIdle(page);
    await sameAsRecorded(page, info, 'deepest');
  });
});

test('the nebula runs behind the header: the canvas starts at the top of the window, the stage does not', async ({ page, isMobile }) => {
  await openMap(page);
  const vp = page.viewportSize()!;
  const bottom = await headerBottom(page);
  // --hdr: 64 px, and 60 px under 900 px wide.
  expect(bottom).toBe(isMobile ? 60 : 64);
  const canvas = (await page.locator('canvas.map-canvas').boundingBox())!;
  expect(canvas.y).toBe(0);
  expect(canvas.height).toBe(vp.height);
  // The page layers and the map's controls still start at the header's bottom edge.
  expect((await page.locator('#stage').boundingBox())!.y).toBe(bottom);
  expect((await page.locator('.map-ui').boundingBox())!.y).toBe(bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('after every fit nothing is behind the header', async ({ page, isMobile }) => {
  await openMap(page);
  const bottom = await headerBottom(page);
  // Overview: every album is below the bar by the overview's top padding (55 px on desktop, 90 on a phone).
  expect(await highestAlbum(page)).toBeGreaterThanOrEqual(bottom + (isMobile ? 90 : 55) - 1);
  // The whole map (the zoom-out floor).
  const zoomOut = page.getByRole('button', { name: COPY.map.zoomOut });
  for (let i = 0; i < 2; i++) {
    await act(zoomOut, isMobile);
    await waitForCameraIdle(page);
  }
  expect(await highestAlbum(page)).toBeGreaterThanOrEqual(bottom);
  // A picked album: its 64 px cover and the frame 6 px outside it clear the bar.
  await pick(page, isMobile, IN_RAINBOWS);
  expect((await pointOf(page, IN_RAINBOWS)).y).toBeGreaterThanOrEqual(bottom + 38);
  // An open album: every cover marker and every rank badge.
  await openAlbum(page, isMobile);
  const tops = await page.locator('.mk, .mk-n').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops.length).toBe(11);
  for (const t of tops) expect(t).toBeGreaterThanOrEqual(bottom);
});

test('markers stay below the header, also after the visitor has moved the map', async ({ page }) => {
  await openMap(page);
  const bottom = await headerBottom(page);
  const focus = await topEdgeFocus(page);
  await page.evaluate(([s, r]) => window.__rmr!.getState().setFocus({ seed: s, recs: r }), [focus.seed, focus.recs] as const);
  await waitForCameraIdle(page);
  await expect(page.locator('.mk')).toHaveCount(focus.recs.length + 1);
  const tops = () => page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  // 8 px is the markers' edge (MarkerDriver MARKER_EDGE), less half a pixel of rounding.
  for (const t of await tops()) expect(t, 'framed').toBeGreaterThanOrEqual(bottom + 7.5);
  // Slide the albums up until the seed sits behind the bar; the layout bounds still keep every marker below it.
  const before = (await pointOf(page, focus.seed)).y;
  const shift = before - (bottom - 30);
  await page.evaluate((dy) => window.__rmr!.map!.panBy(0, dy), -shift);
  if ((await pointOf(page, focus.seed)).y > before) await page.evaluate((dy) => window.__rmr!.map!.panBy(0, dy), 2 * shift);
  expect((await pointOf(page, focus.seed)).y, 'the seed album is behind the bar').toBeLessThan(bottom - 20);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const t of await tops()) expect(t, 'after the camera moved').toBeGreaterThanOrEqual(bottom + 7.5);
});

test('the hover label never slides under the header', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer hover');
  await openMap(page);
  const bottom = await headerBottom(page);
  // One step in, so albums sit right under the bar; then the highest album the pointer can still reach.
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  const p = await page.evaluate(async (minY) => {
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    let best: { x: number; y: number } | null = null;
    for (let id = 0; id < n; id++) {
      const q = window.__rmr!.map!.screenPoint(id)!;
      if (q.y < minY + 4 || q.x < 60 || q.x > innerWidth - 320) continue;
      if (!document.elementFromPoint(q.x, q.y)?.classList.contains('map-canvas')) continue;
      if (!best || q.y < best.y) best = q;
    }
    return best;
  }, bottom);
  expect(p, 'an album just below the bar').not.toBeNull();
  expect(p!.y, 'close enough to the bar that the label cannot sit above it').toBeLessThan(bottom + 60);
  await page.mouse.move(p!.x, p!.y);
  const tip = page.locator('.map-tip');
  await expect(tip).toHaveCSS('opacity', '1');
  // 8 px is the label's edge (OverlayDriver TIP_EDGE), less half a pixel of rounding.
  expect((await tip.boundingBox())!.y).toBeGreaterThanOrEqual(bottom + 7.5);
});

test('the header takes the pointer over the map under it; a drag that starts on the map carries on under it', async ({ page, isMobile }) => {
  await openMap(page);
  const vp = page.viewportSize()!;
  const bottom = await headerBottom(page);
  // Every point of the bar belongs to the header, never to the canvas under it.
  const owners = await page.evaluate(
    ([w, y]) => {
      const out: boolean[] = [];
      for (let x = 4; x < w; x += 12) out.push(!!document.elementFromPoint(x, y)?.closest('header.top'));
      return out;
    },
    [vp.width, bottom / 2] as const,
  );
  expect(owners.every(Boolean)).toBe(true);
  if (isMobile) return;
  // Hover ends when the pointer moves from an album onto the bar.
  const p = await visibleAlbumPoint(page);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('.map-tip')).toHaveCSS('opacity', '1');
  await page.mouse.move(p.x, bottom / 2);
  await expect(page.locator('.map-tip')).toHaveCSS('opacity', '0');
  // A click on an empty part of the bar picks nothing and goes nowhere.
  const gap = await page.evaluate((y) => {
    for (let x = 8; x < innerWidth; x += 8) if (document.elementFromPoint(x, y)?.matches('header.top')) return x;
    return -1;
  }, bottom / 2);
  expect(gap, 'an empty spot on the bar').toBeGreaterThan(0);
  await page.mouse.click(gap, bottom / 2);
  expect(await page.evaluate(() => window.__rmr!.getState().selected)).toBeNull();
  await expect(page).toHaveURL('/map');
  // A drag that starts on the map keeps panning while the pointer is over the bar (the canvas holds the pointer).
  const y0 = (await pointOf(page, p.id)).y;
  const startY = bottom + 180;
  await page.mouse.move(vp.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2, bottom / 2, { steps: 10 });
  await page.waitForTimeout(150); // held before the release, so there is no fling (CameraRig FLING_MAX_IDLE_MS is 80)
  await page.mouse.up();
  await waitForCameraIdle(page);
  const y1 = (await pointOf(page, p.id)).y;
  expect(Math.abs(y1 - y0 + (startY - bottom / 2))).toBeLessThanOrEqual(4);
});

test('keyboard order is unchanged: skip link, header, then the map and its controls', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await openMap(page);
  const where: string[] = [];
  // Ten stops: the skip link, the header's four (wordmark, search, Map, About), the canvas, the slider, the names
  // button, zoom in, zoom out. The slider's three stop buttons are not tab stops.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    where.push(
      await page.evaluate(() => {
        const el = document.activeElement!;
        if (el.classList.contains('skip')) return 'skip';
        if (el.closest('header.top')) return 'header';
        if (el.classList.contains('map-canvas')) return 'canvas';
        return el.closest('#stage') ? 'stage' : 'other';
      }),
    );
  }
  // One skip link, then every header control, then only the stage: nothing of the header comes after the map.
  expect(where[0]).toBe('skip');
  const firstStage = where.findIndex((w) => w === 'stage' || w === 'canvas');
  expect(firstStage).toBeGreaterThan(1);
  expect(where.slice(1, firstStage).every((w) => w === 'header')).toBe(true);
  expect(where.slice(firstStage).every((w) => w === 'stage' || w === 'canvas')).toBe(true);
  expect(where).toContain('canvas');
  // The canvas's focus ring is drawn inside the visible map: 4 px below the bar, not under it.
  for (let i = 0; i < 10 && !(await page.evaluate(() => !!document.activeElement?.classList.contains('map-canvas'))); i++) await page.keyboard.press('Shift+Tab');
  await expect(page.locator('canvas.map-canvas')).toBeFocused();
  const ring = await page.locator('.map-host').evaluate((el) => {
    const cs = getComputedStyle(el, '::after');
    return { top: cs.top, style: cs.borderTopStyle, width: cs.borderTopWidth };
  });
  expect(ring).toEqual({ top: '68px', style: 'solid', width: '2px' });
});

test('glints never start under the header', async ({ page, isMobile }) => {
  await openMap(page);
  const bottom = await headerBottom(page);
  // One step in: the cloud is taller than the window, so there are stars under the bar, and they are still dots.
  await act(page.getByRole('button', { name: COPY.map.zoomIn }), isMobile);
  await waitForCameraIdle(page);
  const under = await page.evaluate(async (minY) => {
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    let k = 0;
    for (let id = 0; id < n; id++) if (window.__rmr!.map!.screenPoint(id)!.y < minY) k++;
    return k;
  }, bottom);
  expect(under, 'stars under the bar for a glint to choose').toBeGreaterThan(20);
  // Nine seconds of the map at rest: a glint starts about every 1.2 to 3 seconds.
  const centres = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        const layer = document.querySelector('.tw-layer')!;
        const note = () =>
          layer.querySelectorAll('.tw').forEach((g) => {
            const r = g.getBoundingClientRect();
            seen.push(r.top + r.height / 2);
          });
        const mo = new MutationObserver(note);
        mo.observe(layer, { childList: true });
        note();
        setTimeout(() => {
          mo.disconnect();
          resolve(seen);
        }, 9000);
      }),
  );
  expect(centres.length, 'glints seen in nine seconds').toBeGreaterThan(0);
  for (const y of centres) expect(y).toBeGreaterThanOrEqual(bottom);
});
```

- [ ] **Step 2: Record today's framing, then prove the record repeats**

On this commit the map still starts below the header. Record the five "same place" tests on both projects (one browser at a time), then run them again without the flag: they must pass against their own record, which shows that the positions repeat from run to run within the tolerance. Each command builds the site first.

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && FRAMING_RECORD=1 nice -n 10 npx playwright test e2e/framing.spec.ts --project=desktop --workers=1 -g "same place")
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && FRAMING_RECORD=1 nice -n 10 npx playwright test e2e/framing.spec.ts --project=phone --workers=1 -g "same place")
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node --input-type=module -e "import fs from 'node:fs'; console.log(Object.keys(JSON.parse(fs.readFileSync('e2e/fixtures/framing-baseline.json', 'utf8'))).sort().join(' '))")
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/framing.spec.ts --project=desktop --workers=1 -g "same place")
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/framing.spec.ts --project=phone --workers=1 -g "same place")
```

Expected: the recording runs pass (desktop 5 passed; phone 4 passed, 1 skipped). The third command prints eleven keys: `desktop/album desktop/deepest desktop/overview desktop/pick desktop/search desktop/whole phone/album phone/deepest phone/overview phone/pick phone/whole`. The two comparing runs pass with the same counts. If a comparing run fails here, the state it names does not settle to the same place twice on the untouched code: find out why with the superpowers:systematic-debugging skill (a wait that returns too early is the usual cause) and fix the wait in the spec; do not raise the tolerance. From now on `framing-baseline.json` is never recorded again.

Then see the red state of the other tests:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/framing.spec.ts --project=desktop --workers=1 -g "nebula runs behind|keyboard order")
```

Expected: FAIL. "the nebula runs behind the header" fails on `expect(canvas.y).toBe(0)` (received 64), and "keyboard order is unchanged" fails on the ring (`top: 'auto'`). The ten Tab stops of that test already pass: that is the order to keep.

- [ ] **Step 3: Write the failing unit tests**

Create `frontcreck/src/styles/stage.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT } from '@/components/map/state/mapStore';
import { HEADER_NARROW_PX, HEADER_PX } from '@/components/map/types';
import { NARROW_MEDIA_QUERY } from '@/lib/media';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector` in a stylesheet. */
function rule(sheet: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(sheet);
  if (!m) throw new Error(`no rule ${selector}`);
  return Object.fromEntries(
    m[1].split(';').map((d) => d.split(':')).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  );
}

describe('the map behind the header', () => {
  const shell = read('styles/shell.css');
  const map = read('styles/map.css');

  it('the two header heights in CSS and the two camera top insets are the same numbers, switched at one breakpoint', () => {
    const globals = read('app/globals.css');
    // The wide height is in the plain :root block; the narrow one is in the (max-width: 899px) block that sets it.
    const wide = /(?:^|\n):root \{[^}]*--hdr:\s*(\d+)px;/.exec(globals);
    const narrow = /@media \(max-width: 899px\) \{\s*:root \{[^}]*--hdr:\s*(\d+)px;/.exec(globals);
    expect(wide, '--hdr in :root').not.toBeNull();
    expect(narrow, '--hdr under 900 px').not.toBeNull();
    expect(Number(wide![1])).toBe(HEADER_PX);
    expect(Number(narrow![1])).toBe(HEADER_NARROW_PX);
    // No third height anywhere.
    expect([...globals.matchAll(/--hdr:\s*\d+px/g)]).toHaveLength(2);
    // MapStage picks the inset with useIsNarrow, whose media query is the CSS block's.
    expect(NARROW_MEDIA_QUERY).toBe('(max-width: 899px)');
    expect(read('components/map/MapStage.tsx')).toContain('insetTop: narrow ? HEADER_NARROW_PX : HEADER_PX,');
    expect(DEFAULT_INPUT.insetTop).toBe(HEADER_PX);
    expect(rule(shell, '.top').height).toBe('var(--hdr)');
  });

  it('the stage stays below the header and no longer clips; the map pane alone reaches up under it and clips itself', () => {
    const stage = rule(shell, '.stage');
    expect(stage.top).toBe('var(--hdr)');
    expect(stage.overflow).toBeUndefined();
    const pane = rule(map, '.map-pane');
    expect(pane.top).toBe('calc(-1 * var(--hdr))');
    expect(pane.overflow).toBe('hidden');
  });

  it('the map controls and its messages stay below the header', () => {
    expect(rule(map, '.map-ui').top).toBe('var(--hdr)');
    expect(rule(map, '.map-msg').top).toBe('calc(50% + var(--hdr) / 2)');
  });

  it('the header is above every layer of the stage, the names and the glints included', () => {
    expect(rule(shell, '.top')['z-index']).toBe('60');
    for (const f of ['styles/map.css', 'styles/album.css', 'styles/home.css', 'styles/phone.css']) {
      const over = [...read(f).matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1])).filter((z) => z >= 60);
      expect(over, f).toEqual([]);
    }
  });

  it('the names and the glints are told the same height', () => {
    // Part 2's layers read state/stageTop.ts; MusicMap sets it from the map input in the effect that applies the input.
    expect(read('components/map/MusicMap.tsx')).toContain('setStageTop(input.insetTop);');
  });

  it('the canvas focus ring is drawn on the host, inside the visible map, with a fallback where :has is missing', () => {
    expect(map).toContain('.map-host:has(.map-canvas:focus-visible)::after');
    expect(rule(map, '.map-host:has(.map-canvas:focus-visible)::after').inset).toBe('calc(var(--hdr) + 4px) 4px 4px');
    expect(map).toContain('@supports not selector(:has(a))');
  });
});
```

Replace `frontcreck/src/components/map/state/screen.test.ts` with:

```ts
import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyFrustum } from '../canvas/InitialFrame';
import { screenToWorld, worldToScreen } from './projection';
import { visibleScale } from './zoomLimits';

const rect = { left: 10, top: 20, width: 800, height: 500 };

function camera(insetPx: number, zoom: number, x: number, y: number, insetTopPx = 0): OrthographicCamera {
  const cam = new OrthographicCamera();
  cam.position.set(x, y, 5);
  cam.zoom = zoom;
  applyFrustum(cam, rect.width, rect.height, insetPx, insetTopPx);
  cam.updateMatrixWorld();
  return cam;
}

/** Where three.js itself draws a world point, in client pixels. */
function drawnAt(cam: OrthographicCamera, wx: number, wy: number): { x: number; y: number } {
  const v = new Vector3(wx, wy, 0).project(cam);
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

describe('screen and world conversions match three.js', () => {
  for (const [inset, zoom, top] of [[0, 1, 0], [0, 2.5, 0], [300, 1, 0], [300, 3.2, 0], [540, 0.8, 0], [0, 1, 64], [300, 3.2, 64], [0, 0.8, 120]] as const) {
    it(`agree with Vector3.project at inset ${inset} px, top inset ${top} px and zoom ${zoom}`, () => {
      const cam = camera(inset, zoom, 0.3, -0.2, top);
      for (const [wx, wy] of [[0.3, -0.2], [0.5, 0.1], [-0.4, 0.35]] as const) {
        const want = drawnAt(cam, wx, wy);
        const got = worldToScreen(wx, wy, rect, cam);
        expect(got.x).toBeCloseTo(want.x, 4);
        expect(got.y).toBeCloseTo(want.y, 4);
        const [bx, by] = screenToWorld(got.x, got.y, rect, cam);
        expect(bx).toBeCloseTo(wx, 6);
        expect(by).toBeCloseTo(wy, 6);
      }
    });
  }

  it('draws camera.position at the centre of the area right of the inset, at every zoom', () => {
    for (const zoom of [0.8, 1, 3.2]) {
      const p = drawnAt(camera(300, zoom, 1, 1), 1, 1);
      expect(p.x).toBeCloseTo(rect.left + 300 + (800 - 300) / 2, 4);
      expect(p.y).toBeCloseTo(rect.top + 250, 4);
    }
  });

  it('draws camera.position at the centre of the area below the header and right of the panel, at every zoom', () => {
    for (const zoom of [0.8, 1, 3.2]) {
      const p = drawnAt(camera(300, zoom, 1, 1, 64), 1, 1);
      expect(p.x).toBeCloseTo(rect.left + 300 + (800 - 300) / 2, 4);
      expect(p.y).toBeCloseTo(rect.top + 64 + (500 - 64) / 2, 4);
    }
  });

  it('keeps the world scale independent of the inset', () => {
    const a = camera(0, 2, 0, 0);
    const b = camera(300, 2, 0, 0);
    const span = (cam: OrthographicCamera) => drawnAt(cam, 0.2, 0).x - drawnAt(cam, 0, 0).x;
    expect(span(b)).toBeCloseTo(span(a), 6);
  });

  it('a canvas taller by the header, with that top inset, shows below the inset what the shorter canvas showed', () => {
    // Two desktop cases (64 px header) and the phone (390 x 784 today, a 60 px header).
    for (const [W, H, TOP, inset, zoom] of [[800, 436, 64, 0, 1], [800, 436, 64, 300, 2.2], [390, 784, 60, 0, 0.4]] as const) {
      // Before: the canvas starts under the header and nothing covers it.
      const old = new OrthographicCamera();
      old.position.set(0.3, -0.2, 5);
      old.zoom = zoom;
      applyFrustum(old, W, H, inset, 0);
      // After: the canvas starts at the top of the window. The same size on screen is the zoom times visibleScale.
      const now = new OrthographicCamera();
      now.position.set(0.3, -0.2, 5);
      now.zoom = zoom * visibleScale(H + TOP, TOP);
      applyFrustum(now, W, H + TOP, inset, TOP);
      for (const [wx, wy] of [[0.3, -0.2], [0.5, 0.1], [-0.4, 0.35]] as const) {
        const a = worldToScreen(wx, wy, { left: 0, top: TOP, width: W, height: H }, old);
        const b = worldToScreen(wx, wy, { left: 0, top: 0, width: W, height: H + TOP }, now);
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.y).toBeCloseTo(a.y, 6);
      }
    }
  });
});
```

What the rewritten file still proves: every assertion of the old file is in it unchanged (the five old cases of the loop, the centre right of the inset, the scale independent of the inset); three header cases join the loop and two tests are new.

`frontcreck/src/components/map/state/zoomLimits.test.ts`: add `visibleScale,` to the import from `"./zoomLimits"` (after `pxPerWorld,`) and append at the end of the file:

```ts

describe("visibleScale", () => {
  it("is the visible height over the canvas height, and 1 with nothing over the canvas", () => {
    expect(visibleScale(900, 0)).toBe(1);
    expect(visibleScale(900, 64)).toBeCloseTo(836 / 900, 12);
    expect(visibleScale(844, 60)).toBeCloseTo(784 / 844, 12);
    // A canvas that has not been measured yet: never zero or negative.
    expect(visibleScale(0, 64)).toBe(0.5);
  });

  it("keeps a zoom limit the same size on screen", () => {
    expect(pxPerWorld(MAX_ZOOM * visibleScale(900, 64), 900)).toBeCloseTo(pxPerWorld(MAX_ZOOM, 836), 8);
    expect(pxPerWorld(MAX_ZOOM * visibleScale(844, 60), 844)).toBeCloseTo(pxPerWorld(MAX_ZOOM, 784), 8);
  });
});
```

`frontcreck/src/components/map/state/bounds.test.ts`: L13, before: `import { FIT_ZOOM_MAX, FIT_ZOOM_MIN } from "./zoomLimits";` after: `import { FIT_ZOOM_MAX, FIT_ZOOM_MIN, pxPerWorld } from "./zoomLimits";`. In `describe("fitView", ...)` add `insetTop: 0, ` after `insetLeft: 0, ` (and after `insetLeft: 500, `) in each of the six `fitView(` calls, for example `fitView(cloud, { width: 1000, height: 1100, insetLeft: 0, insetTop: 0, padding: even })`. Then add these two tests at the end of that `describe`, after "clamps the zoom to the fit range":

```ts

  it("fits below a top inset exactly as on a canvas that starts under the header", () => {
    const cloud = { minX: -0.4, maxX: 0.7, minY: -0.5, maxY: 0.3 };
    const pad = { top: 55, right: 40, bottom: 115, left: 40 };
    const before = fitView(cloud, { width: 1440, height: 836, insetLeft: 0, insetTop: 0, padding: pad });
    const after = fitView(cloud, { width: 1440, height: 900, insetLeft: 0, insetTop: 64, padding: pad });
    // The same px per world unit (832.5) and the same camera centre: the camera is drawn at the centre of the
    // visible area in both.
    expect(pxPerWorld(before.zoom, 836)).toBeCloseTo(832.5, 8);
    expect(pxPerWorld(after.zoom, 900)).toBeCloseTo(832.5, 8);
    expect(after.center.x).toBeCloseTo(before.center.x, 10);
    expect(after.center.y).toBeCloseTo(before.center.y, 10);
    // The phone: a 390 x 784 canvas today, 390 x 844 with the 60 px header over it, the phone's overview padding.
    const phonePad = { top: 90, right: 40, bottom: 169, left: 40 };
    const phoneBefore = fitView(cloud, { width: 390, height: 784, insetLeft: 0, insetTop: 0, padding: phonePad });
    const phoneAfter = fitView(cloud, { width: 390, height: 844, insetLeft: 0, insetTop: 60, padding: phonePad });
    expect(pxPerWorld(phoneAfter.zoom, 844)).toBeCloseTo(pxPerWorld(phoneBefore.zoom, 784), 8);
    expect(phoneAfter.center.x).toBeCloseTo(phoneBefore.center.x, 10);
    expect(phoneAfter.center.y).toBeCloseTo(phoneBefore.center.y, 10);
  });

  it("keeps the fit clamp the same size on screen under a top inset", () => {
    const tiny = { minX: -0.001, maxX: 0.001, minY: -0.001, maxY: 0.001 };
    const before = fitView(tiny, { width: 400, height: 800, insetLeft: 0, insetTop: 0, padding: even }).zoom;
    const after = fitView(tiny, { width: 400, height: 864, insetLeft: 0, insetTop: 64, padding: even }).zoom;
    expect(before).toBe(FIT_ZOOM_MAX);
    expect(pxPerWorld(after, 864)).toBeCloseTo(pxPerWorld(before, 800), 8);
  });
```

`frontcreck/src/components/map/state/focusLayout.test.ts`, in `describe('focusCamera', ...)`: the three existing calls get `0` as the new sixth argument. L109, before: `focusCamera(ids, pos, W, H, inset, pad, noClamp)` after: `focusCamera(ids, pos, W, H, inset, 0, pad, noClamp)`. L128, before: `focusCamera(ids, pos, 390, 400, 0, small, noClamp)` after: `focusCamera(ids, pos, 390, 400, 0, 0, small, noClamp)`. L142, before: `focusCamera([0, 1], pos, W, H, 0, pad, () => 1.5)` after: `focusCamera([0, 1], pos, W, H, 0, 0, pad, () => 1.5)`. Then add this test after "passes the zoom through the clamp":

```ts

  it('frames below a top inset exactly as on a canvas that starts under the header', () => {
    const pos = new Float32Array([0, 0, 0.3, 0.1, -0.2, 0.25, 0.1, -0.3]);
    const ids = [0, 1, 2, 3];
    // The desktop header (64 px) and the phone's (60 px).
    for (const TOP of [64, 60]) {
      const before = focusCamera(ids, pos, W, H - TOP, 648, 0, pad, noClamp);
      const after = focusCamera(ids, pos, W, H, 648, TOP, pad, noClamp);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
      // The same px per world unit: zoom times canvas height.
      expect(after.zoom * H).toBeCloseTo(before.zoom * (H - TOP), 6);
    }
  });
```

- [ ] **Step 4: Run them and see them fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/styles/stage.test.ts src/components/map/state)`
Expected: FAIL. `stage.test.ts` does not load (`HEADER_PX` and `HEADER_NARROW_PX` are not exported), `screen.test.ts` and `zoomLimits.test.ts` fail on `visibleScale is not a function`, and the new `fitView` and `focusCamera` tests fail on their numbers (the top inset is ignored).

- [ ] **Step 5: The header's height as a map input (`types.ts`, `mapStore.ts`, `MapStage.tsx`)**

`frontcreck/src/components/map/types.ts`: after the two imports (L1-2) insert:

```ts

/** Height of the header in CSS px: `--hdr` in app/globals.css, 64 px on wide screens and 60 px under 900 px wide
 * (styles/stage.test.ts keeps both pairs equal). The map canvas runs under the header, so one of these is
 * `MapInput.insetTop` on every route; MapStage picks it with the same `(max-width: 899px)` flag as the CSS. */
export const HEADER_PX = 64;
export const HEADER_NARROW_PX = 60;
```

In `MapInput`, after the `insetLeft` field (L21-22) insert:

```ts
  /** CSS px of the canvas covered by the header along the top. `camera.position` is drawn at the centre of what is
   * below it (and right of `insetLeft`), and every fit, marker and label stays inside that area. */
  insetTop: number;
```

`frontcreck/src/components/map/state/mapStore.ts`: L3, before: `import type { MapCallbacks, MapInput } from '../types';` after: `import { HEADER_PX, type MapCallbacks, type MapInput } from '../types';`. In `DEFAULT_INPUT`, after `  insetLeft: 0,` insert `  insetTop: HEADER_PX,`.

`frontcreck/src/components/map/MapStage.tsx`: L22, before: `import type { MapApi, MapCallbacks, MapInput, MapPadding } from './types';` after: `import { HEADER_NARROW_PX, HEADER_PX, type MapApi, type MapCallbacks, type MapInput, type MapPadding } from './types';`. In the `input` memo, after the `insetLeft: view === 'album' && !narrow ? panelInset : 0,` line insert:

```ts
      // The canvas runs under the header on every route; the paddings below are inside what is left. The header is
      // 60 px under 900 px wide and 64 px above (--hdr), the breakpoint `narrow` already follows.
      insetTop: narrow ? HEADER_NARROW_PX : HEADER_PX,
```

`narrow` is already in the memo's dependency list (L202), so nothing else changes there. `DEFAULT_INPUT` keeps the wide value: it is only what the store holds before `MapStage` has handed over its first input, and the camera follows the real value as soon as it arrives (Step 7, `InitialFrame`).

The four padding constants (L36-42) keep their numbers: they are distances inside the visible area, which is the same area as before. Change only the comment on L35, before: `/** Album framing: clear of the slider panel (top-left on desktop, bottom on phones, where the bottom is measured). */` after: `/** Album framing, inside the visible map (below the header, right of the album panel): clear of the slider panel (top-left on desktop, bottom on phones, where the bottom is measured). */`

- [ ] **Step 6: The pure helpers (`projection.ts`, `zoomLimits.ts`, `view.ts`, `bounds.ts`, `focusLayout.ts`)**

`frontcreck/src/components/map/state/projection.ts`, replace L72-76 (`visibleArea` and its comment) with:

```ts
/** The part of the canvas that shows the map (right of the album panel inset, below the header's `insetTop`), less
 * `edge` CSS px on every side: the one area the hover label, the focus markers, the region names and the glints
 * are kept inside. */
export function visibleArea(insetLeft: number, width: number, height: number, edge: number, insetTop: number): ViewBounds {
  return { left: insetLeft + edge, top: insetTop + edge, right: width - edge, bottom: height - edge };
}
```

`frontcreck/src/components/map/state/zoomLimits.ts`, append at the end of the file:

```ts

/** Visible map height over canvas height. The zoom limits of this file (MIN_ZOOM, MAX_ZOOM, FIT_ZOOM_MIN,
 * FIT_ZOOM_MAX) were set for a canvas that is all visible; with the top `insetTopCssPx` of it under the header, a
 * limit times this is the same size on screen as it was. Sizes in px need no such factor: `pxPerWorld` takes the
 * canvas height, and that is still what the frustum spans. */
export function visibleScale(canvasHeightCssPx: number, insetTopCssPx: number): number {
  const h = Math.max(canvasHeightCssPx, 1);
  return Math.min(1, Math.max(0.5, (h - Math.max(insetTopCssPx, 0)) / h));
}
```

`frontcreck/src/components/map/state/view.ts`, append at the end of the file:

```ts

/** `visibleScale` of the current canvas (state/zoomLimits.ts), written by canvas/InitialFrame.tsx with the
 * frustum and read where no canvas size is at hand: CameraRig's `clampZoom` and CameraBounds. 1 until a canvas has
 * been measured. */
let visibleScaleNow = 1;

export function setVisibleScale(next: number): void {
  visibleScaleNow = next;
}

export function getVisibleScale(): number {
  return visibleScaleNow;
}
```

`frontcreck/src/components/map/state/bounds.ts`: L3, before: `import { FIT_ZOOM_MAX, FIT_ZOOM_MIN, pxPerWorld, zoomForPxPerWorld } from "./zoomLimits";` after: `import { FIT_ZOOM_MAX, FIT_ZOOM_MIN, pxPerWorld, visibleScale, zoomForPxPerWorld } from "./zoomLimits";`. Replace L73-106 (`FitArea`, the comment and `fitView`) with:

```ts
export interface FitArea {
  /** Canvas size in CSS px. */
  width: number;
  height: number;
  /** CSS px covered by the album panel on the left. */
  insetLeft: number;
  /** CSS px covered by the header along the top. */
  insetTop: number;
  /** CSS px kept clear around the cloud inside the visible area. */
  padding: MapPadding;
}

/**
 * The overview camera: the zoom at which the `cloud` box fits the visible
 * area (right of `insetLeft`, below `insetTop`) less `padding`, clamped to
 * the fit range, and the camera position that centres the box in the padded
 * area. camera.position is the centre of the visible area
 * (canvas/InitialFrame.tsx applyFrustum), so uneven padding shifts it and the
 * insets do not.
 */
export function fitView(cloud: Bounds, area: FitArea): { zoom: number; center: { x: number; y: number } } {
  const { width, height, insetLeft, insetTop, padding: pad } = area;
  // Guard against a degenerate (zero-size) cloud so a single-point dataset
  // never divides by zero; the clamp then caps it at FIT_ZOOM_MAX.
  const w = Math.max(cloud.maxX - cloud.minX, 1e-6);
  const h = Math.max(cloud.maxY - cloud.minY, 1e-6);
  const availW = Math.max(width - insetLeft - pad.left - pad.right, 40);
  const availH = Math.max(height - insetTop - pad.top - pad.bottom, 40);
  const scale = Math.min(availW / w, availH / h);
  // The fit range in the size it has on screen when nothing covers the canvas (zoomLimits visibleScale).
  const s = visibleScale(height, insetTop);
  const zoom = Math.max(FIT_ZOOM_MIN * s, Math.min(FIT_ZOOM_MAX * s, zoomForPxPerWorld(scale, height)));
  const wpp = 1 / pxPerWorld(zoom, height);
  const c = cloudCenter(cloud);
  return {
    zoom,
    center: { x: c.x - ((pad.left - pad.right) / 2) * wpp, y: c.y + ((pad.top - pad.bottom) / 2) * wpp },
  };
}
```

`frontcreck/src/components/map/state/focusLayout.ts`, in `focusCamera` (L200-246): add the parameter after `insetPx: number,`:

```ts
  insetTopPx: number,
```

and change the one line that computes the height it may use, before: `  const availH = Math.max(height - pad.top - pad.bottom, 80);` after: `  const availH = Math.max(height - insetTopPx - pad.top - pad.bottom, 80);`. At the end of the comment above the function, before the closing `*/`, add the sentence: ``insetTopPx` is the header over the top of the canvas: the fit stays below it.`` Nothing else in the function changes: `zoom` and `kz` use the canvas `height`, which is what the frustum spans, and the centre is relative to the visible area's centre.

- [ ] **Step 7: The camera and the overlay drivers**

`frontcreck/src/components/map/canvas/InitialFrame.tsx`. L10-11, before:

```ts
import { setFramed, setOverviewFraming } from "../state/view";
import { FRUSTUM_HALF_HEIGHT } from "../state/zoomLimits";
```

after:

```ts
import { setFramed, setOverviewFraming, setVisibleScale } from "../state/view";
import { FRUSTUM_HALF_HEIGHT, visibleScale } from "../state/zoomLimits";
```

Replace `applyFrustum` and its comment (L19-35) with:

```ts
/**
 * Symmetric frustum for a `width` x `height` CSS px canvas, with the drawing shifted so `camera.position`
 * lands at the centre of the visible map: right of `insetPx` (the album panel) and below `insetTopPx` (the
 * header, which the canvas runs under). state/projection.ts mirrors this.
 */
export function applyFrustum(camera: THREE.OrthographicCamera, width: number, height: number, insetPx: number, insetTopPx: number): void {
  const halfW = FRUSTUM_HALF_HEIGHT * (width / height);
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = FRUSTUM_HALF_HEIGHT;
  camera.bottom = -FRUSTUM_HALF_HEIGHT;
  const inset = Math.min(Math.max(insetPx, 0), width * 0.9);
  const top = Math.min(Math.max(insetTopPx, 0), height * 0.5);
  // Draw the canvas shifted left by half the inset and down by half the top inset (CSS px of the full canvas).
  // three scales a view offset by 1 / zoom itself, so camera.position stays at the centre of the visible area at
  // every zoom.
  if (inset > 0 || top > 0) camera.setViewOffset(width, height, -inset / 2, -top / 2, width, height);
  else if (camera.view) camera.view.enabled = false;
  camera.updateProjectionMatrix();
}
```

In `recomputeFraming`, the `fitView` call (L91-96), before:

```ts
    const { zoom, center } = fitView(bounds, {
      width,
      height,
      insetLeft: useMapStore.getState().insetCurrent,
      padding: input.fitPadding,
    });
```

after:

```ts
    const { zoom, center } = fitView(bounds, {
      width,
      height,
      insetLeft: useMapStore.getState().insetCurrent,
      insetTop: input.insetTop,
      padding: input.fitPadding,
    });
```

The header's height is one of two numbers and changes when the window crosses 900 px, so `InitialFrame` follows it like it follows the canvas size. After `const sliderT = useMapStore((s) => s.sliderT);` (L68) insert:

```ts
  // The header's height over the canvas (64 px, or 60 px under 900 px wide): followed like the canvas size.
  const insetTop = useMapStore((s) => s.input.insetTop);
```

L70, before: `  const lastSize = useRef<{ width: number; height: number } | null>(null);` after: `  const lastSize = useRef<{ width: number; height: number; insetTop: number } | null>(null);`

The synchronous layout effect (L121-132), before:

```ts
  useLayoutEffect(() => {
    if (width > 0 && height > 0) {
      applyFrustum(camera, width, height, useMapStore.getState().insetCurrent);
    }
    const sizeChanged =
      lastSize.current !== null &&
      (lastSize.current.width !== width || lastSize.current.height !== height);
    lastSize.current = { width, height };

    recomputeFraming(sizeChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height, camera, invalidate]);
```

after:

```ts
  useLayoutEffect(() => {
    if (width > 0 && height > 0) {
      applyFrustum(camera, width, height, useMapStore.getState().insetCurrent, insetTop);
      // Before the fit below and before any clampZoom: the zoom limits in this canvas's own scale.
      setVisibleScale(visibleScale(height, insetTop));
    }
    // A new header height (the window crossed 900 px) counts as a new size: the overview is fitted again.
    const sizeChanged =
      lastSize.current !== null &&
      (lastSize.current.width !== width || lastSize.current.height !== height || lastSize.current.insetTop !== insetTop);
    lastSize.current = { width, height, insetTop };

    recomputeFraming(sizeChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height, insetTop, camera, invalidate]);
```

(The comment lines above the effect, L117-120, stay. `recomputeFraming` reads `input.insetTop` from the store, which is the value the selector just delivered.)

`frontcreck/src/components/map/canvas/CameraTween.tsx`. In `flyTarget` (L67-85), before:

```ts
      const pad = useMapStore.getState().input.framePadding;
      const top = pad.top;
      const bottom = height - pad.bottom;
      let y = p[2 * id + 1];
      if (isNarrow() && bottom > top && (height / 2 < top || height / 2 > bottom)) {
        const wpp = (camera.top - camera.bottom) / (height * zoom);
        y -= (height / 2 - (top + bottom) / 2) * wpp;
      }
```

after:

```ts
      const { framePadding: pad, insetTop } = useMapStore.getState().input;
      // In px of the visible map (below the header): camera.position is drawn at its centre, visible / 2.
      const visible = height - insetTop;
      const top = pad.top;
      const bottom = visible - pad.bottom;
      let y = p[2 * id + 1];
      if (isNarrow() && bottom > top && (visible / 2 < top || visible / 2 > bottom)) {
        const wpp = (camera.top - camera.bottom) / (height * zoom);
        y -= (visible / 2 - (top + bottom) / 2) * wpp;
      }
```

(`wpp` keeps the canvas `height`: world units per px are a property of the whole frustum.)

In `focusTarget` (L91), before: `      return focusCamera([input.focus.seed, ...input.focus.recs], target, width, height, input.insetLeft, input.framePadding, clampZoom);` after: `      return focusCamera([input.focus.seed, ...input.focus.recs], target, width, height, input.insetLeft, input.insetTop, input.framePadding, clampZoom);`

In the frame callback, both calls (L153 and L165), before: `      applyFrustum(camera, width, height, ins.current);` after: `      applyFrustum(camera, width, height, ins.current, input.insetTop);`

`frontcreck/src/components/map/canvas/CameraRig.tsx`. L10, before: `import { getOverviewFraming } from "../state/view";` after: `import { getOverviewFraming, getVisibleScale } from "../state/view";`. `clampZoom` (L44-46), before:

```ts
export function clampZoom(z: number): number {
  return Math.max(getMinZoom(), Math.min(MAX_ZOOM, z));
}
```

after:

```ts
/** The ceiling is MAX_ZOOM in the size it has on screen when nothing covers the canvas (zoomLimits visibleScale):
 * with the canvas running under the header, the deepest zoom shows albums exactly as far apart as before. */
export function clampZoom(z: number): number {
  return Math.max(getMinZoom(), Math.min(MAX_ZOOM * getVisibleScale(), z));
}
```

(The floor needs nothing: it is 0.8 of the fitted overview, which is already in this canvas's scale.)

`frontcreck/src/components/map/canvas/CameraBounds.tsx`. L9, before: `import { getOverviewFraming, isFramed } from "../state/view";` after: `import { getOverviewFraming, getVisibleScale, isFramed } from "../state/view";`. L101-102, before:

```ts
    const cam = state.camera as THREE.OrthographicCamera;
    const viewport = viewportWorldRect(cam);
```

after:

```ts
    const cam = state.camera as THREE.OrthographicCamera;
    const full = viewportWorldRect(cam);
    // Only what is below the header counts as in view; cam.position is the centre of that area.
    const viewport = { halfW: full.halfW, halfH: full.halfH * getVisibleScale() };
```

(With this the idle nudge sees the same world rectangle as today: the frustum is taller by the header and the zoom smaller by `visibleScale`, and the two cancel.)

`frontcreck/src/components/map/canvas/OverlayDriver.tsx` L42-43, before:

```ts
        if (ly < 8) ly = p.y + 18;
        const area = visibleArea(input.insetLeft, width, height, TIP_EDGE);
```

after:

```ts
        if (ly < input.insetTop + 8) ly = p.y + 18;
        const area = visibleArea(input.insetLeft, width, height, TIP_EDGE, input.insetTop);
```

`frontcreck/src/components/map/canvas/MarkerDriver.tsx`: L47, before: `    const area = visibleArea(inset, width, height, MARKER_EDGE);` after: `    const area = visibleArea(inset, width, height, MARKER_EDGE, input.insetTop);`. L96, before: `      const area = visibleArea(inset, width, height, TIP_EDGE);` after: `      const area = visibleArea(inset, width, height, TIP_EDGE, input.insetTop);`

- [ ] **Step 8: Tell part 2's two layers where the visible map starts**

Part 2 built its names and glints for this: everything it places from the top of the map reads `getStageTop()` (`state/stageTop.ts`), which is 0 until this task sets it. Its names driver passes it to `chromeBlockers` as `top` and uses it as the top of the area a name may sit in; its twinkle driver starts glints only below `getStageTop() + TWINKLE_EDGE_PX`, as the prototype does (`docs/design/trifid-theme/prototype/src/twinkle.js` L71: `t = v.hdr + 6`). So one call is enough, made from the same place and the same number as the camera's.

`frontcreck/src/components/map/MusicMap.tsx`: add the import `import { setStageTop } from './state/stageTop';` beside the other `./state/` imports, and in the layout effect that applies the input, before:

```tsx
  useLayoutEffect(() => {
    useMapStore.getState().setInput(input);
  }, [input]);
```

after:

```tsx
  useLayoutEffect(() => {
    useMapStore.getState().setInput(input);
    // Part 2's names and glints read the header's height from state/stageTop.ts: the same number as the camera's.
    setStageTop(input.insetTop);
  }, [input]);
```

The names driver has the one `visibleArea` call outside this task's own files. In part 2's plan it reads:

```ts
      const visible = visibleArea(inset, width, height, 0);
      visible.top = top;
```

where `top` is `getStageTop()`. Make it:

```ts
      const visible = visibleArea(inset, width, height, 0, top);
```

(The typecheck stops on the old call, so it cannot be missed.) Nothing else of part 2 is edited: `chromeBlockers`, `pickStar`, their unit tests and `stageTop.test.ts` stay as they are, and part 2's browser check that no name sits on the header (`names.spec.ts`) now has a header with the map behind it to check against. If part 2's code has no `state/stageTop.ts` after all, stop and report it: the names and glints would then need the header's height passed in by hand, which is a change to part 2's interfaces, not something to improvise here.

- [ ] **Step 9: CSS: the pane reaches up, the controls stay down**

`frontcreck/src/styles/shell.css`, the stage (L66-68 today), before:

```css
/* stage: everything below the header; the map lives here for the whole session */
main#main { display: block; }
.stage { position: fixed; left: 0; right: 0; top: var(--hdr); bottom: 0; overflow: hidden; }
```

after:

```css
/* stage: everything below the header; the map lives here for the whole session. The map pane alone reaches up
   under the header (styles/map.css) and clips itself, so the stage no longer clips. */
main#main { display: block; }
.stage { position: fixed; left: 0; right: 0; top: var(--hdr); bottom: 0; }
```

`frontcreck/src/styles/map.css` L1, before: `.map-pane { position: absolute; inset: 0; background: var(--color-pane); transition: opacity var(--dur) var(--out); }` after:

```css
/* The pane, and the canvas in it, start at the top of the window: the nebula runs behind the glass header
 * (shell.css .top, z-index 60, above the whole stage). What must stay below the header is offset by --hdr: .map-ui
 * and .map-msg here, and in the camera MapInput.insetTop (components/map/types.ts: HEADER_PX 64 and, under 900 px
 * wide, HEADER_NARROW_PX 60, the two values of --hdr). */
.map-pane { position: absolute; left: 0; right: 0; top: calc(-1 * var(--hdr)); bottom: 0; overflow: hidden; background: var(--color-pane); transition: opacity var(--dur) var(--out); }
```

L8, before: `.map-canvas:focus-visible { outline: 2px solid var(--color-lamp); outline-offset: -4px; }` after:

```css
/* The canvas runs under the header, so its focus ring is drawn on the host instead, 4 px inside the visible map
 * (the same place as the old outline), with the dark casing of the selected ring so it reads on bright gas. */
.map-canvas:focus-visible { outline: none; }
.map-host:has(.map-canvas:focus-visible)::after { content: ""; position: absolute; inset: calc(var(--hdr) + 4px) 4px 4px; border: 2px solid var(--color-lamp); box-shadow: 0 0 0 1px rgba(4, 4, 8, .8), inset 0 0 0 1px rgba(4, 4, 8, .8); pointer-events: none; }
@supports not selector(:has(a)) { .map-canvas:focus-visible { outline: 2px solid var(--color-lamp); outline-offset: -4px; } }
```

L19, before: `.map-ui { position: absolute; inset: 0; z-index: 6; pointer-events: none; transition: left var(--dur) var(--out); }` after: `.map-ui { position: absolute; left: 0; right: 0; top: var(--hdr); bottom: 0; z-index: 6; pointer-events: none; transition: left var(--dur) var(--out); }` (`MapStage` still sets its `left` inline.)

L31 (`.map-msg`), before: `top: 50%;` after: `top: calc(50% + var(--hdr) / 2);` (the rest of the line unchanged: the message stays in the middle of the visible map).

Nothing else is offset: `.map-host`, `.veil`, `.map-tip`, `.map-sel`, `.mk-layer`, and part 2's `.rn-layer` and `.tw-layer` fill the pane and work in canvas pixels; `.album`, `.home`, `.about-page`, `.notfound`, `.page-msg`, `.fab-map` and `.strip` are children of the stage and have not moved. The header needs no edit: it is glass from Tasks 1 and 2, clear on Home, solid on phones.

- [ ] **Step 10: Tighten the one browser check the change would have weakened, and measure the header**

`frontcreck/e2e/focus.spec.ts`, in "focus draws numbered covers joined to the seed, framed on screen" (L54-60), before:

```ts
  const vp = page.viewportSize()!;
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(vp.width);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(vp.height);
  }
```

after:

```ts
  const vp = page.viewportSize()!;
  // The map runs under the header now, so "on screen" means below the header's bottom edge, not below y = 0.
  const headerBottom = await page.locator('header.top').evaluate((el) => el.getBoundingClientRect().bottom);
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(vp.width);
    expect(box.top).toBeGreaterThanOrEqual(headerBottom);
    expect(box.bottom).toBeLessThanOrEqual(vp.height);
  }
```

What it still proves: every marker is inside the window, and now also that none is behind the bar. The old bound (`0`) was the top of the window, which the canvas did not reach; left as it was, a marker under the header would pass it.

`frontcreck/e2e/glass.spec.ts`: add `twinkleOff` (part 2's helper: it switches the glints off, so no bloom drifts into a screenshot that is being measured) to the names imported from `./helpers`. In Task 2's test "text on the panels keeps 4.5:1 over the map, with the weakest accent" add the line `  await twinkleOff(page);` after each of its two `await waitForAnimations(page);` lines: that test was written before the glints existed, and a glint can play beside an open album and under the hint line. It still measures the same text against the same map. Then append at the end of the file:

```ts

/** The albums standing on the brightest gas of the Balanced stop, brightest first (theme.json: stars.bg holds three
 * bytes per album, and Balanced is the second). */
const brightestAlbums = (page: Page, count: number): Promise<number[]> =>
  page.evaluate(async (k) => {
    const theme = await (await fetch('/data/theme/theme.json')).json();
    const ids = Array.from({ length: theme.n }, (_, i) => i);
    return ids.sort((a, b) => theme.stars.bg[3 * b + 1] - theme.stars.bg[3 * a + 1]).slice(0, k);
  }, count);

test('header text keeps 4.5:1 with the brightest gas behind the bar', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await twinkleOff(page);
  const [brightest] = await brightestAlbums(page, 1);
  const at = async () => (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), brightest))!;
  const selectors = isMobile
    ? ['.wordmark', '.top nav .navbtn', '.search-toggle']
    : ['.wordmark', '.top nav .navbtn[aria-current="page"]', '.top nav .navbtn:not([aria-current])'];
  // A zero pan every 150 ms counts as the visitor's hand on the map, which keeps the idle recentring away while a
  // screenshot is taken with most of the cloud off screen.
  await page.evaluate(() => {
    (window as unknown as { __hold: number }).__hold = window.setInterval(() => window.__rmr!.map!.panBy(0, 0), 150);
  });
  const results: Array<{ selector: string; ratio: number }> = [];
  for (const selector of selectors) {
    const target = await page.locator(selector).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    // Slide the brightest album behind this item. panBy's direction is checked, not assumed: a second try mirrors it.
    for (const sign of [1, -1]) {
      const p = await at();
      if (Math.hypot(p.x - target.x, p.y - target.y) < 2) break;
      await page.evaluate(([dx, dy]) => window.__rmr!.map!.panBy(dx, dy), [sign * (p.x - target.x), sign * (target.y - p.y)] as const);
    }
    const p = await at();
    expect(Math.hypot(p.x - target.x, p.y - target.y), `the brightest album is behind ${selector}`).toBeLessThan(2);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    results.push(...(await contrastOverBackdrop(page, 'header.top', [selector])));
  }
  await page.evaluate(() => window.clearInterval((window as unknown as { __hold: number }).__hold));
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});
```

The header's search field is opaque (`--color-room-2`), so its text is not over the map and is covered by Task 1's opaque-surface test.

- [ ] **Step 11: Unit tests, typecheck, lint**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test && npm run typecheck && npm run lint)`
Expected: all pass. The typecheck is the caller check: it fails on any call of `applyFrustum`, `fitView`, `focusCamera` or `visibleArea` that does not pass the top inset, and on any `MapInput` built without `insetTop`. Then `grep -rn "visibleArea(\|applyFrustum(\|focusCamera(\|fitView(" frontcreck/src | grep -v "\.test\."` must show every call with the new argument: 1 `fitView` and 1 `applyFrustum` in `InitialFrame.tsx`, 2 `applyFrustum` and 1 `focusCamera` in `CameraTween.tsx`, 1 `visibleArea` in `OverlayDriver.tsx`, 2 in `MarkerDriver.tsx`, and 1 in part 2's names driver, next to the four definitions.

- [ ] **Step 12: The browser checks, one at a time**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/framing.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/framing.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/focus.spec.ts e2e/glass.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/focus.spec.ts e2e/glass.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/map.spec.ts e2e/explore.spec.ts e2e/album.spec.ts e2e/pages.spec.ts e2e/a11y.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/map.spec.ts e2e/explore.spec.ts e2e/album.spec.ts e2e/phone.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/nowebgl.spec.ts --project=nowebgl --workers=1)
```

Expected: `framing.spec.ts` desktop 12 passed; phone 9 passed, 3 skipped (the search state, the hover label and the keyboard order; the pointer test runs its first check on a phone and stops there). Everything else passes, except the picked cover test of `e2e/explore.spec.ts`, which is still red from part 1 until Task 7 rewrites it. `glass.spec.ts` desktop now has 5 tests (7 after Task 4).

If something fails, in this order:

1. A "same place" test: the framing moved. The message names the state and the album. Do not record again and do not raise `TOLERANCE_PX`. An offset of 32 px in y (30 px on the phone) means a centre is still the canvas centre (a caller still using `height / 2`); a phone that is off by 2 px or by 64/60 means the phone got the wide header's inset (`narrow ? HEADER_NARROW_PX : HEADER_PX` in `MapStage`, or `InitialFrame` not following `input.insetTop`); a scale error of 836/900 or 784/844 means a zoom limit or a fit still uses the canvas height where the visible height belongs, or the other way round. Fix the code.
2. "after every fit nothing is behind the header" or "markers stay below the header": a fit or a bound is missing `insetTop`. Fix the code.
3. "the hover label never slides under the header" on its premise (no album close under the bar): before looking for the album, pan the map down in the test in 40 px steps (`panBy(0, 40)`, checking the direction as the marker test does) until one is in that band, and say so in the commit. Do not widen the 60 px.
4. "glints never start under the header" on its premise (`stars under the bar`): press zoom in twice in the test instead of once and say so in the commit; on its last line: `setStageTop` is not being called with the header's height (Step 8), or part 2's twinkle driver does not read `getStageTop()`.
5. "header text keeps 4.5:1": raise `--top-bg`'s alpha in `globals.css` by .04, update the pinned values in `contrast.test.ts` ("reads the tokens", "models a glass panel"), rerun, and record the final number in the PR body. Do not lower the threshold or drop a selector.

- [ ] **Step 13: Look at it**

Open `frontcreck/test-results/shots/desktop-explore.png` (written by `e2e/map.spec.ts`) beside `docs/design/trifid-theme/options/q-header-under.jpg` and `final-overview.jpg`: the gas must run up behind the bar, blurred and dimmed, with no hard line where the map used to start; the wordmark, the search field and the two links must read as before. Open `desktop-home.png`: the clear header on Home shows the dimmed nebula through it with no seam at 64 px. The full comparison is Task 10.

- [ ] **Step 14: Commit**

```bash
git add frontcreck/e2e/framing.spec.ts frontcreck/e2e/fixtures/framing-baseline.json frontcreck/e2e/focus.spec.ts frontcreck/e2e/glass.spec.ts frontcreck/src/styles frontcreck/src/components/map
git commit -m "feat(theme): the map runs behind the glass header, with every framing held where it was

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 4: A dark casing for the selected ring and for the focus rings on the map

In Explore, while albums are dots, the picked album is marked by a DOM ring (`.map-sel`, positioned by `OverlayDriver`). With Task 1's tokens the ring is off-white, and off-white on the brightest gas cannot be seen: 1.02:1 on the cream gas, 1.18:1 on white. Part 2 left this open on purpose. The ring gets a dark casing, the same idea as part 2's white lines on a dark casing.

**Files:**
- Modify: `frontcreck/src/styles/map.css` L17-18, and one rule added after L20
- Modify: `frontcreck/src/components/map/MusicMap.tsx` L11 (comment; L13 after part 2 adds its two imports)
- Modify: `frontcreck/src/lib/contrast.test.ts` (one `describe` with two tests appended)
- Modify: `frontcreck/e2e/glass.spec.ts` (two tests appended; `tabTo` and `COPY` imported)

**Interfaces:**
- Consumes: Task 1's `--color-lamp` (`#f1ece4`) and the helpers already in `contrast.test.ts` (`rule`, `css`, `tok`, `surfaceOver`, `rgbToHex`, `WHITE`, `CREAM`); `brightestAlbums` in `e2e/glass.spec.ts` and the `twinkleOff` import there (Task 3).
- Produces: no interface. `OverlayDriver` is not edited: a `box-shadow` does not change the ring's box, so its size and position code stay as they are.
- No shader edit. Once covers show, the shader draws the pick large with an off-white frame instead of this ring (part 2). By then the gas has stepped back to 0.3 of its strength or less (part 1: 0.3 at 32 px covers, the size at which the frame first appears), so if `GAS_LUM_MAX = 0.6` is a relative luminance the brightest gas behind the frame is 0.18 and the frame holds 3.88:1 against it ((0.8429 + 0.05) / (0.18 + 0.05)). That rests on part 1's numbers and is not measured here; the picked cover test of Task 7 reads the frame's pixels, and the states reviewer of Task 10 looks at a pick on the brightest gas.

Computed with `node` (WCAG 2 formula), casing `rgba(4, 4, 8, .8)` painted over the backdrop:

| Backdrop | Casing colour | Ring on its casing | Casing on the backdrop | Ring on the backdrop, no casing |
|---|---|---|---|---|
| White | `#363639` | 10.24 | 12.04 | 1.18 |
| Cream gas `rgb(244, 238, 222)` | `#343333` | 10.71 | 10.87 | 1.02 |
| Empty sky `#07060a` | `#050408` | 17.38 | 1.01 | 17.18 |

On bright gas the ring reads against its casing and the casing against the gas; on the empty sky the ring carries itself. The requirement is 3:1 for a mark that is not text.

**The keyboard focus ring of the controls on the map has the same problem.** The site's one focus ring is `:focus-visible { outline: 2px solid var(--color-lamp); outline-offset: 3px; }` (`shell.css` L15): a 2 px off-white line that starts 3 px outside the control. For a control inside a panel that line lies on the panel. For a control that stands on the map by itself it lies on raw gas: the zoom buttons and the names button, "Explore this area", and the phone's List button in map mode (`.fab-map--on`, top right over the map). There it would be the same 1.02:1 as the bare ring. Those rings get the same casing, by one rule: a dark band from the control's edge to 7 px out, which is the 3 px gap, the 2 px ring (drawn over it; an outline paints above a box shadow) and 2 px beyond. The numbers are the table's first two rows: the ring 10.24:1 against its casing over white and 10.71:1 over the cream gas, the casing 12.04:1 against white and 10.87:1 against cream. The rule covers every focusable control in `.map-ui` except the slider's range input (it has no outline; its thumb carries its own ring, Task 2), so the card's buttons and the slider's stop names get the band too, on their panel, where it is nearly invisible and harmless. The canvas's own focus ring is cased in Task 3.

- [ ] **Step 1: Write the failing unit test**

Append at the end of `frontcreck/src/lib/contrast.test.ts`:

```ts

describe('marks on the map', () => {
  it('the selected ring is the lamp token on a dark casing that holds 3:1 on the brightest backdrops', () => {
    const sel = rule(css('styles/map.css'), '.map-sel');
    expect(sel.border).toBe('2px solid var(--color-lamp)');
    // 2 px of casing outside the ring and 1 px inside it, one colour.
    const casing = /^0 0 0 2px rgba\(4, 4, 8, ([\d.]+)\), inset 0 0 0 1px rgba\(4, 4, 8, \1\)$/.exec(sel['box-shadow'] ?? '');
    expect(casing, sel['box-shadow']).not.toBeNull();
    const tint: Tint = { rgb: [4, 4, 8], alpha: Number(casing![1]) };
    for (const [name, backdrop] of [['white', WHITE], ['cream gas', CREAM]] as const) {
      const dark = surfaceOver(backdrop, null, tint);
      expect(contrastRatio(tok('lamp'), dark), `the ring on its casing over ${name} (${dark})`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(dark, rgbToHex(backdrop)), `the casing against ${name}`).toBeGreaterThanOrEqual(3);
    }
    // Without the casing the ring cannot be seen on bright gas: this is what the casing is for.
    expect(contrastRatio(tok('lamp'), rgbToHex(CREAM))).toBeLessThan(1.5);
    // On the empty sky the ring carries itself.
    expect(contrastRatio(tok('lamp'), tok('pane'))).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring of the controls that stand on the map has the same dark casing, out past the ring', () => {
    // The site's one focus ring: a 2 px lamp outline that starts 3 px outside the control.
    const ring = rule(css('styles/shell.css'), ':focus-visible');
    expect(ring.outline).toBe('2px solid var(--color-lamp)');
    expect(ring['outline-offset']).toBe('3px');
    const cased = rule(css('styles/map.css'), '.map-ui :focus-visible:not(input), .fab-map--on:focus-visible');
    // One band from the control's edge to 7 px out: the 3 px gap, the 2 px ring and 2 px beyond it.
    const casing = /^0 0 0 7px rgba\(4, 4, 8, ([\d.]+)\)$/.exec(cased['box-shadow'] ?? '');
    expect(casing, cased['box-shadow']).not.toBeNull();
    const tint: Tint = { rgb: [4, 4, 8], alpha: Number(casing![1]) };
    for (const [name, backdrop] of [['white', WHITE], ['cream gas', CREAM]] as const) {
      const dark = surfaceOver(backdrop, null, tint);
      expect(contrastRatio(tok('lamp'), dark), `the focus ring on its casing over ${name} (${dark})`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(dark, rgbToHex(backdrop)), `the casing against ${name}`).toBeGreaterThanOrEqual(3);
    }
  });
});
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/contrast.test.ts)`
Expected: FAIL. The first new test fails on "expected null not to be null" (`.map-sel` has no `box-shadow`), the second on `no rule .map-ui :focus-visible:not(input), .fab-map--on:focus-visible`. The other 14 tests pass.

- [ ] **Step 2: Add the casing in `frontcreck/src/styles/map.css`**

L17-18, before:

```css
.map-sel { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; opacity: 0; border: 2px solid var(--color-lamp); border-radius: 50%; }
.map-sel::after { content: ""; position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; border-radius: 50%; background: var(--color-lamp); }
```

after:

```css
/* The ring of the picked album while albums are dots: off-white on a dark casing (2 px outside, 1 px inside, 1 px
 * round the centre dot), so it reads on the brightest gas as well as on the empty sky. 10.2:1 against its casing
 * over a white backdrop, 10.7:1 over the cream gas (contrast.test.ts). The shadows do not change its box. */
.map-sel { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; opacity: 0; border: 2px solid var(--color-lamp); border-radius: 50%; box-shadow: 0 0 0 2px rgba(4, 4, 8, .8), inset 0 0 0 1px rgba(4, 4, 8, .8); }
.map-sel::after { content: ""; position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; border-radius: 50%; background: var(--color-lamp); box-shadow: 0 0 0 1px rgba(4, 4, 8, .8); }
```

After L20 (`.map-ui > * { pointer-events: auto; }`) insert:

```css
/* Keyboard focus on a control that stands on the map: the site's ring (shell.css :focus-visible, 2 px lamp, 3 px out)
 * would lie on raw gas, so it gets the selected ring's dark casing: one band from the control's edge to 7 px out,
 * under the gap, the ring and 2 px beyond. Not the slider's range input, whose thumb has its own ring. z-index lifts
 * a focused button of the zoom stack (grid items take z-index without being positioned), so the next button does not
 * cut its band. No `position` here: it would override the absolute position of the buttons that have one. */
.map-ui :focus-visible:not(input), .fab-map--on:focus-visible { box-shadow: 0 0 0 7px rgba(4, 4, 8, .8); z-index: 1; }
```

It replaces the soft drop shadow of "Explore this area" while that button has keyboard focus, and nothing else: a box shadow and a z-index change no size and no position, and the rule sets no `position` on purpose (its selector is more specific than `.map-explore`, `.card .x` and `.fab-map`, so a `position` here would undo theirs). The browser test of Step 3 checks that the focused button's box does not move when it takes focus.

At its smallest (18 px, at the overview) the ring is 2 px of casing, 2 px of ring, 1 px of casing, then 2.5 px of map, then the 7 px cased dot: the star under the dot is covered, as it is today.

`frontcreck/src/components/map/MusicMap.tsx` L11 (L13 after part 2), before: `/** Amber ring around the album selected in Explore; positioned by OverlayDriver. */` after: `/** Off-white ring (the lamp token) on a dark casing around the album selected in Explore; positioned by OverlayDriver. */` (If part 2 already rewrote this line, make it say the same.)

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/lib/contrast.test.ts)`
Expected: PASS, 16 tests. To see the test bite, change `.8` to `.3` in the `.map-sel` rule for one run: it fails with "the ring on its casing over white" (1.76). Put `.8` back.

- [ ] **Step 3: Measure it in the browser on the brightest gas**

Append at the end of `frontcreck/e2e/glass.spec.ts`:

```ts

test('the selected ring reads on the brightest gas', async ({ page, isMobile }) => {
  test.skip(isMobile, 'measured where the map has room; the ring is one CSS rule at every width');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await twinkleOff(page);
  const vp = page.viewportSize()!;
  // The brightest album that is on the canvas and clear of where the card opens (bottom left, 400 px wide).
  const id = await page.evaluate(
    ([ids, w, h]) => {
      for (const i of ids) {
        const p = window.__rmr!.map!.screenPoint(i)!;
        if (p.x < 40 || p.x > w - 40 || p.y < 110 || p.y > h - 40) continue;
        if (p.x < 460 && p.y > h - 260) continue;
        if (document.elementFromPoint(p.x, p.y)?.classList.contains('map-canvas')) return i;
      }
      return -1;
    },
    [await brightestAlbums(page, 40), vp.width, vp.height] as const,
  );
  expect(id, 'one of the forty brightest albums is free of the controls').toBeGreaterThanOrEqual(0);
  // Selected without a fly: at the overview a pick is marked by the DOM ring.
  await page.evaluate((i) => window.__rmr!.getState().setSelected(i), id);
  const ring = page.locator('.map-sel');
  await expect(ring).toHaveCSS('opacity', '1');
  await waitForCameraIdle(page);
  const box = (await ring.boundingBox())!;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const r = box.width / 2;
  // The middle of the 2 px ring (1 px inside its outer edge) and of the 2 px casing outside it, on four sides. A
  // band 2 px wide always holds the whole pixel under its middle line, so neither sample is a blend.
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const samples = sides.flatMap(([dx, dy]) => [
    { x: c.x + dx * (r - 1), y: c.y + dy * (r - 1) },
    { x: c.x + dx * (r + 1), y: c.y + dy * (r + 1) },
  ]);
  const png = (await page.screenshot()).toString('base64');
  const rgb = await page.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      return list.map((q) => [...ctx.getImageData(Math.floor(q.x * k), Math.floor(q.y * k), 1, 1).data.slice(0, 3)]);
    },
    [png, samples] as const,
  );
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r8, g8, b8]: number[]) => 0.2126 * lin(r8) + 0.7152 * lin(g8) + 0.0722 * lin(b8);
  sides.forEach((_, i) => {
    const ringRgb = rgb[2 * i];
    // The ring itself is the lamp token, rgb(241, 236, 228).
    expect(Math.max(Math.abs(ringRgb[0] - 241), Math.abs(ringRgb[1] - 236), Math.abs(ringRgb[2] - 228)), `ring colour, side ${i}`).toBeLessThanOrEqual(12);
    expect((lum(ringRgb) + 0.05) / (lum(rgb[2 * i + 1]) + 0.05), `the ring against its casing, side ${i}`).toBeGreaterThanOrEqual(3);
  });
});
```

Then the focus ring. In the same file add `tabTo` to the names imported from `./helpers`, add the import `import { COPY } from '../src/lib/copy';` under the Playwright import, and append:

```ts

test('the keyboard focus ring of a zoom button reads on the brightest gas', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard focus; the casing is one CSS rule at every width');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await twinkleOff(page);
  const button = page.getByRole('button', { name: COPY.map.zoomIn });
  const before = (await button.boundingBox())!;
  // Focus by keyboard, so :focus-visible holds.
  await tabTo(page, (el, label) => el.getAttribute('aria-label') === label, 40, COPY.map.zoomIn);
  await expect(button).toBeFocused();
  const box = (await button.boundingBox())!;
  expect(box, 'the casing rule does not move or resize the focused button').toEqual(before);
  // Slide the album that stands on the brightest gas under the middle of the button, so the brightest gas is round
  // it. A zero pan every 150 ms counts as the visitor's hand on the map and keeps the idle recentring away.
  const [brightest] = await brightestAlbums(page, 1);
  const at = async () => (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), brightest))!;
  const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.evaluate(() => {
    (window as unknown as { __hold: number }).__hold = window.setInterval(() => window.__rmr!.map!.panBy(0, 0), 150);
  });
  // panBy's direction is checked, not assumed: a second try mirrors it.
  for (const sign of [1, -1]) {
    const p = await at();
    if (Math.hypot(p.x - target.x, p.y - target.y) < 2) break;
    await page.evaluate(([dx, dy]) => window.__rmr!.map!.panBy(dx, dy), [sign * (p.x - target.x), sign * (target.y - p.y)] as const);
  }
  const p = await at();
  expect(Math.hypot(p.x - target.x, p.y - target.y), 'the brightest album is under the zoom button').toBeLessThan(2);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(button).toBeFocused();
  // Left and right of the button, at its mid height: the ring is the band 3 to 5 px out, its casing the band 5 to 7
  // px out. One pixel inside each band, so neither sample is a blend.
  const y = box.y + box.height / 2;
  const samples = [
    { x: box.x - 4, y },
    { x: box.x - 6, y },
    { x: box.x + box.width + 3.5, y },
    { x: box.x + box.width + 5.5, y },
  ];
  const png = (await page.screenshot()).toString('base64');
  await page.evaluate(() => window.clearInterval((window as unknown as { __hold: number }).__hold));
  const rgb = await page.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      return list.map((q) => [...ctx.getImageData(Math.floor(q.x * k), Math.floor(q.y * k), 1, 1).data.slice(0, 3)]);
    },
    [png, samples] as const,
  );
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r8, g8, b8]: number[]) => 0.2126 * lin(r8) + 0.7152 * lin(g8) + 0.0722 * lin(b8);
  for (const [side, i] of [['left', 0], ['right', 2]] as const) {
    const ringRgb = rgb[i];
    // The ring is the lamp token, rgb(241, 236, 228).
    expect(Math.max(Math.abs(ringRgb[0] - 241), Math.abs(ringRgb[1] - 236), Math.abs(ringRgb[2] - 228)), `ring colour, ${side}`).toBeLessThanOrEqual(12);
    expect((lum(ringRgb) + 0.05) / (lum(rgb[i + 1]) + 0.05), `the focus ring against its casing, ${side}`).toBeGreaterThanOrEqual(3);
  }
});
```

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/glass.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/map.spec.ts --project=desktop --workers=1)
```

Expected: `glass.spec.ts` 7 passed; `map.spec.ts` passes ("hover shows a label, drag pans, wheel zooms, click selects and flies" still ends with the ring shown among dots: the casing does not change `opacity`). If the new test fails on the ring colour, a sample fell off the ring: the ring's box is not what `boundingBox` reports (check that nobody added padding or a transform scale to `.map-sel`); do not widen the 12. If the focus ring test fails on "is under the zoom button", the idle recentring moved the map between the pan and the check: shorten the hold's 150 ms to 80, do not drop the check. If either test fails on the contrast, the casing is not painted where the plan says: look at `frontcreck/test-results/` for the trace.

- [ ] **Step 4: Typecheck, lint, commit**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint)`
Expected: both pass.

```bash
git add frontcreck/src/styles/map.css frontcreck/src/components/map/MusicMap.tsx frontcreck/src/lib/contrast.test.ts frontcreck/e2e/glass.spec.ts
git commit -m "feat(theme): a dark casing on the selected ring and on focus rings over the map, so both read on the brightest gas

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 5: Phone strip on the nebula, and the phone layout guard

**Files:**
- Modify: `frontcreck/src/components/album/MapPreviewStrip.tsx` (whole file, L1-190)
- Modify: `frontcreck/src/components/album/MapPreviewStrip.test.ts` (whole file, L1-27)
- Modify: `frontcreck/e2e/phone.spec.ts` (append one test)

**Interfaces:**
- Consumes from part 1: `SKY_RGB`, `STAR_WHITE`, `FRAME_RGB` (each `[r, g, b]` in 0 to 255) from `src/components/map/theme.ts`; `loadTheme(): Promise<ThemeData>` with `ThemeData.bakeHalf: number` from `src/lib/data/theme.ts`; the files `public/data/theme/gas-{sonic,balanced,mood}.webp`, each covering the raw square `[-bakeHalf, bakeHalf]²`. Confirmed against part 1's plan (its theme loader task and its theme build task): `loadTheme` memoises its promise; the image is stored upright (pixel (0, 0) is raw (-bakeHalf, +bakeHalf), north up, as the strip draws) with straight alpha, where alpha is what the dust lets through, so drawing it over the sky fill with ordinary source-over is right; neither `components/map/theme.ts` nor `lib/data/theme.ts` imports three.js. Check the same three facts in the code before starting.
- Consumes from part 2: `CLUSTER_RGB` no longer exists in `src/components/map/data.ts` (part 2 leaves a two-line stand-in in `MapPreviewStrip.tsx`, which this task replaces); the names toggle is one more 44 px button in the zoom corner, class `.map-names`, the first child of `.map-zoom` (so it is the top button), shown at every zoom; `layoutMarkers` takes `options.minLine`, and part 2 asks the strip to pass `minLine: 10` for its small covers (the prototype's value).
- Produces: `drawStrip(ctx, w, h, albums, pos, focus, gas, onReady)` where `gas: StripGas | null` and `interface StripGas { image: CanvasImageSource; bakeHalf: number }`. The `accent` parameter is gone (the seed's frame is off-white, like the map's).
- Stars: every album in view is one dot of one size and one brightness (1.3 px, `STAR_WHITE` at 0.7), as in the prototype's strip (`docs/design/trifid-theme/prototype/src/pages.js`, `Pages.strip`). Part 2 draws the map's star sizes at random on each page load and never from album order or rank; the strip has no sizes at all, so nothing in it can follow order or rank, and Step 1 pins that.
- The site's phone slider is not touched by this task or any other: it keeps its track, its three stops and its 44 px targets, and only takes the new tokens.

- [ ] **Step 1: Replace `frontcreck/src/components/album/MapPreviewStrip.test.ts` with the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { FRAME_RGB, SKY_RGB, STAR_WHITE } from '@/components/map/theme';
import type { AlbumRecord } from '@/lib/types';
import { drawStrip } from './MapPreviewStrip';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = Array.from({ length: 30 }, (_, i) => ({ slug: `a${i}`, t: `A${i}`, a: 'X', s: '', c: '', k: i % 8, d: [], w: W }));
const pos = albums.flatMap((_, i) => [(i % 6) / 6 - 0.5, Math.floor(i / 6) / 6 - 0.5]);
const FOCUS = { seed: 7, recs: [8, 13, 1] };

/** Records every method call and every property set, in order. */
function fakeCtx() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => { calls.push(`${k}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : a)).join(',')})`); }),
    set: (t, k: string, v) => { t[k] = v; calls.push(`${k}=${v}`); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const count = (calls: string[], prefix: string) => calls.filter((c) => c.startsWith(prefix)).length;

describe('drawStrip', () => {
  it('draws everything without the gas image: sky, a star per album, cased lines, tiles and numbered badges', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    // The sky is filled first, so the strip is never an empty box while the image loads or after it failed.
    expect(calls.slice(0, 2)).toEqual([`fillStyle=rgba(${SKY_RGB.join(',')},1)`, 'fillRect(0,0,390,172)']);
    expect(count(calls, 'drawImage(')).toBe(0);
    expect(count(calls, 'arc(')).toBeGreaterThan(10);
    expect(count(calls, 'lineTo(')).toBe(2 * 3); // a dark casing and a white line per recommendation
    expect(count(calls, 'fillRect(')).toBe(1 + 1 + 4 + 3); // sky, the seed's backing, four tiles (no cover ids), three badges
    expect(calls.filter((c) => c.startsWith('fillText(')).map((c) => c.split(',')[0])).toEqual(['fillText(1', 'fillText(2', 'fillText(3']);
  });

  it('draws the gas under the stars, placed by bakeHalf in the strip\'s own scale', () => {
    const { ctx, calls } = fakeCtx();
    const image = { toString: () => 'GAS' } as unknown as CanvasImageSource;
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, { image, bakeHalf: 1 }, vi.fn());
    // Scale 336 px per unit, centred on (-0.25, -0.3333): the square [-1, 1]² is 672 px wide from (-57, -362).
    expect(calls).toContain('drawImage(GAS,-57,-362,672,672)');
    expect(calls.indexOf('drawImage(GAS,-57,-362,672,672)')).toBeLessThan(calls.findIndex((c) => c.startsWith('arc(')));
  });

  it('uses the theme colours: star-white dots of one size, off-white frames, no cluster colours', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    expect(calls).toContain(`fillStyle=rgba(${STAR_WHITE.join(',')},0.7)`);
    // One size for every star: nothing in the strip depends on an album's place in the list (no order, no rank).
    const radii = new Set(calls.filter((c) => c.startsWith('arc(')).map((c) => c.split(',')[2]));
    expect(radii.size).toBe(1);
    expect(calls).toContain(`strokeStyle=rgba(${FRAME_RGB.join(',')},1)`);
    expect(calls.some((c) => /196,136,111|151,160,119|200,165,96|237,229,213/.test(c))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/album/MapPreviewStrip.test.ts)`
What the rewritten file still proves: the old file's one test counted the dots (more than 10 arcs), one line per recommendation, a tile per album without a cover, three badges and their numbers 1, 2, 3. The first new test keeps every one of those counts (the lines are now two strokes each, casing and line, so 6; the filled rectangles gain the sky and the seed's backing, so 9) and adds the order of drawing; the other two tests are new.

Expected: FAIL on the first assertion (`expected [ 'clearRect(0,0,390,172)', … ]`). The old file still compiles, before part 2 and after it (part 2 swaps the `CLUSTER_RGB` import for a `STAR_WHITE` stand-in), and typecheck reports the changed `drawStrip` arguments.

- [ ] **Step 3: Replace `frontcreck/src/components/album/MapPreviewStrip.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TILE } from '@/components/Cover';
import { MARKER_GAP, layoutMarkers } from '@/components/map/state/focusLayout';
import { FRAME_RGB, SKY_RGB, STAR_WHITE } from '@/components/map/theme';
import { COPY } from '@/lib/copy';
import { coverUrl } from '@/lib/data/catalog';
import { loadTheme } from '@/lib/data/theme';
import { useCatalog, usePositions } from '@/lib/data/useData';
import { useIsNarrow } from '@/lib/media';
import type { AlbumRecord, Focus, StopId } from '@/lib/types';

const rgba = ([r, g, b]: readonly number[], a: number) => `rgba(${r},${g},${b},${a})`;
/** The map's empty sky, its stars and its off-white frames (components/map/theme.ts), plus two tokens of globals.css. */
const SKY = rgba(SKY_RGB, 1);
const STAR = rgba(STAR_WHITE, 0.7);
const FRAME = rgba(FRAME_RGB, 1);
const FRAME_QUIET = rgba(FRAME_RGB, 0.6);
const BADGE_EDGE = rgba(FRAME_RGB, 0.45);
const ROOM = '#07060a'; // --color-room
const PAPER = '#f3eee7'; // --color-paper
/** The lines to the closest albums, as on the map: white on a dark casing, so they hold on any gas. */
const LINE_CASING = 'rgba(4,4,8,.8)';
const LINE = 'rgba(255,255,255,.92)';
/** Strip covers are smaller than the map's markers (64 / 46): the mockup's compact MapView sizes. */
const STRIP_SEED = 38;
const STRIP_REC = 28;
/** The gas of one slider stop, drawn under the strip's stars. */
export interface StripGas {
  image: CanvasImageSource;
  /** The image covers the raw square [-bakeHalf, bakeHalf]², north up (theme.json). */
  bakeHalf: number;
}
/** The strip shows a small part of the 2048 px gas image, so it keeps a 512 px copy and lets the full decode go. */
const GAS_PX = 512;
const gasCopies = new Map<StopId, Promise<HTMLCanvasElement>>();

function loadGas(stop: StopId): Promise<HTMLCanvasElement> {
  let copy = gasCopies.get(stop);
  if (!copy) {
    const im = new Image();
    im.decoding = 'async';
    im.src = `/data/theme/gas-${stop}.webp`;
    copy = im.decode().then(() => {
      const c = document.createElement('canvas');
      c.width = GAS_PX;
      c.height = GAS_PX;
      c.getContext('2d')?.drawImage(im, 0, 0, GAS_PX, GAS_PX);
      return c;
    });
    // A failed load is forgotten, so the next strip tries again; this one draws without gas.
    copy.catch(() => gasCopies.delete(stop));
    gasCopies.set(stop, copy);
  }
  return copy;
}

const images = new Map<string, { im: HTMLImageElement; decoded: boolean; failed: boolean; waiting: Set<() => void> }>();

/** A cover is drawn only after img.decode() resolved (off the main thread); until then the tile is drawn. */
function readyImage(url: string, onReady: () => void): HTMLImageElement | null {
  let entry = images.get(url);
  if (!entry) {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    const e = { im, decoded: false, failed: false, waiting: new Set<() => void>() };
    entry = e;
    images.set(url, e);
    im.decode().then(
      () => {
        e.decoded = true;
        e.waiting.forEach((f) => f());
        e.waiting.clear();
      },
      // A cover that cannot be decoded keeps its tile: drawing a lettered tile is the designed fallback, so the
      // failure is recorded (no retry, no redraw) rather than reported.
      () => {
        e.failed = true;
        e.waiting.clear();
      },
    );
  }
  if (entry.decoded) return entry.im;
  if (!entry.failed) entry.waiting.add(onReady);
  return null;
}

/** The compact map of the phone album list: the sky, the stop's gas when it has loaded, a star per album, cased
 * lines to the closest albums, small covers (seed 38 px, recs 28 px, kept inside the canvas) and rank badges
 * drawn last, so no cover hides one. Without `gas` everything else is still drawn. */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  albums: readonly AlbumRecord[],
  pos: readonly number[],
  focus: Focus,
  gas: StripGas | null,
  onReady: () => void,
): void {
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, h);
  const ids = [focus.seed, ...focus.recs];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const i of ids) {
    x0 = Math.min(x0, pos[2 * i]);
    x1 = Math.max(x1, pos[2 * i]);
    y0 = Math.min(y0, pos[2 * i + 1]);
    y1 = Math.max(y1, pos[2 * i + 1]);
  }
  const pad = 30;
  const k = Math.min(Math.max(Math.min((w - 2 * pad) / Math.max(x1 - x0, 0.3), (h - 2 * pad) / Math.max(y1 - y0, 0.3)), Math.min(w, h) / 8), 5000);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sx = (x: number) => w / 2 + (x - cx) * k;
  const sy = (y: number) => h / 2 - (y - cy) * k;
  if (gas) {
    // The strip uses raw positions, so the image's square [-bakeHalf, bakeHalf]² maps with the same scale; the
    // image's alpha (dust) lets the sky fill show through.
    const side = 2 * gas.bakeHalf * k;
    ctx.drawImage(gas.image, sx(-gas.bakeHalf), sy(gas.bakeHalf), side, side);
  }
  ctx.beginPath();
  for (let i = 0; i < albums.length; i++) {
    const x = sx(pos[2 * i]);
    const y = sy(pos[2 * i + 1]);
    if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
    ctx.moveTo(x + 1.3, y);
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
  }
  ctx.fillStyle = STAR;
  ctx.fill();
  const placed = layoutMarkers(ids.map((id) => ({ id, x: sx(pos[2 * id]), y: sy(pos[2 * id + 1]) })), STRIP_SEED, STRIP_REC, {
    // 6 px: room for the badges (4 px out, top-left) and the seed's frame (5 px out).
    bounds: { left: 6, top: 6, right: w - 6, bottom: h - 6 },
    gap: MARKER_GAP,
    // The strip's covers are small: 10 px of visible line is enough (part 2's layoutMarkers defaults to 24).
    minLine: 10,
  });
  for (const [stroke, width] of [[LINE_CASING, 3], [LINE, 1.2]] as const) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    for (const it of placed.slice(1)) {
      ctx.beginPath();
      ctx.moveTo(placed[0].x, placed[0].y);
      ctx.lineTo(it.x, it.y);
      ctx.stroke();
    }
  }
  for (const it of [...placed.slice(1), placed[0]]) {
    const a = albums[it.id];
    const s = it.size;
    const x = it.x - s / 2;
    const y = it.y - s / 2;
    if (it.seed) {
      // The seed's frame sits on a dark backing, so it reads on the brightest gas too.
      ctx.fillStyle = ROOM;
      ctx.fillRect(x - 5, y - 5, s + 10, s + 10);
    }
    const url = coverUrl(a.c, s);
    const im = url ? readyImage(url, onReady) : null;
    if (im) ctx.drawImage(im, x, y, s, s);
    else {
      ctx.fillStyle = TILE[a.k % 3];
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = it.seed ? FRAME : FRAME_QUIET;
    ctx.lineWidth = it.seed ? 2 : 1;
    const o = it.seed ? 4 : 0.5;
    ctx.strokeRect(x - o, y - o, s + 2 * o, s + 2 * o);
  }
  const b = 14;
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (const it of placed.slice(1)) {
    const bx = it.x - it.size / 2 - 4;
    const by = it.y - it.size / 2 - 4;
    ctx.fillStyle = ROOM;
    ctx.fillRect(bx, by, b, b);
    ctx.strokeStyle = BADGE_EDGE;
    ctx.strokeRect(bx + 0.5, by + 0.5, b - 1, b - 1);
    ctx.fillStyle = PAPER;
    ctx.fillText(String(it.rank), bx + b / 2, by + b / 2 + 0.5);
  }
}

export function MapPreviewStrip({ focus, stop, onOpen }: { focus: Focus; stop: StopId; onOpen: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The strip only exists under 900 px; on wider screens it is display:none, so load nothing for it there.
  const narrow = useIsNarrow();
  const { catalog } = useCatalog(narrow);
  const { positions } = usePositions(narrow);
  const recsKey = focus.recs.join(',');
  // The gas of one stop; the strip draws without it until it arrives, and for good if it cannot load.
  const [gas, setGas] = useState<(StripGas & { stop: StopId }) | null>(null);

  useEffect(() => {
    if (!narrow) return;
    let live = true;
    Promise.all([loadGas(stop), loadTheme()]).then(
      ([image, theme]) => {
        if (live) setGas({ stop, image, bakeHalf: theme.bakeHalf });
      },
      // Decoration only: the strip without gas (sky, stars, lines, covers) is the designed fallback.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [narrow, stop]);

  const stopGas = gas?.stop === stop ? gas : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !catalog || !positions) return;
    let raf = 0;
    // A cover that finishes decoding after this effect was cleaned up must not redraw (the callback stays queued).
    let live = true;
    const draw = () => {
      if (!live) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const recs = recsKey ? recsKey.split(',').map(Number) : [];
        drawStrip(ctx, r.width, r.height, catalog.albums, positions[stop], { seed: focus.seed, recs }, stopGas, draw);
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [catalog, positions, stop, focus.seed, recsKey, stopGas]);

  return (
    <div className="strip">
      <canvas ref={ref} className="strip-canvas" role="img" aria-label={COPY.map.preview} onClick={onOpen} />
      <button type="button" className="strip-open" onClick={onOpen}>
        <span>{COPY.map.openMap}</span>
        <Icon name="fit" />
      </button>
    </div>
  );
}
```

If part 1's `loadTheme` has another name or shape, change only the import and the `theme.bakeHalf` read; if its image has south up, change `sy(gas.bakeHalf)` and add a vertical flip. Say so in the commit message.

- [ ] **Step 4: Run the unit test to pass**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/album/MapPreviewStrip.test.ts)`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the phone layout guard to `frontcreck/e2e/phone.spec.ts`**

Append at the end of the file:

```ts

test('the zoom corner, with the names button, clears the slider below it and whatever is above it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  // The smallest phone the layout is checked on.
  await page.setViewportSize({ width: 360, height: 640 });
  /** The buttons of the bottom right corner (names, zoom in, zoom out, whole map), top to bottom. */
  const corner = () =>
    page.locator('.map-zoom button, button.map-names, .map-names button').evaluateAll((els) =>
      els
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ y: r.y, w: Math.round(r.width), h: Math.round(r.height) }))
        .sort((a, b) => a.y - b.y),
    );
  const check = async (ceiling: number, label: string) => {
    const buttons = await corner();
    const mode = (await page.locator('.mode').boundingBox())!;
    for (const b of buttons) {
      expect(b.w, label).toBeGreaterThanOrEqual(44);
      expect(b.h, label).toBeGreaterThanOrEqual(44);
    }
    // No two overlap, the lowest ends 8 px above the slider panel (map.css: --slider-cover + 8px), the highest
    // starts at least 8 px under what is above it.
    for (let i = 1; i < buttons.length; i++) expect(buttons[i].y - (buttons[i - 1].y + buttons[i - 1].h), label).toBeGreaterThanOrEqual(-1);
    const last = buttons[buttons.length - 1];
    expect(mode.y - (last.y + last.h), label).toBeGreaterThanOrEqual(7);
    expect(buttons[0].y - ceiling, label).toBeGreaterThanOrEqual(8);
    return buttons.length;
  };
  // Explore at the overview: three zoom buttons and the names button, under the header.
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const header = (await page.locator('header.top').boundingBox())!;
  expect(await check(header.y + header.height, 'explore')).toBeGreaterThanOrEqual(4);
  // An album's map mode: the corner must also clear the Explore and List buttons of the top row.
  await page.goto(IR);
  await waitForMap(page);
  await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
  await expect(page.locator('.mode')).toBeVisible();
  await waitForMap(page); // map mode starts the other two stops' gas (part 1): settled before anything is measured
  await waitForCameraIdle(page);
  const list = (await page.locator('.fab-map--on').boundingBox())!;
  const explore = (await page.locator('.map-explore').boundingBox())!;
  expect(await check(Math.max(list.y + list.height, explore.y + explore.height), 'album map mode')).toBeGreaterThanOrEqual(3);
});
```

Before part 2 lands this fails on its count (three buttons, four expected): that is the red state. With part 2 it must pass. Worked out by hand at 360 x 640: the stage is 580 px tall (640 less the phone's 60 px header) and the slider covers about 165 px, so the corner ends 173 px above the stage's bottom; four 44 px buttons and one 8 px gap are 184 px, which puts the top button 223 px under the header and 163 px under the top row (which ends 60 px down). Task 3 does not move the stage, so these numbers are the same with the map behind the header. The names button is the first child of `.map-zoom` (part 2's names toggle task), so it has no position of its own: it is lifted with the stack by the phone rule `.map-zoom { bottom: calc(var(--slider-cover, …) + 8px); }` in `map.css`. If the test fails on position, that rule or the button's `margin-bottom: 8px` was changed; fix it there. No CSS change is needed in `phone.css` or in that rule; the 44 px targets, the Map/List pill (`--color-paper` with `--color-lamp-ink`, 16.37:1) and the bottom slider keep their rules and take the new tokens.

- [ ] **Step 6: Run the phone checks**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/phone.spec.ts --project=phone --workers=1)
```

Expected: all pass, including "tap targets are at least 44 px" and "list first, then the map strip". Then look at `frontcreck/test-results/shots/phone-album-list.png`: the strip shows gas under white stars, white cased lines, an off-white frame round the seed.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint)`
Expected: both pass.

```bash
git add frontcreck/src/components/album/MapPreviewStrip.tsx frontcreck/src/components/album/MapPreviewStrip.test.ts frontcreck/e2e/phone.spec.ts
git commit -m "feat(theme): phone map strip on the nebula, drawn with or without the gas image

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 6: Home, About and 404 over the nebula

**Files:**
- Modify: `frontcreck/src/styles/home.css` L3, L5, L11, L54
- Modify: `frontcreck/src/styles/map.css` L132-136 (about L162-166 once part 2 and Task 2 have run; the block starts with the comment `/* Home: a radial veil`)
- Modify: `frontcreck/src/styles/phone.css` L4-6
- Modify: `frontcreck/e2e/pages.spec.ts` (import at L3 or wherever `./helpers` is imported; one test appended)

**Interfaces:**
- Consumes: part 1's dimmed gas on Home, About and 404 (each loads and shows the gas of one stop only, the shown one; nothing in the look depends on the other two, and `waitForMap` on these pages waits for that one); part 2 hides the region names in the dimmed mode; `contrastOverBackdrop` from Task 2; `twinkleOff` from part 2. Part 2's glints follow the prototype and this part changes none of it: they play on Home under the veil, not on About or 404, and beside an open album they are quieter (a lower peak) and never start under one of its covers.
- Produces: no new interface. The hero (`components/home/HomeHero.tsx`), the shelf (`components/home/Shelf.tsx`) and `src/app/page.tsx` are not edited; nothing about regions is added. The Home cover shelf stays as it is, including the order of its covers, their dimming and the line that names a hovered cover: the only change near it is a scrim behind it in CSS, so its caption holds 4.5:1 over the nebula.

- [ ] **Step 1: Write the failing test in `frontcreck/e2e/pages.spec.ts`**

Add `contrastOverBackdrop` and `twinkleOff` (part 2's helper) to the names imported from `./helpers` in the existing import line. Append at the end of the file:

```ts

test('text over the nebula keeps 4.5:1 on Home, About and 404, and Home says nothing about regions', async ({ page }) => {
  const PAGES: Array<[string, string, string[]]> = [
    ['/', '.home', ['.hero h1', '.hero .lede', '.hero-row a.textbtn', '.hero-row button.textbtn', '.shelf-now .cap']],
    ['/about', '.about', ['.about h1', '.about p', '.about .about-h2', '.about .about-credits']],
    ['/nothing-here', '.notfound', ['.notfound h1', '.notfound-sub', '.notfound .textbtn']],
  ];
  for (const [url, scope, selectors] of PAGES) {
    await page.goto(url);
    await waitForMap(page);
    await waitForMapQuiet(page);
    await waitForAnimations(page);
    // Glints play on Home (part 2, as in the prototype); a bloom must not drift into the screenshot being measured.
    await twinkleOff(page);
    for (const r of await contrastOverBackdrop(page, scope, selectors)) expect(r.ratio, `${url} ${r.selector}`).toBeGreaterThanOrEqual(4.5);
  }
  await page.goto('/');
  await expect(page.locator('.home')).not.toContainText(/region/i);
});
```

(`waitForMap`, `waitForMapQuiet` and `waitForAnimations` are already imported in this file; if one is not, add it to the same import.)

- [ ] **Step 2: Run it and see it fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/pages.spec.ts --project=desktop --workers=1 -g "text over the nebula")`
Expected: FAIL on `/ .shelf-now .cap` (ash text straight on the gas, no scrim). If it passes on this machine because part 1 dims the Home gas far enough, note the printed ratios and continue: the test is then a guard.

- [ ] **Step 3: Move the veil to the cool near-black**

(If Task 2 Step 8 already made the two edits of this step, check that they are in and go on to Step 4.)

`frontcreck/src/styles/map.css` L132-136 today (about L162-166 by now), before:

```css
/* Home: a radial veil over the dimmed map, darkest behind the hero (mockup lines 167 to 172). Opacity only. */
.veil {
  position: absolute; inset: 0; z-index: 4; cursor: pointer;
  background: radial-gradient(50% 55% at 50% 45%, rgba(21, 17, 13, .72), rgba(21, 17, 13, .3) 70%, rgba(21, 17, 13, .15));
}
```

after:

```css
/* Home: a light even veil over the dimmed nebula; the hero has its own dark pad (home.css). Opacity only. */
.veil {
  position: absolute; inset: 0; z-index: 4; cursor: pointer;
  background: rgba(7, 6, 10, .1);
}
```

`frontcreck/src/styles/phone.css` L4-6, delete these three lines (the phone veil was darker because overlapping dots added up; the gas does not):

```css
  /* Home: the fitted cloud is denser on a phone, and overlapping WebGL dots add up where the mockup's canvas
   * fills each cluster once, so the veil is darker here and centred on the map to keep the backdrop as quiet. */
  .veil { background: radial-gradient(60% 50% at 50% 55%, rgba(21, 17, 13, .8), rgba(21, 17, 13, .52) 70%, rgba(21, 17, 13, .4)); }
```

- [ ] **Step 4: Give the hero its pad and the shelf its scrim in `frontcreck/src/styles/home.css`**

L3, before: `.home { position: absolute; inset: 0; z-index: 8; overflow-y: auto; pointer-events: none; display: flex; flex-direction: column; }` after: `.home { position: absolute; inset: 0; z-index: 8; overflow-x: hidden; overflow-y: auto; pointer-events: none; display: flex; flex-direction: column; }`

After L5 (`.hero { position: relative; … }`) insert:

```css
/* A soft dark pad behind the hero, so its text holds over the nebula (prototype pages.css line 22). Static. */
.hero::before { content: ""; position: absolute; inset: clamp(18px, 8vh, 92px) -6px -4px; z-index: -1; background: rgba(5, 4, 8, .72); border-radius: 40px; filter: blur(26px); pointer-events: none; }
```

L11, before: `.shelf { margin: auto auto 0; width: 100%; max-width: calc(1240px + 2 * var(--gut)); padding: 36px var(--gut) 28px; }` after:

```css
.shelf { position: relative; margin: auto auto 0; width: 100%; max-width: calc(1240px + 2 * var(--gut)); padding: 36px var(--gut) 28px; }
/* A full-width scrim under the shelf's caption and covers (the .home layer clips its overhang). */
.shelf::before { content: ""; position: absolute; inset: 0 -50vw; z-index: -1; pointer-events: none; background: linear-gradient(rgba(7, 6, 10, 0), rgba(7, 6, 10, .7) 30px); }
```

In the `@media (max-width: 899px)` block, after L54 (`  .hero { padding-top: 40px; }`) insert: `  .hero::before { inset: 22px 0 -4px; }`

The About and 404 scrims and the About card were changed in Task 2 Step 6.

- [ ] **Step 5: Run to pass, desktop then phone; tune only if it fails**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/pages.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/pages.spec.ts --project=phone --workers=1)
```

Expected: all pass. If the new test still fails, change exactly one number per run and rerun, in this order, and write the final values in the PR body:

1. `/ .shelf-now .cap`: the shelf scrim's `.7` goes up by `.06` (to at most `.88`).
2. `/ .hero-row …` or `/ .hero .lede`: the hero pad's `.72` goes up by `.06` (to at most `.9`).
3. `/nothing-here …`: the `.notfound, .page-msg` scrim's `.55` goes up by `.06` (to at most `.79`).
4. `/about …`: cannot fail unless Task 1's panel numbers were changed; recheck those.

Do not lower the threshold, widen the percentile or drop a selector.

- [ ] **Step 6: Compare with the approved picture**

Open `frontcreck/test-results/shots/desktop-home.png` (written by "hero, search, buttons and shelf over the dimmed map") beside `docs/design/trifid-theme/options/final-home.jpg`. The nebula must be visible round the hero and through the clear header above it (the map runs behind the header since Task 3), the hero text must sit on a soft dark area with no visible box, and the shelf must read as covers on a dark floor. Differences in the gas itself are part 1's. The full comparison is Task 10.

- [ ] **Step 7: Commit**

```bash
git add frontcreck/src/styles/home.css frontcreck/src/styles/map.css frontcreck/src/styles/phone.css frontcreck/e2e/pages.spec.ts
git commit -m "feat(theme): Home, About and 404 over the nebula with measured text contrast

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 7: Theme-coupled tests

**Files:**
- Modify: `frontcreck/e2e/explore.spec.ts` L52-75, L295-328
- Modify: `frontcreck/e2e/search.spec.ts` L137-145
- Modify: `frontcreck/src/lib/types.ts` L9 (comment)
- Read only: `frontcreck/e2e/a11y.spec.ts` L82-98, `frontcreck/src/components/map/shaders/album.test.ts`

**Interfaces:**
- Consumes from part 2: the picked album's frame in `shaders/album.ts` is `FRAME_RGB` `rgb(241, 236, 228)`, 2 px wide, centred 36 px from the centre of a 64 px picked cover (`SELECTED_FRAME_GAP_PX = 4`, `SELECTED_FRAME_PX = 2`, unchanged geometry); the other covers still step back while a pick lasts, by alpha as today: each other cover is drawn at half opacity (`SELECTION_DIM = 0.5`; outside an open album's focus the factor is 0.45). Part 2 does not darken them towards the page colour. So what shows through a stepped back cover is whatever is behind it: the gas and the page colour, or another cover where two overlap. Part 2 owns `shaders/album.test.ts`; if it pins the frame colour, it must pin `FRAME_RGB`. Nothing here edits it.
- Produces: no interface.

- [ ] **Step 1: Rewrite the helpers in `frontcreck/e2e/explore.spec.ts` L52-75**

Before (L52-75): the `meanLuma` function and `const isLamp = ([r, g, b]: number[]) => Math.abs(r - 230) < 30 && Math.abs(g - 168) < 30 && Math.abs(b - 86) < 35;`

After (replace those lines):

```ts
type Box = { x: number; y: number; w: number; h: number };

/** Mean, over `boxes` (client px), of the standard deviation of luminance inside each box of one screenshot: how
 * much picture detail the covers there show against whatever is behind them. */
async function meanLumaStd(page: Page, boxes: Box[]): Promise<number> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rects]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      let total = 0;
      for (const r of rects) {
        const d = ctx.getImageData(Math.round(r.x * k), Math.round(r.y * k), Math.round(r.w * k), Math.round(r.h * k)).data;
        let sum = 0;
        let sq = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += l;
          sq += l * l;
        }
        total += Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
      }
      return total / rects.length;
    },
    [png, boxes] as const,
  );
}

/** 20 px boxes at the centres of up to 12 covers on the canvas that stand alone: clear of the picked album's
 * enlarged cover and frame, of every overlay (the card, the slider, the zoom buttons), and of every other cover (no
 * other album within 27 px either way, so no 32 px neighbour reaches into the box). Such a box holds one cover's
 * picture, with nothing over it and only the gas and the page colour under it. */
async function otherCoverBoxes(page: Page, picked: number): Promise<Box[]> {
  return page.evaluate(async (pickedId) => {
    const api = window.__rmr!.map!;
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    const c = api.screenPoint(pickedId)!;
    const pts: ({ x: number; y: number } | null)[] = [];
    for (let id = 0; id < n; id++) pts.push(api.screenPoint(id));
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (let id = 0; id < n && out.length < 12; id++) {
      const p = pts[id];
      if (id === pickedId || !p || p.x < 10 || p.y < 10 || p.x > innerWidth - 10 || p.y > innerHeight - 10) continue;
      if (Math.abs(p.x - c.x) < 70 && Math.abs(p.y - c.y) < 70) continue;
      if (pts.some((q, j) => j !== id && q !== null && Math.abs(q.x - p.x) < 27 && Math.abs(q.y - p.y) < 27)) continue;
      const onCanvas = [[-10, -10], [10, -10], [-10, 10], [10, 10]].every(([dx, dy]) => document.elementFromPoint(p.x + dx, p.y + dy)?.classList.contains('map-canvas'));
      if (onCanvas) out.push({ x: p.x - 10, y: p.y - 10, w: 20, h: 20 });
    }
    return out;
  }, picked);
}

/** The picked album's off-white frame (FRAME_RGB, rgb(241, 236, 228)). */
const isFrame = ([r, g, b]: number[]) => Math.abs(r - 241) < 16 && Math.abs(g - 236) < 16 && Math.abs(b - 228) < 18;
```

- [ ] **Step 2: Rewrite the test at `frontcreck/e2e/explore.spec.ts` L295-328**

Before: the test `'in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed'` (L295-328, ending with `expect(dimmed - PANE_LUMA).toBeLessThan((plain - PANE_LUMA) * 0.7);`).

After:

```ts
test('in cover mode the picked album is drawn large on top, framed in off-white, with the other covers dimmed', async ({ page, isMobile }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pickKnown(page, isMobile, IN_RAINBOWS);
  await shot(page, info, 'explore-selected-cover');
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  // Covers are 32 px here, so the picked one is 64 px with a 2 px off-white frame 4 px outside it (centre 36 px out).
  const framePoints = [
    { x: p.x + 36, y: p.y },
    { x: p.x - 36, y: p.y },
    { x: p.x, y: p.y - 36 },
    { x: p.x + 20, y: p.y - 36 },
  ];
  expect((await pixels(page, framePoints)).map(isFrame)).toEqual([true, true, true, true]);
  await expect(page.locator('.map-sel')).toHaveCSS('opacity', '0');
  // The hit area matches the drawn size: a click well outside a plain cover, near its corner, still lands on it.
  if (isMobile) await page.touchscreen.tap(p.x + 24, p.y + 24);
  else await page.mouse.click(p.x + 24, p.y + 24);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.getState().selected)).toBe(IN_RAINBOWS);
  await expect(page.locator('.card')).toBeVisible();
  // The other covers step back while the pick lasts: each is drawn at half opacity (alpha, as before the theme), so
  // the gas and the page colour show through it. That can make a cover brighter or darker, so brightness says
  // nothing. Compare the picture detail inside the same covers, with the pick and without it (the camera does not
  // move). The boxes are on covers that stand alone, and the gas is smooth across 20 px, so a cover at half opacity
  // shows half its detail whatever is behind it.
  if (!isMobile) await page.mouse.move(2, 2); // off the map: no hover label or hover ring over the sampled covers
  await waitForCameraIdle(page);
  const boxes = await otherCoverBoxes(page, IN_RAINBOWS);
  expect(boxes.length, 'covers that stand alone, to compare').toBeGreaterThanOrEqual(4);
  const dimmed = await meanLumaStd(page, boxes);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
  await waitForCameraIdle(page);
  const plain = await meanLumaStd(page, boxes);
  expect(plain, 'the undimmed covers show detail').toBeGreaterThan(6);
  expect(dimmed).toBeLessThan(plain * 0.7);
  // With the pick gone the frame is gone: the same four points are no longer all frame-coloured, so the frame
  // check above was not satisfied by pale gas.
  expect((await pixels(page, framePoints)).every(isFrame)).toBe(false);
});
```

What it still proves, point for point with the old test: the picked cover is drawn 64 px with a frame of the theme's frame colour at the exact four offsets (and the new last line shows those pixels are the frame, not the backdrop); the DOM ring is hidden; the hit area matches the drawn size; and the other covers step back while the pick lasts, by at least the same 30 percent (the same 0.7 threshold). Only the way the stepping back is measured changed. The old test measured how far a band of covers rose above a constant pane luminance (`PANE_LUMA = 19`), which was right when the only thing behind a half see-through cover was the flat brown pane. Part 2 keeps that fade by alpha (0.5), and now the gas and the page colour show through instead, brighter in one place and darker in another, so a mean brightness can move either way. The picture detail inside a cover cannot: at half opacity over a smooth backdrop it is half (ratio about 0.5), and with the stepping back removed it is unchanged (ratio 1), so the 0.7 line still separates the two and the test still fails if the dimming is lost. The boxes are taken on covers with no neighbour over or under them, because two half see-through covers on top of each other can add up to about 0.7 of one cover's detail, which would make the measure say less than it does today.

- [ ] **Step 3: Update `frontcreck/e2e/search.spec.ts` L137-145**

L137, before: `  test('the focused field shows a lamp border with a softer halo, without moving', async ({ page }) => {` after: `  test('the focused field shows an off-white border with a softer halo, without moving', async ({ page }) => {`

L143, before: `    await expect(field).toHaveCSS('border-top-color', 'rgb(230, 168, 86)');` after: `    await expect(field).toHaveCSS('border-top-color', 'rgb(241, 236, 228)');`

L145, before: `    await expect(field).toHaveCSS('box-shadow', /^(color\(srgb 0\.90\d* 0\.65\d* 0\.33\d* \/ 0\.45\)|rgba\(230, 168, 86, 0\.45\)) 0px 0px 0px 1px$/);` after: `    await expect(field).toHaveCSS('box-shadow', /^(color\(srgb 0\.94\d* 0\.92\d* 0\.89\d* \/ 0\.45\)|rgba\(241, 236, 228, 0\.45\)) 0px 0px 0px 1px$/);`

It still proves the focus ring is the lamp token at full strength on the border and at 45 percent as a 1 px halo, and that the field does not move.

- [ ] **Step 4: `frontcreck/e2e/a11y.spec.ts` L82-98 needs no edit**

It opens Making Movies (the weakest accent), turns a marker hot and checks the badge's own two computed colours with `contrastRatio`. Part 2's plan makes the hot badge `--color-room` digits on `--color-lamp` (about 17:1); if it stayed on the accent it would be 4.84:1 with the new room (4.50 with the old). Either way the assertion holds, and it still proves the badge a user sees is readable. Leave the test and its comment as they are. The rest of the file passes unchanged, but axe now reports text on glass as "incomplete" rather than judging it; `contrastOverBackdrop` (Tasks 2, 3 and 6) is what proves contrast there.

- [ ] **Step 5: One comment, and a search for leftovers**

`frontcreck/src/lib/types.ts` L9, before: `/** [wash, wash, accent] as #rrggbb. The accent passes 4.5:1 on #15110d. */` after: `/** [wash, wash, accent] as #rrggbb. The pipeline checks the accent at 4.5:1 on #15110d; on the Trifid room #07060a it is 4.84:1 or better. */`

Then search for leftovers: `grep -rn -i "amber" frontcreck/src frontcreck/e2e` must print nothing (the comment in `MusicMap.tsx` that said "Amber ring" was rewritten in Task 4). `lamp` stays where it names the token (`--color-lamp`, `.btn-lamp`); in `shaders/album.ts` the words belong to part 2.

- [ ] **Step 6: Run the changed specs, one at a time**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/explore.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/explore.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/search.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/a11y.spec.ts --project=desktop --workers=1)
```

Expected: all pass. If the last line of the cover test fails (the four points are frame-coloured even without a pick), In Rainbows sits on pale gas: use another known album for this one test (add a constant beside `IN_RAINBOWS` with its index and a comment), do not delete the line. If `expect(dimmed).toBeLessThan(plain * 0.7)` fails, the dimming is broken or part 2 changed `SELECTION_DIM`: report it, do not raise 0.7. If fewer than 4 covers stand alone, the spot is too dense for this measure: use another known album for this one test as above; do not lower the 27 px or the 4.

- [ ] **Step 7: The whole suite once, per project**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=nowebgl --workers=1)
```

Expected: all pass, `e2e/framing.spec.ts` included (it is part of the desktop and phone runs). Run them at night if the laptop is busy; never two at once.

- [ ] **Step 8: Commit**

```bash
git add frontcreck/e2e/explore.spec.ts frontcreck/e2e/search.spec.ts frontcreck/src/lib/types.ts
git commit -m "test(theme): frame colour and cover dimming checks that hold with gas behind the covers

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 8: Favicon in the Trifid colours

The owner said to update it, so this task is neither optional nor waiting for him. The mark keeps its shape (three points joined by lines) and becomes three stars on the sky colour: no amber dot, no clay or moss dot, only the Trifid tokens.

**Files:**
- Modify: `frontcreck/src/app/icon.svg` L1-5
- Modify: `frontcreck/scripts/icons/icon-16.svg`
- Modify: `frontcreck/scripts/icons/apple-icon.svg`
- Create: `frontcreck/scripts/icons/build.mjs`
- Modify: `frontcreck/src/styles/glass.test.ts` (one `describe` appended)
- Regenerate (binary): `frontcreck/src/app/favicon.ico` (three PNG entries: 16, 32, 48), `frontcreck/src/app/apple-icon.png` (180 px)

**Interfaces:**
- Consumes: Task 1's token values. Produces: nothing other parts use.

Contrast of the marks on the `#07060a` tile, computed with `node`: lines `#aaa49d` 8.18:1, small stars `#c4beb6` 10.96:1, large star `#f1ece4` 17.18:1. The tile's edge `#24222c` is 1.29:1 on purpose: it only softens the corner on a dark browser tab.

- [ ] **Step 1: Write the failing test**

Append at the end of `frontcreck/src/styles/glass.test.ts`:

```ts

describe('favicon', () => {
  const ICONS = ['src/app/icon.svg', 'scripts/icons/icon-16.svg', 'scripts/icons/apple-icon.svg'];
  const icon = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

  it('uses only the Trifid palette: no colour of the old warm theme', () => {
    // Sky, raised edge, ash lines, dust stars, the lamp star (globals.css: room, room-4, ash, dust, lamp).
    const ALLOWED = ['#07060a', '#24222c', '#aaa49d', '#c4beb6', '#f1ece4'];
    for (const f of ICONS) {
      const used = [...new Set([...icon(f).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];
      expect(used.filter((c) => !ALLOWED.includes(c)), f).toEqual([]);
      expect(used, f).toContain('#f1ece4');
    }
  });

  it('keeps the mark: three stars joined by lines', () => {
    for (const f of ICONS) {
      expect([...icon(f).matchAll(/<circle /g)].length, f).toBe(3);
      expect([...icon(f).matchAll(/<path /g)].length, f).toBe(1);
    }
  });
});
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/styles/glass.test.ts)`
Expected: FAIL on the first new test (it lists `#15110d`, `#322a21`, `#b3a792`, `#c4886f`, `#97a077`, `#e6a856` for `src/app/icon.svg`). The second new test already passes: it pins the shape while the colours change.

- [ ] **Step 2: Change the colours in the three SVGs (shapes unchanged)**

In all three files replace: `#15110d` with `#07060a`; `#322a21` with `#24222c`; `#b3a792` and `#cdc2ad` (the lines) with `#aaa49d`; `#c4886f` and `#97a077` (the two small dots) with `#c4beb6`; `#e6a856` (the large dot) with `#f1ece4`. Nothing else in the files changes.

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/styles/glass.test.ts)`
Expected: PASS, 12 tests.

- [ ] **Step 3: Create `frontcreck/scripts/icons/build.mjs`** (no script for the binaries exists in the repository)

```js
#!/usr/bin/env node
/** Renders the icon SVGs to src/app/favicon.ico (16, 32 and 48 px PNG entries) and src/app/apple-icon.png (180 px).
 * One headless Chromium, one page. Run: node scripts/icons/build.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '../..');
const svg = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

async function render(page, markup, px, opaque) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:${opaque ? '#07060a' : 'transparent'}}svg{display:block;width:${px}px;height:${px}px}</style>${markup}`);
  return page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: px, height: px } });
}

/** An .ico whose entries are PNG files, the format of the icon this replaces. */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ px, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(px, e);
    head.writeUInt8(px, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((x) => x.data)]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const entries = [
    { px: 16, data: await render(page, svg('scripts/icons/icon-16.svg'), 16, false) },
    { px: 32, data: await render(page, svg('src/app/icon.svg'), 32, false) },
    { px: 48, data: await render(page, svg('src/app/icon.svg'), 48, false) },
  ];
  fs.writeFileSync(path.join(ROOT, 'src/app/favicon.ico'), ico(entries));
  fs.writeFileSync(path.join(ROOT, 'src/app/apple-icon.png'), await render(page, svg('scripts/icons/apple-icon.svg'), 180, true));
  console.log('wrote src/app/favicon.ico and src/app/apple-icon.png');
} finally {
  await browser.close();
}
```

- [ ] **Step 4: Build the binaries and check them**

One browser, nothing else running:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node scripts/icons/build.mjs && file src/app/favicon.ico src/app/apple-icon.png)
```

Expected: `favicon.ico: MS Windows icon resource - 3 icons, 16x16 with PNG image data … 32 bits/pixel` and `apple-icon.png: PNG image data, 180 x 180`. Then `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run build)` must succeed (an earlier `favicon.ico` was rejected by `next build` for not being RGBA; see `docs/superpowers/plans/2026-09-29-recmyrecord-redesign-pr-notes.md` L232). Open `src/app/apple-icon.png` with the Read tool: three off-white stars joined by grey lines on near-black, nothing warm.

- [ ] **Step 5: Commit**

```bash
git add frontcreck/src/app/icon.svg frontcreck/src/app/favicon.ico frontcreck/src/app/apple-icon.png frontcreck/scripts/icons frontcreck/src/styles/glass.test.ts
git commit -m "feat(theme): favicon in the Trifid colours, with the script that builds its binaries

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

---

### Task 9: Speed against the baseline, and what each effect costs

Snappiness is a core requirement, so this task measures the assembled theme against the current site, not only against the budgets, and measures each effect on its own. An effect that costs speed is dropped or replaced by its cheaper version here, without asking the owner again; he is told afterwards in the pull request.

**Files:**
- Modify: `frontcreck/scripts/perf/lib.mjs` (append three functions and one list at the end of the file; part 1's Task 6 adds its reported only rows to `ROWS` higher up, which this does not touch)
- Modify: `frontcreck/scripts/perf/lib.test.mjs` (import at L2, two `describe` blocks appended)
- Modify: `frontcreck/scripts/perf/perf.mjs` in four places, each found by the text quoted in Step 3 and not by line number: part 1 has edited this file before (a fifth column, the deep zoom and gas measures, `--no-gas`), so today's line numbers no longer hold. This task adds to the file and changes nothing part 1 wrote.
- Create: `frontcreck/scripts/perf/compare.mjs`
- Create: `docs/design/trifid-theme/reviews/after/perf/` (raw output of the runs) and `docs/design/trifid-theme/reviews/app-perf-part3.md` (the write-up)
- Unchanged: `frontcreck/scripts/perf/budgets.json`

**Interfaces:**
- Consumes: the four custom properties of Task 1 (`--glass-blur`, `--color-float`, `--panel-bg`, `--top-bg`), whose first value in `globals.css` is the glass one and whose last is the solid one; part 2's twinkle switch `window.__rmr.getState().setTwinkleOn(on)` (the app store; `window.__rmr.twinkle` holds only `{ stats }` and appears once the map has mounted) and its `scripts/perf/twinkle-cost.mjs` (see Task 3's Interfaces if part 2 named them differently); the baseline in `docs/design/trifid-theme/reviews/baseline/` (`BASELINE-PERF.md`, `perf/perf-run1.json` to `perf-run3.json`, `perf/hover.json`, `hover-measure.mjs`).
- Consumes from part 1, as it defines them (its Task 6; this task does not redesign any of it): the default `npm run perf` has a fifth column, `gpu desktop2x` (`VIEWPORTS.desktop2x`: 1440 x 900 at device pixel ratio 2, GPU only, reported only, never passed to `checkBudgets`); three reported only rows, `deepDragGapMs` (a drag in deep zoom), `deepMorphGapMs` (the slider between stops in deep zoom) and `gasShownMs` (time until the nebula is visible, from `window.__rmr.gasShownMs`); a `--no-gas` flag, used to measure today's site; and the baseline for the dpr 2 column, `baseline/perf/perf-dpr2-run1.json` to `perf-dpr2-run3.json`, with its own section in `BASELINE-PERF.md`. If part 1 ended with other names, change them in `COMPARE_KEYS`, in `compare.mjs` and in the commands of Steps 5 to 8, and nowhere else.
- Produces: `glassVars(css: string, want: 'on' | 'off'): Record<string, string>`, `summarise(runs)` and `compareRuns(baseline, current)` in `lib.mjs`; `npm run perf -- --glass on|off` (forces glass or solid panels at any width by setting the four properties inline on `<html>`), `--twinkle on|off` and `--names on|off` (the last through part 2's store setter, `window.__rmr.getState().setNamesOn(v)`); `node scripts/perf/compare.mjs <baselineDir> <currentDir>`.

The baseline, for orientation (the files win if they differ): first-load JS 190.5 KB of 200, so the whole theme has 9.5 KB of room; GPU medians of drag, morph and transition 18 to 28 ms and zoom 38 to 44 ms against the 50 ms budget; no idle frame and no idle long task; first hover on GPU shows the label after 150 ms (median) with no long task in four of five loads. The baseline's own three runs did not pass every budget every time on this shared machine (one outlier each), which is why the rule is about medians.

**The rule, in the same words in all three parts.** Run `npm run perf` three times, one after another. Each measure is judged on the median of the three runs: the median must be inside its budget, and it is compared with the baseline's median and min to max in `BASELINE-PERF.md`. A median above the baseline's worst run is a finding even when it is inside budget. Any single run over budget is named and explained in the write-up (the baseline has three such single run outliers). `compare.mjs` (Step 3) applies exactly this to the JSON files; it adds nothing to the rule.

- [ ] **Step 1: Write the failing tests in `frontcreck/scripts/perf/lib.test.mjs`**

L2, before: `import { checkBudgets, checkPages, formatTable } from './lib.mjs';` after: `import { checkBudgets, checkPages, compareRuns, formatTable, glassVars, summarise } from './lib.mjs';`

Append at the end of the file:

```js

describe('glassVars', () => {
  const css = `:root { --panel-bg: rgba(8, 7, 11, 0.7); --top-bg: rgba(7, 6, 10, 0.58); --glass-blur: blur(22px) saturate(1.2) brightness(0.58); }
@theme { --color-float: rgba(10, 9, 14, 0.66); }
@media (max-width: 899px) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 1); --panel-bg: rgba(10, 9, 14, 1); --top-bg: rgba(10, 9, 14, 1); } }`;

  it('gives the first value of each property for glass and the last for solid', () => {
    expect(glassVars(css, 'on')).toEqual({
      '--glass-blur': 'blur(22px) saturate(1.2) brightness(0.58)',
      '--color-float': 'rgba(10, 9, 14, 0.66)',
      '--panel-bg': 'rgba(8, 7, 11, 0.7)',
      '--top-bg': 'rgba(7, 6, 10, 0.58)',
    });
    expect(glassVars(css, 'off')).toEqual({
      '--glass-blur': 'none',
      '--color-float': 'rgba(10, 9, 14, 1)',
      '--panel-bg': 'rgba(10, 9, 14, 1)',
      '--top-bg': 'rgba(10, 9, 14, 1)',
    });
  });

  it('rejects anything but on and off, and a stylesheet without both values', () => {
    expect(() => glassVars(css, 'maybe')).toThrow('--glass takes on or off');
    expect(() => glassVars(':root { --glass-blur: none; }', 'on')).toThrow('--glass-blur');
  });
});

describe('summarise and compareRuns', () => {
  const run = (drag, idle) => [{ mode: 'gpu', vp: 'desktop', dragGapMs: drag, idleFrames: idle, zoomGapMs: null }];

  it('takes the median, the best and the worst of each measure per mode and viewport', () => {
    const s = summarise([run(18, 0), run(34, 0), run(20, 1)]);
    expect(s['gpu desktop'].dragGapMs).toEqual({ median: 20, best: 18, worst: 34, n: 3 });
    expect(s['gpu desktop'].idleFrames).toEqual({ median: 0, best: 0, worst: 1, n: 3 });
    expect(s['gpu desktop'].zoomGapMs).toBeUndefined();
  });

  it('flags a measure only when its median is above the worst baseline run', () => {
    const base = summarise([run(18, 0), run(34, 0), run(20, 0)]);
    expect(compareRuns(base, summarise([run(30, 0), run(33, 1), run(36, 1)]))).toEqual([
      { where: 'gpu desktop', key: 'dragGapMs', baseMedian: 20, baseBest: 18, baseWorst: 34, median: 33, worse: false },
      { where: 'gpu desktop', key: 'idleFrames', baseMedian: 0, baseBest: 0, baseWorst: 0, median: 1, worse: true },
    ]);
  });

  it('keeps each column apart when files hold different columns, and keeps a measure that has no baseline', () => {
    // The baseline folder holds three files with the four old columns and three files made for the dpr 2 column.
    const dpr2 = (drag) => [{ mode: 'gpu', vp: 'desktop2x', dragGapMs: drag }];
    const base = summarise([run(18, 0), run(34, 0), run(20, 0), dpr2(30), dpr2(40), dpr2(35)]);
    expect(base['gpu desktop'].dragGapMs.n).toBe(3);
    expect(base['gpu desktop2x'].dragGapMs).toEqual({ median: 35, best: 30, worst: 40, n: 3 });
    const now = summarise([[{ mode: 'gpu', vp: 'desktop2x', dragGapMs: 38, gasShownMs: 700 }]]);
    expect(compareRuns(base, now)).toEqual([
      { where: 'gpu desktop2x', key: 'dragGapMs', baseMedian: 35, baseBest: 30, baseWorst: 40, median: 38, worse: false },
      { where: 'gpu desktop2x', key: 'gasShownMs', baseMedian: null, baseBest: null, baseWorst: null, median: 700, worse: false },
    ]);
  });
});
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- scripts/perf/lib.test.mjs)`
Expected: FAIL, `glassVars is not a function`.

- [ ] **Step 2: Add the three functions to `frontcreck/scripts/perf/lib.mjs`**

Append at the end of the file:

```js

const GLASS_PROPS = ['--glass-blur', '--color-float', '--panel-bg', '--top-bg'];

/** The four custom properties that make the panels glass ('on') or solid ('off'), read from globals.css: the first
 * value of each is the glass one, the last is the solid fallback. perf.mjs sets them inline to force either. */
export function glassVars(css, want) {
  if (want !== 'on' && want !== 'off') throw new Error(`--glass takes on or off, not ${want}`);
  return Object.fromEntries(
    GLASS_PROPS.map((name) => {
      const all = [...css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
      if (all.length < 2) throw new Error(`${name}: expected a glass and a solid value in globals.css`);
      return [name, want === 'on' ? all[0] : all[all.length - 1]];
    }),
  );
}

/** The numbers perf.mjs reports per mode and viewport. Lower is better for every one. */
export const COMPARE_KEYS = [
  'searchUsableMs', 'startupLongTaskMs', 'mapFirstFrameMs', 'typeToSuggestionsMs', 'selectToAlbumMs', 'transitionGapMs',
  'sliderToListMs', 'morphGapMs', 'dragGapMs', 'zoomGapMs', 'idleLongTasks', 'idleFrames',
  // Part 1's reported only measures. The baseline has them only where part 1 measured today's site for them.
  'deepDragGapMs', 'deepMorphGapMs', 'gasShownMs',
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Per "mode viewport" and measure: the median, the best (min) and the worst (max) of several runs. Each run is the
 * `rows` array of one perf JSON file. A measure a run did not report as a number is left out of that run. */
export function summarise(runs) {
  const values = {};
  for (const rows of runs) {
    for (const r of rows) {
      const where = `${r.mode} ${r.vp}`;
      for (const key of COMPARE_KEYS) {
        if (typeof r[key] !== 'number' || !Number.isFinite(r[key])) continue;
        ((values[where] ??= {})[key] ??= []).push(r[key]);
      }
    }
  }
  const out = {};
  for (const [where, byKey] of Object.entries(values)) {
    out[where] = {};
    for (const [key, xs] of Object.entries(byKey)) out[where][key] = { median: median(xs), best: Math.min(...xs), worst: Math.max(...xs), n: xs.length };
  }
  return out;
}

/** One row per measure the current set has: the baseline's median and its min to max, the current median, and
 * `worse` when the current median is above the worst baseline run (a finding even inside budget; a median inside
 * the baseline's own spread is run to run noise). A measure the baseline does not have keeps its row, with nulls
 * for the baseline and `worse` false: it is printed as "no baseline", never dropped. */
export function compareRuns(baseline, current) {
  const rows = [];
  for (const where of Object.keys(current)) {
    for (const key of COMPARE_KEYS) {
      const b = baseline[where]?.[key];
      const c = current[where]?.[key];
      if (!c) continue;
      if (!b) rows.push({ where, key, baseMedian: null, baseBest: null, baseWorst: null, median: c.median, worse: false });
      else rows.push({ where, key, baseMedian: b.median, baseBest: b.best, baseWorst: b.worst, median: c.median, worse: c.median > b.worst });
    }
  }
  return rows;
}
```

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- scripts/perf/lib.test.mjs)`
Expected: PASS.

- [ ] **Step 3: Wire `--glass`, `--twinkle` and `--names` into `frontcreck/scripts/perf/perf.mjs`, and add the comparison script**

Part 1 has edited this file, so find each place by its text. The import from `./lib.mjs` (L10 today): add `glassVars` to its names, for example `import { checkBudgets, checkPages, formatTable, glassVars } from './lib.mjs';` (keep whatever names part 1 added).

Directly before the line `function sh(cmd, cmdArgs) {` (after `VIEWPORTS`, which by then has part 1's `desktop2x`) insert:

```js
/** `--glass on|off` forces glass or solid panels at any width (inline on <html>), for an A/B of the blur's cost. */
const GLASS = opt('--glass') ? glassVars(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), opt('--glass')) : null;
/** `--twinkle on|off` switches the glints for the whole run, for an A/B of what they cost at rest. */
const TWINKLE = opt('--twinkle');
if (TWINKLE && TWINKLE !== 'on' && TWINKLE !== 'off') throw new Error(`--twinkle takes on or off, not ${TWINKLE}`);
/** `--names on|off` switches the region names for the whole run, for an A/B of what the names layer costs. */
const NAMES = opt('--names');
if (NAMES && NAMES !== 'on' && NAMES !== 'off') throw new Error(`--names takes on or off, not ${NAMES}`);
/** Applied after every full page load: the settings live in the page, so a navigation that reloads drops them. */
async function forceEffects(page) {
  if (GLASS) {
    await page.evaluate((vars) => {
      for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
    }, GLASS);
  }
  if (NAMES) {
    // The app store's own setter (the names button calls the same one).
    await page.waitForFunction(() => !!window.__rmr?.getState, null, { timeout: 30000 });
    await page.evaluate((on) => window.__rmr.getState().setNamesOn(on), NAMES === 'on');
  }
  if (TWINKLE) {
    // The switch is the app store's twinkleOn (part 2); the twinkle driver reads it when it mounts and follows it
    // afterwards. window.__rmr.twinkle holds only the counters and arrives with the map, after first paint. On and
    // off both wait for it, so the two runs of a pair do the same things in the same order.
    await page.waitForFunction(() => !!window.__rmr?.twinkle, null, { timeout: 30000 });
    await page.evaluate((on) => window.__rmr.getState().setTwinkleOn(on), TWINKLE === 'on');
  }
}
```

In `exploreFlow`, directly after the line `  await page.goto(`${BASE}/map`, { waitUntil: 'load' });` insert: `  await forceEffects(page);`

In `measure`, directly after the line `  await page.goto(`${BASE}/`, { waitUntil: 'load' });` insert: `  await forceEffects(page);`

Each of the two `goto` lines is in the file once. If part 1's `--no-gas` or its deep zoom measures added another full page load, add the same call after it. `--glass`, `--twinkle` and `--names` do not read or change `--no-gas`, and the four flags can be combined.

(The album flow reaches the album by an in-page navigation from `/`, so the settings stay; `AlbumPanel.tsx` sets `--acc` on the same element the same way.)

Create `frontcreck/scripts/perf/compare.mjs`:

```js
#!/usr/bin/env node
/** Applies the perf rule to two sets of `npm run perf` runs. For every measure it prints the median of the runs in
 * <currentDir> beside its budget and beside the median and the min to max of the runs in <baselineDir>, and marks a
 * median over its budget and a median above the worst baseline run. It also prints the sizes of every run and every
 * single run that missed a budget. Each directory holds perf-*.json files as perf.mjs writes them
 * ({ js: { kb, modernKb, threeKb, files }, rows: [...], fails: [...] }).
 * Files named perf-dpr2-*.json are the runs made only for the `gpu desktop2x` column (the baseline has three): only
 * their desktop2x rows are used, and they are left out of the size lines, so they never add to another column.
 * The dpr 2 column and the deep zoom rows have no budget; the 50 ms frame gap is their yardstick, named as such.
 * Usage: node scripts/perf/compare.mjs <baselineDir> <currentDir> */
import fs from 'node:fs';
import path from 'node:path';
import { compareRuns, summarise } from './lib.mjs';

const [baseDir, curDir] = process.argv.slice(2);
if (!baseDir || !curDir) {
  console.error('usage: node scripts/perf/compare.mjs <baselineDir> <currentDir>');
  process.exit(2);
}
const BUDGETS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'budgets.json'), 'utf8'));
/** Measures with a budget of their own name, and the frame gaps, which share one budget and are judged in the
 * budgeted GPU columns only (not in software, not in the reported only dpr 2 column). */
const DIRECT = ['searchUsableMs', 'startupLongTaskMs', 'typeToSuggestionsMs', 'selectToAlbumMs', 'sliderToListMs', 'idleLongTasks', 'idleFrames'];
const GAPS = ['transitionGapMs', 'morphGapMs', 'dragGapMs', 'zoomGapMs'];
const DEEP_GAPS = ['deepDragGapMs', 'deepMorphGapMs'];
const DPR2 = 'gpu desktop2x';
const budgetOf = (where, key) => {
  if (where === DPR2) return null;
  if (DIRECT.includes(key)) return BUDGETS[key];
  return GAPS.includes(key) && where.startsWith('gpu ') ? BUDGETS.frameGapMs : null;
};
/** Not a budget: what a frame gap is held against where none applies (every gap of the dpr 2 column, and the deep
 * zoom gaps of every GPU column). */
const yardstickOf = (where, key) => {
  if (!where.startsWith('gpu ')) return null;
  if (DEEP_GAPS.includes(key)) return BUDGETS.frameGapMs;
  return where === DPR2 && GAPS.includes(key) ? BUDGETS.frameGapMs : null;
};

const isDpr2File = (f) => /^perf-dpr2-/.test(f);
const load = (dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => /^perf-.*\.json$/.test(f))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
/** The rows a file contributes: all of them, or only the dpr 2 column of a file made for that column. */
const rowsOf = (r) => (isDpr2File(r.file) ? r.rows.filter((x) => `${x.mode} ${x.vp}` === DPR2) : r.rows);
const base = load(baseDir);
const cur = load(curDir);
const baseFull = base.filter((r) => !isDpr2File(r.file));
const curFull = cur.filter((r) => !isDpr2File(r.file));
if (!baseFull.length || !curFull.length) {
  console.error(`no full perf-*.json run in ${baseFull.length ? curDir : baseDir}`);
  process.exit(2);
}
const findings = [];
if (curFull.length !== 3) findings.push(`${curFull.length} full run(s) in ${curDir}: the rule is about three`);

const list = (runs, f) => runs.map(f).join(', ');
console.log(`First-load JS of / (KB, per full run): baseline ${list(baseFull, (r) => r.js.kb)}; now ${list(curFull, (r) => r.js.kb)} (budget ${BUDGETS.firstLoadJsKb})`);
console.log(`three.js chunk in the first load (KB, per full run): baseline ${list(baseFull, (r) => r.js.threeKb)}; now ${list(curFull, (r) => r.js.threeKb)} (must be 0)\n`);
for (const r of curFull) {
  if (r.js.kb > BUDGETS.firstLoadJsKb) findings.push(`${r.file}: first-load JS ${r.js.kb} KB is over ${BUDGETS.firstLoadJsKb} KB`);
  if (r.js.threeKb > 0) findings.push(`${r.file}: the three.js chunk (${r.js.threeKb} KB) is in the first load`);
}

const rows = compareRuns(summarise(base.map(rowsOf)), summarise(cur.map(rowsOf)));
console.log('| Where | Measure | Budget | Baseline median (min to max) | Now, median | |\n|---|---|---|---|---|---|');
for (const r of rows) {
  const budget = budgetOf(r.where, r.key);
  const yardstick = budget === null ? yardstickOf(r.where, r.key) : null;
  const over = budget !== null && r.median > budget;
  const overYardstick = yardstick !== null && r.median > yardstick;
  if (over) findings.push(`${r.where} ${r.key}: median ${r.median} is over its budget of ${budget}`);
  if (overYardstick) findings.push(`${r.where} ${r.key}: median ${r.median} is over the ${yardstick} ms yardstick (not a budget)`);
  if (r.worse) findings.push(`${r.where} ${r.key}: median ${r.median} is above the worst baseline run (${r.baseWorst})`);
  const mark = [over ? 'OVER BUDGET' : '', overYardstick ? 'OVER YARDSTICK' : '', r.worse ? 'WORSE' : ''].filter(Boolean).join(', ');
  const limit = budget !== null ? String(budget) : yardstick !== null ? `none (yardstick ${yardstick})` : 'none';
  const was = r.baseMedian === null ? 'no baseline' : `${r.baseMedian} (${r.baseBest} to ${r.baseWorst})`;
  console.log(`| ${r.where} | ${r.key} | ${limit} | ${was} | ${r.median} | ${mark} |`);
}

console.log('\nSingle runs over budget (each is named and explained in the write-up):');
const single = cur.flatMap((r) => r.fails.map((f) => `${r.file}: ${f}`));
console.log(single.length ? single.join('\n') : 'none');
console.log(findings.length ? `\nFindings (${findings.length}):\n${findings.join('\n')}` : '\nNo median is over its budget, over the yardstick or above the worst baseline run.');
```

How it reads the baseline folder, which now holds six files. `perf-run1.json` to `perf-run3.json` are the three full runs of today's site with the four old columns; `perf-dpr2-run1.json` to `perf-dpr2-run3.json` are part 1's runs for the dpr 2 column. `summarise` groups by `mode vp`, so the two sets cannot mix: the four old columns get three values each from the first three files, `gpu desktop2x` gets three from the dpr 2 files (and, should a dpr 2 file also hold other columns, those rows are dropped by `rowsOf`, so no column ends up with six). The size lines list the three full runs only. A measure the baseline does not have for a column (the three gas rows wherever today's site was not measured for them) is printed with "no baseline" and judged against its yardstick alone.

- [ ] **Step 4: Commit the tools**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- scripts/perf/lib.test.mjs && npm run lint)`
Expected: both pass.

```bash
git add frontcreck/scripts/perf/lib.mjs frontcreck/scripts/perf/lib.test.mjs frontcreck/scripts/perf/perf.mjs frontcreck/scripts/perf/compare.mjs
git commit -m "chore(perf): flags to force glass, twinkle and names on or off, and a comparison with the baseline runs

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

- [ ] **Step 5: Three full runs, the way the baseline was run**

`BASELINE-PERF.md` records how the baseline was taken: a production build, `npm run perf` with no flags three times in a row (each run does software desktop, software phone, gpu desktop, gpu phone, one browser at a time), no `nice`. Since part 1 a run has a fifth column after those four, `gpu desktop2x` (1440 x 900 at device pixel ratio 2, reported only), whose baseline is the three `perf-dpr2-run*.json` files part 1 made. Do the same, when nothing else heavy is running (after midnight if the laptop is busy by day):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
node -p process.arch   # must print arm64; an x64 Node under Rosetta inflates every timing about 50x
mkdir -p docs/design/trifid-theme/reviews/after/perf
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run build)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && for i in 1 2 3; do npm run perf > ../docs/design/trifid-theme/reviews/after/perf/perf-run$i.txt 2>&1; cp "$(ls -t scripts/perf/out/perf-*.json | head -1)" ../docs/design/trifid-theme/reviews/after/perf/perf-run$i.json; sleep 20; done)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node scripts/perf/compare.mjs ../docs/design/trifid-theme/reviews/baseline/perf ../docs/design/trifid-theme/reviews/after/perf)
```

The loop is one job: its three runs follow each other. A run exits 1 when it misses a budget; the loop goes on, and the miss is in that run's `.txt` and in the `fails` list of its JSON. The numbers and their limits (`budgets.json`, unchanged):

| Printed row (JSON key) | Limit | Checked in |
|---|---|---|
| First-load JS of / (`js.kb`) | 200 KB (baseline 190.5 KB) | every run |
| three.js chunk in the first load (`js.threeKb`) | 0 KB (baseline 0) | every run |
| Server HTML per page | 150 KB | every run |
| Search usable (`searchUsableMs`) | 1000 ms | every run |
| Startup worst long task (`startupLongTaskMs`) | 250 ms | every run |
| Typing to suggestions (`typeToSuggestionsMs`) | 100 ms | every run |
| Select to album (`selectToAlbumMs`) | 200 ms | every run |
| Slider to list (`sliderToListMs`) | 150 ms | every run |
| Long tasks while idle (`idleLongTasks`) | 0 | every run |
| Frames rendered while idle, 3 s (`idleFrames`) | 1 | every run |
| Transition, morph, drag, zoom worst frame gap (`transitionGapMs`, `morphGapMs`, `dragGapMs`, `zoomGapMs`) | 50 ms | GPU runs only; printed but not judged in software runs |

Part 1 adds three printed rows that have no budget: the deep zoom drag gap (`deepDragGapMs`), the deep zoom morph gap (`deepMorphGapMs`, the slider between stops in deep zoom) and the time until the nebula is visible (`gasShownMs`). `compare.mjs` prints all three for every column, beside the baseline where part 1 measured today's site for them and with "no baseline" where it did not, and holds the two deep zoom gaps of every GPU column against the 50 ms yardstick. Set them in the write-up next to part 1's and part 2's own numbers (`docs/design/trifid-theme/reviews/app-perf-part1.md`, `app-perf-part2.md`). A deep zoom gap over the yardstick is a finding like any other, with part 1's first cheaper version for deep zoom as the answer. `gasShownMs` has no yardstick: report it, and treat a median above part 1's own number for it as a finding.

The fifth column, `gpu desktop2x`, is reported only: it is never passed to `checkBudgets`, a run does not fail on it, and `budgets.json` has nothing for it. It is still judged here. Blur and gas both cost by the pixel, and a dpr 2 screen has four times the pixels, so this column is where the theme is most likely to cost speed on the owner's own laptop. Its yardstick for the four frame gaps is the same 50 ms, named a yardstick and not a budget; `compare.mjs` marks a median over it `OVER YARDSTICK` and a median above the worst of the three dpr 2 baseline runs `WORSE`. Both are findings.

One thing to know when reading the album flow's rows (transition, slider to list, morph): that flow leaves Home by an in-page navigation, and part 1 loads the other two stops' gas at idle once the map is interactive, so those images may arrive while the transition or the morph is being measured. That is what a visitor gets and it is measured on purpose. If one of those rows is a finding, look at when the two gas images arrived in that run's network log (or repeat the column with the two requests held back by hand): if the row is fine without them arriving, the cause is the gas arriving, and the answer is part 1's (later or smaller loads), not a wait added to the script.

Reading the result, by the rule above. Run `npm run perf` three times, one after another. Each measure is judged on the median of the three runs: the median must be inside its budget, and it is compared with the baseline's median and min to max in `BASELINE-PERF.md`. A median above the baseline's worst run is a finding even when it is inside budget. Any single run over budget is named and explained in the write-up (the baseline has three such single run outliers). In `compare.mjs`'s output that is:

- A row marked `OVER BUDGET`: the median of the three runs is over its budget. A finding; it is fixed, not explained away.
- A row marked `OVER YARDSTICK`: a frame gap of the dpr 2 column, or a deep zoom gap of a GPU column, whose median is over 50 ms. No budget applies to it, and it is a finding all the same: take the cheaper version of whichever effect causes it (Steps 6 to 8), without asking.
- A row marked `WORSE`: the median is above the worst of the three baseline runs. A finding even inside budget, to fix or to explain in the write-up with its cause. This applies to software rows too: software frame gaps have no budget, but a software gap that grew is still the theme costing time.
- The list "Single runs over budget": each one is named in the write-up with the other two values beside it and what was running at the time.
- Sizes. First-load JS is compared with the baseline's 190.5 KB: any growth is reported with the files that grew (the `js.files` list of the JSON beside the baseline's), and over 200 KB is a miss. The three.js chunk must stay out of the first load (0 KB). Part 3 itself adds almost nothing to the first load (see "Where the new code loads" in the Self-review).
- `idleFrames` above 0 in any run is looked at even though the budget is 1: the baseline is 0 everywhere, and something redrawing the canvas at rest is what the twinkle must never do.

Find the cause of a finding with the superpowers:systematic-debugging skill and the A/B runs of the next three steps. Never change `budgets.json`.

- [ ] **Step 6: What the glass costs over a live canvas, the header's blur included (on against off), one run at a time**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop --glass off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone --glass off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop2x --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop2x --glass off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport desktop --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport desktop --glass off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport phone --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport phone --glass off)
```

After each run copy its JSON beside the others with the pair's name, for example `cp "$(ls -t frontcreck/scripts/perf/out/perf-*.json | head -1)" docs/design/trifid-theme/reviews/after/perf/glass-gpu-desktop-on.json`. Compare, on against off, in each pair: `dragGapMs` and `zoomGapMs` (the map now moves under the header as well as under the slider panel and the zoom buttons), `transitionGapMs` (the album panel, the largest glass surface, slides in over the map), `morphGapMs`, and `idleFrames` (must be equal: glass must not cause a redraw). Where a pair is within 5 ms, run it once more before believing a difference. Deciding:

- GPU desktop, glass on, every gap at or under 50 ms and not `WORSE` in Step 5: desktop glass ships as it is.
- GPU desktop, a gap that is over 50 ms or `WORSE` with glass on and fine with glass off: the blur is the cause. Take the cheaper version without asking, in this order, rerunning the pair after each: (1) `blur(22px)` becomes `blur(14px)` in `--glass-blur` (also in the regex of `contrast.test.ts` and the constant in `glass.spec.ts`; the contrast numbers do not depend on the radius); (2) the header alone goes solid on the map and the album, which takes the header's blur off the moving map (`.top:not(.top--home) { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(10, 9, 14, 1); }` after the glass rule in `shell.css`, with `'header.top'` expecting the solid values in `e2e/glass.spec.ts` and the "Home header stays clear" test of `glass.test.ts` extended to pin the new line): it is the one glass surface with the whole moving map behind it; (3) all desktop glass off, by adding `@media (min-width: 900px)` to the list of solid blocks. Record which step was taken and both sets of numbers.
- GPU desktop at dpr 2 (`desktop2x`; `--mode gpu --viewport desktop2x` runs that one column, as part 1 defines the viewport), glass on against off: the blur works on four times the pixels here, so this pair decides as much as the dpr 1 pair. A gap over the 50 ms yardstick, or `WORSE` against the dpr 2 baseline, with glass on and fine with glass off: the same three cheaper versions in the same order, rerunning both desktop pairs after each. They apply at every pixel ratio; no rule is made for dpr 2 alone, since CSS cannot tell a fast dpr 2 screen from a slow one. If the pair is as slow with glass off, the cause is under the glass: the gas (part 1's cheaper versions, in its order: its Task 6 gives them) or the stars (Step 8).
- GPU phone (emulated 390 x 844 at 2x), glass on against off: this is one of the two things the owner asked for before phone glass may be switched on. It never switches it on by itself; the owner's trial on his own phone (Task 11) is the other. A phone pair in which glass on is slower settles it the other way: phone glass stays off, and the write-up says so.
- Software pairs are for the comparison with the baseline's software rows, and SwiftShader exaggerates the blur: read them as a direction, not as a size.

- [ ] **Step 7: What the twinkle costs (on against off), and the first hover**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop --twinkle on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop --twinkle off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone --twinkle on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone --twinkle off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport desktop --twinkle on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport desktop --twinkle off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport phone --twinkle on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode software --viewport phone --twinkle off)
```

Copy each JSON as `twinkle-<mode>-<viewport>-<on|off>.json`. The glints only start while the map is at rest, so what they can cost shows in the idle window and in whatever comes right after it: `idleLongTasks` (must be 0 in both), `idleFrames` (must be equal and at most 1: a glint must never redraw the canvas), and, with glass on, the blur of any panel a glint sits behind. The drag, zoom and morph gaps must be equal within noise, since no glint is alive while the map moves. Then part 2's own measurement, again, on this final build (desktop has glass on now, which part 2's run did not have): `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node scripts/perf/twinkle-cost.mjs)`. It prints its table, saves `scripts/perf/out/twinkle-cost-<time>.json` (copy it to `after/perf/`) and exits 1 when one of its rules is broken. If twinkle on shows an idle long task, an extra idle frame, a gap that off does not, or a broken rule of `twinkle-cost.mjs`, take the cheaper version without asking, in the order part 2's twinkle task gives (no flares first, then fewer glints), measure again, and if that still costs, switch the twinkle off (part 2's task says how). Say which was taken.

Then the first hover, with the baseline's own tool (desktop only; five fresh loads per mode; it starts its own server on port 3500):

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs ../docs/design/trifid-theme/reviews/after/perf/hover.json http://127.0.0.1:3500 --start > ../docs/design/trifid-theme/reviews/after/perf/hover.txt 2>&1; tail -n 12 ../docs/design/trifid-theme/reviews/after/perf/hover.txt)
```

The prototype showed tasks of about 100 ms on the first hover; the app must not. Compare `after/perf/hover.json` with `baseline/perf/hover.json`, per mode and per hover (first, second, third), on `tipMs`, `longTaskMs` and `frameGapMs`. Findings:

- The first hover's `longTaskMs` median above 0 in GPU mode (the baseline's is 0, with one load of five at 55 ms), or any load at 100 ms or more.
- `tipMs` median of any hover above the baseline's maximum for that hover (GPU first hover: median 150.3 ms, maximum 169.3 ms at the time of writing).
- `frameGapMs` median above the baseline's maximum for that hover.

The hover label is a glass surface, so its first appearance makes the browser build a blurred layer. If the first hover is a finding and Step 6's numbers point at the blur, the cheaper version is to take `.map-tip` out of the glass rule in `shell.css` and give it the solid colour (`.map-tip { background: rgba(10, 9, 14, 1); }` after the rule, with `.map-tip` removed from the rule and from the expected list in `glass.test.ts`); measure again. If the cause is a first-use shader or texture upload (the hover mark), it belongs to part 2: report it there with the trace.

- [ ] **Step 8: What the names cost (on against off), and the stars' glow**

The names layer places lettering while the camera moves and the slider morphs, so its cost is in the moving measures:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop --names on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop --names off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone --names on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone --names off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop2x --names on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop2x --names off)
```

Copy each JSON as `names-gpu-<viewport>-<on|off>.json`. In the dpr 2 pair the yardstick is 50 ms, as in Step 5. Compare `dragGapMs`, `zoomGapMs` and `morphGapMs` (the names fade between stops during the morph), and `idleFrames` (must be equal: names must not cause a redraw). Where a pair is within 5 ms, run it once more before believing a difference. If names on shows a gap over 50 ms, or a gap that is `WORSE` in Step 5 and fine with names off, the names are the cause. The cheaper versions are part 2's own, in the order its last task gives them (its Task 9 step 7, the table "which effect, and the cheaper version of each"), taken without asking: first no font size change while zooming (`zoomK: 1` in the names driver, so only transforms are written), then the lighter halo (three shadows in `.rn b`), and for a slow morph on the map the fade written as `opacity` on the `.rn` element. If part 2 already took one, take the next. If none is enough, stop and report the numbers: hiding the names while the map moves would need the driver to ask for a frame to bring them back, which it must not do, and starting with names off changes what the owner approved, so both are his to decide. Measure again after each and say which was taken.

The stars' glow has no switch: it is in the album shader (part 2), and the gas is one more textured layer under it (part 1). What the two cost together is what is left when everything with a switch is off:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop --glass off --twinkle off --names off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport phone --glass off --twinkle off --names off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run perf -- --mode gpu --viewport desktop2x --glass off --twinkle off --names off)
```

The gas has no switch either: part 1's `--no-gas` only skips the wait for the gas layer so that the script can measure a site without one; it does not turn the gas off. At dpr 2 the gas is the number to watch, since it fills every pixel of the canvas.

Copy each JSON as `stars-gas-gpu-<viewport>.json` and set `dragGapMs`, `zoomGapMs`, `morphGapMs`, `transitionGapMs`, the deep zoom gaps and the idle rows beside the baseline's medians for the same column. A gap here that is over 50 ms (budget or yardstick) or above the worst baseline run belongs to the gas or the stars. Tell them apart with part 1's and part 2's own write-ups (`app-perf-part1.md`, measured before the stars existed, and `app-perf-part2.md`). The cheaper versions, taken without asking, are theirs: for the gas, the order part 1 gives in its last task; for the glow, the two steps of part 2's Task 9 step 7 table in its order (no wide halos, `haloT = 0.0` in `shaders/album.ts`; then no under-disc), each with the shader test it names. Measure again after each and say which was taken.

- [ ] **Step 9: Write `docs/design/trifid-theme/reviews/app-perf-part3.md`**

Write it from the files of Steps 5 to 8, with these sections and nothing invented: (1) the commit, date and time, machine, what else was running, Node and Chrome versions, as `BASELINE-PERF.md` gives them for the baseline; (2) sizes: first-load JS (with and without nomodule scripts), the three.js chunk in the first load and server HTML, baseline against now, with the files that grew; (3) the comparison table printed by `compare.mjs`, whole, all five columns, with the dpr 2 column and the three gas rows marked as reported only and held against the 50 ms yardstick, not a budget; (4) budget results per run, as the baseline lists its own, each single run over budget named and explained; (5) glass on against off, one table of the ten runs (the dpr 2 pair included) with the five measures of Step 6; (6) twinkle on against off, one table of the eight runs with `idleLongTasks`, `idleFrames` and the four gaps; (7) names on against off, one table of the six runs, and the runs with everything switched off, with and without the gas, beside the baseline; (8) the first hover, baseline against now, per mode and hover; (9) findings, each with its cause and what was done; (10) effects dropped or made cheaper for speed, or "none"; (11) what was not measured: a real phone, Safari, a machine with a weaker GPU, and the GPU memory the gas textures take (no tool here reads it; part 1 states the sizes of the three images). Plain prose and tables, no dashes, no emoji.

- [ ] **Step 10: Commit the measurements**

```bash
git add docs/design/trifid-theme/reviews/after/perf docs/design/trifid-theme/reviews/app-perf-part3.md
git commit -m "docs(design): Trifid theme speed against the baseline, with glass, twinkle and names on and off

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

If Step 6, 7 or 8 changed code (a cheaper version), that change is its own commit before this one, with the unit and browser checks it touches rerun, and Step 5 is run again on the result: the write-up describes what ships.

---

### Task 10: The review rounds before the owner sees anything

Everything is assembled (parts 1 to 3, Tasks 1 to 9). This task proves the suite green, captures every baseline state again with the baseline's own script, puts the result in front of six separate reviewers, fixes what they find, and repeats until one round comes back clean. The owner sees the work only after that.

**Files:**
- Modify: `frontcreck/scripts/review-shots.mjs` L14-18 (`SIZES`), L22-94 (`STATES`)
- Create: `docs/design/trifid-theme/reviews/after/shots/` (written by the baseline capture script)
- Create: `docs/design/trifid-theme/reviews/app-fidelity-part3.md`, `app-craft.md`, `app-first-visit.md`, `app-phone.md`, `app-accessibility.md`, `app-states.md`, `app-regression.md` (the reviewers' notes)
- Output only (git-ignored): `frontcreck/test-results/review/*.png`

**Interfaces:**
- Consumes: the finished app; `docs/design/trifid-theme/reviews/baseline/` (`capture.mjs`, `shots/`, `REGRESSION-CHECKLIST.md`, `BASELINE-PERF.md`, `README.md`); `docs/design/trifid-theme/reviews/app-perf-part3.md` (Task 9); the approved pictures in `docs/design/trifid-theme/options/`. From part 2: the names preference key `rmr-names`, the layer `.tw-layer` with `.tw` glints.
- Produces: the review notes under `docs/design/trifid-theme/reviews/app-*.md`, and the after-shots beside the baseline.

- [ ] **Step 1: The gate: everything green, one job at a time**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test && npm run typecheck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=nowebgl --workers=1)
```

Expected: all pass, with no test skipped that was not skipped before this part (the skips are by project: phone only, desktop only). Nothing goes to a reviewer while anything is red. A red test is fixed in the code; it is never loosened, skipped or deleted to get through this gate.

- [ ] **Step 2: Add the states the baseline cannot have to `frontcreck/scripts/review-shots.mjs`**

The baseline script captures the states the current site has. The theme adds some of its own (names off, a glint, the brightest gas behind the header, the ring on the brightest gas), and the approved pictures are 1600 x 1000.

In `SIZES` (L14-18), after the `d1280` line insert:

```js
  d1600: { viewport: { width: 1600, height: 1000 } },
```

Replace the first entry of `STATES` (L23), `  'a1-home': async (p) => p.goto(`${BASE}/`),`, with (the Home shot is compared with `final-home.jpg`, so it must wait for the gas):

```js
  'a1-home': async (p) => {
    await p.goto(`${BASE}/`);
    await mapReady(p);
  },
```

After the `'c3-explore-zoomed'` entry (ends at L60) insert:

```js
  // The whole map, zoomed out to the floor (docs/design/trifid-theme/options/final-whole.jpg).
  'c4-explore-whole': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.evaluate(() => window.__rmr.map.zoomBy(1 / 1.6));
  },
  'c5-explore-names-off': async (p) => {
    await p.addInitScript(() => window.localStorage.setItem('rmr-names', '0'));
    await p.goto(`${BASE}/map`);
    await mapReady(p);
  },
  // A still from the middle of the Balanced to Mood move (the morph takes 520 ms).
  'c6-explore-slider-mid': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.evaluate(() => window.__rmr.getState().setStop('mood'));
    await p.waitForTimeout(220);
    return 'now';
  },
  'c7-explore-names-focus': async (p, size) => {
    if (size === 'm390') return false;
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.keyboard.press('Tab');
    await p.locator('.map-names').focus();
  },
  // The brightest gas of the Balanced stop slid behind the header's wordmark: the header's worst case in a picture.
  'c8-explore-header-bright': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.waitForFunction(() => !window.__rmr.map.isAnimating(), null, { timeout: 15000 });
    await p.evaluate(async () => {
      const theme = await (await fetch('/data/theme/theme.json')).json();
      let best = 0;
      for (let i = 1; i < theme.n; i++) if (theme.stars.bg[3 * i + 1] > theme.stars.bg[3 * best + 1]) best = i;
      const api = window.__rmr.map;
      const mark = document.querySelector('.wordmark').getBoundingClientRect();
      const target = { x: mark.x + mark.width / 2, y: mark.y + mark.height / 2 };
      // panBy's direction is checked, not assumed: a second try mirrors it.
      for (const sign of [1, -1]) {
        const at = api.screenPoint(best);
        if (Math.hypot(at.x - target.x, at.y - target.y) < 2) break;
        api.panBy(sign * (at.x - target.x), sign * (target.y - at.y));
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    return 'now';
  },
  // The selected ring on the album that stands on the brightest gas (dots, so the DOM ring marks it).
  'c9-explore-ring-bright': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.waitForFunction(() => !window.__rmr.map.isAnimating(), null, { timeout: 15000 });
    await p.evaluate(async () => {
      const theme = await (await fetch('/data/theme/theme.json')).json();
      let best = 0;
      for (let i = 1; i < theme.n; i++) if (theme.stars.bg[3 * i + 1] > theme.stars.bg[3 * best + 1]) best = i;
      window.__rmr.getState().setSelected(best);
    });
  },
  // The map at rest with a glint alive. A still shows where a glint sits and how large it is, not how it moves.
  'c10-explore-glint': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.waitForSelector('.tw-layer .tw', { state: 'attached', timeout: 15000 });
    await p.waitForTimeout(500);
    return 'now';
  },
```

After the `'d5-album-longtitle'` entry (L69) insert (it waits for the map, so the gas is in the picture):

```js
  // The album of the approved pictures (final-album.jpg, final-phone-map.jpg).
  'd6-album-reference': async (p) => {
    await p.goto(`${BASE}/album/the-stone-roses-the-stone-roses`);
    await mapReady(p);
  },
```

After the `'h1-album-mapmode'` entry (ends at L93) insert:

```js
  'h2-reference-mapmode': async (p, size) => {
    if (size !== 'm390') return false;
    await p.goto(`${BASE}/album/the-stone-roses-the-stone-roses`);
    await mapReady(p);
    await p.locator('.fab-map').tap();
    // Map mode makes the map interactive, which starts the other two stops' gas: wait for it again.
    await mapReady(p);
  },
```

Commit:

```bash
git add frontcreck/scripts/review-shots.mjs
git commit -m "chore(shots): the states of the approved Trifid pictures at their size, and the theme's own states

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

- [ ] **Step 3: Capture every baseline state again, with the baseline's script**

Same script, same mode (GPU), same sizes as the baseline; a new output directory, never the baseline's. One browser at a time; a full run takes about four minutes.

First, one line of the baseline's script. Part 2 edited this script before (its `--still` option); this edit is to a different line and does not touch that option. Its `hover-map-edge` state slides an album to 24 px under the top edge of the canvas, and the canvas's top edge has moved from the header's bottom to the top of the window (Task 3), so unchanged it would slide the album under the header, where nothing can be hovered. `docs/design/trifid-theme/reviews/baseline/capture.mjs`, in the `hover-map-edge` part of the hover state (L380 before part 2's edit; find it by its text), before:

```js
        const top = document.querySelector('canvas.map-canvas').getBoundingClientRect().top;
```

after:

```js
        const top = document.querySelector('#stage').getBoundingClientRect().top;
```

The stage's top is the header's bottom edge, the pixel the canvas's top was at when the baseline was taken, so the state is the one the baseline has. Nothing else in the script is touched (its header asks for changes in `SEL` only; this is not a renamed class, so it is said here and in the commit). Commit it alone:

```bash
git add docs/design/trifid-theme/reviews/baseline/capture.mjs
git commit -m "fix(baseline): the edge hover state reads the stage's top, where the canvas used to start

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

Then capture:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run build && node ../docs/design/trifid-theme/reviews/baseline/capture.mjs ../docs/design/trifid-theme/reviews/after/shots http://127.0.0.1:3400 --start --still)
```

`--still` is the option part 2 added to this script in its last task: a fixed star seed (`window.__rmr.starSeed`), the glints switched off after every navigation, and a wait for `window.__rmr.gas` to be `'ready'` or `'off'`. Every capture with this script in this part uses it, the re-captures after a fix included, so no glint is in any after picture, the stars have the same sizes in every after picture, and no picture is taken before its gas has arrived. If the script does not know `--still`, part 2's last task is not on the branch: stop and report, do not capture without it.

Expected: `after/shots/desktop/` and `after/shots/phone/` hold the same file names as `baseline/shots/desktop/` and `baseline/shots/phone/` (120 and 66 pictures), with `capture-log-desktop.json` and `capture-log-phone.json` beside them, and no `FAILED-<state>.jpg`. Check the names: `diff <(cd docs/design/trifid-theme/reviews/baseline/shots && find desktop phone -type f | sort) <(cd docs/design/trifid-theme/reviews/after/shots && find desktop phone -type f | sort)` must print nothing. This part renames no class the script uses: every selector of `SEL` at its top still exists (checked one by one), and the two things this part takes away, `.grain` and the map's `.map-amb`, are not in `SEL`, and neither is `.map-sel`. If a state failed because part 1 or 2 renamed a class, change it in `SEL` only, as the script's header says, and capture that state again with `--only <state>`. The camera zoom recorded in `after/shots/capture-log-*.json` is smaller than the baseline's by the factor 836/900 on desktop and 784/844 on the phone: the canvas is taller by the header (64 px, 60 px on the phone, Task 3), and positions on screen are what must match. One crop is framed differently by construction: `focus-map-canvas-crop` starts at the top left corner of the focused canvas, which is now the corner of the window, so it shows the header's corner with the ring's corner below it instead of the ring's corner alone; the reviewers of Steps 5 and 6 are told.

Then the theme's own states and the pictures to set beside the approved ones, one command at a time (each shoots one state; the argument is a substring filter):

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-a1-home)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c1-explore)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c2-explore-card)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c3-explore-zoomed)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c4-explore-whole)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c5-explore-names-off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c6-explore-slider-mid)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c7-explore-names-focus)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c8-explore-header-bright)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c9-explore-ring-bright)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c10-explore-glint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-d6-album-reference)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-f1-about)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-a1-home)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-c1-explore)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-c2-explore-card)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-c8-explore-header-bright)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-c10-explore-glint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-d6-album-reference)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-h2-reference-mapmode)
```

Expected: each prints `wrote test-results/review/<name>.png`: twenty pictures in `frontcreck/test-results/review/`. The Playwright runs of Step 1 also left `frontcreck/test-results/shots/desktop-focus.png` (an open album with a hot marker's lines), `desktop-explore-hover.png` (the hover mark and label), `desktop-explore-selected-cover.png` (a picked cover) and `phone-album-list.png` (the list with the strip). The favicon is `frontcreck/src/app/apple-icon.png` and `frontcreck/src/app/icon.svg`.

- [ ] **Step 4: Fidelity check of this part against the approved pictures (one reviewer, no browser)**

Dispatch one fresh subagent (it must not have worked on parts 1 to 3) with only this brief and the ten file paths. It opens the images one at a time with the Read tool and starts no browser:

> Compare each app screenshot with the approved picture beside it. Pairs: `frontcreck/test-results/review/d1600-c1-explore.png` and `docs/design/trifid-theme/options/final-overview.jpg`; `d1600-c4-explore-whole.png` and `final-whole.jpg`; `d1600-d6-album-reference.png` and `final-album.jpg`; `d1600-a1-home.png` and `final-home.jpg`; `m390-h2-reference-mapmode.png` and `final-phone-map.jpg`. For each pair list every visible difference in: the gas (colours, swirl, brightness, where it is dim, whether it runs behind the top bar), the stars, the region names (face, size, spacing, which are shown), the lines and frames, each panel (how see-through, how dark, its border), the type and the layout. Mark each difference as "worse than approved", "equal" or "an intended difference" using this list of intended differences, and nothing else: (1) no PROTOTYPE tab; (2) on the phone the panels are solid, not see-through, and the slider keeps the site's track with three stops instead of the prototype's three buttons; (3) the Home search field is slightly darker; (4) the map hint line sits on a soft dark band at the bottom left; (5) no region name beside an open album, and none once covers show; (6) star sizes are drawn at random on each load, so which star is large differs. Then check by eye that every label and line of text is readable where it sits, and say where it is not. Do not judge code. Report as a list per pair, worst first.

Fix every "worse than approved" item that belongs to this part (panels, header, hint, Home, About, strip, ring) with a new commit and reshoot that one state; pass the gas, star and name items to parts 1 and 2. Save the reviewer's final list as `docs/design/trifid-theme/reviews/app-fidelity-part3.md`.

- [ ] **Step 5: Five reviewers, one lens each, none seeing another's findings**

Dispatch five separate reviewer subagents. Each is fresh (it has not worked on parts 1 to 3), gets only its own lens brief below, the list of picture paths (the twenty of Step 3, the four of `test-results/shots/`, the favicon, and `after/shots/`), the approved pictures under `docs/design/trifid-theme/options/` (`final-overview.jpg`, `final-whole.jpg`, `final-album.jpg`, `final-home.jpg`, `final-phone-map.jpg`, `final-phone-list.jpg`, `toggle-b-on.jpg`, `toggle-b-off.jpg`, `q-header-under.jpg`, `q-twinkle.jpg`), the section "Decisions made on 2026-10-04" of `docs/superpowers/plans/2026-10-04-trifid-theme.md`, and read access to `frontcreck/src` and `frontcreck/e2e`. No reviewer is given another reviewer's file, the fidelity notes or the regression notes, and the briefs say so. Each opens images one at a time with the Read tool, starts no browser, build or test run, and writes its findings, worst first, each with the picture or the file and line it rests on, to its own file:

1. **Visual craft** (`docs/design/trifid-theme/reviews/app-craft.md`): spacing, alignment, type, the edges and borders of the glass, the header over the nebula (no hard line where the map used to start, no seam on Home), how the region names sit on the gas (size, tracking, halo), how stars, lines, frames, badges and the selected ring's casing are drawn, the favicon at small size, each against the `final-*.jpg` references.
2. **First visit** (`app-first-visit.md`): does the map read as "just a vibe" with nothing to decode? Is any explanatory UI creeping in: a legend, a hover or click on a name, a card, menu, pointer or search row for a region, anything about regions or colours on Home or About, any wording that explains the map beyond the site's existing hint line? Is anything on screen asking to be understood before the visitor can enjoy it?
3. **Phone** (`app-phone.md`): tap targets of 44 px, the strip in the album list, the site's own slider unchanged, the names button corner (nothing overlapping, nothing under the slider or the top row), at most four names, the panels and the header fully solid as decided for launch (nothing of the map showing through them), text sizes, what a thumb can reach.
4. **Accessibility** (`app-accessibility.md`): contrast of every text on glass over the brightest gas (the header in `c8`, the panels, from the pictures and from `src/lib/contrast.test.ts` and `e2e/glass.spec.ts`), text straight on the map (the hint, the names), the selected ring and the focus rings as marks at 3:1, keyboard paths to every control including the names button and the canvas, focus visibility on glass and on the map, reduced transparency and reduced motion (from the code and the tests: `globals.css`, `shell.css`, part 2's twinkle module), the labels of the names button, what is hidden from assistive technology.
5. **Interaction states** (`app-states.md`): hover, keyboard focus, an open album, the slider half way, zoomed in, a picked album among dots and among covers, names off, a glint alive. Is each state clear, is anything left over from another state, does anything read as broken?

- [ ] **Step 6: A sixth reviewer: regression against the baseline**

Dispatch one more fresh subagent, with: `docs/design/trifid-theme/reviews/baseline/README.md`, `REGRESSION-CHECKLIST.md`, `BASELINE-PERF.md`, the two shot folders (`baseline/shots/` and `after/shots/`, same file names; the after pictures were taken with the script's `--still` option), `docs/design/trifid-theme/reviews/app-perf-part3.md`, read access to `frontcreck/`, and this brief:

> The site was restyled. Your one question: did anything the old site got right get lost? (1) Go through `REGRESSION-CHECKLIST.md` item by item. For each, open the after picture it names beside the baseline picture of the same name (Read tool, one at a time), read the code it points at where a picture cannot show it, and mark it "kept", "lost" or "changed on purpose". "Changed on purpose" is only for this list: colours and tokens; gas behind the albums; albums drawn as stars; white cased lines and the cover layout beside an open album; region names and their toggle; glints; glass panels on wide screens; the map running behind the header; no film grain; the album's colour wash inside the panel only, not over the map; a lighter veil on Home with a pad behind the hero and a scrim behind the shelf; the hint on a dark band; the selected ring's dark casing; a dark casing under the keyboard focus ring of the controls that stand on the map (zoom and names buttons, "Explore this area", the phone's List button); the toast 28 px above the bottom safe area inset instead of 28 px above the bottom edge; the canvas's focus ring drawn 4 px inside the visible map by its container (and its crop `focus-map-canvas-crop` starting at the window's corner, so the header's corner is in it); the favicon; and these from part 2: the tiles of the cover cross-fade start from the album's star colour, not a cluster colour; the mark on a focus album's true position is a small hollow ring, not a dot; the hover mark has a dark casing; the badge sits 1 px further out, the marker's shadow is soft, the hot ring sits flush with the frame, and rings, lines and badges on the map no longer take the album's accent colour; an open album may be framed slightly further out; the names toggle is one more button and Tab stop above Zoom in on every map view (so `focus-zoom-button` shows the names toggle focused, since the script focuses the first button of the zoom corner); star sizes are random on each load on the site, but the after pictures were taken with `--still` (a fixed star seed, glints off, gas waited for), so the stars have the same sizes in every after picture, no glint is in any of them, and they differ from the baseline's dots by design; past 32 px covers the gas fades to a faint remnant. The full list with reasons is the section "Changed from today's site, for the owner to see" of `docs/superpowers/plans/2026-10-04-trifid-theme-3-chrome-tests.md`. Anything else that differs is "lost" until shown otherwise: say what, in which picture, and where in the code. Pay particular attention to how overlapping covers look on the map, to hover, and to the framing of every state (an album must sit where it sat: compare positions, not colours). The checklist's zoom numbers are for a canvas 836 px tall; the canvas is now 900 px tall (844 on the phone, where it was 784), so the same picture has a zoom number smaller by 836/900 (784/844): compare sizes on screen, not zoom numbers. (2) The checklist's manual probes. 46 items have a probe a person was meant to do by hand. 31 of them are yours, to settle from the after stills, the capture logs (`after/shots/capture-log-desktop.json`, `capture-log-phone.json`) or the code, with no browser; mark each "kept", "lost" or "changed on purpose" like the rest and say what you rested it on. Where the code an item points at is untouched by the restyle (`git diff origin/claude/wizardly-jennings-23d72e...HEAD -- <file>` shows no change in the lines it cites), that settles it as kept. By section and title: section 1, "One draw call; the later album paints over the earlier one." (same pairs, same cover on top in `map-covers-dense-crop`), "Depth layers: who is raised above the pile.", "Cross-fade band: covers are tinted and see-through between 16 and 32 px." (the tile colour changed on purpose, the band and its alpha did not), "An album whose sheet has not loaded stays a dot among covers." (now a star); section 2, "80 ms settle before the label and mark appear.", "Label placement and edge avoidance." (`hover-map-edge`; the top edge is now the header's bottom), "Label shows and hides at once (no fade), and is hidden when empty." (the glass rule must not have given `.map-tip` a transition), "No hover right after a click until the mouse moves 4 px.", "Hover follows the camera under a resting mouse.", "Cursor shape.", "The hover mark gets its own frame.", "Hover ends when the map stops taking input or the mouse leaves."; section 3, "Clicking the picked album again flies back to it.", "Reset with a card open goes to the picked album."; section 4, "Sheets load one at a time, the most visible first.", "A failed sheet does not block the rest.", "A sheet arriving draws a frame by itself."; section 7, "Older items are cut off with an ellipsis." (`trail-long`), "Toast call site 2: clipboard fallback, success or the link in words." (`toast-copy-failed`), "Toast call site 3: \"Surprise me\" when the albums did not load." (`toast-surprise-error`); section 9, "Map canvas focus ring is inset." (`focus-map-canvas`; changed on purpose as listed), "Clicking a slider stop name moves focus to the slider."; section 11, "In Explore a stop change never moves the camera." (the cameras of `map-overview`, `map-overview-sonic` and `map-overview-mood` in the capture log are equal); section 12, "Share metadata." (only `themeColor` changed); section 13, "Zoom limits." (the ceiling in the capture log of `map-max-zoom` is 28 times 836/900 on desktop and 28 times 784/844 on the phone, on purpose; the floor is 0.8 of the overview zoom), "The map draws only when something changes." (the idle rows of the perf write-up); section 14, "The list does not glide." (`rm-slider-sonic-60ms`); section 15, "Before the map data loads: a quiet empty pane.", "A lost WebGL context recovers, or gives way to the message after 3 s."; section 16, "The strip loads nothing on desktop." (the strip's gas and theme loads are behind the same narrow check as its data), "The Explore card is a bottom sheet resting on the slider panel." (phone `map-card-crop`). The other 15 need a hand on a real device or motion and are on the owner's checklist; list them as "with the owner", do not judge them. Three unit tests the checklist names were renamed by the restyle and are stricter, not gone: "reads the tokens from globals.css" is now "reads the tokens, the glass surfaces and the glass filter from globals.css"; "every text token passes 4.5:1 on every surface it is used on" is now "every text token passes 4.5:1 on every opaque surface" with three tests for glass and solid beside it; "every album accent passes 4.5:1 on the room colour" is now "every album accent passes 4.5:1 on the room colour, and 3:1 as a mark on the panels". (3) Compare `app-perf-part3.md` with `BASELINE-PERF.md`: list every number that got worse, in or out of budget, and whether the write-up explains it. Do not judge whether the new look is good. Start no browser, build or test run. Write to `docs/design/trifid-theme/reviews/app-regression.md`, lost items first.

- [ ] **Step 7: Fix, look again, repeat until a clean round**

Fix every finding that is a defect, a new commit per fix, in the part that owns the code. Speed comes first in every fix: a fix may not cost responsiveness (rerun the pair of Task 9 it touches). After a fix, reshoot the states it touches one at a time (`npm run shots -- <name>` or `capture.mjs ... --still --only <state>`), and send each fixed finding back to the reviewer who raised it for a second look, with the new picture; that reviewer appends "resolved" or what is still wrong to its own file. A reviewer still never sees another's file. A finding that is a design choice already made by the owner (the lists of intended differences in Steps 4 and 6, and the Decisions of 2026-10-04) is answered with the decision, not fixed. A finding that is a new design question is written into the pull request's "Questions for the owner". A "lost" item of Step 6 is always a defect.

A round is clean when none of the six has an open defect. After the last fix run the gate of Step 1 again; it must be green. Only then does the owner see the work. Commit the notes and the after-shots:

```bash
git add docs/design/trifid-theme/reviews/app-fidelity-part3.md docs/design/trifid-theme/reviews/app-craft.md docs/design/trifid-theme/reviews/app-first-visit.md docs/design/trifid-theme/reviews/app-phone.md docs/design/trifid-theme/reviews/app-accessibility.md docs/design/trifid-theme/reviews/app-states.md docs/design/trifid-theme/reviews/app-regression.md docs/design/trifid-theme/reviews/after/shots
git commit -m "docs(design): Trifid app review notes from six reviewers, and the after shots

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

The after pictures are committed, as the baseline's are (its 186 pictures and two capture logs are in the repository under `baseline/shots/`): the pull request then holds both sets under the same names.

**The checklist's manual probes all have an owner.** `REGRESSION-CHECKLIST.md` has 46 items whose Verify line carries a probe to do by hand (parts 1 and 2 route theirs here). 31 are settled by the regression reviewer from the after stills, the capture logs and the code, and are named in the brief of Step 6. The other 15 need a hand on a real device or motion and are on the owner's checklist in Task 11 Step 7 (its points 11 to 19): section 1 "Atlas filtering: trilinear with mipmaps, no anisotropy."; section 3 "The switch between ring and frame happens at half fade, and only with the sheet loaded." and "The card rises in on every pick."; section 5 "Markers appear only once placed."; section 11 "The thumb snaps; there are no in-between values." and "The list reorders with a glide (FLIP)."; section 12 "Back and Forward restore the stop of that history entry."; section 13 "A window resize refits only if you have not touched the map.", "Fling after a flick, none after a hold.", "Pinch zoom on touch, anchored between the fingers, with no fling after.", "Camera glides ease out, and zoom is interpolated on a log scale." and "Your own input always wins over a glide."; section 14 "Camera glides jump.", "No fling." and "Wheel zoom is immediate but still anchored at the cursor.". 31 and 15 are all 46; none is left without an owner. (The checklist's other 188 items are verified by a picture, a browser test, a unit test or a perf budget, and the reviewer goes through them as before.)

**What the reviewers cannot judge.** They see stills and code. They cannot judge motion in flight (pan, zoom, the slider morph, the panel sliding in, the name fades, the glints), and they cannot judge a real phone (touch, heat, the blur's cost) or Safari. Those need the owner on a preview build with the phone checklist of Task 11, whatever the six say. No one creates that preview here, and nothing is pushed here: Task 11 Step 5 stops and asks first.

---

### Task 11: Docs, the pull request, and the owner's trial

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md` after L128 and after L133
- Modify: `frontcreck/README.md` (one new section after "Map theme data")
- No file: pull request 47 (its body is replaced; no new pull request is opened), tracking issue 45 on the project board

**Interfaces:**
- Consumes: the results of Tasks 2, 3, 6, 9 and 10 (final numbers, the speed write-up, open review items); part 1's README text (its Task 3: the `npm run theme` row and the section "Map theme data").
- Produces: after the owner's yes to a push (Step 5), draft pull request 47 (`feat/trifid-theme` into `claude/wizardly-jennings-23d72e`, draft PR 32's branch) with a current body. The local branch may be named `trifid-build`; it tracks `origin/feat/trifid-theme`.

- [ ] **Step 1: Record the override in the design spec**

`docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md`: after the token table's last row (L128, `| \`--color-ochre\` | \`#c8a560\` | Map dots |`) insert a blank line and:

```markdown
Note, 2026-10-04: the table above is the original warm theme and is kept as the record of it. The Trifid theme keeps these token names and changes their values; the current values are in `frontcreck/src/app/globals.css`.
```

Directly after the line `- Never: pure black, blue-black, purple, neon, glassmorphism, starfields.` (L133) insert:

```markdown
- Exception, 2026-10-04: for the Trifid theme the owner knowingly set aside three items of the line above (blue-black, glassmorphism and starfields), and the film grain is removed. The decisions and the reasons are in `docs/design/trifid-theme/HANDOFF.md`, section "Current state: decisions made on 2026-10-04", and in `docs/superpowers/plans/2026-10-04-trifid-theme.md`, section "Decisions made on 2026-10-04".
```

Nothing else in the spec is rewritten.

- [ ] **Step 2: Check part 1's README text is there and still true, then add the theme section**

Part 1 documents `npm run theme` and the staleness guard in `frontcreck/README.md`. Verify, do not rewrite:

```bash
grep -n "npm run theme" frontcreck/README.md | head -5
grep -n "^## Map theme data" frontcreck/README.md
grep -c "was built for the committed albums and layouts (run npm run theme after either changes)" frontcreck/README.md frontcreck/src/lib/data/theme.data.test.ts
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node --input-type=module -e "import fs from 'node:fs'; const s = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts; if (!s.theme) throw new Error('no theme script'); console.log(s.theme)")
```

Expected: the Commands table has a `npm run theme` row; the section "Map theme data" exists; the guard test's name appears once in the README and once in the test file (the same words in both, so a reader who meets the failing test finds the README); `package.json` has a `theme` script and the README's row describes what that script does today. If one of the four is missing or out of date, that is part 1's Task 3 Step 12 not done or gone stale: fix the README there (same wording as part 1's plan) before going on. Read the section once against the code as it is now: every file and command it names must exist.

Then add this part's section. After the section "Map theme data" and before "## Deployment" insert:

```markdown
## Theme

The look is the Trifid nebula theme; the decisions behind it are in [`../docs/design/trifid-theme/HANDOFF.md`](../docs/design/trifid-theme/HANDOFF.md). The colour tokens are in `src/app/globals.css`.

Panels over the map are see-through glass on wide screens. On phones, in browsers without `backdrop-filter`, and when the system asks for reduced transparency, they are fully solid instead: three one-line rules next to the tokens do this. The first of them is the phone glass switch: removing that one line gives phones glass.

The map canvas starts at the top of the window, behind the header, and the header is glass over it. The camera knows the header's height as `MapInput.insetTop` (`HEADER_PX`, and `HEADER_NARROW_PX` under 900 px wide, in `src/components/map/types.ts`: the two values of `--hdr`), so albums are framed in the area below the header. `e2e/framing.spec.ts` holds every framing to positions recorded before that change (`e2e/fixtures/framing-baseline.json`); do not record that file again.

`npm run perf -- --glass on` and `--glass off` force glass or solid panels, `--twinkle on` and `--twinkle off` the glints, and `--names on` and `--names off` the region names, to measure what each costs. `node scripts/perf/compare.mjs <baselineDir> <currentDir>` sets a set of runs beside another. `src/lib/contrast.test.ts` checks that every text colour keeps 4.5:1 on glass over a white backdrop and on the solid fallback.
```

- [ ] **Step 3: Commit the docs**

```bash
git add docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md frontcreck/README.md
git commit -m "docs: record the Trifid override of the visual rules; README section on the theme, its glass switch and the map behind the header

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Commit, do not push (Global Constraints).

- [ ] **Step 4: Last checks, and the pull request body written to a file (nothing is pushed)**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint && npm run test)
git status --short   # must be empty
git diff --stat origin/claude/wizardly-jennings-23d72e...HEAD -- data-pipeline/rmr_pipeline/validate.py data-pipeline/rmr_pipeline/constants.py data-pipeline/rmr_pipeline/build.py frontcreck/public/data/albums.json frontcreck/public/data/positions.json frontcreck/public/data/recs.json frontcreck/scripts/perf/budgets.json frontcreck/src/components/home frontcreck/src/app/page.tsx frontcreck/src/lib/copy.ts   # must print nothing from this part
git log --format='%h %ad %s' --date=short --invert-grep --grep='Refs #45' origin/claude/wizardly-jennings-23d72e..HEAD
```

The diff line must print nothing for the data files, the budgets, the Home shelf and `page.tsx`. `copy.ts` may show part 2's one string for the names toggle (`COPY.map.names`) and nothing from this part. The last command lists the commits without `Refs #45`: only the plan and design commits from before the build may be in it, none made while building parts 1 to 3. The full browser suite was run green at the end of Task 10 Step 7; if any commit touched `frontcreck/` since then, run its three projects again first.

Then write the new body of pull request 47 to a file in the session's scratch directory (not in the repository), filling every angle-bracket part from the task results. `$BODY_FILE` below is the path of that file. Nothing is sent yet. Its content:

```markdown
Brings the Trifid prototype (PR 32) into `frontcreck/`. Stacked on PR 32's branch; draft until the owner approves. Refs #45. Plans: `docs/superpowers/plans/2026-10-04-trifid-theme.md` and its three parts.

## What changed
- Map: baked gas behind the albums, every album a star with a random size on each load, white cased lines, region names with an on and off button, glints at rest (parts 1 and 2).
- The nebula runs behind the top bar: the map starts at the top of the window and the header is glass over it. Every framing is held to the pixel of the current site (`e2e/framing.spec.ts`).
- Chrome: the token names are kept and their values moved to the cool near-black glass set. Panels over the map are glass on wide screens and fully solid on phones, without `backdrop-filter`, and under reduced transparency. No film grain. The selected ring has a dark casing. New favicon.
- Home, About and 404 sit over the dimmed nebula. The Home shelf and its order are untouched; nothing about regions on Home.
- Existing site data files are untouched. No site wording was added or changed by the chrome work.

## Changed from today's site, for you to see
<the list "Changed from today's site, for the owner to see" of the part 3 plan, whole, with anything Tasks 9 and 10 added to it>

## Contrast (worst case, computed and tested)
<the worst-case table of the part 3 plan, with any number that Task 2, 3 or 6 had to raise, and the measured header and ring numbers>

## Speed against the baseline
<the comparison table and the findings of `docs/design/trifid-theme/reviews/app-perf-part3.md`: sizes, medians against the baseline, glass on and off, twinkle on and off, first hover>

## Effects dropped or made cheaper for speed
<each one with its numbers before and after, or "None">

## Reviews
Six reviewers (visual craft, first visit, phone, accessibility, interaction states, regression against the baseline), each alone, until a clean round. Notes: `docs/design/trifid-theme/reviews/app-*.md`. Baseline and after pictures: `docs/design/trifid-theme/reviews/baseline/shots/`, `docs/design/trifid-theme/reviews/after/shots/`.

## Questions for the owner
- Glass on phones: off at launch. It can be switched on by one line once you have tried a preview on your own phone and seen the blur numbers above.
- The names button's screen reader label (part 2): proposed, one fixed label "Place names" with an on or off state.
- <any new design question from the review rounds, or remove this line>

## Not verified
- Motion in flight, a real phone, and Safari. The Safari prefix and the no-support fallback are checked in the built CSS only. These need you on a preview build.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 5: Stop: pushing creates a preview deployment; ask the owner**

Vercel builds a preview deployment from every push to this branch. So the push is the deployment, and it needs the owner's go-ahead like any other. Do not push, do not run `vercel`, and do not push a trial branch before he says yes. Reading is fine: `git log --oneline origin/feat/trifid-theme..HEAD | wc -l` says how many commits wait, and `gh pr view 47 --json isDraft,headRefName -q '[.isDraft, .headRefName] | @tsv'` that pull request 47 is still the draft for this branch.

Move issue 45 to "Needs answer" with the `board` skill, then stop and ask him with this message (fill in the number):

> The Trifid theme is built and six reviewers have been through it. They could not judge motion or a real phone, so the last check is yours. To let you try it I need to push the branch: <N> commits are waiting. Pushing makes Vercel build a preview of it (a preview URL, not production) and lets me update the draft pull request 47 with the results. Phones get solid panels. If you also want to try glass on your phone, I can push a second, throwaway branch in which the one phone line in `globals.css` is removed; that makes a second preview. Shall I push the branch, both, or neither?

Wait for his answer. Nothing below this step happens without it.

- [ ] **Step 6: After his yes: push, replace the body of pull request 47, find the preview**

Pull request 47 already exists as a draft; do not open another.

```bash
git push origin HEAD:feat/trifid-theme
gh pr edit 47 --title "Trifid theme in the app: nebula map behind a glass header, phone fallback" --body-file "$BODY_FILE"
gh pr view 47 --json baseRefName,headRefName,isDraft,body -q '[.baseRefName, .headRefName, .isDraft, (.body | rtrimstr("\n") | split("\n") | last)] | @tsv'
```

Expected: the last command prints `claude/wizardly-jennings-23d72e`, `feat/trifid-theme`, `true` and the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. No angle bracket is left in the body (`gh pr view 47 --json body -q .body | grep -n "^<\|<the \|<each \|<any "` prints nothing).

The preview Vercel builds from this push is the one he tries. Wait for it and take its address from the pull request: `gh pr checks 47` and `gh pr view 47 --json comments -q '.comments[].body' | grep -i vercel`. Only if the integration built none (no Vercel check and no Vercel comment ten minutes after the push) run `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx vercel deploy)` (never `--prod`); his yes to a preview covers it.

For the glass trial, only if he asked for it: `git switch -c trial/trifid-phone-glass`, delete the phone glass switch (the line `@media (max-width: 899px) { :root { --glass-blur: none; … } }` in `frontcreck/src/app/globals.css`), commit with the usual `Refs #45` and trailer, `git push -u origin trial/trifid-phone-glass` (this push builds the second preview he agreed to), take its preview URL, then switch back to the branch you came from. The trial branch is never merged and gets no pull request.

- [ ] **Step 7: The owner's checklist, on his own phone and in Safari**

Send him the preview URL or URLs (the one Vercel built from the push of Step 6, and the trial branch's if there is one) with this list (he answers each with fine, or what he saw):

1. Open the map. Drag it around with one finger for ten seconds. Smooth, or does it stutter?
2. Pinch in until covers show, then pinch out to the whole map. Does the nebula fade away as you go in and come back as you go out?
3. Drag the similarity slider from Sonic to Mood and back. Does the map follow without hanging?
4. Leave the map alone for ten seconds at the overview. Do the glints look right, and is anything jittery?
5. Tap an album, then "See closest albums". Does the list open at once, and can you read every line of it?
6. In the album, tap Map, then List, then Map again.
7. Tap the names button above the zoom buttons: names off, names on.
8. Read the top bar, the slider panel, the Explore button and the List button over the brightest part of the map. Easy to read?
9. On a computer, in Safari: open the map and an album. Does the nebula show through the top bar and the panels, softly blurred?
10. On the glass preview only: repeat 1 to 4. Is it as smooth as the solid one? Does the phone get warm?

Nine more, from the list of things the old site got right that only a hand can check (most are quickest on a computer):

11. Zoom in slowly with the wheel, from stars to covers. Do the covers stay steady, with no shimmer? Then pick a star and zoom in slowly: does its ring give way to the framed cover once, without flicker?
12. Pick two albums on the map, one after the other. Does the card rise in each time?
13. From Home, open an album. Do its covers appear on the map in their places, not slide in from somewhere else?
14. Drag the slider slowly. Does it snap to the three stops, and does the list beside an open album glide into its new order?
15. Open an album, set Mood, open one of its closest albums, set Sonic, press Back. Are you on the first album again, at Mood?
16. Before touching the map, resize the window: the map should refit. Drag the map, then resize again: it should stay where you put it.
17. Flick the map: it should glide on and ease to a stop. Drag, hold still, let go: it should stay put. Press the reset button and grab the map while it glides: your hand should win.
18. On your phone, pinch to zoom. Does the map stay under your fingers, with no glide after you let go?
19. With Reduce Motion switched on in the system settings: the reset button should jump instead of glide, a flick should not glide on, and the wheel should still zoom at the cursor.

When the previews and the list are sent, move issue 45 to "Final review" with the `board` skill and comment on it with the pull request link and the preview URLs.

- [ ] **Step 8: After his answers**

Anything he reports as wrong is a defect: fix it, commit it, rerun the checks it touches and the gate of Task 10 Step 1. Pushing the fix builds a new preview, so ask before each push (one line: what was fixed, and that pushing updates the preview). Solid stays the default on phones until he confirms glass on his phone and Task 9's phone pair showed no slowdown. If both hold, the change is: delete the phone glass switch line on the branch, change the expected list in `glass.test.ts` ("phones, browsers without backdrop-filter and reduced transparency get the same solid panels") to the two remaining blocks and the `[solid, solid, solid]` of `contrast.test.ts` to `[solid, solid]`, switch the phone expectations of `e2e/glass.spec.ts` to the glass values, run `e2e/glass.spec.ts` and `e2e/phone.spec.ts` on the phone project, run "header text keeps 4.5:1 with the brightest gas behind the bar" on the phone project as part of that (on phone glass the header's worst case is the third row of the contrast table, paper 8.69 and dust 5.44, where the fully solid bar had nothing behind it to measure), and commit it alone with his approval named in the message. Those three tests then prove the same things for two fallback cases instead of three; nothing else in them changes. What changes for the visitor on a phone is exactly this: the slider panel, the zoom and names buttons, the Explore and List buttons, the strip's "Open map" bar and the header go from opacity 1 to the glass values of the token table, with the blur; the album list stays opaque (`phone.css`), and the two other fallbacks stay fully solid. Merging and the production deploy are his to ask for.

---

## Site strings added or changed by this part

None. No entry of `frontcreck/src/lib/copy.ts` is added, removed or reworded, no component gains text, and Task 11 Step 4 checks it (`copy.ts` in the diff shows part 2's string only). The names toggle's label belongs to part 2 and is still waiting for the owner's approval there (proposed: one fixed label "Place names" with an on or off state). The favicon (Task 8) is a picture, not wording.

Changed wording that is not site copy, listed so nothing is a surprise: two test titles ("framed in off-white", "an off-white border"), code comments, one README section ("Theme"), two lines in the design spec, the pull request body, and the two messages to the owner in Task 11 (the request to push, which builds the preview, and the checklist of nineteen points). None of it is shown to a visitor. If a later fix in this part needs a visitor-facing word, it is added to this section and shown to the owner before it ships, following the copy rules of the Global Constraints.

## Changed from today's site, for the owner to see

Everything a visitor could notice that this part changes on purpose, beyond the gas, stars, lines, names and glints of parts 1 and 2. The regression reviewer of Task 10 marks these "changed on purpose"; anything else that differs is a defect. The same list goes into the pull request.

1. **Colours.** Warm brown and amber give way to cool near-black and off-white: every token of the table at the top of this plan. The album accent (`--acc`) is unchanged.
2. **Glass panels on wide screens.** The header, the album panel, the slider card, the zoom buttons, the hover label, the Explore card, "Explore this area", the map's messages, the About card and the Home search field are see-through and blur the map behind them. They were opaque.
3. **Phones stay solid.** Panels and the header are fully solid on phones (opacity 1), as they are today, in the new colours. Glass on phones is one line away and waits for the owner's phone trial.
4. **The map runs behind the top bar.** The nebula shows through the header on the map and on an album, and behind the clear header on Home. Album positions on screen are the same as today's to the pixel.
5. **No film grain.** The faint paper grain over the whole page is gone (owner's decision).
6. **No album colour wash over the map.** Today an open album tints the map behind its markers with the album's own colour. In the Trifid look the wash stays inside the album panel (at 90 percent strength) and the map keeps the nebula's colours. This follows the approved picture `final-album.jpg` and the prototype, which has no wash over the map; the owner was not asked about it separately, so it is listed here for him to see.
7. **Home.** The dark radial veil over the map becomes a light even one; the hero text sits on a soft dark pad and the shelf on a dark scrim, so both stay readable over the nebula. The shelf itself, its covers and their order are untouched.
8. **About and 404.** The About card is glass; the backdrops behind both are cooler and, on About, lighter.
9. **The hint line** at the bottom of the map is brighter (paper instead of ash) and sits on a soft dark band across the bottom of the map.
10. **The selected ring** among stars is off-white with a dark casing instead of amber.
11. **The map's keyboard focus ring** is off-white with a thin dark casing, in the same place as today's amber one (4 px inside the visible map).
12. **The slider** has an off-white thumb with a dark edge and an off-white focus ring; its line is a little brighter. Its layout is unchanged, on phones too.
13. **The phone strip** in the album list shows the nebula under one-size white stars, white cased lines and an off-white frame round the album, instead of three dot colours and an accent frame.
14. **Search.** The focused field's border and the underline of a matched word are off-white instead of amber.
15. **The favicon** is three off-white stars joined by grey lines on near-black, with no amber, clay or moss dot.
16. **At the deepest zoom on a short window** (under 771 px tall, at device pixel ratio 1) the picked cover's size cap is up to 11.5 px higher than today (Task 3's table). Nothing else about sizes changes.

Added by rulings of 2026-10-05:

25. **Focus rings on the map.** The keyboard focus ring of the controls that stand on the map (the zoom and names buttons, "Explore this area", the phone's List button) has a dark casing under it, like the selected ring, so it reads on bright gas (Task 4).
26. **The toast, a small fix.** "Link copied" and the other two toasts sit 28 px above the bottom safe area inset, where they sat 28 px above the bottom edge; on a phone with a home indicator that is a little higher, everywhere else nothing moves (Task 2).

From parts 1 and 2, the small things beyond the headline changes, so nothing reaches him unannounced:

17. **The cover cross-fade tiles are pale.** Between 16 and 32 px a cover fades in from a rounded tile in its star's colour (near white with a quarter of its family hue) where today the tile is clay, moss or ochre. The formulas are today's; the colour is new and unseen. This is the look he singled out: show him `map-covers-dense-fade-crop`, before and after, first. If he does not like it, the fallback is a darker start colour, which is his call.
18. **The picked cover in cover mode** keeps today's drawing (a 1 px backing, the map showing through the gap to its frame); only the colours change (frame off-white, backing near-black). Nothing to rule on; listed so the number sequence holds.
19. **Small marks on the map.** The true position mark under a focus cover is a small hollow ring where it was a dot; the hover mark has a dark casing; the rank badge sits 1 px further out; the marker's shadow is soft; the hot ring sits flush with the cover; rings, lines and badges on the map are off-white and no longer take the album's accent colour (the panel still does).
20. **Framing of an open album** may be slightly further out, because covers now keep at least 84 px from the seed so that no cover sits on a line.
21. **The names toggle** is shown wherever the zoom buttons are, also beside an open album where names never show, and is one more Tab stop before Zoom in. Its screen reader label, "Place names", is still his to approve.
22. **Glints** also play on Home (under the veil) and, quieter, beside an open album, never under one of its covers, as in the prototype.
23. **Deep zoom.** Past 32 px covers the nebula fades on to a faint, blurred, greyer remnant (his choice C).
24. **Not on the site, but in the public repository:** two README texts written for this theme (`data-pipeline/theme/README.md` and the "Map theme data" and "Theme" sections of `frontcreck/README.md`) are in the draft pull request for his read through.

Anything Task 9 drops or makes cheaper for speed, and any fix of Task 10 that a visitor could notice, is added to this list when it is made.

## Self-review

**Coverage of the 2026-10-04 decisions and the revision brief:**

| Item | Where |
|---|---|
| A. The map runs behind the header: CSS, camera, fit padding, every framing test, every place that reads a map rectangle or a pointer position, the pointer over the map under the header, header contrast measured, solid fallback, phone | Task 3 (the two tables, Steps 1 to 14); header tokens and fallbacks in Tasks 1 and 2 |
| B. No film grain | Task 2 Step 1 (test "the film grain overlay is gone") and Step 3 (rule and element removed); literal table |
| C. Phone: fully solid at launch (opacity 1, the header too), the one-line phone glass switch, the site's slider kept, strip stars without order or rank, the phone's own 60 px header as the camera's top inset | Task 1 Step 4 (the switch and its comment), Task 3 (`HEADER_NARROW_PX`), Task 5 (strip, the one-size test, the layout guard), Task 9 Step 6 and Task 11 Steps 5 to 8 (when glass may be switched on) |
| D. Favicon updated, no amber dot | Task 8 |
| E. Album accents at 3:1 as a mark, never text; Home shelf and its order unchanged; nothing about regions on Home | Task 1 Step 1 ("every album accent passes 4.5:1 on the room colour, and 3:1 as a mark on the panels"), Task 2 Step 1 ("the album accent is never a text colour"), Task 6 (shelf component untouched, the regions check), Task 11 Step 4 (the diff check on `components/home` and `page.tsx`) |
| F. Dark casing for the selected ring and for the keyboard focus ring of the controls that stand on the map, each with a computed contrast check and a pixel test | Task 4 |
| G. Global Constraints: snappiness, no regressions against the baseline | Global Constraints; applied in Tasks 9 and 10 |
| H. Speed against the baseline by the perf rule (medians of three runs), sizes, software and GPU, desktop and phone, glass on and off, twinkle on and off, names on and off, stars and gas alone, the dpr 2 column against its own baseline with the 50 ms yardstick, the deep zoom and gas rows, first hover, a cheaper version stated for each, the write-up | Task 9 |
| I. Re-capture with the baseline script, five lenses and a sixth for regression, fix and look again, a clean round, what reviewers cannot judge, every manual probe of the checklist given an owner, stop before a push (which is what builds a preview) | Task 10, Task 11 Steps 5 to 8 |
| J. README check, commit and do not push, a stop before the push, then pull request 47 updated (not a new one), issue 45, the last line of the body | Global Constraints; Task 11 |
| K. Copy rules, the list of site strings | Global Constraints; "Site strings" section: none |
| L. Hard rules | Global Constraints; each "what it still proves" note sits with its rewritten test (Task 1 Steps 2 and 7, Task 3 Steps 3 and 10, Task 5 Step 2, Task 7 Steps 2 and 3, Task 11 Step 8) |
| M. Compatible with part 2's glint and names layers under the header | Task 3: the layer table, Step 8, the tests "glints never start under the header" and "the header is above every layer of the stage" |
| N. Other contradictions removed | "Nothing animates at rest" became "the map canvas does not redraw at rest"; the grain tint, the optional favicon, "the header has no nebula behind it" and the header and favicon questions for the owner are gone |

**Task numbers changed in this revision.** Old to new: 1 to 1, 2 to 2, 3 to 5, 4 to 6, 5 to 7, 6 to 8, 7 to 9, 8 to 10, 9 to 11. Tasks 3 and 4 are new. The request to push (which builds the preview) and the owner's checklist moved from the old Task 8 to Task 11 Steps 5 to 8.

**Placeholder scan:** no "TBD", no "similar to task N", no "add error handling". The only angle-bracket fields are in the pull request body, to be filled with measured results that do not exist until Tasks 2, 3, 6, 9 and 10 have run, and Task 11 Step 6 checks none is left. `e2e/fixtures/framing-baseline.json` and the files under `reviews/after/` are generated output, like the theme bake: the plan gives the command that writes each and what it must contain. Where a number may have to move (a tint, a scrim, the blur), the step gives the exact tuning rule: which number, which step, which ceiling.

**Type consistency:** `Rgb`, `Tint`, `GlassFilter`, `rgbToHex`, `filterBackdrop`, `paintOver`, `surfaceOver` are defined in Task 1 Step 3 and used with the same names and shapes in Task 1 Step 1, Task 2 Step 9 and Task 4 Step 1. `contrastOverBackdrop(page, scope, selectors)` is defined in Task 2 Step 10 and called with three arguments in Task 2 Steps 11 and 12, Task 3 Step 10 and Task 6 Step 1. `HEADER_PX`, `MapInput.insetTop` (handed on to part 2 through `setStageTop(input.insetTop)`), `visibleScale(canvasHeightCssPx, insetTopCssPx)`, `setVisibleScale`/`getVisibleScale`, `applyFrustum(camera, width, height, insetPx, insetTopPx)`, `FitArea.insetTop`, `focusCamera(ids, positions, width, height, insetPx, insetTopPx, pad, clampZoom)` and `visibleArea(insetLeft, width, height, edge, insetTop)` are defined in Task 3 Steps 5 to 7 and called with those shapes in its tests (Step 3) and callers (Steps 7 and 8). `brightestAlbums(page, count)` is defined in Task 3 Step 10 and used in both tests of Task 4 Step 3. `drawStrip`'s eight parameters and `StripGas` match between Task 5 Step 1 and Step 3. `glassVars(css, want)`, `summarise(runs)` (`{ median, best, worst, n }` per measure) and `compareRuns(baseline, current)` (`{ where, key, baseMedian, baseBest, baseWorst, median, worse }` per row) match between Task 9 Steps 1, 2 and 3, and `compare.mjs` reads the perf JSON as `perf.mjs` writes it (`js.kb`, `js.threeKb`, `rows`, `fails`; checked against `baseline/perf/perf-run1.json`). `compareRuns` gives a row with null baseline fields for a measure the baseline lacks, which `compare.mjs` prints as "no baseline". The dpr 2 baseline files do not exist yet (part 1 makes them), so their shape is taken from part 1's description: the same JSON, with rows whose `mode` is `gpu` and `vp` is `desktop2x`.

**Numbers computed, not guessed** (plain `node` on arm64, WCAG 2 formula; throwaway scripts, not in the repository): the pinned hex values (`#323134`, `#39383c`, `#424244`, and `#0a090e` for the solid panel); the solid row of the contrast table (17.19, 10.76, 8.04, 16.87; weakest accent 4.75; worst wash 5.40); the strip rectangle (`-57, -362, 672, 672`); the header rows of the contrast table; the selected ring's table in Task 4, with the 1.76 of its "see it bite" step; the favicon's three ratios; the frustum and fit equivalence of Task 3 (a 900 px canvas with a 64 px top inset against an 836 px canvas: 832.5 px per world unit in both, the same camera centre, the cloud drawn from y = 119 to y = 785, 21280 px per world unit at the zoom ceiling in both); the sprite cap figures in Task 3's table; the phone corner arithmetic in Task 5.

**Where the new code loads.** This part creates no runtime module: every file it creates is a test, a browser spec, a fixture or a script (`glass.test.ts`, `stage.test.ts`, `e2e/glass.spec.ts`, `e2e/framing.spec.ts`, `e2e/fixtures/framing-baseline.json`, `scripts/icons/build.mjs`, `scripts/perf/compare.mjs`). Its runtime code is added to modules that exist. In the first-load JavaScript: only the two header constants of `components/map/types.ts`, which `MapStage` (in the root layout) now imports as values, and the CSS. In the lazy map chunk, loaded after first paint: `visibleScale` (`state/zoomLimits.ts`), `setVisibleScale` and `getVisibleScale` (`state/view.ts`), and the edits to `bounds.ts`, `focusLayout.ts`, `projection.ts`, `mapStore.ts`, `MusicMap.tsx` and the canvas drivers. In the album route's chunk: the phone strip (`MapPreviewStrip.tsx`, imported by `AlbumPanel.tsx`), which now imports part 1's `components/map/theme.ts` and `lib/data/theme.ts` (neither imports three.js) and already imported `focusLayout.ts`. `src/lib/contrast.ts` is imported only by tests and by `e2e/a11y.spec.ts`, so its new functions reach no bundle. Task 9 Step 5 checks the first-load number and the three.js chunk.

**Not run:** no browser, build, Playwright or perf run was started while this plan was revised, and parts 1 and 2 are not built yet. So every browser test in this part is unexecuted, including the ones written to pass on today's code first (Task 3 Step 2 proves those before anything changes).

**Assumptions about parts 1 and 2**, each stated in the task that depends on it with what to change if it is wrong:

- Part 1: `loadTheme(): Promise<ThemeData>`; `ThemeData.bakeHalf`, `ThemeData.n` and `ThemeData.stars.bg` (three bytes per album; Balanced is the second) served at `/data/theme/theme.json`; the gas image is north up with straight (not premultiplied) alpha; `SKY_RGB`, `STAR_WHITE`, `FRAME_RGB` are 0 to 255 triples; `src/components/map/theme.ts` does not import three.js; the gas steps back to 0.3 of its strength by 32 px covers (Task 4's note on the picked frame rests on it); part 1's Task 3 Step 12 puts `npm run theme` and "Map theme data" into `frontcreck/README.md`.
- Part 2: the picked frame keeps today's geometry; other covers still step back while a pick lasts by today's fade by alpha (each at 0.5; 0.45 outside an open album's focus), not by being darkened towards `#07060a`, so the gas and the page colour show through them and a cover that stands alone shows about half its detail (Task 7 Step 2 is written for exactly this); region names are hidden in the dimmed mode, while an album is open and once covers show; the names toggle is `button.map-names`, the first child of `.map-zoom`, and its preference key is `rmr-names`; `CLUSTER_RGB` is replaced in `MapPreviewStrip.tsx` by a stand-in until Task 5; `layoutMarkers` takes `options.minLine`; the names layer is `.rn-layer` (z-index 2) and its driver calls `visibleArea` and `chromeBlockers` as quoted in Task 3 Step 8.
- Checked against part 2 as it stands after the cross-check of 2026-10-04. From it this part takes: `state/stageTop.ts` with `getStageTop()` and `setStageTop(px)`, read by the names driver (for `ChromeInput.top` and the top of the area a name may sit in) and by the twinkle driver (`getStageTop() + TWINKLE_EDGE_PX`); the names driver's call `visibleArea(inset, width, height, 0)` followed by `visible.top = top`; a layer `.tw-layer` (z-index 1, under `.rn-layer`) with one `.tw` element per glint; the twinkle switch `window.__rmr.getState().setTwinkleOn(on)` (the app store; `window.__rmr.twinkle` holds only `{ stats }`); `twinkleOff(page)` in `e2e/helpers.ts`; `waitForAnimations` leaving the glints' own animations out; `scripts/perf/twinkle-cost.mjs`. They are used in Task 3 (Step 8, two tests), Task 4 (one test), Task 9 (`--twinkle` and the cost script) and Task 10 (one screenshot state). If part 2 ended with other names, change them in those places and nowhere else.
