"""Label-agreement evidence and arithmetic ceilings. Labels only; no model, no predictions.

    .venv/bin/python ceiling.py

1. Duplicate-URI rows (what dedupe_table drops). Each pair is classified from the table itself:
     same title + shared artist name  -> candidate "same album, two RYM entries"
     shared artist name               -> same artist, different album
     otherwise                        -> unrelated albums that the Spotify search mapped to one URI
   One row's weight vector is used as the score for the other (both directions, averaged), with exactly
   the functions of metrics.py (min_score=0: a list shorter than 10 is not padded).
2. Re-scrapes: albums_audio_features.pkl + descriptors_data_priori_-4415.pkl (the 4,413-row pre-merge
   tables) contain albums that were scraped twice under the same Title + Artist; all_data keeps the first.
3. Arithmetic ceiling of precision@10 / recall@10 from each album's descriptor count.
4. Context, not a ceiling: agreement between two different albums of the same artist credit (train rows).
"""
from __future__ import annotations

from itertools import combinations

import numpy as np
import pandas as pd

import metrics as M
from common import ALL_DESCRIPTORS, DESCRIPTORS, LABELLED, N_DESC, REPO, TABLE, Y64, load_splits, norm_text
from rmr_pipeline.artists import clean_artist
from split import artist_names, variant_links

PRIORI = REPO / "data-retrieval" / "Recommender" / "data" / "descriptors_data_priori_-4415.pkl"
AUDIO_FEATURES = REPO / "data-retrieval" / "Spotify API Connection" / "albums_audio_features.pkl"


def pair_agreement(Ya: np.ndarray, Yb: np.ndarray) -> dict:
    """Symmetric agreement between paired weight matrices (row i of Ya vs row i of Yb)."""
    out = {"n_pairs": int(len(Ya))}
    for name, fn in (("precision@10", M.precision_at_k), ("recall@10", M.recall_at_k), ("ndcg@10", M.ndcg_at_k)):
        out[name] = float((fn(Ya, Yb, 10, min_score=0).mean() + fn(Yb, Ya, 10, min_score=0).mean()) / 2)
    out["jaccard"] = float(M.set_metrics(Ya, Yb)["jaccard"].mean())
    out["identical"] = int((Ya == Yb).all(1).sum())
    return out


def _fmt(d: dict) -> str:
    return (f"n={d['n_pairs']:3d}  P@10 {d['precision@10']:.3f}  R@10 {d['recall@10']:.3f}  "
            f"nDCG@10 {d['ndcg@10']:.3f}  Jaccard {d['jaccard']:.3f}  identical vectors {d['identical']}")


def _shares_artist(a: str, b: str) -> bool:
    na, nb = artist_names(a), artist_names(b)
    if na & nb:
        return True
    return any((x in na and y in nb) or (x in nb and y in na) for x, y in variant_links(na | nb))


def duplicate_uri_pairs() -> pd.DataFrame:
    rows = []
    for uri, idx in TABLE.groupby("URI").indices.items():
        idx = [int(i) for i in idx if LABELLED[i]]
        for a, b in combinations(idx, 2):
            ta, tb = TABLE.at[a, "Title"], TABLE.at[b, "Title"]
            aa, ab = TABLE.at[a, "Artist"], TABLE.at[b, "Artist"]
            same_artist = _shares_artist(aa, ab)
            same_title = norm_text(ta) == norm_text(tb)
            kind = ("same title, shared artist" if same_title and same_artist
                    else "same artist, different album" if same_artist else "unrelated albums")
            rows.append({"a": a, "b": b, "kind": kind, "title_a": ta, "artist_a": clean_artist(aa),
                         "title_b": tb, "artist_b": clean_artist(ab), "n_a": int(N_DESC[a]), "n_b": int(N_DESC[b])})
    return pd.DataFrame(rows)


