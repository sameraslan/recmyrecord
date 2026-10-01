"""Album / track feature matrices from the per-track embedding shards in cache/tracks/.

    X, rows = album_features("maest:7+clap", pooling="mean+std")     # one line per table row with audio
    Xt, mask, rows = track_features("mert_v2:16")                     # padded [n, max_tracks, d] + mask
    rows = available_rows()

Spec grammar (terms joined with "+", concatenated in the order written)
    effnet | heads | clap                 single vector per track (1280 / 738 / 512)
    maest:<L>   L = 0..12                 0 = patch embedding, 1..12 = transformer blocks       (768)
    mert:<L>    L = 0..12                 0 = CNN features, 1..12 = transformer layers          (768)
    mert_v2:<L> L = 1..24                 block number; block L is array index L-1 in the shard (1024)
    <enc>:<a>-<b>                         average of layers a..b (inclusive) per track, then pooled
    <enc>:avg                             average of all transformer layers (maest/mert 1-12, mert_v2 1-24)
Pooling over an album's tracks: "+"-joined subset of mean, std, max ("mean", "mean+std", "mean+std+max").
std is the population std, so it is 0 for single-track albums. A track counts for a term only if all its
values are finite (MERT-v2 rows can be NaN); an album with no valid track for any term of the spec is
dropped for that spec and reported (features.LAST_REPORT, and printed when verbose).

Rows. The shards are keyed by album_key = source + ":" + source_album_id; every table row that
cache/matches.parquet maps to that key gets the album's features (same mapping as
extract_embeddings.finalize), so duplicate rows of one source album all appear. TEST rows are never
returned unless include_test=True, which raises unless the environment variable DESCRIPTOR_FINAL_TEST=1
is set (use harness.final_test, which is the only sanctioned way).

Shard snapshot. Extraction may still be running. The shard list is read ONCE per Python process (first
use) and then frozen, so every spec you load in one process covers the same albums; call refresh() to
pick up new shards. DESCRIPTOR_SHARD_LIMIT=<n> restricts a process to the first n shards (by name =
chronological), to reproduce an earlier partial-data run exactly. Shards are written atomically by the
extractor (".part" then rename), and a shard that still fails to load is skipped with a warning.

Cache. Pooled album matrices are cached per (term, statistic) in cache/pooled/ as float16, together with
the shards they were built from. New shards are read incrementally (only the new ones), so a layer sweep
reads each shard once per layer, not once per call; precompute(specs, pooling) fills several terms in ONE
pass over the shards. Values always go through float16 (the shards are float16 anyway), so a cached and a
freshly computed matrix are bit-identical. All maths is done in float32.
"""
from __future__ import annotations

import json
import os
import re
import warnings
from collections import OrderedDict
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from common import HERE, load_splits

CACHE = HERE / "cache"
TRACKS_DIR = CACHE / "tracks"
POOLED_DIR = CACHE / "pooled"
MATCHES = CACHE / "matches.parquet"
HEAD_COLUMNS = CACHE / "head_columns.json"
TEST_ENV = "DESCRIPTOR_FINAL_TEST"
SHARD_LIMIT_ENV = "DESCRIPTOR_SHARD_LIMIT"
CACHE_VERSION = 1

# encoder -> (number of stored layers or None, dimension, layer number of array index 0)
ENCODERS: dict[str, tuple[int | None, int, int | None]] = {
    "effnet": (None, 1280, None), "heads": (None, 738, None), "clap": (None, 512, None),
    "maest": (13, 768, 0), "mert": (13, 768, 0), "mert_v2": (24, 1024, 1),
}
STATS = ("mean", "std", "max")
DEFAULT_SPECS = ["effnet", "heads", "clap", "maest:7", "mert:8", "mert_v2:16"]

LAST_REPORT: dict = {}


# ---------------------------------------------------------------- test guard

def test_allowed() -> bool:
    return os.environ.get(TEST_ENV) == "1"


def require_test_env(what: str) -> None:
    if not test_allowed():
        raise PermissionError(f"{what} touches TEST rows; this is only allowed through harness.final_test "
                              f"with the environment variable {TEST_ENV}=1")


# ---------------------------------------------------------------- spec parsing

