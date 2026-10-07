"""catalog/unverified_links.csv: the existing albums whose Spotify link opens another album and whose right
id is not known. The build gives them no Spotify link and no Spotify cover until the sheet or overrides.json
has the link (rmr_pipeline.catalog.unverified_links; the built data is checked in tests/test_build_catalog.py
and tests/test_outputs.py)."""
import pytest

from rmr_pipeline.catalog import (DEFAULT_UNVERIFIED, UNVERIFIED_FIELDS, CatalogError, load_catalog,
                                  load_unverified_links, unverified_links)

A, B, C, D = ("1" * 22, "2" * 22, "3" * 22, "4" * 22)
KEYS = ["Album1", "sp:" + B, "Album3", "Album4", "Album9"]  # the last one is a new album
LEGACY = [A, B, C, D, ""]
SLUGS = ["one-a", "two-b", "three-c", "four-d", "nine-n"]
NO_LINKS = ["", "", "", "", ""]


def _rows(*rows):
    return [dict(zip(UNVERIFIED_FIELDS, (*r, "what it opens", ""))) for r in rows]


def test_a_row_applies_while_nothing_says_what_the_albums_link_is():
    rows = _rows(("Album1", "one-a", A), ("sp:" + B, "two-b", B), ("Album4", "four-d", D))
    found = unverified_links(rows, KEYS, LEGACY, NO_LINKS, SLUGS, {})
    assert (found.applied, found.stale) == ([0, 1, 3], [])
    assert unverified_links([], KEYS, LEGACY, NO_LINKS, SLUGS, {}) == type(found)([], [])


def test_the_sheets_link_and_an_override_win_over_the_list():
    rows = _rows(("Album1", "one-a", A), ("sp:" + B, "two-b", B), ("Album3", "three-c", C), ("Album4", "four-d", D))
    sheet = ["https://open.spotify.com/album/" + "9" * 22, "", "", ""]
    overrides = {"two-b": {"s": "8" * 22, "note": "found"}, "three-c": {"s": ""}, "four-d": {"a": "Someone", "note": "credit"}}
    found = unverified_links(rows, KEYS, LEGACY, sheet + [""], SLUGS, overrides)
    assert found.applied == [3]  # an override that sets no `s` decides nothing about the link
    assert found.stale == [
        "Album1 (one-a): the sheet has a Spotify link for it (https://open.spotify.com/album/9999999999999999999999)",
        f"sp:{B} (two-b): overrides.json sets its Spotify id",
        "Album3 (three-c): overrides.json sets its Spotify id",  # also an empty one: no Spotify release
    ]


def test_a_row_that_is_not_of_this_catalog_does_not_apply():
    rows = _rows(("Album7", "seven-x", A), ("Album1", "one-other", A), ("Album3", "three-c", D), ("Album9", "nine-n", A))
    found = unverified_links(rows, KEYS, LEGACY, NO_LINKS, SLUGS, {})
    assert found.applied == []
    assert found.stale == [
        "Album7 (seven-x): the catalog has no album with this key",
        "Album1 (one-other): the album's slug is 'one-a'",
        f"Album3 (three-c): its id is {C}, not the one that was checked",
        "Album9 (nine-n): its id is empty, not the one that was checked",  # a new album: its link is the sheet's
    ]


def test_the_file_is_read_strictly_and_a_missing_one_means_none(tmp_path):
    path = tmp_path / "unverified_links.csv"
    assert load_unverified_links(path) == []
    head = ",".join(UNVERIFIED_FIELDS) + "\n"
    path.write_text(head + f'Album1,one-a,{A},"Someone - Else (2 tracks, 9 min)",a note\n', encoding="utf-8")
    assert load_unverified_links(path) == [{"rym_id": "Album1", "slug": "one-a", "site_id": A,
                                            "opens": "Someone - Else (2 tracks, 9 min)", "note": "a note"}]
    for text, message in ((f"rym_id,slug,site_id\nAlbum1,one-a,{A}\n", "the header must be"),
                          (head + f"Album1,one-a,{A},x,\nAlbum1,one-a,{A},x,\n", "line 3: empty or repeated rym_id 'Album1'"),
                          (head + f",one-a,{A},x,\n", "line 2: empty or repeated rym_id"),
                          (head + "Album1,one-a,short,x,\n", "line 2: site_id 'short'")):
        path.write_text(text, encoding="utf-8")
        with pytest.raises(CatalogError, match=message):
            load_unverified_links(path)


def test_the_committed_list():
    """67 albums (section A of docs/review/spotify-links-needs-owner.md), each an existing album of the catalog
    with no Spotify link on the sheet, whose id in the feature table is the one that was checked."""
    rows = load_unverified_links(DEFAULT_UNVERIFIED)
    assert len(rows) == 67 and all(r["opens"] for r in rows)
    catalog = load_catalog().set_index("rym_id")
    for r in rows:
        album = catalog.loc[r["rym_id"]]
        assert album["legacy_uri"] == "spotify:album:" + r["site_id"] and album["spotify_url"] == "", r["rym_id"]
