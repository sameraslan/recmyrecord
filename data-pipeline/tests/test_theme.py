import json

import pytest

from rmr_pipeline import theme
from rmr_pipeline.constants import DEFAULT_OUT

ALBUMS = [{"slug": "a"}, {"slug": "b"}]
COLOUR = {
    "family_order": theme.FAMILIES,
    "album_weights": [[0.15, 0.23, 0.0, 0.39, 0.0, 0.23], [0.0, 0.59, 0.08, 0.15, 0.0, 0.18]],
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


def test_pack_weights_rejects_a_table_made_for_another_album_list():
    stale = {**COLOUR, "slugsHash": theme.slugs_hash(list(reversed(ALBUMS)))}
    with pytest.raises(ValueError, match="made for another album list"):
        theme.pack_weights(stale, ALBUMS)
    assert theme.pack_weights({**COLOUR, "slugsHash": theme.slugs_hash(ALBUMS)}, ALBUMS)["n"] == 2


def test_validate_names_every_stale_or_broken_input():
    weights = theme.pack_weights(COLOUR, ALBUMS)
    assert theme.validate(weights, ALBUMS) == []
    errors = theme.validate({**weights, "weights": weights["weights"][:-1] + [90]}, list(reversed(ALBUMS)))
    assert any("do not sum to about 100" in e for e in errors)
    assert any("slugsHash does not match albums.json" in e for e in errors)
    assert any("3 albums" in e for e in theme.validate(weights, ALBUMS + [{"slug": "c"}]))


def test_committed_inputs_match_the_site_data():
    assert theme.check() == []


def test_committed_weights_cover_the_catalog_and_keep_the_fitted_albums():
    """The albums the families were fitted on keep the weights of the design analysis; every later album has a row."""
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    weights = json.loads((theme.THEME_DIR / "weights.json").read_text(encoding="utf-8"))
    assert weights["n"] == len(albums) and len(weights["weights"]) == 6 * len(albums)
    fitted = json.loads((theme.DESIGN_DIR / "regions" / "colour.json").read_text(encoding="utf-8"))["album_weights"]
    assert weights["weights"][:6 * len(fitted)] == [round(v * 100) for row in fitted for v in row]
    # the later albums are coloured too: not left neutral
    later = weights["weights"][6 * len(fitted):]
    neutral = sum(later[5::6]) / (len(later) / 6)
    assert neutral < 25


def test_the_theme_inputs_hold_no_region_names():
    """Region names were removed from the site on 2026-10-06; the folder holds the weights and nothing else."""
    assert sorted(f.name for f in theme.THEME_DIR.iterdir()) == ["README.md", "weights.json"]
