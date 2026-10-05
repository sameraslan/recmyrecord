# Sonic-only measures of the CLAP block over the 10k catalog

**Store measured: `clap_mp3` (../../data-pipeline/audio/clap). Rows and columns named `clap` are that store.**

Generated 2026-10-05 by `measure.py`. Provisional until the clip cache and the catalog are final.

**These are RYM-based proxies, computed over the whole catalog with audio. They describe the lists; they are not a held-out evaluation, and nobody listened.** Lists are the ten nearest albums by the 64-number audio block alone. Genres and descriptors are the sheet's columns in `catalog/albums.csv`. The earlier experiments' test splits are spent and are not used here. Definitions, and why the levels are not comparable with the earlier reports, are in the docstring of `measure.py`.

Catalog: 10,467 albums; 10,235 have CLAP audio (6,198 new, 4,037 on the site); 10,235 have both models. 9,774 of those with CLAP audio have a genre in the sheet, 9,436 have five or more top descriptors (the site's off-chart albums have neither).
Clips behind the CLAP mean: 1: 27, 2: 26, 3: 46, 4: 9,307, 5: 36, 6: 51, 7: 80, 8: 662.

## Top 10 by the audio block alone

| Pool | Block | Albums | genre_primary | genre_any | genre_family | desc_jaccard | desc_shared | genre_primary_xa | desc_jaccard_xa | Never recommended | Max N10 | N10 skew |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| catalog | clap | 10,235 | 0.197 | 0.362 | 0.601 | 0.194 | 2.38 | 0.166 | 0.185 | 2.1% | 62 | 1.24 |
| catalog | random (floor) | 10,235 | 0.008 | 0.022 | 0.114 | 0.064 | 0.87 |  |  |  |  |  |
| both_models | clap | 10,235 | 0.197 | 0.362 | 0.601 | 0.194 | 2.38 | 0.166 | 0.185 | 2.1% | 62 | 1.24 |
| both_models | effnet_4clip | 10,235 | 0.241 | 0.429 | 0.643 | 0.200 | 2.44 | 0.212 | 0.191 | 0.8% | 48 | 0.95 |
| both_models | random (floor) | 10,235 | 0.008 | 0.022 | 0.114 | 0.064 | 0.87 |  |  |  |  |  |
| existing_only | clap | 4,037 | 0.197 | 0.354 | 0.624 | 0.200 | 2.44 | 0.159 | 0.188 | 1.8% | 57 | 1.24 |
| existing_only | effnet_4clip | 4,037 | 0.245 | 0.427 | 0.664 | 0.208 | 2.53 | 0.208 | 0.196 | 0.6% | 37 | 0.79 |
| existing_only | random (floor) | 4,037 | 0.011 | 0.028 | 0.131 | 0.069 | 0.94 |  |  |  |  |  |

Pools: `catalog` = every catalog album with CLAP audio; `both_models` = the albums with both models' clips: the same albums, labels and candidates for the two rows; `existing_only` = the site's albums only (seeds and candidates): the pool closest to the earlier reports'. `effnet_4clip` is not the site's EffNet block: it is the cache's four-clip means through a PCA fitted on the pool's albums (see `sonic.py`). Mean shared neighbours between the CLAP and EffNet lists (of 10): both_models 2.141, existing_only 2.523.

## New and existing albums

New albums are 60.6% of the albums with CLAP audio: a list that ignored whether an album is new would hold that share of new albums. "Same-genre albums that are new" is what the catalog's make-up alone would give (the share of new albums among the other albums with the seed's first primary genre). Mean N10 is how many lists an album of the group appears in (10 on average over all albums). The first three rows are the whole catalog with CLAP audio, the others the albums with both models.

| Seeds | Albums | genre_primary | desc_jaccard | Neighbours that are new | Same-genre albums that are new | Mean N10 | Never recommended | Max N10 | Seeds with a genre |
|---|---|---|---|---|---|---|---|---|---|
| clap, all | 10,235 | 0.197 | 0.194 | 58.5% | 62.9% | 10.0 | 2.1% | 62 | 9774 |
| clap, new | 6,198 | 0.189 | 0.189 | 63.5% | 66.6% | 9.7 | 2.2% | 53 | 6190 |
| clap, existing | 4,037 | 0.210 | 0.204 | 50.9% | 56.7% | 10.5 | 2.0% | 62 | 3584 |
| both models: clap, new | 6,198 | 0.189 | 0.189 | 63.5% | 66.6% | 9.7 | 2.2% | 53 | 6190 |
| both models: clap, existing | 4,037 | 0.210 | 0.204 | 50.9% | 56.7% | 10.5 | 2.0% | 62 | 3584 |
| both models: effnet_4clip, new | 6,198 | 0.229 | 0.194 | 63.4% | 66.6% | 9.7 | 0.9% | 47 | 6190 |
| both models: effnet_4clip, existing | 4,037 | 0.261 | 0.211 | 51.6% | 56.7% | 10.5 | 0.7% | 48 | 3584 |

