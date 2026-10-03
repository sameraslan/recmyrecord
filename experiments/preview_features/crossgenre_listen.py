"""Listening lists for the cross-genre candidates: the sonic stop's top 10 per seed and candidate.

CLI: python crossgenre_listen.py   -> results/crossgenre_listening.json (compact; read-only on the caches)

Sonic stop = the audio block alone, euclidean, top 10, the seed's own artist kept (as the site
shows it), the seed itself excluded. Candidate names are crossgenre.py's; anything fitted with RYM
genres is fitted on every album (`oof=False`): what a deployed catalog would show. `spotify` is the
13 Spotify columns (variant A of variants.py), restricted to the pool. `~mmr`, `~x5`, `~x5p` change
the ranking rule (crossgenre.reranker); `~x5p`'s predicted families are out of fold by artist.

Sections: `full` = the 3,944-album pool, 4 clips per album; `bakeoff` = the 1,000 bake-off albums,
2 clips per album (neighbours come from those 1,000 only).

Shape:
  {generated, note, anchor: {artist, title, targets}, sections: {full, bakeoff}}
  section: {pool_size, clips_per_album, candidates: [{id, label}],
            predicted_family_accuracy: {embedding: out-of-fold accuracy of ~x5p's classifier},
            albums: {row: [artist, title, primary_genre, family, spotify album id]},
            wrong_features: [row, ...]  (listed albums whose Spotify features belong to another record),
            seeds: [{row, genres, lists: {candidate id: {n_out_family, mean_desc_cos, items, target_ranks?}}}]}
  items: ten [row, out_family, out_primary, desc_cos, same_artist], nearest first. out_family /
         out_primary: 1 / 0 against the seed by the true RYM genre, null when either album has none;
         desc_cos: RYM descriptor cosine with the seed, 2 decimals, null when either album has fewer
         than simbench.MIN_DESC descriptors; same_artist: 1 / 0.
  target_ranks (anchor seed only): rank by plain distance (1 = nearest, among every other album of
         the pool, whatever the ranking rule) of the target albums and of the first neighbour in the
         rock family, the first prog-rock one (any RYM genre naming both prog and rock, as
         crossgenre.anchor) and the first outside the jazz family.
"""
import datetime
import json
import re

import numpy as np

from common import ALBUMS_JSON, RESULTS, load_albums
from crossgenre import ANCHOR, ANCHOR_TARGETS, POOLS, build, predicted_family, reranker, source, xbench
from evaluate import SEEDS
from rmr_pipeline.artists import clean_artist
from simbench import K, distances

