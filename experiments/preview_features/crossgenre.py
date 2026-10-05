"""Cross-genre benchmark: do an audio block's neighbours reach outside the seed's genre and still
agree on how the music feels?

CLI (reads the caches named by RMR_PREVIEW_CACHE read-only; writes only under results/ and scratch/):
  python crossgenre.py run --pool bakeoff|full [--only REGEX]   score the candidate lists (cached per name in scratch/)
  python crossgenre.py holdout --pool full --names a,b,c        new-album test (transform fitted on 80% of artists)
  python crossgenre.py anchor --names a,b,c [--pool fullclap]   Bitches Brew lists on the full pool
  python crossgenre.py balanced --pool fullclap --names a,b     balanced stop, its hubness, artist retrieval, stability
  python crossgenre.py report                                   -> results/crossgenre.{md,json}

`build(name, pool) -> (rows, X)` returns the album-level matrix of any named candidate; `xscore`
measures any matrix. Pools: `bakeoff` = the 1,000 bake-off albums, 2 clips each, the same clips for
every model; `full` = the 3,944-album pool, 4 clips each (EffNet, MusiCNN and the Essentia scalars only);
`fullclap` = the albums of `full` that clap_catalog.py has a CLAP vector for (all but two), 4 clips each, with
`clap_music` next to EffNet and MusiCNN: the like-for-like set for CLAP at catalog scale (`fullclap2`: the
same albums from 2 clips, for simbench's stability only).

Measures (euclidean top 10 on the audio block alone, as the recommender ranks; the seed artist's
other albums are never candidates here; descriptor cosine as simbench: albums with MIN_DESC+ descriptors):
  xg_<scope>        rank ONLY candidates outside the seed's genre and take the top 10: their mean
                    descriptor cosine with the seed. Scopes: `family` (different coarse family of the
                    primary genre), `primary` (different primary genre), `strict` (different family and
                    no RYM genre shared at all), `disjoint` (no family shared among ANY of the two
                    albums' genres).
  xg_<scope>_lift   xg minus the seed's floor: its mean descriptor cosine over every allowed
                    candidate, i.e. the exact expectation of a random out-of-genre pick. The `random`
                    and `shuffled` rows show the same floor empirically (lift = 0).
  out_primary / out_family / n_families   reach of the plain top 10: share of neighbours with another
                    primary genre / in another family; distinct families among the ten.
  cross_out_cos / cross_in_cos   descriptor cosine of the out-of-family / in-family members of the plain
                    top 10, pooled over pairs (`n` = members per list); cross_out_lift = the out-of-family
                    members' cosine minus their seed's out-of-family floor.
  desc_cos, genre_primary, feel_mad   simbench's, same artist kept; *_xa with it removed.
  probe             out-of-fold (by artist) accuracy of a logistic regression predicting the genre
                    family from the block: how linearly readable the genre still is.
  hubness           skew of N10 and the share of albums in no list (simbench.hubness).
CIs: 95% bootstrap over artists (simbench.summarise), paired for differences.

Candidate names: parts joined with `+`, each `spec[@share]` (share of the total variance; parts
without one split the rest), optional ranking rule at the end: `~mmr<lambda>`, or `~x<n>` / `~x<n>p`
(forced crossing: the plain top 10 with its furthest in-family members replaced by the nearest
out-of-family albums until n are outside the seed's family. `x<n>` judges "outside" by the RYM family,
so it needs the RYM genre at run time: a reference, not a qualifying candidate. `x<n>p` judges it by a
family predicted from the candidate's own embedding for seed and candidates alike, the out-of-fold
(by artist) argmax of fampred's classifier: audio only).
  <emb>[-op...]/<k>   album mean -> L2 -> ops -> L2 -> PCA k. emb: effnet, musicnn, clap_music (the
                      working laion/larger_clap_music_and_speech), clap (laion/clap-htsat-unfused),
                      mert_l0..mert_l12, mert_mid (4-7), mert_early (1-3), mert_late (9-12), mert_mean,
                      mert_earlycat (unit layers 1-3 side by side). clap_music: bakeoff and fullclap pools;
                      clap and mert_*: bakeoff pool only.
  ops                 head<r>      project out the top-r right singular directions of the Discogs-400
                                   layer (graphdef.discogs_head); no RYM label involved. headonly<r> keeps
                                   only them (control: the genre part).
                      inlp<t>      t rounds of iterative nullspace projection: a logistic regression
                                   predicts the genre family from the PRE leading PCs, its row space is
                                   projected out, repeat.
                      bcs<r>       project out the top-r principal directions of the family means.
                      leace        least-squares concept erasure of the family (Belrose et al. 2023) in
                                   the PRE leading PCs: removes every linear trace on the fitting set.
                      fampred      subtract the expected family mean under a classifier's probabilities.
                      famoracle    subtract the album's own family mean. Needs the RYM genre at run
                                   time: an upper bound, not a qualifying candidate.
                      ndesc        replace the vector by a Ridge prediction of the album's L2-normalised
                                   RYM descriptor weights (learned.py's ridge_ndesc: PCA 128, z-score,
                                   alpha per descriptor; trained on albums with MIN_DESC+ descriptors).
                                   Fitted on the very labels desc_cos is measured with, so the measure
                                   favours it even out of fold.
                      noren        skip the second L2.
  feel / ball / ridge Essentia scalars: FEEL_S z-scored / all 33 min-max (variant B) / Ridge onto the 13
                      Spotify columns, each rescaled to the Spotify column's std (variant C).
  spotify             the 13 Spotify columns themselves (variant A): a reference, not an audio candidate.
  random, shuffled/<k>  controls: gaussian noise; effnet/<k> with its rows permuted.
Everything fitted with RYM genres, RYM descriptors or Spotify targets (inlp, bcs, leace, fampred,
famoracle's means, ndesc, ridge) is fitted out of fold by artist (GroupKFold 5): each album's vector comes from a fit that saw
neither it nor its artist; the PCA that follows is fitted on the pool, as D64 is. `oof=False` fits on
every album (in fit); `fit="fold<f>"` fits every step on fold f's training artists only (holdout).
"""
import argparse
import json
import re
import warnings
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression, RidgeCV
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import simbench
from common import HERE, RESULTS
from evaluate import _table, matrix, overlap, row_nanmean
from genres import family, load_genres
from simbench import K, MIN_DESC, distances, hubness, nearest, summarise
from variants import ALPHAS, match_var, total_var

SCRATCH = HERE / "scratch"  # gitignored: per-candidate results, so a rerun only computes new names
POOLS = {"bakeoff": (RESULTS / "bakeoff_rows.txt", 2), "full": (RESULTS / "pool_rows.txt", 4),
         "fullclap": (RESULTS / "pool_rows.txt", 4), "fullclap2": (RESULTS / "pool_rows.txt", 2)}  # fullclap*: see source
SCOPES = ("family", "primary", "strict", "disjoint")
KMAX = 64
PRE = 128  # leading PCs the supervised removals work in (learned.py's PRE)
INLP_MAX = 6
FOLDS = 5
MMR_POOL = 50
FEEL_S = ["loudness_lufs", "dynamic_complexity", "onset_rate", "bpm", "danceability", "deam_arousal", "deam_valence",
          "emomusic_arousal", "emomusic_valence", "mood_acoustic", "mood_aggressive", "mood_relaxed", "mood_happy",
          "mood_sad", "mood_party", "instrumental"]
SUPERVISED = ("inlp", "bcs", "leace", "fampred", "famoracle", "ndesc")
MERT = {"mert_mid": range(4, 8), "mert_early": range(1, 4), "mert_late": range(9, 13), "mert_mean": range(13),
        **{f"mert_l{i}": [i] for i in range(13)}}
SEED_METRICS = (*(f"xg_{s}{t}" for s in SCOPES for t in ("", "_lift")), "out_primary", "out_family", "n_families",
                "desc_cos", "desc_cos_xa", "genre_primary", "genre_primary_xa", "genre_family_xa", "feel_mad")
ANCHOR = ("Miles Davis", "Bitches Brew")
ANCHOR_TARGETS = (("Miles Davis", "Live-Evil"), ("Miles Davis", "Get Up With It"), ("Embryo", "Rocksession"))


# --- ground truth --------------------------------------------------------------------------------

