"""Cover sprites: crop from the map's atlases, re-pack in album index order."""
import re
import unicodedata
from functools import lru_cache
from math import ceil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .constants import (ATLAS_COLS, ATLAS_NAME_RE, ATLAS_PER_SHEET, ATLAS_SPRITE_PX, FALLBACK_TILE, PIPELINE_DIR,
                        THUMB_COLS, THUMB_PER_SHEET, THUMB_SPRITE_PX, THUMBS_NAME_RE, TILE_BORDER_MIX, TILE_FONT_EM,
                        TILE_INK_ALPHA, TILE_LETTER_BELOW, TILE_LIGHT, TILE_NO_INITIAL)
from .mapsource import MapSource

SHEET_FILL = (44, 36, 28)  # #2c241c, the cover fallback background
# The tile letter's font: DejaVu Serif 2.35 as matplotlib 3.10.3 ships it, unchanged, with its licence beside
# it (assets/LICENSE_DEJAVU). Committed so that a build draws the same tiles on any machine.
TILE_FONT = PIPELINE_DIR / "assets" / "DejaVuSerif.ttf"


def crop_uv(sheet: Image.Image, uv) -> Image.Image:
    W, H = sheet.size
    u, v, w, h = (float(x) for x in uv)
    return sheet.crop((round(u * W), round(v * H), round((u + w) * W), round((v + h) * H))).convert("RGB")


def square(img: Image.Image, px: int) -> Image.Image:
    return ImageOps.fit(img.convert("RGB"), (px, px), method=Image.Resampling.LANCZOS)


def tile(cluster: int, px: int) -> Image.Image:
    return Image.new("RGB", (px, px), FALLBACK_TILE[cluster % 3])


def _initial(ch: str) -> str:
    """`ch` as a tile shows it: upper-cased (left as it is when that gives two characters, like the sharp
    s), and when that is not below TILE_LETTER_BELOW, its base letter (the first character of its NFD
    form). "" when neither is below it: the font is not asked to draw it."""
    up = ch.upper()
    c = up if len(up) == 1 else ch
    if ord(c) < TILE_LETTER_BELOW:
        return c
    base = unicodedata.normalize("NFD", c)[0]
    return base if ord(base) < TILE_LETTER_BELOW and unicodedata.category(base)[0] in "LN" else ""


def tile_letter(title: str) -> str:
    """The character on the tile of an album shown as `title` (`t`), "" for none. The rule the frontend's
    tile follows (initialLetter in frontcreck/src/lib/data/catalog.ts): change both together.

    1. Drop a leading "The " (any case). The first letter or digit (Unicode category L* or N*) of the rest
       decides: when there is none, TILE_NO_INITIAL.
    2. That character through _initial: upper-cased, a base letter for one outside the drawn range.
    3. When it cannot be drawn (not Latin) and the title ends with a square bracket (`native [Latin]`): the
       first letter or digit inside the bracket that can (a leading "The " there is not dropped).
    4. Else no letter: the tile alone."""
    def letters(text: str):
        return (ch for ch in text if unicodedata.category(ch)[0] in "LN")

    first = next(letters(re.sub(r"^the\s+", "", title, flags=re.IGNORECASE)), None)
    if first is None:
        return TILE_NO_INITIAL
    if shown := _initial(first):
        return shown
    bracket = re.search(r"\[([^\[\]]*)\]\s*$", title)
    return next((c for c in map(_initial, letters(bracket[1])) if c), "") if bracket else ""


@lru_cache(maxsize=None)
def tile_font(px: int) -> ImageFont.FreeTypeFont:
    """The tile font at the size for a tile of `px`. The basic layout engine, so the glyphs do not depend
    on whether this Pillow has libraqm."""
    return ImageFont.truetype(str(TILE_FONT), round(px * TILE_FONT_EM), layout_engine=ImageFont.Layout.BASIC)


def _towards_light(fill: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(f + (t - f) * amount) for f, t in zip(fill, TILE_LIGHT))


def tile_ink(cluster: int) -> tuple[int, int, int]:
    """The letter's colour: the frontend's rgba(237, 229, 213, .78) over the cluster's fill."""
    return _towards_light(FALLBACK_TILE[cluster % 3], TILE_INK_ALPHA)


def tile_border(cluster: int) -> tuple[int, int, int]:
    """The 1 px inner border's colour: a little lighter than the fill, 3:1 on the map's background."""
    return _towards_light(FALLBACK_TILE[cluster % 3], TILE_BORDER_MIX)


def lettered_tile(cluster: int, px: int, letter: str) -> Image.Image:
    """The tile of an album without a cover as a catalog build draws it: the cluster's fill, a 1 px inner
    border, and `letter` ("" for none) in the middle, its width centred and the capitals' height centred
    (every letter stands on the same baseline)."""
    im = tile(cluster, px)
    draw = ImageDraw.Draw(im)
    draw.rectangle((0, 0, px - 1, px - 1), outline=tile_border(cluster), width=1)
    if letter:
        font = tile_font(px)
        _, top, _, bottom = font.getbbox("H", anchor="ls")  # the capitals: from `top` (negative) to the baseline
        draw.text((px / 2, round(px / 2 + (bottom - top) / 2)), letter, font=font, fill=tile_ink(cluster), anchor="ms")
    return im


