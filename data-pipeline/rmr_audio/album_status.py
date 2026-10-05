"""One row per catalog album: is its audio done, which models have embeddings, which listing they came
from, what is odd about it, and what should happen to it next.

  cd data-pipeline
  .venv/bin/python -m rmr_audio.album_status [--cache SQLITE] [--catalog CSV] [--audio-dir DIR] [--out CSV]
                                             [--summary MD] [--dry-run]

It writes audio/album_status.csv (the table, in catalog order) and audio/album_status.md (the counts), and
prints the counts. Run it again whenever the cache, matches.csv, fulllength.csv or the overrides change:
the same inputs give the same bytes (no dates in the outputs). No network, no model: the standard library
and rmr_pipeline, in either environment.

What it reads, and nothing else:
  catalog/albums.csv          the albums, their order, their YouTube link
  audio/keys.csv              which albums were on the site before the 10k catalog (`existing`)
  audio/matches.csv           each album's store listing and its flags
  audio/match_overrides.json  hand corrections
  audio/fulllength.csv        the outcome of each YouTube or Bandcamp fetch
  .cache/audio/onepass.sqlite the one-pass clip cache, strictly read-only (`mode=ro`; another job may be
                              writing to it). It is the only source for "has embeddings". Without it the
                              command fails and writes nothing.

Columns
  key, rank, on_chart, existing_or_new, artist, title, year
  match_source, listing_id, matched_by, ambiguous, n_tracks, previews_available, runtime_s
      the row of matches.csv. previews_available and runtime_s fall back on what the cache recorded for that
      listing when matches.csv has none. runtime_s is empty for the existing albums: they were matched
      before it was recorded.
  <model>_ok, <model>_source, <model>_used      for effnet, clap, and any other model the cache has
      The listing is the one the album mean is taken from (OnePassCache.means, as rmr_audio.modelstore
      calls it): the album's windows of full-length audio when it has any (local, then youtube, then
      bandcamp), else the listing match_overrides.json forces when it has an ok clip for the model, else
      the listing matches.csv names when it has an ok clip, else the listing with the most ok clips. `ok`: the model's ok clips (or windows) on that listing. `source`: deezer, itunes:xx,
      youtube, bandcamp, local or none. `used`: how many go into the mean, the first 4 ok clips, or the
      album's window count.
  audio_source    the source of the two required models (effnet, clap); `a/b` when they differ; none
  under_covered   matched and the listing has 1 to 3 previews, whatever its length. Wider than the column
                  of the same name in matches.csv, which also asks for 15 minutes of runtime and is empty
                  for the existing albums.
  few_long_tracks 1 to 3 tracks, or 1 to 3 previews, for a listing of 15 minutes or more (Long Season).
                  Empty when the runtime is not known.
  short_preview   matches.csv's flag, or a clip of the listing used that the cache flags (under 25 s from a
                  track over 60 s). Empty when neither knows.
  wrong_listing_pending   match_overrides.json forces a listing, and a required model's mean is taken
                  from another store listing, because the forced one has no ok clip for that model yet:
                  the album has to be embedded again. It clears once both required models have one.
  duplicate_listing       another catalog album is matched to the same store listing
  has_youtube_url the sheet has a YouTube link for the album
  edge_case       `edge_case`, below: on 1 to 3 previews of a listing of 15 minutes or more, or of unknown
                  runtime. These are the albums rmr_audio.fulllength --edge-cases fetches full-length audio for.
  has_youtube_url the sheet has a YouTube link for the album
  fulllength      the sheet's YouTube link, by its row of fulllength.csv: embedded, unavailable, single_track,
                  mismatch, failed (tried again by the next run) or not_tried
  youtube_search  the YouTube search for the album (rmr_audio.fulllength --search), by its row of
                  fulllength.csv: found (a video was taken and embedded), none (nothing passed, or the
                  video taken turned out not to be usable: final unless --retry-search), failed (the video
                  taken could not be fetched: tried again by the next run) or not_tried
  state, next_step        `decide`, below: the one place the rules are
"""
import argparse
import csv
import io
import os
import sys
from collections import Counter
from pathlib import Path

from rmr_pipeline.audio import DEFAULT_CATALOG
from rmr_pipeline.audio_store import (DEFAULT_AUDIO, StoreError, duplicate_listings, load_match_overrides,
                                      load_matches)
from rmr_pipeline.constants import PIPELINE_DIR

from .onepass_cache import WINDOW_SOURCES, read_only

