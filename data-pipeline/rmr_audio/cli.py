"""CLI of the audio stage. Run from data-pipeline/ with the audio venv:

  .venv-audio/bin/python -m rmr_audio sync [--clips N] [--keys K,...] [--limit N] [--workers 2]
                                           [--local-dir DIR] [--storefronts us,gb,jp,...]
                                           [--retry-unmatched] [--dry-run]
  .venv-audio/bin/python -m rmr_audio match [--keys K,...] [--retry-unmatched] [--storefronts ...]
  .venv-audio/bin/python -m rmr_audio status [--missing]
  .venv-audio/bin/python -m rmr_audio compact
  .venv-audio/bin/python -m rmr_audio import-experiment
"""
import argparse
import re
import sys
from pathlib import Path

from rmr_pipeline.audio_store import DEFAULT_AUDIO, StoreError, compact_store, load_manifest
from rmr_pipeline.constants import DEFAULT_OVERRIDES, DEFAULT_TABLE

from .catalog import DEFAULT_CACHE, load_catalog
from .match import DEFAULT_STOREFRONTS


def _storefronts(text: str) -> tuple[str, ...]:
    out = tuple(s.strip().lower() for s in text.split(",") if s.strip())
    if not out or not all(re.fullmatch(r"[a-z]{2}", s) for s in out):
        raise argparse.ArgumentTypeError("two-letter storefront codes, comma-separated (us,gb,jp)")
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m rmr_audio", description="The audio stage: clips to album embeddings.")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO, help="The store (default data-pipeline/audio).")
    common.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="Feature table pickle (read-only).")
    common.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES,
                        help="The build's overrides.json (artist corrections, slugs).")
    common.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE,
                        help="Local cache: clips.sqlite, http.sqlite, models/ (default data-pipeline/.cache/audio).")
    sub = p.add_subparsers(dest="cmd", required=True)

    select = argparse.ArgumentParser(add_help=False)
    select.add_argument("--keys", default="", help="Only these albums: comma-separated keys (URIs) or slugs.")
    select.add_argument("--limit", type=int, default=None, help="At most N albums with work to do.")
    select.add_argument("--storefronts", type=_storefronts, default=DEFAULT_STOREFRONTS,
                        help=f"iTunes storefronts to try, in order (default {','.join(DEFAULT_STOREFRONTS)}).")
    select.add_argument("--retry-unmatched", action="store_true",
                        help="Search again for the albums recorded as unmatched.")

    s = sub.add_parser("sync", parents=[common, select], help="Match, download and embed what the store is missing.")
    s.add_argument("--clips", type=int, default=None,
                   help="Clips per album (default: the store's policy in manifest.json). A larger number tops "
                        "every album up; run over the whole catalog, it becomes the policy.")
    s.add_argument("--workers", type=int, default=2, help="Worker processes, one thread each (default 2).")
    s.add_argument("--local-dir", type=Path, default=None,
                   help="Folder of local files: DIR/<album slug>/*.mp3|m4a|flac|wav|ogg|aiff, one excerpt per file.")
    s.add_argument("--dry-run", action="store_true", help="Print what would be done; no network, nothing written.")

    sub.add_parser("match", parents=[common, select],
                   help="Only ask the stores for the albums a sync would match, and print the verdicts; writes nothing "
                        "to the store.")
    t = sub.add_parser("status", parents=[common], help="Counts, and with --missing the albums without audio.")
    t.add_argument("--missing", action="store_true", help="List the albums without audio: slug<TAB>artist — title.")
    sub.add_parser("compact", parents=[common], help="Rewrite all shards into one.")
    sub.add_parser("import-experiment", parents=[common],
                   help="Seed the clip cache from experiments/preview_features/cache.")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    sys.stdout.reconfigure(line_buffering=True)
    try:
        if args.cmd == "compact":
            before = len(load_manifest(args.audio_dir)["shards"])
            path = compact_store(args.audio_dir, note=f"compacted from {before} shards")
            print(f"{before} shards -> {path.name}")
            return 0
        if args.cmd == "import-experiment":
            from .clips import ClipCache
            from .experiment import check_first_shard, import_experiment

            cache = ClipCache(args.cache_dir / "clips.sqlite")
            n = import_experiment(cache, args.table)
            print(f"{n} clips copied into {args.cache_dir / 'clips.sqlite'}")
            from .experiment import EXPERIMENT_CACHE
            from .match import import_responses

            n = import_responses(args.cache_dir / "http.sqlite", EXPERIMENT_CACHE / "match.sqlite", default_storefront="us")
            print(f"{n} API responses copied into {args.cache_dir / 'http.sqlite'}")
            checked = check_first_shard(cache, args.audio_dir)
            print(f"checked: the cached clips with prio < 4 give the first shard's {checked} album means exactly"
                  if checked is not None else "not checked against the first shard: the store was compacted since")
            cache.close()
            return 0
        catalog = load_catalog(args.table, args.overrides)
        if args.cmd == "status":
            from .status import status

            print(status(catalog, args.audio_dir, args.missing))
            return 0
        from .sync import Options, preview_matches, sync

        keys = tuple(k for k in args.keys.split(",") if k)
        if args.cmd == "match":
            return preview_matches(Options(args.audio_dir, args.cache_dir, keys=keys, limit=args.limit,
                                           storefronts=args.storefronts, retry_unmatched=args.retry_unmatched), catalog)
        if args.clips is not None and args.clips < 1:
            parser().error("--clips must be at least 1")
        return sync(Options(args.audio_dir, args.cache_dir, args.clips, keys, args.limit, max(1, args.workers),
                            args.local_dir, args.storefronts, args.retry_unmatched, args.dry_run), catalog)
    except StoreError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
