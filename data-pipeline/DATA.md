# Data dictionary

Every data file of the 10k catalog: what it is, how many rows, what the columns mean, which command writes it, and what it would cost to gather again. Paths are relative to `data-pipeline/` unless they start with `frontcreck/`. Row counts are of 7 October 2026, on the branch of issue #68.

Column meanings are taken from the docstring of the module named in each section. Where a docstring does not give one, the entry says "not documented".

"Hand" means a person edits the file. "Generated" means a command writes it and an edit would be lost. Venvs: `.venv` is the build's, `.venv-audio` the audio stage's (`README.md`).

## Overview

| File | Rows | Kind | Written by |
|---|---:|---|---|
| `catalog/source/rym10k_sheet.csv` | 10,000 | source, exported | an export of the sheet's "Top 10K Chart" tab |
| `catalog/albums.csv` | 10,467 | generated | `python -m rmr_catalog` |
| `catalog/manifest.json` | | generated | `python -m rmr_catalog` |
| `catalog/doubtful_pairs.csv` | 0 | generated | `python -m rmr_catalog` |
| `catalog/descriptor_aliases.json` | 4 names | hand | |
| `catalog/unverified_links.csv` | 67 | hand | |
| `catalog/covers.csv` | 7,476 | generated | `python -m rmr_pipeline.covers refs` |
| `catalog/covers_caa.csv` | 155 | generated, with rows added by hand | `covers refs`, `scripts/caa_hand.py` |
| `catalog/covers_skip.csv` | 14 | hand | |
| `catalog/covers_state.csv` | 213 | generated, a record | `python scripts/covers_state.py` |
| `catalog/covers_resolved.csv` | 10,467 | generated, a record | `python scripts/covers_resolved.py` |
| `audio/keys.csv` | 4,081 | generated; `manual` rows by hand | `python -m rmr_catalog` |
| `audio/matches.csv` | 10,467 | generated | `rmr_audio` (match, sync, the one-pass run) |
| `audio/match_overrides.json` | 30 | hand | |
| `audio/fulllength.csv` | 1,277 | generated | `python -m rmr_audio.fulllength` |
| `audio/fulllength_links.csv` | 5 | hand | |
| `audio/store_exclusions.csv` | 2 | hand | |
| `audio/album_status.csv`, `album_status.md` | 10,467 | generated | `python -m rmr_audio.album_status` |
| `audio/clips.csv` | 59,272 | generated, a record | `python -m rmr_audio.clip_table` |
| `audio/clip_listings.csv` | 6,716 | generated, a record | `python -m rmr_audio.clip_table` |
| `audio/effnet10k/` | 10,242 albums | generated | `python -m rmr_audio.modelstore write --model effnet --audio-dir audio/effnet10k` |
| `audio/clap/` | 10,240 albums | generated | `python -m rmr_audio.modelstore write --model clap_mp3 --audio-dir audio/clap` |
| `audio/` (`embeddings/`, `manifest.json`, `transform.npz`) | 3,980 albums | generated | `python -m rmr_audio sync` |
| `overrides.json`, `overrides/*.jpg` | 19 | hand | |
| `frontcreck/public/data/` | 10,467 albums | generated | `python -m rmr_pipeline.build --map-root PATH` |
| `frontcreck/public/covers/` | 153 images | generated | `python -m rmr_pipeline.covers` (the site's own copy of each Cover Art Archive cover in use, 500 px, named by MusicBrainz release group id; see that module's docstring) |

## Catalog (`catalog/`)

### `catalog/source/rym10k_sheet.csv`

The export of the owner's RYM sheet, tab "Top 10K Chart", that the catalog was built from. 10,000 rows, 5.5 MB. `catalog/manifest.json` has its SHA-256 (`d36c7a48...`) and the two retrieval times. It is the builder's default `--sheet` (`rmr_catalog/sources.py`, `DEFAULT_SHEET`), so `python -m rmr_catalog --check` runs from a fresh clone.

