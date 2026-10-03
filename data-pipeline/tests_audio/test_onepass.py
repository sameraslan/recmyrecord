"""The one-pass run with stub models: one download and one decode per clip feed both models, a run resumes,
a top-up fetches only what is missing, imported embeddings are not recomputed, locks, statuses, local
windows. No model is loaded and nothing touches the network; the last tests start the worker module as a
real child process with its `stub` backend (Python and numpy only) to exercise the pipe."""
import fcntl
import sys
from collections import Counter

import numpy as np
import pytest

from rmr_audio import embed, onepass
from rmr_audio.clips import ClipCache, priority_order
from rmr_audio.onepass import Embedder, Options, Worker, WorkerDied, needed_clips, run
from rmr_audio.onepass_cache import MODELS, OnePassCache
from rmr_audio.onepass_worker import Stub, stub_embedding

BOTH = ("effnet", "clap")


class FakeWorker:
    """Stands in for a model child: the worker module's Stub backend, in this process. `calls` is every
    (kind, payload) it was given; a payload starting with DIE raises WorkerDied from recv, once per start."""

    def __init__(self, model: str, log: list):
        self.model, self.log, self.calls = model, log, []
        self.backend = Stub(model, MODELS[model].dim, MODELS[model].dtype)
        self.info = {"device": "none", "pid": 0}

    def start(self):
        self.log.append(("start", self.model))

    def send(self, kind, payload, suffix):
        self.calls.append((kind, bytes(payload)))
        self.log.append((self.model, kind, bytes(payload)))

    def recv(self):
        kind, payload = self.calls[-1]
        if payload.startswith(b"DIE"):
            raise WorkerDied(f"{self.model}: the worker process died (exit -11)")
        status, error, clip_s, emb = self.backend.embed(kind, payload, ".mp3")
        return {"status": status, "error": error, "clip_s": clip_s, "rss": 1, "mps": 0, "secs": 0.0}, emb

    def close(self):
        self.log.append(("close", self.model))


class NoStop(onepass.Stop):
    def install(self):
        pass

    def restore(self):
        pass


def listing(album_id: str, n: int, no_preview: tuple = (), duration: float = 200.0) -> list[dict]:
    return [{"track_id": f"{album_id}-{i}", "title": f"t{i}", "duration_s": duration, "disk": 1, "position": i + 1,
             "preview_url": None if i in no_preview else f"https://previews.invalid/{album_id}-{i}"} for i in range(n)]


def audio(track_id: str) -> bytes:
    return b"audio:" + track_id.encode()


@pytest.fixture
def world(tmp_path):
    """Three matched albums (10, 10 and 3 tracks) and one unmatched, fake stores and stub models.
    `world.run(clips=N, ...)` runs once and returns the printed lines."""

    class World:
        out_db = tmp_path / "cache" / "onepass.sqlite"
        matches = tmp_path / "matches.csv"
        listings = {("deezer", "d0"): listing("d0", 10), ("deezer", "d1"): listing("d1", 10), ("itunes:us", "i2"): listing("i2", 3)}
        payload: dict = {}  # track_id -> the bytes its download returns, or an exception to raise
        fetched: list = []  # listings asked for
        downloaded: list = []  # track ids downloaded
        log: list = []  # everything the model workers saw
        decoded: list = []  # payloads the shared decoder was given
        workers: dict = {}
        stop = None
        on_download = None

        def download(self, url):
            track = url.rsplit("/", 1)[1]
            self.downloaded.append(track)
            if self.on_download:
                self.on_download(track)
            data = self.payload.get(track, audio(track))
            if isinstance(data, Exception):
                raise data
            return data

        def tracks(self, source, album_id):
            self.fetched.append((source, album_id))
            got = self.listings[(source, album_id)]
            if isinstance(got, Exception):
                raise got
            return got

        def factory(self, model):
            def make():
                self.workers.setdefault(model, []).append(FakeWorker(model, self.log))
                return self.workers[model][-1]
            return make

        def decode(self, data, suffix):
            self.decoded.append(bytes(data))
            if data.startswith(b"BAD"):
                raise RuntimeError("Invalid data found when processing input")
            return np.frombuffer(data.ljust(32, b"\0")[:32], "<f4")

        def calls(self, model):
            return [payload for w in self.workers.get(model, []) for _, payload in w.calls]

        def run(self, code=0, decoder="own", decode_window=None, durations=None, **kw):
            lines = []
            opts = Options(matches=self.matches, out=self.out_db, **{"clips": 4, **kw})
            embedder = Embedder({m: self.factory(m) for m in opts.models}, decoder, self.decode, lines.append)
            self.stop = NoStop()
            assert run(opts, self.tracks, self.download, embedder, lines.append, self.stop, durations, decode_window) == code
            embedder.close()
            return lines

        def cache(self):
            return OnePassCache(self.out_db, readonly=True)

        def status(self, key, source, album_id):
            cache = self.cache()
            got = {t: c["status"] for t, c in cache.album(key, source, album_id).items()}
            cache.close()
            return got

    w = World()
    w.matches.write_text("key,source,source_album_id,matched_title,n_tracks,n_clips_available\n"
                         "Album0,deezer,d0,T,10,10\nAlbum1,deezer,d1,T,10,10\nAlbum2,itunes:us,i2,T,3,\nAlbum3,,,,,\n")
    return w


