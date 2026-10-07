"""The one-pass clip cache (data-pipeline/.cache/audio/onepass.sqlite, gitignored): every clip tried, with
its embedding from each model. It is what makes a run resumable, what lets an album go from four clips to
eight by fetching four, and what album means are pooled from. No audio is in it.

  clips(key, source, album_id, track_id, track_idx, prio, clip_s, track_s, short_preview, start_s, sig)
      one row per clip: what is true of the clip whatever the model
      key          the album's key (RYM id, or its placeholder; rmr_pipeline.keys)
      source, album_id   the listing the clip came from; windows of local files: `local` and ''; windows of
                   a full-length file fetched and deleted (rmr_audio.fulllength): `youtube` and the video id,
                   `bandcamp` and the album page
      track_id     the store's track id; a window: `<file name>@<start in seconds>`
      track_idx    the track's position in the listing; a window: its position in album order
      prio         the clip's rank in the album's clip order (clips.priority_order; windows.plan)
      clip_s       seconds of audio decoded
      track_s      the whole track's length as the listing gives it (a window: the file's)
      short_preview  1 when the clip is under 25 s and the track over 60 s (match.short_preview), 0 when not,
                   NULL when either length is unknown
      start_s      a window: where it starts in its file
      sig          a window: the signature of the album's files and of the sampling rule

  embeddings(key, source, album_id, track_id, model, status, error, clip_s, emb, origin)
      one row per clip and model
      model        effnet (discogs-effnet-bs1-1, 1,280 float16 LE) | clap (laion/larger_clap_music_and_speech,
                   512 float32 LE) | clap_mp3 (a variant of clap, beside it and never in its place: the clip
                   through a 128 kbit/s stereo MP3 round trip first, rmr_audio.mp3trip; for a deezer clip the
                   clap vector itself, copied by copy_variant)
      status       ok | no_preview | too_short | decode_failed    final: never tried again
                   download_failed | analysis_failed | embed_failed | crashed    tried again by the next run
      clip_s       seconds as this model's decoder gave them
      origin       onepass, the cache the row was imported from, or `copy:clap` (a variant row of a deezer clip)

  listings(key, source, album_id, n_tracks, n_previews, runtime_s, n_windows)
      what the last fetched listing (or folder of files) had: lets a later run see without the network that
      every preview was tried. n_windows: windows of full-length audio only, the number of windows the mean takes.

Embeddings made before the one-pass run are imported, never recomputed: import_effnet reads the pipeline's
clips.sqlite, import_clap another run's clap_clips.sqlite, both strictly read-only (`mode=ro`), and both
through keys.csv when their keys are Spotify URIs of before the rekey.

Only the standard library, numpy and rmr_pipeline are needed here, so both environments can read the cache.
"""
import sqlite3
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from rmr_pipeline.audio_store import StoreError

from . import mp3trip
from .clips import FINAL

SCHEMA = """
CREATE TABLE IF NOT EXISTS clips(key TEXT NOT NULL, source TEXT NOT NULL, album_id TEXT NOT NULL, track_id TEXT NOT NULL,
    track_idx INTEGER, prio INTEGER, clip_s REAL, track_s REAL, short_preview INTEGER, start_s REAL, sig TEXT,
    updated_at TEXT, PRIMARY KEY(key, source, album_id, track_id));
CREATE TABLE IF NOT EXISTS embeddings(key TEXT NOT NULL, source TEXT NOT NULL, album_id TEXT NOT NULL,
    track_id TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, error TEXT, clip_s REAL, emb BLOB, origin TEXT,
    updated_at TEXT, PRIMARY KEY(key, source, album_id, track_id, model));
CREATE TABLE IF NOT EXISTS listings(key TEXT NOT NULL, source TEXT NOT NULL, album_id TEXT NOT NULL, n_tracks INTEGER,
    n_previews INTEGER, runtime_s REAL, n_windows INTEGER, updated_at TEXT, PRIMARY KEY(key, source, album_id));
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
"""
POOLS = ("rank", "below")
# Sources whose clips are windows of full-length audio, in the order an album's mean prefers them. Their
# listing replaces the store previews of the album and its mean takes listings.n_windows windows.
WINDOW_SOURCES = ("local", "youtube", "bandcamp")


