"""Cover sprites: crop from the map's atlases, re-pack in album index order."""
from math import ceil
from pathlib import Path

from PIL import Image, ImageOps

from .constants import (ATLAS_COLS, ATLAS_NAME_RE, ATLAS_PER_SHEET, ATLAS_SPRITE_PX, FALLBACK_TILE, THUMB_COLS,
                        THUMB_ROWS, THUMB_SPRITE_PX)
from .mapsource import MapSource

SHEET_FILL = (44, 36, 28)  # #2c241c, the cover fallback background


def crop_uv(sheet: Image.Image, uv) -> Image.Image:
    W, H = sheet.size
    u, v, w, h = (float(x) for x in uv)
    return sheet.crop((round(u * W), round(v * H), round((u + w) * W), round((v + h) * H))).convert("RGB")


def square(img: Image.Image, px: int) -> Image.Image:
    return ImageOps.fit(img.convert("RGB"), (px, px), method=Image.Resampling.LANCZOS)


def tile(cluster: int, px: int) -> Image.Image:
    return Image.new("RGB", (px, px), FALLBACK_TILE[cluster % 3])


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
                       clusters: list[int], override_images: dict[int, Path]) -> list[Image.Image]:
    """One 96 px sprite per album in album order: an override image, else the map sprite,
    else (no cover id) a flat tile in the cluster's fallback colour."""
    cache: dict[int, Image.Image] = {}
    out: list[Image.Image] = []
    for i, uri in enumerate(uris):
        if i in override_images:
            with Image.open(override_images[i]) as im:
                out.append(square(im, ATLAS_SPRITE_PX))
            continue
        if not cover_ids[i]:
            out.append(tile(clusters[i], ATLAS_SPRITE_PX))
            continue
        m = meta[uri]
        a = int(m["atlasIndex"])
        if a not in cache:
            cache[a] = Image.open(src.atlas_path(a)).convert("RGB")
        out.append(square(crop_uv(cache[a], m["atlasUV"]), ATLAS_SPRITE_PX))
    return out


def write_sheets(out_dir: Path, sprites: list[Image.Image]) -> dict[str, int]:
    if len(sprites) > THUMB_COLS * THUMB_ROWS:
        raise ValueError(f"{len(sprites)} albums do not fit one {THUMB_COLS}x{THUMB_ROWS} thumbnail sheet")
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
    small = [s.resize((THUMB_SPRITE_PX, THUMB_SPRITE_PX), Image.Resampling.LANCZOS) for s in sprites]
    thumbs = pack_sheets(small, THUMB_SPRITE_PX, THUMB_COLS, THUMB_COLS * THUMB_ROWS)[0]
    p = out_dir / "thumbs.webp"
    thumbs.save(p, "WEBP", quality=70, method=6)
    sizes[p.name] = p.stat().st_size
    return sizes
