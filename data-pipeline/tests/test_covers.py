"""Cover sources of the new albums (rmr_pipeline.covers). No test here uses the network: the fetch function is faked."""
import io
import json

import pytest
from PIL import Image

from rmr_pipeline import covers as cv

SP_ID = "40pYNrOZaH6Ozmex2nLniD"
SP_THUMB = "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e022ec61579b320d2f6cb79f39d"
SP_REF = "ab67616d0000b2732ec61579b320d2f6cb79f39d"
MD5 = "c1b61fcf10908d75b1cc10512a3379c4"
AM_PATH = "Music118/v4/d4/10/5d/d4105dcd-73d6-d4cd-4168-ab63f8255340/00600753264645.rgb.jpg"
AM_ART = f"https://is3-ssl.mzstatic.com/image/thumb/{AM_PATH}/100x100bb.jpg"
BC_PAGE = b'<html><head><meta property="og:image" content="https://f4.bcbits.com/img/a0123456789_5.jpg"></head></html>'
YT = "https://www.youtube.com/watch?v=AfChn_NjI9w"
APPLE_BODY = {"results": [{"wrapperType": "collection", "artworkUrl100": AM_ART}, {"wrapperType": "track"}]}


def album(rym_id, **links):
    row = {"rym_id": rym_id, "legacy_uri": "", "spotify_url": "", "apple_music_url": "", "deezer_url": "",
           "bandcamp_url": "", "youtube_url": ""}
    return {**row, **links}


def oembed(url=SP_THUMB):
    return json.dumps({"thumbnail_url": url}).encode()


class Net:
    """A fake fetch function: answers from `pages` (url -> body, status or (status, body)), 404 otherwise."""

    def __init__(self, pages=None, default=404):
        self.pages, self.default, self.asked = pages or {}, default, []

    def __call__(self, url, max_bytes):
        self.asked.append(url)
        got = self.pages.get(url, self.default)
        if callable(got):
            got = got(url)
        if isinstance(got, int):
            return got, b""
        return got if isinstance(got, tuple) else (200, got)


class Clock:
    def __init__(self):
        self.t, self.slept = 0.0, []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


def fetcher(net, intervals=None, overall=0.0, clock=None, **kw):
    clock = clock or Clock()
    return cv.Fetcher(intervals or {}, overall, fetch=net, sleep=clock.sleep, clock=clock.now, **kw)


def run(tmp_path, albums, net=None, cache=None, tiers=cv.TIERS, **kw):
    inputs = cv.Inputs(albums, kw.pop("matches", {}), kw.pop("overrides", {}), kw.pop("fulllength", {}), cache or {})
    net = net if net is not None else Net()
    code = cv.run_refs(inputs, tmp_path / "covers.csv", tmp_path / "state.json", tmp_path / "96", fetcher(net), tiers,
                       out=lambda *a: None, **kw)
    return code, cv.read_covers(tmp_path / "covers.csv"), net


# --- refs of each source -------------------------------------------------------------------------

def test_spotify_ref_is_in_the_site_form():
    assert cv.spotify_album_id(f"https://open.spotify.com/album/{SP_ID}?si=x") == SP_ID
    assert cv.spotify_ref(SP_THUMB) == SP_REF
    assert cv.spotify_ref("https://i.scdn.co/image/" + SP_REF) == SP_REF
    assert cv.spotify_ref("https://example.com/image/" + SP_REF) == ""
    assert cv.oembed_url(SP_ID) == f"https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Falbum%2F{SP_ID}"


def test_deezer_and_apple_refs():
    assert cv.listing_ref("deezer", {"id": 1, "md5_image": MD5}) == ("deezer", MD5)
    assert cv.listing_ref("deezer", {"id": 1, "md5_image": ""}) is None
    assert cv.listing_ref("deezer", {"error": {"code": 800}}) is None
    assert cv.listing_ref("deezer", {"data": [{"id": 5, "md5_image": MD5}, {"id": 6, "md5_image": MD5}]}) == ("deezer", MD5)
    assert cv.listing_ref("deezer", {"data": []}) is None
    assert cv.apple_ref(AM_ART) == AM_PATH
    assert cv.apple_ref("https://example.com/image/thumb/x/100x100bb.jpg") == ""
    assert cv.listing_ref("itunes:se", APPLE_BODY) == ("apple", AM_PATH)
    assert cv.listing_ref("itunes:se", {"results": [{"wrapperType": "track", "artworkUrl100": AM_ART}]}) is None


