"""The clip cache as two committed tables, without the vectors: which clips every album's audio came from.

  cd data-pipeline
  .venv/bin/python -m rmr_audio.clip_table [--cache SQLITE] [--out CSV] [--listings CSV] [--catalog CSV]
                                           [--verify] [--dry-run]

The one-pass clip cache (.cache/audio/onepass.sqlite, rmr_audio.onepass_cache) is not committed: it is
some 600 MB of per-clip vectors. The album means are committed (audio/effnet10k, audio/clap), but which
track of which listing each clip was, and which clips each mean took, is only in the cache. This writes that
part: audio/clips.csv (one row per clip) and audio/clip_listings.csv (one row per listing). No vector, no
audio, and no address of a preview file (the cache never had one) is in them.

The cache is opened strictly read-only (`mode=ro`), and nothing else is written. The same cache and the
same committed files give the same bytes. No network, no model: numpy and rmr_pipeline, in either venv.

audio/clips.csv, ordered by key, source, listing_id, rank, track
  key            the album's key as the cache has it: a RYM id, or the placeholder `sp:<Spotify id>` of
                 clips fetched before the album was given its RYM id
  rym_id         the album's key in the catalog today (audio/keys.csv follows a placeholder); empty when
                 the catalog does not have the album
  source         deezer | itunes:<storefront> | youtube | bandcamp | local
  listing_id     the store's album id; youtube: the video id (onepass_cache's `album_id`)
  track_id       the store's track id; a window of full-length audio: `<file name>@<start in seconds>`
  track_idx      the track's position in the listing; a window: its position in album order
  prio           the clip's rank in the album's clip order (the first track, then tracks spread evenly)
  start_s        a window: where it starts in its file, in seconds (3 decimals); empty for a preview
  clip_s         seconds of audio decoded (3 decimals)
  track_s        the whole track's length as the listing gives it (a window: the file's); empty when unknown
  short_preview  1 when the clip is under 25 s and its track over 60 s, 0 when not, empty when a length is unknown
  sig            a window: the signature of the album's files and of the sampling rule
  effnet, clap, clap_mp3
                 the clip's status for the model (ok, no_preview, too_short, ...: onepass_cache's list);
                 empty when the model was never run on the clip
  effnet_origin, clap_origin, clap_mp3_origin
                 where the model's row came from: onepass, import:<the older cache>, or copy:clap (a
                 Deezer clip's clap_mp3 vector is its clap vector)
  error          `<model>: <message>` for each model that has one, joined by `; `
  in_<store>     one column per committed store that is written from this cache (in_effnet10k, in_clap):
                 1 when the clip is one of those the album's committed mean is taken from, else 0. It is
                 worked out by modelstore's rule (below) and checked against the store's `n_clips` and
                 `source` for every album; `--verify` also takes the mean again and compares the vectors.
  cached_at      when the cache last wrote the clip's row (UTC)

audio/clip_listings.csv, ordered by key, source, listing_id: what the last fetched listing had
  key, rym_id, source, listing_id   as above
  n_tracks, n_previews, runtime_s   tracks, tracks with a preview, and the listing's length in seconds
  n_windows      full-length audio only: the number of windows the mean takes
  cached_at      when the cache last wrote the row (UTC)

The rule behind in_<store> (rmr_audio.modelstore, OnePassCache.means with pool `rank`): one listing per
album, never a mix. Its windows of full-length audio when it has any that worked (local, then youtube,
then bandcamp), and then the first `n_windows` ok windows; else the listing match_overrides.json forces
when it has an ok clip for the model, else the one matches.csv names when it has, else the listing with
the most ok clips; and of that listing the first 4 ok clips in rank order. `chosen` below is that rule
written out once more so that the clips can be named; the tests hold it to OnePassCache.means, and the
checks here hold it to the committed stores.
"""
import argparse
import csv
import io
import os
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from rmr_pipeline.audio import DEFAULT_CATALOG, catalog_keys
from rmr_pipeline.audio_store import DEFAULT_AUDIO, StoreError, load_store
from rmr_pipeline.keys import KeyMap, load_keys

