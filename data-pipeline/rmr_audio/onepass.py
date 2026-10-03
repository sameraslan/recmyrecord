"""The one-pass embedder: every clip is downloaded once and embedded by both models, EffNet and CLAP.

  cd data-pipeline
  nice -n 19 .venv-audio/bin/python -m rmr_audio.onepass run --clips 4 [--matches audio/matches.csv] [--keys K,...]
        [--keys-file F] [--skip-imported] [--limit N] [--models effnet,clap] [--decoder own|shared] [--local-dir DIR]
        [--other-lock PATH] [--torch-python PY] [--dry-run]
  .venv-audio/bin/python -m rmr_audio.onepass import [--effnet clips.sqlite] [--clap clap_clips.sqlite]
  .venv-audio/bin/python -m rmr_audio.onepass means --model effnet|clap --clips N --to FILE.npz [--pool rank|below]
  .venv-audio/bin/python -m rmr_audio.onepass status [--clips N]

Processes (at most three Python processes, two of them with a model):

  parent        this module, in the audio venv. All of the network (track listings, preview downloads) and
                the only writer of the cache. Holds no model. A clip's bytes are in its memory once.
  effnet child  `rmr_audio.onepass_worker --backend effnet`, same venv: Essentia + TensorFlow, one thread.
  clap child    `rmr_audio.onepass_worker --backend clap`, the torch venv (--torch-python, RMR_TORCH_PYTHON):
                torch on MPS, CPU fallback.
  The two environments cannot be installed together (Essentia's wheel needs numpy < 2), so each model lives
  in its own child and the parent pipes each clip to both. A child is started when the first clip needs
  it: a run that only tops up one model loads only that one. A child that dies costs one clip for one
  model (`crashed`, tried again next run) and is started again.

Decoder (--decoder):

  own (default)  the downloaded bytes go to both children and each decodes them with the decoder its vectors
                 have always been made with: Essentia's AudioLoader for EffNet, ffmpeg for CLAP. One
                 download, two decodes of about 50 ms each, and every vector already in the caches stays
                 comparable with the new ones by construction.
  shared         the parent decodes once with ffmpeg (clap_catalog.decode) and pipes the mono buffer to both.
                 Use it only once scripts/verify_onepass.py has shown the EffNet vectors do not move.
  Windows of local files have no earlier vectors to stay equal to: the parent always decodes them once
  (ffmpeg, only the window) and both models get that buffer.

What a run does, per album of a matches.csv-shaped file (key, source, source_album_id; n_clips_available is
used when there): nothing when the cache already has `--clips` clips that are ok for every model, or every
preview was tried; else one fresh track listing, and the clips still missing in clips.priority_order
(the first track, then spread: four clips are a prefix of eight). A clip that fails for good is replaced by
the next track in that order within the same run, so an album with enough previews ends with its N. A clip that has one model's embedding
(imported from an earlier cache) is downloaded for the other model only. Statuses are rmr_audio.clips's:
ok, no_preview, too_short, decode_failed are final; a failed download or analysis is tried again by the
next run (a fresh URL refused with HTTP 4xx in two runs becomes no_preview).

Every clip is committed as it finishes, so a killed run continues where it stopped. Ctrl-C or SIGTERM
once: finish the clip in hand and stop. One run per cache: `<cache>.lock` is held for the run, and each
--other-lock (another run's lock file, clap_clips.lock) must be free and is held too, so two model jobs
never share the laptop.

Local files (--local-dir DIR, one folder per album named by its key, `:` may be written `_`): 30-second
windows spread through the album (rmr_audio.windows), not one excerpt per file. They replace the store
previews of that album: its mean is taken from the windows only, and the stores are not asked.

No audio is written anywhere that lasts: a preview is in memory, and for the length of a decode in a temp
file that is already unlinked (ffmpeg) or unlinked right after (Essentia), inside a per-run temp directory.
This module writes the cache and nothing else; `means` writes an .npz where it is told, never the committed
store.
"""
import argparse
import csv
import fcntl
import hashlib
import json
import os
import resource
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from rmr_pipeline.audio_store import DEFAULT_AUDIO
from rmr_pipeline.constants import PIPELINE_DIR, REPO

from . import embed, windows
from .clips import FINAL, priority_order
from .onepass_cache import MODELS, POOLS, OnePassCache
from .onepass_worker import clap_catalog, read_frame, write_frame

DEFAULT_CACHE = PIPELINE_DIR / ".cache" / "audio"  # as rmr_audio.catalog.DEFAULT_CACHE (not imported: it needs pandas)
DEFAULT_OUT = DEFAULT_CACHE / "onepass.sqlite"
DEFAULT_TORCH_PYTHON = REPO / "experiments" / "preview_features" / ".venv-torch" / "bin" / "python"
STORE_DOWN_AFTER = 3  # listings in a row a store may fail before its other albums are left for the next run
NETWORK_DOWN_AFTER = 12  # downloads in a row that may fail on the network before the run stops itself
WORKER_DEAD_AFTER = 3  # times in a row a child may die before the run gives up
REPLY_TIMEOUT, READY_TIMEOUT = 600.0, 1800.0  # seconds: one clip; loading a model (CLAP's first download is 776 MB)