def test_bandcamp_ref():
    assert cv.bandcamp_ref(BC_PAGE.decode()) == "0123456789"
    swapped = '<meta content="https://f4.bcbits.com/img/a42_16.jpg" property="og:image">'
    assert cv.bandcamp_ref(swapped) == "42"
    assert cv.bandcamp_ref('<meta property="og:image" content="https://f4.bcbits.com/img/0012345_5.jpg">') == ""  # the band's photo
    assert cv.bandcamp_ref("<html></html>") == ""


def test_youtube_ref():
    assert cv.youtube_ref(YT) == "AfChn_NjI9w"
    assert cv.youtube_ref("https://www.youtube.com/watch?list=PL1&v=AfChn_NjI9w&t=3") == "AfChn_NjI9w"
    assert cv.youtube_ref("https://youtu.be/AfChn_NjI9w") == "AfChn_NjI9w"
    assert cv.youtube_ref("https://www.youtube.com/playlist?list=PLDDC74011619A10AE") == ""


def test_c_field_and_cover_url_forms():
    assert cv.c_field("spotify", SP_REF) == SP_REF
    assert cv.c_field("deezer", MD5) == "dz:" + MD5
    assert cv.c_field("apple", AM_PATH) == "am:" + AM_PATH
    assert cv.c_field("bandcamp", "0123456789") == "bc:0123456789"
    assert cv.c_field("youtube", "AfChn_NjI9w") == "yt:AfChn_NjI9w"
    assert cv.cover_url(SP_REF, 640) == "https://i.scdn.co/image/" + SP_REF
    assert cv.cover_url(SP_REF, 300) == "https://i.scdn.co/image/ab67616d00001e02" + SP_REF[16:]
    assert cv.cover_url(SP_REF, 64) == "https://i.scdn.co/image/ab67616d00004851" + SP_REF[16:]
    assert cv.cover_url("8a403ef64b2939cd" + "0" * 24, 300) == "https://i.scdn.co/image/8a403ef64b2939cd" + "0" * 24
    assert cv.cover_url("dz:" + MD5, 200) == f"https://cdn-images.dzcdn.net/images/cover/{MD5}/250x250-000000-80-0-0.jpg"
    assert cv.cover_url("dz:" + MD5, 600) == f"https://cdn-images.dzcdn.net/images/cover/{MD5}/1000x1000-000000-80-0-0.jpg"
    assert cv.cover_url("am:" + AM_PATH, 200) == f"https://is1-ssl.mzstatic.com/image/thumb/{AM_PATH}/200x200bb.jpg"
    assert cv.cover_url("bc:0123456789", 300) == "https://f4.bcbits.com/img/a0123456789_2.jpg"
    assert cv.cover_url("bc:0123456789", 640) == "https://f4.bcbits.com/img/a0123456789_16.jpg"
    assert cv.cover_url("yt:AfChn_NjI9w", 300) == "https://i.ytimg.com/vi/AfChn_NjI9w/hqdefault.jpg"
    assert cv.cover_url("", 300) == ""
    for source, ref in [("spotify", SP_REF), ("deezer", MD5), ("apple", AM_PATH), ("bandcamp", "1"), ("youtube", "AfChn_NjI9w")]:
        assert cv.allowed(cv.sprite_url(source, ref))


# --- the host allow-list -------------------------------------------------------------------------

@pytest.mark.parametrize("url", [
    "https://open.spotify.com/oembed?url=x", "https://i.scdn.co/image/x", "https://image-cdn-ak.spotifycdn.com/image/x",
    "https://image-cdn-fa.spotifycdn.com/image/x", "https://api.deezer.com/album/1", "https://cdn-images.dzcdn.net/x",
    "https://e-cdns-images.dzcdn.net/x", "https://itunes.apple.com/lookup?id=1", "https://is1-ssl.mzstatic.com/x",
    "https://nirvana.bandcamp.com/album/bleach", "https://f4.bcbits.com/img/a1_2.jpg", "https://i.ytimg.com/vi/x/hqdefault.jpg",
])
def test_allowed_hosts(url):
    assert cv.allowed(url)


