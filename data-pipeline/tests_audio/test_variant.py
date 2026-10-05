"""The clap_mp3 variant with stub models: it is stored beside clap and never in its place; a run for it
alone fetches only the clips that lack it, follows the clips clap has, starts no EffNet child and writes no
baseline row; a Deezer clip's vector is the clap vector, copied; the other sources take the stereo round-trip
path; a run resumes; full-length windows are decoded once with their channels and an embedded album is topped
up from one more fetch. No model is loaded and nothing touches the network. The last tests use ffmpeg for the
real round trip (skipped without it) and the worker module's stub backend as a real child process."""
import shutil
import subprocess
import sys
from collections import Counter

import numpy as np
import pytest

from rmr_audio import fulllength, mp3trip, onepass
from rmr_audio.clips import priority_order
from rmr_audio.onepass import Embedder, Options, Worker, run
from rmr_audio.onepass_cache import MODELS, VARIANT_OF, OnePassCache, same_as_base, worker_of
from rmr_audio.onepass_worker import Stub, clap_catalog, stub_embedding, stub_input

from .test_fulllength import CATALOG, YT, Fetcher, video, wav_seconds
from .test_onepass import NoStop, audio, listing

ALL = ("effnet", "clap", "clap_mp3")
MP3 = ("clap_mp3",)


class FakeWorker:
    """A model child in this process (the worker module's Stub). `calls`: (kind, payload, extra) per request."""

    def __init__(self, name: str, log: list):
        self.model, self.log, self.calls = name, log, []
        self.backend = Stub(name, MODELS[name].dim, MODELS[name].dtype)
        self.info = {"device": "none", "pid": 0}

    def start(self):
        self.log.append(("start", self.model))

    def send(self, kind, payload, suffix, extra=None):
        self.calls.append((kind, bytes(payload), extra or {}))

    def recv(self):
        kind, payload, extra = self.calls[-1]
        status, error, clip_s, emb = self.backend.embed(kind, payload, ".m4a", **extra)
        return {"status": status, "error": error, "clip_s": clip_s, "rss": 1, "mps": 0, "secs": 0.0}, emb

    def close(self):
        self.log.append(("close", self.model))


def plain(data: bytes) -> bytes:
    return stub_embedding(data, 512, "<f4").tobytes()


def tripped(data: bytes, kind: str = "bytes", ch: int = 1) -> bytes:
    """What the stub clap worker answers for the mp3 recipe: not what it answers for the plain one."""
    return stub_embedding(stub_input(data, kind, "mp3", ch), 512, "<f4").tobytes()


@pytest.fixture
def world(tmp_path):
    """Two Deezer albums, two iTunes albums (10 tracks each) and one iTunes album the baseline never embedded."""

    class World:
        out_db = tmp_path / "cache" / "onepass.sqlite"
        matches = tmp_path / "matches.csv"
        listings = {("deezer", "d0"): listing("d0", 10), ("deezer", "d1"): listing("d1", 10), ("itunes:us", "i2"): listing("i2", 10),
                    ("itunes:gb", "i3"): listing("i3", 10), ("itunes:us", "i4"): listing("i4", 10)}
        payload: dict = {}
        fetched: list = []
        downloaded: list = []
        log: list = []
        workers: dict = {}
        on_download = None
        stop = None

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
            return self.listings[(source, album_id)]

        def factory(self, name):
            def make():
                self.workers.setdefault(name, []).append(FakeWorker(name, self.log))
                return self.workers[name][-1]
            return make

        def calls(self, name):
            return [c for w in self.workers.get(name, []) for c in w.calls]

        def run(self, models, code=0, **kw):
            lines = []
            opts = Options(matches=self.matches, out=self.out_db, models=models, **{"clips": 4, **kw})
            embedder = Embedder({worker_of(m): self.factory(worker_of(m)) for m in models}, "own", None, lines.append)
            self.stop = NoStop()
            assert run(opts, self.tracks, self.download, embedder, lines.append, self.stop) == code
            embedder.close()
            return lines

        def rows(self, where="1", args=()):
            cache = OnePassCache(self.out_db, readonly=True)
            got = cache.con.execute("SELECT key, source, album_id, track_id, model, status, error, clip_s, emb, origin, updated_at "
                                    f"FROM embeddings WHERE {where} ORDER BY 1, 2, 3, 4, 5", args).fetchall()
            cache.close()
            return got

        def emb(self, model, track):
            return {r[3]: (r[5], r[8], r[9]) for r in self.rows("model = ?", (model,))}.get(track)

        def clip_rows(self):
            cache = OnePassCache(self.out_db, readonly=True)
            got = cache.con.execute("SELECT * FROM clips ORDER BY 1, 2, 3, 4").fetchall()
            cache.close()
            return got

    w = World()
    w.matches.write_text("key,source,source_album_id,matched_title,n_tracks,n_clips_available\n"
                         "Album0,deezer,d0,T,10,10\nAlbum1,deezer,d1,T,10,10\nAlbum2,itunes:us,i2,T,10,10\n"
                         "Album3,itunes:gb,i3,T,10,10\nAlbum4,itunes:us,i4,T,10,10\n")
    return w


