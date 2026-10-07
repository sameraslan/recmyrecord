"""Listen links beyond Spotify: the catalog's link columns as the compact refs of albums.json (`l`).

An album with no Spotify id carries `l`, an object with one key per service that the catalog has a link
for. The value is a ref, the part of the link that is the album's own; link_url puts the rest back:

    key  catalog column    ref                                   URL
    am   apple_music_url   <storefront>/<numeric album id>       https://music.apple.com/<storefront>/album/<id>
    bc   bandcamp_url      <host>/<album|track>/<name>           https://<ref>   (host: see BANDCAMP_HOSTS)
    dz   deezer_url        <numeric album id>                    https://www.deezer.com/album/<id>
    yt   youtube_url       <video id, 11 characters>             https://www.youtube.com/watch?v=<id>
    sc   soundcloud_url    <user>/<name> or <user>/sets/<name>   https://soundcloud.com/<ref>

A Bandcamp page can be on the label's own domain (music.sufjan.com), so `bc` keeps the host. The site opens
https://<ref>, so the host is not free: it is <name>.bandcamp.com or one of BANDCAMP_HOSTS, the custom
domains the catalog has today. Query strings and fragments are dropped. A link that does not have its
service's form, or a Bandcamp link on another host, has no ref: the build leaves it out and counts it. The
frontend mirrors link_url. Nothing here reads a file or the network.
"""
import re

# Every host of a catalog Bandcamp link that is not <name>.bandcamp.com (tests/test_catalog_fixes.py compares
# this with catalog/albums.csv). A link on a host that is not here is left out of `l`: look at the page, then
# add its host.
BANDCAMP_HOSTS = (
    "bokeh-versions.com", "brainoil.com", "digital.susumuhirasawa.com", "downloads.tankcrimes.com", "eyevyberecords.com",
    "gregoryandthehawk.com", "halleylabs.com", "kgw.me", "listen.20buckspin.com", "music.amontobin.com",
    "music.bg-aquarium.com", "music.bucketheadpikes.com", "music.businesscasual.biz", "music.disasterpeace.com",
    "music.ictus.be", "music.sufjan.com", "store.bravewave.net", "store.ffdistantworlds.com", "uvarobot.cl", "wrwtfww.com",
)
_BC_HOST = r"(?:[a-z0-9-]+\.bandcamp\.com|" + "|".join(re.escape(h) for h in BANDCAMP_HOSTS) + ")"

# albums.json key -> catalog column, in the order the keys are written.
LINK_COLUMNS = {"am": "apple_music_url", "bc": "bandcamp_url", "dz": "deezer_url", "yt": "youtube_url",
                "sc": "soundcloud_url"}

_END = r"/?(?:[?#].*)?\Z"  # a trailing slash, a query string and a fragment are not part of the ref
_NAME = r"[A-Za-z0-9_-]+"
_LINK_RE = {
    "am": re.compile(r"^https://music\.apple\.com/([a-z]{2})/album/(?:[^/?#\s]+/)?([0-9]+)" + _END),
    "bc": re.compile(rf"^https://({_BC_HOST}/(?:album|track)/[A-Za-z0-9_.~%-]+?)" + _END),
    "dz": re.compile(r"^https://www\.deezer\.com/(?:[a-z]{2}/)?album/([0-9]+)" + _END),
    "yt": re.compile(r"^https://(?:www\.youtube\.com/watch\?(?:[^#\s]*&)?v=|youtu\.be/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])"),
    "sc": re.compile(rf"^https://soundcloud\.com/({_NAME}/(?:sets/)?{_NAME})" + _END),
}
# What a ref looks like, per key. The validator checks albums.json against these. They end with \Z, not $,
# which would let a trailing newline through; use fullmatch all the same.
LINK_REF_RE = {
    "am": re.compile(r"^[a-z]{2}/[0-9]+\Z"),
    "bc": re.compile(rf"^{_BC_HOST}/(?:album|track)/[A-Za-z0-9_.~%-]*[A-Za-z0-9_~%-]\Z"),
    "dz": re.compile(r"^[0-9]+\Z"),
    "yt": re.compile(r"^[A-Za-z0-9_-]{11}\Z"),
    "sc": re.compile(rf"^{_NAME}/(?:sets/)?{_NAME}\Z"),
}


def link_ref(service: str, url: str) -> str:
    """The ref of the catalog link `url` for `service` (a key of LINK_COLUMNS), or "" when the link is
    empty, not of that service's form, or a Bandcamp link on a host that is not allowed."""
    m = _LINK_RE[service].match((url or "").strip())
    if not m:
        return ""
    ref = "/".join(m.groups())
    return ref if LINK_REF_RE[service].fullmatch(ref) else ""


def link_url(service: str, ref: str) -> str:
    """The page a ref stands for:

        am   https://music.apple.com/<storefront>/album/<id>   (Apple needs no name in the path)
        bc   https://<ref>
        dz   https://www.deezer.com/album/<ref>
        yt   https://www.youtube.com/watch?v=<ref>
        sc   https://soundcloud.com/<ref>
    """
    if service not in LINK_REF_RE:
        raise ValueError(f"no link form for {service!r} (known: {', '.join(LINK_REF_RE)})")
    if not LINK_REF_RE[service].fullmatch(ref):
        raise ValueError(f"not a {service} ref: {ref!r}")
    if service == "am":
        storefront, album = ref.split("/")
        return f"https://music.apple.com/{storefront}/album/{album}"
    return {"bc": "https://", "dz": "https://www.deezer.com/album/", "yt": "https://www.youtube.com/watch?v=",
            "sc": "https://soundcloud.com/"}[service] + ref


def album_links(row) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """({key: ref} for the links of a catalog row that have their service's form, in LINK_COLUMNS order;
    [(key, link)] for the ones that do not). `row`: a mapping of catalog columns; a missing column is an
    empty link."""
    links: dict[str, str] = {}
    odd: list[tuple[str, str]] = []
    for service, column in LINK_COLUMNS.items():
        url = str(row.get(column, "") or "").strip()
        if not url:
            continue
        ref = link_ref(service, url)
        if ref:
            links[service] = ref
        else:
            odd.append((service, url))
    return links, odd
