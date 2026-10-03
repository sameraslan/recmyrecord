"""Fusion of the three descriptor predictors: LLM annotator + audio probe + MusicBrainz/Deezer tag probe.

    P="DESCRIPTOR_SHARD_LIMIT=63 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 19 .venv/bin/python"
    $P exp_llm_fusion.py audio      # A: fresh audio probes on the pinned snapshot (val + train OOF) -> audio63__*
    $P exp_llm_fusion.py meta       # tag probe: val scores for ALL labelled val rows (+ reuses its train OOF) -> meta63__*
    $P exp_llm_fusion.py fuse       # B, C, E: fusions, tables, precision-coverage, fusion63__best, the model file
    $P exp_llm_fusion.py recs       # D: recommendation quality (recq) per run x policy
    $P exp_llm_fusion.py report     # print the tables stored in results/llm_fusion_summary.json

Everything that is fitted (fusion weights, stackers, shrinkage, score maps, thresholds, policy choice) is fitted
on TRAIN rows only: the audio / tag inputs of a train row are its out-of-fold scores, the LLM lists of the
train rows are not fitted at all (none of the annotated train albums is among the 200 prompt examples), and
every fusion is additionally CROSS-FITTED over the artist-disjoint train folds (harness.cv_folds) to get train
scores that behave like validation scores (model selection, thresholds, policy choice). Validation is only
scored; test is never touched (no DESCRIPTOR_FINAL_TEST here).

Fusions (inputs per album x descriptor: LLM listed 0/1 and rank score rs = 1 - position/15; za / zm = the
audio / tag probe's logit, z-scored with the train-OOF mean and sd):
  F1  blend        listed * (u + (1 - u) * rs) + b * za + c * zm         (u, b, c) by grid search
                   objective nDCG@10 (F1) or capped P@10 (F1cp)
  F2  stacker      per-label logistic regression on [listed, listed*rs, za, zm, prior logit, 1], L2-shrunk
                   towards one global stacker shared by all labels (strength by train cross-fit; None = global)
  F2r linear       one global least-squares regression of the true rank weight on the same six features
  F3  set+fill     the LLM's listed words always come first, re-ordered by rs + b*za + c*zm; the remaining
                   slots are filled by the audio+tag blend
  F4  gated blend  F1 fitted on known=2 albums; for known<2 albums (b, c) are multiplied by k (k by grid)
  F4s gated stack  one global stacker per `known` group (2 vs <2)
Ablations: the same forms on input subsets (LLM+audio, LLM+tags, audio+tags), `llm_cal` = the stacker on the
LLM's own list only (what re-scoring the list with label priors alone buys, no second signal).

For the final test:  fit_final() -> cache/models/llm_fusion63.pkl;  apply(llm_ann, audio_scores, meta_scores)
-> (n, 120) scores;  predict(access) is a harness.final_test callback built from the two (not run here).
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")

import argparse
import json
import pickle
import resource
import sys
import time
from pathlib import Path

import numpy as np

import exp_llm
import harness as H
import metrics as M
from common import DESCRIPTORS, HERE, N_DESC, Y, Y64, YB, label_suspect_rows, split_rows
from weights import calibrate_threshold, scores_to_weights, train_rank_weights

OUT = HERE / "results" / "llm_fusion_summary.json"
WORK = HERE / "cache" / "llm_fusion"
MODEL_PATH = HERE / "cache" / "models" / "llm_fusion63.pkl"
LLM_MODEL = "fable_fewshot200"
META_REF = "meta__mb+dz_nodesc"               # registered tag probe whose C / transform / train OOF are reused
META_NAME = "meta63__mb+dz_nodesc"
META_SOURCES = ("musicbrainz", "deezer")
AUDIO_SPECS = {"maest-1-12": [("maest:1-12", "mean")],
               "heads+clap+maest-1-12": [("heads", "mean"), ("clap", "mean"), ("maest:1-12", "mean")]}
L = len(DESCRIPTORS)
RANK_SPAN = 15.0                               # the LLM lists 8-15 words
U_GRID = (0.0, 0.25, 0.5, 0.75)
W_GRID = (0.0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6)
AM_GRID = (0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0)     # weight of zm next to 1 * za
K_GRID = (0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0)             # F4: multiplier of (b, c) for known < 2
LAMS = (10.0, 30.0, 100.0, 300.0, 1000.0, 3000.0, None)       # F2 shrinkage towards the global stacker (None = global)
LAM_INT = 1.0
OFFSET = 1000.0                                # F3: listed words above everything else
TIE = 1e-3                                     # prior logit as a tie-break, far below one rank step (1/15 * 0.25)
MIN_GROUP = 40                                 # gated fits fall back to the pooled fit below this many rows
COUNTS = (1, 2, 3, 5, 8, 10)
TARGETS = (0.90, 0.80)
N_BOOT, N_BOOT_MAP = 2000, 100
SEED = 20261001
STOPS = ("balanced", "mood")


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -50, 50)))


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=np.float64), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def train_all_rows() -> np.ndarray:
    return np.setdiff1d(split_rows("train"), label_suspect_rows())


def prior_all() -> np.ndarray:
    """Label prevalence over all train rows of the split (what exp_llm.py uses for the unlisted words)."""
    return (Y[split_rows("train")] > 0).mean(0).astype(np.float64)


def prior_logit_z(prior: np.ndarray) -> np.ndarray:
    z = logit(prior)
    return (z - z.mean()) / z.std()


# ---------------------------------------------------------------- inputs -> features

def llm_features(anns: list) -> dict:
    """listed (n, L) 0/1, rs (n, L) = 1 - position/15 for listed words (0 elsewhere), known (n,).
    An entry None / without words = no annotation (all zeros, known -1)."""
    vocab = {d: j for j, d in enumerate(DESCRIPTORS)}
    n = len(anns)
    listed, rs, known = np.zeros((n, L)), np.zeros((n, L)), np.full(n, -1, dtype=int)
    for i, a in enumerate(anns):
        if not a:
            continue
        known[i] = int(a.get("known", -1))
        pos = 0
        for w in a.get("d", []):
            j = vocab.get(w)
            if j is None or listed[i, j]:
                continue
            listed[i, j] = 1.0
            rs[i, j] = max(1.0 - pos / RANK_SPAN, 1.0 / RANK_SPAN)
            pos += 1
    return {"listed": listed, "rs": rs, "known": known}


def make_feats(anns: list | None, audio: np.ndarray | None, meta: np.ndarray | None, norm: dict) -> dict:
    """Feature dict of one row set. audio / meta = probabilities (n, L) of the probes (or None)."""
    Fd: dict = {"za": None, "zm": None, "listed": None, "rs": None, "known": None, "plz": np.asarray(norm["plz"]),
                "prior": np.asarray(norm["prior"])}
    if anns is not None:
        Fd.update(llm_features(anns))
    if audio is not None:
        Fd["za"] = (logit(audio) - norm["a_mu"]) / norm["a_sd"]
    if meta is not None:
        Fd["zm"] = (logit(meta) - norm["m_mu"]) / norm["m_sd"]
    Fd["n"] = len(next(v for v in (Fd["listed"], Fd["za"], Fd["zm"]) if v is not None))
    return Fd


def take(Fd: dict, idx: np.ndarray) -> dict:
    out = dict(Fd)
    for k in ("listed", "rs", "known", "za", "zm"):
        if Fd[k] is not None:
            out[k] = Fd[k][idx]
    out["n"] = int(len(out["known"])) if out["known"] is not None else int(len(out["za"] if out["za"] is not None else out["zm"]))
    return out


def llm_scores(Fd: dict) -> np.ndarray:
    """exp_llm.score_matrix on the feature dict: listed words 2 - 0.05 * position, the rest by the prior."""
    pos = np.rint((1.0 - Fd["rs"]) * RANK_SPAN)
    base = Fd["prior"] / (Fd["prior"].max() + 1e-9) * 0.99
    return np.where(Fd["listed"] > 0, 2.0 - 0.05 * pos, base[None, :])


# ---------------------------------------------------------------- metrics

class Objective:
    """Mean nDCG@10 and capped P@10 of a score matrix on fixed labels (same ranking / ties as metrics.py)."""

    def __init__(self, Yt: np.ndarray):
        self.Y = np.asarray(Yt, dtype=np.float64)
        self.disc = 1.0 / np.log2(np.arange(2, 12))
        self.idcg = (-np.sort(-self.Y, axis=1)[:, :10] * self.disc).sum(1)
        self.cap = np.minimum(10, (self.Y > 0).sum(1))

    def __call__(self, S: np.ndarray) -> tuple[float, float]:
        idx = np.argsort(-S, axis=1, kind="stable")[:, :10]
        gain = np.take_along_axis(self.Y, idx, 1)
        return float(((gain * self.disc).sum(1) / self.idcg).mean()), float(((gain > 0).sum(1) / self.cap).mean())


def full_metrics(Yt: np.ndarray, S: np.ndarray) -> tuple[dict, dict]:
    ev = M.evaluate(Yt, S, k=10)
    out = {"n": int(len(Yt)), "cP@10": ev["cP@10"], "P@10": ev["precision@10"], "nDCG@10": ev["ndcg@10"], "mAP": ev["mAP"],
           "perfect@10": ev["perfect@10"], "cP@5": ev["cP@5"], "P@1": float(M.precision_at_k(Yt, S, 1).mean()),
           "P@3": float(M.precision_at_k(Yt, S, 3).mean())}
    pa = ev["per_album"]
    return out, {"cP@10": pa["capped_precision"], "P@10": pa["precision"], "nDCG@10": pa["ndcg"],
                 "perfect@10": (pa["capped_precision"] == 1).astype(float)}


def ap_column(b: np.ndarray, s: np.ndarray) -> float:
    """Average precision of one label, ties handled like sklearn (one threshold per distinct score)."""
    o = np.argsort(-s, kind="stable")
    ss, tp = s[o], np.cumsum(b[o])
    if tp[-1] == 0:
        return float("nan")
    last = np.flatnonzero(np.r_[ss[1:] != ss[:-1], True])
    rec = tp[last] / tp[-1]
    return float((np.diff(np.r_[0.0, rec]) * tp[last] / (last + 1.0)).sum())


def fast_map(B: np.ndarray, S: np.ndarray) -> float:
    v = [ap_column(B[:, j], S[:, j]) for j in range(B.shape[1]) if B[:, j].any()]
    return float(np.mean(v)) if v else float("nan")


def group_boot_se(d: np.ndarray, groups: np.ndarray, n_boot: int = N_BOOT, seed: int = SEED) -> float:
    """Bootstrap SE of mean(d) when whole artist groups are resampled."""
    d = np.asarray(d, dtype=np.float64)
    if len(d) < 2:
        return float("nan")
    _, inv = np.unique(groups, return_inverse=True)
    gs, gc = np.bincount(inv, weights=d), np.bincount(inv).astype(np.float64)
    if len(gs) < 2:
        return float("nan")
    idx = np.random.default_rng(seed).integers(0, len(gs), size=(n_boot, len(gs)))
    return float((gs[idx].sum(1) / gc[idx].sum(1)).std())


def paired(per_a: dict, per_b: dict, groups: np.ndarray, mask: np.ndarray | None = None) -> dict:
    """Per-album differences a - b (same rows): mean and group-bootstrap SE per metric."""
    out = {}
    for k in ("cP@10", "P@10", "nDCG@10", "perfect@10"):
        d = per_a[k] - per_b[k]
        g = groups
        if mask is not None:
            d, g = d[mask], groups[mask]
        out[k] = {"diff": float(d.mean()) if len(d) else float("nan"), "se": group_boot_se(d, g)}
    return out


def map_diff(Yt: np.ndarray, Sa: np.ndarray, Sb: np.ndarray, groups: np.ndarray, n_boot: int = N_BOOT_MAP) -> dict:
    B = np.asarray(Yt) > 0
    point = fast_map(B, Sa) - fast_map(B, Sb)
    ug, inv = np.unique(groups, return_inverse=True)
    members = [np.flatnonzero(inv == g) for g in range(len(ug))]
    rng = np.random.default_rng(SEED + 1)
    ds = []
    for _ in range(n_boot):
        idx = np.concatenate([members[g] for g in rng.integers(0, len(ug), size=len(ug))])
        ds.append(fast_map(B[idx], Sa[idx]) - fast_map(B[idx], Sb[idx]))
    return {"diff": float(point), "se": float(np.nanstd(ds))}


# ---------------------------------------------------------------- fusion forms (fit on train rows, predict anywhere)

def _zero(Fd: dict) -> np.ndarray:
    return np.zeros((Fd["n"], L))


def blend_scores(Fd: dict, u: float, b: float, c: float, use: str) -> np.ndarray:
    s = TIE * Fd["plz"][None, :] + _zero(Fd)
    if "l" in use:
        s = s + Fd["listed"] * (u + (1.0 - u) * Fd["rs"])
    if "a" in use and b:
        s = s + b * Fd["za"]
    if "m" in use and c:
        s = s + c * Fd["zm"]
    return s


def _grids(use: str) -> tuple[tuple, tuple, tuple]:
    if "l" in use:
        return (U_GRID if len(use) > 1 else (0.0,)), (W_GRID if "a" in use else (0.0,)), (W_GRID if "m" in use else (0.0,))
    if use == "am":
        return (0.0,), (1.0,), AM_GRID
    return (0.0,), ((1.0,) if use == "a" else (0.0,)), ((1.0,) if use == "m" else (0.0,))


def fit_blend(Fd: dict, Yt: np.ndarray, use: str, objective: str = "ndcg") -> dict:
    obj = Objective(Yt)
    us, bs, cs = _grids(use)
    best, best_p = (-1.0, -1.0), None
    for u in us:
        for b in bs:
            for c in cs:
                nd, cp = obj(blend_scores(Fd, u, b, c, use))
                key = (nd, cp) if objective == "ndcg" else (cp, nd)
                if key[0] > best[0] + 1e-9 or (abs(key[0] - best[0]) <= 1e-9 and key[1] > best[1] + 1e-9):
                    best, best_p = key, {"u": u, "b": b, "c": c, "fit_ndcg": nd, "fit_cp": cp}
    return {"kind": "blend", "use": use, "objective": objective, **best_p}


def fit_gated_blend(Fd: dict, Yt: np.ndarray, use: str) -> dict:
    hi, lo = Fd["known"] >= 2, Fd["known"] < 2
    base = fit_blend(take(Fd, np.flatnonzero(hi)), Yt[hi], use) if hi.sum() >= MIN_GROUP else fit_blend(Fd, Yt, use)
    k_best, table = 1.0, {}
    if lo.sum() >= MIN_GROUP:
        Fl, obj = take(Fd, np.flatnonzero(lo)), Objective(Yt[lo])
        best = -1.0
        for k in K_GRID:
            nd, cp = obj(blend_scores(Fl, base["u"], k * base["b"], k * base["c"], use))
            table[f"{k:g}"] = nd
            if nd > best + 1e-9:
                best, k_best = nd, k
    return {"kind": "gated_blend", "use": use, "u": base["u"], "b": base["b"], "c": base["c"], "k_lo": k_best,
            "k_table_lo_ndcg": table, "n_hi": int(hi.sum()), "n_lo": int(lo.sum())}


def f3_scores(Fd: dict, b: float, c: float, cf: float, use: str) -> np.ndarray:
    fill = TIE * Fd["plz"][None, :] + _zero(Fd)
    inner = Fd["rs"].copy()
    if "a" in use:
        fill = fill + Fd["za"]
        inner = inner + b * Fd["za"]
    if "m" in use:
        fill = fill + (cf if "a" in use else 1.0) * Fd["zm"]
        inner = inner + c * Fd["zm"]
    return np.where(Fd["listed"] > 0, OFFSET + inner, fill)


def fit_f3(Fd: dict, Yt: np.ndarray, use: str) -> dict:
    cf = fit_blend(Fd, Yt, "am")["c"] if ("a" in use and "m" in use) else 1.0
    obj = Objective(Yt)
    best, bp = -1.0, None
    for b in (W_GRID if "a" in use else (0.0,)):
        for c in (W_GRID if "m" in use else (0.0,)):
            nd, cp = obj(f3_scores(Fd, b, c, cf, use))
            if nd > best + 1e-9:
                best, bp = nd, {"b": b, "c": c, "fit_ndcg": nd, "fit_cp": cp}
    return {"kind": "f3", "use": use, "cf": cf, **bp}


def design(Fd: dict, use: str) -> tuple[np.ndarray, list[str]]:
    cols, names = [], []
    if "l" in use:
        cols += [Fd["listed"], Fd["listed"] * Fd["rs"]]
        names += ["listed", "listed*rs"]
    if "a" in use:
        cols.append(Fd["za"])
        names.append("za")
    if "m" in use:
        cols.append(Fd["zm"])
        names.append("zm")
    cols += [np.broadcast_to(Fd["plz"][None, :], (Fd["n"], L)), np.ones((Fd["n"], L))]
    names += ["prior_logit_z", "1"]
    return np.stack(cols, 2), names


def fit_global(X: np.ndarray, B: np.ndarray) -> np.ndarray:
    from exp_fusion import batched_logistic

    d = X.shape[2]
    return batched_logistic(X.reshape(1, -1, d), B.reshape(1, -1).astype(np.float64), np.zeros(d), np.full(d, 1e-3))[0]


def fit_perlabel(X: np.ndarray, B: np.ndarray, Wg: np.ndarray, lam: float | None) -> np.ndarray:
    from exp_fusion import batched_logistic

    if lam is None:
        return np.tile(Wg, (L, 1))
    d = X.shape[2]
    return batched_logistic(X.transpose(1, 0, 2), B.T.astype(np.float64), Wg, np.r_[np.full(d - 1, lam), LAM_INT])


def stack_predict(X: np.ndarray, W: np.ndarray) -> np.ndarray:
    return sigmoid((X * W[None, :, :]).sum(2))


def fit_stack(Fd: dict, Yt: np.ndarray, use: str, lam: float | None) -> dict:
    X, names = design(Fd, use)
    B = np.asarray(Yt) > 0
    Wg = fit_global(X, B)
    return {"kind": "stack", "use": use, "lam": lam, "features": names, "W_global": Wg, "W": fit_perlabel(X, B, Wg, lam)}


def select_lam(Fd: dict, Yt: np.ndarray, rows: np.ndarray, use: str) -> tuple[float | None, dict]:
    """Shrinkage strength by cross-fitted train nDCG@10 (ties -> stronger shrinkage)."""
    X, _ = design(Fd, use)
    B = np.asarray(Yt) > 0
    oof = {lam: np.full(Yt.shape, np.nan) for lam in LAMS}
    for fit, held in H.cv_folds(rows):
        Wg = fit_global(X[fit], B[fit])
        for lam in LAMS:
            oof[lam][held] = stack_predict(X[held], fit_perlabel(X[fit], B[fit], Wg, lam))
    obj = Objective(Yt)
    table = {lam: obj(oof[lam]) for lam in LAMS}
    best = max(LAMS, key=lambda lam: (round(table[lam][0], 6), np.inf if lam is None else lam))
    return best, {("global" if lam is None else f"{lam:g}"): {"nDCG@10": v[0], "cP@10": v[1]} for lam, v in table.items()}


def fit_gated_stack(Fd: dict, Yt: np.ndarray, use: str) -> dict:
    X, names = design(Fd, use)
    B = np.asarray(Yt) > 0
    hi, lo = Fd["known"] >= 2, Fd["known"] < 2
    W_all = fit_global(X, B)
    return {"kind": "gated_stack", "use": use, "features": names, "n_hi": int(hi.sum()), "n_lo": int(lo.sum()),
            "W_hi": fit_global(X[hi], B[hi]) if hi.sum() >= MIN_GROUP else W_all,
            "W_lo": fit_global(X[lo], B[lo]) if lo.sum() >= MIN_GROUP else W_all}


def fit_linear_rank(Fd: dict, Yt: np.ndarray, use: str) -> dict:
    """One global least-squares fit of the true rank weight (0 = absent) on the stacker's features."""
    X, names = design(Fd, use)
    A = X.reshape(-1, X.shape[2])
    w = np.linalg.solve(A.T @ A + 1e-6 * np.eye(A.shape[1]), A.T @ np.asarray(Yt, dtype=np.float64).ravel())
    return {"kind": "linear", "use": use, "features": names, "w": w}


