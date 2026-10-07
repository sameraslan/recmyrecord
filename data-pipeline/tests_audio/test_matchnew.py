"""`rmr_audio match-new`: the albums without a row are matched and their rows written in catalog order, the
existing rows stay as they are, the order of work, the limit, --links-only, a killed or stopped run
continues, and a store that refuses stops the run. Hand-made store answers (test_linked.Stores); no network."""
import json

import pytest

pytest.importorskip("rapidfuzz")

import requests  # noqa: E402

from rmr_pipeline.audio_store import load_matches, write_matches  # noqa: E402
from rmr_audio import cli, match as matching, matchnew  # noqa: E402
from rmr_audio.catalog import Album  # noqa: E402
from rmr_audio.match import Http  # noqa: E402

from .conftest import match_row  # noqa: E402
from .test_linked import APPLE, DEEZER, LP, Stores  # noqa: E402


class NoStop(matchnew.Stop):
    def install(self):
        pass

    def restore(self):
        pass


def catalog() -> list[Album]:
    """Two of the site's albums, then nine new ones by rank: 1, 4, 7 have a Deezer link, 2, 5, 8 an Apple link
    in the Swedish store, 3, 6, 9 none."""
    old = [Album(f"old:{i}", f"Old {i}", "Artist", f"old-{i}-artist", deezer_url=DEEZER.format(900 + i)) for i in range(2)]
    new = [Album(f"Album{i}", f"Title {i}", "Artist", f"title-{i}-artist", new=True, rank=i,
                 deezer_url=DEEZER.format(1000 + i) if i % 3 == 1 else "",
                 apple_url=APPLE.format("se", 2000 + i) if i % 3 == 2 else "") for i in range(1, 10)]
    return old + new


def stores() -> Stores:
    """Every linked listing; album 3 is found by the search, 6 and 9 by nobody; 7 has no preview anywhere."""
    http = Stores()
    for i in (1, 4, 7):
        http.deezer(1000 + i, f"Title {i}", "Artist", 70 + i, LP, previews=0 if i == 7 else None)
    for i in (2, 5, 8):
        http.itunes(2000 + i, f"Title {i}", "Artist", 90 + i, LP, cc="se")
    http.deezer(5003, "Title 3", "Artist", 99, LP).deezer_search('artist:"Artist" album:"Title 3"', [5003])
    return http


@pytest.fixture
def audio(tmp_path):
    d = tmp_path / "audio"
    write_matches(d / "matches.csv", [match_row("old:0", "deezer", "1001"), match_row("old:1", "")])
    return d


def run(audio, http=None, **kw):
    lines = []
    code = matchnew.match_new(catalog(), audio, None, http=http or stores(), out=lines.append, stop=NoStop(), **kw)
    return code, lines


def test_the_new_albums_get_their_rows_in_catalog_order_and_the_old_rows_stay_as_they_are(audio):
    before = (audio / "matches.csv").read_bytes()
    code, lines = run(audio)
    assert code == 0
    after = (audio / "matches.csv").read_bytes()
    assert after.startswith(before) and [p.name for p in audio.iterdir()] == ["matches.csv"]  # nothing else is written
    rows = load_matches(audio / "matches.csv")
    assert [r["key"] for r in rows] == [al.key for al in catalog()]
    by = {r["key"]: r for r in rows}
    assert (by["Album1"]["source"], by["Album1"]["source_album_id"], by["Album1"]["matched_by"]) == ("deezer", "1001", "deezer_id")
    assert (by["Album2"]["source"], by["Album2"]["matched_by"]) == ("itunes:se", "apple_id")
    assert (by["Album3"]["source_album_id"], by["Album3"]["matched_by"]) == ("5003", "search")
    assert by["Album6"]["source"] == "" and by["Album7"]["n_clips_available"] == "0"
    assert all(r["short_preview"] == "" for r in rows) and by["Album1"]["runtime_s"] == "2400"
    text = "\n".join(lines)
    assert "9 albums to match (3 deezer link, 3 apple link, no deezer, 3 no store link)" in lines[0]
    assert "match-new finished. 9 albums matched to the end and 0 failed" in text
    assert "matches.csv: 11 rows (2 before this run, 9 written by it); 0 catalog albums still without a row" in text
    assert "by path: deezer direct 3, apple direct 3, unmatched 2, text search 1" in text
    assert "no preview: 3 of 9 (2 with no listing, 1 with a listing that has no preview)" in text
    assert "duplicate listing\tdeezer 1001\told:0, Album1" in lines and "ETA 0h00m" in text


