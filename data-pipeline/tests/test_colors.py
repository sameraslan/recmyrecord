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


def bands(parts):
    """A 96 px cover of horizontal bands: [(rgb, fraction of the height), ...] from the top."""
    img, y = Image.new("RGB", (96, 96)), 0
    for rgb, frac in parts:
        h = round(96 * frac)
        img.paste(rgb, (0, y, 96, y + h))
        y += h
    return img


def hls(hexv):
    r, g, b = (v / 255 for v in hex_to_rgb(hexv))
    return colorsys.rgb_to_hls(r, g, b)


def hue_gap(a, b):
    d = abs(hls(a)[0] - hls(b)[0]) * 360
    return min(d, 360 - d)


def test_second_wash_is_a_different_hue_not_a_near_copy():
    # red, a slightly more orange red, and a smaller teal: the second wash must be the teal
    w = ambient_from_image(bands([((190, 30, 30), .5), ((220, 70, 40), .3), ((40, 140, 150), .2)]), 0)
    assert hue_gap(w[0], w[1]) > 90
    assert {round(hls(v)[0] * 360) // 60 for v in w[:2]} == {0, 3}  # one red, one cyan
    # magenta, a lighter magenta, and a smaller yellow (the two source hues are about 90 degrees apart)
    w = ambient_from_image(bands([((170, 40, 120), .5), ((200, 60, 160), .3), ((200, 180, 40), .2)]), 0)
    assert hue_gap(w[0], w[1]) > 80


def test_near_grey_cover_keeps_near_grey_washes():
    # an almost white cover (its HLS saturation is high only because it is so light) and a grey
    for parts in ([((250, 252, 253), .6), ((120, 122, 124), .4)], [((128, 128, 128), 1.0)],
                  [((30, 29, 28), .5), ((200, 198, 196), .5)]):
        w = ambient_from_image(bands(parts), 0)
        assert all(hls(v)[2] < 0.12 for v in w[:2]), w


def test_washes_stay_visible_on_the_room_colour():
    for parts in ([((5, 5, 5), 1.0)], [((10, 20, 60), 1.0)], [((200, 30, 30), 1.0)], [((250, 250, 250), 1.0)],
                  [((5, 5, 5), .75), ((200, 190, 170), .25)]):
        w = ambient_from_image(bands(parts), 0)
        assert all(0.145 <= hls(v)[1] <= 0.26 for v in w[:2]), w


def test_first_wash_is_the_more_visible_one():
    # mostly black with a lighter beige band: the beige wash goes to the big panel blob
    w = ambient_from_image(bands([((5, 5, 5), .75), ((200, 190, 170), .25)]), 0)
    assert hls(w[0])[1] > hls(w[1])[1]
    assert hls(w[0])[2] > hls(w[1])[2]


def test_accent_is_unchanged():
    # accents as the pipeline produced them before the washes were re-tuned
    cases = [
        ([((200, 30, 30), 1.0)], "#da5252"),
        ([((20, 40, 200), .6), ((230, 120, 30), .4)], "#6c79e0"),
        ([((10, 20, 60), 1.0)], "#637cde"),
        ([((128, 128, 128), 1.0)], MONO_ACCENT),
        ([((190, 30, 30), .5), ((220, 70, 40), .3), ((40, 140, 150), .2)], "#da5252"),
        ([((250, 252, 253), .6), ((120, 122, 124), .4)], "#afcfdf"),
        ([((5, 5, 5), .75), ((200, 190, 170), .25)], "#d0bf9d"),
    ]
    for parts, accent in cases:
        assert ambient_from_image(bands(parts), 0)[2] == accent
