"""Experiment arm: metadata side-signals, early / late fusion, calibration and the output format.

    P="OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 10 .venv/bin/python"
    $P exp_fusion.py meta                       # metadata-only probes (no audio needed)         -> meta__*
    $P exp_fusion.py early                      # audio blocks + metadata block, one logistic probe -> fusion__early_*
    $P exp_fusion.py stack --runs 'linear__*_logreg' 'mlp__*' meta__mb_nodesc --tag main        -> fusion__stack_main_*
    $P exp_fusion.py calibrate --run fusion__stack_main_logit-avg     # -> results/precision_coverage.json
    $P exp_fusion.py emit --run fusion__stack_main_logit-avg          # how many descriptors, which weights

Common options: --quick (tiny grids; everything is written to cache/quick_fusion/, never to the shared
leaderboard; input runs are then also looked up in cache/quick_linear/, cache/quick_mlp/ and the real
results), --force, --no-downstream, --runs-from DIR (extra roots holding results/val/*.json + scores/).

meta       L2 logistic probe on tag features (meta_features.build_meta_features). Source sets: MusicBrainz
           (album tags, artist tags, year), Deezer genres, both, and "all" if Last.fm / Discogs parquet
           files exist (picked up automatically). Every set with free-text tags is run twice: with all
           tags (`_alltags`) and with tags that literally equal a descriptor name removed (`_nodesc`).
           Fitted on ALL train rows that have metadata (not only those with audio); C and the feature
           scaling come from the artist-disjoint train folds. Registered on the canonical val rows
           (harness.eval_rows); a row without metadata (not matched, no tags, or not fetched yet) gets the
           train prevalence = the most-frequent ranking. Reported on all val rows and on the subset with
           metadata, on the canonical rows and - because metadata does not need audio - on every labelled
           val row fetched so far, next to the most-frequent and RYM-genre-mean baselines on the same rows.
early      audio blocks (each z-scored, then scaled to unit total variance) + one metadata block (scaled to
           unit total variance, times a block weight; --meta-block z also z-scores its columns) -> logistic probe. Block weight and C by train CV; weight 0 =
           the audio-only reference on exactly the same rows (`fusion__early_ref-audio`).
stack      late fusion of registered runs, fitted on TRAIN out-of-fold scores only: rank average, logit
           average, non-negative weights (NNLS; coordinate search on OOF nDCG@10) and a per-label logistic
           stacker shrunk towards the plain average. Runs without OOF scores are refused.
calibrate  per-label Platt / isotonic calibration fitted on train OOF scores; precision-coverage curves for
           raw / calibrated scores and for the most-frequent baseline, lift over it, on all 120 descriptors
           and on the 114 mood words (NON_MOOD removed). -> results/precision_coverage.json
emit       fixed k, calibrated threshold, per-album count, hub mitigation (prior subtraction, nearest
           train-label mixing), judged by downstream overlap@10 and inbound counts. Fitted parameters and
           the choice between variants come from train OOF predictions; val is the report.

Model-selection rule: everything fitted (vocabularies, scalers, C, block weights, fusion weights,
calibrators, thresholds, count models, hub-mitigation strength) is fitted on TRAIN (CV folds / OOF scores).
Validation is only scored. Test is never touched.

Resuming: a run / table is reused when its stored signature (n_shards, n_train, n_val, metadata row counts,
input-run timestamps, grids) equals the current one; otherwise it is recomputed.
Outputs: results/val/{meta,fusion}__*.json (+ leaderboard, scores), results/fusion_summary.json,
results/precision_coverage.json.
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")

import argparse
import fnmatch
import hashlib
import json
import shutil
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import exp_linear as EL          # block transforms, logistic path, summary / resume helpers (sets torch to 2 threads)
import features as F
import harness as H
import meta_features as MF
import metrics as M
from common import DESCRIPTORS, HERE, N_DESC, Y, Y64, YB, label_suspect_rows, split_rows
from exp_linear import Summary, load_done, make_sig, ptable, snapshot
from rmr_pipeline.constants import NON_MOOD
from weights import calibrate_threshold, formula_rank_weights, scores_to_weights, train_rank_weights

SUMMARY_NAME = "fusion_summary.json"
PC_NAME = "precision_coverage.json"
SHORT = {"musicbrainz": "mb", "deezer": "dz", "lastfm": "lfm", "discogs": "dg"}
TAGGY = ("musicbrainz", "lastfm")                     # sources with free-text tags (descriptor-literal leak possible)
META_CS = (3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1)   # CV optimum 0.003 (MusicBrainz tags) ... 0.1 (22 Deezer genres); C >= 1 was never close and is the slow end
# "s" (one global scale) beat "z" (per-column z-score) by ~0.03 OOF nDCG@10 in all five metadata-only runs of
# 2026-10-01 (train CV), at half the cost, so it is the default; pass --transforms z s to let CV choose again.
META_TRANSFORMS = ("s",)
META_TRANSFORM_CHOICES = ("z", "s")
META_WEIGHTS = (0.0, 0.5, 1.0, 2.0)                   # early fusion: weight of the metadata block (0 = audio only)
DEFAULT_AUDIO = [("maest:7", "mean"), ("mert:8", "mean"), ("clap", "mean"), ("heads", "mean")]
MIN_TRAIN = 200
STACK_LAMBDAS = (10.0, 100.0, 1000.0, 10000.0)
FINE_COUNTS = (0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 10, 12)
MOOD_COLS = np.array([j for j, d in enumerate(DESCRIPTORS) if d not in NON_MOOD])
NON_MOOD_IN_USE = [d for d in DESCRIPTORS if d in NON_MOOD]
EMIT_KS = (5, 8, 10, 12)
SHARPEN = (0.1, 0.25, 0.5, 0.75, 1.0)
NN_MIX = (0.25, 0.5, 0.75)
NN_M = 5
COUNT_CLIP = (3, 25)
STOPS = ("balanced", "mood")


# ---------------------------------------------------------------- small maths (pure; tested in test_exp_fusion.py)

def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -50, 50)))


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=np.float64), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def is_prob(S: np.ndarray) -> bool:
    return bool(np.min(S) >= 0.0 and np.max(S) <= 1.0)


def rank_space(S: np.ndarray) -> np.ndarray:
    """Rank of each descriptor within its album, scaled to [0, 1] (1 = best)."""
    return np.argsort(np.argsort(S, axis=1, kind="stable"), axis=1, kind="stable") / (S.shape[1] - 1.0)


def batched_logistic(X: np.ndarray, T: np.ndarray, prior: np.ndarray, lam: np.ndarray, iters: int = 60,
                     tol: float = 1e-8) -> np.ndarray:
    """L independent small logistic regressions by damped Newton.

    X [L, n, d], T [L, n] targets in [0, 1], prior [d] or [L, d], lam [d] >= 0.  Minimises per problem
    sum_i logloss(x_i w, t_i) + 0.5 * sum_d lam_d (w_d - prior_d)^2.  Returns W [L, d] (starts at prior)."""
    X = np.asarray(X, dtype=np.float64)
    T = np.asarray(T, dtype=np.float64)
    L, n, d = X.shape
    prior = np.broadcast_to(np.asarray(prior, dtype=np.float64), (L, d))
    lamv = np.asarray(lam, dtype=np.float64) + 1e-8
    W = prior.copy()

    def obj(Wc: np.ndarray) -> np.ndarray:
        z = np.einsum("lnd,ld->ln", X, Wc)
        return (np.logaddexp(0.0, z) - T * z).sum(1) + 0.5 * (lamv * (Wc - prior) ** 2).sum(1)

    f = obj(W)
    for _ in range(iters):
        p = sigmoid(np.einsum("lnd,ld->ln", X, W))
        g = np.einsum("lnd,ln->ld", X, p - T) + lamv * (W - prior)
        Hm = np.einsum("lnd,lne->lde", X * (p * (1 - p))[:, :, None], X) + np.diag(lamv)
        step = np.linalg.solve(Hm, g[:, :, None])[:, :, 0]
        t = np.ones(L)
        for _ in range(12):
            Wn = W - t[:, None] * step
            fn = obj(Wn)
            bad = ~(fn <= f + 1e-12)
            if not bad.any():
                break
            t[bad] *= 0.5
        W = np.where(bad[:, None], W, Wn)
        f = np.where(bad, f, fn)
        if np.abs(t[:, None] * step)[~bad].max(initial=0.0) < tol:
            break
    return W


class LogitMap:
    """One run's scores -> a common logit scale: z = a * x + b with x = logit(score) for scores in [0, 1],
    else the globally standardised score; (a, b) = one global Platt fit on the run's TRAIN OOF scores
    (2 parameters per run). Monotone, so the within-album ranking of the run is unchanged."""

    def fit(self, S_oof: np.ndarray, B: np.ndarray) -> "LogitMap":
        S = np.asarray(S_oof, dtype=np.float64)
        self.prob = is_prob(S)
        self.mu, self.sd = (0.0, 1.0) if self.prob else (float(S.mean()), float(S.std()) or 1.0)
        x = self._x(S).ravel()
        X = np.stack([x, np.ones_like(x)], 1)[None]
        self.a, self.b = batched_logistic(X, np.asarray(B, dtype=np.float64).ravel()[None], np.array([1.0, 0.0]), np.zeros(2))[0]
        return self

    def _x(self, S: np.ndarray) -> np.ndarray:
        S = np.asarray(S, dtype=np.float64)
        return logit(np.clip(S, 0, 1)) if self.prob else (S - self.mu) / self.sd

    def __call__(self, S: np.ndarray) -> np.ndarray:
        return self.a * self._x(S) + self.b

    def describe(self) -> dict:
        return {"input": "logit(score)" if self.prob else "standardised score", "a": float(self.a), "b": float(self.b)}


# ---- stacking weights

def ndcg(Yt: np.ndarray, S: np.ndarray) -> float:
    return float(M.ndcg_at_k(Yt, S, 10).mean())


def nnls_weights(Ps: list[np.ndarray], B: np.ndarray) -> np.ndarray:
    """Non-negative least squares of the binary labels on the runs' probabilities (all album x descriptor
    pairs pooled), normalised to sum 1. All-zero solution -> uniform."""
    from scipy.optimize import nnls

    A = np.stack([np.asarray(P, dtype=np.float64).ravel() for P in Ps], 1)
    w, _ = nnls(A, np.asarray(B, dtype=np.float64).ravel())
    return w / w.sum() if w.sum() > 0 else np.full(len(Ps), 1.0 / len(Ps))


def coord_weights(Zs: list[np.ndarray], Yt: np.ndarray, rounds: int = 3,
                  factors: tuple[float, ...] = (0.0, 0.5, 1.5, 2.5)) -> np.ndarray:
    """Coordinate search on the simplex, criterion = mean nDCG@10 of sum_k w_k Z_k (start: uniform; a
    change is kept only if it improves the criterion)."""
    K = len(Zs)
    w = np.full(K, 1.0 / K)
    if K == 1:
        return w
    best = ndcg(Yt, sum(wk * Z for wk, Z in zip(w, Zs)))
    for _ in range(rounds):
        improved = False
        for k in range(K):
            for fct in factors:
                c = w.copy()
                c[k] = max(w[k], 0.5 / K) * fct
                if c.sum() <= 0:
                    continue
                c = c / c.sum()
                s = ndcg(Yt, sum(wk * Z for wk, Z in zip(c, Zs) if wk > 0))
                if s > best + 1e-9:
                    w, best, improved = c, s, True
        if not improved:
            break
    return w


def perlabel_fit(Zs: list[np.ndarray], B: np.ndarray, lam: float) -> np.ndarray:
    """Per-label logistic stacker: logit p_j = b_j + sum_k w_jk Z_k[:, j], with lam * (w_jk - 1/K)^2 / 2
    pulling every label towards the plain logit average (lam -> inf gives exactly that). -> W [L, K + 1]."""
    K = len(Zs)
    X = np.stack([np.asarray(Z, dtype=np.float64).T for Z in Zs] + [np.ones_like(Zs[0], dtype=np.float64).T], 2)
    prior = np.r_[np.full(K, 1.0 / K), 0.0]
    return batched_logistic(X, np.asarray(B, dtype=np.float64).T, prior, np.r_[np.full(K, lam), 0.0])


def perlabel_predict(Zs: list[np.ndarray], W: np.ndarray) -> np.ndarray:
    z = sum(W[:, k][None, :] * np.asarray(Z, dtype=np.float64) for k, Z in enumerate(Zs)) + W[:, -1][None, :]
    return sigmoid(z)


def crossfit(fit, predict, Zs: list[np.ndarray], Yt: np.ndarray, folds) -> np.ndarray:
    """Out-of-fold fused scores: parameters fitted on the fit part of each fold, applied to its held-out part."""
    out = np.full(Yt.shape, np.nan)
    for f, h in folds:
        out[h] = predict([Z[h] for Z in Zs], fit([Z[f] for Z in Zs], Yt[f]))
    assert np.isfinite(out).all(), "some rows are in no fold"
    return out


# ---- per-label calibration

class Calibrator:
    """Per-label calibration fitted on TRAIN out-of-fold scores.

    platt     p = sigmoid(a_j x + b_j), x = logit(score) (scores in [0, 1]) or the standardised score;
              Platt's smoothed targets; (a_j, b_j) shrunk towards one global (a, b) with strength `shrink`
              (so a label with a handful of positives stays close to the pooled fit).
    isotonic  per-label isotonic regression of the label on x, blended with 0.1 % of the Platt value so the
              output is strictly increasing (isotonic alone produces large ties); labels with fewer than
              `min_pos` positives or negatives use Platt.
    none      identity."""

    def __init__(self, method: str = "platt", shrink: float = 2.0, min_pos: int = 5):
        if method not in ("platt", "isotonic", "none"):
            raise ValueError(method)
        self.method, self.shrink, self.min_pos = method, shrink, min_pos
        self.__name__ = f"per-label {method} calibration fitted on train OOF scores"

    def _x(self, S: np.ndarray) -> np.ndarray:
        S = np.asarray(S, dtype=np.float64)
        return logit(np.clip(S, 0, 1)) if self.prob else (S - self.mu) / self.sd

    def fit(self, S_oof: np.ndarray, B: np.ndarray) -> "Calibrator":
        if self.method == "none":
            return self
        S = np.asarray(S_oof, dtype=np.float64)
        B = np.asarray(B) > 0
        self.prob = is_prob(S)
        self.mu, self.sd = (0.0, 1.0) if self.prob else (float(S.mean()), float(S.std()) or 1.0)
        x = self._x(S)
        n, L = x.shape
        ones = np.ones_like(x)
        self.g = batched_logistic(np.stack([x.ravel(), ones.ravel()], 1)[None], B.ravel()[None].astype(float),
                                  np.array([1.0, 0.0]), np.zeros(2))[0]
        npos = B.sum(0)
        T = np.where(B, (npos + 1.0) / (npos + 2.0), 1.0 / (n - npos + 2.0))
        self.W = batched_logistic(np.stack([x.T, ones.T], 2), T.T, self.g, np.full(2, self.shrink))
        self.iso = None
        if self.method == "isotonic":
            from sklearn.isotonic import IsotonicRegression

            self.iso = [IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(x[:, j], B[:, j].astype(float))
                        if min(npos[j], n - npos[j]) >= self.min_pos else None for j in range(L)]
        return self

    def __call__(self, S: np.ndarray) -> np.ndarray:
        if self.method == "none":
            return np.asarray(S, dtype=np.float64)
        x = self._x(S)
        P = sigmoid(x * self.W[:, 0][None, :] + self.W[:, 1][None, :])
        if self.iso is not None:
            for j, m in enumerate(self.iso):
                if m is not None:
                    P[:, j] = 0.999 * m.predict(x[:, j]) + 0.001 * P[:, j]
        return P


def crossfit_calibrate(S_oof: np.ndarray, B: np.ndarray, folds, method: str) -> np.ndarray:
    """Calibrated train OOF scores where each row's calibrator was fitted on the other folds."""
    if method == "none":
        return np.asarray(S_oof, dtype=np.float64)
    out = np.full(S_oof.shape, np.nan)
    for f, h in folds:
        out[h] = Calibrator(method).fit(S_oof[f], B[f])(S_oof[h])
    assert np.isfinite(out).all()
    return out


