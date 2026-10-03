"""Three analyses of the proposed block (solution.py, D64) for the report.

CLI: python final_analyses.py [--rows FILE] [--out DIR] [--only changes,robustness,descriptors]
     -> analyses.{md,json}

changes      What changes for the user. Per stop (and the audio block alone), for A (Spotify), D64
             and D64~mp (mutual proximity): overlap@10 with A's lists, genre coherence of the top
             10 (also with the seed artist's other albums removed), the distance to the neighbours
             on Spotify's feel axes (mean |z| difference, per axis), and how concentrated the
             recommendations are (N10 = number of lists an album is in: skew, max, share never
             recommended). Differences against A are paired, CI over artists.
robustness   Does matching noise hurt? Albums whose match is flagged (`ambiguous`, `oversized`,
             `dur_off` > 0.1 against Spotify's durations, a `spotify_twin` edition, matched on
             iTunes) against clean matches: neighbour coherence under D64, and under A, whose
             features do not depend on the match. A flag that hurts shows as a smaller gain over
             A than clean albums get (difference in differences, CI over artists).
descriptors  When should an album's descriptors be imputed from audio? (a) learned.py's
             hidden-descriptor design with a dose: seeds with RICH+ descriptors query the catalog
             keeping only their m strongest descriptors (`kept`), the out-of-fold ridge prediction
             (`imputed`), the larger of the two per descriptor (`filled`), or the audio block alone;
             neighbours are judged against the seed's true descriptors and genres. (b) the real
             albums by descriptor count, same modes (query side), plain and by mutual proximity,
             judged by genre. (c) policies for the albums below N descriptors, at solution.py's
             default ranking: filling or replacing the seed's query, or replacing the album's row
             (seed and candidate): genre coherence and how often those albums are recommended.
"""
import argparse
import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path

import numpy as np
from sklearn.metrics.pairwise import euclidean_distances

from common import MATCH_DB
from evaluate import _table, matrix, overlap, row_nanmean
from learned import RICH
from rmr_pipeline.constants import SLIDER, STOPS
from simbench import FEEL, OUT, ROWS, Bench, bench, distances, hubness, mutual_proximity, nearest, pool_rows, score
from simbench import summarise
from solution import MP_STOPS, album_vectors, cached_tracks, fit, imputed_descriptors

GENRE = ("genre_primary", "genre_any", "genre_family", "genre_primary_xa", "genre_family_xa")
ROBUST = ("genre_primary", "genre_family", "desc_cos", "genre_primary_xa", "desc_cos_xa", "bal_genre_primary")
KEEP = (0, 1, 2, 3, 4, 5, 6, 8, 10)  # descriptors a rich seed keeps
BUCKETS = ((0, 2), (3, 4), (5, 6), (7, 9), (10, 999))  # real descriptor counts, inclusive
POLICY = (3, 5, 7)  # impute_below values checked
JUDGE = ("desc_cos", "genre_primary", "genre_family")


def changes(b: Bench, X: np.ndarray) -> dict:
    """Per condition and representation: per-metric summaries, paired differences against A, hubness."""
    reps = {"A": (b.A, False), "D64": (X, False), "D64~mp": (X, True)}
    out = {}
    for cond in (*STOPS, "audio"):
        per, out[cond] = {}, {}
        for name, (block, mp) in reps.items():
            D = distances(matrix(block, b.desc, cond))
            D = mutual_proximity(D) if mp else D
            nbrs, xa = nearest(D), nearest(D, ~b.same_artist)
            take = lambda m, lists: row_nanmean(np.take_along_axis(b.pair[m], lists, axis=1))  # noqa: E731
            v = {m: take(m.removesuffix("_xa"), xa if m.endswith("_xa") else nbrs) for m in GENRE}
            axes = np.nanmean(np.abs(b.feel[nbrs] - b.feel[:, None, :]), axis=1)
            v |= {"feel_mad": axes.mean(axis=1)} | {f"feel_{a}": axes[:, i] for i, a in enumerate(FEEL)}
            if name == "A":
                ref = nbrs
            else:
                v["overlap_A"] = np.where(np.isnan(b.feel[:, 0]), np.nan, overlap(nbrs, ref))
            per[name] = v
            out[cond][name] = {m: summarise(x, b) for m, x in v.items()} | {"hubness": hubness(nbrs)}
        for name in ("D64", "D64~mp"):
            out[cond][name]["vs_A"] = {m: summarise(per[name][m] - per["A"][m], b) for m in per["A"]}
        out[cond]["D64~mp"]["vs_D64"] = {m: summarise(per["D64~mp"][m] - per["D64"][m], b) for m in GENRE}
    return out


