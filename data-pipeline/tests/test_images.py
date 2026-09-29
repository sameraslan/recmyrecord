from PIL import Image

from rmr_pipeline.constants import ATLAS_COLS, ATLAS_PER_SHEET, ATLAS_SPRITE_PX, THUMB_COLS, THUMB_ROWS, THUMB_SPRITE_PX
from rmr_pipeline.images import SHEET_FILL, crop_uv, pack_sheets, square, tile, write_sheets


def test_sheet_geometry_constants():
    assert ATLAS_COLS * ATLAS_SPRITE_PX == 3072
    assert ATLAS_COLS * ATLAS_COLS == ATLAS_PER_SHEET
    assert THUMB_COLS * THUMB_SPRITE_PX == 3072
    assert THUMB_ROWS * THUMB_SPRITE_PX == 3072


def test_crop_uv_takes_the_right_cell():
    sheet = Image.new("RGB", (64, 64), (0, 0, 0))
    sheet.paste((255, 0, 0), (32, 0, 64, 32))
    cell = crop_uv(sheet, [0.5, 0.0, 0.5, 0.5])
    assert cell.size == (32, 32)
    assert cell.getpixel((5, 5)) == (255, 0, 0)


def test_pack_sheets_places_sprites_in_index_order():
    colours = [(10 * i, 0, 0) for i in range(5)]
    sprites = [Image.new("RGB", (2, 2), c) for c in colours]
    sheets = pack_sheets(sprites, sprite_px=2, cols=2, per_sheet=4)
    assert len(sheets) == 2
    assert all(s.size == (4, 4) for s in sheets)
    assert sheets[0].getpixel((0, 0)) == colours[0]
    assert sheets[0].getpixel((2, 0)) == colours[1]
    assert sheets[0].getpixel((0, 2)) == colours[2]
    assert sheets[0].getpixel((2, 2)) == colours[3]
    assert sheets[1].getpixel((0, 0)) == colours[4]
    assert sheets[1].getpixel((2, 2)) == SHEET_FILL


def test_square_and_tile():
    assert square(Image.new("RGB", (120, 90), (1, 2, 3)), 96).size == (96, 96)
    t = tile(4, 48)
    assert t.size == (48, 48)
    assert t.getpixel((0, 0)) == tile(1, 48).getpixel((0, 0))


def test_write_sheets_ignores_unrelated_atlas_names_and_removes_stale_sheets(tmp_path):
    (tmp_path / "atlas-old.webp").write_bytes(b"keep me")
    (tmp_path / "atlas-7.webp").write_bytes(b"stale")
    sizes = write_sheets(tmp_path, [tile(0, ATLAS_SPRITE_PX)] * 3)
    assert sorted(sizes) == ["atlas-0.webp", "thumbs.webp"]
    assert (tmp_path / "atlas-old.webp").read_bytes() == b"keep me"
    assert not (tmp_path / "atlas-7.webp").exists()