# --- locks -------------------------------------------------------------------------------------------

class Locked(RuntimeError):
    pass


def take_lock(path: Path, ours: bool = True):
    """An exclusive, non-blocking flock, held until the returned file is closed. `ours`: the file is this
    run's own and is created; else it is another run's and is only opened for reading (one that does not
    exist is held by nobody: None)."""
    if not ours and not Path(path).exists():
        return None
    if ours:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    f = open(path, "a" if ours else "r")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        raise Locked(str(path)) from None
    return f


def lock_path(out: Path) -> Path:
    return Path(out).with_suffix(".lock")


# --- the children ------------------------------------------------------------------------------------

class WorkerDied(RuntimeError):
    pass


class Worker:
    """One model child and its pipe."""

    def __init__(self, model: str, argv: list[str], cwd: Path | None = None, env: dict | None = None,
                 reply_timeout: float = REPLY_TIMEOUT, ready_timeout: float = READY_TIMEOUT):
        self.model, self.argv, self.cwd, self.env = model, argv, cwd, env
        self.reply_timeout, self.ready_timeout = reply_timeout, ready_timeout
        self.proc, self.info, self.n = None, {}, 0

    def start(self) -> None:
        self.proc = subprocess.Popen(self.argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=self.cwd, env=self.env)
        header, _ = self._frame(self.ready_timeout)
        if header.get("op") != "ready" or header.get("model") != self.model:
            self.kill()
            raise WorkerDied(f"{self.model}: unexpected greeting {header}")
        self.info = header

    def _frame(self, timeout: float) -> tuple[dict, bytes]:
        deadline, fd = time.monotonic() + timeout, self.proc.stdout.fileno()

        def read(n: int) -> bytes:
            parts, left = [], n
            while left:
                ready, _, _ = select.select([fd], [], [], max(0.0, min(1.0, deadline - time.monotonic())))
                if not ready:
                    if time.monotonic() >= deadline:
                        raise TimeoutError
                    continue
                chunk = os.read(fd, min(left, 1 << 20))
                if not chunk:
                    break
                parts.append(chunk)
                left -= len(chunk)
            return b"".join(parts)

        try:
            frame = read_frame(read)
        except TimeoutError:
            self.kill()
            raise WorkerDied(f"{self.model}: no answer in {timeout:.0f} s; killed") from None
        except (EOFError, ValueError) as e:
            self.kill()
            raise WorkerDied(f"{self.model}: {e}") from None
        if frame is None:
            code = self.proc.wait()
            raise WorkerDied(f"{self.model}: the worker process died (exit {code})")
        return frame

    def send(self, kind: str, payload: bytes, suffix: str) -> None:
        self.n += 1
        try:
            write_frame(self.proc.stdin, {"op": "embed", "id": self.n, "kind": kind, "suffix": suffix}, payload)
        except (BrokenPipeError, OSError, ValueError):
            self.kill()
            raise WorkerDied(f"{self.model}: the worker process died") from None

    def recv(self) -> tuple[dict, bytes]:
        header, emb = self._frame(self.reply_timeout)
        if header.get("id") != self.n:
            self.kill()
            raise WorkerDied(f"{self.model}: answer {header.get('id')} to request {self.n}")
        return header, emb

    def kill(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.kill()
        self.close()

    def close(self) -> None:
        proc, self.proc = self.proc, None
        if proc is None:
            return
        for f in (proc.stdin, proc.stdout):  # a closed pipe is the worker's signal to leave
            try:
                f.close()
            except OSError:
                pass
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


def worker_factories(models: tuple[str, ...], cache_dir: Path, tmp: str, torch_python: Path | None = None) -> dict:
    """model -> a function that makes its (not yet started) Worker."""
    env = {**os.environ, "PYTHONPATH": os.pathsep.join(filter(None, [str(PIPELINE_DIR), os.environ.get("PYTHONPATH")])),
           "PYTHONDONTWRITEBYTECODE": "1"}
    module = ["-m", "rmr_audio.onepass_worker"]
    torch = Path(torch_python or os.environ.get("RMR_TORCH_PYTHON") or DEFAULT_TORCH_PYTHON)
    made = {
        "effnet": lambda: Worker("effnet", [sys.executable, *module, "--backend", "effnet", "--model-dir",
                                            str(cache_dir / "models"), "--tmp", tmp], PIPELINE_DIR, env),
        "clap": lambda: Worker("clap", [str(torch), *module, "--backend", "clap", "--tmp", tmp], PIPELINE_DIR, env),
    }
    return {m: made[m] for m in models}


class Embedder:
    """Both models for one clip from one download (or one decoded window). `factories`: model -> a function
    returning a Worker; a worker is started when first needed."""

    def __init__(self, factories: dict, decoder: str = "own", decode=None, out=print):
        if decoder not in ("own", "shared"):
            raise ValueError("decoder must be own or shared")
        self.factories, self.decoder, self.decode, self.out = factories, decoder, decode, out
        self.workers: dict[str, Worker] = {}
        self.peak: dict[str, dict] = {}  # model -> {rss, mps, pid, device}
        self.died: Counter = Counter()  # model -> deaths in a row
        self.secs: Counter = Counter()

    def worker(self, model: str) -> Worker:
        if model not in self.workers:
            t = time.perf_counter()
            w = self.factories[model]()
            w.start()
            self.workers[model] = w
            self.peak.setdefault(model, {"rss": 0, "mps": 0}).update(device=w.info.get("device"), pid=w.info.get("pid"))
            self.out(f"{model} worker ready on {w.info.get('device')} in {time.perf_counter() - t:.1f} s (pid {w.info.get('pid')})")
        return self.workers[model]

    def _lost(self, model: str, error: Exception) -> dict:
        self.workers.pop(model, None)
        self.died[model] += 1
        if self.died[model] >= WORKER_DEAD_AFTER:
            raise RuntimeError(f"the {model} worker died {self.died[model]} times in a row: {error}")
        return {"status": "crashed", "error": str(error)[:300], "clip_s": None, "emb": None}

    def embed(self, models: list[str], data: bytes | None = None, suffix: str = ".mp3",
              mono: np.ndarray | None = None) -> dict[str, dict]:
        """model -> {status, error, clip_s, emb} for one clip, given as downloaded bytes or as decoded mono."""
        if mono is None and self.decoder == "shared":
            t = time.perf_counter()
            try:
                mono = self.decode(data, suffix)
            except Exception as e:
                return {m: {"status": "decode_failed", "error": str(e)[:300], "clip_s": None, "emb": None} for m in models}
            finally:
                self.secs["decode"] += time.perf_counter() - t
        kind, payload = ("bytes", data) if mono is None else ("mono", np.ascontiguousarray(mono, "<f4").tobytes())
        out, sent = {}, []
        for m in models:  # both children get the clip before either is waited for: they work side by side
            try:
                self.worker(m).send(kind, payload, suffix)
                sent.append(m)
            except WorkerDied as e:
                out[m] = self._lost(m, e)
        for m in sent:
            try:
                header, emb = self.workers[m].recv()
            except WorkerDied as e:
                out[m] = self._lost(m, e)
                continue
            self.died[m] = 0
            peak = self.peak[m]
            peak["rss"], peak["mps"] = max(peak["rss"], header.get("rss", 0)), max(peak["mps"], header.get("mps", 0))
            self.secs[m] += header.get("secs", 0.0)
            out[m] = {"status": header["status"], "error": header.get("error"), "clip_s": header.get("clip_s"),
                      "emb": emb if header["status"] == "ok" else None}
        return out

    def close(self) -> None:
        for w in self.workers.values():
            w.close()
        self.workers.clear()

    def memory(self) -> str:
        unit = 2 ** 20 if sys.platform == "darwin" else 2 ** 10  # ru_maxrss: bytes on macOS, kB on Linux
        parent = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / unit
        parts = [f"{m} {p['rss'] / unit:.0f} MB" + (f" + MPS {p['mps'] / 2 ** 20:.0f} MB" if p["mps"] else "")
                 for m, p in self.peak.items()]
        total = parent + sum(p["rss"] / unit + p["mps"] / 2 ** 20 for p in self.peak.values())
        return f"peak memory: {', '.join(parts) or 'no worker started'}, parent {parent:.0f} MB; together at most {total:.0f} MB"

    def peak_total_mb(self) -> float:
        unit = 2 ** 20 if sys.platform == "darwin" else 2 ** 10
        return (resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / unit
                + sum(p["rss"] / unit + p["mps"] / 2 ** 20 for p in self.peak.values()))


# --- the plan ----------------------------------------------------------------------------------------

@dataclass
class Options:
    matches: Path = DEFAULT_AUDIO / "matches.csv"
    out: Path = DEFAULT_OUT
    clips: int = 4
    models: tuple[str, ...] = ("effnet", "clap")
    keys: tuple[str, ...] = ()  # empty = every album of the matches file
    skip_imported: bool = False
    limit: int | None = None
    decoder: str = "own"
    local_dir: Path | None = None
    other_locks: tuple[Path, ...] = ()
    torch_python: Path | None = None
    cache_dir: Path = DEFAULT_CACHE  # the EffNet model file lives in its models/
    dry_run: bool = False
    progress_secs: float = 60.0


@dataclass
class Item:
    key: str
    kind: str  # clips | local
    source: str = ""
    album_id: str = ""
    folder: Path | None = None
    good: int = 0
    problem: str = ""
    done: bool = False


@dataclass
class Plan:
    items: list[Item] = field(default_factory=list)
    counts: Counter = field(default_factory=Counter)

    def summary(self, clips: int, models: tuple[str, ...]) -> str:
        c, kinds = self.counts, Counter(i.kind for i in self.items)
        parts = [f"{c['complete']} complete", f"{kinds['clips']} to fetch", f"{kinds['local']} from local files"]
        parts += [f"{c[k]} {text}" for k, text in (
            ("unmatched", "with no listing"), ("local_audio", "kept on their local windows"),
            ("imported", "left alone (--skip-imported)"), ("beyond_limit", "left for a later run (--limit)")) if c[k]]
        return f"{clips} clips per album for {' + '.join(models)}. {len(self.items) + sum(c.values())} albums: " + ", ".join(parts)


def read_albums(path: Path) -> list[dict]:
    """The albums of a matches.csv-shaped file: key, source, source_album_id, and n_clips_available when the
    column is there. Only those columns are read, so the file may carry others."""
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = {"key", "source", "source_album_id"} - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path}: no column {', '.join(sorted(missing))}")
        out, seen = [], set()
        for r in reader:
            if not r["key"] or r["key"] in seen:
                raise ValueError(f"{path}: empty or repeated key {r['key']!r}")
            seen.add(r["key"])
            n = (r.get("n_clips_available") or "").strip()
            out.append({"key": r["key"], "source": r["source"], "album_id": r["source_album_id"],
                        "available": int(n) if n.isdigit() else None})
    return out


