"""CLI: python -m rmr_pipeline.build --map-root PATH [--table PATH] [--out PATH]"""
import argparse
import sys
import time
from pathlib import Path

from .constants import DEFAULT_OUT, DEFAULT_TABLE, FALLBACK_AMBIENT, STOPS
from .io import write_json
from .layout import build_layouts, flat_positions
from .mapsource import MapSource, load_cover_ids, load_metadata
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
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output folder (frontcreck/public/data).")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    t0 = time.time()
    src = MapSource(args.map_root)
    src.check(need_atlases=False)

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
    covers = load_cover_ids(src)
    print(f"catalog: {len(sub)} albums ({len(df) - len(sub)} table rows dropped)")

    slugs = make_slugs(sub["Title"].astype(str), sub["Artist"].astype(str))
    vocab, tops = build_vocab(sub)
    recs = build_recs(sub)
    print(f"recs done ({time.time() - t0:.0f}s)")
    layouts = build_layouts(sub)
    print(f"layouts done ({time.time() - t0:.0f}s)")

    albums = []
    for r in range(len(sub)):
        k = int(meta[uris[r]]["clusterId"])
        albums.append({
            "slug": slugs[r],
            "t": str(sub.loc[r, "Title"]),
            "a": str(sub.loc[r, "Artist"]),
            "s": uris[r].split(":")[-1],
            "c": covers.get(uris[r], ""),
            "k": k,
            "d": tops[r],
            "w": list(FALLBACK_AMBIENT[k % 3]),
        })

    out = args.out
    sizes = {
        "albums.json": write_json(out / "albums.json", albums),
        "vocab.json": write_json(out / "vocab.json", vocab),
        "positions.json": write_json(out / "positions.json", {s: flat_positions(layouts[s]) for s in STOPS}),
        "recs.json": write_json(out / "recs.json", {s: recs[s].tolist() for s in STOPS}),
    }
    for name, size in sizes.items():
        print(f"wrote {name}: {size / 1e6:.2f} MB")
    print(validate_dir(out))
    print(f"done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
