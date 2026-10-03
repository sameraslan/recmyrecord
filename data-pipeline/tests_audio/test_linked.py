"""The catalog row's store links: direct lookup, the edition rule, the fallbacks, the flags, the search of
an album without links, the duplicate guard and the dry run. Hand-made store responses in the shape the
APIs answer, and two recorded ones (fixtures/linked_*.json, written by record_fixtures.py); no network: a URL that is not there fails the test."""
import csv
import json
from pathlib import Path

import pytest

pytest.importorskip("rapidfuzz")

from rmr_pipeline.audio_store import DEFAULT_AUDIO, MATCH_FIELDS, load_matches, write_matches  # noqa: E402
from rmr_audio import dryrun, match as matching  # noqa: E402
from rmr_audio.catalog import Album, load_catalog  # noqa: E402
from rmr_audio.match import Http, Match, match_album, short_preview, text_pairs, under_covered  # noqa: E402
from rmr_audio.sync import Options, make_plan  # noqa: E402
from rmr_audio.clips import ClipCache  # noqa: E402

from .conftest import match_row  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
DEEZER, APPLE = "https://www.deezer.com/album/{}", "https://music.apple.com/{}/album/some-name/{}"


class Stores:
    """Hand-made Deezer and iTunes answers. An album is (title, artist, artist id, track seconds, previews):
    `previews` is how many of its tracks have one (None: all). Unknown searches find nothing; any other
    unknown URL fails the test."""

    def __init__(self):
        self.responses, self.asked = {}, []
        self.deezer_artists, self.itunes_artists = {}, {}

    @property
    def asked_by(self) -> dict:
        """What Http counts: the distinct URLs asked for, by store."""
        return {store: sum(host in url for url in set(self.asked)) for store, host in (("deezer", "deezer"), ("itunes", "itunes"))}

    def deezer(self, id_, title, artist, artist_id, seconds, previews=None, kind="album"):
        n = len(seconds) if previews is None else previews
        self.responses[f"https://api.deezer.com/album/{id_}"] = {
            "id": id_, "title": title, "artist": {"id": artist_id, "name": artist}, "nb_tracks": len(seconds),
            "record_type": kind}
        self.responses[Http.url(f"https://api.deezer.com/album/{id_}/tracks", limit=200)] = {"data": [
            {"id": id_ * 100 + k, "title": f"t{k}", "duration": s, "disk_number": 1, "track_position": k + 1,
             "preview": f"https://previews.invalid/{id_}-{k}" if k < n else ""} for k, s in enumerate(seconds)]}
        self.deezer_artists.setdefault(artist_id, []).append({"id": id_, "title": title, "record_type": kind})
        self.responses[Http.url(f"https://api.deezer.com/artist/{artist_id}/albums", limit=100)] = {
            "data": self.deezer_artists[artist_id]}
        return self

    def deezer_search(self, q, ids):
        heads = [self.responses[f"https://api.deezer.com/album/{i}"] for i in ids]
        self.responses[Http.url("https://api.deezer.com/search/album", q=q, limit=25)] = {"data": heads}
        return self

    def itunes(self, id_, title, artist, artist_id, seconds, previews=None, cc="us"):
        n = len(seconds) if previews is None else previews
        head = {"wrapperType": "collection", "collectionType": "Album", "collectionId": id_, "collectionName": title,
                "artistName": artist, "artistId": artist_id, "trackCount": len(seconds)}
        songs = [{"wrapperType": "track", "kind": "song", "trackId": id_ * 100 + k, "trackName": f"t{k}",
                  "trackNumber": k + 1, "discNumber": 1, "trackTimeMillis": s * 1000,
                  **({"previewUrl": f"https://previews.invalid/{id_}-{k}"} if k < n else {})} for k, s in enumerate(seconds)]
        self.responses[Http.url("https://itunes.apple.com/lookup", id=id_, entity="song", limit=200, country=cc)] = {
            "results": [head] + songs}
        self.itunes_artists.setdefault((artist_id, cc), []).append(head)
        self.responses[Http.url("https://itunes.apple.com/lookup", id=artist_id, entity="album", limit=200, country=cc)] = {
            "results": [{"wrapperType": "artist", "artistName": artist, "artistId": artist_id}] + self.itunes_artists[(artist_id, cc)]}
        return self

    def itunes_search(self, term, ids, cc="us"):
        heads = [h for (_, c), hs in self.itunes_artists.items() if c == cc for h in hs if h["collectionId"] in ids]
        self.responses[Http.url("https://itunes.apple.com/search", term=term, entity="album", limit=25, country=cc)] = {
            "results": heads}
        return self

    def get(self, url, store, fresh=False, search=False):
        self.asked.append(url)
        if url in self.responses:
            return self.responses[url]
        if "/search" in url:
            return {"data": [], "results": []}
        if "api.deezer.com/album/" in url and "/tracks" not in url:
            return {"error": {"type": "DataException", "message": "no data", "code": 800}}
        if "itunes.apple.com/lookup" in url and "entity=song" in url:
            return {"resultCount": 0, "results": []}  # the storefront does not have this id
        raise AssertionError(f"not recorded: {url}")

    def searched(self) -> bool:
        return any("/search" in url for url in self.asked)


