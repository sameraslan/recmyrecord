import math

import numpy as np
import pandas as pd
import pytest

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.catalog import (WEIGHT_PROFILES, CatalogError, catalog_frame, load_aliases, load_catalog,
                                  neighbour_clusters, new_album_cover, rym_columns)
from rmr_pipeline.constants import AUDIO, CATALOG_DESCRIPTORS, LYRIC_DROP, META, NON_MOOD, VOCALS
from rmr_pipeline.slugs import make_slugs
from rmr_pipeline.table import descriptor_cols
from rmr_pipeline.vocab import build_vocab

# Ten kept descriptors, one vocals column and two lyric ones (constants.LYRIC_DROP), in table order.
COLS = ["dark", "male vocals", "love", "warm", "cold", "lush", "raw", "death", "epic", "calm", "sad", "soft", "LGBT"]
RANK = WEIGHT_PROFILES["rank"]


def table(*albums: dict) -> pd.DataFrame:
    """A feature table: each album is {descriptor: its 0-based place on the page}, weighted as the real one."""
    rows = [{"Title": f"T{i}", "Artist": f"A{i}", "URI": f"spotify:album:{i:022d}",
             **{c: (63 - a[c]) / 42 if c in a else 0.0 for c in COLS}} for i, a in enumerate(albums)]
    return pd.DataFrame(rows, columns=["Title", "Artist", "URI"] + COLS)


def catalog(sub: pd.DataFrame, *new: dict, sheet: dict[int, str] | None = None) -> pd.DataFrame:
    """A catalog table: the albums of `sub` in order, then `new` (dicts of catalog fields)."""
    rows = [{"rym_id": f"Album{i + 1}", "title": "ignored", "artist": "ignored", "legacy_uri": u,
             "top_descriptors": (sheet or {}).get(i, "")} for i, u in enumerate(sub["URI"])]
    rows += [{"rym_id": f"Album{900 + i}", "title": f"N{i}", "artist": f"B{i}", "legacy_uri": "", **r}
             for i, r in enumerate(new)]
    fields = ["rym_id", "title", "artist", "title_latin", "artist_latin", "top_descriptors", "spotify_url", "legacy_uri"]
    return pd.DataFrame(rows, columns=fields).fillna("")


def weights(cat, row: int) -> dict[str, float]:
    return {c: float(v) for c, v in cat.frame.iloc[row][COLS].items() if v > 0}


def words(cat, row: int) -> list[str]:
    """The album's kept descriptors in page order."""
    p = cat.places.iloc[row]
    return list(p[p >= 0].sort_values().index)


def test_the_weight_profiles_have_one_length_and_rank_is_the_tables_formula():
    assert RANK == tuple((63 - p) / 42 for p in range(CATALOG_DESCRIPTORS))
    assert RANK[0] == 1.5
    length = math.sqrt(sum(w * w for w in RANK))
    for name in ("equal", "slope"):
        assert math.sqrt(sum(w * w for w in WEIGHT_PROFILES[name])) == pytest.approx(length, rel=1e-12)
    assert len(set(WEIGHT_PROFILES["equal"])) == 1
    slope = WEIGHT_PROFILES["slope"]
    assert slope[7] / slope[0] == pytest.approx(0.5)
    assert all(a - b == pytest.approx(slope[0] / 14) for a, b in zip(slope, slope[1:]))


def test_the_vocals_columns_come_from_the_non_mood_set():
    assert set(VOCALS) == {"male vocals", "female vocals", "androgynous vocals"} and set(VOCALS) <= NON_MOOD


def test_an_existing_album_is_cut_to_its_first_eight_over_every_column_lyric_and_vocals_included():
    sub = table({c: p for p, c in enumerate(COLS[:11])})  # 11 descriptors: dark first, sad last
    cat = catalog_frame(sub, catalog(sub), existing="table", aliases={})
    assert words(cat, 0) == COLS[:8]  # male vocals, love and death are among them
    assert weights(cat, 0) == {c: RANK[p] for p, c in enumerate(COLS[:8])}
    assert weights(cat, 0) == {c: float(sub.loc[0, c]) for c in COLS[:8]}  # the table's own values
    assert list(cat.frame.columns) == ["Title", "Artist", "URI"] + COLS
    assert (cat.frame["Title"][0], cat.frame["Artist"][0], cat.keys, cat.spotify_ids) == ("T0", "A0", ["Album1"], ["0" * 22])
    assert not cat.is_new.any()


