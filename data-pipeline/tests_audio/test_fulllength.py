"""Full-length audio (rmr_audio.fulllength) with a stub in place of yt-dlp and stub models: what a link is
taken for, that the file is always deleted, that a run resumes, the window count, the source names. Nothing
touches the network and no model is loaded; the files are synthetic WAVs at 100 Hz (a 40-minute one is
240 kB)."""
import shutil
import subprocess
import wave
from collections import Counter

import numpy as np
import pytest

from rmr_pipeline.audio_store import DIM, SOURCE_RE, StoreError, write_shard
from rmr_audio import fulllength, onepass, windows
from rmr_audio.fulllength import Blocked, FetchError, Options, Unavailable, YtDlp, classify, fetch_error, run
from rmr_audio.onepass import Embedder
from rmr_audio.onepass_cache import MODELS, WINDOW_SOURCES, OnePassCache
from rmr_audio.onepass_worker import clap_catalog

from .test_onepass import FakeWorker, NoStop

RATE = 100
CATALOG = "rym_id,rank,artist,title,artist_latin,title_latin,rym_artist,rym_title,type,bandcamp_url,youtube_url\n"
ROW = {"artist": "Boris", "title": "Flood", "artist_latin": "", "title_latin": "", "rym_artist": "Boris", "rym_title": "Flood"}


def video(title="Boris - Flood (Full Album)", duration=4230, uploader="someone", **more) -> dict:
    return {"_type": "video", "id": "vid", "title": title, "duration": duration, "uploader": uploader, **more}


def write_wav(path, seconds: float) -> None:
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1), f.setsampwidth(1), f.setframerate(RATE)
        f.writeframes(bytes(int(seconds * RATE)))


def wav_seconds(path) -> float:
    with wave.open(str(path), "rb") as f:
        return f.getnframes() / f.getframerate()


# --- what a link is taken for ------------------------------------------------------------------------

@pytest.mark.parametrize("info, row, runtime, cls", [
    (video(), ROW, None, "full_album"),
    (video("flood", 4230, "Release - Topic"), ROW, None, "full_album"),  # the title alone
    (video("Live at the Budokan", 4230, "Boris - Topic"), ROW, None, "full_album"),  # the uploader alone: not listened to
    (video("Flood I", 410, "Boris - Topic"), ROW, None, "single_track"),
    (video("Boris - Flood [FULL ALBUM]", 700), ROW, None, "full_album"),  # says so: believed from eight minutes
    (video("Boris - Flood [FULL ALBUM]", 300), ROW, None, "single_track"),
    (video(duration=1500), ROW, 4200.0, "single_track"),  # under 60% of the known runtime
    (video(duration=2600), ROW, 4200.0, "full_album"),
    (video(duration=14 * 60, title="Boris - Flood"), ROW, None, "single_track"),
    (video(duration=15 * 60, title="Boris - Flood"), ROW, None, "full_album"),
    (video("Top 10 cat videos", 4000, "cats"), ROW, None, "mismatch"),
    (video("Top 10 cat videos", 200, "cats"), ROW, None, "mismatch"),
    (video(duration=7 * 3600), ROW, None, "mismatch"),  # ten hours of rain is not an album
    (video(duration=None), ROW, None, "unavailable"),
    (video(live_status="is_live"), ROW, None, "unavailable"),
    ({"_type": "playlist", "id": "PL1", "title": "Boris - Flood", "entries": [video()]}, ROW, None, "mismatch"),
    (video("ボアダムス - Vision Creation Newsun (full album)", 4000),
     {"artist": "ボアダムス [Boredoms]", "title": "ヴィジョン クリエイション ニューサン", "title_latin": "Vision Creation Newsun"}, None, "full_album"),
    (video("ヴィジョンクリエイションニューサン", 4000, "x"),
     {"artist": "ボアダムス [Boredoms]", "title": "ヴィジョン クリエイション ニューサン", "title_latin": ""}, None, "full_album"),
    (video("Godspeed You! Black Emperor – Lift Your Skinny Fists Like Antennas to Heaven", 5200),
     {"artist": "Godspeed You Black Emperor!", "title": "Lift Yr. Skinny Fists Like Antennas to Heaven!"}, None, "full_album"),
])
def test_a_link_is_classified_from_its_title_duration_and_uploader(info, row, runtime, cls):
    v = classify(info, row, "youtube", "https://www.youtube.com/watch?v=vid", runtime)
    assert v.cls == cls, v.reason
    assert v.album_id == info["id"] if info["_type"] == "video" else True


