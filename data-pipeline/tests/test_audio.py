import shutil

import numpy as np
import pytest

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.audio import (BLOCK_DIMS, IMPUTE_K, album_keys, audio_block, descriptors, fit_transform, impute,
                                load_transform, main, refit, save_transform, site_matrix, unit)
from rmr_pipeline.audio_store import DEFAULT_AUDIO, DIM, StoreError, append_shard, init_store, load_store
from rmr_pipeline.constants import AUDIO, REPO, SLIDER, STOPS
from rmr_pipeline.table import descriptor_cols
from rmr_pipeline.vocab import build_vocab

EXPERIMENT_TRANSFORM = REPO / "experiments" / "preview_features" / "results" / "solution_transform.npz"


def _store_dir(path, model, clips):
    """An empty store at `path` that knows the albums' keys (a copy of the committed keys.csv)."""
    init_store(path, model, clips)
    shutil.copy(DEFAULT_AUDIO / "keys.csv", path / "keys.csv")
    return path


def _first_fit_rows(deduped) -> np.ndarray:
    """Where the albums of the first fit (the experiment's) are in the deduped frame. The experiment's
    transform records them as rows of the feature table."""
    return np.flatnonzero(np.isin(deduped[1], np.load(EXPERIMENT_TRANSFORM)["rows"]))


def _fitted_rows(deduped, transform) -> np.ndarray:
    """Where the albums the transform was fitted on are in the deduped frame: not "the albums with
    audio", which grow with every sync. A fit records their keys; the first transform was written
    before fits did, and was fitted on the experiment's albums."""
    if transform.keys is None:
        at = _first_fit_rows(deduped)
    else:
        index = {k: i for i, k in enumerate(album_keys(deduped[0]))}
        at = np.array([index[k] for k in transform.keys.tolist()])
    assert len(at) == transform.albums
    return at


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
    assert t.keys is None and loaded.keys is None  # the first transform was written without the fitted keys


def test_fit_records_the_albums_it_was_fitted_on(tmp_path):
    emb, keys = _emb(50), [f"Album{i}" for i in range(50)]
    t = fit_transform(emb, 0.39, "m", k=6, keys=keys)
    save_transform(tmp_path / "transform.npz", t)
    loaded = load_transform(tmp_path / "transform.npz")
    assert loaded.keys.tolist() == keys and loaded.albums == 50
    assert np.array_equal(loaded.apply(emb), fit_transform(emb, 0.39, "m", k=6).apply(emb))
    with pytest.raises(ValueError, match="50 embeddings but keys"):
        fit_transform(emb, 0.39, "m", k=6, keys=keys[:49])
    arrays = dict(np.load(tmp_path / "transform.npz"))
    np.savez(tmp_path / "transform.npz", **{**arrays, "keys": arrays["keys"][:49]})
    with pytest.raises(StoreError, match="one string per fitted album"):
        load_transform(tmp_path / "transform.npz")


def test_block_shape_and_determinism(deduped, audio):
    sub, _ = deduped
    assert audio.block.shape == (len(sub), BLOCK_DIMS) and audio.block.dtype == np.float32
    assert np.isfinite(audio.block).all()
    assert np.array_equal(audio.has_audio, load_store(DEFAULT_AUDIO).rows(album_keys(sub)) >= 0)
    n = int(audio.has_audio.sum())
    assert 0 < audio.transform.albums <= n <= len(sub)  # the store only grows: the fitted albums, plus those added since
    assert np.array_equal(audio_block(sub).block, audio.block)
    assert audio.summary() == (f"audio: {n} albums with audio, {len(sub) - n} imputed, {audio.shards} store shard(s), "
                               f"transform fitted {audio.transform.fitted} on {audio.transform.albums} albums")


