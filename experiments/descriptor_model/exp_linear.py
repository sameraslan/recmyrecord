"""Experiment arm: linear probes, k-NN and feature selection on frozen album embeddings.

    P="OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 10 .venv/bin/python"
    $P exp_linear.py layers     # layer sweep per encoder (logistic probe, C by train CV); best layer -> val
    $P exp_linear.py pooling    # mean vs mean+std vs mean+std+max at the best layer; CV-best pooling -> val
    $P exp_linear.py targets    # binary logistic vs ridge->rank weights vs ridge->binary (train CV); ridge runs -> val
    $P exp_linear.py concat     # greedy forward selection over encoder blocks (train-CV nDCG@10); each step -> val
    $P exp_linear.py knn        # k-NN label transfer on the best single block and the best concatenation
    $P exp_linear.py late       # late fusion of the per-encoder probes, weights from train OOF scores only
    $P exp_linear.py all        # the six above, in this order

Common options: --quick (tiny grids, and everything is written to cache/quick_linear/ instead of results/
and cache/scores/, so a smoke test never touches the shared leaderboard), --force (recompute even if a
result with the same data snapshot and grid exists), --no-downstream, --encoders effnet heads clap maest mert.

Model-selection rule: every choice (C / alpha, layer, pooling, target, block set, block transform, k,
fusion weights) is made on the artist-disjoint TRAIN folds (harness.cv_folds). Standardisers, PCA bases and
block scales are fitted on the fit part of each fold, and on all of train for the final model; validation
rows are only ever transformed and scored. Validation is touched by harness.evaluate_run only.

Outputs: results/val/linear__*.json, results/val/knn__cv_*.json (+ leaderboard rows, val scores and
train OOF scores in cache/scores/), and results/linear_summary.json with every train-CV table.

Resuming: a CV table entry / a registered run is reused when it was computed on the same shard snapshot
(n_shards, n_train, n_val) with the same grid; otherwise it is recomputed. Later sub-commands read the
choices of earlier ones from the summary (and fall back to maest:7 / mert:8 / mean with a warning).
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")

import argparse
import json
import re
import time
from pathlib import Path

import numpy as np

import features as F
import harness as H
import metrics as M
from baselines import knn_label_transfer
from common import HERE
from probes import DEFAULT_CS, fit_logreg, predict_logreg  # importing probes sets torch to 2 threads

ENCODERS = ("effnet", "heads", "clap", "maest", "mert")          # mert_v2: extraction disabled; pass --encoders to add it
DEFAULT_LAYER = {"maest": 7, "mert": 8, "mert_v2": 16}
POOLINGS = ("mean", "mean+std", "mean+std+max")
ALPHAS = (1e1, 3e1, 1e2, 3e2, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6)          # ridge: sum sq. error + alpha * ||w||^2 (closed form, whole path is free)
VARIANTS = ("z", "zs", "pca128s", "pca256s")
KNN_KS = (5, 10, 20, 35, 50, 100)
KNN_WEIGHTINGS = (("uniform", None), ("similarity", None), ("softmax", 0.05), ("softmax", 0.1))
MODELS = ("logreg", "ridge_rank", "ridge_bin")
SUMMARY_NAME = "linear_summary.json"


# ---------------------------------------------------------------- small helpers

def tag(spec: str) -> str:
    return spec.replace(":", "-")


def jnorm(o):
    return json.loads(json.dumps(H._jsonable(o)))


def gkey(g) -> str:
    return f"{g:g}"


def snapshot() -> dict:
    return {"n_shards": F.n_shards(), "n_train": int(len(H.train_rows())), "n_val": int(len(H.eval_rows("val"))),
            "n_albums_extracted": len(F.album_index()), "n_albums_matched": F.n_matched_albums()}


def snap_key() -> dict:
    s = snapshot()
    return {k: s[k] for k in ("n_shards", "n_train", "n_val")}


def ptable(headers: list[str], rows: list[list], title: str = "") -> None:
    cells = [[(f"{v:.4f}" if isinstance(v, float) else str(v)) for v in r] for r in rows]
    w = [max(len(h), *(len(r[i]) for r in cells)) if cells else len(h) for i, h in enumerate(headers)]
    if title:
        print(f"\n== {title}")
    print("  ".join(h.ljust(w[i]) if i == 0 else h.rjust(w[i]) for i, h in enumerate(headers)))
    for r in cells:
        print("  ".join(c.ljust(w[i]) if i == 0 else c.rjust(w[i]) for i, c in enumerate(r)))


class Summary:
    def __init__(self, path: Path):
        self.path = path
        self.d = json.loads(path.read_text()) if path.exists() else {}

    def section(self, name: str) -> dict:
        return self.d.setdefault(name, {})

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.d["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        tmp = self.path.with_suffix(f".json.{os.getpid()}.part")
        tmp.write_text(json.dumps(H._jsonable(self.d), indent=1) + "\n")
        os.replace(tmp, self.path)


# ---------------------------------------------------------------- data

def load_blocks(blocks: list[tuple[str, str]]) -> dict:
    """Train / val matrices of several (spec, pooling) blocks on their COMMON rows (one block at a time)."""
    ds = [H.get_data(spec, pooling, verbose=False) for spec, pooling in blocks]
    rtr, rva = ds[0]["rows_train"], ds[0]["rows_val"]
    for d in ds[1:]:
        rtr, rva = np.intersect1d(rtr, d["rows_train"]), np.intersect1d(rva, d["rows_val"])
    Xtr = [d["X_train"][np.searchsorted(d["rows_train"], rtr)] for d in ds]
    Xva = [d["X_val"][np.searchsorted(d["rows_val"], rva)] for d in ds]
    from common import Y
    return {"Xtr": Xtr, "Xva": Xva, "rows_train": rtr, "rows_val": rva, "Y": Y[rtr],
            "rows_val_missing": np.setdiff1d(H.eval_rows("val"), rva), "blocks": [list(b) for b in blocks],
            "dims": [int(x.shape[1]) for x in Xtr]}


# ---------------------------------------------------------------- block transforms (fitted on the fit rows only)

def parse_variant(variant: str) -> tuple[int | None, bool]:
    """z = z-score; zs = z-score, then each block scaled to unit total variance (so a 1280-d block has
    the same weight as a 512-d one); pca<k> = z-score + PCA to k components (variances kept);
    pca<k>s = the same + unit total variance per block."""
    m = re.fullmatch(r"z(s?)|pca(\d+)(s?)", variant)
    if not m:
        raise ValueError(f"unknown block transform {variant!r}")
    if variant.startswith("z"):
        return None, bool(m.group(1))
    return int(m.group(2)), bool(m.group(3))


def top_components(Z: np.ndarray, k: int) -> np.ndarray:
    """(d, k) leading right singular vectors of Z (already centred)."""
    Z64 = Z.astype(np.float64)
    n, d = Z64.shape
    if n >= d:
        w, V = np.linalg.eigh(Z64.T @ Z64)
        return V[:, ::-1][:, :k]
    w, U = np.linalg.eigh(Z64 @ Z64.T)
    idx = np.argsort(-w)[:k]
    idx = idx[w[idx] > 1e-8 * max(w.max(), 1e-30)]
    return (Z64.T @ U[:, idx]) / np.sqrt(w[idx])


def fit_block(A: np.ndarray, variant: str):
    k, scale = parse_variant(variant)
    sc = F.Standardizer().fit(A)
    Z = sc.transform(A)
    V = None
    if k is not None:
        kk = min(k, Z.shape[1], max(1, len(Z) - 1))
        if kk < Z.shape[1]:
            V = top_components(Z, kk).astype(np.float32)
            Z = Z @ V
    w = 1.0
    if scale:
        w = 1.0 / np.sqrt(max(float((Z.astype(np.float64) ** 2).sum() / len(Z)), 1e-12))
    return sc, V, np.float32(w)


def apply_block(tf, X: np.ndarray) -> np.ndarray:
    sc, V, w = tf
    Z = sc.transform(X)
    if V is not None:
        Z = Z @ V
    return (Z * w).astype(np.float32)


class FoldCache:
    """Transformed blocks per CV fold (index i < n_folds: fitted on the fold's fit rows, applied to its
    held-out rows) and for the final model (index n_folds: fitted on all train rows, applied to val)."""

    def __init__(self, Xtr: list[np.ndarray], folds, variant: str, Xva: list[np.ndarray] | None = None):
        parse_variant(variant)
        self.Xtr, self.Xva, self.folds, self.variant = Xtr, Xva, folds, variant
        self.final = len(folds)
        self._c: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}

    def _block(self, i: int, b: int):
        if (i, b) not in self._c:
            X = self.Xtr[b]
            if i == self.final:
                assert self.Xva is not None
                A, Hd = X, self.Xva[b]
            else:
                fit, held = self.folds[i]
                A, Hd = X[fit], X[held]
            tf = fit_block(A, self.variant)          # statistics from the fit rows only
            self._c[(i, b)] = (apply_block(tf, A), apply_block(tf, Hd))
        return self._c[(i, b)]

    def get(self, i: int, subset: list[int] | None = None) -> tuple[np.ndarray, np.ndarray]:
        subset = list(range(len(self.Xtr))) if subset is None else list(subset)
        parts = [self._block(i, b) for b in subset]
        A, Hd = np.hstack([p[0] for p in parts]), np.hstack([p[1] for p in parts])
        if self.variant != "z":   # put the matrix back on the unit-variance-per-column scale the C / alpha grids assume
            g = np.float32(1.0 / np.sqrt(max(float((A.astype(np.float64) ** 2).mean()), 1e-12)))
            A, Hd = A * g, Hd * g
        return A, Hd


# ---------------------------------------------------------------- models

def targets_for(Y: np.ndarray, model: str) -> np.ndarray:
    if model == "ridge_rank":
        return np.asarray(Y, dtype=np.float64)
    return (np.asarray(Y) > 0).astype(np.float64)


def ridge_path(A: np.ndarray, T: np.ndarray, Hd: np.ndarray, alphas) -> dict[float, np.ndarray]:
    """Ridge predictions for Hd at every alpha from one eigendecomposition (A is centred: the intercept is
    the target mean). Primal when d <= n, dual otherwise."""
    A, Hd = A.astype(np.float64), Hd.astype(np.float64)
    mu = T.mean(0)
    Tc = T - mu
    n, d = A.shape
    if d <= n:
        w, V = np.linalg.eigh(A.T @ A)
        P, proj = V.T @ (A.T @ Tc), Hd @ V
    else:
        w, U = np.linalg.eigh(A @ A.T)
        P, proj = U.T @ Tc, (Hd @ A.T) @ U
    w = np.maximum(w, 0.0)
    return {a: mu + proj @ (P / (w[:, None] + a)) for a in alphas}


def logreg_path(A: np.ndarray, B: np.ndarray, Hd: np.ndarray, Cs) -> dict[float, np.ndarray]:
    """probes.fit_logreg along the C path (warm-started). With fewer rows than columns the problem is
    rotated ONCE into the row space (same optimum; fit_logreg would redo that SVD for every C)."""
    A, Hd = A.astype(np.float64), Hd.astype(np.float64)
    if A.shape[0] < A.shape[1]:
        U, s, Vt = np.linalg.svd(A, full_matrices=False)
        A, Hd = U * s, Hd @ Vt.T
    out, init = {}, None
    for C in sorted(Cs):
        init = fit_logreg(A, B, C, init=init)
        out[C] = predict_logreg(Hd, *init)
    return out


def path_predict(A, T, Hd, model: str, grid) -> dict[float, np.ndarray]:
    return logreg_path(A, T, Hd, grid) if model == "logreg" else ridge_path(A, T, Hd, grid)


def pick(table: dict[float, dict], model: str) -> float:
    """Best grid value by out-of-fold nDCG@10; ties -> the more regularised one."""
    return max(table, key=lambda g: (table[g]["ndcg@10"], -g if model == "logreg" else g))


def rank_metrics(Y: np.ndarray, S: np.ndarray) -> dict:
    return {"ndcg@10": float(M.ndcg_at_k(Y, S, 10).mean()), "precision@10": float(M.precision_at_k(Y, S, 10).mean())}


def cv_eval(cache: FoldCache, Y: np.ndarray, model: str, grid, subset: list[int] | None = None,
            keep_oof: bool = True) -> dict:
    """Out-of-fold scores over the train folds for every grid value. -> table, best, oof (best only)."""
    grid = sorted(float(g) for g in grid)
    T = targets_for(Y, model)
    oof = {g: np.full(Y.shape, np.nan) for g in grid}
    t0 = time.perf_counter()
    for i, (fit, held) in enumerate(cache.folds):
        A, Hd = cache.get(i, subset)
        for g, P in path_predict(A, T[fit], Hd, model, grid).items():
            oof[g][held] = P
    table = {}
    for g in grid:
        assert np.isfinite(oof[g]).all(), "some train rows are in no fold"
        table[g] = rank_metrics(Y, oof[g])
    best = pick(table, model)
    return {"model": model, "table": table, "best": best, "at_grid_edge": bool(best in (grid[0], grid[-1]) and len(grid) > 1),
            "ndcg@10": table[best]["ndcg@10"], "precision@10": table[best]["precision@10"],
            "oof": oof[best] if keep_oof else None, "n_folds": len(cache.folds), "seconds": time.perf_counter() - t0}


def slim(r: dict) -> dict:
    return {"best": r["best"], "ndcg@10": r["ndcg@10"], "precision@10": r["precision@10"], "at_grid_edge": r["at_grid_edge"],
            "n_folds": r["n_folds"], "seconds": round(r["seconds"], 1), "table": {gkey(g): v for g, v in r["table"].items()}}


def fit_final(cache: FoldCache, Y: np.ndarray, model: str, g: float, subset: list[int] | None = None) -> np.ndarray:
    A, Hd = cache.get(cache.final, subset)
    return path_predict(A, targets_for(Y, model), Hd, model, [g])[g]


# ---------------------------------------------------------------- registering a run

def make_sig(a, **kw) -> dict:
    return jnorm({**snap_key(), "quick": bool(a.quick), **kw})


def load_done(name: str, sig: dict, need_oof: bool = True) -> dict | None:
    p = H._val_dir() / f"{name}.json"
    if not p.exists() or not (H.SCORES_DIR / f"{name}__val.npy").exists():
        return None
    if need_oof and not (H.SCORES_DIR / f"{name}__train_oof.npy").exists():
        return None
    res = json.loads(p.read_text())
    return res if res.get("config", {}).get("sig") == sig else None


def val_entry(res: dict) -> dict:
    r, c = res["metrics"]["ranking"], res["config"]
    return {"name": res["name"], "n_train": res["data"]["n_train"], "n_val": res["data"]["n_val"],
            "cv_ndcg@10": c.get("cv_ndcg@10"), "cv_precision@10": c.get("cv_precision@10"), "best": c.get("best"),
            "at_grid_edge": c.get("at_grid_edge"), "cv": c.get("cv"),
            "val": {k: r[k] for k in ("precision@10", "ndcg@10", "mAP", "precision@1", "precision@3", "macro_auc")}}


def finish_run(a, name: str, S_val: np.ndarray, rows_val: np.ndarray, missing: np.ndarray, fill: np.ndarray,
               S_oof: np.ndarray, rows_train: np.ndarray, config: dict, notes: str = "") -> dict:
    H.save_train_oof(name, S_oof, rows_train)
    if len(missing):
        S_val, rows_val = H.complete_scores(S_val, rows_val, fill=fill)
    config = {**config, "val_rows_filled": int(len(missing))}
    res = H.evaluate_run(name, S_val, rows_val, config=config, notes=notes, n_train=len(rows_train),
                         downstream=not a.no_downstream)
    return val_entry(res)


def fill_for(model_or_labels: str, Y: np.ndarray) -> np.ndarray:
    return Y.mean(0) if model_or_labels in ("ridge_rank", "rank") else (Y > 0).mean(0)


def probe_and_register(a, name: str, blocks: list[tuple[str, str]], variant: str, model: str, grid, *,
                       data: dict | None = None, cvres: dict | None = None, notes: str = "", extra: dict | None = None) -> dict:
    """CV over the grid on train, final fit on all train, OOF saved, val registered. Resumable."""
    grid = sorted(float(g) for g in grid)
    sig = make_sig(a, blocks=[list(b) for b in blocks], variant=variant, model=model, grid=grid)
    prev = None if a.force else load_done(name, sig)
    if prev is not None:
        print(f"[skip] {name}: result exists for this snapshot and grid")
        return val_entry(prev)
    t0 = time.perf_counter()
    data = data or load_blocks(blocks)
    folds = H.cv_folds(data["rows_train"])
    cache = FoldCache(data["Xtr"], folds, variant, data["Xva"])
    r = cvres if cvres is not None and cvres.get("oof") is not None else cv_eval(cache, data["Y"], model, grid)
    S_val = fit_final(cache, data["Y"], model, r["best"])
    config = {"arm": "linear", "model": {"logreg": "one-vs-rest L2 logistic regression (probes.fit_logreg)",
                                         "ridge_rank": "ridge regression onto the rank weights",
                                         "ridge_bin": "ridge regression onto binary targets"}[model],
              "model_key": model, "blocks": [list(b) for b in blocks], "spec": "+".join(b[0] for b in blocks),
              "pooling": blocks[0][1] if len({b[1] for b in blocks}) == 1 else [b[1] for b in blocks],
              "dims": data["dims"], "block_transform": variant, "grid": grid, "best": r["best"],
              "at_grid_edge": r["at_grid_edge"], "cv": {gkey(g): v for g, v in r["table"].items()},
              "cv_ndcg@10": r["ndcg@10"], "cv_precision@10": r["precision@10"], "cv_folds": r["n_folds"],
              "cv_criterion": "out-of-fold nDCG@10 on train (artist-disjoint folds); transforms fitted per fold",
              "fit_seconds": round(time.perf_counter() - t0, 1), "sig": sig, **(extra or {})}
    return finish_run(a, name, S_val, data["rows_val"], data["rows_val_missing"], fill_for(model, data["Y"]),
                      r["oof"], data["rows_train"], config, notes)


# ---------------------------------------------------------------- choices made by earlier sub-commands

def layer_specs(enc: str, quick: bool) -> list[str]:
    n_layers, _, first = F.ENCODERS[enc]
    if n_layers is None:
        return [enc]
    if quick:
        return [f"{enc}:{l}" for l in ((8, 16) if enc == "mert_v2" else (4, 8))]
    if enc == "mert_v2":
        return [f"{enc}:{l}" for l in range(2, 25, 2)] + [f"{enc}:avg"]
    return [f"{enc}:{l}" for l in range(first, first + n_layers)] + [f"{enc}:avg"]


def best_blocks(S: Summary, encoders, want_run: bool = False) -> list[dict]:
    """Per encoder: best (spec, pooling) from the `pooling` section, else best layer from `layers` (mean),
    else a default. Choices made on an older shard snapshot are used with a warning."""
    out, now = [], snap_key()
    for enc in encoders:
        b = S.d.get("pooling", {}).get("best", {}).get(enc) or S.d.get("layers", {}).get("best", {}).get(enc)
        if b is None:
            spec = enc if F.ENCODERS[enc][0] is None else f"{enc}:{DEFAULT_LAYER[enc]}"
            print(f"[warn] no layers/pooling result for {enc}: using the default {spec} / mean")
            b = {"spec": F.canonical_spec(spec), "pooling": "mean", "name": None, "cv_ndcg@10": None}
        elif b.get("snapshot") != now:
            print(f"[warn] {enc}: best layer/pooling was chosen on another snapshot {b.get('snapshot')} (now {now})")
        if want_run and (b.get("name") is None or b.get("snapshot") != now):
            raise SystemExit(f"{enc}: no registered probe on the current snapshot; run `layers` (and `pooling`) first")
        out.append({"enc": enc, **b})
    return out


def cached_cv(a, S: Summary, store: dict, key: str, blocks, variant: str, model_grids: dict[str, tuple], keep: str = "logreg"):
    """CV tables for one feature set (cached in the summary). Returns (entry, in-memory result or None, data or None)."""
    sig = make_sig(a, blocks=[list(b) for b in blocks], variant=variant,
                   grids={m: sorted(float(g) for g in gr) for m, gr in model_grids.items()})
    ent = store.get(key)
    if ent and ent.get("sig") == sig and not a.force:
        return ent, None, None
    data = load_blocks(blocks)
    cache = FoldCache(data["Xtr"], H.cv_folds(data["rows_train"]), variant)
    ent = {"sig": sig, "n_train": int(len(data["rows_train"])), "dim": int(sum(data["dims"]))}
    kept = None
    for m, grid in model_grids.items():
        r = cv_eval(cache, data["Y"], m, grid, keep_oof=(m == keep))
        ent[m] = slim(r)
        if m == keep:
            kept = r
    store[key] = ent
    S.save()
    return ent, kept, data


# ---------------------------------------------------------------- 1. layers

def cmd_layers(a, S: Summary) -> None:
    sec = S.section("layers")
    sec["snapshot"], sec["C_grid"], sec["ridge_alpha_grid"] = snapshot(), list(a.Cs), list(ALPHAS)
    sec["note"] = ("cv[enc][spec].logreg = L2 logistic probe (C by CV); ridge_rank = ridge onto rank weights, shown "
                   "for reference. best[enc] = arg max of the logistic probe's out-of-fold nDCG@10 (never val).")
    cv, best = sec.setdefault("cv", {}), sec.setdefault("best", {})
    rows = []
    for enc in a.encoders:
        specs = layer_specs(enc, a.quick)
        if len(specs) > 1:
            F.precompute(specs, "mean")      # one pass over the shards for all layers of this encoder
        store = cv.setdefault(enc, {})
        mem: tuple | None = None
        for spec in specs:
            spec = F.canonical_spec(spec)
            t0 = time.perf_counter()
            ent, r, data = cached_cv(a, S, store, spec, [(spec, "mean")], "z", {"logreg": a.Cs, "ridge_rank": ALPHAS})
            if r is not None and (mem is None or r["ndcg@10"] > mem[1]["ndcg@10"]):
                mem = (spec, r, data)        # keep only the best layer's OOF / data in memory
            print(f"[layers] {spec:14s} n_train {ent['n_train']:5d}  logreg nDCG@10 {ent['logreg']['ndcg@10']:.4f} P@10 "
                  f"{ent['logreg']['precision@10']:.4f} (C={ent['logreg']['best']:g})  ridge nDCG@10 {ent['ridge_rank']['ndcg@10']:.4f}"
                  f"  [{time.perf_counter() - t0:.0f}s]", flush=True)
        bspec = max((F.canonical_spec(s) for s in specs), key=lambda s: store[s]["logreg"]["ndcg@10"])
        use = mem if mem is not None and mem[0] == bspec else None
        e = probe_and_register(a, f"linear__{tag(bspec)}_mean_logreg", [(bspec, "mean")], "z", "logreg", a.Cs,
                               data=use[2] if use else None, cvres=use[1] if use else None,
                               notes=f"best {enc} layer by train CV ({len(specs)} candidates)")
        best[enc] = {"spec": bspec, "pooling": "mean", "name": e["name"], "cv_ndcg@10": store[bspec]["logreg"]["ndcg@10"],
                     "cv_precision@10": store[bspec]["logreg"]["precision@10"], "C": store[bspec]["logreg"]["best"],
                     "n_candidates": len(specs), "val": e["val"], "snapshot": snap_key()}
        S.save()
        for spec in specs:
            x = store[F.canonical_spec(spec)]
            rows.append([spec + (" *" if F.canonical_spec(spec) == bspec else ""), x["n_train"], x["logreg"]["ndcg@10"],
                         x["logreg"]["precision@10"], f"{x['logreg']['best']:g}" + ("!" if x["logreg"]["at_grid_edge"] else ""),
                         x["ridge_rank"]["ndcg@10"], x["ridge_rank"]["precision@10"]])
    ptable(["spec (mean pooling)", "n_train", "cv nDCG@10", "cv P@10", "C", "ridge nDCG@10", "ridge P@10"], rows,
           "layers: train-CV per layer (* = registered on val; ! = C at the edge of the grid)")
    ptable(["encoder", "best", "cv nDCG@10", "val nDCG@10", "val P@10"],
           [[e, b["spec"], b["cv_ndcg@10"], b["val"]["ndcg@10"], b["val"]["precision@10"]] for e, b in best.items() if e in a.encoders],
           "layers: best layer per encoder")


# ---------------------------------------------------------------- 2. pooling

def cmd_pooling(a, S: Summary) -> None:
    sec = S.section("pooling")
    sec["snapshot"], sec["C_grid"], sec["poolings"] = snapshot(), list(a.Cs), list(a.poolings)
    cv, best = sec.setdefault("cv", {}), sec.setdefault("best", {})
    rows = []
    for b in best_blocks(S, a.encoders):
        enc, spec = b["enc"], b["spec"]
        store = cv.setdefault(enc, {})
        mem = {}
        for pool in a.poolings:
            key = f"{spec}|{pool}"
            r = data = None
            lay = S.d.get("layers", {}).get("cv", {}).get(enc, {}).get(spec)
            sig = make_sig(a, blocks=[[spec, pool]], variant="z", grids={"logreg": sorted(map(float, a.Cs))})
            if pool == "mean" and lay and not a.force and {k: v for k, v in lay["sig"].items() if k != "grids"} == \
                    {k: v for k, v in sig.items() if k != "grids"} and lay["sig"]["grids"].get("logreg") == sig["grids"]["logreg"]:
                store[key] = ent = {"sig": sig, "n_train": lay["n_train"], "dim": lay["dim"], "logreg": lay["logreg"],
                                    "from": "layers"}
            else:
                ent, r, data = cached_cv(a, S, store, key, [(spec, pool)], "z", {"logreg": a.Cs})
            if r is not None:
                mem[pool] = (r, data)
            print(f"[pooling] {spec:12s} {pool:13s} dim {ent['dim']:5d}  nDCG@10 {ent['logreg']['ndcg@10']:.4f} "
                  f"P@10 {ent['logreg']['precision@10']:.4f} (C={ent['logreg']['best']:g})", flush=True)
        bpool = max(a.poolings, key=lambda p: (store[f"{spec}|{p}"]["logreg"]["ndcg@10"], -a.poolings.index(p)))
        mem = {bpool: mem[bpool]} if bpool in mem else {}
        e = probe_and_register(a, f"linear__{tag(spec)}_{bpool}_logreg", [(spec, bpool)], "z", "logreg", a.Cs,
                               data=mem[bpool][1] if mem else None, cvres=mem[bpool][0] if mem else None,
                               notes=f"best pooling for {spec} by train CV ({len(a.poolings)} candidates)")
        x = store[f"{spec}|{bpool}"]["logreg"]
        best[enc] = {"spec": spec, "pooling": bpool, "name": e["name"], "cv_ndcg@10": x["ndcg@10"],
                     "cv_precision@10": x["precision@10"], "C": x["best"], "val": e["val"], "snapshot": snap_key()}
        S.save()
        for pool in a.poolings:
            x = store[f"{spec}|{pool}"]
            rows.append([spec, pool + (" *" if pool == bpool else ""), x["dim"], x["logreg"]["ndcg@10"], x["logreg"]["precision@10"],
                         f"{x['logreg']['best']:g}" + ("!" if x["logreg"]["at_grid_edge"] else "")])
    ptable(["spec", "pooling", "dim", "cv nDCG@10", "cv P@10", "C"], rows, "pooling: train-CV (* = CV-best, registered on val)")


# ---------------------------------------------------------------- 3. targets

def cmd_targets(a, S: Summary) -> None:
    sec = S.section("targets")
    sec["snapshot"], sec["C_grid"], sec["ridge_alpha_grid"] = snapshot(), list(a.Cs), list(ALPHAS)
    table = sec.setdefault("table", {})
    grids = {"logreg": a.Cs, "ridge_rank": ALPHAS, "ridge_bin": ALPHAS}
    rows = []
    for b in best_blocks(S, a.encoders):
        blk = [(b["spec"], b["pooling"])]
        base = f"linear__{tag(b['spec'])}_{b['pooling']}"
        data = None
        ent = {}
        for m in MODELS:
            name = f"{base}_{m.replace('_', '-')}"
            sig = make_sig(a, blocks=[list(blk[0])], variant="z", model=m, grid=sorted(map(float, grids[m])))
            if data is None and (a.force or load_done(name, sig) is None):
                data = load_blocks(blk)
            e = probe_and_register(a, name, blk, "z", m, grids[m], data=data, notes="target comparison")
            ent[m] = {k: e[k] for k in ("name", "cv_ndcg@10", "cv_precision@10", "best", "at_grid_edge", "val")}
            rows.append([b["spec"], b["pooling"], m, e["cv_ndcg@10"], e["cv_precision@10"], f"{e['best']:g}" + ("!" if e["at_grid_edge"] else ""),
                         e["val"]["ndcg@10"], e["val"]["precision@10"]])
        table[b["enc"]] = {"spec": b["spec"], "pooling": b["pooling"], **ent}
        S.save()
    encs = [b for b in a.encoders if b in table]
    mean = {m: {k: float(np.mean([table[e][m][k] for e in encs])) for k in ("cv_ndcg@10", "cv_precision@10")} for m in MODELS}
    sec["mean_over_encoders"] = mean
    sec["wins_ndcg"] = {m: int(sum(max(MODELS, key=lambda x: table[e][x]["cv_ndcg@10"]) == m for e in encs)) for m in MODELS}
    sec["wins_p10"] = {m: int(sum(max(MODELS, key=lambda x: table[e][x]["cv_precision@10"]) == m for e in encs)) for m in MODELS}
    sec["winner_ndcg"] = max(MODELS, key=lambda m: mean[m]["cv_ndcg@10"])
    sec["winner_p10"] = max(MODELS, key=lambda m: mean[m]["cv_precision@10"])
    sec["ridge_winner"] = max(("ridge_rank", "ridge_bin"), key=lambda m: mean[m]["cv_ndcg@10"])
    S.save()
    ptable(["spec", "pooling", "target/model", "cv nDCG@10", "cv P@10", "C/alpha", "val nDCG@10", "val P@10"], rows,
           "targets: train-CV per encoder (! = at grid edge)")
    ptable(["model", "mean cv nDCG@10", "mean cv P@10", "wins nDCG", "wins P@10"],
           [[m, mean[m]["cv_ndcg@10"], mean[m]["cv_precision@10"], sec["wins_ndcg"][m], sec["wins_p10"][m]] for m in MODELS],
           f"targets: mean over {len(encs)} encoders")


# ---------------------------------------------------------------- 4. concat

def greedy_forward(a, labels: list[str], Xtr: list[np.ndarray], Y: np.ndarray, folds, variant: str, model: str, grid) -> dict:
    cache = FoldCache(Xtr, folds, variant)
    selected: list[int] = []
    remaining = list(range(len(labels)))
    cands, path = [], []
    while remaining:
        best = None
        for b in remaining:
            r = cv_eval(cache, Y, model, grid, subset=selected + [b], keep_oof=False)
            c = {"step": len(selected) + 1, "blocks": [labels[i] for i in selected + [b]], "added": labels[b],
                 "ndcg@10": r["ndcg@10"], "precision@10": r["precision@10"], "best": r["best"], "at_grid_edge": r["at_grid_edge"]}
            cands.append(c)
            if best is None or r["ndcg@10"] > best[1]["ndcg@10"]:
                best = (b, c)
        selected.append(best[0])
        remaining.remove(best[0])
        path.append(best[1])
        print(f"[concat] {variant:8s} step {len(selected)}: + {best[1]['added']:16s} cv nDCG@10 {best[1]['ndcg@10']:.4f} "
              f"P@10 {best[1]['precision@10']:.4f}", flush=True)
    return {"path": path, "candidates": cands, "order": selected}


def cmd_concat(a, S: Summary) -> None:
    sec = S.section("concat")
    bb = best_blocks(S, a.encoders)
    blocks = [(b["spec"], b["pooling"]) for b in bb]
    labels = [f"{s}|{p}" for s, p in blocks]
    selector = a.selector if a.selector != "auto" else S.d.get("targets", {}).get("ridge_winner", "ridge_rank")
    sel_grid = a.Cs if selector == "logreg" else ALPHAS
    final_grid = a.Cs if a.final == "logreg" else ALPHAS
    sec.update({"snapshot": snapshot(), "blocks": labels, "selector_model": selector, "selector_grid": list(sel_grid),
                "final_model": a.final, "variants": list(a.variants),
                "note": "greedy forward selection; criterion = train-CV nDCG@10 of the selector model. The best block "
                        "transform is the one whose greedy path reaches the highest CV nDCG@10; its steps are registered "
                        "on val with the final model (own CV for C / alpha)."})
    data = load_blocks(blocks)
    folds = H.cv_folds(data["rows_train"])
    greedy = sec.setdefault("greedy", {})
    for v in a.variants:
        sig = make_sig(a, blocks=labels, variant=v, model=selector, grid=sorted(map(float, sel_grid)))
        if greedy.get(v, {}).get("sig") == sig and not a.force:
            print(f"[skip] greedy path for {v}: in the summary for this snapshot")
            continue
        t0 = time.perf_counter()
        g = greedy_forward(a, labels, data["Xtr"], data["Y"], folds, v, selector, sel_grid)
        greedy[v] = {"sig": sig, "seconds": round(time.perf_counter() - t0, 1), **g}
        S.save()
    vbest = max(a.variants, key=lambda v: (max(p["ndcg@10"] for p in greedy[v]["path"]), -a.variants.index(v)))
    path = greedy[vbest]["path"]
    kbest = int(np.argmax([p["ndcg@10"] for p in path])) + 1
    sec["best_variant"], sec["best_step_by_selector"] = vbest, kbest
    ptable(["variant", "step", "added", "cv nDCG@10", "cv P@10", "alpha/C"],
           [[v + (" *" if v == vbest else ""), p["step"], p["added"], p["ndcg@10"], p["precision@10"], f"{p['best']:g}"]
            for v in a.variants for p in greedy[v]["path"]], f"concat: greedy paths ({selector} selector, train CV)")

    steps = sec["steps"] = {}
    order = greedy[vbest]["order"]
    todo = [(k, vbest) for k in range(1, len(order) + 1)]
    if vbest != "z":
        todo.append((len(order), "z"))                       # plain "everything concatenated" reference
    rows = []
    for k, v in todo:
        idx = sorted(order[:k]) if v == vbest else list(range(len(blocks)))
        sub = [blocks[i] for i in idx]
        b0 = bb[idx[0]]
        if k == 1 and v in ("z", "zs") and a.final == "logreg" and b0.get("name") and b0.get("snapshot") == snap_key():
            # a single z-scored block is exactly the per-encoder probe that is already on the leaderboard
            steps[b0["name"]] = {"step": 1, "variant": v, "blocks": [labels[idx[0]]], "cv_ndcg@10": b0["cv_ndcg@10"],
                                 "cv_precision@10": b0["cv_precision@10"], "best": b0.get("C"), "at_grid_edge": None,
                                 "val": b0["val"], "alias_of_single_encoder_run": True}
            rows.append([b0["name"] + " (existing)", 1, b0["cv_ndcg@10"], b0["cv_precision@10"], f"{b0.get('C', float('nan')):g}",
                         b0["val"]["ndcg@10"], b0["val"]["precision@10"]])
            continue
        if k == len(order):
            name = f"linear__concat_{v}_all"
        else:
            name = f"linear__concat_{v}_s{k}_" + "+".join(tag(s) for s, _ in sub)
        sub_data = {**data, "Xtr": [data["Xtr"][i] for i in idx], "Xva": [data["Xva"][i] for i in idx],
                    "blocks": [list(x) for x in sub], "dims": [data["dims"][i] for i in idx]}
        e = probe_and_register(a, name, sub, v, a.final, final_grid, data=sub_data,
                               notes=f"greedy step {k} ({v})" if v == vbest else "all blocks, plain z-scored concatenation",
                               extra={"greedy_step": k, "selector_model": selector,
                                      "selector_cv_ndcg@10": path[k - 1]["ndcg@10"] if v == vbest else greedy["z"]["path"][-1]["ndcg@10"] if "z" in greedy else None})
        steps[name] = {"step": k, "variant": v, "blocks": [f"{s}|{p}" for s, p in sub], **{x: e[x] for x in ("cv_ndcg@10", "cv_precision@10", "best", "at_grid_edge", "val")}}
        rows.append([name, k, e["cv_ndcg@10"], e["cv_precision@10"], f"{e['best']:g}" + ("!" if e["at_grid_edge"] else ""),
                     e["val"]["ndcg@10"], e["val"]["precision@10"]])
        S.save()
    mine = {n: s for n, s in steps.items() if s["variant"] == vbest}
    bname = max(mine, key=lambda n: (mine[n]["cv_ndcg@10"], -mine[n]["step"]))
    sec["best_run_by_cv"] = {"name": bname, **mine[bname], "snapshot": snap_key()}
    S.save()
    ptable(["run", "step", "cv nDCG@10", "cv P@10", "C/alpha", "val nDCG@10", "val P@10"], rows,
           f"concat: registered runs ({a.final}); CV-best = {bname}")


# ---------------------------------------------------------------- 5. knn

def cmd_knn(a, S: Summary) -> None:
    sec = S.section("knn")
    sec["snapshot"] = snapshot()
    bb = best_blocks(S, a.encoders)
    single = max(bb, key=lambda b: b["cv_ndcg@10"] if b["cv_ndcg@10"] is not None else -1.0)
    sets = [("single", f"knn__cv_single_{tag(single['spec'])}", [(single["spec"], single["pooling"])], "z")]
    cb = S.d.get("concat", {}).get("best_run_by_cv")
    if cb is None:
        print("[warn] no concat result: k-NN on the plain z-scored concatenation of all blocks instead")
        sets.append(("concat", "knn__cv_concat_z_all", [(b["spec"], b["pooling"]) for b in bb], "z"))
    else:
        if cb.get("snapshot") != snap_key():
            print(f"[warn] best concatenation was chosen on another snapshot {cb.get('snapshot')}")
        sets.append(("concat", f"knn__cv_concat_{cb['variant']}", [tuple(x.split("|")) for x in cb["blocks"]], cb["variant"]))
    ks = (5, 20) if a.quick else KNN_KS
    wts = KNN_WEIGHTINGS[:2] if a.quick else KNN_WEIGHTINGS
    grid = [(k, w, t, lab) for lab in ("binary", "rank") for w, t in wts for k in ks]
    rows = []
    for role, name, blocks, variant in sets:
        sig = make_sig(a, blocks=[list(b) for b in blocks], variant=variant, model="knn", grid=[list(map(str, g)) for g in grid])
        prev = None if a.force else load_done(name, sig)
        if prev is not None:
            print(f"[skip] {name}: result exists for this snapshot and grid")
            e = val_entry(prev)
            sec[role] = {**sec.get(role, {}), "name": name, "val": e["val"]}
        else:
            t0 = time.perf_counter()
            data = load_blocks(blocks)
            Y = data["Y"]
            folds = H.cv_folds(data["rows_train"])
            cache = FoldCache(data["Xtr"], folds, variant, data["Xva"])
            oof = {g: np.full(Y.shape, np.nan) for g in grid}
            for i, (fit, held) in enumerate(folds):
                A, Hd = cache.get(i)
                for g in grid:
                    k, w, t, lab = g
                    oof[g][held] = knn_label_transfer(A, Y[fit] if lab == "rank" else Y[fit] > 0, Hd, k=k, weighting=w,
                                                      temperature=t or 0.1)
            table = {g: rank_metrics(Y, oof[g]) for g in grid}
            gb = max(grid, key=lambda g: (table[g]["ndcg@10"], g[0]))
            k, w, t, lab = gb
            A, Hd = cache.get(cache.final)
            S_val = knn_label_transfer(A, Y if lab == "rank" else Y > 0, Hd, k=k, weighting=w, temperature=t or 0.1)
            cvt = {f"k={g[0]},{g[1]}{'' if g[2] is None else g[2]},{g[3]}": table[g] for g in grid}
            config = {"arm": "knn", "model": "baselines.knn_label_transfer (cosine)", "blocks": [list(b) for b in blocks],
                      "spec": "+".join(b[0] for b in blocks), "dims": data["dims"], "block_transform": variant, "k": k,
                      "weighting": w, "temperature": t, "labels": lab, "cv": cvt, "cv_ndcg@10": table[gb]["ndcg@10"],
                      "cv_precision@10": table[gb]["precision@10"], "n_configs": len(grid), "cv_folds": len(folds),
                      "best": f"k={k},{w}{'' if t is None else t},{lab}", "at_grid_edge": bool(k in (ks[0], ks[-1])),
                      "cv_criterion": "out-of-fold nDCG@10 on train; transforms fitted per fold",
                      "fit_seconds": round(time.perf_counter() - t0, 1), "sig": sig}
            e = finish_run(a, name, S_val, data["rows_val"], data["rows_val_missing"], fill_for(lab, Y), oof[gb],
                           data["rows_train"], config, notes=f"k-NN on the best {role} feature set; k/weighting/labels by train CV")
            sec[role] = {"name": name, "blocks": [f"{s}|{p}" for s, p in blocks], "variant": variant, "cv": cvt,
                         "best": config["best"], "cv_ndcg@10": config["cv_ndcg@10"], "cv_precision@10": config["cv_precision@10"],
                         "val": e["val"]}
            S.save()
        x = sec[role]
        rows.append([name, x.get("best", "?"), x.get("cv_ndcg@10", float("nan")), x.get("cv_precision@10", float("nan")),
                     x["val"]["ndcg@10"], x["val"]["precision@10"]])
        if "cv" in x:
            top = sorted(x["cv"].items(), key=lambda kv: -kv[1]["ndcg@10"])[:6]
            ptable(["config", "cv nDCG@10", "cv P@10"], [[c, v["ndcg@10"], v["precision@10"]] for c, v in top], f"knn {role}: top CV configs")
    ptable(["run", "chosen", "cv nDCG@10", "cv P@10", "val nDCG@10", "val P@10"], rows, "knn: registered runs")


# ---------------------------------------------------------------- 6. late fusion

def to_space(P: np.ndarray, method: str) -> np.ndarray:
    P = np.asarray(P, dtype=np.float64)
    if method == "prob":
        return P
    if method == "logit":
        p = np.clip(P, 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p))
    return np.argsort(np.argsort(P, axis=1, kind="stable"), axis=1, kind="stable") / (P.shape[1] - 1.0)   # rank within album


def fuse(Ts: list[np.ndarray], w: np.ndarray, method: str) -> np.ndarray:
    out = sum(wi * T for wi, T in zip(w, Ts) if wi > 0)
    return 1.0 / (1.0 + np.exp(-out)) if method == "logit" else out


def greedy_weights(Ts: list[np.ndarray], Y: np.ndarray, rounds: int) -> np.ndarray:
    """Ensemble selection with replacement on nDCG@10 (Caruana et al.): weights = pick counts of the best prefix."""
    counts, cur = np.zeros(len(Ts)), np.zeros_like(Ts[0])
    best = (-1.0, None)
    for _ in range(rounds):
        sc = [float(M.ndcg_at_k(Y, cur + T, 10).mean()) for T in Ts]
        j = int(np.argmax(sc))
        cur = cur + Ts[j]
        counts[j] += 1
        if sc[j] > best[0] + 1e-12:
            best = (sc[j], counts.copy())
    return best[1] / best[1].sum()


def cmd_late(a, S: Summary) -> None:
    sec = S.section("late")
    comps = best_blocks(S, a.encoders, want_run=True)
    names = [c["name"] for c in comps]
    rows_tr = None
    loaded = []
    for n in names:
        res = json.loads((H._val_dir() / f"{n}.json").read_text())
        if (res["data"]["n_shards"], res["data"]["n_val"]) != (F.n_shards(), len(H.eval_rows("val"))):
            raise SystemExit(f"{n} was computed on another shard snapshot; re-run `layers` / `pooling` first")
        So, ro = H.load_scores(n, "train_oof")
        Sv, rv = H.load_scores(n, "val")
        assert np.array_equal(rv, H.eval_rows("val"))
        loaded.append((So.astype(np.float64), ro, Sv.astype(np.float64)))
        rows_tr = ro if rows_tr is None else np.intersect1d(rows_tr, ro)
    from common import Y as Yall
    Y = Yall[rows_tr]
    P_oof = [So[np.searchsorted(ro, rows_tr)] for So, ro, _ in loaded]
    P_val = [Sv for _, _, Sv in loaded]
    rows_val = H.eval_rows("val")
    folds = H.cv_folds(rows_tr)
    rounds = 4 if a.quick else 25
    K = len(names)
    sig = make_sig(a, components=names, rounds=rounds, n_common_train=int(len(rows_tr)))
    sec.update({"snapshot": snapshot(), "components": names, "greedy_rounds": rounds,
                "single_cv": {n: rank_metrics(Y, P) for n, P in zip(names, P_oof)},
                "note": "weights use TRAIN out-of-fold scores only. 'greedy' = ensemble selection with replacement on OOF "
                        "nDCG@10; its cv numbers are cross-fitted (weights from 4 folds, scored on the 5th), 'cv_insample' is "
                        "the optimistic all-OOF number. rank = rank within album (not comparable across albums)."})
    table, weights, oofs = {}, {}, {}
    for method in ("logit", "prob", "rank"):
        Ts = [to_space(P, method) for P in P_oof]
        wu = np.full(K, 1.0 / K)
        oofs[(method, "uniform")] = fuse(Ts, wu, method)
        weights[(method, "uniform")] = wu
        table[f"{method}/uniform"] = {**rank_metrics(Y, oofs[(method, "uniform")]), "weights": wu.tolist()}
        wg = greedy_weights(Ts, Y, rounds)
        xf = np.full(Y.shape, np.nan)
        for fit, held in folds:
            wf = greedy_weights([T[fit] for T in Ts], Y[fit], rounds)
            xf[held] = fuse([T[held] for T in Ts], wf, method)
        oofs[(method, "greedy")] = xf
        weights[(method, "greedy")] = wg
        table[f"{method}/greedy"] = {**rank_metrics(Y, xf), "weights": wg.tolist(),
                                     "cv_insample": rank_metrics(Y, fuse(Ts, wg, method))}
    sec["cv"] = table
    bkey = max(table, key=lambda k: (table[k]["ndcg@10"], k.endswith("uniform")))
    sec["best_by_cv"] = bkey
    ptable(["component", "cv nDCG@10", "cv P@10"], [[n, v["ndcg@10"], v["precision@10"]] for n, v in sec["single_cv"].items()],
           f"late: components on the {len(rows_tr)} common train rows")
    ptable(["fusion", "cv nDCG@10", "cv P@10", "weights"],
           [[k + (" *" if k == bkey else ""), v["ndcg@10"], v["precision@10"], " ".join(f"{w:.2f}" for w in v["weights"])] for k, v in table.items()],
           "late: train-OOF fusion (* = CV-best; greedy rows are cross-fitted)")
    todo = list(dict.fromkeys(["logit/uniform", "rank/uniform", bkey]))
    reg = sec.setdefault("registered", {})
    rows = []
    for key in todo:
        method, wname = key.split("/")
        name = f"linear__late_{method}_{wname}"
        rsig = {**sig, "fusion": key}
        prev = None if a.force else load_done(name, rsig)
        if prev is not None:
            print(f"[skip] {name}: result exists for this snapshot")
            e = val_entry(prev)
        else:
            w = weights[(method, wname)]
            S_val = fuse([to_space(P, method) for P in P_val], w, method)
            config = {"arm": "linear", "model": f"late fusion ({method} average, {wname} weights)", "components": names,
                      "weights": w.tolist(), "cv": {k: {x: v[x] for x in ("ndcg@10", "precision@10")} for k, v in table.items()},
                      "cv_ndcg@10": table[key]["ndcg@10"], "cv_precision@10": table[key]["precision@10"], "best": key,
                      "at_grid_edge": False, "greedy_rounds": rounds, "n_fusions_tried": len(table),
                      "cv_criterion": "nDCG@10 of the fused train OOF scores (greedy weights cross-fitted)", "sig": rsig}
            e = finish_run(a, name, S_val, rows_val, np.array([], dtype=int), None, oofs[(method, wname)], rows_tr, config,
                           notes="late fusion of the per-encoder logistic probes" + (" (CV-best fusion)" if key == bkey else ""))
        reg[name] = {"fusion": key, "weights": weights[(method, wname)].tolist(), "cv_ndcg@10": table[key]["ndcg@10"],
                     "cv_precision@10": table[key]["precision@10"], "val": e["val"]}
        rows.append([name, table[key]["ndcg@10"], table[key]["precision@10"], e["val"]["ndcg@10"], e["val"]["precision@10"]])
        S.save()
    ptable(["run", "cv nDCG@10", "cv P@10", "val nDCG@10", "val P@10"], rows, "late: registered runs")


# ---------------------------------------------------------------- main

COMMANDS = {"layers": cmd_layers, "pooling": cmd_pooling, "targets": cmd_targets, "concat": cmd_concat,
            "knn": cmd_knn, "late": cmd_late}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=list(COMMANDS) + ["all"])
    ap.add_argument("--quick", action="store_true", help="tiny grids; writes to cache/quick_linear/ (smoke test)")
    ap.add_argument("--force", action="store_true", help="recompute even if a matching result exists")
    ap.add_argument("--no-downstream", action="store_true", help="skip the recommendation metrics in evaluate_run")
    ap.add_argument("--encoders", nargs="+", default=list(ENCODERS), choices=sorted(F.ENCODERS))
    ap.add_argument("--Cs", nargs="+", type=float, default=None, help="logistic C grid (default: probes.DEFAULT_CS)")
    ap.add_argument("--poolings", nargs="+", default=None, choices=POOLINGS)
    ap.add_argument("--variants", nargs="+", default=None, help="block transforms for concat: z zs pca<k> pca<k>s")
    ap.add_argument("--selector", default="auto", choices=["auto", *MODELS],
                    help="model used inside the greedy search (auto = the better ridge target from `targets`)")
    ap.add_argument("--final", default="logreg", choices=MODELS, help="model registered for each greedy step")
    a = ap.parse_args()
    a.Cs = tuple(a.Cs) if a.Cs else ((1e-3, 1e-2) if a.quick else DEFAULT_CS)
    a.poolings = list(a.poolings) if a.poolings else (["mean", "mean+std"] if a.quick else list(POOLINGS))
    a.variants = list(a.variants) if a.variants else (["z", "pca32s"] if a.quick else list(VARIANTS))
    for v in a.variants:
        parse_variant(v)
    if a.quick:   # sandbox: nothing a smoke test writes can end up on the shared leaderboard
        H.RESULTS_DIR = HERE / "cache" / "quick_linear" / "results"
        H.SCORES_DIR = HERE / "cache" / "quick_linear" / "scores"
    S = Summary(H.RESULTS_DIR / SUMMARY_NAME)
    s = snapshot()
    print(f"[exp_linear] {a.command}{' --quick' if a.quick else ''}: {s['n_shards']} shards, {s['n_albums_extracted']} of "
          f"{s['n_albums_matched']} albums, n_train {s['n_train']}, n_val {s['n_val']}; results -> {H.RESULTS_DIR}", flush=True)
    for c in (list(COMMANDS) if a.command == "all" else [a.command]):
        t0 = time.perf_counter()
        COMMANDS[c](a, S)
        S.section(c)["seconds_last_run"] = round(time.perf_counter() - t0, 1)
        S.save()
        print(f"[exp_linear] {c} done in {time.perf_counter() - t0:.0f}s; summary: {S.path}", flush=True)


if __name__ == "__main__":
    main()
