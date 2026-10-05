"""Why do CLAP's lists keep new and existing albums apart? The music, the store the preview came from, or
the clips chosen: numpy-level probes over the one-pass clip cache. Descriptive, RYM-catalog proxies; nobody
listened and no audio is opened.

    cd experiments/audio_10k
    PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> source_effect.py
        -> results/source_effect.json, results/source_effect.md
    ... source_effect.py --model clap_mp3 [--refresh]
        -> results/source_effect.clap_mp3.{json,md}: the same with the cache's `clap_mp3` rows (the stereo MP3
           round trip, rmr_audio.mp3trip) read wherever this script reads `clap`. Its tables still say CLAP.
           Only the albums that have clap_mp3 clips are in it, so run it once the variant covers the catalog.

Reads, all read-only: catalog/albums.csv, audio/matches.csv, audio/keys.csv, the clip cache
(.cache/audio/onepass.sqlite, `mode=ro`: another job may be writing to it), its static backup
(onepass.before-rekey.sqlite) and pending_cache_rekey.csv for the albums that were in the cache twice. It
does not read or write data-pipeline/audio/clap/. The album means are kept in cache/source_effect_means.npz
(gitignored) so a second run does not query the cache again; --refresh rebuilds them.

Album vectors: the cache's four-clip means (pool `rank`, one listing per album: rmr_audio.modelstore.album_means,
as the CLAP store is written), scaled to length 1. Albums: the catalog's albums that have both models' clips
from a store preview (Deezer or iTunes); the few albums on full-length windows (youtube/local) are left out.
`new` = no legacy URI in the catalog (not on the site yet). `store` = deezer | itunes (any storefront).

What is measured (sections of the result):
  cells        n per new/existing x store, and how the store was chosen (matches.csv `matched_by`).
  probes       grouped 5-fold logistic regression (an artist never spans train and test; features
               standardised on the training fold; C fixed at 0.01, not tuned) -> AUC of the pooled
               out-of-fold scores, with the mean and sd of the five fold AUCs. Tasks: new vs existing (all,
               Deezer only, iTunes only), Deezer vs iTunes (new only, existing only), each also on a sample
               matched 1:1 on first primary genre x decade, and with year, rank and genre regressed out of
               the vectors inside each fold. Controls: iTunes US vs other storefronts (same codec, other
               catalogues) and metadata alone (logistic regression and gradient boosting on year, rank and
               genre).
  year         ridge probe for the release year (same folds): R2 and mean absolute error per model.
  neighbours   top 10 by a PCA(64) block of the unit vectors (as the site's block): share of neighbours
               from iTunes for Deezer and iTunes seeds against the share among the other albums of the
               seed's genre, and genre x decade.
  pairs        albums the cache holds twice, once from each store (a duplicate catalog row matched to the
               other store before it was dropped): cosine between the two stores' clips of the same track
               against different tracks of the same album, and whether a store probe trained on the other
               albums tells the two versions of the same album apart.
  clips        what the cache knows of the clips per store: length, rank, position in the album.
  correction   CLAP only: the store direction(s) removed from the unit vectors, then the block refitted:
               overlap@10 with the uncorrected lists, mixing of new/existing and of stores, RYM agreement.
               Measured, not adopted. The directions are fitted on all the albums they are then removed
               from: descriptive.
"""
import argparse
import csv
import datetime
import json
import sqlite3
import sys
import warnings
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

import sonic
from sonic import REPO, RESULTS

sys.path.insert(0, str(REPO / "data-pipeline"))
from rmr_audio.modelstore import CLIPS, album_means  # noqa: E402
from rmr_audio.onepass_cache import MODELS, OnePassCache, read_only  # noqa: E402
from rmr_audio.clips import priority_order  # noqa: E402
from rmr_pipeline.artists import clean_artist  # noqa: E402
from rmr_pipeline.audio import unit  # noqa: E402

AUDIO = REPO / "data-pipeline" / "audio"
CACHE_DIR = REPO / "data-pipeline" / ".cache" / "audio"
CACHE_DB = CACHE_DIR / "onepass.sqlite"
BACKUP_DB = CACHE_DIR / "onepass.before-rekey.sqlite"
REKEY = CACHE_DIR / "pending_cache_rekey.csv"
MEANS = Path(__file__).resolve().parent / "cache" / "source_effect_means.npz"
MODEL_NAMES = ("clap", "effnet")
CLAP_MODEL = "clap"  # the cache model read as `clap`: clap, or clap_mp3 (--model)
C_PROBE = 0.01
FOLDS = 5
K = sonic.K
BLOCK = 64
MIN_GENRE = 10  # a first primary genre with fewer albums than this is "other" in the covariates


# ------------------------------------------------------------------------------------------- loading

def store_of(source: str) -> str:
    return source.split(":")[0]


def build_means(refresh: bool) -> dict:
    path = MEANS if CLAP_MODEL == "clap" else MEANS.with_name(f"source_effect_means.{CLAP_MODEL}.npz")
    if path.exists() and not refresh:
        z = np.load(path, allow_pickle=False)
        return {k: z[k] for k in z.files}
    table = sonic.read_catalog()
    keys = [r["rym_id"] for r in table]
    out = {}
    cache = OnePassCache(CACHE_DB, readonly=True)
    try:
        for m in MODEL_NAMES:
            k, X, n, src, _ = album_means(cache, CLAP_MODEL if m == "clap" else m, keys, AUDIO / "matches.csv", CLIPS,
                                          AUDIO / "keys.csv")
            out[f"{m}_keys"], out[f"{m}_X"], out[f"{m}_n"], out[f"{m}_source"] = k, X.astype(np.float32), n, src
    finally:
        cache.close()
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(path, **out)
    return out


