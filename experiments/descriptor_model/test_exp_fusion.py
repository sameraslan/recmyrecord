"""Tests for exp_fusion.py: stacking-weight fits, per-label calibration, curves and output-format helpers.
Synthetic inputs only; writes nothing into results/ or cache/ (the one test that touches run files uses tmp_path).

    OMP_NUM_THREADS=2 nice -n 10 .venv/bin/python -m pytest test_exp_fusion.py -q
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import pytest

import exp_fusion as E
import harness as H
from weights import scores_to_weights

L = 120


def synth(n=400, L=12, seed=0, prev_lo=0.05, prev_hi=0.6):
    """True logits T, binary labels B drawn from sigmoid(T), rank-weight-like Y (>0 where B)."""
    rng = np.random.default_rng(seed)
    prev = np.linspace(prev_lo, prev_hi, L)
    T = E.logit(prev)[None, :] + 1.5 * rng.standard_normal((n, L))
    B = rng.random((n, L)) < E.sigmoid(T)
    B[np.arange(n), rng.integers(0, L, n)] = True          # every album has at least one label (metrics need it)
    Yw = np.where(B, 0.6 + rng.random((n, L)), 0.0)
    return rng, T, B, Yw


def auc(b, s):
    from sklearn.metrics import roc_auc_score
    return roc_auc_score(np.asarray(b).ravel(), np.asarray(s).ravel())


# ---------------------------------------------------------------- batched logistic

def test_batched_logistic_recovers_coefficients_and_matches_sklearn():
    from sklearn.linear_model import LogisticRegression

    rng = np.random.default_rng(1)
    n = 4000
    x = rng.standard_normal((2, n))
    true = np.array([[2.0, -1.0], [0.5, 1.0]])
    Xb = np.stack([np.stack([x[l], np.ones(n)], 1) for l in range(2)])
    Tb = np.stack([(rng.random(n) < E.sigmoid(true[l, 0] * x[l] + true[l, 1])).astype(float) for l in range(2)])
    W = E.batched_logistic(Xb, Tb, np.zeros(2), np.zeros(2))
    assert np.abs(W - true).max() < 0.2
    for l in range(2):
        sk = LogisticRegression(C=1e8, max_iter=1000).fit(x[l][:, None], Tb[l])
        assert W[l, 0] == pytest.approx(sk.coef_[0, 0], abs=1e-3) and W[l, 1] == pytest.approx(sk.intercept_[0], abs=1e-3)


def test_batched_logistic_strong_penalty_returns_prior():
    rng = np.random.default_rng(2)
    X = rng.standard_normal((3, 200, 2))
    T = (rng.random((3, 200)) < 0.3).astype(float)
    prior = np.array([0.7, -0.2])
    W = E.batched_logistic(X, T, prior, np.full(2, 1e9))
    assert np.allclose(W, prior, atol=1e-4)


def test_batched_logistic_separable_label_stays_finite_with_penalty():
    x = np.linspace(-1, 1, 50)
    X = np.stack([x, np.ones(50)], 1)[None]
    W = E.batched_logistic(X, (x > 0).astype(float)[None], np.array([1.0, 0.0]), np.full(2, 1.0))
    assert np.isfinite(W).all() and W[0, 0] > 1.0


# ---------------------------------------------------------------- stacking weights

def test_nnls_weights_prefers_the_informative_run():
    rng, T, B, _ = synth(seed=3)
    good = E.sigmoid(T + 0.3 * rng.standard_normal(T.shape))
    noise = rng.random(T.shape)
    w = E.nnls_weights([good, noise], B)
    assert w.shape == (2,) and (w >= 0).all() and w.sum() == pytest.approx(1.0) and w[0] > 0.8
    assert E.nnls_weights([noise, good], B)[1] > 0.8            # order of the runs does not matter
    assert np.allclose(E.nnls_weights([np.zeros_like(good), np.zeros_like(good)], B), 0.5)   # degenerate -> uniform


def test_coord_weights_on_simplex_never_worse_than_uniform_and_drops_noise():
    rng, T, B, Yw = synth(seed=4)
    Zs = [T + 1.0 * rng.standard_normal(T.shape), T + 1.0 * rng.standard_normal(T.shape), 4.0 * rng.standard_normal(T.shape)]
    w = E.coord_weights(Zs, Yw, rounds=3)
    assert (w >= 0).all() and w.sum() == pytest.approx(1.0)
    uni = E.ndcg(Yw, sum(Z / 3 for Z in Zs))
    assert E.ndcg(Yw, sum(wk * Z for wk, Z in zip(w, Zs))) >= uni
    assert w[2] < 0.15 and min(w[0], w[1]) > 0.2
    assert np.allclose(E.coord_weights([Zs[0]], Yw), [1.0])


def test_perlabel_stacker_learns_label_specific_weights_and_shrinks_to_average():
    rng, T, B, Yw = synth(n=1200, L=10, seed=5)
    noise = lambda: 3.0 * rng.standard_normal(T.shape)   # noqa: E731
    Za, Zb = noise(), noise()
    Za[:, :5] = T[:, :5] + 0.3 * rng.standard_normal((len(T), 5))      # run A knows labels 0-4
    Zb[:, 5:] = T[:, 5:] + 0.3 * rng.standard_normal((len(T), 5))      # run B knows labels 5-9
    tr, te = np.arange(800), np.arange(800, 1200)
    W = E.perlabel_fit([Za[tr], Zb[tr]], B[tr], lam=1.0)
    assert W.shape == (10, 3)
    assert (W[:5, 0] > 3 * np.abs(W[:5, 1])).all() and (W[5:, 1] > 3 * np.abs(W[5:, 0])).all()
    stacked = E.perlabel_predict([Za[te], Zb[te]], W)
    average = E.sigmoid(0.5 * Za[te] + 0.5 * Zb[te])
    assert auc(B[te], stacked) > auc(B[te], average) + 0.03
    assert E.ndcg(Yw[te], stacked) > E.ndcg(Yw[te], average)
    Winf = E.perlabel_fit([Za[tr], Zb[tr]], B[tr], lam=1e9)             # strong regularisation = the plain average
    assert np.allclose(Winf[:, :2], 0.5, atol=1e-3)


def test_crossfit_uses_only_the_fit_part():
    rng, T, B, Yw = synth(n=60, L=6, seed=6)
    folds = [(np.arange(30, 60), np.arange(0, 30)), (np.arange(0, 30), np.arange(30, 60))]
    seen = []

    def fit(Zs, Yf):
        seen.append(len(Yf))
        return float(Yf.sum())

    out = E.crossfit(fit, lambda Zs, prm: np.full(Zs[0].shape, prm), [T], Yw, folds)
    assert seen == [30, 30]
    assert np.allclose(out[:30], Yw[30:].sum()) and np.allclose(out[30:], Yw[:30].sum())


def test_logit_map_handles_probabilities_and_arbitrary_scores():
    rng, T, B, _ = synth(n=800, seed=7)
    for S in (E.sigmoid(1.5 * T), 10.0 + 5.0 * T):          # over-confident probabilities (not saturated: logit clips at 1e-6); ridge-like raw scores
        m = E.LogitMap().fit(S, B)
        Z = m(S)
        assert np.isfinite(Z).all() and m.a > 0
        assert abs(E.sigmoid(Z).mean() - B.mean()) < 0.02     # globally calibrated in the mean
        assert (np.argsort(Z, 1) == np.argsort(S, 1)).all()   # monotone: ranking unchanged


# ---------------------------------------------------------------- calibration

def test_platt_fixes_overconfident_scores():
    rng, T, B, _ = synth(n=3000, L=8, seed=8)
    S = E.sigmoid(2.5 * T + 1.0)                              # distorted: too sharp and shifted
    cal = E.Calibrator("platt").fit(S[:2000], B[:2000])
    P = cal(S[2000:])
    before, after = E.calibration_quality(B[2000:], S[2000:]), E.calibration_quality(B[2000:], P)
    assert after["ece"] < 0.03 < before["ece"] and after["brier"] < before["brier"]
    assert ((P > 0) & (P < 1)).all()
    for j in range(S.shape[1]):                               # per-label monotone
        o = np.argsort(S[2000:, j])
        assert (np.diff(P[:, j][o]) >= -1e-12).all()
    # slopes well below 1 undo the sharpening (below the exact 1 / 2.5 because synth() forces a random positive per album)
    assert (cal.W[:, 0] > 0.1).all() and (cal.W[:, 0] < 0.5).all()


def test_platt_makes_scores_comparable_across_labels():
    """A label whose raw scores are on the wrong scale ruins a global threshold; per-label Platt repairs it."""
    rng, T, B, _ = synth(n=3000, L=8, seed=9)
    S = E.sigmoid(T)
    S[:, 0] = E.sigmoid(T[:, 0] + 4.0)                        # label 0 is hugely over-predicted
    P = E.Calibrator("platt").fit(S[:2000], B[:2000])(S[2000:])
    assert E.calibration_quality(B[2000:], P)["micro_ap"] > E.calibration_quality(B[2000:], S[2000:])["micro_ap"] + 0.02


def test_platt_shrinks_rare_labels_to_the_global_fit():
    rng, T, B, _ = synth(n=500, L=6, seed=10)
    S = E.sigmoid(T)
    B = B.copy()
    B[:, 0] = False
    B[0, 0] = True                                            # one positive only
    cal = E.Calibrator("platt", shrink=50.0).fit(S, B)
    assert np.isfinite(cal.W).all() and abs(cal.W[0, 0] - cal.g[0]) < 0.5


def test_isotonic_is_monotone_strict_and_falls_back_for_rare_labels():
    rng, T, B, _ = synth(n=2500, L=6, seed=11)
    S = E.sigmoid(2.5 * T + 1.0)
    B = B.copy()
    B[:, 5] = False
    B[:3, 5] = True                                           # 3 positives < min_pos -> Platt fallback
    cal = E.Calibrator("isotonic").fit(S[:2000], B[:2000])
    assert cal.iso[5] is None and cal.iso[0] is not None
    P = cal(S[2000:])
    assert np.isfinite(P).all() and P.min() >= 0 and P.max() <= 1
    for j in range(5):
        o = np.argsort(S[2000:, j])
        d = np.diff(P[:, j][o])
        assert (d >= -1e-12).all() and (d > 0).mean() > 0.9   # the Platt blend breaks the isotonic ties
    assert E.calibration_quality(B[2000:, :5], P[:, :5])["ece"] < E.calibration_quality(B[2000:, :5], S[2000:, :5])["ece"]


def test_calibrator_on_non_probability_scores_and_identity():
    rng, T, B, _ = synth(n=1500, L=6, seed=12)
    S = 3.0 + 0.5 * T                                         # e.g. ridge outputs
    P = E.Calibrator("platt").fit(S, B)(S)
    assert E.is_prob(P) and E.calibration_quality(B, P)["ece"] < 0.03
    assert np.array_equal(E.Calibrator("none").fit(S, B)(S), S)
    with pytest.raises(ValueError):
        E.Calibrator("temperature")


def test_crossfit_calibrate_fits_on_other_folds_only():
    rng, T, B, _ = synth(n=600, L=5, seed=13)
    S = E.sigmoid(2.0 * T)
    folds = [(np.arange(300, 600), np.arange(0, 300)), (np.arange(0, 300), np.arange(300, 600))]
    P = E.crossfit_calibrate(S, B, folds, "platt")
    assert np.allclose(P[:300], E.Calibrator("platt").fit(S[300:], B[300:])(S[:300]))
    assert np.array_equal(E.crossfit_calibrate(S, B, folds, "none"), S)


# ---------------------------------------------------------------- curves, lift, mood columns

def test_mood_columns_drop_exactly_the_six_non_mood_descriptors():
    assert len(E.MOOD_COLS) == L - 6 and len(E.NON_MOOD_IN_USE) == 6
    assert {"male vocals", "female vocals", "androgynous vocals", "vocal group", "instrumental", "concept album"} == set(E.NON_MOOD_IN_USE)


def test_pc_curve_and_lift_against_constant_baseline():
    rng = np.random.default_rng(14)
    n, Lx = 200, 10
    prev = np.array([0.7, 0.3, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.05, 0.05])
    B = rng.random((n, Lx)) < prev
    B[:, 0] |= ~B.any(1)
    Yw = B.astype(float)
    base = E.pc_curve(Yw, np.tile(prev, (n, 1)), halves=np.arange(n) % 2)
    perfect = E.pc_curve(Yw, B + 0.01 * rng.random((n, Lx)), halves=np.arange(n) % 2)
    assert len(base["points"]) == len(E.FINE_COUNTS)
    p1 = next(p for p in base["points"] if p["target_count"] == 1)
    assert p1["avg_count"] == pytest.approx(1.0) and p1["precision"] == pytest.approx(B[:, 0].mean())
    half = next(p for p in base["points"] if p["target_count"] == 0.5)
    assert half["avg_count"] == pytest.approx(1.0)            # a constant score emits the whole column
    lift = E.pc_lift(perfect, base)
    l1 = next(p for p in lift["points"] if p["target_count"] == 1)
    assert l1["model_precision"] == pytest.approx(1.0) and l1["lift_abs"] == pytest.approx(1.0 - B[:, 0].mean())
    # a perfect ranking can keep emitting after the last true pair until precision falls to 0.9
    assert lift["at_precision"]["0.90"]["model_count"] == pytest.approx(B.sum() / n / 0.9, abs=1.0 / n)
    assert lift["at_precision"]["0.90"]["baseline_count"] == 0.0
    assert set(base["crossfit_at_precision"]) == {"0.90", "0.80", "0.70"}


# ---------------------------------------------------------------- output format helpers

def test_weights_from_counts_matches_scores_to_weights_and_varies_per_album():
    rng = np.random.default_rng(15)
    S = rng.random((7, L))
    rw = np.linspace(1.5, 0.5, L)
    assert np.array_equal(E.weights_from_counts(S, np.full(7, 10), rw), scores_to_weights(S, k=10, rank_weights=rw))
    counts = np.array([3, 5, 8, 10, 12, 20, 0])
    W = E.weights_from_counts(S, counts, rw)
    assert ((W > 0).sum(1) == counts).all()
    assert W[0, np.argmax(S[0])] == pytest.approx(1.5)


def test_count_model_recovers_linear_relation_and_clips():
    rng = np.random.default_rng(16)
    P = rng.random((500, 20)) * rng.random((500, 1))
    n_true = 2.0 + 1.5 * P.sum(1) + 0.1 * rng.standard_normal(500)
    a, b = E.fit_count_model(P, n_true)
    assert a == pytest.approx(2.0, abs=0.1) and b == pytest.approx(1.5, abs=0.05)
    k = E.predict_counts(np.r_[np.zeros((1, 20)), np.ones((1, 20)), P[:5]], (a, b), clip=(3, 25))
    assert k[0] == 3 and k[1] == 25 and k.dtype.kind == "i"
    assert E.fit_count_model(np.ones((10, 4)), np.full(10, 7.0)) == (7.0, 0.0)


def test_sharpen_demotes_prior_driven_descriptors():
    prior = np.array([0.7, 0.3, 0.05, 0.05])
    P = np.array([[0.72, 0.31, 0.20, 0.04]])                  # label 2 is 4x its base rate, labels 0/1 are at base rate
    assert np.argmax(P[0]) == 0
    assert np.argmax(E.sharpen(P, prior, 1.0)[0]) == 2
    assert np.allclose(E.sharpen(P, prior, 0.0), E.logit(P))
    top0 = [int(np.argmax(E.sharpen(P, prior, lam)[0]) == 0) for lam in (0.0, 0.25, 0.5, 0.75, 1.0)]
    assert top0 == sorted(top0, reverse=True)                 # the generic label only ever moves down


def test_nn_label_scores_returns_neighbour_labels_and_respects_mask():
    prior = np.full(6, 0.3)
    Btr = np.array([[1, 1, 0, 0, 0, 0], [0, 0, 1, 1, 0, 0], [0, 0, 0, 0, 1, 1]], dtype=bool)
    P = np.array([[0.9, 0.8, 0.2, 0.1, 0.1, 0.1], [0.1, 0.2, 0.3, 0.2, 0.9, 0.7]])
    out = E.nn_label_scores(P, prior, Btr, m=1)
    assert np.array_equal(out, Btr[[0, 2]].astype(float))
    allowed = np.array([[False, True, True], [True, True, False]])
    out = E.nn_label_scores(P, prior, Btr, m=1, allowed=allowed)
    assert not np.array_equal(out[0], Btr[0].astype(float)) and not np.array_equal(out[1], Btr[2].astype(float))
    assert np.allclose(E.nn_label_scores(P, prior, Btr, m=3), Btr.mean(0))


def test_rank_space_is_within_album():
    S = np.array([[0.1, 0.9, 0.5], [100.0, 300.0, 200.0]])
    assert np.array_equal(E.rank_space(S), np.array([[0.0, 1.0, 0.5], [0.0, 1.0, 0.5]]))


# ---------------------------------------------------------------- run lookup: OOF is mandatory, snapshot must match

def _fake_run(root, name, rows_val, oof_rows=None):
    (root / "results" / "val").mkdir(parents=True, exist_ok=True)
    (root / "scores").mkdir(parents=True, exist_ok=True)
    (root / "results" / "val" / f"{name}.json").write_text(json.dumps(
        {"name": name, "timestamp": "t", "data": {"n_train": 5, "n_shards": 1}, "metrics": {}}))
    np.save(root / "scores" / f"{name}__val.npy", np.zeros((len(rows_val), L), dtype=np.float32))
    np.save(root / "scores" / f"{name}__val_rows.npy", np.asarray(rows_val, dtype=np.int32))
    if oof_rows is not None:
        np.save(root / "scores" / f"{name}__train_oof.npy", np.zeros((len(oof_rows), L), dtype=np.float32))
        np.save(root / "scores" / f"{name}__train_oof_rows.npy", np.asarray(oof_rows, dtype=np.int32))


def test_find_runs_refuses_runs_without_oof_and_other_snapshots(tmp_path, monkeypatch):
    rows_val = np.array([3, 5, 8])
    monkeypatch.setattr(H, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(H, "SCORES_DIR", tmp_path / "scores")
    monkeypatch.setattr(H, "eval_rows", lambda split="val": rows_val)
    _fake_run(tmp_path, "a__with_oof", rows_val, oof_rows=[1, 2])
    _fake_run(tmp_path, "a__also_oof", rows_val, oof_rows=[2, 4])
    _fake_run(tmp_path, "b__no_oof", rows_val)
    _fake_run(tmp_path, "c__old_snapshot", [3, 5], oof_rows=[1])
    a = argparse.Namespace(quick=False, runs_from=None, drop_no_oof=False)
    assert [r.name for r in E.find_runs(a, ["a__*"])] == ["a__also_oof", "a__with_oof"]
    with pytest.raises(SystemExit, match="REFUSED.*b__no_oof"):
        E.find_runs(a, ["a__with_oof", "b__no_oof"])
    assert [r.name for r in E.find_runs(a, ["b__no_oof"], need_oof=False)] == ["b__no_oof"]
    a.drop_no_oof = True
    assert [r.name for r in E.find_runs(a, ["a__with_oof", "b__*"])] == ["a__with_oof"]
    with pytest.raises(SystemExit, match="another shard snapshot"):
        E.find_runs(a, ["c__old_snapshot"])
    with pytest.raises(SystemExit, match="no registered run matches"):
        E.find_runs(a, ["zzz__*"])
    runs = E.find_runs(a, ["a__with_oof", "a__also_oof"])
    rows, P = E.common_oof(runs)
    assert rows.tolist() == [2] and P[0].shape == (1, L) and P[1].shape == (1, L)
