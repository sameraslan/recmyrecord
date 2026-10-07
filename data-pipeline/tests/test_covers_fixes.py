"""Cover sources, second pass: the stop rule on Deezer's quota error, which failures are final, redirects,
ports, rows outside the catalog, the two lock files, and the record of what each sprite was made from.
No test here uses the network or the real .cache/covers."""
import json
import os

import pytest

from rmr_pipeline import covers as cv
from test_covers import MD5, SP_ID, SP_REF, Net, album, fetcher, image_bytes, oembed, run, spotify_albums, sprites

QUOTA = json.dumps({"error": {"type": "Exception", "message": "Quota limit exceeded", "code": 4}}).encode()


def deezer_albums(n):
    return [album(f"D{i}", deezer_url=f"https://www.deezer.com/album/{i + 1}") for i in range(n)]


# --- the stop rule ----------------------------------------------------------------------------------

def test_deezers_quota_error_twice_in_a_row_stops_the_run(tmp_path):
    """It comes as HTTP 200, so the 200 must not end the row of refusals before the body is read."""
    said = []
    net = Net(default=(200, QUOTA))
    inputs = cv.Inputs(deezer_albums(5), {}, {}, {}, {})
    code = cv.run_refs(inputs, tmp_path / "covers.csv", tmp_path / "state.json", tmp_path / "96", fetcher(net), ("store",),
                       out=lambda *a: said.append(" ".join(map(str, a))))
    assert code == 2 and net.asked == [cv.deezer_url("1"), cv.deezer_url("2")]
    assert any("stopped" in line and "quota" in line and "2 times in a row" in line for line in said)
    assert json.loads((tmp_path / "state.json").read_text())["refs"] == {}  # refused, not failed: asked again next time


def test_a_good_answer_between_two_quota_errors_ends_the_row(tmp_path):
    good = json.dumps({"id": 2, "md5_image": MD5}).encode()
    net = Net({cv.deezer_url("2"): good, cv.deezer_url("4"): good}, default=(200, QUOTA))
    code, covers, net = run(tmp_path, deezer_albums(4), net, tiers=("store",))
    assert code == 0 and list(covers) == ["D1", "D3"] and len(net.asked) == 4


def test_the_fetcher_counts_a_refusal_it_reads_in_the_body():
    f = fetcher(Net(default=(200, QUOTA)))
    with pytest.raises(cv.RateLimited):
        f.get("https://api.deezer.com/album/1", refusal=cv.deezer_quota)
    with pytest.raises(cv.StopRun, match="api.deezer.com"):
        f.get("https://api.deezer.com/album/2", refusal=cv.deezer_quota)
    assert cv.deezer_quota(b'{"id": 1}') == "" and cv.deezer_quota(b"not json") == "" and cv.deezer_quota(b"[4]") == ""
    assert fetcher(Net(default=(200, b"x"))).get("https://api.deezer.com/album/1", refusal=cv.deezer_quota) == b"x"


# --- which failures are final -----------------------------------------------------------------------

@pytest.mark.parametrize("status", [404, 410])
def test_a_page_that_is_gone_is_final(status):
    with pytest.raises(cv.Gone, match=str(status)):
        fetcher(Net(default=status)).get("https://open.spotify.com/a")


@pytest.mark.parametrize("status", [204, 400, 401, 451])
def test_another_status_is_asked_again_by_the_next_run(tmp_path, status):
    f = fetcher(Net(default=status))
    with pytest.raises(cv.Transient, match=str(status)) as e:
        f.get("https://open.spotify.com/a")
    assert not isinstance(e.value, (cv.RateLimited, cv.Gone)) and f.unanswered == 0  # the host did answer
    albums, _, _ = spotify_albums(2)
    said = []
    code = cv.run_refs(cv.Inputs(albums, {}, {}, {}, {}), tmp_path / "covers.csv", tmp_path / "state.json", tmp_path / "96",
                       fetcher(Net(default=status)), ("spotify",), out=lambda *a: said.append(" ".join(map(str, a))))
    assert code == 0 and json.loads((tmp_path / "state.json").read_text())["refs"] == {}
    assert sum("not recorded" in line for line in said) == 2
    covers = {"A": ("spotify", SP_REF)}
    assert sprites(tmp_path, covers, Net(default=status)) == 0
    assert json.loads((tmp_path / "state.json").read_text())["sprites"] == {}