def test_albums_with_a_deezer_link_come_first_then_apple_then_no_link(audio):
    http = stores()
    assert run(audio, http, limit=4)[0] == 0
    assert [r["key"] for r in load_matches(audio / "matches.csv")] == ["old:0", "old:1", "Album1", "Album2", "Album4", "Album7"]
    assert not any(f"id={n}" in url for n in (2005, 2008) for url in http.asked)  # the albums beyond the limit are not asked for
    code, lines = run(audio, links_only=True)
    assert code == 0 and "3 without a link left out (--links-only)" in lines[0] and "2 albums to match" in lines[0]
    assert [r["key"] for r in load_matches(audio / "matches.csv")][2:] == ["Album1", "Album2", "Album4", "Album5", "Album7", "Album8"]
    assert any("3 catalog albums still without a row (3 no store link)" in line for line in lines)


def test_a_run_continues_where_the_last_one_stopped_and_asks_for_nothing_twice(audio):
    first = stores()
    assert run(audio, first, limit=5)[0] == 0
    done = {r["key"] for r in load_matches(audio / "matches.csv")}
    second = stores()
    code, lines = run(audio, second)
    assert code == 0 and "4 albums to match" in lines[0]
    assert not {url for url in second.asked if "/search" not in url} & set(first.asked)  # the albums done are not asked for again
    assert {r["key"] for r in load_matches(audio / "matches.csv")} - done == {"Album3", "Album6", "Album8", "Album9"}
    code, lines = run(audio, third := stores())
    assert code == 0 and "0 albums to match" in lines[0] and third.asked == []


def test_rows_are_written_every_few_albums_and_on_an_interrupt(audio):
    class Interrupted(Stores):
        """Ctrl-C while the fifth album is being matched."""

        def get(self, url, store, fresh=False, search=False):
            if "album/1007" in url:
                self.stop()
                raise IOError("interrupted")
            return super().get(url, store, fresh, search)

    http, stop, lines = Interrupted(), NoStop(), []
    for i in (1, 4, 7):
        http.deezer(1000 + i, f"Title {i}", "Artist", 70 + i, LP)
    written = []
    real = matchnew.write_matches
    http.stop = stop
    try:
        matchnew.write_matches = lambda path, rows: (written.append(len(rows)), real(path, rows))
        code = matchnew.match_new(catalog(), audio, None, http=http, out=lines.append, stop=stop, save_every=1)
    finally:
        matchnew.write_matches = real
    assert code == 130 and written == [3, 4] and any("match-new interrupted" in line for line in lines)
    assert [r["key"] for r in load_matches(audio / "matches.csv")] == ["old:0", "old:1", "Album1", "Album4"]
    assert lines[-1].startswith("run match-new again to continue") and not list(audio.glob(".*"))


def test_a_skipped_album_gets_no_row_and_a_forced_listing_is_read_from_its_store(audio):
    (audio / "match_overrides.json").write_text(json.dumps({
        "Album1": {"skip": True, "note": "n"}, "Album6": {"source": "deezer", "album_id": "5003", "note": "n"}}))
    code, lines = run(audio, links_only=True)
    by = {r["key"]: r for r in load_matches(audio / "matches.csv")}
    assert code == 0 and "Album1" not in by and "1 skipped by match_overrides.json" in lines[0]
    assert (by["Album6"]["source_album_id"], by["Album6"]["matched_by"]) == ("5003", "override")


def refusing(tmp_path, status_of):
    """An Http whose requests are answered by `status_of(url)`: a status code, or a payload."""
    http = Http(None, attempts=2, sleep=lambda s: None)
    http.throttles["deezer"].interval = http.throttles["itunes"].interval = 0.0
    canned = stores()

    class Reply:
        def __init__(self, url):
            got = status_of(url)
            self.status_code, self.payload = (got, {}) if isinstance(got, int) else (200, got or canned.get(url, ""))

        def json(self):
            return self.payload

    class Session:
        asked: list = []

        def get(self, url, timeout=None):
            self.asked.append(url)
            return Reply(url)

    http.session = Session()
    return http


