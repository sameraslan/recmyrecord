"""Clip-length check: how much of an album do a few 30-second previews capture?

CLI:
  python clip_length.py                 first n / spread n tracks vs every track -> results/clip_length.{md,json}
  python clip_length.py --mode pass1    first track vs the extractor's first pass (4 spread tracks), usable
                                        while the extraction is still running -> results/clip_length_pass1.*
  python clip_length.py --fixture [--variants Ball,Cvm,D24,E] [--out DIR] [--min-albums 100]

Album features from a subset of the tracks are compared with a reference:
  full   reference = the mean over all tracks, on albums with every track analysed (2 to 30
         tracks; longer albums are capped by the extractor, so never complete). Subsets: the
         first n tracks in album order, and the n tracks the extractor takes first (track 0, then
         spread evenly: what `extract.py --max-tracks-per-album n` gives), n in 1, 2, 4, 8.
  pass1  reference = the first pass (the 4 tracks with prio < 4), on albums whose first pass is
         complete. Subsets: the first track, and the first two tracks in priority order.
Per subset:
  per scalar      Pearson r, bias (mean signed difference) and MAE, in catalog standard deviations
  per embedding   cosine between the subset and reference vectors, raw and catalog-mean-centred
  downstream      overlap@10 between the recommendations built from subset features and from the
                  reference (each variant rebuilt from scratch on the subset features, Ridge and
                  PCA refitted, as a few-tracks-per-album deployment would)
Everything is broken down by mean track duration tercile, genre family, a stratified sample of
about 100 albums, and long-track jazz and prog (a 30 s clip covers little of a 15-minute track).
Both sides are 30-second previews: this measures how many previews an album needs, not what a
preview misses of its own track.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from aggregate import aggregate, first, in_priority_order
from common import FEATURES_DB, MATCH_DB, RESULTS
from evaluate import CONDITIONS, _table, matrix, overlap
from fixture import FIXTURE, make_fixture
from genres import load_genres
from rmr_pipeline.recs import top_k_neighbours
from rmr_pipeline.table import descriptor_cols
from variants import Inputs, build_variants, make_inputs

NS = (1, 2, 4, 8)
PASS = 4  # tracks per album in the extractor's first pass
CAP = 30  # tracks per album the extractor analyses at most
MIN_GROUP = 30  # smallest genre family reported
DETAIL = ("all", "stratified_100", "tracks_long", "jazz_prog_long")  # groups with a per-scalar table


def album_features_from_tracks(selector, mode: str, dbs: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Album features and embeddings (the cache parquet layouts) averaged over the tracks that
    `selector(n) -> positions` picks among each album's analysed tracks in album order (None =
    all), within the first pass only for mode `pass1`. `dbs` = aggregate's db / match_db paths."""
    return aggregate(selector, **dbs, prio_below=PASS if mode == "pass1" else None)


def subsets(mode: str) -> dict:
    """Name -> selector of the track subsets compared with the reference."""
    if mode == "pass1":
        return {"first_1": first(1), "priority_2": in_priority_order(2)}
    return {f"first_{n}": first(n) for n in NS} | {f"priority_{n}": in_priority_order(n) for n in NS[1:]}


def complete_rows(f: pd.DataFrame, mode: str) -> pd.Series:
    """`row` of the albums whose reference is complete: every track analysed (first-pass track
    for `pass1`), at least two of them, and for `full` no more than the extractor's cap."""
    total = f["n_tracks_total"]
    need = np.minimum(total, PASS) if mode == "pass1" else total.where(total <= CAP)
    return f.loc[(f["n_tracks_ok"] == need) & (f["n_tracks_ok"] >= 2), "row"]


