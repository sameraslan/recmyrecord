# Scaling the map regions and colour families: results

Date: 2026-10-03. Everything here was run on the shipped 4,081-album data with the pipeline venv (Python 3.12, numpy 2.5.3, scikit-learn 1.9.1, umap-learn 0.5.12), one job at a time. Nothing outside `scaling/` was changed. Nothing is committed.

## Files

| Path | Contents |
|---|---|
| `auto_regions.py` | The recipe as pure functions: `find_regions`, `as_prev`, `public`, plus `median_gap`, `mean_shift`, `auto_merge`, `trim`, `match_previous`, `name_regions`. |
| `name_table.json` | Data word to approved place name, seeded from `regions/merge.json` (17 entries). |
| `common.py` | Loader (reads `frontcreck/public/data` and the feature table through `rmr_pipeline`). |
| `run_regions.py` | Deliverable 2. Writes `out/regions_auto_{balanced,sonic,mood}.json`, `out/regions_auto_balanced_continuity.json`, `out/regions_all.json`, `out/report_regions.json`. |
| `run_growth.py` | Deliverable 3. Writes `out/report_growth.json`, caches layouts in `out/growth_layouts.npz`. |
| `run_families.py`, `run_families_extra.py` | Deliverable 4. Write `out/family_loadings.json`, `out/report_families.json`, `out/report_families_extra.json`. |
| `run_synth.py` | Deliverable 5. Writes `out/synth10k.json`, `out/report_synth.json`. `run_synth.py sweep` prints the bandwidth sweep. |

Run any script from `scaling/` with `OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 NUMBA_NUM_THREADS=2 nice -n 10 ../../../../data-pipeline/.venv/bin/python <script>`.

## 1. The recipe (`find_regions`)

Signature: `find_regions(positions, W, words, audio_z=None, feature_names=None, name_table=None, prev=None, album_keys=None, stop="balanced", params=None)`.

Steps, in order:

1. **Scale.** `g` = median nearest-neighbour distance of the layout. Every bandwidth is a multiple of `g`.
2. **Blobs.** Mean-shift with bin seeding at `fine_bw * g`. Deterministic.
3. **Merge.** Greedy. A pair of blobs merges when it is adjacent and alike. Adjacent: for each of the two blobs, at least 20% of its boundary points (members with one of their 15 nearest neighbours outside the blob) have a neighbour in the other blob. Alike: the same leading qualifying word (best `coverage * log2(lift)` among words with coverage >= 0.35 and lift >= 1.8), or cosine >= 0.72 between `coverage * log2(lift)` profiles. Same-word pairs go first, then the highest cosine. Statistics are recomputed after every merge.
4. **Trim.** As `build_regions.py`: keep points with >= 70% of 15 neighbours in the same region, drop sparse stragglers (10th-neighbour distance above the 97th percentile), drop the farthest 8% from the median centre.
5. **Continuity.** If `prev` is given, match trimmed regions to previous regions on album keys present in both builds (section 4).
6. **Name.** Per region, among mood words (the six line-up words in `NON_NAME_WORDS` never name a region):
   - strong tier: coverage >= 0.40, lift >= 1.8, next region <= 0.8x this one;
   - fair tier: coverage >= 0.35, lift >= 1.8, and no other region has higher coverage of the word.
   Best score in the first tier that has a word. A word another region carries more often never names this one, so no two regions share a word. If no word qualifies and `audio_z` is given, the audio trait with the largest |mean z| >= 1.5 names it (one region per trait, most extreme region first). Otherwise the region is dropped and its albums are unnamed. "Next region" is taken over surviving regions, so naming repeats until the surviving set is stable.
7. **Place name.** `name = name_table.get(word)`. No entry gives `name: null, needs_name: true`. Nothing is invented.
8. **Coarse level.** Mean-shift at `coarse_mult * fine_bw * g`, not merged, not trimmed, same word gates, no audio names, no place names. Each fine region gets `parent` = the named area that holds more than half of its members, else null.
9. **Priority.** `2` (strong) or `1` (fair), plus `0.9 * n / n_max`, plus `0.09 * margin` (coverage above 0.35, or |z| above 1.5, clipped to 1). Areas add 10. Higher shows first.

Output per stop: `{stop, n_albums, gap, bandwidth_gaps, bandwidth, coarse_bandwidth_gaps, blobs, merged_blobs, coarse_blobs, merges, regions, album_region, album_area, retired}`. Each region has the fields in the brief (`id, level, parent, word, named_from, name, needs_name, plain, strength, priority, cx, cy, radius, hull, n, evidence, top_words, best_known, centre, prev_id, overlap, status`). `album_region` and `album_area` are positions in `regions` or -1. Areas come first in the list.

Audio words carry a sign: `liveness+`, `loudness-`. The name table uses the same keys, so "The Quiet Deep" can only attach to low loudness.

### Parameters

| Parameter | Value | Why |
|---|---|---|
| `fine_bw` | 15 gaps | 0.12 map units / 0.008 (shipped balanced gap) = 15.0. On sonic 0.12 units is 15.4 gaps, on mood 19.0 gaps. |
| `coarse_mult` | 2.5 | Gives 5 named areas on balanced (2.0 gives 7 of 9 blobs covering 93% of albums, 2.25 gives 7 of 8, 3.0 gives 2 of 4). |
| `adj_min` | 0.20 | The weakest hand merge has mutual adjacency 0.23. |
| `cos_min` | 0.72 | Tuned on the shipped balanced layout only. See the sensitivity table. |
| `knn, interior, straggler_pct, far_pct` | 15, 0.70, 97, 92 | Copied from `build_regions.py`. |
| `min_n` | 30 | Percentages on fewer than 30 albums are noisy. Drops the 18-album spoken-word islet, as the hand step did. |
| `cov_strong, cov_fair, lift_min, excl, audio_z` | 0.40, 0.35, 1.8, 0.8, 1.5 | The honesty thresholds in `regions/regions.md`. |
| `match_jaccard, match_contain` | 0.30, 0.50 | Section 4. |
| `hysteresis` | 1.5 | Section 4. |

