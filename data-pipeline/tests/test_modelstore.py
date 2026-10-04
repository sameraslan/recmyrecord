"""The CLAP store: written whole from the one-pass clip cache (rmr_audio.modelstore), fitted on the whole
catalog (rmr_pipeline.audio fit-catalog), and never in the way of the EffNet store. Runs in both venvs:
only numpy and the standard library."""
import csv
import hashlib
import shutil

import numpy as np
import pytest

from rmr_audio import modelstore
from rmr_audio.onepass_cache import MODELS, OnePassCache
from rmr_pipeline.audio import (BLOCK_DIMS, audio_block, catalog_keys, load_transform, main as audio_main, refit_catalog,
                                save_transform, fit_transform)
from rmr_pipeline.audio_store import DEFAULT_AUDIO, MATCH_FIELDS, STORES, StoreError, load_store, write_matches

CLAP = MODELS["clap"]


def _vec(tag: str) -> np.ndarray:
    seed = int(hashlib.sha256(tag.encode()).hexdigest()[:8], 16)
    return np.random.default_rng(seed).normal(size=CLAP.dim).astype("<f4")


def _put(cache, key, source, album_id, clips, model="clap"):
    """clips: (rank, status) per clip of one listing; the track id is t<rank>."""
    for rank, status in clips:
        rec = {"key": key, "source": source, "album_id": album_id, "track_id": f"t{rank}", "track_idx": rank,
               "prio": rank, "clip_s": 30.0}
        cache.put_clip(rec)
        emb = (_vec(f"{key}/{source}/{album_id}/t{rank}").tobytes() if model == "clap"
               else np.ones(MODELS[model].dim, MODELS[model].dtype).tobytes())
        cache.put_result(rec, model, status, emb=emb if status == "ok" else None, clip_s=30.0)


def _mean(key, source, album_id, ranks) -> np.ndarray:
    return np.stack([_vec(f"{key}/{source}/{album_id}/t{r}") for r in ranks]).astype(np.float64).mean(axis=0)


