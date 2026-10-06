"""CLI: python -m rmr_pipeline.build --map-root PATH [--table PATH] [--out PATH] [--overrides PATH]
                                    [--audio-dir PATH] [--hub-correction STOPS] [--skip-images]
                                    [--catalog --out PATH [--catalog-path CSV] [--descriptor-weights PROFILE]
                                     [--existing-descriptors SOURCE]]

--catalog builds every album of catalog/albums.csv (rmr_pipeline.catalog) instead of the feature table's.
It never writes into frontcreck/public/data."""
import argparse
import sys
import time
from pathlib import Path

from .artists import clean_artist
from .audio import DEFAULT_CATALOG, audio_block, site_matrix
from .audio_store import STORES, StoreError, site_store
from .catalog import (EXISTING, WEIGHT_PROFILES, CatalogError, catalog_frame, load_catalog, neighbour_clusters,
                      new_album_cover)
from .colors import ambient_from_image
from .constants import (DEFAULT_OUT, DEFAULT_OVERRIDES, DEFAULT_TABLE, FALLBACK_AMBIENT, SLIDER, STOPS, THUMB_COLS,
                        THUMB_ROWS)
from .images import load_album_sprites, write_sheets
from .io import write_json
from .layout import build_layouts, flat_positions
from .mapsource import MapSource, load_cover_ids, load_metadata
from .overrides import apply_overrides, load_overrides, slugs_after_overrides
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
    p.add_argument("--audio-dir", type=Path, default=None,
                   help="The audio store: embeddings, manifest and transform.npz (default: the store of "
                        "audio_store.SITE_MODEL, data-pipeline/audio while that is effnet; with --catalog, "
                        "the effnet10k store).")
    p.add_argument("--catalog", action="store_true",
                   help="Build every album of the catalog table, keyed by RYM id, instead of the feature table's "
                        "albums. Needs an explicit --out that is not frontcreck/public/data.")
    p.add_argument("--catalog-path", type=Path, default=DEFAULT_CATALOG, help="With --catalog: the catalog table.")
    p.add_argument("--descriptor-weights", choices=tuple(WEIGHT_PROFILES), default=None,
                   help="With --catalog: the weight of an album's eight descriptors by place (default rank, the "
                        "feature table's).")
    p.add_argument("--existing-descriptors", choices=EXISTING, default=None,
                   help="With --catalog: where an existing album's eight descriptors come from (default "
                        "table-novocals; see rmr_pipeline.catalog).")
    p.add_argument("--hub-correction", default="", metavar="STOPS",
                   help="Comma-separated stops whose recommendations rank by mutual proximity instead of the raw "
                        "distance (for example: balanced). Off by default.")
    p.add_argument("--skip-images", action="store_true",
                   help="Fast run for development: keep fallback ambient colours and do not write sprite sheets. "
                        "Needs an explicit --out so the committed albums.json keeps its extracted colours.")
    args = p.parse_args(argv)
    if args.catalog:
        if args.out is None:
            p.error("--catalog needs an explicit --out folder")
        if args.out.resolve() == DEFAULT_OUT.resolve() or DEFAULT_OUT.resolve() in args.out.resolve().parents:
            p.error(f"--catalog does not write into {DEFAULT_OUT}: switching the site to the catalog build needs "
                    "the owner's go-ahead. Pass another --out folder")
        args.audio_dir = args.audio_dir or STORES["effnet10k"]
        args.descriptor_weights = args.descriptor_weights or "rank"
        args.existing_descriptors = args.existing_descriptors or "table-novocals"
    elif args.descriptor_weights or args.existing_descriptors or args.catalog_path != DEFAULT_CATALOG:
        p.error("--catalog-path, --descriptor-weights and --existing-descriptors need --catalog")
    args.audio_dir = args.audio_dir or site_store()
    args.hub_correction = tuple(s for s in args.hub_correction.split(",") if s)
    unknown = [s for s in args.hub_correction if s not in STOPS]
    if unknown:
        p.error(f"--hub-correction: unknown stop {unknown[0]!r} (choose from {', '.join(STOPS)})")
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
    if missing and args.catalog:
        print(f"{len(missing)} albums of the feature table are not on the map: {missing[:5]}. The catalog build "
              "keeps every album at its catalog row, so it cannot drop them", file=sys.stderr)
        return 1
    if missing:
        print(f"{len(missing)} albums are not on the map and are dropped: {missing[:5]}", file=sys.stderr)
        keep = [i for i, u in enumerate(sub["URI"]) if u in meta]
        sub = sub.iloc[keep].reset_index(drop=True)
        rows = [rows[i] for i in keep]
    uris = [str(u) for u in sub["URI"]]
    clusters = [int(meta[u]["clusterId"]) for u in uris]
    cover_by_uri = load_cover_ids(src)
    print(f"catalog: {len(sub)} albums ({len(df) - len(sub)} table rows dropped)")

    titles = [str(t) for t in sub["Title"]]
    artists = [clean_artist(a) for a in sub["Artist"].astype(str)]
    cover_ids, spotify_ids = [cover_by_uri.get(u, "") for u in uris], [u.split(":")[-1] for u in uris]
    slug_titles, slug_artists = titles, artists  # what the slugs are made from
    keys, places, new_images, n_site = None, None, {}, len(sub)
    if args.catalog:
        try:
            cat = catalog_frame(sub, load_catalog(args.catalog_path), weights=args.descriptor_weights,
                                existing=args.existing_descriptors)
        except CatalogError as e:
            print(f"catalog: {e}", file=sys.stderr)
            return 1
        print(cat.summary())
        if not args.skip_images and len(cat.keys) > THUMB_COLS * THUMB_ROWS:
            print(f"--catalog without --skip-images is not possible yet: {len(cat.keys)} albums do not fit one "
                  f"{THUMB_COLS}x{THUMB_ROWS} thumbnail sheet (several sheets are still to come)", file=sys.stderr)
            return 1
        # The site's albums keep their rows; the new albums follow them.
        sub, keys, places, spotify_ids = cat.frame, cat.keys, cat.places, cat.spotify_ids
        new_keys = keys[n_site:]
        uris = uris + [""] * len(new_keys)
        titles, artists = titles + list(sub["Title"][n_site:]), artists + list(sub["Artist"][n_site:])
        slug_titles, slug_artists = cat.slug_titles, artists[:n_site] + cat.slug_artists[n_site:]
        for i, (cover, image) in enumerate(map(new_album_cover, new_keys), start=n_site):
            cover_ids.append(cover)
            if image is not None:
                new_images[i] = image

    slugs = make_slugs(slug_titles, slug_artists)  # overrides.json is keyed by these
    overrides = load_overrides(args.overrides)
    covers, spotify_ids, override_images, artists = apply_overrides(
        slugs, cover_ids, spotify_ids, overrides, args.overrides.parent, artists=artists)
    override_images = {**new_images, **override_images}
    changed = {slugs.index(k) for k, e in overrides.items() if "a" in e}
    slugs = slugs_after_overrides(slug_titles, [artists[i] if i in changed else a for i, a in enumerate(slug_artists)],
                                  slugs, changed)
    if args.catalog:
        site_slugs = make_slugs(titles[:n_site], artists[:n_site])  # what the build without --catalog gives them
        moved = [f"{a!r} -> {b!r}" for a, b in zip(site_slugs, slugs) if a != b]
        if moved:
            raise ValueError(f"the catalog build changes the slug of {len(moved)} album(s) of the site: "
                             + ", ".join(moved[:5]))
    vocab, tops = build_vocab(sub, places)
    try:
        audio = audio_block(sub, args.audio_dir, keys)
    except StoreError as e:
        print(f"audio store: {e}", file=sys.stderr)
        return 1
    print(audio.summary() + (f"; hub correction at {', '.join(args.hub_correction)}" if args.hub_correction else ""))
    if args.catalog:  # until the new albums have clusters of their own
        clusters = clusters + neighbour_clusters(site_matrix(sub, audio.block, SLIDER["balanced"]), clusters)
    t1 = time.time()
    recs = build_recs(sub, audio.block, args.hub_correction, has_audio=audio.has_audio)
    t2 = time.time()
    layouts = build_layouts(sub, audio.block, has_audio=audio.has_audio)
    print(f"recs and layouts done ({time.time() - t0:.0f}s: recs {t2 - t1:.0f}s, layouts {time.time() - t2:.0f}s)")

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
