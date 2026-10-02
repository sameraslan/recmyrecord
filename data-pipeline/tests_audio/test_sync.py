"""sync against a temporary store, with a fake worker pool and fake listings: no network, no Essentia."""
import json

import numpy as np

from rmr_pipeline.audio_store import load_manifest, load_matches, load_store, read_shard
from rmr_audio import match as matching
from rmr_audio.clips import priority_order

from .conftest import fake_emb, listing, match_row


def _mean(album_id, n, clips):
    order = priority_order(n)[:clips]
    return np.mean([fake_emb(f"{album_id}-{i}").astype(np.float64) for i in sorted(order)], axis=0).astype(np.float16)


def test_first_sync_writes_one_shard_and_reports_the_rest(world):
    lines = world.run()
    assert lines[0] == ("sync to 4 clips per album. 5 albums: 0 up to date, 3 to embed, 0 to write from the cache, "
                        "1 to match, 0 from local files, 1 unmatched (not retried: --retry-unmatched)")
    s = load_store(world.audio)
    assert s.keys.tolist() == ["key:0", "key:1", "key:2"] and s.n_clips.tolist() == [4, 4, 3]
    assert s.source.tolist() == ["deezer", "deezer", "itunes:us"]
    assert np.array_equal(s.emb[0], _mean("d0", 10, 4)) and np.array_equal(s.emb[2], _mean("i2", 3, 3))
    m = load_manifest(world.audio)
    assert [(e["file"], e["albums"], e["note"]) for e in m["shards"]] == [("part-0001.npz", 3, "sync to 4 clips: 3 new, 0 updated")]
    assert len(world.log) == 11 and len(set(world.log)) == 11


def test_a_second_sync_does_nothing(world):
    world.run()
    fetched, log = len(world.fetched), len(world.log)
    lines = world.run()
    assert lines == ["sync to 4 clips per album. 5 albums: 3 up to date, 0 to embed, 0 to write from the cache, "
                     "0 to match, 0 from local files, 2 unmatched (not retried: --retry-unmatched)"]
    assert (len(world.fetched), len(world.log)) == (fetched, log)
    assert len(load_manifest(world.audio)["shards"]) == 1


def test_top_up_downloads_only_the_new_clips_and_leaves_other_albums_alone(world):
    world.run()
    before = set(world.log)
    lines = world.run(clips=8, keys=("key:0", "title-2-artist-2"))  # a key and a slug; album 2 has only 3 tracks
    assert "wrote part-0002.npz: 1 albums (0 new, 1 updated)" in lines
    new = world.log[11:]
    assert len(new) == 4 and not set(new) & before
    assert [t for _, t in new] == [f"d0-{i}" for i in priority_order(10)[4:8]]
    shard = read_shard(world.audio / "embeddings" / "part-0002.npz")
    assert shard.keys.tolist() == ["key:0"] and shard.n_clips.tolist() == [8]  # albums 1 and 2 are not rewritten
    s = load_store(world.audio)
    assert s.n_clips.tolist() == [8, 4, 3] and np.array_equal(s.emb[0], _mean("d0", 10, 8))
    assert np.array_equal(s.emb[1], _mean("d1", 10, 4))
    assert load_manifest(world.audio)["clips"]["per_album"] == 4  # a partial run does not change the policy


def test_a_whole_catalog_top_up_becomes_the_policy(world):
    world.run()
    world.run(clips=8)
    assert load_manifest(world.audio)["clips"]["per_album"] == 8
    assert load_store(world.audio).n_clips.tolist() == [8, 8, 3]
    assert "3 up to date" in world.run()[0]  # a plain sync now means 8


def test_interrupted_sync_writes_the_finished_albums_and_resumes_without_repeating_a_clip(world):
    stop = world.Stop()
    world.pool_args = {"on_task": stop}  # the signal arrives while the first album's clips are in flight
    lines = world.run(stop=stop, clips=8)
    done = load_store(world.audio)
    assert 1 <= len(done.keys) < 3 and "(interrupted)" in load_manifest(world.audio)["shards"][0]["note"]
    assert any("not finished; run sync again" in line for line in lines)
    first = list(world.log)
    world.pool_args = {}
    world.run(clips=8)
    assert len(world.log) == len(set(world.log)) == 8 + 8 + 3  # no clip was given to a worker twice
    assert not set(world.log[len(first):]) & set(first)
    s = load_store(world.audio)
    assert s.n_clips.tolist() == [8, 8, 3] and np.array_equal(s.emb[1], _mean("d1", 10, 8))
    second = read_shard(world.audio / "embeddings" / "part-0002.npz")
    assert not set(second.keys.tolist()) & set(done.keys.tolist())  # the finished albums are not rewritten