def changes_md(res: dict) -> list[str]:
    cell = lambda m: f"{m['mean']:.3f}"  # noqa: E731
    star = lambda m: f"{m['mean']:+.3f}" + "*" * (m["ci"][0] > 0 or m["ci"][1] < 0)  # noqa: E731
    out = ["## What changes for the user", "",
           "Cells: mean over seeds; `(…)` = paired difference against A, * = 95% CI (over artists) excludes 0. "
           "`_xa` = the seed artist's other albums removed. feel_mad = mean |z| difference to the neighbours on "
           "Spotify's feel axes (lower = closer). N10 = number of top-10 lists an album appears in.", ""]
    for cond, reps in res.items():
        rows = []
        for name, r in reps.items():
            vs = r.get("vs_A", {})
            diff = lambda m: f" ({star(vs[m])})" if m in vs else ""  # noqa: E731
            h = r["hubness"]
            rows.append([name, cell(r["overlap_A"]) if "overlap_A" in r else "–",
                         *(cell(r[m]) + diff(m) for m in (*GENRE, "feel_mad")),
                         f"{h['skew']:.2f}", str(h["max"]), f"{h['never']:.1%}"])
        out += [f"### {cond}", "", *_table(["", "overlap@10 with A", *GENRE, "feel_mad", "N10 skew", "N10 max",
                                            "never recommended"], rows)]
    s, a = res["sonic"]["D64"], res["sonic"]["A"]
    axes = sorted(FEEL, key=lambda x: -s["vs_A"][f"feel_{x}"]["mean"])
    out += ["### Feel axes at the sonic stop (mean |z| difference to the neighbours)", "",
            *_table(["", *FEEL], [[n, *(cell(res["sonic"][n][f"feel_{x}"]) for x in FEEL)] for n in res["sonic"]]),
            "### In plain words (computed from the tables above)", ""]
    per10 = lambda r, m: f"{10 * r[m]['mean']:.1f}"  # noqa: E731
    for stop in STOPS:
        d, base, mp = res[stop]["D64"], res[stop]["A"], res[stop]["D64~mp"]
        out.append(
            f"- **{stop}**: {per10(d, 'overlap_A')} of an album's 10 recommendations stay the same. "
            f"{per10(d, 'genre_primary')} of 10 share the seed's primary genre (now {per10(base, 'genre_primary')}), "
            f"{per10(d, 'genre_family')} its genre family (now {per10(base, 'genre_family')}); without the seed "
            f"artist's own albums {per10(d, 'genre_primary_xa')} against {per10(base, 'genre_primary_xa')}. "
            f"Feel distance {d['feel_mad']['mean']:.2f} against {base['feel_mad']['mean']:.2f} "
            f"({d['feel_mad']['mean'] / base['feel_mad']['mean'] - 1:+.0%}). Most recommended album: in "
            f"{d['hubness']['max']} lists (now {base['hubness']['max']}); never recommended: "
            f"{d['hubness']['never']:.1%} (now {base['hubness']['never']:.1%}). With mutual proximity: max "
            f"{mp['hubness']['max']}, never {mp['hubness']['never']:.1%}, primary genre "
            f"{star(mp['vs_D64']['genre_primary'])} against plain D64.")
    out += [f"- At the sonic stop the neighbours move away from the seed most on {axes[0]} "
            f"({s['feel_' + axes[0]]['mean']:.2f} against {a['feel_' + axes[0]]['mean']:.2f}), {axes[1]} and "
            f"{axes[2]}; least on {axes[-1]} ({s['feel_' + axes[-1]]['mean']:.2f} against "
            f"{a['feel_' + axes[-1]]['mean']:.2f}).", ""]
    return out


