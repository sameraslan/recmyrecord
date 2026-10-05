# Trifid theme in the app: overview

**Goal.** Bring the approved Trifid nebula look from the standalone prototype into the real site (`frontcreck/`): swirling gas in the five Ember colours behind the albums, every album drawn as a star, white lines to the closest albums, quiet region names with an on/off button, and see through glass panels. Album positions do not move, nothing draws while the map is at rest, and the performance budgets stay as they are. The source of the design is `docs/design/trifid-theme/HANDOFF.md` (decisions of 2026-10-04) and the `final-*.jpg` pictures in `docs/design/trifid-theme/options/`.

The detail is in three plans next to this file: part 1 (`...-1-data-gas.md`), part 2 (`...-2-stars-lines-names.md`), part 3 (`...-3-chrome-tests.md`). Below, "2.6" means part 2, task 6.

## Decisions made on 2026-10-04 (these win over the three parts)

The three parts were written before these answers. They were folded into the parts on 2026-10-04 and the parts were cross-checked against each other, this list, the baseline and the real code (`.superpowers/sdd/preflight.md`, `.superpowers/sdd/crosscheck-report.md`). Tracking issue: 45. Pull request: 47.

* **Snappiness is a core requirement.** No effect may cost responsiveness. Measure each one. If it costs speed, drop it or ship the cheaper version without asking again. Add this line to the Global Constraints of every part.
* **No regressions.** Everything the current site does well stays: speed, the clean look, and details such as the way overlapping covers are handled on the map. Capture the current site first (screenshots of every state and a full performance run) and compare against it at the end of each part.
* **Replace.** Trifid replaces the current look. No theme switch.
* **Stars are random.** Size and brightness are drawn at random on each page load, in the mix 1% brightest, 9% bright, 27% medium, the rest small. Album order and rank are not used anywhere for stars. This replaces the class by album index in part 2 tasks 1 and 2. Reference: prototype `src/data.js`, `src/config.js` (`STAR_MIX`).
* **Twinkle.** Approved after seeing it live. One glint about every 1.2 to 3 seconds, at most 3 alive, a soft white bloom, a thin four point flare on the brighter stars. DOM and CSS only (opacity and transform), on a timer, never redrawing the map canvas, nothing during pan, zoom or slider moves, none once covers show, off under reduced motion and in hidden tabs. Reference: prototype `src/twinkle.js`, the twinkle block in `src/css/pages.css`, the Twinkle section of the prototype README (settings and measured cost). This is new work for part 2. It changes the rule "nothing animates at rest" to "the map canvas does not redraw at rest": the idle frame test and budget stay as they are, since they count canvas frames. If it costs any responsiveness in the app, it is dropped.
* **Deep zoom goes to space.** Past 32 px covers the gas keeps fading to a faint remnant at full zoom: floor 0.06 at 56 px and over, with desaturation, detail fade and a soft blur following the same ease. Reference: prototype `RMR.gasCurve` in `src/config.js`, `u_deep` in `src/gas.js`, the Deep zoom section of the prototype README. This replaces `gasStrength` and the 0.3 floor in part 1 task 4.
* **The nebula runs behind the top bar.** The map stage extends under the header and the header is glass over it. New task; it changes camera framing, so check fit padding and every framing test.
* **No film grain.** Remove the site's grain overlay (part 3 kept it).
* **No region names while an album is open,** and none once covers show.
* **Names toggle is option B:** a detached icon button above the zoom buttons, as in the prototype (`namesToggle()` in `src/app.js`).
* **Phone:** keep the site's slider, at most four names, solid panels at launch. Glass on phone is switched on only if a preview on a real phone and the blur on/off timings show no slowdown.
* **Region names approved** as listed below. Sonic and Mood show only the names that exist. Nothing is added.
* **Existing site data does not change.** The theme only adds new files beside it.
* **Home cover shelf stays as it is** for now, including its order.
* **Favicon:** update it. **Album accents:** held to 3:1 as a mark, never text.
* **Still pending:** the toggle's screen reader label. Proposed: one fixed label "Place names" with an on or off state.

## The approach

