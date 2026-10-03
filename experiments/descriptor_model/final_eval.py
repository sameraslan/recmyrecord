"""The single held-out TEST evaluation of the frozen systems (and the identical pass over VALIDATION).

    P="DESCRIPTOR_SHARD_LIMIT=63 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 19 .venv/bin/python"
    $P final_eval.py freeze                       # no test access: train thresholds, the val pass, results/test/FROZEN.md
    DESCRIPTOR_FINAL_TEST=1 $P final_eval.py test # ONCE: results/test/final_test.json (+ harness.final_test for the registered runs)
    $P final_eval.py report                       # results/test/final_test.md from the two JSON files

Nothing is fitted here. The systems are cache/models/llm_fusion63.pkl (exp_llm_fusion.fit_final), the audio probe
cache/llm_fusion/audio_<key>.npz and the tag probe cache/llm_fusion/meta.npz. `freeze` stores, per system, the
TRAIN scores every threshold is taken from (cache/llm_fusion/frozen_train_scores.npz), so `test` only applies.

Row sets (generic names; on test: L = T360, A = Taudio, LA = T360a):
  L   rows of the split with an LLM annotation        A   rows with audio features for the probe's spec
  LA  both
Systems: most_frequent, genre_mean (reference: scraped RYM genres), tags, audio, audio+tags, llm,
llm+tags_F3, fusion_F3 - see FROZEN.md.

Test access: one harness.TestAccess for the audio features (needs DESCRIPTOR_FINAL_TEST=1), a line in
results/test_invocations.log for this script, and one harness.final_test call per registered run (which writes the
harness's own results/test/<name>.json with VAL-chosen thresholds). The tables requested for the subsets (train-chosen
thresholds, paired differences, policies, breakdowns) are computed with the metric functions directly, in this one run.
"""
from __future__ import annotations

import os

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

import exp_llm
import exp_llm_fusion as X
import features as F
import harness as H
import metrics as M
from common import DESCRIPTORS, HERE, N_DESC, Y, Y64, YB, audio_suspect_rows, label_suspect_rows, split_rows
from weights import calibrate_threshold, scores_to_weights, train_rank_weights

OUT_DIR = HERE / "results" / "test"
FROZEN_SCORES = X.WORK / "frozen_train_scores.npz"
SYSTEMS = ["most_frequent", "genre_mean", "tags", "audio", "audio+tags", "llm", "llm+tags_F3", "fusion_F3"]
SETS_OF = {"most_frequent": ("L", "A"), "genre_mean": ("L", "A"), "tags": ("L", "A"), "audio": ("A", "LA"),
           "audio+tags": ("A", "LA"), "llm": ("L", "LA"), "llm+tags_F3": ("L", "LA"), "fusion_F3": ("LA",)}
HUB_OK = {"llm": "top-10 (default)", "fusion_F3": "dense top-10 -> train median L2", "audio": "dense top-10 -> train median L2",
          "audio+tags": "top-10 (default)"}        # selected on TRAIN in exp_llm_fusion.py recs (hub-ok rule)
REGISTERED = {"most_frequent": "baseline__most_frequent_fulltrain", "genre_mean": "baseline__genre_mean_all_fulltrain",
              "tags": X.META_NAME, "audio": None, "llm": f"llm__{X.LLM_MODEL}_knowledge", "fusion_F3": "fusion63__best"}
DS_STOPS = ("sonic", "balanced", "mood")
YEAR_BUCKETS = (("<=1979", -10 ** 9, 1979), ("1980-1999", 1980, 1999), ("2000-2014", 2000, 2014), ("2015+", 2015, 10 ** 9))


def sha(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16]


def rec_const() -> dict:
    tr = split_rows("train")
    Yt = Y64[tr]
    cnt = (Yt > 0).sum(0)
    return {"target_count": float(N_DESC[tr].mean()), "median_norm": float(np.median(np.linalg.norm(Yt, axis=1))),
            "mu_w": np.where(cnt >= 5, Yt.sum(0) / np.maximum(cnt, 1), Yt[Yt > 0].mean())}


# ---------------------------------------------------------------- train scores every threshold comes from (no test)

def frozen_train_scores(model: dict) -> dict:
    inp = X.load_inputs(model["audio_key"])
    rs = X.row_sets(inp)
    au, me = inp["audio"][inp["audio_key"]], inp["meta"]
    tr_all = X.train_all_rows()
    prev = YB[tr_all].mean(0)
    out = {"most_frequent": (tr_all, np.tile(prev, (len(tr_all), 1))),
           "tags": (me["rows_train"], me["S_oof"].astype(np.float64)),
           "audio": (au["rows_train"], au["S_oof"].astype(np.float64))}
    rows = rs["train_am"]
    Fd, Yt = X.feats_for(inp, rows, "train", "am"), Y[rows].astype(np.float64)
    sub = model["sub"]["am"]
    out["audio+tags"] = (rows, X.threshold_scores(X.methods_for("am", model["choice"]["lams"].get("am"))[sub["method"]],
                                                  sub["params"], Fd, Yt, rows))
    rows = rs["train_lm"]
    out["llm"] = (rows, exp_llm.score_matrix(inp["ann_train"], rows, X.prior_all()))
    out["llm+tags_F3"] = (rows, X.predict_params(model["sub"]["lm"]["params"], X.feats_for(inp, rows, "train", "lm")))
    rows = rs["train_lam"]
    out["fusion_F3"] = (rows, X.predict_params(model["sub"]["lam"]["params"], X.feats_for(inp, rows, "train", "lam")))
    return out