def test_block_has_the_target_variance_on_the_fitted_albums(deduped, audio):
    """The scale was chosen on the albums the transform was fitted on, so that is where the block's
    total variance is the target; albums added since go through the same transform and are not
    counted. Exact on the embeddings fitted on (see the refit test); a fitted album whose match
    was corrected since moves it by about 0.001%."""
    at = _fitted_rows(deduped, audio.transform)
    assert audio.has_audio[at].all()
    fitted = audio.block[at].astype(np.float64)
    assert fitted.var(axis=0).sum() == pytest.approx(audio.transform.target_total_variance, rel=1e-2)
    assert np.abs(fitted.mean(axis=0)).max() < 0.01 * fitted.std(axis=0).max()
    C = audio.transform.components.astype(np.float64)
    assert np.allclose(C @ C.T, np.eye(BLOCK_DIMS), atol=1e-5)


def test_target_variance_is_the_spotify_blocks(deduped, audio):
    """On the albums of the first fit: a refit keeps the target, and newer albums have no Spotify columns."""
    sub, _ = deduped
    spotify = sub[AUDIO].to_numpy(dtype=np.float64)[_first_fit_rows(deduped)]
    assert np.isfinite(spotify).all()
    assert audio.transform.target_total_variance == pytest.approx(spotify.var(axis=0).sum(), rel=1e-9)


def test_transform_stays_close_to_the_experiments_d64(audio):
    """The committed transform was refitted on eight-clip means (the experiment's D64 was fitted on four clips
    per album). It is still that projection: nearly the same 64-dimensional subspace, the same leading
    directions, the same variance target and almost the same scale."""
    z = np.load(EXPERIMENT_TRANSFORM)
    ours, theirs = audio.transform.components.astype(np.float64), z["components"].astype(np.float64)
    cos = ours @ theirs.T
    assert (cos ** 2).sum() / BLOCK_DIMS > 0.9  # share of our subspace inside the experiment's
    assert np.abs(np.diag(cos))[:8].min() > 0.95
    assert audio.transform.scale == pytest.approx(float(z["scale"]), rel=0.02)
    assert np.linalg.norm(audio.transform.mean - z["mean"]) < 0.05


def test_a_fit_on_the_fitted_albums_reproduces_the_committed_transform(deduped, audio, tmp_path):
    """transform.npz is what `fit` gives on the albums it names, whatever was added to the store since."""
    sub, _ = deduped
    t = audio.transform
    at = _fitted_rows(deduped, t)
    keys = np.asarray(album_keys(sub))[at]
    store = load_store(DEFAULT_AUDIO)
    rows = store.rows(keys)
    assert (rows >= 0).all()
    drift = float(np.abs(unit(store.emb[rows]).mean(axis=0) - t.mean).max())
    assert drift < 1e-3  # 3e-9 on the embeddings fitted on, 5e-5 with one album re-embedded, 1.4e-4 with twenty
    if drift > 1e-6:
        pytest.skip("a fitted album was embedded again since the fit (a corrected match or a clip top-up): the "
                    "exact comparison needs the embeddings fitted on, and one changed album turns the last components")
    d = _store_dir(tmp_path / "audio", store.manifest["model"], store.manifest["clips"])
    append_shard(d, keys, store.emb[rows], store.n_clips[rows], store.source[rows], note="the fitted albums")
    save_transform(d / "transform.npz", t)
    again = refit(sub, d)
    assert np.allclose(again.components, t.components, atol=1e-5)
    assert np.allclose(again.mean, t.mean, atol=1e-7)
    assert again.scale == pytest.approx(t.scale, rel=1e-6)
    assert (again.albums, again.model, again.target_total_variance) == (t.albums, t.model, t.target_total_variance)
    assert again.keys.tolist() == keys.tolist()  # catalog order
    block = audio.block[at].astype(np.float64)
    assert block.var(axis=0).sum() == pytest.approx(t.target_total_variance, rel=1e-4)


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
    desc = descriptors(sub)

    def expected(i, has):
        d = ((desc - desc[i]) ** 2).sum(axis=1)
        d[~has] = np.inf
        near = np.argsort(d, kind="stable")[:IMPUTE_K]
        mean = audio.block[near].astype(np.float64).mean(axis=0)
        return mean * np.linalg.norm(audio.block[near].astype(np.float64), axis=1).mean() / np.linalg.norm(mean)

    for i in np.flatnonzero(~audio.has_audio):  # the store's own gaps; none once every album has audio
        assert np.allclose(audio.block[i], expected(i, audio.has_audio), atol=1e-6), i
    # The same on albums whose audio is hidden, so the check does not need the store to have gaps.
    hidden = np.flatnonzero(audio.has_audio)[[0, 11, -1]]
    has = audio.has_audio.copy()
    has[hidden] = False
    block = impute(audio.block, desc, has)
    for i in hidden:
        assert np.allclose(block[i], expected(i, has), atol=1e-6), i
        assert not np.allclose(block[i], audio.block[i], atol=1e-3), i
    assert np.array_equal(block[has], audio.block[has])
    norms = np.linalg.norm(block, axis=1)
    assert 0.5 < np.median(norms[~has]) / np.median(norms[has]) < 1.5