def new_album(title="Album", artist="Artist", deezer=None, apple=None, **kw) -> Album:
    return Album("Album1", title, artist, "album-artist", new=True, rank=500,
                 deezer_url=DEEZER.format(deezer) if deezer else "", apple_url=APPLE.format(*apple) if apple else "", **kw)


LP = [240] * 10  # ten tracks of four minutes


# --- the links -------------------------------------------------------------------------------------

def test_links_are_read_from_the_catalog_rows_urls():
    al = Album("k", "T", "A", "t-a", deezer_url="https://www.deezer.com/us/album/14879699",
               apple_url="https://music.apple.com/jp/album/720457097")
    assert al.deezer_id == "14879699" and al.apple_link == ("jp", "720457097")
    assert al.links == [("deezer", "14879699"), ("itunes:jp", "720457097")]
    al = Album("k", "T", "A", "t-a", apple_url="https://music.apple.com/us/album/ok-computer/1097861387?i=1097861388")
    assert al.links == [("itunes:us", "1097861387")] and al.deezer_id == ""
    assert Album("k", "T", "A", "t-a").links == [] and Album("k", "T", "A", "t-a", deezer_url="https://x.invalid/1").links == []


def test_a_deezer_link_is_fetched_by_its_id_and_nothing_is_searched():
    http = Stores().deezer(11, "Album", "Artist", 7, LP).itunes(22, "Album", "Artist", 9, LP)
    m = match_album(http, new_album(deezer=11, apple=("us", 22)))
    assert (m.source, m.album_id, m.title, m.artist, m.n_tracks, m.n_previews) == ("deezer", "11", "Album", "Artist", 10, 10)
    assert (m.matched_by, m.edition, m.ambiguous, m.runtime_s, m.under_covered) == ("deezer_id", "", False, 2400.0, False)
    assert http.asked == ["https://api.deezer.com/album/11", "https://api.deezer.com/album/11/tracks?limit=200"]
    row = m.row("Album1")
    assert list(row) == MATCH_FIELDS and (row["matched_by"], row["runtime_s"], row["under_covered"], row["short_preview"]) == (
        "deezer_id", 2400, 0, "")


