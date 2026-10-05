# Audio for the 10k catalog: where it stands

4 October 2026, evening. Branch `feat/audio-10k`, draft PR #31 (stacked on #26, which is stacked on #25). Tracking issue: #37. Nothing here is on the site.

## In short

- The catalog, the matcher and the embeddings for the RYM top 10,000 are built. 10,467 albums are keyed by RYM id, and every matched new album has 4 clips embedded by both models (CLAP and EffNet).
- CLAP is not ready to replace EffNet on the site. CLAP's vectors carry the store a preview came from (Deezer's 128 kbit/s MP3 or Apple's AAC), so its lists almost never cross stores. EffNet is not affected.
- A fix is being validated: give Apple clips Deezer's encoding (an MP3 round trip) before CLAP hears them. It needs about 11,600 Apple clips downloaded again.
- Every quality number so far is an RYM-based proxy or store metadata. Nobody has listened.
- The site data rebuild, the copy and the deploy wait for the owner's sign-off.

## Goal

Grow the site from 4,081 albums to the RYM top 10,000 with a sonic block built from preview clips, with CLAP as the similarity model. Plan: the "Audio Pipeline Revamp Plan" document, steps 3 to 6.

## Decisions (owner)

| Question | Decision |
|---|---|
| Album key | The RYM id |
| Off-chart albums already on the site | Kept |
| Descriptors | Uniform top 8 |
| Similarity model | CLAP |
| Clips per album | 4 is the standard. No top-up to 8 |
| Albums with no previews | Free full-length sources are allowed. YouTube through yt-dlp is approved |
| Track-count harvest sessions | Not needed. The sheet's store links are trusted |
| YouTube search for no-audio albums whose sheet link is missing or dead (4 Oct) | Approved. Built on 5 Oct (`rmr_audio.fulllength --search`), tried on 30 albums; the full run is not started |
| YouTube full-length audio for albums with too few previews or one very long track, for example Long Season (4 Oct) | Approved. Built on 5 Oct (`--edge-cases`), tried on 20 albums including Long Season; the full run is not started |

Still with the owner: the 12 yes/no questions in `docs/audio-10k-pair-questions.md`. Each default is already applied, so only a wrong default needs an answer.

## Done on PR #31

- **Catalog.** 10,467 albums keyed by RYM id: 4,081 existing and 6,386 new. `data-pipeline/catalog/albums.csv`, with `data-pipeline/audio/keys.csv` mapping the old Spotify URIs.
- **Store rekeyed.** The existing albums' numbers are unchanged, checked against a reference recorded before the change.
- **Same-album pairs.** 43 off-chart albums were paired with their chart row by hand. `catalog/doubtful_pairs.csv` is empty.
- **Matcher.** Uses the sheet's Deezer and Apple ids directly, with an edition rule, flags and a dry run. All new albums are matched: about 5,640 have previews and about 780 have none (stage 1 counted 5,642 and 787 of 6,429, before the 43 pairs were merged).
- **One-pass embedder.** One download per clip, embedded by both models. 4 clips are embedded for every matched new album.
- **Full-length audio.** A YouTube fetch-and-embed command. A 30-album trial embedded 23. The full run is paused at 65 of 537.
- **CLAP store.** `data-pipeline/audio/clap/` sits beside the EffNet store. The build switch (`SITE_MODEL` in `rmr_pipeline/audio_store.py`) still says EffNet.
- **Match overrides.** 14 added, 7 of them for existing albums that were found on the wrong listing. Those 7 are not embedded again yet.

Details and tables: `docs/audio-10k-stage1.md`. Its counts are from the morning of 4 October, before the pairing (10,510 albums).

## The problem: CLAP hears the store

- A Deezer seed's ten CLAP neighbours are 2.3% Apple-sourced albums, where the make-up of its genre would give about 29% (n 2,869 new Deezer seeds). EffNet gives 27.1% for the same seeds.
- The existing albums are almost all from Deezer and about half of the new ones are from Apple, so this also keeps new and existing albums apart.
- On 349 tracks fetched from both stores (120 albums), the cause is how a 128 kbit/s stereo MP3 codes the 12 to 14 kHz band. It is not the excerpt and not loudness.
- YouTube audio is mildly separable too (25 albums).

