"""Step 2: download each matched track's 30-second preview, analyse it with Essentia, keep the
numbers and throw the audio away.

CLI: python extract.py [--workers 8] [--no-maest] [--max-tracks-per-album N] [--pass-size 4]
                       [--rows a,b,c] [--limit-albums K] [--retry-failed] [--threads 1]

Reads cache/match.sqlite (albums + tracks, written by match.py) and writes one row per
(row, track_idx) to cache/features.sqlite:

  tracks(row, track_idx, prio, status, error, source, track_id, duration_s, clip_s,
         scalars, timing, effnet, musicnn, maest, updated_at)

  status   ok | no_preview | download_failed | decode_failed | too_short | analysis_failed | crashed
  prio     the track's rank in its album's processing order (see priority_order); 0 = first track
  duration_s  the full track's length from the catalog API; clip_s the analysed preview's length
  scalars  JSON: bpm, bpm_confidence, key (0-11, C=0), mode (1 = major), key_strength,
           loudness_lufs, loudness_range, rms, dynamic_complexity, onset_rate, zcr,
           spectral_centroid / _rolloff / _flatness, dfa_danceability, and every head in models.py
  timing   JSON: seconds per stage (download, decode, dsp, effnet, heads, musicnn, maest)
  effnet / musicnn / maest   float16 little-endian BLOBs of 1280 / 200 / 768 values

Order is breadth-first: pass 1 takes the first --pass-size tracks of every album in priority
order (track 0, then tracks spread evenly through the album), pass 2 the next ones, and so on, so
an interrupted run has already covered every album. Rows with status ok or no_preview are never
redone; the other statuses are redone only with --retry-failed.

No audio is kept: a preview lives in memory and, while Essentia decodes it, in a temp file inside
a per-run temp directory that is deleted on exit. Deezer preview URLs are signed and expire, so
each album's track list is fetched again right before its previews are downloaded.

The parent process is the only writer; workers hold the models and return plain dicts. A worker
that dies (a segfault in one clip) breaks the pool: the pool is rebuilt and the tasks that were in
flight are replayed one track at a time, so only the offending track ends up 'crashed'.
"""
import argparse
import json
import multiprocessing
import os
import resource
import shutil
import sqlite3
import sys
import tempfile
import time
from collections import Counter, defaultdict
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, ThreadPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool

import numpy as np
import requests

import models
from common import FEATURES_DB, MATCH_DB

SCHEMA = """CREATE TABLE IF NOT EXISTS tracks(row INTEGER, track_idx INTEGER, prio INTEGER,
    status TEXT, error TEXT, source TEXT, track_id TEXT, duration_s REAL, clip_s REAL, scalars TEXT,
    timing TEXT, effnet BLOB, musicnn BLOB, maest BLOB, updated_at TEXT, PRIMARY KEY(row, track_idx))"""
COLS = ("row", "track_idx", "prio", "status", "error", "source", "track_id", "duration_s", "clip_s",
        "scalars", "timing", "effnet", "musicnn", "maest")
DONE = ("ok", "no_preview")
SR = 44100
KEYS = {k: i for i, names in enumerate(["C", "C# Db", "D", "D# Eb", "E", "F", "F# Gb", "G", "G# Ab",
                                        "A", "A# Bb", "B"]) for k in names.split()}
DEEZER_TRACKS = "https://api.deezer.com/album/{}/tracks?limit=200"
API_INTERVAL = 0.15  # seconds between Deezer API calls: under 7 requests a second
WORKER = {}  # per-process state: models, DSP algorithms, HTTP session, download thread


def priority_order(n: int) -> list[int]:
    """Positions 0..n-1 ordered so that every prefix is spread evenly through the album: the
    first track, then the middle, then the quarters, and so on (bit-reversal order)."""
    bits = max(1, (n - 1).bit_length())
    return list(dict.fromkeys(int(f"{i:0{bits}b}"[::-1], 2) * n >> bits for i in range(1 << bits)))


# --- worker side -------------------------------------------------------------------------------

