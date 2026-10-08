"""Deliverable 2: run find_regions on the shipped layouts and compare with the hand-made regions.
Run: OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 nice -n 10 ../../../../data-pipeline/.venv/bin/python run_regions.py"""
import time
from sklearn.metrics import adjusted_rand_score
from common import *
from auto_regions import find_regions, as_prev, public, PARAMS


def hand_prev(hand, keys):
    ar = np.array([a or "" for a in hand["album_region"]])
    regs = []
    for r in hand["regions"]:
        ev = r["name_evidence"]
        word = ev["word"] if "word" in ev else ev["feature"] + ("+" if ev["z"] >= 0 else "-")
        regs.append({"id": r["id"], "level": 1, "word": word, "name": r["name_space"], "strength": r["strength"],
                     "members": [keys[i] for i in np.flatnonzero(ar == r["id"])]})
    return {"album_keys": list(keys), "regions": regs}


def seed_name_table(hand):
    return {r["word"]: r["name"] for r in hand_prev(hand, [None] * len(hand["album_region"]))["regions"]}


def compare(hand_p, out, keys):
    pos = {k: i for i, k in enumerate(keys)}
    ar = np.array(out["album_region"])
    l1 = [(i, r) for i, r in enumerate(out["regions"]) if r["level"] == 1]
    sets = {i: set(np.flatnonzero(ar == i)) for i, _ in l1}
    rows, used = [], set()
    for h in hand_p["regions"]:
        hs = {pos[k] for k in h["members"]}
        best = max(l1, key=lambda ir: len(hs & sets[ir[0]]) / len(hs | sets[ir[0]]))
        i, r = best
        inter = len(hs & sets[i])
        rows.append({"hand": h["id"], "hand_word": h["word"], "hand_n": len(hs), "hand_strength": h["strength"],
                     "auto": r["id"], "auto_word": r["word"], "auto_n": r["n"], "auto_strength": r["strength"],
                     "jaccard": round(inter / len(hs | sets[i]), 3), "hand_in_auto": round(inter / len(hs), 3),
                     "auto_in_hand": round(inter / len(sets[i]), 3), "word_agrees": h["word"] == r["word"],
                     "strength_agrees": h["strength"] == r["strength"], "name": r["name"], "status": r["status"]})
        if inter / len(hs | sets[i]) >= 0.3:
            used.add(i)
    hl = np.full(len(keys), -1)
    for j, h in enumerate(hand_p["regions"]):
        hl[[pos[k] for k in h["members"]]] = j
    both = (hl >= 0) & (ar >= 0)
    return {"rows": rows,
            "hand_without_auto": [x["hand"] for x in rows if x["jaccard"] < 0.3],
            "auto_without_hand": [{"id": r["id"], "word": r["word"], "n": r["n"], "strength": r["strength"]}
                                  for i, r in l1 if i not in used],
            "ari_all": round(float(adjusted_rand_score(hl, ar)), 3),
            "ari_named_in_both": round(float(adjusted_rand_score(hl[both], ar[both])), 3),
            "unnamed_hand": round(float((hl < 0).mean()), 3), "unnamed_auto": round(float((ar < 0).mean()), 3),
            "same_named_status": round(float(((hl >= 0) == (ar >= 0)).mean()), 3)}


def summary(out):
    l1 = [r for r in out["regions"] if r["level"] == 1]
    l0 = [r for r in out["regions"] if r["level"] == 0]
    return {"blobs": out["blobs"], "after_merge": out["merged_blobs"], "regions": len(l1),
            "strong": sum(r["strength"] == "strong" for r in l1), "fair": sum(r["strength"] == "fair" for r in l1),
            "unnamed_share": round(float((np.array(out["album_region"]) < 0).mean()), 3),
            "areas": len(l0), "coarse_blobs": out["coarse_blobs"],
            "area_cover": round(float((np.array(out["album_area"]) >= 0).mean()), 3),
            "status": {s: sum(r["status"] == s for r in l1) for s in ("kept", "renamed", "new")},
            "retired": out["retired"]}