def crossing_masks(genre_lists: list[list[str]], same_artist: np.ndarray) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """N×N boolean masks of the candidates that count as outside the seed's genre, per scope, and the
    in-family mask. A pair counts only if both albums have RYM genres, are not by the same artist and
    are not the same album."""
    n = len(genre_lists)
    ok = np.array([bool(g) for g in genre_lists])
    prim = pd.factorize(pd.Series([g[0] if g else None for g in genre_lists]))[0]
    fam = pd.factorize(pd.Series([family(g[0]) if g else None for g in genre_lists]))[0]
    vocab = {v: i for i, v in enumerate(sorted({x for g in genre_lists for x in g}))}
    fams = {v: i for i, v in enumerate(sorted({family(x) for x in vocab}))}
    G, F = np.zeros((n, len(vocab)), np.float32), np.zeros((n, len(fams)), np.float32)
    for r, g in enumerate(genre_lists):
        G[r, [vocab[x] for x in g]] = 1
        F[r, [fams[family(x)] for x in g]] = 1
    both = ok[:, None] & ok[None, :] & ~same_artist & ~np.eye(n, dtype=bool)
    other_family = fam[:, None] != fam[None, :]
    out = {"family": both & other_family, "primary": both & (prim[:, None] != prim[None, :]),
           "strict": both & other_family & ~(G @ G.T > 0), "disjoint": both & ~(F @ F.T > 0)}
    return out, both & ~other_family


