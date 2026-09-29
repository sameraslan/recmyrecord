"""Slugs: kebab(title)-kebab(artist), ASCII-folded, numeric suffix on collision, stable across runs."""
import re
import unicodedata
from collections.abc import Iterable

_TRANSLIT = str.maketrans({
    "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i",
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya", "і": "i", "ї": "yi", "є": "ye", "ґ": "g",
})


def kebab(text: str) -> str:
    s = str(text).lower().translate(_TRANSLIT)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.replace("&", " and ")
    s = re.sub(r"['`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def make_slugs(titles: Iterable[str], artists: Iterable[str]) -> list[str]:
    """One slug per album, in catalog order. The first album keeps the bare slug; later
    collisions get -2, -3, ... so slugs only change if the catalog order changes."""
    seen: set[str] = set()
    out: list[str] = []
    for t, a in zip(titles, artists):
        base = "-".join(p for p in (kebab(t), kebab(a)) if p) or "album"
        slug, n = base, 2
        while slug in seen:
            slug = f"{base}-{n}"
            n += 1
        seen.add(slug)
        out.append(slug)
    return out