DEFAULT_CACHE_DB = PIPELINE_DIR / ".cache" / "audio" / "onepass.sqlite"  # as rmr_audio.modelstore's
REQUIRED = ("effnet", "clap")  # the models `state` asks for; any other model of the cache is only reported
CLIPS = 4  # the standard number of clips per album (rmr_audio.modelstore.CLIPS)
LONG_S = 15 * 60  # a listing this long is an album (rmr_audio.match.LONG_S; that module needs pandas)
STATES = ("done", "partial", "no_audio")
NEXT_STEPS = ("none", "embed", "reembed", "youtube_link", "youtube_search", "youtube_full_length", "none_available")
FULLLENGTH = ("embedded", "unavailable", "single_track", "mismatch", "failed", "not_tried")
SEARCHED = ("found", "none", "failed", "not_tried")
HEAD = ["key", "rank", "on_chart", "existing_or_new", "artist", "title", "year",
        "match_source", "listing_id", "matched_by", "ambiguous", "n_tracks", "previews_available", "runtime_s"]
TAIL = ["audio_source", "under_covered", "few_long_tracks", "short_preview", "wrong_listing_pending",
        "duplicate_listing", "edge_case", "has_youtube_url", "fulllength", "youtube_search", "state", "next_step"]


def edge_case(previews: int | None, runtime_s: float | None) -> bool:
    """Is an album on store previews under-covered by them, so that full-length audio should replace them
    (rmr_audio.fulllength --edge-cases)? The one rule:

      the listing has 1 to 3 previews, and it runs 15 minutes or more, or its runtime is not known.

    That takes in the albums of one to three long tracks (Long Season: one track, one 30-second preview of
    35 minutes) and the albums of which a store previews only a few tracks. It leaves out the singles and
    short EPs, whose few previews already cover them (a listing under 15 minutes). The runtime is unknown
    only for albums that were on the site before the 10k catalog (matched before runtimes were recorded):
    they are taken in, and the fetch's own floor (a video under 15 minutes is not a full album) keeps the
    short ones on their previews."""
    return previews is not None and 0 < previews < CLIPS and (runtime_s is None or runtime_s >= LONG_S)


def listing_facts(m: dict, listed: dict) -> tuple[int | None, int | None, int | None]:
    """(tracks, previews, runtime in seconds) of an album's store listing: its row of matches.csv, falling
    back on what the cache recorded for that listing (`listed`) where the row has nothing."""
    n_tracks = _int(m["n_tracks"]) if m["n_tracks"] != "" else listed.get("n_tracks")
    previews = _int(m["n_clips_available"]) if m["n_clips_available"] != "" else listed.get("n_previews")
    runtime = _int(m["runtime_s"]) if m["runtime_s"] != "" else _int(listed.get("runtime_s"))
    return n_tracks, previews, runtime


def decide(used: dict[str, int], windowed: bool = False, previews_available: int = 0, edge_case: bool = False,
           wrong_listing_pending: bool = False, has_youtube_url: bool = False,
           fulllength: str = "not_tried", youtube_search_tried: bool = False) -> tuple[str, str]:
    """(state, next_step) of one album. Every rule for the two columns is here.

    used               clips (or windows) in the album mean, per required model (REQUIRED)
    windowed           that audio is windows of full-length audio (local, youtube, bandcamp), not previews
    previews_available previews of the album's store listing
    edge_case          the album is under-covered by its previews (edge_case, above)
    fulllength         the outcome of the sheet's YouTube link (FULLLENGTH)
    youtube_search_tried  a YouTube search was run for the album and gave nothing usable

    state
      done      every required model has 4 or more clips, or windows of full-length audio
      no_audio  no required model has a clip
      partial   anything between: 1 to 3 clips, or one model without what the other has

    next_step, the first that applies
      reembed              wrong listing pending: embed again from the listing the override names
      (no_audio)
        embed              the listing has previews that are not embedded yet
        youtube_link       the sheet has a YouTube link that was not tried, or whose fetch failed
        none_available     no usable sheet link, and the search found nothing
        youtube_search     no usable sheet link (none, or unavailable, a single track, a mismatch)
      none                 the audio already is full-length
      (preview audio of an edge case)
        none_available     no usable sheet link, and the search found nothing: the album stays on its previews
        youtube_full_length  the link or the search is still to try
      embed                partial and not an edge case: the listing has more previews than were embedded,
                           or one model is behind the other
      none                 done, or every preview of a short listing (1 to 3 previews, under 15 minutes) is embedded
    """
    n = [used.get(m, 0) for m in REQUIRED]
    if not any(n):
        state = "no_audio"
    elif all(n) and (windowed or min(n) >= CLIPS):
        state = "done"
    else:
        state = "partial"

    link_open = has_youtube_url and fulllength in ("not_tried", "failed")
    if wrong_listing_pending:
        step = "reembed"
    elif state == "no_audio":
        if previews_available > 0:
            step = "embed"
        elif link_open:
            step = "youtube_link"
        else:
            step = "none_available" if youtube_search_tried else "youtube_search"
    elif windowed and state == "done":
        step = "none"
    elif edge_case and not windowed:
        step = "none_available" if youtube_search_tried and not link_open else "youtube_full_length"
    else:
        covered = 0 < previews_available < CLIPS and min(n) >= previews_available  # a short listing, all of it embedded
        step = "embed" if state == "partial" and not covered else "none"
    return state, step


