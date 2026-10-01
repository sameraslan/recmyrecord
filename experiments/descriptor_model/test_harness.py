"""Tests for harness.py / features.py / probes.py on small synthetic inputs.

    .venv/bin/python -m pytest test_harness.py -q

Nothing here reads the real shards or writes into results/ or cache/: outputs go to tmp_path.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

import features as F
import harness as H
from common import DESCRIPTORS, Y, load_splits, split_rows


# ---------------------------------------------------------------- precision-coverage maths

def _toy():
    # 3 albums x 4 labels, all scores distinct. Ranked pairs (score: hit?):
    # .9 H, .8 H, .7 miss, .6 H, .5 miss, .4 H, .35 miss, .3 miss, .2 H, .1 miss, .05 miss, .01 miss
    Yt = np.array([[1.5, 0, 1.2, 0], [0, 1.5, 0, 0], [1.4, 1.5, 0, 0]])
    S = np.array([[0.9, 0.7, 0.6, 0.1], [0.5, 0.8, 0.35, 0.05], [0.4, 0.2, 0.3, 0.01]])
    return Yt, S


def test_precision_coverage_points():
    Yt, S = _toy()
    pc = H.precision_coverage(Yt, S, counts=(1, 2), targets=(0.9, 0.75, 0.5))
    assert pc["n_albums"] == 3 and pc["mean_true_count"] == pytest.approx(5 / 3) and pc["n_operating_points"] == 12
    p1, p2, pm = pc["points"]
    # 1 per album = top 3 pairs: H H miss
    assert p1["avg_count"] == pytest.approx(1.0) and p1["precision"] == pytest.approx(2 / 3) and p1["threshold"] == pytest.approx(0.7)
    assert p1["recall"] == pytest.approx(2 / 5)
    # album 2 (max score 0.4) has nothing >= 0.7
    assert p1["share_albums_ge1"] == pytest.approx(2 / 3)
    # 2 per album = top 6: H H m H m H
    assert p2["avg_count"] == pytest.approx(2.0) and p2["precision"] == pytest.approx(4 / 6) and p2["share_albums_ge1"] == 1.0
    # real mean count 5/3 -> 5 pairs: H H m H m
    assert pm["is_mean_true_count"] and pm["n_emitted"] == 5 and pm["precision"] == pytest.approx(3 / 5)


def test_precision_coverage_largest_count_at_precision():
    Yt, S = _toy()
    at = H.precision_coverage(Yt, S, counts=(1,), targets=(0.9, 0.75, 0.5))["at_precision"]
    # precision by prefix: 1, 1, .667, .75, .6, .667, .571, .5, .556, .5, .455, .417
    assert at["0.90"]["n_emitted"] == 2 and at["0.90"]["avg_count"] == pytest.approx(2 / 3)
    assert at["0.90"]["share_albums_ge1"] == pytest.approx(2 / 3) and at["0.90"]["threshold"] == pytest.approx(0.8)
    assert at["0.75"]["n_emitted"] == 4 and at["0.75"]["precision"] == pytest.approx(0.75)
    assert at["0.50"]["n_emitted"] == 10 and at["0.50"]["share_albums_ge1"] == 1.0


def test_precision_never_reached():
    Yt = np.array([[0, 1.0], [0, 1.0]])
    S = np.array([[0.9, 0.1], [0.8, 0.2]])  # the two best pairs are misses: precision is 0, 0, 1/3, 1/2
    pc = H.precision_coverage(Yt, S, counts=(1,), targets=(0.9, 0.5))
    assert pc["at_precision"]["0.90"] == {"target_count": None, "avg_count": 0.0, "precision": None, "recall": 0.0,
                                          "threshold": None, "share_albums_ge1": 0.0, "n_emitted": 0}
    assert pc["at_precision"]["0.50"]["n_emitted"] == 4
    assert H.choose_threshold(Yt, S, 0.9) is None
    assert H.apply_threshold(Yt, S, None)["avg_count"] == 0.0


def test_precision_coverage_ties_are_emitted_together():
    # a constant prior: every album has the same scores, so a threshold emits whole columns
    Yt = np.array([[1, 0, 1, 0], [1, 1, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)
    S = np.tile([0.75, 0.5, 0.25, 0.0], (4, 1))
    pc = H.precision_coverage(Yt, S, counts=(0.5, 1, 2), targets=(0.75, 0.6))
    assert pc["n_operating_points"] == 4
    half, one, two = pc["points"][:3]
    assert half["avg_count"] == 1.0 and half["target_count"] == 0.5 and half["precision"] == pytest.approx(0.75)
    assert one["avg_count"] == 1.0 and two["avg_count"] == 2.0 and two["precision"] == pytest.approx(5 / 8)
    assert pc["at_precision"]["0.75"]["avg_count"] == 1.0
    assert pc["at_precision"]["0.60"]["avg_count"] == 2.0


def test_apply_threshold_counts():
    Yt, S = _toy()
    r = H.apply_threshold(Yt, S, 0.4)
    assert r["n_emitted"] == 6 and r["n_hits"] == 4 and r["precision"] == pytest.approx(4 / 6)
    assert r["avg_count"] == pytest.approx(2.0) and r["recall"] == pytest.approx(4 / 5) and r["share_albums_ge1"] == 1.0
    empty = H.apply_threshold(Yt, S, 5.0)
    assert empty["precision"] is None and empty["n_emitted"] == 0 and empty["share_albums_ge1"] == 0.0


# ---------------------------------------------------------------- threshold transfer

def test_choose_threshold_is_the_largest_count_meeting_the_target():
    Yt, S = _toy()
    assert H.choose_threshold(Yt, S, 0.9) == pytest.approx(0.8)
    assert H.choose_threshold(Yt, S, 0.75) == pytest.approx(0.6)
    assert H.choose_threshold(Yt, S, 0.5) == pytest.approx(0.1)
    assert H.choose_threshold(Yt, S, 0.75, min_emitted=5) is None
    assert H.choose_threshold(Yt, S, 0.6, min_emitted=5) == pytest.approx(0.4)


def test_transfer_threshold_reports_on_the_other_row_set():
    Yt, S = _toy()
    Y2 = np.array([[1.0, 0, 0, 0], [0, 0, 1.0, 0]])
    S2 = np.array([[0.85, 0.82, 0.1, 0.0], [0.95, 0.3, 0.81, 0.2]])
    out = H.transfer_threshold(Yt, S, Y2, S2, targets=(0.9,))["0.90"]
    assert out["threshold"] == pytest.approx(0.8)
    assert out["fit"]["precision"] == 1.0 and out["fit"]["n_emitted"] == 2
    # on the other set the same threshold emits 4 pairs (.85 H, .82 miss, .95 miss, .81 H): precision 0.5, not 0.9
    assert out["eval"]["n_emitted"] == 4 and out["eval"]["precision"] == pytest.approx(0.5)
    assert out["eval"]["avg_count"] == pytest.approx(2.0) and out["eval"]["share_albums_ge1"] == 1.0
    # the same-set optimum on the eval set would have been different: that is the optimism being avoided
    assert H.choose_threshold(Y2, S2, 0.9) is None


def test_crossfit_uses_the_other_half():
    rng = np.random.default_rng(0)
    Yt = (rng.random((40, 6)) < 0.3).astype(float)
    Yt[:, 0] = 1.0
    S = rng.random((40, 6))
    halves = np.arange(40) % 2
    out = H.crossfit_precision_coverage(Yt, S, halves, targets=(0.5,))["0.50"]
    n_e = hits = 0
    for a in (0, 1):
        t = H.choose_threshold(Yt[halves == a], S[halves == a], 0.5)
        r = H.apply_threshold(Yt[halves != a], S[halves != a], t)
        n_e, hits = n_e + r["n_emitted"], hits + r["n_hits"]
    assert out["avg_count"] == pytest.approx(n_e / 40)
    assert out["precision"] == (pytest.approx(hits / n_e) if n_e else None)


# ---------------------------------------------------------------- output dirs + fake snapshot for evaluate_run

@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    monkeypatch.setattr(H, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(H, "SCORES_DIR", tmp_path / "scores")
    monkeypatch.delenv(H.TEST_ENV, raising=False)
    return tmp_path


@pytest.fixture
def fake_val(monkeypatch):
    """40 real validation rows play the role of 'val rows with audio'; no shard is read."""
    rows = split_rows("val")[:40]
    monkeypatch.setattr(H, "eval_rows", lambda split="val": rows if split == "val" else (_ for _ in ()).throw(PermissionError()))
    monkeypatch.setattr(F, "n_shards", lambda: 3)
    monkeypatch.setattr(F, "album_index", lambda: {f"deezer:{i}": "s" for i in range(75)})
    monkeypatch.setattr(F, "n_matched_albums", lambda: 3761)
    return rows


# ---------------------------------------------------------------- test guard

def test_final_test_refuses_without_env_and_logs(sandbox):
    called = []
    with pytest.raises(PermissionError):
        H.final_test("arm__x", lambda access: called.append(1), config={})
    assert not called
    log = (sandbox / "results" / "test_invocations.log").read_text().splitlines()
    assert len(log) == 1 and "REFUSED" in log[0] and "arm__x" in log[0]
    with pytest.raises(PermissionError):
        H.final_test("arm__x", lambda access: called.append(1), config={})
    assert len((sandbox / "results" / "test_invocations.log").read_text().splitlines()) == 2


def test_env_value_must_be_exactly_1(sandbox, monkeypatch):
    monkeypatch.setenv(H.TEST_ENV, "true")
    with pytest.raises(PermissionError):
        H.final_test("arm__x", lambda access: None, config={})


def test_every_other_route_to_test_rows_is_closed(sandbox):
    with pytest.raises(PermissionError):
        H.eval_rows("test")
    with pytest.raises(PermissionError):
        H.load_scores("arm__x", "test")
    with pytest.raises(PermissionError):
        H.TestAccess()
    with pytest.raises(PermissionError):
        F.album_features("clap", include_test=True)
    with pytest.raises(PermissionError):
        F.track_features("clap", include_test=True)


def test_evaluate_run_rejects_test_and_train_rows(sandbox, fake_val):
    for split in ("test", "train"):
        rows = split_rows(split)[:5]
        with pytest.raises(ValueError, match="val rows only"):
            H.evaluate_run("arm__x", np.zeros((5, 120)), rows, config={}, downstream=False, strict=False, n_train=1)
    assert not (sandbox / "results").exists()


def test_save_train_oof_rejects_non_train_rows(sandbox):
    with pytest.raises(AssertionError):
        H.save_train_oof("arm__x", np.zeros((3, 120)), split_rows("val")[:3])


def test_final_test_with_env_uses_validation_thresholds(sandbox, monkeypatch):
    """The mechanics of final_test, WITHOUT touching the real test split: 20 validation rows are relabelled
    "test" in a patched copy of the split, so no real test label is read here."""
    val = split_rows("val")[:40]
    fake_val_rows, fake_test_rows = val[:20], val[20:]
    fake = load_splits().copy()
    fake[fake == "test"] = "none"
    fake[fake_test_rows] = "test"
    monkeypatch.setattr(H, "load_splits", lambda: fake)
    monkeypatch.setattr(H, "eval_rows", lambda split="val": {"val": fake_val_rows, "test": fake_test_rows}[split])
    monkeypatch.setattr(F, "n_shards", lambda: 3)
    monkeypatch.setattr(F, "album_index", lambda: {})
    monkeypatch.setattr(F, "n_matched_albums", lambda: 3761)
    rng = np.random.default_rng(3)
    S_val = Y[fake_val_rows] + rng.normal(0, 0.6, (20, 120))
    S_test = Y[fake_test_rows] + rng.normal(0, 0.6, (20, 120))
    H.evaluate_run("arm__m", S_val, fake_val_rows, config={}, downstream=False, n_train=5, verbose=False)
    with pytest.raises(PermissionError):
        H.final_test("arm__m", lambda access: (S_test, access.rows), config={}, downstream=False)
    monkeypatch.setenv(H.TEST_ENV, "1")
    seen = {}

    def predict(access):
        seen["rows"] = access.rows
        return S_test, access.rows

    res = H.final_test("arm__m", predict, config={"k": 1}, downstream=False)
    assert np.array_equal(seen["rows"], fake_test_rows) and res["split"] == "test" and res["data"]["n_test"] == 20
    ops = res["metrics"]["val_chosen_operating_points"]["0.80"]
    assert ops["threshold"] == pytest.approx(H.choose_threshold(Y[fake_val_rows], S_val.astype(np.float32).astype(float), 0.8))
    assert ops["eval"] == H._jsonable(H.apply_threshold(Y[fake_test_rows], S_test, ops["threshold"]))
    cc = res["metrics"]["calibrated_count"]
    assert cc["threshold_source"] == "count-matched on VALIDATION scores"
    assert (sandbox / "results" / "test" / "arm__m.json").exists()
    assert not any(r["name"] == "arm__m" and r["n_val"] != "20" for r in H._read_leaderboard())   # val row untouched
    log = (sandbox / "results" / "test_invocations.log").read_text().splitlines()
    assert [l.split("\t")[1].split(" ")[0] for l in log] == ["REFUSED", "STARTED", "DONE"]
    S_back, rows_back = H.load_scores("arm__m", "test")
    assert np.array_equal(rows_back, fake_test_rows)
    with pytest.raises(FileNotFoundError):                         # a run without validation scores cannot be tested
        H.final_test("arm__never_validated", predict, config={}, downstream=False)


# ---------------------------------------------------------------- leaderboard

def _row(name, p10):
    return {c: "" for c in H.LEADERBOARD_COLUMNS} | {"name": name, "P@10": p10, "n_train": 10, "n_val": 5, "timestamp": "t"}


def test_leaderboard_row_is_replaced_not_duplicated(sandbox):
    H._update_leaderboard(_row("a__one", 0.30))
    H._update_leaderboard(_row("b__two", 0.50))
    H._update_leaderboard(_row("a__one", 0.70))
    rows = H._read_leaderboard()
    assert [r["name"] for r in rows] == ["a__one", "b__two"]          # replaced in place
    assert float(rows[0]["P@10"]) == 0.70
    assert [r["name"] for r in H.leaderboard(show=False)] == ["a__one", "b__two"]   # sorted by P@10, descending
    H._update_leaderboard(_row("a__one", 0.10))
    assert [r["name"] for r in H.leaderboard(show=False)] == ["b__two", "a__one"]
    assert len(H._read_leaderboard()) == 2


def test_evaluate_run_writes_everything_and_replaces(sandbox, fake_val, capsys):
    rows = fake_val
    rng = np.random.default_rng(1)
    S_good = Y[rows] + 0.01 * rng.random((len(rows), 120))        # true descriptors on top, in the true order
    S_bad = rng.random((len(rows), 120))
    perm = rng.permutation(len(rows))                              # the harness must re-sort by row
    r1 = H.evaluate_run("arm__model", S_bad[perm], rows[perm], config={"x": 1}, downstream=False, n_train=123)
    r2 = H.evaluate_run("arm__model", S_good[perm], rows[perm], config={"x": 2}, downstream=False, n_train=123)
    H.evaluate_run("arm__other", S_bad, rows, config={}, downstream=False, n_train=7, notes="hello")
    m = r2["metrics"]
    assert m["ranking"]["precision@1"] == 1.0 and m["ranking"]["ndcg@10"] == pytest.approx(1.0)
    assert m["ranking"]["precision@10"] == pytest.approx(m["ranking"]["max_precision@10"])
    pc = m["precision_coverage"]
    # every true pair outranks every false one: precision is 1 up to the true count, and still >= 0.9 a little beyond it
    assert pc["points"][-1]["precision"] == 1.0 and pc["points"][-1]["recall"] == 1.0
    assert pc["at_precision"]["0.90"]["avg_count"] == pytest.approx(pc["mean_true_count"] / 0.9, abs=0.03)
    assert r1["metrics"]["ranking"]["precision@10"] < 0.3
    assert r2["data"]["n_train"] == 123 and r2["data"]["n_val"] == 40 and r2["data"]["n_shards"] == 3
    assert r2["data"]["partial_data"] is True and r2["data"]["val_coverage"] == 1.0
    saved = json.loads((sandbox / "results" / "val" / "arm__model.json").read_text())
    assert saved["config"] == {"x": 2} and saved["split"] == "val" and "downstream" not in saved["metrics"]
    S_back, rows_back = H.load_scores("arm__model", "val")
    assert np.array_equal(rows_back, rows) and np.allclose(S_back, S_good, atol=1e-6)
    lb = H._read_leaderboard()
    assert [r["name"] for r in lb] == ["arm__model", "arm__other"]
    assert float(lb[0]["P@10"]) == pytest.approx(m["ranking"]["precision@10"]) and lb[0]["n_train"] == "123"
    assert lb[1]["notes"] == "hello"
    assert H.rebuild_leaderboard() == 2 and {r["name"] for r in H._read_leaderboard()} == {"arm__model", "arm__other"}
    H.leaderboard()
    assert "arm__model" in capsys.readouterr().out


def test_evaluate_run_is_strict_about_rows_and_names(sandbox, fake_val):
    rows = fake_val
    with pytest.raises(ValueError, match="canonical"):
        H.evaluate_run("arm__x", np.zeros((10, 120)), rows[:10], config={}, downstream=False, n_train=1)
    r = H.evaluate_run("arm__x", np.random.default_rng(0).random((10, 120)), rows[:10], config={}, downstream=False,
                       n_train=1, strict=False)
    assert r["data"]["val_coverage"] == pytest.approx(0.25)
    for bad in ("noarm", "a__b/c", "a b__c", "__x", "a__"):
        with pytest.raises(ValueError, match="arm"):
            H.evaluate_run(bad, np.zeros((40, 120)), rows, config={}, downstream=False, n_train=1)
    with pytest.raises(ValueError):
        H.evaluate_run("arm__nan", np.full((40, 120), np.nan), rows, config={}, downstream=False, n_train=1)


def test_complete_scores_fills_missing_rows(fake_val):
    rows = fake_val
    S = np.ones((5, 120))
    out, rows_all = H.complete_scores(S, rows[[3, 9, 1, 20, 30]], fill=np.full(120, 0.25))
    assert np.array_equal(rows_all, rows) and out.shape == (40, 120)
    assert (out[[1, 3, 9, 20, 30]] == 1).all() and (np.delete(out, [1, 3, 9, 20, 30], axis=0) == 0.25).all()


# ---------------------------------------------------------------- CV folds, shared albums

def test_cv_folds_are_artist_disjoint_and_cover_train():
    rows = split_rows("train")[::7]
    folds = H.cv_folds(rows, 5)
    g = H.artist_groups()[rows]
    held_all = np.concatenate([h for _, h in folds])
    assert sorted(held_all.tolist()) == list(range(len(rows)))
    for fit, held in folds:
        assert not set(g[fit]) & set(g[held]) and not set(fit) & set(held)
    with pytest.raises(AssertionError):
        H.cv_folds(split_rows("val")[:10])
    # a row keeps its fold when more rows become available
    full = H.train_fold_ids(5)
    assert np.array_equal(full[rows], H.train_fold_ids(5)[split_rows("train")][::7])


def test_rows_sharing_a_source_album_share_a_split():
    assert H.assert_shared_albums_share_split() >= 0
    assert len(DESCRIPTORS) == 120 and set(load_splits()) == {"train", "val", "test", "none"}


# ---------------------------------------------------------------- features on synthetic shards

def _write_shard(path, albums, rng, nan_tracks=()):
    """albums: list of (album_key, n_tracks). Returns {key: {encoder: float16 array}}."""
    ak, pos = [], []
    for key, n in albums:
        ak += [key] * n
        pos += list(range(n, 0, -1))  # deliberately not in tracklist order
    n = len(ak)
    arrs = {"effnet": rng.normal(size=(n, 1280)), "heads": rng.random((n, 738)), "clap": rng.normal(size=(n, 512)),
            "maest": rng.normal(size=(n, 13, 768)), "mert": rng.normal(size=(n, 13, 768)), "mert_v2": rng.normal(size=(n, 24, 1024))}
    arrs = {k: v.astype(np.float16) for k, v in arrs.items()}
    for i in nan_tracks:
        arrs["mert_v2"][i] = np.nan
    np.savez(path, album_key=np.array(ak), row=np.zeros(n, np.int32), track_pos=np.array(pos, np.int16), **arrs)
    return np.array(ak), np.array(pos), arrs


@pytest.fixture
def shards(tmp_path, monkeypatch):
    tracks = tmp_path / "tracks"
    tracks.mkdir()
    monkeypatch.setattr(F, "TRACKS_DIR", tracks)
    monkeypatch.setattr(F, "POOLED_DIR", tmp_path / "pooled")
    monkeypatch.setattr(F, "_SNAPSHOT", None)
    monkeypatch.setattr(F, "_SHARD_KEYS", {})
    monkeypatch.setattr(F, "_MEMO", {})
    monkeypatch.delenv(F.SHARD_LIMIT_ENV, raising=False)
    monkeypatch.delenv(F.TEST_ENV, raising=False)
    F._TRACK_MEMO.clear()
    F.album_index.cache_clear()
    split = load_splits()
    tr, va, te = (np.flatnonzero(split == s) for s in ("train", "val", "test"))
    # album d:1 is shared by two train rows; d:5 belongs to a test row; d:4 is a single-track album
    table = pd.DataFrame({"row": [tr[0], tr[1], tr[2], va[0], va[1], te[0], tr[3]],
                          "album_key": ["d:1", "d:1", "d:2", "d:3", "d:4", "d:5", "d:6"]}).sort_values("row").reset_index(drop=True)
    monkeypatch.setattr(F, "row_table", lambda: table)
    rng = np.random.default_rng(0)
    # d:2's tracks are rows 3,4,5 of the shard: track row 4 has NaN MERT-v2; d:3 (rows 6,7) has only NaN MERT-v2
    data = _write_shard(tracks / "tracks_001_1.npz", [("d:1", 3), ("d:2", 3), ("d:3", 2)], rng, nan_tracks=(4, 6, 7))
    yield {"dir": tracks, "table": table, "data": data, "rng": rng, "tr": tr, "va": va, "te": te}
    F._TRACK_MEMO.clear()
    F.album_index.cache_clear()


def test_spec_grammar():
    assert [t.label for t in F.parse_spec("maest:7+clap+heads")] == ["maest:7", "clap", "heads"]
    assert F.parse_spec("mert_v2:16")[0].layers == (15,)           # block 16 is array index 15
    assert F.parse_spec("mert:8")[0].layers == (8,) and F.parse_spec("maest:0")[0].layers == (0,)
    assert F.parse_spec("mert_v2:avg")[0].layers == tuple(range(24)) and F.canonical_spec("mert_v2:avg") == "mert_v2:1-24"
    assert F.parse_spec("maest:avg")[0].layers == tuple(range(1, 13))
    assert F.parse_spec("mert_v2:12-20")[0].layers == tuple(range(11, 20))
    for bad in ("mert_v2:0", "mert_v2:25", "maest:13", "maest", "clap:3", "foo", "mert:5-3", "clap+clap"):
        with pytest.raises(ValueError):
            F.parse_spec(bad)
    assert F.feature_blocks("clap+maest:7", "mean+std") == [("clap", "mean", 0, 512), ("clap", "std", 512, 1024),
                                                            ("maest:7", "mean", 1024, 1792), ("maest:7", "std", 1792, 2560)]
    with pytest.raises(ValueError):
        F.parse_pooling("mean+median")


def test_album_features_pooling_rows_and_nan_safety(shards):
    ak, pos, arrs = shards["data"]
    tr, va = shards["tr"], shards["va"]
    assert sorted(F.available_rows().tolist()) == sorted([tr[0], tr[1], tr[2], va[0]])
    X, rows = F.album_features("clap", "mean+std+max", verbose=False)
    assert X.dtype == np.float32 and X.shape == (4, 3 * 512)
    assert rows.tolist() == sorted([tr[0], tr[1], tr[2], va[0]])
    clap = arrs["clap"].astype(np.float32)
    i = rows.tolist().index(tr[2])                                    # d:2
    m = clap[ak == "d:2"]
    assert np.allclose(X[i, :512], m.mean(0), atol=2e-3) and np.allclose(X[i, 512:1024], m.std(0), atol=2e-3)
    assert np.allclose(X[i, 1024:], m.max(0), atol=2e-3)
    j, k = rows.tolist().index(tr[0]), rows.tolist().index(tr[1])     # both rows of d:1 get the same features
    assert np.array_equal(X[j], X[k])
    # MERT-v2: d:2 uses its 2 finite tracks, d:3 has none and is dropped (and reported)
    X2, rows2 = F.album_features("mert_v2:16", "mean", verbose=False)
    assert rows2.tolist() == sorted([tr[0], tr[1], tr[2]]) and np.isfinite(X2).all()
    assert F.LAST_REPORT["albums_dropped_no_valid_track"] == {"mert_v2:16": 1}
    v2 = arrs["mert_v2"].astype(np.float32)[:, 15]
    assert np.allclose(X2[rows2.tolist().index(tr[2])], v2[[3, 5]].mean(0), atol=2e-3)
    # layer average: mean over layers per track, then over tracks
    X3, _ = F.album_features("maest:2-4", "mean", verbose=False)
    mm = arrs["maest"].astype(np.float32)[:, 2:5].mean(1)
    assert np.allclose(X3[rows.tolist().index(tr[2])], mm[ak == "d:2"].mean(0), atol=2e-3)
    # a concatenation is restricted to albums valid for every term
    X4, rows4 = F.album_features("clap+mert_v2:16", "mean", verbose=False)
    assert rows4.tolist() == rows2.tolist() and X4.shape[1] == 512 + 1024


def test_cache_picks_up_new_shards_and_skips_broken_ones(shards):
    tr, va, te = shards["tr"], shards["va"], shards["te"]
    X, rows = F.album_features("clap", "mean+std", verbose=False)
    assert (F.POOLED_DIR / "clap__mean.npz").exists() and (F.POOLED_DIR / "clap__std.npz").exists()
    ak2, _, arrs2 = _write_shard(shards["dir"] / "tracks_002_1.npz", [("d:4", 1), ("d:5", 4)], shards["rng"])
    (shards["dir"] / "tracks_003_1.npz").write_bytes(b"not an npz")          # must be skipped
    (shards["dir"] / "tracks_004_1.npz.part").write_bytes(b"half written")   # the extractor's temp name: never listed
    # frozen snapshot: nothing changes inside this process until refresh()
    assert np.array_equal(F.album_features("clap", "mean+std", verbose=False)[1], rows)
    with pytest.warns(UserWarning, match="unreadable shard"):
        assert F.refresh() == 2
    X2, rows2 = F.album_features("clap", "mean+std", verbose=False)
    assert rows2.tolist() == sorted([tr[0], tr[1], tr[2], va[0], va[1]])      # d:5 is a TEST row: withheld
    assert te[0] in F.available_rows()                                        # ...but it is listed as having audio
    old = np.isin(rows2, rows)
    assert np.array_equal(X2[old], X)                                         # cached part unchanged
    one = X2[rows2.tolist().index(va[1])]                                     # single-track album: std = 0
    assert np.allclose(one[:512], arrs2["clap"].astype(np.float32)[0]) and (one[512:] == 0).all()
    # a fresh process (empty memory) reads the same thing from the disk cache
    F._MEMO.clear()
    X3, rows3 = F.album_features("clap", "mean+std", verbose=False)
    assert np.array_equal(X3, X2) and np.array_equal(rows3, rows2)


def test_shard_limit_env_pins_the_snapshot(shards, monkeypatch):
    _write_shard(shards["dir"] / "tracks_002_1.npz", [("d:4", 1), ("d:6", 2)], shards["rng"])
    F.refresh()
    _, rows_all = F.album_features("clap", "mean", verbose=False)
    monkeypatch.setenv(F.SHARD_LIMIT_ENV, "1")
    F.refresh()
    _, rows_one = F.album_features("clap", "mean", verbose=False)
    assert len(rows_all) == 6 and len(rows_one) == 4 and set(rows_one) < set(rows_all)


def test_track_features_padding_order_and_mask(shards):
    ak, pos, arrs = shards["data"]
    tr, va = shards["tr"], shards["va"]
    Xt, mask, rows = F.track_features("clap", verbose=False)
    assert Xt.shape == (4, 3, 512) and Xt.dtype == np.float32 and mask.dtype == bool
    assert mask.sum(1).tolist() == [3, 3, 3, 2] or sorted(mask.sum(1).tolist()) == [2, 3, 3, 3]
    i = rows.tolist().index(va[0])                                            # d:3 has 2 tracks: one padded slot
    assert mask[i].tolist() == [True, True, False] and (Xt[i, 2] == 0).all()
    clap = arrs["clap"].astype(np.float32)
    idx = np.flatnonzero(ak == "d:3")
    assert np.array_equal(Xt[i, :2], clap[idx[np.argsort(pos[idx])]])         # tracklist order
    # MERT-v2: the NaN track of d:2 is removed, d:3 disappears
    Xt2, mask2, rows2 = F.track_features("mert_v2:16+clap", verbose=False)
    assert rows2.tolist() == sorted([tr[0], tr[1], tr[2]]) and np.isfinite(Xt2).all()
    assert mask2[rows2.tolist().index(tr[2])].sum() == 2 and Xt2.shape[2] == 1024 + 512
    # masked mean of the tracks equals the pooled album feature. (album_features pools every term over
    # ITS OWN finite tracks, so the clap block of d:2 uses 3 tracks there and 2 here: compare MERT-v2 only.)
    Xa, ra = F.album_features("mert_v2:16+clap", "mean", verbose=False)
    mm = (Xt2 * mask2[..., None]).sum(1) / mask2.sum(1, keepdims=True)
    assert np.array_equal(ra, rows2) and np.allclose(mm[:, :1024], Xa[:, :1024], atol=2e-3)
    full = mask2.sum(1) == 3
    assert full.sum() == 2 and np.allclose(mm[full], Xa[full], atol=2e-3)


def test_standardizer_uses_train_statistics_only():
    rng = np.random.default_rng(0)
    Xtr = rng.normal(3.0, 2.0, size=(200, 5)).astype(np.float32)
    Xtr[:, 4] = 7.0                                                           # constant column
    Xva = rng.normal(-10.0, 9.0, size=(50, 5)).astype(np.float32)
    a, b, sc = F.standardize(Xtr, Xva)
    assert np.allclose(a.mean(0), 0, atol=1e-4) and np.allclose(a[:, :4].std(0), 1, atol=1e-3)
    assert (a[:, 4] == 0).all() and np.isfinite(b).all()
    assert np.allclose(b, (Xva - Xtr.mean(0)) / np.where(Xtr.std(0) > 1e-6, Xtr.std(0), 1), atol=1e-4)
    assert abs(b.mean()) > 1                                                  # val is NOT re-centred
    Xt = rng.normal(size=(6, 4, 5)).astype(np.float32)
    mask = np.zeros((6, 4), bool)
    mask[:, :2] = True
    sc2 = F.Standardizer().fit_tracks(Xt, mask)
    assert np.allclose(sc2.mean_, Xt[:, :2].reshape(-1, 5).mean(0), atol=1e-6) and sc2.transform(Xt).shape == Xt.shape


# ---------------------------------------------------------------- the linear probe

def test_logreg_matches_sklearn():
    from sklearn.linear_model import LogisticRegression

    from probes import fit_logreg, predict_logreg

    rng = np.random.default_rng(0)
    for n, d, C in ((120, 8, 0.5), (30, 60, 0.05)):      # the second case takes the row-space (n < d) path
        X = rng.normal(size=(n, d))
        B = (X @ rng.normal(size=(d, 3)) / np.sqrt(d) + rng.normal(size=(n, 3)) > 0.3)
        W, b = fit_logreg(X, B, C=C, tol=1e-8, max_iter=500)
        P = predict_logreg(X, W, b)
        for j in range(3):
            ref = LogisticRegression(C=C, max_iter=5000, tol=1e-10).fit(X, B[:, j])
            assert np.allclose(W[:, j], ref.coef_[0], atol=2e-3) and abs(b[j] - ref.intercept_[0]) < 2e-3
            assert np.allclose(P[:, j], ref.predict_proba(X)[:, 1], atol=1e-3)
        W2, b2 = fit_logreg(X, B, C=C, init=(W, b), tol=1e-8)     # warm start from the optimum stays there
        assert np.allclose(W2, W, atol=1e-5)
