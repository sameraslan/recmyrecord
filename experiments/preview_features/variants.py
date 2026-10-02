"""Audio-block variants: what replaces the 13 Spotify columns in the recommender's matrix.

Every variant is an (n_albums, d) float array over the same pool; the RYM descriptor block is
never touched. Scale matters because the descriptors' weight is fixed by the slider: Spotify's
block has a given total variance (sum of column variances) on the pool, and every variant that
is not a per-column drop-in is rescaled to that total.

  A       the 13 Spotify columns (baseline)
  B13     closest Essentia analogue per Spotify column, min-max (B13_MAP); B13v variance-matched
  Ball    every Essentia scalar, min-max, block variance-matched
  C/Cemb  Ridge onto the 13 Spotify columns, out-of-fold predictions (scalars / + effnet PCA 64)
  Cvm/Cembvm  the same with each column rescaled to the Spotify column's std
  D16..D64    effnet album embedding, L2-normalised, PCA 16/24/32/48/64, variance-matched (Dm*: maest,
              Dn*: musicnn, 16/24/32 only). D64 is the proposed block; solution.py is the same recipe
              kept as a transform.
  E, E13  Ball (or B13) + D24, half of A's variance each
  F, Femb Cvm (or Cembvm) + D24, half of A's variance each: "Spotify-like + embedding"
  Z0      no audio block; Zs: the Spotify block with rows shuffled
"""
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.decomposition import PCA
from sklearn.linear_model import RidgeCV
from sklearn.metrics import r2_score
from sklearn.model_selection import KFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from common import MATCH_DB, REPO, load_albums
from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import AUDIO
from rmr_pipeline.slugs import make_slugs

ID_COLS = {"row", "uri", "n_tracks_total", "n_tracks_ok", "clip_s"}  # not features
# Spotify column -> Essentia candidates, first one present wins; () = no analogue, column dropped.
# speechiness (spoken-word detector), liveness (audience detector) and time_signature have no
# Essentia counterpart among the extracted scalars; a far-fetched proxy would only add noise.
B13_MAP = {
    "danceability": ("danceability", "dfa_danceability"),
    "energy": ("deam_arousal", "emomusic_arousal", "mood_aggressive", "rms"),
    "key": ("key",),
    "loudness": ("loudness_lufs", "loudness", "rms"),
    "mode": ("mode",),
    "speechiness": (),
    "acousticness": ("mood_acoustic",),
    "instrumentalness": ("instrumental", "voice_instrumental"),
    "liveness": (),
    "valence": ("deam_valence", "emomusic_valence", "mood_happy"),
    "tempo": ("bpm", "tempo"),
    "duration_ms": ("duration_ms", "duration_s"),
    "time_signature": (),
}
EMB_TAG = {"effnet": "D", "maest": "Dm", "musicnn": "Dn"}
PCA_KS = (16, 24, 32, 48, 64)
E_K = 24
RIDGE_PCS = 64
ALPHAS = np.logspace(-2, 4, 13)


@dataclass
class Inputs:
    """The evaluation pool: `albums` (rows of load_albums(), fresh index), the Essentia scalars
    and embeddings aligned to it (None / {} for a baseline-only run), `tracks` (n_tracks_ok,
    n_tracks_total), `seeds` (album masks for the Spotify-agreement metrics, see seed_groups)
    and `fit`, the Ridge training set (one of the seed masks)."""
    albums: pd.DataFrame
    scalars: pd.DataFrame | None
    emb: dict[str, np.ndarray]
    tracks: pd.DataFrame | None
    seeds: dict[str, np.ndarray]
    fit: np.ndarray


def override_rows(albums: pd.DataFrame, match_db: Path = MATCH_DB) -> set[int]:
    """`row` of the albums whose Spotify URI points at the wrong album: the slugs of
    data-pipeline/overrides.json, plus match.sqlite's override flag once the matcher has run."""
    slugs = make_slugs(albums["Title"].astype(str), [clean_artist(a) for a in albums["Artist"].astype(str)])
    keys = set(json.loads((REPO / "data-pipeline" / "overrides.json").read_text()))
    rows = {int(r) for r, s in zip(albums["row"], slugs) if s in keys}
    if match_db.exists():
        with sqlite3.connect(f"file:{match_db}?mode=ro", uri=True) as con:
            rows |= {int(r) for (r,) in con.execute("SELECT row FROM albums WHERE override = 1")}
    return rows


