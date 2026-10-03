"""Evaluate audio-block variants against the Spotify baseline (see variants.py for the variants).

CLI:
  python evaluate.py                    real caches, 4 tracks per album -> results/
  python evaluate.py --tracks 0         every analysed track of every album instead of the first 4 in
                                        the extractor's priority order (albums are then treated unevenly)
  python evaluate.py --subset clean     train the Ridge on the clean seed group only (default: all)
  python evaluate.py --baseline         A and the controls on the whole catalog -> results/baseline/
  python evaluate.py --fixture          synthetic caches (built if missing) -> cache/fixture/results/
  python evaluate.py --features PATH --embeddings PATH --out DIR --seed-variants A,D64,D64~mp,Cvm
  python evaluate.py --rows FILE        only the albums of a snapshot (simbench.pool_rows; written if missing)

Features come straight from cache/features.sqlite through aggregate.py (read-only), or from the
two parquet files when both are given.

Conditions: the three slider stops ([audio | descriptors / slider**3], as the live recommender)
and `audio` (the audio block alone). Per condition and variant, over seeds:
  overlap10        share of the variant's top 10 that is in A's top 10
  spearman_full    Spearman between A's and the variant's distances from the seed to every other album
  spearman_top100  the same over A's 100 nearest albums only (top-heavy)
  genre_primary / genre_any / genre_family   share of the top 10 sharing the seed's primary RYM
                   genre / any genre / the primary genre's coarse family
  desc_cos         (audio only) mean cosine between the seed's 120 descriptor weights and its
                   neighbours', over albums with descriptors
Agreement metrics are reported per seed group (variants.seed_groups): `all` skips only the seeds
whose Spotify features belong to another record, `clean` keeps the unambiguous same-edition
matches, and `ambiguous` / `unambiguous` split by the matcher's flag. Confidence intervals are
95% percentile bootstraps over seeds (paired for differences against A).

Also: a balanced-stop sweep of the audio block's scale for A, D24, D64 and E (is the slider still
tuned once the block changes?), and matching / extraction coverage read from the two caches.
seeds.md / seeds.json hold the top 10 of the listening seeds per variant; a `name~mp` variant is
the block `name` ranked by mutual proximity (simbench.mutual_proximity).
"""
import argparse
import json
import sqlite3
import time
import warnings
from contextlib import closing
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import rankdata
from sklearn.metrics.pairwise import euclidean_distances

from aggregate import aggregate
from common import ALBUMS_JSON, FEATURES_DB, MATCH_DB, RESULTS, TABLE_NORM, load_albums
from fixture import FIXTURE, make_fixture
from genres import load_genres, match_matrices
from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import AUDIO, IN_RAINBOWS_LIVE, IN_RAINBOWS_ROW, LIVE_POOL, SLIDER, STOPS
from rmr_pipeline.recs import top_k_neighbours
from rmr_pipeline.table import descriptor_cols, live_recommend, load_table, rec_matrix
from variants import Inputs, build_variants, load_inputs, make_inputs

