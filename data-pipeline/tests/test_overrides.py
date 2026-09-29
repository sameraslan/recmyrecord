import json

import pytest

from rmr_pipeline.constants import DEFAULT_OVERRIDES
from rmr_pipeline.overrides import apply_overrides, load_overrides


def test_shipped_overrides_file_is_valid():
    assert isinstance(load_overrides(DEFAULT_OVERRIDES), dict)


def test_missing_file_means_no_overrides(tmp_path):
    assert load_overrides(tmp_path / "nope.json") == {}


def test_rejects_unknown_fields(tmp_path):
    p = tmp_path / "o.json"
    p.write_text(json.dumps({"blue-joni-mitchell": {"cover": "x"}}))
    with pytest.raises(ValueError):
        load_overrides(p)


def test_apply_sets_cover_spotify_and_image(tmp_path):
    img = tmp_path / "blue.jpg"
    img.write_bytes(b"not read here")
    o = {"b": {"c": "ab67616d0000b273" + "0" * 24, "s": "A" * 22, "image": "blue.jpg", "note": "wrong sleeve"}}
    covers, spots, images = apply_overrides(["a", "b"], ["c1", "c2"], ["s1", "s2"], o, tmp_path)
    assert covers == ["c1", "ab67616d0000b273" + "0" * 24]
    assert spots == ["s1", "A" * 22]
    assert images == {1: img.resolve()}


def test_cover_change_requires_its_image(tmp_path):
    p = tmp_path / "o.json"
    p.write_text(json.dumps({"blue-joni-mitchell": {"c": "ab67616d0000b273" + "0" * 24}}))
    with pytest.raises(ValueError):
        load_overrides(p)


def test_apply_rejects_unknown_slug(tmp_path):
    with pytest.raises(KeyError):
        apply_overrides(["a"], ["c"], ["s"], {"zzz": {"c": "x"}}, tmp_path)
