# Why CLAP keeps new and existing albums apart: the store the preview came from

Generated 2026-10-04 by `source_effect.py`. 9,577 catalog albums with a Deezer or iTunes preview in both models (46 albums on full-length windows left out).

**Probes on RYM-catalog proxies over the clip cache. Nobody listened, no audio was opened, no model was run.** A = the music differs; B = where the audio came from; C = which clips were chosen.

## Verdict

**B, strongly. CLAP's vectors carry the store the preview came from, and its lists split the catalog into a Deezer part and an iTunes part. The new/existing gap is that split seen through the fact that the existing albums are almost all Deezer and the new ones half iTunes. A is real but small and the same for both models. C is ruled out as far as the cache can tell.**

- A linear probe tells an iTunes-sourced album from a Deezer-sourced one with AUC 0.998 on CLAP (new albums only, n 2,730 / 2,869) and 0.678 on EffNet. Year, rank and genre alone give 0.640. On a sample matched on genre and decade CLAP still gives 0.998, EffNet 0.559. No difference in the music that RYM's labels describe is that separable.
- The same recordings show it directly. 16 albums are in the cache from both stores (63 tracks at the same position). A store probe trained on the other albums scores the iTunes version as more iTunes than the Deezer version of the same album in 16 of 16 albums and 63 of 63 tracks, and the gap between the two versions is 105% of the gap between iTunes and Deezer albums at large. The whole store difference is reproduced by changing the store and keeping the recording. CLAP's cosine between the two stores' clips of one track is 0.77 on average; EffNet's is 0.96 (median 0.99), so the two previews are probably much the same stretch of music, and CLAP hears them differently.
- In the lists: a Deezer seed's ten CLAP neighbours are 2.3% iTunes albums where its genre's make-up would give 29.1%; an iTunes seed's are 91.7% against 37.7% (new seeds). EffNet: 27.1% and 36.1%, close to the make-up.
- The 226 existing albums that happen to be iTunes-sourced behave like new albums: 83.4% of their CLAP neighbours are new (existing Deezer seeds: 36.9%). It follows the store, not whether the album is new.
- Inside one store the gap goes: among Deezer albums only, new vs existing is AUC 0.693 on CLAP and 0.653 on EffNet (it was 0.797 and 0.643 over both stores), 0.544 and 0.511 once matched on genre and decade, and year, rank and genre alone give 0.811. Existing Deezer seeds get 35.5% new neighbours from CLAP and 35.7% from EffNet in a Deezer-only pool. That remainder is the music (era, genre, rank) and both models see the same amount of it.
- Clips: in all four groups the clips are ranks 0 to 3 of the same plan, in the same positions in the album, about 30 s long.
- Removing one or a few store directions does not repair it (last table): iTunes seeds mix again, Deezer seeds still get few iTunes neighbours. The store shows in more than a shift.

What it is in the audio (codec, bandwidth, loudness, where the excerpt starts) cannot be told from vectors. The likely reading, not measured here: Deezer previews are low-bitrate MP3 and Apple's are AAC; CLAP listens at 48 kHz and hears the top of the spectrum that the encoders treat differently, EffNet listens at 16 kHz and cannot.

## Albums

| Group | Albums | With genre, year, rank | Median year | Median rank | 2010 or later | How the listing was found | CLAP clips: 4 / fewer |
|---|---|---|---|---|---|---|---|
| existing, Deezer | 3,752 | 3,358 | 1990 | 2936 | 11.6% | (earlier run) 3,752 | 3,619 / 133 |
| existing, iTunes | 226 | 188 | 1983 | 2696 | 9.3% | (earlier run) 226 | 210 / 16 |
| new, Deezer | 2,869 | 2,861 | 2002 | 6130 | 35.0% | deezer_id 2,395, search 474 | 2,787 / 82 |
| new, iTunes | 2,730 | 2,729 | 1995 | 6744 | 18.6% | apple_id 2,654, search 76 | 2,644 / 86 |