def calibration_quality(B: np.ndarray, P: np.ndarray, bins: int = 15) -> dict:
    """Pooled over all (album, descriptor) pairs: micro AP, Brier, ECE (equal-mass bins; only meaningful
    for probability-like scores)."""
    from sklearn.metrics import average_precision_score

    b, p = (np.asarray(B) > 0).ravel(), np.asarray(P, dtype=np.float64).ravel()
    out = {"micro_ap": float(average_precision_score(b, p))}
    if is_prob(p):
        order = np.argsort(p, kind="stable")
        ece = sum(len(ix) / len(p) * abs(p[ix].mean() - b[ix].mean()) for ix in np.array_split(order, bins))
        out.update({"brier": float(((p - b) ** 2).mean()), "ece": float(ece)})
    return out


# ---- precision-coverage curves

def pc_curve(Yt: np.ndarray, S: np.ndarray, halves: np.ndarray | None = None) -> dict:
    pc = H.precision_coverage(Yt, S, counts=FINE_COUNTS)
    out = {"mean_true_count": pc["mean_true_count"],
           "points": [{k: p[k] for k in ("target_count", "avg_count", "precision", "recall", "share_albums_ge1")}
                      for p in pc["points"] if not p.get("is_mean_true_count")],
           "at_mean_true_count": {k: pc["points"][-1][k] for k in ("avg_count", "precision", "recall")},
           "at_precision": {t: {k: v[k] for k in ("avg_count", "precision", "share_albums_ge1", "threshold")}
                            for t, v in pc["at_precision"].items()}}
    if halves is not None:
        out["crossfit_at_precision"] = {t: {k: v[k] for k in ("precision", "avg_count", "share_albums_ge1")}
                                        for t, v in H.crossfit_precision_coverage(Yt, S, halves).items()}
    return out


def pc_lift(model: dict, base: dict) -> dict:
    """Model curve minus baseline curve at the same requested count, and the difference of the largest
    counts reaching each target precision. (A constant baseline emits whole descriptor columns, so its
    realised count is the next whole number: `baseline_avg_count`.)"""
    pts = []
    for m, b in zip(model["points"], base["points"]):
        pts.append({"target_count": m["target_count"], "model_avg_count": m["avg_count"], "model_precision": m["precision"],
                    "baseline_avg_count": b["avg_count"], "baseline_precision": b["precision"],
                    "lift_abs": m["precision"] - b["precision"],
                    "lift_ratio": (m["precision"] / b["precision"]) if b["precision"] else None})
    at = {t: {"model_count": model["at_precision"][t]["avg_count"], "baseline_count": base["at_precision"][t]["avg_count"],
              "extra_count": model["at_precision"][t]["avg_count"] - base["at_precision"][t]["avg_count"]}
          for t in model["at_precision"]}
    return {"points": pts, "at_precision": at}


# ---- output format

def weights_from_counts(S: np.ndarray, counts: np.ndarray, rank_weights: np.ndarray | str = "empirical") -> np.ndarray:
    """Like weights.scores_to_weights, with a per-album number of descriptors."""
    S = np.asarray(S, dtype=np.float64)
    n, L = S.shape
    rw = train_rank_weights() if isinstance(rank_weights, str) and rank_weights == "empirical" else \
        formula_rank_weights(L) if isinstance(rank_weights, str) else np.asarray(rank_weights, dtype=np.float64)
    rw = np.pad(rw, (0, max(0, L - len(rw))), mode="edge")[:L]
    counts = np.clip(np.asarray(counts, dtype=int), 0, L)
    order = np.argsort(-S, axis=1, kind="stable")
    sel = np.arange(L)[None, :] < counts[:, None]
    W = np.zeros((n, L))
    W[np.nonzero(sel)[0], order[sel]] = np.broadcast_to(rw[None, :], (n, L))[sel]
    return W


def sharpen(P: np.ndarray, prior: np.ndarray, lam: float) -> np.ndarray:
    """Hub mitigation 1: logit(p) - lam * logit(train prevalence). lam = 1 ranks by the log-odds ratio
    against the prior (what is unusual about this album), lam = 0 is the plain ranking."""
    return logit(P) - lam * logit(prior)[None, :]


def nn_label_scores(P: np.ndarray, prior: np.ndarray, B_train: np.ndarray, m: int = NN_M,
                    allowed: np.ndarray | None = None) -> np.ndarray:
    """Hub mitigation 2: mean label vector of the m train albums whose (prior-centred) label vector has the
    highest cosine similarity with the prior-centred prediction. `allowed` [n, n_train] masks candidates."""
    A = np.asarray(P, dtype=np.float64) - prior
    T = np.asarray(B_train, dtype=np.float64) - prior
    A = A / np.maximum(np.linalg.norm(A, axis=1, keepdims=True), 1e-12)
    T = T / np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    sim = A @ T.T
    if allowed is not None:
        sim = np.where(allowed, sim, -np.inf)
    m = min(m, sim.shape[1])
    idx = np.argpartition(-sim, m - 1, axis=1)[:, :m]
    return np.asarray(B_train, dtype=np.float64)[idx].mean(1)


