"""What in the audio makes CLAP tell a Deezer preview from an iTunes one, and does a preprocessing step applied
to every clip before CLAP remove it? The same tracks fetched from both stores, measured as waveforms, and
embedded under a list of preprocessing variants; YouTube full-album audio of some of the same albums as a
third source. Measurements on vectors and waveform statistics: nobody listened.

    cd experiments/audio_10k
    # 1. fetch + embed (the heavy job: holds CLAP on MPS; one at a time on the laptop). Torch environment.
    PYTHONDONTWRITEBYTECODE=1 nice -n 19 <.venv-torch python> store_effect_fix.py run \
        --fetch-python <.venv-audio python> [--albums 120] [--youtube 25] [--seed 0] [--no-effnet]
    # 2. the numbers. An environment with scikit-learn and scipy (the build environment, data-pipeline/.venv).
    PYTHONDONTWRITEBYTECODE=1 <build .venv python> store_effect_fix.py report
        -> results/store_effect_fix.json, results/store_effect_fix.md

`run` starts store_effect_fetch.py as a child in the pipeline's audio environment (the matcher imports
pandas and rapidfuzz, which the torch environment lacks). The child talks to the stores and to YouTube and
sends preview bytes and window samples through a pipe; this process decodes them (clap_catalog's ffmpeg path:
the preview goes to a temp file that is unlinked before ffmpeg reads it through the descriptor), measures
them, applies each variant and embeds with clap_catalog.load_model()'s own `embed` (so the recipe after the
variant is the catalog's, to the letter). Waveforms live in memory for one pair at a time. What is kept, in
cache/store_effect_fix.sqlite (gitignored): embeddings, waveform statistics, 250 Hz band spectra, mean
log-mel inputs, the alignment of each pair, what became of each album and link. It resumes: an album or a
YouTube link that has its row is not asked for again.

Variants (store_effect_dsp.VARIANTS): each maps the 44.1 kHz mono clip to a 44.1 kHz mono clip.
The aligned set: where the two stores' excerpts share at least ALIGNED_MIN_S of the track (found by
cross-correlation, store_effect_dsp.align), both are cut to the shared stretch and embedded again
under store_effect_dsp.ALIGNED: the excerpt's position is then the same and only the encoding differs.
"""
import argparse
import json
import os
import shutil
import signal as sig
import sqlite3
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CACHE = HERE / "cache"
RESULTS = HERE / "results"
DB = CACHE / "store_effect_fix.sqlite"
EFFNET_DIR = REPO / "data-pipeline" / ".cache" / "audio" / "models"
ALIGNED_MIN_S = 15.0
MIN_FREE = 5 * 2 ** 30
BUSY = "onepass|fulllength|clap_catalog"
SCHEMA = """
CREATE TABLE IF NOT EXISTS emb(kind TEXT, key TEXT, unit INTEGER, store TEXT, variant TEXT, vec BLOB,
    PRIMARY KEY(kind, key, unit, store, variant));
CREATE TABLE IF NOT EXISTS meas(kind TEXT, key TEXT, unit INTEGER, store TEXT, info TEXT, spec BLOB, mel BLOB,
    PRIMARY KEY(kind, key, unit, store));
CREATE TABLE IF NOT EXISTS pair(key TEXT, unit INTEGER, info TEXT, PRIMARY KEY(key, unit));
CREATE TABLE IF NOT EXISTS album(key TEXT PRIMARY KEY, info TEXT);
CREATE TABLE IF NOT EXISTS yt(key TEXT PRIMARY KEY, info TEXT);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
"""


def log(*a) -> None:
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


# --- run ---------------------------------------------------------------------------------------------

