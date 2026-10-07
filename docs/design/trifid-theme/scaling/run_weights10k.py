"""Colour family weights for the 10k catalog: the 4,081 albums the families were fitted on keep theirs
(regions/colour.json), every later album gets weights by prediction. Nothing is refitted: the families and
their hues stay as frozen in out/family_loadings.json. WEIGHTS-10K.md is the write-up.
Writes out/album_weights_10k.json (read by rmr_pipeline.theme) and out/report_weights10k.json.
Run: OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 10 <venv python> run_weights10k.py"""
import hashlib
import warnings
from sklearn.linear_model import Ridge
from common import *
from run_families import AF, FAM, project, weights
from rmr_pipeline.audio_store import load_store, site_store  # noqa: E402
from rmr_pipeline.catalog import catalog_frame, load_catalog  # noqa: E402

warnings.filterwarnings("ignore")
ALPHAS = (300, 1000, 3000)
WORD_SCALE = 3.0  # a word column beside the standardised embedding columns (not tuned: the first value tried)
FOLDS = 5
KNOTS = np.linspace(0, 1, 101)


def load10k():
    """Everything per album of the 10k catalog, in albums.json order. The first n0 albums are the feature table's."""
    albums = json.load(open(WT / "frontcreck/public/data/albums.json"))
    df, _ = dedupe_table(load_table())
    cat = catalog_frame(df, load_catalog())  # the descriptors the site build gives every album: its first eight
    assert len(cat.keys) == len(albums) and all(str(t) == a["t"] for t, a in zip(df["Title"], albums))
    fl = json.load(open(OUT / "family_loadings.json"))
    assert fl["family_order"] == FAM and fl["audio_features"] == AF
    words = fl["words"]
    store = load_store(site_store())
    row = {k: i for i, k in enumerate(store.keys)}
    E = np.full((len(albums), store.dim), np.nan, dtype=np.float32)
    for i, k in enumerate(cat.keys):
        if k in row:
            E[i] = store.emb[row[k]]
    stored = json.load(open(REG / "colour.json"))
    assert stored["family_order"] == FAM + ["neutral"]
    return dict(albums=albums, n0=len(df), keys=cat.keys, fl=fl, E=E, has=~np.isnan(E[:, 0]),
                W8=(cat.places[words].to_numpy() >= 0).astype(float),  # first-eight presence, the frozen word columns
                Wfull=df[words].astype(float).to_numpy() > 0, A=df[AF].astype(float).to_numpy(),
                SAW=np.array(stored["album_weights"]), model=store.manifest["model"])


class Frozen:
    """The frozen definitions: score a row of words (and sound traits when there are any) against them."""

    def __init__(self, fl):
        self.nw = len(fl["words"])
        self.ww = np.array(fl["word_weight"])
        self.C = np.array([fl["loadings"][f]["words"] + fl["loadings"][f]["audio"] for f in FAM])
        self.st = {"mu": np.array(fl["audio_mean"]), "sd": np.array(fl["audio_std"])}
        self.aw, self.med = fl["audio_block_scale"], fl["median_total_activation"]

    def score(self, W, A=None):
        X = W * self.ww
        if A is None:
            return weights(project(X, self.C[:, :self.nw]), self.C, self.med)[0]
        Az = np.clip((A - self.st["mu"]) / self.st["sd"], -2.5, 2.5)
        return weights(project(np.hstack([X, np.hstack([np.maximum(Az, 0), np.maximum(-Az, 0)]) * self.aw]), self.C), self.C, self.med)[0]


def simplex(P):
    P = np.clip(P, 0, None)
    return P / np.maximum(P.sum(1, keepdims=True), 1e-9)


