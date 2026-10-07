"""One cover row for every album of the catalog: the cover the built site shows, its URL and where it came from.

    python scripts/covers_resolved.py            # from data-pipeline/, after a build: writes catalog/covers_resolved.csv
    python scripts/covers_resolved.py --check    # write nothing; fail when the table is not what this gives

The cover of an album is decided by the build from several places: the map's metadata for the albums the
site had before the 10k catalog (another repository, the build's --map-root: nothing in this one has those
ids but the built albums.json), catalog/covers.csv, catalog/covers_caa.csv, catalog/covers_skip.csv,
overrides.json and the covers state file. This table is the outcome for every album, read from the built
frontcreck/public/data/albums.json (`c`), with the place each cover came from. It is generated: run it again
after every build, and never edit it. Nothing reads it. No network.

catalog/covers_resolved.csv, in catalog order (the rows of catalog/albums.csv)
  rym_id   the album
  slug     its slug on the site
  kind     spotify | dz (Deezer) | am (Apple Music) | bc (Bandcamp) | yt (a YouTube video frame) |
           ca (the Cover Art Archive) | none
  ref      the image's id without its prefix: what follows `dz:`, `am:`, `bc:`, `yt:`, `ca:` in the site's
           `c`, or the whole of a Spotify image id. Empty for none
  url      the image at about 640 px, from rmr_pipeline.covers.cover_url(c, 640). Empty for none
  origin   overrides.json     a cover id set by hand
           covers.csv         the row `covers refs` found for the album
           covers_caa.csv     the last resort: the front image of its MusicBrainz release group
           map                the map's metadata (--map-root): the album kept the cover it had on the site
           none               no cover
  note     for none: why, as far as the committed tables say

An album's row here is `c` as the site has it, so the albums.json a row was read from says exactly which
build it describes; `--check` fails when the two differ.
"""
import argparse
import csv
import io
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline import covers as cv  # noqa: E402

DEFAULT_TABLE = cv.PIPELINE_DIR / "catalog" / "covers_resolved.csv"
DEFAULT_STATE_TABLE = cv.PIPELINE_DIR / "catalog" / "covers_state.csv"  # scripts/covers_state.py: the images that are gone
FIELDS = ["rym_id", "slug", "kind", "ref", "url", "origin", "note"]
PX = 640
KINDS = {prefix.rstrip(":"): prefix for prefix in cv.C_PREFIX.values()}  # dz, am, bc, yt, ca -> the prefix in `c`


def kind_of(c: str) -> tuple[str, str]:
    """(kind, ref) of a `c` of albums.json."""
    if not c:
        return "none", ""
    head, colon, ref = c.partition(":")
    return (head, ref) if colon and head in KINDS else ("spotify", c)


def _gone(state_table: Path) -> dict[str, str]:
    """rym_id -> the `source:ref` of covers.csv whose image is recorded as gone (covers_state.csv)."""
    if not Path(state_table).exists():
        return {}
    with Path(state_table).open(encoding="utf-8", newline="") as f:
        return {r["rym_id"]: cv.made_from((r["source"], r["ref"])) for r in csv.DictReader(f) if r["stage"] == "sprites"}


def why_none(key: str, covers: dict, caa: dict, skips: set, unverified: set, gone: dict[str, str]) -> str:
    said = []
    if key in unverified:
        said.append("unverified_links.csv: its Spotify link opens another album")
    if key in covers:
        of = cv.made_from(covers[key])
        said.append(f"covers_skip.csv: {of} is not a cover" if (key, of) in skips else
                    f"covers_state.csv: the image of {of} is gone" if gone.get(key) == of else
                    f"covers.csv has {of}, which the build did not use")
    if key in caa:
        of = cv.made_from((cv.CAA, caa[key]["mbid"]))
        said.append(f"covers_skip.csv: {of} is not the album's cover" if (key, of) in skips else
                    f"covers_caa.csv has {of}, which the build did not use")
    return "; ".join(said) or "no cover source found"


def resolve(site_albums: Path = cv.DEFAULT_SITE_ALBUMS, albums: Path = cv.DEFAULT_ALBUMS, covers_path: Path = cv.DEFAULT_COVERS,
            caa_path: Path = cv.DEFAULT_CAA, skip_path: Path = cv.DEFAULT_SKIP, unverified_path: Path = cv.DEFAULT_UNVERIFIED,
            overrides_path: Path = cv.DEFAULT_OVERRIDES, state_table: Path = DEFAULT_STATE_TABLE) -> list[dict]:
    site = json.loads(Path(site_albums).read_text(encoding="utf-8"))
    catalog = cv.catalog_rows(albums)
    if len(site) != len(catalog):
        raise ValueError(f"{site_albums} has {len(site)} albums and {albums} {len(catalog)}: build the site data first")
    covers, caa, skips = cv.read_covers(covers_path), cv.read_caa(caa_path), cv.read_skips(skip_path)
    by_hand = {e["c"] for e in json.loads(Path(overrides_path).read_text(encoding="utf-8")).values() if e.get("c")}
    unverified, slug_of = set(), {}
    if Path(unverified_path).exists():
        with Path(unverified_path).open(encoding="utf-8", newline="") as f:
            slug_of = {r["rym_id"]: r["slug"] for r in csv.DictReader(f)}
        unverified = set(slug_of)
    gone = _gone(state_table)
    out = []
    for album, row in zip(site, catalog):
        key, c = row["rym_id"], album["c"]
        if slug_of.get(key, album["slug"]) != album["slug"]:  # the one table that has both: the rows are the catalog's
            raise ValueError(f"{key}: row {len(out) + 2} of {albums} is {album['slug']} in {site_albums}, not {slug_of[key]}")
        kind, ref = kind_of(c)
        note = ""
        if kind == "none":
            origin, note = "none", why_none(key, covers, caa, skips, unverified, gone)
        elif c in by_hand:
            origin = "overrides.json"
        elif kind == "ca" and caa.get(key, {}).get("mbid") == ref:
            origin = "covers_caa.csv"
        elif key in covers and cv.c_field(*covers[key]) == c:
            origin = "covers.csv"
        elif kind == "spotify" and row["legacy_uri"]:
            origin = "map"
        else:
            raise ValueError(f"{key} ({album['slug']}): no committed table has its cover {c!r}. Was the site data built "
                             "from these tables?")
        out.append({"rym_id": key, "slug": album["slug"], "kind": kind, "ref": ref, "url": cv.cover_url(c, PX),
                    "origin": origin, "note": note})
    return out


def table_text(rows: list[dict]) -> str:
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=FIELDS, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return out.getvalue()


def main(argv: list[str] | None = None, out=print) -> int:
    p = argparse.ArgumentParser(description="One cover row for every album of the catalog, from the built albums.json.")
    p.add_argument("--site-albums", type=Path, default=cv.DEFAULT_SITE_ALBUMS, help="The built albums.json.")
    p.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="The table (catalog/covers_resolved.csv).")
    p.add_argument("--check", action="store_true", help="Write nothing; fail when the table is not what this gives.")
    args = p.parse_args(argv)
    try:
        rows = resolve(args.site_albums)
    except ValueError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    text = table_text(rows)
    for name in ("kind", "origin"):
        out(f"{name}: " + ", ".join(f"{k} {n}" for k, n in Counter(r[name] for r in rows).most_common()))
    if args.check:
        same = args.table.exists() and args.table.read_text(encoding="utf-8") == text
        out(f"{args.table} is what the site data gives" if same else f"stale: {args.table}")
        return 0 if same else 1
    cv.write_atomic(args.table, text.encode("utf-8"))
    out(f"wrote {args.table}: {len(rows)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
