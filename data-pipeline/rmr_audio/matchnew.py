"""`python -m rmr_audio match-new`: match every catalog album that has no row in matches.csv, and write the rows.

Store metadata only: no audio is downloaded and no model is loaded. The albums are matched as a sync would
match them (match.match_album; a forced listing of match_overrides.json is read from its store, an album
with `skip` is left without a row), in this order: the albums with a Deezer link, then those with an Apple
link only, then those with no link (--links-only leaves these out). The rows are stored in catalog order,
after the rows the file already has, which are written back as they were read.

A run can be killed and started again: matches.csv is rewritten (a temporary file, then a rename) every
--save-every albums, when the run ends and on Ctrl-C or SIGTERM, an album that has its row is not matched
again, and the API responses are in the response cache (.cache/audio/http.sqlite), so the albums a killed
run had matched but not yet saved cost no request the second time. One run at a time: a lock file next to
the response cache is held.

The run does not insist. A URL is tried twice. It stops, saves and says why when a store is marked down
(match.STORE_DOWN_AFTER URLs given up on in a row), when a URL was given up on after rate-limit answers
(HTTP 403 or 429, Deezer's quota error), when a store gave RATE_LIMIT_MAX such answers in the run, or when
MAX_FAILED_IN_A_ROW albums in a row failed on the network. An album that failed has no row and is tried
by the next run.
"""
import fcntl
import signal
import sys
import time
from collections import Counter
from pathlib import Path

from rmr_pipeline.audio_store import duplicate_listings, load_match_overrides, load_matches, write_matches

from . import match as matching
from .catalog import Album
from .dryrun import link_class

CLASSES = ("deezer link", "apple link, no deezer", "no store link")  # the order of work
SAVE_EVERY = 25  # albums between two writes of matches.csv
RATE_LIMIT_MAX = 5  # rate-limit answers a store may give in one run, retries that went through included
MAX_FAILED_IN_A_ROW = 3  # albums that may fail on the network in a row
# (Deezer, iTunes) URLs per album, by link class, of the dry run over 300 new albums (seed 1): what the ETA
# uses for a class until MIN_OBSERVED of its albums are done in this run.
PRIOR = {"deezer link": (2.12, 0.03), "apple link, no deezer": (0.39, 1.39), "no store link": (3.93, 8.02)}
MIN_OBSERVED = 20


class Stop:
    """Ctrl-C or SIGTERM once: finish the request in hand, write matches.csv and stop. Twice: write and stop now."""

    def __init__(self):
        self.asked, self.old = False, {}

    def __call__(self, *_):
        if self.asked:
            raise KeyboardInterrupt
        self.asked = True
        print("\nstopping: writing matches.csv (again to stop at once)", file=sys.stderr, flush=True)

    def install(self):
        self.old = {s: signal.signal(s, self) for s in (signal.SIGINT, signal.SIGTERM)}

    def restore(self):
        for s, h in self.old.items():
            signal.signal(s, h)


def work_order(catalog: list[Album], have: set[str], overrides: dict[str, dict], links_only: bool = False,
               limit: int | None = None) -> tuple[list[Album], Counter]:
    """(the albums to match, in the order of work; what is left out: skipped, no_link, beyond_limit)."""
    left: Counter = Counter()
    todo = []
    for al in catalog:
        if al.key in have:
            continue
        if overrides.get(al.key, {}).get("skip"):
            left["skipped"] += 1
        elif links_only and not al.links and "source" not in overrides.get(al.key, {}):
            left["no_link"] += 1
        else:
            todo.append(al)
    todo.sort(key=lambda al: CLASSES.index(link_class(al)))  # stable: catalog order within a class
    if limit is not None and len(todo) > limit:
        left["beyond_limit"] = len(todo) - limit
        todo = todo[:limit]
    return todo, left


def path_of(row: dict) -> str:
    """How an album got its listing, from its row of matches.csv."""
    if not row["source"]:
        return "unmatched"
    return {"deezer_id": "deezer direct", "apple_id": "apple direct", "search": "text search",
            "override": "override"}.get(row["matched_by"], "matched before")


def eta_seconds(remaining: Counter, seen: dict[str, list], deezer_interval: float, itunes_interval: float) -> float:
    """Seconds the albums still to match need: per link class, the URLs an album needed so far in this run
    (the prior of the dry run until MIN_OBSERVED are done) times the intervals. The response cache makes it less."""
    total = 0.0
    for c, n in remaining.items():
        done, deezer, itunes = seen.get(c, (0, 0, 0))
        per = (deezer / done, itunes / done) if done >= MIN_OBSERVED else PRIOR[c]
        total += n * (per[0] * deezer_interval + per[1] * itunes_interval)
    return total