def test_a_linked_listing_is_accepted_however_it_reads_and_only_flagged():
    """The RYM link is the match: a title or an artist that reads below the search's floors sets `ambiguous`."""
    http = Stores().deezer(11, "Something Else Entirely", "Artist", 7, LP).deezer(12, "Album", "Nobody Like Them", 8, LP)
    m = match_album(http, new_album(deezer=11))
    assert (m.album_id, m.ambiguous, m.n_previews) == ("11", True, 10) and "reads differently" in m.reason
    assert match_album(http, new_album(deezer=12)).ambiguous and not http.searched()
    latin = new_album("アダンの風", "青葉市子", deezer=13, artist_latin="Ichiko Aoba", title_latin="Windswept Adan")
    http = Stores().deezer(13, "Windswept Adan", "Ichiko Aoba", 5, LP).deezer(14, "アダンの風", "青葉市子", 5, LP)
    assert not match_album(http, latin).ambiguous  # the Latin spelling reads right
    assert not match_album(http, Album("k", latin.title, latin.artist, "s", new=True, deezer_url=DEEZER.format(14))).ambiguous
    assert match_album(http, Album("k", latin.title, latin.artist, "s", new=True, deezer_url=DEEZER.format(13))).ambiguous


def test_an_apple_id_is_asked_for_in_its_links_storefront_then_in_us():
    http = Stores().itunes(720457097, "Album", "Artist", 9, LP, cc="jp")
    m = match_album(http, new_album(apple=("jp", 720457097)))
    assert (m.source, m.album_id, m.matched_by, m.n_previews) == ("itunes:jp", "720457097", "apple_id", 10)
    assert all("lookup" in url and "country=jp" in url for url in http.asked)  # us is not asked, nothing is searched
    http = Stores().itunes(33, "Album", "Artist", 9, LP, cc="us")  # the link's storefront no longer has the id
    m = match_album(http, new_album(apple=("ru", 33)))
    assert (m.source, m.album_id, m.matched_by) == ("itunes:us", "33", "apple_id")
    assert [url.split("country=")[1] for url in http.asked if "entity=song" in url][:2] == ["ru", "us"] and not http.searched()


class Replay:
    """Serves recorded responses by URL; any other URL fails the test."""

    def __init__(self, responses: dict):
        self.responses, self.asked = responses, []

    def get(self, url, store, fresh=False, search=False):
        self.asked.append(url)
        assert url in self.responses, f"not recorded: {url}"
        return self.responses[url]


def _recorded(name: str):
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return Album(**{**data["album"], "means": tuple(data["album"]["means"])}), data


def test_recorded_deezer_link():
    """Neil Young, "On the Beach", as Deezer answered on 3 October 2026: two requests, no search."""
    al, data = _recorded("linked_deezer_id")
    http = Replay(data["responses"])
    m = match_album(http, al)
    assert {k: str(v) for k, v in m.row(al.key).items()} == {k: str(v) for k, v in data["expected"].items()}
    assert (m.source, m.album_id, m.matched_by, m.ambiguous) == ("deezer", al.deezer_id, "deezer_id", False)
    assert http.asked == [f"https://api.deezer.com/album/{al.deezer_id}", f"https://api.deezer.com/album/{al.deezer_id}/tracks?limit=200"]


def test_recorded_apple_link_in_its_storefront_after_a_deezer_listing_without_previews():
    """Cassiano, "Cuban Soul: 18 kilates": the Deezer listing RYM links has no preview; the Apple link names
    the Brazilian store, and that is where the id is asked for."""
    al, data = _recorded("linked_apple_storefront")
    http = Replay(data["responses"])
    m = match_album(http, al)
    assert {k: str(v) for k, v in m.row(al.key).items()} == {k: str(v) for k, v in data["expected"].items()}
    assert al.apple_link[0] == "br" and (m.source, m.album_id, m.matched_by) == ("itunes:br", al.apple_link[1], "apple_id")
    assert m.n_previews == m.n_tracks > 0 and not any("/search" in url for url in http.asked)
    assert all("country=br" in url for url in http.asked if "itunes" in url)


# --- the edition rule ------------------------------------------------------------------------------