def _on_tile_path(i: int, uri: str, cover_ids: list[str], override_images: dict) -> bool:
    """Whether album i has no sprite of a cover: no file of its own, and no cover id or no map sprite."""
    return i not in override_images and (not cover_ids[i] or not uri)


def pack_sheets(sprites: list[Image.Image], sprite_px: int, cols: int, per_sheet: int) -> list[Image.Image]:
    """Sprite i goes to sheet i // per_sheet, cell i % per_sheet, row-major with `cols` columns.
    Sheets are always full size so UV maths never depends on the album count."""
    rows = ceil(per_sheet / cols)
    sheets: list[Image.Image] = []
    for start in range(0, len(sprites), per_sheet):
        sheet = Image.new("RGB", (cols * sprite_px, rows * sprite_px), SHEET_FILL)
        for j, im in enumerate(sprites[start:start + per_sheet]):
            if im.size != (sprite_px, sprite_px):
                im = square(im, sprite_px)
            sheet.paste(im.convert("RGB"), ((j % cols) * sprite_px, (j // cols) * sprite_px))
        sheets.append(sheet)
    return sheets


def load_album_sprites(src: MapSource, uris: list[str], meta: dict[str, dict], cover_ids: list[str],
                       clusters: list[int], override_images: dict[int, Path],
                       titles: list[str] | None = None) -> list[Image.Image]:
    """One 96 px sprite per album in album order: an override image, else the map sprite,
    else (no cover id, or no URI: a catalog album the map does not have) a tile in the cluster's
    fallback colour: flat without `titles` (a --no-catalog build), lettered from the album's shown title with
    them (the catalog build; lettered_tile). A new album's own sprite comes in through `override_images`."""
    cache: dict[int, Image.Image] = {}
    out: list[Image.Image] = []
    for i, uri in enumerate(uris):
        if i in override_images:
            with Image.open(override_images[i]) as im:
                out.append(square(im, ATLAS_SPRITE_PX))
            continue
        if _on_tile_path(i, uri, cover_ids, override_images):
            out.append(tile(clusters[i], ATLAS_SPRITE_PX) if titles is None
                       else lettered_tile(clusters[i], ATLAS_SPRITE_PX, tile_letter(titles[i])))
            continue
        m = meta[uri]
        a = int(m["atlasIndex"])
        if a not in cache:
            cache[a] = Image.open(src.atlas_path(a)).convert("RGB")
        out.append(square(crop_uv(cache[a], m["atlasUV"]), ATLAS_SPRITE_PX))
    return out


def tile_thumbs(uris: list[str], cover_ids: list[str], clusters: list[int], override_images: dict[int, Path],
                titles: list[str]) -> dict[int, Image.Image]:
    """The 48 px lettered tile of every album load_album_sprites gives a tile, by album number: drawn at
    that size (a 1 px border, the font at its own size), for write_sheets to use in place of the 96 px tile
    scaled down."""
    return {i: lettered_tile(clusters[i], THUMB_SPRITE_PX, tile_letter(titles[i]))
            for i, uri in enumerate(uris) if _on_tile_path(i, uri, cover_ids, override_images)}


def thumbs_name(sheet: int) -> str:
    """The file of thumbnail sheet `sheet`: thumbs.webp, then thumbs-1.webp, thumbs-2.webp, ..."""
    return "thumbs.webp" if sheet == 0 else f"thumbs-{sheet}.webp"


def write_sheets(out_dir: Path, sprites: list[Image.Image], small: dict[int, Image.Image] | None = None) -> dict[str, int]:
    """The atlas sheets (ATLAS_PER_SHEET sprites each) and the thumbnail sheets (THUMB_PER_SHEET each) of
    `sprites`, as many of each as the albums need; numbered sheets left over from a larger build are
    removed. A thumbnail is the sprite scaled down, or the album's image in `small` (tile_thumbs) when it
    has one. Returns {file name: bytes}."""
    out_dir.mkdir(parents=True, exist_ok=True)
    sizes: dict[str, int] = {}
    atlases = pack_sheets(sprites, ATLAS_SPRITE_PX, ATLAS_COLS, ATLAS_PER_SHEET)
    for i, sheet in enumerate(atlases):
        p = out_dir / f"atlas-{i}.webp"
        sheet.save(p, "WEBP", quality=80, method=6)
        sizes[p.name] = p.stat().st_size
    for stale in out_dir.glob("atlas-*.webp"):
        m = ATLAS_NAME_RE.match(stale.name)
        if m and int(m[1]) >= len(atlases):  # other atlas-like names are not ours; the validator reports them
            stale.unlink()
    del atlases
    drawn = small or {}
    small = [drawn[i] if i in drawn else s.resize((THUMB_SPRITE_PX, THUMB_SPRITE_PX), Image.Resampling.LANCZOS)
             for i, s in enumerate(sprites)]
    thumbs = pack_sheets(small, THUMB_SPRITE_PX, THUMB_COLS, THUMB_PER_SHEET)
    for i, sheet in enumerate(thumbs):
        p = out_dir / thumbs_name(i)
        sheet.save(p, "WEBP", quality=70, method=6)
        sizes[p.name] = p.stat().st_size
    for stale in out_dir.glob("thumbs-*.webp"):
        m = THUMBS_NAME_RE.match(stale.name)
        if m and int(m[1]) >= len(thumbs):
            stale.unlink()
    return sizes
