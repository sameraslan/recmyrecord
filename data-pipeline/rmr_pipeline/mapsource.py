"""Read-only access to the personal-site map outputs (the --map-root argument)."""
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .constants import COVER_PREFIX


@dataclass(frozen=True)
class MapSource:
    root: Path

    def metadata_path(self) -> Path:
        return self.root / "public" / "data" / "metadata.json"

    def features_path(self) -> Path:
        return self.root / "pipeline" / "outputs" / "spotify_features.parquet"

    def atlas_path(self, i: int) -> Path:
        return self.root / "public" / "data" / f"atlas-{i}.webp"

    def check(self, need_atlases: bool) -> None:
        needed = [self.metadata_path(), self.features_path()]
        if need_atlases:
            needed += [self.atlas_path(i) for i in range(4)]
        missing = [str(p) for p in needed if not p.exists()]
        if missing:
            raise FileNotFoundError("map root is missing: " + ", ".join(missing))


def load_metadata(src: MapSource) -> dict[str, dict]:
    """Map metadata records keyed by Spotify URI (clusterId, atlasIndex, atlasUV)."""
    records = json.loads(src.metadata_path().read_text(encoding="utf-8"))
    return {r["id"]: r for r in records}


def load_cover_ids(src: MapSource) -> dict[str, str]:
    """Spotify URI -> i.scdn.co image id ('' when the map has no i.scdn.co cover)."""
    feats = pd.read_parquet(src.features_path(), columns=["spotify_uri", "cover_url"])
    out: dict[str, str] = {}
    for uri, url in zip(feats["spotify_uri"], feats["cover_url"]):
        out[str(uri)] = url[len(COVER_PREFIX):] if isinstance(url, str) and url.startswith(COVER_PREFIX) else ""
    return out