from .modelstore import DEFAULT_CACHE_DB, listing_of
from .onepass_cache import MODELS, WINDOW_SOURCES, OnePassCache

DEFAULT_OUT = DEFAULT_AUDIO / "clips.csv"
DEFAULT_LISTINGS = DEFAULT_AUDIO / "clip_listings.csv"
# The committed stores that rmr_audio.modelstore writes from this cache, by column name. audio/ itself (the
# first EffNet store) is written by `rmr_audio sync` from another cache and has no column.
STORE_DIRS = {"effnet10k": DEFAULT_AUDIO / "effnet10k", "clap": DEFAULT_AUDIO / "clap"}
CLIP_FIELDS = ["key", "rym_id", "source", "listing_id", "track_id", "track_idx", "prio", "start_s", "clip_s", "track_s",
               "short_preview", "sig"]
LISTING_FIELDS = ["key", "rym_id", "source", "listing_id", "n_tracks", "n_previews", "runtime_s", "n_windows", "cached_at"]


def chosen(cache: OnePassCache, model: str, clips: int | None,
           named: dict[str, tuple[str, str]] | None = None) -> dict[str, tuple[str, str, list[str]]]:
    """cache key -> (source, listing id, the track ids its mean takes, in rank order) for every album with
    an ok clip for the model: OnePassCache.means(model, clips, "rank", named), naming the clips."""
    ok: dict[str, dict[tuple[str, str], list[str]]] = {}
    for key, source, album_id, track_id in cache.con.execute(
            "SELECT e.key, e.source, e.album_id, e.track_id FROM embeddings e JOIN clips c USING (key, source, album_id, track_id) "
            "WHERE e.model = ? AND e.status = 'ok' AND e.emb IS NOT NULL "
            "ORDER BY e.key, e.source, e.album_id, c.prio IS NULL, c.prio, c.track_idx", (model,)):
        ok.setdefault(key, {}).setdefault((source, album_id), []).append(track_id)
    listings = cache.listings()
    windowed: dict[str, tuple] = {}
    for key, source, album_id, n in cache.con.execute(
            "SELECT key, source, album_id, COUNT(*) FROM embeddings WHERE status = 'ok' AND source IN (%s) "
            "GROUP BY 1, 2, 3 ORDER BY 1, 2, 3" % ", ".join("?" * len(WINDOW_SOURCES)), WINDOW_SOURCES):
        cand = (WINDOW_SOURCES.index(source), -n, source, album_id)
        if key not in windowed or cand < windowed[key]:
            windowed[key] = cand
    out = {}
    for key in sorted(ok):
        if key in windowed:
            listing = windowed[key][2:]
            n = listings.get((key, *listing), {}).get("n_windows") or None
        elif named and key in named:
            listing, n = tuple(named[key]), clips
        else:
            listing, n = max(sorted(ok[key]), key=lambda l: len(ok[key][l])), clips
        tracks = ok[key].get(listing, [])
        if tracks:
            out[key] = (*listing, tracks if n is None else tracks[:n])
    return out


def feeding(picked: dict, catalog: list[str], keymap: KeyMap | None) -> dict[str, str]:
    """catalog key -> the cache key its mean is taken from: its own, or an older key of the album when its
    own has no clips (rmr_audio.modelstore.album_means)."""
    at = {k: k for k in picked}
    wanted = set(catalog)
    for old in sorted(set(at) - wanted) if keymap is not None else ():
        try:
            now = keymap.current(old)
        except StoreError:
            continue
        if now in wanted and now not in at:
            at[now] = old
    return {k: at[k] for k in catalog if k in at}


def store_model(audio_dir: Path) -> str:
    """The cache's name for the model a store's manifest names."""
    model_id = load_store(audio_dir).manifest["model"]
    names = [m.name for m in MODELS.values() if m.model_id == model_id]
    if not names:
        raise StoreError(f"{audio_dir}: the cache has no model {model_id!r}")
    return names[0]


