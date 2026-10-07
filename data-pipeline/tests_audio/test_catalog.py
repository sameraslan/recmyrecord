"""The catalog builder (rmr_catalog): the pairing rule on small examples, and the committed files against the
sheet export when it is on this machine (it is not committed)."""
import pytest

from rmr_catalog.build import DEFAULT_CATALOG, build, tables
from rmr_catalog.pairing import REASONS, pair
from rmr_catalog.sources import DEFAULT_SHEET, SHEET_COLUMNS, ChartRow, Existing, iso_date, load_sheet, spotify_album_id
from rmr_pipeline.keys import DEFAULT_KEYS, check_rows, placeholder


def sid(n: int) -> str:
    return f"{n:022d}"


def old(index: int, artist: str, title: str, year: str = "1990", spotify: int | None = None) -> Existing:
    spotify = 100 + index if spotify is None else spotify
    return Existing(index, f"spotify:album:{sid(100 + index)}", title, artist, (artist,), f"{artist} - {title}",
                    sid(spotify), (year,) if year else (), year)


def new(n: int, artist: str, title: str, year: str = "1990", spotify: int | None = None, flag: str = "",
        label: str = "", artist_latin: str = "", title_latin: str = "") -> ChartRow:
    row = dict.fromkeys(SHEET_COLUMNS, "")
    row.update(rank=str(n), artist=artist, title=title, release_date_iso=year, rym_id=f"Album{n}", type="Album",
               spotify_url=f"https://open.spotify.com/album/{sid(spotify)}" if spotify else "",
               rym_url=f"https://rateyourmusic.com/release/album/{n}/")
    return ChartRow(f"Album{n}", n, artist, title, artist_latin, title_latin, year, sid(spotify) if spotify else "",
                    flag, label, row)


def result(existing, chart, manual=None):
    """({album index: (rym_id, matched_by)}, {(album index, rym_id): reasons})"""
    p = pair(existing, chart, manual)
    return {i: (s.rym_id, by) for i, (s, by) in p.partner.items()}, p.doubts


def test_spotify_id_then_artist_title_year():
    existing = [old(0, "Radiohead", "OK Computer", "1997"), old(1, "The Beatles", "Abbey Road", "1969"),
                old(2, "Björk", "Homogenic", "1997"), old(3, "Nobody", "Nothing", "2001")]
    chart = [new(1, "Radiohead", "OK Computer", "1997", spotify=100),  # the same Spotify album
             new(2, "Beatles", "Abbey road", "1969", spotify=999),  # another edition's id: folded names and year
             new(3, "Bjork", "Homogenic", "1997"),  # no Spotify link at all
             new(4, "Somebody", "Something", "2001")]
    pairs, doubts = result(existing, chart)
    assert pairs == {0: ("Album1", "spotify_id"), 1: ("Album2", "artist_title_year"), 2: ("Album3", "artist_title_year")}
    assert doubts == {}


def test_an_equal_spotify_id_with_other_names_is_not_a_match():
    """The feature table's URI is sometimes another album's: Silent Hill carried Silent Hill 2's."""
    existing = [old(0, "Akira Yamaoka", "Silent Hill", "1999")]
    chart = [new(1, "山岡晃", "Silent Hill 2", "2001", spotify=100, artist_latin="Akira Yamaoka"),
             new(2, "山岡晃", "Silent Hill", "1999", artist_latin="Akira Yamaoka")]
    pairs, doubts = result(existing, chart)
    assert pairs == {0: ("Album2", "artist_title_year")}  # found under the sheet's Latin name
    assert doubts == {(0, "Album1"): ["spotify_link_names_differ"]}


def test_an_equal_spotify_id_pairs_through_spelling_and_credit_differences():
    existing = [old(0, "Fela Anikulapo Kuti and Afrika 70", "Zombie", "1977"),
                old(1, "Estonian Philharmonic Chamber Choir / Tõnu Kaljuste", "Te Deum", "1993"),
                old(2, "Nick Drake", "Bryter Layter", "1970"), old(3, "Ween", "Live in Chicago", "2004"),
                old(4, "David Bowie", "Blackstar", "")]
    chart = [new(1, "Fela Kuti & The Africa '70", "Zombie", "1977", spotify=100),
             new(2, "Arvo Pärt", "Te Deum", "1993", spotify=101),
             new(3, "Nick Drake", "Bryter Layter", "1971", spotify=102),  # RYM moved the date by a year
             new(4, "Ween", "Live in Chicago", "2020", spotify=103),
             new(5, "David Bowie", "Blackstar", "2016", spotify=104)]
    pairs, doubts = result(existing, chart)
    assert pairs == {i: (f"Album{i + 1}", "spotify_id") for i in range(5)}
    assert doubts == {(1, "Album2"): ["artist_differs"], (3, "Album4"): ["year_differs"], (4, "Album5"): ["year_unknown"]}