def seed_groups(albums: pd.DataFrame, match_db: Path = MATCH_DB) -> dict[str, np.ndarray]:
    """Album masks: which seeds can be compared with Spotify's features.
      all          the Spotify features are this album's (not an override)
      clean        also matched without ambiguity, to the edition Spotify analysed: no
                   `spotify_twin`, and mean track duration within 10% of Spotify's (`dur_off`)
      ambiguous / unambiguous   `all`, split by the matcher's ambiguity flag (matched albums only)
    Only `all` exists before the matcher has run."""
    out = {"all": ~albums["row"].isin(override_rows(albums, match_db)).to_numpy()}
    if match_db.exists():
        with sqlite3.connect(f"file:{match_db}?mode=ro", uri=True) as con:
            m = pd.read_sql("SELECT row, status, ambiguous, candidates FROM albums", con).set_index("row")
        m = m.reindex(albums["row"])
        top = [(json.loads(c) or [{}])[0] if c else {} for c in m["candidates"]]
        matched = (m["status"] == "matched").to_numpy()
        ambiguous = (m["ambiguous"] == 1).to_numpy()
        same_edition = np.array([not t.get("spotify_twin") and t.get("dur_off") is not None and t["dur_off"] <= 0.1
                                 for t in top])
        out |= {"clean": out["all"] & matched & ~ambiguous & same_edition,
                "ambiguous": out["all"] & matched & ambiguous, "unambiguous": out["all"] & matched & ~ambiguous}
    return out


def make_inputs(f: pd.DataFrame | None, e: pd.DataFrame | None, rows=None, subset: str = "all") -> Inputs:
    """Pool = albums with at least one analysed track and every embedding in both frames
    (album_features / embeddings layouts), optionally restricted to `rows`; the whole catalog
    when `f` is None. Scalar columns are every numeric non-id column; NaNs take the median.
    `subset` names the seed group the Ridge trains on."""
    albums = load_albums()
    if f is None:
        seeds = seed_groups(albums)
        return Inputs(albums, None, {}, None, seeds, seeds[subset])
    f, e = f.set_index("row"), e.set_index("row")
    names = [c for c in e.columns if c in EMB_TAG]
    keep = albums["row"].isin(f.index[f["n_tracks_ok"] > 0].intersection(e.index[e[names].notna().all(axis=1)]))
    if rows is not None:
        keep &= albums["row"].isin(rows)
    albums = albums[keep].reset_index(drop=True)
    f, e = f.loc[albums["row"]], e.loc[albums["row"]]
    scalars = f.drop(columns=[c for c in f.columns if c in ID_COLS]).select_dtypes("number")
    scalars = scalars.loc[:, scalars.nunique() > 1].astype(np.float64)
    scalars = scalars.fillna(scalars.median()).reset_index(drop=True)
    emb = {c: np.stack(e[c].to_numpy()).astype(np.float32) for c in names}
    seeds = seed_groups(albums)
    tracks = f[["n_tracks_ok", "n_tracks_total"]].reset_index(drop=True)
    return Inputs(albums, scalars, emb, tracks, seeds, seeds[subset])


def load_inputs(features: Path | None, embeddings: Path | None, subset: str = "all") -> Inputs:
    """make_inputs from the cache parquets (baseline-only pool when `features` is None)."""
    if features is None:
        return make_inputs(None, None, subset=subset)
    return make_inputs(pd.read_parquet(features), pd.read_parquet(embeddings), subset=subset)


def total_var(X: np.ndarray) -> float:
    """Sum of column variances: the block's weight in a squared euclidean distance."""
    return float(X.var(axis=0).sum())


def match_var(X: np.ndarray, target: float) -> np.ndarray:
    """X scaled by one factor so its total variance equals `target`."""
    return X * np.sqrt(target / total_var(X))


def minmax(X: np.ndarray) -> np.ndarray:
    """Each column mapped to [0, 1] over the pool, as the Spotify columns were."""
    lo, hi = X.min(axis=0), X.max(axis=0)
    return (X - lo) / (hi - lo)


def pca_scores(E: np.ndarray, k: int) -> np.ndarray:
    """Top-k principal component scores of the L2-normalised embedding. L2 first because the
    embedding's norm tracks confidence, not style (cosine is how these embeddings are compared);
    no per-dimension standardisation or whitening, which would amplify the 1,000+ low-variance
    directions; components keep their own variance so the leading ones dominate."""
    E = E / np.linalg.norm(E, axis=1, keepdims=True)
    return PCA(n_components=min(k, len(E) - 1), svd_solver="full").fit_transform(E.astype(np.float64))


def b13_columns(scalars: pd.DataFrame) -> dict[str, str | None]:
    """The Essentia column standing in for each Spotify column (None = dropped)."""
    return {a: next((c for c in cands if c in scalars.columns), None) for a, cands in B13_MAP.items()}


