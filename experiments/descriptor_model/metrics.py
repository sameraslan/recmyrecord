"""Metrics for descriptor prediction. Pure numpy/sklearn, no data access.

Conventions
    Y  (n, L) true rank weights (>0 = the album has the descriptor, larger = listed earlier), 0 = absent.
    S  (n, L) predicted scores, higher = more confident. Any real numbers.
Ranking is by descending score; ties are broken by column index (lower index first), so results are
deterministic. Albums with no true descriptor must be removed by the caller (asserted).

`min_score`: when given, a prediction only counts if its score is > min_score. Use min_score=0 when S is a
weight vector (zeros = "not predicted"), so a list shorter than k is not padded with arbitrary columns.
Precision@k still divides by k.
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score


def _check(Y: np.ndarray, S: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    Y = np.asarray(Y, dtype=np.float64)
    S = np.asarray(S, dtype=np.float64)
    assert Y.ndim == 2 and Y.shape == S.shape, (Y.shape, S.shape)
    assert (Y >= 0).all() and (Y > 0).any(1).all(), "every album needs at least one true descriptor"
    assert np.isfinite(S).all()
    return Y, S


def top_k(S: np.ndarray, k: int) -> np.ndarray:
    """(n, k) column indexes of the k highest scores, best first; ties -> lower column index."""
    return np.argsort(-np.asarray(S, dtype=np.float64), axis=1, kind="stable")[:, :k]


def _hits(Y: np.ndarray, S: np.ndarray, k: int, min_score: float | None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """top-k indexes, their true weights (0 where the prediction does not count or is wrong), valid mask."""
    idx = top_k(S, k)
    gain = np.take_along_axis(Y, idx, 1)
    valid = np.ones_like(gain, dtype=bool)
    if min_score is not None:
        valid = np.take_along_axis(S, idx, 1) > min_score
        gain = np.where(valid, gain, 0.0)
    return idx, gain, valid


def precision_at_k(Y, S, k: int = 10, min_score: float | None = None) -> np.ndarray:
    """Per album: (# of the top-k predictions that are true descriptors) / k."""
    Y, S = _check(Y, S)
    return (_hits(Y, S, k, min_score)[1] > 0).sum(1) / k


def recall_at_k(Y, S, k: int = 10, min_score: float | None = None) -> np.ndarray:
    """Per album: (# of the top-k predictions that are true descriptors) / (# true descriptors)."""
    Y, S = _check(Y, S)
    return (_hits(Y, S, k, min_score)[1] > 0).sum(1) / (Y > 0).sum(1)


def ndcg_at_k(Y, S, k: int = 10, min_score: float | None = None) -> np.ndarray:
    """Per album: DCG@k / IDCG@k with the true rank weights as gains and 1/log2(rank + 1) discounts
    (rank 1 = best). IDCG is the DCG of the album's own true weights in descending order (top k)."""
    Y, S = _check(Y, S)
    disc = 1.0 / np.log2(np.arange(2, k + 2))
    gain = _hits(Y, S, k, min_score)[1]  # (n, min(k, L))
    ideal = -np.sort(-Y, axis=1)[:, :k]
    return (gain * disc[: gain.shape[1]]).sum(1) / (ideal * disc[: ideal.shape[1]]).sum(1)


def max_precision_recall_at_k(Y, k: int = 10) -> tuple[np.ndarray, np.ndarray]:
    """Arithmetic ceiling per album: best possible precision@k = min(n_true, k) / k and
    recall@k = min(n_true, k) / n_true."""
    n = (np.asarray(Y) > 0).sum(1)
    return np.minimum(n, k) / k, np.minimum(n, k) / n


def per_label_ap(Y, S) -> np.ndarray:
    """Average precision of each label over the albums (NaN for labels with no positive)."""
    Y, S = _check(Y, S)
    B = Y > 0
    out = np.full(Y.shape[1], np.nan)
    for j in np.flatnonzero(B.any(0)):
        out[j] = average_precision_score(B[:, j], S[:, j])
    return out


def per_label_auc(Y, S) -> np.ndarray:
    """ROC-AUC of each label over the albums (NaN for labels with no positive or no negative)."""
    Y, S = _check(Y, S)
    B = Y > 0
    out = np.full(Y.shape[1], np.nan)
    for j in np.flatnonzero(B.any(0) & ~B.all(0)):
        out[j] = roc_auc_score(B[:, j], S[:, j])
    return out


def set_metrics(Y, W) -> dict[str, np.ndarray]:
    """Per-album metrics of a predicted SET: W is a weight vector whose non-zeros are the predicted
    descriptors (e.g. the output of scores_to_weights, exactly k non-zeros). Returns precision
    (hits / |pred|, 0 if nothing is predicted), recall (hits / |true|), f1, jaccard, n_pred, n_true."""
    Yb = np.asarray(Y) > 0
    Wb = np.asarray(W) > 0
    assert Yb.shape == Wb.shape and Yb.any(1).all()
    hits = (Yb & Wb).sum(1).astype(float)
    n_pred, n_true = Wb.sum(1), Yb.sum(1)
    precision = np.divide(hits, n_pred, out=np.zeros_like(hits), where=n_pred > 0)
    recall = hits / n_true
    f1 = np.divide(2 * hits, n_pred + n_true, out=np.zeros_like(hits), where=(n_pred + n_true) > 0)
    return {"precision": precision, "recall": recall, "f1": f1, "jaccard": hits / (Yb | Wb).sum(1),
            "n_pred": n_pred, "n_true": n_true}


def evaluate(Y, S, k: int = 10, labels: list[str] | None = None, min_score: float | None = None,
             n_list: int = 15) -> dict:
    """All ranking metrics for one split.

    Returns a dict with
      n_albums, k
      precision@k, recall@k, ndcg@k        means over albums
      micro_recall@k                       total hits / total true descriptors (micro precision@k equals
                                           precision@k because every album has the same denominator k)
      max_precision@k, max_recall@k        arithmetic ceilings (means over albums)
      mAP, mAP_n_labels, mAP_skipped       mean of per-label AP; labels with no positive in Y are skipped
      macro_auc, auc_n_labels, auc_skipped mean of per-label ROC-AUC; labels without both classes skipped
      micro_ap, micro_auc                  AP / ROC-AUC over all (album, label) cells pooled
      per_album  {precision, recall, ndcg} arrays
      per_label  {ap, auc, n_pos}          arrays (NaN where skipped)
      best_auc, worst_auc                  n_list (label, auc, n_pos) tuples (needs `labels`)
    """
    Y, S = _check(Y, S)
    B = Y > 0
    p, r, g = (precision_at_k(Y, S, k, min_score), recall_at_k(Y, S, k, min_score), ndcg_at_k(Y, S, k, min_score))
    mp, mr = max_precision_recall_at_k(Y, k)
    ap, auc = per_label_ap(Y, S), per_label_auc(Y, S)
    n_pos = B.sum(0)
    out = {
        "n_albums": int(len(Y)), "k": k,
        f"precision@{k}": float(p.mean()), f"recall@{k}": float(r.mean()), f"ndcg@{k}": float(g.mean()),
        f"micro_recall@{k}": float((p * k).sum() / B.sum()),
        f"max_precision@{k}": float(mp.mean()), f"max_recall@{k}": float(mr.mean()),
        "mAP": float(np.nanmean(ap)), "mAP_n_labels": int(np.isfinite(ap).sum()),
        "mAP_skipped": int(np.isnan(ap).sum()),
        "macro_auc": float(np.nanmean(auc)), "auc_n_labels": int(np.isfinite(auc).sum()),
        "auc_skipped": int(np.isnan(auc).sum()),
        "micro_ap": float(average_precision_score(B.ravel(), S.ravel())),
        "micro_auc": float(roc_auc_score(B.ravel(), S.ravel())),
        "per_album": {"precision": p, "recall": r, "ndcg": g},
        "per_label": {"ap": ap, "auc": auc, "n_pos": n_pos},
    }
    if labels is not None:
        order = [j for j in np.argsort(-np.nan_to_num(auc, nan=-1.0), kind="stable") if np.isfinite(auc[j])]
        out["best_auc"] = [(labels[j], float(auc[j]), int(n_pos[j])) for j in order[:n_list]]
        out["worst_auc"] = [(labels[j], float(auc[j]), int(n_pos[j])) for j in order[::-1][:n_list]]
    return out


def evaluate_sets(Y, W) -> dict:
    """Means of set_metrics plus micro precision / recall (pooled hits), for calibrated-count predictions."""
    m = set_metrics(Y, W)
    hits = (np.asarray(Y) > 0) & (np.asarray(W) > 0)
    return {
        "n_albums": int(len(m["precision"])),
        "precision": float(m["precision"].mean()), "recall": float(m["recall"].mean()),
        "f1": float(m["f1"].mean()), "jaccard": float(m["jaccard"].mean()),
        "micro_precision": float(hits.sum() / max(m["n_pred"].sum(), 1)),
        "micro_recall": float(hits.sum() / m["n_true"].sum()),
        "mean_n_pred": float(m["n_pred"].mean()), "mean_n_true": float(m["n_true"].mean()),
        "per_album": m,
    }


SUMMARY_KEYS = ["precision@10", "recall@10", "ndcg@10", "micro_recall@10", "mAP", "macro_auc", "micro_ap", "micro_auc"]


def format_table(results: dict[str, dict], keys: list[str] = SUMMARY_KEYS) -> str:
    """Plain-text table: one row per named result of evaluate()."""
    w = max(len(n) for n in results) + 2
    lines = [" " * w + " ".join(f"{k:>15s}" for k in keys)]
    for name, r in results.items():
        lines.append(f"{name:<{w}s}" + " ".join(f"{r[k]:15.4f}" for k in keys))
    return "\n".join(lines)