def test_a_bandcamp_page_is_its_tracks_together():
    page = {"_type": "playlist", "id": "1", "title": "Flood", "uploader": "Boris",
            "entries": [{"duration": 300.0, "title": f"t{i}"} for i in range(3)]}
    v = classify(page, ROW, "bandcamp", "https://boris.bandcamp.com/album/flood/")
    assert (v.cls, v.duration_s, v.album_id) == ("full_album", 900.0, "boris.bandcamp.com/album/flood")
    page["entries"] = page["entries"][:1]
    assert classify(page, ROW, "bandcamp", "https://boris.bandcamp.com/album/flood").cls == "single_track"
    page["entries"] = [{"title": "t", "duration": None}]
    assert classify(page, ROW, "bandcamp", "https://boris.bandcamp.com/album/flood").cls == "unavailable"


@pytest.mark.parametrize("stderr, kind", [
    ("ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader", Unavailable),
    ("ERROR: [youtube] x: Private video. Sign in if you've been granted access to this video", Unavailable),
    ("ERROR: [youtube] x: Sign in to confirm your age. This video may be inappropriate for some users.", Unavailable),
    ("ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies-from-browser", Blocked),
    ("ERROR: unable to download video data: HTTP Error 429: Too Many Requests", Blocked),
    ("ERROR: [youtube] x: Video unavailable. This content isn't available, try again later.", Blocked),
    ("WARNING: something\nERROR: [youtube] x: Requested format is not available", FetchError),
    ("ERROR: unable to download video data: HTTP Error 403: Forbidden", FetchError),
    ("", FetchError),
])
def test_what_yt_dlp_said_is_read_as_blocked_unavailable_or_a_failure(stderr, kind):
    assert type(fetch_error(stderr)) is kind


def test_yt_dlp_is_asked_for_audio_only_without_cookies_or_the_users_config(monkeypatch, tmp_path):
    calls = []

    def fake_run(argv, **kw):
        calls.append(argv)
        if "-J" in argv:
            return subprocess.CompletedProcess(argv, 0, b'{"id": "vid", "title": "t", "duration": 10}', b"")
        (tmp_path / "vid.webm").write_bytes(b"x")
        (tmp_path / ".hidden").write_bytes(b"x")
        return subprocess.CompletedProcess(argv, 0, b"", b"")

    monkeypatch.setattr(fulllength.subprocess, "run", fake_run)
    yt = YtDlp(tmp_path / "python")
    assert yt.info("https://www.youtube.com/watch?v=vid", "youtube")["id"] == "vid"
    assert [p.name for p in yt.download("https://www.youtube.com/watch?v=vid", "youtube", tmp_path)] == ["vid.webm"]
    info, download = calls
    for argv in calls:
        assert argv[:5] == [str(tmp_path / "python"), "-m", "yt_dlp", "--ignore-config", "--no-cache-dir"]
        assert "--no-playlist" in argv and not any("cookie" in a or "username" in a or "password" in a or "netrc" in a for a in argv)
    assert "--skip-download" in info and "-f" not in info
    assert download[download.index("-f") + 1] == "bestaudio[abr<=160]/bestaudio"  # an audio-only stream, never a video
    monkeypatch.setattr(fulllength.subprocess, "run", lambda argv, **kw: subprocess.CompletedProcess(
        argv, 1, b"", b"ERROR: HTTP Error 429: Too Many Requests"))
    with pytest.raises(Blocked):
        yt.info("u", "youtube")


# --- runs --------------------------------------------------------------------------------------------

