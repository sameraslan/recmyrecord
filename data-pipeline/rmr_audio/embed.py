"""Clips to embeddings: download a preview (or read a local file), decode it, run Discogs-EffNet, keep the
1,280 numbers and throw the audio away. Ported from experiments/preview_features/extract.py and models.py.

Essentia is imported only inside a worker process (init_worker), so everything else in rmr_audio works
and is tested without it.

The model is Essentia's `discogs-effnet-bs1-1` graph. The mel-spectrogram is computed once per clip and the
graph is fed directly through TensorflowPredict: 2-second patches, one per second, averaged. That is
bit-identical to TensorflowPredictEffnetDiscogs and about half its CPU time.

No audio is kept: a preview lives in memory and, while Essentia decodes it, in a temp file inside a
per-run temp directory; the file is deleted right after decoding and the directory when the run ends.
"""
import hashlib
import json
import os
import resource
import shutil
import signal
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from rmr_pipeline.constants import REPO

MODEL = "discogs-effnet-bs1-1"
MODEL_URL = "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/"
MODEL_SHA256 = {".pb": "58a577a603669b922589179bd85ae06031fe642ffcc0ee873d2d79fbfc0ff8e5",
                ".json": "c1bd5ed062d5c60538dc6a45c6eb9e64c69784ac3d19b1eb2e6d14cab83d8cdf"}
EXPERIMENT_MODELS = REPO / "experiments" / "preview_features" / "cache" / "models"
SR = 44100
PATCH, HOP = 128, 62  # mel frames (hop 256 at 16 kHz): 2 s patches, one per second
MIN_SAMPLES = 5 * 16000  # shortest clip worth embedding
EXCERPT_S, EXCERPT_FROM_S = 30.0, 30.0  # local files: this long, starting this far in
LOCAL_SUFFIXES = (".mp3", ".m4a", ".flac", ".wav", ".ogg", ".aiff", ".aif")
WORKER: dict = {}  # per-process state: model, algorithms, HTTP session, download thread


# --- the model file ----------------------------------------------------------------------------

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_model(model_dir: Path, fetch=None) -> Path:
    """The graph and its metadata in `model_dir`, checksums verified: kept if already there, else copied
    from the experiment's cache, else downloaded. A file is renamed into place only when complete and
    correct. Returns the .pb path."""
    model_dir.mkdir(parents=True, exist_ok=True)
    for ext, digest in MODEL_SHA256.items():
        dest = model_dir / (MODEL + ext)
        if dest.exists() and _sha256(dest) == digest:
            continue
        part = dest.with_name(dest.name + ".part")
        local = EXPERIMENT_MODELS / dest.name
        if local.exists() and _sha256(local) == digest:
            shutil.copyfile(local, part)
        else:
            (fetch or _download)(MODEL_URL + dest.name, part)
        if _sha256(part) != digest:
            part.unlink()
            raise IOError(f"{dest.name}: checksum mismatch after fetching it; not kept")
        part.replace(dest)
        print(f"model: {dest.name} ({dest.stat().st_size / 1e6:.1f} MB) -> {model_dir}", flush=True)
    return model_dir / (MODEL + ".pb")


def _download(url: str, dest: Path) -> None:
    """The server is slow and drops connections: retry."""
    import requests

    for attempt in range(6):
        try:
            with requests.get(url, stream=True, timeout=(20, 60)) as r:
                r.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            return
        except requests.RequestException as e:
            if attempt == 5:
                raise IOError(f"could not download {url}: {e}") from None
            time.sleep(3 * (attempt + 1))


# --- local files -------------------------------------------------------------------------------

def excerpt_window(duration_s: float) -> tuple[float, float]:
    """(start, end) in seconds of the excerpt taken from a local file: 30 seconds starting 30 seconds in,
    centred when the track is shorter than a minute, the whole file when it is shorter than 30 seconds."""
    if duration_s >= EXCERPT_FROM_S + EXCERPT_S:
        return EXCERPT_FROM_S, EXCERPT_FROM_S + EXCERPT_S
    if duration_s > EXCERPT_S:
        start = (duration_s - EXCERPT_S) / 2
        return start, start + EXCERPT_S
    return 0.0, max(duration_s, 0.0)


def local_files(folder: Path) -> list[Path]:
    """The audio files of an album folder, sorted by file name (= track order)."""
    return sorted((p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in LOCAL_SUFFIXES
                   and not p.name.startswith(".")), key=lambda p: p.name)


def file_sig(path: Path) -> str:
    st = path.stat()
    return f"{st.st_size}:{st.st_mtime_ns}"


# --- worker side -------------------------------------------------------------------------------

