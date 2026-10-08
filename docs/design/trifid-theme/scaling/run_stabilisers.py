"""Stabilisers: anchored UMAP init and membership carry-forward, on the growth series.
Run: OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 NUMBA_NUM_THREADS=2 nice -n 10 <venv python> run_stabilisers.py"""
import time, warnings
from sklearn.manifold import trustworthiness
from sklearn.neighbors import NearestNeighbors
from common import *
from rmr_pipeline.constants import SLIDER, UMAP_PARAMS
from rmr_pipeline.layout import finalize_layouts, procrustes_to
from rmr_pipeline.table import rec_matrix
from auto_regions import find_regions, as_prev, median_gap
from carry_forward import carry_forward_regions
from run_growth import SIZES, labels, step_stats, counts

warnings.filterwarnings("ignore")
CACHE = OUT / "stabiliser_layouts.npz"
d = load()
df, keys, W, words = d["df"], np.array(d["keys"]), d["W"], d["dcols"]
N = len(df)
XF = rec_matrix(df, SLIDER["balanced"]).astype(np.float64)
nt = json.load(open(HERE / "name_table.json"))
fresh = dict(np.load(OUT / "growth_layouts.npz"))
cache = dict(np.load(CACHE)) if CACHE.exists() else {}
umap_s = {}


def anchored(name, idx, prev_idx, prevP, seed=42, n_epochs=None):
    """UMAP initialised from the previous step's FINAL (normalised) layout. UMAP rescales any init array
    to [0, 10] per axis, so the pre-normalisation embedding would give the same start."""
    if name in cache:
        return cache[name]
    from umap import UMAP
    X = XF[idx]
    where = {a: i for i, a in enumerate(prev_idx)}
    init = np.zeros((len(idx), 2))
    is_old = np.array([a in where for a in idx])
    init[is_old] = prevP[[where[a] for a in idx[is_old]]]
    if (~is_old).any():
        _, fn = NearestNeighbors(n_neighbors=5).fit(X[is_old]).kneighbors(X[~is_old])
        init[~is_old] = init[is_old][fn].mean(1) + np.random.default_rng(0).normal(scale=1e-3, size=((~is_old).sum(), 2))
    t = time.perf_counter()
    kw = {**UMAP_PARAMS, "random_state": seed, "init": init}
    if n_epochs:
        kw["n_epochs"] = n_epochs
    E = UMAP(**kw).fit_transform(X).astype(float)
    cache[name] = finalize_layouts({"sonic": E, "balanced": E, "mood": E})["balanced"]
    umap_s[name] = round(time.perf_counter() - t, 1)
    np.savez_compressed(CACHE, **cache)
    print("umap", name, umap_s[name], "s", flush=True)
    return cache[name]


def layout_stats(prevP, prev_idx, P, idx):
    """Movement of albums present in both steps (after rotation/reflection + translation, no scaling),
    in gaps of the new layout, and retention of 15 map neighbours computed among the shared albums."""
    where = {a: i for i, a in enumerate(idx)}
    b = np.array([where[a] for a in prev_idx])
    A, Bn = prevP, P[b]
    mv = np.linalg.norm(procrustes_to(Bn, A) - A, axis=1) / median_gap(P)
    _, n1 = NearestNeighbors(n_neighbors=16).fit(A).kneighbors(A)
    _, n2 = NearestNeighbors(n_neighbors=16).fit(Bn).kneighbors(Bn)
    keep = np.mean([len(set(x[1:]) & set(y[1:])) / 15 for x, y in zip(n1, n2)])
    return {"move_median_gaps": round(float(np.median(mv)), 1), "move_p90_gaps": round(float(np.percentile(mv, 90)), 1),
            "map_knn_retained": round(float(keep), 3)}


def quality(P, idx):
    X = XF[idx]
    _, fn = NearestNeighbors(n_neighbors=16).fit(X).kneighbors(X)
    _, mn = NearestNeighbors(n_neighbors=16).fit(P).kneighbors(P)
    kp = np.mean([len(set(a[1:]) & set(b[1:])) / 15 for a, b in zip(fn, mn)])
    return {"feature_knn_preserved": round(float(kp), 3), "trustworthiness": round(float(trustworthiness(X, P, n_neighbors=15)), 4)}


