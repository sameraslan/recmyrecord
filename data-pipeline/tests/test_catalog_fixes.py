"""The catalog build, second pass: a missing covers table, sprites of another image, albums that share a
Spotify id, the Bandcamp hosts of `l`, patterns that end at the end, cluster votes, the slugs of the site."""
import csv
import json
import shutil
from urllib.parse import urlsplit

import numpy as np
import pytest

import rmr_pipeline.covers as cv
from rmr_pipeline.build import cover_problems, main, moved_site_slugs
from rmr_pipeline.catalog import catalog_frame, load_catalog, neighbour_clusters, shared_spotify_ids, shared_spotify_lines
from rmr_pipeline.constants import DEFAULT_OUT
from rmr_pipeline.links import BANDCAMP_HOSTS, LINK_REF_RE, album_links, link_ref, link_url
from rmr_pipeline.validate import COVER_RE, PREFIXED_COVER_RE, ContractError, validate_dir
from test_build_catalog import _fake_map
from test_catalog import catalog, table
from test_validate import _edit


@pytest.fixture
def out(tmp_path):
    """The site's JSON files alone (the sheets are not read without images)."""
    d = tmp_path / "data"
    d.mkdir()
    for name in ("albums.json", "vocab.json", "positions.json", "recs.json"):
        shutil.copy(DEFAULT_OUT / name, d / name)
    return d


# --- covers: a missing table, sprites that are not of the row's image -------------------------------

def test_a_missing_covers_table_is_said_loudly_and_stops_a_build_that_requires_sprites(tmp_path):
    missing = cv.load_covers(tmp_path / "covers.csv", tmp_path / "96")
    assert not missing.found
    problems = cover_problems(missing, ["Album900"], [])
    assert len(problems) == 1 and "covers.csv is missing" in problems[0] and "NO new album has a cover" in problems[0]
    cv.write_covers(tmp_path / "covers.csv", {}, [])
    assert cover_problems(cv.load_covers(tmp_path / "covers.csv", tmp_path / "96"), ["Album900"], []) == []


def test_the_build_names_sprites_that_wait_are_stale_or_have_no_entry(tmp_path):
    (tmp_path / "96").mkdir()
    for key in ("B", "C"):
        (tmp_path / "96" / f"{key}.jpg").write_bytes(b"jpeg")
    rows = {"A": ("deezer", "0f" * 16), "B": ("bandcamp", "5"), "C": ("bandcamp", "6"), "D": ("bandcamp", "7")}
    table_ = cv.Covers(rows, tmp_path / "96", made_from={"B": "bandcamp:4"})  # B.jpg was made from another image
    assert table_.cover_for("B") == ("bc:5", None)
    waiting = [k for k in rows if table_.cover_for(k)[1] is None]
    problems = cover_problems(table_, list(rows), waiting)
    assert len(problems) == 2
    assert "3 new album(s) have a cover and no sprite" in problems[0] and "1 of them with a sprite of another image" in problems[0]
    assert "covers sprites" in problems[0]
    assert "1 sprite(s) have no entry" in problems[1] and "covers adopt" in problems[1]
    assert cover_problems(cv.Covers(rows, tmp_path / "96", made_from={"B": "bandcamp:5", "C": "bandcamp:6"}), ["B", "C"], []) == []


@pytest.mark.parametrize("table_,message", [
    (lambda tmp: cv.Covers({}, tmp / "96", found=False), "covers.csv is missing"),
    (lambda tmp: cv.Covers({"KEY": ("bandcamp", "5")}, tmp / "96", made_from={}), "no entry"),
])
def test_require_sprites_stops_the_build_on_each_cover_problem(deduped, tmp_path, capsys, monkeypatch, table_, message):
    root = _fake_map(tmp_path / "map", deduped[0]["URI"])
    first_new = load_catalog()["rym_id"].iloc[len(deduped[0])]
    covers = table_(tmp_path)
    if covers.rows:  # a sprite that nothing vouches for
        covers = cv.Covers({first_new: ("bandcamp", "5")}, tmp_path / "96", made_from={})
        (tmp_path / "96").mkdir()
        (tmp_path / "96" / f"{first_new}.jpg").write_bytes(b"jpeg")
    monkeypatch.setattr(cv, "_default_covers", lambda: covers)
    out_dir = tmp_path / "out"
    assert main(["--map-root", str(root), "--catalog", "--skip-images", "--require-sprites", "--out", str(out_dir)]) == 1
    printed = capsys.readouterr()
    assert "--require-sprites" in printed.err and message in printed.err and not out_dir.exists()