FIRST4 = ("Album0", "Album1", "Album2", "Album3")


def ranks(prefix: str, n: int = 4, of: int = 10) -> list[str]:
    return [f"{prefix}-{i}" for i in priority_order(of)[:n]]


# --- the model and what it is for a source -----------------------------------------------------------

def test_the_variant_is_a_model_of_its_own_beside_clap_and_deezer_is_the_only_source_it_copies():
    assert MODELS["clap_mp3"].dim == MODELS["clap"].dim and MODELS["clap_mp3"].dtype == MODELS["clap"].dtype
    assert MODELS["clap_mp3"].model_id != MODELS["clap"].model_id and "MP3 128" in MODELS["clap_mp3"].recipe
    assert VARIANT_OF == {"clap_mp3": "clap"} and worker_of("clap_mp3") == "clap" and worker_of("effnet") == "effnet"
    assert same_as_base("clap_mp3", "deezer")
    assert not any(same_as_base("clap_mp3", s) for s in ("itunes:us", "itunes:jp", "youtube", "bandcamp", "local"))
    assert not same_as_base("clap", "deezer")
    assert onepass.Options().models == ("effnet", "clap") and fulllength.Options().models == ("effnet", "clap")  # opt-in


# --- the top-up: a run for the variant alone ---------------------------------------------------------

def test_a_run_for_the_variant_alone_fetches_only_what_lacks_it_and_writes_no_baseline_row(world):
    world.run(("effnet", "clap"), keys=FIRST4)
    before, clips_before = world.rows(), world.clip_rows()
    world.downloaded.clear(), world.fetched.clear(), world.log.clear(), world.workers.clear()

    lines = world.run(MP3)
    assert world.downloaded == ranks("i2") + ranks("i3")  # the iTunes clips clap has; no Deezer clip, nothing of Album4
    assert world.fetched == [("itunes:us", "i2"), ("itunes:gb", "i3")]  # a Deezer album is not even listed
    assert [e for e in world.log if e[0] == "start"] == [("start", "clap")] and "effnet" not in world.workers  # no EffNet child
    assert all(extra == {"recipe": "mp3"} and kind == "bytes" for kind, _, extra in world.calls("clap"))  # the stereo path, from the bytes

    base = [r for r in world.rows() if r[4] != "clap_mp3"]
    assert base == before and world.clip_rows() == clips_before  # effnet and clap rows, and the clip rows, are as they were
    for track in ranks("d0") + ranks("d1"):  # Deezer: the clap row itself, to the byte
        status, emb, origin = world.emb("clap_mp3", track)
        assert (status, emb) == world.emb("clap", track)[:2] and emb == plain(audio(track)) and origin == "copy:clap"
    for track in ranks("i2") + ranks("i3"):  # iTunes: the round-trip recipe, another vector than clap's
        status, emb, origin = world.emb("clap_mp3", track)
        assert status == "ok" and emb == tripped(audio(track)) != world.emb("clap", track)[1] and origin == "onepass"
    assert world.rows("key = 'Album4'") == []
    assert any("8 Deezer clips took their clap row" in line for line in lines)
    assert any("2 to fetch" in line and "2 from Deezer" in line and "1 with no ok clip of the base model" in line for line in lines)
    assert any("following clap: 8 of its clips asked for, 0 of them gone" in line for line in lines)

    world.downloaded.clear(), world.fetched.clear()
    again = world.run(MP3)
    assert world.downloaded == [] and world.fetched == [] and any("0 to fetch" in line for line in again)
    cache = OnePassCache(world.out_db, readonly=True)
    for model in ("clap", "clap_mp3"):  # the two are pooled over the same clips
        keys, X, n, sources = cache.means(model, 4)
        assert list(keys) == list(FIRST4) and list(n) == [4, 4, 4, 4] and list(sources) == ["deezer", "deezer", "itunes:us", "itunes:gb"]
    a, b = cache.means("clap", 4)[1], cache.means("clap_mp3", 4)[1]
    assert np.array_equal(a[:2], b[:2]) and not np.allclose(a[2:], b[2:])
    cache.close()


