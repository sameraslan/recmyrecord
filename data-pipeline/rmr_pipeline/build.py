"""CLI: python -m rmr_pipeline.build --map-root PATH [--table PATH] [--out PATH] [--overrides PATH]
                                    [--audio-dir PATH] [--hub-correction STOPS] [--skip-images]
                                    [--catalog --out PATH [--catalog-path CSV] [--descriptor-weights PROFILE]
                                     [--existing-descriptors SOURCE] [--require-sprites]]

--catalog builds every album of catalog/albums.csv (rmr_pipeline.catalog) instead of the feature table's.
It never writes into frontcreck/public/data. What it adds to the site's data (README, Catalog mode):
covers of the new albums (rmr_pipeline.covers), listen links `l` for an album with no Spotify id
(rmr_pipeline.links), the artist form `native [Latin]` of a new album (catalog.display_artist), and the
mood-only rule for an album with no audio (`n`; audio.mean_fill, recs.build_recs, recs.no_audio_columns,
layout.build_layouts)."""
import argparse
import json
import sys
import time
from pathlib import Path

from .artists import clean_artist
from .audio import DEFAULT_CATALOG, audio_block, descriptors, site_matrix
from .audio_store import STORES, StoreError, site_store
from .catalog import (DEFAULT_EXISTING, DEFAULT_WEIGHTS, EXISTING, WEIGHT_PROFILES, CatalogError, catalog_frame, covers_table,
                      display_artist, load_catalog, neighbour_clusters, new_album_covers, shared_spotify_ids,
                      shared_spotify_lines)
from .colors import ambient_from_image
from .constants import DEFAULT_OUT, DEFAULT_OVERRIDES, DEFAULT_TABLE, FALLBACK_AMBIENT, SLIDER, STOPS
from .images import load_album_sprites, write_sheets
from .io import write_json
from .layout import build_layouts, flat_positions
from .links import LINK_COLUMNS, album_links
from .mapsource import MapSource, load_cover_ids, load_metadata
from .overrides import apply_overrides, load_overrides, slugs_after_overrides
from .recs import build_recs, rec_lists
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
                   help="With --catalog: the weight of an album's eight descriptors by place (default slope, 1 down "
                        "to 0.5; rank is the feature table's 1.5 down to 1.33).")
    p.add_argument("--existing-descriptors", choices=EXISTING, default=None,
                   help="With --catalog: where an existing album's eight descriptors come from (default "
                        "table-novocals, the vocals descriptors dropped; see rmr_pipeline.catalog).")
    p.add_argument("--require-sprites", action="store_true",
                   help="With --catalog: stop when catalog/covers.csv is missing, when a new album has a cover in it "
                        "and no sprite of that image in .cache/covers/96 (python -m rmr_pipeline.covers sprites), or "
                        "when a sprite has no entry in the manifest (covers adopt). An album whose image the state "
                        "file records as failed has no cover and is not counted. For the final build.")
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
        args.descriptor_weights = args.descriptor_weights or DEFAULT_WEIGHTS
        args.existing_descriptors = args.existing_descriptors or DEFAULT_EXISTING
    elif args.descriptor_weights or args.existing_descriptors or args.catalog_path != DEFAULT_CATALOG:
        p.error("--catalog-path, --descriptor-weights and --existing-descriptors need --catalog")
    elif args.require_sprites:
        p.error("--require-sprites needs --catalog")
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


def listen_links(catalog, spotify_ids: list[str]) -> tuple[dict[int, dict[str, str]], str]:
    """`l` of the albums with no Spotify id, from their catalog rows ({album number: {key: ref}}; an album
    with no other link has none), and a line of counts for the build's output."""
    links: dict[int, dict[str, str]] = {}
    per_key = dict.fromkeys(LINK_COLUMNS, 0)
    odd = dict.fromkeys(LINK_COLUMNS, 0)
    without = [i for i, s in enumerate(spotify_ids) if not s]
    for i, row in zip(without, catalog.iloc[without].to_dict("records")):
        found, left_out = album_links(row)
        for key in found:
            per_key[key] += 1
        for key, _ in left_out:
            odd[key] += 1
        if found:
            links[i] = found
    line = (f"links: {len(without)} albums with no Spotify id, {len(links)} with other links ("
            + ", ".join(f"{k} {n}" for k, n in per_key.items()) + f"), {len(without) - len(links)} with none; "
            + f"{sum(odd.values())} link(s) left out as not of their service's form"
            + (" (" + ", ".join(f"{k} {n}" for k, n in odd.items() if n) + ")" if any(odd.values()) else ""))
    return links, line