def az(idx):
    A = df.iloc[idx][AUDIO].astype(float).to_numpy()
    return (A - A.mean(0)) / A.std(0)


def regions(method, P, idx, prev_out, prev_idx):
    t = time.perf_counter()
    k = list(keys[idx])
    if prev_out is None:
        o = find_regions(P, W[idx], words, az(idx), AUDIO, nt, None, k)
    elif method == "recluster":
        o = find_regions(P, W[idx], words, az(idx), AUDIO, nt, as_prev(prev_out, list(keys[prev_idx])), k)
    else:
        o = carry_forward_regions(P, W[idx], words, XF[idx], as_prev(prev_out, list(keys[prev_idx]), roster=True),
                                  az(idx), AUDIO, nt, k, params={"absorb": method == "carry_absorb"})
    o["_seconds"] = round(time.perf_counter() - t, 2)
    return o


def drift(o, idx):
    ar = np.array(o["album_region"]); ro = np.array(o["album_roster"])
    l1 = [(i, r) for i, r in enumerate(o["regions"]) if r["level"] == 1]
    cov = [r["evidence"]["coverage"] for _, r in l1 if r["named_from"] == "word"]
    return {"mean_n": round(float(np.mean([r["n"] for _, r in l1])), 1), "max_n": int(max(r["n"] for _, r in l1)),
            "mean_roster": round(float(np.mean([(ro == i).sum() for i, _ in l1])), 1),
            "mean_name_word_coverage": round(float(np.mean(cov)), 3), "seconds": o["_seconds"]}


def row(o, idx, prev_out, prev_idx):
    c = counts(o) if "blobs" in o else {**{k: None for k in ("blobs", "after_merge")}, **counts({**o, "blobs": 0, "merged_blobs": 0})}
    r = {"regions": c["regions"], "strong": c["strong"], "fair": c["fair"], "unnamed": c["unnamed"], **drift(o, idx)}
    if prev_out is not None:
        s = step_stats(prev_out, prev_idx, o, idx)
        r.update({"kept": c["kept"], "renamed": c["renamed"], "new": c["new"], "retired": c["retired"],
                  "id_same_named": s["id_same_named"], "word_same_named": s["word_same_named"],
                  "named_to_unnamed": s["named_to_unnamed"], "named_to_other_word": s["named_to_other_word"]})
        if "carry" in o:
            cf = o["carry"]
            r["carry"] = {k: (len(v) if isinstance(v, list) else v) for k, v in cf.items() if k != "regions"}
            r["carry"]["not_contiguous_ids"], r["carry"]["failed_gates_ids"] = cf["not_contiguous"], cf["failed_gates"]
    return r


rep = {"layout": {}, "regions": {}, "quality": {}}
series = {"prefix": [np.arange(m) for m in SIZES]}
perm = np.random.default_rng(1).permutation(N)
series["random1"] = [np.sort(perm[:m]) for m in SIZES]

layouts = {}
for sname, steps in series.items():
    fr = [fresh["full_seed42"] if len(i) == N else fresh[f"{sname}_{len(i)}"] for i in steps]
    an = [fr[0]]
    for j in range(1, len(steps)):
        an.append(anchored(f"anch_{sname}_{len(steps[j])}", steps[j], steps[j - 1], an[-1]))
    layouts[(sname, "fresh")], layouts[(sname, "anchored")] = fr, an
    for mode, L in (("fresh", fr), ("anchored", an)):
        rep["layout"][f"{sname}/{mode}"] = [layout_stats(L[j - 1], steps[j - 1], L[j], steps[j]) for j in range(1, len(steps))]
        print(sname, mode, rep["layout"][f"{sname}/{mode}"], flush=True)
# low-epoch variant on the prefix series
steps = series["prefix"]
lo = [layouts[("prefix", "fresh")][0]]
for j in range(1, len(steps)):
    lo.append(anchored(f"anch200_prefix_{len(steps[j])}", steps[j], steps[j - 1], lo[-1], n_epochs=200))
