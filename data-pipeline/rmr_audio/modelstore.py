"""A committed store for one embedding model, written whole from the one-pass clip cache: the CLAP store,
data-pipeline/audio/clap/, and the 10k catalog's EffNet store, data-pipeline/audio/effnet10k/ (embeddings/,
manifest.json; the transform.npz is fitted afterwards by
`python -m rmr_pipeline.audio fit-catalog --audio-dir audio/clap`, or `audio/effnet10k`).

  python -m rmr_audio.modelstore write  [--model clap|clap_mp3|effnet] [--clips 4] [--cache SQLITE] [--catalog CSV]
                                        [--matches CSV] [--overrides JSON] [--keys-csv CSV] [--audio-dir DIR]
                                        [--exclusions CSV] [--exclude KEY[,KEY...]] [--dry-run]
  python -m rmr_audio.modelstore status [--model clap|clap_mp3|effnet] [--audio-dir DIR] [--catalog CSV]
                                        [--exclusions CSV] [--exclude KEY[,KEY...]]

--model clap_mp3 writes the store from the cache's `clap_mp3` rows (the variant of rmr_audio.mp3trip; its
Deezer clips are the clap vectors, copied by `rmr_audio.onepass copy`). It has no committed store of its
own, so --audio-dir must say where (audio/clap to put it in the CLAP store's place, or any other folder
to look at it first); its manifest names the variant as the model.

--model effnet writes a store from the cache's `effnet` rows, pooled as below. It needs --audio-dir too
(audio/effnet10k): EffNet's own folder is audio/, the store the site data is built from, which
`rmr_audio sync` writes and this never does.

`write` reads the cache strictly read-only (`mode=ro`; another job may be writing to it), the catalog
table, matches.csv and match_overrides.json as they are when it runs, and makes the store exactly the
catalog's albums that have an ok clip for the model, in catalog order, without the albums of
audio/store_exclusions.csv (key, reason, date: an album whose only audio is of another record). That file
is read by every `write`, so a plain `write` gives the committed store again; `--exclusions` names another
file, and `--exclude` leaves out more albums for one run. The summary line names the albums left out, and
`status` says whether any of them is in a store. It can be run again at any time: a store that already
holds exactly that is not touched, anything else is replaced whole (audio_store.replace_store). It never
writes audio/ itself (the site's EffNet store), matches.csv or keys.csv. No model is loaded and nothing is downloaded: numpy only,
so it runs in the build venv as well as the audio venv.

The pooling rule (OnePassCache.means, pool `rank`):
  album vector = the plain mean, taken in float64, of the per-clip vectors of the album's first `--clips`
  (4) ok clips in rank order (clips.prio: the first track, then tracks spread evenly). A clip that failed
  does not use up a place: the next one in rank order takes it. An album with fewer ok clips uses what it
  has; `n_clips` records how many. The mean is not renormalised here. A CLAP clip vector is itself the mean
  of three L2-normalised 10-second windows (clap_catalog.py's recipe); the block's transform takes the
  album vector's direction (rmr_pipeline.audio.unit), as clap_catalog.load's users did.
  One listing per album, never a mix: its windows of full-length audio when it has any (local files, then
  youtube, then bandcamp; the mean then takes every window the album has, not `--clips`), else the listing
  match_overrides.json forces when that listing has an ok clip for the model, else the listing matches.csv
  names when that listing has an ok clip, else the listing with the most ok clips. `source` records which.
  matches.csv says what the EffNet store was embedded from, so for an album whose listing was corrected
  by hand it still names the old one: the override comes first. While the override's listing has no ok
  clip the album stays on the other listing, and `write` prints how many such albums there are, and their
  keys.
  A cache key the catalog no longer has (a placeholder `sp:<id>` whose album has since been given its RYM
  id) is followed through keys.csv to the album's current key, unless that key has clips of its own.
  Against clap_catalog.load(4) (pool `below`: the ok clips with rank < 4): the same vector whenever the
  album's first four clips in rank order all worked. They differ only for an album where one of them
  failed and a later clip replaced it: `rank` then has four clips, `below` three.
The store keeps float16, like the EffNet store.
"""
import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from rmr_pipeline.audio import DEFAULT_CATALOG, catalog_keys
from rmr_pipeline.audio_store import (DEFAULT_AUDIO, STORES, StoreError, load_match_overrides, load_store,
                                      replace_store)
from rmr_pipeline.constants import PIPELINE_DIR
from rmr_pipeline.keys import RYM_ID_RE, KeyMap, is_placeholder, load_keys

