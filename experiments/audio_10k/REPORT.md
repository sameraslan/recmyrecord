# Audio 10k: why CLAP keeps Deezer and Apple albums apart, and what removes it

5 October 2026. **Finished, except that nobody has listened.** Branch `feat/audio-10k` (draft PR #31). Sections 3.1 to 3.3 are as written on 4 October. 3.4 (the fix on 250 catalog albums, 4 October) and 3.5 (the whole catalog on the final store, 5 October) were added after them.

The files call the Apple store `iTunes`. It is the same thing.

## 1. Verdict

- **The check that matters, on the final store (5 October): Deezer-sourced and Apple-sourced albums now mix at about the genre make-up rate, and YouTube-sourced albums are not left out of lists.** A Deezer seed's ten nearest albums are 24.9% Apple-sourced where the make-up of its genre would give 26.7% (n 6,473 seeds). An Apple seed's are 35.0% Apple-sourced against a make-up of 34.8% (n 2,893). Before the fix, new Deezer seeds got 2.3% and new Apple seeds 91.7% (n 2,869 and 2,730). YouTube-sourced albums (n 869) are in 9.7 lists on average and 2.2% are in none (Deezer 10.1 and 2.2%, Apple 9.8 and 1.9%).
- **What remains: YouTube seeds lean towards YouTube albums.** 31.2% of their neighbours are YouTube-sourced against a make-up of 20.9% (n 869). The YouTube albums are also a different population (albums no store carries), so these numbers cannot say how much of the lean is the audio.
- **What remains: a probe still reads the store.** On the full 512-number vectors a linear probe tells Apple-sourced from Deezer-sourced new albums with AUC 0.893 (n 2,675 / 2,815). It was 0.998. EffNet gives 0.670, and year, rank and genre alone 0.639. It does not show in the lists.
- **What was wrong.** CLAP's vectors carried the store a preview came from, and its lists split into a Deezer part and an Apple part. EffNet was not affected.
- **The cause is the encoding.** Deezer previews are 128 kbit/s stereo MP3 and Apple's are AAC at about 272 kbit/s. CLAP reads the difference in its top mel bands, 12 to 14 kHz. It is not the excerpt and not loudness (349 tracks fetched from both stores, 120 albums).
- **The fix adopted: a stereo MP3 round trip before CLAP, for every clip that is not from Deezer.** In the clip cache it is the model `clap_mp3`. The Apple clips, about 11,600, and the YouTube albums were fetched again for it, because audio is never stored. Deezer clips are unchanged.
- **Measured and not adopted: a linear map on the stored Apple vectors, fitted on the pairs.** It needs no downloads and closed about 85% of the gap, but about ten points remained on the Apple side, and it cannot be applied to YouTube audio.
- **What to ship.** The CLAP store is written from `clap_mp3`: 10,235 of the 10,467 albums (Deezer 6,473, Apple 2,893, YouTube 869). Whether CLAP replaces EffNet on the site is the owner's decision after listening. The build switch still says EffNet.
- **Main caveat.** Every number is a probe on stored vectors or an RYM-based proxy. Nobody listened to anything, and there is no held-out test split.

## 2. Data, split, metrics

**Data.**

- The one-pass clip cache of PR #31 (`data-pipeline/.cache/audio/onepass.sqlite`, local): per-clip CLAP and EffNet vectors, 4 clips per album. 9,577 catalog albums have a Deezer or Apple preview in both models: 6,621 Deezer, 2,956 Apple; 5,599 new, 3,978 existing.
- For the fix: 120 albums that both stores carry, drawn with seed 0 over (on the site / new) x decade x genre family from the 4,659 catalog albums with both links. 349 tracks were fetched from both stores (698 clips) and embedded under 16 preprocessing variants. 25 of these albums were also fetched as full-album YouTube audio (150 windows).
- 16 albums (63 tracks) that the cache once held from both stores, because of duplicate catalog rows. They are not among the 120.
- Genres and descriptors are the sheet's columns in `data-pipeline/catalog/albums.csv`.
- For 3.5: the final CLAP store (`data-pipeline/audio/clap/`, written from `clap_mp3` on 5 October, 10,235 albums) and the clip cache of the same day. The cache then has 9,367 albums on Deezer or Apple previews: 6,474 Deezer, 2,893 Apple; 5,490 new, 3,877 existing. That is fewer than the 9,577 of 4 October: albums with too few previews are now on YouTube audio (870 albums on full-length windows are left out, against 46).

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
- The YouTube-sourced albums are the ones no store has previews for (or too few). They are a different set of records from the store-sourced ones, not a random third of the catalog.
- One YouTube pick is another record: the search took "Rollins Band - A Clockwork Orange Stage" for A Clockwork Orange (`Album999417`). It and Barry Lyndon (`Album739618`, on an unrelated store listing) are left out of the CLAP store. Barry Lyndon's one Deezer clip is still among the 9,367 albums `source_effect.py` reads from the cache. The other YouTube picks were judged from titles, uploaders and lengths, not by ear.
- The 16 doubles are in the backup from before the rekey, which has no `clap_mp3` rows. The same-recording check of 3.1 could not be repeated on the final vectors.

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

### 3.4 The round trip on catalog albums, 4 October (`results/mp3_variant_check.md`)

250 Apple-sourced new albums (one from each of 250 equal slices of the 2,730 in rank order) and 19 YouTube albums, fetched again and embedded as `clap_mp3`. Pool: the 6,621 Deezer albums plus the 250, so the make-up is small.

| Vectors of the 250 albums | Apple neighbours, the 250 as seeds (make-up 5.7%) | Apple neighbours, Deezer seeds (n 6,621, make-up 3.68%) | Store probe AUC, matched on genre and decade (n 183 / 183) | Same, every new Deezer album (n 250 / 2,869) |
|---|---|---|---|---|
| CLAP as stored | 46.1% | 0.44% | 0.985 | 0.989 |
| Pair map of 3.3 | 7.8% | 2.78% | 0.557 | 0.689 |
| Round trip (`clap_mp3`) | 5.7% | 2.91% | 0.602 | 0.776 |
| EffNet | 6.0% | 3.01% | 0.491 | 0.652 |

Takeaway: the round trip brings the 250 albums to the make-up, as the pair map does, and the two agree (album vectors at cosine 0.973). It was adopted as the CLAP recipe for every source that is not Deezer, mainly because it can also be applied to YouTube audio. All 984 clips fetched again gave their stored `clap` vector exactly, so the stores still serve the same audio.

YouTube (19 albums, direction only): a YouTube album is in 5.7 lists on average with the round trip, 2.1 without. A probe separates YouTube windows from Deezer clips at 0.732, down from 0.930 (n 152 / 161).

### 3.5 The whole catalog on the final store, 5 October (`results/sonic_measures.clap_mp3.md`, `results/source_effect.clap_mp3.md`)

The CLAP store written from `clap_mp3`: 10,235 albums. `measure.py` reads that store, YouTube albums included. `source_effect.py --model clap_mp3` reads the clip cache and keeps the 9,367 albums on Deezer or Apple previews. Stored vectors only. The numbers before the fix are those of 3.1 (`results/source_effect.md`, 9,577 albums).

By audio source, over the whole store (`results/sonic_measures.clap_mp3.md`, "By audio source"). In brackets the make-up: the share of that source among the other albums with the seed's first genre.

| Seeds | n | Deezer neighbours | Apple neighbours | YouTube neighbours | Mean N10 | Never recommended |
|---|---|---|---|---|---|---|
| Deezer-sourced | 6,473 | 69.5% (66.3%) | 24.9% (26.7%) | 5.7% (7.0%) | 10.1 | 2.2% |
| Apple-sourced | 2,893 | 57.8% (57.5%) | 35.0% (34.8%) | 7.2% (7.7%) | 9.8 | 1.9% |
| YouTube-sourced | 869 | 44.1% (52.3%) | 24.7% (26.8%) | 31.2% (20.9%) | 9.7 | 2.2% |

Deezer and Apple albums only, before and after (`source_effect.py`):

| Measure | Before, `clap` | After, `clap_mp3` | EffNet, after |
|---|---|---|---|
| Apple neighbours, new Deezer seeds | 2.3% (make-up 29.1%, n 2,869) | 27.6% (make-up 29.0%, n 2,815) | 27.0% |
| Apple neighbours, new Apple seeds | 91.7% (make-up 37.7%, n 2,730) | 38.1% (make-up 37.8%, n 2,675) | 36.2% |
| Apple neighbours, existing Deezer seeds | 2.5% (make-up 29.0%, n 3,752) | 25.7% (make-up 28.8%, n 3,659) | 26.1% |
| Apple neighbours, existing Apple seeds | 93.0% (make-up 36.2%, n 226) | 34.1% (make-up 36.7%, n 218) | 32.5% |
| Store probe AUC, new albums | 0.998 (n 2,730 / 2,869) | 0.893 (n 2,675 / 2,815) | 0.670 |
| Same, matched on genre and decade | 0.998 (n 2,752) | 0.858 (n 2,678) | 0.552 |
| Store probe AUC, existing albums | 0.999 (n 226 / 3,752) | 0.783 (n 218 / 3,659) | 0.686 |
| New against existing, probe AUC | 0.797 (n 5,599 / 3,978) | 0.751 (n 5,490 / 3,877) | 0.647 |

RYM proxies of the lists, whole store (`measure.py`): `genre_primary` 0.197 for CLAP and 0.241 for EffNet (n 9,774 seeds with a genre), `desc_jaccard` 0.194 and 0.200, never recommended 2.1% and 0.8% (n 10,235). New seeds get 63.5% new neighbours (make-up 66.6%, n 6,198) and existing seeds 50.9% (make-up 56.7%, n 4,037). EffNet gives 63.4% and 51.6%. Before the fix CLAP gave 68.2% (make-up 64.4%, n 5,625) and 39.8% (make-up 55.3%, n 3,978).

Takeaway:

- Deezer and Apple albums mix at about the make-up in both tables, for new and existing seeds, and CLAP now sits where EffNet sits. The gap between new and existing albums went with it.
- YouTube albums are recommended as often as the others (mean N10 9.7). Before, the few on YouTube audio were in about 6 lists (3.3, n 80).
- YouTube seeds get about ten points more YouTube neighbours than the make-up, and about eight points fewer Deezer ones. The make-up only accounts for the first genre. The YouTube albums are the records no store carries, so part of this can be the music. 3.4 found YouTube windows still separable from Deezer clips after the round trip (0.732, 19 albums), so part can be the audio. These numbers do not split the two.
- The store probe is still at 0.893, above EffNet (0.670), above year, rank and genre alone (0.639) and above the pair map of 3.3 (0.804). On the 250 albums of 3.4 it read 0.776: with ten times the Apple albums to learn from it finds more. Something of the store, or of which albums each store has, is left in the vectors. It does not reach the lists: removing up to eight store directions from the vectors moves the Apple shares of new Deezer and new Apple seeds by less than half a point (section 6 of the result file).
- The same-recording check of 3.1 was not repeated. The 16 doubles have no `clap_mp3` vectors. The one album the cache now holds from both stores (`Album1039131`) is a corrected listing: the two listings are different recordings.

### Also in this folder

`results/sonic_measures.md` (`measure.py`, 4 October): RYM-based proxy measures of the CLAP block as first stored. It is where the gap between new and existing albums first showed. `listening_page.py` writes a local page of lists for the owner to listen through, now built on the `clap_mp3` store. Nobody has listened yet.

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
| Apple neighbours of Apple seeds, round trip | 250 picked albums in a pool with every Deezer album, no fitting | 250 seeds | 5.7% (make-up 5.7%; as stored 46.1%) |
| Apple neighbours for Deezer seeds, final store | whole store | 6,473 seeds | 24.9% (make-up 26.7%) |
| Apple neighbours for Apple seeds, final store | whole store | 2,893 seeds | 35.0% (make-up 34.8%) |
| YouTube neighbours for YouTube seeds, final store | whole store | 869 seeds | 31.2% (make-up 20.9%) |
| Mean N10 and never recommended, YouTube albums, final store | whole store | 869 albums | 9.7 and 2.2% (Deezer 10.1 and 2.2%, Apple 9.8 and 1.9%) |
| Apple neighbours for new Deezer seeds, `clap_mp3` | Deezer and Apple albums of the catalog | 2,815 seeds | 27.6% (make-up 29.0%; before 2.3%) |
| Apple neighbours for new Apple seeds, `clap_mp3` | Deezer and Apple albums of the catalog | 2,675 seeds | 38.1% (make-up 37.8%; before 91.7%) |
| Store probe AUC, new albums, `clap_mp3` | five folds by artist | 2,675 Apple / 2,815 Deezer | 0.893 (before 0.998; EffNet 0.670) |

## 5. Limitations and ideas not run

Limitations, most important first:

1. Nobody listened. The proxies cannot say whether the lists sound right, or whether CLAP's top bands were good for something.
2. Everything in 3.5 is a whole-catalog description on stored vectors. There is no held-out split and no interval.
3. A probe still reads the store at 0.893 (3.5). The numbers cannot say whether that is store signal left over or a real difference between the albums each store has.
4. YouTube seeds lean towards YouTube albums by about ten points. The population differs, and no same-track pair between YouTube and a store exists to tell audio from music.
5. The same-recording check was not repeated on the final vectors. The round trip is shown on the same recordings only for the 349 pairs of 3.2.
6. The YouTube picks were not heard. One wrong pick was found and left out; others may be wrong.
7. Deezer's encoder is not ours. The round trip uses ffmpeg's libmp3lame at its defaults, and Deezer may change its encoding.

Ideas not run, most useful first:

1. **A listening pass.** Needs the owner and the page of `listening_page.py`.
2. **A same-store control**: Deezer albums with an Apple link against Deezer albums without, matched on genre and decade. No downloads. Says whether the remaining 0.893 is the albums and not the store.
3. **Same-track pairs between YouTube and a store.** Needs albums that have both, fetched from both. Says whether the YouTube lean is the audio.
4. **The 16 doubles under `clap_mp3`.** Needs their Apple clips fetched again. Repeats the same-recording check of 3.1 on the final recipe.
5. **Another MP3 encoder or bitrate** on the round trip. Narrows the claim from Deezer's encoding to any low-bitrate stereo MP3.
6. **Which encoder decision causes it** (joint stereo, the bit reservoir, a cut that moves from frame to frame). Not needed for the fix.
7. **More pairs for the map of 3.3.** Only of use if the map is wanted after all.

## 6. Reproducing

In order, from `experiments/audio_10k/`. The build venv is `data-pipeline/.venv`, the audio venv `data-pipeline/.venv-audio`. CLAP needs the torch environment of `experiments/preview_features/requirements-torch.txt`.

```bash
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> measure.py           # results/sonic_measures.*
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> source_effect.py     # results/source_effect.*
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <torch python> store_effect_fix.py run --fetch-python <audio venv python> --albums 120 --youtube 25
PYTHONDONTWRITEBYTECODE=1 <build venv python> store_effect_fix.py report      # results/store_effect_fix.*
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> pair_map_check.py    # results/pair_map_check.*
PYTHONDONTWRITEBYTECODE=1 <build venv python> mp3_variant_check.py pick       # 3.4: which albums
#   the pipeline's `onepass run --models clap_mp3` and `fulllength --models ...` embed them (`data-pipeline/README.md`)
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> mp3_variant_check.py report   # results/mp3_variant_check.*

# 3.5, after the whole catalog has clap_mp3 vectors. From data-pipeline/:
nice -n 19 .venv/bin/python -m rmr_audio.modelstore write --model clap_mp3 --audio-dir audio/clap --exclude Album999417,Album739618
nice -n 19 .venv/bin/python -m rmr_pipeline.audio fit-catalog --audio-dir audio/clap
# then from experiments/audio_10k/:
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> measure.py --model clap_mp3 --clap-dir ../../data-pipeline/audio/clap   # results/sonic_measures.clap_mp3.*
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> source_effect.py --model clap_mp3   # results/source_effect.clap_mp3.*, about 6 minutes
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> listening_page.py    # results/listening.html
```

`store_effect_fix.py run` and the pipeline's embedding commands use the network and a model. They resume, and should run on mains power. The others read stored vectors.

`--exclude Album999417,Album739618` keeps A Clockwork Orange and Barry Lyndon out of the store: the only audio held for them is of other records. It has to be passed on every write.

`results/sonic_measures.*` and `results/source_effect.*` without `clap_mp3` in the name are the state of 4 October, before the fix. Do not run the first two commands again without `--out` elsewhere: the store and the cache have changed, so they would overwrite the baseline with other numbers.

**Caches, none committed, all on the laptop that ran the work.**

| Path | What | To rebuild |
|---|---|---|
| `data-pipeline/.cache/audio/onepass.sqlite` | Per-clip vectors (`effnet`, `clap`, `clap_mp3`) for the catalog. The only copy. 630 MB on 5 October | Stage 1 took about 11 hours of matching and 6 hours of embedding (`docs/audio-10k-stage1.md`). The `clap_mp3` pass over the Apple clips and the YouTube runs come on top; their time was not recorded here |
| `data-pipeline/.cache/audio/onepass.before-rekey.sqlite` | Backup from before the rekey. Holds the 16 doubles | Cannot be rebuilt as it was. The doubles would have to be fetched again |
| `experiments/audio_10k/cache/store_effect_fix.sqlite` | Embeddings and measurements of the 349 pairs and the YouTube windows, 76 MB. No audio | 698 clips and 25 albums fetched again. The run time was not recorded |
| `experiments/audio_10k/cache/source_effect_means.npz`, `source_effect_means.clap_mp3.npz` | Album means read from the clip cache, of 4 October (`clap`) and 5 October (`clap_mp3`) | Written by `source_effect.py`; `--refresh` reads the cache again |
| `experiments/audio_10k/cache/mp3_variant_*` | The picks, logs and sanity numbers of 3.4 | `mp3_variant_check.py pick` and `sanity` |
| `experiments/audio_10k/cache/rym10k_sheet.csv` | The sheet export the catalog was built from | Export the sheet's "Top 10K Chart" tab |

**File map.**

| File | What |
|---|---|
| `sonic.py`, `measure.py` | Blocks, nearest albums, and the proxy measures. With `--model clap_mp3 --clap-dir` the other half of 3.5 |
| `source_effect.py` | Experiment 3.1, and with `--model clap_mp3` half of 3.5 |
| `store_effect_fix.py`, `store_effect_fetch.py`, `store_effect_dsp.py`, `store_effect_report.py`, `store_effect_md.py` | Experiment 3.2: the run, the fetcher, the variants, the report |
| `pair_map_check.py` | Experiment 3.3 |
| `mp3_variant_check.py` | Experiment 3.4 |
| `listening_page.py` | The local listening page (`results/listening.html`, not committed) |
| `results/*.md`, `results/*.json` | Result tables and the numbers behind them. `*.clap_mp3.*` are the final store (5 October); the same names without it are before the fix (4 October) |

**Where this differs from `experiments/README.md`.** The folder is on `feat/audio-10k`, not on an `experiment/` branch, because it reads the catalog, the clip cache and pipeline modules that exist only on that branch. PR #31 also changes pipeline code, so it waits for the owner. This report and the result files can go to `main` in a documents-only PR, with a row in the `CLAUDE.md` index (that file is on `main`, not on this branch). Experiment 3.5 needed the store written first, which is a pipeline step. The stereo round trip itself now lives in the pipeline (`data-pipeline/rmr_audio/mp3trip.py`), and the experiment imports it from there.

**Reused from earlier experiments.** The CLAP recipe (`experiments/preview_features/clap_catalog.py`) and the genre families (`experiments/preview_features/genres.py`). The case for CLAP as the model is in `experiments/preview_features/REPORT-genre-crossing.md`, on the old catalog.
