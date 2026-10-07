"""The clip cache as committed tables (rmr_audio.clip_table): every clip, no vector, and the clips each
committed album mean is taken from. Runs in both venvs: numpy and the standard library."""
import csv
import hashlib
import json

import numpy as np
import pytest

from rmr_audio import clip_table, modelstore
from rmr_audio.onepass_cache import MODELS, OnePassCache
from rmr_pipeline.audio_store import MATCH_FIELDS, write_matches
from rmr_pipeline.keys import KEYS_FIELDS, URI_PREFIX, load_keys


def _vec(tag: str, model: str) -> np.ndarray:
    seed = int(hashlib.sha256(tag.encode()).hexdigest()[:8], 16)
    return np.random.default_rng(seed).normal(size=MODELS[model].dim).astype(MODELS[model].dtype)


def _put(cache, key, source, album_id, clips, model="clap", start=False):
    """clips: (rank, status) per clip of one listing; the track id is t<rank>."""
    for rank, status in clips:
        rec = {"key": key, "source": source, "album_id": album_id, "track_id": f"t{rank}", "track_idx": 10 - rank,
               "prio": rank, "clip_s": 29.98857142857143, "start_s": 12.3456789 * rank if start else None,
               "sig": "abc" if start else None}
        cache.put_clip(rec)
        emb = _vec(f"{key}/{source}/{album_id}/t{rank}", model).tobytes()
        cache.put_result(rec, model, status, error=None if status == "ok" else "4.0 s",
                         emb=emb if status == "ok" else None, clip_s=30.0)


SP = "0" * 21 + "7"  # the Spotify id Album7's clips were cached under, before it had its RYM id


