# Audio for the 10k catalog: where it stands

5 October 2026. Branch `feat/audio-10k`, draft PR #31 (stacked on #26, which is stacked on #25). Tracking issue: #37. Nothing here is on the site.

**Note of 6 October 2026.** The owner gave the go-ahead and the site data on this branch was switched to the 10k catalog that day: `SITE_MODEL = "effnet10k"`, `frontcreck/public/data` rebuilt with 10,467 albums from `data-pipeline/audio/effnet10k/`. The lines below that say the site still runs on `data-pipeline/audio/` describe the state before it. What was done and what remains (frontend pins, site copy, merge and deploy by the owner) is in `docs/10k-switch.md`, section 0. Nothing is deployed.

## In short

- The catalog, the matcher and the embeddings for the RYM top 10,000 are built. 10,467 albums are keyed by RYM id.
- The CLAP store is written: 10,235 of the 10,467 albums (Deezer 6,473, Apple 2,893, YouTube 869). The other 232: 228 have no audio, 2 are left out on purpose and 2 have EffNet clips but no usable CLAP clip. 302 albums are `none_available` (the link and the search gave nothing): those 228 and 74 that stay on too few preview clips.
- CLAP heard the store a preview came from (Deezer's 128 kbit/s MP3 or Apple's AAC), so its lists almost never crossed stores. The fix is in: every clip that is not from Deezer goes through a stereo MP3 round trip before CLAP. In the cache this is the model `clap_mp3`, and the store is written from it.
- On the final store, Deezer-sourced and Apple-sourced albums mix at about the genre make-up rate, and YouTube-sourced albums are in lists as often as the others. YouTube seeds still lean towards YouTube albums (31.2% against a make-up of 20.9%, n 869).
- **The owner listened on 5 October and chose EffNet over CLAP.** EffNet's lists sounded closer. An example of a CLAP miss: for My Bloody Valentine's Loveless its second album is Scorpions' World Wide Live, a hard rock record. The proxies agree (table below).
- The 10k EffNet store is written: `data-pipeline/audio/effnet10k/`, 10,237 of the 10,467 albums (Deezer 6,475, Apple 2,893, YouTube 869), four clips per album. The CLAP store stays on the branch.
- Every quality number is an RYM-based proxy on stored vectors. The listening is the owner's judgement of one page of lists, not a measurement.
- The site still runs on `data-pipeline/audio/`, the EffNet store of its 3,980 albums. `SITE_MODEL`, the site data rebuild, the copy and the deploy wait for the owner's go-ahead.

**Added later on 5 October.** The owner found YouTube links by hand for five top-1,000 albums with no audio (Rock Dream, Yanqui U.X.O., Ocarina of Time, Endless, Genesis Archive 1967-75). They are in `data-pipeline/audio/fulllength_links.csv`, four of them playlists of per-track videos, and were embedded with `rmr_audio.fulllength --links-only`. Both stores were written again: EffNet 10,242 albums, CLAP 10,240 (YouTube 874). 223 albums have no audio. Counts elsewhere in this document are from before these five; `results/sonic_measures.clap_mp3.md` and `data-pipeline/audio/album_status.md` are current.

## Goal

Grow the site from 4,081 albums to the RYM top 10,000 with a sonic block built from preview clips. The similarity model was to be CLAP; since the listening of 5 October it is EffNet. Plan: the "Audio Pipeline Revamp Plan" document, steps 3 to 6.

## Decisions (owner)

| Question | Decision |
|---|---|
| Album key | The RYM id |
| Off-chart albums already on the site | Kept |
| Descriptors | Uniform top 8 |
| Similarity model | EffNet (5 Oct, after listening). CLAP was the choice until then |
| Clips per album | 4 is the standard. No top-up to 8 |
| Albums with no previews | Free full-length sources are allowed. YouTube through yt-dlp is approved |
| Track-count harvest sessions | Not needed. The sheet's store links are trusted |
| YouTube search for no-audio albums whose sheet link is missing or dead (4 Oct) | Approved. Built and run over the catalog on 5 Oct (`rmr_audio.fulllength --search`) |
| YouTube full-length audio for albums with too few previews or one very long track, for example Long Season (4 Oct) | Approved. Built and run over the catalog on 5 Oct (`--edge-cases --search`) |

Still with the owner: the 12 yes/no questions in `docs/audio-10k-pair-questions.md`. Each default is already applied, so only a wrong default needs an answer.

## Done on PR #31