The builder reads the columns of `SHEET_COLUMNS`: `rank`, `artist`, `title`, `in_recmyrecord` (the sheet's own flag: yes, likely, missing; reported, never used to decide), `type`, `release_date_iso`, `primary_genres`, `secondary_genres`, `top_descriptors`, the six link columns (`spotify_url`, `apple_music_url`, `deezer_url`, `bandcamp_url`, `youtube_url`, `soundcloud_url`), `rym_url`, `recmyrecord_match` (the album of the site the sheet pairs the row with, as "Artist - Title"), `artist_latin`, `title_latin`, `rym_id`. The export also has `released_2022_plus`, `release_date`, `rym_rating`, `rating_count`, `review_count` and `retrieved_at`, which the builder does not read (not documented in the pipeline; they are the sheet's own columns).

Cost to gather again: the sheet is filled by the `rym-album-harvest` skill, slowly, from RateYourMusic chart and album pages. The time was not measured here. A new export is one download. A different export changes the hash, and may change `albums.csv`.

### `catalog/albums.csv`

Every album, keyed by `rym_id`: the site's 4,081 albums first, in their order (an album's row number is its number on the site), then the chart's 6,386 new albums by rank (`rmr_catalog/build.py`).

- `rym_id`: the key. A RYM id, or the placeholder `sp:<Spotify album id>` for an existing album that is not on the chart.
- `rank`, `on_chart`: the chart rank; `on_chart` 0 for an existing album the chart does not have.
- `artist`, `title`: for an existing album, the feature table's (the site's slugs are made from them). For a new album, the sheet's.
- `artist_latin`, `title_latin`: the sheet's romanisations.
- `rym_artist`, `rym_title`: the sheet's spellings.
- `year`, `release_date`, `type`, `primary_genres`, `secondary_genres`, `top_descriptors`: from the sheet. For an existing album off the chart, year and date come from the old scrape.
- `spotify_url`, `apple_music_url`, `deezer_url`, `bandcamp_url`, `youtube_url`, `soundcloud_url`, `rym_url`: the sheet's links.
- `legacy_uri`: the feature table's Spotify URI. Empty for a new album.

Generated by `.venv-audio/bin/python -m rmr_catalog` from the sheet export, the feature table, `overrides.json`, the old scrape and the `manual` rows of `audio/keys.csv`. No network. Cost to rebuild: seconds.

### `catalog/manifest.json`

The sheet export's file name, SHA-256, row count and retrieval times, and the counts of the build (albums, existing, new, how the existing albums were paired). Generated with `albums.csv`.

### `catalog/doubtful_pairs.csv`

