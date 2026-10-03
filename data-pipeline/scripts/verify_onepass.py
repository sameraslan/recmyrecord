"""Does the one-pass embedder give the vectors the two separate programs gave? Run it alone, when no other
model job is running:

  cd data-pipeline
  nice -n 19 .venv-audio/bin/python scripts/verify_onepass.py \\
      --effnet-db <clips.sqlite> --clap-db <clap_clips.sqlite> [--other-lock <clap_clips.lock>] \\
      [--n 20] [--torch-python <.venv-torch/bin/python>] [--cache-dir .cache/audio]

It picks about --n clips that are `ok` in both old caches (half Deezer, half iTunes where there are both,
two per album), fetches each album's listing, downloads every clip once, and embeds it through the same
children a run uses, twice:

  own      the downloaded bytes to both children; each decodes with its own decoder (the default of a run)
  shared   one ffmpeg decode in the parent, the mono buffer to both children (--decoder shared)

and compares both with the cached per-clip vectors: largest absolute difference (also as a share of the
vector's largest component) and cosine. It prints the peak memory of the three processes.

PASS means `own` reproduces both caches within --tol-cos and --tol-rel for every clip compared, and at
least half of the clips picked could be compared (a preview a store no longer serves is skipped and named).
The `shared` verdict is printed on its own line and does not change the exit code: it says whether one
decoder may replace the two.

It loads both models (EffNet about 0.7 GB, CLAP's weights are 776 MB on disk), makes about --n downloads
and a dozen API calls, writes nothing (the two caches are opened read-only, no output file), and holds
each --other-lock while it runs; it refuses to start when one is held. Exit 0 PASS, 1 FAIL, 2 could not run.
"""
import argparse
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_audio import embed, onepass  # noqa: E402
from rmr_audio.onepass_cache import MODELS, read_only  # noqa: E402
from rmr_audio.onepass_worker import clap_catalog  # noqa: E402

IDENT = ("key", "source", "album_id", "track_id")


def pick(effnet_db: Path, clap_db: Path, n: int) -> list[dict]:
    """About n clips ok in both caches: two per album, albums spread evenly over each store's list."""
    con = read_only(clap_db)
    clap = {tuple(r[:4]): r[4] for r in con.execute(
        "SELECT key, source, album_id, track_id, emb FROM clap_clips WHERE status = 'ok' AND source != 'local'")}
    con.close()
    con = read_only(effnet_db)
    albums: dict[tuple, list[dict]] = {}
    for *ident, prio, emb in con.execute("SELECT key, source, album_id, track_id, prio, emb FROM clips "
                                         "WHERE status = 'ok' AND source != 'local' ORDER BY key, source, album_id, prio"):
        if tuple(ident) in clap and emb is not None:
            albums.setdefault(tuple(ident[:3]), []).append({**dict(zip(IDENT, ident)), "effnet": emb, "clap": clap[tuple(ident)]})
    con.close()
    stores = {}
    for album, clips in albums.items():
        stores.setdefault(onepass.store_of(album[1]), []).append(clips)
    per_store = max(1, round(n / 2 / max(len(stores), 1)))  # albums per store, two clips each
    out = []
    for name in sorted(stores):
        lists = stores[name]
        for i in np.linspace(0, len(lists) - 1, min(per_store, len(lists))).round().astype(int):
            out += [lists[i][0], lists[i][-1]] if len(lists[i]) > 1 else lists[i][:1]
    return out


