"""CLI: python -m rmr_pipeline.theme [--check]

Copies what the map theme needs out of the design analysis in docs/design/trifid-theme/ into
data-pipeline/theme/weights.json and checks it against the site's album list. The site's theme build
(frontcreck: npm run theme) reads only that copy.

The source is scaling/out/album_weights_10k.json, written by scaling/run_weights10k.py: the colour family
weights of every album of the catalog (the albums the families were fitted on keep theirs, the later ones
are predicted; scaling/WEIGHTS-10K.md).

Not called by rmr_pipeline.build: the analysis needs scikit-learn's ridge on the audio store and is run by
hand whenever albums.json changes (see theme/README.md). Region names are gone from the site (6 October
2026), so nothing here depends on positions.json any more.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from .constants import DEFAULT_OUT, PIPELINE_DIR, REPO
from .io import write_json

DESIGN_DIR = REPO / "docs" / "design" / "trifid-theme"
THEME_DIR = PIPELINE_DIR / "theme"
FAMILIES = ["fierce", "warm", "quiet", "dark", "urban", "neutral"]
WEIGHTS_SOURCE = DESIGN_DIR / "scaling" / "out" / "album_weights_10k.json"


def short_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def slugs_hash(albums: list[dict]) -> str:
    """Changes when an album is added, removed or reordered, which is when the weights go stale."""
    return short_hash("\n".join(a["slug"] for a in albums).encode("utf-8"))


def pack_weights(colour: dict, albums: list[dict]) -> dict:
    """The six colour family shares of every album as integers 0..100, flat, in albums.json order.
    `colour`: {family_order, album_weights, and slugsHash when the table says which album list it is for}."""
    again = "rerun docs/design/trifid-theme/scaling/run_weights10k.py"
    if colour["family_order"] != FAMILIES:
        raise ValueError(f"the weights table's family_order is {colour['family_order']}, expected {FAMILIES}")
    rows = colour["album_weights"]
    if len(rows) != len(albums):
        raise ValueError(f"the weights table has {len(rows)} weight rows but albums.json has {len(albums)} albums ({again})")
    if colour.get("slugsHash", slugs_hash(albums)) != slugs_hash(albums):
        raise ValueError(f"the weights table was made for another album list ({again})")
    flat: list[int] = []
    for i, row in enumerate(rows):
        if len(row) != len(FAMILIES) or abs(sum(row) - 1) > 0.03:
            raise ValueError(f"weights row {i} does not hold six shares that sum to 1: {row}")
        flat.extend(round(v * 100) for v in row)
    return {"n": len(albums), "families": FAMILIES, "slugsHash": slugs_hash(albums), "weights": flat}


def validate(weights: dict, albums: list[dict]) -> list[str]:
    """Every way weights.json can disagree with the site data. An empty list means it is usable."""
    errors = []
    n = len(albums)
    again = "rerun docs/design/trifid-theme/scaling/run_weights10k.py, then python -m rmr_pipeline.theme"
    w = weights.get("weights", [])
    if weights.get("n") != n:
        errors.append(f"weights.json: n is {weights.get('n')} but albums.json has {n} albums")
    if weights.get("families") != FAMILIES:
        errors.append(f"weights.json: families must be {FAMILIES}")
    if len(w) != 6 * n:
        errors.append(f"weights.json: {len(w)} values, expected {6 * n}")
    elif any(not isinstance(v, int) or v < 0 or v > 100 for v in w):
        errors.append("weights.json: every value must be an integer from 0 to 100")
    else:
        bad = [i for i in range(n) if not 97 <= sum(w[6 * i:6 * i + 6]) <= 103]
        if bad:
            errors.append(f"weights.json: {len(bad)} rows do not sum to about 100 (first: album {bad[0]})")
    if weights.get("slugsHash") != slugs_hash(albums):
        errors.append(f"weights.json: slugsHash does not match albums.json (albums changed; {again})")
    return errors


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build(source: Path = WEIGHTS_SOURCE, data: Path = DEFAULT_OUT) -> dict:
    return pack_weights(_read(source), _read(data / "albums.json"))


def check(theme_dir: Path = THEME_DIR, data: Path = DEFAULT_OUT) -> list[str]:
    """Validates the committed copy against the site data as it is now."""
    return validate(_read(theme_dir / "weights.json"), _read(data / "albums.json"))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_pipeline.theme",
                                description="Copy the theme's colour weights from the design analysis into data-pipeline/theme.")
    p.add_argument("--check", action="store_true", help="Only validate the committed file against the site data.")
    args = p.parse_args(argv)
    if args.check:
        errors = check()
    else:
        try:
            weights = build()
        except ValueError as e:
            print(e, file=sys.stderr)
            return 1
        errors = validate(weights, _read(DEFAULT_OUT / "albums.json"))
        if not errors:
            size = write_json(THEME_DIR / "weights.json", weights)
            print(f"theme weights written to {THEME_DIR} ({weights['n']} albums, {size // 1024} KB)")
    for e in errors:
        print(e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
