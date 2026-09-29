import json

from PIL import Image

from rmr_pipeline.constants import DEFAULT_OUT, FALLBACK_AMBIENT, IN_RAINBOWS_LIVE
from rmr_pipeline.validate import validate_dir


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


def test_sprite_sheets_exist_in_album_order():
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    with Image.open(DEFAULT_OUT / "atlas-0.webp") as sheet:
        assert sheet.size == (3072, 3072)
        cell = sheet.convert("RGB").crop((11 * 96, 0, 12 * 96, 96))  # In Rainbows, album 11
        colours = cell.getcolors(96 * 96)
        assert colours is None or len(colours) > 50
    with Image.open(DEFAULT_OUT / "thumbs.webp") as thumbs:
        assert thumbs.size == (3072, 3072)
    assert len(albums) <= 4 * 1024


def test_ambient_colours_are_extracted():
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    extracted = [a for a in albums if a["c"] and a["w"] != list(FALLBACK_AMBIENT[a["k"] % 3])]
    assert len(extracted) > 4000
    assert albums[11]["w"] != list(FALLBACK_AMBIENT[albums[11]["k"] % 3])