### Runtime of `find_regions`

| Points | Bandwidth | Seconds |
|---|---|---|
| 4,081 (balanced, sonic, mood) | 15 gaps | 0.45 to 0.55 |
| 10,000 synthetic | 26.7 gaps (0.12 units) | 0.67 |
| 10,000 synthetic | 15 gaps | 1.4 |
| 10,000 synthetic | 10 gaps | 2.4 |

Time grows with the number of blobs (the merge loop), not much with points.

## 2. Automatic regions against the hand-made ones (balanced)

Run: `find_regions` on shipped balanced positions, 13 Spotify z-scores allowed for audio names.

Mean-shift gives the same 25 blobs as `build_regions.py`.

| Merge group (blob ids) | Hand | Automatic | Why |
|---|---|---|---|
| 11 + 12 (aggressive) | yes | yes | same leading word, cosine 0.93 |
| 13 + 15 + 16 (epic) | yes | yes | same leading word "heavy" |
| 21 + 22 (sombre) | yes | yes | cosine 0.75 |
| 3 + 5 (bittersweet) | yes | no | cosine 0.66, leading words differ (romantic, bittersweet) |
| 18 + 23 (hypnotic) | yes | no | cosine 0.7197, under the 0.72 cut by 0.0003 |

No automatic merge is absent from the hand list. Three of five hand groups are reproduced.

Sensitivity to `cos_min` (pure run, against hand regions):

| `cos_min` | Merged blobs | Regions | ARI | What changes |
|---|---|---|---|---|
| 0.70 | 18 | 16 | 0.879 | also merges 18+23 (hand) and 2+3+5 (pastoral into bittersweet, not in hand) |
| 0.72 | 21 | 18 | 0.931 | chosen |
| 0.75, 0.80 | 22 | 19 | 0.909 | loses 21+22 |

The hand merges are not separable by one cosine cut. Pairs the hand step merged score 0.66 to 0.93 and pairs it kept apart score up to 0.73 (aggressive against raw, before recomputation). 0.72 adds no merge the hand step rejected. The margin is thin: 18+23 (hand) sits at 0.7197 and 2+3 (not hand) at 0.7126, so a cut between 0.713 and 0.7197 would reproduce four of five hand groups. That window is 0.007 wide and was not used, because choosing it would be fitting one layout. Treat `cos_min` as approximate and expect one merge more or fewer per build.

### Per hand region

Two runs. Pure: `prev=None`. Continuity: `prev` = hand regions.

| Hand region | n | Auto match (both runs) | Jaccard | Word, pure run | Word, continuity run | Strength agrees |
|---|---|---|---|---|---|---|
| live | 174 | same members | 1.00 | liveness+ | liveness+ (kept) | yes |
| urban | 232 | same members | 1.00 | **sampling** (no name) | urban (kept) | yes |
| improv | 290 | same members | 1.00 | improvisation | kept | yes |
| quiet | 242 | same members | 1.00 | loudness- | kept | yes |
| pastoral | 226 | same members | 1.00 | pastoral | kept | yes |
| lonely | 82 | same members | 1.00 | lonely | kept | yes |
| bittersweet | 321 | blob 3 only, n 186 | 0.57 | **romantic** (no name) | **romantic** (renamed) | yes (fair) |
| warm | 106 | same members | 1.00 | warm | kept | yes |
| playful | 196 | same members | 1.00 | playful | kept | yes |
| eclectic | 152 | same members | 1.00 | eclectic | kept | yes |
| progressive | 141 | same members | 1.00 | progressive | kept | yes |
| ethereal | 121 | same members | 1.00 | ethereal | kept | yes |
| aggressive | 184 | same members | 1.00 | aggressive | kept | yes |
| raw | 107 | same members | 1.00 | raw | kept | yes |
| epic | 346 | same members | 1.00 | epic | kept | yes |
| sombre | 106 | same members | 1.00 | sombre | kept | yes |
| hypnotic | 137 | blob 18 only, n 104 | 0.76 | **instrumentalness+** (no name) | **instrumentalness+** (renamed) | no (hand fair, auto strong) |

| Measure | Pure | Continuity |
|---|---|---|
| Regions emitted | 18 (13 strong, 5 fair) | 18 (13 strong, 5 fair) |
| Hand regions with identical members | 15 of 17 | 15 of 17 |
| Name word agrees | 14 of 17 | 15 of 17 |
| Strength agrees | 16 of 17 | 16 of 17 |
| Hand regions with no auto counterpart (Jaccard < 0.3) | 0 | 0 |
| Auto regions with no hand counterpart | 1 (bittersweet, blob 5, n 127, fair) | 1 (same, id `bittersweet-2`) |
| Adjusted Rand index, all albums | 0.931 | 0.931 |
| Adjusted Rand index, albums named in both | 0.965 | 0.965 |
| Albums unnamed | 23.5% (hand 22.5%) | 23.5% |
| Status | 18 new | 15 kept, 2 renamed, 1 new, 0 retired |
| Approved place names in use | 15 | 16 |

