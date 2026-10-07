"""Record the API responses one album's matching asks for, trimmed to the fields the matcher reads,
into tests_audio/fixtures/<name>.json. Run from data-pipeline/ (needs the network):

    .venv-audio/bin/python -m tests_audio.record_fixtures <album slug or key> <name>

Responses already in the local cache (.cache/audio/http.sqlite, filled by a sync, a match or a dry run)
are taken from it, so an album matched before is recorded without a request.
Preview URLs are replaced by placeholders: Deezer's are signed and expire, and no test downloads audio.
"""
import dataclasses
import json
import sys
from pathlib import Path

from rmr_audio.catalog import DEFAULT_CACHE, load_catalog
from rmr_audio.match import Http, match_album

FIXTURES = Path(__file__).parent / "fixtures"
KEEP = {"id", "title", "nb_tracks", "artist", "name", "duration", "disk_number", "track_position", "preview", "next",
        "data", "results", "collectionId", "collectionName", "artistName", "artistId", "trackCount", "collectionType",
        "wrapperType", "kind", "trackId", "trackName", "trackTimeMillis", "discNumber", "trackNumber", "previewUrl",
        "error", "code", "record_type", "resultCount"}


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

    def get(self, url, store, fresh=False, search=False):
        self.seen[url] = trim(super().get(url, store, fresh, search))
        return self.seen[url]


def main(slug: str, name: str) -> None:
    album = next(al for al in load_catalog() if slug in (al.slug, al.key))
    http = Recorder()
    m = match_album(http, album)
    out = {"album": {**dataclasses.asdict(album), "means": list(album.means)},
           "expected": m.row(album.key), "responses": http.seen}
    FIXTURES.mkdir(exist_ok=True)
    (FIXTURES / f"{name}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{name}.json: {len(http.seen)} responses, {m}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
