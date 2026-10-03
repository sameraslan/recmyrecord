"""Match a catalog album to a store listing. No audio is fetched here.

An album whose catalog row has a Deezer or an Apple Music link (the links RYM lists) is not searched for:
the linked listing is fetched by its id and accepted (linked_match). The RYM community chose that listing,
so it is not verified beyond a light reading of its title and artist, which only sets `ambiguous`. Deezer's
link is used first; an Apple id is looked up in the storefront its link names (an Apple id only resolves
there), then in `us`. The edition rule (preferred_edition): a linked listing with more than OVERSIZED tracks
or a bigger-edition marker is replaced by the standard edition among the same artist's listings when there
is one, and a linked listing of one to FEW_TRACKS tracks by a split edition of the same recording (more
tracks, total runtime within SPLIT_RUNTIME of the linked one). When the linked listing has no preview, the
other store's link is tried, then the text search, before the album is recorded as having none.

An album with neither link is searched for by text: Deezer first, then the iTunes storefronts in order
(search_match). The search is ported from experiments/preview_features/match.py (the scoring is unchanged;
see its REPORT.md for the audit), with the catalog's Latin spellings and each name of an " & " credit as
further queries, and `jp` after the given storefronts.

Score of a candidate, in [0, 1]:
    0.84 * (0.55 * title similarity + 0.45 * artist similarity)
  + 0.08 * closeness of its mean track duration to the Spotify album's mean duration
  + 0.03 * its track count is consistent with the Spotify album's (see Album.count_fits)
  + 0.05 * share of its tracks that have a preview
  - 0.15 for another recording (live, tribute, karaoke...), 0.06 for a bigger edition (deluxe, expanded, box
    set...), 0.03 for a soundtrack, unless its mean duration and track count are those of the Spotify album
    (the "fingerprint").

The score says whether a listing is the album. Among the listings of that album the standard edition is
then preferred (see edition_key). An album with no Spotify numbers gets a neutral edition term.

Sources are named as the store names them: `deezer`, `itunes:<storefront>` (`itunes:us`, `itunes:jp`).
API responses are cached in a local sqlite file, so matching again costs no requests. Rate limits:
Deezer at most 5 requests a second (it answers a quota error, code 4, above that), iTunes one request
every 3.2 seconds.
"""
import json
import math
import sqlite3
import statistics
import sys
import time
import zlib
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path

import requests

from .catalog import SPOTIFY_PAGE, Album
from .textnorm import (artist_names, artist_sim, ascii_fold, core_title, credit_names, edition_marker, first_billed,
                       has_non_latin, is_various, main_title, norm, strip_edition, title_sim)

T_MIN, A_MIN = 0.6, 0.55  # a candidate below either similarity is never chosen
FLOOR, GREY = 0.72, 0.88  # below FLOOR: unmatched; below GREY: matched but ambiguous
CLOSE = 0.03  # a runner-up this close that is another release makes the match ambiguous
STRONG_TEXT = 0.93  # stop trying looser queries once a candidate reads this well
PENALTY = {"": 0.0, "soundtrack": 0.03, "bigger": 0.06, "other": 0.15}  # by edition marker
OVERSIZED = 30  # more tracks than this is not a standard edition
FETCH_MAX = 6  # tracklists fetched per source when the match is oversized, to find the standard edition
RESCUE, RESCUE_TRACKS = 6, 5  # tracklists fetched to recognise an album by its durations; fewest tracks trusted
SHORTLIST = {"deezer": 4, "itunes": 3}  # candidates whose tracks are fetched
# gb and de recovered every album a probe of nine storefronts found for the albums the US store lacks
# (gb 14 of 16, de the other two); others (jp, br, pl, fr...) only when passed with --storefronts.
DEFAULT_STOREFRONTS = ("us", "gb", "de")
SEARCH_EXTRA_STOREFRONTS = ("jp",)  # asked after the given ones when an album is searched for by text
FEW_TRACKS = 3  # a linked listing of this many tracks or fewer: look for a split edition of the same recording
SPLIT_RUNTIME = 0.15  # how far a split edition's total runtime may be from the linked listing's
EDITION_FETCH = {"deezer": 4, "itunes": 3}  # tracklists fetched to find another edition of a linked listing
LONG_S = 15 * 60  # a listing this long is an album, not a single or an EP
MIN_WINDOWS = 4  # fewer preview windows than this for a listing of LONG_S or more: under-covered
SHORT_PREVIEW_S, SHORT_PREVIEW_TRACK_S = 25.0, 60.0  # a preview shorter than the first from a track longer than the second
ARTIST_LIST_MIN = 0.9  # iTunes: how well a search result's artist must read for its album list to be fetched
CACHE_DAYS = 30  # a cached response older than this is asked for again
RETRY_SEARCH_DAYS = 1  # with --retry-unmatched: a cached search older than this is asked again
ATTEMPTS = 4  # per URL: Deezer waits 5, 10, 15 s between them, iTunes 60, 120, 180 s
STORE_DOWN_AFTER = 3  # URLs in a row a store may fail before it is left alone for the rest of the run


