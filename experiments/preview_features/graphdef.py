"""Constants of a frozen TensorFlow graph, read without tensorflow or protobuf.

`constants(path)` -> {node name: array} for the float/int Const nodes of a GraphDef (.pb).
`discogs_head()` -> (W (400, 1280), b (400,)): the last layer of discogs-effnet-bs1-1, which maps
the 1,280-number embedding (PartitionedCall:1) to the 400 Discogs style activations
(PartitionedCall:0 = sigmoid(W e + b); checked against the graph's own outputs, see
results/crossgenre.md). Only the wire format's varint / length-delimited / fixed fields are parsed.
"""
from pathlib import Path

import numpy as np

from common import MODELS

DTYPES = {1: "<f4", 2: "<f8", 3: "<i4", 9: "<i8"}  # TensorProto.dtype -> numpy


def _varint(b, i: int) -> tuple[int, int]:
    x = shift = 0
    while True:
        c = b[i]
        i += 1
        x |= (c & 0x7F) << shift
        shift += 7
        if not c & 0x80:
            return x, i


def _fields(b):
    """(field number, wire type, value) of one protobuf message."""
    i, n = 0, len(b)
    while i < n:
        key, i = _varint(b, i)
        wire = key & 7
        if wire == 0:
            v, i = _varint(b, i)
        elif wire == 2:
            size, i = _varint(b, i)
            v, i = b[i:i + size], i + size
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            v, i = b[i:i + size], i + size
        else:
            raise ValueError(f"wire type {wire}")
        yield key >> 3, wire, v


def _tensor(b) -> np.ndarray | None:
    dtype, shape, content = None, [], None
    for f, _, v in _fields(b):
        if f == 1:
            dtype = v
        elif f == 2:  # TensorShapeProto: repeated Dim{size = 1}
            shape += [next((x for g, _, x in _fields(d) if g == 1), 0) for g2, _, d in _fields(v) if g2 == 2]
        elif f == 4:
            content = v
    if dtype not in DTYPES or content is None:
        return None
    return np.frombuffer(content, DTYPES[dtype]).reshape(shape)


def constants(path: Path) -> dict[str, np.ndarray]:
    out = {}
    for f, _, node in _fields(memoryview(Path(path).read_bytes())):
        if f != 1:  # GraphDef.node
            continue
        name = op = value = None
        for g, _, v in _fields(node):
            if g == 1:
                name = bytes(v).decode()
            elif g == 2:
                op = bytes(v).decode()
            elif g == 5:  # attr map entry {key = 1, value = 2 (AttrValue: tensor = 8)}
                entry = {k: x for k, _, x in _fields(v)}
                if bytes(entry.get(1, b"")) == b"value":
                    value = next((_tensor(x) for k, _, x in _fields(entry[2]) if k == 8), None)
        if op == "Const" and value is not None:
            out[name] = value
    return out


def discogs_head(path: Path = MODELS / "discogs-effnet-bs1-1.pb") -> tuple[np.ndarray, np.ndarray]:
    c = constants(path)
    W, b = c["Const_1"], c["Const"]
    assert W.shape == (400, 1280) and b.shape == (400,), (W.shape, b.shape)
    return W.astype(np.float64), b.astype(np.float64)


def verify(path: Path = MODELS / "discogs-effnet-bs1-1.pb", n: int = 5) -> float:
    """Worst |sigmoid(W e + b) - activations| over `n` random mel patches run through the graph
    itself (Essentia): confirms the layer is linear on the embedding and that these are its weights."""
    import essentia
    import essentia.standard as es
    W, b = discogs_head(path)
    model = es.TensorflowPredict(graphFilename=str(path), inputs=["serving_default_melspectrogram"],
                                 outputs=["PartitionedCall:0", "PartitionedCall:1"], squeeze=True)
    rng, worst = np.random.default_rng(0), 0.0
    for t in range(n):
        pool = essentia.Pool()
        pool.set("serving_default_melspectrogram", (rng.normal(size=(1, 1, 128, 96)) * 0.5 + 0.3 * t).astype(np.float32))
        out = model(pool)
        act, emb = (np.asarray(out[k], dtype=np.float64).reshape(-1) for k in ("PartitionedCall:0", "PartitionedCall:1"))
        with np.errstate(over="ignore"):
            worst = max(worst, float(np.abs(1 / (1 + np.exp(-(W @ emb + b))) - act).max()))
        print(f"patch {t}: activations in [{act.min():.3g}, {act.max():.3g}], worst abs difference so far {worst:.2g}")
    return worst


if __name__ == "__main__":
    verify()
