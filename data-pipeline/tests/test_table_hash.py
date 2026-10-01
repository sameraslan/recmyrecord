import pandas as pd
import pytest

from rmr_pipeline.constants import DEFAULT_TABLE, DEFAULT_TABLE_SHA256
from rmr_pipeline.table import load_table, sha256_file


def test_default_table_matches_pinned_hash():
    assert sha256_file(DEFAULT_TABLE) == DEFAULT_TABLE_SHA256


def test_custom_table_loads_without_pin(tmp_path):
    p = tmp_path / "t.pkl"
    pd.DataFrame({"a": [1, 2]}).to_pickle(p)
    assert list(load_table(p)["a"]) == [1, 2]


def test_mismatched_hash_is_refused(tmp_path, monkeypatch):
    monkeypatch.delenv("RMR_ALLOW_TABLE_HASH_MISMATCH", raising=False)
    p = tmp_path / "t.pkl"
    pd.DataFrame({"a": [1]}).to_pickle(p)
    with pytest.raises(ValueError, match="SHA-256"):
        load_table(p, expected_sha256="0" * 64)
    monkeypatch.setenv("RMR_ALLOW_TABLE_HASH_MISMATCH", "1")
    assert len(load_table(p, expected_sha256="0" * 64)) == 1


def test_matching_hash_loads(tmp_path):
    p = tmp_path / "t.pkl"
    pd.DataFrame({"a": [1]}).to_pickle(p)
    assert len(load_table(p, expected_sha256=sha256_file(p))) == 1