def test_an_oversized_linked_edition_is_replaced_by_the_standard_one():
    http = (Stores().deezer(11, "Album (Deluxe Edition)", "Artist", 7, [240] * 22)
            .deezer(12, "Album", "Artist", 7, [200], kind="single")  # the single of the same name: not the album
            .deezer(13, "Album (Live)", "Artist", 7, LP)  # another recording
            .deezer(14, "Album (Remastered)", "Artist", 7, LP)
            .deezer(15, "Another Album", "Artist", 7, LP))
    m = match_album(http, new_album(deezer=11))
    assert (m.album_id, m.title, m.n_tracks, m.edition, m.linked_id, m.matched_by) == (
        "14", "Album (Remastered)", 10, "standard", "11", "deezer_id")
    assert m.row("Album1")["edition"] == "standard" and not m.ambiguous
    fetched = [url.split("/album/")[1].split("/")[0] for url in http.asked if "/tracks" in url]
    assert fetched == ["11", "14"] and not http.searched()  # neither the single, the live album nor the other album
    # more than 30 tracks without any marker, on Apple: the album list has track counts
    http = (Stores().itunes(21, "Album", "Artist", 9, [200] * 34).itunes(22, "Album", "Artist", 9, [200] * 40)
            .itunes(23, "Album", "Artist", 9, [200] * 12, previews=0).itunes(24, "Album", "Artist", 9, [200] * 14))
    m = match_album(http, new_album(apple=("us", 21)))
    assert (m.source, m.album_id, m.edition, m.linked_id) == ("itunes:us", "24", "standard", "21")  # 23 has no preview


def test_an_oversized_linked_edition_is_kept_when_there_is_no_standard_one():
    http = Stores().deezer(11, "Album (Deluxe Edition)", "Artist", 7, [240] * 22).deezer(12, "Album", "Artist", 7, [200, 200])
    m = match_album(http, new_album(deezer=11))  # the other listing of that name is 7 minutes long: not an album
    assert (m.album_id, m.edition, m.linked_id, m.ambiguous) == ("11", "", "", False)
    assert "no standard one was found" in m.reason


def test_an_excerpt_or_a_listing_that_reads_worse_is_not_the_standard_edition():
    """Aphrodite's Child, "666": the linked deluxe listing has 48 tracks, and the other listing of that name has
    four of them."""
    http = (Stores().deezer(11, "666 (Deluxe)", "Aphrodite's Child", 7, [200] * 48)
            .deezer(12, "666", "Aphrodite's Child", 7, [230] * 4))  # 15 minutes of 160
    m = match_album(http, new_album("666", "Aphrodite's Child", deezer=11))
    assert (m.album_id, m.edition) == ("11", "") and "no standard one was found" in m.reason
    http = (Stores().deezer(11, "Album (Deluxe Edition)", "Artist", 7, [240] * 22)
            .deezer(12, "Album (The Other Story)", "Artist", 7, LP))  # the same core title, but it reads worse
    assert match_album(http, new_album(deezer=11)).album_id == "11"


def test_a_listing_of_one_to_three_tracks_is_replaced_by_a_split_edition_of_the_same_runtime():
    """Thick as a Brick: two sides of 22 minutes; the same recording is also listed in eight parts."""
    sides, parts = [1320, 1290], [330] * 8  # 43.5 and 44 minutes
    http = (Stores().itunes(31, "Thick as a Brick", "Jethro Tull", 9, sides).itunes(32, "Thick as a Brick", "Jethro Tull", 9, parts)
            .itunes(33, "Thick as a Brick (Live)", "Jethro Tull", 9, parts).itunes(34, "Aqualung", "Jethro Tull", 9, LP))
    al = new_album("Thick as a Brick", "Jethro Tull", apple=("us", 31))
    m = match_album(http, al)
    assert (m.album_id, m.n_tracks, m.n_previews, m.edition, m.linked_id) == ("32", 8, 8, "split", "31")
    assert not m.under_covered and m.row(al.key)["under_covered"] == 0
    # on Deezer the album list has no track counts: the listings of that name are fetched and compared
    http = Stores().deezer(41, "Thick as a Brick", "Jethro Tull", 7, sides).deezer(42, "Thick as a Brick", "Jethro Tull", 7, parts)
    assert match_album(http, new_album("Thick as a Brick", "Jethro Tull", deezer=41)).album_id == "42"


