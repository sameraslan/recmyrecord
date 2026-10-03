"""Recommendation-quality metrics for "an album arrives with PREDICTED descriptors".

    import recq
    res = recq.evaluate(W, rows)                      # W (len(rows), 120) table-format vectors, rows = table rows
    res["stops"]["balanced"]["RSQ"], ["R50"], ["ndcg"], ["inb_ratio_iso"], ...
    .venv/bin/python recq.py                          # sanity: true vectors -> 1.0 everywhere, agreement with downstream.py

Setting (same catalogue, de-duplication and row mapping as downstream.py): the site recommends the 10
Euclidean nearest albums over [13 audio features | 120 descriptor weights / slider**3]. For a held-out
album q only its 120 descriptor columns are replaced; audio columns and all other albums stay real.

  reference  = the other catalogue albums ranked by distance from q's REAL vector (Ref10, Ref50, ...)
  isolated   = q alone gets its predicted vector, the rest of the catalogue is real (the "one new album
               arrives" case; per-album, independent of which other albums are evaluated: the headline)
  all        = every evaluated album is replaced at once (what downstream.downstream_eval calls `overlap`)

Per-album metrics of q's predicted top-10 list (higher = better unless noted):
  ov10      |Pred10 ∩ Ref10| / 10                       chance 10/(n-1)   (n = 4,081 -> 0.0025)
  R50/R100  |Pred10 ∩ Ref50| / 10 (Ref100)              chance 50/(n-1) = 0.0123, 100/(n-1) = 0.0245
  RSQ       (d_rand - d_pred) / (d_rand - d_oracle): d_pred = mean REAL distance from q to its predicted 10,
            d_oracle = the same for Ref10, d_rand = mean real distance to all other albums. 0 random, 1 oracle
  medrank   median reference rank (1-based) of the 10 recommended albums; oracle 5.5, random ~ n/2 (lower = better)
  ndcg      DCG of gains exp(-d_real(q, i) / sigma) in predicted order / the same for Ref10;
            sigma = median real 10-NN distance over the whole catalogue at that stop
  genre     share of the 10 recommended albums in q's primary-genre family (split.genre_family; q with family
            "unknown"/"other" are left out); genre_real = same for Ref10, genre_random = same for random albums
Hubness of the evaluated albums (how often OTHER albums recommend them):
  inb_ratio_iso / _all   inbound appearances with predicted vectors / with real vectors
  zero_*                 share of evaluated albums nobody recommends (zero_before = with real vectors)
  skew_*                 skewness of the inbound-count distribution among the evaluated albums
Local scaling (`retrieval="ls-rowcol" | "ls-full"`) changes the k-NN itself: it needs a site build change.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy.spatial.distance import cdist
from scipy.stats import skew

from common import AUDIO, DESCRIPTORS, SLIDER, Y64, load_genres, split_rows

K = 10
STOPS2 = ("balanced", "mood")
BIG = np.inf


# ---------------------------------------------------------------- pure metric functions

def top_k(D: np.ndarray, k: int = K) -> np.ndarray:
    """(n_q, k) indices of the k smallest entries per row, ascending, ties by index. Put inf on self."""
    return np.argsort(D, axis=1, kind="stable")[:, :k]


def rank_matrix(D: np.ndarray) -> np.ndarray:
    """rank[i, j] = 0-based position of j when row i of D is sorted ascending (stable)."""
    order = np.argsort(D, axis=1, kind="stable")
    rank = np.empty(D.shape, dtype=np.int32)
    np.put_along_axis(rank, order, np.arange(D.shape[1], dtype=np.int32)[None, :], axis=1)
    return rank


def recall_into(pred: np.ndarray, rank: np.ndarray, m: int) -> np.ndarray:
    """Per album: share of the predicted list that lies inside the reference top-m. m = k gives overlap@k."""
    return (np.take_along_axis(rank, pred, axis=1) < m).mean(1)


def median_ref_rank(pred: np.ndarray, rank: np.ndarray) -> np.ndarray:
    """Per album: median 1-based reference rank of the recommended albums."""
    return np.median(np.take_along_axis(rank, pred, axis=1) + 1, axis=1)


def rsq(D_real: np.ndarray, pred: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Relative similarity quality per album. D_real has inf on the query's own column."""
    finite = np.isfinite(D_real)
    d_rand = np.where(finite, D_real, 0.0).sum(1) / finite.sum(1)
    d_pred = np.take_along_axis(D_real, pred, axis=1).mean(1)
    d_or = np.take_along_axis(D_real, ref, axis=1).mean(1)
    return (d_rand - d_pred) / np.maximum(d_rand - d_or, 1e-12)


