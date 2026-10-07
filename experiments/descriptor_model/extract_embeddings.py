"""Per-track audio embeddings from 30 s Deezer / iTunes previews, pooled per album.

Audio is NEVER written to disk: previews are downloaded into memory, decoded
from memory with PyAV, embedded, and dropped. Because of that every encoder has
to run in this one pass.

Encoders (per track, all stored float16):
  effnet   (1280,)     Essentia Discogs-EffNet (discogs-effnet-bs64-1), mean over patches   [CPU, TF]
  heads    (H,)        Essentia classifier heads on the EffNet embedding, mean over patches;
                       names in cache/head_columns.json                                      [CPU, TF]
  clap     (512,)      laion/clap-htsat-unfused audio projection; 3 windows of ~10 s,
                       each L2-normalised, then averaged                                     [MPS]
  maest    (13, 768)   mtg-upf/discogs-maest-30s-pw-129e, mean over patch tokens of ALL
                       hidden states (index 0 = patch embeddings, 1..12 = transformer
                       blocks, so "block 7" is index 7, final block is index 12)             [MPS]
  mert     (13, 768)   m-a-p/MERT-v1-95M, time-mean of ALL hidden states (0 = CNN features,
                       1..12 = transformer layers); run on 3 windows of ~10 s and averaged
                       (MPS cannot run the conv front-end on a full 30 s clip)               [MPS, fp16]
  mert_v2  (24, 1024)  m-a-p/MERT-v2-30s, time-mean of ALL 24 blocks (index 0 = block 1),
                       whole 30 s clip                                                       [MPS, fp16]

Processes: N CPU workers (decode, EffNet + heads, CLAP mel features; ~0.85 GB RAM each) feed one
torch worker that owns the GPU (~5 GB). The GPU is the bottleneck when all encoders are on.

Outputs:
  cache/tracks/*.npz        resumable shards of per-track vectors (see write_shard)
  cache/embeddings.parquet  one row per album row (mean over its tracks)
  cache/extract.log         progress log

  .venv-audio/bin/python extract_embeddings.py --limit 40          # pilot
  .venv-audio/bin/python extract_embeddings.py                     # everything (resumes)
  .venv-audio/bin/python extract_embeddings.py --finalize          # only rebuild embeddings.parquet
"""
from __future__ import annotations

import argparse
import io
import json
import logging
import multiprocessing as mp
import os
import random
import signal
import sys
import threading
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
TRACKS_DIR = CACHE / "tracks"
MODELS = CACHE / "models"
ESS_DIR = MODELS / "essentia"
HF_DIR = MODELS / "hf"
MATCHES = CACHE / "matches.parquet"
EMB_OUT = CACHE / "embeddings.parquet"
HEAD_COLUMNS = CACHE / "head_columns.json"
LOG_FILE = CACHE / "extract.log"

MAX_TRACKS = 8
SHARD_ALBUMS = 25
CLIP_SECONDS = 30.0

ESS_BASE = "https://essentia.upf.edu/models"
EFFNET_PB = "feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb"
EFFNET_EMB_NODE = "PartitionedCall:1"
# (directory, file stem) under classification-heads/. Missing ones are skipped with a warning.
HEADS = [
    ("mtg_jamendo_moodtheme", "mtg_jamendo_moodtheme-discogs-effnet-1"),
    ("mtg_jamendo_genre", "mtg_jamendo_genre-discogs-effnet-1"),
    ("mtg_jamendo_instrument", "mtg_jamendo_instrument-discogs-effnet-1"),
    ("mtg_jamendo_top50tags", "mtg_jamendo_top50tags-discogs-effnet-1"),
    ("mtt", "mtt-discogs-effnet-1"),
    ("genre_discogs400", "genre_discogs400-discogs-effnet-1"),
    ("genre_electronic", "genre_electronic-discogs-effnet-1"),
    ("genre_rosamerica", "genre_rosamerica-discogs-effnet-1"),
    ("mood_happy", "mood_happy-discogs-effnet-1"),
    ("mood_sad", "mood_sad-discogs-effnet-1"),
    ("mood_aggressive", "mood_aggressive-discogs-effnet-1"),
    ("mood_relaxed", "mood_relaxed-discogs-effnet-1"),
    ("mood_party", "mood_party-discogs-effnet-1"),
    ("mood_electronic", "mood_electronic-discogs-effnet-1"),
    ("mood_acoustic", "mood_acoustic-discogs-effnet-1"),
    ("danceability", "danceability-discogs-effnet-1"),
    ("voice_instrumental", "voice_instrumental-discogs-effnet-1"),
    ("gender", "gender-discogs-effnet-1"),
    ("approachability", "approachability_2c-discogs-effnet-1"),
    ("approachability", "approachability_3c-discogs-effnet-1"),
    ("approachability", "approachability_regression-discogs-effnet-1"),
    ("engagement", "engagement_2c-discogs-effnet-1"),
    ("engagement", "engagement_3c-discogs-effnet-1"),
    ("engagement", "engagement_regression-discogs-effnet-1"),
    ("timbre", "timbre-discogs-effnet-1"),
    ("tonal_atonal", "tonal_atonal-discogs-effnet-1"),
    ("nsynth_bright_dark", "nsynth_bright_dark-discogs-effnet-1"),
    ("nsynth_acoustic_electronic", "nsynth_acoustic_electronic-discogs-effnet-1"),
    ("nsynth_reverb", "nsynth_reverb-discogs-effnet-1"),
]

