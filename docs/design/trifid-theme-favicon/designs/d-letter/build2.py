"""Round two: gas-r-v2, cutout-r-v2, eddy-r. Leaves the round-one folders alone.
Run: arch -x86_64 python3 build2.py
"""
import os, math
import build as B
from build import svg, tile, rad, stops, SKY, STEM32, ARM32, SKEW32, BIG32

HERE = os.path.dirname(os.path.abspath(__file__))
CREAM = "#f4eee2"


def circ(cx, cy, r):
    return f"M{cx-r:g} {cy}a{r} {r} 0 1 0 {2*r:g} 0a{r} {r} 0 1 0 {-2*r:g} 0Z"


# ---- 16 px r, placed by hand on the grid (no skew transform) ----
# 2 px slanted stem with an angled top cut and no entry flag (that flag was the "t" bar),
# a 1.4 px arm leaving the top of the stem, a 4 px ball, and a clear notch under the arm.
BALL16 = (11.7, 5.4, 2.05)
STEM16 = "M5.9 3.7L8.2 2.7L6.5 13.5L4.4 13.5Z"
ARM16 = "M7.6 4.1C8.7 2.9 10.2 2.5 11.9 2.9L10.4 4.6C9.6 4.5 8.6 5 7.7 6.2Z"
R16 = STEM16 + ARM16 + circ(*BALL16)

# lighter 32 px r for the cutout: narrower stem, smaller ball
STEM32L = ("M6.9 11.9C8.5 9.8 11 8.2 14.9 7.4L14.9 23.7C14.9 24.5 14.5 25 13.7 25"
           "L11.8 25L11.8 12.3C11.8 11.3 11.2 10.9 10.3 11.2C9.2 11.5 8.3 12 7.6 12.6Z")
ARM32L = ("M13.8 16.2C15 11.7 17.9 8.1 21.6 7.5C24 7.2 25.7 8.6 25.7 10.6"
          "C25.7 12.3 24.5 13.4 22.9 13.4C21.5 13.4 20.5 12.5 20.5 11.3C20.5 10.9 20.6 10.5 20.8 10.2"
          "C18.4 11.3 16.1 14.7 14.9 19.6L13.8 19.6Z")
APPLE = "translate(5 0) scale(5.3125) translate(.6 .9) "


def rects(n, ids, m=0):
    return "".join(f'<rect x="{-m}" y="{-m}" width="{n+2*m}" height="{n+2*m}" fill="url(#{i})"/>' for i in ids)


def dots(pts):
    return "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fffaf4" opacity="{o}"/>' for x, y, r, o in pts)


STARS = [(28, 40, 1, .6), (150, 152, 1.2, .55), (22, 118, .9, .45), (52, 164, .8, .4), (64, 20, .7, .35),
         (118, 166, .7, .35), (160, 100, .8, .4)]