OUT = RESULTS / "crossgenre_listening.json"
SPOTIFY = "spotify"
CANDIDATES = {
    "full": [("effnet/64", "EffNet (in use now)"),
             ("effnet/64~x5", "EffNet, 5 of 10 forced outside the family (RYM genre)"),
             ("effnet/64~x5p", "EffNet, 5 of 10 forced outside the predicted family"),
             (SPOTIFY, "Spotify features (old site)"),
             ("ridge", "Spotify-like scores predicted from audio"),
             ("effnet/64+ridge@0.9", "EffNet + Spotify-like scores, scores-heavy"),
             ("ball", "Feel scores only"),
             ("effnet/64+ball@0.9", "EffNet + feel, feel-heavy"),
             ("effnet-leace/64+ball@0.5", "Genre-erased EffNet + feel"),
             ("effnet-leace/64", "Genre-erased EffNet"),
             ("effnet-inlp2/64", "EffNet, light genre removal"),
             ("musicnn/64", "MusiCNN"),
             ("effnet/64~mmr0.5", "EffNet, diversified top 10")],
    "bakeoff": [("effnet/64", "EffNet (in use now)"),
                ("effnet/64~x5", "EffNet, 5 of 10 forced outside the family (RYM genre)"),
                ("effnet/64~x5p", "EffNet, 5 of 10 forced outside the predicted family"),
                ("clap_music/64", "CLAP music+speech"),
                ("clap_music/64~x5", "CLAP, 5 of 10 forced outside the family (RYM genre)"),
                ("clap_music/64~x5p", "CLAP, 5 of 10 forced outside the predicted family"),
                ("clap_music-inlp1/64", "CLAP, light genre removal"),
                ("mert_l5/64", "MERT layer 5"),
                ("musicnn/64", "MusiCNN"),
                (SPOTIFY, "Spotify features (old site)"),
                ("ridge", "Spotify-like scores predicted from audio")],
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

    used: set[int] = set()

    def flag(x) -> int:
        return int(bool(x))

    def entry(s: int, i: int) -> list:
        both = bool(g["joined"][s] and g["joined"][i])
        c = float(cos[s, i])
        used.add(i)
        return [int(src.rows[i]), flag(g["family"][i] != g["family"][s]) if both else None,
                flag(g["primary"][i] != g["primary"][s]) if both else None,
                None if np.isnan(c) else round(c, 2), flag(xb.b.same_artist[s, i])]

    pos = {int(r): i for i, r in enumerate(src.rows)}
    seeds = [find(*ANCHOR)] if pool == "full" else []
    seeds += [pos[r] for r in SEEDS if r in pos]
    extra = [find(a, t) for a, t in BAKEOFF_EXTRA] if pool == "bakeoff" else []
    assert None not in extra, [x for x, i in zip(BAKEOFF_EXTRA, extra) if i is None]
    seeds = list(dict.fromkeys(s for s in seeds + extra if s is not None))
    anchor = find(*ANCHOR) if pool == "full" else None

    out = [{"row": int(src.rows[s]), "genres": g["genres"][s], "lists": {}} for s in seeds]
    used.update(seeds)
    for name, _ in CANDIDATES[pool]:
        X = src.A if name == SPOTIFY else build(name, pool, oof=False)[1]
        D = distances(X)
        rule = None if name == SPOTIFY else reranker(name, pool)
        tops = np.argsort(D, axis=1, kind="stable")[:, :K] if rule is None else rule(D, np.ones((n, n), bool))
        for s, o in zip(seeds, out):
            items = [entry(s, int(i)) for i in tops[s]]
            cs = cos[s, tops[s]]
            o["lists"][name] = l = {"n_out_family": sum(e[1] == 1 for e in items),
                                    "mean_desc_cos": None if np.isnan(cs).all() else round(float(np.nanmean(cs)), 3),
                                    "items": items}
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
            "candidates": [{"id": c, "label": lab} for c, lab in CANDIDATES[pool]],
            "predicted_family_accuracy": {c.partition("~")[0]: predicted_family(pool, c.split("/")[0])[1]
                                          for c, _ in CANDIDATES[pool] if c.endswith("~x5p")},
            "albums": {int(src.rows[i]): [artists[i], str(titles[i]), g["primary"][i], g["family"][i],
                                          spotify_id[int(src.rows[i])]] for i in sorted(used)},
            "wrong_features": [int(src.rows[i]) for i in sorted(used) if not src.spot_ok[i]], "seeds": out}


def main() -> None:
    catalog, site = load_albums(), json.loads(ALBUMS_JSON.read_text(encoding="utf-8"))
    assert len(site) == len(catalog)
    spotify_id = dict(zip(catalog["row"].astype(int), (a["s"] for a in site)))  # as evaluate.seeds_json
    res = {"generated": datetime.date.today().isoformat(),
           "note": "Sonic stop: audio block alone, euclidean, top 10, seed's artist kept, seed excluded. Supervised "
                   "steps fitted on every album (in fit). ~mmr: re-ranked among the seed's 50 nearest. ~x5 / ~x5p: the "
                   "furthest in-family members replaced by the nearest out-of-family albums until 5 are outside (RYM "
                   "family / family predicted from the embedding, out of fold by artist). Spotify album URL: "
                   "https://open.spotify.com/album/<id>.",
           "anchor": {"artist": ANCHOR[0], "title": ANCHOR[1], "targets": [f"{a} — {t}" for a, t in ANCHOR_TARGETS]},
           "sections": {pool: section(pool, spotify_id) for pool in ("full", "bakeoff")}}
    full = res["sections"]["full"]
    top = [" — ".join(full["albums"][e[0]][:2]) for e in full["seeds"][0]["lists"]["effnet/64"]["items"][:3]]
    assert top == ["McCoy Tyner — Asante", "Bobby Hutcherson — Head On", "John Coltrane — Concert in Japan"], top
    OUT.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} kB)")


if __name__ == "__main__":
    main()
