"""The site's own copies of the Cover Art Archive covers (frontcreck/public/covers/<mbid>.jpg): `covers host`,
and what the validator and the build ask of the folder. No test here uses the network: the fetcher is a fake."""
import io
import json

import pytest
from PIL import Image

from rmr_pipeline import covers as cv
from rmr_pipeline.validate import ContractError, validate_dir

from test_covers import Clock, Net
from test_covers_caa import M1, M2, M3, album, table


def picture(size=(1200, 900), mode="RGB", colour=(10, 120, 200), fmt="JPEG", **save):
    buf = io.BytesIO()
    Image.new(mode, size, colour if mode != "RGBA" else (*colour, 128)).save(buf, fmt, **save)
    return buf.getvalue()


def host(tmp_path, wanted, net, clock=None, **kw):
    clock = clock or Clock()
    f = cv.Fetcher(cv.CAA_INTERVALS, fetch=net, sleep=clock.sleep, clock=clock.now)
    lines = []
    code = cv.run_host(wanted, tmp_path / "covers", tmp_path / "state.json", f, out=lines.append, **kw)
    return code, lines


def files(tmp_path):
    return sorted(p.name for p in (tmp_path / "covers").iterdir())


def index(tmp_path):
    return json.loads((tmp_path / "covers" / "index.json").read_text())


# --- the file ----------------------------------------------------------------------------------------

def test_the_copy_is_asked_at_500_px_and_served_from_the_sites_own_folder():
    assert cv.hosted_url(M1) == f"https://coverartarchive.org/release-group/{M1}/front-500" == cv.cover_url(f"ca:{M1}", 500)
    assert cv.site_cover_path(f"ca:{M1}") == f"/covers/{M1}.jpg"
    assert cv.site_cover_path("dz:" + "a" * 32) == "" and cv.site_cover_path("") == ""
    assert cv.hosted_path("covers", M1).name == f"{M1}.jpg"
    for bad in ("../x", M1.upper(), M1 + "/x", ""):
        with pytest.raises(ValueError):
            cv.hosted_path("covers", bad)


def test_a_copy_is_a_progressive_jpeg_of_at_most_500_px_without_metadata():
    exif = Image.Exif()
    exif[0x010E] = "a description"
    data, size = cv.make_hosted(picture((1200, 900), exif=exif.tobytes()))
    with Image.open(io.BytesIO(data)) as im:
        assert im.format == "JPEG" and im.size == size == (500, 375) and im.mode == "RGB"
        assert im.info.get("progressive") and not im.getexif() and "icc_profile" not in im.info
    assert cv.make_hosted(picture((300, 480)))[1] == (300, 480)  # never enlarged
    assert cv.make_hosted(picture((400, 1000)))[1] == (200, 500)
    data, size = cv.make_hosted(picture((640, 640), mode="RGBA", fmt="PNG"))  # a PNG with transparency: flattened
    with Image.open(io.BytesIO(data)) as im:
        assert im.format == "JPEG" and im.mode == "RGB" and size == (500, 500)
    with pytest.raises((OSError, ValueError)):
        cv.make_hosted(b"<html>not an image</html>")


def test_a_copy_stands_the_right_way_up_when_the_file_says_so_in_its_metadata():
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees to show
    assert cv.make_hosted(picture((1000, 600), exif=exif.tobytes()))[1] == (300, 500)


# --- the run -----------------------------------------------------------------------------------------

def test_host_fetches_what_is_missing_and_records_each_size(tmp_path):
    net = Net({cv.hosted_url(M1): picture((1200, 1200)), cv.hosted_url(M2): picture((600, 400))})
    code, lines = host(tmp_path, [M1, M2], net)
    assert code == 0 and net.asked == [cv.hosted_url(M1), cv.hosted_url(M2)]
    assert files(tmp_path) == sorted([f"{M1}.jpg", f"{M2}.jpg", "index.json"])
    assert index(tmp_path) == {M1: [500, 500], M2: [500, 333]}
    assert "2 made" in lines[-1]
    again = Net()
    assert host(tmp_path, [M1, M2], again)[0] == 0 and again.asked == []  # resumable: nothing twice


def test_host_removes_the_copy_of_a_cover_that_is_no_longer_in_use(tmp_path):
    net = Net({cv.hosted_url(m): picture() for m in (M1, M2, M3)})
    assert host(tmp_path, [M1, M2], net)[0] == 0
    (tmp_path / "covers" / "notes.txt").write_text("not ours to delete")
    code, lines = host(tmp_path, [M2, M3], net)  # M1 left the table (or went on the skip list), M3 came
    assert code == 0 and files(tmp_path) == sorted([f"{M2}.jpg", f"{M3}.jpg", "index.json", "notes.txt"])
    assert set(index(tmp_path)) == {M2, M3} and net.asked.count(cv.hosted_url(M2)) == 1
    assert any("1 removed" in line for line in lines)