def test_without_vocals_the_next_descriptor_moves_up_and_the_places_are_renumbered():
    sub = table({c: p for p, c in enumerate(COLS[:11])})
    cat = catalog_frame(sub, catalog(sub), existing="table-novocals", aliases={})
    kept = [c for c in COLS[:10] if c != "male vocals"][:8]
    assert words(cat, 0) == kept and "epic" in kept
    assert weights(cat, 0) == {c: RANK[p] for p, c in enumerate(kept)}
    assert catalog_frame(sub, catalog(sub), aliases={}).frame.equals(cat.frame)  # the default


def test_gaps_in_the_tables_places_are_closed_and_equal_weights_go_to_the_earlier_column():
    sub = table({"dark": 0, "warm": 3, "cold": 9},  # places 0, 3, 9 on the page
                {c: 5 for c in COLS if c not in VOCALS})  # twelve equal weights
    cat = catalog_frame(sub, catalog(sub), aliases={})
    assert weights(cat, 0) == {"dark": RANK[0], "warm": RANK[1], "cold": RANK[2]}
    assert words(cat, 1) == [c for c in COLS if c not in VOCALS][:8]


def test_an_album_with_fewer_than_eight_keeps_them_all():
    sub = table({"sad": 0, "dark": 1}, {})
    cat = catalog_frame(sub, catalog(sub), aliases={})
    assert words(cat, 0) == ["sad", "dark"] and words(cat, 1) == []
    assert np.isfinite(cat.frame[COLS].to_numpy()).all()


def test_a_new_album_takes_its_sheet_list_names_without_a_column_take_no_place():
    sub = table({"dark": 0})
    new = {"top_descriptors": "Warm, grief, death, SOFT, antireligious, lgbtq, calm, male vocals",
           "title": "夢", "title_latin": "Yume", "artist": "ランプ", "artist_latin": "Lamp",
           "spotify_url": "https://open.spotify.com/album/" + "a" * 22}
    cat = catalog_frame(sub, catalog(sub, new, {"top_descriptors": ""}), aliases={"LGBTQ": "LGBT"})
    assert words(cat, 1) == ["warm", "death", "soft", "LGBT", "calm"]  # case-insensitive, alias, vocals dropped
    assert weights(cat, 1) == {c: RANK[p] for p, c in enumerate(["warm", "death", "soft", "LGBT", "calm"])}
    assert words(cat, 2) == []
    assert list(cat.is_new) == [False, True, True] and cat.keys == ["Album1", "Album900", "Album901"]
    assert cat.spotify_ids == ["0" * 22, "a" * 22, ""]
    assert (cat.frame["Title"][1], cat.frame["Artist"][1]) == ("夢", "ランプ")  # what the catalog shows
    assert (cat.slug_titles, cat.slug_artists) == (["T0", "Yume", "N1"], ["A0", "Lamp", "B1"])
    r = cat.report
    assert (r.lists, r.kept, r.lyric, r.vocals, r.unknown) == (1, 3, 2, 1, 2)
    assert r.unknown_names == {"grief": 1, "antireligious": 1}
    assert "2 unknown" in cat.summary() and "grief 1" in cat.summary()


def test_in_table_mode_a_listed_vocals_descriptor_is_kept_and_a_name_listed_twice_counts_once():
    sub = table({"dark": 0})
    cat = catalog_frame(sub, catalog(sub, {"top_descriptors": "male vocals, LGBT, LGBTQ, sad"}), existing="table",
                        aliases={"LGBTQ": "LGBT"})
    assert words(cat, 1) == ["male vocals", "LGBT", "sad"]


