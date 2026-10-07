"""The catalog build's rule for an album with no audio: mood side only."""
import numpy as np
import pandas as pd
import pytest

from rmr_pipeline.audio import audio_block, descriptors, mean_fill, site_matrix
from rmr_pipeline.audio_store import DEFAULT_AUDIO
from rmr_pipeline.constants import AUDIO_STOPS, NO_AUDIO_NEIGHBOURS, SLIDER, STOPS
from rmr_pipeline.layout import (build_layouts, finalize_layouts, flat_positions, nearest_with_audio, stacked3,
                                 with_derived)
from rmr_pipeline.recs import build_recs, no_audio_columns, rec_lists, top_k_mutual, top_k_neighbours

COLS = ["dark", "warm", "cold", "lush", "raw", "epic"]


def _frame(n: int, seed: int = 0) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """n albums with random descriptors and a random 4-column block; every fifth album has no audio."""
    rng = np.random.default_rng(seed)
    sub = pd.DataFrame(rng.uniform(0, 1.5, (n, len(COLS))).round(3), columns=COLS)
    sub.insert(0, "URI", [f"spotify:album:{i:022d}" for i in range(n)])
    sub.insert(0, "Artist", [f"A{i}" for i in range(n)])
    sub.insert(0, "Title", [f"T{i}" for i in range(n)])
    has_audio = np.arange(n) % 5 != 2
    block = rng.normal(size=(n, 4)).astype(np.float32)
    return sub, mean_fill(block, has_audio), has_audio


# --- the audio block ---

def test_mean_fill_gives_the_albums_without_audio_the_mean_block():
    block = np.array([[1, 2], [9, 9], [3, 6], [9, 9], [5, 1]], dtype=np.float32)
    has = np.array([True, False, True, False, True])
    out = mean_fill(block, has)
    assert out.dtype == np.float32 and out is not block
    np.testing.assert_array_equal(out[has], block[has])
    np.testing.assert_allclose(out[~has], [[3, 3], [3, 3]])
    np.testing.assert_array_equal(mean_fill(block, np.ones(5, dtype=bool)), block)


def test_the_catalog_block_is_not_imputed(deduped, audio):
    sub, _ = deduped
    plain = audio_block(sub, DEFAULT_AUDIO, fill="mean")  # the `audio` fixture's store
    assert (plain.has_audio == audio.has_audio).all() and not plain.has_audio.all()
    np.testing.assert_array_equal(plain.block[plain.has_audio], audio.block[audio.has_audio])
    mean = audio.block[audio.has_audio].astype(np.float64).mean(axis=0)
    np.testing.assert_allclose(plain.block[~plain.has_audio], np.tile(mean, ((~plain.has_audio).sum(), 1)), atol=1e-6)
    assert not np.allclose(audio.block[~audio.has_audio], plain.block[~plain.has_audio])  # the default still imputes
    assert "imputed" in audio.summary() and "imputed" not in plain.summary()
    with pytest.raises(ValueError, match="fill"):
        audio_block(sub, DEFAULT_AUDIO, fill="zero")


# --- recommendations ---

def _tied(n=400):
    rng = np.random.default_rng(3)
    X = rng.integers(0, 3, size=(n, 6)).astype(np.float32)  # exact ties and duplicate rows
    X[50:70] = X[7]
    return X


def test_the_pool_is_both_the_seeds_and_the_candidates():
    X = _tied()
    pool = np.arange(len(X)) % 4 != 1
    out = top_k_neighbours(X, 10, pool=pool)
    assert out.shape == (len(X), 10) and (out[~pool] == -1).all()
    assert pool[out[pool]].all()  # nobody outside the pool is recommended
    # what the unrestricted ranking gives on the pool's rows alone, in the catalog's numbering
    idx = np.flatnonzero(pool)
    np.testing.assert_array_equal(out[pool], idx[top_k_neighbours(X[pool], 10)])
    # distance first, then the row number, as without a pool
    D = ((X[:, None, :].astype(np.float64) - X[None, :, :]) ** 2).sum(axis=2)
    D[:, ~pool] = np.inf
    np.fill_diagonal(D, np.inf)
    np.testing.assert_array_equal(out[pool], np.argsort(D, axis=1, kind="stable")[pool, :10])