Where it differs and why:

- **Urban.** Pure automation picks "sampling" (82%, 9.6x) over "urban" (89%, 6.1x) because it scores higher. With `prev`, "urban" is kept. The table has no entry for "sampling".
- **Bittersweet.** Not merged. Blob 5 owns "bittersweet" (61%). Blob 3 has it at 58%, so by the ownership rule it takes "romantic" (36%, 3.3x, fair). "The Bittersweet Reach" survives on blob 5 under a new id.
- **Hypnotic.** Not merged. Blob 23 (hypnotic 71%) trims to 24 albums and is dropped by `min_n`. Blob 18 has hypnotic at 32%, below the gate, so it gets the audio name instrumentalness+ (z +1.65). "Hypnotic Orbit" does not survive. This is the only approved name lost.
- Blob 6 (playful 36% after trim, 1.7x) and the islet stay unnamed in both, as in the hand version.

Broad areas on balanced (5 of 6 coarse blobs named, 99.6% of albums inside a named area): bittersweet (1,516, strong), heavy (865, strong), improvisation (891, fair), energetic (429, strong), urban (362, strong). All 18 regions have a parent.

### Sonic and Mood

`prev` = the balanced continuity regions. Sonic allows audio names. Mood uses words only.

| Stop | Gap | Blobs | After merge | Regions | Strong / fair | Unnamed | Kept / renamed / new | Named areas | Albums in a named area |
|---|---|---|---|---|---|---|---|---|---|
| balanced | 0.0080 | 25 | 21 | 18 | 13 / 5 | 23.5% | 15 / 2 / 1 | 5 of 6 | 99.6% |
| sonic | 0.0078 | 25 | 14 | 11 | 9 / 2 | 31.2% | 5 / 4 / 2 | 3 of 6 | 49.8% |
| mood | 0.0063 | 30 | 25 | 20 | 14 / 6 | 34.7% | 3 / 3 / 14 | 6 of 6 | 100% |

Sonic (11): approved name through the table for 7: Improv Arm (improvisation), The Quiet Deep (loudness-), Urban Cluster (urban), The Live Belt (liveness+), Playful Way (playful, fair), The Bittersweet Reach (bittersweet), Progressive Spiral (progressive, fair). Need a name, 4: heavy (613 albums), atmospheric (347), danceability+ (60), lush (54). Kept from balanced with the same id and word: improv, quiet, urban, live, playful.

Mood (20): approved name for 6: Aggressive Rift, Urban Cluster, Sombre Void (these three kept by id), Progressive Spiral, Epic Expanse, Warm Halo (new ids, same word). Need a name, 14: longing, soothing, acoustic, quirky, mellow, avant-garde, psychedelic, ominous, noisy, mysterious, anthemic, suspenseful, energetic, melodic.

Only Urban Cluster keeps both its id and its word at all three stops.

**The coarse level fails on sonic.** Three areas (heavy, acoustic, urban) cover half the albums. The other three coarse blobs do not pass the word gates. That is expected: the sonic layout is organised by audio, and areas were restricted to words. On balanced and mood the coarse level works.

`regions_all.json` holds the continuity run for balanced, and the sonic and mood runs above.

## 3. Growth simulation

Run with the real layout code (`rec_matrix` at the balanced slider, `UMAP(**UMAP_PARAMS)`, `finalize_layouts`), balanced stop only. Balanced is the Procrustes reference, so its final positions do not depend on the other two stops. 11 UMAP fits, one at a time (3 s at 1,600 points, 5 s at 2,400, 9 s at 3,200, 13 s at 4,081).

**Reproduction check.** The full-size rerun, rounded as `flat_positions` does, equals the shipped balanced positions exactly (maximum difference 0.0).

Positions are used unrounded here, as a pipeline stage would see them. The unrounded gap is 0.00792 against 0.008 after rounding, and that 1% is enough to give 26 blobs instead of 25. The emitted regions are the same 18.

Each step runs `find_regions` twice: matched (`prev` = previous step) and naive (`prev=None`). Shares are over albums present in both steps. "Named" restricts to albums that were in a region at the previous step.

### Per step

| Series | n | Gap | Blobs | After merge | Regions (strong / fair) | Unnamed | Areas |
|---|---|---|---|---|---|---|---|
| prefix | 1,600 | 0.0116 | 14 | 13 | 12 (10 / 2) | 20.3% | 3 |
| prefix | 2,400 | 0.0083 | 19 | 17 | 15 (13 / 2) | 26.0% | 2 |
| prefix | 3,200 | 0.0086 | 21 | 17 | 13 (13 / 0) | 29.4% | 3 |
| prefix | 4,081 | 0.0079 | 26 | 21 | 18 (13 / 5) | 23.5% | 5 |
| random seed 1 | 1,600 | 0.0132 | 12 | 11 | 9 (8 / 1) | 23.0% | 2 |
| random seed 1 | 2,400 | 0.0115 | 18 | 16 | 13 (8 / 5) | 30.7% | 1 |
| random seed 1 | 3,200 | 0.0100 | 19 | 16 | 14 (11 / 3) | 26.0% | 2 |
| random seed 1 | 4,081 | 0.0079 | 26 | 21 | 18 (14 / 4) | 23.5% | 5 |
| random seed 2 | 1,600 | 0.0124 | 12 | 10 | 9 (9 / 0) | 28.9% | 1 |
| random seed 2 | 2,400 | 0.0100 | 18 | 14 | 13 (9 / 4) | 18.4% | 2 |
| random seed 2 | 3,200 | 0.0105 | 20 | 17 | 14 (10 / 4) | 25.6% | 2 |
| random seed 2 | 4,081 | 0.0079 | 26 | 21 | 18 (13 / 5) | 23.5% | 5 |

