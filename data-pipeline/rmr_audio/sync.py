"""`python -m rmr_audio sync`: give every album of the feature table its clips, and the store their mean.

For each album that is missing from the store or has fewer clips than asked:
  match it (matches.csv and match_overrides.json first, the stores only for an album never matched),
  fetch its track listing again (Deezer's preview URLs expire after 15 minutes),
  download and embed the clips it still needs (the clip cache knows which it has),
and at the end, or when interrupted, write ONE new shard with the mean of each finished album's
clips, and update matches.csv. An album whose clips did not change is not rewritten.

Clip order: the first track, then tracks spread evenly through the album (clips.priority_order), so
an album's four clips are the first four of its eight. A folder of local files (--local-dir) takes
precedence over the stores: one excerpt per file.

The parent process does every API call and is the only writer; the workers download, decode and
embed. A worker that dies (a segfault on one clip) breaks the pool: the pool is rebuilt and the
clips that were in flight are replayed one at a time, so only the offending clip ends up `crashed`.
"""
import multiprocessing
import os
import resource
import shutil
import signal
import sys
import tempfile
import time
from collections import Counter
from concurrent.futures import FIRST_COMPLETED, Future, ProcessPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from rmr_pipeline.audio_store import (DEFAULT_AUDIO, DIM, StoreError, append_shard, clean_leftovers, load_manifest,
                                      load_match_overrides, load_matches, load_store, set_clips_per_album,
                                      write_matches)

from . import embed
from . import match as matching
from .catalog import DEFAULT_CACHE, Album
from .clips import FINAL, ClipCache, priority_order

STORE_DOWN_AFTER = 3  # listings in a row a store may fail before its other albums are left for the next run


@dataclass
class Options:
    audio_dir: Path = DEFAULT_AUDIO
    cache_dir: Path = DEFAULT_CACHE
    clips: int | None = None  # None: the store's policy (manifest clips.per_album)
    keys: tuple[str, ...] = ()  # album keys or slugs; empty = every album
    limit: int | None = None
    workers: int = 2
    local_dir: Path | None = None
    storefronts: tuple[str, ...] = matching.DEFAULT_STOREFRONTS
    retry_unmatched: bool = False
    dry_run: bool = False
    progress_secs: float = 30.0


@dataclass
class Item:
    """One album with work to do. kind: `match` (find its listing first), `clips` (download and embed),
    `write` (its cached clips are enough, the store is behind), `local` (a folder of files), `drop` (it is
    skipped by match_overrides.json and the store still has an embedding for it: remove it)."""
    album: Album
    kind: str
    source: str = ""
    album_id: str = ""
    have: int = 0  # clips behind the album's embedding in the store
    want: int = 0  # clips it should end with, as far as known before the listing is fetched
    cached: int = 0  # of those, the clips the cache already has an answer for
    force: bool = False  # the listing is not the one the store's embedding came from: rewrite whatever the count
    folder: Path | None = None
    pending: int = 0  # clips in flight
    done: bool = False
    changed: bool = False  # a clip was embedded or dropped in this run
    row: dict | None = None  # a forced listing's line of matches.csv, written once its embedding is in the store
    problem: str = ""

    def line(self) -> str:
        what = {"match": "match, then embed", "write": f"write  {self.have} -> {self.want} clips (all cached)",
                "clips": f"embed  {self.have} -> {self.want} clips ({self.cached} cached)",
                "local": f"local  {self.want} files", "drop": "remove from the store (skipped)"}[self.kind]
        where = f"{self.source} {self.album_id}".strip() or "-"
        return f"{what:34s} {where:26s} {self.album.slug}"


@dataclass
class Plan:
    items: list[Item] = field(default_factory=list)
    counts: Counter = field(default_factory=Counter)

    def summary(self) -> str:
        c, kinds = self.counts, Counter(i.kind for i in self.items)
        total = len(self.items) + sum(c.values())
        parts = [f"{c['up_to_date']} up to date", f"{kinds['clips']} to embed", f"{kinds['write']} to write from the cache",
                 f"{kinds['match']} to match", f"{kinds['local']} from local files"]
        parts += [f"{kinds['drop']} to remove from the store"] if kinds["drop"] else []
        parts += [f"{c[k]} {text}" for k, text in (
            ("no_audio", "with no usable clip"), ("unmatched", "unmatched (not retried: --retry-unmatched)"),
            ("skipped", "skipped by match_overrides.json"), ("beyond_limit", "left for a later run (--limit)")) if c[k]]
        return f"{total} albums: " + ", ".join(parts)


