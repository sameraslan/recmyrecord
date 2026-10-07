"""The last-resort cover tier: MusicBrainz (which release group is the album) and the Cover Art Archive (its
front image). No test here uses the network: the fetcher is a fake."""
import json
import urllib.parse

import pytest
from PIL import Image

from rmr_pipeline import covers as cv
from rmr_pipeline.catalog import last_resort_covers, new_album_covers
from rmr_pipeline.validate import COVER_RE, PREFIXED_COVER_RE

from test_covers import Clock, Net, fetcher

M1 = "a415fc9b-1516-303e-b354-fc3a5b269f1b"
M2 = "0aa6bdbd-b8fe-3640-a14e-5729fecb3d5e"
M3 = "bc1d192c-5e81-34a9-9118-3b5a23cdde08"


def album(rym_id="Album1", artist="The KLF", title="Chill Out", year="1990", **more):
    row = {"rym_id": rym_id, "artist": artist, "title": title, "artist_latin": "", "title_latin": "", "rym_artist": "",
           "rym_title": "", "year": year, "legacy_uri": "", "spotify_url": "", "apple_music_url": "", "deezer_url": "",
           "bandcamp_url": "", "youtube_url": ""}
    return {**row, **more}


def group(mbid=M1, title="Chill Out", artist="The KLF", date="1990-02-05", primary="Album", secondary=(), score=100, **more):
    credit = [{"name": a, "artist": {"name": a, "sort-name": a}} for a in ([artist] if isinstance(artist, str) else artist)]
    return {"id": mbid, "title": title, "score": score, "first-release-date": date, "primary-type": primary,
            "secondary-types": list(secondary), "artist-credit": credit, **more}


def search(*groups):
    return json.dumps({"count": len(groups), "release-groups": list(groups)}).encode()


def listing(front=True):
    return json.dumps({"images": [{"front": False, "types": ["Back"]}, {"front": front, "types": ["Front"]}]}).encode()


def cands(*groups):
    return cv.mb_release_groups(search(*groups))


def choose(row, *groups):
    decision, cand, _why = cv.mb_choose(row, cands(*groups))
    return decision, cand and cand["mbid"]


# --- folding and queries ---------------------------------------------------------------------------

def test_folding_drops_case_accents_punctuation_and_edition_brackets():
    assert cv.fold_name("Magia obłoków") == "magia oblokow"
    assert cv.fold_name("'Live' at the Apollo!") == "live at the apollo"
    assert cv.fold_name("The Wall") == "wall" and cv.fold_name("The The", artist=True) == "the the"
    assert cv.fold_name("Simon & Garfunkel", artist=True) == "simon and garfunkel"
    assert cv.fold_name("The Jimi Hendrix Experience", artist=True) == "jimi hendrix experience"
    assert cv.fold_title("Chill Out (Remastered 2011)") == cv.fold_title("Chill Out") == "chill out"
    assert cv.fold_title("OK Computer [Deluxe Edition]") == "ok computer"
    assert cv.fold_title("Mother (マザー)") != cv.fold_title("Mother")  # not an edition: the bracket stays
    assert cv.fold_title("?") == "?" and cv.fold_title("Demo?") == "demo"  # a title of punctuation alone is kept
    assert cv.fold_title("パーフェクト・ブルー") == cv.fold_title("パーフェクト ブルー") != ""


def test_the_query_is_a_lucene_phrase_search_by_title_and_artist():
    url = cv.mb_search_url('Say "Hi"', "AC/DC")
    assert url.startswith("https://musicbrainz.org/ws/2/release-group/?query=") and url.endswith("&fmt=json&limit=25")
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["query"][0]
    assert query == 'releasegroup:"Say \\"Hi\\"" AND artist:"AC/DC"'
    assert cv.allowed(url)


def test_queries_native_spelling_first():
    assert cv.mb_queries(album()) == [("Chill Out", "The KLF")]


def test_queries_then_the_latin_forms():
    row = album(artist="不失者", title="1st", artist_latin="Fushitsusha")
    assert cv.mb_queries(row) == [("1st", "不失者"), ("1st", "Fushitsusha")]
    row = album(artist="幾見雅博", title="パーフェクト・ブルー", artist_latin="Masahiro Ikumi", title_latin="Perfect Blue")
    assert cv.mb_queries(row) == [("パーフェクト・ブルー", "幾見雅博"), ("Perfect Blue", "Masahiro Ikumi")]
    # an existing album's artist is shown as `native [Latin]`: the two spellings are asked apart
    row = album(artist="青葉市子 [Ichiko Aoba]", title="0%", artist_latin="Ichiko Aoba", rym_artist="青葉市子")
    assert cv.mb_queries(row) == [("0%", "青葉市子"), ("0%", "Ichiko Aoba")]
    # the sheet's spelling of an existing album, where the feature table's differs
    row = album(artist="Hendrix", title="Live at the Fillmore East", rym_artist="Jimi Hendrix", rym_title="Live at the Fillmore East")
    assert cv.mb_queries(row) == [("Live at the Fillmore East", "Hendrix"), ("Live at the Fillmore East", "Jimi Hendrix")]


def test_queries_then_the_first_billed_artist_of_a_shared_credit():
    row = album(artist="石川淳 & 安藤浩和", title="星のカービィ", artist_latin="Jun Ishikawa & Hirokazu Ando", title_latin="Kirby")
    assert cv.mb_queries(row) == [("星のカービィ", "石川淳 & 安藤浩和"), ("Kirby", "Jun Ishikawa & Hirokazu Ando"),
                                  ("星のカービィ", "石川淳"), ("Kirby", "Jun Ishikawa")]
    row = album(artist="Elton John / Tim Rice / Hans Zimmer", title="The Lion King")
    assert cv.mb_queries(row) == [("The Lion King", "Elton John / Tim Rice / Hans Zimmer"), ("The Lion King", "Elton John")]


# --- the acceptance rule ---------------------------------------------------------------------------