### Against the previous step

Region columns are from the matched run. Album columns: share of previously named albums that keep the same region id (matched), the same name word (matched), the same name word (naive).

| Step | Kept / renamed / new / retired | Id same, matched | Word same, matched | Word same, naive | Named albums that became unnamed | Region words surviving, matched | naive |
|---|---|---|---|---|---|---|---|
| prefix 1,600 to 2,400 | 7 / 3 / 5 / 2 | 57% | 45% | 45% | 21% | 7 of 12 | 8 of 12 |
| prefix 2,400 to 3,200 | 9 / 2 / 2 / 4 | 62% | 57% | 43% | 18% | 9 of 15 | 6 of 15 |
| prefix 3,200 to 4,081 | 10 / 1 / 7 / 2 | 68% | 65% | 65% | 17% | 10 of 13 | 12 of 13 |
| random 1, 1,600 to 2,400 | 6 / 3 / 4 / 0 | 58% | 38% | 30% | 23% | 6 of 9 | 7 of 9 |
| random 1, 2,400 to 3,200 | 9 / 3 / 2 / 1 | 77% | 66% | 50% | 17% | 9 of 13 | 7 of 13 |
| random 1, 3,200 to 4,081 | 12 / 2 / 4 / 0 | 69% | 64% | 50% | 18% | 12 of 14 | 10 of 14 |
| random 2, 1,600 to 2,400 | 8 / 1 / 4 / 0 | 70% | 68% | 49% | 17% | 8 of 9 | 6 of 9 |
| random 2, 2,400 to 3,200 | 9 / 1 / 4 / 3 | 61% | 57% | 51% | 21% | 9 of 13 | 10 of 13 |
| random 2, 3,200 to 4,081 | 10 / 4 / 4 / 0 | 71% | 50% | 52% | 16% | 10 of 14 | 11 of 14 |
| **same albums, UMAP seed 42 to 7** | 14 / 2 / 5 / 2 | 72% | 70% | 62% | 16% | 14 of 18 | 13 of 18 |

Means over the nine growth steps, previously named albums: region id unchanged 66% (matched). Name word unchanged 57% matched, 48% naive. Over all albums including unnamed ones the word figures are 53% matched and 47% naive.

What this says:

- **Layout noise is the floor.** With the same 4,081 albums and only the UMAP seed changed, 70% of named albums keep their name word with matching and 62% without. Growth steps sit at or below that. Most of the churn comes from UMAP redrawing the map, not from the new albums.
- **Matching with hysteresis helps, modestly.** About 9 points on name words on average, and it is not uniform: in three of nine steps it made no difference or was slightly worse.
- **A steady 16 to 23% of named albums fall out of any region at each step.** That part is trimming and blob geometry. No naming rule can fix it.
- **Region count follows the gap.** At 1,600 points the gap is larger, 15 gaps is a wider kernel in map units, and there are 12 to 14 blobs. See section 5 for the same effect at 10,000.

Not run: growth beyond 4,081 with real albums (there are none yet), and the sonic and mood stops.

### Continuity rule, as implemented

- Overlap is computed on album keys present in both builds, so growth alone does not lower it.
- A pair is acceptable when Jaccard >= 0.30, or when >= 50% of the smaller set is shared (a region that split or was absorbed) and the shared set has at least 15 albums. 0.30 is where two equal-sized regions share a little under half of each. Only acceptable pairs enter `linear_sum_assignment`, which maximises total Jaccard one-to-one.
- A matched region keeps the previous id. It keeps the previous word if that word still passes the fair gate here and no other region carries it more often. The one exception: the kept word is only fair, and a challenger is strong and scores at least 1.5x higher. Then the word changes.
- A previous audio name is kept while the same trait, same sign, is still at |z| >= 1.5 and no other region has taken it.
- Status: `kept` (matched, same word), `renamed` (matched, different word), `new`. Previous regions with no live successor are listed in `retired` with a reason.
- The place name always comes from the table by word, never from `prev`, so an owner edit to the table takes effect at the next build.

## 4. Colour families

Recipe from `regions/build_colour.py`: NMF k=5, nndsvda, descriptor presence (99 words on >= 40 albums, weighted by sqrt(log(1/frequency))) plus nine audio z-scores split by sign, blocks scaled to equal energy.

**Refit check.** Refitting with scikit-learn 1.9 reproduces the stored `album_weights`: largest difference 0.005, leading family the same for 99.5% of the 3,951 albums whose stored neutral weight is below 0.5 ("clear" albums below).

### Subsets, matched to the full fit by cosine

| Fit on | fierce | warm | quiet | dark | urban | Anchor words pick five distinct components | Leading family same as full fit |
|---|---|---|---|---|---|---|---|
| prefix 1,600 | 0.52 | 0.95 | 0.90 | 0.67 | 0.97 | no | 65% |
| prefix 2,400 | 0.53 | 0.99 | 0.92 | 0.72 | 0.99 | no | 72% |
| prefix 3,200 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | yes | 98% |
| random half, seed 1 | 1.00 | 0.99 | 1.00 | 1.00 | 0.99 | yes | 97% |
| random half, seed 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | yes | 96% |

The families are stable under random halving. They are not stable under a change of composition: the top 1,600 and 2,400 chart albums give a different fierce and dark, and the anchors no longer separate five components. Growth to 10,000 is a change of composition (lower-ranked albums), so a refit at 10,000 cannot be assumed to give the same five.

