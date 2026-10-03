"""Automated map regions: mean-shift blobs, automatic merge, interior trim, gated naming,
a coarse level, and continuity with the previous build.

Pure functions, no file access. Intended to become `rmr_pipeline/regions.py`.
The only hand input is `name_table` (data word -> approved place name).

Units: every bandwidth is a multiple of the layout's median nearest-neighbour gap `g`,
so the recipe is independent of the box the layout is scaled to and of catalogue size.
"""
from __future__ import annotations

import re

import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.spatial import ConvexHull, QhullError
from sklearn.cluster import MeanShift
from sklearn.neighbors import NearestNeighbors

# Words that describe the line-up, not the mood. They stay in top_words but never name a region
# and are left out of the merge profile (same set as rmr_pipeline.constants.NON_MOOD).
NON_NAME_WORDS = frozenset({
    "male vocals", "female vocals", "androgynous vocals", "vocal group", "instrumental", "concept album",
})

PARAMS = {
    # scale
    "fine_bw": 15.0,        # fine mean-shift bandwidth in gaps (0.12 map units on the shipped balanced layout)
    "coarse_mult": 2.5,     # coarse bandwidth = coarse_mult * fine_bw
    # merge
    "adj_min": 0.20,        # each blob: share of its boundary points with a neighbour in the other blob
    "cos_min": 0.72,        # cosine of coverage * log2(lift) profiles over name-eligible words
    # trim (as regions/build_regions.py)
    "knn": 15, "interior": 0.70, "straggler_pct": 97.0, "far_pct": 92.0,
    "min_n": 30,            # a region with fewer trimmed members is not emitted
    # honesty gates (as regions/regions.md)
    "cov_strong": 0.40, "cov_fair": 0.35, "lift_min": 1.8, "excl": 0.8, "audio_z": 1.5,
    # top_words listing
    "top_cov": 0.25, "top_lift": 1.5,
    # continuity
    "match_jaccard": 0.30, "match_contain": 0.50,
    "hysteresis": 1.5,      # a challenger must be strong where the kept word is only fair AND score 1.5x higher
}


# ---------------------------------------------------------------- geometry

def median_gap(P: np.ndarray) -> float:
    d, _ = NearestNeighbors(n_neighbors=2).fit(P).kneighbors(P)
    return float(np.median(d[:, 1]))


def mean_shift(P: np.ndarray, bandwidth: float) -> np.ndarray:
    """Deterministic: bin seeding, no random state involved."""
    return MeanShift(bandwidth=bandwidth, bin_seeding=True).fit(P).labels_.astype(int)


def _hull(pts: np.ndarray, max_vertices: int = 24) -> np.ndarray:
    try:
        h = pts[ConvexHull(pts).vertices]
    except (QhullError, ValueError):
        return pts[:max_vertices]
    while len(h) > max_vertices:  # drop the vertex that removes least area
        n = len(h)
        u, v = h - np.roll(h, 1, 0), np.roll(h, -1, 0) - np.roll(h, 1, 0)
        a = np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0])
        h = np.delete(h, int(np.argmin(a)), 0)
    return h


# ---------------------------------------------------------------- word statistics

def _coverage(W: np.ndarray, lab: np.ndarray, k: int) -> np.ndarray:
    """(k, words) share of each group's albums carrying each word. Empty groups give zeros."""
    onehot = np.zeros((len(lab), k), dtype=np.float32)
    m = lab >= 0
    onehot[np.flatnonzero(m), lab[m]] = 1.0
    n = onehot.sum(0)
    return (onehot.T @ W.astype(np.float32)) / np.maximum(n, 1.0)[:, None]


def _lift(cov: np.ndarray, base: np.ndarray) -> np.ndarray:
    return np.where(base > 0, cov / np.maximum(base, 1e-9), 0.0)


def _score(cov: np.ndarray, lift: np.ndarray) -> np.ndarray:
    return cov * np.log2(np.maximum(lift, 1e-9))