def rescrape_pairs() -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    """Pairs of rows of the pre-merge tables with the same Title + Artist (first occurrence vs each later)."""
    af = pd.read_pickle(AUDIO_FEATURES).reset_index(drop=True)
    pri = pd.read_pickle(PRIORI).reset_index(drop=True)
    assert len(af) == len(pri)
    D = pri[DESCRIPTORS].to_numpy(dtype=np.float64)
    full = pri[ALL_DESCRIPTORS].to_numpy(dtype=np.float64)
    first: dict = {}
    A, B, info = [], [], []
    for i, key in enumerate(zip(af["Title"], af["Artist"])):
        if key in first:
            j = first[key]
            if (D[i] > 0).any() and (D[j] > 0).any():
                A.append(D[j]); B.append(D[i])
                info.append({"first_row": j, "later_row": i, "title": key[0], "artist": key[1],
                             "identical_176": bool((full[i] == full[j]).all()),
                             "n_first": int((D[j] > 0).sum()), "n_later": int((D[i] > 0).sum())})
        else:
            first[key] = i
    return np.array(A), np.array(B), pd.DataFrame(info)


def same_artist_context(split_name: str = "train") -> dict:
    """Every unordered pair of different albums with the same cleaned artist credit inside one split."""
    rows = np.flatnonzero(load_splits() == split_name)
    credit = TABLE["Artist"].astype(str).map(clean_artist).map(norm_text).to_numpy()
    by: dict = {}
    for r in rows:
        by.setdefault(credit[r], []).append(int(r))
    pairs = [(a, b) for rs in by.values() for a, b in combinations(rs, 2)
             if TABLE.at[a, "URI"] != TABLE.at[b, "URI"]]
    a, b = np.array(pairs).T
    return pair_agreement(Y64[a], Y64[b])


def random_pair_context(split_name: str = "train", n: int = 20000, seed: int = 0) -> dict:
    rows = np.flatnonzero(load_splits() == split_name)
    rng = np.random.default_rng(seed)
    a, b = rng.choice(rows, n), rng.choice(rows, n)
    keep = a != b
    return pair_agreement(Y64[a[keep]], Y64[b[keep]])


def main() -> None:
    pd.set_option("display.width", 250, "display.max_colwidth", 44, "display.max_rows", 100)
    print("== 1. duplicate-URI rows ==")
    pairs = duplicate_uri_pairs()
    n_groups = int((TABLE.groupby("URI").size() > 1).sum())
    print(f"{n_groups} URIs shared by {int(TABLE['URI'].duplicated(keep=False).sum())} rows -> {len(pairs)} labelled pairs")
    print(pairs[["a", "b", "kind", "title_a", "artist_a", "title_b", "artist_b", "n_a", "n_b"]].to_string(index=False))
    print()
    for kind in ["same title, shared artist", "same artist, different album", "unrelated albums"]:
        p = pairs[pairs["kind"] == kind]
        if len(p):
            print(f"{kind:30s} {_fmt(pair_agreement(Y64[p['a'].to_numpy()], Y64[p['b'].to_numpy()]))}")
    print(f"{'all duplicate-URI pairs':30s} {_fmt(pair_agreement(Y64[pairs['a'].to_numpy()], Y64[pairs['b'].to_numpy()]))}")

    print("\n== 2. re-scraped albums in the pre-merge tables (same Title + Artist scraped twice) ==")
    A, B, info = rescrape_pairs()
    print(info.to_string(index=False))
    print(f"{'all re-scrape pairs':30s} {_fmt(pair_agreement(A, B))}")
    diff = ~info["identical_176"].to_numpy()
    if diff.any():
        print(f"{'pairs that differ':30s} {_fmt(pair_agreement(A[diff], B[diff]))}")

    print("\n== 3. arithmetic ceiling (labelled rows) ==")
    split = load_splits()
    for name, mask in [("all labelled", LABELLED), ("train", split == "train"), ("val", split == "val"), ("test", split == "test")]:
        p, r = M.max_precision_recall_at_k(Y64[mask], 10)
        n = N_DESC[mask]
        print(f"{name:13s} n={int(mask.sum()):4d}  max P@10 {p.mean():.4f}  max R@10 {r.mean():.4f}  "
              f"albums with <10 descriptors {np.mean(n < 10):.3f}  with >10 {np.mean(n > 10):.3f}  mean count {n.mean():.2f}")

    print("\n== 4. context (train rows only; NOT a label-noise ceiling) ==")
    print(f"{'same artist credit, other album':32s} {_fmt(same_artist_context('train'))}")
    print(f"{'two random albums':32s} {_fmt(random_pair_context('train'))}")


if __name__ == "__main__":
    main()