def store_of(source: str) -> str:
    """`deezer` or `itunes`, from a source name."""
    return source.split(":")[0]


def storefront_of(source: str) -> str:
    """The storefront of an iTunes source name (`itunes:jp` -> `jp`)."""
    return source.split(":")[1]


@dataclass
class Cand:
    """A store listing scored against an album. `tracks` is filled only for the shortlisted candidates."""
    source: str
    id: str
    title: str
    artist: str
    n_tracks: int
    artist_id: str = ""
    marker: str = ""  # textnorm.edition_marker of its title
    t: float = 0.0
    a: float = 0.0
    score: float = 0.0
    dur_off: float | None = None  # relative gap between its mean track duration and Spotify's
    count_fit: bool = False
    n_previews: int = 0
    tracks: list[dict] = field(default_factory=list, repr=False)
    kind: str = ""  # Deezer's record_type (album, ep, single), where the response gives it

    @property
    def runtime_s(self) -> float:
        """Total duration of the fetched tracks."""
        return sum(t["duration_s"] or 0.0 for t in self.tracks)

    @property
    def text(self) -> float:
        return 0.55 * self.t + 0.45 * self.a

    @property
    def fingerprint(self) -> bool:
        """Same mean duration and a consistent track count: the same tracklist as the Spotify album."""
        return self.dur_off is not None and self.dur_off < 0.004 and self.count_fit and self.n_tracks >= 3

    @property
    def penalty(self) -> float:
        """Nothing for the very tracklist Spotify had, whatever the listing calls itself ("(Live)", "USA")."""
        return 0.0 if self.fingerprint else PENALTY[self.marker]

    @property
    def oversized(self) -> bool:
        return self.n_tracks > OVERSIZED or self.marker == "bigger"

    def same_release(self, other: "Cand") -> bool:
        """Two listings of one album (editions, regional duplicates, a slightly different credit)."""
        mine, theirs = (norm(core_title(strip_edition(c.title))) for c in (self, other))
        return mine == theirs and artist_sim(self.artist, other.artist) >= 0.85


class Throttle:
    """Spaces request starts at least `interval` seconds apart."""

    def __init__(self, interval: float, backoff: float):
        self.interval, self.backoff, self._next = interval, backoff, 0.0

    def wait(self) -> None:
        start = max(time.monotonic(), self._next)
        self._next = start + self.interval
        time.sleep(max(0.0, start - time.monotonic()))


class StoreDown(IOError):
    """A store failed STORE_DOWN_AFTER URLs in a row: it is not asked again in this run."""


class Http:
    """GET JSON, rate-limited per store, with retries and a sqlite response cache (url -> zlib JSON).
    Only successful responses are cached, never an error payload. `fresh=True` neither reads nor writes
    the cache: track listings fetched for download carry preview URLs that expire, and are given up on
    after 3 attempts. `search=True` marks a search (or an artist's album list): with --retry-unmatched
    those are asked again when the cached answer is older than a day. The waits between attempts end
    at once when the run is asked to stop."""

    def __init__(self, cache: Path | None, attempts: int = ATTEMPTS, sleep=None):
        self.db = None
        if cache is not None:
            Path(cache).parent.mkdir(parents=True, exist_ok=True)
            self.db = sqlite3.connect(cache, timeout=60)
            self.db.execute("CREATE TABLE IF NOT EXISTS http_cache(url TEXT PRIMARY KEY, body BLOB, fetched_at TEXT)")
        self.throttles = {"deezer": Throttle(0.2, backoff=5), "itunes": Throttle(3.2, backoff=60)}
        self.attempts, self.sleep, self.session, self.fetched = attempts, sleep or self._pause, None, 0
        self.fetched_by: Counter = Counter()  # store -> requests answered (not served from the cache)
        self.asked_by: Counter = Counter()  # store -> distinct URLs asked for in this run, cached or not
        self._asked: set[str] = set()
        self.abort = lambda: False  # sync sets it: True once the run was asked to stop
        self.search_max_age_days = CACHE_DAYS
        self.failed: Counter = Counter()  # store -> URLs given up on in a row

    def _pause(self, seconds: float) -> None:
        end = time.monotonic() + seconds
        while not self.abort() and (left := end - time.monotonic()) > 0:
            time.sleep(min(0.5, left))

    def down(self) -> list[str]:
        return sorted(s for s, n in self.failed.items() if n >= STORE_DOWN_AFTER)

    @staticmethod
    def url(base: str, **params: object) -> str:
        return requests.Request("GET", base, params=params).prepare().url

    def cached(self, url: str, max_age_days: float | None = None) -> dict | None:
        if self.db is None:
            return None
        hit = self.db.execute("SELECT body, fetched_at FROM http_cache WHERE url = ?", (url,)).fetchone()
        if not hit:
            return None
        if max_age_days is not None:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(hit[1])
            if age.total_seconds() > max_age_days * 86400:
                return None
        return json.loads(zlib.decompress(hit[0]))

    def fetch(self, url: str) -> dict:
        """One request, no retry. Raises requests.RequestException or ValueError."""
        if self.session is None:
            self.session = requests.Session()
        r = self.session.get(url, timeout=30)
        if r.status_code in (403, 429) or r.status_code >= 500:
            raise requests.HTTPError(f"HTTP {r.status_code}")
        data = r.json()
        if isinstance(data, dict) and (data.get("error") or {}).get("code") in (4, 700):  # quota or busy, sent as 200
            raise requests.HTTPError(f"Deezer: {data['error'].get('message', 'quota')}")
        return data

    def get(self, url: str, store: str, fresh: bool = False, search: bool = False) -> dict:
        if url not in self._asked:
            self._asked.add(url)
            self.asked_by[store] += 1
        if not fresh and (data := self.cached(url, self.search_max_age_days if search else CACHE_DAYS)) is not None:
            return data
        if self.failed[store] >= STORE_DOWN_AFTER:
            raise StoreDown(f"{store} is not answering")
        throttle = self.throttles[store]
        for attempt in range(min(self.attempts, 3) if fresh else self.attempts):  # a listing for download gives up sooner
            if self.abort():
                raise IOError("interrupted")
            throttle.wait()
            try:
                data = self.fetch(url)
            except (requests.RequestException, ValueError) as e:
                pause = throttle.backoff * (attempt + 1)
                print(f"  retry {attempt + 1} in {pause:.0f}s ({e}): {url[:110]}", file=sys.stderr)
                self.sleep(pause)
                continue
            self.fetched += 1
            self.fetched_by[store] += 1
            self.failed[store] = 0
            if not fresh and self.db is not None and not (isinstance(data, dict) and data.get("error")):
                self.db.execute("INSERT OR REPLACE INTO http_cache VALUES (?, ?, ?)", (
                    url, zlib.compress(json.dumps(data, separators=(",", ":")).encode()),
                    datetime.now(timezone.utc).isoformat(timespec="seconds")))
                self.db.commit()
            return data
        self.failed[store] += 1
        raise IOError(f"giving up on {url}")


