"""Precomputed recommendations: the 10 nearest albums per album per stop.

Both rankings are a function of the matrix alone: equal distances go to the earlier album, and
nothing depends on how many threads the libraries underneath use. (Two albums with the same
descriptors and no audio have the same row, so exact ties do happen.)
"""
import math

import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist
from scipy.stats import norm
from sklearn.neighbors import NearestNeighbors

from .audio import site_matrix
from .constants import RECS_PER_STOP, SLIDER, STOPS

# Candidates asked of the index beyond k and the seed. More are asked (twice as many each time)
# for a row whose ties reach the end of its candidates.
SPARE_CANDIDATES = 8
# The index computes ||x||^2 - 2xy + ||y||^2 in float64, so its squared distances are off by a few
# thousand ulps of the squared norms at most. Far more than that is allowed for here.
INDEX_ERROR = 1e-9
CHUNK = 1 << 22  # numbers per temporary array


def _exact_sq_distances(X: np.ndarray, rows: np.ndarray, cand: np.ndarray) -> np.ndarray:
    """Squared distance from each of `rows` to each of its candidates, the same on every machine:
    float64 differences and squares, added by math.fsum (correctly rounded, whatever the order)."""
    out = np.empty(cand.shape, dtype=np.float64)
    step = max(1, CHUNK // (cand.shape[1] * X.shape[1]))
    for a in range(0, len(rows), step):
        diff = X[cand[a:a + step]] - X[rows[a:a + step], None, :]
        out[a:a + step] = [[math.fsum(v) for v in per_row] for per_row in (diff * diff).tolist()]
    return out


def top_k_neighbours(X: np.ndarray, k: int = RECS_PER_STOP) -> np.ndarray:
    """The k nearest other rows of every row by euclidean distance, ordered by (distance, row number).

    scikit-learn's index only proposes candidates: it returns equal distances in an order that
    changes with the number of threads. Their distances are computed again, exactly, and sorted
    with the row number as the tie-break. A row is settled when its k-th neighbour is nearer than
    its farthest candidate by more than the index's rounding error, so no row left out could
    belong in the list; otherwise it is asked again with twice the candidates. Self is removed by
    row number, so duplicate rows cannot push the seed out of place."""
    X = np.ascontiguousarray(X, dtype=np.float64)
    n = len(X)
    if not 0 < k < n:
        raise ValueError(f"k must be between 1 and {n - 1} (the other rows), got {k}")
    if not np.isfinite(X).all():
        raise ValueError(f"the matrix has non-finite values in rows {np.flatnonzero(~np.isfinite(X).all(axis=1))[:10].tolist()}")
    index = NearestNeighbors(algorithm="brute").fit(X)
    sq = np.einsum("ij,ij->i", X, X)
    slack = INDEX_ERROR * (sq + sq.max())
    out = np.empty((n, k), dtype=np.int64)
    rows, m = np.arange(n), min(n, k + 1 + SPARE_CANDIDATES)
    while len(rows):
        cand = np.sort(index.kneighbors(X[rows], n_neighbors=m, return_distance=False), axis=1)
        d = _exact_sq_distances(X, rows, cand)
        farthest = d.max(axis=1)
        d[cand == rows[:, None]] = np.inf
        order = np.argsort(d, axis=1, kind="stable")[:, :k]  # candidates are in row order, so ties keep it
        kth = np.take_along_axis(d, order[:, -1:], axis=1)[:, 0]
        settled = kth + slack[rows] < farthest if m < n else np.ones(len(rows), dtype=bool)
        out[rows[settled]] = np.take_along_axis(cand, order, axis=1)[settled]
        rows, m = rows[~settled], min(n, 2 * m)
    return out


def top_k_mutual(X: np.ndarray, k: int = RECS_PER_STOP) -> np.ndarray:
    """The k nearest other rows of every row by mutual proximity, ordered by (mutual proximity, row number).

    Hub correction: the mutual proximity of x and y is 1 - P(X > d_xy) P(Y > d_xy), each album's
    distances to the others taken as Gaussian. An album that is close to everything (a hub) stops
    counting as close; smaller is still nearer.

    The distances come from scipy's cdist (one thread, plain differences), so identical rows get
    identical values and the result does not depend on the thread count. Memory: one n x n float32
    array (67 MB at 4,081 albums, 400 MB at 10,000) and temporaries of about 32 MB each; time grows
    with n squared (a few seconds at 4,081)."""
    X = np.ascontiguousarray(X, dtype=np.float64)
    n = len(X)
    if not 0 < k < n:
        raise ValueError(f"k must be between 1 and {n - 1} (the other rows), got {k}")
    step = max(1, CHUNK // n)
    below = np.empty((n, n), dtype=np.float32)  # below[x, y] = P(X <= d_xy): small for x's near albums
    for a in range(0, n, step):
        d = cdist(X[a:a + step], X)
        # Mean and deviation over the other rows. The distance to self is 0 and adds nothing to
        # either sum, and it keeps the sums of two identical rows identical.
        mean = d.sum(axis=1) / (n - 1)
        var = (d * d).sum(axis=1) / (n - 1) - mean ** 2
        if not (var > 0).all():
            raise ValueError("mutual proximity needs rows whose distances to the others differ; "
                             f"row {a + int(np.flatnonzero(~(var > 0))[0])} is equally far from all of them")
        below[a:a + step] = norm.cdf((d - mean[:, None]) / np.sqrt(var)[:, None])
    out = np.empty((n, k), dtype=np.int64)
    for a in range(0, n, step):
        p = below[a:a + step].astype(np.float64)
        q = below[:, a:a + step].T.astype(np.float64)
        M = p + q - p * q  # 1 - (1 - p)(1 - q)
        M[np.arange(len(M)), np.arange(a, a + len(M))] = np.inf
        out[a:a + step] = np.argsort(M, axis=1, kind="stable")[:, :k]
    return out


def build_recs(sub: pd.DataFrame, block: np.ndarray, hub_correction: tuple[str, ...] = ()) -> dict[str, np.ndarray]:
    """Top 10 per album at each stop over the whole deduped catalog, on the site matrix
    [audio block | descriptors / slider**3]. The stops in `hub_correction` rank by mutual proximity."""
    return {stop: (top_k_mutual if stop in hub_correction else top_k_neighbours)(site_matrix(sub, block, SLIDER[stop]))
            for stop in STOPS}