# --- two albums, one Spotify id ---------------------------------------------------------------------

def test_albums_that_share_a_spotify_id_are_listed():
    sub = table({"dark": 0}, {"warm": 0}, {"cold": 0})
    shared_old, shared_new = "0" * 21 + "1", "A" * 22  # album 1's own id (its URI's); an id two new albums have
    cat = catalog_frame(sub, catalog(
        sub,
        {"spotify_url": f"https://open.spotify.com/album/{shared_old}", "title": "Part Two", "artist": "Band"},
        {"spotify_url": f"https://open.spotify.com/album/{shared_new}?si=x"},
        {"spotify_url": ""},
        {"spotify_url": f"https://open.spotify.com/album/{shared_new}"},
        {"spotify_url": ""},
    ), aliases={})
    rows = shared_spotify_ids(cat)
    assert rows == [
        {"index": 1, "rym_id": "Album2", "artist": "A1", "title": "T1", "spotify_id": shared_old, "side": "existing"},
        {"index": 3, "rym_id": "Album900", "artist": "Band", "title": "Part Two", "spotify_id": shared_old, "side": "new"},
        {"index": 4, "rym_id": "Album901", "artist": "B1", "title": "N1", "spotify_id": shared_new, "side": "new"},
        {"index": 6, "rym_id": "Album903", "artist": "B3", "title": "N3", "spotify_id": shared_new, "side": "new"},
    ]
    lines = shared_spotify_lines(rows)
    assert lines[0].startswith("spotify ids: 2 shared by more than one album (1 between an existing and a new album)")
    assert len(lines) == 3 and "Album2" in lines[1] and "Album900" in lines[1] and "[existing]" in lines[1] and "[new]" in lines[1]
    assert shared_spotify_lines([]) == ["spotify ids: none shared by more than one album"]
    assert shared_spotify_ids(catalog_frame(sub, catalog(sub), aliases={})) == []  # the empty ids are nobody's


def test_the_real_catalogs_shared_spotify_ids(deduped):
    """Not an error (the owner decides what each album's link should be), but the build knows them."""
    rows = shared_spotify_ids(catalog_frame(deduped[0], load_catalog()))
    by_id = {}
    for r in rows:
        by_id.setdefault(r["spotify_id"], []).append(r)
    assert all(len(v) > 1 for v in by_id.values()) and all(r["spotify_id"] for r in rows)
    # the ids in the order of their first album (with the sheet's links two existing albums can share one)
    firsts = [v[0]["index"] for v in by_id.values()]
    assert firsts == sorted(firsts) and all([r["index"] for r in v] == sorted(r["index"] for r in v) for v in by_id.values())
    assert shared_spotify_lines(rows)[0].startswith(f"spotify ids: {len(by_id)} shared by more than one album")


# --- cluster votes ----------------------------------------------------------------------------------

def test_an_album_that_may_not_vote_gives_no_cluster():
    X = np.array([[0.0], [1.0], [2.0], [3.0], [4.0], [10.0], [11.0],  # existing
                  [0.4], [10.4], [2.6]])
    clusters = [1, 1, 2, 2, 2, 5, 5]
    everyone = neighbour_clusters(X, clusters, k=2)
    assert everyone == [1, 5, 2] == neighbour_clusters(X, clusters, k=2, voters=np.ones(7, dtype=bool))
    # without albums 0 and 1 (no audio: their place on this matrix is not theirs) the first new album's two nearest are 2 and 3
    assert neighbour_clusters(X, clusters, k=2, voters=np.array([0, 0, 1, 1, 1, 1, 1], dtype=bool)) == [2, 5, 2]
    with pytest.raises(ValueError, match="voters"):
        neighbour_clusters(X, clusters, voters=np.ones(6, dtype=bool))
    with pytest.raises(ValueError, match="voters"):
        neighbour_clusters(X, clusters, voters=np.zeros(7, dtype=bool))


