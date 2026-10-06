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
    assert (args.descriptor_weights, args.existing_descriptors) == ("slope", "table-novocals")
    assert args.catalog_path == DEFAULT_CATALOG
    args = parse_args(["--map-root", "map", "--catalog", "--out", str(tmp_path), "--audio-dir", "x",
                       "--descriptor-weights", "rank", "--existing-descriptors", "sheet"])
    assert (args.audio_dir.name, args.descriptor_weights, args.existing_descriptors) == ("x", "rank", "sheet")


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


def _covers_table(new_keys, sprite_dir):
    """A covers table of the test's own: one new album per source, every sixth new album after them with a
    Deezer cover, the others without a row. No sprite: the build is run without images."""
    import rmr_pipeline.covers as cv

    rows = dict(zip(new_keys, [("spotify", "ab67616d0000b273" + "1" * 24), ("deezer", "0f" * 16),
                               ("apple", "Music118/v4/d4/10/5d/d4105dcd-73d6-d4cd-4168-ab63f8255340/00600753264645.rgb.jpg"),
                               ("bandcamp", "2980782782"), ("youtube", "mnjH-ZYe59c")]))
    rows |= {key: ("deezer", f"{i:032x}") for i, key in enumerate(new_keys[5::6])}
    return cv.Covers(rows, sprite_dir)


RELINKED: dict = {}  # the two existing albums the catalog_build fixture gives a row: rym_id -> (source, ref)


@pytest.fixture(scope="module")
def catalog_build(deduped, tmp_path_factory):
    """The whole catalog built without images (about a minute). The covers table is the test's own
    (_covers_table), so the build does not depend on the committed covers.csv, on the sprites this machine
    has fetched, or on their manifest; the committed table has its own test below."""
    import rmr_pipeline.covers as cv

    tmp = tmp_path_factory.mktemp("catalog_build")
    root, out = _fake_map(tmp / "map", deduped[0]["URI"]), tmp / "out"
    table = _covers_table(list(load_catalog()["rym_id"].iloc[len(deduped[0]):]), tmp / "96")
    # The build's table has two rows more: the first two existing albums whose Spotify link on the sheet is
    # another release, the first with a sprite of its new cover, the second without one.
    first, second = [r["rym_id"] for r in cv.relinked_albums()][:2]
    RELINKED.update({first: ("spotify", "ab67616d0000b273" + "2" * 24), second: ("spotify", "ab67616d0000b273" + "3" * 24)})
    (tmp / "96").mkdir()
    (tmp / "96" / f"{first}.jpg").write_bytes(b"jpeg")
    built_with = cv.Covers({**RELINKED, **table.rows}, tmp / "96", made_from={first: cv.made_from(RELINKED[first])})
    stdout = io.StringIO()
    with pytest.MonkeyPatch.context() as patch, contextlib.redirect_stdout(stdout):
        patch.setattr(cv, "_default_covers", lambda: built_with)
        assert main(["--map-root", str(root), "--catalog", "--skip-images", "--out", str(out)]) == 0
    read = {name: json.loads((out / f"{name}.json").read_text(encoding="utf-8")) for name in ("albums", "recs", "positions")}
    return read["albums"], read["recs"], read["positions"], stdout.getvalue(), out, table


def test_the_catalog_build_validates_and_keeps_the_sites_albums_first(catalog_build, deduped):
    albums, _, _, printed, out, _ = catalog_build
    catalog = load_catalog()
    assert len(albums) == len(catalog) > 10000
    summary = validate_dir(out, images=False)
    assert summary["albums"] == len(albums) and summary["no_audio"] == sum("n" in a for a in albums)
    site = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    assert [a["slug"] for a in albums[:len(site)]] == [a["slug"] for a in site]
    assert not list(out.glob("*.webp"))
    assert "imputed" not in printed


