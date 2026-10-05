# Theme inputs

Two small files the site's theme build reads (`cd frontcreck && npm run theme`). They are copies of the
design analysis in `docs/design/trifid-theme/`, kept here so the build never reads from `docs/`.

| File | Contents | Source |
|---|---|---|
| `weights.json` | For every album, in `albums.json` order, six integer shares from 0 to 100: fierce, warm, quiet, dark, urban, neutral. `n` is the album count, `slugsHash` identifies the album list they were made for. | `album_weights` in `docs/design/trifid-theme/regions/colour.json` |
| `regions.json` | The named regions of each similarity stop: id, name, word, strength, level, n, priority, cx, cy, radius. Centres and radii are in the raw units of `positions.json`. `positionsHash` identifies the layouts they were made for. | Balanced: `docs/design/trifid-theme/regions/regions.json` (made by hand). Sonic and Mood: `docs/design/trifid-theme/scaling/out/regions_all.json`, level 1 regions with an approved place name |

Regenerate and check:

    cd data-pipeline
    .venv/bin/python -m rmr_pipeline.theme           # rewrite both files from the design sources
    .venv/bin/python -m rmr_pipeline.theme --check   # compare the committed files with the site data

`rmr_pipeline.build` does not call this module, and `rmr_pipeline.validate` does not look at these files.

## When these files go stale

They describe one album list and one set of layouts. When `albums.json` or `positions.json` change (the
preview audio work and any growth of the catalogue both change them), `--check` fails, and so does
the theme build. The order of work is then:

1. Rerun the colour and region analysis under `docs/design/trifid-theme/` (`regions/` and `scaling/`) on the new data.
2. `python -m rmr_pipeline.theme` to refresh the copies here.
3. `cd frontcreck && npm run theme` to bake the gas and `theme.json` again.

The region names are text a visitor reads on the map. A new or changed name needs the owner's approval
before it ships.
