"""The owner's decisions of 6 October 2026 on links, covers and titles, in the catalog build:

- the sheet's Spotify link wins over the feature table's URI for an existing album (overrides.json over both),
  and an album whose link thereby changes takes the cover of the release it now links to;
- catalog/covers_skip.csv: rows of covers.csv that are not a cover (a video frame with a track list, a card);
- a new album's non-Latin title is shown as `title [Latin]`.

No test here uses the network: the fetch function is faked."""
import csv
import json

import pytest
from PIL import Image

import rmr_pipeline.covers as cv
from rmr_pipeline.build import cover_problems, held_by_overrides
from rmr_pipeline.catalog import (CatalogError, catalog_frame, display_title, existing_album_covers, load_catalog,
                                  shared_spotify_ids)
from rmr_pipeline.overrides import apply_overrides
from rmr_pipeline.slugs import make_slugs
from test_catalog import catalog, table
from test_covers import Net, SP_REF, fetcher, oembed

OLD = [f"{i:022d}" for i in range(4)]  # the ids of test_catalog.table's URIs
SHEET = "S" * 22
FIELDS = "rym_id,legacy_uri,artist,title,spotify_url,apple_music_url,deezer_url,bandcamp_url,youtube_url"


def url(album_id):
    return f"https://open.spotify.com/album/{album_id}"


def with_sheet_links(sub, links: dict[int, str], *new):
    cat = catalog(sub, *new)
    for i, link in links.items():
        cat.loc[i, "spotify_url"] = link
    return cat


# --- the Spotify id: override, then sheet, then the feature table's URI ------------------------------

def test_an_existing_albums_spotify_id_is_the_sheets_when_the_sheet_has_a_link():
    sub = table({"dark": 0}, {"warm": 0}, {"cold": 0}, {"lush": 0})
    cat = catalog_frame(sub, with_sheet_links(sub, {0: url(OLD[0]), 1: url(SHEET) + "?si=x", 2: ""},
                                              {"spotify_url": url("N" * 22)}), aliases={})
    assert cat.legacy_ids == OLD + [""]  # what the feature table said, '' for a new album
    assert cat.spotify_ids == [OLD[0], SHEET, OLD[2], OLD[3], "N" * 22]  # same, the sheet's, none on the sheet (twice)
    assert list(cat.frame["URI"][:4]) == list(sub["URI"])  # the URI itself stays: the map is read by it
    with pytest.raises(CatalogError, match="Album1.*not an open.spotify.com album link"):
        catalog_frame(sub, with_sheet_links(sub, {0: "https://open.spotify.com/track/" + SHEET}), aliases={})


def test_an_override_wins_over_the_sheet_and_the_sheet_over_the_table(tmp_path):
    sub = table({"dark": 0}, {"warm": 0}, {"cold": 0}, {"lush": 0})
    cat = catalog_frame(sub, with_sheet_links(sub, {0: url("A" * 22), 1: url("B" * 22), 2: url("C" * 22)}), aliases={})
    slugs = make_slugs(cat.slug_titles, cat.slug_artists)
    (tmp_path / "x.jpg").write_bytes(b"jpeg")
    overrides = {slugs[0]: {"s": "O" * 22}, slugs[2]: {"s": ""}, slugs[3]: {"c": "0f" * 20, "image": "x.jpg"}}
    _, ids, _, _ = apply_overrides(slugs, [""] * 4, cat.spotify_ids, overrides, tmp_path, artists=cat.slug_artists)
    assert ids == ["O" * 22, "B" * 22, "", OLD[3]]  # override, sheet, override (no release), table
    assert held_by_overrides(slugs, overrides) == {0, 2, 3}
    assert held_by_overrides(slugs, {slugs[1]: {"a": "Someone", "note": "the credit"}}) == set()  # not about the link or cover


def test_the_shared_ids_are_counted_on_the_ids_the_build_ends_with():
    sub = table({"dark": 0}, {"warm": 0})
    new = {"spotify_url": url(OLD[1]), "title": "Part Two", "artist": "Band"}
    by_table = catalog_frame(sub, catalog(sub, new), aliases={})
    assert [r["index"] for r in shared_spotify_ids(by_table)] == [1, 2]
    by_sheet = catalog_frame(sub, with_sheet_links(sub, {1: url(SHEET)}, new), aliases={})
    assert shared_spotify_ids(by_sheet) == []  # the sheet gives the existing album its own id
    assert [r["index"] for r in shared_spotify_ids(by_sheet, by_sheet.legacy_ids[:2] + [OLD[1]])] == [1, 2]
    assert [r["spotify_id"] for r in shared_spotify_ids(by_sheet, ["X" * 22, "Y" * 22, "X" * 22])] == ["X" * 22] * 2


