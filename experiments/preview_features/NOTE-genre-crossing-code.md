# Genre-crossing code on `main`: what is here and what is not

Written 2026-10-04. The genre-crossing experiment lives on branch `experiment/genre-crossing` (draft PR #26), which is stacked on `feat/preview-audio` (PR #25). PR #25 changes the data pipeline and the site's data, so neither can be merged yet. This note records which of the experiment's files were copied onto `main`, unchanged, from commit `5a8f330d` of that branch, and what still needs the branch.

## Copied onto `main`

| File | What it is |
|---|---|
| `crossgenre.py` | The benchmark: builds candidates, scores them, writes `results/crossgenre.{md,json}` |
| `crossgenre_listen.py` | Writes `results/crossgenre_listening.json` |
| `crossgenre_page.py`, `crossgenre_page.template.html` | Build the listening page from that JSON |
| `clap_catalog.py` | CLAP embeddings for the catalog's preview clips |
| `graphdef.py` | Reads the Discogs head out of the EffNet graph |
| `test_crossgenre.py` | Toy-fixture checks of the masks, floors and MMR |
| `results/crossgenre.json`, `results/crossgenre_listening.json` | Results of the 3 October run (CLAP on the full catalog) |
| `results/rym10k_sheet_audit.md`, `results/solutions_audio_gaps.md`, `results/solutions_scaling_10k.md` | Notes |

## Still only on the branch

Three files that already exist on `main` are newer on the branch. They were not copied, because that would change existing files:

- `REPORT-genre-crossing.md`, `results/crossgenre.md` and `crossgenre_findings.md`. The versions on `main` predate the full-catalog CLAP run. The branch versions carry the later verdict (CLAP is the pick) and its tables. The two JSON files above belong to the branch versions, so their numbers go further than the report on `main`.
- `common.py`. The branch adds the `RMR_PREVIEW_CACHE` environment variable, which points the scripts at another worktree's cache.
- The root `.gitignore`. The branch ignores `experiments/preview_features/cache_clap/` and `experiments/preview_features/scratch/`.

## What this means for running the scripts from `main`

Every module the scripts import is on `main` with the same content as on the branch (`simbench`, `evaluate`, `genres`, `variants`, `aggregate`, `learned`, `bakeoff_eval`, `rmr_pipeline.constants`, `rmr_pipeline.artists`). They compile and import. The differences are these:

- `RMR_PREVIEW_CACHE` is ignored. `common.py` on `main` always reads `experiments/preview_features/cache/` in the current worktree. The reproduce line in `REPORT-genre-crossing.md` and the docstring of `crossgenre.py` both mention the variable; on `main` the cache has to be in (or linked into) the worktree instead.
- `clap_catalog.py run` reads the pipeline's clip cache, by default `data-pipeline/.cache/audio/clips.sqlite`. That file is written by `rmr_audio`, which PR #25 adds. On `main` nothing creates it; pass `--source` or set `RMR_CLIPS_DB` to an existing one.
- `crossgenre.py` with pool `fullclap` or `fullclap2` needs `cache_clap/clap_clips.sqlite`, which only `clap_catalog.py run` produces.
- `cache_clap/` and `scratch/` are not ignored on `main`. Running the scripts leaves them as untracked files. Do not commit them.
- `test_crossgenre.py`, `crossgenre_page.py` and `graphdef.py` (given the EffNet model file in the cache) need nothing from the branch.

## Reading the branch

```bash
git fetch origin experiment/genre-crossing
git show origin/experiment/genre-crossing:experiments/preview_features/REPORT-genre-crossing.md
git show origin/experiment/genre-crossing:experiments/preview_features/common.py
```

To run with the cache override, check the branch out in a worktree: `git worktree add ../genre-crossing origin/experiment/genre-crossing`.
