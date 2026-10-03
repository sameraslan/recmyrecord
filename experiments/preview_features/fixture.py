"""Synthetic stand-in for the extraction caches, so the harness can be tested without real features.

CLI: python fixture.py [--albums 400]   (writes cache/fixture/features.sqlite and match.sqlite in the
                                         layouts of extract.py and match.py, as far as aggregate.py
                                         reads them; small by default, delete the folder after use)

Per track: the album's Spotify features plus track noise (larger on long-track albums, and a
louder, more energetic first track), pushed through noisy nonlinear maps to Essentia-like
scalars; the embeddings are random projections of [track audio | album descriptors]. The first
50 rows are always in; 10% of the albums have tracks that failed to download.
"""
import argparse
import json
import sqlite3

import numpy as np

from common import CACHE, load_albums
from extract import SCHEMA, priority_order
from rmr_pipeline.constants import AUDIO
from rmr_pipeline.table import descriptor_cols

FIXTURE = CACHE / "fixture"
EFFNET_DIM, MUSICNN_DIM = 1280, 200


def _sig(x):
    return 1 / (1 + np.exp(-x))


def _scalars(s: dict[str, np.ndarray], rng: np.random.Generator) -> dict[str, np.ndarray]:
    """Essentia-like scalars from Spotify-like per-track features `s` (name -> array)."""
    n = len(s["energy"])
    e = lambda sd: rng.normal(0, sd, n)  # noqa: E731
    octave = np.where(rng.random(n) < 0.1, 2.0, 1.0)  # tempo octave errors
    return {
        "bpm": (60 + 140 * s["tempo"]) * octave + e(4),
        "bpm_confidence": 2 + 2 * s["danceability"] + e(0.8),
        "key": np.clip(np.round(11 * s["key"] + e(2.5)), 0, 11),
        "mode": (rng.random(n) < s["mode"]).astype(float),
        "key_strength": 0.5 + 0.3 * s["acousticness"] + e(0.1),
        "loudness_lufs": -40 + 35 * s["loudness"] + e(1.5),
        "loudness_range": 3 + 10 * (1 - s["energy"]) + e(1.5),
        "duration_ms": (60_000 + 1.5e6 * s["duration_ms"]) * np.exp(e(0.3)),
        "rms": np.exp(-4 + 3 * s["loudness"] + e(0.2)),
        "dynamic_complexity": 2 + 6 * s["acousticness"] * (1 - s["loudness"]) + e(0.6),
        "onset_rate": 1 + 5 * s["energy"] * (0.5 + s["tempo"]) + e(0.5),
        "spectral_centroid": 600 + 2500 * s["energy"] ** 2 - 400 * s["acousticness"] + e(200),
        "dfa_danceability": 0.8 + 1.2 * s["danceability"] + e(0.15),
        "danceability": _sig(6 * (s["danceability"] - 0.5) + e(0.8)),
        "mood_happy": _sig(5 * (s["valence"] - 0.5) + e(1)),
        "mood_sad": _sig(4 * (0.8 - s["valence"] - s["energy"]) + e(1)),
        "mood_aggressive": _sig(8 * (s["energy"] * s["loudness"] - 0.5) + e(1)),
        "mood_relaxed": _sig(5 * (0.5 - s["energy"]) + e(1)),
        "mood_party": _sig(6 * (s["danceability"] * s["energy"] - 0.3) + e(1)),
        "mood_acoustic": _sig(5 * (s["acousticness"] - 0.5) + e(0.8)),
        "mood_electronic": _sig(4 * (s["instrumentalness"] - s["acousticness"]) + e(1.2)),
        "instrumental": _sig(5 * (s["instrumentalness"] - 0.4) + e(0.8)),
        "tonal": _sig(2 - 3 * s["speechiness"] + e(1)),
        "timbre_bright": _sig(4 * (s["energy"] - 0.5) + e(1.2)),
        "approachability": 0.3 + 0.3 * s["valence"] - 0.2 * s["instrumentalness"] + e(0.08),
        "engagement": 0.3 + 0.4 * s["energy"] + e(0.08),
        "deam_valence": 3 + 4 * s["valence"] + e(0.5),
        "deam_arousal": 2.5 + 5 * (0.6 * s["energy"] + 0.4 * s["loudness"]) + e(0.5),
        "emomusic_valence": 3 + 3 * s["valence"] + s["danceability"] + e(0.7),
        "emomusic_arousal": 2.5 + 5 * s["energy"] + e(0.7),
    }


