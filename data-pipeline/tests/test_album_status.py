"""The per-album status table (rmr_audio.album_status): the rules for `state` and `next_step` on made-up
albums, the table from a small made-up cache, and the committed table against the catalog. No network, no
model, and the real cache is never opened."""
import csv
import json

import numpy as np
import pytest

from rmr_audio import album_status
from rmr_audio.album_status import NEXT_STEPS, STATES, build, decide, edge_case, main
from rmr_audio.onepass_cache import MODELS, OnePassCache
from rmr_pipeline.audio import DEFAULT_CATALOG, catalog_keys
from rmr_pipeline.audio_store import DEFAULT_AUDIO, MATCH_FIELDS, write_matches

BOTH4 = {"effnet": 4, "clap": 4}
NONE = {"effnet": 0, "clap": 0}


@pytest.mark.parametrize("kwargs, expected", [
    (dict(used=BOTH4, previews_available=12), ("done", "none")),
    (dict(used={"effnet": 8, "clap": 4}, previews_available=12), ("done", "none")),
    # full-length windows count as done whatever their number, and need nothing more
    (dict(used={"effnet": 5, "clap": 5}, windowed=True), ("done", "none")),
    (dict(used={"effnet": 2, "clap": 2}, windowed=True, has_youtube_url=True, fulllength="embedded"), ("done", "none")),
    # 1 to 3 clips of a listing with 1 to 3 previews that runs 15 minutes or more: an edge case, full-length audio
    (dict(used={"effnet": 3, "clap": 3}, previews_available=3, edge_case=True), ("partial", "youtube_full_length")),
    (dict(used={"effnet": 1, "clap": 1}, previews_available=1, edge_case=True, has_youtube_url=True), ("partial", "youtube_full_length")),
    (dict(used={"effnet": 1, "clap": 1}, previews_available=1, edge_case=True, has_youtube_url=True, fulllength="single_track"),
     ("partial", "youtube_full_length")),  # its link is not the album: the search is still to try
    (dict(used={"effnet": 1, "clap": 1}, previews_available=1, edge_case=True, has_youtube_url=True, fulllength="failed",
          youtube_search_tried=True), ("partial", "youtube_full_length")),  # the link is tried again first
    # the link and the search gave nothing: it stays on its previews
    (dict(used={"effnet": 1, "clap": 1}, previews_available=1, edge_case=True, has_youtube_url=True, fulllength="single_track",
          youtube_search_tried=True), ("partial", "none_available")),
    (dict(used={"effnet": 2, "clap": 2}, previews_available=2, edge_case=True, youtube_search_tried=True), ("partial", "none_available")),
    # once its windows are embedded the step is cleared
    (dict(used={"effnet": 7, "clap": 7}, windowed=True, previews_available=1, edge_case=True, has_youtube_url=True,
          fulllength="embedded"), ("done", "none")),
    # a single or a short EP whose few previews are all embedded: nothing to do
    (dict(used={"effnet": 2, "clap": 2}, previews_available=2), ("partial", "none")),
    (dict(used={"effnet": 1, "clap": 1}, previews_available=2), ("partial", "embed")),  # one of its two is missing
    # partial for another reason: a clip failed, or one model is behind
    (dict(used={"effnet": 4, "clap": 3}, previews_available=15), ("partial", "embed")),
    (dict(used={"effnet": 4, "clap": 0}, previews_available=26), ("partial", "embed")),
    (dict(used={"effnet": 6, "clap": 0}, windowed=True), ("partial", "embed")),
    # wrong listing pending comes first, whatever the clips
    (dict(used=BOTH4, previews_available=12, wrong_listing_pending=True), ("done", "reembed")),
    (dict(used={"effnet": 2, "clap": 2}, previews_available=2, edge_case=True, wrong_listing_pending=True),
     ("partial", "reembed")),
    # no audio
    (dict(used=NONE, previews_available=10), ("no_audio", "embed")),
    (dict(used=NONE, has_youtube_url=True), ("no_audio", "youtube_link")),
    (dict(used=NONE, has_youtube_url=True, fulllength="failed"), ("no_audio", "youtube_link")),
    (dict(used=NONE), ("no_audio", "youtube_search")),
    (dict(used=NONE, has_youtube_url=True, fulllength="unavailable"), ("no_audio", "youtube_search")),
    (dict(used=NONE, has_youtube_url=True, fulllength="single_track"), ("no_audio", "youtube_search")),
    (dict(used=NONE, has_youtube_url=True, fulllength="mismatch"), ("no_audio", "youtube_search")),
    (dict(used=NONE, has_youtube_url=True, fulllength="mismatch", youtube_search_tried=True), ("no_audio", "none_available")),
    (dict(used=NONE, youtube_search_tried=True), ("no_audio", "none_available")),
])
def test_decide(kwargs, expected):
    assert decide(**kwargs) == expected
    assert expected[0] in STATES and expected[1] in NEXT_STEPS


