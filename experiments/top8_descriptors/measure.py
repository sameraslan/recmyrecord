"""What cutting every album to its top 8 descriptors does to the site's lists, and equal against rank weights.

    cd data-pipeline
    PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> ../experiments/top8_descriptors/measure.py
        -> experiments/top8_descriptors/results/top8.json, results/top8.md

Read-only on the feature table, the catalog, the audio store (data-pipeline/audio) and the site data. No
network, no model. About a minute.

The lists are the build's own: rmr_pipeline.audio.site_matrix and rmr_pipeline.recs.top_k_neighbours at the
three stops, over the 4,081 albums of the site. Only the 120 descriptor columns change between variants. The
audio block is computed once, from today's rows (so the 101 imputed albums keep today's imputed block), and is
the same array in every variant.

Where a variant's 8 descriptors come from (`source`):
  T    the feature table. A cell is 1.5 - r/42, r the descriptor's 0-based place on the album's RYM page in the
       2022 scrape (getDescriptors.py), so the page order is the order of the weights. First 8 over all 176
       columns; the 56 lyric columns among them are then dropped by the build as today.
  Tnv  the same after removing the three vocals columns, which the 2026 sheet never lists.
  S    the sheet's `top_descriptors` of catalog/albums.csv (what the new albums have), in its order, with the
       four renamed lyric names mapped to the table's. The 468 existing albums without one fall back to Tnv.
Weights (`w`), by place p = 0..7 in the 8:
  today    the table's own values (T only): 1.5 - r/42 with the page place r.
  equal    one value.
  legacy   1.5 - p/42 (today's formula on the new place: 1.5 down to 1.333).
  half     1 - p/14 (1 down to 0.5).
  linear   8 - p (8 down to 1).
Scale. `raw`: each profile is scaled so that a full row of 8 has the euclidean length of the legacy profile
(4.01); `today` is left as it is. `matched`: the whole block is then multiplied by one number so that its total
variance (the sum of the 120 column variances over the 4,081 albums, which is half the mean squared distance
between two albums in the block) equals today's.

Every quality number here is an RYM-based proxy on the whole set. There is no held-out split and nobody listened.
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial.distance import cdist

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "data-pipeline"))

from rmr_pipeline.audio import audio_block, site_matrix  # noqa: E402
from rmr_pipeline.audio_store import DEFAULT_AUDIO  # noqa: E402
from rmr_pipeline.constants import AUDIO, DEFAULT_OUT, META, PIPELINE_DIR, SLIDER, STOPS  # noqa: E402
from rmr_pipeline.recs import top_k_neighbours  # noqa: E402
from rmr_pipeline.table import dedupe_table, descriptor_cols, load_table  # noqa: E402
from rmr_pipeline.vocab import build_vocab  # noqa: E402

TOP = 8
MIN_DESC = 5  # as experiments/audio_10k/sonic.MIN_DESC
VOCALS = {"male vocals", "female vocals", "androgynous vocals"}
RENAMED = {"antireligious": "anti-religious", "LGBTQ": "LGBT", "satanism": "satanic", "hedonism": "hedonistic"}
PROFILES = {
    "equal": np.ones(TOP),
    "legacy": 1.5 - np.arange(TOP) / 42,
    "half": 1 - np.arange(TOP) / 14,
    "linear": TOP - np.arange(TOP, dtype=float),
}
LEGACY_NORM = float(np.linalg.norm(PROFILES["legacy"]))
VARIANTS = [("T", "today")] + [(s, w) for s in ("T", "Tnv", "S") for w in PROFILES]
EXAMPLES = [("OK Computer", "Radiohead"), ("To Pimp a Butterfly", "Kendrick Lamar"), ("Kind of Blue", "Miles Davis"),
            ("Loveless", "My Bloody Valentine"), ("Abbey Road", "The Beatles")]


def split(text: str) -> list[str]:
    return [x.strip() for x in (text or "").split(",") if x.strip()]


def load():
    df = load_table()
    sub, _ = dedupe_table(df)
    cols = [c for c in sub.columns if c not in META and c not in AUDIO]  # the 176
    W = sub[cols].to_numpy(dtype=np.float64)
    with open(PIPELINE_DIR / "catalog" / "albums.csv", newline="", encoding="utf-8") as f:
        cat = list(csv.DictReader(f))[:len(sub)]
    assert [r["legacy_uri"] for r in cat] == [str(u) for u in sub["URI"]], "catalog and table are not in one order"
    return sub, cols, W, cat


def lists_of(W: np.ndarray, cols: list[str], cat: list[dict]) -> dict[str, list[list[str]]]:
    """Per source, each album's first 8 descriptor names in order."""
    known = set(cols)
    out = {"T": [], "Tnv": [], "S": [], "full": [], "sheet": []}
    for i, r in enumerate(cat):
        nz = np.flatnonzero(W[i] > 0)
        page = [cols[j] for j in nz[np.argsort(-W[i][nz], kind="stable")]]
        sheet = [RENAMED.get(x, x) for x in split(r["top_descriptors"])]
        nv = [d for d in page if d not in VOCALS][:TOP]
        out["full"].append(page)
        out["sheet"].append(sheet)
        out["T"].append(page[:TOP])
        out["Tnv"].append(nv)
        out["S"].append([d for d in sheet[:TOP]] if sheet else nv)
    assert all(len(set(x)) == len(x) for k in out for x in out[k])
    out["unknown_in_S"] = sum(d not in known for x in out["S"] for d in x)
    return out


