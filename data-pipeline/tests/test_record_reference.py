"""scripts/record_audio_reference.py --catalog: the catalog build's audio reference, and, once it is recorded
(tests/fixtures/catalog_audio_reference.npz), the check that the 10k store and its blocks are what it says."""
import hashlib
import importlib.util

import numpy as np
import pandas as pd
import pytest

from rmr_pipeline.audio import audio_block, catalog_keys, fit_transform, load_transform, save_transform
from rmr_pipeline.audio_store import STORES, append_shard, init_store, load_store
from rmr_pipeline.constants import PIPELINE_DIR

spec = importlib.util.spec_from_file_location("record_audio_reference", PIPELINE_DIR / "scripts" / "record_audio_reference.py")
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)

KEYS = ["Album1", "Album2", "sp:" + "0" * 22, "Album4", "Album5"]  # the catalog's order
STORED = ["Album4", "Album1", "Album5"]  # the store's order; Album2 and the placeholder have no audio
DIM = 16


@pytest.fixture
def world(tmp_path):
    """A catalog table of five albums and a store with three of them, with its transform."""
    catalog = tmp_path / "albums.csv"
    catalog.write_text("rym_id,title\n" + "".join(f"{k},T\n" for k in KEYS), encoding="utf-8")
    audio = tmp_path / "audio" / "effnet10k"
    emb = np.random.default_rng(0).normal(size=(len(STORED), DIM)).astype(np.float16)
    init_store(audio, "a-model", {"per_album": 4}, dim=DIM)
    append_shard(audio, STORED, emb, [4, 3, 8], ["deezer", "itunes:jp", "youtube"], note="test")
    save_transform(audio / "transform.npz", fit_transform(emb, 0.39, "a-model", k=2, fitted="2026-10-06", keys=STORED))
    return audio, catalog, emb


def _sha(row: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(row, dtype="<f2").tobytes()).hexdigest()


def test_the_catalog_reference_is_keyed_by_the_catalog_and_nothing_is_imputed(world):
    audio, catalog, emb = world
    ref = script.catalog_reference(audio, catalog)
    assert sorted(ref) == ["block", "emb_sha256", "has_audio", "keys", "n_clips", "source"]  # `keys`, not `uris`
    assert ref["keys"].tolist() == KEYS
    assert ref["has_audio"].tolist() == [True, False, False, True, True]
    assert ref["n_clips"].tolist() == [3, 0, 0, 4, 8] and ref["n_clips"].dtype == np.int16
    assert ref["source"].tolist() == ["itunes:jp", "", "", "deezer", "youtube"]
    assert ref["emb_sha256"].tolist() == [_sha(emb[1]), "", "", _sha(emb[0]), _sha(emb[2])]
    assert ref["block"].shape == (5, 2) and ref["block"].dtype == np.float32
    own = load_transform(audio / "transform.npz").apply(emb[[1, 0, 2]])
    assert np.array_equal(ref["block"][ref["has_audio"]], own)
    mean = own.astype(np.float64).mean(axis=0)  # the catalog build's fill: the mean block, not a neighbour's
    np.testing.assert_allclose(ref["block"][~ref["has_audio"]], np.tile(mean, (2, 1)), atol=1e-6)


def test_the_cli_writes_the_file_it_is_given_and_only_that(world, tmp_path, capsys):
    audio, catalog, _ = world
    out = tmp_path / "refs" / "reference"  # no .npz: the name is kept as given
    args = ["--catalog", "--audio-dir", str(audio), "--catalog-path", str(catalog)]
    assert script.main([*args, "--out", str(out)]) == 0
    assert f"5 catalog albums, 3 with audio, from {audio} -> {out}" in capsys.readouterr().out
    assert sorted(p.name for p in out.parent.iterdir()) == ["reference"]  # no temporary file, no reference.npz
    with np.load(out, allow_pickle=False) as z:
        read = {name: z[name] for name in z.files}
    want = script.catalog_reference(audio, catalog)
    assert sorted(read) == sorted(want) and all(np.array_equal(read[k], want[k]) for k in want)
    (audio / "transform.npz").unlink()  # a store that cannot be read: a message, no file
    assert script.main([*args, "--out", str(tmp_path / "other.npz")]) == 1
    assert "transform.npz" in capsys.readouterr().err and not (tmp_path / "other.npz").exists()


def test_the_old_reference_is_overwritten_only_with_force(world, tmp_path, capsys, monkeypatch):
    """REFERENCE is tests/fixtures/audio_reference.npz, which test_rekey.py reads. A file in the temp folder
    plays it here: the real one is never written by a test."""
    audio, catalog, _ = world
    old = tmp_path / "fixtures" / "audio_reference.npz"
    old.parent.mkdir()
    old.write_bytes(b"the reference of the rekey")
    monkeypatch.setattr(script, "REFERENCE", old)
    args = ["--catalog", "--audio-dir", str(audio), "--catalog-path", str(catalog)]
    for path in (str(old), str(old.parent / ".." / "fixtures" / "audio_reference.npz")):  # however it is spelled
        with pytest.raises(SystemExit):
            script.main([*args, "--out", path])
        assert "--force" in capsys.readouterr().err and old.read_bytes() == b"the reference of the rekey"
    assert script.main([*args, "--out", str(old), "--force"]) == 0
    with np.load(old, allow_pickle=False) as z:
        assert z["keys"].tolist() == KEYS


def test_the_catalog_flags_need_catalog_and_catalog_needs_out(capsys):
    """Every one of these stops in the argument parser, before anything is read or written."""
    with pytest.raises(SystemExit):
        script.main(["--catalog"])
    assert "--catalog needs --out" in capsys.readouterr().err
    for flags in (["--out", "x.npz"], ["--audio-dir", "x"], ["--force"], ["--catalog-path", "x.csv"]):
        with pytest.raises(SystemExit):
            script.main(flags)
        assert "need --catalog" in capsys.readouterr().err
    assert script.REFERENCE == PIPELINE_DIR / "tests" / "fixtures" / "audio_reference.npz"
    assert script.CATALOG_REFERENCE == script.REFERENCE.with_name("catalog_audio_reference.npz")


def test_the_committed_catalog_reference():
    """Once the catalog's reference is recorded: every catalog album's store row (bit for bit) and block
    (exactly) are what it says. Record it again only after a change meant to move them (a store written from
    other clips, a refit), with
    `scripts/record_audio_reference.py --catalog --out tests/fixtures/catalog_audio_reference.npz`."""
    if not script.CATALOG_REFERENCE.exists():
        pytest.skip("the catalog's audio reference is not recorded yet (docs/10k-switch.md)")
    with np.load(script.CATALOG_REFERENCE, allow_pickle=False) as z:
        ref = {name: z[name] for name in z.files}
    keys = catalog_keys()
    assert ref["keys"].tolist() == keys
    store = load_store(STORES["effnet10k"])
    rows = store.rows(keys)
    assert np.array_equal(rows >= 0, ref["has_audio"]) and len(store.keys) == int(ref["has_audio"].sum())
    for key, row, sha, n, source in zip(keys, rows, ref["emb_sha256"].tolist(), ref["n_clips"].tolist(),
                                        ref["source"].tolist()):
        if row >= 0:
            assert (_sha(store.emb[row]), int(store.n_clips[row]), str(store.source[row])) == (sha, n, source), key
    audio = audio_block(pd.DataFrame(index=range(len(keys))), STORES["effnet10k"], keys, fill="mean")
    assert audio.block.dtype == ref["block"].dtype and np.array_equal(audio.block, ref["block"])
