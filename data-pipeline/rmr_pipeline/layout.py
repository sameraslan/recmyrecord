"""Map layouts: UMAP per stop from the site matrix, aligned, at one density and scaled into [-1, 1]."""
import math
from collections import Counter

import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from .audio import site_matrix
from .constants import ISLAND_LINK_GAPS, SLIDER, STOPS, UMAP_MIN_DIST, UMAP_PARAMS

# Albums of an island nearer to each other than this many median gaps of the map are stacked (identical rows
# of the matrix can land on one spot): they say nothing about how dense the island is. fix_stacks spreads them.
ISLAND_STACKED_GAPS = 1e-3
# An island is never enlarged beyond this radius, in median gaps of the map times the square root of its
# album count. A round patch of n albums at the map's density has a radius of about 1.2 sqrt(n) gaps; the
# islands of the catalog come out at 1.8 to 5.7 once enlarged. Without the limit an island made of a few
# close pairs is enlarged until the pairs are a gap apart, which can be wider than the whole map.
ISLAND_MAX_RADIUS = 8.0


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
    if q3 == q1:  # half the points at one radius: no spread to measure an outlier against
        return E.copy(), 0
    thr = q3 + k * (q3 - q1)
    out = r > thr
    r2 = r.copy()
    r2[out] = thr + (q3 - q1) * np.log1p((r[out] - thr) / (q3 - q1))
    return c + v * (r2 / np.maximum(r, 1e-12))[:, None], int(out.sum())


def median_gap(E: np.ndarray) -> float:
    """Median distance from a point to its nearest neighbour."""
    d, _ = cKDTree(E).query(E, k=2)
    return float(np.median(d[:, 1]))


def _positive_gap(E: np.ndarray, what: str) -> float:
    """median_gap, or a ValueError that says what is wrong with a layout nothing can be scaled by."""
    E = np.asarray(E, dtype=float)
    if E.ndim != 2 or E.shape[1] != 2 or len(E) < 2:
        raise ValueError(f"{what}: needs at least two points as an (n, 2) array, got shape {E.shape}")
    if not np.isfinite(E).all():
        raise ValueError(f"{what}: {int((~np.isfinite(E).all(axis=1)).sum())} of {len(E)} positions are not finite")
    gap = median_gap(E)
    if gap == 0:
        raise ValueError(f"{what}: at least half of the {len(E)} albums sit exactly on another album (the median "
                         "distance to the nearest album is 0), so there is no density to scale by. Identical rows "
                         "in the matrix do this")
    return gap


def pull_islands(E: np.ndarray, link: float = ISLAND_LINK_GAPS) -> tuple[np.ndarray, int]:
    """Groups detached from the main cloud are moved next to it, nearest first.

    Two points are linked when they are within `link` median gaps of each other; the largest linked group is
    the main cloud. Every other group is translated along the line between its closest pair of points with the
    cloud until it sits `link` median gaps away. Far specks would otherwise set the frame of the overview and
    shrink everything else. UMAP also packs a detached group much tighter than the cloud, so a group denser
    than the map is first enlarged around its centre to the map's median gap; its shape is kept. The group's
    own gap is the median over its albums that are not stacked (ISLAND_STACKED_GAPS), and the enlargement
    stops at ISLAND_MAX_RADIUS."""
    E = np.asarray(E, dtype=float).copy()
    gap = _positive_gap(E, "the layout")
    reach = link * gap
    pairs = cKDTree(E).query_pairs(reach, output_type="ndarray")
    graph = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(E), len(E)))
    n, label = connected_components(graph, directed=False)
    if n == 1:
        return E, 0
    main = int(np.bincount(label).argmax())
    attached = label == main
    islands = [np.flatnonzero(label == c) for c in range(n) if c != main]
    islands.sort(key=lambda idx: int(idx[0]))  # an order that does not depend on the component numbering
    for idx in islands:
        if len(idx) < 2:
            continue
        centre = E[idx].mean(0)
        radius = float(np.linalg.norm(E[idx] - centre, axis=1).max())
        inner = cKDTree(E[idx]).query(E[idx], k=2)[0][:, 1]
        inner = inner[inner > ISLAND_STACKED_GAPS * gap]
        if radius == 0 or not len(inner):
            continue
        grow = min(gap / float(np.median(inner)), ISLAND_MAX_RADIUS * gap * math.sqrt(len(idx)) / radius)
        if grow > 1:
            E[idx] = centre + (E[idx] - centre) * grow
    moved = 0
    while islands:
        tree = cKDTree(E[attached])
        base = E[attached]
        nearest = []
        for idx in islands:
            d, j = tree.query(E[idx])
            k = int(d.argmin())
            nearest.append((float(d[k]), base[j[k]] - E[idx[k]]))
        pick = min(range(len(islands)), key=lambda i: nearest[i][0])
        idx, (_, step) = islands.pop(pick), nearest[pick]
        lo, hi = 0.0, 1.0  # share of `step`: the gap is above `reach` at 0 and zero at 1
        for _ in range(40):
            mid = (lo + hi) / 2
            if tree.query(E[idx] + mid * step)[0].min() > reach:
                lo = mid
            else:
                hi = mid
        E[idx] += lo * step
        attached[idx] = True
        moved += len(idx)
    return E, moved


