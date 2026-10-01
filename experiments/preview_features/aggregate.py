"""Step 3: per-album features from the per-track cache (cache/features.sqlite).

CLI: python aggregate.py [--db cache/features.sqlite] [--match-db cache/match.sqlite]

Albums with at least one analysed track get one row in each output, sorted by `row`.

cache/album_features.parquet
    row, uri, n_tracks_total (tracks on the matched album), n_tracks_ok (tracks analysed), then
    the mean over the analysed tracks of every scalar extract.py stores. `key` is the mean key
    index (C=0 ... B=11, Spotify's convention) and `mode` the share of major-key tracks, as
    Spotify album means were. `duration_ms` is the mean full-track length from the catalog
    metadata over ALL tracks of the matched album, analysed or not; `clip_s` the mean preview length.

cache/embeddings.parquet  (shared with the descriptor experiment)
    row          int64     the album's row index in all_data_norm.pkl (common.load_albums()["row"])
    uri          string    Spotify album URI
    n_tracks_ok  int64     tracks analysed
    effnet       fixed_size_list<float32>[1280]  Discogs-EffNet (discogs-effnet-bs1-1) embedding:
                           mean over 2 s patches within a preview, then mean over the album's tracks
    musicnn      fixed_size_list<float32>[200]   MSD-MusiCNN (msd-musicnn-1) embedding, same averaging
    maest        fixed_size_list<float32>[768]   MAEST (discogs-maest-30s-pw-2, layer 7; mean of CLS,
                           DIST and the average patch token). The column exists only if some track
                           has it; the mean is over the tracks that do, null if the album has none
    Vectors are raw means (float16 precision per track): not centred, not L2-normalised.

`aggregate(selector)` builds the same two frames from a subset of each album's tracks, e.g.
`aggregate(first(1))` for first-track-only features or `aggregate(in_priority_order(4))` for what
an `extract.py --max-tracks-per-album 4` run would have produced.
"""
import argparse
import json
import sqlite3
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from common import ALBUM_FEATURES, EMBEDDINGS, FEATURES_DB, MATCH_DB
from extract import priority_order

EMB_DIMS = {"effnet": 1280, "musicnn": 200, "maest": 768}


def first(k: int):
    """Selector: the first k analysed tracks in album order."""
    return lambda n: np.arange(min(k, n))


def in_priority_order(k: int):
    """Selector: the k tracks extract.py analyses first (track 0, then spread through the album)."""
    return lambda n: np.array(priority_order(n)[:k])


@lru_cache(maxsize=2)
def load_tracks(db: Path = FEATURES_DB) -> tuple[pd.DataFrame, dict[str, np.ndarray]]:
    """The analysed tracks sorted by (row, track_idx): a frame (row, track_idx, prio, the scalars)
    and name -> (n_tracks, dim) float32 embeddings aligned to it, NaN where a track lacks one."""
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    rows = con.execute(f"SELECT row, track_idx, prio, clip_s, scalars, {', '.join(EMB_DIMS)} FROM tracks "
                       "WHERE status = 'ok' ORDER BY row, track_idx").fetchall()
    con.close()
    frame = pd.DataFrame([{"row": r, "track_idx": i, "prio": p, "clip_s": c, **json.loads(s)}
                          for r, i, p, c, s, *_ in rows])
    embs = {}
    for k, (name, dim) in enumerate(EMB_DIMS.items()):
        blobs = [r[5 + k] for r in rows]
        if any(blobs):
            embs[name] = np.stack([np.frombuffer(b, "<f2").astype(np.float32) if b
                                   else np.full(dim, np.nan, np.float32) for b in blobs])
    return frame, embs


def album_meta(match_db: Path = MATCH_DB) -> pd.DataFrame:
    """Per matched album, indexed by row: uri, n_tracks_total and the mean catalog duration_ms."""
    con = sqlite3.connect(f"file:{match_db}?mode=ro", uri=True)
    meta = pd.read_sql("SELECT a.row, a.uri, COUNT(*) AS n_tracks_total, AVG(t.duration_s) * 1000 AS duration_ms "
                       "FROM albums a JOIN tracks t USING (row) WHERE a.status = 'matched' GROUP BY a.row", con)
    con.close()
    return meta.set_index("row")


def aggregate(selector=None, db: Path = FEATURES_DB, match_db: Path = MATCH_DB) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(album features, album embeddings) in the parquet layouts above, averaged over the tracks
    that `selector(n) -> positions` picks among each album's n analysed tracks in album order
    (None = all of them). `n_tracks_ok` stays the number of analysed tracks either way."""
    tracks, embs = load_tracks(db)
    sizes = tracks.groupby("row", sort=False).size()
    starts = np.cumsum(sizes.to_numpy()) - sizes.to_numpy()
    picks = [np.arange(n) if selector is None else np.asarray(selector(n)) for n in sizes]
    take = np.concatenate([s + p for s, p in zip(starts, picks)])
    counts = np.array([len(p) for p in picks])
    offsets = np.cumsum(counts) - counts

    meta = album_meta(match_db).loc[sizes.index]
    ids = pd.DataFrame({"row": sizes.index, "uri": meta["uri"].to_numpy(),
                        "n_tracks_total": meta["n_tracks_total"].to_numpy(), "n_tracks_ok": sizes.to_numpy()})
    scalars = tracks.drop(columns=["row", "track_idx", "prio"]).iloc[take]
    means = scalars.groupby(np.repeat(np.arange(len(sizes)), counts)).mean()
    features = pd.concat([ids, means, meta[["duration_ms"]].reset_index(drop=True)], axis=1)

    emb = ids[["row", "uri", "n_tracks_ok"]].copy()
    for name, e in embs.items():
        e = e[take]
        has = ~np.isnan(e[:, 0])
        n = np.add.reduceat(has, offsets)
        mean = np.add.reduceat(np.where(has[:, None], e, 0), offsets, axis=0) / np.maximum(n, 1)[:, None]
        emb[name] = [v if k else None for v, k in zip(mean.astype(np.float32), n)]
    return features, emb


def write(features: pd.DataFrame, emb: pd.DataFrame, features_path: Path, emb_path: Path) -> None:
    """Both parquet files; embedding columns as fixed-size float32 lists."""
    features.to_parquet(features_path, index=False)
    columns = {c: pa.array(emb[c].tolist(), type=pa.list_(pa.float32(), EMB_DIMS[c])) if c in EMB_DIMS
               else pa.array(emb[c]) for c in emb.columns}
    pq.write_table(pa.table(columns), emb_path)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--db", type=Path, default=FEATURES_DB)
    p.add_argument("--match-db", type=Path, default=MATCH_DB)
    p.add_argument("--features", type=Path, default=ALBUM_FEATURES, help="output: album scalar means")
    p.add_argument("--embeddings", type=Path, default=EMBEDDINGS, help="output: album embeddings")
    args = p.parse_args()
    features, emb = aggregate(db=args.db, match_db=args.match_db)
    write(features, emb, args.features, args.embeddings)
    ok, total = features["n_tracks_ok"], features["n_tracks_total"]
    print(f"{len(features)} albums, {ok.sum()} tracks analysed of {total.sum()} "
          f"({(ok >= total).sum()} albums complete); embeddings: {[c for c in emb.columns if c in EMB_DIMS]}")
    print(f"wrote {args.features} ({len(features.columns)} columns) and {args.embeddings}")


if __name__ == "__main__":
    main()
