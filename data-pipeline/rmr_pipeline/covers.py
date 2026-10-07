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

The last resort, tier `caa` (source `caa`, `c` `ca:<mbid>`): the Cover Art Archive's front image of the album's
release group on MusicBrainz, for every catalog album that would otherwise end with no cover (caa_candidates:
a new album with no source left, with an image that is gone or with a skipped row, and the existing albums of
unverified_links.csv and those overrides.json gives an empty `c`). Its rows are in a table of their own,
catalog/covers_caa.csv (`rym_id,mbid` and what was matched), not in covers.csv: it never replaces a cover an
album has, the row it stands in for stays where it is (so `refs` does not find the same image again and the
skip list still names it), and cover_for answers from it only when covers.csv gives the album nothing. The
release group is found by a search on title and artist and accepted by a strict rule (mb_accepts, mb_choose);
a row a reader added for an album the rule refused has `hand` in its last column, `matched_by`, and its reason
in docs/review/caa-covers-hand.md (the lookup's own rows have `auto`). What was decided for every album asked
is in the state file (`caa`), so a rerun asks nothing twice. MusicBrainz is asked at most once a second and an
HTTP 503 from it, twice, stops the run.

catalog/covers_skip.csv (`rym_id,source,ref,note`, written by hand) names the rows whose image is not a cover
(a video frame with a track list, a "FULL ALBUM" card). Such a row gives no cover (cover_for: no `c`, no
sprite) for as long as covers.csv has exactly that `source:ref` for the album; the row stays in covers.csv, so
`refs` does not find the same image again, and `sprites` does not fetch it.

    python -m rmr_pipeline.covers refs      # (re)writes catalog/covers.csv, then catalog/covers_caa.csv; resumable
    python -m rmr_pipeline.covers sprites   # one 96 px JPEG per row in .cache/covers/96/ (not committed)
    python -m rmr_pipeline.covers status
    python -m rmr_pipeline.covers adopt     # record the sprites that have no entry in the manifest as made from their rows
    python -m rmr_pipeline.covers host      # the site's own copies of the last resort's covers (frontcreck/public/covers)

The site does not ask the Cover Art Archive for a `ca:` cover (its file hosts fail too often): `host` keeps one
copy per such cover in use in frontcreck/public/covers/<mbid>.jpg (committed), the archive's 500 px front image
as a progressive JPEG of at most 500 px (make_hosted), with each copy's size in index.json beside it, and
removes the copy of a cover that is no longer in use (hosted_wanted). The site serves /covers/<mbid>.jpg
(site_cover_path). The validator and `build --require-sprites` check the folder without a request
(hosted_problems).

`sprites` records the `source:ref` each sprite was made from in .cache/covers/96.manifest.json. A sprite whose
entry is not its row's image counts as missing: it is not used by the build and is made again. A sprite with
no entry (made before the manifest existed, or by a run that was killed) is used, and counted by the build and
by `status`, until `adopt` records it. An album whose image `sprites` could not fetch for a reason of the image's
own (the state file's `sprites`) has no cover in the build: its `c` is empty (Covers.is_gone).

One `refs` run, one `sprites` run and one `host` run at a time: each holds a lock file beside the state file
(refs.lock, sprites.lock, host.lock) and a second run exits with code 1. Reading (`status`, --dry-run, the build) takes no lock.

The build calls cover_for(key) for a new album; cover_url(c, px) is the URL form of each kind of cover id,
which the frontend mirrors (but for `ca:`, which it serves from its own files).

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
import unicodedata
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
DEFAULT_CAA = PIPELINE_DIR / "catalog" / "covers_caa.csv"  # the last resort's table (read_caa)
DEFAULT_UNVERIFIED = PIPELINE_DIR / "catalog" / "unverified_links.csv"
DEFAULT_OVERRIDES = PIPELINE_DIR / "overrides.json"
DEFAULT_SITE_ALBUMS = PIPELINE_DIR.parent / "frontcreck" / "public" / "data" / "albums.json"  # read for its slugs only
DEFAULT_MATCHES = PIPELINE_DIR / "audio" / "matches.csv"
DEFAULT_MATCH_OVERRIDES = PIPELINE_DIR / "audio" / "match_overrides.json"
DEFAULT_FULLLENGTH = PIPELINE_DIR / "audio" / "fulllength.csv"
DEFAULT_HTTP_CACHE = PIPELINE_DIR / ".cache" / "audio" / "http.sqlite"  # the audio stage's; only ever read here
DEFAULT_CACHE = PIPELINE_DIR / ".cache" / "covers"  # gitignored: the sprites and the state file
DEFAULT_SPRITES = DEFAULT_CACHE / "96"
DEFAULT_STATE = DEFAULT_CACHE / "state.json"
DEFAULT_HOSTED = PIPELINE_DIR.parent / "frontcreck" / "public" / "covers"  # committed: the site's own copies (`host`)
GONE_STATUS = (404, 410)  # the only answers that say "this page will not come back"

SOURCES = ("spotify", "deezer", "apple", "bandcamp", "youtube")
TIERS = ("spotify", "cache", "store", "bandcamp", "youtube")  # in priority order; a run takes them in this order
TIER_RANK = {"spotify": 0, "cache": 1, "store": 1, "bandcamp": 2, "youtube": 3}
SOURCE_RANK = {"spotify": 0, "deezer": 1, "apple": 1, "bandcamp": 2, "youtube": 3}
C_PREFIX = {"deezer": "dz:", "apple": "am:", "bandcamp": "bc:", "youtube": "yt:", "caa": "ca:"}  # Spotify's id is stored bare
CAA = "caa"  # the last resort: a tier and a source of its own, with its own table (never a row of covers.csv)
ALL_TIERS = TIERS + (CAA,)
ALL_SOURCES = SOURCES + (CAA,)

ALLOWED_HOSTS = {"open.spotify.com", "i.scdn.co", "api.deezer.com", "cdn-images.dzcdn.net", "e-cdns-images.dzcdn.net",
                 "itunes.apple.com", "f4.bcbits.com", "i.ytimg.com",
                 "musicbrainz.org", "coverartarchive.org", "archive.org"}  # the last resort; the archive redirects to
ALLOWED_SUFFIXES = (".spotifycdn.com", ".mzstatic.com", ".bandcamp.com", ".archive.org")  # archive.org, then to a host under it
USER_AGENT = "recmyrecord-covers/1.0 (+https://github.com/sameraslan/recmyrecord; one small cover image per album)"

SPRITE_PX = 96
SPRITE_QUALITY = 90
HOSTED_PX = 500  # the longest side of a copy the site serves itself (`host`): the archive's /front-500
HOSTED_QUALITY = 85
HOSTED_INDEX = "index.json"  # in the folder of the copies: MBID -> [width, height]
SITE_COVERS = "/covers/"  # where the site serves that folder
SAVE_EVERY = 50  # albums between two saves of covers.csv and the state file
PROGRESS_S = 60.0
REFS_INTERVALS = {"open.spotify.com": 1.0, "bandcamp": 3.0, "api.deezer.com": 0.2, "itunes.apple.com": 3.2}  # the last two: rmr_audio's
SPRITES_INTERVAL = 0.5  # between any two image requests
SPRITES_INTERVALS = {"f4.bcbits.com": 1.0}
CAA_INTERVALS = {"musicbrainz.org": 1.1, "coverartarchive.org": 1.0}  # MusicBrainz: at most one request a second
MB_BUSY_WAIT = 30.0  # before the one retry of a request MusicBrainz answered with HTTP 503 (its rate limit)
MB_BUSY = (503,)
MB_LIMIT = 25  # release groups per search answer
CAA_SAVE_EVERY = 10
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
PLACEHOLDER_KEY = re.compile(r"sp:([A-Za-z0-9]{22})")  # an existing album with no RYM id yet (fullmatch)
MBID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")  # fullmatch
CAA_FIELDS = ("rym_id", "mbid", "mb_title", "mb_artist", "mb_year", "mb_type", "score", "matched_by")
CAA_MATCHED_BY = ("auto", "hand")  # the lookup's rule (mb_accepts, mb_choose), or a reader who chose the release group
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
    `bc:<number>`, `yt:<video id>`, `ca:<release-group MBID>` for the others."""
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
        ca:<mbid>   https://coverartarchive.org/release-group/<mbid>/front-250 up to 250 px, /front-500 above: the
                    front image of a MusicBrainz release group. The answer is a redirect to archive.org, which
                    redirects to a host under archive.org. This is where the image comes from: the site does not
                    ask the archive, it serves its own copy, /covers/<mbid>.jpg, at every size (site_cover_path)
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
    if kind == "ca":
        return f"https://coverartarchive.org/release-group/{ref}/front-{250 if px <= 250 else 500}"
    if c.startswith("ab67616d") and len(c) > 16:
        prefix = "ab67616d00004851" if px <= 64 else "ab67616d00001e02" if px <= 300 else SPOTIFY_PREFIX
        return "https://i.scdn.co/image/" + prefix + c[16:]
    return "https://i.scdn.co/image/" + c


def sprite_url(source: str, ref: str) -> str:
    """The small rendition a sprite is made from: Spotify 300 px, Deezer 250, Apple 200, Bandcamp 350, YouTube
    480 x 360, the Cover Art Archive 250."""
    sizes = {"spotify": 300, "deezer": 250, "apple": 200, "bandcamp": 350, "youtube": 480, "caa": 250}
    return cover_url(c_field(source, ref), sizes[source])


def hosted_url(mbid: str) -> str:
    """What a copy the site serves itself is made from: the archive's front image at 500 px."""
    return cover_url(c_field(CAA, mbid), HOSTED_PX)


def site_cover_path(c: str) -> str:
    """The path the site serves the cover `c` at from its own files: /covers/<mbid>.jpg for `ca:<mbid>`, at every
    size (the frontend's coverUrlAt has the same form); "" for every other cover, which is asked from its host."""
    kind, _, ref = c.partition(":")
    return f"{SITE_COVERS}{ref}.jpg" if kind == "ca" and ref else ""


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

    def get(self, url: str, max_bytes: int = IMAGE_BYTES, refusal=None, busy: tuple[int, ...] = (),
            busy_wait: float = BACKOFF_S) -> bytes:
        """The body of a 200. Raises HostNotAllowed for a URL that is not allowed (no request), Gone for HTTP
        404 or 410 and for a redirect to a host that is not allowed, RateLimited or StopRun for a refusal,
        Transient for anything else. `refusal(body)` names a refusal that a host sends as a 200 (Deezer's quota
        error), or returns ""; it is asked before the 200 ends the host's row of refusals. `busy`: the statuses
        by which the host says it is asked too much (MusicBrainz: 503). The request is tried once more after
        `busy_wait` seconds, and the same answer again raises StopRun."""
        check_host(url)
        key, why, wait = host_key(url), "", RETRY_S
        for attempt in range(2):
            if attempt:
                self._pause(wait)
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
            if status in busy:
                if attempt:
                    raise StopRun(f"{key} answered HTTP {status} again after a wait of {busy_wait:.0f} s")
                why, wait = f"HTTP {status}", busy_wait
                continue
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
    """covers_skip.csv as {(rym_id, `source:ref`)}: the rows of covers.csv that are not a cover, and the rows
    of covers_caa.csv that are not the album's (`caa`, the MBID). Empty when there is no file."""
    path = Path(path)
    if not path.exists():
        return set()
    out = set()
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["source"] not in ALL_SOURCES or not row["ref"]:
                raise ValueError(f"{path}: {row['rym_id']}: unknown source or empty ref ({row['source']!r}, {row['ref']!r})")
            out.add((row["rym_id"], made_from((row["source"], row["ref"]))))
    return out


def without_skipped(covers: dict[str, tuple[str, str]], skips) -> dict[str, tuple[str, str]]:
    """`covers` without the rows the skip list names (the same album, source and ref)."""
    return {k: v for k, v in covers.items() if (k, made_from(v)) not in skips}


class State:
    """The gitignored record of what failed: `refs` is rym_id -> {tier: why}, `sprites` is rym_id -> {of, why},
    `of` being the `source:ref` the image was asked for. And of the last resort: `caa` is rym_id -> what was
    decided for the album (look_up_caa: `decision` found, none, ambiguous or no art, `why`, the MusicBrainz
    `score`, and the release group when there is one), `caa_sprites` is `sprites` for the archive's images,
    kept apart so that a row's own failure stays recorded beside it."""

    def __init__(self, path: Path):
        self.path = Path(path)
        data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        self.refs: dict[str, dict[str, str]] = data.get("refs", {})
        self.sprites: dict[str, dict[str, str]] = data.get("sprites", {})
        self.caa: dict[str, dict] = data.get("caa", {})
        self.caa_sprites: dict[str, dict[str, str]] = data.get("caa_sprites", {})

    def sprite_failures(self, source: str) -> dict[str, dict[str, str]]:
        """Where a failed image of `source` is recorded: `caa_sprites` for the last resort, else `sprites`."""
        return self.caa_sprites if source == CAA else self.sprites

    def save(self) -> None:
        data = {"refs": self.refs, "sprites": self.sprites}
        data |= {k: v for k, v in (("caa", self.caa), ("caa_sprites", self.caa_sprites)) if v}
        write_atomic(self.path, json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True).encode("utf-8"))


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
    queues = {s: [k for k in keys if covers[k][0] == s] for s in ALL_SOURCES}
    out = []
    while any(queues.values()):
        out += [q.pop(0) for q in queues.values() if q]
    return out


def sprite_path(sprite_dir: Path, key: str) -> Path:
    """The sprite file of the album `key`. An existing album with no RYM id has the placeholder key
    `sp:<Spotify id>`, and the file `sp_<Spotify id>.jpg` (no RYM id has an underscore)."""
    if m := PLACEHOLDER_KEY.fullmatch(key):
        key = "sp_" + m.group(1)
    elif not SAFE_NAME.fullmatch(key):
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


# The sprite states a build uses, for a row of covers.csv and (True) for the last resort. A file with no
# manifest entry may be the sprite of the row the last resort stands in for, so there it does not count.
USABLE = {False: ("current", "unverified"), True: ("current",)}


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
        if sprite_state(key, covers[key], sprite_dir, of) in USABLE[covers[key][0] == CAA]:
            continue
        if not retry_failed and state.sprite_failures(covers[key][0]).get(key, {}).get("of") == made_from(covers[key]):
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
                state.sprite_failures(source)[key] = {"of": made_from((source, ref)), "why": str(e)[:160]}
                failed += 1
                unsaved += 1
            else:
                buf = io.BytesIO()
                sprite.save(buf, "JPEG", quality=SPRITE_QUALITY)
                write_atomic(sprite_path(sprite_dir, key), buf.getvalue())
                manifest.of[key] = made_from((source, ref))
                recorded += 1
                if state.sprite_failures(source).pop(key, None) is not None:
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


# --- the last resort: MusicBrainz and the Cover Art Archive --------------------------------------------

_TRANSLIT = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i"})
_ORDINALS = {"first": "1st", "second": "2nd", "third": "3rd", "fourth": "4th", "fifth": "5th", "sixth": "6th",
             "seventh": "7th", "eighth": "8th", "ninth": "9th", "tenth": "10th"}
_EDITION = re.compile(
    r"\b(?:deluxe|expanded|remaster(?:ed|ise[dr]|ize[dr])?|re-?issue|anniversary|edition|version|bonus|mono|stereo|special|"
    r"collector'?s|legacy|explicit|clean|edici[oó]n|aniversario|remasteri[sz]ad[oa]|[ée]dition)\b|^\s*(?:19|20)\d\d\s*$",
    re.IGNORECASE)
_LAST_BRACKET = re.compile(r"\s*[(\[]([^()\[\]]*)[)\]]\s*$")
_NATIVE_LATIN = re.compile(r"^(.+?)\s*\[([^\[\]]+)\]\s*$")  # `native [Latin]`, the form an artist is shown in
_JOINER = re.compile(r"\s*[,&/;]\s*|\s+(?:and|with|feat\.?|featuring|vs\.?)\s+", re.IGNORECASE)
MB_TYPE_RANK = {"Album": 0, "EP": 1, "Single": 2}  # any other primary type, or none: 3


def fold_name(text: str, artist: bool = False) -> str:
    """A title or an artist as two sides are compared: casefolded, accents dropped, "&" read as "and",
    punctuation dropped, words joined by one space, an ordinal word as its numeral; a title loses a leading
    "the", an artist every "the". The folding of rmr_audio/textnorm.py (`norm`), which belongs to the audio
    environment. A text with no letter or digit (the album "?") is itself, casefolded, without its spaces."""
    s = unicodedata.normalize("NFKD", str(text).translate(_TRANSLIT))
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold().translate(_TRANSLIT)
    words = [_ORDINALS.get(w, w) for w in re.split(r"[\W_]+", re.sub(r"['’`´]", "", s.replace("&", " and "))) if w]
    if artist:
        words = [w for w in words if w != "the"] or words
    elif len(words) > 1 and words[0] == "the":
        words = words[1:]
    return " ".join(words) or "".join(str(text).casefold().split())


def fold_title(title: str) -> str:
    """fold_name of the title without its bracketed edition suffixes ("(Remastered 2011)", "[Deluxe Edition]").
    A bracket that says anything else stays: "(Live in Tokyo)" is another record."""
    out = str(title)
    while (m := _LAST_BRACKET.search(out)) and _EDITION.search(m.group(1)) and out[:m.start()].strip():
        out = out[:m.start()]
    return fold_name(out)


def _spellings(*texts: str) -> list[str]:
    """The texts, each `native [Latin]` as its two halves, without the empty and the repeated ones."""
    out: list[str] = []
    for text in texts:
        m = _NATIVE_LATIN.match(text or "")
        out += [m.group(1), m.group(2)] if m else [text or ""]
    return list(dict.fromkeys(s.strip() for s in out if s and s.strip()))


def billed(credit: str) -> list[str]:
    """The names of a credit ("A & B", "A / B / C", "A with B"), in order; the credit itself when it is one name."""
    return [n for n in (p.strip() for p in _JOINER.split(credit)) if n] or [credit]


def album_titles(row: dict) -> set[str]:
    """The album's title in every spelling the catalog has, folded: `title`, `title_latin`, the sheet's."""
    return {fold_title(t) for t in _spellings(row["title"], row.get("title_latin", ""), row.get("rym_title", ""))} - {""}


def album_artists(row: dict) -> set[str]:
    """The album's billed artists in every spelling the catalog has, folded: each whole credit and each of its names."""
    credits = _spellings(row["artist"], row.get("artist_latin", ""), row.get("rym_artist", ""))
    return {fold_name(n, artist=True) for c in credits for n in [c, *billed(c)]} - {""}


def mb_queries(row: dict) -> list[tuple[str, str]]:
    """The (title, artist) pairs MusicBrainz is asked for, in order: the catalog's native spelling (and the
    sheet's, where an existing album's differs), the Latin forms, then each of them with the first billed
    artist alone when the credit has several."""
    title, artist = row["title"], row["artist"]
    native = _spellings(artist)
    pairs = [(title, native[0])] if native else []
    if row.get("rym_artist") or row.get("rym_title"):
        pairs.append((row.get("rym_title") or title, row.get("rym_artist") or (native[0] if native else artist)))
    latin_artist = row.get("artist_latin") or (native[1] if len(native) > 1 else "")
    if latin_artist or row.get("title_latin"):
        pairs.append((row.get("title_latin") or title, latin_artist or (native[0] if native else artist)))
    pairs += [(t, names[0]) for t, a in list(pairs) if len(names := billed(a)) > 1]
    seen, out = set(), []
    for t, a in pairs:
        key = (fold_name(t), fold_name(a, artist=True))
        if t and a and key not in seen:
            seen.add(key)
            out.append((t, a))
    return out


def _phrase(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def mb_search_url(title: str, artist: str) -> str:
    """MusicBrainz's release-group search for a title and an artist, both as Lucene phrases."""
    query = f"releasegroup:{_phrase(title)} AND artist:{_phrase(artist)}"
    return f"https://musicbrainz.org/ws/2/release-group/?query={urllib.parse.quote(query, safe='')}&fmt=json&limit={MB_LIMIT}"


def mb_title_url(title: str) -> str:
    """The same search on the title alone."""
    query = urllib.parse.quote(f"releasegroup:{_phrase(title)}", safe="")
    return f"https://musicbrainz.org/ws/2/release-group/?query={query}&fmt=json&limit={MB_LIMIT}"


def mb_search_urls(row: dict) -> list[str]:
    """The searches for an album, in the order they are made: mb_queries, then each spelling of the title
    alone. The search's artist field does not know every name of an artist (芸能山城組 is not found by
    "Geinoh Yamashirogumi"), while an answer carries the artists' aliases; mb_accepts judges it all the same."""
    pairs = mb_queries(row)
    return [mb_search_url(t, a) for t, a in pairs] + [mb_title_url(t) for t in dict.fromkeys(t for t, _ in pairs)]


def caa_listing_url(mbid: str) -> str:
    """The Cover Art Archive's list of a release group's images (JSON); HTTP 404 when it has none."""
    return f"https://coverartarchive.org/release-group/{mbid}"


def mb_release_groups(body: bytes) -> list[dict]:
    """The release groups of a search answer: mbid, title, credit (as MusicBrainz prints it), artists (every
    name of every credited artist: as credited, its own, its aliases), date, year, primary, secondary, score.
    Raises ValueError for an answer that is not the search's JSON."""
    data = json.loads(body)
    if not isinstance(data, dict) or not isinstance(data.get("release-groups", []), list):
        raise ValueError("not a release-group search answer")
    out = []
    for g in data.get("release-groups", []):
        if not isinstance(g, dict) or not MBID.fullmatch(str(g.get("id", ""))) or not g.get("title"):
            continue
        names, credit = [], ""
        for c in g.get("artist-credit") or []:
            who = c.get("artist") or {}
            names += [c.get("name"), who.get("name"), *(a.get("name") for a in who.get("aliases") or [])]
            credit += (c.get("name") or who.get("name") or "") + (c.get("joinphrase") or "")
        if not credit:
            credit = ", ".join(dict.fromkeys(n for n in names if n))
        date = str(g.get("first-release-date") or "")
        out.append({"mbid": g["id"], "title": str(g["title"]), "credit": credit, "artists": [n for n in names if n],
                    "date": date, "year": date[:4] if re.fullmatch(r"\d{4}(?:-\d\d){0,2}", date) else "",
                    "primary": str(g.get("primary-type") or ""), "secondary": tuple(sorted(g.get("secondary-types") or [])),
                    "score": int(g.get("score") or 0)})
    return out


def mb_accepts(row: dict, cand: dict) -> str:
    """"" when the release group may be the album, else what speaks against it (`title`, `artist`, `year`).
    All three must hold: its title is the album's after fold_title, in one of the catalog's spellings; one of
    its credited artists is one of the album's billed artists after fold_name; and, when the catalog has a
    year and MusicBrainz a first-release date, the years are at most one apart."""
    if fold_title(cand["title"]) not in album_titles(row):
        return "title"
    if not {fold_name(n, artist=True) for n in cand["artists"]} & album_artists(row):
        return "artist"
    year = (row.get("year") or "").strip()
    if year.isdigit() and cand["year"] and abs(int(year) - int(cand["year"])) > 1:
        return "year"
    return ""


def _as_written(title: str) -> str:
    return " ".join(str(title).casefold().split())


def _looks(cand: dict) -> tuple:
    return fold_name(cand["credit"], artist=True), cand["year"], cand["secondary"]


def mb_choose(row: dict, cands: list[dict]) -> tuple[str, dict | None, str]:
    """(`found`, the release group, "") or (`none` or `ambiguous`, None, why). Of the accepted groups, those
    whose title is the album's as written (case aside) are kept when there are any ("0%" is not "0", though
    they fold alike); then those of the best type (Album, then EP, then Single, then the rest). When they look alike (the same
    credit, year and secondary types: MusicBrainz has the release twice) the earliest is taken; when two look
    different (a studio and a live album, two years, two credits) none is, since nothing here can tell which
    one the catalog means, and a wrong cover is worse than a tile."""
    refused = Counter()
    passed = []
    for c in cands:
        if why := mb_accepts(row, c):
            refused[why] += 1
        else:
            passed.append(c)
    if not passed:
        said = ", ".join(f"{n} with another {w}" for w, n in refused.items())
        return "none", None, f"{len(cands)} release group(s)" + (f", {said}" if said else "")
    written = {_as_written(t) for t in _spellings(row["title"], row.get("title_latin", ""), row.get("rym_title", ""))}
    passed = [c for c in passed if _as_written(c["title"]) in written] or passed
    rank = min(MB_TYPE_RANK.get(c["primary"], 3) for c in passed)
    best = [c for c in passed if MB_TYPE_RANK.get(c["primary"], 3) == rank]
    if len({_looks(c) for c in best}) > 1:
        return "ambiguous", None, "; ".join(
            f"{c['mbid']} {c['credit']} - {c['title']} ({c['date'] or 'no date'}, {'+'.join((c['primary'] or 'no type',) + c['secondary'])})"
            for c in best)
    best.sort(key=lambda c: ("-".join((c["date"].split("-") + ["99", "99"])[:3]) if c["date"] else "9999", -c["score"], c["mbid"]))
    return "found", best[0], ""


def has_front(body: bytes) -> bool:
    """Does the archive's list of images have a front image (the one its /front addresses serve)?"""
    try:
        data = json.loads(body)
    except ValueError:
        return False
    images = data.get("images") if isinstance(data, dict) else None
    return isinstance(images, list) and any(isinstance(i, dict) and i.get("front") is True for i in images)


def look_up_caa(row: dict, fetcher: Fetcher) -> dict:
    """What MusicBrainz and the archive say about one album: `decision` (found, none, ambiguous, no art), `why`,
    `score` (MusicBrainz's, of the group taken, else the best in the answers), `queries` (searches made), and
    for found and no art the release group (`mbid`, `mb_title`, `mb_artist`, `mb_year`, `mb_type`). The
    searches of mb_search_urls are made in order until one answer has an accepted group. Raises Transient when
    a request got no usable answer (nothing is recorded then) and StopRun by the stop rules."""
    decision, cand, why, best_score, asked, said = "none", None, "no spelling to ask", 0, 0, []
    for url in mb_search_urls(row):
        try:
            cands = mb_release_groups(fetcher.get(url, IMAGE_BYTES, busy=MB_BUSY, busy_wait=MB_BUSY_WAIT))
        except Gone as e:
            raise Transient(f"MusicBrainz: {e}") from None
        except ValueError:
            raise Transient("MusicBrainz's answer is not JSON") from None
        asked += 1
        best_score = max([best_score, *(c["score"] for c in cands)])
        decision, cand, why = mb_choose(row, cands)
        if decision != "none":
            break
        said.append(f"search {asked}: {why}")
    if decision == "none" and said:
        why = "; ".join(said)
    out = {"decision": decision, "why": why, "score": cand["score"] if cand else best_score, "queries": asked}
    if cand is None:
        return out
    out |= {"mbid": cand["mbid"], "mb_title": cand["title"], "mb_artist": cand["credit"], "mb_year": cand["year"],
            "mb_type": "+".join(filter(None, (cand["primary"],) + cand["secondary"]))}
    try:
        front = has_front(fetcher.get(caa_listing_url(cand["mbid"]), IMAGE_BYTES))
    except Gone as e:
        if not str(e).startswith("HTTP "):  # a redirect off the allow-list says nothing about the art
            raise Transient(f"the archive: {e}") from None
        return out | {"decision": "no art", "why": f"the archive has no image for the release group ({e})"}
    return out if front else out | {"decision": "no art", "why": "the archive's images of the release group have no front"}


def read_caa(path: Path = DEFAULT_CAA) -> dict[str, dict[str, str]]:
    """covers_caa.csv as rym_id -> its row (CAA_FIELDS), in file order; {} when there is no file. `matched_by`
    says who chose the release group: `auto` (the lookup's rule) or `hand` (a reader, for an album the rule
    refused; the reason is in docs/review/caa-covers-hand.md)."""
    path = Path(path)
    if not path.exists():
        return {}
    out: dict[str, dict[str, str]] = {}
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != list(CAA_FIELDS):
            raise ValueError(f"{path}: the header must be {','.join(CAA_FIELDS)}")
        for row in reader:
            if not row["rym_id"] or not MBID.fullmatch(row["mbid"] or ""):
                raise ValueError(f"{path}: {row['rym_id']!r}: {row['mbid']!r} is not a release-group MBID")
            if row["matched_by"] not in CAA_MATCHED_BY:
                raise ValueError(f"{path}: {row['rym_id']!r}: matched_by must be {' or '.join(CAA_MATCHED_BY)}, not {row['matched_by']!r}")
            out[row["rym_id"]] = dict(row)
    return out


def write_caa(path: Path, rows: dict[str, dict[str, str]], order: list[str]) -> None:
    """Write covers_caa.csv with its rows in `order` (the catalog's); a row of another album is kept, after them."""
    buf = io.StringIO(newline="")
    w = csv.DictWriter(buf, CAA_FIELDS, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    w.writerows(rows[k] for k in dict.fromkeys([k for k in order if k in rows] + list(rows)))
    write_atomic(path, buf.getvalue().encode("utf-8"))


def catalog_rows(path: Path = DEFAULT_ALBUMS) -> list[dict]:
    """Every row of the catalog, in its order."""
    with Path(path).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def existing_without_cover(rows: list[dict], unverified_path: Path = DEFAULT_UNVERIFIED, overrides_path: Path = DEFAULT_OVERRIDES,
                           site_albums_path: Path = DEFAULT_SITE_ALBUMS) -> tuple[set[str], set[str]]:
    """The existing albums the build gives no cover id, as two sets of keys: those of unverified_links.csv
    (their link opens another album, so the build blanks its cover), and those overrides.json gives `c` ""
    (no Spotify release). overrides.json is keyed by slug; an album's slug is read from the site's
    albums.json, whose rows are the catalog's (`rows`: catalog_rows). A file that is missing gives nothing."""
    unverified, bare = set(), set()
    if Path(unverified_path).exists():
        with Path(unverified_path).open(encoding="utf-8", newline="") as f:
            unverified = {r["rym_id"] for r in csv.DictReader(f)}
    if Path(overrides_path).exists() and Path(site_albums_path).exists():
        blank = {slug for slug, e in json.loads(Path(overrides_path).read_text(encoding="utf-8")).items() if e.get("c") == ""}
        site = json.loads(Path(site_albums_path).read_text(encoding="utf-8"))
        bare = {rows[i]["rym_id"] for i, a in enumerate(site[:len(rows)]) if a.get("slug") in blank}
    return unverified, bare


def caa_candidates(rows: list[dict], inputs: Inputs, covers: dict, skips, state: State, sprite_dir: Path, of: dict[str, str],
                   unverified: set[str] = frozenset(), bare: set[str] = frozenset()) -> list[tuple[dict, str]]:
    """The albums that would end with no cover, in catalog order, each with the reason:

        no source        a new album with no row in covers.csv and no tier left that could give it one
        gone             a new album whose row's image could not be fetched (the state file's `sprites`)
        skipped          a new album whose row the skip list names
        unverified link  an existing album of unverified_links.csv
        no cover id      an existing album overrides.json gives `c` ""

    A new album a tier may still answer for is not one of them: the last resort waits for the better sources."""
    out = []
    for row in rows:
        key = row["rym_id"]
        if row["legacy_uri"]:
            if key in unverified or key in bare:
                out.append((row, "unverified link" if key in unverified else "no cover id"))
            continue
        have = covers.get(key)
        if have is None:
            if not inputs.wanted(row, state.refs.get(key, {})):
                out.append((row, "no source"))
        elif (key, made_from(have)) in skips:
            out.append((row, "skipped"))
        elif (state.sprites.get(key, {}).get("of") == made_from(have)
              and sprite_state(key, have, sprite_dir, of) not in USABLE[False]):
            out.append((row, "gone"))
    return out


def run_caa(albums: list[dict], caa_path: Path, state_path: Path, fetcher: Fetcher, order: list[str] | None = None,
            limit: int | None = None, retry_failed: bool = False, stop=lambda: False, out=print) -> int:
    """Ask MusicBrainz and the archive for each album of `albums` (caa_candidates) that has neither a row in
    covers_caa.csv nor a decision in the state file, and write both. `retry_failed` asks again for the albums
    decided as none, ambiguous or no art. Returns the exit code, as run_refs, whose lock it holds."""
    try:
        lock = take_lock(lock_path(state_path, "refs"))
    except Locked as e:
        out(_held(e, "refs"))
        return 1
    with lock:
        table, state = read_caa(caa_path), State(state_path)
        order = order if order is not None else [r["rym_id"] for r in albums]
        due = [r for r in albums if r["rym_id"] not in table and (retry_failed or r["rym_id"] not in state.caa)]
        due = due[:limit] if limit is not None else due
        progress, counts, unsaved, code, before = Progress("refs caa", len(due), out), Counter(), 0, 0, fetcher.requests

        def save() -> None:
            nonlocal unsaved
            write_caa(caa_path, table, order)
            state.save()
            unsaved = 0

        try:
            for n, row in enumerate(due):
                if stop():
                    raise Interrupted()
                key = row["rym_id"]
                try:
                    got = look_up_caa(row, fetcher)
                except Transient as e:
                    out(f"  {key}: caa: {e} (not recorded, asked again next time)")
                    continue
                state.caa[key] = got
                counts[got["decision"]] += 1
                if got["decision"] == "found":
                    table[key] = {"rym_id": key, **{f: str(got[f]) for f in CAA_FIELDS[1:-1]}, "matched_by": "auto"}
                unsaved += 1
                if unsaved >= CAA_SAVE_EVERY:
                    save()
                progress.tick(n + 1, counts["none"] + counts["ambiguous"] + counts["no art"])
            out(f"refs caa: {counts['found']} found, {counts['none']} none, {counts['ambiguous']} ambiguous, "
                f"{counts['no art']} no art, {len(due) - sum(counts.values())} to ask again, of {len(due)}; "
                f"{fetcher.requests - before} request(s)")
        except StopRun as e:
            out(f"stopped: {e}. Nothing more is asked in this run; wait before starting it again. "
                f"({fetcher.requests - before} request(s) made)")
            code = 2
        except Interrupted:
            out("interrupted: progress saved")
            code = 130
        finally:
            if unsaved or not Path(caa_path).exists():
                save()
        return code


def effective_rows(covers: dict[str, tuple[str, str]], skips, caa: dict[str, str], failed: dict[str, str], sprite_dir: Path,
                   of: dict[str, str]) -> dict[str, tuple[str, str]]:
    """The image each album shows, as rows (source, ref): its row of covers.csv, unless the skip list names it;
    and (`caa`, the MBID) for an album of covers_caa.csv (`caa`: rym_id -> MBID) that covers.csv gives nothing:
    no row, a skipped row, or a row whose image is gone; not a row of covers_caa.csv the skip list names (`failed`: rym_id -> the `source:ref` that could not
    be fetched; pass {} to have those rows asked again first). What `sprites` fetches and `status` counts."""
    out = without_skipped(covers, skips)
    for key, mbid in caa.items():
        row = out.get(key)
        if (key, made_from((CAA, mbid))) in skips:  # not the album's cover: the row stays, so it is not asked again
            continue
        if row is None or (failed.get(key) == made_from(row) and sprite_state(key, row, sprite_dir, of) not in USABLE[False]):
            out[key] = (CAA, mbid)
    return out


# --- the site's own copies of the last resort's covers -----------------------------------------------------
#
# The site does not ask the Cover Art Archive for a `ca:` cover: the archive's file hosts answer HTTP 500 and
# 503 often enough (down for about 20 minutes on 6 October 2026) that the album page then showed the 48 px
# sprite. `host` keeps one copy per cover in use in frontcreck/public/covers/<mbid>.jpg, committed (the owner's
# decision of 7 October 2026), and the site serves /covers/<mbid>.jpg.

def hosted_path(hosted_dir: Path, mbid: str) -> Path:
    """The copy of the release group's front image: <mbid>.jpg in the folder."""
    if not MBID.fullmatch(mbid or ""):
        raise ValueError(f"not a release-group MBID: {mbid!r}")
    return Path(hosted_dir) / f"{mbid}.jpg"


def make_hosted(data: bytes) -> tuple[bytes, tuple[int, int]]:
    """(the copy of a downloaded image, its (width, height)): the right way up, RGB (a transparent picture on
    white), at most HOSTED_PX on its longest side and never enlarged, a progressive JPEG of quality
    HOSTED_QUALITY with no metadata. The image is decoded in memory."""
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info:
            rgba = im.convert("RGBA")
            im = Image.new("RGB", rgba.size, (255, 255, 255))
            im.paste(rgba, mask=rgba.getchannel("A"))
        else:
            im = im.convert("RGB")
    im.thumbnail((HOSTED_PX, HOSTED_PX), Image.Resampling.LANCZOS)
    clean = Image.new("RGB", im.size)  # a new image: nothing of the file's EXIF, ICC profile or comments
    clean.paste(im)
    buf = io.BytesIO()
    clean.save(buf, "JPEG", quality=HOSTED_QUALITY, progressive=True, optimize=True)
    return buf.getvalue(), clean.size


class HostedIndex:
    """index.json in the folder of the copies: MBID -> [width, height] of <mbid>.jpg. It is the record that
    `host` made the file (a file with no entry is made again), and the site reads the size of a link-preview
    image from it. Written by `host` only, under its lock."""

    def __init__(self, hosted_dir: Path, sizes: dict[str, tuple[int, int]] | None = None):
        self.path = Path(hosted_dir) / HOSTED_INDEX
        self.sizes: dict[str, tuple[int, int]] = dict(sizes or {})

    @classmethod
    def read(cls, hosted_dir: Path) -> "HostedIndex":
        """The folder's index; empty when there is none. ValueError for a file of another form."""
        out = cls(hosted_dir)
        if out.path.exists():
            try:
                data = json.loads(out.path.read_text(encoding="utf-8"))
                out.sizes = {k: (int(v[0]), int(v[1])) for k, v in data.items() if MBID.fullmatch(k) and len(v) == 2}
                if len(out.sizes) != len(data):
                    raise ValueError("an entry is not MBID: [width, height]")
            except (ValueError, TypeError, AttributeError, KeyError) as e:
                raise ValueError(f"{out.path} is not an object of MBID: [width, height] ({e}). Delete it and run "
                                 "`python -m rmr_pipeline.covers host`, which fetches the covers again") from None
        return out

    def save(self) -> None:
        lines = ",\n".join(f'"{k}":[{w},{h}]' for k, (w, h) in sorted(self.sizes.items()))
        write_atomic(self.path, ("{\n" + lines + "\n}\n" if lines else "{}\n").encode("utf-8"))


def hosted_wanted(found: list[tuple[dict, str]], table: "Covers") -> list[str]:
    """The MBIDs of the covers in use, each once, in catalog order: of the albums that would have no cover
    otherwise (`found`: caa_candidates), those the last resort gives one (Covers.caa_for: a row of
    covers_caa.csv that the skip list does not name and whose image is not recorded as gone). These are the
    albums whose `c` the build writes as `ca:<mbid>`."""
    wanted = (table.caa_for(row["rym_id"])[0] for row, _ in found)
    return list(dict.fromkeys(c.partition(":")[2] for c in wanted if c))


def hosted_todo(wanted: list[str], hosted_dir: Path, index: HostedIndex | None = None) -> tuple[list[str], list[str]]:
    """(the MBIDs of `wanted` with no copy `host` made: no file, or a file with no entry in the index; the
    names of the copies in the folder that are not wanted). Only a file named <mbid>.jpg is a copy."""
    hosted_dir = Path(hosted_dir)
    sizes = (index or HostedIndex.read(hosted_dir)).sizes
    missing = [m for m in wanted if m not in sizes or not hosted_path(hosted_dir, m).exists()]
    keep = set(wanted)
    there = sorted(p.name for p in hosted_dir.glob("*.jpg")) if hosted_dir.is_dir() else []
    return missing, [n for n in there if MBID.fullmatch(n[:-4]) and n[:-4] not in keep]


def hosted_problems(cover_ids, hosted_dir: Path) -> list[str]:
    """What is wrong with the folder of the copies for the albums' cover ids `cover_ids` (every `c` of
    albums.json), a line each; [] when it holds exactly one readable copy per `ca:` cover in use, each with its
    size in the index, and nothing else. No request: what the validator and `build --require-sprites` check."""
    hosted_dir = Path(hosted_dir)
    albums = Counter(c.partition(":")[2] for c in cover_ids if c.startswith(C_PREFIX[CAA]))
    fix = "Run python -m rmr_pipeline.covers host"

    def some(names) -> str:
        names = list(names)
        return ", ".join(names[:5]) + (" ..." if len(names) > 5 else "")

    if not albums and not hosted_dir.exists():
        return []
    if not hosted_dir.is_dir():
        return [f"{hosted_dir} is missing, and {sum(albums.values())} album(s) have a Cover Art Archive cover (`ca:<mbid>`) "
                f"that the site serves from it. {fix}"]
    problems = []
    missing = [m for m in albums if not hosted_path(hosted_dir, m).exists()]
    if missing:
        problems.append(f"{sum(albums[m] for m in missing)} album(s) have a Cover Art Archive cover (`ca:<mbid>`) and no copy "
                        f"of it in {hosted_dir}: {some(m + '.jpg' for m in missing)}. The site would show the small "
                        f"sprite. {fix}")
    extra = sorted(p.name for p in hosted_dir.iterdir() if not p.name.startswith(".") and p.name != HOSTED_INDEX
                   and not (p.suffix == ".jpg" and p.stem in albums))
    if extra:
        problems.append(f"{hosted_dir} holds {len(extra)} file(s) no album uses: {some(extra)}. {fix}, which removes the "
                        "copy of a cover that left covers_caa.csv or went on the skip list (another file: remove it by hand)")
    try:
        sizes = HostedIndex.read(hosted_dir).sizes
    except ValueError as e:
        return problems + [str(e)]
    wrong = []
    for m in albums:
        if m in missing:
            continue
        try:
            with Image.open(hosted_path(hosted_dir, m)) as im:
                ok = im.format == "JPEG" and sizes.get(m) == im.size and max(im.size) <= HOSTED_PX
        except (OSError, ValueError, Image.DecompressionBombError):
            ok = False
        if not ok:
            wrong.append(m)
    stale = sorted(m for m in set(sizes) - set(albums) if m + ".jpg" not in extra)  # an unused file is named above
    if wrong or stale:
        problems.append(f"{hosted_dir / HOSTED_INDEX} does not describe the folder: {len(wrong)} cop(ies) are not a JPEG of "
                        f"at most {HOSTED_PX} px with their size recorded ({some(wrong) or 'none'}), {len(stale)} "
                        f"entr(ies) are of a cover no album uses ({some(stale) or 'none'}). {fix}")
    return problems


def run_host(wanted: list[str], hosted_dir: Path, state_path: Path, fetcher: Fetcher, limit: int | None = None,
             stop=lambda: False, out=print) -> int:
    """Make the folder hold exactly the copies of `wanted` (hosted_wanted): remove the copy of a cover that is
    no longer in use, then fetch each one that is missing (hosted_url, through `fetcher`: the allow-list, one
    request a second to the archive), write its JPEG (make_hosted) and then its size in the index. A file is
    written before its entry, so a killed run leaves at worst a file that is made again. An image with no
    usable answer is asked again by the next run; an HTTP 503 from the archive, twice, stops the run. Returns
    the exit code, as run_refs (1: another `host` run holds the lock, host.lock beside the state file)."""
    try:
        lock = take_lock(lock_path(state_path, "host"))
    except Locked as e:
        out(_held(e, "host"))
        return 1
    with lock:
        hosted_dir = Path(hosted_dir)
        index = HostedIndex.read(hosted_dir)
        todo, unused = hosted_todo(wanted, hosted_dir, index)
        for name in unused:
            (hosted_dir / name).unlink()
        dropped = [m for m in index.sizes if m not in set(wanted)]
        for m in dropped:
            del index.sizes[m]
        if unused or dropped:
            index.save()
            out(f"host: {len(unused)} removed (a cover no album uses any more): {', '.join(unused[:5])}{' ...' if len(unused) > 5 else ''}")
        todo = todo[:limit] if limit is not None else todo
        progress, made, failed, unsaved, code = Progress("host", len(todo), out), 0, 0, 0, 0
        try:
            for n, mbid in enumerate(todo):
                if stop():
                    raise Interrupted()
                try:
                    data, size = make_hosted(fetcher.get(hosted_url(mbid), IMAGE_BYTES, busy=MB_BUSY, busy_wait=MB_BUSY_WAIT))
                except Transient as e:
                    out(f"  {mbid}: {e} (asked again next time)")
                except (Gone, OSError, ValueError, Image.DecompressionBombError) as e:  # a 404, or not an image
                    out(f"  {mbid}: {str(e)[:160]}: no copy; the album shows its sprite until the image is there or "
                        "the row leaves covers_caa.csv")
                    failed += 1
                else:
                    write_atomic(hosted_path(hosted_dir, mbid), data)
                    index.sizes[mbid] = size
                    made += 1
                    unsaved += 1
                if unsaved >= CAA_SAVE_EVERY:
                    index.save()
                    unsaved = 0
                progress.tick(n + 1, failed)
            out(f"host: {made} made, {failed} failed, {len(todo) - made - failed} to ask again, of {len(todo)}")
        except StopRun as e:
            out(f"stopped: {e}. Nothing more is asked in this run; wait before starting it again.")
            code = 2
        except Interrupted:
            out("interrupted: progress saved")
            code = 130
        finally:
            if unsaved or not index.path.exists():
                index.save()
        return code


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
    caa: dict[str, str] = field(default_factory=dict)  # rym_id -> release-group MBID: the last resort (read_caa)
    caa_failed: dict[str, str] = field(default_factory=dict)  # as `failed`, for the archive's images

    def state(self, key: str) -> str:
        return sprite_state(key, self.rows[key], self.sprite_dir, self.made_from)

    def cover_for(self, key: str) -> tuple[str, Path | None]:
        """(the album's `c`, the path of its 96 px sprite or None when there is none of that image yet: no file,
        or a file the manifest says was made from another image). ("", None) for an album with no cover source,
        and for one whose image is gone (is_gone): the site asks for the remote image of a `c` first, and that
        request would fail for every visitor before the tile showed. And for a row the skip list names
        (is_skipped): its image is not a cover. Such an album has the last resort's cover when covers_caa.csv
        has one for it (caa_for)."""
        if key not in self.rows or self.is_skipped(key) or self.is_gone(key):
            return self.caa_for(key)
        usable = self.state(key) in USABLE[False]
        return c_field(*self.rows[key]), sprite_path(self.sprite_dir, key) if usable else None

    def caa_for(self, key: str) -> tuple[str, Path | None]:
        """The last resort's cover of the album, whatever covers.csv has for it: (`ca:<mbid>`, its sprite or
        None when there is none of that image yet). ("", None) without a row in covers_caa.csv, for a row
        the skip list names (`caa`, the MBID: not the album's cover), and when the archive's image could not
        be fetched. cover_for answers with it for an album covers.csv gives nothing;
        the build asks it directly for an existing album whose `c` is empty (catalog.last_resort_covers)."""
        if key not in self.caa or (key, made_from((CAA, self.caa[key]))) in self.skip:
            return "", None
        row = (CAA, self.caa[key])
        usable = sprite_state(key, row, self.sprite_dir, self.made_from) in USABLE[True]
        if not usable and self.caa_failed.get(key) == made_from(row):
            return "", None
        return c_field(*row), sprite_path(self.sprite_dir, key) if usable else None

    def last_resort(self, keys=None) -> list[str]:
        """The albums (of `keys`, or every row of covers_caa.csv) whose cover_for is the last resort's."""
        return [k for k in (self.caa if keys is None else keys) if k in self.caa and self.cover_for(k)[0].startswith(C_PREFIX[CAA])]

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
                skip_path: Path | None = None, caa_path: Path | None = None) -> Covers:
    """`state_path`: the state file whose recorded sprite failures blank a cover (Covers.failed); none are read
    without it. `skip_path`: the skip list (Covers.skip); no row is skipped without it. `caa_path`: the last
    resort's table (Covers.caa); no album has such a cover without it."""
    state = State(state_path) if state_path else None
    failed = {k: v["of"] for k, v in state.sprites.items() if v.get("of")} if state else {}
    caa_failed = {k: v["of"] for k, v in state.caa_sprites.items() if v.get("of")} if state else {}
    caa = {k: r["mbid"] for k, r in read_caa(caa_path).items()} if caa_path else {}
    return Covers(read_covers(path), Path(sprite_dir), Path(path).exists(), SpriteManifest(manifest_path(sprite_dir)).of,
                  Path(path), failed, frozenset(read_skips(skip_path)) if skip_path else frozenset(), caa, caa_failed)


@lru_cache(maxsize=1)
def _default_covers() -> Covers:
    return load_covers(state_path=DEFAULT_STATE, skip_path=DEFAULT_SKIP, caa_path=DEFAULT_CAA)


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


def _caa_albums(args, inputs: Inputs) -> tuple[list[tuple[dict, str]], list[dict]]:
    """(caa_candidates for the files the command was given, every catalog row)."""
    rows = catalog_rows(args.albums)
    unverified, bare = existing_without_cover(rows, args.unverified, args.overrides, args.site_albums)
    found = caa_candidates(rows, inputs, read_covers(args.covers), read_skips(args.skip), State(args.state), args.sprites,
                           SpriteManifest(manifest_path(args.sprites)).of, unverified, bare)
    return found, rows


def _caa_line(found: list[tuple[dict, str]], table: dict, state: State) -> str:
    """The last resort's counts: the albums with no cover, by reason, and what was decided for them."""
    reasons = Counter(why for _, why in found)
    decided = Counter("found" if r["rym_id"] in table else state.caa.get(r["rym_id"], {}).get("decision", "not asked")
                      for r, _ in found)
    return (f"last resort (caa): {len(found)} albums with no cover otherwise ("
            + ", ".join(f"{n} {why}" for why, n in reasons.items()) + "): "
            + ", ".join(f"{decided[d]} {d}" for d in ("found", "none", "ambiguous", "no art", "not asked")))


def cmd_refs(args) -> int:
    inputs = Inputs.load(args.albums)
    tiers = tuple(t for t in args.tiers if t in TIERS)
    if args.dry_run:
        covers, state = read_covers(args.covers), State(args.state)
        counts = plan(inputs, covers, state, tiers, args.retry_failed)
        _say(f"{_albums_line(inputs.albums)}, {len(covers)} with a row in {Path(args.covers).name}")
        _say("tier       asked by a run now   source in the end, if every lookup answers")
        for t in TIERS:
            now = counts["now"][t] if t in tiers else "-"
            _say(f"{t:<10} {now!s:>18}   {counts['final'][t]:>6}")
        _say(f"{'none':<10} {'':>18}   {counts['final']['none']:>6}")
        found, _ = _caa_albums(args, inputs)
        table = read_caa(args.caa)
        asked = sum(1 for r, _ in found if r["rym_id"] not in table and (args.retry_failed or r["rym_id"] not in state.caa))
        _say(_caa_line(found, table, state) + f"; a run now would ask for {asked if CAA in args.tiers else '-'}")
        return 0
    stop = _stopper()
    intervals = REFS_INTERVALS | {"open.spotify.com": args.spotify_interval, "bandcamp": args.bandcamp_interval}
    code = 0
    if tiers:
        code = run_refs(inputs, args.covers, args.state, args.sprites, Fetcher(intervals, stop=stop), tiers, args.limit,
                        args.retry_failed, stop, _say)
        have = read_covers(args.covers)
        _say(f"{sum(r['rym_id'] in have for r in inputs.albums)} of {len(inputs.albums)} albums have a row in {args.covers}")
    if code == 0 and CAA in args.tiers:  # after the others: it asks only for what they left without a cover
        found, rows = _caa_albums(args, inputs)
        code = run_caa([r for r, _ in found], args.caa, args.state, Fetcher(CAA_INTERVALS, stop=stop),
                       [r["rym_id"] for r in rows], args.limit, args.retry_failed, stop, _say)
        _say(_caa_line(found, read_caa(args.caa), State(args.state)))
    return code


def _sprite_rows(args, state: State, retry_failed: bool = False) -> dict[str, tuple[str, str]]:
    """effective_rows for the files the command was given. A row of covers_caa.csv for an album the --albums
    file does not have is not this catalog's to fetch or count."""
    known = {r["rym_id"] for r in catalog_rows(args.albums)}
    caa = {k: r["mbid"] for k, r in read_caa(args.caa).items() if k in known}
    failed = {} if retry_failed else {k: v["of"] for k, v in state.sprites.items() if v.get("of")}
    return effective_rows(read_covers(args.covers), read_skips(args.skip), caa, failed, args.sprites,
                          SpriteManifest(manifest_path(args.sprites)).of)


def cmd_sprites(args) -> int:
    # A skipped row's image is not fetched; the last resort's is, for an album covers.csv gives nothing.
    covers = _sprite_rows(args, State(args.state), args.retry_failed)
    order = [r["rym_id"] for r in catalog_rows(args.albums)]
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


def cmd_host(args) -> int:
    inputs = Inputs.load(args.albums)
    found, _ = _caa_albums(args, inputs)
    table = load_covers(args.covers, args.sprites, args.state, args.skip, args.caa)
    wanted = hosted_wanted(found, table)
    if args.dry_run:
        todo, unused = hosted_todo(wanted, args.hosted)
        _say(f"{len(wanted)} Cover Art Archive covers in use, {len(todo)} to fetch, {len(unused)} cop(ies) in {args.hosted} "
             "to remove")
        return 0
    stop = _stopper()
    code = run_host(wanted, args.hosted, args.state, Fetcher(CAA_INTERVALS, stop=stop), args.limit, stop, _say)
    files = [hosted_path(args.hosted, m) for m in wanted if hosted_path(args.hosted, m).exists()]
    _say(f"{len(files)} of {len(wanted)} covers in use have a copy in {args.hosted}: {sum(p.stat().st_size for p in files) / 1e6:.2f} MB")
    return code


def cmd_adopt(args) -> int:
    # Not the rows the last resort stands in for: the sprite of such an album is the archive's image, not its row's.
    shown = _sprite_rows(args, State(args.state))
    covers = {k: v for k, v in read_covers(args.covers).items() if shown.get(k, v) == v}
    return adopt(covers, args.sprites, args.covers, args.older_too, args.dry_run, _say, args.state)


def cmd_status(args) -> int:
    inputs, covers, state = Inputs.load(args.albums), read_covers(args.covers), State(args.state)
    skips = read_skips(args.skip)
    by_source = Counter(s for s, _ in covers.values())
    of = SpriteManifest(manifest_path(args.sprites)).of
    wanted = without_skipped(covers, skips)
    shown = _sprite_rows(args, state)  # with the last resort's rows, which stand in for a gone or skipped one
    last = {k: v for k, v in shown.items() if v[0] == CAA}
    states = Counter(sprite_state(k, v, args.sprites, of) for k, v in shown.items())
    for k, v in last.items():  # a file with no entry is not the archive's image: USABLE
        if sprite_state(k, v, args.sprites, of) == "unverified":
            states["unverified"] -= 1
            states["missing"] += 1
    have = states["current"] + states["unverified"]
    if not Path(args.covers).exists():
        _say(f"{args.covers} is MISSING: no album has a cover source (python -m rmr_pipeline.covers refs, or restore the file)")
    _say(f"{_albums_line(inputs.albums)}, {len(covers)} with a cover source")
    existing = {r["rym_id"] for r in inputs.albums if r.get("legacy_uri")}
    _say(f"  of the existing: {sum(k in existing for k in covers)} with a row; the others keep the map's cover")
    for s in SOURCES:
        _say(f"  {s:<9} {by_source[s]:>5}")
    if skips:
        table = read_caa(args.caa)
        named = len(covers) - len(wanted) + sum(1 for k, of in skips if k in table and of == made_from((CAA, table[k]["mbid"])))
        unmatched = len(skips) - named
        _say(f"skipped: {named} row(s) named in {Path(args.skip).name} give no cover (not a cover image)"
             + (f"; {unmatched} line(s) of {Path(args.skip).name} match no row (the album has another image now, or none)"
                if unmatched else ""))
    _say(f"  {CAA:<9} {len(last):>5}  (the last resort, in {Path(args.caa).name}: of {len(read_caa(args.caa))} rows, those "
         "that stand in for no row, a skipped row or an image that is gone)")
    gone = sum(1 for k, v in shown.items() if state.sprite_failures(v[0]).get(k, {}).get("of") == made_from(v))
    _say(f"sprites: {have} present, {len(shown) - have} missing ({gone} of them failed)")
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
    _say(_caa_line(_caa_albums(args, inputs)[0], read_caa(args.caa), state))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m rmr_pipeline.covers", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    for name, fn, text in [("refs", cmd_refs, "find a cover source per album (new, or relinked) and write covers.csv; then "
                                                "the last resort for the albums left without one (covers_caa.csv)"),
                           ("sprites", cmd_sprites, "fetch the small image of each row and save its 96 px sprite"),
                           ("status", cmd_status, "counts per source, sprites, albums without a cover"),
                           ("adopt", cmd_adopt, "record the sprites with no manifest entry as made from their rows; no request"),
                           ("host", cmd_host, "keep the site's own copy of each Cover Art Archive cover in use: fetch what "
                                              "is missing into frontcreck/public/covers, remove what is no longer used")]:
        p = sub.add_parser(name, help=text)
        p.set_defaults(fn=fn)
        p.add_argument("--albums", type=Path, default=DEFAULT_ALBUMS)
        p.add_argument("--covers", type=Path, default=DEFAULT_COVERS)
        p.add_argument("--state", type=Path, default=DEFAULT_STATE)
        p.add_argument("--sprites", type=Path, default=DEFAULT_SPRITES, help="the sprite folder")
        p.add_argument("--skip", type=Path, default=DEFAULT_SKIP, help="the skip list: rows that are not a cover")
        p.add_argument("--caa", type=Path, default=DEFAULT_CAA, help="the last resort's table (Cover Art Archive)")
        p.add_argument("--unverified", type=Path, default=DEFAULT_UNVERIFIED, help=argparse.SUPPRESS)
        p.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES, help=argparse.SUPPRESS)
        p.add_argument("--site-albums", type=Path, default=DEFAULT_SITE_ALBUMS, help=argparse.SUPPRESS)
        if name == "status":
            continue
        p.add_argument("--dry-run", action="store_true", help="print the counts; no request, nothing written")
        if name == "adopt":
            p.add_argument("--older-too", action="store_true",
                           help="also adopt the sprites whose file is older than covers.csv (the table may have changed since)")
            continue
        p.add_argument("--limit", type=int, help="albums looked up in this run, at most")
        if name == "host":
            p.add_argument("--hosted", type=Path, default=DEFAULT_HOSTED, help="the folder of the copies")
            continue
        p.add_argument("--retry-failed", action="store_true", help="ask again for the albums the state file lists")
    refs, sprites = sub.choices["refs"], sub.choices["sprites"]
    refs.add_argument("--tiers", type=lambda v: _names(v, ALL_TIERS), default=ALL_TIERS,
                      help=f"comma-separated, of {', '.join(ALL_TIERS)}")
    refs.add_argument("--spotify-interval", type=float, default=REFS_INTERVALS["open.spotify.com"], help="seconds between oEmbed requests")
    refs.add_argument("--bandcamp-interval", type=float, default=REFS_INTERVALS["bandcamp"], help="seconds between Bandcamp pages")
    sprites.add_argument("--interval", type=float, default=SPRITES_INTERVAL, help="seconds between two image requests")
    sprites.add_argument("--sources", type=lambda v: _names(v, ALL_SOURCES), help=f"only these, of {', '.join(ALL_SOURCES)}")
    sprites.add_argument("--spread", action="store_true", help="take the sources in turn instead of catalog order")
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
