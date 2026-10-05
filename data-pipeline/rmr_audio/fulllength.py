"""Full-length audio for the albums no store has a preview of: the catalog's YouTube link (one video chosen
by the RateYourMusic community), or its Bandcamp album page, fetched with yt-dlp, sampled in 30-second
windows, embedded by both models, and deleted. The audio is never kept.

  cd data-pipeline
  nice -n 19 .venv-audio/bin/python -m rmr_audio.fulllength [--bandcamp] [--sample N --seed S] [--limit N]
        [--keys K,...] [--pause 5] [--format F] [--models effnet,clap[,clap_mp3]] [--no-refetch]
        [--check-baseline] [--fetch-python PY] [--torch-python PY] [--dry-run]

Which albums: the new ones (in catalog/albums.csv, not in audio/keys.csv) whose row in audio/matches.csv has no
preview (n_clips_available empty or 0), and that have a link. YouTube first. Bandcamp only with --bandcamp,
and only for an album without a usable YouTube link: it has none, or its video was recorded here as
unavailable, a mismatch or a single track.

Per album, one at a time:

  1. Metadata only (yt-dlp -J, nothing downloaded): title, duration, uploader. From those alone the link is
     classified (classify): nobody listens to it.
       full_album    long enough (15 minutes, or 60% of the album's runtime when one is known; 8 minutes
                     when the title says "full album") and the title or the uploader resembles the album
                     or its artist
       single_track  shorter, and resembles them: one track of the album. Recorded, not embedded.
       mismatch      resembles neither, or is over six hours
       unavailable   removed, private, blocked in this country, age-restricted, live
  2. full_album only: the audio-only stream goes to a folder under .cache/audio/fulllength-tmp/ (gitignored),
     its windows are laid out by rmr_audio.windows (8 embedded, n = clamp(round(runtime / 5 min), 4, 8) of
     them in the album mean; on Bandcamp the windows are shared among the tracks by duration), ffmpeg decodes
     only each window, both model children embed it (rmr_audio.onepass's), and the per-window embeddings go
     to the one-pass cache under the source `youtube` (album_id: the video id) or `bandcamp` (album_id: the
     page's host and path). The folder is deleted in a `finally`, whatever happened.
  3. The outcome is a row of audio/fulllength.csv (key, source, url, class, duration_s, title, uploader,
     n_windows, status), written after every album. status: embedded | skipped (not a full album: final) |
     failed | blocked (both tried again by the next run). A run skips the albums that are embedded or skipped.

The variant clap_mp3 (--models effnet,clap,clap_mp3; rmr_audio.mp3trip): each window is decoded once WITH
its channels; EffNet and clap get the channel average (the numbers the mono decode gives) and clap_mp3 the
channels through the 128 kbit/s stereo MP3 round trip, all from the one download. An album that is already
embedded but has no clap_mp3 windows is fetched once more for clap_mp3 alone (a top-up; --no-refetch leaves
those albums alone, --models clap_mp3 does only them): the windows are the ones the cache has (same starts
and lengths, not laid out again), EffNet and clap are not computed, their rows and audio/fulllength.csv are
not written. The top-up is refused, and nothing changed, when the link no longer leads to the video that
was embedded, is no longer a full album, or a file's length differs by more than 2 seconds from the
embedded one's. --check-baseline: the top-up also embeds each window for clap and prints its cosine with the
stored clap vector (is it the same audio?); nothing of clap is written.

Polite and easy to stop: no cookies, no account, no login, yt-dlp's own config files ignored
(--ignore-config), a pause after every album, the lowest priority, the one-pass cache's lock held (so no
other model job runs beside it). The run stops itself, without retrying harder, at the first sign of
blocking (HTTP 429, "sign in to confirm you're not a bot", "try again later"), after --max-failures
failures in a row, or after five albums in a row reported unavailable (which may be a block in disguise).
Ctrl-C once: finish the album in hand.

yt-dlp lives in its own environment (data-pipeline/.venv-fetch, gitignored: `python -m venv .venv-fetch &&
.venv-fetch/bin/pip install yt-dlp`) and is run as a child process.
"""
import argparse
import csv
import hashlib
import json
import os
import random
import re
import shutil
import statistics
import subprocess
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from rmr_pipeline.audio_store import DEFAULT_AUDIO, SOURCE_RE
from rmr_pipeline.constants import PIPELINE_DIR

from . import embed, onepass, textnorm, windows
from .clips import FINAL
from .onepass_cache import MODELS, VARIANT_OF, OnePassCache, read_only

