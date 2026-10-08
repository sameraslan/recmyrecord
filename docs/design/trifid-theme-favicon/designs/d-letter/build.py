"""Builds the three letter concepts, renders them and makes a sheet per concept.
Run: python3 build.py   (from anywhere; writes next to this file)
"""
import os, subprocess
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))

SKY = "#060609"
TILE = "#07060a"
EDGE = "#24222c"

# ---- The letter: lowercase italic serif r, drawn upright then slanted. ----
# 32 grid. Stem with a wedge entry stroke, arm branching low and ending in a ball.
STEM32 = ("M6.6 11.9C8.3 9.7 10.9 8.1 14.9 7.3L14.9 23.6C14.9 24.5 14.5 25 13.6 25"
          "L11.1 25L11.1 12.2C11.1 11.2 10.5 10.8 9.6 11.1C8.7 11.4 7.9 12 7.3 12.6Z")
ARM32 = ("M13.6 16.2C14.9 11.6 17.9 8 21.6 7.4C24.2 7 26.2 8.6 26.2 10.8"
         "C26.2 12.7 24.8 14 23 14C21.4 14 20.3 12.9 20.3 11.5C20.3 11 20.4 10.6 20.6 10.2"
         "C18.2 11.2 16 14.6 14.9 19.6L13.6 19.6Z")
# same arm without relying on the ball (ball drawn separately as a star)
BALL32 = (23.2, 10.9, 3.0)
SKEW32 = "translate(2.9 0) skewX(-12)"

# 16 grid: heavier stem (2.4 px), shorter entry wedge, fat arm, big ball.
STEM16 = ("M3.6 5.2C4.4 4.1 5.6 3.2 7.4 2.7L7.4 13C7.4 13.4 7.2 13.6 6.8 13.6L4.8 13.6"
          "L4.8 5.6C4.5 5.6 4.2 5.8 3.9 6.1Z")
ARM16 = ("M6.8 8.6C7.4 5.6 9.2 3.4 11.4 3.2C13 3.1 14.2 4.2 14.2 5.7"
         "C14.2 7 13.2 7.9 12 7.9C10.9 7.9 10.1 7.2 10.1 6.2C9 6.9 8 8.6 7.4 11L6.8 11Z")
BALL16 = (12.1, 5.7, 2.1)
SKEW16 = "translate(.25 0) skewX(-10)"
BIG32 = "translate(16.9 16.15) scale(1.12) translate(-16.9 -16.15) " + SKEW32


def tile(n, rx, glow=""):
    return (f'<rect width="{n}" height="{n}" rx="{rx}" fill="{TILE}"/>{glow}'
            f'<rect x=".5" y=".5" width="{n-1}" height="{n-1}" rx="{rx-.5}" fill="none" stroke="{EDGE}"/>')


def svg(n, body, defs=""):
    d = f"<defs>{defs}</defs>" if defs else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}">{d}{body}</svg>\n'


def stops(pairs):
    return "".join(f'<stop offset="{o}" stop-color="{c}"' + (f' stop-opacity="{a[0]}"' if a else "") + "/>"
                   for o, c, *a in pairs)


def rad(id_, cx, cy, r, c, a0=1.0, mid=None):
    m = f'<stop offset="{mid[0]}" stop-color="{c}" stop-opacity="{mid[1]}"/>' if mid else ""
    return (f'<radialGradient id="{id_}" cx="{cx}" cy="{cy}" r="{r}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{c}" stop-opacity="{a0}"/>{m}'
            f'<stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>')


GAS = [(0, "#6fd3dc"), (.3, "#8fa4ee"), (.52, "#c9b6c4"), (.72, "#f4be78"), (1, "#e8603c")]


