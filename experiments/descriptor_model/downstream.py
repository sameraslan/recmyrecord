"""Downstream evaluation: what happens to the site's recommendations when some albums' scraped descriptors
are replaced by predicted ones.

    .venv/bin/python downstream.py            # sanity checks + reference points on VALIDATION
    .venv/bin/python downstream.py --split val

The catalogue is built exactly as the site build does it (rmr_pipeline.build): load_table -> dedupe_table
(first row of every Spotify URI, 4,081 albums) -> rec_matrix(slider) -> top_k_neighbours, at the three
SLIDER stops. With the real table this reproduces frontcreck/public/data/recs.json exactly (checked by
check_against_site()). The build's extra filter "album must be on the music map" drops nothing for the
shipped data (albums.json has the same 4,081 albums), and the map is not available here.

Duplicate-URI rows: `rows` are table row numbers. A row that is not the first of its URI is not in the
catalogue (dedupe_table dropped it), so it is skipped and counted in `n_skipped_not_in_catalogue`; the first
row of the URI is evaluated like any other album. Duplicate-URI rows always share a split (split.py), so
skipping never mixes splits.

Only the 120 descriptor columns of the evaluated albums change. Their audio columns, and every column of
every other album, stay real.
"""
from __future__ import annotations

import argparse
import json
from functools import lru_cache

import numpy as np
from scipy.stats import spearmanr
from sklearn.neighbors import NearestNeighbors

from common import (DESCRIPTORS, N_DESC, REPO, SLIDER, STOPS, TABLE, Y, Y64, dedupe_table, rec_matrix, split_rows,
                    top_k_neighbours)

K = 10


@lru_cache(maxsize=1)
def catalogue():
    """(deduped frame, table row of each catalogue album, {table row: catalogue index})."""
    sub, rows = dedupe_table(TABLE)
    return sub, np.array(rows), {int(r): i for i, r in enumerate(rows)}


@lru_cache(maxsize=1)
def real_recs() -> dict[str, np.ndarray]:
    sub, _, _ = catalogue()
    return {stop: top_k_neighbours(rec_matrix(sub, SLIDER[stop]), K) for stop in STOPS}


def check_against_site() -> dict[str, bool]:
    """Do the recs computed here equal the shipped frontcreck/public/data/recs.json? (read-only)"""
    shipped = json.loads((REPO / "frontcreck" / "public" / "data" / "recs.json").read_text())
    return {stop: bool(np.array_equal(real_recs()[stop], np.array(shipped[stop]))) for stop in STOPS}


