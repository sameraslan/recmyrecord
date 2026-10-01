"""Step 1: match every catalog album to a Deezer album (iTunes as fallback) and record its tracks' preview URLs.

    python match.py                     # match the albums not in the cache yet, then the iTunes fallback
    python match.py --no-itunes         # Deezer only (fast); a later plain run does the fallback
    python match.py --rescore           # re-score finished albums from the cached API responses
    python match.py --retry-unmatched   # run the unmatched albums again
    python match.py --rows 0,5,17 | --limit 100
    python match.py --report            # coverage, results/coverage_match.json and the two match logs

State lives in cache/match.sqlite: `albums` and `tracks` (read by extract.py) and `http_cache`, the raw API
responses (zlib-compressed JSON), so a changed scorer re-scores without new requests. No audio is fetched.

Score of a candidate, in [0, 1]:
    0.84 * (0.55 * title similarity + 0.45 * artist similarity)
  + 0.08 * closeness of its mean track duration to the Spotify album's mean duration
  + 0.03 * its track count is consistent with the Spotify album's (see Album.count_fits)
  + 0.05 * share of its tracks that have a preview
  - 0.15 for another recording (live, tribute, karaoke...), 0.06 for a bigger edition (deluxe, expanded, box
    set...), 0.03 for a soundtrack, unless its mean duration and track count are those of the Spotify album
    (the "fingerprint").

The score says whether a listing is the album. Among the listings of that album the standard edition is then
preferred (see edition_key); an album left with more than 30 tracks or a deluxe-like title gets `oversized = 1`.
"""
import argparse
import csv
import json
import math
import re
import sqlite3
import statistics
import sys
import threading
import time
import zlib
from collections import Counter
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import pandas as pd
import requests

import common
from rmr_pipeline.artists import clean_artist
from rmr_pipeline.slugs import make_slugs
from textnorm import (artist_names, artist_sim, ascii_fold, core_title, edition_marker, first_billed, has_non_latin,
                      is_various, main_title, norm, strip_edition, title_sim)

OVERRIDES = common.REPO / "data-pipeline" / "overrides.json"
AMBIGUOUS_CSV = common.RESULTS / "match_ambiguous.csv"
FAILURES_CSV = common.RESULTS / "match_failures.csv"
COVERAGE_JSON = common.RESULTS / "coverage_match.json"

T_MIN, A_MIN = 0.6, 0.55  # a candidate below either similarity is never chosen
FLOOR, GREY = 0.72, 0.88  # below FLOOR: unmatched; below GREY: matched but ambiguous
CLOSE = 0.03  # a runner-up this close that is another release makes the match ambiguous
STRONG_TEXT = 0.93  # stop trying looser queries once a candidate reads this well
PENALTY = {"": 0.0, "soundtrack": 0.03, "bigger": 0.06, "other": 0.15}  # by edition marker
OVERSIZED = 30  # more tracks than this is not a standard edition
FETCH_MAX = 6  # tracklists fetched per source when the match is oversized, to find the standard edition
EXTRA_TRACK = re.compile(r"\b(?:demo|live|remix|take|rehearsal|outtake|alternate|bonus|rough mix|session|"
                         r"instrumental|early version|single version|b-side|radio edit)\b", re.IGNORECASE)
RESCUE, RESCUE_TRACKS = 6, 5  # tracklists fetched to recognise an album by its durations; fewest tracks trusted
SPOTIFY_PAGE = 50  # the Spotify features averaged at most the first page of an album's tracks