def test_a_store_answer_that_is_not_final_is_not_recorded_as_no_cover(tmp_path):
    code, covers, _ = run(tmp_path, deezer_albums(1), Net(default=400), tiers=("store",))
    assert code == 0 and covers == {} and json.loads((tmp_path / "state.json").read_text())["refs"] == {}
    code, covers, _ = run(tmp_path, deezer_albums(1), Net(default=404), tiers=("store",))
    assert "no cover" in json.loads((tmp_path / "state.json").read_text())["refs"]["D0"]["store"]


# --- redirects and ports ----------------------------------------------------------------------------

def off_list(url, max_bytes):
    cv.check_host("https://tracker.example/elsewhere")  # what _CheckedRedirects does with the Location of a redirect


@pytest.mark.parametrize("tier,row", [
    ("spotify", album("A", spotify_url=f"https://open.spotify.com/album/{SP_ID}")),
    ("store", album("A", deezer_url="https://www.deezer.com/album/1")),
    ("bandcamp", album("A", bandcamp_url="https://a.bandcamp.com/album/x")),
])
def test_a_redirect_to_another_host_is_a_recorded_failure_in_every_tier(tmp_path, tier, row):
    inputs = cv.Inputs([row], {}, {}, {}, {})
    code = cv.run_refs(inputs, tmp_path / "covers.csv", tmp_path / "state.json", tmp_path / "96", fetcher(off_list), (tier,),
                       out=lambda *a: None)
    assert code == 0 and cv.read_covers(tmp_path / "covers.csv") == {}
    assert tier in json.loads((tmp_path / "state.json").read_text())["refs"]["A"]


def test_a_redirected_image_is_a_recorded_failure(tmp_path):
    assert sprites(tmp_path, {"A": ("spotify", SP_REF)}, off_list) == 0
    assert "allow-list" in json.loads((tmp_path / "state.json").read_text())["sprites"]["A"]["why"]
    with pytest.raises(cv.Gone, match="allow-list"):
        fetcher(off_list).get("https://i.scdn.co/image/x")


@pytest.mark.parametrize("url,ok", [
    ("https://i.scdn.co/image/x", True), ("https://i.scdn.co:443/image/x", True), ("https://i.scdn.co:8443/image/x", False),
    ("https://a.bandcamp.com:444/album/x", False), ("https://i.scdn.co:0/image/x", False), ("https://i.scdn.co:x/image/x", False),
])
def test_only_the_default_port_is_allowed(url, ok):
    assert cv.allowed(url) is ok


def test_a_name_with_a_newline_is_not_a_file_name(tmp_path):
    for key in ("Album1\n", "../x", "a/b", ""):
        with pytest.raises(ValueError):
            cv.sprite_path(tmp_path, key)
    assert cv.sprite_path(tmp_path, "Album1") == tmp_path / "Album1.jpg"
    assert cv.spotify_ref("https://i.scdn.co/image/" + SP_REF + "\n") == ""
    assert cv.apple_ref("https://is1-ssl.mzstatic.com/image/thumb/Music/v4/a.jpg/100x100bb.jpg\n") == ""
    assert cv.apple_ref("https://is1-ssl.mzstatic.com/image/thumb/Music/../../x/a.jpg/100x100bb.jpg") == ""
    assert cv.bandcamp_ref('<meta property="og:image" content="https://f4.bcbits.com/img/a42_16.jpg\n">') == ""


# --- rows that are not in the catalog given --------------------------------------------------------