class Features:
    """[standardised embedding | first-eight word presence], the embedding's mean and spread taken on `fit` rows."""

    def __init__(self, E, W8, fit):
        self.E, self.W8 = E, W8
        self.m, self.s = E[fit].mean(0), E[fit].std(0) + 1e-6

    def z(self, idx):
        return (self.E[idx] - self.m) / self.s

    def __call__(self, idx):
        return np.hstack([self.z(idx), self.W8[idx] * WORD_SCALE])


def oof_ridge(X, Y, seed=0):
    """Out-of-fold predictions of a ridge at the alpha with the least out-of-fold squared error, and that alpha."""
    fold = np.random.default_rng(seed).permutation(len(X)) % FOLDS
    best = None
    for alpha in ALPHAS:
        P = np.zeros_like(Y, dtype=float)
        for f in range(FOLDS):
            P[fold == f] = Ridge(alpha=alpha).fit(X[fold != f], Y[fold != f]).predict(X[fold == f])
        err = float(((P - Y) ** 2).mean())
        if best is None or err < best[0]:
            best = (err, alpha, P)
    return best[2], best[1]


def sharpen(P, gamma):
    """Raises the five family shares to a power inside the album's family total; the neutral share is kept."""
    fam = np.clip(P[:, :5], 0, None)
    tot = fam.sum(1, keepdims=True)
    g = (fam / np.maximum(tot, 1e-9)) ** gamma
    return np.hstack([g / np.maximum(g.sum(1, keepdims=True), 1e-9) * tot, P[:, 5:]])


class Calibration:
    """Undoes the pull to the average of a predicted weight row, measured on out-of-fold predictions of albums
    with true weights. Neutral: a monotone map from the predicted distribution to the true one (quantile to
    quantile). Families: a power on the within-family shares, set so the mean leading share equals the true one.
    Neither changes which family leads."""

    def __init__(self, pred, true):
        self.q_pred, self.q_true = np.quantile(pred[:, 5], KNOTS), np.quantile(true[:, 5], KNOTS)
        target = true[:, :5].max(1).mean()
        lo, hi = 1.0, 4.0
        for _ in range(40):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if self(pred, mid)[:, :5].max(1).mean() < target else (lo, mid)
        self.gamma = (lo + hi) / 2

    def __call__(self, P, gamma=None):
        neutral = np.interp(P[:, 5], self.q_pred, self.q_true)
        fam = simplex(P[:, :5]) * (1 - neutral)[:, None]
        return sharpen(np.hstack([fam, neutral[:, None]]), self.gamma if gamma is None else gamma)


def fit_direct(F, tr, Y):
    """Method c: ridge from the features straight to the six shares, with its calibration. Returns predict(idx)
    -> (raw, calibrated), and what was fitted."""
    X = F(tr)
    oof, alpha = oof_ridge(X, Y)
    cal = Calibration(simplex(oof), Y)
    model = Ridge(alpha=alpha).fit(X, Y)

    def predict(idx):
        raw = simplex(model.predict(F(idx)))
        return raw, cal(raw)
    return predict, {"alpha": alpha, "gamma": round(float(cal.gamma), 3)}


def star_led(P):
    """As the bake colours a star (bake-core.js leadFamilies): a family over 0.3 that is larger than neutral."""
    top = P[:, :5].max(1)
    return (top > 0.3) & (top > P[:, 5])


def shape(P):
    """The distribution of what shows as a seam: how grey (neutral) and how saturated (leading share) rows are."""
    top, q = P[:, :5].max(1), lambda v: [round(float(x), 3) for x in np.quantile(v, [0.1, 0.25, 0.5, 0.75, 0.9])]
    led = star_led(P)
    lead = P[:, :5].argmax(1)
    return {"n": len(P), "neutral_mean": round(float(P[:, 5].mean()), 3), "neutral_q10_25_50_75_90": q(P[:, 5]),
            "neutral_over_half": round(float((P[:, 5] >= 0.5).mean()), 3),
            "leading_mean": round(float(top.mean()), 3), "leading_q10_25_50_75_90": q(top),
            "star_coloured": round(float(led.mean()), 3),
            "coloured_stars_by_family": {f: round(float((lead[led] == j).mean()), 3) for j, f in enumerate(FAM)}}


