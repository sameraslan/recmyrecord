"""The owner's review of the last-resort covers (rmr_pipeline.covers, tier `caa`):

    docs/review/caa-covers.jpg     every Cover Art Archive cover in use, as its 96 px sprite, numbered
    docs/review/caa-covers.md      number -> the album, and the MusicBrainz release group it was matched to
    docs/review/still-no-cover.md  the albums that still have no cover, why, and the links the catalog has

    python scripts/caa_review.py            # from data-pipeline/, after `covers refs`, `covers sprites` and the build

Reads catalog/albums.csv, catalog/covers.csv, covers_caa.csv, covers_skip.csv, the sprites and the state file
of .cache/covers, and the site's albums.json (slugs, shown names, and which album has a cover). No network.
"""
import argparse
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline import covers as cv  # noqa: E402
from rmr_pipeline.images import TILE_FONT  # noqa: E402

REVIEW = cv.PIPELINE_DIR.parent / "docs" / "review"
CELL, LABEL, PER_ROW, GAP = 96, 16, 12, 4
MAX_BYTES = 3 * 1024 * 1024
LINKS = (("Apple Music", "apple_music_url"), ("Deezer", "deezer_url"), ("Bandcamp", "bandcamp_url"), ("YouTube", "youtube_url"),
         ("SoundCloud", "soundcloud_url"), ("Spotify", "spotify_url"), ("RYM", "rym_url"))
WHY = {"no source": "no cover source in the catalog's links", "gone": "its image (a YouTube frame, a store image) is gone",
       "skipped": "its YouTube frame is on the skip list", "unverified link": "its Spotify link opened another album",
       "no cover id": "no Spotify release"}