def channels_of_wav(wav: bytes) -> np.ndarray:
    """(samples, channels) float32 of ffmpeg's WAV stream: clap_catalog.mono_of_wav without the average."""
    if wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        raise RuntimeError("ffmpeg did not return WAV")
    pos, channels = 12, 0
    while pos + 8 <= len(wav):
        tag, size = wav[pos:pos + 4], int.from_bytes(wav[pos + 4:pos + 8], "little")
        if tag == b"fmt ":
            channels = int.from_bytes(wav[pos + 10:pos + 12], "little")
        elif tag == b"data":
            if not channels:
                break
            x = np.frombuffer(wav, "<f4", count=(len(wav) - pos - 8) // (4 * channels) * channels, offset=pos + 8)
            return x.reshape(-1, channels).copy()
        pos += 8 + size + (size & 1)
    raise RuntimeError("no samples in ffmpeg's WAV")


def decode(data: bytes, suffix: str, tmp: str, ffmpeg: str, ffprobe: str) -> tuple[np.ndarray, dict]:
    """((samples, channels) float32 at 44.1 kHz, what ffprobe says of the file). clap_catalog.decode's path:
    the bytes go to a temp file whose name is removed before anything reads it through the open descriptor."""
    fd, path = tempfile.mkstemp(suffix=suffix, dir=tmp)
    try:
        try:
            with os.fdopen(os.dup(fd), "wb") as f:
                f.write(data)
        finally:
            os.unlink(path)
        os.lseek(fd, 0, os.SEEK_SET)
        q = subprocess.run([ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries",
                            "stream=codec_name,profile,sample_rate,channels,bit_rate:format=duration,bit_rate,format_name",
                            "-of", "json", f"/dev/fd/{fd}"], pass_fds=(fd,), capture_output=True, timeout=60)
        os.lseek(fd, 0, os.SEEK_SET)
        p = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-i", f"/dev/fd/{fd}", "-vn", "-map", "0:a:0",
                            "-ar", "44100", "-c:a", "pcm_f32le", "-f", "wav", "pipe:1"],
                           pass_fds=(fd,), capture_output=True, timeout=120, start_new_session=True)
    finally:
        os.close(fd)
    if p.returncode or not p.stdout:
        raise RuntimeError((p.stderr.decode(errors="replace").strip() or f"ffmpeg exit {p.returncode}")[:300])
    probe = {"bytes": len(data)}
    try:
        info = json.loads(q.stdout.decode() or "{}")
        st, fm = (info.get("streams") or [{}])[0], info.get("format") or {}
        probe |= {"codec": st.get("codec_name"), "profile": st.get("profile"), "sample_rate": st.get("sample_rate"),
                  "channels": st.get("channels"), "bit_rate": st.get("bit_rate") or fm.get("bit_rate"),
                  "container_s": fm.get("duration"), "format": fm.get("format_name")}
    except ValueError:
        pass
    return channels_of_wav(p.stdout), probe


def read_exact(f, n: int) -> bytes:
    out = bytearray()
    while len(out) < n:
        chunk = f.read(n - len(out))
        if not chunk:
            raise EOFError
        out += chunk
    return bytes(out)


def records(f):
    while True:
        try:
            (n,) = struct.unpack("<I", read_exact(f, 4))
        except EOFError:
            return
        head = json.loads(read_exact(f, n))
        yield head, [read_exact(f, size) for size in head.get("sizes", [])]


