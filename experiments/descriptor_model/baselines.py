"""Baselines that need no audio, and k-NN label transfer for when embeddings exist.

    .venv/bin/python baselines.py                 # VALIDATION table (default; fitted on train)
    .venv/bin/python baselines.py --downstream    # also run downstream.py's evaluation for each baseline

Every baseline returns a score matrix (n_eval, 120) in DESCRIPTORS order; metrics.evaluate ranks it.
Evaluation rows = all rows of the split (including the few that are not the first of their Spotify URI).
The test split can only be scored by calling run(split="test", allow_test=True) on purpose.

Baselines
  most-frequent       every album gets the train prevalence of each descriptor as its score.
  genre-mean          genre-conditional label means with shrinkage towards the train prevalence:
                      score = (sum_g n_g * mean_g + m * prevalence) / (sum_g n_g + m), g over the album's
                      genres (all listed, or the primary genre only), n_g = train albums with genre g.
  genre-logreg        multi-hot genre vector (all listed genres, or one-hot primary genre; genres with at
                      least MIN_GENRE_COUNT train albums) -> one L2 logistic regression per descriptor.
  Albums without a genre (failed join) get the most-frequent scores in every genre baseline.
  knn_label_transfer  mean (optionally similarity-weighted) label vector of the k nearest train embeddings.
"""
from __future__ import annotations

import argparse
import warnings

import numpy as np
from sklearn.linear_model import LogisticRegression

import metrics as M
from common import DESCRIPTORS, N_DESC, Y, Y64, YB, load_genres, split_rows

MIN_GENRE_COUNT = 3
SHRINKAGE_M = 5.0


def most_frequent_scores(YB_train: np.ndarray, n_eval: int) -> np.ndarray:
    """Train prevalence of each label, repeated for every evaluation album."""
    return np.tile(np.asarray(YB_train, dtype=np.float64).mean(0), (n_eval, 1))


# ---------------------------------------------------------------- genre features

def genre_lists(rows: np.ndarray, primary_only: bool = False) -> list[list[str]]:
    g = load_genres()["genres"].to_numpy()
    return [list(g[r][:1]) if primary_only else list(g[r]) for r in rows]


def genre_vocab(train_lists: list[list[str]], min_count: int = MIN_GENRE_COUNT) -> list[str]:
    counts: dict[str, int] = {}
    for gs in train_lists:
        for x in set(gs):
            counts[x] = counts.get(x, 0) + 1
    return sorted(x for x, c in counts.items() if c >= min_count)


def multi_hot(lists: list[list[str]], vocab: list[str]) -> np.ndarray:
    col = {g: j for j, g in enumerate(vocab)}
    X = np.zeros((len(lists), len(vocab)), dtype=np.float32)
    for i, gs in enumerate(lists):
        for x in gs:
            if x in col:
                X[i, col[x]] = 1.0
    return X


def genre_mean_scores(train_lists, YB_train, eval_lists, m: float = SHRINKAGE_M) -> np.ndarray:
    """Shrunk genre-conditional label means (see module docstring). Unknown genres contribute nothing, so an
    album with no known genre gets exactly the train prevalence."""
    YBt = np.asarray(YB_train, dtype=np.float64)
    prev = YBt.mean(0)
    sums: dict[str, np.ndarray] = {}
    counts: dict[str, int] = {}
    for gs, y in zip(train_lists, YBt):
        for x in set(gs):
            sums[x] = sums.get(x, 0) + y
            counts[x] = counts.get(x, 0) + 1
    out = np.empty((len(eval_lists), YBt.shape[1]))
    for i, gs in enumerate(eval_lists):
        known = [x for x in set(gs) if x in counts]
        num = m * prev + sum((sums[x] for x in known), np.zeros_like(prev))
        out[i] = num / (m + sum(counts[x] for x in known))
    return out


def genre_logreg_scores(X_train, YB_train, X_eval, C: float = 1.0) -> np.ndarray:
    """One logistic regression per label on genre indicators; returns P(label). Labels with no positive
    (or no negative) in train get their train prevalence as a constant score."""
    YBt = np.asarray(YB_train)
    out = np.empty((len(X_eval), YBt.shape[1]))
    for j in range(YBt.shape[1]):
        y = YBt[:, j]
        if y.all() or not y.any():
            out[:, j] = y.mean()
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            clf = LogisticRegression(C=C, max_iter=2000).fit(X_train, y)
        out[:, j] = clf.predict_proba(X_eval)[:, 1]
    return out