def match_flags(rows: np.ndarray) -> dict[str, np.ndarray]:
    """Album masks from match.sqlite (read-only), aligned to `rows`; `clean` = none of the flags."""
    with closing(sqlite3.connect(f"file:{MATCH_DB}?mode=ro", uri=True)) as con:
        m = {r: rest for r, *rest in con.execute("SELECT row, ambiguous, oversized, source, candidates FROM albums")}
    top = [(json.loads(m[r][3]) or [{}])[0] for r in rows]
    flags = {"ambiguous": np.array([m[r][0] == 1 for r in rows]), "oversized": np.array([m[r][1] == 1 for r in rows]),
             "dur_off": np.array([t.get("dur_off") is None or t["dur_off"] > 0.1 for t in top]),
             "spotify_twin": np.array([bool(t.get("spotify_twin")) for t in top]),
             "itunes": np.array([m[r][2] == "itunes" for r in rows])}
    flagged = np.any([flags[f] for f in ("ambiguous", "oversized", "dur_off", "spotify_twin")], axis=0)
    return {"clean": ~flagged, "any_flag": flagged} | flags


def group_gap(v: np.ndarray, group: np.ndarray, base: np.ndarray, b: Bench) -> dict:
    """Mean of `v` over `group` minus its mean over `base`, with a bootstrap CI over artists."""
    n = b.boot.shape[1]
    ok = ~np.isnan(v)
    sums = [(np.bincount(b.artist, np.where(ok & g, v, 0), n), np.bincount(b.artist, ok & g, n)) for g in (group, base)]
    with np.errstate(invalid="ignore", divide="ignore"):
        boot = np.subtract(*(t[b.boot].sum(axis=1) / c[b.boot].sum(axis=1) for t, c in sums))
        lo, hi = np.nanpercentile(boot, [2.5, 97.5])
    return {"mean": round(float(v[ok & group].mean() - v[ok & base].mean()), 4), "ci": [round(float(lo), 4), round(float(hi), 4)]}


def robustness(b: Bench, X: np.ndarray, rows: np.ndarray) -> dict:
    """Per match flag: albums, each coherence metric under D64 and under A, the gain D64 - A and
    that gain minus the clean albums' gain."""
    new, old = (score(M, rows, name=n)["seeds"] for n, M in (("D64", X), ("A", b.A)))
    flags = match_flags(rows)
    out = {}
    for name, mask in flags.items():
        out[name] = {"albums": int(mask.sum())}
        for m in ROBUST:
            pick = lambda v: summarise(np.where(mask, v, np.nan), b)  # noqa: E731
            out[name][m] = {"D64": pick(new[m]), "A": pick(old[m]), "gain": pick(new[m] - old[m])}
            if name != "clean":
                out[name][m] |= {"gain_vs_clean": group_gap(new[m] - old[m], mask, flags["clean"], b),
                                 "D64_vs_clean": group_gap(new[m], mask, flags["clean"], b)}
    return out


def robustness_md(res: dict) -> list[str]:
    star = lambda m: f"{m['mean']:+.3f}" + "*" * (m["ci"][0] > 0 or m["ci"][1] < 0)  # noqa: E731
    out = ["## Matching noise: flagged against clean matches", "",
           "Cells: `D64 / A (gain over A; that gain minus the clean albums' gain)`, * = 95% CI (over artists) of the "
           "last difference excludes 0. A's features do not depend on the Deezer / iTunes match, so a flag that "
           "hurts the new block shows as a negative starred last number. `dur_off`: mean track duration more than "
           "10% from Spotify's (or unknown).", ""]
    rows = [[f"{name} ({r['albums']})", *(
        f"{r[m]['D64']['mean']:.3f} / {r[m]['A']['mean']:.3f} ({r[m]['gain']['mean']:+.3f}"
        + (f"; {star(r[m]['gain_vs_clean'])})" if "gain_vs_clean" in r[m] else ")") for m in ROBUST)]
        for name, r in res.items()]
    return out + _table(["match (albums)", *ROBUST], rows)


def _lists(Q: np.ndarray, G: np.ndarray, mp: bool = False) -> np.ndarray:
    """Top 10 of every query row in the gallery (self excluded), optionally by mutual proximity."""
    D = euclidean_distances(Q, G, squared=True).astype(np.float32)
    np.fill_diagonal(D, np.inf)
    return nearest(mutual_proximity(D) if mp else D)


