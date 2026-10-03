"""Checks of the cross-genre masks, floors and MMR on a toy fixture.

Run: python test_crossgenre.py   (or pytest; needs the analysis venv, no caches)
"""
import numpy as np

from crossgenre import crossing_masks, floors, mmr, parse
from simbench import distances, nearest

GENRES = [["Jazz Fusion", "Avant-Garde Jazz"],  # 0 seed: jazz
          ["Jazz Fusion"],                      # 1 same artist as 0
          ["Hard Bop"],                         # 2 jazz, other primary
          ["Progressive Rock", "Jazz-Rock"],    # 3 rock primary, but a jazz-family secondary genre
          ["Progressive Rock"],                 # 4 rock, nothing shared
          ["Jazz-Rock", "Krautrock"],           # 5 jazz family by the regex, other primary
          []]                                   # 6 no RYM genres
ARTIST = np.array([0, 0, 1, 2, 3, 4, 5])


def masks():
    same = ARTIST[:, None] == ARTIST[None, :]
    np.fill_diagonal(same, False)
    return crossing_masks(GENRES, same)


def test_masks():
    out, in_family = masks()
    seed = lambda m: np.flatnonzero(m[0]).tolist()  # noqa: E731
    assert seed(out["family"]) == [3, 4]
    assert seed(out["primary"]) == [2, 3, 4, 5]
    assert seed(out["strict"]) == [3, 4]
    assert seed(out["disjoint"]) == [4]  # 3 carries a jazz-family genre
    assert seed(in_family) == [2, 5]  # not the same artist's album, not the album without genres
    assert not any(m[6].any() or m[:, 6].any() for m in (*out.values(), in_family))
    assert all(np.array_equal(m, m.T) for m in out.values())


def test_floor_is_the_mean_over_allowed_candidates():
    out, _ = masks()
    cos = np.arange(49, dtype=np.float32).reshape(7, 7)
    cos[0, 4] = np.nan  # an album with too few descriptors does not count
    f = floors(cos, out)
    assert f["family"][0] == cos[0, 3]
    assert np.isclose(f["primary"][0], np.mean([cos[0, 2], cos[0, 3], cos[0, 5]]))
    assert np.isnan(f["family"][6])


def test_mmr():
    X = np.random.default_rng(0).normal(size=(40, 3))
    D, allowed = distances(X), np.ones((40, 40), bool)
    assert np.array_equal(mmr(D, allowed, 1.0, pool=20, k=5), nearest(D, allowed, k=5))
    spread = mmr(D, allowed, 0.3, pool=20, k=5)
    assert np.array_equal(spread[:, 0], nearest(D, allowed, k=5)[:, 0])
    assert all(len(set(r)) == 5 for r in spread)


def test_parse():
    assert parse("effnet/64+feel@0.25") == ([("effnet/64", 0.75), ("feel", 0.25)], None)
    assert parse("effnet/64~mmr0.5") == ([("effnet/64", 1.0)], 0.5)
    assert parse("a/64+b/64")[0] == [("a/64", 0.5), ("b/64", 0.5)]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