class Data:
    """The catalog's albums with a store preview in both models, in catalog order."""

    def __init__(self, refresh: bool = False):
        z = build_means(refresh)
        table = {r["rym_id"]: r for r in sonic.read_catalog()}
        at = {m: {k: i for i, k in enumerate(z[f"{m}_keys"].tolist())} for m in MODEL_NAMES}
        keys = [k for k in table if all(k in at[m] for m in MODEL_NAMES)]
        src = {m: z[f"{m}_source"][[at[m][k] for k in keys]] for m in MODEL_NAMES}
        same = src["clap"] == src["effnet"]
        store = np.array([store_of(s) for s in src["clap"].tolist()])
        keep = same & np.isin(store, ("deezer", "itunes"))
        self.left_out = {"other_source": int((~np.isin(store, ("deezer", "itunes"))).sum()),
                         "models_on_different_listings": int((~same).sum()), "catalog": len(table),
                         "with_both_models": len(keys)}
        keys = [k for k, ok in zip(keys, keep) if ok]
        self.keys = np.array(keys)
        self.rows = [table[k] for k in keys]
        self.X = {m: unit(z[f"{m}_X"][[at[m][k] for k in keys]]) for m in MODEL_NAMES}
        self.n_clips = {m: z[f"{m}_n"][[at[m][k] for k in keys]] for m in MODEL_NAMES}
        self.source = src["clap"][keep]
        self.store = store[keep]
        self.itunes = self.store == "itunes"
        self.new = np.array([not r["legacy_uri"] for r in self.rows])
        names = [clean_artist(r["artist"]) for r in self.rows]
        ids: dict[str, int] = {}
        self.artist = np.array([ids.setdefault(f"{n}#{i}" if n == sonic.VARIOUS else n, len(ids)) for i, n in enumerate(names)])
        self.genres = [sonic.split(r["primary_genres"]) for r in self.rows]
        self.descriptors = [frozenset(sonic.split(r["top_descriptors"])) for r in self.rows]
        self.genre = np.array([g[0] if g else "" for g in self.genres])
        self.year = np.array([float(r["year"]) if r["year"].strip().isdigit() else np.nan for r in self.rows])
        self.rank = np.array([float(r["rank"]) if r["on_chart"] == "1" and r["rank"].isdigit() else np.nan for r in self.rows])
        self.decade = np.where(np.isnan(self.year), -1, self.year // 10 * 10).astype(int)
        self.has_meta = (self.genre != "") & ~np.isnan(self.year) & ~np.isnan(self.rank)

    def __len__(self) -> int:
        return len(self.keys)

    def covariates(self, mask: np.ndarray) -> np.ndarray:
        """Year, year squared, log rank, decade and first-genre one-hots for the albums of `mask` (which
        must all have the three fields). Genres rarer than MIN_GENRE in the subset share one column."""
        g = self.genre[mask]
        counts = Counter(g.tolist())
        g = np.array([x if counts[x] >= MIN_GENRE else "(other)" for x in g.tolist()])
        vocab = {x: i for i, x in enumerate(sorted(set(g.tolist())))}
        G = np.zeros((len(g), len(vocab)))
        G[np.arange(len(g)), [vocab[x] for x in g.tolist()]] = 1
        d = self.decade[mask]
        dv = {x: i for i, x in enumerate(sorted(set(d.tolist())))}
        D = np.zeros((len(d), len(dv)))
        D[np.arange(len(d)), [dv[x] for x in d.tolist()]] = 1
        y = (self.year[mask] - 1990) / 20
        return np.column_stack([y, y ** 2, np.log(self.rank[mask]) - 8, D, G])


# -------------------------------------------------------------------------------------------- probes

def folds(y: np.ndarray, groups: np.ndarray):
    from sklearn.model_selection import StratifiedGroupKFold

    return list(StratifiedGroupKFold(n_splits=FOLDS, shuffle=True, random_state=0).split(np.zeros(len(y)), y, groups))


def residualise(Xtr: np.ndarray, Xte: np.ndarray, Ztr: np.ndarray, Zte: np.ndarray, lam: float = 1e-3):
    """Each feature minus its ridge fit on the covariates, the fit made on the training fold only."""
    mu, zm = Xtr.mean(axis=0), Ztr.mean(axis=0)
    A = Ztr - zm
    B = np.linalg.solve(A.T @ A + lam * np.eye(A.shape[1]), A.T @ (Xtr - mu))
    return Xtr - mu - A @ B, Xte - mu - (Zte - zm) @ B


def probe(X: np.ndarray, y: np.ndarray, groups: np.ndarray, Z: np.ndarray | None = None, add: np.ndarray | None = None,
          C: float = C_PROBE, model: str = "logistic") -> dict:
    """Grouped out-of-fold AUC. `Z`: covariates regressed out of X inside each fold. `add`: columns put
    beside X (covariates as extra features). model `boosting`: gradient boosting on X as it is."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.preprocessing import StandardScaler

    y = np.asarray(y).astype(int)
    out = {"n": int(len(y)), "n_pos": int(y.sum()), "n_neg": int((1 - y).sum())}
    if min(out["n_pos"], out["n_neg"]) < 40:
        return out | {"auc": None, "note": "under 40 albums in one class: not run"}
    scores, per = np.full(len(y), np.nan), []
    for tr, te in folds(y, groups):
        Xtr, Xte = X[tr], X[te]
        if Z is not None:
            Xtr, Xte = residualise(Xtr, Xte, Z[tr], Z[te])
        if add is not None:
            Xtr, Xte = np.column_stack([Xtr, add[tr]]), np.column_stack([Xte, add[te]])
        if model == "boosting":
            clf = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, random_state=0).fit(Xtr, y[tr])
            s = clf.predict_proba(Xte)[:, 1]
        else:
            sc = StandardScaler().fit(Xtr)
            clf = LogisticRegression(C=C, max_iter=3000).fit(sc.transform(Xtr), y[tr])
            s = clf.decision_function(sc.transform(Xte))
        scores[te] = s
        if len(set(y[te].tolist())) == 2:
            per.append(roc_auc_score(y[te], s))
    return out | {"auc": round(float(roc_auc_score(y, scores)), 4), "fold_mean": round(float(np.mean(per)), 4),
                  "fold_sd": round(float(np.std(per)), 4)}


def matched(d: Data, mask: np.ndarray, y: np.ndarray, seed: int = 0) -> np.ndarray:
    """Positions (within the albums of `mask`) of a sample holding, in each first genre x decade cell, as
    many albums of one class as of the other."""
    rng = np.random.default_rng(seed)
    pos = np.flatnonzero(mask)
    cells = defaultdict(lambda: ([], []))
    for j, i in enumerate(pos.tolist()):
        cells[(d.genre[i], int(d.decade[i]))][int(y[j])].append(j)
    take = []
    for a, b in cells.values():
        n = min(len(a), len(b))
        if n:
            take += rng.choice(a, n, replace=False).tolist() + rng.choice(b, n, replace=False).tolist()
    return np.array(sorted(take), dtype=np.int64)


def probe_tasks(d: Data) -> dict:
    out = {}
    meta = d.has_meta
    tasks = {
        "new_vs_existing, all": (np.ones(len(d), bool), d.new),
        "new_vs_existing, Deezer only": (~d.itunes, d.new),
        "new_vs_existing, iTunes only": (d.itunes, d.new),
        "itunes_vs_deezer, new only": (d.new, d.itunes),
        "itunes_vs_deezer, existing only": (~d.new, d.itunes),
        "control: iTunes US vs other storefronts, new iTunes only": (d.new & d.itunes, d.source != "itunes:us"),
    }
    for name, (mask, label) in tasks.items():
        entry = {}
        y, g = label[mask].astype(int), d.artist[mask]
        for m in MODEL_NAMES:
            entry[m] = probe(d.X[m][mask], y, g)
        sub = mask & meta
        ys, gs, Z = label[sub].astype(int), d.artist[sub], d.covariates(sub)
        raw = np.column_stack([d.year[sub], d.rank[sub], np.unique(d.genre[sub], return_inverse=True)[1]])
        entry["with_metadata"] = {
            "n": int(sub.sum()),
            "metadata_only_logistic": probe(Z, ys, gs, C=1.0),
            "metadata_only_boosting": probe(raw, ys, gs, model="boosting"),
            "year_only_boosting": probe(raw[:, :1], ys, gs, model="boosting"),
            "rank_only_boosting": probe(raw[:, 1:2], ys, gs, model="boosting"),
        }
        for m in MODEL_NAMES:
            X = d.X[m][sub]
            entry["with_metadata"][m] = {"plain": probe(X, ys, gs), "metadata_regressed_out": probe(X, ys, gs, Z=Z),
                                         "metadata_beside_vectors": probe(X, ys, gs, add=Z)}
        take = matched(d, sub, ys)
        ym, gm = ys[take], gs[take]
        entry["matched_genre_decade"] = {"n": int(len(take)),
                                         "metadata_only_boosting": probe(raw[take], ym, gm, model="boosting")}
        for m in MODEL_NAMES:
            entry["matched_genre_decade"][m] = probe(d.X[m][sub][take], ym, gm)
            entry["matched_genre_decade"][m + "_year_rank_regressed_out"] = probe(d.X[m][sub][take], ym, gm, Z=Z[take][:, :3])
        out[name] = entry
        print(f"  probes: {name} done", flush=True)
    return out


def year_probe(d: Data) -> dict:
    from sklearn.linear_model import RidgeCV
    from sklearn.preprocessing import StandardScaler

    out = {}
    for name, mask in {"all": ~np.isnan(d.year), "Deezer only": ~np.isnan(d.year) & ~d.itunes,
                       "new only": ~np.isnan(d.year) & d.new, "existing only": ~np.isnan(d.year) & ~d.new}.items():
        y, g = d.year[mask], d.artist[mask]
        split = folds((y >= np.median(y)).astype(int), g)
        entry = {"n": int(mask.sum())}
        for m in MODEL_NAMES:
            X, pred = d.X[m][mask], np.empty(len(y))
            for tr, te in split:
                sc = StandardScaler().fit(X[tr])
                pred[te] = RidgeCV(alphas=np.logspace(0, 4, 9)).fit(sc.transform(X[tr]), y[tr]).predict(sc.transform(X[te]))
            entry[m] = {"r2": round(float(1 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum()), 4),
                        "mae_years": round(float(np.abs(y - pred).mean()), 2)}
        out[name] = entry
    return out


# ---------------------------------------------------------------------------------------- neighbours

def block(U: np.ndarray, k: int = BLOCK) -> np.ndarray:
    """PCA(k) of the centred unit vectors: the site's block up to one scale factor, which no list depends on."""
    V = U - U.mean(axis=0)
    _, _, Vt = np.linalg.svd(V, full_matrices=False)
    return (V @ Vt[:k].T).astype(np.float32)


def expected_share(d: Data, pos: np.ndarray, flag: np.ndarray, by_decade: bool) -> np.ndarray:
    """Per album of the pool `pos`: the share of `flag` among the pool's other albums with its first genre
    (and decade). NaN without a genre or without another such album."""
    cell = [(d.genre[i], int(d.decade[i]) if by_decade else 0) for i in pos.tolist()]
    tot, hit = Counter(cell), Counter(c for c, f in zip(cell, flag[pos].tolist()) if f)
    return np.array([(hit[c] - f) / (tot[c] - 1) if c[0] and tot[c] > 1 else np.nan for c, f in zip(cell, flag[pos].tolist())])


def mixing(d: Data, pos: np.ndarray, lists: np.ndarray, flag: np.ndarray, groups: dict[str, np.ndarray]) -> dict:
    """For each seed group: the share of its neighbours that carry `flag`, and what the genre (and genre x
    decade) make-up of the pool would give. Means over the seeds with a genre, so the columns compare."""
    f = flag[pos]
    got = f[lists].mean(axis=1)
    e_g, e_gd = expected_share(d, pos, flag, False), expected_share(d, pos, flag, True)
    out = {}
    for name, mask in groups.items():
        if not mask[pos].any():
            continue
        m = mask[pos] & ~np.isnan(e_g)
        md = mask[pos] & ~np.isnan(e_gd)
        out[name] = {"seeds": int(mask[pos].sum()), "seeds_with_genre": int(m.sum()),
                     "share_of_neighbours": round(float(got[mask[pos]].mean()), 4),
                     "share_of_neighbours_seeds_with_genre": round(float(got[m].mean()), 4),
                     "same_genre_share": round(float(e_g[m].mean()), 4),
                     "seeds_with_genre_decade_cell": int(md.sum()),
                     "share_of_neighbours_those_seeds": round(float(got[md].mean()), 4),
                     "same_genre_decade_share": round(float(e_gd[md].mean()), 4)}
    return out


def neighbour_section(d: Data, blocks: dict[str, np.ndarray] | None = None) -> dict:
    out = {}
    pools = {"whole catalog": np.arange(len(d)), "new albums only": np.flatnonzero(d.new),
             "Deezer albums only": np.flatnonzero(~d.itunes)}
    for pname, pos in pools.items():
        entry = {"albums": int(len(pos)), "share_itunes": round(float(d.itunes[pos].mean()), 4),
                 "share_new": round(float(d.new[pos].mean()), 4)}
        for m in MODEL_NAMES:
            lists = sonic.nearest(block(d.X[m][pos]))
            e = {}
            if pname != "Deezer albums only":
                e["neighbours_from_itunes"] = mixing(d, pos, lists, d.itunes, {
                    "new Deezer seeds": d.new & ~d.itunes, "new iTunes seeds": d.new & d.itunes,
                    "existing Deezer seeds": ~d.new & ~d.itunes, "existing iTunes seeds": ~d.new & d.itunes})
            if pname != "new albums only":
                e["neighbours_that_are_new"] = mixing(d, pos, lists, d.new, {
                    "new seeds": d.new, "existing seeds": ~d.new, "new Deezer seeds": d.new & ~d.itunes,
                    "new iTunes seeds": d.new & d.itunes, "existing Deezer seeds": ~d.new & ~d.itunes,
                    "existing iTunes seeds": ~d.new & d.itunes})
            entry[m] = e
        out[pname] = entry
        print(f"  neighbours: {pname} done", flush=True)
    return out


# --------------------------------------------------------------------------------------------- pairs

def pair_groups() -> list[set[str]]:
    """Sets of cache keys that are one album: the two keys of a rename (pending_cache_rekey.csv), and any
    key holding more than one listing."""
    groups = []
    if REKEY.exists():
        with open(REKEY, newline="", encoding="utf-8") as f:
            groups += [{r["old_key"], r["new_key"]} for r in csv.DictReader(f) if r["action"] == "rename"]
    seen = set().union(*groups) if groups else set()
    for db in (BACKUP_DB, CACHE_DB):
        if not db.exists():
            continue
        con = read_only(db)
        try:
            for (key,) in con.execute("SELECT key FROM embeddings WHERE status = 'ok' AND model = ? GROUP BY key "
                                      "HAVING COUNT(DISTINCT source || '/' || album_id) > 1", (CLAP_MODEL,)):
                if key not in seen:
                    groups.append({key})
                    seen.add(key)
        finally:
            con.close()
    return groups


def group_listings(cons: list[sqlite3.Connection], keys: set[str]) -> dict[tuple[str, str], dict[int, dict]]:
    """(source, album id) -> {track position: {prio, clap, effnet}} for the clips ok in both models, over
    the group's keys; the first database that has a listing gives it."""
    out: dict[tuple[str, str], dict[int, dict]] = {}
    for con in cons:
        found: dict[tuple[str, str], dict[int, dict]] = {}
        for key in sorted(keys):
            for source, album_id, track_id, idx, prio, model, emb, origin in con.execute(
                    "SELECT e.source, e.album_id, e.track_id, c.track_idx, c.prio, e.model, e.emb, e.origin FROM embeddings e JOIN clips c "
                    "USING (key, source, album_id, track_id) WHERE e.key = ? AND e.status = 'ok' AND e.emb IS NOT NULL", (key,)):
                if idx is None or prio is None or prio >= CLIPS or model not in ("effnet", CLAP_MODEL):
                    continue
                clip = found.setdefault((source, album_id), {}).setdefault(idx, {"prio": prio})
                clip["effnet" if model == "effnet" else "clap"] = np.frombuffer(emb, MODELS[model].dtype).astype(np.float64)
                if model == CLAP_MODEL:
                    clip["origin"] = origin
        for listing, clips in found.items():
            clips = {i: c for i, c in clips.items() if all(m in c for m in MODEL_NAMES)}
            if clips and listing not in out:
                out[listing] = clips
    return out


def cos(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))


