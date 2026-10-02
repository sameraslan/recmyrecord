"""Record the API responses one album's matching asks for, trimmed to the fields the matcher reads,
into tests_audio/fixtures/<name>.json. Run from data-pipeline/ (needs the network):

    .venv-audio/bin/python -m tests_audio.record_fixtures <album slug> <name>

Preview URLs are replaced by placeholders: Deezer's are signed and expire, and no test downloads audio.
"""
import json
import sys
from pathlib import Path

from rmr_audio.catalog import DEFAULT_CACHE, load_catalog
from rmr_audio.match import Http, match_album

FIXTURES = Path(__file__).parent / "fixtures"
KEEP = {"id", "title", "nb_tracks", "artist", "name", "duration", "disk_number", "track_position", "preview", "next",
        "data", "results", "collectionId", "collectionName", "artistName", "artistId", "trackCount", "collectionType",
        "wrapperType", "kind", "trackId", "trackName", "trackTimeMillis", "discNumber", "trackNumber", "previewUrl",
        "error", "code"}


def trim(x):
    if isinstance(x, list):
        return [trim(v) for v in x]
    if isinstance(x, dict):
        out = {k: trim(v) for k, v in x.items() if k in KEEP}
        for k in ("preview", "previewUrl"):
            if out.get(k):
                out[k] = f"https://previews.invalid/{out.get('id') or out.get('trackId')}"
        return out
    return x


class Recorder(Http):
    def __init__(self):
        super().__init__(DEFAULT_CACHE / "http.sqlite")
        self.seen = {}

    def get(self, url, store, fresh=False):
        self.seen[url] = trim(super().get(url, store, fresh))
        return self.seen[url]


def main(slug: str, name: str) -> None:
    album = next(al for al in load_catalog() if al.slug == slug)
    http = Recorder()
    m = match_album(http, album)
    out = {"album": {"key": album.key, "title": album.title, "artist": album.artist, "slug": album.slug,
                     "mean_s": album.mean_s, "means": list(album.means), "override": album.override},
           "expected": m.row(album.key), "responses": http.seen}
    FIXTURES.mkdir(exist_ok=True)
    (FIXTURES / f"{name}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{name}.json: {len(http.seen)} responses, {m}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
