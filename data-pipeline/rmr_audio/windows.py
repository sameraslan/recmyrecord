"""Windows of a full-length album: which 30 seconds of which file are embedded when the audio is whole
files (the owner's, or a full-length source) and not one store preview per track.

The rule (experiments/preview_features/results/solutions_audio_gaps.md, B.3):

  n = clamp(round(total runtime / 5 min), 4, 8)   windows go into the album mean (n_windows)
  8 are always laid out and embedded (plan), ranked so that the first n of them are the n-window
  sample for every n: a later change of n needs no second pass over the files.

Laying out the 8:

  share   The usable runtime (files of 5 s or more, end to end in file order) is cut into 8 equal
          parts and a file gets one window per part whose midpoint falls inside it. That is a share in
          proportion to duration (within one of 8 * d / total), and among tracks of similar length the
          ones that get a window are spread through the album, not the eight longest.
          A file never gets more windows than fit side by side inside its margins (capacity); windows
          it cannot take go to the files with the most runtime per window that still have room. An
          album too short for 8 gets as many as fit.
  place   A file's k windows share the span between its margins, [15 s, d - 15 s]: centres at
          15 + (i + 0.5) / k * (d - 30). With k <= capacity no window starts in the first 15 s or ends
          in the last 15 s, and none overlap.
  short   A file under 60 s cannot hold a window and both margins. From 30 to 60 s it gets one window in
          its middle (the margins shrink evenly); under 30 s the whole file is the window; under 5 s it
          is left out (too short to embed).
  rank    The windows in album order (file, then start) take the ranks of clips.priority_order: first,
          middle, quarters, ... so any prefix is spread through the album.

Decoding reads only the window: ffmpeg seeks to its start (`-ss` before `-i`) and stops after its length.
"""
import bisect
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .clips import priority_order

WINDOW_S = 30.0
MARGIN_S = 15.0  # no window in the first or last 15 s of a file
MIN_WINDOWS, MAX_WINDOWS = 4, 8
PER_WINDOW_S = 300.0  # one window per five minutes of album
MIN_FILE_S = 5.0  # a shorter file cannot be embedded (embed.MIN_SAMPLES, clap_catalog.MIN_SAMPLES)
SR = 44100
VERSION = "windows-1"  # part of a local album's signature: a change of the rule lays its windows out again


@dataclass(frozen=True)
class Window:
    file: int  # index into the durations given to plan()
    start_s: float
    length_s: float
    index: int  # position in album order
    rank: int  # position in the sampling order: the n-window sample is rank < n


def n_windows(total_s: float) -> int:
    """How many windows go into the mean of an album of this runtime: one per five minutes, 4 to 8."""
    return int(min(MAX_WINDOWS, max(MIN_WINDOWS, math.floor(total_s / PER_WINDOW_S + 0.5))))


def capacity(duration_s: float) -> int:
    """The most windows one file can take: side by side between its margins; 1 for a file too short for
    the margins; 0 for one too short to embed."""
    if not duration_s or duration_s < MIN_FILE_S:
        return 0
    if duration_s < WINDOW_S + 2 * MARGIN_S:
        return 1
    return int((duration_s - 2 * MARGIN_S) // WINDOW_S)


def allocate(durations: list[float], k: int = MAX_WINDOWS) -> list[int]:
    """Windows per file (see the module docstring, `share`)."""
    caps = [capacity(d) for d in durations]
    k = min(k, sum(caps))
    counts = [0] * len(durations)
    usable = [i for i, c in enumerate(caps) if c]
    if not k:
        return counts
    ends, total = [], 0.0
    for i in usable:
        total += durations[i]
        ends.append(total)
    for j in range(k):
        at = min(bisect.bisect_right(ends, (j + 0.5) / k * total), len(usable) - 1)
        counts[usable[at]] += 1
    spare = 0
    for i in usable:
        if counts[i] > caps[i]:
            spare, counts[i] = spare + counts[i] - caps[i], caps[i]
    for _ in range(spare):
        room = [i for i in usable if counts[i] < caps[i]]
        counts[max(room, key=lambda i: (durations[i] / (counts[i] + 1), -i))] += 1
    return counts


def place(duration_s: float, k: int) -> list[tuple[float, float]]:
    """(start, length) in seconds of a file's k windows (see `place` and `short` above)."""
    if k <= 0:
        return []
    if duration_s <= WINDOW_S:
        return [(0.0, float(duration_s))]
    if duration_s < WINDOW_S + 2 * MARGIN_S:
        return [((duration_s - WINDOW_S) / 2, WINDOW_S)]
    span = duration_s - 2 * MARGIN_S
    return [(MARGIN_S + (i + 0.5) / k * span - WINDOW_S / 2, WINDOW_S) for i in range(k)]


def plan(durations: list[float], k: int = MAX_WINDOWS) -> list[Window]:
    """Up to k windows over the files of one album (durations in seconds, in track order), in rank order."""
    spots = [(f, start, length) for f, n in enumerate(allocate(durations, k))
             for start, length in place(durations[f], n)]
    rank_of = {index: rank for rank, index in enumerate(priority_order(len(spots)))} if spots else {}
    return sorted((Window(f, start, length, i, rank_of[i]) for i, (f, start, length) in enumerate(spots)),
                  key=lambda w: w.rank)


# --- the files ---------------------------------------------------------------------------------------

def probe_duration(path: Path | str, ffprobe: str) -> float | None:
    """The file's length in seconds as its container states it; None when ffprobe cannot read it."""
    p = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
                       capture_output=True, timeout=60)
    try:
        seconds = float(p.stdout.decode().strip())
    except ValueError:
        return None
    return seconds if p.returncode == 0 and math.isfinite(seconds) and seconds > 0 else None


def decode_window(path: Path | str, start_s: float, length_s: float, ffmpeg: str, mono_of_wav) -> np.ndarray:
    """Mono float32 at 44.1 kHz of one window of a file. ffmpeg seeks to the start and reads `length_s`:
    the rest of the file is never decoded or held in memory. `mono_of_wav` is clap_catalog's (the same
    channel average as the previews get)."""
    p = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-ss", f"{start_s:.3f}", "-t", f"{length_s:.3f}", "-i", str(path),
                        "-vn", "-map", "0:a:0", "-ar", str(SR), "-c:a", "pcm_f32le", "-f", "wav", "pipe:1"],
                       capture_output=True, timeout=300, start_new_session=True)
    if p.returncode or not p.stdout:
        raise RuntimeError((p.stderr.decode(errors="replace").strip() or f"ffmpeg exit {p.returncode}")[:300])
    return mono_of_wav(p.stdout)