def save_frozen(tr: dict) -> None:
    np.savez(FROZEN_SCORES, **{f"{k}|rows": v[0] for k, v in tr.items()}, **{f"{k}|S": v[1].astype(np.float64) for k, v in tr.items()})


def load_frozen() -> dict:
    z = np.load(FROZEN_SCORES)
    return {k.split("|")[0]: (z[k], z[k.split("|")[0] + "|S"]) for k in z.files if k.endswith("|rows")}


# ---------------------------------------------------------------- scores of every system on one split

def collect(split: str, model: dict) -> dict:
    """Row sets and score matrices of every frozen system on `split` ("val" or "test")."""
    from baselines import genre_lists, genre_mean_scores

    rows_all = split_rows(split)
    ann, stats = exp_llm.load_annotations(model["llm_model"], split)
    L = np.array(sorted(r for r in ann if ann[r]["d"]), dtype=int)
    assert np.isin(L, rows_all).all(), "annotation ids outside the split"
    blocks = X.AUDIO_SPECS[model["audio_key"]]
    if split == "test":
        access = H.TestAccess()
        feats = [access.album_features(spec, pooling) for spec, pooling in blocks]
        can = access.rows
    else:
        feats = []
        for spec, pooling in blocks:
            Xf, r = F.album_features(spec, pooling, verbose=False)
            keep = np.isin(r, rows_all)
            feats.append((Xf[keep], r[keep]))
        can = H.eval_rows(split)
    A = feats[0][1]
    for _, r in feats[1:]:
        A = np.intersect1d(A, r)
    za = np.load(X.WORK / f"audio_{model['audio_key']}.npz")
    P_audio = X.apply_audio({k: za[k] for k in ("mean", "scale", "W", "b")}, [Xf[np.searchsorted(r, A)] for Xf, r in feats])
    zm = np.load(X.WORK / "meta.npz")
    P_meta, cov = X.meta_scores_for(rows_all, {k: zm[k] for k in ("vocab_rows", "names", "mean", "gain", "W", "b", "prev")})
    tr_all = X.train_all_rows()
    prev = YB[tr_all].mean(0)
    el = genre_lists(rows_all)
    G = genre_mean_scores(genre_lists(tr_all), YB[tr_all], el)
    no_genre = np.array([len(x) == 0 for x in el], dtype=bool)
    G[no_genre] = prev
    LA = np.intersect1d(L, A)
    at = lambda Smat, have, want: np.asarray(Smat[np.searchsorted(have, want)], dtype=np.float64)  # noqa: E731
    anns_L, anns_LA = [ann[int(r)] for r in L], [ann[int(r)] for r in LA]
    S_am, route_am = X.apply(None, P_audio, at(P_meta, rows_all, A), model=model, return_route=True)
    S_lm, route_lm = X.apply(anns_L, None, at(P_meta, rows_all, L), model=model, return_route=True)
    S_f, route_f = X.apply(anns_LA, at(P_audio, A, LA), at(P_meta, rows_all, LA), model=model, return_route=True)
    assert set(route_am) <= {"am"} and set(route_lm) <= {"lm"} and set(route_f) <= {"lam"}
    P_f = X.apply(anns_LA, at(P_audio, A, LA), at(P_meta, rows_all, LA), model=model, proba=True)
    scores = {"most_frequent": (rows_all, np.tile(prev, (len(rows_all), 1))), "genre_mean": (rows_all, G), "tags": (rows_all, P_meta),
              "audio": (A, P_audio), "audio+tags": (A, S_am), "llm": (L, exp_llm.score_matrix(ann, L, X.prior_all())),
              "llm+tags_F3": (L, S_lm), "fusion_F3": (LA, S_f)}
    return {"split": split, "rows_all": rows_all, "sets": {"L": L, "A": A, "LA": LA}, "canonical": can, "ann": ann, "ann_stats": stats,
            "scores": scores, "proba": {"fusion_F3": (LA, P_f), "audio": (A, P_audio)},
            "info": {"n_labelled": int(len(rows_all)), "n_L": int(len(L)), "n_A": int(len(A)), "n_LA": int(len(LA)),
                     "n_canonical_with_audio": int(len(can)), "n_canonical_without_probe_features": int(len(np.setdiff1d(can, A))),
                     "n_with_tags": int(cov.sum()), "n_without_genre": int(no_genre.sum()),
                     "known_L": {str(k): int(v) for k, v in zip(*np.unique([ann[int(r)]["known"] for r in L], return_counts=True))}}}


# ---------------------------------------------------------------- metrics

def ranking(Yt: np.ndarray, S: np.ndarray, groups: np.ndarray, lists: bool = True) -> tuple[dict, dict]:
    ev = M.evaluate(Yt, S, k=10, labels=DESCRIPTORS)
    pa = ev["per_album"]
    per = {"cP@10": pa["capped_precision"], "P@10": pa["precision"], "nDCG@10": pa["ndcg"],
           "perfect@10": (pa["capped_precision"] == 1).astype(float)}
    out = {"n": int(len(Yt)), "cP@10": ev["cP@10"], "P@10": ev["precision@10"], "R@10": ev["recall@10"], "nDCG@10": ev["ndcg@10"],
           "mAP": ev["mAP"], "mAP_labels_skipped": ev["mAP_skipped"], "macro_auc": ev["macro_auc"], "auc_labels_skipped": ev["auc_skipped"],
           "perfect@10": ev["perfect@10"], "se_cP@10": X.group_boot_se(per["cP@10"], groups), "se_nDCG@10": X.group_boot_se(per["nDCG@10"], groups)}
    if lists:
        out["best_auc"], out["worst_auc"] = ev["best_auc"], ev["worst_auc"]
    return out, per


