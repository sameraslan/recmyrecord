"""Full-length audio (rmr_audio.fulllength) with a stub in place of yt-dlp and stub models: what a link is
taken for, which video a search takes, which albums are edge cases, that the file is always deleted, that a
run resumes, the window count, the source names. Nothing
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
from rmr_audio.album_status import edge_case
from rmr_audio.fulllength import (Blocked, Candidate, FetchError, Options, Unavailable, YtDlp, choose, classify, fetch_error,
                                  judge, queries, run)
from rmr_audio.onepass import Embedder
from rmr_audio.onepass_cache import MODELS, WINDOW_SOURCES, OnePassCache
from rmr_audio.onepass_worker import clap_catalog

from .test_onepass import FakeWorker, NoStop

RATE = 100
CATALOG = "rym_id,rank,artist,title,artist_latin,title_latin,rym_artist,rym_title,type,bandcamp_url,youtube_url\n"
ROW = {"artist": "Boris", "title": "Flood", "artist_latin": "", "title_latin": "", "rym_artist": "Boris", "rym_title": "Flood"}


def video(title="Boris - Flood (Full Album)", duration=4230, uploader="someone", **more) -> dict:
    return {"_type": "video", "id": "vid", "title": title, "duration": duration, "uploader": uploader, **more}


def found(id: str, title: str, duration, uploader: str = "someone", **more) -> dict:
    """One video as a search result lists it."""
    return {"id": id, "title": title, "duration": duration, "uploader": uploader, **more}


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

    def __init__(self, pages, lengths, results=None):
        self.pages, self.lengths, self.asked, self.downloaded, self.folders = pages, lengths, [], [], []
        self.results, self.searched = results or {}, []  # query -> the videos its search lists, or an exception

    def search(self, query, n):
        self.searched.append(query)
        got = self.results.get(query, [])
        if isinstance(got, Exception):
            raise got
        return {"_type": "playlist", "entries": [{"ie_key": "Youtube", **e} for e in got[:n]]}

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
    one new album with previews, one existing album with a listing, and four albums on 1 to 3 previews
    (Album8 to Album11: three edge cases and a short EP)."""

    class World:
        opts = dict(catalog=tmp_path / "albums.csv", keys_csv=tmp_path / "keys.csv", matches=tmp_path / "matches.csv",
                    csv=tmp_path / "audio" / "fulllength.csv", out=tmp_path / "cache" / "onepass.sqlite",
                    tmp=tmp_path / "cache" / "fulllength-tmp", pause=5.0, links=tmp_path / "audio" / "fulllength_links.csv")
        pages = {YT + "full": video("Artist0 - Title0 (full album)", 2400) | {"id": "full"},
                 YT + "short": video("Title1", 200, "Artist1 - Topic") | {"id": "short"},
                 YT + "gone": Unavailable("ERROR: Video unavailable"),
                 YT + "other": video("unboxing", 3000) | {"id": "other"},
                 YT + "mid": video("Artist4 - Title4", 1500) | {"id": "mid"},
                 YT + "gone6": Unavailable("ERROR: Private video"),
                 "https://a5.bandcamp.com/album/title5": {"_type": "playlist", "id": "5", "title": "Title5", "uploader": "Artist5",
                                                          "entries": [{"duration": 600.0}, {"duration": 1200.0}, {"duration": 3.0}]},
                 "https://a6.bandcamp.com/album/title6": {"_type": "playlist", "id": "6", "title": "Title6", "uploader": "Artist6",
                                                          "entries": [{"duration": 900.0}, {"duration": 900.0}]},
                 YT + "edge": video("Artist8 - Title8 (full album)", 2100) | {"id": "edge"},
                 YT + "track": video("Title11", 300, "Artist11 - Topic") | {"id": "track"},
                 YT + "found1": video("Artist1 - Title1 (Full Album)", 2400) | {"id": "found1"},
                 YT + "found9": video("Artist9 - Title9 [Full Album]", 1800) | {"id": "found9"}}
        lengths = {YT + "full": [2400.0], YT + "mid": [1500.0], "https://a5.bandcamp.com/album/title5": [600.0, 1200.0, 3.0],
                   "https://a6.bandcamp.com/album/title6": [900.0, 900.0], YT + "edge": [2100.0], YT + "found1": [2400.0],
                   YT + "found9": [1800.0]}
        results = {"Artist1 Title1 full album": [found("found1", "Artist1 - Title1 (Full Album)", 2400),
                                                 found("live1", "Artist1 - Title1 (Live in Paris)", 2500)],
                   "Artist3 Title3 full album": [found("rev3", "Title3 by Artist3: album review", 900)],
                   "Artist9 Title9 full album": [found("found9", "Artist9 - Title9 [Full Album]", 1800)]}
        slept: list = []
        windows: list = []
        log: list = []
        tmp_missing = tmp_path / "nowhere.sqlite"

        def __init__(self):
            self.fetcher = Fetcher(self.pages, self.lengths, self.results)
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

        def link(self, *rows, header="key,url,note"):
            """Write the file of hand-given links: (key, url) rows."""
            self.opts["links"].parent.mkdir(parents=True, exist_ok=True)
            self.opts["links"].write_text(header + "\n" + "".join(f"{k},{u},found by hand\n" for k, u in rows), encoding="utf-8")

    names = ["full", "short", "gone", "other", "mid"]
    lines = [f"Album{i},{i + 1},Artist{i},Title{i},,,Artist{i},Title{i},Album,,{YT}{n}" for i, n in enumerate(names)]
    lines += ["Album5,6,Artist5,Title5,,,Artist5,Title5,Album,https://a5.bandcamp.com/album/title5,",
              f"Album6,7,Artist6,Title6,,,Artist6,Title6,Album,https://a6.bandcamp.com/album/title6,{YT}gone6",
              f"Album7,8,Artist7,Title7,,,Artist7,Title7,Album,,{YT}has-previews",
              f"Old0,9,Old,Old,,,Old,Old,Album,,{YT}old",
              f"Album8,10,Artist8,Title8,,,Artist8,Title8,Album,,{YT}edge",
              "Album9,11,Artist9,Title9,,,Artist9,Title9,Album,,",
              "Album10,12,Artist10,Title10,,,Artist10,Title10,Album,,",
              f"Album11,13,Artist11,Title11,,,Artist11,Title11,Album,,{YT}track"]
    (tmp_path / "albums.csv").write_text(CATALOG + "\n".join(lines) + "\n", encoding="utf-8")
    (tmp_path / "keys.csv").write_text("rym_id,legacy_uri\nOld0,spotify:album:x\nAlbum9,spotify:album:y\n")
    (tmp_path / "matches.csv").write_text(
        "key,source,source_album_id,n_clips_available,runtime_s\n" + "".join(f"Album{i},,,,\n" for i in range(7))
        + "Album7,deezer,d7,9,\nOld0,deezer,d0,,\n"  # an existing album was matched before preview counts were recorded
        + "Album8,deezer,d8,1,2100\nAlbum9,deezer,d9,2,\nAlbum10,itunes:us,i10,3,400\nAlbum11,deezer,d11,2,1800\n")
    cache = OnePassCache(tmp_path / "cache" / "onepass.sqlite")
    for key, album_id, n in (("Album8", "d8", 1), ("Album9", "d9", 2), ("Album10", "i10", 3), ("Album11", "d11", 2)):
        for i in range(n):  # their store previews, embedded
            rec = {"key": key, "source": "deezer", "album_id": album_id, "track_id": f"t{i}", "track_idx": i, "prio": i}
            cache.put_clip(rec)
            for model in ("effnet", "clap"):
                cache.put_result(rec, model, "ok", None, np.full(MODELS[model].dim, 7, MODELS[model].dtype).tobytes(), 30.0)
    cache.close()
    return World()


