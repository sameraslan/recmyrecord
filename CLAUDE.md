# recmyrecord

Album recommendations from RateYourMusic's top chart: Euclidean nearest neighbours over audio features plus RYM descriptor weights. `frontcreck/` is the site, `data-pipeline/` builds its data (`data-pipeline/README.md`), `data-retrieval/` holds the source tables.

## Tasks

Work is tracked as GitHub issues on the `recmyrecord` GitHub Project board (Backlog, Todo, In progress, Needs answer, Final review, Done). The board is the only task list; do not keep task lists or statuses in this file or in memory. To create, start, move or list tickets, use the `board` skill (`.claude/skills/board/SKILL.md`). The repository is public, so nothing secret goes in an issue.

When you start a piece of work, pause on a question for Samer, or open its final PR, find its ticket (or create one) and move it to the matching column, even if the request did not mention a ticket.

## Writing for visitors

Any text a visitor reads on the site (messages, errors, empty states, labels) is friendly, plain and has some character. It says what still works and suggests a next step, for example "To enjoy the full exploration capabilities, open this page in an up-to-date Chrome, Firefox, Safari or Edge. :)" It avoids technical terms (not "WebGL", "context", "fetch") and does not blame the visitor. A typed `:)` is welcome (joined to the sentence with a non-breaking space so it never wraps alone); emoji are not. The strings live in `frontcreck/src/lib/copy.ts`, whose header lists the other copy rules (no dashes, no hype), and Samer signs copy off on the PR.

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
| Audio 10k | Why does CLAP keep Deezer-sourced and Apple-sourced albums apart, and what removes it? | `experiments/audio_10k/REPORT.md` | report and code on branch `feat/audio-10k` (open PR #31, which also changes pipeline code and waits for approval) |

To read code or newer notes that are only on a branch:

```bash
git fetch origin experiment/genre-crossing
git show origin/experiment/genre-crossing:experiments/preview_features/crossgenre.py
```

Open PR #25 (`feat/preview-audio`) is not an experiment. It changes the data pipeline and the site's data files to use the preview-clip audio block, so it waits for approval.

### Descriptor model in one paragraph

Single held-out test run, 2026-10-01: a language model listing descriptors from artist, title and year scores 0.79 capped precision@10; audio embeddings with a linear probe 0.66; audio plus MusicBrainz tags 0.69; always guessing the most common descriptors 0.44. The test split is spent. Ideas not yet run are in section 9 of the report.

### Audio 10k in one paragraph

CLAP read the encoding of a preview (Deezer's 128 kbit/s MP3 against Apple's AAC), so its lists did not cross stores. A stereo MP3 round trip before CLAP for every clip that is not from Deezer (`clap_mp3`) brings Deezer-sourced and Apple-sourced albums to about the genre make-up rate on the 10,235-album store (Deezer seeds 24.9% Apple neighbours against 26.7%, Apple seeds 35.0% against 34.8%; before, 2.3% and 91.7% for new seeds). YouTube-sourced albums are in lists as often as the others, though YouTube seeds still lean towards YouTube albums (31.2% against 20.9%), and a probe still reads the store at 0.893. Whole-catalog RYM-based proxies on stored vectors, 5 October 2026; no held-out split and nobody has listened.