def describe(v: list[float]) -> dict:
    if not v:
        return {"n": 0}
    a = np.array(v)
    return {"n": len(v), "mean": round(float(a.mean()), 4), "median": round(float(np.median(a)), 4),
            "p10": round(float(np.percentile(a, 10)), 4), "p90": round(float(np.percentile(a, 90)), 4)}


def pair_section(d: Data) -> dict:
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    groups = pair_groups()
    cons = [read_only(p) for p in (BACKUP_DB, CACHE_DB) if p.exists()]
    kinds = ("cross_store", "same_store_other_listing", "same_listing_other_storefront")
    cosines = {k: {m: defaultdict(list) for m in MODEL_NAMES} for k in kinds}
    candidates, used, cross, names = Counter(), Counter(), [], []
    try:
        for keys in groups:
            listings = group_listings(cons, keys)
            ls = sorted(listings)
            for i in range(len(ls)):
                for j in range(i + 1, len(ls)):
                    a, b = ls[i], ls[j]
                    sa, sb = store_of(a[0]), store_of(b[0])
                    kind = "cross_store" if sa != sb else "same_listing_other_storefront" if a[1] == b[1] else "same_store_other_listing"
                    if {sa, sb} - {"deezer", "itunes"}:
                        continue
                    candidates[kind] += 1
                    A, B = listings[a], listings[b]
                    seq = lambda L: [i for i, _ in sorted(L.items(), key=lambda kv: kv[1]["prio"])]  # noqa: E731
                    if seq(A) != seq(B) or len(A) < 2:
                        continue  # not the same track positions: the two listings are not the same track list
                    used[kind] += 1
                    idx = seq(A)
                    for m in MODEL_NAMES:
                        c = cosines[kind][m]
                        for x in idx:
                            c["same_track_across"].append(cos(A[x][m], B[x][m]))
                            for y in idx:
                                if x < y:
                                    c["other_track_within_listing"] += [cos(A[x][m], A[y][m]), cos(B[x][m], B[y][m])]
                                if x != y:
                                    c["other_track_across"].append(cos(A[x][m], B[y][m]))
                    if kind == "cross_store":
                        dz, it = (A, B) if sa == "deezer" else (B, A)
                        cross.append({m: (np.mean([dz[x][m] for x in idx], axis=0), np.mean([it[x][m] for x in idx], axis=0),
                                          [(dz[x][m], it[x][m]) for x in idx]) for m in MODEL_NAMES})
                        names.append({"keys": sorted(keys), "deezer": (a if sa == "deezer" else b)[1],
                                      "itunes": "/".join(b if sa == "deezer" else a), "tracks": len(idx),
                                      "deezer_embedded_by": dz[idx[0]]["origin"], "itunes_embedded_by": it[idx[0]]["origin"]})
    finally:
        for con in cons:
            con.close()
    out = {"groups_examined": len(groups), "listing_pairs": dict(candidates), "listing_pairs_with_the_same_track_positions": dict(used),
           "cosines": {k: {m: {name: describe(v) for name, v in cosines[k][m].items()} for m in MODEL_NAMES} for k in kinds},
           "cross_store_albums": names, "store_probe_on_pairs": {}}
    if not cross:
        return out
    held = set().union(*groups)
    train = d.new & ~np.isin(d.keys, sorted(held))
    y = d.itunes[train].astype(int)
    for m in MODEL_NAMES:
        X = d.X[m][train]
        sc = StandardScaler().fit(X)
        clf = LogisticRegression(C=C_PROBE, max_iter=3000).fit(sc.transform(X), y)
        oof = np.empty(len(y))
        for tr, te in folds(y, d.artist[train]):
            s2 = StandardScaler().fit(X[tr])
            oof[te] = LogisticRegression(C=C_PROBE, max_iter=3000).fit(s2.transform(X[tr]), y[tr]).decision_function(s2.transform(X[te]))
        gap_pop = float(oof[y == 1].mean() - oof[y == 0].mean())
        score = lambda v: clf.decision_function(sc.transform(unit(np.atleast_2d(v))))  # noqa: E731
        album_gap = np.array([float(score(p[m][1])[0] - score(p[m][0])[0]) for p in cross])
        track_gap = np.array([float(score(t[1])[0] - score(t[0])[0]) for p in cross for t in p[m][2]])
        # the same without a probe: the pair's difference along the direction between the two stores' mean vectors
        w = X[y == 1].mean(axis=0) - X[y == 0].mean(axis=0)
        gap_w = float(np.linalg.norm(w))
        w /= gap_w
        proj = np.array([float((unit(np.atleast_2d(p[m][1]))[0] - unit(np.atleast_2d(p[m][0]))[0]) @ w) for p in cross])
        dbar = np.mean([unit(np.atleast_2d(p[m][1]))[0] - unit(np.atleast_2d(p[m][0]))[0] for p in cross], axis=0)
        half = len(cross) // 2
        d1 = np.mean([unit(np.atleast_2d(p[m][1]))[0] - unit(np.atleast_2d(p[m][0]))[0] for p in cross[:half]], axis=0)
        d2 = np.mean([unit(np.atleast_2d(p[m][1]))[0] - unit(np.atleast_2d(p[m][0]))[0] for p in cross[half:]], axis=0)
        tstat = lambda v: round(float(v.mean() / (v.std(ddof=1) / np.sqrt(len(v)))), 2) if len(v) > 1 else None  # noqa: E731
        out["store_probe_on_pairs"][m] = {
            "trained_on_new_albums": int(train.sum()),
            "album_pairs": len(cross),
            "pairs_where_the_itunes_version_is_the_earlier_runs": sum(n["itunes_embedded_by"] != "onepass" for n in names),
            "of_those_the_itunes_version_scores_more_itunes": int(sum(g > 0 for g, n in zip(album_gap, names) if n["itunes_embedded_by"] != "onepass")),
            "pairs_where_the_itunes_version_scores_more_itunes": int((album_gap > 0).sum()),
            "share": round(float((album_gap > 0).mean()), 3),
            "mean_score_gap_between_the_two_versions": round(float(album_gap.mean()), 3),
            "t": tstat(album_gap),
            "mean_score_gap_between_itunes_and_deezer_albums_out_of_fold": round(gap_pop, 3),
            "share_of_the_population_gap": round(float(album_gap.mean() / gap_pop), 3),
            "track_pairs": int(len(track_gap)),
            "track_pairs_where_the_itunes_clip_scores_more_itunes": int((track_gap > 0).sum()),
            "track_share": round(float((track_gap > 0).mean()), 3),
            "mean_difference_direction": {
                "distance_between_store_means_new_albums": round(gap_w, 4),
                "mean_pair_difference_along_it": round(float(proj.mean()), 4),
                "share_of_the_distance": round(float(proj.mean() / gap_w), 3),
                "pairs_positive": int((proj > 0).sum()), "t": tstat(proj),
                "cosine_of_mean_pair_difference_with_it": round(cos(dbar, w), 3),
                "length_of_mean_pair_difference": round(float(np.linalg.norm(dbar)), 4),
                "cosine_between_the_mean_differences_of_two_halves_of_the_pairs": round(cos(d1, d2), 3),
            },
        }
        out.setdefault("_pair_shift", {})[m] = dbar
    return out