def opts_models(world) -> tuple:
    return Options(**world.opts).models  # the models a run embeds unless told otherwise


def test_full_albums_are_embedded_in_windows_under_their_source_and_the_rest_is_recorded(world):
    lines = world.run()
    assert "7 albums without a preview: 6 with a YouTube link, 1 with Bandcamp only, 0 with neither" in lines[0]
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
    assert cache.counts() == {"effnet": Counter(ok=16 + 8), "clap": Counter(ok=16 + 8)}  # and the 8 previews of the fixture
    assert cache.listings()[("Album0", "youtube", "full")] == {"n_tracks": 1, "n_previews": 8, "runtime_s": 2400.0, "n_windows": 8}
    assert cache.listings()[("Album4", "youtube", "mid")]["n_windows"] == windows.n_windows(1500.0) == 5
    assert {r[0] for r in cache.con.execute("SELECT DISTINCT source FROM clips")} == {"youtube", "deezer"}  # not disguised as local
    for model in opts_models(world):
        keys, X, n, sources = cache.means(model, 4)
        tube = [i for i, s in enumerate(sources) if s == "youtube"]
        assert list(keys[tube]) == ["Album0", "Album4"] and list(n[tube]) == [8, 5]
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
    assert [s for s in cache.means("clap", 4)[3] if s != "deezer"] == ["youtube", "youtube", "bandcamp", "bandcamp"]
    cache.close()


def test_a_sample_is_spread_over_the_ranks_and_the_same_for_a_seed(world):
    albums = fulllength.no_audio_albums(world.opts["catalog"], world.opts["keys_csv"], world.opts["matches"])
    assert [a["key"] for a in albums] == [f"Album{i}" for i in range(7)]  # not the ones with previews, not the existing one with a listing
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
    rows = cache.con.execute("SELECT clip_s, start_s, track_s FROM clips WHERE source = 'youtube' ORDER BY start_s").fetchall()
    assert len(rows) == 8 and all(abs(c - 30.0) < 0.05 and t == pytest.approx(1500.0) for c, _, t in rows)
    assert rows[0][1] >= 15 and rows[-1][1] + 30 <= 1500 - 15
    cache.close()
    assert clap_catalog().mono_of_wav and not opts.tmp.exists()


# --- searching for the album -------------------------------------------------------------------------

def cand(id: str, title: str, duration, uploader: str = "someone", position: int = 0, **more) -> Candidate:
    return Candidate(id, title, uploader, duration, "q", position, **more)


SEASON = {"artist": "Fishmans", "title": "Long Season", "rym_artist": "Fishmans", "rym_title": "Long Season"}
REALISTIC = [  # what a search for the album lists: uploads of it, a live version, a clip, a cover, another album
    cand("up1", "Fishmans - Long Season (Full Album)", 2116, "ec", 0),
    cand("topic", "Long Season", 2117, "Fishmans - Topic", 1),
    cand("vinyl", "Fishmans - Long Season (Full Album, Vinyl Rip)", 2104, "Jen Rips Vinyl", 2),
    cand("live", "Long Season (Live At Akasaka Blitz / 1998)", 2492, "Fishmans - Topic", 3),
    cand("live2", "Fishmans - 98.12.28 男達の別れ - Long Season", 2623, "Atlas", 4),
    cand("clip", "Bill Burr on the 'Fishmans' and REALLY Long Albums", 224, "Bill Burr Clips", 5, verified=True),
    cand("cover", "Long Season - Fishmans (full band cover)", 2100, "a band", 6),
    cand("other", "Fishmans - Uchu Nippon Setagaya (Full Album)", 2900, "ec", 7),
    cand("react", "First reaction to Fishmans - Long Season", 2600, "reactor", 8),
]


def test_the_full_album_is_taken_from_a_realistic_result():
    choice = choose(REALISTIC, SEASON)
    assert choice.pick.cand.id == "up1" and choice.pick.score >= fulllength.SURE_SCORE and choice.refused is None
    why = {c.id: judge(c, SEASON).why for c in REALISTIC}
    assert "live" in why["live"] and "cover" in why["cover"] and "reaction" in why["react"]
    assert "does not have the album's title" in why["other"] and "does not have the album's title" in why["clip"]
    topic = judge(REALISTIC[1], SEASON)  # the Topic channel's video of that name: a candidate, not enough on its own
    assert topic.score is not None and topic.score < fulllength.PICK_SCORE
    # the album of another night is a recording of another length: the runner-up, well behind
    assert choice.runner_up is not None and choice.pick.score - choice.runner_up >= fulllength.AMBIGUOUS_MARGIN


