# recmyrecord data pipeline

Builds every file the site serves from `frontcreck/public/data/`. The outputs are committed, so the site builds without this pipeline or its inputs.

## Inputs (read-only)

- `data-retrieval/Recommender/data/all_data_norm.pkl`: the recommender's feature table (4,000+ rows in catalog-rank order; `Title`, `Artist`, `URI`, `Descriptor Count`, 13 min-max Spotify audio features, 176 descriptor columns). Override with `--table`. The build no longer reads the 13 Spotify columns; only the live-site replica does (see step 2).
- `data-pipeline/audio/`: the committed audio store and the frozen transform (see Audio). Override with `--audio-dir`.
- The music map worktree of the personal site, passed as `--map-root` (for example `/path/to/music_map`). The pipeline reads:
  - `public/data/metadata.json`: cluster id (0 to 7), atlas sheet and UV for each Spotify URI.
  - `public/data/atlas-0.webp` to `atlas-3.webp`: 96 px cover sprites in the map's own order.
  - `pipeline/outputs/spotify_features.parquet`: `cover_url` per `spotify_uri` (the cover source).
- `data-pipeline/overrides.json`: manual corrections (see below).

## Outputs (`frontcreck/public/data/`)

| File | Contents |
|---|---|
| `albums.json` | Array; index is the album id. `{ slug, t, a, s, c, k, d, w }`: slug, title, artist, Spotify album id, cover id (`https://i.scdn.co/image/` + c, may be empty), cluster 0..7, top 10 mood descriptor indexes, ambient colours `[wash, wash, accent]` |
| `vocab.json` | Mood descriptor words (114) |
| `positions.json` | `{ sonic, balanced, mood }`, flat `[x, y, ...]` arrays in album order, 3 decimals, within [-1, 1] |
| `recs.json` | `{ sonic, balanced, mood }`, 10 album ids per album, closest first |
| `atlas-0.webp` .. `atlas-3.webp` | 96 px sprites, 1,024 per sheet, album index order (sheet = floor(i / 1024), cell = i % 1024, 32 columns) |
| `thumbs.webp` | 48 px sprites, 64 columns, album index order |

## How it works

1. Albums: the feature table, keeping the first row of each Spotify URI; every album present in both the feature table and the map.
2. Recommendations: the live recommender with its 13 Spotify audio columns replaced by the 64-column audio block (see Audio). The matrix is `[audio block | descriptors / slider ** 3]` (184 columns): the 56 lyric and theme descriptors are dropped, the other 120 descriptor columns are divided by `slider ** 3`, and the neighbours are euclidean, at three stops: sonic 5, balanced 1.765 (the original site's tuned default, a divisor of about 5.5), mood 0.5. Ten per album per stop, over the whole catalog. `table.py` keeps an exact replica of the old live recommender (`rec_matrix`, `live_recommend`) and a test checks it: "In Rainbows" at slider 0.5, over the same leading rows the live recommender searches (`LIVE_POOL`), returns Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom. The site's mood stop still returns those five; the audio block has almost no weight there.
3. Layouts: UMAP (n_neighbors 15, random_state 42; min_dist 0.25 at sonic and balanced, 0.1 at mood) of the same matrix at each stop. Groups detached from the main cloud are enlarged to the map's density (UMAP packs them much tighter) and moved next to it, outliers softly compressed, sonic and mood Procrustes-aligned to balanced and resized so the three stops have the same median distance between neighbouring albums, all three scaled into [-1, 1] by one factor, stacked points spread. The site draws covers at one size for every stop, so the stops share a density (a median nearest-neighbour gap of about 0.0049 in the site's map units), not a bounding box. min_dist trades evenness for locality: with the audio block, 0.1 packs sonic and balanced neighbours into clumps where covers pile up; at 0.25, 59% (sonic) and 44% (balanced) of an album's recommendations are among its 30 nearest albums on the map, against 61% and 48% at 0.1. Mood is already even at 0.1 (42%) and loses the most from a larger value (36% at 0.3).
4. Artists: the feature table sometimes glues the member names onto the billed credit with no separator ("Bob Marley & The WailersBob MarleyThe Wailers"). `artists.py` keeps the billed credit: it cuts at the first case or script boundary inside a word when the text before it joins several names ("&", ",", "/", "and", "with", ...) and the glued-on tail repeats one of them. Whitespace is collapsed. Every string it changes in the feature table is listed in `tests/test_artists.py`.
5. Slugs: `kebab(title)-kebab(artist)` from the cleaned artist, ASCII-folded (Cyrillic transliterated), `-2`, `-3` on collision in catalog order.
6. Vocabulary: kept descriptors minus vocals descriptors, "instrumental" and "concept album", most frequent first.
7. Sprites: each album's map sprite re-packed in album order; ambient colours from the sprite plus an accent with at least 4.5:1 contrast on `#15110d`. The two washes are the leading colour and the next one of a clearly different hue (or, on a cover with one hue or none, a clearly lighter or darker one), made dark and muted with saturation taken from the colour's chroma so grey covers stay grey; the more visible of the two comes first. The constants in `colors.py` were tuned against the hand-picked pairs of the design mockup.