def test_the_edge_case_rule_is_the_one_the_fetch_uses():
    assert edge_case(1, 2100) and edge_case(3, None) and not edge_case(3, 600) and not edge_case(4, 2100) and not edge_case(0, None)
    fulllength = pytest.importorskip("rmr_audio.fulllength", reason="the fetch needs the audio environment")
    assert fulllength.edge_case is edge_case


def _put(cache, key, source, album_id, clips, models=("effnet", "clap"), track_s=None):
    """clips: (rank, status) per clip of one listing; a window listing gets a `<file>@<start>` track id."""
    for rank, status in clips:
        rec = {"key": key, "source": source, "album_id": album_id, "track_id": f"t{rank}", "track_idx": rank,
               "prio": rank, "clip_s": 30.0 if track_s is None else 10.0, "track_s": track_s}
        cache.put_clip(rec)
        for model in models:
            emb = np.full(MODELS[model].dim, rank + 1, MODELS[model].dtype).tobytes()
            cache.put_result(rec, model, status, emb=emb if status == "ok" else None, clip_s=30.0)


CATALOG = ["A_done", "A_failed_clip", "A_two", "A_long", "A_none_link", "A_none", "A_tube", "A_wrong", "A_dup",
           "A_clap_behind", "A_dead_link", "A_pending", "A_skip", "A_single", "A_searched", "A_found", "A_stays"]