def import_responses(dest: Path, source: Path, default_storefront: str | None = None) -> int:
    """Copy another http_cache table (same layout) into the cache at `dest`, keeping what `dest` already has.
    With `default_storefront`, iTunes URLs recorded without `country=` get it (the experiment asked the
    default storefront, us). Returns the number of responses added."""
    Http(dest).db.close()  # creates the table
    con = sqlite3.connect(dest, timeout=60)
    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    before = con.execute("SELECT COUNT(*) FROM http_cache").fetchone()[0]
    for url, body, fetched_at in src.execute("SELECT url, body, fetched_at FROM http_cache"):
        if "itunes.apple.com" in url and "country=" not in url:
            if default_storefront is None:
                continue
            url += f"&country={default_storefront}"
        con.execute("INSERT OR IGNORE INTO http_cache VALUES (?, ?, ?)", (url, body, fetched_at))
    con.commit()
    added = con.execute("SELECT COUNT(*) FROM http_cache").fetchone()[0] - before
    con.close(), src.close()
    return added


def text_pairs(al: Album) -> list[tuple[str, str]]:
    """(artist, title) spellings to search for, most specific first."""
    names = artist_names(al.artist)
    title = strip_edition(al.title)
    titles = list(dict.fromkeys([title, core_title(title), main_title(title)]))
    if has_non_latin(core_title(title)) and "(" in title:  # "呼吸 (Kokyuu)": the romanised title alone
        titles.append(title[title.index("(") + 1:].rstrip(") "))
    pairs = [(names[0], title), (first_billed(names[0]), main_title(title))]
    pairs += [(n, t) for n in names[:2] for t in titles]
    pairs += [(a[4:], t) for a, t in pairs[:1] if a.lower().startswith("the ")]  # "The Can" is listed as "Can"
    pairs += [(ascii_fold(a), ascii_fold(t)) for a, t in pairs[:2] if not (a + t).isascii()]
    if al.artist_latin or al.title_latin:  # the catalog's Latin spellings, second so that iTunes asks for them too
        latin = (al.artist_latin or names[0], strip_edition(al.title_latin) if al.title_latin else title)
        pairs[1:1] = [latin] + [(a, t) for a in (latin[0], names[0]) for t in (latin[1], title)]
    pairs += [(n, t) for n in credit_names(al.artist_latin or names[0])[:3] for t in titles[:1]]  # "A & B": A, then B
    clean = [(a.replace('"', " ").strip(), t.replace('"', " ").strip()) for a, t in pairs]
    return list(dict.fromkeys((a, t) for a, t in clean if a and t))


def title_only(al: Album) -> list[str]:
    """The title as a query of its own, when it is distinctive enough (three words) to be searched without the artist."""
    title = main_title(al.title).replace('"', " ").strip()
    return [title] if len(norm(title).split()) >= 3 else []


