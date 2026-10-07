# Trifid theme: staying clean as the catalogue grows

How regions, names, colour families, labels and rendering hold up when the map goes from 4,081 albums to about 10,000. Numbers come from `scaling/RESULTS.md` (analysis, run on the real feature table and the real layout code) and from the prototype in `prototype/`. Section 9 says what was run and what is only reasoned.

## 1. The short version

1. **Regions become a pipeline stage** (`rmr_pipeline/regions.py`), run for each slider stop on every build, with the honesty thresholds enforced in `validate.py`. The hand merge file is gone. The automated recipe reproduces the hand-made regions closely: 15 of 17 are identical, and with the hand-made set as history 16 of the 17 approved names stay in use (one of them on a smaller region).
2. **Regions are carried forward, not re-found.** A region is a persistent set of albums. New albums join the region most of their nearest neighbours belong to; each region is then re-checked for honesty and for still being one place on the new map. In the one layout-change test run, this kept 92% of named albums under the same name, against 70% when regions were found afresh and matched to the old ones.
3. **Place names are an owner-edited table from data word to name.** The pipeline never invents a name. A region whose word has no entry ships with the plain data word and is listed in the build log as needing a name.
4. **Colour families are frozen**, not refitted. Hues are pinned to meaning. New albums are scored against the frozen definitions. This needs named sound traits for the new albums, which the 10k plan does not yet provide (section 6).
5. **Labels use a hierarchy and a density budget**, tied to cover size instead of a fixed zoom, so the same rules work for 12 regions or 40.
6. **Rendering**: the gas is baked to one texture per stop; stars stay one draw call. At 10,000 points the prototype holds the frame budget on software WebGL with baked gas.
7. Expect change anyway. Under simulated growth about one named album in five leaves its region at each step whatever the method. The interface should never promise an album a permanent address.

## 2. What the 10k effort has landed, and what this plan assumes

Checked on 2026-10-03. One part of the expansion is code, in draft; the rest is design studies. Nothing touches layout, descriptors or the site data yet.

| Where | What |
|---|---|
| `main` | Pipeline unchanged: 13 Spotify audio columns plus 120 descriptor columns, three independent UMAP layouts, 4,081 albums. |
| `feat/preview-audio` (draft PR 25) | Replaces the 13 audio columns with a 64-dimension block from preview clips. Rewrites `layout.py` (stops share a density, islands pulled in). Changes `positions.json` and `recs.json`. |
| `experiment/genre-crossing` (draft PR 26) | The genre-crossing experiment, which includes the two 10k design studies (`results/solutions_scaling_10k.md`, `rym10k_sheet_audit.md`). No pipeline change. None of its five decisions (D1 to D5) is signed off. |
| `feat/audio-10k` (draft PR 31, stacked on 26) | A catalog builder and a 10,510-row catalog keyed by RYM id with `rank` and `on_chart`, a key file from RYM id to today's albums, and the audio store rekeyed. This builds the recommended options for D1 (RYM id key) and D2 (keep off-chart albums). No transform refit, no layout change, site data untouched. |

Planned there, and what it means here:

| 10k plan | Consequence for regions and colour |
|---|---|
| About 10,500 albums (10,510 in PR 31's catalog); order append-only; key moves to an RYM id | Region rosters must be keyed by the stable album key, not by index or Spotify URI. |
| "All positions move" on every rebuild; nothing anchors the layout | Names cannot depend on where a region sits. Carry-forward (section 4) is built for this. |
| Spotify's 13 named audio columns will not exist for about 6,400 new albums | Two current names (The Live Belt, The Quiet Deep) and the colour families depend on named sound traits. See section 6. |
| Descriptors may be rebuilt as the first 8 per album ("T8") | Coverage of the name words drops to a median of 0.71 of today's (0.63 to 0.93 by word). Gates must be stated relative to tag density. In a test on today's positions, about a third of names changed even with the gates rescaled, and about half without. |
| `rank` and `on_chart` exist in PR 31's catalog | Star brightness should use `rank` once it reaches `albums.json`. Until then brightness uses album order with the tail treated as median. |
| Layout normalisation changes on PR 25 | Bandwidths are expressed relative to the layout, not in fixed map units (section 3). |

The regions shown in the prototype were computed on `main`'s positions. They will need recomputing on the PR 25 layout before anything ships.

## 3. The regions stage

Prototype code: `scaling/auto_regions.py` (`find_regions`) and `scaling/carry_forward.py` (`carry_forward_regions`). Both are pure functions over positions, a descriptor presence matrix, optional named sound traits, the name table and the previous build's regions.

**Where it lives.** A new `rmr_pipeline/regions.py`, called from `build.main()` directly after `build_layouts(...)`, where the feature table, the three layouts and the vocabulary are all in scope. Output `regions.json` (`{balanced, sonic, mood}`) written through `write_json` next to `positions.json`. It needs no images, so it runs under `--skip-images`. Runtime about 0.5 s per stop today and 0.7 s at 10,000 points at the recommended bandwidth (1.4 to 2.4 s at finer ones).

**Recipe, per stop.**
1. Mean-shift on the 2D layout. Deterministic (`bin_seeding`).
2. Automatic merge of neighbouring blobs: merge two blobs when they touch on the map and their word profiles agree (same leading word, or cosine of lift-weighted profiles above 0.72). This replaces `regions/merge.json`.
3. Trim to interiors (an album stays if at least 70% of its 15 map neighbours are in the same region).
4. Name word: the best-scoring word that passes the gates and that this region owns (no two regions share a word). If no word passes, a named sound trait at |z| of 1.5 or more may name it. Otherwise the region is dropped and its albums are unnamed ground.
5. Gates: strong is coverage 0.40, lift 1.8, next region at most 0.8 of this one; fair is coverage 0.35 and lift 1.8. Below fair, no name. The thresholds are those of `regions/regions.md`; the ownership rule in step 4 is new, and two hand-made names (bittersweet, hypnotic) only just fail it. If descriptors move to T8 the coverage thresholds must be scaled by the measured drop in tag density (about 0.29 and 0.25).
6. Place name from `name_table.json` by word, or none.
7. A coarse level (2.5 times the bandwidth) for broad areas, words only, each region pointing at its parent.

**Against the hand-made regions (balanced).** Same 25 blobs. Three of the five hand merges are reproduced, none is made that the hand step rejected. 15 of 17 regions have identical members; adjusted Rand index 0.931. Run with the hand regions as the previous build, 16 of the 17 approved names stay in use; The Bittersweet Reach moves to a smaller region (127 albums) and the rest of its old ground becomes "romantic". Hypnotic Orbit is lost because, without the hand merge, "hypnotic" covers only 32% of what remains. That is the system working as intended: `regions.md` already called it one of the three weakest names.

**Bandwidth.** A fixed multiple of the nearest-neighbour gap does not hold region size: the gap shrinks as density rises, so the same multiple found 83 blobs on the synthetic 10,000-point cloud against 25 today and left nearly half the albums unnamed. Holding the bandwidth at a fixed share of the map's extent (today's 0.12 map units, about 6% of the width) gave 20 regions with 16 approved names on that cloud. Recommendation: define the fine bandwidth as a fraction of the layout's robust extent, and get finer names from a third level rather than by shrinking the regions.

**Validation (`validate.py`).** Fail the build when: a shipped region does not pass its gate when recomputed from the feature table (today `validate.py` reads only the output folder, so this check needs the table as an input or belongs in the build and a test); two regions at one stop share a word; a `name` is not exactly the table's entry for the word; rosters or indexes are inconsistent. Warn when: unnamed albums exceed 45%; fewer than 6 or more than 60 regions; more than a third of the previous regions are retired in one build. Add a byte-identical rebuild test like the layout tests on PR 25. Full list in `scaling/RESULTS.md` section 6.

## 4. Name stability for returning visitors

Two layouts by three region methods were run on simulated growth (a 1,600-album catalogue growing to 2,400, 3,200 and 4,081, with the real layout code re-run at each step; two series, six steps) and on the same catalogue laid out with a different seed (one seed pair). Balanced stop only.

| Method | Same albums, new layout: name word kept | Growth steps: name word kept | Growth: albums unnamed |
|---|---|---|---|
| Fresh layout, regions re-found, no matching | 62% | 47% | 27% |
| Fresh layout, regions re-found and matched to old ones by member overlap | 70% | 56% | 27% |
| Fresh layout, **regions carried forward** | **92%** | 72% | 43% |
| Carried forward, plus unassigned albums absorbed by a surrounding region | 92% | 74% | 37% |
| Layout started from the previous one, regions re-found | 72% | 55% | 28% |
| Layout started from the previous one, regions carried forward | 91% | 74% | 44% |
| Layout started from the previous one, carried forward plus absorb | 92% | 74% | 35% |

("Name word kept" is the share of albums that had a named region before and are under the same name word after.)

What this says:

- **Matching by member overlap is not enough.** It was the obvious idea and it adds 8 to 9 points. Re-clustering a fresh layout reshuffles too much.
- **Carry-forward is the fix.** With no new albums it keeps every region (18 of 18, none renamed). Under growth it keeps 72 to 74% of named albums in place.
- **Starting the layout from the previous one does not help names.** It does reduce how far existing albums move on screen (on the prefix series the median move falls from 17 to 51 gaps to 8 to 23; on the random series from 7 to 14 gaps to 5 to 8), costs nothing in map quality (trustworthiness 0.903 against 0.904) or time, and so is worth doing for a different reason: a returning visitor finds things roughly where they were. It is a change to `layout.py` and belongs to the 10k work.
- **The cost of carry-forward is more unnamed ground under growth** (43% against 27%), and bloat: new albums that do not clearly belong to a region stay out, and regions grow rather than split. In the runs the largest carried region reached 629 albums (711 with absorb), about twice the largest re-found one, and the region count stayed at 9 to 11 where re-finding reached 18. Turn the absorb step on (37% unnamed, no loss of stability in these runs). A guard is needed: when unnamed albums pass about 45%, or one region passes a size cap, that build re-finds regions with matching instead. The guard and its thresholds are reasoned, not run.
- **A floor remains.** About one named album in five leaves its region at each growth step under every method.

**How carry-forward works.**
1. The build reads a committed `regions_prev.json`: each region's id, name word and full roster of album keys.
2. Each region keeps its members. A new album joins the region that holds at least 60% of its 15 nearest previous albums in feature space, otherwise it is unassigned.
3. On the new layout each region is trimmed to its interior and re-checked: the name word must still pass the fair gate (with hysteresis: the old word stays unless a challenger is clearly better), and the region must still be one place (neighbour cohesion 0.5, at least 70% of members in one connected piece). A region that fails is renamed by the normal naming code or retired.
4. `find_regions` runs on albums in no surviving region, so new territory can earn a name.
5. `regions_prev.json` is rewritten.

**The name table.** `scaling/name_table.json`, the only hand-edited file: data word to approved place name, for example `urban` to "Urban Cluster", `liveness+` to "The Live Belt". Sound-trait keys are signed so "The Quiet Deep" can never attach to a loud region. The adjective is always data; the noun is the owner's. Each build prints the words that have a region and no name. A name is used only when its word is the region's word, so a name can disappear and come back, but it cannot drift onto something it does not describe.

**In the interface.** Deep links to a region use its id; a retired id falls back to the map with the nearest surviving region highlighted. The album panel's region line is read from the current build, never stored.

## 5. A label system for 12 regions or 40

Shown working in the prototype's stress mode (`data=10k`). That mode deliberately uses a finer bandwidth than section 3 recommends, to get about 38 regions and 4 broad areas on screen; at the recommended bandwidth the same cloud gives 20 regions.

- **Hierarchy from the data.** Level 0 broad areas (coarse bandwidth), level 1 regions. The automated run on balanced today gives 5 areas (bittersweet, heavy, improvisation, energetic, urban) covering nearly every album; the prototype's Balanced stop shows the 17 hand-made regions, which have no areas. Areas carry data words only until the owner names them. A third level is possible at 10,000 with real data; it was not needed here.
- **Bands tied to cover size**, not to a zoom number, so they move correctly when density changes: whole map shows areas (or the top regions when there are none); overview shows regions; as covers appear, map labels fade and a "you are here" chip takes over.
- **Density budget.** Labels are placed in priority order (strong before fair, then size, then evidence margin) and dropped on collision with a higher-priority label, chrome, a focus cover or a line. At most one label per 160 by 90 px of free map; hard cap 14 on desktop, 6 on phone. Regions that lose stay reachable through search, the browse menu, edge pointers and the region card's "Next to" links.
- **Room grows with the catalogue.** Today the overview is only about 1.3 times of zoom away from where covers start to appear, so there is one comfortable label level. On the synthetic 10,000-point cloud the cover size shrinks with the nearest-neighbour gap, the distance widens to about 2.3 times, and a second label level fits. A real 10,000 would be nearer 2.0 by the square-root rule.
- **Sizes** are fixed in px per tier and grow gently with zoom. Region size on the map is not encoded in the lettering beyond a small range, so a large weak region does not shout over a small strong one.

## 6. Do the five colour families hold?

