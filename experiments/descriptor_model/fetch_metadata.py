"""Fetch crowd tags / genres for every album row from official open APIs (never RateYourMusic, no scraping).

Sub-commands (all resumable: every HTTP response is cached in cache/http_<source>.sqlite, so a rerun
replays finished work from disk and only calls the API for what is missing):

  musicbrainz    release-group search -> validated match -> album genres/tags + primary-artist genres/tags
                 -> cache/musicbrainz.parquet                      (no key; hard 1 request / second)
  lastfm         album.getTopTags + artist.getTopTags -> cache/lastfm.parquet        (needs LASTFM_API_KEY)
  discogs        master (fallback release) search -> genres + styles -> cache/discogs.parquet
                                                                                     (needs DISCOGS_TOKEN)
  deezer-genres  genres + release date for the Deezer album ids in cache/matches.parquet
                 -> cache/deezer_meta.parquet                      (no key; <= 50 requests / 5 s)

Rows are matched on their own Artist + Title (not on the Spotify URI: some URIs are shared by different
albums). Canonical row = position in pd.read_pickle(all_data_norm.pkl).reset_index(drop=True).

  .venv-meta/bin/python fetch_metadata.py musicbrainz --limit 30 --spread --out cache/musicbrainz_pilot.parquet
  nohup caffeinate -i .venv-meta/bin/python -u fetch_metadata.py musicbrainz --shuffle > cache/musicbrainz.log 2>&1 &
  .venv-meta/bin/python fetch_metadata.py deezer-genres

Precision over recall: a candidate is accepted only if BOTH the artist and the title pass a normalised
fuzzy match; the best scores are stored either way so rejects can be audited.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
from pathlib import Path

import pandas as pd
import requests
from rapidfuzz import fuzz

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "data-retrieval" / "Recommender" / "data" / "all_data_norm.pkl"
CACHE = HERE / "cache"
USER_AGENT = "recmyrecord-descriptor-experiment/0.1 (https://recmyrecord.com)"

TITLE_MIN = 88.0         # normalised title similarity needed to accept a candidate
ARTIST_MIN = 85.0        # normalised artist similarity (whole credit)
MEMBER_MIN = 92.0        # one of our individual artist names vs one credited artist ...
MEMBER_TITLE_MIN = 95.0  # ... which then needs a near-exact title
VARIANT_PENALTY = 3.0    # title matched only after dropping a parenthetical / bracket on either side
VARIOUS_ARTISTS_MBID = "89ad4ac3-39f7-470e-963a-56509c546377"


class FetchError(RuntimeError):
    """The API could not be reached after all retries (nothing is cached; a rerun retries)."""


# ---------------------------------------------------------------- text

def norm_text(s: str) -> str:
    """Casefolded, accent-stripped, punctuation-free; '&' -> 'and'; leading 'the' dropped."""
    raw = str(s)
    t = unicodedata.normalize("NFKD", raw)
    t = "".join(c for c in t if not unicodedata.combining(c)).casefold()
    t = t.replace("&", " and ")
    t = " ".join(re.sub(r"[^\w\s]", " ", t).replace("_", " ").split())
    if t.startswith("the ") and len(t) > 4:
        t = t[4:]
    return t or raw.strip().casefold()  # titles made only of punctuation ("( )", "•") keep their raw form


_GROUP = re.compile(r"\([^()]*\)|\[[^\[\]]*\]")
_GLUE = re.compile(
    r"(?<=[a-zà-ÿ0-9\)\]'’])(?=[A-ZÀ-ÞЀ-ЯЁ])"     # '...WailersBob...', "...'70Fela..."
    r"|(?<=[a-z]\.)(?=[A-Z])"                       # '...Newborn Jr.Paul...' but not 'R.E.M.'
    r"|(?<=[A-Za-z\.\)\]])(?=[^\x00-\u024f\u1e00-\u1eff\s])"     # Latin display credit followed by a native-script name
)
_PARTICLE = re.compile(r"(?:^|[\s\.\-])(?:Mc|Mac|De|Di|Du|La|Le|Van|O'|D')$")
_SEPS = re.compile(r"\s*(?:,|&|/|\+|\band\b|\bwith\b|\bfeaturing\b|\bfeat\.?|\bplus\b|\bx\b|\be\b)\s*", re.IGNORECASE)


def _dedupe(xs: list[str]) -> list[str]:
    seen, out = set(), []
    for x in xs:
        x = " ".join(str(x).split())
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def title_variants(title: str) -> tuple[str, list[str]]:
    """(full title, alternative forms): parentheticals dropped, and each parenthetical on its own
    (the table writes transliterations as '呼吸 (Kokyuu)' and nicknames as 'The Beatles [White Album]')."""
    title = str(title)
    alts = [_GROUP.sub(" ", title)] + [g[1:-1] for g in _GROUP.findall(title)]
    return title, [a for a in _dedupe(alts) if a != title and len(norm_text(a)) >= 2]


def artist_variants(artist: str) -> tuple[str, list[str], list[str]]:
    """(display credit, whole-credit alternatives, individual member names).

    The table's Artist is the RYM display credit, sometimes with the individual artist names glued on
    without a separator ('Bob Marley & The WailersBob MarleyThe Wailers') and with transliterations in
    brackets ('Кино [Kino]'). The glue split is heuristic ('McCartney' splits too), which is harmless:
    the pieces are only ever *extra* names to validate against, and pieces under 4 characters are dropped.
    """
    artist = str(artist)
    segs: list[str] = []
    for piece in (x for x in _GLUE.split(artist) if x and x.strip()):
        # re-join camel-case surnames the splitter cut: 'John Mc' + 'Laughlin', 'Jack De' + 'Johnette'
        if segs and _PARTICLE.search(segs[-1]) and not piece[0].isspace():
            segs[-1] += piece
        else:
            segs.append(piece)
    segs = [x.strip() for x in segs]
    # Glued = a collaboration credit (it contains a separator) followed by >= 2 individual names, which
    # themselves never contain '/' or ','. This keeps 'SpongeBob SquarePants', 'R.E.M.' and
    # 'Isengrind / TwinSisterMoon / Natural Snow Buildings' whole.
    glued = (len(segs) >= 3 and len(_SEPS.split(segs[0])) > 1 and len(norm_text(segs[0])) >= 4
             and all(len(norm_text(x)) >= 2 and not re.search(r"[/,]", x) for x in segs[1:]))
    display = segs[0] if glued else artist
    wholes = [display, artist, _GROUP.sub(" ", display)] + [g[1:-1] for g in _GROUP.findall(display)]
    members: list[str] = []
    pool = (segs[1:] if glued else []) + _SEPS.split(display)
    for p in pool:
        members += [p, _GROUP.sub(" ", p)] + [g[1:-1] for g in _GROUP.findall(p)]
    wholes = _dedupe(wholes)
    members = [m for m in _dedupe(members) if len(norm_text(m)) >= 4 and m not in wholes]
    return display, [w for w in wholes if len(norm_text(w)) >= 2 and norm_text(w) != "the" or w == display], members


def _sim(a: str, b: str) -> float:
    a, b = norm_text(a), norm_text(b)
    if not a or not b:
        return 0.0
    return float(max(fuzz.ratio(a, b), fuzz.token_sort_ratio(a, b)))


def title_score(ours: str, theirs: str) -> float:
    full, alts = title_variants(ours)
    tfull, talts = title_variants(theirs)
    best = _sim(full, tfull)
    for a in [full] + alts:
        for b in [tfull] + talts:
            if a is full and b is tfull:
                continue
            best = max(best, _sim(a, b) - VARIANT_PENALTY)
    return best


def artist_score(ours: str, their_wholes: list[str], their_members: list[str]) -> tuple[float, float]:
    """(whole-credit similarity, best single-member similarity)."""
    _, wholes, members = artist_variants(ours)
    theirs_all = _dedupe(their_wholes + their_members)
    whole = max((_sim(a, b) for a in wholes for b in theirs_all), default=0.0)
    member = max((_sim(a, b) for a in members for b in their_members), default=0.0)
    return whole, member


def accept(t: float, a_whole: float, a_member: float) -> str:
    """'' if rejected, else how the artist matched."""
    if t >= TITLE_MIN and a_whole >= ARTIST_MIN:
        return "credit"
    if t >= MEMBER_TITLE_MIN and a_member >= MEMBER_MIN:
        return "member"
    return ""


def lucene_phrase(s: str) -> str:
    return '"' + re.sub(r'(["\\])', r"\\\1", str(s)) + '"'


def lucene_terms(s: str) -> str:
    toks = [t for t in re.sub(r"[^\w\s]", " ", str(s)).split() if t.upper() not in ("AND", "OR", "NOT")]
    return " ".join(toks)


# ---------------------------------------------------------------- http + cache

class Client:
    """Rate-limited GET with a persistent response cache and back-off on 429 / 5xx / network errors."""

    def __init__(self, source: str, min_interval: float, headers: dict | None = None, max_tries: int = 7):
        CACHE.mkdir(exist_ok=True)
        self.source, self.min_interval, self.max_tries = source, min_interval, max_tries
        self.db = sqlite3.connect(CACHE / f"http_{source}.sqlite", timeout=60)
        self.db.execute("CREATE TABLE IF NOT EXISTS resp (key TEXT PRIMARY KEY, status INTEGER, body TEXT, ts REAL)")
        self.db.commit()
        self.http = requests.Session()
        self.http.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        self.http.headers.update(headers or {})
        self._last = 0.0
        self.n_calls = self.n_cached = self.n_retries = 0

    def _wait(self) -> None:
        gap = self._last + self.min_interval - time.monotonic()
        if gap > 0:
            time.sleep(gap)
        self._last = time.monotonic()

    def get(self, url: str, params: dict | None = None, secret: dict | None = None,
            transient=None) -> tuple[int, dict]:
        """(status, json). `secret` params are sent but never written to the cache key.
        `transient(status, json) -> bool` marks an in-band "try again" answer (Last.fm / Deezer quota)."""
        params = dict(params or {})
        key = url + "?" + "&".join(f"{k}={params[k]}" for k in sorted(params))
        hit = self.db.execute("SELECT status, body FROM resp WHERE key = ?", (key,)).fetchone()
        if hit is not None:
            self.n_cached += 1
            return int(hit[0]), json.loads(hit[1])
        err = "?"
        for attempt in range(self.max_tries):
            self._wait()
            delay = min(120.0, 5.0 * 2 ** attempt)
            try:
                r = self.http.get(url, params={**params, **(secret or {})}, timeout=30)
            except requests.RequestException as e:
                err = type(e).__name__
            else:
                self.n_calls += 1
                try:
                    body = r.json()
                except ValueError:
                    body = None
                retry = r.status_code in (429, 500, 502, 503, 504) or body is None
                if not retry and transient is not None and transient(r.status_code, body):
                    retry = True
                if not retry:
                    self.db.execute("INSERT OR REPLACE INTO resp VALUES (?, ?, ?, ?)",
                                    (key, r.status_code, json.dumps(body), time.time()))
                    self.db.commit()
                    return r.status_code, body
                err = f"HTTP {r.status_code}"
                ra = r.headers.get("Retry-After", "")
                if ra.isdigit():
                    delay = max(delay, float(ra) + 1.0)
            self.n_retries += 1
            print(f"  ! {self.source}: {err}, backing off {delay:.0f}s (attempt {attempt + 1}/{self.max_tries})",
                  flush=True)
            time.sleep(delay)
        raise FetchError(f"{self.source}: gave up on {key} ({err})")


# ---------------------------------------------------------------- shared driver

def load_albums() -> pd.DataFrame:
    df = pd.read_pickle(DATA).reset_index(drop=True)
    out = df[["URI", "Artist", "Title"]].astype(str).copy()
    out.insert(0, "row", range(len(out)))
    return out


def select_rows(albums: pd.DataFrame, args) -> pd.DataFrame:
    if args.shuffle:  # fixed random order: a partial run is then a fair sample of the whole catalogue
        albums = albums.sample(frac=1.0, random_state=0)
    if args.rows:
        want = [int(x) for x in args.rows.split(",")]
        return albums[albums.row.isin(want)]
    if args.limit:
        if args.spread:  # evenly spaced over the catalogue-rank order, so obscure albums are sampled too
            step = len(albums) / args.limit
            return albums.iloc[[int(i * step + step / 2) for i in range(args.limit)]]
        return albums.head(args.limit)
    return albums


def write_parquet(records: list[dict], out: Path, int_cols: tuple[str, ...] = ()) -> pd.DataFrame:
    df = pd.DataFrame(records).drop(columns=["_from_cache"], errors="ignore").sort_values("row").reset_index(drop=True)
    df["row"] = df["row"].astype("int32")
    for c in int_cols:
        df[c] = df[c].astype("Int32")
    tmp = out.with_suffix(".tmp.parquet")
    df.to_parquet(tmp, index=False)
    os.replace(tmp, out)
    return df


def run(name: str, client: Client, todo: pd.DataFrame, fetch_one, out: Path, int_cols=(), every: int = 100,
        summary=None) -> pd.DataFrame:
    """Row loop: cached rows replay instantly; a failed row is recorded with status 'error' and retried on
    the next run; 8 failures in a row abort (the API is down or we are blocked - do not hammer it)."""
    print(f"{name}: {len(todo)} rows -> {out}", flush=True)
    t0, recs, streak = time.time(), [], 0
    for i, r in enumerate(todo.itertuples(index=False), 1):
        base = {"row": int(r.row), "URI": r.URI, "Artist": r.Artist, "Title": r.Title}
        try:
            rec = fetch_one(client, r)
            streak = 0
        except FetchError as e:
            print(f"  ! row {r.row} ({r.Artist} — {r.Title}): {e}", flush=True)
            rec = {"status": "error"}
            streak += 1
        recs.append({**base, **rec})
        if streak >= 8:
            write_parquet(recs, out, int_cols)
            print(f"ABORTED after {streak} consecutive failures at row {r.row}; rerun the same command to resume.",
                  flush=True)
            sys.exit(2)
        if i % every == 0 or i == len(todo):
            df = write_parquet(recs, out, int_cols)
            el = time.time() - t0
            rate = client.n_calls / el if el else 0.0
            per_row = client.n_calls / max(1, i - _replayed(recs))
            eta = (len(todo) - i) * per_row / rate if rate else 0.0
            extra = summary(df) if summary else ""
            print(f"  {name} {i}/{len(todo)}  {el / 60:6.1f} min  calls {client.n_calls} (cached {client.n_cached}, "
                  f"retries {client.n_retries})  eta ~{eta / 60:.0f} min  {extra}", flush=True)
    n_err = sum(1 for x in recs if x.get("status") == "error")
    print(f"DONE {name}: {len(recs)} rows written to {out}, {n_err} errors"
          + ("  (rerun to retry the errors)" if n_err else ""), flush=True)
    return df


def _replayed(recs: list[dict]) -> int:
    return sum(1 for x in recs if x.get("_from_cache"))


def _tags(items: list | None, key: str = "count") -> str:
    """[{name, count}] -> JSON {name: count}, positive counts only, highest first."""
    d: dict[str, int] = {}
    for it in items or []:
        n, c = str(it.get("name", "")).strip(), it.get(key, 0)
        try:
            c = int(c)
        except (TypeError, ValueError):
            c = 0
        if n and c > 0:
            d[n] = max(c, d.get(n, 0))
    return json.dumps(dict(sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))), ensure_ascii=False)


# ---------------------------------------------------------------- MusicBrainz

MB = "https://musicbrainz.org/ws/2"
_TYPE_RANK = {"Album": 3, "EP": 2, "": 1, "Other": 1, "Broadcast": 1, "Single": 0}


def _mb_names(rg: dict) -> tuple[list[str], list[str]]:
    credits = rg.get("artist-credit") or []
    joined = "".join(str(c.get("name", "")) + str(c.get("joinphrase", "")) for c in credits)
    members: list[str] = []
    for c in credits:
        a = c.get("artist") or {}
        members += [c.get("name", ""), a.get("name", ""), a.get("sort-name", "")]
        members += [al.get("name", "") for al in a.get("aliases") or []]
    members = _dedupe(members)
    wholes = [joined] + (members if len(credits) == 1 else [])
    return _dedupe(wholes), members


def _mb_best(r, cands: list[dict]) -> tuple[dict | None, dict]:
    best, best_key, audit = None, None, {"title_score": 0.0, "artist_score": 0.0}
    for rg in cands:
        wholes, members = _mb_names(rg)
        t = title_score(r.Title, rg.get("title", ""))
        aw, am = artist_score(r.Artist, wholes, members)
        how = accept(t, aw, am)
        a = aw if how != "member" else am
        if t + max(aw, am) > audit["title_score"] + audit["artist_score"]:
            audit = {"title_score": t, "artist_score": max(aw, am)}
        if not how:
            continue
        # an Album outranks a same-named Single even when the album's title only matches after dropping
        # a parenthetical ("Utopia" the single vs "Utopia (Original Television Soundtrack)")
        rank = _TYPE_RANK.get(rg.get("primary-type") or "", 1)
        key = (t + a + 2.0 * rank, how == "credit", -len(rg.get("secondary-types") or []),
               rg.get("score", 0), rg.get("count", 0))
        if best_key is None or key > best_key:
            best, best_key = {**rg, "_t": t, "_a": a, "_how": how}, key
    return best, audit


def mb_one(c: Client, r) -> dict:
    before = c.n_calls
    display, _, members = artist_variants(r.Artist)
    full, alts = title_variants(r.Title)
    queries = [f"artist:{lucene_phrase(display)} AND releasegroup:{lucene_phrase(full)}"]
    loose_t = lucene_terms(alts[0] if alts else full)
    loose_a = lucene_terms(members[0] if members and len(_SEPS.split(display)) > 1 else display)
    if loose_t and loose_a:
        queries.append(f"releasegroup:({loose_t}) AND artist:({loose_a})")
    rec = {"status": "no_match", "matched": False, "mbid": None, "mb_title": None, "mb_artist": None,
           "artist_mbid": None, "match_how": None, "query_n": None, "title_score": 0.0, "artist_score": 0.0,
           "mb_search_score": None, "primary_type": None, "secondary_types": "[]", "first_release_date": None,
           "year": None, "album_genres": "{}", "album_tags": "{}", "artist_genres": "{}", "artist_tags": "{}"}
    best = None
    for qn, q in enumerate(queries, 1):
        _, j = c.get(f"{MB}/release-group", {"query": q, "fmt": "json", "limit": 25})
        best, audit = _mb_best(r, j.get("release-groups") or [])
        if audit["title_score"] + audit["artist_score"] > rec["title_score"] + rec["artist_score"]:
            rec.update(audit)
        if best:
            rec["query_n"] = qn
            break
    if best:
        credits = best.get("artist-credit") or []
        primary = (credits[0].get("artist") or {}) if credits else {}
        rec.update({
            "status": "ok", "matched": True, "mbid": best["id"], "mb_title": best.get("title"),
            "mb_artist": "".join(str(x.get("name", "")) + str(x.get("joinphrase", "")) for x in credits),
            "artist_mbid": primary.get("id"), "match_how": best["_how"], "title_score": best["_t"],
            "artist_score": best["_a"], "mb_search_score": best.get("score"),
        })
        st, rg = c.get(f"{MB}/release-group/{best['id']}", {"inc": "genres+tags", "fmt": "json"})
        if st == 200:
            date = rg.get("first-release-date") or best.get("first-release-date") or ""
            rec.update({
                "primary_type": rg.get("primary-type"),
                "secondary_types": json.dumps(rg.get("secondary-types") or []),
                "first_release_date": date or None,
                "year": int(date[:4]) if re.match(r"\d{4}", date) else None,
                "album_genres": _tags(rg.get("genres")), "album_tags": _tags(rg.get("tags")),
            })
        if rec["artist_mbid"] and rec["artist_mbid"] != VARIOUS_ARTISTS_MBID:
            st, ar = c.get(f"{MB}/artist/{rec['artist_mbid']}", {"inc": "genres+tags", "fmt": "json"})
            if st == 200:
                rec.update({"artist_genres": _tags(ar.get("genres")), "artist_tags": _tags(ar.get("tags"))})
    for k in ("album_genres", "album_tags", "artist_genres", "artist_tags"):
        rec["n_" + k] = len(json.loads(rec[k]))
    rec["_from_cache"] = c.n_calls == before
    return rec


def mb_summary(df: pd.DataFrame) -> str:
    m = df.matched.fillna(False).astype(bool)
    return (f"matched {m.mean():.1%}  album tags {(df.n_album_tags.fillna(0) > 0).mean():.1%}  "
            f"artist tags {(df.n_artist_tags.fillna(0) > 0).mean():.1%}")


def cmd_musicbrainz(args) -> None:
    client = Client("musicbrainz", min_interval=1.1)
    out = Path(args.out) if args.out else CACHE / "musicbrainz.parquet"
    run("musicbrainz", client, select_rows(load_albums(), args), mb_one, out, int_cols=("year",),
             summary=mb_summary)


# ---------------------------------------------------------------- Last.fm

LFM = "https://ws.audioscrobbler.com/2.0/"


def _lfm_transient(status: int, body: dict) -> bool:
    return isinstance(body, dict) and body.get("error") in (8, 11, 16, 29)  # backend down / rate limit


def _lfm_tags(body: dict) -> list[dict]:
    t = (body.get("toptags") or {}).get("tag") or []
    return [t] if isinstance(t, dict) else t


def lfm_one(c: Client, r, key: str) -> dict:
    before = c.n_calls
    display, wholes, members = artist_variants(r.Artist)
    full, alts = title_variants(r.Title)
    rec = {"status": "ok", "album_found": False, "artist_found": False, "lastfm_artist": None,
           "lastfm_album": None, "album_tags": "{}", "artist_tags": "{}"}
    # Last.fm resolves artist+album by name itself (autocorrect); a 'not found' is error 6. We only try
    # names that come from the row, so there is no fuzzy candidate to validate.
    names = _dedupe(wholes + (members if len(_SEPS.split(display)) > 1 else []))[:4]
    for a in names:
        for t in _dedupe([full] + alts[:1]):
            _, j = c.get(LFM, {"method": "album.gettoptags", "artist": a, "album": t, "autocorrect": 1,
                               "format": "json"}, secret={"api_key": key}, transient=_lfm_transient)
            if "error" not in j:
                attr = (j.get("toptags") or {}).get("@attr") or {}
                rec.update({"album_found": True, "lastfm_artist": attr.get("artist", a),
                            "lastfm_album": attr.get("album", t), "album_tags": _tags(_lfm_tags(j))})
                break
        if rec["album_found"]:
            break
    for a in _dedupe(([rec["lastfm_artist"]] if rec["lastfm_artist"] else []) + names):
        _, j = c.get(LFM, {"method": "artist.gettoptags", "artist": a, "autocorrect": 1, "format": "json"},
                     secret={"api_key": key}, transient=_lfm_transient)
        if "error" not in j:
            rec.update({"artist_found": True, "artist_tags": _tags(_lfm_tags(j))})
            rec["lastfm_artist"] = rec["lastfm_artist"] or ((j.get("toptags") or {}).get("@attr") or {}).get("artist", a)
            break
    for k in ("album_tags", "artist_tags"):
        rec["n_" + k] = len(json.loads(rec[k]))
    rec["_from_cache"] = c.n_calls == before
    return rec


def cmd_lastfm(args) -> None:
    key = os.environ.get("LASTFM_API_KEY")
    if not key:
        sys.exit("lastfm: LASTFM_API_KEY is not set in the environment - nothing fetched.")
    client = Client("lastfm", min_interval=0.25)
    out = Path(args.out) if args.out else CACHE / "lastfm.parquet"
    run("lastfm", client, select_rows(load_albums(), args), lambda c, r: lfm_one(c, r, key), out,
             summary=lambda d: f"album tags {(d.n_album_tags.fillna(0) > 0).mean():.1%}  "
                               f"artist tags {(d.n_artist_tags.fillna(0) > 0).mean():.1%}")


# ---------------------------------------------------------------- Discogs

DISCOGS = "https://api.discogs.com/database/search"


def discogs_one(c: Client, r) -> dict:
    before = c.n_calls
    display, _, _ = artist_variants(r.Artist)
    full, alts = title_variants(r.Title)
    rec = {"status": "no_match", "matched": False, "discogs_id": None, "discogs_type": None,
           "discogs_title": None, "title_score": 0.0, "artist_score": 0.0, "year": None,
           "genres": "[]", "styles": "[]"}
    for kind in ("master", "release"):
        _, j = c.get(DISCOGS, {"type": kind, "artist": display, "release_title": alts[0] if alts else full,
                               "per_page": 25})
        best, best_key = None, None
        for res in j.get("results") or []:
            # search results are titled "Artist - Title"; Discogs disambiguates artists as "Name (2)"
            a, _, t = str(res.get("title", "")).partition(" - ")
            a = re.sub(r"\s*\(\d+\)", "", a).replace("*", "")
            ts = title_score(r.Title, t)
            aw, am = artist_score(r.Artist, [a], [x for x in _SEPS.split(a) if x])
            how = accept(ts, aw, am)
            if ts + max(aw, am) > rec["title_score"] + rec["artist_score"] and not rec["matched"]:
                rec.update({"title_score": ts, "artist_score": max(aw, am)})
            key = (ts + (aw if how == "credit" else am), (res.get("community") or {}).get("have", 0))
            if how and (best_key is None or key > best_key):
                best, best_key = {**res, "_t": ts, "_a": aw if how == "credit" else am}, key
        if best:
            y = str(best.get("year") or "")
            rec.update({"status": "ok", "matched": True, "discogs_id": str(best.get("id")), "discogs_type": kind,
                        "discogs_title": best.get("title"), "title_score": best["_t"], "artist_score": best["_a"],
                        "year": int(y) if y.isdigit() and int(y) > 0 else None,
                        "genres": json.dumps(best.get("genre") or [], ensure_ascii=False),
                        "styles": json.dumps(best.get("style") or [], ensure_ascii=False)})
            break
    rec["_from_cache"] = c.n_calls == before
    return rec


def cmd_discogs(args) -> None:
    token = os.environ.get("DISCOGS_TOKEN")
    if not token:
        sys.exit("discogs: DISCOGS_TOKEN is not set in the environment - nothing fetched "
                 "(Discogs search requires authentication).")
    client = Client("discogs", min_interval=1.05, headers={"Authorization": f"Discogs token={token}"})
    out = Path(args.out) if args.out else CACHE / "discogs.parquet"
    run("discogs", client, select_rows(load_albums(), args), discogs_one, out, int_cols=("year",),
             summary=lambda d: f"matched {d.matched.fillna(False).astype(bool).mean():.1%}")


# ---------------------------------------------------------------- Deezer genres

DEEZER = "https://api.deezer.com/album"


def _deezer_transient(status: int, body: dict) -> bool:
    e = body.get("error") if isinstance(body, dict) else None
    return isinstance(e, dict) and e.get("code") in (4, 700)  # quota / service busy


def deezer_one(c: Client, r) -> dict:
    before = c.n_calls
    rec = {"status": "no_id", "deezer_album_id": None, "found": False, "genres": "[]", "genre_ids": "[]",
           "release_date": None, "year": None, "record_type": None, "label": None}
    if r.deezer_album_id:
        rec["deezer_album_id"] = str(r.deezer_album_id)
        _, j = c.get(f"{DEEZER}/{r.deezer_album_id}", transient=_deezer_transient)
        if "error" in j:
            rec["status"] = "not_found"
        else:
            g = (j.get("genres") or {}).get("data") or []
            date = str(j.get("release_date") or "")
            rec.update({"status": "ok", "found": True,
                        "genres": json.dumps([x.get("name") for x in g if x.get("name")], ensure_ascii=False),
                        "genre_ids": json.dumps([x.get("id") for x in g]),
                        "release_date": date or None,
                        "year": int(date[:4]) if re.match(r"[12]\d{3}", date) else None,
                        "record_type": j.get("record_type"), "label": j.get("label")})
    rec["_from_cache"] = c.n_calls == before
    return rec


def cmd_deezer(args) -> None:
    mpath = Path(args.matches) if args.matches else CACHE / "matches.parquet"
    if not mpath.exists():
        sys.exit(f"deezer-genres: {mpath} does not exist yet (match_previews.py writes it) - nothing fetched.")
    if mpath.suffix == ".jsonl":  # the matcher's checkpoint while it is still running (last decision per row wins)
        m = pd.read_json(mpath, lines=True, dtype={"source_album_id": str}).drop_duplicates("row", keep="last")
    else:
        m = pd.read_parquet(mpath)
    ids = {int(row): str(i) for row, src, i in zip(m["row"], m["source"], m["source_album_id"])
           if src == "deezer" and pd.notna(i) and str(i).strip()}
    albums = select_rows(load_albums(), args).copy()
    albums = albums[albums.row.isin(set(int(x) for x in m["row"]))]  # only rows the matcher has decided
    albums["deezer_album_id"] = [ids.get(int(x), "") for x in albums.row]
    # default 0.15 s = 6.7 req/s, under Deezer's 50 requests / 5 s. The quota is per IP: if match_previews.py
    # is running at the same time, pass a larger --interval (or wait for it to finish).
    client = Client("deezer", min_interval=args.interval)
    out = Path(args.out) if args.out else CACHE / "deezer_meta.parquet"
    run("deezer-genres", client, albums, deezer_one, out, int_cols=("year",),
             summary=lambda d: f"found {d.found.fillna(False).astype(bool).mean():.1%}")


# ---------------------------------------------------------------- cli

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("musicbrainz", cmd_musicbrainz), ("lastfm", cmd_lastfm), ("discogs", cmd_discogs),
                     ("deezer-genres", cmd_deezer)):
        p = sub.add_parser(name)
        p.add_argument("--limit", type=int, default=0, help="only the first N rows (pilot)")
        p.add_argument("--spread", action="store_true", help="with --limit: N rows evenly spaced over the table")
        p.add_argument("--rows", default="", help="comma-separated row numbers")
        p.add_argument("--shuffle", action="store_true",
                       help="process rows in a fixed random order (the table is in popularity-rank order)")
        p.add_argument("--out", default="", help="output parquet (default cache/<source>.parquet)")
        if name == "deezer-genres":
            p.add_argument("--matches", default="", help="matches parquet (default cache/matches.parquet)")
            p.add_argument("--interval", type=float, default=0.15, help="seconds between requests")
        p.set_defaults(fn=fn)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