# ---------------- gas-r-v2 ----------------
def gas_r_v2():
    out = {}
    # marbled fill: pale teal body, cream-gold and salmon pooling at the ball, periwinkle in the stem
    def marble(k, ox=0, oy=0):
        P = lambda x, y: (round(x * k + ox, 2), round(y * k + oy, 2))
        return (rad("m1", *P(12, 24), 9 * k, "#8fe3e6", 1, (.5, .9)) + rad("m2", *P(14.5, 13), 6.5 * k, "#c3c9fb", 1, (.5, .85))
                + rad("m3", *P(25, 9.5), 6.5 * k, "#ffe2ad", 1, (.55, .95)) + rad("m4", *P(27, 13), 4.2 * k, "#f59d7e", .95, (.5, .7))
                + rad("m5", *P(18.5, 9.5), 3.6 * k, "#fff6e4", .9))
    haze = lambda k: rad("a", 6 * k, 28 * k, 17 * k, "#426ebe", .5) + rad("b", 28 * k, 5 * k, 14 * k, "#c9684e", .3)
    blur = lambda s: f'<filter id="f" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="{s}"/></filter>'

    # 32: letter thickened by a 0.7 outline inside a mask, soft glow behind
    d32 = STEM32 + ARM32
    defs = (marble(1) + haze(1) + blur(1.5) + '<clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath>'
            f'<mask id="k"><path transform="{BIG32}" d="{d32}" fill="#fff" stroke="#fff" stroke-width=".7" stroke-linejoin="round"/></mask>')
    body = (tile(32, 7, f'<g clip-path="url(#c)">{rects(32, "ab")}'
                        f'<path transform="{BIG32}" d="{d32}" fill="#9fdcea" opacity=".55" filter="url(#f)"/></g>')
            + f'<g mask="url(#k)"><rect width="32" height="32" fill="#d9f1f2"/>{rects(32, ["m1", "m2", "m3", "m4", "m5"])}</g>')
    out["icon.svg"] = svg(32, body, defs)

    # 16: two clear zones (cool stem, warm ball) with a little periwinkle between, plus glow
    bx, by, br = BALL16
    defs = (rad("m1", 5.5, 12.5, 6, "#8fe3e6", 1, (.5, .9)) + rad("m2", 7.4, 5, 3.4, "#d5d9ff", 1, (.5, .8))
            + rad("m3", bx - .3, by - .5, 3.6, "#ffe6b4", 1, (.6, 1)) + rad("m4", bx + 1.7, by + 1.6, 2.2, "#f7a183", .95)
            + haze(.5) + blur(.9) + '<clipPath id="c"><rect width="16" height="16" rx="3.5"/></clipPath>'
            f'<clipPath id="l"><path d="{R16}"/></clipPath>')
    body = (tile(16, 3.5, f'<g clip-path="url(#c)">{rects(16, "ab")}<path d="{R16}" fill="#a8dfee" opacity=".5" filter="url(#f)"/></g>')
            + f'<g clip-path="url(#l)"><rect width="16" height="16" fill="#e2f5f5"/>{rects(16, ["m1", "m2", "m3", "m4"])}</g>')
    out["icon-16.svg"] = svg(16, body, defs)

    # 180
    T = APPLE + SKEW32
    defs = (marble(1) + rad("a", 36, 152, 105, "#426ebe", .5) + rad("b", 152, 30, 85, "#c9684e", .34)
            + rad("d", 92, 100, 75, "#96c8d6", .15) + blur(1.3)
            + f'<mask id="k"><path d="{d32}" fill="#fff" stroke="#fff" stroke-width=".5" stroke-linejoin="round"/></mask>'
            '<filter id="w" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
            '<feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="11"/>'
            '<feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>')
    body = (f'<rect width="180" height="180" fill="{SKY}"/>{rects(180, "abd")}{dots(STARS)}'
            f'<g transform="{T}"><path d="{d32}" fill="#9fdcea" opacity=".5" filter="url(#f)"/>'
            f'<g mask="url(#k)"><rect width="32" height="32" fill="#d9f1f2"/><g filter="url(#w)">{rects(32, ["m1", "m2", "m3", "m4", "m5"], 6)}</g></g></g>')
    out["apple-icon.svg"] = svg(180, body, defs)
    return out


