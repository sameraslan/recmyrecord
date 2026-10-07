"""The two cover tables that only record: scripts/covers_resolved.py (the cover every album shows, from the
built albums.json) and scripts/covers_state.py (the lookup's state file as a table, and back)."""
import csv
import importlib.util
import json
from collections import Counter

import pytest

from rmr_pipeline import covers as cv


def _script(name):
    spec = importlib.util.spec_from_file_location(name, cv.PIPELINE_DIR / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


resolved, state_table = _script("covers_resolved"), _script("covers_state")
MBID1, MBID2 = "5d8b1b17-ddd8-3fad-9c69-28401da19d44", "fc110738-c096-3a4d-bfad-a75163580508"
SP = "ab67616d0000b273" + "0" * 23  # a Spotify image id, less its last character


# --- covers_resolved --------------------------------------------------------------------------------

def _world(tmp_path, site_c, covers="", caa="", skip="", unverified="", overrides=None, gone=""):
    """Eight albums: `site_c` is the `c` of each in the built albums.json, in catalog order."""
    keys = [f"Album{i}" for i in range(1, 9)]
    (tmp_path / "albums.csv").write_text("rym_id,legacy_uri\n" + "".join(
        f"{k},{'spotify:album:x' if i < 3 else ''}\n" for i, k in enumerate(keys)))
    (tmp_path / "albums.json").write_text(json.dumps([{"slug": f"slug-{k.lower()}", "c": c} for k, c in zip(keys, site_c)]))
    (tmp_path / "covers.csv").write_text("rym_id,source,ref\n" + covers)
    (tmp_path / "covers_caa.csv").write_text(",".join(cv.CAA_FIELDS) + "\n" + caa)
    (tmp_path / "covers_skip.csv").write_text("rym_id,source,ref,note\n" + skip)
    (tmp_path / "unverified_links.csv").write_text("rym_id,slug,site_id,opens,note\n" + unverified)
    (tmp_path / "overrides.json").write_text(json.dumps(overrides or {}))
    (tmp_path / "covers_state.csv").write_text(",".join(state_table.FIELDS) + "\n" + gone)
    return dict(site_albums=tmp_path / "albums.json", albums=tmp_path / "albums.csv", covers_path=tmp_path / "covers.csv",
                caa_path=tmp_path / "covers_caa.csv", skip_path=tmp_path / "covers_skip.csv",
                unverified_path=tmp_path / "unverified_links.csv", overrides_path=tmp_path / "overrides.json",
                state_table=tmp_path / "covers_state.csv")


def test_every_album_has_a_row_with_the_kind_the_url_and_where_the_cover_came_from(tmp_path):
    paths = _world(
        tmp_path,
        [SP + "1", SP + "2", "", "dz:" + "a" * 32, "yt:abcdefghijk", f"ca:{MBID1}", "", ""],
        covers=f"Album2,spotify,{SP}9\nAlbum4,deezer,{'a' * 32}\nAlbum5,youtube,abcdefghijk\nAlbum6,youtube,gonegonegon\n"
               "Album7,youtube,skipskipski\n",
        caa=f"Album6,{MBID1},t,a,1999,Album,100,auto\nAlbum8,{MBID2},t,a,1999,Album,100,hand\n",
        skip=f"Album7,youtube,skipskipski,a card\nAlbum8,caa,{MBID2},a fan-made sleeve\n",
        unverified="Album3,slug-album3,x,another album,\n",
        overrides={"slug-album2": {"c": SP + "2", "image": "overrides/x.jpg"}},
        gone="Album6,sprites,youtube,gonegonegon,gone,HTTP 404,,,,,,\n")
    rows = resolved.resolve(**paths)
    assert [(r["rym_id"], r["kind"], r["ref"], r["origin"]) for r in rows] == [
        ("Album1", "spotify", SP + "1", "map"),  # an existing album with no row anywhere: the map's cover
        ("Album2", "spotify", SP + "2", "overrides.json"),  # set by hand: before the row of covers.csv
        ("Album3", "none", "", "none"),
        ("Album4", "dz", "a" * 32, "covers.csv"),
        ("Album5", "yt", "abcdefghijk", "covers.csv"),
        ("Album6", "ca", MBID1, "covers_caa.csv"),  # its row of covers.csv is gone: the last resort
        ("Album7", "none", "", "none"),
        ("Album8", "none", "", "none")]
    assert [r["url"] for r in rows] == [cv.cover_url(a["c"], 640) for a in json.loads(paths["site_albums"].read_text())]
    assert rows[3]["url"] == f"https://cdn-images.dzcdn.net/images/cover/{'a' * 32}/1000x1000-000000-80-0-0.jpg"
    assert [r["note"] for r in rows if r["kind"] == "none"] == [
        "unverified_links.csv: its Spotify link opens another album",
        "covers_skip.csv: youtube:skipskipski is not a cover",
        f"covers_skip.csv: caa:{MBID2} is not the album's cover"]
    assert all(r["slug"] == "slug-" + r["rym_id"].lower() and not r["note"] for r in rows if r["kind"] != "none")
    assert resolved.table_text(rows).splitlines()[0] == "rym_id,slug,kind,ref,url,origin,note"


def test_a_cover_no_table_explains_and_rows_out_of_step_are_errors(tmp_path):
    ok = [SP + "1", "", "", "", "", "", "", ""]
    with pytest.raises(ValueError, match="Album4 .*no committed table has its cover"):
        resolved.resolve(**_world(tmp_path, ok[:3] + [SP + "4"] + ok[4:]))  # a new album: the map has nothing of it
    with pytest.raises(ValueError, match="Album5 .*no committed table has its cover"):
        resolved.resolve(**_world(tmp_path, ok[:4] + ["yt:abcdefghijk"] + ok[5:], covers="Album5,youtube,otherother1\n"))
    with pytest.raises(ValueError, match="Album3: row 4 .* is slug-album3 .*, not another-slug"):
        resolved.resolve(**_world(tmp_path, ok, unverified="Album3,another-slug,x,y,\n"))
    paths = _world(tmp_path, ok)
    paths["site_albums"].write_text(json.dumps([{"slug": "slug-album1", "c": ""}]))
    with pytest.raises(ValueError, match="has 1 albums and .* 8: build the site data first"):
        resolved.resolve(**paths)


def test_the_committed_table_is_what_the_committed_site_data_gives():
    """Stale after a build? Run `python scripts/covers_resolved.py` from data-pipeline/."""
    lines = []
    assert resolved.main(["--check"], out=lines.append) == 0, lines
    with resolved.DEFAULT_TABLE.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert [r["rym_id"] for r in rows] == [r["rym_id"] for r in cv.catalog_rows()]
    kinds = Counter(r["kind"] for r in rows)
    assert set(kinds) <= {"spotify", "dz", "am", "bc", "yt", "ca", "none"} and kinds["spotify"] > 9000
    assert all(bool(r["url"]) == (r["kind"] != "none") and r["url"].startswith(("https://", "")) for r in rows)
    assert all(cv.allowed(r["url"]) for r in rows if r["url"])  # only the image hosts the covers module knows


# --- covers_state -----------------------------------------------------------------------------------

STATE = {
    "refs": {"Album2": {"bandcamp": "HTTP 404", "spotify": "no thumbnail in Spotify's answer"},
             "Album1": {"store": "the store has no cover for the album's listings"}},
    "sprites": {"Album3": {"of": "youtube:abcdefghijk", "why": "HTTP 404"},
                "Album4": {"of": "apple:Music/v4/a/b.jpg", "why": "not an image"}},
    "caa_sprites": {"Album5": {"of": f"caa:{MBID1}", "why": "HTTP 404"}},
    "caa": {"Album5": {"decision": "found", "why": "", "score": 100, "queries": 1, "mbid": MBID1, "mb_title": "T, \"quoted\"",
                       "mb_artist": "A", "mb_year": "1999", "mb_type": "Album+Live"},
            "sp:" + "7" * 22: {"decision": "none", "why": "search 1: 0 release group(s)", "score": 65.5, "queries": 3},
            "Album6": {"decision": "no art", "why": "the archive has no image for the release group (HTTP 404)", "score": 100,
                       "queries": 2, "mbid": MBID2, "mb_title": "T", "mb_artist": "A", "mb_year": "", "mb_type": ""}},
}


def test_the_state_file_goes_to_the_table_and_comes_back_the_same(tmp_path):
    rows = state_table.rows_of(STATE)
    assert [(r["stage"], r["rym_id"], r["source"], r["ref"], r["outcome"]) for r in rows] == [
        ("refs", "Album1", "store", "", "failed"), ("refs", "Album2", "bandcamp", "", "failed"),
        ("refs", "Album2", "spotify", "", "failed"),
        ("sprites", "Album3", "youtube", "abcdefghijk", "gone"), ("sprites", "Album4", "apple", "Music/v4/a/b.jpg", "gone"),
        ("caa_sprites", "Album5", "caa", MBID1, "gone"),
        ("caa", "Album5", "caa", MBID1, "found"), ("caa", "Album6", "caa", MBID2, "no art"),
        ("caa", "sp:" + "7" * 22, "caa", "", "none")]
    assert state_table.state_of(rows) == STATE
    path, table = tmp_path / "cache" / "state.json", tmp_path / "covers_state.csv"
    path.parent.mkdir()
    path.write_text(json.dumps(STATE), encoding="utf-8")
    said = []
    assert state_table.main(["--state", str(path), "--table", str(table)], out=said.append) == 0
    assert "9 rows (3 refs, 2 sprites, 1 caa_sprites, 3 caa)" in said[-1]
    assert state_table.main(["--state", str(path), "--table", str(table), "--check"], out=said.append) == 0
    assert state_table.main(["--state", str(path), "--table", str(table), "--restore"], out=said.append) == 1  # never replaced
    assert "left as it is" in said[-1] and json.loads(path.read_text()) == STATE
    path.unlink()
    assert state_table.main(["--state", str(path), "--table", str(table), "--check"], out=said.append) == 1
    assert state_table.main(["--state", str(path), "--table", str(table), "--restore"], out=said.append) == 0
    back = cv.State(path)  # as the covers module reads it
    assert (back.refs, back.sprites, back.caa_sprites, back.caa) == tuple(STATE[k] for k in ("refs", "sprites", "caa_sprites", "caa"))
    back.save()
    assert state_table.main(["--state", str(path), "--table", str(table), "--check"], out=said.append) == 0
    path.write_text(json.dumps(STATE | {"sprites": {}}), encoding="utf-8")
    assert state_table.main(["--state", str(path), "--table", str(table), "--check"], out=said.append) == 1
    assert said[-1].startswith("stale: ")


def test_a_state_file_of_another_shape_is_refused(tmp_path, capsys):
    for bad, said in ((STATE | {"notes": {}}, "a section this table does not know: notes"),
                      (STATE | {"sprites": {"Album3": {"of": "youtube:x", "why": "HTTP 404", "at": "2026"}}}, "sprites, Album3"),
                      (STATE | {"caa": {"Album5": {"decision": "found", "why": "", "score": 1, "queries": 1, "mbid": MBID1}}},
                       "caa, Album5")):
        (tmp_path / "state.json").write_text(json.dumps(bad), encoding="utf-8")
        assert state_table.main(["--state", str(tmp_path / "state.json"), "--table", str(tmp_path / "t.csv")]) == 1
        assert said in capsys.readouterr().err and not (tmp_path / "t.csv").exists()


def test_the_committed_table_is_a_state_file_of_catalog_albums(tmp_path):
    rows = state_table.read_table(state_table.DEFAULT_TABLE)
    assert state_table.table_text(state_table.rows_of(state_table.state_of(rows))) == state_table.DEFAULT_TABLE.read_text(encoding="utf-8")
    assert {r["rym_id"] for r in rows} <= {r["rym_id"] for r in cv.catalog_rows()}
    assert {r["outcome"] for r in rows} <= {"failed", "gone", "found", "none", "ambiguous", "no art"}
    assert state_table.main(["--state", str(tmp_path / "state.json"), "--restore"], out=lambda _line: None) == 0
    state, covers = cv.State(tmp_path / "state.json"), cv.read_covers()
    assert len(state.sprites) >= 20 and all(k in covers for k in state.sprites)