@dataclass(frozen=True)
class Term:
    encoder: str
    layers: tuple[int, ...] | None  # array indexes into the shard's layer axis; None = no layer axis
    label: str                      # canonical name, e.g. "mert_v2:12-20"

    @property
    def dim(self) -> int:
        return ENCODERS[self.encoder][1]

    @property
    def fs(self) -> str:
        return self.label.replace(":", "@")


def parse_spec(spec: str) -> list[Term]:
    terms: list[Term] = []
    for part in str(spec).split("+"):
        part = part.strip()
        enc, _, lay = part.partition(":")
        if enc not in ENCODERS:
            raise ValueError(f"unknown encoder {enc!r} in spec {spec!r}; known: {sorted(ENCODERS)}")
        n_layers, _, first = ENCODERS[enc]
        if n_layers is None:
            if lay:
                raise ValueError(f"{enc} has no layers (spec {spec!r})")
            terms.append(Term(enc, None, enc))
            continue
        lo, hi = first, first + n_layers - 1
        if lay == "avg":
            a, b = max(lo, 1), hi
        elif (m := re.fullmatch(r"(\d+)-(\d+)", lay)):
            a, b = int(m.group(1)), int(m.group(2))
        elif lay.isdigit():
            a = b = int(lay)
        else:
            raise ValueError(f"{enc} needs a layer: '{enc}:<L>', '{enc}:<a>-<b>' or '{enc}:avg' (spec {spec!r})")
        if not lo <= a <= b <= hi:
            raise ValueError(f"{enc} layers are {lo}..{hi}; got {lay!r}")
        terms.append(Term(enc, tuple(range(a - first, b - first + 1)), f"{enc}:{a}" if a == b else f"{enc}:{a}-{b}"))
    labels = [t.label for t in terms]
    if len(set(labels)) != len(labels):
        raise ValueError(f"repeated term in spec {spec!r}")
    return terms


def canonical_spec(spec: str) -> str:
    return "+".join(t.label for t in parse_spec(spec))


def parse_pooling(pooling: str) -> list[str]:
    stats = [s.strip() for s in str(pooling).split("+")]
    if not stats or any(s not in STATS for s in stats) or len(set(stats)) != len(stats):
        raise ValueError(f"pooling must be a '+'-joined subset of {STATS}, got {pooling!r}")
    return stats


def feature_blocks(spec: str, pooling: str = "mean") -> list[tuple[str, str, int, int]]:
    """Column layout of album_features(spec, pooling): (term, statistic, start, stop) per block."""
    out, a = [], 0
    for t in parse_spec(spec):
        for s in parse_pooling(pooling):
            out.append((t.label, s, a, a + t.dim))
            a += t.dim
    return out


def head_names() -> list[str]:
    return json.loads(HEAD_COLUMNS.read_text())


# ---------------------------------------------------------------- shards

_SNAPSHOT: list[Path] | None = None
_SHARD_KEYS: dict[str, np.ndarray] = {}


def _shard_keys(p: Path) -> np.ndarray | None:
    """Unique album keys of one shard in first-appearance order; None if the shard cannot be read."""
    if p.name not in _SHARD_KEYS:
        try:
            with np.load(p) as z:
                ak = z["album_key"].astype(str)
        except Exception as e:  # truncated / vanished / not an npz
            warnings.warn(f"skipping unreadable shard {p.name}: {type(e).__name__}: {e}")
            return None
        _SHARD_KEYS[p.name] = np.array(list(dict.fromkeys(ak.tolist())))
    return _SHARD_KEYS[p.name]


def list_shards(refresh: bool = False) -> list[Path]:
    """The frozen shard snapshot of this process (sorted by name = chronological). See module docstring."""
    global _SNAPSHOT
    if _SNAPSHOT is None or refresh:
        ps = sorted(TRACKS_DIR.glob("tracks_*.npz"))
        lim = os.environ.get(SHARD_LIMIT_ENV)
        if lim:
            ps = ps[: int(lim)]
        _SNAPSHOT = [p for p in ps if _shard_keys(p) is not None]
        album_index.cache_clear()
    return list(_SNAPSHOT)


def refresh() -> int:
    """Re-read the shard directory (new shards appear while extraction runs). Returns the shard count."""
    _TRACK_MEMO.clear()
    return len(list_shards(refresh=True))