def test_rows_outside_the_album_order_are_kept_after_the_others(tmp_path):
    path = tmp_path / "covers.csv"
    cv.write_covers(path, {"Z": ("youtube", "AfChn_NjI9w"), "B": ("deezer", MD5), "A": ("spotify", SP_REF), "Y": ("bandcamp", "5")},
                    ["A", "B", "C"])
    assert list(cv.read_covers(path)) == ["A", "B", "Z", "Y"]


def test_a_refs_run_on_fewer_albums_keeps_the_other_rows_and_says_so(tmp_path):
    path = tmp_path / "covers.csv"
    cv.write_covers(path, {"Old1": ("deezer", MD5), "Old2": ("bandcamp", "5")}, ["Old1", "Old2"])
    albums, _, pages = spotify_albums(2)
    said = []
    code = cv.run_refs(cv.Inputs(albums, {}, {}, {}, {}), path, tmp_path / "state.json", tmp_path / "96", fetcher(Net(pages)),
                       ("spotify",), out=lambda *a: said.append(" ".join(map(str, a))))
    assert code == 0 and list(cv.read_covers(path)) == ["Album0", "Album1", "Old1", "Old2"]
    assert any("2 row(s)" in line and "kept" in line for line in said)


def test_a_replaced_rows_sprite_is_removed_through_sprite_path(tmp_path, monkeypatch):
    seen = []
    real = cv.sprite_path
    monkeypatch.setattr(cv, "sprite_path", lambda d, k: (seen.append(k), real(d, k))[1])
    row = album("A", spotify_url=f"https://open.spotify.com/album/{SP_ID}", youtube_url="https://www.youtube.com/watch?v=AfChn_NjI9w")
    assert run(tmp_path, [row], Net())[1] == {"A": ("youtube", "AfChn_NjI9w")}  # Spotify answered 404
    (tmp_path / "96").mkdir()
    (tmp_path / "96" / "A.jpg").write_bytes(b"x")
    (tmp_path / "state.json").unlink()  # forget that Spotify answered 404
    _, covers, _ = run(tmp_path, [row], Net({cv.oembed_url(SP_ID): oembed()}))
    assert covers == {"A": ("spotify", SP_REF)} and seen == ["A"] and not (tmp_path / "96" / "A.jpg").exists()


# --- one run at a time ------------------------------------------------------------------------------

def test_a_second_refs_run_does_not_start(tmp_path):
    albums, _, pages = spotify_albums(2)
    said, net = [], Net(pages)
    held = cv.take_lock(cv.lock_path(tmp_path / "state.json", "refs"))
    try:
        code = cv.run_refs(cv.Inputs(albums, {}, {}, {}, {}), tmp_path / "covers.csv", tmp_path / "state.json", tmp_path / "96",
                           fetcher(net), ("spotify",), out=lambda *a: said.append(" ".join(map(str, a))))
        assert code == 1 and net.asked == [] and not (tmp_path / "covers.csv").exists()
        assert any("refs.lock" in line and "another" in line for line in said)
        # the lock of `refs` is not the lock of `sprites`, and nothing that only reads waits for either
        assert sprites(tmp_path, {"A": ("spotify", SP_REF)}, Net(default=(200, image_bytes((300, 300))))) == 0
        assert cv.load_covers(tmp_path / "covers.csv", tmp_path / "96").cover_for("A") == ("", None)
    finally:
        held.close()
    assert run(tmp_path, albums, Net(pages), tiers=("spotify",))[0] == 0  # free again


def test_a_second_sprites_run_does_not_start(tmp_path):
    said, net = [], Net(default=(200, image_bytes((300, 300))))
    covers = {"A": ("spotify", SP_REF)}
    with cv.take_lock(cv.lock_path(tmp_path / "state.json", "sprites")):
        code = cv.run_sprites(covers, ["A"], tmp_path / "96", tmp_path / "state.json", fetcher(net),
                              out=lambda *a: said.append(" ".join(map(str, a))))
        assert code == 1 and net.asked == [] and any("sprites.lock" in line for line in said)
        assert cv.missing_sprites(covers, ["A"], tmp_path / "96", cv.State(tmp_path / "state.json")) == ["A"]  # reading goes on
        assert cv.adopt(covers, tmp_path / "96", tmp_path / "covers.csv", out=said.append) == 1
    assert sprites(tmp_path, covers, net) == 0 and (tmp_path / "96" / "A.jpg").exists()
    with pytest.raises(cv.Locked):
        with cv.take_lock(tmp_path / "x.lock"):
            cv.take_lock(tmp_path / "x.lock")


