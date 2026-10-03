"""Listening lists for the cross-genre candidates: the sonic stop's top 10 per seed and candidate.

CLI: python crossgenre_listen.py   -> results/crossgenre_listening.json (compact; read-only on the caches)

Sonic stop = the audio block alone, euclidean, top 10, the seed's own artist kept (as the site
shows it), the seed itself excluded. Candidate names are crossgenre.py's; anything fitted with RYM
genres is fitted on every album (`oof=False`): what a deployed catalog would show. `spotify` is the
13 Spotify columns (variant A of variants.py), restricted to the pool.

Sections: `full` = the 3,944-album pool, 4 clips per album; `bakeoff` = the 1,000 bake-off albums,
2 clips per album (neighbours come from those 1,000 only).

Per entry: artist, title, primary_genre, family, spotify_url, out_family / out_primary (against the
seed; null when either album has no RYM genre), desc_cos (RYM descriptor cosine with the seed; null
when either has fewer than simbench.MIN_DESC descriptors), same_artist; `wrong_features` (only in
the `spotify` lists, only when true) marks an album whose Spotify features belong to another record.
Per seed and candidate: n_out_family, mean_desc_cos, items. The anchor seed also carries
`target_ranks` per candidate: the rank (1 = nearest, among every other album of the pool) of the
target albums and of the first neighbour in the rock family, the first prog-rock one (any RYM genre
naming both prog and rock, as crossgenre.anchor) and the first outside the jazz family.
"""
import datetime
import json
import re

import numpy as np

from common import ALBUMS_JSON, RESULTS, load_albums
from crossgenre import ANCHOR, ANCHOR_TARGETS, POOLS, build, mmr, parse, source, xbench
from evaluate import SEEDS
from rmr_pipeline.artists import clean_artist
from simbench import K, distances

OUT = RESULTS / "crossgenre_listening.json"
SPOTIFY = "spotify"
CANDIDATES = {
    "full": [("effnet/64", "EffNet (in use now)"),
             (SPOTIFY, "Spotify features (old site)"),
             ("ball", "Feel scores only"),
             ("effnet/64+ball@0.9", "EffNet + feel, feel-heavy"),
             ("effnet-leace/64+ball@0.5", "Genre-erased EffNet + feel"),
             ("effnet-leace/64", "Genre-erased EffNet"),
             ("effnet-inlp2/64", "EffNet, light genre removal"),
             ("musicnn/64", "MusiCNN"),
             ("effnet/64~mmr0.5", "EffNet, diversified top 10")],
    "bakeoff": [("effnet/64", "EffNet (in use now)"),
                ("clap_music/64", "CLAP music+speech"),
                ("clap_music-inlp1/64", "CLAP, light genre removal"),
                ("mert_l5/64", "MERT layer 5"),
                ("musicnn/64", "MusiCNN"),
                (SPOTIFY, "Spotify features (old site)")],
}
# Bake-off seeds beyond evaluate.SEEDS (Bitches Brew is not in this pool): every other Miles Davis
# album, every album RYM tags Jazz Fusion, then prog / krautrock / jazz / metal to spread the families.
BAKEOFF_EXTRA = [
    ("Miles Davis", "Filles de Kilimanjaro"), ("Miles Davis", "'Round About Midnight"), ("Miles Davis", "Milestones"),
    ("Herbie Hancock", "Thrust"), ("Return to Forever featuring Chick Corea", "Where Have I Known You Before"),
    ("Nucleus", "We'll Talk About It Later"), ("Shakti With John McLaughlin", "Natural Elements"),
    ("Frank Zappa", "Hot Rats"), ("Frank Zappa", "Make a Jazz Noise Here"),
    ("Eberhard Weber", "The Colours of Chloë"), ("Snarky Puppy & Het Metropole Orkest", "Sylva"),
    ("King Crimson", "Red"), ("Can", "Future Days"), ("Mingus", "The Black Saint and the Sinner Lady"),
    ("Metallica", "Master of Puppets"),
]


