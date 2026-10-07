"""The `clap_mp3` variant (rmr_audio.mp3trip: a 128 kbit/s stereo MP3 round trip before CLAP for every clip
that is not from Deezer) checked on the catalog: does it mix iTunes-sourced albums into Deezer lists, better
than the pair-fitted map of pair_map_check.py, and what does it do for YouTube audio?

    cd experiments/audio_10k
    # 1. which albums (build venv; reads only). Fixed seed.
    PYTHONDONTWRITEBYTECODE=1 <build venv python> mp3_variant_check.py pick
        -> cache/mp3_variant_keys.txt (250 iTunes-sourced new albums), cache/mp3_variant_youtube_keys.txt (20), cache/mp3_variant_pick.json
    # 2. real-model sanity (audio venv; starts the pipeline's own CLAP child; about 15 downloads)
    PYTHONDONTWRITEBYTECODE=1 nice -n 19 <audio venv python> mp3_variant_check.py sanity --torch-python <torch python>
        -> cache/mp3_variant_sanity.json
    # 3. the pipeline's own commands compute the variant (see results/mp3_variant_check.md, "How this was run")
    # 4. the numbers (build venv; stored vectors only)
    PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> mp3_variant_check.py report [--log RUN.log ...]
        -> results/mp3_variant_check.json, results/mp3_variant_check.md
    ... mp3_variant_check.py report --md      # the markdown again from the JSON

`sanity` writes to the one-pass cache only through `rmr_audio.onepass copy` (the Deezer rows of three albums);
its iTunes clips are embedded in memory and compared with the experiment's vectors, not stored. `pick` and
`report` open everything read-only.

The catalog comparison (report). Pool: every Deezer-sourced album of the catalog (their clap_mp3 vector is
their clap vector) plus the picked iTunes-sourced albums, whose vector is taken three ways:
  baseline   the clap clips as stored
  pair map   the stored clap clips through pair_map_check's headline map (`residual, lambda 1`, fitted on all
             349 pairs), no audio
  clap_mp3   the clips fetched again and embedded after the round trip (the pipeline's `onepass run --models clap_mp3`)
Album vector: the float64 mean of the album's first four ok clips in rank order, direction only, as
rmr_audio.modelstore. Block: PCA(64) of the centred unit vectors of the pool, refitted per row (source_effect.block).
Lists: ten nearest by the block (sonic.nearest). Measures: source_effect.mixing (share of a seed group's
neighbours that are iTunes-sourced, and what the pool's make-up by first genre, and by genre x decade, would
give: the target is computed for THIS pool) and source_effect.probe (grouped five-fold logistic regression,
C 0.01). EffNet over the same albums is the row that does not hear the store. Proxies on RYM labels and on
vectors: nobody listened.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CACHE = HERE / "cache"
RESULTS = HERE / "results"
sys.path.insert(0, str(REPO / "data-pipeline"))
sys.path.append(str(REPO / "experiments" / "preview_features"))

PAIR_DB = CACHE / "store_effect_fix.sqlite"
ONEPASS_DB = REPO / "data-pipeline" / ".cache" / "audio" / "onepass.sqlite"
KEYS, YT_KEYS = CACHE / "mp3_variant_keys.txt", CACHE / "mp3_variant_youtube_keys.txt"
PICK, SANITY = CACHE / "mp3_variant_pick.json", CACHE / "mp3_variant_sanity.json"
OUT_JSON, OUT_MD = RESULTS / "mp3_variant_check.json", RESULTS / "mp3_variant_check.md"
SEED = 0
N_ALBUMS, N_YOUTUBE = 250, 20
BUSY = "onepass|fulllength|clap_catalog|store_effect"


def r(x, n=4):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def unit(X):
    X = np.asarray(X, dtype=np.float64)
    return X / np.maximum(np.linalg.norm(X, axis=-1, keepdims=True), 1e-30)


def spread(rows: list[tuple[float, str]], n: int, rng: np.random.Generator) -> list[str]:
    """n keys, one drawn from each of n equal slices of the rank order (as rmr_audio.fulllength.stratified)."""
    ranked = [k for _, k in sorted(rows)]
    if n >= len(ranked):
        return ranked
    return [ranked[int(rng.integers(i * len(ranked) // n, (i + 1) * len(ranked) // n))] for i in range(n)]


# ----------------------------------------------------------------------------------------------- pick

def pick() -> int:
    import pair_map_check as pmc
    from genres import family

    cat = pmc.Catalog()
    d = pmc.Pool(cat, np.arange(len(cat.keys)))
    rng = np.random.default_rng(SEED)
    rank = np.array([float(row["rank"]) if row["rank"].isdigit() else 1e9 for row in d.rows])
    fam = np.array([family(g[0]) if g else "?" for g in d.genres])
    new_it = np.flatnonzero(d.new & d.itunes)
    keys = spread([(rank[i], d.keys[i]) for i in new_it], N_ALBUMS, rng)
    yt = np.flatnonzero(d.youtube)
    yt_keys = spread([(rank[i], d.keys[i]) for i in yt], N_YOUTUBE, rng)
    at = {k: i for i, k in enumerate(d.keys.tolist())}
    chosen = np.array([at[k] for k in keys])
    info = {"seed": SEED, "drawn_from": "the catalog's new albums whose CLAP mean is from iTunes clips, one from each of "
                                        f"{N_ALBUMS} equal slices of their rank order",
            "population": int(len(new_it)), "picked": len(keys),
            "rank_quartiles_population": [r(x, 0) for x in np.quantile(rank[new_it], [0.25, 0.5, 0.75])],
            "rank_quartiles_picked": [r(x, 0) for x in np.quantile(rank[chosen], [0.25, 0.5, 0.75])],
            "genre_family_population": dict(Counter(fam[new_it].tolist()).most_common()),
            "genre_family_picked": dict(Counter(fam[chosen].tolist()).most_common()),
            "decade_picked": {str(k): v for k, v in sorted(Counter(d.decade[chosen].tolist()).items())},
            "storefront_picked": dict(Counter(d.source[chosen].tolist()).most_common()),
            "clips_picked": {str(k): v for k, v in sorted(Counter(cat.n_clips[chosen].tolist()).items())},
            "youtube_population": int(len(yt)), "youtube_picked": len(yt_keys)}
    CACHE.mkdir(exist_ok=True)
    KEYS.write_text("\n".join(keys) + "\n")
    YT_KEYS.write_text("\n".join(yt_keys) + "\n")
    PICK.write_text(json.dumps(info, indent=1) + "\n")
    print(f"{len(keys)} iTunes-sourced new albums -> {KEYS}\n{len(yt_keys)} YouTube albums -> {YT_KEYS}\n{json.dumps(info)[:600]}")
    return 0


# --------------------------------------------------------------------------------------------- sanity

def sanity(args) -> int:
    """(a) the Deezer copy is the clap row to the byte; (b) the pipeline's clap_mp3 of an iTunes preview is the
    experiment's `mp3st` vector of the same track (and its clap is the experiment's `base`)."""
    from rmr_audio import onepass
    from rmr_audio.onepass_cache import MODELS, read_only

    busy = [x for x in subprocess.run(["pgrep", "-fl", BUSY], capture_output=True, text=True).stdout.splitlines()
            if "pgrep" not in x and "mp3_variant_check" not in x]
    if busy:
        print("another model job is running; not starting:\n" + "\n".join(busy), file=sys.stderr)
        return 1
    rng = np.random.default_rng(SEED)
    out = {"generated": datetime.date.today().isoformat()}

    # (a) Deezer: copy three albums' rows inside the cache, compare every byte
    con = read_only(ONEPASS_DB)
    albums = [k for (k,) in con.execute("SELECT key FROM embeddings WHERE model = 'clap' AND source = 'deezer' AND status = 'ok' "
                                        "GROUP BY key, album_id HAVING COUNT(*) = 4 ORDER BY key")]
    con.close()
    keys = sorted(rng.choice(albums, 3, replace=False).tolist())
    code = onepass.copy_variant(ONEPASS_DB, "clap_mp3", keys)
    con = read_only(ONEPASS_DB)
    rows = con.execute("SELECT a.status = b.status, a.emb = b.emb, a.clip_s IS b.clip_s, b.origin, LENGTH(b.emb) FROM embeddings a "
                       "JOIN embeddings b USING (key, source, album_id, track_id) WHERE a.model = 'clap' AND b.model = 'clap_mp3' "
                       "AND a.source = 'deezer' AND a.key IN (%s)" % ", ".join("?" * len(keys)), keys).fetchall()
    con.close()
    out["deezer_copy"] = {"albums": keys, "exit": code, "clips": len(rows), "same_status": sum(x[0] for x in rows),
                          "same_embedding_bytes": sum(x[1] for x in rows), "same_seconds": sum(x[2] for x in rows),
                          "origin": dict(Counter(x[3] for x in rows)), "embedding_bytes": sorted({x[4] for x in rows})}
    print(json.dumps(out["deezer_copy"]))

    # (b) iTunes: about ten paired tracks of the experiment, fetched now, through the pipeline's CLAP child
    pc = sqlite3.connect(f"file:{PAIR_DB}?mode=ro", uri=True)
    info = {k: json.loads(v) for k, v in pc.execute("SELECT key, info FROM album")}
    units = {(k, u): json.loads(v) for k, u, v in pc.execute("SELECT key, unit, info FROM pair")}
    vec = {(k, u, variant): np.frombuffer(v, "<f4").astype(np.float64) for k, u, variant, v in pc.execute(
        "SELECT key, unit, variant, vec FROM emb WHERE kind = 'clip' AND store = 'itunes' AND variant IN ('base', 'mp3st')")}
    pc.close()
    names = sorted({k for k, _ in units if info.get(k, {}).get("status") == "ok"})
    order = [names[i] for i in rng.permutation(len(names))]
    listing, download, http = onepass.default_network()
    http.throttles["itunes"].interval = max(http.throttles["itunes"].interval, 3.4)  # under 18 calls a minute
    tmp = tempfile.mkdtemp(prefix="rmr-mp3-sanity-")
    embedder = onepass.Embedder(onepass.worker_factories(("clap_mp3",), onepass.DEFAULT_CACHE, tmp, args.torch_python), "own", None, print)
    cos = lambda a, b: float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))  # noqa: E731
    clips = []
    try:
        for key in order:
            if len(clips) >= args.clips:
                break
            al = info[key]
            try:
                tracks = {str(t["track_id"]): t for t in listing(al["itunes_source"], str(al["itunes_id"]))}
            except Exception as e:
                clips.append({"key": key, "error": f"listing: {e}"[:200]})
                continue
            for (k, u), pair in sorted(units.items()):
                if k != key or len([c for c in clips if "cosine_clap_mp3_vs_mp3st" in c]) >= args.clips:
                    continue
                t = tracks.get(str(pair["itunes_track"]))
                if not t or not t.get("preview_url") or (k, u, "mp3st") not in vec:
                    clips.append({"key": k, "unit": u, "error": "the listing has no preview of this track now"})
                    continue
                data = download(t["preview_url"])
                got = embedder.embed(["clap", "clap_mp3"], data=data, suffix=".m4a", source=al["itunes_source"])
                row = {"key": k, "unit": u, "source": al["itunes_source"], "track_id": str(pair["itunes_track"]), "bytes": len(data),
                       "status": {m: g["status"] for m, g in got.items()}}
                if all(g["status"] == "ok" for g in got.values()):
                    mine = {m: np.frombuffer(g["emb"], MODELS[m].dtype).astype(np.float64) for m, g in got.items()}
                    row |= {"cosine_clap_vs_base": r(cos(mine["clap"], vec[(k, u, "base")]), 6),
                            "cosine_clap_mp3_vs_mp3st": r(cos(mine["clap_mp3"], vec[(k, u, "mp3st")]), 6),
                            "max_abs_clap_mp3_vs_mp3st": r(float(np.abs(mine["clap_mp3"] - vec[(k, u, "mp3st")]).max()), 6),
                            "cosine_clap_mp3_vs_its_own_clap": r(cos(mine["clap_mp3"], mine["clap"]), 4),
                            "experiment_cosine_mp3st_vs_base": r(cos(vec[(k, u, "mp3st")], vec[(k, u, "base")]), 4)}
                clips.append(row)
                print(json.dumps(row))
    finally:
        embedder.close()
        shutil.rmtree(tmp, ignore_errors=True)
    good = [c for c in clips if "cosine_clap_mp3_vs_mp3st" in c]
    out["itunes_vs_experiment"] = {
        "clips": len(good), "albums": len({c["key"] for c in good}), "not_compared": [c for c in clips if "error" in c],
        "cosine_clap_mp3_vs_mp3st": {"min": min((c["cosine_clap_mp3_vs_mp3st"] for c in good), default=None),
                                     "median": r(float(np.median([c["cosine_clap_mp3_vs_mp3st"] for c in good])), 6) if good else None},
        "cosine_clap_vs_base": {"min": min((c["cosine_clap_vs_base"] for c in good), default=None),
                                "median": r(float(np.median([c["cosine_clap_vs_base"] for c in good])), 6) if good else None},
        "rows": good}
    CACHE.mkdir(exist_ok=True)
    SANITY.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {SANITY}")
    return 0


# --------------------------------------------------------------------------------------------- report

def variant_means(cat, keys: list[str]) -> dict[str, dict]:
    """key -> {vec, n, same_clips} from the cache's clap_mp3 rows of the album's listing (the first four ok in
    rank order; a window listing: its n_windows), and whether those are the clips the clap mean is over."""
    from rmr_audio.modelstore import CLIPS
    from rmr_audio.onepass_cache import WINDOW_SOURCES, OnePassCache

    at = {k: i for i, k in enumerate(cat.keys.tolist())}
    cache = OnePassCache(ONEPASS_DB, readonly=True)
    out = {}
    try:
        listings = cache.listings()
        for k in keys:
            i = at.get(k)
            if i is None:
                continue
            source, album_id = str(cat.source[i]), str(cat.album_id[i])
            # the cache key may be an older one that keys.csv leads here from: find the listing's own key
            own = [x[0] for x in cache.con.execute("SELECT DISTINCT key FROM embeddings WHERE source = ? AND album_id = ? AND model = 'clap_mp3'",
                                                   (source, album_id))]
            ck = k if k in own or not own else own[0]
            n = (listings.get((ck, source, album_id), {}).get("n_windows") or None) if source in WINDOW_SOURCES else CLIPS
            vec, used = cache.mean("clap_mp3", ck, source, album_id, n)
            if vec is None:
                continue
            rows = cache.con.execute(
                "SELECT e.track_id FROM embeddings e JOIN clips c USING (key, source, album_id, track_id) WHERE e.model = 'clap_mp3' "
                "AND e.key = ? AND e.source = ? AND e.album_id = ? AND e.status = 'ok' ORDER BY c.prio IS NULL, c.prio, c.track_idx",
                (ck, source, album_id)).fetchall()
            mine = [t for (t,) in rows][:n] if n else [t for (t,) in rows]
            theirs = cat.clip_track[cat.clip_album == i].tolist()
            out[k] = {"vec": vec, "n": used, "same_clips": sorted(mine) == sorted(theirs)}
    finally:
        cache.close()
    return out


def clip_rows(model: str, listings: list[tuple[str, str, str]], limit: int | None) -> tuple[np.ndarray, np.ndarray]:
    """(unit clip vectors, index of the listing each belongs to) for the listings' first `limit` ok clips."""
    from rmr_audio.onepass_cache import read_only

    con = read_only(ONEPASS_DB)
    X, g = [], []
    try:
        for j, (key, source, album_id) in enumerate(listings):
            rows = con.execute(
                "SELECT e.emb FROM embeddings e JOIN clips c USING (key, source, album_id, track_id) WHERE e.model = ? AND e.key = ? "
                "AND e.source = ? AND e.album_id = ? AND e.status = 'ok' ORDER BY c.prio IS NULL, c.prio, c.track_idx",
                (model, key, source, album_id)).fetchall()
            for (emb,) in rows[:limit] if limit else rows:
                X.append(np.frombuffer(emb, "<f4").astype(np.float64)), g.append(j)
    finally:
        con.close()
    return unit(np.stack(X)) if X else np.empty((0, 512)), np.array(g, dtype=np.int64)