- **Refitting is not safe.** The families come back the same on random halves of the catalogue (cosine 0.99 to 1.00) but not when the composition changes: fitted on the top 1,600 or 2,400 albums, "fierce" and "dark" come out different (cosine 0.52 to 0.53 and 0.67 to 0.72) and the anchor words no longer pick five separate families. Growth to 10,000 is a change of composition.
- **So pin them.** Freeze the family definitions fitted on today's catalogue (`scaling/out/family_loadings.json`: word weights plus sound-trait loadings) and score each album against them. Fitted on 70% of albums and applied to the other 30%, this gives the same leading family for 89% and 99% of clear albums in two trials; with the full-fit definitions it is 99.5%. Hues are pinned to meaning (rose fierce, gold warm, teal quiet, blue dark, violet urban), so the palette can never reshuffle between builds. A sixth family, if ever wanted, is an owner decision and a new hue, not something a rebuild does by itself.
- **The dependency.** The definitions use nine named sound traits (energy, loudness, acousticness and so on). With words alone, the frozen definitions agree with today's colours for only 65% of albums that have a clear family (61% under T8), and a words-only refit does not return the same five (quiet and urban are lost and dark drifts). New albums will have a 64-dimension clip embedding, not named traits. Before the theme ships at 10k, one of these has to be true:
  1. named traits are predicted from the clip embedding for every album. The genre-crossing experiment already built a "Spotify-like" block this way: it predicts energy, acousticness, danceability, loudness and valence well (R² 0.7 to 0.8) and tempo and liveness poorly (under 0.3). Whether the families survive on predicted traits is untested, or
  2. the families are redefined once on words plus the embedding and re-approved, or
  3. albums without traits are drawn more neutral, which is honest but greys out the new part of the map.
  Option 1 is the cheapest to test and keeps today's colours.
- **Done for the 10k catalog, 7 October 2026.** The families and hues stay frozen and the 4,081 albums keep their weights. The 6,386 later albums are predicted: a ridge regression from the EffNet clip embedding and the album's first eight descriptors straight to the six shares, fitted on the albums with true weights, then calibrated so predicted rows are as grey and as saturated as true ones (`scaling/run_weights10k.py`, write-up in `scaling/WEIGHTS-10K.md`). On two hold-outs of 1,210 and 1,211 older albums it gives the same leading family for 76% and 75% of clear albums (86% where one family clearly leads), with a mean error of 0.08 a share. Option 1 as written above (predicted traits through the frozen definitions) reaches the same 76% and 75% but greys the albums, so it was not used. No method tried reached 80%; the ceiling is how well sound traits can be read from a clip. The 185 new albums without audio use the frozen definitions on words alone. Region names were removed from the site on 6 October 2026, so the next point no longer matters for the site.
- The same dependency applies to sound-named regions. Without named traits, The Live Belt and The Quiet Deep lose their names. Loudness predicts well, so The Quiet Deep can probably be kept; liveness does not, so The Live Belt probably needs another basis (for example a "live" flag from the catalogue) or goes.

## 7. Per slider stop

Sonic, Balanced and Mood are three layouts and get three region sets, three gas textures, one shared name table and one set of colours (colour is a property of the album, not of the layout).

Automated results on today's layouts:

| Stop | Regions | Strong / fair | With an approved name | Need a name | Broad areas |
|---|---|---|---|---|---|
| Balanced | 18 | 13 / 5 | 16 | 2 | 5 |
| Sonic | 11 | 9 / 2 | 7 | 4 (heavy, atmospheric, lush, and the sound trait high danceability) | 3, covering half the albums |
| Mood | 20 | 14 / 6 | 6 | 14 (longing, soothing, acoustic, quirky, mellow, avant-garde, psychedelic, ominous, noisy, mysterious, anthemic, suspenseful, energetic, melodic) | 6 |

- Balanced is built first with the previous build as its history; Sonic and Mood are then matched to Balanced by member overlap. A shared id alone is not identity: in today's output 4 of the 9 ids Sonic shares with Balanced, and 3 of the 6 Mood shares, carry a different name word (the Balanced id `epic` is "heavy" on Sonic and "anthemic" on Mood). The stage should give a matched region a new id when its word changes, and the interface should treat a region as the same across stops only when id and word both match. Only Urban Cluster keeps both at all three stops.
- Sonic is organised by sound, so words form fewer places there and its broad word areas are weak. Mood has the most regions and the most unnamed words.
- These counts use the gap-multiple bandwidth, not the fixed-extent rule section 3 recommends; Mood's count in particular would change.
- Carry-forward was tested on Balanced only. Applying it per stop, and combining it with matching across stops, is reasoned and not yet designed in detail.

## 8. Rendering at 2.5 times the density