@pytest.mark.parametrize("candidate, row, runtime, refused", [
    (cand("a", "Boris - Flood (Full Album)", 4230), ROW, None, None),
    (cand("a", "Flood", 4230, "Boris - Topic"), ROW, None, "under 65"),  # a Topic video is one track: not taken on its own
    (cand("a", "Boris - Flood", 4230), ROW, None, "under 65"),  # title, artist and a plausible length are not enough
    (cand("a", "Boris - Flood", 4230), ROW, 4200.0, None),  # with the listing's runtime they are
    (cand("a", "Boris - Flood", 4230, "Boris"), ROW, None, None),  # or on the artist's own channel
    (cand("a", "Flood", 1200, "Boris"), ROW, None, "not the length of an album"),  # 20 minutes, not said to be the album: a long track
    (cand("a", "Full Flood Album Boris", 4230), ROW, None, None),
    (cand("a", "Boris - Flood (2xLP) | Full Vinyl Rip", 4230), ROW, None, None),
    (cand("a", "david s. ware - godspelized [1998] álbum completo", 4008), {"artist": "David S. Ware Quartet", "title": "Godspelized"}, None, None),
    (cand("a", "David S. Ware Quartet - Godspelized", 948), {"artist": "David S. Ware Quartet", "title": "Godspelized"}, None,
     "not the length of an album"),  # the title track
    (cand("a", "Boris - Pink (Full Album)", 2800), ROW, None, "does not have the album's title"),  # another album of the artist
    (cand("a", "Flood (Full Album)", 4230, "someone else"), ROW, None, "artist"),
    (cand("a", "Boris - Flood I (full album)", 400), ROW, None, "not the length of an album"),  # one track
    (cand("a", "Boris - Flood [FULL ALBUM]", 700), ROW, None, None),  # says so: believed from eight minutes
    (cand("a", "Boris - Flood (Full Album)", 4230), ROW, 3000.0, "against a listing of 50 min"),  # 41% over the listing
    (cand("a", "Boris - Flood (Full Album)", 3400), ROW, 3000.0, None),  # 13% over
    (cand("a", "Boris - Flood (Full Album)", 2500), ROW, 3000.0, "against a listing"),  # 17% under
    (cand("a", "Boris - Flood (Full Album)", 7 * 3600), ROW, None, "not the length of an album"),
    (cand("a", "Boris - Flood (Full Album)", None), ROW, None, "no length"),
    (cand("a", "Boris - Flood (Full Album)", 4230, live=True), ROW, None, "no length"),
    (cand("a", "Boris - Flood live at Shibuya", 4230), ROW, None, "live"),
    (cand("a", "Boris - Flood (drum cover)", 4230), ROW, None, "cover"),
    (cand("a", "Boris - Flood | ALBUM REVIEW", 1200), ROW, None, "review"),
    (cand("a", "Boris - Flood (slowed + reverb)", 4800), ROW, None, "slowed"),
    (cand("a", "boris flood nightcore", 3000), ROW, None, "nightcore"),
    (cand("a", "Boris - Flood sped up full album", 3000), ROW, None, "sped up"),
    (cand("a", "Boris - Flood (8D audio)", 4230), ROW, None, "8D"),
    (cand("a", "Boris - Flood (Karaoke)", 4230), ROW, None, "karaoke"),
    (cand("a", "A Tribute to Boris - Flood", 4230), ROW, None, "tribute"),
    (cand("a", "Boris - Flood (remix)", 4230), ROW, None, "remix"),
    (cand("a", "Boris - Flood (Side A)", 1800), ROW, None, "one part"),
    # a word the album's own title has is not held against the video
    (cand("a", "The Birthday Party - Live 1981-82 (Full Album)", 3600), {"artist": "The Birthday Party", "title": "Live 1981-82"}, None, None),
    (cand("a", "Aphex Twin - 26 Mixes for Cash (remixes) full album", 9000), {"artist": "Aphex Twin", "title": "26 Mixes for Cash"}, None, "remix"),
    (cand("a", "Massive Attack v Mad Professor - The Remixes full album", 3000), {"artist": "Massive Attack", "title": "The Remixes"}, None, None),
    # self-titled: the artist's name alone does not say which album
    (cand("a", "Dystopia - Human = Garbage (Full Album)", 2400), {"artist": "Dystopia", "title": "Dystopia"}, None, "self-titled"),
    (cand("a", "Dystopia - Dystopia (Full Album)", 2400), {"artist": "Dystopia", "title": "Dystopia"}, None, None),
    (cand("a", "Dystopia - S/T (2008) full album", 2400), {"artist": "Dystopia", "title": "Dystopia"}, None, None),
    (cand("a", "Dystopia [Full Album]", 2400, "Dystopia"), {"artist": "Dystopia", "title": "Dystopia"}, None, None),
    # other scripts and the catalog's Latin names
    (cand("a", "ボアダムス - Vision Creation Newsun (full album)", 4000),
     {"artist": "ボアダムス [Boredoms]", "title": "ヴィジョン クリエイション ニューサン", "title_latin": "Vision Creation Newsun"}, None, None),
    (cand("a", "Boredoms ヴィジョンクリエイションニューサン フルアルバム", 4000),
     {"artist": "ボアダムス [Boredoms]", "title": "ヴィジョン クリエイション ニューサン", "title_latin": ""}, None, None),
    # various artists: the title alone, when it is more than a word
    (cand("a", "Odour Of Dust & Rot [Full Album]", 4209, "setdifference"), {"artist": "Various Artists", "title": "Odour of Dust & Rot"}, None, None),
    (cand("a", "Rock [Full Album]", 4209, "x"), {"artist": "Various Artists", "title": "Rock"}, None, "artist"),
])
def test_a_candidate_is_scored_or_refused_from_its_title_uploader_and_length(candidate, row, runtime, refused):
    j = judge(candidate, row, runtime)
    choice = choose([candidate], row, runtime)
    if refused is None:
        assert j.score is not None and choice.pick is not None, choice.why
    else:
        assert choice.pick is None and refused in choice.why, choice.why