def rows_for(names: list[list[str]], profile, cols: list[str], W: np.ndarray) -> np.ndarray:
    """The 176-column table a variant gives. `profile` None: today's own cell values."""
    at = {c: j for j, c in enumerate(cols)}
    out = np.zeros_like(W)
    for i, L in enumerate(names):
        for p, d in enumerate(L):
            if d in at:  # a sheet name the table has no column for adds nothing, but keeps its place
                out[i, at[d]] = W[i, at[d]] if profile is None else profile[p]
    return out


def total_variance(D: np.ndarray) -> float:
    return float(D.var(axis=0).sum())


def hub(lists: np.ndarray) -> dict:
    n10 = np.bincount(lists.ravel(), minlength=len(lists))
    return {"never": round(float((n10 == 0).mean()), 4), "max_n10": int(n10.max())}


class Proxies:
    """genre_primary and desc_jaccard as experiments/audio_10k/measure.py defines them. Genres: the sheet's
    first primary genre. Descriptors: `full` = every descriptor the feature table has for the album (176
    columns, as a set); `sheet` = the sheet's top descriptors. Pairs where both sides have at least 5."""

    def __init__(self, cat, full, sheet):
        g = [split(r["primary_genres"]) for r in cat]
        ids: dict[str, int] = {}
        self.primary = np.array([ids.setdefault(x[0], len(ids)) if x else -1 for x in g])
        self.sets = {"full": self._onehot(full), "sheet": self._onehot(sheet)}

    @staticmethod
    def _onehot(lists):
        v = {d: i for i, d in enumerate(sorted({x for L in lists for x in L}))}
        M = np.zeros((len(lists), len(v)), dtype=np.float32)
        for r, L in enumerate(lists):
            M[r, [v[x] for x in L]] = 1
        return M

    def per_seed(self, lists: np.ndarray) -> dict[str, np.ndarray]:
        seeds = np.arange(len(lists))[:, None]
        both = (self.primary[seeds] >= 0) & (self.primary[lists] >= 0)
        with np.errstate(invalid="ignore", divide="ignore"):
            gp = np.where(both.any(1), ((self.primary[seeds] == self.primary[lists]) & both).sum(1) / both.sum(1), np.nan)
            out = {"genre_primary": gp}
            for name, M in self.sets.items():
                n = M.sum(1)
                shared = np.einsum("sd,skd->sk", M, M[lists])
                ok = (n[seeds] >= MIN_DESC) & (n[lists] >= MIN_DESC)
                j = np.where(ok.any(1), np.where(ok, shared / (n[seeds] + n[lists] - shared), 0).sum(1) / ok.sum(1), np.nan)
                out[f"desc_jaccard_{name}"] = j
        return out

    def __call__(self, lists: np.ndarray) -> dict:
        v = self.per_seed(lists)
        out = {k: round(float(np.nanmean(x)), 4) for k, x in v.items()}
        out.update(genre_n=int((~np.isnan(v["genre_primary"])).sum()),
                   **{f"desc_n_{k}": int((~np.isnan(v[f"desc_jaccard_{k}"])).sum()) for k in self.sets})
        return out

    def paired(self, a: np.ndarray, b: np.ndarray) -> dict:
        """Mean per-seed difference a - b of each measure, with its standard error (seeds where both are defined)."""
        va, vb, out = self.per_seed(a), self.per_seed(b), {}
        for k in va:
            d = va[k] - vb[k]
            d = d[~np.isnan(d)]
            out[k] = {"diff": round(float(d.mean()), 4), "se": round(float(d.std(ddof=1) / np.sqrt(len(d))), 4), "n": int(len(d))}
        return out