def test_a_stopped_top_up_continues_where_it_stopped(world):
    world.run(("effnet", "clap"), keys=FIRST4)
    world.downloaded.clear()
    world.on_download = lambda track: setattr(world.stop, "asked", len(world.downloaded) >= 3)
    lines = world.run(MP3)
    done = [r[3] for r in world.rows("model = 'clap_mp3' AND source != 'deezer' AND status = 'ok'")]
    assert 1 <= len(done) < 8 and any("stopped" in line for line in lines)
    world.on_download = None
    world.downloaded.clear()
    world.run(MP3)
    assert sorted(world.downloaded) == sorted(set(ranks("i2") + ranks("i3")) - set(done))  # only what was left
    assert len(world.rows("model = 'clap_mp3' AND status = 'ok'")) == 16


def test_the_top_up_follows_the_clips_clap_has_not_the_listing(world):
    world.payload = {"i2-5": b"SHORT"}  # the second clip in rank order is too short for the baseline: the next track replaced it
    world.run(("effnet", "clap"), keys=("Album2",))
    theirs = [r[3] for r in world.rows("model = 'clap' AND status = 'ok'")]
    order = [f"i2-{i}" for i in priority_order(10)]
    assert order[1] == "i2-5" and sorted(theirs) == sorted([order[0], *order[2:5]])
    world.downloaded.clear()
    world.run(MP3, keys=("Album2",))
    assert sorted(world.downloaded) == sorted(theirs)  # the failed track is not asked for again
    assert [r[3] for r in world.rows("model = 'clap_mp3'")] == sorted(theirs)


def test_a_preview_that_is_gone_is_recorded_and_replaced_by_the_next_track(world):
    world.run(("effnet", "clap"), keys=("Album2",))
    before = world.rows()
    order = [f"i2-{i}" for i in priority_order(10)]
    gone = order[2]
    world.listings = {**world.listings, ("itunes:us", "i2"): [{**t, "preview_url": None if t["track_id"] == gone else t["preview_url"]}
                                                           for t in listing("i2", 10)]}
    world.downloaded.clear()
    lines = world.run(MP3, keys=("Album2",))
    playable = [t["track_id"] for t in world.listings[("itunes:us", "i2")] if t["preview_url"]]
    stand_in = next(playable[i] for i in priority_order(9) if playable[i] not in order[:4])  # the usual walk, over today's listing
    assert world.downloaded == [order[0], order[1], order[3], stand_in]  # the gone one is never asked for
    got = {r[3]: (r[5], r[6]) for r in world.rows("model = 'clap_mp3'")}
    assert got[gone] == ("no_preview", onepass.GONE) and got[stand_in] == ("ok", None) and len(got) == 5
    assert any("1 of them gone" in line and "1 other tracks tried in their place, 1 ok" in line for line in lines)
    assert [r for r in world.rows() if r[4] != "clap_mp3"] == before  # the replacement has no effnet or clap row
    world.downloaded.clear()
    world.run(MP3, keys=("Album2",))
    assert world.downloaded == []  # final: not tried again

    world.listings = {**world.listings, ("itunes:gb", "i3"): []}  # an album the store no longer lists at all
    world.run(("effnet", "clap"), keys=("Album4",))
    world.listings = {**world.listings, ("itunes:us", "i4"): []}
    lines = world.run(MP3, keys=("Album4",))
    assert Counter(r[5] for r in world.rows("model = 'clap_mp3' AND key = 'Album4'")) == {"no_preview": 4}
    assert any("4 of them gone" in line and "0 other tracks" in line for line in lines)


