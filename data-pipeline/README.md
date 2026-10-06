# recmyrecord data pipeline

Builds every file the site serves from `frontcreck/public/data/`. The outputs are committed, so the site builds without this pipeline or its inputs.

## Inputs (read-only)

- `data-retrieval/Recommender/data/all_data_norm.pkl`: the recommender's feature table (4,000+ rows in catalog-rank order; `Title`, `Artist`, `URI`, `Descriptor Count`, 13 min-max Spotify audio features, 176 descriptor columns). Override with `--table`. The build no longer reads the 13 Spotify columns; only the live-site replica does (see step 2).
- `data-pipeline/audio/`: the committed audio store, the frozen transform (see Audio) and `keys.csv`, which gives each Spotify URI of the feature table its album key (see Catalog and keys). Override with `--audio-dir`.
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
| `embeddings/part-NNNN.npz` | Append-only shards: `keys` (the album's key: its RYM id, see Catalog and keys), `emb` (float16, 1,280 per album: the mean of its clips' embeddings), `n_clips`, `source` (`deezer`, `itunes:us`, `local`, ...). A key in a later shard replaces the earlier one; an entry with `n_clips` 0 removes the album. |
| `manifest.json` | Model id, clip policy (`clips.per_album`: how many clips a plain `sync` gives an album), one entry per shard. |
| `matches.csv` | One row per album: source, source album id, matched title and artist, score, `ambiguous`, track count, clips available; then `matched_by` (`deezer_id` or `apple_id`: the catalog row's link; `search`; `override`), `edition` (`standard` or `split` when the edition rule replaced the linked listing), `runtime_s` and the flags `under_covered` and `short_preview` (1, 0, or empty: not determined). An empty source means no match. The five later columns are empty for the albums matched before 3 October 2026. |
| `match_overrides.json` | Hand corrections for the audio stage: key -> `{"source", "album_id"}` to force a match, or `{"skip": true}`. |
| `keys.csv` | One row per album that had a Spotify URI as its key: `rym_id` (the key), `legacy_uri`, `matched_by`, `doubt`. Written by the catalog builder. |
| `transform.npz` | The frozen transform: `mean`, `components` (64 x 1,280), `scale`, `target_total_variance`, and the fit's date, album count and model id. |

`audio_store.py` reads and writes these and rejects a malformed store with a message naming the file. It needs only numpy (1.26 or 2.x), so the audio stage can use it from its own environment.

The store began as 3,944 albums with four clips each, migrated from the experiment's cache by `scripts/migrate_experiment_audio.py`. Against the experiment's own block the migrated one differed by at most 0.0002 (values reach 0.6), because the store keeps float16 means. On 2 October 2026 `rmr_audio sync --clips 8 --retry-unmatched` topped every album up to eight clips where its listing has that many (13,103 clips, 105 minutes of work with two workers) and added 36 albums; the shards were compacted into one and the transform refitted. The store now holds 3,980 albums: 3,182 with eight clips, 798 with fewer because their listing has fewer previews.

Every file of the store is written under a temporary name and renamed into place, and a shard is in place before the manifest lists it. A crash leaves at worst a temporary file or an unlisted shard; the store still loads, `rmr_audio status` names the leftovers, and the next `sync` or `compact` removes them.

### The 10k EffNet store (`data-pipeline/audio/effnet10k/`)

The owner listened on 5 October 2026 and chose EffNet over CLAP for the 10k catalog. `audio/effnet10k/` is the Discogs-EffNet store for the whole catalog: 10,237 of the 10,467 albums (Deezer 6,475, Apple 2,893, YouTube 869), four clips per album, with its own `embeddings/`, `manifest.json` and `transform.npz`. It shares `keys.csv`, `matches.csv` and `match_overrides.json` with `audio/`. Like the CLAP store below it is written whole from the one-pass clip cache, by the same command and the same pooling rule, and can be written again at any time:

```bash
cd data-pipeline
nice -n 19 .venv/bin/python -m rmr_audio.modelstore write --model effnet --audio-dir audio/effnet10k --clips 4 --exclude Album999417,Album739618
nice -n 19 .venv/bin/python -m rmr_pipeline.audio fit-catalog --audio-dir audio/effnet10k   # audio/effnet10k/transform.npz
.venv/bin/python -m rmr_audio.modelstore status --model effnet --audio-dir audio/effnet10k --exclude Album999417,Album739618
```

`--model effnet` needs `--audio-dir`. `write` refuses `audio/` itself, whatever the model: that store is `rmr_audio sync`'s. `--exclude` is as for the CLAP store, and has to be passed on every write.

`audio/` and the site build are untouched. The site data is still built from `audio/`: 3,980 albums at up to eight clips, with a transform fitted on the site's albums. For the albums still on preview clips the cache's eight-clip means are the vectors of `audio/` bit for bit, except the seven whose listing was corrected by hand. So the new store differs from `audio/` by the clip count (four, not eight), by the seven corrected listings and by the 100 albums that are now on YouTube windows. The cosine between the two stores' vectors has a median of 0.979 over the 3,978 albums in both.

A switch would need:

- a build pointed at the store: `SITE_MODEL = "effnet10k"` in `rmr_pipeline/audio_store.py`, or `--audio-dir audio/effnet10k`. `audio_block` already reads it: 4,039 of the site's 4,081 albums have audio there;
- `tests/fixtures/audio_reference.npz` recorded again, because every existing album's block changes (other clips, a transform fitted on the whole catalog);
- the site data rebuilt and committed, with what the new albums still need (issue #39).

None of that is done.

### The CLAP store (`data-pipeline/audio/clap/`) and the switch

A store holds one model's embeddings; its manifest names the model and the width (`dim`), and `audio_store.py` checks every shard and the transform against it. `audio/` is the Discogs-EffNet store (1,280 numbers per album). `audio/clap/` is the store of `laion/larger_clap_music_and_speech` (512), with its own `embeddings/`, `manifest.json` and `transform.npz`. It is written from the clip cache's `clap_mp3` rows (the variant below), so its manifest names the model as `laion/larger_clap_music_and_speech+mp3-128k-stereo`. It shares `keys.csv`, `matches.csv` and `match_overrides.json` with the store it sits in.

The site build reads the store named by `SITE_MODEL` in `rmr_pipeline/audio_store.py`. It is `"effnet"`. Setting it to `"clap"` makes `rmr_pipeline.build` and `rmr_pipeline.audio status` read `audio/clap/` when no `--audio-dir` is given; nothing changes on the site until the data is rebuilt and committed, and `tests/fixtures/audio_reference.npz` then has to be recorded again.

The CLAP store is not appended to. It is written whole from the one-pass clip cache, for every album of `catalog/albums.csv` that has an ok `clap_mp3` clip, and can be written again at any time:

```bash
cd data-pipeline
nice -n 19 .venv/bin/python -m rmr_audio.modelstore write --model clap_mp3 --audio-dir audio/clap --exclude Album999417,Album739618   # audio/clap/embeddings, manifest.json
nice -n 19 .venv/bin/python -m rmr_pipeline.audio fit-catalog --audio-dir audio/clap   # audio/clap/transform.npz
.venv/bin/python -m rmr_audio.modelstore status --exclude Album999417,Album739618
```

The CLAP store stays on the branch. It is not the store the 10k catalog will use: see the section above.

`--exclude Album999417,Album739618` leaves out A Clockwork Orange and Barry Lyndon: the only audio the cache has for them is of other records (a wrong YouTube pick and an unrelated store listing), and no right source was found. The flag is not remembered anywhere, so pass it on every `write`, or the two albums come back into the store.

Both need only numpy, load no model and download nothing. Without `--model` and `--audio-dir`, `write` would put the cache's plain `clap` rows in `audio/clap/`; `tests/test_modelstore.py` fails on such a store. `write` opens the cache read-only and writes nothing when the store already holds exactly what the cache and the catalog give. An album vector is the mean of the album's first four ok clips in rank order (a failed clip does not use up a place; an album with fewer uses what it has; windows of full-length audio replace the previews and all of them count), from one listing, kept as float16 with `n_clips` and `source`. The listing is the one `match_overrides.json` forces when it has an ok clip for the model, else the one `matches.csv` names, else the one with the most ok clips. `matches.csv` records what the EffNet store was embedded from, so for an album whose listing was corrected by hand it still names the old listing; the override comes first. While the override's listing is not embedded, the album stays on the other listing and `write` (and `--dry-run`) prints how many such albums there are, with their keys. `write --exclude KEY[,KEY...]` leaves albums out of the store (an album whose only audio is of another record) and names them in its first line; `status --exclude` with the same keys says whether they are in the store. For the Deezer albums the earlier CLAP run covered it is `clap_catalog.load(4)`'s vector to 1e-8 (a Deezer clip's `clap_mp3` vector is its `clap` vector). A cache key the catalog no longer has is followed through `keys.csv`.

`fit-catalog` fits the 64 components on every catalog album the store has, the new ones included, and never writes `audio/transform.npz`. It keeps the EffNet transform's `target_total_variance` (0.3905): `scale` brings any model's block to that total, and the slider stops were tuned against a block of that size.

#### The `clap_mp3` variant (beside `clap` in the clip cache; what `audio/clap/` is written from)

CLAP hears the store a preview came from: Deezer's previews are 128 kbit/s stereo MP3, Apple's are AAC (`experiments/audio_10k/results/store_effect_fix.md`). `clap_mp3` is a second CLAP vector per clip, kept in the cache's `embeddings` table under its own model name and never in place of `clap`. For a clip that is not from Deezer (`itunes:*`, `youtube`, `bandcamp`, `local`) the decoded audio, with its channels, goes through a 128 kbit/s stereo MP3 round trip (`rmr_audio/mp3trip.py`: ffmpeg `libmp3lame` through pipes, no file) before the channels are averaged and the CLAP recipe runs unchanged; a one-channel signal is duplicated to both sides for the encode. For a Deezer clip the variant is the `clap` vector itself, copied inside the cache. `audio/clap/` is written from it; `results/mp3_variant_check.md` in the same folder has what was measured.

```bash
cd data-pipeline
.venv-audio/bin/python -m rmr_audio.onepass copy                                   # Deezer clips: the clap rows, copied; no network, no model
nice -n 19 .venv-audio/bin/python -m rmr_audio.onepass run --models clap_mp3 --itunes-interval 3.4   # the other preview clips: fetched again, clap_mp3 only
nice -n 19 .venv-audio/bin/python -m rmr_audio.fulllength --models effnet,clap,clap_mp3   # full-length windows: all three from one download; embedded albums are fetched once more for clap_mp3 alone
.venv/bin/python -m rmr_audio.modelstore write --model clap_mp3 --audio-dir audio/clap --exclude Album999417,Album739618   # the CLAP store, from the variant's rows (any other folder to look at it first)
```

`run --models clap_mp3` takes, per album, the clips that are ok for `clap` (the clips its mean is over), downloads each once and embeds it for the variant only: EffNet and `clap` are not computed, the EffNet child is not started, and no `effnet` or `clap` row is written. A `clap` clip whose preview the store no longer lists is recorded as `no_preview` ("gone") and the next track in the usual order stands in; the run prints both counts. `--check-baseline` also embeds each fetched clip for `clap` and prints its cosine with the stored vector, without storing it. A new album is embedded with `--models effnet,clap,clap_mp3`: one download per clip.

#### Full-length audio: the sheet's link, a search, the edge cases

`rmr_audio.fulllength` is the one command for audio that does not come from store previews. It fetches a whole album with yt-dlp, embeds 30-second windows of it (8 laid out, 4 to 8 in the mean by runtime) and deletes the file; the outcome of every album is a row of `audio/fulllength.csv`. The rules are in the module's docstring.

```bash
cd data-pipeline
M="--models effnet,clap,clap_mp3"
nice -n 19 .venv-audio/bin/python -m rmr_audio.fulllength $M                          # albums without previews: the sheet's YouTube link
nice -n 19 .venv-audio/bin/python -m rmr_audio.fulllength $M --retry-failed           # only the rows that failed (a download refused)
nice -n 19 .venv-audio/bin/python -m rmr_audio.fulllength $M --search                 # and a YouTube search where the link is missing or not the album
nice -n 19 .venv-audio/bin/python -m rmr_audio.fulllength $M --edge-cases --search    # albums on 1 to 3 previews: full-length windows replace them
.venv/bin/python -m rmr_audio.album_status                                            # the table, after any of them
```

- **Search** (`--search`). For an album whose sheet link is missing, unavailable, a single track or another video, yt-dlp's `ytsearch10:` is asked in up to three forms (titles, uploaders and lengths only; no API key, no account, no cookies). A video is taken only when its title has the album's title, its title or uploader has the artist, its length fits (within 15% of the store listing's runtime when the album has one; else 25 minutes or more, 8 when the title says "full album"), its title does not say live, cover, review, remix and the like, and something more speaks for it: "full album" in the title, the artist's own channel, the listing's runtime, or several uploads of the same length. When two videos of different lengths score alike, nothing is taken. The row records `matched_by = search`, the query, the score and the runner-up's; when nothing is taken, `status = search_none` with the video that came closest and why it was refused, and the album is not searched again unless `--retry-search`. Everything is judged from metadata: nobody listens.
- **Edge cases** (`--edge-cases`). The albums that have previews and are under-covered by them: 1 to 3 previews of a listing that runs 15 minutes or more, or whose runtime is unknown (`album_status.edge_case`; Long Season is one track with one preview). The sheet's link is used when it is the album, else the search. The windows replace the previews in the album's mean; the preview clips stay in the cache, and an album nothing is found for keeps them. The row has `reason = edge_case`.
- Not done: official playlists of per-track videos are not used as an album, and when the video a search took is unavailable the next best one is not tried.

#### Where each album stands

`audio/album_status.csv` has one row per catalog album: its listing, its ok clips per model and the source its mean is taken from, its flags, and a `state` (`done`, `partial`, `no_audio`) and a `next_step` (`youtube_search` and `youtube_full_length` until the search or the edge-case run has been through the album; `none_available` when they found nothing). `audio/album_status.md` has the counts. `.venv/bin/python -m rmr_audio.album_status` writes both from the catalog, `matches.csv`, `match_overrides.json`, `fulllength.csv` and the clip cache (read-only; it fails without it), and gives the same bytes for the same inputs, so run it again after any audio job. The columns and the rules are in the module's docstring.

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

1. The album has a row in the feature table (descriptors, a unique `URI`, title, artist) and a key for that URI in `audio/keys.csv` (the build and the audio stage stop with a message naming an album that has none). Its Spotify audio columns can be empty. The table is a pickle pinned by hash, so after changing it put its new SHA-256 (`shasum -a 256`) in `DEFAULT_TABLE_SHA256` in `rmr_pipeline/constants.py`: `load_table` refuses a table whose hash differs.
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
.venv-audio/bin/python -m rmr_audio match-dry-run --sample 300 --seed 1 --out DIR   # match a sample of the new albums; writes only DIR
nice -n 19 .venv-audio/bin/python -m rmr_audio sync       # albums missing from the store, at the store's clip policy
nice -n 19 .venv-audio/bin/python -m rmr_audio sync --clips 8    # top every album up to 8 clips
.venv-audio/bin/python -m rmr_audio compact               # rewrite all shards into one
.venv-audio/bin/python -m pytest tests_audio              # its tests (no network)
```

The venv is about 560 MB. The model (`discogs-effnet-bs1-1.pb`, 18 MB) is fetched into `.cache/audio/models/` on the first sync, from the experiment's cache if it is there, else from essentia.upf.edu, and checked against a pinned SHA-256.

`sync` works on every album of the feature table that is missing from the store or has fewer clips than asked. For each it reads the match from `matches.csv` (searching the stores only for an album never matched), fetches the track listing again (Deezer's preview URLs expire after 15 minutes), downloads the clips it still needs into memory, embeds them and records each clip in the local clip cache. At the end it writes one new shard with the mean of each finished album's clips and updates `matches.csv`. An album whose clips did not change is not rewritten.

- Clips: the first track, then tracks spread evenly through the album, so an album's four clips are the first four of its eight. `--clips N` asks for N; without it the store's policy (`clips.per_album` in `manifest.json`) applies. A `--clips` run over the whole catalog that finishes makes N the policy. An album with fewer previews than N gets what there is. A run that left albums unfinished (a store not answering, an interruption, `--limit`, `--keys`) does not change the policy.
- Resuming: Ctrl-C or SIGTERM stops taking albums, lets the clips in flight finish (a few seconds; a wait between API retries ends at once) and writes the shard for the albums that finished. Running `sync` again continues; no clip is downloaded twice. `--limit N` stops after N albums, `--keys` takes album keys or slugs (a Spotify URI of before the rekey is understood).
- The clip cache (`.cache/audio/clips.sqlite`, gitignored) holds every clip's embedding, by album key. A cache written before 3 October 2026 knows the albums by their Spotify URI and was not rekeyed with the store: until it is, a sync finds none of its clips and downloads again what a top-up needs. `rmr_pipeline.keys.load_keys().legacy(key)` gives the URI such a cache knows an album by, `.current(uri)` the key. It is what lets a top-up from four to eight clips download only four. If it is lost nothing committed is lost; a top-up then downloads all eight. `python -m rmr_audio import-experiment` seeds it from the experiment's cache (only on the machine that ran the experiment) and, while the store still has its first shard, checks that those clips reproduce it exactly.
- Load: 2 worker processes by default (`--workers`), one thread each, at the lowest priority. Measured on an M-series laptop: about 2 clips a second, 600 to 770 MB per worker and 1.4 to 1.6 GB in all. The laptop must stay awake: a sleeping machine pauses the run and the preview URLs fetched before the sleep expire (those clips fail and the next sync fetches them); `caffeinate -i` in front of the command prevents idle sleep on macOS. No audio is written to disk beyond a temp file deleted right after decoding.
- Failures: API errors and Deezer's quota answer are retried with backoff (Deezer is asked at most 5 times a second, iTunes once every 3.2 seconds; four attempts per URL). A store that fails three URLs in a row is left alone for the rest of the run, and the albums that needed it are listed and left for the next run. A clip that cannot be downloaded or decoded is recorded with its status. A preview that is empty, too short or undecodable is final, and the next track in the clip order takes its place, so the album still gets its N clips when it has enough previews. A download that failed is tried again by the next sync; a fresh URL refused (HTTP 4xx) in two runs is final. An album with no usable clip stays out of the store and is listed at the end. A worker that crashes costs one clip.

**Matching.** The audio stage works on every row of `catalog/albums.csv`: the site's albums, then the chart's new ones by rank. An album that already has a row in `matches.csv` is not matched again.

*By link.* When the album's catalog row has a Deezer or an Apple Music link (the ones RYM lists), that listing is fetched by its id and accepted, with no search: the RYM community chose it. Deezer's link comes first. An Apple id only resolves in its own storefront, so it is asked for in the storefront the link names (`music.apple.com/jp/...` is `jp`), then in `us`; the source records the storefront that answered (`itunes:jp`). The listing is not verified. Its title and artist are compared with the album's native and Latin spellings, and `ambiguous` is set when either reads below the search's floors; the listing is kept either way. The edition rule then looks at the same artist's other listings of the same release in that store: a linked listing with more than 30 tracks or a bigger-edition marker (deluxe, expanded, box set...) gives way to the standard edition when there is one (15 minutes or longer, with previews), and a linked listing of one to three tracks gives way to a split edition of the same recording, the one with the most previews among those with more tracks whose total runtime is within 15% of the linked one. `edition` says `standard` or `split` when that happened. When the linked listing has no preview, the other store's link is tried, then the text search; if none has a preview the album is recorded with its linked listing and no clips.

*Flags.* `under_covered`: one to three preview windows for a listing of 15 minutes or more. `short_preview`: a preview shorter than 25 s from a track longer than 60 s. Neither store's API gives a preview's length, so the matcher leaves it empty; the embedder, which decodes the clips, sets it (`match.short_preview`). Two albums matched to one store listing are printed after a `sync` (`duplicate listing`; `audio_store.duplicate_listings`).

*Dry run.* `match-dry-run` matches a random sample of the new on-chart albums, stratified by rank, and writes `matches_dry_run.csv`, `summary.md` and `summary.json` into `--out`: counts by path, the no-preview, ambiguous and under-covered rates, what the edition rule did, duplicate listings, API errors, the distribution of preview windows and a projection of requests and time for all new albums. It reads store metadata only (no audio), writes neither the store nor `matches.csv`, asks Deezer every 0.35 s and iTunes every 3.4 s, and stops when a store stops answering. Its rates say what the stores list, not whether a listing is the right recording.

*The new albums.* `match-new` matches every catalog album that has no row in `matches.csv` and writes the rows, in catalog order, after the existing ones, which are written back unchanged. It reads store metadata only: no audio, no model. It works through the albums with a Deezer link, then those with an Apple link only, then those with no link (`--links-only` leaves these out; `--limit N` takes the first N). `matches.csv` is rewritten through a temporary file every 25 albums (`--save-every`), at the end and on Ctrl-C or SIGTERM, and the API responses are cached, so a killed run continues where it stopped and asks for nothing twice. It asks Deezer every 0.35 s and iTunes every 3.4 s (`--deezer-interval`, `--itunes-interval`), tries a URL twice, and stops (exit code 2, the reason in its last lines) when a store is marked down, refuses a URL twice for its rate (HTTP 403 or 429, Deezer's quota error) or has given five such answers in the run. It prints a progress line with an ETA every minute (`--progress-secs`; `--verbose` adds a line per album) and ends with the counts by path, the albums without a preview, the ambiguous and under-covered ones and the duplicate listings. An album with `skip` in `match_overrides.json` gets no row. The dry run projects about 11 hours for all 6,429 new albums, of which the 804 without a link take more than half.

```bash
nice -n 19 .venv-audio/bin/python -m rmr_audio match-new --links-only   # then again without --links-only
```

*By text search*, for an album with neither link (or whose linked listings have no preview). The catalog's Latin spellings and each name of an " & " credit are searched for as well, and `jp` is asked after the storefronts given. Deezer first; iTunes when Deezer has no match, a doubtful one, or previews for fewer than half the tracks. The iTunes storefronts are tried in order (`--storefronts`, by default `us,gb,de`): the first one as the fallback, each further one only while there is still no confident match with a preview. A probe of nine storefronts over the albums the US store lacks found 16 of them elsewhere, all of them in the British or the German store; pass others (`jp`, `br`, `pl`...) explicitly when wanted. Album ids are the same in every storefront. When a search finds the artist but not the album, the artist's album list is read as well (search misses albums the store has). The source is recorded as `deezer` or `itunes:<storefront>`. Albums recorded as unmatched are not looked at again unless `--retry-unmatched` is given (or the album is named in `--keys`). API responses are cached for 30 days in `.cache/audio/http.sqlite`; error answers are never cached. With `--retry-unmatched` a cached search older than a day is asked again, so a `match --retry-unmatched` followed the same day by `sync --retry-unmatched` asks only once.

What the matcher will not do by itself, and an override does: an album listed under another credit ("The Grand Wazoo" under Frank Zappa, not The Mothers), under another title ("Pappo's Blues, Vol. 3" for "Vol. 3"), or a classical recording listed with its composer in front ("Beethoven: Symphony No. 5" for "Symphonie Nr.5": the title alone does not say whose fifth it is, so this is checked by hand against the track list and the durations). Game soundtracks on Apple are mostly cover versions; two are kept out with `skip`.

**Match overrides** (`audio/match_overrides.json`, keyed by the album's key):

```json
{
  "Album45": { "source": "deezer", "album_id": "1261474", "note": "the match was a tribute album" },
  "Album974": { "source": "itunes:jp", "album_id": "826492492" },
  "sp:4Hbe1M0BDbgMwbw6Tw2fmD": { "skip": true, "note": "no store has the right recording" }
}
```

Precedence, highest first: `skip`; a folder given with `--local-dir`; a forced listing that is not yet the one in `matches.csv`; local audio already in the store; the listing in `matches.csv`. A forced listing replaces the album's embedding at the next sync (with or without `--retry-unmatched`), also when that embedding came from local files; if the forced listing has no preview the old embedding is removed. `skip` keeps the album out of matching, and an embedding it already has is removed at the next sync (the shard gets an entry with `n_clips` 0, and `compact` then forgets the album). This is how a wrong embedding is taken out: add `{"skip": true, "note": "..."}` and run `sync`. Every entry carries a `note` saying what was checked.

**Local files.** For an album no store has: put its files in `DIR/<album slug>/` (mp3, m4a, flac, wav, ogg, aiff; file-name order is track order) and run `sync --local-dir DIR`. `status --missing` prints the slugs as `slug<TAB>artist — title`. One excerpt per file: 30 seconds starting 30 seconds in, centred when the track is shorter than a minute, the whole file when it is shorter than 30 seconds (under 5 seconds is skipped). A folder takes precedence over the stores for that album, the source is recorded as `local`, and a later sync without `--local-dir` leaves the album alone. Adding, removing or replacing a file updates the album at the next `sync --local-dir`. The files are only read.

## Catalog and keys

An album's key is its RateYourMusic id (`Album45`), in the catalog table, the audio store, `matches.csv`, `match_overrides.json` and `transform.npz`. Until 3 October 2026 it was the feature table's Spotify URI; `audio/keys.csv` says which key each URI became, and the build and the audio stage find an album's store row through it. The Spotify id stays what the site links to.

| File | Contents |
|---|---|
| `catalog/albums.csv` | Every album, keyed by `rym_id`: the site's albums first, in their order (row number = album number on the site), then the chart's new albums by rank. `rank`, `on_chart`, `artist`, `title`, `artist_latin`, `title_latin`, `rym_artist`, `rym_title` (the sheet's spellings), `year`, `release_date`, `type`, genres, `top_descriptors`, the Spotify, Apple Music, Deezer, Bandcamp, YouTube and SoundCloud links RYM lists, `rym_url`, `legacy_uri`. |
| `audio/keys.csv` | `rym_id`, `legacy_uri`, `matched_by` (`spotify_id`, `artist_title_year`, `manual`, `none`), `doubt` (the reasons the album is in the doubtful list). One row per existing album, one key per row. |
| `catalog/doubtful_pairs.csv` | Old-to-new pairs to decide by hand, the undecided first: both sides' artist, title, year and links, the reason, and what the builder did (`default`: `paired` or `unpaired`). |
| `catalog/manifest.json` | The sheet export the catalog was built from (SHA-256, retrieval dates) and the counts. |

The catalog only grows. An existing album that is not on the chart stays, with `on_chart` 0. It has no RYM id until its page is read, so its key is the placeholder `sp:<Spotify album id>`. An existing album keeps the feature table's title and artist, because the site's slugs are made from them. The build still takes its albums and descriptors from the feature table. The audio stage reads every row of `catalog/albums.csv`, the new ones included (see Matching): a plain `rmr_audio sync` matches and embeds them.

```bash
cd data-pipeline
.venv-audio/bin/python -m rmr_catalog            # rewrites catalog/ and audio/keys.csv from the sheet export
.venv-audio/bin/python -m rmr_catalog --check    # writes nothing; fails when the committed files are stale
.venv/bin/python scripts/rekey_audio_store.py    # brings the store's keys to keys.csv; does nothing when they are current
```

The builder reads a CSV export of the sheet's "Top 10K Chart" tab (`experiments/audio_10k/cache/rym10k_sheet.csv` by default, not committed; `--sheet` for another), the feature table, `overrides.json` and the old scrape (for release years). It runs in the audio venv because it folds names with `rmr_audio/textnorm.py`. It uses no network.

**The pairing rule** (`rmr_catalog/pairing.py`). The sheet's own `in_recmyrecord` flag is not used. A chart row is an existing album when:

1. it links the album's Spotify id (the `s` of `overrides.json` where the URI is known to be another album) and the names do not contradict it: artist and title equal after folding; or both close and the release year equal; or title and year equal (a classical recording credited to the composer on one side, the performers on the other). An equal id with other names is not a match: the feature table gave "Silent Hill" the id of "Silent Hill 2".
2. otherwise, folded artist, folded title and release year are all equal. Artists are compared under each spelling (the bracketed romanisation, the sheet's `artist_latin`, the corrected artist of `overrides.json`). When no row has the album's artist, a row with the same title and year whose credit shares a billed name is taken ("Bob Marley & The Wailers" and "The Wailers") and listed.

Never a title alone across artists, never a title that extends another (a sequel, an edition, a live version), never a year that differs unless the Spotify id and the names agree. An album pairs with one row and a row with one album; when two candidates compete, or the Spotify id says one row and artist, title and year another, nothing is paired. The release year of an existing album comes from the scrape row with its artist and title; when two albums share those (two self-titled albums), the table's order, which is the scrape's, says which row it is.

**Deciding a doubtful pair, or giving an album its RYM id.** Edit the album's row of `audio/keys.csv`: put the right `rym_id` (or its placeholder, to say it is not that chart row) and set `matched_by` to `manual`. Then run the builder, which keeps rows set by hand and rewrites the catalog and the doubtful list around them, and `scripts/rekey_audio_store.py`, which renames the album in the store. A placeholder that became a RYM id is found by itself; when one RYM id replaces another, give the script the previous file (`git show HEAD:data-pipeline/audio/keys.csv > /tmp/keys.csv`, then `--previous /tmp/keys.csv`). When the album already had a row of its own in the catalog (the chart row was a new album), the builder drops that row; delete its row from `matches.csv` before the rekey, which refuses to give two rows one key. The one-pass clip cache is not committed and is brought along separately: write the renames and the dropped listings into `.cache/audio/pending_cache_rekey.csv` (`action`, `old_key`, `new_key`, `source`, `album_id`, `note`) and run `scripts/apply_cache_rekey.py`, which only counts until it is given `--apply` and does not start while a one-pass run holds the cache's lock. The script rewrites keys only: `tests/test_rekey.py` checks every album's store row (bit for bit) and audio block (exactly) against `tests/fixtures/audio_reference.npz`, recorded before the first rekey by `scripts/record_audio_reference.py`. Record that file again only after a change meant to move the blocks (a refit, a top-up, a corrected match).

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

`pytest` here runs `tests/` (the build). The tests of the audio stage and of the catalog builder are in `tests_audio/` and run with the audio venv (see The audio stage); `tests/test_audio_store.py`, `tests/test_keys.py` and `tests/test_rekey.py` pass in both.

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
- Some Spotify URIs in the feature table point at a different album. The verified ones are corrected in `overrides.json` (see Overrides). The album's key in the audio store is its RYM id, not the URI (see Catalog and keys).
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