# NOT laion/larger_clap_music: with transformers 4.57.6 that checkpoint loads with no missing keys but is
# degenerate here (text-text cosine 0.999 for unrelated prompts, uniform audio-text logits, audio-audio
# cosine 0.83-0.96 regardless of genre). clap-htsat-unfused passes the same zero-shot check.
CLAP_ID = "laion/clap-htsat-unfused"
MAEST_ID = "mtg-upf/discogs-maest-30s-pw-129e"
MERT_ID = "m-a-p/MERT-v1-95M"
MERT2_ID = "m-a-p/MERT-v2-30s"

VECTOR_KEYS = ["effnet", "heads", "clap", "maest", "mert", "mert_v2"]
UA = {"User-Agent": "recmyrecord-descriptor-experiment/0.1 (research; embedding extraction)"}

log = logging.getLogger("extract")


# ==========================================================================
# audio decoding (memory only)
# ==========================================================================
def decode_audio(blob: bytes, sr: int, max_seconds: float = CLIP_SECONDS) -> np.ndarray:
    """mp3 / m4a bytes -> mono float32 at `sr`, decoded entirely in memory."""
    import av

    out = []
    with av.open(io.BytesIO(blob)) as c:
        rs = av.AudioResampler(format="flt", layout="mono", rate=sr)
        for frame in c.decode(audio=0):
            for f in rs.resample(frame):
                out.append(f.to_ndarray()[0])
        for f in rs.resample(None):
            out.append(f.to_ndarray()[0])
    a = np.concatenate(out).astype(np.float32, copy=False)
    a = a[: int(max_seconds * sr)]
    if a.size < sr * 3:
        raise ValueError(f"clip too short ({a.size / sr:.1f}s)")
    if not np.isfinite(a).all():
        raise ValueError("non-finite samples")
    return a


def windows(a: np.ndarray, sr: int, win_s: float = 10.0, max_windows: int = 3) -> list[np.ndarray]:
    """Split a clip into up to 3 equal non-overlapping windows of about 10 s."""
    n = int(min(max_windows, max(1, round(a.size / (win_s * sr)))))
    step = a.size // n
    return [a[i * step : (i + 1) * step] for i in range(n)]  # equal lengths (drops < n samples)


# ==========================================================================
# model files
# ==========================================================================
def _download(url: str, dest: Path, tries: int = 4):
    import requests

    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for i in range(tries):
        try:
            r = requests.get(url, timeout=120, headers=UA)
            if r.status_code == 404:
                return False
            r.raise_for_status()
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(r.content)
            tmp.rename(dest)
            return True
        except Exception as e:
            log.warning("download %s failed (%s), retry %d", url, e, i + 1)
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"could not download {url}")


def prepare_essentia_models() -> tuple[str, list[dict], list[str]]:
    """Download EffNet + heads; returns (effnet path, head specs, flat head column names)."""
    eff = ESS_DIR / Path(EFFNET_PB).name
    _download(f"{ESS_BASE}/{EFFNET_PB}", eff)
    specs, names = [], []
    for d, stem in HEADS:
        pb, js = ESS_DIR / f"{stem}.pb", ESS_DIR / f"{stem}.json"
        ok = _download(f"{ESS_BASE}/classification-heads/{d}/{stem}.json", js) and _download(
            f"{ESS_BASE}/classification-heads/{d}/{stem}.pb", pb
        )
        if not ok:
            log.warning("head %s not available as a discogs-effnet head; skipped", stem)
            continue
        meta = json.loads(js.read_text())
        sch = meta["schema"]
        outs = [o for o in sch["outputs"] if o.get("output_purpose") == "predictions"] or sch["outputs"][:1]
        short = stem.replace("-discogs-effnet-1", "")
        classes = meta.get("classes") or [str(i) for i in range(int(outs[0]["shape"][-1]))]
        specs.append({"name": short, "pb": str(pb), "input": sch["inputs"][0]["name"], "output": outs[0]["name"],
                      "n": len(classes)})
        names += [f"{short}__{c}" for c in classes]
    HEAD_COLUMNS.write_text(json.dumps(names, ensure_ascii=False, indent=0))
    return str(eff), specs, names


# ==========================================================================
# CPU worker processes: decode + Essentia (EffNet, heads) + CLAP mel features
# ==========================================================================
_ESS = {}