FEW_PARAMS = ("blend", "gated_blend", "f3", "linear", "llm", "raw")     # forms with at most a handful of fitted numbers


def threshold_scores(fit, p: dict, Fd: dict, Yt: np.ndarray, rows: np.ndarray, S_crossfit: np.ndarray | None = None) -> np.ndarray:
    """TRAIN scores on which global thresholds / score maps are fitted. Per-label stackers: the cross-fitted
    scores. Forms with a handful of parameters: the final parameters applied to the train rows (their probe
    inputs are out-of-fold already) - cross-fitted scores of such a form mix five slightly different scales
    (u, b, c differ per fold), which shifts a global threshold; the optimism of <= 6 numbers is negligible."""
    if p["kind"] in FEW_PARAMS:
        return predict_params(p, Fd)
    return crossfit(fit, Fd, Yt, rows) if S_crossfit is None else S_crossfit


def predict_params(p: dict, Fd: dict) -> np.ndarray:
    k = p["kind"]
    if k == "linear":
        return (design(Fd, p["use"])[0] * np.asarray(p["w"])[None, None, :]).sum(2)
    if k == "llm":
        return llm_scores(Fd)
    if k == "raw":                      # a probe's own probability
        z, mu, sd = (Fd["za"], p["mu"], p["sd"]) if p["use"] == "a" else (Fd["zm"], p["mu"], p["sd"])
        return sigmoid(z * sd + mu)
    if k == "blend":
        return blend_scores(Fd, p["u"], p["b"], p["c"], p["use"])
    if k == "gated_blend":
        S = blend_scores(Fd, p["u"], p["b"], p["c"], p["use"])
        lo = Fd["known"] < 2
        if lo.any():
            S[lo] = blend_scores(take(Fd, np.flatnonzero(lo)), p["u"], p["k_lo"] * p["b"], p["k_lo"] * p["c"], p["use"])
        return S
    if k == "f3":
        return f3_scores(Fd, p["b"], p["c"], p["cf"], p["use"])
    if k == "stack":
        return stack_predict(design(Fd, p["use"])[0], np.asarray(p["W"]))
    if k == "gated_stack":
        X = design(Fd, p["use"])[0]
        lo = (Fd["known"] < 2)[:, None, None]
        return sigmoid((X * np.where(lo, np.asarray(p["W_lo"])[None, None, :], np.asarray(p["W_hi"])[None, None, :])).sum(2))
    raise ValueError(k)