def boot(v: np.ndarray, rng: np.random.Generator, n: int = 2000) -> list[float]:
    m = [v[rng.integers(0, len(v), len(v))].mean() for _ in range(n)]
    return [r(np.quantile(m, 0.025)), r(np.quantile(m, 0.975))]


def pool_rows(d, versions: dict[str, np.ndarray], flag: np.ndarray, groups: dict[str, np.ndarray], labels, se, sonic, measure,
              probes: bool) -> dict:
    """Per version (unit album vectors of the pool `d`): mixing against the pool's make-up, hubness of the
    flagged albums, RYM proxies for the flagged seeds, probes."""
    out, lists_of = {}, {}
    idx = np.arange(len(d))
    rng = np.random.default_rng(SEED)
    sub = d.new & d.has_meta
    ys = flag[sub].astype(int)
    take = se.matched(d, sub, ys) if probes else None
    for name, U in versions.items():
        B = se.block(U)
        lists = sonic.nearest(B)
        lists_of[name] = lists
        got = flag[lists].mean(axis=1)
        mix = se.mixing(d, idx, lists, flag, groups)
        per = labels.per_seed(lists)
        _, n10 = measure.hubness(lists)
        row = {"neighbours_flagged": {g: {k: v[k] for k in ("seeds", "seeds_with_genre", "share_of_neighbours", "same_genre_share",
                                                             "seeds_with_genre_decade_cell", "same_genre_decade_share")} |
                                      {"ci95": boot(got[m], rng) if m.sum() <= 2000 else None}
                                      for (g, v), m in ((kv, groups[kv[0]]) for kv in mix.items())},
               "n10_flagged": {"albums": int(flag.sum()), "mean": r(float(n10[flag].mean()), 2), "median": float(np.median(n10[flag])),
                               "in_no_list": int((n10[flag] == 0).sum()), "max": int(n10[flag].max())},
               "n10_others_mean": r(float(n10[~flag].mean()), 2),
               "flagged_seeds": {m: measure.summary(per[m], flag)["mean"] for m in ("genre_primary", "genre_family", "desc_jaccard")},
               "other_seeds": {m: measure.summary(per[m], ~flag)["mean"] for m in ("genre_primary", "genre_family", "desc_jaccard")}}
        if probes:
            row["probes"] = {"flagged vs new Deezer albums matched 1:1 on first genre x decade": se.probe(U[sub][take], ys[take], d.artist[sub][take]),
                             "flagged vs every new Deezer album": se.probe(U[d.new], flag[d.new].astype(int), d.artist[d.new]),
                             "matched, on the 64-number block": se.probe(B[sub][take].astype(np.float64), ys[take], d.artist[sub][take], C=1.0)}
        out[name] = row
        print(f"  {name} done", flush=True)
    return out, lists_of


