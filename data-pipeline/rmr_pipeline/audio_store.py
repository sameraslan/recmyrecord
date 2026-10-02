"""The committed audio store (data-pipeline/audio/): album-mean clip embeddings in append-only
shards, a manifest, the match provenance and the hand corrections of matches.

Written by the audio stage, read by the build. Only numpy and the standard library, and nothing
newer than numpy 1.26, so the audio venv (Python 3.11, numpy<2) and the build venv share it.

  embeddings/part-NNNN.npz   keys (str), emb (float16, n x 1280), n_clips (int16), source (str);
                             a key in a later shard supersedes earlier ones
  manifest.json              model, clip policy (clips.per_album: what a plain sync gives an album),
                             one entry per shard
  matches.csv                one row per album key (MATCH_FIELDS); an empty source = unmatched
  match_overrides.json       key -> {"source", "album_id"} or {"skip": true}, optional "note"
"""
import csv
import json
import re
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

DEFAULT_AUDIO = Path(__file__).resolve().parents[1] / "audio"
DIM = 1280
SHARD_RE = re.compile(r"^part-(\d{4})\.npz$")
SOURCE_RE = re.compile(r"^(deezer|local|itunes:[a-z]{2})$")
SHARD_ARRAYS = ("keys", "emb", "n_clips", "source")
MATCH_FIELDS = ["key", "source", "source_album_id", "matched_title", "matched_artist", "score", "ambiguous",
                "n_tracks", "n_clips_available"]


class StoreError(Exception):
    """The audio store is missing or malformed; the message names the file and the problem."""


@dataclass(frozen=True)
class Shard:
    keys: np.ndarray  # (n,) unicode album keys (the feature table's URI)
    emb: np.ndarray  # (n, DIM) float16 album means of the per-clip embeddings
    n_clips: np.ndarray  # (n,) int16 clips behind each mean
    source: np.ndarray  # (n,) unicode: deezer, itunes:<storefront>, local


@dataclass(frozen=True)
class Store:
    """Every album's newest embedding, in first-appearance order of the keys."""
    keys: np.ndarray
    emb: np.ndarray
    n_clips: np.ndarray
    source: np.ndarray
    manifest: dict

    def rows(self, keys) -> np.ndarray:
        """For each of `keys`, its row in the store, or -1 when it has no embedding."""
        index = {k: i for i, k in enumerate(self.keys.tolist())}
        return np.array([index.get(str(k), -1) for k in keys], dtype=np.int64)


def _check_shard(s: Shard, where: str) -> None:
    n = len(s.keys)
    if s.keys.ndim != 1 or s.keys.dtype.kind != "U" or s.source.dtype.kind != "U":
        raise StoreError(f"{where}: keys and source must be 1-d fixed-width unicode arrays")
    if s.emb.dtype != np.float16 or s.emb.ndim != 2 or s.emb.shape != (n, DIM):
        raise StoreError(f"{where}: emb must be float16 of shape ({n}, {DIM}), got {s.emb.dtype} {s.emb.shape}")
    if s.n_clips.dtype != np.int16 or s.n_clips.shape != (n,) or s.source.shape != (n,):
        raise StoreError(f"{where}: n_clips (int16) and source must have one entry per key ({n})")
    keys = s.keys.tolist()
    if n == 0 or len(set(keys)) != n or not all(keys):
        raise StoreError(f"{where}: keys must be non-empty and unique within a shard")
    if not np.isfinite(s.emb).all() or not s.emb.any(axis=1).all():
        raise StoreError(f"{where}: emb has non-finite or all-zero rows")
    if (s.n_clips < 1).any():
        raise StoreError(f"{where}: n_clips must be at least 1")
    bad = sorted({x for x in s.source.tolist() if not SOURCE_RE.match(x)})
    if bad:
        raise StoreError(f"{where}: unknown source {bad[0]!r} (deezer, itunes:<storefront>, local)")


