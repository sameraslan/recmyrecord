# Replacing Spotify's audio features with preview-clip embeddings

Experiment, 1 October 2026. Nothing under `frontcreck/public/data/` or the build pipeline was changed.

## Recommendation

Replace the 13 Spotify audio columns with a 64-number audio block built from 30-second preview clips:

1. Match the album on Deezer (iTunes as fallback) and take preview clips spread through the track list. The experiment used four per album; eight is the better setting for a real build (see clip length).
2. Run each clip through Essentia's Discogs-EffNet model and keep its 1,280-number embedding. Discard the audio.
3. Average the four embeddings, L2-normalise, and project to 64 dimensions with a PCA fitted once on the catalog.
4. Scale the block so its total variance equals the old Spotify block's. The three slider stops then keep their meaning.

In the tables below this is variant **D64**. Two additions are optional:

- **Hub correction at the balanced stop.** Rank by mutual proximity instead of raw distance. It stops a few albums appearing in a hundred lists.
- **Descriptor fill for albums with fewer than five RYM descriptors.** Off by default.

The recommendation rests on three results:

- D64 gives more coherent neighbours than Spotify's features on every measure we have, including the ones designed to be unfair to it.
- Nothing else tested beats it by enough to matter: not Essentia's scalar features, not a regression onto Spotify's columns, not CLAP, MERT, MusiCNN or a projection we trained ourselves.
- It works for albums the transform has never seen, which is the point: new albums can be added.

It does **not** reproduce Spotify's lists. At the sonic stop about half of one recommendation in ten survives. The sonic stop changes character from "similar energy, acousticness and valence" to "sounds like the same kind of record". Whether that is better is a listening judgement; `results/seeds.md` has old and new lists side by side for 21 albums.

## What was run

| Step | Result |
|---|---|
| Matching | 3,944 of 4,081 albums (96.6%): 3,753 on Deezer, 191 on iTunes. 137 unmatched. |
| Previews | 48,771 of the matched albums' 48,843 tracks have a clip (99.85%). |
| Extraction | 16,618 tracks analysed: four spread tracks for every album, and every track for a 150-album subset. 4 tracks failed (3 too short, 1 download). |
| Evaluation pool | All 3,944 matched albums, four tracks each. |

Matching quality, from a hand audit of 180 matches: about 1% of confident matches are wrong and about a third of the 148 flagged `ambiguous`, so roughly 2% overall. Unmatched albums are on neither store: *Loveless*, Godspeed You! Black Emperor, game soundtracks, mixtapes, some classical. Lists are in `results/match_failures.csv` and `results/match_ambiguous.csv`.

Extraction was cut from "every track" to four per album because the laptop could not sustain the full run alongside other work. The clip-length section shows what that costs.

## The variants from the brief

Pool: 3,944 albums. "Overlap" is the share of the baseline's top 10 that the variant also returns. "Primary genre" is the share of the top 10 with the seed's first RYM genre. "Descriptor similarity" is the mean cosine between the seed's RYM descriptors and its neighbours', using the audio block alone.

| Variant | Overlap, sonic | Overlap, balanced | Rank corr., sonic | Primary genre, sonic | Primary genre, balanced | Descriptor similarity |
|---|---|---|---|---|---|---|
| A. Spotify (baseline) | – | – | – | 0.093 | 0.191 | 0.345 |
| No audio block | 0.025 | 0.355 | 0.176 | 0.164 | 0.164 | – |
| Shuffled audio | 0.002 | 0.128 | −0.004 | 0.011 | 0.093 | 0.219 |
| B. Essentia scalars, 10 closest analogues | 0.022 | 0.279 | 0.380 | 0.082 | 0.175 | 0.347 |
| B. Essentia scalars, all 33 | 0.038 | 0.337 | 0.509 | 0.144 | 0.212 | 0.389 |
| C. Ridge onto Spotify's columns | 0.038 | 0.348 | 0.602 | 0.117 | 0.203 | 0.370 |
| D. EffNet embedding, PCA 24 | 0.045 | 0.342 | 0.418 | 0.231 | 0.265 | 0.422 |
| **D. EffNet embedding, PCA 64** | 0.049 | 0.340 | 0.432 | **0.239** | **0.270** | **0.427** |
| D. MusiCNN embedding, PCA 24 | 0.044 | 0.344 | 0.397 | 0.177 | 0.235 | 0.406 |
| E. All scalars + embedding | 0.049 | 0.356 | 0.515 | 0.214 | 0.253 | 0.420 |
| F. Ridge + embedding | 0.050 | 0.365 | 0.586 | 0.212 | 0.252 | 0.418 |

