"""Deliverable 3: growth simulation with the real layout code (balanced stop only), one UMAP at a time.
Run: OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 NUMBA_NUM_THREADS=2 nice -n 10 <venv python> run_growth.py"""
import time
from common import *
from rmr_pipeline.constants import SLIDER, UMAP_PARAMS
from rmr_pipeline.layout import finalize_layouts, flat_positions
from rmr_pipeline.table import rec_matrix
from auto_regions import find_regions, as_prev

SIZES = [1600, 2400, 3200, 4081]
CACHE = OUT / "growth_layouts.npz"


def layout(df, idx, seed=42):
    from umap import UMAP
    X = rec_matrix(df.iloc[idx].reset_index(drop=True), SLIDER["balanced"])
    E = UMAP(**{**UMAP_PARAMS, "random_state": seed}).fit_transform(X).astype(float)
    # balanced is the Procrustes reference, so its final positions do not depend on the other stops
    return finalize_layouts({"sonic": E, "balanced": E, "mood": E})["balanced"]


def labels(out):
    ar = np.array(out["album_region"])
    ids = np.array([r["id"] for r in out["regions"]] + [""])
    wds = np.array([r["word"] for r in out["regions"]] + [""])
    return ids[ar], wds[ar]


def step_stats(prev_out, prev_idx, out, idx):
    """Shares over albums present in both steps."""
    pid, pw = labels(prev_out)
    nid, nw = labels(out)
    where = {a: i for i, a in enumerate(idx)}
    common = [(i, where[a]) for i, a in enumerate(prev_idx) if a in where]
    a, b = np.array([c[0] for c in common]), np.array([c[1] for c in common])
    named = pw[a] != ""
    return {"common": len(common),
            "id_same_all": round(float((pid[a] == nid[b]).mean()), 3),
            "word_same_all": round(float((pw[a] == nw[b]).mean()), 3),
            "id_same_named": round(float((pid[a] == nid[b])[named].mean()), 3),
            "word_same_named": round(float((pw[a] == nw[b])[named].mean()), 3),
            # where the previously named albums went
            "named_to_unnamed": round(float((nw[b] == "")[named].mean()), 3),
            "named_to_other_word": round(float(((nw[b] != "") & (nw[b] != pw[a]))[named].mean()), 3),
            "unnamed_to_named": round(float((nw[b] != "")[~named].mean()), 3)}


def counts(out):
    l1 = [r for r in out["regions"] if r["level"] == 1]
    return {"n": out["n_albums"], "gap": out["gap"], "blobs": out["blobs"], "after_merge": out["merged_blobs"],
            "regions": len(l1), "strong": sum(r["strength"] == "strong" for r in l1),
            "fair": sum(r["strength"] == "fair" for r in l1),
            "unnamed": round(float((np.array(out["album_region"]) < 0).mean()), 3),
            "areas": sum(r["level"] == 0 for r in out["regions"]),
            "kept": sum(r["status"] == "kept" for r in l1), "renamed": sum(r["status"] == "renamed" for r in l1),
            "new": sum(r["status"] == "new" for r in l1),
            "retired": sum(r["level"] == 1 for r in out["retired"]),
            "words": sorted(r["word"] for r in l1)}


if __name__ == "__main__":
    d = load()
    df, keys, W, words = d["df"], np.array(d["keys"]), d["W"], d["dcols"]
    nt = json.load(open(HERE / "name_table.json"))
    N = len(df)
    series = {"prefix": [np.arange(m) for m in SIZES]}
    for seed in (1, 2):
        perm = np.random.default_rng(seed).permutation(N)
        series[f"random{seed}"] = [np.sort(perm[:m]) for m in SIZES]
    cache = dict(np.load(CACHE)) if CACHE.exists() else {}
    times = {}

    def get(name, idx, seed=42):
        if name not in cache:
            t = time.perf_counter()
            cache[name] = layout(df, idx, seed)
            times[name] = round(time.perf_counter() - t, 1)
            np.savez_compressed(CACHE, **cache)
            print("umap", name, len(idx), times[name], "s", flush=True)
        return cache[name]

    full = get("full_seed42", np.arange(N))
    shipped = d["P"]["balanced"]
    rerun = np.array(flat_positions(full)).reshape(-1, 2)
    diff = np.linalg.norm(rerun - shipped, axis=1)
    rep = {"reproduction": {"identical_after_rounding": bool((rerun == shipped).all()), "max_abs_diff": float(np.abs(rerun - shipped).max()),
                            "median_dist": float(np.median(diff)), "share_exact": float((diff == 0).mean())}}
    print(rep["reproduction"], flush=True)

    def regions(P, idx, prev):
        A = df.iloc[idx][AUDIO].astype(float).to_numpy()
        Az = (A - A.mean(0)) / A.std(0)
        return find_regions(P, W[idx], words, Az, AUDIO, nt, prev, list(keys[idx]))

    rep["series"] = {}
    for sname, steps in series.items():
        rows, prev_m, prev_n, prev_idx = [], None, None, None
        for idx in steps:
            P = full if len(idx) == N else get(f"{sname}_{len(idx)}", idx)
            om = regions(P, idx, as_prev(prev_m, list(keys[prev_idx])) if prev_m is not None else None)
            on = regions(P, idx, None)
            row = {"matched": counts(om), "naive": counts(on)}
            if prev_m is not None:
                row["matched_vs_prev"] = step_stats(prev_m, prev_idx, om, idx)
                row["naive_vs_prev"] = step_stats(prev_n, prev_idx, on, idx)
                pw = {r["word"] for r in prev_n["regions"] if r["level"] == 1}
                nw = {r["word"] for r in on["regions"] if r["level"] == 1}
                row["naive_region_words_surviving"] = [len(pw & nw), len(pw)]
                pwm = {r["id"]: r["word"] for r in prev_m["regions"] if r["level"] == 1}
                row["matched_region_words_surviving"] = [sum(r["status"] == "kept" for r in om["regions"] if r["level"] == 1), len(pwm)]
            rows.append(row)
            prev_m, prev_n, prev_idx = om, on, idx
            print(sname, len(idx), {k: v for k, v in row.items() if k not in ("matched", "naive")},
                  {k: v for k, v in row["matched"].items() if k != "words"}, flush=True)
        rep["series"][sname] = rows

    # same albums, different UMAP seed
    P7 = get("full_seed7", np.arange(N), seed=7)
    idx = np.arange(N)
    base_n = regions(full, idx, None)
    om = regions(P7, idx, as_prev(base_n, list(keys)))
    on = regions(P7, idx, None)
    pw = {r["word"] for r in base_n["regions"] if r["level"] == 1}
    rep["seed_noise"] = {"base": counts(base_n), "matched": counts(om), "naive": counts(on),
                         "matched_vs_base": step_stats(base_n, idx, om, idx), "naive_vs_base": step_stats(base_n, idx, on, idx),
                         "naive_region_words_surviving": [len(pw & {r["word"] for r in on["regions"] if r["level"] == 1}), len(pw)],
                         "matched_region_words_surviving": [sum(r["status"] == "kept" for r in om["regions"] if r["level"] == 1), len(pw)]}
    print("seed", rep["seed_noise"], flush=True)
    rep["umap_seconds"] = times
    json.dump(rep, open(OUT / "report_growth.json", "w"), indent=1)