def make_fixture(n_albums: int = 400, seed: int = 0) -> None:
    """Write the fixture databases under cache/fixture/ (replacing any earlier ones)."""
    rng = np.random.default_rng(seed)
    albums = load_albums()
    albums = albums[(rng.random(len(albums)) < n_albums / len(albums)) | (albums["row"] < 50)]
    S = albums[AUDIO].to_numpy(dtype=np.float64)
    D = albums[descriptor_cols(albums.drop(columns="row"))].to_numpy(dtype=np.float64) / 1.5
    total = rng.integers(3, 17, len(albums))
    a = np.repeat(np.arange(len(albums)), total)  # album position of each track
    idx = np.concatenate([np.arange(t) for t in total])
    prio = np.concatenate([np.argsort(priority_order(int(t))) for t in total])
    long_track = S[a, AUDIO.index("duration_ms")] / S[:, AUDIO.index("duration_ms")].std()
    T = S[a] + rng.normal(0, 0.06, (len(a), len(AUDIO))) * (1 + 0.5 * long_track[:, None])
    T[:, [AUDIO.index("energy"), AUDIO.index("loudness")]] += 0.05 * (idx == 0)[:, None]
    T = np.clip(T, 0, 1)
    scalars = _scalars(dict(zip(AUDIO, T.T)), rng)
    duration_s = scalars.pop("duration_ms") / 1000

    W = rng.normal(0, 1, (len(AUDIO) + D.shape[1], EFFNET_DIM)).astype(np.float32)
    W[:len(AUDIO)] *= 3  # audio drives the embedding more than the descriptors do
    latent = np.hstack([T - T.mean(0), D[a]]).astype(np.float32)
    effnet = np.maximum(latent @ W + rng.normal(0, 1, (len(a), EFFNET_DIM)).astype(np.float32), 0)
    Wm = rng.normal(0, 1 / 30, (EFFNET_DIM, MUSICNN_DIM)).astype(np.float32)
    musicnn = np.tanh(effnet @ Wm) + rng.normal(0, 0.3, (len(a), MUSICNN_DIM)).astype(np.float32)
    failed = (rng.random(len(albums)) < 0.10)[a] & (rng.random(len(a)) < 0.4) & (idx > 0)

    FIXTURE.mkdir(parents=True, exist_ok=True)
    rows = albums["row"].to_numpy()
    for name in ("features.sqlite", "match.sqlite"):
        (FIXTURE / name).unlink(missing_ok=True)
    with sqlite3.connect(FIXTURE / "match.sqlite") as con:
        con.execute("CREATE TABLE albums(row INTEGER PRIMARY KEY, uri TEXT, status TEXT)")
        con.execute("CREATE TABLE tracks(row INTEGER, track_idx INTEGER, duration_s REAL)")
        con.executemany("INSERT INTO albums VALUES (?, ?, 'matched')", zip(rows.tolist(), albums["URI"]))
        con.executemany("INSERT INTO tracks VALUES (?, ?, ?)", zip(rows[a].tolist(), idx.tolist(), duration_s.tolist()))
    names = list(scalars)
    values = np.column_stack([scalars[k] for k in names])
    with sqlite3.connect(FIXTURE / "features.sqlite") as con:
        con.execute(SCHEMA)
        con.executemany(
            "INSERT INTO tracks(row, track_idx, prio, status, error, clip_s, scalars, effnet, musicnn) "
            "VALUES (?, ?, ?, ?, ?, 30.0, ?, ?, ?)",
            ((int(rows[a[t]]), int(idx[t]), int(prio[t]), "download_failed", "HTTP 403", None, None, None) if failed[t]
             else (int(rows[a[t]]), int(idx[t]), int(prio[t]), "ok", None, json.dumps(dict(zip(names, values[t]))),
                   effnet[t].astype("<f2").tobytes(), musicnn[t].astype("<f2").tobytes()) for t in range(len(a))))
    print(f"fixture: {len(albums)} albums, {len(a)} tracks ({int(failed.sum())} failed) -> {FIXTURE}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--albums", type=int, default=400, help="approximate number of albums")
    make_fixture(p.parse_args().albums)