def brief(Yt: np.ndarray, S: np.ndarray, groups: np.ndarray) -> dict:
    if len(Yt) < 5:
        return {"n": int(len(Yt))}
    r, _ = ranking(Yt, S, groups, lists=False)
    return {k: r[k] for k in ("n", "cP@10", "P@10", "nDCG@10", "mAP", "perfect@10", "se_cP@10", "se_nDCG@10")}


def downstream_block(W: np.ndarray, rows: np.ndarray) -> dict:
    import recq
    from downstream import downstream_eval

    d = downstream_eval(W, rows, stops=DS_STOPS, isolated=True)
    out = {"n_eval": d["n_eval"], "n_skipped_not_in_catalogue": d["n_skipped_not_in_catalogue"], "mean_n_pred": d["mean_n_pred"],
           "mean_l2": float(np.linalg.norm(W, axis=1).mean()), "stops": {}}
    for stop, s in d["stops"].items():
        i = s["inbound"]
        out["stops"][stop] = {"overlap@10_mean": s["overlap"]["mean"], "overlap@10_median": s["overlap"]["median"],
                              "overlap@10_isolated_mean": s["overlap_isolated"]["mean"],
                              "overlap@10_isolated_median": s["overlap_isolated"]["median"],
                              "inbound_before_total": i["before_total"], "inbound_after_total": i["after_total"],
                              "inbound_before_mean": i["before_mean"], "inbound_after_mean": i["after_mean"],
                              "zero_inbound_before": i["before_share_zero"], "zero_inbound_after": i["after_share_zero"]}
    r = recq.evaluate(W, rows, all_at_once=False)
    for stop in X.STOPS:
        out["stops"][stop]["recq"] = {k: r["stops"][stop].get(k) for k in X.REC_KEYS}
    return out


def evaluate_split(C: dict, frozen: dict, model: dict) -> dict:
    from exp_fusion import MOOD_COLS

    groups_all = H.artist_groups()
    const = rec_const()
    sus_l, sus_a = label_suspect_rows(), audio_suspect_rows()["any"]
    out: dict = {"split": C["split"], "info": C["info"], "systems": {}, "references": {}}
    pol_fns = X.rec_policies("prob", const)
    per_llm: dict[str, dict] = {}
    for name in ["llm"] + [s for s in SYSTEMS if s != "llm"]:
        rows_s, S_all = C["scores"][name]
        ent: dict = {}
        for set_name in SETS_OF[name]:
            rows = C["sets"][set_name]
            S = np.asarray(S_all[np.searchsorted(rows_s, rows)], dtype=np.float64)
            assert np.array_equal(rows_s[np.searchsorted(rows_s, rows)], rows)
            Yt, g = Y[rows].astype(np.float64), groups_all[rows]
            r, per = ranking(Yt, S, g)
            d: dict = {"ranking": r}
            if name == "llm":
                per_llm[set_name] = per
            elif set_name in per_llm:
                d["paired_diff_vs_llm"] = X.paired(per, per_llm[set_name], g)
            ex = {}
            for label, bad in (("without_label_suspects", sus_l), ("without_audio_suspects", sus_a),
                               ("without_both", np.union1d(sus_l, sus_a))):
                keep = ~np.isin(rows, bad)
                ex[label] = {"n_removed": int((~keep).sum()), **brief(Yt[keep], S[keep], g[keep])}
            d["excluding_suspects"] = ex
            if name in frozen:
                rt, St = frozen[name]
                Ytr = Y[rt].astype(np.float64)
                d["precision_coverage"] = {"n_train_rows_for_thresholds": int(len(rt)), "all_120": X.honest_pc(Ytr, St, Yt, S),
                                           "mood_114": X.honest_pc(Ytr, St, Yt, S, MOOD_COLS)}
                thr = calibrate_threshold(St, const["target_count"])
                sm = M.evaluate_sets(Yt, scores_to_weights(S, threshold=thr))
                d["calibrated_count_set"] = {"threshold_from_train": thr, "train_mean_count": const["target_count"],
                                             **{k: sm[k] for k in ("precision", "recall", "f1", "jaccard", "micro_precision",
                                                                   "micro_recall", "mean_n_pred", "mean_n_true")}}
            pols = {"top-10 (default)": scores_to_weights(S, k=10)}
            if name in HUB_OK and HUB_OK[name] != "top-10 (default)":
                rp, P_all = C["proba"][name]
                P = np.asarray(P_all[np.searchsorted(rp, rows)], dtype=np.float64)
                pols[HUB_OK[name]] = pol_fns[HUB_OK[name]](S, P, None)
            d["downstream"] = {"hub_ok_policy_selected_on_train": HUB_OK.get(name, "top-10 (default)"),
                               "policies": {label: downstream_block(W, rows) for label, W in pols.items()}}
            ent[set_name] = d
        out["systems"][name] = ent
        print(f"[final_eval:{C['split']}] {name}: " + "; ".join(
            f"{s} n={e['ranking']['n']} cP@10 {e['ranking']['cP@10']:.4f} nDCG@10 {e['ranking']['nDCG@10']:.4f}" for s, e in ent.items()), flush=True)
    for set_name, rows in C["sets"].items():
        Yt = Y64[rows]
        out["references"][set_name] = {
            "true set+order, train rank weights (ceiling)": downstream_block(scores_to_weights(Yt, threshold=1e-9, rank_weights=train_rank_weights()), rows),
            "all zeros (audio features only)": downstream_block(np.zeros_like(Yt), rows)}
    # LLM-specific tables
    ann = C["ann"]
    out["llm_first_k_words"] = {}
    for set_name in ("L", "LA"):
        rows = C["sets"][set_name]
        anns = [ann[int(r)] for r in rows]
        out["llm_first_k_words"][set_name] = {"all_120": X.first_k_precision(anns, Y[rows]),
                                              "mood_114": X.first_k_precision(anns, Y[rows], MOOD_COLS)}
    rows = C["sets"]["L"]
    known = np.array([ann[int(r)]["known"] for r in rows])
    q = np.quantile(rows, [0.25, 0.5, 0.75])
    masks = {"known=2": known >= 2, "known<2": known < 2,
             "chart quartile 1 (lowest row index)": rows <= q[0], "chart quartile 2": (rows > q[0]) & (rows <= q[1]),
             "chart quartile 3": (rows > q[1]) & (rows <= q[2]), "chart quartile 4 (highest row index)": rows > q[2]}
    try:
        import meta_features as MF

        years = MF.load_source("musicbrainz")["year"]
        def _year(r: int) -> float:
            try:
                return float(years.get(int(r), np.nan))
            except (TypeError, ValueError):
                return float("nan")

        yr = np.array([_year(r) for r in rows], dtype=float)
        yr[~((yr >= 1850) & (yr <= 2100))] = np.nan
        for label, lo, hi in YEAR_BUCKETS:
            masks[f"year {label}"] = (yr >= lo) & (yr <= hi)
        masks["year unknown"] = ~np.isfinite(yr)
        out["year_source"] = "cache/musicbrainz.parquet `year` (first release year)"
    except Exception as e:  # noqa: BLE001
        out["year_source"] = f"unavailable: {e!r}"
    out["breakdowns_on_L"] = {}
    for name in ("llm", "llm+tags_F3", "tags", "most_frequent"):
        rs, S_all = C["scores"][name]
        S = np.asarray(S_all[np.searchsorted(rs, rows)], dtype=np.float64)
        out["breakdowns_on_L"][name] = {label: brief(Y[rows][m].astype(np.float64), S[m], groups_all[rows][m]) for label, m in masks.items()}
    return out


