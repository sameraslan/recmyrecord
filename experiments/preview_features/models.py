"""Essentia TensorFlow models for the preview-features experiment: registry, download, inference.

Everything comes from https://essentia.upf.edu/models/ and lands in cache/models/ (.pb graph plus
its .json metadata, ~30 MB without MAEST, ~375 MB with). Node names and class order are read
from each model's .json, never assumed: half of the binary heads list the positive class second.

Per track, `Models.run` returns
- scalars: one named value per head (probability of the positive class, or the regression value;
  DEAM / emoMusic valence and arousal are on a 1-9 scale)
- embeddings: `effnet` (1280-d) and `musicnn` (200-d) averaged over patches, and `maest` (768-d,
  transformer layer 7 as the model's metadata prescribes; mean of the CLS token, the DIST token
  and the average patch token)

Speed: the mel-spectrogram both CNNs share is computed once and the graphs are fed directly
through TensorflowPredict. That is bit-identical to TensorflowPredictEffnetDiscogs /
TensorflowPredictMusiCNN and about half their CPU time. Effnet runs the batch-size-1 export of the
same weights (the bs64 graph pads a 30 s clip's 29 patches to 64); MusiCNN patches do not overlap.
"""
import json
import os
import time

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import numpy as np
import requests

from common import MODELS

BASE = "https://essentia.upf.edu/models/"
EFFNET = "feature-extractors/discogs-effnet/discogs-effnet-bs1-1"
MUSICNN = "feature-extractors/musicnn/msd-musicnn-1"
MAEST = "feature-extractors/maest/discogs-maest-30s-pw-2"
EFFNET_PATCH, EFFNET_HOP = 128, 62  # mel frames (hop 256 at 16 kHz): 2 s patches, one per second
MUSICNN_PATCH = 187  # 3 s
MAEST_SAMPLES = 1877 * 256  # one 1876-frame patch (30.02 s at 16 kHz), with a frame to spare
MIN_SAMPLES = 5 * 16000  # shortest clip worth analysing

# scalar name -> (model path under classification-heads/, positive class); None = regression
EFFNET_HEADS = {
    "danceability": ("danceability/danceability-discogs-effnet-1", "danceable"),
    "mood_happy": ("mood_happy/mood_happy-discogs-effnet-1", "happy"),
    "mood_sad": ("mood_sad/mood_sad-discogs-effnet-1", "sad"),
    "mood_aggressive": ("mood_aggressive/mood_aggressive-discogs-effnet-1", "aggressive"),
    "mood_relaxed": ("mood_relaxed/mood_relaxed-discogs-effnet-1", "relaxed"),
    "mood_party": ("mood_party/mood_party-discogs-effnet-1", "party"),
    "mood_acoustic": ("mood_acoustic/mood_acoustic-discogs-effnet-1", "acoustic"),
    "mood_electronic": ("mood_electronic/mood_electronic-discogs-effnet-1", "electronic"),
    "instrumental": ("voice_instrumental/voice_instrumental-discogs-effnet-1", "instrumental"),
    "tonal": ("tonal_atonal/tonal_atonal-discogs-effnet-1", "tonal"),
    "timbre_bright": ("timbre/timbre-discogs-effnet-1", "bright"),
    "approachability": ("approachability/approachability_regression-discogs-effnet-1", None),
    "engagement": ("engagement/engagement_regression-discogs-effnet-1", None),
}
# prefix -> model path; each predicts [valence, arousal] from MusiCNN embeddings
MUSICNN_HEADS = {"deam": "deam/deam-msd-musicnn-2", "emomusic": "emomusic/emomusic-msd-musicnn-2"}


def model_paths(maest: bool = True) -> list[str]:
    """Server-relative paths (no extension) of every model the extractor loads."""
    heads = [p for p, _ in EFFNET_HEADS.values()] + list(MUSICNN_HEADS.values())
    return [EFFNET, MUSICNN] + ["classification-heads/" + p for p in heads] + ([MAEST] if maest else [])


def local(path: str, ext: str):
    """Where a model file lives in cache/models/."""
    return MODELS / (path.rsplit("/", 1)[-1] + ext)


def ensure(maest: bool = True) -> None:
    """Download whatever is missing. The server is slow and drops connections: retry, and rename
    into place only when complete so an interrupted download never leaves a truncated graph."""
    MODELS.mkdir(parents=True, exist_ok=True)
    for path in model_paths(maest):
        for ext in (".json", ".pb"):
            dest = local(path, ext)
            if dest.exists():
                continue
            part = dest.with_suffix(dest.suffix + ".part")
            for attempt in range(6):
                try:
                    with requests.get(BASE + path + ext, stream=True, timeout=(20, 60)) as r:
                        r.raise_for_status()
                        with open(part, "wb") as f:
                            for chunk in r.iter_content(1 << 20):
                                f.write(chunk)
                    part.rename(dest)
                    print(f"models: {dest.name} {dest.stat().st_size / 1e6:.1f} MB", flush=True)
                    break
                except requests.RequestException as e:
                    if attempt == 5:
                        raise
                    print(f"models: {dest.name} retry after {type(e).__name__}", flush=True)
                    time.sleep(3 * (attempt + 1))


