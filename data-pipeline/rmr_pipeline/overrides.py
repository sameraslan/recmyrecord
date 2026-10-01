"""Manual corrections keyed by slug:
{"<slug>": {"c": coverId, "s": spotifyId, "a": artist, "image": "relative/path.jpg", "note": "why"}}.
An empty `s` means the album has no Spotify release; an empty `c` means it has no Spotify cover
(its `image` still gives the sprites and ambient colours)."""
import json
from pathlib import Path, PurePosixPath, PureWindowsPath

from .slugs import make_slugs
from .validate import COVER_RE, SPOTIFY_RE

ALLOWED = {"c", "s", "a", "image", "note"}


def _is_safe_relative(image: str) -> bool:
    """True when `image` is a plain relative path with no absolute root, drive or `..` segment."""
    for pure in (PurePosixPath(image), PureWindowsPath(image)):
        if pure.is_absolute() or pure.anchor or ".." in pure.parts:
            return False
    return True


def load_overrides(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("overrides.json must be an object keyed by slug")
    for slug, entry in data.items():
        where = f"overrides[{slug!r}]"
        if (not isinstance(entry, dict) or not entry or set(entry) - ALLOWED
                or not all(isinstance(v, str) for v in entry.values())):
            raise ValueError(f"{where} must be an object with string fields among {sorted(ALLOWED)}")
        if "c" in entry and "image" not in entry:
            raise ValueError(f"{where}: a cover correction needs its image, so sprites and colours match it")
        if "c" in entry and entry["c"] and not COVER_RE.match(entry["c"]):
            raise ValueError(f"{where}: cover id {entry['c']!r} must be '' or the last part of an "
                             "i.scdn.co image URL (24 to 64 lowercase hex characters)")
        if "s" in entry and entry["s"] and not SPOTIFY_RE.match(entry["s"]):
            raise ValueError(f"{where}: Spotify id {entry['s']!r} must be '' (no Spotify release) "
                             "or a 22-character album id")
        if "a" in entry and not entry["a"].strip():
            raise ValueError(f"{where}: artist must be a non-empty name")
        if "image" in entry and not entry["image"].strip():
            raise ValueError(f"{where}: image must be a path relative to the overrides file")
        if "image" in entry and not _is_safe_relative(entry["image"]):
            raise ValueError(f"{where}: image {entry['image']!r} must be a relative path inside the "
                             "overrides folder (no absolute paths or '..' segments)")
    return data


def apply_overrides(slugs: list[str], cover_ids: list[str], spotify_ids: list[str],
                    overrides: dict[str, dict[str, str]], base: Path, *, artists: list[str],
                    ) -> tuple[list[str], list[str], dict[int, Path], list[str]]:
    """Returns corrected cover ids, Spotify ids, {album index: sprite image path} and artists.
    `image` paths are relative to `base` (the folder holding overrides.json)."""
    index = {s: i for i, s in enumerate(slugs)}
    covers, spots = list(cover_ids), list(spotify_ids)
    names = list(artists)
    images: dict[int, Path] = {}
    for slug, e in overrides.items():
        if slug not in index:
            raise KeyError(f"overrides.json: unknown slug {slug!r}")
        i = index[slug]
        if "c" in e:
            covers[i] = e["c"]
        if "s" in e:
            spots[i] = e["s"]
        if "a" in e:
            names[i] = e["a"].strip()
        if "image" in e:
            if not _is_safe_relative(e["image"]):
                raise ValueError(f"overrides[{slug!r}]: image {e['image']!r} must be a relative path")
            root = base.resolve()
            p = (base / e["image"]).resolve()
            if not p.is_relative_to(root):
                raise ValueError(f"overrides[{slug!r}]: image {e['image']!r} resolves outside {root}")
            if not p.exists():
                raise FileNotFoundError(p)
            images[i] = p
    return covers, spots, images, names


def slugs_after_overrides(titles: list[str], artists: list[str], slugs: list[str], changed: set[int]) -> list[str]:
    """Slugs from the corrected artists. Only the albums in `changed` (artist corrections) may get a new
    slug; if a corrected artist would collide with, or renumber, any other album, fail instead."""
    new = make_slugs(titles, artists)
    moved = [i for i, (a, b) in enumerate(zip(slugs, new)) if a != b and i not in changed]
    if moved:
        raise ValueError("overrides.json: an artist correction changes the slug of other albums: "
                         + ", ".join(f"{slugs[i]!r} -> {new[i]!r}" for i in moved[:5]))
    return new
