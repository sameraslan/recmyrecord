"""Similarity benchmark: does an album representation put albums that sound alike next to each other?

CLI: python simbench.py [--reps A,Ball,Cvm,D24,Dn24,E,F,D24~mp] [--ref D24] [--rows FILE] [--out DIR]
                       [--bakeoff MODEL,...]
     -> simbench.{md,json}, or simbench_bakeoff.{md,json} (default cache/partial/learned/)

`score(X, rows, name=...)` takes any album-level matrix aligned to `rows` (ascending `row` of
all_data_norm.pkl) and ranks neighbours as the recommender does: euclidean, top 10. Per seed,
on the audio block alone unless noted:
  genre_primary / genre_any / genre_family   share of the top 10 sharing the seed's primary RYM
                   genre / any genre / the primary genre's coarse family
  desc_cos         mean cosine between the seed's 120 descriptor weights and its neighbours',
                   over albums with at least MIN_DESC descriptors (seed and neighbour)
  *_xa             the same after removing the seed artist's other albums from the candidates
  artist_share / artist_mrr   seeds whose (cleaned) artist has another album in the pool: share
                   of the top 10 by that artist, reciprocal rank of the first one. Label-free.
  fam_desc_cos / fam_genre_primary   ranking restricted to the seed's own genre family (families
                   of at least MIN_FAMILY albums, same artist removed): does the space order
                   albums within a genre, or only separate genres?
  feel_mad         mean |difference| between seed and neighbours on the z-scored Spotify columns
                   FEEL (lower = closer; sanity check, not a target). Albums carrying another
                   record's Spotify features are skipped.
  stability        overlap@10 between the lists built from 2 and from 4 tracks per album
                   (needs `build`, a callable tracks -> matrix that refits the representation)
  bal_genre_primary / bal_genre_family / bal_overlap_A   at the balanced stop: the block scaled
                   to A's total variance and joined to the descriptors exactly as evaluate.py
                   does; overlap is with A's balanced lists.
Hubness (per representation, no CI): skewness of N10, the number of top-10 lists an album appears
in, and the share of albums that appear in none, on the audio block and at the balanced stop.
`rescale` (score) or a `name~ls|nicdm|mp` suffix (CLI) applies a hubness reduction to the distances
before ranking: local scaling, its non-iterative variant (the distance form of CSLS's
normalisation), or mutual proximity with the Gaussian approximation.
`--bakeoff m1,m2` scores embeddings from bakeoff.py (`bakeoff_load(model, prio_below) -> rows, X`)
with the D-recipe (L2, PCA 24) on the albums all of them cover; `effnet24` is plain effnet over
the same tracks (the like-for-like baseline; --reps variants use every cached first-pass track).
The floor of every metric is the same code run on a random representation (`random` row).
Confidence intervals are 95% percentile bootstraps over artists (albums of one artist are not
independent seeds), paired for the differences against the reference representation.
"""
import argparse
import json
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm, skew
from sklearn.metrics.pairwise import euclidean_distances

from aggregate import aggregate, load_tracks
from common import CACHE, load_albums
from evaluate import _table, coherence_matrices, matrix, overlap, row_nanmean
from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import AUDIO
from rmr_pipeline.recs import top_k_neighbours
from variants import build_variants, make_inputs, match_var, override_rows, pca_scores, total_var

OUT = CACHE / "partial" / "learned"
ROWS = OUT / "pool_rows.txt"
K = 10
MIN_DESC = 5  # descriptors an album needs to count in desc_cos (about 90% of the pool)
MIN_FAMILY = 40
TRACKS = (2, 4)  # tracks per album: stability compares the two, everything else uses the larger
N_BOOT = 1000
FEEL = ["energy", "acousticness", "valence", "danceability", "instrumentalness", "tempo"]
VARIOUS = "Various Artists"
METRICS = ("genre_primary", "genre_any", "genre_family", "desc_cos", "genre_primary_xa", "genre_family_xa",
           "desc_cos_xa", "fam_desc_cos", "fam_genre_primary", "artist_share", "artist_mrr", "feel_mad",
           "stability", "bal_genre_primary", "bal_genre_family", "bal_overlap_A")
TABLES = {"Coherence of the top 10 (audio block alone)": METRICS[:7],
          "Within-family ranking, artist retrieval, feel, stability, balanced stop": METRICS[7:]}