def overlap(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.array([len(set(x) & set(y)) for x, y in zip(a.tolist(), b.tolist())])


def versus(lists: np.ndarray, base: np.ndarray, mask=None) -> dict:
    o = overlap(lists, base)
    same_order = (lists == base).all(1)
    if mask is not None:
        o, same_order = o[mask], same_order[mask]
    return {"mean_overlap": round(float(o.mean()), 3), "unchanged": round(float((o == 10).mean()), 4),
            "same_order": round(float(same_order.mean()), 4), "kept_le5": round(float((o <= 5).mean()), 4), "n": int(len(o))}


def ties_at_10(D: np.ndarray) -> float:
    """Share of albums whose 10th and 11th nearest albums are equally far in the descriptor columns alone:
    the audio block (or, without it, the row number) then decides who is in the list."""
    d = cdist(D, D, "sqeuclidean")
    np.fill_diagonal(d, np.inf)
    d.sort(axis=1)
    return round(float((np.abs(d[:, 10] - d[:, 9]) < 1e-9).mean()), 4)


def run() -> dict:
    sub, cols, W, cat = load()
    kept = descriptor_cols(sub)
    kj = [cols.index(c) for c in kept]
    names = lists_of(W, cols, cat)
    block = audio_block(sub, DEFAULT_AUDIO).block  # once, from today's rows
    prox = Proxies(cat, names["full"], names["sheet"])
    tv0 = total_variance(W[:, kj])

    def recs(table176: np.ndarray, factor: float = 1.0) -> dict[str, np.ndarray]:
        v = sub.copy()
        v[cols] = table176 * factor
        return {s: top_k_neighbours(site_matrix(v, block, SLIDER[s])) for s in STOPS}

    base = recs(W)
    site = json.loads((DEFAULT_OUT / "recs.json").read_text())
    res = {"n": len(sub), "audio_store": str(DEFAULT_AUDIO.relative_to(REPO)),
           "baseline_matches_site": {s: round(float((base[s] == np.array(site[s])).all(1).mean()), 4) for s in STOPS},
           "baseline": {s: {**prox(base[s]), **hub(base[s])} for s in STOPS},
           "baseline_total_variance": round(tv0, 4), "baseline_ties_at_10": ties_at_10(W[:, kj])}
    n_all = (W > 0).sum(1)
    n_kept = (W[:, kj] > 0).sum(1)
    res["counts"] = {
        "descriptors_per_album_176": {q: float(np.percentile(n_all, q)) for q in (5, 25, 50, 75, 95)},
        "mean_176": round(float(n_all.mean()), 2), "le8_of_176": int((n_all <= TOP).sum()),
        "mean_120": round(float(n_kept.mean()), 2), "le8_of_120": int((n_kept <= TOP).sum()),
        "vocals_in_first8": int(sum(any(d in VOCALS for d in L) for L in names["T"])),
        "sheet_list_present": int(sum(bool(L) for L in names["sheet"])), "sheet_names_without_column": names["unknown_in_S"]}
    few = n_all <= TOP

    out, lists_raw = {}, {}
    for src, w in VARIANTS:
        name = f"{src}_{w}"
        prof = None if w == "today" else PROFILES[w] * LEGACY_NORM / np.linalg.norm(PROFILES[w])
        tab = rows_for(names[src], prof, cols, W)
        tv = total_variance(tab[:, kj])
        match = float(np.sqrt(tv0 / tv))
        entry = {"total_variance_raw": round(tv, 4), "matched_factor": round(match, 4),
                 "mean_kept_columns": round(float((tab[:, kj] > 0).sum(1).mean()), 2),
                 "ties_at_10": ties_at_10(tab[:, kj]), "scales": {}}
        for scale, f in (("raw", 1.0), ("matched", match)):
            r = recs(tab, f)
            if scale == "raw":
                lists_raw[name] = r
            entry["scales"][scale] = {s: {**versus(r[s], base[s]), **prox(r[s]), **hub(r[s])} for s in STOPS}
        entry["mood_raw_albums_le8"] = versus(lists_raw[name]["mood"], base["mood"], few)
        entry["mood_raw_albums_gt8"] = versus(lists_raw[name]["mood"], base["mood"], ~few)
        vocab, tops = build_vocab(sub.assign(**{c: tab[:, j] for j, c in enumerate(cols)}))
        entry["display"] = {"vocab_words": len(vocab), "mean_shown": round(float(np.mean([len(t) for t in tops])), 2),
                            "albums_showing_none": int(sum(not t for t in tops)),
                            "shown_hist": np.bincount([len(t) for t in tops], minlength=11).tolist()}
        out[name] = entry
        print(name, entry["scales"]["raw"]["mood"]["mean_overlap"], flush=True)
    res["variants"] = out
    vocab0, tops0 = build_vocab(sub)
    res["display_today"] = {"vocab_words": len(vocab0), "mean_shown": round(float(np.mean([len(t) for t in tops0])), 2),
                            "albums_showing_none": int(sum(not t for t in tops0)),
                            "shown_hist": np.bincount([len(t) for t in tops0], minlength=11).tolist()}

    # Equal against rank, directly; and the two readings of one album (2022 page, 2026 sheet) against each other.
    has_sheet = np.array([bool(L) for L in names["sheet"]])
    res["equal_vs_rank"] = {f"{src}_{w}": {s: versus(lists_raw[f"{src}_{w}"][s], lists_raw[f"{src}_equal"][s]) for s in STOPS}
                            for src in ("T", "S") for w in ("legacy", "half", "linear")}
    res["two_readings"] = {w: {s: versus(lists_raw[f"Tnv_{w}"][s], lists_raw[f"S_{w}"][s], has_sheet) for s in STOPS}
                           for w in PROFILES}
    res["paired"] = {f"{a} minus {b}": {s: prox.paired(lists_raw[a][s], lists_raw[b][s]) for s in ("balanced", "mood")}
                     for a, b in (("S_half", "S_equal"), ("S_legacy", "S_equal"), ("S_linear", "S_equal"),
                                  ("T_half", "T_equal"), ("T_legacy", "T_equal"), ("T_linear", "T_equal"))}
    res["two_readings_lists"] = {
        "jaccard_first8": round(float(np.mean([len(set(a) & set(b)) / len(set(a) | set(b))
                                               for a, b, h in zip(names["Tnv"], names["S"], has_sheet) if h])), 3),
        "same_set": round(float(np.mean([set(a[:len(b)]) == set(b) for a, b, h in zip(names["Tnv"], names["S"], has_sheet) if h])), 4),
        "same_order": round(float(np.mean([a[:len(b)] == b for a, b, h in zip(names["Tnv"], names["S"], has_sheet) if h])), 4)}

    label = [f"{t} ({a})" for t, a in zip(sub["Title"].astype(str), sub["Artist"].astype(str))]
    res["examples"] = []
    for title, artist in EXAMPLES:
        hit = np.flatnonzero((sub["Title"].astype(str) == title).to_numpy() & sub["Artist"].astype(str).str.startswith(artist).to_numpy())
        if not len(hit):
            continue
        i = int(hit[0])
        ex = {"album": f"{title} ({artist})", "table_first8": names["T"][i], "table_all": len(names["full"][i]),
              "sheet": names["sheet"][i], "today": [label[j] for j in base["mood"][i]]}
        for v in ("T_equal", "T_half", "T_linear", "S_equal", "S_linear"):
            ex[v] = [label[j] for j in lists_raw[v]["mood"][i]]
            ex[v + "_kept"] = int(len(set(lists_raw[v]["mood"][i]) & set(base["mood"][i])))
        res["examples"].append(ex)
    return res


def table(header, rows):
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)] + ["| " + " | ".join(map(str, r)) + " |" for r in rows] + [""]


