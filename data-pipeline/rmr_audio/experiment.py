"""`python -m rmr_audio import-experiment`: seed the clip cache from the preview-features experiment.

The store's first shard is the mean of the experiment's four clips per album. With those clips in
the cache, topping an album up to eight downloads only the other four. Reads (read-only)
experiments/preview_features/cache/features.sqlite (per-clip embeddings with row, track_idx, prio)
and cache/match.sqlite (which listing each album's clips came from); `row` is the album's row in the
feature table. Both files are gitignored, so this only works on the machine that ran the experiment.
"""
import sqlite3
from pathlib import Path

import numpy as np

from rmr_pipeline.audio_store import read_shard
from rmr_pipeline.constants import REPO
from rmr_pipeline.table import dedupe_table, load_table

from .clips import ClipCache

EXPERIMENT_CACHE = REPO / "experiments" / "preview_features" / "cache"
SOURCES = {"deezer": "deezer", "itunes": "itunes:us"}
FIRST_SHARD, FIRST_SHARD_CLIPS = "part-0001.npz", 4


def _read_only(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def import_experiment(cache: ClipCache, table: Path, experiment: Path = EXPERIMENT_CACHE) -> int:
    """Copy every clip the experiment tried into the cache; returns how many. Clips already there are replaced."""
    sub, rows = dedupe_table(load_table(table))
    key_of = dict(zip(rows, sub["URI"].astype(str)))
    con = _read_only(experiment / "match.sqlite")
    album_of = {row: (uri, SOURCES[source], album_id) for row, uri, source, album_id in con.execute(
        "SELECT row, uri, source, source_album_id FROM albums WHERE status = 'matched'")}
    con.close()
    con = _read_only(experiment / "features.sqlite")
    recs = []
    for row, track_idx, prio, status, error, source, track_id, clip_s, emb in con.execute(
            "SELECT row, track_idx, prio, status, error, source, track_id, clip_s, effnet FROM tracks "
            "ORDER BY row, track_idx"):
        if row not in key_of:
            continue
        uri, album_source, album_id = album_of[row]
        assert uri == key_of[row] and album_source == SOURCES[source], (row, uri, source)
        recs.append({"key": uri, "source": album_source, "album_id": album_id, "track_id": track_id,
                     "track_idx": track_idx, "prio": prio, "status": status, "error": error, "clip_s": clip_s,
                     "emb": emb if status == "ok" else None})
    con.close()
    cache.put(recs)
    return len(recs)


def check_first_shard(cache: ClipCache, audio_dir: Path) -> int:
    """Assert that the cached clips with prio < 4 reproduce the store's first shard exactly (float16);
    returns the number of albums checked."""
    shard = read_shard(audio_dir / "embeddings" / FIRST_SHARD)
    listing = {key: (source, album_id) for key, source, album_id in cache.con.execute(
        "SELECT DISTINCT key, source, album_id FROM clips")}
    for key, emb, n_clips, source in zip(shard.keys.tolist(), shard.emb, shard.n_clips.tolist(), shard.source.tolist()):
        assert key in listing and listing[key][0] == source, f"{key}: not in the clip cache as a {source} album"
        mean, n = cache.mean(key, *listing[key], FIRST_SHARD_CLIPS)
        assert n == n_clips, f"{key}: {n} cached clips, the shard says {n_clips}"
        assert np.array_equal(mean.astype(np.float16), emb), f"{key}: the cached clips do not give the shard's mean"
    return len(shard.keys)