def classify(al: Album, row: dict | None, override: dict | None, stored: tuple[int, str] | None,
             cached: dict, clips: int, retry_unmatched: bool) -> Item | str:
    """What one album needs, from files only (no network): an Item, or the reason it needs nothing
    (`up_to_date`, `no_audio`, `unmatched`, `skipped`). `stored` is (clips, source) of its embedding in
    the store; `cached` maps (key, source, album_id) to the [(prio, status)] of the clip cache.
    Precedence: a `skip` override, then a forced listing not applied yet, then local audio already in
    the store (only a --local-dir run touches it), then the listing of matches.csv."""
    have = stored[0] if stored else 0
    if override and override.get("skip"):
        return Item(al, "drop", have=have) if stored else "skipped"
    target = (row["source"], row["source_album_id"]) if row and row["source"] else None
    if override and (override["source"], override["album_id"]) != target:
        return Item(al, "match", override["source"], override["album_id"], have, clips, force=True)
    if stored and stored[1] == "local":
        return "up_to_date"
    if target is None or (retry_unmatched and row["n_clips_available"] in ("", "0")):
        if row is None or retry_unmatched:
            return Item(al, "match", have=have, want=clips)
        return "unmatched"
    source, album_id = target
    available = int(row["n_clips_available"]) if row["n_clips_available"] != "" else None
    want = clips if available is None else min(clips, available)
    mine = [s for p, s in cached.get((al.key, source, album_id), []) if p is not None]
    tried, n_ok = sum(s in FINAL for s in mine), min(clips, sum(s == "ok" for s in mine))
    behind = stored is None or stored[1] != source
    if n_ok >= want or (available is not None and tried >= available):  # it has its clips, or every preview was tried
        if n_ok and (behind or n_ok > have):
            return Item(al, "write", source, album_id, have, n_ok)
        return "up_to_date" if stored else "no_audio"
    if not behind and have >= want:  # the store is at the target; the cache is only missing or partial
        return "up_to_date"
    return Item(al, "clips", source, album_id, have, want, n_ok)


def local_item(al: Album, folder: Path, stored: tuple[int, str] | None, cache: ClipCache) -> Item | str:
    """The album's folder of files: an Item unless every file is embedded as it is and the store has that mean."""
    files = embed.local_files(folder)
    if not files:
        return "up_to_date" if stored else "no_audio"
    known = {c["track_id"]: c for c in cache.album(al.key, "local", "")}
    current = {p.name: embed.file_sig(p) for p in files}
    same = set(known) == set(current) and all(known[n]["sig"] == s and known[n]["status"] in FINAL
                                               for n, s in current.items())
    n_ok = sum(c["status"] == "ok" for c in known.values())
    if same and stored == (n_ok, "local"):
        return "up_to_date"
    return Item(al, "local", "local", "", stored[0] if stored else 0, len(files), folder=folder)


def make_plan(catalog: list[Album], stored: dict[str, tuple[int, str]], matches: dict[str, dict],
              overrides: dict[str, dict], cache: ClipCache, opts: Options, clips: int) -> Plan:
    plan, cached = Plan(), cache.summary()
    wanted = set(opts.keys)
    for al in catalog:
        if wanted and al.key not in wanted and al.slug not in wanted:
            continue
        folder = opts.local_dir / al.slug if opts.local_dir else None
        skipped = bool(overrides.get(al.key, {}).get("skip"))
        if folder is not None and folder.is_dir() and not skipped:
            verdict = local_item(al, folder, stored.get(al.key), cache)
        else:
            verdict = classify(al, matches.get(al.key), overrides.get(al.key), stored.get(al.key), cached, clips,
                               opts.retry_unmatched or bool(wanted))
        if isinstance(verdict, str):
            plan.counts[verdict] += 1
        elif opts.limit is not None and len(plan.items) >= opts.limit:
            plan.counts["beyond_limit"] += 1
        else:
            plan.items.append(verdict)
    return plan


