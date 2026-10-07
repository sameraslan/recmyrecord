"""The numbers of store_effect_fix.py: reads cache/store_effect_fix.sqlite (read-only) and writes
results/store_effect_fix.json; store_effect_md.py turns that into the markdown. numpy, scipy, scikit-learn.
See store_effect_fix.py for how to run it and results/store_effect_fix.md for what each number means.
"""
import json
import sqlite3
import sys
import warnings
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

import store_effect_dsp as dsp

HERE = Path(__file__).resolve().parent
DB = HERE / "cache" / "store_effect_fix.sqlite"
RESULTS = HERE / "results"
K = 10
C_PROBE = 0.01  # as source_effect.py
FOLDS = 5  # album-grouped
STORES = ("deezer", "itunes")


# --- loading -----------------------------------------------------------------------------------------

def load() -> dict:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=120)
    d = {"albums": {k: json.loads(v) for k, v in con.execute("SELECT key, info FROM album")},
         "pairs": {(k, u): json.loads(v) for k, u, v in con.execute("SELECT key, unit, info FROM pair")},
         "yt": {k: json.loads(v) for k, v in con.execute("SELECT key, info FROM yt")},
         "meta": dict(con.execute("SELECT k, v FROM meta")), "emb": defaultdict(dict), "meas": {}}
    for kind, key, unit, store, variant, vec in con.execute("SELECT kind, key, unit, store, variant, vec FROM emb"):
        d["emb"][(kind, variant)][(key, unit, store)] = np.frombuffer(vec, "<f4").astype(np.float64)
    for kind, key, unit, store, info, spec, mel in con.execute("SELECT kind, key, unit, store, info, spec, mel FROM meas"):
        d["meas"][(kind, key, unit, store)] = (json.loads(info), np.frombuffer(spec, "<f4"), np.frombuffer(mel, "<f4"))
    con.close()
    return d


def unit(X: np.ndarray) -> np.ndarray:
    return X / np.maximum(np.linalg.norm(X, axis=1, keepdims=True), 1e-12)


def matrices(d: dict, kind: str, variant: str, units: list, variant_itunes: str | None = None):
    e, e2 = d["emb"][(kind, variant)], d["emb"][(kind, variant_itunes or variant)]
    return (unit(np.stack([e[(k, u, "deezer")] for k, u in units])), unit(np.stack([e2[(k, u, "itunes")] for k, u in units])))


def r(x, n=4):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


# --- measures ----------------------------------------------------------------------------------------

def cosines(D: np.ndarray, I: np.ndarray, alb: np.ndarray, rng: np.random.Generator) -> dict:
    n = len(D)
    x, dd, ii = D @ I.T, D @ D.T, I @ I.T
    same_alb, off = alb[:, None] == alb[None, :], ~np.eye(n, dtype=bool)
    same = np.diag(x)
    within_album = np.concatenate([dd[same_alb & off], ii[same_alb & off]])
    out = {"n_pairs": n, "same_track_cross_store": r(same.mean()), "same_track_cross_store_median": r(np.median(same)),
           "same_track_cross_store_p10": r(np.quantile(same, 0.1)),
           "other_track_same_album_same_store": r(within_album.mean()), "other_track_same_album_cross_store": r(x[same_alb & off].mean()),
           "other_album_same_store": r(np.concatenate([dd[~same_alb], ii[~same_alb]]).mean()), "other_album_cross_store": r(x[~same_alb].mean())}
    out["gap"] = r(out["same_track_cross_store"] - out["other_track_same_album_same_store"])
    out["store_cost_other_album"] = r(out["other_album_same_store"] - out["other_album_cross_store"])
    # album bootstrap of the same-track mean
    albums = np.unique(alb)
    by = {a: same[alb == a] for a in albums}
    boots = [np.concatenate([by[a] for a in rng.choice(albums, len(albums))]).mean() for _ in range(500)]
    out["same_track_ci95"] = [r(np.quantile(boots, 0.025)), r(np.quantile(boots, 0.975))]
    return out


