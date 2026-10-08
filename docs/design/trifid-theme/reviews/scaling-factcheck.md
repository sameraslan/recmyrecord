# Fact-check of SCALING.md

Date: 2026-10-03. Checked against `scaling/RESULTS.md`, the JSON reports in `scaling/out/`, `scaling/auto_regions.py`, `scaling/carry_forward.py`, `scaling/run_stabilisers.py`, `regions/regions.md`, `regions/colour.md`, `regions/merge.json`, `data-pipeline/README.md`, `data-pipeline/rmr_pipeline/`, the prototype source and data, `frontcreck/scripts/perf/`, and the branches `feat/preview-audio`, `experiment/genre-crossing` and `feat/audio-10k` (read with `git show` and `gh pr view`, nothing checked out). Nothing was re-run. The two placeholders in section 8 were ignored.

Verdicts: CORRECT, WRONG, IMPRECISE, UNSUPPORTED.

Counts: 6 wrong, 24 imprecise, 3 unsupported. Everything else checked is correct.

## 1. Claims

### Section 1, the short version

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| "15 of 17 identical" | CORRECT | | RESULTS s2 measures table; `report_regions.json` |
| "16 of 17 names kept" | IMPRECISE | 16 approved names are in use only when the hand regions are fed in as the previous build (15 in the pure run). Per hand region the name word agrees for 15 of 17 (14 of 17 pure). The Bittersweet Reach survives on a different, smaller region (blob 5, 127 albums, new id `bittersweet-2`); the hand region's main successor (186 albums) is renamed "romantic" | RESULTS s2 "Name word agrees", "Approved place names in use", "Where it differs" |
| "92% ... against 70% when regions are found afresh" | CORRECT | 0.915 and 0.696. The 70% is with matching; 62% without. One seed pair (42 to 7) | `report_stabilisers.json` summary; RESULTS s8 |
| New albums join "the region most of their nearest neighbours belong to" | CORRECT | at least 60% of 15 feature-space neighbours | `carry_forward.py` CARRY |
| "At 10,000 points the prototype holds the frame budget on software WebGL with baked gas" | CORRECT against the builder's range | 26 to 29 ms against 50 ms. One resolution, one machine | builder's report; `budgets.json` frameGapMs 50 |
| "about one named album in five leaves its region at each step whatever the method" | CORRECT | 18 to 21% fall out of any region | RESULTS s8 comparison table |

### Section 2, what has landed

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| "Nothing of the expansion is code yet" | WRONG | Draft PR 31 (`feat/audio-10k`, opened 2026-10-03 19:44 UTC, stacked on 26) adds a catalog builder (`rmr_catalog`), `catalog/albums.csv` with 10,510 rows keyed by `rym_id` with `rank` and `on_chart`, `audio/keys.csv`, and a rekeyed audio store. It does not touch layout, descriptors or `frontcreck/public/data/` | `gh pr view 31`; `feat/audio-10k:data-pipeline/catalog/manifest.json` |
| `main`: 13 audio columns, 120 descriptor columns, three UMAP layouts, 4,081 albums | CORRECT | | `data-pipeline/README.md` |
| PR 25: 64-dimension block, `layout.py` rewritten (shared density, islands pulled in), `positions.json` and `recs.json` changed, draft | CORRECT | | `git diff main...feat/preview-audio --stat`; layout diff (`pull_islands`, gap rescale) |
| PR 26: "Design studies for 10k only ... No pipeline change" | IMPRECISE | The branch is the genre-crossing experiment (code and reports under `experiments/preview_features/`); the two 10k studies are part of it. No pipeline change beyond PR 25 is correct | `git diff feat/preview-audio...experiment/genre-crossing --stat` |
| "All five decisions in it (D1 to D5) are open" | IMPRECISE | Not signed off, but the recommended options for D1 (key by `rym_id`) and D2 (keep off-chart albums) are already built in draft PR 31, waiting for approval | PR 31 body |
| "About 10,480 albums" | IMPRECISE | 10,480 is the study's estimate. The catalog built in PR 31 has 10,510 (4,081 existing, 6,429 new, 510 existing off chart) | `solutions_scaling_10k.md` s2; PR 31 `manifest.json` |
| "order append-only; key moves to an RYM id" | CORRECT | | `solutions_scaling_10k.md` s1 |
| "All positions move" | CORRECT | | `solutions_scaling_10k.md` s5 table |
| "about 6,400 new albums" | CORRECT | 6,368 flagged, about 6,400 after flag errors; 6,429 in PR 31 | `rym10k_sheet_audit.md`; PR 31 manifest |
| Two names and the colour families depend on named sound traits | CORRECT | | `regions.md`; `colour.md` |
| "Coverage of every name word drops to about 0.71 of today's" | IMPRECISE | 0.71 is the median over 15 words with members held fixed. Per word 0.63 (eclectic) to 0.93 (improvisation) | RESULTS s4 T8 table |
| "About a third of names would change when T8 arrives" | IMPRECISE | Only with rescaled gates: 10 of 15 region words kept, 65% of named albums keep their word. With today's gates 7 of 15 words and 49% of albums. Run on the shipped positions, words only | RESULTS s4 end-to-end table; `report_families_extra.json` |
| "A `rank` field is proposed" | IMPRECISE | Proposed in the study; now present in PR 31's catalog (`rank`, `on_chart`) | `solutions_scaling_10k.md` s2; PR 31 `albums.csv` header |
| Brightness uses album order with the tail as median | CORRECT | tail from index 3,824 | prototype `config.js` STAR_CLASS; `UX.md` s4 |
| Prototype regions computed on `main`'s positions | CORRECT | | RESULTS s7 |