# --------------------------------------------------------------------------------------------- clips

def clip_section(d: Data) -> dict:
    """What the cache knows about the clips behind the CLAP means, per store and new/existing."""
    con = read_only(CACHE_DB)
    try:
        rows = con.execute(
            "SELECT e.key, e.source, e.album_id, c.track_idx, c.prio, e.clip_s, c.track_s, e.origin, l.n_tracks, l.n_previews "
            "FROM embeddings e JOIN clips c USING (key, source, album_id, track_id) LEFT JOIN listings l USING (key, source, album_id) "
            "WHERE e.model = ? AND e.status = 'ok'", (CLAP_MODEL,)).fetchall()
    finally:
        con.close()
    with open(AUDIO / "matches.csv", newline="", encoding="utf-8") as f:
        match = {r["key"]: r for r in csv.DictReader(f)}
    at = {k: i for i, k in enumerate(d.keys.tolist())}
    albums: dict[str, list] = defaultdict(list)
    for key, source, album_id, idx, prio, clip_s, track_s, origin, n_tracks, n_prev in rows:
        if key in at and source == d.source[at[key]] and match.get(key, {}).get("source_album_id", album_id) == album_id:
            albums[key].append((prio if prio is not None else 10 ** 6, idx, clip_s, track_s, origin, n_tracks, n_prev))
    out = {}
    for name, mask in {"existing, Deezer": ~d.new & ~d.itunes, "existing, iTunes": ~d.new & d.itunes,
                       "new, Deezer": d.new & ~d.itunes, "new, iTunes": d.new & d.itunes}.items():
        clip_s, track_s, rel, n_alb, prefix, order_ok, order_n, origins, short = [], [], [], 0, 0, 0, 0, Counter(), 0
        for key in d.keys[mask].tolist():
            cl = sorted(albums.get(key, []))[:CLIPS]
            if not cl:
                continue
            n_alb += 1
            prefix += [c[0] for c in cl] == list(range(len(cl)))
            m = match.get(key, {})
            n = cl[0][6] or (int(m["n_clips_available"]) if m.get("n_clips_available", "").isdigit() else None)
            n_all = cl[0][5] or (int(m["n_tracks"]) if m.get("n_tracks", "").isdigit() else None)
            if n and len(cl) == CLIPS and n >= CLIPS:
                order_n += 1
                order_ok += [c[1] for c in cl] in (priority_order(n)[:CLIPS], priority_order(n_all or n)[:CLIPS])
            for c in cl:
                clip_s.append(c[2])
                origins[c[4]] += 1
                if c[3]:
                    track_s.append(c[3])
                    short += c[2] is not None and c[2] < 25 and c[3] > 60
                if n_all and n_all > 1 and c[1] is not None:
                    rel.append(c[1] / (n_all - 1))
        cs = np.array([x for x in clip_s if x is not None])
        out[name] = {"albums": n_alb, "clips": len(clip_s),
                     "clip_seconds": {"median": round(float(np.median(cs)), 3), "p1": round(float(np.percentile(cs, 1)), 3),
                                      "under_25_s": round(float((cs < 25).mean()), 4)},
                     "most_common_clip_seconds": [[round(v, 3), n] for v, n in Counter(np.round(cs, 3).tolist()).most_common(3)],
                     "track_seconds_known": len(track_s),
                     "track_seconds_median": round(float(np.median(track_s)), 1) if track_s else None,
                     "cut_short_previews": int(short),
                     "albums_whose_clips_are_ranks_0_to_3": round(prefix / n_alb, 4),
                     "albums_with_4_clips_and_a_known_track_count": order_n,
                     "of_those_in_the_planned_order": round(order_ok / order_n, 4) if order_n else None,
                     "mean_relative_position_in_album": round(float(np.mean(rel)), 3) if rel else None,
                     "embedded_by": dict(origins)}
    return out


