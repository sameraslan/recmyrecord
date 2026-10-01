# Running an experiment with the shared harness

Everything runs from this directory with the arm64 venv: `.venv/bin/python` (never the system `python3`).

```python
import features as F
import harness as H

d = H.get_data("maest:7", "mean")            # prints how many labelled rows per split have audio
# d["X_train"], d["Y_train"], d["rows_train"], d["X_val"], d["Y_val"], d["rows_val"]   (float32)
Xtr, Xva, scaler = F.standardize(d["X_train"], d["X_val"])     # scaler fitted on train only

S_val = my_model(Xtr, d["Y_train"]).predict(Xva)               # (n_val, 120), higher = more likely

H.evaluate_run("probe__maest7_ridge", S_val, d["rows_val"],
               config={"spec": d["spec"], "pooling": d["pooling"], "alpha": 10.0},
               n_train=len(d["rows_train"]), notes="optional free text")
H.leaderboard()
```

`run_reference.py` is a complete worked example (baselines, k-NN, logistic probe with in-train CV).

## Features (`features.py`)

| spec | meaning | dim |
|---|---|---|
| `effnet`, `heads`, `clap` | one vector per track | 1280 / 738 / 512 |
| `maest:7` | MAEST hidden state 7 (0 = patch embedding, 1–12 = blocks) | 768 |
| `mert:8` | MERT-v1 hidden state 8 (0 = CNN features, 1–12 = layers) | 768 |
| `mert_v2:16` | MERT-v2 block 16 (blocks are numbered 1–24) | 1024 |
| `mert_v2:12-20`, `mert:avg` | average of a layer range / of all transformer layers | |
| `maest:7+clap+heads` | concatenation, in the order written | sum |

- `F.album_features(spec, pooling)` → `(X, rows)`. Pooling over an album's tracks: `mean`, `mean+std`,
  `mean+std+max`. `F.feature_blocks(spec, pooling)` gives the column layout. `F.head_names()` names the
  738 `heads` columns.
- `F.track_features(spec)` → `(X [n, max_tracks, d], mask, rows)` for attention / multiple-instance models;
  `H.get_track_data(spec)` is the split version (`Xt_train`, `mask_train`, …).
- Albums with no finite track for a term (MERT-v2 can be NaN) are dropped for that spec; `get_data` returns
  them as `rows_val_missing`. `evaluate_run` wants scores for **all** of `H.eval_rows("val")`, so fill
  those rows with `H.complete_scores(S, rows, fill=H.train_prevalence(d["rows_train"]))`.
- Layer sweeps: call `F.precompute(["mert_v2:%d" % l for l in range(1, 25)], "mean")` once — one pass over
  the shards for all layers. Results are cached in `cache/pooled/` (float16, ~8 MB per 1024-d term at full
  size) and extended automatically when new shards appear. Disk is nearly full: do not cache more than you
  need (a full 24-layer `mean+std` sweep of MERT-v2 is ~370 MB), and delete `cache/pooled/<term>__*.npz`
  files you no longer use.
- **Shard snapshot.** Extraction may still be running. The shard list is frozen the first time a process
  touches it, so everything inside one process sees the same albums; `F.refresh()` re-reads it. Set
  `DESCRIPTOR_SHARD_LIMIT=<n>` to pin a process to the first n shards (to compare against an earlier run
  on exactly the same data).
- `Standardizer` / `standardize` / `l2_normalize` are the scaling helpers. Fit on train rows only.

## `H.evaluate_run(name, S_val, rows_val, *, config, notes="", downstream=True, calibration=None, n_train=None, strict=True)`

The one function every experiment calls. It writes `results/val/<name>.json`, replaces/appends the row in
`results/val_leaderboard.csv`, and saves the scores to `cache/scores/<name>__val.npy` (+ `_rows.npy`).

- **Names:** `<arm>__<short-description>`, e.g. `layers__mert_v2-16_mean`, `mlp__maest7+clap_h512`,
  `attn__mert8_4heads`. Letters, digits and `. + = , @ - _` only; no data-size suffix (the JSON and the
  leaderboard record `n_train`, `n_val`, `n_shards`). Re-using a name overwrites that run.
- **`config`** must hold everything needed to reproduce the run (spec, pooling, hyper-parameters, seed).
- **`n_train`**: pass `len(d["rows_train"])`.
- **Headline metric: capped precision@10 (`cP@10`)** = hits in the top 10 / min(10, number of true
  descriptors), averaged over albums (`metrics.capped_precision_at_k`, per-album array). Its ceiling is
  exactly 1.0, unlike P@10 (~0.83). `cP@5` and `perfect@10` (share of albums with cP@10 = 1) are stored
  next to it, and `H.leaderboard()` sorts by `cP@10`. `H.backfill_capped_precision()` (or
  `python harness.py --backfill`) adds these fields to older result files from the saved scores.
