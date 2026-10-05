"""CLAP embeddings for the catalog's preview clips: the clips the pipeline's clip cache already holds an
EffNet embedding for, fetched again and embedded with laion/larger_clap_music_and_speech, the bake-off's
`clap_music` recipe (bakeoff_torch.py).

  <torch python> clap_catalog.py run [--clips 4] [--limit-albums N] [--keys k1,k2] [--retry-failed]
  <torch python> clap_catalog.py status [--clips 4]

Runs in the torch environment (.venv-torch: torch, transformers, scipy, requests; no Essentia, no pandas).
Meant to be started under `nice -n 19`; it also lowers its own priority.

What it reads   the pipeline's clip cache (clips.sqlite; --source or RMR_CLIPS_DB), opened read-only:
                every row with status ok and prio < --clips. `source = local` rows are skipped (a local
                file cannot be fetched again).
What it writes  cache_clap/clap_clips.sqlite (gitignored), and nothing else:
                  clap_clips(key, source, album_id, track_id, track_idx, prio, status, error, clip_s, emb, updated_at)
                  PRIMARY KEY(key, source, album_id, track_id), as in the source
                  status  ok | no_preview | download_failed | decode_failed | too_short | embed_failed
                  emb     512 float32 little-endian
                Committed every few clips. A row that is there is not done again; a failed one only with
                --retry-failed. An album whose listing could not be fetched (network, quota) is not
                recorded at all: the next run asks again. Ctrl-C / SIGTERM once: finish the clip in hand,
                commit, stop. Killing it outright loses at most the last few uncommitted clips.

Per album: one fresh track listing from the clip's own store (Deezer preview URLs are signed and expire
after 15 minutes; iTunes: one lookup), then per clip: download to memory, decode to mono 44.1 kHz,
embed. One background thread fetches listings and downloads, one clip at a time, at most four clips
ahead of the model. The rate limits are rmr_audio.match's (ported, not imported: that module needs pandas
and rapidfuzz, which this environment does not have): Deezer one API call per 0.2 s, iTunes one per
3.2 s, the same waits after a refusal.

Decoding: the bake-off decoded with Essentia (AudioLoader + MonoMixer), which this environment does not
have, so the system ffmpeg does it here (a short-lived child per clip; the channels are averaged
here, (L+R)/2, as MonoMixer does). The preview goes through a temp file that is unlinked before ffmpeg starts
reading it (ffmpeg reads the open descriptor), so no audio file exists on disk even if the process is
killed mid-decode.

The embedding, exactly bakeoff_torch.py's clap_factory: 44.1 kHz mono -> resample_poly(160, 147) = 48 kHz
-> three 10 s windows spread over the clip (the whole clip when it is 10 s or shorter) -> ClapFeatureExtractor
-> ClapModel.get_audio_features (the projected 512-d audio embedding) -> each window L2-normalised
-> their mean (not renormalised). The model runs on MPS, one window at a time.

`load(clips=4)` gives the album-mean vectors; see its docstring for how keys map to crossgenre.py's rows.
"""
import argparse
import fcntl
import os
import queue
import resource
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUT_DB = HERE / "cache_clap" / "clap_clips.sqlite"
SOURCE_DB = Path(os.environ.get("RMR_CLIPS_DB") or HERE.parents[1] / "data-pipeline" / ".cache" / "audio" / "clips.sqlite")
CLAP_ID = "laion/larger_clap_music_and_speech"
DIM = 512
SR = 44100
MIN_SAMPLES = 5 * SR  # the bake-off's floor: a shorter clip is too_short
THREADS = 2
AHEAD = 4  # clips the downloader may be ahead of the model
COMMIT_EVERY, COMMIT_SECS = 8, 20.0
STORE_DOWN_AFTER = 3  # listings in a row a store may fail before its other albums are left for the next run
NETWORK_DOWN_AFTER = 12  # downloads in a row that may fail on the network before the run stops itself
FAILED = ("no_preview", "download_failed", "decode_failed", "too_short", "embed_failed")
SCHEMA = """
CREATE TABLE IF NOT EXISTS clap_clips(key TEXT NOT NULL, source TEXT NOT NULL, album_id TEXT NOT NULL,
    track_id TEXT NOT NULL, track_idx INTEGER, prio INTEGER, status TEXT NOT NULL, error TEXT, clip_s REAL,
    emb BLOB, updated_at TEXT, PRIMARY KEY(key, source, album_id, track_id));
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
"""
RECIPE = ("44.1 kHz mono (ffmpeg, (L+R)/2) -> resample_poly(160,147) -> 3 x 10 s windows -> get_audio_features "
          "-> L2 per window -> mean; float32")