def cover_problems(table, new_keys: list[str], waiting: list[str]) -> list[str]:
    """What is wrong with the covers of the new albums, a line each: an error with --require-sprites, a
    warning without. `table`: catalog.covers_table(); `waiting`: the keys with a cover and no usable sprite
    (new_album_covers)."""
    if not table.found:
        return [f"{table.path or 'catalog/covers.csv'}: covers.csv is missing, so NO new album has a cover (`c` is empty "
                f"for all {len(new_keys)}). Restore the committed file, or run python -m rmr_pipeline.covers refs"]
    problems = []
    if waiting:
        stale = len(table.stale(waiting))
        problems.append(f"{len(waiting)} new album(s) have a cover and no sprite"
                        + (f" ({stale} of them with a sprite of another image than their row's)" if stale else "")
                        + ". Run python -m rmr_pipeline.covers sprites")
    if unverified := table.unverified(new_keys):
        problems.append(f"{len(unverified)} sprite(s) have no entry in the manifest, so nothing says which image they "
                        f"were made from ({', '.join(unverified[:5])}{' ...' if len(unverified) > 5 else ''}). Once no "
                        "`sprites` run is going, run python -m rmr_pipeline.covers adopt")
    return problems


def moved_site_slugs(slugs: list[str], site: Path = DEFAULT_OUT / "albums.json") -> list[str] | None:
    """The albums of the committed site data whose slug this build would change, as `album <n>: 'old' -> 'new'`;
    [] when every one keeps its slug, None when there is no `site` file to compare with. Read only. A slug is
    the album's address on the site, so a catalog build must give the site's albums the slugs they have."""
    if not site.exists():
        return None
    old = [a["slug"] for a in json.loads(site.read_text(encoding="utf-8"))]
    moved = [f"album {i}: {a!r} -> {b!r}" for i, (a, b) in enumerate(zip(old, slugs)) if a != b]
    return moved + [f"album {i}: {a!r} -> nothing (the build has {len(slugs)} album(s), the site {len(old)})"
                    for i, a in enumerate(old[len(slugs):], start=len(slugs))]