def test_the_score_prefers_full_album_the_artists_channel_and_the_listings_length():
    plain, hinted = judge(cand("a", "Boris - Flood", 4230), ROW), judge(cand("a", "Boris - Flood (Full Album)", 4230), ROW)
    official = judge(cand("a", "Boris - Flood (Full Album)", 4230, "Boris"), ROW)
    assert plain.score < hinted.score < official.score
    near, far = (judge(cand("a", "Boris - Flood", d), ROW, 4200.0).score for d in (4210, 4700))
    assert near > far > plain.score - 1  # the listing's runtime only ever adds
    wordy = judge(cand("a", "Boris - Flood (1999) drone doom sludge stoner japan import", 4230), ROW)
    assert wordy.score < plain.score < fulllength.PICK_SCORE <= hinted.score
    assert judge(cand("a", "Boris - Flood", 4230, position=5), ROW).score < plain.score  # the search's own order, a little


def test_nothing_is_taken_when_two_recordings_match_equally_or_none_is_good_enough():
    two = [cand("a", "Boris - Flood (Full Album)", 4230, position=0), cand("b", "Boris - Flood (Full Album)", 2500, position=1)]
    choice = choose(two, ROW)
    assert choice.pick is None and "two recordings match equally" in choice.why and choice.refused.cand.id == "a"
    assert choice.runner_up is not None
    # with the listing's runtime only one of them can be the album
    assert choose(two, ROW, 4200.0).pick.cand.id == "a" and choose(two, ROW, 2450.0).pick.cand.id == "b"
    # three uploads of one length against one of another: that length is the album
    three = two + [cand("c", "Boris - Flood [full album]", 4228, position=2), cand("d", "Boris – Flood (full album) HQ", 4231, position=3)]
    choice = choose(three, ROW)
    assert choice.pick.cand.id == "a" and choice.pick.score - choice.runner_up >= fulllength.AMBIGUOUS_MARGIN
    # the same video listed by two queries is one candidate
    assert choose([two[0], cand("a", "Boris - Flood (Full Album)", 4230, position=4)], ROW).pick.cand.id == "a"
    weak = choose([cand("w", "Flood (1999) drone doom sludge stoner", 4230, "Borisfan88 boris archive", position=6)], ROW)
    assert weak.pick is None and "under 65" in weak.why and weak.refused.cand.id == "w"
    none = choose([cand("x", "Top 10 cat videos", 4000), cand("y", "Boris - Flood live", 4000)], ROW)
    assert none.pick is None and none.refused.cand.id == "y" and "live" in none.why  # the one that came closest
    assert choose([], ROW).why == "the search listed no video"


def test_the_queries_of_an_album():
    assert queries(ROW) == ["Boris Flood full album", "Boris Flood"]
    assert queries({"artist": "ボアダムス [Boredoms]", "title": "ヴィジョン", "artist_latin": "", "title_latin": "Vision Creation Newsun"}) == [
        "ボアダムス Boredoms ヴィジョン full album", "ボアダムス Boredoms Vision Creation Newsun full album", "ボアダムス Boredoms ヴィジョン"]


def test_a_search_asks_for_titles_only_without_cookies(monkeypatch, tmp_path):
    calls = []

    def fake_run(argv, **kw):
        calls.append(argv)
        return subprocess.CompletedProcess(argv, 0, b'{"entries": [{"id": "v", "title": "t", "duration": 9, "ie_key": "Youtube"}, null]}', b"")

    monkeypatch.setattr(fulllength.subprocess, "run", fake_run)
    got = fulllength.candidates(YtDlp(tmp_path / "python").search("Boris Flood full album", 10), "q")
    assert [(c.id, c.title, c.duration_s, c.query, c.position) for c in got] == [("v", "t", 9, "q", 0)]
    argv = calls[0]
    assert argv[-1] == "ytsearch10:Boris Flood full album" and "--flat-playlist" in argv and "--skip-download" in argv
    assert "--ignore-config" in argv and not any("cookie" in a or "username" in a or "password" in a or "netrc" in a for a in argv)
    monkeypatch.setattr(fulllength.subprocess, "run", lambda argv, **kw: subprocess.CompletedProcess(
        argv, 1, b"", "ERROR: Sign in to confirm you’re not a bot".encode()))
    with pytest.raises(Blocked):
        YtDlp(tmp_path / "python").search("q")


def full_rows(world):
    return fulllength.load_outcomes(world.opts["csv"])


def test_a_search_is_made_only_for_albums_without_a_usable_link_and_its_outcome_is_recorded(world):
    world.run(search=True)
    # Album1 (a single track), Album2 (gone), Album3 (another video), Album5 (no link), Album6 (gone): searched.
    # Album0 and Album4 were embedded from their links: not searched.
    assert [q.split()[0] for q in world.fetcher.searched if q.endswith("full album")] == [f"Artist{i}" for i in (1, 2, 3, 5, 6)]
    assert world.fetcher.searched.count("Artist1 Title1 full album") == 1 and "Artist1 Title1" not in world.fetcher.searched  # sure at once
    assert "Artist2 Title2" in world.fetcher.searched  # nothing found: the next form is tried too
    rows = full_rows(world)
    took = rows[("Album1", "search")]
    assert (took["status"], took["class"], took["n_windows"], took["source"], took["matched_by"], took["reason"]) == (
        "embedded", "full_album", "8", "youtube", "search", "no_audio")
    assert (took["url"], took["title"], took["uploader"], took["duration_s"], took["query"]) == (
        YT + "found1", "Artist1 - Title1 (Full Album)", "someone", "2400", "Artist1 Title1 full album")
    assert float(took["score"]) >= fulllength.SURE_SCORE and took["runner_up"] == ""  # the live version was refused, not a rival
    assert rows[("Album1", "youtube")]["status"] == "skipped" and rows[("Album1", "youtube")]["matched_by"] == "link"  # its link's row stays
    none = rows[("Album2", "search")]
    assert (none["status"], none["url"], none["note"]) == ("search_none", "", "the search listed no video")
    refused = rows[("Album3", "search")]  # the best refused candidate, and why
    assert (refused["status"], refused["url"], refused["title"]) == ("search_none", YT + "rev3", "Title3 by Artist3: album review")
    assert "review" in refused["note"] and refused["score"] == ""
    assert YT + "found1" in world.fetcher.downloaded and YT + "rev3" not in world.fetcher.asked
    cache = world.cache()
    assert cache.listings()[("Album1", "youtube", "found1")]["n_windows"] == 8
    cache.close()
    assert all(not f.exists() for f in world.fetcher.folders)

    searched = list(world.fetcher.searched)
    lines = world.run(search=True)  # a second run searches nothing again
    assert world.fetcher.searched == searched and "0 to do now" in lines[0]
    world.fetcher.results = {**world.results, "Artist2 Title2": [found("found2", "Artist2 - Title2 (Full Album)", 1500)]}
    world.fetcher.pages = {**world.pages, YT + "found2": video("Artist2 - Title2 (Full Album)", 1500) | {"id": "found2"}}
    world.fetcher.lengths = {**world.lengths, YT + "found2": [1500.0]}
    world.run(search=True, retry_search=True)  # unless it is told to
    assert full_rows(world)[("Album2", "search")]["status"] == "embedded" and full_rows(world)[("Album1", "search")]["status"] == "embedded"
    assert world.fetcher.downloaded.count(YT + "found1") == 1


