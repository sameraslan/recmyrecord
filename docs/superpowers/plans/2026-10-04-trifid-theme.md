# Trifid theme in the app: overview

**Goal.** Bring the approved Trifid nebula look from the standalone prototype into the real site (`frontcreck/`): swirling gas in the five Ember colours behind the albums, every album drawn as a star, white lines to the closest albums, quiet region names with an on/off button, and see through glass panels. Album positions do not move, nothing draws while the map is at rest, and the performance budgets stay as they are. The source of the design is `docs/design/trifid-theme/HANDOFF.md` (decisions of 2026-10-04) and the `final-*.jpg` pictures in `docs/design/trifid-theme/options/`.

The detail is in three plans next to this file: part 1 (`...-1-data-gas.md`), part 2 (`...-2-stars-lines-names.md`), part 3 (`...-3-chrome-tests.md`). Below, "2.6" means part 2, task 6.

## Decisions made on 2026-10-04 (these win over the three parts and over "Decisions for the owner" below)

The three parts were written before these answers. Fold them into the parts before building. Tracking issue: 45. Pull request: 47.

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

* **Gas baked at build time.** `npm run theme` paints the gas of each slider stop once, into three images, and writes a small `theme.json` (star colours, gas brightness under each album, region names and where they go). Both are committed.
* **Gas behind the albums.** One flat layer under the album points shows the baked image, fades between two stops as the slider moves, and dims around an open album. No clock, so nothing moves at rest.
* **Stars in the existing single draw.** Albums stay in the one draw call they use today. Each is a star with a soft glow and a faint dark disc under it so it stays visible on bright gas (premultiplied alpha). Covers still fade in as you zoom.
* **Cover layout and white cased lines.** Beside an open album the covers are spread so none sits on a line, and the lines are white on a dark casing, from frame edge to frame edge.
* **Names layer and toggle (option B).** Region names are plain lettering in Tenor Sans, shown at Overview and Whole map, gone when zoomed in. A separate icon button above the zoom buttons turns them off and on and remembers the choice.
* **Glass with a solid fallback.** The same colour tokens get new values. Panels are glass on desktop and near solid on phones, where blur is unsupported, and under reduced transparency.
* **Phone strip.** The small map in the phone album list gets the gas, white stars and cased lines.
* **Tests, budgets and review.** Colour coupled tests are rewritten without loosening them, contrast is computed and measured, budgets are measured with glass on and off, and reviewers check the result before you see it.

## The three parts and their tasks

| Task | What it does |
|---|---|
| 1.1 | Theme inputs from the design analysis (Python, additions only), with a staleness check |
| 1.2 | Shared constants, the raw to world transform, the `theme.json` loader and hook |
| 1.3 | The theme build (`npm run theme`) and its committed output |
| 1.4 | Gas shader and its pure helpers |
| 1.5 | `GasField` in the scene, the theme in the map store, the readiness flag tests wait for |
| 1.6 | Browser checks for the gas and its failure modes, then a fidelity check |
| 2.1 | Star classes, tints and per album attributes |
| 2.2 | Stars in the one album draw (shader, material, attributes) |
| 2.3 | Cover layout that keeps covers off the lines |
| 2.4 | White cased lines, frames and badges |
| 2.5 | Region names layout: sizes, placement, fades, halo strength for 4.5:1 |
| 2.6 | Names toggle: saved preference, store flag, detached button |
| 2.7 | Region names layer: font, lettering, per frame placement |
| 2.8 | End to end checks for names and the toggle, phone screenshots, then a fidelity check |
| 3.1 | Tokens, the glass switch and the worst case contrast function |
| 3.2 | Glass surfaces and the sweep of every old colour literal |
| 3.3 | Phone strip on the nebula, and a guard for the phone zoom corner |
| 3.4 | Home, About and 404 over the nebula |
| 3.5 | Theme coupled tests (frame colour, cover dimming, search focus ring) |
| 3.6 | Optional: favicon without the amber dot |
| 3.7 | Budgets and the cost of the blur (glass on against off) |
| 3.8 | Visual comparison, the five lens review panel, your phone trial |
| 3.9 | Docs and the draft pull request (stacked on PR 32) |

**Order.** Part 1, then part 2, then part 3, each in task order. What depends on what across parts:

* 2.1, 2.2, 2.5 and 2.7 need 1.2 (constants, transform, theme types) and 1.5 (theme in the map store). 2.8 needs 1.3 and 1.5, since names only exist once the theme data is served. 2.3, 2.4 and 2.6 need nothing from part 1.
* 3.1 and 3.2 could start early. 3.3 needs 1.2, 1.3, 2.2, 2.3 and 2.6. 3.4 needs 1.5 and 2.7. 3.5 needs 2.2 and 2.4. 3.7, 3.8 and 3.9 need everything.
* Between parts some things look wrong on purpose. After part 2 the rings, focus outlines and panels are still amber and brown until 3.1 changes the token values. One existing browser test (the picked cover check in `e2e/explore.spec.ts`) fails from 1.5 until 3.5 rewrites it. The full browser suite is expected green only at 3.5.

