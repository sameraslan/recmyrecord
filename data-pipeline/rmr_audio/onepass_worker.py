"""A model worker of the one-pass embedder: one process, one model, fed clips over a pipe by the parent
(rmr_audio.onepass). The parent does the network and the sqlite writes; a worker only decodes and embeds.

  .venv-audio python  -m rmr_audio.onepass_worker --backend effnet --model-dir DIR --tmp DIR
  .venv-torch python  -m rmr_audio.onepass_worker --backend clap --tmp DIR
  any python          -m rmr_audio.onepass_worker --backend stub [--dim N]      (tests: no model)

Each backend is the existing recipe, imported, not rewritten:

  effnet   rmr_audio.embed: init_worker (the graph, one thread), decode (Essentia AudioLoader + MonoMixer),
           embed (44.1 kHz mono -> 16 kHz -> mel patches -> discogs-effnet-bs1-1 -> mean; float16, 1,280)
  clap     experiments/preview_features/clap_catalog.py: load_model (MPS, CPU fallback), decode (ffmpeg,
           (L+R)/2), the embed closure (48 kHz, three 10 s windows, L2 per window, mean; float32, 512)

A request carries either the clip's bytes as downloaded (`kind` bytes: the backend decodes them with its own
decoder, as it always has) or mono float32 at 44.1 kHz decoded by the parent (`kind` mono: a window of a
local file, or the shared-decoder mode).

The clap child also serves the variant `clap_mp3` (rmr_audio.mp3trip): a request with `recipe: mp3` carries
the clip's bytes (`kind` bytes: decoded here WITH its channels) or the parent's decode with its channels
(`kind` pcm: interleaved float32 at 44.1 kHz, `ch` channels in the header; a window of a full-length file).
The channels go through the 128 kbit/s stereo MP3 round trip, are averaged, and the recipe after that is
the clap recipe unchanged. A one-channel signal is duplicated to L = R for the encode.

Wire format, both directions: 4 bytes little-endian header length, a JSON header, then `n` payload bytes
(`n` is in the header).  ready: {op, model, dim, dtype, device, pid}.  request: {op: embed, id, kind,
suffix, n[, recipe, ch]} or {op: quit}.  reply: {id, status, error, clip_s, secs, rss, mps, n} + the embedding.
status: ok | too_short | decode_failed | analysis_failed, as rmr_audio.clips knows them.

The worker's stdout is the pipe; anything a library prints goes to stderr. It leaves when the pipe closes,
so it cannot outlive its parent. Only the standard library and numpy are needed to import this file.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import resource
import shutil
import signal
import struct
import sys
import time
from pathlib import Path

import numpy as np

SR = 44100
REPO = Path(__file__).resolve().parents[2]
CLAP_CATALOG = REPO / "experiments" / "preview_features" / "clap_catalog.py"
STATUSES = ("ok", "too_short", "decode_failed", "analysis_failed")


def clap_catalog():
    """experiments/preview_features/clap_catalog.py as a module. Importing it loads no model and needs only
    numpy; the CLAP decoder and recipe are used from there so there is one copy of them."""
    name = "clap_catalog"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, CLAP_CATALOG)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        try:
            spec.loader.exec_module(module)
        except BaseException:
            del sys.modules[name]
            raise
    return sys.modules[name]


# --- framing ---------------------------------------------------------------------------------------

def write_frame(f, header: dict, payload: bytes = b"") -> None:
    head = json.dumps({**header, "n": len(payload)}, separators=(",", ":")).encode()
    f.write(struct.pack("<I", len(head)) + head)
    if payload:
        f.write(payload)
    f.flush()


def read_frame(read) -> tuple[dict, bytes] | None:
    """One frame through `read(n) -> exactly n bytes, or fewer at end of stream`; None at a clean end."""
    size = read(4)
    if not size:
        return None
    if len(size) < 4:
        raise EOFError("the pipe closed inside a frame")
    (n,) = struct.unpack("<I", size)
    head = read(n)
    if len(head) < n:
        raise EOFError("the pipe closed inside a frame")
    header = json.loads(head)
    payload = read(header.get("n", 0)) if header.get("n") else b""
    if len(payload) < header.get("n", 0):
        raise EOFError("the pipe closed inside a frame")
    return header, payload


def _reader(f):
    def read(n: int) -> bytes:
        parts, left = [], n
        while left:
            chunk = f.read(left)
            if not chunk:
                break
            parts.append(chunk)
            left -= len(chunk)
        return b"".join(parts)

    return read


# --- backends: embed(kind, data, suffix[, recipe, ch]) -> (status, error, clip seconds, embedding bytes)

class EffNet:
    model, dim, dtype, device = "effnet", 1280, "<f2", "cpu"

    def __init__(self, model_dir: str, tmp: str):
        os.environ["TF_NUM_INTRAOP_THREADS"] = os.environ["TF_NUM_INTEROP_THREADS"] = "1"  # as sync sets them
        os.environ.setdefault("OMP_NUM_THREADS", "1")
        from rmr_audio import embed

        embed.init_worker(model_dir, tmp)
        self.e = embed

    def embed(self, kind: str, data: bytes, suffix: str):
        if kind == "mono":
            mono = np.frombuffer(data, "<f4").copy()  # writable, as a decoder returns it
        else:
            try:
                mono = self.e.decode(data, suffix)
            except Exception as e:  # as embed.analyse: any decode failure means the same
                return "decode_failed", str(e)[:300], None, b""
        try:
            emb, clip_s = self.e.embed(mono)
        except Exception as e:
            return "analysis_failed", f"{type(e).__name__}: {e}"[:300], len(mono) / SR, b""
        if emb is None:
            return "too_short", f"{clip_s:.1f} s", clip_s, b""
        return "ok", None, clip_s, emb.astype("<f2").tobytes()

    def mps(self) -> int:
        return 0


class Clap:
    model, dim, dtype = "clap", 512, "<f4"

    def __init__(self, tmp: str):
        self.cc = clap_catalog()
        self.tmp, self.ffmpeg = tmp, shutil.which("ffmpeg")
        if not self.ffmpeg:
            raise RuntimeError("ffmpeg not found on PATH: it decodes the previews for CLAP")
        self.fn, self.device, self.mps = self.cc.load_model()

    def embed(self, kind: str, data: bytes, suffix: str, recipe: str | None = None, ch: int = 1):
        if recipe not in (None, "mp3"):
            return "analysis_failed", f"unknown recipe {recipe!r}", None, b""
        if recipe == "mp3":
            from rmr_audio import mp3trip

            try:
                if kind == "bytes":
                    channels = mp3trip.decode_channels(data, suffix, self.tmp, self.ffmpeg)
                else:  # pcm with `ch` channels, or mono (one channel)
                    channels = np.frombuffer(data, "<f4").reshape(-1, max(1, ch) if kind == "pcm" else 1)
            except Exception as e:
                return "decode_failed", str(e)[:300], None, b""
            if len(channels) < self.cc.MIN_SAMPLES:
                return "too_short", f"{len(channels) / SR:.1f} s", len(channels) / SR, b""
            try:
                mono = mp3trip.roundtrip(channels, self.ffmpeg)
            except Exception as e:
                return "analysis_failed", f"mp3 round trip: {e}"[:300], len(channels) / SR, b""
        elif kind == "mono":
            mono = np.frombuffer(data, "<f4").copy()  # writable, as a decoder returns it
        else:
            try:
                mono = self.cc.decode(data, suffix, self.tmp, self.ffmpeg)
            except Exception as e:
                return "decode_failed", str(e)[:300], None, b""
        clip_s = len(mono) / SR
        if len(mono) < self.cc.MIN_SAMPLES:
            return "too_short", f"{clip_s:.1f} s", clip_s, b""
        try:
            return "ok", None, clip_s, self.fn(mono).tobytes()
        except Exception as e:
            return "analysis_failed", f"{type(e).__name__}: {e}"[:300], clip_s, b""


class Stub:
    """No model: the embedding is a function of the payload, so a test can tell what a worker was given.
    Bytes starting with SHORT, BAD, FAIL or CRASH give too_short, decode_failed, analysis_failed, or kill
    the process."""
    device = "none"

    def __init__(self, model: str = "stub", dim: int = 8, dtype: str = "<f4"):
        self.model, self.dim, self.dtype = model, dim, dtype

    def embed(self, kind: str, data: bytes, suffix: str, recipe: str | None = None, ch: int = 1):
        if data.startswith(b"CRASH"):
            os._exit(3)
        clip_s = len(data) / 4 / SR if kind == "mono" else len(data) / 4 / max(1, ch) / SR if kind == "pcm" else 30.0
        for prefix, status in ((b"SHORT", "too_short"), (b"BAD", "decode_failed"), (b"FAIL", "analysis_failed")):
            if data.startswith(prefix):
                return status, prefix.decode().lower(), (None if status == "decode_failed" else clip_s), b""
        return "ok", None, clip_s, stub_embedding(stub_input(data, kind, recipe, ch), self.dim, self.dtype).tobytes()

    def mps(self) -> int:
        return 0


def stub_input(data: bytes, kind: str = "bytes", recipe: str | None = None, ch: int = 1) -> bytes:
    """What the stub's embedding is a function of: the payload alone for the plain recipe; for another
    recipe also its name, the kind of payload and the channel count, so a test can tell which path a clip took."""
    return bytes(data) if recipe is None else f"{recipe}:{kind}:{ch}:".encode() + bytes(data)


def stub_embedding(data: bytes, dim: int, dtype: str) -> np.ndarray:
    seed = int.from_bytes(hashlib.sha256(bytes(data)).digest()[:8], "little")
    return (np.random.default_rng(seed).integers(-64, 64, dim) / 16).astype(dtype)  # exact in float16


# --- the loop ----------------------------------------------------------------------------------------

def serve(backend, rd, wr) -> None:
    write_frame(wr, {"op": "ready", "model": backend.model, "dim": backend.dim, "dtype": backend.dtype,
                     "device": backend.device, "pid": os.getpid()})
    read = _reader(rd)
    while True:
        frame = read_frame(read)
        if frame is None or frame[0].get("op") == "quit":
            return
        header, payload = frame
        t = time.perf_counter()
        more = {"recipe": header["recipe"], "ch": int(header.get("ch", 1))} if header.get("recipe") else {}
        status, error, clip_s, emb = backend.embed(header.get("kind", "bytes"), payload, header.get("suffix", ".mp3"), **more)
        del payload
        write_frame(wr, {"id": header.get("id"), "status": status, "error": error, "clip_s": clip_s,
                         "secs": round(time.perf_counter() - t, 4), "mps": int(backend.mps()),
                         "rss": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}, emb)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="One model worker of the one-pass embedder (started by rmr_audio.onepass).")
    p.add_argument("--backend", choices=("effnet", "clap", "stub"), required=True)
    p.add_argument("--model-dir", default=None, help="effnet: the folder with discogs-effnet-bs1-1.pb and .json")
    p.add_argument("--tmp", default=None, help="where a clip's bytes live for the length of its decode")
    p.add_argument("--model", default="stub", help="stub: the model name it answers as")
    p.add_argument("--dim", type=int, default=8)
    p.add_argument("--dtype", default="<f4")
    args = p.parse_args(argv)
    # The pipe is this process's stdout. Keep it private and send every other print to stderr.
    wr = os.fdopen(os.dup(1), "wb")
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    rd = os.fdopen(os.dup(0), "rb")
    signal.signal(signal.SIGINT, signal.SIG_IGN)  # Ctrl-C is the parent's: it lets the clip in hand finish
    try:
        os.nice(19)
    except OSError:
        pass
    if args.backend == "effnet":
        backend = EffNet(args.model_dir, args.tmp)
    elif args.backend == "clap":
        backend = Clap(args.tmp)
    else:
        backend = Stub(args.model, args.dim, args.dtype)
    try:
        serve(backend, rd, wr)
    except (BrokenPipeError, EOFError):
        return 1  # the parent is gone
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
