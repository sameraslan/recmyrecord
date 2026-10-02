"""Torch side of the embedding bake-off: a small server that bakeoff.py talks to over pipes.

Runs in its own interpreter (.venv-torch; the Essentia venv must keep numpy < 2) and never touches
the network for audio or the disk for anything but model weights (Hugging Face cache under
cache/models/hf). Not meant to be run by hand; see `bakeoff.py`.

Protocol (binary, on stdin / a private copy of stdout; anything a library prints goes to stderr):
  request   one JSON line {"key": [row, track_idx], "n": samples, "models": [names]} followed by
            n little-endian float32 samples: the clip, mono, 44.1 kHz
  response  one JSON line {"key", "embs": [[name, nbytes], ...], "timing": {name: [cpu_s, wall_s]},
            "rss": peak bytes, "mps": peak MPS driver bytes, "error": str | null} followed by the embeddings'
            float32 bytes in that order
On start-up, once the models are loaded, one JSON line {"ready": true, "load_s", "rss", "dims"}.

Models
  clap  LAION-CLAP (laion/clap-htsat-unfused: HTSAT-tiny audio tower, 512-d joint audio-text space):
        three 10 s windows spread over the clip at 48 kHz, each embedding L2-normalised, then averaged.
        NOT laion/larger_clap_music: the pytorch_model.bin that repo serves (sha256 5c289311...) holds
        an untrained network (every LayerNorm weight 1, every bias 0, embeddings at std 0.02): it
        scores noise and silence at cosine 0.9997 and fails zero-shot genre prompts, where the unfused
        checkpoint gets them right.
  clap_music  the same recipe with laion/larger_clap_music_and_speech (HTSAT-base, trained on music
        and speech; the checkpoint behind the published agreement with human similarity judgements)
  mert  MERT-v1-95M (m-a-p/MERT-v1-95M, 24 kHz): 5 s chunks (its training crop length), every one of
        the 13 hidden states averaged over time and chunks -> 13 x 768 values, flattened. The layer
        is picked at evaluation time (`bakeoff_load("mert_l7")`, `"mert_mean"`).
"""
import argparse
import json
import os
import resource
import sys
import time
from pathlib import Path

