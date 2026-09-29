import math

import numpy as np

from rmr_pipeline.layout import finalize_layouts, fix_stacks, flat_positions, norm_box, procrustes_to, stacked3, umap_embed


def _rot(a):
    return np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])


def test_norm_box_fits_unit_box():
    rng = np.random.default_rng(0)
    E = rng.normal(size=(50, 2)) * [3, 1] + [5, -2]
    B = norm_box(E)
    assert math.isclose(float(np.abs(B).max()), 1.0, rel_tol=1e-9)
    assert np.allclose((B.min(0) + B.max(0)) / 2, 0)


def test_procrustes_recovers_rotation_and_reflection():
    rng = np.random.default_rng(1)
    ref = rng.normal(size=(40, 2))
    moved = (ref - ref.mean(0)) @ _rot(0.7).T * [1, -1] + [3, 4]
    np.testing.assert_allclose(procrustes_to(moved, ref), ref, atol=1e-9)


def test_fix_stacks_separates_coincident_points():
    E = np.zeros((5, 2))
    E[4] = [0.5, 0.5]
    E, moved = fix_stacks(E)
    assert moved == 4
    assert stacked3(E) == 0


def test_finalize_layouts_unit_box_aligned_and_unique():
    rng = np.random.default_rng(2)
    base = rng.normal(size=(300, 2))
    base[:5] = base[0]
    raw = {"balanced": base, "sonic": base @ _rot(1.1).T * 4 + 7, "mood": base @ _rot(-0.4).T}
    out = finalize_layouts(raw)
    for stop in ("sonic", "balanced", "mood"):
        assert out[stop].shape == (300, 2)
        assert float(np.abs(out[stop]).max()) <= 1.0 + 1e-12
        assert stacked3(out[stop]) == 0
    assert np.abs(out["sonic"] - out["balanced"]).mean() < 0.05


def test_flat_positions_rounds_to_three_decimals():
    flat = flat_positions(np.array([[0.12345, -0.98765], [-0.0, 1.0]]))
    assert flat == [0.123, -0.988, 0.0, 1.0]


def test_umap_embed_small():
    rng = np.random.default_rng(3)
    X = np.vstack([rng.normal(0, 1, (60, 5)), rng.normal(6, 1, (60, 5))]).astype(np.float32)
    E = umap_embed(X)
    assert E.shape == (120, 2)
    assert np.isfinite(E).all()


def test_stack_detection_uses_the_written_rounding():
    # -0.9985 is written as -0.999 by flat_positions (Python round) but np.round(-0.9985 / 1e-3) gives -998
    # (half-even), so a key built that way would put it apart from -0.999 and the validator would see a shared position.
    E = np.array([[-0.9985, 0.2], [-0.999, 0.2], [0.5, 0.5]])
    fixed, moved = fix_stacks(E)
    flat = flat_positions(fixed)
    pairs = {(flat[2 * i], flat[2 * i + 1]) for i in range(len(E))}
    assert len(pairs) == len(E)
    assert stacked3(fixed) == 0


def test_points_that_differ_beyond_three_decimals_count_as_stacked():
    E = np.array([[0.1231, 0.4], [0.1234, 0.4], [0.9, 0.9]])
    assert stacked3(E) == 2