def test_a_split_edition_outside_fifteen_percent_of_the_runtime_is_not_taken():
    sides = [1320, 1290]  # 43.5 minutes
    for other in ([330] * 10, [330] * 6):  # 55 minutes (bonus tracks) and 33 minutes (an abridged one)
        http = Stores().itunes(31, "Thick as a Brick", "Jethro Tull", 9, sides).itunes(32, "Thick as a Brick", "Jethro Tull", 9, other)
        m = match_album(http, new_album("Thick as a Brick", "Jethro Tull", apple=("us", 31)))
        assert (m.album_id, m.edition, m.n_previews) == ("31", "", 2) and "no split edition was found" in m.reason
        assert m.under_covered and m.row("k")["under_covered"] == 1  # two windows for 43 minutes
    within = Stores().itunes(31, "T", "A", 9, sides).itunes(32, "T", "A", 9, [300] * 10)  # 50 minutes: 15% more
    assert match_album(within, new_album("T", "A", apple=("us", 31))).album_id == "32"
    http = Stores().itunes(31, "T", "A", 9, sides).itunes(32, "T", "A", 9, [330] * 8, previews=2)  # no more previews
    assert match_album(http, new_album("T", "A", apple=("us", 31))).album_id == "31"


# --- no previews: the other link, then the search ---------------------------------------------------

def test_a_linked_listing_without_previews_falls_back_to_the_other_link_then_to_the_search():
    al = new_album(deezer=11, apple=("gb", 22))
    http = Stores().deezer(11, "Album", "Artist", 7, LP, previews=0).itunes(22, "Album", "Artist", 9, LP, cc="gb")
    m = match_album(http, al)
    assert (m.source, m.album_id, m.matched_by, m.n_previews) == ("itunes:gb", "22", "apple_id", 10) and not http.searched()
    # neither link has a preview: the text search finds another listing that has
    http = (Stores().deezer(11, "Album", "Artist", 7, LP, previews=0).itunes(22, "Album", "Artist", 9, LP, previews=0, cc="gb")
            .deezer(15, "Album", "Artist", 7, LP).deezer_search('artist:"Artist" album:"Album"', [15]))
    m = match_album(http, al)
    assert (m.source, m.album_id, m.matched_by, m.n_previews) == ("deezer", "15", "search", 10)
    assert "the linked listing has no preview" in m.reason
    # nothing anywhere: the album is recorded with its linked listing and no preview
    http = Stores().deezer(11, "Album", "Artist", 7, LP, previews=0).itunes(22, "Album", "Artist", 9, LP, previews=0, cc="gb")
    m = match_album(http, al)
    assert (m.source, m.album_id, m.matched_by, m.n_previews, m.under_covered) == ("deezer", "11", "deezer_id", 0, False)
    assert http.searched() and {"us", "gb", "de", "jp"} == {u.split("country=")[1] for u in http.asked if "itunes.apple.com/search" in u}
    assert m.row("k")["n_clips_available"] == 0


def test_dead_links_fall_back_to_the_search():
    http = Stores().deezer(15, "Album", "Artist", 7, LP).deezer_search('artist:"Artist" album:"Album"', [15])
    m = match_album(http, new_album(deezer=404, apple=("se", 405)))
    assert (m.source, m.album_id, m.matched_by) == ("deezer", "15", "search") and "no store link resolves" in m.reason
    assert match_album(Stores(), new_album(deezer=404)).source == ""


# --- an album without links: the text search --------------------------------------------------------

def test_latin_names_and_split_credits_are_searched_for():
    al = Album("k", "アダンの風", "青葉市子", "s", artist_latin="Ichiko Aoba", title_latin="Windswept Adan", new=True)
    assert text_pairs(al)[:4] == [("青葉市子", "アダンの風"), ("Ichiko Aoba", "Windswept Adan"), ("Ichiko Aoba", "アダンの風"),
                                  ("青葉市子", "Windswept Adan")]
    credit = Album("k", "Symphonie Nr. 5", "Ludwig van Beethoven & Wiener Philharmoniker & Carlos Kleiber", "s", new=True)
    assert text_pairs(credit)[-2:] == [("Wiener Philharmoniker", "Symphonie Nr. 5"), ("Carlos Kleiber", "Symphonie Nr. 5")]
    assert ("Ludwig van Beethoven", "Symphonie Nr. 5") in text_pairs(credit)
    plain = Album("k", "Future Days", "Can", "s")  # nothing changes for an album with neither
    assert text_pairs(plain) == [("Can", "Future Days")]


