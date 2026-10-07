"""Links the owner gave by hand for albums without audio: audio/fulllength_links.csv (key, url, note). A link
comes before the sheet's link and the search, and is taken for the album without being judged
(rmr_audio.fulllength). Read by the fetch and by the status table: the standard library only."""
import csv
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

LINK_FIELDS = ["key", "url", "note"]
YOUTUBE_HOSTS = ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be")


def hand_link(url: str) -> tuple[str, str]:
    """(source, url) of a hand-given link, in one form: a YouTube video as watch?v=<id>, or as its playlist
    when the address names one (`list=`; not a mix YouTube makes up, `RD...`), without tracking parameters
    (`pp`, `si`, `t`, `index`); a Bandcamp page without its query. ValueError for anything else."""
    u = urlparse((url or "").strip())
    host, q = u.netloc.lower(), parse_qs(u.query)
    if u.scheme in ("http", "https") and host.endswith(".bandcamp.com") and u.path.strip("/"):
        return "bandcamp", f"https://{host}{u.path}"
    if u.scheme in ("http", "https") and host in YOUTUBE_HOSTS:
        video = u.path.strip("/") if host == "youtu.be" else (q.get("v") or [""])[0] if u.path.rstrip("/") == "/watch" else ""
        listed = (q.get("list") or [""])[0]
        if re.fullmatch(r"[\w-]+", listed) and not listed.startswith("RD"):
            return "youtube", "https://www.youtube.com/playlist?list=" + listed
        if re.fullmatch(r"[\w-]+", video):
            return "youtube", "https://www.youtube.com/watch?v=" + video
    raise ValueError(f"{url!r} is neither a YouTube video or playlist nor a Bandcamp page")


def load_links(path: Path, known: set[str]) -> dict[str, tuple[str, str]]:
    """key -> (source, url) of the hand-given links, each brought to one form (hand_link); empty when the
    file is not there. `known`: the catalog's keys. ValueError, naming the line, for another header, a key
    the catalog does not have, a second link for an album, or a link that is not YouTube's or Bandcamp's."""
    if not Path(path).exists():
        return {}
    links = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != LINK_FIELDS:
            raise ValueError(f"{path}: the header must be {','.join(LINK_FIELDS)}")
        for n, r in enumerate(reader, start=2):
            key = (r["key"] or "").strip()
            try:
                if key not in known:
                    raise ValueError(f"{key} is not a key of the catalog")
                if key in links:
                    raise ValueError(f"{key} has a link already")
                links[key] = hand_link(r["url"])
            except ValueError as e:
                raise ValueError(f"{path} line {n}: {e}") from None
    return links