from .onepass_cache import MODELS, WINDOW_SOURCES, OnePassCache

DEFAULT_CACHE_DB = PIPELINE_DIR / ".cache" / "audio" / "onepass.sqlite"  # as rmr_audio.onepass.DEFAULT_OUT
# The albums every store write leaves out, with the reason and the day it was decided: hand-edited.
DEFAULT_EXCLUSIONS = DEFAULT_AUDIO / "store_exclusions.csv"
EXCLUSION_FIELDS = ["key", "reason", "date"]
CLIPS = 4  # the standard: four clips per album, no top-up
POOL = "rank"
ORDER = ("the first track, then tracks spread evenly through the album (bit-reversal order), so fewer clips are a "
         "prefix of more")
POOLING = ("the plain mean (float64, not renormalised) of the album's first {clips} ok clips in rank order, from one "
           "listing; windows of full-length audio (local, youtube, bandcamp) replace the previews and the mean then "
           "takes every window; stored as float16")


def load_exclusions(path: Path | None = DEFAULT_EXCLUSIONS) -> tuple[str, ...]:
    """The keys of store_exclusions.csv, in its order. None: no file, no album left out. A file that is
    missing or not of this shape is an error: a write without it would bring the albums back."""
    if path is None:
        return ()
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
    except FileNotFoundError:
        raise StoreError(f"missing {path}: the albums every store write leaves out (key, reason, date)") from None
    if reader.fieldnames != EXCLUSION_FIELDS:
        raise StoreError(f"{path}: the columns must be {', '.join(EXCLUSION_FIELDS)}")
    keys = [r["key"] for r in rows]
    for n, r in enumerate(rows, start=2):
        if not (RYM_ID_RE.match(r["key"] or "") or is_placeholder(r["key"] or "")):
            raise StoreError(f"{path}, line {n}: {r['key']!r} is not an album key")
        if not (r["reason"] or "").strip():
            raise StoreError(f"{path}, line {n}: {r['key']} has no reason")
    if len(set(keys)) != len(keys):
        raise StoreError(f"{path}: an album is there twice")
    return tuple(keys)


def _left_out(excluded: list[str], listed: tuple[str, ...], name: str) -> str:
    """What left the albums out, for the summary line: the file, the flag, or both."""
    by = [name] * any(k in listed for k in excluded) + ["--exclude"] * any(k not in listed for k in excluded)
    return " and ".join(by)


def forced_listings(overrides: Path | None) -> dict[str, tuple[str, str]]:
    """key -> (source, album id) of the listings match_overrides.json forces. A {"skip": true} entry forces
    none. The file is keyed as the catalog is (scripts/rekey_audio_store.py rewrites it with the rest)."""
    if overrides is None:
        return {}
    return {k: (e["source"], e["album_id"]) for k, e in load_match_overrides(Path(overrides)).items() if not e.get("skip")}


def _current(keymap: KeyMap | None, key: str) -> str:
    try:
        return key if keymap is None else keymap.current(key)
    except StoreError:
        return key


def listing_of(matches: Path | None, cache: OnePassCache, model: str, overrides: Path | None = None,
               keymap: KeyMap | None = None) -> dict[str, tuple[str, str]]:
    """key -> (source, album id) of the listing an album's mean is taken from, for the albums that have one
    to prefer: the listing `overrides` (match_overrides.json) forces when it has an ok clip for the model,
    else the listing a matches.csv-shaped file names when that one has. An album with neither is left out,
    so that the mean falls back on the listing with the most ok clips instead of losing the album. A cache
    key of before a re-pairing takes the override of the album's current key (`keymap`, keys.csv)."""
    has = {tuple(r) for r in cache.con.execute(
        "SELECT DISTINCT key, source, album_id FROM embeddings WHERE model = ? AND status = 'ok'", (model,))}
    named: dict[str, tuple[str, str]] = {}
    if matches is not None and Path(matches).exists():
        with open(matches, newline="", encoding="utf-8") as f:
            named = {r["key"]: (r["source"], r["source_album_id"]) for r in csv.DictReader(f)
                     if r["source"] and (r["key"], r["source"], r["source_album_id"]) in has}
    forced = forced_listings(overrides)
    for key in sorted({h[0] for h in has}) if forced else ():
        listing = forced.get(key) or forced.get(_current(keymap, key))
        if listing and (key, *listing) in has:
            named[key] = listing
    return named


