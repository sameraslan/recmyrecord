"""The audio block: 64 numbers per album from the committed store and the frozen transform.

CLI: python -m rmr_pipeline.audio status [--audio-dir DIR] [--table PATH]   the feature table's albums in the store,
                                         and those without audio as a --no-catalog build would impute them
     python -m rmr_pipeline.audio fit    --audio-dir DIR [--table PATH]     refit DIR/transform.npz on the feature
                                         table's albums (the old store, audio/; see README)
     python -m rmr_pipeline.audio fit-catalog --audio-dir DIR [--catalog CSV] [--target-from DIR]
                                         fit DIR/transform.npz on every catalog album the store has (the site's
                                         store, audio/effnet10k, and the CLAP store)

`status` reads the store the site reads (audio_store.SITE_MODEL) unless --audio-dir names another. `fit` and
`fit-catalog` write a transform and have no default: the site's store is fitted on the whole catalog, and a
`fit` on it would replace that transform with one fitted on the feature table's albums alone.

  block = ((e / |e|) - mean) @ components.T * scale      e: the album's mean clip embedding (store)

`scale` was chosen at fit time so that the block's total variance (sum of column variances) on the
fitted albums equals `target_total_variance`, the Spotify block's on the albums of the first fit:
the slider stops keep their meaning and nothing here reads the Spotify columns.
An album with no embedding gets the mean block of its IMPUTE_K nearest albums by descriptor
distance among the albums that have one, rescaled to those neighbours' mean norm.
The store knows an album by its key (a RYM id); the feature table knows it by its Spotify URI, and
audio/keys.csv says which key that is (rmr_pipeline.keys).
The catalog build does not impute (audio_block(fill="mean")): an album with no embedding is limited to
the mood side, and its block is the mean block of the albums that have one (mean_fill).
Nothing here depends on the embedding model: the width comes from the store's manifest, and the transform
must have been fitted on that store's model.
"""
import argparse
import csv
import os
import sys
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .artists import clean_artist
from .audio_store import DEFAULT_AUDIO, StoreError, keys_csv, load_store, site_store
from .constants import DEFAULT_TABLE, PIPELINE_DIR
from .keys import load_keys
from .table import dedupe_table, descriptor_cols, load_table

BLOCK_DIMS = 64
# Chosen by experiments/preview_features/imputation.py (hide the audio of albums that have it); see README.
IMPUTE_K = 3
IMPUTE_RESCALE = True
FILLS = ("impute", "mean")  # what audio_block gives an album with no embedding
TRANSFORM_ARRAYS = ("mean", "components", "scale", "target_total_variance", "fitted", "albums", "model")
DEFAULT_CATALOG = PIPELINE_DIR / "catalog" / "albums.csv"


@dataclass(frozen=True)
class Transform:
    """The fitted map from an album's mean clip embedding to its audio block."""
    mean: np.ndarray  # (dim,) float32: mean of the fitted albums' unit vectors
    components: np.ndarray  # (k, dim) float32, orthonormal rows
    scale: float
    target_total_variance: float
    fitted: str  # ISO date of the fit
    albums: int  # albums fitted on
    model: str  # embedding model id, as in the store's manifest
    keys: np.ndarray | None = None  # the fitted albums' keys in fit order; None in a file written before fits recorded them

    def apply(self, emb: np.ndarray) -> np.ndarray:
        """(n, dim) album-mean embeddings -> (n, k) float32 block; works for albums never fitted on."""
        centred = unit(emb) - self.mean.astype(np.float64)
        return (centred @ self.components.T.astype(np.float64) * self.scale).astype(np.float32)


