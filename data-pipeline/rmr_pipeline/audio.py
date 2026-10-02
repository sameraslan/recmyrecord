"""The audio block: 64 numbers per album from the committed store and the frozen transform.

CLI: python -m rmr_pipeline.audio status [--audio-dir DIR] [--table PATH]   summary and the imputed albums
     python -m rmr_pipeline.audio fit    [--audio-dir DIR] [--table PATH]   refit transform.npz (explicit, see README)

  block = ((e / |e|) - mean) @ components.T * scale      e: the album's mean clip embedding (store)

`scale` was chosen at fit time so that the block's total variance (sum of column variances) on the
fitted albums equals `target_total_variance`, the Spotify block's on the albums of the first fit:
the slider stops keep their meaning and nothing here reads the Spotify columns.
An album with no embedding gets the mean block of its IMPUTE_K nearest albums by descriptor
distance among the albums that have one, rescaled to those neighbours' mean norm.
"""
import argparse
import sys
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .artists import clean_artist
from .audio_store import DEFAULT_AUDIO, DIM, StoreError, load_store
from .constants import DEFAULT_TABLE
from .table import dedupe_table, descriptor_cols, load_table

BLOCK_DIMS = 64
# Chosen by experiments/preview_features/imputation.py (hide the audio of albums that have it); see README.
IMPUTE_K = 3
IMPUTE_RESCALE = True
TRANSFORM_ARRAYS = ("mean", "components", "scale", "target_total_variance", "fitted", "albums", "model")


@dataclass(frozen=True)
class Transform:
    """The fitted map from an album's mean clip embedding to its audio block."""
    mean: np.ndarray  # (DIM,) float32: mean of the fitted albums' unit vectors
    components: np.ndarray  # (k, DIM) float32, orthonormal rows
    scale: float
    target_total_variance: float
    fitted: str  # ISO date of the fit
    albums: int  # albums fitted on
    model: str  # embedding model id, as in the store's manifest
    keys: np.ndarray | None = None  # the fitted albums' keys in fit order; None in a file written before fits recorded them

    def apply(self, emb: np.ndarray) -> np.ndarray:
        """(n, DIM) album-mean embeddings -> (n, k) float32 block; works for albums never fitted on."""
        centred = unit(emb) - self.mean.astype(np.float64)
        return (centred @ self.components.T.astype(np.float64) * self.scale).astype(np.float32)


@dataclass(frozen=True)
class AudioBlock:
    block: np.ndarray  # (albums, k) float32, aligned with the album frame
    has_audio: np.ndarray  # (albums,) bool; False = imputed
    shards: int
    transform: Transform

    def summary(self) -> str:
        n = int(self.has_audio.sum())
        return (f"audio: {n} albums with audio, {len(self.has_audio) - n} imputed, {self.shards} store shard(s), "
                f"transform fitted {self.transform.fitted} on {self.transform.albums} albums")


def unit(emb: np.ndarray) -> np.ndarray:
    """Rows scaled to length 1, in float64."""
    E = np.asarray(emb, dtype=np.float64)
    return E / np.linalg.norm(E, axis=1, keepdims=True)


def fit_transform(emb: np.ndarray, target_total_variance: float, model: str, k: int = BLOCK_DIMS,
                  fitted: str | None = None, keys=None) -> Transform:
    """PCA(k) of the centred unit vectors, with one scale factor that gives the block the total
    variance `target_total_variance` on these albums. Component signs are fixed (largest loading
    positive) so a refit on the same albums is identical. `keys` (the albums' keys, one per row)
    are kept in the transform, so it says which albums it was fitted on once the store has grown."""
    V = unit(emb)
    if keys is not None:
        keys = np.asarray(keys, dtype=np.str_)
        if keys.shape != (len(V),):
            raise ValueError(f"{len(V)} embeddings but keys of shape {keys.shape}")
    mean = V.mean(axis=0)
    _, s, Vt = np.linalg.svd(V - mean, full_matrices=False)
    C = Vt[:k]
    C = C * np.sign(C[np.arange(len(C)), np.abs(C).argmax(axis=1)])[:, None]
    scale = float(np.sqrt(target_total_variance * len(V) / (s[:k] ** 2).sum()))
    return Transform(mean.astype(np.float32), C.astype(np.float32), scale, float(target_total_variance),
                     fitted or date.today().isoformat(), len(V), model, keys)