def overlap(a: np.ndarray, b: np.ndarray, mask: np.ndarray) -> float:
    return r(float(np.mean([len(set(a[i].tolist()) & set(b[i].tolist())) for i in np.flatnonzero(mask).tolist()])), 2)


def parse_logs(paths: list[Path]) -> dict:
    out = {"logs": [p.name for p in paths], "check": {}, "lines": []}
    checks: dict[str, list[float]] = {}
    for p in paths:
        if not p.exists():
            continue
        for line in p.read_text(errors="replace").splitlines():
            if line.startswith("check\t"):
                _, key, source, _, c = line.split("\t")
                checks.setdefault(source.split(":")[0], []).append(float(c))
            elif re.match(r"(following |baseline check|finished|stopped|peak memory|model seconds|\d+ clips per album|\d+ new albums|"
                          r"clap_mp3: \d+ Deezer)", line) or "topped_up" in line or "\tfailed\t" in line:
                out["lines"].append(line[:400])
    for store, v in checks.items():
        v = np.array(v)
        out["check"][store] = {"clips": len(v), "median": r(np.median(v), 5), "p05": r(np.percentile(v, 5), 5), "p01": r(np.percentile(v, 1), 5),
                               "min": r(v.min(), 5), "under_0.999": int((v < 0.999).sum()), "under_0.99": int((v < 0.99).sum()),
                               "under_0.9": int((v < 0.9).sum())}
    return out


