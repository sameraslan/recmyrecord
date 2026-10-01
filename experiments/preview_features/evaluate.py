"""Evaluate audio-block variants against the Spotify baseline (see variants.py for the variants).

CLI:
  python evaluate.py                    real caches -> results/
  python evaluate.py --baseline         A and the controls on the whole catalog -> results/baseline/
  python evaluate.py --fixture          synthetic caches (built if missing) -> cache/fixture/results/
  python evaluate.py --features PATH --embeddings PATH --out DIR --seed-variants A,Cvm,D24,E

Conditions: the three slider stops ([audio | descriptors / slider**3], as the live recommender)
and `audio` (the audio block alone). Per condition and variant, over seeds:
  overlap10        share of the variant's top 10 that is in A's top 10
  spearman_full    Spearman between A's and the variant's distances from the seed to every other album
  spearman_top100  the same over A's 100 nearest albums only (top-heavy)
  genre_primary / genre_any / genre_family   share of the top 10 sharing the seed's primary RYM
                   genre / any genre / the primary genre's coarse family
  desc_cos         (audio only) mean cosine between the seed's 120 descriptor weights and its
                   neighbours', over albums with descriptors
Agreement metrics skip seeds whose Spotify features belong to another record. Confidence
intervals are 95% percentile bootstraps over seeds (paired for differences against A).
"""
import argparse
import json
import time
import warnings
from pathlib import Path

import numpy as np
from scipy.stats import rankdata
from sklearn.metrics.pairwise import euclidean_distances

from common import ALBUM_FEATURES, EMBEDDINGS, RESULTS, TABLE_NORM
from fixture import FIXTURE, make_fixture
from genres import load_genres, match_matrices
from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import AUDIO, IN_RAINBOWS_LIVE, IN_RAINBOWS_ROW, LIVE_POOL, SLIDER, STOPS
from rmr_pipeline.recs import top_k_neighbours
from rmr_pipeline.table import descriptor_cols, live_recommend, load_table, rec_matrix
from variants import Inputs, build_variants, load_inputs

CONDITIONS = (*STOPS, "audio")
AGREEMENT = ("overlap10", "spearman_full", "spearman_top100")
GENRE = ("genre_primary", "genre_any", "genre_family")
TOP = 100
N_BOOT = 1000
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
]


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
    return {"nbrs": top_k_neighbours(X), "D": D, "R": rank_rows(D),
            "top": np.argpartition(far, TOP, axis=1)[:, :TOP]}


def seed_metrics(hood: dict, ref: dict, coherence: dict[str, np.ndarray], fit: np.ndarray) -> dict[str, np.ndarray]:
    """Per-seed values of every metric for one variant in one condition (`ref` is A's)."""
    out = {name: row_nanmean(np.take_along_axis(M, hood["nbrs"], axis=1)) for name, M in coherence.items()}
    if hood is not ref:
        a, v = (np.take_along_axis(h["D"], ref["top"], axis=1) for h in (ref, hood))
        out["overlap10"] = (hood["nbrs"][:, :, None] == ref["nbrs"][:, None, :]).any(axis=2).mean(axis=1)
        out["spearman_full"] = corr_rows(ref["R"], hood["R"])
        out["spearman_top100"] = corr_rows(rankdata(a, axis=1), rankdata(v, axis=1))
        for name in AGREEMENT:
            out[name] = np.where(fit, out[name], np.nan)
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
           "wrong_spotify_album_in_pool": int((~inp.fit).sum()), "with_descriptors": int(has_desc.sum()),
           "genre_joined": int(genres["joined"].sum()), "genre_join_rate": round(float(genres["joined"].mean()), 4)}
    if inp.tracks is not None:
        ok, total = inp.tracks["n_tracks_ok"], inp.tracks["n_tracks_total"]
        out |= {"tracks_ok": int(ok.sum()), "tracks_total": int(total.sum()),
                "albums_fully_analysed": int((ok >= total).sum()), "median_tracks_ok": float(ok.median())}
    return out


def evaluate(inp: Inputs, seed: int = 0) -> tuple[dict, dict]:
    """Everything for metrics.json, and the top-10 lists per condition and variant."""
    albums = inp.albums
    dcols = descriptor_cols(albums.drop(columns="row"))
    desc = albums[dcols].to_numpy(dtype=np.float64)
    blocks, report = build_variants(inp, seed)
    genres = load_genres(albums)
    genre_M = match_matrices(genres)
    unit = desc / np.where(desc.any(axis=1), np.linalg.norm(desc, axis=1), np.nan)[:, None]
    coherence = {"audio": genre_M | {"desc_cos": (unit @ unit.T).astype(np.float32)}} | {s: genre_M for s in STOPS}
    boot = np.random.default_rng(seed).integers(0, len(albums), (N_BOOT, len(albums)))

    metrics, lists = {}, {}
    for cond in CONDITIONS:
        ref = neighbourhood(matrix(blocks["A"], desc, cond))
        if cond != "audio":
            assert np.array_equal(ref["nbrs"], top_k_neighbours(rec_matrix(albums.drop(columns="row"), SLIDER[cond])))
        base = seed_metrics(ref, ref, coherence[cond], inp.fit)
        metrics[cond], lists[cond] = {}, {}
        for name, block in blocks.items():
            if block is None and cond == "audio":
                continue
            hood = ref if name == "A" else neighbourhood(matrix(block, desc, cond))
            per_seed = seed_metrics(hood, ref, coherence[cond], inp.fit)
            metrics[cond][name] = {m: summarise(v, None if name == "A" or m in AGREEMENT else base[m], boot)
                                   for m, v in per_seed.items()}
            lists[cond][name] = hood["nbrs"]
    out = {
        "coverage": coverage(inp, genres, desc.any(axis=1), len(load_table(TABLE_NORM)["URI"].unique())),
        "agreement_seeds": int(inp.fit.sum()),
        **report,
        "floors": floors(coherence["audio"]),
        "metrics": metrics,
        "in_rainbows": in_rainbows(inp, blocks, desc),
    }
    failures = albums.loc[~genres["joined"], ["row", "Artist", "Title"]]
    return out, {"lists": lists, "genre_failures": failures}


