import csv
import json

import numpy as np
import pytest

from rmr_pipeline.audio_store import (DEFAULT_AUDIO, DIM, MATCH_FIELDS, SITE_MODEL, STORES, StoreError, append_shard,
                                      clean_leftovers, duplicate_listings,
                                      compact_store, drop_albums, init_store, keys_csv, leftovers, load_manifest,
                                      load_match_overrides, load_matches, load_store, read_shard, replace_store,
                                      set_clips_per_album, site_store, write_matches, write_shard)
from rmr_pipeline.keys import load_keys


def _emb(n: int, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).normal(size=(n, DIM)).astype(np.float16)


@pytest.fixture
def store(tmp_path):
    d = tmp_path / "audio"
    init_store(d, "model-1", {"per_album": 4})
    append_shard(d, ["a", "b", "c"], _emb(3), [4, 4, 2], ["deezer", "itunes:us", "local"], note="first")
    return d


def test_shard_round_trip(tmp_path):
    emb = _emb(3)
    write_shard(tmp_path / "part-0001.npz", ["a", "b", "ü:1"], emb, [4, 3, 1], ["deezer", "itunes:jp", "local"])
    s = read_shard(tmp_path / "part-0001.npz")
    assert s.keys.tolist() == ["a", "b", "ü:1"] and s.source.tolist() == ["deezer", "itunes:jp", "local"]
    assert s.emb.dtype == np.float16 and np.array_equal(s.emb, emb)
    assert s.n_clips.dtype == np.int16 and s.n_clips.tolist() == [4, 3, 1]


def test_store_round_trip_and_manifest(store):
    s = load_store(store)
    assert s.keys.tolist() == ["a", "b", "c"]
    assert np.array_equal(s.emb, _emb(3))
    assert s.manifest["model"] == "model-1" and s.manifest["clips"] == {"per_album": 4}
    assert [(e["file"], e["albums"], e["note"]) for e in s.manifest["shards"]] == [("part-0001.npz", 3, "first")]
    assert s.rows(["c", "nope", "a"]).tolist() == [2, -1, 0]


def test_later_shard_supersedes_earlier(store):
    new = _emb(2, seed=1)
    path = append_shard(store, ["d", "b"], new, [8, 8], ["deezer", "deezer"], note="top-up")
    assert path.name == "part-0002.npz"
    s = load_store(store)
    assert s.keys.tolist() == ["a", "b", "c", "d"]
    assert np.array_equal(s.emb[1], new[1]) and np.array_equal(s.emb[3], new[0])
    assert np.array_equal(s.emb[[0, 2]], _emb(3)[[0, 2]])
    assert s.n_clips.tolist() == [4, 8, 2, 8] and s.source.tolist() == ["deezer", "deezer", "local", "deezer"]


def test_compact_keeps_every_albums_newest_embedding_in_one_shard(store):
    append_shard(store, ["d", "b"], _emb(2, seed=1), [8, 8], ["deezer", "deezer"], note="top-up")
    before = load_store(store)
    path = compact_store(store, note="compacted", created="2026-10-02")
    assert path.name == "part-0003.npz" and sorted(p.name for p in (store / "embeddings").iterdir()) == [path.name]
    after = load_store(store)
    assert after.manifest["shards"] == [{"file": "part-0003.npz", "albums": 4, "created": "2026-10-02", "note": "compacted"}]
    assert after.manifest["clips"] == before.manifest["clips"] and after.manifest["model"] == before.manifest["model"]
    for name in ("keys", "emb", "n_clips", "source"):
        assert np.array_equal(getattr(after, name), getattr(before, name))
    assert append_shard(store, ["e"], _emb(1), [4], ["local"], note="next").name == "part-0004.npz"


def test_writes_are_atomic_and_leftovers_are_cleaned_by_the_next_write(store, monkeypatch):
    import rmr_pipeline.audio_store as mod

    before = load_store(store)

    def crash(*a, **k):
        raise KeyboardInterrupt

    monkeypatch.setattr(mod, "_write_json", crash)  # the shard is in place, the manifest write never happens
    with pytest.raises(KeyboardInterrupt):
        append_shard(store, ["d"], _emb(1), [4], ["deezer"], note="interrupted")
    monkeypatch.undo()
    assert (store / "embeddings" / "part-0002.npz").exists()
    after = load_store(store)  # still the store it was
    assert after.keys.tolist() == before.keys.tolist() and len(after.manifest["shards"]) == 1
    monkeypatch.setattr(mod.np, "savez_compressed", crash)  # a crash in the middle of writing a shard
    with pytest.raises(KeyboardInterrupt):
        append_shard(store, ["e"], _emb(1), [4], ["deezer"], note="interrupted")
    monkeypatch.undo()
    assert sorted(p.name for p in leftovers(store)) == [".part-0002.npz.tmp"]  # the stray shard was replaced first
    path = append_shard(store, ["f"], _emb(1, seed=3), [4], ["deezer"], note="next")
    assert path.name == "part-0002.npz" and not leftovers(store)
    assert load_store(store).keys.tolist() == ["a", "b", "c", "f"]
    (store / ".matches.csv.tmp").write_text("x")
    assert clean_leftovers(store) == [".matches.csv.tmp"]
    rows = [dict(zip(MATCH_FIELDS, ["k1", "deezer", "12", "T", "A", "0.9", "0", "12", "12", "", "", "", "", ""]))]
    write_matches(store / "matches.csv", rows)
    assert load_matches(store / "matches.csv") == rows and not leftovers(store)