def album_means(cache: OnePassCache, model: str, catalog: list[str], matches: Path | None = None,
                clips: int = CLIPS, keys_csv: Path | None = None, overrides: Path | None = None,
                exclude: tuple[str, ...] = ()) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict]:
    """(keys, X float64, n_clips, source, counts) for the catalog's albums with an ok clip, in catalog
    order, under their catalog keys. `counts` says what was left out (albums of the cache the catalog does
    not have; `excluded`, the keys of `exclude` that had audio), how many albums were found under an older
    key through `keys_csv`, and `off_override`: the keys of the albums on a store listing other than the one
    `overrides` forces, because that one has no ok clip for the model."""
    keymap = load_keys(Path(keys_csv)) if keys_csv is not None and Path(keys_csv).exists() else None
    chosen = listing_of(matches, cache, model, overrides, keymap)
    keys, X, n, source = cache.means(model, clips, POOL, chosen)
    at = {k: i for i, k in enumerate(keys.tolist())}
    wanted, followed = set(catalog), 0
    for old in sorted(set(at) - wanted) if keymap is not None else ():
        try:
            now = keymap.current(old)
        except StoreError:
            continue
        if now in wanted and now not in at:  # the album's own key has no clips: these are its clips
            at[now] = at[old]
            followed += 1
    seen: set[str] = set()
    found = [k for k in catalog if k in at and not (k in seen or seen.add(k))]
    names = [k for k in found if k not in exclude]
    take = np.array([at[k] for k in names], dtype=np.int64)
    forced, cached = forced_listings(overrides), keys.tolist()
    off = [k for k in names if k in forced and source[at[k]] not in WINDOW_SOURCES and chosen.get(cached[at[k]]) != forced[k]]
    counts = {"catalog": len(catalog), "in_cache": len(keys), "written": len(take), "followed": followed,
              "not_in_catalog": len(keys) - len(found), "excluded": [k for k in found if k in exclude], "off_override": off}
    return np.array(names, dtype=np.str_), X[take], n[take], source[take], counts


def write(model: str = "clap", clips: int = CLIPS, cache_db: Path = DEFAULT_CACHE_DB, catalog: Path = DEFAULT_CATALOG,
          matches: Path | None = DEFAULT_AUDIO / "matches.csv", audio_dir: Path | None = None, dry_run: bool = False,
          out=print, keys_csv: Path | None = DEFAULT_AUDIO / "keys.csv",
          overrides: Path | None = DEFAULT_AUDIO / "match_overrides.json", exclude: tuple[str, ...] = (),
          exclusions: Path | None = DEFAULT_EXCLUSIONS) -> int:
    spec = MODELS[model]
    listed = load_exclusions(exclusions)
    exclude = tuple(dict.fromkeys((*listed, *exclude)))
    audio_dir = store_dir(model, audio_dir)
    if audio_dir.resolve() == DEFAULT_AUDIO.resolve():
        raise StoreError(f"{audio_dir} is the EffNet store, which `rmr_audio sync` writes; give another --audio-dir")
    cache = OnePassCache(cache_db, readonly=True)
    try:
        keys, X, n, source, counts = album_means(cache, model, catalog_keys(catalog), matches, clips, keys_csv,
                                                 overrides, exclude)
    finally:
        cache.close()
    if not len(keys):
        raise StoreError(f"{cache_db} has no ok {model} clip for an album of {catalog}")
    out(f"{model} ({spec.model_id}, {spec.dim} numbers): {counts['written']} of the catalog's {counts['catalog']} albums "
        f"have audio ({counts['followed']} found under an older key through keys.csv); {counts['not_in_catalog']} "
        f"album(s) of the cache are not in the catalog and are left out"
        + (f"; {len(counts['excluded'])} left out by {_left_out(counts['excluded'], listed, Path(exclusions or '').name)} "
           f"({', '.join(counts['excluded'])})" if counts["excluded"] else ""))
    out("clips per album: " + ", ".join(f"{c}: {k}" for c, k in sorted(Counter(n.tolist()).items())))
    out("source: " + ", ".join(f"{s}: {k}" for s, k in sorted(Counter(x.split(':')[0] for x in source.tolist()).items())))
    if counts["off_override"]:
        out(f"{len(counts['off_override'])} album(s) are on a listing other than the one match_overrides.json forces, "
            f"which has no ok {model} clip (embed it, then write again): {', '.join(counts['off_override'])}")
    if dry_run:
        out("dry run: nothing written")
        return 0
    path = replace_store(audio_dir, spec.model_id, spec.dim, {"per_album": clips, "order": ORDER}, keys, X, n, source,
                         note=f"album means of the one-pass clip cache, {clips} clips per album (rmr_audio.modelstore write)",
                         extra={"pooling": POOLING.format(clips=clips)})
    out(f"{audio_dir}: already holds exactly this; nothing written" if path is None else
        f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB) and {audio_dir / 'manifest.json'}; fit its transform next: "
        f"python -m rmr_pipeline.audio fit-catalog --audio-dir {audio_dir}")
    return 0