def _cpu_init(effnet_pb: str, head_specs: list[dict], tf_threads: int = 1):
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    # processes are the parallelism; stop TensorFlow from also spawning a thread per core in each of them
    os.environ["TF_NUM_INTRAOP_THREADS"] = str(tf_threads)
    os.environ["TF_NUM_INTEROP_THREADS"] = "1"
    os.environ["OMP_NUM_THREADS"] = str(tf_threads)
    import warnings

    warnings.filterwarnings("ignore")
    import essentia

    essentia.log.infoActive = False
    essentia.log.warningActive = False
    from essentia.standard import TensorflowPredict2D, TensorflowPredictEffnetDiscogs

    _ESS["effnet"] = TensorflowPredictEffnetDiscogs(graphFilename=effnet_pb, output=EFFNET_EMB_NODE)
    _ESS["heads"] = [
        (h["name"], h["n"], TensorflowPredict2D(graphFilename=h["pb"], input=h["input"], output=h["output"]))
        for h in head_specs
    ]
    from transformers import ClapFeatureExtractor  # numpy only; the mel front-end is the slow part of CLAP

    _ESS["clap_fe"] = ClapFeatureExtractor.from_pretrained(CLAP_ID, cache_dir=str(HF_DIR))


def _cpu_ping():
    return os.getpid()


def _cpu_track(blob: bytes, want24: bool, want16: bool):
    """One preview -> dict(effnet[1280], heads[H], clap_in[n_win,1,T,64], a24, a16, t_ess, t_clap_fe)
    or an error string. Audio only ever exists as in-memory arrays."""
    try:
        t0 = time.perf_counter()
        a16 = decode_audio(blob, 16000)
        emb = np.asarray(_ESS["effnet"](a16), dtype=np.float32)  # (patches, 1280)
        if emb.ndim != 2 or emb.shape[0] == 0:
            return "effnet returned no patches"
        outs = []
        for name, n, model in _ESS["heads"]:
            p = np.asarray(model(emb), dtype=np.float32).reshape(emb.shape[0], -1)
            if p.shape[1] != n:
                return f"head {name}: expected {n} outputs, got {p.shape[1]}"
            outs.append(p.mean(0))
        eff, heads = emb.mean(0), np.concatenate(outs)
        if not (np.isfinite(eff).all() and np.isfinite(heads).all()):
            return "non-finite essentia output"
        t1 = time.perf_counter()
        a48 = decode_audio(blob, 48000)
        x = _ESS["clap_fe"](windows(a48, 48000), sampling_rate=48000, return_tensors="np")
        clap_in = np.asarray(x["input_features"], dtype=np.float32)
        a24 = decode_audio(blob, 24000) if want24 else None
        t2 = time.perf_counter()
        return {"effnet": eff, "heads": heads, "clap_in": clap_in, "a24": a24, "a16": a16 if want16 else None,
                "t_ess": t1 - t0, "t_prep": t2 - t1}
    except Exception as e:  # decode / inference failure for this one track
        return f"{type(e).__name__}: {e}"


# ==========================================================================
# torch worker (single process, MPS)
# ==========================================================================
_T = {}


def _torch_init(cfg: dict):
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    import warnings

    warnings.filterwarnings("ignore")
    import torch
    import transformers
    from transformers import AutoFeatureExtractor, AutoModel, ClapAudioModelWithProjection, Wav2Vec2FeatureExtractor

    transformers.logging.set_verbosity_error()
    torch.set_num_threads(2)
    dev = cfg["device"]
    if dev == "auto":
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
    _T.update(cfg=cfg, dev=dev, torch=torch)
    hf = str(HF_DIR)

    half = dev == "mps"  # fp16 on the GPU: this 16 GB machine swaps otherwise; everything is stored as float16 anyway
    _T["half"] = half
    # audio tower + projection only (same vectors as ClapModel.get_audio_features, without the text tower in RAM)
    _T["clap"] = ClapAudioModelWithProjection.from_pretrained(CLAP_ID, cache_dir=hf).eval().to(dev)
    if cfg["maest"]:
        _T["maest_fe"] = AutoFeatureExtractor.from_pretrained(MAEST_ID, trust_remote_code=True, cache_dir=hf)
        _T["maest"] = AutoModel.from_pretrained(MAEST_ID, trust_remote_code=True, cache_dir=hf).eval().to(dev)
    if cfg["mert"]:
        _T["mert_fe"] = Wav2Vec2FeatureExtractor.from_pretrained(MERT_ID, cache_dir=hf)
        m = AutoModel.from_pretrained(MERT_ID, trust_remote_code=True, cache_dir=hf).eval().to(dev)
        # fp16: 2x faster on MPS (the waveform CNN dominates); cosine to the fp32 output > 0.999999
        _T["mert"] = m.half() if half else m
    if cfg["mert_v2"]:
        _T["mert2_fe"] = AutoFeatureExtractor.from_pretrained(MERT2_ID, trust_remote_code=True, cache_dir=hf)
        m = AutoModel.from_pretrained(MERT2_ID, trust_remote_code=True, cache_dir=hf).eval()
        # fp16: halves the 2.5 GB of weights; per-layer cosine to the fp32 output >= 0.99995
        _T["mert2"] = (m.half() if half else m).to(dev)


def _torch_ping():
    return _T["dev"]


def _to_dev(x):
    return {k: v.to(_T["dev"]) for k, v in x.items()}


