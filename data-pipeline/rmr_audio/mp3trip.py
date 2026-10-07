"""The MP3 round trip behind the `clap_mp3` variant: a clip that did not come from Deezer is given Deezer's
encoding before CLAP hears it (experiments/audio_10k/results/store_effect_fix.md: CLAP tells the stores
apart by how a 128 kbit/s stereo MP3 codes the 12 to 14 kHz band).

  decoded clip, with its channels, 44.1 kHz
    -> libmp3lame 128 kbit/s, joint stereo, LAME's defaults (what a Deezer preview is)
    -> decoded again -> (L+R)/2 -> the CLAP recipe unchanged

ffmpeg does both steps through pipes: no file is written. The encoder's delay (about 25 ms) stays in and
the length is brought back to the input's, as the experiment did (store_effect_dsp.mp3_stereo, which is now
this module's).

Channels. The encode must be a STEREO encode: the same round trip on the mono mix does not remove the store
effect (same-track cosine 0.82 against 0.95). So:
  2 channels      encoded as they are.
  1 channel       duplicated to L = R and encoded as stereo (`as_stereo`). That is what a store does with a
                  mono recording: Deezer's previews are stereo files whatever the recording.
  3 or more       averaged to one channel (as the baseline's decoder averages them), then as 1 channel.
`roundtrip` is the pipeline's entry and applies these rules; `mp3_stereo` encodes whatever it is given.

numpy and the standard library only, so the torch environment (the CLAP worker) can import it.
"""
import os
import subprocess
import tempfile

import numpy as np

SR = 44100
KBPS = 128
RECIPE = (f"decoded with its channels at 44.1 kHz -> MP3 {KBPS} kbit/s stereo round trip (ffmpeg libmp3lame, pipes; mono "
          "duplicated to L = R) -> (L+R)/2 -> the clap recipe; a deezer clip: the clap vector itself")


def channels_of_wav(wav: bytes) -> np.ndarray:
    """(samples, channels) float32 of ffmpeg's WAV stream: clap_catalog.mono_of_wav without the average."""
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
            return x.reshape(-1, channels).copy()
        pos += 8 + size + (size & 1)
    raise RuntimeError("no samples in ffmpeg's WAV")


def mono_of(channels: np.ndarray) -> np.ndarray:
    """The channel average, to the bit what clap_catalog.mono_of_wav gives for the same stream."""
    return channels[:, 0].copy() if channels.shape[1] == 1 else channels.mean(axis=1, dtype=np.float32)


def decode_channels(data: bytes, suffix: str, tmp: str | None, ffmpeg: str) -> np.ndarray:
    """(samples, channels) float32 at 44.1 kHz of a downloaded clip. clap_catalog.decode's path and ffmpeg
    arguments (so the mean of these channels is the baseline's mono buffer): the bytes go to a temp file
    whose name is removed before ffmpeg reads it through the open descriptor."""
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
    return channels_of_wav(p.stdout)


def mp3_stereo(channels: np.ndarray, ffmpeg: str, kbps: int = KBPS) -> np.ndarray:
    """`channels` (samples, n) through libmp3lame at `kbps` with its n channels (joint stereo for two, LAME's
    defaults) and back, then the channel average: mono float32 of the input's length."""
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


def as_stereo(channels: np.ndarray) -> np.ndarray:
    """Two channels for the encoder: a stereo signal as it is, anything else as its average on both sides."""
    if channels.ndim == 1:
        channels = channels[:, None]
    if channels.shape[1] == 2:
        return channels
    mono = mono_of(channels)
    return np.stack([mono, mono], axis=1)


def roundtrip(channels: np.ndarray, ffmpeg: str) -> np.ndarray:
    """The clip as CLAP gets it under `clap_mp3`: mono float32 at 44.1 kHz after the stereo MP3 round trip."""
    return mp3_stereo(as_stereo(channels), ffmpeg, KBPS)