def test_a_pool_of_everyone_changes_nothing():
    X = _tied()
    np.testing.assert_array_equal(top_k_neighbours(X, 10, pool=np.ones(len(X), dtype=bool)), top_k_neighbours(X, 10))
    rng = np.random.default_rng(1)
    Y = rng.normal(size=(200, 5))
    np.testing.assert_array_equal(top_k_mutual(Y, 10, pool=np.ones(200, dtype=bool)), top_k_mutual(Y, 10))


def test_the_mutual_ranking_takes_a_pool_too():
    rng = np.random.default_rng(1)
    Y = rng.normal(size=(200, 5))
    pool = np.arange(200) % 3 != 0
    out = top_k_mutual(Y, 10, pool=pool)
    assert (out[~pool] == -1).all()
    np.testing.assert_array_equal(out[pool], np.flatnonzero(pool)[top_k_mutual(Y[pool], 10)])


def test_a_bad_pool_is_refused():
    X = _tied(40)
    with pytest.raises(ValueError, match="pool"):
        top_k_neighbours(X, 10, pool=np.ones(39, dtype=bool))
    with pytest.raises(ValueError, match="k must be"):
        top_k_neighbours(X, 10, pool=np.arange(40) < 10)  # ten albums have nine others


def test_rec_lists_writes_an_empty_list_for_an_album_outside_the_pool():
    R = np.array([[1, 2], [-1, -1], [0, 1]])
    assert rec_lists(R) == [[1, 2], [], [0, 1]]
    assert rec_lists(R[[0, 2]]) == R[[0, 2]].tolist()


def test_mood_only_albums_have_no_sonic_or_balanced_list_and_are_in_none():
    sub, block, has_audio = _frame(120)
    recs = build_recs(sub, block, has_audio=has_audio, mood_only=True)
    for stop in AUDIO_STOPS:
        assert (recs[stop][~has_audio] == -1).all()
        assert has_audio[recs[stop][has_audio]].all()
        X = site_matrix(sub, block, SLIDER[stop])
        np.testing.assert_array_equal(recs[stop], top_k_neighbours(X, pool=has_audio))
        assert [len(r) for r in rec_lists(recs[stop])] == [10 if h else 0 for h in has_audio]
    # the mood stop ranks everyone, and albums without audio are recommended there
    mood = np.hstack([site_matrix(sub, block, SLIDER["mood"]), no_audio_columns(block, has_audio)])
    np.testing.assert_array_equal(recs["mood"], top_k_neighbours(mood))
    assert (recs["mood"] >= 0).all() and (~has_audio)[recs["mood"]].any()


def test_the_mood_correction_puts_two_albums_without_audio_as_far_apart_as_two_with():
    """Six albums with the same descriptors, so the audio side alone ranks them. Four have audio, at
    distance 3 from their mean block on two axes (V = 9); two have none and sit at the mean block."""
    sub = pd.DataFrame({"Title": list("abcdef"), "Artist": list("abcdef"), "URI": [f"u{i}" for i in range(6)], "dark": 1.0})
    has_audio = np.array([True, True, True, True, False, False])
    block = mean_fill(np.array([[3, 0], [-3, 0], [0, 3], [0, -3], [9, 9], [9, 9]], dtype=np.float32), has_audio)
    cols = no_audio_columns(block, has_audio)
    assert cols.dtype == np.float32 and cols.shape == (6, 2)
    np.testing.assert_array_equal(cols, [[0, 0]] * 4 + [[3, 0], [0, 3]])  # sqrt(V) on the album's own row
    X = np.hstack([block, cols]).astype(np.float64)
    sq = ((X[:, None] - X[None]) ** 2).sum(axis=2)
    assert sq[4, 5] == 18 and sq[4, 0] == 9 + 9 and sq[0, 1] == 36 and sq[0, 2] == 18  # 2V; own distance + V
    # Uncorrected, each album without audio has the other first (distance 0). Corrected, the other one is as
    # far as an album with audio, and the earlier album wins the tie.
    plain = site_matrix(sub, block, SLIDER["mood"])
    assert top_k_neighbours(plain, 1)[4:, 0].tolist() == [5, 4]
    assert top_k_neighbours(np.hstack([plain, cols]), 1)[4:, 0].tolist() == [0, 0]


