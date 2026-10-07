"""The hand-matched last-resort covers: copy the rows of docs/review/caa-covers-hand-pending.csv into
catalog/covers_caa.csv once the Cover Art Archive says the release group has a front image.

    python scripts/caa_hand.py            # from data-pipeline/; then `covers sprites`, the build, caa_review.py

The pending file has the columns of covers_caa.csv, `matched_by` `hand`; the reason for each row is in
docs/review/caa-covers-hand.md. One request per row to coverartarchive.org, through the covers module's
fetcher (its allow-list, one request a second). A row whose group has a front image is added (replacing the
album's row when it has one: West Side Story); one with no image is reported and left. The first request with
no usable answer (the archive's HTTP 503, after the fetcher's one retry) ends the run with exit code 2: what was
added is written, the other rows wait for the next run, which asks only for those. The pending file is not
changed.
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline import covers as cv  # noqa: E402

PENDING = cv.PIPELINE_DIR.parent / "docs" / "review" / "caa-covers-hand-pending.csv"


def main(pending_path: Path = PENDING, caa_path: Path = cv.DEFAULT_CAA, albums_path: Path = cv.DEFAULT_ALBUMS,
         fetcher: "cv.Fetcher | None" = None, out=print) -> int:
    with Path(pending_path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != list(cv.CAA_FIELDS):
            raise SystemExit(f"{pending_path}: the header must be {','.join(cv.CAA_FIELDS)}")
        pending = list(reader)
    order = [r["rym_id"] for r in cv.catalog_rows(albums_path)]
    known = set(order)
    for row in pending:  # checked before the first request
        if row["rym_id"] not in known or not cv.MBID.fullmatch(row["mbid"] or "") or row["matched_by"] != "hand":
            raise SystemExit(f"{pending_path}: {row['rym_id']!r}: not a catalog album, not an MBID, or not `hand`")
    table = cv.read_caa(caa_path)
    fetcher = fetcher or cv.Fetcher(cv.CAA_INTERVALS)
    counts, code, asked = {"added": 0, "no art": 0, "there": 0}, 0, 0
    for row in pending:
        key, mbid = row["rym_id"], row["mbid"]
        if table.get(key, {}).get("mbid") == mbid:
            counts["there"] += 1
            asked += 1
            continue
        try:
            front = cv.has_front(fetcher.get(cv.caa_listing_url(mbid), cv.IMAGE_BYTES))
        except cv.Gone as e:
            if not str(e).startswith("HTTP "):  # a redirect off the allow-list says nothing about the art
                out(f"  {key}: {e}: left for the next run")
                asked += 1
                continue
            front = False
        except (cv.StopRun, cv.Transient) as e:  # the archive refuses or does not answer: ask nothing more
            out(f"stopped at {key}: the archive: {e}. Nothing more is asked in this run; wait before starting it again.")
            code = 2
            break
        asked += 1
        if not front:
            out(f"  {key}: no front image for release group {mbid} ({row['mb_title']}): not added")
            counts["no art"] += 1
            continue
        table[key] = {f: row[f] for f in cv.CAA_FIELDS}
        counts["added"] += 1
    cv.write_caa(caa_path, table, order)
    left = len(pending) - counts["added"] - counts["there"] - counts["no art"]
    out(f"{counts['added']} added, {counts['there']} already there, {counts['no art']} with no front image, "
        f"{left} left for the next run, of {len(pending)}; {fetcher.requests} request(s)")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