SCHEMA = """
CREATE TABLE IF NOT EXISTS albums(row INTEGER PRIMARY KEY, uri TEXT, title TEXT, artist TEXT, status TEXT,
    ambiguous INTEGER, override INTEGER, source TEXT, source_album_id TEXT, source_title TEXT, source_artist TEXT,
    score REAL, n_tracks INTEGER, n_previews INTEGER, candidates TEXT, updated_at TEXT, oversized INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS tracks(row INTEGER, track_idx INTEGER, source TEXT, track_id TEXT, title TEXT,
    duration_s REAL, disk INTEGER, position INTEGER, preview_url TEXT, PRIMARY KEY(row, track_idx));
CREATE TABLE IF NOT EXISTS http_cache(url TEXT PRIMARY KEY, body BLOB, fetched_at TEXT);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Album:
    """One catalog album and what the feature table knows about its Spotify release."""
    row: int
    uri: str
    title: str
    artist: str  # cleaned credit, manual artist corrections applied
    mean_s: float  # mean track duration of the Spotify album
    means: tuple[float, float, float]  # Spotify means of key, mode and time signature: integers averaged over tracks
    override: bool  # the table's URI is another album, so the Spotify numbers above are not this album's

    def count_fits(self, n: int) -> bool:
        """Could the Spotify album have n tracks? Then n times each mean of integers is an integer."""
        n = min(n, SPOTIFY_PAGE)
        return not self.override and n > 0 and all(abs(m * n - round(m * n)) < 2e-3 for m in self.means)


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

    def brief(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if k != "tracks"}
        return {k: round(v, 4) if isinstance(v, float) else v for k, v in d.items()}


class Throttle:
    """Spaces request starts at least `interval` seconds apart across threads."""

    def __init__(self, interval: float, backoff: float):
        self.interval, self.backoff = interval, backoff
        self._next, self._lock = 0.0, threading.Lock()

    def wait(self) -> None:
        with self._lock:
            start = max(time.monotonic(), self._next)
            self._next = start + self.interval
        time.sleep(max(0.0, start - time.monotonic()))


DEEZER = Throttle(0.2, backoff=5)  # documented limit: 50 requests / 5 s; in practice quota errors start near 4 / s
ITUNES = Throttle(3.2, backoff=60)  # limit: about 20 requests / min


class Http:
    """GET JSON through the sqlite response cache. Only successful responses are cached."""

    def __init__(self, db: sqlite3.Connection):
        self.db, self.lock, self.local, self.fetched = db, threading.Lock(), threading.local(), 0

    @staticmethod
    def url(base: str, **params: object) -> str:
        return requests.Request("GET", base, params=params).prepare().url

    def cached(self, url: str) -> dict | None:
        with self.lock:
            hit = self.db.execute("SELECT body FROM http_cache WHERE url = ?", (url,)).fetchone()
        return json.loads(zlib.decompress(hit[0])) if hit else None

    def get(self, url: str, throttle: Throttle) -> dict:
        if (data := self.cached(url)) is not None:
            return data
        if not hasattr(self.local, "session"):
            self.local.session = requests.Session()
        for attempt in range(8):
            throttle.wait()
            try:
                r = self.local.session.get(url, timeout=30)
                if r.status_code in (403, 429) or r.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {r.status_code}")
                data = r.json()
                if isinstance(data, dict) and (data.get("error") or {}).get("code") == 4:  # Deezer quota, sent as 200
                    raise requests.HTTPError("Deezer quota")
            except (requests.RequestException, ValueError) as e:
                pause = throttle.backoff * (attempt + 1)
                print(f"  retry {attempt + 1} in {pause:.0f}s ({e}): {url[:110]}", file=sys.stderr)
                time.sleep(pause)
                continue
            with self.lock:
                self.db.execute("INSERT OR REPLACE INTO http_cache VALUES (?, ?, ?)",
                                (url, zlib.compress(json.dumps(data, separators=(",", ":")).encode()), now()))
                self.db.commit()
                self.fetched += 1
            return data
        raise RuntimeError(f"giving up on {url}")


def load_catalog() -> list[Album]:
    """The 4,081 albums with cleaned artists, Spotify means from the un-normalised table and the override flag."""
    df = common.load_albums()
    raw = pd.read_pickle(common.TABLE_RAW).reset_index(drop=True).iloc[df["row"].to_numpy()]
    if list(raw["URI"]) != list(df["URI"]):
        raise ValueError("all_data.pkl and all_data_norm.pkl are not in the same row order")
    titles = [str(t) for t in df["Title"]]
    artists = [clean_artist(a) for a in df["Artist"].astype(str)]
    slugs = make_slugs(titles, artists)  # overrides.json is keyed by the slugs of the uncorrected artists
    fixes = {slugs.index(slug): e for slug, e in json.loads(OVERRIDES.read_text(encoding="utf-8")).items()}
    return [Album(int(r.row), str(r.URI), titles[i], fixes.get(i, {}).get("a", artists[i]),
                  float(q.duration_ms) / 1000, (float(q.key), float(q.mode), float(q.time_signature)),
                  "s" in fixes.get(i, {}))
            for i, (r, q) in enumerate(zip(df.itertuples(), raw.itertuples()))]


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
    """The full score, once the candidate's tracks are known. An override's Spotify numbers are another
    album's, so its candidates get a neutral edition term and no duration gap."""
    durations = [t["duration_s"] for t in c.tracks[:SPOTIFY_PAGE] if t["duration_s"]]
    c.n_tracks, c.n_previews = len(c.tracks), sum(bool(t["preview_url"]) for t in c.tracks)
    c.count_fit = al.count_fits(c.n_tracks)
    if durations and not al.override:
        c.dur_off = abs(statistics.fmean(durations) - al.mean_s) / al.mean_s
    edition = 0.055 if al.override else (
        0.08 * (math.exp(-c.dur_off / 0.05) if c.dur_off is not None else 0.0) + 0.03 * c.count_fit)
    c.score = 0.84 * c.text - c.penalty + edition + 0.05 * (c.n_previews / c.n_tracks if c.n_tracks else 0.0)