# ---------------------------------------------------------------- commands

def cmd_freeze(a) -> None:
    assert not F.test_allowed(), "run `freeze` without DESCRIPTOR_FINAL_TEST"
    assert not (OUT_DIR / "final_test.json").exists(), "the test run already exists: nothing may be re-frozen after it"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    model = X.load_model()
    tr = frozen_train_scores(model)
    save_frozen(tr)
    C = collect("val", model)
    # the pipeline used for test must reproduce the stored validation scores exactly
    checks = {}
    za, zm = np.load(X.WORK / f"audio_{model['audio_key']}.npz"), np.load(X.WORK / "meta.npz")
    A = C["sets"]["A"]
    checks["audio vs saved val scores"] = float(np.abs(C["scores"]["audio"][1] - za["S_val"][np.searchsorted(za["rows_val"], A)]).max())
    checks["tags vs saved val scores"] = float(np.abs(C["scores"]["tags"][1] - zm["S_val"][np.searchsorted(zm["rows_val"], C["rows_all"])]).max())
    Sf, rf = H.load_scores("fusion63__best", "val")
    LA = C["sets"]["LA"]
    checks["fusion_F3 vs registered fusion63__best"] = float(np.abs(C["scores"]["fusion_F3"][1] - Sf[np.searchsorted(rf, LA)]).max())
    Sl, rl = H.load_scores(REGISTERED["llm"], "val")
    both = np.intersect1d(rl, C["sets"]["L"])
    checks["llm vs registered run"] = float(np.abs(C["scores"]["llm"][1][np.searchsorted(C["sets"]["L"], both)] - Sl[np.searchsorted(rl, both)]).max())
    print(f"[freeze] reproduction checks on val (max abs score difference): {checks}", flush=True)
    assert checks["audio vs saved val scores"] < 1e-4 and checks["tags vs saved val scores"] < 1e-4
    assert checks["llm vs registered run"] < 1e-5
    assert checks["fusion_F3 vs registered fusion63__best"] < 1e-3      # the registered scores are stored as float32 around 1000
    val = evaluate_split(C, tr, model)
    val["reproduction_checks_max_abs_diff"] = checks
    (OUT_DIR / "val_reference.json").write_text(json.dumps(H._jsonable(val), indent=1, ensure_ascii=False) + "\n")
    const = rec_const()
    files = {"cache/models/llm_fusion63.pkl": X.MODEL_PATH, f"cache/llm_fusion/audio_{model['audio_key']}.npz": X.WORK / f"audio_{model['audio_key']}.npz",
             "cache/llm_fusion/meta.npz": X.WORK / "meta.npz", "cache/llm_fusion/frozen_train_scores.npz": FROZEN_SCORES,
             "exp_llm_fusion.py": HERE / "exp_llm_fusion.py", "final_eval.py": HERE / "final_eval.py"}
    S = json.loads(X.OUT.read_text())
    sub = model["sub"]
    lines = ["# Frozen systems for the single test evaluation", "",
             f"Written {time.strftime('%Y-%m-%d %H:%M:%S')} by `final_eval.py freeze`, BEFORE any test row was read. Nothing below may be "
             "re-fitted, re-selected or re-tuned after the test numbers exist.", "",
             f"Snapshot: `DESCRIPTOR_SHARD_LIMIT={os.environ.get(F.SHARD_LIMIT_ENV)}` ({F.n_shards()} shards). All fitting on TRAIN "
             "(cross-fit / out-of-fold); selection by cross-fitted train nDCG@10; validation only reported.", "",
             "## Files (sha256, first 16 hex)", ""]
    lines += [f"- `{k}`: `{sha(p)}`" for k, p in files.items()]
    lines += ["", "## Systems", "",
              "| system | definition | fitted parameters | evaluated on |", "|---|---|---|---|",
              "| most_frequent | train prevalence (all 2,869 train rows, label-suspects dropped) | - | L, A |",
              "| genre_mean | `baselines.genre_mean_scores`, all listed RYM genres, shrinkage m=5, full train (REFERENCE ONLY: scraped genres) | - | L, A |",
              f"| tags | `{X.META_NAME}`: logistic probe on MusicBrainz + Deezer tags, descriptor-literal tags dropped | C={S['meta']['C']}, transform "
              f"`{S['meta']['transform']}`, {S['meta']['n_features']} features, {S['meta']['n_train_fit']} train rows | L, A |",
              f"| audio | `audio63__{model['audio_key']}`: logistic probe on z-scored `{'+'.join(b[0] for b in X.AUDIO_SPECS[model['audio_key']])}` (mean pooling) | "
              f"C={S['audio'][model['audio_key']]['C']}, {S['audio'][model['audio_key']]['n_train']} train rows | A, LA |",
              f"| audio+tags | fallback `{sub['am']['method']}` (global logistic stacker on z(audio logit), z(tag logit), prior logit, 1) | W = "
              f"{np.asarray(sub['am']['params']['W_global']).round(4).tolist()}, {sub['am']['n_train']} train rows | A, LA |",
              f"| llm | `{model['llm_model']}` annotations, score 2 - 0.05 x list position, unlisted words by train prevalence | none | L, LA |",
              f"| llm+tags_F3 | `{sub['lm']['method']}`: LLM words first, re-ordered by rs + c x z(tag logit); rest filled by z(tag logit) | "
              f"c={sub['lm']['params']['c']}, {sub['lm']['n_train']} train rows | L (, LA) |",
              f"| fusion_F3 | `fusion63__best` = `{sub['lam']['method']}`: LLM words first, re-ordered by rs + b x z(audio logit) + c x z(tag logit); rest filled by "
              f"z(audio) + cf x z(tags) | b={sub['lam']['params']['b']}, c={sub['lam']['params']['c']}, cf={sub['lam']['params']['cf']}, "
              f"{sub['lam']['n_train']} train rows | LA |", "",
              f"Normalisation constants (train OOF): audio logit mean {model['norm']['a_mu']:.4f} sd {model['norm']['a_sd']:.4f}; "
              f"tag logit mean {model['norm']['m_mu']:.4f} sd {model['norm']['m_sd']:.4f}.", "",
              "Row sets: L = rows with an LLM annotation (test: the 360 annotated rows, 6 of 10 random batches); A = rows with audio features at this "
              "snapshot; LA = both.", "",
              "## Thresholds and policies (all from TRAIN)", "",
              f"- Precision-coverage thresholds: `exp_llm_fusion.honest_pc` on the train scores stored in `{FROZEN_SCORES.name}` "
              "(count-matched for ~1, 2, 3, 5, 8, 10 per album; lowest threshold with train precision >= 0.9 / 0.8, min 25 % of albums x 1 emitted). "
              "genre_mean has no out-of-fold train scores: no threshold tables for it.",
              f"- Calibrated-count set: global threshold giving the train mean count ({const['target_count']:.3f}) on the same train scores: "
              + ", ".join(f"{k} {calibrate_threshold(v[1], const['target_count']):.4f}" for k, v in tr.items()) + ".",
              f"- Recommender vector policies (hub-ok choice on train, `exp_llm_fusion.py recs`): " + "; ".join(f"{k} -> {v}" for k, v in HUB_OK.items())
              + f"; every system is also reported with plain top-10 rank weights. Dense top-10 = top 10 of p x mean train weight, scaled to the train median "
              f"L2 norm {const['median_norm']:.4f}; p = the audio probe's probability, or the fusion's stored Platt map {json.dumps(sub['lam']['platt'])}.", "",
              "## Validation numbers these systems were selected / reported with (this script's val pass; full detail in `val_reference.json`)", "",
              "| system | set | n | cP@10 | P@10 | R@10 | nDCG@10 | mAP | macro AUC | perfect@10 |", "|---|---|---|---|---|---|---|---|---|---|"]
    for name in SYSTEMS:
        for set_name, e in val["systems"][name].items():
            r = e["ranking"]
            lines.append(f"| {name} | {set_name} | {r['n']} | {r['cP@10']:.4f} | {r['P@10']:.4f} | {r['R@10']:.4f} | {r['nDCG@10']:.4f} | {r['mAP']:.4f} | "
                         f"{r['macro_auc']:.4f} | {r['perfect@10']:.4f} |")
    lines += ["", f"Val sets: {val['info']}", "", f"Selection record (`results/llm_fusion_summary.json`): `{json.dumps(S['selection'])}`", "",
              f"Reproduction checks of this pipeline against the stored val scores (max abs difference): `{json.dumps(checks)}`", "",
              "## Test protocol", "",
              "One run of `DESCRIPTOR_FINAL_TEST=1 final_eval.py test`: one `harness.TestAccess`, a line for the script in `results/test_invocations.log`, "
              "then one `harness.final_test` call for each registered run (" + ", ".join(f"`{v or 'audio63__' + model['audio_key']}`" for v in REGISTERED.values())
              + "). If anything fails, stop and report; no fix-and-rerun.", ""]
    (OUT_DIR / "FROZEN.md").write_text("\n".join(lines))
    print(f"[freeze] wrote {OUT_DIR / 'FROZEN.md'} and val_reference.json in {time.perf_counter() - t0:.0f}s, peak RSS {X._rss_mb():.0f} MB")


