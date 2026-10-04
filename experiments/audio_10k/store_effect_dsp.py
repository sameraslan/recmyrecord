"""Signal helpers for store_effect_fix.py: the preprocessing variants (each maps mono 44.1 kHz audio to mono
44.1 kHz audio, so the CLAP recipe after it is unchanged), the waveform diagnostics and the alignment of
two excerpts of one track. numpy and scipy only; nothing here reads or writes a file.
"""
import subprocess

import numpy as np
from scipy import signal

SR = 44100
RMS_TARGET_DB = -20.0  # `loud`: the clip scaled so that its RMS is -20 dBFS
ALIGN_SR = 8000
ALIGN_MIN_OVERLAP_S = 5.0  # a lag is only scored when the two excerpts share at least this much
WAVE_NCC_MIN = 0.5  # waveform correlation at the best lag from which the two are called the same master
ENV_CORR_MIN = 0.6  # envelope correlation from which they are called the same stretch of music
BAND_HZ = 250.0  # width of the bands of the stored spectrum


# --- variants ------------------------------------------------------------------------------------

def via_rate(x: np.ndarray, rate: int) -> np.ndarray:
    """Down to `rate` and back to 44.1 kHz (polyphase, scipy's default Kaiser filter): nothing above
    rate / 2 is left."""
    g = np.gcd(rate, SR)
    down = signal.resample_poly(x, rate // g, SR // g)
    return signal.resample_poly(down, SR // g, rate // g)[:len(x)].astype(np.float32)


_FIR: dict[int, np.ndarray] = {}


def lowpass(x: np.ndarray, cutoff_hz: int) -> np.ndarray:
    """Steep linear-phase low-pass (1023 taps, Kaiser beta 10: about -100 dB from 300 Hz above the
    cut-off), applied without delay."""
    if cutoff_hz not in _FIR:
        _FIR[cutoff_hz] = signal.firwin(1023, cutoff_hz, window=("kaiser", 10.0), fs=SR).astype(np.float64)
    return signal.fftconvolve(x, _FIR[cutoff_hz], mode="same").astype(np.float32)


def loud(x: np.ndarray) -> np.ndarray:
    """The whole clip scaled to RMS -20 dBFS (no limiter: float samples may pass 1.0)."""
    rms = float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))
    return x if rms < 1e-7 else (x * (10 ** (RMS_TARGET_DB / 20) / rms)).astype(np.float32)


def noise(x: np.ndarray, db_below_rms: float, seed: int = 0) -> np.ndarray:
    """White noise this far under the clip's RMS added: it fills the holes an encoder leaves in the
    spectrum (a log-mel input shows an empty band as a very low number)."""
    rms = float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))
    n = np.random.default_rng(seed).standard_normal(len(x)).astype(np.float32)
    return (x + n * rms * 10 ** (-db_below_rms / 20)).astype(np.float32)


def mp3_roundtrip(x: np.ndarray, ffmpeg: str, kbps: int = 128) -> np.ndarray:
    """Through libmp3lame at `kbps` (mono) and back, pipes only: no file is written."""
    enc = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
                          "-c:a", "libmp3lame", "-b:a", f"{kbps}k", "-f", "mp3", "pipe:1"],
                         input=np.ascontiguousarray(x, "<f4").tobytes(), capture_output=True, timeout=120)
    if enc.returncode or not enc.stdout:
        raise RuntimeError(enc.stderr.decode(errors="replace")[:300] or "mp3 encode failed")
    dec = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-f", "mp3", "-i", "pipe:0", "-ar", str(SR), "-ac", "1",
                          "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"], input=enc.stdout, capture_output=True, timeout=120)
    if dec.returncode or not dec.stdout:
        raise RuntimeError(dec.stderr.decode(errors="replace")[:300] or "mp3 decode failed")
    y = np.frombuffer(dec.stdout, "<f4")
    # the encoder's delay (about 25 ms) stays in; the length is brought back to the input's
    return (y[:len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))).astype(np.float32)


