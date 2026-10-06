import contextlib
import io
import json

import numpy as np
import pandas as pd
import pytest

import rmr_pipeline.audio_store as store
from rmr_pipeline.audio import DEFAULT_CATALOG, audio_block
from rmr_pipeline.audio_store import load_store
from rmr_pipeline.build import ambient_colours, listen_links, main, parse_args
from rmr_pipeline.catalog import load_catalog
from rmr_pipeline.constants import DEFAULT_OUT
from rmr_pipeline.validate import validate_dir


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


def test_require_sprites_is_a_catalog_flag(capsys, tmp_path):
    assert not parse_args(["--map-root", "map", "--catalog", "--out", str(tmp_path)]).require_sprites
    assert parse_args(["--map-root", "map", "--catalog", "--out", str(tmp_path), "--require-sprites"]).require_sprites
    with pytest.raises(SystemExit):
        parse_args(["--map-root", "map", "--require-sprites"])
    assert "needs --catalog" in capsys.readouterr().err


def test_listen_links_are_for_the_albums_with_no_spotify_id():
    catalog = pd.DataFrame({
        "rym_id": ["Album1", "Album2", "Album3", "Album4"],
        "deezer_url": ["https://www.deezer.com/album/11", "https://www.deezer.com/album/22", "", "https://www.deezer.com/artist/4"],
        "bandcamp_url": ["", "https://someone.bandcamp.com/album/two", "", "https://someone.bandcamp.com/music"],
        "youtube_url": ["", "", "", ""],
    })  # no Apple or SoundCloud column: an empty link
    links, line = listen_links(catalog, ["0" * 22, "", "", ""])
    assert links == {1: {"bc": "someone.bandcamp.com/album/two", "dz": "22"}}
    assert list(links[1]) == ["bc", "dz"]
    assert line == ("links: 3 albums with no Spotify id, 1 with other links (am 0, bc 1, dz 1, yt 0, sc 0), 2 with none; "
                    "2 link(s) left out as not of their service's form (bc 1, dz 1)")
    assert listen_links(catalog, ["0" * 22] * 4)[0] == {}


def test_ambient_colours_come_from_a_sprite_that_is_the_albums_cover(tmp_path):
    from PIL import Image

    from rmr_pipeline.colors import ambient_from_image
    from rmr_pipeline.constants import FALLBACK_AMBIENT

    red = Image.new("RGB", (96, 96), (200, 30, 30))
    sprites = [red] * 5
    covers = ["a" * 40, "", "dz:" + "a" * 32, "dz:" + "a" * 32, ""]
    uris = ["spotify:album:x", "spotify:album:y", "", "", ""]  # the last three: catalog albums the map does not have
    out = ambient_colours(sprites, covers, uris, [0, 1, 2, 3, 4], {3: tmp_path / "sprite.jpg"})
    from_cover = ambient_from_image(red, 0)
    assert out == [from_cover, FALLBACK_AMBIENT[1], FALLBACK_AMBIENT[2], from_cover, FALLBACK_AMBIENT[1]]


def _fake_map(root, uris):
    """A map root good for --skip-images: every album of the feature table, no covers, no atlases."""
    (root / "public" / "data").mkdir(parents=True)
    (root / "pipeline" / "outputs").mkdir(parents=True)
    (root / "public" / "data" / "metadata.json").write_text(
        json.dumps([{"id": u, "clusterId": i % 8} for i, u in enumerate(uris)]), encoding="utf-8")
    pd.DataFrame({"spotify_uri": [], "cover_url": []}).to_parquet(root / "pipeline" / "outputs" / "spotify_features.parquet")
    return root


def test_require_sprites_stops_the_build_when_a_cover_has_no_sprite(deduped, tmp_path, capsys, monkeypatch):
    import rmr_pipeline.covers as cv

    root = _fake_map(tmp_path / "map", deduped[0]["URI"])
    first_new = load_catalog()["rym_id"].iloc[len(deduped[0])]
    monkeypatch.setattr(cv, "_default_covers", lambda: cv.Covers({first_new: ("bandcamp", "123")}, tmp_path / "96"))
    out = tmp_path / "out"
    assert main(["--map-root", str(root), "--catalog", "--skip-images", "--require-sprites", "--out", str(out)]) == 1
    printed = capsys.readouterr()
    assert "1 with a cover, 0 with a sprite, 1 with a cover and no sprite yet" in printed.out and first_new in printed.out
    assert "--require-sprites: 1 new album(s)" in printed.err and not out.exists()


@pytest.fixture(scope="module")
def catalog_build(deduped, tmp_path_factory):
    """The whole catalog built without images (about a minute), with the committed covers table."""
    tmp = tmp_path_factory.mktemp("catalog_build")
    root, out = _fake_map(tmp / "map", deduped[0]["URI"]), tmp / "out"
    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        assert main(["--map-root", str(root), "--catalog", "--skip-images", "--out", str(out)]) == 0
    read = {name: json.loads((out / f"{name}.json").read_text(encoding="utf-8")) for name in ("albums", "recs", "positions")}
    return read["albums"], read["recs"], read["positions"], stdout.getvalue(), out