def label(albums, i: int) -> str:
    return f"{clean_artist(albums.loc[i, 'Artist'])} — {albums.loc[i, 'Title']}"


def seeds_md(inp: Inputs, lists: dict, names: list[str]) -> str:
    """Side-by-side top 10 per listening seed at the sonic and balanced stops; bold = also in A's."""
    albums, pos = inp.albums, {int(r): i for i, r in enumerate(inp.albums["row"])}
    out = ["# Listening seeds", "", f"Top 10 per variant ({', '.join(names)}). **Bold** = also in A's top 10 "
           "at that stop. The last line counts them.", ""]
    for row in SEEDS:
        if row not in pos:
            out += [f"## row {row}: not in the pool", ""]
            continue
        i = pos[row]
        wrong = "" if inp.fit[i] else " (Spotify features of another record: A is unreliable here)"
        out += [f"## {label(albums, i)}{wrong}", ""]
        for stop in ("sonic", "balanced"):
            ref = set(lists[stop]["A"][i].tolist())
            out += [f"### {stop}", "", "| # | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
            for k in range(10):
                cells = [label(albums, j) if n == "A" or j not in ref else f"**{label(albums, j)}**"
                         for n in names for j in [int(lists[stop][n][i][k])]]
                out.append(f"| {k + 1} | " + " | ".join(c.replace("|", "/") for c in cells) + " |")
            shared = [str(len(ref & set(lists[stop][n][i].tolist()))) for n in names]
            out += ["| shared | " + " | ".join(shared) + " |", ""]
    return "\n".join(out)


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
           f"Spotify features (kept as neighbours, not used as agreement seeds or in the Ridge fit)."]
    if "tracks_ok" in cov:
        out.append(f"Tracks analysed: {cov['tracks_ok']} of {cov['tracks_total']}; "
                   f"{cov['albums_fully_analysed']} albums fully analysed; "
                   f"median {cov['median_tracks_ok']:.0f} per album.")
    out += ["", "Cells: `mean ±half-width of the 95% CI`; for coherence metrics `mean (difference vs A)`, "
            "`*` = the paired 95% CI excludes 0. `audio` = audio block alone.", "", "## Audio blocks", ""]
    out += _table(["variant", "columns", "total variance / A's"],
                  [[n, str(b["columns"]), f"{b['total_var_vs_A']:.2f}"] for n, b in res["blocks"].items()])
    for metric in (*AGREEMENT, *GENRE, "desc_cos"):
        conds = [c for c in CONDITIONS if metric in metrics[c]["A"] or metric in AGREEMENT]
        rows = [[n] + [_cell(metrics[c].get(n, {}).get(metric)) for c in conds]
                for n in names if metric not in AGREEMENT or n != "A"]
        if metric not in AGREEMENT:
            rows.append(["random neighbours"] + [f"{res['floors'][metric]:.3f}"] * len(conds))
        out += [f"## {metric}", "", *_table(["variant", *conds], rows)]
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
    p.add_argument("--features", type=Path, default=ALBUM_FEATURES)
    p.add_argument("--embeddings", type=Path, default=EMBEDDINGS)
    p.add_argument("--baseline", action="store_true", help="A and the controls on the whole catalog")
    p.add_argument("--fixture", action="store_true", help="run on the synthetic caches")
    p.add_argument("--out", type=Path)
    p.add_argument("--seed-variants", help="columns of seeds.md (default A,Cvm,D24,E; A,Z0,Zs for --baseline)")
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    t0 = time.time()
    if args.fixture:
        args.features, args.embeddings = FIXTURE / "album_features.parquet", FIXTURE / "embeddings.parquet"
        if not args.features.exists():
            make_fixture()
    if not args.baseline and not (args.features.exists() and args.embeddings.exists()):
        p.error(f"{args.features} or {args.embeddings} is missing; run aggregate.py, or pass --baseline or --fixture")
    out = args.out or (FIXTURE / "results" if args.fixture else RESULTS / "baseline" if args.baseline else RESULTS)
    inp = load_inputs(None, None) if args.baseline else load_inputs(args.features, args.embeddings)
    res, extra = evaluate(inp, args.seed)
    res["runtime_s"] = round(time.time() - t0, 1)
    shown = (args.seed_variants or ("A,Z0,Zs" if args.baseline else "A,Cvm,D24,E")).split(",")
    if missing := [n for n in shown if n not in extra["lists"]["sonic"]]:
        p.error(f"unknown --seed-variants {missing}; have {list(extra['lists']['sonic'])}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "metrics.md").write_text(metrics_md(res) + "\n", encoding="utf-8")
    (out / "seeds.md").write_text(seeds_md(inp, extra["lists"], shown) + "\n", encoding="utf-8")
    extra["genre_failures"].to_csv(out / "genre_join_failures.csv", index=False)
    print(f"{len(inp.albums)} albums, {len(extra['lists']['sonic'])} variants, {res['runtime_s']}s -> {out}")


if __name__ == "__main__":
    main()
