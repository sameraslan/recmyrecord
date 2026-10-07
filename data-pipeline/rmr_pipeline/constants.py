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

# The three vocals descriptors. The catalog build can leave them out (rmr_pipeline.catalog).
VOCALS = tuple(sorted(c for c in NON_MOOD if c.endswith(" vocals")))
# The catalog build describes every album by this many descriptors, the first on its RYM page.
CATALOG_DESCRIPTORS = 8

STOPS = ("sonic", "balanced", "mood")
SLIDER = {"sonic": 5.0, "balanced": 1.765, "mood": 0.5}  # balanced: the original site's tuned default (1.765 ** 3 ≈ 5.5)
RECS_PER_STOP = 10
# The stops the audio block decides. In a catalog build an album with no audio has no list at these stops
# and is in nobody's, and its position there is derived from its mood-side neighbours.
AUDIO_STOPS = ("sonic", "balanced")
TOP_DESCRIPTORS = 10
LIVE_POOL = 4000
# n_jobs=1 is what UMAP forces anyway when random_state is set; stating it avoids its UserWarning.
UMAP_PARAMS = {
    "n_neighbors": 15, "n_components": 2, "random_state": 42, "metric": "euclidean", "n_jobs": 1,
}
# UMAP min_dist per stop. The audio block packs sonic and balanced neighbours into tight clumps at 0.1, so covers
# pile up on the map; 0.25 spreads them as evenly as the mood layout. Larger values put fewer of an album's
# recommendations among its nearest albums on the map, which is why mood stays at 0.1.
UMAP_MIN_DIST = {"sonic": 0.25, "balanced": 0.25, "mood": 0.1}
# A group of albums with no album within this many median nearest-neighbour gaps of the rest of the map is an
# island: it is moved next to the map, to this distance.
ISLAND_LINK_GAPS = 10.0

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
# The lettered tile a catalog build draws on the sheets for an album without a cover (images.lettered_tile),
# after the frontend's tile (frontcreck/src/components/Cover.tsx, `.cover .fb` in src/styles/search.css).
MAP_RGB = (27, 21, 17)  # the map's background where the sprites are drawn, as measured on the site
TILE_LIGHT = (237, 229, 213)  # the tile letter's colour, laid over the fill at TILE_INK_ALPHA (`.cover .fb`)
TILE_INK_ALPHA = 0.78
# The 1 px inner border: the fill mixed this far towards TILE_LIGHT, the least that is 3:1 on MAP_RGB for all
# three fills (3.08, 3.11, 3.24).
TILE_BORDER_MIX = 0.30
# Font size over tile size. The frontend's is 0.48 in Cormorant Garamond (cap height 0.63 em); the pipeline's
# font is DejaVu Serif (0.729 em), so this gives capitals of the same height.
TILE_FONT_EM = 0.415
# A letter is drawn when its code point is below this (Basic Latin, Latin-1, Latin Extended-A and -B); the
# committed font has every letter and digit there (tests/test_images.py).
TILE_LETTER_BELOW = 0x0250
TILE_NO_INITIAL = "\u00b7"  # a title with no letter or digit: the frontend's COPY.cover.noInitial

# Sprite sheet geometry. Album i is in sheet i // PER_SHEET at cell i % PER_SHEET, row-major. The frontend
# (frontcreck/src/lib/data/sprites.ts) has the same numbers: change them on both sides together.
ATLAS_SPRITE_PX = 96
ATLAS_COLS = 32
ATLAS_PER_SHEET = 1024
THUMB_SPRITE_PX = 48
THUMB_COLS = 64
THUMB_ROWS = 64
THUMB_PER_SHEET = THUMB_COLS * THUMB_ROWS
# Served atlas file names: atlas-0.webp, atlas-1.webp, ... (no leading zeros).
ATLAS_NAME_RE = re.compile(r"^atlas-(0|[1-9][0-9]*)\.webp$")
# Served thumbnail sheets: thumbs.webp is sheet 0, then thumbs-1.webp, thumbs-2.webp, ... (images.thumbs_name).
THUMBS_NAME_RE = re.compile(r"^thumbs-([1-9][0-9]*)\.webp$")

# The catalog build puts an album with no audio at the mean position of this many albums with audio, its
# nearest by descriptor distance, on the sonic and balanced maps (layout.nearest_with_audio).
NO_AUDIO_NEIGHBOURS = 3
