"""Embedding-model bake-off: is another embedding clearly better than plain Discogs-EffNet for
album-to-album similarity, at a cost a laptop can bear?

CLI (always under nice, from this folder, with the Essentia venv):
  .venv/bin/python bakeoff.py sample [--albums 800]        write results/bakeoff_rows.txt
  .venv/bin/python bakeoff.py bench  [--n 20] [--device cpu|mps] [--threads 1] [--models tier1,clap,mert]
  .venv/bin/python bakeoff.py run    [--tracks 2] [--limit-albums K] [--device mps] [--workers 2]
                                     [--threads 1] [--models a,b,...] [--retry-failed]
  .venv/bin/python bakeoff.py status

Pool: a fixed random order (seed 0) of the albums that are matched, unambiguous and not overridden in
cache/match.sqlite and whose four first-pass tracks (prio 0-3) are all `ok` in cache/features.sqlite.
results/bakeoff_rows.txt holds the first --albums of that order, so a longer file extends a shorter
one. `run` analyses the tracks extract.py already analysed for those albums (prio < --tracks),
breadth-first (prio 0 of every album, then prio 1, ...), so the cached effnet / musicnn embeddings
are a like-for-like baseline and an interrupted run is a usable smaller one.

Candidates (model names as stored)
  artist_1280, artist_512, track_*, release_*, label_*, multi_1280
      the contrastive Discogs-EffNet models (discogs_{x}_embeddings-effnet-bs64-1.pb): the 1280-d
      embedding (PartitionedCall:1) and the 512-d projection head the contrastive loss was applied
      to (PartitionedCall:0), both averaged over the same 2 s patches (hop 1 s) plain effnet uses.
      Only batch-64 exports exist and the batch size is baked into the graph: the 29 patches of a
      30 s clip are padded to 64 by repetition and the first 29 outputs kept (1.0 CPU-s per model
      instead of 0.45). The `multi` export has no projection head (both outputs are the embedding).
  clap, mert
      PyTorch models served by bakeoff_torch.py in a second interpreter (.venv-torch): see its
      docstring. `mert` stores all 13 layers; load a view with bakeoff_load("mert_l7"), "mert_mid"
      (layers 4-7) or "mert_mean" (all layers).

`run` makes two passes, each resumable and each skipping what is already stored, one after the other
so that at most two busy processes exist at any time:
  1. tier 1: --workers Essentia processes download, decode and run the contrastive graphs
  2. torch: this process downloads and decodes, and pipes the 44.1 kHz mono samples to the torch server
A preview is therefore downloaded twice. Audio only ever touches disk as a temp file that is
deleted right after the decode, as in extract.py; preview URLs are fetched fresh for every track.

cache/bakeoff.sqlite (WAL, this process is the only writer)
  emb(row, track_idx, model, dim, vec BLOB float16 little-endian, PRIMARY KEY(row, track_idx, model))
  failures(row, track_idx, stage, error, updated_at)   tracks skipped on later runs unless --retry-failed
  checks(row, track_idx, max_abs, cos)   plain discogs-effnet recomputed here vs. the cached embedding
  timing(row, track_idx, model, cpu_s, wall_s)

`bakeoff_load(model, prio_below=None)` returns (rows, X): album-mean embeddings (raw mean over the
album's tracks, as aggregate.py does) for a bake-off model or for the cached `effnet` / `musicnn`,
over the same albums and tracks.
"""
import argparse
import json
import multiprocessing
import os
import queue
import resource
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from collections import Counter, deque
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, ThreadPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import numpy as np

from common import CACHE, FEATURES_DB, HERE, MATCH_DB, MODELS, RESULTS

BAKEOFF_DB = CACHE / "bakeoff.sqlite"
ROWS_FILE = RESULTS / "bakeoff_rows.txt"
TORCH_PY = HERE / ".venv-torch" / "bin" / "python"
BASE = "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/"
CONTRASTIVE = ("artist", "multi", "track", "release", "label")
# `multi` has no projection head: its export returns the 1280-d embedding on both outputs
TIER1 = [f"{k}_{d}" for k in CONTRASTIVE for d in (1280, 512) if (k, d) != ("multi", 512)]
TORCH = {"clap": 512, "mert": 13 * 768}
DEFAULT_RUN = TIER1 + ["clap", "mert"]
CACHED = {"effnet": 1280, "musicnn": 200}  # baselines read from cache/features.sqlite
MERT_VIEWS = {"mert_mid": range(4, 8), "mert_mean": range(13), **{f"mert_l{i}": [i] for i in range(13)}}
BATCH = 64
SCHEMA = """
CREATE TABLE IF NOT EXISTS emb(row INTEGER, track_idx INTEGER, model TEXT, dim INTEGER, vec BLOB,
    PRIMARY KEY(row, track_idx, model));
CREATE TABLE IF NOT EXISTS failures(row INTEGER, track_idx INTEGER, stage TEXT, error TEXT, updated_at TEXT,
    PRIMARY KEY(row, track_idx, stage));
CREATE TABLE IF NOT EXISTS checks(row INTEGER, track_idx INTEGER, max_abs REAL, cos REAL,
    PRIMARY KEY(row, track_idx));
CREATE TABLE IF NOT EXISTS timing(row INTEGER, track_idx INTEGER, model TEXT, cpu_s REAL, wall_s REAL,
    PRIMARY KEY(row, track_idx, model));
"""