def local_folder(local_dir: Path | None, key: str) -> Path | None:
    for name in (key, key.replace(":", "_")) if local_dir else ():
        if (local_dir / name).is_dir():
            return local_dir / name
    return None


def all_ok(status: dict[str, str], models) -> bool:
    return all(status.get(m) == "ok" for m in models)


def all_final(status: dict[str, str], models) -> bool:
    return all(status.get(m) in FINAL for m in models)


def make_plan(albums: list[dict], cache: OnePassCache, opts: Options) -> Plan:
    """What each album needs, from files only (no network)."""
    plan, summary, listings = Plan(), cache.summary(), cache.listings()
    imported = set()
    if opts.skip_imported:
        imported = {r[0] for r in cache.con.execute("SELECT DISTINCT key FROM embeddings WHERE origin LIKE 'import:%'")}
    wanted = set(opts.keys)
    for al in albums:
        key, source, album_id = al["key"], al["source"], al["album_id"]
        if wanted and key not in wanted:
            continue
        folder = local_folder(opts.local_dir, key)
        if folder is not None:
            item = Item(key, "local", "local", "", folder)
        elif any(st == "ok" for clip in summary.get((key, "local", ""), {}).values() for st in clip.values()):
            plan.counts["local_audio"] += 1  # its windows replace the store previews: the stores are not asked
            continue
        elif not source:
            plan.counts["unmatched"] += 1
            continue
        elif key in imported:
            plan.counts["imported"] += 1
            continue
        else:
            clips = summary.get((key, source, album_id), {})
            known = listings.get((key, source, album_id))
            available = known["n_previews"] if known and known["n_previews"] is not None else al["available"]
            good = sum(all_ok(st, opts.models) for st in clips.values())
            tried = sum(all_final(st, opts.models) for st in clips.values())
            if good >= opts.clips or (available is not None and tried >= available):
                plan.counts["complete"] += 1
                continue
            item = Item(key, "clips", source, album_id, good=good)
        if opts.limit is not None and len(plan.items) >= opts.limit:
            plan.counts["beyond_limit"] += 1
        else:
            plan.items.append(item)
    return plan