# ---------------- cutout-r-v2 ----------------
def cutout_r_v2():
    out = {}
    BASE = "#0d111c"

    def field(k):
        # night sky with gas: teal pool low right, slate left, a small dusty cream patch behind the arm
        return (rad("p", 21 * k, 22 * k, 17 * k, "#62b4b8", 1, (.45, .85)) + rad("q", 7 * k, 11 * k, 16 * k, "#5a70a6", 1, (.45, .8))
                + rad("s", 25 * k, 7 * k, 9 * k, "#cdb48a", .8, (.5, .45)) + rad("t", 13 * k, 18 * k, 8 * k, "#8fcfd0", .55)
                + f'<radialGradient id="vg" cx="{16*k}" cy="{16*k}" r="{23*k}" gradientUnits="userSpaceOnUse">'
                  f'<stop offset=".5" stop-color="{SKY}" stop-opacity="0"/><stop offset="1" stop-color="{SKY}" stop-opacity=".92"/></radialGradient>')

    dL = STEM32L + ARM32L
    BIGL = "translate(16.9 16.15) scale(1.14) translate(-16.9 -16.15) " + SKEW32
    defs = field(1) + '<clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath>'
    body = (f'<g clip-path="url(#c)"><rect width="32" height="32" fill="{BASE}"/>{rects(32, ["q", "p", "t", "s", "vg"])}</g>'
            f'<path transform="{BIGL}" fill="{SKY}" d="{dL}"/>')
    out["icon.svg"] = svg(32, body, defs)

    # 16: two colour areas only, slate upper left and teal lower right, corners sinking to sky
    defs = (rad("p", 11, 11, 9.5, "#6cc0c2", 1, (.5, .9)) + rad("q", 3.5, 4, 8.5, "#6079b4", 1, (.5, .85))
            + f'<radialGradient id="vg" cx="8" cy="8" r="11.5" gradientUnits="userSpaceOnUse">'
              f'<stop offset=".62" stop-color="{SKY}" stop-opacity="0"/><stop offset="1" stop-color="{SKY}" stop-opacity=".85"/></radialGradient>'
            + '<clipPath id="c"><rect width="16" height="16" rx="3.5"/></clipPath>')
    body = (f'<g clip-path="url(#c)"><rect width="16" height="16" fill="#27365a"/>{rects(16, ["q", "p", "vg"])}</g>'
            f'<path fill="{SKY}" d="{R16}"/>')
    out["icon-16.svg"] = svg(16, body, defs)

    # 180: same field, marbled, with dust
    k = 180 / 32
    defs = (field(k).replace('offset=".5" stop-color="#060609"', 'offset=".55" stop-color="#060609"')
            + '<filter id="w" filterUnits="userSpaceOnUse" x="-120" y="-120" width="420" height="420" color-interpolation-filters="sRGB">'
              '<feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="5" result="n"/>'
              '<feDisplacementMap in="SourceGraphic" in2="n" scale="64" xChannelSelector="R" yChannelSelector="G"/></filter>'
              '<filter id="v" x="0" y="0" width="100%" height="100%">'
              '<feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="4" seed="3"/>'
              '<feColorMatrix values="0 0 0 0 .024  0 0 0 0 .024  0 0 0 0 .035  1.7 0 0 0 -.6"/>'
              '<feGaussianBlur stdDeviation=".6"/></filter>')
    g = rects(180, ["q", "p", "t", "s"], 120)
    body = (f'<rect width="180" height="180" fill="{BASE}"/>{g}<g filter="url(#w)"><rect x="-120" y="-120" width="420" height="420" fill="{BASE}"/>{g}</g>'
            '<rect width="180" height="180" filter="url(#v)" opacity=".6"/><rect width="180" height="180" fill="url(#vg)"/>'
            + dots([(x, y, r, min(1, o + .25)) for x, y, r, o in STARS] + [(60, 96, .8, .6), (132, 118, .9, .7), (104, 150, .7, .6)])
            + f'<path transform="{APPLE}{SKEW32}" fill="{SKY}" d="{dL}"/>')
    out["apple-icon.svg"] = svg(180, body, defs)
    return out