def fit_count_model(P_oof: np.ndarray, n_true: np.ndarray) -> tuple[float, float]:
    """n_true ~ a + b * sum_j p_ij (least squares on train OOF)."""
    x = np.asarray(P_oof, dtype=np.float64).sum(1)
    b, a = np.polyfit(x, np.asarray(n_true, dtype=np.float64), 1) if x.std() > 0 else (0.0, float(np.mean(n_true)))
    return float(a), float(b)


def predict_counts(P: np.ndarray, model: tuple[float, float], clip: tuple[int, int] = COUNT_CLIP) -> np.ndarray:
    return np.clip(np.rint(model[0] + model[1] * np.asarray(P, dtype=np.float64).sum(1)), *clip).astype(int)


# ---------------------------------------------------------------- shared helpers

def brief(Yt: np.ndarray, S: np.ndarray) -> dict | None:
    """Compact metric set on any labelled row set (own computation, same functions as the harness)."""
    if len(Yt) == 0:
        return None
    ev = M.evaluate(Yt, S, k=10)
    at = H.precision_coverage(Yt, S)["at_precision"]
    return {"n": int(len(Yt)), "P@10": ev["precision@10"], "nDCG@10": ev["ndcg@10"], "mAP": ev["mAP"],
            "P@1": float(M.precision_at_k(Yt, S, 1).mean()), "P@3": float(M.precision_at_k(Yt, S, 3).mean()),
            "P@5": float(M.precision_at_k(Yt, S, 5).mean()), "R@10": ev["recall@10"], "macro_auc": ev["macro_auc"],
            "cnt@p90": at["0.90"]["avg_count"], "cnt@p80": at["0.80"]["avg_count"], "cnt@p70": at["0.70"]["avg_count"]}


def train_all_rows() -> np.ndarray:
    """All train rows of the split (with or without audio), label-suspect rows removed."""
    return np.setdiff1d(split_rows("train"), label_suspect_rows())


def foldwise_prevalence(rows: np.ndarray) -> np.ndarray:
    """For each TRAIN row: label prevalence over the train rows of the OTHER CV folds (an OOF 'most frequent')."""
    tr = train_all_rows()
    fid_all = H.train_fold_ids()
    out = np.empty((len(rows), len(DESCRIPTORS)))
    for f in np.unique(fid_all[rows]):
        out[fid_all[rows] == f] = YB[tr[fid_all[tr] != f]].mean(0)
    return out


def baseline_scores(rows: np.ndarray) -> dict[str, np.ndarray]:
    """The two label-only references fitted on all train rows, for any rows (as run_reference's *_fulltrain)."""
    from baselines import genre_lists, genre_mean_scores, most_frequent_scores

    tr = train_all_rows()
    mf = most_frequent_scores(YB[tr], len(rows))
    el = genre_lists(rows)
    g = genre_mean_scores(genre_lists(tr), YB[tr], el)
    no = np.array([len(x) == 0 for x in el], dtype=bool)
    g[no] = mf[no]
    return {"most_frequent": mf, "genre_mean_all": g}


def fmt(x, nd: int = 3) -> str:
    return "-" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:.{nd}f}"


# ---------------------------------------------------------------- registered runs (inputs of stack / calibrate / emit)

@dataclass
class Run:
    name: str
    res: dict
    S_val: np.ndarray
    S_oof: np.ndarray | None
    rows_oof: np.ndarray | None

    @property
    def stamp(self) -> str:
        return f"{self.res.get('timestamp')}|{self.res['data']['n_train']}|{self.res['data']['n_shards']}"


def run_roots(a) -> list[tuple[Path, Path]]:
    roots = [(Path(H.RESULTS_DIR), Path(H.SCORES_DIR))]
    roots += [(Path(d) / "results", Path(d) / "scores") for d in (a.runs_from or [])]
    if a.quick:
        roots += [(HERE / "cache" / q / "results", HERE / "cache" / q / "scores") for q in ("quick_linear", "quick_mlp")]
        roots.append((HERE / "results", HERE / "cache" / "scores"))
    seen, out = set(), []
    for r in roots:
        if str(r[0]) not in seen:
            seen.add(str(r[0]))
            out.append(r)
    return out


def find_runs(a, patterns: list[str], need_oof: bool = True) -> list[Run]:
    """Resolve names / globs to registered runs (first root that has the name wins). Refuses runs without
    train OOF scores (unless a.drop_no_oof) and runs whose val rows are not the current canonical rows."""
    index: dict[str, tuple[Path, Path]] = {}
    for res_dir, sc_dir in run_roots(a):
        for p in sorted((res_dir / "val").glob("*.json")):
            index.setdefault(p.stem, (res_dir, sc_dir))
    names: list[str] = []
    for pat in patterns:
        hit = sorted(fnmatch.filter(index, pat)) if any(c in pat for c in "*?[") else ([pat] if pat in index else [])
        if not hit:
            raise SystemExit(f"no registered run matches {pat!r} (looked in: {', '.join(str(r[0]) for r in run_roots(a))})")
        names += [h for h in hit if h not in names]
    expected = H.eval_rows("val")
    runs, no_oof = [], []
    for n in names:
        res_dir, sc_dir = index[n]
        res = json.loads((res_dir / "val" / f"{n}.json").read_text())
        oof_p = sc_dir / f"{n}__train_oof.npy"
        if need_oof and not oof_p.exists():
            no_oof.append(n)
            continue
        rows_val = np.load(sc_dir / f"{n}__val_rows.npy")
        if not np.array_equal(rows_val, expected):
            raise SystemExit(f"{n}: its validation scores cover {len(rows_val)} rows of another shard snapshot (now "
                             f"{len(expected)} canonical val rows, {F.n_shards()} shards). Re-run that experiment on the "
                             f"current data (or set {F.SHARD_LIMIT_ENV}={res['data']['n_shards']} to reproduce its snapshot).")
        S_oof = rows_oof = None
        if oof_p.exists():
            S_oof = np.load(oof_p).astype(np.float64)
            rows_oof = np.load(sc_dir / f"{n}__train_oof_rows.npy").astype(int)
        runs.append(Run(n, res, np.load(sc_dir / f"{n}__val.npy").astype(np.float64), S_oof, rows_oof))
    if no_oof:
        msg = (f"{len(no_oof)} run(s) have no train out-of-fold scores (cache/scores/<name>__train_oof.npy) and cannot be "
               f"used for anything fitted: {', '.join(no_oof)}. Fusion weights / calibrators may only be fitted on train "
               f"OOF scores; register OOF scores for them (harness.save_train_oof) or leave them out")
        if not a.drop_no_oof:
            raise SystemExit("REFUSED: " + msg + " (or pass --drop-no-oof to drop them).")
        print("[warn] dropped: " + msg)
    if not runs:
        raise SystemExit("no usable run")
    return runs


# ---------------------------------------------------------------- metadata access

class MetaStore:
    """A frozen copy of the metadata parquet files that exist right now (the fetchers rewrite them every 100
    rows; one process must see one version). Last.fm / Discogs are picked up as soon as their files exist."""

    def __init__(self, want: list[str] | None = None, min_count: int = 5):
        self.min_count = min_count
        self._tmp = tempfile.TemporaryDirectory(prefix=".fusion_meta_", dir=MF.CACHE)
        self.dir = Path(self._tmp.name)
        self.sources: list[str] = []
        for s, spec in MF.SOURCES.items():
            p = MF.CACHE / spec[0]
            if p.exists() and (want is None or s in want):
                shutil.copy2(p, self.dir / spec[0])
                self.sources.append(s)
        self.df = {s: MF.load_source(s, self.dir) for s in self.sources}
        self._desc = {MF.norm_tag(d) for d in MF.descriptor_names("all")}

    def close(self) -> None:
        self._tmp.cleanup()

    def fetched(self, sources) -> np.ndarray:
        """Table rows fetched (without error) in ALL the given sources."""
        rows = None
        for s in sources:
            d = self.df[s]
            r = np.array(sorted(d.index[d["status"] != "error"] if "status" in d.columns else d.index), dtype=int)
            rows = r if rows is None else np.intersect1d(rows, r)
        return rows if rows is not None else np.array([], dtype=int)

    def build(self, rows: np.ndarray, vocab_rows: np.ndarray, sources, drop: bool) -> tuple[np.ndarray, list[str]]:
        assert (H.load_splits()[np.asarray(vocab_rows, dtype=int)] == "train").all(), "vocabulary rows must be TRAIN rows"
        return MF.build_meta_features(rows, vocab_rows, sources=tuple(sources), min_count=self.min_count,
                                      drop_descriptor_tags=drop, cache_dir=self.dir)

    @staticmethod
    def covered(X: np.ndarray, names: list[str]) -> np.ndarray:
        """Row has at least one tag / genre in at least one source (before vocabulary filtering)."""
        cols = [j for j, n in enumerate(names) if n.startswith("has_") and n.endswith("_tags")]
        return X[:, cols].sum(1) > 0

    def literal(self, rows: np.ndarray, sources) -> np.ndarray:
        """Row carries at least one tag that literally equals one of the 176 descriptor names."""
        out = np.zeros(len(rows), dtype=bool)
        for s in sources:
            if s not in TAGGY:
                continue
            d = self.df[s]
            for _, col, _ in MF.SOURCES[s][1]:
                cells = d[col]
                for i, r in enumerate(rows):
                    if not out[i] and int(r) in cells.index and self._desc & set(MF._parse(cells.at[int(r)])):
                        out[i] = True
        return out

    def counts(self) -> dict:
        tr, va, can = train_all_rows(), split_rows("val"), H.eval_rows("val")
        out = {}
        for s in self.sources:
            f = self.fetched([s])
            out[s] = {"train_fetched": int(np.isin(tr, f).sum()), "train_total": int(len(tr)),
                      "val_fetched": int(np.isin(va, f).sum()), "val_total": int(len(va)),
                      "canonical_val_fetched": int(np.isin(can, f).sum()), "canonical_val_total": int(len(can))}
        return out


def fit_tf(A: np.ndarray, kind: str):
    """'z' = z-score every column (train statistics); 's' = one global scale so the mean column variance is
    1 (keeps the sparsity pattern and the log-vote weighting; rare tags are not blown up)."""
    if kind == "z":
        sc = F.Standardizer().fit(A)
        return sc.transform
    g = np.float32(1.0 / np.sqrt(max(float(np.asarray(A, dtype=np.float64).var(0).mean()), 1e-12)))
    return lambda X: (np.asarray(X, dtype=np.float32) * g)


