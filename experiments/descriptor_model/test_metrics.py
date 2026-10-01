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


# ---------------------------------------------------------------- capped precision@k

# 5 albums, 6 labels, k = 3. True labels (weights only matter for being > 0):
#   A: {0, 1}            fewer than k        B: {0, 5}        fewer than k
#   C: {0, 1, 2}         exactly k           D: {0, 1, 2, 3, 4}  more than k      E: {1, 2, 3, 4}  more than k
YC = np.array([[1.5, 1.4, 0, 0, 0, 0],
               [1.5, 0, 0, 0, 0, 1.4],
               [1.5, 1.4, 1.3, 0, 0, 0],
               [1.5, 1.4, 1.3, 1.2, 1.1, 0],
               [0, 1.5, 1.4, 1.3, 1.2, 0]])
# top-3 per album:  A: 1, 0, 5 (2 hits)   B: 1, 2, 0 (1 hit)   C: 0, 3, 1 (2 hits)   D: 4, 2, 0 (3 hits)   E: 0, 5, 1 (1 hit)
SC = np.array([[0.8, 0.9, 0.1, 0.2, 0.3, 0.7],
               [0.5, 0.9, 0.8, 0.1, 0.2, 0.4],
               [0.9, 0.6, 0.1, 0.7, 0.2, 0.3],
               [0.6, 0.1, 0.7, 0.2, 0.9, 0.3],
               [0.9, 0.5, 0.1, 0.2, 0.3, 0.8]])


def test_capped_precision_hand_computed():
    assert M.top_k(SC, 3).tolist() == [[1, 0, 5], [1, 2, 0], [0, 3, 1], [4, 2, 0], [0, 5, 1]]
    # hits / min(k, n_true):  A 2/2,  B 1/2,  C 2/3,  D 3/3,  E 1/3
    assert M.capped_precision_at_k(YC, SC, 3).tolist() == pytest.approx([1.0, 0.5, 2 / 3, 1.0, 1 / 3])
    # plain precision@3 divides by k regardless: the album with 2 descriptors can never exceed 2/3
    assert M.precision_at_k(YC, SC, 3).tolist() == pytest.approx([2 / 3, 1 / 3, 2 / 3, 1.0, 1 / 3])
    # at least k true descriptors -> equals precision@k; fewer -> equals recall@k
    assert M.capped_precision_at_k(YC, SC, 3)[2:].tolist() == pytest.approx(M.precision_at_k(YC, SC, 3)[2:].tolist())
    assert M.capped_precision_at_k(YC, SC, 3)[:2].tolist() == pytest.approx(M.recall_at_k(YC, SC, 3)[:2].tolist())
    # k = 1: hit or miss, whatever the number of descriptors.  k = 6 (all labels): everything is found
    assert M.capped_precision_at_k(YC, SC, 1).tolist() == [1.0, 0.0, 1.0, 1.0, 0.0]
    assert M.capped_precision_at_k(YC, SC, 6).tolist() == [1.0] * 5


def test_capped_precision_seven_descriptors_all_in_top_ten():
    y = np.zeros((1, 20))
    y[0, :7] = np.linspace(1.5, 1.0, 7)
    s = np.zeros((1, 20))
    s[0, :7] = 1.0                # the 7 true ones lead ...
    s[0, 7:10] = 0.5              # ... followed by 3 wrong ones in the top 10
    assert M.capped_precision_at_k(y, s, 10).tolist() == [1.0]
    assert M.precision_at_k(y, s, 10).tolist() == [0.7]
    s[0, 6] = -1.0                # one true descriptor falls out of the top 10 (column 10 takes its place by tie order)
    assert M.capped_precision_at_k(y, s, 10).tolist() == pytest.approx([6 / 7])


def test_capped_precision_ties_break_like_precision_at_k():
    y = np.array([[0, 0, 1.5, 1.4]])
    s = np.ones((1, 4))           # all tied: lower column index first -> top-2 = columns 0, 1 = no hit
    assert M.capped_precision_at_k(y, s, 2).tolist() == [0.0] and M.precision_at_k(y, s, 2).tolist() == [0.0]
    assert M.capped_precision_at_k(y, s, 3).tolist() == [0.5]      # column 2 enters: 1 hit / min(3, 2)
    w = np.array([[0.0, 0.0, 0.7, 0.0]])                            # a weight vector: zeros are "not predicted"
    assert M.capped_precision_at_k(y, w, 3, min_score=0).tolist() == [0.5]


def test_capped_precision_perfect_ranking_is_exactly_one():
    rng = np.random.default_rng(0)
    counts = [1, 2, 7, 9, 10, 11, 25, 40]                           # fewer than, exactly, and more than k = 10
    Yp = np.zeros((len(counts), 120))
    for i, c in enumerate(counts):
        Yp[i, rng.choice(120, c, replace=False)] = np.linspace(1.5, 0.6, c)
    for k in (1, 5, 10):
        assert (M.capped_precision_at_k(Yp, Yp, k) == 1.0).all()    # the true weights as scores = perfect ranking
    ev = M.evaluate(Yp, Yp, k=10)
    assert ev["cP@10"] == 1.0 and ev["cP@5"] == 1.0 and ev["perfect@10"] == 1.0
    assert ev["precision@10"] == pytest.approx(ev["max_precision@10"]) and ev["precision@10"] < 0.75
    worst = -Yp                                                     # true descriptors ranked last
    assert M.evaluate(Yp, worst, k=10)["cP@10"] == 0.0


def test_evaluate_reports_capped_precision():
    ev = M.evaluate(YC, SC, k=3)
    assert ev["cP@3"] == pytest.approx((1.0 + 0.5 + 2 / 3 + 1.0 + 1 / 3) / 5)
    assert ev["perfect@3"] == pytest.approx(2 / 5)
    assert ev["cP@5"] == pytest.approx(float(M.capped_precision_at_k(YC, SC, 5).mean()))
    assert ev["per_album"]["capped_precision"].tolist() == pytest.approx([1.0, 0.5, 2 / 3, 1.0, 1 / 3])
    assert ev["cP@3"] >= ev["precision@3"]