def test_accepts_the_same_title_artist_and_year():
    assert choose(album(), group()) == ("found", M1)
    assert choose(album(title="chill out!", artist="KLF"), group()) == ("found", M1)  # folded
    assert choose(album(year="1991"), group()) == ("found", M1)  # a year apart
    assert choose(album(year=""), group()) == ("found", M1) and choose(album(), group(date="")) == ("found", M1)  # no year to compare
    assert choose(album(), group(title="Chill Out (Remastered)")) == ("found", M1)


def test_accepts_in_either_spelling():
    row = album(artist="幾見雅博 & 吉田裕二", title="パーフェクト・ブルー", artist_latin="Masahiro Ikumi & Yuji Yoshida",
                title_latin="Perfect Blue", year="1998")
    assert choose(row, group(title="Perfect Blue", artist="Masahiro Ikumi", date="1998")) == ("found", M1)
    assert choose(row, group(title="パーフェクト・ブルー", artist=["吉田裕二", "幾見雅博"], date="1998")) == ("found", M1)
    # an artist's alias on MusicBrainz counts as one of its names
    aliased = group(title="Perfect Blue", date="1998", artist="IKUMI Masahiro")
    aliased["artist-credit"][0]["artist"]["aliases"] = [{"name": "幾見雅博"}]
    assert choose(row, aliased) == ("found", M1)


def test_refuses_a_wrong_year():
    decision, cand, why = cv.mb_choose(album(year="1994"), cands(group()))
    assert (decision, cand) == ("none", None) and "year" in why


def test_refuses_a_wrong_artist():
    decision, cand, why = cv.mb_choose(album(), cands(group(artist="The Orb")))
    assert (decision, cand) == ("none", None) and "artist" in why
    # one billed name in common is enough; a name that only contains one is not
    shared = album(artist="Otis Redding & The Jimi Hendrix Experience")
    assert choose(shared, group(artist="Jimi Hendrix Experience"))[0] == "found"
    assert choose(shared, group(artist="Jimi Hendrix"))[0] == "none"


def test_refuses_another_title():
    for title in ("Chill Out 2", "Chill", "Chill Out: Live", "Chill Out (Live in Tokyo)"):
        decision, _, why = cv.mb_choose(album(), cands(group(title=title)))
        assert decision == "none" and "title" in why, title


def test_an_album_is_preferred_over_an_ep_a_single_and_the_rest():
    row = album()
    assert choose(row, group(M2, primary="Single"), group(M1), group(M3, primary="EP")) == ("found", M1)
    assert choose(row, group(M2, primary="Single"), group(M3, primary="EP")) == ("found", M3)
    assert choose(row, group(M2, primary="Other"), group(M3, primary="Single")) == ("found", M3)


def test_of_several_alike_the_earliest_is_taken():
    row = album()
    assert choose(row, group(M2, date="1990-06-01"), group(M1, date="1990-02-05")) == ("found", M1)
    assert choose(row, group(M2, date="1990"), group(M1, date="1990-02-05")) == ("found", M1)


def test_a_title_that_is_the_albums_to_the_letter_is_preferred():
    """"0%" and "0" fold alike (punctuation is dropped). When one of the accepted titles is the album's as
    written, the others are not considered."""
    row = album(artist="青葉市子", title="0%", year="2014")
    live, studio = group(M1, title="0%", artist="青葉市子", date="2014-01-29", secondary=["Live"]), group(M2, title="0", artist="青葉市子", date="2013-10-23")
    assert choose(row, studio, live) == ("found", M1)
    assert choose(row, studio) == ("found", M2)  # alone, the folded title is enough
    assert choose(album(title="chill out"), group(M1, title="Chill Out!"), group(M2, title="Chill Out", secondary=["Live"])) == ("found", M2)


def test_two_that_look_different_are_ambiguous():
    row = album()
    assert choose(row, group(M1), group(M2, secondary=["Live"])) == ("ambiguous", None)  # a studio and a live album
    assert choose(row, group(M1, date="1990"), group(M2, date="1991")) == ("ambiguous", None)  # two years
    assert choose(row, group(M1), group(M2, artist=["The KLF", "The Orb"])) == ("ambiguous", None)  # two credits
    decision, cand, why = cv.mb_choose(row, cands(group(M1), group(M2, secondary=["Live"])))
    assert M1 in why and M2 in why
    # ... but a single of the same name does not make the album ambiguous
    assert choose(row, group(M1), group(M2, primary="Single", date="1991")) == ("found", M1)


def test_a_search_answer_without_release_groups_is_none():
    assert cv.mb_choose(album(), cv.mb_release_groups(b'{"release-groups": []}'))[0] == "none"
    assert cv.mb_release_groups(b'{"release-groups": [{"id": "not-an-mbid", "title": "x"}]}') == []
    with pytest.raises(ValueError):
        cv.mb_release_groups(b"<html>")


# --- the `ca:` forms and the allow-list ----------------------------------------------------------------

def test_the_ca_forms():
    assert cv.c_field("caa", M1) == f"ca:{M1}"
    assert cv.cover_url(f"ca:{M1}", 64) == cv.cover_url(f"ca:{M1}", 250) == f"https://coverartarchive.org/release-group/{M1}/front-250"
    assert cv.cover_url(f"ca:{M1}", 300) == cv.cover_url(f"ca:{M1}", 640) == f"https://coverartarchive.org/release-group/{M1}/front-500"
    assert cv.sprite_url("caa", M1) == f"https://coverartarchive.org/release-group/{M1}/front-250"
    assert cv.caa_listing_url(M1) == f"https://coverartarchive.org/release-group/{M1}"
    assert cv.made_from(("caa", M1)) == f"caa:{M1}"
    assert PREFIXED_COVER_RE.fullmatch(f"ca:{M1}") and not COVER_RE.fullmatch(f"ca:{M1}")
    for bad in ("ca:", "ca:" + M1.upper(), "ca:" + M1.replace("-", ""), f"ca:{M1}/front", f"ca:{M1}\n", "ca:../x"):
        assert not PREFIXED_COVER_RE.fullmatch(bad), bad


