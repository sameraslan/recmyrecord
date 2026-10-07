"""The one-pass cache: the short_preview flag, importing the earlier caches read-only, and the album means,
checked against the code that pools each model today (ClipCache.mean, clap_catalog.load). No model, no network."""
import hashlib
import sqlite3

import numpy as np
import pytest

from rmr_pipeline.keys import check_rows
from rmr_audio.clips import ClipCache
from rmr_audio.onepass_cache import MODELS, OnePassCache, read_only, short_preview
from rmr_audio.onepass_worker import clap_catalog, stub_embedding

URI = "spotify:album:"
KEYS = check_rows([{"rym_id": "Album1", "legacy_uri": URI + "a" * 22, "matched_by": "spotify_id", "doubt": ""},
                   {"rym_id": "Album2", "legacy_uri": URI + "b" * 22, "matched_by": "spotify_id", "doubt": ""},
                   {"rym_id": "sp:" + "c" * 22, "legacy_uri": URI + "c" * 22, "matched_by": "none", "doubt": ""}])
A1, A2, A3 = URI + "a" * 22, URI + "b" * 22, URI + "c" * 22


def vec(model: str, name: str) -> bytes:
    m = MODELS[model]
    return stub_embedding(f"{model}:{name}".encode(), m.dim, m.dtype).tobytes()


def digest(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def old_effnet(path, rows) -> None:
    """A clips.sqlite as rmr_audio.clips writes it. rows: (key, source, album_id, track, idx, prio, status)."""
    cache = ClipCache(path)
    cache.put([{"key": k, "source": s, "album_id": a, "track_id": t, "track_idx": i, "prio": p, "status": st,
                "error": None if st == "ok" else "why", "clip_s": 30.0 if st == "ok" else None,
                "emb": vec("effnet", t) if st == "ok" else None} for k, s, a, t, i, p, st in rows])
    cache.close()


def old_clap(path, rows) -> None:
    """A clap_clips.sqlite as clap_catalog.py writes it."""
    con = clap_catalog().open_out(path)
    con.executemany("INSERT INTO clap_clips VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                    [(k, s, a, t, i, p, st, None if st == "ok" else "why", 29.9 if st == "ok" else None,
                      vec("clap", t) if st == "ok" else None) for k, s, a, t, i, p, st in rows])
    con.commit()
    con.close()


def listing_rows(key, source, album_id, n, status=None):
    """n clips of one listing, track i at rank i, all ok unless `status` names a track's."""
    return [(key, source, album_id, f"{album_id}-{i}", i * 2, i, (status or {}).get(i, "ok")) for i in range(n)]


@pytest.mark.parametrize("clip_s, track_s, flag", [(10.0, 200.0, 1), (24.9, 61.0, 1), (25.0, 200.0, 0), (30.0, 200.0, 0),
                                                    (10.0, 60.0, 0), (10.0, 12.0, 0), (None, 200.0, None), (10.0, None, None),
                                                    (10.0, 0.0, None)])
def test_short_preview_is_a_short_clip_of_a_long_track(clip_s, track_s, flag):
    assert short_preview(clip_s, track_s) == flag


def test_the_flag_is_recorded_with_the_clip_and_filled_in_when_a_listing_brings_the_track_length():
    cache = OnePassCache(":memory:")
    base = {"key": "Album1", "source": "deezer", "album_id": "d1"}
    cache.put_clip({**base, "track_id": "t0", "track_idx": 0, "prio": 0, "clip_s": 10.0, "track_s": 240.0})
    cache.put_clip({**base, "track_id": "t1", "track_idx": 1, "prio": 1, "clip_s": 30.0, "track_s": 240.0})
    cache.put_clip({**base, "track_id": "t2", "track_idx": 2, "prio": 2, "clip_s": 9.0})  # imported: no track length yet
    rows = dict(cache.con.execute("SELECT track_id, short_preview FROM clips"))
    assert rows == {"t0": 1, "t1": 0, "t2": None}
    cache.set_listing("Album1", "deezer", "d1", 10, 10, 2400.0, track_s={"t2": 300.0, "t9": 100.0})
    assert dict(cache.con.execute("SELECT track_id, short_preview FROM clips"))["t2"] == 1
    assert cache.short_previews() == [("Album1", "deezer", "d1", 2)]
    assert cache.listings()[("Album1", "deezer", "d1")]["n_previews"] == 10