def n_shards() -> int:
    return len(list_shards())


@lru_cache(maxsize=1)
def album_index() -> dict[str, str]:
    """album_key -> name of the shard that holds it (first shard wins if a key is in two shards)."""
    out: dict[str, str] = {}
    dup = 0
    for p in list_shards():
        for k in _shard_keys(p):
            if k in out:
                dup += 1
            else:
                out[str(k)] = p.name
    if dup:
        warnings.warn(f"{dup} album keys occur in more than one shard; the first shard is used")
    return out


@lru_cache(maxsize=1)
def row_table() -> pd.DataFrame:
    """Table rows that have a preview source: columns row, album_key (cache/matches.parquet)."""
    m = pd.read_parquet(MATCHES, columns=["row", "source", "source_album_id"])
    m = m[m.source != "none"]
    out = pd.DataFrame({"row": m.row.to_numpy(dtype=int),
                        "album_key": (m.source.astype(str) + ":" + m.source_album_id.astype(str)).to_numpy()})
    return out.sort_values("row").reset_index(drop=True)


def n_matched_albums() -> int:
    """Albums the extractor will have embedded when it is done (if none fail)."""
    return int(row_table().album_key.nunique())


def available_rows() -> np.ndarray:
    """Sorted table rows whose source album currently has track embeddings (row ids only, all splits)."""
    rt = row_table()
    return rt.row.to_numpy()[rt.album_key.isin(album_index()).to_numpy()]


def _rows_for(keys: set[str], include_test: bool) -> tuple[np.ndarray, np.ndarray]:
    """(rows, album keys) of the table rows that map to `keys`, sorted by row, test rows removed by default."""
    rt = row_table()
    sel = rt[rt.album_key.isin(keys)]
    rows, ak = sel.row.to_numpy(), sel.album_key.to_numpy().astype(str)
    if not include_test:
        keep = load_splits()[rows] != "test"
        rows, ak = rows[keep], ak[keep]
    return rows, ak


def _load_shard(p: Path, terms: list[Term]) -> tuple[np.ndarray, np.ndarray, dict[str, np.ndarray]]:
    """album_key per track, track_pos per track, {term label: float32 (n_tracks, dim)} (NaN = not available)."""
    out: dict[str, np.ndarray] = {}
    with np.load(p) as z:
        ak = z["album_key"].astype(str)
        pos = z["track_pos"].astype(int)
        for enc in dict.fromkeys(t.encoder for t in terms):
            arr = z[enc] if enc in z.files else None  # a disabled encoder has no array in that shard
            for t in terms:
                if t.encoder != enc:
                    continue
                if arr is None:
                    out[t.label] = np.full((len(ak), t.dim), np.nan, dtype=np.float32)
                elif t.layers is None:
                    out[t.label] = arr.astype(np.float32)
                else:
                    out[t.label] = arr[:, list(t.layers)].astype(np.float32).mean(1)
                assert out[t.label].shape == (len(ak), t.dim), (p.name, t.label, out[t.label].shape)
    return ak, pos, out


# ---------------------------------------------------------------- pooled cache

@dataclass
class _Entry:
    dim: int
    shards: list[str] = field(default_factory=list)
    sizes: list[int] = field(default_factory=list)
    keys: list[str] = field(default_factory=list)
    shard_of: list[int] = field(default_factory=list)   # index into `shards`
    X: list[np.ndarray] = field(default_factory=list)   # float16 vectors (NaN if the album has no valid track)
    n_valid: list[int] = field(default_factory=list)


_MEMO: dict[tuple[str, str], _Entry] = {}


def _cache_path(term: Term, stat: str) -> Path:
    return POOLED_DIR / f"{term.fs}__{stat}.npz"


def _load_entry(term: Term, stat: str) -> _Entry | None:
    p = _cache_path(term, stat)
    if not p.exists():
        return None
    try:
        with np.load(p) as z:
            if int(z["version"]) != CACHE_VERSION or z["X"].shape[1] != term.dim:
                return None
            return _Entry(term.dim, z["shards"].astype(str).tolist(), z["sizes"].tolist(), z["keys"].astype(str).tolist(),
                          z["shard_of"].tolist(), list(z["X"]), z["n_valid"].tolist())
    except Exception as e:
        warnings.warn(f"ignoring unreadable feature cache {p.name}: {type(e).__name__}: {e}")
        return None