def save_transform(path: Path, t: Transform) -> None:
    arrays = dict(mean=t.mean, components=t.components, scale=np.float64(t.scale),
                  target_total_variance=np.float64(t.target_total_variance), fitted=np.str_(t.fitted),
                  albums=np.int64(t.albums), model=np.str_(t.model))
    if t.keys is not None:
        arrays["keys"] = np.asarray(t.keys, dtype=np.str_)
    with open(path, "wb") as f:
        np.savez(f, **arrays)


def load_transform(path: Path) -> Transform:
    try:
        with np.load(path, allow_pickle=False) as z:
            missing = [a for a in TRANSFORM_ARRAYS if a not in z.files]
            if missing:
                raise StoreError(f"{path.name}: missing arrays {missing}")
            t = Transform(z["mean"], z["components"], float(z["scale"]), float(z["target_total_variance"]),
                          str(z["fitted"]), int(z["albums"]), str(z["model"]), z["keys"] if "keys" in z.files else None)
    except FileNotFoundError:
        raise StoreError(f"missing {path}: the frozen transform is not there (see data-pipeline/README.md)") from None
    except (ValueError, OSError, zipfile.BadZipFile) as e:
        raise StoreError(f"{path.name} is not a readable transform: {e}") from None
    if (t.mean.shape != (DIM,) or t.components.ndim != 2 or t.components.shape[1] != DIM
            or not np.isfinite(t.mean).all() or not np.isfinite(t.components).all()
            or not (np.isfinite(t.scale) and t.scale > 0 and t.target_total_variance > 0)):
        raise StoreError(f"{path.name}: needs mean ({DIM},), components (k, {DIM}), finite, and a positive scale "
                         "and target_total_variance")
    if t.keys is not None and (t.keys.dtype.kind != "U" or t.keys.shape != (t.albums,)):
        raise StoreError(f"{path.name}: keys must be one string per fitted album ({t.albums})")
    return t


def _name_rows(sub: pd.DataFrame, rows: np.ndarray, limit: int = 10) -> str:
    """'Title (URI)' of the albums at positions `rows` of the frame, for an error message."""
    def name(i: int) -> str:
        title = repr(str(sub["Title"].iloc[i])) if "Title" in sub.columns else f"row {i}"
        return f"{title} ({sub['URI'].iloc[i]})" if "URI" in sub.columns else title

    return ", ".join(name(int(i)) for i in rows[:limit]) + (f" and {len(rows) - limit} more" if len(rows) > limit else "")


def descriptors(sub: pd.DataFrame) -> np.ndarray:
    """The 120 descriptor columns the recommender scales, float64. Every value has to be a finite
    number: an empty one would silently become NaN distances (and a wrong imputed block)."""
    D = sub[descriptor_cols(sub)].to_numpy(dtype=np.float64)
    bad = np.flatnonzero(~np.isfinite(D).all(axis=1))
    if len(bad):
        raise ValueError(f"the feature table has empty or non-finite descriptor values for {len(bad)} album(s): "
                         f"{_name_rows(sub, bad)}. Every album needs a number in each of the {D.shape[1]} "
                         "descriptor columns (0 when the descriptor does not apply)")
    return D


