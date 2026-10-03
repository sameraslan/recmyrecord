"""Does the conclusion depend on how many tracks per album are analysed?

CLI: python tracks_per_album.py [--variants Ball,Cvm,D24,D64,Dn24,E,F] [--rows FILE] [--out DIR] [--fixture]
     -> tracks_per_album.{md,json}

Album features are rebuilt from the first 1, 2 and 4 tracks in the extractor's priority order
(track 0, then tracks spread through the album) and every variant is refitted each time (Ridge,
PCA), on the albums that have features at every count. Per count and variant, at each condition:
overlap@10 with A, genre coherence, the audio-only descriptor cosine, and `same_lists`: how much
of the variant's own 4-track top 10 it already returns. If the ranking of the variants and their
coherence hold from 2 to 4 tracks, analysing more tracks will not change the recommendation.
"""
import argparse
import json
from pathlib import Path

import numpy as np

from aggregate import aggregate
from common import FEATURES_DB, MATCH_DB, RESULTS
from evaluate import CONDITIONS, GENRE, _table, coherence_matrices, matrix, overlap, row_nanmean
from fixture import FIXTURE
from rmr_pipeline.recs import top_k_neighbours
from simbench import pool_rows
from variants import build_variants, make_inputs

COUNTS = (1, 2, 4)


def run(names: list[str], dbs: dict, seed: int = 0, snapshot=None) -> dict:
    """Every metric per track count, variant and condition; A (which no count changes) under "A".
    `snapshot` restricts the pool to those rows."""
    frames = {k: aggregate(**dbs, prio_below=k) for k in COUNTS}
    rows = set.intersection(*(set(f["row"]) for f, _ in frames.values()))
    if snapshot is not None:
        rows &= set(snapshot.tolist())
    res, lists = {"albums": len(rows), "variants": names, "counts": {}}, {}
    for k in COUNTS:
        inp = make_inputs(*frames[k], rows)
        blocks, _ = build_variants(inp, seed)
        if k == COUNTS[0]:
            pool, seeds = inp.albums["row"].to_numpy(), inp.seeds["all"]
            desc, _, coherence = coherence_matrices(inp.albums)
            ref = {c: top_k_neighbours(matrix(blocks["A"], desc, c)) for c in CONDITIONS}

            def measure(nbrs: np.ndarray, cond: str) -> dict:
                out = {"overlap10": round(float(overlap(nbrs, ref[cond])[seeds].mean()), 4)}
                return out | {m: round(float(np.nanmean(row_nanmean(np.take_along_axis(M, nbrs, axis=1)))), 4)
                              for m, M in coherence[cond].items()}

            res["A"] = {c: measure(ref[c], c) for c in CONDITIONS}
        assert np.array_equal(pool, inp.albums["row"].to_numpy())
        lists[k] = {v: {c: top_k_neighbours(matrix(blocks[v], desc, c)) for c in CONDITIONS} for v in names}
        res["counts"][str(k)] = {v: {c: measure(n, c) for c, n in by_cond.items()} for v, by_cond in lists[k].items()}
        print(f"{k} tracks done", flush=True)
    for k in COUNTS:
        for v in names:
            for c in CONDITIONS:
                same = overlap(lists[k][v][c], lists[COUNTS[-1]][v][c]).mean()
                res["counts"][str(k)][v][c]["same_lists"] = round(float(same), 4)
    return res


def report(res: dict) -> str:
    """tracks_per_album.md: one row per variant and track count, sonic and balanced side by side."""
    shown = [(m, c) for m in ("overlap10", *GENRE) for c in ("sonic", "balanced")]
    cols = [*shown, ("desc_cos", "audio"), ("same_lists", "sonic"), ("same_lists", "balanced")]
    cells = lambda d: [f"{d[c][m]:.3f}" if m in d[c] else "–" for m, c in cols]  # noqa: E731
    rows = [["A", "–", *cells(res["A"])]]
    rows += [[v, k, *cells(by_variant[v])] for v in res["variants"] for k, by_variant in res["counts"].items()]
    return "\n".join([
        "# Tracks per album", "",
        f"{res['albums']} albums. Features from the first 1, 2 and 4 tracks in priority order (track 0, then spread "
        "through the album); every variant refitted at each count. `overlap10` is with A's lists, `same_lists` with "
        "the variant's own lists at 4 tracks; columns are `metric stop`. A does not depend on the count.", "",
        *_table(["variant", "tracks", *(f"{m} {c}" for m, c in cols)], rows)])


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--variants", default="Ball,Cvm,D24,D64,Dn24,E,F")
    p.add_argument("--rows", type=Path, help="album snapshot to restrict the pool to (see simbench.pool_rows)")
    p.add_argument("--fixture", action="store_true", help="run on the synthetic caches")
    p.add_argument("--out", type=Path)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    dbs = {"db": FIXTURE / "features.sqlite", "match_db": FIXTURE / "match.sqlite"} if args.fixture else {
        "db": FEATURES_DB, "match_db": MATCH_DB}
    out = args.out or (FIXTURE / "results" if args.fixture else RESULTS)
    res = run(args.variants.split(","), dbs, args.seed, pool_rows(args.rows) if args.rows else None)
    out.mkdir(parents=True, exist_ok=True)
    (out / "tracks_per_album.json").write_text(json.dumps(res, indent=1) + "\n", encoding="utf-8")
    (out / "tracks_per_album.md").write_text(report(res) + "\n", encoding="utf-8")
    print(f"{res['albums']} albums -> {out / 'tracks_per_album.md'}")


if __name__ == "__main__":
    main()
