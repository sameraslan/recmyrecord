"""Album keys (data-pipeline/audio/keys.csv): the RYM id of every album that had a Spotify URI as its key.

An album's key, in the catalog, the audio store, matches.csv, match_overrides.json and transform.npz, is its
RYM id ("Album45"). The feature table and the personal-site map still know an album by its Spotify URI, and
so do local caches written before the rekey; keys.csv is the one place that says which key a URI became.

  rym_id       the key: a RYM id, or the placeholder "sp:<spotify album id>" for an album whose RYM id is
               not known yet (it is not on the chart the catalog was built from)
  legacy_uri   the feature table's URI ("spotify:album:<id>")
  matched_by   spotify_id | artist_title_year (the catalog builder's rule), manual (set by hand; the
               builder keeps it), none (a placeholder)
  doubt        empty, or the reasons the pair is listed in catalog/doubtful_pairs.csv

One row per URI and per key. To give an album its real RYM id, or to correct a pair, change its `rym_id`,
set `matched_by` to manual, then run the catalog builder and scripts/rekey_audio_store.py (README, Keys).

Only the standard library and audio_store, so both environments can use it.
"""
import csv
import os
import re
from dataclasses import dataclass
from pathlib import Path

from .audio_store import DEFAULT_AUDIO, StoreError

DEFAULT_KEYS = DEFAULT_AUDIO / "keys.csv"
KEYS_FIELDS = ["rym_id", "legacy_uri", "matched_by", "doubt"]
MATCHED_BY = ("spotify_id", "artist_title_year", "manual", "none")
URI_PREFIX = "spotify:album:"
PLACEHOLDER_PREFIX = "sp:"
RYM_ID_RE = re.compile(r"^[A-Z][A-Za-z]*[0-9]+$")


def placeholder(uri: str) -> str:
    """The key of an album with no RYM id yet: "sp:" and its Spotify album id."""
    if not uri.startswith(URI_PREFIX) or len(uri) == len(URI_PREFIX):
        raise ValueError(f"not a Spotify album URI: {uri!r}")
    return PLACEHOLDER_PREFIX + uri[len(URI_PREFIX):]


def is_placeholder(key: str) -> bool:
    return key.startswith(PLACEHOLDER_PREFIX)


def is_legacy(key: str) -> bool:
    """Is this a key of before the rekey (a Spotify URI)?"""
    return key.startswith(URI_PREFIX)


@dataclass(frozen=True)
class KeyMap:
    """keys.csv: both directions between the keys and the legacy URIs."""
    rows: tuple[dict, ...]
    key_of_uri: dict[str, str]
    uri_of_key: dict[str, str]

    def keys_of(self, uris) -> list[str]:
        """The key of each URI, in order. Raises StoreError naming the URIs keys.csv does not have."""
        uris = [str(u) for u in uris]
        missing = [u for u in uris if u not in self.key_of_uri]
        if missing:
            raise StoreError(f"keys.csv has no key for {len(missing)} album(s): {', '.join(missing[:5])}"
                             f"{' ...' if len(missing) > 5 else ''}. Run the catalog builder (README, Keys)")
        return [self.key_of_uri[u] for u in uris]

    def legacy(self, key: str) -> str | None:
        """The Spotify URI an album was keyed by before the rekey, or None for an album that never had one.
        What a cache written before the rekey (clips.sqlite, the experiments' sqlite files) knows it as."""
        return self.uri_of_key.get(key)

    def current(self, key: str) -> str:
        """The key as it is now, given a key of any age: a legacy URI, a placeholder that has since been
        given its RYM id, or a current key (returned as it is, like the key of an album that never had a
        URI). Raises StoreError for a URI keys.csv does not have."""
        if key in self.uri_of_key:
            return key
        uri = key if is_legacy(key) else URI_PREFIX + key[len(PLACEHOLDER_PREFIX):] if is_placeholder(key) else None
        if uri is None:
            return key
        if uri not in self.key_of_uri:
            raise StoreError(f"keys.csv has no key for {key!r}")
        return self.key_of_uri[uri]


def check_rows(rows: list[dict], where: str = "keys.csv") -> KeyMap:
    """The rows as a KeyMap. Raises StoreError unless they are one-to-one and every key is well formed."""
    key_of_uri: dict[str, str] = {}
    uri_of_key: dict[str, str] = {}
    for n, r in enumerate(rows, start=2):
        key, uri = r["rym_id"], r["legacy_uri"]
        if not is_legacy(uri) or uri in key_of_uri:
            raise StoreError(f"{where} line {n}: legacy_uri {uri!r} is not a Spotify album URI or is repeated")
        if key in uri_of_key:
            raise StoreError(f"{where} line {n}: key {key!r} is given to two albums ({uri_of_key[key]} and {uri})")
        if is_placeholder(key):
            if key != placeholder(uri):
                raise StoreError(f"{where} line {n}: the placeholder of {uri} is {placeholder(uri)!r}, not {key!r}")
        elif not RYM_ID_RE.match(key):
            raise StoreError(f"{where} line {n}: {key!r} is neither a RYM id (Album45) nor a placeholder (sp:<id>)")
        by = r["matched_by"]  # manual goes with either kind of key: "this album is not on the chart" is a decision too
        if by not in MATCHED_BY or (by != "manual" and (by == "none") != is_placeholder(key)):
            raise StoreError(f"{where} line {n}: matched_by {r['matched_by']!r} does not fit the key {key!r} "
                             f"({', '.join(MATCHED_BY)}; none is for placeholders)")
        key_of_uri[uri], uri_of_key[key] = key, uri
    return KeyMap(tuple(rows), key_of_uri, uri_of_key)


def load_keys(path: Path = DEFAULT_KEYS) -> KeyMap:
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames != KEYS_FIELDS:
                raise StoreError(f"{path}: the header must be {','.join(KEYS_FIELDS)}")
            rows = list(reader)
    except FileNotFoundError:
        raise StoreError(f"missing {path}: the album keys are not there (see data-pipeline/README.md, Keys)") from None
    return check_rows(rows, str(path))


def write_keys(path: Path, rows: list[dict]) -> None:
    check_rows(rows, path.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=KEYS_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)