@pytest.fixture
def world(tmp_path):
    cache = OnePassCache(tmp_path / "onepass.sqlite")
    ok4 = [(r, "ok") for r in range(4)]
    for model in ("clap", "effnet"):
        _put(cache, "Album1", "deezer", "d1", ok4 + [(4, "ok"), (5, "ok")], model)  # six cached: the first four count
        _put(cache, "Album2", "itunes:jp", "i2", [(0, "ok"), (1, "too_short"), (2, "ok"), (3, "ok"), (4, "ok")], model)
        _put(cache, "Album3", "deezer", "d3", ok4, model)  # previews, and windows of full-length audio: the windows count
        _put(cache, "Album3", "youtube", "vid3", [(r, "ok") for r in range(8)], model, start=True)
        _put(cache, "Album5", "deezer", "d5-other", [(0, "ok")], model)  # two listings: matches.csv names the second
        _put(cache, "Album5", "deezer", "d5", ok4, model)
        _put(cache, "Album6", "deezer", "d6", [(0, "ok"), (1, "ok")], model)  # two listings: the override forces this one
        _put(cache, "Album6", "deezer", "d6-wrong", ok4, model)
        _put(cache, f"sp:{SP}", "deezer", "d7", ok4, model)  # under its placeholder: keys.csv follows it
        _put(cache, "sp:" + "9" * 22, "deezer", "d9", ok4, model)  # not in the catalog
    _put(cache, "Album4", "deezer", "d4", [(0, "no_preview")], "effnet")  # nothing usable
    # the lengths, set here: put_clip works the flag out with the matcher, which the build venv cannot import
    cache.con.execute("UPDATE clips SET track_s = 200.0, short_preview = 0 WHERE source = 'youtube'")
    cache.set_listing("Album3", "youtube", "vid3", 1, 8, runtime_s=2400.5, n_windows=6)
    cache.set_listing("Album1", "deezer", "d1", 9, 9, runtime_s=1800)
    cache.close()
    with open(tmp_path / "albums.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rym_id", "title"])
        w.writerows([[k, k] for k in ("Album3", "Album1", "Album2", "Album4", "Album5", "Album6", "Album7")])
    audio = tmp_path / "audio"
    row = lambda key, source, album_id: dict.fromkeys(MATCH_FIELDS, "") | {  # noqa: E731
        "key": key, "source": source, "source_album_id": album_id, "ambiguous": "0"}
    write_matches(audio / "matches.csv", [row("Album1", "deezer", "d1"), row("Album2", "itunes:jp", "i2"),
                                          row("Album3", "deezer", "d3"), row("Album5", "deezer", "d5"),
                                          row("Album6", "deezer", "d6-wrong")])
    (audio / "match_overrides.json").write_text(json.dumps({"Album6": {"source": "deezer", "album_id": "d6"}}))
    with open(audio / "keys.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=KEYS_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerow({"rym_id": "Album7", "legacy_uri": URI_PREFIX + SP, "matched_by": "spotify_id", "doubt": ""})
    return tmp_path


def _paths(world):
    audio = world / "audio"
    return {"cache_db": world / "onepass.sqlite", "catalog": world / "albums.csv", "matches": audio / "matches.csv",
            "overrides": audio / "match_overrides.json", "keys_csv": audio / "keys.csv"}


def _stores(world, **kw):
    for model, name in (("clap", "clap"), ("effnet", "effnet10k")):
        assert modelstore.write(model=model, audio_dir=world / "audio" / name, out=lambda _line: None, **_paths(world), **kw) == 0
    return {"effnet10k": world / "audio" / "effnet10k", "clap": world / "audio" / "clap"}


def _export(world, stores, **kw):
    lines = []
    odd = clip_table.export(out_csv=world / "audio" / "clips.csv", listings_csv=world / "audio" / "clip_listings.csv",
                            stores=stores, out=lines.append, **_paths(world), **kw)
    return odd, lines


def _rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_the_clips_named_are_the_ones_the_cache_pools(world):
    """`chosen` is OnePassCache.means's rule written out: the same albums, listings and clip counts."""
    p = _paths(world)
    cache = OnePassCache(p["cache_db"], readonly=True)
    try:
        for model in ("clap", "effnet"):
            named = modelstore.listing_of(p["matches"], cache, model, p["overrides"], load_keys(p["keys_csv"]))
            keys, _X, n, source = cache.means(model, 4, "rank", named)
            picked = clip_table.chosen(cache, model, 4, named)
            assert sorted(picked) == keys.tolist()
            assert [len(picked[k][2]) for k in keys.tolist()] == n.tolist()
            assert [picked[k][0] for k in keys.tolist()] == source.tolist()
        assert picked["Album2"] == ("itunes:jp", "i2", ["t0", "t2", "t3", "t4"])  # the failed clip uses up no place
        assert picked["Album3"] == ("youtube", "vid3", [f"t{r}" for r in range(6)])  # n_windows windows, not 4 clips
        assert picked["Album5"][:2] == ("deezer", "d5") and picked["Album6"] == ("deezer", "d6", ["t0", "t1"])
    finally:
        cache.close()


def test_the_tables_have_every_clip_no_vector_and_the_clips_of_each_committed_mean(world):
    stores = _stores(world, exclude=("Album5",))
    before = (world / "onepass.sqlite").read_bytes()
    odd, lines = _export(world, stores, verify=True)
    assert odd == 0 and (world / "onepass.sqlite").read_bytes() == before  # the cache is only read
    assert any(x.startswith("clap: 5 albums, 20 clips in their means; 0 album(s) do not agree") for x in lines)
    rows = _rows(world / "audio" / "clips.csv")
    assert list(rows[0]) == ["key", "rym_id", "source", "listing_id", "track_id", "track_idx", "prio", "start_s", "clip_s",
                             "track_s", "short_preview", "sig", "effnet", "clap", "effnet_origin", "clap_origin", "error",
                             "in_effnet10k", "in_clap", "cached_at"]  # only the models the cache has rows for
    assert len(rows) == 43 and "emb" not in rows[0]
    assert max(len(v) for r in rows for v in r.values()) < 40  # nothing the size of a vector
    by = lambda key, listing: [r for r in rows if r["key"] == key and r["listing_id"] == listing]  # noqa: E731
    assert [r["in_clap"] for r in by("Album1", "d1")] == ["1", "1", "1", "1", "0", "0"]  # in rank order
    assert [(r["track_id"], r["clap"], r["in_clap"], r["error"]) for r in by("Album2", "i2")][:3] == [
        ("t0", "ok", "1", ""), ("t1", "too_short", "0", "effnet: 4.0 s; clap: 4.0 s"), ("t2", "ok", "1", "")]
    assert [r["in_effnet10k"] for r in by("Album3", "vid3")] == ["1"] * 6 + ["0"] * 2
    assert {r["in_clap"] for r in by("Album3", "d3")} == {"0"}  # the previews the windows replace
    assert by("Album3", "vid3")[1] | {"cached_at": ""} == {
        "key": "Album3", "rym_id": "Album3", "source": "youtube", "listing_id": "vid3", "track_id": "t1", "track_idx": "9",
        "prio": "1", "start_s": "12.346", "clip_s": "29.989", "track_s": "200", "short_preview": "0", "sig": "abc",
        "effnet": "ok", "clap": "ok", "effnet_origin": "onepass", "clap_origin": "onepass", "error": "",
        "in_effnet10k": "1", "in_clap": "1", "cached_at": ""}
    assert {r["in_clap"] for r in by("Album5", "d5") + by("Album5", "d5-other")} == {"0"}  # left out of the stores
    assert {r["in_clap"] for r in by("Album6", "d6")} == {"1"} and {r["in_clap"] for r in by("Album6", "d6-wrong")} == {"0"}
    assert {(r["rym_id"], r["in_clap"]) for r in by(f"sp:{SP}", "d7")} == {("Album7", "1")}  # followed through keys.csv
    assert {(r["rym_id"], r["in_clap"]) for r in by("sp:" + "9" * 22, "d9")} == {("", "0")}  # not a catalog album
    assert [(r["effnet"], r["clap"], r["clap_origin"]) for r in by("Album4", "d4")] == [("no_preview", "", "")]
    listings = _rows(world / "audio" / "clip_listings.csv")
    assert [{k: v for k, v in r.items() if k != "cached_at"} for r in listings] == [
        {"key": "Album1", "rym_id": "Album1", "source": "deezer", "listing_id": "d1", "n_tracks": "9", "n_previews": "9",
         "runtime_s": "1800", "n_windows": ""},
        {"key": "Album3", "rym_id": "Album3", "source": "youtube", "listing_id": "vid3", "n_tracks": "1", "n_previews": "8",
         "runtime_s": "2400.5", "n_windows": "6"}]
    files = lambda: [(world / "audio" / n).read_bytes() for n in ("clips.csv", "clip_listings.csv")]  # noqa: E731
    first = files()
    assert _export(world, stores)[0] == 0 and files() == first  # the same inputs give the same bytes


def test_a_store_the_cache_no_longer_gives_is_said_not_hidden(world):
    stores = _stores(world)
    cache = OnePassCache(world / "onepass.sqlite")  # after the stores were written: a clip of rank 0 turns up
    _put(cache, "Album6", "deezer", "d6", [(2, "ok"), (3, "ok")])
    cache.con.execute("DELETE FROM embeddings WHERE key = 'Album5' AND model = 'effnet'")
    cache.close()
    (world / "audio" / "clips.csv").write_text("as it was")
    odd, lines = _export(world, {"clap": stores["clap"]}, verify=True, dry_run=True)
    assert odd == 2 and (world / "audio" / "clips.csv").read_text() == "as it was"
    assert "  Album6: clap has 2 clip(s) from deezer, the cache gives 4 from deezer" in lines
    assert "  Album6: the mean of these clips is not the vector clap has" in lines
    odd, lines = _export(world, {"effnet10k": stores["effnet10k"]}, dry_run=True)
    assert odd == 1 and "  Album5: in effnet10k, and the cache has no ok effnet clip for it" in lines


def test_the_command_fails_without_the_cache(tmp_path, capsys):
    assert clip_table.main(["--cache", str(tmp_path / "none.sqlite"), "--dry-run"]) == 1
    assert "no such cache" in capsys.readouterr().err
