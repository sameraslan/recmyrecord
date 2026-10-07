"""The local clip cache (data-pipeline/.cache/audio/clips.sqlite, gitignored): one row per clip tried,
with its embedding when it worked. It is what makes `sync` resumable and what lets an album go from
four clips to eight by downloading four. If it is lost, nothing committed is lost: topping an album
up then downloads all of its clips again.

  clips(key, source, album_id, track_id, track_idx, prio, status, error, clip_s, sig, emb, updated_at)

  key, source, album_id   the album (feature-table URI) and the listing the clip came from; a local
                          file has source `local` and an empty album_id
  track_id                the store's track id, or the file name
  track_idx               the track's position in the listing (or among the folder's files)
  prio                    the clip's rank in the album's clip order (its place in priority_order when
                          it was taken); an album's N-clip mean is the mean of its first N `ok`
                          clips in rank order, so a clip that failed does not use up a place
  status                  ok | no_preview (none, or an empty one) | too_short | decode_failed
                          (final: never tried again)
                          download_failed | analysis_failed | crashed (tried again by the next sync)
  sig                     local files: size and modification time, to notice a replaced file
  emb                     float16 little-endian, 1280 values
"""
import sqlite3
from pathlib import Path

import numpy as np

from rmr_pipeline.audio_store import DIM

SCHEMA = """CREATE TABLE IF NOT EXISTS clips(key TEXT NOT NULL, source TEXT NOT NULL, album_id TEXT NOT NULL,
    track_id TEXT NOT NULL, track_idx INTEGER, prio INTEGER, status TEXT NOT NULL, error TEXT, clip_s REAL,
    sig TEXT, emb BLOB, updated_at TEXT, PRIMARY KEY(key, source, album_id, track_id))"""
COLS = ("key", "source", "album_id", "track_id", "track_idx", "prio", "status", "error", "clip_s", "sig", "emb")
FINAL = ("ok", "no_preview", "too_short", "decode_failed")


def priority_order(n: int) -> list[int]:
    """Positions 0..n-1 ordered so that every prefix is spread evenly through the album: the first
    track, then the middle, then the quarters, and so on (bit-reversal order). The first four of
    eight are the four."""
    bits = max(1, (n - 1).bit_length())
    return list(dict.fromkeys(int(f"{i:0{bits}b}"[::-1], 2) * n >> bits for i in range(1 << bits)))


def to_blob(emb: np.ndarray) -> bytes:
    return np.asarray(emb).astype("<f2").tobytes()


class ClipCache:
    def __init__(self, path: Path | str, readonly: bool = False):
        """`readonly` opens an existing cache without creating or changing anything (dry runs)."""
        self.readonly = readonly
        if readonly:
            self.con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=60)
            return
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(path, timeout=60)
        self.con.execute(SCHEMA)
        self.con.commit()

    def put(self, recs: list[dict]) -> None:
        """Insert or replace clips (dicts with COLS; missing ones are NULL) and commit."""
        self.con.executemany(
            f"INSERT OR REPLACE INTO clips({', '.join(COLS)}, updated_at) "
            f"VALUES ({', '.join(':' + c for c in COLS)}, datetime('now'))",
            [{**dict.fromkeys(COLS), **{k: v for k, v in r.items() if k in COLS}} for r in recs])
        self.con.commit()

    def album(self, key: str, source: str, album_id: str) -> list[dict]:
        """The album's clips from one listing, without embeddings, by prio then track."""
        rows = self.con.execute(
            "SELECT track_id, track_idx, prio, status, sig, error FROM clips WHERE key = ? AND source = ? AND album_id = ? "
            "ORDER BY prio IS NULL, prio, track_idx", (key, source, album_id)).fetchall()
        return [dict(zip(("track_id", "track_idx", "prio", "status", "sig", "error"), r)) for r in rows]

    def summary(self) -> dict[tuple[str, str, str], list[tuple[int | None, str]]]:
        """(key, source, album_id) -> [(prio, status)] for every clip: what planning needs, in one query."""
        out: dict[tuple[str, str, str], list] = {}
        for key, source, album_id, prio, status in self.con.execute(
                "SELECT key, source, album_id, prio, status FROM clips"):
            out.setdefault((key, source, album_id), []).append((prio, status))
        return out

    def forget(self, key: str, source: str, album_id: str, track_ids: list[str]) -> None:
        self.con.executemany("DELETE FROM clips WHERE key = ? AND source = ? AND album_id = ? AND track_id = ?",
                             [(key, source, album_id, t) for t in track_ids])
        self.con.commit()

    def mean(self, key: str, source: str, album_id: str, clips: int | None,
             below_rank: bool = False) -> tuple[np.ndarray | None, int]:
        """(mean embedding in float64, number of clips) over the album's first `clips` ok clips in rank
        order (all of them when clips is None), averaged in track order; (None, 0) when it has none.
        `below_rank` takes the ok clips with prio < clips instead: how the experiment's shard was made."""
        rows = self.con.execute(
            "SELECT emb, track_idx, prio FROM clips WHERE key = ? AND source = ? AND album_id = ? AND status = 'ok' "
            "AND emb IS NOT NULL ORDER BY prio, track_idx", (key, source, album_id)).fetchall()
        if clips is not None:
            rows = [r for r in rows if r[2] < clips] if below_rank else rows[:clips]
        rows = sorted(rows, key=lambda r: r[1])
        if not rows:
            return None, 0
        stack = np.stack([np.frombuffer(r[0], "<f2").astype(np.float32) for r in rows])
        assert stack.shape[1] == DIM
        return stack.astype(np.float64).mean(axis=0), len(rows)

    def close(self) -> None:
        if not self.readonly:
            self.con.commit()
        self.con.close()
