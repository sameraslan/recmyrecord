import pytest

from rmr_pipeline.build import parse_args
from rmr_pipeline.constants import DEFAULT_OUT


def test_skip_images_refuses_the_default_output_folder(capsys):
    with pytest.raises(SystemExit):
        parse_args(["--map-root", "map", "--skip-images"])
    assert "--out" in capsys.readouterr().err


def test_skip_images_with_explicit_out_is_allowed(tmp_path):
    args = parse_args(["--map-root", "map", "--skip-images", "--out", str(tmp_path)])
    assert args.out == tmp_path and args.skip_images


def test_default_out_without_skip_images():
    assert parse_args(["--map-root", "map"]).out == DEFAULT_OUT


def test_hub_correction_is_off_by_default_and_takes_stops(capsys):
    assert parse_args(["--map-root", "map"]).hub_correction == ()
    assert parse_args(["--map-root", "map", "--hub-correction", "balanced"]).hub_correction == ("balanced",)
    assert parse_args(["--map-root", "map", "--hub-correction", "sonic,balanced"]).hub_correction == ("sonic", "balanced")
    with pytest.raises(SystemExit):
        parse_args(["--map-root", "map", "--hub-correction", "loud"])
    assert "unknown stop 'loud'" in capsys.readouterr().err