def needed_clips(al: Album, source: str, album_id: str, listing: list[dict], cached: list[dict], clips: int) -> list[dict]:
    """The clips to download now, so that the album has `clips` good ones: walk the listing's tracks that
    have a preview in priority order, skip the ones the cache already holds a final answer for, and take
    as many as are missing; a clip's rank is its place in that walk. With an unchanged listing an album
    that has ranks 0..3 gets exactly ranks 4..7; a track whose clip failed for good (too short, no
    audio) is replaced by the next one in the order."""
    playable = [(i, t) for i, t in enumerate(listing) if t["preview_url"]]
    final = {c["track_id"] for c in cached if c["status"] in FINAL}
    refused = {c["track_id"] for c in cached if c["status"] == "download_failed" and (c.get("error") or "").startswith("HTTP 4")}
    missing = clips - sum(c["status"] == "ok" for c in cached)
    out = []
    for rank, pos in enumerate(priority_order(len(playable)) if playable else []):
        if len(out) >= missing:
            break
        idx, t = playable[pos]
        if t["track_id"] in final:
            continue
        out.append({"key": al.key, "source": source, "album_id": album_id, "track_id": t["track_id"], "track_idx": idx,
                    "prio": rank, "url": t["preview_url"], "suffix": ".mp3" if source == "deezer" else ".m4a",
                    "refused_before": t["track_id"] in refused})
    return out


def local_clips(item: Item, cache: ClipCache) -> list[dict]:
    """The files of the album's folder still to embed; cached files that are gone or replaced are forgotten."""
    files = embed.local_files(item.folder)
    known = {c["track_id"]: c for c in cache.album(item.album.key, "local", "")}
    current = {p.name: embed.file_sig(p) for p in files}
    stale = [n for n, c in known.items() if current.get(n) != c["sig"]]
    if stale:
        cache.forget(item.album.key, "local", "", stale)
        item.changed = True
    return [{"key": item.album.key, "source": "local", "album_id": "", "track_id": p.name, "track_idx": i, "prio": i,
             "sig": current[p.name], "path": str(p)}
            for i, p in enumerate(files) if p.name in stale or p.name not in known or known[p.name]["status"] not in FINAL]


class Stop:
    """Ctrl-C or SIGTERM once: stop taking albums, finish the clips in flight, write the shard. Twice: now."""

    def __init__(self):
        self.asked, self.now = False, False

    def __call__(self, *_):
        self.now, self.asked = self.asked, True
        print("\nstopping: finishing the clips in flight, then writing the shard (again to stop at once)"
              if not self.now else "\nstopping now", file=sys.stderr, flush=True)

    def install(self):
        self.old = {s: signal.signal(s, self) for s in (signal.SIGINT, signal.SIGTERM)}

    def restore(self):
        for s, h in self.old.items():
            signal.signal(s, h)


def process_pool(workers: int, model_dir: Path, tmp: str):
    return ProcessPoolExecutor(workers, mp_context=multiprocessing.get_context("spawn"),
                               initializer=embed.init_worker, initargs=(str(model_dir), tmp))


def _kill(pool) -> None:
    for p in list((getattr(pool, "_processes", None) or {}).values()):
        p.terminate()
    pool.shutdown(wait=False, cancel_futures=True)