def section(pool: str, spotify_id: dict[int, str]) -> dict:
    src = source(pool)
    xb = xbench(src.rows)
    al, g, cos = xb.b.albums, xb.genres, xb.b.pair["desc_cos"]
    artists = [clean_artist(a) for a in al["Artist"].astype(str)]
    titles = al["Title"].astype(str).to_numpy()
    n = len(al)

    def find(artist: str, title: str) -> int | None:
        hit = [i for i in np.flatnonzero(titles == title) if artists[i] == artist]
        return int(hit[0]) if hit else None

    def album(i: int) -> dict:
        return {"artist": artists[i], "title": str(titles[i]), "primary_genre": g["primary"][i], "family": g["family"][i],
                "spotify_url": f"https://open.spotify.com/album/{spotify_id[int(al['row'][i])]}"}

    def entry(s: int, i: int, name: str) -> dict:
        both = bool(g["joined"][s] and g["joined"][i])
        c = float(cos[s, i])
        e = album(i) | {"out_family": g["family"][i] != g["family"][s] if both else None,
                        "out_primary": g["primary"][i] != g["primary"][s] if both else None,
                        "desc_cos": None if np.isnan(c) else round(c, 3), "same_artist": bool(xb.b.same_artist[s, i])}
        return e | {"wrong_features": True} if name == SPOTIFY and not src.spot_ok[i] else e

    pos = {int(r): i for i, r in enumerate(src.rows)}
    seeds = [find(*ANCHOR)] if pool == "full" else []
    seeds += [pos[r] for r in SEEDS if r in pos]
    extra = [find(a, t) for a, t in BAKEOFF_EXTRA] if pool == "bakeoff" else []
    assert None not in extra, [x for x, i in zip(BAKEOFF_EXTRA, extra) if i is None]
    seeds = list(dict.fromkeys(s for s in seeds + extra if s is not None))
    anchor = find(*ANCHOR) if pool == "full" else None

    out = [album(s) | {"row": int(src.rows[s]), "genres": g["genres"][s], "lists": {}} for s in seeds]
    for s, o in zip(seeds, out):
        if not src.spot_ok[s]:
            o["wrong_features"] = True
    for name, _ in CANDIDATES[pool]:
        X = src.A if name == SPOTIFY else build(name, pool, oof=False)[1]
        D = distances(X)
        lam = None if name == SPOTIFY else parse(name)[1]
        tops = np.argsort(D, axis=1, kind="stable")[:, :K] if lam is None else mmr(D, np.ones((n, n), bool), lam)
        for s, o in zip(seeds, out):
            items = [entry(s, int(i), name) for i in tops[s]]
            cs = [e["desc_cos"] for e in items if e["desc_cos"] is not None]
            o["lists"][name] = l = {"n_out_family": sum(e["out_family"] is True for e in items),
                                    "mean_desc_cos": round(float(np.mean(cs)), 3) if cs else None, "items": items}
            if s == anchor:
                order = np.argsort(D[s], kind="stable")[:n - 1]  # nearest first, the seed (inf) dropped
                rank = {int(i): r + 1 for r, i in enumerate(order)}
                fam = g["family"].to_numpy()[order]
                prog = np.array([bool(re.search("prog", " ".join(x), re.I)) and "rock" in " ".join(x).lower()
                                 for x in g["genres"].to_numpy()[order]])
                first = lambda m: int(np.flatnonzero(m)[0]) + 1 if m.any() else None  # noqa: E731
                l["target_ranks"] = {t: rank[find(a, t)] for a, t in ANCHOR_TARGETS if find(a, t) is not None} | {
                    "first_rock_family": first(fam == "rock"), "first_prog_rock": first(prog),
                    "first_non_jazz_family": first((fam != "jazz") & g["joined"].to_numpy()[order])}
        print(f"{pool} {name}: done", flush=True)
    return {"pool_size": n, "clips_per_album": POOLS[pool][1],
            "candidates": [{"id": c, "label": lab} for c, lab in CANDIDATES[pool]], "seeds": out}


def main() -> None:
    catalog, site = load_albums(), json.loads(ALBUMS_JSON.read_text(encoding="utf-8"))
    assert len(site) == len(catalog)
    spotify_id = dict(zip(catalog["row"].astype(int), (a["s"] for a in site)))  # as evaluate.seeds_json
    res = {"generated": datetime.date.today().isoformat(),
           "note": "Sonic stop: audio block alone, euclidean, top 10, seed's artist kept, seed excluded. Supervised "
                   "steps fitted on every album (in fit). mmr: re-ranked among the seed's 50 nearest.",
           "anchor": {"artist": ANCHOR[0], "title": ANCHOR[1], "targets": [f"{a} — {t}" for a, t in ANCHOR_TARGETS]},
           "sections": {pool: section(pool, spotify_id) for pool in ("full", "bakeoff")}}
    top = [f"{e['artist']} — {e['title']}" for e in res["sections"]["full"]["seeds"][0]["lists"]["effnet/64"]["items"][:3]]
    assert top == ["McCoy Tyner — Asante", "Bobby Hutcherson — Head On", "John Coltrane — Concert in Japan"], top
    OUT.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} kB)")


if __name__ == "__main__":
    main()
