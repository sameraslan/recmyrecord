"""recq metrics on tiny synthetic catalogues. Run: .venv/bin/python -m pytest test_recq.py -q"""
import numpy as np
import pytest

import recq


def _space(n=300, seed=0, slider=1.0, k=10):
    rng = np.random.default_rng(seed)
    audio = rng.random((n, 13))
    desc = np.zeros((n, 120))
    for i in range(n):
        cols = rng.choice(120, size=rng.integers(4, 14), replace=False)
        desc[i, cols] = 1.5 - np.arange(len(cols)) / 42
    fam = np.array(["a", "b", "c", "other"], dtype=object)[rng.integers(0, 4, n)]
    return recq.Space(audio, desc, slider, fam=fam, k=k), desc, rng


def test_rank_matrix_and_recall():
    D = np.array([[np.inf, 3.0, 1.0, 2.0], [5.0, np.inf, 5.0, 1.0]])
    rank = recq.rank_matrix(D)
    assert rank.tolist() == [[3, 2, 0, 1], [1, 3, 2, 0]]            # ties by index
    assert recq.top_k(D, 2).tolist() == [[2, 3], [3, 0]]
    pred = np.array([[2, 1], [0, 2]])
    assert recq.recall_into(pred, rank, 2).tolist() == [0.5, 0.5]
    assert recq.recall_into(pred, rank, 3).tolist() == [1.0, 1.0]
    assert recq.median_ref_rank(pred, rank).tolist() == [2.0, 2.5]


def test_rsq_by_hand():
    D = np.array([[np.inf, 1.0, 2.0, 3.0, 6.0]])                    # d_rand = 3
    ref = np.array([[1, 2]])                                        # d_oracle = 1.5
    assert recq.rsq(D, ref, ref)[0] == pytest.approx(1.0)
    assert recq.rsq(D, np.array([[2, 3]]), ref)[0] == pytest.approx((3 - 2.5) / 1.5)
    assert recq.rsq(D, np.array([[3, 4]]), ref)[0] == pytest.approx((3 - 4.5) / 1.5)      # worse than random < 0


def test_graded_ndcg_is_order_and_distance_sensitive():
    D = np.array([[np.inf, 1.0, 2.0, 3.0, 6.0]])
    ref = np.array([[1, 2]])
    assert recq.graded_ndcg(D, ref, ref, 1.0)[0] == pytest.approx(1.0)
    swapped = recq.graded_ndcg(D, np.array([[2, 1]]), ref, 1.0)[0]
    far = recq.graded_ndcg(D, np.array([[3, 4]]), ref, 1.0)[0]
    assert far < swapped < 1.0
    want = (np.exp(-2) + np.exp(-1) / np.log2(3)) / (np.exp(-1) + np.exp(-2) / np.log2(3))
    assert swapped == pytest.approx(want)


def test_genre_agreement():
    fam = np.array(["a", "a", "b", "other", "a"], dtype=object)
    lists = np.array([[1, 2], [0, 4], [0, 1]])
    g = recq.genre_agreement(lists, fam[[0, 1, 3]], fam)
    assert g[0] == 0.5 and g[1] == 1.0 and np.isnan(g[2])
    r = recq.genre_random(np.array([0, 2, 3]), fam)
    assert r[0] == pytest.approx(2 / 4) and r[1] == 0.0 and np.isnan(r[2])


def test_hub_stats():
    h = recq.hub_stats(np.array([1, 1, 2, 0]), np.array([0, 0, 0, 8]))
    assert h["inb_ratio"] == 2.0 and h["zero"] == 0.75 and h["zero_before"] == 0.25 and h["skew"] > h["skew_before"]


def test_oracle_is_one_everywhere():
    sp, desc, _ = _space()
    ev = np.arange(0, 300, 7)
    for retrieval in ("euclid",):
        s = recq.evaluate_space(sp, ev, desc[ev], retrieval=retrieval)
        for m in ("ov10", "R50", "R100", "RSQ", "ndcg", "inb_ratio_iso", "ov10_all", "RSQ_all", "inb_ratio_all"):
            assert s[m] == pytest.approx(1.0, abs=1e-12), m
        assert s["medrank"] == 5.5 and s["genre"] == pytest.approx(s["genre_real"])
        assert s["zero_iso"] == s["zero_before"] and s["skew_iso"] == pytest.approx(s["skew_before"])
    full = recq.evaluate_space(sp, ev, desc[ev], retrieval="ls-full")
    assert full["ov10_vs_ls_real"] == pytest.approx(1.0) and full["inb_ratio_iso"] == pytest.approx(1.0)


