"""Membership carry-forward: a region is a persistent set of albums, re-checked in each new layout,
instead of being re-found by clustering. Same output schema and status values as find_regions.

`prev` must come from `as_prev(out, keys, roster=True)`: level-1 members are untrimmed rosters.
"""
from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from sklearn.neighbors import NearestNeighbors

from auto_regions import NON_NAME_WORDS, PARAMS, _build_level, auto_merge, mean_shift, trim

CARRY = {
    "join_k": 15, "join_share": 0.60,   # a new album joins a region holding >= 60% of its 15 feature-space neighbours
    "cohesion_min": 0.50,               # share of members' 15 map neighbours that are members (regions.md "holds" test)
    "component_min": 0.70,              # share of members in the largest connected piece of the map-neighbour graph
    "absorb": False,                    # optional: an unassigned album joins a surviving region when >= `interior`
                                        # of its 15 map neighbours are in that region (one pass)
}


def _largest_component(m: np.ndarray, nb: np.ndarray, n: int) -> np.ndarray:
    """Boolean mask over m: members in the largest connected component of the 15-neighbour graph restricted to m."""
    local = np.full(n, -1)
    local[m] = np.arange(len(m))
    tgt = local[nb[m]]
    rows = np.repeat(np.arange(len(m)), nb.shape[1])
    ok = tgt.ravel() >= 0
    g = coo_matrix((np.ones(ok.sum()), (rows[ok], tgt.ravel()[ok])), shape=(len(m), len(m)))
    _, comp = connected_components(g, directed=False)
    return comp == np.bincount(comp).argmax()


