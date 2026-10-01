"""Learned album representations from cached track embeddings, scored with simbench.

CLI:
  python learned.py [--only REGEX] [--ref D24]   the study on effnet / musicnn / scalars
                                                 -> learned.{md,json} (default cache/partial/learned/)
  python learned.py --bakeoff clap,mert_l7       the SHORTLIST recipes on bakeoff.py models and on
                                                 effnet over the same tracks -> learned_bakeoff.*
                                                 (differences against effnet:pca24)

Every recipe works on a *source*: `tracks -> (vectors, album position per vector)`, one vector per
analysed track (cached models) or per album (bakeoff models). Whatever is fitted with labels or
identities is fitted out of fold, GroupKFold over cleaned artists: an album's vector always comes
from a model that saw neither it nor its artist. Fold models differ, so each maps into a space
all folds share (the embedding's own coordinates for WCCN/LDA, the target space for regressions);
the unsupervised pool-level PCA that follows is the one D24 already uses.

  a. preprocessing   pca<d>: album mean, L2, PCA (pca24 = D24). raw<d>: no L2. tl2_<d>: L2 per
                     track first. std<d>: z-scored dimensions. white<d>: PCA-whitened. meanstd<d>:
                     [mean | std over tracks]. cos: L2 only, every dimension (cosine ranking).
                     +mus / +Ball / +Cvm: blocks joined at the stated shares of total variance.
  b. identity        wccn_alb / wccn_art: within-class covariance normalisation of the L2 track
                     vectors, class = album or artist (PRE leading PCs, shrunk towards the
                     identity), then pool PCA. lda_*: the same, then the leading between-class
                     directions inside the fold. Needs no RYM labels.
  c. RYM-supervised  ridge / pls / mlp from the album vector (PCA 128, z-scored) to the 120
                     descriptor weights (ndesc: L2-normalised), the genre-family indicators
                     (fam), or both; the out-of-fold predictions (pool PCA <d>) are the block.
  *_in               the same fitted on every album: in-sample, optimistic, for the size of the gap.
  <name>~mp|ls       the recipe ranked after a hubness reduction of the distances (simbench.RESCALE).

`hidden_descriptors` is the fair test of (c) for albums without descriptors: at the balanced
stop, seeds with 10+ descriptors query the catalog with their descriptors as they are (`true`),
blanked (`hidden`), or replaced by the out-of-fold prediction (`imputed`); neighbours are judged
against the seed's true descriptors and genres.
"""
import argparse
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import TransformedTargetRegressor
from sklearn.cross_decomposition import PLSRegression
from sklearn.decomposition import PCA
from sklearn.linear_model import RidgeCV
from sklearn.metrics.pairwise import euclidean_distances
from sklearn.model_selection import GroupKFold
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from aggregate import load_tracks
from evaluate import _table, row_nanmean
from genres import load_genres
from rmr_pipeline.constants import SLIDER
from simbench import MIN_DESC, OUT, ROWS, TRACKS, bakeoff_albums, bench, nearest, pool_rows, run, summarise
from simbench import variant_builders, write
from variants import match_var, total_var

FOLDS = 5
PRE = 128  # leading PCs kept before WCCN / as regression inputs
TOP = 128  # pool PCA scores kept per recipe; pca<d> etc. are their leading d
SHRINK = 0.1
ALPHAS = np.logspace(-1, 4, 11)
RICH = 10  # descriptors a seed needs in the hidden-descriptor test
BASELINES = ["A", "Ball", "Cvm", "D24", "Dn24", "E", "F"]
RESCALED = ["pca24~mp", "pca64~mp", "pca64~ls"]
SHORTLIST = ["pca24", "pca64", "cos", "wccn_art64", "ridge_ndesc24"]


@dataclass
class Pool:
    """The albums, their out-of-fold splits (album positions) and the RYM targets."""
    rows: np.ndarray
    folds: list[tuple[np.ndarray, np.ndarray]]
    artist: np.ndarray
    desc: np.ndarray
    family: np.ndarray  # one-hot coarse genre family
    labelled: np.ndarray  # albums with at least MIN_DESC descriptors: the regressions' training set


