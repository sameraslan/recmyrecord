import numpy as np

from rmr_pipeline.audio import descriptors, site_matrix
from rmr_pipeline.constants import IN_RAINBOWS_LIVE, IN_RAINBOWS_ROW, LIVE_POOL, SLIDER, STOPS
from rmr_pipeline.recs import top_k_mutual, top_k_neighbours
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


def test_catalog_recs_for_in_rainbows(deduped, site_recs):
    """The mood stop is the descriptor side, which the audio block barely touches: it stays pinned
    to the live site's answer. The sonic and balanced lists depend on the audio store, so they are
    checked against the committed files (test_outputs) and by what the stops mean (below)."""
    sub, _ = deduped
    for stop in ("sonic", "balanced", "mood"):
        assert site_recs[stop].shape == (4081, 10)
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