@dataclass(frozen=True)
class Model:
    name: str
    model_id: str
    dim: int
    dtype: str
    recipe: str
    mean_order: str  # the order the clips are averaged in, as the model's own code does: track | prio

    @property
    def nbytes(self) -> int:
        return self.dim * np.dtype(self.dtype).itemsize


MODELS = {
    "effnet": Model("effnet", "discogs-effnet-bs1-1", 1280, "<f2",
                    "44.1 kHz mono -> 16 kHz -> mel patches (2 s, one per second) -> discogs-effnet-bs1-1 -> mean; "
                    "float16 (rmr_audio.embed)", "track"),
    "clap": Model("clap", "laion/larger_clap_music_and_speech", 512, "<f4",
                  "44.1 kHz mono -> resample_poly(160,147) -> 3 x 10 s windows -> get_audio_features -> L2 per "
                  "window -> mean; float32 (clap_catalog.py)", "prio"),
    "clap_mp3": Model("clap_mp3", "laion/larger_clap_music_and_speech+mp3-128k-stereo", 512, "<f4", mp3trip.RECIPE, "prio"),
}
# A variant is another preprocessing of the clip for a model that is already there: variant -> its base. It
# is served by the base's child process, a run for the variant alone embeds the clips the base has
# (rmr_audio.onepass), and for the sources the preprocessing is meant to imitate the variant IS the base
# vector (same_as_base).
VARIANT_OF = {"clap_mp3": "clap"}


def worker_of(model: str) -> str:
    """The child process that serves the model: its own, or its base's."""
    return VARIANT_OF.get(model, model)


def same_as_base(model: str, source: str) -> bool:
    """Is the variant's vector of a clip from this source the base model's vector? clap_mp3: a Deezer
    preview already is a 128 kbit/s stereo MP3, so it is not encoded a second time."""
    return model in VARIANT_OF and source.split(":")[0] == "deezer"


def short_preview(clip_s: float | None, track_s: float | None) -> int | None:
    """1 when the clip is shorter than about 25 s although its track is longer than a minute (the store
    cut the preview short: ten-second previews exist), 0 when not, None when a length is unknown."""
    if clip_s is None or not track_s:
        return None
    from .match import short_preview as flagged  # the one definition; imported here: the matcher needs pandas and rapidfuzz

    return int(flagged([(clip_s, track_s)]))


def read_only(path: Path | str) -> sqlite3.Connection:
    """An existing sqlite file, opened so that nothing can be written to it."""
    if not Path(path).exists():
        raise FileNotFoundError(f"{path}: no such cache")
    return sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True, timeout=60)


