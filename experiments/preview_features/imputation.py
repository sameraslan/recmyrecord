"""How to give an album without preview audio a row in the site matrix (settings for rmr_pipeline.audio.impute).

CLI (pipeline venv): ../../data-pipeline/.venv/bin/python imputation.py [--seeds 5] -> results/imputation.{md,json}

The production rule: the album's block is the mean block of its k nearest albums by descriptor
distance among the albums with audio, optionally rescaled to those neighbours' mean norm. This
script picks k and the rescaling by hiding the audio of albums that have it: per seed, as many
random albums as the catalog really lacks (137) are imputed from the others, and their lists are
compared with the lists they get from their own audio, among the albums with audio only.

Per setting, over the hidden albums (mean over seeds), at the sonic and balanced stops:
  overlap    share of the album's true top 10 that its imputed row also returns
  genre      share of its top 10 with its primary RYM genre (`true`: the same with its own audio)
  N10        number of other albums' top-10 lists it appears in (10 on average for any album);
             `max` is the largest over hidden albums and seeds, `never` the share in no list
  moved      share of the OTHER albums' recommendations that change because of the imputed rows
`centre` puts the hidden albums at the catalog mean (a zero block): the no-information floor.
The last table applies each setting to the albums that really have no audio, in the whole catalog
(no truth to compare with: genre share and hubness only).
"""
import argparse
import json
import time

import numpy as np

from common import RESULTS, load_albums
from genres import load_genres
from rmr_pipeline.audio import IMPUTE_K, IMPUTE_RESCALE, audio_block, descriptors, impute
from rmr_pipeline.constants import SLIDER
from rmr_pipeline.recs import top_k_neighbours

STOPS = ("sonic", "balanced")
KS = (1, 3, 5, 10, 20, 50)
SETTINGS = [("centre", None, False)] + [(f"k={k}{', rescaled' if r else ''}", k, r) for k in KS for r in (False, True)]


def _table(head: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head), *("| " + " | ".join(r) + " |" for r in rows), ""]


def lists(block: np.ndarray, desc: np.ndarray) -> dict[str, np.ndarray]:
    return {s: top_k_neighbours(np.hstack([block, desc / SLIDER[s] ** 3]).astype(np.float32)) for s in STOPS}


def imputed(block: np.ndarray, desc: np.ndarray, has: np.ndarray, k: int | None, rescale: bool) -> np.ndarray:
    return np.where(has[:, None], block, 0).astype(np.float32) if k is None else impute(block, desc, has, k, rescale)


def genre_share(nbrs: np.ndarray, primary: np.ndarray, seeds: np.ndarray) -> float:
    """Mean share of the seeds' neighbours with the seed's primary genre (albums with a genre only)."""
    same = np.where((primary[nbrs[seeds]] >= 0) & (primary[seeds] >= 0)[:, None],
                    primary[nbrs[seeds]] == primary[seeds][:, None], np.nan)
    return float(np.nanmean(same))


def n10(nbrs: np.ndarray, who: np.ndarray) -> np.ndarray:
    return np.bincount(nbrs.ravel(), minlength=len(nbrs))[who]


def hide_and_impute(block, desc, primary, seeds: int) -> dict:
    """Per setting and stop, the metrics of the module docstring (plus `true`)."""
    n, truth = len(block), lists(block, desc)
    runs: dict = {}
    for seed in range(seeds):
        hidden = np.random.default_rng(seed).choice(n, MISSING, replace=False)
        has = np.ones(n, bool)
        has[hidden] = False
        for stop in STOPS:
            runs.setdefault(("true", stop), []).append({
                "genre": genre_share(truth[stop], primary, hidden), "n10": n10(truth[stop], hidden)})
        for name, k, rescale in SETTINGS:
            got = lists(imputed(block, desc, has, k, rescale), desc)
            for stop in STOPS:
                a, b = got[stop], truth[stop]
                runs.setdefault((name, stop), []).append({
                    "overlap": float((a[hidden][:, :, None] == b[hidden][:, None, :]).any(axis=2).mean()),
                    "genre": genre_share(a, primary, hidden), "n10": n10(a, hidden),
                    "moved": 1 - float((a[has][:, :, None] == b[has][:, None, :]).any(axis=2).mean())})
            print(f"seed {seed} {name}", flush=True)
    out: dict = {}
    for (name, stop), rs in runs.items():
        counts = np.concatenate([r["n10"] for r in rs])
        out.setdefault(name, {})[stop] = {
            m: round(float(np.mean([r[m] for r in rs])), 4) for m in ("overlap", "genre", "moved") if m in rs[0]} | {
            "n10_mean": round(float(counts.mean()), 2), "n10_max": int(counts.max()),
            "never": round(float((counts == 0).mean()), 4)}
    return out


