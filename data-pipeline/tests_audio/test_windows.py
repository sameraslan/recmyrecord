"""The window sampler for full-length files: how many, where, in which order. The last tests decode synthetic
WAV files with the system ffmpeg (skipped when it is not installed); no model, no network."""
import random
import shutil
import wave

import numpy as np
import pytest

from rmr_audio import windows
from rmr_audio.onepass_worker import clap_catalog
from rmr_audio.windows import MARGIN_S, SR, WINDOW_S, allocate, capacity, n_windows, place, plan

MIN = 60.0


@pytest.mark.parametrize("minutes, n", [(0, 4), (3, 4), (20, 4), (22.4, 4), (22.5, 5), (25, 5), (27.4, 5), (27.6, 6),
                                         (35, 7), (37.5, 8), (40, 8), (79, 8), (240, 8)])
def test_n_is_one_window_per_five_minutes_between_4_and_8(minutes, n):
    assert n_windows(minutes * MIN) == n


@pytest.mark.parametrize("seconds, cap", [(0, 0), (4.9, 0), (5, 1), (29, 1), (30, 1), (59.9, 1), (60, 1), (89.9, 1),
                                           (90, 2), (300, 9)])
def test_capacity_is_the_windows_that_fit_between_the_margins(seconds, cap):
    assert capacity(seconds) == cap


def test_one_long_file_gets_eight_evenly_spaced_windows_inside_its_margins():
    d = 40 * MIN
    wins = sorted(plan([d]), key=lambda w: w.index)
    assert len(wins) == 8 and {w.file for w in wins} == {0}
    centres = [w.start_s + w.length_s / 2 for w in wins]
    assert centres == pytest.approx([MARGIN_S + (i + 0.5) / 8 * (d - 2 * MARGIN_S) for i in range(8)])
    assert all(w.length_s == WINDOW_S for w in wins)
    assert wins[0].start_s >= MARGIN_S and wins[-1].start_s + WINDOW_S <= d - MARGIN_S


def test_fewer_windows_are_a_prefix_of_more_and_each_prefix_is_spread():
    wins = plan([40 * MIN])
    assert [w.rank for w in wins] == list(range(8))
    assert [w.index for w in wins] == [0, 4, 2, 6, 1, 5, 3, 7]  # first, middle, quarters: clips.priority_order
    for n in range(4, 9):
        first = [w for w in wins if w.rank < n]
        assert first == wins[:n]  # the n-window sample is the start of the 8
        assert min(w.index for w in first) == 0 and max(w.index for w in first) >= 6  # both ends of the album
    assert plan([40 * MIN]) == wins  # deterministic


def test_windows_are_shared_in_proportion_to_duration():
    assert allocate([30 * MIN, 10 * MIN]) == [6, 2]
    assert allocate([10 * MIN, 30 * MIN]) == [2, 6]
    assert allocate([20 * MIN, 20 * MIN]) == [4, 4]
    assert allocate([46 * MIN, 2 * MIN]) == [8, 0]  # a short piece next to a long one may get none
    rng = random.Random(7)
    for _ in range(300):
        durations = [rng.uniform(300, 1500) for _ in range(rng.randint(1, 20))]  # every file could hold all 8
        counts, total = allocate(durations), sum(durations)
        assert sum(counts) == 8
        assert all(abs(c - 8 * d / total) < 1 for c, d in zip(counts, durations))  # floor or ceiling of its share


def test_tracks_of_equal_length_get_windows_spread_through_the_album_not_the_first_eight():
    counts = allocate([4 * MIN] * 12)
    assert sum(counts) == 8 and max(counts) == 1
    assert counts[0] == 1 and counts[-1] == 1 and 0 in counts[1:-1]
    wins = plan([4 * MIN] * 12)
    assert all(w.start_s == pytest.approx(105.0) for w in wins)  # one window per file: its middle
    assert [w.file for w in sorted(wins, key=lambda w: w.index)] == sorted(w.file for w in wins)  # album order


@pytest.mark.parametrize("seconds, window", [(45.0, (7.5, 30.0)), (59.0, (14.5, 30.0)), (30.0, (0.0, 30.0)),
                                              (20.0, (0.0, 20.0)), (60.0, (15.0, 30.0)), (70.0, (20.0, 30.0))])
def test_a_file_too_short_for_the_margins_gets_one_centred_window_or_is_taken_whole(seconds, window):
    assert place(seconds, 1) == [pytest.approx(window)]
    assert [(w.start_s, w.length_s) for w in plan([seconds])] == [pytest.approx(window)]