def test_imports_translate_legacy_keys_and_never_touch_the_source(tmp_path):
    eff, clap = tmp_path / "clips.sqlite", tmp_path / "clap_clips.sqlite"
    old_effnet(eff, listing_rows(A1, "deezer", "d1", 8, {5: "too_short"}) + listing_rows(A2, "itunes:us", "i2", 3, {2: "download_failed"})
               + listing_rows(URI + "z" * 22, "deezer", "dz", 2) + listing_rows("Album9", "deezer", "d9", 1))
    old_clap(clap, listing_rows(A1, "deezer", "d1", 4) + listing_rows(A3, "deezer", "d3", 2, {1: "embed_failed"}))
    before = digest(eff), digest(clap), eff.stat().st_mtime_ns, clap.stat().st_mtime_ns
    cache = OnePassCache(tmp_path / "onepass.sqlite")
    n_eff, n_clap = cache.import_effnet(eff, KEYS), cache.import_clap(clap, KEYS)
    assert (digest(eff), digest(clap), eff.stat().st_mtime_ns, clap.stat().st_mtime_ns) == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["clap_clips.sqlite", "clips.sqlite", "onepass.sqlite"]  # no journal left
    assert n_eff["imported"] == 12 and n_eff["unknown_key"] == 2 and n_eff["imported_ok"] == 10
    assert n_clap["imported"] == 6 and n_clap["imported_embed_failed"] == 1
    album = cache.album("Album1", "deezer", "d1")
    assert album["d1-0"]["status"] == {"effnet": "ok", "clap": "ok"} and album["d1-0"]["prio"] == 0
    assert album["d1-6"]["status"] == {"effnet": "ok"} and album["d1-5"]["status"] == {"effnet": "too_short"}
    assert cache.album("sp:" + "c" * 22, "deezer", "d3")["d3-1"]["status"] == {"clap": "embed_failed"}
    assert cache.album("Album9", "deezer", "d9")["d9-0"]["status"] == {"effnet": "ok"}  # a current key passes as it is
    emb, origin = cache.con.execute("SELECT emb, origin FROM embeddings WHERE key = 'Album1' AND track_id = 'd1-3' AND model = 'effnet'").fetchone()
    assert emb == vec("effnet", "d1-3") and origin == "import:clips.sqlite"
    # a second import brings nothing, and an ok embedding already here is never replaced
    assert cache.import_effnet(eff, KEYS)["imported"] == 0 and cache.import_clap(clap, KEYS)["imported"] == 0
    cache.put_result({"key": "Album2", "source": "itunes:us", "album_id": "i2", "track_id": "i2-0"}, "effnet", "ok",
                     emb=vec("effnet", "mine"))
    cache.put_result({"key": "Album2", "source": "itunes:us", "album_id": "i2", "track_id": "i2-2"}, "effnet", "decode_failed")
    cache.import_effnet(eff, KEYS)
    assert cache.con.execute("SELECT emb FROM embeddings WHERE key = 'Album2' AND track_id = 'i2-0'").fetchone()[0] == vec("effnet", "mine")
    assert cache.album("Album2", "itunes:us", "i2")["i2-2"]["status"]["effnet"] == "decode_failed"  # not ok there either: kept
    cache.close()


def test_a_source_cache_cannot_be_written_through_the_connection_the_importer_uses(tmp_path):
    eff = tmp_path / "clips.sqlite"
    old_effnet(eff, listing_rows(A1, "deezer", "d1", 1))
    con = read_only(eff)
    with pytest.raises(sqlite3.OperationalError):
        con.execute("DELETE FROM clips")
    con.close()
    with pytest.raises(FileNotFoundError):
        read_only(tmp_path / "missing.sqlite")
    assert not (tmp_path / "missing.sqlite").exists()
    cache = OnePassCache(tmp_path / "onepass.sqlite")
    cache.close()
    ro = OnePassCache(tmp_path / "onepass.sqlite", readonly=True)
    with pytest.raises(sqlite3.OperationalError):
        ro.put_clip({"key": "k", "source": "deezer", "album_id": "a", "track_id": "t"})
    ro.close()


def test_an_ok_row_with_the_wrong_number_of_bytes_is_not_imported(tmp_path):
    eff = tmp_path / "clips.sqlite"
    old_effnet(eff, listing_rows(A1, "deezer", "d1", 2))
    con = sqlite3.connect(eff)
    con.execute("UPDATE clips SET emb = x'0000' WHERE track_id = 'd1-1'")
    con.commit()
    con.close()
    cache = OnePassCache(":memory:")
    assert dict(cache.import_effnet(eff, KEYS)) == {"imported": 1, "imported_ok": 1, "bad_embedding": 1}
    with pytest.raises(ValueError):
        cache.put_result({"key": "k", "source": "deezer", "album_id": "a", "track_id": "t"}, "clap", "ok", emb=b"\0" * 8)


# --- means ------------------------------------------------------------------------------------------

@pytest.fixture
def both(tmp_path):
    """Album1: eight clips in both old caches, rank 2 failed for both. Album2: three clips, EffNet only."""
    eff, clap = tmp_path / "clips.sqlite", tmp_path / "clap_clips.sqlite"
    old_effnet(eff, listing_rows(A1, "deezer", "d1", 8, {2: "too_short"}) + listing_rows(A2, "itunes:us", "i2", 3))
    old_clap(clap, listing_rows(A1, "deezer", "d1", 8, {2: "too_short"}))
    cache = OnePassCache(tmp_path / "onepass.sqlite")
    cache.import_effnet(eff, KEYS), cache.import_clap(clap, KEYS)
    return cache, eff, clap


