# recmyrecord

Album recommendations from RateYourMusic's top chart: Euclidean nearest neighbours over audio features plus RYM descriptor weights. `frontcreck/` is the site, `data-pipeline/` builds its data (`data-pipeline/README.md`), `data-retrieval/` holds the source tables.

## Experiments

The full cycle (starting, running, writing up, merging, referencing) is in `experiments/README.md`. Read it before starting or merging an experiment. The rules in short:

- **Read first.** Before proposing or re-running an experiment, read the reports in the index below.
- **Add, don't edit.** An experiment lives in `experiments/<name>/` on an `experiment/<name>` branch and only adds files. It does not change `frontcreck/`, `data-pipeline/`, `data-retrieval/` or the site's data files.
- **Write a `REPORT.md`.** It is the record: verdict, results with split and n, limitations, ideas not run, how to reproduce.
- **Merging.** New files may be merged once checks pass, without asking. Changes to existing code, tests or site data wait for Samer's approval. If a PR mixes the two, or is stacked on one that edits existing code, bring its report and notes onto `main` in a documents-only PR and leave the rest open.
- **Keep this index current.** Add or update the experiment's row in the same PR.
- **Spent test splits stay spent.** If a report says its test split was used, judge new ideas on validation or a fresh hold-out.

### Index

| Experiment | Question | Report | Code |
|---|---|---|---|
| Descriptor model | Can we predict an album's RYM descriptors for new albums without scraping? | `experiments/descriptor_model/REPORT.md` | on `main` |
| Preview features | Can preview-clip embeddings replace Spotify audio features? | `experiments/preview_features/REPORT.md` | on `main` |
| Genre crossing | Can the sonic slider stop cross genres? | `experiments/preview_features/REPORT-genre-crossing.md` | scripts on `main`; the newer report and the `common.py` change are on branch `experiment/genre-crossing` (open PR #26, stacked on #25), see `experiments/preview_features/NOTE-genre-crossing-code.md` |

To read code or newer notes that are only on a branch:

```bash
git fetch origin experiment/genre-crossing
git show origin/experiment/genre-crossing:experiments/preview_features/crossgenre.py
```

Open PR #25 (`feat/preview-audio`) is not an experiment. It changes the data pipeline and the site's data files to use the preview-clip audio block, so it waits for approval.

### Descriptor model in one paragraph

Single held-out test run, 2026-10-01: a language model listing descriptors from artist, title and year scores 0.79 capped precision@10; audio embeddings with a linear probe 0.66; audio plus MusicBrainz tags 0.69; always guessing the most common descriptors 0.44. The test split is spent. Ideas not yet run are in section 9 of the report.
