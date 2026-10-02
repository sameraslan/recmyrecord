"""Scoring, edition choice and storefront order, on recorded API responses (fixtures/*.json, written by
record_fixtures.py) and on hand-made listings. No network: an unknown URL fails the test."""
import json
from pathlib import Path

import pytest

pytest.importorskip("rapidfuzz")

from rmr_audio import match as matching  # noqa: E402
from rmr_audio.catalog import Album  # noqa: E402
from rmr_audio.match import Cand, Http, judge, match_album, needs_fallback  # noqa: E402
from rmr_audio.textnorm import artist_sim, edition_marker, strip_edition, title_sim  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


class Replay:
    """Serves recorded responses by URL."""

    def __init__(self, responses: dict):
        self.responses, self.asked = responses, []

    def get(self, url, store, fresh=False):
        self.asked.append(url)
        assert url in self.responses, f"not recorded: {url}"
        return self.responses[url]


def _fixture(name: str):
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    a = data["album"]
    return Album(a["key"], a["title"], a["artist"], a["slug"], a["mean_s"], tuple(a["means"]), a["override"]), data


def test_confident_deezer_match_asks_no_other_store():
    al, data = _fixture("deezer_standard_edition")
    http = Replay(data["responses"])
    m = match_album(http, al)
    assert {k: str(v) for k, v in m.row(al.key).items()} == {k: str(v) for k, v in data["expected"].items()}
    assert (m.source, m.album_id, m.ambiguous, m.n_previews) == ("deezer", "1261474", False, 10)
    assert not any("itunes" in url for url in http.asked)


def test_itunes_fallback_records_the_storefront():
    al, data = _fixture("itunes_fallback")
    http = Replay(data["responses"])
    m = match_album(http, al, ("us", "gb"))
    assert (m.source, m.album_id, m.title, m.n_tracks, m.n_previews) == ("itunes:us", "826492492", "Future Days (Remastered)", 4, 4)
    assert all("country=us" in url for url in http.asked if "itunes" in url)  # found in the first: gb is not asked


def test_later_storefronts_are_tried_in_order_until_one_has_previews():
    """The us responses of the recording served as jp ones, the us and gb stores answering nothing."""
    al, data = _fixture("itunes_fallback")
    responses = {}
    for url, body in data["responses"].items():
        if "itunes" not in url:
            responses[url] = body
            continue
        responses[url.replace("country=us", "country=jp")] = body
        for cc in ("us", "gb"):
            responses[url.replace("country=us", f"country={cc}")] = {"results": []}
    http = Replay(responses)
    m = match_album(http, al, ("us", "gb", "jp", "de"))
    assert (m.source, m.album_id) == ("itunes:jp", "826492492")
    stores = [url.split("country=")[1][:2] for url in http.asked if "itunes" in url]
    assert stores == sorted(stores, key=("us", "gb", "jp").index) and "de" not in stores
    assert matching.storefront_of(m.source) == "jp" and matching.store_of(m.source) == "itunes"
    lookup = [url for url in http.asked if "lookup" in url]
    assert lookup and all("country=jp" in url for url in lookup)  # the listing is read in the storefront that has it


def test_no_store_has_it():
    al, data = _fixture("itunes_fallback")
    responses = {url: ({"results": []} if "itunes" in url else {"data": []}) for url in data["responses"]}
    for cc in ("gb", "jp"):
        responses |= {url.replace("country=us", f"country={cc}"): {"results": []} for url in data["responses"]}

    class Empty(Replay):
        def get(self, url, store, fresh=False):
            self.asked.append(url)
            return self.responses.get(url, {"data": [], "results": []})

    http = Empty(responses)
    m = match_album(http, al, ("us", "gb", "jp"))
    assert m.source == "" and m.row(al.key)["source"] == "" and m.row(al.key)["ambiguous"] == 0
    assert {url.split("country=")[1][:2] for url in http.asked if "itunes" in url} == {"us", "gb", "jp"}


def _cand(title, artist="Artist", n=10, source="deezer", id_="1", previews=None, dur_off=0.0, fit=True, ours="Album"):
    c = Cand(source, id_, title, artist, n, marker=edition_marker(ours, title, artist))
    c.t, c.a = title_sim(ours, title), artist_sim("Artist", artist)
    c.dur_off, c.count_fit, c.n_previews = dur_off, fit, n if previews is None else previews
    c.tracks = [{}] * n
    c.score = 0.84 * c.text - c.penalty + 0.08 * (2.718281828 ** (-dur_off / 0.05)) + 0.03 * fit + 0.05 * c.n_previews / n
    return c


def test_standard_edition_is_preferred_over_a_deluxe_one():
    standard, deluxe = _cand("Album", id_="1", dur_off=0.2, fit=False), _cand("Album (Deluxe Edition)", n=22, id_="2", dur_off=0.2, fit=False)
    assert deluxe.marker == "bigger" and standard.marker == ""
    for order in ([standard, deluxe], [deluxe, standard]):
        best, ambiguous, _ = judge(order)
        assert best is standard and not ambiguous


