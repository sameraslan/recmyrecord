"""Rank-weight scheme of the feature table, and scores -> table-format weight vectors.

How the table was made (data-retrieval/Recommender/getDescriptors.py, getDescriptorVectors):
    weight = (63 - i) / 42,   i = 0-based position of the descriptor in the album's RYM descriptor list
so the first-listed descriptor is 1.5 and each later one is 1/42 lower (42 = the longest list; the smallest
weight in the table is 22/42 = 0.524). The weight does not depend on `Descriptor Count`. Positions are
assigned over the album's WHOLE list (all 176 table columns, plus descriptors that have no column), so in
the 120 columns the recommender keeps there are gaps where lyric/theme descriptors sat: the j-th kept
descriptor of an album has weight (63 - j - g) / 42 with g = number of dropped descriptors listed before it.

    .venv/bin/python weights.py     # verifies the formula against the table and prints the rank weights

scores_to_weights turns a score matrix into weight vectors in that format. The weight given to the j-th
ranked predicted descriptor is, by default, the mean true weight of the j-th kept descriptor over the
TRAIN albums ("empirical"): the exact formula needs the lyric-descriptor gaps, which a model over the 120
columns does not predict, and the gap-free formula (63 - j) / 42 puts predicted albums systematically too
far from the origin in the recommender's Euclidean space (by 0.05 at rank 10, 0.10 at rank 20).
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from common import ALL_DESCRIPTORS, DESCRIPTORS, TABLE, Y64, formula_weight, split_rows, weight_to_position

MAX_K = len(DESCRIPTORS)
MIN_COUNT_FOR_MEAN = 30  # rank positions with fewer train albums use a straight-line fit instead


def verify_formula(verbose: bool = True) -> dict:
    """Numerical check of the scheme against all 4,116 rows. Raises if the table contradicts it."""
    A = TABLE[ALL_DESCRIPTORS].to_numpy(dtype=np.float64)
    dc = TABLE["Descriptor Count"].to_numpy(dtype=int)
    nz = A > 0
    pos = np.where(nz, 63 - 42 * A, np.nan)
    lattice_err = float(np.nanmax(np.abs(pos - np.rint(pos))))
    assert lattice_err < 1e-9, "weights are not on the (63 - i)/42 lattice"
    assert np.array_equal(A[nz], formula_weight(weight_to_position(A[nz]))), "not bit-identical to (63 - i)/42"
    perfect = gaps = 0
    for r in range(len(A)):
        p = np.sort(weight_to_position(A[r][nz[r]]))
        assert len(set(p)) == len(p), f"row {r}: two descriptors share a position"
        assert len(p) == 0 or p.max() < dc[r], f"row {r}: position beyond Descriptor Count"
        if np.array_equal(p, np.arange(dc[r])):
            perfect += 1
        else:
            gaps += 1  # a listed descriptor has no column in the table (vocabulary frozen from early albums)
    kept = Y64 > 0
    n_all, n_kept = nz.sum(1), kept.sum(1)
    out = {
        "rows": len(A), "lattice_max_error": lattice_err,
        "rows_positions_exactly_0_to_count_minus_1": perfect, "rows_with_unlisted_descriptor": gaps,
        "min_weight": float(A[nz].min()), "max_weight": float(A.max()),
        "max_descriptor_count": int(dc.max()),
        "mean_listed_176": float(n_all.mean()), "mean_kept_120": float(n_kept.mean()),
        "share_of_nonzeros_in_dropped_columns": float(1 - kept.sum() / nz.sum()),
        "rows_where_kept_positions_have_gaps": int(sum(
            not np.array_equal(np.sort(weight_to_position(Y64[r][kept[r]])), np.arange(n_kept[r]))
            for r in range(len(A)) if n_kept[r])),
    }
    if verbose:
        for k, v in out.items():
            print(f"  {k}: {v}")
    return out


def formula_rank_weights(max_k: int = MAX_K) -> np.ndarray:
    """Gap-free weights (63 - j) / 42 for ranks j = 0..max_k-1, floored at the table minimum 22/42."""
    return np.maximum(formula_weight(np.arange(max_k)), formula_weight(41))


def empirical_rank_weights(Y_ref: np.ndarray, max_k: int = MAX_K, min_count: int = MIN_COUNT_FOR_MEAN) -> np.ndarray:
    """Mean true weight of the j-th largest non-zero weight over the albums of Y_ref (pass TRAIN rows only).
    Ranks reached by fewer than `min_count` albums use a least-squares line through the reliable ranks,
    floored at the table minimum 22/42. The result is non-increasing."""
    srt = -np.sort(-np.asarray(Y_ref, dtype=np.float64), axis=1)[:, :max_k]
    present = srt > 0
    count = present.sum(0)
    mean = np.divide(srt.sum(0), count, out=np.zeros(srt.shape[1]), where=count > 0)
    ok = count >= min_count
    j = np.arange(srt.shape[1])
    slope, intercept = np.polyfit(j[ok], mean[ok], 1)
    w = np.where(ok, mean, intercept + slope * j)
    w = np.maximum(w, formula_weight(41))
    w = np.minimum.accumulate(w)
    if max_k > len(w):
        w = np.concatenate([w, np.full(max_k - len(w), w[-1])])
    return w


@lru_cache(maxsize=1)
def train_rank_weights() -> np.ndarray:
    """empirical_rank_weights of the TRAIN split (read-only array of length 120)."""
    w = empirical_rank_weights(Y64[split_rows("train")])
    w.setflags(write=False)
    return w


def calibrate_threshold(scores: np.ndarray, target_mean_count: float) -> float:
    """Global threshold t such that `scores >= t` selects target_mean_count descriptors per album on
    average over `scores` (calibrate on validation scores; target = mean true count, e.g. N_DESC[val].mean())."""
    s = np.sort(np.asarray(scores, dtype=np.float64).ravel())[::-1]
    n = int(round(target_mean_count * len(scores)))
    n = min(max(n, 1), len(s))
    return float(s[n - 1])


def scores_to_weights(scores: np.ndarray, k: int | None = None, threshold: float | None = None, *,
                      rank_weights: np.ndarray | str = "empirical", min_k: int = 1,
                      max_k: int | None = None) -> np.ndarray:
    """Score matrix (n, 120) -> weight matrix (n, 120) float64 in the table's format: the selected
    descriptors get rank weights (best score = largest weight), everything else is 0.

    Exactly one k policy:
      k=<int>            fixed k: every album gets its k highest-scoring descriptors;
      threshold=<float>  global threshold: an album gets every descriptor with score >= threshold, but at
                         least `min_k` (default 1, so no album is left empty) and at most `max_k`
                         (default: no cap). See calibrate_threshold.
    rank_weights:
      "empirical" (default)  mean true weight per rank position in the TRAIN split (train_rank_weights());
      "formula"              (63 - j) / 42 as if the album had no lyric/theme descriptors in between;
      array                  your own non-increasing weights, index = rank.
    Ties are broken by column index, as in metrics.top_k.
    """
    S = np.asarray(scores, dtype=np.float64)
    assert S.ndim == 2 and np.isfinite(S).all()
    if (k is None) == (threshold is None):
        raise ValueError("give exactly one of k (fixed count) or threshold (global score threshold)")
    n, L = S.shape
    if isinstance(rank_weights, str):
        if rank_weights == "empirical":
            rw = train_rank_weights()
        elif rank_weights == "formula":
            rw = formula_rank_weights(L)
        else:
            raise ValueError(rank_weights)
    else:
        rw = np.asarray(rank_weights, dtype=np.float64)
    assert len(rw) >= 1 and (np.diff(rw) <= 1e-12).all() and (rw > 0).all()
    order = np.argsort(-S, axis=1, kind="stable")
    if k is not None:
        if not 0 <= k <= L:
            raise ValueError(k)
        counts = np.full(n, k)
    else:
        counts = (S >= threshold).sum(1)
        counts = np.clip(counts, min_k, L if max_k is None else max_k)
    if counts.max(initial=0) > len(rw):
        raise ValueError(f"need {counts.max()} rank weights, have {len(rw)}")
    W = np.zeros((n, L))
    ranks = np.arange(L)[None, :]
    sel = ranks < counts[:, None]
    rows = np.repeat(np.arange(n), L).reshape(n, L)
    W[rows[sel], order[sel]] = np.broadcast_to(rw[: L][None, :] if len(rw) >= L else
                                                np.pad(rw, (0, L - len(rw)))[None, :], (n, L))[sel]
    return W


if __name__ == "__main__":
    print("formula check against the table:")
    verify_formula()
    emp, form = train_rank_weights(), formula_rank_weights()
    tr = Y64[split_rows("train")]
    cnt = (-np.sort(-tr, 1) > 0).sum(0)
    print("\nrank  n_train  empirical  formula")
    for j in list(range(0, 31)):
        print(f"{j:4d}  {cnt[j]:7d}  {emp[j]:9.4f}  {form[j]:7.4f}")
