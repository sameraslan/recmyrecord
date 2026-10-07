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


# A slug is a file name on the host: Vercel writes `<slug>.prerender-config.json`, and a file name holds 255
# bytes, so a slug over 233 bytes fails the deploy (ENAMETOOLONG). A catalog build's new albums are cut well
# below that; validate.py refuses a longer one from anywhere (validate.MAX_SLUG_FILE_BYTES).
MAX_SLUG_BYTES = 120  # of a new album's slug, suffix included; a slug is ASCII, so bytes are characters
TITLE_SHARE = 80  # of a slug that is cut: the title's part at most, unless the artist leaves it more


def _shorten(part: str, limit: int) -> str:
    """`part` cut to `limit` characters at a hyphen: whole words, no trailing hyphen. Only a first word that
    is longer than `limit` by itself is cut inside the word."""
    if len(part) <= limit:
        return part
    cut = part.rfind("-", 0, limit + 1)
    return part[:cut] if cut > 0 else part[:limit]


def _capped(title: str, artist: str) -> str:
    """kebab(title)-kebab(artist) within MAX_SLUG_BYTES: the title has TITLE_SHARE characters, or all that
    a short artist leaves; the artist has what the cut title leaves."""
    if not title or not artist:
        return _shorten(title or artist, MAX_SLUG_BYTES)
    if len(title) + 1 + len(artist) <= MAX_SLUG_BYTES:
        return f"{title}-{artist}"
    title = _shorten(title, max(TITLE_SHARE, MAX_SLUG_BYTES - 1 - len(artist)))
    return f"{title}-{_shorten(artist, MAX_SLUG_BYTES - 1 - len(title))}"


def make_slugs(titles: Iterable[str], artists: Iterable[str], cap_from: int | None = None) -> list[str]:
    """One slug per album, in catalog order. The first album keeps the bare slug; later
    collisions get -2, -3, ... so slugs only change if the catalog order changes.

    `cap_from` (a catalog build: the number of the first new album) keeps the slugs of the albums from that
    one on within MAX_SLUG_BYTES, collision suffix included. The albums before it, and every album when it is
    None, get the slugs they always had, however long."""
    seen: set[str] = set()
    out: list[str] = []
    for i, (t, a) in enumerate(zip(titles, artists)):
        title, artist = kebab(t), kebab(a)
        capped = cap_from is not None and i >= cap_from
        base = (_capped(title, artist) if capped else "-".join(p for p in (title, artist) if p)) or "album"
        slug, n = base, 2
        while slug in seen:
            slug = f"{_shorten(base, MAX_SLUG_BYTES - len(str(n)) - 1) if capped else base}-{n}"
            n += 1
        seen.add(slug)
        out.append(slug)
    return out
