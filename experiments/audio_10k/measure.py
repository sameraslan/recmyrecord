"""Sonic-only measurements of the CLAP block over the 10k catalog: RYM-based proxies, descriptive.

    cd experiments/audio_10k
    nice -n 19 <build venv python> measure.py     -> results/sonic_measures.json, results/sonic_measures.md

Lists are the ten nearest albums by the 64-number audio block alone (euclidean; sonic.nearest). Everything is
read-only on the catalog, the CLAP store and the clip cache; see sonic.py for what the two blocks are.

What the numbers are, and are not:
  - They are computed over the whole catalog with audio. There is no held-out split here and nothing was
    tuned on them; the earlier experiments' test splits are spent and are not used. They describe the lists,
    they do not evaluate them.
  - Genres and descriptors are the RYM sheet's columns of catalog/albums.csv (`primary_genres`,
    `top_descriptors`). Agreement with RYM labels is a proxy for "sounds alike", not a measure of it: nobody
    listened. A model that reads genre from audio scores high on the genre columns by construction.

Measures (per seed, then the mean over the seeds where it is defined; `n` = those seeds):
  genre_primary   share of the ten whose first-listed primary genre equals the seed's (pairs where both have
                  a genre). simbench's genre_primary, on the sheet's genres.
  genre_any       share of the ten sharing at least one primary genre with the seed. simbench's genre_any.
  genre_family    share in the seed's coarse family (preview_features/genres.family of the first genre).
  desc_jaccard    mean Jaccard overlap between the seed's top descriptors and each neighbour's, pairs where
                  both have at least MIN_DESC (5) descriptors.
  desc_shared     mean number of top descriptors shared, same pairs.
  *_xa            the same with the seed artist's other albums removed from the candidates (as
                  simbench/crossgenre's *_xa). Without the suffix the artist's albums stay, as the site shows.
  random          the same code on ten random other albums per seed (seed 0): the floor.
New and existing albums: `share_of_neighbours_new` is the share of a group's neighbours that are new albums,
to set against the share of new albums in the pool. `same_genre_share_new` is what the catalog's make-up alone
would give: per seed, the share of new albums among the other albums with its first primary genre (new albums
sit lower on the chart and their genres differ from the site's). A block whose lists hold more new albums for
new seeds than that is separating new from existing by something other than RYM genre: it may be the music
(era, production, how well known the record is), or it could be how the two batches were made (the existing
albums' clips were embedded by an earlier run). `same_track_check` looks at the second: tracks the cache holds
twice, embedded once by each run under two keys of one album, and the cosine between the two vectors. At 1.0
the two runs make the same vector from the same preview, and the difference is in the albums.
Hubness (simbench.hubness): N10 = the number of lists an album is in (mean 10); skew of N10, share of albums
in no list, the largest N10, and the most-recommended albums.

Comparable with the earlier reports (experiments/preview_features/REPORT*.md)? Only in definition.
genre_primary / genre_any / genre_family / *_xa and the hubness numbers are computed as there, but on other
labels (the sheet's genres, not the 2023 scrape's), another pool (about 9,600 albums, not 3,944 or 1,000: a
larger pool has more same-genre candidates and more near neighbours) and, for EffNet, four-clip means through
a PCA fitted here. Levels must not be set against those reports. desc_jaccard is not their desc_cos (cosine
over 120 weighted descriptor columns of the feature table, which only the site's albums have). The rows of
one table here are comparable with each other: same albums, same labels, same code.
"""
import argparse
import datetime
import json
from pathlib import Path

import numpy as np

import sonic
from genres import family
from sonic import K, MIN_DESC, RESULTS

TOP_HUBS = 15
MEASURES = ("genre_primary", "genre_any", "genre_family", "desc_jaccard", "desc_shared")


