"""predict.py against the saved validation scores (needs model/ and the caches; reads val rows only).

    DESCRIPTOR_SHARD_LIMIT=63 .venv/bin/python -m pytest test_predict.py -q -p no:cacheprovider
"""
from __future__ import annotations

import numpy as np
import pytest

import exp_llm
import predict as P
from common import DESCRIPTORS, HERE, load_splits

WORK = HERE / "cache" / "llm_fusion"
pytestmark = pytest.mark.skipif(not (P.MODEL_DIR / "descriptor_model.npz").exists() or not (WORK / "meta.npz").exists(),
                                reason="model/ or the caches are missing")


def _val_rows(n: int = 6) -> np.ndarray:
    z = np.load(WORK / "audio_heads+clap+maest-1-12.npz")
    rows = z["rows_val"]
    assert (load_splits()[rows] == "val").all()
    return rows[np.linspace(0, len(rows) - 1, n).astype(int)]


def test_audio_probe_from_parquet_rows_reproduces_saved_val_scores():
    z = np.load(WORK / "audio_heads+clap+maest-1-12.npz")
    for r in _val_rows():
        emb = P.embedding_row_for(int(r))
        assert emb is not None
        p = P.audio_probs(emb)
        saved = z["S_val"][np.searchsorted(z["rows_val"], r)]
        # the probe was trained on the float16 pooled cache; the parquet holds the same album means in float32
        assert np.abs(p - saved).max() < 0.02, (int(r), float(np.abs(p - saved).max()))
        assert len(set(np.argsort(-p)[:10]) & set(np.argsort(-saved)[:10])) >= 9


def test_tag_probe_from_cache_rows_reproduces_saved_val_scores():
    z = np.load(WORK / "meta.npz")
    rows = z["rows_val"][np.linspace(0, len(z["rows_val"]) - 1, 12).astype(int)]
    for r in rows:
        tags = P.tags_for_row(int(r))
        p = P.tag_probs(tags) if tags is not None else P.load()["arrays"]["meta_prev"]
        saved = z["S_val"][np.searchsorted(z["rows_val"], r)]
        assert np.abs(p - saved).max() < 1e-4, (int(r), float(np.abs(p - saved).max()))


def test_every_input_subset_gives_a_table_format_vector():
    r = int(_val_rows()[2])
    emb, tags = P.embedding_row_for(r), P.tags_for_row(r)
    ann, _ = exp_llm.load_annotations(P.load()["info"]["llm_model"], "val")
    words = ann[r]["d"]
    cases = {"a": dict(embedding_row=emb), "am": dict(embedding_row=emb, tags=tags), "lm": dict(llm_descriptors=words),
             "lm+tags": dict(llm_descriptors=words, tags=tags), "lam": dict(llm_descriptors=words, embedding_row=emb, tags=tags),
             "m": dict(tags=tags), "prior": {}}
    for name, kw in cases.items():
        for policy in ("default", "top10", "dense10", "calibrated"):
            w = P.predict_weights(policy=policy, **kw)
            assert w.shape == (len(DESCRIPTORS),) and np.isfinite(w).all() and (w >= 0).all(), (name, policy)
            if policy in ("top10", "dense10"):
                assert (w > 0).sum() == 10, (name, policy)
    routes = {n: P.predict_scores(**kw)["route"] for n, kw in cases.items()}
    assert routes == {"a": "a", "am": "am", "lm": "lm", "lm+tags": "lm", "lam": "lam", "m": "m", "prior": "prior"}
    # with LLM words the top-10 is a subset of the list (F3 keeps the LLM's set); the first rank weight is the largest
    w = P.predict_weights(llm_descriptors=words, embedding_row=emb, tags=tags, policy="top10")
    assert set(np.flatnonzero(w)) <= {DESCRIPTORS.index(x) for x in words}
    assert abs(w.max() - P.load()["arrays"]["rank_weights"][0]) < 1e-6


def test_full_fusion_matches_the_registered_validation_scores():
    import harness as H

    S, rows = H.load_scores("fusion63__best", "val")
    ann, _ = exp_llm.load_annotations(P.load()["info"]["llm_model"], "val")
    for r in _val_rows(4):
        out = P.predict_scores(llm_descriptors=ann[int(r)]["d"], embedding_row=P.embedding_row_for(int(r)), tags=P.tags_for_row(int(r)),
                               known=ann[int(r)]["known"])
        saved = S[np.searchsorted(rows, r)]
        assert out["route"] == "lam"
        assert len(set(np.argsort(-out["scores"])[:10]) & set(np.argsort(-saved)[:10])) >= 9
        assert np.abs(out["scores"] - saved).max() < 0.05