def make_pool(rows: np.ndarray) -> Pool:
    b = bench(rows)
    family = pd.get_dummies(load_genres(b.albums)["family"]).to_numpy(dtype=np.float64)
    folds = list(GroupKFold(FOLDS).split(rows, groups=b.artist))
    return Pool(rows, folds, b.artist, b.desc, family, (b.desc > 0).sum(axis=1) >= MIN_DESC)


def cached_source(name: str, rows: np.ndarray):
    """Source over the per-track cache: the first `tracks` in priority order of every pool album."""
    @lru_cache(maxsize=2)
    def source(k: int) -> tuple[np.ndarray, np.ndarray]:
        frame, embs = load_tracks()
        keep = ((frame["prio"] < k) & frame["row"].isin(rows)).to_numpy()
        return embs[name][keep], np.searchsorted(rows, frame["row"].to_numpy()[keep])

    return source


def unit(X: np.ndarray) -> np.ndarray:
    return X / np.linalg.norm(X, axis=1, keepdims=True)


def pooled(T: np.ndarray, album: np.ndarray, std: bool = False) -> np.ndarray:
    """Per album (vectors sorted by album), the mean of its vectors, or their standard deviation."""
    starts = np.flatnonzero(np.r_[True, album[1:] != album[:-1]])
    n = np.diff(np.r_[starts, len(album)])[:, None]
    mean = np.add.reduceat(T, starts, axis=0) / n
    return np.sqrt(np.maximum(np.add.reduceat(T * T, starts, axis=0) / n - mean ** 2, 0)) if std else mean


def pca(X: np.ndarray, d: int = TOP) -> np.ndarray:
    """Leading principal component scores over the pool, each keeping its own variance."""
    return PCA(n_components=min(d, *X.shape), svd_solver="full").fit_transform(X)


def blend(*parts: tuple[np.ndarray, float]) -> np.ndarray:
    """Blocks side by side, each scaled to its share of the total variance."""
    return np.hstack([match_var(X, w) for X, w in parts])


PREPROCESS = {
    "pca": lambda T, a: unit(pooled(T, a)),
    "raw": lambda T, a: pooled(T, a),
    "tl2_": lambda T, a: unit(pooled(unit(T), a)),
    "std": lambda T, a: StandardScaler().fit_transform(unit(pooled(T, a))),
    "meanstd": lambda T, a: np.hstack([unit(pooled(T, a)), pooled(unit(T), a, std=True)]),
}


def wccn(T: np.ndarray, cls: np.ndarray, lda: int = 0, pre: int = PRE, shrink: float = SHRINK):
    """Fit on vectors T with class ids: (mean, M) with z = (x - mean) @ M the vector whose
    within-class covariance, in the `pre` leading PCs, is the identity (shrunk by `shrink`
    towards a multiple of it first). M is symmetric and in the input coordinates, so maps
    fitted on different folds land in one space. `lda` > 0 also projects onto that many leading
    between-class directions."""
    mu = T.mean(axis=0)
    Tc = T - mu
    U = np.linalg.eigh(Tc.T @ Tc)[1][:, -min(pre, T.shape[1]):]
    P = Tc @ U
    inv, n = np.unique(cls, return_inverse=True, return_counts=True)[1:]
    means = np.zeros((len(n), P.shape[1]))
    np.add.at(means, inv, P)
    means /= n[:, None]
    W = P - means[inv]
    Sw = W.T @ W / (len(P) - len(n))
    Sw = (1 - shrink) * Sw + shrink * np.trace(Sw) / len(Sw) * np.eye(len(Sw))
    s, V = np.linalg.eigh(Sw)
    R = (V / np.sqrt(s)) @ V.T
    if lda:
        B = (means * np.sqrt(n)[:, None]) @ R
        Q = np.linalg.eigh(B.T @ B)[1][:, -lda:]
        R = R @ Q @ Q.T
    return mu, U @ R @ U.T


