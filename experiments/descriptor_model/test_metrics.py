"""Hand-computed toy cases for metrics.py. Run: .venv/bin/python -m pytest -q"""
import math

import numpy as np
import pytest

import metrics as M

# 2 albums, 5 labels. Album 0 has labels 0 (weight 1.5) and 2 (weight 1.0); album 1 has label 4 (1.5).
Y = np.array([[1.5, 0.0, 1.0, 0.0, 0.0],
              [0.0, 0.0, 0.0, 0.0, 1.5]])
# Album 0 ranking: 1, 2, 0, 3, 4.  Album 1 ranking: 4, 0, 1, 2, 3.
S = np.array([[0.2, 0.9, 0.8, 0.1, 0.0],
              [0.5, 0.4, 0.3, 0.2, 0.6]])


def test_top_k_and_ties():
    assert M.top_k(S, 3).tolist() == [[1, 2, 0], [4, 0, 1]]
    assert M.top_k(np.array([[1.0, 1.0, 2.0, 1.0]]), 4).tolist() == [[2, 0, 1, 3]]  # ties -> lower index


def test_precision_recall_at_k():
    assert M.precision_at_k(Y, S, 2).tolist() == [0.5, 0.5]
    assert M.recall_at_k(Y, S, 2).tolist() == [0.5, 1.0]
    assert M.precision_at_k(Y, S, 3).tolist() == pytest.approx([2 / 3, 1 / 3])
    assert M.recall_at_k(Y, S, 3).tolist() == [1.0, 1.0]


def test_ndcg_at_k():
    # album 0, k=3: gains in predicted order 0, 1.0, 1.5 -> 1.0/log2(3) + 1.5/log2(4);
    # ideal 1.5/log2(2) + 1.0/log2(3).
    dcg0 = 1.0 / math.log2(3) + 1.5 / math.log2(4)
    idcg0 = 1.5 + 1.0 / math.log2(3)
    got = M.ndcg_at_k(Y, S, 3)
    assert got[0] == pytest.approx(dcg0 / idcg0)
    assert got[0] == pytest.approx(1.380930 / 2.130930, abs=1e-6)  # = 0.648041
    assert got[1] == pytest.approx(1.0)
    # k=1: album 0 predicts label 1 (wrong) -> 0
    assert M.ndcg_at_k(Y, S, 1).tolist() == [0.0, 1.0]


def test_ndcg_perfect_and_weight_order():
    y = np.array([[1.5, 1.4, 0.0, 1.3]])
    assert M.ndcg_at_k(y, y, 10)[0] == pytest.approx(1.0)
    # right set, reversed order: (1.3/1 + 1.4/log2(3) + 1.5/2) / (1.5/1 + 1.4/log2(3) + 1.3/2)
    rev = np.array([[1.0, 2.0, 0.0, 3.0]])
    want = (1.3 + 1.4 / math.log2(3) + 0.75) / (1.5 + 1.4 / math.log2(3) + 0.65)
    assert M.ndcg_at_k(y, rev, 10)[0] == pytest.approx(want)
    assert M.precision_at_k(y, rev, 3)[0] == 1.0


def test_min_score_does_not_pad_short_lists():
    y = np.array([[1.5, 1.4, 0.0, 0.0]])
    w = np.array([[0.0, 0.0, 0.0, 1.5]])  # predicts only label 3 (wrong)
    # without min_score the zero-score ties are filled by column order and hit labels 0 and 1
    assert M.precision_at_k(y, w, 3)[0] == pytest.approx(2 / 3)
    assert M.precision_at_k(y, w, 3, min_score=0)[0] == 0.0
    assert M.recall_at_k(y, w, 3, min_score=0)[0] == 0.0
    assert M.ndcg_at_k(y, w, 3, min_score=0)[0] == 0.0


