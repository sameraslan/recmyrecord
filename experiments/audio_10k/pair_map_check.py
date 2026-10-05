"""The pair-fitted store map applied to the catalog: does a linear map fitted on the 349 same-track pairs
(iTunes clip vector -> its Deezer version, results/store_effect_fix.md section 8) bring the catalog's lists
to mix the two stores, with no new downloads, and what does it cost?

    cd experiments/audio_10k
    PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> pair_map_check.py
        -> results/pair_map_check.json, results/pair_map_check.md
    ... pair_map_check.py --md      # the markdown again from the JSON

numpy and scikit-learn on stored vectors. No model is loaded, no audio opened, nothing fetched. Reads, all
read-only (`mode=ro`): cache/store_effect_fix.sqlite (the paired clip vectors, variant `base`), the one-pass
clip cache data-pipeline/.cache/audio/onepass.sqlite (per-clip CLAP vectors), its backup
onepass.before-rekey.sqlite (only for the 16 albums the cache once held from both stores, as source_effect.py
section 4), catalog/albums.csv, audio/matches.csv, audio/keys.csv. Writes only the two result files.

The quantity. A CLAP clip vector is the mean of three L2-normalised window vectors, float32, not renormalised
(length about 0.96). The catalog cache stores exactly that per clip, and so does the experiment cache: the
Deezer clips of the pair tracks that are also in the catalog cache are bit-identical there (checked below).
So the map is fitted on those raw clip vectors and applied to raw clip vectors: per iTunes clip, before the
album mean. The album vector is then what rmr_audio.modelstore makes (OnePassCache.means, pool `rank`): the
float64 mean of the first four ok clips in rank order of one listing, direction only (unit). Deezer clips
and YouTube windows are not touched.

Maps (all affine, x -> x M + b, fitted on the pairs' raw vectors I (iTunes) and D (Deezer)):
  shift      x + mean(D - I)
  residual   x + mean(D - I) + (x - mean I) W, W the ridge fit of the centred difference D - I on the centred
             iTunes vector, penalty lambda. As lambda grows this goes to `shift`. The report's map
             (store_effect_report.learned_map), there fitted on unit vectors; `residual, lambda 1` is the
             one named in the reports and is the headline here. It was fixed before this script looked at
             the catalog; the other maps are shown beside it, not chosen among on catalog numbers.
  plain      mean D + (x - mean I) W, W the ridge fit of the centred D on the centred iTunes vector. As
             lambda grows this goes to the constant mean D.
  lowrank    `residual` with W cut to its r leading directions (reduced rank: the SVD of the fitted values).

Sections of the result:
  quantity     the check that the two caches hold the same thing.
  cv           held-out pairs, five album-grouped folds (GroupKFold, as the report): same-track cosine,
               store probe, retrieval, cross-store neighbours, and what the map does to the iTunes clips'
               own neighbourhoods. Measures are store_effect_report's, on unit vectors.
  catalog      per map fitted on all pairs: source_effect.py's neighbour table and probes over the same
               9,577 albums, the block refitted (PCA(64) of the centred unit vectors: the site's block up to
               a scale factor, which no list depends on).
  halves       the headline map fitted on two disjoint halves of the pair albums: do the catalog lists agree?
  duplicates   the 16 albums (63 tracks) the catalog cache held from both stores: an independent set of
               same-track pairs, from the catalog's own clips. The map never saw them.
  pair_albums  the pair albums that the catalog uses from iTunes.
  youtube      the albums on YouTube windows, which the map leaves alone (and, for comparison only, mapped
               as if they were iTunes clips, which no pair supports).
"""
import argparse
import csv
import datetime
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

import numpy as np

import measure
import sonic
import source_effect as se
from sonic import REPO, RESULTS

sys.path.insert(0, str(REPO / "data-pipeline"))
from rmr_audio.modelstore import CLIPS, album_means, listing_of  # noqa: E402
from rmr_audio.onepass_cache import WINDOW_SOURCES, OnePassCache, read_only  # noqa: E402
from rmr_pipeline.artists import clean_artist  # noqa: E402
from rmr_pipeline.audio import unit  # noqa: E402
from rmr_pipeline.audio_store import StoreError  # noqa: E402
from rmr_pipeline.keys import load_keys  # noqa: E402

HERE = Path(__file__).resolve().parent
PAIR_DB = HERE / "cache" / "store_effect_fix.sqlite"
AUDIO, CACHE_DB, BACKUP_DB = se.AUDIO, se.CACHE_DB, se.BACKUP_DB
OUT_JSON, OUT_MD = RESULTS / "pair_map_check.json", RESULTS / "pair_map_check.md"
K = sonic.K
FOLDS = 5
HEADLINE = "residual, lambda 1"
YT_TOO = "residual, lambda 1, YouTube windows mapped as if they were iTunes clips"
LAMBDAS = (0.01, 0.1, 0.3, 1.0, 3.0, 10.0, 100.0)
RANKS = (1, 2, 4, 8, 16, 32, 64)
CATALOG_MAPS = ("shift", "residual, lambda 0.1", HEADLINE, "residual, lambda 10", "plain, lambda 0.1", "plain, lambda 1",
                "lowrank 8 (lambda 1)")


def r(x, n=4):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


# ---------------------------------------------------------------------------------------------- pairs

def load_pairs() -> dict:
    con = sqlite3.connect(f"file:{PAIR_DB}?mode=ro", uri=True, timeout=120)
    try:
        albums = {k: json.loads(v) for k, v in con.execute("SELECT key, info FROM album")}
        info = {(k, u): json.loads(v) for k, u, v in con.execute("SELECT key, unit, info FROM pair")}
        emb = {(k, u, s): np.frombuffer(v, "<f4").astype(np.float64) for k, u, s, v in con.execute(
            "SELECT key, unit, store, vec FROM emb WHERE kind = 'clip' AND variant = 'base'")}
        recipe = dict(con.execute("SELECT k, v FROM meta")).get("recipe")
    finally:
        con.close()
    units = sorted({(k, u) for k, u, _ in emb if (k, u, "deezer") in emb and (k, u, "itunes") in emb})
    names = sorted({k for k, _ in units})
    ids = {k: i for i, k in enumerate(names)}
    return {"units": units, "D": np.stack([emb[(k, u, "deezer")] for k, u in units]),
            "I": np.stack([emb[(k, u, "itunes")] for k, u in units]), "alb": np.array([ids[k] for k, _ in units]),
            "keys": np.array([k for k, _ in units]), "albums": albums, "info": info, "recipe": recipe}


# ----------------------------------------------------------------------------------------------- maps

def fit_map(I: np.ndarray, D: np.ndarray, name: str) -> tuple[np.ndarray, np.ndarray]:
    """(M, b) with mapped = x @ M + b, on raw clip vectors. See the module docstring for the names."""
    p = I.shape[1]
    mu, eye = I.mean(axis=0), np.eye(p)
    A, R = I - mu, D - I
    Rm = R.mean(axis=0)
    if name == "none":
        return eye, np.zeros(p)
    if name == "shift":
        return eye, Rm
    kind, _, rest = name.partition(", lambda ")
    if kind == "residual":
        W = np.linalg.solve(A.T @ A + float(rest) * eye, A.T @ (R - Rm))
        return eye + W, Rm - mu @ W
    if kind == "plain":
        Dm = D.mean(axis=0)
        W = np.linalg.solve(A.T @ A + float(rest) * eye, A.T @ (D - Dm))
        return W, Dm - mu @ W
    if name.startswith("lowrank "):
        rank, lam = int(name.split()[1]), float(name.split("lambda ")[1].rstrip(")"))
        W = np.linalg.solve(A.T @ A + lam * eye, A.T @ (R - Rm))
        Vt = np.linalg.svd(A @ W, full_matrices=False)[2][:rank]
        W = W @ Vt.T @ Vt
        return eye + W, Rm - mu @ W
    raise ValueError(name)


def apply_map(X: np.ndarray, m: tuple[np.ndarray, np.ndarray]) -> np.ndarray:
    return X @ m[0] + m[1]


def out_of_fold(I: np.ndarray, D: np.ndarray, alb: np.ndarray, name: str, on_unit: bool = False) -> np.ndarray:
    """The iTunes clips mapped by a map fitted on the other albums' pairs (five album-grouped folds), raw.
    on_unit: fitted and applied on unit vectors, as store_effect_report.learned_map does."""
    from sklearn.model_selection import GroupKFold

    if on_unit:
        I, D = unit(I), unit(D)
    out = np.zeros_like(I)
    for tr, te in GroupKFold(n_splits=FOLDS).split(I, groups=alb):
        out[te] = apply_map(I[te], fit_map(I[tr], D[tr], name))
    return out