Old-to-new pairs for the owner to decide, and what was done meanwhile (`rmr_catalog/build.py`, `DOUBT_FIELDS`; the reasons are `rmr_catalog/pairing.py`'s `REASONS`). Header only today: every pair has been decided.

### `catalog/descriptor_aliases.json`

Four RYM descriptor names that were renamed, each mapped to the feature table's column (`rmr_pipeline/catalog.py`). Hand.

### `catalog/unverified_links.csv`

The existing albums whose Spotify link was found to open another album and whose right id nobody has looked up (`rmr_pipeline/catalog.py`, `load_unverified_links`). The build gives them no Spotify link and no Spotify cover. Columns: `rym_id`, `slug`, `site_id` (the feature table's Spotify id), `opens` (the album the link opens), `note`. Hand. Cost: each row was checked by a person.

### `catalog/covers.csv`

One image per album that needs one: the new albums, and the existing albums whose Spotify link on the sheet is another release (`rmr_pipeline/covers.py`). Columns: `rym_id`, `source` (spotify, deezer, apple, bandcamp, youtube), `ref` (the image id as that source names it). Generated by `covers refs`, which asks Spotify's oEmbed, the stores and Bandcamp at about one request a second per host. Cost to gather again: not measured; some hours by those intervals (an estimate).

### `catalog/covers_caa.csv`

The last resort: the Cover Art Archive's front image of the album's MusicBrainz release group, for an album that would otherwise have no cover. Columns: `rym_id`, `mbid`, `mb_title`, `mb_artist`, `mb_year`, `mb_type`, `score`, `matched_by` (`auto`: the lookup's rule; `hand`: a reader chose the release group, 32 rows, reasons in `docs/review/caa-covers-hand.md`). Generated by `covers refs`; hand rows added by `scripts/caa_hand.py`. Cost: the hand rows were matched by a person.

### `catalog/covers_skip.csv`

The rows of `covers.csv` and `covers_caa.csv` whose image is not a cover (a video frame with a track list, a fan-made sleeve). Columns: `rym_id`, `source`, `ref`, `note`. Hand; each row is the owner's decision.

### `catalog/covers_state.csv`

A record of `.cache/covers/state.json`, the gitignored file where the covers module writes the lookups that failed for a reason of the album's own, the images that are gone, and what the last resort decided. 213 rows: 28 `refs`, 22 `sprites`, 163 `caa`. The columns are in the docstring of `scripts/covers_state.py`.

The covers module does not read this table. It matters because the build reads the state file: an album whose image is recorded as gone gets no cover from that row. On a computer with no state file, `python scripts/covers_state.py --restore` writes it from the table (byte for byte the file of 6 October 2026). Nothing was dropped: the module never records a request that was refused or got no answer. The state file has no dates.

### `catalog/covers_resolved.csv`

One row for every album: the cover the built site shows, its URL, and where it came from. Columns: `rym_id`, `slug`, `kind`, `ref`, `url`, `origin`, `note` (docstring of `scripts/covers_resolved.py`). Read from the built `frontcreck/public/data/albums.json`, with the URL from `rmr_pipeline.covers.cover_url`.

By kind: spotify 9,616, yt 341, bc 192, ca 153, am 102, dz 53, none 10. By origin: `covers.csv` 7,430, `map` 2,858, `covers_caa.csv` 153, `overrides.json` 16, none 10.

The 2,858 `map` rows are the reason for the file. Their cover ids come from another repository (the build's `--map-root`), and nothing else in this one has them but the built `albums.json`.

Generated: run `python scripts/covers_resolved.py` after every build, and commit it with the site data. A test fails when it is not what the committed `albums.json` gives. Nothing reads it.

## Audio (`audio/`)

### `audio/keys.csv`

The RYM id of every album that had a Spotify URI as its key (`rmr_pipeline/keys.py`). Columns: `rym_id`, `legacy_uri`, `matched_by` (spotify_id, artist_title_year, manual, none), `doubt`. Generated by `python -m rmr_catalog`; the 159 `manual` rows were set by hand and the builder keeps them.

### `audio/matches.csv`

One row per album: the store listing its audio was taken from (`rmr_pipeline/audio_store.py`, `MATCH_FIELDS`). An empty `source` means unmatched (881 albums).

- `key`, `source` (deezer, `itunes:<storefront>`), `source_album_id`, `matched_title`, `matched_artist`, `score`, `ambiguous` (0 or 1).
- `n_tracks`, `n_clips_available`: tracks of the listing, and tracks with a preview.
- `matched_by`: how the listing was found (deezer_id, apple_id, search, override). Empty for the 4,861 rows matched before the column existed.
- `edition`: what the edition rule put in place of the linked listing (standard, split), or empty.
- `runtime_s`, `under_covered`, `short_preview`: the listing's length and two flags (1, 0, or empty for not determined).

Cost to gather again: Stage 1 took about 11 hours of matching (`docs/audio-10k-status.md`). The store answers are cached in `.cache/audio/http.sqlite`, which is not committed.

### `audio/match_overrides.json`

Hand corrections keyed by album key: `{"source", "album_id"}` forces a listing, `{"skip": true}` forbids a match, `note` says why. 30 entries.

### `audio/fulllength.csv`

The outcome of each full-length fetch from YouTube or Bandcamp (`rmr_audio/fulllength.py`). Columns: `key`, `source`, `url`, `class` (full_album, single_track, mismatch, unavailable), `duration_s`, `title`, `uploader`, `n_windows`, `status` (embedded 874, search_none 300, skipped 100, failed 2, mismatch 1), `matched_by` (link, search, manual), `reason` (no_audio, edge_case), `query`, `score`, `runner_up`, `note`. The audio itself is never kept.

### `audio/fulllength_links.csv`

Links the owner gave by hand for albums without audio (`rmr_audio/links.py`): `key`, `url`, `note`. Hand.

### `audio/store_exclusions.csv`

The albums every store write leaves out: `key`, `reason`, `date`. Two rows, A Clockwork Orange and Barry Lyndon, whose only audio is of other records. `python -m rmr_audio.modelstore write` reads it by default, so a plain write gives the committed stores again. `--exclude` adds more albums for one run. Hand.

### `audio/album_status.csv`, `audio/album_status.md`

One row per catalog album: its listing, its ok clips per model and the source its mean is taken from, its flags, a `state` and a `next_step`. The columns and the rules are in the docstring of `rmr_audio/album_status.py`. Generated from the catalog, `matches.csv`, `match_overrides.json`, `fulllength.csv`, `fulllength_links.csv` and the clip cache. It cannot be written without the cache.

### `audio/clips.csv`, `audio/clip_listings.csv`

The clip cache without its vectors (`rmr_audio/clip_table.py`, whose docstring has every column). `clips.csv` has one row per clip: the album, the listing, the track, the clip's rank, the window start for full-length audio, the lengths, each model's status and origin, and `in_effnet10k` and `in_clap`: whether the clip is in the album's committed mean. `clip_listings.csv` has what each fetched listing had. 8.2 MB and 0.5 MB.

By source: Deezer 39,842 clips, Apple 12,438, YouTube 6,992 windows of 874 albums. Ok vectors: effnet 59,188, clap 44,795, clap_mp3 44,791.

Which clips a mean takes is a rule, not a stored fact. The rule is `OnePassCache.means` with pool `rank`, as `rmr_audio.modelstore` calls it: one listing per album; its full-length windows when it has any, and then the first `n_windows` of them; else the first 4 ok clips in rank order of the listing `match_overrides.json` forces, else of the one `matches.csv` names, else of the listing with the most ok clips. `clip_table` applies that rule and marks the clips.

Checks made when the table was written (7 October 2026): for all 10,242 albums of `effnet10k` and all 10,240 of `clap`, the mean taken again from the marked clips is the committed vector, bit for bit, with the same clip count and source. The per-album counts agree with `album_status.csv` except for the two excluded albums (5 clips for each model).

The first EffNet store (`audio/`, eight clips) has no column. For 3,880 of its 3,980 albums the committed vector is the mean of the first 8 ok `effnet` clips in rank order of the matched listing. The other 100 have since been given full-length windows, which that store never used.

No preview address is in the tables, and none was in the cache.

Cost to gather again: the clips have to be fetched and embedded again. Stage 1 took about 6 hours of embedding; the full-length and `clap_mp3` runs came after and were not timed in the docs.

### The stores: `audio/effnet10k/`, `audio/clap/`, `audio/`

Each store is `embeddings/part-NNNN.npz`, `manifest.json` and `transform.npz` (`rmr_pipeline/audio_store.py`).

- `embeddings/part-NNNN.npz`: `keys` (album keys), `emb` (float16, albums by `dim`), `n_clips` (int16), `source` (the listing's source).
- `manifest.json`: the model, `dim`, the clip policy, the pooling rule, one entry per shard.
- `transform.npz`: the fitted reduction to the 64-number audio block (`mean`, `components`, `scale`, `target_total_variance`, `fitted`, `albums`, `model`, `keys`), written by `python -m rmr_pipeline.audio fit-catalog --audio-dir DIR` (`fit` for `audio/`).

| Store | Model | Albums | Clips | Size of the shard |
|---|---|---:|---|---:|
| `audio/effnet10k/` | discogs-effnet-bs1-1, 1,280 numbers | 10,242 | 4 per album | 24.5 MB |
| `audio/clap/` | CLAP on an MP3 round trip (`clap_mp3`), 512 numbers | 10,240 | 4 per album | 9.7 MB |
| `audio/` | discogs-effnet-bs1-1, 1,280 numbers | 3,980 | up to 8 | 9.5 MB |

`effnet10k` is the store the site is built from (`SITE_MODEL`). The two 10k stores can be written again from the clip cache in seconds. Without the cache they cannot be written again at all, short of fetching the audio.

## Overrides

`overrides.json` holds 19 hand corrections of albums whose Spotify URI in the feature table points at another album, keyed by the slug the pipeline derives from the feature table. Fields: `s` (the right Spotify album id), `c` (the right cover id), `a` (the credited artist), `image` (a replacement cover, `overrides/<slug>.jpg`), `note`. They are described in `README.md`, Overrides. `overrides/` has the 19 images. Hand; the list is kept in the owner's personal-site repository.

## Site data (`frontcreck/public/data/`)

Generated by `python -m rmr_pipeline.build --map-root PATH`, 33 MB. The fields are described in `README.md`, Outputs and Catalog mode.

| File | What |
|---|---|
| `albums.json` | Array of 10,467; the index is the album id. `slug`, `t` title, `a` artist, `s` Spotify album id, `c` cover id, `k` cluster 0 to 7, `d` up to 8 descriptor indexes, `w` ambient colours, then `l` (listen links) and `n` (no audio) when the album has them |
| `vocab.json` | The 113 mood descriptor words |
| `positions.json` | `sonic`, `balanced`, `mood`: flat `[x, y, ...]` arrays in album order |
| `recs.json` | `sonic`, `balanced`, `mood`: 10 album ids per album, closest first |
| `atlas-0.webp` to `atlas-10.webp` | 96 px cover sprites, 1,024 per sheet, in album order |
| `thumbs.webp`, `thumbs-1.webp`, `thumbs-2.webp` | 48 px sprites, 4,096 per sheet |

A full build needs two things that are not in this repository: the map root (another repository: cluster ids, the old albums' cover ids and sprites) and the 96 px sprites of the new albums (`.cache/covers/96`). The feature table and the old scrape are committed under `data-retrieval/`.

## What is not in the repository

| What | Where it is | Why not, and what is committed instead |
|---|---|---|
| The per-clip vector cache | `data-pipeline/.cache/audio/onepass.sqlite` on the laptop that ran the work, 630 MB (601 MiB) | Per-clip vectors for `effnet`, `clap` and `clap_mp3`. The album means are committed (the stores), and so is every other column (`audio/clips.csv`). |
| The cache's backups | `.cache/audio/onepass.before-rekey.sqlite`, `onepass.before-clap_mp3.sqlite`, `onepass.before-search-trial.sqlite` | Earlier states of the same cache. |
| Store API answers | `.cache/audio/http.sqlite`, 45 MB | The outcomes are in `audio/matches.csv`. |
| 96 px cover sprites | `.cache/covers/96/` (7,598 files) and `96.manifest.json` | Baked into the atlas sheets of the site data. |
| The covers state file | `.cache/covers/state.json` | Its content is `catalog/covers_state.csv`. |
| Audio files | nowhere | Never kept, by design: a clip is embedded and deleted. |
| Full-size cover images | nowhere | Never kept: the site links to the image hosts. |
| The map root | the owner's personal-site repository | Cluster ids, cover ids and sprites of the 4,081 existing albums. The cover ids in use are in `catalog/covers_resolved.csv`. |

Off-laptop copy: not made yet (see #68)

## Known oddities

Each was checked against the files on 7 October 2026.

- `Album999417` (A Clockwork Orange) shows `done` in `audio/album_status.csv`, although it is left out of both stores. Its listing in `audio/matches.csv` (Deezer 88777722, "A Clockwork Orange - The Complete Fantasy Playlist") is the wrong record. The status table counts clips; it does not read `store_exclusions.csv`.
- `Album229104` and `Album30723` are in `effnet10k` and not in `clap`: each has 8 clips that are `ok` for `effnet`; for `clap` and `clap_mp3` four say `no_preview` and four were never run. `album_status.csv` has them as `partial`, next step `embed`.
- `docs/audio-10k-status.md` and `docs/audio-10k-handoff.md` say 10,235 albums for the CLAP store and 10,237 for the 10k EffNet store, with 869 from YouTube. The committed manifests say 10,240 and 10,242, with 874 from YouTube.
- The same two documents say the 8 wrong windows of A Clockwork Orange are still in the cache. They are not: `audio/fulllength.csv` records that they were deleted on 6 October 2026, and the cache has only the album's Deezer clips.
- `catalog/doubtful_pairs.csv` has a header and no rows.
- `short_preview` in `audio/matches.csv` is empty for every row. The per-clip flag is in `audio/clips.csv` (24 clips have 1).
- 3,270 clips are keyed by a placeholder (`sp:<id>`). Those are current keys of existing albums that are off the chart, not stale ones: `key` and `rym_id` are equal on every row of `clips.csv` today.
- `clip_listings.csv` has 6,716 listings, of 6,592 albums, while `clips.csv` has clips of 10,465 listings. The 28,432 clips with no listing row were all imported from the older cache (`effnet_origin` `import:clips.sqlite`), which did not record listings.
- `data-pipeline/README.md` still passes `--exclude Album999417,Album739618` in its commands and says the flag is not remembered anywhere. The flag is harmless now, and the sentence is out of date.