# ---------------------------------------------------------------------------------------- correction

def remove(U: np.ndarray, dirs: np.ndarray) -> np.ndarray:
    """Unit vectors with the span of `dirs` projected out (not renormalised: the block centres anyway)."""
    Q, _ = np.linalg.qr(np.atleast_2d(dirs).T)
    return U - (U @ Q) @ Q.T


def align(U: np.ndarray, src: np.ndarray, dst: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    """U mapped so that the albums `src` get the mean and covariance of `dst` (whiten with src's
    covariance, colour with dst's: correlation alignment). It assumes the two sets hold the same music."""
    def root(S: np.ndarray, power: float) -> np.ndarray:
        w, V = np.linalg.eigh(S + eps * np.trace(S) / len(S) * np.eye(len(S)))
        return (V * w ** power) @ V.T

    return (U - src.mean(axis=0)) @ root(np.cov(src.T), -0.5) @ root(np.cov(dst.T), 0.5) + dst.mean(axis=0)


def probe_directions(U: np.ndarray, y: np.ndarray, k: int) -> np.ndarray:
    """k directions, each the weight vector of a logistic store probe fitted after the earlier ones were
    projected out (iterative nullspace projection). In the vectors' own space, not the standardised one."""
    from sklearn.linear_model import LogisticRegression

    dirs, V = [], U - U.mean(axis=0)
    sd = V.std(axis=0)
    for _ in range(k):
        w = LogisticRegression(C=C_PROBE, max_iter=3000).fit(V / sd, y).coef_[0] / sd
        w /= np.linalg.norm(w)
        dirs.append(w)
        V = V - np.outer(V @ w, w)
    return np.array(dirs)


def correction_section(d: Data, pair_shift: np.ndarray | None) -> dict:
    import measure

    U = d.X["clap"]
    labels = measure.Labels(d.genres, d.descriptors)
    new_it, new_dz = d.new & d.itunes, d.new & ~d.itunes
    w_mean = U[new_it].mean(axis=0) - U[new_dz].mean(axis=0)
    inlp = probe_directions(U[d.new], d.itunes[d.new].astype(int), 8)
    variants = {"none (as it is)": U,
                "1 direction: between the store means (new albums)": remove(U, w_mean),
                "1 direction: store probe weights (new albums)": remove(U, inlp[:1]),
                "2 directions: store probe, iterated": remove(U, inlp[:2]),
                "4 directions: store probe, iterated": remove(U, inlp[:4]),
                "8 directions: store probe, iterated": remove(U, inlp[:8]),
                "each store centred on its own mean": U - np.where(d.itunes[:, None], U[d.itunes].mean(axis=0), U[~d.itunes].mean(axis=0)),
                "control: 1 random direction": remove(U, np.random.default_rng(0).normal(size=U.shape[1])),
                "control: the block's first principal direction": remove(U, np.linalg.svd(U - U.mean(axis=0), full_matrices=False)[2][:1])}
    it, dz = U[d.itunes], U[~d.itunes]
    variants["each store standardised per dimension (mean and sd)"] = np.where(
        d.itunes[:, None], (U - it.mean(axis=0)) / it.std(axis=0), (U - dz.mean(axis=0)) / dz.std(axis=0)) * U.std(axis=0)
    variants["iTunes albums mapped onto Deezer's mean and covariance"] = np.where(d.itunes[:, None], align(U, it, dz), U)
    if pair_shift is not None:
        variants["1 direction: mean difference of the same-album pairs"] = remove(U, pair_shift)
        variants["iTunes albums shifted by the mean pair difference"] = U - np.where(d.itunes[:, None], pair_shift, 0.0)
    out, base = {}, None
    pos = np.arange(len(d))
    for name, V in variants.items():
        lists = sonic.nearest(block(V))
        if base is None:
            base = lists
        per = labels.per_seed(lists)
        n10 = np.bincount(lists.ravel(), minlength=len(lists))
        mix_new = mixing(d, pos, lists, d.new, {"new seeds": d.new, "existing seeds": ~d.new})
        mix_it = mixing(d, pos, lists, d.itunes, {"new Deezer seeds": new_dz, "new iTunes seeds": new_it})
        entry = {"overlap_at_10_with_uncorrected": round(float(np.mean([len(set(a) & set(b)) for a, b in zip(lists.tolist(), base.tolist())])), 3),
                 "genre_primary": measure.summary(per["genre_primary"])["mean"],
                 "genre_family": measure.summary(per["genre_family"])["mean"],
                 "desc_jaccard": measure.summary(per["desc_jaccard"])["mean"],
                 "neighbours_new": {g: {k: v[k] for k in ("share_of_neighbours", "share_of_neighbours_seeds_with_genre", "same_genre_share")}
                                    for g, v in mix_new.items()},
                 "neighbours_itunes": {g: {k: v[k] for k in ("share_of_neighbours", "share_of_neighbours_seeds_with_genre", "same_genre_share")}
                                       for g, v in mix_it.items()},
                 "mean_n10": {"Deezer albums": round(float(n10[~d.itunes].mean()), 2), "iTunes albums": round(float(n10[d.itunes].mean()), 2)},
                 "never_recommended": {"Deezer albums": round(float((n10[~d.itunes] == 0).mean()), 4),
                                       "iTunes albums": round(float((n10[d.itunes] == 0).mean()), 4)},
                 "genre_primary_by_seed": {"Deezer seeds": measure.summary(per["genre_primary"], ~d.itunes)["mean"],
                                           "iTunes seeds": measure.summary(per["genre_primary"], d.itunes)["mean"]},
                 "probe_store_new_albums": probe(V[d.new], d.itunes[d.new].astype(int), d.artist[d.new])["auc"],
                 "probe_new_vs_existing": probe(V, d.new.astype(int), d.artist)["auc"],
                 "probe_new_vs_existing_block64": probe(block(V).astype(np.float64), d.new.astype(int), d.artist, C=1.0)["auc"]}
        out[name] = entry
        print(f"  correction: {name} done", flush=True)
    return out


# ------------------------------------------------------------------------------------------ markdown

def _t(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header), *("| " + " | ".join(r) + " |" for r in rows), ""]


def _auc(x: dict | None) -> str:
    return "–" if not x or x.get("auc") is None else f"{x['auc']:.3f}"


def _pc(x: float | None) -> str:
    return "–" if x is None else f"{x:.1%}"


