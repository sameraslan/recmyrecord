"""Cover sources for the catalog's new albums: which image each one shows, and its 96 px sprite.

The existing albums take their cover id and sprite from the map (mapsource.py, images.py). A new album
(a row of catalog/albums.csv with no `legacy_uri`) has neither, so this module finds one image per album
and records it in catalog/covers.csv as `rym_id,source,ref`. It does the same, from Spotify alone, for an
existing album whose Spotify link on the sheet is another release than its `legacy_uri` (relinked_albums; the
owner's decision of 6 October 2026: the sheet's link wins, and the cover follows the link). Their rows come
first in covers.csv, as they do in the catalog. Sources, best first:

    spotify   the catalog's Spotify link, asked from Spotify's oEmbed endpoint (no account). `ref` is the image
              id as the site stores it today: what follows https://i.scdn.co/image/.
    deezer    the album's store listing: the one match_overrides.json forces, else the one in audio/matches.csv,
    apple     else the catalog's Deezer link, else its Apple Music link. Read from the audio stage's response
              cache (tier `cache`, no network); a listing the cache lacks is asked from the store (tier `store`).
              `ref` is Deezer's image md5, or the path of Apple's artwork.
    bandcamp  the `og:image` of the catalog's Bandcamp page. `ref` is the image's number.
    youtube   the catalog's YouTube link, else the link the audio stage embedded (audio/fulllength.csv).
              `ref` is the video id; the image is a frame of the video, not a cover. No network.

A tier never spends a request on an album that a better source may still answer: Bandcamp is not asked while
the album's Spotify lookup is neither done nor failed. The `cache` tier is the exception, since it costs
nothing: it gives every album it can a row at once, and the Spotify tier replaces that row later.

catalog/covers_skip.csv (`rym_id,source,ref,note`, written by hand) names the rows whose image is not a cover
(a video frame with a track list, a "FULL ALBUM" card). Such a row gives no cover (cover_for: no `c`, no
sprite) for as long as covers.csv has exactly that `source:ref` for the album; the row stays in covers.csv, so
`refs` does not find the same image again, and `sprites` does not fetch it.

    python -m rmr_pipeline.covers refs      # (re)writes catalog/covers.csv; resumable
    python -m rmr_pipeline.covers sprites   # one 96 px JPEG per row in .cache/covers/96/ (not committed)
    python -m rmr_pipeline.covers status
    python -m rmr_pipeline.covers adopt     # record the sprites that have no entry in the manifest as made from their rows

`sprites` records the `source:ref` each sprite was made from in .cache/covers/96.manifest.json. A sprite whose
entry is not its row's image counts as missing: it is not used by the build and is made again. A sprite with
no entry (made before the manifest existed, or by a run that was killed) is used, and counted by the build and
by `status`, until `adopt` records it. An album whose image `sprites` could not fetch for a reason of the image's
own (the state file's `sprites`) has no cover in the build: its `c` is empty (Covers.is_gone).

One `refs` run and one `sprites` run at a time: each holds a lock file beside the state file (refs.lock,
sprites.lock) and a second run exits with code 1. Reading (`status`, --dry-run, the build) takes no lock.

The build calls cover_for(key) for a new album; cover_url(c, px) is the URL form of each kind of cover id,
which the frontend mirrors.

Requests go only to the hosts in ALLOWED_HOSTS and ALLOWED_SUFFIXES (never to rateyourmusic.com), spaced per
host, with a User-Agent that names the project. HTTP 403 or 429 (or Deezer's quota error) twice in a row from a
host, or five times in a run, stops the run with exit code 2. An album whose lookup failed for a reason of its
own (HTTP 404 or 410, no image on the page, a redirect to a host that is not allowed) is written to
.cache/covers/state.json and not asked again without --retry-failed; a refused or unanswered request, or any
other status, is not written there, so the album is asked again by the next run.

This module imports nothing from the rest of the pipeline and uses the standard library and Pillow only.
"""
import argparse
import csv
import fcntl
import http.client
import io
import json
import os
import re
import signal
import sqlite3
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageOps, ImageStat

PIPELINE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ALBUMS = PIPELINE_DIR / "catalog" / "albums.csv"
DEFAULT_COVERS = PIPELINE_DIR / "catalog" / "covers.csv"
DEFAULT_SKIP = PIPELINE_DIR / "catalog" / "covers_skip.csv"
DEFAULT_MATCHES = PIPELINE_DIR / "audio" / "matches.csv"
DEFAULT_MATCH_OVERRIDES = PIPELINE_DIR / "audio" / "match_overrides.json"
DEFAULT_FULLLENGTH = PIPELINE_DIR / "audio" / "fulllength.csv"
DEFAULT_HTTP_CACHE = PIPELINE_DIR / ".cache" / "audio" / "http.sqlite"  # the audio stage's; only ever read here
DEFAULT_CACHE = PIPELINE_DIR / ".cache" / "covers"  # gitignored: the sprites and the state file
DEFAULT_SPRITES = DEFAULT_CACHE / "96"
DEFAULT_STATE = DEFAULT_CACHE / "state.json"
GONE_STATUS = (404, 410)  # the only answers that say "this page will not come back"

SOURCES = ("spotify", "deezer", "apple", "bandcamp", "youtube")
TIERS = ("spotify", "cache", "store", "bandcamp", "youtube")  # in priority order; a run takes them in this order
TIER_RANK = {"spotify": 0, "cache": 1, "store": 1, "bandcamp": 2, "youtube": 3}
SOURCE_RANK = {"spotify": 0, "deezer": 1, "apple": 1, "bandcamp": 2, "youtube": 3}
C_PREFIX = {"deezer": "dz:", "apple": "am:", "bandcamp": "bc:", "youtube": "yt:"}  # Spotify's id is stored bare

ALLOWED_HOSTS = {"open.spotify.com", "i.scdn.co", "api.deezer.com", "cdn-images.dzcdn.net", "e-cdns-images.dzcdn.net",
                 "itunes.apple.com", "f4.bcbits.com", "i.ytimg.com"}
ALLOWED_SUFFIXES = (".spotifycdn.com", ".mzstatic.com", ".bandcamp.com")
USER_AGENT = "recmyrecord-covers/1.0 (+https://github.com/sameraslan/recmyrecord; one small cover image per album)"

SPRITE_PX = 96
SPRITE_QUALITY = 90
SAVE_EVERY = 50  # albums between two saves of covers.csv and the state file
PROGRESS_S = 60.0
REFS_INTERVALS = {"open.spotify.com": 1.0, "bandcamp": 3.0, "api.deezer.com": 0.2, "itunes.apple.com": 3.2}  # the last two: rmr_audio's
SPRITES_INTERVAL = 0.5  # between any two image requests
SPRITES_INTERVALS = {"f4.bcbits.com": 1.0}
BACKOFF_S = 30.0  # a host that refused a request is left alone this long
RETRY_S = 5.0  # before the one retry of a request that got no answer or a 5xx
LIMITED_IN_A_ROW, LIMITED_IN_A_RUN = 2, 5  # HTTP 403/429 answers that stop the run
DOWN_AFTER = 5  # requests in a row without a usable answer: the network is down, stop
PAGE_BYTES = 512 * 1024  # of a Bandcamp page; og:image is in its head
IMAGE_BYTES = 4 * 1024 * 1024

