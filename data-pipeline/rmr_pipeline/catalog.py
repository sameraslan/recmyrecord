"""The catalog build's albums: every row of catalog/albums.csv as a frame the build can use.

`python -m rmr_pipeline.build --catalog` builds the whole catalog table (key: `rym_id`) instead of the
feature table's albums. The site's albums come first in the catalog, in the feature table's order, so
album numbers and slugs stay what they are; the new albums follow.

Every album is described by its first CATALOG_DESCRIPTORS (8) descriptors, weighted by their place among
those eight (WEIGHT_PROFILES):

  an existing album   table            the eight largest of its 176 table cells (a cell is (63 - place) / 42,
                                       so the largest are the first on its RYM page)
                      table-novocals   the same without the three vocals columns: the sheet never lists them,
                                       so a new album never has one (the default)
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
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist

from .audio import DEFAULT_CATALOG
from .constants import AUDIO, CATALOG_DESCRIPTORS, LYRIC_DROP, META, PIPELINE_DIR, VOCALS

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
    spotify_ids: list[str]  # '' when the album has no Spotify link
    is_new: np.ndarray  # (albums,) bool: not in the feature table
    slug_titles: list[str]  # what the slug is made from: the romanised title of a new album when there is one
    slug_artists: list[str]  # (an existing album's artist is the table's, not cleaned yet)
    existing: str
    weights: str
    report: DescriptorReport

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

    spotify_ids = [u.split(":")[-1] for u in uris]
    for key, url in zip(keys[n:], catalog["spotify_url"].iloc[n:]):
        m = SPOTIFY_URL_RE.match(url)
        if url and not m:
            raise CatalogError(f"{key}: spotify_url {url!r} is not an open.spotify.com album link")
        spotify_ids.append(m[1] if m else "")

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
        existing, weights, report)


def neighbour_clusters(X: np.ndarray, clusters: list[int], k: int = CLUSTER_NEIGHBOURS) -> list[int]:
    """A cluster for each row of `X` after the first len(clusters), which are the albums that have one: the
    cluster most of its `k` nearest of them have (euclidean; equal distances go to the earlier album). When
    two clusters have as many, the one whose nearest album is nearer."""
    X = np.asarray(X, dtype=np.float64)
    known, have = np.asarray(clusters, dtype=np.int64), X[:len(clusters)]
    out: list[int] = []
    step = max(1, CHUNK // max(1, len(have)))
    for a in range(len(have), len(X), step):
        near = np.argsort(cdist(X[a:a + step], have), axis=1, kind="stable")[:, :k]
        for row in known[near].tolist():
            votes = Counter(row)
            out.append(min(votes, key=lambda c: (-votes[c], row.index(c))))
    return out


def new_album_cover(key: str) -> tuple[str, Path | None]:
    """The cover of a new album: (cover id for albums.json, image for its sprite). Nothing yet: every new
    album gets '' and the flat tile of its cluster. The covers work plugs in here."""
    return "", None
