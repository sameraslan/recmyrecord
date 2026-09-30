"""Precomputed recommendations: the 10 nearest albums per album per stop."""
import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors

from .constants import RECS_PER_STOP, SLIDER, STOPS
from .table import rec_matrix


def top_k_neighbours(X: np.ndarray, k: int = RECS_PER_STOP) -> np.ndarray:
    """Euclidean KNN over every row. Self is removed by index, not by position, so exact
    duplicate feature rows cannot push the seed out of place."""
    nn = NearestNeighbors(n_neighbors=k + 1).fit(X)
    _, idx = nn.kneighbors(X)
    out = np.empty((len(X), k), dtype=np.int64)
    for r in range(len(X)):
        out[r] = [int(j) for j in idx[r] if int(j) != r][:k]
    return out


def build_recs(sub: pd.DataFrame) -> dict[str, np.ndarray]:
    """Top 10 per album at each stop, over the whole deduped catalog (no 4,000-row cap)."""
    return {stop: top_k_neighbours(rec_matrix(sub, SLIDER[stop])) for stop in STOPS}
