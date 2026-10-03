"""`python -m rmr_audio match-dry-run --sample N --seed S --out DIR`: what the matcher gives the new albums.

Matches a random sample of the catalog's new on-chart albums, stratified by chart rank, and writes
DIR/matches_dry_run.csv (one row per album) and DIR/summary.md (and summary.json). It asks the stores for
metadata only: no audio is downloaded, and neither the store nor matches.csv is written (matches.csv is
read, for the duplicate guard). The API responses are cached, so the matching that follows asks for less.
The requests counted per album are the distinct URLs its matching needs, whether or not the cache had
them, so a run repeated over a warm cache reports the same counts; the projection is those counts times
the intervals between requests.

The run stops, and writes what it has, when a store stops answering or albums fail in a row: it does
not insist against a store that is refusing requests.

Everything here is read from store metadata. It says whether a listing was found, how it reads, how many
tracks have a preview and how long the listing is. It does not say whether the listing is the right
recording: nothing is listened to.
"""
import csv
import json
import random
import time
from collections import Counter
from pathlib import Path

from rmr_pipeline.audio_store import duplicate_listings, load_matches

from . import match as matching
from .catalog import Album

FIELDS = ["rank", "key", "artist", "title", "artist_latin", "title_latin", "links", "path", "source", "source_album_id",
          "matched_title", "matched_artist", "score", "ambiguous", "n_tracks", "n_previews", "runtime_s",
          "under_covered", "edition", "linked_id", "reason", "error", "deezer_requests", "itunes_requests", "seconds"]
STRATA = 10
MAX_FAILED_IN_A_ROW = 2  # albums; a store that fails STORE_DOWN_AFTER URLs in a row stops the run as well
EXAMPLES = 10


def link_class(al: Album) -> str:
    return "deezer link" if al.deezer_id else "apple link, no deezer" if al.apple_link else "no store link"


def stratified_sample(catalog: list[Album], n: int, seed: int, strata: int = STRATA) -> list[Album]:
    """n of the new on-chart albums: the albums in rank order are cut into `strata` runs of equal size and
    each gives its share (largest remainders first), drawn with random.Random(seed). Returned by rank."""
    pool = sorted((al for al in catalog if al.new and al.rank), key=lambda al: al.rank)
    n = min(n, len(pool))
    if n <= 0:
        return []
    strata = max(1, min(strata, n))
    bounds = [round(i * len(pool) / strata) for i in range(strata + 1)]
    groups = [pool[a:b] for a, b in zip(bounds, bounds[1:])]
    exact = [n * len(g) / len(pool) for g in groups]
    take = [int(x) for x in exact]
    for i in sorted(range(strata), key=lambda i: exact[i] - take[i], reverse=True)[:n - sum(take)]:
        take[i] += 1
    rng = random.Random(seed)
    return sorted((al for g, k in zip(groups, take) for al in rng.sample(g, k)), key=lambda al: al.rank)


def path_of(m: matching.Match) -> str:
    """How the album got its listing, as the summary counts it."""
    if not m.source:
        return "unmatched"
    if m.matched_by == "deezer_id":
        return "deezer direct"
    if m.matched_by == "apple_id":
        return f"apple direct ({matching.storefront_of(m.source)})"
    return f"text search ({m.source})"


def record(al: Album, m: matching.Match | None, error: str = "", requests: Counter | None = None,
           seconds: float = 0.0) -> dict:
    requests = requests or Counter()
    base = {"rank": al.rank, "key": al.key, "artist": al.artist, "title": al.title, "artist_latin": al.artist_latin,
            "title_latin": al.title_latin, "links": link_class(al), "error": error,
            "deezer_requests": requests["deezer"], "itunes_requests": requests["itunes"], "seconds": f"{seconds:.1f}"}
    if m is None:
        return {**dict.fromkeys(FIELDS, ""), **base, "path": "error"}
    row = m.row(al.key)
    return {**dict.fromkeys(FIELDS, ""), **base, "path": path_of(m), "source": m.source, "source_album_id": m.album_id,
            "matched_title": m.title, "matched_artist": m.artist, "score": row["score"], "ambiguous": int(m.ambiguous),
            "n_tracks": row["n_tracks"], "n_previews": row["n_clips_available"], "runtime_s": row["runtime_s"],
            "under_covered": row["under_covered"], "edition": m.edition, "linked_id": m.linked_id, "reason": m.reason}


