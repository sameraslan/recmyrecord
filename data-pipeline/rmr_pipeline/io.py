import json
from pathlib import Path


def write_json(path: Path, data) -> int:
    """Compact UTF-8 JSON written atomically (temp file beside the target, then rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    tmp = path.with_name("." + path.name + ".tmp")
    tmp.write_text(text + "\n", encoding="utf-8")
    tmp.replace(path)
    return path.stat().st_size