def test_never_a_title_alone_across_artists():
    existing = [old(0, "Hendrix", "Live at the Fillmore East", "1999"), old(1, "Bill Hicks", "Relentless", "1992"),
                old(2, "Magma", "Live", "1975")]
    chart = [new(1, "Neil Young & Crazy Horse", "Live at the Fillmore East", "2006", flag="likely",
                 label="Hendrix - Live at the Fillmore East"),
             new(2, "Sutcliffe Jugend", "Relentless", "1992"), new(3, "The Wailers", "Live!", "1975")]
    pairs, doubts = result(existing, chart)
    assert pairs == {}
    assert doubts == {(0, "Album1"): ["sheet_flag_likely"], (1, "Album2"): ["same_title_year_other_artist"],
                      (2, "Album3"): ["same_title_year_other_artist"]}


def test_a_shared_billed_name_with_title_and_year_pairs_and_is_listed():
    existing = [old(0, "Bob Marley & The Wailers", "Exodus", "1977"),
                old(1, "Wiener Philharmoniker / Carlos Kleiber", "Symphonie Nr.5", "1975"),
                old(2, "Wiener Philharmoniker / Leonard Bernstein", "Symphonie No. 5", "1988")]
    chart = [new(1, "The Wailers", "Exodus", "1977"),
             new(2, "Ludwig van Beethoven & Wiener Philharmoniker & Carlos Kleiber", "Symphonie Nr.5", "1975"),
             new(3, "Gustav Mahler & Wiener Philharmoniker & Leonard Bernstein", "Symphonie No. 5", "1997")]
    pairs, doubts = result(existing, chart)
    assert pairs == {0: ("Album1", "artist_title_year"), 1: ("Album2", "artist_title_year")}  # not the 1997 recording
    assert doubts[(0, "Album1")] == doubts[(1, "Album2")] == ["artist_credit_varies"]
    assert (2, "Album3") not in doubts or "artist_credit_varies" not in doubts[(2, "Album3")]


def test_a_sequel_an_edition_or_another_year_is_not_the_original():
    existing = [old(0, "Christopher Larkin", "Hollow Knight", "2017"), old(1, "The Knife", "Silent Shout", "2006"),
                old(2, "The Can", "Monster Movie", "1969"), old(3, "Kevin Penkin", "Made in Abyss", "2017"),
                old(4, "Can", "Soundtracks", "1970")]
    chart = [new(1, "Christopher Larkin", "Hollow Knight: Silksong", "2025", flag="yes",
                 label="Christopher Larkin - Hollow Knight"),
             new(2, "The Knife", "Silent Shout: An Audio Visual Experience", "2007"),
             new(3, "The Can", "Monster Movie", "1970"), new(4, "Kevin Penkin", "Made in Abyss 3", "2022"),
             new(5, "Can", "Soundtracks", "1973")]
    pairs, doubts = result(existing, chart)
    assert pairs == {}
    assert doubts == {(0, "Album1"): ["edition_or_sequel", "sheet_flag_yes"], (1, "Album2"): ["edition_or_sequel"],
                      (2, "Album3"): ["year_off_by_one"], (3, "Album4"): ["edition_or_sequel"],
                      (4, "Album5"): ["same_name_other_year"]}


def test_competing_candidates_are_left_for_review():
    existing = [old(0, "Boris", "Smile", "2008"), old(1, "Tim Maia", "Tim Maia", "1971"),
                old(2, "Tim Maia", "Tim Maia", "1971", spotify=555), old(3, "Os Tincoãs", "Os Tincoãs", "1973"),
                old(4, "Coltrane", "Ascension", "1966")]
    chart = [new(1, "Boris", "Smile", "2008"), new(2, "Boris", "Smile", "2008"),  # two editions, two rows
             new(3, "Tim Maia", "Tim Maia", "1971"),  # one row, two albums
             new(4, "Os Tincoãs", "Os Tincoãs", "1977", spotify=103),  # the Spotify id says 1977...
             new(5, "Os Tincoãs", "Os Tincoãs", "1973"),  # ...artist, title and year say 1973
             new(6, "Coltrane", "Ascension", "1966", spotify=104), new(7, "Coltrane", "Ascension", "1966", spotify=104)]
    pairs, doubts = result(existing, chart)
    assert pairs == {}
    assert {k for k, v in doubts.items() if "competing" in v} == {
        (0, "Album1"), (0, "Album2"), (1, "Album3"), (2, "Album3"), (3, "Album4"), (3, "Album5"), (4, "Album6"),
        (4, "Album7")}