def test_a_clip_that_fails_is_recorded_and_skipped(world):
    world.pool_args = {"status": {"d0-0": "too_short", "i2-0": "download_failed"}}
    lines = world.run()
    s = load_store(world.audio)
    assert s.n_clips.tolist() == [3, 4, 2]
    assert any("'too_short': 1" in line and "'download_failed': 1" in line for line in lines)
    world.pool_args = {}
    log = len(world.log)
    lines = world.run()  # the final failure is left alone, the transient one is tried again
    assert world.log[log:] == [("key:2", "i2-0")]
    assert "wrote part-0002.npz: 1 albums (0 new, 1 updated)" in lines
    assert load_store(world.audio).n_clips.tolist() == [3, 4, 3]


def test_an_album_with_no_usable_clip_stays_out_of_the_store(world):
    world.pool_args = {"status": {f"i2-{i}": "decode_failed" for i in range(3)}}
    lines = world.run()
    assert load_store(world.audio).keys.tolist() == ["key:0", "key:1"]
    assert "problem\ttitle-2-artist-2\tno usable clip" in lines
    assert "1 with no usable clip" in world.run()[0]


def test_a_dead_worker_costs_one_clip_not_the_run(world):
    world.pool_args = {"crash": {"d1-0"}}
    lines = world.run()
    assert any("a worker died" in line for line in lines)
    s = load_store(world.audio)
    assert s.keys.tolist() == ["key:0", "key:1", "key:2"] and s.n_clips.tolist() == [4, 3, 3]
    assert len(world.log) == len(set(world.log)) == 10


def test_a_listing_that_cannot_be_fetched_only_loses_its_album(world):
    del world.listings[("deezer", "d0")]
    lines = world.run()
    assert load_store(world.audio).keys.tolist() == ["key:1", "key:2"]
    assert any(line.startswith("problem\ttitle-0-artist-0\tlisting failed") for line in lines)


def test_matches_csv_follows_the_listing(world):
    world.listings[("deezer", "d0")] = listing("d0", 10, no_preview=(8, 9))
    lines = world.run()
    assert "matches.csv: 2 rows added or changed" in lines  # album 0's listing, and album 4 found unmatched
    rows = {r["key"]: r for r in load_matches(world.audio / "matches.csv")}
    assert (rows["key:0"]["n_tracks"], rows["key:0"]["n_clips_available"]) == ("10", "8")
    assert rows["key:1"] == match_row("key:1", "deezer", "d1")
    assert [r["key"] for r in load_matches(world.audio / "matches.csv")] == [f"key:{i}" for i in range(5)]


def test_new_album_is_matched_then_embedded_and_unmatched_ones_wait_for_the_flag(world, monkeypatch):
    asked = []

    def match_album(http, al, storefronts):
        asked.append((al.key, storefronts))
        if al.key == "key:4":
            return matching.Match("itunes:jp", "j4", "Title 4", "Artist 4", 0.95, True, 6, 6, "score in the grey zone")
        return matching.Match(reason="no candidate")

    monkeypatch.setattr(matching, "match_album", match_album)
    world.listings[("itunes:jp", "j4")] = listing("j4", 6)
    lines = world.run(storefronts=("jp", "us"))
    assert asked == [("key:4", ("jp", "us"))]  # album 3 is recorded as unmatched: not searched again
    assert any("AMBIGUOUS" in line and "title-4-artist-4" in line for line in lines)
    s = load_store(world.audio)
    assert s.keys.tolist()[-1] == "key:4" and s.source.tolist()[-1] == "itunes:jp" and s.n_clips.tolist()[-1] == 4
    row = load_matches(world.audio / "matches.csv")[4]
    assert (row["source"], row["source_album_id"], row["ambiguous"], row["n_clips_available"]) == ("itunes:jp", "j4", "1", "6")
    world.run(retry_unmatched=True)
    assert asked[-1][0] == "key:3"
    assert load_matches(world.audio / "matches.csv")[3]["source"] == ""