def report(logs: list[Path]) -> dict:
    import warnings

    import measure
    import pair_map_check as pmc
    import sonic
    import source_effect as se
    from rmr_audio.modelstore import CLIPS, album_means
    from rmr_audio.onepass_cache import OnePassCache, read_only

    warnings.filterwarnings("ignore", category=FutureWarning)
    res = {"generated": datetime.date.today().isoformat(),
           "note": "Stored vectors and RYM-catalog proxies. Nobody listened. The target shares are computed for the pool of each table."}
    cat = pmc.Catalog()
    P = pmc.load_pairs()
    M = pmc.fit_map(P["I"], P["D"], pmc.HEADLINE)
    base, mapped = cat.means(None), cat.means(M)
    at = {k: i for i, k in enumerate(cat.keys.tolist())}
    res["pick"] = json.loads(PICK.read_text()) if PICK.exists() else None
    res["sanity"] = json.loads(SANITY.read_text()) if SANITY.exists() else None
    res["run"] = parse_logs(logs)

    # what the cache holds of the variant
    con = read_only(ONEPASS_DB)
    try:
        res["cache"] = {
            "clap_mp3_rows": {f"{s} / {st} / {o}": n for s, st, o, n in con.execute(
                "SELECT CASE WHEN source LIKE 'itunes%' THEN 'itunes' ELSE source END, status, origin, COUNT(*) FROM embeddings "
                "WHERE model = 'clap_mp3' GROUP BY 1, 2, 3 ORDER BY 1, 2, 3")},
            "clap_rows": {f"{s} / {st}": n for s, st, n in con.execute(
                "SELECT CASE WHEN source LIKE 'itunes%' THEN 'itunes' ELSE source END, status, COUNT(*) FROM embeddings "
                "WHERE model = 'clap' GROUP BY 1, 2 ORDER BY 1, 2")},
            "gone": con.execute("SELECT COUNT(*), COUNT(DISTINCT key) FROM embeddings WHERE model = 'clap_mp3' AND error LIKE 'gone:%'").fetchone(),
            "clap_mp3_ok_without_a_clap_row": con.execute(
                "SELECT COUNT(*) FROM embeddings v WHERE v.model = 'clap_mp3' AND v.status = 'ok' AND NOT EXISTS (SELECT 1 FROM embeddings b "
                "WHERE b.key = v.key AND b.source = v.source AND b.album_id = v.album_id AND b.track_id = v.track_id AND b.model = 'clap' "
                "AND b.status = 'ok')").fetchone()[0]}
    finally:
        con.close()
    pc = sqlite3.connect(f"file:{PAIR_DB}?mode=ro", uri=True)
    try:
        res["channels"] = {"experiment_previews": {f"{s}: {c} channel(s)": n for s, c, n in pc.execute(
            "SELECT store, json_extract(info, '$.n_channels'), COUNT(*) FROM meas WHERE kind = 'clip' GROUP BY 1, 2")},
            "experiment_youtube_files": dict(Counter(str((json.loads(v).get("probe") or {}).get("channels")) for (v,) in pc.execute(
                "SELECT info FROM yt") if json.loads(v).get("status") == "embedded"))}
    finally:
        pc.close()

    # ---------------------------------------------------------------- the catalog: Deezer + the picked iTunes albums
    picked = [k for k in KEYS.read_text().split() if k in at] if KEYS.exists() else []
    var = variant_means(cat, picked)
    have = [k for k in picked if k in var]
    full = [k for k in have if var[k]["same_clips"]]
    res["albums"] = {"picked": len(picked), "with_a_clap_mp3_vector": len(have), "of_them_over_the_same_clips_as_clap": len(full),
                     "left_out": [k for k in picked if k not in var],
                     "other_clips": [k for k in have if not var[k]["same_clips"]],
                     "clips_behind_the_clap_mp3_mean": {str(k): v for k, v in sorted(Counter(var[k]["n"] for k in have).items())}}
    if have:
        rows = np.array([at[k] for k in have])
        pos = np.sort(np.r_[np.flatnonzero(cat.store == "deezer"), rows])
        d = pmc.Pool(cat, pos)
        where = {int(p): j for j, p in enumerate(pos.tolist())}
        mine = np.array([where[int(i)] for i in rows])
        versions = {}
        for name, X in (("baseline (clap as stored)", base), ("pair map (residual, lambda 1)", mapped)):
            versions[name] = unit(X[pos])
        V = base[pos].copy()
        V[mine] = np.stack([var[k]["vec"] for k in have])
        versions["clap_mp3 (round trip)"] = unit(V)
        labels = measure.Labels(d.genres, d.descriptors)
        groups = {"the picked iTunes albums": d.itunes, "Deezer seeds": ~d.itunes, "new Deezer seeds": d.new & ~d.itunes,
                  "existing Deezer seeds": ~d.new & ~d.itunes}
        res["pool"] = {"albums": len(d), "deezer": int((~d.itunes).sum()), "itunes": int(d.itunes.sum()),
                       "share_itunes": r(float(d.itunes.mean())), "new_deezer": int((d.new & ~d.itunes).sum()),
                       "existing_deezer": int((~d.new & ~d.itunes).sum())}
        print("catalog pool", res["pool"], flush=True)
        res["catalog"], lists = pool_rows(d, versions, d.itunes, groups, labels, se, sonic, measure, probes=True)
        b, m, v = (versions[n] for n in versions)
        names = list(versions)
        it = d.itunes
        res["agreement"] = {
            "albums": int(it.sum()),
            "cosine_clap_mp3_vs_pair_map": se.describe(np.sum(v[it] * m[it], axis=1).tolist()),
            "cosine_clap_mp3_vs_baseline": se.describe(np.sum(v[it] * b[it], axis=1).tolist()),
            "cosine_pair_map_vs_baseline": se.describe(np.sum(m[it] * b[it], axis=1).tolist()),
            "albums_where_clap_mp3_is_nearer_the_pair_map_than_the_baseline": int((np.sum(v[it] * m[it], axis=1) > np.sum(v[it] * b[it], axis=1)).sum()),
            "shared_neighbours_of_10, iTunes seeds": {"clap_mp3 and pair map": overlap(lists[names[2]], lists[names[1]], it),
                                                      "clap_mp3 and baseline": overlap(lists[names[2]], lists[names[0]], it),
                                                      "pair map and baseline": overlap(lists[names[1]], lists[names[0]], it)},
            "shared_neighbours_of_10, Deezer seeds": {"clap_mp3 and pair map": overlap(lists[names[2]], lists[names[1]], ~it),
                                                      "clap_mp3 and baseline": overlap(lists[names[2]], lists[names[0]], ~it),
                                                      "pair map and baseline": overlap(lists[names[1]], lists[names[0]], ~it)}}
        # the displacement: is the variant's move along the map's move?
        dv, dm = v[it] - b[it], m[it] - b[it]
        res["agreement"]["cosine_of_the_two_moves_from_the_baseline"] = se.describe(
            (np.sum(dv * dm, axis=1) / np.maximum(np.linalg.norm(dv, axis=1) * np.linalg.norm(dm, axis=1), 1e-30)).tolist())
        # distance to the Deezer albums: mean cosine to the ten nearest Deezer albums (512 numbers)
        res["nearest_deezer_cosine"] = {n: r(float(np.sort(U[it] @ U[~it].T, axis=1)[:, -10:].mean())) for n, U in versions.items()}
        res["nearest_deezer_cosine"]["Deezer albums among themselves (new Deezer seeds)"] = r(float(
            np.sort(b[d.new & ~it] @ b[~it].T, axis=1)[:, -11:-1].mean()))
        # only the albums whose clips are the baseline's
        if len(full) != len(have):
            keep = np.ones(len(d), bool)
            keep[[where[at[k]] for k in have if k not in set(full)]] = False
            sub = pmc.Pool(cat, pos[keep])
            sub_rows, _ = pool_rows(sub, {n: U[keep] for n, U in versions.items()}, sub.itunes,
                                    {"the picked iTunes albums": sub.itunes, "Deezer seeds": ~sub.itunes},
                                    measure.Labels(sub.genres, sub.descriptors), se, sonic, measure, probes=False)
            res["catalog_same_clips_only"] = {"itunes": int(sub.itunes.sum()), "rows": sub_rows}
        # EffNet over the same albums: the model that does not hear the store
        cache = OnePassCache(ONEPASS_DB, readonly=True)
        try:
            ek, EX, _, es, _ = album_means(cache, "effnet", [row["rym_id"] for row in sonic.read_catalog()],
                                           se.AUDIO / "matches.csv", CLIPS, se.AUDIO / "keys.csv")
        finally:
            cache.close()
        eat = {k: (i, s) for i, (k, s) in enumerate(zip(ek.tolist(), es.tolist()))}
        ok = np.array([k in eat and eat[k][1] == s for k, s in zip(d.keys.tolist(), d.source.tolist())])
        de = pmc.Pool(cat, pos[ok])
        Ue = unit(EX[[eat[k][0] for k in de.keys.tolist()]])
        e_rows, _ = pool_rows(de, {"EffNet (four-clip means)": Ue, "clap_mp3 on these albums": versions[names[2]][ok]}, de.itunes,
                              {"the picked iTunes albums": de.itunes, "Deezer seeds": ~de.itunes, "new Deezer seeds": de.new & ~de.itunes,
                               "existing Deezer seeds": ~de.new & ~de.itunes},
                              measure.Labels(de.genres, de.descriptors), se, sonic, measure, probes=True)
        res["effnet"] = {"albums": len(de), "itunes": int(de.itunes.sum()), "rows": e_rows}

    # ---------------------------------------------------------------- YouTube: Deezer + the re-fetched YouTube albums
    yk = [k for k in YT_KEYS.read_text().split() if k in at] if YT_KEYS.exists() else []
    yvar = variant_means(cat, yk)
    yhave = [k for k in yk if k in yvar]
    res["youtube_albums"] = {"picked": len(yk), "with_a_clap_mp3_vector": len(yhave),
                             "of_them_over_the_same_windows_as_clap": sum(yvar[k]["same_clips"] for k in yhave),
                             "left_out": [k for k in yk if k not in yvar],
                             "windows_behind_the_mean": {str(k): v for k, v in sorted(Counter(yvar[k]["n"] for k in yhave).items())}}
    if yhave:
        rows = np.array([at[k] for k in yhave])
        pos = np.sort(np.r_[np.flatnonzero(cat.store == "deezer"), rows])
        d = pmc.Pool(cat, pos)
        where = {int(p): j for j, p in enumerate(pos.tolist())}
        mine = np.array([where[int(i)] for i in rows])
        V = base[pos].copy()
        V[mine] = np.stack([yvar[k]["vec"] for k in yhave])
        versions = {"baseline (clap as stored)": unit(base[pos]), "clap_mp3 (round trip)": unit(V)}
        res["youtube_pool"] = {"albums": len(d), "deezer": int((~d.youtube).sum()), "youtube": int(d.youtube.sum()),
                               "share_youtube": r(float(d.youtube.mean()), 5)}
        groups = {"the YouTube albums": d.youtube, "Deezer seeds": ~d.youtube}
        res["youtube"], _ = pool_rows(d, versions, d.youtube, groups, measure.Labels(d.genres, d.descriptors), se, sonic, measure, probes=False)
        b, v = versions["baseline (clap as stored)"], versions["clap_mp3 (round trip)"]
        y = d.youtube
        res["youtube_vectors"] = {
            "cosine_clap_mp3_vs_baseline": se.describe(np.sum(v[y] * b[y], axis=1).tolist()),
            "mean_cosine_to_the_ten_nearest_deezer_albums": {n: r(float(np.sort(U[y] @ U[~y].T, axis=1)[:, -10:].mean())) for n, U in versions.items()},
            "albums_nearer_their_ten_nearest_deezer_albums_with_clap_mp3": int(
                (np.sort(v[y] @ v[~y].T, axis=1)[:, -10:].mean(axis=1) > np.sort(b[y] @ b[~y].T, axis=1)[:, -10:].mean(axis=1)).sum()),
            "deezer_reference_new_deezer_seeds": r(float(np.sort(b[d.new & ~y] @ b[~y].T, axis=1)[:, -11:-1].mean()))}
        # window level: YouTube windows against clips of Deezer albums of the same first genre x decade
        rng = np.random.default_rng(SEED)
        yt_listings = [(k if True else k, str(cat.source[at[k]]), str(cat.album_id[at[k]])) for k in yhave]
        cells = {}
        for j in np.flatnonzero(d.new & ~y & d.has_meta).tolist():
            cells.setdefault((d.genre[j], int(d.decade[j])), []).append(j)
        ctrl = []
        for j in mine.tolist():
            cand = cells.get((d.genre[j], int(d.decade[j])), [])
            ctrl += rng.choice(cand, min(5, len(cand)), replace=False).tolist() if cand else []
        ctrl = sorted(set(ctrl))
        if len(ctrl) < 40:  # too few same-cell albums: fill with random new Deezer albums
            rest = sorted(set(np.flatnonzero(d.new & ~y).tolist()) - set(ctrl))
            ctrl = sorted(set(ctrl) | set(rng.choice(rest, 60 - len(ctrl), replace=False).tolist()))
        dz_listings = [(str(d.keys[j]), str(d.source[j]), str(cat.album_id[pos[j]])) for j in ctrl]
        Dx, Dg = clip_rows("clap", dz_listings, CLIPS)
        probes = {}
        for name, model in (("baseline (clap as stored)", "clap"), ("clap_mp3 (round trip)", "clap_mp3")):
            Yx, Yg = clip_rows(model, yt_listings, None)
            X = np.r_[Yx, Dx]
            lab = np.r_[np.ones(len(Yx), int), np.zeros(len(Dx), int)]
            grp = np.r_[Yg, Dg + len(yt_listings)]
            probes[name] = se.probe(X, lab, grp)
        res["youtube_window_probe"] = {"what": "YouTube windows against clips of new Deezer albums of the same first genre x decade "
                                               "(up to five albums per YouTube album), grouped by album",
                                       "deezer_control_albums": len(ctrl), "rows": probes}
    return res