def test_the_allow_list_has_the_archive_and_its_redirect_hosts_only():
    for url in ("https://musicbrainz.org/ws/2/release-group/?query=x", f"https://coverartarchive.org/release-group/{M1}/front-250",
                "https://archive.org/download/mbid-x/mbid-x-1_thumb250.jpg",
                "https://ia800509.us.archive.org/3/items/mbid-x/mbid-x-1_thumb250.jpg", "https://dn721803.ca.archive.org/0/items/x/y.jpg"):
        assert cv.allowed(url), url
    for url in ("http://coverartarchive.org/release-group/x", "https://evilarchive.org/x", "https://archive.org.evil.com/x",
                "https://.archive.org/x", "https://beta.musicbrainz.org/x", "https://musicbrainz.org.evil.com/",
                "https://rateyourmusic.com/release/album/x", "https://web.archive.org:8443/x", "https://user@archive.org/x"):
        assert not cv.allowed(url), url


def test_a_redirect_off_the_allow_list_is_still_refused():
    def away(url, max_bytes):
        cv.check_host("https://example.com/cover.jpg")  # what the redirect handler does with the new URL
    with pytest.raises(cv.Gone, match="not on the allow-list"):
        fetcher(away).get(cv.sprite_url("caa", M1))
    handler = cv._CheckedRedirects()
    with pytest.raises(cv.HostNotAllowed):
        handler.redirect_request(None, None, 302, "Found", {}, "https://example.com/cover.jpg")
    with pytest.raises(cv.HostNotAllowed):
        handler.redirect_request(None, None, 302, "Found", {}, "http://archive.org/download/x.jpg")  # not https


# --- the lookup ------------------------------------------------------------------------------------

def urls(row):
    return [cv.mb_search_url(t, a) for t, a in cv.mb_queries(row)]


class MB(Net):
    """Net, with an empty search answer for a MusicBrainz address it has no page for."""

    def __call__(self, url, max_bytes):
        if url not in self.pages and url.startswith("https://musicbrainz.org/"):
            self.asked.append(url)
            return 200, search()
        return super().__call__(url, max_bytes)


def run_caa(tmp_path, rows, net, clock=None, **kw):
    clock = clock or Clock()
    f = cv.Fetcher(cv.CAA_INTERVALS, fetch=net, sleep=clock.sleep, clock=clock.now)
    lines = []
    code = cv.run_caa(rows, tmp_path / "covers_caa.csv", tmp_path / "state.json", f, out=lines.append, **kw)
    return code, cv.read_caa(tmp_path / "covers_caa.csv"), cv.State(tmp_path / "state.json").caa, lines


def test_a_found_album_is_recorded_with_what_it_matched(tmp_path):
    row = album()
    net = Net({urls(row)[0]: search(group(score=97)), cv.caa_listing_url(M1): listing()})
    code, table, state, lines = run_caa(tmp_path, [row], net)
    assert code == 0 and net.asked == [urls(row)[0], cv.caa_listing_url(M1)]
    assert table == {"Album1": {"rym_id": "Album1", "mbid": M1, "mb_title": "Chill Out", "mb_artist": "The KLF",
                                "mb_year": "1990", "mb_type": "Album", "score": "97", "matched_by": "auto"}}
    assert state["Album1"]["decision"] == "found" and state["Album1"]["mbid"] == M1 and state["Album1"]["score"] == 97
    assert (tmp_path / "covers_caa.csv").read_text().splitlines()[0] == "rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score,matched_by"
    assert any("1 found" in line for line in lines)


def test_the_later_spellings_are_asked_only_while_nothing_is_accepted(tmp_path):
    row = album(artist="石川淳 & 安藤浩和", title="星のカービィ", artist_latin="Jun Ishikawa & Hirokazu Ando", title_latin="Kirby",
                year="2009")
    u = urls(row)
    net = MB({u[0]: search(), u[1]: search(group(title="Kirby 2", artist="Jun Ishikawa", date="2009")),
               u[2]: search(group(M2, title="星のカービィ", artist="石川淳", date="2009")), cv.caa_listing_url(M2): listing()})
    code, table, state, _ = run_caa(tmp_path, [row], net)
    assert net.asked == [u[0], u[1], u[2], cv.caa_listing_url(M2)]  # the fourth spelling is not asked
    assert table["Album1"]["mbid"] == M2 and state["Album1"]["queries"] == 3


def test_the_title_alone_is_asked_last_and_judged_by_the_same_rule(tmp_path):
    """MusicBrainz's artist field does not find 芸能山城組 by "Geinoh Yamashirogumi"; a search on the title does,
    and the answer carries the artist's aliases. What is accepted does not change."""
    row = album(artist="Geinoh Yamashirogumi", title="Symphonic Suite AKIRA", title_latin="Akira Suite", year="1988")
    assert cv.mb_search_urls(row) == urls(row) + [cv.mb_title_url("Symphonic Suite AKIRA"), cv.mb_title_url("Akira Suite")]
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(cv.mb_title_url('A "B"')).query)["query"][0]
    assert query == 'releasegroup:"A \\"B\\""'
    theirs = group(M2, title="Symphonic Suite AKIRA", artist="芸能山城組", date="1988-07-27", secondary=["Soundtrack"])
    theirs["artist-credit"][0]["artist"]["aliases"] = [{"name": "Geinoh Yamashirogumi"}]
    other = group(M3, title="Symphonic Suite AKIRA", artist="Someone Else", date="1988")
    net = MB({cv.mb_title_url("Symphonic Suite AKIRA"): search(other, theirs), cv.caa_listing_url(M2): listing()})
    code, table, state, _ = run_caa(tmp_path, [row], net)
    assert net.asked == urls(row) + [cv.mb_title_url("Symphonic Suite AKIRA"), cv.caa_listing_url(M2)]
    assert table["Album1"]["mbid"] == M2 and table["Album1"]["mb_type"] == "Album+Soundtrack"