FIELDS = ["key", "source", "url", "class", "duration_s", "title", "uploader", "n_windows", "status"]
CLASSES = ("full_album", "single_track", "mismatch", "unavailable")
DONE = ("embedded", "skipped")  # final: a later run leaves the album alone
SOURCES = {"youtube": "youtube_url", "bandcamp": "bandcamp_url"}  # source -> its column of the catalog
DEFAULT_CSV = DEFAULT_AUDIO / "fulllength.csv"
DEFAULT_TMP = onepass.DEFAULT_CACHE / "fulllength-tmp"
DEFAULT_FETCH_PYTHON = PIPELINE_DIR / ".venv-fetch" / "bin" / "python"
# about 128 kbit/s, what the store previews are; never a video stream. Bandcamp's free stream is mp3-128.
FORMATS = {"youtube": "bestaudio[abr<=160]/bestaudio", "bandcamp": "mp3-128/bestaudio"}
MIN_ALBUM_S = 15 * 60.0
MIN_HINTED_S = 8 * 60.0  # a title that says "full album" is believed from eight minutes
MAX_ALBUM_S = 6 * 3600.0
RUNTIME_SHARE = 0.6
UNAVAILABLE_IN_A_ROW = 5
MIN_FREE_BYTES = 2 * 2 ** 30
TOPUP_LENGTH_TOLERANCE_S = 2.0  # a top-up's file may differ this much in length from the one that was embedded
HINT = re.compile(r"full[\s-]*(album|ep|lp|length|record|mixtape|tape|ost|soundtrack|stream)|complete album|"
                  r"[\[(]full[\])]|(album|disco|álbum) complet[oa]|album complet|álbum completo|"
                  r"フル\s*アルバム|полный альбом|весь альбом|全专辑|完整专辑|전곡", re.I)
BLOCKED = re.compile(r"HTTP Error 429|Too Many Requests|not a bot|rate[- ]?limit|try again later|unusual traffic|captcha", re.I)
UNAVAILABLE = re.compile(
    r"unavailable|private video|is private|been removed|no longer available|not available|does not exist|terminated|"
    r"confirm your age|age[- ]restricted|inappropriate for some users|members[- ]only|join this channel|copyright|"
    r"blocked it|HTTP Error 404|HTTP Error 410|premieres in|live event|requires payment|not made this video available", re.I)


class FetchError(RuntimeError):
    """yt-dlp failed in a way that may pass (the network, a format): the album is tried again by the next run."""


class Unavailable(FetchError):
    """The link has nothing to fetch (removed, private, region, age): final."""


class Blocked(FetchError):
    """The site is refusing or rate-limiting us: the run stops."""


def fetch_error(text: str) -> FetchError:
    """The exception for what yt-dlp wrote to stderr. A sign of blocking wins over everything else: YouTube
    words a rate limit as "Video unavailable. This content isn't available, try again later"."""
    lines = [line for line in text.splitlines() if line.startswith("ERROR")] or text.strip().splitlines()[-1:]
    message = " | ".join(lines)[:300] or "yt-dlp failed without a message"
    if BLOCKED.search(message):
        return Blocked(message)
    if "Requested format" in message:
        return FetchError(message)
    return Unavailable(message) if UNAVAILABLE.search(message) else FetchError(message)


class YtDlp:
    """yt-dlp as a child process of its own environment. Never a cookie file, a browser profile or a login;
    the user's yt-dlp config is not read and its cache directory is not written."""

    def __init__(self, python: Path = DEFAULT_FETCH_PYTHON, formats: dict | None = None):
        self.python, self.formats = Path(python), {**FORMATS, **(formats or {})}
        self.base = [str(self.python), "-m", "yt_dlp", "--ignore-config", "--no-cache-dir", "--socket-timeout", "30"]

    def _run(self, args: list[str], timeout: float) -> subprocess.CompletedProcess:
        try:
            return subprocess.run([*self.base, *args], capture_output=True, timeout=timeout, start_new_session=True)
        except subprocess.TimeoutExpired:
            raise FetchError(f"yt-dlp gave no answer in {timeout:.0f} s") from None

    def info(self, url: str, source: str) -> dict:
        """The link's metadata; nothing is downloaded. A YouTube link is read as its one video."""
        p = self._run(["--skip-download", "-J", *(["--no-playlist"] if source == "youtube" else []), url], 300)
        if p.returncode:
            raise fetch_error(p.stderr.decode(errors="replace"))
        try:
            return json.loads(p.stdout.decode())
        except ValueError:
            raise FetchError("yt-dlp's metadata is not JSON") from None

    def download(self, url: str, source: str, folder: Path) -> list[Path]:
        """The audio-only stream(s) of the link into `folder`, in track order. No video, no conversion."""
        name = "%(id)s.%(ext)s" if source == "youtube" else "%(playlist_index)03d-%(id)s.%(ext)s"
        p = self._run(["-f", self.formats[source], *(["--no-playlist"] if source == "youtube" else []), "--no-part",
                       "--no-mtime", "--fixup", "never", "--no-progress", "--quiet", "--retries", "2",
                       "--fragment-retries", "2", "--max-filesize", "600M", "-o", str(folder / name), url], 3600)
        files = audio_files(folder)
        if p.returncode or not files:
            raise fetch_error(p.stderr.decode(errors="replace") or "yt-dlp wrote no file")
        return files


def audio_files(folder: Path) -> list[Path]:
    return sorted(p for p in Path(folder).iterdir() if p.is_file() and not p.name.startswith(".")
                  and p.suffix.lower() not in (".part", ".ytdl", ".json", ".jpg", ".png", ".webp"))