# --- the cover follows the link -----------------------------------------------------------------------

def test_a_relinked_album_takes_the_cover_of_its_new_release_or_keeps_the_maps(tmp_path):
    """Seven existing albums. 0: the same id. 1: another id, row and sprite. 2: another id, no row. 3: a row and
    no sprite yet. 4: its image is gone. 5: held by an override. 6: no link on the sheet."""
    (tmp_path / "96").mkdir()
    for key in ("E1", "E5"):
        Image.new("RGB", (96, 96)).save(tmp_path / "96" / f"{key}.jpg")
    rows = {k: ("spotify", "ab67616d0000b273" + f"{i:024x}") for i, k in enumerate(["E0", "E1", "E3", "E4", "E5"])}
    table_ = cv.Covers(rows, tmp_path / "96", made_from={k: cv.made_from(rows[k]) for k in ("E1", "E5")},
                       failed={"E4": cv.made_from(rows["E4"])})
    keys = [f"E{i}" for i in range(7)]
    legacy = [f"{i:022d}" for i in range(7)]
    sheet = [legacy[0]] + ["N" * 21 + str(i) for i in range(1, 6)] + [legacy[6]]
    got = existing_album_covers(keys, sheet, legacy, held={5}, cover_of=table_.cover_for)
    assert got.relinked == [1, 2, 3, 4] and got.held == [5]
    assert got.covers == {1: rows["E1"][1]} and got.images == {1: tmp_path / "96" / "E1.jpg"}
    assert got.kept_map == ["E2", "E3", "E4"] and got.waiting == ["E3"]  # E3 has a row: `sprites` has work to do
    # the map's cover ids stay for every album but the one with a sprite of its new release
    cover_ids = [f"map{i}" for i in range(7)]
    for i, c in got.covers.items():
        cover_ids[i] = c
    assert cover_ids == ["map0", rows["E1"][1], "map2", "map3", "map4", "map5", "map6"]
    # --require-sprites covers them: a row with no sprite, or a sprite with no manifest entry
    problems = cover_problems(table_, [], [], existing_keys=[keys[i] for i in got.relinked], existing_waiting=got.waiting)
    assert len(problems) == 1 and "1 existing album(s)" in problems[0] and "covers sprites" in problems[0]
    unrecorded = cv.Covers(rows, tmp_path / "96")
    assert any("1 sprite(s) have no entry" in p for p in cover_problems(unrecorded, [], [], existing_keys=["E1", "E2"]))
    assert cover_problems(table_, [], [], existing_keys=["E1", "E2", "E4"], existing_waiting=[]) == []


def albums_csv(path, rows):
    path.write_text(FIELDS + "\n" + "".join(",".join(r) + "\n" for r in rows), encoding="utf-8")
    return path


def test_the_albums_covers_looks_up_are_the_relinked_existing_ones_then_the_new_ones(tmp_path):
    path = albums_csv(tmp_path / "albums.csv", [
        ["E1", "spotify:album:" + OLD[1], "a", "same id", url(OLD[1]), "", "", "", ""],
        ["E2", "spotify:album:" + OLD[2], "a", "another id", url(SHEET), "", "", "https://x.bandcamp.com/album/y", ""],
        ["E3", "spotify:album:" + OLD[3], "a", "no link", "", "", "", "", ""],
        ["N1", "", "a", "new", url("N" * 22), "", "", "", ""],
        ["N2", "", "a", "new with no link", "", "", "", "", ""]])
    assert [r["rym_id"] for r in cv.cover_albums(path)] == ["E2", "N1", "N2"]
    assert [r["rym_id"] for r in cv.relinked_albums(path)] == ["E2"] and [r["rym_id"] for r in cv.new_albums(path)] == ["N1", "N2"]
    inputs = cv.Inputs(cv.cover_albums(path), {}, {}, {}, {})
    # an existing album is only ever asked from Spotify: with no answer there it keeps the map's cover
    assert inputs.wanted(inputs.albums[0], {}) == ["spotify"] and inputs.wanted(inputs.albums[0], {"spotify": "HTTP 404"}) == []


