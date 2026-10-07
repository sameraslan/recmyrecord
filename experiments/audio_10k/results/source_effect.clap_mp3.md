# Why CLAP keeps new and existing albums apart: the store the preview came from

**Cache model read as CLAP here: `clap_mp3`. Only the albums that have it are in the tables. The sentences of the verdict and under the tables were written for the `clap` run and are not rewritten: here, read the numbers.**

Generated 2026-10-05 by `source_effect.py`. 9,367 catalog albums with a Deezer or iTunes preview in both models (870 albums on full-length windows left out).

**Probes on RYM-catalog proxies over the clip cache. Nobody listened, no audio was opened, no model was run.** A = the music differs; B = where the audio came from; C = which clips were chosen.

## Verdict

**B, strongly. CLAP's vectors carry the store the preview came from, and its lists split the catalog into a Deezer part and an iTunes part. The new/existing gap is that split seen through the fact that the existing albums are almost all Deezer and the new ones half iTunes. A is real but small and the same for both models. C is ruled out as far as the cache can tell.**

- A linear probe tells an iTunes-sourced album from a Deezer-sourced one with AUC 0.893 on CLAP (new albums only, n 2,675 / 2,815) and 0.670 on EffNet. Year, rank and genre alone give 0.639. On a sample matched on genre and decade CLAP still gives 0.858, EffNet 0.552. No difference in the music that RYM's labels describe is that separable.
- The same recording from both stores could not be compared here: only 1 of the albums held from both stores have `clap_mp3` clips at the same track positions (under 5); the doubles are in the backup from before the rekey, which has no `clap_mp3` rows.
- In the lists: a Deezer seed's ten CLAP neighbours are 27.6% iTunes albums where its genre's make-up would give 29.0%; an iTunes seed's are 38.1% against 37.8% (new seeds). EffNet: 27.0% and 36.2%, close to the make-up.
- The 218 existing albums that happen to be iTunes-sourced behave like new albums: 53.0% of their CLAP neighbours are new (existing Deezer seeds: 49.1%). It follows the store, not whether the album is new.
- Inside one store the gap goes: among Deezer albums only, new vs existing is AUC 0.696 on CLAP and 0.657 on EffNet (it was 0.751 and 0.647 over both stores), 0.570 and 0.514 once matched on genre and decade, and year, rank and genre alone give 0.817. Existing Deezer seeds get 35.6% new neighbours from CLAP and 35.5% from EffNet in a Deezer-only pool. That remainder is the music (era, genre, rank) and both models see the same amount of it.
- Clips: in all four groups the clips are ranks 0 to 3 of the same plan, in the same positions in the album, about 30 s long.
- Removing one or a few store directions does not repair it (last table): iTunes seeds mix again, Deezer seeds still get few iTunes neighbours. The store shows in more than a shift.

What it is in the audio (codec, bandwidth, loudness, where the excerpt starts) cannot be told from vectors. The likely reading, not measured here: Deezer previews are low-bitrate MP3 and Apple's are AAC; CLAP listens at 48 kHz and hears the top of the spectrum that the encoders treat differently, EffNet listens at 16 kHz and cannot.

## Albums

| Group | Albums | With genre, year, rank | Median year | Median rank | 2010 or later | How the listing was found | CLAP clips: 4 / fewer |
|---|---|---|---|---|---|---|---|
| existing, Deezer | 3,659 | 3,286 | 1990 | 2940 | 11.6% | (earlier run) 3,659 | 3,620 / 39 |
| existing, iTunes | 218 | 181 | 1983 | 2693 | 10.1% | (earlier run) 218 | 212 / 6 |
| new, Deezer | 2,815 | 2,807 | 2002 | 6130 | 35.3% | deezer_id 2,351, search 460, override 4 | 2,791 / 24 |
| new, iTunes | 2,675 | 2,674 | 1995 | 6744 | 18.4% | apple_id 2,605, search 70 | 2,644 / 31 |