def test_empty_descriptors_are_refused_by_name(deduped, audio):
    """A new row with an empty descriptor would get the block of the first three albums of the
    catalog (NaN distances sort as they come) and put NaN in the matrix."""
    sub, _ = deduped
    cols = descriptor_cols(sub)
    bad = sub.copy()
    bad.loc[[5, 40], cols[3]] = np.nan
    bad.loc[7, cols[0]] = np.inf
    named = f"3 album\\(s\\): {sub.loc[5, 'Title']!r} \\({sub.loc[5, 'URI']}\\), {sub.loc[7, 'Title']!r} "
    with pytest.raises(ValueError, match=named):
        descriptors(bad)
    with pytest.raises(ValueError, match="empty or non-finite descriptor values"):
        audio_block(bad)
    with pytest.raises(ValueError, match="empty or non-finite descriptor values"):
        site_matrix(bad, audio.block, SLIDER["mood"])
    block = audio.block.copy()
    block[11, 2] = np.nan
    with pytest.raises(ValueError, match="audio block has non-finite values for 1 album.*'In Rainbows'"):
        site_matrix(sub, block, SLIDER["mood"])
    with pytest.raises(ValueError, match="shape"):
        site_matrix(sub, audio.block[:10], SLIDER["mood"])


def test_a_frame_without_spotify_audio_columns_builds(deduped, audio):
    """New albums have no Spotify features: nothing on the site side may read those columns."""
    sub, _ = deduped
    bare = sub.copy()
    bare[AUDIO] = np.nan
    block = audio_block(bare).block
    assert np.array_equal(block, audio.block)
    for stop in STOPS:
        X = site_matrix(bare, block, SLIDER[stop])
        assert X.shape == (len(sub), 184) and X.dtype == np.float32 and np.isfinite(X).all()
        assert np.array_equal(X, site_matrix(sub, audio.block, SLIDER[stop]))
    assert build_vocab(bare) == build_vocab(sub)


def test_new_albums_go_through_the_frozen_transform(deduped, audio, tmp_path):
    """A second shard brings two albums the store did not have: they get a real block through the
    transform as it is, and the other albums with audio keep theirs. Two albums of the committed
    store play the new ones, so the test does not need the store to have gaps."""
    sub, _ = deduped
    store = load_store(DEFAULT_AUDIO)
    new = np.flatnonzero(audio.has_audio)[[3, -1]]
    new_keys = np.asarray(album_keys(sub))[new]
    theirs = store.rows(new_keys)
    rest = np.setdiff1d(np.arange(len(store.keys)), theirs)
    d = _store_dir(tmp_path / "audio", store.manifest["model"], store.manifest["clips"])
    append_shard(d, store.keys[rest], store.emb[rest], store.n_clips[rest], store.source[rest], note="before")
    save_transform(d / "transform.npz", audio.transform)
    before = audio_block(sub, d)
    assert before.shards == 1 and not before.has_audio[new].any()
    assert int(before.has_audio.sum()) == int(audio.has_audio.sum()) - 2
    assert np.array_equal(before.block[before.has_audio], audio.block[before.has_audio])
    append_shard(d, new_keys, store.emb[theirs], [8, 8], ["local", "itunes:jp"], note="new")
    grown = audio_block(sub, d)
    assert grown.shards == 2 and np.array_equal(grown.has_audio, audio.has_audio)
    assert np.array_equal(grown.block[new], audio.transform.apply(store.emb[theirs]))
    assert not np.allclose(grown.block[new], before.block[new], atol=1e-3)  # their own audio, no longer their neighbours'
    assert np.array_equal(grown.block, audio.block)