CONDITIONS = (*STOPS, "audio")
AGREEMENT = ("overlap10", "spearman_full", "spearman_top100")
GENRE = ("genre_primary", "genre_any", "genre_family")
TOP = 100
N_BOOT = 1000
SWEEP_VARIANTS = ("A", "D24", "D64", "E")
SWEEP_SCALES = (0.5, 0.7, 1.0, 1.4, 2.0)
MAX_FAILURE_ROWS = 5000  # extract_failures.csv is written only when it stays this small
# `row` of the listening seeds (well-known, stylistically spread).
SEEDS = [
    11,    # Radiohead, In Rainbows
    19,    # Miles Davis, Kind of Blue
    5,     # My Bloody Valentine, Loveless
    20,    # Nas, Illmatic
    85,    # Aphex Twin, Selected Ambient Works 85-92
    204,   # Slayer, Reign in Blood
    28,    # Nick Drake, Pink Moon
    163,   # Daft Punk, Discovery
    2,     # Kendrick Lamar, To Pimp a Butterfly
    292,   # Keith Jarrett, The Köln Concert
    13,    # Talking Heads, Remain in Light
    43,    # Godspeed You! Black Emperor, F♯A♯∞
    8,     # Madvillain, Madvillainy
    32,    # Joy Division, Unknown Pleasures
    57,    # Stevie Wonder, Songs in the Key of Life
    245,   # Berliner Philharmoniker / Karajan, Symphony No. 9
    430,   # Bob Marley & The Wailers, Exodus
    # hard cases
    48,    # Miles Davis, Bitches Brew (long-track jazz: a preview covers 2% of a track)
    50,    # Yes, Close to the Edge (prog, side-long tracks)
    1077,  # Brian Eno, Ambient 1: Music for Airports (ambient)
    664,   # Stars of the Lid, And Their Refinement of the Decline (drone)
    277,   # Jorge Ben, A Tábua de Esmeralda (Portuguese-language)
    531,   # Philip Glass, Koyaanisqatsi (one RYM descriptor)
]
SEED_STOPS = ("sonic", "balanced")


def matrix(audio: np.ndarray | None, desc: np.ndarray, cond: str) -> np.ndarray:
    """The recommender's float32 matrix for one condition: [audio | descriptors / slider**3]
    at a stop, the audio block alone for `audio`."""
    parts = [] if audio is None else [audio]
    if cond != "audio":
        parts.append(desc / SLIDER[cond] ** 3)
    return np.hstack(parts).astype(np.float32)


def rank_rows(D: np.ndarray) -> np.ndarray:
    """Row-wise ranks of each seed's distances. Self takes the mean rank of the others, so it
    drops out of any row correlation."""
    D = D.copy()
    np.fill_diagonal(D, -1)
    R = rankdata(D, axis=1).astype(np.float32)
    np.fill_diagonal(R, (len(D) + 2) / 2)
    return R


