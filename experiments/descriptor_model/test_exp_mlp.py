"""Tests for exp_mlp.py: losses on hand cases, models, the training loop on synthetic data.
Synthetic inputs only; writes nothing into results/ or cache/.

    OMP_NUM_THREADS=2 nice -n 10 .venv/bin/python -m pytest test_exp_mlp.py -q
"""
from __future__ import annotations

import math

import numpy as np
import pytest
import torch
import torch.nn.functional as Fn

import exp_mlp as E
import features as F

torch.set_num_threads(2)

# hand case: 2 albums x 4 labels. Y = rank weights (0 = absent).
Y = torch.tensor([[1.5, 1.0, 0.0, 0.0], [0.0, 0.0, 0.75, 0.0]])
Z = torch.tensor([[2.0, -1.0, 0.5, -3.0], [-0.5, 1.5, 0.0, -2.0]])
T, W, Q = E.make_targets(Y, torch.tensor([0, 1]))


def grad(fn, z=Z):
    z = z.clone().requires_grad_(True)
    loss = fn(z)
    loss.backward()
    return float(loss.detach()), z.grad


def cfg(loss, **kw):
    return {"loss": loss, **kw}


def test_targets():
    assert T.tolist() == [[1, 1, 0, 0], [0, 0, 1, 0]]
    assert W[T > 0].mean().item() == pytest.approx(1.0)           # positive weights average 1 over the fit rows
    assert (W[T == 0] == 0).all() and W[0, 0] / W[0, 1] == pytest.approx(1.5)
    assert torch.allclose(Q.sum(1), torch.ones(2)) and Q[0, 0].item() == pytest.approx(0.6) and Q[1, 2].item() == 1.0
    _, W2, Q2 = E.make_targets(Y, torch.tensor([0, 1]), rank_pow=2.0)
    assert W2[0, 0] / W2[0, 1] == pytest.approx(2.25) and Q2[0, 0].item() == pytest.approx(2.25 / 3.25)


def test_bce_matches_torch_and_hand_value():
    loss, g = grad(lambda z: E.loss_bce(z, T))
    assert loss == pytest.approx(float(Fn.binary_cross_entropy_with_logits(Z, T)))
    hand = np.mean([math.log1p(math.exp(-2.0)), math.log1p(math.exp(1.0)), math.log1p(math.exp(0.5)), math.log1p(math.exp(-3.0)),
                    math.log1p(math.exp(-0.5)), math.log1p(math.exp(1.5)), math.log1p(math.exp(0.0)), math.log1p(math.exp(-2.0))])
    assert loss == pytest.approx(hand, rel=1e-6)
    assert torch.allclose(g, (torch.sigmoid(Z) - T) / T.numel(), atol=1e-7)


@pytest.mark.parametrize("name", E.LOSSES)
def test_every_loss_is_finite_and_pushes_the_right_way(name):
    c = cfg(name)
    loss, g = grad(lambda z: E.compute_loss(z, T, W, Q, c))
    assert math.isfinite(loss) and torch.isfinite(g).all()
    if name != "listnet":  # (listnet: softmax - Q can be positive for an over-scored true label; see test_listnet)
        assert (g[T > 0] < 0).all(), "raising the logit of a true descriptor must lower the loss"
    if name != "bce_ls":   # (label smoothing wants a negative at p = eps, so very low logits are pushed up)
        assert (g[T == 0] >= 0).all(), "raising the logit of an absent descriptor must not lower the loss"
    for big in (60.0, -60.0):   # saturated logits: still finite
        loss, g = grad(lambda z: E.compute_loss(z, T, W, Q, c), torch.full_like(Z, big))
        assert math.isfinite(loss) and torch.isfinite(g).all()
    # soft targets (mixup) are accepted
    Tm, Wm, Qm = (0.7 * v + 0.3 * v.flip(0) for v in (T, W, Q))
    assert math.isfinite(float(E.compute_loss(Z, Tm, Wm, Qm, c)))


def test_bce_ls_reduces_to_bce_and_smooths_negatives_only():
    assert float(E.loss_bce_ls(Z, T, 0.0)) == pytest.approx(float(E.loss_bce(Z, T)))
    eps = 0.1
    _, g = grad(lambda z: E.loss_bce_ls(z, T, eps))
    assert torch.allclose(g, (torch.sigmoid(Z) - (T + (1 - T) * eps)) / T.numel(), atol=1e-7)   # negatives -> eps, positives -> 1
    z0 = torch.full_like(Z, math.log(eps / (1 - eps)))
    _, g0 = grad(lambda z: E.loss_bce_ls(z, T, eps), z0)
    assert torch.allclose(g0[T == 0], torch.zeros(5), atol=1e-7)           # a negative is at its optimum at p = eps
    assert (g0[T > 0] < 0).all()