@pytest.mark.parametrize("url", [
    "https://rateyourmusic.com/release/album/radiohead/ok-computer/", "https://www.rateyourmusic.com/x",
    "http://i.scdn.co/image/x", "https://evilbandcamp.com/album/x", "https://bandcamp.com.evil.net/album/x",
    "https://i.scdn.co.evil.net/image/x", "https://music.sufjan.com/album/x", "https://www.youtube.com/watch?v=x",
    "https://i.scdn.co@rateyourmusic.com/x", "ftp://f4.bcbits.com/x", "",
])
def test_other_hosts_are_refused_before_any_request(url):
    assert not cv.allowed(url)
    net = Net()
    with pytest.raises(cv.HostNotAllowed):
        fetcher(net).get(url)
    assert net.asked == []


# --- the client: spacing and the stop rule -------------------------------------------------------

def test_requests_are_spaced_per_host_and_overall():
    clock, net = Clock(), Net(default=(200, b"x"))
    f = fetcher(net, {"open.spotify.com": 1.0, "bandcamp": 3.0}, overall=0.5, clock=clock)
    starts = []
    for url in ["https://open.spotify.com/a", "https://open.spotify.com/b", "https://a.bandcamp.com/album/x",
                "https://b.bandcamp.com/album/y", "https://i.scdn.co/image/x"]:
        f.get(url)
        starts.append(clock.t)
    assert starts == [0.0, 1.0, 1.5, 4.5, 5.0]


def test_two_refusals_in_a_row_from_a_host_stop_the_run():
    net = Net(default=429)
    f = fetcher(net)
    with pytest.raises(cv.RateLimited):
        f.get("https://open.spotify.com/a")
    with pytest.raises(cv.StopRun, match="open.spotify.com"):
        f.get("https://open.spotify.com/b")
    assert len(net.asked) == 2


def test_five_refusals_in_a_run_stop_it():
    answers = iter([403, 200, 429, 200, 403, 200, 429, 200, 403])
    f = fetcher(Net(default=lambda url: (next(answers), b"ok")))
    seen = []
    for i in range(9):
        try:
            f.get(f"https://open.spotify.com/{i}")
            seen.append("ok")
        except cv.StopRun:
            seen.append("stop")
        except cv.RateLimited:
            seen.append("limited")
    assert seen == ["limited", "ok"] * 4 + ["stop"]


def test_a_refusal_is_followed_by_a_pause_and_a_missing_page_is_not_a_refusal():
    clock = Clock()
    f = fetcher(Net({"https://open.spotify.com/a": 429, "https://open.spotify.com/c": (200, b"c")}), clock=clock, backoff=30.0)
    with pytest.raises(cv.RateLimited):
        f.get("https://open.spotify.com/a")
    with pytest.raises(cv.Gone, match="404"):
        f.get("https://open.spotify.com/b")
    assert clock.t == 30.0
    assert f.get("https://open.spotify.com/c") == b"c"  # the 404 between the two ended the row of refusals


def test_failures_in_a_row_without_an_answer_stop_the_run():
    def down(url):
        raise OSError("network unreachable")
    f = fetcher(Net(default=down))
    for i in range(cv.DOWN_AFTER - 1):
        with pytest.raises(cv.Transient):
            f.get(f"https://i.scdn.co/image/{i}")
    with pytest.raises(cv.StopRun):
        f.get("https://i.scdn.co/image/last")


# --- refs: priority, resuming, stopping, writing --------------------------------------------------

def everything(rym_id="Album1"):
    return album(rym_id, spotify_url=f"https://open.spotify.com/album/{SP_ID}", deezer_url="https://www.deezer.com/album/7",
                 apple_music_url="https://music.apple.com/se/album/x/9", bandcamp_url="https://a.bandcamp.com/album/x",
                 youtube_url=YT)


CACHE = {cv.deezer_url("7"): {"id": 7, "md5_image": MD5}, cv.apple_cached_url("9", "se"): APPLE_BODY}


