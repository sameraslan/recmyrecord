import math, os, subprocess
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__))
SKY = '#07060a'
RED = ('#f9b08e', '#e8603c', '#a3381f')
GOLD = ('#fff0cf', '#f4be78', '#b8843c')
TEAL = ('#d6f7f6', '#58cdd6', '#2f5fae')

def grads(cx, cy, R, pre=''):
    out = ''
    for n, (a, b, c) in (('r', RED), ('g', GOLD), ('t', TEAL)):
        out += (f'<radialGradient id="{pre}{n}" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="{R}">'
                f'<stop offset=".15" stop-color="{a}"/><stop offset=".6" stop-color="{b}"/><stop offset="1" stop-color="{c}"/></radialGradient>')
    return out

def spiral(cx, cy, R, a, twist, n=9, r0=0.0):
    pts = []
    for i in range(n + 1):
        t = r0 + (1 - r0) * i / n
        ang = math.radians(a + twist * (1 - t))
        pts.append((cx + R * t * math.cos(ang), cy + R * t * math.sin(ang)))
    return pts

def fmt(p): return f'{p[0]:.1f} {p[1]:.1f}'

def disc(cx, cy, R, angles, twist, lane, n=9):
    """three swirled lobes + dark lanes. angles: start angles of the 3 boundaries (deg, y down)"""
    s = ''
    cols = ['r', 'g', 't']
    bs = [spiral(cx, cy, R, a, twist, n) for a in angles]
    for i in range(3):
        b0, b1 = bs[i], bs[(i + 1) % 3]
        d = 'M' + 'L'.join(fmt(p) for p in b0)
        d += f'A{R} {R} 0 0 1 {fmt(b1[-1])}'
        d += 'L' + 'L'.join(fmt(p) for p in reversed(b1[:-1])) + 'Z'
        s += f'<path d="{d}" fill="url(#{cols[i]})"/>'
    lanes = ''.join('M' + 'L'.join(fmt(p) for p in b) for b in bs)
    s += f'<path d="{lanes}" fill="none" stroke="{SKY}" stroke-width="{lane}" stroke-linecap="round" stroke-linejoin="round"/>'
    return s

def svg(vb, body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}">{body}</svg>\n'

def write(slug, name, text):
    os.makedirs(f'{D}/{slug}', exist_ok=True)
    open(f'{D}/{slug}/{name}', 'w').write(text)

# ---------- 1. trifid-pressing ----------
A = (-150, -35, 75)   # red top (largest), gold right, teal bottom-left
def c1():
    b = f'<defs>{grads(16,16,14.4)}</defs><circle cx="16" cy="16" r="15.6" fill="{SKY}"/>'
    b += disc(16, 16, 14.6, A, 95, 1.25, n=12)
    b += f'<g fill="none" stroke="{SKY}" stroke-width=".55" opacity=".3"><circle cx="16" cy="16" r="8"/><circle cx="16" cy="16" r="11.2"/></g>'
    b += f'<circle cx="16" cy="16" r="3.4" fill="{SKY}"/><circle cx="16" cy="16" r="1.8" fill="#fffaf4"/>'
    write('trifid-pressing', 'icon.svg', svg(32, b))
    b = f'<defs>{grads(8,8,7.2)}</defs><circle cx="8" cy="8" r="8" fill="{SKY}"/>'
    b += disc(8, 8, 7.4, A, 70, 1.0, n=7)
    b += f'<circle cx="8" cy="8" r="2" fill="{SKY}"/><circle cx="8" cy="8" r="1.13" fill="#fffaf4"/>'
    write('trifid-pressing', 'icon-16.svg', svg(16, b))
    R = 60
    b = (f'<defs>{grads(90,90,R)}'
         '<radialGradient id="h"><stop offset=".55" stop-color="#788cdc" stop-opacity=".34"/><stop offset="1" stop-color="#426ebe" stop-opacity="0"/></radialGradient>'
         '<radialGradient id="s"><stop offset="0" stop-color="#fffaf4"/><stop offset=".35" stop-color="#fffaf4"/><stop offset="1" stop-color="#f4be78" stop-opacity="0"/></radialGradient>'
         '<filter id="w" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="22"/><feGaussianBlur stdDeviation="1"/></filter>'
         '<clipPath id="c"><circle cx="90" cy="90" r="60"/></clipPath></defs>'
         f'<rect width="180" height="180" fill="#060609"/><circle cx="90" cy="90" r="88" fill="url(#h)"/>'
         f'<circle cx="90" cy="90" r="63" fill="{SKY}"/><g clip-path="url(#c)"><g filter="url(#w)">')
    b += disc(90, 90, 70, A, 100, 5, n=18) + '</g>'
    b += f'<g fill="none" stroke="{SKY}" stroke-width="1" opacity=".26">' + ''.join(f'<circle cx="90" cy="90" r="{r}"/>' for r in (24, 30, 36, 42, 48, 54)) + '</g></g>'
    b += f'<circle cx="90" cy="90" r="16" fill="{SKY}"/><circle cx="90" cy="90" r="13" fill="url(#s)"/>'
    b += '<g fill="#fffaf4"><circle cx="66" cy="60" r="1.3"/><circle cx="118" cy="78" r="1.1"/><circle cx="80" cy="126" r="1.3"/><circle cx="104" cy="52" r=".9" opacity=".8"/><circle cx="60" cy="100" r=".9" opacity=".8"/><circle cx="112" cy="118" r=".9" opacity=".8"/></g>'
    write('trifid-pressing', 'apple-icon.svg', svg(180, b))