def test_only_the_first_eight_names_of_a_list_are_read():
    sub = table({"dark": 0})
    names = [c for c in COLS if c not in VOCALS]
    cat = catalog_frame(sub, catalog(sub, {"top_descriptors": ", ".join(names)}), aliases={})
    assert words(cat, 1) == names[:8]


@pytest.mark.parametrize("profile", ["equal", "slope"])
def test_the_other_profiles_weight_by_place_too(profile):
    sub = table({c: p for p, c in enumerate(COLS[:11])})
    cat = catalog_frame(sub, catalog(sub, {"top_descriptors": "sad, soft, grief, calm"}), weights=profile, aliases={})
    w = WEIGHT_PROFILES[profile]
    kept = [c for c in COLS[:10] if c != "male vocals"][:8]
    assert weights(cat, 0) == {c: w[p] for p, c in enumerate(kept)}
    assert weights(cat, 1) == {"sad": w[0], "soft": w[1], "calm": w[2]}
    assert words(cat, 1) == ["sad", "soft", "calm"]  # the page order survives equal weights


def test_sheet_mode_reads_the_sheet_list_of_an_existing_album_and_falls_back_to_the_table():
    sub = table({"dark": 0, "male vocals": 1, "warm": 2}, {"cold": 0, "male vocals": 1, "lush": 2})
    cat = catalog_frame(sub, catalog(sub, sheet={0: "sad, male vocals, dark"}), existing="sheet", aliases={})
    assert words(cat, 0) == ["sad", "dark"]
    assert words(cat, 1) == ["cold", "lush"]
    assert cat.report.lists == 1


def test_the_catalog_must_start_with_the_tables_albums_in_order():
    sub = table({"dark": 0}, {"sad": 0})
    with pytest.raises(CatalogError, match="row 1.*spotify:album:0000000000000000000001"):
        catalog_frame(sub, catalog(sub).iloc[::-1].reset_index(drop=True), aliases={})
    with pytest.raises(CatalogError, match="1 album"):
        catalog_frame(sub, catalog(sub).iloc[:1], aliases={})
    with pytest.raises(CatalogError, match="Album2"):  # an album of the site the table does not have
        catalog_frame(sub.iloc[:1], catalog(sub), aliases={})


def test_bad_inputs_are_named():
    sub = table({"dark": 0})
    with pytest.raises(ValueError, match="weights"):
        catalog_frame(sub, catalog(sub), weights="loud", aliases={})
    with pytest.raises(ValueError, match="existing"):
        catalog_frame(sub, catalog(sub), existing="page", aliases={})
    with pytest.raises(CatalogError, match="nope"):
        catalog_frame(sub, catalog(sub), aliases={"x": "nope"})
    with pytest.raises(CatalogError, match="Album900.*twice"):
        catalog_frame(sub, catalog(sub, {}, {}).assign(rym_id=["Album1", "Album900", "Album900"]), aliases={})
    with pytest.raises(CatalogError, match="spotify_url"):
        catalog_frame(sub, catalog(sub, {"spotify_url": "https://open.spotify.com/track/x"}), aliases={})


def test_the_words_shown_follow_the_page_order_when_places_are_given():
    sub = table({"sad": 0, "male vocals": 1, "death": 2, "dark": 3}, {"dark": 0}, {"dark": 0, "sad": 1})
    cat = catalog_frame(sub, catalog(sub), weights="equal", aliases={})
    vocab, tops = build_vocab(cat.frame, cat.places)
    assert vocab == ["dark", "sad"]  # most frequent first, lyric and vocals columns left out
    assert [vocab[i] for i in tops[0]] == ["sad", "dark"]  # page order
    assert [vocab[i] for i in build_vocab(cat.frame)[1][0]] == ["dark", "sad"]  # by weight, ties to the common word


