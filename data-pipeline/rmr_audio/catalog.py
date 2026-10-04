"""The albums the audio stage works on: every row of the catalog table (catalog/albums.csv). The site's
albums come first, in the feature table's order, with cleaned artists, site slugs and, where the
un-normalised table has them, the Spotify numbers the matcher uses to recognise an edition; then the
chart's new albums by rank. Every album carries the store links RYM lists and the Latin spellings."""
import csv
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.audio_store import StoreError
from rmr_pipeline.constants import DEFAULT_OVERRIDES, DEFAULT_TABLE, PIPELINE_DIR
from rmr_pipeline.keys import DEFAULT_KEYS, load_keys
from rmr_pipeline.slugs import make_slugs
from rmr_pipeline.table import dedupe_table, load_table, verify_table_hash

DEFAULT_CACHE = PIPELINE_DIR / ".cache" / "audio"  # gitignored: clip cache, API responses, the model
DEFAULT_ALBUMS = PIPELINE_DIR / "catalog" / "albums.csv"  # written by rmr_catalog
DEEZER_LINK = re.compile(r"deezer\.com/(?:[a-z]{2}/)?album/(\d+)")
APPLE_LINK = re.compile(r"music\.apple\.com/([a-z]{2})/album/(?:[^/?#]+/)?(\d+)")
# The un-normalised table next to the feature table (mean track duration, key, mode and time signature per
# album). It is unpickled, so it is pinned like the feature table.
RAW_NAME = "all_data.pkl"
RAW_SHA256 = "fffa39066fa36e168e28a1ff15bd7b5329d7c73ea16fb05c581d40d7981de97e"
SPOTIFY_PAGE = 50  # the Spotify features averaged at most the first page of an album's tracks


@dataclass(frozen=True)
class Album:
    """One catalog album and what the tables know about its Spotify release."""
    key: str  # the album's key in the store: its RYM id, or its placeholder (rmr_pipeline.keys)
    title: str
    artist: str  # cleaned credit, manual artist corrections applied
    slug: str  # as the site uses it
    mean_s: float = 0.0  # mean track duration of the Spotify album
    means: tuple[float, float, float] = (0.0, 0.0, 0.0)  # Spotify means of key, mode, time signature over tracks
    override: bool = True  # no usable Spotify numbers: the URI is another album's, or there are none
    legacy_uri: str = ""  # the feature table's URI: what caches written before the rekey know the album by
    artist_latin: str = ""  # the catalog table's Latin spellings, where RYM gives the native name first
    title_latin: str = ""
    deezer_url: str = ""  # the store links RYM lists for the album
    apple_url: str = ""
    rank: int = 0  # chart rank; 0 for an album that is not on the chart
    year: str = ""
    new: bool = False  # a catalog row the feature table (and so the site) does not have yet

    @property
    def deezer_id(self) -> str:
        """The Deezer album id of the RYM link, or ""."""
        m = DEEZER_LINK.search(self.deezer_url)
        return m.group(1) if m else ""

    @property
    def apple_link(self) -> tuple[str, str] | None:
        """(storefront, album id) of the RYM Apple Music link. The id only resolves in that storefront."""
        m = APPLE_LINK.search(self.apple_url)
        return (m.group(1), m.group(2)) if m else None

    @property
    def links(self) -> list[tuple[str, str]]:
        """(source, album id) of each store link, Deezer first: ("deezer", id), ("itunes:<storefront>", id)."""
        out = [("deezer", self.deezer_id)] if self.deezer_id else []
        return out + ([(f"itunes:{self.apple_link[0]}", self.apple_link[1])] if self.apple_link else [])

    def count_fits(self, n: int) -> bool:
        """Could the Spotify album have n tracks? Then n times each mean of integers is an integer."""
        n = min(n, SPOTIFY_PAGE)
        return not self.override and n > 0 and all(abs(m * n - round(m * n)) < 2e-3 for m in self.means)