class Extraction:
    """Feeds albums to the pool and records every clip that comes back."""

    def __init__(self, cache: ClipCache, http, opts: Options, clips: int, pool_factory, stop: Stop, out):
        self.cache, self.http, self.opts, self.clips = cache, http, opts, clips
        self.new_pool, self.stop, self.out = pool_factory, stop, out
        self.inflight: dict = {}  # future -> (item, clips)
        self.status, self.rss = Counter(), {}
        self.listing: dict[str, tuple[int, int]] = {}  # key -> (tracks, tracks with a preview) of the fresh listing
        self.failing: Counter = Counter()  # store -> listings failed in a row
        self.t0 = self.last = time.monotonic()
        self.n = self.total_albums = self.done_albums = 0

    def prepare(self, item: Item) -> list[dict]:
        """The album's clips to embed now. For a store album this fetches its listing."""
        if item.kind == "local":
            return local_clips(item, self.cache)
        listing = matching.tracks(self.http, item.source, item.album_id, fresh=True)
        self.listing[item.album.key] = (len(listing), sum(bool(t["preview_url"]) for t in listing))
        cached = self.cache.album(item.album.key, item.source, item.album_id)
        return needed_clips(item.album, item.source, item.album_id, listing, cached, self.clips)

    def record(self, item: Item, recs: list[dict]) -> None:
        for rec in recs:  # a fresh URL refused (HTTP 4xx) in two runs is not tried a third time
            if rec["status"] == "download_failed" and rec.get("refused_before") and (rec.get("error") or "").startswith("HTTP 4"):
                rec.update(status="no_preview", error=rec["error"] + ", twice")
        self.cache.put(recs)
        item.pending -= len(recs)
        item.changed = True
        for rec in recs:
            self.n += 1
            self.status[rec["status"]] += 1
        if item.pending == 0:
            item.done = True
            self.done_albums += 1
        now = time.monotonic()
        if now - self.last >= self.opts.progress_secs:
            rate = self.n / (now - self.t0)
            self.out(f"[{time.strftime('%H:%M:%S')}] {self.done_albums}/{self.total_albums} albums, {self.n} clips, "
                     f"{rate:.2f} clips/s  {dict(self.status)}")
            self.last = now

    def submit(self, pool, item: Item, recs: list[dict]) -> None:
        """Hand the album's clips to the pool. A pool that broke since the last look (a worker died while
        the parent was fetching a listing) refuses the task: it is kept as a failed future, so the main
        loop replays it with the others."""
        try:
            fut = pool.submit(embed.process, recs)
        except BrokenProcessPool as e:
            fut = Future()
            fut.set_exception(e)
        self.inflight[fut] = (item, recs)

    def collect(self, fut) -> None:
        item, _ = self.inflight[fut]
        result = fut.result()
        self.rss[result["pid"]] = max(result["rss"], self.rss.get(result["pid"], 0))
        self.record(item, result["clips"])

    def replay(self, pool):
        """After a worker died: every clip in flight again, one at a time, in a pool of one."""
        lost = [(item, rec) for item, recs in self.inflight.values() for rec in recs]
        self.inflight.clear()
        self.out(f"a worker died; replaying {len(lost)} clips one at a time")
        pool.shutdown(wait=False)
        pool = self.new_pool(1)
        for item, rec in lost:
            if self.stop.now:
                break
            rec = {k: v for k, v in rec.items() if k not in ("status", "error", "emb", "clip_s")}
            try:
                self.record(item, pool.submit(embed.process, [rec]).result()["clips"])
            except BrokenProcessPool:
                self.record(item, [dict(rec, status="crashed", error="worker process died")])
                pool = self.new_pool(1)
        pool.shutdown()
        return self.new_pool(self.opts.workers)

    def run(self, items: list[Item]) -> None:
        self.total_albums = len(items)
        queue, pool = iter(items), None
        try:
            while True:
                while len(self.inflight) < 2 * self.opts.workers and not self.stop.asked:
                    item = next(queue, None)
                    if item is None:
                        break
                    store = matching.store_of(item.source)
                    if self.failing[store] >= STORE_DOWN_AFTER:
                        item.problem = f"{store} is not answering: left for the next run"
                        self.done_albums += 1
                        continue
                    try:
                        recs = self.prepare(item)
                        self.failing[store] = 0
                    except Exception as e:  # the listing could not be fetched: this album waits for the next run
                        if not self.stop.asked:
                            item.problem = f"listing failed: {e}"[:200]
                            self.failing[store] += 1
                        self.done_albums += 1
                        continue
                    if not recs:
                        item.done = True
                        self.done_albums += 1
                        continue
                    if pool is None:
                        pool = self.new_pool(self.opts.workers)
                    item.pending = len(recs)
                    self.submit(pool, item, recs)
                if not self.inflight:
                    break
                done, _ = wait(self.inflight, timeout=1.0, return_when=FIRST_COMPLETED)
                if self.stop.now:
                    break
                broken = False
                for fut in done:
                    try:
                        self.collect(fut)
                        del self.inflight[fut]
                    except BrokenProcessPool:
                        broken = True
                if broken:
                    pool = self.replay(pool)
        finally:
            self.seconds = time.monotonic() - self.t0
            if pool is not None:
                _kill(pool) if self.stop.now else pool.shutdown(wait=True, cancel_futures=True)