def write_shard(path: Path, keys, emb: np.ndarray, n_clips, source) -> Shard:
    """Validate and write one shard (compressed, no pickled objects)."""
    s = Shard(np.asarray(keys, dtype=np.str_), np.asarray(emb, dtype=np.float16),
              np.asarray(n_clips, dtype=np.int16), np.asarray(source, dtype=np.str_))
    _check_shard(s, path.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        np.savez_compressed(f, keys=s.keys, emb=s.emb, n_clips=s.n_clips, source=s.source)
    return s


def read_shard(path: Path) -> Shard:
    try:
        with np.load(path, allow_pickle=False) as z:
            missing = [a for a in SHARD_ARRAYS if a not in z.files]
            if missing:
                raise StoreError(f"{path.name}: missing arrays {missing}")
            s = Shard(*(z[a] for a in SHARD_ARRAYS))
    except FileNotFoundError:
        raise StoreError(f"missing shard {path}") from None
    except (ValueError, OSError, zipfile.BadZipFile) as e:
        raise StoreError(f"{path.name} is not a readable shard: {e}") from None
    _check_shard(s, path.name)
    return s


def load_manifest(audio_dir: Path = DEFAULT_AUDIO) -> dict:
    path = audio_dir / "manifest.json"
    try:
        m = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise StoreError(f"missing {path}: the audio store is not there (see data-pipeline/README.md)") from None
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise StoreError(f"{path} is not valid JSON: {e}") from None
    if (not isinstance(m, dict) or not isinstance(m.get("model"), str) or not isinstance(m.get("clips"), dict)
            or not isinstance(m.get("shards"), list)):
        raise StoreError(f"{path}: needs model (str), clips (object) and shards (list)")
    for e in m["shards"]:
        if (not isinstance(e, dict) or not isinstance(e.get("file"), str) or not SHARD_RE.match(e["file"])
                or type(e.get("albums")) is not int):
            raise StoreError(f"{path}: every shard entry needs file (part-NNNN.npz) and albums (int), got {e!r}")
    files = [e["file"] for e in m["shards"]]
    if files != sorted(set(files)):
        raise StoreError(f"{path}: shard entries must be unique and in file-name order")
    return m


def init_store(audio_dir: Path, model: str, clips: dict) -> None:
    """An empty store: the manifest with no shards. `clips` is the clip policy (per_album, order)."""
    audio_dir.mkdir(parents=True, exist_ok=True)
    _write_json(audio_dir / "manifest.json", {"model": model, "dim": DIM, "clips": clips, "shards": []})


def append_shard(audio_dir: Path, keys, emb: np.ndarray, n_clips, source, note: str,
                 created: str | None = None) -> Path:
    """Write the next part-NNNN.npz and add it to the manifest."""
    m = load_manifest(audio_dir)
    number = 1 + max((int(SHARD_RE.match(e["file"])[1]) for e in m["shards"]), default=0)
    path = audio_dir / "embeddings" / f"part-{number:04d}.npz"
    if path.exists():
        raise StoreError(f"{path} exists but is not in the manifest")
    s = write_shard(path, keys, emb, n_clips, source)
    m["shards"].append({"file": path.name, "albums": len(s.keys), "created": created or date.today().isoformat(),
                        "note": note})
    _write_json(audio_dir / "manifest.json", m)
    return path


def set_clips_per_album(audio_dir: Path, per_album: int) -> None:
    """Record the store's clip policy: how many clips an album gets when it has that many."""
    m = load_manifest(audio_dir)
    m["clips"] = {**m["clips"], "per_album": int(per_album)}
    _write_json(audio_dir / "manifest.json", m)


def compact_store(audio_dir: Path, note: str, created: str | None = None) -> Path:
    """Rewrite every shard into one: each album's newest embedding, in store order. The new shard takes
    the next number; the older files are deleted once the manifest lists only the new one."""
    store = load_store(audio_dir)
    old = [e["file"] for e in store.manifest["shards"]]
    path = audio_dir / "embeddings" / f"part-{1 + int(SHARD_RE.match(old[-1])[1]):04d}.npz"
    if path.exists():
        raise StoreError(f"{path} exists but is not in the manifest")
    s = write_shard(path, store.keys, store.emb, store.n_clips, store.source)
    m = dict(store.manifest)
    m["shards"] = [{"file": path.name, "albums": len(s.keys), "created": created or date.today().isoformat(),
                    "note": note}]
    _write_json(audio_dir / "manifest.json", m)
    for name in old:
        (audio_dir / "embeddings" / name).unlink()
    return path


def load_store(audio_dir: Path = DEFAULT_AUDIO) -> Store:
    """Every shard of the manifest merged, later shards superseding earlier ones key by key."""
    m = load_manifest(audio_dir)
    if not m["shards"]:
        raise StoreError(f"{audio_dir / 'manifest.json'} lists no shards")
    listed = [e["file"] for e in m["shards"]]
    folder = audio_dir / "embeddings"
    stray = sorted(p.name for p in folder.glob("*.npz") if p.name not in listed)
    if stray:
        raise StoreError(f"{folder} has shards the manifest does not list: {stray}")
    shards = []
    for e in m["shards"]:
        s = read_shard(folder / e["file"])
        if len(s.keys) != e["albums"]:
            raise StoreError(f"{e['file']}: {len(s.keys)} albums, the manifest says {e['albums']}")
        shards.append(s)
    keys = np.concatenate([s.keys for s in shards])
    newest: dict[str, int] = {}
    for i, k in enumerate(keys.tolist()):
        newest[k] = i
    take = np.fromiter(newest.values(), dtype=np.int64, count=len(newest))
    cat = lambda name: np.concatenate([getattr(s, name) for s in shards])[take]  # noqa: E731
    return Store(keys[take], cat("emb"), cat("n_clips"), cat("source"), m)


def load_matches(path: Path) -> list[dict[str, str]]:
    """matches.csv as rows of strings (MATCH_FIELDS); keys are unique, `ambiguous` is 0 or 1."""
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames != MATCH_FIELDS:
                raise StoreError(f"{path}: the header must be {','.join(MATCH_FIELDS)}")
            rows = list(reader)
    except FileNotFoundError:
        raise StoreError(f"missing {path}") from None
    seen: set[str] = set()
    for n, r in enumerate(rows, start=2):
        if not r["key"] or r["key"] in seen:
            raise StoreError(f"{path} line {n}: empty or repeated key {r['key']!r}")
        seen.add(r["key"])
        if r["source"] and not SOURCE_RE.match(r["source"]):
            raise StoreError(f"{path} line {n}: unknown source {r['source']!r}")
        if r["ambiguous"] not in ("0", "1"):
            raise StoreError(f"{path} line {n}: ambiguous must be 0 or 1")
    return rows


def write_matches(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=MATCH_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def load_match_overrides(path: Path) -> dict[str, dict]:
    """Hand corrections keyed by album key: {"source", "album_id"} forces a match, {"skip": true}
    forbids one; "note" says why. A missing file means none."""
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise StoreError(f"{path} is not valid JSON: {e}") from None
    if not isinstance(data, dict):
        raise StoreError(f"{path} must be an object keyed by album key")
    for key, e in data.items():
        where = f"{path.name}[{key!r}]"
        if not isinstance(e, dict) or not isinstance(e.get("note", ""), str):
            raise StoreError(f"{where} must be an object; note must be a string")
        fields = set(e) - {"note"}
        if fields == {"skip"} and e["skip"] is True:
            continue
        if (fields != {"source", "album_id"} or not isinstance(e["source"], str) or not SOURCE_RE.match(e["source"])
                or not isinstance(e["album_id"], str) or not e["album_id"]):
            raise StoreError(f'{where} must be {{"source", "album_id"}} (strings) or {{"skip": true}}')
    return data


def _write_json(path: Path, data) -> None:
    tmp = path.with_name("." + path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)