def ro(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


# --- pool ----------------------------------------------------------------------------------------

def eligible_rows() -> list[int]:
    """Albums whose first-pass tracks (prio 0-3) are all analysed and whose match is clean, in the
    fixed random order (seed 0) every sample is a prefix of."""
    con = ro(MATCH_DB)
    clean = {r for r, in con.execute("SELECT row FROM albums WHERE status = 'matched' AND ambiguous = 0 "
                                     "AND override = 0")}
    con.close()
    con = ro(FEATURES_DB)
    full = [r for r, in con.execute("SELECT row FROM tracks WHERE status = 'ok' AND prio < 4 AND effnet IS NOT NULL "
                                    "GROUP BY row HAVING COUNT(*) = 4 ORDER BY row")]
    con.close()
    rows = np.array([r for r in full if r in clean])
    return [int(r) for r in np.random.default_rng(0).permutation(rows)]


def sample(n: int) -> list[int]:
    """Write the first n albums of the fixed order to results/bakeoff_rows.txt. An existing file must
    be a prefix of the new one (the pool only grows while the extraction is unfinished, which would
    reshuffle the order: then the existing rows are kept and new ones appended)."""
    order = eligible_rows()
    old = pool_rows() if ROWS_FILE.exists() else []
    rows = old + [r for r in order if r not in set(old)]
    rows = rows[:max(n, len(old))]
    ROWS_FILE.write_text("\n".join(map(str, rows)) + "\n")
    print(f"{len(rows)} albums in {ROWS_FILE} ({len(old)} kept from before; {len(order)} eligible)")
    return rows


def pool_rows() -> list[int]:
    return [int(x) for x in ROWS_FILE.read_text().split()]


def plan(rows: list[int], n_tracks: int) -> list[dict]:
    """The cached tracks with prio < n_tracks of every pool album, breadth-first."""
    con = ro(FEATURES_DB)
    con.execute("ATTACH DATABASE ? AS m", (f"file:{MATCH_DB}?mode=ro",))
    recs = {}
    for row, idx, prio, source, track_id, album_id, url in con.execute(
            "SELECT t.row, t.track_idx, t.prio, t.source, t.track_id, a.source_album_id, mt.preview_url "
            "FROM tracks t JOIN m.albums a ON a.row = t.row "
            "JOIN m.tracks mt ON mt.row = t.row AND mt.track_idx = t.track_idx "
            "WHERE t.status = 'ok' AND t.prio < ?", (n_tracks,)):
        recs[row, prio] = {"row": row, "track_idx": idx, "prio": prio, "source": source, "track_id": track_id,
                           "album_id": album_id, "url": url if source == "itunes" else None, "status": None}
    con.close()
    return [recs[r, p] for p in range(n_tracks) for r in rows if (r, p) in recs]


# --- tier 1: Essentia graphs ---------------------------------------------------------------------

def ensure_models() -> None:
    import requests

    MODELS.mkdir(parents=True, exist_ok=True)
    for k in CONTRASTIVE:
        for ext in (".json", ".pb"):
            dest = MODELS / f"discogs_{k}_embeddings-effnet-bs64-1{ext}"
            if not dest.exists():
                part = dest.with_suffix(ext + ".part")
                with requests.get(BASE + dest.name, stream=True, timeout=(20, 120)) as r:
                    r.raise_for_status()
                    with open(part, "wb") as f:
                        for chunk in r.iter_content(1 << 20):
                            f.write(chunk)
                part.rename(dest)


class Tier1:
    """The contrastive EffNets (and plain effnet for the front-end check) on one shared mel."""

    def __init__(self, kinds=CONTRASTIVE):
        import essentia
        import essentia.standard as es

        import models

        essentia.log.infoActive = essentia.log.warningActive = False
        self.es, self.models = es, models
        self.mel = es.TensorflowInputMusiCNN()
        self.to16k = es.Resample(inputSampleRate=44100, outputSampleRate=16000, quality=4)
        self.plain = models.Graph(models.EFFNET, "embeddings")
        self.graphs = {}
        for k in kinds:
            meta = json.loads((MODELS / f"discogs_{k}_embeddings-effnet-bs64-1.json").read_text())
            node_in = meta["schema"]["inputs"][0]["name"]
            outs = {o["output_purpose"]: o["name"] for o in meta["schema"]["outputs"]}
            assert meta["schema"]["inputs"][0]["shape"] == [BATCH, 128, 96], meta["schema"]["inputs"]
            algo = es.TensorflowPredict(graphFilename=str(MODELS / f"discogs_{k}_embeddings-effnet-bs64-1.pb"),
                                        inputs=[node_in], outputs=[outs["embeddings"], outs["predictions"]])
            self.graphs[k] = (algo, node_in, outs["embeddings"], outs["predictions"])

    def patches(self, audio16k: np.ndarray) -> np.ndarray:
        """(n, 128, 96): the 2 s mel patches, one per second, that models.Models.run feeds effnet."""
        m = self.models
        mel = np.array([self.mel(f) for f in self.es.FrameGenerator(audio16k, frameSize=512, hopSize=256)])
        return np.stack([mel[i:i + m.EFFNET_PATCH] for i in range(0, len(mel) - m.EFFNET_PATCH + 1, m.EFFNET_HOP)])

    def plain_effnet(self, patches: np.ndarray) -> np.ndarray:
        return np.concatenate([self.plain(p[None]) for p in patches]).mean(axis=0)

    def run(self, patches: np.ndarray, kinds=None) -> tuple[dict, dict]:
        """({name: vector}, {name: (cpu_s, wall_s)}) for the given contrastive models."""
        from essentia import Pool

        out, timing, n = {}, {}, len(patches)
        for k in kinds or self.graphs:
            algo, node_in, emb, proj = self.graphs[k]
            cpu, wall = time.process_time(), time.perf_counter()
            sums = {emb: 0.0, proj: 0.0}
            for s in range(0, n, BATCH):
                chunk = patches[s:s + BATCH]
                m = len(chunk)
                if m < BATCH:  # fixed batch size: pad by repetition, keep the real outputs
                    chunk = np.resize(chunk, (BATCH, *chunk.shape[1:]))
                pool = Pool()
                pool.set(node_in, np.ascontiguousarray(chunk[:, None], dtype=np.float32))
                res = algo(pool)
                for node in sums:
                    sums[node] = sums[node] + res[node].reshape(BATCH, -1)[:m].sum(axis=0)
            out[f"{k}_1280"] = sums[emb] / n
            if f"{k}_512" in TIER1:
                out[f"{k}_512"] = sums[proj] / n
            timing[f"{k}_1280"] = (time.process_time() - cpu, time.perf_counter() - wall)
        return out, timing


# --- tier 2: the torch server --------------------------------------------------------------------

class TorchServer:
    """bakeoff_torch.py behind two pipes. `submit` blocks while 2 clips are queued (back-pressure);
    results come back through `results()`. If the process dies, the clips in flight are reported as
    failed and the server is restarted."""

    def __init__(self, names: list[str], device: str, threads: int):
        self.names, self.device, self.threads = names, device, threads
        self.done = queue.Queue()
        self.inflight, self.lock = {}, threading.Lock()
        self.start()

    def start(self) -> None:
        self.log = open(CACHE / "bakeoff_torch.log", "ab")
        self.p = subprocess.Popen([str(TORCH_PY), str(HERE / "bakeoff_torch.py"), "--models", ",".join(self.names),
                                   "--device", self.device, "--threads", str(self.threads)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log)
        ready = self.p.stdout.readline()
        if not ready:
            raise RuntimeError("torch server failed to start: see cache/bakeoff_torch.log")
        self.info = json.loads(ready)
        self.slots = threading.Semaphore(3)
        threading.Thread(target=self.reader, args=(self.p,), daemon=True).start()

    def reader(self, p) -> None:
        while line := p.stdout.readline():
            head = json.loads(line)
            embs = {name: np.frombuffer(p.stdout.read(n), "<f4") for name, n in head["embs"]}
            self.done.put((tuple(head["key"]), embs, head))
            with self.lock:
                self.inflight.pop(tuple(head["key"]), None)
            self.slots.release()
        with self.lock:  # EOF: the server is gone
            lost, self.inflight = list(self.inflight), {}
        for key in lost:
            self.done.put((key, {}, {"error": "torch server died", "timing": {}, "rss": 0, "mps": 0}))
        self.done.put(("dead", {}, {}))

    def submit(self, key: tuple, audio: np.ndarray, names: list[str]) -> None:
        self.slots.acquire()
        with self.lock:
            self.inflight[key] = True
        try:
            self.p.stdin.write(json.dumps({"key": key, "n": len(audio), "models": names}).encode() + b"\n")
            self.p.stdin.write(np.ascontiguousarray(audio, "<f4").tobytes())
            self.p.stdin.flush()
        except BrokenPipeError:
            pass  # the reader reports the loss

    def results(self, wait: bool = False):
        """Yield finished (key, embs, head); with wait=True, block until nothing is in flight."""
        while True:
            try:
                item = self.done.get(timeout=1.0 if wait else 0)
            except queue.Empty:
                if wait and (self.inflight or not self.done.empty()):
                    continue
                return
            if item[0] == "dead":
                if not self.closing:
                    self.p.wait()
                    print(f"torch server died (exit {self.p.returncode}); restarting", flush=True)
                    self.start()
                continue
            yield item

    closing = False

    def close(self) -> None:
        self.closing = True
        try:
            self.p.stdin.close()
            self.p.wait(timeout=60)
        except Exception:
            self.p.kill()


# --- audio in ------------------------------------------------------------------------------------

class Source:
    """Fresh URL -> bytes -> 44.1 kHz mono, reusing extract.py's download and temp-file decode."""

    def __init__(self, tmp: str | None = None):
        import essentia.standard as es
        import requests

        import extract

        self.extract, self.tmp = extract, tmp or tempfile.mkdtemp(prefix="rmr-bakeoff-")
        extract.WORKER.update(tmp=self.tmp, es=es, session=requests.Session(), mixer=es.MonoMixer())
        self.deezer, self.pool = extract.Deezer(), ThreadPoolExecutor(1)

    def fetch(self, rec: dict):
        """Resolve the URL now (Deezer URLs expire after 15 min) and download in the background."""
        if rec["source"] == "deezer":
            self.deezer.refresh([rec])
        if rec["status"] or not rec["url"]:
            return None
        return self.pool.submit(self.extract.download, rec["url"])

    def decode(self, rec: dict, data: bytes) -> np.ndarray:
        _, mono = self.extract.decode(data, ".m4a" if rec["source"] == "itunes" else ".mp3")
        return mono

    def close(self) -> None:
        self.pool.shutdown(wait=False, cancel_futures=True)
        shutil.rmtree(self.tmp, ignore_errors=True)


def cached_effnet(keys: list[tuple]) -> dict:
    con = ro(FEATURES_DB)
    out = {k: np.frombuffer(con.execute("SELECT effnet FROM tracks WHERE row = ? AND track_idx = ?", k).fetchone()[0],
                            "<f2").astype(np.float32) for k in keys}
    con.close()
    return out


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2 ** 20  # macOS: bytes


# --- run -----------------------------------------------------------------------------------------

class Book:
    """The only writer of the bake-off DB, plus the progress line."""

    def __init__(self, db: Path, every: float):
        self.con = sqlite3.connect(db)
        self.con.execute("PRAGMA journal_mode=WAL")
        self.con.executescript(SCHEMA)
        self.every, self.status, self.cpu, self.peak = every, Counter(), Counter(), Counter()
        self.last_commit = time.monotonic()

    def begin(self, name: str, total: int) -> None:
        self.name, self.total, self.n = name, total, 0
        self.start = self.last_print = time.monotonic()

    def store(self, key, embs: dict, timing: dict) -> None:
        self.con.executemany("INSERT OR REPLACE INTO emb VALUES (?, ?, ?, ?, ?)",
                             [(*key, m, len(v), np.asarray(v).astype("<f2").tobytes()) for m, v in embs.items()])
        self.con.executemany("INSERT OR REPLACE INTO timing VALUES (?, ?, ?, ?, ?)",
                             [(*key, m, c, w) for m, (c, w) in timing.items()])
        for m, (c, _) in timing.items():
            self.cpu[m] += c
            self.cpu["n_" + m] += 1

    def fail(self, key, stage: str, error: str) -> None:
        self.status[stage] += 1
        self.con.execute("INSERT OR REPLACE INTO failures VALUES (?, ?, ?, ?, datetime('now'))",
                         (*key, stage, str(error)[:300]))

    def check(self, key, mine: np.ndarray) -> None:
        ref = cached_effnet([key])[key]
        diff, cos = float(np.abs(mine - ref).max()), float(mine @ ref / np.linalg.norm(mine) / np.linalg.norm(ref))
        self.con.execute("INSERT OR REPLACE INTO checks VALUES (?, ?, ?, ?)", (*key, diff, cos))
        self.status["checked"] += 1
        if cos < 0.999:
            print(f"CHECK MISMATCH row {key[0]} track {key[1]}: max abs {diff:.4f}, cos {cos:.5f}", flush=True)

    def tick(self, rec: dict) -> None:
        """One track of the current pass is finished (stored or failed)."""
        self.n += 1
        now = time.monotonic()
        if now - self.last_commit > 5:
            self.con.commit()
            self.last_commit = now
        if now - self.last_print > self.every or self.n == self.total:
            eta = (self.total - self.n) * (now - self.start) / self.n
            cpu = "  ".join(f"{m} {self.cpu[m] / self.cpu['n_' + m]:.2f}" for m in self.cpu if not m.startswith("n_"))
            print(f"[{time.strftime('%H:%M:%S')}] {self.name}: {self.n}/{self.total} tracks (prio {rec['prio']})  "
                  f"{self.n / (now - self.start):.2f}/s  ETA {int(eta // 3600)}h{int(eta % 3600 // 60):02d}m  "
                  f"{dict(self.status)}  cpu-s/clip: {cpu}  peak MB: {dict(self.peak)}", flush=True)
            self.last_print = now

    def saw(self, **mb) -> None:
        for k, v in mb.items():
            self.peak[k] = max(self.peak[k], int(v))


W = {}  # per-process state of a tier-1 worker


def t1_init(kinds: list[str], threads: int, tmp: str) -> None:
    os.environ["TF_NUM_INTRAOP_THREADS"], os.environ["TF_NUM_INTEROP_THREADS"] = str(threads), "1"
    os.environ["OMP_NUM_THREADS"] = str(threads)
    W.update(tier1=Tier1(kinds), source=Source(tmp))


def t1_process(rec: dict, check: bool) -> dict:
    """Download, decode and embed one track in a worker; the audio never leaves this function."""
    out = {"embs": {}, "timing": {}, "fail": None, "check": None, "pid": os.getpid()}
    src, tier1 = W["source"], W["tier1"]
    try:
        data, _ = src.extract.download(rec["url"])
        stage = "decode"
        mono = src.decode(rec, data)
        del data
        if len(mono) < 5 * 44100:
            out["fail"] = ("too_short", f"{len(mono) / 44100:.1f} s")
            return out
        stage = "tier1"
        patches = tier1.patches(tier1.to16k(mono))
        out["embs"], out["timing"] = tier1.run(patches, rec["kinds"])
        if not all(np.isfinite(v).all() for v in out["embs"].values()):
            raise ValueError("non-finite embedding")
        if check:
            out["check"] = tier1.plain_effnet(patches)
    except IOError as e:
        out["fail"] = ("download", str(e))
    except Exception as e:  # Essentia raises RuntimeError; any failure of a stage means the same
        out["embs"], out["fail"] = {}, (stage, f"{type(e).__name__}: {e}")
    out["rss"] = rss_mb()
    return out


def run_tier1(args, tasks: list[dict], kinds: list[str], book: Book) -> None:
    """Pass 1: the Essentia graphs in --workers processes; this process only hands out fresh URLs
    and writes results."""
    import extract

    spawn, tmp = multiprocessing.get_context("spawn"), tempfile.mkdtemp(prefix="rmr-bakeoff-")
    new_pool = lambda: ProcessPoolExecutor(args.workers, mp_context=spawn, initializer=t1_init,  # noqa: E731
                                           initargs=(kinds, args.threads, tmp))
    deezer, pool, inflight, queue_, n_sub, rss = extract.Deezer(), new_pool(), {}, iter(tasks), 0, {}
    book.begin("tier1", len(tasks))
    try:
        while True:
            while len(inflight) < 2 * args.workers and (rec := next(queue_, None)):
                if rec["source"] == "deezer":
                    deezer.refresh([rec])
                if rec["status"] or not rec["url"]:
                    book.fail((rec["row"], rec["track_idx"]), "download", rec["status"] or "no preview url")
                    book.tick(rec)
                    continue
                n_sub += 1
                check = bool(args.check_every) and (n_sub <= 5 or n_sub % args.check_every == 0)
                inflight[pool.submit(t1_process, rec, check)] = rec
            if not inflight:
                break
            done, _ = wait(inflight, return_when=FIRST_COMPLETED)
            broken = False
            for fut in done:
                rec = inflight.pop(fut)
                key = (rec["row"], rec["track_idx"])
                try:
                    res = fut.result()
                except BrokenProcessPool:
                    broken = True
                    book.fail(key, "crashed", "worker process died")
                    book.tick(rec)
                    continue
                book.store(key, res["embs"], res["timing"])
                if res["fail"]:
                    book.fail(key, *res["fail"])
                else:
                    book.status["ok"] += 1
                if res["check"] is not None:
                    book.check(key, res["check"])
                rss[res["pid"]] = res["rss"]
                book.saw(workers_rss_sum=sum(rss.values()))
                book.tick(rec)
            if broken:  # every future still in flight died with the pool
                for rec in inflight.values():
                    book.fail((rec["row"], rec["track_idx"]), "crashed", "worker process died")
                    book.tick(rec)
                inflight.clear()
                print("worker died; pool rebuilt (rerun with --retry-failed to redo the lost tracks)", flush=True)
                pool.shutdown(wait=False)
                pool = new_pool()
    finally:
        book.con.commit()
        pool.shutdown(wait=True, cancel_futures=True)
        shutil.rmtree(tmp, ignore_errors=True)


def run_torch(args, tasks: list[dict], names: list[str], book: Book) -> None:
    """Pass 2: the torch models in one server process; this process downloads and decodes."""
    server = TorchServer(names, args.device, args.threads)
    print(f"torch server ready: {server.info}", flush=True)
    source = Source()
    by_key = {(rec["row"], rec["track_idx"]): rec for rec in tasks}
    book.begin("torch", len(tasks))

    def drain(wait: bool = False) -> None:
        for key, embs, head in server.results(wait):
            book.store(key, embs, head["timing"])
            book.saw(torch_rss=head["rss"] / 2 ** 20, mps=head["mps"] / 2 ** 20)
            if head["error"]:
                book.fail(key, "torch", head["error"])
            else:
                book.status["ok"] += 1
            book.tick(by_key[key])

    ahead, queue_ = deque(), iter(tasks)
    try:
        while True:
            while len(ahead) < 3 and (rec := next(queue_, None)):
                ahead.append((rec, source.fetch(rec)))
            if not ahead:
                break
            rec, pending = ahead.popleft()
            key, stage = (rec["row"], rec["track_idx"]), "download"
            try:
                if pending is None:
                    raise IOError(rec["status"] or "no preview url")
                data, _ = pending.result()
                stage = "decode"
                mono = source.decode(rec, data)
                del data
                if len(mono) < 5 * 44100:
                    stage = "too_short"
                    raise ValueError(f"{len(mono) / 44100:.1f} s")
            except Exception as e:
                book.fail(key, stage, str(e))
                book.tick(rec)
                continue
            server.submit(key, mono, rec["torch"])
            drain()
        drain(wait=True)
    finally:
        book.con.commit()
        server.close()
        source.close()
        book.saw(main_rss=rss_mb())


def run(args) -> None:
    rows = pool_rows()[:args.limit_albums]
    wanted = args.models.split(",") if args.models else DEFAULT_RUN
    unknown = set(wanted) - set(TIER1) - set(TORCH)
    if unknown:
        sys.exit(f"unknown models {sorted(unknown)}; choose from {TIER1 + list(TORCH)}")
    book = Book(args.db, args.progress_secs)
    if args.retry_failed:
        book.con.execute("DELETE FROM failures")
    done = set(book.con.execute("SELECT row, track_idx, model FROM emb"))
    failed = set(book.con.execute("SELECT row, track_idx FROM failures"))
    tasks, have = [], Counter()
    for rec in plan(rows, args.tracks):
        key = (rec["row"], rec["track_idx"])
        missing = [m for m in wanted if (*key, m) not in done]
        rec["kinds"] = [k for k in CONTRASTIVE if any(m.startswith(k + "_") for m in missing)]
        rec["torch"] = [m for m in TORCH if m in missing]
        if missing and key not in failed:
            tasks.append(rec)
        have[rec["prio"]] += not missing
    t1_tasks, torch_tasks = [r for r in tasks if r["kinds"]], [r for r in tasks if r["torch"]]
    print(f"== bakeoff run {time.strftime('%F %T')}: {len(rows)} albums x {args.tracks} tracks, models {wanted}; "
          f"to do: {len(t1_tasks)} tracks tier-1 ({args.workers} workers x {args.threads} threads), {len(torch_tasks)} "
          f"tracks torch ({args.device}); complete per prio {dict(have)}; {len(failed)} failed before", flush=True)
    start = time.monotonic()
    try:
        if t1_tasks:
            ensure_models()
            run_tier1(args, t1_tasks, sorted({k for r in t1_tasks for k in r["kinds"]}, key=CONTRASTIVE.index), book)
        if torch_tasks:  # only after the workers are gone: never two heavy things at once
            run_torch(args, torch_tasks, sorted({m for r in torch_tasks for m in r["torch"]}), book)
    finally:
        book.con.commit()
        n_fail = book.con.execute("SELECT stage, COUNT(*) FROM failures GROUP BY stage").fetchall()
        book.con.close()
    print(f"done in {(time.monotonic() - start) / 60:.1f} min: {dict(book.status)}; failures on record: {n_fail}; "
          f"peak MB {dict(book.peak)}", flush=True)
    print("BAKEOFF COMPLETE", flush=True)


# --- benchmark -----------------------------------------------------------------------------------

def bench(args) -> None:
    """Cost of every candidate on --n clips (prio 0 of the first albums of the fixed order), one
    process at a time: the Essentia graphs here, then each torch model through the server."""
    os.environ["TF_NUM_INTRAOP_THREADS"], os.environ["TF_NUM_INTEROP_THREADS"] = str(args.threads), "1"
    os.environ["OMP_NUM_THREADS"] = str(args.threads)
    rows = eligible_rows()[:args.n]
    source = Source()
    clips = []
    for rec in plan(rows, 1):
        pending = source.fetch(rec)
        if pending is not None:
            clips.append((rec, source.decode(rec, pending.result()[0])))
    source.close()
    print(f"{len(clips)} clips in memory, {np.mean([len(c) for _, c in clips]) / 44100:.1f} s each on average; "
          f"threads {args.threads}, device {args.device}")
    names = args.models.split(",") if args.models else ["tier1"] + list(TORCH)
    if "tier1" in names:
        ensure_models()
        base = rss_mb()
        tier1 = Tier1()
        ref = cached_effnet([(r["row"], r["track_idx"]) for r, _ in clips])
        t = {k: [] for k in ("mel", "plain_effnet", *CONTRASTIVE)}
        worst = 0.0
        for rec, mono in clips:
            cpu, wall = time.process_time(), time.perf_counter()
            patches = tier1.patches(tier1.to16k(mono))
            t["mel"].append((time.process_time() - cpu, time.perf_counter() - wall))
            cpu, wall = time.process_time(), time.perf_counter()
            mine = tier1.plain_effnet(patches)
            t["plain_effnet"].append((time.process_time() - cpu, time.perf_counter() - wall))
            worst = max(worst, float(np.abs(mine - ref[rec["row"], rec["track_idx"]]).max()))
            _, timing = tier1.run(patches)
            for k in CONTRASTIVE:
                t[k].append(timing[f"{k}_1280"])
        for k, v in t.items():
            c, w = np.mean(v[1:], axis=0)  # the first clip pays the graph warm-up
            print(f"  {k:14s} cpu {c:.3f} s  wall {w:.3f} s per clip")
        print(f"  tier-1 process peak RSS {rss_mb():.0f} MB (was {base:.0f} MB before the graphs); "
              f"plain effnet vs cache: worst max-abs diff {worst:.4f}")
    for name in [n for n in names if n in TORCH]:
        server = TorchServer([name], args.device, args.threads)
        print(f"  {name}: loaded in {server.info['load_s']} s, RSS after load {server.info['rss'] / 2 ** 20:.0f} MB")
        t, heads = [], []
        for rec, mono in clips:
            server.submit((rec["row"], rec["track_idx"]), mono, [name])
            for _, embs, head in server.results(wait=True):
                if head["error"]:
                    print("   error:", head["error"])
                t.append(head["timing"][name])
                heads.append(head)
        server.close()
        c, w = np.mean(t[1:], axis=0)
        print(f"  {name:14s} cpu {c:.3f} s  wall {w:.3f} s per clip (first clip {t[0]}); peak RSS "
              f"{max(h['rss'] for h in heads) / 2 ** 20:.0f} MB, MPS driver {max(h['mps'] for h in heads) / 2 ** 20:.0f} MB")


# --- loading -------------------------------------------------------------------------------------

def stored_models(db: Path = BAKEOFF_DB) -> list[str]:
    con = ro(db)
    out = [m for m, in con.execute("SELECT DISTINCT model FROM emb")]
    con.close()
    return out


def complete_tracks(prio_below: int | None = None, models: list[str] | None = None, db: Path = BAKEOFF_DB):
    """Sorted [(row, track_idx, prio)] of the tracks that have every one of `models` (default: every
    model stored in the bake-off DB), optionally only those with prio < prio_below."""
    models = models or stored_models(db)
    con = ro(db)
    marks = ",".join("?" * len(models))
    keys = con.execute(f"SELECT row, track_idx FROM emb WHERE model IN ({marks}) GROUP BY row, track_idx "
                       "HAVING COUNT(*) = ?", (*models, len(models))).fetchall()
    con.close()
    con = ro(FEATURES_DB)
    prio = dict(((r, i), p) for r, i, p in con.execute("SELECT row, track_idx, prio FROM tracks WHERE status = 'ok'"))
    con.close()
    return sorted((r, i, prio[r, i]) for r, i in keys if prio_below is None or prio[r, i] < prio_below)


def track_embeddings(model: str, prio_below: int | None = None, models: list[str] | None = None,
                     db: Path = BAKEOFF_DB) -> tuple[np.ndarray, np.ndarray]:
    """(keys (n, 3) int: row, track_idx, prio; X (n, dim) float32): per-track embeddings of one model
    over complete_tracks(). `model` is a stored name, a MERT view, or the cached `effnet` / `musicnn`."""
    keys = complete_tracks(prio_below, models, db)
    want = {(r, i) for r, i, _ in keys}
    if model in CACHED:
        con = ro(FEATURES_DB)
        vecs = {(r, i): b for r, i, b in con.execute(f"SELECT row, track_idx, {model} FROM tracks WHERE status = 'ok'")
                if (r, i) in want}
    else:
        con = ro(db)
        stored = "mert" if model in MERT_VIEWS else model
        vecs = {(r, i): b for r, i, b in con.execute("SELECT row, track_idx, vec FROM emb WHERE model = ?", (stored,))
                if (r, i) in want}
    con.close()
    X = np.stack([np.frombuffer(vecs[r, i], "<f2").astype(np.float32) for r, i, _ in keys])
    if model in MERT_VIEWS:
        X = X.reshape(len(X), 13, 768)[:, list(MERT_VIEWS[model])].mean(axis=1)
    return np.array(keys), X


def bakeoff_load(model: str, prio_below: int | None = None, models: list[str] | None = None,
                 db: Path = BAKEOFF_DB) -> tuple[np.ndarray, np.ndarray]:
    """(rows, X): album-mean embeddings of `model` (raw mean over the album's tracks, float32, not
    centred or normalised: aggregate.py's convention), rows sorted. Every model, the cached `effnet`
    and `musicnn` included, is averaged over the same tracks: those for which all of `models`
    (default: everything stored) exist, with prio < prio_below if given."""
    keys, X = track_embeddings(model, prio_below, models, db)
    rows, inverse = np.unique(keys[:, 0], return_inverse=True)
    sums = np.zeros((len(rows), X.shape[1]), np.float64)
    np.add.at(sums, inverse, X)
    return rows, (sums / np.bincount(inverse)[:, None]).astype(np.float32)


def status() -> None:
    con = ro(BAKEOFF_DB)
    for m, n, a, d in con.execute("SELECT model, COUNT(*), COUNT(DISTINCT row), MAX(dim) FROM emb GROUP BY model"):
        print(f"  {m:14s} {n:6d} tracks {a:5d} albums  dim {d}")
    print("  failures:", con.execute("SELECT stage, COUNT(*) FROM failures GROUP BY stage").fetchall())
    print("  checks (n, worst max-abs, worst cos):",
          con.execute("SELECT COUNT(*), MAX(max_abs), MIN(cos) FROM checks").fetchone())
    print("  mean cpu-s / wall-s per clip:")
    for m, c, w in con.execute("SELECT model, AVG(cpu_s), AVG(wall_s) FROM timing GROUP BY model"):
        print(f"    {m:14s} {c:.3f}  {w:.3f}")
    con.close()
    keys = complete_tracks()
    print(f"  complete tracks: {len(keys)} over {len({k[0] for k in keys})} albums; per prio "
          f"{dict(Counter(k[2] for k in keys))}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample")
    s.add_argument("--albums", type=int, default=800)
    for name in ("bench", "run"):
        s = sub.add_parser(name)
        s.add_argument("--device", default="cpu", choices=["cpu", "mps"], help="for the torch models")
        s.add_argument("--threads", type=int, default=1, help="threads per process (TensorFlow intra-op, torch)")
        s.add_argument("--db", type=Path, default=BAKEOFF_DB)
        s.add_argument("--models", default=None)
        if name == "bench":
            s.add_argument("--n", type=int, default=20)
        else:
            s.add_argument("--tracks", type=int, default=2, help="tracks per album: those with prio < N")
            s.add_argument("--workers", type=int, default=2, help="Essentia worker processes of the tier-1 pass")
            s.add_argument("--limit-albums", type=int, default=None)
            s.add_argument("--retry-failed", action="store_true")
            s.add_argument("--check-every", type=int, default=40, help="recompute plain effnet every N tracks (0 = off)")
            s.add_argument("--progress-secs", type=float, default=120)
    sub.add_parser("status")
    args = p.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    {"sample": lambda: sample(args.albums), "bench": lambda: bench(args), "run": lambda: run(args),
     "status": status}[args.cmd]()


if __name__ == "__main__":
    main()