def _stored(audio_dir: Path) -> tuple[dict, dict[str, tuple[int, str]]]:
    manifest = load_manifest(audio_dir)
    if manifest["model"] != embed.MODEL:
        raise StoreError(f"the store holds {manifest['model']!r} embeddings; this code makes {embed.MODEL!r}")
    if not manifest["shards"]:
        return manifest, {}
    s = load_store(audio_dir)
    return manifest, {k: (int(n), src) for k, n, src in zip(s.keys.tolist(), s.n_clips.tolist(), s.source.tolist())}


def preview_matches(opts: Options, catalog: list[Album], http=None, out=print) -> int:
    """`python -m rmr_audio match`: ask the stores for the albums a sync would have to match, and print each
    verdict. Nothing of the store is written (the API responses are cached, so the sync that follows asks
    for little). Returns 0, or 1 when the store is unusable."""
    try:
        manifest, stored = _stored(opts.audio_dir)
        matches_path = opts.audio_dir / "matches.csv"
        matches = {r["key"]: r for r in (load_matches(matches_path) if matches_path.exists() else [])}
        overrides = load_match_overrides(opts.audio_dir / "match_overrides.json")
    except StoreError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    clips = opts.clips or int(manifest["clips"].get("per_album", 4))
    plan = make_plan(catalog, stored, matches, overrides, ClipCache(":memory:"), opts, clips)
    todo = [i for i in plan.items if i.kind == "match"]
    http = http or matching.Http(opts.cache_dir / "http.sqlite")
    if isinstance(http, matching.Http) and opts.retry_unmatched:
        http.search_max_age_days = matching.RETRY_SEARCH_DAYS
    counts: Counter = Counter()
    for item in todo:
        al = item.album
        try:
            m = (matching.forced(http, item.source, item.album_id) if item.force
                 else matching.match_album(http, al, opts.storefronts))
        except Exception as e:
            counts["failed"] += 1
            out(f"failed\t{al.slug}\t{e}")
            continue
        kind = ("unmatched" if not m.source else "no preview" if not m.n_previews else
                "forced" if item.force else "ambiguous" if m.ambiguous else "matched")
        counts[kind] += 1
        out("\t".join([kind, al.slug, f"{al.artist} — {al.title}"] + ([
            f"{m.source} {m.album_id}", f"{m.artist} — {m.title}", f"score {m.score:.2f}",
            f"{m.n_previews}/{m.n_tracks} previews", m.reason] if m.source else [m.reason])))
    out(f"{len(todo)} albums asked for: " + (", ".join(f"{n} {k}" for k, n in sorted(counts.items())) or "nothing to match")
        + (f"; {plan.counts['skipped']} skipped by match_overrides.json" if plan.counts["skipped"] else ""))
    return 0