def markdown(res: dict) -> str:
    """The write-up. The verdict's sentences were written for the run of 2026-10-04; every number in them
    is read from the result, so a later run that moves them shows it, but read the verdict again then."""
    pr, nb, pa, co = res["probes"], res["neighbours"], res["pairs"], res["correction_clap"]
    sp = pa["store_probe_on_pairs"]
    store, both = pr["itunes_vs_deezer, new only"], pr["new_vs_existing, all"]
    dz = pr["new_vs_existing, Deezer only"]
    cat, dzp = nb["whole catalog"], nb["Deezer albums only"]
    it_c = cat["clap"]["neighbours_from_itunes"]
    it_e = cat["effnet"]["neighbours_from_itunes"]
    cs = pa["cosines"]["cross_store"]
    L = ["# Why CLAP keeps new and existing albums apart: the store the preview came from", "",
         f"Generated {res['generated']} by `source_effect.py`. {res['albums']:,} catalog albums with a Deezer or iTunes preview "
         f"in both models ({res['left_out']['other_source']} albums on full-length windows left out).", "",
         "**Probes on RYM-catalog proxies over the clip cache. Nobody listened, no audio was opened, no model was run.** "
         "A = the music differs; B = where the audio came from; C = which clips were chosen.", "",
         "## Verdict", "",
         "**B, strongly. CLAP's vectors carry the store the preview came from, and its lists split the catalog into a "
         "Deezer part and an iTunes part. The new/existing gap is that split seen through the fact that the existing "
         "albums are almost all Deezer and the new ones half iTunes. A is real but small and the same for both models. "
         "C is ruled out as far as the cache can tell.**", "",
         f"- A linear probe tells an iTunes-sourced album from a Deezer-sourced one with AUC {_auc(store['clap'])} on CLAP "
         f"(new albums only, n {store['clap']['n_pos']:,} / {store['clap']['n_neg']:,}) and {_auc(store['effnet'])} on EffNet. "
         f"Year, rank and genre alone give {_auc(store['with_metadata']['metadata_only_boosting'])}. On a sample matched on "
         f"genre and decade CLAP still gives {_auc(store['matched_genre_decade']['clap'])}, EffNet "
         f"{_auc(store['matched_genre_decade']['effnet'])}. No difference in the music that RYM's labels describe is that separable.",
         f"- The same recordings show it directly. {sp['clap']['album_pairs']} albums are in the cache from both stores "
         f"({sp['clap']['track_pairs']} tracks at the same position). A store probe trained on the other albums scores the "
         f"iTunes version as more iTunes than the Deezer version of the same album in {sp['clap']['pairs_where_the_itunes_version_scores_more_itunes']} "
         f"of {sp['clap']['album_pairs']} albums and {sp['clap']['track_pairs_where_the_itunes_clip_scores_more_itunes']} of "
         f"{sp['clap']['track_pairs']} tracks, and the gap between the two versions is {sp['clap']['share_of_the_population_gap']:.0%} "
         "of the gap between iTunes and Deezer albums at large. The whole store difference is reproduced by changing the store and "
         f"keeping the recording. CLAP's cosine between the two stores' clips of one track is {cs['clap']['same_track_across']['mean']:.2f} "
         f"on average; EffNet's is {cs['effnet']['same_track_across']['mean']:.2f} (median {cs['effnet']['same_track_across']['median']:.2f}), "
         "so the two previews are probably much the same stretch of music, and CLAP hears them differently.",
         f"- In the lists: a Deezer seed's ten CLAP neighbours are {_pc(it_c['new Deezer seeds']['share_of_neighbours'])} iTunes albums "
         f"where its genre's make-up would give {_pc(it_c['new Deezer seeds']['same_genre_share'])}; an iTunes seed's are "
         f"{_pc(it_c['new iTunes seeds']['share_of_neighbours'])} against {_pc(it_c['new iTunes seeds']['same_genre_share'])} (new seeds). "
         f"EffNet: {_pc(it_e['new Deezer seeds']['share_of_neighbours'])} and {_pc(it_e['new iTunes seeds']['share_of_neighbours'])}, "
         "close to the make-up.",
         f"- The {res['cells']['existing, iTunes']['albums']} existing albums that happen to be iTunes-sourced behave like new albums: "
         f"{_pc(cat['clap']['neighbours_that_are_new']['existing iTunes seeds']['share_of_neighbours'])} of their CLAP neighbours are new "
         f"(existing Deezer seeds: {_pc(cat['clap']['neighbours_that_are_new']['existing Deezer seeds']['share_of_neighbours'])}). "
         "It follows the store, not whether the album is new.",
         f"- Inside one store the gap goes: among Deezer albums only, new vs existing is AUC {_auc(dz['clap'])} on CLAP and "
         f"{_auc(dz['effnet'])} on EffNet (it was {_auc(both['clap'])} and {_auc(both['effnet'])} over both stores), "
         f"{_auc(dz['matched_genre_decade']['clap'])} and {_auc(dz['matched_genre_decade']['effnet'])} once matched on genre and decade, "
         f"and year, rank and genre alone give {_auc(dz['with_metadata']['metadata_only_boosting'])}. Existing Deezer seeds get "
         f"{_pc(dzp['clap']['neighbours_that_are_new']['existing seeds']['share_of_neighbours'])} new neighbours from CLAP and "
         f"{_pc(dzp['effnet']['neighbours_that_are_new']['existing seeds']['share_of_neighbours'])} from EffNet in a Deezer-only pool. "
         "That remainder is the music (era, genre, rank) and both models see the same amount of it.",
         "- Clips: in all four groups the clips are ranks 0 to 3 of the same plan, in the same positions in the album, about 30 s long.",
         "- Removing one or a few store directions does not repair it (last table): iTunes seeds mix again, Deezer seeds "
         "still get few iTunes neighbours. The store shows in more than a shift.", "",
         "What it is in the audio (codec, bandwidth, loudness, where the excerpt starts) cannot be told from vectors. The likely "
         "reading, not measured here: Deezer previews are low-bitrate MP3 and Apple's are AAC; CLAP listens at 48 kHz and hears "
         "the top of the spectrum that the encoders treat differently, EffNet listens at 16 kHz and cannot.", "",
         "## Albums", ""]
    L += _t(["Group", "Albums", "With genre, year, rank", "Median year", "Median rank", "2010 or later", "How the listing was found", "CLAP clips: 4 / fewer"],
            [[g, f"{c['albums']:,}", f"{c['with_genre_year_rank']:,}", f"{c['median_year']:.0f}", "–" if c["median_rank"] is None else f"{c['median_rank']:.0f}",
              _pc(c["share_2010_or_later"]), ", ".join(f"{k} {v:,}" for k, v in c["matched_by"].items()),
              f"{c['clap_clips'].get('4', 0):,} / {sum(v for k, v in c['clap_clips'].items() if k != '4'):,}"] for g, c in res["cells"].items()])
    L += ["A new album's store follows from the links RYM lists: Deezer's link first, Apple's when there is none. So the store is "
          "not random with respect to the music, which is why the matched samples and the same-album pairs matter.", "",
          "## 1. Probes", "",
          f"Logistic regression on the album's unit vector (CLAP 512 numbers, EffNet 1,280), standardised, C = {res['probe']['C']} fixed, "
          "five folds grouped by artist. AUC of the pooled out-of-fold scores; the sd over the five folds is 0.001 to 0.04 (JSON). "
          "n is positives / negatives; the positive class is named first.", ""]
    rows = []
    for name, e in pr.items():
        w, m = e["with_metadata"], e["matched_genre_decade"]
        rows.append([name, f"{e['clap']['n_pos']:,} / {e['clap']['n_neg']:,}", _auc(e["clap"]), _auc(e["effnet"]),
                     _auc(w["metadata_only_boosting"]), _auc(w["clap"]["metadata_regressed_out"]), _auc(w["effnet"]["metadata_regressed_out"]),
                     f"{m['n']:,}", _auc(m["clap"]), _auc(m["effnet"])])
    L += _t(["Task", "n", "CLAP", "EffNet", "Year + rank + genre only", "CLAP, those regressed out", "EffNet, those regressed out",
             "Matched genre x decade: n", "CLAP", "EffNet"], rows)
    L += ["`Year + rank + genre only`: gradient boosting on the three, same folds, albums that have all three. `regressed out`: year, "
          "year squared, log rank, decade and genre one-hots removed from every vector dimension by a ridge fit on the training fold. "
          "`Matched`: in each first-genre x decade cell, as many albums of one class as of the other (random draw, seed 0). A matched "
          "sample pushes a cross-validated probe a little below 0.5 when there is nothing to find (the training fold's cells are "
          "unbalanced the other way), so 0.39 to 0.48 there reads as no signal; the iTunes-only matched sample is small.", "",
          "## 2. Metadata, and release year", ""]
    w = both["with_metadata"]
    L += [f"New vs existing from metadata alone (n {w['n']:,}): year + rank + genre {_auc(w['metadata_only_boosting'])} (boosting), "
          f"{_auc(w['metadata_only_logistic'])} (logistic); rank alone {_auc(w['rank_only_boosting'])}; year alone {_auc(w['year_only_boosting'])}. "
          f"So an AUC near 0.8 for new vs existing is what era, genre and chart rank give without any audio. CLAP beside the metadata: "
          f"{_auc(w['clap']['metadata_beside_vectors'])}; EffNet beside it: {_auc(w['effnet']['metadata_beside_vectors'])}. After regressing "
          f"the metadata out, CLAP keeps {_auc(w['clap']['metadata_regressed_out'])} over both stores and "
          f"{_auc(dz['with_metadata']['clap']['metadata_regressed_out'])} inside Deezer; EffNet {_auc(w['effnet']['metadata_regressed_out'])} "
          f"and {_auc(dz['with_metadata']['effnet']['metadata_regressed_out'])}. What CLAP keeps over both stores is the store.", "",
          "Release year from the vectors (ridge, same folds):", ""]
    L += _t(["Albums", "n", "CLAP R2", "CLAP mean abs. error (years)", "EffNet R2", "EffNet mean abs. error (years)"],
            [[k, f"{v['n']:,}", f"{v['clap']['r2']:.3f}", f"{v['clap']['mae_years']:.1f}", f"{v['effnet']['r2']:.3f}", f"{v['effnet']['mae_years']:.1f}"]
             for k, v in res["year"].items()])
    L += ["CLAP does not read the year better than EffNet; it reads it slightly worse. CLAP's larger new/existing gap is not era.", "",
          "## 3. Neighbours by store", "",
          "Top 10 by a PCA(64) block of the unit vectors fitted on the pool (the site's block up to a scale factor). `Same genre` is the "
          "share among the pool's other albums with the seed's first primary genre; `same genre x decade` adds the decade. Means over "
          "the seeds for which the comparison is defined.", ""]
    for what, title in (("neighbours_from_itunes", "Share of neighbours that are iTunes-sourced"), ("neighbours_that_are_new", "Share of neighbours that are new albums")):
        rows = []
        for pool, e in nb.items():
            for m in MODEL_NAMES:
                for seeds, x in e[m].get(what, {}).items():
                    if what == "neighbours_that_are_new" and seeds in ("new seeds", "existing seeds") and pool == "Deezer albums only":
                        continue
                    rows.append([pool, m, seeds, f"{x['seeds']:,}", _pc(x["share_of_neighbours"]), _pc(x["same_genre_share"]),
                                 _pc(x["same_genre_decade_share"])])
        L += [f"**{title}**", "", *_t(["Pool", "Model", "Seeds", "n", "Neighbours", "Same genre", "Same genre x decade"], rows)]
    L += ["## 4. The same recording from both stores", "",
          f"{pa['groups_examined']} albums were in the cache under two keys or two listings (a duplicate catalog row, matched on its own "
          f"before it was dropped; `onepass.before-rekey.sqlite`). {pa['listing_pairs'].get('cross_store', 0)} of them have one Deezer and "
          f"one iTunes listing; {pa['listing_pairs_with_the_same_track_positions'].get('cross_store', 0)} of those have clips at the same "
          "track positions in both (so the same tracks; listings with another track count are left out, and so are one-clip albums). "
          "Titles could not be compared: the earlier run's listings are not in the cache. Cosines are between clip vectors.", ""]
    rows = []
    for kind, label in (("cross_store", "Deezer vs iTunes"), ("same_store_other_listing", "same store, another listing"),
                        ("same_listing_other_storefront", "same iTunes album id, another storefront")):
        for m in MODEL_NAMES:
            c = pa["cosines"][kind][m]
            f = lambda k: "–" if not c.get(k, {}).get("n") else f"{c[k]['mean']:.3f} (median {c[k]['median']:.3f}, n {c[k]['n']})"  # noqa: E731
            rows.append([label, str(pa["listing_pairs_with_the_same_track_positions"].get(kind, 0)), m, f("same_track_across"),
                         f("other_track_across"), f("other_track_within_listing")])
    L += _t(["Pair of listings", "Albums", "Model", "Same track, across the two", "Other track, across the two", "Other track, within one listing"], rows)
    L += ["For EffNet the same track from the other store is close to identical (0.96, median 0.99) and another track of "
          "the album is equally far whichever store it comes from. For CLAP the same track from the other store is at 0.77, not far "
          "above another track from the same store (0.69), and another track from the other store is much further (0.53 against 0.69). "
          "The two same-store rows are too few to read (2 albums, and those listings are other editions).", "",
          "A store probe (iTunes vs Deezer) trained on the new albums that are not in these pairs, applied to the two versions of each album:", ""]
    rows = []
    for m in MODEL_NAMES:
        x = sp[m]
        md = x["mean_difference_direction"]
        rows.append([m, f"{x['pairs_where_the_itunes_version_scores_more_itunes']} of {x['album_pairs']}",
                     f"{x['track_pairs_where_the_itunes_clip_scores_more_itunes']} of {x['track_pairs']}",
                     f"{x['mean_score_gap_between_the_two_versions']:.2f} (t {x['t']})", f"{x['mean_score_gap_between_itunes_and_deezer_albums_out_of_fold']:.2f}",
                     f"{x['share_of_the_population_gap']:.0%}", f"{md['share_of_the_distance']:.0%} (t {md['t']})", f"{md['cosine_of_mean_pair_difference_with_it']:.2f}",
                     f"{md['cosine_between_the_mean_differences_of_two_halves_of_the_pairs']:.2f}"])
    L += _t(["Model", "Albums where the iTunes version scores more iTunes", "Tracks", "Mean score gap between the two versions",
             "Mean gap between iTunes and Deezer albums (out of fold)", "Share of that gap", "Pair difference along the line between the store means, share of their distance",
             "Cosine of the mean pair difference with that line", "Cosine between the mean differences of two halves of the pairs"], rows)
    x = sp["clap"]
    L += [f"In {x['pairs_where_the_itunes_version_is_the_earlier_runs']} of the {x['album_pairs']} pairs the iTunes version is the one the earlier run "
          f"embedded and the Deezer one the one-pass run's; the iTunes version scores more iTunes in {x['of_those_the_itunes_version_scores_more_itunes']} "
          "of them. With the 80 tracks embedded by both runs at cosine 1.0 (`sonic_measures.md`), the run is not what the probe reads. "
          "EffNet's probe also leans the right way on most pairs, by about half of its (small) population gap: it has a faint trace of "
          "the store too, which does not show in its lists.", "",
          "## 5. Clips", ""]
    L += _t(["Group", "Albums", "Clips", "Median clip (s)", "Most common lengths (s: clips)", "Under 25 s", "Median track (s)",
             "Albums on ranks 0 to 3", "In the planned order", "Mean position in the album (0 first, 1 last)", "Embedded by"],
            [[g, f"{c['albums']:,}", f"{c['clips']:,}", f"{c['clip_seconds']['median']:.2f}",
              ", ".join(f"{a:.2f}: {b:,}" for a, b in c["most_common_clip_seconds"]), _pc(c["clip_seconds"]["under_25_s"]),
              "–" if c["track_seconds_median"] is None else f"{c['track_seconds_median']:.0f}", _pc(c["albums_whose_clips_are_ranks_0_to_3"]),
              _pc(c["of_those_in_the_planned_order"]), "–" if c["mean_relative_position_in_album"] is None else f"{c['mean_relative_position_in_album']:.2f}",
              ", ".join(c["embedded_by"])] for g, c in res["clips"].items()])
    L += ["The four groups use the same clips: the first four of the same bit-reversal plan (the existing albums' four CLAP clips are the "
          "first four of their eight), at the same places in the album, all about 30 s. The only thing the cache shows that differs by "
          "store is the decoded length (Deezer 29.99 s, iTunes 29.93 or 29.98 s), which says the files are encoded differently and nothing "
          "more. The cache does not hold where in the track a preview starts, its bitrate, its bandwidth or its loudness.", "",
          "## 6. What a simple correction would do (CLAP; measured, not adopted)", "",
          "The correction is applied to the 512-number unit vectors, then the block is refitted and the lists recomputed over the whole "
          "catalog. Directions are fitted on the albums they are removed from. `Overlap` is the mean number of the ten neighbours kept "
          "from the uncorrected list. Mean N10: how many lists an album of that store is in (10 on average).", ""]
    rows = []
    for name, v in co.items():
        nn, ni = v["neighbours_new"], v["neighbours_itunes"]
        rows.append([name, f"{v['overlap_at_10_with_uncorrected']:.2f}", _pc(ni["new Deezer seeds"]["share_of_neighbours"]),
                     _pc(ni["new iTunes seeds"]["share_of_neighbours"]), _pc(nn["new seeds"]["share_of_neighbours"]),
                     _pc(nn["existing seeds"]["share_of_neighbours"]), f"{v['mean_n10']['Deezer albums']:.1f} / {v['mean_n10']['iTunes albums']:.1f}",
                     f"{v['genre_primary']:.3f}", f"{v['genre_family']:.3f}", f"{v['desc_jaccard']:.3f}", f"{v['probe_new_vs_existing']:.3f}"])
    base = co["none (as it is)"]
    L += _t(["Correction", "Overlap@10", "iTunes neighbours, new Deezer seeds", "iTunes neighbours, new iTunes seeds", "New neighbours, new seeds",
             "New neighbours, existing seeds", "Mean N10 Deezer / iTunes", "genre_primary", "genre_family", "desc_jaccard", "New vs existing AUC"], rows)
    L += [f"Same-genre make-up for comparison: iTunes neighbours {_pc(base['neighbours_itunes']['new Deezer seeds']['same_genre_share'])} for new Deezer seeds and "
          f"{_pc(base['neighbours_itunes']['new iTunes seeds']['same_genre_share'])} for new iTunes seeds; new neighbours "
          f"{_pc(base['neighbours_new']['new seeds']['same_genre_share'])} for new seeds and {_pc(base['neighbours_new']['existing seeds']['same_genre_share'])} "
          "for existing seeds. The store-probe AUC after each correction is in the JSON; it is not a fair score for a correction that "
          "equalises the two means on all albums (a cross-validated linear probe then reads below 0.5).", "",
          "None of them brings the lists to the make-up. Taking out the line between the store means changes about a quarter of every "
          "list and brings iTunes seeds near their make-up, but Deezer seeds still get a quarter of the iTunes neighbours they should, "
          "and iTunes albums are then recommended much less often than Deezer ones (mean N10 about 6 against 12): what is left of "
          "the store is not a shift. Mapping the iTunes albums onto Deezer's mean and covariance goes furthest (Deezer seeds 18.7% "
          "against 29.1%) and changes a third of every list. On the RYM proxies no correction costs anything (genre and descriptor "
          "agreement stay or rise slightly, where removing an ordinary strong direction lowers them), which fits a nuisance direction; "
          "it says nothing about how the lists sound. For existing seeds the share of new neighbours hardly moves with the "
          "one-direction corrections (39.5% to 40.4%), because existing seeds are Deezer seeds and those are the ones not repaired.", "",
          "## What could not be tested", "",
          "- **What in the audio it is.** Codec, bitrate, bandwidth, loudness or where the preview starts in the track: vectors cannot "
          "separate them. It needs audio: embed one file as it is, re-encoded the other way, and low-passed.",
          "- **A clip-level probe inside one album** is impossible: no album is used from both stores, and the 16 pairs are all there is.",
          "- **The pairs are few and not typical**: 16 albums, 63 tracks, duplicate catalog rows (several classical or live). Track "
          "identity rests on equal track positions, not on titles. The two stores may also carry different masters of some of them.",
          "- **A correction that works.** The ones tried are linear, fitted on these albums, and judged on RYM proxies. Whether "
          "lists sound right after any of them was not checked.",
          "- No confidence intervals beyond the fold spread; the genre-matched samples are one random draw.", "",
          "## What would change this reading", "",
          "- If the previews of, say, 100 albums that both stores carry were fetched from both and embedded, and CLAP then mixed the two "
          "versions freely (a store probe near 0.5 on them, same-track cosine near EffNet's), the 16 pairs would be a fluke and the "
          "store split would be the music after all.",
          "- If bringing both stores' clips to one encoding or bandwidth before CLAP left the iTunes and Deezer albums as separable as "
          "now, the cause would not be the encoding (it could still be the excerpt).",
          "- If a listener found the iTunes-sourced albums to be a different kind of record from the Deezer-sourced ones of the same genre "
          "and decade, part of the split would be A. RYM's year, rank and genre do not show such a difference (store from metadata: "
          f"{_auc(store['with_metadata']['metadata_only_boosting'])}).", ""]
    return "\n".join(L)