def cmd_test(a) -> None:
    assert (OUT_DIR / "FROZEN.md").exists(), "run `final_eval.py freeze` first"
    assert not (OUT_DIR / "final_test.json").exists(), "the test evaluation has already been run (results/test/final_test.json exists)"
    F.require_test_env("final_eval.py test")
    t0 = time.perf_counter()
    H._log_test("final_eval.py (script: direct metric functions on test subsets L / A / LA)", "STARTED")
    model = X.load_model()
    frozen = load_frozen()
    C = collect("test", model)
    print(f"[test] sets: {C['info']}; annotation files: {C['ann_stats']}", flush=True)
    out = evaluate_split(C, frozen, model)
    out["annotation_stats"] = C["ann_stats"]
    out["seconds"] = round(time.perf_counter() - t0, 1)
    (OUT_DIR / "final_test.json").write_text(json.dumps(H._jsonable(out), indent=1, ensure_ascii=False) + "\n")
    H._log_test("final_eval.py (script: direct metric functions on test subsets L / A / LA)", f"DONE n_L={C['info']['n_L']} n_A={C['info']['n_A']} n_LA={C['info']['n_LA']}")
    # the harness's own record for the registered runs (val-chosen thresholds; canonical rows = test rows with audio)
    can, A, LA = C["canonical"], C["sets"]["A"], C["sets"]["LA"]
    fill = YB[np.load(X.WORK / f"audio_{model['audio_key']}.npz")["rows_train"]].mean(0)
    calls = []

    def run(name: str, rows_s: np.ndarray, S: np.ndarray, rows: np.ndarray, strict: bool, note: str) -> None:
        Sx = np.asarray(S[np.searchsorted(rows_s, rows)], dtype=np.float64)
        res = H.final_test(name, lambda access: (Sx, rows), strict=strict, notes=note,
                           config={"frozen": "results/test/FROZEN.md", "rows": note, "n": int(len(rows))})
        r = res["metrics"]["ranking"]
        calls.append({"name": name, "n_test": int(len(rows)), "strict": strict, "rows": note, "cP@10": r["cP@10"], "nDCG@10": r["ndcg@10"]})
        print(f"[test] harness.final_test {name}: n {len(rows)} cP@10 {r['cP@10']:.4f} nDCG@10 {r['ndcg@10']:.4f}", flush=True)

    for sysname in ("most_frequent", "genre_mean", "tags"):
        rs, S = C["scores"][sysname]
        run(REGISTERED[sysname], rs, S, can, True, "all test rows with audio (canonical)")
    rs, S = C["scores"]["audio"]
    if len(np.setdiff1d(can, A)):
        S, rs = H.complete_scores(S, rs, fill=fill, rows_all=can)
    run(f"audio63__{model['audio_key']}", rs, S, can, True, "all test rows with audio (canonical); rows without probe features get the train prevalence")
    rs, S = C["scores"]["llm"]
    run(REGISTERED["llm"], rs, S, LA, False, "LA = test rows with an LLM annotation and audio (subset: strict=False)")
    rs, S = C["scores"]["fusion_F3"]
    run(REGISTERED["fusion_F3"], rs, S, LA, False, "LA = test rows with an LLM annotation and audio (subset: strict=False)")
    out["harness_final_test_calls"] = calls
    out["seconds"] = round(time.perf_counter() - t0, 1)
    out["peak_rss_mb"] = round(X._rss_mb())
    (OUT_DIR / "final_test.json").write_text(json.dumps(H._jsonable(out), indent=1, ensure_ascii=False) + "\n")
    print(f"[test] done in {out['seconds']}s, peak RSS {X._rss_mb():.0f} MB; wrote {OUT_DIR / 'final_test.json'}")