SPOTIFY_PREFIX = "ab67616d0000b273"  # 640 px, the form of nearly every `c` on the site; 1e02 is 300 px, 4851 64 px
SPOTIFY_ALBUM = re.compile(r"open\.spotify\.com/(?:intl-[a-z]{2}/)?album/([A-Za-z0-9]{22})")
SPOTIFY_IMAGE = re.compile(r"^https://(?:i\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)/image/([0-9a-f]{40})\Z")
DEEZER_LINK = re.compile(r"deezer\.com/(?:[a-z]{2}/)?album/(\d+)")  # as rmr_audio/catalog.py reads the links
APPLE_LINK = re.compile(r"music\.apple\.com/([a-z]{2})/album/(?:[^/?#]+/)?(\d+)")
APPLE_ART = re.compile(r"^https://is\d-ssl\.mzstatic\.com/image/thumb/([^\s?#]+)/100x100bb\.jpg\Z")
OG_IMAGE = re.compile(r"""<meta\b(?=[^>]*\bproperty=["']og:image["'])[^>]*\bcontent=["']([^"']+)["']""", re.I)
BANDCAMP_ART = re.compile(r"^https://f\d\.bcbits\.com/img/a(\d+)_\d+\.(?:jpg|png)\Z")  # `a`: album art, not the band's photo
YOUTUBE_ID = re.compile(r"(?:youtube\.com/watch\?(?:[^#]*&)?v=|youtu\.be/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])")
SAFE_NAME = re.compile(r"[A-Za-z0-9_-]+")  # used with fullmatch: `$` would let a trailing newline through
DEEZER_SIZES = (56, 250, 500, 1000)
BANDCAMP_SIZES = ((100, 3), (210, 9), (350, 2), (700, 16), (1200, 10))  # px, the file name's suffix


# --- refs and URLs (pure) --------------------------------------------------------------------------

def spotify_album_id(url: str) -> str:
    """The album id of a Spotify album link, or ""."""
    m = SPOTIFY_ALBUM.search(url or "")
    return m.group(1) if m else ""


def oembed_url(album_id: str) -> str:
    return "https://open.spotify.com/oembed?url=" + urllib.parse.quote(f"https://open.spotify.com/album/{album_id}", safe="")


def spotify_ref(image_url: str) -> str:
    """The image id of a Spotify cover URL in the site's form (the 640 px prefix), or "" for another URL."""
    m = SPOTIFY_IMAGE.match(image_url or "")
    if not m:
        return ""
    return SPOTIFY_PREFIX + m.group(1)[16:] if m.group(1).startswith("ab67616d") else m.group(1)


def apple_ref(artwork_url: str) -> str:
    """The artwork path of an iTunes `artworkUrl100` (between /image/thumb/ and /100x100bb.jpg), or "" (also
    for a path with an empty, `.` or `..` segment)."""
    m = APPLE_ART.match(artwork_url or "")
    if not m or any(part in ("", ".", "..") for part in m.group(1).split("/")):  # the path goes into a URL as it is
        return ""
    return m.group(1)


def bandcamp_ref(html: str) -> str:
    """The number of the album art a Bandcamp page names in og:image, or ""."""
    m = OG_IMAGE.search(html)
    art = BANDCAMP_ART.match(m.group(1)) if m else None
    return art.group(1) if art else ""


def youtube_ref(url: str) -> str:
    """The video id of a YouTube link, or "" (a playlist has no frame of its own)."""
    m = YOUTUBE_ID.search(url or "")
    return m.group(1) if m else ""


def deezer_url(album_id: str) -> str:
    return f"https://api.deezer.com/album/{album_id}"


def deezer_tracks_url(album_id: str) -> str:
    """The track list rmr_audio asks for. Each track carries the album's image md5, and for a listing found by
    search it is the only answer the cache has."""
    return f"https://api.deezer.com/album/{album_id}/tracks?limit=200"


def apple_cached_url(album_id: str, storefront: str) -> str:
    """The lookup rmr_audio makes for a listing, which is the URL its cache knows the answer by."""
    return f"https://itunes.apple.com/lookup?id={album_id}&entity=song&limit=200&country={storefront}"


def apple_url(album_id: str, storefront: str) -> str:
    """The lookup this module makes: the collection alone, without its songs."""
    return f"https://itunes.apple.com/lookup?id={album_id}&country={storefront}"


def listing_ref(source: str, body: object) -> tuple[str, str] | None:
    """(cover source, ref) from a store's answer for a listing (`deezer`, `itunes:<cc>`), or None when it has no cover."""
    if not isinstance(body, dict):
        return None
    if source == "deezer":  # the album object, or its track list
        heads = body["data"][:1] if isinstance(body.get("data"), list) else [body]
        md5 = (heads[0].get("md5_image") or "") if heads and isinstance(heads[0], dict) else ""
        return ("deezer", md5) if re.fullmatch(r"[0-9a-f]{32}", md5) else None
    for r in body.get("results") or []:
        if r.get("wrapperType") == "collection" and (ref := apple_ref(r.get("artworkUrl100") or "")):
            return "apple", ref
    return None


def c_field(source: str, ref: str) -> str:
    """The album's `c` in albums.json: the bare image id for Spotify (today's form), `dz:<md5>`, `am:<path>`,
    `bc:<number>`, `yt:<video id>` for the others."""
    return C_PREFIX.get(source, "") + ref


def cover_url(c: str, px: int) -> str:
    """The URL of the cover `c` at about `px` pixels (the smallest rendition at least that wide, where the host
    has fixed sizes), or "" when `c` is empty.

        <id>        https://i.scdn.co/image/<id>; an id that starts with ab67616d gets the size prefix
                    ab67616d00004851 (64 px), ab67616d00001e02 (300) or ab67616d0000b273 (640)
        dz:<md5>    https://cdn-images.dzcdn.net/images/cover/<md5>/<N>x<N>-000000-80-0-0.jpg, N in 56, 250, 500, 1000
        am:<path>   https://is1-ssl.mzstatic.com/image/thumb/<path>/<px>x<px>bb.jpg, any size
        bc:<n>      https://f4.bcbits.com/img/a<n>_<s>.jpg, s = 3 (100 px), 9 (210), 2 (350), 16 (700), 10 (1200)
        yt:<id>     https://i.ytimg.com/vi/<id>/hqdefault.jpg: a 480 x 360 video frame, with black bars above and
                    below a 16:9 picture; show its centre square (see crop_frame)
    """
    if not c:
        return ""
    kind, _, ref = c.partition(":")
    if kind == "dz":
        n = next((s for s in DEEZER_SIZES if s >= px), DEEZER_SIZES[-1])
        return f"https://cdn-images.dzcdn.net/images/cover/{ref}/{n}x{n}-000000-80-0-0.jpg"
    if kind == "am":
        return f"https://is1-ssl.mzstatic.com/image/thumb/{ref}/{px}x{px}bb.jpg"
    if kind == "bc":
        suffix = next((s for size, s in BANDCAMP_SIZES if size >= px), BANDCAMP_SIZES[-1][1])
        return f"https://f4.bcbits.com/img/a{ref}_{suffix}.jpg"
    if kind == "yt":
        return f"https://i.ytimg.com/vi/{ref}/hqdefault.jpg"
    if c.startswith("ab67616d") and len(c) > 16:
        prefix = "ab67616d00004851" if px <= 64 else "ab67616d00001e02" if px <= 300 else SPOTIFY_PREFIX
        return "https://i.scdn.co/image/" + prefix + c[16:]
    return "https://i.scdn.co/image/" + c


def sprite_url(source: str, ref: str) -> str:
    """The small rendition a sprite is made from: Spotify 300 px, Deezer 250, Apple 200, Bandcamp 350, YouTube 480 x 360."""
    return cover_url(c_field(source, ref), {"spotify": 300, "deezer": 250, "apple": 200, "bandcamp": 350, "youtube": 480}[source])