Measured in the prototype on headless software WebGL (SwiftShader, as in the perf script's software mode), 1600 by 1000, median per frame during a pan, everything included:

| Gas mode | 4,081 albums | 10,000 points |
|---|---|---|
| Live shader, full resolution | 110 to 150 ms | 110 to 125 ms |
| Live shader, half resolution while moving | 37 to 46 ms | 37 to 46 ms |
| Baked texture per stop | 26 to 29 ms | 26 to 32 ms |

Ranges cover the builds measured during the session; the final build (4096 px bake, richer shader) is at the upper end. Budget: 50 ms frame gap while moving, one frame at idle. The app enforces the frame-gap budget in GPU mode only and itself takes about 100 ms per frame on software rendering, so these figures are a conservative comparison, not a pass or fail. The prototype renders on demand; its frame counter did not move between 3 s and 8 s at rest. One reading on the M1's GPU gave 8.5 ms per frame with live gas on an early build; real-GPU and phone timings were otherwise not measured.

- **Gas should be baked.** The live shader is the same picture at four times the cost on software rendering and would be a risk on phones. Baked, the cost does not depend on catalogue size. The pipeline (or a build script) renders one image per stop; the app draws a textured quad behind the points and mixes stops with the existing slider uniform. Gas fades as covers appear, which also hides the baked texture's softness at high zoom.
- **Stars are one draw call.** Baked frame time is the same at 4,081 and 10,000 points, so the stars' cost is within the noise. This matches the app's single instanced draw.
- **Core brightness.** Gas brightness is normalised by a percentile of the density and passed through a shoulder, so a denser catalogue does not burn out; the rank correlation between gas brightness and album density is 0.96 on both the real map and the synthetic 10,000-point cloud. Each star carries a dark under-disc sized to the gas beneath it, so it stays visible on bright cores.
- **Overlap and hit targets.** At Overview almost every star's 14 px hit circle already overlaps another's today (98% of stars; 99.8% on the synthetic cloud), so picking is nearest-centre in both cases and density does not change the rule. What changes is how far in you must zoom before a tap is unambiguous. The app's existing hit test (nearest centre, radius 14 px or half the drawn size) carries over unchanged.
- **Covers.** `COVER_WORLD` scales with the median nearest-neighbour gap, as the app's constant already implies (1.4 times the gap), so covers overlap no more than today; the maximum zoom has to rise by the same factor (about 1.6 by the square-root rule; 1.78 on the synthetic cloud) to keep the same closest view. In the prototype's covers band, about 70% of covers have a neighbour closer than one cover width on the synthetic cloud against 74% today, so overlap is no worse. The synthetic cloud does contain coincident points, which the real pipeline's `fix_stacks` step prevents.
- **Data size.** Regions for three stops are about 120 KB before compression in the full schema, half of it per-album index arrays. Family weights are six bytes per album when packed. Three baked gas images (4096 px in the prototype; 2048 px would do for phones) are estimated at a few hundred KB each as WebP (not measured; the prototype bakes at run time) and can load after first paint. None of it touches the 200 KB first-load script budget.
- **Limits already known from the 10k study**: the thumbnail sheet holds 4,096; atlases go from 4 sheets to 11 (about 24 MB, loaded on demand as today); `validate.py` assumes one thumbnail sheet, and four test files pin today's count of 4,081.

## 9. What was run, and what is only reasoned

Run:
- The automated recipe on the shipped Balanced, Sonic and Mood layouts, compared with the hand-made regions.
- Growth simulation: 11 real UMAP fits (prefix series and two random series, plus a seed change), then 10 more for the anchored-layout comparison. Balanced only.
- Carry-forward and anchoring, on the prefix series, one random series and the seed change.
- Colour families: refits on subsets, words-only fits, the T8 simulation, frozen-definition projection on held-out albums.
- A synthetic 10,000-point cloud (today's layout resampled with jitter) through the region code and the prototype renderer.
- Frame times on software WebGL.

Reasoned only:
- A real 10,000-album catalogue, and anything on PR 31's catalog. The synthetic cloud is denser in the existing clusters than a real one will be and has no new kinds of music; the 10k study expects more classical, Japanese, punk and game music, so expect new regions with no current counterpart.
- Layouts built with the 64-dimension audio block, with T8 descriptors, or with PR 25's normalisation.
- Predicting named sound traits from the clip embedding.
- The re-find guard for carry-forward, a third label level, and growth on Sonic and Mood.
- Frame times on real phones.

## 10. Order of work

1. Decide the name-table entries and the colour dependency (section 6) with the owner.
2. Add `regions.py`, the frozen colour projection and the validation checks to the pipeline, on top of the PR 25 layout code. Commit `name_table.json`, `family_loadings.json` and the first `regions_prev.json`.
3. Add a `rank` field for star brightness when the new table has it.
4. Bake gas per stop in the build.
5. Ask the 10k effort to start each layout from the previous one.
6. When the catalogue changes, read the build log: regions kept, renamed, new, retired, words needing a name. Approve names before deploying.