@pytest.fixture
def world(tmp_path):
    cache = OnePassCache(tmp_path / "onepass.sqlite")
    ok = lambda n: [(r, "ok") for r in range(n)]  # noqa: E731
    _put(cache, "A_done", "deezer", "d1", ok(6))
    _put(cache, "A_failed_clip", "itunes:jp", "i2", [(0, "ok"), (1, "too_short"), (2, "ok"), (3, "ok"), (4, "ok")])
    _put(cache, "A_two", "deezer", "d3", ok(2))
    _put(cache, "A_long", "itunes:us", "i4", ok(1))
    cache.set_listing("A_long", "itunes:us", "i4", n_tracks=1, n_previews=1, runtime_s=2100.0)
    _put(cache, "A_tube", "youtube", "vid7", ok(8))
    cache.set_listing("A_tube", "youtube", "vid7", n_tracks=1, n_previews=8, runtime_s=1500.0, n_windows=5)
    _put(cache, "A_wrong", "deezer", "d8-old", ok(4))
    _put(cache, "A_dup", "deezer", "d1", ok(4))
    _put(cache, "A_clap_behind", "deezer", "d10", ok(4), models=("effnet",))
    _put(cache, "A_clap_behind", "deezer", "d10", ok(3), models=("clap", "clap_mp3"))
    _put(cache, "A_done", "deezer", "d1", ok(4), models=("clap_mp3",))
    _put(cache, "A_single", "deezer", "d14", ok(2))
    _put(cache, "A_found", "youtube", "vid16", ok(8))
    cache.set_listing("A_found", "youtube", "vid16", n_tracks=1, n_previews=8, runtime_s=2400.0, n_windows=8)
    _put(cache, "A_stays", "deezer", "d17", ok(1))
    cache.close()

    with open(tmp_path / "albums.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rym_id", "rank", "on_chart", "artist", "title", "year", "youtube_url"])
        tube = {"A_none_link": "https://youtu.be/a", "A_tube": "https://youtu.be/vid7", "A_dead_link": "https://youtu.be/x"}
        w.writerows([[k, i + 1, 1, "Artist", k, 2000, tube.get(k, "")] for i, k in enumerate(CATALOG)])
    audio = tmp_path / "audio"
    row = lambda key, source="", album_id="", **more: dict.fromkeys(MATCH_FIELDS, "") | {  # noqa: E731
        "key": key, "source": source, "source_album_id": album_id, "ambiguous": "0"} | more
    write_matches(audio / "matches.csv", [
        row("A_done", "deezer", "d1", n_tracks="12", n_clips_available="12", runtime_s="2400", under_covered="0", short_preview="0"),
        row("A_failed_clip", "itunes:jp", "i2", n_tracks="5", n_clips_available="5", runtime_s="1800", matched_by="apple_id"),
        row("A_two", "deezer", "d3", n_tracks="2", n_clips_available="2"),  # an existing album: no runtime
        row("A_long", "itunes:us", "i4", matched_by="search", ambiguous="1"),  # previews and runtime from the cache
        row("A_none_link"), row("A_none"), row("A_tube"),
        row("A_wrong", "deezer", "d8-old", n_tracks="9", n_clips_available="9"),
        row("A_dup", "deezer", "d1", n_tracks="12", n_clips_available="12", runtime_s="2400", short_preview="1"),
        row("A_clap_behind", "deezer", "d10", n_tracks="10", n_clips_available="10"),
        row("A_dead_link"),
        row("A_pending", "deezer", "d12", n_tracks="10", n_clips_available="10", matched_by="override"),
        row("A_skip"),
        row("A_single", "deezer", "d14", n_tracks="2", n_clips_available="2", runtime_s="420"),  # a single: its two previews cover it
        row("A_searched"), row("A_found"),
        row("A_stays", "deezer", "d17", n_tracks="1", n_clips_available="1", runtime_s="2100")])
    with open(audio / "keys.csv", "w", newline="", encoding="utf-8") as f:
        f.write("rym_id,legacy_uri,matched_by,doubt\nA_two,spotify:album:2,spotify_id,\nA_wrong,spotify:album:8,spotify_id,\n")
    (audio / "match_overrides.json").write_text(json.dumps({
        "A_wrong": {"source": "deezer", "album_id": "d8", "note": "the other edition"},
        "A_pending": {"source": "deezer", "album_id": "d12", "note": "by hand"},
        "A_done": {"source": "deezer", "album_id": "d1", "note": "an override that is already embedded"},
        "A_skip": {"skip": True, "note": "covers only"}}), encoding="utf-8")
    with open(audio / "fulllength.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["key", "source", "url", "class", "duration_s", "title", "uploader", "n_windows", "status",
                    "matched_by", "reason", "query", "score", "runner_up", "note"])
        w.writerow(["A_tube", "youtube", "https://youtu.be/vid7", "full_album", 1500, "t", "u", 5, "embedded", "link", "no_audio", "", "", "", ""])
        w.writerow(["A_dead_link", "youtube", "https://youtu.be/x", "unavailable", "", "", "", "", "skipped", "link", "no_audio", "", "", "", ""])
        w.writerow(["A_searched", "youtube", "", "", "", "", "", "", "search_none", "search", "no_audio", "", "", "", "the search listed no video"])
        w.writerow(["A_found", "youtube", "https://youtu.be/vid16", "full_album", 2400, "t", "u", 8, "embedded", "search", "no_audio", "q", "93.0", "", ""])
        w.writerow(["A_stays", "youtube", "https://youtu.be/y", "", 600, "t", "u", "", "search_none", "search", "edge_case", "q", "", "", "live"])
    return tmp_path


def _build(world):
    columns, rows = build(world / "onepass.sqlite", world / "albums.csv", world / "audio")
    return columns, {r["key"]: r for r in rows}, rows


def test_one_row_per_album_in_catalog_order(world):
    columns, _, rows = _build(world)
    assert [r["key"] for r in rows] == CATALOG
    assert all(list(r) == columns for r in rows)
    # the two required models, then any other model the cache has
    assert [c for c in columns if c.endswith("_ok")] == ["effnet_ok", "clap_ok", "clap_mp3_ok"]
    assert {r["state"] for r in rows} <= set(STATES) and {r["next_step"] for r in rows} <= set(NEXT_STEPS)
    assert [r["existing_or_new"] for r in rows if r["key"] in ("A_two", "A_wrong", "A_done")] == ["new", "existing", "existing"]


def test_states_and_next_steps(world):
    by = _build(world)[1]
    got = {k: (r["state"], r["next_step"]) for k, r in by.items()}
    assert got == {
        "A_done": ("done", "none"),
        "A_failed_clip": ("done", "none"),  # the fifth clip took the failed one's place
        "A_two": ("partial", "youtube_full_length"),
        "A_long": ("partial", "youtube_full_length"),
        "A_none_link": ("no_audio", "youtube_link"),
        "A_none": ("no_audio", "youtube_search"),
        "A_tube": ("done", "none"),
        "A_wrong": ("done", "reembed"),
        "A_dup": ("done", "none"),
        "A_clap_behind": ("partial", "embed"),
        "A_dead_link": ("no_audio", "youtube_search"),
        "A_pending": ("no_audio", "embed"),
        "A_skip": ("no_audio", "youtube_search"),
        "A_single": ("partial", "none"),  # under-covered, not an edge case: 7 minutes
        "A_searched": ("no_audio", "none_available"),  # the search found nothing
        "A_found": ("done", "none"),  # the search found its video
        "A_stays": ("partial", "none_available"),  # an edge case the search found nothing for: on its preview
    }