def test_an_album_without_links_is_found_under_its_latin_name():
    al = Album("k", "アダンの風", "青葉市子", "s", artist_latin="Ichiko Aoba", title_latin="Windswept Adan", new=True)
    http = Stores().deezer(51, "Windswept Adan", "Ichiko Aoba", 5, LP).deezer_search('artist:"Ichiko Aoba" album:"Windswept Adan"', [51])
    m = match_album(http, al)
    assert (m.source, m.album_id, m.matched_by, m.ambiguous) == ("deezer", "51", "search", False)
    assert not any("itunes" in url for url in http.asked)
    http = Stores().itunes(52, "Windswept Adan", "Ichiko Aoba", 5, LP, cc="jp").itunes_search("Ichiko Aoba Windswept Adan", [52], cc="jp")
    m = match_album(http, al)  # only the Japanese store has it: jp follows the default storefronts
    assert (m.source, m.album_id, m.matched_by) == ("itunes:jp", "52", "search")
    stores = [u.split("country=")[1] for u in http.asked if "itunes.apple.com/search" in u]
    assert list(dict.fromkeys(stores)) == ["us", "gb", "de", "jp"]


def test_an_album_without_links_is_found_under_one_name_of_its_credit():
    al = Album("k", "Symphonie Nr. 5", "Ludwig van Beethoven & Wiener Philharmoniker & Carlos Kleiber", "s", new=True)
    http = (Stores().deezer(61, "Symphonie Nr. 5", "Carlos Kleiber", 3, [480] * 4)
            .deezer_search('artist:"Carlos Kleiber" album:"Symphonie Nr. 5"', [61]))
    m = match_album(http, al)
    assert (m.source, m.album_id, m.matched_by) == ("deezer", "61", "search")


# --- the flags -------------------------------------------------------------------------------------

def test_under_covered_and_short_preview():
    assert under_covered(3, 900) and under_covered(1, 3600) and not under_covered(4, 3600)
    assert not under_covered(3, 899)  # a single or an EP
    assert not under_covered(0, 3600)  # no preview at all is another problem
    assert short_preview([(30.0, 200.0), (10.0, 200.0)]) and short_preview([(24.9, 61.0)])
    assert not short_preview([(30.0, 200.0), (25.0, 200.0)]) and not short_preview([(12.0, 40.0)])  # a short track
    assert not short_preview([]) and not short_preview([(0.0, 200.0)])
    http = Stores().deezer(11, "Album", "Artist", 7, [1200, 1300, 1250])  # three tracks of twenty minutes, no split edition
    m = match_album(http, new_album(deezer=11))
    assert m.under_covered and m.row("k")["under_covered"] == 1 and m.row("k")["short_preview"] == ""
    assert Match(reason="no candidate").row("k") == {**dict.fromkeys(MATCH_FIELDS, ""), "key": "k", "ambiguous": 0}


# --- existing albums and the plan ------------------------------------------------------------------

def test_only_albums_without_a_row_are_matched(tmp_path):
    """The site's albums have their row in matches.csv, matched or not: a plain sync asks the stores for the
    catalog's new albums only, whatever links the old ones carry now."""
    old = [Album(f"key:{i}", f"T{i}", f"A{i}", f"t{i}-a{i}", deezer_url=DEEZER.format(900 + i)) for i in range(3)]
    new = [new_album(deezer=11), Album("Album2", "T", "A", "t-a", new=True)]
    matches = {r["key"]: r for r in (match_row("key:0", "deezer", "d0"), match_row("key:1", ""), match_row("key:2", "itunes:us", "i2"))}
    stored = {"key:0": (4, "deezer"), "key:2": (4, "itunes:us")}
    plan = make_plan(old + new, stored, matches, {}, ClipCache(":memory:"), Options(tmp_path, tmp_path), 4)
    assert [(i.album.key, i.kind) for i in plan.items] == [("Album1", "match"), ("Album2", "match")]
    assert plan.counts["up_to_date"] == 2 and plan.counts["unmatched"] == 1


