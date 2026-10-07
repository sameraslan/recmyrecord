# The pair-fitted store map, applied to the catalog

Generated 2026-10-04 by `pair_map_check.py`. The map is fitted on 349 tracks of 120 albums fetched from both stores (`store_effect_fix.md`), then applied to the 11,636 stored iTunes clip vectors of the catalog (2,956 of 9,577 albums; the same albums as `source_effect.md`). Deezer clips are not touched.

**Stored vectors only: no model, no audio, no download. The music columns are RYM proxies. Nobody listened.**

## Verdict

**Most of the way, for both directions, at a small cost on what could be measured. Not all the way: iTunes seeds still get about ten points more iTunes neighbours than their genre's make-up, and a probe can still tell the stores apart. The albums on YouTube audio are left behind by it.**

- **Deezer seeds.** A new Deezer seed's ten neighbours go from 2.3% iTunes albums to 25.6%. The make-up of its genre would give 29.1% (27.8% by genre and decade) and EffNet, which does not hear the store, gives 27.1%. That is 87% of the gap closed. Existing Deezer seeds: 2.5% to 22.7% against 29.0%.
- **iTunes seeds.** 91.7% to 47.3%, against a make-up of 37.7% (39.9% by genre and decade; EffNet 36.1%). 82% of the gap closed; about ten points of preference for the own store remain. Existing iTunes seeds: 93.0% to 47.3% against 36.2%.
- **The store is still readable.** Probe AUC among new albums 0.998 to 0.804 (0.757 matched on genre and decade; 0.697 on the 64-number block the lists use). Year, rank and genre alone give 0.640 and EffNet 0.678 (`source_effect.md`), so about 0.65 is where no store is left; on the held-out pairs the same map read 0.441. On the catalog the map removes less than on the pairs.
- **New and existing.** Existing seeds get 39.5% new neighbours before and 48.0% after (make-up 55.2%; EffNet 50.0%); new seeds 68.3% to 62.9% (make-up 64.3%). New vs existing probe 0.797 to 0.709; inside Deezer alone it is 0.693, the part that is the music.
- **Cost, on the proxies: none seen.** genre_primary 0.182 to 0.194, desc_jaccard 0.191 to 0.196 (both rise a little, for seeds of both stores). Neither store is recommended less: mean N10 9.96 for Deezer albums and 10.09 for iTunes albums (before: 10.13 and 9.71); never recommended 2.4% and 1.8%; skew 1.274 (before 1.234).
- **Cost, in what moves.** A Deezer seed's ten nearest Deezer albums stay the same (9.88 of 10; only the refitted block moves them). Its list keeps 7.5 of 10, the rest being the iTunes albums that now enter. An iTunes seed's ten nearest iTunes albums keep 8.3 of 10: the map reorders the iTunes albums among themselves by about a sixth, and whether that is repair or damage the proxies cannot say. A mapped iTunes album vector is at cosine 0.803 with its unmapped one.
- **It transfers to catalog clips it never saw.** 16 albums (63 tracks) were once in the catalog cache from both stores. None is among the pair albums. The same track across stores goes from cosine 0.773 to 0.932 (interval over albums 0.909 to 0.952), closer for 59 of 63 tracks and 15 of 16 albums. On the held-out pairs it was 0.769 to 0.924.
- **Stable enough.** Fitted on two disjoint halves of the pair albums, the two catalogs' lists share 8.4 to 8.5 of 10 (iTunes seeds 7.4 to 7.6; three random splits). Half the pairs mix a little less (Deezer seeds 19.3% to 23.1% iTunes neighbours, where all pairs give 25.6%), so the map is still short of pairs: more pairs would probably close more of the gap.
- **YouTube albums (80, small n) lose out.** They are not mapped. Before, they sat nearer the iTunes albums; once those move, the YouTube albums are in fewer lists (mean N10 6.21 to 2.98; 3 to 11 of 80 in no list) and keep more to themselves (6.8% to 9.5% YouTube neighbours where the make-up gives 3.1%).