### Section 3, the regions stage

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| Stage after `build_layouts(...)` in `build.main()`, table, layouts and vocabulary in scope, `write_json` | CORRECT | | `build.py` lines 71 to 100 |
| "Runtime about 0.5 s per stop today" | CORRECT | 0.45 to 0.55 s | RESULTS s1 runtime |
| "1.4 to 2.4 s at 10,000 points" | IMPRECISE | Those are the 15-gap and 10-gap bandwidths. At the bandwidth this section recommends (0.12 map units) it is 0.67 s | RESULTS s1 runtime; `report_synth_constant_units.json` |
| Mean-shift deterministic, bin seeding | CORRECT | | `auto_regions.py` `mean_shift` |
| Merge: touching, same leading word or cosine above 0.72 | CORRECT | cosine >= 0.72; "touching" is 20% of boundary points each way | `auto_regions.py` PARAMS |
| Trim: 70% of 15 map neighbours | CORRECT | also drops stragglers and the farthest 8%; regions under 30 albums are not emitted | PARAMS; RESULTS s1 |
| Sound trait at \|z\| 1.5 | CORRECT | | PARAMS `audio_z` |
| "Gates (unchanged from `regions/regions.md`)" | IMPRECISE | Thresholds unchanged (0.40, 0.35, 1.8, 0.8). The rule that no other region carries the word more often is new; two hand names fail it (bittersweet 56% against 58% next door, hypnotic 39% against 41%) | RESULTS s1 step 6; `regions.md` table |
| Coarse level 2.5 times | CORRECT | | PARAMS `coarse_mult` |
| "Same 25 blobs" | CORRECT | A pipeline stage sees unrounded positions and gets 26 blobs, same 18 regions | RESULTS s2, s3 |
| "Three of the five hand merges", none the hand step rejected | CORRECT | | `report_regions.json` merge groups; `merge.json` |
| "15 of 17 ... adjusted Rand index 0.931" | CORRECT | 0.931 over all albums, 0.965 over albums named in both | RESULTS s2 |
| "16 of the 17 approved names survive" with hand regions as previous build | CORRECT | see the section 1 row for what "survive" covers | RESULTS s2 |
| Hypnotic "covers only 32%" | CORRECT | | RESULTS s2 |
| `regions.md` called it one of the three weakest | CORRECT | | `regions.md` verdict |
| "83 blobs ... against 25", "nearly half the albums unnamed" | CORRECT | 46.6% | `report_synth.json` |
| "0.12 map units, about 6% of the width" | CORRECT | balanced x range 1.997, 6.0% | `positions.json` |
| "20 regions with 16 approved names" | CORRECT | | `report_synth_constant_units.json` |
| Validation warn bounds 45%, 6, 60, a third | CORRECT | | RESULTS s6 |
| "the layout tests on PR 25" | CORRECT | `test_finalize_layouts_is_deterministic` | `feat/preview-audio:data-pipeline/tests/test_layout.py` |