def ranks(n_tracks: int, clips: int) -> list[int]:
    return priority_order(n_tracks)[:clips]


# --- one download, one decode, both models -----------------------------------------------------------

def test_each_clip_is_downloaded_once_and_the_same_bytes_feed_both_models(world):
    lines = world.run()
    assert Counter(world.downloaded) == Counter({f"d0-{i}": 1 for i in ranks(10, 4)} | {f"d1-{i}": 1 for i in ranks(10, 4)}
                                                | {f"i2-{i}": 1 for i in range(3)})
    assert len(world.downloaded) == 11 and len(world.fetched) == 3
    for model in BOTH:
        assert len(world.workers[model]) == 1  # one child per model for the whole run
        assert world.calls(model) == [audio(t) for t in world.downloaded]  # one request per clip, the downloaded bytes
        assert {kind for kind, _ in world.workers[model][0].calls} == {"bytes"}
    assert world.decoded == []  # `own`: each model decodes the bytes itself
    cache = world.cache()
    assert cache.counts() == {"effnet": Counter(ok=11), "clap": Counter(ok=11)}
    emb = dict(cache.con.execute("SELECT model, emb FROM embeddings WHERE track_id = 'd0-5'"))
    assert emb["effnet"] == stub_embedding(audio("d0-5"), 1280, "<f2").tobytes()
    assert emb["clap"] == stub_embedding(audio("d0-5"), 512, "<f4").tobytes()
    assert [r[0] for r in cache.con.execute("SELECT prio FROM clips WHERE key = 'Album0' ORDER BY prio")] == [0, 1, 2, 3]
    assert cache.con.execute("SELECT clip_s, track_s, short_preview FROM clips WHERE track_id = 'd0-0'").fetchone() == (30.0, 200.0, 0)
    assert cache.listings()[("Album2", "itunes:us", "i2")]["n_previews"] == 3
    cache.close()
    assert any("1 with no listing" in line for line in lines)


def test_the_shared_decoder_decodes_once_and_both_models_get_that_buffer(world):
    world.payload["d0-5"] = b"BAD bytes"
    world.run(decoder="shared", keys=("Album0",))
    assert world.decoded == [world.payload.get(t, audio(t)) for t in world.downloaded]  # one decode per download
    good = [t for t in world.downloaded if t != "d0-5"]
    for model in BOTH:
        assert [k for k, _ in world.workers[model][0].calls] == ["mono"] * len(good)
        assert world.calls(model) == [world.decode(audio(t), "").tobytes() for t in good]
    status = world.status("Album0", "deezer", "d0")
    assert status["d0-5"] == {"effnet": "decode_failed", "clap": "decode_failed"}
    assert sum(s == {"effnet": "ok", "clap": "ok"} for s in status.values()) == 4  # the next track took its place