class Labels:
    """The sheet's genres and descriptors as arrays, for a set of albums."""

    def __init__(self, genres: list[list[str]], descriptors: list[frozenset]):
        vocab = {g: i for i, g in enumerate(sorted({x for g in genres for x in g}))}
        self.has_genre = np.array([bool(g) for g in genres])
        self.primary = np.array([vocab[g[0]] if g else -1 for g in genres])
        fams = {}
        self.family = np.array([fams.setdefault(family(g[0]), len(fams)) if g else -1 for g in genres])
        self.G = np.zeros((len(genres), len(vocab)), dtype=np.float32)
        for r, g in enumerate(genres):
            self.G[r, [vocab[x] for x in g]] = 1
        dvocab = {d: i for i, d in enumerate(sorted({x for d in descriptors for x in d}))}
        self.D = np.zeros((len(descriptors), len(dvocab)), dtype=np.float32)
        for r, d in enumerate(descriptors):
            self.D[r, [dvocab[x] for x in d]] = 1
        self.n_desc = self.D.sum(axis=1)
        self.has_desc = self.n_desc >= MIN_DESC

    def per_seed(self, lists: np.ndarray) -> dict[str, np.ndarray]:
        """Each measure per seed (NaN where it is not defined) for lists of row indexes."""
        seeds = np.arange(len(lists))[:, None]
        both = self.has_genre[seeds] & self.has_genre[lists]
        with np.errstate(invalid="ignore", divide="ignore"):
            share = lambda hit: np.where(both.any(axis=1), (hit & both).sum(axis=1) / both.sum(axis=1), np.nan)  # noqa: E731
            out = {"genre_primary": share(self.primary[seeds] == self.primary[lists]),
                   "genre_any": share(np.einsum("sg,skg->sk", self.G, self.G[lists]) > 0),
                   "genre_family": share(self.family[seeds] == self.family[lists])}
            shared = np.einsum("sd,skd->sk", self.D, self.D[lists])
            union = self.n_desc[seeds] + self.n_desc[lists] - shared
            ok = self.has_desc[seeds] & self.has_desc[lists]
            mean = lambda v: np.where(ok.any(axis=1), np.where(ok, v, 0).sum(axis=1) / ok.sum(axis=1), np.nan)  # noqa: E731
            out["desc_jaccard"] = mean(shared / union)
            out["desc_shared"] = mean(shared)
        return out


def summary(v: np.ndarray, mask: np.ndarray | None = None) -> dict:
    v = v if mask is None else v[mask]
    ok = ~np.isnan(v)
    return {"mean": round(float(v[ok].mean()), 4) if ok.any() else None, "n": int(ok.sum())}


def hubness(lists: np.ndarray) -> tuple[dict, np.ndarray]:
    """simbench.hubness, without scipy: the skew is the biased sample skewness, as scipy.stats.skew."""
    n10 = np.bincount(lists.ravel(), minlength=len(lists))
    d = n10 - n10.mean()
    skew = float((d ** 3).mean() / (d ** 2).mean() ** 1.5)
    return {"skew": round(skew, 3), "never": round(float((n10 == 0).mean()), 4), "max": int(n10.max())}, n10


def describe(albums: sonic.Albums, i: int) -> dict:
    r = albums.rows[i]
    return {"key": r["rym_id"], "artist": r["artist"], "title": r["title"], "year": r["year"],
            "rank": int(r["rank"]) if r["on_chart"] == "1" and r["rank"].isdigit() else None,
            "primary_genres": r["primary_genres"], "new": bool(albums.new[i]), "n_clips": int(albums.n_clips[i]),
            "source": str(albums.source[i])}


def score(X: np.ndarray, albums: sonic.Albums, labels: Labels, name: str) -> dict:
    """Every measure for one block over `albums` (rows aligned)."""
    lists, xa = sonic.nearest(X), sonic.nearest(X, exclude=albums.artist)
    rand = np.random.default_rng(0)
    random = np.stack([rand.choice(len(X) - 1, K, replace=False) for _ in range(len(X))])
    random += random >= np.arange(len(X))[:, None]  # never the seed itself
    kept, removed, floor = labels.per_seed(lists), labels.per_seed(xa), labels.per_seed(random)
    hub, n10 = hubness(lists)
    new, short = albums.new, albums.n_clips < sonic.CLIPS
    windows = np.isin(albums.source, sonic.WINDOW_SOURCES)
    same = labels.primary[:, None] == labels.primary[None, :]
    with np.errstate(invalid="ignore", divide="ignore"):
        same_new = np.where(labels.has_genre & (same.sum(axis=1) > 1),
                            ((same & new[None, :]).sum(axis=1) - new) / (same.sum(axis=1) - 1), np.nan)
    del same
    groups = {"all": np.ones(len(X), bool), "new": new, "existing": ~new, "under_4_clips": short & ~windows,
              "4_clips": (albums.n_clips == sonic.CLIPS) & ~windows, "full_length_windows": windows}

    def group(mask: np.ndarray) -> dict:
        if not mask.any():
            return {"albums": 0}
        return {"albums": int(mask.sum()),
                **{m: summary(kept[m], mask) for m in MEASURES},
                **{m + "_xa": summary(removed[m], mask) for m in MEASURES},
                "share_of_neighbours_new": round(float(new[lists[mask]].mean()), 4),
                "same_genre_share_new": summary(same_new, mask)["mean"],
                "mean_n10": round(float(n10[mask].mean()), 2), "never_recommended": round(float((n10[mask] == 0).mean()), 4),
                "max_n10": int(n10[mask].max())}

    top = np.argsort(-n10, kind="stable")[:TOP_HUBS]
    return {"name": name, "albums": len(X), "new_albums": int(new.sum()), "share_new_in_pool": round(float(new.mean()), 4),
            "albums_with_genre": int(labels.has_genre.sum()), "albums_with_5_descriptors": int(labels.has_desc.sum()),
            "metrics": {m: summary(kept[m]) for m in MEASURES} | {m + "_xa": summary(removed[m]) for m in MEASURES},
            "random": {m: summary(floor[m]) for m in MEASURES},
            "hubness": hub, "groups": {g: group(mask) for g, mask in groups.items()},
            "most_recommended": [describe(albums, int(i)) | {"n10": int(n10[i])} for i in top],
            "lists": lists}


