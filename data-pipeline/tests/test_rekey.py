"""The rekey from Spotify URIs to RYM ids changed keys and nothing else: every existing album's store row and
audio block are what tests/fixtures/audio_reference.npz recorded before it (scripts/record_audio_reference.py),
and scripts/rekey_audio_store.py can be run again."""
import hashlib
import importlib.util
import json
import shutil

import numpy as np
import pytest

from rmr_pipeline.audio import fit_transform, save_transform
from rmr_pipeline.audio_store import (DEFAULT_AUDIO, DIM, StoreError, append_shard, init_store, load_match_overrides,
                                      load_matches, load_store, write_matches)
from rmr_pipeline.constants import PIPELINE_DIR
from rmr_pipeline.keys import is_legacy, load_keys, placeholder, write_keys

REFERENCE = PIPELINE_DIR / "tests" / "fixtures" / "audio_reference.npz"


def _script(name: str):
    spec = importlib.util.spec_from_file_location(name, PIPELINE_DIR / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


rekey_script = _script("rekey_audio_store")


@pytest.fixture(scope="module")
def reference():
    with np.load(REFERENCE, allow_pickle=False) as z:
        return {name: z[name] for name in z.files}


def test_the_reference_is_keyed_by_the_legacy_uris(deduped, reference):
    sub, _ = deduped
    assert reference["uris"].tolist() == [str(u) for u in sub["URI"]]
    assert all(is_legacy(u) for u in reference["uris"].tolist())
    assert reference["block"].shape == (len(sub), 64) and reference["block"].dtype == np.float32


def test_store_rows_are_bitwise_what_they_were(reference):
    """Every album's embedding, clip count and source, found now by its new key."""
    store = load_store(DEFAULT_AUDIO)
    rows = store.rows(load_keys().keys_of(reference["uris"]))
    assert np.array_equal(rows >= 0, reference["has_audio"])
    assert len(store.keys) == int(reference["has_audio"].sum())  # and the store holds nothing else
    assert store.emb.dtype == np.float16
    for uri, row, sha, n, source in zip(reference["uris"].tolist(), rows, reference["emb_sha256"].tolist(),
                                        reference["n_clips"].tolist(), reference["source"].tolist()):
        if row >= 0:
            got = hashlib.sha256(np.ascontiguousarray(store.emb[row], dtype="<f2").tobytes()).hexdigest()
            assert (got, int(store.n_clips[row]), str(store.source[row])) == (sha, n, source), uri


def test_audio_blocks_are_exactly_what_they_were(reference, audio):
    """All 4,081 albums, the imputed ones included: not within a tolerance, the same float32 values. The
    rekey changes which name finds a row, not the row, and the arithmetic after it is the same."""
    assert np.array_equal(audio.has_audio, reference["has_audio"])
    assert audio.block.dtype == reference["block"].dtype
    assert np.array_equal(audio.block, reference["block"])


def test_matches_keep_their_listing_under_the_new_key(reference):
    """Each album's row of matches.csv names the source the reference recorded for its embedding. The file
    also holds the rows of the catalog's new albums, which the reference does not know."""
    keys = load_keys().keys_of(reference["uris"])
    source = {m["key"]: m["source"] for m in load_matches(DEFAULT_AUDIO / "matches.csv")}
    assert set(keys) <= set(source)
    for key, has, src in zip(keys, reference["has_audio"].tolist(), reference["source"].tolist()):
        if has and src != "local":
            assert source[key] == src, key


def _hashes(audio_dir) -> dict[str, str]:
    return {str(p.relative_to(audio_dir)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(audio_dir.rglob("*")) if p.is_file()}


def test_rekeying_the_committed_store_again_changes_nothing(tmp_path):
    audio = tmp_path / "audio"
    shutil.copytree(DEFAULT_AUDIO, audio)
    before = _hashes(audio)
    assert rekey_script.rekey(audio) == {}
    assert rekey_script.main(["--audio-dir", str(audio)]) == 0
    assert _hashes(audio) == before


@pytest.fixture
def legacy_store(tmp_path):
    """Four albums of the committed store as they were before the rekey: every file keyed by Spotify URI."""
    committed, keys = load_store(DEFAULT_AUDIO), load_keys()
    picked = [r for r in keys.rows if r["rym_id"] in set(committed.keys.tolist())]
    rows = [r for r in picked if r["matched_by"] != "none"][:3] + [r for r in picked if r["matched_by"] == "none"][:1]
    at = committed.rows([r["rym_id"] for r in rows])
    uris = [r["legacy_uri"] for r in rows]
    audio = tmp_path / "audio"
    init_store(audio, committed.manifest["model"], committed.manifest["clips"])
    append_shard(audio, uris, committed.emb[at], committed.n_clips[at], committed.source[at], note="legacy keys")
    write_matches(audio / "matches.csv", [{"key": u, "source": "deezer", "source_album_id": str(i), "matched_title": "T",
                                           "matched_artist": "A", "score": "0.9900", "ambiguous": "0", "n_tracks": "9",
                                           "n_clips_available": "9"} for i, u in enumerate(uris)])
    (audio / "match_overrides.json").write_text(json.dumps({uris[1]: {"skip": True, "note": "ü"}}), encoding="utf-8")
    save_transform(audio / "transform.npz", fit_transform(committed.emb[at], 0.39, committed.manifest["model"], k=2,
                                                          fitted="2026-10-02", keys=uris))
    write_keys(audio / "keys.csv", rows)
    return audio, rows, committed.emb[at]


def test_rekey_rewrites_only_the_keys_and_is_idempotent(legacy_store):
    audio, rows, emb = legacy_store
    new = [r["rym_id"] for r in rows]
    old_transform = dict(np.load(audio / "transform.npz"))
    assert rekey_script.rekey(audio, dry_run=True) == dict.fromkeys(
        ("part-0001.npz", "matches.csv", "transform.npz"), 4) | {"match_overrides.json": 1}
    assert load_store(audio).keys.tolist() == [r["legacy_uri"] for r in rows]  # a dry run writes nothing
    assert rekey_script.rekey(audio)["part-0001.npz"] == 4
    store = load_store(audio)
    assert store.keys.tolist() == new and is_legacy(rows[0]["legacy_uri"]) and new[3] == placeholder(rows[3]["legacy_uri"])
    assert store.emb.dtype == np.float16 and store.emb.tobytes() == emb.tobytes()  # not one bit of an embedding
    assert [m["key"] for m in load_matches(audio / "matches.csv")] == new
    assert [m["source_album_id"] for m in load_matches(audio / "matches.csv")] == ["0", "1", "2", "3"]
    assert load_match_overrides(audio / "match_overrides.json") == {new[1]: {"skip": True, "note": "ü"}}
    transform = dict(np.load(audio / "transform.npz"))
    assert transform["keys"].tolist() == new and set(transform) == set(old_transform)
    for name in set(transform) - {"keys"}:
        assert transform[name].dtype == old_transform[name].dtype
        assert transform[name].tobytes() == old_transform[name].tobytes(), name
    before = _hashes(audio)
    assert rekey_script.rekey(audio) == {}
    assert _hashes(audio) == before
    assert not list(audio.rglob(".*.tmp"))


def test_a_placeholder_given_its_rym_id_and_a_corrected_id_are_followed(legacy_store, tmp_path):
    audio, rows, emb = legacy_store
    rekey_script.rekey(audio)
    shutil.copy(audio / "keys.csv", tmp_path / "previous.csv")
    # The off-chart album's page was read: its placeholder becomes a RYM id, by keys.csv alone.
    found = [dict(r) for r in rows]
    found[3].update(rym_id="Album999999001", matched_by="manual")
    write_keys(audio / "keys.csv", found)
    assert rekey_script.rekey(audio) == dict.fromkeys(("part-0001.npz", "matches.csv", "transform.npz"), 1)
    assert load_store(audio).keys.tolist()[3] == "Album999999001"
    # A wrong pair is corrected: the old id does not say which album it was, the previous keys.csv does.
    found[0].update(rym_id="Album999999002", matched_by="manual")
    write_keys(audio / "keys.csv", found)
    assert rekey_script.rekey(audio) == {}  # without it the old id is taken for an album that never had a URI
    assert rekey_script.rekey(audio, previous=tmp_path / "previous.csv")["part-0001.npz"] == 1
    store = load_store(audio)
    assert store.keys.tolist() == ["Album999999002", rows[1]["rym_id"], rows[2]["rym_id"], "Album999999001"]
    assert store.emb.tobytes() == emb.tobytes()
    assert rekey_script.rekey(audio, previous=tmp_path / "previous.csv") == {}


def test_rekey_refuses_what_it_cannot_do(legacy_store, capsys):
    audio, rows, _ = legacy_store
    before = _hashes(audio)
    write_keys(audio / "keys.csv", rows[:3])  # the store has an album keys.csv does not
    with pytest.raises(StoreError, match="no key for"):
        rekey_script.rekey(audio)
    assert rekey_script.main(["--audio-dir", str(audio)]) == 1 and "no key for" in capsys.readouterr().err
    (audio / "keys.csv").unlink()
    with pytest.raises(StoreError, match="keys.csv"):
        rekey_script.rekey(audio)
    write_keys(audio / "keys.csv", rows)
    assert {k: v for k, v in _hashes(audio).items() if k != "keys.csv"} == {
        k: v for k, v in before.items() if k != "keys.csv"}  # nothing was half-written


def test_two_entries_never_get_one_key(legacy_store):
    """An album under its URI and under its new key in one file: the rekey stops before writing anything."""
    audio, rows, emb = legacy_store
    append_shard(audio, [rows[0]["rym_id"]], emb[:1].astype(np.float16), [8], ["deezer"], note="already rekeyed")
    matches = load_matches(audio / "matches.csv")
    write_matches(audio / "matches.csv", matches + [{**matches[0], "key": rows[0]["rym_id"]}])
    before = _hashes(audio)
    with pytest.raises(StoreError, match="matches.csv: two entries would get the key"):
        rekey_script.rekey(audio)
    assert _hashes(audio) == before
    assert emb.shape[1] == DIM
