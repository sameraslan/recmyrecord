"""Synthetic stand-in for the extraction caches, so the evaluation runs before real features exist.

CLI: python fixture.py   (writes cache/fixture/: album_features.parquet, embeddings.parquet,
                          tracks.parquet + tracks_effnet.npy for the clip-length check)

Per track: the album's Spotify features plus track noise (larger on long-track albums, and a
louder, more energetic first track), pushed through noisy nonlinear maps to Essentia-like
scalars; the embedding is a ReLU random projection of [track audio | album descriptors].
About 8% of albums are missing (never the first 50 rows) and 10% of the rest have unanalysed tracks.
"""
import numpy as np
import pandas as pd

from common import CACHE, load_albums
from rmr_pipeline.constants import AUDIO
from rmr_pipeline.table import descriptor_cols

FIXTURE = CACHE / "fixture"
EFFNET_DIM, MAEST_DIM = 1280, 768


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


def make_fixture(seed: int = 0) -> None:
    """Write the fixture caches under cache/fixture/."""
    rng = np.random.default_rng(seed)
    albums = load_albums()
    albums = albums[(rng.random(len(albums)) > 0.08) | (albums["row"] < 50)]  # the best-known albums stay
    S = albums[AUDIO].to_numpy(dtype=np.float64)
    D = albums[descriptor_cols(albums.drop(columns="row"))].to_numpy(dtype=np.float64) / 1.5
    total = rng.integers(3, 17, len(albums))
    a = np.repeat(np.arange(len(albums)), total)  # album position of each track
    idx = np.concatenate([np.arange(t) for t in total])
    long_track = S[a, AUDIO.index("duration_ms")] / S[:, AUDIO.index("duration_ms")].std()
    T = S[a] + rng.normal(0, 0.06, (len(a), len(AUDIO))) * (1 + 0.5 * long_track[:, None])
    T[:, [AUDIO.index("energy"), AUDIO.index("loudness")]] += 0.05 * (idx == 0)[:, None]
    T = np.clip(T, 0, 1)

    tracks = pd.DataFrame({"row": albums["row"].to_numpy()[a], "track_idx": idx, "n_tracks_total": total[a],
                           **_scalars(dict(zip(AUDIO, T.T)), rng)})
    W = rng.normal(0, 1, (len(AUDIO) + D.shape[1], EFFNET_DIM)).astype(np.float32)
    W[:len(AUDIO)] *= 3  # audio drives the embedding more than the descriptors do
    latent = np.hstack([T - T.mean(0), D[a]]).astype(np.float32)
    effnet = np.maximum(latent @ W + rng.normal(0, 1, (len(a), EFFNET_DIM)).astype(np.float32), 0)

    partial = rng.random(len(albums)) < 0.10
    ok = ~(partial[a] & (rng.random(len(a)) < 0.4)) | (idx == 0)
    tracks, effnet, a = tracks[ok].reset_index(drop=True), effnet[ok], a[ok]

    FIXTURE.mkdir(parents=True, exist_ok=True)
    tracks.to_parquet(FIXTURE / "tracks.parquet")
    np.save(FIXTURE / "tracks_effnet.npy", effnet)

    g = tracks.groupby("row", sort=True)
    ids = pd.DataFrame({"row": albums["row"].to_numpy(), "uri": albums["URI"].to_numpy(),
                        "n_tracks_total": total, "n_tracks_ok": g.size().to_numpy()})
    means = g.mean().drop(columns=["track_idx", "n_tracks_total"]).reset_index(drop=True)
    pd.concat([ids, means], axis=1).to_parquet(FIXTURE / "album_features.parquet")
    album_effnet = pd.DataFrame(effnet).groupby(a).mean().to_numpy(dtype=np.float32)
    Wm = rng.normal(0, 1, (EFFNET_DIM, MAEST_DIM)).astype(np.float32) / 30
    maest = np.tanh(album_effnet @ Wm) + rng.normal(0, 0.3, (len(albums), MAEST_DIM)).astype(np.float32)
    emb = ids[["row", "uri", "n_tracks_ok"]].copy()
    emb["effnet"], emb["maest"] = list(album_effnet), list(maest.astype(np.float32))
    emb.to_parquet(FIXTURE / "embeddings.parquet")
    print(f"fixture: {len(albums)} albums, {len(tracks)} tracks -> {FIXTURE}")


if __name__ == "__main__":
    make_fixture()