def test_a_video_taken_by_a_search_that_could_not_be_fetched_is_fetched_again_without_a_second_search(world):
    world.fetcher.lengths = {**world.lengths, YT + "found1": FetchError("ERROR: unable to download video data: HTTP Error 403: Forbidden")}
    world.run(search=True, keys=("Album1",))
    row = full_rows(world)[("Album1", "search")]
    assert (row["status"], row["url"], row["note"]) == ("failed", YT + "found1", "ERROR: unable to download video data: HTTP Error 403: Forbidden")
    world.fetcher.lengths = world.lengths
    world.run(search=True, keys=("Album1",))
    assert world.fetcher.searched == ["Artist1 Title1 full album"]
    row = full_rows(world)[("Album1", "search")]
    assert (row["status"], row["query"], row["matched_by"]) == ("embedded", "Artist1 Title1 full album", "search")


def test_blocking_during_a_search_stops_the_run(world):
    world.fetcher.results = {**world.results, "Artist2 Title2 full album": Blocked("ERROR: HTTP Error 429: Too Many Requests")}
    lines = world.run(code=2, search=True)
    assert world.fetcher.searched[-1] == "Artist2 Title2 full album" and any("stopping" in line for line in lines)
    assert full_rows(world)[("Album2", "search")]["status"] == "blocked" and ("Album3", "search") not in full_rows(world)


def test_only_the_failed_rows_are_tried_with_retry_failed(world):
    world.fetcher.lengths = {**world.lengths, YT + "mid": FetchError("ERROR: unable to download video data: HTTP Error 403: Forbidden")}
    world.run()
    assert world.rows()[("Album4", "youtube")] == ("full_album", "failed", "")
    assert full_rows(world)[("Album4", "youtube")]["note"].endswith("403: Forbidden")  # what it was is in the file
    world.fetcher.lengths, asked = world.lengths, len(world.fetcher.asked)
    lines = world.run(retry_failed=True, search=True)
    assert world.fetcher.asked[asked:] == [YT + "mid"] and world.fetcher.searched == [] and "1 to do now" in lines[0]
    assert world.rows()[("Album4", "youtube")] == ("full_album", "embedded", "5")


def test_a_file_written_before_the_search_existed_is_read_and_written_with_the_new_columns(world):
    world.opts["csv"].parent.mkdir(parents=True)
    world.opts["csv"].write_text(",".join(fulllength.OLD_FIELDS) + "\nAlbum2,youtube," + YT + "gone,unavailable,,,,,skipped\n", encoding="utf-8")
    rows = full_rows(world)
    assert rows[("Album2", "youtube")]["matched_by"] == "link" and rows[("Album2", "youtube")]["reason"] == "no_audio"
    world.run(keys=("Album2", "Album3"))
    assert world.fetcher.asked == [YT + "other"]  # the old row is final
    assert world.opts["csv"].read_text(encoding="utf-8").splitlines()[0] == ",".join(fulllength.FIELDS)
    world.opts["csv"].write_text(",".join(fulllength.FIELDS) + "\nAlbum2,bandcamp,u,,,,,,skipped,search,no_audio,,,,\n", encoding="utf-8")
    with pytest.raises(ValueError, match="line 2"):
        full_rows(world)


# --- the albums under-covered by their previews ------------------------------------------------------

@pytest.mark.parametrize("previews, runtime, expected", [
    (1, 2100, True),  # Long Season: one track, one preview
    (3, 900, True), (2, None, True),  # runtime unknown: an album that was on the site before runtimes were recorded
    (3, 899, False), (2, 400, False),  # a single or a short EP: its previews cover it
    (4, 2400, False), (12, None, False), (0, 2400, False), (None, 2400, False),
])
def test_the_edge_case_rule(previews, runtime, expected):
    assert edge_case(previews, runtime) is expected


def test_the_edge_case_albums_are_the_under_covered_ones_without_full_length_windows(world):
    pick = lambda: [(a["key"], a["reason"], a["runtime_s"]) for a in fulllength.edge_case_albums(  # noqa: E731
        world.opts["catalog"], world.opts["matches"], world.opts["out"])]
    assert pick() == [("Album8", "edge_case", 2100.0), ("Album9", "edge_case", None), ("Album11", "edge_case", 1800.0)]
    lines = world.run(edge_cases=True, dry_run=True)
    assert "3 albums under-covered by their store previews" in lines[0] and "2 to do now ({'youtube': 2})" in lines[0]
    world.run(edge_cases=True, keys=("Album8",))
    assert [k for k, _, _ in pick()] == ["Album9", "Album11"]  # Album8 has its windows now
    assert [k for k, _, _ in [(a["key"], 0, 0) for a in fulllength.edge_case_albums(
        world.opts["catalog"], world.opts["matches"], world.tmp_missing)]] == ["Album8", "Album9", "Album11"]  # no cache: matches.csv alone


