import numpy as np

from rmr_pipeline.constants import IN_RAINBOWS_LIVE, IN_RAINBOWS_ROW, LIVE_POOL
from rmr_pipeline.recs import build_recs, top_k_neighbours
from rmr_pipeline.table import descriptor_cols, live_recommend, rec_matrix


def test_table_shape(table):
    assert table.shape == (4116, 193)
    assert table.loc[IN_RAINBOWS_ROW, "Title"] == "In Rainbows"


def test_kept_descriptor_columns(table):
    assert len(descriptor_cols(table)) == 120


def test_feature_matrix_matches_live_shape(table):
    X = rec_matrix(table.head(LIVE_POOL), 0.5)
    assert X.shape == (4000, 133)
    assert X.dtype == np.float32


def test_in_rainbows_matches_live_site(table):
    rows = live_recommend(table.head(LIVE_POOL), IN_RAINBOWS_ROW, 0.5)
    assert [table.loc[r, "Title"] for r in rows] == IN_RAINBOWS_LIVE


def test_dedupe_keeps_first_uri(deduped, table):
    sub, rows = deduped
    assert len(sub) == 4081
    assert len(rows) == 4081
    assert sub["URI"].is_unique
    assert len(table) - len(sub) == 35
    assert rows[:12] == list(range(12))


def test_top_k_excludes_self_even_with_exact_duplicates():
    X = np.array([[0, 0], [0, 0], [1, 0], [2, 0], [3, 0]], dtype=np.float32)
    out = top_k_neighbours(X, k=2)
    assert out.shape == (5, 2)
    assert out[0].tolist() == [1, 2]
    assert out[1].tolist() == [0, 2]
    for r in range(5):
        assert r not in out[r].tolist()


def test_catalog_recs_for_in_rainbows(deduped):
    sub, _ = deduped
    recs = build_recs(sub)

    def titles(ids):
        return [sub.loc[int(i), "Title"] for i in ids]

    for stop in ("sonic", "balanced", "mood"):
        assert recs[stop].shape == (4081, 10)
        assert all(len(set(row.tolist())) == 10 for row in recs[stop])
    assert titles(recs["mood"][11][:5]) == IN_RAINBOWS_LIVE
    assert titles(recs["balanced"][11][:5]) == [
        "You Will Never Know Why", "Korowód", "Avalon", "Alligator", "undun",
    ]
    assert titles(recs["sonic"][11][:1]) == ["Music for the Masses"]