def needed_clips(key: str, source: str, album_id: str, listing: list[dict], cached: dict[str, dict],
                 models: tuple[str, ...], clips: int) -> list[dict]:
    """The clips to download now so the album has `clips` that are ok for every model: walk the listing's
    tracks that have a preview in priority order, skip the ones every model has a final answer for, and
    take as many as are missing. A clip one model already has is taken for the other model only
    (`models` of the record). A new clip's rank is its place in the walk, as in rmr_audio.sync; a clip
    already cached keeps its rank."""
    playable = [(i, t) for i, t in enumerate(listing) if t.get("preview_url")]
    missing = clips - sum(all_ok(c["status"], models) for c in cached.values())
    out = []
    for rank, pos in enumerate(priority_order(len(playable)) if playable else []):
        if len(out) >= missing:
            break
        idx, t = playable[pos]
        have = cached.get(t["track_id"], {"status": {}, "error": {}, "prio": None, "track_idx": None})
        todo = [m for m in models if have["status"].get(m) not in FINAL]
        if not todo:
            continue
        refused = [m for m in todo if have["status"].get(m) == "download_failed" and (have["error"].get(m) or "").startswith("HTTP 4")]
        out.append({"key": key, "source": source, "album_id": album_id, "track_id": t["track_id"],
                    "track_idx": have["track_idx"] if have["track_idx"] is not None else idx,
                    "prio": have["prio"] if have["prio"] is not None else rank, "url": t["preview_url"],
                    "suffix": ".mp3" if source == "deezer" else ".m4a", "track_s": t.get("duration_s") or None,
                    "models": todo, "refused_before": refused})
    return out