def _key(p) -> tuple[float, ...]:
    """The position as written to positions.json (flat_positions rounding), so stack detection and the
    validator agree on which albums share a position."""
    return tuple(flat_positions(np.asarray(p, dtype=float).reshape(1, 2)))


def fix_stacks(E: np.ndarray, eps: float = 0.004) -> tuple[np.ndarray, int]:
    """Points that coincide after rounding to 3 decimals are spread on a small ring."""
    E = E.copy()
    groups: dict[tuple[float, ...], list[int]] = {}
    for i, p in enumerate(E):
        groups.setdefault(_key(p), []).append(i)
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
    c = Counter(_key(p) for p in E)
    return sum(n for n in c.values() if n > 1)


def umap_embed(X: np.ndarray, min_dist: float = 0.1) -> np.ndarray:
    from umap import UMAP  # imported lazily: numba start-up is slow

    return UMAP(**UMAP_PARAMS, min_dist=min_dist).fit_transform(X).astype(float)


def _fit_all(out: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """One divisor for every stop, so the largest coordinate of all is 1 and the stops keep their relative sizes."""
    m = max(float(np.abs(E).max()) for E in out.values())
    return {stop: E / m for stop, E in out.items()}


def finalize_layouts(raw: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Islands moved next to the cloud, outlier compression, box normalisation, Procrustes of sonic and mood
    onto balanced, sonic and mood resized to balanced's median nearest-neighbour gap, all three scaled into
    [-1, 1] by one factor, then stacked points spread (up to 10 passes). Raises ValueError for a layout with
    non-finite positions or with half its albums on top of another one.

    The site applies one transform (the balanced layout's) to every stop and draws covers at one size, so the
    stops have to share a density, not a bounding box."""
    out: dict[str, np.ndarray] = {}
    for stop in STOPS:
        _positive_gap(raw[stop], f"the {stop} layout")
        E, _ = pull_islands(np.asarray(raw[stop], dtype=float))
        E, _ = fix_outliers(E)
        out[stop] = norm_box(E)
    gap = _positive_gap(out["balanced"], "the balanced layout")
    for stop in ("sonic", "mood"):
        E = procrustes_to(out[stop], out["balanced"])
        centre = E.mean(0)
        out[stop] = centre + (E - centre) * (gap / _positive_gap(E, f"the {stop} layout"))
    out = _fit_all(out)
    for _ in range(10):
        out = _fit_all({stop: fix_stacks(E)[0] for stop, E in out.items()})
        if all(stacked3(E) == 0 for E in out.values()):
            return out
    bad = next(stop for stop, E in out.items() if stacked3(E) != 0)
    raise RuntimeError(f"{bad}: stacked points remain after 10 passes")


def build_layouts(sub: pd.DataFrame, block: np.ndarray, has_audio: np.ndarray | None = None) -> dict[str, np.ndarray]:
    """The three layouts. `has_audio` is not used yet (see recs.build_recs)."""
    return finalize_layouts({stop: umap_embed(site_matrix(sub, block, SLIDER[stop]), UMAP_MIN_DIST[stop])
                             for stop in STOPS})


def flat_positions(E: np.ndarray) -> list[float]:
    """[x0, y0, x1, y1, ...] rounded to 3 decimals, with -0.0 normalised to 0.0."""
    return [round(float(v), 3) + 0.0 for v in np.asarray(E, dtype=float).reshape(-1)]