def _int(text) -> int | None:
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _flag(value) -> str:
    return "" if value is None else str(int(bool(value)))


def read_cache(path: Path) -> dict:
    """What the table needs of the cache, read in one transaction so a job writing to it cannot give two
    answers: ok[model][key][(source, album_id)] = ok clips, the window listings, listings, short previews."""
    con = read_only(path)
    try:
        con.execute("BEGIN")
        ok: dict[str, dict[str, dict[tuple[str, str], int]]] = {}
        window_ok: dict[str, Counter] = {}  # ok rows of any model: how OnePassCache.means picks the window listing
        for key, source, album_id, model, n in con.execute(
                "SELECT key, source, album_id, model, COUNT(*) FROM embeddings WHERE status = 'ok' AND emb IS NOT NULL "
                "GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4"):
            ok.setdefault(model, {}).setdefault(key, {})[(source, album_id)] = n
            if source in WINDOW_SOURCES:
                window_ok.setdefault(key, Counter())[(source, album_id)] += n
        listings = {tuple(r[:3]): dict(zip(("n_tracks", "n_previews", "runtime_s", "n_windows"), r[3:]))
                    for r in con.execute("SELECT key, source, album_id, n_tracks, n_previews, runtime_s, n_windows FROM listings")}
        short = {tuple(r[:3]): (r[3], r[4]) for r in con.execute(
            "SELECT key, source, album_id, SUM(short_preview = 1), SUM(short_preview IS NOT NULL) FROM clips GROUP BY 1, 2, 3")}
        con.execute("ROLLBACK")
    finally:
        con.close()
    if not ok:
        raise StoreError(f"{path} has no ok embedding: not writing a table of zeros")
    windowed = {key: min(c, key=lambda l: (WINDOW_SOURCES.index(l[0]), -c[l], l)) for key, c in window_ok.items()}
    return {"ok": ok, "windowed": windowed, "listings": listings, "short": short}


def used_listing(cache: dict, model: str, key: str, named: tuple[str, str] | None,
                 forced: tuple[str, str] | None = None) -> tuple[tuple[str, str] | None, int, int]:
    """(listing, ok clips on it, clips in the mean) for one model and album, by OnePassCache.means's rule
    with the `rank` pool, the listing preferred as rmr_audio.modelstore.listing_of prefers it: the one
    match_overrides.json forces (`forced`) before the one matches.csv names (`named`). (None, 0, 0) when
    the model has no audio for the album."""
    mine = cache["ok"].get(model, {}).get(key)
    if not mine:
        return None, 0, 0
    if key in cache["windowed"]:
        listing = cache["windowed"][key]
        limit = cache["listings"].get((key, *listing), {}).get("n_windows") or None
    elif forced in mine or named in mine:
        listing, limit = forced if forced in mine else named, CLIPS
    else:
        listing, limit = max(mine, key=lambda l: mine[l]), CLIPS
    n = mine.get(listing, 0)
    if not n:  # the album's windows are another model's: means leaves the album out for this one
        return None, 0, 0
    return listing, n, n if limit is None else min(n, limit)


