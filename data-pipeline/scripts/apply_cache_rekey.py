"""Bring the one-pass clip cache (.cache/audio/onepass.sqlite) to the keys of audio/keys.csv after albums were
paired by hand: apply a list of renames and dropped listings.

    .venv/bin/python scripts/apply_cache_rekey.py [--list .cache/audio/pending_cache_rekey.csv] [--cache DB] [--apply]

Without --apply nothing is written: the cache is opened read-only and the rows each line would touch are
counted. With --apply the whole list is one transaction, and the run refuses to start while a one-pass run
holds the cache's lock (onepass.lock beside it).

The list is a CSV with the columns action, old_key, new_key, source, album_id, note:
  drop_listing  delete the clips, embeddings and listing row of (old_key, source, album_id): the listing of a
                catalog row that was a duplicate of an existing album, or of a match that was corrected
  keep_listing  nothing: says that a listing already under the new key stays (it is the album's right one)
  rename        every row of old_key gets new_key
Drops are applied before renames, whatever the order of the lines: a duplicate matched to the same listing as
the existing album would otherwise collide with the renamed rows. A rename that would still collide stops the
run before anything is written. Applying a list twice changes nothing the second time: a drop under a key
that a rename of the list has already been applied to is left out (old_key has no rows any more), because
that listing is then the renamed album's own.

Standard library only.
"""
import argparse
import csv
import fcntl
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
CACHE = HERE / ".cache" / "audio" / "onepass.sqlite"
LIST = HERE / ".cache" / "audio" / "pending_cache_rekey.csv"
TABLES = ("clips", "embeddings", "listings")
ACTIONS = ("drop_listing", "keep_listing", "rename")


def read_list(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for n, r in enumerate(rows, start=2):
        if r.get("action") not in ACTIONS or not r.get("old_key") or (r["action"] == "rename" and not r.get("new_key")):
            raise ValueError(f"{path} line {n}: action must be one of {ACTIONS}, with old_key (and new_key for rename)")
    return rows


def apply(con: sqlite3.Connection, rows: list[dict], write: bool) -> dict[str, int]:
    """Counts of cache rows dropped and renamed. With write False the statements are only counted."""
    done = {"dropped": 0, "renamed": 0}
    came_from = {r["new_key"]: r["old_key"] for r in rows if r["action"] == "rename"}

    def pending(key: str) -> bool:
        """Is the rename onto `key` still to do? Once it is done, the listing under `key` is the renamed
        album's own, and dropping it again would delete what the rename kept."""
        old = came_from.get(key)
        return old is None or any(con.execute(f"SELECT 1 FROM {t} WHERE key = ? LIMIT 1", (old,)).fetchone() for t in TABLES)

    drops = [(r["old_key"], r["source"], r["album_id"]) for r in rows if r["action"] == "drop_listing" and pending(r["old_key"])]
    for table in TABLES:
        for ident in drops:
            where = f"FROM {table} WHERE key = ? AND source = ? AND album_id = ?"
            done["dropped"] += (con.execute(f"DELETE {where}", ident).rowcount if write
                                else con.execute(f"SELECT COUNT(*) {where}", ident).fetchone()[0])
    dropped = set(drops)
    for r in (r for r in rows if r["action"] == "rename"):
        old, new = r["old_key"], r["new_key"]
        for table in TABLES:
            mine = con.execute(f"SELECT DISTINCT source, album_id FROM {table} WHERE key = ?", (old,)).fetchall()
            theirs = set(con.execute(f"SELECT DISTINCT source, album_id FROM {table} WHERE key = ?", (new,)).fetchall())
            clash = [l for l in mine if l in theirs and (new, *l) not in dropped]
            if clash:
                raise ValueError(f"{table}: {old} and {new} both have rows of {clash[0][0]} {clash[0][1]}; "
                                 "drop one side's listing first")
            if write:
                done["renamed"] += con.execute(f"UPDATE {table} SET key = ? WHERE key = ?", (new, old)).rowcount
            else:
                done["renamed"] += con.execute(f"SELECT COUNT(*) FROM {table} WHERE key = ?", (old,)).fetchone()[0]
    return done


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Apply key renames and dropped listings to the one-pass clip cache.")
    p.add_argument("--list", type=Path, default=LIST, help="The CSV of actions.")
    p.add_argument("--cache", type=Path, default=CACHE, help="The one-pass cache.")
    p.add_argument("--apply", action="store_true", help="Write. Without it the rows are only counted.")
    args = p.parse_args(argv)
    rows = read_list(args.list)
    if not args.cache.exists():
        print(f"FAIL\nno cache at {args.cache}", file=sys.stderr)
        return 1
    lock = None
    try:
        if args.apply:
            lock = open(args.cache.with_suffix(".lock"), "a")
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                print(f"FAIL\n{lock.name} is held by a running one-pass job: not starting", file=sys.stderr)
                return 1
            con = sqlite3.connect(args.cache, timeout=60)
        else:
            con = sqlite3.connect(args.cache.resolve().as_uri() + "?mode=ro", uri=True, timeout=60)
        try:
            with con:  # one transaction: commit at the end, roll back on an error
                done = apply(con, rows, args.apply)
        except ValueError as e:
            print(f"FAIL\n{e}", file=sys.stderr)
            return 1
        finally:
            con.close()
    finally:
        if lock is not None:
            lock.close()
    n = {a: sum(r["action"] == a for r in rows) for a in ACTIONS}
    verb = "" if args.apply else "would be "
    print(f"{n['drop_listing']} listings dropped ({done['dropped']} rows {verb}deleted), {n['rename']} keys renamed "
          f"({done['renamed']} rows {verb}rewritten), {n['keep_listing']} listings kept as they are")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
