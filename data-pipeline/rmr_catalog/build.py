"""CLI: .venv-audio/bin/python -m rmr_catalog [--sheet CSV] [--check]      (from data-pipeline/, no network)

Reads the chart sheet's export, the feature table and audio/keys.csv (only its rows set by hand), and writes

  catalog/albums.csv          every album, keyed by `rym_id`: the site's albums first, in their order (an
                              album's row number is its number on the site), then the chart's new albums by
                              rank. The catalog only grows: an existing album that is not on the chart stays,
                              with on_chart 0 and, until its RYM page is read, the placeholder key sp:<id>.
  audio/keys.csv              the key of every existing album (rmr_pipeline.keys)
  catalog/doubtful_pairs.csv  old-to-new pairs for the owner to decide, and what was done meanwhile
  catalog/manifest.json       the sheet export it was built from (SHA-256) and the counts

An existing album keeps the feature table's title and artist (the site's slugs are made from them); the
sheet's spellings are in rym_artist and rym_title. --check writes nothing and fails when the committed files
are not what the builder gives.
"""
import argparse
import csv
import io
import json
import os
import sys
from collections import Counter
from pathlib import Path

from rmr_pipeline.constants import DEFAULT_OVERRIDES, DEFAULT_TABLE, PIPELINE_DIR
from rmr_pipeline.keys import DEFAULT_KEYS, KEYS_FIELDS, URI_PREFIX, check_rows, load_keys, placeholder
from rmr_pipeline.table import sha256_file

from .pairing import REASONS, Pairing, pair
from .sources import DEFAULT_SHEET, LINKS, ChartRow, Existing, load_existing, load_sheet

DEFAULT_CATALOG = PIPELINE_DIR / "catalog"
CATALOG_FIELDS = ["rym_id", "rank", "on_chart", "artist", "title", "artist_latin", "title_latin", "rym_artist",
                  "rym_title", "year", "release_date", "type", "primary_genres", "secondary_genres",
                  "top_descriptors", *LINKS, "rym_url", "legacy_uri"]
DOUBT_FIELDS = ["reason", "default", "legacy_uri", "legacy_artist", "legacy_title", "legacy_year", "legacy_spotify_url",
                "legacy_key", "rym_id", "rank", "rym_artist", "rym_title", "rym_year", "rym_spotify_url", "rym_url",
                "rym_paired_with"]
SPOTIFY_ALBUM_URL = "https://open.spotify.com/album/"


def _chart_fields(s: ChartRow) -> dict:
    return {"rank": s.rank, "on_chart": 1, "artist_latin": s.artist_latin, "title_latin": s.title_latin,
            "rym_artist": s.artist, "rym_title": s.title, "year": s.year, "release_date": s.row["release_date_iso"],
            "type": s.row["type"], "primary_genres": s.row["primary_genres"],
            "secondary_genres": s.row["secondary_genres"], "top_descriptors": s.row["top_descriptors"],
            **{c: s.row[c] for c in LINKS}, "rym_url": s.row["rym_url"]}


def tables(existing: list[Existing], chart: list[ChartRow], pairing: Pairing,
           manual: dict[str, str] | None = None) -> tuple[list[dict], list[dict], list[dict]]:
    """(catalog rows, keys rows, doubtful rows) for a pairing."""
    manual = manual or {}
    doubt_of: dict[int, list[str]] = {}
    for (index, _), reasons in pairing.doubts.items():
        doubt_of[index] = sorted(set(doubt_of.get(index, [])) | set(reasons))
    catalog, keys = [], []
    for e in existing:
        s, by = pairing.partner.get(e.index, (None, "manual" if e.uri in manual else "none"))
        key = s.rym_id if s else manual.get(e.uri, placeholder(e.uri))
        row = dict.fromkeys(CATALOG_FIELDS, "")
        row.update(_chart_fields(s) if s else {"on_chart": 0, "year": e.years[0] if len(e.years) == 1 else "",
                                               "release_date": e.release_date})
        row.update(rym_id=key, artist=e.artist, title=e.title, legacy_uri=e.uri)
        catalog.append(row)
        keys.append({"rym_id": key, "legacy_uri": e.uri, "matched_by": by, "doubt": ";".join(doubt_of.get(e.index, []))})
    for s in chart:
        if s.rym_id not in pairing.taken:
            catalog.append({**dict.fromkeys(CATALOG_FIELDS, ""), **_chart_fields(s), "rym_id": s.rym_id,
                            "artist": s.artist, "title": s.title})
    by_id = {s.rym_id: s for s in chart}
    doubts = []
    for (index, rym_id), reasons in pairing.doubts.items():
        e, s = existing[index], by_id[rym_id]
        mine = pairing.partner.get(index, (None, ""))[0]
        theirs = pairing.taken.get(rym_id)
        doubts.append({
            "reason": ";".join(reasons), "default": "paired" if mine is s else "unpaired",
            "legacy_uri": e.uri, "legacy_artist": e.artist, "legacy_title": e.title, "legacy_year": "/".join(e.years),
            "legacy_spotify_url": SPOTIFY_ALBUM_URL + e.uri[len(URI_PREFIX):], "legacy_key": keys[index]["rym_id"],
            "rym_id": rym_id, "rank": s.rank, "rym_artist": s.artist, "rym_title": s.title, "rym_year": s.year,
            "rym_spotify_url": s.row["spotify_url"], "rym_url": s.row["rym_url"],
            "rym_paired_with": existing[theirs].uri if theirs is not None and theirs != index else ""})
    doubts.sort(key=lambda d: (d["default"] == "paired", d["rank"], d["legacy_uri"]))  # the undecided first
    return catalog, keys, doubts


