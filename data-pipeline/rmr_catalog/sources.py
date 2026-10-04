"""The two sides the builder pairs: the albums the site has (feature table) and the rows of the chart sheet."""
import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import DEFAULT_OVERRIDES, DEFAULT_TABLE, REPO
from rmr_pipeline.keys import RYM_ID_RE, URI_PREFIX
from rmr_pipeline.slugs import make_slugs
from rmr_pipeline.table import dedupe_table, load_table, verify_table_hash

# A local export of the sheet's "Top 10K Chart" tab (gitignored: the builder's outputs are what is committed).
DEFAULT_SHEET = REPO / "experiments" / "audio_10k" / "cache" / "rym10k_sheet.csv"
# The scrape the feature table was built from: the only source of an existing album's release date.
# It is unpickled, so it is pinned like the feature table.
SCRAPE = REPO / "data-retrieval" / "rymscraper-master" / "Scraped Data" / "top5000records.pkl"
SCRAPE_SHA256 = "9fb1fae0c28ab98e5041a257d9716b8cfe6c9f6ea639729323f1e547bc73d67d"
SHEET_COLUMNS = ("rank", "artist", "title", "in_recmyrecord", "type", "release_date_iso", "primary_genres",
                 "secondary_genres", "top_descriptors", "spotify_url", "apple_music_url", "deezer_url", "bandcamp_url",
                 "youtube_url", "soundcloud_url", "rym_url", "recmyrecord_match", "artist_latin", "title_latin",
                 "rym_id")
LINKS = ("spotify_url", "apple_music_url", "deezer_url", "bandcamp_url", "youtube_url", "soundcloud_url")
_SPOTIFY_ALBUM = re.compile(r"/album/([A-Za-z0-9]{22})(?![A-Za-z0-9])")
_YEAR = re.compile(r"(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)")
_MONTHS = {m: i for i, m in enumerate(("january", "february", "march", "april", "may", "june", "july", "august",
                                       "september", "october", "november", "december"), start=1)}


@dataclass(frozen=True)
class Existing:
    """An album the site has: a row of the deduped feature table."""
    index: int  # its album number on the site
    uri: str
    title: str
    artist: str  # clean_artist of the table's credit, before overrides.json: what the first slugs are made from
    credits: tuple[str, ...]  # `artist`, and the corrected artist when overrides.json has one
    label: str  # "<the table's Artist> - <Title>", as the sheet's recmyrecord_match column writes an album
    spotify_id: str  # of the URI; overrides.json's `s` when the URI is known to be another album ("" = none)
    years: tuple[str, ...]  # release year in the scrape; none when the album is not found there, several when
    #                         albums share its artist and title and the table's order does not say which it is
    release_date: str  # ISO, as precise as the scrape has it; "" unless there is one year


@dataclass(frozen=True)
class ChartRow:
    """One row of the chart sheet."""
    rym_id: str
    rank: int
    artist: str
    title: str
    artist_latin: str
    title_latin: str
    year: str
    spotify_id: str
    flag: str  # the sheet's own in_recmyrecord: yes, likely, missing. Reported, never used to decide
    flag_label: str  # the sheet's recmyrecord_match
    row: dict  # every column as text


def year_of(text: str) -> str:
    m = _YEAR.search(str(text))
    return m.group(1) if m else ""


def iso_date(text: str) -> str:
    """The scrape's "16 June 1997", "June 1997" or "1997" as 1997-06-16, 1997-06, 1997; "" when unreadable."""
    words = str(text).replace(",", " ").split()
    year = year_of(words[-1]) if words else ""
    if not year or len(words) > 3:
        return ""
    month = _MONTHS.get(words[-2].lower()) if len(words) > 1 else None
    if len(words) == 1:
        return year
    if month is None or (len(words) == 3 and not words[0].isdigit()):
        return ""
    return f"{year}-{month:02d}" + (f"-{int(words[0]):02d}" if len(words) == 3 else "")


def spotify_album_id(url: str) -> str:
    m = _SPOTIFY_ALBUM.search(url)
    return m.group(1) if m else ""