def _times10(Y: np.ndarray) -> np.ndarray:
    return Y * 10


def _over10(Y: np.ndarray) -> np.ndarray:
    return Y / 10


def regressor(kind: str):
    """PCA 128 -> z-score -> ridge (alpha per target, leave-one-out) / PLS 24 / one-hidden-layer MLP."""
    head = {"ridge": lambda: RidgeCV(alphas=ALPHAS, alpha_per_target=True),
            "pls": lambda: PLSRegression(n_components=24, scale=False),
            "mlp": lambda: TransformedTargetRegressor(  # targets scaled to O(1), which the optimiser needs
                MLPRegressor(hidden_layer_sizes=(256,), alpha=10, early_stopping=True, max_iter=300, random_state=0),
                func=_times10, inverse_func=_over10, check_inverse=False)}[kind]()
    return make_pipeline(PCA(PRE, svd_solver="covariance_eigh"), StandardScaler(), head)


def targets(pool: Pool, name: str) -> np.ndarray:
    """Regression targets: descriptor weights (desc), L2-normalised (ndesc), family one-hot (fam),
    or ndesc and fam side by side with equal total variance (ndescfam)."""
    ndesc = pool.desc / np.maximum(np.linalg.norm(pool.desc, axis=1, keepdims=True), 1e-9)
    return {"desc": pool.desc, "ndesc": ndesc, "fam": pool.family,
            "ndescfam": np.hstack([ndesc, match_var(pool.family, total_var(ndesc))])}[name]


def recipes(pool: Pool, source, per_track: bool = True) -> dict:
    """name -> build(tracks) for every recipe of one source (`per_track`: several vectors per
    album, which class = album needs)."""
    everyone = [(np.arange(len(pool.rows)),) * 2]

    @lru_cache(maxsize=None)
    def scores(k: int, pre: str) -> np.ndarray:
        T, album = source(k)
        return pca(PREPROCESS[pre](T.astype(np.float64), album))

    @lru_cache(maxsize=None)
    def identity(k: int, cls: str, lda: int = 0, pre: int = PRE, shrink: float = SHRINK, oof: bool = True) -> np.ndarray:
        T, album = source(k)
        T = unit(T.astype(np.float64))
        ids = album if cls == "alb" else pool.artist[album]
        Z = np.empty_like(T)
        for train, test in pool.folds if oof else everyone:
            fit, apply = np.isin(album, train), np.isin(album, test)
            mu, M = wccn(T[fit], ids[fit], lda, pre, shrink)
            Z[apply] = (T[apply] - mu) @ M
        return pca(pooled(Z, album))

    @lru_cache(maxsize=None)
    def predicted(k: int, kind: str, target: str, oof: bool = True) -> np.ndarray:
        T, album = source(k)
        X, Y = unit(pooled(T.astype(np.float64), album)), targets(pool, target)
        out = np.empty_like(Y)
        for train, test in pool.folds if oof else everyone:
            train = train[pool.labelled[train]]
            out[test] = clone(regressor(kind)).fit(X[train], Y[train]).predict(X[test])
        return out

    def white(k: int, d: int) -> np.ndarray:
        S = scores(k, "pca")[:, :d]
        return S / S.std(axis=0)

    out = {f"{pre}{d}": (lambda k, pre=pre, d=d: scores(k, pre)[:, :d])
           for pre, dims in {"pca": (8, 16, 24, 32, 48, 64, 128), "raw": (24,), "tl2_": (24,), "std": (24, 64),
                             "meanstd": (24, 64)}.items() if per_track or pre not in ("tl2_", "meanstd") for d in dims}
    out["cos"] = lambda k: PREPROCESS["pca"](source(k)[0].astype(np.float64), source(k)[1])
    out |= {f"white{d}": (lambda k, d=d: white(k, d)) for d in (16, 24, 32, 64, 128)}
    for cls in ("alb", "art") if per_track else ("art",):
        out |= {f"wccn_{cls}{d}": (lambda k, cls=cls, d=d: identity(k, cls)[:, :d]) for d in (16, 24, 32, 64, 128)}
        out[f"lda_{cls}24"] = lambda k, cls=cls: identity(k, cls, 24)[:, :24]
        out[f"wccn_{cls}24_in"] = lambda k, cls=cls: identity(k, cls, oof=False)[:, :24]
    out |= {f"wccn_art24_p{p}": (lambda k, p=p: identity(k, "art", 0, p)[:, :24]) for p in (64, 256)}
    out["wccn_art24_s50"] = lambda k: identity(k, "art", 0, PRE, 0.5)[:, :24]
    for kind, target in (("ridge", "desc"), ("ridge", "ndesc"), ("ridge", "fam"), ("ridge", "ndescfam"),
                         ("pls", "ndesc"), ("mlp", "ndesc")):
        out[f"{kind}_{target}24"] = lambda k, a=(kind, target): pca(predicted(k, *a), 24)
    out |= {f"ridge_ndesc{d}": (lambda k, d=d: pca(predicted(k, "ridge", "ndesc"), d)) for d in (16, 32, 120)}
    out["ridge_ndesc24_in"] = lambda k: pca(predicted(k, "ridge", "ndesc", False), 24)
    out["wccn_art24+ridge_ndesc24"] = lambda k: blend((out["wccn_art24"](k), .5), (out["ridge_ndesc24"](k), .5))
    out["predicted_desc"] = lambda k: predicted(k, "ridge", "desc")  # for hidden_descriptors, not scored
    return out