### Section 4, name stability

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| "Four combinations were run" | IMPRECISE | Six: two layouts by three region methods (recluster, carry-forward, carry-forward with absorb), on two series, six growth steps, plus the seed change. The no-matching row is from the earlier run | RESULTS s8; `run_stabilisers.py` line 158 |
| Row 1, no matching: 62% | CORRECT | 0.616 | `report_growth.json` seed_noise |
| Row 1, growth 48% | IMPRECISE | 48% is the nine-step mean. Over the six steps used by every other row it is 47% (0.471) | `report_growth.json` |
| Row 1, unnamed 27% | CORRECT | 0.265 over six steps, same as the matched run | `report_growth.json` |
| Row 2: 70%, 56%, 27% | CORRECT | 0.696, 0.557, 0.265 | `report_stabilisers.json` |
| Row 3: 92%, 72%, 43% | CORRECT | 0.915, 0.720, 0.431 | same |
| Row 4, same albums: "not run" | WRONG | It was run: 92% (0.919), unnamed 25.7%, 18 kept. RESULTS leaves it out of its table but the JSON has it | `report_stabilisers.json` summary `fresh/carry_absorb` seed |
| Row 4: 74%, 37% | CORRECT | 0.739, 0.367 | same |
| Row 5: 72%, 55%, 28% | CORRECT | 0.723, 0.551, 0.278 | same |
| Row 6: 91%, 74%, 44% | CORRECT | 0.914, 0.736, 0.444 | same |
| Seventh combination (anchored, carry-forward, absorb) missing from the table | IMPRECISE | 92% (0.916), 74% (0.736), 35% (0.353) | same |
| Matching "adds 8 to 9 points" | CORRECT | 8 on the seed change, 9 on growth. Not uniform: no gain in three of nine steps | RESULTS s3 |
| "18 of 18, none renamed" | CORRECT | | RESULTS s8 seed table |
| "72 to 74%" | CORRECT | | RESULTS s8 |
| "median 8 gaps against 17 to 50 on the prefix series" | IMPRECISE | Fresh 41.7, 16.7, 50.7 (17 to 51). Anchored 22.5, 8.2, 8.0, so the first step is 22.5, not 8. Random series: 9.8, 7.4, 14.3 against 4.7, 7.5, 7.0. "About halve" fits four of six steps | RESULTS s8 A |
| "trustworthiness 0.903 against 0.904" | CORRECT | 0.9026 and 0.9029 against 0.9043 | `report_stabilisers.json` quality |
| "costs nothing ... or time" | CORRECT with one exception | 13.5 s against 13 s at 4,081. One anchored fit took 10.7 s at 2,400 against about 5 s fresh | `report_stabilisers.json` umap_seconds |
| "43% against 27%" | CORRECT | | RESULTS s8 |
| Guard at about 40% unnamed or a size cap, not run | CORRECT as stated | see over-claims | RESULTS s8 recommendation 3 |
| Carry-forward steps: 60% of 15, cohesion 0.5, 70% in one piece, hysteresis | CORRECT | Contiguity is checked on the untrimmed roster, before the trim. A region that fails contiguity is retired, not renamed | `carry_forward.py` |
| Name table examples, signed keys | CORRECT | 17 entries | `scaling/name_table.json` |

### Section 5, labels

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| "`data=10k` gives about 38 regions and 4 broad areas" | IMPRECISE | 38 and 4 are right, but that is the 10-gap set (0.045 map units): 65.5% of albums unnamed, 10 approved names, 28 words needing a name. The bandwidth section 3 recommends gives 20 regions | prototype `data.js` line 92; `report_synth.json` fine |
| "On balanced today there are 5 areas (...) covering nearly every album" | IMPRECISE | True of the automated run (99.6%). The prototype's Balanced stop ships the 17 hand regions with no areas unless rebuilt with `--auto-balanced`. Sonic has 3 areas, Mood 6 | `prototype/data/data.js` regionSource; `build_data.py` |
| One label per 160 by 90 px, cap 14 desktop, 6 phone | CORRECT | | `labels.js` line 83; `config.js` |
| Priority: strong, then size, then margin | CORRECT | | RESULTS s1 step 9 |
| "about 1.7 times of zoom away from where covers start" | WRONG | Covers start at 16 px. Overview covers are 12.4 px, so 16 / 12.4 = 1.3 times. (1.7 is 22 / 13, the band C and band B limits.) | `zoomLimits.ts` COVER_FADE_START_PX; `config.js`; builder's stats |
| "widens to about 2.7 times" | WRONG | 16 / 7.0 = 2.3 times on the synthetic cloud (its gap ratio is 1.78). By the square-root rule for a real 10,000 it would be about 2.0 | same |