def test_the_edition_spotify_had_is_recognised_whatever_it_is_called():
    twin = _cand("Album (Live)", id_="2", dur_off=0.001, fit=True)
    assert twin.marker == "other" and twin.fingerprint and twin.penalty == 0.0
    assert _cand("Album (Live)", id_="3", dur_off=0.3, fit=False).penalty == 0.15


def test_ambiguous_when_another_release_scores_as_close_or_the_score_is_grey():
    a, b = _cand("Album", id_="1", dur_off=0.2, fit=False), _cand("Album", "Artist Trio", id_="2", dur_off=0.2, fit=False)
    b.a = a.a  # two different artists that read equally well
    b.score = a.score - 0.01
    best, ambiguous, reason = judge([a, b])
    assert best is a and ambiguous and "another release scores as close" in reason
    grey = _cand("Albums", id_="1", dur_off=0.5, fit=False)
    grey.score = 0.8
    assert judge([grey])[1] and "grey zone" in judge([grey])[2]
    low = _cand("Album", id_="1", dur_off=0.5, fit=False)
    low.score = 0.5
    assert judge([low])[0] is None and judge([])[2] == "no candidate"


def test_fallback_is_wanted_for_missing_doubtful_previewless_or_oversized_matches():
    assert needs_fallback([])
    assert not needs_fallback([_cand("Album")])
    assert needs_fallback([_cand("Album", previews=2)])
    assert needs_fallback([_cand("Album", n=40)])
    assert not matching.settled([_cand("Album", previews=0)]) and matching.settled([_cand("Album", previews=1)])
    assert not matching.settled([]) and matching.DEFAULT_STOREFRONTS == ("us", "gb", "de")


def test_text_similarities():
    assert strip_edition("Kid A (Deluxe Edition)") == "Kid A" and strip_edition("Low - 2017 Remaster") == "Low"
    assert title_sim("OK Computer", "OK Computer OKNOTOK 1997 2017") < 0.8 < title_sim("OK Computer", "Ok Computer (Remastered)")
    assert title_sim("II", "III") <= 0.5 and title_sim("Led Zeppelin II", "Led Zeppelin II (Deluxe Edition)") == 1.0
    assert artist_sim("Mingus", "Charles Mingus") >= 0.75 and artist_sim("青葉市子 [Ichiko Aoba]", "Ichiko Aoba") == 1.0
    assert artist_sim("Various Artists", "Anyone") == 0.65
    assert edition_marker("Blue", "Blue (Karaoke Version)") == "other" and edition_marker("Blue", "Blue (Expanded)") == "bigger"
    assert edition_marker("Live at Leeds", "Live at Leeds") == ""
    assert title_sim("3rd", "Third") == 1.0 and title_sim("The Third Man", "The 3rd Man") == 1.0  # ordinals
    assert title_sim("3rd", "4th") <= 0.5 and title_sim("Third", "Thirst") <= 0.9
    assert artist_sim("Third Eye Blind", "3rd Eye Blind") == 1.0


def test_http_retries_quota_and_network_errors_then_caches(tmp_path):
    import requests

    slept, answers = [], [requests.ConnectionError("down"), requests.HTTPError("Deezer: Quota limit exceeded"), {"data": [1]}]
    http = Http(tmp_path / "http.sqlite", sleep=slept.append)
    http.throttles["deezer"].interval = 0.0

    def fetch(url):
        a = answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a

    http.fetch = fetch
    assert http.get("https://api.deezer.com/x", "deezer") == {"data": [1]} and slept == [5, 10]
    assert http.get("https://api.deezer.com/x", "deezer") == {"data": [1]} and not answers  # from the cache
    answers.append({"data": [2]})
    assert http.get("https://api.deezer.com/x", "deezer", fresh=True) == {"data": [2]}  # a fresh listing skips it
    assert Http(tmp_path / "http.sqlite").cached("https://api.deezer.com/x") == {"data": [1]}
    answers += [requests.HTTPError("HTTP 503")] * 2
    http.attempts = 2
    with pytest.raises(IOError, match="giving up"):
        http.get("https://api.deezer.com/y", "deezer")
    http.abort = lambda: True
    with pytest.raises(IOError, match="interrupted"):
        http.get("https://api.deezer.com/z", "deezer")


def _itunes_store(albums: dict, searches: dict, cc: str = "us") -> dict:
    """Hand-made iTunes responses: `albums` id -> (title, artist, artist id, tracks), `searches` term -> ids;
    every artist's album list holds all of the artist's albums."""
    def head(i):
        title, artist, artist_id, n = albums[i]
        return {"wrapperType": "collection", "collectionType": "Album", "collectionId": i, "collectionName": title,
                "artistName": artist, "artistId": artist_id, "trackCount": n}

    out = {Http.url("https://itunes.apple.com/search", term=term, entity="album", limit=25, country=cc):
           {"results": [head(i) for i in ids]} for term, ids in searches.items()}
    for i, (title, artist, artist_id, n) in albums.items():
        songs = [{"wrapperType": "track", "kind": "song", "trackId": i * 100 + k, "trackName": f"t{k}", "trackNumber": k + 1,
                  "discNumber": 1, "trackTimeMillis": 240000, "previewUrl": f"https://previews.invalid/{i}-{k}"} for k in range(n)]
        out[Http.url("https://itunes.apple.com/lookup", id=i, entity="song", limit=200, country=cc)] = {"results": [head(i)] + songs}
        out[Http.url("https://itunes.apple.com/lookup", id=artist_id, entity="album", limit=200, country=cc)] = {"results": [
            {"wrapperType": "artist", "artistName": artist, "artistId": artist_id}] + [head(j) for j, a in albums.items() if a[2] == artist_id]}
    return out