def probe(X: np.ndarray, y: np.ndarray, groups: np.ndarray) -> tuple[dict, np.ndarray]:
    """Grouped out-of-fold logistic probe, as source_effect.py's (standardised on the training fold, C 0.01)."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import StratifiedGroupKFold
    from sklearn.preprocessing import StandardScaler

    scores, per = np.full(len(y), np.nan), []
    for tr, te in StratifiedGroupKFold(n_splits=FOLDS, shuffle=True, random_state=0).split(X, y, groups):
        sc = StandardScaler().fit(X[tr])
        clf = LogisticRegression(C=C_PROBE, max_iter=3000).fit(sc.transform(X[tr]), y[tr])
        scores[te] = clf.decision_function(sc.transform(X[te]))
        if len(set(y[te].tolist())) == 2:
            per.append(roc_auc_score(y[te], scores[te]))
    return {"auc": r(roc_auc_score(y, scores)), "fold_mean": r(np.mean(per)), "fold_sd": r(np.std(per)),
            "n_pos": int(y.sum()), "n_neg": int((1 - y).sum())}, scores


def store_probe(D: np.ndarray, I: np.ndarray, alb: np.ndarray) -> dict:
    n = len(D)
    out, s = probe(np.vstack([D, I]), np.r_[np.zeros(n, int), np.ones(n, int)], np.r_[alb, alb])
    diff = s[n:] - s[:n]
    sd = np.sqrt((s[:n].var() + s[n:].var()) / 2)
    return out | {"pairs_itunes_scored_higher": r(float((diff > 0).mean())), "paired_gap": r(diff.mean()),
                  "paired_gap_in_sd": r(diff.mean() / sd if sd > 0 else np.nan),
                  "paired_t": r(diff.mean() / (diff.std(ddof=1) / np.sqrt(n)), 2)}


def retrieval(D: np.ndarray, I: np.ndarray) -> dict:
    x = D @ I.T
    n = len(x)
    rank_d = (x > np.diag(x)[:, None]).sum(axis=1)  # a Deezer clip looking for its track among the iTunes clips
    rank_i = (x > np.diag(x)[None, :]).sum(axis=0)
    ranks = np.r_[rank_d, rank_i]
    return {"top1": r((ranks == 0).mean()), "top5": r((ranks < 5).mean()), "median_rank": r(np.median(ranks) + 1, 1), "candidates": n}


def cross_share(D: np.ndarray, I: np.ndarray, alb: np.ndarray) -> dict:
    """Share of each clip's ten nearest clips that come from the other store, in the pool of both stores'
    clips: with every other clip as a candidate, and with the clips of other albums only (as on the site,
    where an album is there once)."""
    n = len(D)
    Z = np.vstack([D, I])
    S = Z @ Z.T
    store, a2 = np.r_[np.zeros(n, int), np.ones(n, int)], np.r_[alb, alb]
    out = {}
    for name, banned in (("all", np.eye(2 * n, dtype=bool)), ("other_albums", a2[:, None] == a2[None, :])):
        s = np.where(banned, -np.inf, S)
        nn = np.argsort(-s, axis=1)[:, :K]
        cross = store[nn] != store[:, None]
        allowed = ~banned
        expected = ((store[None, :] != store[:, None]) & allowed).sum(axis=1) / allowed.sum(axis=1)
        out[name] = {"share": r(cross.mean()), "deezer_seeds": r(cross[:n].mean()), "itunes_seeds": r(cross[n:].mean()),
                     "expected": r(expected.mean())}
    return out


def music_info(X: np.ndarray, B: np.ndarray, alb: np.ndarray, fam: np.ndarray, genre: np.ndarray) -> dict:
    """Within one store: how much of the baseline's structure (B) the variant (X) keeps, and what its own
    neighbourhoods say about albums and genres."""
    from scipy.stats import spearmanr
    from sklearn.metrics import roc_auc_score

    n = len(X)
    S, SB = X @ X.T, B @ B.T
    iu = np.triu_indices(n, 1)
    same_alb = alb[:, None] == alb[None, :]
    eye = np.eye(n, dtype=bool)
    nn = np.argsort(-np.where(eye, -np.inf, S), axis=1)[:, :K]
    nb = np.argsort(-np.where(eye, -np.inf, SB), axis=1)[:, :K]
    overlap = np.mean([len(set(a) & set(b)) for a, b in zip(nn, nb)])
    other = np.argsort(-np.where(same_alb, -np.inf, S), axis=1)[:, :K]
    out = {"spearman_with_base": r(spearmanr(S[iu], SB[iu]).statistic), "overlap10_with_base": r(overlap, 2),
           "same_album_auc": r(roc_auc_score(same_alb[iu], S[iu])),
           "self_cosine_with_base": r(np.mean(np.sum(X * B, axis=1)))}
    for name, lab in (("family", fam), ("genre", genre)):
        known = lab != ""
        agree = (lab[other] == lab[:, None]) & known[:, None]
        chance = np.array([((lab == lab[i]) & ~same_alb[i]).sum() / (~same_alb[i]).sum() for i in range(n)])
        out[f"{name}_knn"] = r(agree[known].mean())
        out[f"{name}_chance"] = r(chance[known].mean())
    return out


def evaluate(d: dict, kind: str, variant: str, units: list, alb, fam, genre, rng, base=None, variant_itunes=None) -> dict:
    D, I = matrices(d, kind, variant, units, variant_itunes)
    out = {"cosine": cosines(D, I, alb, rng), "probe": store_probe(D, I, alb), "retrieval": retrieval(D, I),
           "neighbours": cross_share(D, I, alb)}
    if base is not None and variant_itunes is None:
        m = [music_info(X, B, alb, fam, genre) for X, B in zip((D, I), base)]
        out["music"] = {k: r(np.mean([x[k] for x in m])) for k in m[0]} | {"per_store": dict(zip(STORES, m))}
    return out


def centred(D: np.ndarray, I: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return unit(D - D.mean(axis=0)), unit(I - I.mean(axis=0))


def learned_map(D: np.ndarray, I: np.ndarray, alb: np.ndarray, lam: float | None) -> np.ndarray:
    """iTunes vectors moved towards their Deezer versions by a map fitted on the pairs of other albums
    (five album-grouped folds): the mean pair difference (lam None), or a ridge map of the difference on the
    iTunes vector. Returns the out-of-fold mapped iTunes vectors."""
    from sklearn.model_selection import GroupKFold

    out = np.zeros_like(I)
    for tr, te in GroupKFold(n_splits=FOLDS).split(I, groups=alb):
        if lam is None:
            out[te] = I[te] + (D[tr] - I[tr]).mean(axis=0)
        else:
            mu = I[tr].mean(axis=0)
            A = I[tr] - mu
            R = D[tr] - I[tr]
            W = np.linalg.solve(A.T @ A + lam * np.eye(A.shape[1]), A.T @ (R - R.mean(axis=0)))
            out[te] = I[te] + R.mean(axis=0) + (I[te] - mu) @ W
    return unit(out)


def short(res: dict) -> dict:
    return {"same_track": res["cosine"]["same_track_cross_store"], "auc": res["probe"]["auc"], "top1": res["retrieval"]["top1"],
            "share_other_albums": res["neighbours"]["other_albums"]["share"],
            "deezer_seeds": res["neighbours"]["other_albums"]["deezer_seeds"], "itunes_seeds": res["neighbours"]["other_albums"]["itunes_seeds"]}


# --- waveform diagnostics ----------------------------------------------------------------------------

def q(v, qs=(0.1, 0.5, 0.9)) -> list:
    v = np.asarray([x for x in v if x is not None], float)
    return [r(x, 2) for x in np.quantile(v, qs)] if len(v) else []


def mel_centres(meta: dict) -> np.ndarray:
    """Centre frequency of each of the model's mel bands, from the feature extractor's settings (Slaney's
    scale, which the `rand_trunc` path uses)."""
    def to_mel(f):
        f = np.asarray(f, float)
        return np.where(f < 1000, f * 3 / 200, 15 + np.log(np.maximum(f, 1e-9) / 1000) * 27 / np.log(6.4))

    def to_hz(m):
        m = np.asarray(m, float)
        return np.where(m < 15, m * 200 / 3, 1000 * np.exp((m - 15) * np.log(6.4) / 27))
    return to_hz(np.linspace(to_mel(meta["fmin"]), to_mel(meta["fmax"]), meta["n_mels"] + 2))[1:-1]


def diagnostics(d: dict, units: list) -> dict:
    out = {"stores": {}}
    info = {s: [d["meas"][("clip", k, u, s)][0] for k, u in units] for s in STORES}
    spec = {s: np.stack([d["meas"][("clip", k, u, s)][1] for k, u in units]) for s in STORES}
    for s in STORES:
        cut = [dsp.cutoff_hz(x) for x in spec[s]]
        p = 10 ** (spec[s] / 10)
        top = lambda lo: 10 * np.log10(np.maximum(p[:, int(lo / dsp.BAND_HZ):].sum(axis=1) / p.sum(axis=1), 1e-20))  # noqa: E731
        out["stores"][s] = {
            "n": len(units), "codec": dict(Counter(f"{i.get('codec')} {i.get('profile') or ''}".strip() for i in info[s])),
            "sample_rate": dict(Counter(str(i.get("sample_rate")) for i in info[s])),
            "channels": dict(Counter(str(i.get("n_channels")) for i in info[s])),
            "bit_rate_kbps_q10_50_90": q([float(i["bit_rate"]) / 1000 for i in info[s] if i.get("bit_rate")]),
            "decoded_seconds": dict(Counter(f"{i['seconds']:.2f}" for i in info[s]).most_common(4)),
            "bytes_q10_50_90": q([i["bytes"] for i in info[s]]),
            "cutoff_hz_q10_50_90": q(cut), "cutoff_hz_share_under_17k": r(np.mean(np.array(cut) < 17000)),
            "energy_above_16k_db_q10_50_90": q(top(16000)), "energy_above_12k_db_q10_50_90": q(top(12000)),
            "rms_db_q10_50_90": q([i["rms_db"] for i in info[s]]), "lufs_q10_50_90": q([i["lufs"] for i in info[s]]),
            "peak_db_q10_50_90": q([i["peak_db"] for i in info[s]]),
            "head_db_q10_50_90": q([i["head_db"] for i in info[s]]), "tail_db_q10_50_90": q([i["tail_db"] for i in info[s]]),
            "side_db_q10_50_90": q([i.get("side_db") for i in info[s]]),
            "mono_loss_db_q10_50_90": q([i.get("mono_loss_db") for i in info[s]])}
    paired = {}
    for name in ("lufs", "rms_db", "peak_db", "side_db", "mono_loss_db", "lr_corr", "seconds"):
        v = np.array([(b.get(name), a.get(name)) for a, b in zip(info["deezer"], info["itunes"])
                      if a.get(name) is not None and b.get(name) is not None], float)
        diff = v[:, 0] - v[:, 1]
        paired[name] = {"n": len(diff), "mean": r(diff.mean(), 3), "sd": r(diff.std(), 3), "q10_50_90": q(diff), "abs_median": r(np.median(np.abs(diff)), 3)}
    out["itunes_minus_deezer"] = paired
    return out


def alignment(d: dict, units: list) -> dict:
    al = [d["pairs"][u]["align"] for u in units]
    off = np.array([a["offset_s"] for a in al if a["offset_s"] is not None])
    ov = np.array([a["overlap_s"] for a in al if a["offset_s"] is not None])
    by_album = defaultdict(list)
    for (k, _), a in zip(units, al):
        if a["offset_s"] is not None:
            by_album[k].append(a["offset_s"])
    spread = [max(v) - min(v) for v in by_album.values() if len(v) > 1]
    return {"n": len(al), "found_by": dict(Counter(a["by"] for a in al)),
            "wave_ncc_q10_50_90": q([a["wave_ncc"] for a in al]), "env_corr_q10_50_90": q([a["env_corr"] for a in al]),
            "offset_s_q5_25_50_75_95": q(off, (0.05, 0.25, 0.5, 0.75, 0.95)), "abs_offset_s_q10_50_90": q(np.abs(off)),
            "offset_within_0.1s": r(np.mean(np.abs(off) < 0.1)), "offset_within_1s": r(np.mean(np.abs(off) < 1)),
            "offset_within_5s": r(np.mean(np.abs(off) < 5)), "itunes_starts_earlier": r(np.mean(off < -0.1)),
            "itunes_starts_later": r(np.mean(off > 0.1)), "overlap_s_q10_50_90": q(ov),
            "overlap_15s_or_more": int((ov >= 15).sum()), "no_common_stretch": int(sum(a["offset_s"] is None for a in al)),
            "same_offset_within_album": {"albums": len(spread), "within_0.05s": int(np.sum(np.array(spread) < 0.05))},
            "offset_histogram_s": {f"{lo}..{hi}": int(((off >= lo) & (off < hi)).sum())
                                   for lo, hi in ((-31, -20), (-20, -10), (-10, -5), (-5, -1), (-1, -0.1), (-0.1, 0.1), (0.1, 1), (1, 5), (5, 10), (10, 20), (20, 31))}}


def bands(d: dict, units_al: list) -> dict:
    """Where in frequency the two stores' versions of one aligned excerpt differ."""
    meta = json.loads(d["meta"]["feature_extractor"])
    centres = mel_centres(meta)
    frames = [d["pairs"][u]["mel_frames"] for u in units_al if "mel_frames" in d["pairs"][u]]
    signed, absd = np.array([f["signed"] for f in frames]), np.array([f["abs"] for f in frames])
    sd = np.array([np.array(f["sd_itunes"]) - np.array(f["sd_deezer"]) for f in frames])
    groups = ((50, 1000), (1000, 4000), (4000, 8000), (8000, 10000), (10000, 11000), (11000, 12000), (12000, 13000), (13000, 14001))
    mel = []
    for lo, hi in groups:
        m = (centres >= lo) & (centres < hi)
        mel.append({"band_hz": [lo, min(hi, 14000)], "mel_bands": int(m.sum()), "abs_diff_db": r(absd[:, m].mean(), 2),
                    "itunes_minus_deezer_db": r(signed[:, m].mean(), 2), "sd_over_time_itunes_minus_deezer_db": r(sd[:, m].mean(), 2)})
    spec = {s: np.stack([d["meas"][("aligned", k, u, s)][1] for k, u in units_al]) for s in STORES}
    wave = []
    for lo, hi in ((0, 4000), (4000, 8000), (8000, 10000), (10000, 12000), (12000, 14000), (14000, 15000), (15000, 16000), (16000, 17000),
                   (17000, 19000), (19000, 22000)):
        a, b = int(lo / dsp.BAND_HZ), int(hi / dsp.BAND_HZ)
        lev = {s: 10 * np.log10(np.maximum((10 ** (spec[s][:, a:b] / 10)).sum(axis=1), 1e-20)) for s in STORES}
        wave.append({"band_hz": [lo, hi], "deezer_db_median": r(np.median(lev["deezer"]), 1), "itunes_db_median": r(np.median(lev["itunes"]), 1),
                     "itunes_minus_deezer_db_median": r(np.median(lev["itunes"] - lev["deezer"]), 2),
                     "abs_diff_db_median": r(np.median(np.abs(lev["itunes"] - lev["deezer"])), 2)})
    return {"n_pairs": len(frames), "feature_extractor": meta, "model_input_by_band": mel, "waveform_spectrum_by_band": wave,
            "mel_centres_hz": [r(c, 0) for c in centres], "abs_diff_db_by_mel_band": [r(x, 2) for x in absd.mean(axis=0)],
            "signed_diff_db_by_mel_band": [r(x, 2) for x in signed.mean(axis=0)]}


