import json
import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.constants import (ATLAS_COLS, ATLAS_PER_SHEET, ATLAS_SPRITE_PX, DEFAULT_OUT, FALLBACK_AMBIENT,
                                    IN_RAINBOWS_LIVE, THUMB_COLS, THUMB_ROWS, THUMB_SPRITE_PX)
from rmr_pipeline.images import SHEET_FILL, crop_uv, square
from rmr_pipeline.mapsource import MapSource, load_metadata
from rmr_pipeline.validate import validate_dir

MAP_ROOT = os.environ.get("RMR_MAP_ROOT", "")
SHEET_PX = ATLAS_COLS * ATLAS_SPRITE_PX


def _albums() -> list[dict]:
    return json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))


def _atlas_cell(i: int) -> np.ndarray:
    sheet, cell = divmod(i, ATLAS_PER_SHEET)
    x, y = (cell % ATLAS_COLS) * ATLAS_SPRITE_PX, (cell // ATLAS_COLS) * ATLAS_SPRITE_PX
    with Image.open(DEFAULT_OUT / f"atlas-{sheet}.webp") as im:
        return np.asarray(im.convert("RGB").crop((x, y, x + ATLAS_SPRITE_PX, y + ATLAS_SPRITE_PX)), dtype=float)


def _thumb_cell(i: int) -> np.ndarray:
    x, y = (i % THUMB_COLS) * THUMB_SPRITE_PX, (i // THUMB_COLS) * THUMB_SPRITE_PX
    with Image.open(DEFAULT_OUT / "thumbs.webp") as im:
        return np.asarray(im.convert("RGB").crop((x, y, x + THUMB_SPRITE_PX, y + THUMB_SPRITE_PX)), dtype=float)


def test_committed_outputs_pass_contract():
    summary = validate_dir(DEFAULT_OUT)
    assert summary["albums"] == 4081
    assert summary["vocab"] == 114


def test_in_rainbows_record_and_recs():
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    recs = json.loads((DEFAULT_OUT / "recs.json").read_text(encoding="utf-8"))
    assert albums[11]["slug"] == "in-rainbows-radiohead"
    assert albums[11]["t"] == "In Rainbows"
    assert albums[11]["a"] == "Radiohead"
    assert [albums[i]["t"] for i in recs["mood"][11][:5]] == IN_RAINBOWS_LIVE
    assert albums[42]["slug"] == "vespertine-bjork"
    assert albums[5]["slug"] == "loveless-my-bloody-valentine"


def test_committed_artists_are_clean():
    albums = _albums()
    assert [a["a"] for a in albums if clean_artist(a["a"]) != a["a"]] == []
    springsteen = [a for a in albums if a["t"] == "Live in New York City"]
    assert [(a["a"], a["slug"]) for a in springsteen] == [
        ("Bruce Springsteen & the E Street Band", "live-in-new-york-city-bruce-springsteen-and-the-e-street-band")]


def test_sprite_sheets_are_full_size_and_filled_after_the_last_album():
    n = len(_albums())
    assert n < 4 * ATLAS_PER_SHEET and n % ATLAS_PER_SHEET  # so the cell after the last album exists
    for s in range(4):
        with Image.open(DEFAULT_OUT / f"atlas-{s}.webp") as sheet:
            assert sheet.size == (SHEET_PX, SHEET_PX)
    with Image.open(DEFAULT_OUT / "thumbs.webp") as thumbs:
        assert thumbs.size == (THUMB_COLS * THUMB_SPRITE_PX, THUMB_ROWS * THUMB_SPRITE_PX)
    assert np.abs(_atlas_cell(n) - SHEET_FILL).mean() < 3
    assert np.abs(_thumb_cell(n) - SHEET_FILL).mean() < 3
    assert np.abs(_atlas_cell(n - 1) - SHEET_FILL).mean() > 10


@pytest.mark.skipif(not MAP_ROOT, reason="set RMR_MAP_ROOT to the music_map worktree to compare with its atlases")
def test_sprites_match_the_map_atlases_in_album_order():
    albums = _albums()
    src = MapSource(Path(MAP_ROOT))
    meta = load_metadata(src)
    # A wrong cover differs by about 45 on average; WebP loss stays under 5 (atlas) and 11 (48 px thumbnails).
    for i in (0, 11, len(albums) - 1):  # OK Computer, In Rainbows, the last album
        m = meta["spotify:album:" + albums[i]["s"]]
        with Image.open(src.atlas_path(int(m["atlasIndex"]))) as sheet:
            ref = np.asarray(square(crop_uv(sheet, m["atlasUV"]), ATLAS_SPRITE_PX), dtype=float)
        assert np.abs(_atlas_cell(i) - ref).mean() < 10, f"atlas cell {i} is not {albums[i]['t']}"
        small = np.asarray(Image.fromarray(ref.astype(np.uint8)).resize((THUMB_SPRITE_PX, THUMB_SPRITE_PX),
                                                                        Image.Resampling.LANCZOS), dtype=float)
        assert np.abs(_thumb_cell(i) - small).mean() < 20, f"thumbnail cell {i} is not {albums[i]['t']}"


def test_ambient_colours_are_extracted():
    albums = _albums()
    extracted = [a for a in albums if a["c"] and a["w"] != list(FALLBACK_AMBIENT[a["k"] % 3])]
    assert len(extracted) > 4000
    assert albums[11]["w"] != list(FALLBACK_AMBIENT[albums[11]["k"] % 3])