def test_missing_or_mismatched_store_fails_clearly(deduped, audio, tmp_path, capsys):
    sub, _ = deduped
    with pytest.raises(StoreError, match="manifest.json"):
        audio_block(sub, tmp_path)
    assert main(["status", "--audio-dir", str(tmp_path)]) == 1
    assert "manifest.json" in capsys.readouterr().err
    init_store(tmp_path, "another-model", {"per_album": 4})
    append_shard(tmp_path, album_keys(sub)[:3], _emb(3), [4, 4, 4], ["deezer"] * 3, note="test")
    with pytest.raises(StoreError, match="transform.npz"):
        audio_block(sub, tmp_path)
    save_transform(tmp_path / "transform.npz", audio.transform)
    with pytest.raises(StoreError, match="another-model"):
        audio_block(sub, tmp_path)
    (tmp_path / "transform.npz").write_bytes(b"junk")
    with pytest.raises(StoreError, match="not a readable transform"):
        audio_block(sub, tmp_path)


def test_a_store_without_its_keys_fails_clearly(deduped, audio, tmp_path):
    """The store is keyed by RYM id and the feature table by URI: without keys.csv no album is found, and an
    album keys.csv does not have is named."""
    sub, _ = deduped
    store = load_store(DEFAULT_AUDIO)
    init_store(tmp_path, store.manifest["model"], store.manifest["clips"])
    append_shard(tmp_path, store.keys[:3], store.emb[:3], store.n_clips[:3], store.source[:3], note="test")
    save_transform(tmp_path / "transform.npz", audio.transform)
    with pytest.raises(StoreError, match="keys.csv"):
        audio_block(sub, tmp_path)
    shutil.copy(DEFAULT_AUDIO / "keys.csv", tmp_path / "keys.csv")
    assert int(audio_block(sub, tmp_path).has_audio.sum()) == 3
    new = sub.copy()
    new.loc[5, "URI"] = "spotify:album:0000000000000000000000"
    with pytest.raises(StoreError, match="no key for 1 album.*spotify:album:0000000000000000000000"):
        audio_block(new, tmp_path)


def test_status_lists_the_imputed_albums(deduped, audio, capsys):
    sub, _ = deduped
    assert main(["status", "--audio-dir", str(DEFAULT_AUDIO)]) == 0  # the `audio` fixture's store
    out = capsys.readouterr().out.splitlines()
    assert out[0] == audio.summary()
    keys = album_keys(sub)
    assert out[1:] == [f"imputed\t{keys[i]}\t{sub.loc[i, 'Title']}\t{clean_artist(str(sub.loc[i, 'Artist']))}"
                       for i in np.flatnonzero(~audio.has_audio)]


def test_status_reads_the_sites_store_and_fit_needs_a_store_named(capsys, monkeypatch):
    """`status` follows audio_store.SITE_MODEL. `fit` writes a transform from the feature table's albums alone,
    so it has no default: on the site's store it would replace the transform fitted on the whole catalog."""
    import rmr_pipeline.audio as audio_module
    from rmr_pipeline.audio_store import STORES, site_store

    assert main(["status"]) == 0
    first = capsys.readouterr().out.splitlines()[0]
    assert site_store() == STORES["effnet10k"]
    assert first.endswith(f"on {load_transform(site_store() / 'transform.npz').albums} albums")
    written = []
    monkeypatch.setattr(audio_module, "save_transform", lambda path, t: written.append(path))
    with pytest.raises(SystemExit):
        main(["fit"])
    assert "fit needs an explicit --audio-dir" in capsys.readouterr().err and written == []
    before = (STORES["effnet10k"] / "transform.npz").read_bytes()
    assert main(["fit", "--audio-dir", str(DEFAULT_AUDIO)]) == 0  # named: it fits (the write is caught above)
    assert written == [DEFAULT_AUDIO / "transform.npz"] and (STORES["effnet10k"] / "transform.npz").read_bytes() == before