def deezer_artist_albums(http: Http, al: Album, artist_id: str, artist: str) -> list[Cand]:
    """Every album Deezer lists for the artist, without track counts. Search misses some albums and sometimes
    returns the deluxe edition only."""
    url = Http.url(f"https://api.deezer.com/artist/{artist_id}/albums", limit=100)
    return [scored(al, "deezer", d["id"], d["title"], artist, 0, artist_id) for d in http.get(url, DEEZER).get("data", [])]


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
        data = http.get(Http.url("https://api.deezer.com/search/album", q=q, limit=50 if q in whole else 25), DEEZER)
        batch = [scored(al, "deezer", d["id"], d["title"], d["artist"]["name"], d.get("nb_tracks", 0), d["artist"]["id"])
                 for d in data.get("data", [])]
        artists.update((c.artist_id, c.artist) for c in batch if c.a >= 0.95)
        yield batch
    if artists:
        yield deezer_artist_albums(http, al, *artists.most_common(1)[0][0])


def deezer_tracks(http: Http, album_id: str) -> list[dict]:
    """The album's tracks in album order, with the full track's duration and the (expiring) preview URL."""
    url, out = Http.url(f"https://api.deezer.com/album/{album_id}/tracks", limit=200), []
    while url:
        data = http.get(url, DEEZER)
        out += [{"track_id": str(t["id"]), "title": t["title"], "duration_s": float(t.get("duration") or 0),
                 "disk": t.get("disk_number"), "position": t.get("track_position"), "preview_url": t.get("preview") or None}
                for t in data.get("data", [])]
        url = data.get("next")
    return sorted(out, key=lambda t: (t["disk"] or 1, t["position"] or 0))  # stable: album order


def itunes_urls(al: Album) -> list[str]:
    """The album's iTunes searches. The first one being in the cache marks the fallback as already tried."""
    terms = [t if is_various(al.artist) else f"{a} {t}" for a, t in text_pairs(al)[:2]] + title_only(al)
    return [Http.url("https://itunes.apple.com/search", term=q, entity="album", limit=25) for q in dict.fromkeys(terms)]


def itunes_search(http: Http, al: Album) -> Iterator[list[Cand]]:
    """Candidates per iTunes search."""
    for url in itunes_urls(al):
        data = http.get(url, ITUNES)
        yield [scored(al, "itunes", d["collectionId"], d["collectionName"], d["artistName"], d.get("trackCount", 0))
               for d in data.get("results", []) if d.get("collectionType") in ("Album", "Compilation")]


def itunes_tracks(http: Http, album_id: str) -> list[dict]:
    """The album's songs in album order, in the shape deezer_tracks returns."""
    data = http.get(Http.url("https://itunes.apple.com/lookup", id=album_id, entity="song", limit=200), ITUNES)
    songs = [t for t in data.get("results", []) if t.get("wrapperType") == "track" and t.get("kind") == "song"]
    songs.sort(key=lambda t: (t.get("discNumber") or 1, t.get("trackNumber") or 0))
    return [{"track_id": str(t["trackId"]), "title": t.get("trackName", ""),
             "duration_s": (t.get("trackTimeMillis") or 0) / 1000, "disk": t.get("discNumber"),
             "position": t.get("trackNumber"), "preview_url": t.get("previewUrl") or None} for t in songs]