def local_clips(item: Item, cache: OnePassCache, models: tuple[str, ...], durations) -> list[dict]:
    """The windows of the album's folder still to embed. The plan depends on every file's length, so when a
    file was added, removed or replaced (or the sampling rule changed) the album's windows are all laid out
    again and the cached ones forgotten."""
    files = embed.local_files(item.folder)
    lengths = [durations(p) or 0.0 for p in files]
    sig = hashlib.sha1(json.dumps([windows.VERSION, [(p.name, embed.file_sig(p)) for p in files]]).encode()).hexdigest()[:16]
    wins = windows.plan(lengths)
    cached = cache.album(item.key, "local", "")
    if cached and any(c["sig"] != sig for c in cached.values()):
        cache.forget(item.key, "local", "")
        cached = {}
    runtime = float(sum(lengths))
    cache.set_listing(item.key, "local", "", len(files), len(wins), runtime, min(windows.n_windows(runtime), len(wins)) or None)
    cache.commit()
    out = []
    for w in wins:
        track_id = f"{files[w.file].name}@{w.start_s:.2f}"
        todo = [m for m in models if cached.get(track_id, {"status": {}})["status"].get(m) not in FINAL]
        if todo:
            out.append({"key": item.key, "source": "local", "album_id": "", "track_id": track_id, "track_idx": w.index,
                        "prio": w.rank, "start_s": w.start_s, "length_s": w.length_s, "sig": sig, "path": str(files[w.file]),
                        "track_s": lengths[w.file], "models": todo, "refused_before": []})
    return sorted(out, key=lambda r: r["prio"])


# --- the run -----------------------------------------------------------------------------------------

class Stop:
    """Ctrl-C or SIGTERM once: finish the clip in hand, then stop. Twice: stop now (what is done is committed)."""

    def __init__(self):
        self.asked = False

    def __call__(self, *_):
        if self.asked:
            raise KeyboardInterrupt
        self.asked = True
        print("\nstopping after the clip in hand (again to stop at once)", file=sys.stderr, flush=True)

    def install(self):
        self.old = {s: signal.signal(s, self) for s in (signal.SIGINT, signal.SIGTERM)}

    def restore(self):
        for s, h in getattr(self, "old", {}).items():
            signal.signal(s, h)


def store_of(source: str) -> str:
    return source.split(":")[0]


def default_network():
    """(listing(source, album_id) -> tracks, download(url) -> bytes): the matcher's fresh track listing (its
    rate limits and retries) and embed.download. Imported here: the matcher needs pandas and rapidfuzz."""
    import requests

    from . import match as matching

    http = matching.Http(None)  # fresh listings are never cached: preview URLs expire
    embed.WORKER["session"] = requests.Session()
    return (lambda source, album_id: matching.tracks(http, source, album_id, fresh=True)), embed.download, http


def run(opts: Options, listing=None, download=None, embedder=None, out=print, stop: Stop | None = None,
        durations=None, decode_window=None) -> int:
    """One run. `listing`, `download`, `embedder`, `durations` and `decode_window` are replaced in tests; the
    defaults talk to the stores, start the model children and call ffprobe and ffmpeg. Returns 0, or 1
    when it could not start (a lock is held, a tool is missing)."""
    unknown = [m for m in opts.models if m not in MODELS]
    if unknown or not opts.models:
        print(f"unknown model {unknown}: {', '.join(MODELS)}", file=sys.stderr)
        return 1
    if opts.dry_run:
        cache = OnePassCache(opts.out, readonly=True) if Path(opts.out).exists() else OnePassCache(":memory:")
        plan = make_plan(read_albums(opts.matches), cache, opts)
        out(plan.summary(opts.clips, opts.models))
        out("dry run: nothing fetched or written")
        cache.close()
        return 0
    held = []
    try:
        held.append(take_lock(lock_path(opts.out)))
        for path in opts.other_locks:
            held.append(take_lock(path, ours=False))
    except Locked as e:
        print(f"{e} is held by a running job: not starting", file=sys.stderr)
        for f in held:
            f and f.close()
        return 1
    cache = OnePassCache(opts.out)
    stop = stop or Stop()
    tmp, own_embedder, http = None, embedder is None, None
    try:
        plan = make_plan(read_albums(opts.matches), cache, opts)
        out(plan.summary(opts.clips, opts.models))
        if not plan.items:
            return 0
        ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
        if own_embedder or (decode_window is None and any(i.kind == "local" for i in plan.items)):
            if not ffmpeg or not ffprobe:
                print("ffmpeg and ffprobe must be on PATH: they decode the clips for CLAP and the local windows", file=sys.stderr)
                return 1
        prefix = f"rmr-onepass-{hashlib.sha1(str(Path(opts.out).resolve()).encode()).hexdigest()[:8]}-"
        for stale in Path(tempfile.gettempdir()).glob(prefix + "*"):  # what a killed run on this cache left (we hold its lock)
            shutil.rmtree(stale, ignore_errors=True)
        tmp = tempfile.mkdtemp(prefix=prefix)
        if own_embedder:
            cc = clap_catalog()
            if "effnet" in opts.models:
                embed.ensure_model(opts.cache_dir / "models")
            embedder = Embedder(worker_factories(opts.models, opts.cache_dir, tmp, opts.torch_python), opts.decoder,
                                lambda data, suffix: cc.decode(data, suffix, tmp, ffmpeg), out)
        if decode_window is None:
            decode_window = lambda path, start, length: windows.decode_window(  # noqa: E731
                path, start, length, ffmpeg, clap_catalog().mono_of_wav)
        durations = durations or (lambda p: windows.probe_duration(p, ffprobe))
        if (listing is None or download is None) and any(i.kind == "clips" for i in plan.items):
            net_listing, net_download, http = default_network()
            http.abort = lambda: stop.asked
            listing, download = listing or net_listing, download or net_download
        stop.install()
        _work(plan, cache, opts, listing, download, embedder, out, stop, durations, decode_window)
    finally:
        stop.restore()
        if embedder is not None and own_embedder:
            embedder.close()
        cache.close()
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
        for f in held:
            f and f.close()
    return 0