def methods_for(use: str, lam: float | None) -> dict:
    """name -> fit(Fd, Yt) for the fusions of one input set ("lam" = LLM + audio + tags, "lm", "la", "am")."""
    if "l" not in use:
        return {"blend": lambda Fd, Yt: fit_blend(Fd, Yt, use), "stack": lambda Fd, Yt: fit_stack(Fd, Yt, use, lam)}
    return {
        "F1": lambda Fd, Yt: fit_blend(Fd, Yt, use, "ndcg"),
        "F1cp": lambda Fd, Yt: fit_blend(Fd, Yt, use, "cp"),
        "F2": lambda Fd, Yt: fit_stack(Fd, Yt, use, lam),
        "F2r": lambda Fd, Yt: fit_linear_rank(Fd, Yt, use),
        "F3": lambda Fd, Yt: fit_f3(Fd, Yt, use),
        "F4": lambda Fd, Yt: fit_gated_blend(Fd, Yt, use),
        "F4s": lambda Fd, Yt: fit_gated_stack(Fd, Yt, use),
    }


def crossfit(fit, Fd: dict, Yt: np.ndarray, rows: np.ndarray) -> np.ndarray:
    out = np.full(Yt.shape, np.nan)
    for f, h in H.cv_folds(rows):
        out[h] = predict_params(fit(take(Fd, f), Yt[f]), take(Fd, h))
    assert np.isfinite(out).all(), "some train rows are in no fold"
    return out


class ScoreMap:
    """Monotone map of a fused score to a probability-like value: one global Platt fit on the fusion's
    cross-fitted TRAIN scores (2 parameters; rankings unchanged). Stored as plain numbers."""

    @staticmethod
    def fit(S_tr: np.ndarray, B: np.ndarray, kind: str | None = None) -> dict:
        from exp_fusion import LogitMap

        S_tr, B = np.asarray(S_tr, dtype=np.float64), np.asarray(B) > 0
        if kind == "f3":                # two score ranges (listed words sit OFFSET higher): one Platt fit per range
            hi = S_tr > OFFSET / 2
            return {"split": OFFSET / 2, "hi": ScoreMap.fit(S_tr[hi], B[hi]), "lo": ScoreMap.fit(S_tr[~hi], B[~hi])}
        m = LogitMap().fit(S_tr, B)
        return {"prob": bool(m.prob), "mu": float(m.mu), "sd": float(m.sd), "a": float(m.a), "b": float(m.b)}

    @staticmethod
    def apply(p: dict, S: np.ndarray) -> np.ndarray:
        S = np.asarray(S, dtype=np.float64)
        if "split" in p:
            return np.where(S > p["split"], ScoreMap.apply(p["hi"], S), ScoreMap.apply(p["lo"], S))
        x = logit(np.clip(S, 0, 1)) if p["prob"] else (S - p["mu"]) / p["sd"]
        return sigmoid(p["a"] * x + p["b"])


def jparams(p: dict) -> dict:
    return {k: (np.asarray(v).round(5).tolist() if isinstance(v, np.ndarray) else v) for k, v in p.items()}


# ---------------------------------------------------------------- stage A: audio probes

def _summary() -> dict:
    return json.loads(OUT.read_text()) if OUT.exists() else {}


