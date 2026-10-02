# Preview-clip audio block: production design

- Date: 2026-10-02
- Status: in implementation
- Branch: `feat/preview-audio` (stacked on `experiment/preview-features`)
- Evidence: `experiments/preview_features/REPORT.md`

## Goal

The site's recommender vector is 13 Spotify audio columns plus 120 RYM descriptor columns. Spotify retired its audio features, so no album can be added. Replace the 13 columns with a 64-number block computed from 30-second preview clips, and make "audio for an album the catalog has not seen" a routine, resumable command.

Not in scope: how new albums get into the feature table (RYM descriptors) and into the map inputs (cover, sprite, cluster). Those are separate dependencies of the build, listed under "What still blocks catalog growth".

## Shape

Two stages with a small committed store between them.

```
audio stage (rare, heavy, needs network + Essentia)        build stage (fast, offline, deterministic)
  rmr_audio: match -> clips -> EffNet -> album mean   -->    rmr_pipeline: store + frozen transform -> audio block
  own venv (.venv-audio, Python 3.11, numpy<2)               -> matrix -> recs.json, positions.json
            writes data-pipeline/audio/                       existing venv; reads data-pipeline/audio/ only
```

The build never imports Essentia and never touches the network. Anyone can rebuild the site data from committed files.

## The store: `data-pipeline/audio/` (committed)

| File | Contents |
|---|---|
| `embeddings/part-NNNN.npz` | Append-only shards. Arrays: `keys` (album key, str), `emb` (float16, n × 1280: the album mean of per-clip Discogs-EffNet embeddings), `n_clips` (int16), `source` (str: `deezer`, `itunes:us`, `itunes:jp`, `local`). A key in a later shard supersedes earlier ones. |
| `manifest.json` | Model id and version, clip policy (clips per album, priority order), one entry per shard (file, albums, created, note). |
| `matches.csv` | One row per album key: source, source album id, matched title and artist, score, `ambiguous`, track count, clips available. Provenance, and the input that lets a re-extraction skip matching. |
| `match_overrides.json` | Hand corrections: key -> `{source, album_id}` to force a match, or `{skip: true}`. Read by the audio stage before searching. |
| `transform.npz` | The frozen transform: `mean` (1280), `components` (64 × 1280), `scale` (float), `target_total_variance` (float), plus fit metadata (date, album count, model id). |

- **Album key** is the feature table's `URI` value, the key the build already dedupes on. A future album with no Spotify release needs any unique string there.
- **Why album means, not clips, are committed:** 4,081 × 1,280 float16 is about 10 MB; per-clip embeddings are several times that and only needed to top up an album's clip count. Per-clip embeddings live in a local, gitignored cache (`data-pipeline/.cache/audio/clips.sqlite`). If the cache is lost, topping up re-downloads clips; nothing committed is lost.
- **Why shards:** adding 50 albums adds one small file instead of rewriting a 10 MB binary. `rmr_audio compact` rewrites the shards into one when wanted.

## The audio block (build stage)

`rmr_pipeline/audio.py`:

1. Load the store; resolve each album of the deduped frame to its newest embedding.
2. `block = ((e / ‖e‖) − mean) · componentsᵀ × scale`, float32, 64 columns. This is the experiment's D64.
3. Albums with no embedding get an imputed block from their mood neighbours (below).

`scale` was chosen at fit time so the block's total variance equals the Spotify block's on the fitted albums; the value is frozen in the file, so the slider stops keep their meaning and no later step needs the Spotify columns.

The matrix becomes `[audio block | descriptors / slider³]` (184 columns). Recommendations and layouts are computed exactly as before on that matrix: euclidean top 10, UMAP with the pinned parameters.

The live-site replica (`rec_matrix`, `live_recommend`, the In Rainbows test) stays as it is. It documents the old recommender and guards the descriptor side.

### Refitting