def _work(plan: Plan, cache: OnePassCache, opts: Options, listing, download, embedder, out, stop: Stop,
          durations, decode_window) -> None:
    status: dict[str, Counter] = {m: Counter() for m in opts.models}
    failing, n, done_albums, network_fails = Counter(), 0, 0, 0
    t0 = last = time.monotonic()
    downloads = ThreadPoolExecutor(1)  # one at a time, ahead of the models: the next clip is usually in memory

    def progress() -> None:
        rate = n / max(time.monotonic() - t0, 1e-9)
        out(f"[{time.strftime('%H:%M:%S')}] {done_albums}/{len(plan.items)} albums, {n} clips, {rate * 60:.1f} clips/min  "
            + "  ".join(f"{m} {dict(c)}" for m, c in status.items()))

    try:
        for item in plan.items:
            if stop.asked:
                break
            store = store_of(item.source)
            if item.kind == "clips" and failing[store] >= STORE_DOWN_AFTER:
                item.problem = f"{store} is not answering: left for the next run"
                continue
            try:
                tracks = None
                if item.kind == "clips":
                    tracks = listing(item.source, item.album_id)
                    failing[store] = 0
                    playable = [t for t in tracks if t.get("preview_url")]
                    cache.set_listing(item.key, item.source, item.album_id, len(tracks), len(playable),
                                      float(sum(t.get("duration_s") or 0 for t in tracks)) or None,
                                      track_s={t["track_id"]: t.get("duration_s") for t in tracks})
                    cache.commit()
                first = _needed(item, tracks, cache, opts, durations)
            except Exception as e:  # the listing could not be fetched (or the folder read): the album waits for the next run
                if not stop.asked:
                    item.problem = f"listing failed: {e}"[:200]
                    failing[store] += item.kind == "clips"
                continue
            attempted: set[str] = set()
            recs, broke = first, False
            while recs and not broke:  # again while a clip that failed for good can be replaced by the next track
                pending = [None if rec.get("path") else downloads.submit(download, rec["url"]) for rec in recs]
                for i, (rec, fut) in enumerate(zip(recs, pending)):
                    if stop.asked:
                        for p in pending[i:]:
                            p and p.cancel()
                        broke = True
                        break
                    attempted.add(rec["track_id"])
                    results = _clip(rec, fut, embedder, decode_window)
                    if stop.asked and not all(r["status"] == "ok" for r in results.values()):
                        broke = True  # a failure while stopping may be the stop itself: the clip is left for the next run
                        break
                    clip_s = next((r["clip_s"] for r in results.values() if r.get("clip_s") is not None), None)
                    cache.put_clip({**rec, "clip_s": clip_s})
                    for m, r in results.items():
                        cache.put_result(rec, m, r["status"], r.get("error"), r.get("emb"), r.get("clip_s"))
                        status[m][r["status"]] += 1
                    cache.commit()
                    n += 1
                    lost = all(r["status"] == "download_failed" and not (r.get("error") or "").startswith("HTTP")
                               for r in results.values())
                    network_fails = network_fails + 1 if lost else 0
                    if network_fails >= NETWORK_DOWN_AFTER:
                        out(f"{network_fails} downloads in a row failed on the network: stopping; run again once it is back")
                        stop.asked = True
                    if time.monotonic() - last >= opts.progress_secs:
                        progress()
                        last = time.monotonic()
                if not broke:
                    recs = [r for r in _needed(item, tracks, cache, opts, durations) if r["track_id"] not in attempted]
            if not broke:
                item.done = True
                done_albums += 1
    finally:
        downloads.shutdown(wait=False, cancel_futures=True)
        cache.commit()
    seconds = time.monotonic() - t0
    progress()
    out(f"{'stopped' if stop.asked else 'finished'}: {n} clips of {done_albums} albums in {seconds:.0f} s"
        + (f" = {seconds / n:.2f} s per clip" if n else ""))
    if hasattr(embedder, "memory"):
        out(embedder.memory())
        if embedder.secs:
            out("model seconds per clip: " + ", ".join(f"{k} {v / max(n, 1):.2f}" for k, v in embedder.secs.items()))
    for item in plan.items:
        if item.problem:
            out(f"problem\t{item.key}\t{item.problem}")
    left = sum(1 for i in plan.items if not i.done and not i.problem)
    if left:
        out(f"{left} albums not finished; run again to continue")