def test_checking_the_baseline_embeds_clap_again_and_writes_nothing_of_it(world):
    world.run(("effnet", "clap"), keys=("Album2",))
    before = world.rows()
    world.payload = {ranks("i2")[1]: b"audio:another preview now"}
    world.workers.clear()
    lines = world.run(MP3, keys=("Album2",), check_base=True)
    checks = [line.split("\t") for line in lines if line.startswith("check\t")]
    assert len(checks) == 4 and [float(c[4]) == 1.0 for c in checks] == [True, False, True, True]
    assert any("baseline check: 4 clips embedded again for clap" in line and "1 under 0.99" in line for line in lines)
    assert [extra for _, _, extra in world.calls("clap")] == [{"recipe": "mp3"}, {}] * 4 and "effnet" not in world.workers
    assert [r for r in world.rows() if r[4] != "clap_mp3"] == before


def test_a_dry_run_of_the_top_up_counts_the_copies_and_writes_nothing(world):
    world.run(("effnet", "clap"), keys=FIRST4)
    before = world.rows()
    lines = []
    assert run(Options(matches=world.matches, out=world.out_db, models=MP3, dry_run=True), out=lines.append) == 0
    assert "2 to fetch" in lines[0] and "2 from Deezer" in lines[0] and world.rows() == before
    lines = []
    assert run(Options(matches=world.matches, out=world.out_db, models=ALL, dry_run=True), out=lines.append) == 0
    assert "2 complete, 3 to fetch" in lines[0]  # with all three: the Deezer albums need nothing, Album4 everything


# --- new albums: all three models from one download --------------------------------------------------

def test_a_new_album_gets_all_three_models_from_one_download(world):
    lines = world.run(ALL, keys=("Album0", "Album2"))
    assert world.downloaded == ranks("d0") + ranks("i2")  # once each
    assert [e for e in world.log if e[0] == "start"] == [("start", "effnet"), ("start", "clap")]
    deezer, itunes = world.calls("clap")[:4], world.calls("clap")[4:]
    assert [extra for _, _, extra in deezer] == [{}] * 4  # a Deezer clip is embedded once: its clap_mp3 is that vector
    assert [extra for _, _, extra in itunes] == [{}, {"recipe": "mp3"}] * 4  # an iTunes clip twice, from the same bytes
    assert all(a[1] == b[1] for a, b in zip(itunes[::2], itunes[1::2]))
    assert len(world.calls("effnet")) == 8
    for track in ranks("d0"):
        assert world.emb("clap_mp3", track)[:2] == world.emb("clap", track)[:2] == ("ok", plain(audio(track)))
    for track in ranks("i2"):
        assert world.emb("clap", track)[1] == plain(audio(track)) and world.emb("clap_mp3", track)[1] == tripped(audio(track))
    assert any("2 to fetch" in line for line in lines)
    world.downloaded.clear()
    world.run(ALL, keys=("Album0", "Album2"))
    assert world.downloaded == []