def _leading(cov, lift, name_ok, p) -> np.ndarray:
    """Per group: index of the best-scoring word that passes the fair gate, or -1."""
    ok = name_ok[None, :] & (cov >= p["cov_fair"]) & (lift >= p["lift_min"])
    s = np.where(ok, _score(cov, lift), -np.inf)
    j = s.argmax(1)
    return np.where(ok.any(1), j, -1)


# ---------------------------------------------------------------- merge

def _adjacency(lab: np.ndarray, nb: np.ndarray, k: int) -> np.ndarray:
    """adj[a, b] = share of a's boundary points (members with a neighbour outside a) that have
    at least one of their nearest neighbours in b."""
    n = len(lab)
    nl = lab[nb]
    touch = np.zeros((n, k), dtype=bool)
    touch[np.repeat(np.arange(n), nb.shape[1]), nl.ravel()] = True
    boundary = (nl != lab[:, None]).any(1)
    adj = np.zeros((k, k))
    for a in range(k):
        m = boundary & (lab == a)
        if m.any():
            adj[a] = touch[m].mean(0)
    np.fill_diagonal(adj, 0.0)
    return adj


def auto_merge(lab: np.ndarray, nb: np.ndarray, W: np.ndarray, base: np.ndarray, name_ok: np.ndarray,
               p: dict) -> tuple[np.ndarray, list[dict]]:
    """Greedy agglomeration. A pair is merged when
      (1) adjacent: min(adj[a,b], adj[b,a]) >= adj_min, and
      (2) alike: same leading qualifying word, or profile cosine >= cos_min.
    Same-word pairs go first, then by cosine; statistics are recomputed after every merge."""
    lab = lab.copy()
    log: list[dict] = []
    while True:
        ids = np.unique(lab)
        remap = {int(v): i for i, v in enumerate(ids)}
        cl = np.array([remap[int(v)] for v in lab])
        k = len(ids)
        if k < 2:
            break
        cov = _coverage(W, cl, k)
        lift = _lift(cov, base)
        lead = _leading(cov, lift, name_ok, p)
        prof = cov * np.log2(np.maximum(lift, 1.0)) * name_ok[None, :]
        prof = prof / np.maximum(np.linalg.norm(prof, axis=1, keepdims=True), 1e-9)
        cos = prof @ prof.T
        adj = _adjacency(cl, nb, k)
        mutual = np.minimum(adj, adj.T)
        same = (lead[:, None] == lead[None, :]) & (lead[:, None] >= 0)
        ok = (mutual >= p["adj_min"]) & (same | (cos >= p["cos_min"]))
        np.fill_diagonal(ok, False)
        if not ok.any():
            break
        rank = np.where(ok, same * 2.0 + cos, -np.inf)
        a, b = np.unravel_index(int(rank.argmax()), rank.shape)
        a, b = (int(a), int(b)) if a < b else (int(b), int(a))
        log.append({"into": int(ids[a]), "from": int(ids[b]), "adjacency": round(float(mutual[a, b]), 2),
                    "cosine": round(float(cos[a, b]), 2), "same_word": bool(same[a, b])})
        lab[lab == ids[b]] = ids[a]
    return lab, log


# ---------------------------------------------------------------- trim

def trim(P: np.ndarray, lab0: np.ndarray, nb: np.ndarray, dist: np.ndarray, p: dict) -> np.ndarray:
    """Interior cores, as build_regions.py: >= 70% of the 15 nearest neighbours in the same region,
    not a sparse straggler (10th-neighbour distance above the 97th percentile), then the farthest 8%
    from each region's median centre removed."""
    same = (lab0[nb] == lab0[:, None]).mean(1)
    d10 = dist[:, min(10, dist.shape[1] - 1)]
    strag = d10 > np.percentile(d10, p["straggler_pct"])
    lab = np.where((lab0 >= 0) & (same >= p["interior"]) & ~strag, lab0, -1)
    for r in np.unique(lab[lab >= 0]):
        m = np.flatnonzero(lab == r)
        c = np.median(P[m], 0)
        d = np.linalg.norm(P[m] - c, axis=1)
        lab[m[d > np.percentile(d, p["far_pct"])]] = -1
    return lab