def test_a_file_without_its_record_is_made_again(tmp_path):
    net = Net({cv.hosted_url(M1): picture((800, 800))})
    (tmp_path / "covers").mkdir()
    (tmp_path / "covers" / f"{M1}.jpg").write_bytes(picture((64, 64)))  # a killed run, or a file put there by hand
    assert host(tmp_path, [M1], net)[0] == 0 and net.asked == [cv.hosted_url(M1)]
    assert index(tmp_path) == {M1: [500, 500]}
    (tmp_path / "covers" / f"{M1}.jpg").unlink()  # the record without its file
    assert host(tmp_path, [M1], net)[0] == 0 and len(net.asked) == 2


def test_the_dry_run_and_the_limit(tmp_path):
    net = Net({cv.hosted_url(m): picture() for m in (M1, M2, M3)})
    assert host(tmp_path, [M1, M2, M3], net, limit=2)[0] == 0 and len(net.asked) == 2
    assert set(index(tmp_path)) == {M1, M2}
    assert cv.hosted_todo([M1, M2, M3], tmp_path / "covers") == ([M3], [])
    assert cv.hosted_todo([M3], tmp_path / "covers") == ([M3], sorted([f"{M1}.jpg", f"{M2}.jpg"]))


def test_the_archive_is_asked_at_most_once_a_second(tmp_path):
    clock = Clock()
    net = Net({cv.hosted_url(m): picture() for m in (M1, M2, M3)})
    assert host(tmp_path, [M1, M2, M3], net, clock)[0] == 0
    assert sum(clock.slept) >= 2.0


def test_an_unanswered_image_is_not_written_and_is_asked_again(tmp_path):
    net = Net({cv.hosted_url(M1): 500, cv.hosted_url(M2): picture()})  # the storage hosts answer 500 at times
    code, lines = host(tmp_path, [M1, M2], net)
    assert code == 0 and files(tmp_path) == sorted([f"{M2}.jpg", "index.json"])
    assert any(M1 in line and "asked again" in line for line in lines) and "1 to ask again" in lines[-1]
    net.pages[cv.hosted_url(M1)] = picture()
    assert host(tmp_path, [M1, M2], net)[0] == 0 and set(index(tmp_path)) == {M1, M2}


def test_an_image_that_is_gone_or_is_no_image_is_reported_and_leaves_no_file(tmp_path):
    net = Net({cv.hosted_url(M2): b"<html>", cv.hosted_url(M3): picture()})  # M1: HTTP 404
    code, lines = host(tmp_path, [M1, M2, M3], net)
    assert code == 0 and files(tmp_path) == sorted([f"{M3}.jpg", "index.json"])
    assert "2 failed" in lines[-1] and any(M1 in line and "404" in line for line in lines)


def test_a_503_from_the_archive_stops_the_run_and_keeps_what_was_made(tmp_path):
    clock = Clock()
    net = Net({cv.hosted_url(M1): picture(), cv.hosted_url(M2): 503, cv.hosted_url(M3): picture()})
    code, lines = host(tmp_path, [M1, M2, M3], net, clock)
    assert code == 2 and net.asked == [cv.hosted_url(M1), cv.hosted_url(M2), cv.hosted_url(M2)]  # one retry, then nothing more
    assert cv.MB_BUSY_WAIT in clock.slept or sum(clock.slept) >= cv.MB_BUSY_WAIT
    assert index(tmp_path) == {M1: [500, 375]} and "stopped" in lines[-1]


def test_one_host_run_at_a_time(tmp_path):
    lock = cv.take_lock(cv.lock_path(tmp_path / "state.json", "host"))
    try:
        net = Net({cv.hosted_url(M1): picture()})
        code, lines = host(tmp_path, [M1], net)
        assert code == 1 and net.asked == [] and "held by another `host` run" in lines[0]
    finally:
        lock.close()


# --- which covers are in use ---------------------------------------------------------------------------

def test_the_covers_in_use_are_the_last_resort_rows_the_build_shows(tmp_path):
    caa = "".join(f"{k},{m},t,a,1990,Album,100,auto\n" for k, m in
                  (("New", M1), ("Skipped", M2), ("Unverified", M3), ("Better", M1[:-1] + "0"), ("Wrong", M2[:-1] + "0"),
                   ("Twin", M1), ("Failed", M3[:-1] + "0")))
    t = table(tmp_path, covers="Skipped,youtube,bbbbbbbbbbb\nBetter,bandcamp,5\n", caa=caa,
              skip=f"Skipped,youtube,bbbbbbbbbbb,a track list\nWrong,caa,{M2[:-1]}0,another album's sleeve\n",
              state={"caa_sprites": {"Failed": {"of": f"caa:{M3[:-1]}0", "why": "HTTP 404"}}})
    rows = [album("Better"), album("Unverified", legacy_uri="u"), album("New"), album("Existing", legacy_uri="u"),
            album("Skipped"), album("Wrong"), album("Twin"), album("Failed")]
    inputs = cv.Inputs(rows, {}, {}, {}, {})
    found = cv.caa_candidates(rows, inputs, t.rows, t.skip, cv.State(tmp_path / "state.json"), tmp_path / "96", t.made_from,
                              {"Unverified"}, set())
    # catalog order, each MBID once; not the row a better source replaced, the one on the skip list, the one whose image is gone
    assert cv.hosted_wanted(found, t) == [M3, M1, M2]