def test_priority_spotify_first(tmp_path):
    code, covers, net = run(tmp_path, [everything()], Net({cv.oembed_url(SP_ID): oembed()}), CACHE)
    assert code == 0 and covers == {"Album1": ("spotify", SP_REF)}
    assert net.asked == [cv.oembed_url(SP_ID)]


def test_priority_falls_through_the_sources(tmp_path):
    albums = [
        everything("A"),  # Spotify answers 404: the cached Deezer listing
        album("B", apple_music_url="https://music.apple.com/se/album/x/9", bandcamp_url="https://a.bandcamp.com/album/x"),
        album("C", bandcamp_url="https://a.bandcamp.com/album/x", youtube_url=YT),
        album("D", youtube_url=YT),
        album("E"),  # only the link the audio stage embedded
        album("F"),  # nothing
        album("G", deezer_url="https://www.deezer.com/album/8", youtube_url=YT),  # not in the cache: asked from the store
    ]
    net = Net({"https://a.bandcamp.com/album/x": BC_PAGE, cv.deezer_url("8"): json.dumps({"id": 8, "md5_image": "ab" * 16}).encode()})
    code, covers, net = run(tmp_path, albums, net, CACHE, fulllength={"E": "https://www.youtube.com/watch?v=EqU6sJWrMlQ"})
    assert code == 0
    assert covers == {"A": ("deezer", MD5), "B": ("apple", AM_PATH), "C": ("bandcamp", "0123456789"),
                      "D": ("youtube", "AfChn_NjI9w"), "E": ("youtube", "EqU6sJWrMlQ"), "G": ("deezer", "ab" * 16)}
    assert list(covers) == ["A", "B", "C", "D", "E", "G"]  # catalog order, whatever order the tiers found them in
    assert net.asked == [cv.oembed_url(SP_ID), cv.deezer_url("8"), "https://a.bandcamp.com/album/x"]
    state = json.loads((tmp_path / "state.json").read_text())
    assert "404" in state["refs"]["A"]["spotify"]


def test_the_forced_listing_comes_before_the_match_and_the_match_before_the_link(tmp_path):
    cache = {cv.deezer_url("1"): {"id": 1, "md5_image": "11" * 16}, cv.deezer_url("2"): {"id": 2, "md5_image": "22" * 16},
             cv.deezer_url("3"): {"id": 3, "md5_image": "33" * 16}, cv.apple_cached_url("9", "jp"): APPLE_BODY}
    cache[cv.deezer_tracks_url("4")] = {"data": [{"id": 40, "md5_image": "44" * 16}]}  # a listing found by search
    albums = [album(k, deezer_url="https://www.deezer.com/album/3") for k in "ABC"] + [album("D"), album("E")]
    _, covers, net = run(tmp_path, albums, cache=cache, overrides={"A": ("deezer", "1")},
                         matches={"A": ("deezer", "2"), "B": ("deezer", "2"), "D": ("itunes:jp", "9"), "E": ("deezer", "4")})
    assert covers == {"A": ("deezer", "11" * 16), "B": ("deezer", "22" * 16), "C": ("deezer", "33" * 16), "D": ("apple", AM_PATH),
                      "E": ("deezer", "44" * 16)}
    assert net.asked == []


def test_the_cache_tier_alone_uses_no_network_and_spotify_later_replaces_its_row(tmp_path):
    albums = [everything()]
    code, covers, net = run(tmp_path, albums, cache=CACHE, tiers=("cache",))
    assert covers == {"Album1": ("deezer", MD5)} and net.asked == []
    (tmp_path / "96").mkdir()
    (tmp_path / "96" / "Album1.jpg").write_bytes(b"made from the Deezer cover")
    _, covers, net = run(tmp_path, albums, Net({cv.oembed_url(SP_ID): oembed()}), CACHE, tiers=("bandcamp", "youtube"))
    assert covers == {"Album1": ("deezer", MD5)} and net.asked == []  # Bandcamp is not asked while Spotify may still answer
    _, covers, net = run(tmp_path, albums, Net({cv.oembed_url(SP_ID): oembed()}), CACHE)
    assert covers == {"Album1": ("spotify", SP_REF)}
    assert not (tmp_path / "96" / "Album1.jpg").exists()  # its sprite is made again, from the new source