def _read(path: Path) -> list[dict]:
    try:
        with open(path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        raise StoreError(f"missing {path}") from None


def youtube_outcomes(path: Path) -> tuple[dict[str, str], dict[str, str]]:
    """(key -> the outcome of the sheet's YouTube link, key -> the outcome of the YouTube search), from the
    rows of fulllength.csv (a search's row has matched_by `search`). A missing file means nothing was tried."""
    link, search = {}, {}
    for r in _read(path) if path.exists() else []:
        if r["source"] != "youtube":
            continue
        if r.get("matched_by") == "search":
            search[r["key"]] = {"embedded": "found", "search_none": "none", "skipped": "none"}.get(r["status"], "failed")
        elif r["status"] == "embedded":
            link[r["key"]] = "embedded"
        elif r["status"] == "skipped" and r["class"] in ("unavailable", "single_track", "mismatch"):
            link[r["key"]] = r["class"]
        else:  # failed or blocked: the next run tries again
            link[r["key"]] = "failed"
    return link, search


def build(cache_db: Path = DEFAULT_CACHE_DB, catalog: Path = DEFAULT_CATALOG, audio_dir: Path = DEFAULT_AUDIO) -> tuple[list[str], list[dict]]:
    """(columns, rows): one row of strings per catalog album, in catalog order."""
    cache = read_cache(cache_db)  # first: without the cache nothing else is worth reading
    albums = _read(catalog)
    existing = {r["rym_id"] for r in _read(audio_dir / "keys.csv")}
    matches = load_matches(audio_dir / "matches.csv")
    match = {r["key"]: r for r in matches}
    forced = {k: (e["source"], e["album_id"]) for k, e in load_match_overrides(audio_dir / "match_overrides.json").items()
              if not e.get("skip")}
    shared = {k for keys in duplicate_listings(matches).values() for k in keys}
    youtube, searched = youtube_outcomes(audio_dir / "fulllength.csv")
    models = list(REQUIRED) + sorted(set(cache["ok"]) - set(REQUIRED))
    columns = HEAD + [f"{m}_{c}" for m in models for c in ("ok", "source", "used")] + TAIL

    rows = []
    for al in albums:
        key = al["rym_id"]
        m = match.get(key) or dict.fromkeys(("source", "source_album_id", "matched_by", "ambiguous", "n_tracks",
                                             "n_clips_available", "runtime_s", "short_preview"), "")
        named = (m["source"], m["source_album_id"]) if m["source"] else None
        listed = cache["listings"].get((key, *named), {}) if named else {}
        n_tracks, previews, runtime = listing_facts(m, listed)

        row = {"key": key, "rank": al["rank"], "on_chart": al["on_chart"],
               "existing_or_new": "existing" if key in existing else "new", "artist": al["artist"], "title": al["title"],
               "year": al["year"], "match_source": m["source"], "listing_id": m["source_album_id"],
               "matched_by": m["matched_by"], "ambiguous": m["ambiguous"], "n_tracks": "" if n_tracks is None else n_tracks,
               "previews_available": "" if previews is None else previews, "runtime_s": "" if runtime is None else runtime}
        used, listing = {}, {}
        for model in models:
            listing[model], n_ok, used[model] = used_listing(cache, model, key, named, forced.get(key))
            row[f"{model}_ok"], row[f"{model}_used"] = n_ok, used[model]
            row[f"{model}_source"] = listing[model][0] if listing[model] else "none"
        mine = [listing[mo] for mo in REQUIRED if listing[mo]]
        windowed = bool(mine) and all(l[0] in WINDOW_SOURCES for l in mine)
        row["audio_source"] = "/".join(dict.fromkeys(l[0] for l in mine)) or "none"

        under = bool(named) and previews is not None and 0 < previews < CLIPS
        few = None if not named or runtime is None else runtime >= LONG_S and (
            0 < (n_tracks or 0) < CLIPS or 0 < (previews or 0) < CLIPS)
        flagged = [cache["short"][(key, *l)] for l in dict.fromkeys(mine) if (key, *l) in cache["short"]]
        short = True if m["short_preview"] == "1" or any(a for a, _ in flagged) else (
            False if m["short_preview"] == "0" or any(b for _, b in flagged) else None)
        wrong = key in forced and any(l[0] not in WINDOW_SOURCES and l != forced[key] for l in mine)
        outcome, search = youtube.get(key, "not_tried"), searched.get(key, "not_tried")
        edge = bool(named) and edge_case(previews, runtime)
        state, step = decide({mo: used[mo] for mo in REQUIRED}, windowed, previews or 0, edge, wrong,
                             bool(al["youtube_url"]), outcome, search == "none")
        row.update({"under_covered": _flag(under), "few_long_tracks": _flag(few), "short_preview": _flag(short),
                    "wrong_listing_pending": _flag(wrong), "duplicate_listing": _flag(key in shared), "edge_case": _flag(edge),
                    "has_youtube_url": _flag(al["youtube_url"]), "fulllength": outcome, "youtube_search": search,
                    "state": state, "next_step": step})
        rows.append({c: str(row[c]) for c in columns})
    return columns, rows


def _table(title: str, rows: list[dict], column: str, values) -> list[str]:
    count = Counter((r[column], r["existing_or_new"]) for r in rows)
    lines = [f"| {title} | existing | new | all |", "|---|---:|---:|---:|"]
    for v in values:
        lines.append(f"| {v} | {count[(v, 'existing')]} | {count[(v, 'new')]} | {count[(v, 'existing')] + count[(v, 'new')]} |")
    n = Counter(r["existing_or_new"] for r in rows)
    return lines + [f"| all | {n['existing']} | {n['new']} | {len(rows)} |", ""]


def summary(columns: list[str], rows: list[dict]) -> str:
    """The counts, as markdown tables."""
    models = [c[:-3] for c in columns if c.endswith("_ok")]
    store = lambda r: "/".join(dict.fromkeys(s.split(":")[0] for s in r["audio_source"].split("/")))  # noqa: E731
    by_store = [dict(r, audio_source=store(r)) for r in rows]  # itunes:us, itunes:gb, ... counted as itunes
    sources = sorted({r["audio_source"] for r in by_store} - {"none"}) + ["none"]
    lines = ["# Album status: counts", "",
             "Written by `python -m rmr_audio.album_status` with `album_status.csv`, the row per album. "
             "The columns and the rules are in that module's docstring.", ""]
    lines += _table("state", rows, "state", STATES)
    lines += _table("next_step", rows, "next_step", NEXT_STEPS)
    lines += _table("audio_source", by_store, "audio_source", sources)
    lines += _table("fulllength (the sheet's YouTube link)", rows, "fulllength", FULLLENGTH)
    lines += _table("youtube_search", rows, "youtube_search", SEARCHED)
    lines += ["| albums | existing | new | all |", "|---|---:|---:|---:|"]
    for title, test in ([(f"{m}: an ok clip", lambda r, m=m: r[f"{m}_ok"] != "0") for m in models] +
                        [(f"{m}: {CLIPS} clips or full-length windows",
                          lambda r, m=m: int(r[f"{m}_used"]) >= CLIPS or r[f"{m}_source"] in WINDOW_SOURCES) for m in models] +
                        [(f, lambda r, f=f: r[f] == "1") for f in ("ambiguous", "under_covered", "few_long_tracks",
                         "short_preview", "wrong_listing_pending", "duplicate_listing", "edge_case", "has_youtube_url")]):
        n = Counter(r["existing_or_new"] for r in rows if test(r))
        lines.append(f"| {title} | {n['existing']} | {n['new']} | {n['existing'] + n['new']} |")
    return "\n".join(lines) + "\n"


def _replace(path: Path, text: str) -> bool:
    """Write the file whole; False when it already holds exactly this."""
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)
    return True


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_audio.album_status",
                                description="One row per catalog album: its audio, its flags, its state and next step.")
    p.add_argument("--cache", type=Path, default=DEFAULT_CACHE_DB, help="The one-pass cache (opened read-only).")
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="The catalog table (catalog/albums.csv).")
    p.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO,
                   help="Where keys.csv, matches.csv, match_overrides.json and fulllength.csv are.")
    p.add_argument("--out", type=Path, default=None, help="The table (default: <audio-dir>/album_status.csv).")
    p.add_argument("--summary", type=Path, default=None, help="The counts (default: <audio-dir>/album_status.md).")
    p.add_argument("--dry-run", action="store_true", help="Print the counts; write nothing.")
    args = p.parse_args(argv)
    try:
        columns, rows = build(args.cache, args.catalog, args.audio_dir)
    except (StoreError, FileNotFoundError) as e:
        print(f"FAIL\n{e}\nnothing written: the table needs the one-pass clip cache, which is local and not in git",
              file=sys.stderr)
        return 1
    text = summary(columns, rows)
    print(text)
    if args.dry_run:
        print("dry run: nothing written")
        return 0
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    for path, body in ((args.out or args.audio_dir / "album_status.csv", buf.getvalue()),
                       (args.summary or args.audio_dir / "album_status.md", text)):
        print(f"{path}: {'written' if _replace(path, body) else 'already holds exactly this'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