def test_none_ambiguous_and_no_art_are_recorded_and_give_no_row(tmp_path):
    none, amb, bare, backless = album("A"), album("B", title="Other"), album("C", title="Third"), album("D", title="Fourth")
    net = MB({urls(none)[0]: search(group(artist="The Orb", score=88)),
               urls(amb)[0]: search(group(M1, title="Other"), group(M2, title="Other", secondary=["Live"])),
               urls(bare)[0]: search(group(M3, title="Third")),  # the archive answers 404: no art
               urls(backless)[0]: search(group(M2, title="Fourth")), cv.caa_listing_url(M2): listing(front=False)})
    code, table, state, lines = run_caa(tmp_path, [none, amb, bare, backless], net)
    assert code == 0 and table == {}
    assert [state[k]["decision"] for k in "ABCD"] == ["none", "ambiguous", "no art", "no art"]
    assert state["A"]["score"] == 88 and "artist" in state["A"]["why"]  # the best score among what was refused
    assert state["C"]["mbid"] == M3 and state["D"]["mbid"] == M2  # what had no art
    assert cv.caa_listing_url(M1) not in net.asked  # nothing is asked from the archive for an ambiguous album
    assert any("1 none, 1 ambiguous, 2 no art" in line for line in lines)


def test_a_rerun_asks_nothing_twice(tmp_path):
    found, none = album("A"), album("B", title="Other")
    pages = {urls(found)[0]: search(group()), cv.caa_listing_url(M1): listing(), urls(none)[0]: search()}
    run_caa(tmp_path, [found, none], MB(pages))
    again = MB(pages)
    code, table, state, _ = run_caa(tmp_path, [found, none], again)
    assert code == 0 and again.asked == [] and list(table) == ["A"] and state["B"]["decision"] == "none"
    # --retry-failed asks again for what was not found, never for what was
    retry = MB(pages | {urls(none)[0]: search(group(M2, title="Other")), cv.caa_listing_url(M2): listing()})
    code, table, state, _ = run_caa(tmp_path, [found, none], retry, retry_failed=True)
    assert retry.asked == [urls(none)[0], cv.caa_listing_url(M2)] and table["B"]["mbid"] == M2 and state["B"]["decision"] == "found"
    # a committed table without the state file (another machine): the found albums are not asked again
    (tmp_path / "state.json").unlink()
    fresh = Net(pages)
    run_caa(tmp_path, [found], fresh)
    assert fresh.asked == []


def test_an_unanswered_request_is_not_recorded_and_is_asked_again(tmp_path):
    row = album()
    code, table, state, lines = run_caa(tmp_path, [row], Net({urls(row)[0]: 500}))
    assert code == 0 and table == {} and state == {} and any("asked again" in line for line in lines)
    net = Net({urls(row)[0]: search(group()), cv.caa_listing_url(M1): listing()})
    assert run_caa(tmp_path, [row], net)[1]["Album1"]["mbid"] == M1


def test_an_interrupted_run_keeps_what_it_found_and_goes_on_from_there(tmp_path):
    rows = [album("A"), album("B", title="Other"), album("C", title="Third")]
    pages = {urls(rows[0])[0]: search(group()), cv.caa_listing_url(M1): listing(),
             urls(rows[1])[0]: search(group(M2, title="Other")), cv.caa_listing_url(M2): listing(),
             urls(rows[2])[0]: search(group(M3, title="Third")), cv.caa_listing_url(M3): listing()}
    net = Net(pages)
    code, table, state, _ = run_caa(tmp_path, rows, net, stop=lambda: len(net.asked) >= 2)
    assert code == 130 and list(table) == ["A"]
    net2 = Net(pages)
    code, table, _, _ = run_caa(tmp_path, rows, net2)
    assert code == 0 and list(table) == ["A", "B", "C"] and urls(rows[0])[0] not in net2.asked and len(net2.asked) == 4


def test_musicbrainz_is_asked_at_most_once_a_second(tmp_path):
    rows = [album(f"A{i}", title=f"Title {i}", artist="不失者", artist_latin="Fushitsusha") for i in range(4)]
    clock = Clock()

    class Timed(Net):
        def __call__(self, url, max_bytes):
            self.at = getattr(self, "at", []) + [(urllib.parse.urlsplit(url).hostname, clock.t)]
            return super().__call__(url, max_bytes)

    net = Timed(default=(200, search()))
    code, *_ = run_caa(tmp_path, rows, net, clock=clock)
    times = [t for host, t in net.at if host == "musicbrainz.org"]
    assert code == 0 and len(times) == 12  # two spellings each, then the title alone
    assert all(b - a >= 1.0 for a, b in zip(times, times[1:]))
    assert cv.CAA_INTERVALS["musicbrainz.org"] >= 1.0
    assert "github.com/sameraslan/recmyrecord" in cv.USER_AGENT  # MusicBrainz wants the application and a contact


def test_a_503_from_musicbrainz_stops_the_run_after_one_longer_wait(tmp_path):
    rows = [album("A"), album("B", title="Other")]
    clock = Clock()
    net = Net(default=503)
    code, table, state, lines = run_caa(tmp_path, rows, net, clock=clock)
    assert code == 2 and len(net.asked) == 2 and set(net.asked) == {urls(rows[0])[0]}  # one retry, then nothing more
    assert clock.t >= cv.MB_BUSY_WAIT > cv.RETRY_S and table == {} and state == {}
    assert any("stopped" in line and "503" in line for line in lines)
    # one 503 followed by an answer is not a stop
    answers = iter([503, (200, search(group())), (200, listing())])
    net = Net(default=lambda url: next(answers))
    code, table, _, _ = run_caa(tmp_path, [rows[0]], net)
    assert code == 0 and table["A"]["mbid"] == M1