@dataclass
class Bench:
    """Ground truth over one pool. N×N matrices are NaN / False where a pair does not count."""
    albums: pd.DataFrame
    artist: np.ndarray  # bootstrap cluster per album: the cleaned artist, each compilation its own
    same_artist: np.ndarray
    same_family: np.ndarray  # same coarse family, families of at least MIN_FAMILY albums only
    pair: dict[str, np.ndarray]  # genre matches and descriptor cosine
    feel: np.ndarray  # z-scored FEEL columns, NaN for albums with another record's features
    desc: np.ndarray
    A: np.ndarray
    A_balanced: np.ndarray  # A's top 10 at the balanced stop
    boot: np.ndarray


def pool_rows(path: Path = ROWS) -> np.ndarray:
    """The album snapshot every run sticks to while the extractor keeps adding albums: `row` of
    the catalog albums with an analysed track among the first TRACKS[0] in priority order, minus
    the last one (possibly half done). Written on first use."""
    if not path.exists():
        tracks, _ = load_tracks()
        rows = np.unique(tracks.loc[tracks["prio"] < TRACKS[0], "row"])
        rows = np.intersect1d(rows[rows < tracks["row"].max()], load_albums()["row"])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(map(str, rows)) + "\n")
    return np.loadtxt(path, dtype=np.int64)


@lru_cache(maxsize=2)
def _bench(key: bytes) -> Bench:
    rows = np.frombuffer(key, dtype=np.int64)
    albums = load_albums()
    albums = albums[albums["row"].isin(rows)].reset_index(drop=True)
    assert np.array_equal(albums["row"], rows), "rows must be ascending rows of load_albums()"
    desc, genres, coherence = coherence_matrices(albums)
    pair = dict(coherence["audio"])
    poor = (desc > 0).sum(axis=1) < MIN_DESC
    pair["desc_cos"][poor, :] = np.nan
    pair["desc_cos"][:, poor] = np.nan

    names = [clean_artist(a) for a in albums["Artist"].astype(str)]
    artist = pd.factorize(pd.Series([f"{n}#{i}" if n == VARIOUS else n for i, n in enumerate(names)]))[0]
    same_artist = artist[:, None] == artist[None, :]
    fam = pd.factorize(genres["family"])[0]
    big = np.bincount(fam[fam >= 0])[fam] >= MIN_FAMILY
    same_family = (fam[:, None] == fam[None, :]) & (big & (fam >= 0))[:, None]
    for M in (same_artist, same_family):
        np.fill_diagonal(M, False)

    feel = albums[FEEL].to_numpy(dtype=np.float64)
    feel = (feel - feel.mean(axis=0)) / feel.std(axis=0)
    feel[albums["row"].isin(override_rows(albums)).to_numpy()] = np.nan
    A = albums[AUDIO].to_numpy(dtype=np.float64)
    n_artists = artist.max() + 1
    return Bench(albums, artist, same_artist, same_family, pair, feel, desc, A,
                 top_k_neighbours(matrix(A, desc, "balanced")),
                 np.random.default_rng(0).integers(0, n_artists, (N_BOOT, n_artists)))


def bench(rows: np.ndarray) -> Bench:
    """The ground truth for a pool (cached)."""
    return _bench(np.ascontiguousarray(rows, dtype=np.int64).tobytes())


def distances(X: np.ndarray) -> np.ndarray:
    """Squared euclidean distances on the recommender's float32 matrix; self = inf."""
    D = euclidean_distances(X.astype(np.float32).astype(np.float64), squared=True).astype(np.float32)
    np.fill_diagonal(D, np.inf)
    return D


def nearest(D: np.ndarray, allowed: np.ndarray | None = None, k: int = K) -> np.ndarray:
    """Each seed's k nearest albums, nearest first, among the `allowed` pairs (default: all)."""
    if allowed is not None:
        D = np.where(allowed, D, np.inf)
    part = np.argpartition(D, k, axis=1)[:, :k]
    return np.take_along_axis(part, np.argsort(np.take_along_axis(D, part, axis=1), axis=1), axis=1)