def test_committed_catalog_reaches_the_matcher():
    """Skipped where the feature table is not present."""
    from rmr_pipeline.constants import DEFAULT_TABLE

    if not DEFAULT_TABLE.exists():
        pytest.skip("no feature table")
    catalog = load_catalog()
    old, new = [al for al in catalog if not al.new], [al for al in catalog if al.new]
    assert catalog == old + new and len(old) > 4000 and len(new) > 6000
    assert {m["key"] for m in load_matches(DEFAULT_AUDIO / "matches.csv")} >= {al.key for al in old}
    assert [al.rank for al in new] == sorted(al.rank for al in new) and new[0].rank > 0
    assert all(al.override and not al.legacy_uri and al.key.startswith("Album") for al in new)
    assert sum(bool(al.deezer_id) for al in new) > 2000 and sum(bool(al.apple_link) and not al.deezer_id for al in new) > 3000
    assert all(not al.deezer_url or al.deezer_id for al in catalog) and all(not al.apple_url or al.apple_link for al in catalog)
    assert sum(bool(al.artist_latin) for al in new) > 400


# --- the dry run -----------------------------------------------------------------------------------

def _chart(n: int) -> list[Album]:
    old = [Album(f"old:{i}", f"Old {i}", "Artist", f"old-{i}") for i in range(5)]
    return old + [Album(f"Album{i}", f"Title {i}", "Artist", f"title-{i}", new=True, rank=i,
                        deezer_url=DEEZER.format(1000 + i) if i % 2 else "",
                        apple_url=APPLE.format("se", 2000 + i) if i % 4 == 0 else "") for i in range(1, n + 1)]


def test_the_sample_is_stratified_by_rank_and_repeatable():
    catalog = _chart(1000)
    a, b = dryrun.stratified_sample(catalog, 100, seed=7), dryrun.stratified_sample(catalog, 100, seed=7)
    assert a == b != dryrun.stratified_sample(catalog, 100, seed=8)
    assert len({al.key for al in a}) == 100 and all(al.new for al in a) and [al.rank for al in a] == sorted(al.rank for al in a)
    assert [sum(lo < al.rank <= lo + 100 for al in a) for lo in range(0, 1000, 100)] == [10] * 10  # ten per rank decile
    assert len(dryrun.stratified_sample(catalog, 5000, seed=1)) == 1000 and dryrun.stratified_sample(catalog[:5], 10, 1) == []
    assert len(dryrun.stratified_sample(catalog, 7, seed=1)) == 7