def same_track_check(cache_db: Path) -> dict:
    """Tracks the cache holds under two album keys with embeddings of different origin (the earlier run's,
    imported, and the one-pass run's): how many, and the cosine between the two vectors of each. Such pairs
    exist while a re-paired album is still in the cache under its old key."""
    from rmr_audio.onepass_cache import MODELS, read_only

    con = read_only(cache_db)
    try:
        out = {}
        for model, spec in MODELS.items():
            cos = []
            for a, b in con.execute(
                    "SELECT a.emb, b.emb FROM embeddings a JOIN embeddings b ON a.source = b.source AND a.album_id = b.album_id "
                    "AND a.track_id = b.track_id AND a.model = b.model AND a.key < b.key WHERE a.model = ? AND a.status = 'ok' "
                    "AND b.status = 'ok' AND a.origin != b.origin", (model,)):
                x, y = (np.frombuffer(v, spec.dtype).astype(np.float64) for v in (a, b))
                cos.append(float(x @ y / np.linalg.norm(x) / np.linalg.norm(y)))
            out[model] = {"tracks": len(cos), "min_cosine": round(min(cos), 5) if cos else None,
                          "mean_cosine": round(float(np.mean(cos)), 5) if cos else None}
        return out
    finally:
        con.close()


def subset(albums: sonic.Albums, pos: np.ndarray) -> sonic.Albums:
    return sonic.Albums([albums.rows[i] for i in pos], albums.keys[pos], albums.new[pos], albums.n_clips[pos],
                        albums.source[pos], albums.artist[pos], [albums.genres[i] for i in pos],
                        [albums.descriptors[i] for i in pos], albums.catalog_size)


def run(catalog: Path, clap_dir: Path, cache_db: Path) -> dict:
    albums, clap = sonic.load_albums(catalog, clap_dir)
    pos, effnet = sonic.effnet_block(albums, cache_db)
    both = subset(albums, pos)
    existing = np.flatnonzero(~both.new)
    old = subset(both, existing)
    pools = {
        "catalog": {"what": "every catalog album with CLAP audio", "albums": albums, "blocks": {"clap": clap}},
        "both_models": {"what": "the albums with both models' clips: the same albums, labels and candidates for the two rows",
                        "albums": both, "blocks": {"clap": clap[pos], "effnet_4clip": effnet}},
        "existing_only": {"what": "the site's albums only (seeds and candidates): the pool closest to the earlier reports'",
                          "albums": old, "blocks": {"clap": clap[pos][existing], "effnet_4clip": effnet[existing]}},
    }
    out = {"generated": datetime.date.today().isoformat(),
           "note": "RYM-based proxies over the whole catalog with audio; descriptive, not a held-out evaluation. "
                   "See measure.py's docstring for the definitions and for what is comparable.",
           "catalog_albums": albums.catalog_size, "with_clap_audio": len(albums), "with_both_models": len(both),
           "clips_per_album": {str(c): int(n) for c, n in zip(*np.unique(albums.n_clips, return_counts=True))},
           "sources": {str(s): int(n) for s, n in zip(*np.unique([x.split(":")[0] for x in albums.source.tolist()], return_counts=True))},
           "same_track_check": same_track_check(cache_db), "pools": {}}
    for name, pool in pools.items():
        labels = Labels(pool["albums"].genres, pool["albums"].descriptors)
        res = {b: score(X, pool["albums"], labels, b) for b, X in pool["blocks"].items()}
        entry = {"what": pool["what"]}
        if len(res) == 2:
            a, b = (res[k]["lists"] for k in ("clap", "effnet_4clip"))
            entry["overlap_at_10"] = round(float(np.mean([len(set(x) & set(y)) for x, y in zip(a.tolist(), b.tolist())])), 3)
        for r in res.values():
            del r["lists"]
        out["pools"][name] = entry | {"blocks": res}
    return out