# --- the plan --------------------------------------------------------------------------------------

def ro(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=60)


def source_clips(path: Path, clips: int) -> tuple[list[dict], int]:
    """(the clips to have, in album order then clip rank; the number of `local` clips left out). Album
    order is the order the pipeline first stored the albums in (its catalog order)."""
    con = ro(path)
    rows = con.execute(
        "SELECT c.key, c.source, c.album_id, c.track_id, c.track_idx, c.prio FROM clips c "
        "JOIN (SELECT key, MIN(rowid) AS first FROM clips GROUP BY key) o ON o.key = c.key "
        "WHERE c.status = 'ok' AND c.prio < ? ORDER BY o.first, c.source, c.album_id, c.prio, c.track_idx", (clips,)).fetchall()
    con.close()
    recs = [dict(zip(("key", "source", "album_id", "track_id", "track_idx", "prio"), r)) for r in rows]
    return [r for r in recs if r["source"] != "local"], sum(r["source"] == "local" for r in recs)


def ident(rec: dict) -> tuple:
    return rec["key"], rec["source"], rec["album_id"], rec["track_id"]


def by_album(recs: list[dict]) -> list[list[dict]]:
    out: dict[tuple, list[dict]] = {}
    for r in recs:
        out.setdefault(ident(r)[:3], []).append(r)
    return list(out.values())


def wanted_keys(arg: str | None) -> set[str]:
    return {k if k.startswith("spotify:") else f"spotify:album:{k}" for k in (arg or "").split(",") if k}


# --- the stores (rmr_audio.match's Throttle and Http.get(fresh=True), without the cache) ------------

def store_of(source: str) -> str:
    return "itunes" if source.startswith("itunes") else source


class Throttle:
    """Spaces request starts at least `interval` seconds apart."""

    def __init__(self, interval: float, backoff: float):
        self.interval, self.backoff, self._next = interval, backoff, 0.0

    def wait(self) -> None:
        start = max(time.monotonic(), self._next)
        self._next = start + self.interval
        time.sleep(max(0.0, start - time.monotonic()))