def ridge_oof(X: np.ndarray, Y: np.ndarray, fit: np.ndarray, names: list[str], seed: int) -> tuple[np.ndarray, dict]:
    """5-fold out-of-fold Ridge predictions of the 13 Spotify columns (standardised inputs, alpha
    per target by leave-one-out CV inside each training fold; albums with `fit` False never train).
    Returns the predictions and a report: per-feature out-of-fold R², and from a final fit on all
    `fit` albums the chosen alphas and the five largest standardised coefficients per target."""
    model = make_pipeline(StandardScaler(), RidgeCV(alphas=ALPHAS, alpha_per_target=True))
    pred = np.empty_like(Y)
    for tr, te in KFold(5, shuffle=True, random_state=seed).split(X):
        tr = tr[fit[tr]]
        pred[te] = clone(model).fit(X[tr], Y[tr]).predict(X[te])
    ridge = model.fit(X[fit], Y[fit])[-1]
    r2 = r2_score(Y[fit], pred[fit], multioutput="raw_values")
    top = np.argsort(-np.abs(ridge.coef_), axis=1)[:, :5]
    return pred, {
        "r2_oof": dict(zip(AUDIO, r2.round(4).tolist())),
        "r2_oof_mean": round(float(r2.mean()), 4),
        "alpha": dict(zip(AUDIO, np.asarray(ridge.alpha_, dtype=float).tolist())),
        "top_inputs": {a: [[names[j], round(float(ridge.coef_[i, j]), 4)] for j in top[i]]
                       for i, a in enumerate(AUDIO)},
        "n_inputs": X.shape[1],
    }


def build_variants(inp: Inputs, seed: int = 0) -> tuple[dict[str, np.ndarray | None], dict]:
    """Every variant's audio block over the pool (None = no audio block) and a report
    (B13 mapping with each analogue's correlation to its Spotify column, Ridge fits, block sizes)."""
    A = inp.albums[AUDIO].to_numpy(dtype=np.float64)
    target = total_var(A)
    rng = np.random.default_rng(seed)
    out: dict[str, np.ndarray | None] = {"A": A, "Z0": None, "Zs": A[rng.permutation(len(A))]}
    report: dict = {}
    if inp.scalars is not None:
        S = inp.scalars
        names = list(S.columns)
        chosen = b13_columns(S)
        report["b13"] = {a: {"column": c, "pearson_r": None if c is None else
                             round(float(np.corrcoef(S[c][inp.fit], A[inp.fit, i])[0, 1]), 4)}
                         for i, (a, c) in enumerate(chosen.items())}
        out["B13"] = minmax(S[[c for c in chosen.values() if c]].to_numpy())
        out["B13v"] = match_var(out["B13"], target)
        out["Ball"] = match_var(minmax(S.to_numpy()), target)

        scores = {name: pca_scores(E, max(RIDGE_PCS, *PCA_KS)) for name, E in inp.emb.items()}
        ridge_inputs = {"C": (S.to_numpy(), names)}
        if "effnet" in scores:
            pcs = scores["effnet"][:, :RIDGE_PCS]
            ridge_inputs["Cemb"] = (np.hstack([S.to_numpy(), pcs]),
                                    names + [f"effnet_pc{i + 1}" for i in range(RIDGE_PCS)])
        report["ridge"] = {}
        for name, (X, cols) in ridge_inputs.items():
            out[name], report["ridge"][name] = ridge_oof(X, A, inp.fit, cols, seed)
            out[name + "vm"] = A.mean(0) + (out[name] - out[name].mean(0)) * A.std(0) / out[name].std(0)
        for emb, P in scores.items():
            for k in PCA_KS if emb == "effnet" else PCA_KS[:3]:
                out[f"{EMB_TAG[emb]}{k}"] = match_var(P[:, :k], target)
        if "effnet" in scores:
            half = match_var(scores["effnet"][:, :E_K], target / 2)
            out["E"] = np.hstack([match_var(out["Ball"], target / 2), half])
            out["E13"] = np.hstack([match_var(out["B13"], target / 2), half])
            out["F"] = np.hstack([match_var(out["Cvm"], target / 2), half])
            out["Femb"] = np.hstack([match_var(out["Cembvm"], target / 2), half])
    report["blocks"] = {k: {"columns": 0 if v is None else v.shape[1],
                            "total_var_vs_A": 0.0 if v is None else round(total_var(v) / target, 4)}
                        for k, v in out.items()}
    return out, report