def _judge(nbrs: np.ndarray, seeds: np.ndarray, b: Bench, metrics=JUDGE) -> dict:
    """The lists of `seeds` judged against true descriptors and genres (metrics no seed has are left out)."""
    v = {m: np.where(seeds, row_nanmean(np.take_along_axis(b.pair[m], nbrs, axis=1)), np.nan) for m in metrics}
    return {m: summarise(x, b) for m, x in v.items() if not np.isnan(x).all()}


def descriptors(b: Bench, X: np.ndarray, V: np.ndarray) -> dict:
    """The three descriptor-imputation analyses of the module docstring, on the D64 block."""
    desc, pred = b.desc, imputed_descriptors(V, b.desc, b.artist)
    count = (desc > 0).sum(axis=1)
    rank = np.argsort(np.argsort(-desc, axis=1), axis=1)
    rich = count >= RICH
    out = {"rich_seeds": int(rich.sum()), "truncated": {}, "observed": {}, "policy": {}}
    genre = lambda nbrs, m: row_nanmean(np.take_along_axis(b.pair[m], nbrs, axis=1))  # noqa: E731
    for stop in ("balanced", "mood"):
        s3 = SLIDER[stop] ** 3
        G = np.hstack([X, desc / s3])
        query = lambda d: np.hstack([X, d / s3])  # noqa: E731
        res = {"audio": _judge(_lists(X, X), rich, b), "imputed": _judge(_lists(query(pred), G), rich, b)}
        for m in KEEP:
            kept = np.where(rank < m, desc, 0)
            res[f"kept{m}"] = _judge(_lists(query(kept), G), rich, b)
            res[f"filled{m}"] = _judge(_lists(query(np.maximum(kept, pred)), G), rich, b)
        out["truncated"][stop] = res | {"true": _judge(_lists(G, G), rich, b)}

        modes = {"as_is": G, "imputed": query(pred), "filled": query(np.maximum(desc, pred))}
        lists = {"audio": _lists(X, X)} | {n + "~mp" * mp: _lists(Q, G, mp) for mp in (False, True) for n, Q in modes.items()}
        out["observed"][stop] = {}
        for lo, hi in BUCKETS:
            seeds = (count >= lo) & (count <= hi)
            out["observed"][stop][f"{lo}-{hi}" if hi < 999 else f"{lo}+"] = {"albums": int(seeds.sum())} | {
                n: _judge(nbrs, seeds, b, JUDGE[1:]) for n, nbrs in lists.items()}

        mp = stop in MP_STOPS
        base = lists["as_is" + "~mp" * mp]
        n10 = lambda nbrs: np.bincount(nbrs.ravel(), minlength=len(X))  # noqa: E731
        out["policy"][stop] = {"mutual_proximity": mp}
        for below in POLICY:
            poor = (count < below)[:, None]
            variants = {"filled": (np.where(poor, np.maximum(desc, pred), desc), desc),
                        "imputed": (np.where(poor, pred, desc), desc),
                        "imputed_both_roles": (np.where(poor, pred, desc),) * 2}
            poor = poor[:, 0]
            out["policy"][stop][str(below)] = {"albums": int(poor.sum()), "n10_as_is": round(float(n10(base)[poor].mean()), 2)}
            for name, (q, g) in variants.items():
                nbrs = _lists(query(q), query(g), mp)
                out["policy"][stop][str(below)][name] = {"n10": round(float(n10(nbrs)[poor].mean()), 2)} | {
                    f"{m}_{who}": summarise(np.where(mask, genre(nbrs, m) - genre(base, m), np.nan), b)
                    for m in JUDGE[1:] for who, mask in (("affected", poor), ("others", ~poor))}
    return out