# --- YouTube ------------------------------------------------------------------------------------------

def youtube(d: dict, units: list, alb_keys: np.ndarray, variants: list[str]) -> dict:
    yt = d["yt"]
    out = {"links_checked": len(yt), "class": dict(Counter(v.get("class") or v["status"] for v in yt.values())),
           "status": dict(Counter(v["status"] for v in yt.values()))}
    wins = sorted((k, u) for (k, u, s) in d["emb"].get(("yt", "base"), {}))
    keys = sorted({k for k, _ in wins})
    out |= {"albums": len(keys), "windows": len(wins)}
    if len(keys) < 5:
        return out | {"note": "too few albums to measure"}
    probes = [yt[k].get("probe") or {} for k in keys]
    info = [d["meas"][("yt", k, u, "youtube")][0] for k, u in wins]
    spec = np.stack([d["meas"][("yt", k, u, "youtube")][1] for k, u in wins])
    out["audio"] = {"codec": dict(Counter(str(p.get("codec")) for p in probes)), "sample_rate": dict(Counter(str(p.get("sample_rate")) for p in probes)),
                    "bit_rate_kbps_q10_50_90": q([float(p["bit_rate"]) / 1000 for p in probes if p.get("bit_rate")]),
                    "cutoff_hz_q10_50_90": q([dsp.cutoff_hz(x) for x in spec]), "lufs_q10_50_90": q([i["lufs"] for i in info]),
                    "megabytes_q10_50_90": q([yt[k].get("bytes", 0) / 2 ** 20 for k in keys])}
    all_albums = sorted(set(alb_keys.tolist()))
    idx = {a: i for i, a in enumerate(all_albums)}
    in_yt = np.array([k in set(keys) for k, _ in units])
    rng = np.random.default_rng(0)
    out["variants"] = {}
    for v in variants:
        e = d["emb"][("yt", v)]
        Y = unit(np.stack([e[(k, u, "youtube")] for k, u in wins]))
        ya = np.array([k for k, _ in wins])
        D, I = matrices(d, "clip", v, units)
        res = {}
        # probes on the albums that have all three sources, grouped by album
        for name, X in (("deezer", D), ("itunes", I)):
            Xs, a = X[in_yt], alb_keys[in_yt]
            p, _ = probe(np.vstack([Xs, Y]), np.r_[np.zeros(len(Xs), int), np.ones(len(Y), int)], np.r_[a, ya])
            res[f"youtube_vs_{name}_auc"] = p["auc"]
            res[f"youtube_vs_{name}_n"] = [len(Y), len(Xs)]
        p, _ = probe(np.vstack([D[in_yt], I[in_yt]]), np.r_[np.zeros(in_yt.sum(), int), np.ones(in_yt.sum(), int)], np.r_[alb_keys[in_yt], alb_keys[in_yt]])
        res["itunes_vs_deezer_auc_same_albums"] = p["auc"]
        # the same task between two halves of one store's clips cannot be set up with three clips an album; a floor
        # instead: the YouTube windows split at random into two "sources" (album-grouped folds)
        fake = rng.integers(0, 2, len(Y))
        res["floor_random_split_of_youtube_auc"] = probe(Y, fake, ya)[0]["auc"]
        # album retrieval: the album's YouTube mean against every album's store mean
        def means(X, a):
            M = np.zeros((len(all_albums), X.shape[1]))
            for x, k in zip(X, a):
                M[idx[k]] += x
            return unit(M)
        ymean = unit(np.stack([Y[ya == k].mean(axis=0) for k in keys]))
        target = np.array([idx[k] for k in keys])
        for name, M in (("deezer", means(D, alb_keys)), ("itunes", means(I, alb_keys)), ("both_stores", means(np.vstack([D, I]), np.r_[alb_keys, alb_keys]))):
            s = ymean @ M.T
            rank = (s > s[np.arange(len(keys)), target][:, None]).sum(axis=1)
            res[f"album_retrieval_{name}"] = {"top1": r((rank == 0).mean()), "top5": r((rank < 5).mean()), "median_rank": r(np.median(rank) + 1, 1),
                                              "candidates": len(all_albums), "mean_cosine_right_album": r(s[np.arange(len(keys)), target].mean()),
                                              "mean_cosine_other_albums": r((s.sum() - s[np.arange(len(keys)), target].sum()) / (s.size - len(keys)))}
        # references on the same albums: one clip against the album's other clips (other tracks), same store and other store
        for name, Q, P in (("deezer_clip_vs_deezer_rest", D, D), ("itunes_clip_vs_itunes_rest", I, I), ("itunes_clip_vs_deezer_rest", I, D),
                           ("deezer_clip_vs_itunes_rest", D, I)):
            ranks = []
            for k in keys:
                rows = np.nonzero(alb_keys == k)[0]
                if len(rows) < 2:
                    continue
                for held in rows:
                    M = means(np.delete(P, held, axis=0), np.delete(alb_keys, held))
                    s = Q[held] @ M.T
                    ranks.append(int((s > s[idx[k]]).sum()))
            ranks = np.array(ranks)
            res[f"reference_{name}"] = {"top1": r((ranks == 0).mean()), "top5": r((ranks < 5).mean()), "n": len(ranks)}
        # neighbours of YouTube windows among everything from other albums
        Z = np.vstack([Y, D, I])
        src = np.r_[np.zeros(len(Y), int), np.ones(len(D), int), np.full(len(I), 2)]
        za = np.r_[ya, alb_keys, alb_keys]
        S = np.where(za[:, None] == za[None, :], -np.inf, Z @ Z.T)
        nn = np.argsort(-S, axis=1)[:, :K]
        exp_yt = np.array([((src == 0) & (za != za[i])).sum() / (za != za[i]).sum() for i in range(len(Z))])
        res["neighbours"] = {"youtube_seeds_youtube_share": r((src[nn[src == 0]] == 0).mean()), "expected": r(exp_yt[src == 0].mean()),
                             "store_seeds_youtube_share": r((src[nn[src != 0]] == 0).mean()), "expected_store_seeds": r(exp_yt[src != 0].mean())}
        out["variants"][v] = res
    return out