def test_a_run_for_one_model_starts_only_that_child(world):
    world.run(models=("clap",), keys=("Album2",))
    assert set(world.workers) == {"clap"} and len(world.calls("clap")) == 3
    assert world.status("Album2", "itunes:us", "i2")["i2-0"] == {"clap": "ok"}


# --- resuming and topping up -------------------------------------------------------------------------

def test_a_stopped_run_continues_where_it_stopped(world):
    def stop_after_five(track):
        if len(world.downloaded) == 6:
            world.stop.asked = True

    world.on_download = stop_after_five
    lines = world.run()
    done = world.calls("clap")
    assert 4 <= len(done) < 11 and any("stopped" in line for line in lines)
    cache = world.cache()
    assert sum(cache.counts()["effnet"].values()) == len(done)  # every finished clip is in the cache
    cache.close()
    world.on_download, world.downloaded[:], before = None, [], list(done)
    world.run()
    assert not set(world.downloaded) & {t.split(b":")[1].decode() for t in before}  # nothing twice
    assert len(before) + len(world.downloaded) == 11
    world.downloaded[:], world.fetched[:] = [], []
    lines = world.run()
    assert world.downloaded == [] and world.fetched == []  # complete: not even a listing is asked for
    assert any("3 complete" in line for line in lines)


def test_a_top_up_from_four_to_eight_fetches_only_the_other_four(world):
    world.run(clips=4)
    first = list(world.downloaded)
    world.downloaded[:] = []
    world.run(clips=8)
    assert sorted(world.downloaded) == sorted(f"{a}-{i}" for a in ("d0", "d1") for i in priority_order(10)[4:8])
    assert not set(first) & set(world.downloaded)
    cache = world.cache()
    assert [r[0] for r in cache.con.execute("SELECT prio FROM clips WHERE key = 'Album0' ORDER BY prio")] == list(range(8))
    four = [r[0] for r in cache.con.execute("SELECT track_id FROM clips WHERE key = 'Album0' AND prio < 4 ORDER BY prio")]
    assert four == [f"d0-{i}" for i in ranks(10, 4)]  # the four are a prefix of the eight
    cache.close()
    world.downloaded[:], world.fetched[:] = [], []
    world.run(clips=8)
    assert world.downloaded == [] and world.fetched == []  # Album2 has three previews and all were tried


def test_needed_clips_walks_the_priority_order_and_keeps_cached_ranks():
    tracks = listing("d", 10, no_preview=(0,))
    playable = [t["track_id"] for t in tracks if t["preview_url"]]
    recs = needed_clips("K", "deezer", "d", tracks, {}, BOTH, 4)
    assert [r["track_id"] for r in recs] == [playable[i] for i in priority_order(9)[:4]]
    assert [r["prio"] for r in recs] == [0, 1, 2, 3] and all(r["models"] == ["effnet", "clap"] for r in recs)
    assert recs[0]["suffix"] == ".mp3" and recs[0]["track_s"] == 200.0
    assert needed_clips("K", "itunes:jp", "d", tracks, {}, BOTH, 1)[0]["suffix"] == ".m4a"
    cached = {recs[0]["track_id"]: {"status": {"effnet": "ok", "clap": "ok"}, "error": {}, "prio": 0, "track_idx": 1},
              recs[1]["track_id"]: {"status": {"effnet": "ok"}, "error": {}, "prio": 7, "track_idx": 5},
              recs[2]["track_id"]: {"status": {"effnet": "too_short", "clap": "too_short"}, "error": {}, "prio": 2, "track_idx": 3}}
    again = needed_clips("K", "deezer", "d", tracks, cached, BOTH, 4)
    assert [(r["track_id"], r["models"], r["prio"]) for r in again] == [
        (recs[1]["track_id"], ["clap"], 7), (recs[3]["track_id"], ["effnet", "clap"], 3),
        (playable[priority_order(9)[4]], ["effnet", "clap"], 4)]  # three missing: the failed clip does not count
    assert needed_clips("K", "deezer", "d", listing("d", 3, no_preview=(0, 1, 2)), {}, BOTH, 4) == []


# --- embeddings already computed ---------------------------------------------------------------------