A new album's store follows from the links RYM lists: Deezer's link first, Apple's when there is none. So the store is not random with respect to the music, which is why the matched samples and the same-album pairs matter.

## 1. Probes

Logistic regression on the album's unit vector (CLAP 512 numbers, EffNet 1,280), standardised, C = 0.01 fixed, five folds grouped by artist. AUC of the pooled out-of-fold scores; the sd over the five folds is 0.001 to 0.04 (JSON). n is positives / negatives; the positive class is named first.

| Task | n | CLAP | EffNet | Year + rank + genre only | CLAP, those regressed out | EffNet, those regressed out | Matched genre x decade: n | CLAP | EffNet |
|---|---|---|---|---|---|---|---|---|---|
| new_vs_existing, all | 5,490 / 3,877 | 0.751 | 0.647 | 0.823 | 0.644 | 0.543 | 4,832 | 0.679 | 0.522 |
| new_vs_existing, Deezer only | 2,815 / 3,659 | 0.696 | 0.657 | 0.817 | 0.572 | 0.542 | 2,862 | 0.570 | 0.514 |
| new_vs_existing, iTunes only | 2,675 / 218 | 0.613 | 0.649 | 0.809 | 0.577 | 0.609 | 264 | 0.402 | 0.454 |
| itunes_vs_deezer, new only | 2,675 / 2,815 | 0.893 | 0.670 | 0.639 | 0.853 | 0.597 | 2,678 | 0.858 | 0.552 |
| itunes_vs_deezer, existing only | 218 / 3,659 | 0.783 | 0.686 | 0.611 | 0.762 | 0.600 | 288 | 0.543 | 0.405 |
| control: iTunes US vs other storefronts, new iTunes only | 1,311 / 1,364 | 0.606 | 0.567 | 0.582 | 0.524 | 0.529 | 1,260 | 0.478 | 0.522 |