@dataclass(frozen=True)
class Source:
    """How to search a store and list an album's tracks."""
    search: Callable[[Http, Album], Iterator[list[Cand]]]
    tracks: Callable[[Http, str], list[dict]]
    shortlist: int  # how many candidates get their tracks fetched


SOURCES = {"deezer": Source(deezer_search, deezer_tracks, 4), "itunes": Source(itunes_search, itunes_tracks, 3)}


def fetch(http: Http, al: Album, cands: list[Cand]) -> list[Cand]:
    """The candidates with their tracks fetched and their full score; listings without tracks are dropped."""
    for c in cands:
        c.tracks = SOURCES[c.source].tracks(http, c.id)
        finalise(c, al)
    return [c for c in cands if c.tracks]


def candidates(http: Http, al: Album, source: str) -> list[Cand]:
    """The source's shortlisted candidates, tracks fetched, best first."""
    src, pool = SOURCES[source], {}
    for batch in src.search(http, al):
        for c in batch:
            pool.setdefault(c.id, c)
        if any(c.text >= STRONG_TEXT and not c.penalty for c in pool.values()):
            break
    short = sorted((c for c in pool.values() if c.t >= T_MIN and c.a >= A_MIN), key=lambda c: -c.score)
    short = fetch(http, al, [c for c in short if c.score >= short[0].score - 0.15][:src.shortlist])
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
    """Is iTunes worth asking, given the Deezer candidates?"""
    best, ambiguous, _ = judge(cands)
    return best is None or ambiguous or best.n_previews < best.n_tracks / 2 or best.n_tracks > OVERSIZED


def process(http: Http, al: Album, itunes: bool) -> list[Cand]:
    """Deezer candidates, plus iTunes ones when Deezer has no match, an ambiguous one, one with previews for
    fewer than half of its tracks or one with more than OVERSIZED tracks."""
    cands = candidates(http, al, "deezer")
    if itunes and needs_fallback(cands):
        cands += candidates(http, al, "itunes")
    return cands


def notes(best: Cand, cands: list[Cand]) -> dict:
    """Extra keys of the chosen candidate in `candidates`: `spotify_twin`, the other edition whose durations are
    the Spotify album's (the Spotify features were computed on that edition, not on the chosen one), and for an
    oversized multi-disc release `discs` and `disc1_tracks`, plus, when its title marks a bigger edition,
    `disc1_original`: disc 1 has the size of an album and next to no demo, live or bonus tracks, so it looks
    like the original album."""
    out: dict = {}
    twin = next((c for c in cands if c is not best and c.fingerprint and c.same_release(best)), None)
    if twin and not best.fingerprint:
        out["spotify_twin"] = {"source": twin.source, "id": twin.id, "title": twin.title, "n_tracks": twin.n_tracks}
    discs = sorted({t["disk"] or 1 for t in best.tracks})
    if best.oversized and len(discs) > 1:
        first = [t for t in best.tracks if (t["disk"] or 1) == discs[0]]
        out |= {"discs": len(discs), "disc1_tracks": len(first)}
        if best.marker == "bigger":
            extras = sum(bool(EXTRA_TRACK.search(t["title"])) for t in first) / len(first)
            out["disc1_original"] = 3 <= len(first) <= OVERSIZED and extras < 0.2
    return out


def save(db: sqlite3.Connection, al: Album, cands: list[Cand]) -> None:
    """Write the album's verdict and, when matched, the chosen listing's tracks in album order."""
    best, ambiguous, _ = judge(cands)
    top = sorted(cands, key=lambda c: (c is not best, -c.score))[:5]
    briefs = [c.brief() | (notes(c, cands) if c is best else {}) for c in top]
    db.execute("DELETE FROM tracks WHERE row = ?", (al.row,))
    db.execute(
        "INSERT OR REPLACE INTO albums(row, uri, title, artist, status, ambiguous, override, source, source_album_id, "
        "source_title, source_artist, score, n_tracks, n_previews, candidates, updated_at, oversized) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
            al.row, al.uri, al.title, al.artist, "matched" if best else "unmatched", int(ambiguous), int(al.override),
            *((best.source, best.id, best.title, best.artist, round(best.score, 4), best.n_tracks, best.n_previews)
              if best else (None, None, None, None, None, 0, 0)),
            json.dumps(briefs, ensure_ascii=False), now(), int(bool(best and best.oversized))))
    db.executemany("INSERT INTO tracks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        (al.row, i, best.source, t["track_id"], t["title"], t["duration_s"], t["disk"], t["position"], t["preview_url"])
        for i, t in enumerate(best.tracks)] if best else [])
    db.commit()


