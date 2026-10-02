"""The proposed replacement for the Spotify audio block, end to end (proof of concept).

CLI:
  python solution.py fit     [--k 64] [--rows FILE] [--dir cache/solution] [--publish DIR]
  python solution.py holdout [--k 64] [--rows FILE] [--out DIR]      -> holdout.{md,json}
  python solution.py recs    [--mp sonic,balanced,mood | --mp ""] [--impute-below N] [--dir cache/solution]

Recipe (variant D64 of variants.py, with the fitted pieces kept so that it applies to new albums):
  per album   mean of the Discogs-EffNet embeddings of its first 4 previews in the extractor's
              priority order (track 0, then spread through the album), L2-normalised
  fit         centre on the catalog mean, PCA to k = 64, one scale factor so that the block's total
              variance equals the Spotify block's on the same albums: the slider stops keep their
              meaning. Saved as transform.npz (mean, components, scale, rows, model, tracks).
  transform   the same for any album from its track embeddings alone: the path for a NEW album is
              match.py -> previews -> extract.py (EffNet) -> Transform.transform.
  recommend   [block | descriptors / slider**3], euclidean top 10 per stop, as the site; at the
              stops in `mp` the distances are first rescaled by mutual proximity (hubness reduction).
              `impute_below` N > 0: an album with fewer than N descriptors queries with its
              descriptors filled up from the audio (per descriptor, the larger of its own weight
              and an out-of-fold ridge prediction); as a candidate it keeps its own. Off by
              default; 5 is the value final_analyses.py supports (see analyses.md).

`holdout` is the new-album test: 5 folds grouped by artist; each fold's transform is fitted on 80%
of the albums and applied to all of them, and the held-out 20% are scored as seeds (simbench
metrics) against what they get from the transform fitted on everything.

`recs` writes recs.json in the site's shape ({stop: 10 album ids per album}, ids = positions in
albums.json = positions in common.load_albums()) and meta.json. Albums WITHOUT previews (unmatched,
or matched but nothing analysed) have no audio block and Spotify's cannot be mixed in (another
space). Policy, the simplest defensible one: as seeds they get descriptor-only neighbours over the
whole catalog (the same list at every stop); they are never candidates in another album's list.
They are listed under `no_audio` in meta.json.
"""
import argparse
import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.metrics.pairwise import euclidean_distances
from sklearn.model_selection import GroupKFold

from aggregate import load_tracks
from common import CACHE, load_albums
from evaluate import _table, matrix, overlap
from learned import FOLDS, regressor
from rmr_pipeline.constants import AUDIO, STOPS
from rmr_pipeline.recs import top_k_neighbours
from rmr_pipeline.table import descriptor_cols
from simbench import MIN_DESC, bench, distances, hubness, mutual_proximity, nearest, pool_rows, score, summarise
from variants import total_var

DIR = CACHE / "solution"
MODEL = "discogs-effnet-bs1-1"
TRACKS = 4  # previews per album
K = 64
MP_STOPS = ("balanced",)  # stops ranked after mutual proximity by default (see analyses.md, "What changes")
HOLDOUT = ("genre_primary", "genre_family", "desc_cos", "genre_primary_xa", "desc_cos_xa", "fam_desc_cos",
           "artist_mrr", "feel_mad", "bal_genre_primary", "bal_genre_family", "bal_overlap_A")


def cached_tracks(rows=None, tracks: int = TRACKS) -> dict[int, np.ndarray]:
    """row -> (n, 1280) EffNet embeddings of the album's first `tracks` analysed previews in
    priority order, from cache/features.sqlite (read-only), for the catalog albums in `rows`."""
    frame, embs = load_tracks()
    E, r = embs["effnet"], frame["row"].to_numpy()
    keep = (frame["prio"] < tracks).to_numpy() & ~np.isnan(E[:, 0])
    keep &= np.isin(r, load_albums()["row"] if rows is None else rows)
    E, r = E[keep], r[keep]
    starts = np.flatnonzero(np.r_[True, r[1:] != r[:-1]])
    return {int(r[s]): E[s:e] for s, e in zip(starts, np.r_[starts[1:], len(r)])}


