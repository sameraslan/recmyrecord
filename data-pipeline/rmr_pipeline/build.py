"""CLI: python -m rmr_pipeline.build --map-root PATH [--table PATH] [--out PATH] [--overrides PATH]
                                    [--audio-dir PATH] [--hub-correction STOPS] [--skip-images]
                                    [--catalog-path CSV] [--descriptor-weights PROFILE]
                                    [--existing-descriptors SOURCE] [--require-sprites]
                                    [--no-catalog --out PATH]

The site's data, in frontcreck/public/data unless --out names another folder: every album of
catalog/albums.csv (rmr_pipeline.catalog), from the store of audio_store.SITE_MODEL (the switch of
6 October 2026; README, Catalog mode). Beside the feature table's albums it has the covers of the new
albums (rmr_pipeline.covers), listen links `l` for an album with no Spotify id (rmr_pipeline.links), the
form `native [Latin]` of a new album's artist and title (catalog.display_artist, display_title), the
sheet's Spotify link for an existing album, with the cover of that release (catalog.catalog_frame,
existing_album_covers), no Spotify link and no Spotify cover for the albums of catalog/unverified_links.csv
(catalog.unverified_links), the Cover Art Archive cover of an album that would have none (covers.py's last
resort; catalog.last_resort_covers for an existing album), and the mood-only rule for an album with no audio (`n`; audio.mean_fill,
recs.build_recs, recs.no_audio_columns, layout.build_layouts).

--no-catalog is the build of before the switch: the feature table's albums alone, an imputed block for an
album with no audio, flat tiles. It needs an explicit --out and never writes into frontcreck/public/data.
The data of before the switch: --no-catalog --audio-dir audio --map-root PATH --out PATH."""
import argparse
import json
import sys
import time
from pathlib import Path

from .artists import clean_artist
from .audio import DEFAULT_CATALOG, audio_block, descriptors, site_matrix
from .audio_store import StoreError, site_store
from .catalog import (DEFAULT_EXISTING, DEFAULT_WEIGHTS, EXISTING, WEIGHT_PROFILES, CatalogError, catalog_frame, covers_table,
                      display_artist, display_title, existing_album_covers, last_resort_covers, load_catalog,
                      load_unverified_links, neighbour_clusters, new_album_covers, shared_spotify_ids, shared_spotify_lines,
                      unverified_links)