def test_refs_writes_the_existing_albums_rows_first_and_asks_only_spotify_for_them(tmp_path):
    path = albums_csv(tmp_path / "albums.csv", [
        ["E1", "spotify:album:" + OLD[1], "a", "another id", url("A" * 22), "", "", "", "https://www.youtube.com/watch?v=AfChn_NjI9w"],
        ["E2", "spotify:album:" + OLD[2], "a", "another id and gone", url("B" * 22), "", "", "", "https://www.youtube.com/watch?v=AfChn_NjI9w"],
        ["E3", "spotify:album:" + OLD[3], "a", "same id", url(OLD[3]), "", "", "", ""],
        ["N1", "", "a", "new", url("C" * 22), "", "", "", ""]])
    thumb = "https://i.scdn.co/image/ab67616d00001e02"
    net = Net({cv.oembed_url("A" * 22): oembed(thumb + "a" * 24), cv.oembed_url("C" * 22): oembed(thumb + "c" * 24)})
    covers_path = tmp_path / "covers.csv"
    cv.write_covers(covers_path, {"N1": ("deezer", "0f" * 16)}, ["N1"])  # as the committed table: new albums only so far
    said = []
    code = cv.run_refs(cv.Inputs(cv.cover_albums(path), {}, {}, {}, {}), covers_path, tmp_path / "state.json", tmp_path / "96",
                       fetcher(net), out=lambda *a: said.append(" ".join(map(str, a))))
    assert code == 0
    with covers_path.open(encoding="utf-8", newline="") as f:
        assert [tuple(r.values()) for r in csv.DictReader(f)] == [
            ("E1", "spotify", "ab67616d0000b273" + "a" * 24), ("N1", "spotify", "ab67616d0000b273" + "c" * 24)]
    assert sorted(net.asked) == sorted(cv.oembed_url(x * 22) for x in "ABC")  # E2: one request, no video frame; E3: none
    assert cv.State(tmp_path / "state.json").refs == {"E2": {"spotify": "HTTP 404"}}
    assert not any("kept" in line for line in said)


def test_the_committed_covers_table_has_the_relinked_existing_albums_first():
    rows = cv.read_covers(cv.DEFAULT_COVERS)
    relinked = [r["rym_id"] for r in cv.relinked_albums()]
    existing = [k for k in rows if k in set(relinked)]
    assert len(relinked) > 1000 and len(existing) > 0.9 * len(relinked)
    assert list(rows)[:len(existing)] == existing == [k for k in relinked if k in rows]
    assert {rows[k][0] for k in existing} == {"spotify"}


# --- the skip list ---------------------------------------------------------------------------------------

def test_a_skipped_row_gives_no_cover_until_the_album_has_another_image(tmp_path):
    (tmp_path / "96").mkdir()
    for key in ("A", "B", "C"):
        Image.new("RGB", (96, 96)).save(tmp_path / "96" / f"{key}.jpg")
    (tmp_path / "covers.csv").write_text("rym_id,source,ref\nA,youtube,aaaaaaaaaaa\nB,youtube,bbbbbbbbbbb\nC,bandcamp,6\n")
    (tmp_path / "96.manifest.json").write_text(json.dumps({"A": "youtube:aaaaaaaaaaa", "B": "youtube:bbbbbbbbbbb", "C": "bandcamp:6"}))
    (tmp_path / "skip.csv").write_text("rym_id,source,ref,note\nA,youtube,aaaaaaaaaaa,a FULL ALBUM card\n"
                                       "B,youtube,ccccccccccc,the frame the album had before\n"
                                       "C,youtube,ddddddddddd,another source now\nZ,youtube,zzzzzzzzzzz,no row\n")
    assert cv.read_skips(tmp_path / "skip.csv") == {("A", "youtube:aaaaaaaaaaa"), ("B", "youtube:ccccccccccc"),
                                                    ("C", "youtube:ddddddddddd"), ("Z", "youtube:zzzzzzzzzzz")}
    assert cv.read_skips(tmp_path / "none.csv") == set()
    table_ = cv.load_covers(tmp_path / "covers.csv", tmp_path / "96", skip_path=tmp_path / "skip.csv")
    assert table_.cover_for("A") == ("", None) and table_.is_skipped("A")
    assert table_.cover_for("B") == ("yt:bbbbbbbbbbb", tmp_path / "96" / "B.jpg")  # another ref: the skip is over
    assert table_.cover_for("C") == ("bc:6", tmp_path / "96" / "C.jpg")  # another source
    assert table_.skipped() == ["A"] and table_.skipped(["B", "C", "Z"]) == [] and not table_.is_skipped("Z")
    assert cv.load_covers(tmp_path / "covers.csv", tmp_path / "96").cover_for("A")[0] == "yt:aaaaaaaaaaa"  # no list, no skip
    assert cover_problems(table_, ["A", "B", "C"], []) == []  # a skipped album is not waiting for anything
    (tmp_path / "bad.csv").write_text("rym_id,source,ref,note\nA,vimeo,1,\n")
    with pytest.raises(ValueError, match="unknown source or empty ref"):
        cv.read_skips(tmp_path / "bad.csv")


