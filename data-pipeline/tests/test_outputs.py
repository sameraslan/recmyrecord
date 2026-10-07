import json
import os
from math import ceil
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import (ATLAS_COLS, ATLAS_PER_SHEET, ATLAS_SPRITE_PX, DEFAULT_OUT, DEFAULT_OVERRIDES,
                                    FALLBACK_AMBIENT, STOPS, THUMB_COLS, THUMB_PER_SHEET, THUMB_ROWS,
                                    THUMB_SPRITE_PX)
from rmr_pipeline.images import SHEET_FILL, crop_uv, lettered_tile, square, thumbs_name, tile_letter
from rmr_pipeline.mapsource import MapSource, load_metadata
from rmr_pipeline.overrides import load_overrides
from rmr_pipeline.slugs import make_slugs
from rmr_pipeline.validate import validate_dir

MAP_ROOT = os.environ.get("RMR_MAP_ROOT", "")
SHEET_PX = ATLAS_COLS * ATLAS_SPRITE_PX
# In Rainbows' first five at the mood stop in the data built on 6 October 2026, at the switch to the 10k
# catalog (album 11; the third is Carrie & Lowell Live, the first and fourth are new albums). Recorded from
# that build, not a list the owner approved: when a build is meant to move it (a store written again, other
# descriptor flags, new albums), record it again from the new recs.json. Until the switch this was
# constants.IN_RAINBOWS_LIVE, the old live recommender's answer, which the mood stop of 4,081 albums still gave.
IN_RAINBOWS_MOOD = ["Glitter", "Have You in My Wilderness", "Carrie & Lowell Live", "Bon Iver, Bon Iver", "Takk..."]


def _albums() -> list[dict]:
    return json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))