# --- what the validator and the build ask ----------------------------------------------------------------

def folder(tmp_path, mbids, sizes=None):
    d = tmp_path / "covers"
    d.mkdir(exist_ok=True)
    for m in mbids:
        (d / f"{m}.jpg").write_bytes(cv.make_hosted(picture((500, 500)))[0])
    cv.HostedIndex(d, {m: (sizes or {}).get(m, (500, 500)) for m in mbids}).save()
    return d


def test_the_folder_must_hold_exactly_the_covers_in_use(tmp_path):
    d = folder(tmp_path, [M1, M2])
    assert cv.hosted_problems([f"ca:{M1}", "dz:" + "a" * 32, "", f"ca:{M2}", f"ca:{M1}"], d) == []
    missing = cv.hosted_problems([f"ca:{M1}", f"ca:{M2}", f"ca:{M3}"], d)
    assert len(missing) == 1 and f"{M3}.jpg" in missing[0] and "covers host" in missing[0] and "1 album" in missing[0]
    extra = cv.hosted_problems([f"ca:{M1}"], d)
    assert len(extra) == 1 and f"{M2}.jpg" in extra[0] and "no album uses" in extra[0]
    (d / "stray.png").write_bytes(b"x")
    assert "stray.png" in cv.hosted_problems([f"ca:{M1}", f"ca:{M2}"], d)[0]
    assert "is missing" in cv.hosted_problems([f"ca:{M1}"], tmp_path / "nowhere")[0]
    assert cv.hosted_problems(["", "dz:" + "a" * 32], tmp_path / "nowhere") == []  # no such cover, no folder needed


def test_the_recorded_size_must_be_the_files(tmp_path):
    d = folder(tmp_path, [M1, M2], {M2: (500, 400)})
    wrong = cv.hosted_problems([f"ca:{M1}", f"ca:{M2}"], d)
    assert len(wrong) == 1 and M2 in wrong[0] and "index.json" in wrong[0]
    d = folder(tmp_path, [M1, M2])
    (d / f"{M1}.jpg").write_bytes(picture((900, 900)))  # not made by `host`: larger than a copy is
    assert M1 in cv.hosted_problems([f"ca:{M1}", f"ca:{M2}"], d)[0]
    d = folder(tmp_path, [M1, M2])
    (d / f"{M2}.jpg").write_bytes(b"<html>")
    assert M2 in cv.hosted_problems([f"ca:{M1}", f"ca:{M2}"], d)[0]


def test_the_validator_fails_on_a_missing_and_on_an_unused_copy(tmp_path):
    out = tmp_path / "data"
    out.mkdir()
    for name in ("albums.json", "vocab.json", "positions.json", "recs.json"):
        (out / name).write_bytes((cv.DEFAULT_SITE_ALBUMS.parent / name).read_bytes())
    used = sorted({a["c"][3:] for a in json.loads((out / "albums.json").read_text()) if a["c"].startswith("ca:")})
    assert used
    assert validate_dir(out, images=False)["albums"] > 4000  # not asked: the folder is not checked
    d = folder(tmp_path, used[1:])
    with pytest.raises(ContractError, match=f"{used[0]}.jpg"):
        validate_dir(out, images=False, hosted=d)
    d = folder(tmp_path, used + [M1[:-1] + "0"])
    with pytest.raises(ContractError, match="no album uses"):
        validate_dir(out, images=False, hosted=d)
    (d / f"{M1[:-1]}0.jpg").unlink()
    cv.HostedIndex(d, {m: (500, 500) for m in used}).save()
    assert validate_dir(out, images=False, hosted=d)["hosted_covers"] == len(used)


def test_the_sites_folder_holds_exactly_the_covers_its_albums_use():
    """The committed frontcreck/public/covers against the committed albums.json and tables."""
    site = json.loads(cv.DEFAULT_SITE_ALBUMS.read_text(encoding="utf-8"))
    assert cv.hosted_problems([a["c"] for a in site], cv.DEFAULT_HOSTED) == []
    used = {a["c"][3:] for a in site if a["c"].startswith("ca:")}
    sizes = cv.HostedIndex.read(cv.DEFAULT_HOSTED).sizes
    assert set(sizes) == used and all(max(s) <= cv.HOSTED_PX for s in sizes.values())
    total = sum((cv.DEFAULT_HOSTED / f"{m}.jpg").stat().st_size for m in used)
    assert total < 10 * 1024 * 1024
