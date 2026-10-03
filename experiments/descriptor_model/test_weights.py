"""scores_to_weights and the rank-weight scheme. Run: .venv/bin/python -m pytest -q"""
import numpy as np
import pytest

import weights as W
from common import DESCRIPTORS, TABLE, Y64, formula_weight


def test_formula_matches_table():
    info = W.verify_formula(verbose=False)
    assert info["rows"] == 4116 and info["lattice_max_error"] < 1e-9
    assert info["max_weight"] == 1.5 and info["min_weight"] == pytest.approx(22 / 42)


def test_in_rainbows_row_11():
    row = TABLE.loc[11]
    assert row["Title"] == "In Rainbows"
    assert float(row["lush"]) == formula_weight(0) == 1.5
    assert float(row["male vocals"]) == formula_weight(1)
    assert float(row["melancholic"]) == formula_weight(3)  # "introspective" (dropped column) is at position 2
    assert float(row["introspective"]) == formula_weight(2)


def test_fixed_k_formula_weights():
    s = np.array([[0.1, 0.9, 0.5, 0.7],
                  [0.4, 0.3, 0.2, 0.1]])
    w = W.scores_to_weights(s, k=2, rank_weights="formula")
    assert w.tolist() == [[0.0, 63 / 42, 0.0, 62 / 42], [63 / 42, 62 / 42, 0.0, 0.0]]
    assert (W.scores_to_weights(s, k=0, rank_weights="formula") == 0).all()


def test_threshold_policy_and_min_max_k():
    s = np.array([[0.1, 0.9, 0.5, 0.7],
                  [0.4, 0.3, 0.2, 0.1]])
    rw = np.array([4.0, 3.0, 2.0, 1.0])
    w = W.scores_to_weights(s, threshold=0.5, rank_weights=rw)
    # album 0: 0.9, 0.7, 0.5 pass; album 1: nothing passes -> min_k=1 keeps its best
    assert w.tolist() == [[0.0, 4.0, 2.0, 3.0], [4.0, 0.0, 0.0, 0.0]]
    assert W.scores_to_weights(s, threshold=0.5, rank_weights=rw, min_k=0)[1].tolist() == [0, 0, 0, 0]
    assert W.scores_to_weights(s, threshold=0.5, rank_weights=rw, max_k=2)[0].tolist() == [0.0, 4.0, 0.0, 3.0]
    with pytest.raises(ValueError):
        W.scores_to_weights(s, k=2, threshold=0.5)
    with pytest.raises(ValueError):
        W.scores_to_weights(s)


def test_calibrate_threshold_hits_target_count():
    rng = np.random.default_rng(0)
    s = rng.random((200, 120))
    t = W.calibrate_threshold(s, 10.6)
    counts = (s >= t).sum(1)
    assert counts.mean() == pytest.approx(10.6, abs=0.01)
    w = W.scores_to_weights(s, threshold=t, rank_weights="formula", min_k=0)
    assert ((w > 0).sum(1) == counts).all()


def test_empirical_rank_weights_toy():
    y = np.array([[1.5, 1.4, 0.0, 0.0],
                  [0.0, 1.5, 1.2, 1.0],
                  [1.3, 0.0, 0.0, 0.0]])
    w = W.empirical_rank_weights(y, max_k=4, min_count=2)
    assert w[0] == pytest.approx((1.5 + 1.5 + 1.3) / 3)
    assert w[1] == pytest.approx((1.4 + 1.2) / 2)
    assert (np.diff(w) <= 0).all() and (w >= 22 / 42).all()  # ranks 2-3: line fit, floored


def test_train_rank_weights_shape_and_order():
    w = W.train_rank_weights()
    assert w.shape == (len(DESCRIPTORS),) and (np.diff(w) <= 0).all()
    assert 1.49 < w[0] <= 1.5 and w[9] < formula_weight(9)  # lyric gaps pull the mean below the formula


def test_true_weights_round_trip_as_scores():
    # using an album's own weights as scores with k = its count reproduces its descriptor set and order
    y = Y64[[0, 11, 100]]
    for r in range(3):
        k = int((y[r] > 0).sum())
        w = W.scores_to_weights(y[r:r + 1], k=k, rank_weights="formula")[0]
        assert ((w > 0) == (y[r] > 0)).all()
        assert (np.argsort(-w, kind="stable")[:k] == np.argsort(-y[r], kind="stable")[:k]).all()