def old_caches(tmp_path, key, source, album_id, tracks, effnet=8, clap=4):
    """The two earlier caches with `effnet` and `clap` ok clips of one listing, in priority order."""
    order = [tracks[i]["track_id"] for i in priority_order(len(tracks))]
    eff = ClipCache(tmp_path / "clips.sqlite")
    eff.put([{"key": key, "source": source, "album_id": album_id, "track_id": t, "track_idx": int(t.rsplit("-", 1)[1]), "prio": p,
              "status": "ok", "clip_s": 30.0, "emb": stub_embedding(b"old:" + t.encode(), 1280, "<f2").tobytes()}
             for p, t in enumerate(order[:effnet])])
    eff.close()
    from rmr_audio.onepass_worker import clap_catalog

    con = clap_catalog().open_out(tmp_path / "clap_clips.sqlite")
    con.executemany("INSERT INTO clap_clips VALUES (?, ?, ?, ?, ?, ?, 'ok', NULL, 30.0, ?, datetime('now'))",
                    [(key, source, album_id, t, int(t.rsplit("-", 1)[1]), p, stub_embedding(b"old:" + t.encode(), 512, "<f4").tobytes())
                     for p, t in enumerate(order[:clap])])
    con.commit()
    con.close()
    return order


def test_imported_embeddings_are_reused_and_only_the_missing_model_is_computed(world, tmp_path):
    order = old_caches(tmp_path, "Album0", "deezer", "d0", world.listings[("deezer", "d0")], effnet=8, clap=4)
    assert onepass.import_caches(world.out_db, tmp_path / "clips.sqlite", tmp_path / "clap_clips.sqlite", None, lambda s: None) == 0
    # at four clips the album is complete: nothing is fetched, no model is started
    world.run(clips=4, keys=("Album0",))
    assert world.downloaded == [] and world.fetched == [] and world.workers == {}
    # at eight, the four clips EffNet already has are downloaded for CLAP only
    world.run(clips=8, keys=("Album0",))
    assert world.downloaded == order[4:8]
    assert world.calls("clap") == [audio(t) for t in order[4:8]] and "effnet" not in world.workers
    cache = world.cache()
    old = dict(cache.con.execute("SELECT track_id, emb FROM embeddings WHERE key = 'Album0' AND model = 'effnet'"))
    assert old == {t: stub_embedding(b"old:" + t.encode(), 1280, "<f2").tobytes() for t in order[:8]}  # untouched
    origins = Counter(r[0] for r in cache.con.execute("SELECT origin FROM embeddings WHERE key = 'Album0'"))
    assert origins == {"import:clips.sqlite": 8, "import:clap_clips.sqlite": 4, "onepass": 4}
    assert cache.con.execute("SELECT track_s, short_preview FROM clips WHERE track_id = ?", (order[0],)).fetchone() == (200.0, 0)
    cache.close()


def test_skip_imported_leaves_the_existing_catalog_alone(world, tmp_path):
    old_caches(tmp_path, "Album0", "deezer", "d0", world.listings[("deezer", "d0")], effnet=4, clap=0)
    onepass.import_caches(world.out_db, tmp_path / "clips.sqlite", None, None, lambda s: None)
    lines = world.run(skip_imported=True)
    assert ("deezer", "d0") not in world.fetched and len(world.downloaded) == 7
    assert any("1 left alone (--skip-imported)" in line for line in lines)
    world.downloaded[:] = []
    world.run()  # without the flag the album gets its CLAP
    assert len(world.downloaded) == 4 and "effnet" in world.workers and len(world.calls("effnet")) == 7


# --- locks -------------------------------------------------------------------------------------------