def summary(sheet: Path, chart: list[ChartRow], catalog: list[dict], keys: list[dict], doubts: list[dict]) -> dict:
    by = Counter(k["matched_by"] for k in keys)
    stamps = sorted(s.row.get("retrieved_at", "") for s in chart)
    return {
        "sheet": {"file": sheet.name, "sha256": sha256_file(sheet), "rows": len(chart),
                  "retrieved": [stamps[0], stamps[-1]] if stamps else []},
        "albums": len(catalog),
        "existing": len(keys),
        "existing_on_chart": sum(1 for r in catalog[:len(keys)] if r["on_chart"] == 1),
        "paired_by": {name: by[name] for name in ("spotify_id", "artist_title_year") if by[name]}
                     | ({"manual": sum(1 for r, k in zip(catalog, keys) if k["matched_by"] == "manual"
                                       and r["on_chart"] == 1)} if by["manual"] else {}),
        "existing_off_chart": sum(1 for r in catalog[:len(keys)] if r["on_chart"] == 0),
        "new": len(catalog) - len(keys),
        "doubtful_pairs": len(doubts),
        "doubtful_by_reason": dict(sorted(Counter(r for d in doubts for r in d["reason"].split(";")).items())),
    }


def _csv(fields: list[str], rows: list[dict]) -> str:
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return out.getvalue()


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="")
    os.replace(tmp, path)


def build(sheet: Path = DEFAULT_SHEET, table: Path = DEFAULT_TABLE, overrides: Path = DEFAULT_OVERRIDES,
          keys_path: Path = DEFAULT_KEYS) -> dict[str, str]:
    """The text of each output file, by name."""
    existing, chart = load_existing(table, overrides), load_sheet(sheet)
    manual = {}
    if keys_path.exists():
        manual = {r["legacy_uri"]: r["rym_id"] for r in load_keys(keys_path).rows if r["matched_by"] == "manual"}
    catalog, keys, doubts = tables(existing, chart, pair(existing, chart, manual), manual)
    check_rows(keys, keys_path.name)
    if len({r["rym_id"] for r in catalog}) != len(catalog):
        raise ValueError("two albums of the catalog have one key: a key set by hand in keys.csv is a new chart row's")
    return {
        "albums.csv": _csv(CATALOG_FIELDS, catalog),
        "keys.csv": _csv(KEYS_FIELDS, keys),
        "doubtful_pairs.csv": _csv(DOUBT_FIELDS, doubts),
        "manifest.json": json.dumps(summary(sheet, chart, catalog, keys, doubts), ensure_ascii=False, indent=1) + "\n",
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_catalog", description="Build the catalog and the album keys.")
    p.add_argument("--sheet", type=Path, default=DEFAULT_SHEET, help="CSV export of the sheet's Top 10K Chart tab.")
    p.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="Feature table pickle (read-only).")
    p.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES, help="The build's overrides.json.")
    p.add_argument("--keys", type=Path, default=DEFAULT_KEYS, help="keys.csv (default data-pipeline/audio/keys.csv).")
    p.add_argument("--out", type=Path, default=DEFAULT_CATALOG, help="Folder of albums.csv, doubtful_pairs.csv, manifest.json.")
    p.add_argument("--check", action="store_true", help="Write nothing; fail when the files are not what this gives.")
    args = p.parse_args(argv)
    if not args.sheet.exists():
        print(f"FAIL\nno sheet export at {args.sheet} (export the Top 10K Chart tab as CSV, or pass --sheet)",
              file=sys.stderr)
        return 1
    files = build(args.sheet, args.table, args.overrides, args.keys)
    paths = {name: (args.keys if name == "keys.csv" else args.out / name) for name in files}
    if args.check:
        stale = [str(paths[n]) for n, text in files.items()
                 if not paths[n].exists() or paths[n].read_text(encoding="utf-8") != text]
        print("stale: " + ", ".join(stale) if stale else "the committed catalog is what the builder gives")
        return 1 if stale else 0
    for name, text in files.items():
        _write(paths[name], text)
    s = json.loads(files["manifest.json"])
    print(f"{s['albums']} albums: {s['existing']} existing ({s['existing_on_chart']} on the chart: "
          + ", ".join(f"{n} by {by}" for by, n in s["paired_by"].items())
          + f"; {s['existing_off_chart']} off it), {s['new']} new")
    print(f"{s['doubtful_pairs']} doubtful pairs -> {paths['doubtful_pairs.csv']}")
    for reason, n in s["doubtful_by_reason"].items():
        print(f"  {n:4d}  {reason}: {REASONS[reason]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