def kept_of_ten(X: np.ndarray, B: np.ndarray, alb: np.ndarray) -> float:
    """Of a clip's ten nearest clips of other albums (cosine, one store), how many stay."""
    def nn(Z):
        S = np.where(alb[:, None] == alb[None, :], -np.inf, Z @ Z.T)
        return np.argsort(-S, axis=1)[:, :K]

    return float(np.mean([len(set(a) & set(b)) for a, b in zip(nn(X).tolist(), nn(B).tolist())]))


def cv_row(P: dict, Im_raw: np.ndarray, rng: np.random.Generator) -> dict:
    """store_effect_report's measures for mapped iTunes clips against the Deezer clips left alone."""
    import store_effect_report as ser

    D, I0, Im, alb = unit(P["D"]), unit(P["I"]), unit(Im_raw), P["alb"]
    c, pr, rt, cs = ser.cosines(D, Im, alb, rng), ser.store_probe(D, Im, alb), ser.retrieval(D, Im), ser.cross_share(D, Im, alb)["other_albums"]
    off = ~np.eye(len(D), dtype=bool) & (alb[:, None] != alb[None, :])
    return {"same_track": c["same_track_cross_store"], "same_track_median": c["same_track_cross_store_median"],
            "same_track_p10": c["same_track_cross_store_p10"], "same_track_ci95": c["same_track_ci95"],
            "other_track_same_album_same_store": c["other_track_same_album_same_store"],
            "probe_auc": pr["auc"], "probe_fold_sd": pr["fold_sd"], "pairs_itunes_scored_higher": pr["pairs_itunes_scored_higher"],
            "top1": rt["top1"], "top5": rt["top5"],
            "cross_share": cs["share"], "cross_share_deezer_seeds": cs["deezer_seeds"], "cross_share_itunes_seeds": cs["itunes_seeds"],
            "itunes_neighbours_kept_of_10": r(kept_of_ten(Im, I0, alb), 2),
            "cosine_with_own_unmapped_vector": r(float(np.mean(np.sum(Im * I0, axis=1)))),
            "norm_ratio_mapped_to_deezer": r(float(np.linalg.norm(Im_raw, axis=1).mean() / np.linalg.norm(P["D"], axis=1).mean())),
            "other_album_cosine_mapped": r(float((Im @ Im.T)[off].mean())), "other_album_cosine_deezer": r(float((D @ D.T)[off].mean())),
            "other_album_cosine_cross": r(float((D @ Im.T)[off].mean()))}


def cv_section(P: dict) -> dict:
    names = (["none", "shift"] + [f"residual, lambda {l:g}" for l in LAMBDAS] + [f"plain, lambda {l:g}" for l in LAMBDAS]
             + [f"lowrank {k} (lambda 1)" for k in RANKS] + [f"lowrank {k} (lambda 0.1)" for k in (8, 32)])
    out = {}
    for name in names:
        out[name] = cv_row(P, out_of_fold(P["I"], P["D"], P["alb"], name), np.random.default_rng(0))
    out["residual, lambda 1, fitted on unit vectors (the report's)"] = cv_row(
        P, out_of_fold(P["I"], P["D"], P["alb"], "residual, lambda 1", on_unit=True), np.random.default_rng(0))
    # the reference: two Deezer halves cannot be made, so the within-store floor is the report's `mp3st` (0.950 / 0.685 / 49.1%)
    print("  cv done", flush=True)
    return out


# ------------------------------------------------------------------------------------- catalog clips

class Catalog:
    """Every catalog album with an ok CLAP clip: its listing chosen as OnePassCache.means does, and the
    per-clip vectors the album mean is taken over (the first four ok clips in rank order; every window of a
    full-length listing)."""

    def __init__(self):
        table = sonic.read_catalog()
        self.table = {row["rym_id"]: row for row in table}
        catalog = [row["rym_id"] for row in table]
        cache = OnePassCache(CACHE_DB, readonly=True)
        try:
            named = listing_of(AUDIO / "matches.csv", cache, "clap")
            listings = cache.listings()
            clips: dict[tuple, list] = {}
            for key, source, album_id, track_id, emb in cache.con.execute(
                    "SELECT e.key, e.source, e.album_id, e.track_id, e.emb FROM embeddings e JOIN clips c USING (key, source, album_id, track_id) "
                    "WHERE e.model = 'clap' AND e.status = 'ok' AND e.emb IS NOT NULL "
                    "ORDER BY e.key, e.source, e.album_id, c.prio IS NULL, c.prio, c.track_idx"):
                clips.setdefault((key, source, album_id), []).append((track_id, np.frombuffer(emb, "<f4")))
            windowed: dict[str, tuple] = {}
            for key, source, album_id, n in cache.con.execute(
                    "SELECT key, source, album_id, COUNT(*) FROM embeddings WHERE status = 'ok' AND source IN (%s) "
                    "GROUP BY 1, 2, 3 ORDER BY 1, 2, 3" % ", ".join("?" * len(WINDOW_SOURCES)), WINDOW_SOURCES):
                cand = (WINDOW_SOURCES.index(source), -n, source, album_id)
                if key not in windowed or cand < windowed[key]:
                    windowed[key] = cand
            ok: dict[str, Counter] = {}
            for (key, source, album_id), v in sorted(clips.items()):
                ok.setdefault(key, Counter())[(source, album_id)] = len(v)
            chosen = {}
            for key in sorted(ok):
                if key in windowed:
                    listing = windowed[key][2:]
                    n = listings.get((key, *listing), {}).get("n_windows") or None
                elif key in named:
                    listing, n = tuple(named[key]), CLIPS
                else:
                    listing, n = max(ok[key], key=lambda l: ok[key][l]), CLIPS
                rows = clips.get((key, *listing), [])
                rows = rows if n is None else rows[:n]
                if rows:
                    chosen[key] = (listing, rows)
            at = dict(chosen)
            wanted = set(catalog)
            keymap = load_keys(AUDIO / "keys.csv")
            for old in sorted(set(chosen) - wanted):  # as modelstore.album_means: a key the catalog no longer has
                try:
                    now = keymap.current(old)
                except StoreError:
                    continue
                if now in wanted and now not in at:
                    at[now] = chosen[old]
            seen: set[str] = set()
            names = [k for k in catalog if k in at and not (k in seen or seen.add(k))]
            self.keys = np.array(names)
            self.source = np.array([at[k][0][0] for k in names])
            self.album_id = np.array([at[k][0][1] for k in names])
            self.store = np.array([s.split(":")[0] for s in self.source.tolist()])
            self.clip_album = np.concatenate([np.full(len(at[k][1]), i) for i, k in enumerate(names)])
            self.clip_track = np.array([t for k in names for t, _ in at[k][1]])
            self.clips = np.stack([v for k in names for _, v in at[k][1]]).astype(np.float64)
            self.n_clips = np.bincount(self.clip_album, minlength=len(names))
            self.clip_itunes = self.store[self.clip_album] == "itunes"
            # the check: these means are the store's means
            k2, X2, n2, s2, _ = album_means(cache, "clap", catalog, AUDIO / "matches.csv", CLIPS, AUDIO / "keys.csv")
            mine = self.means(None)
            self.check = {"albums": len(names), "same_albums_as_modelstore": bool(k2.tolist() == names),
                          "same_sources": bool((s2 == self.source).all()) if len(s2) == len(names) else False,
                          "same_clip_counts": bool((n2 == self.n_clips).all()) if len(n2) == len(names) else False,
                          "max_abs_difference_of_means": float(np.abs(X2 - mine).max()) if X2.shape == mine.shape else None}
        finally:
            cache.close()

    def means(self, m: tuple[np.ndarray, np.ndarray] | None, also_youtube: bool = False) -> np.ndarray:
        """Album means (float64, not renormalised) with the map applied to every iTunes clip first."""
        C = self.clips
        if m is not None:
            C = C.copy()
            which = self.clip_itunes | (self.store[self.clip_album] == "youtube") if also_youtube else self.clip_itunes
            C[which] = apply_map(C[which], m)
        out = np.zeros((len(self.keys), C.shape[1]))
        np.add.at(out, self.clip_album, C)
        return out / self.n_clips[:, None]


