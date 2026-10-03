"""Deliverable 4 follow-ups: (a) a distilled word -> family table for albums without Spotify audio,
(b) more T8 gate variants. Run after run_families.py."""
import warnings
from sklearn.linear_model import LinearRegression
from common import *
from run_families import *

warnings.filterwarnings("ignore")
d = load()
df, W, dcols, N = d["df"], d["W"], d["dcols"], len(d["df"])
stored = json.load(open(REG / "colour.json"))
SAW = np.array(stored["album_weights"])
clear = SAW[:, 5] < 0.5
fl = json.load(open(OUT / "family_loadings.json"))
cols = [dcols.index(w) for w in fl["words"]]
W8, _ = t8_presence(df, dcols, d["Wt"])
rep = {"distilled_word_table": {}}
# target: the stored five family weights (already scaled by character). Model: non-negative linear map from word presence.
for label, Xin in (("full_presence", W[:, cols].astype(float)), ("t8_presence", W8[:, cols].astype(float))):
    rows = []
    for seed in (1, 2):
        perm = np.random.default_rng(200 + seed).permutation(N)
        tr, te = perm[: int(0.7 * N)], perm[int(0.7 * N):]
        m = LinearRegression(positive=True).fit(Xin[tr], SAW[tr, :5])
        pred = m.predict(Xin[te])
        cl = clear[te]
        rows.append({"leading_same_as_stored_clear": round(float((pred.argmax(1) == SAW[te, :5].argmax(1))[cl].mean()), 3),
                     "mean_abs_weight_diff": round(float(np.abs(np.clip(pred, 0, 1) - SAW[te, :5]).mean()), 4)})
    rep["distilled_word_table"][label] = rows
    m = LinearRegression(positive=True).fit(Xin, SAW[:, :5])
    if label == "t8_presence":
        table = {"note": "Distilled table: non-negative linear map from T8 word presence to the stored five family weights, "
                         "fitted on all 4,081 albums. weights = clip(intercept + sum of rows for the album's words, 0, 1); neutral = 1 - sum, floored at 0.",
                 "family_order": FAM, "intercept": [round(float(x), 4) for x in m.intercept_],
                 "word_to_family": {w: [round(float(x), 4) for x in m.coef_[:, j]] for j, w in enumerate(fl["words"])}}
        o = json.load(open(OUT / "family_loadings.json"))
        o["distilled_t8_word_table"] = table
        json.dump(o, open(OUT / "family_loadings.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(rep, flush=True)

B, keys = d["P"]["balanced"], d["keys"]
nt = json.load(open(HERE / "name_table.json"))
full_run = find_regions(B, W, dcols, None, None, nt, None, keys)
fa = np.array(full_run["album_region"])
fw = np.array([r["word"] for r in full_run["regions"]] + [""])[fa]
fl1 = {r["word"] for r in full_run["regions"] if r["level"] == 1}
rep["t8_more"] = {}
for name, pv in {"0.29_0.24": {"cov_strong": 0.29, "cov_fair": 0.24, "top_cov": 0.15},
                 "0.25_0.20_lift2.5": {"cov_strong": 0.25, "cov_fair": 0.20, "top_cov": 0.15, "lift_min": 2.5},
                 "0.25_0.20_cos0.65": {"cov_strong": 0.25, "cov_fair": 0.20, "top_cov": 0.15, "cos_min": 0.65},
                 "0.29_0.24_lift2.5": {"cov_strong": 0.29, "cov_fair": 0.24, "top_cov": 0.15, "lift_min": 2.5}}.items():
    o = find_regions(B, W8, dcols, None, None, nt, None, keys, params=pv)
    oa = np.array(o["album_region"])
    ow = np.array([r["word"] for r in o["regions"]] + [""])[oa]
    l1 = [r for r in o["regions"] if r["level"] == 1]
    rep["t8_more"][name] = {"regions": len(l1), "strong": sum(r["strength"] == "strong" for r in l1), "unnamed": round(float((oa < 0).mean()), 3),
                            "merged_blobs": o["merged_blobs"], "region_words_kept": [len(fl1 & {r["word"] for r in l1}), len(fl1)],
                            "album_word_same_named": round(float((fw == ow)[fw != ""].mean()), 3), "words": sorted(r["word"] for r in l1)}
    print(name, rep["t8_more"][name], flush=True)
full8 = find_regions(B, W8, dcols, None, None, nt, None, keys)
rep["t8_merges_default"] = full8["merges"]; rep["full_merges"] = full_run["merges"]
print(full8["merges"]); print(full_run["merges"])
r0 = json.load(open(OUT / "report_families.json"))
print({k: v for k, v in r0["t8"].items() if not isinstance(v, (list, dict))})
json.dump(rep, open(OUT / "report_families_extra.json", "w"), indent=1)