# ------------------------------------------------------------------------------------------- running

def cells(d: Data) -> dict:
    with open(AUDIO / "matches.csv", newline="", encoding="utf-8") as f:
        by = {r["key"]: r["matched_by"] or "(earlier run)" for r in csv.DictReader(f)}
    out = {}
    for name, mask in {"existing, Deezer": ~d.new & ~d.itunes, "existing, iTunes": ~d.new & d.itunes,
                       "new, Deezer": d.new & ~d.itunes, "new, iTunes": d.new & d.itunes}.items():
        yr, rk = d.year[mask], d.rank[mask]
        out[name] = {"albums": int(mask.sum()), "with_genre_year_rank": int((mask & d.has_meta).sum()),
                     "median_year": float(np.nanmedian(yr)), "median_rank": float(np.nanmedian(rk)) if (~np.isnan(rk)).any() else None,
                     "share_2010_or_later": round(float((yr >= 2010).mean()), 3), "share_before_1970": round(float((yr < 1970).mean()), 3),
                     "storefronts": dict(Counter(d.source[mask].tolist()).most_common(6)),
                     "matched_by": dict(Counter(by.get(k, "?") for k in d.keys[mask].tolist())),
                     "top_genres": dict(Counter(g for g in d.genre[mask].tolist() if g).most_common(8)),
                     "clap_clips": {str(k): int(v) for k, v in sorted(Counter(d.n_clips["clap"][mask].tolist()).items())}}
    return out


