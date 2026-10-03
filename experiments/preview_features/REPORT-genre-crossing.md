# Making the sonic stop cross genres

Experiment, 3 October 2026. Proof of concept on cached clips. Nothing under `data-pipeline/audio/`, the transform or `frontcreck/public/data/` was changed.

Listening page: https://claude.ai/artifact/4NjJTbGzatP7uCy7y2bCo6 (rebuild with `python crossgenre_page.py OUT.html`).

## Result

No audio representation both reaches clearly further outside the seed's genre and keeps EffNet's agreement on how the music feels. Every option sits on one trade-off, at most about 0.04 above plain EffNet diluted with noise to the same reach.

**CLAP (music and speech) is the pick.** Run over the whole catalog on 3 October (3,942 albums, the same four clips per album as EffNet):

| Measure | EffNet | CLAP | Paired difference, 95% CI |
|---|---|---|---|
| Outside family, share of top 10 | 0.367 | 0.410 | +0.044 [+0.037, +0.051] |
| Descriptor agreement, same artist removed | 0.432 | 0.426 | −0.005 [−0.008, −0.003] |
| Crossing quality (xg lift) | +0.148 | +0.156 | +0.007 [+0.005, +0.010] |
| Primary genre, same artist removed | 0.202 | 0.157 | −0.045 [−0.051, −0.039] |
| Hub skew / never listed | 0.79 / 0.7% | 1.24 / 1.5% | |
| Balanced stop, primary genre | 0.270 | 0.237 | −0.033 [−0.037, −0.029] |
| Holdout: list unchanged for an unseen album | 94.8% | 99.5% | |

- The 1,000-album finding holds at catalog scale: about 0.4 more albums of ten outside the family for half a point of descriptor cosine.
- For *Bitches Brew* CLAP ranks *Live-Evil* 1, *Get Up With It* 13 and *Rocksession* 93 (EffNet: 70, 286, 430). The list is still all jazz, with no prog; nothing forces it elsewhere.
- Costs: more hubs, and lists at the balanced stop match the seed's primary genre less often. A linear probe still reads genre family from CLAP nearly as well as from EffNet (0.70 against 0.72), so it is less tied to genre, not free of it.
- Two albums have no CLAP vector (previews withdrawn since the EffNet run).

The other option worth hearing is **Spotify-like scores predicted from audio** (`ridge`): looser, the only list for *Bitches Brew* with rock in it, weaker on agreement.

Decisions taken by the owner on 3 October: use CLAP; no forcing of recommendations outside a genre (the forced-crossing rows below are kept for the record only); do not optimise the audio side for descriptor agreement.

## The measurement

`crossgenre.py`, reusing `simbench.py` and `genres.py`. Euclidean top 10 on the audio block alone, same artist removed.

- **Outside family**: share of the top 10 outside the seed's genre family (17 families).
- **Descriptor agreement**: mean RYM-descriptor cosine between seed and neighbours.
- **Crossing quality** (xg lift): rank only albums outside the seed's family, take the top 10, and report their descriptor cosine above the out-of-family random floor.
- **Hubs**: skew of how many lists each album appears in.

Random and shuffled blocks sit at the floors (lift −0.001 to −0.003, 0.87 outside family). Plain EffNet reproduces the earlier tables (primary genre 0.180 and descriptor cosine 0.420 on the bake-off albums at PCA 24).

## Whole catalog: 3,944 albums, 4 clips, PCA 64

| Option | Outside family | Descriptor agreement | Crossing quality | Hubs |
|---|---|---|---|---|
| EffNet (in use) | 0.366 | 0.432 | +0.148 | 0.8 |
| Spotify features (old site) | 0.606 | 0.352 | +0.093 | 0.8 |
| Spotify-like scores from audio (`ridge`) | 0.521 | 0.379 | +0.112 | 0.6 |
| Essentia scalars, all 33 (`ball`) | 0.473 | 0.398 | +0.128 | 1.0 |
| EffNet + scalars at 0.9 of the variance | 0.429 | 0.410 | +0.139 | 1.1 |
| MusiCNN | 0.422 | 0.411 | +0.144 | 0.8 |
| EffNet, Discogs-400 directions removed | 0.371 | 0.430 | +0.144 | 0.7 |
| EffNet, INLP 2 rounds (RYM families) | 0.404 | 0.418 | +0.136 | 1.0 |
| EffNet, LEACE (RYM families) | 0.487 | 0.400 | +0.096 | 4.2 |
| LEACE EffNet + scalars at 0.5 | 0.428 | 0.424 | +0.139 | 1.5 |
| Ranking rule: MMR 0.5 | 0.407 | 0.417 | – | 0.3 |
| Ranking rule: 5 forced outside, predicted family | 0.454 | 0.412 | – | 8.7 |
| Ranking rule: 5 forced outside, RYM family | 0.591 | 0.406 | – | 9.6 |
| Control: EffNet half noise | 0.455 | 0.383 | +0.110 | 1.3 |
| Control: random | 0.873 | 0.229 | −0.001 | 0.2 |