# ------------------------------------------------------------------------------------------- markdown

def _t(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header), *("| " + " | ".join(row) + " |" for row in rows), ""]


def _p(x, n=1) -> str:
    return "–" if x is None else f"{100 * x:.{n}f}%"


def _f(x, n=3) -> str:
    return "–" if x is None else f"{x:.{n}f}"


def _auc(p: dict | None) -> str:
    return "–" if not p or p.get("auc") is None else f"{p['auc']:.3f} ± {p['fold_sd']:.3f} (n {p['n_pos']} / {p['n_neg']})"


def markdown(res: dict) -> str:
    L = [f"# The MP3 round trip as a stored variant (`clap_mp3`), checked on the catalog", "",
         f"Generated {res['generated']} by `mp3_variant_check.py`. **Stored vectors and RYM-catalog proxies. Nobody listened to "
         "anything.** Target shares are computed for the pool of each table.", ""]
    cat, eff, ag, pool = res.get("catalog"), res.get("effnet"), res.get("agreement"), res.get("pool")
    names = list(cat) if cat else []
    g_it, g_dz = "the picked iTunes albums", "Deezer seeds"
    L += ["## Verdict", ""] + res.get("verdict", ["(written by hand below the tables once the numbers are in)"]) + [""]
    if cat:
        al = res["albums"]
        L += ["## 1. The catalog: the picked iTunes albums in the pool of every Deezer album", "",
              f"Pool: {pool['albums']:,} albums = {pool['deezer']:,} Deezer-sourced (their `clap_mp3` vector is their `clap` vector; "
              f"{pool['new_deezer']:,} new, {pool['existing_deezer']:,} existing) + {pool['itunes']} iTunes-sourced new albums "
              f"({_p(pool['share_itunes'])} of the pool). Picked {al['picked']}, {al['with_a_clap_mp3_vector']} have a `clap_mp3` vector, "
              f"{al['of_them_over_the_same_clips_as_clap']} of them over exactly the clips the `clap` mean is over. "
              "`Make-up`: the share of the picked albums among the pool's other albums with the seed's first genre (and genre x decade): "
              "what a list that ignored the store would hold. Interval: 95%, resampling the 250 seeds.", ""]
        head = ["Vectors of the picked albums", "iTunes neighbours of the picked albums (n seeds)", "95% interval", "make-up: genre / genre x decade",
                "iTunes neighbours of Deezer seeds (n)", "make-up", "new Deezer seeds", "existing Deezer seeds",
                "Lists a picked album is in (mean; in none)"]
        rows = []
        for n in names:
            x = cat[n]["neighbours_flagged"]
            rows.append([f"`{n}`", f"{_p(x[g_it]['share_of_neighbours'])} ({x[g_it]['seeds']})", " to ".join(_p(c) for c in x[g_it]["ci95"]),
                         f"{_p(x[g_it]['same_genre_share'])} / {_p(x[g_it]['same_genre_decade_share'])}",
                         f"{_p(x[g_dz]['share_of_neighbours'], 2)} ({x[g_dz]['seeds']:,})",
                         f"{_p(x[g_dz]['same_genre_share'], 2)} / {_p(x[g_dz]['same_genre_decade_share'], 2)}",
                         _p(x["new Deezer seeds"]["share_of_neighbours"], 2), _p(x["existing Deezer seeds"]["share_of_neighbours"], 2),
                         f"{cat[n]['n10_flagged']['mean']:.2f}; {cat[n]['n10_flagged']['in_no_list']}"])
        if eff:
            for n, row in eff["rows"].items():
                x = row["neighbours_flagged"]
                rows.append([f"`{n}` ({eff['albums']:,} albums, {eff['itunes']} picked)", f"{_p(x[g_it]['share_of_neighbours'])} ({x[g_it]['seeds']})",
                             " to ".join(_p(c) for c in x[g_it]["ci95"]), f"{_p(x[g_it]['same_genre_share'])} / {_p(x[g_it]['same_genre_decade_share'])}",
                             f"{_p(x[g_dz]['share_of_neighbours'], 2)} ({x[g_dz]['seeds']:,})",
                             f"{_p(x[g_dz]['same_genre_share'], 2)} / {_p(x[g_dz]['same_genre_decade_share'], 2)}",
                             _p(x["new Deezer seeds"]["share_of_neighbours"], 2), _p(x["existing Deezer seeds"]["share_of_neighbours"], 2),
                             f"{row['n10_flagged']['mean']:.2f}; {row['n10_flagged']['in_no_list']}"])
        L += _t(head, rows)
        L += ["An album is in ten lists on average when nothing sets it apart. The make-up for Deezer seeds is over the seeds with a "
              "genre; the picked albums are new, so existing Deezer seeds (the site's albums, other genres and ranks) have a lower "
              "make-up than new ones.", ""]
        if "catalog_same_clips_only" in res:
            s = res["catalog_same_clips_only"]
            L += [f"Only the {s['itunes']} picked albums whose `clap_mp3` clips are exactly the `clap` clips:", ""]
            L += _t(["Vectors", "iTunes neighbours of the picked albums", "make-up", "iTunes neighbours of Deezer seeds", "make-up"],
                    [[f"`{n}`", _p(x["neighbours_flagged"][g_it]["share_of_neighbours"]), _p(x["neighbours_flagged"][g_it]["same_genre_share"]),
                      _p(x["neighbours_flagged"][g_dz]["share_of_neighbours"], 2), _p(x["neighbours_flagged"][g_dz]["same_genre_share"], 2)]
                     for n, x in s["rows"].items()])
        L += ["## 2. Can a probe still tell the picked albums from Deezer albums?", "",
              "Logistic regression on the standardised unit album vectors (512 numbers), C 0.01, five folds with an artist kept "
              "together. `Matched`: the picked albums against new Deezer albums, one for one within first genre x decade. 0.5 = cannot tell.", ""]
        keys = list(next(iter(cat.values()))["probes"])
        rows = [[f"`{n}`", *(_auc(cat[n]["probes"][k]) for k in keys)] for n in names]
        if eff:
            rows += [[f"`{n}`", *(_auc(row["probes"][k]) for k in keys)] for n, row in eff["rows"].items()]
        L += _t(["Vectors of the picked albums", *keys], rows)
        L += ["## 3. Do the two fixes agree?", "",
              f"{ag['albums']} picked albums, unit album vectors. `Moves`: the cosine between (clap_mp3 minus baseline) and (pair map minus "
              "baseline): 1 if both fixes push an album the same way.", ""]
        d = lambda x: f"{x['mean']:.3f} ({x['median']:.3f}; {x.get('p10', x.get('min')):.3f} to {x.get('p90', x.get('max')):.3f})" if x else "–"  # noqa: E731
        L += _t(["Pair", "Cosine: mean (median; 10th to 90th percentile)"],
                [["clap_mp3 and pair map", d(ag["cosine_clap_mp3_vs_pair_map"])], ["clap_mp3 and baseline", d(ag["cosine_clap_mp3_vs_baseline"])],
                 ["pair map and baseline", d(ag["cosine_pair_map_vs_baseline"])],
                 ["the two moves from the baseline", d(ag["cosine_of_the_two_moves_from_the_baseline"])]])
        L += [f"clap_mp3 is nearer the pair-mapped vector than the baseline vector for {ag['albums_where_clap_mp3_is_nearer_the_pair_map_than_the_baseline']} "
              f"of {ag['albums']} albums. Shared neighbours of ten, picked albums as seeds: "
              + ", ".join(f"{k} {v}" for k, v in ag["shared_neighbours_of_10, iTunes seeds"].items()) + ". Deezer seeds: "
              + ", ".join(f"{k} {v}" for k, v in ag["shared_neighbours_of_10, Deezer seeds"].items()) + ".", "",
              "Mean cosine of a picked album to its ten nearest Deezer albums (512 numbers): "
              + ", ".join(f"{k} {_f(v)}" for k, v in res["nearest_deezer_cosine"].items()) + ".", "",
              "## 4. RYM proxies for the picked albums as seeds", "",
              "Share of the ten neighbours with the seed's first primary genre / genre family, and the mean Jaccard overlap of top "
              "descriptors. A proxy for sounding alike, not a measure of it; a list with more Deezer albums in it draws on a pool "
              "twenty-six times larger, so these can rise for that reason alone.", ""]
        L += _t(["Vectors", "genre_primary", "genre_family", "desc_jaccard", "Deezer seeds: genre_primary", "desc_jaccard"],
                [[f"`{n}`", *(_f(cat[n]["flagged_seeds"][m]) for m in ("genre_primary", "genre_family", "desc_jaccard")),
                  _f(cat[n]["other_seeds"]["genre_primary"]), _f(cat[n]["other_seeds"]["desc_jaccard"])] for n in names])
    if res.get("youtube"):
        y, yp, ya, yv, yw = res["youtube"], res["youtube_pool"], res["youtube_albums"], res["youtube_vectors"], res["youtube_window_probe"]
        gy = "the YouTube albums"
        L += ["## 5. YouTube audio (small n: direction only)", "",
              f"{ya['with_a_clap_mp3_vector']} of the {ya['picked']} picked albums already embedded from a YouTube video were fetched again and their "
              f"windows embedded for `clap_mp3` (the same windows: {ya['of_them_over_the_same_windows_as_clap']}). Pool: {yp['deezer']:,} Deezer "
              f"albums + {yp['youtube']} YouTube albums ({_p(yp['share_youtube'], 2)}).", ""]
        L += _t(["Vectors of the YouTube albums", "Lists a YouTube album is in (mean; median; in none)", "YouTube neighbours of Deezer seeds",
                 "make-up (genre)", "YouTube neighbours of YouTube seeds", "Mean cosine to the ten nearest Deezer albums",
                 "Window probe: YouTube windows vs Deezer clips, AUC", "genre_primary of YouTube seeds"],
                [[f"`{n}`", f"{y[n]['n10_flagged']['mean']:.2f}; {y[n]['n10_flagged']['median']:.0f}; {y[n]['n10_flagged']['in_no_list']}",
                  _p(y[n]["neighbours_flagged"][g_dz]["share_of_neighbours"], 3), _p(y[n]["neighbours_flagged"][g_dz]["same_genre_share"], 3),
                  _p(y[n]["neighbours_flagged"][gy]["share_of_neighbours"], 2), _f(yv["mean_cosine_to_the_ten_nearest_deezer_albums"][n]),
                  _auc(yw["rows"][n]), _f(y[n]["flagged_seeds"]["genre_primary"])] for n in y])
        c = yv["cosine_clap_mp3_vs_baseline"]
        L += [f"A YouTube album's `clap_mp3` vector is at cosine {c['mean']:.3f} (median {c['median']:.3f}) with its `clap` vector; "
              f"{yv['albums_nearer_their_ten_nearest_deezer_albums_with_clap_mp3']} of {yp['youtube']} albums are nearer their ten nearest Deezer albums "
              f"with it. New Deezer albums sit at {_f(yv['deezer_reference_new_deezer_seeds'])} from their ten nearest Deezer albums. Window probe: "
              f"{yw['what']}; {yw['deezer_control_albums']} Deezer albums. An album is in ten lists on average.", ""]
    s = res.get("sanity")
    if s:
        dc, it = s["deezer_copy"], s["itunes_vs_experiment"]
        L += ["## 6. Sanity with the real model", "",
              f"- **Deezer copy.** {dc['clips']} clips of {len(dc['albums'])} albums copied by `rmr_audio.onepass copy`: {dc['same_embedding_bytes']} "
              f"have the `clap` row's embedding to the byte, {dc['same_status']} its status, origin {dc['origin']}.",
              f"- **iTunes clips against the experiment.** {it['clips']} paired tracks of {it['albums']} albums fetched again and embedded by "
              f"the pipeline's CLAP child: cosine of the pipeline's `clap_mp3` with the experiment's `mp3st` vector of the same track: lowest "
              f"{it['cosine_clap_mp3_vs_mp3st']['min']}, median {it['cosine_clap_mp3_vs_mp3st']['median']}; of its `clap` with the experiment's `base`: "
              f"lowest {it['cosine_clap_vs_base']['min']}, median {it['cosine_clap_vs_base']['median']}."
              + (f" Not compared: {len(it['not_compared'])} (no preview of the track now)." if it["not_compared"] else ""), ""]
        L += _t(["Album", "Track", "Store", "clap_mp3 vs experiment mp3st", "largest absolute difference", "clap vs experiment base",
                 "clap_mp3 vs its own clap", "experiment: mp3st vs base"],
                [[x["key"], x["track_id"], x["source"], f"{x['cosine_clap_mp3_vs_mp3st']:.6f}", f"{x['max_abs_clap_mp3_vs_mp3st']:.6f}",
                  f"{x['cosine_clap_vs_base']:.6f}", f"{x['cosine_clap_mp3_vs_its_own_clap']:.4f}", f"{x['experiment_cosine_mp3st_vs_base']:.4f}"]
                 for x in it["rows"]])
    run, cache = res.get("run") or {}, res.get("cache") or {}
    L += ["## 7. The runs", ""]
    if run.get("check"):
        L += ["`--check-baseline`: each clip fetched for `clap_mp3` was also embedded for `clap` and compared with the stored `clap` vector "
              "(nothing of it stored). At 1.0 the store still serves the audio the baseline was made of.", ""]
        L += _t(["Source", "Clips", "Median cosine", "5th percentile", "1st percentile", "Lowest", "Under 0.999", "Under 0.99", "Under 0.9"],
                [[k, str(v["clips"]), f"{v['median']:.5f}", f"{v['p05']:.5f}", f"{v['p01']:.5f}", f"{v['min']:.5f}", str(v["under_0.999"]),
                  str(v["under_0.99"]), str(v["under_0.9"])] for k, v in run["check"].items()])
    if cache:
        L += [f"The cache now holds, for `clap_mp3` (source / status / origin): " + "; ".join(f"{k}: {v:,}" for k, v in cache["clap_mp3_rows"].items())
              + f". Baseline clips whose preview was gone: {cache['gone'][0]} (of {cache['gone'][1]} albums); `clap_mp3` clips that have no `clap` "
              f"row (stand-ins): {cache['clap_mp3_ok_without_a_clap_row']}. `clap` rows are unchanged: "
              + "; ".join(f"{k}: {v:,}" for k, v in cache["clap_rows"].items()) + ".", ""]
    if run.get("lines"):
        L += ["From the logs:", "", "```", *run["lines"], "```", ""]
    if res.get("pick"):
        p = res["pick"]
        L += ["## 8. The sample", "",
              f"{p['picked']} of the {p['population']:,} new albums whose CLAP mean is from iTunes clips, seed {p['seed']}: {p['drawn_from']}. "
              f"Rank quartiles: picked {p['rank_quartiles_picked']}, population {p['rank_quartiles_population']}. Storefronts: "
              + ", ".join(f"{k} {v}" for k, v in p["storefront_picked"].items()) + ". Clips behind the `clap` mean: "
              + ", ".join(f"{k}: {v}" for k, v in p["clips_picked"].items()) + f". YouTube: {p['youtube_picked']} of {p['youtube_population']} "
              "embedded albums, the same way.", ""]
        fam_p, fam_all = p["genre_family_picked"], p["genre_family_population"]
        L += _t(["Genre family", "Picked", "Share", "Population share"],
                [[k, str(fam_p.get(k, 0)), _p(fam_p.get(k, 0) / p["picked"]), _p(v / p["population"])] for k, v in fam_all.items()])
    ch = res.get("channels")
    if ch:
        L += ["Channels of the files (the experiment's 698 previews and 25 YouTube files, ffprobe): "
              + "; ".join(f"{k}: {v}" for k, v in ch["experiment_previews"].items()) + "; YouTube files by channel count: "
              + ", ".join(f"{k}: {v}" for k, v in ch["experiment_youtube_files"].items()) + ".", ""]
    L += res.get("closing", [])
    return "\n".join(L)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("pick")
    s = sub.add_parser("sanity")
    s.add_argument("--torch-python", type=Path, default=None)
    s.add_argument("--clips", type=int, default=10)
    q = sub.add_parser("report")
    q.add_argument("--log", type=Path, action="append", default=[])
    q.add_argument("--md", action="store_true", help="Write the markdown again from the JSON; compute nothing.")
    q.add_argument("--text", type=Path, default=RESULTS / "mp3_variant_check.text.json",
                   help="The hand-written verdict and closing sections ({verdict: [lines], closing: [lines]}), kept beside the results.")
    args = p.parse_args(argv)
    if args.cmd == "pick":
        return pick()
    if args.cmd == "sanity":
        return sanity(args)
    if not args.md:
        res = report(args.log)
        OUT_JSON.write_text(json.dumps(res, indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o)) + "\n")
        print(f"wrote {OUT_JSON}")
    res = json.loads(OUT_JSON.read_text())
    if args.text.exists():
        res |= json.loads(args.text.read_text())
    OUT_MD.write_text(markdown(res))
    print(f"wrote {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