Confidence intervals are about ±0.006 on overlap and ±0.007 on primary genre. Every variant's difference from A on the coherence columns is significant. All block variants are scaled to A's total variance. Full tables, including any-genre and genre-family shares, are in `results/metrics.md`.

How to read it:

- **No variant recovers Spotify's lists.** At the sonic stop the best overlap is 5%. At the balanced stop every variant overlaps A about as much as having no audio block at all (0.355). Agreement with A is therefore not a usable target.
- **A itself is a weak baseline at the sonic stop.** Spotify audio alone finds the seed's primary genre 9% of the time; RYM descriptors alone find it 16%.
- **The embedding wins on quality.** D64 more than doubles A's primary-genre share at the sonic stop and adds 0.08 at balanced.
- **Mixing scalars in (E, F) buys agreement with Spotify and costs coherence.** They are worse than D on every quality column.
- **The mood stop is unaffected.** 97% of lists are unchanged whatever the audio block is.

### Ridge regression onto Spotify's columns

Out-of-fold R², five folds:

| Spotify column | Scalars only | Scalars + embedding |
|---|---|---|
| energy | 0.75 | 0.79 |
| acousticness | 0.68 | 0.78 |
| danceability | 0.70 | 0.75 |
| loudness | 0.70 | 0.73 |
| valence | 0.67 | 0.71 |
| speechiness | 0.45 | 0.65 |
| instrumentalness | 0.53 | 0.61 |
| duration_ms | 0.78 | 0.79 |
| tempo | 0.24 | 0.29 |
| liveness | 0.10 | 0.20 |
| mode | 0.13 | 0.19 |
| time_signature | 0.10 | 0.13 |
| key | 0.04 | 0.03 |
| mean | 0.45 | 0.51 |

The "feel" columns are recoverable to R² 0.7–0.8. Key, mode, tempo, time signature and liveness are not, with four clips per album. A Spotify-like block is possible but gives worse neighbours than the embedding, so there is no reason to build one.

### The `IN_RAINBOWS_LIVE` check

Every variant passes 5 of 5 in order, and so do "no audio" and "shuffled audio". The check runs at slider 0.5, where the audio block has almost no weight. It guards the descriptor side of the recommender and cannot tell audio variants apart.

## Checks that are harder on the embedding

Discogs-EffNet was trained on Discogs genre labels, so genre coherence favours it by construction. These checks were added to see whether the lead survives (`results/simbench.md`; descriptor similarity here uses albums with five or more descriptors).

| Check, audio block alone | A (Spotify) | D64 | Random |
|---|---|---|---|
| Primary genre, same-artist neighbours removed | 0.080 | 0.202 | 0.011 |
| Descriptor similarity, same-artist removed | 0.352 | 0.432 | 0.229 |
| Descriptor similarity when ranking only inside the seed's genre family | 0.399 | 0.440 | 0.341 |
| Sub-genre match inside the seed's genre family | 0.189 | 0.303 | 0.104 |
| Same-artist retrieval (mean reciprocal rank) | 0.119 | 0.362 | 0.007 |
| Distance to neighbours on Spotify's feel axes (lower is closer) | 0.361 | 0.638 | 1.118 |

- The lead holds with the artist's own albums removed, and inside a single genre family. The space orders records within a genre; it does not only separate genres.
- RYM descriptors are independent of the model's training labels and rank the variants the same way genre does.
- The last row is the cost. D64's neighbours are further from the seed on energy, acousticness, valence and the rest than A's are. A is built from those axes, so it wins that row by definition; D64 still sits well below random.

## Other models and our own projection

**Bake-off** (`results/bakeoff_eval.md`): 1,000 albums, two tracks each, every model on identical tracks. Differences are against plain EffNet with PCA 24.

| Model | Primary genre | Descriptor similarity | CPU-seconds per clip |
|---|---|---|---|
| Discogs-EffNet (plain) | 0.180 | 0.420 | 0.43 |
| EffNet, artist-contrastive | +0.011 | +0.006 | 1.0 |
| EffNet, multi-contrastive | +0.007 | −0.001 | 1.0 |
| CLAP, music and speech | −0.039 | −0.006 | 0.44 |
| MusiCNN | −0.046 | −0.018 | 0.7 |
| EffNet, track-contrastive | −0.057 | −0.034 | 1.0 |
| CLAP, general audio | −0.067 | −0.022 | 0.44 |
| MERT-v1-95M | −0.092 | −0.060 | 3.2 |