def spotify_albums(n):
    ids = [f"{i:022d}" for i in range(n)]
    albums = [album(f"Album{i}", spotify_url=f"https://open.spotify.com/album/{s}") for i, s in enumerate(ids)]
    pages = {cv.oembed_url(s): oembed(f"https://i.scdn.co/image/ab67616d00001e02{i:024x}") for i, s in enumerate(ids)}
    return albums, ids, pages


def test_resuming_asks_only_what_is_left_and_not_what_failed(tmp_path):
    albums, ids, pages = spotify_albums(5)
    del pages[cv.oembed_url(ids[1])]  # 404
    _, covers, net = run(tmp_path, albums, Net(pages), tiers=("spotify",), limit=3)
    assert list(covers) == ["Album0", "Album2"] and len(net.asked) == 3
    _, covers, net = run(tmp_path, albums, Net(pages), tiers=("spotify",))
    assert list(covers) == ["Album0", "Album2", "Album3", "Album4"]
    assert net.asked == [cv.oembed_url(ids[3]), cv.oembed_url(ids[4])]
    _, covers, net = run(tmp_path, albums, Net(pages), tiers=("spotify",))
    assert net.asked == []
    pages[cv.oembed_url(ids[1])] = oembed()
    _, covers, net = run(tmp_path, albums, Net(pages), tiers=("spotify",), retry_failed=True)
    assert net.asked == [cv.oembed_url(ids[1])] and covers["Album1"] == ("spotify", SP_REF)
    assert "Album1" not in json.loads((tmp_path / "state.json").read_text())["refs"]


def test_refused_requests_stop_the_run_with_code_2_and_keep_what_was_found(tmp_path):
    albums, ids, pages = spotify_albums(6)
    for s in ids[2:]:
        pages[cv.oembed_url(s)] = 429
    said = []
    inputs = cv.Inputs(albums, {}, {}, {}, {})
    net = Net(pages)
    code = cv.run_refs(inputs, tmp_path / "covers.csv", tmp_path / "state.json", tmp_path / "96", fetcher(net), ("spotify",),
                       out=lambda *a: said.append(" ".join(map(str, a))))
    assert code == 2 and len(net.asked) == 4
    assert any("stopped" in line and "429" in line for line in said)
    assert list(cv.read_covers(tmp_path / "covers.csv")) == ["Album0", "Album1"]
    assert json.loads((tmp_path / "state.json").read_text())["refs"] == {}  # a refused album is asked again next time


def test_an_interrupted_run_saves_its_progress(tmp_path):
    albums, ids, pages = spotify_albums(6)
    net = Net(pages)
    code = cv.run_refs(cv.Inputs(albums, {}, {}, {}, {}), tmp_path / "covers.csv", tmp_path / "state.json", tmp_path / "96",
                       fetcher(net), ("spotify",), stop=lambda: len(net.asked) >= 2, out=lambda *a: None)
    assert code == 130 and list(cv.read_covers(tmp_path / "covers.csv")) == ["Album0", "Album1"]


def test_progress_is_saved_every_fifty_albums(tmp_path, monkeypatch):
    albums, ids, pages = spotify_albums(120)
    saved = []
    write = cv.write_covers
    monkeypatch.setattr(cv, "write_covers", lambda path, covers, order: (saved.append(len(covers)), write(path, covers, order)))
    run(tmp_path, albums, Net(pages), tiers=("spotify",))
    assert saved == [50, 100, 120]


def test_a_bandcamp_page_on_another_domain_is_recorded_and_not_asked(tmp_path):
    _, covers, net = run(tmp_path, [album("A", bandcamp_url="https://music.sufjan.com/album/x")])
    assert covers == {} and net.asked == []
    assert "allow-list" in json.loads((tmp_path / "state.json").read_text())["refs"]["A"]["bandcamp"]


