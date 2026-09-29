"""Map layouts: UMAP per stop from the recommender's own matrix, aligned and scaled to [-1, 1]."""
import math
from collections import Counter

import numpy as np
import pandas as pd

from .constants import SLIDER, STOPS, UMAP_PARAMS
from .table import rec_matrix


def norm_box(E: np.ndarray) -> np.ndarray:
    mn, mx = E.min(0), E.max(0)
    return (E - (mn + mx) / 2) / (max(mx - mn) / 2)


def procrustes_to(E: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Rotation/reflection only (no scaling) of E onto ref, around their means."""
    a = E - E.mean(0)
    b = ref - ref.mean(0)
    U, _, Vt = np.linalg.svd(a.T @ b)
    return a @ (U @ Vt) + ref.mean(0)


def fix_outliers(E: np.ndarray, k: float = 3.0) -> tuple[np.ndarray, int]:
    """Soft log compression of radii beyond Q3 + k*IQR from the median centre."""
    c = np.median(E, 0)
    v = E - c
    r = np.linalg.norm(v, axis=1)
    q1, q3 = np.percentile(r, [25, 75])
    thr = q3 + k * (q3 - q1)
    out = r > thr
    r2 = r.copy()
    r2[out] = thr + (q3 - q1) * np.log1p((r[out] - thr) / (q3 - q1))
    return c + v * (r2 / np.maximum(r, 1e-12))[:, None], int(out.sum())


def fix_stacks(E: np.ndarray, eps: float = 0.004, grid: float = 1e-3) -> tuple[np.ndarray, int]:
    """Points that coincide after rounding to 3 decimals are spread on a small ring."""
    E = E.copy()
    groups: dict[tuple[int, int], list[int]] = {}
    for i, p in enumerate(E):
        groups.setdefault(tuple(np.round(p / grid).astype(int).tolist()), []).append(i)
    moved = 0
    for g in groups.values():
        if len(g) > 1:
            ctr = E[g].mean(0)
            for j, i in enumerate(g):
                a = 2 * math.pi * j / len(g)
                E[i] = ctr + eps * np.array([math.cos(a), math.sin(a)])
            moved += len(g)
    return E, moved


def stacked3(E: np.ndarray) -> int:
    c = Counter(tuple(np.round(p, 3).tolist()) for p in E)
    return sum(n for n in c.values() if n > 1)


def umap_embed(X: np.ndarray) -> np.ndarray:
    from umap import UMAP  # imported lazily: numba start-up is slow

    return UMAP(**UMAP_PARAMS).fit_transform(X).astype(float)


def finalize_layouts(raw: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Outlier compression, box normalisation, Procrustes of sonic and mood onto balanced,
    scale to [-1, 1], then spread stacked points (up to 10 passes)."""
    out: dict[str, np.ndarray] = {}
    for stop in STOPS:
        E, _ = fix_outliers(np.asarray(raw[stop], dtype=float))
        out[stop] = norm_box(E)
    for stop in ("sonic", "mood"):
        out[stop] = procrustes_to(out[stop], out["balanced"])
    for stop in STOPS:
        E = out[stop] / np.abs(out[stop]).max()
        for _ in range(10):
            E, _ = fix_stacks(E)
            E = E / np.abs(E).max()
            if stacked3(E) == 0:
                break
        if stacked3(E) != 0:
            raise RuntimeError(f"{stop}: stacked points remain after 10 passes")
        out[stop] = E
    return out


def build_layouts(sub: pd.DataFrame) -> dict[str, np.ndarray]:
    return finalize_layouts({stop: umap_embed(rec_matrix(sub, SLIDER[stop])) for stop in STOPS})


def flat_positions(E: np.ndarray) -> list[float]:
    """[x0, y0, x1, y1, ...] rounded to 3 decimals, with -0.0 normalised to 0.0."""
    return [round(float(v), 3) + 0.0 for v in np.asarray(E, dtype=float).reshape(-1)]