def _f(m: dict | None, digits: int = 3) -> str:
    return "–" if not m or m.get("mean") is None else f"{m['mean']:.{digits}f}"


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header), *("| " + " | ".join(r) + " |" for r in rows), ""]


def markdown(res: dict) -> str:
    cat = res["pools"]["catalog"]["blocks"]["clap"]
    lines = ["# Sonic-only measures of the CLAP block over the 10k catalog", "",
             f"Generated {res['generated']} by `measure.py`. Provisional until the clip cache and the catalog are final.", "",
             "**These are RYM-based proxies, computed over the whole catalog with audio. They describe the lists; they are "
             "not a held-out evaluation, and nobody listened.** Lists are the ten nearest albums by the 64-number audio "
             "block alone. Genres and descriptors are the sheet's columns in `catalog/albums.csv`. The earlier experiments' "
             "test splits are spent and are not used here. Definitions, and why the levels are not comparable with the "
             "earlier reports, are in the docstring of `measure.py`.", "",
             f"Catalog: {res['catalog_albums']:,} albums; {res['with_clap_audio']:,} have CLAP audio "
             f"({cat['new_albums']:,} new, {cat['albums'] - cat['new_albums']:,} on the site); "
             f"{res['with_both_models']:,} have both models. {cat['albums_with_genre']:,} of those with CLAP audio have a "
             f"genre in the sheet, {cat['albums_with_5_descriptors']:,} have five or more top descriptors (the site's "
             "off-chart albums have neither).",
             "Clips behind the CLAP mean: " + ", ".join(f"{c}: {n:,}" for c, n in res["clips_per_album"].items()) + ".", ""]
    head = ["Pool", "Block", "Albums", "genre_primary", "genre_any", "genre_family", "desc_jaccard", "desc_shared",
            "genre_primary_xa", "desc_jaccard_xa", "Never recommended", "Max N10", "N10 skew"]
    rows = []
    for pname, pool in res["pools"].items():
        for bname, b in pool["blocks"].items():
            m = b["metrics"]
            rows.append([pname, bname, f"{b['albums']:,}", *(_f(m[k]) for k in MEASURES[:4]), _f(m["desc_shared"], 2),
                         _f(m["genre_primary_xa"]), _f(m["desc_jaccard_xa"]), f"{b['hubness']['never']:.1%}",
                         str(b["hubness"]["max"]), f"{b['hubness']['skew']:.2f}"])
        b = next(iter(pool["blocks"].values()))
        rows.append([pname, "random (floor)", f"{b['albums']:,}", *(_f(b["random"][k]) for k in MEASURES[:4]),
                     _f(b["random"]["desc_shared"], 2), "", "", "", "", ""])
    lines += ["## Top 10 by the audio block alone", "", *_table(head, rows),
              "Pools: " + "; ".join(f"`{n}` = {p['what']}" for n, p in res["pools"].items()) + ". `effnet_4clip` is not the "
              "site's EffNet block: it is the cache's four-clip means through a PCA fitted on the pool's albums (see "
              "`sonic.py`). Mean shared neighbours between the CLAP and EffNet lists (of 10): "
              + ", ".join(f"{n} {p['overlap_at_10']}" for n, p in res["pools"].items() if "overlap_at_10" in p) + ".", ""]

    def groups(block: dict, names: tuple[str, ...], label: str = "") -> list[list[str]]:
        out = []
        for g in names:
            v = block["groups"][g]
            if not v["albums"]:
                out.append([label + g, "0", *[""] * 8])
                continue
            out.append([label + g, f"{v['albums']:,}", _f(v["genre_primary"]), _f(v["desc_jaccard"]),
                        f"{v['share_of_neighbours_new']:.1%}",
                        "–" if v["same_genre_share_new"] is None else f"{v['same_genre_share_new']:.1%}",
                        f"{v['mean_n10']:.1f}", f"{v['never_recommended']:.1%}", str(v["max_n10"]), str(v["genre_primary"]["n"])])
        return out

    stc = res["same_track_check"]
    check = ("The cache holds no track embedded by both runs, so the second cannot be checked here." if not stc["clap"]["tracks"] else
             f"On the second: {stc['clap']['tracks']} tracks are in the cache twice, embedded once by each run; the cosine "
             f"between the two vectors is at least {stc['clap']['min_cosine']:.4f} for CLAP"
             + (f" and {stc['effnet']['min_cosine']:.4f} for EffNet ({stc['effnet']['tracks']} tracks)" if stc["effnet"]["tracks"] else "")
             + ". At 1.0 the two runs make the same vector from the same preview, and the difference is in the albums.")
    ghead = ["Seeds", "Albums", "genre_primary", "desc_jaccard", "Neighbours that are new", "Same-genre albums that are new",
             "Mean N10", "Never recommended", "Max N10", "Seeds with a genre"]
    both = res["pools"]["both_models"]["blocks"]
    lines += ["## New and existing albums", "",
              f"New albums are {cat['share_new_in_pool']:.1%} of the albums with CLAP audio: a list that ignored whether an "
              "album is new would hold that share of new albums. \"Same-genre albums that are new\" is what the catalog's "
              "make-up alone would give (the share of new albums among the other albums with the seed's first primary "
              "genre). Mean N10 is how many lists an album of the group appears in (10 on average over all albums). The "
              "first three rows are the whole catalog with CLAP audio, the others the albums with both models.", "",
              *_table(ghead, groups(cat, ("all", "new", "existing"), "clap, ")
                      + [r for b in ("clap", "effnet_4clip") for r in groups(both[b], ("new", "existing"), f"both models: {b}, ")]),
              "A block whose lists hold more new albums for new seeds than the same-genre share, and fewer for existing "
              "seeds, separates new from existing albums by something other than RYM genre. That can be the music (era, "
              "production, how well known the record is) or how the two batches were made (the existing albums' clips were "
              "embedded by an earlier run). " + check, "",
              "## By clips behind the mean (CLAP, whole catalog)", "",
              *_table(ghead, groups(cat, ("4_clips", "under_4_clips", "full_length_windows"))),
              "`under_4_clips`: the listing has fewer than four previews. `full_length_windows`: windows of a full-length "
              "file (local, youtube, bandcamp), where the mean takes every window.", "",
              "## Most-recommended albums (CLAP, whole catalog)", "",
              *_table(["N10", "Album", "Year", "Rank", "Primary genres", "New", "Clips"],
                      [[str(a["n10"]), f"{a['artist']}, {a['title']}", a["year"], str(a["rank"] or ""), a["primary_genres"],
                        "new" if a["new"] else "", str(a["n_clips"])] for a in cat["most_recommended"]]),
              "## What these numbers can and cannot say", "",
              "- They can say whether the CLAP block's neighbours share RYM genres and descriptors more or less often than "
              "the EffNet block's on the same albums, whether new albums are reachable (they appear in lists about as "
              "often as their share), and whether a few albums crowd the lists.",
              "- They cannot say that a list sounds right. A higher genre match is not better by itself: the owner chose "
              "CLAP partly because it crosses genres. The listening page (`listening_page.py`) is the check for that.",
              "- The genre and descriptor columns are empty for the site's off-chart albums, so those albums count as "
              "candidates and in hubness, not in the genre or descriptor means (`n` in the JSON).",
              "- No confidence intervals: these are whole-catalog means, not estimates from a sample.", ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--catalog", type=Path, default=sonic.DEFAULT_CATALOG)
    p.add_argument("--clap-dir", type=Path, default=sonic.STORES["clap"])
    p.add_argument("--cache", type=Path, default=sonic.DEFAULT_CACHE_DB, help="The one-pass clip cache (opened read-only).")
    p.add_argument("--out", type=Path, default=RESULTS)
    args = p.parse_args(argv)
    res = run(args.catalog, args.clap_dir, args.cache)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "sonic_measures.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (args.out / "sonic_measures.md").write_text(markdown(res), encoding="utf-8")
    print(f"wrote {args.out / 'sonic_measures.json'} and {args.out / 'sonic_measures.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