# --- main --------------------------------------------------------------------------------------------

def main() -> int:
    warnings.filterwarnings("ignore")
    d = load()
    ok = {k for k, a in d["albums"].items() if a.get("status") == "ok"}
    variants = [v for v in dsp.VARIANTS if ("clip", v) in d["emb"]] + (["mp3st"] if ("clip", "mp3st") in d["emb"] else [])
    need = [("clip", v) for v in variants]
    units = sorted(u for u in d["pairs"] if u[0] in ok and all((u[0], u[1], s) in d["emb"][kv] for kv in need for s in STORES))
    alb = np.array([k for k, _ in units])
    fam = np.array([d["albums"][k].get("family") or "" for k in alb])
    genre = np.array([next((g.strip() for g in (d["albums"][k].get("primary_genres") or "").split(",") if g.strip()), "") for k in alb])
    rng = np.random.default_rng(0)
    albums = [d["albums"][k] for k in sorted(set(alb.tolist()))]
    res = {"generated_by": "store_effect_fix.py report", "recipe": d["meta"].get("recipe"), "run_ended": d["meta"].get("last_end"),
           "sample": {"albums": len(albums), "pairs": len(units), "new": sum(1 for a in albums if a["new"]),
                      "existing": sum(1 for a in albums if not a["new"]), "with_youtube_link": sum(1 for a in albums if a.get("has_youtube")),
                      "decade": dict(Counter(a["decade"] for a in albums).most_common()), "family": dict(Counter(a["family"] for a in albums).most_common()),
                      "itunes_storefront": dict(Counter(a["itunes_source"] for a in albums).most_common()),
                      "pairs_per_album": dict(Counter(Counter(alb.tolist()).values())),
                      "candidates_tried": dict(Counter(a.get("status") for a in d["albums"].values())),
                      "paired_share_of_deezer_tracks_q10_50_90": q([a["n_paired"] / a["n_deezer"] for a in albums if a.get("n_deezer")])}}
    res["diagnostics"] = diagnostics(d, units)
    res["alignment"] = alignment(d, units)

    base = matrices(d, "clip", "base", units)
    res["variants"] = {v: evaluate(d, "clip", v, units, alb, fam, genre, rng, base) for v in variants}
    res["labels"] = dsp.LABEL

    # aligned set
    units_al = [u for u in units if d["pairs"][u].get("aligned") and all((u[0], u[1], s) in d["emb"][("aligned", v)] for v in dsp.ALIGNED for s in STORES)]
    alb_al = np.array([k for k, _ in units_al])
    fam_al, genre_al = fam[[units.index(u) for u in units_al]], genre[[units.index(u) for u in units_al]]
    base_al = matrices(d, "aligned", "base", units_al)
    res["aligned"] = {"n_pairs": len(units_al), "albums": len(set(alb_al.tolist())),
                      "variants": {v: evaluate(d, "aligned", v, units_al, alb_al, fam_al, genre_al, rng, base_al) for v in dsp.ALIGNED},
                      "unaligned_same_pairs": {v: short(evaluate(d, "clip", v, units_al, alb_al, fam_al, genre_al, rng)) for v in dsp.ALIGNED}}
    res["bands"] = bands(d, units_al)

    # the fix applied to one store's clips only: Deezer as it is, iTunes through the variant (and the reverse)
    one = {}
    for v in variants:
        if v == "base":
            continue
        one[f"itunes_{v}__deezer_base"] = short(evaluate(d, "clip", "base", units, alb, fam, genre, rng, variant_itunes=v))
        D, I = matrices(d, "clip", v, units)[0], base[1]
        one[f"deezer_{v}__itunes_base"] = short({"cosine": cosines(D, I, alb, rng), "probe": store_probe(D, I, alb), "retrieval": retrieval(D, I),
                                                 "neighbours": cross_share(D, I, alb)})
    res["one_store_only"] = one
    # how far each variant moves a clip of its own store (cosine with its baseline vector)
    res["moved"] = {v: {s: r(np.mean(np.sum(X * B, axis=1))) for s, X, B in zip(STORES, matrices(d, "clip", v, units), base)} for v in variants}

    # corrections on the vectors, no audio needed (fitted on these clips: descriptive)
    post = {}
    for v in ("base", "lp12", "rs16"):
        if v not in variants:
            continue
        D, I = matrices(d, "clip", v, units)
        Dc, Ic = centred(D, I)
        post[f"{v}: each store centred on its own mean"] = short({"cosine": cosines(Dc, Ic, alb, rng), "probe": store_probe(Dc, Ic, alb),
                                                                   "retrieval": retrieval(Dc, Ic), "neighbours": cross_share(Dc, Ic, alb)})
    D, I = base
    for name, lam in (("shifted by the mean pair difference", None), ("ridge map, lambda 10", 10.0), ("ridge map, lambda 1", 1.0), ("ridge map, lambda 0.1", 0.1)):
        Im = learned_map(D, I, alb, lam)
        post[f"base: iTunes vectors {name} (fitted on other albums' pairs)"] = short(
            {"cosine": cosines(D, Im, alb, rng), "probe": store_probe(D, Im, alb), "retrieval": retrieval(D, Im), "neighbours": cross_share(D, Im, alb)})
    res["vector_corrections"] = post

    # EffNet, baseline only (embedded by the fetcher with the pipeline's own decode and model)
    if ("effnet", "base") in d["emb"]:
        eu = [u for u in units if all((u[0], u[1], s) in d["emb"][("effnet", "base")] for s in STORES)]
        if len(eu) >= 20:
            ea = np.array([k for k, _ in eu])
            sel = [units.index(u) for u in eu]
            res["effnet"] = {"n_pairs": len(eu), "base": evaluate(d, "effnet", "base", eu, ea, fam[sel], genre[sel], rng, matrices(d, "effnet", "base", eu)),
                             "clap_base_same_pairs": evaluate(d, "clip", "base", eu, ea, fam[sel], genre[sel], rng, matrices(d, "clip", "base", eu))}

    res["youtube"] = youtube(d, units, alb, [v for v in dsp.VARIANTS if ("yt", v) in d["emb"]])
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "store_effect_fix.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(albums)} albums, {len(units)} pairs, {len(units_al)} aligned; wrote results/store_effect_fix.json")
    try:
        import store_effect_md
        (RESULTS / "store_effect_fix.md").write_text(store_effect_md.markdown(res), encoding="utf-8")
        print("wrote results/store_effect_fix.md")
    except ImportError:
        print("store_effect_md.py is not there: no markdown written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
