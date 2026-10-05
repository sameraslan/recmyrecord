"""A committed store for one embedding model, written whole from the one-pass clip cache: today the CLAP
store, data-pipeline/audio/clap/ (embeddings/, manifest.json; its transform.npz is fitted afterwards by
`python -m rmr_pipeline.audio fit-catalog --audio-dir audio/clap`).

  python -m rmr_audio.modelstore write  [--model clap|clap_mp3] [--clips 4] [--cache SQLITE] [--catalog CSV]
                                        [--matches CSV] [--keys-csv CSV] [--audio-dir DIR] [--dry-run]
  python -m rmr_audio.modelstore status [--model clap|clap_mp3] [--audio-dir DIR] [--catalog CSV]

--model clap_mp3 writes the store from the cache's `clap_mp3` rows (the variant of rmr_audio.mp3trip; its
Deezer clips are the clap vectors, copied by `rmr_audio.onepass copy`). It has no committed store of its
own, so --audio-dir must say where (audio/clap to put it in the CLAP store's place, or any other folder
to look at it first); its manifest names the variant as the model.

`write` reads the cache strictly read-only (`mode=ro`; another job may be writing to it), the catalog
table and matches.csv as they are when it runs, and makes the store exactly the catalog's albums that
have an ok clip for the model, in catalog order. It can be run again at any time: a store that already
holds exactly that is not touched, anything else is replaced whole (audio_store.replace_store). It never
writes the EffNet store, matches.csv or keys.csv. No model is loaded and nothing is downloaded: numpy only,
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
  matches.csv names when that listing has an ok clip, else the listing with the most ok clips. `source`
  records which.
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
from rmr_pipeline.audio_store import DEFAULT_AUDIO, STORES, StoreError, load_store, replace_store
from rmr_pipeline.constants import PIPELINE_DIR
from rmr_pipeline.keys import load_keys

from .onepass_cache import MODELS, OnePassCache

DEFAULT_CACHE_DB = PIPELINE_DIR / ".cache" / "audio" / "onepass.sqlite"  # as rmr_audio.onepass.DEFAULT_OUT
CLIPS = 4  # the standard: four clips per album, no top-up
POOL = "rank"
ORDER = ("the first track, then tracks spread evenly through the album (bit-reversal order), so fewer clips are a "
         "prefix of more")
POOLING = ("the plain mean (float64, not renormalised) of the album's first {clips} ok clips in rank order, from one "
           "listing; windows of full-length audio (local, youtube, bandcamp) replace the previews and the mean then "
           "takes every window; stored as float16")


def listing_of(matches: Path | None, cache: OnePassCache, model: str) -> dict[str, tuple[str, str]]:
    """key -> (source, album id) from a matches.csv-shaped file, for the albums whose named listing has
    an ok clip for the model. An album whose named listing has none is left out, so that the mean falls
    back on the listing with the most ok clips instead of losing the album."""
    if matches is None or not Path(matches).exists():
        return {}
    has = {tuple(r) for r in cache.con.execute(
        "SELECT DISTINCT key, source, album_id FROM embeddings WHERE model = ? AND status = 'ok'", (model,))}
    with open(matches, newline="", encoding="utf-8") as f:
        return {r["key"]: (r["source"], r["source_album_id"]) for r in csv.DictReader(f)
                if r["source"] and (r["key"], r["source"], r["source_album_id"]) in has}


def album_means(cache: OnePassCache, model: str, catalog: list[str], matches: Path | None = None,
                clips: int = CLIPS, keys_csv: Path | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict]:
    """(keys, X float64, n_clips, source, counts) for the catalog's albums with an ok clip, in catalog
    order, under their catalog keys. `counts` says what was left out (albums of the cache the catalog does
    not have) and how many albums were found under an older key through `keys_csv`."""
    keys, X, n, source = cache.means(model, clips, POOL, listing_of(matches, cache, model))
    at = {k: i for i, k in enumerate(keys.tolist())}
    wanted, followed = set(catalog), 0
    if keys_csv is not None and Path(keys_csv).exists():
        keymap = load_keys(Path(keys_csv))
        for old in sorted(set(at) - wanted):
            try:
                now = keymap.current(old)
            except StoreError:
                continue
            if now in wanted and now not in at:  # the album's own key has no clips: these are its clips
                at[now] = at[old]
                followed += 1
    seen: set[str] = set()
    names = [k for k in catalog if k in at and not (k in seen or seen.add(k))]
    take = np.array([at[k] for k in names], dtype=np.int64)
    counts = {"catalog": len(catalog), "in_cache": len(keys), "written": len(take), "followed": followed,
              "not_in_catalog": len(keys) - len(take)}
    return np.array(names, dtype=np.str_), X[take], n[take], source[take], counts


def write(model: str = "clap", clips: int = CLIPS, cache_db: Path = DEFAULT_CACHE_DB, catalog: Path = DEFAULT_CATALOG,
          matches: Path | None = DEFAULT_AUDIO / "matches.csv", audio_dir: Path | None = None, dry_run: bool = False,
          out=print, keys_csv: Path | None = DEFAULT_AUDIO / "keys.csv") -> int:
    spec = MODELS[model]
    audio_dir = store_dir(model, audio_dir)
    if audio_dir.resolve() == DEFAULT_AUDIO.resolve():
        raise StoreError(f"{audio_dir} is the EffNet store, which `rmr_audio sync` writes; give another --audio-dir")
    cache = OnePassCache(cache_db, readonly=True)
    try:
        keys, X, n, source, counts = album_means(cache, model, catalog_keys(catalog), matches, clips, keys_csv)
    finally:
        cache.close()
    if not len(keys):
        raise StoreError(f"{cache_db} has no ok {model} clip for an album of {catalog}")
    out(f"{model} ({spec.model_id}, {spec.dim} numbers): {counts['written']} of the catalog's {counts['catalog']} albums "
        f"have audio ({counts['followed']} found under an older key through keys.csv); {counts['not_in_catalog']} "
        f"album(s) of the cache are not in the catalog and are left out")
    out("clips per album: " + ", ".join(f"{c}: {k}" for c, k in sorted(Counter(n.tolist()).items())))
    out("source: " + ", ".join(f"{s}: {k}" for s, k in sorted(Counter(x.split(':')[0] for x in source.tolist()).items())))
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
    if model not in STORES:
        raise StoreError(f"{model} has no committed store of its own: say where with --audio-dir")
    return STORES[model]


def status(model: str, audio_dir: Path | None, catalog: Path, out=print) -> int:
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
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_audio.modelstore",
                                description="A model's committed store, written whole from the one-pass clip cache.")
    p.add_argument("cmd", choices=("write", "status"))
    p.add_argument("--model", choices=tuple(m for m in MODELS if m != "effnet"), default="clap")
    p.add_argument("--clips", type=int, default=CLIPS, help="Clips per album (default 4, the standard).")
    p.add_argument("--cache", type=Path, default=DEFAULT_CACHE_DB, help="The one-pass cache (opened read-only).")
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="The catalog table (catalog/albums.csv).")
    p.add_argument("--matches", type=Path, default=DEFAULT_AUDIO / "matches.csv",
                   help="Which listing each album's mean is taken from.")
    p.add_argument("--keys-csv", type=Path, default=DEFAULT_AUDIO / "keys.csv",
                   help="Follows a cache key the catalog no longer has to the album's current key.")
    p.add_argument("--audio-dir", type=Path, default=None, help="The store to write (default: audio/<model>).")
    p.add_argument("--dry-run", action="store_true", help="Print what would be written; write nothing.")
    args = p.parse_args(argv)
    try:
        if args.cmd == "status":
            return status(args.model, args.audio_dir, args.catalog)
        if args.clips < 1:
            p.error("--clips must be at least 1")
        return write(args.model, args.clips, args.cache, args.catalog, args.matches, args.audio_dir, args.dry_run,
                     keys_csv=args.keys_csv)
    except (StoreError, FileNotFoundError) as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
