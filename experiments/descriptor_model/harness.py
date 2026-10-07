"""Shared experiment harness: same data, same split, same metrics for every model. Read EXPERIMENTS.md.

    import harness as H
    d = H.get_data("maest:7", "mean")                    # train / val features + labels (never test)
    ... fit on d["X_train"], d["Y_train"]; S_val = scores for d["X_val"] (n_val x 120, higher = more likely)
    H.evaluate_run("probe__maest7_logreg", S_val, d["rows_val"], config={...}, n_train=len(d["rows_train"]))
    H.leaderboard()

Outputs
    results/val/<name>.json          config, metrics, counts, timestamp
    results/val_leaderboard.csv      one row per run name (replaced when a name is evaluated again)
    cache/scores/<name>__val.npy     the score matrix (+ <name>__val_rows.npy), for stacking / ensembling
    cache/scores/<name>__train_oof.npy   out-of-fold train scores (save_train_oof)
    results/test/<name>.json, results/test_invocations.log     only through final_test

Test guard: the only way to get test features or test metrics is final_test(), which needs the environment
variable DESCRIPTOR_FINAL_TEST=1 and logs every call (also refused ones).
"""
from __future__ import annotations

import csv
import fcntl
import json
import os
import re
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Callable

import numpy as np

import features as F
import metrics as M
from common import DESCRIPTORS, HERE, LABELLED, N_DESC, N_ROWS, SEED, Y, label_suspect_rows, load_splits, split_rows
from weights import calibrate_threshold, scores_to_weights

RESULTS_DIR = HERE / "results"
SCORES_DIR = HERE / "cache" / "scores"
TEST_ENV = F.TEST_ENV

COUNTS = (0.5, 1, 2, 3, 4, 5, 7, 10)     # average descriptors emitted per album on the precision-coverage curve
TARGETS = (0.90, 0.80, 0.70)             # precision operating points
KS = (1, 3, 5, 10)
CAPPED_KEYS = ("cP@10", "cP@5", "perfect@10")   # capped precision (ceiling 1.0): the headline metric
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.+=,@-]*(?:_[A-Za-z0-9.+=,@-]+)*__[A-Za-z0-9_.+=,@-]+$")

LEADERBOARD_COLUMNS = [
    "name", "n_train", "n_val", "n_shards", "cP@10", "nDCG@10", "P@10", "mAP", "P@1", "P@3", "P@5", "cP@5", "perfect@10",
    "R@10", "macro_auc",
    "cnt@p90", "cnt@p80", "cnt@p70", "cov@p90", "cov@p80", "xfit_p@p90", "xfit_cnt@p90", "P@mean_count",
    "calib_prec", "calib_recall", "bal_ov10", "bal_ov10_med", "mood_ov10", "mood_ov10_med", "bal_ov10_thr", "mood_ov10_thr",
    "bal_inbound_ratio", "mood_inbound_ratio", "bal_zero_inbound", "mood_zero_inbound", "sonic_ov10",
    "P@10_nosuspect", "cP@10_nosuspect", "val_coverage", "partial_data", "timestamp", "notes",
]


def _val_dir() -> Path:
    return RESULTS_DIR / "val"


def _test_dir() -> Path:
    return RESULTS_DIR / "test"


def _leaderboard_path() -> Path:
    return RESULTS_DIR / "val_leaderboard.csv"


def _test_log() -> Path:
    return RESULTS_DIR / "test_invocations.log"


# ---------------------------------------------------------------- rows, groups, folds

@lru_cache(maxsize=1)
def assert_shared_albums_share_split() -> int:
    """Table rows that map to the same source album (identical audio features) must be in the same split.
    Returns the number of source albums shared by more than one row. Raises AssertionError otherwise."""
    rt = F.row_table()
    split = load_splits()
    shared = 0
    for key, g in rt.groupby("album_key"):
        if len(g) > 1:
            shared += 1
            s = {split[r] for r in g.row.to_numpy() if split[r] != "none"}
            assert len(s) <= 1, f"source album {key} is shared by rows {g.row.tolist()} in different splits {s}"
    return shared


def eval_rows(split: str = "val") -> np.ndarray:
    """The canonical evaluation rows of a split: labelled rows that have track embeddings in the current
    shard snapshot. Every run must be scored on exactly these rows (evaluate_run checks it)."""
    if split not in ("train", "val", "test"):
        raise ValueError(split)
    if split == "test":
        F.require_test_env("eval_rows('test')")
    return np.intersect1d(split_rows(split), F.available_rows())


def train_rows(drop_label_suspect: bool = True) -> np.ndarray:
    """Train rows with audio (current snapshot), without the label-suspect rows by default."""
    rows = eval_rows("train")
    return np.setdiff1d(rows, label_suspect_rows()) if drop_label_suspect else rows


@lru_cache(maxsize=1)
def artist_groups() -> np.ndarray:
    """Artist-group id per table row (-1 for unlabelled rows): the connected components split.py used to
    build the split (computed over all labelled rows, so it does not depend on which rows have audio)."""
    from split import build_groups

    rows = np.flatnonzero(LABELLED)
    groups, _ = build_groups(rows)
    out = np.full(N_ROWS, -1, dtype=int)
    out[rows] = groups
    return out


@lru_cache(maxsize=8)
def train_fold_ids(n_splits: int = 5, seed: int = SEED) -> np.ndarray:
    """Fold id (0..n_splits-1) per table row for TRAIN rows, -1 elsewhere. Folds are artist-group-disjoint
    and stratified by genre family (split.strat_labels), and are defined over ALL train rows, so a row
    keeps its fold when more shards arrive."""
    from sklearn.model_selection import StratifiedGroupKFold

    from split import strat_labels

    rows = split_rows("train")
    groups = artist_groups()[rows]
    out = np.full(N_ROWS, -1, dtype=int)
    sgkf = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    for f, (_, idx) in enumerate(sgkf.split(np.zeros(len(rows)), strat_labels(rows), groups)):
        out[rows[idx]] = f
    return out


