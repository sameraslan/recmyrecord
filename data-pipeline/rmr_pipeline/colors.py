"""Colour helpers: hex conversion, WCAG 2 contrast and ambient colours extracted from cover sprites."""
import colorsys
from collections.abc import Sequence

import numpy as np
from PIL import Image

from .constants import FALLBACK_AMBIENT, MIN_ACCENT_CONTRAST, ROOM_RGB


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb: Sequence[float]) -> str:
    return "#" + "".join(f"{int(round(max(0.0, min(255.0, float(v))))):02x}" for v in rgb[:3])


def _lin(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(rgb: Sequence[float]) -> float:
    r, g, b = (_lin(float(v)) for v in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: Sequence[float], b: Sequence[float]) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


MONO_ACCENT = "#d9a066"


def _hls(rgb: Sequence[float]) -> tuple[float, float, float]:
    return colorsys.rgb_to_hls(*(float(v) / 255.0 for v in rgb[:3]))


def _rgb(h: float, l: float, s: float) -> tuple[float, float, float]:
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return r * 255.0, g * 255.0, b * 255.0


def dominant_colors(img: Image.Image, k: int = 5, iters: int = 12) -> list[tuple[tuple[float, float, float], int]]:
    """Deterministic k-means in RGB over a 32x32 downsample. Centres start at luminance
    quantiles. Returns (colour, pixel count) sorted by count, near-identical centres merged."""
    px = np.asarray(img.convert("RGB").resize((32, 32), Image.Resampling.BILINEAR), dtype=np.float64).reshape(-1, 3)
    lum = px @ np.array([0.299, 0.587, 0.114])
    order = np.argsort(lum, kind="stable")
    centers = px[order[np.linspace(0, len(px) - 1, k).astype(int)]].copy()
    labels = np.zeros(len(px), dtype=int)
    for _ in range(iters):
        d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        labels = d.argmin(1)
        for j in range(k):
            m = labels == j
            if m.any():
                centers[j] = px[m].mean(0)
    counts = np.bincount(labels, minlength=k)
    found = sorted(((tuple(float(v) for v in centers[j]), int(counts[j])) for j in range(k) if counts[j] > 0),
                   key=lambda x: -x[1])
    merged: list[list] = []
    for c, n in found:
        for m in merged:
            if float(np.linalg.norm(np.subtract(c, m[0]))) < 1.0:
                m[1] += n
                break
        else:
            merged.append([c, n])
    return [(tuple(c), int(n)) for c, n in merged]


# Washes, tuned against the mockup's hand-picked pairs (design mockup AMB table).
WASH_L_MIN, WASH_L_GAIN, WASH_L_MAX = 0.15, 0.10, 0.25  # lightness = 0.15 + 0.10 x cover lightness
WASH2_L_MAX = 0.18  # the second (top-right, map) wash sits a little darker, as in the mockup
WASH_S_GAIN, WASH_S_MAX = 2.0, 0.45  # saturation = 2 x cover chroma, so near-grey stays near grey
WASH_CHROMA_WEIGHT = 1.5  # ranking: share x (0.35 + 1.5 x chroma)
WASH_MIN_SHARE = 0.04  # a second wash must cover at least 4% of the sprite
WASH_HUED_CHROMA = 0.06  # below this chroma a colour has no reliable hue
WASH_HUE_GAP = 40.0  # degrees between the two washes' hues when the cover has them
WASH_LIGHTNESS_GAP = 0.2  # otherwise, a clearly lighter or darker colour
WASH_VISIBILITY_SAT = 0.3  # visibility = lightness + 0.3 x saturation; the more visible wash is w0


def chroma(rgb: Sequence[float]) -> float:
    """max - min channel, 0..1. Unlike HLS saturation it stays near 0 for near-white and near-black."""
    return (max(float(v) for v in rgb[:3]) - min(float(v) for v in rgb[:3])) / 255.0


def hue_distance(a: Sequence[float], b: Sequence[float]) -> float:
    d = abs(_hls(a)[0] - _hls(b)[0]) * 360.0
    return min(d, 360.0 - d)


def wash_hex(rgb: Sequence[float], max_lightness: float = WASH_L_MAX) -> str:
    """A dark, muted version of a cover colour for the ambient wash: same hue, lightness in
    [WASH_L_MIN, max_lightness] rising slowly with the cover's lightness, saturation from the cover's chroma."""
    h, l, _ = _hls(rgb)
    light = min(max(WASH_L_MIN + WASH_L_GAIN * l, WASH_L_MIN), max_lightness)
    return rgb_to_hex(_rgb(h, light, min(chroma(rgb) * WASH_S_GAIN, WASH_S_MAX)))


def _visibility(hexv: str) -> float:
    _, l, s = _hls(hex_to_rgb(hexv))
    return l + WASH_VISIBILITY_SAT * s


def accent_hex(rgb: Sequence[float]) -> str:
    """A readable accent of the same hue: saturation clamped to [0.35, 0.65], lightness clamped
    to [0.55, 0.78], then raised until the rounded colour passes 4.5:1 on #15110d."""
    h, l, s = _hls(rgb)
    s = min(max(s, 0.35), 0.65)
    l = min(max(l, 0.55), 0.78)
    out = rgb_to_hex(_rgb(h, l, s))
    while contrast_ratio(hex_to_rgb(out), ROOM_RGB) < MIN_ACCENT_CONTRAST and l < 0.95:
        l = min(l + 0.02, 0.95)
        out = rgb_to_hex(_rgb(h, l, s))
    return out


def ambient_from_image(img: Image.Image, cluster: int) -> tuple[str, str, str]:
    """Washes: colours ranked by share x (0.35 + 1.5 x chroma), so a colourful area beats a larger black or
    white one. The second wash is the best-ranked other colour (at least 4% of the cover) of a clearly
    different hue; on a cover with one hue or none, the best-ranked clearly lighter or darker one. The more
    visible wash after shaping goes first (the large panel blob). Accent: the most saturated colour covering
    at least 4% of the cover. Grey covers get MONO_ACCENT."""
    cols = dominant_colors(img)
    if not cols:
        return FALLBACK_AMBIENT[cluster % 3]
    total = sum(n for _, n in cols)
    ranked = sorted(cols, key=lambda cn: -(cn[1] / total) * (0.35 + WASH_CHROMA_WEIGHT * chroma(cn[0])))
    first = ranked[0][0]
    pool = [c for c, n in ranked[1:] if n / total >= WASH_MIN_SHARE]
    first_hued = chroma(first) >= WASH_HUED_CHROMA

    def other_hue(c: Sequence[float]) -> bool:
        return chroma(c) >= WASH_HUED_CHROMA and (not first_hued or hue_distance(c, first) >= WASH_HUE_GAP)

    second = next((c for c in pool if other_hue(c)), None)
    if second is None:
        second = next((c for c in pool if abs(_hls(c)[1] - _hls(first)[1]) >= WASH_LIGHTNESS_GAP),
                      pool[0] if pool else first)
    a, b = (first, second) if _visibility(wash_hex(first)) >= _visibility(wash_hex(second)) else (second, first)
    candidates = [c for c, n in cols if n / total >= 0.04] or [first]
    acc = max(candidates, key=lambda c: _hls(c)[2])
    accent = MONO_ACCENT if _hls(acc)[2] < 0.08 else accent_hex(acc)
    return wash_hex(a), wash_hex(b, WASH2_L_MAX), accent