# --- the Bandcamp hosts of `l` ----------------------------------------------------------------------

def test_the_bandcamp_hosts_are_the_catalogs_custom_hosts():
    """BANDCAMP_HOSTS is every host of a catalog Bandcamp link that is not <name>.bandcamp.com. A new one in
    the catalog fails here: add it to links.BANDCAMP_HOSTS once the page has been looked at."""
    with open(cv.DEFAULT_ALBUMS, encoding="utf-8", newline="") as f:
        hosts = {(urlsplit(r["bandcamp_url"].strip()).hostname or "").lower() for r in csv.DictReader(f) if r["bandcamp_url"].strip()}
    custom = sorted(h for h in hosts if not h.endswith(".bandcamp.com"))
    assert list(BANDCAMP_HOSTS) == custom and len(custom) == len(set(custom)) > 0
    for host in ("digital.susumuhirasawa.com", "eyevyberecords.com", "halleylabs.com", "music.bucketheadpikes.com"):
        assert host in BANDCAMP_HOSTS  # the ones on albums with no Spotify id today: they reach albums.json


@pytest.mark.parametrize("url", [
    "https://evil.example/album/x", "https://bandcamp.com.evil.example/album/x", "https://evilbandcamp.com/album/x",
    "https://bandcamp.com/album/x", "https://a.b.bandcamp.com/album/x", "https://music.sufjan.com.evil.example/album/x",
    "https://xmusic.sufjan.com/album/x", "https://sub.halleylabs.com/album/x",
])
def test_a_bandcamp_link_on_another_host_is_left_out_and_counted(url):
    assert link_ref("bc", url) == ""
    assert album_links({"bandcamp_url": url}) == ({}, [("bc", url)])
    ref = url.removeprefix("https://")
    assert not LINK_REF_RE["bc"].fullmatch(ref) and not LINK_REF_RE["bc"].match(ref)
    with pytest.raises(ValueError, match="not a bc ref"):
        link_url("bc", ref)


def test_every_listed_host_gives_a_ref():
    for host in (*BANDCAMP_HOSTS, "someone.bandcamp.com", "some-one2.bandcamp.com"):
        assert link_ref("bc", f"https://{host}/album/x") == f"{host}/album/x"
        assert link_url("bc", f"{host}/track/x") == f"https://{host}/track/x"


def test_the_validator_refuses_a_bandcamp_ref_on_another_host(out):
    _edit(out, 20, s="", l={"bc": "music.sufjan.com/album/illinois"})
    validate_dir(out, images=False)
    _edit(out, 20, s="", l={"bc": "evil.example/album/x"})
    with pytest.raises(ContractError, match=r"albums\[20\]: bad bc link"):
        validate_dir(out, images=False)


# --- patterns end at the end ------------------------------------------------------------------------

@pytest.mark.parametrize("service,ref", [("am", "us/1097861387"), ("bc", "someone.bandcamp.com/album/x"), ("dz", "14879699"),
                                         ("yt", "zdPCt5ZEf40"), ("sc", "radiohead/sets/ok-computer-3")])
def test_a_ref_with_a_trailing_newline_is_not_a_ref(service, ref):
    assert LINK_REF_RE[service].match(ref) and LINK_REF_RE[service].fullmatch(ref)
    assert not LINK_REF_RE[service].match(ref + "\n")
    with pytest.raises(ValueError):
        link_url(service, ref + "\n")


@pytest.mark.parametrize("c", ["dz:" + "0f" * 16 + "\n", "bc:123\n", "yt:mnjH-ZYe59c\n", "am:Music/v4/a.jpg\n", "0f" * 20 + "\n",
                               "am:Music/../../x/a.jpg", "am:Music/./a.jpg", "am:Music//a.jpg", "am:Music/v4/..", "am:../a.jpg",
                               "am:Music/v4/a..jpg/../b"])
def test_a_cover_id_with_a_newline_or_a_dot_segment_is_refused(out, c):
    assert not COVER_RE.match(c) and not PREFIXED_COVER_RE.match(c)
    _edit(out, 20, c=c)
    with pytest.raises(ContractError, match=r"albums\[20\]: bad cover id"):
        validate_dir(out, images=False)