# --- the polite client -----------------------------------------------------------------------------

class HostNotAllowed(ValueError):
    """The URL is not https or its host is not on the allow-list: no request is made."""


class Gone(IOError):
    """This lookup failed for a reason of the album's own (HTTP 404 or 410, no image on the page, a redirect to
    a host that is not allowed): recorded, not asked again."""


class Transient(IOError):
    """No usable answer (network error, 5xx after one retry, a status other than 200, 404 and 410): not
    recorded, asked again by the next run."""


class RateLimited(Transient):
    """HTTP 403 or 429. Not recorded against the album."""


class StopRun(Exception):
    """The stop rule: the host is refusing requests, or nothing answers."""


class Interrupted(Exception):
    """The run was asked to stop (SIGINT, SIGTERM)."""


class Locked(RuntimeError):
    """Another run holds the lock file."""


def allowed(url: str) -> bool:
    """Is the URL https, without credentials, on the default port, on a host this module may ask?"""
    try:
        parts = urllib.parse.urlsplit(url)
        host = (parts.hostname or "").lower()
        port = parts.port  # raises ValueError for a port that is not a number
    except ValueError:
        return False
    if parts.scheme != "https" or parts.username is not None or not host or port not in (None, 443):
        return False
    return host in ALLOWED_HOSTS or any(host.endswith(s) and len(host) > len(s) for s in ALLOWED_SUFFIXES)


def check_host(url: str) -> None:
    if not allowed(url):
        raise HostNotAllowed(f"not on the allow-list: {url[:120]}")


def host_key(url: str) -> str:
    """What requests are spaced and counted by: the host, with every Bandcamp subdomain as one (`bandcamp`)."""
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    return "bandcamp" if host.endswith(".bandcamp.com") else host


class _CheckedRedirects(urllib.request.HTTPRedirectHandler):
    """A redirect is followed only to an allowed host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_CheckedRedirects)


def http_get(url: str, max_bytes: int) -> tuple[int, bytes]:
    """(status, at most max_bytes of the body). An HTTP error status is returned, not raised."""
    check_host(url)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    try:
        with _OPENER.open(req, timeout=30) as r:
            return r.status, r.read(max_bytes)
    except urllib.error.HTTPError as e:
        return e.code, b""


class Fetcher:
    """GET, spaced per host (`intervals`, by host_key) and overall, with the stop rule. `fetch` is http_get
    unless a test passes its own; `stop` says whether the run was asked to end, and cuts a wait short."""

    def __init__(self, intervals: dict[str, float], overall: float = 0.0, fetch=http_get, sleep=time.sleep,
                 clock=time.monotonic, backoff: float = BACKOFF_S, stop=lambda: False):
        self.intervals, self.overall, self.fetch, self.sleep, self.clock = intervals, overall, fetch, sleep, clock
        self.backoff, self.stop = backoff, stop
        self._next: dict[str, float] = {}
        self._next_any = 0.0
        self.requests = 0
        self.limited_run = 0
        self.limited_row: Counter = Counter()  # host -> 403/429 answers in a row
        self.unanswered = 0  # requests in a row with no usable answer

    def _pause(self, seconds: float) -> None:
        end = self.clock() + seconds
        while (left := end - self.clock()) > 0:
            if self.stop():
                raise Interrupted()
            self.sleep(min(0.5, left))

    def _wait(self, key: str) -> None:
        now = self.clock()
        start = max(now, self._next.get(key, 0.0), self._next_any)
        self._pause(start - now)
        self._next[key] = start + self.intervals.get(key, 0.0)
        self._next_any = start + self.overall

    def refused(self, url: str, what: str) -> None:
        """Count a refusal (HTTP 403/429, Deezer's quota error) and raise: StopRun by the stop rule, else RateLimited."""
        key = host_key(url)
        self.limited_run += 1
        self.limited_row[key] += 1
        self._next[key] = self.clock() + self.backoff
        if self.limited_row[key] >= LIMITED_IN_A_ROW:
            raise StopRun(f"{key} answered {what}, {self.limited_row[key]} times in a row")
        if self.limited_run >= LIMITED_IN_A_RUN:
            raise StopRun(f"{key} answered {what}: {self.limited_run} refused requests in this run")
        raise RateLimited(what)

    def get(self, url: str, max_bytes: int = IMAGE_BYTES, refusal=None) -> bytes:
        """The body of a 200. Raises HostNotAllowed for a URL that is not allowed (no request), Gone for HTTP
        404 or 410 and for a redirect to a host that is not allowed, RateLimited or StopRun for a refusal,
        Transient for anything else. `refusal(body)` names a refusal that a host sends as a 200 (Deezer's quota
        error), or returns ""; it is asked before the 200 ends the host's row of refusals."""
        check_host(url)
        key, why = host_key(url), ""
        for attempt in range(2):
            if attempt:
                self._pause(RETRY_S)
            self._wait(key)
            self.requests += 1
            try:
                status, body = self.fetch(url, max_bytes)
            except HostNotAllowed as e:  # raised by the redirect handler: the host answered, with a way out
                self.limited_row[key] = 0
                self.unanswered = 0
                raise Gone(f"redirected to a host that is {e}") from None
            except (OSError, http.client.HTTPException) as e:
                why = f"{type(e).__name__}: {e}"[:120]
                continue
            if status in (403, 429):
                self.refused(url, f"HTTP {status}")
            if status >= 500:
                why = f"HTTP {status}"
                continue
            if status == 200 and refusal is not None and (what := refusal(body)):
                self.unanswered = 0
                self.refused(url, what)
            self.limited_row[key] = 0
            self.unanswered = 0
            if status in GONE_STATUS:
                raise Gone(f"HTTP {status}")
            if status != 200:
                raise Transient(f"HTTP {status}")
            return body
        self.unanswered += 1
        if self.unanswered >= DOWN_AFTER:
            raise StopRun(f"{self.unanswered} requests in a row got no answer (last: {why})")
        raise Transient(why)


# --- the files -------------------------------------------------------------------------------------

def write_atomic(path: Path, data: bytes) -> None:
    """Write beside `path`, then rename over it: a reader never sees half a file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.chmod(tmp, path.stat().st_mode & 0o777 if path.exists() else 0o644)  # mkstemp makes it 0600
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def take_lock(path: Path):
    """An exclusive, non-blocking flock on `path` (created if need be), held until the returned file is closed.
    Raises Locked when another run holds it. As rmr_audio's locks: the file stays, the lock goes with the process."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    f = open(path, "a")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        raise Locked(str(path)) from None
    return f


def lock_path(state_path: Path, command: str) -> Path:
    """The lock file of `refs` or of `sprites`: beside the state file (.cache/covers/refs.lock, sprites.lock)."""
    return Path(state_path).with_name(f"{command}.lock")


def _held(lock: Path, command: str) -> str:
    return (f"{lock} is held by another `{command}` run: not starting. Two runs would lose each other's work; "
            "wait for it to end (status and --dry-run can be used meanwhile)")


def read_covers(path: Path = DEFAULT_COVERS) -> dict[str, tuple[str, str]]:
    """covers.csv as rym_id -> (source, ref), in file order; {} when there is no file yet (load_covers says
    whether there was one: Covers.found)."""
    path = Path(path)
    if not path.exists():
        return {}
    out: dict[str, tuple[str, str]] = {}
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["source"] not in SOURCES or not row["ref"]:
                raise ValueError(f"{path}: {row['rym_id']}: unknown source or empty ref ({row['source']!r}, {row['ref']!r})")
            out[row["rym_id"]] = (row["source"], row["ref"])
    return out


def write_covers(path: Path, covers: dict[str, tuple[str, str]], order: list[str]) -> None:
    """Write covers.csv with its rows in `order` (the catalog's). A row of an album that is not in `order` is
    kept, after the others, in the order `covers` has it: a run on another --albums file does not drop rows."""
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["rym_id", "source", "ref"])
    w.writerows([k, *covers[k]] for k in order if k in covers)
    known = set(order)
    w.writerows([k, *v] for k, v in covers.items() if k not in known)
    write_atomic(path, buf.getvalue().encode("utf-8"))