def test_removed_albums_leave_the_store_and_compaction_forgets_them(store):
    path = drop_albums(store, ["b"], note="wrong album", created="2026-10-02")
    shard = read_shard(path)
    assert shard.n_clips.tolist() == [0] and shard.source.tolist() == [""] and not shard.emb.any()
    s = load_store(store)
    assert s.keys.tolist() == ["a", "c"] and s.rows(["b", "c"]).tolist() == [-1, 1]
    append_shard(store, ["b"], _emb(1, seed=5), [8], ["itunes:gb"], note="back")  # a later entry brings it back
    assert load_store(store).keys.tolist() == ["a", "b", "c"] and load_store(store).n_clips.tolist() == [4, 8, 2]
    drop_albums(store, ["a", "b"], note="gone")
    compact_store(store, note="compacted")
    assert load_store(store).keys.tolist() == ["c"]
    assert read_shard(store / "embeddings" / load_store(store).manifest["shards"][0]["file"]).keys.tolist() == ["c"]
    with pytest.raises(StoreError, match="n_clips"):  # a removal carries no embedding and no source
        write_shard(store / "x.npz", ["a"], _emb(1), [0], [""])
    with pytest.raises(StoreError, match="n_clips"):
        write_shard(store / "x.npz", ["a"], np.zeros((1, DIM), np.float16), [0], ["deezer"])


def test_set_clips_per_album_changes_only_the_policy(store):
    before = load_store(store).manifest
    set_clips_per_album(store, 8)
    after = load_store(store).manifest
    assert after["clips"] == {"per_album": 8} and after["shards"] == before["shards"] and after["model"] == before["model"]


@pytest.mark.parametrize("arrays, message", [
    ({"emb": _emb(2).astype(np.float32)}, "float16"),
    ({"emb": _emb(2)[:, :10]}, "shape"),
    ({"keys": np.array(["a", "a"])}, "unique"),
    ({"keys": np.array(["a", ""])}, "unique"),
    ({"n_clips": np.array([4, 0], dtype=np.int16)}, "n_clips"),
    ({"n_clips": np.array([4], dtype=np.int16)}, "n_clips"),
    ({"source": np.array(["deezer", "spotify"])}, "unknown source"),
    ({"emb": np.vstack([_emb(1), np.full((1, DIM), np.nan, np.float16)])}, "non-finite"),
    ({"emb": np.vstack([_emb(1), np.zeros((1, DIM), np.float16)])}, "all-zero"),
    ({"keys": np.array(["a", "b"], dtype=object)}, "not a readable shard"),
])
def test_bad_shard_is_rejected(tmp_path, arrays, message):
    good = {"keys": np.array(["a", "b"]), "emb": _emb(2), "n_clips": np.array([4, 4], dtype=np.int16),
            "source": np.array(["deezer", "deezer"])}
    path = tmp_path / "part-0001.npz"
    np.savez(path, **(good | arrays))
    with pytest.raises(StoreError, match=message):
        read_shard(path, dim=DIM)  # as load_store reads it: with the width its manifest gives


def test_missing_array_and_garbage_are_rejected(tmp_path):
    path = tmp_path / "part-0001.npz"
    np.savez(path, keys=np.array(["a"]), emb=_emb(1))
    with pytest.raises(StoreError, match="missing arrays"):
        read_shard(path)
    path.write_bytes(b"not a zip file")
    with pytest.raises(StoreError, match="not a readable shard"):
        read_shard(path)
    with pytest.raises(StoreError, match="unknown source"):
        write_shard(path, ["a"], _emb(1), [4], ["tidal"])