class Stores:
    """Fresh track listings and preview downloads, sequential, rate-limited per store."""

    def __init__(self, stop: threading.Event):
        import requests

        self.requests, self.session, self.stop = requests, requests.Session(), stop
        self.throttles = {"deezer": Throttle(0.2, backoff=5), "itunes": Throttle(3.2, backoff=60)}
        self.failed: Counter = Counter()  # store -> listings given up on in a row
        self.calls: Counter = Counter()

    def pause(self, seconds: float) -> None:
        self.stop.wait(seconds)

    def get(self, url: str, store: str) -> dict:
        """One API page: three attempts, waiting 5, 10 s (Deezer) or 60, 120 s (iTunes) after a refusal
        (HTTP 403, 429, 5xx, Deezer's quota sent as 200) or a network error."""
        throttle = self.throttles[store]
        for attempt in range(3):
            if self.stop.is_set():
                raise IOError("interrupted")
            throttle.wait()
            self.calls[store] += 1
            try:
                r = self.session.get(url, timeout=30)
                if r.status_code in (403, 429) or r.status_code >= 500:
                    raise self.requests.HTTPError(f"HTTP {r.status_code}")
                data = r.json()
                if isinstance(data, dict) and (data.get("error") or {}).get("code") in (4, 700):
                    raise self.requests.HTTPError(f"Deezer: {data['error'].get('message', 'quota')}")
                return data
            except (self.requests.RequestException, ValueError) as e:
                error = f"{type(e).__name__}: {e}"[:120]
                if attempt < 2:
                    pause = throttle.backoff * (attempt + 1)
                    print(f"  retry {attempt + 1} in {pause:.0f}s ({error}): {url[:100]}", file=sys.stderr, flush=True)
                    self.pause(pause)
        raise IOError(f"listing failed: {error}")

    def listing(self, source: str, album_id: str) -> dict[str, str | None]:
        """track id -> preview URL (None when the track has none) of the album as the store lists it now."""
        store, out = store_of(source), {}
        try:
            if store == "deezer":
                url = f"https://api.deezer.com/album/{album_id}/tracks?limit=200"
                while url:
                    data = self.get(url, "deezer")
                    out.update((str(t["id"]), t.get("preview") or None) for t in data.get("data", []))
                    url = data.get("next")
            else:
                url = (f"https://itunes.apple.com/lookup?id={album_id}&entity=song&limit=200"
                       f"&country={source.partition(':')[2] or 'us'}")
                out.update((str(t["trackId"]), t.get("previewUrl") or None) for t in self.get(url, "itunes").get("results", [])
                           if t.get("wrapperType") == "track" and t.get("kind") == "song")
        except IOError:
            self.failed[store] += 1
            raise
        self.failed[store] = 0
        return out

    def download(self, url: str) -> bytes:
        """The preview's bytes. A refusal other than 429 is final; 429, 5xx and network errors are tried
        again after 3, 10 and 30 s. Raises LookupError for an empty preview, IOError otherwise."""
        for attempt, pause in enumerate((3, 10, 30, None)):
            try:
                r = self.session.get(url, timeout=(10, 30))
                if r.status_code < 400:
                    if len(r.content) > 1000:
                        return r.content
                    raise LookupError(f"HTTP {r.status_code}, {len(r.content)} bytes")
                error = f"HTTP {r.status_code}"
                if r.status_code < 500 and r.status_code != 429:
                    break
            except self.requests.RequestException as e:
                error = f"network: {type(e).__name__}"
            if pause is None or self.stop.is_set():
                break
            self.pause(pause)
        raise IOError(error)


def feeder(albums: list[list[dict]], out: queue.Queue, stop: threading.Event, stores: Stores) -> None:
    """The background thread: per album a fresh listing, then its clips one at a time, into `out` as
    (rec, bytes | None, status | None, error, seconds). ("left", n, reason) for an album not attempted."""

    def put(item) -> bool:
        while not stop.is_set():
            try:
                out.put(item, timeout=0.5)
                return True
            except queue.Full:
                pass
        return False

    try:
        for recs in albums:
            if stop.is_set():
                break
            source, album_id = recs[0]["source"], recs[0]["album_id"]
            if stores.failed[store_of(source)] >= STORE_DOWN_AFTER:
                put(("left", len(recs), f"{store_of(source)} is not answering"))
                continue
            t = time.perf_counter()
            try:
                urls = stores.listing(source, album_id)
            except Exception as e:
                put(("left", len(recs), f"{recs[0]['key']}: {e}"[:200]))
                continue
            share = (time.perf_counter() - t) / len(recs)
            for rec in recs:
                if stop.is_set():
                    break
                t, data, status, error = time.perf_counter(), None, None, None
                url = urls.get(rec["track_id"])
                if not url:
                    status = "no_preview"
                    error = "no preview url in the listing" if rec["track_id"] in urls else "track not in the listing any more"
                else:
                    try:
                        data = stores.download(url)
                    except LookupError as e:
                        status, error = "no_preview", str(e)
                    except Exception as e:
                        status, error = "download_failed", str(e)[:300]
                if not put((rec, data, status, error, share + time.perf_counter() - t)):
                    break
    finally:
        out.put(None) if stop.is_set() else put(None)


# --- audio -----------------------------------------------------------------------------------------

def decode(data: bytes, suffix: str, tmp: str, ffmpeg: str) -> np.ndarray:
    """Mono float32 at 44.1 kHz. The bytes go to a temp file whose name is removed before ffmpeg reads
    it through the open descriptor, so the audio is never reachable on disk."""
    fd, path = tempfile.mkstemp(suffix=suffix, dir=tmp)
    try:
        try:
            with os.fdopen(os.dup(fd), "wb") as f:
                f.write(data)
        finally:
            os.unlink(path)
        os.lseek(fd, 0, os.SEEK_SET)
        p = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-i", f"/dev/fd/{fd}", "-vn", "-map", "0:a:0",
                            "-ar", str(SR), "-c:a", "pcm_f32le", "-f", "wav", "pipe:1"],
                           pass_fds=(fd,), capture_output=True, timeout=120, start_new_session=True)
    finally:
        os.close(fd)
    if p.returncode or not p.stdout:
        raise RuntimeError((p.stderr.decode(errors="replace").strip() or f"ffmpeg exit {p.returncode}")[:300])
    return mono_of_wav(p.stdout)