# ---------- 2. ring-tilt ----------
def tilt(cx, cy, rx, ry, rot, edge, grooves, core, glow, lab):
    g = (f'<defs><linearGradient id="d" gradientUnits="userSpaceOnUse" x1="{cx-rx}" y1="{cy}" x2="{cx+rx}" y2="{cy}">'
         '<stop offset="0" stop-color="#e8603c"/><stop offset=".3" stop-color="#f08a52"/><stop offset=".5" stop-color="#f4be78"/><stop offset=".72" stop-color="#58cdd6"/><stop offset="1" stop-color="#426ebe"/></linearGradient>'
         '<radialGradient id="s"><stop offset="0" stop-color="#fffaf4"/><stop offset=".4" stop-color="#fffaf4"/><stop offset=".7" stop-color="#f4be78" stop-opacity=".55"/><stop offset="1" stop-color="#f4be78" stop-opacity="0"/></radialGradient></defs>')
    g += f'<g transform="rotate({rot} {cx} {cy})">'
    g += f'<ellipse cx="{cx}" cy="{cy+edge}" rx="{rx}" ry="{ry}" fill="#24222c"/>'
    g += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#d)"/>'
    for f, w, o in grooves:
        g += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx*f:.2f}" ry="{ry*f:.2f}" fill="none" stroke="{SKY}" stroke-width="{w}" opacity="{o}"/>'
    g += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx*lab:.2f}" ry="{ry*lab:.2f}" fill="{SKY}"/></g>'
    g += f'<circle cx="{cx}" cy="{cy}" r="{glow}" fill="url(#s)"/><circle cx="{cx}" cy="{cy}" r="{core}" fill="#fffaf4"/>'
    return g
def c2():
    write('ring-tilt', 'icon.svg', svg(32, tilt(16, 16, 16.4, 8.6, -26, 1.1, [(.78, .7, .45), (.56, .6, .4)], 2.1, 4.6, .34)))
    write('ring-tilt', 'icon-16.svg', svg(16, tilt(8, 8, 8.4, 4.9, -26, .6, [], 1.2, 2.6, .34)))
    b = ('<rect width="180" height="180" fill="#060609"/>'
         '<defs><radialGradient id="h"><stop offset="0" stop-color="#788cdc" stop-opacity=".3"/><stop offset="1" stop-color="#426ebe" stop-opacity="0"/></radialGradient></defs>'
         '<ellipse cx="90" cy="90" rx="88" ry="60" fill="url(#h)" transform="rotate(-24 90 90)"/>')
    b += tilt(90, 90, 64, 30, -24, 4, [(.9, 1.2, .35), (.8, 1.2, .35), (.7, 1.2, .35), (.6, 1.2, .35), (.5, 1.2, .35), (.42, 1.2, .35)], 8, 22, .3)
    b += '<g fill="#fffaf4"><circle cx="38" cy="44" r="1.4"/><circle cx="146" cy="132" r="1.4"/><circle cx="132" cy="38" r="1"/><circle cx="50" cy="140" r="1"/></g>'
    write('ring-tilt', 'apple-icon.svg', svg(180, b))

# ---------- 3. gas-sleeve ----------
def sleeve(x, y, s, rx, k, filt=False):
    """square sleeve with nebula cover; k scales blur-free gradients"""
    d = (f'<clipPath id="q"><rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{rx}"/></clipPath>'
         '<radialGradient id="a"><stop offset="0" stop-color="#f9a27c"/><stop offset=".45" stop-color="#e8603c"/><stop offset="1" stop-color="#e8603c" stop-opacity="0"/></radialGradient>'
         '<radialGradient id="b"><stop offset="0" stop-color="#fff0cf"/><stop offset=".45" stop-color="#f4be78"/><stop offset="1" stop-color="#f4be78" stop-opacity="0"/></radialGradient>'
         '<radialGradient id="e"><stop offset="0" stop-color="#d6f7f6"/><stop offset=".45" stop-color="#58cdd6"/><stop offset="1" stop-color="#58cdd6" stop-opacity="0"/></radialGradient>')
    fo, fc = ('<g filter="url(#w)">', '</g>') if filt else ('', '')
    g = (f'<g clip-path="url(#q)"><rect x="{x}" y="{y}" width="{s}" height="{s}" fill="#2b458a"/>{fo}'
         f'<circle cx="{x+s*.3:.1f}" cy="{y+s*.24:.1f}" r="{s*.5:.1f}" fill="url(#a)"/>'
         f'<circle cx="{x+s*.3:.1f}" cy="{y+s*.86:.1f}" r="{s*.5:.1f}" fill="url(#e)"/>'
         f'<circle cx="{x+s*.7:.1f}" cy="{y+s*.5:.1f}" r="{s*.4:.1f}" fill="url(#b)"/>{fc}</g>')
    return d, g