# ---------------- concept 1: gas-r ----------------
def gas_r():
    out = {}
    # 32
    defs = (f'<linearGradient id="g" x1="9" y1="26" x2="25" y2="7" gradientUnits="userSpaceOnUse">{stops(GAS)}</linearGradient>'
            + rad("a", 7, 27, 17, "#426ebe", .5) + rad("b", 27, 6, 15, "#e8603c", .34)
            + '<clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath>')
    glow = '<g clip-path="url(#c)"><rect width="32" height="32" fill="url(#a)"/><rect width="32" height="32" fill="url(#b)"/></g>'
    body = tile(32, 7, glow) + f'<path transform="{BIG32}" fill="url(#g)" d="{STEM32}{ARM32}"/>'
    out["icon.svg"] = svg(32, body, defs)
    # 16
    g16 = [(0, "#6fd3dc"), (.38, "#9aa8f0"), (.7, "#f4be78"), (1, "#ec6a42")]
    defs = (f'<linearGradient id="g" x1="4" y1="13.6" x2="12.5" y2="3.4" gradientUnits="userSpaceOnUse">{stops(g16)}</linearGradient>'
            + rad("a", 3, 14, 9, "#426ebe", .5) + rad("b", 14, 2, 8, "#e8603c", .32)
            + '<clipPath id="c"><rect width="16" height="16" rx="3.5"/></clipPath>')
    glow = '<g clip-path="url(#c)"><rect width="16" height="16" fill="url(#a)"/><rect width="16" height="16" fill="url(#b)"/></g>'
    body = tile(16, 3.5, glow) + f'<path transform="{SKEW16}" fill="url(#g)" d="{STEM16}{ARM16}"/>'
    out["icon-16.svg"] = svg(16, body, defs)
    # 180: full bleed sky, soft cloud behind, swirl highlights inside the letter
    defs = (f'<linearGradient id="g" x1="9" y1="26" x2="25" y2="7" gradientUnits="userSpaceOnUse">{stops(GAS)}</linearGradient>'
            + rad("a", 40, 150, 100, "#426ebe", .55) + rad("b", 150, 34, 90, "#e8603c", .42)
            + rad("d", 96, 100, 70, "#96c8d6", .16) + rad("e", 150, 120, 60, "#f4be78", .14)
            + rad("h1", 13, 21, 5, "#dffbff", .75) + rad("h2", 23.5, 10, 4, "#fff1d6", .8)
            + rad("h3", 15, 13, 5, "#788cdc", .6)
            + f'<clipPath id="l"><path d="{STEM32}{ARM32}"/></clipPath>'
            + '<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1"/></filter>')
    stars = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fffaf4" opacity="{o}"/>' for x, y, r, o in
                    [(28, 40, 1, .6), (150, 150, 1.2, .55), (136, 22, .9, .5), (22, 118, .9, .45), (160, 92, .8, .4),
                     (52, 164, .8, .4), (64, 20, .7, .35), (118, 164, .7, .35)])
    body = (f'<rect width="180" height="180" fill="{SKY}"/>'
            '<rect width="180" height="180" fill="url(#a)"/><rect width="180" height="180" fill="url(#b)"/>'
            '<rect width="180" height="180" fill="url(#d)"/><rect width="180" height="180" fill="url(#e)"/>' + stars +
            f'<g transform="translate(5 0) scale(5.3125) translate(.6 .9) {SKEW32}">'
            f'<path fill="url(#g)" opacity=".5" filter="url(#s)" d="{STEM32}{ARM32}"/>'
            f'<path fill="url(#g)" d="{STEM32}{ARM32}"/>'
            '<g clip-path="url(#l)"><rect width="32" height="32" fill="url(#h3)"/><rect width="32" height="32" fill="url(#h1)"/>'
            '<rect width="32" height="32" fill="url(#h2)"/></g></g>')
    out["apple-icon.svg"] = svg(180, body, defs)
    return out


# ---------------- concept 2: star-r ----------------
def spark(cx, cy, R, w):
    # four-point star with concave sides
    return (f'M{cx} {cy-R}Q{cx+w} {cy-w} {cx+R} {cy}Q{cx+w} {cy+w} {cx} {cy+R}'
            f'Q{cx-w} {cy+w} {cx-R} {cy}Q{cx-w} {cy-w} {cx} {cy-R}Z')