# ---------------------------------------------------------------- continuity

def match_previous(members: list[np.ndarray], album_keys: list, prev_regions: list[dict], p: dict,
                   prev_keys: set | None = None) -> dict[int, dict]:
    """One-to-one match of candidate regions to previous regions on shared album keys.
    Returns {candidate index: {"prev": position in prev_regions, "jaccard", "containment"}}.
    Albums missing from either build are ignored, so growth alone does not lower the overlap."""
    if not prev_regions or not members:
        return {}
    pos = {k: i for i, k in enumerate(album_keys)}
    prev_idx = [np.array(sorted({pos[k] for k in r["members"] if k in pos}), dtype=int) for r in prev_regions]
    n = len(album_keys)
    shared = np.ones(n, dtype=bool)
    if prev_keys:  # restrict candidates to albums the previous build knew
        shared = np.array([k in prev_keys for k in album_keys])
    A = np.zeros((len(members), n), dtype=np.float32)
    for i, m in enumerate(members):
        mm = m[shared[m]]
        A[i, mm] = 1.0
    B = np.zeros((len(prev_idx), n), dtype=np.float32)
    for j, m in enumerate(prev_idx):
        B[j, m] = 1.0
    inter = A @ B.T
    na, nb_ = A.sum(1)[:, None], B.sum(1)[None, :]
    jac = inter / np.maximum(na + nb_ - inter, 1.0)
    con = inter / np.maximum(np.minimum(na, nb_), 1.0)
    # A pair is acceptable when Jaccard >= match_jaccard, or when at least match_contain of the smaller
    # set is shared (a region that split or was absorbed). Only acceptable pairs enter the assignment,
    # so a good pair is never traded away for two pairs that would then be rejected.
    ok = (jac >= p["match_jaccard"]) | ((con >= p["match_contain"]) & (inter >= p["min_n"] / 2))
    gain = np.where(ok, jac, 0.0)
    rows, cols = linear_sum_assignment(-gain)
    return {int(i): {"prev": int(j), "jaccard": float(jac[i, j]), "containment": float(con[i, j])}
            for i, j in zip(rows, cols) if ok[i, j]}


# ---------------------------------------------------------------- naming

def _audio_key(feature: str, z: float) -> str:
    return feature + ("+" if z >= 0 else "-")


def _pick(cov, lift, nxt, name_ok, p, prev_word_j=None):
    """Choose the name word for one region. Returns (word index, strength) or None.
    Two tiers: strong (coverage >= cov_strong, lift, next region <= excl * coverage), then fair words
    this region owns (no other region has higher coverage). Best score within the tier. A word that
    another region carries more often never names this one, so no two regions share a word."""
    score = _score(cov, lift)
    fair = name_ok & (cov >= p["cov_fair"]) & (lift >= p["lift_min"])
    strong = fair & (cov >= p["cov_strong"]) & (nxt <= p["excl"] * cov)
    owner = fair & (nxt <= cov)
    if prev_word_j is not None and prev_word_j >= 0 and owner[prev_word_j]:
        j = prev_word_j
        challenger = strong & (score >= p["hysteresis"] * score[j])
        if strong[j] or not challenger.any():
            return int(j), ("strong" if strong[j] else "fair")
    for tier, s in ((strong, "strong"), (owner, "fair")):
        if tier.any():
            return int(np.where(tier, score, -np.inf).argmax()), s
    return None


