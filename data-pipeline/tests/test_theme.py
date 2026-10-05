import json

import pytest

from rmr_pipeline import theme
from rmr_pipeline.constants import DEFAULT_OUT

ALBUMS = [{"slug": "a"}, {"slug": "b"}]
COLOUR = {
    "family_order": theme.FAMILIES,
    "album_weights": [[0.15, 0.23, 0.0, 0.39, 0.0, 0.23], [0.0, 0.59, 0.08, 0.15, 0.0, 0.18]],
}
HAND = {"regions": [
    {"id": "live", "name_space": "The Live Belt", "strength": "strong", "n": 174,
     "name_evidence": {"feature": "liveness", "z": 3.17}, "cx": -0.236, "cy": 0.883, "radius": 0.105},
    {"id": "pastoral", "name_space": "Pastoral Nebula", "strength": "fair", "n": 226,
     "name_evidence": {"word": "pastoral", "coverage": 0.5, "max_other_region": 0.2}, "cx": 0.065, "cy": -0.321,
     "radius": 0.117},
]}
AUTO_STOP = {
    "album_region": [1, 1, 2, -1],
    "regions": [
        {"id": "area-heavy", "level": 0, "name": None, "word": "heavy", "strength": "strong", "n": 965,
         "priority": 12.9144, "cx": -0.691, "cy": 0.367, "radius": 0.35},
        {"id": "urban", "level": 1, "name": "Urban Cluster", "word": "urban", "strength": "strong", "n": None,
         "priority": 2.35221, "cx": 0.53111, "cy": 0.463, "radius": 0.102},
        {"id": "lush", "level": 1, "name": None, "word": "lush", "strength": "strong", "n": 54,
         "priority": 2.0878, "cx": 0.331, "cy": 0.022, "radius": 0.068},
    ],
}


def test_pack_weights_makes_flat_integer_shares_in_album_order():
    assert theme.pack_weights(COLOUR, ALBUMS) == {
        "n": 2,
        "families": ["fierce", "warm", "quiet", "dark", "urban", "neutral"],
        "slugsHash": theme.slugs_hash(ALBUMS),
        "weights": [15, 23, 0, 39, 0, 23, 0, 59, 8, 15, 0, 18],
    }


def test_pack_weights_rejects_a_table_for_another_album_count():
    with pytest.raises(ValueError, match="2 weight rows but albums.json has 3 albums"):
        theme.pack_weights(COLOUR, ALBUMS + [{"slug": "c"}])


def test_pack_weights_rejects_rows_that_do_not_sum_to_one():
    bad = {**COLOUR, "album_weights": [[0.5, 0.2, 0.0, 0.0, 0.0, 0.0], COLOUR["album_weights"][1]]}
    with pytest.raises(ValueError, match="weights row 0"):
        theme.pack_weights(bad, ALBUMS)


def test_hand_balanced_keeps_every_region_with_the_prototype_priority():
    live, pastoral = theme.hand_balanced(HAND)
    assert live == {"id": "live", "name": "The Live Belt", "word": "liveness", "strength": "strong", "level": 1,
                    "n": 174, "priority": 2.1772, "cx": -0.236, "cy": 0.883, "radius": 0.105}
    # fair: 1 + 226 / 1000 + (0.5 - 0.2) / 100
    assert pastoral["priority"] == 1.229
    assert tuple(pastoral) == theme.REGION_KEYS


def test_auto_named_drops_broad_areas_and_regions_without_a_place_name():
    assert theme.auto_named(AUTO_STOP) == [
        {"id": "urban", "name": "Urban Cluster", "word": "urban", "strength": "strong", "level": 1, "n": 2,
         "priority": 2.3522, "cx": 0.5311, "cy": 0.463, "radius": 0.102},
    ]


def test_validate_names_every_stale_or_broken_input():
    weights = theme.pack_weights(COLOUR, ALBUMS)
    regions = {"positionsHash": theme.short_hash(b"positions"), "sonic": theme.auto_named(AUTO_STOP),
               "balanced": theme.hand_balanced(HAND), "mood": theme.auto_named(AUTO_STOP)}
    assert theme.validate(weights, regions, ALBUMS, b"positions") == []
    errors = theme.validate({**weights, "weights": weights["weights"][:-1] + [90]},
                            {**regions, "mood": []}, list(reversed(ALBUMS)), b"moved")
    assert any("do not sum to about 100" in e for e in errors)
    assert any("slugsHash does not match albums.json" in e for e in errors)
    assert any("positionsHash does not match positions.json" in e for e in errors)
    assert any("mood has no regions" in e for e in errors)


def test_committed_inputs_match_the_site_data():
    assert theme.check() == []


def test_committed_regions_are_the_named_ones_of_each_stop():
    regions = json.loads((theme.THEME_DIR / "regions.json").read_text(encoding="utf-8"))
    assert [len(regions[s]) for s in ("sonic", "balanced", "mood")] == [7, 17, 6]
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    weights = json.loads((theme.THEME_DIR / "weights.json").read_text(encoding="utf-8"))
    assert weights["n"] == len(albums)