## Audio

The audio block is 64 numbers per album computed from 30-second preview clips (the evidence is in `experiments/preview_features/REPORT.md`, the design in `docs/superpowers/specs/2026-10-02-preview-audio-design.md`). It has two stages. The audio stage (`rmr_audio`, see The audio stage below) matches an album on Deezer or iTunes, runs each clip through Essentia's Discogs-EffNet model and stores the album's mean embedding; it is rare, needs the network and its own environment. The build stage (`rmr_pipeline`) only reads the store, so anyone can rebuild the site data from committed files.

### The store (`data-pipeline/audio/`, committed)

| File | Contents |
|---|---|
| `embeddings/part-NNNN.npz` | Append-only shards: `keys` (the feature table's `URI`), `emb` (float16, 1,280 per album: the mean of its clips' embeddings), `n_clips`, `source` (`deezer`, `itunes:us`, `local`, ...). A key in a later shard replaces the earlier one; an entry with `n_clips` 0 removes the album. |
| `manifest.json` | Model id, clip policy (`clips.per_album`: how many clips a plain `sync` gives an album), one entry per shard. |
| `matches.csv` | One row per album: source, source album id, matched title and artist, score, `ambiguous`, track count, clips available. An empty source means no match. |
| `match_overrides.json` | Hand corrections for the audio stage: key -> `{"source", "album_id"}` to force a match, or `{"skip": true}`. |
| `transform.npz` | The frozen transform: `mean`, `components` (64 x 1,280), `scale`, `target_total_variance`, and the fit's date, album count and model id. |

`audio_store.py` reads and writes these and rejects a malformed store with a message naming the file. It needs only numpy (1.26 or 2.x), so the audio stage can use it from its own environment.

The store began as 3,944 albums with four clips each, migrated from the experiment's cache by `scripts/migrate_experiment_audio.py`. Against the experiment's own block the migrated one differed by at most 0.0002 (values reach 0.6), because the store keeps float16 means. On 2 October 2026 `rmr_audio sync --clips 8 --retry-unmatched` topped every album up to eight clips where its listing has that many (13,103 clips, 105 minutes of work with two workers) and added 36 albums; the shards were compacted into one and the transform refitted. The store now holds 3,980 albums: 3,182 with eight clips, 798 with fewer because their listing has fewer previews.

Every file of the store is written under a temporary name and renamed into place, and a shard is in place before the manifest lists it. A crash leaves at worst a temporary file or an unlisted shard; the store still loads, `rmr_audio status` names the leftovers, and the next `sync` or `compact` removes them.

### The block