def _spotify_numbers(table: Path, rows: list[int], uris: list[str]) -> list[tuple[float, tuple] | None]:
    """(mean track seconds, (key, mode, time signature means)) per album from all_data.pkl, None where
    the file, the row or a value is missing."""
    path = Path(table).with_name(RAW_NAME)
    if not path.exists():
        return [None] * len(rows)
    verify_table_hash(path, RAW_SHA256)
    raw = pd.read_pickle(path).reset_index(drop=True)
    out: list[tuple[float, tuple] | None] = []
    for row, uri in zip(rows, uris):
        if row >= len(raw) or str(raw.at[row, "URI"]) != uri:
            out.append(None)
            continue
        v = [float(raw.at[row, c]) for c in ("duration_ms", "key", "mode", "time_signature")]
        out.append((v[0] / 1000, tuple(v[1:])) if all(math.isfinite(x) for x in v) and v[0] > 0 else None)
    return out


def _catalog_rows(path: Path) -> list[dict]:
    try:
        with open(path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        raise StoreError(f"missing {path}: the catalog table is not there (python -m rmr_catalog)") from None


def _extras(row: dict | None) -> dict:
    """What the catalog table adds to an album."""
    if row is None:
        return {}
    return {"artist_latin": row.get("artist_latin", ""), "title_latin": row.get("title_latin", ""),
            "deezer_url": row.get("deezer_url", ""), "apple_url": row.get("apple_music_url", ""),
            "rank": int(row["rank"]) if row.get("on_chart") == "1" and row.get("rank", "").isdigit() else 0,
            "year": row.get("year", "")}


def load_catalog(table: Path = DEFAULT_TABLE, overrides: Path = DEFAULT_OVERRIDES,
                 keys: Path = DEFAULT_KEYS, albums: Path | None = DEFAULT_ALBUMS) -> list[Album]:
    """Every album of the catalog table: the feature table's albums first, in its order, under the key
    keys.csv gives each URI, then the rows the feature table does not have (`new`), by chart rank, under
    their RYM id. Slugs are assigned as the build does: from the cleaned artists, then again with the
    artist corrections of overrides.json (keyed by the first slugs); a new album's slug is made after
    those, so it never moves one of the site's. An override with `s` says the table's URI is another
    album, so its Spotify numbers are not used; a new album has none. `albums=None` gives the feature
    table's albums only, without links. Raises StoreError when keys.csv is missing or lacks an album, or
    when the catalog table is missing or does not start with the feature table's albums."""
    sub, rows = dedupe_table(load_table(table))
    uris = [str(u) for u in sub["URI"]]
    album_keys = load_keys(keys).keys_of(uris)
    titles = [str(t) for t in sub["Title"]]
    artists = [clean_artist(a) for a in sub["Artist"].astype(str)]
    first = {slug: i for i, slug in enumerate(make_slugs(titles, artists))}
    fixes = {}
    if Path(overrides).exists():
        fixes = {first[slug]: e for slug, e in json.loads(Path(overrides).read_text(encoding="utf-8")).items()
                 if slug in first}
    artists = [fixes.get(i, {}).get("a", a).strip() for i, a in enumerate(artists)]
    slugs = make_slugs(titles, artists)
    numbers = _spotify_numbers(Path(table), rows, uris)
    table_rows = _catalog_rows(Path(albums)) if albums is not None else []
    by_key = {r["rym_id"]: r for r in table_rows}
    if table_rows and [r["rym_id"] for r in table_rows[:len(uris)]] != album_keys:
        raise StoreError(f"{albums} does not start with the feature table's {len(uris)} albums in their order: "
                         "run python -m rmr_catalog")
    out = []
    for i, uri in enumerate(uris):
        spotify = None if "s" in fixes.get(i, {}) else numbers[i]
        out.append(Album(album_keys[i], titles[i], artists[i], slugs[i], *(spotify or (0.0, (0.0, 0.0, 0.0))),
                         override=spotify is None, legacy_uri=uri, **_extras(by_key.get(album_keys[i]))))
    fresh = sorted(table_rows[len(uris):], key=lambda r: int(r["rank"]) if r["rank"].isdigit() else 10 ** 9)
    all_slugs = make_slugs(titles + [r["title"] for r in fresh], artists + [r["artist"] for r in fresh])
    for r, slug in zip(fresh, all_slugs[len(uris):]):
        out.append(Album(r["rym_id"], r["title"], r["artist"], slug, new=True, **_extras(r)))
    return out