def test_effnet_means_are_exactly_the_stores_under_both_pooling_rules(both):
    cache, eff, _ = both
    old = ClipCache(eff, readonly=True)
    for clips in (4, 8, None):
        for pool, below in (("rank", False), ("below", True)):
            want, n_want = old.mean(A1, "deezer", "d1", clips, below_rank=below)
            got, n = cache.mean("effnet", "Album1", "deezer", "d1", clips, pool)
            assert n == n_want and np.array_equal(got, want)
    # the two rules differ exactly where a clip failed: rank takes the next one, below is one short
    assert cache.mean("effnet", "Album1", "deezer", "d1", 4, "rank")[1] == 4
    assert cache.mean("effnet", "Album1", "deezer", "d1", 4, "below")[1] == 3
    assert cache.mean("effnet", "Album1", "deezer", "nope", 4) == (None, 0)
    with pytest.raises(ValueError):
        cache.mean("effnet", "Album1", "deezer", "d1", 4, "median")


def test_clap_means_are_exactly_clap_catalogs_loader_under_its_rule(both):
    cache, _, clap = both
    for clips in (4, 8):
        keys, X = clap_catalog().load(clips, clap)
        got_keys, got, n, sources = cache.means("clap", clips, pool="below")
        assert list(got_keys) == ["Album1"] and list(keys) == [A1] and list(sources) == ["deezer"]
        assert np.array_equal(got.astype(np.float32), X) and n[0] == (3 if clips == 4 else 7)
    assert cache.means("clap", 4)[2][0] == 4  # the default rule: a failed clip does not use up a place


def test_means_take_one_listing_per_album_and_local_windows_replace_previews(both):
    cache, _, _ = both
    keys, X, n, sources = cache.means("effnet", 4)
    assert list(keys) == ["Album1", "Album2"] and list(n) == [4, 3] and list(sources) == ["deezer", "itunes:us"] and X.shape == (2, 1280)
    # a second listing of Album1 with fewer clips: the most ok clips win, unless matches.csv names the other
    for i in range(2):
        rec = {"key": "Album1", "source": "itunes:us", "album_id": "i1", "track_id": f"i1-{i}", "track_idx": i, "prio": i}
        cache.put_clip(rec), cache.put_result(rec, "effnet", "ok", emb=vec("effnet", f"i1-{i}"))
    assert list(cache.means("effnet", 4)[3]) == ["deezer", "itunes:us"]
    named = cache.means("effnet", 4, listing_of={"Album1": ("itunes:us", "i1")})
    assert list(named[3]) == ["itunes:us", "itunes:us"] and list(named[2]) == [2, 3]
    assert np.array_equal(named[1][0], cache.mean("effnet", "Album1", "itunes:us", "i1", 4)[0])
    # windows of local files: the album's mean is theirs alone, at the album's own window count
    for i in range(8):
        rec = {"key": "Album1", "source": "local", "album_id": "", "track_id": f"a.flac@{i}", "track_idx": i, "prio": i, "sig": "s"}
        cache.put_clip(rec), cache.put_result(rec, "effnet", "ok", emb=vec("effnet", f"w{i}"))
    cache.set_listing("Album1", "local", "", 1, 8, 1500.0, n_windows=5)
    keys, X, n, sources = cache.means("effnet", 4, listing_of={"Album1": ("itunes:us", "i1")})
    assert list(sources) == ["local", "itunes:us"] and list(n) == [5, 3]
    want = np.stack([np.frombuffer(vec("effnet", f"w{i}"), "<f2").astype(np.float64) for i in range(5)]).mean(axis=0)
    assert np.allclose(X[0], want)
    assert list(cache.means("clap", 4)[0]) == []  # no CLAP from the files yet: nothing, not the previews' CLAP


def test_common_pools_both_models_over_the_same_clips(both):
    cache, _, _ = both
    rec = {"key": "Album1", "source": "deezer", "album_id": "d1", "track_id": "d1-1"}
    cache.put_result(rec, "clap", "decode_failed")
    assert cache.mean("effnet", "Album1", "deezer", "d1", 4)[1] == 4
    vec_common, n = cache.mean("effnet", "Album1", "deezer", "d1", 4, common=("effnet", "clap"))
    clap_common, n_clap = cache.mean("clap", "Album1", "deezer", "d1", 4, common=("effnet", "clap"))
    assert n == n_clap == 4
    want = np.stack([np.frombuffer(vec("effnet", f"d1-{i}"), "<f2").astype(np.float64) for i in (0, 3, 4, 5)]).mean(axis=0)
    assert np.array_equal(vec_common, want)