def test_the_catalog_build_shows_bracketed_artists_and_keeps_the_slugs_of_the_latin_forms(catalog_build, deduped):
    from rmr_pipeline.catalog import catalog_frame, display_artist, display_title
    from rmr_pipeline.slugs import MAX_SLUG_BYTES, make_slugs

    albums, _, _, printed, _, _ = catalog_build
    catalog, n_site = load_catalog(), len(deduped[0])
    new = catalog.iloc[n_site:]
    shown = [display_artist(a, b) for a, b in zip(new["artist"], new["artist_latin"])]
    assert [a["a"] for a in albums[n_site:]] == shown
    # titles too, since the owner's decision of 6 October 2026 (this line said they stay as the catalog has them)
    shown_titles = [display_title(a, b) for a, b in zip(new["title"], new["title_latin"])]
    assert [a["t"] for a in albums[n_site:]] == shown_titles
    assert [a["t"] for a in albums[:n_site]] == [str(t) for t in deduped[0]["Title"]]  # an existing album's is not touched
    changed = sum(s != t for s, t in zip(shown_titles, new["title"]))
    assert changed == 456 and f"titles: {changed} new albums shown as native [Latin]" in printed
    assert any(a["t"] == "ヴィジョン クリエイション ニューサン [Vision Creation Newsun]" for a in albums[n_site:])
    by_key = dict(zip(catalog["rym_id"], albums))
    parannoul = next(a for a in albums[n_site:] if a["a"].startswith("파란노을 ["))
    assert parannoul["a"] == "파란노을 [Parannoul]" and parannoul["slug"].endswith("-parannoul")
    assert f"artists: {sum(s != a for s, a in zip(shown, new['artist']))} new albums shown as native [Latin]" in printed
    # the slugs are what they were before the bracketed form: made from the romanised title and artist
    cat = catalog_frame(deduped[0], catalog)
    site = [a["a"] for a in albums[:n_site]]
    # (a new album's within slugs.MAX_SLUG_BYTES: a slug is a file name on the host)
    before = make_slugs(cat.slug_titles, site + cat.slug_artists[n_site:], cap_from=n_site)
    assert [a["slug"] for a in albums[n_site:]] == before[n_site:] and len(by_key) == len(albums)
    assert max(len(a["slug"]) for a in albums[n_site:]) <= MAX_SLUG_BYTES
    assert "slugs: 17 new album(s) have a slug cut to 120 bytes or fewer" in printed


def test_the_catalog_builds_albums_without_audio_are_mood_only(catalog_build, deduped):
    albums, recs, positions, printed, _, _ = catalog_build
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
    from rmr_pipeline.catalog import DEFAULT_EXISTING, DEFAULT_WEIGHTS, catalog_frame
    from rmr_pipeline.layout import nearest_with_audio

    albums, _, positions, _, _, _ = catalog_build
    cat = catalog_frame(deduped[0], load_catalog(), weights=DEFAULT_WEIGHTS, existing=DEFAULT_EXISTING)  # the build's
    has_audio = np.array(["n" not in a for a in albums])
    near = nearest_with_audio(descriptors(cat.frame), has_audio)
    idx = np.flatnonzero(has_audio)
    for stop in ("sonic", "balanced"):
        E = np.array(positions[stop]).reshape(-1, 2)
        off = np.linalg.norm(E[~has_audio] - E[idx[near]].mean(axis=1), axis=1)
        assert np.median(off) < 0.002 and off.max() < 0.02


def test_the_catalog_builds_links_and_covers(catalog_build, deduped):
    from rmr_pipeline.links import LINK_COLUMNS, album_links

    albums, _, _, printed, _, table = catalog_build
    n_site = len(deduped[0])
    rows = load_catalog().to_dict("records")
    for a, row in zip(albums, rows):
        links = album_links(row)[0] if a["s"] == "" else {}
        assert a.get("l", {}) == links and ("l" in a) == bool(links)
        assert list(a)[:8] == ["slug", "t", "a", "s", "c", "k", "d", "w"] and list(a)[8:] == [k for k in ("l", "n") if k in a]
        assert len(a["d"]) <= 8
    assert sum("l" in a for a in albums) > 500
    assert set().union(*(a["l"] for a in albums if "l" in a)) <= set(LINK_COLUMNS)
    assert [a["c"] for a in albums[n_site:]] == [table.cover_for(row["rym_id"])[0] for row in rows[n_site:]]
    assert [a["c"].partition(":")[0] for a in albums[n_site:n_site + 5]] == ["ab67616d0000b273" + "1" * 24, "dz", "am", "bc", "yt"]
    with_cover = sum(1 for a in albums[n_site:] if a["c"])
    assert with_cover == len(table.rows) and 0 < with_cover < len(albums) - n_site  # some new albums have no cover
    assert "links: " in printed
    assert (f"covers: {len(albums) - n_site} new albums, {with_cover} with a cover, 0 with a sprite, {with_cover} with a "
            "cover and no sprite yet") in printed
    assert f"WARNING, covers: {with_cover} new album(s) have a cover and no sprite" in printed


