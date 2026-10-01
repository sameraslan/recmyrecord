"""Tag / genre side features from the parquet files written by fetch_metadata.py.

    X, names = build_meta_features(rows, train_rows, sources=("musicbrainz",), min_count=5)

`rows` are table row numbers (position in all_data_norm.pkl after reset_index); X is float32, one line
per entry of `rows`, in that order. The tag vocabulary is fitted on `train_rows` ONLY: a tag becomes a
feature if it occurs on at least `min_count` distinct train rows. The year scaling uses constants, and the
fill value for a missing year is the train median, so nothing is learned from val / test rows.

Per source the columns are
    musicbrainz   mb_album:<tag>   log1p(votes)              album-level tags (MusicBrainz genres are a subset)
                  mb_artist:<tag>  log1p(votes)              primary-artist tags
    lastfm        lfm_album:<tag>, lfm_artist:<tag>          log1p(weight) / log1p(100)   (weight is 0-100)
    discogs       discogs_genre:<g>, discogs_style:<s>       1.0
    deezer        deezer_genre:<g>                           1.0
    has_<source>            the row was matched in that source
    has_<source>_tags       ... and carries at least one tag / genre there (before vocabulary filtering)
    year, has_year          (first-release year - 1990) / 20; MusicBrainz first, then Discogs, then Deezer
                            (Deezer dates are often reissue dates, so it is the last resort)

Rows that a source has not fetched (yet) are all-zero for that source, with has_<source> = 0.

Leakage check: some MusicBrainz / Last.fm users type RYM descriptors in as tags. `descriptor_overlap()`
reports how much of the tag vocabulary literally equals one of our descriptor names, and
`drop_descriptor_tags=True` removes those tags for an ablation.

  .venv-meta/bin/python meta_features.py            # coverage + overlap report for whatever is fetched
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
TABLE_PATH = HERE.parents[1] / "data-retrieval" / "Recommender" / "data" / "all_data_norm.pkl"
PIPELINE_DIR = HERE.parents[1] / "data-pipeline"

YEAR_CENTRE, YEAR_SCALE = 1990.0, 20.0

# source -> (parquet file, [(feature prefix, column, weighting)], "matched" column)
SOURCES: dict[str, tuple[str, list[tuple[str, str, str]], str]] = {
    "musicbrainz": ("musicbrainz.parquet", [("mb_album", "album_tags", "log"), ("mb_artist", "artist_tags", "log")],
                    "matched"),
    "lastfm": ("lastfm.parquet", [("lfm_album", "album_tags", "log100"), ("lfm_artist", "artist_tags", "log100")],
               "album_found"),
    "discogs": ("discogs.parquet", [("discogs_genre", "genres", "binary"), ("discogs_style", "styles", "binary")],
                "matched"),
    "deezer": ("deezer_meta.parquet", [("deezer_genre", "genres", "binary")], "found"),
}
YEAR_ORDER = ("musicbrainz", "discogs", "deezer")


def norm_tag(t: str) -> str:
    """'Hip-Hop' == 'hip hop' == 'hip_hop'."""
    return " ".join(re.sub(r"[-_/]+", " ", str(t).casefold()).split())


def _parse(cell) -> dict[str, float]:
    """A JSON {tag: count} or [tag, ...] cell -> {normalised tag: count}. Tags that pack several values
    into one string ('classic rock; garage rock') are split."""
    if cell is None or (isinstance(cell, float) and np.isnan(cell)) or cell == "":
        return {}
    obj = json.loads(cell)
    items = obj.items() if isinstance(obj, dict) else ((k, 1) for k in obj)
    out: dict[str, float] = {}
    for name, count in items:
        for part in re.split(r"[;|]", str(name)):
            k = norm_tag(part)
            if k and float(count) > 0:
                out[k] = max(out.get(k, 0.0), float(count))
    return out


def load_source(source: str, cache_dir: Path = CACHE) -> pd.DataFrame | None:
    """The source's parquet indexed by table row, or None if it has not been fetched."""
    path = Path(cache_dir) / SOURCES[source][0]
    if not path.exists():
        return None
    df = pd.read_parquet(path)
    return df.drop_duplicates("row", keep="last").set_index("row")


def descriptor_names(which: str = "recommender") -> list[str]:
    """Our descriptor column names: the 120 the recommender uses, or all 176 (with lyric / theme ones)."""
    if str(PIPELINE_DIR) not in sys.path:
        sys.path.insert(0, str(PIPELINE_DIR))
    from rmr_pipeline.constants import AUDIO, LYRIC_DROP, META  # light import (no sklearn)
    cols = [c for c in pd.read_pickle(TABLE_PATH).columns if c not in META and c not in AUDIO]
    return cols if which == "all" else [c for c in cols if c not in LYRIC_DROP]