def cell(text: str) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def sheet(sprites: list[Path]) -> Image.Image:
    rows = -(-len(sprites) // PER_ROW)
    im = Image.new("RGB", (PER_ROW * (CELL + GAP) + GAP, rows * (CELL + LABEL + GAP) + GAP), (21, 17, 13))
    draw, font = ImageDraw.Draw(im), ImageFont.truetype(str(TILE_FONT), 12)
    for n, path in enumerate(sprites):
        x, y = GAP + (n % PER_ROW) * (CELL + GAP), GAP + (n // PER_ROW) * (CELL + LABEL + GAP)
        with Image.open(path) as sprite:
            im.paste(sprite.convert("RGB").resize((CELL, CELL)), (x, y))
        draw.text((x + CELL / 2, y + CELL + LABEL / 2), str(n + 1), font=font, fill=(237, 229, 213), anchor="mm")
    return im


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", type=Path, default=REVIEW)
    args = ap.parse_args(argv)
    rows = cv.catalog_rows()
    site = json.loads(cv.DEFAULT_SITE_ALBUMS.read_text(encoding="utf-8"))
    number = {r["rym_id"]: i for i, r in enumerate(rows)}
    table, state, caa = cv._default_covers(), cv.State(cv.DEFAULT_STATE), cv.read_caa()
    unverified, bare = cv.existing_without_cover(rows)
    asked = cv.caa_candidates(rows, cv.Inputs.load(), table.rows, table.skip, state, table.sprite_dir, table.made_from,
                              unverified, bare)

    found, without = [], []
    for row, group in asked:
        key = row["rym_id"]
        cover, sprite = table.caa_for(key) if row["legacy_uri"] else table.cover_for(key)
        shown = site[number[key]]
        if cover.startswith("ca:") and shown["c"] != cover:
            raise SystemExit(f"{key}: covers_caa.csv gives {cover}, the site's albums.json has c = {shown['c']!r}: rebuild first")
        (found if cover else without).append((row, group, shown, sprite))
    if missing := [r["rym_id"] for r, _, _, sprite in found if sprite is None]:
        raise SystemExit(f"no sprite for {', '.join(missing)}: run python -m rmr_pipeline.covers sprites")

    args.out.mkdir(parents=True, exist_ok=True)
    quality, body = 92, b""
    while quality >= 60:
        buf = io.BytesIO()
        sheet([sprite for *_, sprite in found]).save(buf, "JPEG", quality=quality)
        body = buf.getvalue()
        if len(body) < MAX_BYTES:
            break
        quality -= 8
    (args.out / "caa-covers.jpg").write_bytes(body)

    groups = {g: sum(1 for _, group, *_ in found if group == g) for g in WHY}
    lines = [f"# Cover Art Archive covers ({len(found)})", "",
             "Every album whose cover is the last resort's: the front image the Cover Art Archive has for the album's "
             "release group on MusicBrainz (`ca:<mbid>` in `albums.json`, a row of `data-pipeline/catalog/covers_caa.csv`), "
             f"in catalog order. Sheet: `caa-covers.jpg`, {PER_ROW} per row, each cell the 96 px sprite the build uses, with "
             "its number under it. A release group was taken only when its title and one credited artist equal the album's "
             "after folding and the years are at most one apart; the columns on the right say what it was matched to.", "",
             "Why each album had no cover: " + "; ".join(f"{n} {WHY[g]}" for g, n in groups.items() if n) + ".", "",
             "To take a cover out: add the line `rym_id,caa,<mbid>,<what the image is>` to "
             "`data-pipeline/catalog/covers_skip.csv` and rebuild (the row stays in `covers_caa.csv`, so the lookup does "
             "not find the same release group again). To give an album another release group: put that group's MBID in "
             "its row of `covers_caa.csv`, run `python -m rmr_pipeline.covers sprites`, rebuild.", "",
             "| # | Artist | Title | Year | MusicBrainz title | MusicBrainz artist | Year, type | Release group | Why no cover before | rym_id |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for n, (row, group, shown, _) in enumerate(found, start=1):
        m = caa[row["rym_id"]]
        lines.append(f"| {n} | {cell(shown['a'])} | {cell(shown['t'])} | {row['year']} | {cell(m['mb_title'])} | {cell(m['mb_artist'])} "
                     f"| {m['mb_year'] or 'no date'}, {m['mb_type'] or 'no type'} | [{m['mbid'][:8]}](https://musicbrainz.org/release-group/{m['mbid']}) "
                     f"| {group} | {row['rym_id']} |")
    (args.out / "caa-covers.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    decided = {}
    for row, *_ in without:
        key = row["rym_id"]
        got = state.caa.get(key, {})
        if key in caa and (key, cv.made_from((cv.CAA, caa[key]["mbid"]))) in table.skip:
            decided[key] = ("skipped", f"the image of release group {caa[key]['mbid']} is on the skip list")
        elif key in caa:  # found, and the archive's image could not be fetched
            decided[key] = ("no art", "the archive did not serve the image: " + state.caa_sprites.get(key, {}).get("why", "unknown"))
        else:
            decided[key] = (got.get("decision", "not asked"), got.get("why", ""))
    counts = {d: sum(1 for v in decided.values() if v[0] == d) for d in ("none", "ambiguous", "no art", "not asked", "skipped")}
    lines = [f"# Albums that still have no cover ({len(without)})", "",
             "These show the lettered tile. Each was asked from MusicBrainz and the Cover Art Archive (the last resort of "
             "`rmr_pipeline/covers.py`) and got nothing: "
             + ", ".join(f"{n} {d}" for d, n in counts.items() if n) + ".", "",
             "- **none**: no release group with the album's title, one of its artists and its year (to within one).",
             "- **ambiguous**: two release groups pass that look different (a studio and a live album, two years, two "
             "credits). The candidates are in the last column.",
             "- **no art**: the release group was found, and the archive has no front image for it.",
             "- **not asked**: the lookup has no answer for the album yet: the archive answered HTTP 500 for the release "
             "group's list of images each time it was asked. The next `python -m rmr_pipeline.covers refs --tiers caa` "
             "asks again.",
             "- **skipped**: the image that was found is on the skip list (`covers_skip.csv`): not the album's cover.", "",
             "## Giving a cover by hand", "",
             "1. *The album is on MusicBrainz and its release group has a front image* (every ambiguous album, once you "
             "have picked the right candidate): add a line `rym_id,mbid,mb_title,mb_artist,mb_year,mb_type,score` to "
             "`data-pipeline/catalog/covers_caa.csv` with the release group's MBID (the last part of its "
             "`musicbrainz.org/release-group/...` address; the other columns are for the reader and may be empty). "
             "Then `python -m rmr_pipeline.covers sprites`, rebuild, validate. The album page and the map both show it.",
             "2. *Any image you have*: an entry in `data-pipeline/overrides.json` under the album's slug (last column but "
             "one) with `image` (a file you put in `data-pipeline/overrides/`) and a `note`, as the README's Overrides "
             "section describes: `\"<slug>\": {\"image\": \"overrides/<slug>.jpg\", \"note\": \"where the image is from\"}`. "
             "The image gives the album its sprite on the map and its colours. The album page shows a remotely hosted "
             "image only, so it keeps the tile unless the entry also has `c`, which takes a Spotify image id.",
             "3. *The album has a Spotify release*: put its link on the sheet (or `s` in `overrides.json`); the cover follows "
             "the link at the next `covers refs`.", "",
             "| Artist | Title | Year | Result | Why no cover before | Links the catalog has | Slug | rym_id | Detail |",
             "|---|---|---|---|---|---|---|---|---|"]
    for row, group, shown, _ in without:
        links = ", ".join(f"[{name}]({row[col]})" for name, col in LINKS if row.get(col)) or "none"
        decision, why = decided[row["rym_id"]]
        lines.append(f"| {cell(shown['a'])} | {cell(shown['t'])} | {row['year']} | {decision} | {group} | {links} | `{shown['slug']}` "
                     f"| {row['rym_id']} | {cell(why)} |")
    (args.out / "still-no-cover.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(found)} covers on {args.out / 'caa-covers.jpg'} ({len(body) / 1e6:.2f} MB, quality {quality}); "
          f"{len(without)} albums still without a cover: " + ", ".join(f"{n} {d}" for d, n in counts.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