def test_columns(world):
    by = _build(world)[1]
    pick = lambda key, *cols: tuple(by[key][c] for c in cols)  # noqa: E731
    assert pick("A_done", "effnet_ok", "effnet_used", "effnet_source", "clap_mp3_ok", "audio_source") == ("6", "4", "deezer", "4", "deezer")
    assert pick("A_failed_clip", "clap_ok", "clap_used", "audio_source", "matched_by") == ("4", "4", "itunes:jp", "apple_id")
    assert pick("A_tube", "effnet_ok", "effnet_used", "audio_source", "fulllength", "has_youtube_url") == ("8", "5", "youtube", "embedded", "1")
    assert pick("A_none", "effnet_ok", "effnet_source", "audio_source", "fulllength", "has_youtube_url") == ("0", "none", "none", "not_tried", "0")
    assert pick("A_dead_link", "fulllength", "youtube_search") == ("unavailable", "not_tried")
    assert pick("A_searched", "fulllength", "youtube_search", "audio_source") == ("not_tried", "none", "none")
    assert pick("A_found", "fulllength", "youtube_search", "audio_source", "clap_used") == ("not_tried", "found", "youtube", "8")
    assert pick("A_stays", "edge_case", "youtube_search", "audio_source") == ("1", "none", "deezer")
    assert pick("A_two", "edge_case") == ("1",) and pick("A_long", "edge_case") == ("1",)  # runtime unknown; 35 minutes
    assert pick("A_single", "under_covered", "edge_case") == ("1", "0") and pick("A_done", "edge_case") == ("0",)
    assert pick("A_clap_behind", "effnet_used", "clap_used", "clap_mp3_used") == ("4", "3", "3")
    # flags
    assert pick("A_two", "under_covered", "few_long_tracks", "short_preview") == ("1", "", "")  # runtime unknown
    assert pick("A_long", "previews_available", "runtime_s", "under_covered", "few_long_tracks", "ambiguous") == ("1", "2100", "1", "1", "1")
    assert pick("A_done", "under_covered", "few_long_tracks", "short_preview", "wrong_listing_pending", "duplicate_listing") == ("0", "0", "0", "0", "1")
    assert pick("A_dup", "duplicate_listing", "short_preview") == ("1", "1")
    assert pick("A_wrong", "wrong_listing_pending", "listing_id") == ("1", "d8-old")
    assert pick("A_pending", "wrong_listing_pending") == ("0",)  # nothing cached yet: to embed, not to embed again
    assert pick("A_none", "under_covered", "few_long_tracks", "wrong_listing_pending", "duplicate_listing") == ("0", "", "0", "0")


def test_the_listing_and_count_are_the_album_means(world):
    """`<model>_source` and `<model>_used` are what OnePassCache.means pools, for every model."""
    columns, _, rows = _build(world)
    named = {"A_done": ("deezer", "d1"), "A_failed_clip": ("itunes:jp", "i2"), "A_two": ("deezer", "d3"),
             "A_long": ("itunes:us", "i4"), "A_wrong": ("deezer", "d8-old"), "A_dup": ("deezer", "d1"),
             "A_clap_behind": ("deezer", "d10")}
    cache = OnePassCache(world / "onepass.sqlite", readonly=True)
    try:
        for model in ("effnet", "clap", "clap_mp3"):
            keys, _, n, source = cache.means(model, album_status.CLIPS, "rank", named)
            want = {k: (str(c), s) for k, c, s in zip(keys.tolist(), n.tolist(), source.tolist())}
            got = {r["key"]: (r[f"{model}_used"], r[f"{model}_source"]) for r in rows if r[f"{model}_used"] != "0"}
            assert got == want
    finally:
        cache.close()