def run(db: sqlite3.Connection, albums: list[Album], itunes: bool, workers: int) -> None:
    """Match `albums` on Deezer in parallel (re-using an iTunes fallback already in the cache), then send every
    cached album that still needs the fallback through iTunes, one request every 3.2 s."""
    http, t0 = Http(db), time.time()

    def tried(al: Album) -> bool:  # the fallback's first request is in the cache
        return http.cached(itunes_urls(al)[0]) is not None

    def one(al: Album, with_itunes: bool) -> None:
        try:
            cands = process(http, al, with_itunes)
        except Exception as e:  # the album stays pending and is picked up by the next run
            print(f"row {al.row} failed: {e!r}", file=sys.stderr)
            return
        with http.lock:
            save(db, al, cands)

    with ThreadPoolExecutor(workers) as pool:
        for i, _ in enumerate(pool.map(lambda al: one(al, itunes and tried(al)), albums), 1):
            if i % 200 == 0 or i == len(albums):
                print(f"deezer {i}/{len(albums)}  {http.fetched} requests  {time.time() - t0:.0f}s", flush=True)
    if not itunes:
        return
    by_row = {al.row: al for al in load_catalog()}
    todo = [by_row[r] for r, in db.execute(
        "SELECT row FROM albums WHERE status = 'unmatched' OR ambiguous = 1 OR n_previews < n_tracks / 2.0 "
        "OR n_tracks > ? ORDER BY row", (OVERSIZED,))]
    todo = [al for al in todo if not tried(al)]
    for i, al in enumerate(todo, 1):
        one(al, True)
        if i % 25 == 0 or i == len(todo):
            print(f"itunes {i}/{len(todo)}  {http.fetched} requests  {time.time() - t0:.0f}s", flush=True)


def write_logs(db: sqlite3.Connection) -> None:
    """results/match_ambiguous.csv and results/match_failures.csv, rebuilt from the cache."""
    head = ["row", "title", "artist", "override", "source", "chosen_id", "chosen_title", "chosen_artist", "score",
            "runner_up_title", "runner_up_artist", "runner_up_score", "reason"]
    out: dict[str, list[list]] = {"ambiguous": [], "unmatched": []}
    for row, title, artist, override, status, ambiguous, blob in db.execute(
            "SELECT row, title, artist, override, status, ambiguous, candidates FROM albums ORDER BY row"):
        if status == "matched" and not ambiguous:
            continue
        cands = [Cand(**{k: v for k, v in c.items() if k in Cand.__dataclass_fields__}) for c in json.loads(blob)]
        best, _, reason = judge(cands)
        rest = [c for c in cands if c is not best]
        first, second = (best, rest[0] if rest else None) if best else (None, cands[0] if cands else None)
        out["unmatched" if status == "unmatched" else "ambiguous"].append([
            row, title, artist, override,
            *((first.source, first.id, first.title, first.artist, f"{first.score:.3f}") if first else [""] * 5),
            *((second.title, second.artist, f"{second.score:.3f}") if second else [""] * 3), reason])
    common.RESULTS.mkdir(exist_ok=True)
    for path, rows in ((AMBIGUOUS_CSV, out["ambiguous"]), (FAILURES_CSV, out["unmatched"])):
        with path.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows([head, *rows])