def floors(cos: np.ndarray, out: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Per seed and scope, the mean descriptor cosine over every allowed candidate: what a random
    out-of-genre top 10 scores in expectation."""
    return {s: row_nanmean(np.where(m, cos, np.nan)) for s, m in out.items()}


@dataclass
class XBench:
    b: simbench.Bench
    genres: pd.DataFrame
    fam: np.ndarray  # family id of the primary genre, -1 without genres
    out: dict[str, np.ndarray]
    in_family: np.ndarray
    floor: dict[str, np.ndarray]


@lru_cache(maxsize=2)
def _xbench(key: bytes) -> XBench:
    b = simbench.bench(np.frombuffer(key, dtype=np.int64))
    genres = load_genres(b.albums)
    out, in_family = crossing_masks(list(genres["genres"]), b.same_artist)
    return XBench(b, genres, pd.factorize(genres["family"])[0], out, in_family, floors(b.pair["desc_cos"], out))


def xbench(rows: np.ndarray) -> XBench:
    return _xbench(np.ascontiguousarray(rows, dtype=np.int64).tobytes())


def ratio(num: np.ndarray, den: np.ndarray, b: simbench.Bench) -> dict:
    """sum(num) / sum(den) over seeds with its bootstrap CI over artists; n = the pairs per seed."""
    n = b.boot.shape[1]
    tn, td = np.bincount(b.artist, num, n), np.bincount(b.artist, den, n)
    with np.errstate(invalid="ignore", divide="ignore"):
        lo, hi = np.nanpercentile(tn[b.boot].sum(axis=1) / td[b.boot].sum(axis=1), [2.5, 97.5])
    return {"mean": round(float(num.sum() / max(den.sum(), 1)), 4), "ci": [round(float(lo), 4), round(float(hi), 4)],
            "n": round(float(den.sum() / len(den)), 3)}


def mmr(D: np.ndarray, allowed: np.ndarray, lam: float, pool: int = MMR_POOL, k: int = K) -> np.ndarray:
    """Maximal marginal relevance over each seed's `pool` nearest allowed albums: the nearest first,
    then repeatedly the candidate minimising lam * d(seed, c) - (1 - lam) * min d(c, already chosen),
    on euclidean distances. lam = 1 is the plain top k."""
    cand = nearest(D, allowed, k=pool)
    rows = np.arange(len(D))[:, None]
    d_seed = np.sqrt(D[rows, cand])
    d_cc = np.sqrt(D[cand[:, :, None], cand[:, None, :]])  # self = inf
    chosen = np.zeros((len(D), k), dtype=int)
    nearest_chosen = d_cc[:, :, 0].copy()
    taken = np.zeros(cand.shape, dtype=bool)
    taken[:, 0] = True
    for step in range(1, k):
        obj = np.where(taken, np.inf, lam * d_seed - (1 - lam) * np.where(np.isfinite(nearest_chosen), nearest_chosen, 0))
        pick = obj.argmin(axis=1)
        chosen[:, step] = pick
        taken[rows[:, 0], pick] = True
        nearest_chosen = np.minimum(nearest_chosen, d_cc[rows[:, 0], :, pick])
    return np.take_along_axis(cand, chosen, axis=1)


def forced(D: np.ndarray, allowed: np.ndarray, outside: np.ndarray, need: int, k: int = K) -> np.ndarray:
    """Forced crossing: each seed's k nearest allowed albums; while fewer than `need` of them are
    `outside` (N×N bool), the furthest non-outside member gives way to the nearest outside album not
    yet listed (until those run out). Lists stay sorted by distance."""
    D = np.where(allowed, D, np.inf)
    top = nearest(D, k=k)
    for s in range(len(D)):
        out = outside[s, top[s]]
        cand = np.setdiff1d(np.flatnonzero(outside[s] & np.isfinite(D[s])), top[s])
        cand = cand[np.argsort(D[s, cand], kind="stable")[:max(need - int(out.sum()), 0)]]
        if len(cand):
            new = np.concatenate([top[s][out], top[s][~out][:k - int(out.sum()) - len(cand)], cand])
            top[s] = new[np.argsort(D[s, new], kind="stable")]
    return top


def probe(X: np.ndarray, xb: XBench) -> float:
    """Out-of-fold accuracy of a linear genre-family classifier on the block."""
    ok = xb.fam >= 0
    Z, y, hit = StandardScaler().fit_transform(X), xb.fam, np.zeros(len(X), bool)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        for tr, te in GroupKFold(FOLDS).split(Z, groups=xb.b.artist):
            tr = tr[ok[tr]]
            hit[te] = LogisticRegression(C=1.0, max_iter=200).fit(Z[tr], y[tr]).predict(Z[te]) == y[te]
    return round(float(hit[ok].mean()), 4)


def xscore(X: np.ndarray, rows: np.ndarray, *, name: str, mmr_lambda: float | None = None, with_probe: bool = True,
           rerank=None) -> dict:
    """Every measure for one album-level matrix aligned to `rows`: `seeds` (per-seed arrays),
    `metrics` (mean, ci, n), `ratios` (the pooled crossing-quality numbers), `hubness`, `probe`,
    `lists` (the same-artist-removed top 10). With `mmr_lambda` the top 10 is re-ranked by MMR, with
    `rerank` (D, allowed -> lists; see reranker) by that rule, and only the list-based measures are
    reported."""
    xb = xbench(rows)
    b, cos = xb.b, xb.b.pair["desc_cos"]
    assert len(X) == len(rows) and np.isfinite(X).all(), name
    D = distances(X)
    take = lambda M, lists: np.take_along_axis(M, lists, axis=1)  # noqa: E731
    v: dict[str, np.ndarray] = {}
    if mmr_lambda is not None:
        rerank = lambda D, allowed: mmr(D, allowed, mmr_lambda)  # noqa: E731
    if rerank is None:
        base = simbench.score(X, rows, name=name)
        v |= {m: base["seeds"][m] for m in ("desc_cos", "genre_primary", "feel_mad")}
        for s, allowed in xb.out.items():
            got = row_nanmean(take(cos, nearest(D, allowed)))
            v[f"xg_{s}"] = np.where(allowed.sum(axis=1) >= K, got, np.nan)
            v[f"xg_{s}_lift"] = v[f"xg_{s}"] - xb.floor[s]
        xa = nearest(D, ~b.same_artist)
        hub = base["hubness"]["audio"]
    else:
        xa = rerank(D, ~b.same_artist)
        hub = hubness(xa)
    c = take(cos, xa)
    out_f, in_f, out_p = take(xb.out["family"], xa), take(xb.in_family, xa), take(xb.out["primary"], xa)
    with np.errstate(invalid="ignore", divide="ignore"):
        v["out_family"] = out_f.sum(axis=1) / (out_f | in_f).sum(axis=1)
        v["out_primary"] = out_p.sum(axis=1) / (out_f | in_f).sum(axis=1)
    fams = np.sort(np.where(xb.fam[xa] >= 0, xb.fam[xa], -1), axis=1)
    v["n_families"] = (np.diff(fams, axis=1) != 0).sum(axis=1) + 1.0 - (fams[:, 0] < 0)
    v["desc_cos_xa"] = row_nanmean(c)
    v["genre_primary_xa"] = row_nanmean(take(b.pair["genre_primary"], xa))
    v["genre_family_xa"] = row_nanmean(take(b.pair["genre_family"], xa))
    v = {m: v[m].astype(np.float64) for m in SEED_METRICS if m in v}
    seen = ~np.isnan(c)
    ratios = {"cross_out_cos": ratio(np.where(out_f & seen, c, 0).sum(axis=1), (out_f & seen).sum(axis=1), b),
              "cross_in_cos": ratio(np.where(in_f & seen, c, 0).sum(axis=1), (in_f & seen).sum(axis=1), b),
              "cross_out_lift": ratio(np.where(out_f & seen, c - np.nan_to_num(xb.floor["family"])[:, None], 0).sum(axis=1),
                                      (out_f & seen).sum(axis=1), b)}
    return {"name": name, "dims": int(X.shape[1]), "seeds": v, "lists": xa, "hubness": hub, "ratios": ratios,
            "probe": probe(X, xb) if with_probe else None,
            "metrics": {m: summarise(x, b) for m, x in v.items() if not np.isnan(x).all()}}


# --- sources -------------------------------------------------------------------------------------

@dataclass
class Source:
    """One pool: raw album-mean embeddings per model, the Essentia scalars (album means over the same
    clips), the Spotify columns (Ridge targets; `spot_ok` = the album's own), the genre family id
    (-1 = none) and the artist folds."""
    pool: str
    rows: np.ndarray
    emb: dict[str, np.ndarray]
    S: pd.DataFrame
    A: np.ndarray
    spot_ok: np.ndarray
    fam: np.ndarray
    desc: np.ndarray  # RYM descriptor weights (ndesc's targets)
    fits: dict[str, np.ndarray]  # "all" and "fold<f>" (the training albums of fold f)
    tests: list[np.ndarray]


def clap_means(clips: int) -> tuple[np.ndarray, np.ndarray]:
    """(rows ascending, album-mean CLAP vectors): the catalog albums clap_catalog.py holds at least one
    embedded clip for, each the plain mean of its clips ranked below `clips` (clap_catalog.load)."""
    import clap_catalog
    from common import load_albums
    keys, X = clap_catalog.load(clips)
    al = load_albums()
    row_of = dict(zip(al["URI"], al["row"]))
    r = np.array([row_of.get(k, -1) for k in keys], dtype=np.int64)
    order = np.argsort(r)[(r < 0).sum():]
    return r[order], X[order].astype(np.float64)


@lru_cache(maxsize=3)
def source(pool: str) -> Source:
    from aggregate import aggregate
    from rmr_pipeline.constants import AUDIO
    from variants import make_inputs
    path, clips = POOLS[pool]
    rows = np.sort(np.loadtxt(path, dtype=np.int64))  # bakeoff_rows.txt is in sampling order
    clap = None
    if pool.startswith("fullclap"):  # the full pool's albums with a CLAP vector: every model on the same albums
        have, clap = clap_means(clips)
        rows = rows[np.isin(rows, have)]
        clap = clap[np.searchsorted(have, rows)]
    inp = make_inputs(*aggregate(prio_below=clips), rows)
    assert np.array_equal(inp.albums["row"], rows), "pool albums missing from the cache"
    emb = {k: inp.emb[k].astype(np.float64) for k in ("effnet", "musicnn")}
    if pool == "bakeoff":
        import bakeoff_eval
        r, X = bakeoff_eval.load(["effnet", "musicnn", "clap_music", "clap", "mert"], clips)
        assert np.array_equal(r, rows) and np.array_equal(X["effnet"], emb["effnet"])  # same clips as the scalars
        layers = X.pop("mert").reshape(len(rows), 13, 768)
        emb |= {k: X[k] for k in ("clap_music", "clap")} | {k: layers[:, list(i)].mean(axis=1) for k, i in MERT.items()}
        emb["mert_earlycat"] = np.hstack([unit(layers[:, i]) for i in MERT["mert_early"]])
    if clap is not None:
        emb["clap_music"] = clap
    xb = xbench(rows)
    folds = list(GroupKFold(FOLDS).split(rows, groups=xb.b.artist))
    return Source(pool, rows, emb, inp.scalars, inp.albums[AUDIO].to_numpy(dtype=np.float64), inp.fit, xb.fam, xb.b.desc,
                  {"all": np.arange(len(rows))} | {f"fold{f}": tr for f, (tr, _) in enumerate(folds)},
                  [te for _, te in folds])


def unit(X: np.ndarray) -> np.ndarray:
    return X / np.linalg.norm(X, axis=1, keepdims=True)


def _pcs(V: np.ndarray, d: int) -> tuple[np.ndarray, np.ndarray, float]:
    """(mean, the d leading principal directions as rows, the scores' root mean variance)."""
    m = V.mean(axis=0)
    _, s, Vt = np.linalg.svd(V - m, full_matrices=False)
    d = min(d, len(s))
    return m, Vt[:d], float(np.sqrt((s[:d] ** 2).sum() / len(V) / d))


def _logreg(Z: np.ndarray, y: np.ndarray) -> LogisticRegression:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        return LogisticRegression(C=1.0, max_iter=300).fit(Z, y)


def _orth(M: np.ndarray, tol: float = 1e-6) -> np.ndarray:
    """Orthonormal rows spanning the row space of M."""
    _, s, Vt = np.linalg.svd(M, full_matrices=False)
    return Vt[s > tol * s.max()]


@lru_cache(maxsize=1)
def head_directions() -> np.ndarray:
    """Right singular directions of the Discogs-400 layer, strongest first: (400, 1280)."""
    from graphdef import discogs_head
    return np.linalg.svd(discogs_head()[0], full_matrices=False)[2]


_INLP: dict[tuple, list[np.ndarray]] = {}


def _inlp(key: tuple, V: np.ndarray, y: np.ndarray) -> list[np.ndarray]:
    """Cumulative orthonormal directions (rows, in the embedding's coordinates) after 1..INLP_MAX
    rounds, fitted on the labelled training vectors V. Cached per (pool, spec prefix, fit)."""
    if key not in _INLP:
        m, C, s = _pcs(V, PRE)
        Z, B, out = (V - m) @ C.T / s, np.zeros((0, len(C))), []
        for _ in range(INLP_MAX):
            B = _orth(np.vstack([B, _orth(_logreg(Z - Z @ B.T @ B, y).coef_)]))
            out.append(B @ C)
        _INLP[key] = out
    return _INLP[key]


def fit_op(op: str, V: np.ndarray, src: Source, train: np.ndarray, key: tuple):
    """`op` fitted on the training albums (unit vectors V[train], their family ids, -1 = none, or
    their descriptors) -> a function on any albums' vectors (and their family ids, used by
    famoracle only)."""
    kind, arg = re.fullmatch(r"([a-z]+?)(\d*)", op).groups()
    arg, y = int(arg) if arg else None, src.fam
    if kind == "ndesc":
        from learned import regressor
        lab = train[(src.desc[train] > 0).sum(axis=1) >= MIN_DESC]
        model = regressor("ridge").fit(V[lab], unit(src.desc[lab]))
        return lambda X, _: model.predict(X)
    if kind in ("head", "headonly"):
        U = head_directions()[:arg]
        return (lambda X, _: X - X @ U.T @ U) if kind == "head" else (lambda X, _: X @ U.T @ U)
    lab = train[y[train] >= 0]
    Vt, yt = V[lab], y[lab]
    m = V[train].mean(axis=0)
    classes = np.unique(yt)
    means = np.stack([Vt[yt == c].mean(axis=0) for c in classes]) - m
    if kind == "bcs":
        w = np.sqrt(np.array([(yt == c).sum() for c in classes]) / len(yt))[:, None]
        U = _orth(means * w)[:arg]
        return lambda X, _: X - (X - m) @ U.T @ U
    if kind == "inlp":
        U = _inlp(key, Vt, yt)[arg - 1]
        mt = Vt.mean(axis=0)
        return lambda X, _: X - (X - mt) @ U.T @ U
    if kind == "famoracle":
        lookup = np.zeros((int(y.max()) + 2, V.shape[1]))  # last row: no genre, nothing subtracted
        lookup[classes] = means
        return lambda X, fam: X - lookup[fam]
    mt, C, s = _pcs(Vt, PRE)
    Z = (Vt - mt) @ C.T / s
    if kind == "fampred":
        scaler = StandardScaler().fit(Z)
        clf = _logreg(scaler.transform(Z), yt)
        return lambda X, _: X - clf.predict_proba(scaler.transform((X - mt) @ C.T / s)) @ means
    if kind == "leace":
        onehot = (yt[:, None] == classes[None, :]).astype(np.float64)
        Zc = Z - Z.mean(axis=0)
        w, E = np.linalg.eigh(Zc.T @ Zc / len(Z) + 1e-6 * np.eye(Z.shape[1]))
        Wh, Wh_inv = (E / np.sqrt(w)) @ E.T, (E * np.sqrt(w)) @ E.T
        Q = _orth((Wh @ (Zc.T @ (onehot - onehot.mean(axis=0)) / len(Z))).T)  # rows: basis of the whitened cross-covariance
        P = Wh @ Q.T @ Q @ Wh_inv  # row-vector form of W^+ Q Q^T W
        z0 = Z.mean(axis=0)
        return lambda X, _: X - (((X - mt) @ C.T / s - z0) @ P * s) @ C
    raise ValueError(op)


def _removed(src: Source, emb: str, ops: tuple[str, ...], fit: str) -> np.ndarray:
    """The unit album vectors after `ops`, every op fitted on src.fits[fit]."""
    V, train = unit(src.emb[emb]), src.fits[fit]
    for i, op in enumerate(o for o in ops if o != "noren"):
        V = fit_op(op, V, src, train, (src.pool, emb, ops[:i], fit))(V, src.fam)
    return V


@lru_cache(maxsize=None)
def emb_block(pool: str, spec: str, fit: str = "all", oof: bool = True) -> np.ndarray:
    """(albums, KMAX) PCA scores of `<emb>[-op...]`; the leading k columns are its PCA k."""
    src = source(pool)
    emb, *ops = spec.split("-")
    ops = tuple(ops)
    if oof and fit == "all" and any(o.startswith(SUPERVISED) for o in ops):
        V = None
        for f, test in enumerate(src.tests):
            Vf = _removed(src, emb, ops, f"fold{f}")
            V = np.empty((len(src.rows), Vf.shape[1])) if V is None else V
            V[test] = Vf[test]
    else:
        V = _removed(src, emb, ops, fit)
    V = V if "noren" in ops else unit(V)
    m, C, _ = _pcs(V[src.fits[fit]], KMAX)
    return (V - m) @ C.T


@lru_cache(maxsize=None)
def scalar_block(pool: str, kind: str, fit: str = "all", oof: bool = True) -> np.ndarray:
    src = source(pool)
    tr = src.fits[fit]
    if kind == "feel":
        S = src.S[FEEL_S].to_numpy()
        return (S - S[tr].mean(axis=0)) / S[tr].std(axis=0)
    S = src.S.to_numpy()
    if kind == "ball":
        return (S - S[tr].min(axis=0)) / (S[tr].max(axis=0) - S[tr].min(axis=0))
    assert kind == "ridge", kind
    model = make_pipeline(StandardScaler(), RidgeCV(alphas=ALPHAS, alpha_per_target=True))
    learn = lambda idx: model.fit(S[idx[src.spot_ok[idx]]], src.A[idx[src.spot_ok[idx]]])  # noqa: E731
    if oof and fit == "all":
        pred = np.empty_like(src.A)
        for f, test in enumerate(src.tests):
            pred[test] = learn(src.fits[f"fold{f}"]).predict(S[test])
    else:
        pred = learn(tr).predict(S)
    return src.A[tr].mean(axis=0) + (pred - pred[tr].mean(axis=0)) * src.A[tr].std(axis=0) / pred[tr].std(axis=0)


@lru_cache(maxsize=None)
def predicted_family(pool: str, emb: str) -> tuple[np.ndarray, float]:
    """Every album's genre family (id as Source.fam) predicted from its unit `emb` vector by
    fampred's classifier (leading PRE PCs, standardised, logistic regression), out of fold by artist;
    and the accuracy over the albums with an RYM genre."""
    src = source(pool)
    V, y, pred = unit(src.emb[emb]), src.fam, np.empty(len(src.rows), int)
    for f, test in enumerate(src.tests):
        lab = src.fits[f"fold{f}"]
        lab = lab[y[lab] >= 0]
        mt, C, s = _pcs(V[lab], PRE)
        scaler = StandardScaler().fit((V[lab] - mt) @ C.T / s)
        clf = _logreg(scaler.transform((V[lab] - mt) @ C.T / s), y[lab])
        pred[test] = clf.predict(scaler.transform((V[test] - mt) @ C.T / s))
    return pred, round(float((pred == y)[y >= 0].mean()), 4)


def family_outside(pool: str, emb: str | None = None) -> np.ndarray:
    """N×N: the candidate is outside the seed's family. By RYM family (never when either album has
    no RYM genre), or with `emb` by the family predicted from that embedding."""
    src = source(pool)
    if emb is not None:
        fam = predicted_family(pool, emb)[0]
        return fam[:, None] != fam[None, :]
    return (src.fam[:, None] != src.fam[None, :]) & (src.fam >= 0)[:, None] & (src.fam >= 0)[None, :]


def reranker(name: str, pool: str):
    """The ranking rule a name ends with, as a function (D, allowed) -> top-K lists; None = plain."""
    rule = name.partition("~")[2]
    if not rule:
        return None
    if rule.startswith("mmr"):
        return lambda D, allowed: mmr(D, allowed, float(rule[3:]))
    need, pred = re.fullmatch(r"x(\d+)(p?)", rule).groups()
    outside = family_outside(pool, re.split(r"[-/]", name)[0] if pred else None)
    return lambda D, allowed: forced(D, allowed, outside, int(need))


def parse(name: str) -> tuple[list[tuple[str, float]], float | None]:
    """name -> ([(spec, share of the total variance)], MMR lambda or None). Any `~rule` is dropped
    from the specs (see reranker)."""
    name, _, rule = name.partition("~")
    lam = rule[3:] if rule.startswith("mmr") else ""
    parts = [p.partition("@") for p in name.split("+")]
    given = sum(float(s) for _, _, s in parts if s)
    free = sum(1 for _, _, s in parts if not s)
    return [(spec, float(s) if s else (1 - given) / free) for spec, _, s in parts], float(lam) if lam else None


def build(name: str, pool: str, fit: str = "all", oof: bool = True) -> tuple[np.ndarray, np.ndarray]:
    """(rows, X): the album-level matrix of a named candidate on `pool` ("bakeoff" or "full"), rows
    ascending (the albums of results/bakeoff_rows.txt / pool_rows.txt). A `~rule` suffix does not change X
    (it re-ranks; see xscore)."""
    src = source(pool)
    tr, blocks = src.fits[fit], []
    for spec, share in parse(name)[0]:
        if share == 0:
            continue
        base, _, k = spec.partition("/")
        if base == "random":
            B = np.random.default_rng(0).normal(size=(len(src.rows), 8))
        elif base == "shuffled":
            B = emb_block(pool, "effnet", fit, oof)[np.random.default_rng(0).permutation(len(src.rows)), :int(k)]
        elif base in ("feel", "ball", "ridge"):
            B = scalar_block(pool, base, fit, oof)
        elif base == "spotify":
            B = src.A
        else:
            B = emb_block(pool, base, fit, oof)[:, :int(k)]
        blocks.append(B * np.sqrt(share / total_var(B[tr])))
    return src.rows, np.hstack(blocks)


# --- candidate lists -----------------------------------------------------------------------------

SHARES = (0.1, 0.25, 0.5, 0.75, 0.9)
HEAD_R = (8, 16, 32, 64, 128, 256, 400)
CONTROLS = ["random", "shuffled/64"]


def blends(emb: str, kinds=("feel", "ridge", "ball")) -> list[str]:
    return [f"{emb}+{k}@{w}" for k in kinds for w in SHARES]


def candidates(pool: str) -> dict[str, list[str]]:
    """Section -> names. `effnet/64` is the reference everywhere."""
    if pool.startswith("fullclap"):
        return {"models": ["effnet/64", "effnet/24", "clap_music/64", "clap_music/24"],
                "combos": ["clap_music-inlp1/64"], "noise": [f"effnet/64+random@{w}" for w in SHARES]}
    removal = ["effnet-famoracle/64", "effnet-fampred/64", *(f"effnet-inlp{t}/64" for t in (1, 2, 4, 6)),
               *(f"effnet-bcs{r}/64" for r in (4, 8, 16)), "effnet-leace/64"]
    head = [*(f"effnet-head{r}/64" for r in HEAD_R), "effnet-headonly400/64", "effnet-head64-noren/64"]
    out = {
        "models": ["effnet/64", "effnet/24", "musicnn/64", "musicnn/24"],
        "removal": removal,
        "head": head,
        "blends": ["spotify", "feel", "ridge", "ball", *blends("effnet/64")],
        "combos": ["effnet-head64/64+feel@0.25", "effnet-head64/64+feel@0.5", "effnet-head400/64+feel@0.25",
                   "effnet-head400/64+feel@0.5", "effnet-inlp2/64+feel@0.25", "effnet-inlp2/64+feel@0.5",
                   "effnet-leace/64+feel@0.25", "effnet-head64-inlp2/64", "effnet-head64-leace/64",
                   "effnet-head400-leace/64", "effnet-head400-inlp2/64", "musicnn-leace/64", "musicnn-inlp2/64",
                   "musicnn/64+feel@0.25", "effnet/64+musicnn/64", "effnet-leace/64+musicnn-leace/64",
                   "effnet-leace/64+ball@0.5", "effnet-fampred/64+ball@0.5", "effnet-inlp4/64+ball@0.5",
                   "musicnn/64+ball@0.5"],
        "ndesc": ["effnet-ndesc/64", "effnet-ndesc/24", "effnet-ndesc-leace/64", "effnet-ndesc-inlp2/64",
                  "effnet/64+effnet-ndesc/64", "musicnn-ndesc/64", "effnet-ndesc/64+ball@0.5"],
        "mmr": [f"effnet/64~mmr{lam}" for lam in (0.9, 0.7, 0.5, 0.3)],
        "forced": ["effnet/64~x5", "effnet/64~x5p"],
        "noise": [f"effnet/64+random@{w}" for w in SHARES],
    }
    if pool == "bakeoff":
        out["models"] += ["clap_music/64", "clap_music/24", "clap/64", "mert_mid/64", "mert_mid/24", "mert_early/64",
                          "mert_earlycat/64", "mert_late/64", "mert_mean/64"]
        out["forced"] += ["clap_music/64~x5", "clap_music/64~x5p"]
        out["mert_layers"] = [f"mert_l{i}/64" for i in range(13)]
        out["blends"] += blends("clap_music/64", ("feel",))
        out["ndesc"] += ["clap_music-ndesc/64", "clap_music-ndesc-leace/64", "clap_music/64+clap_music-ndesc/64",
                         "mert_l6-ndesc/64"]
        out["combos"] += ["clap_music-leace/64", "clap_music-inlp2/64", "clap_music-inlp4/64", "clap_music-bcs16/64",
                          "clap_music-fampred/64", "clap_music-leace/64+feel@0.25", "clap_music/64+effnet/64",
                          "clap_music/64+effnet-head64/64", "clap_music/64+effnet-head400/64",
                          "clap_music/64+effnet-leace/64", "clap_music-leace/64+effnet-leace/64",
                          "clap_music-leace/64+effnet-head400-leace/64", "mert_mid/64+feel@0.25", "mert_mid-leace/64",
                          "mert_l5/64+feel@0.5", "clap_music/64+mert_mid/64", "clap_music-inlp1/64",
                          "clap_music-inlp2/64+ball@0.5", "clap_music-inlp2/64+feel@0.25", "clap-inlp2/64",
                          "mert_l6-inlp1/64", "mert_l6-inlp2/64"]
    return out


# --- runs ----------------------------------------------------------------------------------------

def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.+@~-]", "_", name).replace("/", "_")


def run_one(name: str, pool: str) -> dict:
    """xscore of a named candidate, cached in scratch/<pool>/ (summary json + per-seed npz)."""
    d = SCRATCH / pool
    js, npz = d / f"{_safe(name)}.json", d / f"{_safe(name)}.npz"
    if js.exists() and npz.exists():
        z = np.load(npz)
        return json.loads(js.read_text()) | {"seeds": {k: z[k] for k in z.files if k != "lists"}, "lists": z["lists"]}
    rows, X = build(name, pool)
    r = xscore(X, rows, name=name, rerank=reranker(name, pool))
    d.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(npz, lists=r["lists"], **r["seeds"])
    js.write_text(json.dumps({k: r[k] for k in ("name", "dims", "metrics", "ratios", "hubness", "probe")}))
    return r


def run(pool: str, only: str | None = None) -> None:
    import time
    names = [n for sec in candidates(pool).values() for n in sec]
    for name in dict.fromkeys(CONTROLS + names):
        if only and not re.search(only, name):
            continue
        t0 = time.time()
        r = run_one(name, pool)
        m = r["metrics"]
        print(f"{name:44s} xg_lift {m.get('xg_family_lift', {}).get('mean', float('nan')):+.3f}  out_fam "
              f"{m['out_family']['mean']:.3f}  desc_xa {m['desc_cos_xa']['mean']:.3f}  probe {r['probe']}  "
              f"{time.time() - t0:.1f}s", flush=True)


def holdout(name: str, pool: str) -> dict:
    """New-album test, as solution.holdout: every step of the candidate (genre removal, scalers,
    Ridge, PCA, block weights) is fitted on the training artists of a fold, every album is mapped
    with that transform, and the held-out albums' measures are read off. `in_fit` = fitted on every
    album; `oof` = the main tables' version (supervised steps out of fold, PCA on the pool)."""
    src = source(pool)
    xb = xbench(src.rows)
    keys = ("xg_family", "xg_family_lift", "xg_primary_lift", "out_family", "out_primary", "desc_cos_xa",
            "genre_primary_xa", "desc_cos")
    ref = xscore(build(name, pool, oof=False)[1], src.rows, name=name, with_probe=False)
    main = run_one(name, pool)
    held = {m: np.full(len(src.rows), np.nan) for m in keys}
    same = np.full(len(src.rows), np.nan)
    for f, test in enumerate(src.tests):
        r = xscore(build(name, pool, fit=f"fold{f}")[1], src.rows, name=f"{name} fold{f}", with_probe=False)
        for m in keys:
            held[m][test] = r["seeds"][m][test]
        same[test] = overlap(r["lists"][test], ref["lists"][test])
        print(f"{name}: fold {f} done", flush=True)
    return {"name": name, "pool": pool, "same_lists": summarise(same, xb.b), "metrics": {
        m: {"in_fit": summarise(ref["seeds"][m], xb.b), "held_out": summarise(held[m], xb.b),
            "oof": main["metrics"][m], "diff": summarise(held[m] - ref["seeds"][m], xb.b)} for m in keys}}


def anchor(names: list[str], pool: str = "full", seed=ANCHOR, targets=ANCHOR_TARGETS, k: int = K) -> dict:
    """The sonic top k (same artist kept, as the site shows it) of the anchor album per candidate,
    the ranks of the target albums and whether a prog-rock album is in the list."""
    src = source(pool)
    xb = xbench(src.rows)
    al, g = xb.b.albums, xb.genres
    find = lambda a, t: np.flatnonzero((al["Artist"].astype(str) == a) & (al["Title"].astype(str) == t))  # noqa: E731
    out = {"pool": pool, "present": {f"{a} — {t}": bool(len(find(a, t))) for a, t in (seed, *targets)}, "lists": {}}
    if not len(find(*seed)):
        return out
    s = int(find(*seed)[0])
    out["seed_genres"] = g["genres"][s]
    for name in names:
        X = build(name, pool)[1]
        D = distances(X)[s]
        if reranker(name, pool) is not None:
            top = reranker(name, pool)(distances(X), np.ones((len(D), len(D)), bool))[s]
        else:
            top = np.argsort(D)[:k]
        rank = np.empty(len(D), int)
        rank[np.argsort(D)] = np.arange(1, len(D) + 1)
        prog = [bool(re.search(r"prog", " ".join(g["genres"][i]), re.I)) and "rock" in " ".join(g["genres"][i]).lower()
                for i in top]
        label = lambda i: f"{al['Artist'][i]} — {al['Title'][i]} [{g['primary'][i]}]"  # noqa: E731
        cosine = lambda idx: [None if np.isnan(c) else round(float(c), 3) for c in xb.b.pair["desc_cos"][s, idx]]  # noqa: E731
        fam = g["family"].to_numpy()[np.argsort(D)[:len(D) - 1]]  # nearest first, the seed (inf) dropped
        first = lambda m: int(np.flatnonzero(m)[0]) + 1 if m.any() else None  # noqa: E731
        out["lists"][name] = l = {
            "top": [label(i) for i in top],
            "families": [g["family"][i] for i in top],
            "desc_cos": cosine(top),
            "prog_rock": [f"{al['Artist'][i]} — {al['Title'][i]}" for i, p in zip(top, prog) if p],
            "ranks": {f"{a} — {t}": int(rank[find(a, t)[0]]) for a, t in targets if len(find(a, t))},
            "first": {"rock_family": first(fam == "rock"),
                      "non_jazz_family": first((fam != "jazz") & g["joined"].to_numpy()[np.argsort(D)[:len(D) - 1]])}}
        if reranker(name, pool) is None:  # the balanced stop, as simbench.score builds it
            Db = distances(matrix(match_var(X, total_var(xb.b.A)), xb.b.desc, "balanced"))[s]
            tb = np.argsort(Db)[:k]
            l["balanced"] = {"top": [label(i) for i in tb], "families": [g["family"][i] for i in tb], "desc_cos": cosine(tb)}
    return out


BAL = ("bal_genre_primary", "bal_genre_family", "bal_overlap_A", "artist_share", "artist_mrr", "stability",
       "genre_primary", "genre_family", "desc_cos")


def balanced(names: list[str], pool: str) -> dict:
    """simbench.score per candidate on `pool`: the balanced stop (the block scaled to the Spotify block's
    total variance and joined to the descriptors, as the site does), hubness on the block alone and at
    that stop, artist retrieval, and stability (overlap@10 of the lists from 2 and from 4 clips, where
    POOLS has a `<pool>2`). Differences are paired against the first name."""
    rows, two = source(pool).rows, pool + "2" if pool + "2" in POOLS else None
    assert two is None or np.array_equal(source(two).rows, rows)
    res = {}
    for n in names:
        refit = (lambda k, n=n: build(n, pool if k == simbench.TRACKS[1] else two)[1]) if two else None
        res[n] = simbench.score(build(n, pool)[1], rows, name=n, build=refit)
        print(f"{n}: done", flush=True)
    b, ref = xbench(rows).b, res[names[0]]["seeds"]
    return {"pool": pool, "albums": len(rows), "ref": names[0],
            "candidates": {n: {"metrics": {m: r["metrics"][m] for m in BAL if m in r["metrics"]}, "hubness": r["hubness"]}
                           for n, r in res.items()},
            "diff": {n: {m: summarise(r["seeds"][m] - ref[m], b) for m in BAL if m in r["metrics"]}
                     for n, r in res.items() if n != names[0]}}


def head_check(pool: str = "full") -> dict:
    """What projecting out the Discogs-400 layer does to the album vectors: the share of their
    variance in the top-r directions, and the spread of the 400 logits before and after r = 400."""
    from graphdef import discogs_head
    W, U, V = discogs_head()[0], head_directions(), unit(source(pool).emb["effnet"])
    Vc = V - V.mean(axis=0)
    left = V - V @ U.T @ U
    return {"pool": pool, "rank": int(np.linalg.matrix_rank(W)),
            "variance_share": {str(r): round(float(((Vc @ U[:r].T) ** 2).sum() / (Vc ** 2).sum()), 4) for r in HEAD_R},
            "logit_std_before": round(float((V @ W.T).std(axis=0).mean()), 4),
            "logit_max_abs_after_400": float(np.abs(left @ W.T).max())}


# --- report --------------------------------------------------------------------------------------

def _pm(m: dict | None, sign: bool = False) -> str:
    if m is None:
        return "–"
    return f"{m['mean']:{'+' if sign else ''}.3f} ±{(m['ci'][1] - m['ci'][0]) / 2:.3f}"


def _mean(m: dict | None, sign: bool = False) -> str:
    return "–" if m is None else f"{m['mean']:{'+' if sign else ''}.3f}"


def _star(m: dict | None) -> str:
    return "–" if m is None else f"{m['mean']:+.3f}" + "*" * (m["ci"][0] > 0 or m["ci"][1] < 0)


WIDE = ["candidate", "dims", "xg cos", "xg lift", "lift primary", "lift strict", "lift disjoint", "out primary",
        "out family", "families /list", "cross out cos (n)", "cross in cos (n)", "cross out lift", "desc_cos",
        "desc_cos_xa", "primary_xa", "probe", "hub skew", "never", "feel_mad", "lift vs noise", "desc_xa vs noise"]
SHORT = ["candidate", "xg lift", "lift primary", "out primary", "out family", "cross out cos (n)", "cross out lift",
         "desc_cos_xa", "primary_xa", "probe", "hub skew", "lift vs noise", "desc_xa vs noise"]
FORCED_COLS = ["candidate", "out family", "out primary", "families /list", "cross out cos (n)", "cross in cos (n)",
               "cross out lift", "desc_cos_xa", "primary_xa", "hub skew", "never"]
NOISE_KEYS = {"lift vs noise": "xg_family_lift", "desc_xa vs noise": "desc_cos_xa"}


def noise_curve(res: dict[str, dict], names: list[str]) -> dict[str, np.ndarray] | None:
    """The reference frontier: effnet/64 diluted with gaussian noise, from plain to pure noise.
    out_family ascending, with xg lift and desc_cos_xa at each point."""
    pts = [res[n]["metrics"] for n in ["effnet/64", *names, "random"] if n in res]
    if len(pts) < 3:
        return None
    order = np.argsort([p["out_family"]["mean"] for p in pts])
    return {k: np.array([pts[i][k]["mean"] for i in order]) for k in ("out_family", *NOISE_KEYS.values())}


def vs_noise(m: dict, curve: dict | None, key: str) -> float | None:
    """A candidate's value minus the noise curve's at the candidate's out_family reach: positive =
    better than plain EffNet diluted with noise to the same reach."""
    if curve is None or key not in m:
        return None
    return float(m[key]["mean"] - np.interp(m["out_family"]["mean"], curve["out_family"], curve[key]))


def _cells(r: dict, curve: dict | None = None) -> dict[str, str]:
    m, q = r["metrics"], r["ratios"]
    extra = {c: "–" if (x := vs_noise(m, curve, k)) is None else f"{x:+.3f}" for c, k in NOISE_KEYS.items()}
    return extra | {"candidate": r["name"], "dims": str(r["dims"]), "xg cos": _mean(m.get("xg_family")),
            "xg lift": _pm(m.get("xg_family_lift"), True), "lift primary": _mean(m.get("xg_primary_lift"), True),
            "lift strict": _mean(m.get("xg_strict_lift"), True), "lift disjoint": _mean(m.get("xg_disjoint_lift"), True),
            "out primary": _mean(m["out_primary"]), "out family": _pm(m["out_family"]),
            "families /list": f"{m['n_families']['mean']:.2f}",
            "cross out cos (n)": f"{q['cross_out_cos']['mean']:.3f} ({q['cross_out_cos']['n']:.1f})",
            "cross in cos (n)": f"{q['cross_in_cos']['mean']:.3f} ({q['cross_in_cos']['n']:.1f})",
            "cross out lift": _pm(q["cross_out_lift"], True), "desc_cos": _mean(m.get("desc_cos")),
            "desc_cos_xa": _pm(m["desc_cos_xa"]), "primary_xa": _mean(m["genre_primary_xa"]),
            "probe": "–" if r["probe"] is None else f"{r['probe']:.3f}", "hub skew": f"{r['hubness']['skew']:.2f}",
            "never": f"{r['hubness']['never']:.3f}", "feel_mad": _mean(m.get("feel_mad"))}


def table(res: dict[str, dict], names: list[str], cols: list[str], curve: dict | None = None) -> list[str]:
    return _table(cols, [[_cells(res[n], curve)[c] for c in cols] for n in names if n in res])


def diff_table(res: dict[str, dict], names: list[str], ref: str, b: simbench.Bench) -> list[str]:
    keys = ("xg_family", "xg_primary", "out_family", "out_primary", "desc_cos_xa", "genre_primary_xa")
    rows = []
    for n in names:
        if n in res and n != ref:
            s = res[n]["seeds"]
            rows.append([n, *(_star(summarise(s[k] - res[ref]["seeds"][k], b)) if k in s else "–" for k in keys)])
    return _table(["candidate", *keys], rows)


def load_results(pool: str) -> dict[str, dict]:
    names = dict.fromkeys(CONTROLS + [n for sec in candidates(pool).values() for n in sec])
    return {n: run_one(n, pool) for n in names if (SCRATCH / pool / f"{_safe(n)}.json").exists()}


INTRO = """# Cross-genre benchmark for the sonic stop

Does an audio block's neighbour list reach outside the seed's genre while still agreeing on how the
music feels? Every number is on the audio block alone, euclidean top 10, the seed artist's other
albums removed from the candidates (except `desc_cos`, which keeps them, as simbench does).

**Measures.** `xg cos`: rank only the albums outside the seed's genre family, take the top 10, mean RYM
descriptor cosine with the seed. `xg lift`: that minus the seed's floor, the mean cosine over every
out-of-family album (what a random out-of-family pick scores). `lift primary / strict / disjoint`: the
same with "outside" meaning another primary genre / another family and no RYM genre in common / no
family in common among any of the two albums' genres. `out primary`, `out family`, `families /list`:
how far the plain top 10 reaches. `cross out cos (n)` / `cross in cos (n)`: descriptor cosine of the
out-of-family / in-family members of the plain top 10 (n = members per list); `cross out lift`: the
out-of-family members' cosine minus their seed's out-of-family floor. `probe`: out-of-fold accuracy of
a linear classifier predicting the genre family from the block. `hub skew`, `never`: hubness.
Cells `a ±b`: mean and half-width of the 95% CI (bootstrap over artists); `*` in difference tables: the
paired CI excludes 0.

**How to read it.** `xg lift` and `out family` trade off. `xg lift` asks "if forced out of the genre, are
the picks good?" and does not reward leaving; `out family` says how often the plain list leaves and
does not ask whether the leavers are good; `cross out lift` joins the two for the plain list (the
quality of the crossings that actually happen). The controls show the failure the pair guards against:
`random` and `shuffled` leave the family almost always and sit at lift 0.

**Caveats.** Every measure is an RYM proxy. RYM descriptors correlate with genre, so a representation
that leaves the genre loses descriptor agreement partly by construction, and the out-of-family floor
is lower than the overall one. Families are a regex over RYM genre names (genres.py): "Jazz-Rock" is in
the jazz family, so Bitches Brew -> Embryo's Rocksession is not a family crossing, only a primary-genre
one. Lists are the real test.

**Fitting.** Anything fitted with RYM genres or Spotify columns is out of fold by artist; the PCA is
fitted on the pool. `famoracle` needs the album's RYM genre at run time and is shown as an upper bound
only. Names are explained in crossgenre.py's docstring.
"""


def report() -> None:
    out, js = [INTRO], {}
    notes = HERE / "crossgenre_findings.md"
    if notes.exists():
        out += [notes.read_text(encoding="utf-8")]
    titles = {"bakeoff": "1,000 bake-off albums, 2 clips per album, the same clips for every model",
              "full": "Full pool: 3,944 albums, 4 clips per album (EffNet, MusiCNN, Essentia scalars)",
              "fullclap": "CLAP on the full pool: the albums with a CLAP vector, 4 clips per album, EffNet on the same albums"}
    for pool in POOLS:
        res = load_results(pool)
        if not res:
            continue
        xb, sec = xbench(source(pool).rows), candidates(pool)
        fam = xb.fam[xb.fam >= 0]
        share = np.bincount(fam) / len(fam)
        js[pool] = {"albums": len(xb.fam), "majority_family_share": round(float(share.max()), 4),
                    "floor": {s: round(float(np.nanmean(v)), 4) for s, v in xb.floor.items()},
                    "candidates": {n: {k: r[k] for k in ("dims", "metrics", "ratios", "hubness", "probe")}
                                   for n, r in res.items()},
                    "diff_vs_effnet64": {n: {k: summarise(r["seeds"][k] - res["effnet/64"]["seeds"][k], xb.b)
                                             for k in ("xg_family", "xg_primary", "out_family", "out_primary",
                                                       "desc_cos_xa", "genre_primary_xa") if k in r["seeds"]}
                                         for n, r in res.items() if n != "effnet/64"}}
        curve = noise_curve(res, sec["noise"])
        js[pool]["predicted_family_accuracy"] = {e: predicted_family(pool, e.split("/")[0])[1] for e in dict.fromkeys(
            f.partition("~")[0] for f in sec.get("forced", []) if f in res and f.endswith("p"))}
        wide = lambda names: table(res, names, WIDE, curve)  # noqa: E731
        short = lambda names: table(res, names, SHORT, curve)  # noqa: E731
        out += [f"## {titles[pool]}", "",
                f"{len(xb.fam)} albums, {len(np.unique(xb.b.artist))} artists. Mean out-of-genre floor of the descriptor "
                f"cosine: family {js[pool]['floor']['family']:.3f}, primary {js[pool]['floor']['primary']:.3f}, strict "
                f"{js[pool]['floor']['strict']:.3f}, disjoint {js[pool]['floor']['disjoint']:.3f}. Largest family: "
                f"{share.max():.3f} of the albums (the probe's majority-class accuracy). A random list has "
                f"{1 - (share ** 2).sum():.3f} of its members outside the seed's family.", ""]
        if pool == "fullclap":
            left = np.setdiff1d(source("full").rows, source(pool).rows)
            js[pool]["not_covered_rows"] = left.tolist()
            out += [f"`clap_music` = laion/larger_clap_music_and_speech over the catalog's clips (clap_catalog.py), the same "
                    f"recipe as every embedding: album mean over the clips, L2, PCA. {len(left)} of the full pool's "
                    f"{len(source('full').rows)} albums have no CLAP vector (their previews were gone from the store's "
                    "listing when CLAP was run) and are left out for every model here, so `effnet/64` below is refitted "
                    "and scored on these albums only: the like-for-like reference. `clap_music-inlp1/64` is fitted with "
                    "RYM families, out of fold by artist. The noise curve is this pool's own.", "",
                    "### Models and controls", "", *wide(CONTROLS + sec["models"] + sec["combos"]),
                    "Paired difference against effnet/64:", "",
                    *diff_table(res, sec["models"] + sec["combos"], "effnet/64", xb.b),
                    "### Noise control on these albums", "", *short(["effnet/64"] + sec["noise"] + ["random"])]
            continue
        out += ["### Models and controls", "", *wide(CONTROLS + sec["models"]),
                "Paired difference against effnet/64:", "",
                *diff_table(res, sec["models"] + sec["removal"] + sec["head"], "effnet/64", xb.b)]
        js[pool]["head_check"] = hc = head_check(pool)
        if "mert_layers" in sec:
            out += ["### MERT by layer (PCA 64)", "", *short(sec["mert_layers"] + ["mert_early/64", "mert_earlycat/64", "mert_mid/64",
                                                                               "mert_late/64"])]
        out += ["### EffNet with the genre removed, fitted with RYM families (out of fold by artist)", "",
                *wide(["effnet/64"] + sec["removal"]),
                "### EffNet with the Discogs-400 layer's directions projected out (no RYM labels)", "",
                f"The layer is linear on the embedding (activations = sigmoid(W e + b), checked against the graph's own "
                f"outputs: graphdef.verify) and W has rank {hc['rank']}. Share of the album vectors' variance inside the "
                "top-r directions: " + ", ".join(f"r={r} {v:.3f}" for r, v in hc["variance_share"].items()) + ". After r = 400 "
                f"the 400 Discogs logits no longer vary across albums (largest |W v| {hc['logit_max_abs_after_400']:.1e}; "
                f"their mean standard deviation before: {hc['logit_std_before']:.3f}), yet the RYM-family probe is unchanged. "
                "`headonly400` keeps only those 400 directions.", "",
                *wide(["effnet/64"] + sec["head"]),
                "### Blends: share of the block's total variance on the feel part", "",
                "`spotify` is the old site's block, the 13 Spotify columns themselves: a reference row, not an audio "
                "candidate.", "",
                *short(["effnet/64"] + sec["blends"]),
                "### Combinations", "", *short(["effnet/64"] + sec["combos"]),
                "Paired difference against effnet/64:", "", *diff_table(res, sec["combos"], "effnet/64", xb.b),
                "### Descriptor-supervised projection (beyond the brief's list)", "",
                "The album vector replaced by a Ridge prediction of its RYM descriptor weights, out of fold by artist. "
                "It needs no label at run time, but it is trained towards the labels `desc_cos` is measured with, so "
                "these rows are not on equal footing with the others.", "",
                *short(["effnet/64"] + sec["ndesc"]),
                "Paired difference against effnet/64:", "", *diff_table(res, sec["ndesc"], "effnet/64", xb.b),
                "### MMR re-ranking of effnet/64 (changes the ranking rule; list-based measures only)", "",
                f"Candidates: the seed's {MMR_POOL} nearest; lambda = 1 is the plain list.", "",
                *short(["effnet/64"] + sec["mmr"]),
                "### Forced crossing: 5 of the 10 outside the seed's family (changes the ranking rule; list-based "
                "measures only)", "",
                "The plain top 10, with its furthest in-family members replaced by the nearest out-of-family albums "
                "until 5 are outside; lists that already have 5 are untouched. `~x5`: outside by the RYM family, which "
                "needs the RYM genre at run time (a reference, not a qualifying candidate; a seed or candidate without "
                f"RYM genres is never outside: {int((xb.fam < 0).sum())} albums, whose lists stay plain). `~x5p`: outside "
                "by the family predicted from the candidate's own embedding, for seed and candidates alike (fampred's "
                "classifier, argmax, out of fold by artist; accuracy over the albums with a genre: "
                + ", ".join(f"{e} {a:.3f}" for e, a in js[pool]["predicted_family_accuracy"].items()) + "). `out family` "
                "and the cosines are always measured with the true RYM family.", "",
                *table(res, list(dict.fromkeys(n for f in sec["forced"] for n in (f.partition("~")[0], f)))
                       + ["effnet/64~mmr0.5"], FORCED_COLS, curve),
                "Paired difference against the same embedding's plain list:", "",
                *[l for e in dict.fromkeys(f.partition("~")[0] for f in sec["forced"])
                  for l in diff_table(res, [f for f in sec["forced"] if f.startswith(e + "~")]
                                      + ["effnet/64~mmr0.5"] * (e == "effnet/64"), e, xb.b)],
                "### Noise control: effnet/64 with a share of its variance replaced by gaussian noise", "",
                "The reference for the trade-off: reach bought by being partly random. `lift vs noise` and `desc_xa vs "
                "noise` in every table are the candidate's xg lift / desc_cos_xa minus this curve's value (linear "
                "interpolation) at the candidate's own `out family`. No CI; the curve's points carry about ±0.01.", "",
                *short(["effnet/64"] + sec["noise"] + ["random"])]
    hold = SCRATCH / "holdout.json"
    if hold.exists():
        js["holdout"] = json.loads(hold.read_text())
        out += ["## New-album test", "",
                "Every step of the candidate (genre removal, scalers, PCA, block weights) fitted on 80% of the artists; "
                "the held-out 20% are mapped with that transform and query the whole pool mapped the same way; five "
                "folds, so every album is held out once. `in fit`: every step fitted on every album. `oof`: the tables "
                "above. `same lists`: share of the in-fit top 10 the held-out transform returns.", ""]
        for h in js["holdout"]:
            out += [f"### {h['name']} ({h['pool']} pool; same lists {_pm(h['same_lists'])})", "",
                    *_table(["metric", "in fit", "held out", "oof (tables above)", "held out − in fit"], [
                        [m, _pm(v["in_fit"]), _pm(v["held_out"]), _pm(v["oof"]), _star(v["diff"])]
                        for m, v in h["metrics"].items()])]
    anc = SCRATCH / "anchor.json"
    if anc.exists():
        js["anchor"] = a = json.loads(anc.read_text())
        out += ["## Anchor: Miles Davis — Bitches Brew", "",
                f"In the bake-off pool: {a['bakeoff_present']}. So CLAP and MERT cannot be shown for this seed; the lists "
                f"below are on the full pool. Seed genres: {', '.join(a['seed_genres'])}. Lists keep the seed's artist, "
                "as the site does. Rank = position among all 3,943 other albums.", ""]
        for name, l in a["lists"].items():
            out += [f"**{name}** — ranks: " + "; ".join(f"{t.split(' — ')[1]} {r}" for t, r in l["ranks"].items())
                    + f". Prog rock in the top 10: {', '.join(l['prog_rock']) or 'none'}.", "",
                    *[f"{i + 1}. {t}" for i, t in enumerate(l["top"])], ""]
    bal = SCRATCH / "balanced.json"
    if bal.exists():
        js["balanced"] = bl = json.loads(bal.read_text())
        cols = [m for m in BAL if all(m in c["metrics"] for c in bl["candidates"].values())]
        hub = [f"{c} {k}" for c in ("audio", "balanced") for k in ("skew", "never", "max")]
        out += [f"## Balanced stop, hubness and artist retrieval ({bl['pool']} pool, {bl['albums']} albums)", "",
                "simbench.score on the same blocks. `bal_*`: the block scaled to the Spotify block's total variance and "
                "joined to the descriptors as the site's balanced stop does; `bal_overlap_A`: overlap@10 with the "
                "Spotify block's balanced lists. Hubness: skew of N10, share of albums in no list and the largest N10, "
                "on the block alone and at the balanced stop. `artist_mrr`, `artist_share`: same artist kept. "
                "`stability`: overlap@10 of the lists built from 2 and from 4 clips per album.", "",
                *_table(["candidate", *cols, *hub], [
                    [n, *(_pm(c["metrics"][m]) for m in cols),
                     *(f"{c['hubness'][a][k]:.3g}" for a in ("audio", "balanced") for k in ("skew", "never", "max"))]
                    for n, c in bl["candidates"].items()]),
                f"Paired difference against {bl['ref']}:", "",
                *_table(["candidate", *cols], [[n, *(_star(d[m]) for m in cols)] for n, d in bl["diff"].items()])]
    for pool in POOLS:
        anc = SCRATCH / f"anchor_{pool}.json"
        if not anc.exists():
            continue
        js[f"anchor_{pool}"] = a = json.loads(anc.read_text())
        n = len(source(pool).rows)
        out += [f"## Anchor on the {pool} pool: Miles Davis — Bitches Brew", "",
                f"Sonic = the block alone; balanced = the block joined to the descriptors at the site's balanced stop. "
                f"Both keep the seed's artist. Each entry: [primary genre; family; descriptor cosine with the seed]. "
                f"Rank = position among the {n - 1:,} other albums by the block alone.", ""]
        for name, l in a["lists"].items():
            item = lambda t, f, c: f"{t[:-1]}; {f}; {'–' if c is None else f'{c:.2f}'}]"  # noqa: E731
            out += [f"**{name}, sonic** — ranks: " + "; ".join(f"{t.split(' — ')[1]} {r}" for t, r in l["ranks"].items())
                    + f"; first rock-family album {l['first']['rock_family']}; first outside the jazz family "
                    f"{l['first']['non_jazz_family']}. Prog rock in the top 10: {', '.join(l['prog_rock']) or 'none'}.", "",
                    *[f"{i + 1}. {item(*x)}" for i, x in enumerate(zip(l["top"], l["families"], l["desc_cos"]))], ""]
            if "balanced" in l:
                lb = l["balanced"]
                out += [f"**{name}, balanced stop**", "",
                        *[f"{i + 1}. {item(*x)}" for i, x in enumerate(zip(lb["top"], lb["families"], lb["desc_cos"]))], ""]
    (RESULTS / "crossgenre.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    (RESULTS / "crossgenre.json").write_text(json.dumps(js) + "\n", encoding="utf-8")
    print(f"wrote {RESULTS / 'crossgenre.md'}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("cmd", choices=["run", "holdout", "anchor", "balanced", "report"])
    p.add_argument("--pool", default="bakeoff", choices=list(POOLS))
    p.add_argument("--only", help="regex on candidate names")
    p.add_argument("--names", default="", help="comma-separated candidate names (holdout, anchor, balanced)")
    args = p.parse_args()
    names = [n for n in args.names.split(",") if n]
    SCRATCH.mkdir(exist_ok=True)
    if args.cmd == "run":
        run(args.pool, args.only)
    elif args.cmd == "holdout":
        path = SCRATCH / "holdout.json"
        done = {(h["name"], h["pool"]): h for h in (json.loads(path.read_text()) if path.exists() else [])}
        for n in names:
            done[n, args.pool] = holdout(n, args.pool)
            path.write_text(json.dumps(list(done.values()), indent=1))
    elif args.cmd == "anchor" and args.pool.startswith("fullclap"):
        a = anchor(names, args.pool)
        (SCRATCH / f"anchor_{args.pool}.json").write_text(json.dumps(a, indent=1))
        print(json.dumps(a, indent=1, ensure_ascii=False))
    elif args.cmd == "anchor":
        a = anchor(names, "full")
        a["bakeoff_present"] = anchor([], "bakeoff")["present"]
        (SCRATCH / "anchor.json").write_text(json.dumps(a, indent=1))
        print(json.dumps(a, indent=1, ensure_ascii=False))
    elif args.cmd == "balanced":
        res = balanced(names, args.pool)
        (SCRATCH / "balanced.json").write_text(json.dumps(res, indent=1))
        print(json.dumps(res, indent=1))
    else:
        report()


if __name__ == "__main__":
    main()