# --- is the link the album? --------------------------------------------------------------------------

def resembles(needle: str, hay: str) -> bool:
    """Is the (normalised) name in the (normalised) text: as a run of whole words, without spaces for a
    script that has none, or with 60% of its words there."""
    if not needle or not hay:
        return False
    if f" {needle} " in f" {hay} ":
        return True
    if textnorm.has_non_latin(needle) and needle.replace(" ", "") in hay.replace(" ", ""):
        return True
    words, there = needle.split(), set(hay.split())
    return len(words) > 1 and sum(w in there for w in words) / len(words) >= 0.6


def album_names(row: dict) -> tuple[list[str], list[str]]:
    """(titles, artists) of a catalog row, normalised, in every spelling the catalog has."""
    titles = [row.get("title", ""), row.get("title_latin", ""), row.get("rym_title", "")]
    titles += [textnorm.core_title(t) for t in titles if t] + [textnorm.main_title(t) for t in titles if t]
    artists = []
    for credit in (row.get("artist", ""), row.get("artist_latin", ""), row.get("rym_artist", "")):
        if credit:
            artists += textnorm.artist_names(credit) + textnorm.credit_names(credit)
    return (list(dict.fromkeys(filter(None, (textnorm.norm(t) for t in titles)))),
            list(dict.fromkeys(filter(None, (textnorm.norm(a, artist=True) for a in artists)))))


@dataclass(frozen=True)
class Verdict:
    cls: str
    reason: str
    duration_s: float | None
    title: str
    uploader: str
    album_id: str


def describe(info: dict) -> tuple[float | None, str, str, int]:
    """(duration, title, uploader, tracks) of yt-dlp's metadata: a video, or a page of several tracks (a
    Bandcamp album) whose duration is the sum of its tracks'."""
    entries = [e for e in info.get("entries") or [] if e] if info.get("_type") == "playlist" else None
    if entries is None:
        return info.get("duration"), info.get("title") or "", info.get("uploader") or info.get("channel") or "", 1
    lengths = [e.get("duration") for e in entries]
    uploader = info.get("uploader") or next((e.get("artist") or e.get("uploader") for e in entries
                                            if e.get("artist") or e.get("uploader")), "")
    return (float(sum(lengths)) if entries and all(lengths) else None), info.get("title") or "", uploader or "", len(entries)


def link_id(source: str, url: str, info: dict | None = None) -> str:
    """What the cache calls the link (album_id): the video id; a Bandcamp page's host and path."""
    u = urlparse(url)
    if source == "youtube":
        return (info or {}).get("id") or (parse_qs(u.query).get("v") or [u.path.rsplit("/", 1)[-1]])[0]
    return (u.netloc + u.path).rstrip("/")


def classify(info: dict, row: dict, source: str, url: str, runtime_s: float | None = None) -> Verdict:
    """What the link is, from its metadata alone (see the module docstring). `runtime_s`: the album's
    runtime when something knows it."""
    duration, title, uploader, tracks = describe(info)
    album_id = link_id(source, url, info)

    def verdict(cls: str, reason: str) -> Verdict:
        return Verdict(cls, reason, float(duration) if duration else None, title, uploader, album_id)

    if source == "youtube" and info.get("_type") == "playlist":
        return verdict("mismatch", "a playlist, not one video")
    if info.get("live_status") in ("is_live", "is_upcoming") or info.get("is_live"):
        return verdict("unavailable", "a live stream")
    if not duration:
        return verdict("unavailable", "no duration")
    if duration > MAX_ALBUM_S:
        return verdict("mismatch", f"{duration / 3600:.1f} hours")
    titles, artists = album_names(row)
    text_t, text_a = textnorm.norm(title), textnorm.norm(f"{title} {uploader}", artist=True)
    title_ok = any(resembles(t, text_t) for t in titles)
    artist_ok = any(resembles(a, text_a) for a in artists)
    seen = "+".join(k for k, ok in (("title", title_ok), ("artist", artist_ok)) if ok) or "neither title nor artist"
    hinted = bool(HINT.search(title)) or tracks > 1
    need = max(MIN_ALBUM_S, RUNTIME_SHARE * runtime_s) if runtime_s else MIN_ALBUM_S
    long = duration >= need or (hinted and duration >= MIN_HINTED_S and (not runtime_s or duration >= RUNTIME_SHARE * runtime_s))
    if not (title_ok or artist_ok):
        return verdict("mismatch", seen)
    return verdict("full_album" if long else "single_track", f"{seen}; {duration / 60:.0f} min" + (", says full album" if hinted else ""))


# --- the outcomes file -------------------------------------------------------------------------------

def load_outcomes(path: Path) -> dict[tuple[str, str], dict]:
    """(key, source) -> row of fulllength.csv; empty when the file is not there yet."""
    if not Path(path).exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELDS:
            raise ValueError(f"{path}: the header must be {','.join(FIELDS)}")
        rows = {}
        for n, r in enumerate(reader, start=2):
            if not SOURCE_RE.match(r["source"]) or r["source"] not in SOURCES or (r["class"] and r["class"] not in CLASSES):
                raise ValueError(f"{path} line {n}: unknown source or class")
            rows[(r["key"], r["source"])] = r
    return rows