def read_skips(path: Path = DEFAULT_SKIP) -> set[tuple[str, str]]:
    """covers_skip.csv as {(rym_id, `source:ref`)}: the rows of covers.csv that are not a cover. Empty when
    there is no file."""
    path = Path(path)
    if not path.exists():
        return set()
    out = set()
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["source"] not in SOURCES or not row["ref"]:
                raise ValueError(f"{path}: {row['rym_id']}: unknown source or empty ref ({row['source']!r}, {row['ref']!r})")
            out.add((row["rym_id"], made_from((row["source"], row["ref"]))))
    return out


def without_skipped(covers: dict[str, tuple[str, str]], skips) -> dict[str, tuple[str, str]]:
    """`covers` without the rows the skip list names (the same album, source and ref)."""
    return {k: v for k, v in covers.items() if (k, made_from(v)) not in skips}


class State:
    """The gitignored record of what failed: `refs` is rym_id -> {tier: why}, `sprites` is rym_id -> {of, why},
    `of` being the `source:ref` the image was asked for."""

    def __init__(self, path: Path):
        self.path = Path(path)
        data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        self.refs: dict[str, dict[str, str]] = data.get("refs", {})
        self.sprites: dict[str, dict[str, str]] = data.get("sprites", {})

    def save(self) -> None:
        body = json.dumps({"refs": self.refs, "sprites": self.sprites}, ensure_ascii=False, indent=1, sort_keys=True)
        write_atomic(self.path, body.encode("utf-8"))


def manifest_path(sprite_dir: Path) -> Path:
    """The record of what the sprites of `sprite_dir` were made from: beside the folder (.cache/covers/96.manifest.json)."""
    sprite_dir = Path(sprite_dir)
    return sprite_dir.with_name(sprite_dir.name + ".manifest.json")


class SpriteManifest:
    """rym_id -> the `source:ref` its sprite was made from (`of`). Written by `sprites` and `adopt` only, under
    the sprites lock; read by anyone."""

    def __init__(self, path: Path):
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        except ValueError as e:
            raise ValueError(f"{self.path} is not valid JSON ({e}). Delete it and run `python -m rmr_pipeline.covers "
                             "adopt`, or `sprites`, to write it again") from None
        if not isinstance(data, dict) or not all(isinstance(v, str) for v in data.values()):
            raise ValueError(f"{self.path} must be an object of rym_id: source:ref")
        self.of: dict[str, str] = data

    def save(self) -> None:
        write_atomic(self.path, json.dumps(self.of, ensure_ascii=False, indent=0, sort_keys=True).encode("utf-8"))


def made_from(cover: tuple[str, str]) -> str:
    """A row of covers.csv as the manifest and the state file name an image: `source:ref`."""
    return ":".join(cover)


class ResponseCache:
    """The audio stage's http.sqlite, opened read-only: url -> the JSON it answered, or None."""

    def __init__(self, path: Path = DEFAULT_HTTP_CACHE):
        self.db = sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro", uri=True) if Path(path).exists() else None

    def get(self, url: str) -> object | None:
        if self.db is None:
            return None
        hit = self.db.execute("SELECT body FROM http_cache WHERE url = ?", (url,)).fetchone()
        return json.loads(zlib.decompress(hit[0])) if hit else None


def new_albums(path: Path = DEFAULT_ALBUMS) -> list[dict]:
    """The catalog's rows with no `legacy_uri`, in catalog order."""
    with Path(path).open(encoding="utf-8", newline="") as f:
        return [r for r in csv.DictReader(f) if not r["legacy_uri"]]


def is_relinked(row: dict) -> bool:
    """An existing album whose Spotify link on the sheet is another album than its `legacy_uri`: the build
    links to the sheet's, so its cover is the sheet's release's too, not the map's."""
    sheet = spotify_album_id(row["spotify_url"])
    return bool(row["legacy_uri"] and sheet and sheet != row["legacy_uri"].rsplit(":", 1)[-1])


def relinked_albums(path: Path = DEFAULT_ALBUMS) -> list[dict]:
    """The catalog's existing albums that are relinked (is_relinked), in catalog order."""
    with Path(path).open(encoding="utf-8", newline="") as f:
        return [r for r in csv.DictReader(f) if is_relinked(r)]


def cover_albums(path: Path = DEFAULT_ALBUMS) -> list[dict]:
    """The albums this module finds a cover for, in catalog order: the relinked existing albums (they come
    first in the catalog), then the new ones."""
    with Path(path).open(encoding="utf-8", newline="") as f:
        return [r for r in csv.DictReader(f) if not r["legacy_uri"] or is_relinked(r)]


@dataclass
class Inputs:
    """What the lookups read. `matches` and `overrides` are key -> (source, album id) as the audio stage names
    them (`deezer`, `itunes:<cc>`), `fulllength` is key -> the embedded link, `cache` answers get(url)."""
    albums: list[dict]
    matches: dict[str, tuple[str, str]]
    overrides: dict[str, tuple[str, str]]
    fulllength: dict[str, str]
    cache: object
    _memo: dict = field(default_factory=dict, repr=False)  # rym_id -> (cached cover, uncached listings)

    @classmethod
    def load(cls, albums: Path = DEFAULT_ALBUMS, matches: Path = DEFAULT_MATCHES, overrides: Path = DEFAULT_MATCH_OVERRIDES,
             fulllength: Path = DEFAULT_FULLLENGTH, http_cache: Path = DEFAULT_HTTP_CACHE) -> "Inputs":
        with Path(matches).open(encoding="utf-8", newline="") as f:
            matched = {r["key"]: (r["source"], r["source_album_id"]) for r in csv.DictReader(f) if r["source"]}
        forced = {k: (v["source"], str(v["album_id"])) for k, v in json.loads(Path(overrides).read_text(encoding="utf-8")).items()
                  if v.get("source") and v.get("album_id")}
        with Path(fulllength).open(encoding="utf-8", newline="") as f:
            links = {r["key"]: r["url"] for r in csv.DictReader(f) if r["status"] == "embedded"}
        return cls(cover_albums(albums), matched, forced, links, ResponseCache(http_cache))

    def listings(self, row: dict) -> list[tuple[str, str, str]]:
        """The album's store listings, best first, as (source, the URLs the cache may know it by, the URL to
        ask): the forced one, the matched one, the catalog's Deezer link, its Apple link in its storefront,
        then in `us`."""
        named = [self.overrides.get(row["rym_id"]), self.matches.get(row["rym_id"])]
        if m := DEEZER_LINK.search(row["deezer_url"]):
            named.append(("deezer", m.group(1)))
        if m := APPLE_LINK.search(row["apple_music_url"]):
            named += [(f"itunes:{m.group(1)}", m.group(2)), ("itunes:us", m.group(2))]
        out = []
        for source, album_id in dict.fromkeys(n for n in named if n and n[1].isdigit()):
            if source == "deezer":
                out.append((source, (deezer_url(album_id), deezer_tracks_url(album_id)), deezer_url(album_id)))
            elif re.fullmatch(r"itunes:[a-z]{2}", source):
                cc = source.split(":")[1]
                out.append((source, (apple_cached_url(album_id, cc),), apple_url(album_id, cc)))
        return out

    def _read(self, row: dict) -> tuple:
        """(the cover of the album's best listing the response cache has one for, or None; the listings the
        cache has no answer for, as (source, URL to ask)). Read once per album."""
        if row["rym_id"] not in self._memo:
            cover, absent = None, []
            for source, cached, ask in self.listings(row):
                bodies = [b for b in map(self.cache.get, cached) if b is not None]
                if not bodies:
                    absent.append((source, ask))
                cover = cover or next(filter(None, (listing_ref(source, b) for b in bodies)), None)
            self._memo[row["rym_id"]] = (cover, absent)
        return self._memo[row["rym_id"]]

    def cached_cover(self, row: dict) -> tuple[str, str] | None:
        return self._read(row)[0]

    def uncached(self, row: dict) -> list[tuple[str, str]]:
        return self._read(row)[1]

    def video(self, row: dict) -> str:
        return youtube_ref(row["youtube_url"]) or youtube_ref(self.fulllength.get(row["rym_id"], ""))

    def wanted(self, row: dict, failed: dict[str, str]) -> list[str]:
        """The tiers that can still give the album a cover, best first: those that apply and have not failed.
        An existing album (is_relinked) is only asked from Spotify: its cover is the one of the release the
        sheet links, or the map's as before."""
        if row.get("legacy_uri"):
            return [t for t in ["spotify"] if is_relinked(row) and t not in failed]
        tiers = []
        if spotify_album_id(row["spotify_url"]):
            tiers.append("spotify")
        if self.cached_cover(row):
            tiers.append("cache")
        elif self.uncached(row):
            tiers.append("store")
        if row["bandcamp_url"]:
            tiers.append("bandcamp")
        if self.video(row):
            tiers.append("youtube")
        return [t for t in tiers if t not in failed]