def make_groups(full: Inputs, seed: int) -> dict[str, np.ndarray]:
    """Boolean album masks: all, a duration-stratified sample of ~100, duration terciles,
    genre families with at least MIN_GROUP albums, and long-track jazz and prog."""
    duration = full.scalars["duration_ms"] if "duration_ms" in full.scalars else full.albums["duration_ms"]
    tercile = pd.qcut(duration, 3, labels=["short", "mid", "long"]).to_numpy()
    genres = load_genres(full.albums)
    rng = np.random.default_rng(seed)
    sample = np.zeros(len(tercile), dtype=bool)
    for t in ("short", "mid", "long"):
        members = np.flatnonzero(tercile == t)
        sample[rng.choice(members, min(34, len(members)), replace=False)] = True
    out = {"all": np.ones(len(tercile), dtype=bool), "stratified_100": sample}
    out |= {f"tracks_{t}": tercile == t for t in ("short", "mid", "long")}
    sizes = genres["family"].value_counts()
    out |= {f"family: {f}": (genres["family"] == f).to_numpy() for f in sizes.index[sizes >= MIN_GROUP]}
    prog = genres["primary"].str.contains("prog", case=False, na=False).to_numpy()
    long_jp = ((genres["family"] == "jazz").to_numpy() | prog) & (tercile == "long")
    return out | {"jazz_prog_long": long_jp, "not_jazz_prog_long": ~long_jp}


def scalar_stats(part: pd.DataFrame, full: pd.DataFrame, mask: np.ndarray) -> pd.DataFrame:
    """Per scalar over the masked albums: Pearson r, bias and MAE of subset vs full-album values,
    the last two in standard deviations of the full-album value over the whole pool."""
    z = ((part - full) / full.std(ddof=0))[mask]
    r = [np.corrcoef(part[c][mask], full[c][mask])[0, 1] for c in full.columns]
    return pd.DataFrame({"r": r, "bias": z.mean().to_numpy(), "mae": z.abs().mean().to_numpy()}, index=full.columns)


