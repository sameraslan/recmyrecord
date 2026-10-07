# Experiments

How an experiment in this repo is started, run, written up, merged and referenced. `CLAUDE.md` at the repo root holds the index of experiments and the short version of these rules.

## 1. Before starting

- Read the index in `CLAUDE.md` and the `REPORT.md` of every related experiment. Do not re-run something a report already answers.
- Reuse what exists: the split, the metrics and the caches of the experiment you build on. Say in your report which ones you reused.
- Check each related report for a spent test split. A test split that has been scored once is not a clean test for a new idea; judge on validation or carve a fresh hold-out from training rows.

## 2. Creating one

- Branch from `main` as `experiment/<name>`.
- Everything goes in `experiments/<name>/`. An experiment only **adds** files. It does not edit `frontcreck/`, `data-pipeline/`, `data-retrieval/` or anything under `frontcreck/public/data/`.
- To use pipeline code, import it read-only (add `data-pipeline/` to `sys.path`). Do not copy it and do not change it.
- Ignore caches, virtual environments and model downloads in a `.gitignore` **inside the experiment folder**, not the root one. Editing the root `.gitignore` from several branches causes merge conflicts.
- Extending an existing experiment (a follow-up question on the same data) can live in the same folder with its own report, named `REPORT-<topic>.md`.

## 3. Running it

- Commit the split (for example `splits.json`) so every run uses the same one. Keep artists disjoint between splits.
- Fit and select on training data, compare on validation, score the test split once at the end and log that it was used.
- Never fetch rateyourmusic.com. Never commit audio; decode previews in memory and keep only embeddings, in the ignored cache.
- Run heavy local jobs one at a time, at low priority, and not alongside another session's heavy job. The laptop has 16 GB. Between 00:00 and 06:30 local time it is unattended and jobs may use more workers; make long jobs resumable so they can change pace by time of day.

## 4. Writing it up

Each experiment has a `REPORT.md` that someone who did not follow the work can act on. It contains:

1. **Verdict**: what works, how well, what to ship, the main caveats.
2. **Data, split, metrics**: including any data problems found.
3. **Experiments**: one subsection each, with what it is, what was tried, a result table and the takeaway.
4. **Final results**: the held-out numbers, each with its split and n.
5. **Limitations and ideas not run**: ranked, with what each would need.
6. **Reproducing**: commands in order, environment notes, a file map.

Also state where the large uncommitted caches live and how long they take to rebuild. Later findings go in a dated addendum section; do not rewrite earlier results.

## 5. Opening the PR

- Push the branch and open a draft PR. This needs no permission.
- In the same PR, add or update the experiment's row in the `CLAUDE.md` index.

## 6. Merging

The rule: **new files may be merged; changes to existing code may not, without Samer's approval.**

Check what a PR touches:

```bash
gh api repos/sameraslan/recmyrecord/pulls/<n>/files --paginate \
  -q '.[] | select(.status != "added") | "\(.status)\t\(.filename)"'
```

| What the PR contains | What to do |
|---|---|
| Only added files (under `experiments/`), plus the `CLAUDE.md` index row | Merge once its checks pass. No need to ask. |
| Added files plus edits to existing code, tests or site data | Leave it open for Samer. Bring the report and notes onto `main` in a separate documents-only PR so they can be read from any worktree. |
| Stacked on a PR that edits existing code | Same: documents-only PR to `main`; the code waits with its parent. |
| A pipeline or site change that follows from an experiment | Not an experiment. Use a `feat/` branch, cite the report, and wait for approval. |

Notes:

- Do not copy scripts onto `main` if they cannot run there (for example, they depend on an unmerged change). Leave them on the branch and record the branch in the index.
- A documents-only PR copies files unchanged from the experiment branch. Say in its description which branch they came from.
- `main` deploys production. Additions under `experiments/` do not change the site, but every merge triggers a build, so batch small document changes into one PR.
- After merging, pull `main` into any other open experiment branch before continuing work on it.

## 7. Referencing other experiments

- Cite by path and section, for example `experiments/descriptor_model/REPORT.md` section 5, so the reference works from any worktree.
- When one experiment depends on another's output (a cache, a split, a model), name the file and the commit or date it was produced.
- If a report's conclusion is overtaken by later work, add a dated note at the top of the older report pointing to the newer one.
- Keep the `CLAUDE.md` index current: one row per report, saying where the report is and, if the code is not on `main`, which branch holds it.
