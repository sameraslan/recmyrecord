# recmyrecord

Album recommendations from RateYourMusic's top chart: Euclidean nearest neighbours over audio features plus RYM descriptor weights. `frontcreck/` is the site, `data-pipeline/` builds its data (`data-pipeline/README.md`), `data-retrieval/` holds the source tables.

## Experiments: where the results are

Before proposing or re-running an experiment, read its report. Each experiment lives in `experiments/<name>/` and its `REPORT.md` is the record of what was tried and what was found.

Merged experiments are on `main`. One report still lives on an open branch; read it without checking the branch out:

```bash
git fetch origin <branch>
git show origin/<branch>:<report path>
```

| Experiment | Question | Report | Where |
|---|---|---|---|
| Descriptor model | Can we predict an album's RYM descriptors for new albums without scraping? | `experiments/descriptor_model/REPORT.md` | `main` (merged in #23) |
| Preview features | Can preview-clip embeddings replace Spotify audio features? | `experiments/preview_features/REPORT.md` | `main` (merged in #24) |
| Genre crossing | Can the sonic slider stop cross genres? | `experiments/preview_features/REPORT-genre-crossing.md` | branch `experiment/genre-crossing`, open PR #26 (stacked on #25) |

Open PR #25 (`feat/preview-audio`) is not an experiment: it changes the data pipeline to use the preview-clip audio block.

Descriptor model, in one paragraph (single held-out test run, 2026-10-01): a language model listing descriptors from artist, title and year scores 0.79 capped precision@10; audio embeddings with a linear probe 0.66; audio plus MusicBrainz tags 0.69; always guessing the most common descriptors 0.44. The test split is spent, so judge new ideas on validation. Untested follow-ups are listed in section 9 of the report.

When an experiment PR merges, or a new experiment starts, update this table in the same PR.