- **Catalog.** 10,467 albums keyed by RYM id: 4,081 existing and 6,386 new. `data-pipeline/catalog/albums.csv`, with `data-pipeline/audio/keys.csv` mapping the old Spotify URIs.
- **Store rekeyed.** The existing albums' numbers are unchanged, checked against a reference recorded before the change.
- **Same-album pairs.** 43 off-chart albums were paired with their chart row by hand. `catalog/doubtful_pairs.csv` is empty.
- **Matcher.** Uses the sheet's Deezer and Apple ids directly, with an edition rule, flags and a dry run. All new albums are matched: about 5,640 have previews and about 780 have none (stage 1 counted 5,642 and 787 of 6,429, before the 43 pairs were merged).
- **One-pass embedder.** One download per clip, embedded by both models. 4 clips are embedded for every matched new album. The `clap_mp3` vectors of the Apple clips came from a second download of each clip.
- **Full-length audio from YouTube.** All runs are finished. The sheet's links: 620 albums embedded, 61 unavailable, 23 single tracks, 14 mismatches. The search, for albums with no usable link and for the edge cases: 250 found, 302 none, 2 failed. The 2 failures are HTTP 403 on every retry: Nektar "Remember the Future" (`Album19113`) and Skepticism "Aes" (`sp:2rf4I3JAnmvTqtkZVKcxkv`). Both stay on their preview clips.
- **The search picks.** 249 of the 250 picks matched on title and artist. The other one matched on title alone and is wrong, see the next point. Picks are judged from titles, uploaders and lengths. Nobody has listened.
- **Two albums left out of the CLAP store and the 10k EffNet store.** A Clockwork Orange (`Album999417`) and Barry Lyndon (`Album739618`) sit on unrelated store listings. For Barry Lyndon the search found nothing (the best candidate scored 48, under the 65 needed). For A Clockwork Orange the search took another record, "Rollins Band - A Clockwork Orange Stage (2000) [Full Album]" (score 65.5): a Various Artists album skips the artist check. Both are kept out with `--exclude Album999417,Album739618`, which has to be passed on every store write. The 8 wrong windows of A Clockwork Orange are still in the local cache, and its row in `fulllength.csv` still says `embedded`.
- **Two albums with EffNet clips and no CLAP clip.** Okkervil River "Black Sheep Boy" (`Album229104`) and Slum Village "Fantastic, Vol. 2" (`Album30723`): Deezer had no preview for their clips when CLAP was embedded (the cache says `no_preview` for all four); the EffNet clips are from the earlier run. `album_status` marks both `embed`. They are not in the CLAP store.
- **CLAP store.** `data-pipeline/audio/clap/`, beside the EffNet store, written from `clap_mp3` on 5 October with the transform refitted: 10,235 albums. The build switch (`SITE_MODEL` in `rmr_pipeline/audio_store.py`) still says EffNet.
- **Match overrides.** 14 added, 7 of them for existing albums that were found on the wrong listing. Those 7 are embedded from their right listings. The CLAP store and `album_status` take the listing that `match_overrides.json` forces. `matches.csv` is unchanged, because it records what the EffNet store was embedded from. The EffNet store still has the old listings for those 7 until a `sync`.
- **Measurements and listening page.** `measure.py` and `source_effect.py` were run on the final store (5 October). The listening page is built on it (`experiments/audio_10k/results/listening.html`, local, not committed).
- **10k EffNet store.** `data-pipeline/audio/effnet10k/`, written on 5 October from the clip cache's `effnet` rows by the command that writes the CLAP store, with a transform fitted on its 10,237 albums. Clips behind the mean: 9,269 albums have four preview clips, 99 have fewer, 869 are on YouTube windows (4 to 8). The 230 albums not in it: 228 have no audio and 2 are left out on purpose. The 7 corrected albums are on their right listings in it. `data-pipeline/audio/` is not changed.

Details and tables: `docs/audio-10k-stage1.md`. Its counts are from the morning of 4 October, before the pairing (10,510 albums).

## The problem that was found: CLAP hears the store

- As first stored, a Deezer seed's ten CLAP neighbours were 2.3% Apple-sourced albums, where the make-up of its genre would give about 29% (n 2,869 new Deezer seeds). EffNet gave 27.1% for the same seeds.
- The existing albums are almost all from Deezer and about half of the new ones are from Apple, so this also kept new and existing albums apart.
- On 349 tracks fetched from both stores (120 albums), the cause is how a 128 kbit/s stereo MP3 codes the 12 to 14 kHz band. It is not the excerpt and not loudness.
- YouTube audio was mildly separable too (25 albums).

The fix adopted (4 October): a stereo MP3 round trip, 128 kbit/s, on every clip that is not from Deezer, before CLAP (`rmr_audio/mp3trip.py`, cache model `clap_mp3`). About 11,600 Apple clips and the YouTube albums were fetched once more for it. A linear map on the stored vectors was also measured and not adopted: it left about ten points on the Apple side and cannot be applied to YouTube audio.

The final store, whole catalog (5 October, `experiments/audio_10k/results/sonic_measures.clap_mp3.md`). All proxies:

| Seeds | n | Apple neighbours | Make-up | Mean N10 | Never recommended |
|---|---|---|---|---|---|
| Deezer-sourced | 6,473 | 24.9% | 26.7% | 10.1 | 2.2% |
| Apple-sourced | 2,893 | 35.0% | 34.8% | 9.8 | 1.9% |
| YouTube-sourced | 869 | 24.7% | 26.8% | 9.7 | 2.2% |

N10 is how many lists an album is in (10 on average). YouTube seeds get 31.2% YouTube neighbours against a make-up of 20.9%, so a lean towards their own source remains. The YouTube albums are also a different population (albums no store carries), so the numbers cannot say how much of that is the audio.

The record of the investigation is `experiments/audio_10k/REPORT.md`. The result files are listed there.

## The listening, and EffNet against CLAP (5 October)

The owner listened through `experiments/audio_10k/results/listening.html` (38 seeds, the two models' ten nearest side by side) and chose EffNet: its lists sounded closer to the seed. The EffNet lists he heard were made from four-clip means of the clip cache. The lists of the store written since are the same for all 38 seeds, and over the catalog share 9.99 of 10 albums with them.

The proxies, on the same 10,235 albums (`experiments/audio_10k/results/sonic_measures.clap_mp3.md`). RYM-based, on stored vectors:

| Block | `genre_primary` | `genre_any` | `genre_family` | `desc_jaccard` | Never recommended | Max N10 |
|---|---|---|---|---|---|---|
| EffNet (`audio/effnet10k`) | 0.241 | 0.429 | 0.643 | 0.200 | 0.8% | 48 |
| CLAP (`audio/clap`) | 0.197 | 0.362 | 0.601 | 0.194 | 2.1% | 62 |

The two models' lists share 2.1 albums of 10 on average. EffNet's lists by audio source, every album of its store:

| Seeds | n | Apple neighbours | Make-up | YouTube neighbours | Make-up | Mean N10 | Never recommended |
|---|---|---|---|---|---|---|---|
| Deezer-sourced | 6,475 | 24.3% | 26.7% | 7.7% | 7.0% | 10.1 | 0.7% |
| Apple-sourced | 2,893 | 33.0% | 34.8% | 8.2% | 7.7% | 9.5 | 1.1% |
| YouTube-sourced | 869 | 24.4% | 26.8% | 24.4% | 20.9% | 10.9 | 1.0% |

## Left to do

1. Only with the owner's go-ahead: point the build at `audio/effnet10k` (`SITE_MODEL = "effnet10k"`), record `tests/fixtures/audio_reference.npz` again, rebuild the site data (descriptors for the new albums, covers, thumbnails, listen links for albums without Spotify: issue #39), update the copy, deploy. Every existing album's block changes with the switch: four clips, not up to eight, and a transform fitted on the whole catalog.
2. Decide what happens to `data-pipeline/audio/` (3,980 albums, eight clips) once the build reads the new store, and to the CLAP store.

Open, small:

- The 8 wrong windows of A Clockwork Orange in the local cache, and its `fulllength.csv` row. Deleting them waits for the owner's OK. Until then `--exclude` keeps the album out of the store.
- Nektar "Remember the Future" and Skepticism "Aes": the YouTube download can be tried again later.
- Okkervil River "Black Sheep Boy" and Slum Village "Fantastic, Vol. 2" have no CLAP vector. Both are in the 10k EffNet store.
- 228 albums have no audio at all.
- `data-pipeline/audio/` still has the old listings for the 7 corrected albums. The 10k EffNet store has the right ones, so a `sync` is only needed if `audio/` stays in use.
- The experiment's row in the `CLAUDE.md` index, through a documents-only PR to `main`.

## How audio is handled

Audio is never stored. A preview clip is downloaded into memory, decoded, embedded and dropped. Full-length audio from YouTube goes to a temporary folder, its 30-second windows are embedded, and the file is deleted whatever happens. Only embeddings are kept, in a local cache that is gitignored. Nothing fetches rateyourmusic.com.

## Where each album's status is tracked

`data-pipeline/audio/album_status.csv`: one row for each of the 10,467 albums, in catalog order. It says which store listing the album is matched to, how many clips each model has and where they came from (Deezer, Apple, YouTube), whether it is an edge case (under-covered, few long tracks, short previews, wrong listing pending, a listing shared with another album), what happened to its YouTube link, and two derived columns:

- `state`: `done` (4 or more clips, or full-length windows, for both models), `partial`, `no_audio`.
- `next_step`: `none`, `embed`, `reembed` (wrong listing pending), `youtube_link` (no audio, the sheet's link not tried yet), `youtube_search` (no audio, no usable link, not searched yet), `youtube_full_length` (an edge case on preview audio, not tried yet), `none_available` (the link and the search gave nothing).

The counts are in `data-pipeline/audio/album_status.md`. Both files are written by `python -m rmr_audio.album_status` from the catalog, `matches.csv`, `match_overrides.json`, `fulllength.csv` and the local clip cache, which is the only source for "has embeddings". They are a snapshot: run the command again after any audio job. The rules are one function, `decide`, in `data-pipeline/rmr_audio/album_status.py`.

## Where things are

Committed on the branch:

| Path | What |
|---|---|
| `docs/audio-10k-stage1.md` | Stage 1 report: matching, clips, albums with no audio, duplicate listings |
| `docs/audio-10k-pair-questions.md` | The 12 questions for the owner, with the defaults applied |
| `experiments/audio_10k/REPORT.md` | The store-effect investigation |
| `experiments/audio_10k/results/sonic_measures.clap_mp3.md`, `source_effect.clap_mp3.md` | Proxy measures of the final CLAP store over the catalog (5 October). The files without `clap_mp3` in the name are the same measures before the fix |
| `data-pipeline/README.md` | The stores, the matcher, catalog and keys, commands |
| `data-pipeline/catalog/albums.csv` | The catalog |
| `data-pipeline/audio/keys.csv`, `matches.csv`, `match_overrides.json` | Keys, one match row per album, hand corrections |
| `data-pipeline/audio/fulllength.csv` | Outcome of each full-length fetch |
| `data-pipeline/audio/album_status.csv`, `album_status.md` | One row per album with its state and next step, and the counts |
| `data-pipeline/audio/clap/` | The CLAP store, written from `clap_mp3`: 10,235 albums |
| `data-pipeline/audio/effnet10k/` | The 10k EffNet store, four clips per album: 10,237 albums. The owner's choice |

Local only, gitignored, on the laptop that ran the work:

| Path | What |
|---|---|
| `data-pipeline/.cache/audio/onepass.sqlite` | The clip cache: per-clip embeddings (`effnet`, `clap`, `clap_mp3`). The only copy. 630 MB on 5 October |
| `data-pipeline/.cache/audio/onepass.before-rekey.sqlite` | Its backup from before the rekey. Other backups beside it: `onepass.before-clap_mp3.sqlite`, `onepass.before-search-trial.sqlite` |
| `data-pipeline/.cache/audio/http.sqlite`, `data-pipeline/.cache/*.log` | Cached store API answers and run logs |
| `experiments/audio_10k/cache/` | The sheet export (`rym10k_sheet.csv`) and the store-effect caches (embeddings and measurements, no audio) |
| `experiments/audio_10k/results/listening.html` | The listening page for the owner |
| `data-pipeline/.venv`, `.venv-audio`, `.venv-fetch`, and the torch environment | Build, audio (Essentia), yt-dlp and CLAP environments |

If the caches are lost, nothing committed is lost, but the clips have to be fetched again. Stage 1 took about 11 hours of matching and 6 hours of embedding.

## Commands

All from `data-pipeline/`. Each module's docstring has the full options. Heavy jobs run one at a time at low priority.

```bash
.venv-audio/bin/python -m rmr_catalog --check                               # is the catalog current
nice -n 19 .venv-audio/bin/python -m rmr_audio match-new                    # match albums with no row in matches.csv
nice -n 19 .venv-audio/bin/python -m rmr_audio.onepass run --clips 4        # embed, both models, one download per clip
.venv-audio/bin/python -m rmr_audio.onepass status --clips 4
nice -n 19 .venv-audio/bin/python -m rmr_audio.fulllength                   # YouTube for albums with no previews; resumes
nice -n 19 .venv/bin/python -m rmr_audio.modelstore write --model clap_mp3 --audio-dir audio/clap --exclude Album999417,Album739618   # the CLAP store from the cache
nice -n 19 .venv/bin/python -m rmr_pipeline.audio fit-catalog --audio-dir audio/clap
nice -n 19 .venv/bin/python -m rmr_audio.modelstore write --model effnet --audio-dir audio/effnet10k --clips 4 --exclude Album999417,Album739618   # the 10k EffNet store from the cache
nice -n 19 .venv/bin/python -m rmr_pipeline.audio fit-catalog --audio-dir audio/effnet10k
.venv/bin/python scripts/stage1_report.py                                   # the stage 1 numbers
.venv/bin/python -m rmr_audio.album_status                                  # audio/album_status.csv and .md: every album's state
.venv-audio/bin/python -m pytest tests_audio && .venv/bin/python -m pytest  # tests, no network
```

Measurements and the listening page are in `experiments/audio_10k/` (`measure.py`, `source_effect.py`, `listening_page.py`); the commands are in section 6 of its `REPORT.md`.

## Issues

#37 (the whole effort), #38 (decisions), #41 (albums with no previews), #42 (ambiguous matches), #44 (catalog data errors), #39 (what the site still needs for new albums), #35 (licence terms).