def test_two_runs_cannot_share_a_cache_and_a_held_lock_of_another_job_stops_the_run(world, tmp_path, capsys):
    world.out_db.parent.mkdir(parents=True)
    with open(onepass.lock_path(world.out_db), "a") as mine:
        fcntl.flock(mine, fcntl.LOCK_EX | fcntl.LOCK_NB)
        world.run(code=1)
        assert onepass.import_caches(world.out_db, None, None, None) == 1
    assert world.downloaded == [] and not world.out_db.exists()
    other = tmp_path / "clap_clips.lock"
    other.write_text("")
    with open(other, "w") as theirs:
        fcntl.flock(theirs, fcntl.LOCK_EX | fcntl.LOCK_NB)
        world.run(code=1, other_locks=(other,))
        assert world.downloaded == []
    assert "is held by a running job" in capsys.readouterr().err
    # free again, and a lock file that was never made is nobody's: the run goes ahead and holds both meanwhile
    seen = []

    def held_during(track):
        for path in (onepass.lock_path(world.out_db), other):
            with open(path) as f:
                try:
                    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    seen.append("free")
                except OSError:
                    seen.append("held")

    world.on_download = held_during
    world.run(keys=("Album2",), other_locks=(other, tmp_path / "never.lock"))
    assert seen == ["held"] * 6 and not (tmp_path / "never.lock").exists() and other.read_text() == ""
    with open(other) as f:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)  # released when the run ended


def test_a_dry_run_writes_nothing_and_asks_nobody(world):
    lines = world.run(dry_run=True)
    assert not world.out_db.exists() and world.fetched == [] and world.downloaded == []
    assert any("3 to fetch" in line for line in lines) and lines[-1].startswith("dry run")


# --- statuses ----------------------------------------------------------------------------------------

def test_final_failures_are_replaced_by_the_next_track_and_never_tried_again(world):
    order = [f"d0-{i}" for i in priority_order(10)]
    world.payload = {order[0]: embed.EmptyPreview("HTTP 200, 0 bytes"), order[1]: b"SHORT clip", order[2]: b"BAD bytes"}
    world.run(keys=("Album0",))
    status = world.status("Album0", "deezer", "d0")
    assert status[order[0]] == {"effnet": "no_preview", "clap": "no_preview"}
    assert status[order[1]] == {"effnet": "too_short", "clap": "too_short"}
    assert status[order[2]] == {"effnet": "decode_failed", "clap": "decode_failed"}
    assert world.downloaded == order[:7]  # the three that failed for good were replaced in the same run
    world.downloaded[:], world.fetched[:] = [], []
    world.run(keys=("Album0",))
    assert world.downloaded == [] and world.fetched == []  # the failed ones are never asked for again
    assert sum(s == {"effnet": "ok", "clap": "ok"} for s in world.status("Album0", "deezer", "d0").values()) == 4
    assert len(world.calls("effnet")) == len(world.calls("clap")) == 6  # an empty preview never reaches a model
    cache = world.cache()
    assert cache.con.execute("SELECT clip_s FROM clips WHERE track_id = ?", (order[0],)).fetchone() == (None,)
    cache.close()


def test_failed_downloads_and_analyses_are_tried_again_and_a_url_refused_twice_is_final(world):
    world.payload = {"i2-0": IOError("ConnectionError"), "i2-1": IOError("HTTP 404, 12 bytes"), "i2-2": b"FAIL in the model"}
    world.run(keys=("Album2",))
    assert world.status("Album2", "itunes:us", "i2") == {
        "i2-0": {"effnet": "download_failed", "clap": "download_failed"},
        "i2-1": {"effnet": "download_failed", "clap": "download_failed"},
        "i2-2": {"effnet": "analysis_failed", "clap": "analysis_failed"}}
    world.payload = {"i2-1": IOError("HTTP 404, 12 bytes")}
    world.downloaded[:] = []
    world.run(keys=("Album2",))
    assert sorted(world.downloaded) == ["i2-0", "i2-1", "i2-2"]  # all three again
    status = world.status("Album2", "itunes:us", "i2")
    assert status["i2-0"] == status["i2-2"] == {"effnet": "ok", "clap": "ok"}
    assert status["i2-1"] == {"effnet": "no_preview", "clap": "no_preview"}
    world.downloaded[:], world.fetched[:] = [], []
    world.run(keys=("Album2",))
    assert world.downloaded == [] and world.fetched == []  # every preview has a final answer