def _needed(item: Item, tracks, cache: OnePassCache, opts: Options, durations) -> list[dict]:
    if item.kind == "local":
        return local_clips(item, cache, opts.models, durations)
    return needed_clips(item.key, item.source, item.album_id, tracks, cache.album(item.key, item.source, item.album_id),
                        opts.models, opts.clips)


def _clip(rec: dict, fut, embedder, decode_window) -> dict[str, dict]:
    """model -> result for one clip: its one download (or one decoded window), then every model it needs."""
    models = rec["models"]

    def every(status: str, error: str) -> dict:
        return {m: {"status": status, "error": error, "clip_s": None, "emb": None} for m in models}

    if rec.get("path"):
        try:
            mono = decode_window(rec["path"], rec["start_s"], rec["length_s"])
        except Exception as e:
            return every("decode_failed", str(e)[:300])
        results = embedder.embed(models, mono=mono)
        for r in results.values():
            r["clip_s"] = r["clip_s"] if r.get("clip_s") is not None else len(mono) / windows.SR
        return results
    try:
        data = fut.result()
    except embed.EmptyPreview as e:
        return every("no_preview", str(e)[:300])
    except Exception as e:
        results = every("download_failed", str(e)[:300])
        if str(e).startswith("HTTP 4"):  # a fresh URL refused in two runs is not tried a third time
            for m in rec.get("refused_before", ()):
                results[m].update(status="no_preview", error=str(e)[:280] + ", twice")
        return results
    return embedder.embed(models, data=data, suffix=rec.get("suffix", ".mp3"))


# --- commands ----------------------------------------------------------------------------------------

def import_caches(out_db: Path, effnet: Path | None, clap: Path | None, keys_csv: Path | None, out=print) -> int:
    """Copy the per-clip embeddings of earlier caches into the one-pass cache. The sources are opened
    read-only and never written."""
    from rmr_pipeline.keys import load_keys

    keymap = load_keys(keys_csv) if keys_csv else None
    try:
        lock = take_lock(lock_path(out_db))
    except Locked as e:
        print(f"{e} is held by a running job: not importing", file=sys.stderr)
        return 1
    cache = OnePassCache(out_db)
    try:
        for model, path in (("effnet", effnet), ("clap", clap)):
            if path is None:
                continue
            counts = cache.import_effnet(path, keymap) if model == "effnet" else cache.import_clap(path, keymap)
            out(f"{model} from {path}: " + (", ".join(f"{n} {k}" for k, n in sorted(counts.items())) or "nothing there"))
    finally:
        cache.close()
        lock.close()
    return 0


def write_means(cache: OnePassCache, model: str, clips: int | None, pool: str, to: Path, matches: Path | None = None,
                common: tuple[str, ...] = ()) -> int:
    """The album means of one model as an .npz (keys, emb float32, n_clips, source, and how it was pooled).
    Never inside the committed store: that is written by `rmr_audio sync` and its tools only."""
    to = Path(to).resolve()
    if DEFAULT_AUDIO.resolve() in to.parents:
        raise ValueError(f"{to} is inside the committed store; write the means somewhere else")
    listing_of = {a["key"]: (a["source"], a["album_id"]) for a in read_albums(matches) if a["source"]} if matches else None
    keys, X, n, sources = cache.means(model, clips, pool, listing_of, common)
    to.parent.mkdir(parents=True, exist_ok=True)
    tmp = to.with_name("." + to.name + ".tmp.npz")
    np.savez(tmp, keys=keys, emb=X.astype(np.float32), n_clips=n, source=sources, model=MODELS[model].model_id,
             clips=-1 if clips is None else clips, pool=pool, common=",".join(common))
    os.replace(tmp, to)
    return len(keys)


def status_text(cache: OnePassCache, albums: list[dict] | None, clips: int, models: tuple[str, ...]) -> str:
    lines = [f"{m}: {dict(c)}" for m, c in sorted(cache.counts().items())] or ["the cache is empty"]
    if albums is not None:
        plan = make_plan(albums, cache, Options(clips=clips, models=models))
        lines.append(plan.summary(clips, models))
    flagged = cache.short_previews()
    lines.append(f"short_preview: {sum(n for *_, n in flagged)} clips of {len(flagged)} albums")
    return "\n".join(lines)