def test_dry_run_writes_a_csv_and_a_summary_and_nothing_else(tmp_path):
    catalog = _chart(40)
    http = Stores()
    for i in range(1, 41):
        if i % 2:  # a Deezer link: a plain album; 7 is a deluxe one with a standard edition, 9 has two long tracks
            title, seconds = (f"Title {i} (Deluxe)", [200] * 20) if i == 7 else (f"Title {i}", [1500, 1500] if i == 9 else LP)
            http.deezer(1000 + i, title, "Artist", 70 + i, seconds, previews=0 if i == 11 else None)
        elif i % 4 == 0:  # an Apple link in the Swedish store; 8 reads like another album
            http.itunes(2000 + i, "Other" if i == 8 else f"Title {i}", "Artist", 90 + i, LP, cc="se")
    http.deezer(5007, "Title 7", "Artist", 77, LP)
    http.deezer(5002, "Title 2", "Artist", 99, LP).deezer_search('artist:"Artist" album:"Title 2"', [5002])  # found by search
    audio = tmp_path / "audio"
    write_matches(audio / "matches.csv", [match_row("old:0", "deezer", "1003"), match_row("old:1", "itunes:us", "2004")])
    before = (audio / "matches.csv").read_bytes()
    lines = []
    code = dryrun.dry_run(catalog, tmp_path / "out", sample=40, seed=3, cache=None, audio_dir=audio, http=http, out=lines.append)
    assert code == 0 and len(lines) == 41
    assert sorted(p.name for p in (tmp_path / "out").iterdir()) == ["matches_dry_run.csv", "summary.json", "summary.md"]
    assert (audio / "matches.csv").read_bytes() == before and [p.name for p in audio.iterdir()] == ["matches.csv"]
    with open(tmp_path / "out" / "matches_dry_run.csv", newline="", encoding="utf-8") as f:
        rows = {r["key"]: r for r in csv.DictReader(f)}
    assert len(rows) == 40 and rows["Album7"]["edition"] == "standard" and rows["Album7"]["source_album_id"] == "5007"
    assert rows["Album8"]["ambiguous"] == "1" and rows["Album8"]["path"] == "apple direct (se)"
    assert rows["Album2"]["path"] == "text search (deezer)" and rows["Album6"]["path"] == "unmatched"
    s = json.loads((tmp_path / "out" / "summary.json").read_text(encoding="utf-8"))
    assert s["albums_done"] == 40 and s["api_errors"] == [] and s["stopped"] == ""
    assert s["by_path"] == {"deezer direct": 20, "apple direct (se)": 10, "unmatched": 9, "text search (deezer)": 1}
    assert s["by_link_class"]["no store link"] == {**s["by_link_class"]["no store link"], "albums": 10, "no_preview": 9}
    assert s["no_preview"] == {"albums": 10, "of": 40, "unmatched": 9, "matched_without_preview": 1}
    assert s["ambiguous"]["albums"] == 1 and s["under_covered"] == {"albums": 1, "of": 40}
    assert s["edition_rule"] == {"oversized_replaced_by_standard": 1, "oversized_kept": 0, "few_tracks_replaced_by_split": 0,
                                 "few_tracks_kept": 1}
    assert s["duplicate_listings"] == {"deezer 1003": ["old:0", "Album3"], "itunes 2004": ["old:1", "Album4"]}
    assert s["preview_windows"]["0"] == 10 and s["preview_windows"]["2"] == 1 and s["preview_windows"]["8+"] == 29
    assert s["new_albums_by_link_class"] == {"deezer link": 20, "no store link": 10, "apple link, no deezer": 10}
    assert rows["Album3"]["deezer_requests"] == "2" and rows["Album4"]["itunes_requests"] == "1"  # head and tracks; one lookup
    assert s["requests"] == http.asked_by and s["projection_all_new_albums"]["itunes_requests"] == sum(
        v["itunes_requests"] for v in s["by_link_class"].values())  # the sample is every new album
    assert s["projection_all_new_albums"]["seconds"] == round(
        s["requests"]["deezer"] * s["deezer_interval"] + s["requests"]["itunes"] * s["itunes_interval"])
    text = (tmp_path / "out" / "summary.md").read_text(encoding="utf-8")
    assert "No preview: 10 of 40 (25.0%)" in text and "Store metadata only" in text and "## Examples: Ambiguous" in text


def test_dry_run_stops_when_albums_keep_failing(tmp_path):
    class Down(Stores):
        def get(self, url, store, fresh=False, search=False):
            self.asked.append(url)
            raise IOError(f"giving up on {url}")

    http, lines = Down(), []
    code = dryrun.dry_run(_chart(40), tmp_path / "out", sample=40, seed=3, cache=None, audio_dir=tmp_path, http=http, out=lines.append)
    s = json.loads((tmp_path / "out" / "summary.json").read_text(encoding="utf-8"))
    assert code == 2 and len(s["api_errors"]) == dryrun.MAX_FAILED_IN_A_ROW and "failed in a row after 2 of 40" in s["stopped"]
    assert len(http.asked) == 2  # it does not insist