def used_in_store(cache: OnePassCache, audio_dir: Path, catalog: list[str], matches: Path | None, overrides: Path | None,
                  keymap: KeyMap | None, verify: bool = False) -> tuple[set[tuple[str, str, str, str]], list[str]]:
    """(the clips the store's album means are taken from, as (key, source, listing id, track id); what does
    not agree between the store and the rule, one line each)."""
    store = load_store(audio_dir)
    model = store_model(audio_dir)
    spec = MODELS[model]
    picked = chosen(cache, model, int(store.manifest["clips"]["per_album"]), listing_of(matches, cache, model, overrides, keymap))
    feeds = feeding(picked, catalog, keymap)
    used, odd = set(), []
    for i, key in enumerate(store.keys.tolist()):
        if key not in feeds:
            odd.append(f"{key}: in {audio_dir.name}, and the cache has no ok {model} clip for it")
            continue
        source, album_id, tracks = picked[feeds[key]]
        if len(tracks) != int(store.n_clips[i]) or source != str(store.source[i]):
            odd.append(f"{key}: {audio_dir.name} has {int(store.n_clips[i])} clip(s) from {store.source[i]}, "
                       f"the cache gives {len(tracks)} from {source}")
        if verify:
            rows = dict(cache.con.execute(
                "SELECT track_id, emb FROM embeddings WHERE model = ? AND key = ? AND source = ? AND album_id = ? "
                "AND status = 'ok'", (model, feeds[key], source, album_id)))
            mean = np.stack([np.frombuffer(rows[t], spec.dtype).astype(np.float32) for t in tracks]).astype(np.float64).mean(axis=0)
            if not np.array_equal(mean.astype(np.float16), store.emb[i]):
                odd.append(f"{key}: the mean of these clips is not the vector {audio_dir.name} has")
        used.update((feeds[key], source, album_id, t) for t in tracks)
    return used, odd


def _num(x, places: int = 3) -> str:
    return "" if x is None else f"{round(float(x), places):.{places}f}".rstrip("0").rstrip(".")


def _int(x) -> str:
    return "" if x is None else str(int(x))


def tables(cache: OnePassCache, catalog: list[str], keymap: KeyMap | None, used: dict[str, set]) -> tuple[list[str], list[dict], list[dict]]:
    """(the clip table's columns, its rows, the listing table's rows)."""
    wanted = set(catalog)

    def rym_id(key: str) -> str:
        try:
            now = key if keymap is None else keymap.current(key)
        except StoreError:
            return ""
        return now if now in wanted else ""

    models = [m for m in MODELS if cache.con.execute("SELECT 1 FROM embeddings WHERE model = ? LIMIT 1", (m,)).fetchone()]
    results: dict[tuple, dict[str, tuple]] = {}
    for key, source, album_id, track_id, model, status, error, origin in cache.con.execute(
            "SELECT key, source, album_id, track_id, model, status, error, origin FROM embeddings"):
        results.setdefault((key, source, album_id, track_id), {})[model] = (status, error, origin)
    fields = CLIP_FIELDS + models + [f"{m}_origin" for m in models] + ["error"] + [f"in_{s}" for s in used] + ["cached_at"]
    clips = []
    for key, source, album_id, track_id, track_idx, prio, clip_s, track_s, short, start_s, sig, at in cache.con.execute(
            "SELECT key, source, album_id, track_id, track_idx, prio, clip_s, track_s, short_preview, start_s, sig, updated_at "
            "FROM clips ORDER BY key, source, album_id, prio IS NULL, prio, track_idx, track_id"):
        ident = (key, source, album_id, track_id)
        res = results.get(ident, {})
        row = {"key": key, "rym_id": rym_id(key), "source": source, "listing_id": album_id, "track_id": track_id,
               "track_idx": _int(track_idx), "prio": _int(prio), "start_s": _num(start_s), "clip_s": _num(clip_s),
               "track_s": _num(track_s), "short_preview": _int(short), "sig": sig or "",
               "error": "; ".join(f"{m}: {res[m][1]}" for m in models if m in res and res[m][1]), "cached_at": at or ""}
        for m in models:
            row[m], row[f"{m}_origin"] = (res[m][0], res[m][2] or "") if m in res else ("", "")
        for s, members in used.items():
            row[f"in_{s}"] = int(ident in members)
        clips.append(row)
    listings = [{"key": key, "rym_id": rym_id(key), "source": source, "listing_id": album_id, "n_tracks": _int(n_tracks),
                 "n_previews": _int(n_previews), "runtime_s": _num(runtime_s), "n_windows": _int(n_windows), "cached_at": at or ""}
                for key, source, album_id, n_tracks, n_previews, runtime_s, n_windows, at in cache.con.execute(
                    "SELECT key, source, album_id, n_tracks, n_previews, runtime_s, n_windows, updated_at FROM listings "
                    "ORDER BY key, source, album_id")]
    return fields, clips, listings


