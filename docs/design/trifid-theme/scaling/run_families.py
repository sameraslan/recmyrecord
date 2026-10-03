"""Deliverable 4: do the five colour families hold? Recipe from regions/build_colour.py.
Run: OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 nice -n 10 <venv python> run_families.py"""
import warnings
from scipy.optimize import linear_sum_assignment, nnls
from sklearn.decomposition import NMF
from sklearn.metrics import adjusted_rand_score
from common import *
from auto_regions import find_regions, PARAMS

warnings.filterwarnings("ignore")
AF = ["energy", "loudness", "acousticness", "valence", "danceability", "instrumentalness", "speechiness", "liveness", "tempo"]
FAM = ["fierce", "warm", "quiet", "dark", "urban"]
ANCHOR = {"fierce": "aggressive", "warm": "bittersweet", "quiet": "acoustic", "dark": "ominous", "urban": "sampling"}
HEX = {"fierce": "#d9627a", "warm": "#e2b45c", "quiet": "#4fb3a5", "dark": "#6f9bd8", "urban": "#a884d6"}
T8_EMPTY = ["male vocals", "female vocals", "androgynous vocals", "chamber music", "opera", "symphony", "string quartet",
            "oratorio", "rock opera", "waltz", "mashup", "jingle", "lyrics"]
K = 5


def stats(W, A, cols):
    """Frozen quantities a fit needs: word weights, audio mean/std, block scale."""
    base = np.clip(W[:, cols].mean(0), 1.0 / len(W), 1 - 1e-9)
    ww = np.sqrt(np.log(1 / base))
    st = {"ww": ww}
    if A is not None:
        st["mu"], st["sd"] = A.mean(0), A.std(0)
        D = W[:, cols] * ww
        Ax = audio_block(A, st)
        st["aw"] = float(np.sqrt((D ** 2).sum() / (Ax ** 2).sum()))
    return st


def audio_block(A, st):
    Az = np.clip((A - st["mu"]) / st["sd"], -2.5, 2.5)
    return np.hstack([np.maximum(Az, 0), np.maximum(-Az, 0)])


def matrix(W, A, cols, st):
    D = W[:, cols].astype(float) * st["ww"]
    return D if A is None else np.hstack([D, audio_block(A, st) * st["aw"]])


def fit(X):
    m = NMF(K, init="nndsvda", random_state=0, max_iter=800)
    H = m.fit_transform(X)
    return H, m.components_


def unit(C):
    return C / np.maximum(np.linalg.norm(C, axis=1, keepdims=True), 1e-12)


def anchors(C, names):
    comp = {f: int(np.argmax(unit(C)[:, names.index(w)])) for f, w in ANCHOR.items() if w in names}
    return comp, len(set(comp.values())) == K


def match(Cref, C, ncols=None):
    """Hungarian match of C's components to the reference families by cosine (optionally first ncols columns)."""
    a, b = unit(Cref[:, :ncols]), unit(C[:, :ncols])
    cs = a @ b.T
    r, c = linear_sum_assignment(-cs)
    return c, [round(float(cs[i, j]), 3) for i, j in zip(r, c)]


def weights(H, C, med=None):
    """Album weights as build_colour.py: shares per family scaled by a character score, plus neutral."""
    Hn = H * np.linalg.norm(C, axis=1)
    tot = Hn.sum(1)
    Sh = Hn / np.maximum(tot[:, None], 1e-9)
    med = np.median(tot) if med is None else med
    char = np.clip(tot / med, 0, 1) * np.clip((Sh.max(1) - 0.2) / 0.2, 0, 1)
    return np.hstack([Sh * char[:, None], (1 - char)[:, None]]), Sh, med


def project(X, C):
    return np.array([nnls(C.T, x)[0] for x in X])


def t8_presence(df, dcols, Wt):
    """Top 8 descriptors per album by table weight (the weight is a rank score: 1.5 for the first name,
    falling by 1/42 per position), ranked over every descriptor column including the 56 lyric/theme ones,
    after removing the 13 columns that go empty. Then restricted to the 120 recommender columns."""
    allc = [c for c in df.columns if c not in META and c not in AUDIO]
    M = df[allc].astype(float).to_numpy().copy()
    M[:, [allc.index(c) for c in T8_EMPTY if c in allc]] = 0
    order = np.argsort(-M, axis=1, kind="stable")[:, :8]
    keep = np.zeros_like(M, dtype=bool)
    rows = np.repeat(np.arange(len(M)), 8)
    keep[rows, order.ravel()] = True
    keep &= M > 0
    return keep[:, [allc.index(c) for c in dcols]], float(keep.sum(1).mean())