def run(refresh: bool = False) -> dict:
    warnings.filterwarnings("ignore", category=FutureWarning)
    d = Data(refresh)
    print(f"{len(d)} albums", flush=True)
    res = {"generated": datetime.date.today().isoformat(),
           "note": "Probes on RYM-catalog proxies over the clip cache; descriptive, nobody listened, no audio opened.",
           "albums": len(d), "left_out": d.left_out, "probe": {"C": C_PROBE, "folds": FOLDS, "grouped_by": "artist"},
           "cells": cells(d)}
    res["clips"] = clip_section(d)
    pairs = pair_section(d)
    shift = pairs.pop("_pair_shift", {})
    res["pairs"] = pairs
    print("  pairs done", flush=True)
    res["probes"] = probe_tasks(d)
    res["year"] = year_probe(d)
    res["neighbours"] = neighbour_section(d)
    res["correction_clap"] = correction_section(d, shift.get("clap"))
    return res


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--refresh", action="store_true", help="Rebuild the album means from the clip cache.")
    p.add_argument("--out", type=Path, default=RESULTS)
    p.add_argument("--markdown-only", action="store_true", help="Rewrite the .md from the .json already in --out.")
    p.add_argument("--model", choices=("clap", "clap_mp3"), default="clap",
                   help="The cache model read as CLAP (clap_mp3: the stereo MP3 round trip variant).")
    args = p.parse_args(argv)
    global CLAP_MODEL
    CLAP_MODEL = args.model
    name = "source_effect" + ("" if args.model == "clap" else f".{args.model}")

    def text(res: dict) -> str:
        md = markdown(res)
        return md if args.model == "clap" else md.replace(
            "\n", f"\n\n**Cache model read as CLAP here: `{args.model}`. Only the albums that have it are in the tables.**\n", 1)

    if args.markdown_only:
        res = json.loads((args.out / f"{name}.json").read_text(encoding="utf-8"))
        (args.out / f"{name}.md").write_text(text(res), encoding="utf-8")
        return 0
    res = run(args.refresh)
    res["clap_model"] = args.model
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / f"{name}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (args.out / f"{name}.md").write_text(text(res), encoding="utf-8")
    print(f"wrote {args.out / f'{name}.json'} and {args.out / f'{name}.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