# --- refs ------------------------------------------------------------------------------------------

def is_due(tier: str, row: dict, inputs: Inputs, covers: dict, failed: dict[str, str]) -> bool:
    """Does `tier` look this album up now? Yes when it can still answer, the album has no cover from a source
    as good, and no better tier is still to answer (the `cache` tier, which costs nothing, does not wait)."""
    have = covers.get(row["rym_id"])
    if have and SOURCE_RANK[have[0]] <= TIER_RANK[tier]:
        return False
    wanted = inputs.wanted(row, failed)
    return tier in wanted and (tier == "cache" or tier == wanted[0])


def plan(inputs: Inputs, covers: dict, state: State, tiers: tuple[str, ...], retry_failed: bool = False) -> dict:
    """Counts for --dry-run. `now`: albums each tier would look up in a run started now. `final`: where every
    album's cover comes from once every tier has run and every lookup has answered (`none`: no source)."""
    now, final = {t: 0 for t in TIERS}, {t: 0 for t in TIERS} | {"none": 0}
    by_source = {"spotify": "spotify", "deezer": "cache", "apple": "cache", "bandcamp": "bandcamp", "youtube": "youtube"}
    for row in inputs.albums:
        failed = {} if retry_failed else state.refs.get(row["rym_id"], {})
        for t in tiers:
            now[t] += is_due(t, row, inputs, covers, failed)
        have, wanted = covers.get(row["rym_id"]), inputs.wanted(row, failed)
        if wanted and not (have and SOURCE_RANK[have[0]] <= TIER_RANK[wanted[0]]):
            final[wanted[0]] += 1
        else:
            final[by_source[have[0]] if have else "none"] += 1
    return {"now": now, "final": final}


def deezer_quota(body: bytes) -> str:
    """"Deezer's quota error" when the body of a 200 is that error ({"error": {"code": 4}}), else "". Deezer
    sends it with HTTP 200; Fetcher.get counts it as a refusal."""
    try:
        data = json.loads(body)
    except ValueError:
        return ""
    error = data.get("error") if isinstance(data, dict) else None
    return "Deezer's quota error" if isinstance(error, dict) and error.get("code") == 4 else ""


def look_up(tier: str, row: dict, inputs: Inputs, fetcher: Fetcher) -> tuple[str, str]:
    """(source, ref) of the album's cover from one tier. Raises Gone when the tier has none for it."""
    if tier == "spotify":
        body = fetcher.get(oembed_url(spotify_album_id(row["spotify_url"])), PAGE_BYTES)
        try:
            ref = spotify_ref(json.loads(body).get("thumbnail_url") or "")
        except (ValueError, AttributeError):
            ref = ""
        if not ref:
            raise Gone("no thumbnail in Spotify's answer")
        return "spotify", ref
    if tier == "cache":
        return inputs.cached_cover(row)
    if tier == "store":
        for source, url in inputs.uncached(row):
            try:
                body = json.loads(fetcher.get(url, IMAGE_BYTES, refusal=deezer_quota))
            except Gone:
                continue
            except ValueError:
                continue
            if got := listing_ref(source, body):
                return got
        raise Gone("the store has no cover for the album's listings")
    if tier == "bandcamp":
        try:
            page = fetcher.get(row["bandcamp_url"], PAGE_BYTES)
        except HostNotAllowed:
            raise Gone("the page's host is not on the allow-list") from None
        if not (ref := bandcamp_ref(page.decode("utf-8", "replace"))):
            raise Gone("no album art in the page's og:image")
        return "bandcamp", ref
    return "youtube", inputs.video(row)


class Progress:
    """A line every PROGRESS_S seconds: done, left, failed, the time left at the pace so far."""

    def __init__(self, what: str, total: int, out, clock=time.monotonic):
        self.what, self.total, self.out, self.clock = what, total, out, clock
        self.start = self.last = clock()

    def tick(self, done: int, failed: int, force: bool = False) -> None:
        now = self.clock()
        if not force and now - self.last < PROGRESS_S:
            return
        self.last = now
        left = (self.total - done) * (now - self.start) / done if done else 0.0
        self.out(f"{self.what}: {done}/{self.total} done, {failed} failed, about {left / 60:.0f} min left")


def run_refs(inputs: Inputs, covers_path: Path, state_path: Path, sprite_dir: Path, fetcher: Fetcher,
             tiers: tuple[str, ...] = TIERS, limit: int | None = None, retry_failed: bool = False,
             stop=lambda: False, out=print) -> int:
    """Look the due albums up, tier by tier, and write covers.csv and the state file. Returns the exit code:
    0, 1 when another `refs` run holds the lock (nothing read or written), 2 when the stop rule ended the run,
    130 when it was interrupted."""
    try:
        lock = take_lock(lock_path(state_path, "refs"))
    except Locked as e:
        out(_held(e, "refs"))
        return 1
    with lock:
        return _run_refs(inputs, covers_path, state_path, sprite_dir, fetcher, tiers, limit, retry_failed, stop, out)


