import json
import shutil

import pytest

from rmr_pipeline.constants import DEFAULT_OUT
from rmr_pipeline.validate import ContractError, main, validate_dir


@pytest.fixture
def out(tmp_path):
    d = tmp_path / "data"
    shutil.copytree(DEFAULT_OUT, d)
    return d


def test_stray_atlas_name_is_a_contract_error(out):
    (out / "atlas-old.webp").write_bytes(b"x")
    with pytest.raises(ContractError, match="atlas-old.webp"):
        validate_dir(out)


def test_extra_numbered_atlas_is_a_contract_error(out):
    shutil.copy(out / "atlas-0.webp", out / "atlas-4.webp")
    with pytest.raises(ContractError, match="atlas-4.webp"):
        validate_dir(out)


def test_missing_json_is_a_contract_error(out):
    (out / "recs.json").unlink()
    with pytest.raises(ContractError, match="recs.json"):
        validate_dir(out, images=False)


def test_malformed_json_is_a_contract_error(out):
    (out / "vocab.json").write_text("[", encoding="utf-8")
    with pytest.raises(ContractError, match="vocab.json"):
        validate_dir(out, images=False)


def test_cli_reports_fail_instead_of_a_traceback(out, capsys):
    (out / "albums.json").unlink()
    assert main(["--data", str(out), "--no-images"]) == 1
    assert "FAIL" in capsys.readouterr().err


def test_nested_list_in_positions_is_a_contract_error(out):
    positions = json.loads((out / "positions.json").read_text(encoding="utf-8"))
    positions["sonic"][0] = [0.1, 0.2]
    (out / "positions.json").write_text(json.dumps(positions), encoding="utf-8")
    with pytest.raises(ContractError, match="positions.sonic"):
        validate_dir(out, images=False)


# --- the catalog build's additions: `l`, `n`, the prefixed cover ids, several thumbnail sheets ---

def _read(out, name):
    return json.loads((out / name).read_text(encoding="utf-8"))


def _write(out, name, data):
    (out / name).write_text(json.dumps(data), encoding="utf-8")


def _make_mood_only(out, i):
    """Album `i` as the catalog build writes an album with no audio: `n`, no sonic or balanced list, and
    in nobody else's."""
    albums, recs = _read(out, "albums.json"), _read(out, "recs.json")
    albums[i]["n"] = 1
    for stop in ("sonic", "balanced"):
        for j, row in enumerate(recs[stop]):
            if i in row:
                row[row.index(i)] = next(x for x in range(len(albums))
                                         if x not in row and x not in (i, j) and "n" not in albums[x])
        recs[stop][i] = []
    _write(out, "albums.json", albums)
    _write(out, "recs.json", recs)


def _edit(out, i, **fields):
    albums = _read(out, "albums.json")
    albums[i].update(fields)
    _write(out, "albums.json", albums)


def test_the_catalog_fields_pass(out):
    _make_mood_only(out, 7)
    _edit(out, 20, s="", l={"am": "us/1097861387", "bc": "magdalenabay.bandcamp.com/album/imaginal-disk",
                             "dz": "14879699", "yt": "zdPCt5ZEf40", "sc": "radiohead/sets/ok-computer-3"})
    albums = _read(out, "albums.json")
    albums[30] = {**{k: albums[30][k] for k in list(albums[30])[:8]}, "s": "", "l": {"yt": "zdPCt5ZEf40"}, "n": 1}
    _write(out, "albums.json", albums)
    _make_mood_only(out, 30)
    _edit(out, 40, c="dz:" + "0f" * 16)
    _edit(out, 41, c="am:Music123/v4/79/3d/46/793d4679-4403-4272-02ea-0fd251633b77/195081767970.rgb.jpg")
    _edit(out, 42, c="bc:2980782782")
    _edit(out, 43, c="yt:mnjH-ZYe59c")
    summary = validate_dir(out, images=False)
    assert (summary["albums"], summary["links"], summary["no_audio"]) == (4081, 2, 2)


def test_the_summary_of_the_site_data_has_no_catalog_counts(out):
    assert sorted(validate_dir(out, images=False)) == ["albums", "empty_descriptors", "no_cover", "vocab"]


@pytest.mark.parametrize("fields,message", [
    (dict(l={"dz": "14879699"}), "l is only for an album with no Spotify id"),
    (dict(s="", l={}), "l must be"),
    (dict(s="", l=["dz"]), "l must be"),
    (dict(s="", l={"spotify": "x"}), "l must be"),
    (dict(s="", l={"dz": "14879699", "am": "us/1"}), "l must be"),  # not in the order am, bc, dz, yt, sc
    (dict(s="", l={"dz": "abc"}), "bad dz link"),
    (dict(s="", l={"am": "1097861387"}), "bad am link"),
    (dict(s="", l={"bc": "https://x.bandcamp.com/album/y"}), "bad bc link"),
    (dict(s="", l={"yt": "short"}), "bad yt link"),
    (dict(s="", l={"sc": "radiohead"}), "bad sc link"),
    (dict(s="", l={"sc": 5}), "bad sc link"),
    (dict(c="dz:xyz"), "bad cover id"),
    (dict(c="am:../etc"), "bad cover id"),
    (dict(c="bc:"), "bad cover id"),
    (dict(c="yt:tooshort"), "bad cover id"),
    (dict(c="sp:" + "0" * 40), "bad cover id"),
])
def test_malformed_catalog_fields_are_contract_errors(out, fields, message):
    _edit(out, 20, **fields)
    with pytest.raises(ContractError, match=r"albums\[20\]: " + message):
        validate_dir(out, images=False)