def test_one_caa_run_at_a_time(tmp_path):
    lock = cv.take_lock(cv.lock_path(tmp_path / "state.json", "refs"))
    try:
        code, table, _, lines = run_caa(tmp_path, [album()], Net())
        assert code == 1 and table == {} and "held by another" in lines[0]
    finally:
        lock.close()


# --- who is asked -----------------------------------------------------------------------------------

def inputs(rows, **kw):
    return cv.Inputs(rows, {}, {}, {}, {}, **kw)


def test_only_an_album_that_would_end_with_no_cover_is_asked(tmp_path):
    yt = "https://www.youtube.com/watch?v=aaaaaaaaaaa"
    rows = [album("Has"), album("NoSource"), album("Gone", youtube_url=yt), album("Skipped", youtube_url=yt),
            album("Pending", bandcamp_url="https://x.bandcamp.com/album/y"),
            album("Unverified", legacy_uri="spotify:album:" + "1" * 22), album("sp:" + "2" * 22, legacy_uri="spotify:album:" + "2" * 22),
            album("Existing", legacy_uri="spotify:album:" + "3" * 22)]
    covers = {"Has": ("bandcamp", "5"), "Gone": ("youtube", "aaaaaaaaaaa"), "Skipped": ("youtube", "aaaaaaaaaaa")}
    state = cv.State(tmp_path / "state.json")
    state.sprites["Gone"] = {"of": "youtube:aaaaaaaaaaa", "why": "HTTP 404"}
    state.refs["NoSource"] = {"spotify": "HTTP 404"}
    got = cv.caa_candidates(rows, inputs(rows), covers, {("Skipped", "youtube:aaaaaaaaaaa")}, state, tmp_path / "96", {},
                            unverified={"Unverified"}, bare={"sp:" + "2" * 22})
    assert [(r["rym_id"], why) for r, why in got] == [
        ("NoSource", "no source"), ("Gone", "gone"), ("Skipped", "skipped"),
        ("Unverified", "unverified link"), ("sp:" + "2" * 22, "no cover id")]
    # `Pending` has a Bandcamp page nobody has asked yet: a better source may still answer


def test_the_existing_albums_without_a_cover_come_from_the_committed_lists(tmp_path):
    rows = [album("Album7", legacy_uri="u"), album("Album8", legacy_uri="u"), album("sp:" + "2" * 22, legacy_uri="u")]
    (tmp_path / "unverified.csv").write_text("rym_id,slug,site_id,opens,note\nAlbum8,b-x,1111111111111111111111,x,y\n")
    (tmp_path / "overrides.json").write_text(json.dumps({"c-x": {"s": "", "c": "", "image": "overrides/c.jpg"},
                                                         "a-x": {"c": "ab" * 20, "image": "overrides/a.jpg"}}))
    (tmp_path / "albums.json").write_text(json.dumps([{"slug": "a-x"}, {"slug": "b-x"}, {"slug": "c-x"}]))
    unverified, bare = cv.existing_without_cover(rows, tmp_path / "unverified.csv", tmp_path / "overrides.json", tmp_path / "albums.json")
    assert unverified == {"Album8"} and bare == {"sp:" + "2" * 22}
    assert cv.existing_without_cover(rows, tmp_path / "none.csv", tmp_path / "none.json", tmp_path / "none.json") == (set(), set())


# --- the table, the sprites and what the build reads ------------------------------------------------------

def table(tmp_path, covers="", caa="", state=None, skip="", manifest=None, sprites=()):
    (tmp_path / "96").mkdir(exist_ok=True)
    (tmp_path / "covers.csv").write_text("rym_id,source,ref\n" + covers)
    (tmp_path / "covers_caa.csv").write_text("rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score,matched_by\n" + caa)
    (tmp_path / "skip.csv").write_text("rym_id,source,ref,note\n" + skip)
    (tmp_path / "state.json").write_text(json.dumps(state or {}))
    (tmp_path / "96.manifest.json").write_text(json.dumps(manifest or {}))
    for key in sprites:
        Image.new("RGB", (96, 96), (200, 30, 30)).save(cv.sprite_path(tmp_path / "96", key))
    return cv.load_covers(tmp_path / "covers.csv", tmp_path / "96", tmp_path / "state.json", tmp_path / "skip.csv",
                          tmp_path / "covers_caa.csv")


def test_the_table_is_checked_when_read(tmp_path):
    (tmp_path / "caa.csv").write_text(f"rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score,matched_by\nA,{M1},Chill Out,The KLF,1990,Album,100,auto\n")
    assert cv.read_caa(tmp_path / "caa.csv")["A"]["mbid"] == M1 and cv.read_caa(tmp_path / "none.csv") == {}
    (tmp_path / "caa.csv").write_text("rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score,matched_by\nA,../../etc,x,y,1990,Album,100,auto\n")
    with pytest.raises(ValueError, match="MBID"):
        cv.read_caa(tmp_path / "caa.csv")
    # who chose the release group: the lookup's rule, or a reader (docs/review/caa-covers-hand.md)
    (tmp_path / "caa.csv").write_text(f"rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score,matched_by\nA,{M1},,,,,,hand\n")
    assert cv.read_caa(tmp_path / "caa.csv")["A"] == {"rym_id": "A", "mbid": M1, "mb_title": "", "mb_artist": "", "mb_year": "",
                                                      "mb_type": "", "score": "", "matched_by": "hand"}
    for bad in ("", "me"):
        (tmp_path / "caa.csv").write_text(f"rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score,matched_by\nA,{M1},t,a,1990,Album,100,{bad}\n")
        with pytest.raises(ValueError, match="matched_by"):
            cv.read_caa(tmp_path / "caa.csv")
    (tmp_path / "caa.csv").write_text(f"rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score\nA,{M1},t,a,1990,Album,100\n")
    with pytest.raises(ValueError, match="header"):  # the table of before the column
        cv.read_caa(tmp_path / "caa.csv")
    # covers.csv itself does not take the source: the tier never replaces a row
    (tmp_path / "covers.csv").write_text(f"rym_id,source,ref\nA,caa,{M1}\n")
    with pytest.raises(ValueError):
        cv.read_covers(tmp_path / "covers.csv")


