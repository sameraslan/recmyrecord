"""Register the reference runs on the validation leaderboard, on whatever shards exist right now.

    .venv/bin/python run_reference.py                  # everything (re-run any time: rows are replaced)
    .venv/bin/python run_reference.py --no-downstream  # faster
    .venv/bin/python run_reference.py --only baseline knn

Runs (all scored on harness.eval_rows("val") = labelled val rows with audio):
  baseline__most_frequent             train prevalence, from the SAME train rows the embedding models get
  baseline__genre_mean_all            shrunk RYM-genre label means (all listed genres), same train rows.
                                      Upper-ish reference: RYM genres will not exist for new albums.
  baseline__*_fulltrain               the two above fitted on ALL train rows (does not depend on how far
                                      extraction is; equals the plain version once extraction is done)
  knn__<enc>_k<k>                     baselines.knn_label_transfer, cosine on train-standardised features,
                                      similarity-weighted votes of binary labels
  logreg__<enc>                       probes.logreg_probe (C from in-train CV); OOF train scores are saved
Rows a spec has no features for (no valid track) get the train prevalence (harness.complete_scores).
"""
from __future__ import annotations

import argparse
import time

import numpy as np

import features as F
import harness as H
from baselines import genre_lists, genre_mean_scores, knn_label_transfer, most_frequent_scores
from common import YB, label_suspect_rows, split_rows
from probes import DEFAULT_CS, logreg_probe

KNN_SPECS = ("effnet", "clap", "maest:7")
KNN_KS = (5, 20, 50)


def tag(spec: str) -> str:
    return spec.replace(":", "-")


def run_baselines(downstream: bool) -> None:
    rows_va = H.eval_rows("val")
    full = np.setdiff1d(split_rows("train"), label_suspect_rows())
    for suffix, rows_tr in (("", H.train_rows()), ("_fulltrain", full)):
        cfg = {"fit_rows": "train rows with audio" if not suffix else "all train rows", "label_suspect_train_dropped": True,
               "n_train": int(len(rows_tr))}
        S = most_frequent_scores(YB[rows_tr], len(rows_va))
        H.evaluate_run(f"baseline__most_frequent{suffix}", S, rows_va, config={"model": "train prevalence", **cfg},
                       downstream=downstream, notes="label-only floor")
        tl, el = genre_lists(rows_tr), genre_lists(rows_va)
        Sg = genre_mean_scores(tl, YB[rows_tr], el)
        no_genre = np.array([len(x) == 0 for x in el])
        Sg[no_genre] = S[no_genre]
        H.evaluate_run(f"baseline__genre_mean_all{suffix}", Sg, rows_va, downstream=downstream,
                       config={"model": "genre_mean_scores, all listed RYM genres, shrinkage m=5", **cfg,
                               "val_rows_without_genre": int(no_genre.sum())},
                       notes="uses RYM genres: not available for new albums")


def _full(S: np.ndarray, d: dict) -> tuple[np.ndarray, np.ndarray]:
    if len(d["rows_val_missing"]) == 0:
        return S, d["rows_val"]
    return H.complete_scores(S, d["rows_val"], fill=H.train_prevalence(d["rows_train"]))


def run_knn(downstream: bool) -> None:
    for spec in KNN_SPECS:
        d = H.get_data(spec, "mean")
        Xtr, Xva, _ = F.standardize(d["X_train"], d["X_val"])
        for k in KNN_KS:
            S = knn_label_transfer(Xtr, d["Y_train"] > 0, Xva, k=k, weighting="similarity")
            S, rows = _full(S, d)
            H.evaluate_run(f"knn__{tag(spec)}_k{k}", S, rows, downstream=downstream, n_train=len(d["rows_train"]),
                           config={"model": "knn_label_transfer", "spec": d["spec"], "pooling": "mean", "k": k,
                                   "weighting": "similarity", "metric": "cosine", "standardised": True,
                                   "val_rows_filled_with_prevalence": int(len(d["rows_val_missing"]))})


def run_logreg(downstream: bool) -> None:
    for spec in F.DEFAULT_SPECS:
        d = H.get_data(spec, "mean")
        t0 = time.perf_counter()
        out = logreg_probe(d)
        fit_s = time.perf_counter() - t0
        name = f"logreg__{tag(spec)}"
        H.save_train_oof(name, out["S_oof"], out["rows_oof"])
        S, rows = _full(out["S_val"], d)
        H.evaluate_run(name, S, rows, downstream=downstream, n_train=len(d["rows_train"]),
                       config={"model": "one-vs-rest L2 logistic regression (probes.logreg_probe)", "spec": d["spec"],
                               "pooling": "mean", "C": out["best_C"], "C_grid": list(DEFAULT_CS), "cv": out["cv"],
                               "cv_folds": out["n_folds"], "cv_criterion": "out-of-fold nDCG@10 on train",
                               "standardised": True, "fit_seconds": round(fit_s, 1),
                               "val_rows_filled_with_prevalence": int(len(d["rows_val_missing"]))})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-downstream", action="store_true")
    ap.add_argument("--only", nargs="*", choices=["baseline", "knn", "logreg"], default=["baseline", "knn", "logreg"])
    a = ap.parse_args()
    ds = not a.no_downstream
    print(f"{F.n_shards()} shards, {len(F.album_index())} of {F.n_matched_albums()} matched albums; "
          f"train rows {len(H.train_rows())}, val rows {len(H.eval_rows('val'))}")
    F.precompute(F.DEFAULT_SPECS, "mean")
    if "baseline" in a.only:
        run_baselines(ds)
    if "knn" in a.only:
        run_knn(ds)
    if "logreg" in a.only:
        run_logreg(ds)
    print()
    H.leaderboard()


if __name__ == "__main__":
    main()