def test_arithmetic_ceiling():
    y = np.zeros((2, 20))
    y[0, :7] = 1.0   # 7 descriptors: P@10 <= 0.7, R@10 <= 1
    y[1, :15] = 1.0  # 15 descriptors: P@10 <= 1, R@10 <= 10/15
    p, r = M.max_precision_recall_at_k(y, 10)
    assert p.tolist() == [0.7, 1.0]
    assert r.tolist() == pytest.approx([1.0, 10 / 15])
    # and a perfect scorer reaches it
    assert M.precision_at_k(y, y, 10).tolist() == [0.7, 1.0]


def test_per_label_ap_auc_and_skips():
    # label 0: positives = albums 0, 2; scores 0.9, 0.8, 0.1, 0.5 -> ranking a0(+), a1(-), a3(-), a2(+)
    #          AP = (1/1 + 2/4) / 2 = 0.75 ; AUC = (2 + 0) / 4 = 0.5
    # label 1: positive = album 1 only, ranked first -> AP 1, AUC 1
    # label 2: no positives -> skipped in both
    # label 3: all positive -> AP 1, AUC skipped
    y = np.array([[1.5, 0.0, 0.0, 1.0],
                  [0.0, 1.5, 0.0, 1.0],
                  [1.5, 0.0, 0.0, 1.0],
                  [0.0, 0.0, 0.0, 1.0]])
    s = np.array([[0.9, 0.1, 0.3, 0.1],
                  [0.8, 0.7, 0.2, 0.2],
                  [0.1, 0.2, 0.1, 0.3],
                  [0.5, 0.3, 0.9, 0.4]])
    ap, auc = M.per_label_ap(y, s), M.per_label_auc(y, s)
    assert ap[0] == pytest.approx(0.75) and ap[1] == pytest.approx(1.0) and np.isnan(ap[2]) and ap[3] == 1.0
    assert auc[0] == pytest.approx(0.5) and auc[1] == pytest.approx(1.0) and np.isnan(auc[2]) and np.isnan(auc[3])
    r = M.evaluate(y, s, k=2, labels=["a", "b", "c", "d"])
    assert r["mAP"] == pytest.approx((0.75 + 1 + 1) / 3) and r["mAP_skipped"] == 1 and r["mAP_n_labels"] == 3
    assert r["macro_auc"] == pytest.approx(0.75) and r["auc_skipped"] == 2
    assert r["best_auc"][0][0] == "b" and r["worst_auc"][0][0] == "a"
    # top-2 per album: a0 -> {0, 2}: 1 hit; a1 -> {0, 1}: 1 hit; a2 -> {3, 1}: 1 hit; a3 -> {2, 0}: 0 hits
    assert r["precision@2"] == pytest.approx(3 / 8)
    assert r["recall@2"] == pytest.approx((1 / 2 + 1 / 2 + 1 / 2 + 0) / 4)
    assert r["micro_recall@2"] == pytest.approx(3 / 7)


def test_set_metrics():
    y = np.array([[1.5, 1.4, 1.3, 0.0, 0.0],
                  [1.5, 0.0, 0.0, 0.0, 0.0]])
    w = np.array([[1.5, 0.0, 0.0, 1.4, 0.0],   # hits 1 of pred 2, true 3, union 4
                  [0.0, 1.5, 1.4, 0.0, 0.0]])  # hits 0
    m = M.set_metrics(y, w)
    assert m["precision"].tolist() == [0.5, 0.0]
    assert m["recall"].tolist() == pytest.approx([1 / 3, 0.0])
    assert m["jaccard"].tolist() == [0.25, 0.0]
    assert m["f1"].tolist() == pytest.approx([2 / 5, 0.0])
    e = M.evaluate_sets(y, w)
    assert e["micro_precision"] == pytest.approx(1 / 4) and e["micro_recall"] == pytest.approx(1 / 4)
    assert e["mean_n_pred"] == 2.0 and e["mean_n_true"] == 2.0
    # an empty prediction is precision 0, not NaN
    assert M.set_metrics(y[:1], np.zeros((1, 5)))["precision"][0] == 0.0


def test_unlabelled_album_is_rejected():
    with pytest.raises(AssertionError):
        M.precision_at_k(np.zeros((1, 3)), np.ones((1, 3)), 2)
