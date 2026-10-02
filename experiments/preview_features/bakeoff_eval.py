"""First evaluation of the embedding bake-off: neighbour coherence of every model on the same
albums and tracks.

CLI: python bakeoff_eval.py [--tracks 2] [--models a,b,...] [--concat a+b,c+d] [--ref effnet/pca24]
                            [--out results/bakeoff_eval]      -> .md and .json

Every model's album vector is the mean of its per-track embeddings over the tracks all models
share (bakeoff.bakeoff_load), then one of
  /pca24   L2-normalise, centre, top 24 principal components (variants.pca_scores: the recipe the
           site candidate uses), euclidean top 10
  /cos     L2-normalise only: euclidean on unit vectors = cosine ranking in the raw space
  a+b      concatenation of the two /pca24 blocks, each scaled to unit total variance
Metrics, floors and confidence intervals are simbench.py's (score, compare): share of the top 10
with the seed's primary genre / any genre / genre family, descriptor cosine, the same with the seed
artist's other albums removed (_xa), same-artist share, hubness; 95% CIs by bootstrap over artists,
paired for the differences against --ref.
"""
import argparse
import json
from pathlib import Path

import numpy as np

import simbench
from bakeoff import CACHED, MERT_VIEWS, bakeoff_load, stored_models
from common import RESULTS, load_albums
from variants import pca_scores

COLS = ("genre_primary", "genre_any", "genre_family", "desc_cos", "artist_share", "genre_primary_xa",
        "genre_family_xa", "desc_cos_xa", "fam_desc_cos")


def unit_block(X: np.ndarray) -> np.ndarray:
    """Centre and scale a block to total variance 1, so concatenated blocks weigh the same."""
    X = X - X.mean(axis=0)
    return X / np.sqrt(X.var(axis=0).sum())


def load(models: list[str], tracks: int) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """(rows, model -> album means aligned to rows) over the tracks every stored base model has."""
    base = sorted({"mert" if m in MERT_VIEWS else m for m in models} - set(CACHED))
    loaded = {m: bakeoff_load(m, prio_below=tracks, models=base) for m in models}
    rows = np.sort(load_albums()["row"].to_numpy())
    for r, _ in loaded.values():
        rows = np.intersect1d(rows, r)
    return rows, {m: X[np.searchsorted(r, rows)].astype(np.float64) for m, (r, X) in loaded.items()}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--tracks", type=int, default=2)
    p.add_argument("--models", default=None, help="default: effnet, musicnn and everything stored (mert as mert_mid, mert_mean)")
    p.add_argument("--concat", default="", help="pairs to concatenate, e.g. effnet+artist_1280,effnet+clap")
    p.add_argument("--ref", default="effnet/pca24")
    p.add_argument("--out", type=Path, default=RESULTS / "bakeoff_eval")
    args = p.parse_args()
    if args.models:
        models = args.models.split(",")
    else:
        stored = stored_models()
        models = ["effnet", "musicnn"] + [m for m in stored if m != "mert"] + (["mert_mid", "mert_mean"] if "mert" in stored else [])
    rows, X = load(models, args.tracks)
    reps = {}
    for m in models:
        reps[f"{m}/pca24"] = pca_scores(X[m], 24)
        reps[f"{m}/cos"] = X[m] / np.linalg.norm(X[m], axis=1, keepdims=True)
    for pair in filter(None, args.concat.split(",")):
        reps[pair] = np.hstack([unit_block(reps[f"{m}/pca24"]) for m in pair.split("+")])
    results = {name: simbench.score(Z, rows, name=name) for name, Z in reps.items()}
    results["random"] = simbench.floor(rows)
    diffs = simbench.compare(results, args.ref, rows)

    b = simbench.bench(rows)
    cell = lambda m: "–" if m is None else f"{m['mean']:.3f} ±{(m['ci'][1] - m['ci'][0]) / 2:.3f}"  # noqa: E731
    star = lambda m: "–" if m is None else f"{m['mean']:+.3f}" + "*" * (m["ci"][0] > 0 or m["ci"][1] < 0)  # noqa: E731
    md = [f"# Embedding bake-off: neighbour coherence", "",
          f"{len(rows)} albums ({len(np.unique(b.artist))} artists; {int(b.same_artist.any(axis=1).sum())} with another "
          f"album by the same artist in the pool), {args.tracks} tracks per album, the same tracks for every model. "
          "Euclidean top 10 within the pool. Cells: mean ±half-width of the 95% CI (bootstrap over artists). "
          "`_xa`: the seed artist's other albums removed. `fam_desc_cos`: ranking within the seed's genre family. "
          "`random` = floor.", "",
          *simbench._table(["representation", "dims", *COLS, "hub skew"], [
              [n, str(r["dims"]), *(cell(r["metrics"].get(m)) for m in COLS), f"{r['hubness']['audio']['skew']:.2f}"]
              for n, r in results.items()]),
          f"## Difference against {args.ref} (paired; * = 95% CI excludes 0)", "",
          *simbench._table(["representation", *COLS], [[n, *(star(d.get(m)) for m in COLS)] for n, d in diffs.items()])]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.with_suffix(".md").write_text("\n".join(md) + "\n", encoding="utf-8")
    args.out.with_suffix(".json").write_text(json.dumps({
        "albums": len(rows), "tracks_per_album": args.tracks, "ref": args.ref,
        "metrics": {n: {"dims": r["dims"], "hubness": r["hubness"]["audio"], **r["metrics"]} for n, r in results.items()},
        "diff_vs_ref": diffs}, indent=1) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