def test_the_catalog_build_validates_and_keeps_the_sites_albums_first(catalog_build, deduped):
    albums, _, _, printed, out = catalog_build
    catalog = load_catalog()
    assert len(albums) == len(catalog) > 10000
    summary = validate_dir(out, images=False)
    assert summary["albums"] == len(albums) and summary["no_audio"] == sum("n" in a for a in albums)
    site = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    assert [a["slug"] for a in albums[:len(site)]] == [a["slug"] for a in site]
    assert not list(out.glob("*.webp"))
    assert "imputed" not in printed


def test_the_catalog_builds_albums_without_audio_are_mood_only(catalog_build, deduped):
    albums, recs, positions, printed, _ = catalog_build
    n_site = len(deduped[0])
    catalog = load_catalog()
    has_audio = load_store(store.STORES["effnet10k"]).rows(list(catalog["rym_id"])) >= 0
    assert ["n" in a for a in albums] == (~has_audio).tolist() and not has_audio.all()
    assert all(a["n"] == 1 for a in albums if "n" in a)
    quiet = set(np.flatnonzero(~has_audio).tolist())
    for stop in ("sonic", "balanced"):
        assert all((row == []) == (i in quiet) for i, row in enumerate(recs[stop]))
        assert not quiet & {j for row in recs[stop] for j in row}
    assert all(len(row) == 10 for row in recs["mood"])
    assert quiet & {j for row in recs["mood"] for j in row}  # they are recommended on the mood side
    for stop in ("sonic", "balanced", "mood"):
        E = np.array(positions[stop]).reshape(-1, 2)
        assert len(E) == len(albums) and len({tuple(p) for p in E.tolist()}) == len(albums)
    line = (f"{int(has_audio.sum())} albums with audio, {len(quiet)} without (mood side only)")
    split = f"the albums without audio: {int((~has_audio[:n_site]).sum())} existing / {int((~has_audio[n_site:]).sum())} new"
    assert line in printed and split in printed


def test_the_catalog_builds_derived_positions_sit_among_their_mood_neighbours(catalog_build, deduped):
    """An album without audio is at the mean of its three nearest albums with audio by descriptors, give or
    take the spreading of stacked points."""
    from rmr_pipeline.audio import descriptors
    from rmr_pipeline.catalog import catalog_frame
    from rmr_pipeline.layout import nearest_with_audio

    albums, _, positions, _, _ = catalog_build
    cat = catalog_frame(deduped[0], load_catalog())
    has_audio = np.array(["n" not in a for a in albums])
    near = nearest_with_audio(descriptors(cat.frame), has_audio)
    idx = np.flatnonzero(has_audio)
    for stop in ("sonic", "balanced"):
        E = np.array(positions[stop]).reshape(-1, 2)
        off = np.linalg.norm(E[~has_audio] - E[idx[near]].mean(axis=1), axis=1)
        assert np.median(off) < 0.002 and off.max() < 0.02


def test_the_catalog_builds_links_and_covers(catalog_build, deduped):
    from rmr_pipeline.covers import cover_for
    from rmr_pipeline.links import LINK_COLUMNS, album_links

    albums, _, _, printed, _ = catalog_build
    n_site = len(deduped[0])
    rows = load_catalog().to_dict("records")
    for a, row in zip(albums, rows):
        links = album_links(row)[0] if a["s"] == "" else {}
        assert a.get("l", {}) == links and ("l" in a) == bool(links)
        assert list(a)[:8] == ["slug", "t", "a", "s", "c", "k", "d", "w"] and list(a)[8:] == [k for k in ("l", "n") if k in a]
        assert len(a["d"]) <= 8
    assert sum("l" in a for a in albums) > 500
    assert set().union(*(a["l"] for a in albums if "l" in a)) <= set(LINK_COLUMNS)
    assert [a["c"] for a in albums[n_site:]] == [cover_for(row["rym_id"])[0] for row in rows[n_site:]]
    assert any(a["c"].startswith(("dz:", "am:")) for a in albums[n_site:])
    assert "links: " in printed and "covers: " in printed


def test_the_audio_block_takes_explicit_keys(deduped, audio):
    """The catalog build passes RYM ids; the same keys by hand give the block the URIs give."""
    from rmr_pipeline.audio import album_keys

    sub, _ = deduped
    keys = album_keys(sub, store.site_store())
    by_key = audio_block(sub.drop(columns=["URI"]), store.site_store(), keys)
    assert (by_key.block == audio.block).all() and (by_key.has_audio == audio.has_audio).all()
    with pytest.raises(ValueError, match="keys for"):
        audio_block(sub, store.site_store(), keys[:-1])