def _run_refs(inputs: Inputs, covers_path: Path, state_path: Path, sprite_dir: Path, fetcher: Fetcher,
              tiers: tuple[str, ...], limit: int | None, retry_failed: bool, stop, out) -> int:
    covers, state = read_covers(covers_path), State(state_path)
    order = [r["rym_id"] for r in inputs.albums]
    known = set(order)
    if others := sum(k not in known for k in covers):
        out(f"{others} row(s) of {Path(covers_path).name} are of albums this catalog does not look up (not a new album, "
            "nor an existing one with another Spotify link on the sheet): kept as they are, after the others")
    unsaved = handled = 0
    code = 0

    def save() -> None:
        nonlocal unsaved
        write_covers(covers_path, covers, order)
        state.save()
        unsaved = 0

    try:
        for tier in (t for t in TIERS if t in tiers):
            failed_for = lambda key: {} if retry_failed else state.refs.get(key, {})  # noqa: E731
            due = [r for r in inputs.albums if is_due(tier, r, inputs, covers, failed_for(r["rym_id"]))]
            if limit is not None:
                due = due[:max(0, limit - handled)]
            if not due:
                continue
            progress, found, failed = Progress(f"refs {tier}", len(due), out), 0, 0
            for n, row in enumerate(due):
                if stop():
                    raise Interrupted()
                key = row["rym_id"]
                try:
                    got = look_up(tier, row, inputs, fetcher)
                except (Gone, HostNotAllowed) as e:
                    state.refs.setdefault(key, {})[tier] = str(e)
                    failed += 1
                except Transient as e:
                    out(f"  {key}: {tier}: {e} (not recorded, asked again next time)")
                else:
                    if key in covers and covers[key] != got:
                        sprite_path(sprite_dir, key).unlink(missing_ok=True)  # made from the replaced source
                    covers[key] = got
                    if state.refs.get(key, {}).pop(tier, None) is not None and not state.refs[key]:
                        del state.refs[key]
                    found += 1
                handled += 1
                unsaved += 1
                if unsaved >= SAVE_EVERY:
                    save()
                progress.tick(n + 1, failed)
            out(f"refs {tier}: {found} found, {failed} failed, {len(due) - found - failed} to ask again, of {len(due)}")
    except StopRun as e:
        out(f"stopped: {e}. Nothing more is asked in this run; wait before starting it again.")
        code = 2
    except Interrupted:
        out("interrupted: progress saved")
        code = 130
    finally:
        if unsaved or not Path(covers_path).exists():
            save()
    return code


# --- sprites ---------------------------------------------------------------------------------------

def crop_frame(im: Image.Image) -> Image.Image:
    """A 4:3 video thumbnail without the black bars YouTube puts above and below a 16:9 picture (an eighth of
    the height each), when both bands are black; any other picture unchanged."""
    w, h = im.size
    bar = h // 8
    if w * 3 != h * 4 or not bar:
        return im
    for box in ((0, 0, w, bar), (0, h - bar, w, h)):
        stat = ImageStat.Stat(im.crop(box).convert("L"))
        if stat.mean[0] > 18 or stat.stddev[0] > 10:
            return im
    return im.crop((0, bar, w, h - bar))


def make_sprite(data: bytes, source: str) -> Image.Image:
    """The 96 px RGB sprite of a downloaded image: its centre square (of the picture inside the bars, for a
    video frame), resized with Lanczos. The image is decoded in memory."""
    with Image.open(io.BytesIO(data)) as im:
        im = im.convert("RGB")
    if source == "youtube":
        im = crop_frame(im)
    return ImageOps.fit(im, (SPRITE_PX, SPRITE_PX), method=Image.Resampling.LANCZOS)


def spread(keys: list[str], covers: dict[str, tuple[str, str]]) -> list[str]:
    """The keys reordered so that the sources take turns (for a trial across every source)."""
    queues = {s: [k for k in keys if covers[k][0] == s] for s in SOURCES}
    out = []
    while any(queues.values()):
        out += [q.pop(0) for q in queues.values() if q]
    return out


def sprite_path(sprite_dir: Path, key: str) -> Path:
    if not SAFE_NAME.fullmatch(key):
        raise ValueError(f"not a file name: {key!r}")
    return Path(sprite_dir) / f"{key}.jpg"


def sprite_state(key: str, cover: tuple[str, str], sprite_dir: Path, of: dict[str, str]) -> str:
    """What there is for the album's row `cover`, `of` being the manifest's entries:

        missing      no file
        current      a file made from this row's image
        stale        a file made from another image (the row changed since): treated as missing everywhere
        unverified   a file with no entry: used as it is, and counted, until `adopt` records it
    """
    if not sprite_path(sprite_dir, key).exists():
        return "missing"
    if key not in of:
        return "unverified"
    return "current" if of[key] == made_from(cover) else "stale"


def missing_sprites(covers: dict, order: list[str], sprite_dir: Path, state: State, sources=None,
                    retry_failed: bool = False, manifest: SpriteManifest | None = None) -> list[str]:
    """The albums of covers.csv, in `order`, with no sprite of their current image (none at all, or one the
    manifest says was made from another image) and no recorded failure for that image. `manifest`: the one
    beside `sprite_dir` when None."""
    of = (manifest or SpriteManifest(manifest_path(sprite_dir))).of
    out = []
    for key in order:
        if key not in covers or (sources and covers[key][0] not in sources):
            continue
        if sprite_state(key, covers[key], sprite_dir, of) in ("current", "unverified"):
            continue
        if not retry_failed and state.sprites.get(key, {}).get("of") == made_from(covers[key]):
            continue
        out.append(key)
    return out


def run_sprites(covers: dict[str, tuple[str, str]], order: list[str], sprite_dir: Path, state_path: Path, fetcher: Fetcher,
                limit: int | None = None, sources: tuple[str, ...] | None = None, retry_failed: bool = False,
                spread_sources: bool = False, stop=lambda: False, out=print) -> int:
    """Fetch the small image of each album that has no sprite of its current image and save its 96 px JPEG,
    recording in the manifest what it was made from. The downloaded image is never written to disk. Returns the
    exit code, as run_refs (1: another `sprites` run, or `adopt`, holds the lock)."""
    try:
        lock = take_lock(lock_path(state_path, "sprites"))
    except Locked as e:
        out(_held(e, "sprites"))
        return 1
    with lock:
        return _run_sprites(covers, order, sprite_dir, state_path, fetcher, limit, sources, retry_failed, spread_sources,
                            stop, out)


def _run_sprites(covers: dict[str, tuple[str, str]], order: list[str], sprite_dir: Path, state_path: Path, fetcher: Fetcher,
                 limit: int | None, sources: tuple[str, ...] | None, retry_failed: bool, spread_sources: bool, stop, out) -> int:
    state, manifest = State(state_path), SpriteManifest(manifest_path(sprite_dir))
    todo = missing_sprites(covers, order, sprite_dir, state, sources, retry_failed, manifest)
    if spread_sources:
        todo = spread(todo, covers)
    todo = todo[:limit] if limit is not None else todo
    progress, made, failed, unsaved, code = Progress("sprites", len(todo), out), 0, 0, 0, 0
    recorded = 0  # manifest entries not saved yet. A sprite is written before its entry: a killed run leaves a
    # sprite with no entry or with its old one (unverified, stale), never an entry for an image that is not there.
    try:
        for n, key in enumerate(todo):
            if stop():
                raise Interrupted()
            source, ref = covers[key]
            try:
                sprite = make_sprite(fetcher.get(sprite_url(source, ref), IMAGE_BYTES), source)
            except Transient as e:
                out(f"  {key}: {e} (not recorded, asked again next time)")
            except (Gone, OSError, ValueError, Image.DecompressionBombError) as e:  # a 404, or not an image
                state.sprites[key] = {"of": made_from((source, ref)), "why": str(e)[:160]}
                failed += 1
                unsaved += 1
            else:
                buf = io.BytesIO()
                sprite.save(buf, "JPEG", quality=SPRITE_QUALITY)
                write_atomic(sprite_path(sprite_dir, key), buf.getvalue())
                manifest.of[key] = made_from((source, ref))
                recorded += 1
                if state.sprites.pop(key, None) is not None:
                    unsaved += 1
                made += 1
            if unsaved >= SAVE_EVERY:
                state.save()
                unsaved = 0
            if recorded >= SAVE_EVERY:
                manifest.save()
                recorded = 0
            progress.tick(n + 1, failed)
        out(f"sprites: {made} made, {failed} failed, {len(todo) - made - failed} to ask again, of {len(todo)}")
    except StopRun as e:
        out(f"stopped: {e}. Nothing more is asked in this run; wait before starting it again.")
        code = 2
    except Interrupted:
        out("interrupted: progress saved")
        code = 130
    finally:
        if recorded:
            manifest.save()
        if unsaved or not state.path.exists():
            state.save()
    return code