def sync(opts: Options, catalog: list[Album], http=None, pool_factory=None, out=print, stop: Stop | None = None) -> int:
    """Run one sync. `http`, `pool_factory` and `stop` are replaced in tests; the defaults talk to the
    stores, start Essentia workers and listen for Ctrl-C. Returns 0, or 1 when the store is unusable."""
    try:
        manifest, stored = _stored(opts.audio_dir)
        matches_path = opts.audio_dir / "matches.csv"
        match_rows = load_matches(matches_path) if matches_path.exists() else []
        overrides = load_match_overrides(opts.audio_dir / "match_overrides.json")
    except StoreError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    matches = {r["key"]: r for r in match_rows}
    clips = opts.clips or int(manifest["clips"].get("per_album", 4))
    clips_db = opts.cache_dir / "clips.sqlite"
    if opts.dry_run:  # nothing is created or written, not even an empty cache
        cache = ClipCache(clips_db, readonly=True) if clips_db.exists() else ClipCache(":memory:")
    else:
        cache = ClipCache(clips_db)
    plan = make_plan(catalog, stored, matches, overrides, cache, opts, clips)
    out(f"sync to {clips} clips per album. " + plan.summary())
    if opts.dry_run:
        for item in plan.items[:40]:
            out("would " + item.line())
        if len(plan.items) > 40:
            out(f"... and {len(plan.items) - 40} more")
        n = sum(max(0, i.want - i.cached) for i in plan.items if i.kind not in ("write", "drop"))
        out(f"dry run: nothing fetched or written; about {n} clips to embed" if plan.items else "dry run: nothing to do")
        cache.close()
        return 0
    if not plan.items:
        cache.close()
        return 0

    if http is None:
        http = matching.Http(opts.cache_dir / "http.sqlite")
    stop = stop or Stop()
    stop.install()
    if isinstance(http, matching.Http):
        http.abort = lambda: stop.asked
        if opts.retry_unmatched:
            http.search_max_age_days = matching.RETRY_SEARCH_DAYS
    changed_rows: dict[str, dict] = {}
    tmp = tempfile.mkdtemp(prefix="rmr-audio-")
    try:
        gone = clean_leftovers(opts.audio_dir)
        if gone:
            out(f"removed what an interrupted write left behind: {', '.join(gone)}")
        # 1. Albums never matched (or forced to another listing): ask the stores.
        todo = [i for i in plan.items if i.kind == "match"]
        for n, item in enumerate(todo, 1):
            if stop.asked:
                break
            al = item.album
            try:
                m = (matching.forced(http, item.source, item.album_id) if item.force
                     else matching.match_album(http, al, opts.storefronts))
            except Exception as e:
                if not stop.asked:
                    item.problem = f"matching failed: {e}"[:200]
                continue
            row = {k: str(v) for k, v in m.row(al.key).items()}
            if item.force and al.key in stored:  # until its clips are in, the store's embedding is the old listing's
                item.row = row
            else:
                changed_rows[al.key] = row
            out(f"match {n}/{len(todo)}  {al.slug}: " + (
                f"{m.source} {m.album_id} {m.title!r} / {m.artist!r} score {m.score:.2f}, {m.n_previews} previews"
                + (f"  AMBIGUOUS ({m.reason})" if m.ambiguous else "") if m.source else f"no match ({m.reason})"))
            if m.source and m.n_previews:
                item.kind, item.source, item.album_id, item.want = "clips", m.source, m.album_id, min(clips, m.n_previews)
            else:
                item.problem = "no match" if not m.source else "matched, but the listing has no preview"
                if item.force and al.key in stored:  # the forced listing has no audio: the old embedding goes
                    item.kind = "drop"

        # 2. Download and embed.
        work = [i for i in plan.items if i.kind in ("clips", "local")]
        ex = Extraction(cache, http, opts, clips, pool_factory, stop, out)
        if work and not stop.asked:
            if pool_factory is None:
                model_dir = opts.cache_dir / "models"
                embed.ensure_model(model_dir)
                os.environ["TF_NUM_INTRAOP_THREADS"] = os.environ["TF_NUM_INTEROP_THREADS"] = "1"
                os.environ.setdefault("OMP_NUM_THREADS", "1")
                ex.new_pool = lambda n: process_pool(n, model_dir, tmp)
            ex.run(work)
            rate = ex.n / max(ex.seconds, 1e-9)
            out(f"embedded {ex.n} clips of {ex.done_albums} albums in {ex.seconds:.0f} s = {rate:.2f} clips/s  "
                f"{dict(ex.status)}")
            if ex.rss:
                unit = 2 ** 20 if sys.platform == "darwin" else 2 ** 10  # ru_maxrss: bytes on macOS, kB on Linux
                parent = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / unit
                workers = sorted(v / unit for v in ex.rss.values())
                out(f"peak RSS: workers {', '.join(f'{v:.0f}' for v in workers)} MB, parent {parent:.0f} MB, "
                    f"together at most {sum(workers[-opts.workers:]) + parent:.0f} MB")
        for item in work:  # where the listing is not what matches.csv says any more
            key = item.album.key
            row = item.row or changed_rows.get(key) or matches.get(key)
            now = tuple(str(n) for n in ex.listing.get(key, ()))
            if row and now and (row["n_tracks"], row["n_clips_available"]) != now:
                row = {**row, "n_tracks": now[0], "n_clips_available": now[1]}
                if item.row:
                    item.row = row
                else:
                    changed_rows[key] = row

        # 3. matches.csv, then one shard with the albums that finished (and the removals), then the rows of
        #    forced listings. Each write is atomic, and a crash between them is repaired by the next sync.
        keys, embs, counts, sources, new, grown, dropped = [], [], [], [], 0, 0, 0
        late_rows: dict[str, dict] = {}

        def drop(item: Item, row: dict) -> None:
            nonlocal dropped
            keys.append(item.album.key), embs.append(np.zeros(DIM)), counts.append(0), sources.append("")
            late_rows[item.album.key], dropped = row, dropped + 1

        for item in plan.items:
            was = stored.get(item.album.key)
            if item.kind == "drop":
                drop(item, item.row or {k: str(v) for k, v in matching.Match().row(item.album.key).items()})
                continue
            if item.kind == "match" or (item.kind != "write" and not item.done):
                continue
            mean, n = cache.mean(item.album.key, item.source, item.album_id, None if item.kind == "local" else clips)
            if mean is None:
                item.problem = item.problem or "no usable clip"
                if item.force and was:  # forced to a listing that gave no clip: the old embedding goes
                    drop(item, item.row)
                continue
            if item.kind == "local":
                if was == (n, "local") and not item.changed:
                    continue
            elif not (was is None or item.force or was[1] != item.source or n > was[0]):
                continue
            keys.append(item.album.key), embs.append(mean), counts.append(n), sources.append(item.source)
            if item.row:
                late_rows[item.album.key] = item.row
            new, grown = new + (was is None), grown + (was is not None)
        interrupted = stop.asked
        order = {al.key: i for i, al in enumerate(catalog)}

        def write_rows(rows: dict[str, dict]) -> None:
            matches.update(rows)
            write_matches(matches_path, sorted(matches.values(), key=lambda r: order.get(r["key"], len(order))))

        if changed_rows:
            write_rows(changed_rows)
        if keys:
            note = (f"sync to {clips} clips: {new} new, {grown} updated" + (f", {dropped} removed" if dropped else "")
                    + (" (interrupted)" if interrupted else ""))
            path = append_shard(opts.audio_dir, keys, np.stack(embs), counts, sources, note=note)
            out(f"wrote {path.name}: {len(keys) - dropped} albums ({new} new, {grown} updated)"
                + (f", {dropped} removed" if dropped else ""))
        else:
            out("no album changed: no shard written")
        if late_rows:
            write_rows(late_rows)
        if changed_rows or late_rows:
            out(f"matches.csv: {len({**changed_rows, **late_rows})} rows added or changed")
        down = http.down() if isinstance(http, matching.Http) else []
        if down:
            out(f"{' and '.join(down)} stopped answering: the albums that needed it are left for the next run")
        unfinished = [i for i in plan.items if (i.kind in ("clips", "local") and not i.done)
                      or (i.kind == "match" and i.problem.startswith("matching failed"))]
        whole = not opts.keys and opts.limit is None and not interrupted and not unfinished
        if whole and clips > int(manifest["clips"].get("per_album", 0)):
            set_clips_per_album(opts.audio_dir, clips)
            out(f"manifest.json: the store's clip policy is now {clips} per album")
        problems = [i for i in plan.items if i.problem]
        for item in problems:
            out(f"problem\t{item.album.slug}\t{item.problem}")
        left = sum(1 for i in plan.items if not i.problem and i.kind not in ("write", "drop") and not i.done)
        if left:
            out(f"{left} albums not finished; run sync again to continue")
    finally:
        stop.restore()
        cache.close()
        shutil.rmtree(tmp, ignore_errors=True)
    return 0