@dataclass(frozen=True)
class AudioBlock:
    block: np.ndarray  # (albums, k) float32, aligned with the album frame
    has_audio: np.ndarray  # (albums,) bool; False = imputed (or, with fill "mean", the mean block)
    shards: int
    transform: Transform
    fill: str = "impute"  # what the albums without audio got: FILLS

    def summary(self) -> str:
        n = int(self.has_audio.sum())
        without = "imputed" if self.fill == "impute" else "without (mood side only)"
        return (f"audio: {n} albums with audio, {len(self.has_audio) - n} {without}, {self.shards} store shard(s), "
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
    tmp = path.with_name("." + path.name + ".tmp")  # complete or not at all, like the store's own files
    with open(tmp, "wb") as f:
        np.savez(f, **arrays)
    os.replace(tmp, path)


def load_transform(path: Path, dim: int | None = None) -> Transform:
    """The transform file, checked. `dim`: the width its store's embeddings have (audio_block passes it);
    without it only the file's own consistency is checked."""
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
    width = dim if dim is not None else t.mean.shape[0] if t.mean.ndim == 1 and len(t.mean) else "dim"
    if (t.mean.shape != (width,) or t.components.ndim != 2 or t.components.shape[1] != width
            or not np.isfinite(t.mean).all() or not np.isfinite(t.components).all()
            or not (np.isfinite(t.scale) and t.scale > 0 and t.target_total_variance > 0)):
        raise StoreError(f"{path.name}: needs mean ({width},), components (k, {width}), finite, and a positive scale "
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


def mean_fill(block: np.ndarray, has_audio: np.ndarray) -> np.ndarray:
    """`block` with the rows of the albums without audio set to the mean block of the albums with audio.

    The catalog build's fill. An album with no audio has no sonic or balanced list and is in nobody's
    (recs.build_recs), and its place on those two maps is derived from its mood-side neighbours
    (layout.build_layouts), so its block is read at the mood stop only. There the descriptors are divided by
    0.125 and the block carries almost no weight; the mean is the neutral value: it adds to the album's
    distance to another album only that album's own distance from the middle of the audio space, and
    claims no sound for the album, which a block imputed from its descriptors would."""
    out = np.array(block, dtype=np.float32)
    has_audio = np.asarray(has_audio, dtype=bool)
    if not has_audio.all():
        out[~has_audio] = out[has_audio].astype(np.float64).mean(axis=0)
    return out


def album_keys(sub: pd.DataFrame, audio_dir: Path = DEFAULT_AUDIO) -> list[str]:
    """The store key of each album of `sub`: the key audio/keys.csv gives its URI (a store kept inside
    another, audio/clap/, uses the outer one's: audio_store.keys_csv). Raises StoreError when keys.csv is
    missing or does not have one of the albums."""
    return load_keys(keys_csv(audio_dir)).keys_of(sub["URI"])


def audio_block(sub: pd.DataFrame, audio_dir: Path = DEFAULT_AUDIO, keys: list[str] | None = None,
                fill: str = "impute") -> AudioBlock:
    """The audio block for the albums of `sub`. Where the store has no embedding the block is imputed
    (`fill` "impute", the site build's) or the mean block of the albums with audio ("mean", the catalog
    build's: see mean_fill). The albums are found in the store by `keys` (one per row of `sub`: the catalog
    build's, which has no URI for a new album) or, without them, by the keys audio/keys.csv gives their URIs
    (album_keys). Raises StoreError when the store, the keys or the transform are missing or malformed."""
    if fill not in FILLS:
        raise ValueError(f"fill must be one of {', '.join(FILLS)}, got {fill!r}")
    store = load_store(audio_dir)
    t = load_transform(audio_dir / "transform.npz", store.dim)
    if t.model != store.manifest["model"]:
        raise StoreError(f"transform.npz was fitted on {t.model!r} embeddings, the store holds "
                         f"{store.manifest['model']!r}")
    if keys is None:
        keys = album_keys(sub, audio_dir)
    elif len(keys) != len(sub):
        raise ValueError(f"{len(keys)} keys for {len(sub)} albums")
    rows = store.rows(keys)
    has_audio = rows >= 0
    if not has_audio.any():
        raise StoreError(f"no album of the feature table has an embedding in {audio_dir}")
    block = np.zeros((len(sub), len(t.components)), dtype=np.float32)
    block[has_audio] = t.apply(store.emb[rows[has_audio]])
    if fill == "mean":
        return AudioBlock(mean_fill(block, has_audio), has_audio, len(store.manifest["shards"]), t, fill)
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
    old = load_transform(audio_dir / "transform.npz", store.dim)
    keys = np.asarray(album_keys(sub, audio_dir), dtype=np.str_)
    rows = store.rows(keys)
    return fit_transform(store.emb[rows[rows >= 0]], old.target_total_variance, store.manifest["model"],
                         k=len(old.components), keys=keys[rows >= 0])


def catalog_keys(path: Path = DEFAULT_CATALOG) -> list[str]:
    """The key (`rym_id`) of every row of the catalog table, in its order."""
    try:
        with open(path, newline="", encoding="utf-8") as f:
            return [r["rym_id"] for r in csv.DictReader(f)]
    except FileNotFoundError:
        raise StoreError(f"missing {path}: the catalog table is not there (python -m rmr_catalog)") from None


def refit_catalog(audio_dir: Path, catalog: Path = DEFAULT_CATALOG, target_from: Path = DEFAULT_AUDIO,
                  k: int = BLOCK_DIMS, fitted: str | None = None) -> Transform:
    """A transform for the store at `audio_dir`, fitted on every album of the catalog table that the
    store has an embedding for, in catalog order: the whole 10k catalog, not only the feature table's
    albums as `refit`. It needs no transform to be there already. The target total variance is read from
    the transform of `target_from` (the EffNet store's: the Spotify block's variance on the albums of the
    first fit). It is kept whatever the model: `scale` brings any block to that total, and the slider
    stops divide the descriptors by constants that were tuned against a block of that size, so a block of
    another size would move the stops, not improve the audio."""
    store = load_store(audio_dir)
    target = load_transform(Path(target_from) / "transform.npz").target_total_variance
    keys = np.asarray(catalog_keys(catalog), dtype=np.str_)
    rows = store.rows(keys)
    if (rows >= 0).sum() <= k:
        raise StoreError(f"{audio_dir} has embeddings for {(rows >= 0).sum()} album(s) of {catalog}: too few to fit "
                         f"{k} components")
    return fit_transform(store.emb[rows[rows >= 0]], target, store.manifest["model"], k=k, fitted=fitted,
                         keys=keys[rows >= 0])


def _same_fit(a: Transform, b: Transform) -> bool:
    """Everything but the date: a refit on the same embeddings is not written again."""
    return (a.model == b.model and a.albums == b.albums and a.scale == b.scale
            and a.target_total_variance == b.target_total_variance and np.array_equal(a.mean, b.mean)
            and np.array_equal(a.components, b.components) and a.keys is not None and b.keys is not None
            and np.array_equal(a.keys, b.keys))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_pipeline.audio", description="The audio block of the site matrix.")
    p.add_argument("cmd", choices=("status", "fit", "fit-catalog"))
    p.add_argument("--audio-dir", type=Path, default=None,
                   help="The audio store (status: default the one the site reads, audio_store.SITE_MODEL; "
                        "fit and fit-catalog need it).")
    p.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="Feature table pickle (read-only).")
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="fit-catalog: the catalog table.")
    p.add_argument("--target-from", type=Path, default=DEFAULT_AUDIO,
                   help="fit-catalog: the store whose transform gives the target total variance (default data-pipeline/audio).")
    args = p.parse_args(argv)
    if args.cmd == "fit-catalog":
        if args.audio_dir is None:
            p.error("fit-catalog needs an explicit --audio-dir (for example audio/effnet10k): it writes that store's transform.npz")
        try:
            t = refit_catalog(args.audio_dir, args.catalog, args.target_from)
            old = args.audio_dir / "transform.npz"
            if old.exists() and _same_fit(load_transform(old), t):
                print(f"{old} is already this fit ({t.albums} albums); nothing written")
                return 0
            save_transform(old, t)
        except StoreError as e:
            print(f"FAIL\n{e}", file=sys.stderr)
            return 1
        print(f"fitted on {t.albums} catalog albums ({t.model}), {len(t.components)} components, scale {t.scale:.4f}, "
              f"target total variance {t.target_total_variance:.4f} -> {old}")
        return 0
    if args.cmd == "fit" and args.audio_dir is None:
        p.error("fit needs an explicit --audio-dir: it writes that store's transform.npz from the feature table's "
                "albums alone (the old store: --audio-dir audio). The site's store is fitted on the whole catalog: "
                "fit-catalog --audio-dir audio/effnet10k")
    args.audio_dir = args.audio_dir or site_store()
    sub, _ = dedupe_table(load_table(args.table))
    try:
        if args.cmd == "fit":
            t = refit(sub, args.audio_dir)
            save_transform(args.audio_dir / "transform.npz", t)
            print(f"fitted on {t.albums} albums, {len(t.components)} components, scale {t.scale:.4f} "
                  f"-> {args.audio_dir / 'transform.npz'}; rebuild the site data")
            return 0
        audio = audio_block(sub, args.audio_dir)
        keys = album_keys(sub, args.audio_dir)
    except StoreError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    print(audio.summary())
    for i in np.flatnonzero(~audio.has_audio):
        print(f"imputed\t{keys[i]}\t{sub.loc[i, 'Title']}\t{clean_artist(str(sub.loc[i, 'Artist']))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