def test_match_overrides_skip_and_force(world, monkeypatch):
    world.run()
    (world.audio / "match_overrides.json").write_text(json.dumps({
        "key:0": {"skip": True}, "key:4": {"skip": True},
        "key:1": {"source": "itunes:gb", "album_id": "g1", "note": "the deezer listing is a tribute"}}))
    monkeypatch.setattr(matching, "forced", lambda http, source, album_id: matching.Match(
        source, album_id, "Right", "Artist 1", 1.0, False, 10, 10, "forced"))
    world.listings[("itunes:gb", "g1")] = listing("g1", 10)
    lines = world.run(clips=8)
    assert "2 skipped by match_overrides.json" in lines[0]
    shard = read_shard(world.audio / "embeddings" / "part-0002.npz")
    assert shard.keys.tolist() == ["key:1"] and shard.source.tolist() == ["itunes:gb"]
    assert np.array_equal(shard.emb[0], _mean("g1", 10, 8))
    row = load_matches(world.audio / "matches.csv")[1]
    assert (row["source"], row["source_album_id"], row["matched_title"]) == ("itunes:gb", "g1", "Right")
    assert load_store(world.audio).n_clips.tolist()[0] == 4  # the skipped album keeps what it had


def test_the_store_catches_up_from_the_cache_without_downloading(world):
    world.run(clips=8, limit=1)  # album 0 gets eight clips
    for f in (world.audio / "embeddings").glob("*.npz"):  # the shard is thrown away (as after a demonstration run)
        f.unlink()
    m = load_manifest(world.audio)
    (world.audio / "manifest.json").write_text(json.dumps({**m, "shards": []}))
    log, fetched = len(world.log), len(world.fetched)
    lines = world.run(clips=8, keys=("key:0",))
    assert "1 to write from the cache" in lines[0] and "wrote part-0001.npz: 1 albums (1 new, 0 updated)" in lines
    assert (len(world.log), len(world.fetched)) == (log, fetched)
    assert np.array_equal(load_store(world.audio).emb[0], _mean("d0", 10, 8))


def test_fewer_clips_than_the_store_has_never_downgrades(world):
    world.run(clips=8, keys=("key:0",))
    lines = world.run(clips=4, keys=("key:0",))
    assert "1 up to date" in lines[0] and load_store(world.audio).n_clips.tolist() == [8]


def test_dry_run_touches_nothing(world):
    lines = world.run(dry_run=True, clips=8)
    assert any(line.startswith("would embed  0 -> 8 clips") and line.endswith("title-0-artist-0") for line in lines)
    assert lines[-1].startswith("dry run: nothing fetched or written")
    assert not world.fetched and not world.log and not (world.cache / "clips.sqlite").exists()
    assert not (world.audio / "embeddings").exists()


def test_local_folder_takes_precedence_and_follows_its_files(world, tmp_path):
    local = tmp_path / "local"
    folder = local / "title-0-artist-0"
    folder.mkdir(parents=True)
    for name in ("02 b.flac", "01 a.mp3", "10 c.wav", "cover.jpg", ".hidden.mp3"):
        (folder / name).write_bytes(name.encode())
    (local / "title-3-artist-3").mkdir()  # an empty folder is not audio
    world.run(local_dir=local)
    s = load_store(world.audio)
    assert s.source.tolist()[0] == "local" and s.n_clips.tolist()[0] == 3
    assert [t for k, t in world.log if k == "key:0"] == ["01 a.mp3", "02 b.flac", "10 c.wav"]
    assert ("deezer", "d0") not in world.fetched
    expected = np.mean([fake_emb(n).astype(np.float64) for n in ("01 a.mp3", "02 b.flac", "10 c.wav")], axis=0)
    assert np.array_equal(s.emb[0], expected.astype(np.float16))
    log = len(world.log)
    world.run(local_dir=local, clips=8, keys=("key:0",))
    assert len(world.log) == log  # nothing embedded again, and --clips does not apply to local files
    assert "up to date" in world.run()[0] and load_store(world.audio).source.tolist()[0] == "local"  # stays local
    (folder / "02 b.flac").unlink()
    (folder / "03 d.ogg").write_bytes(b"new")
    lines = world.run(local_dir=local)
    assert world.log[log:] == [("key:0", "03 d.ogg")]
    assert any(line.startswith("wrote part-0002.npz: 1 albums") for line in lines)
    expected = np.mean([fake_emb(n).astype(np.float64) for n in ("01 a.mp3", "03 d.ogg", "10 c.wav")], axis=0)
    assert np.array_equal(load_store(world.audio).emb[0], expected.astype(np.float16))