def fit_meta_block(A: np.ndarray, kind: str):
    """Metadata block for early fusion, scaled to unit total variance like the audio blocks: 'z' = z-score
    each column first (exp_linear's "zs"); 's' = keep the columns' relative scale (sparse log-vote features)."""
    if kind == "z":
        tf = EL.fit_block(A, "zs")
        return lambda X: EL.apply_block(tf, X)
    w = np.float32(1.0 / np.sqrt(max(float(np.asarray(A, dtype=np.float64).var(0).sum()), 1e-12)))
    return lambda X: (np.asarray(X, dtype=np.float32) * w)


def cv_logreg(X: np.ndarray, Yt: np.ndarray, rows: np.ndarray, Cs, transforms, X_eval: np.ndarray) -> dict:
    """C and feature scaling by out-of-fold nDCG@10 on the artist-disjoint train folds; final fit on all
    rows; scores for X_eval. Ties -> smaller C."""
    Cs = sorted(float(c) for c in Cs)
    B = (Yt > 0).astype(np.float64)
    folds = H.cv_folds(rows)
    oof = {(t, C): np.full(Yt.shape, np.nan) for t in transforms for C in Cs}
    for fit, held in folds:
        for t in transforms:
            tf = fit_tf(X[fit], t)
            for C, P in EL.logreg_path(tf(X[fit]), B[fit], tf(X[held]), Cs).items():
                oof[(t, C)][held] = P
    table = {k: EL.rank_metrics(Yt, v) for k, v in oof.items()}
    best = max(table, key=lambda k: (table[k]["ndcg@10"], -k[1], k[0] == "s"))
    tf = fit_tf(X, best[0])
    S_eval = EL.logreg_path(tf(X), B, tf(X_eval), [best[1]])[best[1]] if len(X_eval) else np.zeros((0, Yt.shape[1]))
    return {"best_transform": best[0], "best_C": best[1], "at_grid_edge": bool(best[1] in (Cs[0], Cs[-1]) and len(Cs) > 1),
            "cv": {f"{t}|C={C:g}": v for (t, C), v in table.items()}, "cv_ndcg@10": table[best]["ndcg@10"],
            "cv_precision@10": table[best]["precision@10"], "oof": oof[best], "S_eval": S_eval, "n_folds": len(folds)}


# ---------------------------------------------------------------- 1. meta

def meta_sets(avail: list[str]) -> list[tuple[str, tuple[str, ...]]]:
    sets: list[tuple[str, tuple[str, ...]]] = []
    if "musicbrainz" in avail:
        sets.append(("mb", ("musicbrainz",)))
    if "deezer" in avail:
        sets.append(("dz", ("deezer",)))
    if "musicbrainz" in avail and "deezer" in avail:
        sets.append(("mb+dz", ("musicbrainz", "deezer")))
    if set(avail) - {"musicbrainz", "deezer"}:
        sets.append(("all", tuple(avail)))
    return sets


def cmd_meta(a, S: Summary) -> None:
    sec = S.section("meta")
    ms = MetaStore(a.sources, a.min_count)
    try:
        counts = ms.counts()
        sec.update({"snapshot": snapshot(), "sources_available": ms.sources, "fetch_counts": counts, "C_grid": list(a.meta_Cs),
                    "transforms": list(a.transforms), "min_count": a.min_count,
                    "note": "runs[name].report: metric sets on (a) the canonical val rows = val rows with audio, as on the "
                            "leaderboard, and (b) every labelled val row fetched in the run's sources (metadata needs no "
                            "audio; a fair random sample while the fetch is running). 'covered' = rows with at least one "
                            "tag/genre; rows without get the train prevalence. Baselines are fitted on all train rows."})
        for s, c in counts.items():
            print(f"[meta] {s}: fetched for {c['train_fetched']}/{c['train_total']} train rows, {c['val_fetched']}/{c['val_total']} "
                  f"labelled val rows, {c['canonical_val_fetched']}/{c['canonical_val_total']} canonical val rows (with audio)")
        if not ms.sources:
            raise SystemExit("no metadata parquet in cache/ - run fetch_metadata.py first")
        tr_all, va_all, va_can = train_all_rows(), split_rows("val"), H.eval_rows("val")
        prev = YB[tr_all].mean(0)
        runs = sec["runs"] = {}          # only what this invocation produced or confirmed (no stale snapshots)
        for set_name, sources in meta_sets(ms.sources):
            variants = [("alltags", False), ("nodesc", True)] if set(sources) & set(TAGGY) else [("genres", False)]
            for vname, drop in variants:
                name = f"meta__{set_name}_{vname}"
                sig = make_sig(a, sources=list(sources), drop=drop, Cs=list(a.meta_Cs), transforms=list(a.transforms),
                               min_count=a.min_count, fetch={s: counts[s] for s in sources})
                done = None if a.force else load_done(name, sig)
                if done is not None:
                    print(f"[skip] {name}: result exists for this data snapshot, metadata row counts and grid")
                    runs[name] = done["config"]["report"]
                    continue
                t0 = time.perf_counter()
                fetched = ms.fetched(sources)
                ftr, fva = np.intersect1d(tr_all, fetched), np.intersect1d(va_all, fetched)
                X, names = ms.build(np.r_[ftr, fva], ftr, sources, drop)
                cov = ms.covered(X, names)
                cov_tr, cov_va = cov[:len(ftr)], cov[len(ftr):]
                if cov_tr.sum() < MIN_TRAIN:
                    print(f"[meta] {name}: only {int(cov_tr.sum())} train rows with metadata so far (< {MIN_TRAIN}) - skipped")
                    continue
                fit_rows = ftr[cov_tr]
                r = cv_logreg(X[:len(ftr)][cov_tr], Y[fit_rows], fit_rows, a.meta_Cs, a.transforms, X[len(ftr):][cov_va])
                S_oof = foldwise_prevalence(ftr)
                S_oof[cov_tr] = r["oof"]
                S_f = np.tile(prev, (len(fva), 1))
                S_f[cov_va] = r["S_eval"]
                # canonical val rows: model where fetched + covered, train prevalence elsewhere
                S_can = np.tile(prev, (len(va_can), 1))
                in_f = np.isin(va_can, fva)
                S_can[in_f] = S_f[np.searchsorted(fva, va_can[in_f])]
                cov_can = np.zeros(len(va_can), dtype=bool)
                cov_can[in_f] = cov_va[np.searchsorted(fva, va_can[in_f])]
                lit_f = ms.literal(fva, sources)

                def table(rows: np.ndarray, Sm: np.ndarray, masks: dict[str, np.ndarray]) -> dict:
                    base = baseline_scores(rows)
                    return {k: {"model": brief(Y[rows[m]], Sm[m]), **{b: brief(Y[rows[m]], Sb[m]) for b, Sb in base.items()}}
                            for k, m in masks.items()}

                report = {
                    "sources": list(sources), "descriptor_literal_tags": "dropped" if drop else "kept", "n_features": len(names),
                    "n_train_fetched": int(len(ftr)), "n_train_fit": int(len(fit_rows)), "train_total": int(len(tr_all)),
                    "best_C": r["best_C"], "best_transform": r["best_transform"], "at_grid_edge": r["at_grid_edge"],
                    "cv_ndcg@10": r["cv_ndcg@10"], "cv_precision@10": r["cv_precision@10"],
                    "coverage": {
                        "canonical_val": {"n": int(len(va_can)), "fetched": int(in_f.sum()), "with_metadata": int(cov_can.sum()),
                                          "fallback_most_frequent": int((~cov_can).sum())},
                        "labelled_val": {"n": int(len(va_all)), "fetched": int(len(fva)), "with_metadata": int(cov_va.sum()),
                                         "share_with_metadata_of_fetched": float(cov_va.mean()) if len(fva) else None,
                                         "with_descriptor_literal_tag": int((lit_f & cov_va).sum()),
                                         "share_literal_of_fetched": float((lit_f & cov_va).mean()) if len(fva) else None},
                        "train": {"fetched": int(len(ftr)), "with_metadata": int(cov_tr.sum()),
                                  "with_descriptor_literal_tag": int(ms.literal(ftr, sources).sum())}},
                    "canonical_val": table(va_can, S_can, {"all": np.ones(len(va_can), dtype=bool), "covered": cov_can}),
                    "labelled_val_fetched": table(fva, S_f, {"all": np.ones(len(fva), dtype=bool), "covered": cov_va,
                                                              "covered_with_literal_tag": cov_va & lit_f,
                                                              "covered_without_literal_tag": cov_va & ~lit_f}),
                }
                notes = (f"metadata only ({'+'.join(sources)}; descriptor-literal tags {'DROPPED' if drop else 'kept'}); at run time "
                         + "; ".join(f"{s} fetched for {counts[s]['train_fetched']}/{counts[s]['train_total']} train, "
                                     f"{counts[s]['val_fetched']}/{counts[s]['val_total']} labelled val rows" for s in sources)
                         + f"; {int(cov_can.sum())}/{len(va_can)} canonical val rows have metadata, the rest get the train prevalence")
                H.save_train_oof(name, S_oof, ftr)
                config = {"arm": "meta", "model": "one-vs-rest L2 logistic regression on tag features", "sources": list(sources),
                          "drop_descriptor_tags": drop, "min_count": a.min_count, "C_grid": list(a.meta_Cs), "best": r["best_C"],
                          "transforms": list(a.transforms), "cv": r["cv"], "cv_folds": r["n_folds"],
                          "cv_criterion": "out-of-fold nDCG@10 on train rows with metadata (artist-disjoint folds)",
                          "vocabulary": "tags on >= min_count fetched train rows (all folds; unsupervised)",
                          "oof_rows": "fetched train rows; rows without metadata carry the other folds' prevalence",
                          "fit_seconds": round(time.perf_counter() - t0, 1), "report": report, "sig": sig}
                H.evaluate_run(name, S_can, va_can, config=config, notes=notes, n_train=len(fit_rows), downstream=not a.no_downstream)
                runs[name] = report
                S.save()
        _print_meta(sec)
    finally:
        ms.close()