def _overlap(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Row-wise |a_i ∩ b_i| / k for two (n, k) index arrays with unique entries per row."""
    return (a[:, :, None] == b[:, None, :]).any(2).sum(1) / a.shape[1]


def _dist(x: np.ndarray) -> dict:
    q25, q50, q75 = np.percentile(x, [25, 50, 75])
    return {"mean": float(x.mean()), "median": float(q50), "q25": float(q25), "q75": float(q75),
            "min": float(x.min()), "max": float(x.max()),
            "share_zero": float((x == 0).mean()), "share_one": float((x == 1).mean())}


def _corr(a: np.ndarray, b: np.ndarray) -> dict:
    if a.std() == 0 or b.std() == 0:
        return {"pearson": float("nan"), "spearman": float("nan")}
    return {"pearson": float(np.corrcoef(a, b)[0, 1]), "spearman": float(spearmanr(a, b).statistic)}


def downstream_eval(pred_weights: np.ndarray, rows: np.ndarray, *, stops: tuple[str, ...] = STOPS,
                    isolated: bool = True, keep_arrays: bool = False) -> dict:
    """Replace the descriptor columns of `rows` with `pred_weights` and compare recommendations.

    pred_weights  (len(rows), 120) weight vectors in DESCRIPTORS order (table format: rank weights, 0 = absent;
                  e.g. weights.scores_to_weights(...)). Use float64; values are written into the table as is.
    rows          table row numbers (positions in load_table()), e.g. common.split_rows("val").

    Returns {"n_eval", "n_skipped_not_in_catalogue", "skipped_rows", "n_catalogue", "mean_n_pred",
             "stops": {stop: {...}}} where each stop has
      overlap        evaluated albums, all of them replaced at once: |recs_pred ∩ recs_real| / 10 per album
                     -> mean, median, q25, q75, min, max, share_zero, share_one
      overlap_isolated  the same, but each evaluated album is replaced alone and queried against the
                     otherwise real catalogue (the "one new album arrives" case); omitted if isolated=False
      inbound        appearances of evaluated albums in OTHER albums' top-10 lists (any other album; a list
                     never contains its own album): before / after -> total, mean per album, share of
                     evaluated albums with zero inbound; pearson / spearman between before and after counts;
                     also totals counting only lists of non-evaluated albums (`*_from_others`)
      others         non-evaluated albums: overlap@10 of their real vs new lists -> mean over all of them,
                     n_changed, share_changed, mean overlap among the changed ones
    With keep_arrays=True each stop also carries the per-album arrays and the new recs.
    """
    sub, cat_rows, row_to_cat = catalogue()
    rows = np.asarray(rows, dtype=int)
    W = np.asarray(pred_weights, dtype=np.float64)
    assert W.shape == (len(rows), len(DESCRIPTORS)), W.shape
    assert np.isfinite(W).all() and (W >= 0).all()
    assert len(set(rows.tolist())) == len(rows), "duplicate rows"
    in_cat = np.array([int(r) in row_to_cat for r in rows])
    ev = np.array([row_to_cat[int(r)] for r in rows[in_cat]], dtype=int)
    W = W[in_cat]

    D = sub[DESCRIPTORS].to_numpy(dtype=np.float64)
    D[ev] = W
    pred = sub.copy()
    pred[DESCRIPTORS] = D
    is_eval = np.zeros(len(sub), dtype=bool)
    is_eval[ev] = True
    others = np.flatnonzero(~is_eval)

    out = {"n_eval": int(len(ev)), "n_skipped_not_in_catalogue": int((~in_cat).sum()),
           "skipped_rows": rows[~in_cat].tolist(), "n_catalogue": int(len(sub)),
           "mean_n_pred": float((W > 0).sum(1).mean()), "stops": {}}
    for stop in stops:
        real = real_recs()[stop]
        Xp = rec_matrix(pred, SLIDER[stop])
        new = top_k_neighbours(Xp, K)
        ov = _overlap(new[ev], real[ev])
        res = {"overlap": _dist(ov)}
        if isolated:
            Xr = rec_matrix(sub, SLIDER[stop])
            _, idx = NearestNeighbors(n_neighbors=K + 1).fit(Xr).kneighbors(Xp[ev])
            iso = np.array([[j for j in idx[i] if j != ev[i]][:K] for i in range(len(ev))])
            ov_iso = _overlap(iso, real[ev])
            res["overlap_isolated"] = _dist(ov_iso)
        n = len(sub)
        before = np.bincount(real.ravel(), minlength=n)[ev]
        after = np.bincount(new.ravel(), minlength=n)[ev]
        before_o = np.bincount(real[others].ravel(), minlength=n)[ev]
        after_o = np.bincount(new[others].ravel(), minlength=n)[ev]
        res["inbound"] = {
            "before_total": int(before.sum()), "after_total": int(after.sum()),
            "before_mean": float(before.mean()), "after_mean": float(after.mean()),
            "before_share_zero": float((before == 0).mean()), "after_share_zero": float((after == 0).mean()),
            "before_total_from_others": int(before_o.sum()), "after_total_from_others": int(after_o.sum()),
            **_corr(before, after),
        }
        ov_others = _overlap(new[others], real[others])
        changed = ov_others < 1
        res["others"] = {
            "n": int(len(others)), "mean_overlap": float(ov_others.mean()),
            "n_changed": int(changed.sum()), "share_changed": float(changed.mean()),
            "mean_overlap_changed": float(ov_others[changed].mean()) if changed.any() else 1.0,
        }
        if keep_arrays:
            res["arrays"] = {"overlap": ov, "inbound_before": before, "inbound_after": after,
                             "others_overlap": ov_others, "recs": new, "eval_catalogue_index": ev}
            if isolated:
                res["arrays"]["overlap_isolated"] = ov_iso
        out["stops"][stop] = res
    return out


def format_downstream(results: dict[str, dict]) -> str:
    """Plain-text table: one line per (named result, stop)."""
    head = (f"{'':34s} {'stop':8s} {'ov@10':>6s} {'med':>5s} {'q25':>5s} {'q75':>5s} {'=0':>5s} {'iso':>6s} | "
            f"{'in_bef':>6s} {'in_aft':>6s} {'mean_b':>6s} {'mean_a':>6s} {'zero_b':>6s} {'zero_a':>6s} {'r':>6s} {'rho':>6s} | "
            f"{'oth_ov':>6s} {'oth_chg':>7s} {'ov|chg':>6s}")
    lines = [head]
    for name, r in results.items():
        for stop, s in r["stops"].items():
            o, i, t = s["overlap"], s["inbound"], s["others"]
            iso = s.get("overlap_isolated", {}).get("mean", float("nan"))
            lines.append(
                f"{name:34s} {stop:8s} {o['mean']:6.3f} {o['median']:5.2f} {o['q25']:5.2f} {o['q75']:5.2f} "
                f"{o['share_zero']:5.2f} {iso:6.3f} | {i['before_total']:6d} {i['after_total']:6d} "
                f"{i['before_mean']:6.2f} {i['after_mean']:6.2f} {i['before_share_zero']:6.3f} "
                f"{i['after_share_zero']:6.3f} {i['pearson']:6.3f} {i['spearman']:6.3f} | "
                f"{t['mean_overlap']:6.3f} {t['share_changed']:7.3f} {t['mean_overlap_changed']:6.3f}")
    return "\n".join(lines)


def reference_points(split: str) -> dict[str, dict]:
    """Label-free and label-only reference points for one split (no model involved)."""
    from weights import scores_to_weights, train_rank_weights  # local import: needs splits.json

    rows = split_rows(split)
    train = split_rows("train")
    prevalence = (Y64[train] > 0).mean(0)
    S = np.tile(prevalence, (len(rows), 1))
    k_mean = int(round(N_DESC[train].mean()))
    refs = {
        "all-zeros": np.zeros((len(rows), len(DESCRIPTORS))),
        "most-frequent top-10, emp. weights": scores_to_weights(S, k=10),
        f"most-frequent top-{k_mean}, emp. weights": scores_to_weights(S, k=k_mean),
        "most-frequent top-10, formula w.": scores_to_weights(S, k=10, rank_weights="formula"),
        # upper reference for scores_to_weights: the TRUE descriptor set and order, but rank weights from the
        # train means instead of the true (gappy) weights
        "oracle set+order, emp. weights": scores_to_weights(Y64[rows], threshold=1e-9, rank_weights=train_rank_weights()),
        "oracle set+order, formula w.": scores_to_weights(Y64[rows], threshold=1e-9, rank_weights="formula"),
    }
    return {name: downstream_eval(W, rows) for name, W in refs.items()}


def sanity(split: str) -> None:
    rows = split_rows(split)
    print("recs computed here == shipped recs.json:", check_against_site())
    true = downstream_eval(Y64[rows], rows)
    print(f"evaluated {true['n_eval']} of {len(rows)} {split} rows "
          f"({true['n_skipped_not_in_catalogue']} skipped: not first of their URI {true['skipped_rows']}); "
          f"catalogue {true['n_catalogue']}")
    for stop, s in true["stops"].items():
        exact = (s["overlap"]["min"] == 1.0 and s["overlap_isolated"]["min"] == 1.0 and s["others"]["n_changed"] == 0
                 and s["inbound"]["before_total"] == s["inbound"]["after_total"])
        print(f"  true weights fed back, {stop}: overlap mean {s['overlap']['mean']:.6f} min {s['overlap']['min']:.1f}, "
              f"others changed {s['others']['n_changed']} -> {'EXACT' if exact else 'NOT EXACT'}")
        assert exact
    f32 = downstream_eval(Y[rows].astype(np.float64), rows)
    print("  true weights rounded to float32 first:",
          {stop: round(s["overlap"]["mean"], 6) for stop, s in f32["stops"].items()})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="val", choices=["train", "val"],
                    help="test is deliberately not offered here; call downstream_eval yourself for the final run")
    args = ap.parse_args()
    print(f"== sanity ({args.split}) ==")
    sanity(args.split)
    print(f"\n== reference points ({args.split}) ==")
    print(format_downstream(reference_points(args.split)))
    print("\nov@10 = mean overlap of evaluated albums' lists with their real lists (all evaluated albums replaced at once);"
          "\niso = same with each album replaced alone; in_* = inbound appearances of evaluated albums before/after;"
          "\nzero_* = share of evaluated albums nobody recommends; r/rho = Pearson/Spearman of inbound counts;"
          "\noth_* = non-evaluated albums: mean overlap of their lists, share whose list changed, mean overlap among changed")


if __name__ == "__main__":
    main()