from .colors import ambient_from_image
from .constants import DEFAULT_OUT, DEFAULT_OVERRIDES, DEFAULT_TABLE, FALLBACK_AMBIENT, SLIDER, STOPS
from .images import load_album_sprites, tile_thumbs, write_sheets
from .io import write_json
from .layout import build_layouts, flat_positions
from .links import LINK_COLUMNS, album_links
from .mapsource import MapSource, load_cover_ids, load_metadata
from .overrides import apply_overrides, load_overrides, slugs_after_overrides
from .recs import build_recs, rec_lists
from .slugs import MAX_SLUG_BYTES, make_slugs
from .table import dedupe_table, load_table
from .validate import validate_dir
from .vocab import build_vocab


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m rmr_pipeline.build",
                                description="Build frontcreck/public/data from the catalog table, the feature table, "
                                            "the audio store and the map outputs.")
    p.add_argument("--map-root", type=Path, required=True,
                   help="Root of the personal-site music_map worktree (has public/data and pipeline/outputs).")
    p.add_argument("--table", type=Path, default=DEFAULT_TABLE, help="Feature table pickle (read-only).")
    p.add_argument("--out", type=Path, default=None,
                   help="Output folder (default frontcreck/public/data). Required with --skip-images and with "
                        "--no-catalog.")
    p.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES, help="Manual corrections keyed by slug.")
    p.add_argument("--audio-dir", type=Path, default=None,
                   help="The audio store: embeddings, manifest and transform.npz (default: the store of "
                        "audio_store.SITE_MODEL, data-pipeline/audio/effnet10k).")
    p.add_argument("--catalog", action=argparse.BooleanOptionalAction, default=True,
                   help="Build every album of the catalog table, keyed by RYM id (the default: the site's data). "
                        "--no-catalog builds the feature table's albums alone, as before the switch to the 10k "
                        "catalog; it needs an explicit --out that is not frontcreck/public/data.")
    p.add_argument("--catalog-path", type=Path, default=DEFAULT_CATALOG, help="The catalog table. Not with --no-catalog.")
    p.add_argument("--descriptor-weights", choices=tuple(WEIGHT_PROFILES), default=None,
                   help="The weight of an album's eight descriptors by place (default slope, 1 down "
                        "to 0.5; rank is the feature table's 1.5 down to 1.33). Not with --no-catalog.")
    p.add_argument("--existing-descriptors", choices=EXISTING, default=None,
                   help="Where an existing album's eight descriptors come from (default "
                        "table-novocals, the vocals descriptors dropped; see rmr_pipeline.catalog). Not with --no-catalog.")
    p.add_argument("--require-sprites", action="store_true",
                   help="Not with --no-catalog. Stop when catalog/covers.csv is missing, when a new album (or an existing one "
                        "whose Spotify link changed) has a cover in it and no sprite of that image in "
                        ".cache/covers/96 (python -m rmr_pipeline.covers sprites), or "
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
        args.descriptor_weights = args.descriptor_weights or DEFAULT_WEIGHTS
        args.existing_descriptors = args.existing_descriptors or DEFAULT_EXISTING
    elif args.descriptor_weights or args.existing_descriptors or args.catalog_path != DEFAULT_CATALOG:
        p.error("--catalog-path, --descriptor-weights and --existing-descriptors need --catalog: not with --no-catalog")
    elif args.require_sprites:
        p.error("--require-sprites needs --catalog: not with --no-catalog")
    elif args.out is None:
        p.error("--no-catalog needs an explicit --out folder")
    elif args.out.resolve() == DEFAULT_OUT.resolve() or DEFAULT_OUT.resolve() in args.out.resolve().parents:
        p.error(f"--no-catalog does not write into {DEFAULT_OUT}: the site's data is the catalog build's. "
                "Pass another --out folder")
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


def held_by_overrides(slugs: list[str], overrides: dict[str, dict[str, str]]) -> set[int]:
    """The album numbers whose Spotify id, cover id or cover image overrides.json sets: the sheet's link does
    not change what they link to or show."""
    index = {s: i for i, s in enumerate(slugs)}
    return {index[slug] for slug, e in overrides.items() if slug in index and {"s", "c", "image"} & set(e)}


def cover_problems(table, new_keys: list[str], waiting: list[str], existing_keys: list[str] = (),
                   existing_waiting: list[str] = ()) -> list[str]:
    """What is wrong with the covers of the new albums, a line each: an error with --require-sprites, a
    warning without. `table`: catalog.covers_table(); `waiting`: the keys with a cover and no usable sprite
    (new_album_covers). `existing_keys`: the existing albums whose Spotify link changed, and
    `existing_waiting` those of them with a row and no sprite of it (existing_album_covers): they keep the
    map's cover until the sprite is there."""
    if not table.found:
        return [f"{table.path or 'catalog/covers.csv'}: covers.csv is missing, so NO new album has a cover (`c` is empty "
                f"for all {len(new_keys)}). Restore the committed file, or run python -m rmr_pipeline.covers refs"]
    problems = []
    if waiting:
        stale = len(table.stale(waiting))
        problems.append(f"{len(waiting)} new album(s) have a cover and no sprite"
                        + (f" ({stale} of them with a sprite of another image than their row's)" if stale else "")
                        + ". Run python -m rmr_pipeline.covers sprites")
    if existing_waiting:
        problems.append(f"{len(existing_waiting)} existing album(s) whose Spotify link changed have a cover in covers.csv "
                        "and no sprite of it, so they keep the map's cover. Run python -m rmr_pipeline.covers sprites")
    if unverified := table.unverified(list(existing_keys) + list(new_keys)):
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


def sprite_titles(catalog: bool, titles: list[str]) -> list[str] | None:
    """The titles the sheets' tiles are lettered from: the shown titles in a catalog build, None in a
    --no-catalog build, whose tiles stay flat (its sheets are the ones the site had before the switch)."""
    return titles if catalog else None


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
        # The site's albums keep their rows; the new albums follow them.
        sub, keys, places, spotify_ids = cat.frame, cat.keys, cat.places, cat.spotify_ids
        new_keys = keys[n_site:]
        uris = uris + [""] * len(new_keys)
        # A new album shows `native [Latin]` when its credit is not in Latin script and the catalog has a
        # romanisation; its slug is made from the romanisation alone, as before.
        shown = [display_artist(a, b) for a, b in zip(catalog["artist"].iloc[n_site:], catalog["artist_latin"].iloc[n_site:])]
        print(f"artists: {sum(a != b for a, b in zip(shown, sub['Artist'][n_site:]))} new albums shown as native [Latin]")
        # The same for a title (the owner's decision of 6 October 2026); an existing album's is not touched.
        shown_titles = [display_title(a, b) for a, b in zip(catalog["title"].iloc[n_site:], catalog["title_latin"].iloc[n_site:])]
        print(f"titles: {sum(a != b for a, b in zip(shown_titles, sub['Title'][n_site:]))} new albums shown as native [Latin]")
        titles, artists = titles + shown_titles, artists + shown
        slug_titles, slug_artists = cat.slug_titles, artists[:n_site] + cat.slug_artists[n_site:]

    # A catalog build keeps a new album's slug within slugs.MAX_SLUG_BYTES (a slug is a file name on the host);
    # the albums of the feature table, and every album of a --no-catalog build, have the slugs they always had.
    cap_from = n_site if args.catalog else None
    slugs = make_slugs(slug_titles, slug_artists, cap_from)  # overrides.json is keyed by these
    overrides = load_overrides(args.overrides)
    if args.catalog:
        # An existing album links to the sheet's Spotify album when the sheet has one (cat.spotify_ids), and
        # one whose id thereby changes shows that release's cover, from covers.csv, in place of the map's.
        # overrides.json is applied below and wins: the albums it decides are left out here.
        old = existing_album_covers(keys, spotify_ids, cat.legacy_ids, held_by_overrides(slugs, overrides))
        on_sheet = sum(1 for u in catalog["spotify_url"].iloc[:n_site] if u)
        print(f"spotify links: {on_sheet} of {n_site} existing albums have a link on the sheet and take their id from it "
              f"({n_site - on_sheet} have none and keep the feature table's); for {len(old.relinked) + len(old.held)} it is "
              f"another id than the table's, {len(old.held)} of them decided by overrides.json instead")
        print(f"covers: {len(old.relinked)} existing albums link to another release: {len(old.covers)} take its cover, "
              f"{len(old.kept_map)} keep the map's cover (no row in covers.csv, no sprite, an image that is gone or "
              f"skipped): {', '.join(old.kept_map[:5])}{' ...' if len(old.kept_map) > 5 else ''}")
        for i, c in old.covers.items():
            cover_ids[i] = c
        # The albums whose link opens another album and whose right id is not known: no Spotify link and no
        # Spotify cover (the lettered tile, the fallback colours) until the sheet or overrides.json has the
        # link. Before apply_overrides, so an override's `c` or `image` still holds.
        try:
            listed = load_unverified_links()
        except CatalogError as e:
            print(f"catalog: {e}", file=sys.stderr)
            return 1
        unverified = unverified_links(listed, keys, cat.legacy_ids, list(catalog["spotify_url"]), slugs, overrides)
        for i in unverified.applied:
            spotify_ids[i], cover_ids[i] = "", ""
        print(f"unverified links: {len(unverified.applied)} of the {len(listed)} albums of catalog/unverified_links.csv "
              "have no Spotify link and no Spotify cover (their link opens another album)"
              + (f"; {len(unverified.stale)} row(s) no longer apply and can be deleted:" if unverified.stale else ""))
        for line in unverified.stale:
            print(f"  {line}")
        new_covers, new_images, waiting = new_album_covers(new_keys, n_site)
        new_images = {**old.images, **new_images}
        cover_ids = cover_ids + new_covers
        table = covers_table()
        gone = table.gone(new_keys)
        print(f"covers: {len(new_keys)} new albums, {sum(1 for c in new_covers if c)} with a cover, "
              f"{len(new_images) - len(old.images)} with a sprite, {len(waiting)} with a cover and no sprite yet (a flat tile on the "
              f"sheets): {', '.join(waiting[:5])}{' ...' if len(waiting) > 5 else ''}")
        last = set(table.last_resort(new_keys))  # the new albums whose cover is the Cover Art Archive's
        if gone:
            print(f"covers: {len(gone)} new album(s) have a row in covers.csv whose image could not be fetched (recorded "
                  f"in the covers state file): no cover from it ({', '.join(gone[:5])}{' ...' if len(gone) > 5 else ''}); "
                  f"{sum(k in last for k in gone)} of them have the last resort's, the others an empty `c`")
        if skipped := table.skipped(new_keys):
            print(f"covers: {len(skipped)} new album(s) have a row in covers.csv that catalog/covers_skip.csv names as not "
                  f"a cover: no cover from it ({', '.join(skipped[:5])}{' ...' if len(skipped) > 5 else ''}); "
                  f"{sum(k in last for k in skipped)} of them have the last resort's, the others an empty `c`")
        print(f"covers, last resort: {len(last)} new album(s) with no other cover show the Cover Art Archive's front image "
              f"of their MusicBrainz release group (`ca:<mbid>`, catalog/covers_caa.csv); "
              f"{sum(1 for c in new_covers if not c)} new album(s) have no cover")
        problems = cover_problems(table, new_keys, waiting, [keys[i] for i in old.relinked], old.waiting)
        if problems and args.require_sprites:
            print("\n".join(f"--require-sprites: {p}" for p in problems), file=sys.stderr)
            return 1
        for p in problems:
            print(f"WARNING, covers: {p}")
    covers, spotify_ids, override_images, artists = apply_overrides(
        slugs, cover_ids, spotify_ids, overrides, args.overrides.parent, artists=artists)
    if args.catalog:
        # The last resort for an existing album whose `c` is still empty: an album of unverified_links.csv
        # takes the archive's cover and its sprite; one with an image of its own in overrides.json (`c` "")
        # takes the cover id for the album page and keeps that image for its sprite and colours.
        resort = last_resort_covers(keys, covers, n_site, set(override_images))
        for i, c in resort.covers.items():
            covers[i] = c
        new_images = {**new_images, **resort.images}
        print(f"covers, last resort: {len(resort.covers)} existing album(s) with no cover id take the Cover Art Archive's "
              f"(`ca:<mbid>`): {len(resort.images)} with its sprite, {len(resort.own_image)} that keep the sprite of their "
              f"image in overrides.json; {sum(1 for c in covers[:n_site] if not c)} existing album(s) have no cover")
        if resort.waiting:
            problem = (f"{len(resort.waiting)} existing album(s) have a row in covers_caa.csv and no sprite of it, so they "
                       f"keep the tile ({', '.join(resort.waiting[:5])}{' ...' if len(resort.waiting) > 5 else ''}). "
                       "Run python -m rmr_pipeline.covers sprites")
            if args.require_sprites:
                print(f"--require-sprites: {problem}", file=sys.stderr)
                return 1
            print(f"WARNING, covers: {problem}")
    override_images = {**new_images, **override_images}
    if args.catalog:
        by_table = shared_spotify_ids(cat, cat.legacy_ids[:n_site] + cat.spotify_ids[n_site:])
        print(f"spotify ids: {len({r['spotify_id'] for r in by_table})} were shared by more than one album with the feature "
              "table's ids for the existing albums; with the sheet's links and overrides.json:")
        print("\n".join(shared_spotify_lines(shared_spotify_ids(cat, spotify_ids))))
    changed = {slugs.index(k) for k, e in overrides.items() if "a" in e}
    slugs = slugs_after_overrides(slug_titles, [artists[i] if i in changed else a for i, a in enumerate(slug_artists)],
                                  slugs, changed, cap_from)
    if args.catalog:
        moved = moved_site_slugs(slugs)
        if moved:
            print(f"slugs: the catalog build changes the slug of {len(moved)} album(s) of {DEFAULT_OUT / 'albums.json'}: "
                  + ", ".join(moved[:5]), file=sys.stderr)
            return 1
        print(f"slugs: no {DEFAULT_OUT / 'albums.json'} to compare with" if moved is None
              else "slugs: the site's albums keep the slugs of the committed albums.json")
        bare = make_slugs(slug_titles, slug_artists)
        cut = [i for i in range(n_site, len(slugs)) if slugs[i] != bare[i]]
        print(f"slugs: {len(cut)} new album(s) have a slug cut to {MAX_SLUG_BYTES} bytes or fewer (a slug is a file name "
              f"on the host); the longest new slug is {max((len(s) for s in slugs[n_site:]), default=0)} bytes")
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
        # A catalog build letters the tile of an album without a cover, as the album page does (40 such
        # albums; flat squares on the map read as images that failed to load). A --no-catalog build's are flat.
        lettered = sprite_titles(args.catalog, titles)
        sprites = load_album_sprites(src, uris, meta, covers, clusters, override_images, titles=lettered)
        small = tile_thumbs(uris, covers, clusters, override_images, lettered) if lettered is not None else None
        # A tile's ambient colours stay its cluster's fallback: ambient_colours does not read a tile.
        ambient = ambient_colours(sprites, covers, uris, clusters, override_images)
        t4 = time.time()
        for name, size in write_sheets(out, sprites, small).items():
            print(f"wrote {name}: {size / 1e6:.2f} MB")
        if args.catalog:
            print(f"images done (sprites and colours {t4 - t3:.0f}s, sheets {time.time() - t4:.0f}s)")

    albums = [{
        "slug": slugs[r],
        "t": titles[r],
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