def write_outcomes(path: Path, rows: dict[tuple[str, str], dict]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows.values())
    os.replace(tmp, path)


# --- which albums ------------------------------------------------------------------------------------

def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def no_audio_albums(catalog: Path, keys_csv: Path, matches: Path) -> list[dict]:
    """The catalog rows of the new albums no store has a preview of, in catalog order; each gets `key` and,
    when matches.csv knows it, `runtime_s`."""
    existing = {r["rym_id"] for r in read_csv(keys_csv)} if Path(keys_csv).exists() else set()
    match = {r["key"]: r for r in read_csv(matches)}
    out = []
    for r in read_csv(catalog):
        m = match.get(r["rym_id"])
        if r["rym_id"] in existing or m is None or int(m.get("n_clips_available") or 0):
            continue
        runtime = (m.get("runtime_s") or "").strip()
        out.append({**r, "key": r["rym_id"], "runtime_s": float(runtime) if runtime else None})
    return out


def stratified(rows: list[dict], n: int, seed: int) -> list[dict]:
    """n of the rows, one drawn from each of n equal slices of the rank order."""
    ranked = sorted(rows, key=lambda r: (int(r["rank"]) if r.get("rank") else 10 ** 9, r["key"]))
    if n >= len(ranked):
        return ranked
    rng = random.Random(seed)
    return [ranked[rng.randrange(i * len(ranked) // n, (i + 1) * len(ranked) // n)] for i in range(n)]


def video_unusable(al: dict, outcomes: dict) -> bool | None:
    """True when the album has no YouTube link or the link was found not to be the album; False when its
    video was embedded; None while nothing final is known about it."""
    if not al.get("youtube_url"):
        return True
    status = outcomes.get((al["key"], "youtube"), {}).get("status")
    return None if status not in DONE else status == "skipped"


def targets(albums: list[dict], outcomes: dict, bandcamp: bool) -> list[tuple[dict, str, str]]:
    """(album, source, url) to consider, in catalog order: its YouTube link; with `bandcamp`, its Bandcamp
    page unless its video is already embedded (the run looks again, once it knows what the video is, and
    leaves the page alone unless video_unusable)."""
    out = []
    for al in albums:
        if al.get("youtube_url"):
            out.append((al, "youtube", al["youtube_url"]))
        if bandcamp and al.get("bandcamp_url") and video_unusable(al, outcomes) is not False:
            out.append((al, "bandcamp", al["bandcamp_url"]))
    return out


# --- one album's windows -----------------------------------------------------------------------------

def embed_files(key: str, source: str, album_id: str, files: list[Path], cache: OnePassCache, embedder,
                models: tuple[str, ...], durations, decode_window, stop=None) -> tuple[int, int, float]:
    """Lay out the windows of the album's file(s), embed the ones the cache does not have, and commit each.
    Returns (windows that are ok for every model, windows the mean takes, runtime). As
    onepass.local_clips, under the link's own source name."""
    lengths = [durations(p) or 0.0 for p in files]
    wins = windows.plan(lengths)
    sig = hashlib.sha1(json.dumps([windows.VERSION, source, album_id, [round(x, 1) for x in lengths]]).encode()).hexdigest()[:16]
    cached = cache.album(key, source, album_id)
    if cached and any(c["sig"] != sig for c in cached.values()):
        cache.forget(key, source, album_id)
        cached = {}
    runtime = float(sum(lengths))
    in_mean = min(windows.n_windows(runtime), len(wins))
    cache.set_listing(key, source, album_id, len(files), len(wins), runtime, in_mean or None)
    cache.commit()
    for w in wins:  # in rank order
        if stop is not None and stop.asked:
            break
        track_id = f"{w.file + 1:03d}@{w.start_s:.2f}"
        todo = [m for m in models if cached.get(track_id, {"status": {}})["status"].get(m) not in FINAL]
        if not todo:
            continue
        rec = {"key": key, "source": source, "album_id": album_id, "track_id": track_id, "track_idx": w.index,
               "prio": w.rank, "start_s": w.start_s, "length_s": w.length_s, "sig": sig, "path": str(files[w.file]),
               "track_s": lengths[w.file], "models": todo}
        results = onepass._clip(rec, None, embedder, decode_window)
        if stop is not None and stop.asked and not all(r["status"] == "ok" for r in results.values()):
            break
        cache.put_clip({**rec, "clip_s": next((r["clip_s"] for r in results.values() if r.get("clip_s") is not None), None)})
        for m, r in results.items():
            cache.put_result(rec, m, r["status"], r.get("error"), r.get("emb"), r.get("clip_s"))
        cache.commit()
    ok = sum(onepass.all_ok(c["status"], models) for c in cache.album(key, source, album_id).values())
    return ok, in_mean, runtime


# --- the run -----------------------------------------------------------------------------------------

@dataclass
class Options:
    catalog: Path = PIPELINE_DIR / "catalog" / "albums.csv"
    keys_csv: Path = DEFAULT_AUDIO / "keys.csv"
    matches: Path = DEFAULT_AUDIO / "matches.csv"
    csv: Path = DEFAULT_CSV
    out: Path = onepass.DEFAULT_OUT
    tmp: Path = DEFAULT_TMP
    models: tuple[str, ...] = ("effnet", "clap")
    keys: tuple[str, ...] = ()
    bandcamp: bool = False
    sample: int | None = None
    seed: int = 1
    limit: int | None = None
    pause: float = 5.0
    max_failures: int = 3
    fetch_python: Path = DEFAULT_FETCH_PYTHON
    torch_python: Path | None = None
    cache_dir: Path = onepass.DEFAULT_CACHE
    formats: dict | None = None
    dry_run: bool = False
    refetch: bool = True  # fetch an embedded album again for a variant it lacks
    check_base: bool = False  # a top-up also embeds the base model and compares with its stored vector


def lacking_variants(cache_db: Path, models) -> set[tuple[str, str]]:
    """(key, source) of the albums on fetched windows with a window that is ok for a base model and has no
    final answer for its variant among `models`. The cache is only read."""
    variants = [m for m in models if m in VARIANT_OF]
    if not variants or not Path(cache_db).exists():
        return set()
    con = read_only(cache_db)
    try:
        out = set()
        for m in variants:
            out |= {tuple(r) for r in con.execute(
                "SELECT DISTINCT b.key, b.source FROM embeddings b WHERE b.model = ? AND b.status = 'ok' AND b.source IN (%s) AND NOT "
                "EXISTS (SELECT 1 FROM embeddings v WHERE v.key = b.key AND v.source = b.source AND v.album_id = b.album_id AND "
                "v.track_id = b.track_id AND v.model = ? AND v.status IN (%s))" % (", ".join("?" * len(SOURCES)), ", ".join("?" * len(FINAL))),
                (VARIANT_OF[m], *SOURCES, m, *FINAL))}
        return out
    finally:
        con.close()


def plan(opts: Options, outcomes: dict, lacking=frozenset()) -> tuple[list[tuple[dict, str, str]], Counter]:
    """The (album, source, url) with work to do, and counts of the rest. No network. `lacking`: the
    (key, source) already embedded that lack a variant the run was asked for (lacking_variants): they are
    work too (a top-up) unless opts.refetch is off."""
    albums = no_audio_albums(opts.catalog, opts.keys_csv, opts.matches)
    counts = Counter(no_audio=len(albums), youtube=sum(bool(a.get("youtube_url")) for a in albums),
                     bandcamp_only=sum(bool(a.get("bandcamp_url")) and not a.get("youtube_url") for a in albums),
                     no_link=sum(not a.get("bandcamp_url") and not a.get("youtube_url") for a in albums))
    if opts.keys:
        albums = [a for a in albums if a["key"] in set(opts.keys)]
    if opts.sample is not None:
        chosen = {a["key"] for a in stratified([a for a in albums if a.get("youtube_url")], opts.sample, opts.seed)}
        albums = [a for a in albums if a["key"] in chosen]
    todo = []
    base_too = any(m not in VARIANT_OF for m in opts.models)
    for al, source, url in targets(albums, outcomes, opts.bandcamp):
        status = outcomes.get((al["key"], source), {}).get("status")
        top_up = status == "embedded" and opts.refetch and (al["key"], source) in lacking
        if (status in DONE or not base_too) and not top_up:  # a run of variants alone only tops up
            counts["done" if status in DONE else "not_embedded"] += 1
        elif opts.limit is not None and len(todo) >= opts.limit:
            counts["beyond_limit"] += 1
        else:
            todo.append((al, source, url))
            counts["top_up"] += top_up
    return todo, counts


def run(opts: Options, fetcher=None, embedder=None, out=print, stop=None, durations=None, decode_window=None,
        sleep=time.sleep) -> int:
    """One run. `fetcher`, `embedder`, `durations`, `decode_window` and `sleep` are replaced in tests; the
    defaults run yt-dlp, start the model children and call ffprobe and ffmpeg. Returns 0; 1 when it could not
    start; 2 when it stopped itself (blocking, failures in a row)."""
    unknown = [m for m in opts.models if m not in MODELS]
    if unknown or not opts.models:
        print(f"unknown model {unknown}: {', '.join(MODELS)}", file=sys.stderr)
        return 1
    outcomes = load_outcomes(opts.csv)
    todo, counts = plan(opts, outcomes, lacking_variants(opts.out, opts.models))
    out(f"{counts['no_audio']} new albums without a preview: {counts['youtube']} with a YouTube link, "
        f"{counts['bandcamp_only']} with Bandcamp only, {counts['no_link']} with neither. "
        f"{len(todo)} to do now ({dict(Counter(s for _, s, _ in todo))}), {counts['done']} already done"
        + (f"; {counts['top_up']} of those to do are embedded albums fetched again for "
           f"{' + '.join(m for m in opts.models if m in VARIANT_OF)} alone" if counts["top_up"] else "")
        + (f"; {counts['not_embedded']} not embedded yet are left for a run with the base models" if counts["not_embedded"] else "")
        + (f", {counts['beyond_limit']} left for a later run (--limit)" if counts["beyond_limit"] else ""))
    if opts.dry_run:
        out("dry run: nothing fetched or written")
        return 0
    if not todo:
        return 0
    try:
        lock = onepass.take_lock(onepass.lock_path(opts.out))
    except onepass.Locked as e:
        print(f"{e} is held by a running job: not starting", file=sys.stderr)
        return 1
    own_embedder, stop, code = embedder is None, stop or onepass.Stop(), 0
    cache = None
    try:
        ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
        if (own_embedder or durations is None or decode_window is None) and not (ffmpeg and ffprobe):
            print("ffmpeg and ffprobe must be on PATH: they read the length of a file and decode its windows", file=sys.stderr)
            return 1
        if fetcher is None:
            if not Path(opts.fetch_python).exists():
                print(f"{opts.fetch_python}: no such interpreter (python -m venv .venv-fetch && .venv-fetch/bin/pip install yt-dlp)",
                      file=sys.stderr)
                return 1
            fetcher = YtDlp(opts.fetch_python, opts.formats)
        shutil.rmtree(opts.tmp, ignore_errors=True)  # what a killed run left (we hold the lock)
        Path(opts.tmp).mkdir(parents=True, exist_ok=True)
        cache = OnePassCache(opts.out)
        if own_embedder:
            workers_tmp = Path(opts.tmp) / "workers"
            workers_tmp.mkdir()
            if "effnet" in opts.models:
                embed.ensure_model(opts.cache_dir / "models")
            embedder = onepass.Embedder(onepass.worker_factories(opts.models, opts.cache_dir, str(workers_tmp), opts.torch_python),
                                        "own", None, out)
        if decode_window is None:
            decode_window = onepass.window_decoder(opts.models, ffmpeg)
        durations = durations or (lambda p: windows.probe_duration(p, ffprobe))
        stop.install()
        code = _work(todo, outcomes, opts, cache, fetcher, embedder, out, stop, durations, decode_window, sleep)
    finally:
        stop.restore()
        if embedder is not None and own_embedder:
            embedder.close()
        if cache is not None:
            cache.close()
        shutil.rmtree(opts.tmp, ignore_errors=True)
        lock.close()
    return code


def top_up(al: dict, source: str, url: str, folder: Path, opts: Options, cache: OnePassCache, fetcher, embedder,
           durations, decode_window, stop, out) -> tuple[str, str, int]:
    """An embedded album fetched again for the variants it lacks. (state, note, windows now ok): state is
    `topped_up`, or `failed` when the link is no longer what was embedded (nothing is changed then). Only
    rows of the variants are written: the base models' rows, the clip rows and the listing stay as they are.
    The windows are the cache's own (start and length), not laid out again."""
    key = al["key"]
    variants = [m for m in opts.models if m in VARIANT_OF]
    verdict = classify(fetcher.info(url, source), al, source, url, al.get("runtime_s"))
    if verdict.cls != "full_album":
        return "failed", f"the link is now {verdict.cls} ({verdict.reason}): not what was embedded; nothing changed", 0
    cached = cache.album(key, source, verdict.album_id)
    wanted = {t: [m for m in variants if c["status"].get(VARIANT_OF[m]) == "ok" and c["status"].get(m) not in FINAL]
              for t, c in cached.items()}
    if not any(wanted.values()):
        there = sorted({r[0] for r in cache.con.execute("SELECT DISTINCT album_id FROM embeddings WHERE key = ? AND source = ? "
                                                        "AND status = 'ok'", (key, source))})
        return "failed", f"the link is now {verdict.album_id}; the cache has windows of {', '.join(there) or 'nothing'}: nothing changed", 0
    facts = {t: (start, clip_s, track_s) for t, start, clip_s, track_s in cache.con.execute(
        "SELECT track_id, start_s, clip_s, track_s FROM clips WHERE key = ? AND source = ? AND album_id = ?", (key, source, verdict.album_id))}
    folder.mkdir(parents=True)
    files = fetcher.download(url, source, folder)
    lengths = [durations(p) or 0.0 for p in files]
    recs = []
    for track_id in sorted((t for t, todo in wanted.items() if todo), key=lambda t: (cached[t]["prio"] is None, cached[t]["prio"] or 0)):
        start, clip_s, track_s = facts.get(track_id, (None, None, None))
        file = int(track_id.split("@")[0]) - 1
        if start is None or not 0 <= file < len(files):
            return "failed", f"window {track_id} has no place in the {len(files)} file(s) fetched now; nothing changed", 0
        if track_s and abs(lengths[file] - track_s) > TOPUP_LENGTH_TOLERANCE_S:
            return "failed", (f"file {file + 1} is {lengths[file]:.1f} s now and was {track_s:.1f} s when it was embedded: "
                              "not the same audio; nothing changed"), 0
        recs.append({"key": key, "source": source, "album_id": verdict.album_id, "track_id": track_id, "start_s": start,
                     "length_s": min(windows.WINDOW_S, track_s - start) if track_s else windows.WINDOW_S,  # as windows.place
                     "path": str(files[file]),
                     "models": wanted[track_id], "follows": True, **({"check": VARIANT_OF[variants[0]]} if opts.check_base else {})})
    cosines = []
    for rec in recs:
        if stop is not None and stop.asked:
            break
        results = onepass._clip(rec, None, embedder, decode_window)
        if stop is not None and stop.asked and not all(r["status"] == "ok" for r in results.values()):
            break
        for m, r in results.items():
            cache.put_result(rec, m, r["status"], r.get("error"), r.get("emb"), r.get("clip_s"))
        cache.commit()
        cos = onepass.base_cosine(cache, rec)
        if cos is not None:
            cosines.append(cos)
            out(f"check\t{key}\t{source}\t{rec['track_id']}\t{cos:.5f}")
    now = cache.album(key, source, verdict.album_id)
    ok = sum(all(c["status"].get(m) == "ok" for m in variants) for c in now.values())
    left = sum(any(c["status"].get(VARIANT_OF[m]) == "ok" and c["status"].get(m) not in FINAL for m in variants) for c in now.values())
    note = (f"{len(files)} file(s), {sum(p.stat().st_size for p in files) / 2 ** 20:.1f} MB, {ok} windows ok for "
            f"{' + '.join(variants)}" + (f", {left} left" if left else "")
            + (f"; baseline check: cosine with the stored {VARIANT_OF[variants[0]]} vector median "
               f"{statistics.median(cosines):.4f}, lowest {min(cosines):.4f} over {len(cosines)} windows" if cosines else ""))
    return ("stopped" if left and stop is not None and stop.asked else "topped_up" if ok else "failed"), note, ok


def _work(todo, outcomes, opts: Options, cache, fetcher, embedder, out, stop, durations, decode_window, sleep) -> int:
    done, failures, unavailable, code = Counter(), 0, 0, 0
    sizes, seconds, n_embedded = [], [], 0
    t0 = time.monotonic()
    asked = False
    for i, (al, source, url) in enumerate(todo):
        if stop.asked:
            break
        if source == "bandcamp" and not video_unusable(al, outcomes):
            continue  # its video is the album, or is not known yet (it failed just now): the page is left alone
        if asked:
            sleep(opts.pause * random.uniform(1.0, 1.5))
        asked = True
        t, key = time.monotonic(), al["key"]
        row = {"key": key, "source": source, "url": url, "class": "", "duration_s": "", "title": "", "uploader": "",
               "n_windows": "", "status": "failed"}
        note, folder, blocked, gone = "", Path(opts.tmp) / hashlib.sha1(f"{source}:{key}".encode()).hexdigest()[:12], False, False
        again = outcomes.get((key, source), {}).get("status") == "embedded"  # a top-up: its row is not rewritten
        try:
            if again:
                if shutil.disk_usage(Path(opts.tmp)).free < MIN_FREE_BYTES:
                    out("under 2 GB of free disk: stopping")
                    stop.asked, code = True, 2
                    break
                state, note, ok = top_up(al, source, url, folder, opts, cache, fetcher, embedder, durations, decode_window, stop, out)
                if state == "stopped":
                    out(f"{key}\tstopped inside the album: it is finished by the next run")
                    break
                row = {**outcomes[(key, source)], "status": state}
                n_embedded += ok
            else:
                verdict = classify(fetcher.info(url, source), al, source, url, al.get("runtime_s"))
                row.update({"class": verdict.cls, "duration_s": f"{verdict.duration_s:.0f}" if verdict.duration_s else "",
                            "title": verdict.title, "uploader": verdict.uploader, "status": "skipped"})
                note = verdict.reason
                if verdict.cls == "full_album":
                    row["status"] = "failed"
                    if shutil.disk_usage(Path(opts.tmp)).free < MIN_FREE_BYTES:
                        out("under 2 GB of free disk: stopping")
                        stop.asked, code = True, 2
                        break
                    folder.mkdir(parents=True)
                    files = fetcher.download(url, source, folder)
                    size = sum(p.stat().st_size for p in files)
                    ok, in_mean, runtime = embed_files(key, source, verdict.album_id, files, cache, embedder, opts.models,
                                                       durations, decode_window, stop)
                    if stop.asked and ok < in_mean:
                        out(f"{key}\tstopped inside the album: it is finished by the next run")
                        break
                    row.update({"n_windows": str(min(ok, in_mean)), "status": "embedded" if ok else "failed"})
                    note += f"; {len(files)} file(s), {size / 2 ** 20:.1f} MB, {ok} windows embedded, {in_mean} in the mean"
                    if ok:
                        sizes.append(size)
                        n_embedded += ok
                    else:
                        note += "; no window could be embedded"
        except Blocked as e:
            row = {**row, "status": "blocked"}
            note, blocked = str(e), True
        except Unavailable as e:
            row = {**row, "status": "failed"} if again else {**row, "class": "unavailable", "status": "skipped"}
            note, gone = str(e) + ("; the embedded windows are kept" if again else ""), True
        except FetchError as e:
            row = {**row, "status": "failed"}
            note = str(e)
        finally:
            shutil.rmtree(folder, ignore_errors=True)  # the audio is never kept
        if not again:
            outcomes[(key, source)] = row
            write_outcomes(opts.csv, outcomes)
        took = time.monotonic() - t
        if row["status"] == "embedded":
            seconds.append(took)
        done[row["status"] if again else row["class"] or row["status"]] += 1
        out(f"[{time.strftime('%H:%M:%S')}] {i + 1}/{len(todo)}\t{key}\trank {al.get('rank', '')}\t{source}\t{row['status']}\t"
            f"{row['class'] or '-'}\t{row['duration_s'] or '-'} s\t{took:.0f} s\t{al.get('artist', '')} — {al.get('title', '')}"
            f" || {row['title']} | {row['uploader']} || {note}")
        failures = failures + 1 if row["status"] == "failed" else 0
        unavailable = unavailable + 1 if gone or (row["class"] == "unavailable" and not again) else 0
        if blocked:
            out("the site is refusing or rate-limiting us: stopping. Run again another day; nothing is retried now")
            code = 2
            break
        if failures >= opts.max_failures:
            out(f"{failures} albums in a row failed: stopping; look at the messages before running again")
            code = 2
            break
        if unavailable >= UNAVAILABLE_IN_A_ROW:
            out(f"{unavailable} albums in a row were reported unavailable, which may be a block: stopping")
            code = 2
            break
    total = time.monotonic() - t0
    out(f"{'stopped' if stop.asked or code else 'finished'}: {sum(done.values())} albums in {total:.0f} s: {dict(done)}; "
        f"{n_embedded} windows embedded for {' + '.join(opts.models)}"
        + (f"; per embedded album a median of {statistics.median(sizes) / 2 ** 20:.1f} MB and {statistics.median(seconds):.0f} s"
           if sizes else ""))
    if hasattr(embedder, "memory"):
        out(embedder.memory())
    return code


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m rmr_audio.fulllength", description=__doc__.split("\n\n")[0])
    p.add_argument("--bandcamp", action="store_true",
                   help="Also fetch the Bandcamp page of an album without a usable YouTube link (off by default).")
    p.add_argument("--sample", type=int, default=None, help="Only N albums with a YouTube link, spread over the ranks.")
    p.add_argument("--seed", type=int, default=1, help="The seed of --sample (default 1).")
    p.add_argument("--limit", type=int, default=None, help="At most N albums with work to do.")
    p.add_argument("--keys", default="", help="Only these albums: comma-separated keys.")
    p.add_argument("--pause", type=float, default=5.0, help="Seconds between albums (default 5, up to half more at random).")
    p.add_argument("--max-failures", type=int, default=3, help="Stop after this many failed albums in a row (default 3).")
    p.add_argument("--format", default=None, help=f"yt-dlp format for YouTube (default {FORMATS['youtube']}).")
    p.add_argument("--models", type=onepass._models, default=("effnet", "clap"))
    p.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="The outcomes file (default audio/fulllength.csv).")
    p.add_argument("--out", type=Path, default=onepass.DEFAULT_OUT, help="The one-pass cache.")
    p.add_argument("--tmp", type=Path, default=DEFAULT_TMP, help="Where a file lives while it is embedded (emptied at start and end).")
    p.add_argument("--catalog", type=Path, default=Options.catalog)
    p.add_argument("--keys-csv", type=Path, default=Options.keys_csv)
    p.add_argument("--matches", type=Path, default=Options.matches)
    p.add_argument("--fetch-python", type=Path, default=DEFAULT_FETCH_PYTHON, help="The python of the environment with yt-dlp.")
    p.add_argument("--torch-python", type=Path, default=None, help="The torch venv's python (or RMR_TORCH_PYTHON).")
    p.add_argument("--cache-dir", type=Path, default=onepass.DEFAULT_CACHE, help="Where models/ (the EffNet graph) is.")
    p.add_argument("--dry-run", action="store_true", help="Print what would be done; no network, nothing written.")
    p.add_argument("--no-refetch", action="store_true",
                   help="Leave alone the embedded albums that lack a variant asked for (default: fetch them again for it alone).")
    p.add_argument("--check-baseline", action="store_true",
                   help="A top-up also embeds each window for the base model and prints its cosine with the stored vector.")
    return p


def main(argv: list[str] | None = None) -> int:
    a = parser().parse_args(argv)
    sys.stdout.reconfigure(line_buffering=True)
    try:
        os.nice(19)
    except OSError:
        pass
    return run(Options(a.catalog, a.keys_csv, a.matches, a.csv, a.out, a.tmp, a.models, tuple(k for k in a.keys.split(",") if k),
                       a.bandcamp, a.sample, a.seed, a.limit, a.pause, a.max_failures, a.fetch_python, a.torch_python,
                       a.cache_dir, {"youtube": a.format} if a.format else None, a.dry_run, not a.no_refetch, a.check_baseline))


if __name__ == "__main__":
    raise SystemExit(main())