def combinations(eff: dict, mus: dict, variants: dict) -> dict:
    """Blocks of several cached models side by side (shares of the total variance in the name)."""
    def joint(name: str, *parts: tuple[dict, str, float]):
        return name, lambda k: blend(*((src[rep](k), w) for src, rep, w in parts))

    return dict([
        joint("pca24+mus24", (eff, "pca24", .5), (mus, "pca24", .5)),
        joint("pca24+mus24_75/25", (eff, "pca24", .75), (mus, "pca24", .25)),
        joint("pca24+Ball_75/25", (eff, "pca24", .75), (variants, "Ball", .25)),
        joint("pca24+Cvm_75/25", (eff, "pca24", .75), (variants, "Cvm", .25)),
        joint("pca24+mus24+Ball", (eff, "pca24", 1 / 3), (mus, "pca24", 1 / 3), (variants, "Ball", 1 / 3)),
        joint("wccn_art24+Ball_75/25", (eff, "wccn_art24", .75), (variants, "Ball", .25)),
        joint("wccn_art24+mus_wccn_art24", (eff, "wccn_art24", .5), (mus, "wccn_art24", .5)),
    ])


def hidden_descriptors(pool: Pool, blocks: dict[str, np.ndarray], predicted: np.ndarray) -> dict:
    """Balanced-stop neighbours of seeds with RICH+ descriptors whose own descriptor block is true,
    hidden (zeros) or imputed (out-of-fold prediction, clipped at 0); the catalog keeps its true
    descriptors. Per audio block and mode: descriptor cosine to the seed's true descriptors and
    genre shares of the top 10 (mean, CI). `audio` = the audio block alone, for reference."""
    b, s3 = bench(pool.rows), SLIDER["balanced"] ** 3
    seeds = (pool.desc > 0).sum(axis=1) >= RICH
    modes = {"true": pool.desc, "hidden": np.zeros_like(pool.desc), "imputed": np.maximum(predicted, 0)}
    out = {}
    for name, X in blocks.items():
        X = match_var(X, total_var(b.A))
        gallery = np.hstack([X, pool.desc / s3])
        queries = {"audio": (X, X)} | {m: (np.hstack([X, d / s3]), gallery) for m, d in modes.items()}
        out[name] = {}
        for mode, (Q, G) in queries.items():
            D = euclidean_distances(Q, G, squared=True)
            np.fill_diagonal(D, np.inf)
            nbrs = nearest(D)
            out[name][mode] = {m: summarise(np.where(seeds, row_nanmean(np.take_along_axis(b.pair[m], nbrs, axis=1)),
                                                     np.nan), b) for m in ("desc_cos", "genre_primary", "genre_family")}
    return out