## Other models: 1,000 albums, 2 clips, PCA 64

| Option | Outside family | Descriptor agreement | Crossing quality | Hubs |
|---|---|---|---|---|
| EffNet | 0.440 | 0.414 | +0.120 | 0.7 |
| CLAP, music and speech | 0.485 | 0.407 | +0.120 | 1.0 |
| CLAP, general audio | 0.530 | 0.396 | +0.112 | 1.1 |
| CLAP + INLP 1 round | 0.538 | 0.397 | +0.110 | 1.4 |
| MusiCNN | 0.483 | 0.397 | +0.115 | 0.6 |
| MERT, layers 4–7 | 0.619 | 0.363 | +0.085 | 2.6 |
| Spotify-like scores from audio | 0.574 | 0.369 | +0.090 | 0.6 |
| Spotify features | 0.610 | 0.358 | +0.081 | 0.7 |
| Control: EffNet half noise | 0.517 | 0.372 | +0.083 | 1.4 |

## What the numbers show

- **EffNet already crosses.** 3.7 of its ten are outside the family on average, and its out-of-family picks are as good as any model's. Jazz is the hard case: for *Bitches Brew* the first non-jazz album is at rank 164.
- **CLAP reaches further at almost no cost** (+0.044 outside family, −0.007 agreement). MERT reaches furthest and agrees least; layers 5–6 are its best, early layers are not better, and all layers have strong hubs.
- **Projecting out the Discogs-400 classifier weights does nothing** at any rank. The weights were read from the embedding model's own final layer (verified against the model's output to 5e-8). Those 400 directions hold 64% of the variance and the rest orders albums the same way.
- **Genre removal fitted on RYM families** (INLP, LEACE, family means; fitted out-of-fold by artist) raises reach, lowers crossing quality to about the noise level, and creates hubs.
- **Scalar blocks** reach as far as LEACE with better crossings and no hubs. Blending them with EffNet changes little until they carry 75–90% of the variance.
- **The old Spotify lists crossed by being loose**: furthest reach, lowest agreement. The audio-predicted version is a little tighter on both pools.
- **Forcing five slots outside the family** gives crossings as good as natural ones but sends the same few albums into hundreds of lists. MMR lowers hubs and gains little reach.
- **New albums.** Unsupervised blocks are unaffected by holding an album out of the fit (CLAP: 99% of the list unchanged). RYM-fitted removals keep their scores for held-out artists but change 13–28% of each list.

## Bitches Brew

Rank among the other 3,943 albums (in-fit transforms, four clips):

| Option | Live-Evil | Get Up With It | Rocksession | First rock album | Outside jazz in top 10 |
|---|---|---|---|---|---|
| EffNet | 70 | 286 | 430 | 264 | 0 |
| Spotify features | 912 | 461 | 42 | 2 | 8 |
| Spotify-like scores from audio | 152 | 121 | 106 | 8 | 2 |
| EffNet + Spotify-like at 0.9 | 95 | 84 | 94 | 14 | 0 |
| Essentia scalars | 579 | 350 | 252 | 30 | 0 |
| MusiCNN | 55 | 256 | 341 | 15 | 0 |
| EffNet, LEACE | 18 | 85 | 1908 | 49 | 1 |

The Spotify-like list: Mahavishnu Orchestra, *In a Silent Way*, Cecil Taylor, Julia Holter's *Aviary*, Julian Priester, the Jazz Composer's Orchestra, Soft Machine's *Third*, McCoy Tyner, Wayne Shorter. Its mean descriptor cosine with the seed is 0.50, the same as EffNet's all-jazz list; the old Spotify list scored 0.34. None of the three albums from the balanced stop enters any audio-only top 10.

## Limits

- Every measure is built from RYM genres and descriptors, and RYM descriptors correlate with genre. A method that crosses genres well may be penalised for it. The listening page is the real test.
- *Bitches Brew* and its three targets are not among the 1,000 bake-off albums, so CLAP and MERT were not tested on the anchor.
- The Spotify-like lists on the page are in-fit: the regression saw each catalog album's real Spotify columns. A new album gets a pure prediction (R² 0.7–0.8 for energy, acousticness, danceability, loudness, valence; under 0.3 for key, mode, tempo, liveness). The table rows are out-of-fold.
- The page's full-catalog lists use four clips per album; the site's store has up to eight.
- Family is a regex over RYM genres; Jazz-Rock counts as jazz.
- Differences of 0.03–0.04 "above the noise curve" between leading options are not separable.

## Files

| File | Contents |
|---|---|
| `crossgenre.py` | Measurement, candidates, `build(name, pool)`, holdout, anchor, report |
| `graphdef.py` | Reads the Discogs-400 layer from the EffNet graph |
| `crossgenre_listen.py`, `crossgenre_page.py`, `crossgenre_page.template.html` | Listening lists and page |
| `results/crossgenre.md`, `.json` | Every table and sweep |
| `results/crossgenre_listening.json` | Lists behind the page |

Run with `RMR_PREVIEW_CACHE=<cache dir>` pointing at the experiment cache.