class Fetcher:
    """Stands in for yt-dlp. `pages`: url -> metadata, or an exception; `lengths`: url -> seconds of each file
    its download writes, or an exception raised after a file was written."""

    def __init__(self, pages, lengths):
        self.pages, self.lengths, self.asked, self.downloaded, self.folders = pages, lengths, [], [], []

    def info(self, url, source):
        self.asked.append(url)
        got = self.pages[url]
        if isinstance(got, Exception):
            raise got
        return got

    def download(self, url, source, folder):
        self.downloaded.append(url)
        self.folders.append(folder)
        got = self.lengths[url]
        if isinstance(got, Exception):
            write_wav(folder / "half.webm", 10)
            raise got
        for i, seconds in enumerate(got):
            write_wav(folder / f"{i + 1:03d}.wav", seconds)
        return sorted(folder.iterdir())


YT = "https://www.youtube.com/watch?v="


@pytest.fixture
def world(tmp_path):
    """Seven new albums without a preview (five with a YouTube link, one with Bandcamp only, one with both),
    one new album with previews and one existing album."""

    class World:
        opts = dict(catalog=tmp_path / "albums.csv", keys_csv=tmp_path / "keys.csv", matches=tmp_path / "matches.csv",
                    csv=tmp_path / "audio" / "fulllength.csv", out=tmp_path / "cache" / "onepass.sqlite",
                    tmp=tmp_path / "cache" / "fulllength-tmp", pause=5.0)
        pages = {YT + "full": video("Artist0 - Title0 (full album)", 2400) | {"id": "full"},
                 YT + "short": video("Title1", 200, "Artist1 - Topic") | {"id": "short"},
                 YT + "gone": Unavailable("ERROR: Video unavailable"),
                 YT + "other": video("unboxing", 3000) | {"id": "other"},
                 YT + "mid": video("Artist4 - Title4", 1500) | {"id": "mid"},
                 YT + "gone6": Unavailable("ERROR: Private video"),
                 "https://a5.bandcamp.com/album/title5": {"_type": "playlist", "id": "5", "title": "Title5", "uploader": "Artist5",
                                                          "entries": [{"duration": 600.0}, {"duration": 1200.0}, {"duration": 3.0}]},
                 "https://a6.bandcamp.com/album/title6": {"_type": "playlist", "id": "6", "title": "Title6", "uploader": "Artist6",
                                                          "entries": [{"duration": 900.0}, {"duration": 900.0}]}}
        lengths = {YT + "full": [2400.0], YT + "mid": [1500.0], "https://a5.bandcamp.com/album/title5": [600.0, 1200.0, 3.0],
                   "https://a6.bandcamp.com/album/title6": [900.0, 900.0]}
        slept: list = []
        windows: list = []
        log: list = []

        def __init__(self):
            self.fetcher = Fetcher(self.pages, self.lengths)
            self.workers = {}

        def decode_window(self, path, start, length):
            assert wav_seconds(path) >= start + length - 0.01
            self.windows.append((path.rsplit("/", 1)[1], round(start, 2), length))
            return np.full(int(length * 100), start, np.float32)

        def factory(self, model):
            def make():
                self.workers.setdefault(model, []).append(FakeWorker(model, self.log))
                return self.workers[model][-1]
            return make

        def run(self, code=0, decode_window=None, **kw):
            lines = []
            opts = Options(**{**self.opts, **kw})
            embedder = Embedder({m: self.factory(m) for m in opts.models}, "own", None, lines.append)
            assert run(opts, self.fetcher, embedder, lines.append, NoStop(), wav_seconds,
                       decode_window or self.decode_window, self.slept.append) == code
            assert not opts.tmp.exists()  # nothing of any album is left, however the run ended
            return lines

        def rows(self):
            return {(k, s): (r["class"], r["status"], r["n_windows"]) for (k, s), r in fulllength.load_outcomes(self.opts["csv"]).items()}

        def cache(self):
            return OnePassCache(self.opts["out"], readonly=True)

    names = ["full", "short", "gone", "other", "mid"]
    lines = [f"Album{i},{i + 1},Artist{i},Title{i},,,Artist{i},Title{i},Album,,{YT}{n}" for i, n in enumerate(names)]
    lines += ["Album5,6,Artist5,Title5,,,Artist5,Title5,Album,https://a5.bandcamp.com/album/title5,",
              f"Album6,7,Artist6,Title6,,,Artist6,Title6,Album,https://a6.bandcamp.com/album/title6,{YT}gone6",
              f"Album7,8,Artist7,Title7,,,Artist7,Title7,Album,,{YT}has-previews",
              f"Old0,9,Old,Old,,,Old,Old,Album,,{YT}old"]
    (tmp_path / "albums.csv").write_text(CATALOG + "\n".join(lines) + "\n", encoding="utf-8")
    (tmp_path / "keys.csv").write_text("rym_id,legacy_uri\nOld0,spotify:album:x\n")
    (tmp_path / "matches.csv").write_text(
        "key,source,source_album_id,n_clips_available,runtime_s\n" + "".join(f"Album{i},,,,\n" for i in range(7))
        + "Album7,deezer,d7,9,\nOld0,,,,\n")
    return World()