def sims(al: Album, title: str, artist: str) -> tuple[float, float]:
    """(title, artist) similarity of a listing, each the better of the album's native and Latin spelling."""
    t = max(title_sim(ours, title) for ours in dict.fromkeys(filter(None, (al.title, al.title_latin))))
    a = max(artist_sim(ours, artist) for ours in dict.fromkeys(filter(None, (al.artist, al.artist_latin))))
    return t, a


def scored(al: Album, source: str, id_: object, title: str, artist: str, n_tracks: int, artist_id: object = "",
           kind: str = "") -> Cand:
    """A listing with its text similarities and a provisional score (no durations yet)."""
    ours = f"{al.title} / {al.title_latin}" if al.title_latin else al.title
    c = Cand(source, str(id_), title, artist, int(n_tracks or 0), str(artist_id), edition_marker(ours, title, artist),
             kind=kind)
    (c.t, c.a), c.count_fit = sims(al, title, artist), al.count_fits(c.n_tracks)
    c.score = 0.84 * c.text - c.penalty + (0.015 if al.override else 0.03 * c.count_fit)
    return c


def finalise(c: Cand, al: Album) -> None:
    """The full score, once the candidate's tracks are known. Without Spotify numbers the candidate gets a
    neutral edition term and no duration gap."""
    durations = [t["duration_s"] for t in c.tracks[:SPOTIFY_PAGE] if t["duration_s"]]
    c.n_tracks, c.n_previews = len(c.tracks), sum(bool(t["preview_url"]) for t in c.tracks)
    c.count_fit = al.count_fits(c.n_tracks)
    if durations and not al.override:
        c.dur_off = abs(statistics.fmean(durations) - al.mean_s) / al.mean_s
    edition = 0.055 if al.override else (
        0.08 * (math.exp(-c.dur_off / 0.05) if c.dur_off is not None else 0.0) + 0.03 * c.count_fit)
    c.score = 0.84 * c.text - c.penalty + edition + 0.05 * (c.n_previews / c.n_tracks if c.n_tracks else 0.0)


# --- the stores --------------------------------------------------------------------------------

def deezer_artist_albums(http: Http, al: Album, artist_id: str, artist: str) -> list[Cand]:
    """Every album Deezer lists for the artist, without track counts. Search misses some albums and sometimes
    returns the deluxe edition only."""
    url = Http.url(f"https://api.deezer.com/artist/{artist_id}/albums", limit=100)
    return [scored(al, "deezer", d["id"], d["title"], artist, 0, artist_id, d.get("record_type") or "")
            for d in http.get(url, "deezer", search=True).get("data", [])]


def deezer_search(http: Http, al: Album) -> Iterator[list[Cand]]:
    """Candidates per query: strict artist/album searches, then plain-text ones (every word must be found, so the
    shortest spelling matters), then the artist's albums: from search, with track counts, for a listing under
    another title to be recognised by its durations, and from the artist's own album list."""
    pairs = text_pairs(al)
    various = is_various(al.artist)
    strict = [f'album:"{t}"' if various else f'artist:"{a}" album:"{t}"' for a, t in pairs]
    plain = [t if various else f"{a} {t}" for a, t in pairs[:2]]
    plain += [f'album:"{t}"' for t in title_only(al)]
    whole = [] if various or al.override else [f'artist:"{first_billed(pairs[0][0])}"']
    artists: Counter = Counter()
    for q in dict.fromkeys(strict + plain + whole):
        data = http.get(Http.url("https://api.deezer.com/search/album", q=q, limit=50 if q in whole else 25), "deezer",
                        search=True)
        batch = [scored(al, "deezer", d["id"], d["title"], d["artist"]["name"], d.get("nb_tracks", 0), d["artist"]["id"])
                 for d in data.get("data", [])]
        artists.update((c.artist_id, c.artist) for c in batch if c.a >= 0.95)
        yield batch
    if artists:
        yield deezer_artist_albums(http, al, *artists.most_common(1)[0][0])


def deezer_tracks(http: Http, album_id: str, fresh: bool = False) -> list[dict]:
    """The album's tracks in album order, with the full track's duration and the preview URL. Deezer's
    preview URLs are signed and expire after 15 minutes: pass fresh=True right before downloading."""
    url, out = Http.url(f"https://api.deezer.com/album/{album_id}/tracks", limit=200), []
    while url:
        data = http.get(url, "deezer", fresh)
        out += [{"track_id": str(t["id"]), "title": t["title"], "duration_s": float(t.get("duration") or 0),
                 "disk": t.get("disk_number"), "position": t.get("track_position"), "preview_url": t.get("preview") or None}
                for t in data.get("data", [])]
        url = data.get("next")
    return sorted(out, key=lambda t: (t["disk"] or 1, t["position"] or 0))  # stable: album order


def itunes_urls(al: Album, storefront: str) -> list[str]:
    """The album's searches in one iTunes storefront."""
    terms = [t if is_various(al.artist) else f"{a} {t}" for a, t in text_pairs(al)[:2]] + title_only(al)
    return [Http.url("https://itunes.apple.com/search", term=q, entity="album", limit=25, country=storefront)
            for q in dict.fromkeys(terms)]