def test_the_catalog_builds_existing_albums_link_where_the_sheet_links(catalog_build, deduped):
    """The owner's decision of 6 October 2026: the sheet's Spotify link wins over the feature table's URI, an
    override over both; an album whose link changed takes the cover of its new release when covers.csv has
    it and its sprite is there, and keeps the map's cover (none, on the test's map) otherwise."""
    from rmr_pipeline.catalog import catalog_frame
    from rmr_pipeline.constants import DEFAULT_OVERRIDES

    albums, _, _, printed, _, _ = catalog_build
    n_site, catalog = len(deduped[0]), load_catalog()
    cat = catalog_frame(deduped[0], catalog)
    overrides = json.loads(DEFAULT_OVERRIDES.read_text(encoding="utf-8"))
    legacy = [u.split(":")[-1] for u in deduped[0]["URI"]]
    assert cat.legacy_ids[:n_site] == legacy and not any(cat.legacy_ids[n_site:])
    by_override = [i for i in range(n_site) if albums[i]["s"] != cat.spotify_ids[i]]
    assert 0 < len(by_override) <= len(overrides)
    assert {albums[i]["s"] for i in by_override} <= {e["s"] for e in overrides.values() if "s" in e}
    assert {e["s"] for e in overrides.values() if "s" in e} <= {a["s"] for a in albums[:n_site]}  # every override holds
    no_link = [i for i in range(n_site) if not catalog["spotify_url"].iloc[i] and i not in by_override]
    assert len(no_link) > 400 and all(albums[i]["s"] == legacy[i] for i in no_link)
    moved = [i for i in range(n_site) if albums[i]["s"] != legacy[i] and i not in by_override]
    assert len(moved) > 1000 and all(albums[i]["s"] in catalog["spotify_url"].iloc[i] for i in moved)
    # covers: the album with a row and a sprite shows its new release; the one with a row alone, and every
    # other one, keeps what the map gave it
    (first, cover), (second, _) = RELINKED.items()
    index = {k: i for i, k in enumerate(cat.keys)}
    assert albums[index[first]]["c"] == cover[1] and albums[index[second]]["c"] == ""
    held = {e["c"] for e in overrides.values() if "c" in e}
    assert {a["c"] for i, a in enumerate(albums[:n_site]) if i != index[first]} <= held | {""}
    relinked = len(cv_relinked())
    assert f"for {relinked} it is another id than the table's" in printed
    assert "existing albums link to another release: 1 take its cover" in printed
    assert "WARNING, covers: 1 existing album(s) whose Spotify link changed have a cover in covers.csv and no sprite" in printed
    assert "spotify ids: 32 were shared by more than one album with the feature table's ids" in printed
    assert all("l" not in a for i, a in enumerate(albums[:n_site]) if a["s"])


def cv_relinked():
    import rmr_pipeline.covers as cv

    return cv.relinked_albums()


def test_the_committed_covers_table_parses_and_every_row_is_a_cover_id_the_validator_accepts():
    """catalog/covers.csv itself (the build above does not read it): it parses, each row is a new album of
    the catalog or an existing one whose Spotify link on the sheet is another release, at most one per album, and gives a `c` of the form validate.py accepts and a URL on an
    allowed host. Nothing here depends on the sprites or on the network."""
    import csv

    import rmr_pipeline.covers as cv
    from rmr_pipeline.validate import COVER_RE, PREFIXED_COVER_RE

    with cv.DEFAULT_COVERS.open(encoding="utf-8", newline="") as f:
        listed = [r["rym_id"] for r in csv.DictReader(f)]
    rows = cv.read_covers(cv.DEFAULT_COVERS)
    assert len(rows) == len(listed) > 0  # no album twice
    # The rows were of new albums only until the owner's decision of 6 October 2026 (the sheet's link wins
    # for an existing album, and its cover follows): now also the relinked existing albums, which come first.
    looked_up = [r["rym_id"] for r in cv.cover_albums()]
    assert set(rows) <= set(looked_up) and list(rows) == [k for k in looked_up if k in rows]  # in catalog order
    assert {rows[r["rym_id"]][0] for r in cv.relinked_albums() if r["rym_id"] in rows} <= {"spotify"}
    for key, (source, ref) in rows.items():
        c = cv.c_field(source, ref)
        assert (COVER_RE if source == "spotify" else PREFIXED_COVER_RE).fullmatch(c), (key, c)
        assert cv.allowed(cv.sprite_url(source, ref)) and cv.allowed(cv.cover_url(c, 640)), key
        assert cv.sprite_path(cv.DEFAULT_SPRITES, key).name == f"{key}.jpg"  # the key is a file name
    assert cv.load_covers(cv.DEFAULT_COVERS, cv.DEFAULT_SPRITES.with_name("no-such-folder")).cover_for(listed[0])[0]


def test_the_audio_block_takes_explicit_keys(deduped, audio):
    """The catalog build passes RYM ids; the same keys by hand give the block the URIs give."""
    from rmr_pipeline.audio import album_keys

    sub, _ = deduped
    keys = album_keys(sub, store.site_store())
    by_key = audio_block(sub.drop(columns=["URI"]), store.site_store(), keys)
    assert (by_key.block == audio.block).all() and (by_key.has_audio == audio.has_audio).all()
    with pytest.raises(ValueError, match="keys for"):
        audio_block(sub, store.site_store(), keys[:-1])


def test_only_the_catalog_build_letters_its_tiles():
    from rmr_pipeline.build import sprite_titles

    assert sprite_titles(False, ["Chill Out"]) is None  # the default build: flat tiles, the bytes it always wrote
    assert sprite_titles(True, ["Chill Out"]) == ["Chill Out"]