def test_the_embedder_takes_the_plain_recipe_for_a_deezer_clip_and_one_channel_for_a_mono_buffer(world):
    e = Embedder({"clap": world.factory("clap")}, out=lambda line: None)
    got = e.embed(["clap_mp3"], data=b"audio:x", suffix=".mp3", source="deezer")
    assert got["clap_mp3"]["emb"] == plain(b"audio:x") and world.calls("clap")[-1][2] == {}
    got = e.embed(["clap_mp3"], data=b"audio:x", suffix=".m4a", source="itunes:de")
    assert got["clap_mp3"]["emb"] == tripped(b"audio:x")
    mono = np.arange(8, dtype="<f4")
    stereo = np.stack([mono, -mono], axis=1)
    got = e.embed(["clap", "clap_mp3"], mono=mono, channels=stereo, source="youtube")
    assert world.calls("clap")[-2][:2] == ("mono", mono.tobytes()) and world.calls("clap")[-1] == ("pcm", stereo.tobytes(), {"recipe": "mp3", "ch": 2})
    assert got["clap"]["emb"] == plain(mono.tobytes()) and got["clap_mp3"]["emb"] == tripped(stereo.tobytes(), "pcm", 2)
    e.embed(["clap_mp3"], mono=mono, source="local")  # no channels to give: one channel, duplicated by the worker
    assert world.calls("clap")[-1] == ("pcm", mono.tobytes(), {"recipe": "mp3", "ch": 1})
    e.close()


# --- the copy ----------------------------------------------------------------------------------------

def test_the_copy_is_exact_cache_only_and_never_replaces_an_ok_row(world, capsys):
    world.payload = {"d1-0": b"SHORT"}
    world.run(("effnet", "clap"))
    before = world.rows()
    world.downloaded.clear(), world.fetched.clear()
    assert onepass.main(["copy", "--out", str(world.out_db), "--keys", "Album0"]) == 0
    assert "4 Deezer clips took their clap row" in capsys.readouterr().out
    assert {r[0] for r in world.rows("model = 'clap_mp3'")} == {"Album0"}
    assert onepass.main(["copy", "--out", str(world.out_db)]) == 0
    copies = world.rows("model = 'clap_mp3'")
    originals = world.rows("model = 'clap' AND source = 'deezer'")
    assert [(*r[:4], *r[5:9]) for r in copies] == [(*r[:4], *r[5:9]) for r in originals]  # status, error, seconds, bytes
    assert Counter(r[5] for r in copies) == {"ok": 8, "too_short": 1} and {r[9] for r in copies} == {"copy:clap"}
    assert [r for r in world.rows() if r[4] != "clap_mp3"] == before and world.downloaded == [] and world.fetched == []

    cache = OnePassCache(world.out_db)
    mine = np.ones(512, "<f4").tobytes()
    rec = dict(zip(("key", "source", "album_id", "track_id"), copies[0][:4]))
    cache.put_result(rec, "clap_mp3", "ok", emb=mine)
    assert cache.copy_variant("clap_mp3") == Counter()  # nothing left to copy, and an ok row stays
    assert cache.con.execute("SELECT emb FROM embeddings WHERE model = 'clap_mp3' AND key = ? AND track_id = ?",
                             (rec["key"], rec["track_id"])).fetchone()[0] == mine
    cache.put_result(rec, "clap_mp3", "download_failed", "HTTP 503")
    assert cache.copy_variant("clap_mp3")["ok"] == 1  # a row that is not ok gives way to the ok baseline
    cache.close()
    assert world.emb("clap_mp3", rec["track_id"])[:2] == world.emb("clap", rec["track_id"])[:2]


# --- full-length windows -----------------------------------------------------------------------------

