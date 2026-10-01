"""Clip-length check: how much of an album do a few 30-second previews capture?

CLI: python clip_length.py --fixture [--variants Ball,Cvm,D24,E] [--out DIR]

On albums with every track analysed (two tracks or more), album features from a subset of the
tracks are compared with the mean over all of them. Subsets: the first n tracks in album order
and n tracks spread evenly over the album, n in 1, 2, 4, 8 ("spread 1" is the middle track).
  per scalar      Pearson r, bias (mean signed difference) and MAE, in catalog standard deviations
  per embedding   cosine between the subset and full-album vectors, raw and catalog-mean-centred
  downstream      overlap@10 between the recommendations built from subset features and from
                  full features (each variant rebuilt from scratch on the subset features,
                  Ridge and PCA refitted, as a one-track-per-album deployment would)
Everything is broken down by mean track duration tercile, genre family, a stratified sample of
about 100 albums, and long-track jazz and prog (a 30 s clip covers little of a 15-minute track).
"""
import argparse
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from common import RESULTS
from evaluate import CONDITIONS, _table, matrix
from fixture import FIXTURE, make_fixture
from genres import load_genres
from rmr_pipeline.recs import top_k_neighbours
from rmr_pipeline.table import descriptor_cols
from variants import Inputs, build_variants, make_inputs

NS = (1, 2, 4, 8)
MIN_GROUP = 30  # smallest genre family reported
DETAIL = ("all", "stratified_100", "tracks_long", "jazz_prog_long")  # groups with a per-scalar table


def first(k: int):
    """Selector: the first k tracks."""
    return lambda n: np.arange(min(k, n))


def spread(k: int):
    """Selector: k tracks at the centres of k equal stretches of the album."""
    return lambda n: ((np.arange(min(k, n)) + 0.5) * n / min(k, n)).astype(int)


def every(n: int) -> np.ndarray:
    """Selector: all tracks."""
    return np.arange(n)


@lru_cache(maxsize=1)
def _fixture_tracks() -> tuple[pd.DataFrame, dict[str, np.ndarray]]:
    """The fixture's per-track scalars (sorted by row, track_idx) and embeddings."""
    return pd.read_parquet(FIXTURE / "tracks.parquet"), {"effnet": np.load(FIXTURE / "tracks_effnet.npy")}


def album_features_from_tracks(selector) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Album features and embeddings (the cache parquet layouts) averaged over the tracks that
    `selector(n) -> positions` picks among each album's n analysed tracks in album order.
    `n_tracks_ok` stays the number of analysed tracks. This is the only place that touches
    per-track data: it reads the fixture, and is where aggregate.py plugs in for real data."""
    tracks, embs = _fixture_tracks()
    sizes = tracks.groupby("row", sort=False).size()
    picks = [selector(n) for n in sizes]
    starts = np.cumsum(sizes.to_numpy()) - sizes.to_numpy()
    take = np.concatenate([s + p for s, p in zip(starts, picks)])
    counts = np.array([len(p) for p in picks])
    offsets = np.cumsum(counts) - counts
    ids = pd.DataFrame({"row": sizes.index, "n_tracks_ok": sizes.to_numpy(),
                        "n_tracks_total": tracks["n_tracks_total"].to_numpy()[starts]})
    means = tracks.iloc[take].groupby("row", sort=False).mean().drop(columns=["track_idx", "n_tracks_total"])
    e = ids[["row", "n_tracks_ok"]].copy()
    for name, E in embs.items():
        e[name] = list(np.add.reduceat(E[take], offsets, axis=0) / counts[:, None])
    return pd.concat([ids, means.reset_index(drop=True)], axis=1), e


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
    """Subset-vs-full statistics for every album group."""
    cols = [c for c in full.scalars.columns if c in part.scalars.columns]
    recs = recommendations(part, names, seed)
    overlap = {v: {c: (recs[c][v][:, :, None] == full_recs[c][v][:, None, :]).any(axis=2).mean(axis=1)
                   for c in CONDITIONS} for v in names}
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
            "overlap10": {v: {c: round(float(o[mask].mean()), 4) for c, o in d.items()} for v, d in overlap.items()},
        }
        if g in DETAIL or g == "not_jazz_prog_long":
            out[g]["scalars"] = s.round(4).to_dict(orient="index")
    return out


def run(names: list[str], seed: int = 0) -> dict:
    """The whole check: every subset scheme against the full-album features."""
    f, e = album_features_from_tracks(every)
    rows = f.loc[(f["n_tracks_ok"] == f["n_tracks_total"]) & (f["n_tracks_ok"] >= 2), "row"]
    full = make_inputs(f, e, rows)
    groups = make_groups(full, seed)
    full_recs = recommendations(full, names, seed)
    res = {"albums_fully_analysed": len(full.albums), "variants": names,
           "groups": {g: int(m.sum()) for g, m in groups.items()}, "subsets": {}}
    for scheme, selector in (("first", first), ("spread", spread)):
        for n in NS:
            part = make_inputs(*album_features_from_tracks(selector(n)), rows)
            res["subsets"][f"{scheme}_{n}"] = compare(part, full, full_recs, groups, names, seed)
            print(f"{scheme} {n} done", flush=True)
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
    out = ["# Clip length: a few previews vs the whole album", "",
           f"{res['albums_fully_analysed']} albums with every track analysed (two or more tracks). Bias and MAE are in "
           "catalog standard deviations; embedding cosine is catalog-mean-centred; the variant columns are overlap@10 "
           "between recommendations from subset features and from full-album features.", "",
           "## How many tracks are enough (all albums)", "",
           *_table(["subset", *head], [[k.replace("_", " "), *summary(s["all"])] for k, s in subsets.items()]),
           "## First track only, by album group", "",
           *_table(["group", "albums", *head], [[g, str(d["albums"]), *summary(d)] for g, d in one.items()]),
           "## First track only, per scalar", "",
           "`r / bias / MAE` per group; positive bias = the first track reads higher than the album.", ""]
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
    p.add_argument("--fixture", action="store_true", help="run on the synthetic per-track caches")
    p.add_argument("--variants", default="Ball,Cvm,D24,E", help="variants for the downstream overlap")
    p.add_argument("--out", type=Path)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    if not args.fixture:
        p.error("per-track features come from the fixture until aggregate.py is wired into "
                "album_features_from_tracks; pass --fixture")
    if not (FIXTURE / "tracks.parquet").exists():
        make_fixture()
    out = args.out or (FIXTURE / "results" if args.fixture else RESULTS)
    res = run(args.variants.split(","), args.seed)
    out.mkdir(parents=True, exist_ok=True)
    (out / "clip_length.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "clip_length.md").write_text(report(res) + "\n", encoding="utf-8")
    print(f"{res['albums_fully_analysed']} albums -> {out}")


if __name__ == "__main__":
    main()
