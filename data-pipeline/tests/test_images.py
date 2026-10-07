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


# --- the lettered tile of an album without a cover (catalog mode) ---

def _lum(c):
    r, g, b = ((v / 255 / 12.92) if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4 for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a, b):
    hi, lo = sorted((_lum(a), _lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def test_the_tile_letter_rule():
    from rmr_pipeline.images import tile_letter

    # Latin: the first letter or digit, upper-cased, after a leading "The " (the frontend's initialLetter).
    assert tile_letter("Chill Out") == "C"
    assert tile_letter("midtown 120 Blues") == "M"
    assert tile_letter("The Gate") == "G" and tile_letter("the  Old Kit Bag") == "O"
    assert tile_letter("Theatre") == "T"
    # A digit first; punctuation first is passed over.
    assert tile_letter("12 Hits From Hell") == "1" and tile_letter("4k God") == "4"
    assert tile_letter("...And Justice") == "A" and tile_letter("(What's the Story)") == "W"
    assert tile_letter("¿Dónde?") == "D"
    # Diacritics the font draws are kept (everything below U+0250); one above it folds to its base letter.
    assert tile_letter("Étoile") == "É" and tile_letter("älskar") == "Ä"
    assert tile_letter("Völkerball") == "V"
    assert tile_letter("Ế") == "E" and tile_letter("ệ x") == "E"  # Vietnamese E with two marks
    assert tile_letter("ßig") == "ß"  # upper-cases to two letters: kept as it is
    # Not Latin, with a Latin form in a bracket at the end: the bracket's first Latin letter or digit.
    assert tile_letter("アダンの風 [Windswept Adan]") == "W"
    assert tile_letter("Симфония № 5 [Symphony No. 5]") == "S"
    assert tile_letter("ゼルダ [The Legend of Zelda]") == "T"  # "The" is dropped at the title's start only
    assert tile_letter("한 [‘한’ 1st take]") == "1"
    # Not Latin and no Latin form: no letter.
    assert tile_letter("보편적인 노래") == ""
    assert tile_letter("Мор. Утопия") == ""
    assert tile_letter("悲愴 [悲愴]") == ""
    assert tile_letter("マザー (Mother)") == ""  # only a square bracket at the end counts
    # A Latin first character decides even when the rest is not Latin.
    assert tile_letter("MarioKart Wii (マリオ)") == "M" and tile_letter("1984年 [Nineteen]") == "1"
    # No letter or digit at all: the frontend's dot.
    assert tile_letter("( )") == "·" and tile_letter("") == "·"


def test_the_committed_font_draws_every_letter_and_digit_below_u0250():
    """The frontend mirrors the rule by code point alone (below U+0250), so the font must have them all."""
    import unicodedata

    from rmr_pipeline.images import TILE_FONT, tile_font

    assert TILE_FONT.is_file() and (TILE_FONT.parent / "LICENSE_DEJAVU").is_file()
    font = tile_font(96)
    notdef = bytes(font.getmask("\U0010fffe"))
    assert notdef == bytes(font.getmask("￿"))
    missing = [hex(c) for c in list(range(0x250)) + [0xB7] if (unicodedata.category(chr(c))[0] in "LN" or c == 0xB7)
               and bytes(font.getmask(chr(c))) in (notdef, b"")]
    assert missing == []


def test_a_lettered_tile_has_the_fill_a_border_and_a_light_centred_letter():
    from rmr_pipeline.constants import FALLBACK_TILE, MAP_RGB
    from rmr_pipeline.images import lettered_tile, tile_border, tile_ink

    for px in (96, 48):
        for k in range(3):
            fill = FALLBACK_TILE[k]
            t = lettered_tile(k + 3, px, "W")
            assert t.size == (px, px) and t.mode == "RGB"
            assert len(t.getcolors(px * px)) > 3  # not uniform
            # the 1 px inner border, lighter than the fill and visible on the map's background
            border = tile_border(k)
            edge = [(x, y) for x in range(px) for y in (0, px - 1)] + [(x, y) for y in range(px) for x in (0, px - 1)]
            assert {t.getpixel(p) for p in edge} == {border}
            assert t.getpixel((1, 1)) == fill and t.getpixel((px - 2, px - 2)) == fill
            assert _lum(border) > _lum(fill) and _contrast(border, MAP_RGB) >= 3.0
            # the letter: the frontend's tone over the fill, at least 4.5:1
            ink = tile_ink(k)
            assert _contrast(ink, fill) >= 4.5
            inked = [(x, y) for x in range(1, px - 1) for y in range(1, px - 1) if t.getpixel((x, y)) == ink]
            assert inked
            every = [(x, y) for x in range(1, px - 1) for y in range(1, px - 1) if t.getpixel((x, y)) != fill]
            xs, ys = [p[0] for p in every], [p[1] for p in every]
            assert abs((min(xs) + max(xs) + 1) / 2 - px / 2) <= 1.5
            assert abs((min(ys) + max(ys) + 1) / 2 - px / 2) <= 1.5
            assert max(xs) - min(xs) < px * 0.7 and px * 0.2 < max(ys) - min(ys) < px * 0.5
    # no letter: the bordered tile alone; and the same call gives the same bytes
    bare = lettered_tile(0, 96, "")
    assert len(bare.getcolors()) == 2
    assert lettered_tile(1, 96, "É").tobytes() == lettered_tile(1, 96, "É").tobytes()
    assert lettered_tile(1, 96, "A").tobytes() != lettered_tile(1, 96, "B").tobytes()


def _map_with_one_atlas(tmp_path):
    """A stand-in map source with one 2 x 1 atlas: a red sprite, then a blue one."""
    atlas = Image.new("RGB", (192, 96), (200, 30, 30))
    atlas.paste((30, 30, 200), (96, 0, 192, 96))
    atlas.save(tmp_path / "atlas.png")

    class Src:
        def atlas_path(self, a):
            return tmp_path / "atlas.png"

    meta = {"u:red": {"atlasIndex": 0, "atlasUV": [0.0, 0.0, 0.5, 1.0]}, "u:blue": {"atlasIndex": 0, "atlasUV": [0.5, 0.0, 0.5, 1.0]}}
    return Src(), meta


def test_titles_letter_the_tiles_and_leave_every_other_sprite_alone(tmp_path):
    """Catalog mode passes the shown titles: an album on the tile path gets the lettered tile; a covered
    album's sprite (the map's, or its own file) is the one it had. Without titles nothing changes."""
    from rmr_pipeline.images import lettered_tile, load_album_sprites, tile_thumbs

    src, meta = _map_with_one_atlas(tmp_path)
    own = tmp_path / "own.jpg"
    Image.new("RGB", (96, 96), (20, 180, 60)).save(own, quality=95)
    uris = ["u:red", "u:blue", "", "", ""]
    covers = ["a" * 40, "", "dz:" + "a" * 32, "", "bc:9"]
    clusters = [0, 1, 2, 3, 4]
    titles = ["Red", "Chill Out", "Own", "アダン [Windswept Adan]", "보편"]
    args = (src, uris, meta, covers, clusters, {2: own})
    before = load_album_sprites(*args)
    after = load_album_sprites(*args, titles=titles)
    assert [s.tobytes() for s in before] == [s.tobytes() for s in load_album_sprites(*args, titles=None)]
    assert before[1].tobytes() == tile(1, 96).tobytes() and before[3].tobytes() == tile(3, 96).tobytes()
    assert after[0].tobytes() == before[0].tobytes() and after[2].tobytes() == before[2].tobytes()  # covered: unchanged
    assert after[1].tobytes() == lettered_tile(1, 96, "C").tobytes()
    assert after[3].tobytes() == lettered_tile(3, 96, "W").tobytes()
    assert after[4].tobytes() == lettered_tile(4, 96, "").tobytes()  # a cover id and no sprite yet, no Latin form
    # the 48 px tiles are drawn at their own size, for exactly the same albums
    small = tile_thumbs(uris, covers, clusters, {2: own}, titles)
    assert sorted(small) == [1, 3, 4]
    assert small[1].tobytes() == lettered_tile(1, 48, "C").tobytes() and small[3].size == (48, 48)


def test_write_sheets_takes_the_48_px_tiles_as_drawn(tmp_path):
    """With `small`, those albums' thumbnails are the given images, not the 96 px sprite scaled down; the
    atlas is the same either way, and without `small` the bytes are the ones written before."""
    from rmr_pipeline.images import lettered_tile

    sprites = [Image.new("RGB", (96, 96), (200, 30, 30)), lettered_tile(1, 96, "C"), lettered_tile(2, 96, "")]
    plain, drawn = tmp_path / "plain", tmp_path / "drawn"
    write_sheets(plain, sprites)
    write_sheets(drawn, sprites, small={1: lettered_tile(1, 48, "C"), 2: lettered_tile(2, 48, "")})
    assert (plain / "atlas-0.webp").read_bytes() == (drawn / "atlas-0.webp").read_bytes()
    assert (plain / "thumbs.webp").read_bytes() != (drawn / "thumbs.webp").read_bytes()
    small = [s.resize((THUMB_SPRITE_PX, THUMB_SPRITE_PX), Image.Resampling.LANCZOS) for s in sprites]
    small[1], small[2] = lettered_tile(1, 48, "C"), lettered_tile(2, 48, "")
    pack_sheets(small, THUMB_SPRITE_PX, THUMB_COLS, THUMB_COLS * THUMB_ROWS)[0].save(tmp_path / "ref.webp", "WEBP", quality=70, method=6)
    assert (drawn / "thumbs.webp").read_bytes() == (tmp_path / "ref.webp").read_bytes()
    write_sheets(tmp_path / "none", sprites, small=None)
    assert (plain / "thumbs.webp").read_bytes() == (tmp_path / "none" / "thumbs.webp").read_bytes()