if __name__ == "__main__":  # noqa
    d = load()
    df, W, dcols, N = d["df"], d["W"], d["dcols"], len(d["df"])
    A = df[AF].astype(float).to_numpy()
    stored = json.load(open(REG / "colour.json"))
    SAW = np.array(stored["album_weights"])
    rep = {}

    cols = [j for j in range(len(dcols)) if W[:, j].sum() >= 40]
    dn = [dcols[j] for j in cols]
    nw = len(dn)
    st = stats(W, A, cols)
    X = matrix(W, A, cols, st)
    H, C = fit(X)
    comp, ok = anchors(C, dn)
    order = [comp[f] for f in FAM]
    H, C = H[:, order], C[order]
    AWf, Sf, med = weights(H, C)
    lead = Sf.argmax(1)
    clear = SAW[:, 5] < 0.5
    rep["full_refit"] = {
        "words_used": nw, "anchors_distinct": ok,
        "top_words": {f: [dn[j] for j in np.argsort(-C[i, :nw])[:7]] for i, f in enumerate(FAM)},
        "max_abs_diff_vs_stored_album_weights": round(float(np.abs(AWf - SAW).max()), 3),
        "mean_abs_diff_vs_stored_album_weights": round(float(np.abs(AWf - SAW).mean()), 4),
        "leading_family_agrees_with_stored_clear_albums": round(float((AWf[clear, :5].argmax(1) == SAW[clear, :5].argmax(1)).mean()), 3),
        "clear_albums": int(clear.sum())}
    print("full refit", rep["full_refit"], flush=True)

    # --- subsets
    rep["subsets"] = {}
    subsets = {f"prefix_{m}": np.arange(m) for m in (1600, 2400, 3200)}
    for seed in (1, 2):
        subsets[f"random_half_seed{seed}"] = np.sort(np.random.default_rng(seed).permutation(N)[: N // 2])
    for name, idx in subsets.items():
        s2 = stats(W[idx], A[idx], cols)
        H2, C2 = fit(matrix(W[idx], A[idx], cols, s2))
        c, cs = match(C, C2)
        comp2, ok2 = anchors(C2, dn)
        anchor_same = all(comp2[f] == int(c[i]) for i, f in enumerate(FAM))
        # leading family of the subset's albums: subset fit vs full fit
        _, S2, _ = weights(H2[:, c], C2[c])
        cl = clear[idx]
        rep["subsets"][name] = {"n": len(idx), "cosine": dict(zip(FAM, cs)), "anchors_distinct": ok2,
                                "anchors_pick_matched_component": anchor_same,
                                "leading_same_all": round(float((S2.argmax(1) == lead[idx]).mean()), 3),
                                "leading_same_clear": round(float((S2.argmax(1) == lead[idx])[cl].mean()), 3)}
        print(name, rep["subsets"][name], flush=True)

    # --- descriptor-only
    def desc_only(Wx, label):
        cx = [j for j in cols if Wx[:, j].sum() >= 40]
        names = [dcols[j] for j in cx]
        sx = stats(Wx, None, cx)
        Hx, Cx = fit(matrix(Wx, None, cx, sx))
        ref = C[:, [cols.index(j) for j in cx]]
        c, cs = match(ref, Cx)
        compx, okx = anchors(Cx, names)
        _, Sx, _ = weights(Hx[:, c], Cx[c])
        has = Wx[:, cx].sum(1) > 0
        out = {"words_used": len(cx), "cosine_on_word_loadings": dict(zip(FAM, cs)), "anchors_distinct": okx,
               "anchors_pick_matched_component": all(compx.get(f) == int(c[i]) for i, f in enumerate(FAM)),
               "top_words": {f: [names[j] for j in np.argsort(-Cx[c[i]])[:7]] for i, f in enumerate(FAM)},
               "leading_changes_all": round(float((Sx.argmax(1) != lead).mean()), 3),
               "leading_changes_clear": round(float((Sx.argmax(1) != lead)[clear].mean()), 3),
               "leading_changes_clear_with_words": round(float((Sx.argmax(1) != lead)[clear & has].mean()), 3),
               "albums_with_no_words": int((~has).sum())}
        print(label, out, flush=True)
        return out, (Hx[:, c], Cx[c], cx, sx)

    rep["descriptor_only"], dfit = desc_only(W, "descriptor-only")

    # --- T8
    W8, mean8 = t8_presence(df, dcols, d["Wt"])
    rep["t8"] = {"mean_names_per_album_all_columns": round(mean8, 2), "mean_names_in_120_columns": round(float(W8.sum(1).mean()), 2),
                 "full_mean_names_in_120_columns": round(float(W.sum(1).mean()), 2),
                 "empty_columns": int((W8.sum(0) == 0).sum()), "albums_with_no_words": int((W8.sum(1) == 0).sum())}
    rep["t8"]["families"], _ = desc_only(W8, "T8 descriptor-only")

    # T8 regions on the shipped balanced layout
    B, keys = d["P"]["balanced"], d["keys"]
    nt = json.load(open(HERE / "name_table.json"))
    full_run = find_regions(B, W, dcols, None, None, nt, None, keys)

    def reg_summary(o):
        l1 = [r for r in o["regions"] if r["level"] == 1]
        return {"regions": len(l1), "strong": sum(r["strength"] == "strong" for r in l1), "fair": sum(r["strength"] == "fair" for r in l1),
                "unnamed": round(float((np.array(o["album_region"]) < 0).mean()), 3), "areas": sum(r["level"] == 0 for r in o["regions"]),
                "words": sorted(r["word"] for r in l1)}

    def vs_full(o):
        fa, oa = np.array(full_run["album_region"]), np.array(o["album_region"])
        fw = np.array([r["word"] for r in full_run["regions"]] + [""])[fa]
        ow = np.array([r["word"] for r in o["regions"]] + [""])[oa]
        named = fw != ""
        fl = {r["word"] for r in full_run["regions"] if r["level"] == 1}
        ol = {r["word"] for r in o["regions"] if r["level"] == 1}
        return {"region_words_kept": [len(fl & ol), len(fl)], "album_word_same_named": round(float((fw == ow)[named].mean()), 3),
                "ari": round(float(adjusted_rand_score(fa, oa)), 3)}

    # coverage of each full-run name word inside the same members, under T8 presence
    fa = np.array(full_run["album_region"])
    b8 = W8.mean(0)
    tab = []
    for i, r in enumerate(full_run["regions"]):
        if r["level"] != 1:
            continue
        j = dcols.index(r["word"])
        m = fa == i
        c8 = float(W8[m, j].mean())
        tab.append({"word": r["word"], "strength": r["strength"], "n": r["n"], "coverage_full": r["evidence"]["coverage"],
                    "lift_full": r["evidence"]["lift"], "coverage_t8": round(c8, 3), "overall_t8": round(float(b8[j]), 3),
                    "lift_t8": round(c8 / max(b8[j], 1e-9), 2)})
    ratio = float(np.median([t["coverage_t8"] / t["coverage_full"] for t in tab]))
    rep["t8"]["name_word_coverage_same_members"] = tab
    rep["t8"]["median_coverage_ratio"] = round(ratio, 3)
    rep["t8"]["regions_full_presence_words_only"] = reg_summary(full_run)
    variants = {
        "same_gates_0.40_0.35": {},
        "scaled_by_mean_names": {"cov_strong": round(0.40 * W8.sum(1).mean() / W.sum(1).mean(), 3),
                                 "cov_fair": round(0.35 * W8.sum(1).mean() / W.sum(1).mean(), 3),
                                 "top_cov": round(0.25 * W8.sum(1).mean() / W.sum(1).mean(), 3)},
        "0.25_0.20": {"cov_strong": 0.25, "cov_fair": 0.20, "top_cov": 0.15},
        "0.20_0.15_lift2.5": {"cov_strong": 0.20, "cov_fair": 0.15, "top_cov": 0.12, "lift_min": 2.5},
    }
    rep["t8"]["region_runs"] = {}
    for name, pv in variants.items():
        o = find_regions(B, W8, dcols, None, None, nt, None, keys, params=pv)
        rep["t8"]["region_runs"][name] = {"params": pv, **reg_summary(o), **vs_full(o)}
        print("T8 regions", name, rep["t8"]["region_runs"][name], flush=True)
    for t in tab:
        print("  ", t)

    # --- pinned families: projection instead of refit
    rep["pinned"] = {}
    Hp = project(X, C)
    AWp, Sp, _ = weights(Hp, C, med)
    rep["pinned"]["full_fit_projection_vs_stored"] = {
        "leading_same_clear": round(float((AWp[clear, :5].argmax(1) == SAW[clear, :5].argmax(1)).mean()), 3),
        "mean_abs_diff": round(float(np.abs(AWp - SAW).mean()), 4), "max_abs_diff": round(float(np.abs(AWp - SAW).max()), 3)}
    for seed in (1, 2):
        perm = np.random.default_rng(100 + seed).permutation(N)
        tr, te = np.sort(perm[: int(0.7 * N)]), np.sort(perm[int(0.7 * N):])
        s3 = stats(W[tr], A[tr], cols)
        H3, C3 = fit(matrix(W[tr], A[tr], cols, s3))
        c, cs = match(C, C3)
        C3 = C3[c]
        _, _, med3 = weights(H3[:, c], C3)
        Hte = project(matrix(W[te], A[te], cols, s3), C3)
        AWte, Ste, _ = weights(Hte, C3, med3)
        cl = clear[te]
        rep["pinned"][f"holdout_seed{seed}"] = {
            "train": len(tr), "test": len(te), "component_cosine_to_full": dict(zip(FAM, cs)),
            "leading_same_as_stored_all": round(float((AWte[:, :5].argmax(1) == SAW[te, :5].argmax(1)).mean()), 3),
            "leading_same_as_stored_clear": round(float((AWte[cl, :5].argmax(1) == SAW[te][cl, :5].argmax(1)).mean()), 3),
            "clear_test_albums": int(cl.sum()),
            "mean_abs_weight_diff_vs_stored": round(float(np.abs(AWte - SAW[te]).mean()), 4)}
        print("holdout", seed, rep["pinned"][f"holdout_seed{seed}"], flush=True)
    # albums with no Spotify audio: project on the word block of the frozen joint loadings
    Hw = project(X[:, :nw], C[:, :nw])
    AWw, Sw, _ = weights(Hw, C, med)
    hasw = W[:, cols].sum(1) > 0
    rep["pinned"]["word_block_only_projection"] = {
        "leading_same_as_stored_clear": round(float((AWw[clear, :5].argmax(1) == SAW[clear, :5].argmax(1)).mean()), 3),
        "leading_same_as_stored_clear_with_words": round(float((AWw[clear & hasw, :5].argmax(1) == SAW[clear & hasw, :5].argmax(1)).mean()), 3),
        "leading_same_as_joint_all": round(float((Sw.argmax(1) == lead).mean()), 3),
        "mean_neutral_joint": round(float(AWf[:, 5].mean()), 3), "mean_neutral_word_only": round(float(AWw[:, 5].mean()), 3)}
    # same, with T8 presence (the situation of the ~6,400 new albums)
    X8 = W8[:, cols].astype(float) * st["ww"]
    H8 = project(X8, C[:, :nw])
    AW8, S8, _ = weights(H8, C, med)
    has8 = W8[:, cols].sum(1) > 0
    rep["pinned"]["word_block_only_projection_t8"] = {
        "leading_same_as_stored_clear": round(float((AW8[clear, :5].argmax(1) == SAW[clear, :5].argmax(1)).mean()), 3),
        "leading_same_as_stored_clear_with_words": round(float((AW8[clear & has8, :5].argmax(1) == SAW[clear & has8, :5].argmax(1)).mean()), 3),
        "mean_neutral": round(float(AW8[:, 5].mean()), 3), "albums_with_no_words": int((~has8).sum())}
    print(rep["pinned"], flush=True)

    json.dump({
        "note": "Frozen five-family loadings fitted once on the 4,081-album catalogue (NMF k=5, recipe of regions/build_colour.py). "
                "Score an album by non-negative least squares of its feature row on `loadings`, then apply the weight formula. "
                "Albums without Spotify audio use the word columns only.",
        "family_order": FAM, "hex": HEX, "anchor_words": ANCHOR,
        "words": dn, "word_weight": [round(float(x), 5) for x in st["ww"]],
        "audio_features": AF, "audio_mean": [float(x) for x in st["mu"]], "audio_std": [float(x) for x in st["sd"]],
        "audio_clip_z": 2.5, "audio_columns": [f + "+" for f in AF] + [f + "-" for f in AF], "audio_block_scale": st["aw"],
        "loadings": {f: {"words": [round(float(x), 5) for x in C[i, :nw]], "audio": [round(float(x), 5) for x in C[i, nw:]]}
                     for i, f in enumerate(FAM)},
        "loading_norm": [float(x) for x in np.linalg.norm(C, axis=1)],
        "median_total_activation": float(med),
        "weight_formula": "Hn = h * loading_norm; share = Hn / sum(Hn); character = clip(sum(Hn) / median_total_activation, 0, 1) "
                          "* clip((max(share) - 0.2) / 0.2, 0, 1); weights = share * character, neutral = 1 - character",
    }, open(OUT / "family_loadings.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(rep, open(OUT / "report_families.json", "w"), indent=1)