def descriptors_md(res: dict) -> list[str]:
    cell = lambda m: "–" if m is None else f"{m['mean']:.3f} ±{(m['ci'][1] - m['ci'][0]) / 2:.3f}"  # noqa: E731
    star = lambda m: f"{m['mean']:+.3f}" + "*" * (m["ci"][0] > 0 or m["ci"][1] < 0)  # noqa: E731
    out = ["## Descriptor imputation: below how many descriptors?", "",
           f"### (a) Rich seeds ({res['rich_seeds']} with {RICH}+ descriptors) keeping their m strongest", "",
           "`kept m`: the seed queries with only its m strongest descriptors; `filled m`: those, plus the audio "
           "prediction where it is larger; `imputed`: the prediction alone; `audio`: no descriptors on either side; "
           "`true`: all of them (desc_cos is then circular). The catalog keeps its true descriptors. Judged against "
           "the seed's true descriptors and genres. Plain euclidean ranking.", ""]
    for stop, r in res["truncated"].items():
        rows = [[n, *(cell(r[n].get(m)) for m in JUDGE)] for n in ("audio", "imputed")]
        rows += [[f"{mode} {m}", *(cell(r[f"{mode}{m}"].get(j)) for j in JUDGE)] for m in KEEP for mode in ("kept", "filled")]
        out += [f"**{stop} stop**", "", *_table(["seed descriptors", *JUDGE], rows + [["true", *(cell(r["true"][m]) for m in JUDGE)]])]
    out += ["### (b) Real albums by descriptor count", "",
            "Cells: genre_primary / genre_family of the top 10. `as_is` is the site's recipe; `imputed` / `filled` "
            "change the seed's query only; `~mp`: ranked by mutual proximity.", ""]
    for stop, r in res["observed"].items():
        modes = [n for n in next(iter(r.values())) if n != "albums"]
        out += [f"**{stop} stop**", "", *_table(["descriptors (albums)", *modes], [
            [f"{k} ({g['albums']})", *(" / ".join(f"{g[mode][m]['mean']:.3f}" for m in JUDGE[1:]) for mode in modes)]
            for k, g in r.items()])]
    out += ["### (c) Policies for albums with fewer than N descriptors", "",
            "`filled` / `imputed`: the seed's query only (solution.py's `--impute-below N` is `filled`); "
            "`imputed_both_roles`: the album's row replaced, as seed and as candidate. Ranking as solution.py's default "
            "at that stop. Cells: paired change against no imputation (* = 95% CI excludes 0); N10 = mean number of "
            "lists the affected albums are in (10 = an average album).", ""]
    for stop, r in res["policy"].items():
        rows = [[f"{n} ({g['albums']})", name, *(star(v[f"{m}_{who}"]) for m in JUDGE[1:] for who in ("affected", "others")),
                 f"{g['n10_as_is']:.1f}", f"{v['n10']:.1f}"]
                for n, g in r.items() if n != "mutual_proximity" for name, v in g.items() if isinstance(v, dict)]
        out += [f"**{stop} stop** ({'mutual proximity' if r['mutual_proximity'] else 'plain'} ranking)", "", *_table(
            ["N (albums affected)", "policy", *(f"{m} {who}" for m in JUDGE[1:] for who in ("affected", "others")),
             "N10 before", "N10 after"], rows)]
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--rows", type=Path, default=ROWS, help="album snapshot (written if missing)")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--only", default="changes,robustness,descriptors")
    args = p.parse_args()
    t0 = time.time()
    rows = pool_rows(args.rows)
    b, tracks = bench(rows), cached_tracks(rows)
    X = fit(tracks).transform(tracks)[1]
    res, md = {"albums": len(rows)}, ["# The proposed block (D64): analyses for the report", "",
                                      f"{len(rows)} albums, 4 tracks per album.", ""]
    for name, run, render in (("changes", lambda: changes(b, X), changes_md),
                              ("robustness", lambda: robustness(b, X, rows), robustness_md),
                              ("descriptors", lambda: descriptors(b, X, album_vectors(tracks)[1]), descriptors_md)):
        if name in args.only.split(","):
            res[name] = run()
            md += render(res[name])
            print(f"{name}: {time.time() - t0:.0f}s", flush=True)
    res["runtime_s"] = round(time.time() - t0, 1)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "analyses.json").write_text(json.dumps(res, indent=1) + "\n", encoding="utf-8")
    (args.out / "analyses.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"{len(rows)} albums, {res['runtime_s']}s -> {args.out / 'analyses.md'}")


if __name__ == "__main__":
    main()