def opts_models(world) -> tuple:
    return Options(**world.opts).models  # the models a run embeds unless told otherwise


def test_full_albums_are_embedded_in_windows_under_their_source_and_the_rest_is_recorded(world):
    lines = world.run()
    assert "7 new albums without a preview: 6 with a YouTube link, 1 with Bandcamp only, 0 with neither" in lines[0]
    assert world.fetcher.asked == [YT + n for n in ("full", "short", "gone", "other", "mid", "gone6")]  # no Bandcamp without the flag
    assert world.fetcher.downloaded == [YT + "full", YT + "mid"]  # only what looks like the album is downloaded
    assert all(not f.exists() for f in world.fetcher.folders)  # and deleted once embedded
    assert world.rows() == {("Album0", "youtube"): ("full_album", "embedded", "8"), ("Album1", "youtube"): ("single_track", "skipped", ""),
                            ("Album2", "youtube"): ("unavailable", "skipped", ""), ("Album3", "youtube"): ("mismatch", "skipped", ""),
                            ("Album4", "youtube"): ("full_album", "embedded", "5"), ("Album6", "youtube"): ("unavailable", "skipped", "")}
    assert len(world.slept) == 5 and all(5.0 <= s <= 7.5 for s in world.slept)  # a pause between albums
    # 40 minutes: n = clamp(round(2400 / 300), 4, 8) = 8; 25 minutes: 5 of the 8 embedded go into the mean
    assert Counter(name for name, _, _ in world.windows) == {"001.wav": 16}
    assert all(15 <= start and start + 30 <= (2400 if i < 8 else 1500) - 15 for i, (_, start, _) in enumerate(world.windows))
    cache = world.cache()
    assert cache.counts() == {"effnet": Counter(ok=16), "clap": Counter(ok=16)}
    assert cache.listings()[("Album0", "youtube", "full")] == {"n_tracks": 1, "n_previews": 8, "runtime_s": 2400.0, "n_windows": 8}
    assert cache.listings()[("Album4", "youtube", "mid")]["n_windows"] == windows.n_windows(1500.0) == 5
    assert {r[0] for r in cache.con.execute("SELECT DISTINCT source FROM clips")} == {"youtube"}  # not disguised as local
    for model in opts_models(world):
        keys, X, n, sources = cache.means(model, 4)
        assert list(keys) == ["Album0", "Album4"] and list(sources) == ["youtube", "youtube"] and list(n) == [8, 5]
    cache.close()
    assert any("16 windows embedded" in line for line in lines)


def test_a_second_run_skips_what_is_finished(world):
    world.run()
    asked, windows_before = list(world.fetcher.asked), list(world.windows)
    lines = world.run()
    assert world.fetcher.asked == asked and world.windows == windows_before
    assert "0 to do now" in lines[0] and "6 already done" in lines[0]


