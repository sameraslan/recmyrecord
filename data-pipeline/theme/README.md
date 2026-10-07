# Theme inputs

One small file the site's theme build reads (`cd frontcreck && npm run theme`). It is a copy of the
design analysis in `docs/design/trifid-theme/`, kept here so the build never reads from `docs/`.

| File | Contents | Source |
|---|---|---|
| `weights.json` | For every album, in `albums.json` order, six integer shares from 0 to 100: fierce, warm, quiet, dark, urban, neutral. `n` is the album count, `slugsHash` identifies the album list they were made for. | `album_weights` in `docs/design/trifid-theme/scaling/out/album_weights_10k.json` |

The first 4,081 albums have the weights the colour families were fitted with
(`docs/design/trifid-theme/regions/colour.json`). Every later album's weights are predicted from its clip
embedding and its first eight descriptors (`docs/design/trifid-theme/scaling/WEIGHTS-10K.md` says how
well). The families themselves are frozen and are never refitted by these steps.

Regenerate and check:

    cd docs/design/trifid-theme/scaling
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 10 ../../../../data-pipeline/.venv/bin/python run_weights10k.py
    cd ../../../../data-pipeline
    .venv/bin/python -m rmr_pipeline.theme           # rewrite weights.json from the design source
    .venv/bin/python -m rmr_pipeline.theme --check   # compare the committed file with the site data

`rmr_pipeline.build` does not call this module, and `rmr_pipeline.validate` does not look at this file.

## When the file goes stale

It describes one album list. When `albums.json` gains, loses or reorders albums, `--check` fails, and so
does the theme build. The order of work is then:

1. `run_weights10k.py` (above). It needs the feature table, `catalog/albums.csv` and the site's audio store,
   and scikit-learn. It prints the hold-out figures again; compare them with `WEIGHTS-10K.md`.
2. `python -m rmr_pipeline.theme` to refresh the copy here.
3. `cd frontcreck && npm run theme` to bake the gas and `theme.json` again.

`npm run theme` is also needed when only `positions.json` changes: the gas is drawn from the positions.
The weights do not depend on them.

There is no `regions.json` any more. Region names were removed from the site on 6 October 2026, and the
file only fed names into `theme.json`.