def _clap(clap_ins: list[np.ndarray]) -> np.ndarray:
    """Each item: mel features of that clip's ~10 s windows. Window embeddings are L2-normalised, then averaged."""
    torch = _T["torch"]
    owner = np.concatenate([np.full(len(c), i) for i, c in enumerate(clap_ins)])
    x = torch.from_numpy(np.concatenate(clap_ins)).to(_T["dev"])
    with torch.inference_mode():
        e = _T["clap"](input_features=x).audio_embeds
        e = torch.nn.functional.normalize(e.float(), dim=-1).cpu().numpy()
    return np.stack([e[owner == i].mean(0) for i in range(len(clap_ins))])


def _maest(clips16: list[np.ndarray]) -> np.ndarray:
    torch = _T["torch"]
    x = _T["maest_fe"](clips16, sampling_rate=16000, return_tensors="pt")
    with torch.inference_mode():
        o = _T["maest"](**_to_dev(x), output_hidden_states=True)
        # tokens 0,1 are CLS + distillation; the rest are spectrogram patches
        v = torch.stack([h[:, 2:, :].float().mean(1) for h in o.hidden_states], 1)
    return v.cpu().numpy()  # (B, 13, 768)


def _mert(clips24: list[np.ndarray], batch: int = 3) -> np.ndarray:
    """MERT-v1 on ~10 s windows, averaged per clip. (The MPS conv1d cannot take a 30 s clip in one
    call, and MERT-v1 was trained on 5 s crops, so short windows are in-distribution.)"""
    torch = _T["torch"]
    wins, owner = [], []
    for i, a in enumerate(clips24):
        for w in windows(a, 24000):
            wins.append(w)
            owner.append(i)
    owner = np.asarray(owner)
    vec = np.zeros((len(wins), 13, 768), dtype=np.float32)
    by_len: dict[int, list[int]] = {}
    for j, w in enumerate(wins):  # only equal-length windows share a batch (no padding, no mask needed)
        by_len.setdefault(len(w), []).append(j)
    for ids in by_len.values():
        for k in range(0, len(ids), batch):
            b = ids[k : k + batch]
            x = _T["mert_fe"]([wins[j] for j in b], sampling_rate=24000, return_tensors="pt")["input_values"].to(_T["dev"])
            if _T["half"]:
                x = x.half()
            with torch.inference_mode():
                o = _T["mert"](input_values=x, output_hidden_states=True)
                vec[b] = torch.stack([h.float().mean(1) for h in o.hidden_states], 1).cpu().numpy()
    return np.stack([vec[owner == i].mean(0) for i in range(len(clips24))])


def _mert2(clips24: list[np.ndarray]) -> np.ndarray:
    torch = _T["torch"]
    bs = _T["cfg"]["mert_v2_batch"]
    out = []
    for i in range(0, len(clips24), bs):
        chunk = clips24[i : i + bs]
        x = _T["mert2_fe"](chunk, sampling_rate=24000, return_tensors="pt", padding=True)
        x = {k: (v.half() if _T["half"] and v.dtype.is_floating_point else v) for k, v in _to_dev(x).items()}
        with torch.inference_mode():
            o = _T["mert2"](**x, output_hidden_states=True)
            mask = o.feature_attention_mask[..., None].float()
            den = mask.sum(1).clamp_min(1)
            v = torch.stack([(h.float() * mask).sum(1) / den for h in o.hidden_states], 1)  # (b, 24, 1024)
        out.append(v.cpu().numpy())
    return np.concatenate(out)


def _torch_album(items: list[dict | None], mert2_idx: list[int]):
    """items[i] = {"clap_in", "a24", "a16"} (from _cpu_track) or None.
    -> {"tracks": [dict | str | None per item], "timing": {encoder: (seconds, n_clips)}}.
    `mert2_idx` = positions that also get MERT-v2."""
    cfg = _T["cfg"]
    res: list = [None] * len(items)
    timing = {}
    idx = [i for i, it in enumerate(items) if it is not None]
    if not idx:
        return {"tracks": res, "timing": timing}

    def run(name, fn, key, ids):
        t = time.perf_counter()
        v = fn([items[i][key] for i in ids])
        if _T["dev"] == "mps":
            _T["torch"].mps.synchronize()
        timing[name] = (time.perf_counter() - t, len(ids))
        if not np.isfinite(v).all():
            raise FloatingPointError(f"{name}: non-finite output")
        return v

    try:
        vecs = {"clap": run("gpu:clap", _clap, "clap_in", idx)}
        if cfg["maest"]:
            vecs["maest"] = run("gpu:maest", _maest, "a16", idx)
        if cfg["mert"]:
            vecs["mert"] = run("gpu:mert", _mert, "a24", idx)
        m2 = {}
        if cfg["mert_v2"]:
            want = set(mert2_idx)
            ids2 = [i for i in idx if i in want]
            if ids2:
                v2 = run("gpu:mert_v2", _mert2, "a24", ids2)
                m2 = {i: v2[k] for k, i in enumerate(ids2)}
    except Exception as e:
        err = f"torch {type(e).__name__}: {e}"
        for i in idx:
            res[i] = err
        return {"tracks": res, "timing": timing}
    if _T["dev"] == "mps":
        _T["torch"].mps.empty_cache()  # keep the MPS driver pool from growing over thousands of albums
    for k, i in enumerate(idx):
        d = {name: v[k].astype(np.float16) for name, v in vecs.items()}
        if cfg["mert_v2"]:
            d["mert_v2"] = m2[i].astype(np.float16) if i in m2 else None
        res[i] = d
    return {"tracks": res, "timing": timing}


