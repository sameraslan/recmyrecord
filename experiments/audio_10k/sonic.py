"""What measure.py and listening_page.py share: the catalog's albums with audio, their 64-number audio
blocks (CLAP and EffNet, each from its committed store) and their ten nearest albums by the block alone.

Read-only on everything it touches: the catalog table, the two stores, the site's EffNet transform (for the
target variance only) and the one-pass clip cache (opened `mode=ro`). No model is loaded, nothing is
downloaded; numpy and the standard library, plus pandas through genres.py for the genre families. Peak
memory is a few hundred MB at 10,000 albums.

  CLAP block    the committed store (data-pipeline/audio/clap) through its own transform.npz.
  EffNet block  the 10k catalog's EffNet store (data-pipeline/audio/effnet10k, EFFNET_DIR: four clips per
                album, written by rmr_audio.modelstore) through its own transform.npz: what the site would
                use once a build is pointed at it. NOT the site's current block: that is data-pipeline/audio,
                the site's 3,980 albums at up to eight clips.
  The stand-in  what stood for the EffNet block before that store was written (effnet_block): the cache's
                four-clip album means for the albums with CLAP audio, through a PCA(64) fitted here on those
                albums with the same target variance. Used when there is no EffNet store, or when asked for.
"""
import csv
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
RESULTS = HERE / "results"
sys.path.insert(0, str(REPO / "data-pipeline"))
sys.path.append(str(REPO / "experiments" / "preview_features"))  # genres.family: the coarse genre families

from rmr_audio.modelstore import CLIPS, DEFAULT_CACHE_DB, POOL, album_means  # noqa: E402
from rmr_audio.onepass_cache import OnePassCache  # noqa: E402
from rmr_pipeline.artists import clean_artist  # noqa: E402
from rmr_pipeline.audio import BLOCK_DIMS, DEFAULT_CATALOG, fit_transform, load_transform  # noqa: E402
from rmr_pipeline.audio_store import DEFAULT_AUDIO, STORES, load_store  # noqa: E402

EFFNET_DIR = STORES["effnet10k"]
K = 10  # as simbench.K: the recommender's top 10
MIN_DESC = 5  # as simbench.MIN_DESC: descriptors an album needs to count in a descriptor measure
VARIOUS = "Various Artists"
WINDOW_SOURCES = ("local", "youtube", "bandcamp")


@dataclass
class Albums:
    """The catalog's albums that a store has audio for, in catalog order."""
    rows: list[dict]  # the catalog rows
    keys: np.ndarray
    new: np.ndarray  # bool: not on the site yet (no legacy URI)
    n_clips: np.ndarray  # clips behind the store's mean
    source: np.ndarray
    artist: np.ndarray  # int id of the cleaned artist; each Various Artists album its own
    genres: list[list[str]]  # the sheet's primary genres, first one first; [] when the row has none
    descriptors: list[frozenset]  # the sheet's top descriptors
    catalog_size: int

    def __len__(self) -> int:
        return len(self.rows)


def split(text: str) -> list[str]:
    return [x.strip() for x in (text or "").split(",") if x.strip()]


def read_catalog(path: Path = DEFAULT_CATALOG) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_albums(catalog: Path = DEFAULT_CATALOG, clap_dir: Path = STORES["clap"]) -> tuple[Albums, np.ndarray]:
    """(the albums the store at `clap_dir` has, their block (n, 64) float32 through its transform). Any
    store with a transform: the CLAP one, or the EffNet one."""
    table = read_catalog(catalog)
    store = load_store(clap_dir)
    t = load_transform(clap_dir / "transform.npz", store.dim)
    at = store.rows([r["rym_id"] for r in table])
    rows = [r for r, i in zip(table, at) if i >= 0]
    at = at[at >= 0]
    names = [clean_artist(r["artist"]) for r in rows]
    ids: dict[str, int] = {}
    artist = np.array([ids.setdefault(f"{n}#{i}" if n == VARIOUS else n, len(ids)) for i, n in enumerate(names)])
    albums = Albums(rows, store.keys[at], np.array([not r["legacy_uri"] for r in rows]), store.n_clips[at].astype(np.int64),
                    store.source[at], artist, [split(r["primary_genres"]) for r in rows],
                    [frozenset(split(r["top_descriptors"])) for r in rows], len(table))
    return albums, t.apply(store.emb[at])


def default_effnet_dir() -> Path | None:
    """The EffNet store when it is written and fitted, else None: the stand-in."""
    return EFFNET_DIR if (EFFNET_DIR / "manifest.json").exists() and (EFFNET_DIR / "transform.npz").exists() else None


def store_block(albums: Albums, store_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    """(positions in `albums` of the albums the store at `store_dir` also has, their block through that
    store's transform)."""
    store = load_store(store_dir)
    at = store.rows(albums.keys.tolist())
    return np.flatnonzero(at >= 0), load_transform(Path(store_dir) / "transform.npz", store.dim).apply(store.emb[at[at >= 0]])


def effnet_block(albums: Albums, cache_db: Path = DEFAULT_CACHE_DB, matches: Path = DEFAULT_AUDIO / "matches.csv",
                 target_from: Path = DEFAULT_AUDIO,
                 overrides: Path = DEFAULT_AUDIO / "match_overrides.json") -> tuple[np.ndarray, np.ndarray]:
    """The stand-in: (positions in `albums` of the albums that also have EffNet clips, their EffNet block).
    See the module docstring: four-clip means from the cache, PCA(64) fitted on these albums."""
    cache = OnePassCache(cache_db, readonly=True)
    try:
        keys, X, _, _, _ = album_means(cache, "effnet", albums.keys.tolist(), matches, CLIPS, overrides=overrides)
    finally:
        cache.close()
    at = {k: i for i, k in enumerate(albums.keys.tolist())}
    pos = np.array([at[k] for k in keys.tolist()], dtype=np.int64)
    target = load_transform(Path(target_from) / "transform.npz").target_total_variance
    t = fit_transform(X, target, "discogs-effnet-bs1-1", k=BLOCK_DIMS, keys=keys)
    return pos, t.apply(X)


def nearest(X: np.ndarray, k: int = K, exclude: np.ndarray | None = None, chunk: int = 1024) -> np.ndarray:
    """Each row's k nearest other rows by squared euclidean distance on the float32 block, nearest first
    (as simbench.distances + nearest; ties in index order). `exclude`: an int label per row; rows with the
    seed's label are not candidates (the seed artist's other albums)."""
    X = np.asarray(X, dtype=np.float32).astype(np.float64)
    sq = (X ** 2).sum(axis=1)
    out = np.empty((len(X), k), dtype=np.int64)
    for a in range(0, len(X), chunk):
        b = min(a + chunk, len(X))
        D = sq[a:b, None] + sq[None, :] - 2 * X[a:b] @ X.T
        D[np.arange(b - a), np.arange(a, b)] = np.inf
        if exclude is not None:
            D[exclude[a:b, None] == exclude[None, :]] = np.inf
        part = np.argpartition(D, k, axis=1)[:, :k]
        part.sort(axis=1)  # index order first, so a stable sort breaks ties by index
        out[a:b] = np.take_along_axis(part, np.argsort(np.take_along_axis(D, part, axis=1), axis=1, kind="stable"), axis=1)
    return out
