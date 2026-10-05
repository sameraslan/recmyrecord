"""CLI: python -m rmr_pipeline.theme [--check]

Copies what the map theme needs out of the design analysis in docs/design/trifid-theme/ into
data-pipeline/theme/ (weights.json, regions.json) and checks both against the site's data files.
The site's theme build (frontcreck: npm run theme) reads only those two copies.

Not called by rmr_pipeline.build: the design analysis is not reproducible from the feature table yet,
so these files are refreshed by hand whenever albums.json or positions.json change (see theme/README.md).
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

from .constants import DEFAULT_OUT, PIPELINE_DIR, REPO, STOPS
from .io import write_json

DESIGN_DIR = REPO / "docs" / "design" / "trifid-theme"
THEME_DIR = PIPELINE_DIR / "theme"
FAMILIES = ["fierce", "warm", "quiet", "dark", "urban", "neutral"]
REGION_KEYS = ("id", "name", "word", "strength", "level", "n", "priority", "cx", "cy", "radius")


def short_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def slugs_hash(albums: list[dict]) -> str:
    """Changes when an album is added, removed or reordered, which is when the weights go stale."""
    return short_hash("\n".join(a["slug"] for a in albums).encode("utf-8"))


def pack_weights(colour: dict, albums: list[dict]) -> dict:
    """The six colour family shares of every album as integers 0..100, flat, in albums.json order."""
    if colour["family_order"] != FAMILIES:
        raise ValueError(f"colour.json family_order is {colour['family_order']}, expected {FAMILIES}")
    rows = colour["album_weights"]
    if len(rows) != len(albums):
        raise ValueError(f"colour.json has {len(rows)} weight rows but albums.json has {len(albums)} albums")
    flat: list[int] = []
    for i, row in enumerate(rows):
        if len(row) != len(FAMILIES) or abs(sum(row) - 1) > 0.03:
            raise ValueError(f"weights row {i} does not hold six shares that sum to 1: {row}")
        flat.extend(round(v * 100) for v in row)
    return {"n": len(albums), "families": FAMILIES, "slugsHash": slugs_hash(albums), "weights": flat}


def _priority(strength: str, n: int, margin: float) -> float:
    """Strong before fair, then size, then how far the name word stands clear of the runner-up."""
    return round((2 if strength == "strong" else 1) + n / 1000 + margin / 100, 4)


def hand_balanced(hand: dict) -> list[dict]:
    """The hand-made Balanced regions (regions/regions.json), every one of which has a place name."""
    out = []
    for r in hand["regions"]:
        e = r["name_evidence"]
        margin = e["coverage"] - e.get("max_other_region", 0) if "word" in e else abs(e.get("z", 0)) / 10
        out.append({
            "id": r["id"], "name": r["name_space"], "word": e.get("word") or e.get("feature"),
            "strength": r["strength"], "level": 1, "n": r["n"],
            "priority": _priority(r["strength"], r["n"], margin),
            "cx": round(r["cx"], 4), "cy": round(r["cy"], 4), "radius": round(r["radius"], 4),
        })
    return out


def auto_named(stop_data: dict) -> list[dict]:
    """Automated regions of one stop (scaling/out/regions_all.json): level 1 with an approved place name only."""
    out = []
    for k, r in enumerate(stop_data["regions"]):
        if r.get("level", 1) != 1 or not r.get("name"):
            continue
        n = r.get("n") or sum(1 for x in stop_data["album_region"] if x == k)
        out.append({
            "id": r["id"], "name": r["name"], "word": r["word"], "strength": r["strength"], "level": 1, "n": n,
            "priority": round(r["priority"], 4),
            "cx": round(r["cx"], 4), "cy": round(r["cy"], 4), "radius": round(r["radius"], 4),
        })
    return out


def _region_errors(stop: str, rows) -> list[str]:
    if not isinstance(rows, list) or not rows:
        return [f"regions.json: {stop} has no regions"]
    errors = []
    ids = [r.get("id") for r in rows]
    if len(set(ids)) != len(ids):
        errors.append(f"regions.json: {stop} repeats a region id")
    for r in rows:
        where = f"regions.json: {stop} region {r.get('id')!r}"
        if tuple(r) != REGION_KEYS:
            errors.append(f"{where} has keys {sorted(r)}, expected {list(REGION_KEYS)}")
            continue
        if not isinstance(r["name"], str) or not r["name"].strip():
            errors.append(f"{where} has no place name")
        if r["strength"] not in ("strong", "fair") or r["level"] != 1:
            errors.append(f"{where} must be a level 1 region of strength strong or fair")
        if not isinstance(r["n"], int) or r["n"] < 1:
            errors.append(f"{where} has no album count")
        numbers = [r["priority"], r["cx"], r["cy"], r["radius"]]
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in numbers) or max(abs(r["cx"]), abs(r["cy"])) > 2:
            errors.append(f"{where} has a priority, centre or radius that is not a sensible number")
    return errors


def validate(weights: dict, regions: dict, albums: list[dict], positions_bytes: bytes) -> list[str]:
    """Every way the two input files can disagree with the site data. An empty list means they are usable."""
    errors = []
    n = len(albums)
    again = "rerun the analysis in docs/design/trifid-theme, then python -m rmr_pipeline.theme"
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
    if regions.get("positionsHash") != short_hash(positions_bytes):
        errors.append(f"regions.json: positionsHash does not match positions.json (layouts changed; {again})")
    for stop in STOPS:
        errors.extend(_region_errors(stop, regions.get(stop)))
    return errors


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build(design: Path = DESIGN_DIR, data: Path = DEFAULT_OUT) -> tuple[dict, dict]:
    albums = _read(data / "albums.json")
    auto = _read(design / "scaling" / "out" / "regions_all.json")
    weights = pack_weights(_read(design / "regions" / "colour.json"), albums)
    regions = {
        "positionsHash": short_hash((data / "positions.json").read_bytes()),
        "sonic": auto_named(auto["sonic"]),
        "balanced": hand_balanced(_read(design / "regions" / "regions.json")),
        "mood": auto_named(auto["mood"]),
    }
    return weights, regions


def check(theme_dir: Path = THEME_DIR, data: Path = DEFAULT_OUT) -> list[str]:
    """Validates the committed copies against the site data as it is now."""
    return validate(_read(theme_dir / "weights.json"), _read(theme_dir / "regions.json"),
                    _read(data / "albums.json"), (data / "positions.json").read_bytes())


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_pipeline.theme",
                                description="Copy the theme's inputs from the design analysis into data-pipeline/theme.")
    p.add_argument("--check", action="store_true", help="Only validate the committed files against the site data.")
    args = p.parse_args(argv)
    if args.check:
        errors = check()
    else:
        weights, regions = build()
        errors = validate(weights, regions, _read(DEFAULT_OUT / "albums.json"),
                          (DEFAULT_OUT / "positions.json").read_bytes())
        if not errors:
            size = write_json(THEME_DIR / "weights.json", weights) + write_json(THEME_DIR / "regions.json", regions)
            counts = ", ".join(f"{s} {len(regions[s])}" for s in STOPS)
            print(f"theme inputs written to {THEME_DIR} ({size // 1024} KB; named regions: {counts})")
    for e in errors:
        print(e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
