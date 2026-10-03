"""Learning curve: how much does more training data help? (diagnostic — nothing is registered on the leaderboard)

    P="OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 15 .venv/bin/python"
    DESCRIPTOR_SHARD_LIMIT=38 $P exp_curve.py                 # -> results/learning_curve.json + table
    $P exp_curve.py --quick                                    # smoke test -> cache/quick_curve/
    $P exp_curve.py --spec clap --sizes 100 300 --repeats 5 --no-meta

Curves (all scored on the canonical validation rows, harness.eval_rows("val"), with metrics.evaluate):
  audio          the logistic probe of probes.py (probes.logreg_probe: z-scored features, C chosen by
                 out-of-fold nDCG@10 on the artist-disjoint train folds AT EACH SIZE) on one feature spec
                 (default maest:1-12, mean pooling). Sizes are capped by the train rows that have audio.
  genre_mean     baselines.genre_mean_scores (RYM genres; not available for new albums).
  mb_tags        the MusicBrainz-tag probe of exp_fusion's `meta` arm (descriptor-literal tags dropped,
                 one global feature scale, exp_fusion.cv_logreg with C from the train folds); the tag
                 vocabulary is rebuilt from each training subset. Val rows without tags get the subset's
                 label prevalence, as on the leaderboard.
  most_frequent  label prevalence of the training subset (the floor).
genre_mean / mb_tags / most_frequent need no audio, so their curves continue past the audio rows up to
all train rows.

Nesting. For each repeat (seed) the train rows are put in one fixed order and the size-n training set is
its first n rows, so the sets are nested (100 c 200 c 400 ...). The order is artist-group-aware: the
artist groups of split.py are shuffled and each group's rows stay together, so growing the set means
adding new artists (at most one group is cut at the boundary). Rows with audio come first — up to the
number of audio rows every curve is trained on exactly the same albums — then the remaining train rows.
The "all audio rows" and "all train rows" points do not depend on the order and are run once.
Label-suspect rows are never used for training. Validation is only scored; test is never touched.
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")

import argparse
import json
import time
from pathlib import Path

import numpy as np

import features as F
import harness as H
import metrics as M
from baselines import genre_lists, genre_mean_scores
from common import HERE, SEED, Y, YB, label_suspect_rows, split_rows
from probes import DEFAULT_CS, logreg_probe

SIZES = (100, 200, 400, 800, 1600)
KEYS = ("cP@10", "precision@10", "ndcg@10", "mAP")
META_CS = (1e-3, 3e-3, 1e-2, 3e-2)     # the registered meta__mb_* runs chose 0.003 from a wider grid
META_FULL_REPEATS_BELOW = 1000         # larger tag-probe subsets are fitted once (cost; their spread is small)


def nested_order(first: np.ndarray, rest: np.ndarray, seed: int) -> np.ndarray:
    """All rows of `first` (group-shuffled), then all rows of `rest` (group-shuffled). See module docstring."""
    rng = np.random.default_rng(seed)
    groups = H.artist_groups()
    out = []
    for rows in (first, rest):
        rows = np.asarray(rows, dtype=int)
        g = groups[rows]
        uniq = rng.permutation(np.unique(g))
        rank = {int(u): i for i, u in enumerate(uniq)}
        key = np.array([rank[int(x)] for x in g], dtype=float) + rng.random(len(rows))   # group order, random inside
        out.append(rows[np.argsort(key, kind="stable")])
    return np.concatenate(out)


def score(Yv: np.ndarray, S: np.ndarray) -> dict:
    ev = M.evaluate(Yv, S, k=10)
    return {k: ev[k] for k in KEYS}


def summarise(points: list[dict]) -> dict:
    """Mean / sd over the repeats of one (curve, size)."""
    out = {"n": points[0]["n"], "repeats": len(points), "n_fit": float(np.mean([p["n_fit"] for p in points])),
           "n_artist_groups": float(np.mean([p["n_groups"] for p in points]))}
    for k in KEYS:
        v = [p["metrics"][k] for p in points]
        out[k] = {"mean": float(np.mean(v)), "sd": float(np.std(v)) if len(v) > 1 else None, "values": v}
    for extra in ("C", "n_features", "val_rows_with_tags"):
        if extra in points[0]:
            out[extra] = [p[extra] for p in points]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default="maest:1-12")
    ap.add_argument("--pooling", default="mean")
    ap.add_argument("--sizes", type=int, nargs="*", default=list(SIZES))
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--no-genre", action="store_true")
    ap.add_argument("--no-meta", action="store_true")
    ap.add_argument("--quick", action="store_true", help="2 sizes, 1 repeat, small C grid, no tag probe; writes to cache/quick_curve/")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    Cs = DEFAULT_CS
    if a.quick:
        a.sizes, a.repeats, a.no_meta, Cs = [100, 200], 1, True, (1e-3, 3e-3, 1e-2)
    out_path = Path(a.out) if a.out else (HERE / "cache" / "quick_curve" if a.quick else H.RESULTS_DIR) / "learning_curve.json"
    t_start = time.perf_counter()

    d = H.get_data(a.spec, a.pooling, verbose=False)
    rows_val = H.eval_rows("val")
    Yv = Y[rows_val]
    if len(d["rows_val_missing"]):
        print(f"[curve] {len(d['rows_val_missing'])} val rows have no features for {d['spec']}: they get the subset's prevalence")
    audio_rows = d["rows_train"]
    all_rows = np.setdiff1d(split_rows("train"), label_suspect_rows())
    assert np.isin(audio_rows, all_rows).all()
    n_audio, n_all = len(audio_rows), len(all_rows)
    groups = H.artist_groups()
    print(f"[curve] {F.n_shards()} shards (DESCRIPTOR_SHARD_LIMIT={os.environ.get(F.SHARD_LIMIT_ENV)}); spec {d['spec']} / {a.pooling}; "
          f"train rows with audio {n_audio}, all train rows {n_all}, val rows {len(rows_val)}; sizes {a.sizes}, {a.repeats} repeats", flush=True)

    sizes_audio = sorted({n for n in a.sizes if n < n_audio} | {n_audio})
    sizes_label = sorted({n for n in a.sizes if n < n_all} | {n_audio, n_all})
    orders = [nested_order(audio_rows, np.setdiff1d(all_rows, audio_rows), a.seed + r) for r in range(a.repeats)]
    pos = {int(r): i for i, r in enumerate(audio_rows)}
    val_genres = genre_lists(rows_val)
    val_no_genre = np.array([len(x) == 0 for x in val_genres])

    ms = None
    if not a.no_meta:
        import exp_fusion as EF   # MetaStore (frozen copy of the metadata parquet), cv_logreg

        ms = EF.MetaStore(["musicbrainz"])
        if "musicbrainz" not in ms.sources:
            print("[curve] cache/musicbrainz.parquet not found: tag probe skipped")
            ms.close()
            ms = None
    curves: dict[str, list[dict]] = {"audio": [], "genre_mean": [], "mb_tags": [], "most_frequent": []}
    try:
        fetched = ms.fetched(["musicbrainz"]) if ms is not None else None
        for n in sizes_label:
            fixed = n in (n_audio, n_all)       # the subset is the same whatever the order
            pts: dict[str, list[dict]] = {k: [] for k in curves}
            for rep in range(1 if fixed else a.repeats):
                sub = np.sort(orders[rep][:n])
                base = {"n": int(n), "n_fit": int(n), "n_groups": int(len(np.unique(groups[sub]))), "repeat": rep}
                prev = YB[sub].mean(0)
                S_prev = np.tile(prev, (len(rows_val), 1))
                pts["most_frequent"].append({**base, "metrics": score(Yv, S_prev)})
                if not a.no_genre:
                    S = genre_mean_scores(genre_lists(sub), YB[sub], val_genres)
                    S[val_no_genre] = prev
                    pts["genre_mean"].append({**base, "metrics": score(Yv, S)})
                if n in sizes_audio:
                    t0 = time.perf_counter()
                    idx = np.array([pos[int(r)] for r in sub])
                    out = logreg_probe({"X_train": d["X_train"][idx], "Y_train": d["Y_train"][idx], "rows_train": sub,
                                        "X_val": d["X_val"], "spec": d["spec"], "pooling": a.pooling}, Cs=Cs, verbose=False)
                    S = S_prev.copy()
                    S[np.searchsorted(rows_val, d["rows_val"])] = out["S_val"]
                    pts["audio"].append({**base, "metrics": score(Yv, S), "C": out["best_C"]})
                    print(f"[curve] audio     n {n:5d} rep {rep}: cP@10 {pts['audio'][-1]['metrics']['cP@10']:.4f} "
                          f"(C={out['best_C']:g}, {time.perf_counter() - t0:.0f}s)", flush=True)
                if ms is not None and (rep == 0 or n < META_FULL_REPEATS_BELOW):
                    t0 = time.perf_counter()
                    ftr, fva = np.intersect1d(sub, fetched), np.intersect1d(rows_val, fetched)
                    X, names = ms.build(np.r_[ftr, fva], ftr, ("musicbrainz",), True)
                    cov = ms.covered(X, names)
                    cov_tr, cov_va = cov[:len(ftr)], cov[len(ftr):]
                    if cov_tr.sum() >= 50:
                        fit_rows = ftr[cov_tr]
                        r = EF.cv_logreg(X[:len(ftr)][cov_tr], Y[fit_rows], fit_rows, META_CS, ("s",), X[len(ftr):][cov_va])
                        S = S_prev.copy()
                        S[np.searchsorted(rows_val, fva[cov_va])] = r["S_eval"]
                        pts["mb_tags"].append({**base, "n_fit": int(len(fit_rows)), "metrics": score(Yv, S), "C": r["best_C"],
                                               "n_features": len(names), "val_rows_with_tags": int(cov_va.sum())})
                        print(f"[curve] mb_tags   n {n:5d} rep {rep}: cP@10 {pts['mb_tags'][-1]['metrics']['cP@10']:.4f} "
                              f"(C={r['best_C']:g}, {len(names)} features, {time.perf_counter() - t0:.0f}s)", flush=True)
            for k, v in pts.items():
                if v:
                    curves[k].append(summarise(v))
    finally:
        if ms is not None:
            ms.close()

    res = {
        "what": "validation metrics of models trained on nested, artist-group-aware subsets of the train rows (see exp_curve.py)",
        "snapshot": {"n_shards": F.n_shards(), "shard_limit_env": os.environ.get(F.SHARD_LIMIT_ENV),
                     "n_albums_extracted": len(F.album_index()), "n_train_audio": int(n_audio), "n_train_all": int(n_all),
                     "n_val": int(len(rows_val))},
        "spec": d["spec"], "pooling": a.pooling, "sizes": a.sizes, "repeats": a.repeats, "seed": a.seed,
        "audio_C_grid": list(Cs), "mb_tags_C_grid": list(META_CS), "mb_tags_repeats_note":
            f"sizes >= {META_FULL_REPEATS_BELOW} are fitted once", "metrics": list(KEYS),
        "curves": {k: v for k, v in curves.items() if v}, "seconds": round(time.perf_counter() - t_start, 1),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(H._jsonable(res), indent=1) + "\n")

    def cell(m: dict) -> str:
        return f"{m['mean']:.4f}" + (f" ±{m['sd']:.3f}" if m["sd"] is not None else "       ")

    print(f"\nLearning curve on validation ({len(rows_val)} albums; mean ± sd over repeats; n = train rows offered, fit = rows used)")
    print(f"{'curve':14s} {'n':>5s} {'fit':>5s} {'artists':>7s} {'reps':>4s}  {'cP@10':>13s} {'P@10':>13s} {'nDCG@10':>13s} {'mAP':>13s}  C")
    for k, pts in res["curves"].items():
        for p in pts:
            tag = " (all audio rows)" if p["n"] == n_audio else " (all train rows)" if p["n"] == n_all else ""
            Cs_used = ",".join(f"{c:g}" for c in p["C"]) if "C" in p else ""
            print(f"{k:14s} {p['n']:5d} {p['n_fit']:5.0f} {p['n_artist_groups']:7.0f} {p['repeats']:4d}  {cell(p['cP@10']):>13s} "
                  f"{cell(p['precision@10']):>13s} {cell(p['ndcg@10']):>13s} {cell(p['mAP']):>13s}  {Cs_used}{tag}")
        print()
    print(f"wrote {out_path} ({res['seconds']:.0f}s)")


if __name__ == "__main__":
    main()