def test_refs_and_sprites_leave_a_skipped_row_alone_and_status_counts_it(tmp_path, capsys):
    albums = albums_csv(tmp_path / "albums.csv", [
        ["A", "", "x", "card", "", "", "", "", "https://www.youtube.com/watch?v=aaaaaaaaaaa"],
        ["B", "", "x", "frame", "", "", "", "", "https://www.youtube.com/watch?v=bbbbbbbbbbb"]])
    covers_path = tmp_path / "covers.csv"
    covers_path.write_text("rym_id,source,ref\nA,youtube,aaaaaaaaaaa\nB,youtube,bbbbbbbbbbb\n")
    skip = tmp_path / "skip.csv"
    skip.write_text("rym_id,source,ref,note\nA,youtube,aaaaaaaaaaa,a FULL ALBUM card\n")
    before = covers_path.read_bytes()
    net = Net()
    code = cv.run_refs(cv.Inputs(cv.cover_albums(albums), {}, {}, {}, {}), covers_path, tmp_path / "state.json", tmp_path / "96",
                       fetcher(net), out=lambda *a: None)
    assert code == 0 and covers_path.read_bytes() == before and net.asked == []  # the row stays: nothing asks for it again
    common = ["--albums", str(albums), "--covers", str(covers_path), "--state", str(tmp_path / "state.json"),
              "--sprites", str(tmp_path / "96"), "--skip", str(skip)]
    capsys.readouterr()
    assert cv.main(["sprites", "--dry-run", *common]) == 0
    assert "1 sprites to fetch: youtube 1" in capsys.readouterr().out  # B's; A's frame is not fetched
    todo = cv.missing_sprites(cv.without_skipped(cv.read_covers(covers_path), cv.read_skips(skip)), ["A", "B"], tmp_path / "96",
                              cv.State(tmp_path / "state.json"))
    assert todo == ["B"]


def test_status_counts_the_existing_albums_and_the_skipped_rows(tmp_path, capsys, monkeypatch):
    albums = albums_csv(tmp_path / "albums.csv", [
        ["E1", "spotify:album:" + OLD[1], "a", "another id", url("A" * 22), "", "", "", ""],
        ["A", "", "x", "card", "", "", "", "", "https://www.youtube.com/watch?v=aaaaaaaaaaa"],
        ["B", "", "x", "frame", "", "", "", "", "https://www.youtube.com/watch?v=bbbbbbbbbbb"]])
    (tmp_path / "covers.csv").write_text("rym_id,source,ref\nA,youtube,aaaaaaaaaaa\nB,youtube,bbbbbbbbbbb\n")
    (tmp_path / "skip.csv").write_text("rym_id,source,ref,note\nA,youtube,aaaaaaaaaaa,card\nQ,youtube,qqqqqqqqqqq,no such row\n")
    monkeypatch.setattr(cv.Inputs, "load", classmethod(lambda cls, albums_path, **kw: cls(cv.cover_albums(albums_path), {}, {}, {}, {})))
    assert cv.main(["status", "--albums", str(albums), "--covers", str(tmp_path / "covers.csv"), "--state",
                    str(tmp_path / "state.json"), "--sprites", str(tmp_path / "96"), "--skip", str(tmp_path / "skip.csv")]) == 0
    printed = capsys.readouterr().out
    assert "3 albums (1 existing with another Spotify link on the sheet, 2 new), 2 with a cover source" in printed
    assert "skipped: 1 row(s)" in printed and "1 line(s) of skip.csv match no row" in printed
    assert "sprites: 0 present, 1 missing" in printed  # the skipped row's sprite is not wanted
    assert "no cover source: 1" in printed and "E1" in printed


