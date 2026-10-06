"""The catalog build's albums: every row of catalog/albums.csv as a frame the build can use.

`python -m rmr_pipeline.build --catalog` builds the whole catalog table (key: `rym_id`) instead of the
feature table's albums. The site's albums come first in the catalog, in the feature table's order, so
album numbers and slugs stay what they are; the new albums follow.

Every album is described by its first CATALOG_DESCRIPTORS (8) descriptors, weighted by their place among
those eight (WEIGHT_PROFILES):

  an existing album   table            the eight largest of its 176 table cells (a cell is (63 - place) / 42,
                                       so the largest are the first on its RYM page), the three vocals
                                       descriptors kept
                      table-novocals   the same without the three vocals columns: the sheet never lists them,
                                       so a new album never has one (the build's default, DEFAULT_EXISTING)
                      sheet            its `top_descriptors` in the catalog, as for a new album; an album
                                       without a list falls back to table-novocals
  a new album         the first eight names of its `top_descriptors`, in that order. A name is a table
                      column (whatever its case) or an alias of one (catalog/descriptor_aliases.json: RYM
                      renamed a few). A name with no column is dropped and takes no place, like the gaps
                      the table has where the scrape met a name it did not know.
"""
import json
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist

from .artists import _latin
from .audio import DEFAULT_CATALOG
from .constants import AUDIO, CATALOG_DESCRIPTORS, LYRIC_DROP, META, PIPELINE_DIR, VOCALS
from . import covers as _covers
from .covers import Covers, cover_for

DEFAULT_ALIASES = PIPELINE_DIR / "catalog" / "descriptor_aliases.json"
EXISTING = ("table", "table-novocals", "sheet")
CATALOG_FIELDS = ("rym_id", "title", "artist", "title_latin", "artist_latin", "top_descriptors", "spotify_url",
                  "legacy_uri")
SPOTIFY_URL_RE = re.compile(r"^https://open\.spotify\.com/album/([0-9A-Za-z]{22})(?:[/?#].*)?$")
CLUSTER_NEIGHBOURS = 5
CHUNK = 1 << 22  # numbers per temporary array


def _same_length(profile: list[float], as_: list[float]) -> tuple[float, ...]:
    """`profile` scaled to the L2 length of `as_`."""
    s = math.sqrt(sum(w * w for w in as_) / sum(w * w for w in profile))
    return tuple(w * s for w in profile)


_RANK = [(63 - p) / 42 for p in range(CATALOG_DESCRIPTORS)]  # the feature table's own weights: 1.5 - place / 42
# The weight of a descriptor by its place (0 = first) among the album's eight. `equal` and `slope` (1 down to
# 0.5) are scaled so that a full row of eight is as long as with `rank`: the slider stops keep their meaning.
WEIGHT_PROFILES = {
    "rank": tuple(_RANK),
    "equal": _same_length([1.0] * CATALOG_DESCRIPTORS, _RANK),
    "slope": _same_length([1 - p / 14 for p in range(CATALOG_DESCRIPTORS)], _RANK),
}
# What `build --catalog` uses unless --descriptor-weights says otherwise (the owner's decision of 6 October
# 2026: the weights are not equal; the gentle slope, to be confirmed against `rank`). catalog_frame's own
# default stays `rank`, the feature table's.
DEFAULT_WEIGHTS = "slope"
# And for --existing-descriptors (the owner's decision of 6 October 2026: the three vocals descriptors are
# dropped for every album. The sheet does not list them, so only the existing albums would carry them; to
# be revisited if the sheet gains vocals for all albums).
DEFAULT_EXISTING = "table-novocals"


class CatalogError(Exception):
    """The catalog table (or the alias file) is missing or does not fit the feature table."""


@dataclass(frozen=True)
class DescriptorReport:
    """What became of the names in the `top_descriptors` lists that were read (their first eight)."""
    lists: int  # albums with a list
    kept: int  # names of the 120 columns the recommender keeps
    lyric: int  # names of the 56 lyric and theme columns it drops
    vocals: int  # names of a vocals column, left out unless the existing albums keep theirs (`table`)
    unknown: int  # names with no column
    unknown_names: dict[str, int]  # those names, most frequent first