def init_worker(maest: bool, tmp: str) -> None:
    """Load every model and algorithm once per worker process."""
    import essentia
    import essentia.standard as es

    essentia.log.infoActive = essentia.log.warningActive = False
    WORKER.update(
        tmp=tmp, es=es, models=models.Models(maest), session=requests.Session(),
        downloads=ThreadPoolExecutor(1),  # one download at a time per worker, ahead of the analysis
        rhythm=es.RhythmExtractor2013(method="multifeature"), key=es.KeyExtractor(profileType="temperley"),
        loudness=es.LoudnessEBUR128(sampleRate=SR), dfa=es.Danceability(sampleRate=SR),
        dynamic=es.DynamicComplexity(sampleRate=SR), mixer=es.MonoMixer(),
        to16k=es.Resample(inputSampleRate=SR, outputSampleRate=16000, quality=4))


def download(url: str) -> tuple[bytes, float]:
    """(preview bytes, seconds taken). Three attempts with backoff; 4xx is not retried."""
    t = time.perf_counter()
    for attempt in range(3):
        try:
            r = WORKER["session"].get(url, timeout=(10, 30))
            if r.status_code < 400 and len(r.content) > 1000:
                return r.content, time.perf_counter() - t
            error = f"HTTP {r.status_code}, {len(r.content)} bytes"
            if 400 <= r.status_code < 500:
                break
        except requests.RequestException as e:
            error = type(e).__name__
        time.sleep(1.5 * (attempt + 1))
    raise IOError(error)


def decode(data: bytes, suffix: str) -> tuple[np.ndarray, np.ndarray]:
    """(stereo, mono) at 44.1 kHz. Essentia's loader needs a path, so the bytes touch disk only
    for the length of the decode."""
    es = WORKER["es"]
    fd, path = tempfile.mkstemp(suffix=suffix, dir=WORKER["tmp"])
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        stereo, sr, channels, *_ = es.AudioLoader(filename=path)()
    finally:
        os.unlink(path)
    if sr != SR:
        resample = es.Resample(inputSampleRate=sr, outputSampleRate=SR)
        stereo = np.stack([resample(np.ascontiguousarray(stereo[:, c])) for c in (0, 1)], axis=1)
    return stereo, WORKER["mixer"](stereo, int(channels))


def spectral(mono: np.ndarray) -> dict:
    """Frame means of the magnitude spectrum's centroid and 85% roll-off (Hz) and its flatness,
    over non-silent frames."""
    from scipy.signal import stft

    freqs, _, z = stft(mono, SR, nperseg=2048, noverlap=1024, boundary=None, padded=False)
    mag = np.abs(z).T
    mag = mag[mag.sum(axis=1) > 1e-4] + 1e-10
    if not len(mag):
        return {}
    cumulative = np.cumsum(mag, axis=1)
    return {"spectral_centroid": float(((mag @ freqs) / mag.sum(axis=1)).mean()),
            "spectral_rolloff": float(freqs[(cumulative >= 0.85 * cumulative[:, -1:]).argmax(axis=1)].mean()),
            "spectral_flatness": float((np.exp(np.log(mag).mean(axis=1)) / mag.mean(axis=1)).mean())}


def dsp(stereo: np.ndarray, mono: np.ndarray) -> dict:
    """Tempo, key, loudness and a few cheap descriptors from the 44.1 kHz signal. OnsetRate is
    built per call: a reused instance returns 0 from its second clip on."""
    w = WORKER
    bpm, _, confidence, _, _ = w["rhythm"](mono)
    key, scale, strength = w["key"](mono)
    _, _, lufs, loudness_range = w["loudness"](stereo)
    return {"bpm": bpm, "bpm_confidence": confidence, "key": KEYS[key], "mode": int(scale == "major"),
            "key_strength": strength, "loudness_lufs": lufs, "loudness_range": loudness_range,
            "rms": float(np.sqrt(np.mean(mono ** 2))), "dynamic_complexity": w["dynamic"](mono)[0],
            "onset_rate": w["es"].OnsetRate()(mono)[1], "dfa_danceability": w["dfa"](mono)[0],
            "zcr": float(np.mean(np.signbit(mono[1:]) != np.signbit(mono[:-1]))), **spectral(mono)}