def test_the_spotify_id_settles_a_group_of_one_name_and_the_rest_is_listed():
    existing = [old(0, "Boris", "Smile", "2008")]
    chart = [new(1, "Boris", "Smile", "2008", flag="yes", label="Boris - Smile"),
             new(2, "Boris", "Smile", "2008", spotify=100, flag="missing")]
    pairs, doubts = result(existing, chart)
    assert pairs == {0: ("Album2", "spotify_id")}
    assert doubts == {(0, "Album1"): ["same_name_group", "sheet_flag_yes"], (0, "Album2"): ["sheet_flag_missing"]}


def test_pairs_are_one_to_one_and_hand_set_keys_are_kept():
    existing = [old(0, "A", "One"), old(1, "A", "One", spotify=777), old(2, "B", "Two"), old(3, "C", "Three"),
                old(4, "D", "Four")]
    chart = [new(1, "A", "One"), new(2, "B", "Two"), new(3, "C", "Three sequel"), new(4, "D", "Four")]
    manual = {existing[3].uri: "Album3", existing[2].uri: placeholder(existing[2].uri), existing[4].uri: "Album77"}
    p = pair(existing, chart, manual)
    assert {i: (s.rym_id, by) for i, (s, by) in p.partner.items()} == {3: ("Album3", "manual")}
    assert set(p.doubts) == {(0, "Album1"), (1, "Album1")}  # nothing about the albums decided by hand
    catalog, keys, doubts = tables(existing, chart, p, manual)
    check_rows(keys)
    assert [(k["rym_id"], k["matched_by"]) for k in keys] == [
        (placeholder(existing[0].uri), "none"), (placeholder(existing[1].uri), "none"),
        (placeholder(existing[2].uri), "manual"), ("Album3", "manual"), ("Album77", "manual")]
    assert [k["doubt"] for k in keys] == ["competing", "competing", "", "", ""]
    assert [r["rym_id"] for r in catalog] == [k["rym_id"] for k in keys] + ["Album1", "Album2", "Album4"]
    assert [r["on_chart"] for r in catalog] == [0, 0, 0, 1, 0, 1, 1, 1]
    assert (catalog[3]["title"], catalog[3]["rym_title"], catalog[3]["rank"]) == ("Three", "Three sequel", 3)
    assert catalog[4]["rym_url"] == "" and catalog[4]["legacy_uri"] == existing[4].uri  # a RYM id from outside the chart
    assert [(d["legacy_uri"], d["rym_id"], d["default"], d["legacy_key"]) for d in doubts] == [
        (e.uri, "Album1", "unpaired", placeholder(e.uri)) for e in existing[:2]]
    assert all(reason in REASONS for d in doubts for reason in d["reason"].split(";"))


def test_dates_and_links():
    assert [iso_date(d) for d in ("16 June 1997", "June 1997", "1997", "", "soon", "32 Juno 1997")] == [
        "1997-06-16", "1997-06", "1997", "", "", ""]
    assert spotify_album_id("https://open.spotify.com/album/7dxKtc08dYeRVHt3p9CZJn?si=x") == "7dxKtc08dYeRVHt3p9CZJn"
    assert spotify_album_id("https://open.spotify.com/track/7dxKtc08dYeRVHt3p9CZJn") == ""


def test_committed_catalog_is_what_the_builder_gives():
    """The sheet export is committed (catalog/source/); skipped only where it has been removed."""
    if not DEFAULT_SHEET.exists():
        pytest.skip(f"no sheet export at {DEFAULT_SHEET}")
    files = build()
    for name, text in files.items():
        path = DEFAULT_KEYS if name == "keys.csv" else DEFAULT_CATALOG / name
        assert path.read_text(encoding="utf-8") == text, f"{path} is stale: run python -m rmr_catalog"
    chart = load_sheet()
    assert len(chart) == 10000 and [s.rank for s in chart] == list(range(1, 10001))