def impute(block: np.ndarray, desc: np.ndarray, has_audio: np.ndarray, k: int = IMPUTE_K,
           rescale: bool = IMPUTE_RESCALE) -> np.ndarray:
    """`block` with the rows of the albums without audio filled in: the mean block of the album's k
    nearest albums by euclidean descriptor distance among those with audio (ties to the earlier
    album), scaled, if `rescale`, to those neighbours' mean norm (a mean of k vectors is shorter
    than they are, and a short block is close to everything)."""
    out = np.array(block, dtype=np.float32)
    known, D = out[has_audio].astype(np.float64), desc[has_audio]
    for i in np.flatnonzero(~has_audio):
        near = np.argsort(((D - desc[i]) ** 2).sum(axis=1), kind="stable")[:k]
        v = known[near].mean(axis=0)
        norm = np.linalg.norm(v)
        if rescale and norm > 0:
            v *= np.linalg.norm(known[near], axis=1).mean() / norm
        out[i] = v
    return out


def audio_block(sub: pd.DataFrame, audio_dir: Path = DEFAULT_AUDIO) -> AudioBlock:
    """The audio block for the albums of `sub` (keyed by its URI column), imputed where the store
    has no embedding. Raises StoreError when the store or the transform is missing or malformed."""
    store = load_store(audio_dir)
    t = load_transform(audio_dir / "transform.npz")
    if t.model != store.manifest["model"]:
        raise StoreError(f"transform.npz was fitted on {t.model!r} embeddings, the store holds "
                         f"{store.manifest['model']!r}")
    rows = store.rows(sub["URI"])
    has_audio = rows >= 0
    if not has_audio.any():
        raise StoreError(f"no album of the feature table has an embedding in {audio_dir}")
    block = np.zeros((len(sub), len(t.components)), dtype=np.float32)
    block[has_audio] = t.apply(store.emb[rows[has_audio]])
    return AudioBlock(impute(block, descriptors(sub), has_audio), has_audio, len(store.manifest["shards"]), t)


def site_matrix(sub: pd.DataFrame, block: np.ndarray, slider: float) -> np.ndarray:
    """The site's matrix at one stop: [audio block | descriptors / slider**3], float32. Raises
    ValueError naming the albums when a descriptor or a block value is not a finite number."""
    block = np.asarray(block)
    if block.ndim != 2 or len(block) != len(sub):
        raise ValueError(f"the audio block has shape {block.shape} for {len(sub)} albums")
    bad = np.flatnonzero(~np.isfinite(block).all(axis=1))
    if len(bad):
        raise ValueError(f"the audio block has non-finite values for {len(bad)} album(s): {_name_rows(sub, bad)}")
    return np.hstack([block, descriptors(sub) / float(slider) ** 3]).astype(np.float32)


def refit(sub: pd.DataFrame, audio_dir: Path = DEFAULT_AUDIO) -> Transform:
    """A transform fitted on every album of `sub` that has an embedding, in catalog order, scaled
    to the target total variance of the transform it replaces."""
    store = load_store(audio_dir)
    old = load_transform(audio_dir / "transform.npz")
    rows = store.rows(sub["URI"])
    return fit_transform(store.emb[rows[rows >= 0]], old.target_total_variance, store.manifest["model"],
                         k=len(old.components), keys=sub["URI"].to_numpy()[rows >= 0])


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_pipeline.audio", description="The audio block of the site matrix.")
    p.add_argument("cmd", choices=("status", "fit"))
    p.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO, help="The audio store (default data-pipeline/audio).")
    p.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="Feature table pickle (read-only).")
    args = p.parse_args(argv)
    sub, _ = dedupe_table(load_table(args.table))
    try:
        if args.cmd == "fit":
            t = refit(sub, args.audio_dir)
            save_transform(args.audio_dir / "transform.npz", t)
            print(f"fitted on {t.albums} albums, {len(t.components)} components, scale {t.scale:.4f} "
                  f"-> {args.audio_dir / 'transform.npz'}; rebuild the site data")
            return 0
        audio = audio_block(sub, args.audio_dir)
    except StoreError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    print(audio.summary())
    for i in np.flatnonzero(~audio.has_audio):
        print(f"imputed\t{sub.loc[i, 'URI']}\t{sub.loc[i, 'Title']}\t{clean_artist(str(sub.loc[i, 'Artist']))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