* **Gas baked at build time.** `npm run theme` paints the gas of each slider stop once, into three images, and writes a small `theme.json` (star colours, gas brightness under each album, region names and where they go). Both are committed. `theme.json` says nothing about star size or brightness.
* **Gas behind the albums.** One flat layer under the album points shows the baked image, fades between two stops as the slider moves, and dims around an open album. Past 32 px covers it keeps fading to a faint remnant (0.06 from 56 px covers), losing colour and detail and blurring on the same ease. No clock, so the canvas does not redraw at rest. Only the image of the stop on screen is loaded first; the other two load at idle once the map is interactive, and Home loads only the one it shows.
* **Stars in the existing single draw.** Albums stay in the one draw call they use today. Each is a star with a soft glow and a faint dark disc under it so it stays visible on bright gas (premultiplied alpha). Size and brightness are dealt at random on each page load (1% brightest, 9% bright, 27% medium, the rest small); album order and rank are used nowhere. Covers still fade in as you zoom, with today's cross-fade band and today's dimming of other covers around a pick.
* **Cover layout and white cased lines.** Beside an open album the covers are spread so none sits on a line, and the lines are white on a dark casing, from frame edge to frame edge.
* **Names layer and toggle (option B).** Region names are plain lettering in Tenor Sans, shown at Overview and Whole map, gone once covers show and while an album is open. A separate icon button above the zoom buttons turns them off and on and remembers the choice.
* **Twinkle.** A DOM and CSS layer over the canvas plays one glint every 1.2 to 3 seconds (at most 3 alive) on a timer. It never redraws the canvas, stops during pan, zoom and slider moves, stops once covers show, and is off under reduced motion and in hidden tabs. With an album open it follows the prototype: quieter, never under a focus cover. If it costs responsiveness it is dropped.
* **The map behind the header.** The map pane reaches up under the header, which is glass over it. The camera takes the header's height as a top inset (64 px on desktop, 60 px on phones), so every framing is the same on screen as today.
* **Glass with a solid fallback.** The same colour tokens get new values. Panels are glass on desktop and fully solid on phones (header included), where blur is unsupported, and under reduced transparency. One line switches phone glass on later. No film grain.
* **Phone strip.** The small map in the phone album list gets the gas, white stars of one size and cased lines.
* **Tests, budgets and review.** Colour coupled tests are rewritten without loosening them, contrast is computed and measured, every part ends with three perf runs, the size check, the hover measure and the regression checklist against the baseline, and reviewers check the result before you see it.

**How speed is judged (the same in all three parts).** Run `npm run perf` three times, one after another. Each measure is judged on the median of the three runs: the median must be inside its budget, and it is compared with the baseline's median and min to max in `docs/design/trifid-theme/reviews/baseline/BASELINE-PERF.md`. A median above the baseline's worst run is a finding even when it is inside budget. Any single run over budget is named and explained in the write-up (the baseline has three such single run outliers). First-load JS is read from the perf script's own number against the baseline's 190.5 KB (budget 200 KB), and the first hover is measured with `baseline/hover-measure.mjs`. From 1.6 on the perf script also prints, reported only and never budgeted, a fifth column `gpu desktop2x` (1440 x 900 at device pixel ratio 2) and three rows: a drag in deep zoom, a slider move in deep zoom, and the time until the nebula is visible. 1.6 measures that column once for today's site too (commit 6f10463e, built in a temporary worktree) and adds it to the baseline. For it the 50 ms frame gap is a yardstick, not a budget.

**Commit, do not push.** A push to this branch makes Vercel build a preview deployment, so commits that change anything under `frontcreck/` or `data-pipeline/` are not pushed until you say yes (3.11 stops and asks). Commits that touch only documents may be pushed.

**Repeatable screenshots.** From 2.9 on every capture with `baseline/capture.mjs` uses its new `--still` option (one fixed star deal, no glints, gas settled). The baseline pictures are not retaken.

## The three parts and their tasks

