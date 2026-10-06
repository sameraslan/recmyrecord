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


def _small_sheets(monkeypatch, module):
    """Four sprites per sheet (2 x 2) for both kinds, so a handful of sprites fills several sheets."""
    for name, value in (("ATLAS_COLS", 2), ("ATLAS_PER_SHEET", 4), ("THUMB_COLS", 2), ("THUMB_ROWS", 2),
                        ("THUMB_PER_SHEET", 4)):
        if hasattr(module, name):
            monkeypatch.setattr(module, name, value)


def _near(a, b, tol=12):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def test_thumbs_sheet_names():
    from rmr_pipeline.constants import THUMB_PER_SHEET, THUMBS_NAME_RE
    from rmr_pipeline.images import thumbs_name

    assert THUMB_PER_SHEET == THUMB_COLS * THUMB_ROWS == 4096
    assert [thumbs_name(i) for i in range(3)] == ["thumbs.webp", "thumbs-1.webp", "thumbs-2.webp"]
    assert THUMBS_NAME_RE.match("thumbs-1.webp")[1] == "1" and THUMBS_NAME_RE.match("thumbs-12.webp")
    assert not any(THUMBS_NAME_RE.match(n) for n in ("thumbs.webp", "thumbs-0.webp", "thumbs-01.webp", "thumbs-x.webp"))


def test_write_sheets_pages_the_thumbnails_like_the_atlases(tmp_path, monkeypatch):
    """Album i is in thumbs sheet i // per_sheet at cell i % per_sheet; sheet 0 keeps the name thumbs.webp."""
    import rmr_pipeline.images as images

    _small_sheets(monkeypatch, images)
    colours = [(20 * i, 250 - 20 * i, 128) for i in range(9)]
    sizes = write_sheets(tmp_path, [Image.new("RGB", (ATLAS_SPRITE_PX, ATLAS_SPRITE_PX), c) for c in colours])
    assert list(sizes) == ["atlas-0.webp", "atlas-1.webp", "atlas-2.webp", "thumbs.webp", "thumbs-1.webp", "thumbs-2.webp"]
    assert all(sizes[n] == (tmp_path / n).stat().st_size > 0 for n in sizes)
    for i, colour in enumerate(colours):
        sheet, cell = divmod(i, 4)
        x, y = (cell % 2) * THUMB_SPRITE_PX + 24, (cell // 2) * THUMB_SPRITE_PX + 24
        with Image.open(tmp_path / images.thumbs_name(sheet)) as im:
            assert im.format == "WEBP" and im.size == (2 * THUMB_SPRITE_PX, 2 * THUMB_SPRITE_PX)
            assert _near(im.convert("RGB").getpixel((x, y)), colour)
    with Image.open(tmp_path / "thumbs-2.webp") as im:  # one album, then the fill
        assert _near(im.convert("RGB").getpixel((THUMB_SPRITE_PX + 24, 24)), SHEET_FILL)


def test_write_sheets_removes_stale_thumbs_sheets_and_leaves_other_names(tmp_path, monkeypatch):
    import rmr_pipeline.images as images

    _small_sheets(monkeypatch, images)
    for name in ("thumbs-1.webp", "thumbs-2.webp", "thumbs-9.webp", "thumbs-old.webp", "thumbs-0.webp"):
        (tmp_path / name).write_bytes(b"old")
    sizes = write_sheets(tmp_path, [tile(0, ATLAS_SPRITE_PX)] * 5)
    assert sorted(sizes) == ["atlas-0.webp", "atlas-1.webp", "thumbs-1.webp", "thumbs.webp"]
    assert (tmp_path / "thumbs-1.webp").read_bytes() != b"old"
    assert not (tmp_path / "thumbs-2.webp").exists() and not (tmp_path / "thumbs-9.webp").exists()
    assert (tmp_path / "thumbs-old.webp").read_bytes() == b"old" and (tmp_path / "thumbs-0.webp").read_bytes() == b"old"


def test_one_sheet_of_thumbs_is_written_as_before(tmp_path):
    """Up to 4,096 albums: thumbs.webp alone, the bytes the single-sheet code wrote."""
    sprites = [Image.new("RGB", (ATLAS_SPRITE_PX, ATLAS_SPRITE_PX), (i * 40, 90, 200 - i * 40)) for i in range(5)]
    sizes = write_sheets(tmp_path, sprites)
    assert sorted(sizes) == ["atlas-0.webp", "thumbs.webp"]
    small = [s.resize((THUMB_SPRITE_PX, THUMB_SPRITE_PX), Image.Resampling.LANCZOS) for s in sprites]
    pack_sheets(small, THUMB_SPRITE_PX, THUMB_COLS, THUMB_COLS * THUMB_ROWS)[0].save(
        tmp_path / "ref.webp", "WEBP", quality=70, method=6)
    assert (tmp_path / "thumbs.webp").read_bytes() == (tmp_path / "ref.webp").read_bytes()


def test_a_new_album_without_a_sprite_gets_its_clusters_tile(tmp_path):
    """A catalog album has no map sprite (no URI): its sprite file when it has one, else the flat tile,
    whether or not it has a cover id."""
    from rmr_pipeline.images import load_album_sprites

    red = tmp_path / "red.jpg"
    Image.new("RGB", (96, 96), (200, 30, 30)).save(red, quality=95)
    sprites = load_album_sprites(None, ["", "", ""], {}, ["dz:" + "a" * 32, "", "bc:123"], [1, 2, 0], {2: red})
    assert [s.size for s in sprites] == [(96, 96)] * 3
    assert sprites[0].getpixel((5, 5)) == tile(1, 96).getpixel((5, 5))
    assert sprites[1].getpixel((5, 5)) == tile(2, 96).getpixel((5, 5))
    assert _near(sprites[2].getpixel((48, 48)), (200, 30, 30))
