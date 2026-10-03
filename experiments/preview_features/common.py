"""Shared paths and table access for the preview-features experiment.

Everything here is read-only with respect to the site: nothing under frontcreck/public/data/ or
the build pipeline's outputs is written. All experiment state lives in cache/ (gitignored).
"""
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CACHE = HERE / "cache"
MODELS = CACHE / "models"
RESULTS = HERE / "results"

MATCH_DB = CACHE / "match.sqlite"  # albums + tracks tables, written by match.py
FEATURES_DB = CACHE / "features.sqlite"  # per-track scalars + embeddings, written by extract.py
ALBUM_FEATURES = CACHE / "album_features.parquet"  # per-album scalar means, written by aggregate.py
EMBEDDINGS = CACHE / "embeddings.parquet"  # per-album embeddings, shared with the descriptor experiment

TABLE_NORM = REPO / "data-retrieval" / "Recommender" / "data" / "all_data_norm.pkl"
TABLE_RAW = REPO / "data-retrieval" / "Recommender" / "data" / "all_data.pkl"
RYM_GENRES = REPO / "data-retrieval" / "rymscraper-master" / "Scraped Data" / "top5000records.pkl"
ALBUMS_JSON = REPO / "frontcreck" / "public" / "data" / "albums.json"

sys.path.insert(0, str(REPO / "data-pipeline"))  # rmr_pipeline, imported read-only

from rmr_pipeline.table import dedupe_table, load_table  # noqa: E402


def load_albums() -> pd.DataFrame:
    """The deduped feature table (first row per URI, as the recommender uses it) with a `row`
    column: the album's row index in all_data_norm.pkl. `row` is the key of every cache."""
    sub, rows = dedupe_table(load_table(TABLE_NORM))
    sub.insert(0, "row", rows)
    return sub