def store_dir(model: str, audio_dir: Path | None) -> Path:
    if audio_dir is not None:
        return Path(audio_dir)
    if model == "effnet":  # STORES["effnet"] is audio/, which `rmr_audio sync` writes
        raise StoreError("effnet's own store is audio/, the site's: say where with --audio-dir (audio/effnet10k)")
    if model not in STORES:
        raise StoreError(f"{model} has no committed store of its own: say where with --audio-dir")
    return STORES[model]


def status(model: str, audio_dir: Path | None, catalog: Path, out=print, exclude: tuple[str, ...] = (),
           exclusions: Path | None = DEFAULT_EXCLUSIONS) -> int:
    listed = load_exclusions(exclusions)
    audio_dir = store_dir(model, audio_dir)
    store = load_store(audio_dir)
    cat = catalog_keys(catalog)
    rows = store.rows(cat)
    out(f"{audio_dir}: {store.manifest['model']}, {store.dim} numbers, {len(store.keys)} albums, "
        f"{len(store.manifest['shards'])} shard(s); {int((rows >= 0).sum())} of the catalog's {len(cat)} albums have audio, "
        f"{len(store.keys) - len(set(store.keys.tolist()) & set(cat))} stored album(s) are not in the catalog")
    out("clips per album: " + ", ".join(f"{c}: {k}" for c, k in sorted(Counter(store.n_clips.tolist()).items())))
    out("source: " + ", ".join(f"{s}: {k}" for s, k in sorted(Counter(x.split(':')[0] for x in store.source.tolist()).items())))
    out(f"transform.npz: {'there' if (audio_dir / 'transform.npz').exists() else 'not fitted yet'}")
    for name, keys in ((Path(exclusions or "").name, listed), ("--exclude", exclude)):
        if keys:
            there = [k for k in keys if k in set(store.keys.tolist())]
            out(f"{name}: {len(there) or 'none'} of the {len(keys)} album(s) is in the store"
                + (f": {', '.join(there)}" if there else ""))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_audio.modelstore",
                                description="A model's committed store, written whole from the one-pass clip cache.")
    p.add_argument("cmd", choices=("write", "status"))
    p.add_argument("--model", choices=tuple(MODELS), default="clap")
    p.add_argument("--clips", type=int, default=CLIPS, help="Clips per album (default 4, the standard).")
    p.add_argument("--cache", type=Path, default=DEFAULT_CACHE_DB, help="The one-pass cache (opened read-only).")
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="The catalog table (catalog/albums.csv).")
    p.add_argument("--matches", type=Path, default=DEFAULT_AUDIO / "matches.csv",
                   help="Which listing each album's mean is taken from.")
    p.add_argument("--overrides", type=Path, default=DEFAULT_AUDIO / "match_overrides.json",
                   help="The listings forced by hand: they come before the ones --matches names.")
    p.add_argument("--keys-csv", type=Path, default=DEFAULT_AUDIO / "keys.csv",
                   help="Follows a cache key the catalog no longer has to the album's current key.")
    p.add_argument("--audio-dir", type=Path, default=None, help="The store to write (default: audio/clap for clap; the others have none).")
    p.add_argument("--exclusions", type=Path, default=DEFAULT_EXCLUSIONS,
                   help="The albums every write leaves out (default audio/store_exclusions.csv: key, reason, date).")
    p.add_argument("--exclude", default="", metavar="KEY[,KEY...]",
                   help="write: more albums to leave out of the store, for this run. status: say whether they are in it.")
    p.add_argument("--dry-run", action="store_true", help="Print what would be written; write nothing.")
    args = p.parse_args(argv)
    exclude = tuple(dict.fromkeys(k.strip() for k in args.exclude.split(",") if k.strip()))
    try:
        if args.cmd == "status":
            return status(args.model, args.audio_dir, args.catalog, exclude=exclude, exclusions=args.exclusions)
        if args.clips < 1:
            p.error("--clips must be at least 1")
        return write(args.model, args.clips, args.cache, args.catalog, args.matches, args.audio_dir, args.dry_run,
                     keys_csv=args.keys_csv, overrides=args.overrides, exclude=exclude, exclusions=args.exclusions)
    except (StoreError, FileNotFoundError) as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
