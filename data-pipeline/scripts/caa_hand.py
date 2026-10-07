"""The hand-matched last-resort covers: move the rows of docs/review/caa-covers-hand-pending.csv into
catalog/covers_caa.csv once the Cover Art Archive says the release group has a front image.

    python scripts/caa_hand.py            # from data-pipeline/; then `covers sprites`, the build, caa_review.py

The pending file has the columns of covers_caa.csv, `matched_by` `hand`; the reason for each row is in
docs/review/caa-covers-hand.md. One request per row to coverartarchive.org, through the covers module's
fetcher (its allow-list, one request a second). A row whose group has a front image is added (replacing the
album's row when it has one: West Side Story); one with no image is reported and left; a request with no
usable answer (the archive's HTTP 503) leaves the row for the next run. Exit code 2 when the archive refused.
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline import covers as cv  # noqa: E402

PENDING = cv.PIPELINE_DIR.parent / "docs" / "review" / "caa-covers-hand-pending.csv"


def main() -> int:
    with PENDING.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != list(cv.CAA_FIELDS):
            raise SystemExit(f"{PENDING}: the header must be {','.join(cv.CAA_FIELDS)}")
        pending = list(reader)
    order = [r["rym_id"] for r in cv.catalog_rows()]
    table, fetcher, counts, code = cv.read_caa(), cv.Fetcher(cv.CAA_INTERVALS), {"added": 0, "no art": 0, "left": 0, "there": 0}, 0
    for row in pending:
        key, mbid = row["rym_id"], row["mbid"]
        if key not in order or not cv.MBID.fullmatch(mbid) or row["matched_by"] != "hand":
            raise SystemExit(f"{PENDING}: {key!r}: not a catalog album, not an MBID, or not `hand`")
        if table.get(key, {}).get("mbid") == mbid:
            counts["there"] += 1
            continue
        try:
            front = cv.has_front(fetcher.get(cv.caa_listing_url(mbid), cv.IMAGE_BYTES))
        except cv.Gone as e:
            if not str(e).startswith("HTTP "):
                print(f"  {key}: {e}: left for the next run")
                counts["left"] += 1
                continue
            front = False
        except cv.StopRun as e:
            print(f"stopped: {e}")
            code = 2
            break
        except cv.Transient as e:
            print(f"  {key}: the archive: {e}: left for the next run")
            counts["left"] += 1
            code = 2
            continue
        if not front:
            print(f"  {key}: no front image for release group {mbid} ({row['mb_title']}): not added")
            counts["no art"] += 1
            continue
        table[key] = dict(row)
        counts["added"] += 1
    cv.write_caa(cv.DEFAULT_CAA, table, order)
    print(f"{counts['added']} added, {counts['there']} already there, {counts['no art']} with no front image, "
          f"{counts['left']} left for the next run, of {len(pending)}; {fetcher.requests} request(s)")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
