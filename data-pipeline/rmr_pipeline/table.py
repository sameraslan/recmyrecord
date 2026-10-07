"""Feature table access and an exact replica of the live recommender."""
import hashlib
import os
from pathlib import Path

import numpy as np
import pandas as pd

from .constants import AUDIO, DEFAULT_TABLE, DEFAULT_TABLE_SHA256, LYRIC_DROP, META


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_table_hash(path: Path, expected_sha256: str) -> None:
    """Raise if the file's SHA-256 differs from `expected_sha256`, unless
    RMR_ALLOW_TABLE_HASH_MISMATCH=1 is set (for intentional updates)."""
    actual = sha256_file(path)
    if actual != expected_sha256.lower() and os.environ.get("RMR_ALLOW_TABLE_HASH_MISMATCH") != "1":
        raise ValueError(
            f"Refusing to unpickle {path}: SHA-256 {actual} does not match the pinned {expected_sha256}. "
            "If the table was updated on purpose, update DEFAULT_TABLE_SHA256 in rmr_pipeline/constants.py "
            "(or set RMR_ALLOW_TABLE_HASH_MISMATCH=1 for this run)."
        )


def load_table(path: Path = DEFAULT_TABLE, expected_sha256: str | None = None) -> pd.DataFrame:
    """The feature table in catalog-rank order with a fresh RangeIndex (row = album number - 1).
    The pickle is hash-checked before loading: against `expected_sha256` when given, otherwise
    against DEFAULT_TABLE_SHA256 when `path` is the default table."""
    path = Path(path)
    if expected_sha256 is None and path.resolve() == DEFAULT_TABLE.resolve():
        expected_sha256 = DEFAULT_TABLE_SHA256
    if expected_sha256 is not None:
        verify_table_hash(path, expected_sha256)
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
    from sklearn.neighbors import NearestNeighbors  # here, so the audio venv can load the table without scikit-learn

    X = rec_matrix(df, slider)
    nn = NearestNeighbors(n_neighbors=k + 1, algorithm="auto").fit(X)
    _, idx = nn.kneighbors(X[[album_row]])
    return [int(i) for i in idx[0] if int(i) != album_row][:k]