# --- what each sprite was made from -----------------------------------------------------------------

def manifest(tmp_path):
    path = cv.manifest_path(tmp_path / "96")
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def test_a_sprite_records_the_image_it_was_made_from(tmp_path):
    covers = {"A": ("spotify", SP_REF), "B": ("deezer", MD5)}
    net = Net(default=(200, image_bytes((300, 300))))
    assert sprites(tmp_path, covers, net) == 0
    assert manifest(tmp_path) == {"A": "spotify:" + SP_REF, "B": "deezer:" + MD5}
    assert cv.manifest_path(tmp_path / "96").parent == tmp_path  # beside the folder, not in it
    assert sorted(p.name for p in (tmp_path / "96").iterdir()) == ["A.jpg", "B.jpg"]
    table = cv.Covers(covers, tmp_path / "96", made_from=manifest(tmp_path))
    assert table.cover_for("A") == (SP_REF, tmp_path / "96" / "A.jpg") and table.stale() == [] and table.unverified() == []


def test_a_sprite_of_another_image_counts_as_missing_and_is_made_again(tmp_path):
    covers = {"A": ("spotify", SP_REF), "B": ("deezer", MD5)}
    sprites(tmp_path, covers, Net(default=(200, image_bytes((300, 300)))))
    before = (tmp_path / "96" / "B.jpg").read_bytes()
    covers["B"] = ("bandcamp", "77")  # the row changed and the old B.jpg survived
    state = cv.State(tmp_path / "state.json")
    assert cv.missing_sprites(covers, ["A", "B"], tmp_path / "96", state) == ["B"]
    cv.write_covers(tmp_path / "covers.csv", covers, ["A", "B"])
    table = cv.load_covers(tmp_path / "covers.csv", tmp_path / "96")
    assert table.cover_for("B") == ("bc:77", None) and table.stale() == ["B"]
    assert table.cover_for("A") == (SP_REF, tmp_path / "96" / "A.jpg")
    net = Net({cv.sprite_url("bandcamp", "77"): image_bytes((350, 350), (10, 200, 10))})
    assert sprites(tmp_path, covers, net) == 0 and net.asked == [cv.sprite_url("bandcamp", "77")]
    assert manifest(tmp_path)["B"] == "bandcamp:77" and (tmp_path / "96" / "B.jpg").read_bytes() != before
    assert cv.load_covers(tmp_path / "covers.csv", tmp_path / "96").cover_for("B") == ("bc:77", tmp_path / "96" / "B.jpg")


def test_a_sprite_with_no_entry_is_used_and_named_until_it_is_adopted(tmp_path):
    """The sprites an earlier version made have no entry. They are not fetched again; the build and `status`
    say how many there are, and `adopt` records them."""
    covers = {"A": ("spotify", SP_REF), "B": ("deezer", MD5), "C": ("bandcamp", "5")}
    cv.write_covers(tmp_path / "covers.csv", covers, list(covers))
    (tmp_path / "96").mkdir()
    for key in "AB":
        (tmp_path / "96" / f"{key}.jpg").write_bytes(image_bytes((96, 96)))
    assert cv.missing_sprites(covers, list(covers), tmp_path / "96", cv.State(tmp_path / "state.json")) == ["C"]
    table = cv.load_covers(tmp_path / "covers.csv", tmp_path / "96")
    assert table.cover_for("A") == (SP_REF, tmp_path / "96" / "A.jpg")
    assert table.unverified() == ["A", "B"] and table.unverified(["B", "C"]) == ["B"] and table.stale() == []
    said = []
    assert cv.adopt(covers, tmp_path / "96", tmp_path / "covers.csv", out=said.append) == 0
    assert manifest(tmp_path) == {"A": "spotify:" + SP_REF, "B": "deezer:" + MD5}
    assert any("2 adopted" in line for line in said)
    assert cv.load_covers(tmp_path / "covers.csv", tmp_path / "96").unverified() == []


