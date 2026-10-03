"""Shared loading for the scaling analysis. Read-only on everything outside scaling/."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
WT = HERE.parents[3]
sys.path.insert(0, str(WT / "data-pipeline"))
from rmr_pipeline.constants import AUDIO, LYRIC_DROP, META  # noqa: E402
from rmr_pipeline.table import load_table, dedupe_table, descriptor_cols  # noqa: E402

REG = HERE.parent / "regions"
OUT = HERE / "out"
VOCAL = ["male vocals", "female vocals", "androgynous vocals"]


def load():
    albums = json.load(open(WT / "frontcreck/public/data/albums.json"))
    pos = json.load(open(WT / "frontcreck/public/data/positions.json"))
    P = {k: np.array(v, dtype=float).reshape(-1, 2) for k, v in pos.items()}
    df, _ = dedupe_table(load_table())
    assert len(df) == len(albums) and all(str(t) == a["t"] for t, a in zip(df["Title"], albums))
    dcols = descriptor_cols(df)
    Wt = df[dcols].astype(float).to_numpy()
    A = df[AUDIO].astype(float).to_numpy()
    Az = (A - A.mean(0)) / A.std(0)
    keys = [str(u) for u in df["URI"]]
    return dict(albums=albums, P=P, df=df, dcols=dcols, Wt=Wt, W=Wt > 0, Az=Az, keys=keys)