def test_the_mood_correction_is_in_the_catalog_builds_mood_lists_only():
    """Forty albums with the same descriptors; the eight without audio fill each other's lists (seven of
    ten places) until the correction, and the site build's lists do not get it."""
    sub, block, has_audio = _frame(40)
    sub[COLS] = 1.0
    quiet = ~has_audio

    def among_themselves(R):
        return int(quiet[R[quiet]].sum())

    plain = top_k_neighbours(site_matrix(sub, block, SLIDER["mood"]))
    recs = build_recs(sub, block, has_audio=has_audio, mood_only=True)
    assert among_themselves(plain) == 8 * 7 and among_themselves(recs["mood"]) < 8 * 3
    np.testing.assert_array_equal(build_recs(sub, block, has_audio=has_audio)["mood"], plain)
    for stop in AUDIO_STOPS:  # ranked on the site matrix alone
        np.testing.assert_array_equal(recs[stop], top_k_neighbours(site_matrix(sub, block, SLIDER[stop]), pool=has_audio))


def test_the_mood_correction_is_nothing_when_every_album_has_audio_and_needs_one_that_has():
    sub, block, _ = _frame(40)
    everyone = np.ones(40, dtype=bool)
    assert no_audio_columns(block, everyone).shape == (40, 0)
    recs = build_recs(sub, block, has_audio=everyone, mood_only=True)
    np.testing.assert_array_equal(recs["mood"], top_k_neighbours(site_matrix(sub, block, SLIDER["mood"])))
    with pytest.raises(ValueError, match="has_audio"):
        no_audio_columns(block, np.zeros(40, dtype=bool))
    with pytest.raises(ValueError, match="has_audio"):
        no_audio_columns(block, np.ones(39, dtype=bool))


def test_without_the_rule_every_album_is_ranked_everywhere():
    sub, block, has_audio = _frame(120)
    plain = build_recs(sub, block, has_audio=has_audio)
    for stop in STOPS:
        np.testing.assert_array_equal(plain[stop], top_k_neighbours(site_matrix(sub, block, SLIDER[stop])))
    with pytest.raises(ValueError, match="has_audio"):
        build_recs(sub, block, mood_only=True)


def test_hub_correction_keeps_to_the_pool():
    sub, block, has_audio = _frame(120)
    recs = build_recs(sub, block, ("balanced",), has_audio=has_audio, mood_only=True)
    X = site_matrix(sub, block, SLIDER["balanced"])
    np.testing.assert_array_equal(recs["balanced"], top_k_mutual(X, pool=has_audio))
    assert (recs["balanced"][~has_audio] == -1).all()


# --- layouts ---

def test_nearest_with_audio_by_descriptor_distance_ties_to_the_earlier_album():
    desc = np.array([[0.0], [1.0], [1.0], [5.0], [1.0], [2.0], [9.0]])
    has = np.array([True, True, False, True, True, True, False])
    near = nearest_with_audio(desc, has, k=3)
    # rows are numbered among the albums with audio: 0 -> album 0, 1 -> 1, 2 -> 3, 3 -> 4, 4 -> 5
    assert near.tolist() == [[1, 3, 0], [2, 4, 1]]  # album 2: albums 1 and 4 (distance 0), then 0 before 5 (both 1)
    assert nearest_with_audio(desc, np.ones(7, dtype=bool)).shape == (0, NO_AUDIO_NEIGHBOURS)
    with pytest.raises(ValueError, match="with audio"):
        nearest_with_audio(desc, np.array([True, True] + [False] * 5), k=3)


