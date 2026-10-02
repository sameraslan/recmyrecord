"""Local files: which excerpt, which files. The tests marked `essentia` decode synthetic audio written to a
temporary folder and run the model on it."""
import wave

import numpy as np
import pytest

from rmr_pipeline.audio_store import DIM
from rmr_audio import embed
from rmr_audio.catalog import DEFAULT_CACHE
from rmr_audio.embed import SR, excerpt_window, local_files


@pytest.mark.parametrize("duration, window", [
    (300.0, (30.0, 60.0)), (60.0, (30.0, 60.0)), (59.0, (14.5, 44.5)), (40.0, (5.0, 35.0)), (30.0, (0.0, 30.0)),
    (12.5, (0.0, 12.5)), (0.0, (0.0, 0.0))])
def test_excerpt_window(duration, window):
    assert excerpt_window(duration) == pytest.approx(window)


def test_local_files_are_audio_sorted_by_name(tmp_path):
    for name in ("b 02.FLAC", "a 01.mp3", "c.m4a", "d.wav", "e.ogg", "f.aiff", "notes.txt", "cover.jpg", ".DS_Store", "._a 01.mp3"):
        (tmp_path / name).write_bytes(b"x")
    (tmp_path / "sub.mp3").mkdir()
    assert [p.name for p in local_files(tmp_path)] == ["a 01.mp3", "b 02.FLAC", "c.m4a", "d.wav", "e.ogg", "f.aiff"]
    sig = embed.file_sig(tmp_path / "c.m4a")
    (tmp_path / "c.m4a").write_bytes(b"xy")
    assert embed.file_sig(tmp_path / "c.m4a") != sig


def _signal(seconds: float, seed: int = 0) -> np.ndarray:
    """A sweep over noise whose pitch says where in the file a sample is."""
    t = np.arange(int(seconds * SR)) / SR
    return (0.3 * np.sin(2 * np.pi * (200 + 4 * t) * t) + 0.05 * np.random.default_rng(seed).normal(size=len(t))).astype(np.float32)


def _write_wav(path, x: np.ndarray) -> None:
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1), f.setsampwidth(2), f.setframerate(SR)
        f.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


@pytest.fixture(scope="module")
def worker(tmp_path_factory):
    pytest.importorskip("essentia")
    model_dir = DEFAULT_CACHE / "models"
    if not (model_dir / (embed.MODEL + ".pb")).exists():
        pytest.skip("the model file is not in data-pipeline/.cache/audio/models (the first sync fetches it)")
    embed.init_worker(str(model_dir), str(tmp_path_factory.mktemp("decode")))
    return embed.WORKER


@pytest.mark.essentia
def test_excerpt_of_real_files(worker, tmp_path):
    long, short, tiny = _signal(100), _signal(40, 1), _signal(8, 2)
    for name, x in (("long.wav", long), ("short.wav", short), ("tiny.wav", tiny)):
        _write_wav(tmp_path / name, x)
    part = embed.excerpt(str(tmp_path / "long.wav"))
    assert len(part) == 30 * SR and np.abs(part - long[30 * SR:60 * SR]).max() < 1e-3  # 16-bit rounding
    part = embed.excerpt(str(tmp_path / "short.wav"))
    assert len(part) == 30 * SR and np.abs(part - short[5 * SR:35 * SR]).max() < 1e-3
    assert len(embed.excerpt(str(tmp_path / "tiny.wav"))) == 8 * SR


@pytest.mark.essentia
def test_process_embeds_local_files_like_previews(worker, tmp_path):
    """One task as sync builds it: wav, flac and mp3 of the same audio, a file too short and one that is not audio.
    The same excerpt handed over as a preview's bytes gives the same embedding."""
    x = _signal(70)
    _write_wav(tmp_path / "01.wav", x)
    for fmt in ("flac", "mp3"):
        worker["es"].MonoWriter(filename=str(tmp_path / f"02.{fmt}"), format=fmt, sampleRate=SR)(x)
    _write_wav(tmp_path / "03.wav", _signal(3))
    (tmp_path / "04.mp3").write_bytes(b"this is not audio")
    names = ["01.wav", "02.flac", "02.mp3", "03.wav", "04.mp3"]
    out = embed.process([{"key": "k", "track_id": n, "path": str(tmp_path / n)} for n in names])
    recs = {r["track_id"]: r for r in out["clips"]}
    assert [recs[n]["status"] for n in names] == ["ok", "ok", "ok", "too_short", "decode_failed"]
    embs = {n: np.frombuffer(recs[n]["emb"], "<f2").astype(np.float64) for n in names[:3]}
    assert all(e.shape == (DIM,) and np.isfinite(e).all() for e in embs.values())
    assert recs["01.wav"]["clip_s"] == pytest.approx(30.0)
    cos = lambda a, b: float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))  # noqa: E731
    assert cos(embs["01.wav"], embs["02.flac"]) > 0.9999 and cos(embs["01.wav"], embs["02.mp3"]) > 0.98
    clip = tmp_path / "clip.wav"
    _write_wav(clip, x[30 * SR:60 * SR])
    emb, seconds = embed.embed(embed.decode(clip.read_bytes(), ".wav"))
    assert seconds == pytest.approx(30.0) and cos(emb.astype(np.float64), embs["01.wav"]) > 0.9999
    assert not list((tmp_path.parent).glob("decode*/*"))  # the temp file of the decode is gone