@dataclass(frozen=True)
class CatalogAlbums:
    frame: pd.DataFrame  # one row per catalog album: Title, Artist, URI ('' for a new album), the descriptor columns
    places: pd.DataFrame  # the descriptor columns: the place (0..7) of the descriptor among the album's eight, -1 = not one
    keys: list[str]  # rym_id
    spotify_ids: list[str]  # '' when the album has no Spotify link; an existing album's is the sheet's when it has one
    is_new: np.ndarray  # (albums,) bool: not in the feature table
    slug_titles: list[str]  # what the slug is made from: the romanised title of a new album when there is one
    slug_artists: list[str]  # (an existing album's artist is the table's, not cleaned yet)
    existing: str
    weights: str
    report: DescriptorReport
    legacy_ids: list[str] = field(default_factory=list)  # the id of the feature table's URI, '' for a new album

    def summary(self) -> str:
        r, n_new = self.report, int(self.is_new.sum())
        has = (self.places.to_numpy() >= 0).any(axis=1)
        names = ", ".join(f"{name} {n}" for name, n in list(r.unknown_names.items())[:8])
        more = len(r.unknown_names) - 8
        return (f"catalog: {len(self.is_new) - n_new} existing albums ({self.existing}) and {n_new} new, first "
                f"{CATALOG_DESCRIPTORS} descriptors, {self.weights} weights; {r.lists} sheet lists read: {r.kept} names "
                f"in kept columns, {r.lyric} in lyric columns, {r.vocals} vocals, {r.unknown} unknown "
                f"({len(r.unknown_names)} names{': ' + names if names else ''}{f' and {more} more' if more > 0 else ''}); "
                f"{int((~has).sum())} albums with no descriptor")


def load_catalog(path: Path = DEFAULT_CATALOG) -> pd.DataFrame:
    """catalog/albums.csv, every value a string ('' when empty)."""
    try:
        catalog = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8")
    except FileNotFoundError:
        raise CatalogError(f"missing {path}: the catalog table is not there (python -m rmr_catalog)") from None
    missing = [f for f in CATALOG_FIELDS if f not in catalog.columns]
    if missing:
        raise CatalogError(f"{path}: missing columns {missing}")
    return catalog


