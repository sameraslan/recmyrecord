"""Manual corrections keyed by slug: {"<slug>": {"c": coverId, "s": spotifyId, "image": "relative/path.jpg", "note": "why"}}."""
import json
from pathlib import Path

ALLOWED = {"c", "s", "image", "note"}


def load_overrides(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("overrides.json must be an object keyed by slug")
    for slug, entry in data.items():
        if (not isinstance(entry, dict) or not entry or set(entry) - ALLOWED
                or not all(isinstance(v, str) for v in entry.values())):
            raise ValueError(f"overrides[{slug!r}] must be an object with string fields among {sorted(ALLOWED)}")
        if "c" in entry and "image" not in entry:
            raise ValueError(f"overrides[{slug!r}]: a cover correction needs its image, so sprites and colours match it")
    return data


def apply_overrides(slugs: list[str], cover_ids: list[str], spotify_ids: list[str],
                    overrides: dict[str, dict[str, str]], base: Path) -> tuple[list[str], list[str], dict[int, Path]]:
    """Returns corrected cover ids, corrected Spotify ids and {album index: sprite image path}.
    `image` paths are relative to `base` (the folder holding overrides.json)."""
    index = {s: i for i, s in enumerate(slugs)}
    covers, spots = list(cover_ids), list(spotify_ids)
    images: dict[int, Path] = {}
    for slug, e in overrides.items():
        if slug not in index:
            raise KeyError(f"overrides.json: unknown slug {slug!r}")
        i = index[slug]
        if "c" in e:
            covers[i] = e["c"]
        if "s" in e:
            spots[i] = e["s"]
        if "image" in e:
            p = (base / e["image"]).resolve()
            if not p.exists():
                raise FileNotFoundError(p)
            images[i] = p
    return covers, spots, images