def graded_ndcg(D_real: np.ndarray, pred: np.ndarray, ref: np.ndarray, sigma: float) -> np.ndarray:
    """nDCG with gain exp(-d_real / sigma); the ideal list is `ref` (the real nearest neighbours, in order)."""
    disc = 1.0 / np.log2(np.arange(pred.shape[1]) + 2.0)
    dcg = (np.exp(-np.take_along_axis(D_real, pred, axis=1) / sigma) * disc).sum(1)
    idcg = (np.exp(-np.take_along_axis(D_real, ref, axis=1) / sigma) * disc[: ref.shape[1]]).sum(1)
    return dcg / np.maximum(idcg, 1e-300)


def genre_agreement(lists: np.ndarray, fam_q: np.ndarray, fam_cat: np.ndarray,
                    ignore: tuple[str, ...] = ("unknown", "other")) -> np.ndarray:
    """Per album: share of the listed albums whose family equals the query's (NaN for ignored query families)."""
    out = (fam_cat[lists] == fam_q[:, None]).mean(1).astype(float)
    out[np.isin(fam_q, ignore)] = np.nan
    return out


def genre_random(self_idx: np.ndarray, fam_cat: np.ndarray, ignore: tuple[str, ...] = ("unknown", "other")) -> np.ndarray:
    """Expected genre agreement of a uniformly random list (self excluded)."""
    fams, inv, counts = np.unique(fam_cat, return_inverse=True, return_counts=True)
    out = (counts[inv[self_idx]] - 1) / (len(fam_cat) - 1.0)
    out[np.isin(fam_cat[self_idx], ignore)] = np.nan
    return out


def hub_stats(before: np.ndarray, after: np.ndarray) -> dict:
    b, a = np.asarray(before, float), np.asarray(after, float)
    return {"inb_ratio": float(a.sum() / b.sum()) if b.sum() else float("nan"),
            "inb_mean": float(a.mean()), "zero": float((a == 0).mean()), "zero_before": float((b == 0).mean()),
            "skew": float(skew(a)) if a.std() > 0 else 0.0, "skew_before": float(skew(b)) if b.std() > 0 else 0.0,
            "max": float(a.max()), "max_before": float(b.max())}


# ---------------------------------------------------------------- one slider stop of a catalogue

