"""The network side of store_effect_fix.py, run as its child in the pipeline's audio environment (pandas,
rapidfuzz, Essentia: what rmr_audio.match and rmr_audio.embed import and the torch environment lacks).

It picks the albums, asks both stores for their track listings with the matcher's own code
(rmr_audio.match: Http, tracks; the Apple id in its link's storefront, then `us`), pairs the tracks,
downloads both previews (rmr_audio.embed.download) and writes them to stdout as records for the parent, which
decodes and embeds them. With --effnet it also embeds each preview with Discogs-EffNet (rmr_audio.embed's
decode and embed, as the pipeline does) and sends the 1,280 numbers along. Then, for the paired albums with
a YouTube link, the full-length part: rmr_audio.fulllength's metadata classifier and yt-dlp wrapper, 30 s
windows by rmr_audio.windows, each decoded by ffmpeg and sent as samples; the downloaded file is deleted in a
`finally`.

No audio is written by this process except what those existing paths write and remove (the preview's temp
file for Essentia's loader, unlinked right after decoding; yt-dlp's download folder under
cache/store_effect_tmp/, removed in a `finally` and at start). Nothing is written outside
experiments/audio_10k/cache/. Logs go to stderr.

Record on stdout: 4-byte little-endian header length, the JSON header, then header["sizes"] payloads end to end.
  pair    two payloads: the Deezer preview's bytes (MP3) and the iTunes preview's (M4A)
  album   no payload: what became of the album
  ytwin   one payload: float32 mono 44.1 kHz samples of one window
  yt      no payload: what became of the album's YouTube link
  end     no payload: why the run ended

Rates: iTunes one API call per 3.4 s (under 18 a minute), Deezer one per 0.34 s (under 3 a second), one
attempt per URL; any rate-limit answer ends the run. YouTube: no cookies or account (fulllength.YtDlp), 5 to
7.5 s between albums, the run's YouTube part ends on any sign of blocking.
"""
import argparse
import csv
import hashlib
import json
import os
import random
import shutil
import struct
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "data-pipeline"))
sys.path.append(str(REPO / "experiments" / "preview_features"))

import requests  # noqa: E402

from rmr_audio import embed, fulllength, windows  # noqa: E402
from rmr_audio.catalog import APPLE_LINK, DEEZER_LINK  # noqa: E402
from rmr_audio.match import Http, tracks  # noqa: E402
from rmr_audio.textnorm import norm  # noqa: E402

CACHE = HERE / "cache"
CATALOG = REPO / "data-pipeline" / "catalog" / "albums.csv"
TMP = CACHE / "store_effect_tmp"
PER_ALBUM = 3
DURATION_TOL_S = 2.0
YT_WINDOWS = 6
MIN_FREE = 5 * 2 ** 30
OUT = sys.stdout.buffer


def log(*a) -> None:
    print(time.strftime("[%H:%M:%S]"), *a, file=sys.stderr, flush=True)


def send(header: dict, *payloads: bytes) -> None:
    header = header | {"sizes": [len(p) for p in payloads]}
    h = json.dumps(header, ensure_ascii=False).encode()
    OUT.write(struct.pack("<I", len(h)) + h)
    for p in payloads:
        OUT.write(p)
    OUT.flush()


def decade(year: str) -> str:
    y = int(year[:4]) if year[:4].isdigit() else 0
    return "?" if not y else "pre-1970" if y < 1970 else "2010+" if y >= 2010 else f"{y // 10 * 10}s"


def first_genre(row: dict) -> str:
    return next((g.strip() for g in (row.get("primary_genres") or "").split(",") if g.strip()), "")


def candidates(seed: int) -> list[dict]:
    """The catalog's albums with both a Deezer and an Apple Music link, in the order they are tried: cells of
    (on the site or new) x decade x genre family, visited in turn (cells and albums shuffled with `seed`), an
    album with a YouTube link before one without in every other visit of a cell, so that about half of the
    sample can be checked against YouTube."""
    try:
        from genres import family
    except Exception as e:  # the family rules need the experiment's helpers; without them the first genre itself
        log(f"genre families not available ({type(e).__name__}): cells by first genre")
        family = lambda g: g  # noqa: E731
    with open(CATALOG, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if DEEZER_LINK.search(r["deezer_url"]) and APPLE_LINK.search(r["apple_music_url"])]
    rng = random.Random(seed)
    rng.shuffle(rows)
    cells = defaultdict(lambda: {True: [], False: []})
    for r in rows:
        g = first_genre(r)
        r["_family"], r["_decade"], r["_new"] = (family(g) if g else "?"), decade(r.get("year", "")), not r.get("legacy_uri")
        cells[(r["_new"], r["_decade"], r["_family"])][bool(r.get("youtube_url"))].append(r)
    order = sorted(cells)
    rng.shuffle(order)
    out, turn = [], 0
    while any(c[True] or c[False] for c in cells.values()):
        for k in order:
            c = cells[k]
            want = turn % 2 == 0
            pick = c[want] or c[not want]
            if pick:
                out.append(pick.pop())
        turn += 1
    return out


