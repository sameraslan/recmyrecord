"""Tests of the audio stage (rmr_audio). Run from data-pipeline/ with the audio venv:

    .venv-audio/bin/python -m pytest tests_audio

No test uses the network. The tests marked `essentia` load the model and decode synthetic audio; they
are skipped when Essentia or the model file is not there.
"""
import importlib.util
from concurrent.futures import Future
from concurrent.futures.process import BrokenProcessPool

import numpy as np
import pytest

from rmr_pipeline.audio_store import DIM, init_store, write_matches
from rmr_audio.catalog import Album
from rmr_audio.embed import MODEL


if any(importlib.util.find_spec(m) is None for m in ("rapidfuzz", "requests")):
    collect_ignore_glob = ["test_*.py"]  # not the audio venv (the build venv has neither): nothing to collect


def pytest_configure(config):
    config.addinivalue_line("markers", "essentia: needs Essentia and the model file (skipped when absent)")


def fake_emb(track_id: str) -> np.ndarray:
    """A deterministic embedding per track, exactly representable in float16."""
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(track_id))
    return np.random.default_rng(seed).integers(-64, 64, DIM).astype(np.float16) / 16


class FakePool:
    """Stands in for the worker pool: every clip succeeds with fake_emb(track_id), except the clips
    named in `status`, and a task holding a clip named in `crash` raises BrokenProcessPool."""

    def __init__(self, log: list, status: dict | None = None, crash: set | None = None, on_task=None):
        self.log, self.status, self.crash, self.on_task = log, status or {}, crash or set(), on_task

    def submit(self, fn, recs):
        fut = Future()
        if any(r["track_id"] in self.crash for r in recs):
            fut.set_exception(BrokenProcessPool("a worker died"))
            return fut
        out = []
        for r in recs:
            self.log.append((r["key"], r["track_id"]))
            r = {k: v for k, v in r.items() if k != "url"}
            status = self.status.get(r["track_id"], "ok")
            r.update(status=status, clip_s=30.0, emb=fake_emb(r["track_id"]).astype("<f2").tobytes() if status == "ok" else None)
            out.append(r)
        fut.set_result({"pid": 1, "rss": 0, "clips": out, "seconds": 0.0})
        if self.on_task:
            self.on_task()
        return fut

    def shutdown(self, **kw):
        pass


def listing(album_id: str, n: int, no_preview: tuple = ()) -> list[dict]:
    """A store listing of n tracks; track ids are <album_id>-<position>."""
    return [{"track_id": f"{album_id}-{i}", "title": f"t{i}", "duration_s": 200.0, "disk": 1, "position": i + 1,
             "preview_url": None if i in no_preview else f"https://previews.invalid/{album_id}-{i}"} for i in range(n)]


def album(n: int) -> Album:
    return Album(f"key:{n}", f"Title {n}", f"Artist {n}", f"title-{n}-artist-{n}")


def match_row(key: str, source: str = "deezer", album_id: str = "", n: int = 10) -> dict:
    if not source:
        return {"key": key, "source": "", "source_album_id": "", "matched_title": "", "matched_artist": "", "score": "",
                "ambiguous": "0", "n_tracks": "", "n_clips_available": ""}
    return {"key": key, "source": source, "source_album_id": album_id, "matched_title": "T", "matched_artist": "A",
            "score": "0.9900", "ambiguous": "0", "n_tracks": str(n), "n_clips_available": str(n)}


@pytest.fixture
def world(tmp_path, monkeypatch):
    """Five albums, a fresh store, matches for the first four (album 3 unmatched; album 4 was never
    searched and the stores do not have it), listings of 10, 10 and 3 tracks, a fake pool and no network:
    `world.run(**options)` runs one sync and returns its printed lines."""
    from rmr_audio import match as matching
    from rmr_audio.sync import Options, Stop, sync

    class World:
        catalog = [album(i) for i in range(5)]
        audio, cache = tmp_path / "audio", tmp_path / "cache"
        listings = {("deezer", "d0"): listing("d0", 10), ("deezer", "d1"): listing("d1", 10),
                    ("itunes:us", "i2"): listing("i2", 3)}
        fetched: list = []  # listings asked for
        log: list = []  # (key, track_id) of every clip a worker was given
        pool_args: dict = {}

        def run(self, stop=None, **kw):
            lines = []
            opts = Options(audio_dir=self.audio, cache_dir=self.cache, **kw)
            code = sync(opts, self.catalog, http=object(), pool_factory=lambda n: FakePool(self.log, **self.pool_args),
                        out=lines.append, stop=stop)
            assert code == 0
            return lines

    w = World()
    init_store(w.audio, MODEL, {"per_album": 4})
    write_matches(w.audio / "matches.csv", [match_row("key:0", "deezer", "d0"), match_row("key:1", "deezer", "d1"),
                                             match_row("key:2", "itunes:us", "i2", 3), match_row("key:3", "")])

    def tracks(http, source, album_id, fresh=False):
        w.fetched.append((source, album_id))
        return w.listings[(source, album_id)]

    monkeypatch.setattr(matching, "tracks", tracks)
    monkeypatch.setattr(matching, "match_album", lambda http, al, storefronts: matching.Match(reason="no candidate"))
    w.Stop = Stop
    return w