class OnePassCache:
    def __init__(self, path: Path | str, readonly: bool = False):
        self.readonly = readonly
        if readonly:
            self.con = read_only(path)
            return
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(path, timeout=60)
        self.con.executescript(SCHEMA)
        self.con.executemany("INSERT OR IGNORE INTO meta VALUES (?, ?)",
                             [("schema", "onepass-1")] + [(f"{m.name}.{k}", v) for m in MODELS.values()
                                                          for k, v in (("model", m.model_id), ("recipe", m.recipe))])
        self.con.commit()

    def close(self) -> None:
        if not self.readonly:
            self.con.commit()
        self.con.close()

    def commit(self) -> None:
        self.con.commit()

    # --- writing ---------------------------------------------------------------------------------

    def put_clip(self, rec: dict) -> None:
        """Insert the clip's facts, or fill in the ones a row already there does not have. A rank or a
        track position already recorded is kept: an imported clip stays where its own run put it."""
        ident = (rec["key"], rec["source"], rec["album_id"], rec["track_id"])
        facts = [rec.get(c) for c in ("track_idx", "prio", "clip_s", "track_s", "start_s", "sig")]
        self.con.execute(
            "INSERT INTO clips(key, source, album_id, track_id, track_idx, prio, clip_s, track_s, start_s, sig, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(key, source, album_id, track_id) DO UPDATE SET "
            "track_idx = COALESCE(track_idx, excluded.track_idx), prio = COALESCE(prio, excluded.prio), "
            "clip_s = COALESCE(excluded.clip_s, clip_s), track_s = COALESCE(excluded.track_s, track_s), "
            "start_s = COALESCE(excluded.start_s, start_s), sig = COALESCE(excluded.sig, sig), updated_at = datetime('now')",
            (*ident, *facts))
        clip_s, track_s = self.con.execute(
            "SELECT clip_s, track_s FROM clips WHERE key = ? AND source = ? AND album_id = ? AND track_id = ?", ident).fetchone()
        self.con.execute("UPDATE clips SET short_preview = ? WHERE key = ? AND source = ? AND album_id = ? AND track_id = ?",
                         (short_preview(clip_s, track_s), *ident))

    def put_result(self, rec: dict, model: str, status: str, error: str | None = None, emb: bytes | None = None,
                   clip_s: float | None = None, origin: str = "onepass") -> None:
        if status == "ok" and (emb is None or len(emb) != MODELS[model].nbytes):
            raise ValueError(f"{model}: an ok clip needs {MODELS[model].nbytes} bytes, got {len(emb or b'')}")
        self.con.execute(
            "INSERT OR REPLACE INTO embeddings(key, source, album_id, track_id, model, status, error, clip_s, emb, origin, "
            "updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            (rec["key"], rec["source"], rec["album_id"], rec["track_id"], model, status, error, clip_s,
             emb if status == "ok" else None, origin))

    def set_listing(self, key: str, source: str, album_id: str, n_tracks: int, n_previews: int,
                    runtime_s: float | None = None, n_windows: int | None = None,
                    track_s: dict[str, float] | None = None) -> None:
        """Record what a fresh listing had, and give the clips already cached their track's length."""
        self.con.execute("INSERT OR REPLACE INTO listings VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                         (key, source, album_id, n_tracks, n_previews, runtime_s, n_windows))
        for track_id, clip_s in self.con.execute(
                "SELECT track_id, clip_s FROM clips WHERE key = ? AND source = ? AND album_id = ?",
                (key, source, album_id)).fetchall():
            seconds = (track_s or {}).get(track_id)
            if seconds:
                self.con.execute("UPDATE clips SET track_s = ?, short_preview = ? WHERE key = ? AND source = ? "
                                 "AND album_id = ? AND track_id = ?",
                                 (seconds, short_preview(clip_s, seconds), key, source, album_id, track_id))

    def copy_variant(self, model: str, keys=None) -> Counter:
        """Give every clip whose variant vector is the base's (same_as_base: the deezer clips) the base
        model's row under the variant's name: status, error, seconds and the embedding's bytes as they are,
        origin `copy:<base>`. Nothing is downloaded or computed and no base row is written. A variant row
        that is ok is never replaced; one that is not ok is replaced only by an ok one. `keys`: only these
        albums. Returns the rows copied, by status."""
        base = VARIANT_OF[model]
        final = sorted(FINAL)
        sql = ("INSERT OR REPLACE INTO embeddings(key, source, album_id, track_id, model, status, error, clip_s, emb, origin, "
               "updated_at) SELECT b.key, b.source, b.album_id, b.track_id, ?, b.status, b.error, b.clip_s, b.emb, ?, datetime('now') "
               "FROM embeddings b WHERE b.model = ? AND b.source = 'deezer' AND b.status IN (%s) AND NOT EXISTS (SELECT 1 FROM "
               "embeddings v WHERE v.key = b.key AND v.source = b.source AND v.album_id = b.album_id AND v.track_id = b.track_id "
               "AND v.model = ? AND (v.status = 'ok' OR b.status != 'ok'))" % ", ".join("?" * len(final)))
        args = [model, f"copy:{base}", base, *final, model]
        before = Counter(dict(self.con.execute("SELECT status, COUNT(*) FROM embeddings WHERE model = ? AND origin = ? GROUP BY 1",
                                               (model, f"copy:{base}"))))
        if keys is None:
            self.con.execute(sql, args)
        else:
            keys = sorted(set(keys))
            for i in range(0, len(keys), 500):
                part = keys[i:i + 500]
                self.con.execute(sql + " AND b.key IN (%s)" % ", ".join("?" * len(part)), [*args, *part])
        after = Counter(dict(self.con.execute("SELECT status, COUNT(*) FROM embeddings WHERE model = ? AND origin = ? GROUP BY 1",
                                              (model, f"copy:{base}"))))
        self.con.commit()
        return Counter({k: n for k, n in (after - before).items() if n})

    def forget(self, key: str, source: str, album_id: str) -> int:
        """Drop every clip of one listing (a folder of local files that changed). Returns how many."""
        n = self.con.execute("DELETE FROM clips WHERE key = ? AND source = ? AND album_id = ?", (key, source, album_id)).rowcount
        self.con.execute("DELETE FROM embeddings WHERE key = ? AND source = ? AND album_id = ?", (key, source, album_id))
        self.con.execute("DELETE FROM listings WHERE key = ? AND source = ? AND album_id = ?", (key, source, album_id))
        return n

    # --- reading ---------------------------------------------------------------------------------

    def album(self, key: str, source: str, album_id: str) -> dict[str, dict]:
        """track_id -> {track_idx, prio, sig, status: {model: status}, error: {model: error}} of one listing."""
        out = {t: {"track_idx": i, "prio": p, "sig": s, "status": {}, "error": {}} for t, i, p, s in self.con.execute(
            "SELECT track_id, track_idx, prio, sig FROM clips WHERE key = ? AND source = ? AND album_id = ?",
            (key, source, album_id))}
        for t, model, status, error in self.con.execute(
                "SELECT track_id, model, status, error FROM embeddings WHERE key = ? AND source = ? AND album_id = ?",
                (key, source, album_id)):
            clip = out.setdefault(t, {"track_idx": None, "prio": None, "sig": None, "status": {}, "error": {}})
            clip["status"][model], clip["error"][model] = status, error
        return out

    def summary(self) -> dict[tuple[str, str, str], dict[str, dict[str, str]]]:
        """(key, source, album_id) -> {track_id: {model: status}} for the whole cache: what planning needs."""
        out: dict[tuple, dict] = {}
        for key, source, album_id, track_id, model, status in self.con.execute(
                "SELECT key, source, album_id, track_id, model, status FROM embeddings"):
            out.setdefault((key, source, album_id), {}).setdefault(track_id, {})[model] = status
        return out

    def listings(self) -> dict[tuple[str, str, str], dict]:
        cols = ("n_tracks", "n_previews", "runtime_s", "n_windows")
        return {tuple(r[:3]): dict(zip(cols, r[3:])) for r in self.con.execute(
            "SELECT key, source, album_id, n_tracks, n_previews, runtime_s, n_windows FROM listings")}

    def counts(self) -> dict[str, Counter]:
        out: dict[str, Counter] = {}
        for model, status, n in self.con.execute("SELECT model, status, COUNT(*) FROM embeddings GROUP BY 1, 2"):
            out.setdefault(model, Counter())[status] = n
        return out

    def short_previews(self) -> list[tuple[str, str, str, int]]:
        """(key, source, album_id, clips flagged) of the albums with a preview cut short."""
        return self.con.execute("SELECT key, source, album_id, COUNT(*) FROM clips WHERE short_preview = 1 "
                                "GROUP BY 1, 2, 3 ORDER BY 1, 2, 3").fetchall()

    # --- album means -----------------------------------------------------------------------------

    def mean(self, model: str, key: str, source: str, album_id: str, clips: int | None, pool: str = "rank",
             common: tuple[str, ...] = ()) -> tuple[np.ndarray | None, int]:
        """(mean embedding in float64, number of clips) of one listing; (None, 0) when it has no ok clip.

        pool `rank`   the first `clips` ok clips in rank order: a clip that failed does not use up a place.
                      It is how the committed store is made (ClipCache.mean) and the default.
        pool `below`  the ok clips with rank < clips: how clap_catalog.load and the experiment's shard pool.
        clips None    every ok clip.
        common        models the clip must also be ok for, so two models can be pooled over the same clips.

        The pooling itself is each model's own: the plain mean of the per-clip vectors taken in float64,
        not renormalised (EffNet's read as float16, in track order; CLAP's float32, in rank order)."""
        if pool not in POOLS:
            raise ValueError(f"pool must be one of {POOLS}")
        spec = MODELS[model]
        rows = self.con.execute(
            "SELECT e.emb, c.track_idx, c.prio, e.track_id FROM embeddings e JOIN clips c USING (key, source, album_id, track_id) "
            "WHERE e.model = ? AND e.key = ? AND e.source = ? AND e.album_id = ? AND e.status = 'ok' AND e.emb IS NOT NULL "
            "ORDER BY c.prio IS NULL, c.prio, c.track_idx", (model, key, source, album_id)).fetchall()
        if common:
            status = self.album(key, source, album_id)
            rows = [r for r in rows if all(status[r[3]]["status"].get(m) == "ok" for m in common)]
        if clips is not None:
            rows = [r for r in rows if r[2] is not None and r[2] < clips] if pool == "below" else rows[:clips]
        if spec.mean_order == "track":
            rows = sorted(rows, key=lambda r: (r[1] is None, r[1]))
        if not rows:
            return None, 0
        stack = np.stack([np.frombuffer(r[0], spec.dtype).astype(np.float32) for r in rows])
        assert stack.shape[1] == spec.dim
        return stack.astype(np.float64).mean(axis=0), len(rows)

    def means(self, model: str, clips: int | None, pool: str = "rank", listing_of: dict[str, tuple[str, str]] | None = None,
              common: tuple[str, ...] = ()) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """(keys, X float64 (n, dim), clips per album, source per album) for every album with an ok clip.

        One listing per album, never a mix: its windows of full-length audio when it has any that worked
        (WINDOW_SOURCES: local files before youtube before bandcamp; they replace the store previews, and
        then the mean takes the album's own window count, `listings.n_windows`, not `clips`); else the listing `listing_of` names for its key (rmr_audio.modelstore.listing_of:
        the one match_overrides.json forces, then the one matches.csv names); else, for a key it does
        not name, the listing with the most ok clips (clap_catalog.load's rule)."""
        ok: dict[str, Counter] = {}
        for key, source, album_id, n in self.con.execute(
                "SELECT key, source, album_id, COUNT(*) FROM embeddings WHERE model = ? AND status = 'ok' "
                "GROUP BY 1, 2, 3 ORDER BY 1, 2, 3", (model,)):
            ok.setdefault(key, Counter())[(source, album_id)] = n
        listings = self.listings()
        windowed: dict[str, tuple] = {}  # key -> its window listing: the preferred source, then the most ok clips
        for key, source, album_id, n in self.con.execute(
                "SELECT key, source, album_id, COUNT(*) FROM embeddings WHERE status = 'ok' AND source IN (%s) "
                "GROUP BY 1, 2, 3 ORDER BY 1, 2, 3" % ", ".join("?" * len(WINDOW_SOURCES)), WINDOW_SOURCES):
            cand = (WINDOW_SOURCES.index(source), -n, source, album_id)
            if key not in windowed or cand < windowed[key]:
                windowed[key] = cand
        keys, embs, counts, sources = [], [], [], []
        for key in sorted(ok):
            if key in windowed:
                listing = windowed[key][2:]
                n = listings.get((key, *listing), {}).get("n_windows") or None
            elif listing_of and key in listing_of:
                listing, n = tuple(listing_of[key]), clips
            else:
                listing, n = max(ok[key], key=lambda l: ok[key][l]), clips
            vec, used = self.mean(model, key, *listing, n, pool, common)
            if vec is None:
                continue
            keys.append(key), embs.append(vec), counts.append(used), sources.append(listing[0])
        X = np.stack(embs) if embs else np.empty((0, MODELS[model].dim))
        return np.array(keys, dtype=str), X, np.array(counts, dtype=np.int64), np.array(sources, dtype=str)

    # --- importing what is already computed ------------------------------------------------------

    def import_effnet(self, path: Path | str, keymap=None) -> Counter:
        """The pipeline's clips.sqlite (rmr_audio.clips), read-only: every clip row as an `effnet` row here."""
        con = read_only(path)
        try:
            rows = con.execute("SELECT key, source, album_id, track_id, track_idx, prio, status, error, clip_s, sig, emb "
                               "FROM clips").fetchall()
        finally:
            con.close()
        return self._import("effnet", rows, keymap, f"import:{Path(path).name}")

    def import_clap(self, path: Path | str, keymap=None) -> Counter:
        """Another run's clap_clips.sqlite (clap_catalog.py), read-only: every row as a `clap` row here."""
        con = read_only(path)
        try:
            rows = con.execute("SELECT key, source, album_id, track_id, track_idx, prio, status, error, clip_s, NULL, emb "
                               "FROM clap_clips").fetchall()
        finally:
            con.close()
        return self._import("clap", rows, keymap, f"import:{Path(path).name}")

    def _import(self, model: str, rows: list[tuple], keymap, origin: str) -> Counter:
        """An ok embedding already here is never replaced; a row that is not ok is replaced only by an ok
        one. `keymap` (rmr_pipeline.keys.KeyMap) turns a key of any age into the current one; a URI it does
        not have is counted and left out."""
        spec, n = MODELS[model], Counter()
        have = {tuple(r[:4]): r[4] for r in self.con.execute(
            "SELECT key, source, album_id, track_id, status FROM embeddings WHERE model = ?", (model,))}
        prios = {tuple(r[:4]): r[4] for r in self.con.execute("SELECT key, source, album_id, track_id, prio FROM clips")}
        for key, source, album_id, track_id, track_idx, prio, status, error, clip_s, sig, emb in rows:
            if keymap is not None:
                try:
                    key = keymap.current(key)
                except StoreError:
                    n["unknown_key"] += 1
                    continue
            if status == "ok" and (emb is None or len(emb) != spec.nbytes):
                n["bad_embedding"] += 1
                continue
            ident = (key, source, album_id or "", track_id)
            rec = dict(zip(("key", "source", "album_id", "track_id"), ident), track_idx=track_idx, prio=prio,
                       clip_s=clip_s if status in ("ok", "too_short") else None, sig=sig)
            if ident in have and (have[ident] == "ok" or status != "ok"):
                n["already_here"] += 1
                continue
            if ident in prios and prios[ident] is not None and prio is not None and prios[ident] != prio:
                n["rank_differs"] += 1  # the two caches ranked the clip differently: the first one in is kept
            self.put_clip(rec)
            self.put_result(rec, model, status, error, emb, clip_s, origin)
            have[ident] = status
            prios.setdefault(ident, prio)
            n["imported"] += 1
            n[f"imported_{status}"] += 1
        self.con.commit()
        return n


def is_final(status: str | None) -> bool:
    return status in FINAL