def test_a_sprite_of_a_placeholder_key_has_a_safe_file_name(tmp_path):
    assert cv.sprite_path(tmp_path, "sp:" + "2" * 22) == tmp_path / ("sp_" + "2" * 22 + ".jpg")
    for bad in ("sp:../x", "a:b", "sp:", "../x"):
        with pytest.raises(ValueError):
            cv.sprite_path(tmp_path, bad)


def test_the_last_resort_never_replaces_a_cover_an_album_has(tmp_path):
    caa = f"Has,{M1},t,a,1990,Album,100,auto\nNone,{M2},t,a,1990,Album,100,auto\n"
    t = table(tmp_path, covers="Has,bandcamp,5\n", caa=caa, manifest={"Has": "bandcamp:5", "None": f"caa:{M2}"}, sprites=["Has", "None"])
    assert t.cover_for("Has") == ("bc:5", tmp_path / "96" / "Has.jpg")
    assert t.cover_for("None") == (f"ca:{M2}", tmp_path / "96" / "None.jpg")
    assert t.caa_for("Has")[0] == f"ca:{M1}" and t.caa_for("Other") == ("", None)
    assert t.last_resort(["Has", "None", "Other"]) == ["None"]


def test_a_gone_or_skipped_row_gives_way_to_the_last_resort_and_stays_in_its_table(tmp_path):
    caa = f"Gone,{M1},t,a,1990,Album,100,auto\nSkipped,{M2},t,a,1990,Album,100,auto\nWaiting,{M3},t,a,1990,Album,100,auto\n"
    t = table(tmp_path, covers="Gone,youtube,aaaaaaaaaaa\nSkipped,youtube,bbbbbbbbbbb\n", caa=caa,
              skip="Skipped,youtube,bbbbbbbbbbb,a track list\n",
              state={"sprites": {"Gone": {"of": "youtube:aaaaaaaaaaa", "why": "HTTP 404"}}},
              manifest={"Gone": f"caa:{M1}", "Skipped": "youtube:bbbbbbbbbbb"}, sprites=["Gone", "Skipped"])
    assert t.cover_for("Gone") == (f"ca:{M1}", tmp_path / "96" / "Gone.jpg") and t.is_gone("Gone")
    # the sprite on disk is still the video frame's: the cover id is there, the sprite is to be made
    assert t.cover_for("Skipped") == (f"ca:{M2}", None) and t.is_skipped("Skipped")
    assert t.cover_for("Waiting") == (f"ca:{M3}", None)
    assert cv.read_covers(tmp_path / "covers.csv") == {"Gone": ("youtube", "aaaaaaaaaaa"), "Skipped": ("youtube", "bbbbbbbbbbb")}
    covers, images, waiting = new_album_covers(["Gone", "Skipped", "Waiting", "X"], 10, cover_of=t.cover_for)
    assert covers == [f"ca:{M1}", f"ca:{M2}", f"ca:{M3}", ""] and list(images) == [10] and waiting == ["Skipped", "Waiting"]


def test_a_last_resort_row_on_the_skip_list_gives_no_cover_and_is_not_asked_again(tmp_path):
    """How the owner takes a wrong cover out: `rym_id,caa,<mbid>,note` in covers_skip.csv. The row stays in
    covers_caa.csv, so the next run does not find the same release group again."""
    t = table(tmp_path, caa=f"A,{M1},t,a,1990,Album,100,auto\nB,{M2},t,a,1990,Album,100,auto\n", skip=f"A,caa,{M1},another record's sleeve\n",
              manifest={"A": f"caa:{M1}", "B": f"caa:{M2}"}, sprites=["A", "B"])
    assert t.cover_for("A") == ("", None) and t.caa_for("A") == ("", None) and t.cover_for("B")[0] == f"ca:{M2}"
    assert cv.effective_rows({}, t.skip, t.caa, {}, tmp_path / "96", t.made_from) == {"B": ("caa", M2)}
    net = Net()
    code, rows, _, _ = run_caa(tmp_path, [album("A"), album("B")], net)
    assert code == 0 and net.asked == [] and list(rows) == ["A", "B"]
    # another release group in the row is another image: the skip no longer applies
    t = table(tmp_path, caa=f"A,{M3},t,a,1990,Album,100,auto\n", skip=f"A,caa,{M1},another record's sleeve\n")
    assert t.cover_for("A") == (f"ca:{M3}", None)


def sprite_run(tmp_path, t, net, order, **kw):
    state = cv.State(tmp_path / "state.json")
    rows = cv.effective_rows(t.rows, t.skip, t.caa, {} if kw.get("retry_failed") else t.failed, tmp_path / "96", t.made_from)
    return cv.run_sprites(rows, order, tmp_path / "96", tmp_path / "state.json", fetcher(net), out=lambda *a: None, **kw), state


def jpeg(colour=(10, 120, 200)):
    import io
    buf = io.BytesIO()
    Image.new("RGB", (250, 250), colour).save(buf, "JPEG")
    return buf.getvalue()