def test_full_length_windows_replace_the_previews_in_the_mean_and_a_failure_keeps_them(world):
    before = world.cache()
    was = {k: (n, s) for k, n, s in zip(*[x.tolist() for x in (before.means("clap", 4)[0], before.means("clap", 4)[2], before.means("clap", 4)[3])])}
    before.close()
    assert was == {"Album8": (1, "deezer"), "Album9": (2, "deezer"), "Album10": (3, "deezer"), "Album11": (2, "deezer")}
    world.run(edge_cases=True, search=True)
    rows = full_rows(world)
    assert {k: (r["status"], r["matched_by"], r["reason"], r["n_windows"]) for k, r in rows.items()} == {
        ("Album8", "youtube"): ("embedded", "link", "edge_case", "7"),  # its sheet link is the album: 35 minutes, 7 windows
        ("Album9", "search"): ("embedded", "search", "edge_case", "6"),  # no link: searched, runtime unknown
        ("Album11", "youtube"): ("skipped", "link", "edge_case", ""),  # a single track,
        ("Album11", "search"): ("search_none", "search", "edge_case", "")}  # and the search listed nothing
    assert "Artist10 Title10 full album" not in world.fetcher.searched  # the short EP is left alone
    cache = world.cache()
    for model in opts_models(world):
        keys, X, n, sources = cache.means(model, 4)
        assert {k: (c, s) for k, c, s in zip(keys.tolist(), n.tolist(), sources.tolist())} == {
            "Album8": (7, "youtube"), "Album9": (6, "youtube"), "Album10": (3, "deezer"), "Album11": (2, "deezer")}
        mean = dict(zip(keys.tolist(), X))
        assert not np.allclose(mean["Album8"], 7.0) and np.allclose(mean["Album11"], 7.0)  # its windows' mean; still its previews'
    # the store-preview clips stay in the cache
    assert cache.con.execute("SELECT COUNT(*) FROM embeddings WHERE source = 'deezer' AND status = 'ok' AND model = 'clap'").fetchone()[0] == 8
    cache.close()
    assert all(not f.exists() for f in world.fetcher.folders) and len(world.fetcher.folders) == 2  # nothing left on disk
    assert "0 to do now" in world.run(edge_cases=True, search=True)[0]


# --- links given by hand, and playlists --------------------------------------------------------------

LIST = "https://www.youtube.com/playlist?list="


def playlist(id: str, lengths, title="a fan's uploads", uploader="a fan") -> dict:
    """A YouTube playlist as yt-dlp lists it flat; a length of None is a video that cannot be fetched."""
    return {"_type": "playlist", "id": id, "title": title, "uploader": uploader,
            "entries": [{"id": f"v{i}", "title": f"track {i}" if d else "[Private video]", "duration": d} for i, d in enumerate(lengths)]}


@pytest.mark.parametrize("given, source, url", [
    (YT + "abc_-1", "youtube", YT + "abc_-1"),
    (YT + "abc&pp=ygUE&t=10s", "youtube", YT + "abc"),  # tracking and position are dropped
    ("https://youtu.be/abc?si=xyz", "youtube", YT + "abc"),
    (YT + "abc&list=PLx-1&index=3&pp=iAQB", "youtube", LIST + "PLx-1"),  # a video of a playlist: the playlist
    ("https://music.youtube.com/playlist?list=OLAK5uy_k&si=x", "youtube", LIST + "OLAK5uy_k"),
    (YT + "abc&list=RDabc", "youtube", YT + "abc"),  # a mix YouTube makes up is not an album
    ("https://boris.bandcamp.com/album/flood?from=search", "bandcamp", "https://boris.bandcamp.com/album/flood"),
])
def test_a_hand_given_link_is_brought_to_one_form(given, source, url):
    assert fulllength.hand_link(given) == (source, url)
    assert fulllength.hand_link(url) == (source, url)


@pytest.mark.parametrize("rows, header, error", [
    ([("Nobody", YT + "a")], "key,url,note", "line 2: Nobody is not a key of the catalog"),
    ([("Album1", YT + "a"), ("Album1", YT + "b")], "key,url,note", "line 3: Album1 has a link already"),
    ([("Album1", "https://soundcloud.com/a/b")], "key,url,note", "line 2: .*neither a YouTube video or playlist nor a Bandcamp page"),
    ([("Album1", "https://www.youtube.com/@channel")], "key,url,note", "line 2: .*neither"),
    ([("Album1", YT + "a")], "key,link", "the header must be key,url,note"),
])
def test_the_links_file_is_checked_when_it_is_read(world, capsys, rows, header, error):
    world.link(*rows, header=header)
    with pytest.raises(ValueError, match=error):
        fulllength.load_links(world.opts["links"], {f"Album{i}" for i in range(12)})
    world.run(code=1)
    assert "fulllength_links.csv" in capsys.readouterr().err and world.fetcher.asked == [] and not world.opts["csv"].exists()


def test_no_links_file_is_no_links(world):
    assert fulllength.load_links(world.opts["links"], set()) == {}