def star_r():
    out = {}
    INK = "#f1ece4"
    bx, by, br = BALL32
    # arm fades from letter white into gold as it nears the star
    armg = (f'<linearGradient id="g" x1="14" y1="19" x2="24" y2="9" gradientUnits="userSpaceOnUse">'
            f'{stops([(0, INK), (.45, INK), (1, "#f4be78")])}</linearGradient>')
    halo = (f'<radialGradient id="h" cx="{bx}" cy="{by}" r="9.5" gradientUnits="userSpaceOnUse">'
            f'{stops([(0, "#f4be78", .95), (.3, "#ee8a4c", .6), (.62, "#e8603c", .22), (1, "#e8603c", 0)])}</radialGradient>')
    cool = rad("a", 6, 28, 16, "#426ebe", .4)
    clip = '<clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath>'
    glow = '<g clip-path="url(#c)"><rect width="32" height="32" fill="url(#a)"/><rect width="32" height="32" fill="url(#h)"/></g>'
    letter = (f'<g transform="{SKEW32}"><path fill="{INK}" d="{STEM32}"/><path fill="url(#g)" d="{ARM32}"/></g>')
    # star sits where the ball lands after the slant
    sx, sy = 23.75, 10.9
    star = (f'<path fill="#fffaf4" d="{spark(sx, sy, 6.2, 1.15)}"/><circle cx="{sx}" cy="{sy}" r="2.7" fill="#fffaf4"/>')
    out["icon.svg"] = svg(32, tile(32, 7, glow) + letter + star, armg + halo + cool + clip)

    # 16: no sparkle arms to speak of; a white-hot 3 px dot in an ember halo
    bx, by, br = BALL16
    sx, sy = 11.35, 5.7
    halo = (f'<radialGradient id="h" cx="{sx}" cy="{sy}" r="5.6" gradientUnits="userSpaceOnUse">'
            f'{stops([(0, "#f4be78", 1), (.36, "#ee8246", .75), (.7, "#e8603c", .3), (1, "#e8603c", 0)])}</radialGradient>')
    cool = rad("a", 3, 14, 8, "#426ebe", .4)
    clip = '<clipPath id="c"><rect width="16" height="16" rx="3.5"/></clipPath>'
    glow = '<g clip-path="url(#c)"><rect width="16" height="16" fill="url(#a)"/><rect width="16" height="16" fill="url(#h)"/></g>'
    armg = (f'<linearGradient id="g" x1="7" y1="10" x2="12" y2="4.5" gradientUnits="userSpaceOnUse">'
            f'{stops([(0, INK), (.5, INK), (1, "#f4be78")])}</linearGradient>')
    letter = f'<g transform="{SKEW16}"><path fill="{INK}" d="{STEM16}"/><path fill="url(#g)" d="{ARM16}"/></g>'
    star = f'<circle cx="{sx}" cy="{sy}" r="2" fill="#fffaf4"/>'
    out["icon-16.svg"] = svg(16, tile(16, 3.5, glow) + letter + star, armg + halo + cool + clip)

    # 180
    T = f'translate(5 0) scale(5.3125) translate(.6 .9)'
    sx, sy = 23.75, 10.9
    defs = (f'<linearGradient id="g" x1="14" y1="19" x2="24" y2="9" gradientUnits="userSpaceOnUse">'
            f'{stops([(0, INK), (.4, INK), (1, "#f4be78")])}</linearGradient>'
            f'<radialGradient id="h" cx="{sx}" cy="{sy}" r="15" gradientUnits="userSpaceOnUse">'
            f'{stops([(0, "#f4be78", .95), (.2, "#ee8a4c", .6), (.5, "#e8603c", .24), (1, "#e8603c", 0)])}</radialGradient>'
            + rad("a", 30, 160, 110, "#426ebe", .5) + rad("d", 70, 110, 70, "#96c8d6", .13)
            + rad("e", 168, 120, 60, "#788cdc", .2))
    stars = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fffaf4" opacity="{o}"/>' for x, y, r, o in
                    [(30, 36, 1, .55), (152, 152, 1.2, .5), (24, 120, .9, .45), (58, 162, .8, .4),
                     (66, 22, .8, .4), (124, 166, .7, .35), (164, 100, .8, .35)])
    body = (f'<rect width="180" height="180" fill="{SKY}"/><rect width="180" height="180" fill="url(#a)"/>'
            '<rect width="180" height="180" fill="url(#d)"/><rect width="180" height="180" fill="url(#e)"/>' + stars +
            f'<g transform="{T}"><rect x="-4" y="-4" width="40" height="40" fill="url(#h)"/>'
            f'<g transform="{SKEW32}"><path fill="{INK}" d="{STEM32}"/><path fill="url(#g)" d="{ARM32}"/></g>'
            f'<path fill="#fffaf4" d="{spark(sx, sy, 7.4, 1.0)}"/><path fill="#fffaf4" opacity=".7" transform="rotate(45 {sx} {sy})" d="{spark(sx, sy, 4.3, .9)}"/>'
            f'<circle cx="{sx}" cy="{sy}" r="2.7" fill="#fffaf4"/></g>')
    out["apple-icon.svg"] = svg(180, body, defs)
    return out