class Pool:
    """The albums of `keys` with what source_effect's functions read from its Data (same fields)."""

    def __init__(self, cat: Catalog, pos: np.ndarray):
        self.pos = pos
        self.keys = cat.keys[pos]
        self.rows = [cat.table[k] for k in self.keys.tolist()]
        self.store = cat.store[pos]
        self.source = cat.source[pos]
        self.itunes = self.store == "itunes"
        self.youtube = self.store == "youtube"
        self.new = np.array([not row["legacy_uri"] for row in self.rows])
        names = [clean_artist(row["artist"]) for row in self.rows]
        ids: dict[str, int] = {}
        self.artist = np.array([ids.setdefault(f"{n}#{i}" if n == sonic.VARIOUS else n, len(ids)) for i, n in enumerate(names)])
        self.genres = [sonic.split(row["primary_genres"]) for row in self.rows]
        self.descriptors = [frozenset(sonic.split(row["top_descriptors"])) for row in self.rows]
        self.genre = np.array([g[0] if g else "" for g in self.genres])
        self.year = np.array([float(row["year"]) if row["year"].strip().isdigit() else np.nan for row in self.rows])
        self.rank = np.array([float(row["rank"]) if row["on_chart"] == "1" and row["rank"].isdigit() else np.nan for row in self.rows])
        self.decade = np.where(np.isnan(self.year), -1, self.year // 10 * 10).astype(int)
        self.has_meta = (self.genre != "") & ~np.isnan(self.year) & ~np.isnan(self.rank)

    def __len__(self) -> int:
        return len(self.keys)


# ------------------------------------------------------------------------------------------ catalog

def overlap(a: np.ndarray, b: np.ndarray, mask: np.ndarray | None = None) -> float:
    rows = range(len(a)) if mask is None else np.flatnonzero(mask).tolist()
    return round(float(np.mean([len(set(a[i].tolist()) & set(b[i].tolist())) for i in rows])), 3)


def lists_of(U: np.ndarray, d: Pool) -> dict:
    B = se.block(U)
    dz, it = np.flatnonzero(d.store == "deezer"), np.flatnonzero(d.itunes)
    return {"all": sonic.nearest(B), "deezer_only": sonic.nearest(B[dz]), "itunes_only": sonic.nearest(B[it])}


def catalog_row(d: Pool, U: np.ndarray, L: dict, base: dict, labels: measure.Labels, probes: bool = True) -> dict:
    lists = L["all"]
    pos = np.arange(len(d))
    dz = ~d.itunes
    groups = {"new Deezer seeds": d.new & dz, "new iTunes seeds": d.new & d.itunes,
              "existing Deezer seeds": ~d.new & dz, "existing iTunes seeds": ~d.new & d.itunes}
    per = labels.per_seed(lists)
    hub, n10 = measure.hubness(lists)
    cut = lambda mix: {g: {k: v[k] for k in ("seeds", "seeds_with_genre", "share_of_neighbours", "share_of_neighbours_seeds_with_genre",  # noqa: E731
                                              "same_genre_share", "share_of_neighbours_those_seeds", "same_genre_decade_share")}
                       for g, v in mix.items()}
    out = {"neighbours_from_itunes": cut(se.mixing(d, pos, lists, d.itunes, groups)),
           "neighbours_that_are_new": cut(se.mixing(d, pos, lists, d.new, {"new seeds": d.new, "existing seeds": ~d.new} | groups)),
           "genre_primary": measure.summary(per["genre_primary"]), "genre_family": measure.summary(per["genre_family"]),
           "desc_jaccard": measure.summary(per["desc_jaccard"]),
           "by_seed_store": {name: {m: measure.summary(per[m], mask)["mean"] for m in ("genre_primary", "genre_family", "desc_jaccard")}
                             for name, mask in (("Deezer seeds", dz), ("iTunes seeds", d.itunes))},
           "hubness": hub,
           "n10": {name: {"albums": int(mask.sum()), "mean": round(float(n10[mask].mean()), 2), "median": float(np.median(n10[mask])),
                          "never_recommended": round(float((n10[mask] == 0).mean()), 4), "max": int(n10[mask].max()),
                          "share_of_the_50_most_recommended": round(float(mask[np.argsort(-n10, kind="stable")[:50]].mean()), 3)}
                   for name, mask in (("Deezer albums", dz), ("iTunes albums", d.itunes), ("new Deezer", d.new & dz),
                                      ("new iTunes", d.new & d.itunes), ("existing Deezer", ~d.new & dz), ("existing iTunes", ~d.new & d.itunes))},
           "overlap_at_10_with_baseline": {"all seeds": overlap(lists, base["all"]), "Deezer seeds": overlap(lists, base["all"], dz),
                                           "iTunes seeds": overlap(lists, base["all"], d.itunes),
                                           "Deezer seeds, Deezer candidates only": overlap(L["deezer_only"], base["deezer_only"]),
                                           "iTunes seeds, iTunes candidates only": overlap(L["itunes_only"], base["itunes_only"])}}
    if probes:
        y_store, g_new = d.itunes[d.new].astype(int), d.artist[d.new]
        sub = d.new & d.has_meta
        ys, gs = d.itunes[sub].astype(int), d.artist[sub]
        take = se.matched(d, sub, ys)
        old = ~d.new
        out["probes"] = {
            "itunes_vs_deezer, new only": se.probe(U[d.new], y_store, g_new),
            "itunes_vs_deezer, new only, matched genre x decade": se.probe(U[sub][take], ys[take], gs[take]),
            "itunes_vs_deezer, existing only": se.probe(U[old], d.itunes[old].astype(int), d.artist[old]),
            "new_vs_existing, all": se.probe(U, d.new.astype(int), d.artist),
            "new_vs_existing, Deezer only": se.probe(U[dz], d.new[dz].astype(int), d.artist[dz]),
            "itunes_vs_deezer, new only, on the 64-number block": se.probe(se.block(U)[d.new].astype(np.float64), y_store, g_new, C=1.0)}
    return out


def catalog_section(cat: Catalog, d: Pool, P: dict) -> tuple[dict, dict, dict]:
    labels = measure.Labels(d.genres, d.descriptors)
    U0 = unit(cat.means(None)[d.pos])
    base = lists_of(U0, d)
    out = {"baseline": catalog_row(d, U0, base, base, labels)}
    print("  catalog: baseline done", flush=True)
    kept = {"baseline": base}
    vectors = {"baseline": U0}
    for name in CATALOG_MAPS:
        U = unit(cat.means(fit_map(P["I"], P["D"], name))[d.pos])
        L = lists_of(U, d)
        out[name] = catalog_row(d, U, L, base, labels)
        out[name]["album_cosine_with_unmapped"] = {"iTunes albums": r(float(np.sum(U * U0, axis=1)[d.itunes].mean())),
                                                   "Deezer albums": r(float(np.sum(U * U0, axis=1)[~d.itunes].mean()))}
        if name == HEADLINE:
            kept[name], vectors[name] = L, U
        print(f"  catalog: {name} done", flush=True)
    return out, kept, vectors


def halves_section(cat: Catalog, d: Pool, P: dict, kept: dict) -> dict:
    labels = measure.Labels(d.genres, d.descriptors)
    rng = np.random.default_rng(0)
    albums = np.unique(P["alb"])
    out = {"splits": []}
    full = kept[HEADLINE]
    for split in range(3):
        perm = rng.permutation(albums)
        halves = [np.isin(P["alb"], perm[:len(perm) // 2]), np.isin(P["alb"], perm[len(perm) // 2:])]
        Ls, rows, Us = [], [], []
        for h in halves:
            U = unit(cat.means(fit_map(P["I"][h], P["D"][h], HEADLINE))[d.pos])
            L = lists_of(U, d)
            row = catalog_row(d, U, L, kept["baseline"], labels, probes=False)
            rows.append({"pairs": int(h.sum()), "albums": int(len(np.unique(P["alb"][h]))),
                         "neighbours_from_itunes": {g: v["share_of_neighbours"] for g, v in row["neighbours_from_itunes"].items()},
                         "mean_n10": {g: row["n10"][g]["mean"] for g in ("Deezer albums", "iTunes albums")},
                         "genre_primary": row["genre_primary"]["mean"],
                         "overlap_at_10_with_the_full_map": {"all seeds": overlap(L["all"], full["all"]),
                                                             "Deezer seeds": overlap(L["all"], full["all"], ~d.itunes),
                                                             "iTunes seeds": overlap(L["all"], full["all"], d.itunes)}})
            Ls.append(L), Us.append(U)
        out["splits"].append({"halves": rows,
                              "overlap_at_10_between_the_halves": {
                                  "all seeds": overlap(Ls[0]["all"], Ls[1]["all"]), "Deezer seeds": overlap(Ls[0]["all"], Ls[1]["all"], ~d.itunes),
                                  "iTunes seeds": overlap(Ls[0]["all"], Ls[1]["all"], d.itunes),
                                  "iTunes seeds, iTunes candidates only": overlap(Ls[0]["itunes_only"], Ls[1]["itunes_only"])},
                              "album_cosine_between_the_halves_itunes": r(float(np.sum(Us[0] * Us[1], axis=1)[d.itunes].mean()))})
        print(f"  halves: split {split} done", flush=True)
    return out


# --------------------------------------------------------------------------------------- duplicates

def duplicates_section(P: dict) -> dict:
    """The albums the catalog cache held from both stores (source_effect.py section 4): same track positions,
    one Deezer and one iTunes listing. The maps are fitted on the pairs (minus any of these albums)."""
    groups = se.pair_groups()
    cons = [read_only(p) for p in (BACKUP_DB, CACHE_DB) if p.exists()]
    Dz, It, alb, keys = [], [], [], []
    try:
        for g, group in enumerate(groups):
            listings = {k: {i: c for i, c in v.items()} for k, v in se.group_listings(cons, group).items()}
            ls = sorted(listings)
            for i in range(len(ls)):
                for j in range(i + 1, len(ls)):
                    a, b = ls[i], ls[j]
                    if {se.store_of(a[0]), se.store_of(b[0])} != {"deezer", "itunes"}:
                        continue
                    A, B = listings[a], listings[b]
                    seq = lambda L: [i for i, _ in sorted(L.items(), key=lambda kv: kv[1]["prio"])]  # noqa: E731
                    if seq(A) != seq(B) or len(A) < 2:
                        continue
                    dz, it = (A, B) if se.store_of(a[0]) == "deezer" else (B, A)
                    for x in seq(A):
                        Dz.append(dz[x]["clap"]), It.append(it[x]["clap"]), alb.append(g)
                    keys.append(sorted(group))
    finally:
        for con in cons:
            con.close()
    if not Dz:
        return {"albums": 0}
    Dz, It, alb = np.stack(Dz), np.stack(It), np.array(alb)
    held = {k for ks in keys for k in ks}
    fit_on = ~np.isin(P["keys"], sorted(held))
    out = {"albums": len(keys), "tracks": len(Dz), "of_them_among_the_pair_albums": int(len(held & set(P["keys"].tolist()))),
           "pairs_fitted_on": int(fit_on.sum()), "maps": {}}
    D = unit(Dz)
    same_alb, off = alb[:, None] == alb[None, :], ~np.eye(len(D), dtype=bool)
    out["other_track_same_album_within_deezer"] = r(float((D @ D.T)[same_alb & off].mean()))
    rng = np.random.default_rng(0)
    for name in ("none",) + CATALOG_MAPS:
        M = unit(apply_map(It, fit_map(P["I"][fit_on], P["D"][fit_on], name)))
        x = D @ M.T
        same = np.diag(x)
        ranks = np.r_[(x > same[:, None]).sum(axis=1), (x > same[None, :]).sum(axis=0)]
        by = {a: same[alb == a] for a in np.unique(alb)}
        boots = [np.concatenate([by[a] for a in rng.choice(list(by), len(by))]).mean() for _ in range(500)]
        out["maps"][name] = {"same_track": r(same.mean()), "same_track_median": r(np.median(same)),
                             "same_track_ci95": [r(np.quantile(boots, 0.025)), r(np.quantile(boots, 0.975))],
                             "other_track_same_album_across": r(float(x[same_alb & off].mean())),
                             "own_track_found_top1": r(float((ranks == 0).mean()))}
        if name == "none":
            base = same
        else:
            out["maps"][name]["tracks_closer_than_unmapped"] = int((same > base).sum())
            out["maps"][name]["albums_closer_on_average"] = int(sum(same[alb == a].mean() > base[alb == a].mean() for a in np.unique(alb)))
    return out


def pair_albums_section(cat: Catalog, P: dict) -> dict:
    """The pair albums as the catalog has them: which store, whether the Deezer clips are the same vectors,
    and for the ones the catalog uses from iTunes, where the mapped catalog clips land against the experiment's
    Deezer clips of the same album (a map fitted without that album)."""
    at = {k: i for i, k in enumerate(cat.keys.tolist())}
    ok = sorted({k for k, _ in P["units"]})
    by_store = Counter(cat.store[at[k]] if k in at else "not in the catalog's audio" for k in ok)
    same, n_same = [], 0
    track_at = {(cat.store[a], t): j for j, (a, t) in enumerate(zip(cat.clip_album.tolist(), cat.clip_track.tolist()))}
    for (k, u), dv, iv in zip(P["units"], P["D"], P["I"]):
        info = P["info"][(k, u)]
        for store, tid, v in (("deezer", info["deezer_track"], dv), ("itunes", info["itunes_track"], iv)):
            j = track_at.get((store, str(tid)))
            if j is not None:
                same.append((store, float(np.abs(cat.clips[j] - v).max())))
    out = {"pair_albums": len(ok), "in_the_catalog_as": dict(by_store),
           "pair_tracks_also_in_the_catalog_cache": {s: {"tracks": sum(1 for x in same if x[0] == s),
                                                         "max_abs_difference": max((x[1] for x in same if x[0] == s), default=None)}
                                                     for s in ("deezer", "itunes")},
           "clip_vector_length": {"pairs, Deezer": r(float(np.median(np.linalg.norm(P["D"], axis=1)))),
                                  "pairs, iTunes": r(float(np.median(np.linalg.norm(P["I"], axis=1)))),
                                  "catalog, Deezer clips": r(float(np.median(np.linalg.norm(cat.clips[cat.store[cat.clip_album] == "deezer"], axis=1)))),
                                  "catalog, iTunes clips": r(float(np.median(np.linalg.norm(cat.clips[cat.clip_itunes], axis=1)))),
                                  "catalog, YouTube windows": r(float(np.median(np.linalg.norm(cat.clips[cat.store[cat.clip_album] == "youtube"], axis=1))))},
           "itunes_sourced": []}
    for k in ok:
        if k not in at or cat.store[at[k]] != "itunes":
            continue
        mine = P["keys"] == k
        clips = cat.clips[cat.clip_album == at[k]]
        tracks = set(cat.clip_track[cat.clip_album == at[k]].tolist())
        pair_tracks = {str(P["info"][u]["itunes_track"]) for u, m in zip(P["units"], mine) if m}
        m = fit_map(P["I"][~mine], P["D"][~mine], HEADLINE)
        cosu = lambda a, b: float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))  # noqa: E731
        dz, it = P["D"][mine].mean(axis=0), P["I"][mine].mean(axis=0)
        out["itunes_sourced"].append({
            "key": k, "catalog_clips": int(len(clips)), "pair_tracks": int(mine.sum()), "tracks_in_both": len(tracks & pair_tracks),
            "album_mean_vs_the_pairs_deezer_mean": {"unmapped": r(cosu(clips.mean(axis=0), dz)), "mapped": r(cosu(apply_map(clips, m).mean(axis=0), dz))},
            "album_mean_vs_the_pairs_itunes_mean": {"unmapped": r(cosu(clips.mean(axis=0), it))},
            "the_pairs_own_itunes_mean_vs_deezer_mean": {"unmapped": r(cosu(it, dz)), "mapped": r(cosu(apply_map(P["I"][mine], m).mean(axis=0), dz))}})
    return out


# ------------------------------------------------------------------------------------------ youtube

def youtube_section(cat: Catalog, main_keys: np.ndarray, P: dict) -> dict:
    """The main pool plus the albums on YouTube windows; the block refitted on that pool."""
    pos = np.flatnonzero(np.isin(cat.keys, main_keys) | (cat.store == "youtube"))
    d = Pool(cat, pos)
    yt = d.youtube
    out = {"albums": len(d), "youtube_albums": int(yt.sum()), "youtube_new": int((yt & d.new).sum()),
           "youtube_with_genre": int((yt & (d.genre != "")).sum()), "pool_share_youtube": r(float(yt.mean())),
           "windows_per_youtube_album": dict(sorted(Counter(cat.n_clips[pos][yt].tolist()).items())), "variants": {}}
    idx = np.arange(len(d))
    for name in ("baseline", HEADLINE, YT_TOO):
        U = unit(cat.means(None if name == "baseline" else fit_map(P["I"], P["D"], HEADLINE), also_youtube=name == YT_TOO)[pos])
        lists = sonic.nearest(se.block(U))
        n10 = np.bincount(lists.ravel(), minlength=len(lists))
        entry = {"mean_n10": {"YouTube albums": round(float(n10[yt].mean()), 2), "Deezer albums": round(float(n10[d.store == "deezer"].mean()), 2),
                              "iTunes albums": round(float(n10[d.itunes].mean()), 2)},
                 "youtube_never_recommended": int((n10[yt] == 0).sum()),
                 "youtube_seeds_with_a_youtube_neighbour": int((yt[lists[yt]].sum(axis=1) > 0).sum()),
                 "youtube_neighbours_in_youtube_lists": int(yt[lists[yt]].sum())}
        for flag_name, flag in (("youtube", yt), ("itunes", d.itunes), ("deezer", d.store == "deezer")):
            mix = se.mixing(d, idx, lists, flag, {"YouTube seeds": yt, "Deezer seeds": d.store == "deezer", "iTunes seeds": d.itunes})
            entry[f"neighbours_from_{flag_name}"] = {g: {k: v[k] for k in ("seeds", "seeds_with_genre", "share_of_neighbours",
                                                                             "share_of_neighbours_seeds_with_genre", "same_genre_share")}
                                                     for g, v in mix.items()}
        # a rough interval for the YouTube seeds' shares: resampling the seeds
        rng = np.random.default_rng(0)
        seeds = np.flatnonzero(yt)
        for flag_name, flag in (("youtube", yt), ("itunes", d.itunes)):
            per = flag[lists[seeds]].mean(axis=1)
            boots = [per[rng.integers(0, len(per), len(per))].mean() for _ in range(2000)]
            entry[f"neighbours_from_{flag_name}"]["YouTube seeds"]["ci95_over_seeds"] = [r(np.quantile(boots, 0.025)), r(np.quantile(boots, 0.975))]
        out["variants"][name] = entry
    print("  youtube done", flush=True)
    return out


# ----------------------------------------------------------------------------------------- markdown

def _t(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header), *("| " + " | ".join(row) + " |" for row in rows), ""]


def _pc(x) -> str:
    return "–" if x is None else f"{x:.1%}"


def _f(x, n=3) -> str:
    return "–" if x is None else f"{x:.{n}f}"


def markdown(res: dict) -> str:
    """The write-up. The verdict's sentences were written for the run of 2026-10-04; their numbers are read
    from the result, so a later run that moves them shows it, but read the verdict again then."""
    cat, cv, hv, du, yt, q, eff = res["catalog"], res["cv"], res["halves"], res["duplicates"], res["youtube"], res["quantity"], res["effnet_reference"]
    b, h = cat["baseline"], cat[HEADLINE]
    seeds = ("new Deezer seeds", "new iTunes seeds", "existing Deezer seeds", "existing iTunes seeds")
    it = lambda row, g, k="share_of_neighbours": row["neighbours_from_itunes"][g][k]  # noqa: E731
    closed = lambda g: (it(b, g) - it(h, g)) / (it(b, g) - it(b, g, "same_genre_share"))  # noqa: E731
    pr = lambda row, k: row["probes"][k]["auc"]  # noqa: E731
    yb, ym, yy = yt["variants"]["baseline"], yt["variants"][HEADLINE], yt["variants"][YT_TOO]
    hd = du["maps"][HEADLINE]
    half_dz = [x["neighbours_from_itunes"]["new Deezer seeds"] for s in hv["splits"] for x in s["halves"]]
    half_it = [x["neighbours_from_itunes"]["new iTunes seeds"] for s in hv["splits"] for x in s["halves"]]
    between = [s["overlap_at_10_between_the_halves"] for s in hv["splits"]]
    L = ["# The pair-fitted store map, applied to the catalog", "",
         f"Generated {res['generated']} by `pair_map_check.py`. The map is fitted on {res['pairs']['tracks']} tracks of "
         f"{res['pairs']['albums']} albums fetched from both stores (`store_effect_fix.md`), then applied to the "
         f"{res['pool']['itunes_clips_mapped']:,} stored iTunes clip vectors of the catalog ({res['pool']['itunes']:,} of "
         f"{res['pool']['albums']:,} albums; the same albums as `source_effect.md`). Deezer clips are not touched.", "",
         "**Stored vectors only: no model, no audio, no download. The music columns are RYM proxies. Nobody listened.**", "",
         "## Verdict", "",
         "**Most of the way, for both directions, at a small cost on what could be measured. Not all the way: iTunes seeds "
         "still get about ten points more iTunes neighbours than their genre's make-up, and a probe can still tell the "
         "stores apart. The albums on YouTube audio are left behind by it.**", "",
         f"- **Deezer seeds.** A new Deezer seed's ten neighbours go from {_pc(it(b, seeds[0]))} iTunes albums to "
         f"{_pc(it(h, seeds[0]))}. The make-up of its genre would give {_pc(it(b, seeds[0], 'same_genre_share'))} "
         f"({_pc(it(b, seeds[0], 'same_genre_decade_share'))} by genre and decade) and EffNet, which does not hear the store, "
         f"gives {_pc(eff[seeds[0]]['share_of_neighbours'])}. That is {closed(seeds[0]):.0%} of the gap closed. Existing Deezer seeds: "
         f"{_pc(it(b, seeds[2]))} to {_pc(it(h, seeds[2]))} against {_pc(it(b, seeds[2], 'same_genre_share'))}.",
         f"- **iTunes seeds.** {_pc(it(b, seeds[1]))} to {_pc(it(h, seeds[1]))}, against a make-up of "
         f"{_pc(it(b, seeds[1], 'same_genre_share'))} ({_pc(it(b, seeds[1], 'same_genre_decade_share'))} by genre and decade; EffNet "
         f"{_pc(eff[seeds[1]]['share_of_neighbours'])}). {closed(seeds[1]):.0%} of the gap closed; about ten points of preference for the "
         f"own store remain. Existing iTunes seeds: {_pc(it(b, seeds[3]))} to {_pc(it(h, seeds[3]))} against {_pc(it(b, seeds[3], 'same_genre_share'))}.",
         f"- **The store is still readable.** Probe AUC among new albums {_f(pr(b, 'itunes_vs_deezer, new only'))} to "
         f"{_f(pr(h, 'itunes_vs_deezer, new only'))} ({_f(pr(h, 'itunes_vs_deezer, new only, matched genre x decade'))} matched on genre and "
         f"decade; {_f(pr(h, 'itunes_vs_deezer, new only, on the 64-number block'))} on the 64-number block the lists use). Year, rank and genre "
         "alone give 0.640 and EffNet 0.678 (`source_effect.md`), so about 0.65 is where no store is left; on the held-out pairs the "
         f"same map read {_f(cv[HEADLINE]['probe_auc'])}. On the catalog the map removes less than on the pairs.",
         f"- **New and existing.** Existing seeds get {_pc(b['neighbours_that_are_new']['existing seeds']['share_of_neighbours'])} new neighbours "
         f"before and {_pc(h['neighbours_that_are_new']['existing seeds']['share_of_neighbours'])} after (make-up "
         f"{_pc(b['neighbours_that_are_new']['existing seeds']['same_genre_share'])}; EffNet 50.0%); new seeds "
         f"{_pc(b['neighbours_that_are_new']['new seeds']['share_of_neighbours'])} to {_pc(h['neighbours_that_are_new']['new seeds']['share_of_neighbours'])} "
         f"(make-up {_pc(b['neighbours_that_are_new']['new seeds']['same_genre_share'])}). New vs existing probe {_f(pr(b, 'new_vs_existing, all'))} to "
         f"{_f(pr(h, 'new_vs_existing, all'))}; inside Deezer alone it is {_f(pr(b, 'new_vs_existing, Deezer only'))}, the part that is the music.",
         f"- **Cost, on the proxies: none seen.** genre_primary {_f(b['genre_primary']['mean'])} to {_f(h['genre_primary']['mean'])}, "
         f"desc_jaccard {_f(b['desc_jaccard']['mean'])} to {_f(h['desc_jaccard']['mean'])} (both rise a little, for seeds of both stores). "
         f"Neither store is recommended less: mean N10 {h['n10']['Deezer albums']['mean']} for Deezer albums and "
         f"{h['n10']['iTunes albums']['mean']} for iTunes albums (before: {b['n10']['Deezer albums']['mean']} and {b['n10']['iTunes albums']['mean']}); "
         f"never recommended {_pc(h['n10']['Deezer albums']['never_recommended'])} and {_pc(h['n10']['iTunes albums']['never_recommended'])}; "
         f"skew {h['hubness']['skew']} (before {b['hubness']['skew']}).",
         f"- **Cost, in what moves.** A Deezer seed's ten nearest Deezer albums stay the same ({h['overlap_at_10_with_baseline']['Deezer seeds, Deezer candidates only']:.2f} "
         f"of 10; only the refitted block moves them). Its list keeps {h['overlap_at_10_with_baseline']['Deezer seeds']:.1f} of 10, the rest being "
         f"the iTunes albums that now enter. An iTunes seed's ten nearest iTunes albums keep {h['overlap_at_10_with_baseline']['iTunes seeds, iTunes candidates only']:.1f} "
         f"of 10: the map reorders the iTunes albums among themselves by about a sixth, and whether that is repair or damage the proxies "
         f"cannot say. A mapped iTunes album vector is at cosine {_f(h['album_cosine_with_unmapped']['iTunes albums'])} with its unmapped one.",
         f"- **It transfers to catalog clips it never saw.** {du['albums']} albums ({du['tracks']} tracks) were once in the catalog cache from both "
         f"stores. None is among the pair albums. The same track across stores goes from cosine {_f(du['maps']['none']['same_track'])} to "
         f"{_f(hd['same_track'])} (interval over albums {_f(hd['same_track_ci95'][0])} to {_f(hd['same_track_ci95'][1])}), closer for "
         f"{hd['tracks_closer_than_unmapped']} of {du['tracks']} tracks and {hd['albums_closer_on_average']} of {du['albums']} albums. On the "
         f"held-out pairs it was {_f(cv['none']['same_track'])} to {_f(cv[HEADLINE]['same_track'])}.",
         f"- **Stable enough.** Fitted on two disjoint halves of the pair albums, the two catalogs' lists share "
         f"{min(x['all seeds'] for x in between):.1f} to {max(x['all seeds'] for x in between):.1f} of 10 "
         f"(iTunes seeds {min(x['iTunes seeds'] for x in between):.1f} to {max(x['iTunes seeds'] for x in between):.1f}; three random splits). "
         f"Half the pairs mix a little less (Deezer seeds {_pc(min(half_dz))} to {_pc(max(half_dz))} iTunes neighbours, where all pairs give "
         f"{_pc(it(h, seeds[0]))}), so the map is still short of pairs: more pairs would probably close more of the gap.",
         f"- **YouTube albums ({yt['youtube_albums']}, small n) lose out.** They are not mapped. Before, they sat nearer the iTunes albums; "
         f"once those move, the YouTube albums are in fewer lists (mean N10 {yb['mean_n10']['YouTube albums']} to {ym['mean_n10']['YouTube albums']}; "
         f"{yb['youtube_never_recommended']} to {ym['youtube_never_recommended']} of {yt['youtube_albums']} in no list) and keep more to themselves "
         f"({_pc(yb['neighbours_from_youtube']['YouTube seeds']['share_of_neighbours'])} to {_pc(ym['neighbours_from_youtube']['YouTube seeds']['share_of_neighbours'])} "
         f"YouTube neighbours where the make-up gives {_pc(yb['neighbours_from_youtube']['YouTube seeds']['same_genre_share'])}).", "",
         "So: the pair map can replace the re-download for the Deezer/iTunes split as far as these proxies go, with a known remainder "
         "on the iTunes side. It does not settle YouTube audio, and nothing here says the lists sound right.", "",
         "## 1. Is it the same quantity, and how the map is applied", "",
         f"A clip vector in both caches is the mean of three L2-normalised window vectors, not renormalised ({res['pairs']['recipe']}). "
         f"{q['pair_tracks_also_in_the_catalog_cache']['deezer']['tracks']} Deezer clips of the pair tracks are also in the catalog cache "
         f"(same track id): largest absolute difference {q['pair_tracks_also_in_the_catalog_cache']['deezer']['max_abs_difference']}, so they are "
         f"the same numbers. No iTunes pair track is in the catalog cache ({q['pair_tracks_also_in_the_catalog_cache']['itunes']['tracks']}), so for "
         "iTunes the check is the recipe and the lengths: median clip-vector length "
         + ", ".join(f"{k} {v:.3f}" for k, v in q["clip_vector_length"].items()) + ".", "",
         "The report's map was fitted on unit clip vectors. Here it is fitted on the raw clip vectors, because that is what the album "
         "mean is taken over; on held-out pairs the two give the same result (section 2, last row). Each iTunes clip is mapped, then "
         "the album mean is taken over the first four ok clips in rank order, as `rmr_audio.modelstore` does. Rebuilt without a map, "
         f"these means equal the store's (`album_means`): largest difference {res['catalog_clip_check']['max_abs_difference_of_means']}, "
         f"{res['catalog_clip_check']['albums']:,} albums. The block is refitted for every row (PCA(64) of the centred unit vectors, the "
         "site's block up to a scale factor).", "",
         f"`{HEADLINE}` is the map the reports named, and it was fixed before the catalog was looked at. The others are beside it to show "
         "how much the choice matters, not to pick a winner on catalog numbers.", "",
         "## 2. Held-out pairs", "",
         f"{res['pairs']['tracks']} pairs, {res['pairs']['albums']} albums, five folds with an album's pairs kept together; the map is fitted "
         "on the other folds. Measures as `store_effect_fix.md` section 4, mapped iTunes clips against Deezer clips left alone. `Kept of 10`: "
         "of a mapped iTunes clip's ten nearest mapped iTunes clips of other albums, how many were its nearest before. For comparison, the "
         "stereo MP3 round trip of the audio gave 0.946, probe 0.804, 46.8% (42.0% / 51.5%) there.", ""]
    rows = []
    for name, v in cv.items():
        rows.append([f"`{name}`" if name != HEADLINE else f"**`{name}`**", f"{_f(v['same_track'])} ({_f(v['same_track_median'])})", _f(v["probe_auc"]),
                     _pc(v["top1"]), f"{_pc(v['cross_share'])} ({_pc(v['cross_share_deezer_seeds'])} / {_pc(v['cross_share_itunes_seeds'])})",
                     f"{v['itunes_neighbours_kept_of_10']:.1f}", _f(v["cosine_with_own_unmapped_vector"]),
                     f"{_f(v['other_album_cosine_mapped'])} / {_f(v['other_album_cosine_deezer'])}"])
    L += _t(["Map", "Same track, other store: cosine mean (median)", "Store probe AUC", "Own track found, top 1",
             "Neighbours from the other store (Deezer seeds / iTunes seeds)", "Kept of 10 inside iTunes", "Cosine with its own unmapped vector",
             "Mean cosine to clips of other albums: mapped iTunes / Deezer"], rows)
    L += ["- `residual` is flat between lambda 0.3 and 3 on the same-track cosine (0.92) and the neighbour share (49% to 51%). A probe below 0.5 "
          "means the mapped clips are told apart the other way round, which with 349 pairs is probably the fold effect of a paired design rather than information.",
          "- `plain` ridge is worse: it pulls every clip towards the Deezer mean (last column rises, the vectors shrink), so mapped iTunes clips "
          "become everyone's neighbour. On the catalog it makes iTunes albums the hubs (section 4).",
          "- `shift` alone gets the cosine to 0.905 but Deezer seeds to only 35% other-store neighbours. A few directions (`lowrank`) sit "
          "between: the store is a shift plus a map of some tens of directions, as `source_effect.md` section 6 suggested.", "",
          "## 3. The catalog: who is in the lists", "",
          f"{res['pool']['albums']:,} albums ({res['pool']['deezer']:,} Deezer, {res['pool']['itunes']:,} iTunes; {res['pool']['new']:,} new). Share of a "
          "seed's ten neighbours that are iTunes-sourced. `Make-up`: the share of iTunes albums among the other albums with the seed's first "
          "genre (and genre x decade), the target.", ""]
    rows = [["make-up: same genre"] + [_pc(it(b, g, "same_genre_share")) for g in seeds],
            ["make-up: same genre x decade"] + [_pc(it(b, g, "same_genre_decade_share")) for g in seeds],
            ["EffNet (`source_effect.md`)"] + [_pc(eff[g]["share_of_neighbours"]) for g in seeds]]
    for name, row in cat.items():
        rows.append([f"`{name}`" if name != HEADLINE else f"**`{name}`**"] + [_pc(it(row, g)) for g in seeds])
    L += _t(["", *(f"{g} (n {b['neighbours_from_itunes'][g]['seeds']:,})" for g in seeds)], rows)
    L += ["Share of neighbours that are new albums, and the probes (logistic regression on the album's unit vector, C 0.01, five folds grouped "
          "by artist, as `source_effect.py`; the map is fitted on the pairs, not on these albums, so the probe is a fair score here).", ""]
    nn = lambda row, g, k="share_of_neighbours": row["neighbours_that_are_new"][g][k]  # noqa: E731
    rows = [["make-up: same genre", _pc(nn(b, "new seeds", "same_genre_share")), _pc(nn(b, "existing seeds", "same_genre_share")), "", "", "", "", ""]]
    for name, row in cat.items():
        p = row["probes"]
        rows.append([f"`{name}`" if name != HEADLINE else f"**`{name}`**", _pc(nn(row, "new seeds")), _pc(nn(row, "existing seeds")),
                     _f(p["itunes_vs_deezer, new only"]["auc"]), _f(p["itunes_vs_deezer, new only, matched genre x decade"]["auc"]),
                     _f(p["itunes_vs_deezer, new only, on the 64-number block"]["auc"]), _f(p["itunes_vs_deezer, existing only"]["auc"]),
                     _f(p["new_vs_existing, all"]["auc"])])
    pb = b["probes"]
    L += _t(["", f"New neighbours, new seeds (n {b['neighbours_that_are_new']['new seeds']['seeds']:,})",
             f"New neighbours, existing seeds (n {b['neighbours_that_are_new']['existing seeds']['seeds']:,})",
             f"Store probe, new albums (n {pb['itunes_vs_deezer, new only']['n_pos']:,} / {pb['itunes_vs_deezer, new only']['n_neg']:,})",
             f"Matched genre x decade (n {pb['itunes_vs_deezer, new only, matched genre x decade']['n']:,})", "On the 64-number block",
             f"Store probe, existing albums (n {pb['itunes_vs_deezer, existing only']['n_pos']:,} / {pb['itunes_vs_deezer, existing only']['n_neg']:,})",
             "New vs existing"], rows)
    L += [f"New vs existing inside Deezer alone is {_f(pr(b, 'new_vs_existing, Deezer only'))} in every row (those vectors do not change): "
          "the floor for the last column.", "",
          "## 4. The catalog: what it costs", "",
          "`Overlap` is the mean number of the ten neighbours shared with the unmapped lists. `Deezer only` / `iTunes only`: the seed's ten "
          "nearest albums of its own store, so entries from the other store do not count as change. N10: the number of lists an album is in (10 on average).", ""]
    rows = []
    for name, row in cat.items():
        o, n = row["overlap_at_10_with_baseline"], row["n10"]
        rows.append([f"`{name}`" if name != HEADLINE else f"**`{name}`**", _f(row["genre_primary"]["mean"]), _f(row["genre_family"]["mean"]),
                     _f(row["desc_jaccard"]["mean"]),
                     f"{_f(row['by_seed_store']['Deezer seeds']['genre_primary'])} / {_f(row['by_seed_store']['iTunes seeds']['genre_primary'])}",
                     f"{n['Deezer albums']['mean']:.1f} / {n['iTunes albums']['mean']:.1f}",
                     f"{_pc(n['Deezer albums']['never_recommended'])} / {_pc(n['iTunes albums']['never_recommended'])}",
                     f"{n['iTunes albums']['share_of_the_50_most_recommended']:.0%}", f"{row['hubness']['skew']:.2f} / {row['hubness']['max']}",
                     f"{o['Deezer seeds']:.2f} / {o['iTunes seeds']:.2f}", f"{o['Deezer seeds, Deezer candidates only']:.2f}",
                     f"{o['iTunes seeds, iTunes candidates only']:.2f}"])
    L += _t(["", f"genre_primary (n {b['genre_primary']['n']:,})", "genre_family", f"desc_jaccard (n {b['desc_jaccard']['n']:,})",
             "genre_primary: Deezer / iTunes seeds", "Mean N10: Deezer / iTunes albums", "In no list: Deezer / iTunes",
             f"iTunes among the 50 most recommended (pool: {res['pool']['itunes'] / res['pool']['albums']:.0%})", "N10 skew / max",
             "Overlap: Deezer / iTunes seeds", "Deezer seeds, Deezer only", "iTunes seeds, iTunes only"], rows)
    L += ["- With the headline map both stores are recommended equally often. `shift`, `residual, lambda 10` and `lowrank 8` leave iTunes albums "
          "under-recommended (mean N10 about 8), `plain` over-recommends them (12 to 16; 90% of the 50 biggest hubs at lambda 1). That is "
          "the side to watch if the map is changed.",
          "- Genre and descriptor agreement rise slightly with every residual map, as with the corrections of `source_effect.md` section 6. "
          "That fits a nuisance being removed; it is a proxy.", "",
          "## 5. Robustness", "",
          "**Two halves of the pair albums.** 120 albums split at random into 60 and 60, three times; the headline map fitted on each half and "
          "applied to the catalog.", ""]
    rows = []
    for i, s in enumerate(hv["splits"]):
        a, c = s["halves"]
        o = s["overlap_at_10_between_the_halves"]
        rows.append([str(i + 1), f"{a['pairs']} / {c['pairs']}",
                     f"{_pc(a['neighbours_from_itunes']['new Deezer seeds'])} / {_pc(c['neighbours_from_itunes']['new Deezer seeds'])}",
                     f"{_pc(a['neighbours_from_itunes']['new iTunes seeds'])} / {_pc(c['neighbours_from_itunes']['new iTunes seeds'])}",
                     f"{a['mean_n10']['iTunes albums']:.1f} / {c['mean_n10']['iTunes albums']:.1f}",
                     f"{o['all seeds']:.2f}", f"{o['Deezer seeds']:.2f}", f"{o['iTunes seeds']:.2f}", f"{o['iTunes seeds, iTunes candidates only']:.2f}",
                     f"{a['overlap_at_10_with_the_full_map']['all seeds']:.2f} / {c['overlap_at_10_with_the_full_map']['all seeds']:.2f}",
                     _f(s["album_cosine_between_the_halves_itunes"])])
    L += _t(["Split", "Pairs in each half", "iTunes neighbours, new Deezer seeds", "iTunes neighbours, new iTunes seeds", "Mean N10, iTunes albums",
             "Overlap@10 between the halves: all seeds", "Deezer seeds", "iTunes seeds", "iTunes seeds, iTunes candidates only",
             "Overlap@10 with the all-pairs map", "Cosine between the two halves' iTunes album vectors"], rows)
    L += [f"All pairs: {_pc(it(h, seeds[0]))} and {_pc(it(h, seeds[1]))}, mean N10 of iTunes albums {h['n10']['iTunes albums']['mean']}. "
          "Two maps from disjoint pairs agree on about 8.5 of 10 neighbours, and on 7.5 of 10 for iTunes seeds: the direction of the result does "
          "not depend on which albums were paired, the exact lists of iTunes seeds do to about a quarter. Every half gives less mixing for Deezer "
          "seeds and fewer recommendations for iTunes albums than all pairs do, so the map is still improving with more pairs.", "",
          f"**The catalog's own doubles.** {du['albums']} albums, {du['tracks']} tracks at the same positions, held from both stores "
          "(`source_effect.md` section 4; read from the cache and its backup). The maps are fitted on the 349 pairs; none of these albums is "
          f"among them. Another track of the same album inside Deezer is at {_f(du['other_track_same_album_within_deezer'])}.", ""]
    rows = []
    for name, v in du["maps"].items():
        rows.append([f"`{name}`" if name != HEADLINE else f"**`{name}`**", f"{_f(v['same_track'])} ({_f(v['same_track_median'])})",
                     f"{_f(v['same_track_ci95'][0])} to {_f(v['same_track_ci95'][1])}", _f(v["other_track_same_album_across"]), _pc(v["own_track_found_top1"]),
                     "–" if name == "none" else f"{v['tracks_closer_than_unmapped']} of {du['tracks']}",
                     "–" if name == "none" else f"{v['albums_closer_on_average']} of {du['albums']}"])
    L += _t(["Map", "Same track, other store: cosine mean (median)", "95% interval (albums resampled)", "Other track of the album, other store",
             "Own track found among the 63, top 1", "Tracks closer than unmapped", "Albums closer"], rows)
    L += ["These are catalog clips, several embedded by the earlier run, of albums that are not the pair sample's kind (duplicate rows, several "
          "classical or live). The map does for them what it did for held-out pairs.", "",
          f"**Pair albums the catalog uses from iTunes.** Of the {q['pair_albums']} pair albums the catalog has "
          + ", ".join(f"{v} as {k}" for k, v in q["in_the_catalog_as"].items()) + ". So this check has n = "
          f"{len(q['itunes_sourced'])}, and for that album the catalog's four clips are other tracks than the paired ones."]
    for a in q["itunes_sourced"]:
        L += [f"`{a['key']}` (map fitted without it): cosine of the catalog album mean with the mean of the experiment's Deezer clips "
              f"{_f(a['album_mean_vs_the_pairs_deezer_mean']['unmapped'])} unmapped, {_f(a['album_mean_vs_the_pairs_deezer_mean']['mapped'])} mapped "
              f"(with the experiment's iTunes clips: {_f(a['album_mean_vs_the_pairs_itunes_mean']['unmapped'])}; the experiment's own iTunes clips "
              f"against its Deezer clips: {_f(a['the_pairs_own_itunes_mean_vs_deezer_mean']['unmapped'])} to {_f(a['the_pairs_own_itunes_mean_vs_deezer_mean']['mapped'])}). "
              "One album; it goes the right way and proves nothing."]
    L += ["", "## 6. YouTube windows", "",
          f"{yt['youtube_albums']} albums are in the cache as windows of full-album YouTube audio (opus), all new, "
          + ", ".join(f"{v} with {k} windows" for k, v in yt["windows_per_youtube_album"].items())
          + f". They are {_pc(yt['pool_share_youtube'])} of a pool of {yt['albums']:,}; the block is refitted on that pool. "
          f"**n = {yt['youtube_albums']} seeds: one neighbour more or less per seed is 10 points for that seed; read the direction only.** "
          "The interval is over resampled seeds.", ""]
    rows = []
    for name, v in yt["variants"].items():
        y, i, dzr = v["neighbours_from_youtube"]["YouTube seeds"], v["neighbours_from_itunes"]["YouTube seeds"], v["neighbours_from_deezer"]["YouTube seeds"]
        rows.append([f"`{name}`", f"{_pc(y['share_of_neighbours'])} ({_pc(y['ci95_over_seeds'][0])} to {_pc(y['ci95_over_seeds'][1])})", _pc(y["same_genre_share"]),
                     f"{v['youtube_seeds_with_a_youtube_neighbour']} of {yt['youtube_albums']}",
                     f"{_pc(i['share_of_neighbours'])} ({_pc(i['ci95_over_seeds'][0])} to {_pc(i['ci95_over_seeds'][1])})", _pc(i["same_genre_share"]),
                     _pc(dzr["share_of_neighbours"]), _pc(dzr["same_genre_share"]),
                     f"{v['mean_n10']['YouTube albums']:.1f}", f"{v['youtube_never_recommended']} of {yt['youtube_albums']}",
                     f"{_pc(v['neighbours_from_youtube']['Deezer seeds']['share_of_neighbours'])} / {_pc(v['neighbours_from_youtube']['iTunes seeds']['share_of_neighbours'])}"])
    L += _t(["", "YouTube seeds: YouTube neighbours", "make-up", "Seeds with a YouTube neighbour", "YouTube seeds: iTunes neighbours", "make-up",
             "YouTube seeds: Deezer neighbours", "make-up", "Mean N10 of YouTube albums", "YouTube albums in no list",
             "YouTube among Deezer / iTunes seeds' neighbours (make-up 0.8%)"], rows)
    L += [f"- Unmapped catalog: YouTube albums already keep to themselves about twice as much as the make-up gives, lean to iTunes albums "
          f"({_pc(yb['neighbours_from_itunes']['YouTube seeds']['share_of_neighbours'])} against {_pc(yb['neighbours_from_itunes']['YouTube seeds']['same_genre_share'])}) "
          f"and are in fewer lists than other albums (mean N10 {yb['mean_n10']['YouTube albums']}); almost no Deezer seed is given one "
          f"({_pc(yb['neighbours_from_youtube']['Deezer seeds']['share_of_neighbours'])}). They sit on the iTunes side of the split.",
          f"- After the map the iTunes albums have moved to the Deezer side and the YouTube albums have not: mean N10 "
          f"{ym['mean_n10']['YouTube albums']}, {ym['youtube_never_recommended']} in no list, iTunes seeds are given almost none "
          f"({_pc(ym['neighbours_from_youtube']['iTunes seeds']['share_of_neighbours'])}). As seeds they now get mostly Deezer albums, so their own "
          "lists are filled; it is as recommendations that they drop out.",
          f"- Last row, for comparison only: the YouTube windows put through the iTunes map. No pair supports it (the map was fitted on Apple's AAC, "
          f"YouTube is opus). Mean N10 {yy['mean_n10']['YouTube albums']}, {yy['youtube_never_recommended']} in no list, "
          f"{_pc(yy['neighbours_from_youtube']['YouTube seeds']['share_of_neighbours'])} YouTube neighbours. "
          "A map for YouTube would need its own pairs: `store_effect_fix.sqlite` has 150 YouTube windows of 25 pair albums, but they are other "
          "stretches of the album than the store clips, so they are not same-track pairs.", "",
          "## Caveats", "",
          "- **The pairs are not the albums the map is used on.** They come from albums that both stores carry (4,659 of the catalog, drawn over "
          "genre family, decade and new/existing). The catalog's iTunes-sourced albums are mostly the ones Deezer does not list. If Apple encodes "
          "those differently (other masters, other years of encoding) the map fits them less well. The 16 doubles and the probe speak to it only "
          "partly: the doubles are again albums both stores have.",
          "- **The remainder on the iTunes side is unexplained.** Ten points over the make-up and a probe of 0.80 against a floor near 0.65. It could "
          "be store signal a linear map from 349 pairs cannot reach (the halves say more pairs help), or a real difference between iTunes-only and "
          "Deezer albums that genre and decade do not describe. These numbers cannot separate the two.",
          "- **Proxies, not listening.** RYM genre and descriptor agreement, shares and overlaps. A map can raise all of them and still bend what "
          "iTunes albums sound like to the model: it changes an iTunes album vector to cosine 0.80 with itself and reorders iTunes albums among "
          "themselves by a sixth.",
          "- **The target is a proxy too.** The make-up by first genre (and decade) is what a store-blind model with nothing else to go on would "
          "give. EffNet, the only store-blind model at hand, lands two to four points under it for every seed group.",
          "- No split was held out on the catalog: one map was fixed beforehand and the others are shown as sensitivity. Intervals are given "
          "only where stated; the matched sample is one random draw.",
          "- The 80 YouTube albums are few, all new, and their means are over up to eight windows rather than four clips.", "",
          "## What would falsify it", "",
          "- **Listening.** If, in a blind comparison of lists for iTunes seeds, the mapped lists sound less like the seed than the unmapped ones, "
          "the map buys mixing with damage the proxies do not see.",
          "- **The audio fix on catalog albums.** Re-embed a few hundred iTunes-only catalog albums after the stereo MP3 round trip. If their "
          "re-embedded vectors are no closer to the mapped vectors than to the unmapped ones (the pairs say cosine about 0.92 against 0.77), the map "
          "does not transfer to iTunes-only albums. If the round trip brings iTunes seeds to the make-up where the map stops ten points short, the "
          "remainder is store signal and the audio fix is the better one.",
          "- **More pairs.** If a map fitted on, say, 1,000 pairs gives the same catalog numbers as this one, the remainder is not a shortage of "
          "pairs. The halves predict it should shrink.",
          "- **A same-store control.** If Deezer albums that have an Apple link and Deezer albums that do not are also told apart by a probe at "
          "about 0.8 after matching on genre and decade, then the 0.80 here is the albums, not the store, and the map has done all there is to do.", ""]
    return "\n".join(L)


# ---------------------------------------------------------------------------------------------- run

def run() -> dict:
    P = load_pairs()
    print(f"pairs: {len(P['units'])} tracks, {len(np.unique(P['alb']))} albums", flush=True)
    cat = Catalog()
    print(f"catalog: {cat.check}", flush=True)
    ref = se.Data()  # the 9,577 albums of source_effect.py (their keys only; the vectors here are from the clips)
    main_pos = np.flatnonzero(np.isin(cat.keys, ref.keys) & np.isin(cat.store, ("deezer", "itunes")))
    d = Pool(cat, main_pos)
    at = {k: i for i, k in enumerate(ref.keys.tolist())}
    U0 = unit(cat.means(None)[main_pos])
    agree = np.sum(U0 * ref.X["clap"][[at[k] for k in d.keys.tolist()]], axis=1)
    res = {"generated": datetime.date.today().isoformat(),
           "note": "Vectors only: no model, no audio, no network. RYM-catalog proxies; nobody listened.",
           "headline_map": HEADLINE, "pairs": {"tracks": len(P["units"]), "albums": int(len(np.unique(P["alb"]))), "recipe": P["recipe"]},
           "pool": {"albums": len(d), "source_effect_albums": len(ref), "deezer": int((~d.itunes).sum()), "itunes": int(d.itunes.sum()),
                    "new": int(d.new.sum()), "itunes_clips_mapped": int(cat.clip_itunes[np.isin(cat.clip_album, main_pos)].sum()),
                    "clips": int(np.isin(cat.clip_album, main_pos).sum()),
                    "min_cosine_with_source_effect_album_vectors": r(float(agree.min()), 6),
                    "same_store_labels_as_source_effect": bool((d.store == ref.store[[at[k] for k in d.keys.tolist()]]).all())},
           "catalog_clip_check": cat.check}
    res["quantity"] = pair_albums_section(cat, P)
    res["cv"] = cv_section(P)
    res["catalog"], kept, _ = catalog_section(cat, d, P)
    res["halves"] = halves_section(cat, d, P, kept)
    res["duplicates"] = duplicates_section(P)
    res["youtube"] = youtube_section(cat, d.keys, P)
    prev = json.loads((RESULTS / "source_effect.json").read_text())
    nb = prev["neighbours"]["whole catalog"]["effnet"]["neighbours_from_itunes"]
    res["effnet_reference"] = {g: {"share_of_neighbours": v["share_of_neighbours"], "same_genre_share": v["same_genre_share"]} for g, v in nb.items()}
    return res


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--md", action="store_true", help="Write the markdown again from the JSON; compute nothing.")
    args = p.parse_args(argv)
    if not args.md:
        res = run()
        OUT_JSON.write_text(json.dumps(res, indent=1) + "\n")
        print(f"wrote {OUT_JSON}")
    OUT_MD.write_text(markdown(json.loads(OUT_JSON.read_text())))
    print(f"wrote {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
