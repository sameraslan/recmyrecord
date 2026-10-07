"""Pure-function tests of exp_llm_fusion.py (synthetic inputs; writes nothing into results/ or cache/).

    .venv/bin/python -m pytest test_exp_llm_fusion.py -q
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score

import exp_llm_fusion as X
from common import DESCRIPTORS

L = len(DESCRIPTORS)


def _norm() -> dict:
    prior = np.linspace(0.02, 0.7, L)
    return {"a_mu": -2.0, "a_sd": 1.5, "m_mu": -2.5, "m_sd": 1.0, "prior": prior, "plz": X.prior_logit_z(prior)}


def _data(n: int = 80, seed: int = 0):
    rng = np.random.default_rng(seed)
    Yt = np.zeros((n, L))
    anns, audio = [], np.empty((n, L))
    for i in range(n):
        true = rng.choice(L, size=10, replace=False)
        Yt[i, true] = np.linspace(1.5, 1.0, 10)
        wrong = rng.choice(np.setdiff1d(np.arange(L), true), size=4, replace=False)
        words = [DESCRIPTORS[j] for j in np.r_[true[:6], wrong]]          # the "LLM": 6 right words, then 4 wrong ones
        anns.append({"known": 2 if i % 4 else 1, "d": words})
        z = rng.normal(-2.5, 1.0, L)
        z[true] += 2.5                                                    # an informative audio probe
        audio[i] = X.sigmoid(z)
    meta = np.tile(_norm()["prior"], (n, 1))
    return anns, audio, meta, Yt


def test_ap_column_matches_sklearn_with_ties():
    rng = np.random.default_rng(1)
    for _ in range(20):
        b = rng.random(60) < 0.3
        s = np.round(rng.random(60), 1)                                   # many ties
        if b.any():
            assert abs(X.ap_column(b, s) - average_precision_score(b, s)) < 1e-12


def test_group_boot_se_matches_iid_for_singleton_groups():
    rng = np.random.default_rng(2)
    d = rng.normal(0.1, 1.0, 400)
    se = X.group_boot_se(d, np.arange(400))
    assert abs(se - d.std() / np.sqrt(400)) < 0.01
    assert X.group_boot_se(d, np.repeat(np.arange(40), 10)) > 0           # grouped version runs


def test_llm_features_and_scores_follow_the_list_order():
    f = X.llm_features([{"known": 1, "d": [DESCRIPTORS[5], DESCRIPTORS[2], "not a word", DESCRIPTORS[5]]}, None])
    assert f["listed"][0].sum() == 2 and f["rs"][0, 5] == 1.0 and abs(f["rs"][0, 2] - (1 - 1 / 15)) < 1e-12
    assert f["known"].tolist() == [1, -1] and f["listed"][1].sum() == 0
    Fd = X.make_feats([{"known": 2, "d": [DESCRIPTORS[5], DESCRIPTORS[2]]}], None, None, _norm())
    S = X.llm_scores(Fd)
    assert S[0, 5] == 2.0 and abs(S[0, 2] - 1.95) < 1e-12 and (np.delete(S[0], [2, 5]) < 1).all()


def test_blend_uses_the_audio_signal_and_f3_keeps_the_llm_set():
    anns, audio, meta, Yt = _data()
    Fd = X.make_feats(anns, audio, meta, _norm())
    obj = X.Objective(Yt)
    base = obj(X.llm_scores(Fd))[0]
    p = X.fit_blend(Fd, Yt, "lam")
    assert p["b"] > 0 and obj(X.predict_params(p, Fd))[0] > base + 0.02
    p3 = X.fit_f3(Fd, Yt, "lam")
    S3 = X.predict_params(p3, Fd)
    top10 = np.argsort(-S3, axis=1)[:, :10]
    assert (np.take_along_axis(Fd["listed"], top10, 1) == 1).all()        # all 10 listed words stay on top


def test_gated_blend_and_stack_shapes():
    anns, audio, meta, Yt = _data(n=200, seed=3)
    Fd = X.make_feats(anns, audio, meta, _norm())
    pg = X.fit_gated_blend(Fd, Yt, "lam")
    assert pg["n_lo"] == 50 and X.predict_params(pg, Fd).shape == (200, L)
    ps = X.fit_stack(Fd, Yt, "lam", 100.0)
    P = X.predict_params(ps, Fd)
    assert ps["W"].shape == (L, 6) and (P >= 0).all() and (P <= 1).all()
    assert X.Objective(Yt)(P)[0] > X.Objective(Yt)(X.llm_scores(Fd))[0]
    pgs = X.fit_gated_stack(Fd, Yt, "lam")
    assert X.predict_params(pgs, Fd).shape == (200, L)


def test_apply_routes_by_available_inputs():
    anns, audio, meta, Yt = _data(n=120, seed=4)
    norm = _norm()
    model = {"norm": norm, "sub": {}}
    for use in ("lam", "lm", "am"):
        Fd = X.make_feats(anns if "l" in use else None, audio if "a" in use else None, meta, norm)
        p = X.fit_blend(Fd, Yt, use)
        model["sub"][use] = {"params": p, "platt": X.ScoreMap.fit(X.predict_params(p, Fd), Yt > 0)}
    a2, l2 = audio.copy(), list(anns)
    a2[:30] = np.nan                                                      # no audio -> LLM + tags
    for i in range(20, 50):
        l2[i] = None                                                      # no annotation -> audio + tags, or tags only
    S, route = X.apply(l2, a2, meta, model=model, return_route=True)
    assert np.isfinite(S).all()
    assert route[0] == "lm" and route[25] == "m" and route[40] == "am" and route[100] == "lam"
    full = X.predict_params(model["sub"]["lam"]["params"], X.make_feats(anns, audio, meta, norm))
    assert np.allclose(S[60:], full[60:])
    P = X.apply(l2, a2, meta, model=model, proba=True)
    assert (P >= 0).all() and (P <= 1).all()


def test_honest_pc_and_first_k():
    anns, audio, meta, Yt = _data(n=100, seed=5)
    out = X.honest_pc(Yt[:50], audio[:50], Yt[50:], audio[50:])
    assert [c["target_count"] for c in out["counts"]] == list(X.COUNTS)
    assert abs(out["counts"][0]["train_count"] - 1.0) < 0.05 and out["counts"][0]["val_precision"] > 0.5
    fk = X.first_k_precision(anns, Yt)
    assert fk["6"]["precision"] == 1.0 and abs(fk["all"]["precision"] - 0.6) < 1e-12 and fk["10"]["avg_count"] == 10