def _scrape_dates(df: pd.DataFrame, scrape: Path) -> list[list[str]]:
    """For each row of the feature table, the release dates of the scrape rows it can be: those with its
    artist and title (the table kept the scrape's strings). The table is in the scrape's order, so when
    several albums share a name (two self-titled albums, a re-recording), the one this row is lies between
    the scrape rows of the table rows around it; if that does not single one out, all are returned."""
    if not Path(scrape).exists():
        return [[] for _ in range(len(df))]
    if Path(scrape).resolve() == SCRAPE.resolve():
        verify_table_hash(Path(scrape), SCRAPE_SHA256)
    old = pd.read_pickle(scrape).reset_index(drop=True)
    at: dict[tuple[str, str], list[int]] = defaultdict(list)
    for n, name in enumerate(zip(old["Artist"].astype(str), old["Album"].astype(str))):
        at[name].append(n)
    found = [at.get(name, []) for name in zip(df["Artist"].astype(str), df["Title"].astype(str))]
    sure = {r: f[0] for r, f in enumerate(found) if len(f) == 1}
    for r, f in enumerate(found):
        if len(f) > 1:
            before = next((sure[q] for q in range(r - 1, -1, -1) if q in sure), -1)
            after = next((sure[q] for q in range(r + 1, len(found)) if q in sure), len(old))
            between = [n for n in f if before < n < after]
            found[r] = between if len(between) == 1 else f
    return [[str(old.at[n, "Date"]) for n in f] for f in found]


def load_existing(table: Path = DEFAULT_TABLE, overrides: Path = DEFAULT_OVERRIDES,
                  scrape: Path = SCRAPE) -> list[Existing]:
    """The site's albums in catalog order (the deduped feature table), with the release years the scrape has
    for their artist and title."""
    df = load_table(table)
    sub, rows = dedupe_table(df)
    dates = _scrape_dates(df, scrape)
    titles = [str(t) for t in sub["Title"]]
    raw = [str(a) for a in sub["Artist"]]
    artists = [clean_artist(a) for a in raw]
    first = {slug: i for i, slug in enumerate(make_slugs(titles, artists))}
    fixes = {}
    if Path(overrides).exists():
        fixes = {first[slug]: e for slug, e in json.loads(Path(overrides).read_text(encoding="utf-8")).items()
                 if slug in first}
    out = []
    for i, uri in enumerate(str(u) for u in sub["URI"]):
        fix = fixes.get(i, {})
        found = dates[rows[i]]
        years = tuple(sorted({year_of(d) for d in found} - {""}))
        credits = tuple(dict.fromkeys([artists[i]] + ([fix["a"].strip()] if "a" in fix else [])))
        out.append(Existing(i, uri, titles[i], artists[i], credits, f"{raw[i]} - {titles[i]}",
                            fix["s"] if "s" in fix else uri[len(URI_PREFIX):], years,
                            iso_date(found[0]) if len(found) == 1 else ""))
    return out


def load_sheet(path: Path = DEFAULT_SHEET) -> list[ChartRow]:
    """The sheet export in rank order. Raises ValueError when a column is missing or an id or rank repeats."""
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in SHEET_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: missing columns {missing}")
        rows = [{k: (v or "").strip() for k, v in r.items()} for r in reader]
    out = [ChartRow(r["rym_id"], int(r["rank"]), r["artist"], r["title"], r["artist_latin"], r["title_latin"],
                    year_of(r["release_date_iso"]), spotify_album_id(r["spotify_url"]), r["in_recmyrecord"],
                    r["recmyrecord_match"], r) for r in rows]
    out.sort(key=lambda s: s.rank)
    bad = [s.rym_id for s in out if not RYM_ID_RE.match(s.rym_id)]
    if bad or len({s.rym_id for s in out}) != len(out) or len({s.rank for s in out}) != len(out):
        raise ValueError(f"{path}: rym_id and rank must be unique, and rym_id a RYM id" + (f" (got {bad[0]!r})" if bad else ""))
    return out
