"""`python -m rmr_audio status`: what the store holds for the catalog, and which albums have no audio."""
from collections import Counter
from pathlib import Path

from rmr_pipeline.audio_store import leftovers, load_manifest, load_match_overrides, load_matches, load_store

from .catalog import Album


def status(catalog: list[Album], audio_dir: Path, missing: bool = False) -> str:
    """The report as text. Raises StoreError when the store is malformed."""
    manifest = load_manifest(audio_dir)
    stored = {}
    if manifest["shards"]:
        s = load_store(audio_dir)
        stored = {k: (int(n), src) for k, n, src in zip(s.keys.tolist(), s.n_clips.tolist(), s.source.tolist())}
    path = audio_dir / "matches.csv"
    matches = {r["key"]: r for r in (load_matches(path) if path.exists() else [])}
    skips = {k for k, e in load_match_overrides(audio_dir / "match_overrides.json").items() if e.get("skip")}

    keys = {al.key for al in catalog}
    have = [stored[al.key] for al in catalog if al.key in stored]
    without = [al for al in catalog if al.key not in stored]
    by_source = Counter(src for _, src in have)
    by_clips = Counter(n for n, _ in have)
    row = lambda al: matches.get(al.key)  # noqa: E731
    new = sum(al.new for al in catalog)
    lines = [
        f"{len(catalog)} albums in the catalog ({len(catalog) - new} on the site, {new} new), {len(have)} with audio, "
        f"{len(without)} without (the build imputes the site's)",
        f"store: {manifest['model']}, {manifest['clips'].get('per_album', '?')} clips per album by policy, "
        f"{len(manifest['shards'])} shard(s)" + (f", {len(set(stored) - keys)} albums not in the catalog"
                                                 if set(stored) - keys else ""),
        "by source: " + (", ".join(f"{src} {n}" for src, n in sorted(by_source.items())) or "-"),
        "clips per album: " + (", ".join(f"{n} clips: {by_clips[n]}" for n in sorted(by_clips)) or "-"),
        f"ambiguous matches (check them; correct in match_overrides.json): "
        f"{sum(1 for al in catalog if al.key in stored and row(al) and row(al)['ambiguous'] == '1')}",
        "without audio: "
        f"{sum(1 for al in without if row(al) and not row(al)['source'] and al.key not in skips)} unmatched, "
        f"{sum(1 for al in without if row(al) and row(al)['source'])} matched but not in the store (no usable clip, or not embedded yet), "
        f"{sum(1 for al in without if not row(al) and al.key not in skips)} never matched, "
        f"{sum(1 for al in without if al.key in skips)} skipped by match_overrides.json",
    ]
    left = leftovers(audio_dir)
    if left:
        lines.append(f"left by an interrupted write (ignored; the next sync or compact removes them): "
                     + ", ".join(p.name for p in left))
    if missing:
        lines += [f"{al.slug}\t{al.artist} — {al.title}" for al in without]
    return "\n".join(lines)