def _print_meta(sec: dict) -> None:
    runs = sec.get("runs", {})
    if not runs:
        return
    keys = ("P@10", "nDCG@10", "mAP", "P@1", "P@3", "cnt@p80", "cnt@p70")
    for block, title in (("labelled_val_fetched", "ALL labelled val rows fetched so far (not on the leaderboard: needs no audio)"),
                         ("canonical_val", "canonical val rows = val rows with audio (as on the leaderboard)")):
        for subset in ("all", "covered", "covered_without_literal_tag", "covered_with_literal_tag"):
            rows, base_done = [], set()
            for name, rep in runs.items():
                t = rep[block].get(subset)
                if not t or t["model"] is None:
                    continue
                n = t["model"]["n"]
                for b in ("most_frequent", "genre_mean_all"):
                    if (b, n) not in base_done:
                        base_done.add((b, n))
                        rows.append([f"baseline {b} (full train)", n, "-", *[t[b][k] for k in keys]])
                rows.append([name, n, rep["n_train_fit"], *[t["model"][k] for k in keys]])
            if rows:
                ptable(["run", "n_val", "n_train", *keys], rows, f"meta: {title} - subset '{subset}'")
    ptable(["run", "feat", "C", "tf", "cv nDCG@10", "train fit/fetched", "val fetched", "with metadata", "literal-tag rows"],
           [[n, r["n_features"], f"{r['best_C']:g}" + ("!" if r["at_grid_edge"] else ""), r["best_transform"], r["cv_ndcg@10"],
             f"{r['n_train_fit']}/{r['n_train_fetched']}", f"{r['coverage']['labelled_val']['fetched']}/{r['coverage']['labelled_val']['n']}",
             f"{r['coverage']['labelled_val']['with_metadata']} ({fmt(r['coverage']['labelled_val']['share_with_metadata_of_fetched'])})",
             f"{r['coverage']['labelled_val']['with_descriptor_literal_tag']} ({fmt(r['coverage']['labelled_val']['share_literal_of_fetched'])})"]
            for n, r in runs.items()], "meta: fits and coverage (! = C at the edge of the grid)")


# ---------------------------------------------------------------- 2. early fusion

def audio_blocks(a) -> tuple[list[tuple[str, str]], str]:
    if a.spec != "auto":
        return [(F.canonical_spec(t), a.pooling) for t in a.spec.split("+")], "given"
    if a.quick:
        return [("clap", "mean"), ("heads", "mean")], "quick default"
    p = HERE / "results" / "linear_summary.json"
    if p.exists():
        cb = json.loads(p.read_text()).get("concat", {}).get("best_run_by_cv")
        if cb and cb.get("blocks"):
            blocks = [tuple(x.split("|")) for x in cb["blocks"] if not x.startswith("mert_v2")]
            if cb.get("snapshot") != EL.snap_key():
                print(f"[warn] linear arm's best concatenation was chosen on another snapshot {cb.get('snapshot')}")
            return blocks, f"results/linear_summary.json concat.best_run_by_cv ({cb.get('name')})"
    return list(DEFAULT_AUDIO), "default (no results/linear_summary.json)"


def cmd_early(a, S: Summary) -> None:
    sec = S.section("early")
    blocks, why = audio_blocks(a)
    ms = MetaStore(a.sources, a.min_count)
    try:
        if not ms.sources:
            raise SystemExit("no metadata parquet in cache/ - run fetch_metadata.py first")
        sources = tuple(ms.sources)
        counts = ms.counts()
        set_name = "+".join(SHORT[s] for s in sources)
        suffix = f"_{a.tag}" if a.tag else ""
        weights = sorted(set(float(w) for w in a.meta_weights) | {0.0})
        Cs = sorted(float(c) for c in a.Cs)
        variants = [("alltags", False), ("nodesc", True)] if set(sources) & set(TAGGY) else [("genres", False)]
        names = {v: f"fusion__early_{set_name}_{v}{suffix}" for v, _ in variants}
        ref_name = f"fusion__early_ref-audio{suffix}"
        sig = make_sig(a, blocks=[list(b) for b in blocks], sources=list(sources), Cs=Cs, weights=weights,
                       min_count=a.min_count, fetch=counts, meta_block=a.meta_block)
        sec.update({"snapshot": snapshot(), "meta_block_transform": a.meta_block, "audio_blocks": [list(b) for b in blocks], "audio_blocks_from": why,
                    "sources": list(sources), "fetch_counts": counts, "meta_weights": weights, "C_grid": Cs})
        todo = [n for n in [ref_name, *names.values()] if a.force or load_done(n, {**sig, "run": n}) is None]
        runs = sec.setdefault("runs", {})
        if todo:
            runs.clear()                 # recomputing (all runs share the CV pass): drop entries of older snapshots
        else:
            print("[skip] early: all runs exist for this snapshot, metadata row counts and grid")
            _print_early(sec)
            return
        print(f"[early] audio blocks {blocks} ({why}); metadata {sources}", flush=True)
        data = EL.load_blocks(blocks)
        rows_tr, rows_va, Yt = data["rows_train"], data["rows_val"], data["Y"]
        B = (Yt > 0).astype(np.float64)
        folds = H.cv_folds(rows_tr)
        vocab_rows = np.intersect1d(train_all_rows(), ms.fetched(sources))
        n_meta_tr = int(np.isin(rows_tr, ms.fetched(sources)).sum())
        if n_meta_tr < len(rows_tr):
            print(f"[warn] metadata is fetched for only {n_meta_tr}/{len(rows_tr)} audio train rows: unfetched rows look like "
                  f"'no metadata' to the model (partial-data result)")
        meta = {}
        for v, drop in variants:
            Xm, mnames = ms.build(np.r_[rows_tr, rows_va], vocab_rows, sources, drop)
            meta[v] = (Xm[:len(rows_tr)], Xm[len(rows_tr):], ms.covered(Xm, mnames), len(mnames))
        keys = [("audio", 0.0)] + [(v, w) for v, _ in variants for w in weights if w > 0]
        oof = {(k, C): np.full(Yt.shape, np.nan) for k in keys for C in Cs}

        def design(parts_fit, parts_held, extra=None, w=0.0):
            A, Hd = list(parts_fit), list(parts_held)
            if extra is not None:
                A, Hd = A + [w * extra[0]], Hd + [w * extra[1]]
            A, Hd = np.hstack(A), np.hstack(Hd)
            g = np.float32(1.0 / np.sqrt(max(float((A.astype(np.float64) ** 2).mean()), 1e-12)))
            return A * g, Hd * g

        def transformed(fit, held, final=False):
            pa, ph = [], []
            for b, X in enumerate(data["Xtr"]):
                tf = EL.fit_block(X[fit], "zs")
                pa.append(EL.apply_block(tf, X[fit]))
                ph.append(EL.apply_block(tf, data["Xva"][b] if final else X[held]))
            pm = {}
            for v, (Xm_tr, Xm_va, _, _) in meta.items():
                tf = fit_meta_block(Xm_tr[fit], a.meta_block)
                pm[v] = (tf(Xm_tr[fit]), tf(Xm_va if final else Xm_tr[held]))
            return pa, ph, pm

        t0 = time.perf_counter()
        for i, (fit, held) in enumerate(folds):
            pa, ph, pm = transformed(fit, held)
            for k in keys:
                A, Hd = design(pa, ph, None if k[0] == "audio" else pm[k[0]], k[1])
                for C, P in EL.logreg_path(A, B[fit], Hd, Cs).items():
                    oof[(k, C)][held] = P
            print(f"[early] fold {i + 1}/{len(folds)} done ({time.perf_counter() - t0:.0f}s)", flush=True)
        table = {kc: EL.rank_metrics(Yt, v) for kc, v in oof.items()}
        cvt = {f"{k[0]}|w={k[1]:g}|C={C:g}": m for (k, C), m in table.items()}
        allr = np.arange(len(rows_tr))
        pa, ph, pm = transformed(allr, None, final=True)
        fill = (Yt > 0).mean(0)
        cov_va = {v: meta[v][2][len(rows_tr):] for v in meta}
        S_ref = None
        for run_name, v in [(ref_name, "audio")] + [(names[v], v) for v, _ in variants]:
            cand = [kc for kc in table if kc[0][0] == v]
            best = max(cand, key=lambda kc: (table[kc]["ndcg@10"], -kc[1]))
            (_, w), C = best
            A, Hd = design(pa, ph, None if v == "audio" else pm[v], w)
            S_val = EL.logreg_path(A, B, Hd, [C])[C]
            if v == "audio":
                S_ref = S_val
            rep = {"variant": v, "meta_weight": w, "C": C, "cv_ndcg@10": table[best]["ndcg@10"], "cv_precision@10": table[best]["precision@10"],
                   "cv_audio_only_ndcg@10": max(table[kc]["ndcg@10"] for kc in table if kc[0][0] == "audio"),
                   "n_train": int(len(rows_tr)), "n_train_with_metadata": int(meta[v][2][:len(rows_tr)].sum()) if v != "audio" else None,
                   "n_meta_features": meta[v][3] if v != "audio" else 0}
            if v != "audio":
                c = cov_va[v]
                rep["val_subsets"] = {k: {"fused": brief(Y[rows_va[m]], S_val[m]), "audio_only": brief(Y[rows_va[m]], S_ref[m])}
                                      for k, m in (("with_metadata", c), ("without_metadata", ~c))}
            config = {"arm": "fusion", "model": "early fusion: audio blocks + metadata block -> L2 logistic probe" if v != "audio"
                      else "audio-only reference of the early-fusion probe (same rows, same transforms)",
                      "blocks": [list(b) for b in blocks], "spec": "+".join(b[0] for b in blocks), "dims": data["dims"],
                      "block_transform": "audio blocks: zs (z-score, unit total variance per block); metadata block: "
                      + ("z-scored" if a.meta_block == "z" else "one scale (no per-column z-score)") + ", unit total variance, times meta_weight",
                      "sources": list(sources), "drop_descriptor_tags": v == "nodesc", "meta_weight": w, "best": C,
                      "C_grid": Cs, "meta_weights": weights, "cv": {k: m for k, m in cvt.items() if k.startswith(v + "|")},
                      "cv_ndcg@10": rep["cv_ndcg@10"], "cv_precision@10": rep["cv_precision@10"], "cv_folds": len(folds),
                      "at_grid_edge": bool(C in (Cs[0], Cs[-1]) and len(Cs) > 1),
                      "cv_criterion": "out-of-fold nDCG@10 on train; transforms fitted per fold", "report": rep,
                      "sig": {**sig, "run": run_name}}
            notes = ("audio-only reference for the early-fusion runs" if v == "audio" else
                     f"early fusion with {'+'.join(sources)} tags ({'descriptor-literal tags DROPPED' if v == 'nodesc' else 'all tags'}); "
                     f"metadata fetched for {n_meta_tr}/{len(rows_tr)} audio train rows at run time")
            e = EL.finish_run(a, run_name, S_val, rows_va, data["rows_val_missing"], fill, oof[(best[0], C)], rows_tr, config, notes)
            runs[run_name] = {**rep, "val": e["val"]}
            S.save()
        _print_early(sec)
    finally:
        ms.close()