def _itunes_albums(al: Album, storefront: str, results: list[dict]) -> list[Cand]:
    return [scored(al, f"itunes:{storefront}", d["collectionId"], d["collectionName"], d["artistName"],
                   d.get("trackCount", 0), d.get("artistId", ""))
            for d in results if d.get("wrapperType", "collection") == "collection"
            and d.get("collectionType") in ("Album", "Compilation")]


def itunes_artist_albums(http: Http, al: Album, artist_id: str, storefront: str) -> list[Cand]:
    """Every album the storefront lists for the artist. Search misses albums it has ("Liquid Swords")."""
    url = Http.url("https://itunes.apple.com/lookup", id=artist_id, entity="album", limit=200, country=storefront)
    return _itunes_albums(al, storefront, http.get(url, "itunes", search=True).get("results", []))


def itunes_search(http: Http, al: Album, storefront: str) -> Iterator[list[Cand]]:
    """Candidates per search in one iTunes storefront, then, when the searches found the artist, the
    artist's album list (the caller stops before it once a candidate reads right)."""
    artists: Counter = Counter()
    for url in itunes_urls(al, storefront):
        batch = _itunes_albums(al, storefront, http.get(url, "itunes", search=True).get("results", []))
        artists.update(c.artist_id for c in batch if c.artist_id and c.a >= ARTIST_LIST_MIN)
        yield batch
    if artists and not is_various(al.artist):
        yield itunes_artist_albums(http, al, artists.most_common(1)[0][0], storefront)


def itunes_tracks(http: Http, album_id: str, storefront: str, fresh: bool = False) -> list[dict]:
    """The album's songs in album order as one storefront lists them, in the shape deezer_tracks returns."""
    url = Http.url("https://itunes.apple.com/lookup", id=album_id, entity="song", limit=200, country=storefront)
    data = http.get(url, "itunes", fresh)
    songs = [t for t in data.get("results", []) if t.get("wrapperType") == "track" and t.get("kind") == "song"]
    songs.sort(key=lambda t: (t.get("discNumber") or 1, t.get("trackNumber") or 0))
    return [{"track_id": str(t["trackId"]), "title": t.get("trackName", ""),
             "duration_s": (t.get("trackTimeMillis") or 0) / 1000, "disk": t.get("discNumber"),
             "position": t.get("trackNumber"), "preview_url": t.get("previewUrl") or None} for t in songs]


def tracks(http: Http, source: str, album_id: str, fresh: bool = False) -> list[dict]:
    """The tracks of a listing, in album order: track_id, title, duration_s, disk, position, preview_url."""
    if store_of(source) == "deezer":
        return deezer_tracks(http, album_id, fresh)
    return itunes_tracks(http, album_id, storefront_of(source), fresh)


def search(http: Http, al: Album, source: str) -> Iterator[list[Cand]]:
    return deezer_search(http, al) if source == "deezer" else itunes_search(http, al, storefront_of(source))


# --- choosing ----------------------------------------------------------------------------------

def fetch(http: Http, al: Album, cands: list[Cand]) -> list[Cand]:
    """The candidates with their tracks fetched and their full score; listings without tracks are dropped."""
    for c in cands:
        c.tracks = tracks(http, c.source, c.id)
        finalise(c, al)
    return [c for c in cands if c.tracks]


def candidates(http: Http, al: Album, source: str) -> list[Cand]:
    """The source's shortlisted candidates, tracks fetched, best first."""
    pool: dict[str, Cand] = {}
    for batch in search(http, al, source):
        for c in batch:
            pool.setdefault(c.id, c)
        if any(c.text >= STRONG_TEXT and not c.penalty for c in pool.values()):
            break
    short = sorted((c for c in pool.values() if c.t >= T_MIN and c.a >= A_MIN), key=lambda c: -c.score)
    short = fetch(http, al, [c for c in short if c.score >= short[0].score - 0.15][:SHORTLIST[store_of(source)]])
    done = {c.id for c in short}
    if judge(short)[0] is None and not al.override:  # rescue: title or artist reads right, and it is that tracklist
        odd = sorted((c for c in pool.values() if c.id not in done and c.count_fit and c.n_tracks >= RESCUE_TRACKS
                      and (c.t >= 0.75 or c.a >= 0.9)), key=lambda c: -c.text)[:RESCUE]
        short += [c for c in fetch(http, al, odd) if c.fingerprint]
    best = judge(short)[0]
    if best and best.oversized:  # the standard edition may be among the listings not fetched yet
        if source == "deezer" and best.artist_id:
            for c in deezer_artist_albums(http, al, best.artist_id, best.artist):
                pool.setdefault(c.id, c)
        more = [c for c in pool.values() if c.id not in done and c.marker != "other" and c.same_release(best)]
        more.sort(key=lambda c: (c.marker == "bigger", c.n_tracks or OVERSIZED))  # the album list has no track counts
        short += fetch(http, al, more[:max(2, FETCH_MAX - len(done))])
    return sorted(short, key=lambda c: -c.score)


