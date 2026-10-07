"""Album keys (audio/keys.csv) and the catalog table (catalog/albums.csv): the committed files agree with each
other, with the feature table and with the audio store."""
import csv
import json

import numpy as np
import pytest

from rmr_pipeline.artists import clean_artist
from rmr_pipeline.audio import load_transform
from rmr_pipeline.audio_store import DEFAULT_AUDIO, StoreError, load_match_overrides, load_matches, load_store
from rmr_pipeline.constants import PIPELINE_DIR
from rmr_pipeline.keys import (KEYS_FIELDS, RYM_ID_RE, check_rows, is_legacy, is_placeholder, load_keys, placeholder,
                               write_keys)
from rmr_pipeline.slugs import make_slugs

CATALOG = PIPELINE_DIR / "catalog"
URI = "spotify:album:" + "a" * 22


def _rows(path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def catalog():
    return _rows(CATALOG / "albums.csv")


@pytest.fixture(scope="module")
def keys():
    return load_keys()


def _row(key, uri=URI, by="spotify_id"):
    return {"rym_id": key, "legacy_uri": uri, "matched_by": by, "doubt": ""}


def test_key_translation(tmp_path):
    other = "spotify:album:" + "b" * 22
    m = check_rows([_row("Album45"), _row(placeholder(other), other, "none")])
    assert placeholder(other) == "sp:" + "b" * 22 and is_placeholder(placeholder(other)) and is_legacy(other)
    assert m.keys_of([other, URI]) == ["sp:" + "b" * 22, "Album45"]
    assert m.legacy("Album45") == URI and m.legacy("Album7") is None
    # a key of any age: the URI, the current key, a key that never had a URI
    assert [m.current(k) for k in (URI, "Album45", "Album7", other, placeholder(other))] == [
        "Album45", "Album45", "Album7", placeholder(other), placeholder(other)]
    # the placeholder has been given its RYM id since: both of its old keys lead to it
    later = check_rows([_row("Album45"), _row("Album99", other, "manual")])
    assert later.current(placeholder(other)) == later.current(other) == "Album99"
    with pytest.raises(StoreError, match="no key for 1 album"):
        m.keys_of([URI, "spotify:album:" + "c" * 22])
    with pytest.raises(StoreError, match="no key for"):
        m.current("spotify:album:" + "c" * 22)
    write_keys(tmp_path / "keys.csv", list(m.rows))
    assert load_keys(tmp_path / "keys.csv") == m
    assert (tmp_path / "keys.csv").read_text(encoding="utf-8").splitlines()[0] == ",".join(KEYS_FIELDS)
    with pytest.raises(StoreError, match="missing"):
        load_keys(tmp_path / "nowhere.csv")


@pytest.mark.parametrize("rows, message", [
    ([_row("Album45"), _row("Album45", "spotify:album:" + "b" * 22)], "given to two albums"),
    ([_row("Album45"), _row("Album46")], "repeated"),
    ([_row("Album45", "deezer:1")], "not a Spotify album URI"),
    ([_row("sp:" + "b" * 22, by="none")], "the placeholder of"),
    ([_row("45")], "neither a RYM id"),
    ([_row("Album45", by="none")], "does not fit the key"),
    ([_row(placeholder(URI), by="spotify_id")], "does not fit the key"),
    ([_row("Album45", by="guess")], "does not fit the key"),
])
def test_malformed_keys_are_refused(rows, message):
    with pytest.raises(StoreError, match=message):
        check_rows(rows)


def test_a_hand_set_key_may_be_a_placeholder():
    """`manual` with a placeholder says: looked at, the album is not on the chart."""
    assert check_rows([_row(placeholder(URI), by="manual")]).current(URI) == placeholder(URI)


def test_keys_are_one_to_one_and_cover_the_feature_table(deduped, keys):
    sub, _ = deduped
    uris = [str(u) for u in sub["URI"]]
    assert [r["legacy_uri"] for r in keys.rows] == uris  # one row per album, in catalog order
    assert len(keys.key_of_uri) == len(keys.uri_of_key) == len(uris)  # a bijection
    assert {keys.legacy(k) for k in keys.keys_of(uris)} == set(uris)
    for r in keys.rows:
        assert is_placeholder(r["rym_id"]) == (r["matched_by"] == "none") or r["matched_by"] == "manual"
        assert is_placeholder(r["rym_id"]) or RYM_ID_RE.match(r["rym_id"])


def test_catalog_keeps_the_existing_albums_first_and_as_they_are(deduped, catalog, keys):
    sub, _ = deduped
    n = len(sub)
    old, new = catalog[:n], catalog[n:]
    assert [r["legacy_uri"] for r in old] == [str(u) for u in sub["URI"]]  # row number = album number on the site
    assert [r["rym_id"] for r in old] == [r["rym_id"] for r in keys.rows]
    assert [r["title"] for r in old] == [str(t) for t in sub["Title"]]  # not the sheet's spellings
    artists = [clean_artist(a) for a in sub["Artist"].astype(str)]
    assert [r["artist"] for r in old] == artists
    assert make_slugs([r["title"] for r in catalog], [r["artist"] for r in catalog])[:n] == make_slugs(
        [str(t) for t in sub["Title"]], artists)  # appended albums do not move a slug
    assert all(not r["legacy_uri"] and r["on_chart"] == "1" for r in new)
    ranks = [int(r["rank"]) for r in new]
    assert ranks == sorted(ranks)


def test_catalog_keys_and_chart_membership(catalog):
    ids = [r["rym_id"] for r in catalog]
    assert len(set(ids)) == len(ids)
    on = [r for r in catalog if r["on_chart"] == "1"]
    assert sorted(int(r["rank"]) for r in on) == list(range(1, len(on) + 1))  # every chart row, once
    for r in catalog:
        assert r["on_chart"] in ("0", "1")
        if is_placeholder(r["rym_id"]):
            assert r["rym_id"] == placeholder(r["legacy_uri"]) and r["on_chart"] == "0" and not r["rym_url"]
        else:
            assert RYM_ID_RE.match(r["rym_id"])
        if r["on_chart"] == "0":
            assert r["legacy_uri"] and not r["rank"]  # only an existing album can be off the chart
        else:
            assert r["rym_url"] and r["rym_artist"] and r["rym_title"]
    summary = json.loads((CATALOG / "manifest.json").read_text(encoding="utf-8"))
    assert summary["albums"] == len(catalog) == summary["existing"] + summary["new"]
    assert summary["existing_off_chart"] == sum(r["on_chart"] == "0" for r in catalog)
    assert summary["sheet"]["rows"] == len(on) == summary["existing_on_chart"] + summary["new"]


def test_every_key_of_the_store_is_in_the_catalog(catalog):
    ids = {r["rym_id"] for r in catalog}
    store = load_store(DEFAULT_AUDIO)
    transform = load_transform(DEFAULT_AUDIO / "transform.npz")
    assert set(store.keys.tolist()) <= ids
    assert {m["key"] for m in load_matches(DEFAULT_AUDIO / "matches.csv")} <= ids
    assert set(load_match_overrides(DEFAULT_AUDIO / "match_overrides.json")) <= ids
    assert transform.keys is not None and set(transform.keys.tolist()) <= ids
    assert not any(is_legacy(k) for k in np.concatenate([store.keys, transform.keys]).tolist())


def test_doubtful_pairs_say_what_was_done(catalog, keys):
    doubts = _rows(CATALOG / "doubtful_pairs.csv")
    row = {r["rym_id"]: r for r in catalog}
    assert len({(d["legacy_uri"], d["rym_id"]) for d in doubts}) == len(doubts)  # one row per pair
    listed: dict[str, set] = {}
    for d in doubts:
        key = keys.key_of_uri[d["legacy_uri"]]
        assert d["legacy_key"] == key and row[d["rym_id"]]["on_chart"] == "1" and d["reason"]
        assert d["default"] == ("paired" if key == d["rym_id"] else "unpaired")
        assert d["rym_paired_with"] == ("" if key == d["rym_id"] else row[d["rym_id"]]["legacy_uri"])
        listed.setdefault(d["legacy_uri"], set()).update(d["reason"].split(";"))
    for r in keys.rows:  # keys.csv marks exactly the albums that are listed
        assert set(filter(None, r["doubt"].split(";"))) == listed.get(r["legacy_uri"], set())