def coverage(db: sqlite3.Connection, total: int) -> dict:
    """Coverage of the catalog by the match cache; printed and written to results/coverage_match.json."""
    one = lambda sql: db.execute(sql).fetchone()[0]  # noqa: E731
    per_album = [n for n, in db.execute("SELECT n_tracks FROM albums WHERE status = 'matched'")]
    tracks, previews = one("SELECT COUNT(*) FROM tracks"), one("SELECT COUNT(*) FROM tracks WHERE preview_url <> ''")
    with_preview = one("SELECT COUNT(*) FROM albums WHERE n_previews > 0")
    q = statistics.quantiles(per_album, n=4) if len(per_album) > 1 else [0, 0, 0]
    bins = Counter("1-5" if n <= 5 else "6-10" if n <= 10 else "11-15" if n <= 15 else "16-25" if n <= 25 else "26+"
                   for n in per_album)
    report = {
        "albums_total": total,
        "albums_processed": one("SELECT COUNT(*) FROM albums"),
        "matched": len(per_album),
        "matched_by_source": dict(db.execute(
            "SELECT source, COUNT(*) FROM albums WHERE status = 'matched' GROUP BY source")),
        "ambiguous": one("SELECT COUNT(*) FROM albums WHERE status = 'matched' AND ambiguous = 1"),
        "unmatched": one("SELECT COUNT(*) FROM albums WHERE status = 'unmatched'"),
        "oversized": one("SELECT COUNT(*) FROM albums WHERE oversized = 1"),
        "albums_over_30_tracks": sum(n > OVERSIZED for n in per_album),
        "override_rows_matched": one("SELECT COUNT(*) FROM albums WHERE override = 1 AND status = 'matched'"),
        "albums_with_preview": with_preview,
        "pct_albums_with_preview": round(100 * with_preview / total, 2),
        "matched_without_any_preview": one("SELECT COUNT(*) FROM albums WHERE status = 'matched' AND n_previews = 0"),
        # the listing reads right but its mean track duration is over 10% off Spotify's: the table's URI is suspect
        "matched_duration_mismatch": one(
            "SELECT COUNT(*) FROM albums WHERE status = 'matched' AND override = 0 "
            "AND json_extract(candidates, '$[0].dur_off') > 0.1 AND json_extract(candidates, '$[0].spotify_twin') IS NULL"),
        # the Spotify features were computed on another (bigger) edition than the chosen one: candidates[0].spotify_twin
        "matched_other_edition_than_spotify": one(
            "SELECT COUNT(*) FROM albums WHERE json_extract(candidates, '$[0].spotify_twin') IS NOT NULL"),
        "tracks_total": tracks,
        "tracks_with_preview": previews,
        "pct_tracks_with_preview": round(100 * previews / tracks, 2) if tracks else 0.0,
        "tracks_per_album": {"min": min(per_album, default=0), "q1": q[0], "median": q[1], "q3": q[2],
                             "max": max(per_album, default=0),
                             "mean": round(statistics.fmean(per_album), 2) if per_album else 0.0,
                             "histogram": {k: bins.get(k, 0) for k in ("1-5", "6-10", "11-15", "16-25", "26+")}},
    }
    common.RESULTS.mkdir(exist_ok=True)
    COVERAGE_JSON.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return report


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: match (or re-score) the selected albums, then rewrite the logs and the coverage report."""
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--rows", help="Comma-separated table rows to (re)process.")
    p.add_argument("--limit", type=int, help="Process at most N albums.")
    p.add_argument("--rescore", action="store_true", help="Re-score finished albums from the cached responses.")
    p.add_argument("--retry-unmatched", action="store_true", help="Run the unmatched albums again.")
    p.add_argument("--no-itunes", action="store_true", help="Skip the (slow) iTunes fallback.")
    p.add_argument("--workers", type=int, default=6, help="Parallel Deezer workers (the rate limit is global).")
    p.add_argument("--report", action="store_true", help="Only print coverage and rewrite the results files.")
    args = p.parse_args(argv)

    common.CACHE.mkdir(exist_ok=True)
    db = sqlite3.connect(common.MATCH_DB, timeout=60, check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")  # extract.py reads while this writes
    db.executescript(SCHEMA)
    if "oversized" not in {col[1] for col in db.execute("PRAGMA table_info(albums)")}:
        db.execute("ALTER TABLE albums ADD COLUMN oversized INTEGER DEFAULT 0")
    catalog = load_catalog()
    if not args.report:
        status = dict(db.execute("SELECT row, status FROM albums"))
        if args.rows:
            rows = {int(r) for r in args.rows.split(",")}
            todo = [al for al in catalog if al.row in rows]
        elif args.rescore:
            todo = [al for al in catalog if al.row in status]
        else:
            todo = [al for al in catalog if al.row not in status or (args.retry_unmatched and status[al.row] == "unmatched")]
        todo = todo[:args.limit]
        print(f"{len(todo)} albums to process ({len(status)} of {len(catalog)} in the cache)")
        run(db, todo, not args.no_itunes, args.workers)
    write_logs(db)
    coverage(db, len(catalog))
    return 0


if __name__ == "__main__":
    sys.exit(main())