def edition_key(c: Cand) -> tuple:
    """Preference among listings of one album: not a one- or two-track single, not more than OVERSIZED tracks,
    the mean track duration closest to Spotify's (in steps of 2%), no bigger-edition marker, the fewest tracks,
    a preview for every track, Deezer. Durations come before size below OVERSIZED tracks: the shortest listing
    is sometimes an abridged one."""
    return (c.n_tracks < 3 and not c.count_fit, c.n_tracks > OVERSIZED, round((c.dur_off or 0.0) / 0.02),
            c.marker == "bigger", c.n_tracks, c.n_previews < c.n_tracks, c.source != "deezer", -c.score)


def judge(cands: list[Cand]) -> tuple[Cand | None, bool, str]:
    """(chosen candidate, ambiguous, reason). A candidate is acceptable when it reads right (above the floor), or
    when its durations are the Spotify album's (fingerprint). The best acceptable one names the release (within
    CLOSE of the best score, one with previews is preferred); the chosen candidate is that release's preferred
    edition (edition_key). When durations favour one release and another one clearly reads better, the one
    that reads better is chosen. Ambiguous: that case, another release scores as close, the score is in the
    grey zone, the text is not quite right while the durations disagree, or the album was recognised by its
    durations alone: the Spotify album itself may be the wrong one."""
    cands = sorted(cands, key=lambda c: -c.score)
    reads_right = lambda c: c.score >= FLOOR and c.t >= T_MIN and c.a >= A_MIN  # noqa: E731
    ok = [c for c in cands if c.n_tracks and (
        reads_right(c) or (c.fingerprint and c.n_tracks >= RESCUE_TRACKS and (c.t >= 0.75 or c.a >= 0.9)))]
    if not ok:
        return None, False, f"best candidate below the floor ({cands[0].score:.2f})" if cands else "no candidate"
    top = max(ok, key=lambda c: (c.score >= ok[0].score - CLOSE and c.n_previews > 0, c.score))
    reader = max(ok, key=lambda c: c.text)
    if reader.t >= 0.95 and reader.text >= top.text + 0.05 and not reader.same_release(top):
        best = min((c for c in ok if c.same_release(reader) and c.text >= reader.text - 0.05), key=edition_key)
        return best, True, f"the Spotify album looks like another release: {top.title} / {top.artist}"
    best = min((c for c in ok if c.same_release(top) and c.text >= top.text - 0.05
                and (c.marker == "other") == (top.marker == "other") and (c.n_previews > 0 or top.n_previews == 0)),
               key=edition_key)
    rival = next((c for c in ok if not c.same_release(top) and c.score >= top.score - CLOSE
                  and not (top.fingerprint and not c.fingerprint)), None)
    if rival:
        return best, True, f"another release scores as close: {rival.title} / {rival.artist} ({rival.score:.2f})"
    if not reads_right(top):
        return best, True, f"recognised by durations only (title {top.t:.2f}, artist {top.a:.2f})"
    if top.score < GREY and not top.fingerprint:
        return best, True, f"score in the grey zone ({top.score:.2f})"
    if top.text < 0.97 and (top.dur_off or 0.0) > 0.1 and not any(c.fingerprint and c.same_release(top) for c in ok):
        return best, True, f"reads nearly right ({top.text:.2f}) but its durations are {top.dur_off:.0%} off Spotify's"
    return best, False, ""


def needs_fallback(cands: list[Cand]) -> bool:
    """Is the first iTunes storefront worth asking, given the Deezer candidates? Yes when Deezer has no match,
    an ambiguous one, one with previews for fewer than half of its tracks or one with more than OVERSIZED tracks."""
    best, ambiguous, _ = judge(cands)
    return best is None or ambiguous or best.n_previews < best.n_tracks / 2 or best.n_tracks > OVERSIZED


def settled(cands: list[Cand]) -> bool:
    """Is there a confident match with at least one preview? Then no further storefront is asked."""
    best, ambiguous, _ = judge(cands)
    return best is not None and not ambiguous and best.n_previews > 0


def under_covered(n_previews: int, runtime_s: float) -> bool:
    """Too few preview windows for a long listing: one to MIN_WINDOWS - 1 of them for LONG_S or more of music
    (a listing with no preview at all is not under-covered, it has no audio)."""
    return 0 < n_previews < MIN_WINDOWS and runtime_s >= LONG_S


def short_preview(clips: list[tuple[float, float]]) -> bool:
    """Is one of the album's clips a cut-down preview? `clips` holds (decoded clip seconds, the track's
    seconds) per downloaded clip. The stores' APIs do not give a preview's length, so the matcher leaves
    the `short_preview` column of matches.csv empty; the embedder, which decodes the clips, sets it with this."""
    return any(0 < clip_s < SHORT_PREVIEW_S and track_s > SHORT_PREVIEW_TRACK_S for clip_s, track_s in clips)