### Section 6, colour families

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| Random halves "cosine 0.99 to 1.00" | CORRECT | | `report_families.json` subsets |
| "(cosine 0.52 and 0.67)" for the top 1,600 or 2,400 | IMPRECISE | 0.52 and 0.67 at 1,600; 0.53 and 0.72 at 2,400 | same |
| Anchors no longer pick five | CORRECT | | same |
| "89% and 99% of clear albums in two trials" | CORRECT | 89.3% and 98.7%; the low trial drifts on warm and urban | `report_families.json` pinned |
| "with the full-fit definitions it is 99.5%" | CORRECT | | same |
| Hues pinned to the five meanings | CORRECT | | `colour.md` rule |
| "nine named sound traits" | CORRECT | | `colour.md` |
| "only 65% of albums (61% under T8)" | IMPRECISE | Of clear albums (the 3,951 with neutral weight under 0.5) | RESULTS s4 pinned table |
| "(quiet and urban are lost)" | IMPRECISE | Full presence: quiet 0.39, urban 0.38, and dark drifts to 0.68. Under T8 only urban is lost (0.17) | `report_families.json` descriptor_only, t8 |
| "its accuracy for this use is untested" | IMPRECISE | The genre-crossing report gives out-of-sample R² per trait: 0.7 to 0.8 for energy, acousticness, danceability, loudness, valence; under 0.3 for tempo and liveness. Untested is the effect on families and names | `REPORT-genre-crossing.md` line 94 |
| Live Belt and Quiet Deep lose names without traits | CORRECT | | RESULTS s6 |

### Section 7, per stop

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| Balanced 18, 13 / 5, 16, 2, 5 | CORRECT | need a name: romantic, instrumentalness+ | `regions_all.json` (continuity run) |
| Sonic 11, 9 / 2, 7, 4; 3 areas, half the albums | CORRECT | 49.8% | `regions_all.json` |
| Sonic list "(heavy, atmospheric, danceable, lush)" | IMPRECISE | The third is the sound trait `danceability+` (60 albums), not a descriptor word | `regions_all.json` |
| Mood 20, 14 / 6, 6, 14, the list, 6 areas | CORRECT | | `regions_all.json` |
| Only Urban Cluster keeps id and word at all three stops | CORRECT | | RESULTS s2 |
| Sonic "regions lean on sound traits" | IMPRECISE | 3 of 11 are trait-named, the same count as Balanced (3 of 18) | `regions_all.json` |
| "It applies per stop in the same way" | reasoned, not run | | RESULTS s8 "Not run" |

### Section 8, rendering

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| "the same class of renderer the e2e tests use" | IMPRECISE | It is the perf script's software mode (SwiftShader). In that mode the app's frame-gap budgets are not enforced, and the app itself takes about 100 ms per map frame there | `frontcreck/scripts/perf/perf.mjs` lines 22, 160; `lib.mjs` |
| Live full resolution 114 / 114 | IMPRECISE | 110 to 114 ms at both sizes | builder's report |
| Live half resolution 41 / 35 | WRONG | 37 to 41 ms at both sizes; 35 is outside the reported range | builder's report |
| Baked 29 / 26 | IMPRECISE | 26 to 29 ms at both sizes; the split implies 10,000 points are faster | builder's report |
| "Budget: 50 ms frame gap while moving, one frame at idle" | CORRECT | | `budgets.json` |
| "The prototype draws nothing at idle" | UNSUPPORTED | Consistent with render on demand in `app.js`; no idle count in the sources | |
| Stars one draw call, matches the app | CORRECT | | `AlbumField.tsx` |
| "10,000 of them cost nothing measurable" | UNSUPPORTED | No separate star timing in the sources; consistent with baked frames being equal at both sizes | |
| Percentile normalisation and shoulder | CORRECT | | `gas.js` |
| `COVER_WORLD` 1.4 times the gap | CORRECT | | `zoomLimits.ts` comment |
| Max zoom "by the same factor (about 1.6)" | IMPRECISE | 1.57 by the square-root rule for 10,000; 1.78 on the synthetic cloud, which is what the prototype applies | `report_synth.json` gaps; `camera.js` maxPpw |
| "Regions for three stops are about 60 KB" | IMPRECISE | `regions_all.json` is 122 KB (58 KB region records, 59 KB per-album index arrays). The prototype's slimmed copy is 72 KB | file sizes |
| "Family weights are six bytes per album" | IMPRECISE | True if packed as bytes (24 KB). The prototype ships JSON integers, 60 KB | `prototype/data/data.js` |
| Baked images "a few hundred KB each as WebP" | UNSUPPORTED | No baked file exists; the prototype bakes in WebGL at run time | `gas.js` |
| 200 KB first-load script budget | CORRECT | gzip | `budgets.json` |
| Thumbnail sheet 4,096; atlases 4 to 11, about 24 MB | CORRECT | estimate in the study | `solutions_scaling_10k.md` s5; `constants.py` |
| "`validate.py` and two tests pin today's counts" | IMPRECISE | `validate.py` requires at least 4,000 albums and one 64 by 64 thumbnail sheet. 4,081 is pinned in two pipeline test files and two frontend test files | `validate.py`; `test_outputs.py`, `test_recommender.py`, `server.test.ts`, `sprites.test.ts` |