def ambient_colours(sprites: list, covers: list[str], uris: list[str], clusters: list[int],
                    override_images: dict) -> list[tuple[str, str, str]]:
    """Each album's ambient colours: from its sprite when that is its cover (its own file, or the map's
    sprite of an album with a cover id), else the fallback of its cluster. A catalog album the map does not
    have (no URI) with a cover id and no sprite file yet has a flat tile, so it keeps the fallback."""
    return [ambient_from_image(sprites[i], clusters[i]) if ((covers[i] and uris[i]) or i in override_images)
            else FALLBACK_AMBIENT[clusters[i] % 3] for i in range(len(uris))]


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
    keys, places, new_images, n_site, catalog = None, None, {}, len(sub), None
    if args.catalog:
        try:
            catalog = load_catalog(args.catalog_path)
            cat = catalog_frame(sub, catalog, weights=args.descriptor_weights, existing=args.existing_descriptors)
        except CatalogError as e:
            print(f"catalog: {e}", file=sys.stderr)
            return 1
        print(cat.summary())
        print("\n".join(shared_spotify_lines(shared_spotify_ids(cat))))
        # The site's albums keep their rows; the new albums follow them.
        sub, keys, places, spotify_ids = cat.frame, cat.keys, cat.places, cat.spotify_ids
        new_keys = keys[n_site:]
        uris = uris + [""] * len(new_keys)
        # A new album shows `native [Latin]` when its credit is not in Latin script and the catalog has a
        # romanisation; its slug is made from the romanisation alone, as before.
        shown = [display_artist(a, b) for a, b in zip(catalog["artist"].iloc[n_site:], catalog["artist_latin"].iloc[n_site:])]
        print(f"artists: {sum(a != b for a, b in zip(shown, sub['Artist'][n_site:]))} new albums shown as native [Latin]")
        titles, artists = titles + list(sub["Title"][n_site:]), artists + shown
        slug_titles, slug_artists = cat.slug_titles, artists[:n_site] + cat.slug_artists[n_site:]
        new_covers, new_images, waiting = new_album_covers(new_keys, n_site)
        cover_ids = cover_ids + new_covers
        table = covers_table()
        gone = table.gone(new_keys)
        print(f"covers: {len(new_keys)} new albums, {sum(1 for c in new_covers if c)} with a cover, "
              f"{len(new_images)} with a sprite, {len(waiting)} with a cover and no sprite yet (a flat tile on the "
              f"sheets): {', '.join(waiting[:5])}{' ...' if len(waiting) > 5 else ''}")
        if gone:
            print(f"covers: {len(gone)} new album(s) have a row in covers.csv whose image could not be fetched (recorded "
                  f"in the covers state file): no cover, `c` is empty ({', '.join(gone[:5])}{' ...' if len(gone) > 5 else ''})")
        problems = cover_problems(table, new_keys, waiting)
        if problems and args.require_sprites:
            print("\n".join(f"--require-sprites: {p}" for p in problems), file=sys.stderr)
            return 1
        for p in problems:
            print(f"WARNING, covers: {p}")

    slugs = make_slugs(slug_titles, slug_artists)  # overrides.json is keyed by these
    overrides = load_overrides(args.overrides)
    covers, spotify_ids, override_images, artists = apply_overrides(
        slugs, cover_ids, spotify_ids, overrides, args.overrides.parent, artists=artists)
    override_images = {**new_images, **override_images}
    changed = {slugs.index(k) for k, e in overrides.items() if "a" in e}
    slugs = slugs_after_overrides(slug_titles, [artists[i] if i in changed else a for i, a in enumerate(slug_artists)],
                                  slugs, changed)
    if args.catalog:
        moved = moved_site_slugs(slugs)
        if moved:
            print(f"slugs: the catalog build changes the slug of {len(moved)} album(s) of {DEFAULT_OUT / 'albums.json'}: "
                  + ", ".join(moved[:5]), file=sys.stderr)
            return 1
        print(f"slugs: no {DEFAULT_OUT / 'albums.json'} to compare with" if moved is None
              else "slugs: the site's albums keep the slugs of the committed albums.json")
    vocab, tops = build_vocab(sub, places)
    try:
        # The catalog build does not impute: an album with no audio is limited to the mood side.
        audio = audio_block(sub, args.audio_dir, keys, fill="mean" if args.catalog else "impute")
    except StoreError as e:
        print(f"audio store: {e}", file=sys.stderr)
        return 1
    no_audio = ~audio.has_audio
    print(audio.summary()
          + (f"; the albums without audio: {int(no_audio[:n_site].sum())} existing / {int(no_audio[n_site:].sum())} new"
             if args.catalog else "")
          + (f"; hub correction at {', '.join(args.hub_correction)}" if args.hub_correction else ""))
    links: dict[int, dict[str, str]] = {}
    if args.catalog:
        links, line = listen_links(catalog, spotify_ids)
        print(line)
        # Until the new albums have clusters of their own: the cluster of an album's nearest existing albums,
        # on the balanced matrix, or on the descriptors alone when the album has no audio.
        # An existing album without audio has the mean block there, so it does not vote on that matrix.
        by_balanced = neighbour_clusters(site_matrix(sub, audio.block, SLIDER["balanced"]), clusters,
                                         voters=audio.has_audio[:n_site])
        by_mood = neighbour_clusters(descriptors(sub), clusters)
        clusters = clusters + [m if quiet else b for b, m, quiet in zip(by_balanced, by_mood, no_audio[n_site:])]
    t1 = time.time()
    recs = build_recs(sub, audio.block, args.hub_correction, has_audio=audio.has_audio, mood_only=args.catalog)
    t2 = time.time()
    layouts = build_layouts(sub, audio.block, has_audio=audio.has_audio, mood_only=args.catalog)
    t3 = time.time()
    print(f"recs and layouts done ({t3 - t0:.0f}s: recs {t2 - t1:.0f}s, layouts {t3 - t2:.0f}s)")

    ambient = [FALLBACK_AMBIENT[k % 3] for k in clusters]
    out = args.out
    if not args.skip_images:
        sprites = load_album_sprites(src, uris, meta, covers, clusters, override_images)
        ambient = ambient_colours(sprites, covers, uris, clusters, override_images)
        t4 = time.time()
        for name, size in write_sheets(out, sprites).items():
            print(f"wrote {name}: {size / 1e6:.2f} MB")
        if args.catalog:
            print(f"images done (sprites and colours {t4 - t3:.0f}s, sheets {time.time() - t4:.0f}s)")

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
    if args.catalog:  # the optional keys, in the contract's order: `l`, then `n`
        for r, album in enumerate(albums):
            if r in links:
                album["l"] = links[r]
            if no_audio[r]:
                album["n"] = 1

    sizes = {
        "albums.json": write_json(out / "albums.json", albums),
        "vocab.json": write_json(out / "vocab.json", vocab),
        "positions.json": write_json(out / "positions.json", {s: flat_positions(layouts[s]) for s in STOPS}),
        "recs.json": write_json(out / "recs.json", {s: rec_lists(recs[s]) for s in STOPS}),
    }
    for name, size in sizes.items():
        print(f"wrote {name}: {size / 1e6:.2f} MB")
    print(validate_dir(out, images=not args.skip_images))
    print(f"done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