def test_isolated_inbound_equals_brute_force():
    sp, desc, rng = _space(n=200, seed=3)
    ev = np.array([5, 17, 60, 150])
    W = desc[ev] * (rng.random((4, 120)) < 0.5)                    # arbitrary wrong vectors
    s = recq.evaluate_space(sp, ev, W, keep_arrays=True)
    for i, e in enumerate(ev):                                      # rebuild the catalogue with only e replaced
        X = sp.X.copy()
        X[e] = sp.queries(ev[[i]], W[[i]])[0]
        D = recq.cdist(X, X)
        np.fill_diagonal(D, np.inf)
        lists = recq.top_k(D, 10)
        assert (lists == e).sum() == s["arrays"]["inbound_after"][i]
        assert set(lists[e]) == set(s["arrays"]["pred"][i])


def test_all_at_once_equals_brute_force():
    sp, desc, rng = _space(n=200, seed=4)
    ev = np.array([5, 17, 60, 150, 151])
    W = desc[rng.permutation(200)[:5]]                              # other albums' vectors
    Q = sp.queries(ev, W)
    lists_ev, lists = sp.all_at_once(ev, Q)
    X = sp.X.copy()
    X[ev] = Q
    D = recq.cdist(X, X)
    np.fill_diagonal(D, np.inf)
    want = recq.top_k(D, 10)
    assert all(set(a) == set(b) for a, b in zip(lists, want))
    assert np.array_equal(lists_ev, lists[ev])


def test_random_lists_have_rsq_zero_and_chance_overlap():
    sp, _, _ = _space(n=400, seed=1)
    ev = np.arange(400)
    r = recq.random_lists_eval(sp, ev, seed=0, reps=5)
    assert abs(r["RSQ"]) < 0.03
    assert r["ov10"] == pytest.approx(10 / 399, abs=0.01) and r["R50"] == pytest.approx(50 / 399, abs=0.02)
    assert r["genre"] == pytest.approx(np.nanmean(recq.genre_random(ev, sp.fam)), abs=0.03)


def test_centroid_vectors_become_hubs_and_local_scaling_reduces_it():
    sp, desc, _ = _space(n=400, seed=2, slider=0.8)
    ev = np.arange(0, 400, 10)
    W = np.tile(desc.mean(0), (len(ev), 1))                         # shrunk towards the centre
    e = recq.evaluate_space(sp, ev, W)
    ls = recq.evaluate_space(sp, ev, W, retrieval="ls-rowcol")
    assert e["inb_ratio_iso"] > 1.5 and e["RSQ"] < 1.0
    assert ls["inb_ratio_iso"] < e["inb_ratio_iso"]


def test_site_catalogue_true_vectors_and_agreement_with_downstream():
    from common import Y64, split_rows
    from downstream import downstream_eval
    from weights import scores_to_weights

    rows = split_rows("val")[:60]
    true = recq.evaluate(Y64[rows], rows)
    for s in true["stops"].values():
        assert s["ov10"] == 1.0 and s["RSQ"] == pytest.approx(1.0) and s["inb_ratio_iso"] == 1.0 and s["inb_ratio_all"] == 1.0
    W = scores_to_weights(Y64[rows] + 0.3 * np.random.default_rng(0).random((len(rows), 120)), k=10)
    mine, theirs = recq.evaluate(W, rows), downstream_eval(W, rows, stops=recq.STOPS2)
    for stop in recq.STOPS2:
        a, b = mine["stops"][stop], theirs["stops"][stop]
        assert a["ov10"] == pytest.approx(b["overlap_isolated"]["mean"], abs=1e-9)
        assert a["ov10_all"] == pytest.approx(b["overlap"]["mean"], abs=1e-9)
        assert a["inb_ratio_all"] == pytest.approx(b["inbound"]["after_total"] / b["inbound"]["before_total"], abs=1e-9)


def test_asymmetric_column_and_column_only_local_scaling():
    sp, desc, _ = _space(n=300, seed=5)
    ev = np.arange(0, 300, 9)
    W = np.tile(desc.mean(0), (len(ev), 1))
    plain = recq.evaluate_space(sp, ev, W, keep_arrays=True)
    asym = recq.evaluate_space(sp, ev, W, W_col=desc[ev], keep_arrays=True)       # others see the true vector
    assert np.array_equal(asym["arrays"]["pred"], plain["arrays"]["pred"]) and asym["RSQ"] == plain["RSQ"]
    assert asym["inb_ratio_iso"] == pytest.approx(1.0) and "inb_ratio_all" not in asym
    col = recq.evaluate_space(sp, ev, W, retrieval="ls-col", keep_arrays=True)
    assert np.array_equal(col["arrays"]["pred"], plain["arrays"]["pred"])           # own list untouched
    assert col["inb_ratio_iso"] < plain["inb_ratio_iso"]