def cv_folds(rows_train: np.ndarray, n_splits: int = 5, seed: int = SEED) -> list[tuple[np.ndarray, np.ndarray]]:
    """Artist-group-disjoint CV folds INSIDE train: list of (fit_idx, heldout_idx) index arrays into
    `rows_train`. Use for hyper-parameter choice and out-of-fold train scores. Folds that have no row among
    `rows_train` (possible on small partial data) are left out."""
    rows_train = np.asarray(rows_train, dtype=int)
    fold = train_fold_ids(n_splits, seed)[rows_train]
    assert (fold >= 0).all(), "cv_folds takes TRAIN rows only"
    g = artist_groups()[rows_train]
    out = []
    for f in range(n_splits):
        held = np.flatnonzero(fold == f)
        fit = np.flatnonzero(fold != f)
        if len(held) == 0 or len(fit) == 0:
            continue
        assert not set(g[held]) & set(g[fit]), "artist group in two folds"
        out.append((fit, held))
    return out


# ---------------------------------------------------------------- data

def _counts(feature_rows: np.ndarray) -> dict:
    split = load_splits()
    avail = F.available_rows()
    out = {}
    for s in ("train", "val", "test"):
        rows = split_rows(s)
        with_audio = np.intersect1d(rows, avail)
        out[s] = {"labelled": int(len(rows)), "with_audio": int(len(with_audio)), "without_audio": int(len(rows) - len(with_audio))}
        if s != "test":
            out[s]["with_features_for_spec"] = int((split[feature_rows] == s).sum())
    return out


def _print_counts(c: dict, n_suspect_dropped: int, head: str) -> None:
    print(f"[harness] {head}: {F.n_shards()} shards, {len(F.album_index())} of {F.n_matched_albums()} matched albums extracted")
    for s in ("train", "val", "test"):
        d = c[s]
        extra = f", {d['with_features_for_spec']} with features for this spec" if "with_features_for_spec" in d else " (withheld)"
        print(f"[harness]   {s:5s}: {d['labelled']} labelled rows, {d['with_audio']} with audio, {d['without_audio']} without{extra}")
    if n_suspect_dropped:
        print(f"[harness]   train: {n_suspect_dropped} label-suspect rows dropped")


def _assemble(rows: np.ndarray, drop_label_suspect_train: bool) -> tuple[np.ndarray, np.ndarray, int]:
    split = load_splits()[rows]
    tr = np.flatnonzero(split == "train")
    n_drop = 0
    if drop_label_suspect_train:
        keep = ~np.isin(rows[tr], label_suspect_rows())
        n_drop = int((~keep).sum())
        tr = tr[keep]
    return tr, np.flatnonzero(split == "val"), n_drop


def get_data(spec: str, pooling: str = "mean", *, drop_label_suspect_train: bool = True, verbose: bool = True) -> dict:
    """Train and validation matrices for one feature spec (see features.py for the grammar).

    Returns X_train, Y_train, rows_train, X_val, Y_val, rows_val (float32; Y = rank weights, >0 = present;
    rows = table row numbers, sorted), plus spec, pooling, blocks (column layout), n_shards, counts and
    rows_val_missing (canonical val rows this spec has no features for: evaluate_run needs scores for them
    too, see complete_scores). Only labelled rows with embeddings. Train excludes label_suspect_rows() by
    default. Test rows are never returned."""
    assert_shared_albums_share_split()
    X, rows = F.album_features(spec, pooling, verbose=verbose)
    tr, va, n_drop = _assemble(rows, drop_label_suspect_train)
    counts = _counts(rows)
    if verbose:
        _print_counts(counts, n_drop, f"{F.canonical_spec(spec)} / {pooling}")
    return {
        "X_train": X[tr], "Y_train": Y[rows[tr]], "rows_train": rows[tr],
        "X_val": X[va], "Y_val": Y[rows[va]], "rows_val": rows[va],
        "rows_val_missing": np.setdiff1d(eval_rows("val"), rows[va]),
        "spec": F.canonical_spec(spec), "pooling": pooling, "blocks": F.feature_blocks(spec, pooling),
        "n_shards": F.n_shards(), "counts": counts, "n_label_suspect_dropped": n_drop,
    }


def get_track_data(spec: str, *, drop_label_suspect_train: bool = True, verbose: bool = True) -> dict:
    """Like get_data, but padded per-track tensors: Xt_train [n, T, d], mask_train [n, T], ... (never test)."""
    assert_shared_albums_share_split()
    X, mask, rows = F.track_features(spec, verbose=verbose)
    tr, va, n_drop = _assemble(rows, drop_label_suspect_train)
    counts = _counts(rows)
    if verbose:
        _print_counts(counts, n_drop, f"tracks {F.canonical_spec(spec)}")
    return {
        "Xt_train": X[tr], "mask_train": mask[tr], "Y_train": Y[rows[tr]], "rows_train": rows[tr],
        "Xt_val": X[va], "mask_val": mask[va], "Y_val": Y[rows[va]], "rows_val": rows[va],
        "rows_val_missing": np.setdiff1d(eval_rows("val"), rows[va]),
        "spec": F.canonical_spec(spec), "n_shards": F.n_shards(), "counts": counts, "n_label_suspect_dropped": n_drop,
    }


def train_prevalence(rows_train: np.ndarray | None = None) -> np.ndarray:
    """Label prevalence over TRAIN rows (default: all train rows of the split)."""
    rows = split_rows("train") if rows_train is None else np.asarray(rows_train, dtype=int)
    assert (load_splits()[rows] == "train").all()
    return (Y[rows] > 0).mean(0)


