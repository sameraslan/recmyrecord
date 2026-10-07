"""Score LLM-as-annotator descriptor lists (a language model listing descriptors from its own
knowledge of the album, given only artist / title / year; no audio, no web access).

Input:  cache/llm/out/<model>/<split>_*.json   {"<row>": {"known": 0|1|2, "d": [descriptor, ...]}}
Output: a score matrix over the 120 descriptors (listed descriptors by rank, the rest by a small
        multiple of train prevalence so the ranking is total), metrics on every annotated val row,
        and optionally a leaderboard entry on the harness's val rows (the ones that have audio).

Caveat that belongs next to every number from this file: the model may have seen the site's own
descriptor pages for famous albums during training, so this measures recall of known albums, not
the ability to tag unseen music. It cannot work for releases after the model's training cutoff.

usage: python exp_llm.py --model sonnet [--register] [--split val]
"""
from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

import numpy as np

import common
import metrics

HERE = Path(__file__).resolve().parent
LLM = HERE / "cache" / "llm"


def load_annotations(model: str, split: str = "val") -> tuple[dict[int, dict], dict]:
    vocab = {d: j for j, d in enumerate(common.DESCRIPTORS)}
    lower = {d.lower(): d for d in common.DESCRIPTORS}
    ann, stats = {}, {"files": 0, "bad_json": [], "unknown_words": 0, "fixed_case": 0, "dupes": 0}
    for f in sorted(glob.glob(str(LLM / "out" / model / f"{split}_*.json"))):
        try:
            data = json.load(open(f))
        except Exception as e:  # a batch that did not produce valid JSON is reported, not fatal
            stats["bad_json"].append(f"{Path(f).name}: {e}")
            continue
        stats["files"] += 1
        for key, v in data.items():
            words = []
            for w in v.get("d", []):
                if w not in vocab:
                    if str(w).lower() in lower:
                        w = lower[str(w).lower()]
                        stats["fixed_case"] += 1
                    else:
                        stats["unknown_words"] += 1
                        continue
                if w in words:
                    stats["dupes"] += 1
                    continue
                words.append(w)
            ann[int(key)] = {"known": int(v.get("known", -1)), "d": words}
    return ann, stats


def score_matrix(ann: dict[int, dict], rows: np.ndarray, prior: np.ndarray) -> np.ndarray:
    """Listed descriptors score 2 - 0.05 * rank; everything else gets prior in [0, 1)."""
    vocab = {d: j for j, d in enumerate(common.DESCRIPTORS)}
    base = prior / (prior.max() + 1e-9) * 0.99
    S = np.tile(base, (len(rows), 1)).astype(np.float64)
    for i, r in enumerate(rows):
        for rank, w in enumerate(ann[int(r)]["d"]):
            S[i, vocab[w]] = 2.0 - 0.05 * rank
    return S


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="sonnet")
    ap.add_argument("--split", default="val", choices=["val"])  # test is run once, through harness.final_test
    ap.add_argument("--register", action="store_true", help="also register on the harness leaderboard")
    a = ap.parse_args()

    ann, stats = load_annotations(a.model, a.split)
    want = np.asarray(common.split_rows(a.split))
    have = np.array([r for r in want if int(r) in ann])
    extra = sorted(set(ann) - set(int(r) for r in want))
    print(f"[llm:{a.model}] files {stats['files']}, annotated {len(have)}/{len(want)} {a.split} rows; "
          f"missing {len(want) - len(have)}, ids not in split {len(extra)}; unknown words dropped {stats['unknown_words']}, "
          f"case-fixed {stats['fixed_case']}, duplicates {stats['dupes']}; bad files {stats['bad_json']}")
    train = np.asarray(common.split_rows("train"))
    prior = (common.Y[train] > 0).mean(0)
    Y = common.Y[have]
    S = score_matrix(ann, have, prior)
    S0 = np.tile(prior, (len(have), 1))

    def line(name, Yx, Sx):
        m = metrics.evaluate(Yx, Sx)
        print(f"  {name:34s} n={len(Yx):4d}  cP@10 {m['cP@10']:.3f}  P@10 {m['precision@10']:.3f}  nDCG@10 {m['ndcg@10']:.3f}  "
              f"mAP {m['mAP']:.3f}  perfect@10 {m['perfect@10']:.3f}")
        return m

    out = {"model": a.model, "n": int(len(have)), "stats": stats}
    out["all"] = {k: float(v) for k, v in line(f"llm:{a.model}", Y, S).items() if np.isscalar(v)}
    line("most_frequent (same rows)", Y, S0)
    known = np.array([ann[int(r)]["known"] for r in have])
    nlist = np.array([len(ann[int(r)]["d"]) for r in have])
    print(f"  descriptors listed per album: mean {nlist.mean():.1f} (min {nlist.min()}, max {nlist.max()}); "
          f"true mean {(Y > 0).sum(1).mean():.1f}")
    # precision of the listed set itself (no forced k): how many of the listed words are true
    B = Y > 0
    vocab = {d: j for j, d in enumerate(common.DESCRIPTORS)}
    setp = [np.mean([B[i, vocab[w]] for w in ann[int(r)]["d"]]) if ann[int(r)]["d"] else np.nan for i, r in enumerate(have)]
    top3 = [np.mean([B[i, vocab[w]] for w in ann[int(r)]["d"][:3]]) if ann[int(r)]["d"] else np.nan for i, r in enumerate(have)]
    print(f"  precision of the listed set {np.nanmean(setp):.3f}; of its first 3 words {np.nanmean(top3):.3f}")
    out["set_precision"], out["first3_precision"] = float(np.nanmean(setp)), float(np.nanmean(top3))
    for k in (2, 1, 0):
        if (known == k).sum() >= 5:
            out[f"known{k}"] = {kk: float(v) for kk, v in line(f"  known={k}", Y[known == k], S[known == k]).items() if np.isscalar(v)}
    # by catalogue rank (row index ~ chart position): are obscure albums worse?
    q = np.quantile(have, [0.25, 0.5, 0.75])
    for name, mask in (("rows top quartile", have <= q[0]), ("rows bottom quartile", have > q[2])):
        line("  " + name, Y[mask], S[mask])

    (HERE / "results").mkdir(exist_ok=True)
    json.dump(out, open(HERE / "results" / f"llm_{a.model}_{a.split}.json", "w"), indent=1)
    np.save(LLM / f"scores_{a.model}_{a.split}.npy", S.astype(np.float32))
    np.save(LLM / f"scores_{a.model}_{a.split}_rows.npy", have)

    if a.register:
        import harness as H

        rows_eval = np.asarray(H.eval_rows("val"))
        pos = {int(r): i for i, r in enumerate(have)}
        if all(int(r) in pos for r in rows_eval):
            H.evaluate_run(f"llm__{a.model}_knowledge", S[[pos[int(r)] for r in rows_eval]], rows_eval,
                           config={"arm": "llm", "model": a.model, "input": "artist/title/year only, no web"},
                           notes="LLM world knowledge; contamination-prone, not a clean held-out test", n_train=0)
        else:
            print("  [register] skipped: some harness val rows have no annotation")


if __name__ == "__main__":
    main()