@pytest.fixture
def world(tmp_path):
    """A small cache, catalog and matches.csv, and an outer store folder with an EffNet-like transform."""
    cache = OnePassCache(tmp_path / "onepass.sqlite")
    ok4 = [(r, "ok") for r in range(4)]
    _put(cache, "Album1", "deezer", "d1", ok4 + [(4, "ok"), (5, "ok")])  # six cached: the first four count
    _put(cache, "Album2", "itunes:jp", "i2", [(0, "ok"), (1, "too_short"), (2, "ok"), (3, "ok"), (4, "ok")])  # one replaced
    _put(cache, "Album3", "deezer", "d3", [(0, "ok"), (1, "ok")])  # a short listing: two clips
    _put(cache, "Album4", "deezer", "d4", [(0, "no_preview")])  # nothing usable: no audio
    _put(cache, "Album5", "deezer", "d5-other", [(0, "ok")])  # two listings: matches.csv names the second
    _put(cache, "Album5", "deezer", "d5", ok4)
    _put(cache, "Album6", "deezer", "d6-old", ok4)  # matches.csv names a listing with no ok clip: the other is used
    _put(cache, "Album6", "deezer", "d6", [(0, "no_preview")])
    _put(cache, "sp:gone", "deezer", "d9", ok4)  # in the cache, not in the catalog
    _put(cache, "Album1", "deezer", "d1", ok4, model="effnet")  # another model's rows are not read
    _put(cache, "Album7", "deezer", "d7", ok4, model="effnet")  # EffNet only: no CLAP audio
    cache.close()
    catalog = tmp_path / "albums.csv"
    with open(catalog, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rym_id", "title"])
        w.writerows([[k, k] for k in ("Album3", "Album1", "Album2", "Album4", "Album5", "Album6", "Album7", "Album8")])
    matches = tmp_path / "audio" / "matches.csv"
    row = lambda key, source, album_id: dict.fromkeys(MATCH_FIELDS, "") | {  # noqa: E731
        "key": key, "source": source, "source_album_id": album_id, "ambiguous": "0"}
    write_matches(matches, [row("Album1", "deezer", "d1"), row("Album2", "itunes:jp", "i2"), row("Album3", "deezer", "d3"),
                            row("Album4", "deezer", "d4"), row("Album5", "deezer", "d5"), row("Album6", "deezer", "d6"),
                            row("Album8", "", "")])
    return tmp_path


def _write(world, **kw):
    lines = []
    code = modelstore.write(cache_db=world / "onepass.sqlite", catalog=world / "albums.csv",
                            matches=world / "audio" / "matches.csv", audio_dir=world / "audio" / "clap",
                            out=lines.append, **kw)
    return code, lines


def test_the_store_is_the_catalogs_albums_with_clap_audio_pooled_by_rank(world):
    code, lines = _write(world)
    store = load_store(world / "audio" / "clap")
    assert code == 0 and store.manifest["model"] == CLAP.model_id and store.dim == 512
    assert store.manifest["clips"]["per_album"] == 4 and "first 4 ok clips in rank order" in store.manifest["pooling"]
    assert store.keys.tolist() == ["Album3", "Album1", "Album2", "Album5", "Album6"]  # catalog order; no audio: left out
    assert store.n_clips.tolist() == [2, 4, 4, 4, 4]
    assert store.source.tolist() == ["deezer", "deezer", "itunes:jp", "deezer", "deezer"]
    want = [_mean("Album3", "deezer", "d3", [0, 1]), _mean("Album1", "deezer", "d1", [0, 1, 2, 3]),
            _mean("Album2", "itunes:jp", "i2", [0, 2, 3, 4]),  # the clip that failed does not use up a place
            _mean("Album5", "deezer", "d5", [0, 1, 2, 3]), _mean("Album6", "deezer", "d6-old", [0, 1, 2, 3])]
    assert np.array_equal(store.emb, np.stack(want).astype(np.float16))  # the float64 mean, kept as float16
    assert any("5 of the catalog's 8 albums have audio; 1 album(s) of the cache are not in the catalog" in x for x in lines)
    assert any(x == "clips per album: 2: 1, 4: 4" for x in lines)


def test_writing_again_changes_nothing_and_a_changed_cache_or_catalog_is_followed(world):
    _write(world)
    files = lambda: {str(p.relative_to(world)): p.read_bytes() for p in (world / "audio").rglob("*") if p.is_file()}  # noqa: E731
    before = files()
    code, lines = _write(world)
    assert code == 0 and files() == before and any("nothing written" in x for x in lines)
    assert _write(world, dry_run=True)[0] == 0 and files() == before
    cache = OnePassCache(world / "onepass.sqlite")  # another job added an album's windows of full-length audio
    _put(cache, "Album8", "local", "", [(r, "ok") for r in range(6)])
    cache.set_listing("Album8", "local", "", 1, 6, n_windows=6)
    cache.close()
    rows = [r for r in csv.reader(open(world / "albums.csv", encoding="utf-8"))]
    with open(world / "albums.csv", "w", newline="", encoding="utf-8") as f:  # and the catalog lost a duplicate row
        csv.writer(f).writerows(r for r in rows if r[0] != "Album5")
    _write(world)
    store = load_store(world / "audio" / "clap")
    assert store.keys.tolist() == ["Album3", "Album1", "Album2", "Album6", "Album8"]
    assert store.source.tolist()[-1] == "local" and store.n_clips.tolist()[-1] == 6  # every window, not four
    assert np.array_equal(store.emb[-1], _mean("Album8", "local", "", range(6)).astype(np.float16))
    assert [p.name for p in (world / "audio" / "clap" / "embeddings").iterdir()] == ["part-0002.npz"]
    assert files()["audio/matches.csv"] == before["audio/matches.csv"]


def test_the_cache_is_only_read_and_the_effnet_store_is_never_the_target(world, capsys):
    digest = lambda: hashlib.sha256((world / "onepass.sqlite").read_bytes()).hexdigest()  # noqa: E731
    before = digest()
    _write(world)
    assert digest() == before and not list(world.glob("onepass.sqlite-*"))
    with pytest.raises(StoreError, match="EffNet store"):
        modelstore.write(cache_db=world / "onepass.sqlite", catalog=world / "albums.csv", audio_dir=DEFAULT_AUDIO)
    assert modelstore.main(["write", "--cache", str(world / "nowhere.sqlite"), "--audio-dir", str(world / "x")]) == 1
    assert "no such cache" in capsys.readouterr().err and not (world / "x").exists()
    assert modelstore.main(["status", "--audio-dir", str(world / "audio" / "clap"), "--catalog", str(world / "albums.csv")]) == 0
    assert "5 of the catalog's 8 albums have audio" in capsys.readouterr().out


def _clap_like(n: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return (rng.normal(size=(n, 12)) @ rng.normal(size=(12, CLAP.dim)) + 0.05 * rng.normal(size=(n, CLAP.dim))) / 40


@pytest.fixture
def clap_store(tmp_path):
    """A store folder like the committed one: the EffNet transform and keys.csv outside, a CLAP store of 300
    albums inside (the feature table's first 200 that the EffNet store has, and 100 new ones)."""
    from rmr_pipeline.audio_store import replace_store

    outer = tmp_path / "audio"
    outer.mkdir()
    for name in ("keys.csv", "transform.npz"):
        shutil.copy(DEFAULT_AUDIO / name, outer / name)
    existing = load_store(DEFAULT_AUDIO).keys.tolist()[:200]
    keys = existing + [f"Album9{i:05d}" for i in range(100)]
    replace_store(outer / "clap", CLAP.model_id, CLAP.dim, {"per_album": 4}, keys, _clap_like(300), [4] * 300, ["deezer"] * 300,
                  note="test")
    catalog = tmp_path / "albums.csv"
    with open(catalog, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([["rym_id"]] + [[k] for k in ["Album8none"] + keys[::-1]])
    return outer, catalog, keys


def test_fit_catalog_fits_on_every_catalog_album_of_the_store_and_keeps_the_target(clap_store, capsys):
    outer, catalog, keys = clap_store
    effnet_before = (outer / "transform.npz").read_bytes()
    target = load_transform(DEFAULT_AUDIO / "transform.npz").target_total_variance
    assert audio_main(["fit-catalog", "--audio-dir", str(outer / "clap"), "--catalog", str(catalog),
                       "--target-from", str(outer)]) == 0
    assert "fitted on 300 catalog albums" in capsys.readouterr().out
    assert (outer / "transform.npz").read_bytes() == effnet_before  # the EffNet transform is not overwritten
    store = load_store(outer / "clap")
    t = load_transform(outer / "clap" / "transform.npz", store.dim)
    assert (t.model, t.albums, t.components.shape, t.mean.shape) == (CLAP.model_id, 300, (BLOCK_DIMS, 512), (512,))
    assert t.target_total_variance == target and t.keys.tolist() == keys[::-1]  # catalog order, the new albums included
    block = t.apply(store.emb)
    assert block.shape == (300, 64) and block.var(axis=0).sum() == pytest.approx(target, rel=1e-4)
    same = refit_catalog(outer / "clap", catalog, outer, fitted=t.fitted)
    assert np.array_equal(same.components, t.components) and same.scale == t.scale
    written = (outer / "clap" / "transform.npz").read_bytes()
    assert audio_main(["fit-catalog", "--audio-dir", str(outer / "clap"), "--catalog", str(catalog),
                       "--target-from", str(outer)]) == 0  # the same fit is not written again
    assert "nothing written" in capsys.readouterr().out and (outer / "clap" / "transform.npz").read_bytes() == written
    with pytest.raises(StoreError, match="needs mean \\(1280,\\)"):  # a CLAP transform does not fit the EffNet store
        load_transform(outer / "clap" / "transform.npz", 1280)
    with pytest.raises(SystemExit):  # no default target: the site's transform is never written by accident
        audio_main(["fit-catalog"])
    assert catalog_keys(catalog)[0] == "Album8none"


def test_too_few_albums_or_a_missing_catalog_fail_clearly(clap_store, tmp_path, capsys):
    outer, catalog, keys = clap_store
    small = tmp_path / "small.csv"
    small.write_text("rym_id\n" + "\n".join(keys[:10]) + "\n", encoding="utf-8")
    assert audio_main(["fit-catalog", "--audio-dir", str(outer / "clap"), "--catalog", str(small), "--target-from", str(outer)]) == 1
    assert "too few to fit 64 components" in capsys.readouterr().err
    assert audio_main(["fit-catalog", "--audio-dir", str(outer / "clap"), "--catalog", str(tmp_path / "no.csv")]) == 1
    assert "the catalog table is not there" in capsys.readouterr().err and not (outer / "clap" / "transform.npz").exists()


def test_the_build_can_read_the_clap_store_when_pointed_at_it(clap_store, deduped):
    """What flipping the switch does: the site's albums found through the outer keys.csv, the block from the
    CLAP transform, albums without CLAP audio imputed. Here on a store of synthetic vectors."""
    outer, catalog, keys = clap_store
    sub, _ = deduped
    with pytest.raises(StoreError, match="transform"):
        audio_block(sub, outer / "clap")
    save_transform(outer / "clap" / "transform.npz", refit_catalog(outer / "clap", catalog, outer))
    audio = audio_block(sub, outer / "clap")
    assert audio.block.shape == (len(sub), 64) and audio.has_audio.sum() == 200 and np.isfinite(audio.block).all()
    assert audio.transform.model == CLAP.model_id and audio.transform.albums == 300
    store = load_store(DEFAULT_AUDIO)  # an EffNet transform on the CLAP store is refused, by width and by model
    shutil.copy(DEFAULT_AUDIO / "transform.npz", outer / "clap" / "transform.npz")
    with pytest.raises(StoreError, match="needs mean \\(512,\\)"):
        audio_block(sub, outer / "clap")
    save_transform(outer / "clap" / "transform.npz", fit_transform(_clap_like(80), 0.39, store.manifest["model"]))
    with pytest.raises(StoreError, match="fitted on 'discogs-effnet-bs1-1' embeddings"):
        audio_block(sub, outer / "clap")


def test_committed_clap_store():
    """The committed CLAP store, once it is there: the catalog's albums only, in catalog order, four clips
    unless the listing has fewer (or windows of full-length audio), and a transform fitted on all of them."""
    clap = STORES["clap"]
    if not (clap / "manifest.json").exists():
        pytest.skip("the CLAP store is not written yet (python -m rmr_audio.modelstore write)")
    store = load_store(clap)
    catalog = catalog_keys()
    rows = store.rows(catalog)
    assert store.manifest["model"] == CLAP.model_id and store.dim == CLAP.dim and len(store.manifest["shards"]) == 1
    assert store.keys.tolist() == [k for k, r in zip(catalog, rows) if r >= 0]
    windows = np.isin(store.source, ["local", "youtube", "bandcamp"])
    assert store.n_clips.min() >= 1 and store.n_clips[~windows].max() <= store.manifest["clips"]["per_album"] == 4
    if (clap / "transform.npz").exists():
        t = load_transform(clap / "transform.npz", store.dim)
        assert t.model == CLAP.model_id and t.components.shape == (BLOCK_DIMS, CLAP.dim)
        assert t.keys.tolist() == store.keys.tolist()
        assert t.target_total_variance == load_transform(DEFAULT_AUDIO / "transform.npz").target_total_variance
