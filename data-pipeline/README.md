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
2. Recommendations: the live recommender exactly (drop the 56 lyric and theme descriptors, divide the other 120 descriptor columns by `slider ** 3`, euclidean nearest neighbours) at three stops: sonic 5, balanced 1.765 (the original site's tuned default, a divisor of about 5.5), mood 0.5. Ten per album per stop, over the whole catalog. A test checks the live behaviour: "In Rainbows" at slider 0.5, over the same leading rows the live recommender searches (`LIVE_POOL`), returns Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom.
3. Layouts: UMAP (n_neighbors 15, min_dist 0.1, random_state 42) of the recommender's matrix at each stop, outliers softly compressed, sonic and mood Procrustes-aligned to balanced, scaled to [-1, 1], stacked points spread.
4. Artists: the feature table sometimes glues the member names onto the billed credit with no separator ("Bob Marley & The WailersBob MarleyThe Wailers"). `artists.py` keeps the billed credit: it cuts at the first case or script boundary inside a word when the text before it joins several names ("&", ",", "/", "and", "with", ...) and the glued-on tail repeats one of them. Whitespace is collapsed. Every string it changes in the feature table is listed in `tests/test_artists.py`.
5. Slugs: `kebab(title)-kebab(artist)` from the cleaned artist, ASCII-folded (Cyrillic transliterated), `-2`, `-3` on collision in catalog order.
6. Vocabulary: kept descriptors minus vocals descriptors, "instrumental" and "concept album", most frequent first.
7. Sprites: each album's map sprite re-packed in album order; ambient colours from the sprite plus an accent with at least 4.5:1 contrast on `#15110d`. The two washes are the leading colour and the next one of a clearly different hue (or, on a cover with one hue or none, a clearly lighter or darker one), made dark and muted with saturation taken from the colour's chroma so grey covers stay grey; the more visible of the two comes first. The constants in `colors.py` were tuned against the hand-picked pairs of the design mockup.

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

Only the Spotify link, the cover, the sprites, the ambient colours and (for `a`) the artist and slug change. All 19 corrections of the list match an album in this catalog. Positions and recommendations still use the wrong album's audio features, because Spotify no longer serves audio features to refetch them.

## Known data problems (documented, not fixed)

- 34 Spotify URIs in the feature table are assigned to two or three different albums (69 rows). The pipeline keeps the first row and drops the other 35.
- Some Spotify URIs in the feature table point at a different album. The verified ones are corrected in `overrides.json` (see Overrides); their positions and recommendations still come from the wrong album's features.
- "One" by Neal Morse shows a Neal Francis sleeve. Unverified, so not corrected.
- "Chill Out" (The KLF), "Gimix" (The Avalanches) and "Dark & Long" (Underworld) have no Spotify release, so they have no Spotify id and no cover id. The site shows no Spotify link for an album with an empty Spotify id. Their sprites and ambient colours use the corrected cover, but the site's cover component shows a cover id's image, then the sprite only when that image fails, so with no cover id it shows the typographic tile, not the sprite.
- "Spiritual Unity" (Albert Ayler Trio) has no cover; the site shows a typographic tile.
- 73 albums have no mood descriptors and 2,169 have fewer than ten.
- The feature table has 176 descriptor columns (the design spec says 175).
- Cluster ids come from the map pipeline and are unbalanced (three clusters hold almost every album); the site only uses them for dot colours.
- Artist cleaning only drops a glued tail that repeats a name from the credit. A credit glued to an unrelated name, or to member names spelled too differently, would stay as it is; none is known in the current table. The member names in the dropped tail are not kept.
- The catalog is frozen because Spotify no longer serves audio features.
