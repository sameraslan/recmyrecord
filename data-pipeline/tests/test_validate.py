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