def adopt(covers: dict[str, tuple[str, str]], sprite_dir: Path, covers_path: Path, older_too: bool = False,
          dry_run: bool = False, out=print, state_path: Path | None = None) -> int:
    """Record every sprite that has no manifest entry as made from its row of covers.csv. That is true of a
    sprite written after the table last changed, so one whose file is older than covers.csv is left alone
    (and counted) unless `older_too`. An entry that exists is never changed: a stale sprite stays stale. Makes
    no request. Returns 0, or 1 when a `sprites` run holds the lock (the manifest has one writer at a time;
    the lock is beside `state_path`, which is beside the sprite folder when None)."""
    lock = None
    if not dry_run:
        try:
            lock = take_lock(lock_path(state_path or Path(sprite_dir).with_name("state.json"), "sprites"))
        except Locked as e:
            out(_held(e, "sprites"))
            return 1
    try:
        manifest = SpriteManifest(manifest_path(sprite_dir))
        since = Path(covers_path).stat().st_mtime if Path(covers_path).exists() else 0.0
        states = Counter()
        new, older = {}, []
        for key, cover in covers.items():
            state = sprite_state(key, cover, sprite_dir, manifest.of)
            states[state] += 1
            if state != "unverified":
                continue
            if older_too or sprite_path(sprite_dir, key).stat().st_mtime >= since:
                new[key] = made_from(cover)
            else:
                older.append(key)
        if new and not dry_run:
            manifest.of.update(new)
            manifest.save()
        out(f"sprites: {states['current']} already recorded, {len(new)} {'would be adopted' if dry_run else 'adopted'} "
            f"(recorded as made from their row of {Path(covers_path).name}), {states['stale']} of another image (made "
            f"again by `sprites`), {states['missing']} missing")
        if older:
            out(f"{len(older)} older than {Path(covers_path).name} and left alone: the table may have changed since they "
                f"were made ({', '.join(older[:5])}{' ...' if len(older) > 5 else ''}). Delete them and run `sprites` to "
                "fetch them again, or adopt them as they are with --older-too")
        return 0
    finally:
        if lock is not None:
            lock.close()


# --- what the build reads ----------------------------------------------------------------------------

@dataclass(frozen=True)
class Covers:
    """covers.csv, read once, the folder its sprites are in and what the manifest says they were made from.
    `found`: there was a covers.csv to read (without one `rows` is empty and no album has a cover).
    `failed`: rym_id -> the `source:ref` whose image `sprites` could not fetch for a reason of the image's own
    (the state file's `sprites`: HTTP 404 or 410, a redirect off the allow-list, a file that is not an image)."""
    rows: dict[str, tuple[str, str]]
    sprite_dir: Path
    found: bool = True
    made_from: dict[str, str] = field(default_factory=dict)
    path: Path | None = None
    failed: dict[str, str] = field(default_factory=dict)
    skip: frozenset = frozenset()  # (rym_id, `source:ref`): rows that are not a cover (read_skips)

    def state(self, key: str) -> str:
        return sprite_state(key, self.rows[key], self.sprite_dir, self.made_from)

    def cover_for(self, key: str) -> tuple[str, Path | None]:
        """(the album's `c`, the path of its 96 px sprite or None when there is none of that image yet: no file,
        or a file the manifest says was made from another image). ("", None) for an album with no cover source,
        and for one whose image is gone (is_gone): the site asks for the remote image of a `c` first, and that
        request would fail for every visitor before the tile showed. And for a row the skip list names
        (is_skipped): its image is not a cover."""
        if key not in self.rows or self.is_skipped(key) or self.is_gone(key):
            return "", None
        usable = self.state(key) in ("current", "unverified")
        return c_field(*self.rows[key]), sprite_path(self.sprite_dir, key) if usable else None

    def is_skipped(self, key: str) -> bool:
        """The skip list names exactly this row: the album, and the `source:ref` it has now."""
        return key in self.rows and (key, made_from(self.rows[key])) in self.skip

    def skipped(self, keys=None) -> list[str]:
        """The albums (of `keys`, or every row) whose row is skipped (is_skipped): cover_for gives them no cover."""
        return [k for k in (self.rows if keys is None else keys) if self.is_skipped(k)]

    def is_gone(self, key: str) -> bool:
        """The row's image could not be fetched and will not come back: the state file records a failure for
        exactly this `source:ref`, and there is no sprite of it. A row that changed since (another ref) is a
        new image and is asked again; a sprite that is there wins over an old record."""
        return (key in self.rows and self.failed.get(key) == made_from(self.rows[key])
                and self.state(key) not in ("current", "unverified"))

    def gone(self, keys=None) -> list[str]:
        """The albums (of `keys`, or every row) whose image is gone (is_gone): cover_for gives them no cover."""
        return [k for k in (self.rows if keys is None else keys) if self.is_gone(k)]

    def _in_state(self, state: str, keys) -> list[str]:
        return [k for k in (self.rows if keys is None else keys)
                if k in self.rows and not self.is_skipped(k) and self.state(k) == state]

    def unverified(self, keys=None) -> list[str]:
        """The albums (of `keys`, or every row) whose sprite has no manifest entry: used, but nothing says which
        image it was made from (`python -m rmr_pipeline.covers adopt`)."""
        return self._in_state("unverified", keys)

    def stale(self, keys=None) -> list[str]:
        """The albums whose sprite was made from another image than their row's: cover_for gives them none."""
        return self._in_state("stale", keys)


def load_covers(path: Path = DEFAULT_COVERS, sprite_dir: Path = DEFAULT_SPRITES, state_path: Path | None = None,
                skip_path: Path | None = None) -> Covers:
    """`state_path`: the state file whose recorded sprite failures blank a cover (Covers.failed); none are read
    without it. `skip_path`: the skip list (Covers.skip); no row is skipped without it."""
    failed = {k: v["of"] for k, v in State(state_path).sprites.items() if v.get("of")} if state_path else {}
    return Covers(read_covers(path), Path(sprite_dir), Path(path).exists(), SpriteManifest(manifest_path(sprite_dir)).of,
                  Path(path), failed, frozenset(read_skips(skip_path)) if skip_path else frozenset())


@lru_cache(maxsize=1)
def _default_covers() -> Covers:
    return load_covers(state_path=DEFAULT_STATE, skip_path=DEFAULT_SKIP)


def cover_for(key: str) -> tuple[str, Path | None]:
    """Covers.cover_for on the committed covers.csv and the default sprite folder, read once per process."""
    return _default_covers().cover_for(key)


# --- the command line --------------------------------------------------------------------------------

def _names(value: str, known: tuple[str, ...]) -> tuple[str, ...]:
    names = tuple(v.strip() for v in value.split(",") if v.strip())
    if unknown := [n for n in names if n not in known]:
        raise argparse.ArgumentTypeError(f"unknown: {', '.join(unknown)} (known: {', '.join(known)})")
    return names