def _hm(seconds: float) -> str:
    m = int(round(seconds / 60))
    return f"{m // 60}h{m % 60:02d}m"


def summary(rows: list[dict], new_keys: set[str]) -> list[str]:
    """The counts of the new albums' rows of matches.csv, as lines."""
    mine = [r for r in rows if r["key"] in new_keys]
    paths = Counter(path_of(r) for r in mine)
    matched = [r for r in mine if r["source"]]
    silent = [r for r in matched if r["n_clips_available"] in ("", "0")]
    editions = Counter(r["edition"] for r in mine if r["edition"])
    dupes = {k: v for k, v in duplicate_listings(rows).items() if new_keys & set(v)}
    lines = [
        "by path: " + (", ".join(f"{k} {n}" for k, n in paths.most_common()) or "-"),
        f"no preview: {len(mine) - len(matched) + len(silent)} of {len(mine)} ({len(mine) - len(matched)} with no listing, "
        f"{len(silent)} with a listing that has no preview)",
        f"ambiguous: {sum(r['ambiguous'] == '1' for r in mine)}; under_covered: {sum(r['under_covered'] == '1' for r in mine)}; "
        f"edition replaced: {editions['standard']} by the standard edition, {editions['split']} by a split edition",
        f"duplicate listings (a new album and another album on one store listing): {len(dupes)}"]
    return lines + [f"duplicate listing\t{store} {album_id}\t{', '.join(keys)}" for (store, album_id), keys in dupes.items()]


