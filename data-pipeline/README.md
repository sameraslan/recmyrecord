# recmyrecord data pipeline

Builds every file the site serves from `frontcreck/public/data/`. The outputs are committed, so the site builds without this pipeline or its inputs.

## Inputs (read-only)

- `data-retrieval/Recommender/data/all_data_norm.pkl`: the recommender's feature table (4,000+ rows in catalog-rank order; `Title`, `Artist`, `URI`, `Descriptor Count`, 13 min-max audio features, 176 descriptor columns). Override with `--table`.
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
2. Recommendations: the live recommender exactly (drop the 56 lyric and theme descriptors, divide the other 120 descriptor columns by `slider ** 3`, euclidean nearest neighbours) at three stops: sonic 5, balanced 2.0, mood 0.5. Ten per album per stop, over the whole catalog. A test checks the live behaviour: "In Rainbows" at slider 0.5, over the same leading rows the live recommender searches (`LIVE_POOL`), returns Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom.
3. Layouts: UMAP (n_neighbors 15, min_dist 0.1, random_state 42) of the recommender's matrix at each stop, outliers softly compressed, sonic and mood Procrustes-aligned to balanced, scaled to [-1, 1], stacked points spread.
4. Slugs: `kebab(title)-kebab(artist)`, ASCII-folded (Cyrillic transliterated), `-2`, `-3` on collision in catalog order.
5. Vocabulary: kept descriptors minus vocals descriptors, "instrumental" and "concept album", most frequent first.
6. Sprites: each album's map sprite re-packed in album order; ambient colours from the two dominant colours of the sprite (darkened, desaturated) plus an accent with at least 4.5:1 contrast on `#15110d`.

## Commands

```bash
python3.11 -m venv data-pipeline/.venv
data-pipeline/.venv/bin/pip install -r data-pipeline/requirements.txt
cd data-pipeline
.venv/bin/python -m rmr_pipeline.build --map-root /path/to/music_map   # about 1 to 2 minutes
.venv/bin/python -m rmr_pipeline.validate                               # checks every output against the contract
.venv/bin/python -m pytest
RMR_MAP_ROOT=/path/to/music_map .venv/bin/python -m pytest   # also compares sprites with the map's atlases
```

`--skip-images` is a faster development run that keeps the fallback ambient colours and writes no sprite sheets. It needs an explicit `--out` folder so it never overwrites the committed `albums.json`; check that folder with `.venv/bin/python -m rmr_pipeline.validate --data <folder> --no-images`.

UMAP output depends on the exact versions of umap-learn, pynndescent and numba; keep `requirements.txt` pinned so the layouts stay reproducible.

## Overrides

`overrides.json` maps a slug to corrections: `c` (cover id), `s` (Spotify album id), `image` (path to a replacement cover image, relative to this folder, used for the sprites and ambient colours) and `note` (why). Example:

```json
{ "blue-joni-mitchell": { "c": "<cover id>", "s": "<22-character album id>", "image": "overrides/blue.jpg", "note": "Spotify URI points at a tribute album" } }
```

It ships empty because no correction can be verified from the data on disk.

## Known data problems (documented, not fixed)

- 34 Spotify URIs in the feature table are assigned to two or three different albums (69 rows). The pipeline keeps the first row and drops the other 35.
- Some covers are wrong because the Spotify URI itself is wrong. For example Joni Mitchell, "Blue" shows a tribute album. The URI is the same in every source on disk, so the fix needs a verified id added to `overrides.json`.
- "Spiritual Unity" (Albert Ayler Trio) has no cover; the site shows a typographic tile.
- 73 albums have no mood descriptors and 2,169 have fewer than ten.
- The feature table has 176 descriptor columns (the design spec says 175).
- Cluster ids come from the map pipeline and are unbalanced (three clusters hold almost every album); the site only uses them for dot colours.
- The catalog is frozen because Spotify no longer serves audio features.