def mp3_stereo(channels: np.ndarray, ffmpeg: str, kbps: int = 128) -> np.ndarray:
    """The decoded preview with its channels, through libmp3lame at 128 kbit/s (joint stereo, LAME's
    defaults: what a Deezer preview is, as far as ffprobe shows) and back, then (L+R)/2. For an iTunes
    preview this imitates the Deezer encoding; a Deezer preview gets encoded a second time."""
    n_ch = channels.shape[1]
    enc = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-f", "f32le", "-ar", str(SR), "-ac", str(n_ch), "-i", "pipe:0",
                          "-c:a", "libmp3lame", "-b:a", f"{kbps}k", "-f", "mp3", "pipe:1"],
                         input=np.ascontiguousarray(channels, "<f4").tobytes(), capture_output=True, timeout=120)
    if enc.returncode or not enc.stdout:
        raise RuntimeError(enc.stderr.decode(errors="replace")[:300] or "mp3 encode failed")
    dec = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-f", "mp3", "-i", "pipe:0", "-ar", str(SR),
                          "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"], input=enc.stdout, capture_output=True, timeout=120)
    if dec.returncode or not dec.stdout:
        raise RuntimeError(dec.stderr.decode(errors="replace")[:300] or "mp3 decode failed")
    y = np.frombuffer(dec.stdout, "<f4")
    y = y[:len(y) // n_ch * n_ch].reshape(-1, n_ch).mean(axis=1, dtype=np.float32)
    n = len(channels)
    return (y[:n] if len(y) >= n else np.pad(y, (0, n - len(y)))).astype(np.float32)


VARIANTS = {
    "base": lambda x, ff, seed: x,
    "rs32": lambda x, ff, seed: via_rate(x, 32000),
    "rs22": lambda x, ff, seed: via_rate(x, 22050),
    "rs16": lambda x, ff, seed: via_rate(x, 16000),
    "lp15": lambda x, ff, seed: lowpass(x, 15000),
    "lp14": lambda x, ff, seed: lowpass(x, 14000),
    "lp13": lambda x, ff, seed: lowpass(x, 13000),
    "lp12": lambda x, ff, seed: lowpass(x, 12000),
    "lp10": lambda x, ff, seed: lowpass(x, 10000),
    "loud": lambda x, ff, seed: loud(x),
    "loud_rs22": lambda x, ff, seed: loud(via_rate(x, 22050)),
    "loud_rs16": lambda x, ff, seed: loud(via_rate(x, 16000)),
    "loud_lp12": lambda x, ff, seed: loud(lowpass(x, 12000)),
    "mp3": lambda x, ff, seed: mp3_roundtrip(x, ff),
    "loud_noise50": lambda x, ff, seed: loud(noise(x, 50.0, seed)),
}
ALIGNED = ("base", "loud", "rs22", "rs16", "lp14", "lp12", "loud_rs16", "mp3")
LABEL = {
    "base": "as it is (baseline)", "rs32": "via 32 kHz (content to 16 kHz)", "rs22": "via 22.05 kHz (to 11 kHz)",
    "rs16": "via 16 kHz (to 8 kHz)", "lp15": "low-pass 15 kHz", "lp14": "low-pass 14 kHz", "lp13": "low-pass 13 kHz",
    "lp12": "low-pass 12 kHz", "lp10": "low-pass 10 kHz", "loud": "loudness (RMS -20 dBFS)",
    "loud_rs22": "loudness + via 22.05 kHz", "loud_rs16": "loudness + via 16 kHz", "loud_lp12": "loudness + low-pass 12 kHz",
    "mp3": "MP3 128k round trip (mono)", "loud_noise50": "loudness + white noise 50 dB under the clip",
    "mp3st": "MP3 128k round trip of the stereo file (as Deezer encodes)",
}


# --- diagnostics ---------------------------------------------------------------------------------

def db(power: float) -> float:
    return float(10 * np.log10(max(power, 1e-20)))


def band_spectrum(x: np.ndarray) -> np.ndarray:
    """Power per 250 Hz band, 0 to 22 kHz, in dB re full scale (Welch, 4096-sample Hann frames)."""
    f, p = signal.welch(x.astype(np.float64), fs=SR, nperseg=4096, noverlap=2048, scaling="spectrum")
    edges = np.arange(0, SR / 2 + BAND_HZ, BAND_HZ)
    idx = np.clip(np.digitize(f, edges) - 1, 0, len(edges) - 2)
    out = np.zeros(len(edges) - 1)
    np.add.at(out, idx, p)
    return (10 * np.log10(np.maximum(out, 1e-20))).astype(np.float32)


def _k_weight(x: np.ndarray) -> np.ndarray:
    """BS.1770's two filters at 44.1 kHz (the shelf and the high-pass, coefficients from their analogue forms)."""
    def biquad(f0, q, gain_db, kind):
        a = 10 ** (gain_db / 40)
        w = 2 * np.pi * f0 / SR
        alpha = np.sin(w) / (2 * q)
        c = np.cos(w)
        if kind == "shelf":
            s = 2 * np.sqrt(a) * alpha
            b = [a * ((a + 1) + (a - 1) * c + s), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - s)]
            d = [(a + 1) - (a - 1) * c + s, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - s]
        else:
            b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
            d = [1 + alpha, -2 * c, 1 - alpha]
        return np.array(b) / d[0], np.array(d) / d[0]
    y = signal.lfilter(*biquad(1681.97, 0.7071, 4.0, "shelf"), x.astype(np.float64))
    return signal.lfilter(*biquad(38.135, 0.5, 0.0, "highpass"), y)