def mono_of_wav(wav: bytes) -> np.ndarray:
    """The float32 samples of ffmpeg's WAV stream, channels averaged: (L+R)/2 for stereo, which is what
    Essentia's MonoMixer gave the bake-off. (ffmpeg's own `-ac 1` scales a stereo pair by 0.707.)"""
    if wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        raise RuntimeError("ffmpeg did not return WAV")
    pos, channels = 12, 0
    while pos + 8 <= len(wav):
        tag, size = wav[pos:pos + 4], int.from_bytes(wav[pos + 4:pos + 8], "little")
        if tag == b"fmt ":
            channels = int.from_bytes(wav[pos + 10:pos + 12], "little")
        elif tag == b"data":  # written to a pipe: the size field is a placeholder, the samples run to the end
            if not channels:
                break
            x = np.frombuffer(wav, "<f4", count=(len(wav) - pos - 8) // (4 * channels) * channels, offset=pos + 8)
            return x.copy() if channels == 1 else x.reshape(-1, channels).mean(axis=1, dtype=np.float32)
        pos += 8 + size + (size & 1)
    raise RuntimeError("no samples in ffmpeg's WAV")


def hf_snapshot(repo: str) -> bool:
    home = Path(os.environ.get("HF_HUB_CACHE") or Path(os.environ.get("HF_HOME") or Path.home() / ".cache" / "huggingface") / "hub")
    snaps = home / ("models--" + repo.replace("/", "--")) / "snapshots"
    return snaps.is_dir() and any(snaps.glob("*/pytorch_model.bin"))


def load_model():
    """(embed(mono 44.1 kHz) -> 512 float32, device name). bakeoff_torch.py's clap_factory on MPS; on CPU
    with two threads, and saying so, only if MPS cannot run it."""
    for var in ("OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
        os.environ[var] = str(THREADS)
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    if hf_snapshot(CLAP_ID):  # cached: stay offline (transformers otherwise looks for a safetensors copy)
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
    else:
        print(f"downloading {CLAP_ID} (about 776 MB) to the Hugging Face cache", flush=True)
    import torch
    from scipy.signal import resample_poly
    from transformers import ClapFeatureExtractor, ClapModel

    torch.set_num_threads(THREADS)
    torch.set_num_interop_threads(1)
    fe = ClapFeatureExtractor.from_pretrained(CLAP_ID)
    model = ClapModel.from_pretrained(CLAP_ID, use_safetensors=False).eval()
    model.text_model, model.text_projection = None, None  # the text tower is not needed
    window = 10 * 48000

    def make(device):
        model.to(device)

        def embed(audio: np.ndarray) -> np.ndarray:
            x = resample_poly(audio, 160, 147).astype(np.float32)
            if len(x) <= window:
                wins = [x]
            else:
                wins = [x[s:s + window] for s in np.linspace(0, len(x) - window, 3).round().astype(int)]
            feats = []
            with torch.inference_mode():
                for w in wins:  # one window at a time, as the bake-off did
                    inputs = fe([w], sampling_rate=48000, return_tensors="pt")
                    f = model.get_audio_features(input_features=inputs["input_features"].to(device))
                    feats.append((f if torch.is_tensor(f) else f.pooler_output).float().cpu())
            v = torch.nn.functional.normalize(torch.cat(feats), dim=-1).mean(0).numpy()
            if device.type == "mps":
                torch.mps.synchronize()
                torch.mps.empty_cache()
            if v.shape != (DIM,) or not np.isfinite(v).all():
                raise ValueError(f"bad embedding {v.shape}")
            return v.astype("<f4")

        return embed

    probe = np.random.default_rng(0).standard_normal(12 * SR).astype(np.float32) * 0.1
    if torch.backends.mps.is_available():
        try:
            embed = make(torch.device("mps"))
            embed(probe)
            return embed, "mps", lambda: torch.mps.driver_allocated_memory()
        except Exception as e:
            print(f"WARNING: MPS failed ({type(e).__name__}: {e}); falling back to CPU with {THREADS} threads", flush=True)
    else:
        print(f"WARNING: MPS is not available; running on CPU with {THREADS} threads", flush=True)
    embed = make(torch.device("cpu"))
    embed(probe)
    return embed, "cpu", lambda: 0


# --- run -------------------------------------------------------------------------------------------

class Stop:
    """Ctrl-C or SIGTERM once: finish the clip in hand, commit, stop. Twice: stop now (still committed)."""

    def __init__(self):
        self.event = threading.Event()

    def __call__(self, *_):
        if self.event.is_set():
            raise KeyboardInterrupt
        self.event.set()
        print("\nstopping after the clip in hand (again to stop at once)", file=sys.stderr, flush=True)


def fmt_eta(seconds: float) -> str:
    return f"{int(seconds // 3600)}h{int(seconds % 3600 // 60):02d}m"


def open_out(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=60)
    con.executescript(SCHEMA)
    con.executemany("INSERT OR IGNORE INTO meta VALUES (?, ?)", [("model", CLAP_ID), ("recipe", RECIPE)])
    con.commit()
    return con


def todo(args, con: sqlite3.Connection) -> tuple[list[list[dict]], dict]:
    recs, n_local = source_clips(args.source, args.clips)
    keys = wanted_keys(args.keys)
    if keys:
        recs = [r for r in recs if r["key"] in keys]
    have = {tuple(r[:4]): r[4] for r in con.execute("SELECT key, source, album_id, track_id, status FROM clap_clips")}
    left = [r for r in recs if ident(r) not in have or (args.retry_failed and have[ident(r)] != "ok")]
    albums = by_album(left)
    info = {"clips": len(recs), "albums": len(by_album(recs)), "local": n_local,
            "done": sum(have.get(ident(r)) == "ok" for r in recs),
            "failed": sum(have.get(ident(r), "ok") != "ok" for r in recs), "beyond_limit": 0}
    if args.limit_albums is not None:
        info["beyond_limit"] = max(0, len(albums) - args.limit_albums)
        albums = albums[:args.limit_albums]
    return albums, info


def run(args) -> int:
    try:
        os.nice(19)
    except OSError:
        pass
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg not found on PATH: it decodes the previews", file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    lock = open(args.out.with_suffix(".lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("another clap_catalog run holds the lock: not starting a second one", file=sys.stderr)
        return 1
    con = open_out(args.out)
    albums, info = todo(args, con)
    n_total = sum(len(a) for a in albums)
    print(f"{info['clips']} clips of {info['albums']} albums with prio < {args.clips}: {info['done']} done, "
          f"{info['failed']} failed before{'' if args.retry_failed else ' (not retried: --retry-failed)'}, "
          f"{info['local']} local clips skipped; this run: {n_total} clips of {len(albums)} albums"
          + (f" ({info['beyond_limit']} albums beyond --limit-albums)" if info["beyond_limit"] else ""), flush=True)
    if not albums:
        print("nothing to do", flush=True)
        con.close()
        return 0

    t_load = time.perf_counter()
    embed, device, mps_bytes = load_model()
    print(f"model ready on {device} in {time.perf_counter() - t_load:.1f} s (torch threads {THREADS})", flush=True)
    stop = Stop()
    old = {s: signal.signal(s, stop) for s in (signal.SIGINT, signal.SIGTERM)}
    stores = Stores(stop.event)
    fed: queue.Queue = queue.Queue(maxsize=AHEAD)
    threading.Thread(target=feeder, args=(albums, fed, stop.event, stores), daemon=True).start()
    for stale in Path(tempfile.gettempdir()).glob("rmr-clap-*"):  # what a killed run left (this one holds the lock)
        shutil.rmtree(stale, ignore_errors=True)
    tmp = tempfile.mkdtemp(prefix="rmr-clap-")
    status, secs, left = Counter(), Counter(), []
    n = uncommitted = network_fails = 0
    peak_mps, t0, last_commit = 0, time.monotonic(), time.monotonic()
    seen_albums = set()

    def progress() -> None:
        el = time.monotonic() - t0
        rate = n / el * 60
        print(f"[{time.strftime('%H:%M:%S')}] {n}/{n_total} clips, {len(seen_albums)}/{len(albums)} albums | "
              f"{rate:.1f} clips/min | failures {n - status['ok']} {dict((k, v) for k, v in status.items() if k != 'ok') or ''} | "
              f"ETA {fmt_eta((n_total - n) / max(rate, 1e-9) * 60)}", flush=True)

    try:
        while True:
            try:
                item = fed.get(timeout=0.5)
            except queue.Empty:
                if stop.event.is_set():
                    break
                continue
            if item is None:
                break
            if item[0] == "left":
                left.append(item[1:])
                continue
            rec, data, st, error, dl_s = item
            secs["download"] += dl_s
            clip_s, emb = None, None
            if data is not None:
                t = time.perf_counter()
                try:
                    mono = decode(data, ".mp3" if rec["source"] == "deezer" else ".m4a", tmp, ffmpeg)
                except Exception as e:
                    st, error, mono = "decode_failed", str(e)[:300], None
                del data
                secs["decode"] += time.perf_counter() - t
                if mono is not None:
                    clip_s = len(mono) / SR
                    if len(mono) < MIN_SAMPLES:
                        st, error = "too_short", f"{clip_s:.1f} s"
                    else:
                        t = time.perf_counter()
                        try:
                            emb, st = embed(mono).tobytes(), "ok"
                        except Exception as e:
                            st, error = "embed_failed", f"{type(e).__name__}: {e}"[:300]
                        secs["embed"] += time.perf_counter() - t
                        peak_mps = max(peak_mps, mps_bytes())
            if stop.event.is_set() and st != "ok":
                break  # a failure while stopping may be the stop itself: leave the clip for the next run
            network_fails = network_fails + 1 if st == "download_failed" and (error or "").startswith("network") else 0
            con.execute("INSERT OR REPLACE INTO clap_clips VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                        (*ident(rec), rec["track_idx"], rec["prio"], st, error, clip_s, emb))
            n, uncommitted = n + 1, uncommitted + 1
            status[st] += 1
            seen_albums.add(ident(rec)[:3])
            if uncommitted >= COMMIT_EVERY or time.monotonic() - last_commit > COMMIT_SECS:
                con.commit()
                uncommitted, last_commit = 0, time.monotonic()
            if n % args.progress_every == 0:
                progress()
            if network_fails >= NETWORK_DOWN_AFTER:
                print(f"{network_fails} downloads in a row failed on the network: stopping. Those clips are recorded as "
                      "download_failed; run again with --retry-failed once the network is back", flush=True)
                stop.event.set()
                break
            if stop.event.is_set():
                break
    finally:
        con.commit()
        stop.event.set()
        for s, h in old.items():
            signal.signal(s, h)
        shutil.rmtree(tmp, ignore_errors=True)
    el = time.monotonic() - t0
    progress()
    unit = 2 ** 20 if sys.platform == "darwin" else 2 ** 10  # ru_maxrss: bytes on macOS, kB on Linux
    print(f"{'stopped' if n < n_total else 'finished'}: {n} clips in {el:.0f} s = {el / max(n, 1):.2f} s per clip "
          f"({n / el * 60:.1f} clips/min)  {dict(status)}", flush=True)
    print(f"per clip: download {secs['download'] / max(n, 1):.2f} s (background thread, incl. the listing's share), "
          f"decode {secs['decode'] / max(n, 1):.2f} s, embed {secs['embed'] / max(status['ok'], 1):.2f} s; "
          f"API calls {dict(stores.calls)}", flush=True)
    print(f"peak RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / unit:.0f} MB (ffmpeg children at most "
          f"{resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / unit:.0f} MB), MPS driver peak {peak_mps / 2 ** 20:.0f} MB",
          flush=True)
    if left:
        print(f"{len(left)} albums ({sum(c for c, _ in left)} clips) not attempted, left for the next run:", flush=True)
        for _, reason in left[:10]:
            print(f"  {reason}", flush=True)
    con.close()
    return 0


def status(args) -> int:
    recs, n_local = source_clips(args.source, args.clips)
    print(f"source: {len(recs)} ok clips with prio < {args.clips} of {len(by_album(recs))} albums "
          f"({dict(Counter(r['source'] for r in recs))}); {n_local} local clips skipped")
    if not args.out.exists():
        print(f"{args.out}: not there yet")
        return 0
    con = ro(args.out)
    have = {tuple(r[:4]): r[4] for r in con.execute("SELECT key, source, album_id, track_id, status FROM clap_clips")}
    reasons = con.execute("SELECT status, substr(error, 1, 60), COUNT(*) FROM clap_clips WHERE status != 'ok' "
                          "GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15").fetchall()
    con.close()
    mine = Counter(have.get(ident(r), "to do") for r in recs)
    print(f"clips: {dict(mine)}")
    albums = by_album(recs)
    full = sum(all(have.get(ident(r)) == "ok" for r in a) for a in albums)
    tried = sum(all(ident(r) in have for r in a) for a in albums)
    some = sum(any(have.get(ident(r)) == "ok" for r in a) for a in albums)
    print(f"albums: {full} with every clip ok, {tried} with every clip tried, {some} with at least one clip, of {len(albums)}")
    for st, err, c in reasons:
        print(f"  {c:5d}  {st}: {err}")
    return 0


# --- loader ----------------------------------------------------------------------------------------

def load(clips: int = 4, db: Path | str = OUT_DB) -> tuple[np.ndarray, np.ndarray]:
    """(keys, X): keys = sorted album keys (Spotify URIs, the feature table's `uri`), X (n, 512) float32 =
    each album's mean CLAP vector over its ok clips with prio < clips: the plain mean of the per-clip
    vectors, taken in float64, as ClipCache.mean(below_rank=True) does for EffNet (no renormalisation).
    An album with clips from two listings uses the listing with the most ok clips.

    To crossgenre.py's rows: `row` is the album's row index in all_data_norm.pkl, and
    common.load_albums() gives the (row, uri) pairs, so

        keys, X = clap_catalog.load(4)
        al = common.load_albums()
        row_of = dict(zip(al["uri"], al["row"]))          # uri -> row
        at = {k: i for i, k in enumerate(keys)}
        rows = np.sort(np.loadtxt(RESULTS / "pool_rows.txt", dtype=np.int64))   # the full pool, as source("full")
        uri_of = dict(zip(al["row"], al["uri"]))
        emb["clap_music"] = np.stack([X[at[uri_of[r]]] for r in rows]).astype(np.float64)
    """
    con = ro(Path(db))
    rows = con.execute("SELECT key, source, album_id, emb FROM clap_clips WHERE status = 'ok' AND prio < ? "
                       "ORDER BY key, source, album_id, prio", (clips,)).fetchall()
    con.close()
    listings: dict[str, dict[tuple, list]] = {}
    for key, source, album_id, emb in rows:
        listings.setdefault(key, {}).setdefault((source, album_id), []).append(np.frombuffer(emb, "<f4"))
    keys = sorted(listings)
    X = np.empty((len(keys), DIM), np.float32)
    for i, key in enumerate(keys):
        best = max(listings[key].values(), key=len)
        X[i] = np.stack(best).astype(np.float64).mean(axis=0)
    return np.array(keys), X


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("run", "status"):
        s = sub.add_parser(name)
        s.add_argument("--clips", type=int, default=4, help="clips per album: the cached ones with prio < N")
        s.add_argument("--source", type=Path, default=SOURCE_DB, help="the pipeline's clips.sqlite (read-only)")
        s.add_argument("--out", type=Path, default=OUT_DB)
        if name == "run":
            s.add_argument("--limit-albums", type=int, default=None, help="at most N albums that still have clips to do")
            s.add_argument("--keys", default=None, help="only these albums: Spotify URIs or ids, comma-separated")
            s.add_argument("--retry-failed", action="store_true")
            s.add_argument("--progress-every", type=int, default=200, help="clips between progress lines")
    args = p.parse_args()
    if not args.source.exists():
        print(f"{args.source}: no clip cache there (--source or RMR_CLIPS_DB)", file=sys.stderr)
        return 1
    return {"run": run, "status": status}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