layouts[("prefix", "anchored200")] = lo
rep["layout"]["prefix/anchored200"] = [layout_stats(lo[j - 1], steps[j - 1], lo[j], steps[j]) for j in range(1, len(steps))]
print("prefix anchored200", rep["layout"]["prefix/anchored200"], flush=True)
# same albums, seed 42 -> 7
full_idx = np.arange(N)
seedL = {"fresh": [fresh["full_seed42"], fresh["full_seed7"]],
         "anchored": [fresh["full_seed42"], anchored("anch_seed7", full_idx, full_idx, fresh["full_seed42"], seed=7)]}
for mode, L in seedL.items():
    rep["layout"][f"seed/{mode}"] = [layout_stats(L[0], full_idx, L[1], full_idx)]
    print("seed", mode, rep["layout"][f"seed/{mode}"], flush=True)

# quality of full-size layouts
for name, P in (("fresh_shipped_seed42", fresh["full_seed42"]), ("fresh_seed7", fresh["full_seed7"]),
                ("anchored_prefix_chain", layouts[("prefix", "anchored")][-1]),
                ("anchored_random1_chain", layouts[("random1", "anchored")][-1]),
                ("anchored200_prefix_chain", layouts[("prefix", "anchored200")][-1]),
                ("anchored_seed7_from_seed42", seedL["anchored"][1])):
    rep["quality"][name] = quality(P, full_idx)
    print("quality", name, rep["quality"][name], flush=True)

# regions: layout mode x method
jobs = [(s, m) for s in series for m in ("fresh", "anchored")] + [("prefix", "anchored200")]
for sname, mode in jobs:
    for method in ("recluster", "carry", "carry_absorb"):
        steps, L = series[sname], layouts[(sname, mode)]
        rows, prev_out, prev_idx = [], None, None
        for idx, P in zip(steps, L):
            o = regions(method, P, idx, prev_out, prev_idx)
            rows.append({"n": len(idx), **row(o, idx, prev_out, prev_idx)})
            prev_out, prev_idx = o, idx
        rep["regions"][f"{sname}/{mode}/{method}"] = rows
        for r in rows[1:]:
            print(sname, mode, method, {k: v for k, v in r.items() if k != "carry"}, r.get("carry", ""), flush=True)
for mode, L in seedL.items():
    base = regions("recluster", L[0], full_idx, None, None)
    for method in ("recluster", "carry", "carry_absorb"):
        o = regions(method, L[1], full_idx, base, full_idx)
        r = row(o, full_idx, base, full_idx)
        rep["regions"][f"seed/{mode}/{method}"] = [{"n": N, **row(base, full_idx, None, None)}, {"n": N, **r}]
        print("seed", mode, method, {k: v for k, v in r.items() if k != "carry"}, r.get("carry", ""), flush=True)
if not umap_s and (OUT / "report_stabilisers.json").exists():
    umap_s = json.load(open(OUT / "report_stabilisers.json")).get("umap_seconds", {})
rep["umap_seconds"] = umap_s
KEYS = ("id_same_named", "word_same_named", "named_to_unnamed", "named_to_other_word", "unnamed", "regions", "kept", "renamed", "new", "retired", "mean_n", "max_n", "mean_name_word_coverage")
summ = {}
for mode in ("fresh", "anchored"):
    for method in ("recluster", "carry", "carry_absorb"):
        rows = [r for s_ in ("prefix", "random1") for r in rep["regions"][f"{s_}/{mode}/{method}"][1:]]
        summ[f"{mode}/{method}"] = {"growth_mean": {k: round(float(np.mean([r[k] for r in rows])), 3) for k in KEYS},
                                    "seed": {k: rep["regions"][f"seed/{mode}/{method}"][1][k] for k in KEYS}}
        if method != "recluster":
            summ[f"{mode}/{method}"]["growth_not_contiguous_per_step"] = [r["carry"]["not_contiguous"] for r in rows]
            summ[f"{mode}/{method}"]["growth_failed_gates_per_step"] = [r["carry"]["failed_gates"] for r in rows]
        print(mode, method, summ[f"{mode}/{method}"])
rep["summary"] = summ
json.dump(rep, open(OUT / "report_stabilisers.json", "w"), indent=1)
