"""Match every album row to a Deezer (fallback: iTunes) album that has 30 s previews.

Output: cache/matches.parquet, one row per row of all_data_norm.pkl (canonical
index = position after reset_index(drop=True)).

Matching is by the row's own Artist + Title, NOT by its Spotify URI: several
URIs in the table are shared by *different* albums (a wrong Spotify match
upstream), so sharing audio by URI would poison labels. Rows that really are the
same album end up with the same (source, source_album_id) and the extractor
de-duplicates on that.

Precision first: both artist and title must pass a normalised fuzzy match, with
guards for numerals ("II" vs "III"), very short names, and live / tribute /
karaoke releases. Doubtful candidates are rejected (source = "none").

Resumable: every decided row is appended to cache/matches_checkpoint.jsonl.

Columns: row, URI, Artist, Title, source (deezer | itunes | none), source_album_id, matched_artist,
matched_title, title_sim, artist_sim, score (0-100), track_count, n_previews, match_flags, query.
match_flags (comma separated) mark the weaker kinds of accepted match, so they can be filtered:
  edition           deluxe / expanded / anniversary edition (extractor then uses disc 1 only)
  live_added        store title has a bare "(Live)" tag the RYM title lacks (normally a live album)
  soundtrack_added  store title has a soundtrack tag the RYM title lacks
  composer_prefix   store title is "Composer: <RYM title>"
  artist_part       only one of several credited artists matched
  artist_subset     "Bill Evans Trio" vs "Bill Evans" (title had to match exactly)

  .venv-audio/bin/python match_previews.py                # everything
  .venv-audio/bin/python match_previews.py --limit 40     # pilot (first 40 rows)
  .venv-audio/bin/python match_previews.py --retry-none   # re-try unmatched rows
"""
from __future__ import annotations

import argparse
import json
import random
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd
import requests
from rapidfuzz import fuzz
from unidecode import unidecode

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "data-retrieval" / "Recommender" / "data" / "all_data_norm.pkl"
CACHE = HERE / "cache"
CHECKPOINT = CACHE / "matches_checkpoint.jsonl"
OUT = CACHE / "matches.parquet"

TITLE_MIN = 90.0
ARTIST_MIN = 88.0
LIVE_PENALTY = 6.0

UA = {"User-Agent": "recmyrecord-descriptor-experiment/0.1 (research; preview matching)"}