def test_sprites_are_made_from_the_250_px_front_image(tmp_path):
    caa = f"Gone,{M1},t,a,1990,Album,100,auto\nSkipped,{M2},t,a,1990,Album,100,auto\nsp:{'2' * 22},{M3},t,a,1990,Album,100,auto\n"
    kw = dict(covers="Gone,youtube,aaaaaaaaaaa\nSkipped,youtube,bbbbbbbbbbb\nHas,bandcamp,5\n", caa=caa,
              skip="Skipped,youtube,bbbbbbbbbbb,a track list\n",
              state={"sprites": {"Gone": {"of": "youtube:aaaaaaaaaaa", "why": "HTTP 404"}}},
              manifest={"Skipped": "youtube:bbbbbbbbbbb", "Has": "bandcamp:5"}, sprites=["Skipped", "Has"])
    t = table(tmp_path, **kw)
    net = Net({cv.sprite_url("caa", m): jpeg() for m in (M1, M2, M3)})
    order = ["Has", "Gone", "Skipped", "sp:" + "2" * 22]
    code, _ = sprite_run(tmp_path, t, net, order)
    assert code == 0 and net.asked == [cv.sprite_url("caa", m) for m in (M1, M2, M3)]  # no video frame, nothing for `Has`
    with Image.open(tmp_path / "96" / "Skipped.jpg") as im:
        assert im.size == (96, 96) and im.getpixel((48, 48))[2] > 150  # the archive's image replaced the frame
    of = cv.SpriteManifest(cv.manifest_path(tmp_path / "96")).of
    assert of == {"Gone": f"caa:{M1}", "Skipped": f"caa:{M2}", "sp:" + "2" * 22: f"caa:{M3}", "Has": "bandcamp:5"}
    t = cv.load_covers(tmp_path / "covers.csv", tmp_path / "96", tmp_path / "state.json", tmp_path / "skip.csv", tmp_path / "covers_caa.csv")
    assert t.cover_for("Gone") == (f"ca:{M1}", tmp_path / "96" / "Gone.jpg") and t.is_gone("Gone")  # the row's own failure stays recorded
    assert t.cover_for("Skipped") == (f"ca:{M2}", tmp_path / "96" / "Skipped.jpg")
    assert t.caa_for("sp:" + "2" * 22) == (f"ca:{M3}", tmp_path / "96" / ("sp_" + "2" * 22 + ".jpg"))
    again = Net()
    assert sprite_run(tmp_path, t, again, order)[0] == 0 and again.asked == []


def test_an_archive_image_that_is_gone_gives_no_cover_and_keeps_the_rows_own_record(tmp_path):
    t = table(tmp_path, covers="Gone,youtube,aaaaaaaaaaa\n", caa=f"Gone,{M1},t,a,1990,Album,100,auto\nBare,{M2},t,a,1990,Album,100,auto\n",
              state={"sprites": {"Gone": {"of": "youtube:aaaaaaaaaaa", "why": "HTTP 404"}}})
    net = Net()  # 404 for everything
    code, _ = sprite_run(tmp_path, t, net, ["Gone", "Bare"])
    state = cv.State(tmp_path / "state.json")
    assert code == 0 and state.sprites["Gone"]["of"] == "youtube:aaaaaaaaaaa"
    assert state.caa_sprites == {"Gone": {"of": f"caa:{M1}", "why": "HTTP 404"}, "Bare": {"of": f"caa:{M2}", "why": "HTTP 404"}}
    t = cv.load_covers(tmp_path / "covers.csv", tmp_path / "96", tmp_path / "state.json", None, tmp_path / "covers_caa.csv")
    assert t.cover_for("Gone") == ("", None) and t.cover_for("Bare") == ("", None) and t.caa_for("Bare") == ("", None)
    again = Net()
    sprite_run(tmp_path, t, again, ["Gone", "Bare"])
    assert again.asked == []  # not asked again without --retry-failed


# --- the build: the three groups of albums --------------------------------------------------------------

def test_a_new_album_takes_the_cover_and_its_sprite(tmp_path):
    t = table(tmp_path, caa=f"Album900,{M1},t,a,1990,Album,100,auto\n", manifest={"Album900": f"caa:{M1}"}, sprites=["Album900"])
    covers, images, waiting = new_album_covers(["Album900", "Album901"], 4081, cover_of=t.cover_for)
    assert covers == [f"ca:{M1}", ""] and images == {4081: tmp_path / "96" / "Album900.jpg"} and waiting == []


def test_an_unverified_link_album_takes_the_cover_and_its_sprite(tmp_path):
    """Its `c` is empty after the build's unverified-links step; `s` is not this function's and stays empty."""
    t = table(tmp_path, caa=f"Album8,{M1},t,a,1990,Album,100,auto\nAlbum9,{M2},t,a,1990,Album,100,auto\n",
              manifest={"Album8": f"caa:{M1}"}, sprites=["Album8"])
    keys, cover_ids = ["Album7", "Album8", "Album9", "Album10", "Album900"], ["ab" * 20, "", "", "", ""]
    got = last_resort_covers(keys, cover_ids, 4, set(), cover_of=t.caa_for)
    assert got.covers == {1: f"ca:{M1}"} and got.images == {1: tmp_path / "96" / "Album8.jpg"}
    # without its sprite the album keeps the tile: with a cover id and no file the sheets would show the map's
    # sprite, which is the wrong album's
    assert got.waiting == ["Album9"]
    assert 4 not in got.covers  # a new album is not this function's: cover_for answers for it


def test_an_album_with_an_override_image_takes_the_cover_id_and_keeps_its_sprite(tmp_path):
    """Chill Out, Gimix, Dark & Long: overrides.json gives `c` "" and an image. The row gives `c` for the album
    page, the sprite and the ambient colours stay the override image's, and no sprite file is needed."""
    t = table(tmp_path, caa=f"Album14207,{M1},Chill Out,The KLF,1990,Album,100,auto\n")
    got = last_resort_covers(["Album14207", "Album2"], ["", "cd" * 20], 2, {0}, cover_of=t.caa_for)
    assert got.covers == {0: f"ca:{M1}"} and got.images == {} and got.waiting == [] and got.own_image == [0]
    # an album that has a cover id is never touched, whatever the table says
    t = table(tmp_path, caa=f"Album2,{M1},t,a,1990,Album,100,auto\n", manifest={"Album2": f"caa:{M1}"}, sprites=["Album2"])
    assert last_resort_covers(["Album14207", "Album2"], ["", "cd" * 20], 2, {0}, cover_of=t.caa_for).covers == {}


# --- the committed table and the site data ---------------------------------------------------------------

