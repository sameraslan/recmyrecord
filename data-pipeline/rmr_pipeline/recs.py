"""Precomputed recommendations: the 10 nearest albums per album per stop."""
import numpy as np
import pandas as pd
from scipy.stats import norm
from sklearn.metrics.pairwise import euclidean_distances
from sklearn.neighbors import NearestNeighbors

from .audio import site_matrix
from .constants import RECS_PER_STOP, SLIDER, STOPS


def top_k_neighbours(X: np.ndarray, k: int = RECS_PER_STOP) -> np.ndarray:
    """Euclidean KNN over every row. Self is removed by index, not by position, so exact
    duplicate feature rows cannot push the seed out of place."""
    nn = NearestNeighbors(n_neighbors=k + 1).fit(X)
    _, idx = nn.kneighbors(X)
    out = np.empty((len(X), k), dtype=np.int64)
    for r in range(len(X)):
        out[r] = [int(j) for j in idx[r] if int(j) != r][:k]
    return out


def mutual_proximity(D: np.ndarray) -> np.ndarray:
    """Hub correction of a squared-distance matrix with an infinite diagonal: 1 - P(X > d_xy) P(Y > d_yx),
    each album's distances to the others taken as Gaussian. An album that is close to everything
    (a hub) stops counting as close; smaller is still nearer."""
    d = np.sqrt(D)
    finite = np.where(np.isfinite(d), d, np.nan)
    z = (d - np.nanmean(finite, axis=1, keepdims=True)) / np.nanstd(finite, axis=1, keepdims=True)
    out = (1 - norm.sf(z) * norm.sf(z.T)).astype(np.float32)
    np.fill_diagonal(out, np.inf)
    return out


def top_k_mutual(X: np.ndarray, k: int = RECS_PER_STOP) -> np.ndarray:
    """The k nearest albums per row by mutual proximity instead of the raw euclidean distance."""
    D = euclidean_distances(X.astype(np.float64), squared=True).astype(np.float32)
    np.fill_diagonal(D, np.inf)
    M = mutual_proximity(D)
    part = np.argpartition(M, k, axis=1)[:, :k]
    return np.take_along_axis(part, np.argsort(np.take_along_axis(M, part, axis=1), axis=1), axis=1)


def build_recs(sub: pd.DataFrame, block: np.ndarray, hub_correction: tuple[str, ...] = ()) -> dict[str, np.ndarray]:
    """Top 10 per album at each stop over the whole deduped catalog, on the site matrix
    [audio block | descriptors / slider**3]. The stops in `hub_correction` rank by mutual proximity."""
    return {stop: (top_k_mutual if stop in hub_correction else top_k_neighbours)(site_matrix(sub, block, SLIDER[stop]))
            for stop in STOPS}