# ---------------- concept 3: cutout-r ----------------
def cutout_r():
    out = {}

    def gasfield(n, k):
        # k = n/32 ; a field of gas laid out like the map: ember top-left, gold right, teal below, blue left
        d = (rad("p", 16 * k, 16 * k, 26 * k, "#788cdc", 1, (.6, .9))
             + rad("q", 5 * k, 3 * k, 20 * k, "#e8603c", 1, (.45, .8))
             + rad("s", 29 * k, 9 * k, 17 * k, "#f4be78", 1, (.4, .85))
             + rad("t", 20 * k, 31 * k, 18 * k, "#5fd0da", 1, (.4, .85))
             + rad("u", 0, 26 * k, 14 * k, "#426ebe", 1, (.4, .8)))
        d += (f'<radialGradient id="vg" cx="{16*k}" cy="{16*k}" r="{23*k}" gradientUnits="userSpaceOnUse">'
              f'<stop offset=".62" stop-color="{SKY}" stop-opacity="0"/><stop offset="1" stop-color="{SKY}" stop-opacity=".6"/></radialGradient>')
        m = 120 if n == 180 else 0
        b = "".join(f'<rect x="{-m}" y="{-m}" width="{n+2*m}" height="{n+2*m}" fill="url(#{i})"/>' for i in "pqstu")
        return d, b
    VG = '<rect width="{0}" height="{0}" fill="url(#vg)"/>'

    # 32
    d, b = gasfield(32, 1)
    defs = d + '<clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath>'
    body = (f'<g clip-path="url(#c)"><rect width="32" height="32" fill="#39508f"/>{b}{VG.format(32)}</g>'
            f'<path transform="{BIG32}" fill="{SKY}" d="{STEM32}{ARM32}"/>')
    out["icon.svg"] = svg(32, body, defs)
    # 16
    d, b = gasfield(16, .5)
    defs = d + '<clipPath id="c"><rect width="16" height="16" rx="3.5"/></clipPath>'
    body = (f'<g clip-path="url(#c)"><rect width="16" height="16" fill="#39508f"/>{b}{VG.format(16)}</g>'
            f'<path transform="{SKEW16}" fill="{SKY}" d="{STEM16}{ARM16}"/>')
    out["icon-16.svg"] = svg(16, body, defs)
    # 180: gas fills the square, marbled by turbulence displacement, dark letter on top
    d, b = gasfield(180, 180 / 32)
    defs = (d + '<filter id="w" filterUnits="userSpaceOnUse" x="-120" y="-120" width="420" height="420" color-interpolation-filters="sRGB">'
            '<feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="3" seed="7" result="n"/>'
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="70" xChannelSelector="R" yChannelSelector="G"/>'
            '</filter>'
            '<filter id="v" x="0" y="0" width="100%" height="100%">'
            '<feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="4" seed="3"/>'
            '<feColorMatrix values="0 0 0 0 .024  0 0 0 0 .024  0 0 0 0 .035  1.6 0 0 0 -.62"/>'
            '<feGaussianBlur stdDeviation=".6"/></filter>'
            )
    stars = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fffaf4" opacity="{o}"/>' for x, y, r, o in
                    [(34, 44, 1.2, .8), (150, 146, 1.3, .8), (140, 30, 1, .7), (26, 126, 1, .7), (158, 88, .9, .6),
                     (56, 160, .9, .6), (70, 24, .8, .6), (120, 160, .8, .6), (44, 84, .7, .5), (146, 60, .7, .5)])
    body = (f'<rect width="180" height="180" fill="#39508f"/>'
            f'{b}<g filter="url(#w)"><rect x="-120" y="-120" width="420" height="420" fill="#39508f"/>{b}</g>'
            '<rect width="180" height="180" filter="url(#v)" opacity=".55"/>'
            '<rect width="180" height="180" fill="url(#vg)"/>' + stars +
            f'<path transform="translate(5 0) scale(5.3125) translate(.6 .9) {SKEW32}" fill="{SKY}" d="{STEM32}{ARM32}"/>')
    out["apple-icon.svg"] = svg(180, body, defs)
    return out


