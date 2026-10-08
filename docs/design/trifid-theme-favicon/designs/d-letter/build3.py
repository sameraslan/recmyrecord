"""star-eddy: one round star in a curl of gas. Run: arch -x86_64 python3 build3.py"""
import os, math
import build as B
from build import svg, tile, rad, stops, SKY

HERE = os.path.dirname(os.path.abspath(__file__))
CORE = "#fffaf4"


def band(cx, cy, r0, r1, a0, sweep, wmax, n=18, p=.75, ease=1.0, nd=1):
    """Closed outline of a spiral band whose width swells in the middle and tapers to both ends."""
    L, R = [], []
    for i in range(n + 1):
        t = i / n
        a = math.radians(a0 + sweep * t)
        r = r0 + (r1 - r0) * t ** ease
        w = wmax * math.sin(math.pi * t) ** p
        L.append((cx + (r + w) * math.cos(a), cy + (r + w) * math.sin(a)))
        R.append((cx + (r - w) * math.cos(a), cy + (r - w) * math.sin(a)))
    pts = L + R[::-1]
    m = len(pts)
    f = lambda v: f"{v:.{nd}f}".rstrip("0").rstrip(".")
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    s = mid(pts[-1], pts[0])
    d = f"M{f(s[0])} {f(s[1])}"
    for i in range(m):
        e = mid(pts[i], pts[(i + 1) % m])
        d += f"Q{f(pts[i][0])} {f(pts[i][1])} {f(e[0])} {f(e[1])}"
    return d + "Z"


def lin(id_, x1, y1, x2, y2, st):
    return f'<linearGradient id="{id_}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" gradientUnits="userSpaceOnUse">{stops(st)}</linearGradient>'


def blur(id_, s):
    return f'<filter id="{id_}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="{s}"/></filter>'


# long arm: dusty teal by the star, through cream-gold, to a salmon tail; short arm: slate periwinkle
TEAL = [(0, "#9ad6d4"), (.3, "#7fc3c6"), (.56, "#f0d6a6"), (1, "#e28c72")]
WARM = [(0, "#aab6ee"), (1, "#6f86cc")]


def build():
    out = {}
    # ---------- 32 ----------
    cx, cy = 17.8, 12.8
    long_ = band(cx, cy, 3.4, 15.4, -165, 318, 2.9, 15, .7, 1.15)
    short = band(cx, cy, 4.3, 7.4, 20, 150, 1.55, 10, .8)
    defs = (lin("t", 27, 5, 5, 27, TEAL) + lin("w", 22, 16, 11, 20, WARM) + blur("f", 1.1)
            + rad("h", cx, cy, 6, "#d8f4f0", .55) + rad("a", 4, 30, 15, "#426ebe", .3)
            + '<clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath>')
    arms = f'<path fill="url(#t)" d="{long_}"/><path fill="url(#w)" d="{short}"/>'
    body = (tile(32, 7, f'<g clip-path="url(#c)"><rect width="32" height="32" fill="url(#a)"/><g filter="url(#f)" opacity=".75">{arms}</g></g>')
            + f'<g opacity=".94">{arms}</g><circle cx="{cx}" cy="{cy}" r="6" fill="url(#h)"/><circle cx="{cx}" cy="{cy}" r="2.5" fill="{CORE}"/>')
    out["icon.svg"] = svg(32, body, defs)

    # ---------- 16: core on the pixel grid (3x3), fat curl, two colour areas ----------
    cx, cy = 9.5, 6.5
    long_ = band(cx, cy, 2.8, 8.2, -150, 300, 1.55, 12, .6, 1.2, 2)
    short = band(cx, cy, 2.9, 3.4, 25, 120, .95, 6, .7, 1, 2)
    defs = (lin("t", 14, 2, 2.5, 13.5, [(0, "#a4dedb"), (.36, "#86cacc"), (.58, "#f4d9a8"), (1, "#e8937a")]) + lin("w", 12, 8, 7, 10, [(0, "#b4beF2"), (1, "#8496d8")])
            + blur("f", .7) + rad("a", 2, 15, 8, "#426ebe", .3)
            + '<clipPath id="c"><rect width="16" height="16" rx="3.5"/></clipPath>')
    arms = f'<path fill="url(#t)" d="{long_}"/>'  # the short arm made a "mouth" under the star at this size
    body = (tile(16, 3.5, f'<g clip-path="url(#c)"><rect width="16" height="16" fill="url(#a)"/><g filter="url(#f)" opacity=".6">{arms}</g></g>')
            + f'{arms}<circle cx="{cx}" cy="{cy}" r="1.55" fill="{CORE}"/>')
    out["icon-16.svg"] = svg(16, body, defs)

    # ---------- 180: mark inside the middle 70%, marbled gas, a few faint stars ----------
    cx, cy = 96, 80
    k = 4.5
    long_ = band(cx, cy, 3.3 * k, 14.2 * k, -165, 318, 2.9 * k, 30, .7, 1.15)
    short = band(cx, cy, 4.3 * k, 7.6 * k, 20, 150, 1.7 * k, 16, .8)
    outer = band(cx, cy, 9 * k, 16.5 * k, -60, 150, 1.3 * k, 16, .8)
    defs = (lin("t", 140, 30, 36, 146, TEAL) + lin("w", 118, 92, 66, 112, WARM) + lin("o", 150, 60, 110, 150, [(0, "#788cdc"), (1, "#426ebe")])
            + blur("f", 7) + blur("g", 1.2) + rad("h", cx, cy, 30, "#d8f4f0", .6) + rad("a", 24, 166, 110, "#426ebe", .34)
            + rad("b", 160, 24, 80, "#c9684e", .16)
            + '<filter id="m" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">'
              '<feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="4"/>'
              '<feDisplacementMap in="SourceGraphic" scale="14" xChannelSelector="R" yChannelSelector="G"/>'
              '<feGaussianBlur stdDeviation=".7"/></filter>')
    arms = f'<path fill="url(#t)" d="{long_}"/><path fill="url(#w)" d="{short}"/>'
    stars = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{CORE}" opacity="{o}"/>' for x, y, r, o in
                    [(28, 38, 1, .6), (154, 150, 1.2, .55), (22, 112, .9, .45), (150, 30, .9, .45), (64, 20, .7, .35),
                     (126, 164, .7, .35), (112, 104, 1, .8), (74, 66, .8, .7), (122, 62, .7, .6), (88, 118, .7, .6)])
    body = (f'<rect width="180" height="180" fill="{SKY}"/><rect width="180" height="180" fill="url(#a)"/><rect width="180" height="180" fill="url(#b)"/>'
            f'<path fill="url(#o)" opacity=".35" filter="url(#f)" d="{outer}"/>'
            f'<g filter="url(#f)" opacity=".7">{arms}</g><g filter="url(#m)" opacity=".95">{arms}</g>{stars}'
            f'<circle cx="{cx}" cy="{cy}" r="30" fill="url(#h)"/><circle cx="{cx}" cy="{cy}" r="10.5" fill="{CORE}"/>')
    out["apple-icon.svg"] = svg(180, body, defs)
    return out


if __name__ == "__main__":
    folder = os.path.join(HERE, "star-eddy")
    os.makedirs(folder, exist_ok=True)
    for name, text in build().items():
        with open(os.path.join(folder, name), "w") as f:
            f.write(text)
    B.render(folder)
    B.sheet(folder)
    print({n: os.path.getsize(os.path.join(folder, n)) for n in ("icon.svg", "icon-16.svg", "apple-icon.svg")})