def corr_rows(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Pearson correlation of matching rows."""
    a = a - a.mean(axis=1, keepdims=True)
    b = b - b.mean(axis=1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        return (a * b).sum(axis=1) / np.sqrt((a * a).sum(axis=1) * (b * b).sum(axis=1))


def row_nanmean(M: np.ndarray) -> np.ndarray:
    """nanmean per row; NaN (no warning) for an all-NaN row."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(M, axis=1)


def neighbourhood(X: np.ndarray) -> dict:
    """Top-10 lists, squared distances, their row ranks and the 100 nearest of every seed."""
    D = euclidean_distances(X.astype(np.float64), squared=True).astype(np.float32)
    far = D.copy()
    np.fill_diagonal(far, np.inf)
    top = min(TOP, len(D) - 2)
    return {"nbrs": top_k_neighbours(X), "D": D, "R": rank_rows(D), "top": np.argpartition(far, top, axis=1)[:, :top]}


def overlap(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Per seed, the share of list `a` that is also in list `b`."""
    return (a[:, :, None] == b[:, None, :]).any(axis=2).mean(axis=1)


def seed_metrics(hood: dict, ref: dict, coherence: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Per-seed values of every metric for one variant in one condition (`ref` is A's)."""
    out = {name: row_nanmean(np.take_along_axis(M, hood["nbrs"], axis=1)) for name, M in coherence.items()}
    if hood is not ref:
        a, v = (np.take_along_axis(h["D"], ref["top"], axis=1) for h in (ref, hood))
        out["overlap10"] = overlap(hood["nbrs"], ref["nbrs"])
        out["spearman_full"] = corr_rows(ref["R"], hood["R"])
        out["spearman_top100"] = corr_rows(rankdata(a, axis=1), rankdata(v, axis=1))
    return out


def summarise(v: np.ndarray, base: np.ndarray | None, boot: np.ndarray) -> dict:
    """Mean and bootstrap CI of a per-seed metric, plus the paired difference against `base`."""
    def stats(x):
        lo, hi = np.percentile(row_nanmean(x[boot]), [2.5, 97.5])
        return round(float(np.nanmean(x)), 4), [round(float(lo), 4), round(float(hi), 4)]

    out = dict(zip(("mean", "ci"), stats(v)))
    if base is not None:
        out["diff"], out["diff_ci"] = stats(v - base)
    return out


def by_seed_group(v: np.ndarray, seeds: dict[str, np.ndarray], boot: np.ndarray) -> dict:
    """An agreement metric summarised over the `all` seeds, with the other groups under `by_seeds`."""
    groups = {g: summarise(np.where(mask, v, np.nan), None, boot) for g, mask in seeds.items()}
    return groups.pop("all") | {"by_seeds": groups}


def scale_sweep(blocks: dict, desc: np.ndarray, ref: np.ndarray, genre_M: dict, seeds: np.ndarray) -> dict:
    """Balanced stop with the audio block multiplied by each scale: overlap@10 with A's unscaled
    lists and genre coherence. A flat or falling curve around 1 means the slider needs no re-tune."""
    out = {}
    for name in SWEEP_VARIANTS:
        if name in blocks:
            out[name] = {}
            for scale in SWEEP_SCALES:
                nbrs = top_k_neighbours(matrix(blocks[name] * scale, desc, "balanced"))
                out[name][str(scale)] = {"overlap10": round(float(overlap(nbrs, ref)[seeds].mean()), 4)} | {
                    m: round(float(np.nanmean(row_nanmean(np.take_along_axis(M, nbrs, axis=1)))), 4)
                    for m, M in genre_M.items()}
    return out


def extraction_coverage(match_db: Path, features_db: Path) -> tuple[dict, pd.DataFrame]:
    """Matching and extraction coverage read from the two caches (read-only), and the tracks
    that are recorded with a status other than ok."""
    with closing(sqlite3.connect(f"file:{match_db}?mode=ro", uri=True)) as con:
        albums, matched = con.execute("SELECT COUNT(*), SUM(status = 'matched') FROM albums").fetchone()
        tracks, previews = con.execute("SELECT COUNT(*), SUM(COALESCE(preview_url, '') != '') FROM tracks").fetchone()
    with closing(sqlite3.connect(f"file:{features_db}?mode=ro", uri=True)) as con:
        status = dict(con.execute("SELECT status, COUNT(*) FROM tracks GROUP BY status ORDER BY 2 DESC"))
        with_ok, = con.execute("SELECT COUNT(DISTINCT row) FROM tracks WHERE status = 'ok'").fetchone()
        failures = pd.read_sql("SELECT row, track_idx, status, error FROM tracks WHERE status != 'ok' "
                               "ORDER BY row, track_idx", con)
    return {"albums": albums, "albums_matched": matched, "tracks_on_matched_albums": tracks,
            "tracks_with_preview": previews, "tracks_by_status": status,
            "albums_with_analysed_track": with_ok}, failures


def floors(coherence: dict[str, np.ndarray]) -> dict[str, float]:
    """Each coherence metric for random neighbours: the mean over every other album."""
    out = {}
    for name, M in coherence.items():
        M = M.copy()
        np.fill_diagonal(M, np.nan)
        out[name] = round(float(np.nanmean(row_nanmean(M))), 4)
    return out


def in_rainbows(inp: Inputs, blocks: dict, desc: np.ndarray) -> dict:
    """The live-site check of tests/test_recommender.py on the original table, then its analogue
    per variant: slider 0.5, the pool's albums among the LIVE_POOL leading rows, 5 neighbours."""
    table = load_table(TABLE_NORM)
    live = [str(table.loc[r, "Title"]) for r in live_recommend(table.head(LIVE_POOL), IN_RAINBOWS_ROW, 0.5)]
    assert live == IN_RAINBOWS_LIVE, live
    rows = inp.albums["row"].to_numpy()
    head = rows < LIVE_POOL
    out = {"expected": IN_RAINBOWS_LIVE, "original_table_passes": True, "seed_in_pool": IN_RAINBOWS_ROW in rows,
           "expected_in_pool": len(set(inp.albums["Title"][head]) & set(IN_RAINBOWS_LIVE)), "variants": {}}
    if out["seed_in_pool"]:
        seed = int(np.flatnonzero(rows[head] == IN_RAINBOWS_ROW)[0])
        titles = inp.albums["Title"][head].astype(str).to_numpy()
        for name, block in blocks.items():
            got = titles[top_k_neighbours(matrix(None if block is None else block[head], desc[head], "mood"), 5)[seed]]
            out["variants"][name] = {"titles": got.tolist(),
                                     "in_order": int(sum(g == e for g, e in zip(got, IN_RAINBOWS_LIVE))),
                                     "as_set": len(set(got) & set(IN_RAINBOWS_LIVE))}
        out["pool_changes_A"] = out["variants"]["A"]["titles"] != IN_RAINBOWS_LIVE
        for v in out["variants"].values():
            v["same_as_A"] = v["titles"] == out["variants"]["A"]["titles"]
    return out


def coverage(inp: Inputs, genres, has_desc: np.ndarray, n_catalog: int) -> dict:
    """How much of the catalog the pool covers."""
    out = {"catalog": n_catalog, "pool": len(inp.albums), "pool_share": round(len(inp.albums) / n_catalog, 4),
           "wrong_spotify_album_in_pool": int((~inp.seeds["all"]).sum()), "with_descriptors": int(has_desc.sum()),
           "genre_joined": int(genres["joined"].sum()), "genre_join_rate": round(float(genres["joined"].mean()), 4)}
    if inp.tracks is not None:
        ok, total = inp.tracks["n_tracks_ok"], inp.tracks["n_tracks_total"]
        out |= {"tracks_used": int(ok.sum()), "tracks_on_these_albums": int(total.sum()),
                "median_tracks_used": float(ok.median()), "albums_by_tracks_used": {
                    str(k): int(n) for k, n in ok.clip(upper=5).value_counts().sort_index().items()}}
    return out


def coherence_matrices(albums: pd.DataFrame) -> tuple[np.ndarray, pd.DataFrame, dict[str, dict[str, np.ndarray]]]:
    """The pool's descriptor block, its genres, and per condition the N×N matrices behind the
    coherence metrics: the genre matches everywhere, plus the descriptor cosine for `audio`."""
    desc = albums[descriptor_cols(albums.drop(columns="row"))].to_numpy(dtype=np.float64)
    genres = load_genres(albums)
    genre_M = match_matrices(genres)
    unit = desc / np.where(desc.any(axis=1), np.linalg.norm(desc, axis=1), np.nan)[:, None]
    return desc, genres, {"audio": genre_M | {"desc_cos": (unit @ unit.T).astype(np.float32)}} | {
        s: genre_M for s in STOPS}


def evaluate(inp: Inputs, seed: int = 0) -> tuple[dict, dict]:
    """Everything for metrics.json, and the top-10 lists per condition and variant."""
    albums = inp.albums
    desc, genres, coherence = coherence_matrices(albums)
    blocks, report = build_variants(inp, seed)
    boot = np.random.default_rng(seed).integers(0, len(albums), (N_BOOT, len(albums)))

    metrics, lists = {}, {}
    for cond in CONDITIONS:
        ref = neighbourhood(matrix(blocks["A"], desc, cond))
        if cond != "audio":
            assert np.array_equal(ref["nbrs"], top_k_neighbours(rec_matrix(albums.drop(columns="row"), SLIDER[cond])))
        base = seed_metrics(ref, ref, coherence[cond])
        metrics[cond], lists[cond] = {}, {}
        for name, block in blocks.items():
            if block is None and cond == "audio":
                continue
            hood = ref if name == "A" else neighbourhood(matrix(block, desc, cond))
            per_seed = seed_metrics(hood, ref, coherence[cond])
            metrics[cond][name] = {m: by_seed_group(v, inp.seeds, boot) if m in AGREEMENT
                                   else summarise(v, None if name == "A" else base[m], boot)
                                   for m, v in per_seed.items()}
            lists[cond][name] = hood["nbrs"]
    out = {
        "coverage": coverage(inp, genres, desc.any(axis=1), len(load_table(TABLE_NORM)["URI"].unique())),
        "seed_groups": {g: int(mask.sum()) for g, mask in inp.seeds.items()},
        "ridge_training_albums": int(inp.fit.sum()),
        **report,
        "floors": floors(coherence["audio"]),
        "metrics": metrics,
        "scale_sweep": scale_sweep(blocks, desc, lists["balanced"]["A"], coherence["balanced"], inp.seeds["all"]),
        "in_rainbows": in_rainbows(inp, blocks, desc),
    }
    failures = albums.loc[~genres["joined"], ["row", "Artist", "Title"]]
    return out, {"lists": lists, "genre_failures": failures, "blocks": blocks, "desc": desc}


def add_rescaled(lists: dict, blocks: dict, desc: np.ndarray, names: list[str]) -> None:
    """Adds to `lists`, at the seed stops, the top 10 of every `block~rescale` name: the block's
    distances rescaled by a hubness reduction of simbench.RESCALE before ranking."""
    from simbench import RESCALE, distances, nearest  # simbench imports this module
    for block, _, how in (n.partition("~") for n in names):
        for stop in SEED_STOPS if how else ():
            lists[stop][f"{block}~{how}"] = nearest(RESCALE[how](distances(matrix(blocks[block], desc, stop))))


def label(albums, i: int) -> str:
    return f"{clean_artist(albums.loc[i, 'Artist'])} — {albums.loc[i, 'Title']}"


def seeds_md(inp: Inputs, lists: dict, names: list[str]) -> str:
    """Side-by-side top 10 per listening seed at the sonic and balanced stops; bold = also in A's."""
    albums, pos = inp.albums, {int(r): i for i, r in enumerate(inp.albums["row"])}
    catalog = load_albums().set_index("row")
    with closing(sqlite3.connect(f"file:{MATCH_DB}?mode=ro", uri=True)) as con:
        matched = {r for (r,) in con.execute("SELECT row FROM albums WHERE status = 'matched'")}
    out = ["# Listening seeds", "", f"Top 10 per variant ({', '.join(names)}). **Bold** = also in A's top 10 "
           "at that stop. The last line counts them. `~mp` = ranked by mutual proximity.", ""]
    for row in SEEDS:
        if row not in pos:
            why = "matched, but no track analysed" if row in matched else "not matched: no previews to analyse"
            out += [f"## {clean_artist(catalog.loc[row, 'Artist'])} — {catalog.loc[row, 'Title']}", "",
                    f"Not in the pool ({why}).", ""]
            continue
        i = pos[row]
        wrong = "" if inp.seeds["all"][i] else " (Spotify features of another record: A is unreliable here)"
        out += [f"## {label(albums, i)}{wrong}", ""]
        for stop in SEED_STOPS:
            ref = set(lists[stop]["A"][i].tolist())
            out += [f"### {stop}", "", "| # | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
            for k in range(10):
                cells = [label(albums, j) if n == "A" or j not in ref else f"**{label(albums, j)}**"
                         for n in names for j in [int(lists[stop][n][i][k])]]
                out.append(f"| {k + 1} | " + " | ".join(c.replace("|", "/") for c in cells) + " |")
            shared = [str(len(ref & set(lists[stop][n][i].tolist()))) for n in names]
            out += ["| shared | " + " | ".join(shared) + " |", ""]
    return "\n".join(out)


def seeds_json(inp: Inputs, lists: dict, names: list[str]) -> dict:
    """The lists of seeds.md as data: per listening seed in the pool, stop and variant, the ordered
    top 10 as {row, title, artist, spotify_id}. `spotify_id` is albums.json's `s` (the table's URI
    with the pipeline's corrections), joined by position: album i of albums.json is album i of
    load_albums()."""
    catalog, site = load_albums(), json.loads(ALBUMS_JSON.read_text(encoding="utf-8"))
    assert len(site) == len(catalog)
    spotify = dict(zip(catalog["row"], (a["s"] for a in site)))
    albums, pos = inp.albums, {int(r): i for i, r in enumerate(inp.albums["row"])}

    def entry(i: int) -> dict:
        row = int(albums.loc[i, "row"])
        return {"row": row, "title": str(albums.loc[i, "Title"]), "artist": clean_artist(albums.loc[i, "Artist"]),
                "spotify_id": spotify[row]}

    return {"variants": names, "stops": list(SEED_STOPS), "seeds": [
        entry(pos[row]) | {"lists": {stop: {n: [entry(int(j)) for j in lists[stop][n][pos[row]]] for n in names}
                                     for stop in SEED_STOPS}} for row in SEEDS if row in pos]}


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header),
            *("| " + " | ".join(r) + " |" for r in rows), ""]


def _cell(m: dict | None) -> str:
    """`mean ±half-CI`, or `mean (diff vs A)` with * when the paired CI excludes zero."""
    if m is None:
        return "–"
    if "diff" not in m:
        return f"{m['mean']:.3f} ±{(m['ci'][1] - m['ci'][0]) / 2:.3f}"
    star = "*" if m["diff_ci"][0] > 0 or m["diff_ci"][1] < 0 else ""
    return f"{m['mean']:.3f} ({m['diff']:+.3f}{star})"


def metrics_md(res: dict) -> str:
    """Compact tables: variants × conditions for each metric, Ridge R², coverage, In Rainbows."""
    cov, metrics = res["coverage"], res["metrics"]
    names = list(metrics["sonic"])
    out = ["# Preview-features evaluation", "",
           f"Pool: {cov['pool']} of {cov['catalog']} albums ({cov['pool_share']:.1%}); "
           f"{cov['with_descriptors']} with descriptors; genres joined for {cov['genre_joined']} "
           f"({cov['genre_join_rate']:.2%}); {cov['wrong_spotify_album_in_pool']} albums with another record's "
           f"Spotify features (kept as neighbours, never agreement seeds or Ridge training albums).",
           "Seed groups for the agreement metrics: " + ", ".join(f"{g} {n}" for g, n in res["seed_groups"].items())
           + f". The Ridge trained on the `{res['subset']}` group ({res['ridge_training_albums']} albums)."]
    if "tracks_used" in cov:
        per = res.get("tracks_per_album")
        used = f"the first {per} tracks in priority order" if per else "every analysed track"
        out.append(f"Features: {used} "
                   f"of each album; {cov['tracks_used']} tracks used (median {cov['median_tracks_used']:.0f} per "
                   f"album; albums by tracks used, 5 = 5 or more: {cov['albums_by_tracks_used']}), of "
                   f"{cov['tracks_on_these_albums']} tracks on these albums.")
    if ext := res.get("extraction"):
        status = ext["tracks_by_status"]
        out += ["", "## Coverage: matching and extraction", "", *_table(["", "count", "share"], [
            ["albums matched", str(ext["albums_matched"]),
             f"{ext['albums_matched'] / ext['albums']:.1%} of the catalog"],
            ["tracks with a preview", str(ext["tracks_with_preview"]),
             f"{ext['tracks_with_preview'] / ext['tracks_on_matched_albums']:.1%} of the matched albums' tracks"],
            ["albums with an analysed track", str(ext["albums_with_analysed_track"]),
             f"{ext['albums_with_analysed_track'] / ext['albums_matched']:.1%} of the matched albums"],
            *([f"tracks recorded `{k}`", str(n), f"{n / sum(status.values()):.1%} of the recorded tracks"]
              for k, n in status.items())])]
    out += ["", "Cells: `mean ±half-width of the 95% CI`; for coherence metrics `mean (difference vs A)`, "
            "`*` = the paired 95% CI excludes 0. `audio` = audio block alone. Agreement tables use the "
            "`all` seed group.", "", "## Audio blocks", ""]
    out += _table(["variant", "columns", "total variance / A's"],
                  [[n, str(b["columns"]), f"{b['total_var_vs_A']:.2f}"] for n, b in res["blocks"].items()])
    for metric in (*AGREEMENT, *GENRE, "desc_cos"):
        conds = [c for c in CONDITIONS if metric in metrics[c]["A"] or metric in AGREEMENT]
        rows = [[n] + [_cell(metrics[c].get(n, {}).get(metric)) for c in conds]
                for n in names if metric not in AGREEMENT or n != "A"]
        if metric not in AGREEMENT:
            rows.append(["random neighbours"] + [f"{res['floors'][metric]:.3f}"] * len(conds))
        out += [f"## {metric}", "", *_table(["variant", *conds], rows)]
    shown = [(m, c) for m in AGREEMENT for c in ("sonic", "balanced")]
    if "clean" in res["seed_groups"]:
        groups = res["seed_groups"]
        by = lambda v, m, c, g: f"{metrics[c][v][m]['by_seeds'][g]['mean']:.3f}"  # noqa: E731
        out += [f"## Agreement with A, `clean` seeds ({groups['clean']})", "",
                *_table(["variant", *(f"{m} {c}" for m, c in shown)],
                        [[v, *(by(v, m, c, "clean") for m, c in shown)] for v in names if v != "A"]),
                f"## Agreement with A by match ambiguity: ambiguous ({groups['ambiguous']}) / "
                f"unambiguous ({groups['unambiguous']}) seeds", "",
                *_table(["variant", *(f"{m} {c}" for m, c in shown)],
                        [[v, *(f"{by(v, m, c, 'ambiguous')} / {by(v, m, c, 'unambiguous')}" for m, c in shown)]
                         for v in names if v != "A"])]
    if sweep := res["scale_sweep"]:
        out += ["## Balanced stop: audio block scale", "",
                "The block multiplied by a factor before the neighbours are computed (1 = as evaluated above); "
                "overlap is with A's unscaled lists.", "",
                *_table(["variant", "scale", "overlap10", *GENRE],
                        [[v, k, *(f"{row[m]:.3f}" for m in ("overlap10", *GENRE))]
                         for v, rows in sweep.items() for k, row in rows.items()])]
    if "ridge" in res:
        fits = res["ridge"]
        out += ["## Ridge: out-of-fold R² per Spotify column", ""]
        out += _table(["column", *fits, "B13 analogue (Pearson r)"],
                      [[a, *(f"{f['r2_oof'][a]:.3f}" for f in fits.values()),
                        "dropped" if res["b13"][a]["column"] is None else
                        f"{res['b13'][a]['column']} ({res['b13'][a]['pearson_r']:+.2f})"] for a in AUDIO]
                      + [["mean", *(f"{f['r2_oof_mean']:.3f}" for f in fits.values()), ""]])
        out += ["Largest standardised coefficients per Spotify column (final fit on all albums):", ""]
        out += _table(["column", *fits], [[a, *(", ".join(f"{c} {w:+.2f}" for c, w in f["top_inputs"][a][:3])
                                                for f in fits.values())] for a in AUDIO])
    ir = res["in_rainbows"]
    out += ["## In Rainbows at slider 0.5 (live check)", "",
            f"Expected: {', '.join(ir['expected'])}. The original 4,000-row table reproduces it: "
            f"{ir['original_table_passes']}. {ir['expected_in_pool']} of the 5 expected albums are in the pool."]
    if ir["seed_in_pool"]:
        out += [f"Restricting to the pool changes A's answer: {ir['pool_changes_A']}.", ""]
        out += _table(["variant", "in order", "as a set", "same as A on the pool", "titles"],
                      [[n, f"{v['in_order']}/5", f"{v['as_set']}/5", "yes" if v["same_as_A"] else "no",
                        ", ".join(v["titles"])]
                       for n, v in ir["variants"].items()])
    else:
        out += ["In Rainbows is not in the pool, so the per-variant check cannot run.", ""]
    return "\n".join(out)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--features", type=Path, help="album features parquet (with --embeddings; default: the track cache)")
    p.add_argument("--embeddings", type=Path)
    p.add_argument("--tracks", type=int, default=4, help="tracks per album, in priority order (0 = all analysed)")
    p.add_argument("--baseline", action="store_true", help="A and the controls on the whole catalog")
    p.add_argument("--fixture", action="store_true", help="run on the synthetic caches")
    p.add_argument("--out", type=Path)
    p.add_argument("--subset", default="all", choices=("all", "clean"), help="seed group the Ridge trains on")
    p.add_argument("--seed-variants", help="columns of seeds.md (default A,D64,D64~mp,Cvm; A,Z0,Zs for --baseline)")
    p.add_argument("--rows", type=Path, help="album snapshot to restrict the pool to (written if missing)")
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    t0 = time.time()
    out = args.out or (FIXTURE / "results" if args.fixture else RESULTS / "baseline" if args.baseline else RESULTS)
    dbs = {"db": FIXTURE / "features.sqlite", "match_db": FIXTURE / "match.sqlite"} if args.fixture else {
        "db": FEATURES_DB, "match_db": MATCH_DB}
    if args.fixture and not dbs["db"].exists():
        make_fixture()
    if args.baseline or args.features:
        inp = load_inputs(args.features, args.embeddings, args.subset)
    elif dbs["db"].exists():
        rows = None
        if args.rows:
            from simbench import pool_rows  # simbench imports this module
            rows = pool_rows(args.rows)
        inp = make_inputs(*aggregate(**dbs, prio_below=args.tracks or None), rows, args.subset)
    else:
        p.error(f"{dbs['db']} is missing; run extract.py, or pass --baseline, --fixture or --features/--embeddings")
    res, extra = evaluate(inp, args.seed)
    res |= {"subset": args.subset, "tracks_per_album": None if args.baseline or args.features else args.tracks}
    out.mkdir(parents=True, exist_ok=True)
    if not (args.fixture or args.baseline) and FEATURES_DB.exists():
        res["extraction"], failures = extraction_coverage(MATCH_DB, FEATURES_DB)
        if len(failures) <= MAX_FAILURE_ROWS:
            failures.to_csv(out / "extract_failures.csv", index=False)
    res["runtime_s"] = round(time.time() - t0, 1)
    shown = (args.seed_variants or ("A,Z0,Zs" if args.baseline else "A,D64,D64~mp,Cvm")).split(",")
    if unknown := [n for n in shown if n.partition("~")[0] not in extra["lists"]["sonic"]]:
        p.error(f"unknown --seed-variants {unknown}; have {list(extra['lists']['sonic'])}")
    n_variants = len(extra["lists"]["sonic"])
    add_rescaled(extra["lists"], extra["blocks"], extra["desc"], shown)
    (out / "metrics.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "metrics.md").write_text(metrics_md(res) + "\n", encoding="utf-8")
    (out / "seeds.md").write_text(seeds_md(inp, extra["lists"], shown) + "\n", encoding="utf-8")
    (out / "seeds.json").write_text(json.dumps(seeds_json(inp, extra["lists"], shown), indent=1, ensure_ascii=False) + "\n",
                                    encoding="utf-8")
    extra["genre_failures"].to_csv(out / "genre_join_failures.csv", index=False)
    print(f"{len(inp.albums)} albums, {n_variants} variants, {res['runtime_s']}s -> {out}")


if __name__ == "__main__":
    main()
