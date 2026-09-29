import colorsys

from PIL import Image

from rmr_pipeline.colors import MONO_ACCENT, ambient_from_image, contrast_ratio, dominant_colors, hex_to_rgb
from rmr_pipeline.constants import ROOM_RGB


def solid(rgb):
    return Image.new("RGB", (96, 96), rgb)


def lightness(hexv):
    r, g, b = (v / 255 for v in hex_to_rgb(hexv))
    return colorsys.rgb_to_hls(r, g, b)[1]


def test_contrast_ratio_reference_values():
    assert round(contrast_ratio((0, 0, 0), (255, 255, 255)), 2) == 21.0
    assert contrast_ratio((10, 10, 10), (10, 10, 10)) == 1.0
    assert contrast_ratio(hex_to_rgb("#ede5d5"), ROOM_RGB) > 14


def test_dominant_colors_orders_by_share():
    img = Image.new("RGB", (96, 96), (20, 40, 200))
    img.paste((230, 120, 30), (0, 0, 96, 30))
    cols = dominant_colors(img)
    assert cols[0][0][2] > 150  # blue covers the larger area
    assert cols[0][1] > cols[1][1]


def test_red_cover_gives_dark_washes_and_readable_red_accent():
    w = ambient_from_image(solid((200, 30, 30)), 0)
    assert all(v.startswith("#") and len(v) == 7 for v in w)
    assert lightness(w[0]) <= 0.23 and lightness(w[1]) <= 0.23
    assert contrast_ratio(hex_to_rgb(w[2]), ROOM_RGB) >= 4.5
    r, g, b = hex_to_rgb(w[2])
    assert r > g and r > b


def test_two_colour_cover_gives_two_washes():
    img = Image.new("RGB", (96, 96), (20, 40, 200))
    img.paste((230, 120, 30), (0, 0, 96, 40))
    w = ambient_from_image(img, 0)
    assert w[0] != w[1]


def test_grey_cover_uses_mono_accent():
    assert ambient_from_image(solid((128, 128, 128)), 1)[2] == MONO_ACCENT


def test_dark_navy_accent_still_reaches_contrast():
    w = ambient_from_image(solid((10, 20, 60)), 2)
    assert contrast_ratio(hex_to_rgb(w[2]), ROOM_RGB) >= 4.5


def test_extraction_is_deterministic():
    img = Image.effect_noise((96, 96), 60).convert("RGB")
    assert ambient_from_image(img, 0) == ambient_from_image(img, 0)