def analyse(rec: dict, pending) -> None:
    """Fill `rec` (status, scalars, embeddings, timing) from one downloaded preview."""
    timing = {}
    try:
        data, timing["download"] = pending.result()
    except IOError as e:
        rec.update(status="download_failed", error=str(e))
        return
    t = time.perf_counter()
    try:
        stereo, mono = decode(data, ".m4a" if rec["source"] == "itunes" else ".mp3")
    except Exception as e:  # Essentia raises RuntimeError, but any decode failure means the same
        rec.update(status="decode_failed", error=str(e)[:300])
        return
    del data
    audio = WORKER["to16k"](mono)
    rec["clip_s"] = len(mono) / SR
    if len(audio) < models.MIN_SAMPLES:
        rec.update(status="too_short", error=f"{rec['clip_s']:.1f} s")
        return
    timing["decode"] = time.perf_counter() - t
    try:
        t = time.perf_counter()
        scalars = dsp(stereo, mono)
        timing["dsp"] = time.perf_counter() - t
        heads, emb, model_timing = WORKER["models"].run(audio)
    except Exception as e:
        rec.update(status="analysis_failed", error=f"{type(e).__name__}: {e}"[:300])
        return
    scalars = {k: float(f"{v:.6g}") for k, v in {**scalars, **heads}.items()}
    timing = {k: round(v, 4) for k, v in {**timing, **model_timing}.items()}
    rec.update(status="ok", scalars=json.dumps(scalars), timing=json.dumps(timing),
               **{k: v.astype("<f2").tobytes() for k, v in emb.items()})


def process(task: list[dict]) -> dict:
    """Analyse the tracks of one task (a few tracks of one album). Downloads run one at a time
    on a background thread, so the next preview is usually in memory when the analysis gets to it."""
    pending = [WORKER["downloads"].submit(download, rec["url"]) for rec in task]
    for rec, p in zip(task, pending):
        analyse(rec, p)
    return {"pid": os.getpid(), "rss": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "tracks": task}


# --- parent side -------------------------------------------------------------------------------

def blank(row: int, track_idx: int, source: str, track_id: str, duration_s: float, **kw) -> dict:
    """A features row with nothing analysed yet."""
    return {**dict.fromkeys(COLS), "row": row, "track_idx": track_idx, "source": source,
            "track_id": track_id, "duration_s": duration_s, **kw}


def plan(args, con: sqlite3.Connection) -> tuple[list[dict], list[list[dict]]]:
    """(no_preview rows to record straight away, tasks in breadth-first order). A task is the
    pending tracks of one album within one pass; Deezer tasks get their URLs later, in `refresh`."""
    match = sqlite3.connect(f"file:{args.match_db}?mode=ro", uri=True)
    albums = match.execute("SELECT row, source, source_album_id FROM albums WHERE status = 'matched' "
                           "ORDER BY row").fetchall()
    if args.rows:
        albums = [a for a in albums if a[0] in args.rows]
    albums = albums[:args.limit_albums]
    tracks = defaultdict(list)
    for row, *rest in match.execute("SELECT row, track_idx, track_id, duration_s, preview_url "
                                    "FROM tracks ORDER BY row, track_idx"):
        tracks[row].append(rest)
    match.close()
    statuses = {(r, i): s for r, i, s in con.execute("SELECT row, track_idx, status FROM tracks")}
    skip = lambda key: key in statuses and (statuses[key] in DONE or not args.retry_failed)  # noqa: E731

    missing, passes = [], defaultdict(list)
    for row, source, album_id in albums:
        missing += [blank(row, i, source, tid, dur, status="no_preview")
                    for i, tid, dur, url in tracks[row] if not url and (row, i) not in statuses]
        playable = [t for t in tracks[row] if t[3]]
        order = priority_order(len(playable))[:args.max_tracks_per_album]
        for start in range(0, len(order), args.pass_size):
            task = [blank(row, i, source, tid, dur, prio=prio, url=url, album_id=album_id)
                    for prio in range(start, min(start + args.pass_size, len(order)))
                    for i, tid, dur, url in [playable[order[prio]]] if not skip((row, i))]
            if task:
                passes[start].append(task)
    return missing, [task for start in sorted(passes) for task in passes[start]]


