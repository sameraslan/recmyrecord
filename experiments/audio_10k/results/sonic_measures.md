# Sonic-only measures of the CLAP block over the 10k catalog

Generated 2026-10-04 by `measure.py`. Provisional until the clip cache and the catalog are final.

**These are RYM-based proxies, computed over the whole catalog with audio. They describe the lists; they are not a held-out evaluation, and nobody listened.** Lists are the ten nearest albums by the 64-number audio block alone. Genres and descriptors are the sheet's columns in `catalog/albums.csv`. The earlier experiments' test splits are spent and are not used here. Definitions, and why the levels are not comparable with the earlier reports, are in the docstring of `measure.py`.

Catalog: 10,467 albums; 9,603 have CLAP audio (5,625 new, 3,978 on the site); 9,599 have both models. 9,163 of those with CLAP audio have a genre in the sheet, 8,837 have five or more top descriptors (the site's off-chart albums have neither).
Clips behind the CLAP mean: 1: 68, 2: 104, 3: 145, 4: 9,267, 5: 1, 6: 1, 7: 2, 8: 15.

## Top 10 by the audio block alone

| Pool | Block | Albums | genre_primary | genre_any | genre_family | desc_jaccard | desc_shared | genre_primary_xa | desc_jaccard_xa | Never recommended | Max N10 | N10 skew |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| catalog | clap | 9,603 | 0.183 | 0.341 | 0.592 | 0.191 | 2.34 | 0.155 | 0.182 | 1.6% | 59 | 1.24 |
| catalog | random (floor) | 9,603 | 0.008 | 0.023 | 0.116 | 0.065 | 0.88 |  |  |  |  |  |
| both_models | clap | 9,599 | 0.183 | 0.341 | 0.592 | 0.191 | 2.34 | 0.155 | 0.182 | 1.6% | 59 | 1.24 |
| both_models | effnet_4clip | 9,599 | 0.234 | 0.423 | 0.638 | 0.200 | 2.44 | 0.205 | 0.191 | 0.9% | 45 | 0.91 |
| both_models | random (floor) | 9,599 | 0.008 | 0.022 | 0.115 | 0.065 | 0.88 |  |  |  |  |  |
| existing_only | clap | 3,974 | 0.192 | 0.346 | 0.618 | 0.198 | 2.42 | 0.156 | 0.186 | 1.5% | 56 | 1.25 |
| existing_only | effnet_4clip | 3,974 | 0.242 | 0.424 | 0.659 | 0.207 | 2.51 | 0.207 | 0.195 | 0.6% | 37 | 0.79 |
| existing_only | random (floor) | 3,974 | 0.011 | 0.029 | 0.135 | 0.069 | 0.94 |  |  |  |  |  |

Pools: `catalog` = every catalog album with CLAP audio; `both_models` = the albums with both models' clips: the same albums, labels and candidates for the two rows; `existing_only` = the site's albums only (seeds and candidates): the pool closest to the earlier reports'. `effnet_4clip` is not the site's EffNet block: it is the cache's four-clip means through a PCA fitted on the pool's albums (see `sonic.py`). Mean shared neighbours between the CLAP and EffNet lists (of 10): both_models 1.835, existing_only 2.432.

## New and existing albums

New albums are 58.6% of the albums with CLAP audio: a list that ignored whether an album is new would hold that share of new albums. "Same-genre albums that are new" is what the catalog's make-up alone would give (the share of new albums among the other albums with the seed's first primary genre). Mean N10 is how many lists an album of the group appears in (10 on average over all albums). The first three rows are the whole catalog with CLAP audio, the others the albums with both models.

| Seeds | Albums | genre_primary | desc_jaccard | Neighbours that are new | Same-genre albums that are new | Mean N10 | Never recommended | Max N10 | Seeds with a genre |
|---|---|---|---|---|---|---|---|---|---|
| clap, all | 9,603 | 0.183 | 0.191 | 56.4% | 60.9% | 10.0 | 1.6% | 59 | 9163 |
| clap, new | 5,625 | 0.172 | 0.184 | 68.2% | 64.4% | 9.6 | 1.7% | 50 | 5617 |
| clap, existing | 3,978 | 0.200 | 0.201 | 39.8% | 55.3% | 10.5 | 1.5% | 59 | 3546 |
| both models: clap, new | 5,625 | 0.172 | 0.184 | 68.3% | 64.5% | 9.6 | 1.7% | 50 | 5617 |
| both models: clap, existing | 3,974 | 0.200 | 0.201 | 39.8% | 55.3% | 10.5 | 1.5% | 59 | 3542 |
| both models: effnet_4clip, new | 5,625 | 0.220 | 0.193 | 61.2% | 64.5% | 9.7 | 1.0% | 45 | 5617 |
| both models: effnet_4clip, existing | 3,974 | 0.258 | 0.211 | 50.1% | 55.3% | 10.5 | 0.8% | 40 | 3542 |

