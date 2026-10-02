import numpy as np
import pytest
from threadpoolctl import threadpool_limits

from rmr_pipeline.audio import descriptors, site_matrix
from rmr_pipeline.constants import IN_RAINBOWS_LIVE, IN_RAINBOWS_ROW, LIVE_POOL, SLIDER, STOPS
from rmr_pipeline.recs import top_k_mutual, top_k_neighbours
from rmr_pipeline.table import descriptor_cols, live_recommend, rec_matrix


def test_table_shape(table):
    """4 meta columns, 13 Spotify audio columns, 176 descriptors; the catalog only grows at the end,
    so the rows the live recommender searched and In Rainbows keep their places."""
    assert table.shape[1] == 193
    assert len(table) >= LIVE_POOL
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
    assert len(sub) == len(rows) == table["URI"].nunique()
    assert sub["URI"].is_unique
    assert len(table) - len(sub) == int(table["URI"].duplicated().sum()) > 0
    assert rows == table.drop_duplicates("URI", keep="first").index.tolist()  # the first row of each URI
    assert sub["Title"].tolist() == table.loc[rows, "Title"].tolist()
    assert rows[:12] == list(range(12))


def test_top_k_excludes_self_even_with_exact_duplicates():
    X = np.array([[0, 0], [0, 0], [1, 0], [2, 0], [3, 0]], dtype=np.float32)
    out = top_k_neighbours(X, k=2)
    assert out.shape == (5, 2)
    assert out[0].tolist() == [1, 2]
    assert out[1].tolist() == [0, 2]
    for r in range(5):
        assert r not in out[r].tolist()


def _tied_rows(integers: bool) -> np.ndarray:
    """1,500 rows with exact duplicates and exact distance ties: one row 41 times (more ties than
    the spare candidates of the first pass), another 3 times."""
    rng = np.random.default_rng(0)
    X = rng.integers(0, 3, size=(1500, 20)) if integers else rng.normal(size=(1500, 20))
    X[100:140] = X[7]
    X[900] = X[1499] = X[3]
    return X.astype(np.float32)


def _by_distance_then_row(X: np.ndarray, k: int) -> np.ndarray:
    D = ((X[:, None, :].astype(np.float64) - X[None, :, :]) ** 2).sum(axis=2)
    np.fill_diagonal(D, np.inf)
    return np.argsort(D, axis=1, kind="stable")[:, :k]


@pytest.mark.parametrize("integers", [True, False])
def test_neighbour_order_is_distance_then_row_number_whatever_the_thread_count(integers):
    """recs.json has to come out the same on every machine: scikit-learn returns equal distances in
    an order that depends on the number of OpenMP threads. Small integers give many exact ties
    (and exact distances for the reference); the float matrix only ties between its duplicates."""
    X = _tied_rows(integers)
    with threadpool_limits(limits=1):
        one = top_k_neighbours(X)
    with threadpool_limits(limits=8):
        eight = top_k_neighbours(X)
    assert np.array_equal(one, eight)
    assert np.array_equal(one, _by_distance_then_row(X, 10))
    assert one[3, :2].tolist() == [900, 1499] and one[900, :2].tolist() == [3, 1499]  # duplicates first, in row order
    assert one[100].tolist() == [7, *range(101, 110)]


def test_neighbour_ties_across_the_cut_keep_the_earlier_rows():
    """Every other row is at distance 1 from row 0: its list is rows 1..k, however many are tied."""
    X = np.vstack([np.zeros((1, 60)), np.eye(60)]).astype(np.float32)
    out = top_k_neighbours(X, k=10)
    assert out[0].tolist() == list(range(1, 11))
    assert out[60].tolist() == [0, *range(1, 10)]  # the origin at 1, then the other corners at sqrt(2)
    with pytest.raises(ValueError, match="k must be between 1 and 60"):
        top_k_neighbours(X, k=61)
    X[5, 3] = np.nan
    with pytest.raises(ValueError, match=r"non-finite values in rows \[5\]"):
        top_k_neighbours(X)


