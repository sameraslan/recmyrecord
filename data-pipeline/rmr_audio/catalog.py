"""The albums the audio stage works on: the deduped feature table with cleaned artists, site slugs and,
where the un-normalised table has them, the Spotify numbers the matcher uses to recognise an edition."""
import json
import math
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import DEFAULT_OVERRIDES, DEFAULT_TABLE, PIPELINE_DIR
from rmr_pipeline.slugs import make_slugs
from rmr_pipeline.table import dedupe_table, load_table, verify_table_hash

DEFAULT_CACHE = PIPELINE_DIR / ".cache" / "audio"  # gitignored: clip cache, API responses, the model
# The un-normalised table next to the feature table (mean track duration, key, mode and time signature per
# album). It is unpickled, so it is pinned like the feature table.
RAW_NAME = "all_data.pkl"
RAW_SHA256 = "fffa39066fa36e168e28a1ff15bd7b5329d7c73ea16fb05c581d40d7981de97e"
SPOTIFY_PAGE = 50  # the Spotify features averaged at most the first page of an album's tracks


@dataclass(frozen=True)
class Album:
    """One catalog album and what the tables know about its Spotify release."""
    key: str  # the feature table's URI: the album's key in the store
    title: str
    artist: str  # cleaned credit, manual artist corrections applied
    slug: str  # as the site uses it
    mean_s: float = 0.0  # mean track duration of the Spotify album
    means: tuple[float, float, float] = (0.0, 0.0, 0.0)  # Spotify means of key, mode, time signature over tracks
    override: bool = True  # no usable Spotify numbers: the URI is another album's, or there are none

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


def load_catalog(table: Path = DEFAULT_TABLE, overrides: Path = DEFAULT_OVERRIDES) -> list[Album]:
    """Every album of the feature table, in catalog order. Slugs are assigned as the build does: from the
    cleaned artists, then again with the artist corrections of overrides.json (keyed by the first slugs).
    An override with `s` says the table's URI is another album, so its Spotify numbers are not used."""
    sub, rows = dedupe_table(load_table(table))
    uris = [str(u) for u in sub["URI"]]
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
    out = []
    for i, uri in enumerate(uris):
        spotify = None if "s" in fixes.get(i, {}) else numbers[i]
        out.append(Album(uri, titles[i], artists[i], slugs[i], *(spotify or (0.0, (0.0, 0.0, 0.0))),
                         override=spotify is None))
    return out