def _knn_scale(D: np.ndarray, mean: bool) -> np.ndarray:
    """Per album, the distance to its K-th neighbour, or the mean distance to its K nearest."""
    near = np.sqrt(np.partition(D, K - 1, axis=1)[:, :K])
    return near.mean(axis=1) if mean else near.max(axis=1)


def local_scaling(D: np.ndarray) -> np.ndarray:
    """d² / (s_x s_y), s = distance to the K-th neighbour (monotone in Zelnik-Manor & Perona's LS)."""
    s = _knn_scale(D, mean=False)
    return D / (s[:, None] * s[None, :])


def nicdm(D: np.ndarray) -> np.ndarray:
    """d / sqrt(m_x m_y), m = mean distance to the K nearest (non-iterative contextual dissimilarity)."""
    m = _knn_scale(D, mean=True)
    return np.sqrt(D) / np.sqrt(m[:, None] * m[None, :])


def mutual_proximity(D: np.ndarray) -> np.ndarray:
    """1 - P(X > d_xy) P(Y > d_yx) with each album's distances to the others taken as Gaussian."""
    d = np.sqrt(D)
    finite = np.where(np.isfinite(d), d, np.nan)
    z = (d - np.nanmean(finite, axis=1, keepdims=True)) / np.nanstd(finite, axis=1, keepdims=True)
    out = (1 - norm.sf(z) * norm.sf(z.T)).astype(np.float32)
    np.fill_diagonal(out, np.inf)
    return out


RESCALE = {"ls": local_scaling, "nicdm": nicdm, "mp": mutual_proximity}


def hubness(nbrs: np.ndarray) -> dict:
    """Skewness of N10 (how many lists each album is in) and the share of albums in no list."""
    n10 = np.bincount(nbrs.ravel(), minlength=len(nbrs))
    return {"skew": round(float(skew(n10)), 3), "never": round(float((n10 == 0).mean()), 4), "max": int(n10.max())}


def summarise(v: np.ndarray, b: Bench) -> dict:
    """Mean over the seeds where `v` is defined and its bootstrap CI, resampling artists."""
    ok = ~np.isnan(v)
    n = b.boot.shape[1]
    total, count = np.bincount(b.artist, np.where(ok, v, 0), n), np.bincount(b.artist, ok, n)
    with np.errstate(invalid="ignore"):
        lo, hi = np.nanpercentile(total[b.boot].sum(axis=1) / count[b.boot].sum(axis=1), [2.5, 97.5])
    return {"mean": round(float(v[ok].mean()), 4), "ci": [round(float(lo), 4), round(float(hi), 4)], "n": int(ok.sum())}


def score(X: np.ndarray | None, rows: np.ndarray, *, name: str, build=None, rescale: str | None = None) -> dict:
    """Every metric for one representation: `metrics` (mean, ci, n per metric), `hubness` and
    `seeds` (the per-seed values, NaN where a metric does not apply). `X` is (albums, d) aligned
    to `rows`; `build(tracks) -> X` refits it from that many tracks per album (adds stability,
    and stands in for X when X is None); `rescale` names a hubness reduction (RESCALE)."""
    b = bench(rows)
    X = build(TRACKS[1]) if X is None else X
    assert len(X) == len(rows) and np.isfinite(X).all(), name
    fix = RESCALE[rescale] if rescale else lambda D: D
    D = fix(distances(X))
    nbrs = nearest(D)
    xa = nearest(D, ~b.same_artist)
    fam = nearest(D, b.same_family & ~b.same_artist)
    in_family, has_other = b.same_family.any(axis=1), b.same_artist.any(axis=1)
    balanced = nearest(fix(distances(matrix(match_var(X, total_var(b.A)), b.desc, "balanced"))))

    def take(metric: str, lists: np.ndarray) -> np.ndarray:
        return row_nanmean(np.take_along_axis(b.pair[metric], lists, axis=1))

    first = np.where(b.same_artist, D, np.inf).min(axis=1, keepdims=True)
    v = {m: take(m, nbrs) for m in METRICS[:4]}
    v |= {m + "_xa": take(m, xa) for m in ("genre_primary", "genre_family", "desc_cos")}
    v |= {"fam_" + m: np.where(in_family, take(m, fam), np.nan) for m in ("desc_cos", "genre_primary")}
    v["artist_share"] = np.where(has_other, np.take_along_axis(b.same_artist, nbrs, axis=1).mean(axis=1), np.nan)
    v["artist_mrr"] = np.where(has_other, 1 / ((D < first).sum(axis=1) + 1), np.nan)
    v["feel_mad"] = row_nanmean(np.abs(b.feel[nbrs] - b.feel[:, None, :]).reshape(len(X), -1))
    v["stability"] = overlap(nearest(fix(distances(build(TRACKS[0])))), nbrs) if build else np.full(len(X), np.nan)
    v |= {"bal_" + m: take(m, balanced) for m in ("genre_primary", "genre_family")}
    v["bal_overlap_A"] = np.where(np.isnan(b.feel[:, 0]), np.nan, overlap(balanced, b.A_balanced))
    v = {m: v[m].astype(np.float64) for m in METRICS}
    return {"name": name, "dims": int(X.shape[1]), "seeds": v,
            "hubness": {"audio": hubness(nbrs), "balanced": hubness(balanced)},
            "metrics": {m: summarise(x, b) for m, x in v.items() if not np.isnan(x).all()}}


