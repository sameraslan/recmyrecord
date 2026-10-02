import numpy as np
import pytest

from rmr_audio.clips import ClipCache, priority_order, to_blob
from rmr_audio.sync import needed_clips

from .conftest import album, fake_emb, listing


def test_priority_order_first_track_then_spread():
    assert priority_order(1) == [0]
    assert priority_order(2) == [0, 1]
    assert priority_order(8) == [0, 4, 2, 6, 1, 5, 3, 7]
    assert priority_order(12)[:4] == [0, 6, 3, 9]


@pytest.mark.parametrize("n", range(1, 70))
def test_priority_order_is_a_permutation_and_prefixes_nest(n):
    order = priority_order(n)
    assert sorted(order) == list(range(n)) and order[0] == 0
    assert order[:8][:4] == order[:4]  # the first four of eight are the four


def _cached(order, listing_, prios, status="ok"):
    playable = [t for t in listing_ if t["preview_url"]]
    return [{"track_id": playable[order[p]]["track_id"], "prio": p, "status": status} for p in prios]


def test_top_up_takes_exactly_the_next_ranks():
    tracks = listing("d", 12)
    order = priority_order(12)
    first = needed_clips(album(0), "deezer", "d", tracks, [], 4)
    assert [(c["prio"], c["track_idx"]) for c in first] == [(0, 0), (1, 6), (2, 3), (3, 9)]
    more = needed_clips(album(0), "deezer", "d", tracks, _cached(order, tracks, range(4)), 8)
    assert [c["prio"] for c in more] == [4, 5, 6, 7]
    assert [c["track_idx"] for c in more] == order[4:8]
    eight = needed_clips(album(0), "deezer", "d", tracks, [], 8)
    assert [c["track_id"] for c in eight] == [c["track_id"] for c in first + more]
    assert all(c["url"].endswith(c["track_id"]) and c["suffix"] == ".mp3" for c in eight)


def test_tracks_without_a_preview_are_skipped_and_short_albums_end():
    tracks = listing("i", 5, no_preview=(1, 2))
    clips = needed_clips(album(0), "itunes:jp", "i", tracks, [], 8)
    assert sorted(c["track_idx"] for c in clips) == [0, 3, 4] and [c["prio"] for c in clips] == [0, 1, 2]
    assert clips[0]["track_idx"] == 0 and clips[0]["suffix"] == ".m4a"
    assert needed_clips(album(0), "deezer", "x", listing("x", 3, no_preview=(0, 1, 2)), [], 4) == []


def test_final_failures_are_not_retried_and_transient_ones_are():
    tracks, order = listing("d", 10), priority_order(10)
    cached = _cached(order, tracks, [0, 1, 2]) + _cached(order, tracks, [3], "too_short")
    assert needed_clips(album(0), "deezer", "d", tracks, cached, 4) == []
    cached = _cached(order, tracks, [0, 1, 2]) + _cached(order, tracks, [3], "download_failed")
    again = needed_clips(album(0), "deezer", "d", tracks, cached, 4)
    assert [(c["prio"], c["track_idx"]) for c in again] == [(3, order[3])]


def test_a_changed_listing_never_downloads_a_cached_track_twice_nor_exceeds_the_count():
    old = listing("d", 10)
    cached = _cached(priority_order(10), old, range(4))
    new = listing("d", 10)[::-1]  # the store reordered the album
    clips = needed_clips(album(0), "deezer", "d", new, cached, 8)
    assert len(clips) == 4 and [c["prio"] for c in clips] == [4, 5, 6, 7]
    assert not {c["track_id"] for c in clips} & {c["track_id"] for c in cached}


def test_cache_mean_counts_ok_clips_below_the_rank_in_track_order(tmp_path):
    cache = ClipCache(tmp_path / "c" / "clips.sqlite")
    recs = [{"key": "k", "source": "deezer", "album_id": "d", "track_id": f"t{i}", "track_idx": i, "prio": p,
             "status": "ok", "emb": to_blob(fake_emb(f"t{i}"))} for i, p in ((0, 0), (5, 1), (2, 2), (7, 3), (1, 4))]
    recs.append({"key": "k", "source": "deezer", "album_id": "d", "track_id": "t9", "track_idx": 9, "prio": 5,
                 "status": "too_short"})
    cache.put(recs)
    mean, n = cache.mean("k", "deezer", "d", 4)
    assert n == 4 and np.allclose(mean, np.mean([fake_emb(f"t{i}") for i in (0, 2, 5, 7)], axis=0))
    assert cache.mean("k", "deezer", "d", 8)[1] == 5 and cache.mean("k", "deezer", "d", None)[1] == 5
    assert cache.mean("k", "deezer", "other", 4) == (None, 0)
    cache.put([dict(recs[0], status="crashed", emb=None)])  # a clip tried again replaces its row
    assert cache.mean("k", "deezer", "d", 4)[1] == 3
    assert cache.summary()[("k", "deezer", "d")].count((0, "crashed")) == 1
    cache.close()
    assert ClipCache(tmp_path / "c" / "clips.sqlite").mean("k", "deezer", "d", 8)[1] == 4  # it is on disk