if __name__ == "__main__":
    d = load()
    keys, W, words = d["keys"], d["W"], d["dcols"]
    hand = json.load(open(REG / "regions.json"))
    hp = hand_prev(hand, keys)
    nt = seed_name_table(hand)
    json.dump(nt, open(HERE / "name_table.json", "w"), indent=1, ensure_ascii=False)
    OUT.mkdir(exist_ok=True)
    rep = {"params": PARAMS, "timing_s": {}}

    def run(stop, prev, audio):
        t = time.perf_counter()
        o = find_regions(d["P"][stop], W, words, d["Az"] if audio else None, AUDIO, nt, prev, keys, stop=stop)
        return o, round(time.perf_counter() - t, 2)

    bal_c, t1 = run("balanced", hp, True)
    bal_p, t2 = run("balanced", None, True)
    rep["timing_s"]["balanced_4081"] = [t1, t2]
    json.dump(public(bal_p), open(OUT / "regions_auto_balanced.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(public(bal_c), open(OUT / "regions_auto_balanced_continuity.json", "w"), ensure_ascii=False, separators=(",", ":"))
    rep["balanced_pure"] = {"summary": summary(bal_p), "vs_hand": compare(hp, bal_p, keys), "merges": bal_p["merges"]}
    rep["balanced_continuity"] = {"summary": summary(bal_c), "vs_hand": compare(hp, bal_c, keys)}
    # blob-level view of the merges: which fine blobs each hand region was built from vs the automatic groups
    blobs, merged = np.array(bal_p["_blob_labels"]), np.array(bal_p["_merged_labels"])
    rep["auto_merge_groups"] = [sorted(int(b) for b in np.unique(blobs[merged == m])) for m in np.unique(merged)
                                if len(np.unique(blobs[merged == m])) > 1]
    rep["hand_merge_groups"] = [s["seeds"] for s in json.load(open(REG / "merge.json")).values() if len(s["seeds"]) > 1]

    prev_bal = as_prev(bal_c, keys)
    allr = {"balanced": public(bal_c)}
    for stop, audio in (("sonic", True), ("mood", False)):
        o, t = run(stop, prev_bal, audio)
        rep["timing_s"][stop] = t
        json.dump(public(o), open(OUT / f"regions_auto_{stop}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        allr[stop] = public(o)
        l1 = [r for r in o["regions"] if r["level"] == 1]
        rep[stop] = {"summary": summary(o),
                     "regions": [{k: r[k] for k in ("id", "word", "name", "needs_name", "strength", "n", "status", "overlap", "plain", "parent")} for r in l1],
                     "areas": [{k: r[k] for k in ("id", "word", "strength", "n", "plain")} for r in o["regions"] if r["level"] == 0]}
    for k in ("balanced_pure", "balanced_continuity"):
        o = bal_p if k == "balanced_pure" else bal_c
        rep[k]["regions"] = [{kk: r[kk] for kk in ("id", "word", "name", "needs_name", "strength", "n", "status", "overlap", "plain", "parent", "evidence")} for r in o["regions"] if r["level"] == 1]
        rep[k]["areas"] = [{kk: r[kk] for kk in ("id", "word", "strength", "n", "plain")} for r in o["regions"] if r["level"] == 0]
    json.dump(allr, open(OUT / "regions_all.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(rep, open(OUT / "report_regions.json", "w"), ensure_ascii=False, indent=1)

    for k in ("balanced_pure", "balanced_continuity"):
        v = rep[k]["vs_hand"]
        print("\n==", k, rep[k]["summary"])
        for x in v["rows"]:
            print(f"  {x['hand']:12s} {x['hand_word']:14s} n={x['hand_n']:3d} {x['hand_strength']:6s} -> {x['auto']:18s} {x['auto_word']:18s} n={x['auto_n']:3d} {x['auto_strength']:6s} J={x['jaccard']:.2f} h_in_a={x['hand_in_auto']:.2f} a_in_h={x['auto_in_hand']:.2f} word={'Y' if x['word_agrees'] else 'N'} str={'Y' if x['strength_agrees'] else 'N'} {x['status']} name={x['name']}")
        print("  ", {a: b for a, b in v.items() if a != "rows"})
        print("  areas", rep[k]["areas"])
    print("merge groups auto", rep["auto_merge_groups"], "hand", rep["hand_merge_groups"])
    for stop in ("sonic", "mood"):
        print("\n==", stop, rep[stop]["summary"])
        for r in rep[stop]["regions"]:
            print("  ", r)
        print("  areas", rep[stop]["areas"])
    print(rep["timing_s"])