### Without Spotify audio

| Fit | Words used | fierce | warm | quiet | dark | urban | Anchors distinct | Albums whose leading family changes |
|---|---|---|---|---|---|---|---|---|
| descriptor-only, full presence | 99 | 0.86 | 0.95 | 0.39 | 0.68 | 0.38 | no | 55% |
| descriptor-only, T8 presence | 81 | 0.92 | 0.92 | 0.79 | 0.85 | 0.17 | no | 52% |

Cosines are on the word loadings. Descriptor-only fits do not return the same five. Fierce and warm survive. With full presence the other three become progressive/complex/technical, sombre/melancholic/lonely and hypnotic/ethereal/psychedelic. With T8 presence four match loosely and urban is replaced by progressive/complex. The audio block is what holds quiet and urban in place.

### T8 simulation

What was done: per album, rank every descriptor column in the table (the 120 recommender columns and the 56 lyric columns) by its weight. The weight is a rank score: 1.5 for the first name, falling by 1/42 per position. Zero the 13 columns that go empty, keep the top 8, then restrict to the 120 columns. Result: 5.80 names per album in the 120 columns (was 10.77), 14 empty columns, 58 albums with no word.

Coverage of each name word inside the same region members falls to a median of 0.71x. Lift rises for every word, because the overall frequency falls more.

| Word | Coverage, full | Coverage, T8 | Lift, full | Lift, T8 |
|---|---|---|---|---|
| improvisation | 0.82 | 0.76 | 7.7 | 8.5 |
| sampling | 0.82 | 0.56 | 9.6 | 10.8 |
| playful | 0.61 | 0.49 | 2.9 | 3.4 |
| aggressive | 0.97 | 0.80 | 6.8 | 8.6 |
| progressive | 0.78 | 0.67 | 4.2 | 6.0 |
| ethereal | 0.47 | 0.30 | 4.8 | 6.0 |
| raw | 0.89 | 0.69 | 5.6 | 7.2 |
| warm | 0.74 | 0.57 | 3.2 | 4.1 |
| sombre | 0.76 | 0.51 | 5.5 | 6.1 |
| lonely | 0.51 | 0.35 | 4.3 | 5.6 |
| epic (fair) | 0.54 | 0.38 | 3.6 | 4.1 |
| pastoral (fair) | 0.39 | 0.25 | 5.7 | 5.9 |
| romantic (fair) | 0.36 | 0.29 | 3.3 | 4.1 |
| eclectic (fair) | 0.38 | 0.24 | 2.6 | 3.4 |
| bittersweet (fair) | 0.61 | 0.39 | 2.8 | 3.1 |

With members held fixed, all 15 word-named regions keep their word if the gates become strong >= 0.29 and fair >= 0.24. The weakest strong region is ethereal at 0.298 and the weakest fair one is eclectic at 0.243. Lift 1.8 is not binding (lowest T8 lift 3.1).

End to end, `find_regions` on shipped balanced positions with T8 presence, words only, compared with the same run on full presence (15 regions):

| Gates (strong / fair coverage, lift) | Regions | Strong | Unnamed | Region words kept | Named albums with the same word |
|---|---|---|---|---|---|
| 0.40 / 0.35, 1.8 (unchanged) | 13 | 10 | 42% | 7 of 15 | 49% |
| 0.29 / 0.24, 1.8 | 15 | 12 | 34% | 10 of 15 | 65% |
| 0.25 / 0.20, 1.8 | 15 | 12 | 34% | 10 of 15 | 65% |
| 0.25 / 0.20, 2.5 | 15 | 12 | 33% | 10 of 15 | 65% |
| 0.216 / 0.189, 1.8 (scaled by names per album) | 17 | 15 | 24% | 9 of 15 | 56% |
| 0.20 / 0.15, 2.5 | 16 | 14 | 27% | 9 of 15 | 56% |

Lowering the gates does not bring back the same regions. The merge step also reads word profiles, and under T8 it merges different blobs: 18+23 and 3+5 now merge (the two hand merges missed on full presence), and it also merges 16+21 and 1+18, which neither the hand step nor the full-presence run did. So T8 changes the regions, not only the thresholds.

Recommendation: state the coverage gates relative to tag density. Multiply 0.40 and 0.35 by 0.71 (the measured coverage ratio), giving about 0.29 and 0.25, or recompute the ratio at build time as median T8 coverage over median full coverage on albums that have both. Keep lift at 1.8 or raise it. Expect about a third of the names to change when T8 arrives regardless. Retune `cos_min` on a T8 layout, since it was set on full presence.

Not run: a UMAP layout built from T8 descriptors. The T8 runs above reuse the shipped positions, which were laid out with full descriptors.

### Pinned families

Mechanism: freeze the loadings once. Score an album by non-negative least squares of its feature row on the frozen loadings, then apply the stored weight formula with the frozen median activation. No NMF at build time, so the palette cannot reshuffle.

| Test | Result |
|---|---|
| Projection with the full-fit loadings, all albums, against stored `album_weights` | leading family same for 99.5% of clear albums, mean absolute weight difference 0.0016 |
| Fit on a random 70%, project the other 30% (1,225 albums), seed 1 | leading family same as stored for 89.3% of clear albums (88.7% of all). Component cosines to the full fit: 1.00, 0.96, 1.00, 1.00, 0.97 |
| Same, seed 2 | 98.7% of clear albums (98.4% of all). Cosines all >= 0.999 |
| Frozen joint loadings, word columns only (no audio), all albums | leading family same as stored for 65% of clear albums |
| Same with T8 presence | 61%. Mean neutral weight rises from 0.12 to 0.33 |
| Distilled table: non-negative linear map from words to the stored five weights, fit on 70%, tested on 30% | 65% and 66% with full presence, 61% and 62% with T8 presence |

