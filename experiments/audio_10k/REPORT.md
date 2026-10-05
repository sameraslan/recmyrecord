# Audio 10k: why CLAP keeps Deezer and Apple albums apart, and what removes it

4 October 2026. **In progress.** Branch `feat/audio-10k` (draft PR #31). The first three experiments below are finished. The fourth, the fix on catalog albums, is running and has no result yet.

The files call the Apple store `iTunes`. It is the same thing.

## 1. Verdict

- **CLAP's vectors carry the store a preview came from.** Over the 10k catalog its lists split into a Deezer part and an Apple part. A new Deezer seed's ten nearest albums are 2.3% Apple-sourced where the make-up of its genre would give 29.1% (n 2,869 seeds). EffNet gives 27.1% for the same seeds and is not affected.
- **The cause is the encoding.** Deezer previews are 128 kbit/s stereo MP3 and Apple's are AAC at about 272 kbit/s. CLAP reads the difference in its top mel bands, 12 to 14 kHz. It is not the excerpt and not loudness (349 tracks fetched from both stores, 120 albums).
- **Fix A, on the audio: a stereo MP3 round trip of the Apple clips before CLAP.** On the 349 paired tracks the share of a clip's neighbours from the other store goes from 13.3% to 49.1% (50% is even). Only the Apple clips change, about 11,600 of them, and they have to be downloaded again because audio is never stored.
- **Fix B, on the vectors: a linear map fitted on the pairs.** No downloads. On the catalog it closes about 85% of the gap: Deezer seeds 2.3% to 25.6% (make-up 29.1%), Apple seeds 91.7% to 47.3% (make-up 37.7%). About ten points remain on the Apple side, and the 80 albums on YouTube audio drop out of lists.
- **YouTube audio is a third, milder accent** (25 albums).
- **What to ship: not decided.** Fix A is in the pipeline as the `clap_mp3` variant and is being validated on 250 catalog albums. Until a fix is applied and the vectors are embedded again, CLAP is not ready to replace EffNet on the site.
- **Main caveat.** Every number is a probe on vectors or an RYM-based proxy. Nobody listened to anything, and there is no held-out test split.

## 2. Data, split, metrics

**Data.**

- The one-pass clip cache of PR #31 (`data-pipeline/.cache/audio/onepass.sqlite`, local): per-clip CLAP and EffNet vectors, 4 clips per album. 9,577 catalog albums have a Deezer or Apple preview in both models: 6,621 Deezer, 2,956 Apple; 5,599 new, 3,978 existing.
- For the fix: 120 albums that both stores carry, drawn with seed 0 over (on the site / new) x decade x genre family from the 4,659 catalog albums with both links. 349 tracks were fetched from both stores (698 clips) and embedded under 16 preprocessing variants. 25 of these albums were also fetched as full-album YouTube audio (150 windows).
- 16 albums (63 tracks) that the cache once held from both stores, because of duplicate catalog rows. They are not among the 120.
- Genres and descriptors are the sheet's columns in `data-pipeline/catalog/albums.csv`.

**Split.** There is no held-out test split. The catalog numbers are whole-catalog descriptions. Probes and maps use five folds, grouped by artist on the catalog and by album on the pairs. The headline map of experiment 3.3 (`residual, lambda 1`) was fixed before the catalog was looked at. The test splits of the earlier experiments are spent and were not used.

**Metrics.**

- Share of a seed's ten nearest albums that come from the other store, against the make-up: the share of that store among the other albums with the seed's first genre.
- Store probe: AUC of a logistic regression that tells Apple-sourced from Deezer-sourced vectors. About 0.65 is what year, rank and genre alone give.
- Same-track cosine: the same track fetched from both stores.
- RYM-based proxies for what the lists keep: `genre_primary`, `desc_jaccard`, and N10 (how many lists an album is in).

**Data problems found.**

- A new album's store is not random: Deezer's link is used first, Apple's when there is none. So the Apple-sourced albums are mostly the ones Deezer does not list.
- The pairs can only come from albums both stores carry, which is a different population from the Apple-only albums the fix is for.
- Paired tracks are matched on title and duration, not by ear. The waveform correlation supports the same master for the pairs it aligned (297 of 349).

## 3. Experiments

### 3.1 Is it the music, the store or the clips? (`results/source_effect.md`)

Probes over the clip cache. No audio opened, no model run.

| Measure | n | CLAP | EffNet |
|---|---|---|---|
| Store probe AUC, new albums | 2,730 Apple / 2,869 Deezer | 0.998 | 0.678 |
| Same, matched on genre and decade | 2,752 | 0.998 | 0.559 |
| Apple neighbours, new Deezer seeds (make-up 29.1%) | 2,869 | 2.3% | 27.1% |
| Apple neighbours, new Apple seeds (make-up 37.7%) | 2,730 | 91.7% | 36.1% |
| Same track from both stores, cosine | 63 tracks, 16 albums | 0.773 | 0.956 |

Takeaway: the store, strongly. The 226 existing albums that are Apple-sourced behave like new albums, so it follows the store and not whether an album is new. The clips are chosen the same way in every group. Removing one or a few store directions from the vectors does not repair the lists (section 6 of the result file).

### 3.2 What in the audio it is, and what removes it (`results/store_effect_fix.md`)

349 paired tracks, 120 albums, 16 variants. Each variant is applied before the CLAP recipe.

| Variant | Same-track cosine | Store probe AUC | Neighbours from the other store |
|---|---|---|---|
| As it is | 0.769 | 0.989 | 13.3% |
| Loudness matched | 0.766 | 0.989 | 13.1% |
| Low-pass 14 kHz, both stores | 0.769 | 0.989 | 13.4% |
| Low-pass 12 kHz, both stores | 0.926 | 0.963 | 38.8% |
| Via 16 kHz, both stores | 0.948 | 0.892 | 46.7% |
| MP3 round trip, mono, both stores | 0.819 | 0.982 | 18.9% |
| Stereo MP3 round trip, Apple clips only | 0.950 | 0.685 | 49.1% |
| Ridge map on the stored Apple vectors, held-out pairs | 0.924 | 0.454 | 50.1% |
| EffNet, as it is | 0.961 | 0.560 | 50.0% |

Takeaway: the stereo MP3 round trip on Apple clips removes the effect on pairs and leaves Deezer clips as they are. A low-pass also works but has to be applied to every clip of both stores and leaves more of the store in. Cut to the stretch both previews share (220 pairs), the effect stays, so it is not the excerpt. On the proxies the cost in music information is small for all three (section 5 of the result file).

YouTube (25 albums, 150 windows): a probe separates YouTube windows from Deezer clips of the same albums at 0.904 and from Apple clips at 0.867. Milder than Deezer against Apple on the same albums (0.996). The stereo round trip was not run on YouTube audio here.

### 3.3 The pair-fitted map on the catalog (`results/pair_map_check.md`)

The ridge map of 3.2, fitted on all 349 pairs, applied to the 11,636 stored Apple clip vectors (2,956 of 9,577 albums). Stored vectors only.

| | Before | After | Make-up | EffNet |
|---|---|---|---|---|
| Apple neighbours, new Deezer seeds (n 2,869) | 2.3% | 25.6% | 29.1% | 27.1% |
| Apple neighbours, new Apple seeds (n 2,730) | 91.7% | 47.3% | 37.7% | 36.1% |
| Store probe AUC, new albums | 0.998 | 0.804 | | 0.678 |
| `genre_primary` (n 9,137) | 0.182 | 0.194 | | |
| Mean N10, Deezer / Apple albums | 10.1 / 9.7 | 10.0 / 10.1 | | |
| Mean N10, YouTube albums (n 80) | 6.2 | 3.0 | | |

Takeaway: most of the way for both directions at no cost seen on the proxies. It transfers to the 16 doubles it never saw (same-track cosine 0.773 to 0.932). Fitted on half the pairs it mixes a little less, so more pairs would probably help. The YouTube albums are not mapped and are left behind.

### 3.4 The round trip on catalog albums (running)

`mp3_variant_check.py`: 250 Apple-sourced new albums and 20 YouTube albums, fetched again and embedded as `clap_mp3`, compared with the baseline and with the map of 3.3. No result yet. It will be added to this report as a dated addendum, with its tables in `results/mp3_variant_check.md`.

### Also in this folder

`results/sonic_measures.md` (`measure.py`): RYM-based proxy measures of the CLAP block over the whole catalog, provisional. It is where the gap between new and existing albums first showed. `listening_page.py` writes a local page of lists for the owner to listen through. Nobody has listened yet.

## 4. Final results

There is no held-out test score. The numbers to carry forward, each a proxy:

| Result | Split | n | Value |
|---|---|---|---|
| Apple neighbours for new Deezer seeds, CLAP as stored | whole catalog | 2,869 seeds | 2.3% (make-up 29.1%) |
| Same, with the pair map | whole catalog, map fixed beforehand | 2,869 seeds | 25.6% |
| Apple neighbours for new Apple seeds, with the pair map | whole catalog, map fixed beforehand | 2,730 seeds | 47.3% (make-up 37.7%) |
| Other-store neighbours, stereo MP3 round trip on Apple clips | paired tracks, no fitting | 349 pairs, 120 albums | 49.1% (even: 50%) |
| Other-store neighbours, pair map | held-out pairs, five folds by album | 349 pairs, 120 albums | 50.1% |
| Same-track cosine on the catalog's doubles, pair map | albums outside the fit | 63 tracks, 16 albums | 0.773 to 0.932 |
| Round trip on catalog albums | | 250 albums | pending |

## 5. Limitations and ideas not run

Limitations, most important first:

1. Nobody listened. The proxies cannot say whether the corrected lists sound right, or whether CLAP's top bands were good for something.
2. The round trip is shown on pairs, not yet on the catalog's Apple-only albums.
3. The pair map leaves about ten points on the Apple side, and a store probe of 0.80 against a floor near 0.65. The numbers cannot say whether that is store signal left over or a real difference between the two populations.
4. Deezer's encoder is not ours. The round trip uses ffmpeg's libmp3lame at its defaults, and Deezer may change its encoding.
5. YouTube: 25 albums in the pairs and 80 in the catalog. Read the direction only.
6. No confidence intervals beyond fold spread, except where a result file states one.

Ideas not run, most useful first:

1. **A listening pass** on lists for Apple seeds: as stored, with the map, with the round trip. Needs the owner and `listening_page.py`.
2. **The round trip on YouTube audio.** The pipeline can compute it (`--models clap_mp3` in `rmr_audio.fulllength`). Needs the YouTube albums fetched once more.
3. **More pairs for the map** (about 1,000). Needs about 650 more tracks fetched from both stores. The halves in 3.3 predict the remainder shrinks.
4. **A same-store control**: Deezer albums with an Apple link against Deezer albums without, matched on genre and decade. No downloads. Says whether the remaining 0.80 is the albums and not the store.
5. **A pair map for YouTube.** Needs same-track pairs between YouTube and a store. The 150 windows held are other stretches of the albums.
6. **Another MP3 encoder or bitrate** on the Apple side. Narrows the claim from Deezer's encoding to any low-bitrate stereo MP3.
7. **Which encoder decision causes it** (joint stereo, the bit reservoir, a cut that moves from frame to frame). Not needed for the fix.

## 6. Reproducing

In order, from `experiments/audio_10k/`. The build venv is `data-pipeline/.venv`, the audio venv `data-pipeline/.venv-audio`. CLAP needs the torch environment of `experiments/preview_features/requirements-torch.txt`.

```bash
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> measure.py           # results/sonic_measures.*
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> source_effect.py     # results/source_effect.*
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <torch python> store_effect_fix.py run --fetch-python <audio venv python> --albums 120 --youtube 25
PYTHONDONTWRITEBYTECODE=1 <build venv python> store_effect_fix.py report      # results/store_effect_fix.*
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> pair_map_check.py    # results/pair_map_check.*
```

Only `store_effect_fix.py run` uses the network and a model. It resumes, and should run on mains power. The others read stored vectors.

**Caches, none committed, all on the laptop that ran the work.**

| Path | What | To rebuild |
|---|---|---|
| `data-pipeline/.cache/audio/onepass.sqlite` | Per-clip vectors of both models for the catalog, 384 MB after stage 1 | About 11 hours of matching and 6 hours of embedding (`docs/audio-10k-stage1.md`) |
| `data-pipeline/.cache/audio/onepass.before-rekey.sqlite` | Backup from before the rekey. Holds the 16 doubles | Cannot be rebuilt as it was. The doubles would have to be fetched again |
| `experiments/audio_10k/cache/store_effect_fix.sqlite` | Embeddings and measurements of the 349 pairs and the YouTube windows, 76 MB. No audio | 698 clips and 25 albums fetched again. The run time was not recorded |
| `experiments/audio_10k/cache/source_effect_means.npz` | Album means read from the clip cache | Written by `source_effect.py` |
| `experiments/audio_10k/cache/rym10k_sheet.csv` | The sheet export the catalog was built from | Export the sheet's "Top 10K Chart" tab |

**File map.**

| File | What |
|---|---|
| `sonic.py`, `measure.py` | Blocks, nearest albums, and the proxy measures |
| `source_effect.py` | Experiment 3.1 |
| `store_effect_fix.py`, `store_effect_fetch.py`, `store_effect_dsp.py`, `store_effect_report.py`, `store_effect_md.py` | Experiment 3.2: the run, the fetcher, the variants, the report |
| `pair_map_check.py` | Experiment 3.3 |
| `listening_page.py` | The local listening page (`results/listening.html`, not committed) |
| `results/*.md`, `results/*.json` | Result tables and the numbers behind them |

**Where this differs from `experiments/README.md`.** The folder is on `feat/audio-10k`, not on an `experiment/` branch, because it reads the catalog, the clip cache and pipeline modules that exist only on that branch. PR #31 also changes pipeline code, so it waits for the owner. This report and the result files can go to `main` in a documents-only PR, with a row in the `CLAUDE.md` index (that file is on `main`, not on this branch). The stereo round trip itself now lives in the pipeline (`data-pipeline/rmr_audio/mp3trip.py`), and the experiment imports it from there.

**Reused from earlier experiments.** The CLAP recipe (`experiments/preview_features/clap_catalog.py`) and the genre families (`experiments/preview_features/genres.py`). The case for CLAP as the model is in `experiments/preview_features/REPORT-genre-crossing.md`, on the old catalog.
