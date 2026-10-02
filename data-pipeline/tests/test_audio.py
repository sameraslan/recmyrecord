import numpy as np
import pytest

from rmr_pipeline.audio import (BLOCK_DIMS, IMPUTE_K, audio_block, descriptors, fit_transform, impute, load_transform,
                                main, refit, save_transform, site_matrix)
from rmr_pipeline.audio_store import DEFAULT_AUDIO, DIM, StoreError, append_shard, init_store, load_store
from rmr_pipeline.constants import AUDIO, REPO, SLIDER, STOPS
from rmr_pipeline.vocab import build_vocab

EXPERIMENT_TRANSFORM = REPO / "experiments" / "preview_features" / "results" / "solution_transform.npz"
LOVELESS = 5


def _emb(n: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return (rng.normal(size=(n, 8)) @ rng.normal(size=(8, DIM)) + 3 + 0.1 * rng.normal(size=(n, DIM))).astype(np.float16)


def test_fit_matches_the_target_variance_and_is_deterministic(tmp_path):
    emb = _emb(200)
    t = fit_transform(emb, 0.39, "m", k=6, fitted="2026-10-02")
    block = t.apply(emb)
    assert block.shape == (200, 6) and block.dtype == np.float32
    assert block.var(axis=0).sum() == pytest.approx(0.39, rel=1e-4)
    assert np.allclose(block.mean(axis=0), 0, atol=1e-5)
    assert np.allclose(t.components @ t.components.T, np.eye(6), atol=1e-5)
    assert (t.components[np.arange(6), np.abs(t.components).argmax(axis=1)] > 0).all()
    again = fit_transform(emb, 0.39, "m", k=6, fitted="2026-10-02")
    assert np.array_equal(again.components, t.components) and again.scale == t.scale
    assert np.allclose(t.apply(emb[:5].astype(np.float64) * 7), block[:5], atol=1e-6)  # only the direction counts
    save_transform(tmp_path / "transform.npz", t)
    loaded = load_transform(tmp_path / "transform.npz")
    assert np.array_equal(loaded.apply(emb), block)
    assert (loaded.fitted, loaded.albums, loaded.model, loaded.target_total_variance) == ("2026-10-02", 200, "m", 0.39)


def test_block_shape_and_determinism(deduped, audio):
    sub, _ = deduped
    assert audio.block.shape == (4081, BLOCK_DIMS) and audio.block.dtype == np.float32
    assert np.isfinite(audio.block).all()
    assert int(audio.has_audio.sum()) == 3944
    assert np.array_equal(audio_block(sub).block, audio.block)
    fitted = audio.block[audio.has_audio].astype(np.float64)
    assert fitted.var(axis=0).sum() == pytest.approx(audio.transform.target_total_variance, rel=1e-4)
    assert audio.summary() == ("audio: 3944 albums with audio, 137 imputed, 1 store shard(s), "
                               f"transform fitted {audio.transform.fitted} on 3944 albums")


def test_target_variance_is_the_spotify_blocks(deduped, audio):
    sub, _ = deduped
    spotify = sub.loc[audio.has_audio, AUDIO].to_numpy(dtype=np.float64)
    assert audio.transform.target_total_variance == pytest.approx(spotify.var(axis=0).sum(), rel=1e-9)


def test_block_agrees_with_the_experiments_d64(deduped, audio):
    """The experiment's published transform on the stored embeddings gives the same block: the
    production fit is the experiment's, up to the float16 rounding of the stored album means."""
    sub, _ = deduped
    z = np.load(EXPERIMENT_TRANSFORM)
    store = load_store(DEFAULT_AUDIO)
    e = store.emb[store.rows(sub["URI"][audio.has_audio])].astype(np.float64)
    e /= np.linalg.norm(e, axis=1, keepdims=True)
    d64 = (e - z["mean"].astype(np.float64)) @ z["components"].T.astype(np.float64) * float(z["scale"])
    assert np.abs(audio.block[audio.has_audio] - d64).max() < 5e-4
    assert audio.transform.scale == pytest.approx(float(z["scale"]), rel=1e-6)


def test_refit_on_the_committed_store_reproduces_the_committed_transform(deduped, audio):
    sub, _ = deduped
    t = refit(sub)
    assert np.allclose(t.components, audio.transform.components, atol=1e-5)
    assert np.allclose(t.mean, audio.transform.mean, atol=1e-7)
    assert t.scale == pytest.approx(audio.transform.scale, rel=1e-6)


def test_impute_on_a_small_example():
    block = np.array([[3, 0], [0, 4], [0, 0], [6, 0], [0, 0]], dtype=np.float32)
    desc = np.array([[0.0], [1.0], [0.4], [0.1], [5.0]])
    has = np.array([True, True, False, True, False])
    copy = impute(block, desc, has, k=1, rescale=False)
    assert copy[2].tolist() == [6, 0] and copy[4].tolist() == [0, 4]
    assert np.array_equal(copy[has], block[has])
    mean = impute(block, desc, has, k=2, rescale=False)
    assert mean[2].tolist() == [4.5, 0] and mean[4].tolist() == [3, 2]
    scaled = impute(block, desc, has, k=2, rescale=True)
    assert np.linalg.norm(scaled[4]) == pytest.approx(5.0)  # the mean of the two neighbours' norms, 6 and 4
    assert scaled[4, 0] / scaled[4, 1] == pytest.approx(1.5)
    tied = impute(block, np.zeros((5, 1)), has, k=1, rescale=False)
    assert tied[2].tolist() == tied[4].tolist() == [3, 0]  # ties go to the earlier album


def test_albums_without_audio_take_their_mood_neighbours_block(deduped, audio):
    sub, _ = deduped
    assert sub.loc[LOVELESS, "Title"] == "Loveless" and not audio.has_audio[LOVELESS]
    desc = descriptors(sub)
    d = ((desc - desc[LOVELESS]) ** 2).sum(axis=1)
    d[~audio.has_audio] = np.inf
    near = np.argsort(d, kind="stable")[:IMPUTE_K]
    mean = audio.block[near].astype(np.float64).mean(axis=0)
    expected = mean * np.linalg.norm(audio.block[near].astype(np.float64), axis=1).mean() / np.linalg.norm(mean)
    assert np.allclose(audio.block[LOVELESS], expected, atol=1e-6)
    norms = np.linalg.norm(audio.block, axis=1)
    assert 0.5 < np.median(norms[~audio.has_audio]) / np.median(norms[audio.has_audio]) < 1.5


def test_a_frame_without_spotify_audio_columns_builds(deduped, audio):
    """New albums have no Spotify features: nothing on the site side may read those columns."""
    sub, _ = deduped
    bare = sub.copy()
    bare[AUDIO] = np.nan
    block = audio_block(bare).block
    assert np.array_equal(block, audio.block)
    for stop in STOPS:
        X = site_matrix(bare, block, SLIDER[stop])
        assert X.shape == (4081, 184) and X.dtype == np.float32 and np.isfinite(X).all()
        assert np.array_equal(X, site_matrix(sub, audio.block, SLIDER[stop]))
    assert build_vocab(bare) == build_vocab(sub)


def test_new_albums_go_through_the_frozen_transform(deduped, audio, tmp_path):
    """A second shard for albums the transform was not fitted on: they get a real block, the others keep theirs."""
    sub, _ = deduped
    store = load_store(DEFAULT_AUDIO)
    d = tmp_path / "audio"
    init_store(d, store.manifest["model"], store.manifest["clips"])
    append_shard(d, store.keys, store.emb, store.n_clips, store.source, note="copy")
    missing = np.flatnonzero(~audio.has_audio)[:2]
    append_shard(d, sub["URI"][missing].tolist(), store.emb[:2], [8, 8], ["local", "itunes:jp"], note="new")
    save_transform(d / "transform.npz", audio.transform)
    grown = audio_block(sub, d)
    assert int(grown.has_audio.sum()) == 3946 and grown.shards == 2
    assert np.array_equal(grown.block[missing], audio.transform.apply(store.emb[:2]))
    assert np.array_equal(grown.block[audio.has_audio], audio.block[audio.has_audio])


def test_missing_or_mismatched_store_fails_clearly(deduped, audio, tmp_path, capsys):
    sub, _ = deduped
    with pytest.raises(StoreError, match="manifest.json"):
        audio_block(sub, tmp_path)
    assert main(["status", "--audio-dir", str(tmp_path)]) == 1
    assert "manifest.json" in capsys.readouterr().err
    init_store(tmp_path, "another-model", {"per_album": 4})
    append_shard(tmp_path, sub["URI"][:3].tolist(), _emb(3), [4, 4, 4], ["deezer"] * 3, note="test")
    with pytest.raises(StoreError, match="transform.npz"):
        audio_block(sub, tmp_path)
    save_transform(tmp_path / "transform.npz", audio.transform)
    with pytest.raises(StoreError, match="another-model"):
        audio_block(sub, tmp_path)
    (tmp_path / "transform.npz").write_bytes(b"junk")
    with pytest.raises(StoreError, match="not a readable transform"):
        audio_block(sub, tmp_path)


def test_status_lists_the_imputed_albums(capsys):
    assert main(["status"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[0].startswith("audio: 3944 albums with audio, 137 imputed")
    assert len(out) == 138 and any(line.endswith("\tLoveless\tMy Bloody Valentine") for line in out)
