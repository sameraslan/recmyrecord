"""Linear probe used for the reference runs: one-vs-rest L2 logistic regression on standardised features.

All 120 one-vs-rest problems are independent given the features, so they are fitted jointly as one linear
layer with L-BFGS (torch, CPU, 2 threads) — the same optimum as 120 sklearn LogisticRegression(C) fits
(objective per label: C * sum_i logloss_i + 0.5 * ||w||^2, intercept not penalised), in seconds.

    out = logreg_probe(harness.get_data("maest:7"))      # C chosen on the in-train CV folds, never on val
    out["S_val"], out["S_oof"], out["best_C"], out["cv"]
"""
from __future__ import annotations

import numpy as np
import torch

import harness as H
import metrics as M
from features import Standardizer

torch.set_num_threads(2)  # extraction is running on this machine: stay small

DEFAULT_CS = (1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1)


def fit_logreg(X: np.ndarray, B: np.ndarray, C: float, *, init: tuple[np.ndarray, np.ndarray] | None = None,
               max_iter: int = 200, tol: float = 1e-5) -> tuple[np.ndarray, np.ndarray]:
    """Weights (d, L) and intercepts (L,) of L independent L2 logistic regressions. X must already be
    standardised (finite); B is the binary label matrix (n, L).

    When there are fewer rows than columns the problem is solved exactly in the row space of X (the L2
    solution always lies in it): X = U S V', fit on Z = U S (n x n), W = V Wz. Same optimum, much cheaper."""
    Xn = np.asarray(X, dtype=np.float64)
    n, d = Xn.shape
    V = None
    if n < d:
        U, s, Vt = np.linalg.svd(Xn, full_matrices=False)
        Xn, V = U * s, Vt.T
    Xt = torch.as_tensor(Xn)
    Bt = torch.as_tensor(np.asarray(B, dtype=np.float64))
    L = Bt.shape[1]
    W = torch.zeros((Xt.shape[1], L), dtype=torch.float64, requires_grad=True)
    prev = Bt.mean(0).clamp(1e-4, 1 - 1e-4)
    b = torch.log(prev / (1 - prev)).clone().requires_grad_(True)
    if init is not None:
        W0 = np.asarray(init[0], dtype=np.float64)
        with torch.no_grad():
            W.copy_(torch.as_tensor(W0 if V is None else V.T @ W0))
            b.copy_(torch.as_tensor(np.asarray(init[1], dtype=np.float64)))
    opt = torch.optim.LBFGS([W, b], lr=1.0, max_iter=max_iter, history_size=20, tolerance_grad=tol,
                            tolerance_change=1e-12, line_search_fn="strong_wolfe")
    bce = torch.nn.BCEWithLogitsLoss(reduction="sum")

    def closure():
        opt.zero_grad()
        loss = bce(Xt @ W + b, Bt) / n + (W ** 2).sum() / (2.0 * C * n)
        loss.backward()
        return loss

    opt.step(closure)
    Wn = W.detach().numpy()
    return (Wn if V is None else V @ Wn), b.detach().numpy()


def predict_logreg(X: np.ndarray, W: np.ndarray, b: np.ndarray) -> np.ndarray:
    """P(label) per (row, label), float64."""
    z = np.asarray(X, dtype=np.float64) @ W + b
    return 1.0 / (1.0 + np.exp(-np.clip(z, -50, 50)))


def logreg_probe(data: dict, Cs: tuple[float, ...] = DEFAULT_CS, n_splits: int = 5, verbose: bool = True) -> dict:
    """Fit the probe on data["X_train"] (dict from harness.get_data). C is the value with the best
    out-of-fold nDCG@10 over the artist-disjoint train folds (ties -> smaller C); the scaler is re-fitted
    inside every fold on the fit part only. Returns S_val, S_oof (train rows, out of fold, at the chosen
    C), rows_oof, best_C and the CV table."""
    Xtr, Ytr, rows = data["X_train"], data["Y_train"], data["rows_train"]
    Btr = Ytr > 0
    Cs = tuple(sorted(Cs))
    folds = H.cv_folds(rows, n_splits)
    oof = {C: np.full(Ytr.shape, np.nan) for C in Cs}
    for fit, held in folds:
        sc = Standardizer().fit(Xtr[fit])
        A, Hd = sc.transform(Xtr[fit]), sc.transform(Xtr[held])
        init = None
        for C in Cs:  # warm start along the regularisation path
            init = fit_logreg(A, Btr[fit], C, init=init)
            oof[C][held] = predict_logreg(Hd, *init)
    cv = {}
    for C in Cs:
        assert np.isfinite(oof[C]).all(), "some train rows are in no fold"
        cv[C] = {"ndcg@10": float(M.ndcg_at_k(Ytr, oof[C], 10).mean()),
                 "precision@10": float(M.precision_at_k(Ytr, oof[C], 10).mean())}
    best_C = max(Cs, key=lambda C: (cv[C]["ndcg@10"], -C))
    sc = Standardizer().fit(Xtr)
    W, b = fit_logreg(sc.transform(Xtr), Btr, best_C)
    S_val = predict_logreg(sc.transform(data["X_val"]), W, b)
    if verbose:
        print(f"[probe] {data['spec']} / {data['pooling']}: C={best_C:g} from {len(folds)} folds; OOF nDCG@10 "
              + ", ".join(f"{C:g}: {cv[C]['ndcg@10']:.4f}" for C in Cs))
    return {"S_val": S_val, "S_oof": oof[best_C], "rows_oof": rows, "best_C": best_C,
            "cv": {f"{C:g}": v for C, v in cv.items()}, "n_folds": len(folds)}
