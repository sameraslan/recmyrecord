"""Deliverable 5: a 10,000-point cloud resampled from the shipped balanced layout, with regions at two bandwidths.
Run: OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 nice -n 10 <venv python> run_synth.py [sweep]"""
import sys, time
from sklearn.neighbors import NearestNeighbors
from common import *
from auto_regions import find_regions, as_prev, public, median_gap

N_TOTAL = 10000
FINE_BW = 10.0      # gaps; chosen by the sweep (`run_synth.py sweep`) to give 35 to 45 regions (42)
COARSE_UNITS = 0.30 # coarse bandwidth held at the map-unit size used on the real layout (37.5 gaps * 0.008)

d = load()
B, W, Az, keys = d["P"]["balanced"], d["W"], d["Az"], d["keys"]
n = len(B)
rng = np.random.default_rng(10000)
src_new = rng.integers(0, n, N_TOTAL - n)
dist, _ = NearestNeighbors(n_neighbors=4).fit(B).kneighbors(B)
local = dist[:, 1:].mean(1)  # mean distance to the 3 nearest neighbours: the local gap
jit = rng.normal(size=(N_TOTAL - n, 2)) * (local[src_new] / np.sqrt(2))[:, None]  # RMS displacement = one local gap
P = np.vstack([B, B[src_new] + jit])
src = np.concatenate([np.arange(n), src_new])
skeys = list(keys) + [f"synth:{i}" for i in range(n, N_TOTAL)]
nt = json.load(open(HERE / "name_table.json"))
prev = as_prev(json.load(open(OUT / "regions_auto_balanced_continuity.json")), keys)
print("gap real", median_gap(B), "gap synth", median_gap(P))


def run(bw, cm):
    t = time.perf_counter()
    o = find_regions(P, W[src], d["dcols"], Az[src], AUDIO, nt, prev, skeys, params={"fine_bw": bw, "coarse_mult": cm})
    return o, time.perf_counter() - t


def brief(o):
    l1 = [r for r in o["regions"] if r["level"] == 1]
    return {"bw_gaps": o["bandwidth_gaps"], "bw_units": o["bandwidth"], "blobs": o["blobs"], "after_merge": o["merged_blobs"], "regions": len(l1),
            "strong": sum(r["strength"] == "strong" for r in l1), "named": sum(r["name"] is not None for r in l1),
            "needs_name": sum(r["needs_name"] for r in l1), "areas": sum(r["level"] == 0 for r in o["regions"]),
            "coarse_blobs": o["coarse_blobs"], "unnamed": round(float((np.array(o["album_region"]) < 0).mean()), 3),
            "with_parent": sum(r["parent"] is not None for r in l1)}


if len(sys.argv) > 1:
    for bw in (15, 12, 10, 9, 8, 7, 6):
        for cm in ((2.5,) if bw == 15 else (2.5, 37.5 / bw, 45 / bw)):
            o, t = run(float(bw), cm)
            print(bw, round(cm, 2), round(t, 2), "s", brief(o), flush=True)
    sys.exit()

g = median_gap(P)
od, td = run(15.0, COARSE_UNITS / g / 15.0)
of, tf = run(FINE_BW, COARSE_UNITS / g / FINE_BW)
rep = {"gap_real": median_gap(B), "gap_synth": median_gap(P), "default": {**brief(od), "seconds": round(td, 2)},
       "fine": {**brief(of), "seconds": round(tf, 2)},
       "fine_words": [[r["word"], r["name"], r["strength"], r["n"], r["parent"]] for r in of["regions"] if r["level"] == 1],
       "fine_areas": [[r["id"], r["n"], r["strength"]] for r in of["regions"] if r["level"] == 0]}
print(rep)
json.dump({"n": N_TOTAL, "positions": [round(float(v), 4) for v in P.reshape(-1)], "src": [int(i) for i in src],
           "regions_default": public(od), "regions_fine": public(of)}, open(OUT / "synth10k.json", "w"), ensure_ascii=False, separators=(",", ":"))
json.dump(rep, open(OUT / "report_synth.json", "w"), indent=1)