def match_new(catalog: list[Album], audio_dir: Path, cache: Path | None,
              storefronts: tuple[str, ...] = matching.DEFAULT_STOREFRONTS, deezer_interval: float = 0.35,
              itunes_interval: float = 3.4, limit: int | None = None, links_only: bool = False,
              save_every: int = SAVE_EVERY, progress_secs: float = 60.0, verbose: bool = False, http=None, out=print,
              stop: Stop | None = None) -> int:
    """One run. `http` and `stop` are replaced in tests. Returns 0 when every album asked for has its row
    (or failed on its own), 1 when another run holds the lock, 2 when the run stopped because of a store,
    130 when it was interrupted."""
    path = audio_dir / "matches.csv"
    rows = {r["key"]: r for r in (load_matches(path) if path.exists() else [])}
    existing = len(rows)
    overrides = load_match_overrides(audio_dir / "match_overrides.json")
    order = {al.key: i for i, al in enumerate(catalog)}
    new_keys = {al.key for al in catalog if al.new}
    todo, left = work_order(catalog, set(rows), overrides, links_only, limit)
    lock = None
    if cache is not None:
        Path(cache).parent.mkdir(parents=True, exist_ok=True)
        lock = open(Path(cache).with_name("match-new.lock"), "a")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            lock.close()
            print(f"{lock.name} is held by a running match-new: not starting", file=sys.stderr)
            return 1
    if http is None:
        http = matching.Http(cache, attempts=2)
        http.throttles["deezer"].interval, http.throttles["itunes"].interval = deezer_interval, itunes_interval
    stop = stop or Stop()
    if isinstance(http, matching.Http):
        http.abort = lambda: stop.asked
    asked = lambda: Counter(getattr(http, "asked_by", {}))  # noqa: E731
    fetched = lambda: Counter(getattr(http, "fetched_by", {}))  # noqa: E731
    limited = lambda: Counter(getattr(http, "limited", {}))  # noqa: E731
    remaining = Counter(link_class(al) for al in todo)
    out(f"match-new: {len(todo)} albums to match (" + ", ".join(f"{remaining[c]} {c}" for c in CLASSES) + ")"
        + "".join(f"; {left[k]} {text}" for k, text in (("skipped", "skipped by match_overrides.json"),
                                                         ("no_link", "without a link left out (--links-only)"),
                                                         ("beyond_limit", "left for a later run (--limit)")) if left[k])
        + f". matches.csv has {existing} rows. Deezer every {deezer_interval} s, iTunes every {itunes_interval} s; about "
        f"{_hm(eta_seconds(remaining, {}, deezer_interval, itunes_interval))} when nothing is cached.")
    pending: dict[str, dict] = {}
    seen: dict[str, list] = {c: [0, 0, 0] for c in CLASSES}
    done = written = failed = failed_row = 0
    problems: list[str] = []
    stopped = ""
    t0 = last = time.monotonic()

    def save() -> None:
        nonlocal written
        if not pending:
            return
        rows.update(pending)
        write_matches(path, sorted(rows.values(), key=lambda r: order.get(r["key"], len(order))))
        written += len(pending)
        pending.clear()

    def progress() -> None:
        eta = eta_seconds(remaining, seen, deezer_interval, itunes_interval)
        got = fetched()
        out(f"[{time.strftime('%H:%M:%S')}] {done + failed}/{len(todo)} albums ({done} matched to the end, {failed} failed; "
            f"{written} rows written, {len(pending)} waiting), fetched deezer {got['deezer']}, itunes {got['itunes']}, "
            f"{time.monotonic() - t0:.0f} s, ETA {_hm(eta)}")

    stop.install()
    try:
        for al in todo:
            if stop.asked:
                break
            cls, before, limited_before = link_class(al), asked(), limited()
            forced = overrides.get(al.key)
            try:
                m = (matching.forced(http, forced["source"], forced["album_id"]) if forced
                     else matching.match_album(http, al, storefronts))
            except Exception as e:
                if stop.asked:
                    break
                network = isinstance(e, IOError)  # requests' errors and the matcher's "giving up" are IOErrors
                failed, failed_row = failed + 1, failed_row + 1 if network else 0
                problems.append(f"failed\t{al.key}\t{al.artist} — {al.title}\t{type(e).__name__}: {e}"[:300])
                out(problems[-1])
                refused = limited() - limited_before
                down = http.down() if hasattr(http, "down") else []
                if down:
                    stopped = f"{' and '.join(down)} stopped answering"
                elif network and refused:
                    stopped = f"{' and '.join(sorted(refused))} answered a rate limit and the retry was refused too"
                elif failed_row >= MAX_FAILED_IN_A_ROW:
                    stopped = f"{failed_row} albums in a row failed on the network"
                if stopped:
                    break
                remaining[cls] -= 1
                continue
            failed_row = 0
            pending[al.key] = {k: str(v) for k, v in m.row(al.key).items()}
            done, used = done + 1, asked() - before
            remaining[cls] -= 1
            seen[cls] = [seen[cls][0] + 1, seen[cls][1] + used["deezer"], seen[cls][2] + used["itunes"]]
            if verbose:
                out(f"{done + failed}/{len(todo)}\t{al.key}\t{al.artist} — {al.title}\t" + (
                    f"{m.source} {m.album_id}\t{m.artist} — {m.title}\t{m.n_previews}/{m.n_tracks} previews"
                    + ("\tAMBIGUOUS" if m.ambiguous else "") + (f"\t{m.reason}" if m.reason else "") if m.source
                    else f"no listing\t{m.reason}"))
            if len(pending) >= max(1, save_every):
                save()
            over = sorted(s for s, n in limited().items() if n >= RATE_LIMIT_MAX)
            if over:
                stopped = f"{' and '.join(over)} answered {RATE_LIMIT_MAX} rate limits in this run"
                break
            if time.monotonic() - last >= progress_secs:
                progress()
                last = time.monotonic()
    except KeyboardInterrupt:
        stop.asked = True
    finally:
        save()
        stop.restore()
        if lock is not None:
            lock.close()
    progress()
    all_rows = sorted(rows.values(), key=lambda r: order.get(r["key"], len(order)))
    without = [al for al in catalog if al.key not in rows]
    state = f"STOPPED: {stopped}" if stopped else "interrupted" if stop.asked else "finished"
    got, want = fetched(), asked()
    out(f"match-new {state}. {done} albums matched to the end and {failed} failed in {time.monotonic() - t0:.0f} s; URLs asked "
        f"for: deezer {want['deezer']}, itunes {want['itunes']}; fetched: deezer {got['deezer']}, itunes {got['itunes']} "
        "(the rest came from the response cache)")
    out(f"matches.csv: {len(all_rows)} rows ({existing} before this run, {written} written by it); "
        f"{len(without)} catalog albums still without a row"
        + (" (" + ", ".join(f"{n} {c}" for c, n in Counter(link_class(al) for al in without).most_common()) + ")" if without else ""))
    for line in summary(all_rows, new_keys):
        out(line)
    if problems:
        out(f"{len(problems)} albums failed and have no row; run match-new again for them:")
        for line in problems:
            out(line)
    if stopped or (stop.asked and len(without) > left["skipped"] + left["no_link"]):
        out("run match-new again to continue: the albums that have a row are not matched again")
    return 2 if stopped else 130 if stop.asked else 0
