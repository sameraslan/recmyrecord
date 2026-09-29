"""CLI: python -m rmr_pipeline.build --map-root PATH [--table PATH] [--out PATH] [--overrides PATH] [--skip-images]"""
import argparse
import sys
import time
from pathlib import Path

from .artists import clean_artist
from .colors import ambient_from_image
from .constants import DEFAULT_OUT, DEFAULT_OVERRIDES, DEFAULT_TABLE, FALLBACK_AMBIENT, STOPS
from .images import load_album_sprites, write_sheets
from .io import write_json
from .layout import build_layouts, flat_positions
from .mapsource import MapSource, load_cover_ids, load_metadata
from .overrides import apply_overrides, load_overrides
from .recs import build_recs
from .slugs import make_slugs
from .table import dedupe_table, load_table
from .validate import validate_dir
from .vocab import build_vocab


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m rmr_pipeline.build",
                                description="Build frontcreck/public/data from the feature table and the map outputs.")
    p.add_argument("--map-root", type=Path, required=True,
                   help="Root of the personal-site music_map worktree (has public/data and pipeline/outputs).")
    p.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="Feature table pickle (read-only).")
    p.add_argument("--out", type=Path, default=None,
                   help="Output folder (default frontcreck/public/data). Required with --skip-images.")
    p.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES, help="Manual corrections keyed by slug.")
    p.add_argument("--skip-images", action="store_true",
                   help="Fast run for development: keep fallback ambient colours and do not write sprite sheets. "
                        "Needs an explicit --out so the committed albums.json keeps its extracted colours.")
    args = p.parse_args(argv)
    if args.out is None:
        if args.skip_images:
            p.error("--skip-images writes fallback ambient colours; pass an explicit --out folder so the "
                    "committed albums.json is not overwritten")
        args.out = DEFAULT_OUT
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    t0 = time.time()
    src = MapSource(args.map_root)
    src.check(need_atlases=not args.skip_images)

    df = load_table(args.table)
    sub, rows = dedupe_table(df)
    meta = load_metadata(src)
    missing = [u for u in sub["URI"] if u not in meta]
    if missing:
        print(f"{len(missing)} albums are not on the map and are dropped: {missing[:5]}", file=sys.stderr)
        keep = [i for i, u in enumerate(sub["URI"]) if u in meta]
        sub = sub.iloc[keep].reset_index(drop=True)
        rows = [rows[i] for i in keep]
    uris = [str(u) for u in sub["URI"]]
    clusters = [int(meta[u]["clusterId"]) for u in uris]
    cover_by_uri = load_cover_ids(src)
    print(f"catalog: {len(sub)} albums ({len(df) - len(sub)} table rows dropped)")

    artists = [clean_artist(a) for a in sub["Artist"].astype(str)]
    slugs = make_slugs(sub["Title"].astype(str), artists)
    covers, spotify_ids, override_images = apply_overrides(
        slugs, [cover_by_uri.get(u, "") for u in uris], [u.split(":")[-1] for u in uris],
        load_overrides(args.overrides), args.overrides.parent)
    vocab, tops = build_vocab(sub)
    recs = build_recs(sub)
    layouts = build_layouts(sub)
    print(f"recs and layouts done ({time.time() - t0:.0f}s)")

    ambient = [FALLBACK_AMBIENT[k % 3] for k in clusters]
    out = args.out
    if not args.skip_images:
        sprites = load_album_sprites(src, uris, meta, covers, clusters, override_images)
        ambient = [ambient_from_image(sprites[i], clusters[i]) if (covers[i] or i in override_images)
                   else FALLBACK_AMBIENT[clusters[i] % 3] for i in range(len(uris))]
        for name, size in write_sheets(out, sprites).items():
            print(f"wrote {name}: {size / 1e6:.2f} MB")

    albums = [{
        "slug": slugs[r],
        "t": str(sub.loc[r, "Title"]),
        "a": artists[r],
        "s": spotify_ids[r],
        "c": covers[r],
        "k": clusters[r],
        "d": tops[r],
        "w": list(ambient[r]),
    } for r in range(len(sub))]

    sizes = {
        "albums.json": write_json(out / "albums.json", albums),
        "vocab.json": write_json(out / "vocab.json", vocab),
        "positions.json": write_json(out / "positions.json", {s: flat_positions(layouts[s]) for s in STOPS}),
        "recs.json": write_json(out / "recs.json", {s: recs[s].tolist() for s in STOPS}),
    }
    for name, size in sizes.items():
        print(f"wrote {name}: {size / 1e6:.2f} MB")
    print(validate_dir(out, images=not args.skip_images))
    print(f"done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