def test_dry_run_counts_without_asking(tmp_path):
    albums = [everything("A"), album("B", bandcamp_url="https://a.bandcamp.com/album/x"), album("C", youtube_url=YT), album("D")]
    counts = cv.plan(cv.Inputs(albums, {}, {}, {}, CACHE), {}, cv.State(tmp_path / "state.json"), cv.TIERS)
    assert counts["now"] == {"spotify": 1, "cache": 1, "store": 0, "bandcamp": 1, "youtube": 1}
    assert counts["final"] == {"spotify": 1, "cache": 0, "store": 0, "bandcamp": 1, "youtube": 1, "none": 1}


# --- writing ----------------------------------------------------------------------------------------

def test_covers_csv_is_written_in_catalog_order_and_atomically(tmp_path, monkeypatch):
    path = tmp_path / "covers.csv"
    cv.write_covers(path, {"B": ("deezer", MD5), "A": ("spotify", SP_REF)}, ["A", "B", "C"])
    assert path.read_text(encoding="utf-8") == f"rym_id,source,ref\nA,spotify,{SP_REF}\nB,deezer,{MD5}\n"
    assert cv.read_covers(path) == {"A": ("spotify", SP_REF), "B": ("deezer", MD5)}
    assert path.stat().st_mode & 0o777 == 0o644
    before, moves = path.read_bytes(), []

    def broken(src, dst):
        moves.append((src, dst))
        raise OSError("disk full")
    monkeypatch.setattr(cv.os, "replace", broken)
    with pytest.raises(OSError):
        cv.write_covers(path, {"A": ("youtube", "AfChn_NjI9w")}, ["A"])
    (src, dst), = moves
    assert str(dst) == str(path) and str(src) != str(path)  # written beside the file, then renamed over it
    assert path.read_bytes() == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["covers.csv"]  # the temporary file is not left behind


def test_read_covers_refuses_an_unknown_source(tmp_path):
    (tmp_path / "covers.csv").write_text("rym_id,source,ref\nA,rym,1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="rym"):
        cv.read_covers(tmp_path / "covers.csv")


# --- sprites ----------------------------------------------------------------------------------------

def image_bytes(size, colour=(200, 30, 30), mode="RGB", fmt="JPEG"):
    buf = io.BytesIO()
    Image.new(mode, size, colour).save(buf, fmt)
    return buf.getvalue()


@pytest.mark.parametrize("size,mode,fmt", [((300, 300), "RGB", "JPEG"), ((350, 280), "RGBA", "PNG"), ((200, 200), "L", "JPEG"),
                                           ((250, 250), "P", "PNG"), ((40, 40), "RGB", "JPEG")])
def test_a_sprite_is_96_px_rgb(size, mode, fmt):
    colour = {"RGBA": (200, 30, 30, 255), "L": 120, "P": 3}.get(mode, (200, 30, 30))
    sprite = cv.make_sprite(image_bytes(size, colour, mode, fmt), "deezer")
    assert sprite.size == (96, 96) and sprite.mode == "RGB"


def frame(letterboxed):
    """A 480 x 360 video thumbnail: a red cover in the middle of a blue 16:9 picture, with or without black bars."""
    im = Image.new("RGB", (480, 360), (0, 0, 0) if letterboxed else (20, 40, 200))
    if letterboxed:
        im.paste((20, 40, 200), (0, 45, 480, 315))
    im.paste((220, 20, 20), (105, 45, 375, 315))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=95)
    return buf.getvalue()


def test_a_video_frame_is_cropped_to_its_centre_square_without_the_black_bars():
    sprite = cv.make_sprite(frame(letterboxed=True), "youtube")
    assert sprite.size == (96, 96) and sprite.mode == "RGB"
    for xy in [(2, 2), (48, 48), (93, 93), (2, 93)]:
        r, g, b = sprite.getpixel(xy)
        assert r > 180 and g < 70 and b < 70  # the cover fills the sprite: no bar, no background
    full = cv.make_sprite(frame(letterboxed=False), "youtube")  # a 4:3 picture keeps its whole height
    assert full.getpixel((48, 2))[2] > 150 and full.getpixel((48, 48))[0] > 180


def sprites(tmp_path, covers, net, **kw):
    order = list(covers)
    return cv.run_sprites(covers, order, tmp_path / "96", tmp_path / "state.json", fetcher(net), out=lambda *a: None, **kw)


