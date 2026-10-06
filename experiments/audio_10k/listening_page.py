"""A local listening page: for about 40 seed albums, the ten nearest albums by the EffNet block over the
whole catalog, next to the ten nearest by CLAP where the seed has both.

    cd experiments/audio_10k
    nice -n 19 <build venv python> listening_page.py     -> results/listening.html (one static file)

Links only: each album links out to its Spotify, Apple Music, Deezer and YouTube page from the catalog table.
Nothing is embedded, fetched or downloaded, and the page loads nothing from the network.

Seeds: the 23 of the earlier listening pages (evaluate.SEEDS of experiments/preview_features, Bitches Brew
among them), named here by the feature table's Spotify URI, which the catalog keeps as `legacy_uri` whatever
the album's key becomes; then NEW_SEEDS (15) new chart albums spread evenly over chart rank among the new
albums of the EffNet store. A seed without audio is listed as such.

Lists: the block alone, euclidean, the seed excluded, the seed artist's other albums kept (as the site shows
them). Each store through its own transform, every album it holds as a candidate. EffNet, the first column:
the 10k catalog's store (--effnet-dir, data-pipeline/audio/effnet10k, four clips) — not the site's current
lists, which use up to eight clips and only the site's albums. CLAP, the second: the committed CLAP store.
--effnet-stand-in (and a missing EffNet store) gives the EffNet column of before that store was written:
four-clip means from the clip cache through a PCA fitted on the albums with CLAP audio (sonic.effnet_block).
"""
import argparse
import datetime
import html
from pathlib import Path

import numpy as np

import sonic
from sonic import K, RESULTS

SEEDS = [  # (legacy URI, artist, title): evaluate.SEEDS, in its order
    ("spotify:album:5vkqYmiPBYLaalcmjujWxK", "Radiohead", "In Rainbows"),
    ("spotify:album:4sb0eMpDn3upAFfyi4q2rw", "Miles Davis", "Kind of Blue"),
    ("spotify:album:3GH4IiI6jQAIvnHVdb5FB6", "My Bloody Valentine", "Loveless"),
    ("spotify:album:3kEtdS2pH6hKcMU9Wioob1", "Nas", "Illmatic"),
    ("spotify:album:7aNclGRxTysfh6z0d8671k", "Aphex Twin", "Selected Ambient Works 85-92"),
    ("spotify:album:2DumvqHl78bNXuvU9kQfPN", "Slayer", "Reign in Blood"),
    ("spotify:album:5mwOo1zikswhmfHvtqVSXg", "Nick Drake", "Pink Moon"),
    ("spotify:album:2noRn2Aes5aoNVsU6iWThc", "Daft Punk", "Discovery"),
    ("spotify:album:7ycBtnsMtyVbbwTfJwRjSP", "Kendrick Lamar", "To Pimp a Butterfly"),
    ("spotify:album:0I8vpSE1bSmysN2PhmHoQg", "Keith Jarrett", "The Köln Concert"),
    ("spotify:album:3AQgdwMNCiN7awXch5fAaG", "Talking Heads", "Remain in Light"),
    ("spotify:album:7sh2Z8jj1iySpHRAnGd9w5", "Godspeed You Black Emperor!", "F♯A♯∞"),
    ("spotify:album:19bQiwEKhXUBJWY6oV3KZk", "Madvillain", "Madvillainy"),
    ("spotify:album:33qkK1brpt6t8unIpeM2Oy", "Joy Division", "Unknown Pleasures"),
    ("spotify:album:6YUCc2RiXcEKS9ibuZxjt0", "Stevie Wonder", "Songs in the Key of Life"),
    ("spotify:album:6FMu88LoghMcmme2aDkK3S", "Berliner Philharmoniker / Herbert von Karajan", "Symphony No. 9"),
    ("spotify:album:1vHvJVBK0WnpbYFw4f4UTD", "Bob Marley & The Wailers", "Exodus"),
    ("spotify:album:3Q0zkOZEOC855ErOOJ1AdO", "Miles Davis", "Bitches Brew"),
    ("spotify:album:6344rkGqCBDenGoS7eJlBN", "Yes", "Close to the Edge"),
    ("spotify:album:063f8Ej8rLVTz9KkjQKEMa", "Brian Eno", "Ambient 1: Music for Airports"),
    ("spotify:album:6cHPEbPryLpH5VX5Eb1Vvo", "Stars of the Lid", "And Their Refinement of the Decline"),
    ("spotify:album:5rcMJNWebtl2r2S18Je1A0", "Jorge Ben", "A Tábua de Esmeralda"),
    ("spotify:album:0I5Te5Oi0Cbes6nwEe4uFV", "Philip Glass", "Koyaanisqatsi"),
]
NEW_SEEDS = 15
LINKS = (("Spotify", "spotify_url"), ("Apple", "apple_music_url"), ("Deezer", "deezer_url"), ("YouTube", "youtube_url"))