def paired(dz: list[dict], it: list[dict]) -> list[tuple[dict, dict]]:
    """Tracks the two listings share: the same normalised title and a duration within 2 s, both with a
    preview, each track used once, in the Deezer listing's order."""
    used, out = set(), []
    for a in dz:
        if not a["preview_url"] or not norm(a["title"]):
            continue
        for j, b in enumerate(it):
            if j in used or not b["preview_url"]:
                continue
            if norm(a["title"]) == norm(b["title"]) and abs(a["duration_s"] - b["duration_s"]) <= DURATION_TOL_S:
                used.add(j)
                out.append((a, b))
                break
    return out


def spread(n: int, k: int = PER_ALBUM) -> list[int]:
    return list(range(n)) if n <= k else sorted({int((i + 0.5) / k * n) for i in range(k)})


def effnet(data: bytes, suffix: str) -> list | None:
    try:
        v, _ = embed.embed(embed.decode(data, suffix))
        return None if v is None else [round(float(x), 5) for x in v]
    except Exception as e:
        log(f"  effnet failed: {type(e).__name__}: {e}"[:200])
        return None


def previews(args, done: dict) -> list[dict]:
    """Returns the rows of the albums that have pairs (earlier runs' and this one's)."""
    http = Http(CACHE / "store_effect_http.sqlite", attempts=1)
    http.throttles["itunes"].interval, http.throttles["deezer"].interval = 3.4, 0.34
    ok = [k for k, a in done.items() if a.get("status") == "ok"]
    rows_ok, n_ok = [], len(ok)
    for i, row in enumerate(candidates(args.seed)):
        key = row["rym_id"]
        if key in done and done[key].get("status") != "failed":  # a failed album (the network) is asked for again
            if done[key].get("status") == "ok":
                rows_ok.append(row)
            continue
        if n_ok >= args.albums:
            break
        if http.limited["deezer"] or http.limited["itunes"] or http.down():
            send({"type": "end", "reason": f"rate limited or store down: {dict(http.limited)} {http.down()}"})
            log("a store answered with a rate limit or stopped answering: stopping")
            return rows_ok
        head = {"type": "album", "key": key, "artist": row["artist"], "title": row["title"], "year": row.get("year", ""),
                "primary_genres": row.get("primary_genres", ""), "family": row["_family"], "decade": row["_decade"],
                "new": row["_new"], "has_youtube": bool(row.get("youtube_url")), "candidate": i}
        try:
            cc, apple_id = APPLE_LINK.search(row["apple_music_url"]).groups()
            dz_id = DEEZER_LINK.search(row["deezer_url"]).group(1)
            it, source = [], ""
            for c in dict.fromkeys((cc, "us")):
                it, source = tracks(http, f"itunes:{c}", apple_id), f"itunes:{c}"
                if it:
                    break
            dz = tracks(http, "deezer", dz_id, fresh=True) if it else []  # signed URLs: asked right before downloading
            pairs = paired(dz, it)
            head |= {"deezer_id": dz_id, "itunes_source": source, "itunes_id": apple_id, "n_deezer": len(dz), "n_itunes": len(it),
                     "n_paired": len(pairs), "deezer_runtime_s": round(sum(t["duration_s"] for t in dz), 1)}
            sent = 0
            for unit in spread(len(pairs)):
                a, b = pairs[unit]
                try:
                    da, db = embed.download(a["preview_url"]), embed.download(b["preview_url"])
                except IOError as e:
                    log(f"  {key} track {unit}: download failed ({e})")
                    continue
                h = {"type": "pair", "key": key, "unit": unit, "title": a["title"], "itunes_title": b["title"],
                     "deezer_track": a["track_id"], "itunes_track": b["track_id"], "position": a["position"],
                     "duration_s": a["duration_s"], "itunes_duration_s": b["duration_s"],
                     "suffixes": [".mp3", "." + b["preview_url"].rsplit(".", 1)[-1].split("?")[0][:4]]}
                if args.effnet:
                    h["effnet"] = [effnet(da, ".mp3"), effnet(db, h["suffixes"][1])]
                send(h, da, db)
                sent += 1
            head["status"] = "ok" if sent else ("no_pairs" if not pairs else "download_failed")
            head["n_sent"] = sent
        except (IOError, requests.RequestException, ValueError, KeyError) as e:
            head |= {"status": "failed", "error": f"{type(e).__name__}: {e}"[:200]}
        send(head)
        done[key] = head
        if head["status"] == "ok":
            n_ok += 1
            rows_ok.append(row)
        log(f"{n_ok}/{args.albums} (candidate {i})\t{key}\t{head['status']}\t{head.get('n_paired', '-')} paired of "
            f"{head.get('n_deezer', '-')}/{head.get('n_itunes', '-')}\t{row['artist']} — {row['title']}")
    if http.limited["deezer"] or http.limited["itunes"]:
        send({"type": "end", "reason": f"rate limited: {dict(http.limited)}"})
    return rows_ok