def _save_entry(term: Term, stat: str, e: _Entry) -> None:
    POOLED_DIR.mkdir(parents=True, exist_ok=True)
    p = _cache_path(term, stat)
    tmp = p.with_name(f"{p.name}.{os.getpid()}.part")
    X = np.stack(e.X).astype(np.float16) if e.X else np.zeros((0, e.dim), np.float16)
    with open(tmp, "wb") as f:
        np.savez(f, version=np.int64(CACHE_VERSION), shards=np.array(e.shards, dtype=str), sizes=np.array(e.sizes, dtype=np.int64),
                 keys=np.array(e.keys, dtype=str), shard_of=np.array(e.shard_of, dtype=np.int32), X=X,
                 n_valid=np.array(e.n_valid, dtype=np.int16))
    os.replace(tmp, p)


def _pool(M: np.ndarray, stat: str) -> np.ndarray:
    if stat == "mean":
        return M.mean(0)
    if stat == "std":
        return M.std(0)
    return M.max(0)


def _pooled(terms: list[Term], stats: list[str]) -> dict[tuple[str, str], tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """{(term label, stat): (album keys, float32 X, n_valid)} for the albums of the current snapshot,
    reading only the shards a cache entry has not seen yet (one pass for all requested terms)."""
    shards = list_shards()
    path = {p.name: p for p in shards}
    size = {p.name: p.stat().st_size for p in shards}
    owner = album_index()
    entries: dict[tuple[str, str], _Entry] = {}
    todo: dict[tuple[str, str], set[str]] = {}
    for t in terms:
        for s in stats:
            e = _MEMO.get((t.label, s)) or _load_entry(t, s)
            if e is not None and any(n in size and size[n] != sz for n, sz in zip(e.shards, e.sizes)):
                e = None  # a shard was rewritten: rebuild
            if e is None:
                e = _Entry(t.dim)
            entries[(t.label, s)] = e
            todo[(t.label, s)] = set(path) - set(e.shards)
    changed: set[tuple[str, str]] = set()
    for name in sorted(set().union(*todo.values())) if todo else []:
        wanted = [t for t in terms if any(name in todo[(t.label, s)] for s in stats)]
        try:
            ak, _, mats = _load_shard(path[name], wanted)
        except Exception as ex:
            warnings.warn(f"shard {name} could not be read ({type(ex).__name__}: {ex}); its albums are missing for now")
            continue
        uniq, inv = np.unique(ak, return_inverse=True)
        for t in wanted:
            M = mats[t.label]
            valid = np.isfinite(M).all(1)
            for s in stats:
                if name not in todo[(t.label, s)]:
                    continue
                e = entries[(t.label, s)]
                e.shards.append(name)
                e.sizes.append(size[name])
                si = len(e.shards) - 1
                for a, key in enumerate(uniq):
                    if owner.get(str(key)) != name:
                        continue  # duplicate of an album held by an earlier shard
                    sel = (inv == a) & valid
                    e.keys.append(str(key))
                    e.shard_of.append(si)
                    e.n_valid.append(int(sel.sum()))
                    e.X.append(_pool(M[sel], s).astype(np.float16) if sel.any() else np.full(t.dim, np.nan, np.float16))
                changed.add((t.label, s))
    out = {}
    for (label, s), e in entries.items():
        if (label, s) in changed:
            _save_entry(next(t for t in terms if t.label == label), s, e)
        _MEMO[(label, s)] = e
        names = np.array(e.shards, dtype=object)
        keep = np.array([names[i] in path for i in e.shard_of], dtype=bool) if e.keys else np.zeros(0, bool)
        keys = np.array(e.keys, dtype=str)[keep] if e.keys else np.array([], dtype=str)
        X = np.stack(e.X)[keep].astype(np.float32) if e.keys else np.zeros((0, e.dim), np.float32)
        out[(label, s)] = (keys, X, np.array(e.n_valid, dtype=int)[keep] if e.keys else np.zeros(0, int))
    return out


def precompute(specs: list[str], pooling: str = "mean") -> None:
    """Fill the pooled cache for many specs in ONE pass over the shards (e.g. all layers of an encoder)."""
    terms = {t.label: t for sp in specs for t in parse_spec(sp)}
    _pooled(list(terms.values()), parse_pooling(pooling))


# ---------------------------------------------------------------- public: album-level features

def album_features(spec: str, pooling: str = "mean", *, include_test: bool = False,
                   verbose: bool = True) -> tuple[np.ndarray, np.ndarray]:
    """(X float32 [n_rows, d], rows int [n_rows]) — one line per table row that currently has embeddings
    for every term of `spec`, sorted by row. Columns: per term (in spec order), per statistic (in pooling
    order); see feature_blocks(). Test rows are excluded unless include_test=True (guarded)."""
    global LAST_REPORT
    if include_test:
        require_test_env("album_features(include_test=True)")
    terms, stats = parse_spec(spec), parse_pooling(pooling)
    views = _pooled(terms, stats)
    in_shards = set(album_index())
    ok = set(in_shards)
    dropped: dict[str, int] = {}
    for t in terms:
        keys, _, nv = views[(t.label, stats[0])]
        good = set(keys[nv > 0].tolist())
        dropped[t.label] = len(in_shards - good)
        ok &= good
    rows, ak = _rows_for(ok, include_test)
    blocks = []
    for t in terms:
        for s in stats:
            keys, X, _ = views[(t.label, s)]
            where = {k: i for i, k in enumerate(keys.tolist())}
            blocks.append(X[[where[k] for k in ak]] if len(ak) else np.zeros((0, t.dim), np.float32))
    X = np.concatenate(blocks, axis=1).astype(np.float32)
    assert np.isfinite(X).all(), "non-finite pooled features"
    LAST_REPORT = {"spec": canonical_spec(spec), "pooling": "+".join(stats), "n_shards": n_shards(),
                   "albums_in_shards": len(in_shards), "albums_with_all_terms": len(ok),
                   "albums_dropped_no_valid_track": dropped, "n_rows": int(len(rows)), "dim": int(X.shape[1]),
                   "include_test": include_test}
    if verbose:
        d = {k: v for k, v in dropped.items() if v}
        print(f"[features] {LAST_REPORT['spec']} / {LAST_REPORT['pooling']}: {len(rows)} rows x {X.shape[1]} dims from "
              f"{len(ok)} of {len(in_shards)} albums in {n_shards()} shards"
              + (f"; dropped (no valid track) {d}" if d else "") + ("" if include_test else "; test rows excluded"))
    return X, rows


# ---------------------------------------------------------------- public: track-level features

_TRACK_MEMO: "OrderedDict[tuple, tuple]" = OrderedDict()
_TRACK_MEMO_SIZE = 2


def track_features(spec: str, *, include_test: bool = False,
                   verbose: bool = True) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(X float32 [n_rows, max_tracks, d], mask bool [n_rows, max_tracks], rows) for attention / multiple-
    instance pooling. Tracks are in tracklist order, padded with zeros at the end (mask False). A track is
    kept only if it is finite for EVERY term of the spec; an album with no such track is dropped. Not
    cached on disk (float16 track tensors are ~60 MB per 1024-d term at full size): the shards are re-read
    once per process and spec, and the last two results are kept in memory."""
    global LAST_REPORT
    if include_test:
        require_test_env("track_features(include_test=True)")
    terms = parse_spec(spec)
    shards = list_shards()
    memo_key = (canonical_spec(spec), tuple(p.name for p in shards), include_test)
    if memo_key in _TRACK_MEMO:
        _TRACK_MEMO.move_to_end(memo_key)
        X, mask, rows = _TRACK_MEMO[memo_key]
        return X.copy(), mask.copy(), rows.copy()
    owner = album_index()
    per_album: dict[str, np.ndarray] = {}
    n_tracks_total = n_tracks_bad = 0
    for p in shards:
        try:
            ak, pos, mats = _load_shard(p, terms)
        except Exception as ex:
            warnings.warn(f"shard {p.name} could not be read ({type(ex).__name__}: {ex}); skipped")
            continue
        M = np.concatenate([mats[t.label] for t in terms], axis=1)
        valid = np.isfinite(M).all(1)
        n_tracks_total += len(ak)
        n_tracks_bad += int((~valid).sum())
        for key in dict.fromkeys(ak.tolist()):
            if owner.get(key) != p.name:
                continue
            idx = np.flatnonzero((ak == key) & valid)
            if len(idx):
                per_album[key] = M[idx[np.argsort(pos[idx], kind="stable")]]
    rows, ak = _rows_for(set(per_album), include_test)
    d = sum(t.dim for t in terms)
    T = max((len(per_album[k]) for k in ak), default=0)
    X = np.zeros((len(rows), T, d), dtype=np.float32)
    mask = np.zeros((len(rows), T), dtype=bool)
    for i, k in enumerate(ak):
        m = per_album[k]
        X[i, : len(m)] = m
        mask[i, : len(m)] = True
    in_shards = len(owner)
    LAST_REPORT = {"spec": canonical_spec(spec), "pooling": "tracks", "n_shards": len(shards), "albums_in_shards": in_shards,
                   "albums_with_all_terms": len(per_album), "albums_dropped_no_valid_track": in_shards - len(per_album),
                   "tracks": n_tracks_total, "tracks_dropped_non_finite": n_tracks_bad, "n_rows": int(len(rows)),
                   "max_tracks": int(T), "dim": d, "include_test": include_test}
    if verbose:
        print(f"[features] tracks {LAST_REPORT['spec']}: {len(rows)} rows x {T} tracks x {d} dims from {len(per_album)} of "
              f"{in_shards} albums in {len(shards)} shards; {n_tracks_bad} of {n_tracks_total} tracks non-finite (dropped)"
              + ("" if include_test else "; test rows excluded"))
    _TRACK_MEMO[memo_key] = (X, mask, rows)
    while len(_TRACK_MEMO) > _TRACK_MEMO_SIZE:
        _TRACK_MEMO.popitem(last=False)
    return X.copy(), mask.copy(), rows.copy()


# ---------------------------------------------------------------- standardisation (fit on TRAIN rows only)

class Standardizer:
    """z-scoring with statistics from the rows passed to fit() — pass TRAIN rows only.
    Columns with (near-)zero train variance are centred and left unscaled."""

    def __init__(self, eps: float = 1e-6):
        self.eps = eps
        self.mean_: np.ndarray | None = None
        self.scale_: np.ndarray | None = None

    def fit(self, X_train: np.ndarray) -> "Standardizer":
        X = np.asarray(X_train, dtype=np.float32)
        assert X.ndim == 2 and len(X) > 0
        self.mean_ = X.mean(0, dtype=np.float64).astype(np.float32)
        sd = X.std(0, dtype=np.float64).astype(np.float32)
        self.scale_ = np.where(sd > self.eps, sd, 1.0).astype(np.float32)
        return self

    def fit_tracks(self, X_tracks: np.ndarray, mask: np.ndarray) -> "Standardizer":
        """Fit on the valid tracks of a padded [n, T, d] TRAIN tensor."""
        return self.fit(np.asarray(X_tracks)[np.asarray(mask, dtype=bool)])

    def transform(self, X: np.ndarray) -> np.ndarray:
        """Works on [n, d] and on padded [n, T, d] (padding becomes -mean/scale: keep using the mask)."""
        assert self.mean_ is not None, "call fit() on train rows first"
        return ((np.asarray(X, dtype=np.float32) - self.mean_) / self.scale_).astype(np.float32)


def standardize(X_train: np.ndarray, *others: np.ndarray) -> tuple:
    """(X_train_z, *others_z, scaler): scaler fitted on X_train only."""
    sc = Standardizer().fit(X_train)
    return (sc.transform(X_train), *[sc.transform(o) for o in others], sc)


def l2_normalize(X: np.ndarray) -> np.ndarray:
    X = np.asarray(X, dtype=np.float32)
    return X / np.maximum(np.linalg.norm(X, axis=-1, keepdims=True), 1e-12)


if __name__ == "__main__":
    print(f"{n_shards()} shards, {len(album_index())} of {n_matched_albums()} matched albums, {len(available_rows())} table rows")
    for sp in DEFAULT_SPECS:
        album_features(sp, "mean")
