"""scripts/apply_cache_rekey.py on a small one-pass cache: drops before renames, one transaction, idempotent."""
import csv
import importlib.util

from rmr_pipeline.constants import PIPELINE_DIR
from rmr_audio.onepass_cache import MODELS, OnePassCache
from rmr_audio.onepass_worker import stub_embedding

spec = importlib.util.spec_from_file_location("apply_cache_rekey", PIPELINE_DIR / "scripts" / "apply_cache_rekey.py")
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)


def _cache(path, clips) -> None:
    cache = OnePassCache(path)
    for key, source, album_id, track in clips:
        rec = {"key": key, "source": source, "album_id": album_id, "track_id": track, "track_idx": 0, "prio": 0}
        cache.put_clip(rec)
        for m in MODELS.values():
            cache.put_result(rec, m.name, "ok", emb=stub_embedding(track.encode(), m.dim, m.dtype).tobytes(), clip_s=30.0)
        cache.set_listing(key, source, album_id, 1, 1)
    cache.close()


def _list(path, rows) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["action", "old_key", "new_key", "source", "album_id", "note"])
        w.writeheader()
        w.writerows(rows)


def _keys(path) -> list[tuple]:
    cache = OnePassCache(path, readonly=True)
    try:
        return sorted(cache.listings())
    finally:
        cache.close()


def test_drops_then_renames_and_a_second_run_changes_nothing(tmp_path, capsys):
    db, todo = tmp_path / "onepass.sqlite", tmp_path / "todo.csv"
    _cache(db, [("sp:a", "deezer", "1", "t1"), ("Album1", "deezer", "1", "t1"),  # the duplicate, on the same listing
                ("sp:b", "deezer", "2", "t2"), ("Album2", "itunes:us", "9", "t9"),  # the right listing, kept
                ("Album3", "deezer", "3", "t3")])
    _list(todo, [{"action": "rename", "old_key": "sp:a", "new_key": "Album1"},
                 {"action": "rename", "old_key": "sp:b", "new_key": "Album2"},
                 {"action": "keep_listing", "old_key": "Album2", "source": "itunes:us", "album_id": "9"},
                 {"action": "drop_listing", "old_key": "Album1", "source": "deezer", "album_id": "1"}])
    args = ["--list", str(todo), "--cache", str(db)]
    assert script.main(args) == 0 and "would be" in capsys.readouterr().out  # a dry run
    assert ("sp:a", "deezer", "1") in _keys(db)
    assert script.main(args + ["--apply"]) == 0
    assert _keys(db) == [("Album1", "deezer", "1"), ("Album2", "deezer", "2"), ("Album2", "itunes:us", "9"),
                         ("Album3", "deezer", "3")]
    cache = OnePassCache(db, readonly=True)
    assert cache.mean("clap", "Album1", "deezer", "1", 4)[1] == 1 and cache.mean("effnet", "Album2", "deezer", "2", 4)[1] == 1
    cache.close()
    assert script.main(args + ["--apply"]) == 0 and "0 rows deleted" in capsys.readouterr().out


def test_a_rename_onto_a_listing_that_is_still_there_writes_nothing(tmp_path, capsys):
    db, todo = tmp_path / "onepass.sqlite", tmp_path / "todo.csv"
    _cache(db, [("sp:a", "deezer", "1", "t1"), ("Album1", "deezer", "1", "t1"), ("sp:b", "deezer", "2", "t2")])
    _list(todo, [{"action": "rename", "old_key": "sp:b", "new_key": "Album2"},
                 {"action": "rename", "old_key": "sp:a", "new_key": "Album1"}])
    assert script.main(["--list", str(todo), "--cache", str(db), "--apply"]) == 1
    assert "both have rows of deezer 1" in capsys.readouterr().err
    assert ("sp:b", "deezer", "2") in _keys(db)  # the first rename was rolled back with the rest