def youtube(args, rows: list[dict], done: dict, yt_done: dict) -> None:
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    fetcher = fulllength.YtDlp(REPO / "data-pipeline" / ".venv-fetch" / "bin" / "python")
    mono_of_wav = fulllength.clap_catalog().mono_of_wav
    todo = [r for r in rows if r.get("youtube_url")]
    random.Random(args.seed).shuffle(todo)
    n_ok = sum(1 for y in yt_done.values() if y.get("status") == "embedded")
    unavailable, failures, asked = 0, 0, False
    for row in todo:
        key, url = row["rym_id"], row["youtube_url"]
        if key in yt_done:
            continue
        if n_ok >= args.youtube:
            break
        if asked:
            time.sleep(5.0 * random.uniform(1.0, 1.5))
        asked = True
        out = {"type": "yt", "key": key, "url": url, "status": "failed", "class": ""}
        folder = TMP / hashlib.sha1(f"youtube:{key}".encode()).hexdigest()[:12]
        blocked = False
        try:
            al = dict(row) | {"key": key}
            runtime = (done.get(key) or {}).get("deezer_runtime_s") or None
            verdict = fulllength.classify(fetcher.info(url, "youtube"), al, "youtube", url, runtime)
            out |= {"class": verdict.cls, "reason": verdict.reason, "duration_s": verdict.duration_s, "video_title": verdict.title,
                    "uploader": verdict.uploader, "video_id": verdict.album_id, "status": "skipped"}
            if verdict.cls == "full_album":
                out["status"] = "failed"
                if shutil.disk_usage(CACHE).free < MIN_FREE:
                    send({"type": "end", "reason": "under 5 GB of free disk"})
                    return
                folder.mkdir(parents=True)
                files = fetcher.download(url, "youtube", folder)
                out["bytes"] = sum(p.stat().st_size for p in files)
                dur = windows.probe_duration(files[0], ffprobe)
                p = subprocess.run([ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries",
                                    "stream=codec_name,sample_rate,channels,bit_rate:format=bit_rate", "-of", "json", str(files[0])],
                                   capture_output=True, timeout=60)
                try:
                    info = json.loads(p.stdout.decode() or "{}")
                    st = (info.get("streams") or [{}])[0]
                    out["probe"] = {"codec": st.get("codec_name"), "sample_rate": st.get("sample_rate"), "channels": st.get("channels"),
                                    "bit_rate": st.get("bit_rate") or (info.get("format") or {}).get("bit_rate")}
                except ValueError:
                    out["probe"] = {}
                sent = 0
                for w in windows.plan([dur or 0.0], k=windows.MAX_WINDOWS):
                    if w.rank >= YT_WINDOWS:
                        continue
                    try:
                        mono = windows.decode_window(files[0], w.start_s, w.length_s, ffmpeg, mono_of_wav)
                    except Exception as e:
                        log(f"  {key} window {w.rank}: {type(e).__name__}: {e}"[:200])
                        continue
                    send({"type": "ytwin", "key": key, "unit": w.rank, "start_s": round(w.start_s, 2), "index": w.index},
                         mono.astype("<f4").tobytes())
                    sent += 1
                out |= {"status": "embedded" if sent else "failed", "n_windows": sent, "file_s": dur}
        except fulllength.Blocked as e:
            out |= {"status": "blocked", "error": str(e)}
            blocked = True
        except fulllength.Unavailable as e:
            out |= {"class": "unavailable", "status": "skipped", "error": str(e)}
        except fulllength.FetchError as e:
            out["error"] = str(e)
        finally:
            shutil.rmtree(folder, ignore_errors=True)  # the audio is never kept
        send(out)
        n_ok += out["status"] == "embedded"
        log(f"youtube {n_ok}/{args.youtube}\t{key}\t{out['status']}\t{out['class'] or '-'}\t{out.get('reason', out.get('error', ''))}"
            f"\t{row['artist']} — {row['title']} || {out.get('video_title', '')}")
        failures = failures + 1 if out["status"] == "failed" else 0
        unavailable = unavailable + 1 if out["class"] == "unavailable" else 0
        if blocked:
            send({"type": "end", "reason": "youtube is refusing or rate-limiting: stopped"})
            return
        if failures >= 3 or unavailable >= fulllength.UNAVAILABLE_IN_A_ROW:
            send({"type": "end", "reason": f"youtube: {failures} failures / {unavailable} unavailable in a row: stopped"})
            return


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--albums", type=int, default=120)
    ap.add_argument("--youtube", type=int, default=25)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--effnet", default="")
    ap.add_argument("--state", required=True, help="JSON written by the parent: what earlier runs finished")
    args = ap.parse_args()
    try:
        os.nice(19)
    except OSError:
        pass
    state = json.loads(Path(args.state).read_text())
    CACHE.mkdir(exist_ok=True)
    shutil.rmtree(TMP, ignore_errors=True)  # what a killed run left
    TMP.mkdir(parents=True)
    try:
        if args.effnet:
            embed.init_worker(args.effnet, str(TMP))
        else:
            embed.WORKER.update(session=requests.Session())
        rows = previews(args, state["albums"])
        if args.youtube:
            youtube(args, rows, state["albums"], state["youtube"])
        send({"type": "end", "reason": "finished"})
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