@pytest.fixture
def videos(tmp_path):
    """Two new albums without a preview, each with a YouTube link that is the album."""

    class World:
        opts = dict(catalog=tmp_path / "albums.csv", keys_csv=tmp_path / "keys.csv", matches=tmp_path / "matches.csv",
                    csv=tmp_path / "audio" / "fulllength.csv", out=tmp_path / "cache" / "onepass.sqlite",
                    tmp=tmp_path / "cache" / "fulllength-tmp", pause=0.0)
        pages = {YT + "full": video("Artist0 - Title0 (full album)", 2400) | {"id": "full"},
                 YT + "mid": video("Artist1 - Title1", 1500) | {"id": "mid"}}
        lengths = {YT + "full": [2400.0], YT + "mid": [1500.0]}

        def __init__(self):
            self.fetcher = Fetcher(self.pages, self.lengths)
            self.workers, self.log, self.windows = {}, [], []

        def decode_window(self, path, start, length):
            """Two channels that differ, so the channel average is neither of them."""
            self.windows.append((start, length))
            left = np.full(int(length * 100), start, np.float32)
            return np.stack([left, left + 2.0], axis=1)

        def factory(self, name):
            def make():
                self.workers.setdefault(name, []).append(FakeWorker(name, self.log))
                return self.workers[name][-1]
            return make

        def calls(self, name):
            return [c for w in self.workers.get(name, []) for c in w.calls]

        def run(self, models, code=0, decode_window=None, **kw):
            lines = []
            opts = fulllength.Options(**{**self.opts, "models": models, **kw})
            embedder = Embedder({worker_of(m): self.factory(worker_of(m)) for m in models}, "own", None, lines.append)
            assert fulllength.run(opts, self.fetcher, embedder, lines.append, NoStop(), wav_seconds,
                                  decode_window or self.decode_window, lambda s: None) == code
            assert not opts.tmp.exists()
            return lines

        def rows(self, where="1"):
            cache = OnePassCache(self.opts["out"], readonly=True)
            got = cache.con.execute("SELECT key, source, album_id, track_id, model, status, error, clip_s, emb, origin, updated_at "
                                    f"FROM embeddings WHERE {where} ORDER BY 1, 2, 3, 4, 5").fetchall()
            clips = cache.con.execute("SELECT * FROM clips ORDER BY 1, 2, 3, 4").fetchall()
            listings = cache.con.execute("SELECT * FROM listings ORDER BY 1, 2, 3").fetchall()
            cache.close()
            return got, clips, listings

    lines = [f"Album{i},{i + 1},Artist{i},Title{i},,,Artist{i},Title{i},Album,,{YT}{n}" for i, n in enumerate(("full", "mid"))]
    (tmp_path / "albums.csv").write_text(CATALOG + "\n".join(lines) + "\n", encoding="utf-8")
    (tmp_path / "keys.csv").write_text("rym_id,legacy_uri\n")
    (tmp_path / "matches.csv").write_text("key,source,source_album_id,n_clips_available,runtime_s\nAlbum0,,,,\nAlbum1,,,,\n")
    return World()


def test_a_full_length_album_gets_all_three_models_from_one_download_and_one_decode_per_window(videos):
    lines = videos.run(ALL)
    assert videos.fetcher.downloaded == [YT + "full", YT + "mid"] and len(videos.windows) == 16  # one decode per window
    mono = [c for c in videos.calls("clap") if not c[2]]
    trip = [c for c in videos.calls("clap") if c[2]]
    assert len(mono) == len(trip) == len(videos.calls("effnet")) == 16
    for (start, length), a, b, e in zip(videos.windows, mono, trip, videos.calls("effnet")):
        stereo = videos.decode_window(None, start, length)
        average = stereo.mean(axis=1, dtype=np.float32)  # (L+R)/2: what the mono decode gives
        assert a[:2] == e[:2] == ("mono", average.tobytes())
        assert b == ("pcm", stereo.tobytes(), {"recipe": "mp3", "ch": 2})
    cache = OnePassCache(videos.opts["out"], readonly=True)
    assert cache.counts() == {m: Counter(ok=16) for m in ALL}
    for m in ALL:
        assert list(cache.means(m, 4)[0]) == ["Album0", "Album1"] and list(cache.means(m, 4)[2]) == [8, 5]
    cache.close()
    assert any("16 windows embedded for effnet + clap + clap_mp3" in line for line in lines)
    assert "0 to do now" in videos.run(ALL)[0] and len(videos.fetcher.downloaded) == 2