def test_a_child_that_dies_costs_one_clip_for_that_model_and_is_started_again(world):
    class Fragile(FakeWorker):
        def recv(self):
            if self.calls[-1][1] == audio("i2-1"):
                raise WorkerDied("clap: the worker process died (exit -11)")
            return super().recv()

    world.factory = lambda model: (lambda: world.workers.setdefault(model, []).append(
        (Fragile if model == "clap" else FakeWorker)(model, world.log)) or world.workers[model][-1])
    world.run(keys=("Album2",))
    assert world.status("Album2", "itunes:us", "i2") == {
        "i2-0": {"effnet": "ok", "clap": "ok"}, "i2-1": {"effnet": "ok", "clap": "crashed"}, "i2-2": {"effnet": "ok", "clap": "ok"}}
    assert len(world.workers["clap"]) == 2 and len(world.workers["effnet"]) == 1
    del world.factory  # healthy children again
    world.workers.clear()
    world.downloaded[:] = []
    world.run(keys=("Album2",))
    assert world.downloaded == ["i2-1"] and world.calls("clap") == [audio("i2-1")] and "effnet" not in world.workers


def test_a_child_that_keeps_dying_ends_the_run_with_what_was_done_committed(world):
    world.payload = {t["track_id"]: b"DIE" for t in world.listings[("deezer", "d0")]}
    with pytest.raises(RuntimeError, match="died 3 times in a row"):
        world.run(keys=("Album0",))
    assert set(world.status("Album0", "deezer", "d0")) == {"d0-0", "d0-5"}  # the two clips before the third death
    with open(onepass.lock_path(world.out_db)) as f:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)  # the lock was released


def test_a_store_that_stops_answering_is_left_for_the_next_run(world):
    world.matches.write_text("key,source,source_album_id\n" + "".join(f"A{i},deezer,x{i}\n" for i in range(5)) + "B,itunes:us,i2\n")
    world.listings.update({("deezer", f"x{i}"): IOError("giving up") for i in range(5)})
    lines = world.run()
    assert world.fetched == [("deezer", "x0"), ("deezer", "x1"), ("deezer", "x2"), ("itunes:us", "i2")]
    assert sum("deezer is not answering" in line for line in lines) == 2 and sum("listing failed" in line for line in lines) == 3
    assert world.status("B", "itunes:us", "i2")["i2-0"] == {"effnet": "ok", "clap": "ok"}


# --- local files -------------------------------------------------------------------------------------

@pytest.fixture
def folder(world, tmp_path):
    album = tmp_path / "local" / "Album0"
    album.mkdir(parents=True)
    for name in ("01 a.flac", "02 b.flac", "notes.txt"):
        (album / name).write_bytes(b"x")
    world.lengths = {"01 a.flac": 1800.0, "02 b.flac": 600.0}
    world.windows = []

    def decode_window(path, start, length):
        world.windows.append((path.rsplit("/", 1)[1], round(start, 2), length))
        return np.full(int(length * 100), start, np.float32)

    world.local = dict(local_dir=tmp_path / "local", decode_window=decode_window,
                       durations=lambda p: world.lengths.get(p.name))
    return album


def test_local_files_give_windows_spread_through_the_album_for_both_models(world, folder):
    world.run(keys=("Album0",), **world.local)
    assert world.fetched == [] and world.downloaded == []  # the stores are not asked for an album with local files
    assert len(world.windows) == len(set(world.windows)) == 8  # each window decoded once
    assert Counter(name for name, _, _ in world.windows) == {"01 a.flac": 6, "02 b.flac": 2}  # in proportion to length
    assert all(15 <= start and start + 30 <= world.lengths[name] - 15 for name, start, _ in world.windows)
    for model in BOTH:
        assert [k for k, _ in world.workers[model][0].calls] == ["mono"] * 8
    assert world.calls("effnet") == world.calls("clap")  # the same buffer to both
    cache = world.cache()
    assert cache.counts() == {"effnet": Counter(ok=8), "clap": Counter(ok=8)}
    assert cache.listings()[("Album0", "local", "")] == {"n_tracks": 2, "n_previews": 8, "runtime_s": 2400.0, "n_windows": 8}
    rows = cache.con.execute("SELECT track_id, prio, track_idx, start_s, track_s FROM clips WHERE source = 'local' ORDER BY prio").fetchall()
    assert [r[2] for r in rows] == [0, 4, 2, 6, 1, 5, 3, 7] and rows[0][0] == "01 a.flac@147.50" and rows[0][4] == 1800.0
    keys, X, n, sources = cache.means("effnet", 4)
    assert list(keys) == ["Album0"] and list(sources) == ["local"] and list(n) == [8]
    cache.close()
    world.windows[:] = []
    world.run(keys=("Album0",), **world.local)
    assert world.windows == []  # nothing to do the second time