def test_files_too_short_to_embed_are_left_out_and_short_albums_get_what_fits():
    assert plan([3.0]) == [] and plan([]) == [] and allocate([3.0, 0.0]) == [0, 0]
    assert allocate([3.0, 600.0, 2.0]) == [0, 8, 0]
    assert allocate([100.0, 100.0, 100.0]) == [2, 2, 2]  # 6 fit, not 8
    assert allocate([100.0, 20.0, 20.0]) == [2, 1, 1]  # the third window of the first file does not fit: it moves
    assert allocate([200.0, 40.0]) == [5, 1]
    two = sorted(plan([100.0]), key=lambda w: w.index)
    assert [(w.start_s, w.length_s) for w in two] == [pytest.approx((17.5, 30.0)), pytest.approx((52.5, 30.0))]


def test_no_window_overlaps_or_enters_a_margin_whatever_the_album():
    rng = random.Random(3)
    for _ in range(300):
        durations = [rng.choice([2.0, 12.0, 40.0, 61.0, 95.0, 200.0, 800.0, 2400.0]) * rng.uniform(0.9, 1.1)
                     for _ in range(rng.randint(1, 15))]
        wins = plan(durations)
        assert len(wins) == min(8, sum(capacity(d) for d in durations))
        assert sorted(w.rank for w in wins) == list(range(len(wins)))
        by_file: dict[int, list] = {}
        for w in wins:
            d = durations[w.file]
            assert d >= windows.MIN_FILE_S and w.start_s >= 0 and w.start_s + w.length_s <= d + 1e-9
            if d >= WINDOW_S + 2 * MARGIN_S:
                assert w.start_s >= MARGIN_S - 1e-9 and w.start_s + w.length_s <= d - MARGIN_S + 1e-9
            by_file.setdefault(w.file, []).append(w)
        for ws in by_file.values():
            ws.sort(key=lambda w: w.start_s)
            assert all(a.start_s + a.length_s <= b.start_s + 1e-9 for a, b in zip(ws, ws[1:]))


# --- decoding only the window (ffmpeg, synthetic audio) -----------------------------------------------

def _sweep(seconds: float) -> np.ndarray:
    """A tone whose pitch says where in the file a sample is."""
    t = np.arange(int(seconds * SR)) / SR
    return (0.3 * np.sin(2 * np.pi * (200 + 4 * t) * t)).astype(np.float32)


def _write_wav(path, channels: list[np.ndarray]) -> None:
    with wave.open(str(path), "wb") as f:
        f.setnchannels(len(channels)), f.setsampwidth(2), f.setframerate(SR)
        f.writeframes((np.clip(np.stack(channels, axis=1), -1, 1) * 32767).astype("<i2").tobytes())


@pytest.fixture(scope="module")
def tools():
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        pytest.skip("ffmpeg and ffprobe are not installed")
    return ffmpeg, ffprobe


def test_a_window_is_decoded_from_its_place_in_the_file(tools, tmp_path):
    ffmpeg, ffprobe = tools
    x = _sweep(100)
    _write_wav(tmp_path / "long.wav", [x])
    assert windows.probe_duration(tmp_path / "long.wav", ffprobe) == pytest.approx(100.0, abs=0.01)
    part = windows.decode_window(tmp_path / "long.wav", 40.0, 30.0, ffmpeg, clap_catalog().mono_of_wav)
    assert part.dtype == np.float32 and abs(len(part) - 30 * SR) <= 1
    n = min(len(part), 30 * SR)
    assert np.abs(part[:n] - x[40 * SR:40 * SR + n]).max() < 1e-3  # 16-bit rounding
    tail = windows.decode_window(tmp_path / "long.wav", 90.0, 30.0, ffmpeg, clap_catalog().mono_of_wav)
    assert abs(len(tail) - 10 * SR) <= 1  # a window past the end is what is left


def test_a_stereo_window_is_the_average_of_its_channels_and_a_bad_file_fails(tools, tmp_path):
    ffmpeg, ffprobe = tools
    left, right = _sweep(40), np.zeros(40 * SR, np.float32)
    _write_wav(tmp_path / "stereo.wav", [left, right])
    part = windows.decode_window(tmp_path / "stereo.wav", 5.0, 30.0, ffmpeg, clap_catalog().mono_of_wav)
    assert np.abs(part[:30 * SR] - left[5 * SR:35 * SR][:len(part)] / 2).max() < 1e-3  # (L+R)/2, not ffmpeg's 0.707
    (tmp_path / "bad.mp3").write_bytes(b"not audio at all")
    assert windows.probe_duration(tmp_path / "bad.mp3", ffprobe) is None
    with pytest.raises(RuntimeError):
        windows.decode_window(tmp_path / "bad.mp3", 0.0, 30.0, ffmpeg, clap_catalog().mono_of_wav)