def _stopper():
    """A function that says whether SIGINT or SIGTERM arrived."""
    asked = []
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: asked.append(1))
    return lambda: bool(asked)


def _say(*args) -> None:
    print(*args, flush=True)


def _albums_line(albums: list[dict]) -> str:
    existing = sum(1 for r in albums if r.get("legacy_uri"))
    return f"{len(albums)} albums ({existing} existing with another Spotify link on the sheet, {len(albums) - existing} new)"


def cmd_refs(args) -> int:
    inputs = Inputs.load(args.albums)
    if args.dry_run:
        covers, state = read_covers(args.covers), State(args.state)
        counts = plan(inputs, covers, state, args.tiers, args.retry_failed)
        _say(f"{_albums_line(inputs.albums)}, {len(covers)} with a row in {Path(args.covers).name}")
        _say("tier       asked by a run now   source in the end, if every lookup answers")
        for t in TIERS:
            now = counts["now"][t] if t in args.tiers else "-"
            _say(f"{t:<10} {now!s:>18}   {counts['final'][t]:>6}")
        _say(f"{'none':<10} {'':>18}   {counts['final']['none']:>6}")
        return 0
    stop = _stopper()
    intervals = REFS_INTERVALS | {"open.spotify.com": args.spotify_interval, "bandcamp": args.bandcamp_interval}
    code = run_refs(inputs, args.covers, args.state, args.sprites, Fetcher(intervals, stop=stop), args.tiers, args.limit,
                    args.retry_failed, stop, _say)
    have = read_covers(args.covers)
    _say(f"{sum(r['rym_id'] in have for r in inputs.albums)} of {len(inputs.albums)} albums have a row in {args.covers}")
    return code


def cmd_sprites(args) -> int:
    covers = without_skipped(read_covers(args.covers), read_skips(args.skip))  # a skipped row's image is not fetched
    order = [r["rym_id"] for r in cover_albums(args.albums)]
    if args.dry_run:
        state = State(args.state)
        todo = missing_sprites(covers, order, args.sprites, state, args.sources, args.retry_failed)
        _say(f"{len(covers)} rows, {len(todo)} sprites to fetch: " + ", ".join(
            f"{s} {n}" for s, n in sorted(Counter(covers[k][0] for k in todo).items())))
        return 0
    stop = _stopper()
    fetcher = Fetcher(SPRITES_INTERVALS, args.interval, stop=stop)
    return run_sprites(covers, order, args.sprites, args.state, fetcher, args.limit, args.sources, args.retry_failed,
                       args.spread, stop, _say)


def cmd_adopt(args) -> int:
    return adopt(read_covers(args.covers), args.sprites, args.covers, args.older_too, args.dry_run, _say, args.state)


def cmd_status(args) -> int:
    inputs, covers, state = Inputs.load(args.albums), read_covers(args.covers), State(args.state)
    skips = read_skips(args.skip)
    by_source = Counter(s for s, _ in covers.values())
    of = SpriteManifest(manifest_path(args.sprites)).of
    wanted = without_skipped(covers, skips)
    states = Counter(sprite_state(k, v, args.sprites, of) for k, v in wanted.items())
    have = states["current"] + states["unverified"]
    if not Path(args.covers).exists():
        _say(f"{args.covers} is MISSING: no album has a cover source (python -m rmr_pipeline.covers refs, or restore the file)")
    _say(f"{_albums_line(inputs.albums)}, {len(covers)} with a cover source")
    existing = {r["rym_id"] for r in inputs.albums if r.get("legacy_uri")}
    _say(f"  of the existing: {sum(k in existing for k in covers)} with a row; the others keep the map's cover")
    for s in SOURCES:
        _say(f"  {s:<9} {by_source[s]:>5}")
    if skips:
        unmatched = len(skips) - (len(covers) - len(wanted))
        _say(f"skipped: {len(covers) - len(wanted)} row(s) named in {Path(args.skip).name} give no cover (not a cover image)"
             + (f"; {unmatched} line(s) of {Path(args.skip).name} match no row (the album has another image now, or none)"
                if unmatched else ""))
    _say(f"sprites: {have} present, {len(wanted) - have} missing ({sum(k in wanted for k in state.sprites)} of them failed)")
    if states["stale"]:
        _say(f"  {states['stale']} of the missing have a file made from another image than their row's: `sprites` makes them again")
    if states["unverified"]:
        _say(f"  {states['unverified']} of the present have no entry in {manifest_path(args.sprites).name} (made before the "
             "manifest, or by a run that was killed): once no `sprites` run is going, `python -m rmr_pipeline.covers adopt` "
             "records them as made from their rows")
    without = [r for r in inputs.albums if r["rym_id"] not in covers]
    waiting = Counter((inputs.wanted(r, state.refs.get(r["rym_id"], {})) or ["none"])[0] for r in without)
    _say(f"no cover source: {len(without)} (" + ", ".join(f"{n} {t}" for t, n in sorted(waiting.items())) + ")"
         if without else "no cover source: 0")
    if len(without) <= 50:
        for r in without:
            failed = "; ".join(f"{t}: {w}" for t, w in state.refs.get(r["rym_id"], {}).items())
            _say(f"  {r['rym_id']}  {r['artist']} - {r['title']}" + (f"  [{failed}]" if failed else ""))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m rmr_pipeline.covers", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    for name, fn, text in [("refs", cmd_refs, "find a cover source per album (new, or relinked) and write covers.csv"),
                           ("sprites", cmd_sprites, "fetch the small image of each row and save its 96 px sprite"),
                           ("status", cmd_status, "counts per source, sprites, albums without a cover"),
                           ("adopt", cmd_adopt, "record the sprites with no manifest entry as made from their rows; no request")]:
        p = sub.add_parser(name, help=text)
        p.set_defaults(fn=fn)
        p.add_argument("--albums", type=Path, default=DEFAULT_ALBUMS)
        p.add_argument("--covers", type=Path, default=DEFAULT_COVERS)
        p.add_argument("--state", type=Path, default=DEFAULT_STATE)
        p.add_argument("--sprites", type=Path, default=DEFAULT_SPRITES, help="the sprite folder")
        p.add_argument("--skip", type=Path, default=DEFAULT_SKIP, help="the skip list: rows that are not a cover")
        if name == "status":
            continue
        p.add_argument("--dry-run", action="store_true", help="print the counts; no request, nothing written")
        if name == "adopt":
            p.add_argument("--older-too", action="store_true",
                           help="also adopt the sprites whose file is older than covers.csv (the table may have changed since)")
            continue
        p.add_argument("--limit", type=int, help="albums looked up in this run, at most")
        p.add_argument("--retry-failed", action="store_true", help="ask again for the albums the state file lists")
    refs, sprites = sub.choices["refs"], sub.choices["sprites"]
    refs.add_argument("--tiers", type=lambda v: _names(v, TIERS), default=TIERS, help=f"comma-separated, of {', '.join(TIERS)}")
    refs.add_argument("--spotify-interval", type=float, default=REFS_INTERVALS["open.spotify.com"], help="seconds between oEmbed requests")
    refs.add_argument("--bandcamp-interval", type=float, default=REFS_INTERVALS["bandcamp"], help="seconds between Bandcamp pages")
    sprites.add_argument("--interval", type=float, default=SPRITES_INTERVAL, help="seconds between two image requests")
    sprites.add_argument("--sources", type=lambda v: _names(v, SOURCES), help=f"only these, of {', '.join(SOURCES)}")
    sprites.add_argument("--spread", action="store_true", help="take the sources in turn instead of catalog order")
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