`python -m rmr_pipeline.audio fit` refits the PCA on the current store and rewrites `transform.npz`, scaling to the stored `target_total_variance`. It is explicit, never automatic: a refit moves about 5% of lists and every map position. Routine additions use the frozen transform (the experiment's holdout test: same coherence, 95% of the same lists).

### Albums without audio

137 albums have no preview on Deezer or the US iTunes store. Every album still needs a matrix row: the site requires a position and ten recommendations for each.

Their block is the mean of the blocks of their k nearest albums by descriptor distance, among albums that have audio. In words: until we have their audio, they sound like the records that share their mood. They stay in the catalog as seeds and as candidates. The implementation picks k (and whether to rescale the mean to a typical norm) by hiding the audio of albums that have it and measuring neighbour coherence and hubness; the numbers go in the pipeline README.

Ways to get real audio for them, in order:

1. Other iTunes storefronts (`itunes:jp`, `itunes:gb`, ...), tried automatically by the matcher.
2. Local files: `rmr_audio sync --local-dir DIR` reads `DIR/<album slug>/*` (mp3, m4a, flac, wav), takes one 30-second excerpt from each file starting 30 seconds in (or centred, for shorter tracks), and embeds it like a preview. `rmr_audio status --missing` prints the slugs to create.

Nothing on the site says which albums are imputed; the list is in the build log and `rmr_audio status`.

### Ranking

Plain euclidean at every stop, as today. Mutual-proximity ranking at the balanced stop (fewer hub albums, +0.012 primary-genre share) is implemented as an option, off by default: it makes lists differ from "nearest on the map", and it can be judged separately.

## The audio stage: `data-pipeline/rmr_audio/`

Ported from `experiments/preview_features/` and reduced to what the block needs (matching, clip download, EffNet; no scalar features, heads or MusiCNN).

```
python -m rmr_audio sync [--clips N] [--keys K,...] [--limit N] [--workers 2] [--local-dir DIR]
                         [--storefronts us,gb,jp,...] [--retry-unmatched] [--dry-run]
python -m rmr_audio status [--missing]
python -m rmr_audio compact
python -m rmr_audio import-experiment
```

- `sync` works on every album of the feature table that is missing from the store or has fewer than `--clips` clips: match (or reuse `matches.csv`), fetch fresh preview URLs, download each clip to memory, embed, record in the clip cache, and at the end write one new shard and update `matches.csv`. Resumable at clip level. No audio is written to disk beyond a temp file deleted after decoding.
- Clip choice: track 1, then tracks spread evenly through the album (the experiment's priority order), so 4 clips and 8 clips nest.
- Default 2 worker processes at low priority.
- As built: `--clips` defaults to the store's policy (`clips.per_album` in the manifest, 4 today), so a plain `sync` only adds missing albums and never starts a catalog-wide top-up by accident; a finished whole-catalog `--clips 8` run makes 8 the policy. The mean is over the album's clips of rank below `--clips`, not over every cached clip, so all albums follow one policy. Albums recorded as unmatched are searched again only with `--retry-unmatched`. Storefronts after the first are asked only while there is no match with a preview. `import-experiment` seeds the clip cache from the experiment.
- Its own `requirements-audio.txt` and venv, because the arm64 Essentia wheel needs `numpy<2` and Python 3.11 while the build pins numpy 2.5 on Python 3.12.

## Adding albums, end to end

1. The album's row is in the feature table (descriptors, key, title, artist).
2. `python -m rmr_audio sync` (audio venv). Check `rmr_audio status` for ambiguous or missing matches; fix with `match_overrides.json` or local files.
3. `python -m rmr_pipeline.build --map-root ...` (build venv).
4. Commit the new shard, `matches.csv` and the regenerated site data.

## What still blocks catalog growth (not solved here)

- No code produces new rows of `all_data_norm.pkl`; the descriptor weighting is undocumented. The descriptor-model experiment (PR 23) is the candidate source.
- An album must be in the personal-site map inputs to get a cover sprite and cluster id.
- The thumbnail sheet holds 4,096 albums; the catalog has 4,081.
- Site data URLs are not versioned: after a rebuild a returning visitor can hold a stale `positions.json` for up to 8 days while album pages carry new lists.

## Tests

- Store: round trip, supersede order, bad shard rejected.
- Block: shape, determinism, exact agreement with the experiment's D64 on the migrated albums, imputation.
- Build: a frame with NaN Spotify audio columns builds.
- Site-output tests stop pinning audio-dependent values. Mood-stop expectations stay pinned (audio barely matters there). Sonic and balanced expectations become data-driven: read from the built files, or assert invariants.
- `rmr_audio`: scoring and store-writing logic with recorded API fixtures; no network or Essentia in tests.

## Copy

The About panel says sound values come from Spotify and names energy, tempo, danceability and acousticness. That is no longer true after this change. Site copy needs the owner's sign-off, so this branch does not change it; the PR proposes wording.