# ---------------------------------------------------------------- k-NN label transfer

def knn_label_transfer(E_train: np.ndarray, Y_train: np.ndarray, E_eval: np.ndarray, k: int = 20,
                       weighting: str = "uniform", *, metric: str = "cosine", temperature: float = 0.1,
                       exclude_self: bool = False, batch: int = 2048) -> np.ndarray:
    """Scores (n_eval, n_labels) = weighted mean of the label vectors of the k nearest train albums.

    E_train   (n_train, d) embeddings of the train albums
    Y_train   (n_train, L) their labels: binary (score = neighbour vote share) or rank weights
    E_eval    (n_eval, d)
    k         neighbours (clamped to n_train)
    weighting "uniform"     plain mean
              "similarity"  weights = similarity shifted to be >= 0 (cosine: max(sim, 0); euclidean: 1 / (1 + dist))
              "softmax"     weights = softmax(similarity / temperature) over the k neighbours
    metric    "cosine" (rows are L2-normalised here) or "euclidean" (similarity = -distance)
    exclude_self  set True when E_eval is E_train itself (leave-one-out: neighbour i is skipped for row i)
    """
    Et = np.asarray(E_train, dtype=np.float32)
    Ee = np.asarray(E_eval, dtype=np.float32)
    Yt = np.asarray(Y_train, dtype=np.float32)
    assert Et.ndim == 2 and Ee.ndim == 2 and Et.shape[1] == Ee.shape[1] and len(Et) == len(Yt)
    assert np.isfinite(Et).all() and np.isfinite(Ee).all()
    if weighting not in ("uniform", "similarity", "softmax"):
        raise ValueError(weighting)
    if metric == "cosine":
        Et = Et / np.maximum(np.linalg.norm(Et, axis=1, keepdims=True), 1e-12)
        Ee = Ee / np.maximum(np.linalg.norm(Ee, axis=1, keepdims=True), 1e-12)
    elif metric != "euclidean":
        raise ValueError(metric)
    if exclude_self:
        assert len(Et) == len(Ee)
    k = max(1, min(k, len(Et) - (1 if exclude_self else 0)))
    out = np.empty((len(Ee), Yt.shape[1]), dtype=np.float64)
    sq_t = (Et ** 2).sum(1)
    for a in range(0, len(Ee), batch):
        q = Ee[a:a + batch]
        sim = q @ Et.T
        if metric == "euclidean":
            sim = -np.sqrt(np.maximum((q ** 2).sum(1)[:, None] + sq_t[None, :] - 2 * sim, 0.0))
        if exclude_self:
            sim[np.arange(len(q)), np.arange(a, a + len(q))] = -np.inf
        idx = np.argpartition(-sim, k - 1, axis=1)[:, :k]
        s = np.take_along_axis(sim, idx, 1).astype(np.float64)
        if weighting == "uniform":
            w = np.ones_like(s)
        elif weighting == "similarity":
            w = np.maximum(s, 0.0) if metric == "cosine" else 1.0 / (1.0 - s)
            w[w.sum(1) == 0] = 1.0
        else:
            z = (s - s.max(1, keepdims=True)) / temperature
            w = np.exp(z)
        w = w / w.sum(1, keepdims=True)
        out[a:a + len(q)] = np.einsum("nk,nkl->nl", w, Yt[idx].astype(np.float64))
    return out


# ---------------------------------------------------------------- run

