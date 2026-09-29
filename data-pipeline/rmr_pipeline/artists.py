"""Artist credits: undo the scraping artefact that glues each member's name onto the billed credit.

The feature table sometimes holds the billed credit followed, with no separator, by the names it lists,
for example "Frank Zappa and The Mothers of InventionFrank ZappaThe Mothers of Invention". clean_artist
keeps the billed credit only. It cuts at the first case or script boundary inside a word (a lowercase
letter or digit directly followed by a capital, or a Latin character directly followed by another script)
when both hold:

- the text before the boundary is a credit that joins several names ("&", ",", "/", "and", "with", ...);
- the glued-on tail repeats a name from that credit (a tail word starts with a word of the credit).

Anything else is left as it is: a cleaner that damages a correct name is worse than a glued one.
"""
import re
import unicodedata

# Joiners of a multi-name credit, matched case-insensitively.
_JOINER = re.compile(r"[,&/]| (?:and|with|featuring|plus|e|x) ", re.IGNORECASE)
# Camel-cased name prefixes ("McCoy", "MacDonald", "DeJohnette", "LaBelle"): never a boundary. Short names
# that end a credit ("Brian Eno", "Antoni Wit") are not prefixes, so this list stays explicit.
_NAME_PREFIX = re.compile(r"^(?:Mc|Mac|De|Di|Da|Du|La|Le|Van|Von)$")
_STOPWORDS = {"and", "with", "the"}


def _latin(c: str) -> bool:
    return c.isascii() or unicodedata.name(c, "").startswith("LATIN")


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


def _words(s: str) -> list[str]:
    """Folded words, also split where one glued name meets the next ("SpringsteenE" -> springsteen, e)."""
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", s)
    return [w for w in re.split(r"[\W_]+", _fold(s)) if w]


def _boundary(s: str, i: int) -> bool:
    prev, cur = s[i - 1], s[i]
    case = (prev.isdigit() or (prev.islower() and _latin(prev))) and cur.isupper() and _latin(cur)
    script = prev.isalnum() and _latin(prev) and cur.isalpha() and not _latin(cur)
    if not (case or script):
        return False
    fragment = s[s.rfind(" ", 0, i) + 1:i]
    return not (case and _NAME_PREFIX.match(fragment))


def clean_artist(raw: str) -> str:
    """The billed credit with glued-on member names removed and whitespace collapsed."""
    s = " ".join(str(raw).split())
    for i in range(1, len(s)):
        if not _boundary(s, i):
            continue
        credit, tail = s[:i], s[i:]
        if len(tail) < 4 or not _JOINER.search(credit):
            continue
        names = [w for w in _words(credit) if len(w) >= 3 and w not in _STOPWORDS]
        if any(t.startswith(n) for n in names for t in _words(tail)):
            return credit
    return s