def test_an_overrides_listing_is_the_one_used_once_it_is_embedded(world):
    """A_wrong: matches.csv names d8-old, the override forces d8. It is `reembed` until d8 has an ok clip for
    both required models; then its columns are d8's, as the album mean's are (rmr_audio.modelstore)."""
    pick = lambda *cols: tuple(_build(world)[1]["A_wrong"][c] for c in cols)  # noqa: E731
    ok = lambda n: [(r, "ok") for r in range(n)]  # noqa: E731
    assert pick("effnet_ok", "clap_ok", "wrong_listing_pending", "state", "next_step") == ("4", "4", "1", "done", "reembed")
    cache = OnePassCache(world / "onepass.sqlite")
    _put(cache, "A_wrong", "itunes:gb", "d8", ok(5), models=("effnet",))  # the override's listing, one model so far
    cache.close()
    (world / "audio" / "match_overrides.json").write_text(json.dumps({
        "A_wrong": {"source": "itunes:gb", "album_id": "d8", "note": "the other edition"},
        "A_skip": {"skip": True, "note": "covers only"}}), encoding="utf-8")
    assert pick("effnet_ok", "effnet_source", "clap_ok", "clap_source", "audio_source", "wrong_listing_pending", "next_step") == (
        "5", "itunes:gb", "4", "deezer", "itunes:gb/deezer", "1", "reembed")
    cache = OnePassCache(world / "onepass.sqlite")
    _put(cache, "A_wrong", "itunes:gb", "d8", ok(3), models=("clap", "clap_mp3"))
    cache.close()
    assert pick("effnet_used", "clap_ok", "clap_used", "clap_mp3_source", "audio_source", "wrong_listing_pending", "state",
                "next_step", "listing_id") == ("4", "3", "3", "itunes:gb", "itunes:gb", "0", "partial", "embed", "d8-old")
    cache = OnePassCache(world / "onepass.sqlite", readonly=True)
    try:
        rows = _build(world)[2]
        for model in ("effnet", "clap", "clap_mp3"):
            keys, _, n, source = cache.means(model, album_status.CLIPS, "rank", {"A_wrong": ("itunes:gb", "d8")})
            at = keys.tolist().index("A_wrong")
            assert pick(f"{model}_used", f"{model}_source") == (str(n[at]), source[at])
            assert sum(r[f"{model}_used"] != "0" for r in rows) == len(keys)
    finally:
        cache.close()


def test_writes_the_same_bytes_again(world, capsys):
    args = ["--cache", str(world / "onepass.sqlite"), "--catalog", str(world / "albums.csv"), "--audio-dir", str(world / "audio")]
    assert main(args + ["--dry-run"]) == 0
    assert not (world / "audio" / "album_status.csv").exists()
    assert main(args) == 0
    table, counts = (world / "audio" / "album_status.csv"), (world / "audio" / "album_status.md")
    first = table.read_bytes(), counts.read_bytes()
    out = capsys.readouterr().out
    assert "| done | 1 | 5 | 6 |" in out and "| youtube_search | 0 | 3 | 3 |" in out and "| none_available | 0 | 2 | 2 |" in out
    assert out.count("written") >= 2
    assert main(args) == 0
    assert (table.read_bytes(), counts.read_bytes()) == first
    assert capsys.readouterr().out.count("already holds exactly this") == 2
    with open(table, newline="", encoding="utf-8") as f:
        assert [r["key"] for r in csv.DictReader(f)] == CATALOG


def test_no_cache_no_table(world, capsys):
    """Without the cache (it is local, not in git) the command fails; it does not write a table of zeros."""
    args = ["--catalog", str(world / "albums.csv"), "--audio-dir", str(world / "audio")]
    assert main(args + ["--cache", str(world / "nowhere.sqlite")]) == 1
    assert "no such cache" in capsys.readouterr().err
    OnePassCache(world / "empty.sqlite").close()
    assert main(args + ["--cache", str(world / "empty.sqlite")]) == 1
    assert "table of zeros" in capsys.readouterr().err
    assert not (world / "audio" / "album_status.csv").exists() and not (world / "audio" / "album_status.md").exists()


def test_constants_are_the_pipelines():
    from rmr_audio import modelstore

    assert album_status.CLIPS == modelstore.CLIPS and album_status.DEFAULT_CACHE_DB == modelstore.DEFAULT_CACHE_DB
    match = pytest.importorskip("rmr_audio.match", reason="the matcher needs the audio environment")
    assert album_status.LONG_S == match.LONG_S and album_status.CLIPS == match.MIN_WINDOWS


def test_committed_table_covers_the_catalog():
    """audio/album_status.csv has exactly the catalog's albums, in its order. If this fails after the
    catalog changed: python -m rmr_audio.album_status."""
    with open(DEFAULT_AUDIO / "album_status.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert [r["key"] for r in rows] == catalog_keys(DEFAULT_CATALOG)
    assert {r["state"] for r in rows} <= set(STATES) and {r["next_step"] for r in rows} <= set(NEXT_STEPS)
    assert {r["existing_or_new"] for r in rows} == {"existing", "new"}