# --------------------------------------------------------------------------
# normalisation + similarity
# --------------------------------------------------------------------------
EDITION_RE = re.compile(
    r"remaster|deluxe|edition|version|expanded|anniversary|bonus|re-?issue|\bmono\b|\bstereo\b|"
    r"legacy|special|collector|explicit|\bclean\b|original|soundtrack|\bost\b|digital|"
    r"international|\bimport\b|\buk\b|\bus\b|japan|super|extended|complete|restored|"
    r"\b(19|20)\d\d\b|\bmix\b|\bbonus\b|\bep\b|\blp\b|\balbum\b|score",
    re.I,
)
HEAVY_EDITION_RE = re.compile(
    r"deluxe|expanded|anniversary|bonus|legacy|collector|special|super|complete|extended", re.I
)
PAREN_RE = re.compile(r"\s*[\(\[]([^\(\)\[\]]*)[\)\]]")
DASH_SUFFIX_RE = re.compile(r"\s+[-–—]\s+([^-–—]*)$")
TRAIL_RE = re.compile(
    r"\s+((\d+(st|nd|rd|th)\s+anniversary|deluxe|expanded|special|collector'?s|legacy|remastered|super deluxe)"
    r"(\s+(edition|version))?|\d{4}\s+remaster(ed)?|remaster(ed)?\s+\d{4})\s*$",
    re.I,
)
# "(Live in Brussels)", "(Live at the Paradiso, 1987)": a specific concert. If the RYM title does not
# say "live", this may be a concert recording of a studio album, so it is rejected (precision first).
# A bare "(Live)" / "(Live / Remastered)" tag is how Deezer labels albums that are themselves live albums.
LIVE_SPECIFIC_RE = re.compile(r"[\(\[][^\)\]]*\blive\s+(in|at|from|on|aus|au|en|a)\b[^\)\]]*[\)\]]", re.I)
LIVE_PAREN_RE = re.compile(r"\s*[\(\[]\s*live[^\)\]]*[\)\]]", re.I)
# words that mean "a different recording" when only the candidate has them
REJECT_TOKENS = {
    "karaoke", "tribute", "instrumental", "instrumentals", "remixes", "remixed", "remix",
    "demos", "demo", "commentary", "lullaby", "8bit", "cover", "covers", "rehearsal",
    "rehearsals", "outtakes", "interview", "acoustic", "unplugged", "sessions", "session",
    "reimagined", "revisited", "rerecorded", "symphonic", "orchestral", "piano", "sampler",
}
# "(Original Motion Picture Soundtrack)" is normally just how stores label a score, but for a band's
# studio album it can be the film's soundtrack instead (The Who - Quadrophenia), so a plain release wins.
SOUNDTRACK_RE = re.compile(r"soundtrack|\bost\b|motion picture|\bscore\b|from the (film|series|movie)", re.I)
ROMAN = {"ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"}
STOP = {"the", "and"}
ABBREV = {"vol": "volume", "pt": "part"}
ARTIST_SPLIT_RE = re.compile(r"\s*/\s*|\s*;\s*|\s+&\s+|\s*,\s+|\s+and\s+|\s+with\s+|\s+feat\.?\s+|\s+featuring\s+|\s+x\s+", re.I)


def has_non_ascii(s: str) -> bool:
    return any(ord(ch) > 127 for ch in s)