@dataclass(frozen=True)
class Match:
    """The verdict for one album. `source` is empty when nothing acceptable was found."""
    source: str = ""
    album_id: str = ""
    title: str = ""
    artist: str = ""
    score: float = 0.0
    ambiguous: bool = False
    n_tracks: int = 0
    n_previews: int = 0
    reason: str = ""
    matched_by: str = ""  # deezer_id, apple_id (the catalog row's link), search, override
    edition: str = ""  # what the edition rule put in place of the linked listing: standard, split
    runtime_s: float = 0.0  # total duration of the listing's tracks
    linked_id: str = ""  # the id the link names, when the edition rule chose another listing (not in matches.csv)

    @property
    def under_covered(self) -> bool:
        return under_covered(self.n_previews, self.runtime_s)

    def row(self, key: str) -> dict:
        """The album's line of matches.csv. `short_preview` is left empty: it is known once clips are decoded."""
        if not self.source:
            return {"key": key, "source": "", "source_album_id": "", "matched_title": "", "matched_artist": "",
                    "score": "", "ambiguous": 0, "n_tracks": "", "n_clips_available": "", "matched_by": "",
                    "edition": "", "runtime_s": "", "under_covered": "", "short_preview": ""}
        return {"key": key, "source": self.source, "source_album_id": self.album_id, "matched_title": self.title,
                "matched_artist": self.artist, "score": f"{self.score:.4f}", "ambiguous": int(self.ambiguous),
                "n_tracks": self.n_tracks, "n_clips_available": self.n_previews, "matched_by": self.matched_by,
                "edition": self.edition, "runtime_s": round(self.runtime_s), "under_covered": int(self.under_covered),
                "short_preview": ""}


def _match(c: Cand, ambiguous: bool, reason: str, matched_by: str, edition: str = "", linked_id: str = "") -> Match:
    return Match(c.source, c.id, c.title, c.artist, round(c.score, 4), ambiguous, c.n_tracks, c.n_previews, reason,
                 matched_by, edition, c.runtime_s, linked_id)


def verdict(cands: list[Cand]) -> Match:
    best, ambiguous, reason = judge(cands)
    if best is None:
        return Match(reason=reason)
    return _match(best, ambiguous, reason, "search")


def search_match(http: Http, al: Album, storefronts: tuple[str, ...] = DEFAULT_STOREFRONTS) -> Match:
    """The text search. Deezer, then the first storefront when Deezer's answer is missing or doubtful
    (needs_fallback), then each further storefront, and SEARCH_EXTRA_STOREFRONTS after them, only while there
    is still no confident match with a preview (settled)."""
    storefronts = tuple(dict.fromkeys(storefronts + SEARCH_EXTRA_STOREFRONTS))
    cands = candidates(http, al, "deezer")
    for n, cc in enumerate(storefronts):
        if not (needs_fallback(cands) if n == 0 else not settled(cands)):
            break
        cands += candidates(http, al, f"itunes:{cc}")
    return verdict(cands)


# --- the catalog row's store links -------------------------------------------------------------

def _deezer_head(http: Http, album_id: str) -> dict | None:
    """Deezer's album object, or None when Deezer has no such album (it answers an error object)."""
    data = http.get(f"https://api.deezer.com/album/{album_id}", "deezer")
    return None if not isinstance(data, dict) or data.get("error") or not data.get("id") else data


def _itunes_lookup(http: Http, album_id: str, storefront: str) -> dict | None:
    """The album's collection object in one storefront (the request is the one itunes_tracks makes), or None."""
    url = Http.url("https://itunes.apple.com/lookup", id=album_id, entity="song", limit=200, country=storefront)
    return next((r for r in http.get(url, "itunes").get("results", []) if r.get("wrapperType") == "collection"), None)


def linked_listing(http: Http, al: Album, source: str, album_id: str) -> Cand | None:
    """The listing a store link names, with its tracks and its score, or None when the store does not have it
    (a dead link, or an album withdrawn since). An Apple id is asked for in the link's storefront, then in
    `us`; the candidate's source says which storefront answered."""
    if store_of(source) == "deezer":
        head = _deezer_head(http, album_id)
        if head is None:
            return None
        artist = head.get("artist") or {}
        got = fetch(http, al, [scored(al, "deezer", head["id"], head.get("title", ""), artist.get("name", ""),
                                      head.get("nb_tracks", 0), artist.get("id", ""), head.get("record_type") or "")])
        return got[0] if got else None
    for cc in dict.fromkeys((storefront_of(source), "us")):
        head = _itunes_lookup(http, album_id, cc)
        got = fetch(http, al, _itunes_albums(al, cc, [{**head, "collectionType": "Album"}])) if head else []
        if got:
            return got[0]
    return None


def artist_listings(http: Http, al: Album, c: Cand) -> list[Cand]:
    """The other listings of the artist of `c`, in its store (and storefront). Deezer's have no track counts."""
    if not c.artist_id or c.artist_id == "0":
        return []
    if store_of(c.source) == "deezer":
        pool = deezer_artist_albums(http, al, c.artist_id, c.artist)
    else:
        pool = itunes_artist_albums(http, al, c.artist_id, storefront_of(c.source))
    return [x for x in pool if x.id != c.id]