- Only the artist-contrastive EffNet beats the plain one. The gain is real and survives removing same-artist neighbours, but it is one point of genre share for 2.2 times the cost. It is a reasonable later upgrade.
- CLAP has the best published agreement with human similarity judgements, and it lost here. Concatenated with EffNet it adds 0.006 descriptor similarity and nothing on genre.
- The `laion/larger_clap_music` weights on Hugging Face are untrained. `larger_clap_music_and_speech` is the working one.
- MAEST was dropped on cost: 6 CPU-seconds and 3.5 GB per clip.

**Learned projections** (2,799 albums, cross-validated by artist):

| Projection of the EffNet embedding | Primary genre vs PCA 64 | Descriptor similarity vs PCA 64 |
|---|---|---|
| Trained on artist identity (WCCN), 64-d | −0.008 | −0.008 |
| PCA-whitened, 64-d | −0.021 | −0.013 |
| Ridge onto RYM descriptors, 24-d (vs PCA 24) | −0.025 | +0.001 |

None helps. The descriptor-trained projection looked better in-sample (+0.019) and lost the gain entirely on held-out artists.

**Dimensions.** 64 against 24 is +0.010 primary genre and +0.05 on artist retrieval, both significant. 48 and 64 are indistinguishable. Beyond 64 only hubness grows.

## Clip length and tracks per album

377 albums have every track analysed. Features from a subset of tracks are compared with the full-album average. 239 of those albums have four tracks or fewer, where four clips are the whole album, so the table uses the 105 albums with nine or more tracks.

| Tracks used | Scalar correlation with full album (median) | Embedding cosine | Same top 10 as full album, D64 sonic | D64 balanced |
|---|---|---|---|---|
| First track only | 0.70 | 0.71 | 36% | 54% |
| 2 spread tracks | 0.87 | 0.85 | 53% | 71% |
| 4 spread tracks | 0.95 | 0.94 | 75% | 83% |
| 8 spread tracks | 0.99 | 0.98 | 87% | 90% |

- **One clip per album is not enough.** Tempo and key from a single track correlate about 0.4–0.6 with the album.
- **Four is enough to choose a variant.** The ranking of variants is the same with one, two or four tracks (`results/tracks_per_album.md`), and coherence rises with each step: D64's sonic primary-genre share is 0.146, 0.196 and 0.240.
- **Four is not converged for a normal-length album.** A quarter of the sonic-stop recommendations still differ from the all-tracks list. Eight tracks per album is the better production setting, and coherence would probably rise a little further with it.
- **Long-track jazz and prog.** With the first track only, these albums read busier than they are: onset rate +0.25 SD and arousal +0.21 SD against about zero for other albums, and less major-key (−0.26 SD). Their first-track lists are the least stable (33% the same at sonic against 39% elsewhere). These albums have few tracks, so four clips usually cover every track and the bias disappears.
- **What this cannot show.** Every comparison is between sets of 30-second clips. Whether one clip represents a 15-minute track needs full audio, which this experiment never had. That question matters most for exactly these long-track albums.

## What changes for a user

D64 against today's lists, 3,944 albums (`results/analyses.md`):

| Stop | Recommendations kept, of 10 | Share primary genre, new / now | Share genre family, new / now |
|---|---|---|---|
| Sonic | 0.5 | 2.4 / 0.9 | 6.5 / 4.1 |
| Balanced | 3.4 | 2.7 / 1.9 | 6.7 / 5.5 |
| Mood | 9.7 | 1.7 / 1.7 | 5.0 / 5.0 |

**Hubs.** At the balanced stop today, one album sits in 128 lists and 6.9% of albums are in none. The cause is the descriptor block: a random audio block gives the same pattern. Plain D64 improves it a little (91 lists, 4.6%). Mutual proximity brings it to 36 lists and 0.8%, and adds 0.012 primary-genre share. At the sonic stop it adds nothing. At the mood stop it would rewrite about 40% of lists, so the proposal applies it at balanced only.

**Slider.** With the block at 1.4 times the matched variance, balanced-stop primary genre rises from 0.270 to 0.283 and then flattens. No re-tune is needed; a small one is available.

## New albums

The transform was fitted on 80% of albums, split by artist, and applied to the rest (`results/holdout.md`).

