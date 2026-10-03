"""status, compact, the experiment import, the model file and the catalog's slugs."""
import json
import sqlite3

import numpy as np
import pytest

from rmr_pipeline.audio_store import DEFAULT_AUDIO, append_shard, load_manifest, load_store, write_matches
from rmr_pipeline.constants import DEFAULT_OUT
from rmr_audio import cli, embed, experiment
from rmr_audio.catalog import load_catalog
from rmr_audio.clips import ClipCache, to_blob
from rmr_audio.status import status

from .conftest import fake_emb, match_row


def test_status_counts_and_missing_list(world):
    world.run()
    rows = [match_row("key:0", "deezer", "d0"), match_row("key:1", "deezer", "d1") | {"ambiguous": "1"},
            match_row("key:2", "itunes:us", "i2", 3), match_row("key:3", "")]
    write_matches(world.audio / "matches.csv", rows)
    (world.audio / "match_overrides.json").write_text(json.dumps({"key:4": {"skip": True}}))
    text = status(world.catalog, world.audio)
    assert text.splitlines() == [
        "5 albums in the feature table, 3 with audio, 2 without (imputed by the build)",
        "store: discogs-effnet-bs1-1, 4 clips per album by policy, 1 shard(s)",
        "by source: deezer 2, itunes:us 1",
        "clips per album: 3 clips: 1, 4 clips: 2",
        "ambiguous matches (check them; correct in match_overrides.json): 1",
        "without audio: 1 unmatched, 0 matched but no usable clip, 0 never synced, 1 skipped by match_overrides.json"]
    assert status(world.catalog, world.audio, missing=True).splitlines()[6:] == [
        "title-3-artist-3\tArtist 3 — Title 3", "title-4-artist-4\tArtist 4 — Title 4"]


def test_status_of_an_empty_store(world):
    assert status(world.catalog, world.audio).splitlines()[0] == "5 albums in the feature table, 0 with audio, 5 without (imputed by the build)"


def test_cli_compact_and_status(world, capsys):
    world.run()
    world.run(clips=8, keys=("key:0",))
    before = load_store(world.audio)
    assert cli.main(["compact", "--audio-dir", str(world.audio)]) == 0
    assert "2 shards -> part-0003.npz" in capsys.readouterr().out
    after = load_store(world.audio)
    assert [e["file"] for e in after.manifest["shards"]] == ["part-0003.npz"]
    assert sorted(p.name for p in (world.audio / "embeddings").iterdir()) == ["part-0003.npz"]
    for name in ("keys", "emb", "n_clips", "source"):
        assert np.array_equal(getattr(before, name), getattr(after, name))
    assert cli.main(["status", "--audio-dir", str(world.audio / "nowhere")]) == 1
    assert "manifest.json" in capsys.readouterr().err


def test_site_slugs():
    """The slugs `status --missing` prints and --local-dir reads are the site's (skipped without the site data)."""
    albums = DEFAULT_OUT / "albums.json"
    if not albums.exists():
        pytest.skip("no built site data")
    site = json.loads(albums.read_text(encoding="utf-8"))
    everything = load_catalog()
    catalog = [al for al in everything if not al.new]  # the site's albums come first, in its order
    assert everything[:len(catalog)] == catalog
    assert [(al.key, al.slug, al.artist) for al in load_catalog(albums=None)] == [(al.key, al.slug, al.artist) for al in catalog]
    assert [al.slug for al in catalog] == [a["slug"] for a in site]
    assert [al.artist for al in catalog] == [a["a"] for a in site]
    assert len({al.key for al in everything}) == len(everything) == len({al.slug for al in everything})
    assert sum(not al.override for al in catalog) > 4000  # the Spotify numbers were found