def test_local_windows_replace_the_previews_and_a_changed_folder_is_sampled_again(world, folder):
    world.run(keys=("Album0",))  # previews first
    world.run(keys=("Album0",), **world.local)
    cache = world.cache()
    assert list(cache.means("clap", 4)[3]) == ["local"] and len(cache.album("Album0", "deezer", "d0")) == 4  # kept, not pooled
    cache.close()
    world.fetched[:] = []
    lines = world.run(clips=8)  # no --local-dir: the album stays on its windows, the stores are not asked for it
    assert ("deezer", "d0") not in world.fetched and any("1 kept on their local windows" in line for line in lines)
    (folder / "03 c.flac").write_bytes(b"xy")
    world.lengths["03 c.flac"] = 1200.0
    world.windows[:] = []
    world.run(keys=("Album0",), **world.local)
    assert Counter(name for name, _, _ in world.windows) == {"01 a.flac": 4, "02 b.flac": 1, "03 c.flac": 3}
    cache = world.cache()
    assert cache.con.execute("SELECT COUNT(*) FROM clips WHERE source = 'local'").fetchone()[0] == 8  # the old windows are gone
    assert cache.listings()[("Album0", "local", "")]["n_windows"] == 8  # an hour: eight windows
    cache.close()


def test_a_short_local_album_gets_what_fits_and_a_window_that_cannot_be_decoded_is_final(world, folder):
    world.lengths = {"01 a.flac": 100.0, "02 b.flac": 3.0}

    def decode_window(path, start, length):
        if start > 40:
            raise RuntimeError("ffmpeg exit 1")
        return np.zeros(int(length * 100), np.float32)

    world.run(keys=("Album0",), **{**world.local, "decode_window": decode_window})
    assert world.status("Album0", "local", "") == {"01 a.flac@17.50": {"effnet": "ok", "clap": "ok"},
                                                    "01 a.flac@52.50": {"effnet": "decode_failed", "clap": "decode_failed"}}
    cache = world.cache()
    assert cache.listings()[("Album0", "local", "")]["n_windows"] == 2  # n is 4 by runtime, but two windows fit
    cache.close()


# --- the pipe, with a real child process (stub backend: no model) ------------------------------------

def stub_child(model: str) -> Worker:
    return Worker(model, [sys.executable, "-m", "rmr_audio.onepass_worker", "--backend", "stub", "--model", model,
                          "--dim", str(MODELS[model].dim), "--dtype", MODELS[model].dtype], onepass.PIPELINE_DIR,
                  reply_timeout=30, ready_timeout=30)


def test_a_worker_process_answers_over_the_pipe_and_its_death_is_noticed():
    w = stub_child("clap")
    w.start()
    try:
        assert w.info["model"] == "clap" and w.info["dim"] == 512 and w.info["pid"] > 0
        big = b"audio:" + bytes(700_000)  # larger than a pipe buffer
        w.send("bytes", big, ".m4a")
        header, emb = w.recv()
        assert header["status"] == "ok" and emb == stub_embedding(big, 512, "<f4").tobytes() and header["rss"] > 0
        w.send("mono", np.zeros(44100, "<f4").tobytes(), "")
        assert w.recv()[0]["clip_s"] == 1.0
        w.send("bytes", b"SHORT", ".mp3")
        assert w.recv()[0]["status"] == "too_short"
        w.send("bytes", b"CRASH", ".mp3")
        with pytest.raises(WorkerDied, match="died"):
            w.recv()
    finally:
        w.close()
    with pytest.raises(WorkerDied):
        Worker("effnet", [sys.executable, "-c", "raise SystemExit(4)"], ready_timeout=30).start()