CLAP_ID = "laion/clap-htsat-unfused"
CLAP_MUSIC_ID = "laion/larger_clap_music_and_speech"
MERT_ID = "m-a-p/MERT-v1-95M"
DIMS = {"clap": 512, "clap_music": 512, "mert": 13 * 768}
REPOS = {"clap": CLAP_ID, "clap_music": CLAP_MUSIC_ID, "mert": MERT_ID}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--models", default="clap,mert")
    p.add_argument("--device", default="cpu", choices=["cpu", "mps"])
    p.add_argument("--threads", type=int, default=1)
    args = p.parse_args()
    for var in ("OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
        os.environ[var] = str(args.threads)
    os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent / "cache" / "models" / "hf"))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    hub = Path(os.environ["HF_HOME"]) / "hub"
    if all((hub / ("models--" + REPOS[m].replace("/", "--")) / "snapshots").is_dir() for m in args.models.split(",")):
        # weights are cached: stay offline (transformers otherwise fetches a second, safetensors copy of CLAP)
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    out = os.fdopen(os.dup(1), "wb")
    os.dup2(2, 1)  # stray prints must not corrupt the protocol
    stdin = sys.stdin.buffer

    import numpy as np
    import torch
    from scipy.signal import resample_poly

    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    device = torch.device(args.device)
    t0 = time.perf_counter()

    def clap_factory(repo: str = CLAP_ID):
        from transformers import ClapFeatureExtractor, ClapModel

        fe = ClapFeatureExtractor.from_pretrained(repo)
        model = ClapModel.from_pretrained(repo, use_safetensors=False).eval()
        model.text_model, model.text_projection = None, None  # the text tower is not needed
        model.to(device)
        window = 10 * 48000

        def embed(audio: np.ndarray) -> np.ndarray:
            x = resample_poly(audio, 160, 147).astype(np.float32)
            if len(x) <= window:
                wins = [x]
            else:
                wins = [x[s:s + window] for s in np.linspace(0, len(x) - window, 3).round().astype(int)]
            feats = []
            for w in wins:  # one window at a time: a third of the peak memory, same cost
                inputs = fe([w], sampling_rate=48000, return_tensors="pt")
                f = model.get_audio_features(input_features=inputs["input_features"].to(device))
                feats.append((f if torch.is_tensor(f) else f.pooler_output).float().cpu())
            return torch.nn.functional.normalize(torch.cat(feats), dim=-1).mean(0).numpy()

        return embed

    def mert_factory():
        from transformers import AutoModel, Wav2Vec2FeatureExtractor

        fe = Wav2Vec2FeatureExtractor.from_pretrained(MERT_ID, trust_remote_code=True)
        model = AutoModel.from_pretrained(MERT_ID, trust_remote_code=True, use_safetensors=False).eval().to(device)
        chunk = 5 * 24000
        # The hub code predates this transformers version and does not hand back hidden_states:
        # collect them with hooks instead (the first layer's input, then every layer's output).
        states = []
        layers = model.encoder.layers
        assert len(layers) == 12
        layers[0].register_forward_pre_hook(lambda mod, args, kwargs: states.append(args[0] if args else kwargs["hidden_states"]),
                                            with_kwargs=True)
        for layer in layers:
            layer.register_forward_hook(lambda mod, args, output: states.append(output if torch.is_tensor(output) else output[0]))

        def embed(audio: np.ndarray) -> np.ndarray:
            x = resample_poly(audio, 80, 147).astype(np.float32)
            n = min(round(len(x) / chunk), 12)  # chunks spread over the clip (a 29.99 s clip still gives 6)
            chunks = [x[s:s + chunk] for s in np.linspace(0, len(x) - chunk, n).round().astype(int)] if n > 1 else [x[:chunk]]
            total = 0
            for c in chunks:  # one chunk at a time: the CNN front end's activations are large
                inputs = fe([c], sampling_rate=24000, return_tensors="pt")
                states.clear()
                model(inputs["input_values"].to(device))
                assert len(states) == 13, len(states)
                total = total + torch.stack(states).float().mean(dim=(1, 2)).cpu()  # (13, 768)
            states.clear()
            return (total / len(chunks)).flatten().numpy()

        return embed

    factories = {"clap": clap_factory, "clap_music": lambda: clap_factory(CLAP_MUSIC_ID), "mert": mert_factory}
    embedders = {name: factories[name]() for name in args.models.split(",") if name}

    def rss() -> int:
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss

    def send(header: dict, blobs: list[bytes] = ()) -> None:
        out.write(json.dumps(header).encode() + b"\n")
        for b in blobs:
            out.write(b)
        out.flush()

    send({"ready": True, "load_s": round(time.perf_counter() - t0, 2), "rss": rss(),
          "dims": {k: DIMS[k] for k in embedders}})
    peak_mps = [0]
    while line := stdin.readline():
        req = json.loads(line)
        audio = np.frombuffer(stdin.read(4 * req["n"]), "<f4")
        embs, timing, error = [], {}, None
        for name in req["models"]:
            cpu, wall = time.process_time(), time.perf_counter()
            try:
                with torch.inference_mode():
                    v = embedders[name](audio)
                if args.device == "mps":
                    torch.mps.synchronize()
                    peak_mps[0] = max(peak_mps[0], torch.mps.driver_allocated_memory())
                    torch.mps.empty_cache()
                if v.shape != (DIMS[name],) or not np.isfinite(v).all():
                    raise ValueError(f"bad embedding {v.shape}")
                embs.append((name, v.astype("<f4").tobytes()))
            except Exception as e:  # one bad clip must not take the server down
                error = f"{name}: {type(e).__name__}: {e}"[:300]
            timing[name] = [round(time.process_time() - cpu, 4), round(time.perf_counter() - wall, 4)]
        send({"key": req["key"], "embs": [[n, len(b)] for n, b in embs], "timing": timing, "rss": rss(),
              "mps": peak_mps[0], "error": error},
             [b for _, b in embs])


if __name__ == "__main__":
    main()