def compare(new: bytes, old: bytes, dtype: str) -> tuple[float, float, float]:
    """(largest absolute difference, the same as a share of the old vector's largest component, cosine)."""
    a, b = np.frombuffer(new, dtype).astype(np.float64), np.frombuffer(old, dtype).astype(np.float64)
    diff = float(np.abs(a - b).max())
    return diff, diff / max(float(np.abs(b).max()), 1e-12), float(a @ b / max(np.linalg.norm(a) * np.linalg.norm(b), 1e-12))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--effnet-db", type=Path, default=Path(os.environ["RMR_CLIPS_DB"]) if os.environ.get("RMR_CLIPS_DB") else None,
                   help="The pipeline's clips.sqlite (default: RMR_CLIPS_DB). Read-only.")
    p.add_argument("--clap-db", type=Path, required=True, help="A clap_catalog run's clap_clips.sqlite. Read-only.")
    p.add_argument("--other-lock", type=Path, action="append", default=[], help="Another job's lock file: must be free; held meanwhile.")
    p.add_argument("--n", type=int, default=20, help="Clips to compare (default 20).")
    p.add_argument("--torch-python", type=Path, default=None)
    p.add_argument("--cache-dir", type=Path, default=onepass.DEFAULT_CACHE, help="Where models/ (the EffNet graph) is.")
    p.add_argument("--tol-cos", type=float, default=0.9999, help="Smallest cosine with the cached vector that passes.")
    p.add_argument("--tol-rel", type=float, default=0.01, help="Largest difference, as a share of the largest component, that passes.")
    args = p.parse_args(argv)
    if args.effnet_db is None:
        p.error("give --effnet-db (or set RMR_CLIPS_DB)")
    sys.stdout.reconfigure(line_buffering=True)
    try:
        os.nice(19)
    except OSError:
        pass
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg is not on PATH", file=sys.stderr)
        return 2
    held = []
    try:
        for path in args.other_lock:
            held.append(onepass.take_lock(path, ours=False))
    except onepass.Locked as e:
        print(f"{e} is held by a running job: not starting (two model jobs would share the laptop)", file=sys.stderr)
        return 2
    clips = pick(args.effnet_db, args.clap_db, args.n)
    if not clips:
        print("no clip is ok in both caches: nothing to compare", file=sys.stderr)
        return 2
    print(f"{len(clips)} clips of {len({tuple(c[k] for k in IDENT[:3]) for c in clips})} albums picked "
          f"({', '.join(sorted({c['source'] for c in clips}))})")

    tmp = tempfile.mkdtemp(prefix="rmr-verify-")
    cc = clap_catalog()
    embed.ensure_model(args.cache_dir / "models")
    listing, download, _ = onepass.default_network()
    embedder = onepass.Embedder(onepass.worker_factories(("effnet", "clap"), args.cache_dir, tmp, args.torch_python), "own",
                                lambda data, suffix: cc.decode(data, suffix, tmp, ffmpeg))
    rows, skipped, t0 = [], [], time.monotonic()  # rows: (mode, model, clip, diff, rel, cos)
    try:
        urls: dict[tuple, dict] = {}
        for c in clips:
            album = (c["source"], c["album_id"])
            name = f"{c['key']} {c['source']} {c['track_id']}"
            try:
                if album not in urls:
                    urls[album] = {t["track_id"]: t["preview_url"] for t in listing(*album)}
                url = urls[album].get(c["track_id"])
                if not url:
                    raise IOError("the listing has no preview for it any more")
                data = download(url)
            except Exception as e:
                skipped.append(f"{name}: {e}")
                continue
            suffix = ".mp3" if c["source"] == "deezer" else ".m4a"
            for mode in ("own", "shared"):
                embedder.decoder = mode
                for model, r in embedder.embed(["effnet", "clap"], data=data, suffix=suffix).items():
                    if r["status"] != "ok":
                        rows.append((mode, model, name, float("inf"), float("inf"), 0.0))
                        print(f"  {mode:6s} {model:6s} {name}: {r['status']} {r.get('error') or ''}")
                    else:
                        rows.append((mode, model, name, *compare(r["emb"], c[model], MODELS[model].dtype)))
            del data
    finally:
        embedder.close()
        shutil.rmtree(tmp, ignore_errors=True)
        for f in held:
            f and f.close()

    def verdict(mode: str) -> bool:
        mine = [r for r in rows if r[0] == mode]
        return bool(mine) and all(r[5] >= args.tol_cos and r[4] <= args.tol_rel for r in mine)

    print(f"\n{'decoder':8s} {'model':7s} {'clips':>5s} {'max abs diff':>13s} {'as share':>9s} {'min cosine':>11s} {'identical':>9s}  worst clip")
    for mode in ("own", "shared"):
        for model in ("effnet", "clap"):
            mine = [r for r in rows if r[0] == mode and r[1] == model]
            if not mine:
                continue
            worst = max(mine, key=lambda r: r[4])
            print(f"{mode:8s} {model:7s} {len(mine):5d} {max(r[3] for r in mine):13.3g} {max(r[4] for r in mine):9.2g} "
                  f"{min(r[5] for r in mine):11.7f} {sum(r[3] == 0 for r in mine):9d}  {worst[2]}")
    compared = len({r[2] for r in rows})
    for line in skipped:
        print(f"skipped: {line}")
    print(embedder.memory())
    print(f"{compared} of {len(clips)} clips compared in {time.monotonic() - t0:.0f} s; "
          f"model seconds per clip (both passes): " + ", ".join(f"{k} {v / max(compared, 1) / 2:.2f}" for k, v in embedder.secs.items()))
    shared = verdict("shared")
    print(f"shared decoder: {'EQUIVALENT' if shared else 'NOT EQUIVALENT'} to the cached vectors at these tolerances "
          f"({'--decoder shared may be used' if shared else 'keep --decoder own'})")
    if compared * 2 < len(clips):
        print(f"FAIL: only {compared} of {len(clips)} clips could be fetched; not enough to judge")
        return 1
    ok = verdict("own")
    print(f"{'PASS' if ok else 'FAIL'}: the one-pass path (own decoders) "
          f"{'reproduces' if ok else 'does not reproduce'} the cached EffNet and CLAP vectors "
          f"(cosine >= {args.tol_cos}, difference <= {args.tol_rel:g} of the largest component)")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