def album_vectors(tracks: dict[int, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """(rows ascending, L2-normalised mean track embedding per album)."""
    rows = np.array(sorted(tracks), dtype=np.int64)
    V = np.stack([np.asarray(tracks[r], dtype=np.float64).mean(axis=0) for r in rows])
    return rows, V / np.linalg.norm(V, axis=1, keepdims=True)


@dataclass
class Transform:
    """The fitted map from an album's unit vector to its audio block: (v - mean) @ components.T * scale."""
    mean: np.ndarray  # (1280,)
    components: np.ndarray  # (k, 1280), orthonormal rows
    scale: float
    rows: np.ndarray  # training albums
    model: str = MODEL
    tracks: int = TRACKS

    def transform(self, tracks: dict[int, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
        """(rows ascending, (albums, k) audio block) for any albums, seen in fitting or not."""
        rows, V = album_vectors(tracks)
        return rows, (V - self.mean) @ self.components.T.astype(np.float64) * self.scale

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez(path, mean=self.mean.astype(np.float32), components=self.components.astype(np.float32),
                 scale=np.float64(self.scale), rows=self.rows, model=np.str_(self.model), tracks=np.int64(self.tracks))

    @classmethod
    def load(cls, path: Path) -> "Transform":
        z = np.load(path)
        return cls(z["mean"].astype(np.float64), z["components"], float(z["scale"]), z["rows"], str(z["model"]),
                   int(z["tracks"]))


def fit(tracks: dict[int, np.ndarray], k: int = K) -> Transform:
    """PCA(k) of the centred unit album vectors, scaled to the total variance of the Spotify block
    on the same albums. Component signs are fixed (largest loading positive) so refits are identical."""
    rows, V = album_vectors(tracks)
    A = load_albums().set_index("row").loc[rows, AUDIO].to_numpy(dtype=np.float64)
    mean = V.mean(axis=0)
    _, s, Vt = np.linalg.svd(V - mean, full_matrices=False)
    C = Vt[:k]
    C = C * np.sign(C[np.arange(len(C)), np.abs(C).argmax(axis=1)])[:, None]
    return Transform(mean, C, float(np.sqrt(total_var(A) * len(V) / (s[:k] ** 2).sum())), rows)


def imputed_descriptors(V: np.ndarray, desc: np.ndarray, artist: np.ndarray) -> np.ndarray:
    """Descriptor weights predicted from the unit album vectors, clipped at 0: learned.py's ridge
    (PCA 128, z-score, alpha per descriptor), out of fold by artist, trained on the albums with at
    least MIN_DESC descriptors. No album's prediction comes from a model that saw it or its artist."""
    labelled = (desc > 0).sum(axis=1) >= MIN_DESC
    out = np.empty_like(desc)
    for train, test in GroupKFold(FOLDS).split(V, groups=artist):
        train = train[labelled[train]]
        out[test] = regressor("ridge").fit(V[train], desc[train]).predict(V[test])
    return np.maximum(out, 0)


def recommend(X: np.ndarray, desc: np.ndarray, mp: tuple[str, ...] = MP_STOPS, query_desc: np.ndarray | None = None,
              k: int = 10) -> dict[str, np.ndarray]:
    """Top k per album at each stop over [X | desc / slider**3], the site's matrix with the new
    block; the stops in `mp` rank by mutual proximity instead of the raw distance. Albums query
    with `query_desc` (default: `desc`); the candidates always carry `desc`."""
    out = {}
    for stop in STOPS:
        G = matrix(X, desc, stop).astype(np.float64)
        Q = G if query_desc is None else matrix(X, query_desc, stop).astype(np.float64)
        D = euclidean_distances(Q, G, squared=True).astype(np.float32)
        np.fill_diagonal(D, np.inf)
        out[stop] = nearest(mutual_proximity(D) if stop in mp else D, k=k)
    return out


def holdout(rows: np.ndarray, k: int = K) -> dict:
    """Held-out against in-fit neighbours of every album (see the module docstring). Per metric:
    the in-fit mean, the held-out mean and their paired difference (CI over artists), over all
    albums and over fold 0 alone (one literal 80/20 split); overlap@10 of the two lists on the
    audio block and at the balanced stop (block at its fitted scale); the held-out block's total
    variance against the Spotify block's on the same albums."""
    b, tracks = bench(rows), cached_tracks(rows)
    full = fit(tracks, k)
    assert np.array_equal(full.rows, rows)
    X0 = full.transform(tracks)[1]
    ref = score(X0, rows, name="in_fit")["seeds"]
    lists = lambda X: (nearest(distances(X)), nearest(distances(matrix(X, b.desc, "balanced"))))  # noqa: E731
    ref_lists = lists(X0)
    held = {m: np.full(len(rows), np.nan) for m in HOLDOUT}
    same = {c: np.full(len(rows), np.nan) for c in ("audio", "balanced")}
    fold, var = np.empty(len(rows), dtype=int), []
    for f, (train, test) in enumerate(GroupKFold(5).split(rows, groups=b.artist)):
        t = fit({int(r): tracks[int(r)] for r in rows[train]}, k)
        X = t.transform(tracks)[1]
        seeds = score(X, rows, name=f"fold{f}")["seeds"]
        for m in HOLDOUT:
            held[m][test] = seeds[m][test]
        for c, new, old in zip(same, lists(X), ref_lists):
            same[c][test] = overlap(new[test], old[test])
        fold[test] = f
        var.append(round(total_var(X[test]) / total_var(b.A[test]), 4))
        print(f"fold {f}: {len(train)} fitted, {len(test)} held out", flush=True)

    def table(mask: np.ndarray) -> dict:
        pick = lambda v: np.where(mask, v, np.nan)  # noqa: E731
        return {m: {"in_fit": summarise(pick(ref[m]), b), "held_out": summarise(pick(held[m]), b),
                    "diff": summarise(pick(held[m] - ref[m]), b)} for m in HOLDOUT} | {
            f"same_lists_{c}": summarise(pick(v), b) for c, v in same.items()}

    return {"albums": len(rows), "k": k, "folds": 5, "held_out_var_vs_A": var,
            "all": table(np.ones(len(rows), bool)), "fold0": table(fold == 0) | {"albums": int((fold == 0).sum())}}


def holdout_md(res: dict) -> str:
    cell = lambda m: f"{m['mean']:.3f} ±{(m['ci'][1] - m['ci'][0]) / 2:.3f}"  # noqa: E731
    star = lambda m: f"{m['mean']:+.3f}" + "*" * (m["ci"][0] > 0 or m["ci"][1] < 0)  # noqa: E731
    out = ["# New-album test: transform fitted without the album", "",
           f"{res['albums']} albums, PCA {res['k']}, {res['folds']} folds grouped by artist. `held out`: the album's "
           "block comes from a transform fitted on the other 80% (no album of its artist among them) and its "
           "neighbours are searched in the catalog mapped by that same transform. `in fit`: the transform fitted on "
           "every album. Metrics as in simbench (audio block alone; bal_* at the balanced stop); * = the paired 95% "
           "CI excludes 0.", ""]
    for name, title in (("all", "every album held out once"), ("fold0", f"fold 0 only ({res['fold0']['albums']} albums)")):
        t = res[name]
        out += [f"## {title}", "", *_table(["metric", "in fit", "held out", "difference"], [
            [m, cell(t[m]["in_fit"]), cell(t[m]["held_out"]), star(t[m]["diff"])] for m in HOLDOUT]),
            f"Share of the in-fit top 10 the held-out transform returns: audio block {cell(t['same_lists_audio'])}, "
            f"balanced stop {cell(t['same_lists_balanced'])}.", ""]
    out += ["Total variance of the held-out albums' block relative to the Spotify block on the same albums, per "
            f"fold (1 = the slider keeps its meaning): {res['held_out_var_vs_A']}.", ""]
    return "\n".join(out)


def recs(t: Transform, mp: tuple[str, ...], impute_below: int, rows=None) -> tuple[dict, dict]:
    """(recs.json, meta.json) contents: every catalog album with cached previews (of `rows`, if
    given) goes through the saved transform, fitted on it or not; the others follow the no-audio policy."""
    catalog = load_albums()
    tracks = cached_tracks(rows)
    rows, X = t.transform(tracks)
    b = bench(rows)
    poor = (b.desc > 0).sum(axis=1) < impute_below
    query = np.where(poor[:, None], np.maximum(b.desc, imputed_descriptors(album_vectors(tracks)[1], b.desc, b.artist)),
                     b.desc) if poor.any() else None
    ids = np.flatnonzero(catalog["row"].isin(rows).to_numpy())  # pool position -> site album id
    lists = recommend(X, b.desc, mp, query)
    all_desc = catalog[descriptor_cols(catalog.drop(columns="row"))].to_numpy(dtype=np.float32)
    by_desc = top_k_neighbours(all_desc)
    no_audio = np.setdiff1d(np.arange(len(catalog)), ids)
    out = {}
    for stop in STOPS:
        full = by_desc.copy()
        full[ids] = ids[lists[stop]]
        out[stop] = full.tolist()
    meta = {"albums": len(catalog), "with_audio": len(ids), "no_audio": no_audio.tolist(),
            "no_audio_policy": "descriptor-only neighbours over the whole catalog, the same list at every stop; "
                               "never a candidate in another album's list",
            "no_audio_and_no_descriptors": int((~all_desc[no_audio].any(axis=1)).sum()),
            "model": t.model, "tracks_per_album": t.tracks, "k": len(t.components), "fitted_on": len(t.rows),
            "transformed_but_not_fitted": int((~np.isin(rows, t.rows)).sum()),
            "block_var_vs_A": round(total_var(X) / total_var(b.A), 4), "mutual_proximity_stops": list(mp),
            "impute_below": impute_below, "albums_filled": int(poor.sum()),
            "hubness": {stop: hubness(lists[stop]) for stop in STOPS}}
    return out, meta


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("cmd", choices=("fit", "holdout", "recs"))
    p.add_argument("--k", type=int, default=K)
    p.add_argument("--rows", type=Path, help="album snapshot as simbench.py's (written if missing; default: every cached album)")
    p.add_argument("--dir", type=Path, default=DIR, help="where transform.npz, recs.json and meta.json live")
    p.add_argument("--publish", type=Path, help="fit: also copy transform.npz here (it is about 330 KB)")
    p.add_argument("--out", type=Path, default=DIR, help="holdout: where holdout.{md,json} go")
    p.add_argument("--mp", default=",".join(MP_STOPS), help='recs: stops ranked by mutual proximity ("" = none)')
    p.add_argument("--impute-below", type=int, default=0,
                   help="recs: fill up the query descriptors of albums with fewer than N from audio (0 = off)")
    args = p.parse_args()
    t0 = time.time()
    rows = pool_rows(args.rows) if args.rows else None
    path = args.dir / "transform.npz"
    if args.cmd == "fit":
        t = fit(cached_tracks(rows), args.k)
        t.save(path)
        if args.publish:
            args.publish.mkdir(parents=True, exist_ok=True)
            shutil.copy(path, args.publish / "solution_transform.npz")
        print(f"fitted on {len(t.rows)} albums, k={len(t.components)}, scale {t.scale:.4f} -> {path} "
              f"({path.stat().st_size / 1e3:.0f} KB), {time.time() - t0:.0f}s")
    elif args.cmd == "holdout":
        res = holdout(np.array(sorted(cached_tracks())) if rows is None else rows, args.k)
        res["runtime_s"] = round(time.time() - t0, 1)
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "holdout.json").write_text(json.dumps(res, indent=1) + "\n", encoding="utf-8")
        (args.out / "holdout.md").write_text(holdout_md(res), encoding="utf-8")
        print(f"{res['albums']} albums, {res['runtime_s']}s -> {args.out / 'holdout.md'}")
    else:
        out, meta = recs(Transform.load(path), tuple(s for s in args.mp.split(",") if s), args.impute_below, rows)
        (args.dir / "recs.json").write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
        (args.dir / "meta.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
        print(f"{meta['with_audio']} albums with audio, {len(meta['no_audio'])} without, "
              f"{time.time() - t0:.0f}s -> {args.dir / 'recs.json'}")


if __name__ == "__main__":
    main()