So: the pair map can replace the re-download for the Deezer/iTunes split as far as these proxies go, with a known remainder on the iTunes side. It does not settle YouTube audio, and nothing here says the lists sound right.

## 1. Is it the same quantity, and how the map is applied

A clip vector in both caches is the mean of three L2-normalised window vectors, not renormalised (44.1 kHz mono (ffmpeg, (L+R)/2) -> resample_poly(160,147) -> 3 x 10 s windows -> get_audio_features -> L2 per window -> mean; float32). 143 Deezer clips of the pair tracks are also in the catalog cache (same track id): largest absolute difference 0.0, so they are the same numbers. No iTunes pair track is in the catalog cache (0), so for iTunes the check is the recipe and the lengths: median clip-vector length pairs, Deezer 0.960, pairs, iTunes 0.966, catalog, Deezer clips 0.961, catalog, iTunes clips 0.967, catalog, YouTube windows 0.967.

The report's map was fitted on unit clip vectors. Here it is fitted on the raw clip vectors, because that is what the album mean is taken over; on held-out pairs the two give the same result (section 2, last row). Each iTunes clip is mapped, then the album mean is taken over the first four ok clips in rank order, as `rmr_audio.modelstore` does. Rebuilt without a map, these means equal the store's (`album_means`): largest difference 0.0, 9,657 albums. The block is refitted for every row (PCA(64) of the centred unit vectors, the site's block up to a scale factor).

`residual, lambda 1` is the map the reports named, and it was fixed before the catalog was looked at. The others are beside it to show how much the choice matters, not to pick a winner on catalog numbers.

## 2. Held-out pairs

349 pairs, 120 albums, five folds with an album's pairs kept together; the map is fitted on the other folds. Measures as `store_effect_fix.md` section 4, mapped iTunes clips against Deezer clips left alone. `Kept of 10`: of a mapped iTunes clip's ten nearest mapped iTunes clips of other albums, how many were its nearest before. For comparison, the stereo MP3 round trip of the audio gave 0.946, probe 0.804, 46.8% (42.0% / 51.5%) there.

| Map | Same track, other store: cosine mean (median) | Store probe AUC | Own track found, top 1 | Neighbours from the other store (Deezer seeds / iTunes seeds) | Kept of 10 inside iTunes | Cosine with its own unmapped vector | Mean cosine to clips of other albums: mapped iTunes / Deezer |
|---|---|---|---|---|---|---|---|
| `none` | 0.769 (0.776) | 0.989 | 79.2% | 13.3% (10.8% / 15.9%) | 10.0 | 1.000 | 0.247 / 0.352 |
| `shift` | 0.905 (0.926) | 0.567 | 92.3% | 41.9% (35.2% / 48.6%) | 8.9 | 0.878 | 0.316 / 0.352 |
| `residual, lambda 0.01` | 0.893 (0.918) | 0.412 | 87.8% | 52.1% (50.7% / 53.5%) | 6.8 | 0.777 | 0.366 / 0.352 |
| `residual, lambda 0.1` | 0.916 (0.940) | 0.524 | 90.5% | 51.3% (53.3% / 49.3%) | 7.8 | 0.805 | 0.385 / 0.352 |
| `residual, lambda 0.3` | 0.921 (0.944) | 0.512 | 91.7% | 50.8% (52.3% / 49.4%) | 8.1 | 0.817 | 0.384 / 0.352 |
| **`residual, lambda 1`** | 0.924 (0.947) | 0.441 | 92.4% | 50.1% (49.4% / 50.8%) | 8.5 | 0.832 | 0.376 / 0.352 |
| `residual, lambda 3` | 0.923 (0.946) | 0.321 | 92.7% | 49.1% (45.5% / 52.7%) | 8.7 | 0.847 | 0.363 / 0.352 |
| `residual, lambda 10` | 0.919 (0.942) | 0.305 | 92.5% | 47.3% (41.6% / 53.0%) | 8.8 | 0.862 | 0.346 / 0.352 |
| `residual, lambda 100` | 0.909 (0.930) | 0.518 | 92.5% | 43.4% (36.6% / 50.3%) | 8.9 | 0.876 | 0.322 / 0.352 |
| `plain, lambda 0.01` | 0.890 (0.915) | 0.486 | 85.8% | 51.6% (53.6% / 49.6%) | 6.8 | 0.767 | 0.375 / 0.352 |
| `plain, lambda 0.1` | 0.909 (0.930) | 0.746 | 88.5% | 50.3% (62.0% / 38.6%) | 7.7 | 0.777 | 0.416 / 0.352 |
| `plain, lambda 0.3` | 0.909 (0.928) | 0.867 | 88.1% | 48.4% (66.5% / 30.3%) | 7.9 | 0.769 | 0.444 / 0.352 |
| `plain, lambda 1` | 0.900 (0.921) | 0.972 | 85.2% | 45.3% (72.4% / 18.2%) | 7.8 | 0.743 | 0.499 / 0.352 |
| `plain, lambda 3` | 0.877 (0.899) | 0.998 | 79.4% | 41.1% (77.3% / 4.9%) | 7.3 | 0.691 | 0.594 / 0.352 |
| `plain, lambda 10` | 0.822 (0.846) | 1.000 | 60.5% | 38.0% (76.1% / 0.0%) | 6.2 | 0.591 | 0.758 / 0.352 |
| `plain, lambda 100` | 0.656 (0.678) | 1.000 | 10.9% | 14.0% (27.9% / 0.0%) | 3.2 | 0.361 | 0.982 / 0.352 |
| `lowrank 1 (lambda 1)` | 0.909 (0.932) | 0.545 | 92.4% | 44.4% (37.5% / 51.3%) | 8.7 | 0.870 | 0.319 / 0.352 |
| `lowrank 2 (lambda 1)` | 0.914 (0.935) | 0.508 | 92.4% | 44.6% (37.9% / 51.3%) | 8.7 | 0.862 | 0.325 / 0.352 |
| `lowrank 4 (lambda 1)` | 0.915 (0.937) | 0.438 | 92.1% | 46.7% (39.3% / 54.0%) | 8.5 | 0.856 | 0.333 / 0.352 |
| `lowrank 8 (lambda 1)` | 0.919 (0.941) | 0.333 | 93.0% | 47.9% (41.2% / 54.7%) | 8.4 | 0.847 | 0.346 / 0.352 |
| `lowrank 16 (lambda 1)` | 0.921 (0.943) | 0.321 | 92.8% | 49.2% (44.7% / 53.8%) | 8.3 | 0.839 | 0.361 / 0.352 |
| `lowrank 32 (lambda 1)` | 0.923 (0.946) | 0.409 | 92.4% | 49.8% (48.0% / 51.6%) | 8.5 | 0.833 | 0.373 / 0.352 |
| `lowrank 64 (lambda 1)` | 0.924 (0.947) | 0.439 | 92.4% | 50.2% (49.5% / 51.0%) | 8.5 | 0.832 | 0.376 / 0.352 |
| `lowrank 8 (lambda 0.1)` | 0.915 (0.939) | 0.361 | 92.5% | 48.4% (42.3% / 54.5%) | 8.1 | 0.836 | 0.344 / 0.352 |
| `lowrank 32 (lambda 0.1)` | 0.915 (0.938) | 0.467 | 91.3% | 50.9% (50.2% / 51.5%) | 7.9 | 0.811 | 0.377 / 0.352 |
| `residual, lambda 1, fitted on unit vectors (the report's)` | 0.924 (0.947) | 0.454 | 92.3% | 50.1% (49.5% / 50.7%) | 8.4 | 0.831 | 0.377 / 0.352 |

- `residual` is flat between lambda 0.3 and 3 on the same-track cosine (0.92) and the neighbour share (49% to 51%). A probe below 0.5 means the mapped clips are told apart the other way round, which with 349 pairs is probably the fold effect of a paired design rather than information.
- `plain` ridge is worse: it pulls every clip towards the Deezer mean (last column rises, the vectors shrink), so mapped iTunes clips become everyone's neighbour. On the catalog it makes iTunes albums the hubs (section 4).
- `shift` alone gets the cosine to 0.905 but Deezer seeds to only 35% other-store neighbours. A few directions (`lowrank`) sit between: the store is a shift plus a map of some tens of directions, as `source_effect.md` section 6 suggested.

## 3. The catalog: who is in the lists

9,577 albums (6,621 Deezer, 2,956 iTunes; 5,599 new). Share of a seed's ten neighbours that are iTunes-sourced. `Make-up`: the share of iTunes albums among the other albums with the seed's first genre (and genre x decade), the target.

|  | new Deezer seeds (n 2,869) | new iTunes seeds (n 2,730) | existing Deezer seeds (n 3,752) | existing iTunes seeds (n 226) |
|---|---|---|---|---|
| make-up: same genre | 29.1% | 37.7% | 29.0% | 36.2% |
| make-up: same genre x decade | 27.8% | 39.9% | 27.5% | 34.1% |
| EffNet (`source_effect.md`) | 27.1% | 36.1% | 26.1% | 32.0% |
| `baseline` | 2.3% | 91.7% | 2.5% | 93.0% |
| `shift` | 11.4% | 53.2% | 10.1% | 52.4% |
| `residual, lambda 0.1` | 27.0% | 50.8% | 24.2% | 50.2% |
| **`residual, lambda 1`** | 25.6% | 47.3% | 22.7% | 47.3% |
| `residual, lambda 10` | 19.2% | 43.9% | 16.9% | 43.3% |
| `plain, lambda 0.1` | 29.5% | 57.3% | 27.0% | 57.4% |
| `plain, lambda 1` | 37.3% | 78.8% | 35.1% | 80.4% |
| `lowrank 8 (lambda 1)` | 17.9% | 43.2% | 15.9% | 41.1% |

Share of neighbours that are new albums, and the probes (logistic regression on the album's unit vector, C 0.01, five folds grouped by artist, as `source_effect.py`; the map is fitted on the pairs, not on these albums, so the probe is a fair score here).

|  | New neighbours, new seeds (n 5,599) | New neighbours, existing seeds (n 3,978) | Store probe, new albums (n 2,730 / 2,869) | Matched genre x decade (n 2,752) | On the 64-number block | Store probe, existing albums (n 226 / 3,752) | New vs existing |
|---|---|---|---|---|---|---|---|
| make-up: same genre | 64.3% | 55.2% |  |  |  |  |  |
| `baseline` | 68.3% | 39.5% | 0.998 | 0.998 | 0.997 | 0.999 | 0.797 |
| `shift` | 61.1% | 42.1% | 0.881 | 0.855 | 0.804 | 0.776 | 0.740 |
| `residual, lambda 0.1` | 64.0% | 49.0% | 0.816 | 0.769 | 0.710 | 0.737 | 0.713 |
| **`residual, lambda 1`** | 62.9% | 48.0% | 0.804 | 0.757 | 0.697 | 0.706 | 0.709 |
| `residual, lambda 10` | 60.8% | 45.1% | 0.827 | 0.786 | 0.710 | 0.706 | 0.715 |
| `plain, lambda 0.1` | 66.2% | 50.7% | 0.870 | 0.844 | 0.769 | 0.795 | 0.732 |
| `plain, lambda 1` | 73.3% | 55.7% | 0.951 | 0.943 | 0.927 | 0.919 | 0.758 |
| `lowrank 8 (lambda 1)` | 60.2% | 44.5% | 0.832 | 0.794 | 0.725 | 0.694 | 0.715 |

New vs existing inside Deezer alone is 0.693 in every row (those vectors do not change): the floor for the last column.

## 4. The catalog: what it costs

`Overlap` is the mean number of the ten neighbours shared with the unmapped lists. `Deezer only` / `iTunes only`: the seed's ten nearest albums of its own store, so entries from the other store do not count as change. N10: the number of lists an album is in (10 on average).

|  | genre_primary (n 9,137) | genre_family | desc_jaccard (n 8,813) | genre_primary: Deezer / iTunes seeds | Mean N10: Deezer / iTunes albums | In no list: Deezer / iTunes | iTunes among the 50 most recommended (pool: 31%) | N10 skew / max | Overlap: Deezer / iTunes seeds | Deezer seeds, Deezer only | iTunes seeds, iTunes only |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `baseline` | 0.182 | 0.592 | 0.191 | 0.185 / 0.175 | 10.1 / 9.7 | 1.7% / 1.5% | 16% | 1.23 / 59 | 10.00 / 10.00 | 10.00 | 10.00 |
| `shift` | 0.191 | 0.600 | 0.195 | 0.190 / 0.193 | 11.0 / 7.7 | 2.0% / 3.5% | 6% | 1.25 / 59 | 8.87 / 5.26 | 9.97 | 8.98 |
| `residual, lambda 0.1` | 0.193 | 0.601 | 0.195 | 0.193 / 0.192 | 9.7 / 10.8 | 2.4% / 1.6% | 26% | 1.26 / 63 | 7.38 / 4.65 | 9.86 | 7.59 |
| **`residual, lambda 1`** | 0.194 | 0.602 | 0.196 | 0.193 / 0.196 | 10.0 / 10.1 | 2.4% / 1.8% | 22% | 1.27 / 63 | 7.53 / 4.62 | 9.88 | 8.28 |
| `residual, lambda 10` | 0.193 | 0.602 | 0.196 | 0.192 / 0.196 | 10.7 / 8.4 | 2.1% / 2.6% | 4% | 1.28 / 60 | 8.13 / 4.41 | 9.91 | 8.81 |
| `plain, lambda 0.1` | 0.191 | 0.599 | 0.195 | 0.193 / 0.189 | 9.1 / 12.0 | 2.8% / 1.3% | 54% | 1.27 / 60 | 7.11 / 5.02 | 9.87 | 7.50 |
| `plain, lambda 1` | 0.187 | 0.596 | 0.193 | 0.189 / 0.182 | 7.3 / 16.0 | 4.0% / 0.4% | 90% | 1.40 / 65 | 6.29 / 6.24 | 9.86 | 7.52 |
| `lowrank 8 (lambda 1)` | 0.194 | 0.602 | 0.195 | 0.192 / 0.197 | 10.9 / 8.1 | 2.1% / 3.3% | 4% | 1.30 / 63 | 8.24 / 4.29 | 9.89 | 8.38 |

- With the headline map both stores are recommended equally often. `shift`, `residual, lambda 10` and `lowrank 8` leave iTunes albums under-recommended (mean N10 about 8), `plain` over-recommends them (12 to 16; 90% of the 50 biggest hubs at lambda 1). That is the side to watch if the map is changed.
- Genre and descriptor agreement rise slightly with every residual map, as with the corrections of `source_effect.md` section 6. That fits a nuisance being removed; it is a proxy.

## 5. Robustness

**Two halves of the pair albums.** 120 albums split at random into 60 and 60, three times; the headline map fitted on each half and applied to the catalog.

| Split | Pairs in each half | iTunes neighbours, new Deezer seeds | iTunes neighbours, new iTunes seeds | Mean N10, iTunes albums | Overlap@10 between the halves: all seeds | Deezer seeds | iTunes seeds | iTunes seeds, iTunes candidates only | Overlap@10 with the all-pairs map | Cosine between the two halves' iTunes album vectors |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 173 / 176 | 21.0% / 23.1% | 48.4% / 46.0% | 9.2 / 9.4 | 8.50 | 8.92 | 7.57 | 8.37 | 9.06 / 9.04 | 0.986 |
| 2 | 176 / 173 | 21.5% / 22.4% | 48.3% / 47.4% | 9.3 / 9.5 | 8.41 | 8.85 | 7.43 | 8.39 | 8.95 / 9.07 | 0.983 |
| 3 | 172 / 177 | 19.3% / 22.8% | 50.7% / 46.4% | 9.2 / 9.4 | 8.45 | 8.91 | 7.42 | 8.31 | 8.90 / 9.10 | 0.984 |

All pairs: 25.6% and 47.3%, mean N10 of iTunes albums 10.09. Two maps from disjoint pairs agree on about 8.5 of 10 neighbours, and on 7.5 of 10 for iTunes seeds: the direction of the result does not depend on which albums were paired, the exact lists of iTunes seeds do to about a quarter. Every half gives less mixing for Deezer seeds and fewer recommendations for iTunes albums than all pairs do, so the map is still improving with more pairs.

**The catalog's own doubles.** 16 albums, 63 tracks at the same positions, held from both stores (`source_effect.md` section 4; read from the cache and its backup). The maps are fitted on the 349 pairs; none of these albums is among them. Another track of the same album inside Deezer is at 0.705.

| Map | Same track, other store: cosine mean (median) | 95% interval (albums resampled) | Other track of the album, other store | Own track found among the 63, top 1 | Tracks closer than unmapped | Albums closer |
|---|---|---|---|---|---|---|
| `none` | 0.773 (0.797) | 0.735 to 0.813 | 0.532 | 78.6% | – | – |
| `shift` | 0.909 (0.926) | 0.889 to 0.932 | 0.676 | 91.3% | 59 of 63 | 15 of 16 |
| `residual, lambda 0.1` | 0.929 (0.954) | 0.905 to 0.948 | 0.708 | 93.7% | 59 of 63 | 15 of 16 |
| **`residual, lambda 1`** | 0.932 (0.954) | 0.909 to 0.952 | 0.706 | 94.4% | 59 of 63 | 15 of 16 |
| `residual, lambda 10` | 0.925 (0.941) | 0.903 to 0.945 | 0.692 | 92.1% | 59 of 63 | 15 of 16 |
| `plain, lambda 0.1` | 0.925 (0.946) | 0.905 to 0.945 | 0.718 | 92.9% | 58 of 63 | 15 of 16 |
| `plain, lambda 1` | 0.917 (0.942) | 0.898 to 0.935 | 0.735 | 92.1% | 57 of 63 | 15 of 16 |
| `lowrank 8 (lambda 1)` | 0.925 (0.942) | 0.900 to 0.944 | 0.691 | 92.1% | 59 of 63 | 15 of 16 |

These are catalog clips, several embedded by the earlier run, of albums that are not the pair sample's kind (duplicate rows, several classical or live). The map does for them what it did for held-out pairs.

**Pair albums the catalog uses from iTunes.** Of the 120 pair albums the catalog has 118 as deezer, 1 as itunes, 1 as not in the catalog's audio. So this check has n = 1, and for that album the catalog's four clips are other tracks than the paired ones.
`Album2548617` (map fitted without it): cosine of the catalog album mean with the mean of the experiment's Deezer clips 0.614 unmapped, 0.948 mapped (with the experiment's iTunes clips: 0.918; the experiment's own iTunes clips against its Deezer clips: 0.596 to 0.979). One album; it goes the right way and proves nothing.

## 6. YouTube windows

80 albums are in the cache as windows of full-album YouTube audio (opus), all new, 2 with 5 windows, 4 with 6 windows, 4 with 7 windows, 70 with 8 windows. They are 0.8% of a pool of 9,657; the block is refitted on that pool. **n = 80 seeds: one neighbour more or less per seed is 10 points for that seed; read the direction only.** The interval is over resampled seeds.

|  | YouTube seeds: YouTube neighbours | make-up | Seeds with a YouTube neighbour | YouTube seeds: iTunes neighbours | make-up | YouTube seeds: Deezer neighbours | make-up | Mean N10 of YouTube albums | YouTube albums in no list | YouTube among Deezer / iTunes seeds' neighbours (make-up 0.8%) |
|---|---|---|---|---|---|---|---|---|---|---|
| `baseline` | 6.8% (4.9% to 8.9%) | 3.1% | 36 of 80 | 40.9% (33.2% to 48.4%) | 32.0% | 52.4% | 64.9% | 6.2 | 3 of 80 | 0.2% / 1.0% |
| `residual, lambda 1` | 9.5% (7.0% to 12.1%) | 3.1% | 42 of 80 | 20.6% (16.4% to 25.1%) | 32.0% | 69.9% | 64.9% | 3.0 | 11 of 80 | 0.2% / 0.1% |
| `residual, lambda 1, YouTube windows mapped as if they were iTunes clips` | 7.2% (4.9% to 9.9%) | 3.1% | 32 of 80 | 32.4% (27.8% to 37.1%) | 32.0% | 60.4% | 64.9% | 8.8 | 0 of 80 | 0.6% / 0.9% |

- Unmapped catalog: YouTube albums already keep to themselves about twice as much as the make-up gives, lean to iTunes albums (40.9% against 32.0%) and are in fewer lists than other albums (mean N10 6.21); almost no Deezer seed is given one (0.2%). They sit on the iTunes side of the split.
- After the map the iTunes albums have moved to the Deezer side and the YouTube albums have not: mean N10 2.98, 11 in no list, iTunes seeds are given almost none (0.1%). As seeds they now get mostly Deezer albums, so their own lists are filled; it is as recommendations that they drop out.
- Last row, for comparison only: the YouTube windows put through the iTunes map. No pair supports it (the map was fitted on Apple's AAC, YouTube is opus). Mean N10 8.82, 0 in no list, 7.2% YouTube neighbours. A map for YouTube would need its own pairs: `store_effect_fix.sqlite` has 150 YouTube windows of 25 pair albums, but they are other stretches of the album than the store clips, so they are not same-track pairs.

## Caveats

- **The pairs are not the albums the map is used on.** They come from albums that both stores carry (4,659 of the catalog, drawn over genre family, decade and new/existing). The catalog's iTunes-sourced albums are mostly the ones Deezer does not list. If Apple encodes those differently (other masters, other years of encoding) the map fits them less well. The 16 doubles and the probe speak to it only partly: the doubles are again albums both stores have.
- **The remainder on the iTunes side is unexplained.** Ten points over the make-up and a probe of 0.80 against a floor near 0.65. It could be store signal a linear map from 349 pairs cannot reach (the halves say more pairs help), or a real difference between iTunes-only and Deezer albums that genre and decade do not describe. These numbers cannot separate the two.
- **Proxies, not listening.** RYM genre and descriptor agreement, shares and overlaps. A map can raise all of them and still bend what iTunes albums sound like to the model: it changes an iTunes album vector to cosine 0.80 with itself and reorders iTunes albums among themselves by a sixth.
- **The target is a proxy too.** The make-up by first genre (and decade) is what a store-blind model with nothing else to go on would give. EffNet, the only store-blind model at hand, lands two to four points under it for every seed group.
- No split was held out on the catalog: one map was fixed beforehand and the others are shown as sensitivity. Intervals are given only where stated; the matched sample is one random draw.
- The 80 YouTube albums are few, all new, and their means are over up to eight windows rather than four clips.

## What would falsify it

- **Listening.** If, in a blind comparison of lists for iTunes seeds, the mapped lists sound less like the seed than the unmapped ones, the map buys mixing with damage the proxies do not see.
- **The audio fix on catalog albums.** Re-embed a few hundred iTunes-only catalog albums after the stereo MP3 round trip. If their re-embedded vectors are no closer to the mapped vectors than to the unmapped ones (the pairs say cosine about 0.92 against 0.77), the map does not transfer to iTunes-only albums. If the round trip brings iTunes seeds to the make-up where the map stops ten points short, the remainder is store signal and the audio fix is the better one.
- **More pairs.** If a map fitted on, say, 1,000 pairs gives the same catalog numbers as this one, the remainder is not a shortage of pairs. The halves predict it should shrink.
- **A same-store control.** If Deezer albums that have an Apple link and Deezer albums that do not are also told apart by a probe at about 0.8 after matching on genre and decade, then the 0.80 here is the albums, not the store, and the map has done all there is to do.
