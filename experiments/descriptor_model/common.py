"""Shared data access for the descriptor-prediction experiment.

Canonical row index everywhere = position in `rmr_pipeline.table.load_table()` (0..4115).
Nothing here writes to the repo's data folders; the feature table and the genre scrape are read-only.

Public names
    TABLE          the feature table (pandas, RangeIndex)
    DESCRIPTORS    the 120 descriptor columns the recommender uses, in table order
    Y64            (n_rows, 120) float64 rank weights, bit-identical to the table (use for downstream)
    Y              the same as float32 (use for modelling / metrics)
    YB             Y > 0 (bool)
    LABELLED       bool mask: row has at least one of the 120 descriptors
    N_DESC         per-row count of non-zero descriptors among the 120
    FIRST_OF_URI   bool mask: row is the first row of its Spotify URI (= it is in the site catalogue)
    load_genres()  per-row RYM genre lists joined on artist + title
    load_splits()  row -> split array from splits.json;  split_rows(name) -> row numbers of one split
    audio_suspect_rows()  rows whose Spotify URI may be another album's (duplicate URIs, overrides.json)
    label_suspect_rows()  rows whose descriptor vector is an exact copy of another album's
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
PIPELINE_DIR = REPO / "data-pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from rmr_pipeline.constants import AUDIO, LYRIC_DROP, META, SLIDER, STOPS  # noqa: E402
from rmr_pipeline.recs import top_k_neighbours  # noqa: E402
from rmr_pipeline.table import dedupe_table, descriptor_cols, load_table, rec_matrix  # noqa: E402

TABLE_PATH = REPO / "data-retrieval" / "Recommender" / "data" / "all_data_norm.pkl"
GENRE_PATH = REPO / "data-retrieval" / "rymscraper-master" / "Scraped Data" / "top5000records.pkl"
SPLITS_PATH = HERE / "splits.json"
SEED = 20261001

# The scraper's weight for the descriptor listed at 0-based position i of an album's RYM list
# (getDescriptors.py: `(descriptorVal - index) / 42` with descriptorVal = 63).
RANK_TOP = 63
RANK_DIV = 42

TABLE: pd.DataFrame = load_table(TABLE_PATH)
DESCRIPTORS: list[str] = descriptor_cols(TABLE)
ALL_DESCRIPTORS: list[str] = [c for c in TABLE.columns if c not in META and c not in AUDIO]  # 176, incl. lyric/theme
assert len(DESCRIPTORS) == 120 and len(ALL_DESCRIPTORS) == 176

# 29 descriptor columns are stored with object dtype in the pickle; values are plain floats.
Y64: np.ndarray = TABLE[DESCRIPTORS].to_numpy(dtype=np.float64)
Y: np.ndarray = Y64.astype(np.float32)
YB: np.ndarray = Y64 > 0
N_DESC: np.ndarray = YB.sum(1)
LABELLED: np.ndarray = N_DESC > 0
FIRST_OF_URI: np.ndarray = ~TABLE["URI"].duplicated(keep="first").to_numpy()
N_ROWS = len(TABLE)


def formula_weight(position: np.ndarray | int) -> np.ndarray:
    """Table weight of the descriptor at 0-based list position `position`: (63 - position) / 42."""
    return (RANK_TOP - np.asarray(position, dtype=np.float64)) / RANK_DIV


def weight_to_position(w: np.ndarray) -> np.ndarray:
    """Inverse of formula_weight for non-zero weights (0-based position in the album's full RYM list)."""
    return np.rint(RANK_TOP - RANK_DIV * np.asarray(w, dtype=np.float64)).astype(int)


# ---------------------------------------------------------------- genres

def norm_text(s: str) -> str:
    """Casefolded, accent-stripped, punctuation-free text for joins."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold()
    s = s.replace("&", " and ")
    return " ".join(re.sub(r"[^\w\s]", " ", s).split())


@lru_cache(maxsize=1)
def load_genres() -> pd.DataFrame:
    """One row per table row: `genres` (list of RYM genres as listed, [] if the join failed),
    `primary` (first listed genre or "unknown"), `matched` (bool), `how` ("exact" | "normalised" | "none"),
    `ambiguous` (the artist+title key occurs more than once in the genre scrape; the first is used,
    matching the table's own keep-first de-duplication on Title+Artist).
    """
    g = pd.read_pickle(GENRE_PATH)
    g = g[g["Genres"].astype(str).str.strip() != ""]
    counts = g.groupby(["Artist", "Album"]).size()
    first = g.drop_duplicates(["Artist", "Album"], keep="first")
    exact = {(a, t): s for a, t, s in zip(first["Artist"], first["Album"], first["Genres"])}
    loose: dict[tuple[str, str], str] = {}
    for a, t, s in zip(first["Artist"], first["Album"], first["Genres"]):
        loose.setdefault((norm_text(a), norm_text(t)), s)
    rows = []
    for a, t in zip(TABLE["Artist"].astype(str), TABLE["Title"].astype(str)):
        how, s = "none", None
        if (a, t) in exact:
            how, s = "exact", exact[(a, t)]
        elif (norm_text(a), norm_text(t)) in loose:
            how, s = "normalised", loose[(norm_text(a), norm_text(t))]
        genres = [x.strip() for x in str(s).split(",") if x.strip()] if s is not None else []
        rows.append({
            "genres": genres,
            "primary": genres[0] if genres else "unknown",
            "matched": bool(genres),
            "how": how if genres else "none",
            "ambiguous": bool(how == "exact" and counts.get((a, t), 0) > 1),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- splits

def load_splits(path: Path = SPLITS_PATH) -> np.ndarray:
    """Array of length N_ROWS with "train" / "val" / "test" / "none" (unlabelled rows)."""
    d = json.loads(Path(path).read_text())
    out = np.full(N_ROWS, "none", dtype=object)
    for r, s in d["rows"].items():
        out[int(r)] = s
    return out


def split_rows(name: str, path: Path = SPLITS_PATH) -> np.ndarray:
    """Sorted table row numbers of one split ("train" | "val" | "test")."""
    if name not in ("train", "val", "test"):
        raise ValueError(name)
    return np.flatnonzero(load_splits(path) == name)


# ---------------------------------------------------------------- rows whose Spotify URI is known to be unreliable

@lru_cache(maxsize=1)
def audio_suspect_rows() -> dict[str, np.ndarray]:
    """Table rows whose URI (hence audio columns, previews, embeddings) may belong to a different album.

    "duplicate_uri"  every row of a URI that the table assigns to two or three albums (69 rows): the
                     albums are different (see ceiling.py), so at most one row per URI has its own audio;
                     which one is not recorded.
    "override"       rows whose URI data-pipeline/overrides.json corrects (key "s"): verified wrong album.
    "any"            union.
    Labels of these rows are fine; it is the audio side that is suspect.
    """
    from rmr_pipeline.artists import clean_artist
    from rmr_pipeline.slugs import make_slugs

    dup = np.flatnonzero(TABLE["URI"].duplicated(keep=False).to_numpy())
    sub, rows = dedupe_table(TABLE)
    slugs = make_slugs([str(t) for t in sub["Title"]], [clean_artist(a) for a in sub["Artist"].astype(str)])
    overrides = json.loads((PIPELINE_DIR / "overrides.json").read_text())
    slug_row = dict(zip(slugs, rows))
    ov = np.array(sorted(slug_row[k] for k, e in overrides.items() if "s" in e and k in slug_row), dtype=int)
    return {"duplicate_uri": dup, "override": ov, "any": np.union1d(dup, ov)}


@lru_cache(maxsize=1)
def label_suspect_rows(min_descriptors: int = 3) -> np.ndarray:
    """Rows whose full 176-column descriptor vector is bit-identical to another row's and has at least
    `min_descriptors` entries (43 rows in 17 groups, e.g. "Dark Magus" / "Dark Eyes" with the same 28
    descriptors in the same order). The scraper looked albums up by name, so in each group all but (at most)
    one row carry another album's descriptors. This is a lower bound on mislabelled rows: a wrong page that
    is not also in the table cannot be detected this way."""
    A = TABLE[ALL_DESCRIPTORS].to_numpy(dtype=np.float64)
    groups: dict[bytes, list[int]] = {}
    for i, row in enumerate(A):
        if (row > 0).sum() >= min_descriptors:
            groups.setdefault(row.tobytes(), []).append(i)
    return np.array(sorted(i for v in groups.values() if len(v) > 1 for i in v), dtype=int)
