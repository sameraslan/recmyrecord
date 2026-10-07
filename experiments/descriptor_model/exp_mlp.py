"""Experiment arm: neural heads (MLPs, missing-label-aware losses, track-level attention / MIL pooling).

    P="OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 10 .venv/bin/python"
    $P exp_mlp.py search    # anchors (loss / depth / pooling ablation) + random configs, scored by TRAIN CV
    $P exp_mlp.py final     # top configs by CV nDCG@10: 5-fold OOF + seed ensemble on all of train -> val
    $P exp_mlp.py attn      # track-level models (mean / logit_avg / attn / gated) at equal capacity: CV, then val
    $P exp_mlp.py bench     # seconds per epoch on synthetic data of the full size (writes nothing)

Common options: --spec (default "auto": best maest / mert layers from results/linear_summary.json + clap +
heads, else maest:7+mert:8+clap+heads; "concat": the linear arm's best concatenation; or any features.py
spec), --quick (tiny budgets; everything is written to cache/quick_mlp/, never to the shared leaderboard),
--force, --no-downstream, --seeds, --folds, --top, --refit.

Model-selection rule. Every choice is made on TRAIN only:
  * early stopping: an artist-disjoint 15 % holdout carved out of the rows a model is fitted on (never the
    CV held-out fold, never val), criterion = holdout nDCG@10;
  * hyper-parameters / pooling / loss: out-of-fold nDCG@10 (and P@10, mAP) over harness.cv_folds;
  * the standardiser is fitted on the rows a model is trained on (inside each fold, holdout excluded) and
    stored in the model; label statistics (bias init, rank-weight normalisation) likewise.
Validation is touched only by harness.evaluate_run, for the configurations `final` / `attn` register; val
labels are never loaded into the training code. Test is never touched.

Scores. sigmoid(logit) for every loss except `listnet`, whose score is softmax(logit) (a distribution over
the 120 descriptors per album, so it is not comparable ACROSS albums the way a probability is). Seed
ensembles average these scores. Val rows a spec cannot cover get the label-wise mean of the train OOF scores.

Outputs: results/val/mlp__*.json, results/val/attn__*.json (+ leaderboard rows, val scores and train OOF
scores in cache/scores/) and results/mlp_summary.json (every config with its CV metrics).

Resuming: a CV entry / registered run is reused when its stored signature (n_shards, n_train, n_val, spec,
budget, config) matches the current one; otherwise it is recomputed.
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")

import argparse
import hashlib
import json
import math
import resource
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

import features as F
import harness as H
import metrics as M
from common import HERE
from exp_linear import Summary, jnorm, load_done, make_sig, ptable, snap_key, snapshot, tag, val_entry

torch.set_num_threads(2)   # shared laptop: CPU only, two threads (MPS is off-limits for this project)

DEFAULT_SPEC = "maest:7+mert:8+clap+heads"
AUTO_ENCODERS = ("maest", "mert", "clap", "heads")
N_LABELS = 120
LOSSES = ("bce", "bce_ls", "asl", "hill", "wbce", "listnet", "bce+listnet")
TRACK_POOLS = ("mean", "logit_avg", "attn", "gated")
SUMMARY_NAME = "mlp_summary.json"
HOLDOUT = 0.15

BASE = {"pooling": "mean", "depth": 1, "hidden": 512, "dropout": 0.25, "in_dropout": 0.0, "noise": 0.0, "mixup": 0.0,
        "proj": 0, "wd": 0.1, "lr": 1e-3, "schedule": "cosine", "batch": 128, "loss": "bce"}
LOSS_DEFAULTS = {"bce": {}, "bce_ls": {"ls_eps": 0.05}, "asl": {"gamma_neg": 2.0, "asl_margin": 0.05}, "hill": {},
                 "wbce": {"rank_pow": 1.0}, "listnet": {"rank_pow": 1.0}, "bce+listnet": {"rank_pow": 1.0, "listnet_lambda": 0.05}}


# ---------------------------------------------------------------- losses
# z = logits (n, L); T = binary target in [0, 1] (soft only under mixup); W = normalised rank weight (0 for
# absent labels, mean 1 over the positive cells of the fit rows); Q = W / W.sum(1) (a distribution per album).
# Every sigmoid loss is the mean over all (album, label) cells; listnet is the mean over albums.

def _cells(z: torch.Tensor, P: torch.Tensor, N: torch.Tensor) -> torch.Tensor:
    """-(P * log sigmoid(z) + N * log(1 - sigmoid(z))) per cell, numerically stable."""
    return -(P * Fn.logsigmoid(z) + N * Fn.logsigmoid(-z))


def loss_bce(z, T):
    """One-vs-all binary cross-entropy."""
    return _cells(z, T, 1 - T).mean()


def loss_bce_ls(z, T, eps: float = 0.05):
    """BCE with label smoothing on the NEGATIVES only: target = 1 for positives, eps for negatives (an
    absent descriptor may be a missing vote). eps = 0 is BCE."""
    t = T + (1 - T) * eps
    return _cells(z, t, 1 - t).mean()


def loss_wbce(z, T, W):
    """BCE whose positive term is weighted by the normalised rank weight: -(W log p + (1 - T) log(1 - p)).
    Equal to BCE when all positive weights are equal."""
    return _cells(z, W, 1 - T).mean()


def loss_asl(z, T, gamma_pos: float = 0.0, gamma_neg: float = 2.0, margin: float = 0.05):
    """Asymmetric loss (Ridnik et al., ICCV 2021): L+ = (1 - p)^g+ log p; L- = p_m^g- log(1 - p_m) with the
    shifted probability p_m = max(p - m, 0); loss = -mean(T L+ + (1 - T) L-). Negatives with p <= m cost
    nothing; g+ = g- = m = 0 is BCE. The focusing weights are part of the graph (as in the paper)."""
    assert all(g == 0 or g >= 1 for g in (gamma_pos, gamma_neg)), "focusing exponents must be 0 or >= 1"
    p = torch.sigmoid(z)
    lp = Fn.logsigmoid(z)
    if gamma_pos:
        lp = (1 - p) ** gamma_pos * lp
    if margin > 0:
        pm = (p - margin).clamp(min=0)
        ln = torch.log1p(-pm)                       # 1 - pm >= margin > 0
    else:
        pm, ln = p, Fn.logsigmoid(-z)
    if gamma_neg:
        ln = pm ** gamma_neg * ln
    return -(T * lp + (1 - T) * ln).mean()


def loss_hill(z, T, lamb: float = 1.5, margin: float = 1.0, gamma: float = 2.0):
    """Hill loss (Zhang et al. 2021, "Simple and Robust Loss Design for Multi-Label Learning with Missing
    Labels"): negatives cost (lamb - p) p^2, whose gradient w.r.t. the logit, p^2 (1 - p) (2 lamb - 3 p), goes
    back to 0 for confidently predicted "negatives" (likely missing positives) instead of growing like BCE;
    positives use the paper's focal margin loss -(1 - p_m)^gamma log p_m with p_m = sigmoid(z - margin)."""
    p = torch.sigmoid(z)
    pos = -((1 - torch.sigmoid(z - margin)) ** gamma) * Fn.logsigmoid(z - margin)
    neg = (lamb - p) * p ** 2
    return (T * pos + (1 - T) * neg).mean()


def loss_listnet(z, Q):
    """ListNet (top-one) : cross-entropy between the normalised rank weights Q and softmax(z), mean over albums."""
    return -(Q * Fn.log_softmax(z, dim=1)).sum(1).mean()


def compute_loss(z, T, W, Q, cfg: dict) -> torch.Tensor:
    name = cfg["loss"]
    if name == "bce":
        return loss_bce(z, T)
    if name == "bce_ls":
        return loss_bce_ls(z, T, cfg.get("ls_eps", 0.05))
    if name == "asl":
        return loss_asl(z, T, cfg.get("gamma_pos", 0.0), cfg.get("gamma_neg", 2.0), cfg.get("asl_margin", 0.05))
    if name == "hill":
        return loss_hill(z, T, cfg.get("hill_lambda", 1.5), cfg.get("hill_margin", 1.0), cfg.get("hill_gamma", 2.0))
    if name == "wbce":
        return loss_wbce(z, T, W)
    if name == "listnet":
        return loss_listnet(z, Q)
    if name == "bce+listnet":
        return loss_bce(z, T) + cfg.get("listnet_lambda", 0.05) * loss_listnet(z, Q)
    raise ValueError(f"unknown loss {name!r}; known: {LOSSES}")


def score_kind(loss: str) -> str:
    return "softmax" if loss == "listnet" else "sigmoid"


def make_targets(Y: torch.Tensor, idx_fit: torch.Tensor, rank_pow: float = 1.0):
    """T (binary), W (rank weight ** rank_pow, scaled so the positive cells of the FIT rows average 1), Q."""
    T = (Y > 0).float()
    Wp = torch.where(Y > 0, Y.clamp(min=1e-6) ** rank_pow, torch.zeros_like(Y))
    ref = Wp[idx_fit][T[idx_fit] > 0].mean()
    return T, Wp / ref, Wp / Wp.sum(1, keepdim=True).clamp(min=1e-12)


# ---------------------------------------------------------------- models

class Body(nn.Module):
    """standardise -> (train: Gaussian noise, input dropout) -> optional per-block projection (each encoder
    block -> Linear -> proj dims, concatenated, ReLU, dropout) -> `depth` x [Linear, ReLU, Dropout]."""

    def __init__(self, blocks: list[tuple[int, int]], depth: int, hidden: int, dropout: float, in_dropout: float = 0.0,
                 noise: float = 0.0, proj: int = 0):
        super().__init__()
        D = blocks[-1][1]
        self.blocks, self.noise = [tuple(b) for b in blocks], float(noise)
        self.register_buffer("mean", torch.zeros(D))
        self.register_buffer("scale", torch.ones(D))
        self.in_drop = nn.Dropout(in_dropout)
        use_proj = proj > 0 and len(blocks) > 1
        self.proj = nn.ModuleList([nn.Linear(b - a, proj) for a, b in blocks]) if use_proj else None
        d = proj * len(blocks) if use_proj else D
        layers: list[nn.Module] = [nn.ReLU(), nn.Dropout(dropout)] if use_proj else []
        for _ in range(depth):
            layers += [nn.Linear(d, hidden), nn.ReLU(), nn.Dropout(dropout)]
            d = hidden
        self.trunk = nn.Sequential(*layers)
        self.out_dim = d

    def normalise(self, x: torch.Tensor) -> torch.Tensor:
        return (x - self.mean) / self.scale

    def embed(self, xn: torch.Tensor) -> torch.Tensor:
        if self.training and self.noise > 0:
            xn = xn + self.noise * torch.randn_like(xn)
        xn = self.in_drop(xn)
        if self.proj is not None:
            xn = torch.cat([p(xn[..., a:b]) for p, (a, b) in zip(self.proj, self.blocks)], dim=-1)
        return self.trunk(xn)


class Net(nn.Module):
    """pool = "album": x is (n, D), already pooled over tracks.
    Track-level pools, x (n, T, D) with a boolean mask (n, T); all share the same body and linear head:
      mean       masked mean of the standardised tracks -> body -> head            (mean-pooling control)
      logit_avg  body + head per track, masked mean of the logits
      attn       h_t = body(x_t); a = softmax_t(h_t . q / sqrt(d)) with one learned query q; head(sum a_t h_t)
      gated      a = softmax_t(w' (tanh(V h_t) * sigmoid(U h_t)))  (Ilse et al. 2018);     head(sum a_t h_t)
    q and w start at zero, so both attention models start as mean pooling of the track embeddings."""

    def __init__(self, blocks, n_out: int = N_LABELS, pool: str = "album", attn_dim: int = 128, **body):
        super().__init__()
        assert pool in ("album",) + TRACK_POOLS, pool
        self.pool = pool
        self.body = Body(blocks, **body)
        d = self.body.out_dim
        self.head = nn.Linear(d, n_out)
        if pool == "attn":
            self.query = nn.Parameter(torch.zeros(d))
        if pool == "gated":
            self.att_V, self.att_U, self.att_w = nn.Linear(d, attn_dim), nn.Linear(d, attn_dim), nn.Linear(attn_dim, 1, bias=False)
            nn.init.zeros_(self.att_w.weight)

    def attention(self, h: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        if self.pool == "attn":
            s = (h @ self.query) / math.sqrt(h.shape[-1])
        else:
            s = self.att_w(torch.tanh(self.att_V(h)) * torch.sigmoid(self.att_U(h))).squeeze(-1)
        return torch.softmax(s.masked_fill(~mask, float("-inf")), dim=1)

    def forward(self, x: torch.Tensor, mask: torch.Tensor | None = None) -> torch.Tensor:
        xn = self.body.normalise(x)
        if self.pool == "album":
            return self.head(self.body.embed(xn))
        assert mask is not None and bool(mask.any(1).all()), "every album needs at least one valid track"
        m = mask.unsqueeze(-1).to(xn.dtype)
        cnt = m.sum(1)
        if self.pool == "mean":
            return self.head(self.body.embed((xn * m).sum(1) / cnt))
        h = self.body.embed(xn)
        if self.pool == "logit_avg":
            return (self.head(h) * m).sum(1) / cnt
        return self.head((self.attention(h, mask).unsqueeze(-1) * h).sum(1))


def build_model(cfg: dict, blocks) -> Net:
    return Net(blocks, pool=cfg.get("pool", "album"), depth=cfg["depth"], hidden=cfg["hidden"], dropout=cfg["dropout"],
               in_dropout=cfg["in_dropout"], noise=cfg["noise"], proj=cfg["proj"])


def n_params(model: nn.Module) -> int:
    return int(sum(p.numel() for p in model.parameters()))


# ---------------------------------------------------------------- training

def norm_stats(X: torch.Tensor, mask: torch.Tensor | None, idx: torch.Tensor, eps: float = 1e-6):
    """Mean / scale over the given rows (valid tracks only for track tensors), as features.Standardizer:
    columns with (near-)zero variance are centred and left unscaled. Chunked, so no large temporary."""
    D = X.shape[-1]
    s, ss, n = torch.zeros(D, dtype=torch.float64), torch.zeros(D, dtype=torch.float64), 0
    for c in idx.split(512):
        x = X[c] if mask is None else X[c][mask[c]]
        x = x.double()
        s += x.sum(0)
        ss += (x * x).sum(0)
        n += len(x)
    mean = s / n
    sd = (ss / n - mean ** 2).clamp(min=0).sqrt()
    return mean.float(), torch.where(sd > eps, sd, torch.ones_like(sd)).float()


@torch.no_grad()
def predict(model: Net, D: dict, idx, kind: str) -> np.ndarray:
    model.eval()
    idx = torch.as_tensor(np.asarray(idx), dtype=torch.long)
    out = []
    for c in idx.split(1024 if D.get("mask") is None else 256):
        z = model(D["X"][c], None if D.get("mask") is None else D["mask"][c])
        out.append((torch.softmax(z, 1) if kind == "softmax" else torch.sigmoid(z)).double().numpy())
    return np.concatenate(out) if out else np.zeros((0, N_LABELS))


def split_holdout(idx: np.ndarray, groups: np.ndarray, seed: int, frac: float = HOLDOUT) -> tuple[np.ndarray, np.ndarray]:
    """(fit, holdout) index arrays: `frac` of the artist groups of `idx` go to the holdout."""
    from sklearn.model_selection import GroupShuffleSplit

    idx = np.asarray(idx)
    g = groups[idx]
    if len(np.unique(g)) < 4:
        raise ValueError("too few artist groups for an early-stopping holdout")
    a, b = next(GroupShuffleSplit(n_splits=1, test_size=frac, random_state=seed).split(idx, groups=g))
    assert not set(g[a]) & set(g[b])
    return idx[a], idx[b]


def _lr_at(cfg: dict, ep: int, E: int) -> float:
    return cfg["lr"] * 0.5 * (1 + math.cos(math.pi * ep / E)) if cfg["schedule"] == "cosine" else cfg["lr"]


def fit(D: dict, cfg: dict, idx_fit: np.ndarray, idx_hold: np.ndarray | None, seed: int, *, max_epochs: int,
        patience: int, replay: list[float] | None = None) -> tuple[Net, dict]:
    """Train one model on rows idx_fit (indexes into the train part of D). With idx_hold: early stopping on
    holdout nDCG@10 (best state restored). With replay (= the learning rate of every epoch of an earlier
    early-stopped run): exactly those epochs, no holdout."""
    t0 = time.perf_counter()
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    X, mask = D["X"], D.get("mask")
    Yt = torch.as_tensor(D["Y"])
    fit_t = torch.as_tensor(np.asarray(idx_fit), dtype=torch.long)
    T, W, Q = make_targets(Yt, fit_t, cfg.get("rank_pow", 1.0))
    model = build_model(cfg, D["blocks"])
    kind = score_kind(cfg["loss"])
    with torch.no_grad():
        mean, scale = norm_stats(X, mask, fit_t)
        model.body.mean.copy_(mean)
        model.body.scale.copy_(scale)
        if kind == "softmax":
            model.head.bias.copy_(torch.log(Q[fit_t].mean(0) + 1e-4))
        else:
            p = T[fit_t].mean(0).clamp(1e-3, 1 - 1e-3)
            model.head.bias.copy_(torch.log(p / (1 - p)))
    decay = [p for p in model.parameters() if p.ndim >= 2]
    rest = [p for p in model.parameters() if p.ndim < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": cfg["wd"]}, {"params": rest, "weight_decay": 0.0}], lr=cfg["lr"])
    E = max_epochs if replay is None else len(replay)
    use_mixup = cfg["mixup"] > 0 and mask is None
    best = (-1.0, 0, {k: v.clone() for k, v in model.state_dict().items()})
    lr, lrs, hist, since, diverged = cfg["lr"], [], [], 0, False
    for ep in range(E):
        if replay is not None:
            lr = replay[ep]
        elif cfg["schedule"] == "cosine":
            lr = _lr_at(cfg, ep, E)
        for g in opt.param_groups:
            g["lr"] = lr
        lrs.append(lr)
        model.train()
        perm = rng.permutation(np.asarray(idx_fit))
        for i in range(0, len(perm), cfg["batch"]):
            b = torch.as_tensor(perm[i:i + cfg["batch"]], dtype=torch.long)
            if len(b) < 2:
                continue
            xb, tb, wb, qb = X[b], T[b], W[b], Q[b]
            if use_mixup:
                lam = float(rng.beta(cfg["mixup"], cfg["mixup"]))
                lam = max(lam, 1 - lam)
                p = torch.as_tensor(rng.permutation(len(b)), dtype=torch.long)
                xb, tb, wb, qb = (lam * v + (1 - lam) * v[p] for v in (xb, tb, wb, qb))
            loss = compute_loss(model(xb, None if mask is None else mask[b]), tb, wb, qb, cfg)
            if not torch.isfinite(loss):
                diverged = True
                break
            opt.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
        if diverged:
            break
        if idx_hold is not None:
            m = float(M.ndcg_at_k(D["Y"][idx_hold], predict(model, D, idx_hold, kind), 10).mean())
            hist.append(m)
            if m > best[0] + 1e-6:
                best, since = (m, ep + 1, {k: v.clone() for k, v in model.state_dict().items()}), 0
            else:
                since += 1
                if cfg["schedule"] == "plateau" and since % 3 == 0:
                    lr = max(lr * 0.5, cfg["lr"] / 16)
                if since >= patience:
                    break
    if idx_hold is not None or diverged:
        model.load_state_dict(best[2])
    model.eval()
    info = {"best_epoch": best[1] if idx_hold is not None else len(lrs), "epochs_run": len(lrs), "holdout_ndcg@10": best[0] if idx_hold is not None else None,
            "lrs": lrs, "diverged": diverged, "seconds": time.perf_counter() - t0, "n_fit": int(len(idx_fit)),
            "n_params": n_params(model), "hit_max_epochs": bool(idx_hold is not None and best[1] == E)}
    return model, info


def train_ensemble(D: dict, cfg: dict, idx: np.ndarray, pred: list[np.ndarray], seeds: list[int], *, max_epochs: int,
                   patience: int, refit: bool = False) -> tuple[list[np.ndarray], list[dict]]:
    """One model per seed on the train rows `idx` (each with its own artist-disjoint early-stopping holdout,
    so the ensemble as a whole sees every row); the scores for each index set in `pred` are averaged.
    refit=True: after early stopping, retrain on ALL of idx for the same epochs / learning rates."""
    kind = score_kind(cfg["loss"])
    out = [np.zeros((len(p), N_LABELS)) for p in pred]
    infos = []
    for s in seeds:
        a, h = split_holdout(idx, D["groups"], s)
        model, info = fit(D, cfg, a, h, s, max_epochs=max_epochs, patience=patience)
        if refit and info["best_epoch"] > 0 and not info["diverged"]:
            model, info2 = fit(D, cfg, idx, None, s, max_epochs=max_epochs, patience=patience, replay=info["lrs"][:info["best_epoch"]])
            info = {**info, "seconds": info["seconds"] + info2["seconds"], "refit": True, "n_fit": info2["n_fit"]}
        for o, p in zip(out, pred):
            o += predict(model, D, p, kind) / len(seeds)
        infos.append({k: v for k, v in info.items() if k != "lrs"})
    return out, infos


def rank_metrics(Y: np.ndarray, S: np.ndarray) -> dict:
    return {"ndcg@10": float(M.ndcg_at_k(Y, S, 10).mean()), "precision@10": float(M.precision_at_k(Y, S, 10).mean()),
            "mAP": float(np.nanmean(M.per_label_ap(Y, S)))}


def cv_run(D: dict, cfg: dict, folds, seeds: list[int], *, max_epochs: int, patience: int, refit: bool = False) -> dict:
    """Out-of-fold scores for the train rows of D. -> oof, metrics, per-fold nDCG@10, epochs, seconds."""
    t0 = time.perf_counter()
    oof = np.full((D["n_train"], N_LABELS), np.nan)
    infos, fold_ndcg = [], []
    for fit_idx, held in folds:
        (S,), inf = train_ensemble(D, cfg, fit_idx, [held], seeds, max_epochs=max_epochs, patience=patience, refit=refit)
        oof[held] = S
        infos += inf
        fold_ndcg.append(float(M.ndcg_at_k(D["Y"][held], S, 10).mean()))
    assert np.isfinite(oof).all(), "some train rows are in no fold"
    return {"oof": oof, **rank_metrics(D["Y"], oof), "fold_ndcg@10": fold_ndcg, "ndcg@10_fold_sd": float(np.std(fold_ndcg)),
            "best_epochs": [i["best_epoch"] for i in infos], "hit_max_epochs": int(sum(i["hit_max_epochs"] for i in infos)),
            "diverged": int(sum(i["diverged"] for i in infos)), "n_params": infos[0]["n_params"], "n_folds": len(folds),
            "n_fits": len(infos), "seconds": time.perf_counter() - t0}


def slim(r: dict) -> dict:
    return {k: (round(v, 1) if k == "seconds" else v) for k, v in r.items() if k != "oof"}


# ---------------------------------------------------------------- data

def resolve_spec(arg: str) -> tuple[str, str]:
    """--spec auto / concat read the linear arm's choices (made on train CV) from results/linear_summary.json."""
    if arg not in ("auto", "concat"):
        return F.canonical_spec(arg), "given"
    p = HERE / "results" / "linear_summary.json"
    if p.exists():
        d = json.loads(p.read_text())
        cb = d.get("concat", {}).get("best_run_by_cv")
        if arg == "concat" and cb:
            return F.canonical_spec("+".join(b.split("|")[0] for b in cb["blocks"])), "linear_summary.json: concat.best_run_by_cv"
        best = d.get("layers", {}).get("best", {})
        dflt = dict(zip(AUTO_ENCODERS, DEFAULT_SPEC.split("+")))
        if any(e in best for e in AUTO_ENCODERS):
            return (F.canonical_spec("+".join(best[e]["spec"] if e in best else dflt[e] for e in AUTO_ENCODERS)),
                    "linear_summary.json: layers.best")
    return DEFAULT_SPEC, "default (no usable results/linear_summary.json)"


def _blocks(spec: str, pooling: str) -> tuple[list[tuple[int, int]], list[str]]:
    """One block per encoder term (its mean / std columns together)."""
    out: dict[str, list[int]] = {}
    for term, _, a, b in F.feature_blocks(spec, pooling):
        out.setdefault(term, [a, b])[1] = b
    return [tuple(v) for v in out.values()], list(out)


def load_album(spec: str, pooling: str) -> dict:
    d = H.get_data(spec, pooling, verbose=False)
    blocks, names = _blocks(spec, pooling)
    return {"X": torch.as_tensor(np.concatenate([d["X_train"], d["X_val"]])), "mask": None, "Y": d["Y_train"],
            "n_train": len(d["rows_train"]), "rows_train": d["rows_train"], "rows_val": d["rows_val"],
            "rows_val_missing": d["rows_val_missing"], "groups": H.artist_groups()[d["rows_train"]], "blocks": blocks,
            "block_names": names, "spec": d["spec"], "pooling": pooling}


def load_tracks(spec: str) -> dict:
    d = H.get_track_data(spec, verbose=False)
    F._TRACK_MEMO.clear()                       # features keeps a second copy of the tensor: not needed here
    X = torch.as_tensor(np.concatenate([d.pop("Xt_train"), d.pop("Xt_val")]))
    mask = torch.as_tensor(np.concatenate([d.pop("mask_train"), d.pop("mask_val")]))
    blocks, names = _blocks(spec, "mean")
    return {"X": X, "mask": mask, "Y": d["Y_train"], "n_train": len(d["rows_train"]), "rows_train": d["rows_train"],
            "rows_val": d["rows_val"], "rows_val_missing": d["rows_val_missing"], "groups": H.artist_groups()[d["rows_train"]],
            "blocks": blocks, "block_names": names, "spec": d["spec"], "pooling": "tracks"}


def val_idx(D: dict) -> np.ndarray:
    return np.arange(D["n_train"], len(D["X"]))


# ---------------------------------------------------------------- configurations

def canon(cfg: dict) -> dict:
    """Fill defaults, drop hyper-parameters the config does not use, so equal models get equal ids."""
    c = {**BASE, **cfg}
    out = {k: c[k] for k in BASE}
    if "pool" in c:
        out["pool"] = c["pool"]
        out.pop("pooling")
        out["mixup"] = 0.0
    for k, v in LOSS_DEFAULTS[c["loss"]].items():
        out[k] = c.get(k, v)
    if c["loss"] == "asl":
        out["gamma_pos"] = c.get("gamma_pos", 0.0)
    if out["depth"] == 0:
        out["hidden"] = 0
        if not out["proj"]:
            out["dropout"] = 0.0
    return jnorm(out)


def cfg_id(cfg: dict) -> str:
    return hashlib.sha1(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:8]


def NAME_OK(name: str) -> bool:
    return bool(H.NAME_RE.match(name))


def short(cfg: dict) -> str:
    s = f"d{cfg['depth']}" + (f"h{cfg['hidden']}" if cfg["depth"] else "") + (f"_p{cfg['proj']}" if cfg["proj"] else "")
    return f"{s}_{cfg['loss']}" + ("" if "pool" in cfg else f"_{cfg['pooling']}")


def sample_config(rng: np.random.Generator, multiblock: bool) -> dict:
    ch = lambda xs: xs[int(rng.integers(len(xs)))]
    loss = ch(LOSSES)
    c = {"pooling": ch(["mean", "mean+std"]), "depth": ch([0, 1, 1, 2]), "hidden": ch([256, 512, 1024]),
         "dropout": ch([0.1, 0.25, 0.5]), "in_dropout": ch([0.0, 0.0, 0.1, 0.2]), "noise": ch([0.0, 0.0, 0.1, 0.3]),
         "mixup": ch([0.0, 0.0, 0.2, 0.4]), "proj": ch([0, 256]) if multiblock else 0, "wd": ch([0.01, 0.1, 1.0]),
         "lr": ch([3e-4, 1e-3, 3e-3]), "schedule": ch(["cosine", "plateau"]), "batch": ch([64, 128]), "loss": loss}
    if loss == "bce_ls":
        c["ls_eps"] = ch([0.02, 0.05, 0.1])
    if loss == "asl":
        c["gamma_neg"], c["asl_margin"] = ch([1.0, 2.0, 4.0]), ch([0.0, 0.05])
    if loss in ("wbce", "listnet", "bce+listnet"):
        c["rank_pow"] = ch([1.0, 2.0])
    if loss == "bce+listnet":
        c["listnet_lambda"] = ch([0.02, 0.05, 0.2])
    return c


def search_configs(n: int, seed: int, multiblock: bool, quick: bool) -> list[tuple[str, dict]]:
    """Anchors first (one change from BASE each: a clean ablation of loss, depth, pooling, projection, input
    regularisation), then random configurations up to n."""
    anchors = [(f"anchor:loss={l}", {"loss": l}) for l in LOSSES]
    anchors += [("anchor:linear", {"depth": 0}), ("anchor:depth=2", {"depth": 2}), ("anchor:mean+std", {"pooling": "mean+std"})]
    if multiblock:
        anchors.append(("anchor:proj=256", {"proj": 256}))
    anchors.append(("anchor:mixup+noise", {"mixup": 0.2, "noise": 0.1}))
    if quick:   # one of every code path, tiny
        anchors = anchors[:len(LOSSES)] + [("quick:linear", {"depth": 0}), ("quick:everything", {
            "depth": 2, "hidden": 64, "pooling": "mean+std", "proj": 32, "mixup": 0.2, "noise": 0.1, "in_dropout": 0.1,
            "schedule": "plateau", "batch": 32})]
    out, seen = [], set()
    rng = np.random.default_rng(seed)
    cands = anchors + [("random", None)] * max(0, 50 * n)
    for origin, c in cands:
        if len(out) >= n:
            break
        c = canon(sample_config(rng, multiblock) if c is None else c)
        if cfg_id(c) not in seen:
            seen.add(cfg_id(c))
            out.append((origin, c))
    return out


def budget(a) -> dict:
    return {"max_epochs": a.max_epochs, "patience": a.patience, "holdout": HOLDOUT}


# ---------------------------------------------------------------- CV table shared by `search` and `attn`

def run_cv_table(a, S: Summary, sec: dict, configs: list[tuple[str, dict]], data_for, folds_n: int, seeds: list[int], label: str) -> dict:
    """CV every config (resumable). Returns {cid: entry} for the configs valid on the current snapshot."""
    store = sec.setdefault("configs", {})
    t_all, done = time.perf_counter(), 0
    for i, (origin, cfg) in enumerate(configs):
        cid = cfg_id(cfg)
        sig = make_sig(a, spec=a.spec, folds=folds_n, seeds=seeds, config=cfg, **budget(a))
        ent = store.get(cid)
        if ent and ent.get("sig") == sig and not a.force:
            print(f"[{label}] {i + 1:2d}/{len(configs)} {cid} skip (in the summary for this snapshot)", flush=True)
            continue
        D = data_for(cfg)
        r = cv_run(D, cfg, H.cv_folds(D["rows_train"], folds_n), seeds, max_epochs=a.max_epochs, patience=a.patience)
        store[cid] = {"id": cid, "origin": origin, "config": cfg, "sig": sig, "n_train": D["n_train"], "dim": int(D["X"].shape[-1]),
                      "cv": slim(r)}
        S.save()
        done += 1
        el = time.perf_counter() - t_all
        print(f"[{label}] {i + 1:2d}/{len(configs)} {cid} {origin:22s} {short(cfg):28s} cv nDCG@10 {r['ndcg@10']:.4f} P@10 "
              f"{r['precision@10']:.4f} mAP {r['mAP']:.4f} | epochs {int(np.median(r['best_epochs']))} | {r['seconds']:.0f}s "
              f"(elapsed {el / 60:.1f} min)", flush=True)
    valid = {cid: e for cid, e in store.items()
             if {k: v for k, v in e["sig"].items() if k != "config"} ==
             {k: v for k, v in make_sig(a, spec=a.spec, folds=folds_n, seeds=seeds, **budget(a)).items()}}
    return valid


def table_rows(valid: dict) -> list[dict]:
    rows = []
    for e in sorted(valid.values(), key=lambda e: -e["cv"]["ndcg@10"]):
        c = e["cv"]
        rows.append({"id": e["id"], "origin": e["origin"], **e["config"], "n_params": c["n_params"], "cv_ndcg@10": c["ndcg@10"],
                     "cv_precision@10": c["precision@10"], "cv_mAP": c["mAP"], "cv_ndcg@10_fold_sd": c["ndcg@10_fold_sd"],
                     "median_best_epoch": float(np.median(c["best_epochs"])), "hit_max_epochs": c["hit_max_epochs"],
                     "diverged": c["diverged"], "seconds": c["seconds"]})
    return rows


def print_table(rows: list[dict], title: str, extra: tuple[str, ...] = ()) -> None:
    cols = ["id", "origin", *extra, "depth", "hidden", "proj", "dropout", "in_dropout", "noise", "mixup", "wd", "lr", "schedule",
            "batch", "loss", "cv_ndcg@10", "cv_precision@10", "cv_mAP", "median_best_epoch", "seconds"]
    ptable(cols, [[r.get(c, "") for c in cols] for r in rows], title)


# ---------------------------------------------------------------- registering a run on val

def register(a, S: Summary, name: str, D: dict, cfg: dict, seeds: list[int], search_cv: dict | None, notes: str, extra: dict) -> dict:
    """5-fold OOF (seed ensemble per fold) -> save_train_oof; seed ensemble on all of train -> evaluate_run."""
    sig = make_sig(a, spec=a.spec, oof_folds=a.oof_folds, seeds=seeds, config=cfg, refit=bool(a.refit), **budget(a))
    prev = None if a.force else load_done(name, sig)
    if prev is not None:
        print(f"[skip] {name}: result exists for this snapshot and config")
        return {**val_entry(prev), "oof_cv": prev["config"].get("oof_cv")}
    t0 = time.perf_counter()
    r = cv_run(D, cfg, H.cv_folds(D["rows_train"], a.oof_folds), seeds, max_epochs=a.max_epochs, patience=a.patience, refit=a.refit)
    (S_val,), infos = train_ensemble(D, cfg, np.arange(D["n_train"]), [val_idx(D)], seeds, max_epochs=a.max_epochs,
                                     patience=a.patience, refit=a.refit)
    H.save_train_oof(name, r["oof"], D["rows_train"])
    rows_val = D["rows_val"]
    if len(D["rows_val_missing"]):
        S_val, rows_val = H.complete_scores(S_val, rows_val, fill=r["oof"].mean(0))
    config = {"arm": "attn" if "pool" in cfg else "mlp", "model": cfg, "spec": D["spec"], "pooling": D["pooling"],
              "blocks": D["block_names"], "dim": int(D["X"].shape[-1]), "n_params": r["n_params"], "seeds": seeds,
              "score": score_kind(cfg["loss"]) + " of the logits, averaged over the seed ensemble",
              "early_stopping": f"artist-disjoint {HOLDOUT:.0%} holdout inside the fitted rows, nDCG@10, patience {a.patience}, "
                                f"max {a.max_epochs} epochs" + ("; then refit on all fitted rows for the same epochs" if a.refit else ""),
              "final_fit": [{k: i[k] for k in ("best_epoch", "epochs_run", "holdout_ndcg@10", "n_fit", "seconds")} for i in infos],
              "oof_cv": slim(r), "cv_ndcg@10": r["ndcg@10"], "cv_precision@10": r["precision@10"], "best": cfg_id(cfg),
              "at_grid_edge": None, "cv": search_cv,
              "cv_criterion": "out-of-fold nDCG@10 on train (artist-disjoint folds); standardiser fitted per fold",
              "val_rows_filled": int(len(D["rows_val_missing"])), "fit_seconds": round(time.perf_counter() - t0, 1), "sig": sig, **extra}
    res = H.evaluate_run(name, S_val, rows_val, config=config, notes=notes, n_train=D["n_train"], downstream=not a.no_downstream)
    return {**val_entry(res), "oof_cv": slim(r)}


# ---------------------------------------------------------------- sub-commands

def cmd_search(a, S: Summary) -> None:
    sec = S.section("search")
    multiblock = len(F.parse_spec(a.spec)) > 1
    configs = search_configs(a.n_configs, a.search_seed, multiblock, a.quick)
    seeds = list(range(a.search_seeds))
    cache: dict[str, dict] = {}

    def data_for(cfg):
        if cfg["pooling"] not in cache:
            cache[cfg["pooling"]] = load_album(a.spec, cfg["pooling"])
        return cache[cfg["pooling"]]

    sec.update({"snapshot": snapshot(), "spec": a.spec, "spec_source": a.spec_source, "folds": a.folds, "seeds": seeds, **budget(a),
                "search_seed": a.search_seed, "n_configs_requested": a.n_configs,
                "criterion": "out-of-fold nDCG@10 over the artist-disjoint train folds (P@10 and mAP reported); early stopping "
                             "on an in-train holdout; val never used",
                "note": "anchors change ONE thing from the base config (depth 1, 512 units, dropout 0.25, wd 0.1, lr 1e-3, "
                        "cosine, batch 128, mean pooling, bce); the rest is random search"})
    valid = run_cv_table(a, S, sec, configs, data_for, a.folds, seeds, "search")
    rows = table_rows(valid)
    sec["table"], sec["ranking"] = rows, [r["id"] for r in rows]
    sec["best_by_ndcg@10"] = rows[0]["id"]
    sec["best_by_precision@10"] = max(rows, key=lambda r: r["cv_precision@10"])["id"]
    S.save()
    print_table(rows, f"search: {len(rows)} configs, train CV ({a.folds} folds), spec {a.spec}", extra=("pooling",))


def cmd_final(a, S: Summary) -> None:
    ssec = S.d.get("search", {})
    want = {k: v for k, v in make_sig(a, spec=a.spec, folds=a.folds, seeds=list(range(a.search_seeds)), **budget(a)).items()}
    valid = [e for e in ssec.get("configs", {}).values() if {k: v for k, v in e["sig"].items() if k != "config"} == want]
    if not valid:
        raise SystemExit("no search results for the current snapshot / spec / budget: run `search` first")
    valid.sort(key=lambda e: -e["cv"]["ndcg@10"])
    chosen = valid[:a.top]
    bp = max(valid, key=lambda e: e["cv"]["precision@10"])
    if bp["id"] not in [e["id"] for e in chosen]:
        chosen.append(bp)                       # also the CV-best by P@10 when it is a different config
    sec = S.section("final")
    sec.update({"snapshot": snapshot(), "spec": a.spec, "seeds": list(range(a.seeds)), "oof_folds": a.oof_folds, "refit": bool(a.refit),
                "n_search_configs": len(valid), "selection": f"top {a.top} of {len(valid)} search configs by train-CV nDCG@10"
                                                              " (+ the CV-best by P@10 if different)"})
    runs = sec.setdefault("runs", {})
    cache: dict[str, dict] = {}
    rows = []
    for rank, e in enumerate(chosen, 1):
        cfg = e["config"]
        if cfg["pooling"] not in cache:
            cache[cfg["pooling"]] = load_album(a.spec, cfg["pooling"])
        name = f"mlp__{tag(short(cfg))}_{e['id']}"
        v = register(a, S, name, cache[cfg["pooling"]], cfg, list(range(a.seeds)), e["cv"],
                     notes=f"search rank {rank if rank <= a.top else 'best-P@10'} of {len(valid)} by train-CV nDCG@10; {a.seeds}-seed ensemble",
                     extra={"search_rank": rank, "n_search_configs": len(valid), "origin": e["origin"]})
        runs[name] = {"id": e["id"], "config": cfg, "search_cv": e["cv"], "oof_cv": v["oof_cv"], "val": v["val"], "snapshot": snap_key()}
        S.save()
        rows.append([name, e["cv"]["ndcg@10"], v["oof_cv"]["ndcg@10"], v["oof_cv"]["precision@10"], v["val"]["ndcg@10"],
                     v["val"]["precision@10"], v["val"]["mAP"]])
    ptable(["run", "search cv nDCG@10", "ens. OOF nDCG@10", "ens. OOF P@10", "val nDCG@10", "val P@10", "val mAP"], rows,
           f"final: registered runs ({a.seeds} seeds; n_train {snapshot()['n_train']}, n_val {snapshot()['n_val']})")


def attn_configs(a, S: Summary) -> list[tuple[str, dict]]:
    """The four track poolings on the same body: the base architecture, plus the best album config of
    `search` if there is one for this snapshot (else a dropout-0.5 variant)."""
    strip = lambda c: {k: v for k, v in c.items() if k not in ("pooling", "mixup")}
    archs = [("base", strip(BASE))]
    if not a.quick:
        ssec = S.d.get("search", {})
        best = ssec.get("configs", {}).get(ssec.get("best_by_ndcg@10", ""), {})
        alt = None
        if best and best.get("sig", {}).get("n_train") == snap_key()["n_train"] and best["sig"].get("spec") == a.spec:
            alt = {**strip(best["config"]), "depth": max(1, best["config"]["depth"])}
            if not alt.get("hidden"):
                alt["hidden"] = 512
        if alt is None or canon({**alt, "pool": "mean"}) == canon({**archs[0][1], "pool": "mean"}):
            archs.append(("dropout=0.5", {**strip(BASE), "dropout": 0.5}))
        else:
            archs.append(("best_mlp", alt))
    return [(f"{n}:{p}", canon({**c, "pool": p})) for n, c in archs for p in TRACK_POOLS]


def cmd_attn(a, S: Summary) -> None:
    sec = S.section("attn")
    configs = attn_configs(a, S)
    seeds = list(range(a.search_seeds))
    D = load_tracks(a.spec)
    sec.update({"snapshot": snapshot(), "spec": a.spec, "spec_source": a.spec_source, "folds": a.folds, "seeds": seeds, **budget(a),
                "max_tracks": int(D["X"].shape[1]), "mean_tracks": float(D["mask"].float().sum(1).mean()),
                "note": "all four poolings share the same body and head (equal capacity; attention adds d or 2*128*d parameters); "
                        "`mean` is the mean-pooling control on exactly the same rows and standardisation"})
    valid = run_cv_table(a, S, sec, configs, lambda cfg: D, a.folds, seeds, "attn")
    rows = table_rows(valid)
    for r in rows:
        r["arch"] = r["origin"].split(":")[0]
    sec["table"] = rows
    S.save()
    print_table(rows, f"attn: track-level models, train CV ({a.folds} folds), spec {a.spec}", extra=("pool",))
    runs = sec.setdefault("runs", {})
    out = []
    for pool in TRACK_POOLS:                    # the CV-best architecture of every pooling goes to val
        cand = [e for e in valid.values() if e["config"]["pool"] == pool]
        if not cand:
            continue
        e = max(cand, key=lambda e: e["cv"]["ndcg@10"])
        name = f"attn__{pool}_{tag(short(e['config']))}_{e['id']}"
        v = register(a, S, name, D, e["config"], list(range(a.attn_seeds)), e["cv"],
                     notes=f"track-level {pool} pooling; architecture by train CV ({len(cand)} candidates); {a.attn_seeds}-seed ensemble",
                     extra={"origin": e["origin"], "n_candidates": len(cand)})
        runs[name] = {"id": e["id"], "config": e["config"], "search_cv": e["cv"], "oof_cv": v["oof_cv"], "val": v["val"], "snapshot": snap_key()}
        S.save()
        out.append([name, e["cv"]["ndcg@10"], v["oof_cv"]["ndcg@10"], v["oof_cv"]["precision@10"], v["val"]["ndcg@10"],
                    v["val"]["precision@10"], v["val"]["mAP"]])
    ptable(["run", "search cv nDCG@10", "ens. OOF nDCG@10", "ens. OOF P@10", "val nDCG@10", "val P@10", "val mAP"], out,
           f"attn: registered runs ({a.attn_seeds} seeds; n_train {D['n_train']}, n_val {len(D['rows_val'])})")


def cmd_bench(a, S: Summary | None = None) -> None:
    """Seconds per epoch on synthetic data of the full size (no real data read, nothing written)."""
    n, T = a.bench_n, 6
    dims = [F.ENCODERS[t.encoder][1] for t in F.parse_spec(a.spec)]
    D0 = int(sum(dims))
    g = torch.Generator().manual_seed(0)
    edges = np.cumsum([0] + dims)
    Y = (np.random.default_rng(0).random((n, N_LABELS)) < 0.09).astype(np.float32)
    Y[:, 0] = 1
    base = {"Y": Y, "n_train": n, "groups": np.arange(n) // 2}
    idx = np.arange(n)
    rows = []
    fit({**base, "X": torch.randn(n, 16), "mask": None, "blocks": [(0, 16)]}, canon({}), idx[:200], idx[200:300], 0,
        max_epochs=1, patience=1)      # warm-up (first-call overheads)
    for label, cfg, X, mask, blocks in (
            [("album mean", canon({}), torch.randn(n, D0, generator=g), None, list(zip(edges[:-1], edges[1:])))]
            + [("album mean+std, proj 256, 2x1024", canon({"pooling": "mean+std", "proj": 256, "depth": 2, "hidden": 1024}),
                torch.randn(n, 2 * D0, generator=g), None, [(2 * int(x), 2 * int(y)) for x, y in zip(edges[:-1], edges[1:])])]
            + [(f"tracks {p}", canon({"pool": p}), None, None, list(zip(edges[:-1], edges[1:]))) for p in TRACK_POOLS]):
        if X is None:
            X, mask = torch.randn(n, T, D0, generator=g), torch.ones(n, T, dtype=torch.bool)
        D = {**base, "X": X, "mask": mask, "blocks": [(int(x), int(y)) for x, y in blocks]}
        _, info = fit(D, cfg, idx[: int(n * 0.85)], idx[int(n * 0.85):], 0, max_epochs=a.bench_epochs, patience=99)
        rows.append([label, int(X.shape[-1]), info["n_params"], info["seconds"] / info["epochs_run"]])
        del D, X
    ptable(["model", "dim", "params", "s / epoch"], rows, f"bench: n_fit {int(n * 0.85)}, {torch.get_num_threads()} threads, "
           f"batch 128, incl. the per-epoch holdout evaluation; peak RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20:.0f} MB")


COMMANDS = {"search": cmd_search, "final": cmd_final, "attn": cmd_attn, "bench": cmd_bench}


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=list(COMMANDS))
    ap.add_argument("--spec", default="auto", help='feature spec; "auto" / "concat" read results/linear_summary.json')
    ap.add_argument("--quick", action="store_true", help="tiny budgets; writes to cache/quick_mlp/ (smoke test)")
    ap.add_argument("--force", action="store_true", help="recompute even if a matching result exists")
    ap.add_argument("--no-downstream", action="store_true", help="skip the recommendation metrics in evaluate_run")
    ap.add_argument("--n-configs", type=int, default=None, help="search: anchors + random configs (default 22; quick 9)")
    ap.add_argument("--search-seed", type=int, default=0, help="seed of the random configurations")
    ap.add_argument("--folds", type=int, default=None, help="CV folds of search / attn (default 3; quick 2)")
    ap.add_argument("--search-seeds", type=int, default=1, help="models per fold in search / attn CV")
    ap.add_argument("--oof-folds", type=int, default=None, help="folds for the saved train OOF scores (default 5; quick 2)")
    ap.add_argument("--seeds", type=int, default=None, help="final: ensemble size (default 3; quick 2)")
    ap.add_argument("--attn-seeds", type=int, default=None, help="attn: ensemble size of the registered runs (default 2)")
    ap.add_argument("--top", type=int, default=None, help="final: how many search configs to register (default 3; quick 2)")
    ap.add_argument("--max-epochs", type=int, default=None, help="default 60; quick 4")
    ap.add_argument("--patience", type=int, default=None, help="early-stopping patience in epochs (default 8; quick 2)")
    ap.add_argument("--refit", action="store_true", help="after early stopping, retrain on all fitted rows for the same epochs")
    ap.add_argument("--bench-n", type=int, default=2700)
    ap.add_argument("--bench-epochs", type=int, default=3)
    a = ap.parse_args(argv)
    q = a.quick
    for k, full, quick in (("n_configs", 22, 9), ("folds", 3, 2), ("oof_folds", 5, 2), ("seeds", 3, 2), ("attn_seeds", 2, 2),
                           ("top", 3, 2), ("max_epochs", 60, 4), ("patience", 8, 2)):
        if getattr(a, k) is None:
            setattr(a, k, quick if q else full)
    a.spec, a.spec_source = resolve_spec(a.spec)
    if a.command == "bench":
        return cmd_bench(a)
    if q:   # sandbox: nothing a smoke test writes can end up on the shared leaderboard
        H.RESULTS_DIR = HERE / "cache" / "quick_mlp" / "results"
        H.SCORES_DIR = HERE / "cache" / "quick_mlp" / "scores"
    S = Summary(H.RESULTS_DIR / SUMMARY_NAME)
    s = snapshot()
    print(f"[exp_mlp] {a.command}{' --quick' if q else ''}: spec {a.spec} ({a.spec_source}); {s['n_shards']} shards, "
          f"{s['n_albums_extracted']} of {s['n_albums_matched']} albums, n_train {s['n_train']}, n_val {s['n_val']}; "
          f"results -> {H.RESULTS_DIR}", flush=True)
    t0 = time.perf_counter()
    COMMANDS[a.command](a, S)
    S.section(a.command)["seconds_last_run"] = round(time.perf_counter() - t0, 1)
    S.save()
    print(f"[exp_mlp] {a.command} done in {time.perf_counter() - t0:.0f}s; peak RSS "
          f"{resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20:.0f} MB; summary: {S.path}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