def preferred_edition(http: Http, al: Album, linked: Cand) -> tuple[Cand, str]:
    """(the listing to use, what was done). The linked listing itself, "", unless
    - it is oversized (more than OVERSIZED tracks, or a bigger-edition marker): the standard edition among the
      same artist's listings of the same release, when there is one that is album-sized (LONG_S) and has a
      preview, chosen by edition_key ("standard"; "oversized" when none was found);
    - it has one to FEW_TRACKS tracks: the listing of the same release with the most previews among those with
      more tracks whose total runtime is within SPLIT_RUNTIME of the linked one ("split"; "few_tracks" when
      none was found). Another performance (a live take, a single edit) has another runtime or another title."""
    few = 1 <= linked.n_tracks <= FEW_TRACKS
    if not (linked.oversized or few):
        return linked, ""
    store = store_of(linked.source)
    same = [c for c in artist_listings(http, al, linked) if c.kind != "single" and c.same_release(linked)
            and (c.marker == "other") == (linked.marker == "other")]
    if linked.oversized:
        if store == "itunes":  # the album list gives track counts: skip what cannot be the standard edition
            same = [c for c in same if c.n_tracks <= OVERSIZED and (c.marker != "bigger" or c.n_tracks < linked.n_tracks)]
        same.sort(key=lambda c: (c.marker == "bigger", c.n_tracks or OVERSIZED))
        ok = [c for c in fetch(http, al, same[:EDITION_FETCH[store]])
              if not c.oversized and c.n_previews and c.runtime_s >= LONG_S]
        return (min(ok, key=edition_key), "standard") if ok else (linked, "oversized")
    if store == "itunes":
        same = [c for c in same if c.n_tracks > linked.n_tracks]
    same.sort(key=lambda c: (c.marker == "bigger", -c.n_tracks))
    base = linked.runtime_s
    ok = [c for c in fetch(http, al, same[:EDITION_FETCH[store]])
          if c.n_tracks > linked.n_tracks and c.n_previews > linked.n_previews and base > 0
          and abs(c.runtime_s - base) <= SPLIT_RUNTIME * base]
    return (max(ok, key=lambda c: (c.n_previews, c.n_tracks, c.score)), "split") if ok else (linked, "few_tracks")


def linked_match(http: Http, al: Album, source: str, album_id: str) -> Match | None:
    """The match a store link gives, after the edition rule, or None when the store does not have the listing.
    The listing is not verified: `ambiguous` only says that its title or its artist reads below the search's
    floors (T_MIN, A_MIN) against both the album's native and Latin spelling."""
    linked = linked_listing(http, al, source, album_id)
    if linked is None:
        return None
    best, done = preferred_edition(http, al, linked)
    ambiguous = best.t < T_MIN or best.a < A_MIN
    reason = f"the linked listing reads differently (title {best.t:.2f}, artist {best.a:.2f})" if ambiguous else ""
    if done in ("oversized", "few_tracks"):
        reason = "; ".join(filter(None, [reason, {"oversized": "a bigger edition, and no standard one was found",
                                                 "few_tracks": "few tracks, and no split edition was found"}[done]]))
    replaced = done in ("standard", "split")
    return _match(best, ambiguous, reason, "deezer_id" if store_of(source) == "deezer" else "apple_id",
                  done if replaced else "", linked.id if replaced else "")


def match_album(http: Http, al: Album, storefronts: tuple[str, ...] = DEFAULT_STOREFRONTS) -> Match:
    """The album's match. With a Deezer or an Apple link in its catalog row: that listing (linked_match),
    Deezer's first. When it has no preview, the other link's listing, then the text search, are tried, and
    the first one with a preview is the match; when none has, the first linked listing is recorded, with
    no preview. Without a link, or when no link resolves: the text search (search_match)."""
    first = None
    for source, album_id in al.links:
        m = linked_match(http, al, source, album_id)
        if m is not None and m.n_previews:
            return m
        first = first or m
    m = search_match(http, al, storefronts)
    if first is None:
        return replace(m, reason="; ".join(filter(None, ["no store link resolves", m.reason]))) if al.links else m
    if m.source and m.n_previews:
        return replace(m, reason="; ".join(filter(None, ["the linked listing has no preview", m.reason])))
    return replace(first, reason="; ".join(filter(None, [first.reason, "no preview, and the search found none either"])))


def forced(http: Http, source: str, album_id: str) -> Match:
    """A hand-picked listing (match_overrides.json): its title and artist are read from the store."""
    listing = tracks(http, source, album_id)
    title = artist = ""
    if store_of(source) == "deezer":
        data = http.get(f"https://api.deezer.com/album/{album_id}", "deezer")
        title, artist = data.get("title", ""), (data.get("artist") or {}).get("name", "")
    else:
        head = _itunes_lookup(http, album_id, storefront_of(source)) or {}
        title, artist = head.get("collectionName", ""), head.get("artistName", "")
    return Match(source, album_id, title, artist, 1.0, False, len(listing), sum(bool(t["preview_url"]) for t in listing),
                 "forced by match_overrides.json", "override", "", sum(t["duration_s"] or 0.0 for t in listing))