def _print_early(sec: dict) -> None:
    runs = sec.get("runs", {})
    ptable(["run", "meta w", "C", "cv nDCG@10", "cv audio-only", "val nDCG@10", "val P@10", "val mAP"],
           [[n, f"{r['meta_weight']:g}", f"{r['C']:g}", r["cv_ndcg@10"], r["cv_audio_only_ndcg@10"], r["val"]["ndcg@10"],
             r["val"]["precision@10"], r["val"]["mAP"]] for n, r in runs.items()], "early fusion (C and block weight by train CV)")
    rows = []
    for n, r in runs.items():
        for k, t in (r.get("val_subsets") or {}).items():
            if t["fused"]:
                rows.append([n, k, t["fused"]["n"], t["fused"]["nDCG@10"], t["audio_only"]["nDCG@10"], t["fused"]["P@10"], t["audio_only"]["P@10"]])
    if rows:
        ptable(["run", "val subset", "n", "fused nDCG@10", "audio nDCG@10", "fused P@10", "audio P@10"], rows, "early fusion: where the gain is")


# ---------------------------------------------------------------- 3. stacking

def common_oof(runs: list[Run]) -> tuple[np.ndarray, list[np.ndarray]]:
    rows = runs[0].rows_oof
    for r in runs[1:]:
        rows = np.intersect1d(rows, r.rows_oof)
    out = []
    for r in runs:
        pos = {int(x): i for i, x in enumerate(r.rows_oof)}
        out.append(r.S_oof[[pos[int(x)] for x in rows]])
    return rows, out


def cmd_stack(a, S: Summary) -> None:
    if not a.runs:
        raise SystemExit("stack needs --runs <name or glob> [...]")
    runs = find_runs(a, a.runs, need_oof=True)
    names = [r.name for r in runs]
    tagname = a.tag or "s" + hashlib.sha1("|".join(names).encode()).hexdigest()[:6]
    rows_tr, P_oof = common_oof(runs)
    if len(rows_tr) < 30:
        raise SystemExit(f"only {len(rows_tr)} train rows have OOF scores in all {len(runs)} runs")
    Yt = Y[rows_tr]
    B = Yt > 0
    folds = H.cv_folds(rows_tr)
    K = len(runs)
    lams = (100.0,) if a.quick else STACK_LAMBDAS
    rounds = 1 if a.quick else 3
    sig = make_sig(a, components={r.name: r.stamp for r in runs}, n_common_train=int(len(rows_tr)), lambdas=list(lams), rounds=rounds)
    sec = S.section("stack").setdefault(tagname, {})
    maps = [LogitMap().fit(P, B) for P in P_oof]
    Z_oof = [m(P) for m, P in zip(maps, P_oof)]
    Z_val = [m(r.S_val) for m, r in zip(maps, runs)]
    uni = np.full(K, 1.0 / K)
    methods = {
        "rank-avg": (lambda Zs, Yf: uni, lambda Zs, w: sum(wk * rank_space(Z) for wk, Z in zip(w, Zs))),
        "logit-avg": (lambda Zs, Yf: uni, lambda Zs, w: sigmoid(sum(wk * Z for wk, Z in zip(w, Zs)))),
        "nnls": (lambda Zs, Yf: nnls_weights([sigmoid(Z) for Z in Zs], Yf > 0),
                 lambda Zs, w: sum(wk * sigmoid(Z) for wk, Z in zip(w, Zs))),
        "coord": (lambda Zs, Yf: coord_weights(Zs, Yf, rounds), lambda Zs, w: sigmoid(sum(wk * Z for wk, Z in zip(w, Zs)))),
    }
    t0 = time.perf_counter()
    table, oofs, vals, params = {}, {}, {}, {}
    for mname, (fit, pred) in methods.items():
        oofs[mname] = crossfit(fit, pred, Z_oof, Yt, folds)
        w = fit(Z_oof, Yt)
        vals[mname], params[mname] = pred(Z_val, w), {"weights": dict(zip(names, np.asarray(w).tolist()))}
        table[mname] = EL.rank_metrics(Yt, oofs[mname])
        print(f"[stack] {mname}: cv nDCG@10 {table[mname]['ndcg@10']:.4f} ({time.perf_counter() - t0:.0f}s)", flush=True)
    lam_table = {}
    for lam in lams:
        o = crossfit(lambda Zs, Yf, lam=lam: perlabel_fit(Zs, Yf > 0, lam), perlabel_predict, Z_oof, Yt, folds)
        lam_table[lam] = (EL.rank_metrics(Yt, o), o)
    lam_best = max(lams, key=lambda l: (lam_table[l][0]["ndcg@10"], l))
    W = perlabel_fit(Z_oof, B, lam_best)
    oofs["perlabel"], vals["perlabel"] = lam_table[lam_best][1], perlabel_predict(Z_val, W)
    table["perlabel"] = lam_table[lam_best][0]
    params["perlabel"] = {"lambda": lam_best, "lambda_cv": {f"{l:g}": lam_table[l][0] for l in lams},
                          "mean_weights": dict(zip(names, W[:, :K].mean(0).tolist())),
                          "weight_sd_over_labels": dict(zip(names, W[:, :K].std(0).tolist()))}
    order = list(table)
    best = max(order, key=lambda m: (table[m]["ndcg@10"], -order.index(m)))
    single = {r.name: EL.rank_metrics(Yt, P) for r, P in zip(runs, P_oof)}
    sec.update({"snapshot": snapshot(), "components": names, "n_common_train": int(len(rows_tr)), "single_cv": single,
                "logit_maps": {r.name: m.describe() for r, m in zip(runs, maps)}, "cv": table, "params": params,
                "best_by_cv": best, "best_run": f"fusion__stack_{tagname}_{best}",
                "note": "all fitting on TRAIN OOF scores of the components (common rows). cv = nDCG@10 / P@10 of the fused OOF "
                        "scores; weights / stackers are cross-fitted over the artist-disjoint folds (fitted on 4, scored on the "
                        "5th). The per-label lambda is the best of the grid by that same number (slightly optimistic). "
                        "rank-avg scores are within-album ranks: not comparable across albums (threshold metrics are not meaningful)."})
    ptable(["component", "cv nDCG@10", "cv P@10", "val nDCG@10"],
           [[r.name, single[r.name]["ndcg@10"], single[r.name]["precision@10"], r.res["metrics"]["ranking"]["ndcg@10"]] for r in runs],
           f"stack '{tagname}': components on the {len(rows_tr)} common train OOF rows")
    reg = sec.setdefault("registered", {})
    rows = []
    for mname in order:
        name = f"fusion__stack_{tagname}_{mname}"
        rsig = {**sig, "method": mname}
        prev = None if a.force else load_done(name, rsig)
        if prev is not None:
            print(f"[skip] {name}: result exists for these inputs")
            e = EL.val_entry(prev)
        else:
            config = {"arm": "fusion", "model": f"late fusion / stacking ({mname})", "components": names, **params[mname],
                      "cv": table, "cv_ndcg@10": table[mname]["ndcg@10"], "cv_precision@10": table[mname]["precision@10"],
                      "best": mname, "at_grid_edge": False, "n_methods_tried": len(order),
                      "cv_criterion": "nDCG@10 of cross-fitted fused train OOF scores", "sig": rsig}
            e = EL.finish_run(a, name, vals[mname], H.eval_rows("val"), np.array([], dtype=int), None, oofs[mname], rows_tr, config,
                              notes=f"stack of {K} runs ({mname})" + (" - CV-best method" if mname == best else ""))
        reg[name] = {"method": mname, "cv_ndcg@10": table[mname]["ndcg@10"], "cv_precision@10": table[mname]["precision@10"], "val": e["val"]}
        wtxt = " ".join(f"{w:.2f}" for w in params[mname].get("weights", params[mname].get("mean_weights", {})).values())
        rows.append([name + (" *" if mname == best else ""), table[mname]["ndcg@10"], table[mname]["precision@10"],
                     e["val"]["ndcg@10"], e["val"]["precision@10"], e["val"]["mAP"], wtxt])
        S.save()
    S.d.setdefault("stack", {})["last_tag"] = tagname
    ptable(["run", "cv nDCG@10", "cv P@10", "val nDCG@10", "val P@10", "val mAP", "weights (component order)"], rows,
           "stack: registered runs (* = CV-best; per-label row shows mean weights)")


# ---------------------------------------------------------------- 4. calibration + precision-coverage

def default_run(a, S: Summary) -> list[str]:
    if a.run:
        return a.run
    st = S.d.get("stack", {})
    t = st.get(st.get("last_tag", ""), {})
    if t.get("best_run"):
        print(f"[info] --run not given: using the last stack's CV-best run {t['best_run']}")
        return [t["best_run"]]
    raise SystemExit("give --run <registered run with train OOF scores>")


def choose_calibration(run: Run, quick: bool = False) -> dict:
    """Cross-fitted calibrated OOF scores for each method and the method with the best pooled OOF micro AP."""
    B = Y[run.rows_oof] > 0
    folds = H.cv_folds(run.rows_oof)
    oof = {m: crossfit_calibrate(run.S_oof, B, folds, m) for m in ("none", "platt", "isotonic")}
    q = {m: calibration_quality(B, P) for m, P in oof.items()}
    best = max(("none", "platt", "isotonic"), key=lambda m: (q[m]["micro_ap"], m == "platt"))
    return {"oof": oof, "quality_oof": q, "chosen": best}