def record(cx, cy, R, rings, lab, hole, w):
    g = f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{SKY}"/>'
    for r, c in rings:
        g += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{c}" stroke-width="{w}"/>'
    g += f'<circle cx="{cx}" cy="{cy}" r="{lab}" fill="#f4be78"/><circle cx="{cx}" cy="{cy}" r="{hole}" fill="#fffaf4"/>'
    return g
def c3():
    d, g = sleeve(1, 5.5, 21, 1.6, 1)
    b = f'<defs>{d}</defs>' + record(20, 16, 11.5, [(9.9, '#9fb0ee'), (7.1, '#788cdc'), (4.4, '#426ebe')], 0, 0, 1.4) + g
    b += f'<rect x="1.3" y="5.8" width="20.4" height="20.4" rx="1.3" fill="none" stroke="#fffaf4" stroke-width=".6" opacity=".35"/>'
    write('gas-sleeve', 'icon.svg', svg(32, b))
    d, g = sleeve(0, 2.5, 11, .8, 1)
    b = f'<defs>{d}</defs>' + record(10, 8, 5.9, [(4.5, '#9fb0ee')], 0, 0, 1.3) + g
    write('gas-sleeve', 'icon-16.svg', svg(16, b))
    d, g = sleeve(28, 48, 84, 5, 1, True)
    b = ('<rect width="180" height="180" fill="#060609"/><defs>' + d +
         '<radialGradient id="h"><stop offset=".3" stop-color="#788cdc" stop-opacity=".3"/><stop offset="1" stop-color="#426ebe" stop-opacity="0"/></radialGradient>'
         '<filter id="w" filterUnits="userSpaceOnUse" x="0" y="0" width="180" height="180"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="16"/></filter></defs>'
         '<circle cx="104" cy="90" r="78" fill="url(#h)"/>')
    b += record(104, 90, 48, [(44, '#8fa0e6'), (38.5, '#788cdc'), (33, '#5f7fd0'), (27.5, '#426ebe'), (22, '#35589e')], 0, 0, 2.4)
    b += g
    b += '<rect x="29" y="49" width="82" height="82" rx="4" fill="none" stroke="#fffaf4" stroke-width="1.5" opacity=".3"/>'
    b += '<g fill="#fffaf4"><circle cx="50" cy="66" r="1.3"/><circle cx="88" cy="88" r="1.6"/><circle cx="58" cy="112" r="1.3"/><circle cx="72" cy="78" r=".9"/><circle cx="96" cy="62" r=".9"/></g>'
    write('gas-sleeve', 'apple-icon.svg', svg(180, b))

def sheet(slug):
    p = f'{D}/{slug}'
    for sz, f, o in ((16, 'icon-16.svg', 'r16.png'), (32, 'icon.svg', 'r32.png'), (180, 'apple-icon.svg', 'r180.png')):
        subprocess.run(['rsvg-convert', '-w', str(sz), '-h', str(sz), f'{p}/{f}', '-o', f'{p}/{o}'], check=True)
    r16, r32, r180 = (Image.open(f'{p}/r{s}.png').convert('RGBA') for s in (16, 32, 180))
    W, H = 700, 232
    im = Image.new('RGB', (W + 200, H * 2), '#55555c')
    for i, bg in enumerate(('#dee1e6', '#202124')):
        st = Image.new('RGBA', (W, H), bg)
        x = 16
        for img in (r16, r16.resize((192, 192), Image.NEAREST), r32, r32.resize((192, 192), Image.NEAREST)):
            st.alpha_composite(img, (x, 20)); x += img.width + 24
        # mock tab row: neighbours as dark circles
        dr = ImageDraw.Draw(st)
        for j in range(5):
            if j == 2: st.alpha_composite(r16, (540 + j * 28, 100))
            else: dr.ellipse((540 + j * 28, 100, 555 + j * 28, 115), fill=('#111' if i == 0 else '#888'))
        im.paste(st.convert('RGB'), (0, i * H))
    im.paste(r180.convert('RGB'), (W + 10, 20))
    im.save(f'{p}/sheet.png')

c1(); c2(); c3()
for s in ('trifid-pressing', 'ring-tilt', 'gas-sleeve'):
    sheet(s); print(s, os.path.getsize(f'{D}/{s}/icon.svg'))