def lufs(x: np.ndarray) -> float:
    """Integrated loudness of the mono signal, BS.1770 gating (400 ms blocks, -70 absolute, -10 relative)."""
    y = _k_weight(x)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < block:
        return -0.691 + db(float(np.mean(y ** 2)))
    c = np.concatenate([[0.0], np.cumsum(y ** 2)])
    starts = np.arange(0, len(y) - block + 1, hop)
    ms = (c[starts + block] - c[starts]) / block
    l = -0.691 + 10 * np.log10(np.maximum(ms, 1e-20))
    keep = ms[l > -70]
    if not len(keep):
        return -70.0
    keep = keep[l[l > -70] > -0.691 + db(float(keep.mean())) - 10]
    return -0.691 + db(float(keep.mean())) if len(keep) else -70.0


def diagnostics(channels: np.ndarray) -> dict:
    """What the waveform says: `channels` is (samples, channels) float32 at 44.1 kHz."""
    mono = channels.mean(axis=1, dtype=np.float32)
    p = float(np.mean(mono.astype(np.float64) ** 2))
    half = int(0.5 * SR)
    out = {"seconds": round(len(mono) / SR, 3), "n_channels": int(channels.shape[1]), "rms_db": round(db(p), 2),
           "peak_db": round(db(float(np.max(np.abs(mono))) ** 2), 2), "lufs": round(lufs(mono), 2),
           "head_db": round(db(float(np.mean(mono[:half].astype(np.float64) ** 2))) - db(p), 2),
           "tail_db": round(db(float(np.mean(mono[-half:].astype(np.float64) ** 2))) - db(p), 2)}
    if channels.shape[1] >= 2:
        left, right = channels[:, 0].astype(np.float64), channels[:, 1].astype(np.float64)
        side, mid = (left - right) / 2, (left + right) / 2
        out["side_db"] = round(db(float(np.mean(side ** 2))) - db(float(np.mean(mid ** 2))), 2)  # side energy re mid
        den = float(np.sqrt(np.sum(left ** 2) * np.sum(right ** 2)))
        out["lr_corr"] = round(float(np.sum(left * right) / den), 4) if den > 0 else None
        out["mono_loss_db"] = round(db(float(np.mean(mid ** 2))) - db(float((np.mean(left ** 2) + np.mean(right ** 2)) / 2)), 2)
    return out, band_spectrum(mono), mono


def cutoff_hz(spec_db: np.ndarray, floor_db: float = -100.0) -> float:
    """Top of the highest 250 Hz band holding more than `floor_db` re full scale: above it there is next
    to nothing."""
    above = np.nonzero(spec_db > floor_db)[0]
    return float((above[-1] + 1) * BAND_HZ) if len(above) else 0.0


