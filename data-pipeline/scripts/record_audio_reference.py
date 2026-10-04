"""Record what the audio store and the audio block hold for every album, keyed by the feature table's Spotify
URI: the reference tests/test_rekey.py compares against (tests/fixtures/audio_reference.npz).

Run from data-pipeline/ with the build venv (the block is float32 out of float64 arithmetic, so it is
recorded and compared under one numpy):
    .venv/bin/python scripts/record_audio_reference.py

First recorded on 3 October 2026, before the store was rekeyed from Spotify URIs to RYM ids, so the test
proves the rekey changed no embedding and no block. Record it again only after a change that is meant to
move them (a refit of the transform, a clip top-up, a corrected match), and say so in the commit.

  uris        (albums,)     the deduped feature table's URI, catalog order
  block       (albums, 64)  float32, rmr_pipeline.audio.audio_block as the build uses it, imputed rows included
  has_audio   (albums,)     False = imputed
  emb_sha256  (albums,)     SHA-256 of the album's store row (1,280 float16, little-endian bytes); "" without audio
  n_clips     (albums,)     int16, 0 without audio
  source      (albums,)     "" without audio
"""
import hashlib
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline.audio import audio_block  # noqa: E402
from rmr_pipeline.audio_store import DEFAULT_AUDIO, load_store  # noqa: E402
from rmr_pipeline.table import dedupe_table, load_table  # noqa: E402

REFERENCE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "audio_reference.npz"


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
        "emb_sha256": np.asarray([row_sha256(store.emb[r]) if r >= 0 else "" for r in rows], dtype=np.str_),
        "n_clips": np.asarray([store.n_clips[r] if r >= 0 else 0 for r in rows], dtype=np.int16),
        "source": np.asarray([store.source[r] if r >= 0 else "" for r in rows], dtype=np.str_),
    }


def main() -> int:
    ref = reference()
    REFERENCE.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(REFERENCE, **ref)
    print(f"{len(ref['uris'])} albums, {int(ref['has_audio'].sum())} with audio -> {REFERENCE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