def _csv(fields: list[str], rows: list[dict]) -> str:
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return out.getvalue()


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="")
    os.replace(tmp, path)


def export(cache_db: Path = DEFAULT_CACHE_DB, out_csv: Path = DEFAULT_OUT, listings_csv: Path = DEFAULT_LISTINGS,
           catalog: Path = DEFAULT_CATALOG, matches: Path | None = DEFAULT_AUDIO / "matches.csv",
           overrides: Path | None = DEFAULT_AUDIO / "match_overrides.json", keys_csv: Path | None = DEFAULT_AUDIO / "keys.csv",
           stores: dict[str, Path] | None = None, verify: bool = False, dry_run: bool = False, out=print) -> int:
    """Write the two tables. Returns the number of albums where a committed store and the rule disagree."""
    stores = STORE_DIRS if stores is None else stores
    cat = catalog_keys(catalog)
    keymap = load_keys(Path(keys_csv)) if keys_csv is not None and Path(keys_csv).exists() else None
    cache = OnePassCache(cache_db, readonly=True)
    try:
        used, odd = {}, []
        for name, audio_dir in stores.items():
            used[name], lines = used_in_store(cache, audio_dir, cat, matches, overrides, keymap, verify)
            odd += lines
            out(f"{name}: {len(load_store(audio_dir).keys)} albums, {len(used[name])} clips in their means; "
                f"{len(lines)} album(s) do not agree with the cache" + (" (counts, sources and vectors)" if verify else ""))
        fields, clips, listings = tables(cache, cat, keymap, used)
    finally:
        cache.close()
    for line in odd:
        out("  " + line)
    by = Counter(r["source"].split(":")[0] for r in clips)
    out(f"{len(clips)} clips of {len({r['key'] for r in clips})} cache keys "
        f"({', '.join(f'{s}: {n}' for s, n in sorted(by.items()))}); {len(listings)} listings")
    if dry_run:
        out("dry run: nothing written")
        return len(odd)
    _write(Path(out_csv), _csv(fields, clips))
    _write(Path(listings_csv), _csv(LISTING_FIELDS, listings))
    out(f"wrote {out_csv} ({Path(out_csv).stat().st_size / 1e6:.1f} MB) and {listings_csv}")
    return len(odd)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_audio.clip_table",
                                description="The clip cache as committed tables, without the vectors.")
    p.add_argument("--cache", type=Path, default=DEFAULT_CACHE_DB, help="The one-pass cache (opened read-only).")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="The clip table (audio/clips.csv).")
    p.add_argument("--listings", type=Path, default=DEFAULT_LISTINGS, help="The listing table (audio/clip_listings.csv).")
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="The catalog table (catalog/albums.csv).")
    p.add_argument("--verify", action="store_true",
                   help="Also take every album mean again from the clips named and compare it with the committed vector.")
    p.add_argument("--dry-run", action="store_true", help="Print the counts and the checks; write nothing.")
    args = p.parse_args(argv)
    try:
        export(args.cache, args.out, args.listings, args.catalog, verify=args.verify, dry_run=args.dry_run)
    except (StoreError, FileNotFoundError) as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
