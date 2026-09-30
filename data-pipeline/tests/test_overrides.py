import json

import pytest

from rmr_pipeline.constants import DEFAULT_OVERRIDES
from rmr_pipeline.overrides import apply_overrides, load_overrides, slugs_after_overrides
from rmr_pipeline.slugs import make_slugs


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
    covers, spots, images, artists = apply_overrides(["a", "b"], ["c1", "c2"], ["s1", "s2"], o, tmp_path,
                                                     artists=["A", "B"])
    assert covers == ["c1", "ab67616d0000b273" + "0" * 24]
    assert spots == ["s1", "A" * 22]
    assert images == {1: img.resolve()}
    assert artists == ["A", "B"]


def test_cover_change_requires_its_image(tmp_path):
    p = tmp_path / "o.json"
    p.write_text(json.dumps({"blue-joni-mitchell": {"c": "ab67616d0000b273" + "0" * 24}}))
    with pytest.raises(ValueError):
        load_overrides(p)


def test_apply_rejects_unknown_slug(tmp_path):
    with pytest.raises(KeyError):
        apply_overrides(["a"], ["c"], ["s"], {"zzz": {"c": "x"}}, tmp_path, artists=["A"])


def _write(tmp_path, data):
    p = tmp_path / "o.json"
    p.write_text(json.dumps(data))
    return p


COVER = "ab67616d0000b273" + "0" * 24


def test_accepts_artist_and_empty_spotify_id(tmp_path):
    data = {"x": {"a": "Songs: Ohia", "note": "credited artist"},
            "y": {"s": "", "c": "", "image": "y.jpg", "note": "no Spotify release"}}
    assert load_overrides(_write(tmp_path, data)) == data


@pytest.mark.parametrize("entry, message", [
    ({"a": "  "}, "artist"),
    ({"s": "short"}, "Spotify"),
    ({"s": "A" * 21 + "!"}, "Spotify"),
    ({"c": "not-a-cover-id", "image": "x.jpg"}, "cover"),
    ({"image": ""}, "image"),
])
def test_rejects_malformed_values_with_a_clear_error(tmp_path, entry, message):
    with pytest.raises(ValueError, match=message):
        load_overrides(_write(tmp_path, {"x": entry}))


def test_apply_sets_artist_and_empty_spotify_id(tmp_path):
    (tmp_path / "y.jpg").write_bytes(b"")
    o = {"a": {"a": "New Name"}, "b": {"s": "", "c": "", "image": "y.jpg"}}
    covers, spots, images, artists = apply_overrides(
        ["a", "b"], ["c1", "c2"], ["s1", "s2"], o, tmp_path, artists=["Old", "B"])
    assert artists == ["New Name", "B"]
    assert spots == ["s1", ""]
    assert covers == ["c1", ""]
    assert images == {1: (tmp_path / "y.jpg").resolve()}


def test_slugs_follow_the_corrected_artist():
    slugs = make_slugs(["T", "U"], ["Old", "B"])
    assert slugs_after_overrides(["T", "U"], ["New Name", "B"], slugs, {0}) == ["t-new-name", "u-b"]


def test_an_artist_correction_may_not_move_another_slug():
    titles = ["T", "T"]
    slugs = make_slugs(titles, ["Old", "B"])  # t-old, t-b
    with pytest.raises(ValueError, match="slug"):
        slugs_after_overrides(titles, ["B", "B"], slugs, {0})  # would take t-b and push the other to t-b-2