def _rate(k: int, n: int) -> str:
    return f"{k} of {n} ({100 * k / n:.1f}%)" if n else "0 of 0"


def _example(r: dict) -> str:
    listing = f"{r['source']} {r['source_album_id']}: {r['matched_artist']} / {r['matched_title']}, " \
              f"{r['n_previews']}/{r['n_tracks']} previews" if r["source"] else "no listing"
    return f"- #{r['rank']} {r['artist']} / {r['title']} [{r['links']}] -> {listing}" + (f" ({r['reason']})" if r["reason"] else "")


def summarise(rows: list[dict], catalog: list[Album], existing: list[dict], meta: dict) -> dict:
    """The counts of a run. Every rate comes with its n."""
    done = [r for r in rows if r["path"] != "error"]
    n = len(done)
    matched = [r for r in done if r["source"]]
    previews = lambda r: int(r["n_previews"] or 0)  # noqa: E731
    with_audio = [r for r in matched if previews(r)]
    silent = [r for r in done if not previews(r)]
    classes = ("deezer link", "apple link, no deezer", "no store link")
    by_class = {}
    for c in classes:
        mine = [r for r in done if r["links"] == c]
        by_class[c] = {
            "albums": len(mine), "no_preview": sum(not previews(r) for r in mine),
            "ambiguous": sum(r["ambiguous"] == 1 for r in mine),
            "under_covered": sum(r["under_covered"] == 1 for r in mine),
            "deezer_requests": sum(r["deezer_requests"] for r in mine), "itunes_requests": sum(r["itunes_requests"] for r in mine),
            "seconds": round(sum(float(r["seconds"]) for r in mine), 1)}
    population = Counter(link_class(al) for al in catalog if al.new)
    projection = {"albums": sum(population.values()), "deezer_requests": 0, "itunes_requests": 0}
    for c in classes:
        k = by_class[c]["albums"]
        if k:
            for f in ("deezer_requests", "itunes_requests"):
                projection[f] += by_class[c][f] / k * population[c]
    projection = {k: round(v) for k, v in projection.items()}
    projection["seconds"] = round(projection["deezer_requests"] * meta["deezer_interval"]
                                  + projection["itunes_requests"] * meta["itunes_interval"])
    reason = lambda text: [r for r in done if text in r["reason"]]  # noqa: E731
    sample_rows = [{"key": r["key"], "source": r["source"], "source_album_id": r["source_album_id"]} for r in matched]
    sample_keys = {r["key"] for r in sample_rows}
    dupes = {f"{store} {album_id}": keys for (store, album_id), keys in
             duplicate_listings([e for e in existing if e["key"] not in sample_keys] + sample_rows).items()
             if sample_keys & set(keys)}
    windows = Counter(min(previews(r), 8) for r in done)
    return {
        **meta, "albums_done": n, "api_errors": [{"key": r["key"], "error": r["error"]} for r in rows if r["path"] == "error"],
        "by_path": dict(Counter(r["path"] for r in done).most_common()),
        "by_link_class": by_class, "new_albums_by_link_class": dict(population),
        "no_preview": {"albums": len(silent), "of": n, "unmatched": n - len(matched),
                       "matched_without_preview": len(matched) - len(with_audio)},
        "ambiguous": {"albums": sum(r["ambiguous"] == 1 for r in done), "of": n,
                      "with_previews": sum(r["ambiguous"] == 1 for r in with_audio), "of_with_previews": len(with_audio)},
        "under_covered": {"albums": sum(r["under_covered"] == 1 for r in done), "of": n},
        "edition_rule": {"oversized_replaced_by_standard": sum(r["edition"] == "standard" for r in done),
                         "oversized_kept": len(reason("no standard one was found")),
                         "few_tracks_replaced_by_split": sum(r["edition"] == "split" for r in done),
                         "few_tracks_kept": len(reason("no split edition was found"))},
        "fallbacks": {"dead_links_then_search": len(reason("no store link resolves")),
                      "linked_without_preview_then_search": len(reason("the linked listing has no preview")),
                      "linked_without_preview_kept": len(reason("the search found none either")),
                      "deezer_link_but_apple_used": sum(r["links"] == "deezer link" and r["path"].startswith("apple direct")
                                                        for r in done)},
        "duplicate_listings": dupes,
        "preview_windows": {("8+" if k == 8 else str(k)): windows[k] for k in range(9)},
        "projection_all_new_albums": projection,
        "examples": {
            "no_preview": [_example(r) for r in silent[:EXAMPLES]],
            "ambiguous": [_example(r) for r in done if r["ambiguous"] == 1][:EXAMPLES],
            "edition_replaced": [_example(r) + f" [was {r['linked_id']}: {r['edition']}]" for r in done if r["edition"]][:EXAMPLES],
            "under_covered": [_example(r) for r in done if r["under_covered"] == 1][:EXAMPLES]},
    }