def test_asl_reduces_to_bce_and_ignores_easy_negatives():
    assert float(E.loss_asl(Z, T, 0.0, 0.0, 0.0)) == pytest.approx(float(E.loss_bce(Z, T)), rel=1e-6)
    m = 0.05
    loss, g = grad(lambda z: E.loss_asl(z, T, 0.0, 2.0, m))
    p = torch.sigmoid(Z)
    easy = (T == 0) & (p <= m)
    assert easy.any() and (g[easy] == 0).all()                              # p <= margin: no loss, no gradient
    hard = (T == 0) & (p > m)
    assert (g[hard] > 0).all()
    # hand value: positives are plain log-loss (gamma+ = 0), negatives (p - m)^2 * -log(1 - (p - m))
    pm = (p - m).clamp(min=0)
    hand = (T * -torch.log(p) + (1 - T) * pm ** 2 * -torch.log(1 - pm)).mean()
    assert loss == pytest.approx(float(hand), rel=1e-6)
    # negatives are down-weighted relative to BCE, positives are not
    _, gb = grad(lambda z: E.loss_bce(z, T))
    assert (g[T == 0] <= gb[T == 0] + 1e-9).all() and torch.allclose(g[T > 0], gb[T > 0], atol=1e-7)
    # positive focusing: gamma+ > 0 shrinks the loss of well-classified positives
    assert float(E.loss_asl(Z, T, 1.0, 2.0, m)) < loss


def test_hill_negative_gradient_is_a_hill():
    zs = torch.tensor([[-4.0, -2.0, 0.0, 2.0, 4.0, 8.0]])
    Tn = torch.zeros_like(zs)
    loss, g = grad(lambda z: E.loss_hill(z, Tn), zs)
    p = torch.sigmoid(zs)
    assert loss == pytest.approx(float(((1.5 - p) * p ** 2).mean()), rel=1e-6)
    assert torch.allclose(g, 3 * p ** 2 * (1 - p) ** 2 / zs.numel(), atol=1e-7)      # lambda = 1.5: 3 p^2 (1 - p)^2
    g = g[0]
    assert g.argmax() == 2 and g[5] < g[3] < g[2], "the gradient must fall again for confident 'negatives'"
    _, gb = grad(lambda z: E.loss_bce(z, Tn), zs)
    assert gb[0][5] > gb[0][2]                                                         # unlike BCE
    # positive part: focal margin loss on sigmoid(z - 1)
    Tp = torch.ones_like(zs)
    loss_p, gp = grad(lambda z: E.loss_hill(z, Tp), zs)
    pm = torch.sigmoid(zs - 1.0)
    assert loss_p == pytest.approx(float((-(1 - pm) ** 2 * torch.log(pm)).mean()), rel=1e-5)
    assert (gp < 0).all()


def test_wbce_reduces_to_bce_for_equal_weights_and_scales_positives():
    Yc = (Y > 0).float() * 0.8
    Tc, Wc, _ = E.make_targets(Yc, torch.tensor([0, 1]))
    assert torch.allclose(Wc, Tc)
    assert float(E.loss_wbce(Z, Tc, Wc)) == pytest.approx(float(E.loss_bce(Z, Tc)))
    _, g = grad(lambda z: E.loss_wbce(z, T, W))
    _, gb = grad(lambda z: E.loss_bce(z, T))
    assert torch.allclose(g[T == 0], gb[T == 0])                                       # negatives untouched
    assert torch.allclose(g[T > 0], gb[T > 0] * W[T > 0], atol=1e-7)                   # positives scaled by the rank weight
    assert abs(g[0, 0] / gb[0, 0]) > abs(g[0, 1] / gb[0, 1])                           # first-listed descriptor counts more