def test_an_embedded_album_is_fetched_once_more_for_the_variant_alone(videos):
    videos.run(("effnet", "clap"))
    before, outcomes = videos.rows(), videos.opts["csv"].read_bytes()
    first = list(videos.windows)
    videos.windows.clear(), videos.workers.clear(), videos.log.clear()

    assert "0 to do now" in videos.run(MP3, refetch=False)[0] and len(videos.fetcher.downloaded) == 2  # --no-refetch
    lines = videos.run(MP3, keys=("Album0",), check_base=True)
    assert "1 to do now" in lines[0] and "1 of those to do are embedded albums fetched again for clap_mp3 alone" in lines[0]
    assert videos.fetcher.downloaded == [YT + "full", YT + "mid", YT + "full"]
    assert sorted(videos.windows) == sorted(first[:8])  # the windows the cache has: same starts, same lengths
    assert "effnet" not in videos.workers and [e for e in videos.log if e[0] == "start"] == [("start", "clap")]
    assert sorted(c[2].get("recipe", "") for c in videos.calls("clap")) == [""] * 8 + ["mp3"] * 8  # 8 for the check, not stored
    assert sum(line.startswith("check\tAlbum0\tyoutube\t") and line.endswith("\t1.00000") for line in lines) == 8
    assert any("topped_up" in line and "8 windows ok for clap_mp3" in line and "median 1.0000" in line for line in lines)
    rows, clips, listings = videos.rows("model != 'clap_mp3'")
    assert (rows, clips, listings) == before and videos.opts["csv"].read_bytes() == outcomes  # nothing of the baseline is written
    got = videos.rows("model = 'clap_mp3'")[0]
    assert len(got) == 8 and {r[0] for r in got} == {"Album0"} and all(r[5] == "ok" for r in got)
    stereo = videos.decode_window(None, *first[0])
    assert tripped(stereo.tobytes(), "pcm", 2) in {r[8] for r in got}

    videos.windows.clear()
    lines = videos.run(ALL)  # the resumed run with the variant: the other embedded album is topped up, nothing else is due
    assert videos.fetcher.downloaded[3:] == [YT + "mid"] and len(videos.windows) == 8 and "1 to do now" in lines[0]
    assert len(videos.calls("clap")) == 16 + 8  # no clap and no effnet for it
    assert videos.rows("model != 'clap_mp3'") == before and videos.opts["csv"].read_bytes() == outcomes
    assert "0 to do now" in videos.run(ALL)[0] and "0 to do now" in videos.run(MP3)[0]
    cache = OnePassCache(videos.opts["out"], readonly=True)
    assert list(cache.means("clap_mp3", 4)[2]) == list(cache.means("clap", 4)[2]) == [8, 5]
    cache.close()


def test_a_top_up_is_refused_when_the_link_is_no_longer_the_audio_that_was_embedded(videos):
    videos.run(("effnet", "clap"))
    before, outcomes = videos.rows(), videos.opts["csv"].read_bytes()
    videos.fetcher.lengths = {YT + "full": [2300.0], YT + "mid": [1500.0]}  # another upload under the same link
    videos.fetcher.pages = {**videos.pages, YT + "mid": video("Artist1 - Title1", 1500) | {"id": "other"}}  # another video
    lines = videos.run(MP3, max_failures=5)
    assert any("Album0" in line and "2300.0 s now and was 2400.0 s" in line for line in lines)
    assert any("Album1" in line and "the link is now other; the cache has windows of mid" in line for line in lines)
    assert videos.rows() == before and videos.opts["csv"].read_bytes() == outcomes
    assert videos.fetcher.downloaded.count(YT + "mid") == 1  # the other video is not even downloaded
    videos.fetcher.pages = {**videos.pages, YT + "full": fulllength.Blocked("ERROR: HTTP Error 429")}
    lines = videos.run(MP3, code=2)
    assert any("stopping" in line for line in lines) and videos.opts["csv"].read_bytes() == outcomes


# --- the real round trip, and the pipe ---------------------------------------------------------------

needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg is not on PATH")


def tone(seconds: float = 2.0) -> np.ndarray:
    t = np.arange(int(seconds * mp3trip.SR)) / mp3trip.SR
    rng = np.random.default_rng(0)
    left = 0.3 * np.sin(2 * np.pi * 440 * t) + 0.02 * rng.standard_normal(len(t))
    right = 0.3 * np.sin(2 * np.pi * 660 * t) + 0.02 * rng.standard_normal(len(t))
    return np.stack([left, right], axis=1).astype(np.float32)


