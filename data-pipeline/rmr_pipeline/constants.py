"""Constants shared by the pipeline. Column lists are copied verbatim from the live recommender."""
import re
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO = PIPELINE_DIR.parent
DEFAULT_TABLE = REPO / "data-retrieval" / "Recommender" / "data" / "all_data_norm.pkl"
# SHA-256 of DEFAULT_TABLE. The table is unpickled (which can run code), so it is pinned.
# After an intentional update, recompute with `sha256sum` and change this value
# (or set RMR_ALLOW_TABLE_HASH_MISMATCH=1 for a one-off run).
DEFAULT_TABLE_SHA256 = "9c1ed17db5eb54273d3f739e10437275d4934399b095ba8ccb6c32098a1e63f8"
DEFAULT_OUT = REPO / "frontcreck" / "public" / "data"
DEFAULT_OVERRIDES = PIPELINE_DIR / "overrides.json"

AUDIO = [
    "danceability", "energy", "key", "loudness", "mode", "speechiness", "acousticness",
    "instrumentalness", "liveness", "valence", "tempo", "duration_ms", "time_signature",
]
# The 56 lyric and theme descriptors the live recommender drops (verbatim list).
LYRIC_DROP = [
    "abstract", "alienation", "conscious", "crime", "suicide", "alcohol", "educational", "fantasy",
    "folklore", "hedonistic", "history", "Halloween", "anti-religious", "pagan", "anarchism", "protest",
    "death", "drugs", "ideology", "political", "religious", "Christian", "Islamic", "satanic",
    "introspective", "LGBT", "love", "breakup", "misanthropic", "mythology", "nature", "occult",
    "paranormal", "philosophical", "existential", "nihilistic", "science fiction", "self-hatred", "sexual",
    "sports", "violence", "war", "apathetic", "boastful", "cryptic", "deadpan", "hateful", "humorous",
    "optimistic", "pessimistic", "poetic", "rebellious", "sarcastic", "satirical", "serious", "vulgar",
]
META = ["Title", "Artist", "URI", "Descriptor Count"]
# Kept by the recommender but not shown as mood words.
NON_MOOD = {
    "male vocals", "female vocals", "androgynous vocals", "vocal group", "instrumental", "concept album",
    "Descriptor Count",
}

STOPS = ("sonic", "balanced", "mood")
SLIDER = {"sonic": 5.0, "balanced": 1.765, "mood": 0.5}  # balanced: the original site's tuned default (1.765 ** 3 ≈ 5.5)
RECS_PER_STOP = 10
TOP_DESCRIPTORS = 10
LIVE_POOL = 4000
# n_jobs=1 is what UMAP forces anyway when random_state is set; stating it avoids its UserWarning.
UMAP_PARAMS = {
    "n_neighbors": 15, "min_dist": 0.1, "n_components": 2, "random_state": 42, "metric": "euclidean", "n_jobs": 1,
}

IN_RAINBOWS_ROW = 11
IN_RAINBOWS_LIVE = ["Tindersticks", "Avalon", "So", "You Will Never Know Why", "Imperial Bedroom"]

COVER_PREFIX = "https://i.scdn.co/image/"
ROOM_RGB = (21, 17, 13)  # --color-room #15110d
MIN_ACCENT_CONTRAST = 4.5  # WCAG AA for the accent on ROOM_RGB
# Cluster fallbacks (mockup AMB_CL), indexed by k % 3: [wash, wash, accent].
FALLBACK_AMBIENT = [
    ("#4a2c20", "#2a2019", "#d49677"),
    ("#303521", "#232219", "#a8b183"),
    ("#4a3a1b", "#2a2219", "#d3b06a"),
]
# Typographic tile colours (mockup FB), indexed by k % 3.
FALLBACK_TILE = [(59, 42, 34), (44, 48, 36), (59, 49, 32)]

ATLAS_SPRITE_PX = 96
ATLAS_COLS = 32
ATLAS_PER_SHEET = 1024
THUMB_SPRITE_PX = 48
THUMB_COLS = 64
THUMB_ROWS = 64
# Served atlas file names: atlas-0.webp, atlas-1.webp, ... (no leading zeros).
ATLAS_NAME_RE = re.compile(r"^atlas-(0|[1-9][0-9]*)\.webp$")