A new album's store follows from the links RYM lists: Deezer's link first, Apple's when there is none. So the store is not random with respect to the music, which is why the matched samples and the same-album pairs matter.

## 1. Probes

Logistic regression on the album's unit vector (CLAP 512 numbers, EffNet 1,280), standardised, C = 0.01 fixed, five folds grouped by artist. AUC of the pooled out-of-fold scores; the sd over the five folds is 0.001 to 0.04 (JSON). n is positives / negatives; the positive class is named first.

| Task | n | CLAP | EffNet | Year + rank + genre only | CLAP, those regressed out | EffNet, those regressed out | Matched genre x decade: n | CLAP | EffNet |
|---|---|---|---|---|---|---|---|---|---|
| new_vs_existing, all | 5,599 / 3,978 | 0.797 | 0.643 | 0.820 | 0.695 | 0.551 | 4,954 | 0.765 | 0.548 |
| new_vs_existing, Deezer only | 2,869 / 3,752 | 0.693 | 0.653 | 0.811 | 0.574 | 0.542 | 2,920 | 0.544 | 0.511 |
| new_vs_existing, iTunes only | 2,730 / 226 | 0.619 | 0.649 | 0.811 | 0.537 | 0.569 | 282 | 0.386 | 0.445 |
| itunes_vs_deezer, new only | 2,730 / 2,869 | 0.998 | 0.678 | 0.640 | 0.988 | 0.600 | 2,752 | 0.998 | 0.559 |
| itunes_vs_deezer, existing only | 226 / 3,752 | 0.999 | 0.666 | 0.619 | 0.998 | 0.604 | 308 | 0.997 | 0.443 |
| control: iTunes US vs other storefronts, new iTunes only | 1,344 / 1,386 | 0.603 | 0.584 | 0.581 | 0.520 | 0.522 | 1,290 | 0.484 | 0.512 |