def test_the_committed_skip_list_names_rows_of_the_covers_table():
    """The eleven frames the owner named on docs/review/youtube-covers.jpg (6 October 2026), and the one
    last-resort match the first review of docs/review/caa-covers.jpg found wrong (West Side Story)."""
    skips = cv.read_skips(cv.DEFAULT_SKIP)
    rows = cv.read_covers(cv.DEFAULT_COVERS)
    wrong = {(key, of) for key, of in skips if of.startswith("caa:")}
    assert wrong == {("sp:3DCQhS6eII8WUExSzdN9sE", "caa:ccdcf53e-fe7b-4ee2-b820-0f8ae9436839")}
    skips -= wrong
    assert len(skips) == 11 and all(key in rows and of == cv.made_from(rows[key]) for key, of in skips)
    assert {of.split(":")[0] for _, of in skips} == {"youtube"}
    table_ = cv.load_covers(cv.DEFAULT_COVERS, cv.DEFAULT_SPRITES, skip_path=cv.DEFAULT_SKIP)
    assert sorted(table_.skipped()) == sorted(k for k, _ in skips)
    with cv.DEFAULT_SKIP.open(encoding="utf-8", newline="") as f:
        assert all(r["note"].strip() for r in csv.DictReader(f))  # every line says why
    assert cv._default_covers.__wrapped__().skip == frozenset(skips | wrong)  # the build reads it


# --- titles --------------------------------------------------------------------------------------------------

def test_a_new_albums_title_is_shown_as_native_and_latin_in_brackets():
    assert display_title("ヴィジョン クリエイション ニューサン", "Vision Creation Newsun") == "ヴィジョン クリエイション ニューサン [Vision Creation Newsun]"
    assert display_title("Симфония № 5", "Symphony No. 5") == "Симфония № 5 [Symphony No. 5]"
    assert display_title("悲愴 (1994)", "Hisou") == "悲愴 (1994) [Hisou]"  # a bracket with no letters says nothing
    assert display_title("静香 (III)", "Shizuka (III)") == "静香 (III) [Shizuka (III)]"  # nor one the Latin form has too
    # left as they are: RYM's own Latin form, in either order and either kind of bracket
    assert display_title("Mother (マザー)", "Mother") == "Mother (マザー)"
    assert display_title("勝訴ストリップ (Shōso Strip)", "Shouso Strip") == "勝訴ストリップ (Shōso Strip)"
    assert display_title("無罪モラトリアム [Muzai Moratorium]", "Muzai Moratorium") == "無罪モラトリアム [Muzai Moratorium]"
    # and: Latin script (accents included), no Latin form, the same text, no letter of another script
    assert display_title("Ágætis byrjun", "Agaetis byrjun") == "Ágætis byrjun"
    assert display_title("空中キャンプ", "") == "空中キャンプ" and display_title("空中キャンプ", "  ") == "空中キャンプ"
    assert display_title("Кино", "Кино") == "Кино"
    assert display_title("( )", "Untitled") == "( )" and display_title("★", "Blackstar") == "★"


def test_the_catalogs_bracketed_titles_do_not_touch_the_slugs(deduped):
    """Every new album of the committed catalog: the shown title is the catalog's, or that and its Latin form
    in brackets; the slug is made from the Latin form alone, as before; no existing album is touched."""
    catalog_, n = load_catalog(), len(deduped[0])
    cat = catalog_frame(deduped[0], catalog_)
    new = catalog_.iloc[n:]
    shown = [display_title(a, b) for a, b in zip(new["title"], new["title_latin"])]
    bracketed = [(s, a, b) for s, a, b in zip(shown, new["title"], new["title_latin"]) if s != a]
    assert len(bracketed) == 456 and all(s == f"{a.strip()} [{b.strip()}]" for s, a, b in bracketed)
    assert all(b.strip() and len(s) < 250 for s, _, b in bracketed)
    assert cat.slug_titles[n:] == [b or a for a, b in zip(new["title"], new["title_latin"])]  # not the shown form
    assert list(cat.frame["Title"][:n]) == [str(t) for t in deduped[0]["Title"]]