def test_a_hand_given_link_comes_first_is_not_judged_and_is_recorded_as_manual(world):
    world.run(search=True, keys=("Album3",))  # its sheet link is another video, and the search takes nothing
    assert world.rows() == {("Album3", "youtube"): ("mismatch", "skipped", ""), ("Album3", "search"): ("", "search_none", "")}
    world.fetcher.pages = {**world.pages, YT + "hand3": video("an upload with a name of its own", 1500, "a fan") | {"id": "hand3"}}
    world.fetcher.lengths = {**world.lengths, YT + "hand3": [1500.0]}
    world.link(("Album3", YT + "hand3&pp=ygUE"))
    asked, searched = len(world.fetcher.asked), list(world.fetcher.searched)
    lines = world.run(search=True, keys=("Album3",))
    assert world.fetcher.asked[asked:] == [YT + "hand3"] and world.fetcher.searched == searched  # final rows do not stand in its way
    assert "1 to do now ({'manual': 1})" in lines[0] and "1 hand-given link" in lines[0]
    row = full_rows(world)[("Album3", "manual")]
    assert (row["source"], row["url"], row["class"], row["status"], row["matched_by"], row["reason"], row["n_windows"]) == (
        "youtube", YT + "hand3", "full_album", "embedded", "manual", "no_audio", "5")
    assert (row["title"], row["uploader"], row["duration_s"]) == ("an upload with a name of its own", "a fan", "1500")
    assert "hand-given" in row["note"] and "neither title nor artist" in row["note"]  # what was seen is still written down
    assert full_rows(world)[("Album3", "youtube")]["status"] == "skipped"  # the other rows stay
    cache = world.cache()
    assert cache.listings()[("Album3", "youtube", "hand3")]["n_windows"] == 5
    cache.close()
    assert "0 to do now" in world.run(search=True, keys=("Album3",))[0]

    world.link(("Album0", YT + "hand3"))  # before the sheet's link, which is not fetched while the hand-given one is open
    world.fetcher.asked[:] = []
    world.run(keys=("Album0",))
    assert world.fetcher.asked == [YT + "hand3"] and set(world.rows()) >= {("Album0", "manual")} and ("Album0", "youtube") not in world.rows()

    world.link(("Album3", YT + "mid"))  # the link was changed: it is fetched, and the windows of the old one go
    world.run(links_only=True)
    assert world.fetcher.asked[-1] == YT + "mid" and full_rows(world)[("Album3", "manual")]["url"] == YT + "mid"
    cache = world.cache()
    assert cache.con.execute("SELECT DISTINCT album_id FROM embeddings WHERE key = 'Album3' AND source = 'youtube'").fetchall() == [("mid",)]
    cache.close()


def test_a_hand_given_link_that_is_gone_fails_cleanly_and_the_albums_own_link_is_tried_next(world):
    world.link(("Album4", YT + "gone"), ("Album1", YT + "live"))
    world.fetcher.pages = {**world.pages, YT + "live": video(live_status="is_live") | {"id": "live"}}
    world.run(keys=("Album4", "Album1"))
    assert world.fetcher.asked == [YT + "live", YT + "gone"] and world.fetcher.downloaded == []
    assert world.rows() == {("Album4", "manual"): ("unavailable", "skipped", ""), ("Album1", "manual"): ("unavailable", "skipped", "")}
    world.run(keys=("Album4",))
    assert world.fetcher.asked[2:] == [YT + "mid"] and world.rows()[("Album4", "youtube")] == ("full_album", "embedded", "5")
    world.fetcher.asked[:] = []
    world.link(("Album1", YT + "found1"))  # another link for the album: tried, whatever the row of the old one says
    world.run(keys=("Album1",))
    assert world.fetcher.asked == [YT + "found1"] and world.rows()[("Album1", "manual")] == ("full_album", "embedded", "8")


def test_a_playlist_is_taken_only_from_a_hand_given_link(world):
    page = playlist("PLhand", [600.0, 900.0])
    assert classify(page, ROW, "youtube", LIST + "PLhand").cls == "mismatch"  # a sheet link or a search: refused, as before
    v = classify(page, ROW, "youtube", LIST + "PLhand", trusted=True)
    assert (v.cls, v.duration_s, v.album_id, v.title, v.uploader) == ("full_album", 1500.0, "PLhand", "a fan's uploads", "a fan")
    many = playlist("PLmany", [60.0] * (fulllength.MAX_PLAYLIST_VIDEOS + 1))
    assert classify(many, ROW, "youtube", LIST + "PLmany", trusted=True).cls == "mismatch"
    assert classify(playlist("PLlong", [3600.0] * 7), ROW, "youtube", LIST + "PLlong", trusted=True).cls == "mismatch"  # over six hours
    assert classify(playlist("PLnone", [None, None]), ROW, "youtube", LIST + "PLnone", trusted=True).cls == "unavailable"
    assert classify(video(duration=7 * 3600), ROW, "youtube", YT + "vid", trusted=True).cls == "mismatch"
    assert classify(video("Flood I", 410), ROW, "youtube", YT + "vid", trusted=True).cls == "full_album"  # its length is not judged

    # the sheet's link to a playlist is still refused by a run
    world.fetcher.pages = {**world.pages, YT + "full": page}
    world.run(keys=("Album0",))
    assert world.rows() == {("Album0", "youtube"): ("mismatch", "skipped", "")} and world.fetcher.downloaded == []


def test_the_videos_of_a_hand_given_playlist_are_embedded_in_order_with_windows_across_the_files(world):
    lengths = [20.0, 25.0, 100.0]  # short videos, one per track
    world.fetcher.pages = {**world.pages, LIST + "PLhand": playlist("PLhand", [20.0, 25.0, None, 100.0])}  # one cannot be fetched
    world.fetcher.lengths = {**world.lengths, LIST + "PLhand": lengths}
    world.link(("Album2", YT + "v0&list=PLhand&index=1&pp=iAQB"))
    world.run(keys=("Album2",))
    assert world.fetcher.asked == [LIST + "PLhand"] and world.fetcher.downloaded == [LIST + "PLhand"]
    row = full_rows(world)[("Album2", "manual")]
    assert (row["url"], row["class"], row["status"], row["matched_by"], row["duration_s"], row["n_windows"]) == (
        LIST + "PLhand", "full_album", "embedded", "manual", "145", "4")
    assert "a playlist of 3 videos" in row["note"] and "1 that cannot be fetched left out" in row["note"] and "3 file(s)" in row["note"]
    planned = windows.plan(lengths)
    assert [(name, start) for name, start, _ in world.windows] == [(f"{w.file + 1:03d}.wav", round(w.start_s, 2)) for w in planned]
    assert Counter(name for name, _, _ in world.windows) == {"001.wav": 1, "002.wav": 1, "003.wav": 2}
    assert ("001.wav", 0.0, 20.0) in world.windows  # a video under 30 seconds is one window, whole
    cache = world.cache()
    assert cache.listings()[("Album2", "youtube", "PLhand")] == {"n_tracks": 3, "n_previews": 4, "runtime_s": 145.0, "n_windows": 4}
    assert dict(zip(*[x.tolist() for x in (cache.means("clap", 4)[0], cache.means("clap", 4)[3])]))["Album2"] == "youtube"
    cache.close()
    assert all(not f.exists() for f in world.fetcher.folders)  # the files are deleted


