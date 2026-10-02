import math

import numpy as np
from scipy.spatial import cKDTree

from rmr_pipeline.constants import ISLAND_LINK_GAPS, STOPS, UMAP_MIN_DIST
from rmr_pipeline.layout import (finalize_layouts, fix_stacks, flat_positions, median_gap, norm_box, procrustes_to,
                                 pull_islands, stacked3, umap_embed)


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
    assert math.isclose(max(float(np.abs(E).max()) for E in out.values()), 1.0, rel_tol=1e-9)
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


def _cloud_with_islands(seed=4):
    """A 600-point disc, a 20-point blob far to the right and one stray point far below."""
    rng = np.random.default_rng(seed)
    r, a = np.sqrt(rng.uniform(0, 1, 600)), rng.uniform(0, 2 * math.pi, 600)
    main = np.c_[r * np.cos(a), r * np.sin(a)]
    blob = rng.normal(0, 0.03, (20, 2)) + [6.0, 1.0]
    return np.vstack([main, blob, [[0.5, -9.0]]]), np.arange(600), np.arange(600, 620), 620


def _knn(E, k):
    return cKDTree(E).query(E, k=k + 1)[1][:, 1:]


def test_pull_islands_brings_detached_groups_next_to_the_cloud():
    E, main, blob, stray = _cloud_with_islands()
    reach = ISLAND_LINK_GAPS * median_gap(E)
    P, moved = pull_islands(E)
    assert moved == 21
    np.testing.assert_array_equal(P[main], E[main])
    # The blob keeps its shape and is enlarged to the map's density: UMAP packs detached groups far tighter.
    grow = median_gap(E) / median_gap(E[blob])
    assert grow > 2
    np.testing.assert_allclose(P[blob] - P[blob].mean(0), (E[blob] - E[blob].mean(0)) * grow, atol=1e-9)
    assert math.isclose(median_gap(P[blob]), median_gap(E), rel_tol=1e-6)
    tree = cKDTree(P[main])
    for group in (blob, [stray]):
        gap = float(tree.query(P[group])[0].min())
        assert reach < gap < 1.01 * reach
    # Both islands were several cloud widths away; the frame is now little more than the cloud.
    assert np.ptp(E, axis=0).max() > 9
    assert np.ptp(P, axis=0).max() < 2 + 2.2 * reach + np.ptp(P[blob], axis=0).max()


def test_pull_islands_does_not_shrink_a_sparse_island():
    E, main, blob, _ = _cloud_with_islands()
    wider = 1.5 * median_gap(E[main]) / median_gap(E[blob])  # sparser than the disc, still one detached group
    E[blob] = E[blob].mean(0) + (E[blob] - E[blob].mean(0)) * wider
    assert median_gap(E[blob]) > median_gap(E)
    P, _ = pull_islands(E)
    np.testing.assert_allclose(P[blob] - P[blob[0]], E[blob] - E[blob[0]], atol=1e-9)


def test_pull_islands_keeps_a_connected_cloud_and_everyones_neighbours():
    rng = np.random.default_rng(5)
    E = rng.normal(size=(500, 2))
    core = np.linalg.norm(E, axis=1) < 1.5  # a cloud with no detached point
    P, moved = pull_islands(E[core])
    assert moved == 0
    np.testing.assert_array_equal(P, E[core])
    E, main, blob, _ = _cloud_with_islands()
    P, _ = pull_islands(E)
    before, after = _knn(E, 10), _knn(P, 10)
    same = [len(set(before[i]) & set(after[i])) / 10 for i in list(main) + list(blob)]
    assert np.mean(same) > 0.97


def test_pull_islands_is_deterministic():
    E = _cloud_with_islands()[0]
    np.testing.assert_array_equal(pull_islands(E)[0], pull_islands(E.copy())[0])


def test_finalize_layouts_gives_every_stop_the_same_median_gap():
    """The site draws covers at one size for all stops, so a clumped stop must not come out denser."""
    rng = np.random.default_rng(6)
    balanced = rng.uniform(-1, 1, (800, 2))
    centres = rng.uniform(-1, 1, (40, 2))
    clumped = centres[rng.integers(0, 40, 800)] + rng.normal(0, 0.02, (800, 2))  # tight clumps, wide voids
    stretched = balanced * [3.0, 1.0]
    raw = {"balanced": balanced, "sonic": clumped, "mood": stretched}
    assert median_gap(norm_box(clumped)) < 0.5 * median_gap(norm_box(balanced))
    out = finalize_layouts(raw)
    gaps = {stop: median_gap(out[stop]) for stop in STOPS}
    for stop in ("sonic", "mood"):
        assert math.isclose(gaps[stop], gaps["balanced"], rel_tol=0.02)
    for stop in STOPS:
        assert float(np.abs(out[stop]).max()) <= 1.0 + 1e-12
        assert stacked3(out[stop]) == 0
        # Resizing a stop never reorders anyone's neighbours.
        before, after = _knn(np.asarray(raw[stop]), 10), _knn(out[stop], 10)
        assert np.mean([len(set(before[i]) & set(after[i])) / 10 for i in range(800)]) > 0.97


def test_finalize_layouts_does_not_let_a_far_speck_set_the_frame():
    E, main, _, _ = _cloud_with_islands()
    out = finalize_layouts({"balanced": E, "sonic": E, "mood": E})["balanced"]
    disc = np.ptp(out[main], axis=0).max()
    assert np.ptp(out, axis=0).max() < 1.5 * disc  # 2.07 when each stop was scaled to its own bounding box


def test_finalize_layouts_is_deterministic():
    E = _cloud_with_islands()[0]
    raw = {"balanced": E, "sonic": E @ _rot(0.3).T, "mood": E * [1, -1]}
    a, b = finalize_layouts(raw), finalize_layouts({k: v.copy() for k, v in raw.items()})
    for stop in STOPS:
        assert flat_positions(a[stop]) == flat_positions(b[stop])


def test_min_dist_spreads_a_clumped_embedding():
    """The lever behind UMAP_MIN_DIST: at a larger min_dist neighbours sit further apart relative to the map."""
    rng = np.random.default_rng(7)
    X = np.vstack([rng.normal(c, 0.3, (40, 6)) for c in rng.normal(0, 3, (6, 6))]).astype(np.float32)

    def evenness(E):  # median gap over the gap of a uniform cloud of the same bounding box
        return median_gap(E) / math.sqrt(np.prod(np.ptp(E, axis=0)) / len(E))

    assert evenness(umap_embed(X, 0.8)) > 1.3 * evenness(umap_embed(X, 0.05))
    assert set(UMAP_MIN_DIST) == set(STOPS)
    assert all(0 < v <= 1 for v in UMAP_MIN_DIST.values())
