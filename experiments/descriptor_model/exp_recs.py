"""How should predicted descriptor scores be turned into the 120-d recommender vector of a new album?

    DESCRIPTOR_SHARD_LIMIT=38 .venv/bin/python exp_recs.py            # everything -> results/recs_summary.json
    DESCRIPTOR_SHARD_LIMIT=38 .venv/bin/python exp_recs.py --refs     # only the reference points

Reads saved score matrices only (harness.load_scores); trains nothing, registers nothing, never touches test.
Metrics: recq.py (isolated variant = headline). Tables printed:
  (i)   reference points / noise ceilings on the val rows of the runs (and, label-only, on all val rows)
  (ii)  run x policy on val
  (iii) per run and policy family, the configuration chosen on TRAIN out-of-fold scores (each train album in
        turn is the held-out album with its OOF prediction, the rest of the catalogue real), reported on val.
        Runs without OOF scores (LLM, baselines) only have the fixed grid on val.

Policies (each -> one (n, 120) non-negative vector per album)
  P1  top-k, train rank weights (weights.scores_to_weights), k in {5, 8, 10, 12, 15}; k=10 is the current default
  P2  calibrated count: global threshold with mean count = train mean; per-album count
  P3  dense: the prediction itself as the descriptor block, clipped at 0 (ridge-rank: the regression output;
      probabilities: p_j x mean train weight of descriptor j = expected weight; not defined for rank-only scores)
  P4  de-shrunk dense: per-album L2 norm set to the train median; per-dimension mean/variance matched to train;
      a global factor gamma; top-k of the dense vector (values kept) rescaled to the train median norm
  P5  soft top-k: rank weights x (score / album max score)**beta; dense tail: top-10 rank weights + alpha x dense elsewhere
  P6  neighbour snapping: similarity-weighted mean of the REAL vectors of the m most similar TRAIN albums
      (A: cosine between the top-10 predicted vector and real train vectors; B: cosine between standardised
      score vectors and the train albums' OOF score vectors), re-sparsified (top-10 / mean neighbour count / not)
  P7  local scaling at retrieval time (recq.evaluate(retrieval=...)): changes the site's k-NN -> separate table
  P8  asymmetric: one vector for the album's own list (best list quality), another one for the column other
      albums see (inbound closest to x1). Needs a build change (two vectors per new album) -> reported apart.
Selection on OOF: "*" = best mean RSQ; "+" = best mean RSQ among hub-ok policies (isolated inbound ratio at
both stops <= max(1.5, 1.1 x the default top-10's)). Runs without OOF: post hoc on val, plus a two-fold
cross-fit inside val (choose on one half of the artists, report on the other).
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np

import harness as H
import recq
from common import HERE, N_DESC, Y64, label_suspect_rows, split_rows
from weights import calibrate_threshold, scores_to_weights, train_rank_weights

RUNS = [  # (name, kind of scores, short label)
    ("linear__concat_z_s3_heads+clap+maest-1-12", "prob", "audio-logreg"),
    ("linear__maest-1-12_mean_ridge-rank", "dense", "audio-ridge-rank"),
    ("baseline__genre_mean_all_fulltrain", "prob", "genre-mean"),
    ("llm__sonnet_knowledge", "rank", "llm-sonnet"),
    ("baseline__most_frequent_fulltrain", "prob", "most-frequent"),
]
STOPS = recq.STOPS2
SELECT = "RSQ"            # objective for choosing free parameters on train OOF: mean over the two stops
OUT = HERE / "results" / "recs_summary.json"
SEED = 20261001

TRAIN = split_rows("train")
Y_TRAIN = Y64[TRAIN]
TARGET_COUNT = float(N_DESC[TRAIN].mean())
MEDIAN_NORM = float(np.median(np.linalg.norm(Y_TRAIN, axis=1)))
TRAIN_MEAN, TRAIN_SD = Y_TRAIN.mean(0), Y_TRAIN.std(0)
_cnt = (Y_TRAIN > 0).sum(0)
MU_W = np.where(_cnt >= 5, Y_TRAIN.sum(0) / np.maximum(_cnt, 1), Y_TRAIN[Y_TRAIN > 0].mean())   # mean weight when present
PREVALENCE = (Y_TRAIN > 0).mean(0)
POOL_A = np.setdiff1d(TRAIN, label_suspect_rows())       # train albums whose real vectors may be borrowed


# ---------------------------------------------------------------- vector construction

def topk_per_row(S: np.ndarray, counts: np.ndarray, values: np.ndarray | None = None) -> np.ndarray:
    """Row i keeps its counts[i] highest-scoring columns; they get train rank weights (or `values[i, col]`)."""
    S = np.asarray(S, dtype=np.float64)
    rw = train_rank_weights()
    order = np.argsort(-S, axis=1, kind="stable")
    W = np.zeros_like(S)
    for i, c in enumerate(np.asarray(counts, dtype=int)):
        cols = order[i, :c]
        W[i, cols] = rw[:c] if values is None else values[i, cols]
    return W


def dense_of(S: np.ndarray, kind: str) -> np.ndarray | None:
    if kind == "dense":
        return np.clip(S, 0, None)
    if kind == "prob":
        return S * MU_W[None, :]
    return None


def to_norm(W: np.ndarray, norm: float = MEDIAN_NORM) -> np.ndarray:
    return W * (norm / np.maximum(np.linalg.norm(W, axis=1, keepdims=True), 1e-12))


def per_album_counts(S: np.ndarray, kind: str) -> np.ndarray:
    if kind == "rank":                                    # the language model's own list length
        return np.clip((S >= 1).sum(1), 1, 40)
    mass = np.clip(S, 0, None).sum(1)
    return np.clip(np.rint(mass * TARGET_COUNT / mass.mean()), 1, 40).astype(int)


def snap(rep: np.ndarray, pool_rep: np.ndarray, pool_real: np.ndarray, m: int, resparsify: str,
         exclude: np.ndarray | None = None) -> np.ndarray:
    """Similarity-weighted mean of the real vectors of the m most cosine-similar pool albums.
    exclude[i, j] = True -> pool album j may not be used for query i (same artist group in train-OOF mode)."""
    a = rep / np.maximum(np.linalg.norm(rep, axis=1, keepdims=True), 1e-12)
    b = pool_rep / np.maximum(np.linalg.norm(pool_rep, axis=1, keepdims=True), 1e-12)
    sim = a @ b.T
    if exclude is not None:
        sim[exclude] = -np.inf
    idx = np.argsort(-sim, axis=1, kind="stable")[:, :m]
    w = np.clip(np.take_along_axis(sim, idx, axis=1), 1e-6, None)
    w /= w.sum(1, keepdims=True)
    avg = (pool_real[idx] * w[:, :, None]).sum(1)
    nnz = (avg > 0).sum(1)
    if resparsify == "none":
        return avg
    if resparsify == "k10":
        return topk_per_row(avg, np.minimum(10, nnz))
    if resparsify == "kn":                                # as many as the neighbours have on average
        kn = np.rint((pool_real[idx] > 0).sum(2).mean(1)).astype(int)
        return topk_per_row(avg, np.minimum(np.maximum(kn, 1), nnz))
    raise ValueError(resparsify)


class Ctx:
    """Scores of one run on one row set ("val" or "oof") plus what the policies may use from train."""

    def __init__(self, kind: str, S: np.ndarray, rows: np.ndarray, mode: str, oof: tuple[np.ndarray, np.ndarray] | None):
        self.kind, self.S, self.rows, self.mode = kind, np.asarray(S, dtype=np.float64), np.asarray(rows, dtype=int), mode
        self.dense = dense_of(self.S, kind)
        self.oof = oof
        ref = dense_of(np.asarray(oof[0], dtype=np.float64), kind) if oof is not None else self.dense
        self.stats_source = "train OOF predictions" if oof is not None else "the evaluated rows themselves (label-free)"
        if ref is not None:
            self.pred_mean, self.pred_sd = ref.mean(0), np.maximum(ref.std(0), 1e-6)
        groups = H.artist_groups()
        self.excl_a = (groups[self.rows][:, None] == groups[POOL_A][None, :]) if mode == "oof" else None
        if oof is not None:
            So, ro = np.asarray(oof[0], dtype=np.float64), np.asarray(oof[1], dtype=int)
            self.z_mean, self.z_sd = So.mean(0), np.maximum(So.std(0), 1e-6)
            self.pool_b_rep, self.pool_b_real = (So - self.z_mean) / self.z_sd, Y64[ro]
            self.excl_b = (groups[self.rows][:, None] == groups[ro][None, :]) if mode == "oof" else None
        self._k10 = scores_to_weights(self.S, k=10)


def policies(kind: str, has_oof: bool) -> list[dict]:
    """[{family, label, fn(ctx) -> W}] for one kind of scores."""
    P: list[dict] = []

    def add(family: str, label: str, fn) -> None:
        P.append({"family": family, "label": label, "fn": fn})

    for k in (5, 8, 10, 12, 15):
        add("P1 top-k", f"top-{k}", lambda c, k=k: scores_to_weights(c.S, k=k))
    add("P2 count", "global threshold, mean count = train",
        lambda c: scores_to_weights(c.S, threshold=calibrate_threshold(c.S, TARGET_COUNT)))
    add("P2 count", "per-album count", lambda c: topk_per_row(c.S, per_album_counts(c.S, c.kind)))
    if kind in ("dense", "prob"):
        add("P3 dense", "dense", lambda c: c.dense)
        add("P4 de-shrunk", "dense -> train median L2", lambda c: to_norm(c.dense))
        add("P4 de-shrunk", "dense, per-dim mean/var matched",
            lambda c: np.clip((c.dense - c.pred_mean) / c.pred_sd * TRAIN_SD + TRAIN_MEAN, 0, None))
        for g in (1.25, 1.5, 2.0, 3.0):
            add("P4 de-shrunk", f"dense x {g:g}", lambda c, g=g: g * c.dense)
        for k in (10, 15, 20, 30):
            add("P4 de-shrunk", f"dense top-{k} -> median L2",
                lambda c, k=k: to_norm(topk_per_row(c.dense, np.full(len(c.S), k), values=c.dense)))
        for a in (0.25, 0.5, 1.0):
            add("P5 dense tail", f"top-10 + {a:g} x dense", lambda c, a=a: c._k10 + a * c.dense * (c._k10 == 0))
    for k in (10, 15, 20):
        for b in (0.5, 1.0, 2.0):
            def soft(c, k=k, b=b):
                s = np.clip(c.S, 0, None)
                conf = (s / np.maximum(s.max(1, keepdims=True), 1e-12)) ** b
                return scores_to_weights(c.S, k=k) * conf
            add("P5 soft top-k", f"soft top-{k}, beta={b:g}", soft)
    for m in (1, 3, 5, 10):
        for rs in ("k10", "kn", "none"):
            add("P6 snap A (pred top-10 vs real)", f"snapA m={m} {rs}",
                lambda c, m=m, rs=rs: snap(c._k10, Y64[POOL_A], Y64[POOL_A], m, rs, c.excl_a))
            if has_oof:
                add("P6 snap B (scores vs OOF scores)", f"snapB m={m} {rs}",
                    lambda c, m=m, rs=rs: snap((c.S - c.z_mean) / c.z_sd, c.pool_b_rep, c.pool_b_real, m, rs, c.excl_b))
    return P


# ---------------------------------------------------------------- reference points

def corrupt(Yt: np.ndarray, r: int, rng: np.random.Generator) -> np.ndarray:
    """Replace r of each album's descriptors (uniformly chosen; all of them if it has fewer) by descriptors it
    does not have, drawn without replacement with probability proportional to train prevalence. The newcomer
    inherits the weight (list position) of the descriptor it replaces."""
    W = Yt.copy()
    for i in range(len(W)):
        on = np.flatnonzero(W[i] > 0)
        n = min(r, len(on))
        out = rng.choice(on, size=n, replace=False)
        p = PREVALENCE.copy()
        p[on] = 0
        new = rng.choice(len(p), size=n, replace=False, p=p / p.sum())
        W[i, new] = W[i, out]
        W[i, out] = 0
    return W


def corrupt_popular(Yt: np.ndarray, r: int, rng: np.random.Generator) -> np.ndarray:
    """Like corrupt, but the newcomers are the r most frequent train descriptors the album does not have
    (the kind of error a real predictor makes: it falls back on common words)."""
    W = Yt.copy()
    order = np.argsort(-PREVALENCE, kind="stable")
    for i in range(len(W)):
        on = np.flatnonzero(W[i] > 0)
        n = min(r, len(on))
        out = rng.choice(on, size=n, replace=False)
        new = [j for j in order if W[i, j] == 0][:n]
        W[i, new] = W[i, out]
        W[i, out] = 0
    return W


def shuffle_order(Yt: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    W = Yt.copy()
    for i in range(len(W)):
        on = np.flatnonzero(W[i] > 0)
        W[i, on] = W[i, rng.permutation(on)]
    return W


def set_precision(W: np.ndarray, Yt: np.ndarray) -> float:
    return float(((W > 0) & (Yt > 0)).sum() / max((W > 0).sum(), 1))


def _avg(results: list[dict]) -> dict:
    out = json.loads(json.dumps(results[0]))
    for stop in out["stops"]:
        for m in out["stops"][stop]:
            out["stops"][stop][m] = float(np.mean([r["stops"][stop][m] for r in results]))
    return out


def reference_points(rows: np.ndarray, n_seeds: int = 5) -> dict:
    Yt = Y64[rows]
    reenc = lambda W: scores_to_weights(W, threshold=1e-9, rank_weights=train_rank_weights())  # noqa: E731
    prior = np.tile(PREVALENCE, (len(rows), 1))
    refs: dict[str, dict] = {}

    def one(name: str, W: np.ndarray) -> None:
        refs[name] = {**recq.evaluate(W, rows), "set_precision": set_precision(W, Yt)}

    def seeded(name: str, make) -> None:
        res, prec = [], []
        for s in range(n_seeds):
            W = make(np.random.default_rng(SEED + s))
            res.append(recq.evaluate(W, rows))
            prec.append(set_precision(W, Yt))
        refs[name] = {**_avg(res), "set_precision": float(np.mean(prec)), "n_seeds": n_seeds}

    one("true vectors", Yt)
    one("true set+order, train rank weights (ceiling)", reenc(Yt))
    one("true top-10 only, train rank weights", scores_to_weights(Yt, k=10) * (Yt > 0))
    seeded("true set, order shuffled", lambda rng: shuffle_order(Yt, rng))
    for r in (1, 2, 3, 5):
        seeded(f"true, {r} replaced", lambda rng, r=r: corrupt(Yt, r, rng))
    seeded("true, 2 replaced, train rank weights", lambda rng: reenc(corrupt(Yt, 2, rng)))
    for r in (2, 3, 5):
        seeded(f"true, {r} replaced by most frequent", lambda rng, r=r: corrupt_popular(Yt, r, rng))
    one("all zeros (audio only)", np.zeros_like(Yt))
    one("most-frequent top-10", scores_to_weights(prior, k=10))
    refs["random lists (chance)"] = {**recq.chance(rows), "set_precision": float("nan")}
    return refs


# ---------------------------------------------------------------- printing

COLS = [("ov10", "ov@10", "{:.3f}"), ("R50", "R→50", "{:.3f}"), ("R100", "R→100", "{:.3f}"), ("RSQ", "RSQ", "{:.3f}"),
        ("medrank", "medrk", "{:.0f}"), ("ndcg", "nDCG", "{:.3f}"), ("genre", "genre", "{:.3f}"),
        ("inb_ratio_iso", "inb_i", "{:.2f}"), ("inb_ratio_all", "inb_a", "{:.2f}"), ("zero_iso", "zero_i", "{:.2f}"),
        ("skew_iso", "skew_i", "{:.2f}")]


def _cells(s: dict, cols=COLS) -> str:
    out = []
    for key, _, fmt in cols:
        v = s.get(key)
        out.append(f"{fmt.format(v):>6s}" if v is not None and np.isfinite(v) else f"{'-':>6s}")
    return " ".join(out)


def print_table(title: str, entries: list[tuple[str, dict]], extra_head: str = "", extra=lambda r: "", cols=COLS) -> None:
    w = max(len(n) for n, _ in entries) + 1
    print(f"\n{title}")
    head = " ".join(f"{h:>6s}" for _, h, _ in cols)
    print(f"{'':{w}s} {extra_head}| balanced: {head} | mood: {head}")
    for name, r in entries:
        print(f"{name:{w}s} {extra(r)}| {' ' * 10}{_cells(r['stops']['balanced'], cols)} | {' ' * 6}{_cells(r['stops']['mood'], cols)}")


def sel_value(r: dict, metric: str = SELECT) -> float:
    return float(np.mean([r["stops"][s][metric] for s in STOPS]))


# ---------------------------------------------------------------- main

HUB_KEYS = ("inb_ratio_iso", "zero_iso", "skew_iso", "max_iso")
ARR_KEYS = ("ov10", "R50", "RSQ", "ndcg", "inbound_before", "inbound_after")


def hub_limit(default: dict, stop: str) -> float:
    """"Not more of a hub than the current default" (with a floor of 1.5x the real inbound count)."""
    return max(1.5, 1.1 * default["stops"][stop]["inb_ratio_iso"])


def hub_ok(r: dict, default: dict) -> bool:
    return all(r["stops"][s]["inb_ratio_iso"] <= hub_limit(default, s) for s in STOPS)


def hub_distance(r: dict) -> float:
    return float(np.mean([abs(np.log(max(r["stops"][s]["inb_ratio_iso"], 1e-3))) for s in STOPS]))


def compose(row: dict, col: dict) -> dict:
    """Asymmetric construction: list metrics of the `row` policy, inbound metrics of the `col` policy."""
    out = json.loads(json.dumps(H._jsonable(row)))
    for s in STOPS:
        for key in list(out["stops"][s]):
            if key.endswith("_all"):
                del out["stops"][s][key]
        for key in HUB_KEYS:
            out["stops"][s][key] = col["stops"][s][key]
    return out


def _pop_arrays(r: dict) -> dict:
    out = {}
    for s in STOPS:
        a = r["stops"][s].pop("arrays")
        out[s] = {k: a[k] for k in ARR_KEYS}
    return out


def crossfit(arr: dict[str, dict], halves: np.ndarray) -> dict:
    """Honest val numbers for runs without train OOF: choose the policy on one half of the val albums
    (artist-group parity, as in harness.crossfit_precision_coverage), report it on the other half, pool."""
    labels = list(arr)

    def rsq_of(label: str, mask: np.ndarray) -> float:
        return float(np.mean([arr[label][s]["RSQ"][mask].mean() for s in STOPS]))

    def inb(label: str, stop: str, mask: np.ndarray) -> float:
        a = arr[label][stop]
        return float(a["inbound_after"][mask].sum() / max(a["inbound_before"][mask].sum(), 1))

    out = {}
    for mode in ("free", "hub_ok"):
        pooled = {s: {k: np.zeros(len(halves)) for k in ARR_KEYS} for s in STOPS}
        chosen = []
        for h in (0, 1):
            fit, ev = halves == h, halves != h
            cands = labels if mode == "free" else [
                l for l in labels if all(inb(l, s, fit) <= max(1.5, 1.1 * inb("top-10", s, fit)) for s in STOPS)]
            best = max(cands, key=lambda l: rsq_of(l, fit))
            chosen.append(best)
            for s in STOPS:
                for k in ARR_KEYS:
                    pooled[s][k][ev] = arr[best][s][k][ev]
        out[mode] = {"chosen_per_half": chosen, "stops": {
            s: {**{k: float(pooled[s][k].mean()) for k in ("ov10", "R50", "RSQ", "ndcg")},
                "inb_ratio_iso": float(pooled[s]["inbound_after"].sum() / pooled[s]["inbound_before"].sum())} for s in STOPS}}
    return out


def run_experiments() -> dict:
    out: dict = {"runs": {}}
    val_rows = H.eval_rows("val")
    _, in_cat = recq.catalogue_index(val_rows)
    halves = (H.artist_groups()[val_rows[in_cat]] % 2)
    for name, kind, short in RUNS:
        t0 = time.perf_counter()
        S, rows = H.load_scores(name, "val")
        assert np.array_equal(rows, val_rows), f"{name}: not on the canonical val rows of this snapshot"
        try:
            oof = H.load_scores(name, "train_oof")
            assert (H.load_splits()[oof[1]] == "train").all()
        except FileNotFoundError:
            oof = None
        pols = policies(kind, oof is not None)
        cv = Ctx(kind, S, rows, "val", oof)
        co = Ctx(kind, oof[0], oof[1], "oof", oof) if oof is not None else None
        res = {"kind": kind, "short": short, "has_oof": oof is not None, "n_oof": int(len(oof[1])) if oof else 0,
               "dense_stats_source": cv.stats_source, "policies": {}}
        Wval: dict[str, np.ndarray] = {}
        arr: dict[str, dict] = {}
        for p in pols:
            W = p["fn"](cv)
            Wval[p["label"]] = W
            ent = {"family": p["family"], "val": recq.evaluate(W, rows, keep_arrays=True)}
            arr[p["label"]] = _pop_arrays(ent["val"])
            if co is not None:
                ent["oof"] = recq.evaluate(p["fn"](co), co.rows, all_at_once=False)
                ent["oof_select"] = sel_value(ent["oof"])
            res["policies"][p["label"]] = ent
        P = res["policies"]
        fams: dict[str, list[str]] = {}
        for label, ent in P.items():
            fams.setdefault(ent["family"], []).append(label)
        if co is not None:           # (iii) every choice below is made on train OOF
            d_oof = P["top-10"]["oof"]
            res["chosen_on_oof"] = {f: max(ls, key=lambda l: P[l]["oof_select"]) for f, ls in fams.items()}
            res["best_on_oof"] = max(P, key=lambda l: P[l]["oof_select"])
            res["best_on_oof_by_R50"] = max(P, key=lambda l: sel_value(P[l]["oof"], "R50"))
            res["best_on_oof_by_ndcg"] = max(P, key=lambda l: sel_value(P[l]["oof"], "ndcg"))
            res["best_on_oof_hub_ok"] = max([l for l in P if hub_ok(P[l]["oof"], d_oof)], key=lambda l: P[l]["oof_select"])
            res["hub_neutral_on_oof"] = min(P, key=lambda l: hub_distance(P[l]["oof"]))
            row, col = res["best_on_oof"], res["hub_neutral_on_oof"]
        else:                        # no OOF: post hoc on val (optimistic) + a two-fold cross-fit inside val
            d_val = P["top-10"]["val"]
            res["best_on_val_posthoc"] = max(P, key=lambda l: sel_value(P[l]["val"]))
            res["best_on_val_posthoc_hub_ok"] = max([l for l in P if hub_ok(P[l]["val"], d_val)], key=lambda l: sel_value(P[l]["val"]))
            res["hub_neutral_on_val_posthoc"] = min(P, key=lambda l: hub_distance(P[l]["val"]))
            res["val_crossfit"] = crossfit(arr, halves)
            row, col = res["best_on_val_posthoc"], res["hub_neutral_on_val_posthoc"]
        # P8 asymmetric: own list from the best-list policy, column (what others see) from the hub-neutral one
        res["P8_asymmetric"] = {"row": row, "col": col, "val": compose(P[row]["val"], P[col]["val"]),
                                "note": "needs a build change: two vectors per new album (own list / inbound)"}
        # P7: local scaling at retrieval time, for the default vector and the chosen row vector
        res["P7_local_scaling"] = {}
        for label in dict.fromkeys(["top-10", row]):
            for retr in ("ls-col", "ls-rowcol", "ls-full"):
                res["P7_local_scaling"][f"{label} + {retr}"] = recq.evaluate(Wval[label], rows, retrieval=retr)
        res["seconds"] = time.perf_counter() - t0
        out["runs"][name] = res
        print(f"[exp_recs] {short}: {len(pols)} policies, OOF {'yes (%d train albums)' % len(oof[1]) if oof else 'no'}, "
              f"{res['seconds']:.1f}s", flush=True)
    return out


def _gap(d: dict, b: dict, ceil: dict, title: str) -> None:
    print(f"    {title}")
    for stop in STOPS:
        gaps = []
        for m in ("ov10", "R50", "RSQ", "ndcg"):
            d0, b0, c0 = d["stops"][stop][m], b["stops"][stop][m], ceil["stops"][stop][m]
            gaps.append(f"{m} {d0:.3f}->{b0:.3f} (ceiling {c0:.3f}; {100 * (b0 - d0) / (c0 - d0):+.0f}% of gap)")
        print(f"      {stop}: " + "; ".join(gaps) + f"; inbound x{d['stops'][stop]['inb_ratio_iso']:.2f}->x{b['stops'][stop]['inb_ratio_iso']:.2f}")


def print_runs(out: dict, refs: dict) -> None:
    ceil = refs["true set+order, train rank weights (ceiling)"]
    for name, res in out["runs"].items():
        marks = {res.get("best_on_oof"): "* ", res.get("best_on_oof_hub_ok"): "+ "}
        ents = [(marks.get(l, "  ") + l, e["val"]) for l, e in res["policies"].items()]
        print_table(f"(ii) {res['short']}  [{name}]  val, n={ents[0][1]['n_eval']}   (* = chosen on train OOF, + = chosen on OOF among hub-ok policies)",
                    ents, extra_head=f"{'nnz':>5s} {'L2':>5s} ", extra=lambda r: f"{r['mean_n_nonzero']:5.1f} {r['mean_l2']:5.2f} ")
        print_table(f"     {res['short']}: P7 local scaling at retrieval (NEEDS A BUILD CHANGE; ls-full inbound is relative to the locally-scaled real lists)",
                    list(res["P7_local_scaling"].items()))
    print("\n(iii) configuration chosen on train OOF (objective: mean RSQ over balanced and mood), reported on val")
    for name, res in out["runs"].items():
        P = res["policies"]
        d = P["top-10"]["val"]
        a8 = res["P8_asymmetric"]
        if not res["has_oof"]:
            b, bh = res["best_on_val_posthoc"], res["best_on_val_posthoc_hub_ok"]
            print_table(f"\n  {res['short']}: no train OOF scores -> fixed grid on val; choices below are post hoc on val (optimistic)",
                        [("default top-10", d), (f"post-hoc best: {b}", P[b]["val"]), (f"post-hoc best, hub-ok: {bh}", P[bh]["val"]),
                         (f"P8 asymmetric: own list {a8['row']} / column {a8['col']}", a8["val"])])
            for mode, c in res["val_crossfit"].items():
                print(f"    cross-fit inside val ({mode}; chosen per half: {c['chosen_per_half']}): " + " | ".join(
                    f"{s}: ov10 {v['ov10']:.3f} R50 {v['R50']:.3f} RSQ {v['RSQ']:.3f} nDCG {v['ndcg']:.3f} inbound x{v['inb_ratio_iso']:.2f}"
                    for s, v in c["stops"].items()))
            _gap(d, P[b]["val"], ceil, f"default -> post-hoc best ({b})")
            _gap(d, P[bh]["val"], ceil, f"default -> post-hoc best among hub-ok ({bh})")
            continue
        ents = [("default top-10", d)]
        for fam, label in res["chosen_on_oof"].items():
            e = P[label]
            ents.append((f"{fam}: {label} (OOF RSQ {e['oof_select']:.3f}, OOF inbound x{e['oof']['stops']['balanced']['inb_ratio_iso']:.1f}/"
                         f"x{e['oof']['stops']['mood']['inb_ratio_iso']:.1f})", e["val"]))
        bh = res["best_on_oof_hub_ok"]
        ents.append((f"best hub-ok on OOF: {bh} (OOF RSQ {P[bh]['oof_select']:.3f})", P[bh]["val"]))
        ents.append((f"P8 asymmetric: own list {a8['row']} / column {a8['col']}", a8["val"]))
        print_table(f"\n  {res['short']}: overall choice on OOF = {res['best_on_oof']} (by R→50: {res['best_on_oof_by_R50']}; by nDCG: "
                    f"{res['best_on_oof_by_ndcg']}); default top-10 OOF RSQ {P['top-10']['oof_select']:.3f}", ents)
        _gap(d, P[res["best_on_oof"]]["val"], ceil, f"default -> OOF choice ({res['best_on_oof']})")
        _gap(d, P[bh]["val"], ceil, f"default -> OOF choice among hub-ok ({bh})")
        _gap(d, a8["val"], ceil, "default -> P8 asymmetric")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refs", action="store_true", help="only the reference points")
    a = ap.parse_args()
    t0 = time.perf_counter()
    rows = H.eval_rows("val")
    print(f"val rows of this snapshot: {len(rows)}; train mean count {TARGET_COUNT:.2f}, train median L2 {MEDIAN_NORM:.2f}; "
          f"chance: ov@10 {10 / 4080:.4f}, R→50 {50 / 4080:.4f}, R→100 {100 / 4080:.4f}, RSQ 0, medrank ~2040")
    refs = reference_points(rows)
    pcols = lambda r: f"{r.get('set_precision', float('nan')):5.2f} "  # noqa: E731
    print_table(f"(i) reference points, the {refs['true vectors']['n_eval']} val albums of the runs (isolated; inb_a = all replaced at once)",
                list(refs.items()), extra_head=f"{'prec':>5s} ", extra=pcols)
    refs_all = reference_points(split_rows("val"))
    print_table(f"(i') the same on all {refs_all['true vectors']['n_eval']} labelled val albums (label-only, less noisy)",
                list(refs_all.items()), extra_head=f"{'prec':>5s} ", extra=pcols)
    summary = {"stops": list(STOPS), "select_metric": SELECT, "chance": {"ov10": 10 / 4080, "R50": 50 / 4080, "R100": 100 / 4080, "RSQ": 0.0},
               "reference_points_runs_val_rows": refs, "reference_points_all_val_rows": refs_all,
               "train": {"mean_count": TARGET_COUNT, "median_l2": MEDIAN_NORM}}
    if not a.refs:
        out = run_experiments()
        print_runs(out, refs)
        summary.update(out)
    summary["seconds"] = time.perf_counter() - t0
    if not a.refs:
        OUT.write_text(json.dumps(H._jsonable(summary), indent=1, ensure_ascii=False) + "\n")
        print(f"\nwrote {OUT}")
    print(f"{summary['seconds']:.1f}s")


if __name__ == "__main__":
    main()