A block whose lists hold more new albums for new seeds than the same-genre share, and fewer for existing seeds, separates new from existing albums by something other than RYM genre. That can be the music (era, production, how well known the record is) or how the two batches were made (the existing albums' clips were embedded by an earlier run). On the second: 28 tracks are in the cache twice, embedded once by each run; the cosine between the two vectors is at least 1.0000 for CLAP and 1.0000 for EffNet (28 tracks). At 1.0 the two runs make the same vector from the same preview, and the difference is in the albums.

## By clips behind the mean (CLAP, whole catalog)

| Seeds | Albums | genre_primary | desc_jaccard | Neighbours that are new | Same-genre albums that are new | Mean N10 | Never recommended | Max N10 | Seeds with a genre |
|---|---|---|---|---|---|---|---|---|---|
| 4_clips | 9,267 | 0.196 | 0.195 | 57.3% | 62.0% | 10.1 | 2.0% | 62 | 8871 |
| under_4_clips | 99 | 0.155 | 0.195 | 67.3% | 70.0% | 5.1 | 13.1% | 28 | 77 |
| full_length_windows | 869 | 0.206 | 0.189 | 70.9% | 72.0% | 9.7 | 2.2% | 38 | 826 |

`under_4_clips`: the listing has fewer than four previews. `full_length_windows`: windows of a full-length file (local, youtube, bandcamp), where the mean takes every window.

## By audio source (CLAP, whole catalog)

The source is where the clips behind an album's mean came from (the store's `source`; every iTunes storefront counts as itunes; local, youtube and bandcamp are windows of a full-length file). Mean N10 is how many lists an album of the source appears in (10 on average over all albums). Each "from" column is the share of the seeds' ten neighbours whose audio is from that source (all seeds of the row) and, in brackets, what the catalog's make-up alone would give: the share of that source among the other albums with the seed's first primary genre (the seeds with a genre). Both are `mixing` of `source_effect.py`, as in the tables of `source_effect.md`; the JSON also has the neighbour share over the seeds with a genre only. **Like everything here these are RYM-catalog proxies on the stored vectors: nobody listened.** They can show that lists lean towards the seed's own source beyond what RYM genre gives. They cannot say whether that is the music (which albums each store has) or the audio's origin, and a small group's row is noisy.

| Seeds | Albums | Mean N10 | Never recommended | Neighbours from deezer (same-genre share) | Neighbours from itunes (same-genre share) | Neighbours from youtube (same-genre share) | Seeds with a genre |
|---|---|---|---|---|---|---|---|
| deezer | 6,473 | 10.1 | 2.2% | 69.5% (66.3%) | 24.9% (26.7%) | 5.7% (7.0%) | 5,999 |
| itunes | 2,893 | 9.8 | 1.9% | 57.8% (57.5%) | 35.0% (34.8%) | 7.2% (7.7%) | 2,789 |
| youtube | 869 | 9.7 | 2.2% | 44.1% (52.3%) | 24.7% (26.8%) | 31.2% (20.9%) | 803 |
| deezer, new | 2,815 | 9.6 | 2.6% | 67.5% (65.3%) | 25.4% (26.3%) | 7.1% (8.4%) | 2,739 |
| deezer, existing | 3,658 | 10.5 | 1.9% | 71.0% (67.2%) | 24.4% (27.0%) | 4.6% (5.8%) | 3,260 |

## Most-recommended albums (CLAP, whole catalog)

| N10 | Album | Year | Rank | Primary genres | New | Clips |
|---|---|---|---|---|---|---|
| 62 | Spirit, Twelve Dreams of Dr. Sardonicus | 1970 | 6222 | Psychedelic Rock |  | 4 |
| 56 | Testament, The Legacy | 1987 | 2704 | Thrash Metal |  | 4 |
| 53 | Various Artists, Boogiepop Phantom | 2000 | 7182 | Television Music, Downtempo, Electronic Dance Music | new | 4 |
| 51 | Spring, Spring | 1971 | 5993 | Progressive Rock |  | 4 |
| 49 | The Dillinger Escape Plan, Under the Running Board | 1998 |  |  |  | 4 |
| 46 | Nasum, Inhale / Exhale | 1998 | 4042 | Grindcore | new | 4 |
| 46 | Blue Mitchell, The Thing to Do | 1965 | 8392 | Hard Bop | new | 4 |
| 46 | Utopia, Todd Rundgren's Utopia | 1974 | 8413 | Progressive Rock | new | 4 |
| 45 | Buffalo Springfield, Buffalo Springfield Again | 1967 | 6989 | Folk Rock, Psychedelic Rock |  | 4 |
| 45 | Christopher Larkin, Hollow Knight: Silksong | 2025 | 850 | Video Game Music, Cinematic Classical, Ambient | new | 4 |
| 45 | Massacra, Enjoy the Violence | 1991 | 7574 | Death Metal | new | 4 |
| 44 | Manfred Mann's Earth Band, Nightingales & Bombers | 1975 | 5610 | Progressive Rock |  | 4 |
| 44 | Runemagick, The Supreme Force of Eternity | 1998 | 5047 | Death Metal | new | 4 |
| 44 | The Beatles, Let It Be | 1970 | 5285 | Pop Rock, Blues Rock | new | 4 |
| 43 | Pulp, This Is Hardcore | 1998 | 2903 | Art Rock |  | 4 |

## What these numbers can and cannot say

- They can say whether the CLAP block's neighbours share RYM genres and descriptors more or less often than the EffNet block's on the same albums, whether new albums are reachable (they appear in lists about as often as their share), and whether a few albums crowd the lists.
- They cannot say that a list sounds right. A higher genre match is not better by itself: the owner chose CLAP partly because it crosses genres. The listening page (`listening_page.py`) is the check for that.
- The genre and descriptor columns are empty for the site's off-chart albums, so those albums count as candidates and in hubness, not in the genre or descriptor means (`n` in the JSON).
- No confidence intervals: these are whole-catalog means, not estimates from a sample.
