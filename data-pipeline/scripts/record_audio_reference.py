"""Record what an audio store and its audio block hold for every album: a reference a test compares against.

Run from data-pipeline/ with the build venv (the block is float32 out of float64 arithmetic, so it is
recorded and compared under one numpy):
    .venv/bin/python scripts/record_audio_reference.py
    .venv/bin/python scripts/record_audio_reference.py --catalog --out tests/fixtures/catalog_audio_reference.npz

Without --catalog: the site build's albums before the 10k catalog, keyed by the feature table's Spotify URI,
from data-pipeline/audio, written to tests/fixtures/audio_reference.npz, which tests/test_rekey.py compares
against. First recorded on 3 October 2026, before the store was rekeyed from Spotify URIs to RYM ids, so the
test proves the rekey changed no embedding and no block. Record it again only after a change that is meant to
move them (a refit of the transform, a clip top-up, a corrected match), and say so in the commit.

  uris        (albums,)     the deduped feature table's URI, catalog order
  block       (albums, 64)  float32, rmr_pipeline.audio.audio_block as the build uses it, imputed rows included
  has_audio   (albums,)     False = imputed
  emb_sha256  (albums,)     SHA-256 of the album's store row (1,280 float16, little-endian bytes); "" without audio
  n_clips     (albums,)     int16, 0 without audio
  source      (albums,)     "" without audio

With --catalog: the catalog build's albums (every row of catalog/albums.csv, keyed by RYM id), from
audio/effnet10k unless --audio-dir names another store, written to --out. The same arrays, with `keys` in
place of `uris`, and the block as the catalog build makes it: nothing imputed, an album without audio has the
mean block of the albums with audio (audio_block(fill="mean")). That block does not depend on the
descriptors, so the reference stays valid whatever --descriptor-weights and --existing-descriptors the build
is given. tests/test_record_reference.py compares the store with tests/fixtures/catalog_audio_reference.npz
once that file is there. --catalog never writes tests/fixtures/audio_reference.npz unless --force is given.
"""
import argparse
import hashlib
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline.audio import DEFAULT_CATALOG, audio_block, catalog_keys  # noqa: E402
from rmr_pipeline.audio_store import DEFAULT_AUDIO, STORES, StoreError, load_store  # noqa: E402
from rmr_pipeline.table import dedupe_table, load_table  # noqa: E402

REFERENCE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "audio_reference.npz"
CATALOG_REFERENCE = REFERENCE.with_name("catalog_audio_reference.npz")  # where the catalog's is expected


def row_sha256(row: np.ndarray) -> str:
    """SHA-256 of one store row's bytes (float16, little-endian), the same on every machine."""
    return hashlib.sha256(np.ascontiguousarray(row, dtype="<f2").tobytes()).hexdigest()


def store_rows_by_uri(uris: list[str], audio_dir: Path = DEFAULT_AUDIO) -> np.ndarray:
    """For each URI, its row in the store or -1. A store already rekeyed is read through keys.csv."""
    store = load_store(audio_dir)
    keys = uris
    if (audio_dir / "keys.csv").exists():
        from rmr_pipeline.keys import load_keys

        keys = load_keys(audio_dir / "keys.csv").keys_of(uris)
    return store.rows(keys)


def _store_columns(store, rows: np.ndarray) -> dict[str, np.ndarray]:
    """What the store holds at `rows` (-1: no audio): the three arrays every reference records."""
    return {
        "emb_sha256": np.asarray([row_sha256(store.emb[r]) if r >= 0 else "" for r in rows], dtype=np.str_),
        "n_clips": np.asarray([store.n_clips[r] if r >= 0 else 0 for r in rows], dtype=np.int16),
        "source": np.asarray([store.source[r] if r >= 0 else "" for r in rows], dtype=np.str_),
    }


def reference(audio_dir: Path = DEFAULT_AUDIO) -> dict[str, np.ndarray]:
    sub, _ = dedupe_table(load_table())
    uris = [str(u) for u in sub["URI"]]
    audio = audio_block(sub, audio_dir)
    store = load_store(audio_dir)
    rows = store_rows_by_uri(uris, audio_dir)
    assert np.array_equal(rows >= 0, audio.has_audio)
    return {
        "uris": np.asarray(uris, dtype=np.str_),
        "block": audio.block,
        "has_audio": audio.has_audio,
        **_store_columns(store, rows),
    }


def catalog_reference(audio_dir: Path = STORES["effnet10k"], catalog: Path = DEFAULT_CATALOG) -> dict[str, np.ndarray]:
    """The reference of a catalog build: every row of the catalog table, by its key, in its order."""
    keys = catalog_keys(catalog)
    # With fill "mean" the block reads nothing of the frame but its length: no feature table, no descriptors.
    audio = audio_block(pd.DataFrame(index=range(len(keys))), audio_dir, keys, fill="mean")
    store = load_store(audio_dir)
    rows = store.rows(keys)
    assert np.array_equal(rows >= 0, audio.has_audio)
    return {
        "keys": np.asarray(keys, dtype=np.str_),
        "block": audio.block,
        "has_audio": audio.has_audio,
        **_store_columns(store, rows),
    }


def write_reference(path: Path, ref: dict[str, np.ndarray]) -> None:
    """Complete or not at all, under exactly this name (np.savez would add .npz to another one)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + ".tmp")
    with open(tmp, "wb") as f:
        np.savez_compressed(f, **ref)
    tmp.replace(path)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Record the audio reference a test compares the store and the block against.")
    p.add_argument("--catalog", action="store_true",
                   help="Record the catalog build's reference (every catalog album by RYM id, nothing imputed) "
                        "instead of the feature table's. Needs --out.")
    p.add_argument("--out", type=Path, default=None,
                   help=f"With --catalog: the file to write (the tests expect {CATALOG_REFERENCE.name} beside the old one).")
    p.add_argument("--audio-dir", type=Path, default=None, help="With --catalog: the store (default audio/effnet10k).")
    p.add_argument("--catalog-path", type=Path, default=DEFAULT_CATALOG, help="With --catalog: the catalog table.")
    p.add_argument("--force", action="store_true",
                   help=f"With --catalog: allow --out to be {REFERENCE.name}, the reference tests/test_rekey.py reads.")
    args = p.parse_args(argv)
    if not args.catalog:
        if args.out or args.audio_dir or args.force or args.catalog_path != DEFAULT_CATALOG:
            p.error("--out, --audio-dir, --catalog-path and --force need --catalog")
        ref = reference()
        REFERENCE.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(REFERENCE, **ref)
        print(f"{len(ref['uris'])} albums, {int(ref['has_audio'].sum())} with audio -> {REFERENCE}")
        return 0
    if args.out is None:
        p.error("--catalog needs --out: the file to write")
    if args.out.resolve() == REFERENCE.resolve() and not args.force:
        p.error(f"--catalog does not overwrite {REFERENCE}: tests/test_rekey.py compares data-pipeline/audio with "
                "it. Pass another --out, or --force once that test is meant to change")
    audio_dir = args.audio_dir or STORES["effnet10k"]
    try:
        ref = catalog_reference(audio_dir, args.catalog_path)
    except StoreError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    write_reference(args.out, ref)
    print(f"{len(ref['keys'])} catalog albums, {int(ref['has_audio'].sum())} with audio, from {audio_dir} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