def baseline_scores(split: str = "val") -> tuple[dict[str, np.ndarray], dict]:
    """Score matrices of every baseline that needs no audio, fitted on train, for the rows of `split`."""
    train, rows = split_rows("train"), split_rows(split)
    YBt = YB[train]
    scores = {"most-frequent": most_frequent_scores(YBt, len(rows))}
    info = {}
    for tag, primary in (("all genres", False), ("primary genre", True)):
        tl, el = genre_lists(train, primary), genre_lists(rows, primary)
        vocab = genre_vocab(tl)
        Xt, Xe = multi_hot(tl, vocab), multi_hot(el, vocab)
        no_genre = np.array([len(x) == 0 for x in el])
        no_feature = Xe.sum(1) == 0
        info[tag] = {"vocab": len(vocab), "eval_no_genre(join failed)": int(no_genre.sum()),
                     "eval_no_genre_in_vocab": int(no_feature.sum())}
        fallback = scores["most-frequent"]
        s = genre_mean_scores(tl, YBt, el)
        s[no_genre] = fallback[no_genre]
        scores[f"genre-mean ({tag})"] = s
        for C in (0.3, 1.0, 3.0):
            s = genre_logreg_scores(Xt, YBt, Xe, C=C)
            s[no_genre] = fallback[no_genre]
            scores[f"genre-logreg ({tag}, C={C:g})"] = s
    return scores, info


def run(split: str = "val", downstream: bool = False, allow_test: bool = False) -> dict:
    if split == "test" and not allow_test:
        raise RuntimeError("the test split is scored once, at the very end: pass allow_test=True on purpose")
    from weights import calibrate_threshold, scores_to_weights

    rows = split_rows(split)
    Yv = Y[rows]
    scores, info = baseline_scores(split)
    results = {name: M.evaluate(Yv, s, k=10, labels=DESCRIPTORS) for name, s in scores.items()}
    first = next(iter(results.values()))
    print(f"split={split}: {first['n_albums']} albums; arithmetic ceiling P@10 {first['max_precision@10']:.4f}, "
          f"R@10 {first['max_recall@10']:.4f}; mAP over {first['mAP_n_labels']} labels "
          f"({first['mAP_skipped']} skipped: no positive in this split); AUC over {first['auc_n_labels']} labels")
    print("genre features:", info)
    print(M.format_table(results))

    target = float(N_DESC[rows].mean())
    print(f"\npredicted SET at a calibrated count (global threshold so the mean count = the split's true mean "
          f"{target:.2f}; calibrated on this same split) and at fixed k=10:")
    print(f"{'':40s} {'thr: prec':>10s} {'recall':>7s} {'f1':>6s} {'jacc':>6s} {'n_pred':>7s} | {'k=10: prec':>10s} {'recall':>7s} {'jacc':>6s}")
    sets = {}
    for name, s in scores.items():
        t = calibrate_threshold(s, target)
        Wt = scores_to_weights(s, threshold=t)
        Wk = scores_to_weights(s, k=10)
        a, b = M.evaluate_sets(Yv, Wt), M.evaluate_sets(Yv, Wk)
        sets[name] = {"threshold": t, "calibrated": a, "k10": b, "W_threshold": Wt, "W_k10": Wk}
        print(f"{name:40s} {a['precision']:10.4f} {a['recall']:7.4f} {a['f1']:6.4f} {a['jaccard']:6.4f} "
              f"{a['mean_n_pred']:7.2f} | {b['precision']:10.4f} {b['recall']:7.4f} {b['jaccard']:6.4f}")

    best = max((n for n in results if n != "most-frequent"), key=lambda n: results[n]["ndcg@10"])
    r = results[best]
    print(f"\nper-label ROC-AUC of '{best}' (best nDCG@10 among genre baselines on {split}):")
    print("  best 15 :", ", ".join(f"{l} {a:.3f} (n={n})" for l, a, n in r["best_auc"]))
    print("  worst 15:", ", ".join(f"{l} {a:.3f} (n={n})" for l, a, n in r["worst_auc"]))

    out = {"results": results, "sets": sets, "scores": scores, "info": info}
    if downstream:
        from downstream import downstream_eval, format_downstream

        chosen = ["most-frequent", best]
        ds = {}
        for name in chosen:
            ds[f"{name[:26]} k=10"] = downstream_eval(sets[name]["W_k10"], rows)
            ds[f"{name[:26]} thr"] = downstream_eval(sets[name]["W_threshold"], rows)
        print(f"\ndownstream on {split} (weights from scores_to_weights, empirical rank weights):")
        print(format_downstream(ds))
        out["downstream"] = ds
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="val", choices=["val", "test"])
    ap.add_argument("--downstream", action="store_true")
    ap.add_argument("--final-test", action="store_true", help="required together with --split test")
    a = ap.parse_args()
    run(a.split, downstream=a.downstream, allow_test=a.final_test)