@pytest.mark.parametrize("n", [0, 2, True, "1"])
def test_n_is_only_ever_1(out, n):
    _make_mood_only(out, 7)
    _edit(out, 7, n=n)
    with pytest.raises(ContractError, match=r"albums\[7\]: n must be 1"):
        validate_dir(out, images=False)


def test_the_optional_keys_have_their_place(out):
    albums = _read(out, "albums.json")
    albums[20] = {**albums[20], "s": "", "n": 1, "l": {"dz": "1"}}  # n before l
    albums[21] = {**albums[21], "x": 1}
    albums[22] = {"n": 1, **albums[22]}
    _write(out, "albums.json", albums)
    with pytest.raises(ContractError) as e:
        validate_dir(out, images=False)
    assert all(f"albums[{i}]: keys must be" in str(e.value) for i in (20, 21, 22))


def test_an_album_with_no_audio_has_no_sonic_or_balanced_list_and_is_in_none(out):
    _make_mood_only(out, 7)
    validate_dir(out, images=False)
    recs = _read(out, "recs.json")
    good = json.loads(json.dumps(recs))
    recs["sonic"][7] = recs["mood"][7]
    _write(out, "recs.json", recs)
    with pytest.raises(ContractError, match=r"recs.sonic\[7\] must be empty"):
        validate_dir(out, images=False)
    recs = json.loads(json.dumps(good))
    recs["balanced"][9][3] = 7
    _write(out, "recs.json", recs)
    with pytest.raises(ContractError, match=r"recs.balanced\[9\] lists album 7, which has no audio"):
        validate_dir(out, images=False)
    recs = json.loads(json.dumps(good))
    recs["mood"][7] = []
    _write(out, "recs.json", recs)
    with pytest.raises(ContractError, match=r"recs.mood\[7\] must be 10 unique album ids"):
        validate_dir(out, images=False)
    recs = json.loads(json.dumps(good))
    recs["mood"][9][0] = 7 if 7 not in recs["mood"][9] else recs["mood"][9][0]  # fine at the mood stop
    _write(out, "recs.json", recs)
    validate_dir(out, images=False)


def test_an_album_with_audio_needs_its_lists(out):
    recs = _read(out, "recs.json")
    recs["balanced"][9] = []
    _write(out, "recs.json", recs)
    with pytest.raises(ContractError, match=r"recs.balanced\[9\] must be 10 unique album ids"):
        validate_dir(out, images=False)


def test_thumbnail_sheets_are_counted_like_the_atlases(tmp_path, monkeypatch):
    """ceil(albums / per sheet) sheets, named thumbs.webp, thumbs-1.webp, ...; nothing else thumbs-like."""
    import rmr_pipeline.images as images
    import rmr_pipeline.validate as validate
    from rmr_pipeline.constants import ATLAS_SPRITE_PX
    from rmr_pipeline.images import tile, write_sheets

    for module in (images, validate):
        for name, value in (("ATLAS_COLS", 2), ("ATLAS_PER_SHEET", 4), ("THUMB_COLS", 2), ("THUMB_ROWS", 2),
                            ("THUMB_PER_SHEET", 4)):
            if hasattr(module, name):
                monkeypatch.setattr(module, name, value)

    def errors(n):
        errs = []
        validate._validate_images(tmp_path, n, errs.append)
        return errs

    write_sheets(tmp_path, [tile(0, ATLAS_SPRITE_PX)] * 9)
    assert errors(9) == []
    assert errors(13) == ["missing atlas-3.webp", "missing thumbs-3.webp"]
    assert errors(8) == ["unexpected atlas file atlas-2.webp: 8 albums need 2 sheets",
                         "unexpected thumbnail file thumbs-2.webp: 8 albums need 2 sheets"]
    (tmp_path / "thumbs-old.webp").write_bytes(b"x")
    (tmp_path / "thumbs-0.webp").write_bytes(b"x")
    assert errors(9) == ["unexpected file thumbs-0.webp: thumbnail sheets are named thumbs.webp, thumbs-<n>.webp",
                         "unexpected file thumbs-old.webp: thumbnail sheets are named thumbs.webp, thumbs-<n>.webp"]
    (tmp_path / "thumbs-old.webp").unlink()
    (tmp_path / "thumbs-0.webp").unlink()
    (tmp_path / "thumbs-1.webp").write_bytes((tmp_path / "atlas-0.webp").read_bytes())
    assert errors(9) == ["thumbs-1.webp must be a 96x96 WebP"]