def cmd_calibrate(a, S: Summary) -> None:
    pc_path = Path(H.RESULTS_DIR) / PC_NAME
    pc_all = json.loads(pc_path.read_text()) if pc_path.exists() else {}
    sec = S.section("calibrate")
    for run in find_runs(a, default_run(a, S), need_oof=True):
        sig = make_sig(a, run=run.name, stamp=run.stamp, counts=list(FINE_COUNTS))
        if not a.force and sec.get(run.name, {}).get("sig") == sig and run.name in pc_all:
            print(f"[skip] calibrate {run.name}: done for this input")
            _print_pc(run.name, pc_all[run.name])
            continue
        rows_va = H.eval_rows("val")
        Yv, Yo = Y[rows_va], Y[run.rows_oof]
        ch = choose_calibration(run)
        cals = {m: Calibrator(m).fit(run.S_oof, Yo > 0) for m in ("none", "platt", "isotonic")}
        Pv = {m: c(run.S_val) for m, c in cals.items()}
        prev = YB[train_all_rows()].mean(0)
        base_v = np.tile(prev, (len(rows_va), 1))
        halves = H.artist_groups()[rows_va] % 2
        out = {"run": run.name, "snapshot": snapshot(), "n_val": int(len(rows_va)), "n_train_oof": int(len(run.rows_oof)),
               "chosen_calibration": ch["chosen"], "calibration_quality": {"train_oof_crossfitted": ch["quality_oof"],
                                                                           "val": {m: calibration_quality(Yv > 0, P) for m, P in Pv.items()}},
               "non_mood_descriptors_excluded_in_mood": NON_MOOD_IN_USE,
               "val_prevalence_of_non_mood": {d: float((Yv[:, DESCRIPTORS.index(d)] > 0).mean()) for d in NON_MOOD_IN_USE},
               "note": "points: precision when all (album, descriptor) pairs are ranked with one global threshold and avg_count "
                       "descriptors are emitted per album. at_precision = largest avg_count with precision >= target, threshold "
                       "chosen on val itself (optimistic); crossfit_at_precision = chosen on one half of val's artists, reported "
                       "on the other; train_chosen = threshold chosen on cross-fitted calibrated TRAIN OOF scores and applied to "
                       "val (the honest operating point). baseline = train prevalence for every album (emits whole descriptor "
                       "columns, so its realised count is a whole number). lift = model minus baseline at the same requested count.",
               "label_sets": {}}
        for set_name, cols in (("all", np.arange(len(DESCRIPTORS))), ("mood", MOOD_COLS)):
            keep = (Yv[:, cols] > 0).any(1)          # a few albums may have only non-mood descriptors
            base = pc_curve(Yv[:, cols], base_v[:, cols], halves)
            entry = {"n_labels": int(len(cols)), "n_val_albums_with_a_label": int(keep.sum()), "baseline_most_frequent": base,
                     "model": {}, "lift_over_baseline": {}, "train_chosen": {}}
            for m in ("none", "platt", "isotonic"):
                key = "raw" if m == "none" else m
                cur = pc_curve(Yv[:, cols], Pv[m][:, cols], halves)
                entry["model"][key] = cur
                entry["lift_over_baseline"][key] = pc_lift(cur, base)
                tt = H.transfer_threshold(Yo[:, cols], ch["oof"][m][:, cols], Yv[:, cols], Pv[m][:, cols])
                entry["train_chosen"][key] = {t: {"threshold": v["threshold"], "train_oof_count": v["fit"]["avg_count"],
                                                   "val_precision": v["eval"]["precision"], "val_count": v["eval"]["avg_count"],
                                                   "val_share_albums_ge1": v["eval"]["share_albums_ge1"]} for t, v in tt.items()}
            out["label_sets"][set_name] = entry
        pc_all[run.name] = H._jsonable(out)
        pc_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = pc_path.with_suffix(f".json.{os.getpid()}.part")
        tmp.write_text(json.dumps(pc_all, indent=1) + "\n")
        os.replace(tmp, pc_path)
        name = None
        if ch["chosen"] != "none":
            name = f"fusion__cal-{ch['chosen']}_{run.name.replace('__', '-')}"
            H.evaluate_run(name, run.S_val, rows_va, calibration=cals[ch["chosen"]], n_train=run.res["data"]["n_train"],
                           downstream=not a.no_downstream,
                           config={"arm": "fusion", "model": f"{run.name} + per-label {ch['chosen']} calibration (train OOF)",
                                   "base_run": run.name, "calibration_quality_oof": ch["quality_oof"], "sig": sig},
                           notes=f"{run.name} with per-label {ch['chosen']} calibration; ranking metrics are those of the base run")
        sec[run.name] = {"sig": sig, "chosen": ch["chosen"], "registered_as": name, "quality_oof": ch["quality_oof"],
                         "quality_val": out["calibration_quality"]["val"],
                         "at_precision": {s: {k: {t: v["avg_count"] for t, v in c["at_precision"].items()}
                                              for k, c in {**e["model"], "baseline": e["baseline_most_frequent"]}.items()}
                                          for s, e in out["label_sets"].items()},
                         "train_chosen": {s: e["train_chosen"] for s, e in out["label_sets"].items()}}
        S.save()
        _print_pc(run.name, pc_all[run.name])
        print(f"[calibrate] curves written to {pc_path}")


def _print_pc(name: str, d: dict) -> None:
    q = d["calibration_quality"]
    ptable(["scores", "OOF microAP", "OOF ECE", "OOF Brier", "val microAP", "val ECE", "val Brier"],
           [[("raw" if m == "none" else m) + (" *" if m == d["chosen_calibration"] else ""), q["train_oof_crossfitted"][m]["micro_ap"],
             fmt(q["train_oof_crossfitted"][m].get("ece"), 4), fmt(q["train_oof_crossfitted"][m].get("brier"), 4),
             q["val"][m]["micro_ap"], fmt(q["val"][m].get("ece"), 4), fmt(q["val"][m].get("brier"), 4)] for m in ("none", "platt", "isotonic")],
           f"calibrate {name}: quality (* = chosen on cross-fitted train OOF micro AP)")
    for s, e in d["label_sets"].items():
        base = e["baseline_most_frequent"]["points"]
        rows = []
        for i, b in enumerate(base):
            r = [f"{b['target_count']:g}", f"{b['precision']:.3f} ({b['avg_count']:.2f})"]
            for k in ("raw", "platt", "isotonic"):
                r.append(f"{e['model'][k]['points'][i]['precision']:.3f}")
            ch = "raw" if d["chosen_calibration"] == "none" else d["chosen_calibration"]
            r.append(f"{e['lift_over_baseline'][ch]['points'][i]['lift_abs']:+.3f}")
            rows.append(r)
        ptable(["count/album", "baseline (real count)", "raw", "platt", "isotonic", "lift (chosen)"], rows,
               f"precision by descriptors emitted per album - {s} ({e['n_labels']} labels)")
        rows = []
        for k, c in [("baseline", e["baseline_most_frequent"]), *e["model"].items()]:
            r = [k]
            for t in ("0.90", "0.80", "0.70"):
                x = c["crossfit_at_precision"][t]
                r += [f"{c['at_precision'][t]['avg_count']:.2f}", f"{x['avg_count']:.2f}@{fmt(x['precision'], 2)}"]
                if k != "baseline":
                    tc = e["train_chosen"][k][t]
                    r.append(f"{tc['val_count']:.2f}@{fmt(tc['val_precision'], 2)}")
                else:
                    r.append("-")
            rows.append(r)
        ptable(["scores", "p>=.9 val-opt", "xfit cnt@prec", "train-thr cnt@prec", "p>=.8 val-opt", "xfit", "train-thr",
                "p>=.7 val-opt", "xfit", "train-thr"], rows, f"largest count per album at a target precision - {s}")


# ---------------------------------------------------------------- 5. output format

def ds_metrics(W: np.ndarray, rows: np.ndarray) -> dict:
    from downstream import downstream_eval

    r = downstream_eval(W, rows, stops=STOPS, isolated=True)
    st = M.evaluate_sets(Y[rows], W)
    out = {"n_eval": r["n_eval"], "mean_n_pred": r["mean_n_pred"], "set_precision": st["micro_precision"], "set_recall": st["micro_recall"]}
    for stop, s in r["stops"].items():
        i = s["inbound"]
        out[stop] = {"ov10": s["overlap"]["mean"], "ov10_median": s["overlap"]["median"], "ov10_isolated": s["overlap_isolated"]["mean"],
                     "inbound_before": i["before_total"], "inbound_after": i["after_total"],
                     "inbound_ratio": (i["after_total"] / i["before_total"]) if i["before_total"] else None,
                     "zero_inbound_before": i["before_share_zero"], "zero_inbound_after": i["after_share_zero"]}
    return out


def ds_pool(parts: list[dict]) -> dict:
    """Combine downstream results of several row sets (CV folds): means weighted by n_eval, inbound totals summed."""
    n = np.array([p["n_eval"] for p in parts], dtype=float)
    avg = lambda f: float(sum(f(p) * w for p, w in zip(parts, n)) / n.sum())  # noqa: E731
    out = {"n_eval": int(n.sum()), "mean_n_pred": avg(lambda p: p["mean_n_pred"]), "set_precision": avg(lambda p: p["set_precision"]),
           "set_recall": avg(lambda p: p["set_recall"])}
    for stop in STOPS:
        b, af = sum(p[stop]["inbound_before"] for p in parts), sum(p[stop]["inbound_after"] for p in parts)
        out[stop] = {k: avg(lambda p, k=k: p[stop][k]) for k in ("ov10", "ov10_median", "ov10_isolated", "zero_inbound_before", "zero_inbound_after")}
        out[stop].update({"inbound_before": int(b), "inbound_after": int(af), "inbound_ratio": af / b if b else None})
    return out


def emit_policies(S_raw: np.ndarray, P: np.ndarray, ctx: dict, allowed: np.ndarray | None, quick: bool) -> dict[str, np.ndarray]:
    """Weight matrices for every output policy. S_raw = the run's scores (within-album ranking as on the
    leaderboard), P = per-label calibrated probabilities, ctx = everything fitted on train OOF."""
    ks = (5, 10) if quick else EMIT_KS
    out = {f"k{k}": scores_to_weights(S_raw, k=k) for k in ks}
    out["k10_formula-weights"] = scores_to_weights(S_raw, k=10, rank_weights="formula")
    out["k10_calibrated-rank"] = scores_to_weights(P, k=10)
    out["threshold_train-count"] = scores_to_weights(P, threshold=ctx["threshold"], min_k=1, max_k=COUNT_CLIP[1])
    out["count_predicted"] = weights_from_counts(S_raw, predict_counts(P, ctx["count_model"]))
    for lam in ((0.5,) if quick else SHARPEN):
        out[f"k10_sharpen{lam:g}"] = scores_to_weights(sharpen(P, ctx["prior"], lam), k=10)
    nn = nn_label_scores(P, ctx["prior"], ctx["B_train"], NN_M, allowed)
    for mu in ((0.5,) if quick else NN_MIX):
        out[f"k10_nnmix{mu:g}"] = scores_to_weights((1 - mu) * P + mu * nn, k=10)
    return out


def hub_gap(r: dict) -> float:
    return float(np.mean([abs(np.log(max(r[s]["inbound_ratio"] or 1e-9, 1e-9))) for s in STOPS]))


def ov_mean(r: dict) -> float:
    return float(np.mean([r[s]["ov10"] for s in STOPS]))