def hidden_md(res: dict) -> str:
    cell = lambda m: f"{m['mean']:.3f} ±{(m['ci'][1] - m['ci'][0]) / 2:.3f}"  # noqa: E731
    metrics = ("desc_cos", "genre_primary", "genre_family")
    return "\n".join([
        "## Hidden descriptors (balanced stop)", "",
        f"Seeds with {RICH}+ descriptors; their descriptor block as it is (`true`), zeroed (`hidden`) or the "
        "out-of-fold ridge prediction from effnet (`imputed`); `audio` = audio block alone. The catalog keeps its "
        "true descriptors. `true` desc_cos is circular (the descriptors are in the distance).", "",
        *_table(["audio block", "seed descriptors", *metrics],
                [[n, mode, *(cell(r[m]) for m in metrics)] for n, modes in res.items() for mode, r in modes.items()])])


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--only", help="regex: score only the learned recipes whose name matches")
    p.add_argument("--ref", default="D24", help="representation the differences are taken against")
    p.add_argument("--rows", type=Path, default=ROWS, help="album snapshot (written if missing)")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--bakeoff", help="bakeoff.py models: SHORTLIST recipes on each and on effnet, on their albums")
    args = p.parse_args()
    t0 = time.time()
    rows = pool_rows(args.rows)
    if args.bakeoff:
        rows, loaders, deeper = bakeoff_albums(["effnet", *args.bakeoff.split(",")], rows)
        pool = make_pool(rows)
        builders = {f"{m}:{r}": build for m, load in loaders.items() for r, build in recipes(
            pool, lambda k, load=load: (load(k), np.arange(len(rows))), per_track=False).items() if r in SHORTLIST}
        results = run(variant_builders(rows, ["A"]) | builders, rows, ("A",) if deeper else ("A", *builders))
        write(results, "effnet:pca24", rows, args.out, "learned_bakeoff", {"runtime_s": round(time.time() - t0, 1)},
              title="Shortlisted recipes per embedding model, over the tracks the bake-off analysed")
        print(f"{len(rows)} albums, {len(results) - 1} representations, {time.time() - t0:.0f}s")
        return

    pool = make_pool(rows)
    eff, mus = (recipes(pool, cached_source(name, rows)) for name in ("effnet", "musicnn"))
    variants = variant_builders(rows, BASELINES)
    predicted = eff.pop("predicted_desc")
    learned = eff | {"mus_" + n: mus[n] for n in ("white24", "wccn_art24", "ridge_ndesc24")}
    learned |= combinations(eff, mus, variants)
    learned |= {n: eff[n.split("~")[0]] for n in RESCALED}
    if args.only:
        learned = {n: build for n, build in learned.items() if re.search(args.only, n)}
    results = run(variants | learned, rows)
    hidden = hidden_descriptors(pool, {n: (variants | eff)[n](TRACKS[1]) for n in ("A", "D24", "wccn_art24",
                                                                                 "ridge_ndesc24")}, predicted(TRACKS[1]))
    stem = "learned_only" if args.only else "learned"
    write(results, args.ref, rows, args.out, stem, {"hidden_descriptors": hidden, "folds": FOLDS,
                                                    "runtime_s": round(time.time() - t0, 1)},
          title="Learned representations", tail="\n" + hidden_md(hidden) + "\n")
    print(f"{len(rows)} albums, {len(results) - 1} representations, {time.time() - t0:.0f}s -> {args.out / stem}.md")


if __name__ == "__main__":
    main()