`Year + rank + genre only`: gradient boosting on the three, same folds, albums that have all three. `regressed out`: year, year squared, log rank, decade and genre one-hots removed from every vector dimension by a ridge fit on the training fold. `Matched`: in each first-genre x decade cell, as many albums of one class as of the other (random draw, seed 0). A matched sample pushes a cross-validated probe a little below 0.5 when there is nothing to find (the training fold's cells are unbalanced the other way), so 0.39 to 0.48 there reads as no signal; the iTunes-only matched sample is small.

## 2. Metadata, and release year

New vs existing from metadata alone (n 9,136): year + rank + genre 0.820 (boosting), 0.815 (logistic); rank alone 0.758; year alone 0.634. So an AUC near 0.8 for new vs existing is what era, genre and chart rank give without any audio. CLAP beside the metadata: 0.878; EffNet beside it: 0.794. After regressing the metadata out, CLAP keeps 0.695 over both stores and 0.574 inside Deezer; EffNet 0.551 and 0.542. What CLAP keeps over both stores is the store.

Release year from the vectors (ridge, same folds):

| Albums | n | CLAP R2 | CLAP mean abs. error (years) | EffNet R2 | EffNet mean abs. error (years) |
|---|---|---|---|---|---|
| all | 9,576 | 0.671 | 7.8 | 0.721 | 7.0 |
| Deezer only | 6,621 | 0.690 | 7.6 | 0.741 | 6.8 |
| new only | 5,598 | 0.667 | 8.2 | 0.704 | 7.5 |
| existing only | 3,978 | 0.659 | 7.1 | 0.711 | 6.5 |

CLAP does not read the year better than EffNet; it reads it slightly worse. CLAP's larger new/existing gap is not era.

## 3. Neighbours by store

Top 10 by a PCA(64) block of the unit vectors fitted on the pool (the site's block up to a scale factor). `Same genre` is the share among the pool's other albums with the seed's first primary genre; `same genre x decade` adds the decade. Means over the seeds for which the comparison is defined.

**Share of neighbours that are iTunes-sourced**

| Pool | Model | Seeds | n | Neighbours | Same genre | Same genre x decade |
|---|---|---|---|---|---|---|
| whole catalog | clap | new Deezer seeds | 2,869 | 2.3% | 29.1% | 27.8% |
| whole catalog | clap | new iTunes seeds | 2,730 | 91.7% | 37.7% | 39.9% |
| whole catalog | clap | existing Deezer seeds | 3,752 | 2.5% | 29.0% | 27.5% |
| whole catalog | clap | existing iTunes seeds | 226 | 93.0% | 36.2% | 34.1% |
| whole catalog | effnet | new Deezer seeds | 2,869 | 27.1% | 29.1% | 27.8% |
| whole catalog | effnet | new iTunes seeds | 2,730 | 36.1% | 37.7% | 39.9% |
| whole catalog | effnet | existing Deezer seeds | 3,752 | 26.1% | 29.0% | 27.5% |
| whole catalog | effnet | existing iTunes seeds | 226 | 32.0% | 36.2% | 34.1% |
| new albums only | clap | new Deezer seeds | 2,869 | 3.9% | 43.2% | 40.0% |
| new albums only | clap | new iTunes seeds | 2,730 | 94.9% | 54.8% | 57.7% |
| new albums only | effnet | new Deezer seeds | 2,869 | 42.0% | 43.2% | 40.0% |
| new albums only | effnet | new iTunes seeds | 2,730 | 54.5% | 54.8% | 57.7% |

**Share of neighbours that are new albums**

| Pool | Model | Seeds | n | Neighbours | Same genre | Same genre x decade |
|---|---|---|---|---|---|---|
| whole catalog | clap | new seeds | 5,599 | 68.3% | 64.3% | 66.4% |
| whole catalog | clap | existing seeds | 3,978 | 39.5% | 55.2% | 50.6% |
| whole catalog | clap | new Deezer seeds | 2,869 | 49.5% | 64.5% | 67.5% |
| whole catalog | clap | new iTunes seeds | 2,730 | 88.2% | 64.1% | 65.3% |
| whole catalog | clap | existing Deezer seeds | 3,752 | 36.9% | 55.1% | 50.4% |
| whole catalog | clap | existing iTunes seeds | 226 | 83.4% | 58.4% | 54.4% |
| whole catalog | effnet | new seeds | 5,599 | 61.0% | 64.3% | 66.4% |
| whole catalog | effnet | existing seeds | 3,978 | 50.0% | 55.2% | 50.6% |
| whole catalog | effnet | new Deezer seeds | 2,869 | 60.8% | 64.5% | 67.5% |
| whole catalog | effnet | new iTunes seeds | 2,730 | 61.2% | 64.1% | 65.3% |
| whole catalog | effnet | existing Deezer seeds | 3,752 | 49.9% | 55.1% | 50.4% |
| whole catalog | effnet | existing iTunes seeds | 226 | 51.6% | 58.4% | 54.4% |
| Deezer albums only | clap | new Deezer seeds | 2,869 | 48.2% | 52.4% | 56.8% |
| Deezer albums only | clap | existing Deezer seeds | 3,752 | 35.5% | 39.8% | 34.9% |
| Deezer albums only | effnet | new Deezer seeds | 2,869 | 48.8% | 52.4% | 56.8% |
| Deezer albums only | effnet | existing Deezer seeds | 3,752 | 35.7% | 39.8% | 34.9% |

## 4. The same recording from both stores

44 albums were in the cache under two keys or two listings (a duplicate catalog row, matched on its own before it was dropped; `onepass.before-rekey.sqlite`). 23 of them have one Deezer and one iTunes listing; 16 of those have clips at the same track positions in both (so the same tracks; listings with another track count are left out, and so are one-clip albums). Titles could not be compared: the earlier run's listings are not in the cache. Cosines are between clip vectors.

| Pair of listings | Albums | Model | Same track, across the two | Other track, across the two | Other track, within one listing |
|---|---|---|---|---|---|
| Deezer vs iTunes | 16 | clap | 0.773 (median 0.797, n 63) | 0.532 (median 0.572, n 186) | 0.688 (median 0.735, n 186) |
| Deezer vs iTunes | 16 | effnet | 0.956 (median 0.988, n 63) | 0.680 (median 0.674, n 186) | 0.681 (median 0.677, n 186) |
| same store, another listing | 2 | clap | 0.716 (median 0.647, n 6) | 0.627 (median 0.583, n 14) | 0.822 (median 0.815, n 14) |
| same store, another listing | 2 | effnet | 0.642 (median 0.515, n 6) | 0.532 (median 0.479, n 14) | 0.725 (median 0.680, n 14) |
| same iTunes album id, another storefront | 1 | clap | 1.000 (median 1.000, n 4) | 0.654 (median 0.641, n 12) | 0.654 (median 0.641, n 12) |
| same iTunes album id, another storefront | 1 | effnet | 1.000 (median 1.000, n 4) | 0.711 (median 0.693, n 12) | 0.711 (median 0.693, n 12) |

For EffNet the same track from the other store is close to identical (0.96, median 0.99) and another track of the album is equally far whichever store it comes from. For CLAP the same track from the other store is at 0.77, not far above another track from the same store (0.69), and another track from the other store is much further (0.53 against 0.69). The two same-store rows are too few to read (2 albums, and those listings are other editions).

A store probe (iTunes vs Deezer) trained on the new albums that are not in these pairs, applied to the two versions of each album:

| Model | Albums where the iTunes version scores more iTunes | Tracks | Mean score gap between the two versions | Mean gap between iTunes and Deezer albums (out of fold) | Share of that gap | Pair difference along the line between the store means, share of their distance | Cosine of the mean pair difference with that line | Cosine between the mean differences of two halves of the pairs |
|---|---|---|---|---|---|---|---|---|
| clap | 16 of 16 | 63 of 63 | 11.40 (t 15.18) | 10.88 | 105% | 98% (t 14.87) | 0.97 | 0.96 |
| effnet | 14 of 16 | 48 of 63 | 0.41 (t 3.39) | 0.88 | 46% | -2% (t -0.6) | -0.06 | 0.13 |

In 3 of the 16 pairs the iTunes version is the one the earlier run embedded and the Deezer one the one-pass run's; the iTunes version scores more iTunes in 3 of them. With the 80 tracks embedded by both runs at cosine 1.0 (`sonic_measures.md`), the run is not what the probe reads. EffNet's probe also leans the right way on most pairs, by about half of its (small) population gap: it has a faint trace of the store too, which does not show in its lists.

## 5. Clips

| Group | Albums | Clips | Median clip (s) | Most common lengths (s: clips) | Under 25 s | Median track (s) | Albums on ranks 0 to 3 | In the planned order | Mean position in the album (0 first, 1 last) | Embedded by |
|---|---|---|---|---|---|---|---|---|---|---|
| existing, Deezer | 3,752 | 14,787 | 29.99 | 29.99: 14,215, 30.02: 409, 9.98: 25 | 0.6% | – | 99.9% | 99.4% | 0.39 | import:clap_clips.sqlite |
| existing, iTunes | 226 | 872 | 29.98 | 29.98: 451, 29.93: 354, 29.95: 63 | 0.3% | – | 100.0% | 100.0% | 0.40 | import:clap_clips.sqlite |
| new, Deezer | 2,869 | 11,328 | 29.99 | 29.99: 10,750, 30.02: 445, 9.98: 23 | 0.6% | 248 | 99.9% | 99.5% | 0.39 | onepass |
| new, iTunes | 2,730 | 10,764 | 29.93 | 29.93: 5,444, 29.98: 4,639, 29.95: 608 | 0.5% | 257 | 99.8% | 99.8% | 0.39 | onepass |

The four groups use the same clips: the first four of the same bit-reversal plan (the existing albums' four CLAP clips are the first four of their eight), at the same places in the album, all about 30 s. The only thing the cache shows that differs by store is the decoded length (Deezer 29.99 s, iTunes 29.93 or 29.98 s), which says the files are encoded differently and nothing more. The cache does not hold where in the track a preview starts, its bitrate, its bandwidth or its loudness.

## 6. What a simple correction would do (CLAP; measured, not adopted)

The correction is applied to the 512-number unit vectors, then the block is refitted and the lists recomputed over the whole catalog. Directions are fitted on the albums they are removed from. `Overlap` is the mean number of the ten neighbours kept from the uncorrected list. Mean N10: how many lists an album of that store is in (10 on average).

| Correction | Overlap@10 | iTunes neighbours, new Deezer seeds | iTunes neighbours, new iTunes seeds | New neighbours, new seeds | New neighbours, existing seeds | Mean N10 Deezer / iTunes | genre_primary | genre_family | desc_jaccard | New vs existing AUC |
|---|---|---|---|---|---|---|---|---|---|---|
| none (as it is) | 10.00 | 2.3% | 91.7% | 68.3% | 39.5% | 10.1 / 9.7 | 0.182 | 0.592 | 0.191 | 0.797 |
| 1 direction: between the store means (new albums) | 7.32 | 7.3% | 44.7% | 58.4% | 40.3% | 11.8 / 6.1 | 0.193 | 0.601 | 0.195 | 0.709 |
| 1 direction: store probe weights (new albums) | 9.56 | 2.9% | 87.6% | 67.5% | 39.7% | 10.2 / 9.4 | 0.184 | 0.593 | 0.192 | 0.795 |
| 2 directions: store probe, iterated | 9.07 | 3.5% | 80.3% | 65.9% | 39.8% | 10.5 / 8.8 | 0.187 | 0.596 | 0.193 | 0.793 |
| 4 directions: store probe, iterated | 8.13 | 5.1% | 59.8% | 61.3% | 39.7% | 11.3 / 7.1 | 0.191 | 0.600 | 0.194 | 0.788 |
| 8 directions: store probe, iterated | 7.45 | 7.0% | 46.2% | 58.4% | 40.3% | 11.7 / 6.2 | 0.193 | 0.600 | 0.195 | 0.753 |
| each store centred on its own mean | 8.00 | 5.7% | 50.1% | 59.0% | 39.8% | 11.7 / 6.3 | 0.190 | 0.599 | 0.194 | 0.645 |
| control: 1 random direction | 9.95 | 2.3% | 91.7% | 68.3% | 39.5% | 10.1 / 9.7 | 0.182 | 0.592 | 0.191 | 0.797 |
| control: the block's first principal direction | 8.18 | 2.2% | 92.1% | 68.5% | 39.5% | 10.1 / 9.7 | 0.175 | 0.574 | 0.188 | 0.797 |
| each store standardised per dimension (mean and sd) | 7.69 | 13.0% | 60.4% | 63.2% | 43.5% | 10.5 / 8.8 | 0.188 | 0.598 | 0.194 | 0.649 |
| iTunes albums mapped onto Deezer's mean and covariance | 6.76 | 18.7% | 47.3% | 60.9% | 45.6% | 10.6 / 8.8 | 0.184 | 0.591 | 0.192 | 0.638 |
| 1 direction: mean difference of the same-album pairs | 7.30 | 7.4% | 43.6% | 58.1% | 40.4% | 11.8 / 6.0 | 0.196 | 0.602 | 0.196 | 0.763 |
| iTunes albums shifted by the mean pair difference | 7.98 | 5.8% | 50.4% | 59.4% | 39.8% | 11.6 / 6.3 | 0.191 | 0.600 | 0.194 | 0.775 |

Same-genre make-up for comparison: iTunes neighbours 29.1% for new Deezer seeds and 37.7% for new iTunes seeds; new neighbours 64.3% for new seeds and 55.2% for existing seeds. The store-probe AUC after each correction is in the JSON; it is not a fair score for a correction that equalises the two means on all albums (a cross-validated linear probe then reads below 0.5).

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
- If a listener found the iTunes-sourced albums to be a different kind of record from the Deezer-sourced ones of the same genre and decade, part of the split would be A. RYM's year, rank and genre do not show such a difference (store from metadata: 0.640).