def test_with_derived_puts_an_album_at_the_mean_of_its_neighbours():
    E = np.array([[0.0, 0.0], [3.0, 0.0], [0.0, 3.0], [9.0, 9.0]])
    has = np.array([True, False, True, True, True, False])
    out = with_derived(E, has, np.array([[0, 1, 2], [1, 2, 3]]))
    np.testing.assert_array_equal(out[has], E)
    np.testing.assert_allclose(out[~has], [[1.0, 1.0], [4.0, 4.0]])


def _raw(n=600, seed=4):
    rng = np.random.default_rng(seed)
    has = np.arange(n) % 6 != 3
    desc = rng.uniform(0, 1, (n, 5))
    full = rng.normal(size=(n, 2))
    return has, desc, {"sonic": full[has] * 3 + 1, "balanced": full[has], "mood": rng.normal(size=(n, 2))}


def test_finalize_places_the_albums_without_audio_and_keeps_every_position_unique():
    has, desc, raw = _raw()
    desc[9] = desc[15] = desc[21]  # three albums without audio and the same descriptors: one derived spot
    assert not has[[9, 15, 21]].any()
    near = nearest_with_audio(desc, has)
    out = finalize_layouts(raw, has, near)
    for stop in STOPS:
        assert out[stop].shape == (len(has), 2) and np.isfinite(out[stop]).all()
        assert float(np.abs(out[stop]).max()) <= 1.0 + 1e-12
        assert stacked3(out[stop]) == 0
        flat = flat_positions(out[stop])
        assert len({(flat[2 * i], flat[2 * i + 1]) for i in range(len(has))}) == len(has)
    idx = np.flatnonzero(has)
    for stop in AUDIO_STOPS:
        E = out[stop]
        for row, i in enumerate(np.flatnonzero(~has)):
            if i in (9, 15, 21):  # spread on a small ring around the spot they share
                continue
            np.testing.assert_allclose(E[i], E[idx[near[row]]].mean(axis=0), atol=0.01)
        ring = E[[9, 15, 21]]
        assert np.linalg.norm(ring - ring.mean(axis=0), axis=1).max() < 0.01
    # the three stops still share a frame: sonic is balanced turned and resized
    assert np.abs(out["sonic"][has] - out["balanced"][has]).mean() < 0.05


def test_finalize_without_the_rule_is_what_it_was():
    has, _, raw = _raw()
    same = {stop: raw["mood"] for stop in STOPS}
    a, b = finalize_layouts(same), finalize_layouts(same, None, None)
    for stop in STOPS:
        np.testing.assert_array_equal(a[stop], b[stop])
    with pytest.raises(ValueError, match="sonic layout has"):
        finalize_layouts(same, has, nearest_with_audio(np.zeros((len(has), 1)), has))


def test_the_sonic_and_balanced_maps_are_fitted_on_the_albums_with_audio(monkeypatch):
    import rmr_pipeline.layout as layout

    sub, block, has_audio = _frame(300)
    seen = {}

    def fake_umap(X, min_dist=0.1):
        seen[len(seen)] = X.shape
        return np.random.default_rng(len(X)).normal(size=(len(X), 2))

    monkeypatch.setattr(layout, "umap_embed", fake_umap)
    out = build_layouts(sub, block, has_audio=has_audio, mood_only=True)
    n, m = len(sub), int(has_audio.sum())
    assert [s[0] for s in seen.values()] == [m, m, n]  # STOPS order: sonic, balanced, mood
    assert all(out[stop].shape == (n, 2) and stacked3(out[stop]) == 0 for stop in STOPS)
    near = nearest_with_audio(descriptors(sub), has_audio)
    idx = np.flatnonzero(has_audio)
    for row, i in enumerate(np.flatnonzero(~has_audio)):
        np.testing.assert_allclose(out["balanced"][i], out["balanced"][idx[near[row]]].mean(axis=0), atol=0.01)
    seen.clear()
    plain = build_layouts(sub, block, has_audio=has_audio)
    assert [s[0] for s in seen.values()] == [n, n, n] and plain["sonic"].shape == (n, 2)