def real_missing(sub, desc, primary) -> dict:
    """Each setting applied to the albums that really lack audio, lists over the whole catalog."""
    audio = audio_block(sub)
    missing = np.flatnonzero(~audio.has_audio)
    out = {}
    for name, k, rescale in SETTINGS:
        got = lists(imputed(audio.block, desc, audio.has_audio, k, rescale), desc)
        out[name] = {stop: {"genre": round(genre_share(got[stop], primary, missing), 4),
                            "n10_mean": round(float(n10(got[stop], missing).mean()), 2),
                            "n10_max": int(n10(got[stop], missing).max()),
                            "never": round(float((n10(got[stop], missing) == 0).mean()), 4),
                            "own_kind": round(float(np.isin(got[stop][missing], missing).mean()), 4)} for stop in STOPS}
    return out


def report(res: dict) -> str:
    out = ["# Imputing the audio block of albums without preview audio", "",
           f"{res['albums_with_audio']} albums with audio, {res['missing']} without; {res['seeds']} seeds, "
           f"{res['missing']} albums hidden per seed. Columns as in imputation.py's docstring. Albums with audio have "
           f"{res['descriptors']['with_audio']} descriptors on average; the albums without have "
           f"{res['descriptors']['missing']} ({res['descriptors']['missing_none']} of them none).", "",
           f"The build uses k={IMPUTE_K}{', rescaled' if IMPUTE_RESCALE else ''} (rmr_pipeline.audio). A plain mean "
           "of several blocks is shorter than a real block, sits near the middle of the audio space and lands in "
           "two to four times as many lists as an average album; rescaling it to its neighbours' norm removes most "
           "of that. k=1 copies one album's block, so that album is always the first sonic recommendation; from "
           "k=3 to k=10 the rescaled settings are within 0.02 of each other on overlap and genre share, while "
           "hubness and the share of imputed albums recommending each other grow with k.", ""]
    for stop in STOPS:
        t = res["hidden"]
        out += [f"## Hidden albums, {stop} stop", "", *_table(
            ["setting", "overlap", "genre", "N10 mean", "N10 max", "never", "moved"],
            [[n, *(f"{r[stop][m]:.3f}" if m in r[stop] else "–" for m in ("overlap", "genre")), f"{r[stop]['n10_mean']:.1f}",
              str(r[stop]["n10_max"]), f"{r[stop]['never']:.3f}", f"{r[stop]['moved']:.4f}" if "moved" in r[stop] else "–"]
             for n, r in t.items()])]
    out += ["## The albums that really have no audio (whole catalog)", "",
            "`own kind`: share of their recommendations that are other imputed albums "
            f"({res['missing'] / (res['albums_with_audio'] + res['missing']):.3f} if they were spread evenly).", "",
            *_table(["setting", *(f"{s} {m}" for s in STOPS for m in ("genre", "N10 mean", "N10 max", "never", "own kind"))],
                    [[n, *(f"{r[s][m]:.3g}" for s in STOPS for m in ("genre", "n10_mean", "n10_max", "never", "own_kind"))]
                     for n, r in res["real"].items()])]
    return "\n".join(out) + "\n"


def main() -> None:
    global MISSING
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--seeds", type=int, default=5)
    args = p.parse_args()
    t0 = time.time()
    sub = load_albums().drop(columns="row")
    audio = audio_block(sub)
    primary = np.asarray(load_genres(sub)["primary"].astype("category").cat.codes)
    desc, has = descriptors(sub), audio.has_audio
    MISSING = int((~has).sum())
    count = (desc > 0).sum(axis=1)
    res = {"albums_with_audio": int(has.sum()), "missing": MISSING, "seeds": args.seeds,
           "descriptors": {"with_audio": round(float(count[has].mean()), 1), "missing": round(float(count[~has].mean()), 1),
                           "missing_none": int((count[~has] == 0).sum())},
           "hidden": hide_and_impute(audio.block[has], desc[has], primary[has], args.seeds),
           "real": real_missing(sub, desc, primary), "runtime_s": round(time.time() - t0, 1)}
    (RESULTS / "imputation.json").write_text(json.dumps(res, indent=1) + "\n", encoding="utf-8")
    (RESULTS / "imputation.md").write_text(report(res), encoding="utf-8")
    print(report(res))


if __name__ == "__main__":
    main()