def _atlas_cell(i: int) -> np.ndarray:
    sheet, cell = divmod(i, ATLAS_PER_SHEET)
    x, y = (cell % ATLAS_COLS) * ATLAS_SPRITE_PX, (cell // ATLAS_COLS) * ATLAS_SPRITE_PX
    with Image.open(DEFAULT_OUT / f"atlas-{sheet}.webp") as im:
        return np.asarray(im.convert("RGB").crop((x, y, x + ATLAS_SPRITE_PX, y + ATLAS_SPRITE_PX)), dtype=float)


def _thumb_cell(i: int) -> np.ndarray:
    sheet, cell = divmod(i, THUMB_PER_SHEET)
    x, y = (cell % THUMB_COLS) * THUMB_SPRITE_PX, (cell // THUMB_COLS) * THUMB_SPRITE_PX
    with Image.open(DEFAULT_OUT / thumbs_name(sheet)) as im:
        return np.asarray(im.convert("RGB").crop((x, y, x + THUMB_SPRITE_PX, y + THUMB_SPRITE_PX)), dtype=float)


def test_committed_outputs_pass_contract(catalog_albums, catalog_audio):
    """The site's data is the catalog build's: every album of catalog/albums.csv (4,081 albums and 114 words
    until the switch of 6 October 2026), the words the build's default flags give, `n` exactly for the
    albums the site's store has no audio for."""
    from rmr_pipeline.catalog import load_catalog
    from rmr_pipeline.vocab import build_vocab

    summary = validate_dir(DEFAULT_OUT)
    albums = _albums()
    assert summary["albums"] == len(albums) == len(load_catalog()) == len(catalog_albums.keys) > 10000
    vocab, tops = build_vocab(catalog_albums.frame, catalog_albums.places)
    assert json.loads((DEFAULT_OUT / "vocab.json").read_text(encoding="utf-8")) == vocab
    assert summary["vocab"] == len(vocab) and [a["d"] for a in albums] == tops
    assert ["n" in a for a in albums] == (~catalog_audio.has_audio).tolist()
    assert summary["no_audio"] == int((~catalog_audio.has_audio).sum()) > 0
    assert summary["links"] == sum("l" in a for a in albums) > 0


def test_in_rainbows_record_and_recs():
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    recs = json.loads((DEFAULT_OUT / "recs.json").read_text(encoding="utf-8"))
    assert albums[11]["slug"] == "in-rainbows-radiohead"
    assert albums[11]["t"] == "In Rainbows"
    assert albums[11]["a"] == "Radiohead"
    assert "n" not in albums[11] and all(len(recs[stop][11]) == 10 for stop in STOPS)
    # no longer the old live recommender's five (tests/test_recommender.py keeps its replica): 6,386 more
    # candidates, the first 8 descriptors only, slope weights
    assert [albums[i]["t"] for i in recs["mood"][11][:5]] == IN_RAINBOWS_MOOD
    assert albums[42]["slug"] == "vespertine-bjork"
    assert albums[5]["slug"] == "loveless-my-bloody-valentine"


def test_committed_recs_are_what_the_committed_audio_store_gives(catalog_recs):
    """recs.json was built from the site's store (audio_store.SITE_MODEL: data-pipeline/audio/effnet10k) and
    catalog/albums.csv as committed, with the build's default flags: after a store written again, a refit, a
    changed catalog or other flags, rebuild the site data. A row is [] where the album has no list
    (rec_lists), so the rows are compared as lists. (positions.json comes from the same matrix; UMAP is too
    slow to rerun here.)"""
    recs = json.loads((DEFAULT_OUT / "recs.json").read_text(encoding="utf-8"))
    assert sorted(recs) == sorted(STOPS)
    for stop, rows in recs.items():
        assert rows == catalog_recs[stop], stop


def test_committed_artists_are_clean():
    albums = _albums()
    assert [a["a"] for a in albums if clean_artist(a["a"]) != a["a"]] == []
    springsteen = [a for a in albums if a["t"] == "Live in New York City"]
    assert [(a["a"], a["slug"]) for a in springsteen] == [
        ("Bruce Springsteen & the E Street Band", "live-in-new-york-city-bruce-springsteen-and-the-e-street-band")]


def test_sprite_sheets_are_full_size_and_filled_after_the_last_album():
    """One atlas sheet per ATLAS_PER_SHEET albums and one thumbnail sheet per THUMB_PER_SHEET, and no other
    (4 and 1 until the switch to the 10k catalog)."""
    n = len(_albums())
    atlases, thumbs = ceil(n / ATLAS_PER_SHEET), ceil(n / THUMB_PER_SHEET)
    assert n % ATLAS_PER_SHEET and n % THUMB_PER_SHEET  # so the cell after the last album exists
    assert sorted(p.name for p in DEFAULT_OUT.glob("atlas-*.webp")) == sorted(f"atlas-{s}.webp" for s in range(atlases))
    assert sorted(p.name for p in DEFAULT_OUT.glob("thumbs*.webp")) == sorted(thumbs_name(s) for s in range(thumbs))
    for s in range(atlases):
        with Image.open(DEFAULT_OUT / f"atlas-{s}.webp") as sheet:
            assert sheet.size == (SHEET_PX, SHEET_PX)
    for s in range(thumbs):
        with Image.open(DEFAULT_OUT / thumbs_name(s)) as sheet:
            assert sheet.size == (THUMB_COLS * THUMB_SPRITE_PX, THUMB_ROWS * THUMB_SPRITE_PX)
    assert np.abs(_atlas_cell(n) - SHEET_FILL).mean() < 3
    assert np.abs(_thumb_cell(n) - SHEET_FILL).mean() < 3
    assert np.abs(_atlas_cell(n - 1) - SHEET_FILL).mean() > 10
    assert np.abs(_thumb_cell(n - 1) - SHEET_FILL).mean() > 10


@pytest.mark.skipif(not MAP_ROOT, reason="set RMR_MAP_ROOT to the music_map worktree to compare with its atlases")
def test_sprites_match_the_map_atlases_in_album_order(deduped):
    """An existing album whose Spotify id is still the feature table's has the map's sprite (one whose link
    the sheet changed shows the cover of that release: test_new_and_relinked_albums_have_their_own_sprites)."""
    albums = _albums()
    uris = [str(u) for u in deduped[0]["URI"]]
    src = MapSource(Path(MAP_ROOT))
    meta = load_metadata(src)
    kept = [i for i, u in enumerate(uris) if albums[i]["s"] == u.split(":")[-1] and albums[i]["c"]]
    assert len(kept) > 2000 and 11 in kept
    # A wrong cover differs by about 45 on average; WebP loss stays under 5 (atlas) and 11 (48 px thumbnails).
    for i in (kept[0], 11, kept[-1]):  # the first such album, In Rainbows, the last existing one (it was 0, 11, the last album)
        m = meta[uris[i]]
        with Image.open(src.atlas_path(int(m["atlasIndex"]))) as sheet:
            ref = np.asarray(square(crop_uv(sheet, m["atlasUV"]), ATLAS_SPRITE_PX), dtype=float)
        assert np.abs(_atlas_cell(i) - ref).mean() < 10, f"atlas cell {i} is not {albums[i]['t']}"
        small = np.asarray(Image.fromarray(ref.astype(np.uint8)).resize((THUMB_SPRITE_PX, THUMB_SPRITE_PX),
                                                                        Image.Resampling.LANCZOS), dtype=float)
        assert np.abs(_thumb_cell(i) - small).mean() < 20, f"thumbnail cell {i} is not {albums[i]['t']}"


def test_new_and_relinked_albums_have_their_own_sprites(deduped):
    """The sheets past the map's albums, and the existing albums whose link the sheet changed: the cell is the
    album's sprite of .cache/covers/96 (not committed: skipped on a machine that has not fetched them)."""
    import rmr_pipeline.covers as cv

    if not cv.DEFAULT_SPRITES.is_dir():
        pytest.skip("no .cache/covers/96: run python -m rmr_pipeline.covers sprites")
    albums, table, n_site = _albums(), cv.load_covers(cv.DEFAULT_COVERS, cv.DEFAULT_SPRITES), len(deduped[0])
    from rmr_pipeline.catalog import load_catalog

    keys = list(load_catalog()["rym_id"])
    legacy = [str(u).split(":")[-1] for u in deduped[0]["URI"]]

    def own(i):
        cover, image = table.cover_for(keys[i])
        return image if cover and cover == albums[i]["c"] and image is not None else None

    relinked = [i for i in range(n_site) if albums[i]["s"] != legacy[i] and own(i)]
    new = [i for i in range(n_site, len(albums)) if own(i)]
    assert len(relinked) > 1000 and len(new) > 6000
    picks = [relinked[0], relinked[-1], new[0], new[len(new) // 2], new[-1]]
    assert {i // ATLAS_PER_SHEET for i in picks} >= {n_site // ATLAS_PER_SHEET, (len(albums) - 1) // ATLAS_PER_SHEET}
    assert max(i // THUMB_PER_SHEET for i in picks) == (len(albums) - 1) // THUMB_PER_SHEET
    for i in picks:
        with Image.open(own(i)) as im:
            ref = np.asarray(square(im, ATLAS_SPRITE_PX), dtype=float)
        assert np.abs(_atlas_cell(i) - ref).mean() < 10, f"atlas cell {i} is not {albums[i]['t']}"
        small = np.asarray(Image.fromarray(ref.astype(np.uint8)).resize((THUMB_SPRITE_PX, THUMB_SPRITE_PX),
                                                                        Image.Resampling.LANCZOS), dtype=float)
        assert np.abs(_thumb_cell(i) - small).mean() < 20, f"thumbnail cell {i} is not {albums[i]['t']}"


def test_the_albums_with_an_unverified_link_have_no_spotify_link_and_a_lettered_tile(catalog_albums):
    """catalog/unverified_links.csv in the committed data: no `s`, no `c`, the fallback colours, and the
    lettered tile of the album's cluster in its atlas and thumbnail cells."""
    from rmr_pipeline.catalog import load_unverified_links

    albums = _albums()
    index = {k: i for i, k in enumerate(catalog_albums.keys)}
    rows = load_unverified_links()
    assert len(rows) == 67
    for r in rows:
        i = index[r["rym_id"]]
        a = albums[i]
        assert (a["slug"], a["s"], a["c"]) == (r["slug"], "", ""), r["slug"]
        assert a["w"] == list(FALLBACK_AMBIENT[a["k"] % 3]), r["slug"]
        for cell, px in ((_atlas_cell(i), ATLAS_SPRITE_PX), (_thumb_cell(i), THUMB_SPRITE_PX)):
            ref = np.asarray(lettered_tile(a["k"], px, tile_letter(a["t"])), dtype=float)
            # WebP loss is under 1.5 (96 px) and 3 (48 px); a flat tile is 3.1 away at 96 px, another cluster's 7
            assert np.abs(cell - ref).mean() < (2.5 if px == ATLAS_SPRITE_PX else 5), f"the {px} px cell of {r['slug']} is not its lettered tile"


def test_ambient_colours_are_extracted():
    albums = _albums()
    extracted = [a for a in albums if a["c"] and a["w"] != list(FALLBACK_AMBIENT[a["k"] % 3])]
    assert len(extracted) > 4000
    assert albums[11]["w"] != list(FALLBACK_AMBIENT[albums[11]["k"] % 3])


def test_committed_outputs_apply_every_override(deduped):
    """Each correction in overrides.json is in albums.json and in its atlas cell."""
    sub, _ = deduped
    table_slugs = make_slugs([str(t) for t in sub["Title"]], [clean_artist(a) for a in sub["Artist"].astype(str)])
    index = {s: i for i, s in enumerate(table_slugs)}
    albums = _albums()
    overrides = load_overrides(DEFAULT_OVERRIDES)
    assert overrides
    for slug, e in overrides.items():
        a = albums[index[slug]]
        assert (a["s"], a["c"]) == (e.get("s", a["s"]), e.get("c", a["c"])), slug
        assert a["a"] == e.get("a", a["a"]), slug
        assert a["slug"] == make_slugs([a["t"]], [a["a"]])[0], slug
        with Image.open(DEFAULT_OVERRIDES.parent / e["image"]) as im:
            ref = np.asarray(square(im, ATLAS_SPRITE_PX), dtype=float)
        assert np.abs(_atlas_cell(index[slug]) - ref).mean() < 10, f"atlas cell of {slug} is not its override image"
    magnolia = albums[index["the-magnolia-electric-co-magnolia-electric-co"]]
    assert (magnolia["slug"], magnolia["a"]) == ("the-magnolia-electric-co-songs-ohia", "Songs: Ohia")