def run(args) -> int:
    import store_effect_dsp as dsp

    busy = subprocess.run(["pgrep", "-fl", BUSY], capture_output=True, text=True).stdout.strip()
    busy = "\n".join(line for line in busy.splitlines() if "pgrep" not in line and "store_effect" not in line)
    if busy:
        print(f"another model job is running; not starting:\n{busy}", file=sys.stderr)
        return 1
    CACHE.mkdir(exist_ok=True)
    if shutil.disk_usage(CACHE).free < MIN_FREE:
        print("under 5 GB of free disk; not starting", file=sys.stderr)
        return 1
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not (ffmpeg and ffprobe):
        print("ffmpeg and ffprobe must be on PATH", file=sys.stderr)
        return 1
    try:
        os.nice(19)
    except OSError:
        pass
    sys.path.insert(0, str(REPO / "experiments" / "preview_features"))
    import clap_catalog

    con = sqlite3.connect(DB, timeout=60)
    con.executescript(SCHEMA)
    state = {"albums": {k: json.loads(v) for k, v in con.execute("SELECT key, info FROM album")},
             "youtube": {k: json.loads(v) for k, v in con.execute("SELECT key, info FROM yt")}}
    state_path = CACHE / "store_effect_state.json"
    state_path.write_text(json.dumps(state))

    t0 = time.monotonic()
    embed, device, _ = clap_catalog.load_model()
    free = dict(zip(embed.__code__.co_freevars, (c.cell_contents for c in embed.__closure__)))
    fe, resample_poly, window = free["fe"], free["resample_poly"], free["window"]
    log(f"CLAP on {device} in {time.monotonic() - t0:.0f} s; feature extractor: {fe.sampling_rate} Hz, "
        f"{fe.feature_size} mel bands {fe.frequency_min:.0f}-{fe.frequency_max:.0f} Hz, fft {fe.fft_window_size}, hop {fe.hop_length}, "
        f"truncation {fe.truncation}, padding {fe.padding}")
    con.execute("INSERT OR REPLACE INTO meta VALUES ('feature_extractor', ?)", (json.dumps({
        "sampling_rate": fe.sampling_rate, "n_mels": fe.feature_size, "fmin": fe.frequency_min, "fmax": fe.frequency_max,
        "n_fft": fe.fft_window_size, "hop": fe.hop_length, "truncation": fe.truncation, "padding": fe.padding}),))
    con.execute("INSERT OR REPLACE INTO meta VALUES ('recipe', ?)", (clap_catalog.RECIPE,))

    def mel_mean(mono: np.ndarray) -> np.ndarray:
        """Mean over time of the model's own input (log-mel, dB) per mel band, over the recipe's windows."""
        x = resample_poly(mono, 160, 147).astype(np.float32)
        wins = [x] if len(x) <= window else [x[s:s + window] for s in np.linspace(0, len(x) - window, 3).round().astype(int)]
        m = [np.asarray(fe([w], sampling_rate=48000, return_tensors="np")["input_features"]).reshape(-1, fe.feature_size).mean(axis=0)
             for w in wins]
        return np.mean(m, axis=0).astype("<f4")

    def mel_frame_diff(dz: np.ndarray, it: np.ndarray) -> dict:
        """Frame by frame over the first 10 s of the aligned pair, per mel band: iTunes minus Deezer in dB
        (mean), its absolute value (mean), and each store's spread over time."""
        m = [np.asarray(fe([resample_poly(x, 160, 147).astype(np.float32)[:window]], sampling_rate=48000,
                           return_tensors="np")["input_features"]).reshape(-1, fe.feature_size) for x in (dz, it)]
        n = min(len(m[0]), len(m[1]))
        d = m[1][:n] - m[0][:n]
        r = lambda v: [round(float(x), 3) for x in v]  # noqa: E731
        return {"signed": r(d.mean(axis=0)), "abs": r(np.abs(d).mean(axis=0)), "sd_deezer": r(m[0][:n].std(axis=0)),
                "sd_itunes": r(m[1][:n].std(axis=0))}

    def put(kind, key, unit, store, variant, vec):
        con.execute("INSERT OR REPLACE INTO emb VALUES (?,?,?,?,?,?)", (kind, key, unit, store, variant, np.asarray(vec, "<f4").tobytes()))

    def embed_all(kind, key, unit, store, mono, names) -> None:
        seed = zlib.crc32(f"{kind}|{key}|{unit}|{store}".encode())
        for name in names:
            try:
                put(kind, key, unit, store, name, embed(dsp.VARIANTS[name](mono, ffmpeg, seed)))
            except Exception as e:
                log(f"  {key}/{unit}/{store}/{name}: {type(e).__name__}: {e}"[:200])

    tmp = tempfile.mkdtemp(prefix="decode-", dir=CACHE)
    cmd = [str(args.fetch_python), str(HERE / "store_effect_fetch.py"), "--albums", str(args.albums), "--youtube", str(args.youtube),
           "--seed", str(args.seed), "--state", str(state_path)]
    if not args.no_effnet and (EFFNET_DIR / "discogs-effnet-bs1-1.pb").exists():
        cmd += ["--effnet", str(EFFNET_DIR)]
    env = os.environ | {"PYTHONDONTWRITEBYTECODE": "1"}
    child = subprocess.Popen(cmd, stdout=subprocess.PIPE, env=env, cwd=str(HERE))
    stop = {"asked": False}

    def on_signal(*_):
        stop["asked"] = True
        child.terminate()
    sig.signal(sig.SIGTERM, on_signal)
    sig.signal(sig.SIGINT, on_signal)

    names = list(dsp.VARIANTS)
    n_pairs = n_yt = 0
    try:
        for head, payloads in records(child.stdout):
            kind, key = head["type"], head.get("key")
            if kind == "pair":
                t = time.monotonic()
                unit = head["unit"]
                try:
                    monos, info = {}, {k: v for k, v in head.items() if k not in ("type", "sizes", "effnet")}
                    for store, data, suffix, eff in zip(("deezer", "itunes"), payloads, head["suffixes"], head.get("effnet") or [None, None]):
                        ch, probe = decode(data, suffix, tmp, ffmpeg, ffprobe)
                        d, spec, mono = dsp.diagnostics(ch)
                        monos[store] = mono
                        try:  # the one variant that works on the file's channels, not on the mono clip
                            put("clip", key, unit, store, "mp3st", embed(dsp.mp3_stereo(ch, ffmpeg)))
                        except Exception as e:
                            log(f"  {key}/{unit}/{store}/mp3st: {type(e).__name__}: {e}"[:200])
                        con.execute("INSERT OR REPLACE INTO meas VALUES (?,?,?,?,?,?,?)", (
                            "clip", key, unit, store, json.dumps(d | probe), spec.tobytes(), mel_mean(mono).tobytes()))
                        if eff is not None:
                            put("effnet", key, unit, store, "base", eff)
                        del ch
                    al = dsp.align(monos["deezer"], monos["itunes"])
                    info["align"] = al
                    for store in ("deezer", "itunes"):
                        embed_all("clip", key, unit, store, monos[store], names)
                    if al["offset_s"] is not None and al["overlap_s"] >= ALIGNED_MIN_S:
                        cut = dict(zip(("deezer", "itunes"), dsp.cut_aligned(monos["deezer"], monos["itunes"], al["offset_s"])))
                        for store in ("deezer", "itunes"):
                            con.execute("INSERT OR REPLACE INTO meas VALUES (?,?,?,?,?,?,?)", (
                                "aligned", key, unit, store, json.dumps({"seconds": round(len(cut[store]) / 44100, 3)}),
                                dsp.band_spectrum(cut[store]).tobytes(), mel_mean(cut[store]).tobytes()))
                            embed_all("aligned", key, unit, store, cut[store], dsp.ALIGNED)
                        info["aligned"] = True
                        info["mel_frames"] = mel_frame_diff(cut["deezer"], cut["itunes"])
                    con.execute("INSERT OR REPLACE INTO pair VALUES (?,?,?)", (key, unit, json.dumps(info)))
                    con.commit()
                    n_pairs += 1
                    log(f"pair {n_pairs}\t{key}/{unit}\toffset {al['offset_s']} s by {al['by']} (wave {al['wave_ncc']:.2f}, env {al['env_corr']:.2f}),"
                        f" overlap {al['overlap_s']:.1f} s\t{time.monotonic() - t:.0f} s\t{head['title'][:50]}")
                except Exception as e:
                    con.rollback()
                    log(f"pair {key}/{unit} failed: {type(e).__name__}: {e}"[:300])
            elif kind == "album":
                con.execute("INSERT OR REPLACE INTO album VALUES (?,?)", (key, json.dumps({k: v for k, v in head.items() if k not in ("type", "sizes")})))
                con.commit()
            elif kind == "ytwin":
                mono = np.frombuffer(payloads[0], "<f4").copy()
                d, spec, mono = dsp.diagnostics(mono[:, None])
                con.execute("INSERT OR REPLACE INTO meas VALUES (?,?,?,?,?,?,?)", (
                    "yt", key, head["unit"], "youtube", json.dumps(d | {"start_s": head["start_s"], "index": head["index"]}),
                    spec.tobytes(), mel_mean(mono).tobytes()))
                embed_all("yt", key, head["unit"], "youtube", mono, names)
                con.commit()
                n_yt += 1
            elif kind == "yt":
                con.execute("INSERT OR REPLACE INTO yt VALUES (?,?)", (key, json.dumps({k: v for k, v in head.items() if k not in ("type", "sizes")})))
                con.commit()
                log(f"youtube\t{key}\t{head['status']}\t{head.get('class')}\t{head.get('n_windows', 0)} windows ({n_yt} so far)")
            elif kind == "end":
                log(f"fetcher: {head['reason']}")
                con.execute("INSERT OR REPLACE INTO meta VALUES ('last_end', ?)", (head["reason"],))
                con.commit()
            if stop["asked"]:
                break
    finally:
        con.commit()
        con.close()
        if child.poll() is None:
            child.terminate()
        child.wait()
        shutil.rmtree(tmp, ignore_errors=True)
    log(f"done: {n_pairs} pairs and {n_yt} YouTube windows in {(time.monotonic() - t0) / 60:.0f} min; fetcher exit {child.returncode}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--fetch-python", required=True, type=Path)
    r.add_argument("--albums", type=int, default=120)
    r.add_argument("--youtube", type=int, default=25)
    r.add_argument("--seed", type=int, default=0)
    r.add_argument("--no-effnet", action="store_true")
    sub.add_parser("report")
    args = ap.parse_args(argv)
    if args.cmd == "run":
        return run(args)
    import store_effect_report
    return store_effect_report.main()


if __name__ == "__main__":
    sys.exit(main())
