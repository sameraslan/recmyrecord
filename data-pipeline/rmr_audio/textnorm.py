"""Text normalisation and similarity for matching catalog albums to store listings (Deezer, iTunes).

Titles and artists are compared after folding (case, accents, punctuation, "&"/"and", "the") and after
removing edition markers ("(Deluxe Edition)", "[Remastered 2011]", "- Remaster"). Each side is compared
through several variants (full, without parentheticals, without subtitle, romanised or native name), a
derived variant counting a little less than the full string.

Copied from experiments/preview_features/textnorm.py, with one addition: ordinal words read as their
numeral ("Third" = "3rd"), see _ORDINALS.
"""
import re
import unicodedata

from rapidfuzz import fuzz

_TRANSLIT = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i"})
_BRACKET = re.compile(r"\s*[(\[]([^()\[\]]*)[)\]]")
_EDITION = re.compile(
    r"\b(?:deluxe|expanded|remaster(?:ed|ise[dr]|ize[dr])?|re-?issue|anniversary|edition|version|bonus|mono|stereo|special|"
    r"collector'?s|legacy|explicit|clean|extended|complete|international|standard|super|digital|"
    r"original (?:album|recording|soundtrack|motion picture)|o\.?s\.?t\.?|soundtrack|\d+(?:th|nd|rd|st)|ep|lp|"
    r"edici[oó]n|aniversario|remasteri[sz]ad[oa]|[ée]dition|mixtape|dj mix)\b|^\s*\d{4}\s*$",
    re.IGNORECASE)
_TAIL = re.compile(  # unbracketed edition words closing a title: "... 45th Anniversary", "...: Expanded Edition"
    r"(?:[\s:,-]+(?:\d+(?:th|nd|rd|st|º)|anniversary|aniversario|deluxe|expanded|remaster(?:ed)?|edition|edici[oó]n|"
    r"super|special|collector'?s|legacy|reissue|bonus tracks?))+\s*$", re.IGNORECASE)
_DASH_SUFFIX = re.compile(r"\s+[-–—]\s+([^-–—]+)$")
_SUBTITLE = re.compile(r"\s*(?::|\s[-–—]\s)\s*")
_YEAR = re.compile(r"(?:19|20)\d\d")
_NUMBER = re.compile(r"\b(?:\d+|ii|iii|iv|vi|vii|viii|ix|two|three|four|five)\b")
_DIGITS = {"ii": "2", "iii": "3", "iv": "4", "vi": "6", "vii": "7", "viii": "8", "ix": "9",
           "two": "2", "three": "3", "four": "4", "five": "5"}
_ORDINALS = {"first": "1st", "second": "2nd", "third": "3rd", "fourth": "4th", "fifth": "5th", "sixth": "6th",
             "seventh": "7th", "eighth": "8th", "ninth": "9th", "tenth": "10th"}
_JOINER = re.compile(r"\s*[,&/;]\s*|\s+(?:and|with|feat\.?|featuring|x|vs\.?|et|y|e)\s+", re.IGNORECASE)
_NATIVE_ROMAN = re.compile(r"[^\s\[\]&,/][^\[\]&,/]*?\s*\[([^\]]+)\]")
_VARIOUS = {"various artists", "various", "multi interpretes", "varios artistas", "verschiedene interpreten",
            "artistes divers", "va", "varios", "divers", "soundtrack", "original soundtrack"}
# What a listing may say it is that our title does not: a bigger edition, a soundtrack, another recording.
_BIGGER = re.compile(r"\b(?:deluxe|expanded|bonus|anniversary|aniversario|special|collector'?s|legacy|super|complete|"
                     r"extended|box(?:ed)?(?: set)?)\b", re.IGNORECASE)