`Year + rank + genre only`: gradient boosting on the three, same folds, albums that have all three. `regressed out`: year, year squared, log rank, decade and genre one-hots removed from every vector dimension by a ridge fit on the training fold. `Matched`: in each first-genre x decade cell, as many albums of one class as of the other (random draw, seed 0). A matched sample pushes a cross-validated probe a little below 0.5 when there is nothing to find (the training fold's cells are unbalanced the other way), so 0.39 to 0.48 there reads as no signal; the iTunes-only matched sample is small.

## 2. Metadata, and release year

New vs existing from metadata alone (n 8,948): year + rank + genre 0.823 (boosting), 0.819 (logistic); rank alone 0.758; year alone 0.628. So an AUC near 0.8 for new vs existing is what era, genre and chart rank give without any audio. CLAP beside the metadata: 0.851; EffNet beside it: 0.793. After regressing the metadata out, CLAP keeps 0.644 over both stores and 0.572 inside Deezer; EffNet 0.543 and 0.542. What CLAP keeps over both stores is the store.

Release year from the vectors (ridge, same folds):

| Albums | n | CLAP R2 | CLAP mean abs. error (years) | EffNet R2 | EffNet mean abs. error (years) |
|---|---|---|---|---|---|
| all | 9,366 | 0.675 | 7.7 | 0.724 | 7.0 |
| Deezer only | 6,474 | 0.694 | 7.6 | 0.746 | 6.7 |
| new only | 5,489 | 0.662 | 8.2 | 0.707 | 7.4 |
| existing only | 3,877 | 0.666 | 7.1 | 0.720 | 6.3 |

CLAP does not read the year better than EffNet; it reads it slightly worse. CLAP's larger new/existing gap is not era.

## 3. Neighbours by store

Top 10 by a PCA(64) block of the unit vectors fitted on the pool (the site's block up to a scale factor). `Same genre` is the share among the pool's other albums with the seed's first primary genre; `same genre x decade` adds the decade. Means over the seeds for which the comparison is defined.

**Share of neighbours that are iTunes-sourced**

| Pool | Model | Seeds | n | Neighbours | Same genre | Same genre x decade |
|---|---|---|---|---|---|---|
| whole catalog | clap | new Deezer seeds | 2,815 | 27.6% | 29.0% | 27.8% |
| whole catalog | clap | new iTunes seeds | 2,675 | 38.1% | 37.8% | 39.9% |
| whole catalog | clap | existing Deezer seeds | 3,659 | 25.7% | 28.8% | 27.5% |
| whole catalog | clap | existing iTunes seeds | 218 | 34.1% | 36.7% | 34.3% |
| whole catalog | effnet | new Deezer seeds | 2,815 | 27.0% | 29.0% | 27.8% |
| whole catalog | effnet | new iTunes seeds | 2,675 | 36.2% | 37.8% | 39.9% |
| whole catalog | effnet | existing Deezer seeds | 3,659 | 26.1% | 28.8% | 27.5% |
| whole catalog | effnet | existing iTunes seeds | 218 | 32.5% | 36.7% | 34.3% |
| new albums only | clap | new Deezer seeds | 2,815 | 43.1% | 43.0% | 40.0% |
| new albums only | clap | new iTunes seeds | 2,675 | 56.0% | 54.9% | 57.8% |
| new albums only | effnet | new Deezer seeds | 2,815 | 41.9% | 43.0% | 40.0% |
| new albums only | effnet | new iTunes seeds | 2,675 | 54.6% | 54.9% | 57.8% |

**Share of neighbours that are new albums**

| Pool | Model | Seeds | n | Neighbours | Same genre | Same genre x decade |
|---|---|---|---|---|---|---|
| whole catalog | clap | new seeds | 5,490 | 61.4% | 64.4% | 66.4% |
| whole catalog | clap | existing seeds | 3,877 | 49.3% | 55.3% | 50.8% |
| whole catalog | clap | new Deezer seeds | 2,815 | 61.0% | 64.5% | 67.4% |
| whole catalog | clap | new iTunes seeds | 2,675 | 61.9% | 64.2% | 65.4% |
| whole catalog | clap | existing Deezer seeds | 3,659 | 49.1% | 55.1% | 50.5% |
| whole catalog | clap | existing iTunes seeds | 218 | 53.0% | 58.8% | 54.9% |
| whole catalog | effnet | new seeds | 5,490 | 61.3% | 64.4% | 66.4% |
| whole catalog | effnet | existing seeds | 3,877 | 49.9% | 55.3% | 50.8% |
| whole catalog | effnet | new Deezer seeds | 2,815 | 61.2% | 64.5% | 67.4% |
| whole catalog | effnet | new iTunes seeds | 2,675 | 61.4% | 64.2% | 65.4% |
| whole catalog | effnet | existing Deezer seeds | 3,659 | 49.8% | 55.1% | 50.5% |
| whole catalog | effnet | existing iTunes seeds | 218 | 51.3% | 58.8% | 54.9% |
| Deezer albums only | clap | new Deezer seeds | 2,815 | 48.6% | 52.4% | 56.7% |
| Deezer albums only | clap | existing Deezer seeds | 3,659 | 35.6% | 39.9% | 35.1% |
| Deezer albums only | effnet | new Deezer seeds | 2,815 | 49.1% | 52.4% | 56.7% |
| Deezer albums only | effnet | existing Deezer seeds | 3,659 | 35.5% | 39.9% | 35.1% |

## 4. The same recording from both stores

258 albums were in the cache under two keys or two listings (a duplicate catalog row, matched on its own before it was dropped; `onepass.before-rekey.sqlite`). 2 of them have one Deezer and one iTunes listing; 1 of those have clips at the same track positions in both (so the same tracks; listings with another track count are left out, and so are one-clip albums). Titles could not be compared: the earlier run's listings are not in the cache. Cosines are between clip vectors.

| Pair of listings | Albums | Model | Same track, across the two | Other track, across the two | Other track, within one listing |
|---|---|---|---|---|---|
| Deezer vs iTunes | 1 | clap | 0.869 (median 0.856, n 4) | 0.860 (median 0.863, n 12) | 0.908 (median 0.902, n 12) |
| Deezer vs iTunes | 1 | effnet | 0.916 (median 0.928, n 4) | 0.889 (median 0.887, n 12) | 0.916 (median 0.914, n 12) |
| same store, another listing | 1 | clap | 0.585 (median 0.545, n 4) | 0.582 (median 0.571, n 12) | 0.808 (median 0.797, n 12) |
| same store, another listing | 1 | effnet | 0.475 (median 0.465, n 4) | 0.468 (median 0.477, n 12) | 0.691 (median 0.675, n 12) |
| same iTunes album id, another storefront | 0 | clap | – | – | – |
| same iTunes album id, another storefront | 0 | effnet | – | – | – |

The store probe on the two versions of an album was not run: only 1 of the albums held from both stores have `clap_mp3` clips at the same track positions (under 5); the doubles are in the backup from before the rekey, which has no `clap_mp3` rows.

## 5. Clips

| Group | Albums | Clips | Median clip (s) | Most common lengths (s: clips) | Under 25 s | Median track (s) | Albums on ranks 0 to 3 | In the planned order | Mean position in the album (0 first, 1 last) | Embedded by |
|---|---|---|---|---|---|---|---|---|---|---|
| existing, Deezer | 3,659 | 14,571 | 29.99 | 29.99: 14,006, 30.02: 403, 9.98: 25 | 0.6% | 195 | 99.9% | 99.3% | 0.39 | copy:clap, onepass |
| existing, iTunes | 216 | 850 | 29.98 | 29.98: 443, 29.93: 340, 29.95: 63 | 0.4% | 274 | 100.0% | 100.0% | 0.40 | onepass |
| new, Deezer | 2,815 | 11,208 | 29.99 | 29.99: 10,633, 30.02: 441, 9.98: 23 | 0.7% | 246 | 99.9% | 99.5% | 0.39 | copy:clap, onepass |
| new, iTunes | 2,675 | 10,649 | 29.93 | 29.93: 5,359, 29.98: 4,617, 29.95: 600 | 0.5% | 255 | 99.8% | 99.8% | 0.39 | onepass |

The four groups use the same clips: the first four of the same bit-reversal plan (the existing albums' four CLAP clips are the first four of their eight), at the same places in the album, all about 30 s. The only thing the cache shows that differs by store is the decoded length (Deezer 29.99 s, iTunes 29.93 or 29.98 s), which says the files are encoded differently and nothing more. The cache does not hold where in the track a preview starts, its bitrate, its bandwidth or its loudness.

## 6. What a simple correction would do (CLAP; measured, not adopted)

The correction is applied to the 512-number unit vectors, then the block is refitted and the lists recomputed over the whole catalog. Directions are fitted on the albums they are removed from. `Overlap` is the mean number of the ten neighbours kept from the uncorrected list. Mean N10: how many lists an album of that store is in (10 on average).

| Correction | Overlap@10 | iTunes neighbours, new Deezer seeds | iTunes neighbours, new iTunes seeds | New neighbours, new seeds | New neighbours, existing seeds | Mean N10 Deezer / iTunes | genre_primary | genre_family | desc_jaccard | New vs existing AUC |
|---|---|---|---|---|---|---|---|---|---|---|
| none (as it is) | 10.00 | 27.6% | 38.1% | 61.4% | 49.3% | 10.1 / 9.7 | 0.193 | 0.600 | 0.195 | 0.751 |
| 1 direction: between the store means (new albums) | 8.42 | 27.8% | 38.2% | 61.4% | 49.3% | 10.1 / 9.8 | 0.189 | 0.594 | 0.193 | 0.709 |
| 1 direction: store probe weights (new albums) | 9.95 | 27.7% | 37.9% | 61.4% | 49.4% | 10.1 / 9.7 | 0.193 | 0.600 | 0.195 | 0.717 |
| 2 directions: store probe, iterated | 9.91 | 27.7% | 37.8% | 61.4% | 49.4% | 10.1 / 9.7 | 0.193 | 0.600 | 0.195 | 0.704 |
| 4 directions: store probe, iterated | 9.82 | 27.8% | 37.7% | 61.4% | 49.4% | 10.1 / 9.7 | 0.193 | 0.600 | 0.195 | 0.694 |
| 8 directions: store probe, iterated | 9.60 | 27.9% | 37.6% | 61.3% | 49.5% | 10.1 / 9.7 | 0.193 | 0.599 | 0.195 | 0.689 |
| each store centred on its own mean | 8.80 | 24.7% | 41.3% | 61.4% | 48.2% | 10.2 / 9.4 | 0.191 | 0.599 | 0.194 | 0.649 |
| control: 1 random direction | 9.94 | 27.5% | 38.0% | 61.4% | 49.3% | 10.1 / 9.7 | 0.193 | 0.600 | 0.195 | 0.751 |
| control: the block's first principal direction | 8.05 | 27.3% | 38.0% | 61.4% | 49.2% | 10.2 / 9.6 | 0.186 | 0.582 | 0.191 | 0.751 |
| each store standardised per dimension (mean and sd) | 8.75 | 25.2% | 41.6% | 61.6% | 48.5% | 10.2 / 9.6 | 0.191 | 0.599 | 0.194 | 0.652 |
| iTunes albums mapped onto Deezer's mean and covariance | 8.18 | 23.7% | 39.7% | 60.6% | 47.9% | 10.4 / 9.1 | 0.187 | 0.595 | 0.192 | 0.645 |

Same-genre make-up for comparison: iTunes neighbours 29.0% for new Deezer seeds and 37.8% for new iTunes seeds; new neighbours 64.4% for new seeds and 55.3% for existing seeds. The store-probe AUC after each correction is in the JSON; it is not a fair score for a correction that equalises the two means on all albums (a cross-validated linear probe then reads below 0.5).

None of them brings the lists to the make-up. Taking out the line between the store means changes about a quarter of every list and brings iTunes seeds near their make-up, but Deezer seeds still get a quarter of the iTunes neighbours they should, and iTunes albums are then recommended much less often than Deezer ones (mean N10 about 6 against 12): what is left of the store is not a shift. Mapping the iTunes albums onto Deezer's mean and covariance goes furthest (Deezer seeds 18.7% against 29.1%) and changes a third of every list. On the RYM proxies no correction costs anything (genre and descriptor agreement stay or rise slightly, where removing an ordinary strong direction lowers them), which fits a nuisance direction; it says nothing about how the lists sound. For existing seeds the share of new neighbours hardly moves with the one-direction corrections (39.5% to 40.4%), because existing seeds are Deezer seeds and those are the ones not repaired.

## What could not be tested

- **What in the audio it is.** Codec, bitrate, bandwidth, loudness or where the preview starts in the track: vectors cannot separate them. It needs audio: embed one file as it is, re-encoded the other way, and low-passed.
- **A clip-level probe inside one album** is impossible: no album is used from both stores, and the 16 pairs are all there is.
- **The pairs are few and not typical**: 16 albums, 63 tracks, duplicate catalog rows (several classical or live). Track identity rests on equal track positions, not on titles. The two stores may also carry different masters of some of them.
- **A correction that works.** The ones tried are linear, fitted on these albums, and judged on RYM proxies. Whether lists sound right after any of them was not checked.
- No confidence intervals beyond the fold spread; the genre-matched samples are one random draw.

## What would change this reading

- If the previews of, say, 100 albums that both stores carry were fetched from both and embedded, and CLAP then mixed the two versions freely (a store probe near 0.5 on them, same-track cosine near EffNet's), the 16 pairs would be a fluke and the store split would be the music after all.
- If bringing both stores' clips to one encoding or bandwidth before CLAP left the iTunes and Deezer albums as separable as now, the cause would not be the encoding (it could still be the excerpt).
- If a listener found the iTunes-sourced albums to be a different kind of record from the Deezer-sourced ones of the same genre and decade, part of the split would be A. RYM's year, rank and genre do not show such a difference (store from metadata: 0.639).