def test_the_sites_last_resort_covers_are_the_committed_tables():
    """Every `ca:` cover of albums.json is its album's row of catalog/covers_caa.csv, the album had no cover
    otherwise (caa_candidates), and an album of unverified_links.csv keeps its empty `s`."""
    site = json.loads(cv.DEFAULT_SITE_ALBUMS.read_text(encoding="utf-8"))
    rows, caa = cv.catalog_rows(), cv.read_caa()
    with cv.DEFAULT_CAA.open(encoding="utf-8", newline="") as f:
        assert len(f.read().splitlines()) == len(caa) + 1  # no album twice
    order = [r["rym_id"] for r in rows]
    assert list(caa) == [k for k in order if k in caa]  # in catalog order
    used = {rows[i]["rym_id"]: a["c"][3:] for i, a in enumerate(site) if a["c"].startswith("ca:")}
    assert used and all(caa[k]["mbid"] == m for k, m in used.items())
    unverified, bare = cv.existing_without_cover(rows)
    assert len(unverified) == 67 and len(bare) == 3
    for i, a in enumerate(site):
        key = rows[i]["rym_id"]
        if a["c"].startswith("ca:"):
            assert PREFIXED_COVER_RE.fullmatch(a["c"]) and cv.allowed(cv.cover_url(a["c"], 96)) and cv.allowed(cv.cover_url(a["c"], 640))
            assert not rows[i]["legacy_uri"] or key in unverified | bare, key  # never an existing album that has a cover
            assert cv.sprite_path(cv.DEFAULT_SPRITES, key).name.endswith(".jpg")
        if key in unverified | bare:
            assert a["s"] == "" and (a["c"] == "" or a["c"].startswith("ca:")), key
    # a new album's last resort stands in for no row or for a skipped one, or (not checked here: it is in the
    # state file, which is not committed) for a row whose image is gone
    primary, skips = cv.read_covers(), cv.read_skips()
    new = [k for k in used if not rows[order.index(k)]["legacy_uri"]]
    assert sum(k not in primary for k in new) >= 30 and sum((k, cv.made_from(primary[k])) in skips for k in new if k in primary) >= 5


# --- scripts/caa_hand.py: the rows a reader chose by hand ---------------------------------------------

def _caa_hand():
    import importlib.util
    spec = importlib.util.spec_from_file_location("caa_hand", cv.PIPELINE_DIR / "scripts" / "caa_hand.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


HEAD = ",".join(cv.CAA_FIELDS) + "\n"


def _hand_files(tmp_path, pending, table=""):
    (tmp_path / "albums.csv").write_text("rym_id,artist\nAlbum1,a\nAlbum2,b\nAlbum3,c\n")
    (tmp_path / "pending.csv").write_text(HEAD + pending, encoding="utf-8")
    (tmp_path / "covers_caa.csv").write_text(HEAD + table, encoding="utf-8")


def _hand(tmp_path, net):
    lines = []
    code = _caa_hand().main(tmp_path / "pending.csv", tmp_path / "covers_caa.csv", tmp_path / "albums.csv",
                            fetcher(net, cv.CAA_INTERVALS), lines.append)
    return code, cv.read_caa(tmp_path / "covers_caa.csv"), lines


def test_a_hand_row_is_added_only_when_its_group_has_a_front_image(tmp_path):
    """A row replaces the album's row of another group (in catalog order), a group with no front image or no
    image at all is left out, and a second run asks for nothing it has added."""
    _hand_files(tmp_path, f'Album3,{M3},"T, three",A,1990,Album,,hand\nAlbum1,{M1},T1,A,1990,Album,,hand\nAlbum2,{M2},T2,A,,,,hand\n',
                f"Album3,{M2},Old,A,1990,Album,100,auto\n")
    net = Net({cv.caa_listing_url(M3): listing(), cv.caa_listing_url(M1): listing(front=False)})
    code, table, lines = _hand(tmp_path, net)
    assert code == 0 and list(table) == ["Album3"]
    assert table["Album3"] == {"rym_id": "Album3", "mbid": M3, "mb_title": "T, three", "mb_artist": "A", "mb_year": "1990",
                               "mb_type": "Album", "score": "", "matched_by": "hand"}
    assert lines[-1].startswith("1 added, 0 already there, 2 with no front image, 0 left for the next run, of 3; 3 request(s)")
    before = len(net.asked)
    net.pages[cv.caa_listing_url(M2)] = listing()
    code, table, lines = _hand(tmp_path, net)
    assert code == 0 and list(table) == ["Album2", "Album3"] and len(net.asked) == before + 2  # Album3 is not asked again
    assert lines[-1].startswith("1 added, 1 already there, 1 with no front image")


def test_a_refusing_archive_ends_the_hand_run_and_keeps_what_was_added(tmp_path):
    _hand_files(tmp_path, f"Album1,{M1},T1,A,1990,Album,,hand\nAlbum2,{M2},T2,A,1990,Album,,hand\nAlbum3,{M3},T3,A,1990,Album,,hand\n")
    net = Net({cv.caa_listing_url(M1): listing(), cv.caa_listing_url(M2): 503, cv.caa_listing_url(M3): listing()})
    code, table, lines = _hand(tmp_path, net)
    assert code == 2 and list(table) == ["Album1"]
    assert cv.caa_listing_url(M3) not in net.asked and net.asked.count(cv.caa_listing_url(M2)) == 2  # the fetcher's one retry
    assert "1 added" in lines[-1] and "2 left for the next run, of 3" in lines[-1]


def test_a_hand_row_that_is_not_a_catalog_album_or_not_hand_stops_before_any_request(tmp_path):
    for bad in (f"Album9,{M1},T,A,1990,Album,,hand\n", f"Album1,{M1},T,A,1990,Album,,auto\n", "Album1,nope,T,A,1990,Album,,hand\n"):
        _hand_files(tmp_path, bad)
        net = Net()
        with pytest.raises(SystemExit):
            _hand(tmp_path, net)
        assert not net.asked
