"""Rekey the audio store to the keys of audio/keys.csv: the `keys` of every shard, the key column of
matches.csv, the keys of match_overrides.json and the `keys` of transform.npz.

Run from data-pipeline/ with either venv (numpy and the standard library only):
    .venv/bin/python scripts/rekey_audio_store.py [--audio-dir DIR] [--previous OLD_KEYS_CSV] [--dry-run]

First run on 3 October 2026, when the album key changed from the Spotify URI to the RYM id. It can be run
again at any time and changes nothing when every key is already current. Run it again after keys.csv
changes: a placeholder (sp:<id>) that has been given its RYM id is found by itself; when a RYM id was
replaced by another, pass the keys.csv of before as --previous (`git show HEAD:data-pipeline/audio/keys.csv`
into a file), because the old id alone does not say which album it was.

Only keys are rewritten. A shard's emb, n_clips and source arrays, and the transform's mean and components,
are written back as they were read: no value and no dtype changes. A key keys.csv does not know (an album
that never had a Spotify URI) is left as it is. Nothing is written if two albums would get one key.
Local caches (.cache/audio/clips.sqlite) are not touched: rmr_pipeline.keys.KeyMap.legacy gives the key
they know an album by.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rmr_pipeline.audio_store import (DEFAULT_AUDIO, StoreError, load_manifest, load_matches, read_shard,  # noqa: E402
                                      write_matches, write_shard)
from rmr_pipeline.keys import KeyMap, load_keys  # noqa: E402


def translator(keys: KeyMap, previous: KeyMap | None = None):
    """key of any age -> current key."""
    def current(key: str) -> str:
        if previous is not None and key not in keys.uri_of_key and previous.legacy(key):
            key = previous.legacy(key)
        return keys.current(key)
    return current


def _renamed(old: list[str], current, where: str) -> list[str] | None:
    """The keys translated, or None when none changes. Raises StoreError when two would become one."""
    new = [current(k) for k in old]
    if len(set(new)) != len(new):
        twice = sorted({k for k in new if new.count(k) > 1})
        raise StoreError(f"{where}: two entries would get the key {twice[0]!r}")
    return None if new == old else new


def rekey(audio_dir: Path = DEFAULT_AUDIO, previous: Path | None = None, dry_run: bool = False) -> dict[str, int]:
    """Rewrite the keys of every file of the store; returns how many keys changed in each file. Every file is
    read and checked before the first is written."""
    current = translator(load_keys(audio_dir / "keys.csv"), load_keys(previous) if previous else None)
    changed: dict[str, int] = {}
    writes = []

    def count(old: list[str], new: list[str]) -> int:
        return sum(a != b for a, b in zip(old, new))

    for entry in load_manifest(audio_dir)["shards"]:
        path = audio_dir / "embeddings" / entry["file"]
        s = read_shard(path)
        new = _renamed(s.keys.tolist(), current, entry["file"])
        if new is not None:
            changed[entry["file"]] = count(s.keys.tolist(), new)
            writes.append(lambda path=path, s=s, new=new: write_shard(path, new, s.emb, s.n_clips, s.source))

    path = audio_dir / "matches.csv"
    if path.exists():
        rows = load_matches(path)
        new = _renamed([r["key"] for r in rows], current, path.name)
        if new is not None:
            changed[path.name] = count([r["key"] for r in rows], new)
            writes.append(lambda path=path, rows=rows, new=new: write_matches(
                path, [{**r, "key": k} for r, k in zip(rows, new)]))

    path = audio_dir / "match_overrides.json"
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        new = _renamed(list(data), current, path.name)
        if new is not None:
            changed[path.name] = count(list(data), new)
            writes.append(lambda path=path, data=data, new=new: _write_json(path, dict(zip(new, data.values()))))

    path = audio_dir / "transform.npz"
    if path.exists():
        with np.load(path, allow_pickle=False) as z:
            arrays = {name: z[name] for name in z.files}
        if "keys" in arrays:
            new = _renamed(arrays["keys"].tolist(), current, path.name)
            if new is not None:
                changed[path.name] = count(arrays["keys"].tolist(), new)
                arrays["keys"] = np.asarray(new, dtype=np.str_)
                writes.append(lambda path=path, arrays=arrays: _write_npz(path, arrays))

    if not dry_run:
        for write in writes:
            write()
    return changed


def _tmp(path: Path) -> Path:
    return path.with_name("." + path.name + ".tmp")


def _write_json(path: Path, data: dict) -> None:
    _tmp(path).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(_tmp(path), path)


def _write_npz(path: Path, arrays: dict) -> None:
    with open(_tmp(path), "wb") as f:
        np.savez(f, **arrays)  # uncompressed, as rmr_pipeline.audio.save_transform writes it
    os.replace(_tmp(path), path)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Rekey the audio store to the keys of keys.csv.")
    p.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO, help="The store (default data-pipeline/audio).")
    p.add_argument("--previous", type=Path, default=None,
                   help="The keys.csv the store was last rekeyed with; needed only when a RYM id was replaced by another.")
    p.add_argument("--dry-run", action="store_true", help="Say what would change; write nothing.")
    args = p.parse_args(argv)
    try:
        changed = rekey(args.audio_dir, args.previous, args.dry_run)
    except StoreError as e:
        print(f"FAIL\n{e}", file=sys.stderr)
        return 1
    if not changed:
        print("every key is current: nothing to do")
    for name, n in changed.items():
        print(f"{name}: {n} keys {'would be ' if args.dry_run else ''}rewritten")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
