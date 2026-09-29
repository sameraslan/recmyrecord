"""The data contract for frontcreck/public/data (spec section 6.2)."""
import argparse
import json
import math
import re
import sys
from math import ceil
from pathlib import Path

from .colors import contrast_ratio, hex_to_rgb
from .constants import (ATLAS_COLS, ATLAS_PER_SHEET, ATLAS_SPRITE_PX, DEFAULT_OUT, LYRIC_DROP, NON_MOOD, RECS_PER_STOP,
                        ROOM_RGB, STOPS, THUMB_COLS, THUMB_ROWS, THUMB_SPRITE_PX, TOP_DESCRIPTORS)

ALBUM_KEYS = ["slug", "t", "a", "s", "c", "k", "d", "w"]
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
HEX_RE = re.compile(r"^#[0-9a-f]{6}$")
SPOTIFY_RE = re.compile(r"^[0-9A-Za-z]{22}$")
COVER_RE = re.compile(r"^[0-9a-f]{24,64}$")
MIN_ACCENT_CONTRAST = 4.5


class ContractError(Exception):
    pass


def _load(out: Path, name: str):
    return json.loads((out / name).read_text(encoding="utf-8"))


def _is_int(v) -> bool:
    return type(v) is int


def _validate_images(out: Path, n: int, err) -> None:
    from PIL import Image

    sheets = ceil(n / ATLAS_PER_SHEET)
    size = ATLAS_COLS * ATLAS_SPRITE_PX
    for i in range(sheets):
        p = out / f"atlas-{i}.webp"
        if not p.exists():
            err(f"missing {p.name}")
            continue
        with Image.open(p) as im:
            if im.format != "WEBP" or im.size != (size, size):
                err(f"{p.name} must be a {size}x{size} WebP")
    extra = sorted(q.name for q in out.glob("atlas-*.webp") if int(q.stem.split("-")[1]) >= sheets)
    if extra:
        err(f"unexpected atlas files {extra}")
    p = out / "thumbs.webp"
    if not p.exists():
        err("missing thumbs.webp")
    else:
        with Image.open(p) as im:
            if im.format != "WEBP" or im.size != (THUMB_COLS * THUMB_SPRITE_PX, THUMB_ROWS * THUMB_SPRITE_PX):
                err("thumbs.webp must be a 3072x3072 WebP")


def validate_dir(out: Path = DEFAULT_OUT, *, images: bool = True) -> dict:
    errs: list[str] = []

    def err(msg: str) -> None:
        if len(errs) < 50:
            errs.append(msg)

    albums = _load(out, "albums.json")
    vocab = _load(out, "vocab.json")
    positions = _load(out, "positions.json")
    recs = _load(out, "recs.json")

    if not isinstance(albums, list) or len(albums) < 4000:
        raise ContractError("albums.json must be a list of at least 4,000 albums")
    n = len(albums)

    if not isinstance(vocab, list) or not vocab:
        err("vocab.json must be a non-empty list")
        vocab = []
    if len(set(vocab)) != len(vocab):
        err("vocab.json has duplicate words")
    for w in vocab:
        if not isinstance(w, str) or not w:
            err(f"vocab word {w!r} is not a non-empty string")
        elif w in LYRIC_DROP or w in NON_MOOD:
            err(f"vocab word {w!r} is excluded by the spec")

    slugs: set[str] = set()
    no_cover = 0
    empty_d = 0
    for i, a in enumerate(albums):
        where = f"albums[{i}]"
        if not isinstance(a, dict) or list(a.keys()) != ALBUM_KEYS:
            err(f"{where}: keys must be exactly {ALBUM_KEYS} in that order")
            continue
        slug = a["slug"]
        if not isinstance(slug, str) or not SLUG_RE.match(slug):
            err(f"{where}: bad slug {slug!r}")
        elif slug in slugs:
            err(f"{where}: duplicate slug {slug!r}")
        else:
            slugs.add(slug)
        for key in ("t", "a"):
            if not isinstance(a[key], str) or not a[key].strip():
                err(f"{where}: {key} must be a non-empty string")
        if not isinstance(a["s"], str) or not (a["s"] == "" or SPOTIFY_RE.match(a["s"])):
            err(f"{where}: bad Spotify id {a['s']!r}")
        if not isinstance(a["c"], str) or not (a["c"] == "" or COVER_RE.match(a["c"])):
            err(f"{where}: bad cover id {a['c']!r}")
        elif a["c"] == "":
            no_cover += 1
        if not _is_int(a["k"]) or not 0 <= a["k"] <= 7:
            err(f"{where}: cluster must be an int in 0..7")
        d = a["d"]
        if (not isinstance(d, list) or len(d) > TOP_DESCRIPTORS or len(set(d)) != len(d)
                or not all(_is_int(x) and 0 <= x < len(vocab) for x in d)):
            err(f"{where}: d must be up to {TOP_DESCRIPTORS} unique vocab indexes")
        elif not d:
            empty_d += 1
        w = a["w"]
        if not isinstance(w, list) or len(w) != 3 or not all(isinstance(x, str) and HEX_RE.match(x) for x in w):
            err(f"{where}: w must be three lowercase #rrggbb colours")
        elif contrast_ratio(hex_to_rgb(w[2]), ROOM_RGB) < MIN_ACCENT_CONTRAST:
            err(f"{where}: accent {w[2]} is under {MIN_ACCENT_CONTRAST}:1 on #15110d")

    if not isinstance(positions, dict) or sorted(positions) != sorted(STOPS):
        err(f"positions.json must have exactly the keys {list(STOPS)}")
    else:
        for stop in STOPS:
            arr = positions[stop]
            if not isinstance(arr, list) or len(arr) != 2 * n:
                err(f"positions.{stop} must have {2 * n} numbers")
                continue
            bad = [v for v in arr if not isinstance(v, (int, float)) or isinstance(v, bool)
                   or not math.isfinite(v) or abs(v) > 1.0 or round(v, 3) != v]
            if bad:
                err(f"positions.{stop}: {len(bad)} values are not finite, 3-decimal and within [-1, 1]")
            pairs = {(arr[2 * i], arr[2 * i + 1]) for i in range(n)}
            if len(pairs) != n:
                err(f"positions.{stop}: {n - len(pairs)} albums share a position")

    if not isinstance(recs, dict) or sorted(recs) != sorted(STOPS):
        err(f"recs.json must have exactly the keys {list(STOPS)}")
    else:
        for stop in STOPS:
            rows = recs[stop]
            if not isinstance(rows, list) or len(rows) != n:
                err(f"recs.{stop} must have {n} rows")
                continue
            for i, row in enumerate(rows):
                if (not isinstance(row, list) or len(row) != RECS_PER_STOP or len(set(row)) != RECS_PER_STOP
                        or i in row or not all(_is_int(j) and 0 <= j < n for j in row)):
                    err(f"recs.{stop}[{i}] must be {RECS_PER_STOP} unique album ids other than {i}")

    if images:
        _validate_images(out, n, err)

    if errs:
        raise ContractError("\n".join(errs))
    return {"albums": n, "vocab": len(vocab), "no_cover": no_cover, "empty_descriptors": empty_d}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m rmr_pipeline.validate",
                                     description="Check frontcreck/public/data against the data contract.")
    parser.add_argument("--data", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--no-images", action="store_true", help="Skip the sprite sheet checks.")
    args = parser.parse_args(argv)
    try:
        summary = validate_dir(args.data, images=not args.no_images)
    except ContractError as e:
        print("FAIL\n" + str(e), file=sys.stderr)
        return 1
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
