import json

from rmr_pipeline.constants import DEFAULT_OUT, IN_RAINBOWS_LIVE
from rmr_pipeline.validate import validate_dir


def test_committed_outputs_pass_contract():
    summary = validate_dir(DEFAULT_OUT)
    assert summary["albums"] == 4081
    assert summary["vocab"] == 114


def test_in_rainbows_record_and_recs():
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    recs = json.loads((DEFAULT_OUT / "recs.json").read_text(encoding="utf-8"))
    assert albums[11]["slug"] == "in-rainbows-radiohead"
    assert albums[11]["t"] == "In Rainbows"
    assert albums[11]["a"] == "Radiohead"
    assert [albums[i]["t"] for i in recs["mood"][11][:5]] == IN_RAINBOWS_LIVE
    assert albums[42]["slug"] == "vespertine-bjork"
    assert albums[5]["slug"] == "loveless-my-bloody-valentine"