_SOUNDTRACK = re.compile(r"\b(?:soundtrack|o\.?s\.?t\.?|motion picture|score)\b", re.IGNORECASE)
_OTHER = re.compile(
    r"\b(?:live|tribute|karaoke|8[- ]?bit|instrumentals?|lullab\w+|covers?|performs?|renditions?|demos?|remix(?:es|ed)?|"
    r"commentary|made famous|in the style of|originally performed|acoustic|sessions?|rehearsals?|interviews?|"
    r"string quartet|rockabye|re-?recorded|playback|sound-?alike)\b", re.IGNORECASE)


def fold(s: str) -> str:
    """Casefolded text without accents; letters of every script are kept."""
    s = unicodedata.normalize("NFKD", str(s).translate(_TRANSLIT))
    return "".join(c for c in s if not unicodedata.combining(c)).casefold().translate(_TRANSLIT)


def ascii_fold(s: str) -> str:
    """Accents dropped, case kept, non-ASCII characters removed ("África Brasil" -> "Africa Brasil")."""
    s = unicodedata.normalize("NFKD", str(s).translate(_TRANSLIT))
    return " ".join(s.encode("ascii", "ignore").decode().split())


def norm(s: str, *, artist: bool = False) -> str:
    """Folded words joined by single spaces; "&" reads "and"; an ordinal word reads as its numeral ("third" ->
    "3rd"); titles lose a leading "the", artists every "the"."""
    s = re.sub(r"['’`´]", "", fold(s).replace("&", " and "))
    words = [_ORDINALS.get(w, w) for w in re.split(r"[\W_]+", s) if w]
    if artist:
        words = [w for w in words if w != "the"] or words
    elif len(words) > 1 and words[0] == "the":
        words = words[1:]
    return " ".join(words)


def has_non_latin(s: str) -> bool:
    """Does the text have letters of a script other than Latin?"""
    return any(c.isalpha() and not (c.isascii() or unicodedata.name(c, "").startswith("LATIN")) for c in s)


def strip_edition(title: str) -> str:
    """The title without edition markers in brackets or after a trailing dash."""
    out = _BRACKET.sub(lambda m: "" if _EDITION.search(m.group(1)) else m.group(0), title)
    while (m := _DASH_SUFFIX.search(out)) and _EDITION.search(m.group(1)):
        out = out[:m.start()]
    return _TAIL.sub("", out).strip() or out.strip() or title.strip()


def core_title(title: str) -> str:
    """The title without any bracketed part (kept as is when nothing else remains)."""
    return _BRACKET.sub("", title).strip() or title.strip()


def main_title(title: str) -> str:
    """The title before its subtitle ("Unleashed in the East: Live in Japan" -> "Unleashed in the East")."""
    core = core_title(strip_edition(title))
    return _SUBTITLE.split(core)[0].strip() or core


def title_variants(title: str, *, listing: bool = False) -> list[tuple[str, float]]:
    """(normalised variant, weight): the full title, then without brackets, subtitle, or the bracketed name alone.
    A store listing with a subtitle we do not have is often another release, so its short forms weigh less."""
    full = strip_edition(title)
    core = core_title(full)
    out = [(norm(full), 1.0), (norm(core), 0.9 if listing else 0.95)]
    parts = [norm(p) for p in _SUBTITLE.split(core)]
    if len(parts) > 1:  # a short half ("Blue" out of "Blue: A Tribute") would match too much
        halves = [(parts[0], 0.8 if listing else 0.9), (" ".join(parts[1:]), 0.75 if listing else 0.85)]
        out += [(text, w) for text, w in halves if len(text) > 4 or not text.isascii()]
    for inner in _BRACKET.findall(full):  # "呼吸 (Kokyuu)": the romanised name is a title of its own
        out.append((norm(inner), 0.95 if has_non_latin(core) else 0.8))
    seen: dict[str, float] = {}
    for text, w in out:
        if text:
            seen[text] = max(w, seen.get(text, 0.0))
    return list(seen.items()) or [(" ".join(title.casefold().split()), 1.0)]