def pct(x):
    return f"{100 * x:.1f}%"


def markdown(res: dict) -> str:
    L = ["# Top 8 descriptors: what the cut does to the existing albums' lists", "",
         f"All {res['n']:,} albums of the site, audio block fixed (`{res['audio_store']}`, computed once from today's rows). "
         "Written by `measure.py`; its docstring defines the sources (T, Tnv, S), the weights and the two scales. "
         "Every quality column is an RYM-based proxy on the whole set: no held-out split, nobody listened.", "",
         "Baseline reproduces `frontcreck/public/data/recs.json`: "
         + ", ".join(f"{s} {pct(v)} of lists identical" for s, v in res["baseline_matches_site"].items()) + ".", ""]
    c = res["counts"]
    L += ["## Counts", "",
          f"- Descriptors per album in the table (176 columns): mean {c['mean_176']}, percentiles 5/25/50/75/95 = "
          + "/".join(f"{v:g}" for v in c["descriptors_per_album_176"].values()) + f". {c['le8_of_176']:,} albums have 8 or fewer.",
          f"- Of the 120 columns the recommender keeps: mean {c['mean_120']}; {c['le8_of_120']:,} albums have 8 or fewer.",
          f"- {c['vocals_in_first8']:,} albums have a vocals descriptor among their first 8 in the table; the sheet lists none.",
          f"- {c['sheet_list_present']:,} existing albums have a sheet list; {c['sheet_names_without_column']} of the names in them have no table column.",
          f"- Sheet list against the table's first 8 without vocals, same albums: Jaccard {res['two_readings_lists']['jaccard_first8']}, "
          f"same set {pct(res['two_readings_lists']['same_set'])}, same order {pct(res['two_readings_lists']['same_order'])}.", ""]
    for scale in ("raw", "matched"):
        L += [f"## Against today's lists, scale `{scale}`", ""]
        for s in STOPS:
            b = res["baseline"][s]
            rows = [["today", "", "", "", "", b["genre_primary"], b["desc_jaccard_full"], b["desc_jaccard_sheet"], pct(b["never"]), b["max_n10"]]]
            for name, e in res["variants"].items():
                m = e["scales"][scale][s]
                rows.append([name, m["mean_overlap"], pct(m["unchanged"]), pct(m["same_order"]), pct(m["kept_le5"]),
                             m["genre_primary"], m["desc_jaccard_full"], m["desc_jaccard_sheet"], pct(m["never"]), m["max_n10"]])
            L += [f"### {s} (slider {SLIDER[s]})", ""] + table(
                ["variant", "kept of 10", "same 10", "same 10, same order", "5 or fewer kept", "genre_primary",
                 "desc_jaccard (full table set)", "desc_jaccard (sheet)", "never recommended", "max N10"], rows)
    b = res["baseline"]["mood"]
    L += [f"genre_primary n = {b['genre_n']:,} seeds (those with a sheet genre); desc_jaccard n = {b['desc_n_full']:,} (full) and "
          f"{b['desc_n_sheet']:,} (sheet).", "",
          "## The descriptor block itself", ""] + table(
        ["variant", "kept columns per album", "total variance, raw", "factor for `matched`", "10th and 11th tie"],
        [["today", res["counts"]["mean_120"], res["baseline_total_variance"], 1, pct(res["baseline_ties_at_10"])]]
        + [[n, e["mean_kept_columns"], e["total_variance_raw"], e["matched_factor"], pct(e["ties_at_10"])] for n, e in res["variants"].items()])
    L += ["## Mood stop, raw: albums with 8 or fewer descriptors against the others", ""] + table(
        ["variant", "kept of 10, 8 or fewer", "same 10", "kept of 10, more than 8", "same 10"],
        [[n, e["mood_raw_albums_le8"]["mean_overlap"], pct(e["mood_raw_albums_le8"]["unchanged"]),
          e["mood_raw_albums_gt8"]["mean_overlap"], pct(e["mood_raw_albums_gt8"]["unchanged"])] for n, e in res["variants"].items()])
    L += ["## Equal against rank weights, same 8 descriptors (raw)", "", "Lists of the rank variant against the equal variant of the same source.", ""] + table(
        ["variant"] + [f"{s}: kept of 10" for s in STOPS] + ["mood: same 10"],
        [[n] + [v[s]["mean_overlap"] for s in STOPS] + [pct(v["mood"]["unchanged"])] for n, v in res["equal_vs_rank"].items()])
    L += ["## Rank minus equal on the proxies, paired by seed (raw)", "",
          "Mean difference per seed, plus or minus one standard error. `desc_jaccard (sheet)` is not shown for S: "
          "the S lists are built from that same sheet list.", ""] + table(
        ["comparison", "stop", "genre_primary", "desc_jaccard (full table set)"],
        [[n, s, f"{v[s]['genre_primary']['diff']:+.4f} ± {v[s]['genre_primary']['se']:.4f}",
          f"{v[s]['desc_jaccard_full']['diff']:+.4f} ± {v[s]['desc_jaccard_full']['se']:.4f}"]
         for n, v in res["paired"].items() for s in ("balanced", "mood")])
    L += ["## Two readings of one album: 2022 page (Tnv) against 2026 sheet (S), raw", "",
          "The same weighting on both. A weighting that leans on the order also leans on how the order moved in four years. "
          f"Seeds: the {res['two_readings']['equal']['mood']['n']:,} albums with a sheet list.", ""] + table(
        ["weights"] + [f"{s}: kept of 10" for s in STOPS] + ["mood: same 10"],
        [[w] + [v[s]["mean_overlap"] for s in STOPS] + [pct(v["mood"]["unchanged"])] for w, v in res["two_readings"].items()])
    d = res["display_today"]
    L += ["## Mood words shown on an album (`d` in albums.json)", ""] + table(
        ["variant", "vocabulary", "mean words shown", "albums showing none"] + [str(k) for k in range(11)],
        [["today", d["vocab_words"], d["mean_shown"], d["albums_showing_none"]] + d["shown_hist"]]
        + [[n, e["display"]["vocab_words"], e["display"]["mean_shown"], e["display"]["albums_showing_none"]] + e["display"]["shown_hist"]
           for n, e in res["variants"].items() if n in ("T_today", "T_equal", "Tnv_equal", "S_equal")])
    L += ["The columns 0 to 10 count albums by number of words shown.", "", "## Examples, mood stop (raw)", ""]
    for ex in res["examples"]:
        L += [f"### {ex['album']}", "", f"Table, first 8 of {ex['table_all']}: {', '.join(ex['table_first8'])}.",
              f"Sheet: {', '.join(ex['sheet']) or 'none'}.", "", f"- **today**: {'; '.join(ex['today'])}"]
        L += [f"- **{v}** ({ex[v + '_kept']} of 10 kept): {'; '.join(ex[v])}" for v in ("T_equal", "T_half", "T_linear", "S_equal", "S_linear")]
        L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    result = run()
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / "top8.json").write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (HERE / "results" / "top8.md").write_text(markdown(result) + "\n", encoding="utf-8")
    print("wrote results/top8.json and results/top8.md")