def _weight(count: float, how: str) -> float:
    if how == "log":
        return float(np.log1p(count))
    if how == "log100":
        return float(np.log1p(min(count, 100.0)) / np.log1p(100.0))
    return 1.0


def build_meta_features(rows, train_rows, sources=("musicbrainz",), min_count: int = 5,
                        drop_descriptor_tags: bool = False, exclude_tags=(), include_artist: bool = True,
                        include_year: bool = True, cache_dir: Path = CACHE) -> tuple[np.ndarray, list[str]]:
    """Feature matrix aligned to `rows` (see module docstring). Returns (X float32 [len(rows), n_features],
    feature_names).

    rows, train_rows       table row numbers; the vocabulary / year fill are fitted on train_rows only
    sources                any of "musicbrainz", "lastfm", "discogs", "deezer"; a source whose parquet is
                           missing raises FileNotFoundError (fail loudly rather than silently feed zeros)
    min_count              a tag needs this many distinct train rows to become a feature
    drop_descriptor_tags   drop tags whose normalised name equals one of the 176 descriptor names
    exclude_tags           further tag names to drop
    include_artist         False keeps only album-level tags (artist tags are shared by every album of an
                           artist - fine with an artist-disjoint split, but worth ablating)
    """
    rows = np.asarray(rows, dtype=int)
    train = sorted(set(int(r) for r in np.asarray(train_rows, dtype=int)))
    banned = {norm_tag(t) for t in exclude_tags}
    if drop_descriptor_tags:
        banned |= {norm_tag(d) for d in descriptor_names("all")}

    blocks: list[np.ndarray] = []
    names: list[str] = []
    years: dict[str, pd.Series] = {}

    for source in sources:
        if source not in SOURCES:
            raise ValueError(f"unknown source {source!r}; choose from {sorted(SOURCES)}")
        df = load_source(source, cache_dir)
        if df is None:
            raise FileNotFoundError(f"{Path(cache_dir) / SOURCES[source][0]} not found - run "
                                    f"`fetch_metadata.py {'deezer-genres' if source == 'deezer' else source}` first")
        _, groups, matched_col = SOURCES[source]
        if "year" in df.columns:
            years[source] = df["year"]
        any_tags = np.zeros(len(rows), dtype=np.float32)
        for prefix, col, how in groups:
            if not include_artist and "artist" in prefix:
                continue
            parsed = {int(r): {k: v for k, v in _parse(c).items() if k not in banned}
                      for r, c in df[col].items()}
            df_count = Counter(t for r in train for t in parsed.get(r, {}))
            vocab = sorted(t for t, n in df_count.items() if n >= min_count)
            index = {t: j for j, t in enumerate(vocab)}
            block = np.zeros((len(rows), len(vocab)), dtype=np.float32)
            for i, r in enumerate(rows):
                tags = parsed.get(int(r), {})
                if tags:
                    any_tags[i] = 1.0
                for t, c in tags.items():
                    j = index.get(t)
                    if j is not None:
                        block[i, j] = _weight(c, how)
            blocks.append(block)
            names += [f"{prefix}:{t}" for t in vocab]
        matched = df[matched_col].fillna(False).astype(bool)
        has = np.array([float(bool(matched.get(int(r), False))) for r in rows], dtype=np.float32)
        blocks += [has[:, None], any_tags[:, None]]
        names += [f"has_{source}", f"has_{source}_tags"]

    if include_year:
        def year_of(r: int) -> float:
            for s in YEAR_ORDER:
                if s in years:
                    y = years[s].get(int(r), None)
                    if y is not None and not pd.isna(y) and 1850 <= int(y) <= 2100:
                        return float(y)
            return float("nan")

        train_years = np.array([year_of(r) for r in train], dtype=float)
        fill = float(np.nanmedian(train_years)) if np.isfinite(train_years).any() else YEAR_CENTRE
        y = np.array([year_of(r) for r in rows], dtype=float)
        has_year = np.isfinite(y)
        y = (np.where(has_year, y, fill) - YEAR_CENTRE) / YEAR_SCALE
        blocks += [y.astype(np.float32)[:, None], has_year.astype(np.float32)[:, None]]
        names += ["year", "has_year"]

    X = np.concatenate(blocks, axis=1) if blocks else np.zeros((len(rows), 0), dtype=np.float32)
    return X.astype(np.float32, copy=False), names