def render(folder):
    for src, n, dst in [("icon-16.svg", 16, "r16.png"), ("icon.svg", 32, "r32.png"), ("apple-icon.svg", 180, "r180.png")]:
        subprocess.run(["rsvg-convert", "-w", str(n), "-h", str(n), os.path.join(folder, src), "-o", os.path.join(folder, dst)], check=True)


def sheet(folder):
    r16 = Image.open(os.path.join(folder, "r16.png")).convert("RGBA")
    r32 = Image.open(os.path.join(folder, "r32.png")).convert("RGBA")
    r180 = Image.open(os.path.join(folder, "r180.png")).convert("RGBA")
    W, H = 520, 232
    im = Image.new("RGB", (W + 220, H * 2), "#55565c")
    for i, bg in enumerate(["#dee1e6", "#202124"]):
        strip = Image.new("RGBA", (W, H), bg)
        big16 = r16.resize((192, 192), Image.NEAREST)
        big32 = r32.resize((192, 192), Image.NEAREST)
        strip.alpha_composite(big16, (20, 20))
        strip.alpha_composite(big32, (232, 20))
        strip.alpha_composite(r16, (444, 30))
        strip.alpha_composite(r32, (444, 70))
        # a little fake tab row: true size 16 beside neighbours' grey dots
        d = ImageDraw.Draw(strip)
        for k in range(3):
            d.ellipse((444 + k * 0, 0, 444, 0), fill=bg)
        strip.alpha_composite(r16, (480, 30))
        im.paste(strip.convert("RGB"), (0, i * H))
    im.paste(r180.convert("RGB"), (W + 20, 20))
    # rounded preview of the 180 as iOS would mask it, at 90 px
    small = r180.resize((90, 90), Image.LANCZOS)
    m = Image.new("L", (90, 90), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, 89, 89), 20, fill=255)
    im.paste(small.convert("RGB"), (W + 20, 220), m)
    im.save(os.path.join(folder, "sheet.png"))


if __name__ == "__main__":
    for slug, fn in [("gas-r", gas_r), ("star-r", star_r), ("cutout-r", cutout_r)]:
        folder = os.path.join(HERE, slug)
        os.makedirs(folder, exist_ok=True)
        for name, text in fn().items():
            with open(os.path.join(folder, name), "w") as f:
                f.write(text)
        render(folder)
        sheet(folder)
        print(slug, {n: os.path.getsize(os.path.join(folder, n)) for n in ("icon.svg", "icon-16.svg", "apple-icon.svg")})