### Section 9, run or reasoned

| Claim | Verdict | Correct value | Source |
|---|---|---|---|
| "11 real UMAP fits" | CORRECT | | RESULTS s3 |
| "then 8 more for the anchored-layout comparison" | WRONG | 10: seven at 500 epochs (three prefix, three random, one seed change) and three at 200 epochs | `run_stabilisers.py`; `report_stabilisers.json` umap_seconds |
| "Carry-forward and anchoring, on those series" | IMPRECISE | On the prefix series and the first random series only; the second random series was not run | RESULTS s8 "Not run" |
| The study expects more classical, Japanese, punk and game music | CORRECT | | `solutions_scaling_10k.md` open risks |

## 2. Over-claims and missing caveats

1. **The guard threshold contradicts the measured mean.** Section 4 proposes re-finding regions when unnamed albums pass about 40%. Carry-forward's mean under growth is 43% (37% with absorb), so without absorb the guard would fire on an ordinary build. Section 3 warns at 45%. Three thresholds, none run.
2. **Absorb is not stated as part of the plan.** RESULTS recommends turning absorb on. SCALING's headline numbers (72%, 43%) are without it, and the text calls it a recovery step only.
3. **Bloat is not mentioned.** Under carry-forward the largest region reaches 629 albums on the random series (711 with absorb), about twice recluster's largest, and the region count stays at 9 to 11 while recluster reaches 18. Three steps is too short to say whether name-word coverage erodes.
4. **Carry-forward started from each series' own automated regions**, not from the hand regions, and was run for three steps on two series at the Balanced stop.
5. **"It applies per stop in the same way" is reasoned.** Section 7 matches Sonic and Mood to Balanced with `find_regions` matching. How that cross-stop id matching combines with per-stop carry-forward is not designed or run.
6. **Section 7's counts use the 15-gap bandwidth**, which is 0.117 map units on Sonic and 0.095 on Mood. Under the fixed-extent rule section 3 recommends, Mood would be clustered at 0.12 units (19 gaps) and its 20 regions and 14 words would change. Not run.
7. **The 10k label demo uses the bandwidth the plan rejects** (see section 5 rows above).
8. **The 92% is one seed pair.** The two colour hold-out trials differ by 10 points (89% and 99%), which shows how much a single trial can move.
9. **Predicting traits will probably not save The Live Belt.** Liveness is predicted with R² under 0.3 in the genre-crossing report. Tempo, one of the nine colour traits, is also under 0.3. Option 1 in section 6 "keeps today's colours" only as far as the well-predicted traits carry them.
10. **`validate.py` reads only the output folder today.** Recomputing gates "from the feature table" needs a new input to the validator, or belongs in the build or a test.
11. **The merge cut is fragile.** One hand merge misses 0.72 by 0.0003 and RESULTS says to expect one merge more or fewer per build. SCALING presents the 15 of 17 match without this.
12. **"Matching adds 8 to 9 points" hides the spread**: no gain in three of nine steps.
13. **"Over budget on software rendering"** compares the live shader with a budget the app itself is exempt from on software rendering.
14. **Section 2 is dated.** It says it was checked on 2026-10-03; PR 31 was opened later the same day.
15. **Internal inconsistency in the factor for 10k**: section 8 uses about 1.6 (square root of 2.45), the prototype and the synthetic cloud use 1.78, and section 5's 2.7 is 1.7 multiplied by 1.6.
16. **T8 gates.** Section 2 says gates must be stated relative to tag density, but section 3 step 5 lists fixed gates. With fixed gates under T8, 42% of albums are unnamed and 7 of 15 words survive.