# ---------------------------------------------------------------- reports

def coverage(source: str = "musicbrainz", cache_dir: Path = CACHE) -> dict:
    """Shares over the rows fetched so far: matched, >= 1 album tag, >= 1 artist tag, median tag counts."""
    df = load_source(source, cache_dir)
    if df is None:
        return {}
    _, groups, matched_col = SOURCES[source]
    out = {"rows_fetched": int(len(df)), "matched": float(df[matched_col].fillna(False).astype(bool).mean())}
    if "status" in df.columns:
        out["errors"] = int((df["status"] == "error").sum())
    for prefix, col, _ in groups:
        n = df[col].map(lambda c: len(_parse(c)))
        out[f"{prefix}_any"] = float((n > 0).mean())
        out[f"{prefix}_median_all_rows"] = float(n.median())
        out[f"{prefix}_median_when_any"] = float(n[n > 0].median()) if (n > 0).any() else 0.0
    return out


def descriptor_overlap(source: str = "musicbrainz", min_count: int = 1, cache_dir: Path = CACHE) -> dict:
    """Literal overlap between the tag vocabulary and our descriptor names, per tag column of a source.

    For each column: vocabulary size (tags on >= min_count fetched rows), how many of the 120 / 176
    descriptor names occur verbatim as a tag, the share of tag assignments (album, tag pairs) they make
    up, and the share of albums carrying at least one such tag."""
    df = load_source(source, cache_dir)
    if df is None:
        return {}
    d120 = {norm_tag(d) for d in descriptor_names("recommender")}
    d176 = {norm_tag(d) for d in descriptor_names("all")}
    out = {}
    for prefix, col, _ in SOURCES[source][1]:
        parsed = [_parse(c) for c in df[col]]
        freq = Counter(t for p in parsed for t in p)
        vocab = {t for t, n in freq.items() if n >= min_count}
        hit120, hit176 = vocab & d120, vocab & d176
        total = sum(freq[t] for t in vocab)
        out[prefix] = {
            "albums": len(parsed),
            "vocab_size": len(vocab),
            "descriptors_in_vocab_of_120": len(hit120),
            "descriptors_in_vocab_of_176": len(hit176),
            "share_of_vocab": len(hit176) / len(vocab) if vocab else 0.0,
            "share_of_tag_assignments": sum(freq[t] for t in hit176) / total if total else 0.0,
            "albums_with_a_descriptor_tag": float(np.mean([bool(set(p) & hit176) for p in parsed])) if parsed else 0.0,
            "albums_with_a_descriptor_tag_of_120": float(np.mean([bool(set(p) & hit120) for p in parsed])) if parsed else 0.0,
            "matching_tags": {t: freq[t] for t in sorted(hit176, key=lambda t: -freq[t])},
        }
    return out


def label_agreement(source: str = "musicbrainz", col: str = "album_tags", cache_dir: Path = CACHE) -> dict:
    """For tags that literally equal one of the 120 descriptors: how often does the album actually carry
    that descriptor in our table? (High precision = the tag is a copy of / agrees with the RYM label.)"""
    df = load_source(source, cache_dir)
    if df is None:
        return {}
    d120 = {norm_tag(d): d for d in descriptor_names("recommender")}
    table = pd.read_pickle(TABLE_PATH).reset_index(drop=True)
    pairs = agree = 0
    for r, c in df[col].items():
        for t in _parse(c):
            if t in d120:
                pairs += 1
                agree += bool(float(table.at[int(r), d120[t]]) > 0)
    base = float((table[list(d120.values())].astype(float) > 0).to_numpy().mean())
    return {"tag_descriptor_pairs": pairs, "album_has_that_descriptor": agree / pairs if pairs else 0.0,
            "base_rate_of_a_descriptor": base}


if __name__ == "__main__":
    for src in SOURCES:
        cov = coverage(src)
        if not cov:
            print(f"{src}: not fetched")
            continue
        print(f"\n== {src} ==")
        print(json.dumps(cov, indent=1))
        for prefix, o in descriptor_overlap(src).items():
            tags = o.pop("matching_tags")
            print(prefix, json.dumps(o))
            print("   literal descriptor tags:", ", ".join(f"{t} ({n})" for t, n in list(tags.items())[:60]))
        if src in ("musicbrainz", "lastfm"):
            print("label agreement (album tags):", json.dumps(label_agreement(src)))
