"""Mood vocabulary and per-album descriptor indexes."""
import numpy as np
import pandas as pd

from .constants import NON_MOOD, TOP_DESCRIPTORS
from .table import descriptor_cols


def build_vocab(sub: pd.DataFrame, places: pd.DataFrame | None = None) -> tuple[list[str], list[list[int]]]:
    """vocab: kept descriptors minus NON_MOOD, most frequent first (stable on ties), only words
    used at least once (114). tops[r]: up to 10 vocab indexes for album r, by weight descending,
    ties to the more common word. With `places` (the catalog build: each descriptor's place among the
    album's own, same columns as `sub`), by place instead, so the words stay in page order whatever
    the weights are."""
    dcols = [c for c in descriptor_cols(sub) if c not in NON_MOOD]
    W = sub[dcols].astype(float).to_numpy()
    key = -W if places is None else places[dcols].to_numpy(dtype=float)
    freq = (W > 0).sum(0)
    order = [int(j) for j in np.argsort(-freq, kind="stable") if freq[j] > 0]
    vocab = [dcols[j] for j in order]
    Wv, key = W[:, order], key[:, order]
    tops: list[list[int]] = []
    for r in range(len(Wv)):
        nz = np.where(Wv[r] > 0)[0]
        top = nz[np.lexsort((nz, key[r, nz]))][:TOP_DESCRIPTORS]
        tops.append([int(x) for x in top])
    return vocab, tops
