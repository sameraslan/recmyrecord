"""The cover lookup's state file as a committed table: what was decided for each album, and why.

    python scripts/covers_state.py            # from data-pipeline/: .cache/covers/state.json -> catalog/covers_state.csv
    python scripts/covers_state.py --check    # write nothing; fail when the table is not what the state file gives
    python scripts/covers_state.py --restore  # catalog/covers_state.csv -> .cache/covers/state.json, when there is none

.cache/covers/state.json (rmr_pipeline.covers.State, gitignored) is where the covers module records the
lookups that failed for a reason of the album's own, so that they are not asked again, and what the last
resort decided for each album it was asked for. A request that was refused or got no answer is never written
there (the module's Transient), so every entry is a decision and none is left out here. The table is a record
of that file: the covers module does not read it. `--restore` writes the state file again from the table on a
computer that has none (a fresh clone), so that `covers refs` asks nothing twice and the build leaves out the
images that are gone; it never replaces a state file that is there. The state file has no dates, so the table
has none.

catalog/covers_state.csv, ordered by stage (refs, sprites, caa_sprites, caa), then rym_id, then source
  rym_id     the album
  stage      refs         a lookup of `covers refs` that found no image: one row per album and tier
             sprites      an image of covers.csv that `covers sprites` could not fetch: the album shows no
                          cover from that row (Covers.is_gone) for as long as covers.csv has that image
             caa_sprites  the same for an image of the Cover Art Archive (covers_caa.csv)
             caa          what the last resort's search decided (look_up_caa)
  source     refs: the tier asked (spotify, store, bandcamp). sprites: the image's source (youtube, ...).
             caa_sprites and caa: caa
  ref        sprites, caa_sprites: the image that failed, as covers.csv has it (a video id, an image id, a
             release-group MBID). caa: the MBID of the release group taken, when there is one. refs: empty
  outcome    refs: failed. sprites, caa_sprites: gone. caa: found, none, ambiguous or `no art`
  reason     the state file's `why`
  mb_title, mb_artist, mb_year, mb_type   caa: the release group, as MusicBrainz has it
  score      caa: the best MusicBrainz score among the candidates
  queries    caa: how many searches were made

A `found` row of stage caa is the search's own answer. catalog/covers_caa.csv is what the site uses: it also
has the rows a reader chose by hand, and one of those can replace an answer of the search.
"""
import argparse
import csv
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline import covers as cv  # noqa: E402

DEFAULT_TABLE = cv.PIPELINE_DIR / "catalog" / "covers_state.csv"
FIELDS = ["rym_id", "stage", "source", "ref", "outcome", "reason", "mb_title", "mb_artist", "mb_year", "mb_type", "score",
          "queries"]
MB = ("mb_title", "mb_artist", "mb_year", "mb_type")
SECTIONS = ("refs", "sprites", "caa_sprites", "caa")  # the state file's, in the table's order


def rows_of(state: dict) -> list[dict]:
    """The table's rows for the state file's content."""
    unknown = sorted(set(state) - set(SECTIONS))
    if unknown:
        raise ValueError(f"the state file has a section this table does not know: {', '.join(unknown)}")
    blank = dict.fromkeys(FIELDS, "")
    out = []
    for key, tiers in sorted(state.get("refs", {}).items()):
        out += [blank | {"rym_id": key, "stage": "refs", "source": tier, "outcome": "failed", "reason": why}
                for tier, why in sorted(tiers.items())]
    for stage in ("sprites", "caa_sprites"):
        for key, e in sorted(state.get(stage, {}).items()):
            if set(e) != {"of", "why"}:
                raise ValueError(f"{stage}, {key}: expected `of` and `why`, got {sorted(e)}")
            source, _, ref = e["of"].partition(":")
            out.append(blank | {"rym_id": key, "stage": stage, "source": source, "ref": ref, "outcome": "gone", "reason": e["why"]})
    for key, e in sorted(state.get("caa", {}).items()):
        extra = set(e) - {"decision", "why", "score", "queries", "mbid", *MB}
        if extra or ("mbid" in e) != all(f in e for f in MB) or not e.get("mbid", "x"):
            raise ValueError(f"caa, {key}: not the shape this table keeps ({sorted(e)})")
        out.append(blank | {"rym_id": key, "stage": "caa", "source": cv.CAA, "ref": e.get("mbid", ""), "outcome": e["decision"],
                            "reason": e["why"], "score": json.dumps(e["score"]), "queries": json.dumps(e["queries"])}
                   | {f: e[f] for f in MB if f in e})
    return out


def state_of(rows: list[dict]) -> dict:
    """The state file's content for the table's rows: rows_of, backwards."""
    state: dict = {"refs": {}, "sprites": {}}
    for r in rows:
        key, stage = r["rym_id"], r["stage"]
        if stage == "refs":
            state["refs"].setdefault(key, {})[r["source"]] = r["reason"]
        elif stage in ("sprites", "caa_sprites"):
            state.setdefault(stage, {})[key] = {"of": cv.made_from((r["source"], r["ref"])), "why": r["reason"]}
        elif stage == "caa":
            e = {"decision": r["outcome"], "why": r["reason"], "score": json.loads(r["score"]), "queries": json.loads(r["queries"])}
            if r["ref"]:
                e |= {"mbid": r["ref"]} | {f: r[f] for f in MB}
            state.setdefault("caa", {})[key] = e
        else:
            raise ValueError(f"{key}: unknown stage {stage!r}")
    return state


def table_text(rows: list[dict]) -> str:
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=FIELDS, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return out.getvalue()


def read_table(path: Path) -> list[dict]:
    with Path(path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELDS:
            raise ValueError(f"{path}: the header must be {','.join(FIELDS)}")
        return list(reader)


def main(argv: list[str] | None = None, out=print) -> int:
    p = argparse.ArgumentParser(description="The cover lookup's state file as a committed table.")
    p.add_argument("--state", type=Path, default=cv.DEFAULT_STATE, help="The state file (.cache/covers/state.json).")
    p.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="The table (catalog/covers_state.csv).")
    how = p.add_mutually_exclusive_group()
    how.add_argument("--check", action="store_true", help="Write nothing; fail when the table is not what the state file gives.")
    how.add_argument("--restore", action="store_true", help="Write the state file from the table, when there is no state file.")
    args = p.parse_args(argv)
    try:
        if args.restore:
            if args.state.exists():
                out(f"{args.state} is there: left as it is")
                return 1
            state = state_of(read_table(args.table))
            # as State.save writes it
            cv.write_atomic(args.state, json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True).encode("utf-8"))
            out(f"wrote {args.state} from {args.table}: " + ", ".join(f"{len(v)} {k}" for k, v in state.items()))
            return 0
        if not args.state.exists():
            out(f"no state file at {args.state}: nothing to record (--restore writes one from the table)")
            return 1
        state = json.loads(args.state.read_text(encoding="utf-8"))
        rows = rows_of(state)
        if state_of(rows) != {"refs": {}, "sprites": {}} | state:
            raise ValueError("the table would not give the state file back")
        text = table_text(rows)
        if args.check:
            same = args.table.exists() and args.table.read_text(encoding="utf-8") == text
            out(f"{args.table} is what the state file gives" if same else f"stale: {args.table}")
            return 0 if same else 1
        cv.write_atomic(args.table, text.encode("utf-8"))
        out(f"wrote {args.table}: {len(rows)} rows (" + ", ".join(
            f"{sum(1 for r in rows if r['stage'] == s)} {s}" for s in SECTIONS) + ")")
        return 0
    except ValueError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