def test_import_experiment_and_first_shard_check(tmp_path, monkeypatch):
    """A two-album experiment cache: the import maps rows to keys, and the check compares with the shard."""
    import pandas as pd

    table = pd.DataFrame({"URI": ["u0", "u1", "u0", "u2"], "Title": list("abcd"), "Artist": list("abcd")})
    monkeypatch.setattr(experiment, "load_table", lambda path: table)
    exp = tmp_path / "exp"
    exp.mkdir()
    con = sqlite3.connect(exp / "match.sqlite")
    con.execute("CREATE TABLE albums(row INTEGER, uri TEXT, status TEXT, source TEXT, source_album_id TEXT)")
    con.executemany("INSERT INTO albums VALUES (?, ?, ?, ?, ?)", [
        (0, "u0", "matched", "deezer", "d0"), (1, "u1", "matched", "itunes", "i1"), (2, "u0", "matched", "deezer", "dup"),
        (3, "u2", "unmatched", None, None)])
    con.commit()
    con = sqlite3.connect(exp / "features.sqlite")
    con.execute("CREATE TABLE tracks(row INTEGER, track_idx INTEGER, prio INTEGER, status TEXT, error TEXT, source TEXT, "
                "track_id TEXT, clip_s REAL, effnet BLOB)")
    clips = [(0, i, p, "ok", None, "deezer", f"d0-{i}", 30.0, to_blob(fake_emb(f"d0-{i}"))) for p, i in enumerate((0, 4, 2, 6, 1))]
    clips += [(1, 0, 0, "ok", None, "itunes", "i1-0", 30.0, to_blob(fake_emb("i1-0"))),
              (1, 1, 1, "too_short", "4.0 s", "itunes", "i1-1", 4.0, None), (1, 2, None, "no_preview", None, "itunes", "i1-2", None, None),
              (1, 3, 2, "download_failed", "HTTP 200, 10 bytes", "itunes", "i1-3", None, None),
              (1, 4, 3, "download_failed", "ConnectionError", "itunes", "i1-4", None, None),
              (2, 0, 0, "ok", None, "deezer", "dup-0", 30.0, to_blob(fake_emb("dup-0")))]
    con.executemany("INSERT INTO tracks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", clips)
    con.commit()
    cache = ClipCache(tmp_path / "clips.sqlite")
    assert experiment.import_experiment(cache, tmp_path / "table.pkl", exp) == 10  # row 2 is a dropped duplicate
    assert cache.mean("u0", "deezer", "d0", 8)[1] == 5 and cache.mean("u1", "itunes:us", "i1", 8)[1] == 1
    assert [c["status"] for c in cache.album("u1", "itunes:us", "i1")] == [
        "ok", "too_short", "no_preview", "download_failed", "no_preview"]  # by rank; an empty preview is final

    from rmr_pipeline.audio_store import init_store
    audio = tmp_path / "audio"
    init_store(audio, embed.MODEL, {"per_album": 4})
    means = [np.mean([fake_emb(f"d0-{i}").astype(np.float64) for i in (0, 2, 4, 6)], axis=0), fake_emb("i1-0")]
    append_shard(audio, ["u0", "u1"], np.stack(means), [4, 1], ["deezer", "itunes:us"], note="first")
    assert experiment.check_first_shard(cache, audio) == 2
    cache.put([{"key": "u1", "source": "itunes:us", "album_id": "i1", "track_id": "i1-0", "track_idx": 0, "prio": 0,
                "status": "ok", "emb": to_blob(fake_emb("other"))}])
    with pytest.raises(AssertionError, match="u1"):
        experiment.check_first_shard(cache, audio)
    assert experiment.check_first_shard(cache, tmp_path / "compacted") is None


def test_model_file_is_checked_before_it_is_kept(tmp_path, monkeypatch):
    import hashlib

    good = {".pb": b"graph", ".json": b"{}"}
    monkeypatch.setattr(embed, "MODEL_SHA256", {ext: hashlib.sha256(body).hexdigest() for ext, body in good.items()})
    monkeypatch.setattr(embed, "EXPERIMENT_MODELS", tmp_path / "nowhere")
    asked = []

    def fetch(url, dest, body=None):
        asked.append(url)
        dest.write_bytes(body or good["." + url.rsplit(".", 1)[1]])

    with pytest.raises(IOError, match="checksum"):
        embed.ensure_model(tmp_path / "models", fetch=lambda url, dest: fetch(url, dest, b"truncated"))
    assert not list((tmp_path / "models").iterdir())
    assert embed.ensure_model(tmp_path / "models", fetch=fetch).read_bytes() == b"graph"
    assert asked[1:] == [embed.MODEL_URL + embed.MODEL + ".pb", embed.MODEL_URL + embed.MODEL + ".json"]
    embed.ensure_model(tmp_path / "models", fetch=None)  # both files are there and right: nothing is fetched
    monkeypatch.setattr(embed, "EXPERIMENT_MODELS", tmp_path / "models")
    assert embed.ensure_model(tmp_path / "copy", fetch=None).read_bytes() == b"graph"  # copied from the experiment


def test_committed_store_is_readable_here():
    """The store module works under this environment's numpy too."""
    s = load_store(DEFAULT_AUDIO)
    assert s.emb.dtype == np.float16 and len(s.keys) == len(set(s.keys.tolist())) > 3900
    assert load_manifest(DEFAULT_AUDIO)["model"] == embed.MODEL