def _numbers(text: str, *, years: bool = True) -> set[str]:
    """The numbers of a normalised title as digits ("ii", "two" -> "2"), optionally without years."""
    found = {_DIGITS.get(n, n) for n in _NUMBER.findall(text)}
    return found if years else {n for n in found if not _YEAR.fullmatch(n)}


def title_sim(ours: str, theirs: str) -> float:
    """Similarity in [0, 1], 0.5 at most when very short titles are not equal or when numbers disagree: between
    the compared variants ("II" vs "III"), or when the listing has a number, years aside, that our title has
    nowhere ("... (Vol. II)", "... Volume Two")."""
    mine, listed = (_numbers(norm(strip_edition(t)), years=False) for t in (ours, theirs))
    best = 0.0
    for a, wa in title_variants(ours):
        for b, wb in title_variants(theirs, listing=True):
            r = fuzz.ratio(a, b) / 100
            if (min(len(a), len(b)) <= 4 and a != b) or _numbers(a) != _numbers(b) or listed - mine:
                r = min(r, 0.5)
            best = max(best, r * wa * wb)
    return best


def artist_names(artist: str) -> list[str]:
    """Spellings of a credit: as given, romanised ("青葉市子 [Ichiko Aoba]" -> "Ichiko Aoba") and native."""
    roman = _NATIVE_ROMAN.sub(lambda m: m.group(1), artist).strip()
    native = re.sub(r"\s*\[[^\]]+\]", "", artist).strip()
    return list(dict.fromkeys(n for n in (roman, native, artist) if n))


def first_billed(artist: str) -> str:
    """The first name of a joint credit ("Madlib & Freddie Gibbs" -> "Madlib")."""
    return _JOINER.split(artist.strip())[0].strip() or artist


def artist_variants(artist: str) -> list[tuple[str, float]]:
    """(normalised variant, weight): every spelling in full, then each billed name on its own. One name out of
    a long credit (a compilation's performers) weighs less than one of two."""
    out: dict[str, float] = {}
    for name in artist_names(artist):
        out[norm(name, artist=True)] = 1.0
        parts = [p for p in _JOINER.split(name) if p.strip()]
        for i, p in enumerate(parts if len(parts) > 1 else []):
            key = norm(p, artist=True)
            if len(key) > 2:
                out[key] = max(out.get(key, 0.0), 0.93 if i == 0 else 0.9 if len(parts) < 4 else 0.8)
    out.pop("", None)
    return list(out.items())


def is_various(artist: str) -> bool:
    """Is the credit a various-artists one?"""
    return norm(artist, artist=True) in _VARIOUS


def artist_sim(ours: str, theirs: str) -> float:
    """Similarity in [0, 1]. A various-artists album accepts any credit at 0.65 (soundtracks are credited loosely)."""
    if is_various(ours):
        return 1.0 if is_various(theirs) else 0.65
    best = 0.0
    for a, wa in artist_variants(ours):
        for b, wb in artist_variants(theirs):
            r = max(fuzz.ratio(a, b), fuzz.token_sort_ratio(a, b)) / 100
            if set(a.split()) <= set(b.split()) or set(b.split()) <= set(a.split()):  # "Mingus" / "Charles Mingus"
                r = max(r, 0.9 if min(len(a.split()), len(b.split())) > 1 else 0.75)
            if min(len(a), len(b)) <= 3 and a != b:
                r = min(r, 0.5)
            best = max(best, r * wa * wb)
    return best


def edition_marker(ours: str, their_title: str, their_artist: str = "") -> str:
    """What the listing says it is and our title does not: "other" (another recording: live, tribute, karaoke,
    demos...), "bigger" (deluxe, expanded, box set...), "soundtrack", or "" for a plain listing."""
    mine = {m.lower() for m in _OTHER.findall(ours)}
    if {m.lower() for m in _OTHER.findall(f"{their_title} / {their_artist}")} - mine:
        return "other"
    for name, pattern in (("bigger", _BIGGER), ("soundtrack", _SOUNDTRACK)):
        if pattern.search(their_title) and not pattern.search(ours):
            return name
    return ""