class Store(Replay):
    """Replay where Deezer has nothing and an unknown iTunes search finds nothing."""

    def get(self, url, store, fresh=False):
        self.asked.append(url)
        if url in self.responses:
            return self.responses[url]
        assert "deezer" in url or "/search" in url, f"not recorded: {url}"
        return {"data": [], "results": []}


def test_itunes_artist_album_list_finds_what_search_misses():
    """Search returns only another album of the artist; the artist's album list has the right one."""
    al = Album("k", "Liquid Swords", "Genius/GZA", "liquid-swords-genius-gza")
    albums = {1: ("Legend of the Liquid Sword", "GZA", 77, 14), 2: ("Liquid Swords", "GZA", 77, 13),
              3: ("Liquid Swords (Instrumentals)", "GZA", 77, 13)}
    http = Store(_itunes_store(albums, {"Genius/GZA Liquid Swords": [1]}))
    m = match_album(http, al, ("us",))
    assert (m.source, m.album_id, m.title, m.n_previews) == ("itunes:us", "2", "Liquid Swords", 13) and not m.ambiguous
    assert sum("entity=album&limit=200" in url for url in http.asked) == 1


def test_artist_album_list_is_not_fetched_when_search_has_the_album_or_not_the_artist():
    al = Album("k", "Liquid Swords", "Genius/GZA", "liquid-swords-genius-gza")
    albums = {2: ("Liquid Swords", "GZA", 77, 13), 9: ("Liquid Swords", "Some Tribute Band", 88, 13)}
    http = Store(_itunes_store(albums, {"Genius/GZA Liquid Swords": [2]}))
    assert match_album(http, al, ("us",)).album_id == "2"
    assert not any("entity=album&limit=200" in url for url in http.asked)
    http = Store(_itunes_store(albums, {"Genius/GZA Liquid Swords": [9]}))  # the artist does not read right
    assert match_album(http, al, ("us",)).source == ""
    assert not any("entity=album&limit=200" in url for url in http.asked)


def test_a_cover_version_is_never_a_confident_match():
    """Game soundtracks on Apple are cover versions under another credit. By text they are rejected. When the
    table's Spotify numbers are the cover album's own (they are for "Super Mario Galaxy"), the listing is
    recognised by its durations and flagged ambiguous: such albums are kept out with {"skip": true}."""
    albums = {5: ("Super Mario Galaxy Collection", "Goodknight Productions", 55, 18),
              6: ("Super Mario Galaxy - EP", "Video Game Piano Players", 56, 6)}
    searches = {"Mario Galaxy Orchestra Super Mario Galaxy": [5, 6], "Super Mario Galaxy": [5, 6]}
    al = Album("k", "Super Mario Galaxy", "Mario Galaxy Orchestra", "super-mario-galaxy-mario-galaxy-orchestra")
    assert match_album(Store(_itunes_store(albums, searches)), al, ("us",)).source == ""
    spotify = Album(al.key, al.title, al.artist, al.slug, 240.0, (5.5, 0.5, 4.0), override=False)  # 18 tracks of 240 s
    del albums[6]
    m = match_album(Store(_itunes_store(albums, {k: [5] for k in searches})), spotify, ("us",))
    assert m.album_id == "5" and m.ambiguous and "durations only" in m.reason


def test_import_responses_adds_the_default_storefront(tmp_path):
    src = Http(tmp_path / "src.sqlite")
    urls = ["https://itunes.apple.com/search?term=a&entity=album&limit=25", "https://api.deezer.com/search/album?q=a",
            "https://itunes.apple.com/lookup?id=1&entity=song&limit=200&country=gb"]
    for n, url in enumerate(urls):
        src.fetch = lambda u, n=n: {"n": n}
        src.throttles["itunes"].interval = 0.0
        src.get(url, "itunes")
    src.db.close()
    dest = tmp_path / "cache" / "http.sqlite"
    assert matching.import_responses(dest, tmp_path / "src.sqlite") == 2  # the iTunes URL without a storefront is left out
    assert matching.import_responses(dest, tmp_path / "src.sqlite", default_storefront="us") == 1
    http = Http(dest)
    assert http.cached(urls[0] + "&country=us") == {"n": 0} and http.cached(urls[0]) is None
    assert http.cached(urls[1]) == {"n": 1} and http.cached(urls[2]) == {"n": 2}