def test_a_failed_album_is_tried_again_and_only_its_missing_windows_are_embedded(world):
    def breaks_after_three(path, start, length):
        if len(world.windows) >= 3:
            raise RuntimeError("the worker fell over")
        return world.decode_window(path, start, length)

    world.fetcher.lengths = {**world.lengths, YT + "mid": FetchError("ERROR: HTTP Error 403: Forbidden")}
    world.run(keys=("Album0", "Album4"), decode_window=breaks_after_three)
    assert world.rows() == {("Album0", "youtube"): ("full_album", "embedded", "3"), ("Album4", "youtube"): ("full_album", "failed", "")}
    assert all(not f.exists() for f in world.fetcher.folders) and len(world.fetcher.folders) == 2  # deleted on failure too
    world.fetcher.lengths = world.lengths
    world.run(keys=("Album0", "Album4"))
    assert world.fetcher.downloaded == [YT + "full", YT + "mid", YT + "mid"]  # the embedded album is not fetched again
    assert world.rows()[("Album4", "youtube")] == ("full_album", "embedded", "5") and len(world.windows) == 3 + 8


def test_the_file_is_deleted_when_embedding_raises(world):
    class Dies:
        def embed(self, models, **kw):
            raise RuntimeError("the clap worker died 3 times in a row")

    opts = Options(**world.opts, keys=("Album0",))
    with pytest.raises(RuntimeError, match="died"):
        run(opts, world.fetcher, Dies(), lambda line: None, NoStop(), wav_seconds, world.decode_window, world.slept.append)
    assert world.fetcher.folders and not world.fetcher.folders[0].exists() and not opts.tmp.exists()
    assert world.rows() == {}  # no outcome: the album is tried again
    world.run(keys=("Album0",))  # and the lock was released
    assert world.rows() == {("Album0", "youtube"): ("full_album", "embedded", "8")}


def test_a_sign_of_blocking_stops_the_run_at_once(world):
    world.fetcher.pages = {**world.pages, YT + "short": Blocked("ERROR: Sign in to confirm you’re not a bot")}
    lines = world.run(code=2)
    assert world.fetcher.asked == [YT + "full", YT + "short"]  # nothing after it, and no second try
    assert world.rows()[("Album1", "youtube")] == ("", "blocked", "") and any("stopping" in line for line in lines)
    world.fetcher.pages = world.pages
    world.run()
    assert world.rows()[("Album1", "youtube")] == ("single_track", "skipped", "")  # a blocked album is tried by the next run


def test_failures_in_a_row_stop_the_run(world):
    world.fetcher.pages = {url: FetchError("ERROR: timed out") for url in world.pages}
    lines = world.run(code=2)
    assert len(world.fetcher.asked) == 3 and any("3 albums in a row failed" in line for line in lines)
    world.fetcher.pages = {url: Unavailable("ERROR: Video unavailable") for url in world.pages}
    world.fetcher.asked[:] = []
    lines = world.run(code=2)
    assert len(world.fetcher.asked) == 5 and any("may be a block" in line for line in lines)


def test_bandcamp_is_behind_its_flag_and_only_for_albums_without_a_usable_video(world):
    world.run(bandcamp=True)
    # Album5 has no video; Album6's video is gone. Album1 (a single track on YouTube) has no Bandcamp page.
    assert world.fetcher.asked[-3:] == ["https://a5.bandcamp.com/album/title5", YT + "gone6", "https://a6.bandcamp.com/album/title6"]
    assert len(world.fetcher.asked) == 8
    rows = world.rows()
    assert rows[("Album5", "bandcamp")] == ("full_album", "embedded", "6") and rows[("Album6", "bandcamp")] == ("full_album", "embedded", "6")
    assert Counter(name for name, _, _ in world.windows[-16:-8]) == {"001.wav": 3, "002.wav": 5}  # by duration; three seconds cannot be embedded
    cache = world.cache()
    assert cache.listings()[("Album5", "bandcamp", "a5.bandcamp.com/album/title5")]["n_windows"] == 6  # 30 minutes
    assert list(cache.means("clap", 4)[3]) == ["youtube", "youtube", "bandcamp", "bandcamp"]
    cache.close()