def test_listnet():
    loss, g = grad(lambda z: E.loss_listnet(z, Q))
    assert loss == pytest.approx(float(Fn.cross_entropy(Z, Q)), rel=1e-6)
    assert torch.allclose(g, (torch.softmax(Z, 1) - Q) / len(Z), atol=1e-7)
    assert float(E.loss_listnet(Z + 3.0, Q)) == pytest.approx(loss, rel=1e-6)          # shift-invariant per album
    good = torch.tensor([[3.0, 2.0, -2.0, -2.0]])
    bad = torch.tensor([[2.0, 3.0, -2.0, -2.0]])
    worse = torch.tensor([[-2.0, -2.0, 3.0, 2.0]])
    q = Q[:1]
    assert float(E.loss_listnet(good, q)) < float(E.loss_listnet(bad, q)) < float(E.loss_listnet(worse, q))
    assert float(E.loss_listnet(torch.log(q + 1e-12), q)) == pytest.approx(float(-(q[q > 0] * torch.log(q[q > 0])).sum()), rel=1e-5)


def test_bce_plus_listnet_is_the_weighted_sum():
    b, l = float(E.loss_bce(Z, T)), float(E.loss_listnet(Z, Q))
    assert float(E.compute_loss(Z, T, W, Q, cfg("bce+listnet", listnet_lambda=0.0))) == pytest.approx(b)
    assert float(E.compute_loss(Z, T, W, Q, cfg("bce+listnet", listnet_lambda=0.3))) == pytest.approx(b + 0.3 * l, rel=1e-6)
    assert E.score_kind("listnet") == "softmax" and E.score_kind("bce+listnet") == "sigmoid"
    with pytest.raises(ValueError):
        E.compute_loss(Z, T, W, Q, cfg("nope"))


# ---------------------------------------------------------------- models

BLOCKS = [(0, 6), (6, 10)]


def body(**kw):
    return {"depth": 1, "hidden": 8, "dropout": 0.0, "in_dropout": 0.0, "noise": 0.0, "proj": 0, **kw}


def test_album_net_shapes_and_projection():
    x = torch.randn(5, 10)
    assert E.Net(BLOCKS, 120, **body())(x).shape == (5, 120)
    assert E.Net(BLOCKS, 120, **body(depth=0))(x).shape == (5, 120)
    net = E.Net(BLOCKS, 120, **body(proj=3, depth=0))
    assert [tuple(p.weight.shape) for p in net.body.proj] == [(3, 6), (3, 4)] and net.head.in_features == 6
    net.eval()
    x2 = x.clone()
    x2[:, 6:] += 1.0                               # block 2 only feeds projection 2
    h1 = net.body.proj[0](net.body.normalise(x)[:, :6])
    h2 = net.body.proj[0](net.body.normalise(x2)[:, :6])
    assert torch.equal(h1, h2)
    assert E.Net([(0, 10)], 120, **body(proj=3)).body.proj is None       # a single block is never projected


def test_noise_and_dropout_only_in_training():
    torch.manual_seed(0)
    net = E.Net(BLOCKS, 120, **body(noise=0.5, in_dropout=0.3, dropout=0.3))
    x = torch.randn(4, 10)
    net.eval()
    assert torch.equal(net(x), net(x))
    net.train()
    assert not torch.equal(net(x), net(x))


@pytest.mark.parametrize("pool", E.TRACK_POOLS)
def test_track_pools_ignore_padding(pool):
    torch.manual_seed(1)
    net = E.Net(BLOCKS, 120, pool=pool, attn_dim=4, **body()).eval()
    with torch.no_grad():
        for p in net.parameters():                 # attention starts at zero: randomise so the mask matters
            p.add_(0.3 * torch.randn_like(p))
        x = torch.randn(3, 4, 10)
        mask = torch.tensor([[1, 1, 0, 0], [1, 1, 1, 1], [1, 0, 0, 0]], dtype=torch.bool)
        z = net(x, mask)
        x2 = x.clone()
        x2[~mask] = 1e3 * torch.randn_like(x2[~mask])
        assert z.shape == (3, 120) and torch.allclose(z, net(x2, mask), atol=1e-5)
        # one valid track: every pooling equals the album model on that track
        single = E.Net(BLOCKS, 120, pool="album", **body()).eval()
        single.load_state_dict({k: v for k, v in net.state_dict().items() if k in single.state_dict()})
        assert torch.allclose(z[2], single(x[2, :1])[0], atol=1e-5)
        with pytest.raises(AssertionError):
            net(x, torch.zeros(3, 4, dtype=torch.bool))