`block = ((e / |e|) - mean) @ components.T * scale`, where `e` is the album's stored embedding. The transform is a PCA fitted on the catalog (last on the eight-clip means of the 3,980 albums). `scale` gives the block the total variance the 13 Spotify columns had on the fitted albums (`target_total_variance`, 0.3905), so the slider stops keep their meaning.

An album added later goes through the same frozen transform. Refit only on purpose:

```bash
.venv/bin/python -m rmr_pipeline.audio fit      # rewrites audio/transform.npz from the current store
```

A refit changes about 5% of the lists and every map position, so it is never automatic. It keeps `target_total_variance`. Rebuild and commit the site data after it.

What the top-up and the refit of 2 October 2026 moved, against the four-clip data: at the sonic stop an album keeps 5.3 of its 10 recommendations on average, at the balanced stop 7.8, at the mood stop 9.9. Nearly all of it is the top-up (5.4, 7.8, 9.9 with the old transform kept); the refit alone moves 0.5, 0.2 and 0.0 of 10. Four clips were a noisy sample of an album: the mean embedding of an album moved to a cosine of 0.978 (median) with its four-clip mean.

### Albums without audio

101 albums have no audio: 98 have no listing with previews on Deezer or in the US, British or German iTunes store ("F♯A♯∞" is one), and 3 are kept out by hand in `match_overrides.json` (the stores only have cover versions or another album). Each still needs a row, so its block is imputed: the mean block of its 3 nearest albums by descriptor distance among the albums with audio, rescaled to those neighbours' mean norm. Until it has audio of its own, it sounds like the records that share its mood. `python -m rmr_pipeline.audio status` lists the imputed albums; the build prints the count.

The settings come from `experiments/preview_features/imputation.py` (`results/imputation.md`), which hides the audio of 137 random albums that have it, five times, and compares their imputed lists with their real ones. With k = 3 and rescaling a hidden album gets back 8% of its real top 10 at the sonic stop and 42% at the balanced stop; the share of its recommendations with its primary genre is 0.15 (0.25 with its own audio) at sonic and 0.18 (0.28) at balanced; it appears in 14 lists at sonic and 12 at balanced, where an average album appears in 10. Without rescaling the mean block is shorter than a real one and the album lands in 28 and 19 lists. Larger k does not recover more and makes the imputed albums recommend each other.

### Adding albums

1. The album has a row in the feature table (descriptors, a unique `URI`, title, artist). Its Spotify audio columns can be empty. The table is a pickle pinned by hash, so after changing it put its new SHA-256 (`shasum -a 256`) in `DEFAULT_TABLE_SHA256` in `rmr_pipeline/constants.py`: `load_table` refuses a table whose hash differs.
2. `.venv-audio/bin/python -m rmr_audio sync` (audio venv, below). It matches the album, embeds its clips, writes one new shard and adds the album's row to `matches.csv`.
3. `.venv-audio/bin/python -m rmr_audio status --missing`. Check the ambiguous matches and the albums without audio; correct them in `match_overrides.json` or with local files, and run `sync` again. (`python -m rmr_audio match` shows what the stores answer for a new album before anything is embedded.)
4. Rebuild (`rmr_pipeline.build`). An album with no shard entry is imputed.
5. Commit the new shard, `manifest.json`, `matches.csv`, `match_overrides.json` and the regenerated site data. A test fails when `recs.json` is not what the committed store gives. Nothing under `.cache/` is committed.

The album also has to be in the map inputs (cover sprite, cluster id), and the thumbnail sheet holds 4,096 albums.

### The audio stage (`rmr_audio`)

It has its own environment, because the arm64 Essentia wheel needs Python 3.11 and `numpy<2` while the build pins numpy 2.5 on Python 3.12:

```bash
uv venv --python 3.11 data-pipeline/.venv-audio      # or python3.11 -m venv
uv pip install --python data-pipeline/.venv-audio/bin/python -r data-pipeline/requirements-audio.txt
cd data-pipeline
.venv-audio/bin/python -m rmr_audio status [--missing]    # counts; with --missing, the albums without audio
.venv-audio/bin/python -m rmr_audio sync --dry-run        # what a sync would do; no network, nothing written
.venv-audio/bin/python -m rmr_audio match [--retry-unmatched]   # ask the stores, print each verdict; the store is not written
nice -n 19 .venv-audio/bin/python -m rmr_audio sync       # albums missing from the store, at the store's clip policy
nice -n 19 .venv-audio/bin/python -m rmr_audio sync --clips 8    # top every album up to 8 clips
.venv-audio/bin/python -m rmr_audio compact               # rewrite all shards into one
.venv-audio/bin/python -m pytest tests_audio              # its tests (no network)
```

The venv is about 560 MB. The model (`discogs-effnet-bs1-1.pb`, 18 MB) is fetched into `.cache/audio/models/` on the first sync, from the experiment's cache if it is there, else from essentia.upf.edu, and checked against a pinned SHA-256.

`sync` works on every album of the feature table that is missing from the store or has fewer clips than asked. For each it reads the match from `matches.csv` (searching the stores only for an album never matched), fetches the track listing again (Deezer's preview URLs expire after 15 minutes), downloads the clips it still needs into memory, embeds them and records each clip in the local clip cache. At the end it writes one new shard with the mean of each finished album's clips and updates `matches.csv`. An album whose clips did not change is not rewritten.

- Clips: the first track, then tracks spread evenly through the album, so an album's four clips are the first four of its eight. `--clips N` asks for N; without it the store's policy (`clips.per_album` in `manifest.json`) applies. A `--clips` run over the whole catalog that finishes makes N the policy. An album with fewer previews than N gets what there is. A run that left albums unfinished (a store not answering, an interruption, `--limit`, `--keys`) does not change the policy.
- Resuming: Ctrl-C or SIGTERM stops taking albums, lets the clips in flight finish (a few seconds; a wait between API retries ends at once) and writes the shard for the albums that finished. Running `sync` again continues; no clip is downloaded twice. `--limit N` stops after N albums, `--keys` takes URIs or slugs.
- The clip cache (`.cache/audio/clips.sqlite`, gitignored) holds every clip's embedding. It is what lets a top-up from four to eight clips download only four. If it is lost nothing committed is lost; a top-up then downloads all eight. `python -m rmr_audio import-experiment` seeds it from the experiment's cache (only on the machine that ran the experiment) and, while the store still has its first shard, checks that those clips reproduce it exactly.
- Load: 2 worker processes by default (`--workers`), one thread each, at the lowest priority. Measured on an M-series laptop: about 2 clips a second, 600 to 770 MB per worker and 1.4 to 1.6 GB in all. The laptop must stay awake: a sleeping machine pauses the run and the preview URLs fetched before the sleep expire (those clips fail and the next sync fetches them); `caffeinate -i` in front of the command prevents idle sleep on macOS. No audio is written to disk beyond a temp file deleted right after decoding.
- Failures: API errors and Deezer's quota answer are retried with backoff (Deezer is asked at most 5 times a second, iTunes once every 3.2 seconds; four attempts per URL). A store that fails three URLs in a row is left alone for the rest of the run, and the albums that needed it are listed and left for the next run. A clip that cannot be downloaded or decoded is recorded with its status. A preview that is empty, too short or undecodable is final, and the next track in the clip order takes its place, so the album still gets its N clips when it has enough previews. A download that failed is tried again by the next sync; a fresh URL refused (HTTP 4xx) in two runs is final. An album with no usable clip stays out of the store and is listed at the end. A worker that crashes costs one clip.

**Matching.** Deezer first; iTunes when Deezer has no match, a doubtful one, or previews for fewer than half the tracks. The iTunes storefronts are tried in order (`--storefronts`, by default `us,gb,de`): the first one as the fallback, each further one only while there is still no confident match with a preview. A probe of nine storefronts over the albums the US store lacks found 16 of them elsewhere, all of them in the British or the German store; pass others (`jp`, `br`, `pl`...) explicitly when wanted. Album ids are the same in every storefront. When a search finds the artist but not the album, the artist's album list is read as well (search misses albums the store has). The source is recorded as `deezer` or `itunes:<storefront>`. Albums recorded as unmatched are not looked at again unless `--retry-unmatched` is given (or the album is named in `--keys`). API responses are cached for 30 days in `.cache/audio/http.sqlite`; error answers are never cached. With `--retry-unmatched` a cached search older than a day is asked again, so a `match --retry-unmatched` followed the same day by `sync --retry-unmatched` asks only once.

What the matcher will not do by itself, and an override does: an album listed under another credit ("The Grand Wazoo" under Frank Zappa, not The Mothers), under another title ("Pappo's Blues, Vol. 3" for "Vol. 3"), or a classical recording listed with its composer in front ("Beethoven: Symphony No. 5" for "Symphonie Nr.5": the title alone does not say whose fifth it is, so this is checked by hand against the track list and the durations). Game soundtracks on Apple are mostly cover versions; two are kept out with `skip`.

**Match overrides** (`audio/match_overrides.json`, keyed by the album's `URI`):

```json
{
  "spotify:album:...": { "source": "deezer", "album_id": "1261474", "note": "the match was a tribute album" },
  "spotify:album:...": { "source": "itunes:jp", "album_id": "826492492" },
  "spotify:album:...": { "skip": true, "note": "no store has the right recording" }
}
```

Precedence, highest first: `skip`; a folder given with `--local-dir`; a forced listing that is not yet the one in `matches.csv`; local audio already in the store; the listing in `matches.csv`. A forced listing replaces the album's embedding at the next sync (with or without `--retry-unmatched`), also when that embedding came from local files; if the forced listing has no preview the old embedding is removed. `skip` keeps the album out of matching, and an embedding it already has is removed at the next sync (the shard gets an entry with `n_clips` 0, and `compact` then forgets the album). This is how a wrong embedding is taken out: add `{"skip": true, "note": "..."}` and run `sync`. Every entry carries a `note` saying what was checked.

**Local files.** For an album no store has: put its files in `DIR/<album slug>/` (mp3, m4a, flac, wav, ogg, aiff; file-name order is track order) and run `sync --local-dir DIR`. `status --missing` prints the slugs as `slug<TAB>artist — title`. One excerpt per file: 30 seconds starting 30 seconds in, centred when the track is shorter than a minute, the whole file when it is shorter than 30 seconds (under 5 seconds is skipped). A folder takes precedence over the stores for that album, the source is recorded as `local`, and a later sync without `--local-dir` leaves the album alone. Adding, removing or replacing a file updates the album at the next `sync --local-dir`. The files are only read.

## Commands

```bash
python3.12 -m venv data-pipeline/.venv
data-pipeline/.venv/bin/pip install -r data-pipeline/requirements.txt
cd data-pipeline
.venv/bin/python -m rmr_pipeline.build --map-root /path/to/music_map   # about 1 to 2 minutes
.venv/bin/python -m rmr_pipeline.validate                               # checks every output against the contract
.venv/bin/python -m rmr_pipeline.audio status                           # albums with audio, and the imputed ones
.venv/bin/python -m pytest
RMR_MAP_ROOT=/path/to/music_map .venv/bin/python -m pytest   # also compares sprites with the map's atlases
```

`pytest` here runs `tests/` (the build). The audio stage's tests are in `tests_audio/` and run with the audio venv (see The audio stage); `tests/test_audio_store.py` passes in both.

The pinned requirements need Python 3.12.

`--hub-correction balanced` (any comma-separated stops) ranks those stops by mutual proximity instead of the raw distance: an album that is close to everything stops counting as close. At the balanced stop the most-recommended album goes from 92 lists to 37, the albums in no list from 4.8% to 0.9%, and about a third of the recommendations change. It is off by default because the lists then differ from "nearest on the map".

`--skip-images` is a faster development run that keeps the fallback ambient colours and writes no sprite sheets. It needs an explicit `--out` folder so it never overwrites the committed `albums.json`; check that folder with `.venv/bin/python -m rmr_pipeline.validate --data <folder> --no-images`.

UMAP output depends on the exact versions of umap-learn, pynndescent and numba; keep `requirements.txt` pinned so the layouts stay reproducible.

## Overrides

`overrides.json` holds the corrections of a verified list kept in the owner's personal-site repository (`<personal-site-repo>/scripts/music-catalog/cover-fixes.json`): albums whose Spotify URI in the feature table points at a different album (for example Joni Mitchell, "Blue" pointed at a tribute single). Each key is the slug the pipeline derives from the feature table (after artist cleaning, before any correction). Fields, all strings, all optional:

- `s`: the right Spotify album id (22 characters), or `""` when the album has no Spotify release.
- `c`: the right cover id (the last part of its `https://i.scdn.co/image/` URL), or `""` when there is no Spotify cover. A cover correction needs `image`.
- `a`: the credited artist, when the feature table has the wrong one. The album's slug is rebuilt from it; the key stays the feature-table slug. The build fails if the new slug would change any other album's slug.
- `image`: a replacement cover image relative to this folder (`overrides/<slug>.jpg`), used for the sprites and the ambient colours. The images are cropped from the personal site's cover atlas, or taken from its Cover Art Archive covers for the albums with no Spotify release.
- `note`: why (the wrong album the URI points at, and the right one).

`overrides.py` checks every field and names the entry and the field in its error. Example:

```json
{ "blue-joni-mitchell": { "s": "<22-character album id>", "c": "<cover id>", "image": "overrides/blue-joni-mitchell.jpg", "note": "Spotify URI points at a tribute single" } }
```

Only the Spotify link, the cover, the sprites, the ambient colours and (for `a`) the artist and slug change. All 19 corrections of the list match an album in this catalog. Their positions and recommendations no longer use the wrong album's audio: preview clips are matched by artist and title, not by Spotify URI. 15 of the 19 have their own audio; the other 4 have no preview and are imputed.

## Known data problems (documented, not fixed)

- 34 Spotify URIs in the feature table are assigned to two or three different albums (69 rows). The pipeline keeps the first row and drops the other 35.
- Some Spotify URIs in the feature table point at a different album. The verified ones are corrected in `overrides.json` (see Overrides). The URI stays the album's key in the audio store.
- 101 albums have no audio and an imputed audio block (see Audio).
- Audio matches are not all right: in the experiment's hand audit about 1% of confident matches and about a third of the 148 then flagged `ambiguous` in `matches.csv` (149 now) were the wrong album or edition.
- 798 albums have fewer than eight clips (27 have one): their listing has fewer previews, or fewer tracks.
- "One" by Neal Morse shows a Neal Francis sleeve. Unverified, so not corrected.
- "Chill Out" (The KLF), "Gimix" (The Avalanches) and "Dark & Long" (Underworld) have no Spotify release, so they have no Spotify id and no cover id. The site shows no Spotify link for an album with an empty Spotify id. Their sprites and ambient colours use the corrected cover, but the site's cover component shows a cover id's image, then the sprite only when that image fails, so with no cover id it shows the typographic tile, not the sprite.
- "Spiritual Unity" (Albert Ayler Trio) has no cover; the site shows a typographic tile.
- 73 albums have no mood descriptors and 2,169 have fewer than ten.
- The feature table has 176 descriptor columns (the design spec says 175).
- Cluster ids come from the map pipeline and are unbalanced (three clusters hold almost every album); the site only uses them for dot colours.
- Artist cleaning only drops a glued tail that repeats a name from the credit. A credit glued to an unrelated name, or to member names spelled too differently, would stay as it is; none is known in the current table. The member names in the dropped tail are not kept.
- Audio no longer freezes the catalog, but adding an album still needs its descriptor row in the feature table, which no code here produces, and its cover and cluster in the map inputs.