- **What it computes:** cP@10 / cP@5 / perfect@10, P/R/nDCG@10, mAP, macro/micro AUC, best/worst-15 labels;
  precision@1/3/5/10 (P@10 has an arithmetic ceiling of ~0.83); the
  precision–coverage curve (one global threshold over all album×descriptor pairs: precision at 0.5 … 10
  descriptors per album, and the largest average count with precision ≥ 0.90 / 0.80 / 0.70, plus the share
  of albums that get at least one descriptor there); the calibrated-count set (threshold such that the mean
  predicted count = the train mean count) and fixed k=10 set metrics; downstream recommendation overlap /
  inbound counts at the balanced and mood stops; the headline numbers without label-suspect rows.
- **Read the operating points honestly.** `precision_coverage.at_precision` picks the threshold on val and
  reports it on val: optimistic. `crossfit_at_precision` (threshold chosen on one half of val's artists,
  reported on the other) is the honest val number; the final test uses val-chosen thresholds
  (`H.transfer_threshold`).
- **`calibration`**: an optional function `(n,120) → (n,120)` applied before the cross-label threshold
  metrics (per-label Platt / isotonic, …). Fit it on train — on out-of-fold train scores — never on val.
- `downstream=False` skips the recommendation metrics (use it inside sweeps, then
  re-evaluate the configurations you keep with the default `downstream=True`).

Other helpers: `H.cv_folds(rows_train, n_splits=5)` (artist-group-disjoint folds inside train; a row keeps
its fold as more data arrives), `H.save_train_oof(name, S_oof, rows_train)` and `H.load_scores(name,
"val" | "train_oof")` for stacking, `H.eval_rows("val")`, `H.train_rows()`, `H.train_prevalence()`,
`H.precision_coverage`, `H.choose_threshold`, `H.apply_threshold`, `H.transfer_threshold`,
`H.rebuild_leaderboard()`, `probes.logreg_probe(d)`.

## Rules

1. **Never touch test.** No test features, labels or scores. `get_data`, `album_features` and
   `track_features` do not return test rows; the only route is `H.final_test`, which needs
   `DESCRIPTOR_FINAL_TEST=1`, logs every call to `results/test_invocations.log`, and is run once, at the
   end, by the project owner. Do not set that variable, do not call `common.split_rows("test")` to build
   anything, do not read `cache/embeddings.parquet` (it contains test rows).
2. **Fit nothing on validation.** Scalers, PCA, vocabularies, per-label calibration, thresholds, early
   stopping, model selection inside a run, ensembling weights: train only (use `H.cv_folds` and out-of-fold
   scores). Validation is for `evaluate_run`. The single exception is a step the harness itself labels as
   val calibration: the count-matching threshold inside `evaluate_run` (uses val scores, not val labels).
   Choosing between configurations by their val leaderboard row is what val is for — but say how many
   configurations you tried, and keep the sweep itself on the train CV folds where you can.
3. **Train on `d["rows_train"]`** (label-suspect rows are already removed). Do not add val rows, and do
   not use the 120 descriptor columns, RYM genres or anything derived from them as inputs.
4. **Same rows for everyone.** Score exactly `H.eval_rows("val")`. `strict=False` exists for debugging; the
   run is then flagged `subset-of-val` and is not comparable.
5. **Partial data.** While extraction runs, results are on a random subset of albums. Runs made on
   different shard snapshots are not comparable; the leaderboard shows `n_train` / `n_val` and warns when
   they differ. Re-run `run_reference.py` and your own runs once extraction has finished.
6. **Be gentle with the machine while `extract_embeddings.py` is running** (16 GB RAM, extraction needs
   ~7.5 GB, the disk is almost full): no parallel job pools, `torch.set_num_threads(2)`, CPU only (the GPU
   belongs to the extractor), no large new caches, one experiment process at a time per agent. Never
   start, stop or signal the extractor, and never write into `cache/tracks/`.
7. Do not edit `common.py`, `metrics.py`, `weights.py`, `downstream.py`, `splits.json`, `features.py` or
   `harness.py` from an experiment. If the harness is wrong, report it.

## Tests

`.venv/bin/python -m pytest test_harness.py -q` (synthetic inputs; writes nothing into `results/` or `cache/`).