def name_regions(lab: np.ndarray, k: int, W, base, words, name_ok, audio_z, feature_names, p,
                 prev_word: dict[int, str] | None = None) -> dict[int, dict]:
    """Name every group 0..k-1 of `lab` or drop it. `next` is taken over the regions that survive,
    so the pass repeats until the surviving set stops changing."""
    prev_word = prev_word or {}
    widx = {w: j for j, w in enumerate(words)}
    cov = _coverage(W, lab, k)
    lift = _lift(cov, base)
    n = np.bincount(lab[lab >= 0], minlength=k)
    zmean = None
    if audio_z is not None:
        zmean = np.array([audio_z[lab == r].mean(0) if n[r] else np.zeros(audio_z.shape[1]) for r in range(k)])
    alive = n >= p["min_n"]
    named: dict[int, dict] = {}
    for _ in range(6):
        named = {}
        taken: set[str] = set()   # audio traits already naming a region: one region per trait
        pending: list[int] = []   # regions with no word, candidates for an audio name

        def audio_entry(r, f, z):
            return {"named_from": "audio", "word": _audio_key(feature_names[f], z), "strength": "strong",
                    "evidence": {"feature": feature_names[f], "z": round(z, 2)}, "margin": abs(z) - p["audio_z"]}

        for r in np.flatnonzero(alive):
            others = alive.copy()
            others[r] = False
            nxt = cov[others].max(0) if others.any() else np.zeros(cov.shape[1])
            pw = prev_word.get(int(r))
            # previous audio name: keep while it still holds
            if pw is not None and zmean is not None and pw[:-1] in feature_names and pw[-1] in "+-" and pw not in taken:
                f = feature_names.index(pw[:-1])
                z = float(zmean[r, f])
                if abs(z) >= p["audio_z"] and _audio_key(pw[:-1], z) == pw:
                    named[int(r)] = audio_entry(r, f, z)
                    taken.add(pw)
                    continue
            got = _pick(cov[r], lift[r], nxt, name_ok, p, widx.get(pw, -1) if pw is not None else None)
            if got is not None:
                j, strength = got
                named[int(r)] = {"named_from": "word", "word": words[j], "strength": strength,
                                 "evidence": {"word": words[j], "coverage": round(float(cov[r, j]), 3),
                                              "overall": round(float(base[j]), 3), "lift": round(float(lift[r, j]), 2),
                                              "next": round(float(nxt[j]), 3)},
                                 "margin": float(cov[r, j] - p["cov_fair"])}
            elif zmean is not None:
                pending.append(int(r))
        # audio names: the region with the most extreme trait chooses first; a trait names one region only
        for r in sorted(pending, key=lambda r: -float(np.abs(zmean[r]).max())):
            for f in np.argsort(-np.abs(zmean[r])):
                z = float(zmean[r, f])
                if abs(z) < p["audio_z"]:
                    break
                if _audio_key(feature_names[f], z) not in taken:
                    named[r] = audio_entry(r, int(f), z)
                    taken.add(named[r]["word"])
                    break
        new_alive = np.zeros(k, dtype=bool)
        new_alive[list(named)] = True
        if (new_alive == alive).all():
            break
        alive = new_alive
    # top words and plain label
    score = _score(cov, lift)
    for r, info in named.items():
        ok = (cov[r] >= p["top_cov"]) & (lift[r] >= p["top_lift"])
        order = [int(j) for j in np.argsort(-np.where(ok, score[r], -np.inf)) if ok[j]]
        info["top_words"] = [{"word": words[j], "coverage": round(float(cov[r, j]), 3), "lift": round(float(lift[r, j]), 2)}
                             for j in order[:5]]
        mood = [words[j] for j in order if name_ok[j]]
        if info["named_from"] == "word":
            lead = [info["word"]] + [w for w in mood if w != info["word"]]
        else:
            z = info["evidence"]["z"]
            lead = [("high " if z > 0 else "low ") + info["evidence"]["feature"]] + mood
        info["plain"] = " · ".join(lead[:2])
    return named


# ---------------------------------------------------------------- one level