def test_store_and_manifest_must_agree(store, tmp_path):
    with pytest.raises(StoreError, match="manifest.json"):
        load_store(tmp_path / "nowhere")
    write_shard(store / "embeddings" / "part-0007.npz", ["z"], _emb(1), [4], ["deezer"])
    assert load_store(store).keys.tolist() == ["a", "b", "c"]  # a shard the manifest does not list is ignored...
    assert [p.name for p in leftovers(store)] == ["part-0007.npz"]  # ...and reported
    (store / "embeddings" / "part-0007.npz").unlink()
    manifest = json.loads((store / "manifest.json").read_text())
    manifest["shards"][0]["albums"] = 5
    (store / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(StoreError, match="the manifest says 5"):
        load_store(store)
    (store / "embeddings" / "part-0001.npz").unlink()
    with pytest.raises(StoreError, match="missing shard"):
        load_store(store)
    (store / "manifest.json").write_text("{")
    with pytest.raises(StoreError, match="not valid JSON"):
        load_store(store)


def test_matches_round_trip_and_checks(tmp_path):
    path = tmp_path / "matches.csv"
    rows = [dict(zip(MATCH_FIELDS, ["k1", "deezer", "12", 'Title, with "quotes"', "Artist", "0.9974", "0", "12", "12",
                                    "deezer_id", "split", "2400", "1", ""])),
            dict(zip(MATCH_FIELDS, ["k2", "", "", "", "", "", "0", "", "", "", "", "", "", ""]))]
    assert all(len(r) == len(MATCH_FIELDS) for r in rows)
    write_matches(path, rows)
    assert load_matches(path) == rows
    old = {k: rows[0][k] for k in MATCH_FIELDS[:9]}  # a row of before the later columns: they are written empty
    write_matches(path, [old])
    assert load_matches(path) == [{**dict.fromkeys(MATCH_FIELDS, ""), **old}]
    for field, bad in (("matched_by", "guess"), ("edition", "deluxe"), ("under_covered", "yes"), ("short_preview", "2")):
        write_matches(path, [{**rows[0], field: bad}])
        with pytest.raises(StoreError, match=field):
            load_matches(path)
    write_matches(path, rows + [rows[0]])
    with pytest.raises(StoreError, match="repeated key 'k1'"):
        load_matches(path)
    path.write_text("key,source\nk1,deezer\n", encoding="utf-8")
    with pytest.raises(StoreError, match="header"):
        load_matches(path)


def test_duplicate_listings():
    """The duplicate guard: one store listing under two album keys. Apple ids are the same in every storefront."""
    row = lambda key, source, album_id: {"key": key, "source": source, "source_album_id": album_id}  # noqa: E731
    rows = [row("a", "deezer", "1"), row("b", "deezer", "2"), row("c", "deezer", "1"), row("d", "itunes:us", "1"),
            row("e", "itunes:jp", "1"), row("f", "", ""), row("g", "", ""), row("h", "itunes:gb", "7")]
    assert duplicate_listings(rows) == {("deezer", "1"): ["a", "c"], ("itunes", "1"): ["d", "e"]}
    assert duplicate_listings(rows[:2] + rows[5:]) == {}


# SHA-256 over key, source, source_album_id, matched_title, matched_artist, score and ambiguous of the albums
# matched before 3 October 2026 (the 4,081 of the feature table), tab-separated, one album per line, in file
# order. n_tracks and n_clips_available are left out: they follow the listing at each sync.
# 4 October 2026: 43 off-chart albums were paired by hand with their chart rows, so their keys went from the
# placeholder to the RYM id. Every other field of every row is what it was.
EXISTING_MATCHES_SHA256 = "f086ec018b4d0dbc99e0526009c854b2ddff133284547fc6c00079aa3bb453dd"


def test_the_existing_albums_matches_are_untouched(deduped):
    """Growing the catalog and widening matches.csv must not move a match the site's albums already have.
    After a change meant to move one (a corrected match, a --retry-unmatched run), put the new hash here."""
    import hashlib

    sub, _ = deduped
    existing = set(load_keys(DEFAULT_AUDIO / "keys.csv").keys_of(sub["URI"]))
    rows = [m for m in load_matches(DEFAULT_AUDIO / "matches.csv") if m["key"] in existing]
    assert len(rows) == len(existing)
    text = "\n".join("\t".join(m[k] for k in MATCH_FIELDS[:7]) for m in rows)
    assert hashlib.sha256(text.encode()).hexdigest() == EXISTING_MATCHES_SHA256


def test_match_overrides(tmp_path):
    path = tmp_path / "match_overrides.json"
    assert load_match_overrides(path) == {}
    good = {"k1": {"source": "itunes:jp", "album_id": "123", "note": "the 1991 release"}, "k2": {"skip": True}}
    path.write_text(json.dumps(good), encoding="utf-8")
    assert load_match_overrides(path) == good
    for bad in ({"k": {"source": "deezer"}}, {"k": {"skip": False}}, {"k": {"source": "tidal", "album_id": "1"}},
                {"k": {"source": "deezer", "album_id": 5}}, ["k"]):
        path.write_text(json.dumps(bad), encoding="utf-8")
        with pytest.raises(StoreError):
            load_match_overrides(path)


def test_committed_store(deduped):
    sub, _ = deduped
    s = load_store(DEFAULT_AUDIO)
    uris = set(load_keys(DEFAULT_AUDIO / "keys.csv").keys_of(sub["URI"]))  # the albums' keys: RYM ids
    assert not leftovers(DEFAULT_AUDIO)  # nothing unlisted or half-written is committed
    # Counts are bounds, not pins: the audio stage adds albums and clips (3,944 albums came from the experiment).
    assert 3944 <= len(s.keys) <= len(uris) and set(s.keys.tolist()) <= uris
    assert {"deezer", "itunes:us"} <= set(s.source.tolist())
    assert s.manifest["clips"]["per_album"] in (4, 8) and 1 <= s.n_clips.min()
    assert s.n_clips.max() <= s.manifest["clips"]["per_album"] or "local" in s.source.tolist()
    # matches.csv: a row for every album of the feature table, and rows of the catalog's new albums, which are
    # matched before they are embedded. load_matches refuses a repeated key.
    matches = load_matches(DEFAULT_AUDIO / "matches.csv")
    match_keys = {m["key"] for m in matches}
    with open(DEFAULT_AUDIO.parent / "catalog" / "albums.csv", newline="", encoding="utf-8") as f:
        catalog = {r["rym_id"] for r in csv.DictReader(f)}
    assert len(match_keys) == len(matches) and uris <= match_keys <= catalog
    assert set(s.keys.tolist()) <= match_keys
    matched = {m["key"]: m["source"] for m in matches if m["source"]}
    stored = {k: src for k, src in zip(s.keys.tolist(), s.source.tolist()) if src != "local"}
    assert stored == {k: matched.get(k) for k in stored}  # every embedding comes from the listing matches.csv names
    assert len(set(matched) & uris) - len(stored) <= 5  # an album of the site matched, but no usable clip: rare
    overrides = load_match_overrides(DEFAULT_AUDIO / "match_overrides.json")
    assert set(overrides) <= catalog and all(e.get("note") for e in overrides.values())  # the new albums have overrides too
    skipped = {k for k, e in overrides.items() if e.get("skip")}
    assert not skipped & set(s.keys.tolist())  # an album kept out of matching has no embedding
    # Apple only has cover versions of these two game soundtracks: they stay without audio
    assert {"Album10376", "Album1894233"} <= skipped  # Ocarina of Time, Super Mario Galaxy


# --- a store per model: the width comes from the manifest ---------------------------------------------------

def _emb_of(n: int, dim: int, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).normal(size=(n, dim)).astype(np.float16)


def test_a_store_of_another_width_round_trips(tmp_path):
    d = tmp_path / "audio" / "clap"
    init_store(d, "laion/larger_clap_music_and_speech", {"per_album": 4}, dim=512)
    emb = _emb_of(3, 512)
    append_shard(d, ["a", "b", "c"], emb, [4, 3, 12], ["deezer", "itunes:jp", "youtube"], note="first")
    s = load_store(d)
    assert s.dim == 512 and s.manifest["dim"] == 512 and s.manifest["model"] == "laion/larger_clap_music_and_speech"
    assert s.emb.shape == (3, 512) and np.array_equal(s.emb, emb) and s.source.tolist()[2] == "youtube"
    assert read_shard(d / "embeddings" / "part-0001.npz").emb.shape == (3, 512)  # on its own: any width
    drop_albums(d, ["b"], note="gone")  # a removal is as wide as the store
    append_shard(d, ["e"], _emb_of(1, 512, seed=2), [4], ["bandcamp"], note="more")
    compact_store(d, note="compacted")
    s = load_store(d)
    assert s.keys.tolist() == ["a", "c", "e"] and s.emb.shape == (3, 512) and s.dim == 512


def test_the_manifests_width_is_enforced(tmp_path):
    d = tmp_path / "clap"
    init_store(d, "m", {"per_album": 4}, dim=512)
    with pytest.raises(StoreError, match=r"shape \(1, 512\)"):  # EffNet vectors do not go into a CLAP store
        append_shard(d, ["a"], _emb(1), [4], ["deezer"], note="wrong model")
    append_shard(d, ["a"], _emb_of(1, 512), [4], ["deezer"], note="first")
    write_shard(d / "embeddings" / "part-0001.npz", ["a"], _emb(1), [4], ["deezer"])  # a shard of another width in its place
    with pytest.raises(StoreError, match=r"shape \(1, 512\)"):
        load_store(d)
    manifest = json.loads((d / "manifest.json").read_text())
    for bad in (0, "512", 512.0, True):
        (d / "manifest.json").write_text(json.dumps({**manifest, "dim": bad}))
        with pytest.raises(StoreError, match="dim must be a positive integer"):
            load_manifest(d)
    del manifest["dim"]  # a manifest of before stores recorded the width is EffNet's
    (d / "manifest.json").write_text(json.dumps(manifest))
    assert write_shard(d / "embeddings" / "part-0001.npz", ["a"], _emb(1), [4], ["deezer"]) and load_store(d).dim == DIM


def test_replace_store_rewrites_whole_and_leaves_an_identical_store_alone(tmp_path):
    d = tmp_path / "clap"
    emb = _emb_of(3, 16)
    args = dict(model="m", dim=16, clips={"per_album": 4}, n_clips=[4, 4, 2], source=["deezer", "local", "itunes:us"])
    first = replace_store(d, keys=["a", "b", "c"], emb=emb, note="first", created="2026-10-04", extra={"pooling": "x"}, **args)
    assert first.name == "part-0001.npz" and load_store(d).manifest == {
        "model": "m", "dim": 16, "clips": {"per_album": 4}, "pooling": "x",
        "shards": [{"file": "part-0001.npz", "albums": 3, "created": "2026-10-04", "note": "first"}]}
    before = {p.name: p.read_bytes() for p in d.rglob("*") if p.is_file()}
    assert replace_store(d, keys=["a", "b", "c"], emb=emb, note="again", extra={"pooling": "x"}, **args) is None
    assert {p.name: p.read_bytes() for p in d.rglob("*") if p.is_file()} == before  # not one byte
    # a renamed album, one gone, another order: the store is exactly what it is given
    second = replace_store(d, keys=["c", "Album1"], emb=emb[[2, 0]], note="rekeyed", extra={"pooling": "x"},
                           **(args | {"n_clips": [2, 4], "source": ["itunes:us", "deezer"]}))
    assert second.name == "part-0002.npz" and [p.name for p in (d / "embeddings").iterdir()] == ["part-0002.npz"]
    s = load_store(d)
    assert s.keys.tolist() == ["c", "Album1"] and np.array_equal(s.emb, emb[[2, 0]]) and not leftovers(d)
    with pytest.raises(StoreError, match="shape"):
        replace_store(d, keys=["a"], emb=_emb_of(1, 8), note="x", **(args | {"n_clips": [4], "source": ["deezer"]}))
    with pytest.raises(StoreError, match="no clips"):
        replace_store(d, keys=["a"], emb=np.zeros((1, 16), np.float16), note="x", **(args | {"n_clips": [0], "source": [""]}))
    assert load_store(d).keys.tolist() == ["c", "Album1"]  # a refused write leaves the store as it was


def test_the_site_reads_the_10k_effnet_store_since_the_switch():
    """audio_store.SITE_MODEL is the one switch. The build's default store follows it (tests/test_build.py).
    It was "effnet", data-pipeline/audio itself, until 6 October 2026."""
    assert SITE_MODEL == "effnet10k" and site_store() == STORES["effnet10k"] == DEFAULT_AUDIO / "effnet10k"
    assert STORES["effnet"] == DEFAULT_AUDIO and STORES["clap"] == DEFAULT_AUDIO / "clap"
    assert load_manifest(DEFAULT_AUDIO)["model"] == "discogs-effnet-bs1-1" and load_store(DEFAULT_AUDIO).dim == DIM == 1280


def test_a_store_inside_another_shares_its_keys(tmp_path):
    outer = tmp_path / "audio"
    (outer / "clap").mkdir(parents=True)
    assert keys_csv(outer) == outer / "keys.csv" and keys_csv(outer / "clap") == outer / "clap" / "keys.csv"  # none anywhere
    (outer / "keys.csv").write_text("rym_id,legacy_uri,matched_by,doubt\n")
    assert keys_csv(outer / "clap") == outer / "keys.csv" and keys_csv(outer) == outer / "keys.csv"
    (outer / "clap" / "keys.csv").write_text("rym_id,legacy_uri,matched_by,doubt\n")
    assert keys_csv(outer / "clap") == outer / "clap" / "keys.csv"
    assert keys_csv(STORES["clap"]) == DEFAULT_AUDIO / "keys.csv"