def test_mutual_ranking_does_not_depend_on_the_thread_count_and_ties_go_to_the_earlier_row():
    X = _tied_rows(integers=False)
    with threadpool_limits(limits=1):
        one = top_k_mutual(X)
    with threadpool_limits(limits=8):
        eight = top_k_mutual(X)
    assert np.array_equal(one, eight)
    assert all(r not in row and len(set(row)) == 10 for r, row in enumerate(one.tolist()))
    # Rows 3, 900 and 1499 are one point: wherever two of them are in a list they are tied, so in row order.
    for r, row in enumerate(one.tolist()):
        seen = [j for j in row if j in (3, 900, 1499)]
        assert seen == sorted(seen), r
        if seen and r not in (3, 900, 1499):
            assert row.index(seen[-1]) - row.index(seen[0]) == len(seen) - 1, r  # and next to each other
    assert one[3, :2].tolist() == [900, 1499]
    assert one[100].tolist() == [7, *range(101, 110)]
    with pytest.raises(ValueError, match="equally far"):
        top_k_mutual(np.zeros((12, 3), dtype=np.float32))


def test_catalog_recs_for_in_rainbows(deduped, site_recs):
    """The mood stop is the descriptor side, which the audio block barely touches: it stays pinned
    to the live site's answer. The sonic and balanced lists depend on the audio store, so they are
    checked against the committed files (test_outputs) and by what the stops mean (below)."""
    sub, _ = deduped
    for stop in ("sonic", "balanced", "mood"):
        assert site_recs[stop].shape == (len(sub), 10)
        assert all(len(set(row)) == 10 and r not in row for r, row in enumerate(site_recs[stop].tolist()))
    assert [sub.loc[int(i), "Title"] for i in site_recs["mood"][11][:5]] == IN_RAINBOWS_LIVE


def test_stops_trade_audio_for_descriptors(deduped, audio, site_recs):
    """From sonic to mood the lists get further in the audio block and closer in the descriptors,
    for the catalog on average and for In Rainbows."""
    sub, _ = deduped
    desc = descriptors(sub)

    def gap(M, rows):
        return {stop: np.linalg.norm(M[site_recs[stop][rows]] - M[rows][:, None, :], axis=2).mean() for stop in STOPS}

    for rows in (np.arange(len(sub)), np.array([IN_RAINBOWS_ROW])):
        by_audio, by_desc = gap(audio.block, rows), gap(desc, rows)
        assert by_audio["sonic"] < by_audio["balanced"] < by_audio["mood"]
        assert by_desc["sonic"] > by_desc["balanced"] > by_desc["mood"]


def test_build_recs_applies_hub_correction_only_where_asked(deduped, audio, site_recs, monkeypatch):
    import rmr_pipeline.recs as recs

    sub, _ = deduped
    monkeypatch.setattr(recs, "top_k_neighbours", lambda X: "plain")
    monkeypatch.setattr(recs, "top_k_mutual", lambda X: "mutual")
    assert recs.build_recs(sub, audio.block) == {"sonic": "plain", "balanced": "plain", "mood": "plain"}
    assert recs.build_recs(sub, audio.block, ("balanced",)) == {"sonic": "plain", "balanced": "mutual", "mood": "plain"}


def test_mutual_proximity_removes_hubs():
    """In a high-dimensional cloud the points near the centre are in far too many lists; mutual
    proximity evens that out and still returns each row's own neighbours, self excluded."""
    X = np.random.default_rng(0).normal(size=(400, 40)).astype(np.float32)
    plain, mutual = top_k_neighbours(X), top_k_mutual(X)
    assert mutual.shape == (400, 10)
    assert all(r not in row and len(set(row)) == 10 for r, row in enumerate(mutual.tolist()))
    count = lambda nbrs: np.bincount(nbrs.ravel(), minlength=400)  # noqa: E731
    assert count(mutual).max() < 0.6 * count(plain).max()
    assert (count(mutual) == 0).sum() < (count(plain) == 0).sum()
    assert (mutual[:, :, None] == plain[:, None, :]).any(axis=2).mean() > 0.5


def test_hub_correction_is_per_stop(deduped, audio, site_recs):
    sub, _ = deduped
    X = site_matrix(sub, audio.block, SLIDER["balanced"])
    mutual = top_k_mutual(X)
    count = lambda nbrs: np.bincount(nbrs.ravel(), minlength=len(X))  # noqa: E731
    assert count(mutual).max() < 0.6 * count(site_recs["balanced"]).max()
    assert not np.array_equal(mutual, site_recs["balanced"])