def compare(P, T):
    """Agreement with the true weights. clear: the true neutral share is under 0.5 (SCALING.md's measure).
    decisive: also the true leading family is 0.15 or more ahead of the next."""
    clear = T[:, 5] < 0.5
    s = np.sort(T[:, :5], 1)
    decisive = clear & (s[:, -1] - s[:, -2] >= 0.15)
    same = P[:, :5].argmax(1) == T[:, :5].argmax(1)
    top2 = (np.argsort(-P[:, :5], 1)[:, :2] == T[:, :5].argmax(1)[:, None]).any(1)
    return {"n": len(T), "clear": int(clear.sum()), "leading_same_clear": round(float(same[clear].mean()), 3),
            "decisive": int(decisive.sum()), "leading_same_decisive": round(float(same[decisive].mean()), 3),
            "true_leader_in_predicted_top2_clear": round(float(top2[clear].mean()), 3),
            "mean_abs_share_error": round(float(np.abs(P - T).mean()), 4),
            "neutral_mean": [round(float(P[:, 5].mean()), 3), round(float(T[:, 5].mean()), 3)],
            "leading_mean": [round(float(P[:, :5].max(1).mean()), 3), round(float(T[:, :5].max(1).mean()), 3)]}


def exact_rows(P):
    """Rows as two-decimal shares that sum to exactly 1 (largest remainder), as lists."""
    out = []
    for row in np.round(P * 100, 6):
        base = np.floor(row).astype(int)
        for j in np.argsort(-(row - base), kind="stable")[: 100 - int(base.sum())]:
            base[j] += 1
        out.append([int(v) / 100 for v in base])
    return out


