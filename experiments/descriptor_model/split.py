"""Deterministic artist-disjoint, genre-stratified 70/15/15 split of the labelled rows -> splits.json.

    .venv/bin/python split.py            # write splits.json and print the report
    .venv/bin/python split.py --check    # verify the committed splits.json (no writing)

Grouping (rows that must share a split) = connected components of a graph whose nodes are rows and
"name nodes":
  * every row is linked to each normalised name in its artist credit: the whole billed credit, each part of
    a multi-artist credit ("A & B", "A / B", "A, B", "A + B", "A and B", "A with B", "A feat. B",
    "A featuring B", "A x B", "A vs B", "A in association with B", "A's B"), each member name the scraper glued onto
    the credit ("...Fela KutiThe Africa '70"), and each of those with a trailing ensemble word removed
    ("John Coltrane Quartet" -> "john coltrane");
  * name variants are linked to each other: a one-word name to any longer name that starts or ends with it
    ("Hendrix" ~ "Jimi Hendrix", "Spinetta" ~ "Spinetta Jade"); a name of two or more words to any longer
    name that contains it as consecutive words ("Ben Folds" ~ "Ben Folds Five", "Roland Kirk" ~ "Rahsaan
    Roland Kirk"); a name to a longer name with the same first and last word that contains all its words
    ("Fela Kuti" ~ "Fela Ransome Kuti");
  * MANUAL_ALIASES: a short hand-made list of the same person or duo under another name;
  * rows that share a Spotify URI are linked.
Every rule can only merge groups, so mistakes make the split more conservative, never leakier.

Stratification label = coarse family of the primary (first listed) RYM genre; families under MIN_FAMILY rows
and albums without a genre go to "other". StratifiedGroupKFold(20 folds, shuffled, fixed seed); the fold
holding the largest group goes first, the rest keep their order, then folds 1-14 -> train, 15-17 -> val,
18-20 -> test.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

from common import (LABELLED, N_DESC, N_ROWS, SEED, SPLITS_PATH, TABLE, YB, load_genres, load_splits, norm_text)
from rmr_pipeline.artists import clean_artist

N_FOLDS = 20
FOLD_SPLIT = ["train"] * 14 + ["val"] * 3 + ["test"] * 3
MIN_FAMILY = 60

# ------------------------------------------------------------------ artist groups

_SPLIT = re.compile(
    r"\s*[/,&+;]\s*|\s+(?:and|with|feat\.?|ft\.?|featuring|introducing|x|vs\.?|(?-i:e|y|et|und)|in association with)\s+|(?<=\w)['’]s\s+",
    re.IGNORECASE)
_GLUE = re.compile(r"(?<=[a-z0-9'’!.])(?=[A-Z])")
_ENSEMBLE = {"trio", "quartet", "quintet", "sextet", "septet", "octet", "nonet", "band", "group", "orchestra",
             "ensemble", "experience", "combo", "duo", "big", "stars", "all"}
_STOP = {"the", "and", "his", "her", "their", "of", "with"}
_GENERIC = {"orchestra", "strings", "guests", "chorus", "choir", "trio", "quartet", "quintet", "friends",
            "musicians", "voices", "band", "company", "others", "various artists", "group", "ensemble", ""}
_POSSESSIVE = re.compile(r"^(?:his|her|their|the)\s+")


def _name(s: str) -> str:
    """Normalised name without a leading "the" / "his" / "her" / "their". A possessive part that is only a
    generic ensemble word ("his orchestra") becomes "" (dropped); "The Band" stays "the band"."""
    s = norm_text(s)
    while (m := _POSSESSIVE.match(s)):
        rest = s[m.end():]
        if rest in _GENERIC:
            return s if m.group(0).strip() == "the" else ""
        s = rest
    return s


def _strip_ensemble(name: str) -> str:
    """"john coltrane quartet" -> "john coltrane"; at least two words are kept."""
    t = name.split()
    while len(t) > 2 and t[-1] in _ENSEMBLE and t[-2] not in _STOP:
        t = t[:-1]
    return " ".join(t)


def artist_names(raw: str) -> set[str]:
    """Normalised name nodes of one artist credit (see module docstring)."""
    raw = " ".join(str(raw).split())
    credit = clean_artist(raw)
    pieces = [credit] + [p for p in _SPLIT.split(credit) if p]
    if len(raw) > len(credit) and raw.startswith(credit):
        tail = raw[len(credit):]
        pieces += [p for p in _GLUE.split(tail) if p]
    out: set[str] = set()
    for p in pieces:
        n = _name(p)
        for cand in (n, _strip_ensemble(n)):
            if cand and cand not in _GENERIC and cand not in _STOP:
                out.add(cand)
    if not out:  # a name that is all punctuation or a bare generic word ("!!!", "Group")
        out.add("raw:" + credit.casefold())
    return out


# The same person or duo under another name, found by reading the artist list (credits as in the table).
# Name rules cannot see these. Not exhaustive: band-membership links (a solo album by a member of a band
# that is also in the table) are NOT covered.
MANUAL_ALIASES: list[tuple[str, ...]] = [
    ("MF DOOM", "Madvillain", "Viktor Vaughn", "King Geedorah", "Madlib", "Quasimoto"),
    ("Daniel Lopatin", "Oneohtrix Point Never"),
    ("Dan Johnston", "Daniel Johnston"),
    ("Smog", "Bill Callahan"),
    ("Mount Eerie", "The Microphones"),
    ("Have a Nice Life", "Giles Corey"),
    ("Songs: Ohia", "Magnolia Electric Co."),
    ("Sun Kil Moon", "Red House Painters"),
    ("Swans", "The Angels of Light"),
    ("2Pac", "Makaveli"),
    ("Dr. Octagon", "Ultramagnetic MC's"),
    ("Kanye West", "Kids See Ghosts"),
    ("Run the Jewels", "El-P", "Killer Mike", "Company Flow"),
    ("Mos Def", "Black Star"),
]


class _DSU:
    def __init__(self) -> None:
        self.p: dict = {}

    def find(self, x):
        self.p.setdefault(x, x)
        root = x
        while self.p[root] != root:
            root = self.p[root]
        while self.p[x] != root:
            self.p[x], x = root, self.p[x]
        return root

    def union(self, a, b) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb, key=str)] = min(ra, rb, key=str)


def variant_links(names: set[str]) -> list[tuple[str, str]]:
    """Pairs of name nodes treated as the same artist: a one-word name and a longer name that starts or
    ends with it; a name of two or more words and a longer name that contains it as a run of consecutive
    words; a name and a longer name with the same first and last word that contains all its words."""
    toks = {n: n.split() for n in names}
    by_first, by_last = defaultdict(list), defaultdict(list)
    for n, t in toks.items():
        if len(t) > 1:
            by_first[t[0]].append(n)
            by_last[t[-1]].append(n)
    links = []
    for n, t in toks.items():
        if len(t) == 1:
            if len(n) >= 3:
                links += [(n, m) for m in by_first.get(n, []) + by_last.get(n, [])]
            continue
        for size in range(2, len(t)):
            for i in range(len(t) - size + 1):
                sub = " ".join(t[i:i + size])
                if sub in names and sub != n:
                    links.append((sub, n))
        for m in by_first.get(t[0], []):
            tm = toks[m]
            if m != n and len(tm) > len(t) and tm[-1] == t[-1] and set(t) <= set(tm):
                links.append((n, m))
    return sorted(set(links))


def build_groups(rows: np.ndarray) -> tuple[np.ndarray, dict]:
    """Group id per given row (connected components) and diagnostics."""
    dsu = _DSU()
    row_names = {int(r): artist_names(TABLE.at[int(r), "Artist"]) for r in rows}
    all_names = set().union(*row_names.values())
    assert all(row_names.values()), "every row needs at least one artist name node"
    for r, names in row_names.items():
        for n in names:
            dsu.union(("row", r), ("name", n))
    links = variant_links(all_names)
    for a, b in links:
        dsu.union(("name", a), ("name", b))
    for alias in MANUAL_ALIASES:
        nodes = [_name(a) for a in alias]
        missing = [a for a, n in zip(alias, nodes) if n not in all_names]
        assert not missing, f"alias names not in the table: {missing}"
        for n in nodes[1:]:
            dsu.union(("name", nodes[0]), ("name", n))
    by_uri = defaultdict(list)
    for r in rows:
        by_uri[TABLE.at[int(r), "URI"]].append(int(r))
    for rs in by_uri.values():
        for r in rs[1:]:
            dsu.union(("row", rs[0]), ("row", r))
    roots = [dsu.find(("row", int(r))) for r in rows]
    ids = {root: i for i, root in enumerate(dict.fromkeys(roots))}
    groups = np.array([ids[x] for x in roots])
    return groups, {"row_names": row_names, "variant_links": links, "n_names": len(all_names)}


# ------------------------------------------------------------------ genre families

# Ordered rules: the first family whose pattern matches the primary genre (lower-cased) wins.
FAMILY_RULES: list[tuple[str, str]] = [
    ("soundtrack", r"film score|film soundtrack|video game|television music|show tunes|cartoon music"),
    ("metal", r"metal|grindcore|deathgrind|djent|nwobhm|neue deutsche h"),
    ("hip hop", r"hip hop|\brap\b|boom bap|\btrap\b|^drill$|g-funk|dirty south|horrorcore|chopped and screwed|grime|chipmunk soul"),
    ("jazz", r"jazz|\bbop\b|bebop|big band|third stream|^swing$|^stride$|^standards$|free improvisation"),
    ("classical", r"classical|symphony|romanticism|minimalism|baroque music|chamber music|^choral$|^opera$|impressionism|spectralism|renaissance|gregorian|stochastic|totalism"),
    ("indie / post-punk", r"post-punk|new wave|indie|alternative rock|alternative dance|shoegaze|dream pop|noise rock|noise pop|post-rock|slowcore|grunge|gothic rock|jangle|lo-fi|britpop|math rock|darkwave|coldwave|ethereal wave|twee|no wave|dunedin|paisley|madchester|blackgaze"),
    ("punk / hardcore", r"punk|hardcore|\bemo|screamo|mathcore|d-beat|^oi!$|queercore|2 tone"),
    ("prog / psych", r"prog|psychedel|krautrock|canterbury|space rock|zeuhl|rock in opposition|heavy psych|art rock|experimental rock|jam band|acid rock|neo-psychedelia|symphonic rock|rock opera"),
    ("latin / world", r"mpb|bossa|samba|tropic|salsa|son cubano|afrobeat|afro-|flamenco|tango|mande|songhai|qawwali|hindustani|persian|gamelan|tuvan|klezmer|ethio|manguebeat|vanguarda|bai[aã]o|danz[oó]n|portuguese|latin|nueva|nova can|andalusian"),
    ("folk / country / songwriter", r"^(?!.*\brock\b).*(folk|singer-songwriter|country|americana|bluegrass|american primitivism|canzone|chanson|cowboy|poezja|nashville|neofolk)"),
    ("soul / funk / blues / reggae", r"soul|funk|r&b|rhythm & blues|disco|gospel|motown|boogie|reggae|\bdub\b|dancehall|lovers rock|^(?!.*\brock\b).*blues|new jack swing|girl group"),
    ("electronic / ambient", r"electronic|ambient|idm|techno|house|trip hop|drone|glitch|garage$|downtempo|breakcore|\bbass\b|wonky|berlin school|industrial|plunderphonics|vaporwave|club|big beat|tape music|new age|trance|brostep|ebm|synthwave|^noise$|power noise|sound collage|^experimental$|hardcore breaks|mashup"),
    ("rock", r"rock|glam|power pop|merseybeat|freakbeat|mod revival|rockabilly"),
    ("pop", r"pop|shibuya|easy listening|cabaret"),
]
_COMPILED = [(f, re.compile(p)) for f, p in FAMILY_RULES]


def genre_family(primary: str) -> str:
    s = str(primary).lower()
    if s == "unknown":
        return "unknown"
    for fam, rx in _COMPILED:
        if rx.search(s):
            return fam
    return "other"


def strat_labels(rows: np.ndarray) -> np.ndarray:
    fam = np.array([genre_family(p) for p in load_genres()["primary"].to_numpy()[rows]], dtype=object)
    counts = Counter(fam)
    return np.array([f if counts[f] >= MIN_FAMILY and f != "unknown" else "other" for f in fam], dtype=object)


# ------------------------------------------------------------------ split + checks

def make_split() -> dict:
    rows = np.flatnonzero(LABELLED)
    groups, diag = build_groups(rows)
    y = strat_labels(rows)
    sgkf = StratifiedGroupKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    fold_of = np.empty(len(rows), dtype=int)
    for fold, (_, idx) in enumerate(sgkf.split(np.zeros(len(rows)), y, groups)):
        fold_of[idx] = fold
    # The largest group (the jazz collaboration component, ~150 rows = most of one fold) would skew a
    # 3-fold split, so its fold is always one of the 14 train folds; the other folds keep their order.
    big_fold = int(fold_of[groups == np.bincount(groups).argmax()][0])
    order = [big_fold] + [f for f in range(N_FOLDS) if f != big_fold]
    name_of = {f: FOLD_SPLIT[i] for i, f in enumerate(order)}
    assign = np.array([name_of[f] for f in fold_of], dtype=object)
    return {"rows": rows, "assign": assign, "groups": groups, "strat": y, "diag": diag, "fold": fold_of}


def verify(split: np.ndarray) -> dict:
    """Leakage checks on a row -> split array (length N_ROWS, "none" for unlabelled rows). Raises on failure.
    Independent of how the split was made, except that the name nodes come from artist_names()."""
    rows = np.flatnonzero(split != "none")
    assert set(rows) == set(np.flatnonzero(LABELLED)), "split must cover exactly the labelled rows"
    assert set(split[rows]) == {"train", "val", "test"}

    def crossing(keys_per_row: dict[int, set]) -> list:
        seen: dict = {}
        bad = []
        for r, keys in keys_per_row.items():
            for k in keys:
                if seen.setdefault(k, split[r]) != split[r]:
                    bad.append(k)
        return bad

    raw = crossing({int(r): {TABLE.at[int(r), "Artist"]} for r in rows})
    names = {int(r): artist_names(TABLE.at[int(r), "Artist"]) for r in rows}
    name_cross = crossing(names)
    uri = crossing({int(r): {TABLE.at[int(r), "URI"]} for r in rows})
    assert not raw, f"raw artist strings in two splits: {raw[:5]}"
    assert not name_cross, f"artist names in two splits: {name_cross[:5]}"
    assert not uri, f"Spotify URIs in two splits: {uri[:5]}"
    # variant-linked names must not straddle splits either
    name_split = {n: split[r] for r, ns in names.items() for n in ns}
    alias_links = [(_name(al[0]), _name(x)) for al in MANUAL_ALIASES for x in al[1:]]
    straddle = [(a, b) for a, b in variant_links(set(name_split)) + alias_links if name_split[a] != name_split[b]]
    assert not straddle, f"name variants in two splits: {straddle[:5]}"
    return {"raw_artists": len({TABLE.at[int(r), 'Artist'] for r in rows}), "names": len(name_split),
            "uris": len({TABLE.at[int(r), 'URI'] for r in rows})}


def report(split: np.ndarray, res: dict | None = None) -> None:
    g = load_genres()
    rows = np.flatnonzero(split != "none")
    print(f"labelled rows: {len(rows)} of {N_ROWS} (unlabelled: {np.flatnonzero(~LABELLED).tolist()})")
    print(f"genre join: exact {int((g['how'] == 'exact').sum())}, normalised {int((g['how'] == 'normalised').sum())}, "
          f"failed {int((~g['matched']).sum())} of {N_ROWS} "
          f"({g['matched'].mean():.4%} matched; {int(g['ambiguous'].sum())} rows match more than one genre-scrape row, first used)")
    print("failed join:", [(TABLE.at[i, 'Artist'], TABLE.at[i, 'Title']) for i in np.flatnonzero(~g['matched'].to_numpy())])
    if res is not None:
        sizes = np.bincount(res["groups"])
        print(f"groups: {len(sizes)} (singletons {int((sizes == 1).sum())}, largest {np.sort(sizes)[::-1][:8].tolist()}); "
              f"name nodes {res['diag']['n_names']}, variant links {len(res['diag']['variant_links'])}")
        for name in ("train", "val", "test"):
            m = res["assign"] == name
            print(f"  {name}: {int(m.sum())} rows ({m.mean():.3%}), {len(set(res['groups'][m]))} groups")
    else:
        for name in ("train", "val", "test"):
            m = split == name
            print(f"  {name}: {int(m.sum())} rows ({m.sum() / len(rows):.3%})")
    fam = np.array([genre_family(p) for p in g["primary"]], dtype=object)
    fams = [f for f, _ in Counter(fam[rows]).most_common()]
    print(f"\n{'genre family (primary genre)':32s} {'all':>6s} {'train':>7s} {'val':>7s} {'test':>7s}   (share of split)")
    for f in fams:
        cells = [f"{(fam[split == s] == f).mean():7.3f}" for s in ("train", "val", "test")]
        print(f"{f:32s} {int((fam[rows] == f).sum()):6d} " + " ".join(cells))
    prev = {s: YB[split == s].mean(0) for s in ("train", "val", "test")}
    print("\nlabel prevalence (120 descriptors), Pearson r between splits: "
          f"train-val {np.corrcoef(prev['train'], prev['val'])[0, 1]:.4f}, "
          f"train-test {np.corrcoef(prev['train'], prev['test'])[0, 1]:.4f}, "
          f"val-test {np.corrcoef(prev['val'], prev['test'])[0, 1]:.4f}")
    for s in ("train", "val", "test"):
        m = split == s
        pos = YB[m].sum(0)
        print(f"  {s}: mean descriptors/album {N_DESC[m].mean():.2f}, median {np.median(N_DESC[m]):.0f}, "
              f"labels with 0 positives {int((pos == 0).sum())}, with <5 positives {int((pos < 5).sum())}")
    info = verify(split)
    print(f"\nleakage assertions passed: no raw artist string ({info['raw_artists']}), no normalised artist name "
          f"({info['names']}), no variant-linked name pair and no Spotify URI ({info['uris']}) occurs in two splits")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the existing splits.json instead of writing it")
    args = ap.parse_args()
    if args.check:
        report(load_splits())
        return
    res = make_split()
    split = np.full(N_ROWS, "none", dtype=object)
    split[res["rows"]] = res["assign"]
    verify(split)
    payload = {
        "description": "row (position in rmr_pipeline.table.load_table()) -> train/val/test; artist-disjoint, "
                       "URI-disjoint, stratified by primary RYM genre family; unlabelled rows are absent",
        "seed": SEED, "n_folds": N_FOLDS, "fold_assignment": "fold with the largest group first, then fold order; 14 train, 3 val, 3 test",
        "counts": {s: int((split == s).sum()) for s in ("train", "val", "test")},
        "rows": {str(int(r)): str(split[r]) for r in res["rows"]},
    }
    SPLITS_PATH.write_text(json.dumps(payload, indent=0, ensure_ascii=False) + "\n")
    print(f"wrote {SPLITS_PATH}")
    report(split, res)


if __name__ == "__main__":
    main()
