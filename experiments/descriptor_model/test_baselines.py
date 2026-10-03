"""k-NN label transfer on synthetic data, genre baselines on toy data, split and downstream invariants.
Run: .venv/bin/python -m pytest -q"""
import numpy as np
import pytest

import baselines as B
import metrics as M


def _clusters(n_per=40, d=16, n_labels=12, seed=0):
    """3 well-separated clusters; cluster c owns labels 4c..4c+3."""
    rng = np.random.default_rng(seed)
    centres = rng.normal(size=(3, d)) * 5
    E, Y = [], []
    for c in range(3):
        E.append(centres[c] + rng.normal(size=(n_per, d)) * 0.3)
        y = np.zeros((n_per, n_labels))
        y[:, 4 * c:4 * c + 4] = 1
        Y.append(y)
    return np.vstack(E), np.vstack(Y)


@pytest.mark.parametrize("weighting", ["uniform", "similarity", "softmax"])
@pytest.mark.parametrize("metric", ["cosine", "euclidean"])
def test_knn_recovers_cluster_labels(weighting, metric):
    Et, Yt = _clusters(seed=0)
    Ee, Ye = _clusters(n_per=10, seed=0)  # same centres (same seed -> same first draws), fresh noise below
    Ee = Ee + np.random.default_rng(1).normal(size=Ee.shape) * 0.1
    S = B.knn_label_transfer(Et, Yt, Ee, k=5, weighting=weighting, metric=metric)
    assert S.shape == Ye.shape
    assert np.allclose(S, Ye)  # every neighbour is in the right cluster -> exact label vector
    assert M.precision_at_k(Ye, S, 4).mean() == 1.0


def test_knn_hand_case_and_weighting():
    # 1-D-like embeddings on the unit circle: query at angle 0; train at 0deg (label A), 60deg (label B), 180deg (label B)
    ang = np.deg2rad([0.0, 60.0, 180.0])
    Et = np.c_[np.cos(ang), np.sin(ang)]
    Yt = np.array([[1.0, 0.0], [0.0, 1.0], [0.0, 1.0]])
    q = np.array([[1.0, 0.0]])
    assert B.knn_label_transfer(Et, Yt, q, k=2, weighting="uniform")[0].tolist() == pytest.approx([0.5, 0.5])
    # similarities 1.0 and 0.5 -> weights 2/3, 1/3
    assert B.knn_label_transfer(Et, Yt, q, k=2, weighting="similarity")[0].tolist() == pytest.approx([2 / 3, 1 / 3])
    # k=3 uniform: one A, two B; negative cosine is clipped to weight 0 under "similarity"
    assert B.knn_label_transfer(Et, Yt, q, k=3, weighting="uniform")[0].tolist() == pytest.approx([1 / 3, 2 / 3])
    assert B.knn_label_transfer(Et, Yt, q, k=3, weighting="similarity")[0].tolist() == pytest.approx([2 / 3, 1 / 3])
    # softmax with temperature 0.5 over sims (1.0, 0.5): w = 1 / (1 + e^-1)
    w = 1 / (1 + np.exp(-1.0))
    got = B.knn_label_transfer(Et, Yt, q, k=2, weighting="softmax", temperature=0.5)[0]
    assert got.tolist() == pytest.approx([w, 1 - w])
    # k larger than the train set is clamped
    assert B.knn_label_transfer(Et, Yt, q, k=50)[0].tolist() == pytest.approx([1 / 3, 2 / 3])


def test_knn_exclude_self():
    Et, Yt = _clusters()
    Yt = Yt.copy()
    Yt[0] = 0
    Yt[0, -1] = 1  # row 0 carries a label nobody else in its cluster has
    S = B.knn_label_transfer(Et, Yt, Et, k=1, exclude_self=True)
    assert S[0, -1] == 0.0  # its own label vector was not used
    assert B.knn_label_transfer(Et, Yt, Et, k=1)[0, -1] == 1.0


def test_knn_rank_weights_are_averaged():
    Et = np.array([[1.0, 0.0], [1.0, 0.01]])
    Yt = np.array([[1.5, 0.0], [1.0, 1.4]])
    S = B.knn_label_transfer(Et, Yt, np.array([[1.0, 0.0]]), k=2)
    assert S[0].tolist() == pytest.approx([1.25, 0.7])


def test_genre_mean_shrinkage_toy():
    train = [["rock"], ["rock"], ["jazz"], ["rock", "jazz"]]
    yb = np.array([[1, 0], [1, 0], [0, 1], [1, 1]], dtype=bool)
    prev = yb.mean(0)  # [0.75, 0.5]
    s = B.genre_mean_scores(train, yb, [["rock"], ["polka"], []], m=1.0)
    # rock: n=3, sums [3, 1] -> ([3, 1] + prev) / 4
    assert s[0].tolist() == pytest.approx([(3 + 0.75) / 4, (1 + 0.5) / 4])
    assert s[1].tolist() == pytest.approx(prev.tolist()) and s[2].tolist() == pytest.approx(prev.tolist())


def test_multi_hot_and_vocab():
    lists = [["a", "b"], ["a"], ["c"], ["a", "c"]]
    vocab = B.genre_vocab(lists, min_count=2)
    assert vocab == ["a", "c"]
    assert B.multi_hot([["a", "zzz"], [], ["c", "a"]], vocab).tolist() == [[1, 0], [0, 0], [1, 1]]


def test_test_split_is_guarded():
    with pytest.raises(RuntimeError):
        B.run("test")


def test_committed_split_has_no_leakage():
    import split as S
    from common import LABELLED, load_splits

    sp = load_splits()
    S.verify(sp)
    assert (sp != "none").sum() == LABELLED.sum() == 4110
    counts = {s: int((sp == s).sum()) for s in ("train", "val", "test")}
    assert abs(counts["train"] / 4110 - 0.70) < 0.02 and abs(counts["val"] / 4110 - 0.15) < 0.01
    # split.py is deterministic: recomputing gives the committed file
    res = S.make_split()
    assert (sp[res["rows"]] == res["assign"]).all()


def test_downstream_true_weights_give_exact_overlap_and_zeros_do_not():
    import downstream as D
    from common import Y64, split_rows

    rows = split_rows("val")[:120]
    r = D.downstream_eval(Y64[rows], rows)
    for s in r["stops"].values():
        assert s["overlap"]["min"] == 1.0 and s["overlap_isolated"]["min"] == 1.0
        assert s["others"]["n_changed"] == 0
        assert s["inbound"]["before_total"] == s["inbound"]["after_total"] and s["inbound"]["pearson"] == pytest.approx(1.0)
    z = D.downstream_eval(np.zeros_like(Y64[rows]), rows)
    assert z["stops"]["mood"]["overlap"]["mean"] < 0.2 and z["stops"]["balanced"]["overlap"]["mean"] < 0.3
    assert all(D.check_against_site().values())