class Deezer:
    """Fresh preview URLs for an album, one rate-limited API call each."""

    def __init__(self):
        self.session, self.last = requests.Session(), 0.0

    def get(self, url: str) -> dict:
        """One API page. Deezer signals its quota with HTTP 200 and error code 4: wait, retry."""
        for attempt in range(6):
            time.sleep(max(0.0, self.last + API_INTERVAL - time.monotonic()))
            self.last = time.monotonic()
            try:
                body = self.session.get(url, timeout=15).json()
            except (requests.RequestException, ValueError) as e:
                body = {"error": {"code": -1, "message": type(e).__name__}}
            if "error" not in body:
                return body
            if body["error"].get("code") not in (4, -1, 700):  # quota, network, service busy
                break
            time.sleep(2 * (attempt + 1))
        raise IOError(f"deezer: {body['error']}")

    def refresh(self, task: list[dict]) -> list[dict]:
        """The task with fresh URLs; tracks that cannot get one come back with a final status."""
        try:
            page, previews = self.get(DEEZER_TRACKS.format(task[0]["album_id"])), {}
            while True:
                previews.update((str(t["id"]), t.get("preview")) for t in page["data"])
                if not page.get("next"):
                    break
                page = self.get(page["next"])
        except IOError as e:
            return [dict(rec, status="download_failed", error=str(e)[:300]) for rec in task]
        for rec in task:
            rec["url"] = previews.get(rec["track_id"])
            if not rec["url"]:
                rec["status"] = "no_preview"
        return task


class Progress:
    """Counts, throughput and ETA, printed every `every` seconds; also gathers the run summary."""

    def __init__(self, total: int, every: float):
        self.total, self.every = total, every
        self.start = self.last = time.monotonic()
        self.n = self.n_last = 0
        self.status, self.rss, self.stages = Counter(), {}, defaultdict(list)

    def add(self, rec: dict) -> None:
        self.n += 1
        self.status[rec["status"]] += 1
        for stage, s in json.loads(rec["timing"] or "{}").items():
            self.stages[stage].append(s)
        now = time.monotonic()
        if now - self.last >= self.every or self.n == self.total:
            rate = self.n / (now - self.start)
            eta = (self.total - self.n) / rate
            print(f"[{time.strftime('%H:%M:%S')}] {self.n}/{self.total} tracks  "
                  f"{rate:.2f}/s (last {(self.n - self.n_last) / max(now - self.last, 1.0):.2f}/s)  "
                  f"ETA {int(eta // 3600)}h{int(eta % 3600 // 60):02d}m  {dict(self.status)}", flush=True)
            self.last, self.n_last = now, self.n

    def summary(self) -> None:
        elapsed = time.monotonic() - self.start
        print(f"done: {self.n} tracks in {elapsed:.0f} s = {self.n / max(elapsed, 1e-9):.2f}/s  {dict(self.status)}")
        if self.stages:
            print("mean s/track: " + "  ".join(f"{k} {np.mean(v):.3f}" for k, v in self.stages.items())
                  + f"  | sum {sum(np.mean(v) for v in self.stages.values()):.3f}")
        if self.rss:
            mb = np.array(list(self.rss.values())) / 2 ** 20  # macOS reports ru_maxrss in bytes
            print(f"peak RSS per worker: mean {mb.mean():.0f} MB, max {mb.max():.0f} MB ({len(mb)} workers)")