def test_the_files_of_a_playlist_are_deleted_when_its_download_breaks(world):
    world.fetcher.pages = {**world.pages, LIST + "PLhand": playlist("PLhand", [600.0, 900.0])}
    world.fetcher.lengths = {**world.lengths, LIST + "PLhand": Blocked("ERROR: [youtube] v1: Sign in to confirm you’re not a bot")}
    world.link(("Album2", LIST + "PLhand"))
    lines = world.run(code=2, keys=("Album2",))
    assert world.rows() == {("Album2", "manual"): ("full_album", "blocked", "")} and any("stopping" in line for line in lines)
    assert world.fetcher.folders and not world.fetcher.folders[0].exists()


def test_links_only_takes_the_albums_of_the_file_and_its_dry_run_asks_for_their_metadata_alone(world):
    world.fetcher.pages = {**world.pages, LIST + "PLhand": playlist("PLhand", [600.0, 900.0, None]),
                           YT + "hand3": Unavailable("ERROR: Private video")}
    world.link(("Album2", LIST + "PLhand"), ("Album3", YT + "hand3"), ("Album7", YT + "full"))  # Album7 has previews
    lines = world.run(links_only=True, dry_run=True, search=True, bandcamp=True)
    assert "2 to do now ({'manual': 2})" in lines[0] and "3 hand-given links" in lines[0] and "Album7" in lines[0]
    assert world.fetcher.asked == [LIST + "PLhand", YT + "hand3"] and world.fetcher.downloaded == [] and world.fetcher.searched == []
    assert not world.opts["csv"].exists() and len(world.slept) == 1
    would = [line for line in lines if line.startswith("would fetch")]
    assert len(would) == 2 and all(k in w for k, w in zip(("Album2", "Album3"), would))
    assert "full_album" in would[0] and "25 min" in would[0] and "a playlist of 2 videos" in would[0] and "MB" in would[0]
    assert "unavailable" in would[1] and "Private video" in would[1]
    assert lines[-1] == "dry run: nothing downloaded or written"

    world.fetcher.asked[:] = []
    assert any(line.startswith("would fetch\tAlbum2") for line in world.run(keys=("Album2",), dry_run=True))
    assert world.fetcher.asked == []  # a dry run of any other kind asks nothing

    world.fetcher.pages = {**world.fetcher.pages, LIST + "PLhand": Blocked("ERROR: HTTP Error 429: Too Many Requests")}
    lines = world.run(code=2, links_only=True, dry_run=True)
    assert world.fetcher.asked == [LIST + "PLhand"] and any("stopping" in line for line in lines)  # nothing after a sign of blocking

    world.fetcher.pages = {**world.pages, YT + "hand3": video("x", 1500) | {"id": "hand3"}}
    world.fetcher.lengths = {**world.lengths, YT + "hand3": [1500.0]}
    world.link(("Album3", YT + "hand3"))
    world.fetcher.asked[:] = []
    world.run(links_only=True, search=True, bandcamp=True)
    assert world.fetcher.asked == [YT + "hand3"] and world.fetcher.searched == [] and set(world.rows()) == {("Album3", "manual")}


def test_yt_dlp_downloads_a_playlist_video_by_video_and_passes_over_the_ones_that_are_gone(monkeypatch, tmp_path):
    calls, answer = [], {}

    def fake_run(argv, **kw):
        calls.append(argv)
        if "-J" in argv:
            return subprocess.CompletedProcess(argv, 0, b'{"_type": "playlist", "id": "PLx", "entries": []}', b"")
        for name in answer.get("files", ("002-b.webm", "001-a.webm")):
            (tmp_path / name).write_bytes(b"x")
        return subprocess.CompletedProcess(argv, answer.get("code", 1), b"", answer.get("stderr", b"ERROR: [youtube] c: Private video. Sign in if "
                                                                                               b"you've been granted access to this video"))

    monkeypatch.setattr(fulllength.subprocess, "run", fake_run)
    yt = YtDlp(tmp_path / "python")
    assert yt.info(LIST + "PLx", "youtube")["id"] == "PLx"
    assert [p.name for p in yt.download(LIST + "PLx", "youtube", tmp_path)] == ["001-a.webm", "002-b.webm"]  # in playlist order
    info, download = calls
    for argv in calls:
        assert argv[:5] == [str(tmp_path / "python"), "-m", "yt_dlp", "--ignore-config", "--no-cache-dir"]
        assert "--yes-playlist" in argv and "--no-playlist" not in argv and not any("cookie" in a or "netrc" in a for a in argv)
    assert "--flat-playlist" in info and "--skip-download" in info  # one request: the videos are listed, not opened
    assert "--flat-playlist" not in download and download[download.index("-f") + 1] == "bestaudio[abr<=160]/bestaudio"
    assert download[download.index("--max-filesize") + 1] == "600M" and download[download.index("--retries") + 1] == "2"
    assert download[download.index("-o") + 1].endswith("%(playlist_index)03d-%(id)s.%(ext)s")
    assert download[download.index("--playlist-end") + 1] == str(fulllength.MAX_PLAYLIST_VIDEOS)
    for stderr, kind in ((b"ERROR: [youtube] c: Private video\nERROR: [youtube] d: Sign in to confirm you\xe2\x80\x99re not a bot", Blocked),
                         (b"ERROR: [youtube] c: Private video\nERROR: unable to download video data: HTTP Error 403: Forbidden", FetchError)):
        answer["stderr"] = stderr
        with pytest.raises(kind) as e:
            yt.download(LIST + "PLx", "youtube", tmp_path)
        assert type(e.value) is kind  # a block, or a video that may come another day: the album is not embedded in part
    answer.update(files=(), stderr=b"ERROR: [youtube] c: Private video")
    for f in tmp_path.iterdir():
        f.unlink()
    with pytest.raises(Unavailable):
        yt.download(LIST + "PLx", "youtube", tmp_path)
    yt.info(YT + "vid&list=PLx", "youtube")  # a link that was not brought to the playlist is its one video, as before
    assert "--no-playlist" in calls[-1] and "--flat-playlist" not in calls[-1]