@pytest.mark.parametrize("c", ["am:Music118/v4/d4/10/5d/d4105dcd-73d6-d4cd-4168-ab63f8255340/00600753264645.rgb.jpg",
                               "am:Music/v4/a/b_c-d.e.jpg", "am:Features/v4/aa/mzl.abcdefgh.png"])
def test_the_artwork_paths_apple_gives_still_pass(c):
    assert PREFIXED_COVER_RE.match(c) and PREFIXED_COVER_RE.fullmatch(c)


# --- the slugs of the site --------------------------------------------------------------------------

def test_a_slug_that_differs_from_the_committed_site_data_is_named(tmp_path):
    site = tmp_path / "albums.json"
    assert moved_site_slugs(["a", "b"], site) is None  # nothing to compare with
    site.write_text(json.dumps([{"slug": "a"}, {"slug": "b"}]), encoding="utf-8")
    assert moved_site_slugs(["a", "b", "new"], site) == []
    assert moved_site_slugs(["a", "x", "new"], site) == ["album 1: 'b' -> 'x'"]
    assert moved_site_slugs(["a"], site) == ["album 1: 'b' -> nothing (the build has 1 album(s), the site 2)"]


def test_the_real_site_slugs_are_what_make_slugs_gives(deduped):
    """What the catalog build compares its first rows with: the committed albums.json."""
    site = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    assert moved_site_slugs([a["slug"] for a in site]) == []
    assert len(moved_site_slugs(["x"] + [a["slug"] for a in site[1:]])) == 1


# --- an image that cannot be fetched: no cover ---

def test_an_album_whose_image_is_gone_has_no_cover(tmp_path):
    """The state file records, per album, the `source:ref` whose image `sprites` could not fetch (HTTP 404).
    Such an album has an empty `c`: the site would ask for the remote image first and fail. A row that
    changed since is another image; a sprite that is there wins over the record."""
    from PIL import Image

    from rmr_pipeline.catalog import new_album_covers

    (tmp_path / "96").mkdir()
    (tmp_path / "covers.csv").write_text("rym_id,source,ref\nA,youtube,aaaaaaaaaaa\nB,bandcamp,5\nC,bandcamp,6\nD,bandcamp,7\n")
    Image.new("RGB", (96, 96)).save(tmp_path / "96" / "C.jpg")
    (tmp_path / "state.json").write_text(json.dumps({"refs": {}, "sprites": {
        "A": {"of": "youtube:aaaaaaaaaaa", "why": "HTTP 404"},  # gone
        "B": {"of": "bandcamp:4", "why": "HTTP 404"},  # the row has another image now
        "C": {"of": "bandcamp:6", "why": "HTTP 404"},  # fetched since
        "X": {"of": "bandcamp:9", "why": "HTTP 410"}}}))  # no row
    table_ = cv.load_covers(tmp_path / "covers.csv", tmp_path / "96", tmp_path / "state.json")
    assert table_.gone() == ["A"] and table_.gone(["B", "C", "Z"]) == [] and table_.is_gone("A") and not table_.is_gone("Z")
    assert table_.cover_for("A") == ("", None)
    assert table_.cover_for("B") == ("bc:5", None) and table_.cover_for("D") == ("bc:7", None)
    assert table_.cover_for("C") == ("bc:6", tmp_path / "96" / "C.jpg")
    covers, images, waiting = new_album_covers(["A", "B", "C", "D"], 10, cover_of=table_.cover_for)
    assert covers == ["", "bc:5", "bc:6", "bc:7"] and list(images) == [12] and waiting == ["B", "D"]
    # an album that is gone is not "waiting for a sprite", so it does not stop --require-sprites
    assert not any("no sprite" in p for p in cover_problems(table_, ["A", "C"], []))
    # without a state file nothing is blanked: the tables the tests and other folders load are as before
    assert cv.load_covers(tmp_path / "covers.csv", tmp_path / "96").cover_for("A") == ("yt:aaaaaaaaaaa", None)
    assert cv.load_covers(tmp_path / "covers.csv", tmp_path / "96", tmp_path / "none.json").gone() == []