def run(args) -> None:
    """Feed tasks to the pool, write results as they come back, rebuild the pool if it breaks."""
    args.db.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(args.db)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute(SCHEMA)
    insert = (f"INSERT OR REPLACE INTO tracks({', '.join(COLS)}, updated_at) "
              f"VALUES ({', '.join(':' + c for c in COLS)}, datetime('now'))")
    missing, tasks = plan(args, con)
    con.executemany(insert, missing)
    con.commit()
    progress = Progress(sum(len(t) for t in tasks), args.progress_secs)
    print(f"{progress.total} tracks to analyse in {len(tasks)} tasks, {args.workers} workers, "
          f"maest {'on' if args.maest else 'off'}; {len(missing)} tracks without a preview recorded", flush=True)
    if not tasks:
        return
    models.ensure(args.maest)
    if args.threads:  # TensorFlow reads these when the first session is created in each worker
        os.environ["TF_NUM_INTRAOP_THREADS"], os.environ["TF_NUM_INTEROP_THREADS"] = str(args.threads), "1"
    tmp = tempfile.mkdtemp(prefix="rmr-previews-")
    spawn = multiprocessing.get_context("spawn")
    new_pool = lambda n: ProcessPoolExecutor(n, mp_context=spawn, initializer=init_worker,  # noqa: E731
                                             initargs=(args.maest, tmp))
    deezer, queue, inflight, last_commit = Deezer(), iter(tasks), {}, time.monotonic()

    def store(recs: list[dict]) -> None:
        con.executemany(insert, recs)
        for rec in recs:
            progress.add(rec)

    def submit(pool, task: list[dict]) -> None:
        """Hand the task's downloadable tracks to the pool; record the rest right away."""
        if task[0]["source"] == "deezer":
            task = deezer.refresh(task)
        store([rec for rec in task if rec["status"]])
        task = [rec for rec in task if not rec["status"]]
        if task:
            inflight[pool.submit(process, task)] = task

    def collect(fut) -> None:
        result = fut.result()
        progress.rss[result["pid"]] = result["rss"]
        store(result["tracks"])

    pool = new_pool(args.workers)
    try:
        while True:
            while len(inflight) < 2 * args.workers and (task := next(queue, None)):
                submit(pool, task)
            if not inflight:
                break
            done, _ = wait(inflight, return_when=FIRST_COMPLETED)
            broken = False
            for fut in done:
                try:
                    collect(fut)
                    del inflight[fut]
                except BrokenProcessPool:
                    broken = True
            if broken:  # a worker died: every future still in flight is lost with it
                replay = [[rec] for task in inflight.values() for rec in task]
                inflight.clear()
                print(f"worker died; replaying {len(replay)} tracks one at a time", flush=True)
                pool.shutdown(wait=False)
                pool = new_pool(1)
                for single in replay:
                    submit(pool, single)
                    for fut in list(inflight):
                        try:
                            collect(fut)
                        except BrokenProcessPool:
                            store([dict(single[0], status="crashed", error="worker process died")])
                            pool = new_pool(1)
                        del inflight[fut]
                pool.shutdown()
                pool = new_pool(args.workers)
            if time.monotonic() - last_commit > 5:
                con.commit()
                last_commit = time.monotonic()
    finally:
        con.commit()
        con.close()
        pool.shutdown(wait=False, cancel_futures=True)
        shutil.rmtree(tmp, ignore_errors=True)
        progress.summary()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--workers", type=int, default=8, help="worker processes (also the number of concurrent downloads)")
    p.add_argument("--no-maest", dest="maest", action="store_false", help="skip the MAEST embedding")
    p.add_argument("--max-tracks-per-album", type=int, default=None, help="analyse at most N tracks per album (default: all)")
    p.add_argument("--pass-size", type=int, default=4, help="tracks per album taken in each breadth-first pass")
    p.add_argument("--rows", type=lambda s: {int(r) for r in s.split(",")}, help="only these album rows")
    p.add_argument("--limit-albums", type=int, default=None, help="only the first K matched albums")
    p.add_argument("--retry-failed", action="store_true", help="redo tracks whose status is neither ok nor no_preview")
    p.add_argument("--threads", type=int, default=1, help="TensorFlow intra-op threads per worker (0 = TensorFlow's default)")
    p.add_argument("--progress-secs", type=float, default=30)
    p.add_argument("--db", type=type(FEATURES_DB), default=FEATURES_DB)
    p.add_argument("--match-db", type=type(MATCH_DB), default=MATCH_DB)
    args = p.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    run(args)


if __name__ == "__main__":
    main()
