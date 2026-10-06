import pytest

import rmr_pipeline.audio_store as store
from rmr_pipeline.audio import DEFAULT_CATALOG, audio_block
from rmr_pipeline.build import main, parse_args
from rmr_pipeline.constants import DEFAULT_OUT


def test_catalog_needs_an_out_folder_that_is_not_the_sites(capsys, tmp_path):
    with pytest.raises(SystemExit):
        parse_args(["--map-root", "map", "--catalog"])
    assert "--out" in capsys.readouterr().err
    for out in (DEFAULT_OUT, DEFAULT_OUT / "sub"):
        with pytest.raises(SystemExit):
            parse_args(["--map-root", "map", "--catalog", "--skip-images", "--out", str(out)])
        assert "go-ahead" in capsys.readouterr().err
    assert parse_args(["--map-root", "map", "--catalog", "--out", str(tmp_path)]).out == tmp_path


def test_catalog_defaults(tmp_path):
    args = parse_args(["--map-root", "map", "--catalog", "--out", str(tmp_path)])
    assert args.audio_dir == store.STORES["effnet10k"] and store.SITE_MODEL == "effnet"
    assert (args.descriptor_weights, args.existing_descriptors) == ("rank", "table-novocals")
    assert args.catalog_path == DEFAULT_CATALOG
    args = parse_args(["--map-root", "map", "--catalog", "--out", str(tmp_path), "--audio-dir", "x",
                       "--descriptor-weights", "slope", "--existing-descriptors", "sheet"])
    assert (args.audio_dir.name, args.descriptor_weights, args.existing_descriptors) == ("x", "slope", "sheet")


def test_the_catalog_flags_need_catalog(capsys):
    assert not parse_args(["--map-root", "map"]).catalog
    for flag in (["--descriptor-weights", "equal"], ["--existing-descriptors", "table"], ["--catalog-path", "x.csv"]):
        with pytest.raises(SystemExit):
            parse_args(["--map-root", "map", *flag])
        assert "need --catalog" in capsys.readouterr().err
    with pytest.raises(SystemExit):
        parse_args(["--map-root", "map", "--catalog", "--out", "x", "--descriptor-weights", "loud"])


def test_the_whole_catalog_with_images_is_refused_for_now(tmp_path, capsys):
    """10,467 albums do not fit the one thumbnail sheet: the build stops before computing anything."""
    root = tmp_path / "map"
    (root / "public" / "data").mkdir(parents=True)
    (root / "pipeline" / "outputs").mkdir(parents=True)
    import json

    import pandas as pd

    from rmr_pipeline.table import dedupe_table, load_table

    sub, _ = dedupe_table(load_table())
    (root / "public" / "data" / "metadata.json").write_text(
        json.dumps([{"id": u, "clusterId": 0} for u in sub["URI"]]), encoding="utf-8")
    pd.DataFrame({"spotify_uri": [], "cover_url": []}).to_parquet(root / "pipeline" / "outputs" / "spotify_features.parquet")
    for i in range(4):
        (root / "public" / "data" / f"atlas-{i}.webp").write_bytes(b"")
    out = tmp_path / "out"
    assert main(["--map-root", str(root), "--catalog", "--out", str(out)]) == 1
    assert "not possible yet" in capsys.readouterr().err and not out.exists()


def test_the_audio_block_takes_explicit_keys(deduped, audio):
    """The catalog build passes RYM ids; the same keys by hand give the block the URIs give."""
    from rmr_pipeline.audio import album_keys

    sub, _ = deduped
    keys = album_keys(sub, store.site_store())
    by_key = audio_block(sub.drop(columns=["URI"]), store.site_store(), keys)
    assert (by_key.block == audio.block).all() and (by_key.has_audio == audio.has_audio).all()
    with pytest.raises(ValueError, match="keys for"):
        audio_block(sub, store.site_store(), keys[:-1])