def _save_summary(d: dict) -> None:
    d["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    tmp = OUT.with_suffix(f".json.{os.getpid()}.part")
    tmp.write_text(json.dumps(H._jsonable(d), indent=1, ensure_ascii=False) + "\n")
    os.replace(tmp, OUT)


def _rss_mb() -> float:
    r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return r / 2 ** 20 if sys.platform == "darwin" else r / 2 ** 10


def snapshot_info() -> dict:
    import features as F

    return {"n_shards": F.n_shards(), "shard_limit_env": os.environ.get(F.SHARD_LIMIT_ENV),
            "n_albums_extracted": len(F.album_index()), "n_train_with_audio": int(len(H.train_rows())),
            "n_val_with_audio": int(len(H.eval_rows("val"))), "n_val_labelled": int(len(split_rows("val"))),
            "n_train_labelled_no_suspects": int(len(train_all_rows()))}


def apply_audio(model: dict, Xs: list[np.ndarray]) -> np.ndarray:
    """Probabilities of the saved audio probe for per-block feature matrices (same block order)."""
    from probes import predict_logreg

    A = np.hstack([np.asarray(X, dtype=np.float32) for X in Xs])
    return predict_logreg((A - model["mean"]) / model["scale"], model["W"], model["b"])


def cmd_audio(a) -> None:
    import exp_linear as EL
    from probes import DEFAULT_CS, fit_logreg

    WORK.mkdir(parents=True, exist_ok=True)
    S = _summary()
    sec = S.setdefault("audio", {})
    S["snapshot"] = snapshot_info()
    for key in a.specs:
        t0 = time.perf_counter()
        blocks = AUDIO_SPECS[key]
        data = EL.load_blocks(blocks)
        rows_tr, rows_va = data["rows_train"], data["rows_val"]
        folds = H.cv_folds(rows_tr)
        r = EL.cv_eval(EL.FoldCache(data["Xtr"], folds, "z", None), data["Y"], "logreg", DEFAULT_CS)
        tfs = [EL.fit_block(X, "z") for X in data["Xtr"]]
        model = {"mean": np.concatenate([tf[0].mean_ for tf in tfs]), "scale": np.concatenate([tf[0].scale_ for tf in tfs])}
        A = (np.hstack(data["Xtr"]) - model["mean"]) / model["scale"]
        model["W"], model["b"] = fit_logreg(A, data["Y"] > 0, r["best"])
        S_val = apply_audio(model, data["Xva"])
        np.savez(WORK / f"audio_{key}.npz", rows_val=rows_va, S_val=S_val.astype(np.float32), rows_train=rows_tr,
                 S_oof=r["oof"].astype(np.float32), C=r["best"], mean=model["mean"], scale=model["scale"],
                 W=model["W"].astype(np.float32), b=model["b"], dims=np.array(data["dims"]))
        name = f"audio63__{key}"
        H.save_train_oof(name, r["oof"], rows_tr)
        S_all, rows_all = (S_val, rows_va) if not len(data["rows_val_missing"]) else \
            H.complete_scores(S_val, rows_va, fill=(data["Y"] > 0).mean(0))
        cv = {EL.gkey(g): v for g, v in r["table"].items()}
        res = H.evaluate_run(name, S_all, rows_all, n_train=len(rows_tr), notes="fresh audio probe for the LLM fusion",
                             config={"arm": "audio63", "model": "one-vs-rest L2 logistic regression (probes.fit_logreg)",
                                     "blocks": [list(b) for b in blocks], "block_transform": "z", "dims": data["dims"],
                                     "grid": list(DEFAULT_CS), "best": r["best"], "at_grid_edge": r["at_grid_edge"], "cv": cv,
                                     "cv_ndcg@10": r["ndcg@10"], "cv_folds": r["n_folds"],
                                     "val_rows_filled": int(len(data["rows_val_missing"]))})
        rk = res["metrics"]["ranking"]
        sec[key] = {"name": name, "n_train": int(len(rows_tr)), "n_val": int(len(rows_all)), "C": r["best"],
                    "at_grid_edge": r["at_grid_edge"], "cv": cv, "cv_ndcg@10": r["ndcg@10"], "cv_precision@10": r["precision@10"],
                    "val": {"cP@10": rk["cP@10"], "P@10": rk["precision@10"], "nDCG@10": rk["ndcg@10"], "mAP": rk["mAP"],
                            "perfect@10": rk["perfect@10"]},
                    "val_rows_missing": int(len(data["rows_val_missing"])), "seconds": round(time.perf_counter() - t0, 1)}
        _save_summary(S)
        print(f"[audio] {key}: C={r['best']:g}, OOF nDCG@10 {r['ndcg@10']:.4f}, {time.perf_counter() - t0:.0f}s, "
              f"peak RSS {_rss_mb():.0f} MB", flush=True)
    S.setdefault("peak_rss_mb", {})["audio"] = round(_rss_mb())
    _save_summary(S)


# ---------------------------------------------------------------- stage: tag probe on all labelled val rows

def meta_scores_for(rows: np.ndarray, model: dict) -> tuple[np.ndarray, np.ndarray]:
    """Tag-probe probabilities for any table rows with the saved final model (rows without tags or not
    fetched get the train prevalence, as in training). Returns (S, covered mask)."""
    import exp_fusion as EF
    from probes import predict_logreg

    rows = np.asarray(rows, dtype=int)
    ms = EF.MetaStore(list(META_SOURCES), 5)
    try:
        X, names = ms.build(rows, model["vocab_rows"], META_SOURCES, True)
        cov = ms.covered(X, names) & np.isin(rows, ms.fetched(META_SOURCES))
    finally:
        ms.close()
    assert list(names) == list(model["names"]), "metadata vocabulary changed since the tag probe was fitted"
    Sm = np.tile(model["prev"], (len(rows), 1))
    if cov.any():
        Sm[cov] = predict_logreg((X[cov] - model["mean"]) * model["gain"], model["W"], model["b"])
    return Sm, cov


def cmd_meta(a) -> None:
    import exp_fusion as EF
    from probes import fit_logreg

    WORK.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    ref = json.loads((H.RESULTS_DIR / "val" / f"{META_REF}.json").read_text())
    C, kind = float(ref["config"]["best"]), ref["config"]["report"]["best_transform"]
    tr_all, va_all = train_all_rows(), split_rows("val")
    ms = EF.MetaStore(list(META_SOURCES), 5)
    try:
        fetched = ms.fetched(META_SOURCES)
        ftr, fva = np.intersect1d(tr_all, fetched), np.intersect1d(va_all, fetched)
        X, names = ms.build(ftr, ftr, META_SOURCES, True)
        cov_tr = ms.covered(X, names)
    finally:
        ms.close()
    S_oof, rows_oof = H.load_scores(META_REF, "train_oof")
    fit_rows, Xf = ftr[cov_tr], X[cov_tr]
    reuse = np.array_equal(rows_oof, ftr) and not a.recompute_oof
    if not reuse:                       # the registered OOF scores are for other rows: redo the CV (slow)
        r = EF.cv_logreg(Xf, Y[fit_rows], fit_rows, EF.META_CS, (kind,), Xf[:0])
        C = r["best_C"]
        S_oof = EF.foldwise_prevalence(ftr)
        S_oof[cov_tr] = r["oof"]
    if kind == "z":
        mean, sd = Xf.mean(0, dtype=np.float64), Xf.std(0, dtype=np.float64)
        gain = (1.0 / np.where(sd > 1e-6, sd, 1.0))
    else:
        mean = np.zeros(Xf.shape[1])
        gain = np.full(Xf.shape[1], 1.0 / np.sqrt(max(float(np.asarray(Xf, dtype=np.float64).var(0).mean()), 1e-12)))
    W, b = fit_logreg((Xf - mean) * gain, YB[fit_rows], C)
    model = {"vocab_rows": ftr, "names": np.array(names, dtype=str), "mean": mean.astype(np.float32), "gain": gain.astype(np.float32),
             "W": W.astype(np.float32), "b": b, "prev": YB[tr_all].mean(0), "C": C, "transform": kind}
    S_va, cov_va = meta_scores_for(fva, model)
    np.savez(WORK / "meta.npz", rows_val=fva, S_val=S_va.astype(np.float32), cov_val=cov_va, rows_train=ftr,
             S_oof=np.asarray(S_oof, dtype=np.float32), cov_train=cov_tr, **model)
    check = {}
    try:                                # the registered run (another snapshot's val rows): same model up to the optimiser
        So, ro = H.load_scores(META_REF, "val")
        both = np.intersect1d(ro, fva)
        d = np.abs(So[np.searchsorted(ro, both)] - S_va[np.searchsorted(fva, both)])
        check = {"n_common_rows": int(len(both)), "max_abs_diff": float(d.max()), "mean_abs_diff": float(d.mean())}
    except Exception as e:  # noqa: BLE001
        check = {"error": repr(e)}
    can = H.eval_rows("val")
    assert np.isin(can, fva).all()
    H.save_train_oof(META_NAME, S_oof, ftr)
    res = H.evaluate_run(META_NAME, S_va[np.searchsorted(fva, can)], can, n_train=len(fit_rows),
                         notes=f"tag probe {META_REF} re-registered on this snapshot's val rows (C and train OOF "
                               f"{'reused' if reuse else 'recomputed'}; final fit redone to score all labelled val rows)",
                         config={"arm": "meta63", "sources": list(META_SOURCES), "drop_descriptor_tags": True, "C": C,
                                 "transform": kind, "n_features": len(names), "oof_reused_from": META_REF if reuse else None})
    all_m, _ = full_metrics(Y[fva], S_va)
    S = _summary()
    S["meta"] = {"name": META_NAME, "C": C, "transform": kind, "n_features": len(names), "n_train_fit": int(len(fit_rows)),
                 "n_train_oof_rows": int(len(ftr)), "oof_reused": bool(reuse), "n_val_all": int(len(fva)),
                 "n_val_with_metadata": int(cov_va.sum()), "val_all_601": all_m, "check_vs_registered": check,
                 "val_canonical": {k: res["metrics"]["ranking"][j] for k, j in (("cP@10", "cP@10"), ("nDCG@10", "ndcg@10"), ("mAP", "mAP"))},
                 "seconds": round(time.perf_counter() - t0, 1)}
    S.setdefault("peak_rss_mb", {})["meta"] = round(_rss_mb())
    _save_summary(S)
    print(f"[meta] C={C:g} ({kind}), {len(fit_rows)} fit rows, OOF {'reused' if reuse else 'recomputed'}; all {len(fva)} val rows: "
          f"cP@10 {all_m['cP@10']:.4f} nDCG@10 {all_m['nDCG@10']:.4f}; check vs registered {check}; "
          f"{time.perf_counter() - t0:.0f}s, peak RSS {_rss_mb():.0f} MB")


# ---------------------------------------------------------------- loading the three inputs

def load_inputs(audio_key: str | None = None) -> dict:
    """Annotations, audio probe scores (the spec with the best train-OOF nDCG@10 unless given), tag probe
    scores, and the normalisation constants (train OOF statistics)."""
    ann_tr, _ = exp_llm.load_annotations(LLM_MODEL, "train")
    ann_va, _ = exp_llm.load_annotations(LLM_MODEL, "val")
    audio = {}
    for key in AUDIO_SPECS:
        p = WORK / f"audio_{key}.npz"
        if p.exists():
            z = np.load(p)
            audio[key] = {k: z[k] for k in ("rows_val", "S_val", "rows_train", "S_oof")}
            audio[key]["oof_ndcg"] = float(M.ndcg_at_k(Y[z["rows_train"]], z["S_oof"].astype(np.float64), 10).mean())
    assert audio, "run `exp_llm_fusion.py audio` first"
    key = audio_key or max(audio, key=lambda k: audio[k]["oof_ndcg"])
    z = np.load(WORK / "meta.npz")
    meta = {k: z[k] for k in ("rows_val", "S_val", "rows_train", "S_oof", "cov_val", "cov_train")}
    la, lm = logit(audio[key]["S_oof"]), logit(meta["S_oof"])
    prior = prior_all()
    norm = {"a_mu": float(la.mean()), "a_sd": float(la.std()), "m_mu": float(lm.mean()), "m_sd": float(lm.std()),
            "prior": prior, "plz": prior_logit_z(prior)}
    return {"ann_train": ann_tr, "ann_val": ann_va, "audio": audio, "audio_key": key, "meta": meta, "norm": norm}


def _at(S: np.ndarray, rows_have: np.ndarray, rows_want: np.ndarray) -> np.ndarray:
    idx = np.searchsorted(rows_have, rows_want)
    assert np.array_equal(rows_have[idx], rows_want)
    return np.asarray(S[idx], dtype=np.float64)


def feats_for(inp: dict, rows: np.ndarray, split: str, use: str) -> dict:
    """Features of train rows (probe inputs = out-of-fold scores) or val rows (final probe scores)."""
    ann = inp["ann_train"] if split == "train" else inp["ann_val"]
    au, me = inp["audio"][inp["audio_key"]], inp["meta"]
    ra, Sa = (au["rows_train"], au["S_oof"]) if split == "train" else (au["rows_val"], au["S_val"])
    rm, Sm = (me["rows_train"], me["S_oof"]) if split == "train" else (me["rows_val"], me["S_val"])
    return make_feats([ann[int(r)] for r in rows] if "l" in use else None,
                      _at(Sa, ra, rows) if "a" in use else None, _at(Sm, rm, rows) if "m" in use else None, inp["norm"])


def row_sets(inp: dict) -> dict:
    au, me = inp["audio"][inp["audio_key"]], inp["meta"]
    ltr = np.setdiff1d(np.array(sorted(inp["ann_train"]), dtype=int), label_suspect_rows())
    ltr = ltr[H.load_splits()[ltr] == "train"]
    lva = np.array(sorted(inp["ann_val"]), dtype=int)
    tr_am = np.intersect1d(au["rows_train"], me["rows_train"])
    va_can = H.eval_rows("val")
    va_a = np.intersect1d(np.intersect1d(au["rows_val"], me["rows_val"]), lva)
    return {"train_lam": np.intersect1d(ltr, tr_am), "train_lm": np.intersect1d(ltr, me["rows_train"]), "train_am": tr_am,
            "val_audio": va_a, "val_all": np.intersect1d(lva, me["rows_val"]), "val_canonical": va_can,
            "n_train_llm": int(len(ltr)), "n_train_audio": int(len(au["rows_train"])), "n_val_llm": int(len(lva))}


# ---------------------------------------------------------------- stage B: fusion arms

def by_known(per: dict, per_llm: dict, known: np.ndarray, groups: np.ndarray, Yt: np.ndarray, S: np.ndarray) -> dict:
    out = {}
    for name, mask in (("known=2", known >= 2), ("known<2", known < 2)):
        if mask.sum() < 5:
            continue
        out[name] = {"n": int(mask.sum()), **{k: float(per[k][mask].mean()) for k in ("cP@10", "P@10", "nDCG@10", "perfect@10")},
                     "mAP": fast_map(Yt[mask] > 0, S[mask]), "diff_vs_llm": paired(per, per_llm, groups, mask)}
    if len(out) == 2:
        inter = {}
        for k in ("cP@10", "nDCG@10"):
            lo, hi = out["known<2"]["diff_vs_llm"][k], out["known=2"]["diff_vs_llm"][k]
            inter[k] = {"diff": lo["diff"] - hi["diff"], "se": float(np.hypot(lo["se"], hi["se"]))}
        out["gain_known<2_minus_gain_known=2"] = inter
    return out


def run_arm(tag: str, inp: dict, use: str, rows_tr: np.ndarray, rows_va: np.ndarray, extra_val: dict | None = None,
            with_map_se: bool = True) -> dict:
    """All fusion forms of one input set, fitted on rows_tr, reported on rows_va (and cross-fitted on rows_tr)."""
    t0 = time.perf_counter()
    Ftr, Fva = feats_for(inp, rows_tr, "train", use), feats_for(inp, rows_va, "val", use)
    Ytr, Yva = Y[rows_tr].astype(np.float64), Y[rows_va].astype(np.float64)
    groups_tr, groups_va = H.artist_groups()[rows_tr], H.artist_groups()[rows_va]
    lam, lam_table = select_lam(Ftr, Ytr, rows_tr, use)
    entries: dict[str, dict] = {}

    def add(name: str, params: dict, S_va: np.ndarray, S_tr: np.ndarray, fitted: bool) -> None:
        entries[name] = {"params": params, "S_val": S_va, "S_train": S_tr, "fitted": fitted,
                         "S_train_thr": threshold_scores(None, params, Ftr, Ytr, rows_tr, S_tr)}

    norm = inp["norm"]
    raw = {"a": {"kind": "raw", "use": "a", "mu": norm["a_mu"], "sd": norm["a_sd"]},
           "m": {"kind": "raw", "use": "m", "mu": norm["m_mu"], "sd": norm["m_sd"]}}
    if "l" in use:
        add("llm", {"kind": "llm"}, llm_scores(Fva), llm_scores(Ftr), False)
        lam_l, _ = select_lam(Ftr, Ytr, rows_tr, "l")
        fit = lambda Fd, Yt: fit_stack(Fd, Yt, "l", lam_l)  # noqa: E731
        p = fit(Ftr, Ytr)
        add("llm_cal", p, predict_params(p, Fva), crossfit(fit, Ftr, Ytr, rows_tr), True)
    for s, nm in (("a", "audio"), ("m", "meta")):
        if s in use:
            add(nm, raw[s], predict_params(raw[s], Fva), predict_params(raw[s], Ftr), False)
    subsets = [use] if len(use) < 3 else ["la", "lm", "am", use]
    for sub in subsets:
        if len(sub) < 2:
            continue
        sub_lam = lam if sub == use else select_lam(Ftr, Ytr, rows_tr, sub)[0]
        for mname, fit in methods_for(sub, sub_lam).items():
            if sub != use and mname not in ("F1", "F2", "blend", "stack"):
                continue                # ablations: the blend and the stacker only
            p = fit(Ftr, Ytr)
            label = ("" if sub == use else {"lm": "llm+meta ", "la": "llm+audio ", "am": "audio+meta "}[sub]) + mname
            add(label, p, predict_params(p, Fva), crossfit(fit, Ftr, Ytr, rows_tr), True)
    for name, S_va in (extra_val or {}).items():
        entries[name] = {"params": {"kind": "external"}, "S_val": S_va, "S_train": None, "S_train_thr": None, "fitted": True}

    res: dict = {"tag": tag, "use": use, "n_train_fit": int(len(rows_tr)), "n_val": int(len(rows_va)),
                 "F2_lam": lam, "F2_lam_table_train_crossfit": lam_table, "methods": {}}
    per_va, per_tr = {}, {}
    for name, e in entries.items():
        mv, per_va[name] = full_metrics(Yva, e["S_val"])
        d = {"params": jparams(e["params"]), "val": mv}
        if e["S_train"] is not None:
            mt, per_tr[name] = full_metrics(Ytr, e["S_train"])
            d["train_crossfit" if e["fitted"] else "train"] = mt
        res["methods"][name] = d
    base = "llm" if "llm" in entries else next(iter(entries))
    res["baseline_for_differences"] = base
    kv, kt = Fva.get("known"), Ftr.get("known")
    for name, e in entries.items():
        if name == base:
            continue
        d = res["methods"][name]
        d["val_diff_vs_" + base] = paired(per_va[name], per_va[base], groups_va)
        if with_map_se:
            d["val_diff_vs_" + base]["mAP"] = map_diff(Yva, e["S_val"], entries[base]["S_val"], groups_va)
        if name in per_tr:
            d["train_diff_vs_" + base] = paired(per_tr[name], per_tr[base], groups_tr)
    if kv is not None:
        for name, e in entries.items():
            d = res["methods"][name]
            d["val_by_known"] = by_known(per_va[name], per_va[base], kv, groups_va, Yva, e["S_val"])
            if name in per_tr:
                d["train_by_known"] = by_known(per_tr[name], per_tr[base], kt, groups_tr, Ytr, e["S_train"])
    res["seconds"] = round(time.perf_counter() - t0, 1)
    return {"res": res, "entries": entries, "Ftr": Ftr, "Fva": Fva, "Ytr": Ytr, "Yva": Yva, "rows_tr": rows_tr, "rows_va": rows_va}


def pick_best(arm: dict, candidates: list[str]) -> str:
    """Model selection on TRAIN: the candidate with the best cross-fitted nDCG@10 (ties -> cP@10)."""
    m = arm["res"]["methods"]
    return max(candidates, key=lambda n: (m[n]["train_crossfit"]["nDCG@10"], m[n]["train_crossfit"]["cP@10"]))


# ---------------------------------------------------------------- stage C: precision - coverage

def honest_pc(Ytr: np.ndarray, Str: np.ndarray, Yva: np.ndarray, Sva: np.ndarray, cols: np.ndarray | None = None) -> dict:
    """Thresholds chosen on TRAIN scores (count-matched for each requested average count; the lowest
    threshold with train precision >= target for the precision operating points), applied to val."""
    if cols is not None:
        Ytr, Str, Yva, Sva = Ytr[:, cols], Str[:, cols], Yva[:, cols], Sva[:, cols]
    flat = np.sort(np.asarray(Str, dtype=np.float64).ravel())[::-1]
    out: dict = {"n_train": int(len(Str)), "n_val": int(len(Sva)), "counts": [], "targets": {}}
    for c in COUNTS:
        t = float(flat[min(max(int(round(c * len(Str))), 1), len(flat)) - 1])
        tr, va = H.apply_threshold(Ytr, Str, t), H.apply_threshold(Yva, Sva, t)
        out["counts"].append({"target_count": c, "threshold": t, "train_count": tr["avg_count"], "train_precision": tr["precision"],
                              "val_count": va["avg_count"], "val_precision": va["precision"], "val_share_ge1": va["share_albums_ge1"]})
    for p in TARGETS:
        t = H.choose_threshold(Ytr, Str, p, min_emitted=max(1, len(Str) // 4))
        tr, va = H.apply_threshold(Ytr, Str, t), H.apply_threshold(Yva, Sva, t)
        out["targets"][f"{p:.2f}"] = {"threshold": t, "train_count": tr["avg_count"], "train_precision": tr["precision"],
                                      "val_count": va["avg_count"], "val_precision": va["precision"],
                                      "val_share_ge1": va["share_albums_ge1"]}
    pc = H.precision_coverage(Yva, Sva, counts=COUNTS, targets=TARGETS)
    out["val_itself_optimistic"] = {"points": [{"target_count": q["target_count"], "avg_count": q["avg_count"], "precision": q["precision"]}
                                               for q in pc["points"] if not q.get("is_mean_true_count")],
                                    "at_precision": {t: {"avg_count": v["avg_count"], "precision": v["precision"]}
                                                     for t, v in pc["at_precision"].items()}}
    return out


def first_k_precision(anns: list, Yt: np.ndarray, cols: np.ndarray | None = None) -> dict:
    """Micro precision of the first k words of the LLM's own list, k = 1..10 (and of the whole list). With
    `cols`, the list is first restricted to those columns (the first k MOOD words)."""
    vocab = {d: j for j, d in enumerate(DESCRIPTORS)}
    ok = None if cols is None else set(int(c) for c in cols)
    lists = [[vocab[w] for w in a["d"] if w in vocab and (ok is None or vocab[w] in ok)] for a in anns]
    B = np.asarray(Yt) > 0
    out = {}
    for k in list(range(1, 11)) + [None]:
        emitted = hits = 0
        for i, ws in enumerate(lists):
            sel = ws if k is None else ws[:k]
            emitted += len(sel)
            hits += int(B[i, sel].sum())
        out["all" if k is None else str(k)] = {"precision": hits / max(emitted, 1), "avg_count": emitted / len(lists)}
    return out


def pc_section(arm: dict, names: list[str], inp: dict, mood_cols: np.ndarray) -> dict:
    """Honest precision-coverage of the named methods of one arm (+ most frequent + the LLM's first k words)."""
    from exp_fusion import Calibrator

    Ytr, Yva, e = arm["Ytr"], arm["Yva"], arm["entries"]
    prev = inp["norm"]["prior"]
    runs = {"most_frequent": (np.tile(prev, (len(Ytr), 1)), np.tile(prev, (len(Yva), 1)))}
    for n in names:
        if n not in e or e[n]["S_train"] is None:
            continue
        runs[n] = (e[n]["S_train_thr"], e[n]["S_val"])
        if e[n]["fitted"] and e[n]["params"]["kind"] not in ("f3",) and n != "llm_cal":   # per-label Platt (cross-label comparability)
            cal = Calibrator("platt").fit(e[n]["S_train_thr"], Ytr > 0)
            runs[n + " + per-label Platt"] = (cal(e[n]["S_train_thr"]), cal(e[n]["S_val"]))
    out = {"n_train": int(len(Ytr)), "n_val": int(len(Yva)), "all_120": {}, "mood_114": {}}
    for n, (st, sv) in runs.items():
        out["all_120"][n] = honest_pc(Ytr, st, Yva, sv)
        out["mood_114"][n] = honest_pc(Ytr, st, Yva, sv, mood_cols)
    if "llm" in e:
        anns = [inp["ann_val"][int(r)] for r in arm["rows_va"]]
        out["llm_first_k_words"] = {"all_120": first_k_precision(anns, Yva), "mood_114": first_k_precision(anns, Yva, mood_cols)}
    return out


# ---------------------------------------------------------------- stage E: the final model, apply, predict

def fit_final(choice: dict | None = None, inp: dict | None = None, save: bool = True) -> dict:
    """Fit the chosen fusion forms on ALL eligible train rows and store them (cache/models/llm_fusion63.pkl):
    "lam" (LLM + audio + tags), "lm" (LLM + tags: albums without audio), "am" (audio + tags: albums the LLM
    cannot know). `choice` = {"lam": method, "lm": method, "am": method, "lams": {...}}; default: the
    selection stored in results/llm_fusion_summary.json. Each sub-model carries a global Platt map fitted on
    its train scores (see threshold_scores; apply(..., proba=True))."""
    inp = inp or load_inputs((_summary().get("selection") or {}).get("audio_key"))
    choice = choice or _summary()["selection"]
    rs = row_sets(inp)
    model = {"version": 1, "llm_model": LLM_MODEL, "audio_key": inp["audio_key"], "audio_name": f"audio63__{inp['audio_key']}",
             "meta_name": META_NAME, "norm": inp["norm"], "choice": choice, "sub": {}, "descriptors": list(DESCRIPTORS)}
    for use, rows in (("lam", rs["train_lam"]), ("lm", rs["train_lm"]), ("am", rs["train_am"])):
        Fd, Yt = feats_for(inp, rows, "train", use), Y[rows].astype(np.float64)
        fit = methods_for(use, choice["lams"].get(use))[choice[use]]
        p = fit(Fd, Yt)
        model["sub"][use] = {"method": choice[use], "params": p, "n_train": int(len(rows)),
                             "platt": ScoreMap.fit(threshold_scores(fit, p, Fd, Yt, rows), Yt > 0, p["kind"])}
    if save:
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(model, f)
    return model


def load_model() -> dict:
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def apply(llm_ann: list | None, audio_scores: np.ndarray | None, meta_scores: np.ndarray | None, *,
          model: dict | None = None, proba: bool = False, return_route: bool = False):
    """Fused scores (n, 120) in DESCRIPTORS order.

    llm_ann       list of n annotations {"known": 0|1|2, "d": [words in rank order]} (None / empty = the
                  model has no annotation for that album), or None
    audio_scores  (n, 120) probabilities of the audio probe `model["audio_name"]` (rows of NaN = no audio), or None
    meta_scores   (n, 120) probabilities of the tag probe (rows without tags carry the train prevalence, as
                  the probe emits them); None / NaN rows are replaced by the train prevalence
    Every album is routed to the sub-model its inputs allow: LLM+audio+tags, LLM+tags, audio+tags, tags only.
    proba=True returns each sub-model's global-Platt probability instead of its ranking score (scores of
    different sub-models are not on one scale otherwise)."""
    model = model or load_model()
    n = next(len(x) for x in (llm_ann, audio_scores, meta_scores) if x is not None)
    norm = model["norm"]
    meta = np.tile(norm["prior"], (n, 1)) if meta_scores is None else np.array(meta_scores, dtype=np.float64)
    bad = ~np.isfinite(meta).all(1)
    meta[bad] = norm["prior"]
    has_a = np.zeros(n, dtype=bool) if audio_scores is None else np.isfinite(np.asarray(audio_scores, dtype=np.float64)).all(1)
    has_l = np.array([bool(a and a.get("d")) for a in llm_ann], dtype=bool) if llm_ann is not None else np.zeros(n, dtype=bool)
    S = np.full((n, L), np.nan)
    route = np.empty(n, dtype=object)
    for use, mask in (("lam", has_l & has_a), ("lm", has_l & ~has_a), ("am", ~has_l & has_a), ("m", ~has_l & ~has_a)):
        if not mask.any():
            continue
        idx = np.flatnonzero(mask)
        route[idx] = use
        if use == "m":
            S[idx] = meta[idx]
            continue
        sub = model["sub"][use]
        Fd = make_feats([llm_ann[i] for i in idx] if "l" in use else None,
                        np.asarray(audio_scores, dtype=np.float64)[idx] if "a" in use else None, meta[idx], norm)
        s = predict_params(sub["params"], Fd)
        S[idx] = ScoreMap.apply(sub["platt"], s) if proba else s
    return (S, route) if return_route else S


def predict(access) -> tuple[np.ndarray, np.ndarray]:
    """harness.final_test callback (NOT run by this script): audio probe on the test rows' features, tag probe,
    LLM annotations cache/llm/out/<model>/test_*.json, then apply()."""
    model = load_model()
    rows = np.asarray(access.rows, dtype=int)
    z = np.load(WORK / f"audio_{model['audio_key']}.npz")
    feats = [access.album_features(spec, pooling) for spec, pooling in AUDIO_SPECS[model["audio_key"]]]
    common_rows = feats[0][1]
    for _, r in feats[1:]:
        common_rows = np.intersect1d(common_rows, r)
    audio = np.full((len(rows), L), np.nan)
    if len(common_rows):
        Pa = apply_audio({k: z[k] for k in ("mean", "scale", "W", "b")}, [X[np.searchsorted(r, common_rows)] for X, r in feats])
        audio[np.searchsorted(rows, common_rows)] = Pa
    zm = np.load(WORK / "meta.npz")
    meta, _ = meta_scores_for(rows, {k: zm[k] for k in ("vocab_rows", "names", "mean", "gain", "W", "b", "prev")})
    ann, _ = exp_llm.load_annotations(model["llm_model"], "test")
    return apply([ann.get(int(r)) for r in rows], audio, meta, model=model), rows


# ---------------------------------------------------------------- cmd fuse

def cmd_fuse(a) -> None:
    from exp_fusion import MOOD_COLS

    t_all = time.perf_counter()
    inp = load_inputs(a.audio_key)
    rs = row_sets(inp)
    S = _summary()
    S["snapshot"] = {**snapshot_info(), "n_train_llm": rs["n_train_llm"], "n_train_llm+audio+tags": int(len(rs["train_lam"])),
                     "n_train_audio+tags": int(len(rs["train_am"])), "n_train_llm+tags": int(len(rs["train_lm"])),
                     "n_val_llm": rs["n_val_llm"], "n_val_audio_with_all_inputs": int(len(rs["val_audio"])),
                     "n_val_canonical": int(len(rs["val_canonical"])), "n_val_all": int(len(rs["val_all"])),
                     "audio_key": inp["audio_key"], "audio_oof_ndcg": {k: v["oof_ndcg"] for k, v in inp["audio"].items()},
                     "known_val_audio": {str(k): int(v) for k, v in zip(*np.unique(
                         [inp["ann_val"][int(r)]["known"] for r in rs["val_audio"]], return_counts=True))},
                     "known_val_all": {str(k): int(v) for k, v in zip(*np.unique(
                         [inp["ann_val"][int(r)]["known"] for r in rs["val_all"]], return_counts=True))},
                     "known_train_lam": {str(k): int(v) for k, v in zip(*np.unique(
                         [inp["ann_train"][int(r)]["known"] for r in rs["train_lam"]], return_counts=True))}}
    print(f"[fuse] snapshot {S['snapshot']}", flush=True)

    # LLM + tags, fitted on every annotated train row, reported on ALL labelled val rows
    arm_lm = run_arm("val_all_601", inp, "lm", rs["train_lm"], rs["val_all"])
    lm_cands = ["F1", "F1cp", "F2", "F2r", "F3", "F4", "F4s"]
    best_lm = pick_best(arm_lm, lm_cands)
    print(f"[fuse] LLM+tags arm done in {arm_lm['res']['seconds']}s; best on train cross-fit: {best_lm}", flush=True)
    # audio + tags without the LLM, fitted on every train row with audio
    arm_am = run_arm("audio+meta", inp, "am", rs["train_am"], rs["val_audio"], with_map_se=False)
    best_am = pick_best(arm_am, ["blend", "stack"])
    # everything, on the val rows with audio; the 601-row LLM+tags model and the larger-train audio+tags model ride along
    pos = np.searchsorted(rs["val_all"], rs["val_audio"])
    extra = {f"llm+meta {best_lm} (fit on all {len(rs['train_lm'])} LLM train rows)": arm_lm["entries"][best_lm]["S_val"][pos],
             f"audio+meta {best_am} (fit on all {len(rs['train_am'])} audio train rows)": arm_am["entries"][best_am]["S_val"]}
    arm = run_arm("val_audio", inp, "lam", rs["train_lam"], rs["val_audio"], extra_val=extra)
    best = pick_best(arm, lm_cands)
    print(f"[fuse] full arm done in {arm['res']['seconds']}s; best fusion on train cross-fit: {best}", flush=True)

    choice = {"lam": best, "lm": best_lm, "am": best_am, "audio_key": inp["audio_key"],
              "lams": {"lam": arm["res"]["F2_lam"], "lm": arm_lm["res"]["F2_lam"], "am": arm_am["res"]["F2_lam"]},
              "rule": "best cross-fitted TRAIN nDCG@10 (ties: cP@10) among F1, F1cp, F2, F2r, F3, F4, F4s (audio+tags: blend, stack)"}
    S["selection"] = choice
    S["arms"] = {"val_audio": arm["res"], "val_all_601": arm_lm["res"], "audio+meta": arm_am["res"]}

    # C: precision - coverage
    S["precision_coverage"] = {
        "note": "thresholds chosen on TRAIN scores (see threshold_scores: cross-fitted for the per-label stackers, final "
                "parameters on the train rows' out-of-fold probe inputs for the few-parameter forms; the LLM's own train lists), applied to val; "
                "'val_itself_optimistic' = harness.precision_coverage on val for reference; mood_114 = without " +
                ", ".join(d for j, d in enumerate(DESCRIPTORS) if j not in set(MOOD_COLS.tolist())),
        "val_audio": pc_section(arm, ["llm", "llm_cal", best, "F2", "F1"], inp, MOOD_COLS),
        "val_all_601": pc_section(arm_lm, ["llm", "llm_cal", best_lm, "F2", "F1"], inp, MOOD_COLS)}

    # E: final model, the registered run, scores for the recs stage
    model = fit_final(choice, inp)
    S["final_model"] = {"path": str(MODEL_PATH), "sub": {u: {"method": s["method"], "n_train": s["n_train"], "platt": s["platt"],
                                                           "params": jparams(s["params"])} for u, s in model["sub"].items()}}
    can = rs["val_canonical"]
    au, me = inp["audio"][inp["audio_key"]], inp["meta"]
    audio_can = np.full((len(can), L), np.nan)
    hit = np.isin(can, au["rows_val"])
    audio_can[hit] = _at(au["S_val"], au["rows_val"], can[hit])
    anns_can = [inp["ann_val"].get(int(r)) for r in can]
    S_can, route = apply(anns_can, audio_can, _at(me["S_val"], me["rows_val"], can), model=model, return_route=True)
    same = float(np.abs(S_can[np.isin(can, rs["val_audio"])] - arm["entries"][best]["S_val"]).max())
    assert same < 1e-9, f"apply() does not reproduce the arm's val scores (max diff {same})"
    reg = H.evaluate_run("fusion63__best", S_can, can, n_train=len(rs["train_lam"]),
                         notes=f"LLM ({LLM_MODEL}) + audio63__{inp['audio_key']} + {META_NAME}, form {best}; contamination-prone like the LLM run",
                         config={"arm": "fusion63", "form": best, "inputs": [f"llm:{LLM_MODEL}", f"audio63__{inp['audio_key']}", META_NAME],
                                 "params": jparams(model["sub"]["lam"]["params"]), "selection": choice,
                                 "routes": {str(k): int(v) for k, v in zip(*np.unique(route.astype(str), return_counts=True))},
                                 "model_file": str(MODEL_PATH)})
    H.save_train_oof("fusion63__best", arm["entries"][best]["S_train"], rs["train_lam"])
    S["registered"] = {"name": "fusion63__best", "n_val": int(len(can)), "routes": reg["config"]["routes"],
                       "ranking": {k: reg["metrics"]["ranking"][j] for k, j in (("cP@10", "cP@10"), ("P@10", "precision@10"),
                                   ("nDCG@10", "ndcg@10"), ("mAP", "mAP"), ("perfect@10", "perfect@10"))},
                       "train_crossfit_scores": "cache/scores/fusion63__best__train_oof.npy (cross-fitted fusion on the train fit rows)"}

    def pack(arm_: dict, name: str, platt_from_train: bool = True) -> dict:
        e = arm_["entries"][name]
        out = {"S_val": e["S_val"], "S_train": e["S_train_thr"], "rows_val": arm_["rows_va"], "rows_train": arm_["rows_tr"]}
        if e["params"]["kind"] in ("stack", "gated_stack", "raw"):
            out["P_val"], out["P_train"] = e["S_val"], e["S_train_thr"]
        elif e["params"]["kind"] != "llm":
            pm = ScoreMap.fit(e["S_train_thr"], arm_["Ytr"] > 0, e["params"]["kind"])
            out["P_val"], out["P_train"] = ScoreMap.apply(pm, e["S_val"]), ScoreMap.apply(pm, e["S_train_thr"])
        return out

    runs = {"llm": pack(arm, "llm"), "fusion_best": pack(arm, best), "audio": pack(arm_am, "audio"),
            "audio+meta": pack(arm_am, best_am), "llm+meta": pack(arm, "llm+meta F1"), "llm_cal": pack(arm, "llm_cal"),
            "fusion_F2": pack(arm, "F2"), "fusion_F1": pack(arm, "F1")}
    WORK.mkdir(parents=True, exist_ok=True)
    np.savez(WORK / "scores_for_recs.npz", **{f"{r}|{k}": v for r, d in runs.items() for k, v in d.items()})
    S.setdefault("timing_seconds", {})["fuse"] = round(time.perf_counter() - t_all, 1)
    S.setdefault("peak_rss_mb", {})["fuse"] = round(_rss_mb())
    _save_summary(S)
    print_report(S)
    print(f"[fuse] {time.perf_counter() - t_all:.0f}s, peak RSS {_rss_mb():.0f} MB; wrote {OUT}")


# ---------------------------------------------------------------- stage D: recommendation quality

def _topk_values(D: np.ndarray, k: int) -> np.ndarray:
    order = np.argsort(-D, axis=1, kind="stable")[:, :k]
    W = np.zeros_like(D)
    np.put_along_axis(W, order, np.take_along_axis(D, order, 1), 1)
    return W


def rec_policies(kind: str, const: dict) -> dict:
    """label -> fn(S, P, thr) -> W. S = ranking score, P = probability-like score (None for the raw LLM list),
    thr = the calibrated-count threshold chosen on TRAIN scores."""
    def soft(S, P, thr, k=15, beta=1.0):
        c = np.clip(S if P is None else P, 0, None)
        return scores_to_weights(S, k=k) * (c / np.maximum(c.max(1, keepdims=True), 1e-12)) ** beta

    pol = {"top-10 (default)": lambda S, P, thr: scores_to_weights(S, k=10),
           "soft top-15, beta=1": soft,
           "calibrated count (train threshold)": lambda S, P, thr: scores_to_weights(S, threshold=thr)}
    if kind == "prob":
        def dense10(S, P, thr):
            W = _topk_values(P * const["mu_w"][None, :], 10)
            return W * (const["median_norm"] / np.maximum(np.linalg.norm(W, axis=1, keepdims=True), 1e-12))
        pol["dense top-10 -> train median L2"] = dense10
    if kind == "rank":
        def own(S, P, thr):
            cnt = np.clip((S >= 1).sum(1), 1, 40)
            rw, order = train_rank_weights(), np.argsort(-S, axis=1, kind="stable")
            W = np.zeros_like(S)
            for i, c in enumerate(cnt):
                W[i, order[i, :c]] = rw[:c]
            return W
        pol["the LLM's own list (8-15 words)"] = own
    return pol


REC_KEYS = ("RSQ", "R50", "ov10", "inb_ratio_iso", "genre", "ndcg", "zero_iso", "genre_real", "genre_random")


def _slim(r: dict) -> dict:
    return {"n_eval": r["n_eval"], "mean_n_nonzero": r["mean_n_nonzero"], "mean_l2": r["mean_l2"],
            "stops": {s: {k: r["stops"][s].get(k) for k in REC_KEYS} for s in STOPS}}


def cmd_recs(a) -> None:
    import recq

    t0 = time.perf_counter()
    z = np.load(WORK / "scores_for_recs.npz")
    runs: dict[str, dict] = {}
    for key in z.files:
        r, k = key.split("|")
        runs.setdefault(r, {})[k] = z[key]
    tr_all = split_rows("train")
    Ytr_all = Y64[tr_all]
    cnt = (Ytr_all > 0).sum(0)
    const = {"target_count": float(N_DESC[tr_all].mean()), "median_norm": float(np.median(np.linalg.norm(Ytr_all, axis=1))),
             "mu_w": np.where(cnt >= 5, Ytr_all.sum(0) / np.maximum(cnt, 1), Ytr_all[Ytr_all > 0].mean())}
    prev = (Ytr_all > 0).mean(0)
    rows_va, rows_tr = runs["fusion_best"]["rows_val"], runs["fusion_best"]["rows_train"]
    mf = {"S_val": np.tile(prev, (len(rows_va), 1)), "S_train": np.tile(prev, (len(rows_tr), 1)), "rows_val": rows_va, "rows_train": rows_tr}
    mf["P_val"], mf["P_train"] = mf["S_val"], mf["S_train"]
    runs["most_frequent"] = mf
    order = ["llm", "fusion_best", "fusion_F1", "fusion_F2", "llm+meta", "llm_cal", "audio", "audio+meta", "most_frequent"]
    groups = H.artist_groups()
    out: dict = {"note": "recq.evaluate, isolated variant; val = the val rows with audio; policy parameters (the calibrated-count "
                         "threshold) and the 'chosen on train' policy (best mean RSQ over the two stops) come from TRAIN scores "
                         "(fusion scores on train rows as in threshold_scores, audio OOF scores, the LLM's own train lists)",
                 "train_constants": {"target_count": const["target_count"], "median_l2": const["median_norm"]}, "runs": {}}
    # reference points on the same val rows
    Yt = Y64[rows_va]
    reenc = scores_to_weights(Yt, threshold=1e-9, rank_weights=train_rank_weights())
    refs = {"true vectors": Yt, "true set+order, train rank weights (ceiling)": reenc,
            "true top-10 only, train rank weights": scores_to_weights(Yt, k=10) * (Yt > 0),
            "all zeros (audio features only)": np.zeros_like(Yt)}
    out["reference_points_same_val_rows"] = {n: _slim(recq.evaluate(W, rows_va, all_at_once=False)) for n, W in refs.items()}
    try:
        ch = recq.chance(rows_va)
        out["reference_points_same_val_rows"]["random lists (chance)"] = {
            "n_eval": ch["n_eval"], "stops": {s: {k: ch["stops"][s].get(k) for k in REC_KEYS} for s in STOPS}}
    except Exception as e:  # noqa: BLE001
        out["chance_error"] = repr(e)
    p = HERE / "results" / "recs_summary.json"
    if p.exists():
        old = json.loads(p.read_text()).get("reference_points_runs_val_rows", {})
        out["reference_points_recs_summary_json_other_snapshot"] = {
            n: {"n_eval": r.get("n_eval"), "stops": {s: {k: r["stops"][s].get(k) for k in REC_KEYS} for s in STOPS}}
            for n, r in old.items()}
    arrays: dict[str, dict] = {}
    for name in order:
        if name not in runs:
            continue
        r = runs[name]
        kind = "rank" if "P_val" not in r else "prob"
        Sv, Pv, St, Pt = r["S_val"].astype(np.float64), r.get("P_val"), r["S_train"].astype(np.float64), r.get("P_train")
        thr = calibrate_threshold(St, const["target_count"])
        ent: dict = {"kind": kind, "n_train_rows": int(len(r["rows_train"])), "calibrated_count_threshold": thr, "policies": {}}
        for label, fn in rec_policies(kind, const).items():
            rv = recq.evaluate(fn(Sv, Pv, thr), r["rows_val"], all_at_once=False, keep_arrays=True)
            arrays[f"{name}|{label}"] = {s: {k: rv["stops"][s]["arrays"][k] for k in ("RSQ", "R50", "ov10")} for s in STOPS}
            rt = recq.evaluate(fn(St, Pt, thr), r["rows_train"], all_at_once=False)
            ent["policies"][label] = {"val": _slim(rv), "train": _slim(rt),
                                      "train_select_RSQ": float(np.mean([rt["stops"][s]["RSQ"] for s in STOPS]))}
        P = ent["policies"]
        ent["chosen_on_train"] = max(P, key=lambda l: P[l]["train_select_RSQ"])
        d0 = P["top-10 (default)"]["train"]["stops"]      # hub-ok as in exp_recs.py: inbound <= max(1.5, 1.1 x the default's), both stops
        ok = [l for l in P if all(P[l]["train"]["stops"][s]["inb_ratio_iso"] <= max(1.5, 1.1 * d0[s]["inb_ratio_iso"]) for s in STOPS)]
        ent["chosen_on_train_hub_ok"] = max(ok, key=lambda l: P[l]["train_select_RSQ"])
        out["runs"][name] = ent
        print(f"[recs] {name}: {len(ent['policies'])} policies, chosen on train: {ent['chosen_on_train']} "
              f"({time.perf_counter() - t0:.0f}s)", flush=True)
    # paired differences vs the LLM under the same policy (per-album arrays; artist-group bootstrap)
    in_cat = recq.catalogue_index(rows_va)[1]
    g = groups[rows_va[in_cat]]
    diffs: dict = {}
    for name in out["runs"]:
        if name == "llm":
            continue
        for label in out["runs"][name]["policies"]:
            base = arrays.get(f"llm|{label}") or arrays["llm|top-10 (default)"]
            mine = arrays[f"{name}|{label}"]
            diffs[f"{name} | {label}"] = {
                "vs": f"llm | {label if f'llm|{label}' in arrays else 'top-10 (default)'}",
                **{s: {k: {"diff": float((mine[s][k] - base[s][k]).mean()), "se": group_boot_se(mine[s][k] - base[s][k], g)}
                       for k in ("RSQ", "R50", "ov10")} for s in STOPS}}
    out["paired_diff_vs_llm_val"] = diffs
    out["seconds"] = round(time.perf_counter() - t0, 1)
    S = _summary()
    S["recs"] = out
    S.setdefault("timing_seconds", {})["recs"] = out["seconds"]
    S.setdefault("peak_rss_mb", {})["recs"] = round(_rss_mb())
    _save_summary(S)
    print_recs(S)
    print(f"[recs] {out['seconds']}s, peak RSS {_rss_mb():.0f} MB; wrote {OUT}")


# ---------------------------------------------------------------- printing

def _f(x, nd: int = 3) -> str:
    return "-" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:.{nd}f}"


def _pm(d: dict | None) -> str:
    return "-" if not d else f"{d['diff']:+.3f}±{_f(d['se'])}"


def print_arm(res: dict) -> None:
    base = res["baseline_for_differences"]
    print(f"\n== {res['tag']}: fitted on {res['n_train_fit']} train rows, val n={res['n_val']}  (differences vs {base}; ± = bootstrap SE over "
          f"val artist groups; F2 shrinkage {res['F2_lam']})")
    w = max(len(n) for n in res["methods"]) + 1
    print(f"{'':{w}s} {'cP@10':>6s} {'P@10':>6s} {'nDCG':>6s} {'mAP':>6s} {'perf':>6s} | {'ΔcP@10':>13s} {'ΔnDCG@10':>13s} {'ΔmAP':>13s} | "
          f"{'train-xfit cP':>13s} {'nDCG':>6s} {'ΔnDCG(train)':>13s}")
    for n, d in res["methods"].items():
        v, dv = d["val"], d.get("val_diff_vs_" + base, {})
        t = d.get("train_crossfit") or d.get("train") or {}
        dt = d.get("train_diff_vs_" + base, {})
        print(f"{n:{w}s} {_f(v['cP@10']):>6s} {_f(v['P@10']):>6s} {_f(v['nDCG@10']):>6s} {_f(v['mAP']):>6s} {_f(v['perfect@10']):>6s} | "
              f"{_pm(dv.get('cP@10')):>13s} {_pm(dv.get('nDCG@10')):>13s} {_pm(dv.get('mAP')):>13s} | "
              f"{_f(t.get('cP@10')):>13s} {_f(t.get('nDCG@10')):>6s} {_pm(dt.get('nDCG@10')):>13s}")
    if any("val_by_known" in d for d in res["methods"].values()):
        for block, title in (("val_by_known", "val"), ("train_by_known", "train (cross-fitted)")):
            print(f"  -- by `known`, {title}: cP@10 / nDCG@10 (Δ vs {base})")
            for n, d in res["methods"].items():
                bk = d.get(block)
                if not bk:
                    continue
                cells = []
                for lvl in ("known=2", "known<2"):
                    if lvl in bk:
                        x = bk[lvl]
                        cells.append(f"{lvl} n={x['n']}: {_f(x['cP@10'])} / {_f(x['nDCG@10'])} "
                                     f"(Δ {_pm(x['diff_vs_llm']['cP@10'])} / {_pm(x['diff_vs_llm']['nDCG@10'])})")
                it = bk.get("gain_known<2_minus_gain_known=2")
                print(f"  {n:{w}s} " + " | ".join(cells) + (f" | extra gain when unsure: cP {_pm(it['cP@10'])}, nDCG {_pm(it['nDCG@10'])}" if it else ""))


def print_pc(pc: dict, title: str) -> None:
    for cols in ("all_120", "mood_114"):
        print(f"\n== precision-coverage, {title}, {cols} (train-chosen thresholds -> val; n_train {pc['n_train']}, n_val {pc['n_val']})")
        print(f"{'':44s} " + " ".join(f"{'@' + str(c):>11s}" for c in COUNTS) + f" | {'cnt@p>=.9':>14s} {'cnt@p>=.8':>14s}")
        for n, d in pc[cols].items():
            cells = [f"{_f(q['val_precision'])}({q['val_count']:.1f})" for q in d["counts"]]
            tg = [f"{d['targets'][t]['val_count']:.2f}(p={_f(d['targets'][t]['val_precision'], 2)})" for t in ("0.90", "0.80")]
            print(f"{n[:44]:44s} " + " ".join(f"{c:>11s}" for c in cells) + " | " + " ".join(f"{t:>14s}" for t in tg))
        fk = pc.get("llm_first_k_words", {}).get(cols)
        if fk:
            print(f"{'LLM first k words (k=1..10)':44s} " + " ".join(f"{k}:{_f(fk[str(k)]['precision'])}" for k in range(1, 11))
                  + f" | whole list {_f(fk['all']['precision'])} ({fk['all']['avg_count']:.1f} words)")


def print_recs(S: dict) -> None:
    R = S.get("recs")
    if not R:
        return
    head = f"{'RSQ':>6s} {'R→50':>6s} {'ov@10':>6s} {'inb':>5s} {'genre':>6s}"
    print(f"\n== recommendation quality (val rows with audio; isolated)   | balanced: {head} | mood: {head}")

    def line(name: str, r: dict, mark: str = " ") -> None:
        cells = [f"{_f(r['stops'][s].get('RSQ')):>6s} {_f(r['stops'][s].get('R50')):>6s} {_f(r['stops'][s].get('ov10')):>6s} "
                 f"{_f(r['stops'][s].get('inb_ratio_iso'), 2):>5s} {_f(r['stops'][s].get('genre')):>6s}" for s in STOPS]
        print(f"{mark:2s}{name[:58]:58s} | {' ' * 10}{cells[0]} | {' ' * 6}{cells[1]}")

    for n, r in R["reference_points_same_val_rows"].items():
        line("ref: " + n, r)
    for name, ent in R["runs"].items():
        for label, e in ent["policies"].items():
            line(f"{name} | {label}", e["val"], ("*" if label == ent["chosen_on_train"] else " ") +
                 ("+" if label == ent.get("chosen_on_train_hub_ok") else " "))
    print("  (* = policy chosen on TRAIN scores by mean RSQ; + = the same among hub-ok policies: train inbound ratio <= max(1.5, 1.1 x default's))")
    for k, d in R.get("paired_diff_vs_llm_val", {}).items():
        if k.split(" | ")[0] in ("fusion_best", "fusion_F1", "llm+meta"):
            print(f"  Δ {k} vs {d['vs']}: " + "; ".join(f"{s} RSQ {_pm(d[s]['RSQ'])}, R→50 {_pm(d[s]['R50'])}" for s in STOPS))


def print_report(S: dict) -> None:
    print(f"\nsnapshot: {json.dumps(S.get('snapshot', {}))}")
    for k, v in S.get("audio", {}).items():
        print(f"audio63__{k}: n_train {v['n_train']}, n_val {v['n_val']}, C {v['C']:g}, OOF nDCG@10 {v['cv_ndcg@10']:.4f}, val {v['val']}")
    if "meta" in S:
        print(f"meta: {S['meta']}")
    for arm in ("val_audio", "audio+meta", "val_all_601"):
        if arm in S.get("arms", {}):
            print_arm(S["arms"][arm])
    if "selection" in S:
        print(f"\nselection (on train cross-fit): {S['selection']}")
    for arm in ("val_audio", "val_all_601"):
        if arm in S.get("precision_coverage", {}):
            print_pc(S["precision_coverage"][arm], arm)
    print_recs(S)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["audio", "meta", "fuse", "recs", "report"])
    ap.add_argument("--specs", nargs="+", default=list(AUDIO_SPECS), choices=list(AUDIO_SPECS))
    ap.add_argument("--audio-key", default=None, choices=list(AUDIO_SPECS), help="audio probe to fuse (default: best train-OOF nDCG@10)")
    ap.add_argument("--recompute-oof", action="store_true", help="meta: redo the tag probe's train CV instead of reusing its OOF scores")
    a = ap.parse_args()
    if a.command == "report":
        print_report(_summary())
        return
    {"audio": cmd_audio, "meta": cmd_meta, "fuse": cmd_fuse, "recs": cmd_recs}[a.command](a)


if __name__ == "__main__":
    main()