# --- alignment -----------------------------------------------------------------------------------

def _ncc(a: np.ndarray, b: np.ndarray, min_overlap: int) -> tuple[int, float]:
    """(lag, correlation) maximising sum(a[n + lag] * b[n]) / the two energies over the overlap."""
    c = signal.correlate(a, b, mode="full", method="fft")
    lags = np.arange(-(len(b) - 1), len(a))
    ca, cb = np.concatenate([[0.0], np.cumsum(a ** 2)]), np.concatenate([[0.0], np.cumsum(b ** 2)])
    a0, a1 = np.maximum(lags, 0), np.minimum(len(a), lags + len(b))
    b0, b1 = a0 - lags, a1 - lags
    ok = (a1 - a0) >= min_overlap
    den = np.sqrt(np.maximum((ca[np.maximum(a1, a0)] - ca[a0]) * (cb[np.maximum(b1, b0)] - cb[b0]), 1e-20))
    score = np.where(ok, c / den, -np.inf)
    i = int(np.argmax(score))
    return int(lags[i]), float(score[i])


def align(dz: np.ndarray, it: np.ndarray) -> dict:
    """Where the iTunes excerpt starts relative to the Deezer one, in seconds of the track (positive: iTunes
    starts later). Two estimates: the waveforms at 8 kHz (sharp, needs the same master), and the loudness
    envelopes at 100 Hz (10 ms RMS frames in dB, mean removed; survives another master). `offset_s` is the
    waveform's when its correlation reaches WAVE_NCC_MIN, else the envelope's when that reaches ENV_CORR_MIN,
    else None (no common stretch found)."""
    a = signal.resample_poly(dz.astype(np.float64), 80, 441)
    b = signal.resample_poly(it.astype(np.float64), 80, 441)
    lag_w, ncc_w = _ncc(a, b, int(ALIGN_MIN_OVERLAP_S * ALIGN_SR))

    def env(x):
        n = len(x) // 80
        e = 10 * np.log10(np.maximum(np.mean(x[:n * 80].reshape(n, 80) ** 2, axis=1), 1e-10))
        return e
    ea, eb = env(a), env(b)
    # Pearson per lag over the overlap, by brute force (a few thousand lags of at most 3,000 frames)
    best = (0, -np.inf)
    min_frames = int(ALIGN_MIN_OVERLAP_S * 100)
    for lag in range(-(len(eb) - min_frames), len(ea) - min_frames + 1):
        a0, a1 = max(lag, 0), min(len(ea), lag + len(eb))
        u, v = ea[a0:a1], eb[a0 - lag:a1 - lag]
        u, v = u - u.mean(), v - v.mean()
        den = np.sqrt(np.dot(u, u) * np.dot(v, v))
        r = float(np.dot(u, v) / den) if den > 0 else -np.inf
        if r > best[1]:
            best = (lag, r)
    out = {"wave_offset_s": round(lag_w / ALIGN_SR, 4), "wave_ncc": round(ncc_w, 4),
           "env_offset_s": round(best[0] / 100, 2), "env_corr": round(best[1], 4)}
    if ncc_w >= WAVE_NCC_MIN:
        out |= {"offset_s": lag_w / ALIGN_SR, "by": "waveform"}
    elif best[1] >= ENV_CORR_MIN:
        out |= {"offset_s": best[0] / 100, "by": "envelope"}
    else:
        out |= {"offset_s": None, "by": "none"}
    if out["offset_s"] is not None:
        s = int(round(out["offset_s"] * SR))
        a0, a1 = max(s, 0), min(len(dz), s + len(it))
        out["overlap_s"] = round(max(a1 - a0, 0) / SR, 3)
    else:
        out["overlap_s"] = 0.0
    return out


def cut_aligned(dz: np.ndarray, it: np.ndarray, offset_s: float) -> tuple[np.ndarray, np.ndarray]:
    """The two excerpts cut to the stretch of the track they share."""
    s = int(round(offset_s * SR))
    a0, a1 = max(s, 0), min(len(dz), s + len(it))
    return dz[a0:a1], it[a0 - s:a1 - s]