@needs_ffmpeg
def test_the_round_trip_is_a_stereo_mp3_encode_and_a_mono_signal_is_duplicated_for_it():
    ffmpeg, x = shutil.which("ffmpeg"), tone()
    y = mp3trip.roundtrip(x, ffmpeg)
    assert y.shape == (len(x),) and y.dtype == np.float32  # mono, the input's length
    average = mp3trip.mono_of(x)
    assert not np.array_equal(y, average) and np.corrcoef(y[4000:-4000], np.roll(average, 1105)[4000:-4000])[0, 1] > 0.9  # lossy, the same music
    assert np.array_equal(y, mp3trip.roundtrip(x, ffmpeg))  # the same every time
    mono = average[:, None]
    assert np.array_equal(mp3trip.as_stereo(mono), np.stack([average, average], axis=1))
    assert np.array_equal(mp3trip.roundtrip(mono, ffmpeg), mp3trip.mp3_stereo(np.stack([average, average], axis=1), ffmpeg))
    assert np.array_equal(mp3trip.roundtrip(average, ffmpeg), mp3trip.roundtrip(mono, ffmpeg))  # a 1-D buffer is one channel
    assert not np.array_equal(mp3trip.roundtrip(mono, ffmpeg), mp3trip.mp3_stereo(mono, ffmpeg))  # not LAME's mono mode
    five = np.concatenate([x, x, x[:, :1]], axis=1)
    assert np.array_equal(mp3trip.as_stereo(five)[:, 0], five.mean(axis=1, dtype=np.float32))  # more channels: their average


@needs_ffmpeg
def test_the_stereo_decode_averages_to_the_baselines_mono_decode(tmp_path):
    ffmpeg, x = shutil.which("ffmpeg"), tone(6.0)
    p = subprocess.run([ffmpeg, "-v", "error", "-f", "f32le", "-ar", "44100", "-ac", "2", "-i", "pipe:0", "-c:a", "aac", "-b:a", "192k",
                        "-f", "adts", "pipe:1"], input=x.tobytes(), capture_output=True)
    assert p.returncode == 0 and p.stdout
    channels = mp3trip.decode_channels(p.stdout, ".aac", str(tmp_path), ffmpeg)
    assert channels.ndim == 2 and channels.shape[1] == 2 and abs(len(channels) / 44100 - 6.0) < 0.1
    assert np.array_equal(mp3trip.mono_of(channels), clap_catalog().decode(p.stdout, ".aac", str(tmp_path), ffmpeg))
    assert list(tmp_path.iterdir()) == []  # nothing is left on disk
    path = tmp_path / "album.aac"
    path.write_bytes(p.stdout)
    decode = onepass.window_decoder(ALL, ffmpeg)
    window = decode(str(path), 1.0, 3.0)
    assert window.shape == (3 * 44100, 2)
    assert np.array_equal(mp3trip.mono_of(window), onepass.window_decoder(("effnet", "clap"), ffmpeg)(str(path), 1.0, 3.0))


def test_the_recipe_and_the_channels_reach_a_worker_process_over_the_pipe():
    w = Worker("clap", [sys.executable, "-m", "rmr_audio.onepass_worker", "--backend", "stub", "--model", "clap", "--dim", "512",
                        "--dtype", "<f4"], onepass.PIPELINE_DIR, reply_timeout=30, ready_timeout=30)
    w.start()
    try:
        stereo = np.zeros((44100, 2), "<f4").tobytes()
        w.send("pcm", stereo, "", {"recipe": "mp3", "ch": 2})
        header, emb = w.recv()
        assert header["status"] == "ok" and header["clip_s"] == 1.0 and emb == tripped(stereo, "pcm", 2)
        w.send("bytes", b"audio:x", ".m4a", {"recipe": "mp3"})
        assert w.recv()[1] == tripped(b"audio:x")
        w.send("bytes", b"audio:x", ".m4a")
        assert w.recv()[1] == plain(b"audio:x")
    finally:
        w.close()
