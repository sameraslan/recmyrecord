"""The numbers of docs/audio-10k-stage1.md, from the files: catalog/albums.csv, audio/keys.csv, audio/matches.csv,
catalog/doubtful_pairs.csv, the committed audio store, the one-pass clip cache (.cache/audio/onepass.sqlite,
gitignored, opened read-only) and the run logs in .cache/ (skipped when absent).

    cd data-pipeline && .venv/bin/python scripts/stage1_report.py [--seed 1] [--sample 40]

No network, no model, no audio; nothing is written. Runs in either environment (standard library, numpy and
rmr_pipeline). A "new" album is a catalog row with no row in keys.csv; an "ok clip" is a clip of the album's
listing in matches.csv whose embedding has status ok.
"""
import argparse
import csv
import random
import re
import sqlite3
import statistics
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

from rmr_pipeline.audio_store import duplicate_listings, load_matches, load_store  # noqa: E402

CACHE = HERE / ".cache" / "audio" / "onepass.sqlite"
LOGS = HERE / ".cache"
MODELS = ("effnet", "clap")
BANDS = ((1, 1000), (1001, 2500), (2501, 5000), (5001, 10000))
LINKS = ("bandcamp_url", "youtube_url", "soundcloud_url")
CLIPS = 4


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def head(title: str) -> None:
    print(f"\n## {title}")


def name(row: dict) -> str:
    year = f" ({row['year']})" if row.get("year") else ""
    return f"{row['artist']} — {row['title']}{year}"


def rank(row: dict) -> int:
    return int(row["rank"]) if row["rank"] else 10 ** 9


def band(row: dict) -> str:
    r = rank(row)
    return next((f"{a}-{b}" for a, b in BANDS if a <= r <= b), "no rank")