if __name__ == "__main__":  # noqa
    d = load10k()
    n0, N, E, W8, A, SAW, has = d["n0"], len(d["albums"]), d["E"], d["W8"], d["A"], d["SAW"], d["has"]
    fz = Frozen(d["fl"])
    mu, sd = fz.st["mu"], fz.st["sd"]
    rep = {"albums": N, "albums_with_true_weights": n0, "model": d["model"],
           "with_embedding": {"old": int(has[:n0].sum()), "new": int(has[n0:].sum())},
           "words_per_album_first_eight": {"old": round(float(W8[:n0].sum(1).mean()), 2), "new": round(float(W8[n0:].sum(1).mean()), 2),
                                           "old_full_lists": round(float(d["Wfull"].sum(1).mean()), 2)},
           "holdout": {}}

    # --- hold-out: 70% / 30% of the albums with true weights, the two splits of run_families.py; albums with an
    # embedding only. A held-out album is given what a new album has: its first eight words and its embedding.
    for seed in (1, 2):
        perm = np.random.default_rng(100 + seed).permutation(n0)
        tr, te = np.sort(perm[: int(0.7 * n0)]), np.sort(perm[int(0.7 * n0):])
        tr, te = tr[has[tr]], te[has[te]]
        T, F, R = SAW[te], Features(E, W8, tr), {}
        R["ceiling_full_words_true_traits"] = compare(fz.score(d["Wfull"][te].astype(float), A[te]), T)
        R["ceiling_first_eight_words_true_traits"] = compare(fz.score(W8[te], A[te]), T)
        R["words_only_frozen"] = compare(fz.score(W8[te]), T)
        # a: traits from the embedding, then the frozen definitions
        oof, alpha = oof_ridge(F.z(tr), (A[tr] - mu) / sd)
        Ap = Ridge(alpha=alpha).fit(F.z(tr), (A[tr] - mu) / sd).predict(F.z(te)) * sd + mu
        r2 = 1 - ((Ap - A[te]) ** 2).sum(0) / ((A[te] - A[te].mean(0)) ** 2).sum(0)
        Pa = fz.score(W8[te], Ap)
        R["a_predicted_traits_frozen"] = {**compare(Pa, T), "alpha": alpha, "trait_r2": {f: round(float(x), 2) for f, x in zip(AF, r2)}}
        # b: the mean of the nearest albums with true weights (cosine on the standardised embedding)
        unit = lambda X: X / np.linalg.norm(X, axis=1, keepdims=True)  # noqa: E731
        near = np.argsort(-(unit(F.z(te)) @ unit(F.z(tr)).T), 1)[:, :20]
        Pb = SAW[tr][near].mean(1)
        R["b_20_nearest"] = compare(Pb, T)
        R["b_20_nearest_blend_0.3_words"] = compare(0.7 * Pb + 0.3 * fz.score(W8[te]), T)
        # c: ridge from embedding and words straight to the shares, raw and calibrated
        predict, fitted = fit_direct(F, tr, SAW[tr])
        raw, cal = predict(te)
        R["c_direct"] = {**compare(raw, T), **fitted}
        R["c_direct_calibrated"] = compare(cal, T)
        R["a_c_average"] = compare((Pa + raw) / 2, T)
        R["shape"] = {"true": shape(T), "a": shape(Pa), "c_direct": shape(raw), "c_direct_calibrated": shape(cal)}
        rep["holdout"][f"seed{seed}"] = {"train": len(tr), "test": len(te), **R}
        for k, v in R.items():
            if k != "shape":
                print(seed, f"{k:40s}", v, flush=True)
        print(seed, "shape", json.dumps(R["shape"]), flush=True)

    # --- the weights: true for the first n0; c calibrated for a later album with an embedding; the frozen
    # definitions on its words alone for one without; neutral for one with neither
    old, new = np.arange(n0), np.arange(n0, N)
    fit = old[has[old]]
    predict, fitted = fit_direct(Features(E, W8, fit), fit, SAW[fit])
    AW = np.zeros((N, 6))
    AW[:n0] = SAW
    source = np.array(["true"] * n0 + ["words"] * (N - n0), dtype=object)
    AW[new] = fz.score(W8[new])
    pred = new[has[new]]
    raw, cal = predict(pred)
    AW[pred], source[pred] = cal, "predicted"
    bare = new[~has[new] & (W8[new].sum(1) == 0)]
    AW[bare], source[bare] = [0, 0, 0, 0, 0, 1], "none"
    rep["final"] = {**fitted, "fitted_on": len(fit), "source": {s: int((source == s).sum()) for s in ("true", "predicted", "words", "none")}}
    rep["seam"] = {"old_true": shape(SAW), "new_predicted_before_calibration": shape(raw), "new_predicted": shape(cal),
                   "new_words_only": shape(AW[source == "words"]), "all": shape(AW)}
    print("final", rep["final"])
    for k, v in rep["seam"].items():
        print(f"{k:34s}", json.dumps(v), flush=True)

    slugs = hashlib.sha256("\n".join(a["slug"] for a in d["albums"]).encode("utf-8")).hexdigest()[:12]
    json.dump({
        "note": "Colour family weights of every album of the 10k catalog, in albums.json order (run_weights10k.py). "
                "source: 0 true = the weights of regions/colour.json; 1 predicted = ridge from the album's clip embedding "
                "and first eight descriptors, fitted on the true ones and calibrated; 2 words = the frozen definitions on "
                "the descriptors alone (no audio); 3 none = neutral.",
        "family_order": FAM + ["neutral"], "n": N, "slugsHash": slugs, "source_counts": rep["final"]["source"],
        "source": [{"true": 0, "predicted": 1, "words": 2, "none": 3}[s] for s in source],
        "album_weights": [[round(float(x), 2) for x in r] for r in SAW] + exact_rows(AW[n0:]),
    }, open(OUT / "album_weights_10k.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(rep, open(OUT / "report_weights10k.json", "w"), indent=1)