def cmd_emit(a, S: Summary) -> None:
    sec = S.section("emit")
    for run in find_runs(a, default_run(a, S), need_oof=True):
        n_folds = 1 if a.quick else a.oof_folds
        sig = make_sig(a, run=run.name, stamp=run.stamp, ks=list(EMIT_KS), sharpen=list(SHARPEN), nn=list(NN_MIX), oof_folds=n_folds,
                       calibration=a.calibration)
        if not a.force and sec.get(run.name, {}).get("sig") == sig:
            print(f"[skip] emit {run.name}: done for this input")
            _print_emit(run.name, sec[run.name])
            continue
        t0 = time.perf_counter()
        rows_va, rows_o = H.eval_rows("val"), run.rows_oof
        Bo = Y[rows_o] > 0
        method = a.calibration
        if method == "auto":
            method = S.d.get("calibrate", {}).get(run.name, {}).get("chosen") or "platt"
            method = "platt" if method == "none" and not is_prob(run.S_oof) else method
        P_oof = crossfit_calibrate(run.S_oof, Bo, H.cv_folds(rows_o), method)
        P_val = Calibrator(method).fit(run.S_oof, Bo)(run.S_val)
        tr_all = train_all_rows()
        target = float(N_DESC[split_rows("train")].mean())
        ctx = {"prior": YB[tr_all].mean(0), "B_train": YB[tr_all], "threshold": calibrate_threshold(P_oof, target),
               "count_model": fit_count_model(P_oof, N_DESC[rows_o])}
        fid = H.train_fold_ids()
        # train OOF pass: one CV fold of albums replaced at a time (about the size of val); neighbours for
        # the nearest-label mix come from the other folds only
        oof_parts: dict[str, list[dict]] = {}
        for f in sorted(np.unique(fid[rows_o]))[:n_folds]:
            m = fid[rows_o] == f
            allowed = np.broadcast_to(fid[tr_all][None, :] != f, (int(m.sum()), len(tr_all)))
            for pname, W in emit_policies(run.S_oof[m], P_oof[m], ctx, allowed, a.quick).items():
                oof_parts.setdefault(pname, []).append(ds_metrics(W, rows_o[m]))
            print(f"[emit] {run.name}: train-OOF fold {f} done ({time.perf_counter() - t0:.0f}s)", flush=True)
        oof = {p: ds_pool(parts) for p, parts in oof_parts.items()}
        val = {p: ds_metrics(W, rows_va) for p, W in emit_policies(run.S_val, P_val, ctx, None, a.quick).items()}
        refs = {"ref_most-frequent_k10": scores_to_weights(np.tile(ctx["prior"], (len(rows_va), 1)), k=10),
                "ref_true-set_empirical-weights": scores_to_weights(Y64[rows_va], threshold=1e-9, rank_weights=train_rank_weights())}
        val.update({p: ds_metrics(W, rows_va) for p, W in refs.items()})
        best_ov = max(oof, key=lambda p: ov_mean(oof[p]))
        close = [p for p in oof if ov_mean(oof[p]) >= ov_mean(oof[best_ov]) - a.ov_tolerance]
        chosen = min(close, key=lambda p: (hub_gap(oof[p]), -ov_mean(oof[p])))
        kc = predict_counts(P_val, ctx["count_model"])
        sec[run.name] = {
            "sig": sig, "snapshot": snapshot(), "calibration": method, "n_val": int(len(rows_va)), "n_train_oof": int(len(rows_o)),
            "oof_folds_used": n_folds, "train_mean_count": target, "threshold_from_train_oof": ctx["threshold"],
            "count_model": {"a": ctx["count_model"][0], "b": ctx["count_model"][1], "clip": list(COUNT_CLIP),
                            "val_corr_with_true_count": float(np.corrcoef(kc, N_DESC[rows_va])[0, 1]) if kc.std() > 0 else None,
                            "val_mean_predicted": float(kc.mean()), "val_mean_true": float(N_DESC[rows_va].mean())},
            "train_oof": oof, "val": val,
            "chosen_on_train_oof": {"best_overlap": best_ov, "rule": f"among policies within {a.ov_tolerance} of the best mean "
                                    "overlap@10 (balanced, mood), the inbound ratio closest to 1", "chosen": chosen},
            "note": "overlap@10 = mean share of an album's real top-10 recommendations kept when its descriptors are replaced by "
                    "the prediction (all evaluated albums replaced at once; ov10_isolated = one album at a time). inbound = how "
                    "often the evaluated albums appear in other albums' top-10 lists, before (real descriptors) / after. "
                    "train_oof rows use out-of-fold predictions, one CV fold replaced at a time; the calibrator, threshold "
                    "and count model are fitted on train OOF scores. val is for the report.",
            "seconds": round(time.perf_counter() - t0, 1)}
        S.save()
        _print_emit(run.name, sec[run.name])


def _print_emit(name: str, d: dict) -> None:
    for part, title in (("val", "VALIDATION (report)"), ("train_oof", f"TRAIN out-of-fold, {d['oof_folds_used']} fold(s) (used for the choice)")):
        rows = []
        for p, r in d[part].items():
            mark = " *" if p == d["chosen_on_train_oof"]["chosen"] else ""
            rows.append([p + mark, f"{r['mean_n_pred']:.1f}", r["set_precision"], r["balanced"]["ov10"], r["mood"]["ov10"],
                         r["balanced"]["ov10_isolated"], f"{r['balanced']['inbound_before']}->{r['balanced']['inbound_after']}",
                         fmt(r["balanced"]["inbound_ratio"], 2), f"{r['mood']['inbound_before']}->{r['mood']['inbound_after']}",
                         fmt(r["mood"]["inbound_ratio"], 2), r["balanced"]["zero_inbound_after"]])
        ptable(["policy", "n/album", "set prec", "bal ov@10", "mood ov@10", "bal iso", "bal inbound", "ratio", "mood inbound", "ratio",
                "bal zero-in"], rows, f"emit {name} [{d['calibration']} calibration] - {title} (* = chosen on train OOF)")
    c = d["count_model"]
    print(f"per-album count model: k = clip(round({c['a']:.2f} + {c['b']:.2f} * sum p), {c['clip'][0]}, {c['clip'][1]}); on val: mean "
          f"{c['val_mean_predicted']:.1f} vs true {c['val_mean_true']:.1f}, corr {fmt(c['val_corr_with_true_count'], 2)}; "
          f"global threshold from train OOF = {d['threshold_from_train_oof']:.4f}")


# ---------------------------------------------------------------- main

COMMANDS = {"meta": cmd_meta, "early": cmd_early, "stack": cmd_stack, "calibrate": cmd_calibrate, "emit": cmd_emit}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=list(COMMANDS))
    ap.add_argument("--quick", action="store_true", help="tiny grids; writes to cache/quick_fusion/ (smoke test)")
    ap.add_argument("--force", action="store_true", help="recompute even if a matching result exists")
    ap.add_argument("--no-downstream", action="store_true", help="skip the recommendation metrics in evaluate_run")
    ap.add_argument("--sources", nargs="+", default=None, choices=sorted(MF.SOURCES), help="metadata sources (default: every fetched one)")
    ap.add_argument("--min-count", type=int, default=5, help="a tag needs this many train rows to become a feature")
    ap.add_argument("--meta-Cs", nargs="+", type=float, default=None, help="C grid of the metadata-only probe")
    ap.add_argument("--transforms", nargs="+", default=None, choices=META_TRANSFORM_CHOICES, help="feature scalings tried by `meta` (CV picks; default s)")
    ap.add_argument("--spec", default="auto", help="early: audio spec, e.g. maest:7+mert:8+clap+heads (auto = linear arm's best blocks)")
    ap.add_argument("--pooling", default="mean", help="early: pooling for --spec")
    ap.add_argument("--Cs", nargs="+", type=float, default=None, help="early: C grid (default probes.DEFAULT_CS)")
    ap.add_argument("--meta-weights", nargs="+", type=float, default=None, help="early: weights of the metadata block")
    ap.add_argument("--meta-block", default="s", choices=["s", "z"], help="early: scaling of the metadata block (see fit_meta_block)")
    ap.add_argument("--runs", nargs="+", default=None, help="stack: registered run names or globs")
    ap.add_argument("--run", nargs="+", default=None, help="calibrate / emit: registered run name(s) or globs")
    ap.add_argument("--tag", default="", help="stack / early: short tag that goes into the run names")
    ap.add_argument("--runs-from", nargs="+", default=None, help="extra directories with results/val/*.json and scores/")
    ap.add_argument("--drop-no-oof", action="store_true", help="drop (instead of refusing) runs without train OOF scores")
    ap.add_argument("--calibration", default="auto", choices=["auto", "platt", "isotonic", "none"], help="emit: calibration of the scores")
    ap.add_argument("--oof-folds", type=int, default=2, help="emit: train CV folds used for the train-OOF downstream pass")
    ap.add_argument("--ov-tolerance", type=float, default=0.01, help="emit: overlap tolerance of the selection rule")
    a = ap.parse_args()
    a.meta_Cs = tuple(a.meta_Cs) if a.meta_Cs else ((1e-2, 1e-1) if a.quick else META_CS)
    a.transforms = list(a.transforms) if a.transforms else (["s"] if a.quick else list(META_TRANSFORMS))
    a.Cs = tuple(a.Cs) if a.Cs else ((1e-3, 1e-2) if a.quick else EL.DEFAULT_CS)
    a.meta_weights = tuple(a.meta_weights) if a.meta_weights else ((0.0, 1.0) if a.quick else META_WEIGHTS)
    if a.quick:   # sandbox: nothing a smoke test writes can end up on the shared leaderboard
        H.RESULTS_DIR = HERE / "cache" / "quick_fusion" / "results"
        H.SCORES_DIR = HERE / "cache" / "quick_fusion" / "scores"
    S = Summary(Path(H.RESULTS_DIR) / SUMMARY_NAME)
    s = snapshot()
    print(f"[exp_fusion] {a.command}{' --quick' if a.quick else ''}: {s['n_shards']} shards, {s['n_albums_extracted']} of "
          f"{s['n_albums_matched']} albums, n_train {s['n_train']}, n_val {s['n_val']}; results -> {H.RESULTS_DIR}", flush=True)
    t0 = time.perf_counter()
    COMMANDS[a.command](a, S)
    S.section("timing")[a.command] = round(time.perf_counter() - t0, 1)
    S.save()
    print(f"[exp_fusion] {a.command} done in {time.perf_counter() - t0:.0f}s; summary: {S.path}", flush=True)


if __name__ == "__main__":
    main()