def complete_scores(S: np.ndarray, rows: np.ndarray, fill: np.ndarray | None = None,
                    rows_all: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Scores for all canonical val rows from scores for a subset: rows your feature spec could not cover
    get `fill` (a length-120 vector; default the train prevalence — only sensible if S is on a
    probability-like scale). Returns (S_all, rows_all)."""
    rows = np.asarray(rows, dtype=int)
    rows_all = eval_rows("val") if rows_all is None else np.asarray(rows_all, dtype=int)
    assert np.isin(rows, rows_all).all(), "rows outside the canonical evaluation rows"
    fill = train_prevalence() if fill is None else np.asarray(fill, dtype=np.float64)
    out = np.tile(fill, (len(rows_all), 1)).astype(np.float64)
    out[np.searchsorted(rows_all, rows)] = S
    return out, rows_all


# ---------------------------------------------------------------- precision-coverage maths (pure)

def _curve(Yt: np.ndarray, S: np.ndarray):
    """All operating points a global threshold can realise: sizes m (number of emitted (album, descriptor)
    pairs), precision, threshold, hits — one per distinct score value, tied scores are emitted together."""
    B = np.asarray(Yt) > 0
    S = np.asarray(S, dtype=np.float64)
    assert B.shape == S.shape and S.ndim == 2 and np.isfinite(S).all()
    s, b = S.ravel(), B.ravel()
    order = np.argsort(-s, kind="stable")
    ss = s[order]
    ch = np.cumsum(b[order])
    last = np.flatnonzero(np.r_[ss[1:] != ss[:-1], True])
    m = last + 1
    return m, ch[last] / m, ss[last], ch[last], B


def _share_ge1(S: np.ndarray, threshold: float) -> float:
    return float((np.asarray(S).max(1) >= threshold).mean())


def apply_threshold(Yt: np.ndarray, S: np.ndarray, threshold: float | None) -> dict:
    """Emit every (album, descriptor) with score >= threshold (None = emit nothing) and report
    precision (None if nothing is emitted), avg_count per album, recall, share of albums with >= 1."""
    B = np.asarray(Yt) > 0
    S = np.asarray(S, dtype=np.float64)
    assert B.shape == S.shape
    if threshold is None:
        return {"threshold": None, "precision": None, "avg_count": 0.0, "recall": 0.0, "share_albums_ge1": 0.0,
                "n_emitted": 0, "n_hits": 0}
    E = S >= threshold
    n_e, hits = int(E.sum()), int((E & B).sum())
    return {"threshold": float(threshold), "precision": (hits / n_e) if n_e else None, "avg_count": n_e / len(S),
            "recall": hits / max(int(B.sum()), 1), "share_albums_ge1": float(E.any(1).mean()), "n_emitted": n_e, "n_hits": hits}


def choose_threshold(Yt: np.ndarray, S: np.ndarray, target_precision: float, min_emitted: int = 1) -> float | None:
    """The lowest global threshold (= the largest emitted count) at which precision over all emitted
    (album, descriptor) pairs of this row set is >= target_precision; None if no threshold reaches it.
    Fit this on one row set (validation) and report it on another with apply_threshold."""
    m, prec, thr, _, _ = _curve(Yt, S)
    ok = np.flatnonzero((prec >= target_precision) & (m >= min_emitted))
    return float(thr[ok[-1]]) if len(ok) else None


def transfer_threshold(Y_fit: np.ndarray, S_fit: np.ndarray, Y_eval: np.ndarray, S_eval: np.ndarray,
                       targets: tuple[float, ...] = TARGETS, min_emitted: int = 1) -> dict:
    """Pick the threshold for each target precision on (Y_fit, S_fit) and report it on (Y_eval, S_eval):
    {"0.90": {"threshold", "fit": {...}, "eval": {...}}, ...}. This is the honest version of the
    precision-coverage operating points (final_test uses it with fit = validation, eval = test)."""
    out = {}
    for p in targets:
        t = choose_threshold(Y_fit, S_fit, p, min_emitted)
        out[f"{p:.2f}"] = {"threshold": t, "fit": apply_threshold(Y_fit, S_fit, t), "eval": apply_threshold(Y_eval, S_eval, t)}
    return out


def precision_coverage(Yt: np.ndarray, S: np.ndarray, counts: tuple[float, ...] = COUNTS,
                       targets: tuple[float, ...] = TARGETS) -> dict:
    """Precision as a function of how many descriptors are emitted per album on average.

    All (album, descriptor) pairs of the row set are ranked by score with ONE global threshold; pairs with
    equal scores are emitted together, so `avg_count` is the count actually realised (>= the requested one
    when scores are tied, e.g. k-NN votes or a constant prior).
      points        one entry per requested average count (and the real mean count, "mean_true_count"):
                    target_count, avg_count, precision, recall, threshold, share_albums_ge1
      at_precision  for each target precision: the LARGEST avg_count at which precision >= target
                    (avg_count 0 and threshold None if never reached), with share_albums_ge1 = share of
                    albums that get at least one descriptor there.
    CAUTION: at_precision picks the operating point on the same rows it is reported on, which is
    optimistic (it is a maximum over thresholds; with few albums a handful of lucky top pairs is enough).
    Use transfer_threshold / crossfit_precision_coverage for an honest number, and a validation-chosen
    threshold for the final test run."""
    m, prec, thr, hits, B = _curve(Yt, S)
    n = len(B)
    n_true = int(B.sum())
    mean_true = n_true / n

    def point(i: int, target: float | None) -> dict:
        return {"target_count": target, "avg_count": float(m[i] / n), "precision": float(prec[i]),
                "recall": float(hits[i] / max(n_true, 1)), "threshold": float(thr[i]),
                "share_albums_ge1": _share_ge1(S, thr[i]), "n_emitted": int(m[i])}

    points = []
    for c in list(counts) + [mean_true]:
        i = min(int(np.searchsorted(m, max(1, int(round(c * n))))), len(m) - 1)
        points.append(point(i, float(c)))
    points[-1]["is_mean_true_count"] = True
    at = {}
    for p in targets:
        ok = np.flatnonzero(prec >= p)
        at[f"{p:.2f}"] = point(int(ok[-1]), None) if len(ok) else {
            "target_count": None, "avg_count": 0.0, "precision": None, "recall": 0.0, "threshold": None,
            "share_albums_ge1": 0.0, "n_emitted": 0}
    return {"n_albums": n, "mean_true_count": mean_true, "n_operating_points": int(len(m)), "points": points, "at_precision": at}


def crossfit_precision_coverage(Yt: np.ndarray, S: np.ndarray, halves: np.ndarray,
                                targets: tuple[float, ...] = TARGETS) -> dict:
    """Two-fold version of at_precision inside one row set: the threshold is chosen on one half of the
    albums and applied to the other, both ways, and the emitted pairs are pooled. `halves` = 0/1 per row
    (evaluate_run uses artist-group parity, so an artist is never on both sides)."""
    halves = np.asarray(halves)
    out = {}
    for p in targets:
        n_e = hits = ge1 = 0
        thr = []
        for a in (0, 1):
            fit, ev = halves == a, halves != a
            if not fit.any() or not ev.any():
                continue
            t = choose_threshold(Yt[fit], S[fit], p)
            r = apply_threshold(Yt[ev], S[ev], t)
            thr.append(t)
            n_e += r["n_emitted"]
            hits += r["n_hits"]
            ge1 += r["share_albums_ge1"] * int(ev.sum())
        out[f"{p:.2f}"] = {"precision": (hits / n_e) if n_e else None, "avg_count": n_e / len(S),
                           "share_albums_ge1": ge1 / len(S), "thresholds": thr}
    return out


# ---------------------------------------------------------------- evaluation core

def _jsonable(o):
    if isinstance(o, dict):
        return {str(k): _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, np.ndarray):
        return _jsonable(o.tolist())
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, Path):
        return str(o)
    return o


def _ranking(Yt: np.ndarray, S: np.ndarray, full: bool) -> dict:
    ev = M.evaluate(Yt, S, k=10, labels=DESCRIPTORS)
    out = {k: v for k, v in ev.items() if k not in ("per_album", "per_label")}
    for k in KS:
        out[f"precision@{k}"] = float(M.precision_at_k(Yt, S, k).mean())
        out[f"max_precision@{k}"] = float(M.max_precision_recall_at_k(Yt, k)[0].mean())
    if full:
        out["per_label"] = {"label": DESCRIPTORS, **ev["per_label"]}
    else:
        out.pop("best_auc", None), out.pop("worst_auc", None)
    return out


def _sets(Yt: np.ndarray, W: np.ndarray) -> dict:
    return {k: v for k, v in M.evaluate_sets(Yt, W).items() if k != "per_album"}


def _downstream(W_by_variant: dict[str, np.ndarray], rows: np.ndarray) -> dict:
    """downstream_eval at the balanced and mood stops for each weight variant; sonic only as one number."""
    from downstream import downstream_eval

    out = {}
    for variant, W in W_by_variant.items():
        t0 = time.perf_counter()
        r = downstream_eval(W, rows, stops=("balanced", "mood"), isolated=True)
        d = {"n_eval": r["n_eval"], "n_skipped_not_in_catalogue": r["n_skipped_not_in_catalogue"],
             "mean_n_pred": r["mean_n_pred"], "stops": {}}
        for stop, s in r["stops"].items():
            i = s["inbound"]
            d["stops"][stop] = {
                "overlap@10_mean": s["overlap"]["mean"], "overlap@10_median": s["overlap"]["median"],
                "overlap@10_share_zero": s["overlap"]["share_zero"],
                "overlap@10_isolated_mean": s["overlap_isolated"]["mean"],
                "overlap@10_isolated_median": s["overlap_isolated"]["median"],
                "inbound_before_total": i["before_total"], "inbound_after_total": i["after_total"],
                "inbound_ratio": (i["after_total"] / i["before_total"]) if i["before_total"] else None,
                "zero_inbound_share_before": i["before_share_zero"], "zero_inbound_share_after": i["after_share_zero"],
                "inbound_spearman": i["spearman"], "others_share_changed": s["others"]["share_changed"],
            }
        d["seconds"] = time.perf_counter() - t0
        out[variant] = d
    first = next(iter(W_by_variant))
    r = downstream_eval(W_by_variant[first], rows, stops=("sonic",), isolated=False)
    out["sonic_overlap@10_mean"] = r["stops"]["sonic"]["overlap"]["mean"]
    out["sonic_note"] = f"variant {first}; uninformative (all-zero descriptors already score 0.988)"
    return out


def _evaluate(split: str, S: np.ndarray, rows: np.ndarray, *, downstream: bool,
              calibration: Callable[[np.ndarray], np.ndarray] | None, count_threshold: float | None = None) -> dict:
    """All metrics for one score matrix on labelled rows of one split. `count_threshold`: use this global
    threshold for the calibrated-count set instead of matching the count on these rows (final test)."""
    t_start = time.perf_counter()
    Yt = Y[rows]
    Sc = S if calibration is None else np.asarray(calibration(S.copy()), dtype=np.float64)
    assert Sc.shape == S.shape and np.isfinite(Sc).all(), "calibration must return a finite (n, 120) matrix"
    out: dict = {"ranking": _ranking(Yt, S, full=True)}
    pc = precision_coverage(Yt, Sc)
    halves = artist_groups()[rows] % 2
    pc["crossfit_at_precision"] = crossfit_precision_coverage(Yt, Sc, halves)
    out["precision_coverage"] = pc

    target = float(N_DESC[split_rows("train")].mean())
    thr = calibrate_threshold(Sc, target) if count_threshold is None else float(count_threshold)
    W_thr = scores_to_weights(Sc, threshold=thr)
    W_k10 = scores_to_weights(S, k=10)
    out["calibrated_count"] = {"train_mean_count": target, "threshold": thr,
                               "threshold_source": "count-matched on these rows (no labels used)" if count_threshold is None else "given",
                               **_sets(Yt, W_thr)}
    out["fixed_k10"] = _sets(Yt, W_k10)

    sus = np.isin(rows, label_suspect_rows())
    ex: dict = {"n_label_suspect": int(sus.sum()), "n_albums": int((~sus).sum())}
    if sus.any() and (~sus).any():
        r = _ranking(Yt[~sus], S[~sus], full=False)
        p = precision_coverage(Yt[~sus], Sc[~sus])
        ex.update({k: r[k] for k in (*CAPPED_KEYS, "precision@1", "precision@3", "precision@5", "precision@10", "recall@10",
                                     "ndcg@10", "mAP", "macro_auc")})
        ex["at_precision"] = p["at_precision"]
    else:
        ex["note"] = "no label-suspect rows among the evaluated rows: identical to the main metrics"
    out["excluding_label_suspects"] = ex
    t_metrics = time.perf_counter() - t_start

    t_down = 0.0
    if downstream:
        t0 = time.perf_counter()
        out["downstream"] = _downstream({"k10": W_k10, "calibrated": W_thr}, rows)
        t_down = time.perf_counter() - t0
    out["timing_seconds"] = {"metrics": t_metrics, "downstream": t_down}
    return out


def _check_scores(S: np.ndarray, rows: np.ndarray, split: str, strict: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    S = np.asarray(S, dtype=np.float64)
    rows = np.asarray(rows, dtype=int)
    if S.ndim != 2 or S.shape != (len(rows), len(DESCRIPTORS)):
        raise ValueError(f"scores must be (len(rows), {len(DESCRIPTORS)}); got {S.shape} for {len(rows)} rows")
    if not np.isfinite(S).all():
        raise ValueError("scores contain NaN / inf")
    if len(set(rows.tolist())) != len(rows):
        raise ValueError("duplicate rows")
    where = load_splits()[rows]
    if not (where == split).all():
        raise ValueError(f"evaluate on {split} rows only; got {dict(zip(*np.unique(where, return_counts=True)))}")
    expected = eval_rows(split)
    missing, extra = np.setdiff1d(expected, rows), np.setdiff1d(rows, expected)
    if strict and (len(missing) or len(extra)):
        raise ValueError(
            f"scores must cover exactly the {len(expected)} canonical {split} rows (harness.eval_rows): "
            f"{len(missing)} missing, {len(extra)} not expected. Fill rows your features cannot cover with "
            f"harness.complete_scores, or pass strict=False (the run is then flagged as not comparable).")
    order = np.argsort(rows)
    return S[order], rows[order], expected


def _validate_name(name: str) -> None:
    if not NAME_RE.match(name):
        raise ValueError(f"run name {name!r} must look like '<arm>__<short-description>' "
                         "(letters, digits and . + = , @ - _ only; the arm contains no double underscore)")


def _save_scores(name: str, tag: str, S: np.ndarray, rows: np.ndarray) -> Path:
    SCORES_DIR.mkdir(parents=True, exist_ok=True)
    p = SCORES_DIR / f"{name}__{tag}.npy"
    np.save(p, np.asarray(S, dtype=np.float32))
    np.save(SCORES_DIR / f"{name}__{tag}_rows.npy", np.asarray(rows, dtype=np.int32))
    return p


def save_train_oof(name: str, S_oof: np.ndarray, rows_train: np.ndarray) -> Path:
    """Store out-of-fold TRAIN scores of a run (each row scored by a model that did not see its artist
    group; see cv_folds) for stacking / per-label calibration. -> cache/scores/<name>__train_oof.npy"""
    _validate_name(name)
    S_oof, rows_train = np.asarray(S_oof), np.asarray(rows_train, dtype=int)
    assert S_oof.shape == (len(rows_train), len(DESCRIPTORS)) and np.isfinite(S_oof).all()
    assert (load_splits()[rows_train] == "train").all(), "save_train_oof takes TRAIN rows only"
    return _save_scores(name, "train_oof", S_oof, rows_train)


def load_scores(name: str, split: str = "val") -> tuple[np.ndarray, np.ndarray]:
    """(scores float32 [n, 120], rows) saved by evaluate_run ("val"), save_train_oof ("train_oof") or
    final_test ("test": needs DESCRIPTOR_FINAL_TEST=1)."""
    if split not in ("val", "train_oof", "test"):
        raise ValueError(split)
    if split == "test":
        F.require_test_env("load_scores(split='test')")
    return np.load(SCORES_DIR / f"{name}__{split}.npy"), np.load(SCORES_DIR / f"{name}__{split}_rows.npy")


# ---------------------------------------------------------------- leaderboard

def _leaderboard_row(res: dict) -> dict:
    m, d = res["metrics"], res["data"]
    r, pc = m["ranking"], m["precision_coverage"]
    at, xf = pc["at_precision"], pc["crossfit_at_precision"]
    mean_pt = next(p for p in pc["points"] if p.get("is_mean_true_count"))
    row = {
        "name": res["name"], "n_train": d["n_train"], "n_val": d["n_val"], "n_shards": d["n_shards"],
        "cP@10": r.get("cP@10"), "cP@5": r.get("cP@5"), "perfect@10": r.get("perfect@10"),
        "cP@10_nosuspect": m["excluding_label_suspects"].get("cP@10", r.get("cP@10")),
        "P@10": r["precision@10"], "nDCG@10": r["ndcg@10"], "mAP": r["mAP"], "P@1": r["precision@1"],
        "P@3": r["precision@3"], "P@5": r["precision@5"], "R@10": r["recall@10"], "macro_auc": r["macro_auc"],
        "cnt@p90": at["0.90"]["avg_count"], "cnt@p80": at["0.80"]["avg_count"], "cnt@p70": at["0.70"]["avg_count"],
        "cov@p90": at["0.90"]["share_albums_ge1"], "cov@p80": at["0.80"]["share_albums_ge1"],
        "xfit_p@p90": xf["0.90"]["precision"], "xfit_cnt@p90": xf["0.90"]["avg_count"], "P@mean_count": mean_pt["precision"],
        "calib_prec": m["calibrated_count"]["micro_precision"], "calib_recall": m["calibrated_count"]["micro_recall"],
        "P@10_nosuspect": m["excluding_label_suspects"].get("precision@10", r["precision@10"]),
        "val_coverage": d["val_coverage"], "partial_data": d["partial_data"], "timestamp": res["timestamp"],
        "notes": res.get("notes", ""),
    }
    ds = m.get("downstream")
    if ds:
        k, c = ds["k10"]["stops"], ds["calibrated"]["stops"]
        row.update({
            "bal_ov10": k["balanced"]["overlap@10_mean"], "bal_ov10_med": k["balanced"]["overlap@10_median"],
            "mood_ov10": k["mood"]["overlap@10_mean"], "mood_ov10_med": k["mood"]["overlap@10_median"],
            "bal_ov10_thr": c["balanced"]["overlap@10_mean"], "mood_ov10_thr": c["mood"]["overlap@10_mean"],
            "bal_inbound_ratio": k["balanced"]["inbound_ratio"], "mood_inbound_ratio": k["mood"]["inbound_ratio"],
            "bal_zero_inbound": k["balanced"]["zero_inbound_share_after"], "mood_zero_inbound": k["mood"]["zero_inbound_share_after"],
            "sonic_ov10": ds["sonic_overlap@10_mean"],
        })
    return {c: ("" if row.get(c) is None else row[c]) for c in LEADERBOARD_COLUMNS}


@contextmanager
def _locked(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.with_suffix(path.suffix + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _read_leaderboard() -> list[dict]:
    p = _leaderboard_path()
    if not p.exists():
        return []
    with open(p, newline="") as f:
        return list(csv.DictReader(f))


def _write_leaderboard(rows: list[dict]) -> None:
    p = _leaderboard_path()
    tmp = p.with_suffix(f".csv.{os.getpid()}.part")
    with open(tmp, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=LEADERBOARD_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({c: ("" if r.get(c) is None else r.get(c, "")) for c in LEADERBOARD_COLUMNS})
    os.replace(tmp, p)


def _update_leaderboard(row: dict) -> None:
    """Append one row, or replace the row with the same name (keeping its position)."""
    with _locked(_leaderboard_path()):
        rows = _read_leaderboard()
        for i, r in enumerate(rows):
            if r["name"] == row["name"]:
                rows[i] = row
                break
        else:
            rows.append(row)
        _write_leaderboard(rows)


def rebuild_leaderboard() -> int:
    """Rewrite results/val_leaderboard.csv from results/val/*.json (if the CSV was damaged or edited)."""
    rows = [_leaderboard_row(json.loads(p.read_text())) for p in sorted(_val_dir().glob("*.json"))]
    rows.sort(key=lambda r: r["timestamp"])
    with _locked(_leaderboard_path()):
        _write_leaderboard(rows)
    return len(rows)


def _num(x) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return float("nan")


def leaderboard(sort: str = "cP@10", top: int | None = None, show: bool = True) -> list[dict]:
    """Print the validation table sorted by capped precision@10 (descending; rows without the value last)
    and return the rows. Columns: n_train, n_val, cP@10 (hits in the top 10 / min(10, true count): ceiling
    1.0 — the headline), nDCG@10, P@10 (ceiling ~0.83), mAP, P@1, P@3, c@90 (largest avg descriptors/album
    at precision >= 0.90, chosen on val itself = optimistic), balanced / mood overlap@10 (fixed k=10
    weights), balanced inbound ratio (after / before). Rows from different shard snapshots are NOT
    comparable: check n_train / n_val."""
    rows = sorted(_read_leaderboard(), key=lambda r: -np.nan_to_num(_num(r.get(sort)), nan=-1.0))
    if top:
        rows = rows[:top]
    if show:
        cols = [("n_train", "n_train", "{:.0f}"), ("n_val", "n_val", "{:.0f}"), ("cP@10", "cP@10", "{:.4f}"),
                ("nDCG@10", "nDCG@10", "{:.4f}"), ("P@10", "P@10", "{:.4f}"), ("mAP", "mAP", "{:.4f}"), ("P@1", "P@1", "{:.4f}"),
                ("P@3", "P@3", "{:.4f}"), ("c@90", "cnt@p90", "{:.3f}"), ("c@80", "cnt@p80", "{:.3f}"), ("bal_ov", "bal_ov10", "{:.3f}"),
                ("mood_ov", "mood_ov10", "{:.3f}"), ("inb_ratio", "bal_inbound_ratio", "{:.3f}")]
        w = max([len(r["name"]) for r in rows] + [4]) + 2
        print(f"{'name':<{w}s}" + " ".join(f"{h:>9s}" for h, _, _ in cols) + "  flags")
        sizes = {(r["n_val"], r["n_shards"]) for r in rows}
        for r in rows:
            cells = []
            for _, c, fmt in cols:
                v = _num(r.get(c))
                cells.append(f"{fmt.format(v):>9s}" if np.isfinite(v) else f"{'-':>9s}")
            flags = ("partial " if str(r.get("partial_data")) == "True" else "") + \
                    ("subset-of-val " if _num(r.get("val_coverage")) < 1 else "")
            print(f"{r['name']:<{w}s}" + " ".join(cells) + "  " + flags)
        if len(sizes) > 1:
            print(f"WARNING: rows come from {len(sizes)} different shard snapshots (n_val, n_shards): {sorted(sizes)}; "
                  "compare only rows with the same n_val.")
    return rows


def backfill_capped_precision(verbose: bool = True) -> dict:
    """Add the capped-precision fields (cP@10, cP@5, perfect@10; overall and without label-suspect rows) to
    results/val/*.json files written before the metric existed, recomputing them from the saved score
    matrices in cache/scores/, then rebuild the leaderboard. Nothing is re-trained and no other field is
    changed. A run whose saved scores are missing (or do not match its JSON) is left as it is and shows
    blank on the leaderboard. The saved scores are float32 (evaluate_run scored float64), so a recomputed
    metric can differ in the last digits where rounding creates a tie; as a check, precision@10 is
    recomputed too and the difference to the stored value is recorded under "backfill".
    Returns {"filled": [...], "already": [...], "no_scores": [...], "mismatch": [...]}."""
    out: dict[str, list] = {"filled": [], "already": [], "no_scores": [], "mismatch": []}
    sus_all = label_suspect_rows()
    for p in sorted(_val_dir().glob("*.json")):
        res = json.loads(p.read_text())
        name, r = res["name"], res["metrics"]["ranking"]
        if all(k in r for k in CAPPED_KEYS):
            out["already"].append(name)
            continue
        try:
            S, rows = load_scores(name, "val")
        except (FileNotFoundError, OSError, ValueError):
            out["no_scores"].append(name)
            continue
        S = S.astype(np.float64)
        if S.shape != (res["data"]["n_val"], len(DESCRIPTORS)) or len(rows) != len(S) or not (load_splits()[rows] == "val").all():
            out["mismatch"].append(name)
            continue
        Yt = Y[rows]
        p10 = float(M.precision_at_k(Yt, S, 10).mean())
        if abs(p10 - r["precision@10"]) > 0.005:          # these are not the scores this JSON was computed from
            out["mismatch"].append(name)
            continue

        def capped(Ya: np.ndarray, Sa: np.ndarray) -> dict:
            c10, c5 = M.capped_precision_at_k(Ya, Sa, 10), M.capped_precision_at_k(Ya, Sa, 5)
            return {"cP@10": float(c10.mean()), "cP@5": float(c5.mean()), "perfect@10": float((c10 == 1).mean())}

        r.update(capped(Yt, S))
        sus = np.isin(rows, sus_all)
        if sus.any() and (~sus).any():
            res["metrics"]["excluding_label_suspects"].update(capped(Yt[~sus], S[~sus]))
        res["backfill"] = {"fields": list(CAPPED_KEYS), "from": "cache/scores (float32)",
                           "when": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                           "precision@10_recomputed_minus_stored": p10 - r["precision@10"]}
        tmp = p.with_name(f"{p.name}.{os.getpid()}.part")
        tmp.write_text(json.dumps(_jsonable(res), indent=1, ensure_ascii=False) + "\n")
        os.replace(tmp, p)
        out["filled"].append(name)
    n = rebuild_leaderboard()
    if verbose:
        print(f"[harness] backfill: {len(out['filled'])} filled, {len(out['already'])} already had the fields, "
              f"{len(out['no_scores'])} without saved scores {out['no_scores']}, {len(out['mismatch'])} with scores that do "
              f"not match their JSON {out['mismatch']}; leaderboard rebuilt with {n} rows")
    return out


# ---------------------------------------------------------------- the one function every experiment calls

def evaluate_run(name: str, S_val: np.ndarray, rows_val: np.ndarray, *, config: dict, notes: str = "",
                 downstream: bool = True, calibration: Callable[[np.ndarray], np.ndarray] | None = None,
                 n_train: int | None = None, strict: bool = True, verbose: bool = True) -> dict:
    """Score one model on VALIDATION and record it.

    name         "<arm>__<short-description>" (file-name safe). Re-using a name replaces its results.
    S_val        (n_val, 120) scores in DESCRIPTORS order, higher = more likely. Any real numbers.
    rows_val     table rows of S_val's lines. Must be exactly harness.eval_rows("val") (= get_data's
                 rows_val when the spec covers every album); see complete_scores / strict=False otherwise.
    config       everything needed to reproduce the run (spec, pooling, hyper-parameters, ...). JSON-able.
    calibration  optional per-label calibration fitted on TRAIN (e.g. on out-of-fold train scores):
                 a function (n, 120) -> (n, 120). It is applied before everything that compares scores
                 ACROSS labels with one global threshold (precision-coverage curve, calibrated-count set);
                 the per-album ranking metrics always use the raw scores.
    n_train      number of train rows the model was fitted on (default: config["n_train"], else the number
                 of train rows currently available) — shown on the leaderboard.
    downstream   also run downstream.downstream_eval (slower; see timing_seconds in the result).

    Computes: metrics.evaluate (capped precision cP@10 / cP@5 and perfect@10 — the headline, ceiling 1.0;
    P/R/nDCG@10, mAP, AUCs, best/worst labels); precision@1/3/5/10; the
    precision-coverage curve (see precision_coverage — the "at_precision" operating points are chosen on
    val itself and are optimistic; "crossfit_at_precision" is the two-fold honest version); the
    calibrated-count set (global threshold so the mean predicted count on val = the TRAIN mean count; this
    uses val scores but no val labels) and the fixed k=10 set via metrics.evaluate_sets; the downstream
    recommendation metrics for both sets at the balanced and mood stops; and the headline metrics without
    label_suspect_rows(). Writes results/val/<name>.json, the leaderboard row and cache/scores/<name>__val.npy.
    """
    _validate_name(name)
    S, rows, expected = _check_scores(S_val, rows_val, "val", strict)
    json.dumps(_jsonable(config))  # fail early if the config cannot be stored
    if n_train is None:
        n_train = config.get("n_train") if isinstance(config, dict) else None
    n_train_source = "given"
    if n_train is None:
        n_train, n_train_source = int(len(train_rows())), "default: train rows with audio now (label-suspect rows dropped)"
    metrics = _evaluate("val", S, rows, downstream=downstream, calibration=calibration)
    n_albums, n_matched = len(F.album_index()), F.n_matched_albums()
    res = {
        "name": name, "split": "val", "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "notes": notes, "config": config,
        "calibration": None if calibration is None else getattr(calibration, "__name__", repr(calibration)),
        "data": {
            "n_train": int(n_train), "n_train_source": n_train_source, "n_val": int(len(rows)),
            "n_val_expected": int(len(expected)), "val_coverage": float(np.isin(expected, rows).mean()) if len(expected) else 0.0,
            "n_val_labelled_total": int(len(split_rows("val"))), "n_shards": F.n_shards(),
            "n_albums_extracted": n_albums, "n_albums_matched": n_matched, "partial_data": bool(n_albums < 0.98 * n_matched),
            "shard_limit_env": os.environ.get(F.SHARD_LIMIT_ENV),
        },
        "metrics": metrics,
    }
    res = _jsonable(res)
    _val_dir().mkdir(parents=True, exist_ok=True)
    tmp = _val_dir() / f"{name}.json.{os.getpid()}.part"
    tmp.write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n")
    os.replace(tmp, _val_dir() / f"{name}.json")
    _save_scores(name, "val", S, rows)
    _update_leaderboard(_leaderboard_row(res))
    if verbose:
        r, at = metrics["ranking"], metrics["precision_coverage"]["at_precision"]
        t = metrics["timing_seconds"]
        line = (f"[harness] {name}: n_train {n_train}, n_val {len(rows)} | cP@10 {r['cP@10']:.4f} P@10 {r['precision@10']:.4f} nDCG@10 {r['ndcg@10']:.4f} "
                f"mAP {r['mAP']:.4f} P@1 {r['precision@1']:.4f} P@3 {r['precision@3']:.4f} | avg count at precision>=0.90: "
                f"{at['0.90']['avg_count']:.3f}, >=0.80: {at['0.80']['avg_count']:.3f}")
        if downstream:
            k = metrics["downstream"]["k10"]["stops"]
            line += f" | overlap@10 balanced {k['balanced']['overlap@10_mean']:.3f} mood {k['mood']['overlap@10_mean']:.3f}"
        print(line + f" | {t['metrics']:.1f}s metrics + {t['downstream']:.1f}s downstream"
              + (" | PARTIAL DATA" if res["data"]["partial_data"] else ""))
    return res


# ---------------------------------------------------------------- final test (guarded)

class TestAccess:
    """Handed to the `predict` callback of final_test: the only way to obtain test features."""

    __test__ = False  # not a pytest class

    def __init__(self) -> None:
        F.require_test_env("TestAccess")
        self.rows = eval_rows("test")

    def album_features(self, spec: str, pooling: str = "mean") -> tuple[np.ndarray, np.ndarray]:
        """(X, rows) for the TEST rows this spec covers (subset of self.rows, sorted)."""
        X, rows = F.album_features(spec, pooling, include_test=True, verbose=False)
        keep = np.isin(rows, self.rows)
        return X[keep], rows[keep]

    def track_features(self, spec: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        X, mask, rows = F.track_features(spec, include_test=True, verbose=False)
        keep = np.isin(rows, self.rows)
        return X[keep], mask[keep], rows[keep]


def _log_test(name: str, status: str) -> None:
    p = _test_log()
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')}\t{status}\t{name}\tpid={os.getpid()}\t"
                f"argv={' '.join(sys.argv)}\n")


def final_test(name: str, predict: Callable[[TestAccess], tuple[np.ndarray, np.ndarray]], *, config: dict,
               notes: str = "", calibration: Callable[[np.ndarray], np.ndarray] | None = None,
               downstream: bool = True, strict: bool = True) -> dict:
    """THE ONLY ENTRY POINT THAT TOUCHES TEST ROWS. Run once, at the very end, by the project owner.

    Requires the environment variable DESCRIPTOR_FINAL_TEST=1 (PermissionError otherwise) and appends a
    line to results/test_invocations.log for every call, refused or not.

    predict(access) -> (S_test, rows_test): gets a TestAccess (access.rows, access.album_features(spec,
    pooling), access.track_features(spec)) and returns scores for exactly access.rows (use complete_scores
    with rows_all=access.rows for rows a spec cannot cover).
    The run must already have validation scores under the same name (evaluate_run): every threshold is
    taken from validation — the precision operating points via transfer_threshold(val -> test), and the
    calibrated-count threshold from the validation scores. Writes results/test/<name>.json and
    cache/scores/<name>__test.npy."""
    _validate_name(name)
    if not F.test_allowed():
        _log_test(name, "REFUSED (no " + TEST_ENV + "=1)")
        raise PermissionError(f"final_test needs the environment variable {TEST_ENV}=1; the test split is scored once, at the end")
    _log_test(name, "STARTED")
    S_val, rows_val = load_scores(name, "val")
    S_val = S_val.astype(np.float64)
    S, rows = predict(TestAccess())
    S, rows, expected = _check_scores(S, rows, "test", strict)
    cal = (lambda x: x) if calibration is None else calibration
    Sc_val, Sc = np.asarray(cal(S_val.copy()), dtype=np.float64), np.asarray(cal(S.copy()), dtype=np.float64)
    target = float(N_DESC[split_rows("train")].mean())
    thr = calibrate_threshold(Sc_val, target)
    metrics = _evaluate("test", S, rows, downstream=downstream, calibration=calibration, count_threshold=thr)
    metrics["calibrated_count"]["threshold_source"] = "count-matched on VALIDATION scores"
    metrics["val_chosen_operating_points"] = transfer_threshold(Y[rows_val], Sc_val, Y[rows], Sc)
    res = _jsonable({
        "name": name, "split": "test", "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "notes": notes, "config": config,
        "calibration": None if calibration is None else getattr(calibration, "__name__", repr(calibration)),
        "data": {"n_test": int(len(rows)), "n_test_expected": int(len(expected)), "n_val_for_thresholds": int(len(rows_val)),
                 "n_test_labelled_total": int(len(split_rows("test"))), "n_shards": F.n_shards(),
                 "n_albums_extracted": len(F.album_index()), "n_albums_matched": F.n_matched_albums()},
        "metrics": metrics,
    })
    _test_dir().mkdir(parents=True, exist_ok=True)
    (_test_dir() / f"{name}.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n")
    _save_scores(name, "test", S, rows)
    _log_test(name, f"DONE n_test={len(rows)}")
    return res


if __name__ == "__main__":
    if "--backfill" in sys.argv:
        backfill_capped_precision()
    leaderboard(top=int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else None)
