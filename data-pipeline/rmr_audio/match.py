"""Match a catalog album to a store listing: Deezer first, then the iTunes storefronts in order.

Ported from experiments/preview_features/match.py (the scoring is unchanged; see its REPORT.md for
the audit). No audio is fetched here.

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
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import requests

from .catalog import SPOTIFY_PAGE, Album
from .textnorm import (artist_names, artist_sim, ascii_fold, core_title, edition_marker, first_billed, has_non_latin,
                       is_various, main_title, norm, strip_edition, title_sim)

T_MIN, A_MIN = 0.6, 0.55  # a candidate below either similarity is never chosen
FLOOR, GREY = 0.72, 0.88  # below FLOOR: unmatched; below GREY: matched but ambiguous
CLOSE = 0.03  # a runner-up this close that is another release makes the match ambiguous
STRONG_TEXT = 0.93  # stop trying looser queries once a candidate reads this well
PENALTY = {"": 0.0, "soundtrack": 0.03, "bigger": 0.06, "other": 0.15}  # by edition marker
OVERSIZED = 30  # more tracks than this is not a standard edition
FETCH_MAX = 6  # tracklists fetched per source when the match is oversized, to find the standard edition
RESCUE, RESCUE_TRACKS = 6, 5  # tracklists fetched to recognise an album by its durations; fewest tracks trusted
SHORTLIST = {"deezer": 4, "itunes": 3}  # candidates whose tracks are fetched
DEFAULT_STOREFRONTS = ("us", "gb", "jp", "de", "fr", "ca", "au", "br")
CACHE_DAYS = 30  # a cached search older than this is asked again


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


class Http:
    """GET JSON, rate-limited per store, with retries and a sqlite response cache (url -> zlib JSON).
    Only successful responses are cached. `fresh=True` neither reads nor writes the cache: track
    listings fetched for download carry preview URLs that expire, and are given up on after 3 attempts."""

    def __init__(self, cache: Path | None, attempts: int = 8, sleep=time.sleep):
        self.db = None
        if cache is not None:
            Path(cache).parent.mkdir(parents=True, exist_ok=True)
            self.db = sqlite3.connect(cache, timeout=60)
            self.db.execute("CREATE TABLE IF NOT EXISTS http_cache(url TEXT PRIMARY KEY, body BLOB, fetched_at TEXT)")
        self.throttles = {"deezer": Throttle(0.2, backoff=5), "itunes": Throttle(3.2, backoff=60)}
        self.attempts, self.sleep, self.session, self.fetched = attempts, sleep, None, 0
        self.abort = lambda: False  # sync sets it: True once the run was asked to stop

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

    def get(self, url: str, store: str, fresh: bool = False) -> dict:
        if not fresh and (data := self.cached(url, CACHE_DAYS)) is not None:
            return data
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
            if not fresh and self.db is not None:
                self.db.execute("INSERT OR REPLACE INTO http_cache VALUES (?, ?, ?)", (
                    url, zlib.compress(json.dumps(data, separators=(",", ":")).encode()),
                    datetime.now(timezone.utc).isoformat(timespec="seconds")))
                self.db.commit()
            return data
        raise IOError(f"giving up on {url}")


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
    clean = [(a.replace('"', " ").strip(), t.replace('"', " ").strip()) for a, t in pairs]
    return list(dict.fromkeys((a, t) for a, t in clean if a and t))


def title_only(al: Album) -> list[str]:
    """The title as a query of its own, when it is distinctive enough (three words) to be searched without the artist."""
    title = main_title(al.title).replace('"', " ").strip()
    return [title] if len(norm(title).split()) >= 3 else []


def scored(al: Album, source: str, id_: object, title: str, artist: str, n_tracks: int, artist_id: object = "") -> Cand:
    """A listing with its text similarities and a provisional score (no durations yet)."""
    c = Cand(source, str(id_), title, artist, int(n_tracks or 0), str(artist_id), edition_marker(al.title, title, artist))
    c.t, c.a, c.count_fit = title_sim(al.title, title), artist_sim(al.artist, artist), al.count_fits(c.n_tracks)
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
    return [scored(al, "deezer", d["id"], d["title"], artist, 0, artist_id) for d in http.get(url, "deezer").get("data", [])]


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
        data = http.get(Http.url("https://api.deezer.com/search/album", q=q, limit=50 if q in whole else 25), "deezer")
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


def itunes_search(http: Http, al: Album, storefront: str) -> Iterator[list[Cand]]:
    """Candidates per search in one iTunes storefront."""
    for url in itunes_urls(al, storefront):
        data = http.get(url, "itunes")
        yield [scored(al, f"itunes:{storefront}", d["collectionId"], d["collectionName"], d["artistName"],
                      d.get("trackCount", 0))
               for d in data.get("results", []) if d.get("collectionType") in ("Album", "Compilation")]


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


def has_audio(cands: list[Cand]) -> bool:
    """Is there a match with at least one preview?"""
    best = judge(cands)[0]
    return best is not None and best.n_previews > 0


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

    def row(self, key: str) -> dict:
        """The album's line of matches.csv."""
        if not self.source:
            return {"key": key, "source": "", "source_album_id": "", "matched_title": "", "matched_artist": "",
                    "score": "", "ambiguous": 0, "n_tracks": "", "n_clips_available": ""}
        return {"key": key, "source": self.source, "source_album_id": self.album_id, "matched_title": self.title,
                "matched_artist": self.artist, "score": f"{self.score:.4f}", "ambiguous": int(self.ambiguous),
                "n_tracks": self.n_tracks, "n_clips_available": self.n_previews}


def verdict(cands: list[Cand]) -> Match:
    best, ambiguous, reason = judge(cands)
    if best is None:
        return Match(reason=reason)
    return Match(best.source, best.id, best.title, best.artist, round(best.score, 4), ambiguous, best.n_tracks,
                 best.n_previews, reason)


def match_album(http: Http, al: Album, storefronts: tuple[str, ...] = DEFAULT_STOREFRONTS) -> Match:
    """Deezer, then the first storefront when Deezer's answer is missing or doubtful (needs_fallback), then
    each further storefront only while there is still no match with a preview."""
    cands = candidates(http, al, "deezer")
    for n, cc in enumerate(storefronts):
        if not (needs_fallback(cands) if n == 0 else not has_audio(cands)):
            break
        cands += candidates(http, al, f"itunes:{cc}")
    return verdict(cands)


def forced(http: Http, source: str, album_id: str) -> Match:
    """A hand-picked listing (match_overrides.json): its title and artist are read from the store."""
    listing = tracks(http, source, album_id)
    title = artist = ""
    if store_of(source) == "deezer":
        data = http.get(f"https://api.deezer.com/album/{album_id}", "deezer")
        title, artist = data.get("title", ""), (data.get("artist") or {}).get("name", "")
    else:
        url = Http.url("https://itunes.apple.com/lookup", id=album_id, entity="song", limit=200,
                       country=storefront_of(source))
        head = next((r for r in http.get(url, "itunes").get("results", []) if r.get("wrapperType") == "collection"), {})
        title, artist = head.get("collectionName", ""), head.get("artistName", "")
    return Match(source, album_id, title, artist, 1.0, False, len(listing), sum(bool(t["preview_url"]) for t in listing),
                 "forced by match_overrides.json")