## What changes outside frontcreck

* New `data-pipeline/rmr_pipeline/theme.py` and `data-pipeline/tests/test_theme.py`. No existing pipeline file is edited.
* New folder `data-pipeline/theme/` with `weights.json`, `regions.json` and a README.
* Two added lines in `docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md` recording that you set aside the ban on blue black, glass and starfields for this theme.
* Review notes under `docs/design/trifid-theme/reviews/app-*.md`.

## Decisions for the owner

1. **Replace the current look, or keep a theme switch?** Recommend replace. The plans assume it (all tasks, most directly 2.2 and 3.1).
2. **Glass on phone.** Recommend solid panels on phone, where blur is unsupported and under reduced transparency, glass on desktop. Phone glass is a one line switch once you have tried it on a real phone through a preview build and seen the blur on/off numbers (3.1, 3.2, 3.7, 3.8).
3. **Sonic shows 7 names and Mood 6 at launch**, because only regions with an approved name are shown. Recommend accept (1.1, 1.3, 2.7).
4. **Where the data comes from.** Committed inputs under `data-pipeline/theme/` made by an additions only step, gas baked by `npm run theme`, and guard tests that fail when positions change so a stale bake cannot ship. Balanced uses the 17 names made by hand. Recommend as planned (1.1, 1.3).
5. **Star brightness follows album order** until a real rank field exists. Recommend accept (2.1).
6. **The header has no map behind it.** In the real app the map starts below the header, while the approved album picture shows nebula through it. Recommend extending the map under the header as a separate small task after the rest, since it changes camera framing. Not yet in the plan (it would touch what 3.2 and 3.8 cover).
7. **Phone slider.** The approved phone picture shows a compact row of three buttons; the site has a track with stops. Recommend keeping the site's slider (no task changes it; 3.3 and 3.8 treat it as intended).
8. **Film grain.** The approved pictures have none; part 3 keeps the site's grain with a cool tint. Recommend removing it over the map (3.2).
9. **A region name beside an open album.** The approved album picture shows one, but the rule says names are gone when zoomed in. Recommend following the rule (2.5, 2.7).
10. **Favicon** still has the amber dot. Recommend updating it (optional 3.6).
11. **Album accent colours** reach only about 3:1 on glass (3.10 at worst). They are never used as text. Recommend holding them to 3:1 as a mark, pinned by a test (3.1, 3.2).
12. **Wording that needs your approval.**
    * The region names themselves (1.1, shown by 2.7). Balanced: The Live Belt, Urban Cluster, Improv Arm, The Quiet Deep, Pastoral Nebula, Lonely Drift, The Bittersweet Reach, Warm Halo, Playful Way, Eclectic Cloud, Progressive Spiral, Ethereal Veil, Aggressive Rift, Raw Flare, Epic Expanse, Sombre Void, Hypnotic Orbit. Sonic: The Bittersweet Reach, Improv Arm, The Quiet Deep, Urban Cluster, The Live Belt, Playful Way, Progressive Spiral. Mood: Aggressive Rift, Urban Cluster, Progressive Spiral, Sombre Void, Epic Expanse, Warm Halo.
    * The toggle's screen reader label (2.6, checked in 2.8). Either one fixed label "Place names" with a pressed state, or swapping "Hide place names" and "Show place names" without a pressed state. The plan as written does both at once (swaps the label and sets pressed). Recommend the single fixed label.

## Not verified until built

* The shaders (gas and stars) have never been compiled. Their text was checked for undeclared names only.
* The bake has never been run, so the three images, their file sizes and `theme.json` do not exist yet.
* No real phone and no Safari. Safari may read the gas image's dust channel differently.
* Motion in flight: pan, zoom, the slider morph, name fades, the panel sliding in.
* The cost of stars, names and blur against the 50 ms frame budget. It is measured in 1.6 and 3.7, not before.

What was checked on paper: the pure logic of five modules (bake maths, gas helpers, stars, cover layout, names layout) was run against the plans' own tests and passed, and the contrast table of part 3 was recomputed from the album data.

## How it will be reviewed

* **Per part fidelity checks.** At the end of each part a fresh reviewer compares screenshots of what that part built with the matching `final-*.jpg` and lists differences (1.6, 2.8, 3.8).
* **The five lens panel (3.8).** Once everything is assembled, five separate reviewers, each with one lens and no sight of the others: visual craft, first visit ("just a vibe", nothing to decode), phone, accessibility, interaction states. Findings are fixed, the reviewer who raised each one looks again, and you see the work only after a clean round. Notes are kept in `docs/design/trifid-theme/reviews/app-*.md`.
* **Your phone checklist (3.8).** Reviewers see stills and code. They cannot judge motion or a real phone, so the preview build and your eight point checklist stay.