def cosine(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Row-wise cosine similarity."""
    return (a * b).sum(axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))


def recommendations(inp: Inputs, names: list[str], seed: int) -> dict[str, dict[str, np.ndarray]]:
    """Top-10 lists per condition for the named variants built from `inp`."""
    desc = inp.albums[descriptor_cols(inp.albums.drop(columns="row"))].to_numpy(dtype=np.float64)
    blocks, _ = build_variants(inp, seed)
    return {c: {v: top_k_neighbours(matrix(blocks[v], desc, c)) for v in names} for c in CONDITIONS}


def compare(part: Inputs, full: Inputs, full_recs: dict, groups: dict, names: list[str], seed: int) -> dict:
    """Subset-vs-reference statistics for every album group."""
    cols = [c for c in full.scalars.columns if c in part.scalars.columns]
    recs = recommendations(part, names, seed)
    shared = {v: {c: overlap(recs[c][v], full_recs[c][v]) for c in CONDITIONS} for v in names}
    cos = {}
    for e, E in full.emb.items():
        centre = E.mean(axis=0)
        cos[e] = {"raw": cosine(part.emb[e], E), "centred": cosine(part.emb[e] - centre, E - centre)}
    out = {}
    for g, mask in groups.items():
        s = scalar_stats(part.scalars[cols], full.scalars[cols], mask)
        out[g] = {
            "albums": int(mask.sum()),
            "median_r": round(float(s["r"].median()), 4),
            "mean_abs_bias": round(float(s["bias"].abs().mean()), 4),
            "mean_mae": round(float(s["mae"].mean()), 4),
            "embedding_cosine": {e: {k: round(float(v[mask].mean()), 4) for k, v in d.items()} for e, d in cos.items()},
            "overlap10": {v: {c: round(float(o[mask].mean()), 4) for c, o in d.items()} for v, d in shared.items()},
        }
        if g in DETAIL or g == "not_jazz_prog_long":
            out[g]["scalars"] = s.round(4).to_dict(orient="index")
    return out


def run(names: list[str], mode: str, dbs: dict, min_albums: int, seed: int = 0) -> dict:
    """The whole check: every subset against the reference features."""
    f, e = album_features_from_tracks(None, mode, dbs)
    rows = complete_rows(f, mode)
    if len(rows) < min_albums:
        raise SystemExit(f"only {len(rows)} of {len(f)} albums have a complete "
                         f"{'first pass' if mode == 'pass1' else 'track list'} analysed so far (need {min_albums}); "
                         + ("wait for the extraction" if mode == "pass1" else "try --mode pass1, or wait"))
    full = make_inputs(f, e, rows)
    groups = make_groups(full, seed)
    full_recs = recommendations(full, names, seed)
    res = {"mode": mode, "albums": len(full.albums), "albums_with_features": len(f), "variants": names,
           "groups": {g: int(m.sum()) for g, m in groups.items()}, "subsets": {}}
    for name, selector in subsets(mode).items():
        part = make_inputs(*album_features_from_tracks(selector, mode, dbs), rows)
        res["subsets"][name] = compare(part, full, full_recs, groups, names, seed)
        print(f"{name} done", flush=True)
    return res


def report(res: dict) -> str:
    """results/clip_length.md."""
    names, subsets = res["variants"], res["subsets"]
    one = subsets["first_1"]
    emb = list(one["all"]["embedding_cosine"])
    shown = [(v, c) for v in names for c in ("sonic", "balanced")]

    def summary(g: dict) -> list[str]:
        return [f"{g['median_r']:.3f}", f"{g['mean_abs_bias']:.3f}", f"{g['mean_mae']:.3f}",
                *(f"{g['embedding_cosine'][e]['centred']:.3f}" for e in emb),
                *(f"{g['overlap10'][v][c]:.3f}" for v, c in shown)]

    head = ["median r", "mean abs bias", "mean MAE", *(f"{e} cos" for e in emb), *(f"{v} {c}" for v, c in shown)]
    reference = ("the first pass (4 spread tracks); albums with a complete first pass" if res["mode"] == "pass1"
                 else "every track; albums with every track analysed (2 to 30 tracks)")
    out = ["# Clip length: a few previews vs the whole album", "",
           f"Reference: {reference}. {res['albums']} of the {res['albums_with_features']} albums with features "
           "qualify. Bias and MAE are in catalog standard deviations; embedding cosine is catalog-mean-centred; "
           "the variant columns are overlap@10 between recommendations from subset features and from the reference. "
           "`priority n` = track 0 plus tracks spread evenly through the album, as the extractor takes them.", "",
           "## How many tracks are enough (all albums)", "",
           *_table(["subset", *head], [[k.replace("_", " "), *summary(s["all"])] for k, s in subsets.items()]),
           "## First track only, by album group", "",
           *_table(["group", "albums", *head], [[g, str(d["albums"]), *summary(d)] for g, d in one.items()]),
           "## First track only, per scalar", "",
           "`r / bias / MAE` per group; positive bias = the first track reads higher than the reference.", ""]
    cell = lambda s: f"{s['r']:.2f} / {s['bias']:+.2f} / {s['mae']:.2f}"  # noqa: E731
    out += _table(["scalar", *DETAIL], [[c, *(cell(one[g]["scalars"][c]) for g in DETAIL)]
                                        for c in one["all"]["scalars"]])
    jp, rest = one["jazz_prog_long"]["scalars"], one["not_jazz_prog_long"]["scalars"]
    worst = sorted(jp, key=lambda c: -abs(jp[c]["bias"] - rest[c]["bias"]))[:8]
    out += ["## Long-track jazz and prog vs the rest (first track only)", "",
            f"{one['jazz_prog_long']['albums']} albums. The scalars whose bias differs most from the other albums':",
            "",
            *_table(["scalar", "bias jazz/prog long", "bias others", "MAE jazz/prog long", "MAE others"],
                    [[c, f"{jp[c]['bias']:+.2f}", f"{rest[c]['bias']:+.2f}", f"{jp[c]['mae']:.2f}",
                      f"{rest[c]['mae']:.2f}"] for c in worst])]
    return "\n".join(out)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--mode", default="full", choices=("full", "pass1"),
                   help="reference: every track, or the first pass")
    p.add_argument("--fixture", action="store_true", help="run on the synthetic caches")
    p.add_argument("--variants", default="Ball,Cvm,D24,E", help="variants for the downstream overlap")
    p.add_argument("--min-albums", type=int, default=100, help="stop when fewer albums have a complete reference")
    p.add_argument("--out", type=Path)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    dbs = {"db": FEATURES_DB, "match_db": MATCH_DB}
    if args.fixture:
        dbs = {"db": FIXTURE / "features.sqlite", "match_db": FIXTURE / "match.sqlite"}
        if not dbs["db"].exists():
            make_fixture()
    out = args.out or (FIXTURE / "results" if args.fixture else RESULTS)
    res = run(args.variants.split(","), args.mode, dbs, args.min_albums, args.seed)
    name = "clip_length" + ("_pass1" if args.mode == "pass1" else "")
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{name}.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / f"{name}.md").write_text(report(res) + "\n", encoding="utf-8")
    print(f"{res['albums']} albums -> {out / name}.md")


if __name__ == "__main__":
    main()