| Task | What it does |
|---|---|
| 1.1 | Theme inputs from the design analysis (Python, additions only), with a staleness check |
| 1.2 | Shared constants, the raw to world transform, the `theme.json` loader and hook |
| 1.3 | The theme build (`npm run theme`) and its committed output, with the README section |
| 1.4 | Gas shader and its pure helpers, with the deep zoom curve |
| 1.5 | `GasField` in the scene, the theme in the map store, the readiness flag tests wait for |
| 1.6 | Browser checks for the gas and its failure modes, perf, size and hover against the baseline, the regression checklist, then a fidelity check |
| 2.1 | Random star classes, tints and per album attributes |
| 2.2 | Stars in the one album draw (shader, material, attributes), keeping today's overlapping covers look |
| 2.3 | Cover layout that keeps covers off the lines |
| 2.4 | White cased lines, frames and badges |
| 2.5 | Region names layout: sizes, placement, fades, halo strength for 4.5:1 |
| 2.6 | Names toggle: saved preference, store flag, detached button |
| 2.7 | Region names layer: font, lettering, per frame placement, the stage top value |
| 2.8 | Twinkle: star glints on a timer, DOM and CSS only, with its cost measured |
| 2.9 | End to end checks for stars, names and the toggle, perf, size and hover against the baseline, the regression checklist, then a fidelity check |
| 3.1 | Tokens, the glass switch and the worst case contrast function |
| 3.2 | Glass surfaces, the sweep of every old colour literal, and no film grain |
| 3.3 | The map runs behind the glass header (camera top inset, framing record and compare) |
| 3.4 | A dark casing for the selected ring and for the focus rings on the map |
| 3.5 | Phone strip on the nebula, and a guard for the phone zoom corner |
| 3.6 | Home, About and 404 over the nebula |
| 3.7 | Theme coupled tests (frame colour, cover dimming, search focus ring) |
| 3.8 | Favicon in the Trifid colours |
| 3.9 | Speed against the baseline, and what each effect costs (glass and twinkle on against off) |
| 3.10 | The review rounds: re-capture of every baseline state, fidelity, the five lens panel, the regression reviewer |
| 3.11 | Docs, then a stop: the push that updates PR 47 also makes a preview, so it waits for your yes; then your trial |

**Order.** Part 1, then part 2, then part 3, each in task order. What depends on what across parts:

* 2.1, 2.2, 2.5 and 2.7 need 1.2 (constants, transform, theme types) and 1.5 (theme in the map store). 2.3, 2.4 and 2.6 need nothing from part 1. 2.8 needs 2.1 (the star deal), 2.7 (`state/stageTop.ts`) and 1.6 (it adds one line to `e2e/gas.spec.ts`). 2.9 needs 1.3 and 1.5, since names only exist once the theme data is served, and the rest of part 2.
* 3.1 and 3.2 could start early. 3.3 needs 3.1, 3.2, 1.3 (`theme.json`), 2.7 (`setStageTop`, the names driver) and 2.8 (`twinkleOff`, the glint layer). 3.4 needs 3.1 and 3.3. 3.5 needs 1.2, 1.3, 2.2, 2.3 and 2.6. 3.6 needs 1.5 and 2.7. 3.7 needs 2.2 and 2.4. 3.8 needs 3.2 (it adds a test to `glass.test.ts`). 3.9, 3.10 and 3.11 need everything.
* Three signatures change in 3.3 and every caller is listed there: `visibleArea` gains a required fifth argument (the names driver of 2.7 is edited by 3.3 Step 8), `applyFrustum`, `fitView` and `focusCamera` gain the top inset. 2.7 and 2.8 read the top of the visible map only through `getStageTop()`, which is 0 until 3.3 sets it.
* The perf script is edited twice: 1.6 adds one reported row (deep zoom drag), 3.9 adds the `--glass` and `--twinkle` flags and the comparison script. The twinkle switch everywhere is the app store's `setTwinkleOn` (`window.__rmr.getState().setTwinkleOn(false)`, or `twinkleOff(page)` in `e2e/helpers.ts`).
* Between parts some things look wrong on purpose. After part 2 the rings, focus outlines and panels are still amber and brown until 3.1 changes the token values. One existing browser test (the picked cover check in `e2e/explore.spec.ts`) fails from 1.5 until 3.7 rewrites it. The full browser suite is expected green only at 3.7.

## What changes outside frontcreck