def _slug(word: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-") or "region"


def _build_level(level, P, lab, W, base, words, name_ok, audio_z, feature_names, name_table, prev_regions,
                 album_keys, used_ids, p, prev_keys=None, forced_match=None):
    """Match, name and describe the groups of `lab` (already trimmed). Returns (regions, per-album index
    into that list or -1, retired previous regions)."""
    ids = np.unique(lab[lab >= 0])
    remap = np.full(int(lab.max()) + 2, -1)
    remap[ids] = np.arange(len(ids))
    cl = np.where(lab >= 0, remap[np.maximum(lab, 0)], -1)
    k = len(ids)
    members = [np.flatnonzero(cl == r) for r in range(k)]
    prev_level = [r for r in (prev_regions or []) if r.get("level", 1) == level]
    if forced_match is not None:  # carry-forward: label value -> match record, no re-matching
        match = {int(remap[l]): m for l, m in forced_match.items() if l <= lab.max() and remap[l] >= 0}
    else:
        match = match_previous(members, album_keys, prev_level, p, prev_keys)
    prev_word = {i: prev_level[m["prev"]]["word"] for i, m in match.items() if prev_level[m["prev"]].get("word")}
    named = name_regions(cl, k, W, base, words, name_ok, audio_z, feature_names, p, prev_word)

    regions, album_idx = [], np.full(len(P), -1, dtype=int)
    n_max = max((len(members[r]) for r in named), default=1)
    for r in sorted(named, key=lambda r: (named[r]["strength"] != "strong", -len(members[r]))):
        info, idx = named[r], members[r]
        pts = P[idx]
        c = pts.mean(0)
        d = np.linalg.norm(pts - c, axis=1)
        m = match.get(r)
        if m is not None:
            pr = prev_level[m["prev"]]
            rid, prev_id = pr["id"], pr["id"]
            status = "kept" if pr.get("word") == info["word"] else "renamed"
            overlap = round(m["jaccard"], 3)
        else:
            base_id = ("area-" if level == 0 else "") + _slug(info["word"])
            rid, q = base_id, 2
            while rid in used_ids:
                rid, q = f"{base_id}-{q}", q + 1
            prev_id, status, overlap = None, "new", None
        used_ids.add(rid)
        name = name_table.get(info["word"]) if level == 1 else None
        priority = (10 if level == 0 else 0) + (2 if info["strength"] == "strong" else 1) \
            + 0.9 * len(idx) / n_max + 0.09 * float(np.clip(info["margin"], 0, 1))
        regions.append({
            "id": rid, "level": level, "parent": None, "word": info["word"], "named_from": info["named_from"],
            "name": name, "needs_name": bool(level == 1 and name is None), "plain": info["plain"],
            "strength": info["strength"], "priority": round(priority, 4),
            "cx": round(float(c[0]), 4), "cy": round(float(c[1]), 4), "radius": round(float(np.percentile(d, 75)), 4),
            "hull": [[round(float(x), 4), round(float(y), 4)] for x, y in _hull(pts)],
            "n": int(len(idx)), "evidence": info["evidence"], "top_words": info["top_words"],
            "best_known": [int(i) for i in idx[:8]], "centre": [int(i) for i in idx[np.argsort(d)][:6]],
            "prev_id": prev_id, "overlap": overlap, "status": status,
        })
        album_idx[idx] = len(regions) - 1
    live = {r["prev_id"] for r in regions if r["prev_id"] is not None}
    matched_prev = {prev_level[m["prev"]]["id"] for m in match.values()}
    retired = [{"id": r["id"], "level": level, "word": r.get("word"), "name": r.get("name"),
                "reason": "matched region fails the gates" if r["id"] in matched_prev else "no matching region"}
               for r in prev_level if r["id"] not in live]
    return regions, album_idx, retired


# ---------------------------------------------------------------- public entry point

def find_regions(positions, W, words, audio_z=None, feature_names=None, name_table=None, prev=None,
                 album_keys=None, stop="balanced", params=None, non_name_words=NON_NAME_WORDS) -> dict:
    """positions (n, 2); W (n, words) presence (bool or 0/1); audio_z (n, features) z-scores or None;
    name_table {word: approved place name}; prev = {"album_keys": [...], "regions": [{id, level, word,
    name, members: [album keys]}]} from `as_prev` on the previous build, or None;
    album_keys = stable album key per row. Returns the per-stop dict described in RESULTS.md."""
    p = {**PARAMS, **(params or {})}
    P = np.asarray(positions, dtype=float)
    W = np.asarray(W) > 0
    n = len(P)
    words = list(words)
    feature_names = list(feature_names or [])
    name_table = name_table or {}
    album_keys = list(album_keys) if album_keys is not None else list(range(n))
    name_ok = np.array([w not in non_name_words for w in words])
    base = W.mean(0)
    prev_regions = (prev or {}).get("regions", [])
    used_ids = {r["id"] for r in prev_regions}
    prev_keys = set((prev or {}).get("album_keys") or []) or None

    nn = NearestNeighbors(n_neighbors=p["knn"] + 1).fit(P)
    dist, nb = nn.kneighbors(P)
    gap = float(np.median(dist[:, 1]))
    nb = nb[:, 1:]

    # level 1: fine blobs -> merge -> trim
    blobs = mean_shift(P, p["fine_bw"] * gap)
    merged, merge_log = auto_merge(blobs, nb, W, base, name_ok, p)
    lab1 = trim(P, merged, nb, dist, p)
    reg1, idx1, retired1 = _build_level(1, P, lab1, W, base, words, name_ok, audio_z, feature_names, name_table,
                                        prev_regions, album_keys, used_ids, p, prev_keys)
    # level 0: coarse blobs, untrimmed (an area is a container, every album belongs to one blob)
    coarse = mean_shift(P, p["coarse_mult"] * p["fine_bw"] * gap)
    reg0, idx0, retired0 = _build_level(0, P, coarse, W, base, words, name_ok, None, feature_names, {},
                                        prev_regions, album_keys, used_ids, p, prev_keys)
    for i, r in enumerate(reg1):
        inside = idx0[idx1 == i]
        inside = inside[inside >= 0]
        if len(inside) * 2 > r["n"]:  # most of the region's members sit in named areas
            top = np.bincount(inside).argmax()
            if (inside == top).sum() * 2 > r["n"]:
                r["parent"] = reg0[int(top)]["id"]
    regions = reg0 + reg1
    roster = np.full(n, -1, dtype=int)  # untrimmed membership of each emitted region (used by carry-forward)
    for i in range(len(reg1)):
        roster[merged == merged[np.flatnonzero(idx1 == i)[0]]] = i + len(reg0)
    return {
        "stop": stop, "n_albums": n, "gap": round(gap, 5), "bandwidth_gaps": p["fine_bw"],
        "bandwidth": round(p["fine_bw"] * gap, 5), "coarse_bandwidth_gaps": p["coarse_mult"] * p["fine_bw"],
        "blobs": int(blobs.max() + 1), "merged_blobs": int(len(np.unique(merged))), "coarse_blobs": int(coarse.max() + 1),
        "merges": merge_log, "regions": regions,
        "album_region": [int(i + len(reg0)) if i >= 0 else -1 for i in idx1],
        "album_area": [int(i) for i in idx0],
        "album_roster": roster.tolist(),
        "retired": retired1 + retired0,
        "_blob_labels": blobs.tolist(), "_merged_labels": merged.tolist(),
    }


def as_prev(out: dict, album_keys: list, roster: bool = False) -> dict:
    """Turn a find_regions output into the `prev` argument of the next build. With roster=True the
    level-1 members are the untrimmed rosters (what carry_forward_regions needs)."""
    ar, aa = np.array(out["album_roster" if roster else "album_region"]), np.array(out["album_area"])
    regs = []
    for i, r in enumerate(out["regions"]):
        src = ar if r["level"] == 1 else aa
        regs.append({"id": r["id"], "level": r["level"], "word": r["word"], "name": r["name"],
                     "members": [album_keys[j] for j in np.flatnonzero(src == i)]})
    return {"album_keys": list(album_keys), "regions": regs}


def public(out: dict) -> dict:
    """Drop the diagnostic fields (leading underscore) before writing JSON for the site."""
    return {k: v for k, v in out.items() if not k.startswith("_")}