def node_names(path: str, purpose: str) -> tuple[str, str, dict]:
    """(input node, the output node the .json tags with `purpose`, the metadata) of one graph;
    `purpose` is 'predictions' or 'embeddings'."""
    m = json.loads(local(path, ".json").read_text())
    out = next(o["name"] for o in m["schema"]["outputs"] if o.get("output_purpose") == purpose)
    return m["schema"]["inputs"][0]["name"], out, m


class Graph:
    """One frozen graph behind TensorflowPredict. Call it with (batch, time, features) float32."""

    def __init__(self, path: str, purpose: str):
        import essentia.standard as es

        self.input, self.output, m = node_names(path, purpose)
        self.classes = m.get("classes")
        self.algo = es.TensorflowPredict(graphFilename=str(local(path, ".pb")),
                                         inputs=[self.input], outputs=[self.output])

    def __call__(self, x: np.ndarray) -> np.ndarray:
        from essentia import Pool

        pool = Pool()
        pool.set(self.input, np.ascontiguousarray(x[:, None], dtype=np.float32))
        return self.algo(pool)[self.output].reshape(len(x), -1)


class Models:
    """All graphs, loaded once per process. `run` takes 16 kHz mono float32 audio."""

    def __init__(self, maest: bool = True):
        import essentia
        import essentia.standard as es

        essentia.log.infoActive = essentia.log.warningActive = False
        self.frames = lambda audio: es.FrameGenerator(audio, frameSize=512, hopSize=256)
        self.mel = es.TensorflowInputMusiCNN()
        self.effnet = Graph(EFFNET, "embeddings")
        self.musicnn = Graph(MUSICNN, "embeddings")
        self.effnet_heads = {}
        for name, (path, positive) in EFFNET_HEADS.items():
            head = Graph("classification-heads/" + path, "predictions")
            self.effnet_heads[name] = (head, 0 if positive is None else head.classes.index(positive))
        self.musicnn_heads = {p: Graph("classification-heads/" + path, "predictions")
                              for p, path in MUSICNN_HEADS.items()}
        self.maest = None
        if maest:
            node_in, node_out, _ = node_names(MAEST, "embeddings")
            self.maest = es.TensorflowPredictMAEST(graphFilename=str(local(MAEST, ".pb")),
                                                   input=node_in, output=node_out)

    def run(self, audio: np.ndarray) -> tuple[dict, dict, dict]:
        """(scalars, embeddings, seconds per stage) for one clip of at least MIN_SAMPLES."""
        scalars, timing = {}, {}
        t = time.perf_counter()

        def lap(stage):
            nonlocal t
            timing[stage], t = time.perf_counter() - t, time.perf_counter()

        mel = np.array([self.mel(f) for f in self.frames(audio)])
        starts = range(0, len(mel) - EFFNET_PATCH + 1, EFFNET_HOP)
        patches = np.concatenate([self.effnet(mel[None, i:i + EFFNET_PATCH]) for i in starts])
        emb = {"effnet": patches.mean(axis=0)}
        lap("effnet")
        for name, (head, idx) in self.effnet_heads.items():
            scalars[name] = float(head(patches[:, None])[:, idx].mean())
        lap("heads")
        n = len(mel) // MUSICNN_PATCH
        patches = self.musicnn(mel[:n * MUSICNN_PATCH].reshape(n, MUSICNN_PATCH, -1))
        emb["musicnn"] = patches.mean(axis=0)
        for prefix, head in self.musicnn_heads.items():
            for cls, v in zip(head.classes, head(patches[:, None]).mean(axis=0)):
                scalars[f"{prefix}_{cls}"] = float(v)
        lap("musicnn")
        if self.maest is not None:
            # a 30.00 s preview is a few frames short of one patch: loop it up to length
            out = self.maest(np.resize(audio, MAEST_SAMPLES) if len(audio) < MAEST_SAMPLES else audio)
            tokens = out.reshape(-1, out.shape[-2], out.shape[-1]).mean(axis=0)  # patches -> (tokens, 768)
            emb["maest"] = np.mean([tokens[0], tokens[1], tokens[2:].mean(axis=0)], axis=0)
            lap("maest")
        return scalars, emb, timing


if __name__ == "__main__":
    ensure()
    print(f"{sum(f.stat().st_size for f in MODELS.glob('*')) / 1e6:.0f} MB in {MODELS}")