def load_aliases(path: Path = DEFAULT_ALIASES) -> dict[str, str]:
    """catalog/descriptor_aliases.json: {a name the sheet uses: the table column it is}."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CatalogError(f"missing {path}: the descriptor aliases are not there") from None
    except json.JSONDecodeError as e:
        raise CatalogError(f"{path} is not valid JSON: {e}") from None
    if not isinstance(data, dict) or not all(isinstance(v, str) for v in data.values()):
        raise CatalogError(f"{path} must be an object of name: table column")
    return data


def rym_columns(sub: pd.DataFrame) -> list[str]:
    """Every descriptor column of the feature table (176), the lyric and theme ones included, in its order."""
    return [c for c in sub.columns if c not in META and c not in AUDIO]


def _table_places(T: np.ndarray, allowed: np.ndarray) -> np.ndarray:
    """The place of each cell among its row's CATALOG_DESCRIPTORS largest positive cells of the `allowed`
    columns (equal cells: the earlier column first), -1 for the others."""
    T = np.where(allowed[None, :], T, 0.0)
    order = np.argsort(-T, axis=1, kind="stable")[:, :CATALOG_DESCRIPTORS]
    P = np.full(T.shape, -1, dtype=np.int8)
    rows = np.arange(len(T))
    for p in range(order.shape[1]):
        on = T[rows, order[:, p]] > 0
        P[rows[on], order[on, p]] = p
    return P


def catalog_frame(sub: pd.DataFrame, catalog: pd.DataFrame, *, weights: str = "rank",
                  existing: str = "table-novocals", aliases: dict[str, str] | None = None) -> CatalogAlbums:
    """The catalog's albums for the build. `sub`: the deduped feature table; `catalog`: load_catalog().
    `weights`: a key of WEIGHT_PROFILES; `existing`: where an existing album's eight come from (EXISTING, see
    the module docstring); `aliases`: load_aliases() when None.

    Raises CatalogError unless the catalog's first len(sub) rows are the albums of `sub` in its order
    (`legacy_uri` equal to `URI`) and no later row has a `legacy_uri`: album numbers on the site are row
    numbers, so the two must agree."""
    if weights not in WEIGHT_PROFILES:
        raise ValueError(f"weights must be one of {', '.join(WEIGHT_PROFILES)}, got {weights!r}")
    if existing not in EXISTING:
        raise ValueError(f"existing must be one of {', '.join(EXISTING)}, got {existing!r}")
    n, total = len(sub), len(catalog)
    uris = [str(u) for u in sub["URI"]]
    legacy = list(catalog["legacy_uri"])
    if total < n:
        raise CatalogError(f"the catalog has {total} album(s), the feature table {n}: run the catalog builder")
    for i, (a, b) in enumerate(zip(legacy, uris)):
        if a != b:
            raise CatalogError(f"the catalog's row {i + 1} is {a or 'a new album'} ({catalog['rym_id'].iloc[i]}) but "
                               f"album {i + 1} of the feature table is {b}: the catalog must start with the "
                               "table's albums in the table's order")
    extra = [k for k, u in zip(catalog["rym_id"].iloc[n:], legacy[n:]) if u]
    if extra:
        raise CatalogError(f"{len(extra)} catalog album(s) after the first {n} have a legacy_uri the feature table "
                           f"does not have at that place: {', '.join(extra[:5])}")
    keys = list(catalog["rym_id"])
    twice = [k for k, c in Counter(keys).items() if c > 1 or not k]
    if twice:
        raise CatalogError(f"the catalog has the key {twice[0]!r} twice (or an empty key)")

    cols = rym_columns(sub)
    col_of = {c.lower(): j for j, c in enumerate(cols)}
    for name, target in (load_aliases() if aliases is None else aliases).items():
        if target not in cols:
            raise CatalogError(f"descriptor alias {name!r}: {target!r} is not a column of the feature table")
        col_of.setdefault(name.lower(), cols.index(target))
    lyric = np.array([c in LYRIC_DROP for c in cols])
    allowed = np.array([existing == "table" or c not in VOCALS for c in cols])

    T = sub[cols].to_numpy(dtype=np.float64)
    if not np.isfinite(T).all():
        raise ValueError(f"the feature table has empty or non-finite descriptor values in rows "
                         f"{np.flatnonzero(~np.isfinite(T).all(axis=1))[:10].tolist()}")
    P = np.full((total, len(cols)), -1, dtype=np.int8)
    P[:n] = _table_places(T, allowed)

    count, unknown = Counter(), Counter()
    for i, text in enumerate(catalog["top_descriptors"]):
        if not text.strip() or (i < n and existing != "sheet"):
            continue
        count["lists"] += 1
        P[i], place = -1, 0
        for name in [s.strip() for s in text.split(",") if s.strip()][:CATALOG_DESCRIPTORS]:
            j = col_of.get(name.lower())
            if j is None:
                unknown[name] += 1
            elif not allowed[j]:
                count["vocals"] += 1
            elif P[i, j] < 0:  # a column named twice (by its name and by an alias) keeps its first place
                count["lyric" if lyric[j] else "kept"] += 1
                P[i, j] = place
                place += 1

    # The sheet's link wins over the feature table's URI (the owner's decision of 6 October 2026: "the sheet
    # is more up to date than the existing albums"; where the two differ the table's id is another edition
    # or, in the cases checked against Spotify, another album). An existing album the sheet has no link for
    # keeps its URI's id. overrides.json is applied after this, by the build, and wins over both.
    legacy_ids = [u.split(":")[-1] for u in uris] + [""] * (total - n)
    spotify_ids = []
    for key, url, old in zip(keys, catalog["spotify_url"], legacy_ids):
        m = SPOTIFY_URL_RE.match(url)
        if url and not m:
            raise CatalogError(f"{key}: spotify_url {url!r} is not an open.spotify.com album link")
        spotify_ids.append(m[1] if m else old)

    new = catalog.iloc[n:]
    profile = np.array(WEIGHT_PROFILES[weights] + (0.0,))  # place -1 reads the last entry
    frame = pd.DataFrame(profile[P], columns=cols)
    frame.insert(0, "URI", legacy)
    frame.insert(0, "Artist", [str(a) for a in sub["Artist"]] + list(new["artist"]))
    frame.insert(0, "Title", [str(t) for t in sub["Title"]] + list(new["title"]))
    is_new = np.arange(total) >= n
    report = DescriptorReport(count["lists"], count["kept"], count["lyric"], count["vocals"], sum(unknown.values()),
                              dict(unknown.most_common()))
    return CatalogAlbums(
        frame, pd.DataFrame(P, columns=cols), keys, spotify_ids, is_new,
        list(frame["Title"][:n]) + [a or b for a, b in zip(new["title_latin"], new["title"])],
        list(frame["Artist"][:n]) + [a or b for a, b in zip(new["artist_latin"], new["artist"])],
        existing, weights, report, legacy_ids)


def _pure_latin(text: str) -> bool:
    """Has a letter, and every letter is in Latin script."""
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and all(_latin(c) for c in letters)


_GROUP = re.compile(r"\(([^()]*)\)|\[([^\[\]]*)\]")


def display_title(title: str, latin: str) -> str:
    """How a new album's title is shown: `native [Latin]`, as display_artist does for the credit, when the
    title has a letter that is not in Latin script and the catalog's `title_latin` is there and different
    (the owner's decision of 6 October 2026). `title_latin` is used as given: it is a romanisation for some
    albums and an English translation for others. A title that carries a Latin form of its own is left as it
    is: RYM writes some as `Mother (マザー)` or `勝訴ストリップ (Shōso Strip)`, that is, with a part in round or
    square brackets where the part or the rest is in Latin script alone. A bracket without letters (a year),
    or one the Latin form repeats (a volume number), is not such a form. Slugs are not made from this (CatalogAlbums.slug_titles)."""
    title, latin = str(title), str(latin).strip()
    if not latin or latin == title.strip() or not any(c.isalpha() and not _latin(c) for c in title):
        return title
    # a bracket the Latin form has too (`静香 (III)`, `Shizuka (III)`) is part of the title, not a form of it
    groups = ["".join(m.groups(default="")) for m in _GROUP.finditer(title) if m.group(0) not in latin]
    if groups and (_pure_latin(_GROUP.sub(" ", title)) or any(_pure_latin(g) for g in groups)):
        return title
    return f"{title.strip()} [{latin}]"


def display_artist(artist: str, latin: str) -> str:
    """How a new album's artist is shown: `native [Latin]` (`파란노을 [Parannoul]`), the form 33 of the site's
    albums have, when the credit has a letter that is not in Latin script and the catalog's `artist_latin`
    is there and different; otherwise the credit as it is (also one that carries its brackets already).
    A credit of several names gets one bracket, with the romanisation as the catalog gives it: it can leave
    out the names that were in Latin script already, or a collaborator (`菅野よう子 & Seatbelts [Yoko Kanno]`).
    Slugs are not made from this (CatalogAlbums.slug_artists), and the site's search finds either spelling:
    it reads words, and a bracket is not part of one."""
    artist, latin = str(artist).strip(), str(latin).strip()
    if not latin or latin == artist or "[" in artist or not any(c.isalpha() and not _latin(c) for c in artist):
        return artist
    return f"{artist} [{latin}]"


def neighbour_clusters(X: np.ndarray, clusters: list[int], k: int = CLUSTER_NEIGHBOURS,
                       voters: np.ndarray | None = None) -> list[int]:
    """A cluster for each row of `X` after the first len(clusters), which are the albums that have one: the
    cluster most of its `k` nearest of them have (euclidean; equal distances go to the earlier album). When
    two clusters have as many, the one whose nearest album is nearer. `voters` (one bool per album that has
    a cluster) leaves out the albums whose row of `X` is not their own: on a matrix with the audio block, an
    existing album with no audio sits at the mean block, near everything, and must not vote."""
    X = np.asarray(X, dtype=np.float64)
    n = len(clusters)
    known, have = np.asarray(clusters, dtype=np.int64), X[:n]
    if voters is not None:
        voters = np.asarray(voters)
        if voters.dtype != bool or voters.shape != (n,) or not voters.any():
            raise ValueError(f"voters must be one bool per album with a cluster ({n}), at least one True")
        known, have = known[voters], have[voters]
    out: list[int] = []
    step = max(1, CHUNK // max(1, len(have)))
    for a in range(n, len(X), step):
        near = np.argsort(cdist(X[a:a + step], have), axis=1, kind="stable")[:, :k]
        for row in known[near].tolist():
            votes = Counter(row)
            out.append(min(votes, key=lambda c: (-votes[c], row.index(c))))
    return out


def shared_spotify_ids(cat: CatalogAlbums, spotify_ids: list[str] | None = None) -> list[dict]:
    """The albums that share their Spotify id with another album of the catalog, one dict per album (index:
    its number in albums.json, rym_id, artist, title, spotify_id, side: `existing` or `new`), the albums of
    one id together, in the order of each id's first album. `spotify_ids`: the ids to look at, one per album
    (the build passes the ones it ends with, after overrides.json); cat.spotify_ids when None: the sheet's
    link, or the URI's for an existing album the sheet has none for. Two albums cannot both be that Spotify
    album: one link is wrong, or the two rows are one release. The build lists them and goes on; which is
    right is for the owner."""
    by_id: dict[str, list[int]] = {}
    for i, s in enumerate(cat.spotify_ids if spotify_ids is None else spotify_ids):
        if s:
            by_id.setdefault(s, []).append(i)
    titles, artists = list(cat.frame["Title"]), list(cat.frame["Artist"])
    return [{"index": i, "rym_id": cat.keys[i], "artist": str(artists[i]), "title": str(titles[i]), "spotify_id": s,
             "side": "new" if cat.is_new[i] else "existing"}
            for s, rows in by_id.items() if len(rows) > 1 for i in rows]


def shared_spotify_lines(rows: list[dict]) -> list[str]:
    """shared_spotify_ids for the build's output: the count, then a line per id."""
    by_id: dict[str, list[dict]] = {}
    for r in rows:
        by_id.setdefault(r["spotify_id"], []).append(r)
    if not by_id:
        return ["spotify ids: none shared by more than one album"]
    mixed = sum(len({r["side"] for r in group}) > 1 for group in by_id.values())
    lines = [f"spotify ids: {len(by_id)} shared by more than one album ({mixed} between an existing and a new album): "
             "both albums open the same Spotify album, so one link is wrong or the rows are one release. Not changed "
             "by the build; index, rym_id, artist - title [side]:"]
    lines += [f"  {s}  " + "  |  ".join(f"{r['index']} {r['rym_id']} {r['artist']} - {r['title']} [{r['side']}]" for r in group)
              for s, group in by_id.items()]
    return lines


def covers_table() -> Covers:
    """catalog/covers.csv, the default sprite folder, its manifest and the failures of the state file, read
    once per process (what cover_for answers from). `found` is False when there is no covers.csv."""
    return _covers._default_covers()


def new_album_cover(key: str) -> tuple[str, Path | None]:
    """The cover of a new album: (cover id for albums.json, image for its sprite), as covers.cover_for reads
    them from catalog/covers.csv and the sprite folder. ('', None) for an album with no row, or whose
    image could not be fetched (covers.Covers.gone); (id, None) for one whose sprite has not been fetched
    yet, or was made from another image than its row's."""
    return cover_for(key)


def new_album_covers(keys: list[str], first: int, cover_of=new_album_cover) -> tuple[list[str], dict[int, Path], list[str]]:
    """The covers of the new albums, whose album numbers start at `first`: (their cover ids in order,
    {album number: sprite file} for those that have one, the keys with a cover id and no sprite yet).
    An album keeps its cover id without a sprite: the site shows the remote image first, and the sheets
    get the flat tile of its cluster until the sprite is there."""
    cover_ids: list[str] = []
    images: dict[int, Path] = {}
    waiting: list[str] = []
    for i, key in enumerate(keys, start=first):
        cover, image = cover_of(key)
        cover_ids.append(cover)
        if image is not None:
            images[i] = image
        elif cover:
            waiting.append(key)
    return cover_ids, images, waiting


@dataclass(frozen=True)
class ExistingCovers:
    """What existing_album_covers found. Album numbers are rows of the catalog."""
    relinked: list[int]  # the existing albums whose Spotify id is the sheet's and another than the feature table's
    held: list[int]  # those of them an override decides (not in `relinked`)
    covers: dict[int, str]  # album number -> `c`, for the relinked albums that take the cover of their new release
    images: dict[int, Path]  # album number -> that cover's sprite
    kept_map: list[str]  # keys of the relinked albums that keep the map's cover: no row, no sprite, gone, skipped
    waiting: list[str]  # those of kept_map with a usable row and no sprite of it yet (`covers sprites` makes it)


def existing_album_covers(keys: list[str], spotify_ids: list[str], legacy_ids: list[str], held: set[int],
                          cover_of=new_album_cover) -> ExistingCovers:
    """The covers of the existing albums whose link changed. `spotify_ids`, `legacy_ids`: CatalogAlbums' (an
    album is existing where it has a legacy id); `held`: the album numbers whose `s`, `c` or image
    overrides.json sets, which stay as the override says. An album whose id is the sheet's and differs from
    the feature table's takes the cover covers.csv has for it (Spotify's, of the release it now links to)
    once its sprite is there; without both it keeps the map's cover id and sprite, which is what it had."""
    relinked = [i for i, (new, old) in enumerate(zip(spotify_ids, legacy_ids)) if old and new != old]
    out = ExistingCovers([i for i in relinked if i not in held], [i for i in relinked if i in held], {}, {}, [], [])
    for i in out.relinked:
        cover, image = cover_of(keys[i])
        if cover and image is not None:
            out.covers[i], out.images[i] = cover, image
            continue
        out.kept_map.append(keys[i])
        if cover:
            out.waiting.append(keys[i])
    return out