def test_attention_weights_are_masked_and_start_uniform():
    for pool in ("attn", "gated"):
        net = E.Net(BLOCKS, 120, pool=pool, **body()).eval()
        h = torch.randn(2, 4, 8)
        mask = torch.tensor([[1, 1, 1, 0], [1, 0, 0, 0]], dtype=torch.bool)
        a = net.attention(h, mask)
        assert torch.allclose(a.sum(1), torch.ones(2)) and (a[~mask] == 0).all()
        assert torch.allclose(a[0, :3], torch.full((3,), 1 / 3), atol=1e-6)          # zero-initialised query / w
        # ... so at initialisation attention pooling == mean of the track embeddings
        x = torch.randn(2, 4, 10)
        hh = net.body.embed(net.body.normalise(x))
        m = mask.unsqueeze(-1).float()
        assert torch.allclose(net(x, mask), net.head((hh * m).sum(1) / m.sum(1)), atol=1e-5)


def test_mean_track_pool_equals_album_model_on_the_mean():
    torch.manual_seed(2)
    tr = E.Net(BLOCKS, 120, pool="mean", **body()).eval()
    al = E.Net(BLOCKS, 120, pool="album", **body()).eval()
    al.load_state_dict(tr.state_dict())
    x = torch.randn(3, 4, 10)
    mask = torch.tensor([[1, 1, 0, 0], [1, 1, 1, 1], [1, 0, 0, 0]], dtype=torch.bool)
    xm = torch.stack([x[i][mask[i]].mean(0) for i in range(3)])
    assert torch.allclose(tr(x, mask), al(xm), atol=1e-5)


def test_norm_stats_match_standardizer():
    rng = np.random.default_rng(0)
    X = rng.normal(2.0, 3.0, (50, 7)).astype(np.float32)
    X[:, 3] = 5.0                                   # constant column: centred, not scaled
    idx = torch.arange(0, 30)
    mean, scale = E.norm_stats(torch.as_tensor(X), None, idx)
    sc = F.Standardizer().fit(X[:30])
    assert np.allclose(mean, sc.mean_, atol=1e-5) and np.allclose(scale, sc.scale_, atol=1e-4) and scale[3] == 1.0
    Xt = rng.normal(0, 1, (10, 4, 7)).astype(np.float32)
    mask = rng.random((10, 4)) < 0.6
    mask[:, 0] = True
    mean, scale = E.norm_stats(torch.as_tensor(Xt), torch.as_tensor(mask), torch.arange(10))
    sc = F.Standardizer().fit_tracks(Xt, mask)
    assert np.allclose(mean, sc.mean_, atol=1e-5) and np.allclose(scale, sc.scale_, atol=1e-4)


# ---------------------------------------------------------------- training loop on synthetic data