# ==========================================================================
# tracklists + downloads (threads, main process)
# ==========================================================================
class RateLimiter:
    def __init__(self, min_interval: float):
        self.min_interval = min_interval
        self.lock = threading.Lock()
        self.next_t = 0.0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            t = max(now, self.next_t)
            self.next_t = t + self.min_interval
        if t > now:
            time.sleep(t - now)

    def penalise(self, seconds: float):
        with self.lock:
            self.next_t = max(self.next_t, time.monotonic() + seconds)


DEEZER_RL = RateLimiter(0.125)  # 40 API calls / 5 s (limit 50 / 5 s); preview CDN is not rate limited
ITUNES_RL = RateLimiter(3.2)  # ~19 / min
_tls = threading.local()


def _session():
    import requests

    if not hasattr(_tls, "s"):
        _tls.s = requests.Session()
        _tls.s.headers.update(UA)
    return _tls.s


def deezer_tracks(album_id: str) -> list[dict]:
    """Fresh tracklist (preview URLs are signed and expire, so never reuse stored ones)."""
    err = None
    for i in range(6):
        DEEZER_RL.wait()
        try:
            j = _session().get(f"https://api.deezer.com/album/{album_id}/tracks", params={"limit": 200}, timeout=25).json()
        except Exception as e:
            err = e
            time.sleep(1.5 * (i + 1))
            continue
        e = j.get("error")
        if e:
            err = RuntimeError(str(e))
            if e.get("code") == 4:
                DEEZER_RL.penalise(5.5)
                continue
            if e.get("code") == 800:
                return []
            time.sleep(1.0)
            continue
        return [
            {"id": str(t["id"]), "url": t.get("preview") or "", "disc": int(t.get("disk_number") or 1)}
            for t in j.get("data", [])
        ]
    raise RuntimeError(f"deezer tracklist {album_id}: {err}")


def itunes_tracks(album_id: str) -> list[dict]:
    err = None
    for i in range(4):
        ITUNES_RL.wait()
        try:
            r = _session().get("https://itunes.apple.com/lookup", params={"id": album_id, "entity": "song", "limit": 200},
                               timeout=30)
            if r.status_code in (403, 429) or r.status_code >= 500:
                err = RuntimeError(f"HTTP {r.status_code}")
                ITUNES_RL.penalise(60)
                continue
            songs = [s for s in r.json().get("results", []) if s.get("wrapperType") == "track" and s.get("kind") == "song"]
            songs.sort(key=lambda s: (s.get("discNumber", 1), s.get("trackNumber", 0)))
            return [{"id": str(s["trackId"]), "url": s.get("previewUrl") or "", "disc": int(s.get("discNumber") or 1)}
                    for s in songs]
        except Exception as e:
            err = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"itunes tracklist {album_id}: {err}")


def select_tracks(tracks: list[dict], edition: bool, max_tracks: int = MAX_TRACKS) -> list[tuple[int, dict]]:
    """Up to `max_tracks` tracks with a preview, spread evenly over the tracklist.
    Returns (1-based position in the full tracklist, track). For deluxe / expanded
    editions with several discs only disc 1 is used (the bonus discs are not the album)."""
    cand = [(i + 1, t) for i, t in enumerate(tracks) if t["url"]]
    if edition and len({t["disc"] for _, t in cand}) > 1:
        first = min(t["disc"] for _, t in cand)
        cand = [(p, t) for p, t in cand if t["disc"] == first]
    if len(cand) <= max_tracks:
        return cand
    idx = np.unique(np.round(np.linspace(0, len(cand) - 1, max_tracks)).astype(int))
    return [cand[i] for i in idx]


def download_preview(url: str) -> bytes | None:
    for i in range(3):
        try:
            r = _session().get(url, timeout=30)
            if r.status_code == 200 and len(r.content) > 20_000:
                return r.content
            if r.status_code in (403, 404):
                return None
        except Exception:
            pass
        time.sleep(1.0 * (i + 1))
    return None


# ==========================================================================
# shards
# ==========================================================================
def done_album_keys() -> set[str]:
    keys: set[str] = set()
    for p in sorted(TRACKS_DIR.glob("*.npz")):
        try:
            with np.load(p) as z:
                keys.update(z["album_key"].tolist())
        except Exception as e:
            log.warning("unreadable shard %s (%s) — ignoring it", p.name, e)
    return keys


