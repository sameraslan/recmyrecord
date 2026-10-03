"""Build the listening page for the genre-crossing experiment.

CLI: python crossgenre_page.py OUT.html
Inlines results/crossgenre_listening.json and the summary tables (figures copied from
results/crossgenre.md; out family is shown as albums of 10) into crossgenre_page.template.html.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def row(name, out, desc, lift, hubs, cls=None):
    cells = [f"{out * 10:.1f}", f"{desc:.3f}", "–" if lift is None else f"{lift:+.3f}", f"{hubs:.1f}"]
    return {"name": name, "cells": cells, "cls": cls}


FULL = [
    {"group": "Representations", "cls": "grp"},
    row("EffNet (in use now)", 0.366, 0.432, 0.148, 0.79, "ref"),
    row("Spotify features (old site)", 0.606, 0.352, 0.093, 0.77),
    row("Spotify-like scores predicted from audio", 0.521, 0.379, 0.112, 0.57),
    row("Essentia feel scores, all 33", 0.473, 0.398, 0.128, 0.99),
    row("EffNet + feel scores, scores-heavy", 0.429, 0.410, 0.139, 1.10),
    row("MusiCNN", 0.422, 0.411, 0.144, 0.80),
    row("EffNet, Discogs classifier directions removed", 0.371, 0.430, 0.144, 0.74),
    row("EffNet, light genre removal (RYM-fitted)", 0.404, 0.418, 0.136, 1.02),
    row("EffNet, genre erased (RYM-fitted)", 0.487, 0.400, 0.096, 4.18),
    row("Genre-erased EffNet + feel scores", 0.428, 0.424, 0.139, 1.47),
    {"group": "Ranking rules on EffNet", "cls": "grp"},
    row("Diversified top 10", 0.407, 0.417, None, 0.25),
    {"group": "Controls", "cls": "grp"},
    row("EffNet mixed half and half with noise", 0.455, 0.383, 0.110, 1.28, "ctl"),
    row("Random", 0.873, 0.229, -0.001, 0.24, "ctl"),
]
BAKEOFF = [
    row("EffNet (in use now)", 0.440, 0.414, 0.120, 0.69, "ref"),
    row("CLAP, music and speech", 0.485, 0.407, 0.120, 1.01),
    row("CLAP, general audio", 0.530, 0.396, 0.112, 1.08),
    row("CLAP, light genre removal (RYM-fitted)", 0.538, 0.397, 0.110, 1.35),
    row("MusiCNN", 0.483, 0.397, 0.115, 0.58),
    row("MERT, middle layers", 0.619, 0.363, 0.085, 2.59),
    row("Spotify-like scores predicted from audio", 0.574, 0.369, 0.090, 0.60),
    row("Spotify features (old site)", 0.610, 0.358, 0.081, 0.71),
    row("EffNet mixed half and half with noise", 0.517, 0.372, 0.083, 1.42, "ctl"),
    row("Random", 0.875, 0.241, -0.001, 0.56, "ctl"),
]
BB = ["effnet/64", "spotify", "ridge", "effnet/64+ridge@0.9", "ball", "musicnn/64", "effnet-inlp2/64", "effnet-leace/64",
      "effnet-leace/64+ball@0.5"]
BB_NAMES = {"effnet/64": "EffNet (in use now)", "spotify": "Spotify features (old site)",
            "ridge": "Spotify-like scores predicted from audio", "effnet/64+ridge@0.9": "EffNet + Spotify-like scores",
            "ball": "Essentia feel scores", "musicnn/64": "MusiCNN", "effnet-inlp2/64": "EffNet, light genre removal",
            "effnet-leace/64": "EffNet, genre erased", "effnet-leace/64+ball@0.5": "Genre-erased EffNet + feel scores"}


def main() -> None:
    data = json.loads((HERE / "results" / "crossgenre_listening.json").read_text())
    for sec in data["sections"].values():  # forced crossing was rejected as an approach; keep it off the page
        sec["candidates"] = [c for c in sec["candidates"] if "~x5" not in c["id"]]
        for seed in sec["seeds"]:
            seed["lists"] = {k: v for k, v in seed["lists"].items() if "~x5" not in k}
    lists = data["sections"]["full"]["seeds"][0]["lists"]
    bb = []
    for c in BB:
        t = lists[c]["target_ranks"]
        cells = [str(t[k]) for k in ("Live-Evil", "Get Up With It", "Rocksession", "first_rock_family")]
        bb.append({"name": BB_NAMES[c], "cells": cells, "cls": "ref" if c == "effnet/64" else None})
    tables = {"full": FULL, "bakeoff": BAKEOFF, "bb": bb}
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (HERE / "crossgenre_page.template.html").read_text()
    html = html.replace("__DATA__", dump(data)).replace("__TABLES__", dump(tables))
    Path(sys.argv[1]).write_text(html)
    print(sys.argv[1], len(html))


if __name__ == "__main__":
    main()