def norm(s: str) -> str:
    """casefold, transliterate, drop punctuation, drop 'the'/'and'."""
    s = unicodedata.normalize("NFKC", s).casefold().replace("&", " and ")
    s = unidecode(s).casefold()
    s = re.sub(r"['’`´]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    toks = [ABBREV.get(t, t) for t in s.split() if t not in STOP]
    return " ".join(toks)


def norm_native(s: str) -> str:
    """Same idea without transliteration (for comparing non-Latin strings directly)."""
    s = unicodedata.normalize("NFKC", s).casefold()
    s = "".join(ch if unicodedata.category(ch)[0] in "LN" else " " for ch in s)
    return " ".join(s.split())


def strip_editions(title: str) -> tuple[str, bool]:
    """Remove '(Remastered 2011)', '[Deluxe Edition]', ' - 2009 Remaster' etc.
    Returns (stripped title, heavy) where heavy = a deluxe/expanded/bonus style edition."""
    heavy = False
    out = title
    for _ in range(4):
        changed = False
        for m in list(PAREN_RE.finditer(out)):
            inner = m.group(1)
            if EDITION_RE.search(inner) and not re.search(r"\blive\b", inner, re.I):
                heavy = heavy or bool(HEAVY_EDITION_RE.search(inner))
                out = out.replace(m.group(0), " ", 1)
                changed = True
        m = DASH_SUFFIX_RE.search(out)
        if m and EDITION_RE.search(m.group(1)) and len(out[: m.start()].strip()) >= 1:
            heavy = heavy or bool(HEAVY_EDITION_RE.search(m.group(1)))
            out = out[: m.start()]
            changed = True
        m = TRAIL_RE.search(out)
        if m and out[: m.start()].strip():
            heavy = heavy or bool(HEAVY_EDITION_RE.search(m.group(0)))
            out = out[: m.start()]
            changed = True
        if not changed:
            break
    out = out.strip()
    return (out if out else title), heavy


GENERIC_WORK_TOKENS = {
    "symphony", "symphonie", "sinfonie", "symphonies", "concerto", "concertos", "string", "quartet", "quartets",
    "trio", "trios", "piano", "violin", "cello", "sonata", "sonatas", "complete", "works", "orchestral", "for",
    "op", "opus", "number", "no", "nr", "volume", "part",
}


def generic_work_title(title: str) -> bool:
    """'Symphony No. 9', 'String Quartets', 'The Complete Works': says nothing about whose work it is."""
    toks = norm(title).split()
    return bool(toks) and all(t in GENERIC_WORK_TOKENS or t.isdigit() for t in toks)


def compact(s: str) -> str:
    return re.sub(r"[\s\"'“”‘’`!?.,:;()\[\]-]+", "", unidecode(unicodedata.normalize("NFKC", s)).casefold())


def numeric_tokens(n: str) -> list[str]:
    return sorted(t for t in n.split() if t.isdigit() or t in ROMAN)


def _sim(a: str, b: str) -> float:
    """Similarity of two normalised strings, with short-string and numeral guards."""
    if not a or not b:
        return 0.0
    if a == b:
        return 100.0
    if a.replace(" ", "") == b.replace(" ", ""):
        return 99.0
    if min(len(a), len(b)) <= 4:
        return 0.0
    if numeric_tokens(a) != numeric_tokens(b):
        # allow digits glued differently ("98 12 28" vs "981228") only via the no-space check above
        return 0.0
    return max(
        fuzz.ratio(a, b),
        fuzz.token_sort_ratio(a, b),
        fuzz.ratio(a.replace(" ", ""), b.replace(" ", "")) - 1.0,
    )


def title_variants_query(title: str) -> list[str]:
    """Raw-string variants of an RYM title. RYM writes non-Latin titles as
    'native (romanised)'; for those, each side is a variant too."""
    base, _ = strip_editions(title)
    vs = [base, title]
    if has_non_ascii(title):
        for m in PAREN_RE.finditer(title):
            if m.group(1).strip():
                vs.append(m.group(1).strip())
        outer = PAREN_RE.sub(" ", title).strip()
        if outer:
            vs.append(outer)
    return list(dict.fromkeys(v for v in vs if v.strip()))


def title_variants_candidate(title: str) -> list[tuple[str, bool, bool]]:
    """(variant, heavy_edition, composer_prefix_removed) for a store title."""
    base, heavy = strip_editions(title)
    vs = [(base, heavy, False)]
    nolive = LIVE_PAREN_RE.sub(" ", base).strip()
    if nolive and nolive != base:
        vs.append((nolive, heavy, False))
    # "Elgar: Cello Concerto & Sea Pictures" -> composer prefix
    for v, h, _ in list(vs):
        if ":" in v:
            pre, post = v.split(":", 1)
            if 1 <= len(pre.split()) <= 3 and post.strip():
                vs.append((post.strip(), h, True))
    return vs


def title_similarity(q_title: str, c_title: str) -> tuple[float, dict]:
    """Best similarity over variants; returns (score, flags). 0 if a guard rejects."""
    q_norm_full = norm(q_title)
    c_norm_full = norm(c_title)
    q_tokens = set(q_norm_full.split())
    c_tokens = set(c_norm_full.split())
    if (c_tokens & REJECT_TOKENS) - q_tokens:
        return 0.0, {"reject": "different-recording token"}
    live_added = ("live" in c_tokens) and ("live" not in q_tokens)
    if live_added and LIVE_SPECIFIC_RE.search(c_title):
        return 0.0, {"reject": "specific live recording"}

    best, flags = 0.0, {}
    for qv in title_variants_query(q_title):
        qn, qnn = norm(qv), norm_native(qv)
        for cv, heavy, composer in title_variants_candidate(c_title):
            cn, cnn = norm(cv), norm_native(cv)
            s = _sim(qn, cn) if (qn and cn) else 0.0
            if has_non_ascii(qv) and has_non_ascii(cv):
                s = max(s, _sim(qnn, cnn))
            if not qn and not cn:  # titles made only of symbols, e.g. "( )"
                s = 100.0 if qv.strip().casefold() == cv.strip().casefold() else 0.0
            elif min(len(qn), len(cn)) <= 4 and compact(qv) != compact(cv):
                s = 0.0  # very short titles must match character for character ("0" is not "0%")
            if s > best:
                best = s
                flags = {"edition": heavy, "live_added": live_added, "composer_prefix": composer,
                         "soundtrack_added": bool(SOUNDTRACK_RE.search(c_title)) and not SOUNDTRACK_RE.search(q_title)}
    return best, flags


def artist_parts(artist: str) -> tuple[list[str], list[str]]:
    """(full variants, sub-part variants). 'native [romanised]' -> both are full variants."""
    fulls = [artist]
    m = re.match(r"^(.*?)\s*\[(.+?)\]\s*$", artist)
    if m:
        fulls += [m.group(1).strip(), m.group(2).strip()]
    parts: list[str] = []
    for f in fulls:
        ps = [p.strip() for p in ARTIST_SPLIT_RE.split(f) if p and p.strip()]
        if len(ps) > 1:
            parts += ps
    fulls = list(dict.fromkeys(f for f in fulls if f))
    parts = [p for p in dict.fromkeys(parts) if p not in fulls]
    return fulls, parts


def artist_similarity(q_artist: str, c_artist: str) -> tuple[float, bool]:
    """Returns (score, via_part). Part matches (one credited artist of several) are
    scaled by 0.97 so they sort below full matches."""
    qf, qp = artist_parts(q_artist)
    cf, cp = artist_parts(c_artist)
    if norm(c_artist) in {"various artists", "various", "multi interpretes", "varios artistas"} and norm(
        q_artist
    ) not in {"various artists", "various"}:
        return 0.0, False
    best, via_part = 0.0, False
    for a in qf:
        for b in cf:
            s = _sim(norm(a), norm(b))
            if has_non_ascii(a) and has_non_ascii(b):
                s = max(s, _sim(norm_native(a), norm_native(b)))
            best = max(best, s)
    for a, a_is_part in [(x, False) for x in qf] + [(x, True) for x in qp]:
        for b, b_is_part in [(x, False) for x in cf] + [(x, True) for x in cp]:
            if not (a_is_part or b_is_part):
                continue
            na, nb = norm(a), norm(b)
            if min(len(na), len(nb)) < 4:
                continue
            s = _sim(na, nb)
            if s >= 92 and s * 0.97 > best:
                best, via_part = s * 0.97, True
    return best, via_part


def artist_token_subset(q_artist: str, c_artist: str) -> bool:
    """'Hendrix' vs 'Jimi Hendrix' — only used when the title matches exactly."""
    a, b = set(norm(q_artist).split()), set(norm(c_artist).split())
    if not a or not b:
        return False
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    if re.search(r"['’]s\s", c_artist) and len(b) > len(a):
        return False  # "Claudio Simonetti's Goblin" is not Goblin, "Kelly Simonz's Blind Faith" is not Blind Faith
    return small < big and sum(len(t) for t in small) >= 6


def score_candidate(q_artist: str, q_title: str, c_artist: str, c_title: str) -> dict | None:
    t, flags = title_similarity(q_title, c_title)
    if t < TITLE_MIN:
        return None
    a, via_part = artist_similarity(q_artist, c_artist)
    subset = False
    if a < ARTIST_MIN and t == 100.0 and len(norm(q_title)) >= 8 and artist_token_subset(q_artist, c_artist):
        a, subset = ARTIST_MIN, True
    if a < ARTIST_MIN:
        return None
    if flags.get("composer_prefix"):
        # "Elgar: Cello Concerto & Sea Pictures" is fine; these are not:
        if subset or generic_work_title(q_title):
            return None  # "Symphony No. 9" / "String Quartets" + any composer: cannot tell whose work it is
        if norm(q_title) in {norm(x) for x in artist_parts(q_artist)[0]} or norm(q_artist) in {"various artists", "various"}:
            return None  # self-titled album vs "Soul Legends: The Stylistics", "Off The Charts: Singles"
    score = (t + a) / 2.0 - (LIVE_PENALTY if flags.get("live_added") else 0.0) - (3.0 if flags.get("soundtrack_added") else 0.0)
    fl = [k for k, v in (("edition", flags.get("edition")), ("live_added", flags.get("live_added")),
                         ("soundtrack_added", flags.get("soundtrack_added")), ("composer_prefix", flags.get("composer_prefix")),
                         ("artist_part", via_part), ("artist_subset", subset)) if v]
    return {"title_sim": round(t, 1), "artist_sim": round(a, 1), "score": round(score, 1), "flags": ",".join(fl)}


# --------------------------------------------------------------------------
# HTTP with rate limits
# --------------------------------------------------------------------------
class RateLimiter:
    """Minimum interval between calls, shared across threads."""

    def __init__(self, min_interval: float):
        self.min_interval = min_interval
        self.lock = threading.Lock()
        self.next_t = 0.0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            t = max(now, self.next_t)
            self.next_t = t + self.min_interval
        if t > now:
            time.sleep(t - now)

    def penalise(self, seconds: float):
        with self.lock:
            self.next_t = max(self.next_t, time.monotonic() + seconds)


DEEZER_RL = RateLimiter(0.125)  # 40 requests / 5 s (limit is 50 / 5 s)
ITUNES_RL = RateLimiter(3.2)  # ~19 requests / min (limit is roughly 20 / min)
_session = threading.local()


def session() -> requests.Session:
    if not hasattr(_session, "s"):
        _session.s = requests.Session()
        _session.s.headers.update(UA)
    return _session.s


def deezer_get(path: str, params: dict | None = None, tries: int = 6) -> dict:
    err = None
    for i in range(tries):
        DEEZER_RL.wait()
        try:
            r = session().get(f"https://api.deezer.com/{path}", params=params, timeout=25)
            j = r.json()
        except Exception as e:  # network / JSON error
            err = e
            time.sleep(1.5 * (i + 1))
            continue
        e = j.get("error") if isinstance(j, dict) else None
        if e:
            if e.get("code") == 4:  # quota exceeded
                DEEZER_RL.penalise(5.5)
                err = RuntimeError("deezer quota")
                continue
            if e.get("code") in (800, 300):  # no data / not found
                return {}
            err = RuntimeError(f"deezer error {e}")
            time.sleep(1.0)
            continue
        return j
    raise RuntimeError(f"deezer GET {path} failed: {err}")


def itunes_get(endpoint: str, params: dict, tries: int = 4) -> dict:
    err = None
    for i in range(tries):
        ITUNES_RL.wait()
        try:
            r = session().get(f"https://itunes.apple.com/{endpoint}", params=params, timeout=30)
        except Exception as e:
            err = e
            time.sleep(3 * (i + 1))
            continue
        if r.status_code in (403, 429) or r.status_code >= 500:
            err = RuntimeError(f"itunes HTTP {r.status_code}")
            ITUNES_RL.penalise(60)
            continue
        try:
            return r.json()
        except Exception as e:
            err = e
    raise RuntimeError(f"itunes GET {endpoint} failed: {err}")


# --------------------------------------------------------------------------
# per-source matching
# --------------------------------------------------------------------------
def _q(s: str) -> str:
    return s.replace('"', " ").strip()


def search_strings(artist: str, title: str) -> list[tuple[str, str]]:
    """(artist, title) pairs to search with, most specific first."""
    a_full, a_parts = artist_parts(artist)
    artists = list(a_full[1:] + a_full[:1]) if len(a_full) > 1 else list(a_full)  # split forms first
    if a_parts:
        artists = a_parts[:1] + artists
    titles = title_variants_query(title)
    if has_non_ascii(title) and len(titles) > 2:
        titles = titles[2:] + titles[:2]  # romanised / native parts before the combined string
    pairs = [(a, t) for t in titles[:3] for a in artists[:3]]
    return list(dict.fromkeys(pairs))


def match_deezer(artist: str, title: str) -> dict | None:
    pairs = search_strings(artist, title)
    queries = [f'artist:"{_q(a)}" album:"{_q(t)}"' for a, t in pairs[:3]]
    queries += [f"{_q(a)} {_q(t)}" for a, t in pairs[:2]]
    queries += [f'album:"{_q(pairs[0][1])}"']
    seen, rejected_ids = set(), set()
    state = {"fallback": None}  # best deluxe / soundtrack-tagged release; kept while we look for a plain one

    def doubt(sc):  # 0 = plain release, 1 = deluxe/expanded edition, 2 = soundtrack tag the RYM title lacks
        return 2 if "soundtrack_added" in sc["flags"] else (1 if "edition" in sc["flags"] else 0)

    def consider(albums: list[tuple[dict, str]], label: str) -> dict | None:
        """albums = (deezer album object, artist name). Returns a plain match, or None (maybe updating the fallback)."""
        cands = []
        for c, c_artist in albums:
            if c["id"] in seen:
                continue
            seen.add(c["id"])
            sc = score_candidate(artist, title, c_artist, c.get("title", ""))
            if sc:
                cands.append((c, c_artist, sc))
        # plain releases first, then best score, then proper albums
        cands.sort(key=lambda x: (doubt(x[2]), -x[2]["score"], x[0].get("record_type") != "album",
                                  x[0].get("nb_tracks", 0) if doubt(x[2]) else 0))
        for c, c_artist, sc in cands[:4]:
            fb = state["fallback"]
            if c["id"] in rejected_ids or (fb and doubt(sc) >= doubt(fb)):
                continue
            tr = deezer_get(f"album/{c['id']}/tracks", {"limit": 200})
            tracks = tr.get("data", []) or []
            n_prev = sum(1 for t in tracks if t.get("preview"))
            if n_prev == 0:
                rejected_ids.add(c["id"])
                continue
            res = {"source": "deezer", "source_album_id": str(c["id"]), "matched_artist": c_artist,
                   "matched_title": c["title"], "track_count": len(tracks), "n_previews": n_prev, "query": label, **sc}
            if doubt(sc) == 0:
                return res
            state["fallback"] = res
            break
        return None

    for q in dict.fromkeys(queries):
        j = deezer_get("search/album", {"q": q, "limit": 25})
        res = consider([(c, c.get("artist", {}).get("name", "")) for c in j.get("data", []) or []], q)
        if res:
            return res

    # Deezer's album search misses albums that are in the catalogue (e.g. Elliott Smith - From a Basement on
    # the Hill), so as a last step find the artist and scan their discography.
    a_full, a_parts = artist_parts(artist)
    tried = set()
    for name in list(dict.fromkeys(a_full[1:] + a_full[:1] + a_parts[:1]))[:3]:
        j = deezer_get("search/artist", {"q": _q(name), "limit": 5})
        for art in (j.get("data", []) or [])[:5]:
            if art["id"] in tried:
                continue
            tried.add(art["id"])
            a_sim, _ = artist_similarity(artist, art.get("name", ""))
            if a_sim < ARTIST_MIN and not artist_token_subset(artist, art.get("name", "")):
                continue
            al = deezer_get(f"artist/{art['id']}/albums", {"limit": 300})
            res = consider([(c, art["name"]) for c in al.get("data", []) or []], f"artist/{art['id']}/albums")
            if res:
                return res
    return state["fallback"]


def match_itunes(artist: str, title: str) -> dict | None:
    pairs = search_strings(artist, title)
    seen = set()
    for a, t in pairs[:2]:
        j = itunes_get("search", {"term": f"{_q(a)} {_q(t)}", "entity": "album", "media": "music", "limit": 25})
        cands = []
        for c in j.get("results", []) or []:
            cid = c.get("collectionId")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            sc = score_candidate(artist, title, c.get("artistName", ""), c.get("collectionName", ""))
            if sc:
                cands.append((c, sc))
        cands.sort(key=lambda x: ("soundtrack_added" in x[1]["flags"], "edition" in x[1]["flags"], -x[1]["score"]))
        for c, sc in cands[:2]:
            lk = itunes_get("lookup", {"id": c["collectionId"], "entity": "song", "limit": 200})
            songs = [s for s in lk.get("results", []) if s.get("wrapperType") == "track" and s.get("kind") == "song"]
            n_prev = sum(1 for s in songs if s.get("previewUrl"))
            if n_prev == 0:
                continue
            return {
                "source": "itunes",
                "source_album_id": str(c["collectionId"]),
                "matched_artist": c.get("artistName", ""),
                "matched_title": c.get("collectionName", ""),
                "track_count": len(songs),
                "n_previews": n_prev,
                "query": f"{a} {t}",
                **sc,
            }
    return None


NONE = {"source": "none", "source_album_id": "", "matched_artist": "", "matched_title": "", "track_count": 0,
        "n_previews": 0, "query": "", "title_sim": 0.0, "artist_sim": 0.0, "score": 0.0, "flags": ""}


# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------
def load_albums() -> pd.DataFrame:
    df = pd.read_pickle(DATA).reset_index(drop=True)
    out = df[["URI", "Artist", "Title"]].copy()
    out.insert(0, "row", range(len(out)))
    return out


def load_checkpoint() -> dict[int, dict]:
    done: dict[int, dict] = {}
    if CHECKPOINT.exists():
        for line in CHECKPOINT.read_text().splitlines():
            try:
                rec = json.loads(line)
                done[int(rec["row"])] = rec
            except Exception:
                pass
    return done


def write_parquet(albums: pd.DataFrame, done: dict[int, dict]) -> pd.DataFrame:
    recs = [done[r] for r in albums.row if r in done]
    m = pd.DataFrame(recs)
    cols = ["row", "URI", "Artist", "Title", "source", "source_album_id", "matched_artist", "matched_title",
            "title_sim", "artist_sim", "score", "track_count", "n_previews", "flags", "query"]
    m = m[cols].sort_values("row").reset_index(drop=True).rename(columns={"flags": "match_flags"})
    m = m.astype({"row": "int32", "track_count": "int32", "n_previews": "int32", "title_sim": "float32",
                  "artist_sim": "float32", "score": "float32", "source_album_id": "string"})
    m.to_parquet(OUT, index=False)
    return m


def audit(m: pd.DataFrame, seed: int = 0):
    acc = m[m.source != "none"]

    def show(d):
        for r in d.itertuples():
            print(f"  [{r.row:4d}] {r.source:6s} t={r.title_sim:5.1f} a={r.artist_sim:5.1f} {r.match_flags or '-':22s} "
                  f"{r.Artist} — {r.Title}   ==>   {r.matched_artist} — {r.matched_title}  ({r.n_previews}/{r.track_count} previews)")

    print(f"\n=== AUDIT: 20 random accepted (seed {seed}) ===")
    show(acc.sample(min(20, len(acc)), random_state=seed))
    print("\n=== AUDIT: 20 lowest-scoring accepted ===")
    show(acc.sort_values("score").head(20))
    print("\n=== 20 random unmatched ===")
    um = m[m.source == "none"]
    for r in um.sample(min(20, len(um)), random_state=seed).itertuples():
        print(f"  [{r.row:4d}] {r.Artist} — {r.Title}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="only the first N rows (pilot)")
    ap.add_argument("--threads", type=int, default=6)
    ap.add_argument("--no-itunes", action="store_true")
    ap.add_argument("--retry-none", action="store_true", help="re-try rows previously left unmatched")
    ap.add_argument("--retry-none-deezer", action="store_true",
                    help="re-try unmatched rows on Deezer only (rows that still fail stay 'none', iTunes is not re-queried)")
    ap.add_argument("--audit-only", action="store_true")
    args = ap.parse_args()

    CACHE.mkdir(exist_ok=True)
    albums = load_albums()
    if args.limit:
        albums = albums.head(args.limit)
    done = load_checkpoint()
    if args.retry_none:
        done = {r: v for r, v in done.items() if v["source"] != "none"}
    if args.audit_only:
        m = write_parquet(albums, done)
        audit(m)
        return

    lock = threading.Lock()
    ck = open(CHECKPOINT, "a")

    def record(row, rec):
        with lock:
            done[row.row] = rec
            ck.write(json.dumps(rec, ensure_ascii=False) + "\n")
            ck.flush()

    def base(row):
        return {"row": int(row.row), "URI": row.URI, "Artist": row.Artist, "Title": row.Title}

    # ---- stage 1: Deezer (threaded) ----
    todo = [r for r in albums.itertuples() if r.row not in done]
    if args.retry_none_deezer:
        todo = [r for r in albums.itertuples() if r.row not in done or done[r.row]["source"] == "none"]
        args.no_itunes = True
    print(f"{len(albums)} rows, {len(albums) - len(todo)} already decided, {len(todo)} to match", flush=True)
    pending_itunes = []
    t0 = time.time()

    def dz(row):
        try:
            return row, match_deezer(row.Artist, row.Title), None
        except Exception as e:
            return row, None, e

    with ThreadPoolExecutor(args.threads) as ex:
        futs = [ex.submit(dz, r) for r in todo]
        for i, f in enumerate(as_completed(futs), 1):
            row, res, err = f.result()
            if err is not None:
                print(f"  ! deezer error row {row.row} ({row.Artist} — {row.Title}): {err}", flush=True)
                continue  # not recorded -> retried next run
            if res:
                record(row, {**base(row), **res})
            else:
                pending_itunes.append(row)
            if i % 200 == 0 or i == len(futs):
                el = time.time() - t0
                print(f"  deezer {i}/{len(futs)}  {el:5.0f}s  eta {el / i * (len(futs) - i):5.0f}s  "
                      f"unmatched so far {len(pending_itunes)}", flush=True)

    # ---- stage 2: iTunes fallback (sequential, ~20 req/min) ----
    pending_itunes.sort(key=lambda r: r.row)
    if args.no_itunes:
        print(f"skipping iTunes for {len(pending_itunes)} rows (left as they were; rerun without --no-itunes)")
    else:
        print(f"iTunes fallback for {len(pending_itunes)} rows (~{len(pending_itunes) * 4 / 60:.0f} min)", flush=True)
        t0 = time.time()
        for i, row in enumerate(pending_itunes, 1):
            try:
                res = match_itunes(row.Artist, row.Title)
            except Exception as e:
                print(f"  ! itunes error row {row.row}: {e}", flush=True)
                continue
            record(row, {**base(row), **(res or NONE)})
            if i % 25 == 0 or i == len(pending_itunes):
                el = time.time() - t0
                print(f"  itunes {i}/{len(pending_itunes)}  {el:5.0f}s  eta {el / i * (len(pending_itunes) - i):5.0f}s",
                      flush=True)
    ck.close()

    m = write_parquet(albums, done)
    n = len(m)
    vc = m.source.value_counts()
    print(f"\nwrote {OUT} ({n} rows; {len(albums) - n} rows undecided because of API errors)")
    for s in ("deezer", "itunes", "none"):
        print(f"  {s:7s} {vc.get(s, 0):5d}  {100 * vc.get(s, 0) / max(n, 1):5.1f}%")
    acc = m[m.source != "none"]
    print(f"  unique source albums: {acc.groupby(['source', 'source_album_id']).ngroups}")
    audit(m)


if __name__ == "__main__":
    random.seed(0)
    main()