def test_adopt_leaves_a_sprite_older_than_the_covers_table_and_never_changes_an_entry(tmp_path):
    covers = {"A": ("spotify", SP_REF), "B": ("deezer", MD5), "C": ("bandcamp", "5")}
    (tmp_path / "96").mkdir()
    for key in "ABC":
        (tmp_path / "96" / f"{key}.jpg").write_bytes(image_bytes((96, 96)))
    os.utime(tmp_path / "96" / "A.jpg", (1_000_000, 1_000_000))  # made before the table last changed
    cv.write_covers(tmp_path / "covers.csv", covers, list(covers))
    os.utime(tmp_path / "covers.csv", (2_000_000, 2_000_000))
    cv.write_atomic(cv.manifest_path(tmp_path / "96"), json.dumps({"C": "youtube:AfChn_NjI9w"}).encode())
    said = []
    assert cv.adopt(covers, tmp_path / "96", tmp_path / "covers.csv", out=said.append) == 0
    assert manifest(tmp_path) == {"B": "deezer:" + MD5, "C": "youtube:AfChn_NjI9w"}  # C stays stale: made again by `sprites`
    assert any("1 adopted" in line for line in said) and any("1 older" in line and "--older-too" in line for line in said)
    assert cv.adopt(covers, tmp_path / "96", tmp_path / "covers.csv", older_too=True, out=said.append) == 0
    assert manifest(tmp_path) == {"A": "spotify:" + SP_REF, "B": "deezer:" + MD5, "C": "youtube:AfChn_NjI9w"}


def test_the_manifest_is_written_atomically_and_a_broken_one_is_named(tmp_path, monkeypatch):
    path = cv.manifest_path(tmp_path / "96")
    m = cv.SpriteManifest(path)
    m.of["A"] = "spotify:" + SP_REF
    m.save()
    before = path.read_bytes()
    monkeypatch.setattr(cv.os, "replace", lambda src, dst: (_ for _ in ()).throw(OSError("disk full")))
    m.of["B"] = "deezer:" + MD5
    with pytest.raises(OSError):
        m.save()
    assert path.read_bytes() == before and sorted(p.name for p in tmp_path.iterdir()) == [path.name]
    monkeypatch.undo()
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError, match=path.name):
        cv.SpriteManifest(path)


def test_adopt_and_a_dry_run_on_the_command_line(tmp_path, capsys):
    albums = tmp_path / "albums.csv"
    albums.write_text("rym_id,legacy_uri,artist,title,spotify_url,apple_music_url,deezer_url,bandcamp_url,youtube_url\n"
                      "A,,x,y,,,,,\nB,,x,y,,,,,\n", encoding="utf-8")
    cv.write_covers(tmp_path / "covers.csv", {"A": ("spotify", SP_REF), "B": ("deezer", MD5)}, ["A", "B"])
    (tmp_path / "96").mkdir()
    (tmp_path / "96" / "A.jpg").write_bytes(image_bytes((96, 96)))
    paths = ["--albums", str(albums), "--covers", str(tmp_path / "covers.csv"), "--state", str(tmp_path / "state.json"),
             "--sprites", str(tmp_path / "96")]
    with cv.take_lock(cv.lock_path(tmp_path / "state.json", "sprites")):  # a running `sprites` does not stop a reader
        assert cv.main(["sprites", "--dry-run", *paths]) == 0
        assert "1 sprites to fetch" in capsys.readouterr().out
    assert cv.main(["adopt", "--dry-run", *paths]) == 0
    assert "1 would be adopted" in capsys.readouterr().out and manifest(tmp_path) is None
    assert cv.main(["adopt", *paths]) == 0
    assert "1 adopted" in capsys.readouterr().out and manifest(tmp_path) == {"A": "spotify:" + SP_REF}
