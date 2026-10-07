"""Predict an album's 120 descriptor weights (same columns and format as all_data_norm.pkl) from whatever is known
about it: an audio-embedding row, MusicBrainz / Deezer tags, and / or an LLM annotator's ranked descriptor list.

    from predict import predict_weights
    w = predict_weights(embedding_row=row)                                   # audio probe only           -> (120,)
    w = predict_weights(embedding_row=row, tags=tags)                        # audio + tags fallback stacker
    w = predict_weights(llm_descriptors=["dark", "atmospheric", ...])       # the LLM's list alone
    w = predict_weights(llm_descriptors=[...], tags=tags)                    # LLM + tags (F3)
    w = predict_weights(llm_descriptors=[...], embedding_row=row, tags=tags) # full fusion (F3)

    .venv/bin/python predict.py --row 123          # look the row up in the caches; prints predicted next to true
    .venv/bin/python predict.py --export           # (re)build model/ from cache/ (frozen fits; nothing is trained)

Inputs
  embedding_row    a row of cache/embeddings.parquet (dict / pandas Series) with the album-level vectors `heads` (738),
                   `clap` (512) and `maest` (13 x 768 flattened: hidden states 0..12, mean over the album's preview
                   clips). The probe uses heads | clap | mean of MAEST layers 1..12, z-scored with the train statistics.
  tags             {"mb_album": {tag: votes} | [tag, ...], "mb_artist": {...}, "deezer_genres": [...], "year": int | None}
                   (optional "mb_matched" / "deezer_found" flags; default: True when the source's key is present).
                   `tags_for_row(row)` builds this from the fetch caches.
  llm_descriptors  ranked list of descriptor names (model/llm_prompt/ holds the annotator prompt and its 200 examples);
                   `known` (0 | 1 | 2) is the annotator's self-reported familiarity (not used by the frozen F3 form).
  policy           "default"    the hub-ok policy chosen on train for the route: dense top-10 (values kept, train median
                                L2 norm) for the full fusion and for the audio probe alone, top-10 rank weights otherwise
                   "top10"      10 highest scores, train rank weights (weights.scores_to_weights)
                   "dense10"    top 10 of p x mean train weight, scaled to the train median L2 norm (needs probabilities)
                   "calibrated" global threshold that gave the train mean count (about 10.7 descriptors per album)

Everything fitted lives in model/ (float32 npz + json, copied from cache/ by --export); the scoring goes through
exp_llm_fusion.apply and weights.scores_to_weights. Columns: common.DESCRIPTORS (the table's order).
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")

import argparse
import json
import re
import shutil
from functools import lru_cache
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
MODEL_DIR = HERE / "model"
YEAR_CENTRE, YEAR_SCALE = 1990.0, 20.0
MAEST_LAYERS, MAEST_DIM = 13, 768
ROUTE_DEFAULT = {"lam": "dense10", "a": "dense10"}          # every other route: top10
ROUTE_NAME = {"lam": "LLM + audio + tags (fusion F3)", "lm": "LLM + tags (F3)", "am": "audio + tags (fallback stacker)",
              "a": "audio probe", "m": "tag probe", "prior": "train prevalence (no input)"}


@lru_cache(maxsize=1)
def load() -> dict:
    """The frozen artefacts of model/ as one dict."""
    z = np.load(MODEL_DIR / "descriptor_model.npz", allow_pickle=False)
    A = {k: z[k] for k in z.files}
    J = json.loads((MODEL_DIR / "fusion.json").read_text())
    fusion = {"norm": {**J["norm"], "prior": A["prior"].astype(np.float64), "plz": A["prior_logit_z"].astype(np.float64)}, "sub": J["sub"]}
    return {"arrays": A, "fusion": fusion, "info": J, "descriptors": [str(d) for d in A["descriptors"]],
            "meta_index": {str(n): j for j, n in enumerate(A["meta_names"])}, "banned": set(J["banned_tags"])}


# ---------------------------------------------------------------- the two probes

def embedding_features(embedding_row) -> np.ndarray:
    """heads | clap | mean of MAEST hidden states 1..12 (the probe's input before standardisation), float32 (2018,)."""
    heads = np.asarray(embedding_row["heads"], dtype=np.float32).ravel()
    clap = np.asarray(embedding_row["clap"], dtype=np.float32).ravel()
    maest = np.asarray(embedding_row["maest"], dtype=np.float32).ravel()
    assert heads.shape == (738,) and clap.shape == (512,), (heads.shape, clap.shape)
    assert maest.shape == (MAEST_LAYERS * MAEST_DIM,), maest.shape
    x = np.concatenate([heads, clap, maest.reshape(MAEST_LAYERS, MAEST_DIM)[1:13].mean(0)])
    if not np.isfinite(x).all():
        raise ValueError("the embedding row has non-finite values (no valid track for one of the encoders)")
    return x


def audio_probs(embedding_row) -> np.ndarray:
    """P(descriptor) of the audio probe audio63__heads+clap+maest-1-12, (120,)."""
    A = load()["arrays"]
    z = (embedding_features(embedding_row) - A["audio_mean"]) / A["audio_scale"]
    return 1.0 / (1.0 + np.exp(-np.clip(z.astype(np.float64) @ A["audio_W"].astype(np.float64) + A["audio_b"], -50, 50)))


def norm_tag(t: str) -> str:
    return " ".join(re.sub(r"[-_/]+", " ", str(t).casefold()).split())


def _tag_counts(obj) -> dict[str, float]:
    """{tag: count} | [tag, ...] | JSON text of either -> {normalised tag: count} (as meta_features._parse)."""
    if obj is None or (isinstance(obj, float) and np.isnan(obj)) or (isinstance(obj, str) and obj == ""):
        return {}
    if isinstance(obj, str):
        obj = json.loads(obj)
    items = obj.items() if isinstance(obj, dict) else ((k, 1) for k in obj)
    out: dict[str, float] = {}
    for name, count in items:
        for part in re.split(r"[;|]", str(name)):
            k = norm_tag(part)
            if k and float(count) > 0:
                out[k] = max(out.get(k, 0.0), float(count))
    return out


def tag_features(tags: dict) -> tuple[np.ndarray, bool]:
    """The tag probe's feature vector (meta_features.build_meta_features for one album) and whether the album
    carries any tag / genre at all (if not, the probe emits the train prevalence)."""
    M = load()
    idx, banned = M["meta_index"], M["banned"]
    x = np.zeros(len(idx), dtype=np.float32)
    covered = False
    for source, groups, flag in (("musicbrainz", (("mb_album", "mb_album", True), ("mb_artist", "mb_artist", True)), "mb_matched"),
                                 ("deezer", (("deezer_genre", "deezer_genres", False),), "deezer_found")):
        any_tags, present = False, False
        for prefix, key, log in groups:
            if key not in tags:
                continue
            present = True
            for t, c in _tag_counts(tags[key]).items():
                if t in banned:
                    continue
                any_tags = True
                j = idx.get(f"{prefix}:{t}")
                if j is not None:
                    x[j] = np.log1p(c) if log else 1.0
        x[idx[f"has_{source}"]] = float(bool(tags.get(flag, present)))
        x[idx[f"has_{source}_tags"]] = float(any_tags)
        covered |= any_tags
    y = tags.get("year")
    ok = y is not None and not (isinstance(y, float) and np.isnan(y)) and 1850 <= int(y) <= 2100
    x[idx["year"]] = ((float(int(y)) if ok else M["info"]["year_fill"]) - YEAR_CENTRE) / YEAR_SCALE
    x[idx["has_year"]] = float(ok)
    return x, covered


def tag_probs(tags: dict) -> np.ndarray:
    """P(descriptor) of the tag probe meta63__mb+dz_nodesc, (120,); the train prevalence if the album has no tag."""
    A = load()["arrays"]
    x, covered = tag_features(tags)
    if not covered:
        return A["meta_prev"].astype(np.float64)
    z = ((x - A["meta_mean"]) * A["meta_gain"]).astype(np.float64) @ A["meta_W"].astype(np.float64) + A["meta_b"]
    return 1.0 / (1.0 + np.exp(-np.clip(z, -50, 50)))


# ---------------------------------------------------------------- scores -> weights

def clean_list(words: list[str]) -> list[str]:
    """Keep vocabulary words (case-insensitive match, first occurrence), in order."""
    D = load()["descriptors"]
    lower = {d.lower(): d for d in D}
    out: list[str] = []
    for w in words:
        w = w if w in D else lower.get(str(w).lower())
        if w is not None and w not in out:
            out.append(w)
    return out


def predict_scores(*, llm_descriptors=None, embedding_row=None, tags=None, known: int = 2) -> dict:
    """{"scores" (120,) ranking scores, "proba" (120,) probability-like values, "route"}."""
    import exp_llm_fusion as X

    M = load()
    audio = audio_probs(embedding_row) if embedding_row is not None else None
    meta = tag_probs(tags) if tags is not None else None
    words = clean_list(list(llm_descriptors)) if llm_descriptors is not None else []
    if not words and audio is not None and meta is None:          # the path of the original brief: embedding -> weights
        return {"scores": audio, "proba": audio, "route": "a"}
    if not words and audio is None:
        if meta is None:
            p = M["arrays"]["prior"].astype(np.float64)
            return {"scores": p, "proba": p, "route": "prior"}
        return {"scores": meta, "proba": meta, "route": "m"}
    ann = [{"known": int(known), "d": words}] if words else None
    args = (ann, None if audio is None else audio[None, :], None if meta is None else meta[None, :])
    S, route = X.apply(*args, model=M["fusion"], return_route=True)
    P = X.apply(*args, model=M["fusion"], proba=True)
    return {"scores": S[0], "proba": P[0], "route": str(route[0])}


def to_weights(scores: np.ndarray, proba: np.ndarray, route: str, policy: str = "default") -> np.ndarray:
    from weights import scores_to_weights

    M = load()
    A = M["arrays"]
    rw = A["rank_weights"].astype(np.float64)
    if policy == "default":
        policy = ROUTE_DEFAULT.get(route, "top10")
    if policy == "top10":
        return scores_to_weights(scores[None, :], k=10, rank_weights=rw)[0]
    if policy == "calibrated":
        thr = M["info"]["calibrated_count_thresholds"].get(route)
        if thr is None:
            raise ValueError(f"no calibrated-count threshold stored for route {route!r}")
        return scores_to_weights(scores[None, :], threshold=thr, rank_weights=rw)[0]
    if policy == "dense10":
        dense = np.asarray(proba, dtype=np.float64) * A["mean_weight_when_present"].astype(np.float64)
        top = np.argsort(-dense, kind="stable")[:10]
        w = np.zeros_like(dense)
        w[top] = dense[top]
        return w * (M["info"]["train_median_l2"] / max(float(np.linalg.norm(w)), 1e-12))
    raise ValueError(f"unknown policy {policy!r}")


def predict_weights(*, llm_descriptors=None, embedding_row=None, tags=None, policy: str = "default", known: int = 2) -> np.ndarray:
    """Descriptor-weight vector (120,) float64 in the table's column order (common.DESCRIPTORS); 0 = absent."""
    r = predict_scores(llm_descriptors=llm_descriptors, embedding_row=embedding_row, tags=tags, known=known)
    return to_weights(r["scores"], r["proba"], r["route"], policy)


# ---------------------------------------------------------------- lookups in the caches (CLI, tests)

def embedding_row_for(row: int):
    """The row's entry of cache/embeddings.parquet as a dict, or None if it has no embeddings."""
    import pyarrow.parquet as pq

    t = pq.read_table(HERE / "cache" / "embeddings.parquet", columns=["row", "heads", "clap", "maest"], filters=[("row", "==", int(row))])
    if t.num_rows == 0:
        return None
    d = t.slice(0, 1).to_pylist()[0]
    return {k: np.asarray(d[k], dtype=np.float32) for k in ("heads", "clap", "maest")}


@lru_cache(maxsize=1)
def _meta_sources():
    import meta_features as MF

    return {s: MF.load_source(s) for s in ("musicbrainz", "deezer")}


def _flag(v) -> bool:
    try:
        return False if v is None or (isinstance(v, float) and np.isnan(v)) else bool(v)
    except (TypeError, ValueError):
        return False


def tags_for_row(row: int) -> dict | None:
    """The `tags` input of a table row from cache/musicbrainz.parquet and cache/deezer_meta.parquet (None if neither has it)."""
    src = _meta_sources()
    out: dict = {}
    years = {}
    mb, dz = src["musicbrainz"], src["deezer"]
    if mb is not None and int(row) in mb.index and not (("status" in mb.columns) and mb.at[int(row), "status"] == "error"):
        r = mb.loc[int(row)]
        out.update({"mb_album": r["album_tags"], "mb_artist": r["artist_tags"], "mb_matched": _flag(r["matched"])})
        years["musicbrainz"] = r.get("year")
    if dz is not None and int(row) in dz.index and not (("status" in dz.columns) and dz.at[int(row), "status"] == "error"):
        r = dz.loc[int(row)]
        out.update({"deezer_genres": r["genres"], "deezer_found": _flag(r["found"])})
        years["deezer"] = r.get("year")
    if not out:
        return None
    out["year"] = None
    for s in ("musicbrainz", "deezer"):
        y = years.get(s)
        try:
            if y is not None and not np.isnan(float(y)) and 1850 <= int(y) <= 2100:
                out["year"] = int(y)
                break
        except (TypeError, ValueError):
            pass
    return out


def llm_list_for_row(row: int, split: str) -> dict | None:
    import exp_llm

    ann, _ = exp_llm.load_annotations(load()["info"]["llm_model"], split)
    return ann.get(int(row))


# ---------------------------------------------------------------- export: cache/ -> model/ (copies of frozen fits)

def _plain(o):
    if isinstance(o, dict):
        return {k: _plain(v) for k, v in o.items()}
    if isinstance(o, np.ndarray):
        return o.astype(np.float64).tolist()
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    return o


def export_model() -> dict:
    import exp_fusion as EF
    import exp_llm_fusion as X
    import meta_features as MF
    from common import DESCRIPTORS, N_DESC, Y64, split_rows
    from weights import calibrate_threshold, train_rank_weights

    model = X.load_model()
    za, zm = np.load(X.WORK / f"audio_{model['audio_key']}.npz"), np.load(X.WORK / "meta.npz")
    tr = split_rows("train")
    Yt = Y64[tr]
    cnt = (Yt > 0).sum(0)
    mu_w = np.where(cnt >= 5, Yt.sum(0) / np.maximum(cnt, 1), Yt[Yt > 0].mean())
    names = [str(n) for n in zm["names"]]
    ms = EF.MetaStore(list(X.META_SOURCES), 5)
    try:
        Xtr, names_now = ms.build(zm["vocab_rows"], zm["vocab_rows"], X.META_SOURCES, True)
    finally:
        ms.close()
    assert list(names_now) == names
    has_year = Xtr[:, names.index("has_year")] > 0
    year_fill = float(np.median(Xtr[has_year, names.index("year")].astype(np.float64)) * YEAR_SCALE + YEAR_CENTRE)
    MODEL_DIR.mkdir(exist_ok=True)
    f32 = lambda a: np.asarray(a, dtype=np.float32)  # noqa: E731
    np.savez_compressed(
        MODEL_DIR / "descriptor_model.npz", descriptors=np.array(DESCRIPTORS, dtype=str),
        audio_mean=f32(za["mean"]), audio_scale=f32(za["scale"]), audio_W=f32(za["W"]), audio_b=f32(za["b"]),
        meta_names=np.array(names, dtype=str), meta_mean=f32(zm["mean"]), meta_gain=f32(zm["gain"]), meta_W=f32(zm["W"]),
        meta_b=f32(zm["b"]), meta_prev=f32(zm["prev"]), prior=f32(model["norm"]["prior"]), prior_logit_z=f32(model["norm"]["plz"]),
        rank_weights=f32(train_rank_weights()), mean_weight_when_present=f32(mu_w))
    thr = {}
    frozen = X.WORK / "frozen_train_scores.npz"
    if frozen.exists():
        z = np.load(frozen)
        target = float(N_DESC[tr].mean())
        for route, key in (("lam", "fusion_F3"), ("lm", "llm+tags_F3"), ("am", "audio+tags"), ("a", "audio"), ("m", "tags"), ("prior", "most_frequent")):
            thr[route] = calibrate_threshold(z[f"{key}|S"], target)
    J = {"version": 1, "llm_model": model["llm_model"], "audio_run": model["audio_name"], "meta_run": model["meta_name"],
         "audio_input": "heads (738) | clap (512) | mean of MAEST hidden states 1..12 (768); album mean over preview clips; z-scored",
         "norm": {k: float(model["norm"][k]) for k in ("a_mu", "a_sd", "m_mu", "m_sd")},
         "sub": {u: {"method": s["method"], "n_train": s["n_train"], "platt": s["platt"], "params": _plain(s["params"])}
                 for u, s in model["sub"].items()},
         "choice": model["choice"], "year_fill": year_fill, "train_median_l2": float(np.median(np.linalg.norm(Yt, axis=1))),
         "train_mean_count": float(N_DESC[tr].mean()), "calibrated_count_thresholds": thr,
         "route_default_policy": {**{r: "top10" for r in ROUTE_NAME}, **ROUTE_DEFAULT},
         "banned_tags": sorted({MF.norm_tag(d) for d in MF.descriptor_names("all")}),
         "meta_sources": list(X.META_SOURCES), "meta_C": float(zm["C"]), "audio_C": float(za["C"])}
    (MODEL_DIR / "fusion.json").write_text(json.dumps(J, indent=1, ensure_ascii=False) + "\n")
    (MODEL_DIR / "llm_prompt").mkdir(exist_ok=True)
    for f in ("instructions_fewshot200.md", "fewshot_train200.json", "vocab.json"):
        shutil.copy2(HERE / "cache" / "llm" / f, MODEL_DIR / "llm_prompt" / f)
    (MODEL_DIR / "README.md").write_text(
        "# Descriptor predictor artefacts (frozen; see ../results/test/FROZEN.md)\n\n"
        "- `descriptor_model.npz` (float32): audio probe (mean, scale, W, b), tag probe (feature names, gain, W, b, prevalence), "
        "train prevalence, rank weights, mean weight per descriptor, descriptor names.\n"
        "- `fusion.json`: fusion parameters (LLM+audio+tags, LLM+tags, audio+tags), score maps, policies, thresholds, banned tag names.\n"
        "- `llm_prompt/`: the annotator instructions, the 200 TRAIN-split example albums with their descriptor lists, the vocabulary. "
        "Each batch of albums (id, artist, title, year) was annotated by a language model following `instructions_fewshot200.md`.\n"
        "- Used by `../predict.py`; rebuilt from `cache/` by `python predict.py --export` (copies only, nothing is fitted).\n")
    load.cache_clear()
    size = sum(p.stat().st_size for p in MODEL_DIR.rglob("*") if p.is_file())
    return {"dir": str(MODEL_DIR), "bytes": size, "files": {str(p.relative_to(MODEL_DIR)): p.stat().st_size for p in sorted(MODEL_DIR.rglob("*")) if p.is_file()}}


# ---------------------------------------------------------------- CLI

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--row", type=int, help="table row (position in all_data_norm.pkl) to predict from the caches")
    ap.add_argument("--policy", default="default", choices=["default", "top10", "dense10", "calibrated"])
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--no-tags", action="store_true")
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--export", action="store_true", help="copy the frozen fits from cache/ to model/")
    a = ap.parse_args()
    if a.export:
        info = export_model()
        print(json.dumps(info, indent=1))
        return
    if a.row is None:
        ap.error("give --row N or --export")
    from common import DESCRIPTORS, TABLE, Y64, load_splits

    split = load_splits()[a.row]
    if split == "test" and os.environ.get("DESCRIPTOR_FINAL_TEST") != "1":
        raise SystemExit(f"row {a.row} is a TEST row: refused (the test split is only read with DESCRIPTOR_FINAL_TEST=1)")
    emb = None if a.no_audio else embedding_row_for(a.row)
    tags = None if a.no_tags else tags_for_row(a.row)
    ann = None if (a.no_llm or split not in ("train", "val", "test")) else llm_list_for_row(a.row, split)
    r = predict_scores(llm_descriptors=ann["d"] if ann else None, embedding_row=emb, tags=tags, known=ann["known"] if ann else 2)
    w = to_weights(r["scores"], r["proba"], r["route"], a.policy)
    true = Y64[a.row]
    print(f"row {a.row} [{split}]: {TABLE['Artist'].iloc[a.row]} - {TABLE['Title'].iloc[a.row]}")
    print(f"inputs: audio {'yes' if emb is not None else 'no'}, tags {'yes' if tags is not None else 'no'}, LLM list "
          f"{'yes (known=%d, %d words)' % (ann['known'], len(ann['d'])) if ann else 'no'} -> route: {ROUTE_NAME[r['route']]}; policy {a.policy}")
    pred = [(DESCRIPTORS[j], w[j]) for j in np.argsort(-w, kind="stable") if w[j] > 0]
    real = [(DESCRIPTORS[j], true[j]) for j in np.argsort(-true, kind="stable") if true[j] > 0]
    hits = sum(1 for d, _ in pred if true[DESCRIPTORS.index(d)] > 0)
    print(f"{'predicted':28s} {'weight':>6s}   | {'true':28s} {'weight':>6s}")
    for i in range(max(len(pred), len(real))):
        p = f"{pred[i][0]:28s} {pred[i][1]:6.3f} {'*' if true[DESCRIPTORS.index(pred[i][0])] > 0 else ' '}" if i < len(pred) else " " * 37
        t = f"{real[i][0]:28s} {real[i][1]:6.3f}" if i < len(real) else ""
        print(f"{p} | {t}")
    if len(real):
        print(f"{hits} of the {len(pred)} predicted descriptors are true (* = true); the album has {len(real)}")


if __name__ == "__main__":
    main()
