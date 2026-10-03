"""RYM genres for the catalog: join to the feature table, coarse families, pairwise match matrices.

CLI: python genres.py   (prints the join rate and family sizes, writes results/genre_join_failures.csv)

The feature table was built from the same scrape, so its `Artist` strings (glued member names
included) equal the scrape's; the join key is folded artist + title, raw first, then with both
sides passed through rmr_pipeline.artists.clean_artist.
"""
import re
import unicodedata

import numpy as np
import pandas as pd

from common import RESULTS, RYM_GENRES, load_albums
from rmr_pipeline.artists import clean_artist

# Coarse families: first matching rule wins, tested on the lower-cased RYM genre name.
FAMILIES = [
    ("hip hop", r"hip hop|\brap\b|^trap$|boom bap|drill$|grime|plugg|chopped|g-funk|horrorcore|dirty south|^bounce|"
                r"turntabl|drumless"),
    ("metal", r"metal|grind|djent|nwobhm|deathcore|härte"),
    ("soundtrack", r"film|soundtrack|video game|television|show tunes|spaghetti western|cartoon|musical|jingles|"
                   r"16-bit|bit music|chiptune|fm synthesis|sequencer"),
    ("classical", r"classical|symphony|romanticism|baroque music|minimalism|^opera|concerto|choral|chamber music|"
                  r"serialism|impressionism|expressionism|spectralism|renaissance|oratorio|chant|orchestral|"
                  r"tone poem|neoclassicism|totalism|stochastic|indeterminacy"),
    ("ambient", r"ambient|drone|new age|field recordings|nature recordings|berlin school|progressive electronic"),
    ("experimental", r"experimental$|noise$|industrial$|post-industrial|sound collage|epic collage|concrète|eai|"
                     r"free improvisation|tape music|electroacoustic|acousmatic|onkyo|reductionism|power electronics|"
                     r"mashup|turntable music"),
    ("electronic", r"electro|techno|house|idm|trance|drum and bass|jungle|dubstep|brostep|breakbeat|breakcore|"
                   r"glitch|downtempo|trip hop|synthwave|vaporwave|chillwave|minimal wave|\[edm\]|big beat|"
                   r"plunderphonics|bass$|wonky|ebm|gabber|speedcore|j-core|nightcore|hardstep|darkside|club$|"
                   r"ghettotech|hi-nrg|eurobeat|eurodance|uk garage|future garage|speed garage|hardcore breaks|"
                   r"^dance$|alternative dance|illbient|witch house|synthpop|complextro|minimal synth|horror synth|"
                   r"darksynth|indietronica|folktronica|hyperpop|industrial hardcore|happy hardcore|dreampunk"),
    ("jazz", r"jazz|bop|big band|(?<!jack )swing|third stream|dixieland|stride|ragtime|modern creative|standards"),
    ("punk", r"(?<!post-)(?<!proto-)punk|hardcore|emo|screamo|oi!|powerviolence|d-beat|riot grrrl|burning spirits|"
             r"(?<!slow)core$"),
    ("reggae", r"reggae|dub$|dub poetry|ska|dancehall|lovers rock|nyahbinghi|2 tone"),
    ("latin & world", r"mpb|samba|bossa|tropic|choro|baião|afoxé|candomblé|cantoria|manguebeat|vanguarda|cuban|"
                      r"cubano|salsa|descarga|danzón|bolero|ranchera|cumbia|tango|flamenco|fado|portuguese|afro|"
                      r"soukous|mbalax|mande|songhai|fon music|tizita|qawwali|hindustani|persian|gamelan|kecak|"
                      r"throat|klezmer|jewish|kirtan|nueva|nova cançó|intervenção|arabic|latin|white voice"),
    ("blues", r"blues"),
    ("soul & funk", r"soul|funk|r&b|rhythm & blues|disco|boogie$|motown|gospel|new jack|girl group|spirituals|doo"),
    ("folk & country", r"folk|country|singer-songwriter|americana|american primitivism|bluegrass|cowboy|chanson|"
                       r"canzone|poezja|nashville|appalachian|neo-acoustic"),
    ("spoken & comedy", r"comedy|spoken|poetry|satire|novelty|parody"),
    ("pop", r"pop|shibuya|brill building|easy listening|lounge|cabaret|yacht|new romantic|visual kei"),
    ("rock", r"."),
]
_RULES = [(name, re.compile(rx)) for name, rx in FAMILIES]


def norm(s: str) -> str:
    """Accent-folded, lower-cased, punctuation-free text for joining."""
    s = "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c))
    return re.sub(r"[\W_]+", " ", s.lower().replace("&", " and ")).strip()


def family(genre: str) -> str:
    """Coarse family of one RYM genre name."""
    g = genre.lower()
    return next(name for name, rx in _RULES if rx.search(g))


def _keys(artists, titles, clean: bool) -> list[str]:
    return [norm(clean_artist(a) if clean else a) + "|" + norm(t) for a, t in zip(artists, titles)]


def load_genres(albums: pd.DataFrame) -> pd.DataFrame:
    """Per album (aligned to `albums`): `genres` (list, primary first; empty when not joined),
    `primary`, `family` (of the primary), `joined`."""
    g = pd.read_pickle(RYM_GENRES)
    g = g[g["Genres"].astype(str).str.strip() != ""]
    lists = [[x.strip() for x in str(s).split(",") if x.strip()] for s in g["Genres"]]
    lookup: dict[str, list[str]] = {}
    for clean in (True, False):  # raw keys written last so they win
        for k, v in zip(_keys(g["Artist"], g["Album"], clean), lists):
            lookup.setdefault(("c:" if clean else "r:") + k, v)
    raw, cleaned = (_keys(albums["Artist"], albums["Title"], c) for c in (False, True))
    found = [lookup.get("r:" + r) or lookup.get("c:" + c) or [] for r, c in zip(raw, cleaned)]
    return pd.DataFrame({
        "genres": found,
        "primary": [f[0] if f else None for f in found],
        "family": [family(f[0]) if f else None for f in found],
        "joined": [bool(f) for f in found],
    }, index=albums.index)


def match_matrices(genres: pd.DataFrame) -> dict[str, np.ndarray]:
    """N×N float32 matrices: 1 where two albums share the primary genre / any genre / the family,
    NaN where either album has no genre (so nanmean skips it)."""
    ok = genres["joined"].to_numpy()
    vocab = {v: i for i, v in enumerate(sorted({x for f in genres["genres"] for x in f}))}
    G = np.zeros((len(genres), len(vocab)), dtype=np.float32)
    for r, f in enumerate(genres["genres"]):
        G[r, [vocab[x] for x in f]] = 1
    prim, fam = (pd.factorize(genres[c])[0] for c in ("primary", "family"))
    out = {
        "genre_primary": (prim[:, None] == prim[None, :]).astype(np.float32),
        "genre_any": (G @ G.T > 0).astype(np.float32),
        "genre_family": (fam[:, None] == fam[None, :]).astype(np.float32),
    }
    for M in out.values():
        M[~ok, :] = np.nan
        M[:, ~ok] = np.nan
    return out


def main() -> None:
    albums = load_albums()
    genres = load_genres(albums)
    miss = albums.loc[~genres["joined"], ["row", "Artist", "Title"]]
    RESULTS.mkdir(exist_ok=True)
    miss.to_csv(RESULTS / "genre_join_failures.csv", index=False)
    print(f"joined {genres['joined'].sum()}/{len(albums)} ({genres['joined'].mean():.2%}); "
          f"{genres['primary'].nunique()} primary genres")
    print(genres["family"].value_counts().to_string())


if __name__ == "__main__":
    main()