def carry_forward_regions(positions, W, words, features, prev, audio_z=None, feature_names=None, name_table=None,
                          album_keys=None, stop="balanced", params=None, non_name_words=NON_NAME_WORDS) -> dict:
    """features (n, d): the recommender matrix rows, used only to place new albums into existing regions."""
    p = {**PARAMS, **CARRY, **(params or {})}
    P = np.asarray(positions, dtype=float)
    W = np.asarray(W) > 0
    n = len(P)
    words, feature_names, name_table = list(words), list(feature_names or []), name_table or {}
    album_keys = list(album_keys)
    name_ok = np.array([w not in non_name_words for w in words])
    base = W.mean(0)
    prev_regions = prev["regions"]
    prev1 = [r for r in prev_regions if r.get("level", 1) == 1]
    used_ids = {r["id"] for r in prev_regions}
    prev_keys = set(prev["album_keys"])

    dist, nb = NearestNeighbors(n_neighbors=p["knn"] + 1).fit(P).kneighbors(P)
    gap = float(np.median(dist[:, 1]))
    nb = nb[:, 1:]

    # 1. previous members keep their region
    pos = {k: i for i, k in enumerate(album_keys)}
    lab0 = np.full(n, -1, dtype=int)
    prev_n = []
    for j, r in enumerate(prev1):
        idx = [pos[k] for k in r["members"] if k in pos]
        lab0[idx] = j
        prev_n.append(len(idx))
    # 2. new albums join by feature-space neighbours among previously placed albums
    old = np.array([k in prev_keys for k in album_keys])
    newi, oldi = np.flatnonzero(~old), np.flatnonzero(old)
    joined = 0
    if len(newi) and len(oldi):
        k = min(p["join_k"], len(oldi))
        _, fn = NearestNeighbors(n_neighbors=k).fit(features[oldi]).kneighbors(features[newi])
        nl = lab0[oldi][fn]
        for a, row in zip(newi, nl):
            row = row[row >= 0]
            if len(row):
                c = np.bincount(row)
                if c.max() >= p["join_share"] * k:
                    lab0[a] = int(c.argmax())
                    joined += 1
    # 3a. contiguity gate in the new layout; members outside the main piece are released
    diag, not_contiguous, released = {}, [], 0
    for j, r in enumerate(prev1):
        m = np.flatnonzero(lab0 == j)
        if len(m) == 0:
            not_contiguous.append(r["id"])
            continue
        cohesion = float((lab0[nb[m]] == j).mean())
        big = _largest_component(m, nb, n)
        diag[r["id"]] = {"roster_before": int(len(m)), "cohesion": round(cohesion, 3), "largest_component": round(float(big.mean()), 3)}
        if cohesion < p["cohesion_min"] or big.mean() < p["component_min"]:
            lab0[m] = -1
            not_contiguous.append(r["id"])
        else:
            lab0[m[~big]] = -1
            released += int((~big).sum())
    absorbed = 0
    if p["absorb"]:
        free = np.flatnonzero(lab0 < 0)
        nl = lab0[nb[free]]
        for a, row in zip(free, nl):
            row = row[row >= 0]
            if len(row) and np.bincount(row).max() >= p["interior"] * nb.shape[1]:
                lab0[a] = int(np.bincount(row).argmax())  # nl was read before the pass, so order does not matter
                absorbed += 1
    # 4. new regions only among albums in no surviving region
    left = np.flatnonzero(lab0 < 0)
    if len(left) >= p["min_n"]:
        bl = mean_shift(P[left], p["fine_bw"] * gap)
        _, nbl = NearestNeighbors(n_neighbors=min(p["knn"] + 1, len(left))).fit(P[left]).kneighbors(P[left])
        merged, _ = auto_merge(bl, nbl[:, 1:], W[left], base, name_ok, p)
        lab0[left] = len(prev1) + merged
    # 3b. trim to interiors, then names with hysteresis (previous word kept while it passes)
    lab = trim(P, lab0, nb, dist, p)
    forced = {}
    for j, r in enumerate(prev1):
        if r["id"] in not_contiguous:
            continue
        now = {album_keys[i] for i in np.flatnonzero(lab0 == j)}
        was = {k for k in r["members"] if k in pos}
        forced[j] = {"prev": j, "jaccard": len(now & was) / max(len(now | was), 1), "containment": 1.0}
    reg1, idx1, retired1 = _build_level(1, P, lab, W, base, words, name_ok, audio_z, feature_names, name_table,
                                        prev_regions, album_keys, used_ids, p, prev_keys, forced_match=forced)
    for r in retired1:
        r["reason"] = "not contiguous in the new layout" if r["id"] in not_contiguous else "fails the gates"
    failed_gates = [r["id"] for r in retired1 if r["id"] not in not_contiguous]
    # coarse level: re-found and matched, as in find_regions (areas are containers, not persistent sets)
    coarse = mean_shift(P, p["coarse_mult"] * p["fine_bw"] * gap)
    reg0, idx0, retired0 = _build_level(0, P, coarse, W, base, words, name_ok, None, feature_names, {},
                                        prev_regions, album_keys, used_ids, p, prev_keys)
    roster = np.full(n, -1, dtype=int)
    for i, r in enumerate(reg1):
        inside = idx0[idx1 == i]
        inside = inside[inside >= 0]
        if len(inside) * 2 > r["n"]:
            top = np.bincount(inside).argmax()
            if (inside == top).sum() * 2 > r["n"]:
                r["parent"] = reg0[int(top)]["id"]
        roster[lab0 == lab0[np.flatnonzero(idx1 == i)[0]]] = i + len(reg0)
        if r["id"] in diag:
            diag[r["id"]]["roster"] = int((roster == i + len(reg0)).sum())
            diag[r["id"]]["shown"] = r["n"]
    return {
        "stop": stop, "n_albums": n, "gap": round(gap, 5), "bandwidth_gaps": p["fine_bw"],
        "bandwidth": round(p["fine_bw"] * gap, 5), "coarse_bandwidth_gaps": p["coarse_mult"] * p["fine_bw"],
        "coarse_blobs": int(coarse.max() + 1), "regions": reg0 + reg1,
        "album_region": [int(i + len(reg0)) if i >= 0 else -1 for i in idx1],
        "album_area": [int(i) for i in idx0], "album_roster": roster.tolist(),
        "retired": retired1 + retired0,
        "carry": {"new_albums": int(len(newi)), "new_albums_joined": joined, "members_released": released, "absorbed": absorbed,
                  "not_contiguous": not_contiguous, "failed_gates": failed_gates, "regions": diag},
    }