A block whose lists hold more new albums for new seeds than the same-genre share, and fewer for existing seeds, separates new from existing albums by something other than RYM genre. That can be the music (era, production, how well known the record is) or how the two batches were made (the existing albums' clips were embedded by an earlier run). On the second: 80 tracks are in the cache twice, embedded once by each run; the cosine between the two vectors is at least 1.0000 for CLAP and 1.0000 for EffNet (80 tracks). At 1.0 the two runs make the same vector from the same preview, and the difference is in the albums.

## By clips behind the mean (CLAP, whole catalog)

| Seeds | Albums | genre_primary | desc_jaccard | Neighbours that are new | Same-genre albums that are new | Mean N10 | Never recommended | Max N10 | Seeds with a genre |
|---|---|---|---|---|---|---|---|---|---|
| 4_clips | 9,267 | 0.183 | 0.191 | 56.2% | 60.7% | 10.1 | 1.4% | 59 | 8871 |
| under_4_clips | 317 | 0.167 | 0.195 | 61.1% | 65.5% | 6.2 | 7.3% | 32 | 273 |
| full_length_windows | 19 | 0.221 | 0.183 | 67.9% | 69.6% | 5.7 | 0.0% | 16 | 19 |

`under_4_clips`: the listing has fewer than four previews. `full_length_windows`: windows of a full-length file (local, youtube, bandcamp), where the mean takes every window.

## Most-recommended albums (CLAP, whole catalog)

| N10 | Album | Year | Rank | Primary genres | New | Clips |
|---|---|---|---|---|---|---|
| 59 | Spirit, Twelve Dreams of Dr. Sardonicus | 1970 | 6222 | Psychedelic Rock |  | 4 |
| 57 | Testament, The Legacy | 1987 | 2704 | Thrash Metal |  | 4 |
| 52 | Spring, Spring | 1971 | 5993 | Progressive Rock |  | 4 |
| 50 | Blue Mitchell, The Thing to Do | 1965 | 8392 | Hard Bop | new | 4 |
| 49 | Buffalo Springfield, Buffalo Springfield Again | 1967 | 6989 | Folk Rock, Psychedelic Rock |  | 4 |
| 46 | Nasum, Inhale / Exhale | 1998 | 4042 | Grindcore | new | 4 |
| 45 | David Bowie, Aladdin Sane | 1973 | 884 | Glam Rock, Art Rock |  | 4 |
| 45 | The Beatles, Let It Be | 1970 | 5285 | Pop Rock, Blues Rock | new | 4 |
| 44 | Various Artists, Boogiepop Phantom | 2000 | 7182 | Television Music, Downtempo, Electronic Dance Music | new | 4 |
| 43 | Clifford Brown and Max Roach, Clifford Brown and Max Roach | 1954 | 1579 | Hard Bop |  | 4 |
| 42 | Thin Lizzy, Jailbreak | 1976 | 1122 | Hard Rock |  | 4 |
| 42 | Ten Years After, A Space in Time | 1971 | 7341 | Blues Rock |  | 4 |
| 42 | Massacra, Enjoy the Violence | 1991 | 7574 | Death Metal | new | 4 |
| 42 | Quicksilver Messenger Service, Quicksilver Messenger Service | 1968 | 9696 | Psychedelic Rock, Acid Rock | new | 4 |
| 41 | Samla Mammas Manna, Måltid | 1973 | 6077 | Avant-Prog |  | 4 |

## What these numbers can and cannot say

- They can say whether the CLAP block's neighbours share RYM genres and descriptors more or less often than the EffNet block's on the same albums, whether new albums are reachable (they appear in lists about as often as their share), and whether a few albums crowd the lists.
- They cannot say that a list sounds right. A higher genre match is not better by itself: the owner chose CLAP partly because it crosses genres. The listening page (`listening_page.py`) is the check for that.
- The genre and descriptor columns are empty for the site's off-chart albums, so those albums count as candidates and in hubness, not in the genre or descriptor means (`n` in the JSON).
- No confidence intervals: these are whole-catalog means, not estimates from a sample.