def links(row: dict) -> str:
    return ", ".join(c.split("_")[0] for c in LINKS if row[c]) or "none"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--sample", type=int, default=40)
    args = ap.parse_args()

    catalog = read_csv(HERE / "catalog" / "albums.csv")
    cat = {r["rym_id"]: r for r in catalog}
    existing = {r["rym_id"] for r in read_csv(HERE / "audio" / "keys.csv")}
    matches = load_matches(HERE / "audio" / "matches.csv")
    match = {r["key"]: r for r in matches}
    new = [r for r in catalog if r["rym_id"] not in existing]
    new_keys = {r["rym_id"] for r in new}
    store = load_store(HERE / "audio")
    con = sqlite3.connect(CACHE.resolve().as_uri() + "?mode=ro", uri=True)

    # ok clips of each album's listing in matches.csv, per model; every status of that listing
    listing = {r["key"]: (r["source"], r["source_album_id"]) for r in matches if r["source"]}
    ok = {m: Counter() for m in MODELS}
    status = {m: {} for m in MODELS}
    for key, source, album_id, model, st, n in con.execute(
            "SELECT key, source, album_id, model, status, COUNT(*) FROM embeddings GROUP BY 1, 2, 3, 4, 5"):
        if listing.get(key) == (source, album_id):
            status[model].setdefault(key, Counter())[st] = n
            if st == "ok":
                ok[model][key] = n
    previews = {k: n for k, s, a, n in con.execute("SELECT key, source, album_id, n_previews FROM listings")
                if listing.get(k) == (s, a)}

    head("Catalog and matches")
    print(f"catalog {len(catalog)} albums: {len(existing)} existing, {len(new)} new; matches.csv {len(matches)} rows; "
          f"same keys in the same order: {[r['rym_id'] for r in catalog] == [r['key'] for r in matches]}")
    path = Counter({"apple_id": "apple direct", "deezer_id": "deezer direct", "search": "text search",
                    "": "unmatched"}[match[k]["matched_by"]] if match[k]["source"] else "unmatched" for k in new_keys)
    print("new albums by path:", dict(path.most_common()))
    print("new albums by store:", dict(Counter(match[k]["source"].split(":")[0] or "none" for k in new_keys).most_common()))
    no_preview = [k for k in new_keys if not int(match[k]["n_clips_available"] or 0)]
    print(f"no preview: {len(no_preview)} ({sum(not match[k]['source'] for k in no_preview)} with no listing, "
          f"{sum(bool(match[k]['source']) for k in no_preview)} with a listing that has no preview)")
    print("ambiguous:", sum(match[k]["ambiguous"] == "1" for k in new_keys),
          "| under_covered:", sum(match[k]["under_covered"] == "1" for k in new_keys),
          "| edition:", dict(Counter(match[k]["edition"] for k in new_keys if match[k]["edition"])))
    print("existing albums: ambiguous", sum(match[k]["ambiguous"] == "1" for k in existing),
          "| no listing", sum(not match[k]["source"] for k in existing))

    head(f"New albums by number of ok clips (of {CLIPS} asked)")
    for m in MODELS:
        c = Counter(min(ok[m][k], CLIPS) for k in new_keys)
        print(f"{m:7}", "  ".join(f"{n} clips: {c[n]}" for n in range(CLIPS + 1)))
    print("4 clips for both models:", sum(ok["effnet"][k] >= CLIPS and ok["clap"][k] >= CLIPS for k in new_keys))
    print("the two models have the same count for every new album:",
          all(ok["effnet"][k] == ok["clap"][k] for k in new_keys))
    under = [k for k in new_keys if match[k]["source"] and min(ok["effnet"][k], ok["clap"][k]) < CLIPS]
    cause = Counter()
    failed = []
    for k in under:
        bad = sum(n for m in MODELS for st, n in status[m].get(k, {}).items() if st != "ok")
        have = previews.get(k, int(match[k]["n_clips_available"] or 0))
        if have == 0:
            cause["listing has no preview"] += 1
        elif have < CLIPS and ok["effnet"][k] == have == ok["clap"][k]:
            cause[f"listing has {have} preview{'s' if have > 1 else ''}, all embedded"] += 1
        else:
            cause["a clip failed and no other preview could replace it"] += 1
            failed.append((k, have, bad))
    print(f"matched new albums with under {CLIPS} ok clips: {len(under)}")
    for c, n in sorted(cause.items()):
        print(f"  {n:4}  {c}")
    for k, have, bad in sorted(failed, key=lambda t: rank(cat[t[0]])):
        print(f"    rank {cat[k]['rank']:>5} {k} {name(cat[k])}: {have} previews, ok effnet {ok['effnet'][k]} clap "
              f"{ok['clap'][k]}, statuses {dict(status['effnet'].get(k, {}))}")
    print("clip statuses, new albums' listings:",
          {m: dict(sum((status[m].get(k, Counter()) for k in new_keys), Counter())) for m in MODELS})

    head("New albums with no audio at all")
    silent = sorted((cat[k] for k in new_keys if not ok["effnet"][k] and not ok["clap"][k]), key=rank)
    print(f"{len(silent)} of {len(new)} new albums")
    print(f"{'rank band':12} {'albums':>6} {'bandcamp':>8} {'youtube':>8} {'soundcloud':>10} {'any':>5} {'none':>5}")
    for b in [f"{a}-{z}" for a, z in BANDS] + ["all"]:
        rows = [r for r in silent if b == "all" or band(r) == b]
        n = [sum(bool(r[c]) for r in rows) for c in LINKS]
        some = sum(any(r[c] for c in LINKS) for r in rows)
        print(f"{b:12} {len(rows):>6} {n[0]:>8} {n[1]:>8} {n[2]:>10} {some:>5} {len(rows) - some:>5}")
    print("of all new albums in each band:", {f"{a}-{z}": sum(band(r) == f"{a}-{z}" for r in new) for a, z in BANDS})
    print("with a spotify link:", sum(bool(r["spotify_url"]) for r in silent),
          "| by type:", dict(Counter(r["type"] for r in silent).most_common()))
    print("the 40 highest-ranked:")
    for r in silent[:40]:
        print(f"  {r['rank']:>5}  {r['rym_id']:14} {name(r)}  [{links(r)}]")

    head(f"Whole catalog ({len(catalog)})")
    in_store = set(store.keys.tolist())
    eff = {k for k in cat if ok["effnet"][k]} | in_store
    clap = {k for k in cat if ok["clap"][k]}
    print(f"committed store (EffNet, what the site is built from): {len(in_store)} albums, all existing: "
          f"{in_store <= existing}; clips per album {dict(sorted(Counter(store.n_clips.tolist()).items()))}")
    print(f"EffNet {len(eff)}, CLAP {len(clap)}, both {len(eff & clap)}, neither {len(set(cat) - eff - clap)}, "
          f"EffNet only {len(eff - clap)}, CLAP only {len(clap - eff)}")
    for label, keys in (("existing", existing), ("new", new_keys)):
        print(f"  {label}: {len(keys)} albums, EffNet {len(eff & keys)}, CLAP {len(clap & keys)}, "
              f"both {len(eff & clap & keys)}, neither {len(keys - eff - clap)}")
    print("existing albums by CLAP clips:", dict(sorted(Counter(min(ok["clap"][k], CLIPS) for k in existing).items())),
          "| by EffNet clips in the cache:", dict(sorted(Counter(ok["effnet"][k] for k in existing).items())))
    print("existing albums with EffNet and no CLAP:")
    for k in sorted((eff - clap) & existing):
        other = con.execute("SELECT source, album_id, model, status, COUNT(*) FROM embeddings WHERE key = ? "
                            "GROUP BY 1, 2, 3, 4", (k,)).fetchall()
        print(f"  {k} {name(cat[k])}: store source {match[k]['source']} {match[k]['source_album_id']} "
              f"({match[k]['matched_title']}); cache rows {other}")
    print("existing albums with neither:", len(existing - eff - clap),
          "| of them with no listing in matches.csv:", sum(not match[k]["source"] for k in existing - eff - clap))

    head("short_preview (a clip under 25 s from a track over 60 s)")
    print("flag per clip in the cache:", dict(con.execute(
        "SELECT CASE WHEN short_preview IS NULL THEN 'unknown' ELSE short_preview END, COUNT(*) FROM clips GROUP BY 1")))
    unknown = [r[0] for r in con.execute("SELECT key FROM clips WHERE short_preview IS NULL")]
    print(f"unknown = the track's length was never fetched: {sum(k in existing for k in unknown)} clips of existing "
          f"albums (imported), {sum(k in new_keys for k in unknown)} of new albums")
    flagged = con.execute("SELECT key, source, COUNT(*), GROUP_CONCAT(ROUND(clip_s, 1), ' ') FROM clips "
                          "WHERE short_preview = 1 GROUP BY 1, 2 ORDER BY 1").fetchall()
    by_source = Counter()
    albums_by_source = Counter()
    for k, source, n, _ in flagged:
        by_source[source.split(":")[0]] += n
        albums_by_source[source.split(":")[0]] += 1
    print(f"flagged: {sum(by_source.values())} clips of {len(flagged)} albums; clips by source {dict(by_source)}, "
          f"albums by source {dict(albums_by_source)}; new albums among them: {sum(k in new_keys for k, *_ in flagged)}")
    for k, source, n, secs in sorted(flagged, key=lambda t: rank(cat[t[0]])):
        print(f"  rank {cat[k]['rank']:>5} {k} {name(cat[k])}: {source}, {n} clips ({secs} s)")
    print("clips under 25 s whose track length is unknown (cannot be flagged):", con.execute(
        "SELECT COUNT(*), COUNT(DISTINCT key) FROM clips WHERE short_preview IS NULL AND clip_s < 25").fetchone())
    print("clip length in seconds, every decoded clip:")
    for label, where in (("all", "1"), ("deezer", "source = 'deezer'"), ("itunes", "source LIKE 'itunes%'"),
                         ("stage 1 (one-pass)", "short_preview IS NOT NULL")):
        s = sorted(r[0] for r in con.execute(f"SELECT clip_s FROM clips WHERE clip_s IS NOT NULL AND {where}"))
        q = lambda p: s[min(len(s) - 1, int(p * len(s)))]  # noqa: E731
        print(f"  {label:20} n {len(s):>6}  min {s[0]:.1f}  p1 {q(.01):.1f}  p5 {q(.05):.1f}  median {statistics.median(s):.1f}"
              f"  max {s[-1]:.1f}  under 25 s: {sum(x < 25 for x in s)}  under 10 s: {sum(x < 10 for x in s)}")

    head("under_covered (1 to 3 previews for a listing of 15 minutes or more)")
    uc = sorted((cat[k] for k in new_keys if match[k]["under_covered"] == "1"), key=rank)
    print(f"{len(uc)} new albums; by previews available: "
          f"{dict(sorted(Counter(match[r['rym_id']]['n_clips_available'] for r in uc).items()))}; "
          f"by store: {dict(Counter(match[r['rym_id']]['source'].split(':')[0] for r in uc))}")
    print("the flag is empty for the existing albums (matched before the column existed)")
    for r in uc[:20]:
        m = match[r["rym_id"]]
        print(f"  {r['rank']:>5}  {r['rym_id']:14} {name(r)}: {m['source']}, {m['n_clips_available']} previews of "
              f"{m['n_tracks']} tracks, {float(m['runtime_s'] or 0) / 60:.0f} min")

    head("Ambiguous matches among new albums")
    amb = [r for r in new if match[r["rym_id"]]["ambiguous"] == "1"]
    print(f"{len(amb)}; by path: {dict(Counter(match[r['rym_id']]['matched_by'] for r in amb).most_common())}; "
          f"by rank band: {dict(Counter(band(r) for r in amb))}")
    print("share of each path:", {p: f"{sum(match[r['rym_id']]['matched_by'] == p for r in amb)}/"
                                     f"{sum(match[k]['matched_by'] == p for k in new_keys)}"
                                  for p in ("apple_id", "deezer_id", "search")})
    print(f"random sample of {args.sample} (random.Random({args.seed}).sample over catalog order):")
    for i, r in enumerate(sorted(random.Random(args.seed).sample(amb, min(args.sample, len(amb))), key=rank), 1):
        m = match[r["rym_id"]]
        latin = " / ".join(x for x in (r["artist_latin"], r["title_latin"]) if x)
        print(f"  {i:2}. rank {r['rank']:>5} {r['rym_id']} [{m['matched_by']}, {m['source']}, score {m['score']}]\n"
              f"      catalog: {name(r)}" + (f"  (latin: {latin})" if latin else "") +
              f"\n      matched: {m['matched_artist']} — {m['matched_title']}  ({m['n_tracks']} tracks)")

    head("Duplicate listings (two catalog albums on one store listing)")
    doubt = {}
    for d in read_csv(HERE / "catalog" / "doubtful_pairs.csv"):
        doubt[frozenset((d["legacy_key"], d["rym_id"]))] = d
    dupes = duplicate_listings(matches)
    kinds = Counter()
    for (shop, album_id), keys in dupes.items():
        placeholder = [k for k in keys if k.startswith("sp:")]
        d = doubt.get(frozenset(keys))
        kind = ("placeholder + chart row" if placeholder else "two chart rows") + (
            f"; in doubtful_pairs ({d['reason']}, {d['default']})" if d else "; not in doubtful_pairs")
        kinds[kind.split(" (")[0]] += 1
        print(f"  {shop} {album_id}: {match[keys[0]]['matched_artist']} — {match[keys[0]]['matched_title']}  [{kind}]")
        for k in keys:
            r = cat[k]
            print(f"      {k:26} rank {r['rank'] or '-':>5} {'new' if k in new_keys else 'existing'}  {name(r)}  "
                  f"[{match[k]['matched_by'] or 'old match'}, ambiguous {match[k]['ambiguous']}]")
    print(f"{len(dupes)} listings, {sum(len(v) for v in dupes.values())} albums:", dict(kinds))
    print("with a new album on at least one side:", sum(bool(new_keys & set(v)) for v in dupes.values()))
    print("(which side is wrong, and whether two rows are one release, is a reading of the names: see the report)")

    head("Cache and run cost")
    print(f"{CACHE.name}: {CACHE.stat().st_size / 1e6:.0f} MB; clips {con.execute('SELECT COUNT(*) FROM clips').fetchone()[0]}; "
          f"listings {con.execute('SELECT COUNT(*) FROM listings').fetchone()[0]}")
    for model, origin, st, n in con.execute("SELECT model, origin, status, COUNT(*) FROM embeddings GROUP BY 1, 2, 3"):
        print(f"  {model:7} {origin:26} {st:12} {n}")
    for log in ("match-new.log", "match-new-nolink.log", "stage1-deezer.log", "stage1-apple.log", "stage1-nolink.log"):
        p = LOGS / log
        if not p.exists():
            print(f"  {log}: not here")
            continue
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            if re.match(r"(match-new finished|finished:|peak memory|model seconds|4 clips per album)", line) or (
                    line.startswith("[") and "/min" in line and re.search(r"\] (\d+)/\1 albums", line)):
                print(f"  {log}: {line}")
    con.close()


if __name__ == "__main__":
    main()