def _models(text: str) -> tuple[str, ...]:
    out = tuple(m.strip() for m in text.split(",") if m.strip())
    if not out or any(m not in MODELS for m in out):
        raise argparse.ArgumentTypeError(f"models: comma-separated from {', '.join(MODELS)}")
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m rmr_audio.onepass", description="One download per clip, both models.")
    sub = p.add_subparsers(dest="cmd", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--out", type=Path, default=DEFAULT_OUT, help="The one-pass cache (default .cache/audio/onepass.sqlite).")
    select_ = argparse.ArgumentParser(add_help=False)
    select_.add_argument("--matches", type=Path, default=DEFAULT_AUDIO / "matches.csv",
                         help="A matches.csv-shaped file: key, source, source_album_id.")
    select_.add_argument("--clips", type=int, default=4, help="Clips per album (default 4).")
    select_.add_argument("--models", type=_models, default=("effnet", "clap"))

    r = sub.add_parser("run", parents=[common, select_], help="Fetch and embed what the cache is missing.")
    r.add_argument("--keys", default="", help="Only these albums: comma-separated keys.")
    r.add_argument("--keys-file", type=Path, default=None, help="Only the albums whose keys are in this file, one per line.")
    r.add_argument("--skip-imported", action="store_true",
                   help="Leave alone every album that has imported embeddings (the existing catalog): only new albums.")
    r.add_argument("--limit", type=int, default=None, help="At most N albums with work to do.")
    r.add_argument("--decoder", choices=("own", "shared"), default="own")
    r.add_argument("--local-dir", type=Path, default=None, help="Folder of local files: DIR/<album key>/*.mp3|m4a|flac|wav|ogg|aiff.")
    r.add_argument("--other-lock", type=Path, action="append", default=[],
                   help="Another job's lock file (clap_clips.lock): refuse to start while it is held, and hold it.")
    r.add_argument("--torch-python", type=Path, default=None, help="The torch venv's python (or RMR_TORCH_PYTHON).")
    r.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE, help="Where models/ (the EffNet graph) is.")
    r.add_argument("--progress-secs", type=float, default=60.0)
    r.add_argument("--dry-run", action="store_true", help="Print what would be done; no network, nothing written.")

    i = sub.add_parser("import", parents=[common], help="Copy embeddings already computed into the cache (sources read-only).")
    i.add_argument("--effnet", type=Path, default=Path(os.environ["RMR_CLIPS_DB"]) if os.environ.get("RMR_CLIPS_DB") else None,
                   help="The pipeline's clips.sqlite (default: RMR_CLIPS_DB).")
    i.add_argument("--clap", type=Path, default=None, help="A clap_catalog run's clap_clips.sqlite.")
    i.add_argument("--keys-csv", type=Path, default=DEFAULT_AUDIO / "keys.csv", help="Turns legacy Spotify-URI keys into album keys.")

    m = sub.add_parser("means", parents=[common], help="Album means of one model from the cache, as an .npz.")
    m.add_argument("--model", choices=tuple(MODELS), required=True)
    m.add_argument("--clips", type=int, default=None, help="Clips per album (default: every ok clip).")
    m.add_argument("--pool", choices=POOLS, default="rank")
    m.add_argument("--common", action="store_true", help="Only clips that are ok for both models.")
    m.add_argument("--matches", type=Path, default=None, help="Which listing each album's mean is taken from.")
    m.add_argument("--to", type=Path, required=True)

    sub.add_parser("status", parents=[common, select_], help="Counts per model, and what a run would do.")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    sys.stdout.reconfigure(line_buffering=True)
    if args.cmd == "run":
        if args.clips < 1:
            parser().error("--clips must be at least 1")
        keys = tuple(k for k in args.keys.split(",") if k)
        if args.keys_file:
            keys += tuple(line.strip() for line in args.keys_file.read_text(encoding="utf-8").splitlines() if line.strip())
        try:
            os.nice(19)
        except OSError:
            pass
        return run(Options(args.matches, args.out, args.clips, args.models, keys, args.skip_imported, args.limit, args.decoder,
                           args.local_dir, tuple(args.other_lock), args.torch_python, args.cache_dir, args.dry_run,
                           args.progress_secs))
    if args.cmd == "import":
        if args.effnet is None and args.clap is None:
            parser().error("give --effnet and/or --clap (or set RMR_CLIPS_DB)")
        return import_caches(args.out, args.effnet, args.clap, args.keys_csv)
    if not args.out.exists():
        print(f"{args.out}: no one-pass cache there", file=sys.stderr)
        return 1
    cache = OnePassCache(args.out, readonly=True)
    try:
        if args.cmd == "means":
            n = write_means(cache, args.model, args.clips, args.pool, args.to, args.matches, tuple(MODELS) if args.common else ())
            print(f"{n} album means ({args.model}, {'all' if args.clips is None else args.clips} clips, pool {args.pool}) -> {args.to}")
        else:
            print(status_text(cache, read_albums(args.matches) if args.matches.exists() else None, args.clips, args.models))
    finally:
        cache.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