def test_a_new_album_takes_the_cluster_of_most_of_its_nearest_existing_albums():
    X = np.array([[0.0], [1.0], [2.0], [3.0], [4.0], [10.0], [11.0],  # existing
                  [0.4], [10.4], [2.6]])
    assert neighbour_clusters(X, [1, 1, 2, 2, 2, 5, 5]) == [2, 2, 2]
    assert neighbour_clusters(X, [1, 1, 2, 2, 2, 5, 5], k=2) == [1, 5, 2]
    # two clusters with two albums each among the four nearest: the cluster of the nearest album
    assert neighbour_clusters(X, [1, 1, 2, 2, 3, 5, 5], k=4)[0] == 1
    assert neighbour_clusters(X[:7], [1, 1, 2, 2, 2, 5, 5]) == []


def test_a_new_album_has_no_cover_yet():
    assert new_album_cover("Album900") == ("", None)


def test_the_committed_aliases_point_at_table_columns(deduped):
    aliases = load_aliases()
    cols = rym_columns(deduped[0])
    assert aliases and set(aliases.values()) <= set(cols)
    assert not {a.lower() for a in aliases} & {c.lower() for c in cols}  # an alias is never a column's own name


def test_the_table_has_176_descriptor_columns_weighted_by_place(deduped):
    """What catalog_frame assumes of the feature table: a cell is (63 - place) / 42, so an album's first
    eight are its eight largest and, where the places have no gap, already the rank profile."""
    sub, _ = deduped
    cols = rym_columns(sub)
    assert len(cols) == 176 and [c for c in cols if c not in LYRIC_DROP] == descriptor_cols(sub)
    assert not set(cols) & (set(META) | set(AUDIO))
    T = sub[cols].to_numpy(dtype=np.float64)
    grid = {(63 - p) / 42 for p in range(42)}
    assert set(np.unique(T[T > 0]).tolist()) <= grid
    assert all(len(set(row[row > 0].tolist())) == (row > 0).sum() for row in T)  # no two descriptors at one place
    first8 = [tuple(np.sort(row[row > 0])[::-1][:8]) for row in T]
    assert sum(v == RANK[:len(v)] for v in first8) == 4055  # the other 26 have a gap among their first eight
    cat = catalog_frame(sub, load_catalog().iloc[:len(sub)], existing="table")
    same = (cat.frame[cols].to_numpy() == np.where(cat.places.to_numpy() >= 0, T, 0.0)).all(axis=1)
    assert same.sum() == 4055


def test_the_real_catalog(deduped):
    sub, _ = deduped
    catalog = load_catalog()
    cat = catalog_frame(sub, catalog)
    n = len(sub)
    assert (len(cat.frame), n, int(cat.is_new.sum())) == (10467, 4081, 10467 - 4081)
    assert not cat.is_new[:n].any() and cat.is_new[n:].all()
    assert cat.keys == list(catalog["rym_id"]) and len(set(cat.keys)) == len(cat.keys)
    assert list(cat.frame["Title"][:n]) == list(sub["Title"]) and list(cat.frame["Artist"][:n]) == list(sub["Artist"])
    assert descriptor_cols(cat.frame) == descriptor_cols(sub)
    D = cat.frame[descriptor_cols(cat.frame)].to_numpy(dtype=np.float64)
    assert np.isfinite(D).all() and D.min() == 0.0 and D.max() == 1.5
    assert ((cat.frame[rym_columns(sub)] > 0).sum(axis=1) <= CATALOG_DESCRIPTORS).all()
    assert (cat.frame[list(VOCALS)] == 0).all().all()
    assert sum(1 for s in cat.spotify_ids if not s) == 774
    assert cat.report.lists == 10467 - 4081 - 12  # twelve new albums have no list
    assert cat.report.unknown == sum(cat.report.unknown_names.values()) > 0
    # the site's slugs do not move when the new albums are added after them
    artists = [clean_artist(a) for a in cat.slug_artists[:n]] + cat.slug_artists[n:]
    slugs = make_slugs(cat.slug_titles, artists)
    assert slugs[:n] == make_slugs(cat.slug_titles[:n], artists[:n])
    assert len(set(slugs)) == len(slugs) and "album" not in slugs