def test_one_run_through_two_child_processes(world):
    lines = []
    opts = Options(matches=world.matches, out=world.out_db, clips=4, keys=("Album2",))
    embedder = Embedder({m: (lambda m=m: stub_child(m)) for m in BOTH}, out=lines.append)
    try:
        assert run(opts, world.tracks, world.download, embedder, lines.append, NoStop()) == 0
    finally:
        embedder.close()
    assert world.downloaded == ["i2-0", "i2-1", "i2-2"]
    cache = world.cache()
    assert cache.counts() == {"effnet": Counter(ok=3), "clap": Counter(ok=3)}
    emb = dict(cache.con.execute("SELECT model, emb FROM embeddings WHERE track_id = 'i2-1'"))
    assert emb == {"effnet": stub_embedding(audio("i2-1"), 1280, "<f2").tobytes(),
                   "clap": stub_embedding(audio("i2-1"), 512, "<f4").tobytes()}
    cache.close()
    assert any(line.startswith("peak memory: effnet") for line in lines)


# --- means and the command line ----------------------------------------------------------------------

def test_means_are_written_where_asked_but_never_into_the_committed_store(world, tmp_path):
    world.run()
    cache = world.cache()
    n = onepass.write_means(cache, "clap", 4, "rank", tmp_path / "means" / "clap.npz", world.matches)
    z = np.load(tmp_path / "means" / "clap.npz")
    assert n == 3 and list(z["keys"]) == ["Album0", "Album1", "Album2"] and z["emb"].shape == (3, 512) and z["emb"].dtype == np.float32
    assert list(z["n_clips"]) == [4, 4, 3] and str(z["model"]) == "laion/larger_clap_music_and_speech"
    want = np.stack([stub_embedding(audio(f"i2-{i}"), 512, "<f4").astype(np.float64) for i in range(3)]).mean(axis=0)
    assert np.array_equal(z["emb"][2], want.astype(np.float32))
    with pytest.raises(ValueError, match="committed store"):
        onepass.write_means(cache, "effnet", 4, "rank", onepass.DEFAULT_AUDIO / "embeddings" / "x.npz")
    text = onepass.status_text(cache, onepass.read_albums(world.matches), 8, BOTH)
    assert "2 to fetch" in text and "1 complete" in text and "short_preview: 0 clips of 0 albums" in text
    cache.close()


def test_the_matches_file_needs_its_three_columns(tmp_path):
    (tmp_path / "m.csv").write_text("key,source\nA,deezer\n")
    with pytest.raises(ValueError, match="source_album_id"):
        onepass.read_albums(tmp_path / "m.csv")
    (tmp_path / "m.csv").write_text("key,source,source_album_id\nA,deezer,1\nA,deezer,2\n")
    with pytest.raises(ValueError, match="repeated"):
        onepass.read_albums(tmp_path / "m.csv")


# --- the verification script's own arithmetic (the script itself needs the models and the network) ---

def test_the_verification_script_picks_clips_both_caches_have_and_measures_the_difference(tmp_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location("verify_onepass", onepass.PIPELINE_DIR / "scripts" / "verify_onepass.py")
    verify = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verify)
    old_caches(tmp_path, "spotify:album:x", "deezer", "d0", listing("d0", 10), effnet=8, clap=4)
    clips = verify.pick(tmp_path / "clips.sqlite", tmp_path / "clap_clips.sqlite", 20)
    order = [f"d0-{i}" for i in priority_order(10)]
    assert [c["track_id"] for c in clips] == [order[0], order[3]]  # the first and last clip both caches have
    assert clips[0]["effnet"] == stub_embedding(b"old:" + order[0].encode(), 1280, "<f2").tobytes()
    a = np.array([1.0, 2.0, -4.0], "<f4")
    assert verify.compare(a.tobytes(), a.tobytes(), "<f4") == (0.0, 0.0, pytest.approx(1.0))
    diff, rel, cos = verify.compare((a + np.array([0, 0.5, 0], "<f4")).tobytes(), a.tobytes(), "<f4")
    assert diff == 0.5 and rel == 0.125 and 0.99 < cos < 1