def floor(rows: np.ndarray) -> dict:
    """The random-neighbour floor: score() on a random representation."""
    return score(np.random.default_rng(0).normal(size=(len(rows), 8)), rows, name="random")


def variant_builders(rows: np.ndarray, names: list[str], seed: int = 0) -> dict:
    """name -> build(tracks) for the audio blocks of variants.py, refitted per track count on `rows`."""
    @lru_cache(maxsize=None)
    def blocks(k: int) -> dict:
        inp = make_inputs(*aggregate(prio_below=k), rows)
        assert np.array_equal(inp.albums["row"], rows)
        return build_variants(inp, seed)[0]

    return {n: (lambda k, n=n: blocks(k)[n.split("~")[0]]) for n in names}


def bakeoff_albums(models: list[str], rows: np.ndarray) -> tuple[np.ndarray, dict, bool]:
    """The albums of `rows` every bakeoff model covers at both track counts, model -> load(tracks)
    -> its (albums, d) album means aligned to them, and whether TRACKS[1] tracks give other
    vectors than TRACKS[0] (if the bake-off analysed no more, stability would be 1 by construction)."""
    from bakeoff import bakeoff_load  # written by the bake-off; fails until cache/bakeoff.sqlite exists
    loaded = {(m, k): bakeoff_load(m, prio_below=k) for m in models for k in TRACKS}
    for r, _ in loaded.values():
        rows = np.intersect1d(rows, r)

    def load(m: str, k: int) -> np.ndarray:
        r, X = loaded[m, k]
        order = np.argsort(r)
        return np.asarray(X, dtype=np.float64)[order[np.searchsorted(r[order], rows)]]

    deeper = not np.array_equal(load(models[0], TRACKS[0]), load(models[0], TRACKS[1]))
    return rows, {m: (lambda k, m=m: load(m, k)) for m in models}, deeper


def run(builders: dict, rows: np.ndarray, fixed: tuple[str, ...] = ("A",)) -> dict[str, dict]:
    """score() for every builder, plus the floor. `fixed` names do not depend on the tracks; a
    `name~rescale` builder is scored with that hubness reduction."""
    out = {}
    for name, build in builders.items():
        t0 = time.time()
        out[name] = score(build(TRACKS[1]), rows, name=name, build=None if name.split("~")[0] in fixed else build,
                          rescale=name.partition("~")[2] or None)
        print(f"{name}: {time.time() - t0:.1f}s", flush=True)
    return out | {"random": floor(rows)}


def compare(results: dict[str, dict], ref: str, rows: np.ndarray) -> dict:
    """Paired difference of every metric against `ref`, per representation."""
    b, base = bench(rows), results[ref]["seeds"]
    return {name: {m: summarise(r["seeds"][m] - base[m], b) for m in r["metrics"] if m in results[ref]["metrics"]}
            for name, r in results.items() if name not in (ref, "random")}