def write_shard(records: list[dict], enabled: list[str]):
    """One npz per ~50 albums, one entry per TRACK:
    album_key  <U   "deezer:123" / "itunes:456"   (join key to matches.parquet: source + ':' + source_album_id)
    row        i4   first album row that maps to this album
    uri        <U   that row's Spotify URI
    source     <U   deezer | itunes
    source_album_id <U
    track_pos  i2   1-based position in the store tracklist
    n_album_tracks i2  length of the store tracklist
    track_id   <U   Deezer / iTunes track id
    effnet (n,1280) heads (n,H) clap (n,512) maest (n,13,768) mert (n,13,768) mert_v2 (n,24,1024)   float16
    (mert_v2 rows are NaN for tracks it was not run on; a disabled encoder has no array)
    """
    if not records:
        return
    TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    arrs = {
        "album_key": np.array([r["album_key"] for r in records]),
        "row": np.array([r["row"] for r in records], dtype=np.int32),
        "uri": np.array([r["uri"] for r in records]),
        "source": np.array([r["source"] for r in records]),
        "source_album_id": np.array([r["source_album_id"] for r in records]),
        "track_pos": np.array([r["track_pos"] for r in records], dtype=np.int16),
        "n_album_tracks": np.array([r["n_album_tracks"] for r in records], dtype=np.int16),
        "track_id": np.array([r["track_id"] for r in records]),
    }
    for k in enabled:
        ref = next((r[k] for r in records if r.get(k) is not None), None)
        if ref is None:
            continue
        nan = np.full(ref.shape, np.nan, dtype=np.float16)
        arrs[k] = np.stack([r[k] if r.get(k) is not None else nan for r in records]).astype(np.float16)
    name = f"tracks_{int(time.time() * 1000)}_{os.getpid()}.npz"
    tmp = TRACKS_DIR / (name + ".part")
    with open(tmp, "wb") as f:
        np.savez(f, **arrs)
    tmp.rename(TRACKS_DIR / name)
    log.info("wrote shard %s (%d tracks, %d albums)", name, len(records), len({r['album_key'] for r in records}))


def finalize():
    """cache/tracks/*.npz -> cache/embeddings.parquet (one row per album row, mean over tracks)."""
    import pandas as pd
    import pyarrow as pa
    import pyarrow.parquet as pq

    shards = sorted(TRACKS_DIR.glob("*.npz"))
    if not shards:
        log.error("no shards in %s", TRACKS_DIR)
        return
    present = None
    for p in shards:
        with np.load(p) as z:
            ks = {k for k in VECTOR_KEYS if k in z.files}
        present = ks if present is None else present & ks
    keys = [k for k in VECTOR_KEYS if k in present]
    means: dict[str, dict] = {}
    for p in shards:
        with np.load(p) as z:
            ak = z["album_key"]
            data = {k: z[k].astype(np.float32).reshape(len(ak), -1) for k in keys}
        for a in np.unique(ak):
            sel = ak == a
            d = {"n_tracks": int(sel.sum())}
            for k in keys:
                x = data[k][sel]
                good = np.isfinite(x).all(1)
                d[k] = x[good].mean(0) if good.any() else np.full(x.shape[1], np.nan, np.float32)
                if k == "mert_v2":
                    d["n_tracks_mert_v2"] = int(good.sum())
            means[str(a)] = d

    m = pd.read_parquet(MATCHES)
    m = m[m.source != "none"].copy()
    m["album_key"] = m.source + ":" + m.source_album_id.astype(str)
    m = m[m.album_key.isin(means)].sort_values("row").reset_index(drop=True)
    cols = {
        "row": pa.array(m.row.astype("int32")),
        "URI": pa.array(m.URI.astype(str)),
        "source": pa.array(m.source.astype(str)),
        "source_album_id": pa.array(m.source_album_id.astype(str)),
        "n_tracks": pa.array([means[a]["n_tracks"] for a in m.album_key], type=pa.int16()),
    }
    if "mert_v2" in keys:
        cols["n_tracks_mert_v2"] = pa.array([means[a]["n_tracks_mert_v2"] for a in m.album_key], type=pa.int16())
    dims = {}
    for k in keys:
        mat = np.stack([means[a][k] for a in m.album_key]).astype(np.float16)
        dims[k] = mat.shape[1]
        cols[k] = pa.FixedSizeListArray.from_arrays(pa.array(mat.ravel(), type=pa.float16()), mat.shape[1])
    meta = {
        "head_columns": HEAD_COLUMNS.read_text() if HEAD_COLUMNS.exists() else "[]",
        "dims": json.dumps(dims),
        "layout": json.dumps({"maest": "13 hidden states x 768, flattened layer-major (0=patch embedding, 1..12=blocks)",
                              "mert": "13 hidden states x 768, flattened layer-major (0=CNN features, 1..12=layers)",
                              "mert_v2": "24 blocks x 1024, flattened layer-major (0=block 1)",
                              "clap": CLAP_ID, "maest_model": MAEST_ID, "mert_model": MERT_ID, "mert_v2_model": MERT2_ID}),
    }
    table = pa.table(cols).replace_schema_metadata(meta)
    tmp = EMB_OUT.with_suffix(".parquet.part")
    pq.write_table(table, tmp, compression="zstd")
    tmp.rename(EMB_OUT)
    log.info("wrote %s: %d rows (%d unique albums), vectors %s", EMB_OUT, len(m), m.album_key.nunique(), dims)