def init_worker(model_dir: str, tmp: str) -> None:
    """Load the model and the algorithms once per worker process, at the lowest priority. Ctrl-C is
    left to the parent, which lets the clips in flight finish."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    try:
        os.nice(19)
    except OSError:
        pass
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    import essentia
    import essentia.standard as es
    import requests

    essentia.log.infoActive = essentia.log.warningActive = False
    meta = json.loads((Path(model_dir) / (MODEL + ".json")).read_text())
    node_in = meta["schema"]["inputs"][0]["name"]
    node_out = next(o["name"] for o in meta["schema"]["outputs"] if o.get("output_purpose") == "embeddings")
    WORKER.update(
        tmp=tmp, es=es, pool=essentia.Pool, session=requests.Session(), downloads=ThreadPoolExecutor(1),
        node_in=node_in, node_out=node_out, mel=es.TensorflowInputMusiCNN(), mixer=es.MonoMixer(),
        graph=es.TensorflowPredict(graphFilename=str(Path(model_dir) / (MODEL + ".pb")), inputs=[node_in],
                                   outputs=[node_out]),
        to16k=es.Resample(inputSampleRate=SR, outputSampleRate=16000, quality=4))


class EmptyPreview(IOError):
    """The store answered 200 with (next to) nothing: the listing has a preview URL but no preview."""


def download(url: str) -> bytes:
    """The preview's bytes. Three attempts with backoff; 4xx is not retried."""
    empty = False
    for attempt in range(3):
        try:
            r = WORKER["session"].get(url, timeout=(10, 30))
            if r.status_code < 400 and len(r.content) > 1000:
                return r.content
            error, empty = f"HTTP {r.status_code}, {len(r.content)} bytes", r.status_code < 400
            if 400 <= r.status_code < 500:
                break
        except Exception as e:  # requests.RequestException; anything else is as much a failed download
            error, empty = type(e).__name__, False
        time.sleep(1.5 * (attempt + 1))
    raise (EmptyPreview if empty else IOError)(error)


def decode(data: bytes, suffix: str) -> np.ndarray:
    """Mono at 44.1 kHz. Essentia's loader needs a path, so the bytes touch disk only for the length
    of the decode."""
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
    return WORKER["mixer"](stereo, int(channels))


def excerpt(path: str) -> np.ndarray:
    """The excerpt of a local file (see excerpt_window), mono at 44.1 kHz. A track of a minute or more is
    read through a trimming loader, so a long file is never held in memory whole."""
    es = WORKER["es"]
    part = es.EasyLoader(filename=path, sampleRate=SR, startTime=EXCERPT_FROM_S, endTime=EXCERPT_FROM_S + EXCERPT_S)()
    if len(part) >= int(EXCERPT_S * SR) - 1:
        return part
    whole = es.MonoLoader(filename=path, sampleRate=SR)()  # shorter than a minute
    start, end = excerpt_window(len(whole) / SR)
    return whole[int(start * SR):int(end * SR)]


def embed(mono: np.ndarray) -> tuple[np.ndarray | None, float]:
    """(1,280-number embedding, clip seconds) from mono 44.1 kHz audio; (None, seconds) when it is too short."""
    w = WORKER
    audio = w["to16k"](mono)
    seconds = len(mono) / SR
    if len(audio) < MIN_SAMPLES:
        return None, seconds
    mel = np.array([w["mel"](f) for f in w["es"].FrameGenerator(audio, frameSize=512, hopSize=256)])
    patches = []
    for i in range(0, len(mel) - PATCH + 1, HOP):
        pool = w["pool"]()
        pool.set(w["node_in"], np.ascontiguousarray(mel[None, i:i + PATCH][:, None], dtype=np.float32))
        patches.append(w["graph"](pool)[w["node_out"]].reshape(1, -1))
    return np.concatenate(patches).mean(axis=0), seconds


def analyse(rec: dict, pending) -> None:
    """Fill `rec` (status, error, clip_s, emb) from one clip: a pending download, or a local file."""
    try:
        if rec.get("path"):
            mono = excerpt(rec["path"])
        else:
            try:
                data = pending.result()
            except IOError as e:
                rec.update(status="no_preview" if isinstance(e, EmptyPreview) else "download_failed", error=str(e))
                return
            mono = decode(data, rec.get("suffix", ".mp3"))
            del data
    except Exception as e:  # Essentia raises RuntimeError, but any decode failure means the same
        rec.update(status="decode_failed", error=str(e)[:300])
        return
    try:
        emb, rec["clip_s"] = embed(mono)
    except Exception as e:
        rec.update(status="analysis_failed", error=f"{type(e).__name__}: {e}"[:300])
        return
    if emb is None:
        rec.update(status="too_short", error=f"{rec['clip_s']:.1f} s")
    else:
        rec.update(status="ok", emb=emb.astype("<f2").tobytes())


def process(task: list[dict]) -> dict:
    """Embed the clips of one task (the clips one album needs). Downloads run one at a time on a
    background thread, so the next preview is usually in memory when the model gets to it."""
    t0 = time.perf_counter()
    pending = [None if rec.get("path") else WORKER["downloads"].submit(download, rec["url"]) for rec in task]
    for rec, p in zip(task, pending):
        analyse(rec, p)
        rec.pop("url", None)
    return {"pid": os.getpid(), "rss": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "clips": task,
            "seconds": time.perf_counter() - t0}
