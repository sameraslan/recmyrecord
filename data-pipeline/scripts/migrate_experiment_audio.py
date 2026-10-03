"""One-off: seed data-pipeline/audio/ from the preview-features experiment's caches (kept for provenance).

Run once, from data-pipeline/:  .venv/bin/python -m scripts.migrate_experiment_audio

Reads (read-only) experiments/preview_features/cache/features.sqlite (per-clip Discogs-EffNet
embeddings) and cache/match.sqlite (the matches); both are gitignored, so this cannot be rerun
from a fresh clone. Writes embeddings/part-0001.npz (album mean of the clips with prio < 4, the
experiment's four-clip pass), manifest.json, matches.csv, an empty match_overrides.json and
transform.npz, fitted here with the production code. Then prints how far the result is from the
experiment's own transform (results/solution_transform.npz applied to the unrounded clip means):
the store keeps float16 album means, so the block and a few lists differ slightly.
"""
import json
import sqlite3
import sys

import numpy as np

from rmr_pipeline.audio import audio_block, descriptors, fit_transform, save_transform, site_matrix, unit
from rmr_pipeline.audio_store import DEFAULT_AUDIO, DIM, append_shard, init_store, write_matches
from rmr_pipeline.constants import AUDIO, REPO, SLIDER
from rmr_pipeline.recs import top_k_neighbours
from rmr_pipeline.table import dedupe_table, load_table

EXPERIMENT = REPO / "experiments" / "preview_features"
MODEL = "discogs-effnet-bs1-1"
CLIPS = 4
SOURCES = {"deezer": "deezer", "itunes": "itunes:us"}


def read_only(name: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{EXPERIMENT / 'cache' / name}?mode=ro", uri=True)


def clip_means(rows: set[int]) -> tuple[list[int], np.ndarray, list[int], list[str]]:
    """(rows ascending, float64 mean clip embedding, clips, source) per catalog album with clips."""
    con = read_only("features.sqlite")
    clips = con.execute("SELECT row, source, effnet FROM tracks WHERE status = 'ok' AND prio < ? AND effnet IS NOT NULL "
                        "ORDER BY row, track_idx", (CLIPS,)).fetchall()
    con.close()
    by_row: dict[int, list] = {}
    for row, source, blob in clips:
        if row in rows:
            by_row.setdefault(row, []).append((source, np.frombuffer(blob, "<f2").astype(np.float32)))
    order = sorted(by_row)
    means = np.stack([np.stack([e for _, e in by_row[r]]).astype(np.float64).mean(axis=0) for r in order])
    sources = [{s for s, _ in by_row[r]} for r in order]
    assert means.shape[1] == DIM and all(len(s) == 1 for s in sources)
    return order, means, [len(by_row[r]) for r in order], [SOURCES[s.pop()] for s in sources]


def match_rows(uri_of: dict[int, str]) -> list[dict]:
    con = read_only("match.sqlite")
    albums = con.execute("SELECT row, uri, status, ambiguous, source, source_album_id, source_title, source_artist, "
                         "score, n_tracks, n_previews FROM albums ORDER BY row").fetchall()
    con.close()
    out = []
    for row, uri, status, ambiguous, source, album_id, title, artist, score, n_tracks, n_previews in albums:
        if row not in uri_of:
            continue
        assert uri == uri_of[row], (row, uri)
        matched = status == "matched"
        out.append({"key": uri, "source": SOURCES[source] if matched else "",
                    "source_album_id": album_id if matched else "", "matched_title": title if matched else "",
                    "matched_artist": artist if matched else "", "score": f"{score:.4f}" if matched else "",
                    "ambiguous": int(bool(ambiguous)), "n_tracks": n_tracks if matched else "",
                    "n_clips_available": n_previews if matched else ""})
    assert len(out) == len(uri_of)
    return out


def top10(block: np.ndarray, desc: np.ndarray) -> dict[str, np.ndarray]:
    return {stop: top_k_neighbours(np.hstack([block, desc / SLIDER[stop] ** 3]).astype(np.float32))
            for stop in ("sonic", "balanced")}


def main() -> int:
    if (DEFAULT_AUDIO / "manifest.json").exists():
        print(f"{DEFAULT_AUDIO} already has a store; this migration only seeds an empty one", file=sys.stderr)
        return 1
    sub, table_rows = dedupe_table(load_table())
    uri_of = dict(zip(table_rows, sub["URI"].astype(str)))
    rows, means, n_clips, sources = clip_means(set(table_rows))

    init_store(DEFAULT_AUDIO, MODEL, {"per_album": CLIPS, "order": "the first track, then tracks spread evenly "
                                      "through the album (bit-reversal order), so fewer clips are a prefix of more"})
    path = append_shard(DEFAULT_AUDIO, [uri_of[r] for r in rows], means, n_clips, sources,
                        note="migrated from the preview-features experiment (four-clip pass, 1 October 2026)")
    write_matches(DEFAULT_AUDIO / "matches.csv", match_rows(uri_of))
    (DEFAULT_AUDIO / "match_overrides.json").write_text("{}\n", encoding="utf-8")

    has = sub["URI"].isin([uri_of[r] for r in rows]).to_numpy()
    target = float(sub.loc[has, AUDIO].to_numpy(dtype=np.float64).var(axis=0).sum())
    stored = np.load(path)["emb"]
    t = fit_transform(stored, target, MODEL)
    save_transform(DEFAULT_AUDIO / "transform.npz", t)
    print(f"wrote {path.name} ({path.stat().st_size / 1e6:.1f} MB, {len(rows)} albums), matches.csv, "
          f"transform.npz (scale {t.scale:.4f}, target total variance {target:.6f})")

    # Fidelity against the experiment's D64: its transform on the unrounded clip means.
    z = np.load(EXPERIMENT / "results" / "solution_transform.npz")
    assert np.array_equal(z["rows"], rows)
    ours = audio_block(sub).block[has]
    assert np.array_equal(ours, t.apply(stored))
    theirs = (unit(means) - z["mean"].astype(np.float64)) @ z["components"].T.astype(np.float64) * float(z["scale"])
    desc = descriptors(sub)[has]
    a, b = top10(ours, desc), top10(theirs, desc)
    report = {"albums": len(rows), "scale": [t.scale, float(z["scale"])],
              "block_max_abs_diff": float(np.abs(ours - theirs).max()), "block_abs_max": float(np.abs(theirs).max()),
              "embedding_max_abs_rounding": float(np.abs(stored.astype(np.float64) - means).max())}
    for stop in a:
        report[stop] = {"identical_lists": float((a[stop] == b[stop]).all(axis=1).mean()),
                        "same_ten_albums": float((np.sort(a[stop]) == np.sort(b[stop])).all(axis=1).mean()),
                        "mean_overlap": float((a[stop][:, :, None] == b[stop][:, None, :]).any(axis=2).mean())}
    print(json.dumps(report, indent=1))
    assert site_matrix(sub, audio_block(sub).block, SLIDER["balanced"]).shape == (len(sub), 184)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