* New `data-pipeline/rmr_pipeline/theme.py` and `data-pipeline/tests/test_theme.py`. No existing pipeline file is edited.
* New folder `data-pipeline/theme/` with `weights.json`, `regions.json` and a README.
* Two added lines in `docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md` recording that you set aside the ban on blue black, glass and starfields for this theme.
* Review notes, perf runs and re-captured screenshots under `docs/design/trifid-theme/reviews/` (`app-*.md`, `perf-part1/`, `perf-part2/`, `after/`). The `after/` screenshots are committed, like the baseline ones.
* Three additions to the baseline folder, none of which changes a baseline picture or number: the dpr 2 column for today's site (1.6: `baseline/perf/perf-dpr2-run1` to `run3` and a section in `BASELINE-PERF.md`); the `--still` option of `baseline/capture.mjs` (2.9); and one line of the same script (3.10), whose edge hover state reads the top of `#stage` in place of the top of the canvas, the same pixel as when the baseline was taken.

## Decisions for the owner

The twelve questions that stood here were answered on 2026-10-04; the answers are in "Decisions made on 2026-10-04" above. What is still open:

1. **The toggle's screen reader label.** Built as one fixed label, "Place names", with an on or off state (2.6). The wording is yours to approve.
2. **Things changed from today's site that you have not seen yet.** The full list is the section "Changed from today's site, for the owner to see" at the end of part 3, and it goes into the pull request. The ones that are not in the decisions above, so a look is asked for: the pale tiles of the cover cross-fade (the look you singled out; first thing to show you when it is rendered); the small marks on the map (hollow ring on the true position, cased hover mark, badge, shadow, hot ring, no album accent on the map's rings and lines); an open album possibly framed a little further out; no album colour wash over the map (the approved picture has it in the panel only); Home's lighter veil with a pad behind the hero and a scrim behind the shelf; the hint line on a dark band; the names toggle shown beside an open album; glints on Home and, quieter, beside an open album; a dark casing round keyboard focus rings on the map; the toast lifted above the phone's bottom safe area.
3. **Wording for your read through, not on the site.** The README texts of 1.1 and 1.3 and the "Theme" section of 3.11 are in the draft pull request.
4. **The cross-check's open points were ruled on 2026-10-05** and are folded into the parts. What is left open is in `.superpowers/sdd/crosscheck-report.md`, section 2.

## Not verified until built

* The shaders (gas and stars) have never been compiled. Their text was checked for undeclared names, and the star shader was compared line by line with today's.
* The bake has never been run, so the three images, their file sizes and `theme.json` do not exist yet.
* No real phone and no Safari. Safari may read the gas image's dust channel differently.
* Motion in flight: pan, zoom, the slider morph, name fades, glints, the panel sliding in.
* The cost of gas, stars, names, glints and blur against the 50 ms frame budget (the phone zoom gap is 44 ms today). It is measured in 1.6, 2.8, 2.9 and 3.9, not before. Each effect has a cheaper version written down that is taken without asking.
* First-load JS: the estimate from the import graph is about 1.6 KB of growth against 9.5 KB of room (the theme loader, the names toggle and its icons, two store flags). Everything else is in the lazy map chunk. Measured at the end of each part.
* How the pale cross-fade tiles look, and how the default keyboard focus ring reads on bright gas.

What was checked on paper or by running without a browser: the pure logic of the modules (bake maths, gas helpers and deep zoom curve, random stars, cover layout, names layout, twinkle timer, stage top) was run against the plans' own tests and passed; part 1's edits were applied to a copy of the app and type checked and linted; every "before" text was matched against the real files; the contrast table of part 3 was recomputed.

## How it will be reviewed

* **Per part checks against the baseline.** At the end of each part: three perf runs, the size check, the hover measure, a re-capture of the baseline's screenshots and a walk of its 234 item regression checklist (1.6, 2.9, 3.9 and 3.10).
* **Per part fidelity checks.** At the end of each part a fresh reviewer compares screenshots of what that part built with the matching `final-*.jpg` and lists differences (1.6, 2.9, 3.10).
* **The five lens panel and the regression reviewer (3.10).** Once everything is assembled, five separate reviewers, each with one lens and no sight of the others: visual craft, first visit ("just a vibe", nothing to decode), phone, accessibility, interaction states. A sixth compares every state with the baseline and marks anything not on the "changed on purpose" list as lost. Findings are fixed, the reviewer who raised each one looks again, and you see the work only after a clean round. Notes are kept in `docs/design/trifid-theme/reviews/app-*.md`.
* **Your phone checklist (3.11).** Reviewers see stills and code. They cannot judge motion or a real phone, so a preview build and your checklist stay. No preview is made, and nothing is merged or deployed, before you say yes.