def test_a_rate_limit_stops_the_run_which_writes_what_it_has(audio, tmp_path):
    http = refusing(tmp_path, lambda url: 429 if "album/1004" in url else None)
    code, lines = run(audio, http)
    assert code == 2 and http.limited == {"deezer": 2}
    assert http.session.asked.count("https://api.deezer.com/album/1004") == 2  # one retry, then it does not insist
    assert [r["key"] for r in load_matches(audio / "matches.csv")] == ["old:0", "old:1", "Album1"]
    text = "\n".join(lines)
    assert "STOPPED: deezer answered a rate limit and the retry was refused too" in text and "failed\tAlbum4" in text
    assert "1 albums failed and have no row" in text and lines[-1].startswith("run match-new again")


def test_a_quota_answer_counts_as_a_rate_limit_and_a_few_of_them_stop_the_run(audio, tmp_path, monkeypatch):
    seen = set()

    def quota_once(url):  # Deezer's quota error, sent as 200, the first time each URL is asked
        if "deezer" in url and url not in seen:
            seen.add(url)
            return {"error": {"type": "Exception", "message": "Quota limit exceeded", "code": 4}}

    monkeypatch.setattr(matchnew, "RATE_LIMIT_MAX", 3)
    http = refusing(tmp_path, quota_once)
    code, lines = run(audio, http)
    assert code == 2 and http.limited["deezer"] >= 3 and any("STOPPED: deezer answered 3 rate limits in this run" in li for li in lines)
    assert [r["key"] for r in load_matches(audio / "matches.csv")][2:] == ["Album1", "Album4"]  # the retries went through


def test_a_store_that_is_down_stops_the_run(audio, tmp_path):
    http = refusing(tmp_path, lambda url: 503 if "deezer" in url else None)
    http.failed["deezer"] = matching.STORE_DOWN_AFTER - 1
    code, lines = run(audio, http)
    assert code == 2 and any("STOPPED: deezer stopped answering" in line for line in lines)
    assert [r["key"] for r in load_matches(audio / "matches.csv")] == ["old:0", "old:1"] and not http.limited["deezer"]


def test_an_album_the_matcher_cannot_read_is_reported_and_the_run_goes_on(audio, monkeypatch):
    real = matching.match_album

    def odd(http, al, storefronts):
        if al.key == "Album4":
            raise KeyError("artist")
        return real(http, al, storefronts)

    monkeypatch.setattr(matching, "match_album", odd)
    code, lines = run(audio)
    assert code == 0 and "Album4" not in {r["key"] for r in load_matches(audio / "matches.csv")}
    assert any(line.startswith("failed\tAlbum4") for line in lines) and len(load_matches(audio / "matches.csv")) == 10


def test_fetch_tells_a_rate_limit_from_another_failure():
    http = refusing(None, lambda url: {"u429": 429, "u403": 403, "u500": 500}.get(url, {"error": {"code": 700, "message": "busy"}}))
    for url, limited in (("u429", True), ("u403", True), ("u500", False), ("busy", False)):
        with pytest.raises(requests.HTTPError) as e:
            http.fetch(url)
        assert isinstance(e.value, matching.RateLimited) == limited


def test_one_run_at_a_time_and_the_cli(audio, tmp_path, capsys):
    import fcntl

    cache = tmp_path / "cache" / "http.sqlite"
    cache.parent.mkdir()
    with open(cache.with_name("match-new.lock"), "a") as held:
        fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert matchnew.match_new(catalog(), audio, cache, http=stores(), out=lambda s: None, stop=NoStop()) == 1
    assert "held by a running match-new" in capsys.readouterr().err
    args = cli.parser().parse_args(["match-new", "--limit", "25", "--links-only", "--audio-dir", str(audio)])
    assert (args.limit, args.links_only, args.deezer_interval, args.itunes_interval, args.save_every) == (25, True, 0.35, 3.4, 25)


def test_the_eta_uses_the_dry_runs_requests_until_a_class_has_been_seen():
    from collections import Counter

    left = Counter({"deezer link": 100, "no store link": 10})
    assert matchnew.eta_seconds(left, {}, 0.35, 3.4) == pytest.approx(100 * (2.12 * 0.35 + 0.03 * 3.4) + 10 * (3.93 * 0.35 + 8.02 * 3.4))
    seen = {"deezer link": [20, 40, 0], "no store link": [3, 0, 0]}
    assert matchnew.eta_seconds(left, seen, 1.0, 3.4) == pytest.approx(100 * 2.0 + 10 * (3.93 + 8.02 * 3.4))