CSS = """
:root { --bg: #faf8f5; --fg: #1d1a17; --dim: #6b645c; --line: #ddd6cc; --tag: #8a4b12; --link: #1f5a8a; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #15110d; --fg: #ece6dd; --dim: #a1988c; --line: #3a332b; --tag: #e0a467; --link: #8fc0ea; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--fg);
       font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 1280px; margin: 0 auto; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 0; }
p.meta, .sub { color: var(--dim); margin: 2px 0 0; }
nav { margin: 16px 0 8px; columns: 3 260px; font-size: 13px; }
nav a { display: block; padding: 1px 0; }
section { border-top: 1px solid var(--line); margin-top: 28px; padding-top: 16px; }
.lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px; margin-top: 12px; }
h3 { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); margin: 0 0 6px; }
ol { margin: 0; padding: 0; list-style: none; }
li { display: grid; grid-template-columns: 1.6em 1fr; gap: 0 6px; padding: 6px 0; border-top: 1px solid var(--line); }
li .n { color: var(--dim); font-variant-numeric: tabular-nums; }
.t { font-weight: 600; }
.new { color: var(--tag); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; margin-left: 6px; }
.d { color: var(--dim); font-size: 12.5px; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.links a { margin-right: 10px; font-size: 12.5px; }
.none { color: var(--dim); }
"""


def e(text) -> str:
    return html.escape(str(text), quote=True)


def links(row: dict) -> str:
    out = [f'<a href="{e(row[col])}" target="_blank" rel="noopener noreferrer">{name}</a>'
           for name, col in LINKS if row.get(col, "").startswith(("https://", "http://"))]
    return " ".join(out) or '<span class="none">no link</span>'


def facts(row: dict, new: bool) -> str:
    rank = f"rank {int(row['rank']):,}" if row["on_chart"] == "1" and row["rank"].isdigit() else "not on the chart"
    parts = [row["year"] or "year unknown", rank, row["primary_genres"] or "no genre listed"]
    return " · ".join(e(p) for p in parts)


def album_line(row: dict, new: bool) -> str:
    tag = '<span class="new">new</span>' if new else ""
    return (f'<div><span class="t">{e(row["artist"])} — {e(row["title"])}</span>{tag}'
            f'<div class="d">{facts(row, new)}</div><div class="links">{links(row)}</div></div>')


def new_seeds(albums: sonic.Albums, n: int = NEW_SEEDS) -> list[int]:
    """n new on-chart albums of `albums`, evenly spread over chart rank."""
    rank = lambda i: int(albums.rows[i]["rank"])  # noqa: E731
    pool = sorted((i for i in np.flatnonzero(albums.new) if albums.rows[i]["on_chart"] == "1" and albums.rows[i]["rank"].isdigit()),
                  key=lambda i: (rank(i), albums.rows[i]["rym_id"]))
    if len(pool) <= n:
        return [int(i) for i in pool]
    return [int(pool[int((j + 0.5) * len(pool) / n)]) for j in range(n)]