def report(results: dict[str, dict], diffs: dict, ref: str, rows: np.ndarray, title: str = "Similarity benchmark") -> str:
    """Markdown: `mean ±half-CI` per metric, then the differences against `ref` (* = CI excludes 0)."""
    b = bench(rows)
    out = [f"# {title}", "",
           f"{len(rows)} albums ({len(np.unique(b.artist))} artists; {int(b.same_artist.any(axis=1).sum())} albums "
           f"whose artist has another album in the pool; {int(b.same_family.any(axis=1).sum())} in families of "
           f"{MIN_FAMILY}+), up to {TRACKS[1]} tracks per album (stability: {TRACKS[0]} vs {TRACKS[1]}). Euclidean top {K}. "
           f"desc_cos: albums with {MIN_DESC}+ descriptors. `random` = floor. Cells: mean ±half-width of the 95% CI "
           "(bootstrap over artists). feel_mad: lower is closer.", ""]
    cell = lambda m: "–" if m is None else f"{m['mean']:.3f} ±{(m['ci'][1] - m['ci'][0]) / 2:.3f}"  # noqa: E731
    for head, cols in TABLES.items():
        out += [f"## {head}", "", *_table(["representation", "dims", *cols], [
            [n, str(r["dims"]), *(cell(r["metrics"].get(m)) for m in cols)] for n, r in results.items()])]
    out += ["## Hubness (N10 = number of top-10 lists an album is in)", "", *_table(
        ["representation", *(f"{c} {k}" for c in ("audio", "balanced") for k in ("skew", "never", "max"))],
        [[n, *(f"{r['hubness'][c][k]:.3g}" for c in ("audio", "balanced") for k in ("skew", "never", "max"))]
         for n, r in results.items()])]
    star = lambda m: "–" if m is None else f"{m['mean']:+.3f}" + "*" * (m["ci"][0] > 0 or m["ci"][1] < 0)  # noqa: E731
    out += [f"## Difference against {ref} (paired; * = 95% CI excludes 0)", ""]
    for cols in TABLES.values():
        out += _table(["representation", *cols], [[n, *(star(d.get(m)) for m in cols)] for n, d in diffs.items()])
    return "\n".join(out)


def write(results: dict[str, dict], ref: str, rows: np.ndarray, out: Path, stem: str, extra: dict | None = None,
          title: str = "Similarity benchmark", tail: str = "") -> None:
    """`stem`.md (the report, then `tail`) and `stem`.json (plus `extra`) under `out`; per-seed
    values are not stored."""
    diffs = compare(results, ref, rows)
    out.mkdir(parents=True, exist_ok=True)
    res = {"albums": len(rows), "tracks_per_album": TRACKS[1], "min_desc": MIN_DESC, "ref": ref,
           "metrics": {n: {"dims": r["dims"], **r["metrics"]} for n, r in results.items()}, "diff_vs_ref": diffs,
           "hubness": {n: r["hubness"] for n, r in results.items()}}
    (out / f"{stem}.json").write_text(json.dumps(res | (extra or {}), indent=1) + "\n", encoding="utf-8")
    (out / f"{stem}.md").write_text(report(results, diffs, ref, rows, title) + "\n" + tail, encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--reps", default="A,Ball,Cvm,D24,Dn24,E,F", help="variants.py names")
    p.add_argument("--ref", default="D24", help="representation the differences are taken against")
    p.add_argument("--rows", type=Path, default=ROWS, help="album snapshot (written if missing)")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--bakeoff", help="bakeoff.py models to score (with effnet) next to --reps, on the albums they cover")
    args = p.parse_args()
    t0 = time.time()
    rows, extra, fixed = pool_rows(args.rows), {}, ("A",)
    if args.bakeoff:
        rows, loaders, deeper = bakeoff_albums(["effnet", *args.bakeoff.split(",")], rows)
        extra = {f"{m}24": (lambda k, load=load: pca_scores(load(k), 24)) for m, load in loaders.items()}  # D-recipe
        fixed = ("A",) if deeper else ("A", *extra)
    results = run(variant_builders(rows, args.reps.split(",")) | extra, rows, fixed)
    stem = "simbench_bakeoff" if args.bakeoff else "simbench"
    title = "Similarity benchmark" + (": bake-off models, over the tracks the bake-off analysed" if args.bakeoff else "")
    write(results, args.ref, rows, args.out, stem, {"runtime_s": round(time.time() - t0, 1)}, title)
    print(f"{len(rows)} albums, {len(results) - 1} representations, {time.time() - t0:.0f}s -> {args.out / stem}.md")


if __name__ == "__main__":
    main()