Fixes measured so far, all on proxies:

| Fix | Result | Cost |
|---|---|---|
| Stereo MP3 round trip on Apple clips before CLAP | On the 349 paired tracks, neighbours from the other store go from 13.3% to 49.1% (50% is even) | About 11,600 Apple clips downloaded and embedded again. Deezer clips stay |
| Linear map on the stored Apple vectors, fitted on the pairs | On the catalog, closes about 85% of the gap (Deezer seeds 2.3% to 25.6%, Apple seeds 91.7% to 47.3% against a make-up of 37.7%) | No downloads. Leaves about ten points on the Apple side, and albums on YouTube audio drop out of lists |

In progress: the round trip is in the pipeline as the `clap_mp3` variant (`rmr_audio/mp3trip.py`) and is being validated on 250 catalog albums. Until a fix is in and the vectors are embedded again, CLAP stays off the site.

The record of the investigation is `experiments/audio_10k/REPORT.md`. The result files are listed there.

## Left to do

1. Finish the encoding fix and embed the affected clips again.
2. Resume the YouTube run (65 of 537 done).
3. Run the two things approved on 4 October over the catalog: the YouTube search for missing or dead links (`fulllength --search`) and full-length audio for the edge-case albums (`fulllength --edge-cases --search`). Both are built and tried on a sample (5 October); the commands are in `data-pipeline/README.md`. Picks are judged from titles, uploaders and lengths. Nobody has listened.
4. Embed the 7 wrong-listing albums again from their corrected listings.
5. Write the final CLAP store, refit the transform, run the measurements, and build the listening page for the owner.
6. Only with the owner's sign-off: rebuild the site data (descriptors for the new albums, covers, thumbnails, listen links for albums without Spotify), update the copy, deploy.

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
| `experiments/audio_10k/results/sonic_measures.md` | Proxy measures of the CLAP block over the catalog (provisional) |
| `data-pipeline/README.md` | The stores, the matcher, catalog and keys, commands |
| `data-pipeline/catalog/albums.csv` | The catalog |
| `data-pipeline/audio/keys.csv`, `matches.csv`, `match_overrides.json` | Keys, one match row per album, hand corrections |
| `data-pipeline/audio/fulllength.csv` | Outcome of each full-length fetch |
| `data-pipeline/audio/album_status.csv`, `album_status.md` | One row per album with its state and next step, and the counts |
| `data-pipeline/audio/clap/` | The CLAP store |

Local only, gitignored, on the laptop that ran the work:

| Path | What |
|---|---|
| `data-pipeline/.cache/audio/onepass.sqlite` | The clip cache: per-clip embeddings of both models. 384 MB after stage 1 |
| `data-pipeline/.cache/audio/onepass.before-rekey.sqlite` | Its backup from before the rekey |
| `data-pipeline/.cache/audio/http.sqlite`, `data-pipeline/.cache/*.log` | Cached store API answers and run logs |
| `experiments/audio_10k/cache/` | The sheet export (`rym10k_sheet.csv`) and the store-effect caches (embeddings and measurements, no audio) |
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
nice -n 19 .venv/bin/python -m rmr_audio.modelstore write                   # the CLAP store from the cache
nice -n 19 .venv/bin/python -m rmr_pipeline.audio fit-catalog --audio-dir audio/clap
.venv/bin/python scripts/stage1_report.py                                   # the stage 1 numbers
.venv/bin/python -m rmr_audio.album_status                                  # audio/album_status.csv and .md: every album's state
.venv-audio/bin/python -m pytest tests_audio && .venv/bin/python -m pytest  # tests, no network
```

Measurements and the listening page are in `experiments/audio_10k/` (`measure.py`, `source_effect.py`, `listening_page.py`).

## Issues

#37 (the whole effort), #38 (decisions), #41 (albums with no previews), #42 (ambiguous matches), #44 (catalog data errors), #39 (what the site still needs for new albums), #35 (licence terms).
