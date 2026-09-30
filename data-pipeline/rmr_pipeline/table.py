"""Feature table access and an exact replica of the live recommender."""
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors

from .constants import AUDIO, DEFAULT_TABLE, LYRIC_DROP, META


def load_table(path: Path = DEFAULT_TABLE) -> pd.DataFrame:
    """The feature table in catalog-rank order with a fresh RangeIndex (row = album number - 1)."""
    return pd.read_pickle(path).reset_index(drop=True)


def dedupe_table(df: pd.DataFrame) -> tuple[pd.DataFrame, list[int]]:
    """Keep the first row of every Spotify URI. Returns the deduped frame (fresh RangeIndex)
    and, for each kept album, its row number in the original table."""
    keep = ~df["URI"].duplicated(keep="first")
    rows = [int(r) for r in np.flatnonzero(keep.to_numpy())]
    return df.iloc[rows].reset_index(drop=True), rows


def descriptor_cols(df: pd.DataFrame) -> list[str]:
    """The 120 descriptor columns the recommender scales (all but meta, audio and the 56 dropped)."""
    return [c for c in df.columns if c not in META and c not in AUDIO and c not in LYRIC_DROP]


def rec_matrix(df: pd.DataFrame, slider: float) -> np.ndarray:
    """Exact live feature matrix: drop the 56 lyric/theme columns, divide descriptors by slider**3
    (floored at 1e-5), drop the meta columns, cast to float32."""
    dcols = descriptor_cols(df)
    X = df.drop(columns=LYRIC_DROP).copy()
    s = float(slider) ** 3
    if s <= 1e-5:
        s = 1e-5
    X[dcols] = X[dcols].apply(lambda x: x / s)
    X = X.drop(columns=META)
    return X.to_numpy(dtype=np.float32)


def live_recommend(df: pd.DataFrame, album_row: int, slider: float, k: int = 5) -> list[int]:
    """What the Heroku endpoint returns for one album: KNN(n_neighbors=k+1) over the given rows,
    minus the seed. Row numbers are positions in `df`."""
    X = rec_matrix(df, slider)
    nn = NearestNeighbors(n_neighbors=k + 1, algorithm="auto").fit(X)
    _, idx = nn.kneighbors(X[[album_row]])
    return [int(i) for i in idx[0] if int(i) != album_row][:k]