def test_sprites_are_made_once_saved_small_and_failures_are_skipped(tmp_path):
    covers = {"A": ("spotify", SP_REF), "B": ("deezer", MD5), "C": ("youtube", "AfChn_NjI9w"), "D": ("bandcamp", "5")}
    net = Net({cv.sprite_url("spotify", SP_REF): image_bytes((300, 300)), cv.sprite_url("deezer", MD5): b"not an image",
               cv.sprite_url("youtube", "AfChn_NjI9w"): frame(True)})
    assert sprites(tmp_path, covers, net) == 0
    assert sorted(p.name for p in (tmp_path / "96").iterdir()) == ["A.jpg", "C.jpg"]
    with Image.open(tmp_path / "96" / "A.jpg") as im:
        assert im.size == (96, 96) and im.mode == "RGB" and im.format == "JPEG"
    state = json.loads((tmp_path / "state.json").read_text())["sprites"]
    assert set(state) == {"B", "D"} and "404" in state["D"]["why"]
    net2 = Net(net.pages)
    assert sprites(tmp_path, covers, net2) == 0 and net2.asked == []  # nothing left to ask
    net3 = Net({**net.pages, cv.sprite_url("deezer", MD5): image_bytes((250, 250))})
    sprites(tmp_path, covers, net3, retry_failed=True)
    assert len(net3.asked) == 2 and (tmp_path / "96" / "B.jpg").exists()
    covers["D"] = ("bandcamp", "6")  # another image for the album: its earlier failure no longer counts
    net4 = Net({cv.sprite_url("bandcamp", "6"): image_bytes((350, 350))})
    sprites(tmp_path, covers, net4)
    assert net4.asked == [cv.sprite_url("bandcamp", "6")] and (tmp_path / "96" / "D.jpg").exists()


def test_sprites_limit_sources_and_stop_rule(tmp_path):
    covers = {f"S{i}": ("spotify", f"ab67616d0000b273{i:024x}") for i in range(4)} | {"Y": ("youtube", "AfChn_NjI9w")}
    net = Net(default=(200, image_bytes((300, 300))))
    sprites(tmp_path, covers, net, limit=2)
    assert len(net.asked) == 2
    sprites(tmp_path, covers, net, sources=("youtube",))
    assert net.asked[-1] == cv.sprite_url("youtube", "AfChn_NjI9w") and len(net.asked) == 3
    refused = Net(default=403)
    assert sprites(tmp_path, covers, refused) == 2 and len(refused.asked) == 2
    assert len(list((tmp_path / "96").iterdir())) == 3


def test_spread_takes_the_sources_in_turn():
    covers = {"a": ("spotify", "1"), "b": ("spotify", "2"), "c": ("spotify", "3"), "d": ("youtube", "4"), "e": ("deezer", "5"),
              "f": ("youtube", "6")}
    assert cv.spread(list(covers), covers) == ["a", "e", "d", "b", "f", "c"]


# --- what the build reads ---------------------------------------------------------------------------

def test_cover_for_forms(tmp_path):
    path = tmp_path / "covers.csv"
    covers = {"A": ("spotify", SP_REF), "B": ("deezer", MD5), "C": ("apple", AM_PATH), "D": ("bandcamp", "0123456789"),
              "E": ("youtube", "AfChn_NjI9w")}
    cv.write_covers(path, covers, list(covers))
    (tmp_path / "96").mkdir()
    (tmp_path / "96" / "B.jpg").write_bytes(image_bytes((96, 96)))
    table = cv.load_covers(path, tmp_path / "96")
    assert table.cover_for("A") == (SP_REF, None)
    assert table.cover_for("B") == ("dz:" + MD5, tmp_path / "96" / "B.jpg")
    assert table.cover_for("C") == ("am:" + AM_PATH, None)
    assert table.cover_for("D") == ("bc:0123456789", None)
    assert table.cover_for("E") == ("yt:AfChn_NjI9w", None)
    assert table.cover_for("Album404") == ("", None)
    assert cv.load_covers(tmp_path / "missing.csv", tmp_path / "96").cover_for("A") == ("", None)