| Measure | Album in the fit | Album held out |
|---|---|---|
| Primary genre, audio alone | 0.239 | 0.239 |
| Descriptor similarity | 0.446 | 0.446 |
| Primary genre, balanced stop | 0.270 | 0.269 |

A held-out album gets 95% of the same top 10 it would get inside the fit. The fitted transform is 358 KB: `results/solution_transform.npz`.

**Albums with few descriptors.** An album with no descriptors gets worse balanced-stop neighbours than audio alone would give, because an empty descriptor vector sits close to other sparse albums. Filling the seed's query with descriptors predicted from audio helps albums with fewer than five: +0.020 primary genre at balanced for 439 albums, +0.034 at mood. Writing predicted descriptors into the album's row itself turns those albums into hubs and should not be done.

**Albums with no previews** (137). They get descriptor-only neighbours and are not offered as recommendations for other albums. They cannot share an audio space with the rest.

**Matching noise does not hurt.** Albums flagged ambiguous, oversized, or with a duration mismatch gain as much over Spotify as clean matches do.

## Cost to scale

- EffNet itself measured 0.43 CPU-seconds per clip; with download and decode that is roughly 0.7 (an estimate, not a measured end-to-end run). The full extractor used here also computes scalars, mood heads and MusiCNN, which the proposal does not need, and used 0.7–0.9 GB per worker.
- At that rate, four clips for 1,000 new albums is under an hour on one laptop core; eight clips, under two. Matching is rate-limited by the stores: about 5 requests per second on Deezer, one per 3 seconds on iTunes.
- Deezer preview URLs expire after 15 minutes and must be fetched just before download.

## Limits

- **Every quality measure is an RYM proxy.** No human similarity judgements were collected. The side-by-side lists in `results/seeds.md` are the real test.
- **Specific albums in a top 10 are noisy.** The ranking of variants is stable from one track. The lists themselves are not: for an album of nine or more tracks, a quarter of the sonic-stop list changes between four clips and all of them.
- **The PCA basis is frozen.** A genre absent from today's catalog is projected onto existing axes. Refitting moves about 5% of lists.
- **Mutual proximity is global.** It needs the full distance matrix, and adding an album can shift other albums' lists.
- **The map layouts would need regenerating** from the new matrix.
- **Not checked for production:** Deezer and iTunes preview terms, and the licence on the Essentia weights (CC BY-NC-SA is assumed, which suits a non-commercial site).

## Departures from the brief

- Four tracks per album, not all, for every album outside the 150-album subset.
- The second embedding variant is MusiCNN for the whole catalog. CLAP and MERT were run on a 1,000-album bake-off; MAEST was benchmarked and dropped.
- Variants F (Ridge + embedding) and D48/D64 were added, along with the same-artist, within-genre, hubness and holdout analyses.
- `cache/embeddings.parquet` for the descriptor experiment holds 3,944 albums keyed by `row` and `uri`, with `effnet` (1,280) and `musicnn` (200) album means over every analysed track.

## Reproducing

From `experiments/preview_features/`, with the Python 3.11 venv from `requirements.txt` (`numpy<2` is required by the arm64 Essentia wheel):

```bash
.venv/bin/python match.py                      # resumable; cache/match.sqlite
./run_throttled.sh                             # extraction, two low-priority workers; cache/features.sqlite
./run_evaluation.sh                            # everything in results/, about 9 minutes
.venv/bin/python solution.py fit|holdout|recs  # the proposed pipeline on its own
ALBUMS=1000 TRACKS=2 ./run_bakeoff.sh          # model bake-off; needs .venv-torch for CLAP and MERT
```

| File | Contents |
|---|---|
| `results/metrics.md` | Variants A–F: overlap, rank correlation, genre coherence, Ridge R², In Rainbows, coverage |
| `results/simbench.md` | Same-artist-removed, within-genre, artist retrieval, feel distance, hubness |
| `results/analyses.md` | What changes per stop, matching noise, descriptor fill |
| `results/holdout.md` | New-album test |
| `results/clip_length.md`, `results/tracks_per_album.md` | Clip-length and track-count checks |
| `results/bakeoff_eval.md` | Model bake-off |
| `results/seeds.md`, `results/seeds.json` | Old and new lists for 21 albums |
| `results/solution_transform.npz` | The fitted D64 transform |
| `cache/solution/recs.json` | Site-shaped recommendation lists from the proposal (not committed) |