# ---------------- eddy-r ----------------
def spiral(cx, cy, r0, r1, a0, sweep, n=14):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = math.radians(a0 + sweep * t)
        r = r0 + (r1 - r0) * t
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    # smooth with quadratic midpoints
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    for i in range(1, n):
        mx, my = (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2
        d += f"Q{pts[i][0]:.1f} {pts[i][1]:.1f} {mx:.1f} {my:.1f}"
    return d


def eddy_r():
    out = {}
    TEAL, GOLD, SALMON = "#7fd2d4", "#f1c98c", "#e98d70"
    blur = lambda s: f'<filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{s}"/></filter>'

    def arms(cx, cy, s, n=12):
        # three arms unwinding clockwise from the ball, like gas being shed
        spec = [(TEAL, 20, 2.6, 6.6, 1.5), (GOLD, 150, 2.6, 6.0, 1.35), (SALMON, 265, 2.6, 5.4, 1.2)]
        return "".join(f'<path d="{spiral(cx, cy, r0*s, r1*s, a, 215, n)}" stroke="{c}" stroke-width="{w*s:g}"/>'
                       for c, a, r0, r1, w in spec)

    # 32 (letter nudged left to give the eddy room)
    L = "translate(-1.6 .4) " + SKEW32
    cx, cy = 22.15, 11.3
    defs = (blur(.9) + rad("a", 5, 29, 16, "#426ebe", .38) + rad("h", cx, cy, 10, "#96c8d6", .28)
            + '<clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath>')
    e = f'<g fill="none" stroke-linecap="round">{arms(cx, cy, 1)}</g>'
    body = (tile(32, 7, f'<g clip-path="url(#c)">{rects(32, "ah")}<g filter="url(#f)" opacity=".9">{e}</g><g opacity=".8">{e}</g></g>')
            + f'<path transform="{L}" fill="{CREAM}" d="{STEM32}{ARM32}"/>')
    out["icon.svg"] = svg(32, body, defs)

    # 16: letter shifted left 1 px; the eddy is two short curls, teal under the ball and gold over it
    bx, by, br = BALL16
    bx -= 1.2
    r16 = STEM16 + ARM16 + circ(*BALL16)
    defs = (blur(.55) + rad("a", 2, 15, 8, "#426ebe", .38) + '<clipPath id="c"><rect width="16" height="16" rx="3.5"/></clipPath>')
    curl = (f'<path d="{spiral(bx, by, 3.1, 3.9, -20, 150, 6)}" stroke="{TEAL}" stroke-width="1.5"/>'
            f'<path d="{spiral(bx, by, 3.1, 3.6, 200, 125, 6)}" stroke="{GOLD}" stroke-width="1.4"/>')
    e = f'<g fill="none" stroke-linecap="round">{curl}</g>'
    body = (tile(16, 3.5, f'<g clip-path="url(#c)">{rects(16, "a")}<g filter="url(#f)">{e}</g>{e}</g>')
            + f'<path transform="translate(-1.2 0)" fill="{CREAM}" d="{r16}"/>')
    out["icon-16.svg"] = svg(16, body, defs)

    # 180: longer, softer arms and a faint second winding
    defs = (blur(.7) + '<filter id="f2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>'
            + rad("a", 30, 160, 110, "#426ebe", .45) + rad("d", 150, 130, 70, "#788cdc", .16) + rad("h", cx, cy, 12, "#96c8d6", .3))
    e = f'<g fill="none" stroke-linecap="round">{arms(cx, cy, 1.12, 22)}</g>'
    body = (f'<rect width="180" height="180" fill="{SKY}"/>{rects(180, "ad")}{dots(STARS)}'
            f'<g transform="{APPLE}"><rect x="-4" y="-4" width="40" height="40" fill="url(#h)"/>'
            f'<g filter="url(#f2)" opacity=".7" transform="rotate(50 {cx} {cy})">{e}</g>'
            f'<g filter="url(#f)">{e}</g><g opacity=".55">{e}</g>'
            f'<path transform="{L}" fill="{CREAM}" d="{STEM32}{ARM32}"/></g>')
    out["apple-icon.svg"] = svg(180, body, defs)
    return out


if __name__ == "__main__":
    for slug, fn in [("gas-r-v2", gas_r_v2), ("cutout-r-v2", cutout_r_v2), ("eddy-r", eddy_r)]:
        folder = os.path.join(HERE, slug)
        os.makedirs(folder, exist_ok=True)
        for name, text in fn().items():
            with open(os.path.join(folder, name), "w") as f:
                f.write(text)
        B.render(folder)
        B.sheet(folder)
        print(slug, {n: os.path.getsize(os.path.join(folder, n)) for n in ("icon.svg", "icon-16.svg", "apple-icon.svg")})
    from PIL import Image
    ims = [Image.open(os.path.join(HERE, s, "sheet.png")) for s in ("gas-r-v2", "cutout-r-v2", "eddy-r")]
    w, h = ims[0].size
    o = Image.new("RGB", (w, h * 3))
    for i, im in enumerate(ims):
        o.paste(im, (0, i * h))
    o.save(os.path.join(HERE, "_all2.png"))