def markdown(s: dict) -> str:
    n = s["albums_done"]
    lines = [
        "# Matcher dry run", "",
        f"{s['sample']} new on-chart albums sampled (seed {s['seed']}, {STRATA} rank strata), {n} matched to the end, "
        f"{len(s['api_errors'])} API errors. {s['requests'].get('deezer', 0)} Deezer and {s['requests'].get('itunes', 0)} "
        f"iTunes URLs asked for, {s['fetched'].get('deezer', 0)} and {s['fetched'].get('itunes', 0)} of them fetched (the "
        f"rest came from the response cache), in {s['seconds']:.0f} s (Deezer one every {s['deezer_interval']} s, iTunes "
        f"one every {s['itunes_interval']} s)." + (f" **Stopped early: {s['stopped']}.**" if s["stopped"] else ""), "",
        "Store metadata only: no audio was downloaded and nothing was listened to. The numbers say whether a "
        "listing was found, how its title and artist read and how many of its tracks have a preview; they do not "
        "say whether it is the right recording.", "",
        "## By path", "", "| Path | Albums |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in s["by_path"].items()]
    lines += ["", "## By the links of the catalog row", "",
              "| Links | Albums | No preview | Ambiguous | Under-covered | Deezer requests | iTunes requests | Seconds |",
              "|---|---|---|---|---|---|---|---|"]
    for c, v in s["by_link_class"].items():
        k = v["albums"]
        lines.append(f"| {c} | {k} | {_rate(v['no_preview'], k)} | {_rate(v['ambiguous'], k)} | "
                     f"{_rate(v['under_covered'], k)} | {v['deezer_requests']} | {v['itunes_requests']} | {v['seconds']:.0f} |")
    np_, am, uc, ed, fb = s["no_preview"], s["ambiguous"], s["under_covered"], s["edition_rule"], s["fallbacks"]
    lines += ["", "## Rates", "",
              f"- No preview: {_rate(np_['albums'], np_['of'])}: {np_['unmatched']} with no listing, "
              f"{np_['matched_without_preview']} with a listing that has no preview.",
              f"- Ambiguous: {_rate(am['albums'], am['of'])}; among the albums with previews "
              f"{_rate(am['with_previews'], am['of_with_previews'])}.",
              f"- Under-covered (1 to {matching.MIN_WINDOWS - 1} preview windows, {matching.LONG_S // 60} minutes or more): "
              f"{_rate(uc['albums'], uc['of'])}.",
              "- `short_preview`: not determined. Neither API gives a preview's length; the embedder sets it.",
              f"- Edition rule: {ed['oversized_replaced_by_standard']} oversized listings replaced by the standard edition, "
              f"{ed['oversized_kept']} kept (none found); {ed['few_tracks_replaced_by_split']} listings of 1 to "
              f"{matching.FEW_TRACKS} tracks replaced by a split edition, {ed['few_tracks_kept']} kept (none found).",
              f"- Fallbacks: {fb['deezer_link_but_apple_used']} albums whose Deezer listing had no preview took the Apple "
              f"link; {fb['linked_without_preview_then_search']} took a searched listing; {fb['linked_without_preview_kept']} "
              f"kept a linked listing without previews; {fb['dead_links_then_search']} had links that no longer resolve.",
              f"- Duplicate listings (two albums, one store listing; the sample against itself and matches.csv): "
              f"{len(s['duplicate_listings'])}" + "".join(f"\n  - {k}: {', '.join(v)}" for k, v in s["duplicate_listings"].items()),
              f"- API errors: {len(s['api_errors'])}" + "".join(f"\n  - {e['key']}: {e['error']}" for e in s["api_errors"]),
              "", "## Preview windows available per album", "", "| Windows | Albums |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in s["preview_windows"].items()]
    p = s["projection_all_new_albums"]
    lines += ["", "## Projection", "",
              f"All {p['albums']} new albums, at this sample's requests per album in each link class: about "
              f"{p['deezer_requests']} Deezer and {p['itunes_requests']} iTunes requests, {p['seconds'] / 3600:.1f} hours "
              "in one process at these intervals (requests times interval; less what the response cache already holds)."]
    for name, title in (("no_preview", "No preview"), ("ambiguous", "Ambiguous"), ("edition_replaced", "Edition replaced"),
                        ("under_covered", "Under-covered")):
        lines += ["", f"## Examples: {title}", ""] + (s["examples"][name] or ["- none"])
    return "\n".join(lines) + "\n"


def dry_run(catalog: list[Album], out_dir: Path, sample: int, seed: int, cache: Path | None, audio_dir: Path,
            storefronts: tuple[str, ...] = matching.DEFAULT_STOREFRONTS, deezer_interval: float = 0.35,
            itunes_interval: float = 3.4, http=None, out=print) -> int:
    """Match the sample and write the CSV and the summary into `out_dir`. Returns 0, or 2 when the run was
    stopped because a store was not answering."""
    albums = stratified_sample(catalog, sample, seed)
    if http is None:
        http = matching.Http(cache, attempts=2)
        http.throttles["deezer"].interval, http.throttles["itunes"].interval = deezer_interval, itunes_interval
    rows, failed, stopped, t0 = [], 0, "", time.monotonic()
    asked = lambda: Counter(getattr(http, "asked_by", {}))  # noqa: E731
    for i, al in enumerate(albums, 1):
        before, t = asked(), time.monotonic()
        try:
            m, error = matching.match_album(http, al, storefronts), ""
            failed = 0
        except Exception as e:  # the album is reported, the run goes on unless the store keeps failing
            m, error, failed = None, f"{type(e).__name__}: {e}"[:200], failed + 1
        rows.append(record(al, m, error, asked() - before, time.monotonic() - t))
        r = rows[-1]
        out(f"{i}/{len(albums)}\t#{al.rank}\t{r['path']}\t{al.artist} — {al.title}\t"
            + (f"{r['matched_artist']} — {r['matched_title']}\t{r['n_previews']}/{r['n_tracks']} previews"
               + ("\tAMBIGUOUS" if r["ambiguous"] == 1 else "") + (f"\t{r['reason']}" if r["reason"] else "")
               if r["source"] else r["error"] or r["reason"]))
        down = http.down() if hasattr(http, "down") else []
        if down or failed >= MAX_FAILED_IN_A_ROW:
            stopped = (f"{' and '.join(down)} stopped answering" if down else f"{failed} albums failed in a row") \
                      + f" after {i} of {len(albums)} albums"
            break
    matches = audio_dir / "matches.csv"
    meta = {"sample": len(albums), "seed": seed, "storefronts": list(storefronts), "deezer_interval": deezer_interval,
            "itunes_interval": itunes_interval, "requests": dict(asked()), "fetched": dict(getattr(http, "fetched_by", {})),
            "seconds": round(time.monotonic() - t0, 1),
            "stopped": stopped}
    summary = summarise(rows, catalog, load_matches(matches) if matches.exists() else [], meta)
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "matches_dry_run.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out_dir / "summary.md").write_text(markdown(summary), encoding="utf-8")
    out(f"wrote {out_dir / 'matches_dry_run.csv'} and {out_dir / 'summary.md'}" + (f"; STOPPED: {stopped}" if stopped else ""))
    return 2 if stopped else 0