class Space:
    """A catalogue at one slider stop. audio (n, 13) and desc (n, 120) in table units; the descriptor block is
    divided by slider**3 and cast to float32 exactly like rmr_pipeline.table.rec_matrix."""

    def __init__(self, audio: np.ndarray, desc: np.ndarray, slider: float, fam: np.ndarray | None = None, k: int = K):
        self.k = k
        self.s = max(float(slider) ** 3, 1e-5)
        self.A = np.asarray(audio, dtype=np.float64).astype(np.float32).astype(np.float64)
        self.X = np.hstack([self.A, self.scale(desc)])
        self.n = len(self.X)
        self.fam = fam
        self.nn_i, self.nn_d = self._knn(k + 1)             # real lists (first k) + the 11th neighbour
        self.sigma_gain = float(np.median(self.nn_d[:, :k]))            # gain scale of graded nDCG
        self.sig = np.maximum(self.nn_d[:, k - 1], 1e-12)               # local scale: distance to the k-th neighbour
        self.inbound_real = np.bincount(self.nn_i[:, :k].ravel(), minlength=self.n)
        members: dict[int, list[int]] = {}
        for j in range(self.n):
            for e in self.nn_i[j, :k]:
                members.setdefault(int(e), []).append(j)
        self._members = {e: np.array(v, dtype=int) for e, v in members.items()}
        self._ref: dict[bytes, dict] = {}
        self._base: dict[bytes, tuple] = {}
        self._ls: dict | None = None

    def _knn(self, k: int, mask_cols: np.ndarray | None = None, col_scale: np.ndarray | None = None,
             chunk: int = 512) -> tuple[np.ndarray, np.ndarray]:
        """k nearest catalogue albums of every album (self excluded by index), in row chunks so the full
        (n, n) matrix is never held. mask_cols: columns to leave out; col_scale: per-album factor f with
        d'(x, y) = d(x, y) * f_x * f_y (local scaling)."""
        idx = np.empty((self.n, k), dtype=int)
        dist = np.empty((self.n, k))
        for a in range(0, self.n, chunk):
            b = min(a + chunk, self.n)
            D = cdist(self.X[a:b], self.X)
            if col_scale is not None:
                D *= col_scale[a:b, None] * col_scale[None, :]
            D[np.arange(b - a), np.arange(a, b)] = BIG
            if mask_cols is not None:
                D[:, mask_cols] = BIG
            idx[a:b] = top_k(D, k)
            dist[a:b] = np.take_along_axis(D, idx[a:b], axis=1)
        return idx, dist

    def scale(self, desc: np.ndarray) -> np.ndarray:
        return (np.asarray(desc, dtype=np.float64) / self.s).astype(np.float32).astype(np.float64)

    def queries(self, ev: np.ndarray, W: np.ndarray) -> np.ndarray:
        """Feature rows of the albums `ev` with their descriptor block replaced by W."""
        return np.hstack([self.A[ev], self.scale(W)])

    def reference(self, ev: np.ndarray) -> dict:
        """Real distances / ranks of the evaluated albums (cached per evaluation set)."""
        key = ev.tobytes()
        if key not in self._ref:
            D_real = cdist(self.X[ev], self.X)
            D_real[np.arange(len(ev)), ev] = BIG
            rank = rank_matrix(D_real)
            ref100 = top_k(D_real, min(100, self.n - 1))
            self._ref = {key: {"D_real": D_real, "rank": rank, "ref": ref100[:, : self.k]}}   # keep one set only
        return self._ref[key]

    # ------------------------------------------------ hubness

    def inbound_isolated(self, ev: np.ndarray, Dcol: np.ndarray, nn_d: np.ndarray | None = None,
                         members: dict | None = None) -> np.ndarray:
        """Number of OTHER albums that would list q when q alone has its predicted vector.
        Dcol[i, j] = distance between album j and the predicted q_i (inf on q's own column). Album j lists q iff
        fewer than k other albums are closer: threshold = j's k-th real neighbour distance, or its (k+1)-th if q
        is one of j's real top k. With the true vector this reproduces the real inbound count exactly."""
        nn_d = self.nn_d if nn_d is None else nn_d
        members = self._members if members is None else members
        thr_k, thr_k1 = nn_d[:, self.k - 1], nn_d[:, self.k]
        out = np.empty(len(ev), dtype=int)
        for i, e in enumerate(ev):
            c = Dcol[i] < thr_k
            m = members.get(int(e))
            if m is not None:
                c[m] = Dcol[i, m] <= thr_k1[m]
            c[e] = False
            out[i] = int(c.sum())
        return out

    def _base_lists(self, ev: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """For every album: its k nearest among the NON-evaluated albums (self excluded)."""
        key = ev.tobytes()
        if key not in self._base:
            idx, dist = self._knn(self.k, mask_cols=ev)
            self._base = {key: (dist, idx)}
        return self._base[key]

    def all_at_once(self, ev: np.ndarray, Q: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Replace all evaluated albums at once. Returns (their new lists (n_ev, k), new lists of everyone (n, k))."""
        Dq = cdist(Q, self.X)
        Dq[:, ev] = cdist(Q, Q)
        Dq[np.arange(len(ev)), ev] = BIG
        lists_ev = top_k(Dq, self.k)
        base_d, base_i = self._base_lists(ev)
        cand_d = np.hstack([base_d, Dq.T])
        cand_i = np.hstack([base_i, np.tile(ev, (self.n, 1))])
        order = np.argsort(cand_d, axis=1, kind="stable")[:, : self.k]
        lists = np.take_along_axis(cand_i, order, axis=1)
        lists[ev] = lists_ev
        return lists_ev, lists

    # ------------------------------------------------ local scaling (needs a site build change)

    def ls_real(self) -> dict:
        """The catalogue under full local scaling d'(x, y) = d(x, y) / sqrt(sig_x sig_y), sig = k-th NN distance."""
        if self._ls is None:
            nn_i, nn_d = self._knn(self.k + 1, col_scale=1.0 / np.sqrt(self.sig))
            members: dict[int, list[int]] = {}
            for j in range(self.n):
                for e in nn_i[j, : self.k]:
                    members.setdefault(int(e), []).append(j)
            self._ls = {"nn_i": nn_i, "nn_d": nn_d,
                        "members": {e: np.array(v, dtype=int) for e, v in members.items()},
                        "inbound": np.bincount(nn_i[:, : self.k].ravel(), minlength=self.n),
                        "overlap_with_site": float((nn_i[:, : self.k, None] == self.nn_i[:, None, : self.k]).any(2).mean())}
        return self._ls


def _mean(x: np.ndarray) -> float:
    return float(np.nanmean(x)) if np.isfinite(x).any() else float("nan")


def list_metrics(space: Space, ev: np.ndarray, pred: np.ndarray) -> dict:
    """Per-album metric arrays of the predicted lists `pred` (n_ev, k) against the real reference."""
    r = space.reference(ev)
    out = {"ov10": recall_into(pred, r["rank"], space.k), "R50": recall_into(pred, r["rank"], 50),
           "R100": recall_into(pred, r["rank"], 100), "RSQ": rsq(r["D_real"], pred, r["ref"]),
           "medrank": median_ref_rank(pred, r["rank"]),
           "ndcg": graded_ndcg(r["D_real"], pred, r["ref"], space.sigma_gain)}
    if space.fam is not None:
        out["genre"] = genre_agreement(pred, space.fam[ev], space.fam)
    return out


def summarise(per: dict) -> dict:
    out = {k: _mean(v) for k, v in per.items()}
    out["ov10_median"] = float(np.median(per["ov10"]))
    out["RSQ_median"] = float(np.median(per["RSQ"]))
    out["medrank"] = float(np.median(per["medrank"]))        # median over albums of the per-album median rank
    out["medrank_mean"] = _mean(per["medrank"])
    return out


def evaluate_space(space: Space, ev: np.ndarray, W: np.ndarray, *, all_at_once: bool = True,
                   retrieval: str = "euclid", keep_arrays: bool = False, W_col: np.ndarray | None = None) -> dict:
    """All metrics of one stop. ev = catalogue indices of the evaluated albums, W their (n_ev, 120) vectors.

    W_col      optional second vector per album ("asymmetric"): W is used for the album's OWN list, W_col is
               the vector the other albums see when their lists are computed (inbound). Needs a build change
               (two vectors per new album); isolated metrics only.
    retrieval  "euclid"     the site's k-NN (default);
               "ls-col"     the album's own list is plain Euclidean; only its column is locally scaled
                            (see ls-rowcol);
               "ls-rowcol"  local scaling applied only to the new album's row and column: its own list ranks
                            y by d(q, y) / sqrt(sig_y); another album j sees it at d(j, q) * sqrt(sig_med / sig_q)
                            (sig_q = distance from the predicted q to its k-th neighbour, sig_med = catalogue median);
               "ls-full"    every pair uses d / sqrt(sig_x sig_y); lists are still scored against the REAL
                            Euclidean reference, plus `ov10_vs_ls_real` against the locally-scaled real lists,
                            and inbound is compared with the locally-scaled real inbound.
    """
    ev = np.asarray(ev, dtype=int)
    k = space.k
    Q = space.queries(ev, W)
    Dq = cdist(Q, space.X)
    Dq[np.arange(len(ev)), ev] = BIG
    if W_col is None:
        Dc = Dq
    else:
        Dc = cdist(space.queries(ev, W_col), space.X)
        Dc[np.arange(len(ev)), ev] = BIG
        all_at_once = False
    extra: dict = {}
    if retrieval == "euclid":
        pred = top_k(Dq, k)
        after = space.inbound_isolated(ev, Dc)
        before = space.inbound_real[ev]
    else:
        sig_q = np.maximum(np.sort(Dc, axis=1)[:, k - 1], 1e-12)
        pred = top_k(Dq if retrieval == "ls-col" else Dq / np.sqrt(space.sig)[None, :], k)
        if retrieval in ("ls-rowcol", "ls-col"):
            after = space.inbound_isolated(ev, Dc * np.sqrt(np.median(space.sig) / sig_q)[:, None])
            before = space.inbound_real[ev]
        elif retrieval == "ls-full":
            assert W_col is None
            ls = space.ls_real()
            DL = Dq * (1.0 / np.sqrt(sig_q))[:, None] * (1.0 / np.sqrt(space.sig))[None, :]
            after = space.inbound_isolated(ev, DL, nn_d=ls["nn_d"], members=ls["members"])
            before = ls["inbound"][ev]
            extra["ov10_vs_ls_real"] = float((pred[:, :, None] == ls["nn_i"][ev][:, None, :k]).any(2).mean())
            extra["ls_real_overlap_with_site_lists"] = ls["overlap_with_site"]
        else:
            raise ValueError(retrieval)
    per = list_metrics(space, ev, pred)
    out = summarise(per)
    out.update(extra)
    h = hub_stats(before, after)
    out.update({"inb_ratio_iso": h["inb_ratio"], "zero_iso": h["zero"], "skew_iso": h["skew"], "max_iso": h["max"],
                "zero_before": h["zero_before"], "skew_before": h["skew_before"], "max_before": h["max_before"]})
    if space.fam is not None:
        r = space.reference(ev)
        out["genre_real"] = _mean(genre_agreement(r["ref"], space.fam[ev], space.fam))
        out["genre_random"] = _mean(genre_random(ev, space.fam))
    if all_at_once and retrieval == "euclid":
        lists_ev, lists = space.all_at_once(ev, Q)
        pa = summarise(list_metrics(space, ev, lists_ev))
        ha = hub_stats(space.inbound_real[ev], np.bincount(lists.ravel(), minlength=space.n)[ev])
        out.update({"ov10_all": pa["ov10"], "R50_all": pa["R50"], "RSQ_all": pa["RSQ"], "ndcg_all": pa["ndcg"],
                    "inb_ratio_all": ha["inb_ratio"], "zero_all": ha["zero"], "skew_all": ha["skew"]})
    if keep_arrays:
        out["arrays"] = {**per, "pred": pred, "inbound_before": before, "inbound_after": after}
    return out


def random_lists_eval(space: Space, ev: np.ndarray, seed: int = 0, reps: int = 20) -> dict:
    """Chance level: uniformly random lists (self excluded), averaged over `reps` draws."""
    rng = np.random.default_rng(seed)
    acc: dict[str, list] = {}
    for _ in range(reps):
        pred = np.empty((len(ev), space.k), dtype=int)
        for i, e in enumerate(ev):
            c = rng.choice(space.n - 1, size=space.k, replace=False)
            pred[i] = c + (c >= e)
        for name, v in summarise(list_metrics(space, ev, pred)).items():
            acc.setdefault(name, []).append(v)
    return {name: float(np.mean(v)) for name, v in acc.items()}


# ---------------------------------------------------------------- the site's catalogue

@lru_cache(maxsize=1)
def families() -> np.ndarray:
    """Primary-genre family (split.genre_family) of every catalogue album."""
    from downstream import catalogue
    from split import genre_family

    _, cat_rows, _ = catalogue()
    return np.array([genre_family(p) for p in load_genres()["primary"].to_numpy()[cat_rows]], dtype=object)


@lru_cache(maxsize=3)
def site_space(stop: str) -> Space:
    from downstream import catalogue

    sub, _, _ = catalogue()
    return Space(sub[AUDIO].to_numpy(dtype=np.float64), sub[DESCRIPTORS].to_numpy(dtype=np.float64), SLIDER[stop],
                 fam=families())


def catalogue_index(rows: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(catalogue indices of the rows that are in the catalogue, bool mask over `rows`). Rows that are not the
    first of their Spotify URI are not in the site catalogue and are skipped, as in downstream.py."""
    from downstream import catalogue

    _, _, row_to_cat = catalogue()
    rows = np.asarray(rows, dtype=int)
    in_cat = np.array([int(r) in row_to_cat for r in rows], dtype=bool)
    return np.array([row_to_cat[int(r)] for r in rows[in_cat]], dtype=int), in_cat


def evaluate(W: np.ndarray, rows: np.ndarray, *, stops: tuple[str, ...] = STOPS2, all_at_once: bool = True,
             retrieval: str = "euclid", W_col: np.ndarray | None = None, keep_arrays: bool = False) -> dict:
    """Recommendation quality when the descriptor columns of table rows `rows` are replaced by W (n, 120)."""
    W = np.asarray(W, dtype=np.float64)
    rows = np.asarray(rows, dtype=int)
    assert W.shape == (len(rows), len(DESCRIPTORS)) and np.isfinite(W).all() and (W >= 0).all(), W.shape
    assert len(set(rows.tolist())) == len(rows), "duplicate rows"
    ev, in_cat = catalogue_index(rows)
    out = {"n_eval": int(len(ev)), "n_skipped_not_in_catalogue": int((~in_cat).sum()),
           "mean_n_nonzero": float((W[in_cat] > 0).sum(1).mean()),
           "mean_l2": float(np.linalg.norm(W[in_cat], axis=1).mean()), "stops": {}}
    for stop in stops:
        out["stops"][stop] = evaluate_space(site_space(stop), ev, W[in_cat], all_at_once=all_at_once, retrieval=retrieval,
                                            W_col=None if W_col is None else np.asarray(W_col, dtype=np.float64)[in_cat],
                                            keep_arrays=keep_arrays)
    return out


def chance(rows: np.ndarray, stops: tuple[str, ...] = STOPS2) -> dict:
    ev, _ = catalogue_index(rows)
    return {"n_eval": int(len(ev)), "stops": {stop: random_lists_eval(site_space(stop), ev) for stop in stops}}


def main() -> None:
    import time

    from downstream import downstream_eval
    from weights import scores_to_weights

    t0 = time.perf_counter()
    rows = split_rows("val")
    true = evaluate(Y64[rows], rows)
    print(f"val: {true['n_eval']} albums evaluated ({true['n_skipped_not_in_catalogue']} not in the catalogue)")
    for stop, s in true["stops"].items():
        ok = all(abs(s[m] - 1) < 1e-12 for m in ("ov10", "R50", "R100", "RSQ", "ndcg", "inb_ratio_iso", "ov10_all", "inb_ratio_all"))
        print(f"  true vectors, {stop}: ov10 {s['ov10']:.3f} R50 {s['R50']:.3f} RSQ {s['RSQ']:.3f} nDCG {s['ndcg']:.3f} "
              f"medrank {s['medrank']:.1f} inbound iso {s['inb_ratio_iso']:.3f} all {s['inb_ratio_all']:.3f} "
              f"genre {s['genre']:.3f} (random {s['genre_random']:.3f}) -> {'EXACT' if ok else 'NOT EXACT'}")
        assert ok
    prevalence = (Y64[split_rows("train")] > 0).mean(0)
    W = scores_to_weights(np.tile(prevalence, (len(rows), 1)), k=10)
    mine, theirs = evaluate(W, rows), downstream_eval(W, rows, stops=STOPS2)
    for stop in STOPS2:
        a, b = mine["stops"][stop], theirs["stops"][stop]
        print(f"  most-frequent top-10, {stop}: isolated overlap {a['ov10']:.4f} (downstream.py {b['overlap_isolated']['mean']:.4f}), "
              f"all-at-once {a['ov10_all']:.4f} ({b['overlap']['mean']:.4f}), inbound ratio all "
              f"{a['inb_ratio_all']:.4f} ({b['inbound']['after_total'] / b['inbound']['before_total']:.4f})")
    ch = chance(rows)
    for stop, s in ch["stops"].items():
        print(f"  random lists, {stop}: ov10 {s['ov10']:.4f} R50 {s['R50']:.4f} R100 {s['R100']:.4f} RSQ {s['RSQ']:.4f} "
              f"nDCG {s['ndcg']:.4f} medrank {s['medrank']:.0f}")
    print(f"{time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