# ==========================================================================
# driver
# ==========================================================================
def load_jobs() -> list[dict]:
    import pandas as pd

    m = pd.read_parquet(MATCHES)
    m = m[m.source != "none"].sort_values("row")
    jobs = {}
    for r in m.itertuples():
        key = f"{r.source}:{r.source_album_id}"
        j = jobs.setdefault(key, {"album_key": key, "row": int(r.row), "uri": r.URI, "source": r.source,
                                  "source_album_id": str(r.source_album_id), "label": f"{r.Artist} — {r.Title}",
                                  "edition": False})
        j["edition"] = j["edition"] or ("edition" in (r.match_flags or ""))
    # Fixed random order, so a partial run is a fair sample of the catalogue rather than its top-ranked albums.
    jobs = list(jobs.values())
    random.Random(20261001).shuffle(jobs)
    return jobs


def setup_logging():
    CACHE.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(message)s", "%H:%M:%S")
    log.setLevel(logging.INFO)
    for h in (logging.StreamHandler(sys.stdout), logging.FileHandler(LOG_FILE)):
        h.setFormatter(fmt)
        log.addHandler(h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="only the first N not-yet-extracted albums (pilot)")
    ap.add_argument("--workers", type=int, default=3, help="CPU worker processes (decode + Essentia + CLAP mel)")
    ap.add_argument("--album-threads", type=int, default=None, help="albums in flight (default workers + 2)")
    ap.add_argument("--download-threads", type=int, default=16)
    ap.add_argument("--max-tracks", type=int, default=MAX_TRACKS)
    ap.add_argument("--no-mert", action="store_true")
    ap.add_argument("--no-maest", action="store_true")
    ap.add_argument("--mert-v2", dest="mert_v2", action="store_true", default=True)
    ap.add_argument("--no-mert-v2", dest="mert_v2", action="store_false")
    ap.add_argument("--mert-v2-max-tracks", type=int, default=None,
                    help="run MERT-v2 on at most this many (evenly spread) tracks per album; default all")
    ap.add_argument("--mert-v2-batch", type=int, default=1)
    ap.add_argument("--tf-threads", type=int, default=1, help="TensorFlow threads per CPU worker")
    ap.add_argument("--device", default="auto", help="auto | mps | cpu (torch models)")
    ap.add_argument("--only-source", choices=["deezer", "itunes"], default=None, help="restrict to one preview source")
    ap.add_argument("--finalize", action="store_true", help="only build embeddings.parquet from shards")
    ap.add_argument("--no-finalize", action="store_true")
    args = ap.parse_args()

    setup_logging()
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))  # `kill` flushes like Ctrl-C
    if args.finalize:
        finalize()
        return

    enabled = ["effnet", "heads", "clap"] + (["maest"] if not args.no_maest else []) + \
        (["mert"] if not args.no_mert else []) + (["mert_v2"] if args.mert_v2 else [])
    jobs = load_jobs()
    done = done_album_keys()
    todo = [j for j in jobs if j["album_key"] not in done and args.only_source in (None, j["source"])]
    if args.limit:
        todo = todo[: args.limit]
    log.info("=== extract: %d matched albums, %d already in shards, %d to do; encoders %s ===",
             len(jobs), len(done), len(todo), enabled)
    if not todo:
        if not args.no_finalize:
            finalize()
        return

    eff_pb, head_specs, head_names = prepare_essentia_models()
    log.info("essentia: effnet + %d heads (%d outputs)", len(head_specs), len(head_names))
    ctx = mp.get_context("spawn")
    cpu_pool = ProcessPoolExecutor(args.workers, mp_context=ctx, initializer=_cpu_init,
                                   initargs=(eff_pb, head_specs, args.tf_threads))
    torch_cfg = {"device": args.device, "maest": not args.no_maest, "mert": not args.no_mert, "mert_v2": args.mert_v2,
                 "mert_v2_batch": args.mert_v2_batch}
    torch_pool = ProcessPoolExecutor(1, mp_context=ctx, initializer=_torch_init, initargs=(torch_cfg,))
    t_load = time.time()
    warm = [cpu_pool.submit(_cpu_ping) for _ in range(args.workers)]
    dev = torch_pool.submit(_torch_ping).result()
    [w.result() for w in warm]
    log.info("models loaded in %.0fs; torch device = %s; %d CPU workers", time.time() - t_load, dev, args.workers)
    dl_pool = ThreadPoolExecutor(args.download_threads)

    want24 = (not args.no_mert) or args.mert_v2
    want16 = not args.no_maest

    def process(job: dict) -> dict:
        t0 = time.perf_counter()
        tracks = deezer_tracks(job["source_album_id"]) if job["source"] == "deezer" else itunes_tracks(job["source_album_id"])
        sel = select_tracks(tracks, job["edition"], args.max_tracks)
        if not sel:
            return {"job": job, "records": [], "errors": ["no previews in tracklist"], "timing": {}}
        blobs = list(dl_pool.map(lambda pt: download_preview(pt[1]["url"]), sel))
        timing = {"download (album wall / clip)": (time.perf_counter() - t0, len(sel))}
        errors: list[str] = []
        cpu_f = [cpu_pool.submit(_cpu_track, b, want24, want16) if b is not None else None for b in blobs]
        del blobs  # compressed audio is no longer needed once the workers have it
        cpu: list = []
        t_ess = t_prep = 0.0
        for (pos, _), f in zip(sel, cpu_f):
            r = f.result() if f is not None else "download failed"
            if isinstance(r, str):
                errors.append(f"track {pos}: {r}")
                r = None
            else:
                t_ess += r["t_ess"]
                t_prep += r["t_prep"]
            cpu.append(r)
        ok = [i for i, r in enumerate(cpu) if r is not None]
        if not ok:
            return {"job": job, "records": [], "errors": errors, "timing": timing}
        timing["cpu:decode+effnet+heads"] = (t_ess, len(ok))
        timing["cpu:decode+clap_mel"] = (t_prep, len(ok))
        k = args.mert_v2_max_tracks
        m2 = ok if (k is None or k >= len(ok)) else [ok[i] for i in np.unique(np.round(np.linspace(0, len(ok) - 1, k)).astype(int))]
        items = [None if r is None else {"clap_in": r["clap_in"], "a24": r["a24"], "a16": r["a16"]} for r in cpu]
        tor = torch_pool.submit(_torch_album, items, m2).result()
        del items
        timing.update(tor["timing"])
        records = []
        for i in ok:
            pos, tr = sel[i]
            t = tor["tracks"][i]
            if not isinstance(t, dict):
                errors.append(f"track {pos}: {t}")
                continue
            records.append({"album_key": job["album_key"], "row": job["row"], "uri": job["uri"], "source": job["source"],
                            "source_album_id": job["source_album_id"], "track_pos": pos, "n_album_tracks": len(tracks),
                            "track_id": tr["id"], "effnet": cpu[i]["effnet"].astype(np.float16),
                            "heads": cpu[i]["heads"].astype(np.float16), **t})
        return {"job": job, "records": records, "errors": errors, "timing": timing}

    def safe(job):
        try:
            return process(job)
        except Exception as e:
            return {"job": job, "records": [], "errors": [f"{type(e).__name__}: {e}"], "timing": {}}

    n_threads = args.album_threads or (args.workers + 1)
    buf: list[dict] = []
    buf_albums = 0
    n_ok = n_fail = n_tracks = n_track_err = 0
    tot = {}
    t0 = time.time()
    album_pool = ThreadPoolExecutor(n_threads)
    futs = [album_pool.submit(safe, j) for j in todo]
    try:
        for i, f in enumerate(as_completed(futs), 1):
            r = f.result()
            for k, (s, n) in r["timing"].items():
                a = tot.setdefault(k, [0.0, 0])
                a[0] += s
                a[1] += n
            if r["records"]:
                buf += r["records"]
                buf_albums += 1
                n_ok += 1
                n_tracks += len(r["records"])
                n_track_err += len(r["errors"])
                for e in r["errors"]:
                    log.info("  partial %s [%s]: %s", r["job"]["album_key"], r["job"]["label"], e)
            else:
                n_fail += 1
                log.info("  FAILED %s [%s]: %s", r["job"]["album_key"], r["job"]["label"], "; ".join(r["errors"])[:300])
            if buf_albums >= SHARD_ALBUMS:
                write_shard(buf, enabled)
                buf, buf_albums = [], 0
            if i % 10 == 0 or i == len(futs):
                el = time.time() - t0
                per = el / i
                log.info("%d/%d albums  ok %d  failed %d  tracks %d (+%d track errors)  %.2f s/album  elapsed %s  ETA %s",
                         i, len(futs), n_ok, n_fail, n_tracks, n_track_err, per,
                         time.strftime("%H:%M:%S", time.gmtime(el)), time.strftime("%H:%M:%S", time.gmtime(per * (len(futs) - i))))
    except KeyboardInterrupt:
        log.info("interrupted — flushing finished albums")
        for f in futs:
            f.cancel()
    finally:
        write_shard(buf, enabled)
        album_pool.shutdown(wait=False, cancel_futures=True)
        cpu_pool.shutdown(wait=False, cancel_futures=True)
        torch_pool.shutdown(wait=False, cancel_futures=True)
        dl_pool.shutdown(wait=False, cancel_futures=True)

    el = time.time() - t0
    log.info("=== done: %d albums ok, %d failed, %d tracks in %.0fs (%.2f s/album wall) ===", n_ok, n_fail, n_tracks, el,
             el / max(1, n_ok + n_fail))
    log.info("per-stage compute, seconds per clip (cpu:* = inside one worker process, runs in parallel; gpu:* = serial on the GPU):")
    for k, (s, n) in sorted(tot.items()):
        log.info("   %-30s %.3f s/clip  (%d clips, %.0fs total)", k, s / max(n, 1), n, s)
    if not args.no_finalize:
        finalize()


if __name__ == "__main__":
    main()