def page(catalog: Path, clap_dir: Path, cache_db: Path, effnet_dir: Path | None = None) -> str:
    """`effnet_dir`: the EffNet store; None for the stand-in (sonic.effnet_block)."""
    calbums, clap = sonic.load_albums(catalog, clap_dir)
    if effnet_dir:
        ealbums, effnet = sonic.load_albums(catalog, effnet_dir)
        eff_keys, first, effnet_title = ealbums.keys, ealbums, "EffNet (4 clips)"
    else:
        pos, effnet = sonic.effnet_block(calbums, cache_db)
        eff_keys, first, effnet_title = calbums.keys[pos], calbums, "EffNet stand-in (4 clips, from the cache)"
    lists = {"EffNet": dict(zip(eff_keys.tolist(), eff_keys[sonic.nearest(effnet)].tolist())),  # key -> its ten, as keys
             "CLAP": dict(zip(calbums.keys.tolist(), calbums.keys[sonic.nearest(clap)].tolist()))}
    table = {r["rym_id"]: r for r in sonic.read_catalog(catalog)}
    is_new = lambda key: not table[key]["legacy_uri"]  # noqa: E731
    audio = {k: (int(n), str(s).split(":")[0]) for a in (calbums, first) for k, n, s in zip(a.keys.tolist(), a.n_clips, a.source)}
    by_uri = {r["legacy_uri"]: k for k, r in table.items() if r["legacy_uri"] and k in audio}
    all_rows = {r["legacy_uri"]: r for r in table.values() if r["legacy_uri"]}

    def column(model: str, title: str, seed: str) -> str:
        if seed not in lists[model]:
            return f'<div><h3>{title}</h3><p class="none">no {model} audio for this album</p></div>'
        body = "".join(f'<li><span class="n">{n}</span>{album_line(table[k], is_new(k))}</li>'
                       for n, k in enumerate(lists[model][seed], start=1))
        return f"<div><h3>{title}</h3><ol>{body}</ol></div>"

    sections, toc = [], []
    seeds = ([(by_uri.get(uri), uri, artist, title) for uri, artist, title in SEEDS]
             + [(str(first.keys[i]), "", "", "") for i in new_seeds(first)])
    for n, (key, uri, artist, title) in enumerate(seeds, start=1):
        anchor = f"s{n}"
        if key is None:
            row = all_rows.get(uri)
            name = f"{row['artist']} — {row['title']}" if row else f"{artist} — {title}"
            why = "no audio" if row else "not in the catalog"
            toc.append(f'<a href="#{anchor}">{e(name)} <span class="none">({why})</span></a>')
            sections.append(f'<section id="{anchor}"><h2>{e(name)}</h2><p class="sub">{why}</p>'
                            + (f'<div class="links">{links(row)}</div>' if row else "") + "</section>")
            continue
        row, new = table[key], is_new(key)
        tag = '<span class="new">new</span>' if new else ""
        clips = f"{audio[key][0]} clip{'s' if audio[key][0] != 1 else ''}, {e(audio[key][1])}"
        toc.append(f'<a href="#{anchor}">{e(row["artist"])} — {e(row["title"])}{tag}</a>')
        sections.append(
            f'<section id="{anchor}"><h2>{e(row["artist"])} — {e(row["title"])}{tag}</h2>'
            f'<p class="sub">{facts(row, new)} · {clips}</p><div class="links">{links(row)}</div>'
            f'<div class="lists">{column("EffNet", f"{effnet_title}, 10 nearest", key)}'
            f'{column("CLAP", "CLAP, 10 nearest", key)}</div></section>')
    stores = [f"{model} store: {held.manifest['model']}, {len(held.keys):,} albums."  # which store each column is from
              for model, held in (("EffNet", effnet_dir and sonic.load_store(effnet_dir)), ("CLAP", sonic.load_store(clap_dir))) if held]
    if not effnet_dir:
        stores.insert(0, f"EffNet: no store; the stand-in, four-clip means of the clip cache, {len(eff_keys):,} albums.")
    both = len(set(lists["EffNet"]) & set(lists["CLAP"]))
    meta = (f"Generated {datetime.date.today().isoformat()}. Of {first.catalog_size:,} catalog albums {len(eff_keys):,} have EffNet "
            f"audio ({sum(map(is_new, eff_keys.tolist())):,} new) and {len(calbums):,} CLAP audio; {both:,} have both. Each list's "
            "candidates are every album of its own store. Audio block alone, euclidean, seed excluded, seed's artist kept. "
            "Links only.")
    head = "".join(f'<p class="meta">{e(x)}</p>' for x in [*stores, meta])
    return ("<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<title>Listening lists: EffNet and CLAP</title><style>{CSS}</style></head><body><main>"
            f"<h1>Listening lists: EffNet and CLAP</h1>{head}<nav>{''.join(toc)}</nav>{''.join(sections)}</main></body></html>\n")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--catalog", type=Path, default=sonic.DEFAULT_CATALOG)
    p.add_argument("--clap-dir", type=Path, default=sonic.STORES["clap"])
    p.add_argument("--effnet-dir", type=Path, default=sonic.default_effnet_dir(),
                   help="The EffNet store (default: audio/effnet10k when it is written and fitted).")
    p.add_argument("--effnet-stand-in", action="store_true",
                   help="The EffNet column of before that store: four-clip means of the cache, a PCA fitted here.")
    p.add_argument("--cache", type=Path, default=sonic.DEFAULT_CACHE_DB, help="The one-pass clip cache (opened read-only).")
    p.add_argument("--out", type=Path, default=RESULTS / "listening.html")
    args = p.parse_args(argv)
    text = page(args.catalog, args.clap_dir, args.cache, None if args.effnet_stand_in else args.effnet_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out} ({args.out.stat().st_size / 1024:.0f} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