# ---------------------------------------------------------------- report

SET_LABEL = {"val": {"L": "V601 (all val, LLM)", "A": "Vaudio", "LA": "Vaudio+LLM"}, "test": {"L": "T360", "A": "Taudio", "LA": "T360a"}}


def _f(x, nd: int = 3) -> str:
    return "-" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:.{nd}f}"


def cmd_report(a) -> None:
    val = json.loads((OUT_DIR / "val_reference.json").read_text())
    test = json.loads((OUT_DIR / "final_test.json").read_text())
    md: list[str] = ["# Final test evaluation of the frozen descriptor predictors", "",
                     f"Systems and thresholds: `FROZEN.md`. Test sets: {test['info']}. Val sets: {val['info']}.", "",
                     "± = bootstrap SE over artist groups. Val columns are the same pipeline on validation (L = all 601 val rows; A = LA = 230).", "",
                     "## 1. Ranking metrics", "",
                     "| system | set | n | cP@10 ±SE | P@10 | R@10 | nDCG@10 ±SE | mAP (labels skipped) | macro AUC (skipped) | perfect@10 | val cP@10 | val nDCG@10 | val mAP | Δ test−val cP@10 |",
                     "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for name in SYSTEMS:
        for s, e in test["systems"][name].items():
            r, v = e["ranking"], val["systems"][name][s]["ranking"]
            md.append(f"| {name} | {SET_LABEL['test'][s]} | {r['n']} | {_f(r['cP@10'])} ±{_f(r['se_cP@10'])} | {_f(r['P@10'])} | {_f(r['R@10'])} | "
                      f"{_f(r['nDCG@10'])} ±{_f(r['se_nDCG@10'])} | {_f(r['mAP'])} ({r['mAP_labels_skipped']}) | {_f(r['macro_auc'])} ({r['auc_labels_skipped']}) | "
                      f"{_f(r['perfect@10'])} | {_f(v['cP@10'])} (n={v['n']}) | {_f(v['nDCG@10'])} | {_f(v['mAP'])} | {r['cP@10'] - v['cP@10']:+.3f} |")
    md += ["", "### Paired differences vs LLM alone (same rows)", "", "| system | set | ΔcP@10 | ΔP@10 | ΔnDCG@10 | Δperfect@10 | val ΔcP@10 | val ΔnDCG@10 |",
           "|---|---|---|---|---|---|---|---|"]
    pm = lambda d: f"{d['diff']:+.3f} ±{_f(d['se'])}"  # noqa: E731
    for name in SYSTEMS:
        for s, e in test["systems"][name].items():
            if "paired_diff_vs_llm" in e:
                p, pv = e["paired_diff_vs_llm"], val["systems"][name][s].get("paired_diff_vs_llm")
                md.append(f"| {name} | {SET_LABEL['test'][s]} | {pm(p['cP@10'])} | {pm(p['P@10'])} | {pm(p['nDCG@10'])} | {pm(p['perfect@10'])} | "
                          f"{pm(pv['cP@10']) if pv else '-'} | {pm(pv['nDCG@10']) if pv else '-'} |")
    md += ["", "## 2. Per-label AUC: best and worst 15 descriptors (label, AUC, positives in the set)", "",
           "The raw LLM scores are tied for every unlisted word (AUC counts ties as 0.5), so the LLM's per-label ordering is also given through the "
           "fused LLM+tags F3 scores, which order every album.", ""]
    for name, s in (("audio", "A"), ("llm", "L"), ("llm+tags_F3", "L"), ("fusion_F3", "LA")):
        r = test["systems"][name][s]["ranking"]
        md += [f"**{name}** on {SET_LABEL['test'][s]} (macro AUC {_f(r['macro_auc'])})", "",
               "- best: " + "; ".join(f"{l} {a_:.3f} ({n})" for l, a_, n in r["best_auc"]),
               "- worst: " + "; ".join(f"{l} {a_:.3f} ({n})" for l, a_, n in r["worst_auc"]), ""]
    md += ["## 3. Precision-coverage, thresholds chosen on TRAIN", "",
           "Cells: test precision (realised descriptors per album). Last columns: descriptors per album at the train-chosen threshold for precision "
           ">= 0.9 / 0.8 (test precision reached); val in brackets.", ""]
    for cols in ("all_120", "mood_114"):
        md += [f"### {cols}", "", "| system | set | " + " | ".join(f"@{c}" for c in X.COUNTS) + " | count@p>=0.9 | count@p>=0.8 | val count@p>=0.9 | val count@p>=0.8 |",
               "|---|---|" + "---|" * (len(X.COUNTS) + 4)]
        for name in SYSTEMS:
            for s, e in test["systems"][name].items():
                if "precision_coverage" not in e:
                    continue
                pc, pv = e["precision_coverage"][cols], val["systems"][name][s]["precision_coverage"][cols]
                cells = [f"{_f(q['val_precision'])} ({q['val_count']:.1f})" for q in pc["counts"]]
                tg = [f"{pc['targets'][t]['val_count']:.2f} (p={_f(pc['targets'][t]['val_precision'], 2)})" for t in ("0.90", "0.80")]
                tv = [f"{pv['targets'][t]['val_count']:.2f} (p={_f(pv['targets'][t]['val_precision'], 2)})" for t in ("0.90", "0.80")]
                md.append(f"| {name} | {SET_LABEL['test'][s]} | " + " | ".join(cells) + " | " + " | ".join(tg) + " | " + " | ".join(tv) + " |")
        md.append("")
    md += ["### Precision of the LLM's first k words", "", "| set | labels | " + " | ".join(f"k={k}" for k in range(1, 11)) + " | whole list (words) |",
           "|---|---|" + "---|" * 11]
    for split, J in (("test", test), ("val", val)):
        for s in ("L", "LA"):
            for cols in ("all_120", "mood_114"):
                fk = J["llm_first_k_words"][s][cols]
                md.append(f"| {SET_LABEL[split][s]} | {cols} | " + " | ".join(_f(fk[str(k)]["precision"]) for k in range(1, 11))
                          + f" | {_f(fk['all']['precision'])} ({fk['all']['avg_count']:.1f}) |")
    md += ["", "## 4. Calibrated-count set (global threshold giving the train mean count on train scores)", "",
           "| system | set | mean n predicted | precision | recall | Jaccard | micro precision | micro recall | val precision | val recall | val Jaccard |",
           "|---|---|---|---|---|---|---|---|---|---|---|"]
    for name in SYSTEMS:
        for s, e in test["systems"][name].items():
            if "calibrated_count_set" in e:
                c, cv = e["calibrated_count_set"], val["systems"][name][s]["calibrated_count_set"]
                md.append(f"| {name} | {SET_LABEL['test'][s]} | {c['mean_n_pred']:.2f} | {_f(c['precision'])} | {_f(c['recall'])} | {_f(c['jaccard'])} | "
                          f"{_f(c['micro_precision'])} | {_f(c['micro_recall'])} | {_f(cv['precision'])} | {_f(cv['recall'])} | {_f(cv['jaccard'])} |")
    md += ["", "## 5. Downstream: test albums' descriptors replaced by predictions, rest of the catalogue real", "",
           "overlap@10 = share of an album's new top-10 that is in its real-descriptor top-10 (all evaluated albums replaced at once: mean / median; iso = each "
           "album replaced alone). inbound = appearances of the evaluated albums in other albums' lists, before -> after (total; mean per album; share with zero). "
           "RSQ / R→50 / inb = recq isolated metrics; genre = genre-family agreement of the list. `*` = the system's hub-ok policy chosen on train.", ""]
    for stop in DS_STOPS:
        md += [f"### {stop}", "", "| system / policy | set | n | overlap@10 mean | median | iso mean | inbound total | mean | zero share | RSQ | R→50 | inb ratio | genre | val overlap@10 | val RSQ |",
               "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]

        def row(label: str, s: str, d: dict, dv: dict | None) -> str:
            x = d["stops"][stop]
            q = x.get("recq", {})
            xv = dv["stops"][stop] if dv else None
            return (f"| {label} | {SET_LABEL['test'][s]} | {d['n_eval']} | {_f(x['overlap@10_mean'])} | {_f(x['overlap@10_median'], 2)} | {_f(x['overlap@10_isolated_mean'])} | "
                    f"{x['inbound_before_total']} → {x['inbound_after_total']} | {x['inbound_before_mean']:.2f} → {x['inbound_after_mean']:.2f} | "
                    f"{_f(x['zero_inbound_before'])} → {_f(x['zero_inbound_after'])} | {_f(q.get('RSQ'))} | {_f(q.get('R50'))} | {_f(q.get('inb_ratio_iso'), 2)} | {_f(q.get('genre'))} | "
                    f"{_f(xv['overlap@10_mean']) if xv else '-'} | {_f(xv.get('recq', {}).get('RSQ')) if xv else '-'} |")

        for s in ("L", "A", "LA"):
            for ref, d in test["references"][s].items():
                md.append(row("ref: " + ref, s, d, val["references"][s].get(ref)))
        for name in SYSTEMS:
            for s, e in test["systems"][name].items():
                for pol, d in e["downstream"]["policies"].items():
                    star = "*" if pol == e["downstream"]["hub_ok_policy_selected_on_train"] else ""
                    md.append(row(f"{name} / {pol}{star}", s, d, val["systems"][name][s]["downstream"]["policies"].get(pol)))
        md.append("")
    md += ["## 6. Headline numbers without suspect rows", "",
           "| system | set | all rows cP@10 / nDCG@10 | without label-suspect rows (removed) | without audio-suspect rows (removed) | without both (removed) |", "|---|---|---|---|---|---|"]
    for name in SYSTEMS:
        for s, e in test["systems"][name].items():
            r, ex = e["ranking"], e["excluding_suspects"]
            cell = lambda d: f"{_f(d.get('cP@10'))} / {_f(d.get('nDCG@10'))} ({d['n_removed']})"  # noqa: E731
            md.append(f"| {name} | {SET_LABEL['test'][s]} | {_f(r['cP@10'])} / {_f(r['nDCG@10'])} | {cell(ex['without_label_suspects'])} | "
                      f"{cell(ex['without_audio_suspects'])} | {cell(ex['without_both'])} |")
    md += ["", f"## 7. Breakdowns on the LLM-annotated test rows (year: {test.get('year_source')})", "",
           "| group | n | LLM cP@10 ±SE | LLM nDCG@10 | LLM+tags F3 cP@10 | tags cP@10 | most-frequent cP@10 | val: n / LLM cP@10 |", "|---|---|---|---|---|---|---|---|"]
    B, Bv = test["breakdowns_on_L"], val["breakdowns_on_L"]
    for g, d in B["llm"].items():
        v = Bv["llm"].get(g, {})
        md.append(f"| {g} | {d['n']} | {_f(d.get('cP@10'))} ±{_f(d.get('se_cP@10'))} | {_f(d.get('nDCG@10'))} | {_f(B['llm+tags_F3'][g].get('cP@10'))} | "
                  f"{_f(B['tags'][g].get('cP@10'))} | {_f(B['most_frequent'][g].get('cP@10'))} | {v.get('n', '-')} / {_f(v.get('cP@10'))} |")
    if "harness_final_test_calls" in test:
        md += ["", "## harness.final_test calls (the harness's own results/test/<name>.json, val-chosen thresholds)", "",
               "| run | rows | n | cP@10 | nDCG@10 |", "|---|---|---|---|---|"]
        md += [f"| {c['name']} | {c['rows']} | {c['n_test']} | {_f(c['cP@10'], 4)} | {_f(c['nDCG@10'], 4)} |" for c in test["harness_final_test_calls"]]
    (OUT_DIR / "final_test.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["freeze", "test", "report"])
    a = ap.parse_args()
    {"freeze": cmd_freeze, "test": cmd_test, "report": cmd_report}[a.command](a)


if __name__ == "__main__":
    main()