def test_a_sample_is_spread_over_the_ranks_and_the_same_for_a_seed(world):
    albums = fulllength.no_audio_albums(world.opts["catalog"], world.opts["keys_csv"], world.opts["matches"])
    assert [a["key"] for a in albums] == [f"Album{i}" for i in range(7)]  # not the one with previews, not the existing one
    rows = [{"key": f"k{i}", "rank": str(i)} for i in range(300)]
    a, b = fulllength.stratified(rows, 30, 1), fulllength.stratified(rows, 30, 1)
    assert a == b and a != fulllength.stratified(rows, 30, 2)
    assert all(i * 10 <= int(r["rank"]) < (i + 1) * 10 for i, r in enumerate(a))
    lines = world.run(sample=2, seed=1, dry_run=True)
    assert "2 to do now" in lines[0] and world.fetcher.asked == [] and not world.opts["csv"].exists()


def test_two_jobs_cannot_share_the_cache(world, capsys):
    held = onepass.take_lock(onepass.lock_path(world.opts["out"]))
    world.run(code=1)
    held.close()
    assert "held by a running job" in capsys.readouterr().err and world.fetcher.asked == []


# --- the source names --------------------------------------------------------------------------------

def test_the_store_accepts_the_new_sources_and_no_others(tmp_path):
    assert all(SOURCE_RE.match(s) for s in fulllength.SOURCES) and set(fulllength.SOURCES) < set(WINDOW_SOURCES)
    emb = np.ones((2, DIM), np.float16)
    shard = write_shard(tmp_path / "part-0001.npz", ["a", "b"], emb, [8, 5], ["youtube", "bandcamp"])
    assert shard.source.tolist() == ["youtube", "bandcamp"]
    for bad in ("soundcloud", "youtube:us", "YouTube"):
        with pytest.raises(StoreError, match="unknown source"):
            write_shard(tmp_path / "part-0002.npz", ["a"], emb[:1], [8], [bad])


def test_local_files_are_preferred_to_fetched_windows_in_the_mean():
    cache = OnePassCache(":memory:")
    for source, album_id, fill in (("youtube", "vid", 2.0), ("local", "", 1.0), ("deezer", "d", 3.0)):
        rec = {"key": "A", "source": source, "album_id": album_id, "track_id": "001@15.00", "track_idx": 0, "prio": 0}
        cache.put_clip(rec)
        cache.put_result(rec, "clap", "ok", None, np.full(512, fill, "<f4").tobytes(), 30.0)
        cache.set_listing("A", source, album_id, 1, 1, 100.0, 1 if source != "deezer" else None)
    keys, X, n, sources = cache.means("clap", 4)
    assert list(sources) == ["local"] and X[0, 0] == 1.0
    cache.forget("A", "local", "")
    assert list(cache.means("clap", 4)[3]) == ["youtube"]


# --- ffmpeg, for real --------------------------------------------------------------------------------

def test_a_real_file_is_probed_and_only_its_windows_are_decoded(world, tmp_path):
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        pytest.skip("ffmpeg is not on PATH")
    lines = []
    opts = Options(**world.opts, keys=("Album4",))
    embedder = Embedder({m: world.factory(m) for m in opts.models}, "own", None, lines.append)
    assert run(opts, world.fetcher, embedder, lines.append, NoStop(), sleep=world.slept.append) == 0
    assert world.rows() == {("Album4", "youtube"): ("full_album", "embedded", "5")}
    cache = world.cache()
    rows = cache.con.execute("SELECT clip_s, start_s, track_s FROM clips ORDER BY start_s").fetchall()
    assert len(rows) == 8 and all(abs(c - 30.0) < 0.05 and t == pytest.approx(1500.0) for c, _, t in rows)
    assert rows[0][1] >= 15 and rows[-1][1] + 30 <= 1500 - 15
    cache.close()
    assert clap_catalog().mono_of_wav and not opts.tmp.exists()