Projection is sound: it reproduces the stored weights for albums it did not see, to the extent that the 70% fit finds the same components (seed 2 does, seed 1 drifts on warm and urban). The loss is all in the missing audio. With words alone, about a third of albums get a different leading family, and no word-only table tested does better than 65%.

`out/family_loadings.json` holds the frozen table: 99 words with their weights, the nine audio features with mean, standard deviation and clip, the block scale, five loading rows (words and 18 signed audio columns), loading norms, the median activation, the formula, and the distilled T8 word table. The distilled table is included for completeness. It is no better than projecting on the word block.

Reasoned, not run: the new audio block is a 64-d embedding that all albums will have. A map from that embedding to the nine z-scores, fitted on the 4,081 albums that have both, would let new albums use the full frozen loadings. That is the test to run before accepting word-only colour for 6,400 albums.

## 5. Synthetic 10,000-point cloud

`out/synth10k.json`. The first 4,081 points are the shipped balanced positions. The other 5,919 each copy a random real album (`src`) and add Gaussian jitter with RMS length equal to that album's local gap (mean distance to its 3 nearest neighbours). Words and audio z-scores are copied from `src`. `prev` = the balanced continuity regions, so approved names carry over through the 4,081 shared keys. The coarse bandwidth is held at 0.30 map units (the size used on the real layout).

The median gap falls from 0.0080 to 0.0045. Fifteen gaps is then 0.067 map units, not 0.12.

| Run | Bandwidth | Blobs | After merge | Regions (strong) | With approved name | Need a name | Unnamed albums | Areas | Regions with a parent |
|---|---|---|---|---|---|---|---|---|---|
| `regions_default` | 15 gaps = 0.067 units | 83 | 54 | 31 (21) | 7 | 24 | 46.6% | 4 of 5 | 30 |
| `regions_fine` | 10 gaps = 0.045 units | 179 | 109 | 38 (25) | 10 | 28 | 65.5% | 4 of 5 | 37 |
| check, not saved in synth10k.json | 26.7 gaps = 0.12 units | 24 | 21 | 20 (14) | 16 | 4 | 18.7% | 4 of 5 | 19 |

Sweep at other bandwidths: 12 gaps gives 37 regions, 9 gives 45, 8 gives 44, 7 gives 49, 6 gives 50 (before audio names were made unique, which removed 2 to 4).

**A fixed multiple of the gap does not hold region size as the catalogue grows.** The gap shrinks roughly with the square root of density, so the same 15 gaps finds 83 blobs at 10,000 points against 25 at 4,081, and nearly half the albums end up unnamed. Holding 0.12 map units instead gives 20 regions and 16 approved names on the same cloud. For a constant region size, scale the multiple with `sqrt(n / 4081)` (about 23.5 at 10,000 real albums), or define the bandwidth as a fraction of the layout's extent. If more, smaller regions at 10,000 are wanted, keep 15 and expect many unnamed albums and many regions that need a name.

The synthetic cloud is denser than a real 10,000-album layout is likely to be, because resampling piles points onto existing clusters.

## 6. What a pipeline stage should contain

`rmr_pipeline/regions.py`:

- `find_regions` and helpers as in `auto_regions.py`, called once per stop on the unrounded layout. Balanced first with `prev` = the previous build's balanced regions, then sonic and mood with `prev` = this build's balanced regions.
- Inputs from the build: positions per stop, descriptor presence, album keys (the stable RYM id once it exists), the audio block. Audio naming needs named traits. With a 64-d embedding there are none, so either pass `audio_z=None` (two of today's names, The Live Belt and The Quiet Deep, then disappear) or derive named traits from the embedding.
- `name_table.json` as the only owner-edited file, keyed by data word, with signed keys for audio traits.
- A committed `regions_prev.json` (output of `as_prev`) read at the start of the build and rewritten at the end. Without it there is no continuity.
- Output `regions.json` = `{balanced, sonic, mood}` in the schema above, next to `positions.json`.
- A build log line per stop: blobs, merges, regions, kept / renamed / new / retired, words that need a name.
- The bandwidth rule decided explicitly (section 5).
- Pinned colour families: `family_loadings.json` committed, a `colour.py` that projects every album and writes the weights. No NMF in the build.

`validate.py` checks:

- Schema and types. `album_region` and `album_area` have one entry per album and index a region of the right level or are -1. `n` equals the number of albums pointing at the region.
- Every level-1 region passes its gate when recomputed from the feature table: coverage >= 0.35 and lift >= 1.8 for words, and coverage >= 0.40 with next <= 0.8x for strong. |z| >= 1.5 for audio names. Fail the build if not.
- No two regions at one stop share a word. Ids are unique. `name` is either null or exactly `name_table[word]`, and `needs_name` is true exactly when it is null.
- `parent` is null or the id of a level-0 region at the same stop.
- `status`, `prev_id` and `overlap` are consistent (`new` has null `prev_id`. `kept` has the same word as the previous region).
- `best_known` and `centre` are valid album indexes inside the region. The hull has 3 to 24 vertices and contains the centroid.
- Sanity bounds that warn, not fail: unnamed share above 45%, fewer than 6 or more than 60 regions, more than a third of previous regions retired in one build, fewer than 3 named areas.
- Family weights: six non-negative numbers summing to 1 per album. The frozen loadings file hash is pinned.

## 7. Run, or only reasoned

Run: everything in sections 2 to 5 except where marked.

Reasoned only: behaviour at a real 10,000-album catalogue. A layout built from T8 descriptors. A layout built with the 64-d audio block. The embedding-to-trait map for colour. Growth simulation on sonic and mood. The open-branch layout code that normalises stops to a shared gap was not used. The shipped positions and `main`'s `layout.py` were.

Failed or skipped: nothing failed. The venv worked, so the x86 fallback was not needed.

## 8. Stabilisers

Follow-up to section 3. Two ways to keep regions and names steadier across rebuilds were tested on the prefix series and the first random series (1,600 to 2,400 to 3,200 to 4,081), and on the "same albums, UMAP seed 42 to 7" case. Balanced stop only. Script: `run_stabilisers.py`. Code: `carry_forward.py` (`carry_forward_regions`). Numbers: `out/report_stabilisers.json`. Layout cache: `out/stabiliser_layouts.npz`.

### A. Anchored layout

UMAP is initialised from the previous step's layout instead of the spectral init. Albums present before start at their previous coordinates. Each new album starts at the mean position of its 5 nearest previous albums in the feature matrix, plus Gaussian jitter of 0.001 map units from a fixed seed. The final (normalised) coordinates of the previous step were used. UMAP rescales any init array to 0..10 per axis, so the pre-normalisation embedding would give the same start. Then the same `finalize_layouts`.

Layout stability between consecutive steps, for albums present in both. Movement is after the best rotation, reflection and translation (no scaling), in gaps of the new layout. Neighbour retention is the share of an album's 15 map neighbours kept, computed among the shared albums.

| Series, step | Fresh: median / p90 move | Fresh: neighbours kept | Anchored: median / p90 move | Anchored: neighbours kept |
|---|---|---|---|---|
| prefix 1,600 to 2,400 | 41.7 / 88.5 | 43% | 22.5 / 62.7 | 45% |
| prefix 2,400 to 3,200 | 16.7 / 47.0 | 45% | 8.2 / 18.3 | 43% |
| prefix 3,200 to 4,081 | 50.7 / 75.2 | 37% | 8.0 / 18.5 | 42% |
| random 1,600 to 2,400 | 9.8 / 27.8 | 46% | 4.7 / 13.6 | 48% |
| random 2,400 to 3,200 | 7.4 / 16.7 | 43% | 7.5 / 17.2 | 42% |
| random 3,200 to 4,081 | 14.3 / 41.5 | 41% | 7.0 / 15.0 | 42% |
| same albums, seed 42 to 7 | 4.3 / 7.5 | 59% | 4.4 / 8.5 | 59% |

Anchoring keeps the map in the same place: on the prefix series the median move falls from 17 to 51 gaps to about 8. It does not keep local neighbourhoods: about 42% of map neighbours survive a rebuild either way, and 59% when nothing changes but the seed. UMAP's 500 epochs of optimisation reshuffle neighbours regardless of the start.

Quality of the full-size layout (4,081 albums):

| Layout | Feature-space 15 neighbours found among 15 map neighbours | Trustworthiness (k=15) |
|---|---|---|
| fresh, shipped (seed 42) | 20.8% | 0.9043 |
| fresh, seed 7 | 20.8% | 0.9038 |
| anchored, end of prefix chain | 20.6% | 0.9026 |
| anchored, end of random chain | 20.6% | 0.9029 |
| anchored from the shipped layout, seed 7 | 20.6% | 0.9052 |
| anchored, 200 epochs, end of prefix chain | 19.9% | 0.9004 |

Anchoring does not damage the map. The lower-epoch variant (200 instead of 500) is slightly worse on both measures, does not move albums less (median 9.5 to 21.8 gaps on the prefix series) and does not help regions. It is not worth using.

### B. Membership carry-forward

`carry_forward_regions(positions, W, words, features, prev, ...)`. `prev` is `as_prev(out, keys, roster=True)`: each region's untrimmed member list (`album_roster` in the output).

1. Every previous region keeps its members.
2. A new album joins the region that holds at least 60% of its 15 nearest feature-space neighbours among previously placed albums. Otherwise it is unassigned.
3. Contiguity gate in the new layout: cohesion (share of members' 15 map neighbours that are members) >= 0.5, and at least 70% of members in one connected piece of the map-neighbour graph. A region that fails is retired. In a region that passes, members outside the main piece are released. "One connected piece" replaces "within one blob" from `regions.md`, because merged regions span several mean-shift blobs by construction.
4. New regions: mean-shift and merge only among albums in no surviving region.
5. Trim to interiors as usual, then the existing naming code with the previous word as the hysteresis word. A region that no longer passes the gates is retired. One whose word changes is `renamed`.
6. Areas (level 0) are re-found and matched as before.

Optional `absorb` (off by default, tested as a variant): an unassigned album joins a surviving region when at least 70% of its 15 map neighbours are in it.

### Comparison

Means over the six growth steps (prefix and random series). Album shares are over albums that were in a region at the previous step, except "unnamed", which is over all albums at the new step.

| Layout + regions | Region id unchanged | Name word unchanged | Fell out of any region | Moved to another word | Albums unnamed | Regions | Kept / renamed / new / retired |
|---|---|---|---|---|---|---|---|
| fresh + recluster (section 3) | 65% | 56% | 19% | 25% | 27% | 15.2 | 8.8 / 2.3 / 4.0 / 1.5 |
| fresh + carry-forward | 74% | 72% | 20% | 8% | 43% | 13.0 | 8.8 / 0.8 / 3.3 / 2.0 |
| fresh + carry-forward + absorb | 77% | 74% | 18% | 8% | 37% | 12.3 | 9.0 / 0.7 / 2.7 / 1.8 |
| anchored + recluster | 63% | 55% | 21% | 24% | 28% | 14.8 | 8.8 / 1.8 / 4.2 / 2.0 |
| anchored + carry-forward | 77% | 74% | 21% | 6% | 44% | 12.2 | 8.7 / 0.8 / 2.7 / 1.3 |
| anchored + carry-forward + absorb | 79% | 74% | 18% | 8% | 35% | 11.0 | 9.0 / 0.8 / 1.2 / 1.0 |

Same albums, UMAP seed 42 to 7 (18 regions before):

| Layout + regions | Region id unchanged | Name word unchanged | Fell out of any region | Albums unnamed | Kept / renamed / new / retired |
|---|---|---|---|---|---|
| fresh + recluster | 72% | 70% | 16% | 24.7% | 14 / 2 / 5 / 2 |
| fresh + carry-forward | 92% | 92% | 9% | 26.9% | 18 / 0 / 0 / 0 |
| anchored + recluster | 77% | 72% | 17% | 28.5% | 15 / 1 / 2 / 2 |
| anchored + carry-forward | 91% | 91% | 9% | 26.3% | 18 / 0 / 0 / 0 |

Per step the growth figures vary a lot. Name word unchanged, fresh + carry-forward: 68%, 69%, 65% on the prefix series and 81%, 75%, 74% on the random series. Fresh + recluster on the same steps: 45%, 57%, 65% and 38%, 66%, 64%.

Carry-forward diagnostics, six growth steps:

| | Not contiguous, per step | Fail the gates, per step | New albums that join a region |
|---|---|---|---|
| fresh + carry-forward | 3, 4, 2, 1, 0, 1 | 0, 1, 0, 0, 0, 0 | 39 to 59% on prefix, 63 to 68% on random |
| anchored + carry-forward | 0, 0, 3, 1, 0, 2 | 1, 1, 0, 0, 0, 0 | 40 to 59% on prefix, 63 to 68% on random |

Bloat and drift under carry-forward (fresh layouts):

| Series | Step | Regions | Mean shown n | Largest region | Mean roster | Mean coverage of the name word |
|---|---|---|---|---|---|---|
| prefix | 2,400 | 16 | 95 | 211 | 146 | 0.71 |
| prefix | 3,200 | 14 | 110 | 260 | 175 | 0.70 |
| prefix | 4,081 | 18 | 118 | 297 | 184 | 0.68 |
| random | 2,400 | 9 | 170 | 418 | 227 | 0.70 |
| random | 3,200 | 10 | 183 | 510 | 256 | 0.66 |
| random | 4,081 | 11 | 212 | 629 | 299 | 0.70 |

Coverage of the name word does not decay over three steps (0.66 to 0.71, against 0.59 to 0.70 for recluster). Regions grow roughly in step with the catalogue. On the random series one region reaches 629 shown albums (711 with absorb), about twice the largest region recluster produces, and the region count stays at 9 to 11 while recluster reaches 18. So carry-forward does bloat: established regions take in new albums and fewer new regions form. Three steps is too short to say whether coverage would erode later.

What the table says:

- **Carry-forward is the stabiliser that works.** With no new albums it keeps 92% of name words against 70%, and all 18 regions. Under growth it keeps 72% against 56%. The share that moves to a different name word falls from 25% to 8%.
- **It does not reduce the share that falls out of regions** (about 20% per growth step). Those are albums the new layout puts at a region's edge or elsewhere, and trimming removes them.
- **Its cost is coverage of the map.** Unnamed albums rise from 27% to 43% under growth (37% with absorb), because only about half of new albums join a region and new regions form only from leftovers. With no growth the cost is 2 points.
- **Anchoring does not help names.** Anchored + recluster is no better than fresh + recluster, and anchored + carry-forward is within 2 points of fresh + carry-forward. Anchoring only helps where things sit on screen.

### Recommendation

1. Use carry-forward for regions and names. Keep `regions_prev.json` with rosters in the repository and feed it to every build.
2. Turn `absorb` on. It recovers 6 points of named albums at no loss of name stability in these runs. Watch the largest region.
3. Add a guard for bloat and for lost coverage: when the unnamed share passes about 40%, or a region exceeds a size cap, run `find_regions` with matching for that build instead (a recluster keeps ids and names where regions still overlap). This guard was not run.
4. Anchor the layout as well if a steady map position matters for returning visitors and for the fade between builds. It costs nothing in quality or time. Do not expect it to stabilise names, and do not lower the epochs.
5. Whatever is chosen, about one named album in five leaves its region at each growth step. The interface should not promise that an album stays in a named place.

### Runtime

`carry_forward_regions`: 0.2 to 0.5 s at 2,400 to 4,081 albums, the same as or faster than `find_regions`. Anchored UMAP: 5.6 s at 2,400, 8.9 s at 3,200, 13.5 s at 4,081, the same as fresh. With 200 epochs: 4.1, 6.8 and 10.6 s.

### Not run

The second random series. Sonic and mood. More than three growth steps. The recluster guard in point 3. Carry-forward starting from the hand regions (it started from each series' own first-step `find_regions` output). Anchoring with albums removed or reordered.