def synth(n=240, d=10, tracks=False, seed=0):
    """Labels are a noisy linear function of the features; rows 0..n_train-1 are train, the rest 'val'."""
    rng = np.random.default_rng(seed)
    X = rng.normal(0, 1, (n, d)).astype(np.float32) * 5 + 3          # off-centre, so standardisation matters
    A = rng.normal(0, 1, (d, 120)).astype(np.float32)
    logits = (X - 3) / 5 @ A
    Yw = np.zeros((n, 120), np.float32)
    top = np.argsort(-logits, 1)[:, :8]
    for i in range(n):
        Yw[i, top[i]] = 1.5 - np.arange(8) / 42
    n_tr = 200
    D = {"Y": Yw[:n_tr], "n_train": n_tr, "groups": np.arange(n_tr) // 2, "blocks": [(0, 6), (6, d)]}
    if tracks:
        Xt = X[:, None, :] + rng.normal(0, 1.0, (n, 3, d)).astype(np.float32)
        mask = np.ones((n, 3), bool)
        mask[::2, 2] = False
        Xt[~mask] = 0.0
        D.update(X=torch.as_tensor(Xt), mask=torch.as_tensor(mask))
    else:
        D.update(X=torch.as_tensor(X), mask=None)
    return D, Yw


def small(**kw):
    return E.canon({"hidden": 32, "dropout": 0.1, "lr": 3e-3, "batch": 32, "wd": 0.01, **kw})


def chance(Yv):
    return float(E.M.ndcg_at_k(Yv, np.tile(Yv.mean(0), (len(Yv), 1)), 10).mean())


def test_holdout_is_group_disjoint_and_seeded():
    groups = np.arange(100) // 4
    a, h = E.split_holdout(np.arange(100), groups, seed=3)
    assert not set(groups[a]) & set(groups[h]) and len(a) + len(h) == 100 and 8 <= len(h) <= 24
    a2, h2 = E.split_holdout(np.arange(100), groups, seed=3)
    assert np.array_equal(h, h2) and not np.array_equal(h, E.split_holdout(np.arange(100), groups, seed=4)[1])
    sub = np.arange(40, 100)
    a3, h3 = E.split_holdout(sub, groups, seed=0)
    assert set(a3) | set(h3) == set(sub)


@pytest.mark.parametrize("loss", E.LOSSES)
def test_training_learns_with_every_loss(loss):
    D, Yw = synth()
    c = small(loss=loss)
    fit_idx, hold = E.split_holdout(np.arange(200), D["groups"], 0)
    model, info = E.fit(D, c, fit_idx, hold, 0, max_epochs=25, patience=6)
    S = E.predict(model, D, np.arange(200, 240), E.score_kind(loss))
    nd = float(E.M.ndcg_at_k(Yw[200:], S, 10).mean())
    assert np.isfinite(S).all() and not info["diverged"] and 1 <= info["best_epoch"] <= info["epochs_run"] <= 25
    assert nd > chance(Yw[200:]) + 0.15, (loss, nd, chance(Yw[200:]))
    if loss == "listnet":
        assert np.allclose(S.sum(1), 1.0)
    else:
        assert ((S >= 0) & (S <= 1)).all()
    # the standardiser stored in the model comes from the fitted rows only (not the holdout, not val)
    mean, scale = E.norm_stats(D["X"], None, torch.as_tensor(fit_idx))
    assert torch.equal(model.body.mean, mean) and torch.equal(model.body.scale, scale)
    assert not torch.allclose(mean, E.norm_stats(D["X"], None, torch.arange(240))[0])


def test_fit_is_deterministic_and_seed_dependent():
    D, _ = synth()
    c = small(mixup=0.2, noise=0.1, in_dropout=0.1)
    a, h = E.split_holdout(np.arange(200), D["groups"], 0)
    p = [E.predict(E.fit(D, c, a, h, s, max_epochs=3, patience=3)[0], D, np.arange(200, 240), "sigmoid") for s in (0, 0, 1)]
    assert np.array_equal(p[0], p[1]) and not np.array_equal(p[0], p[2])


def test_bias_init_is_the_fit_prevalence():
    D, Yw = synth()
    a = np.arange(0, 150)
    model, info = E.fit(D, small(), a, None, 0, max_epochs=0, patience=1, replay=[])
    prev = np.clip((Yw[a] > 0).mean(0), 1e-3, 1 - 1e-3)
    assert np.allclose(torch.sigmoid(model.head.bias).detach().numpy(), prev, atol=1e-5) and info["epochs_run"] == 0


def test_refit_replays_the_early_stopped_schedule():
    D, Yw = synth()
    c = small(schedule="plateau")
    (S1,), i1 = E.train_ensemble(D, c, np.arange(200), [np.arange(200, 240)], [0], max_epochs=12, patience=4)
    (S2,), i2 = E.train_ensemble(D, c, np.arange(200), [np.arange(200, 240)], [0], max_epochs=12, patience=4, refit=True)
    assert i2[0]["refit"] and i2[0]["n_fit"] == 200 and i1[0]["n_fit"] < 200 and i2[0]["best_epoch"] == i1[0]["best_epoch"]
    assert not np.array_equal(S1, S2)
    assert float(E.M.ndcg_at_k(Yw[200:], S2, 10).mean()) > chance(Yw[200:]) + 0.15


def test_cv_run_and_seed_ensemble():
    D, Yw = synth()
    idx = np.arange(200)
    folds = [(np.flatnonzero(D["groups"] % 2 != f), np.flatnonzero(D["groups"] % 2 == f)) for f in range(2)]
    r = E.cv_run(D, small(), folds, [0, 1], max_epochs=40, patience=8)
    assert r["oof"].shape == (200, 120) and np.isfinite(r["oof"]).all() and r["n_fits"] == 4 and len(r["fold_ndcg@10"]) == 2
    assert r["ndcg@10"] > chance(Yw[:200]) + 0.08 and 0 < r["precision@10"] <= 1 and 0 < r["mAP"] <= 1
    assert "oof" not in E.slim(r)
    # ensemble = mean of the members' scores
    (S,), _ = E.train_ensemble(D, small(), idx, [np.arange(200, 240)], [0, 1], max_epochs=4, patience=2)
    members = [E.train_ensemble(D, small(), idx, [np.arange(200, 240)], [s], max_epochs=4, patience=2)[0][0] for s in (0, 1)]
    assert np.allclose(S, (members[0] + members[1]) / 2)


@pytest.mark.parametrize("pool", E.TRACK_POOLS)
def test_track_models_train(pool):
    D, Yw = synth(tracks=True)
    c = E.canon({"hidden": 32, "dropout": 0.1, "lr": 3e-3, "batch": 32, "wd": 0.01, "pool": pool, "mixup": 0.4})
    assert c["mixup"] == 0.0 and "pooling" not in c
    (S,), info = E.train_ensemble(D, c, np.arange(200), [np.arange(200, 240)], [0], max_epochs=15, patience=5)
    assert S.shape == (40, 120) and float(E.M.ndcg_at_k(Yw[200:], S, 10).mean()) > chance(Yw[200:]) + 0.10


def test_diverged_fit_returns_finite_scores():
    D, _ = synth()
    D["X"] = D["X"].clone()
    c = small(lr=1e-3)
    a, h = E.split_holdout(np.arange(200), D["groups"], 0)
    D["Y"] = D["Y"].copy()
    orig = E.compute_loss
    try:
        E.compute_loss = lambda *args, **kw: orig(*args, **kw) * float("nan")
        model, info = E.fit(D, c, a, h, 0, max_epochs=3, patience=2)
    finally:
        E.compute_loss = orig
    assert info["diverged"] and np.isfinite(E.predict(model, D, np.arange(200, 240), "sigmoid")).all()


# ---------------------------------------------------------------- configurations

def test_search_configs_are_deterministic_unique_and_start_with_anchors():
    a = E.search_configs(22, 0, True, False)
    b = E.search_configs(22, 0, True, False)
    assert a == b and len(a) == 22 and len({E.cfg_id(c) for _, c in a}) == 22
    assert [c["loss"] for _, c in a[:7]] == list(E.LOSSES) and a[0][1] == E.canon({})
    assert sum(o.startswith("anchor") for o, _ in a) == 12 and a[12][0] == "random"
    assert E.search_configs(22, 1, True, False)[12:] != a[12:]
    assert all(c["proj"] == 0 for _, c in E.search_configs(30, 0, False, False))
    for _, c in a:
        E.build_model(c, [(0, 6), (6, 10)])
        assert E.NAME_OK(f"mlp__{E.tag(E.short(c))}_{E.cfg_id(c)}")
    q = E.search_configs(9, 0, True, True)
    assert {c["loss"] for _, c in q} == set(E.LOSSES) and len(q) == 9


def test_canon_drops_unused_hyperparameters():
    assert E.canon({"depth": 0, "hidden": 512, "dropout": 0.5}) == E.canon({"depth": 0, "hidden": 64, "dropout": 0.1})
    assert "ls_eps" not in E.canon({"loss": "bce", "ls_eps": 0.3}) and E.canon({"loss": "bce_ls"})["ls_eps"] == 0.05
    assert E.canon({"loss": "asl"})["gamma_neg"] == 2.0 and E.canon({"loss": "listnet", "rank_pow": 2})["rank_pow"] == 2.0
    assert E.cfg_id(E.canon({"lr": 1e-3})) == E.cfg_id(E.canon({})) != E.cfg_id(E.canon({"lr": 3e-3}))


def test_resolve_spec(tmp_path, monkeypatch):
    assert E.resolve_spec("maest:7+clap") == ("maest:7+clap", "given")
    monkeypatch.setattr(E, "HERE", tmp_path)
    assert E.resolve_spec("auto")[0] == E.DEFAULT_SPEC and "mert_v2" not in E.DEFAULT_SPEC
    (tmp_path / "results").mkdir()
    (tmp_path / "results" / "linear_summary.json").write_text(E.json.dumps({
        "layers": {"best": {"maest": {"spec": "maest:9"}, "mert": {"spec": "mert:5"}, "effnet": {"spec": "effnet"}}},
        "concat": {"best_run_by_cv": {"blocks": ["effnet|mean+std", "maest:9|mean"]}}}))
    assert E.resolve_spec("auto")[0] == "maest:9+mert:5+clap+heads"
    assert E.resolve_spec("concat")[0] == "effnet+maest:9"


def test_blocks_group_statistics_per_encoder():
    blocks, names = E._blocks("maest:7+clap", "mean+std")
    assert names == ["maest:7", "clap"] and blocks == [(0, 1536), (1536, 2560)]
    assert E._blocks("maest:7+clap", "mean")[0] == [(0, 768), (768, 1280)]
