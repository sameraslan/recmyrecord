import math, os, subprocess, sys
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__))
SKY="#07060a"; EDGE="#24222c"
RED="#e8603c"; GOLD="#f4be78"; TEAL="#96c8d6"; VTEAL="#6fd2dc"; BLUE="#426ebe"; PERI="#788cdc"; WHITE="#fffaf4"
def w(slug,name,s):
    open(os.path.join(D,slug,name),"w").write(s.strip()+"\n")

# ---------- 1. comet-tail ----------
def comet_defs(k=1.0, cx=21, cy=11, tip=(4,28.5), core=0.30):
    return f'''<linearGradient id="t" gradientUnits="userSpaceOnUse" x1="{tip[0]}" y1="{tip[1]}" x2="{cx}" y2="{cy}">
<stop offset="0" stop-color="{BLUE}"/><stop offset=".3" stop-color="{PERI}"/><stop offset=".62" stop-color="{VTEAL}"/><stop offset="1" stop-color="{TEAL}"/></linearGradient>
<radialGradient id="h" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="{8.6*k}">
<stop offset="0" stop-color="{WHITE}"/><stop offset="{core}" stop-color="{WHITE}"/><stop offset="{core+.16}" stop-color="{GOLD}"/><stop offset=".74" stop-color="{RED}"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></radialGradient>'''
P32="M4 28.5C6 20 9.5 11 14.67 6.64A7.7 7.7 0 1 1 24 18.1C17.5 22.5 10.5 25.5 4 28.5Z"
w("comet-tail","icon.svg",f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs>{comet_defs()}</defs>
<path d="{P32}" fill="{SKY}" stroke="{SKY}" stroke-width="2.8" stroke-linejoin="round"/>
<path d="{P32}" fill="url(#t)"/>
<path d="M6.5 26.6C10 20.5 13 16 17 13.5" fill="none" stroke="{SKY}" stroke-opacity=".45" stroke-width="1.1" stroke-linecap="round"/>
<path d="{P32}" fill="url(#h)"/>
</svg>''')
P16="M1.6 14.6C2.6 10.4 4.4 5.9 7.2 3.4A4.1 4.1 0 1 1 12.2 9.2C8.9 11.4 5 13 1.6 14.6Z"
w("comet-tail","icon-16.svg",f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
<defs><linearGradient id="t" gradientUnits="userSpaceOnUse" x1="1.6" y1="14.6" x2="9" y2="7">
<stop offset="0" stop-color="{BLUE}"/><stop offset=".45" stop-color="{PERI}"/><stop offset="1" stop-color="{VTEAL}"/></linearGradient>
<radialGradient id="h" gradientUnits="userSpaceOnUse" cx="10.5" cy="5.5" r="4.6">
<stop offset="0" stop-color="{WHITE}"/><stop offset=".36" stop-color="{WHITE}"/><stop offset=".5" stop-color="{GOLD}"/><stop offset=".8" stop-color="{RED}"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></radialGradient></defs>
<path d="{P16}" fill="{SKY}" stroke="{SKY}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="{P16}" fill="url(#t)"/><path d="{P16}" fill="url(#h)"/>
</svg>''')
w("comet-tail","apple-icon.svg",f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
<defs>{comet_defs()}
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
<filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".5"/></filter>
<radialGradient id="bg" cx=".62" cy=".36" r=".8"><stop offset="0" stop-color="#15121c"/><stop offset="1" stop-color="#060609"/></radialGradient></defs>
<rect width="180" height="180" fill="url(#bg)"/>
<g transform="translate(18 20) scale(4.4)">
<g filter="url(#b)" opacity=".6"><path d="{P32}" fill="url(#t)"/><circle cx="21" cy="11" r="9" fill="{RED}"/></g>
<g filter="url(#s)"><path d="{P32}" fill="url(#t)"/>
<path d="M6.5 26.6C10 20.5 13 16 17 13.5" fill="none" stroke="{SKY}" stroke-opacity=".4" stroke-width="1" stroke-linecap="round"/>
<path d="M8 26.4C13 23 18 20.6 23 17.6" fill="none" stroke="{GOLD}" stroke-opacity=".75" stroke-width=".9" stroke-linecap="round"/>
<path d="M5.6 26.4C7.6 20 10.6 13.4 14.6 8.6" fill="none" stroke="{RED}" stroke-opacity=".6" stroke-width=".8" stroke-linecap="round"/>
<path d="{P32}" fill="url(#h)"/></g>
<circle cx="21" cy="11" r="2.4" fill="{WHITE}"/>
</g>
<g fill="{WHITE}"><circle cx="46" cy="52" r="1.6" opacity=".8"/><circle cx="132" cy="134" r="1.3" opacity=".7"/><circle cx="62" cy="34" r=".9" opacity=".6"/><circle cx="146" cy="112" r=".9" opacity=".5"/><circle cx="108" cy="150" r="1" opacity=".5"/></g>
</svg>''')

# ---------- 2. rec-giant ----------
def rec(vb, r_t, c, R, hot, arc, sw, star, extra=""):
    cx,cy=c
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}">
<defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="{hot[0]}" cy="{hot[1]}" r="{R*1.45}">
<stop offset="0" stop-color="{WHITE}"/><stop offset=".2" stop-color="{GOLD}"/><stop offset=".6" stop-color="{RED}"/><stop offset="1" stop-color="#b8401f"/></radialGradient>
<radialGradient id="c" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="{R*1.75}">
<stop offset=".5" stop-color="{RED}" stop-opacity=".7"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></radialGradient>
<linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{PERI}"/><stop offset=".5" stop-color="{VTEAL}"/><stop offset="1" stop-color="{BLUE}"/></linearGradient>{extra}</defs>
{r_t}
<circle cx="{cx}" cy="{cy}" r="{R*1.75}" fill="url(#c)"/>
<path d="{arc}" fill="none" stroke="url(#a)" stroke-width="{sw}" stroke-linecap="round"/>
<circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#g)"/>
{star}
</svg>'''
w("rec-giant","icon.svg",rec(32,f'<rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="{SKY}" stroke="{EDGE}"/>',
  (17,15),7.6,(14.6,12.4),"M5.2 13.5A12.2 12.2 0 0 0 19.5 27.2",2.4,f'<circle cx="26" cy="6.2" r="1.5" fill="{WHITE}"/>'))
w("rec-giant","icon-16.svg",rec(16,f'<rect width="16" height="16" rx="3.6" fill="{SKY}"/>',
  (8.5,7.5),4,(7.4,6.3),"M2.5 6.5A6.3 6.3 0 0 0 10 13.6",1.5,f'<rect x="12" y="2" width="2" height="2" rx=".5" fill="{WHITE}"/>'))
w("rec-giant","apple-icon.svg",rec(180,f'<rect width="180" height="180" fill="#060609"/><circle cx="94" cy="86" r="86" fill="url(#c)" opacity=".5"/>',
  (94,86),36,(82,73),"M36 80A59 59 0 0 0 108 143",9,
  f'<g fill="{WHITE}"><circle cx="139" cy="42" r="5"/><circle cx="46" cy="38" r="1.6" opacity=".7"/><circle cx="148" cy="130" r="1.8" opacity=".6"/><circle cx="60" cy="150" r="1.2" opacity=".5"/></g>'))

# ---------- 3. pinwheel-pin ----------
def blades(cx,cy,r,cols,rot=-90,curl=42,cr=0.5):
    n=len(cols); out=[]
    def pt(a,rad): return (cx+rad*math.cos(math.radians(a)), cy+rad*math.sin(math.radians(a)))
    for i,col in enumerate(cols):
        a0=rot+i*360/n; a1=rot+(i+1)*360/n
        p0=pt(a0,r); p1=pt(a1,r); c0=pt(a0-curl,r*cr); c1=pt(a1-curl,r*cr)
        out.append(f'<path d="M{cx} {cy}Q{c0[0]:.1f} {c0[1]:.1f} {p0[0]:.1f} {p0[1]:.1f}A{r} {r} 0 0 1 {p1[0]:.1f} {p1[1]:.1f}Q{c1[0]:.1f} {c1[1]:.1f} {cx} {cy}Z" fill="{col}"/>')
    return "".join(out)
PIN32="M16 30.4C12.6 25 6 20.4 6 12.4A10 10 0 1 1 26 12.4C26 20.4 19.4 25 16 30.4Z"
w("pinwheel-pin","icon.svg",f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs><clipPath id="p"><path d="{PIN32}"/></clipPath></defs>
<path d="{PIN32}" fill="{SKY}" stroke="{SKY}" stroke-width="2.2" stroke-linejoin="round"/>
<g clip-path="url(#p)">{blades(16,12.4,24,[RED,GOLD,VTEAL,BLUE,PERI],rot=-108,curl=30,cr=0.3)}</g>
<circle cx="16" cy="12.4" r="3.6" fill="{SKY}"/><circle cx="16" cy="12.4" r="2" fill="{WHITE}"/>
</svg>''')
PIN16="M8 15.4C6.2 12.6 2.6 10.4 2.6 6.3A5.4 5.4 0 1 1 13.4 6.3C13.4 10.4 9.8 12.6 8 15.4Z"
w("pinwheel-pin","icon-16.svg",f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
<defs><clipPath id="p"><path d="{PIN16}"/></clipPath></defs>
<path d="{PIN16}" fill="{SKY}" stroke="{SKY}" stroke-width="1.2" stroke-linejoin="round"/>
<g clip-path="url(#p)">{blades(8,6.3,12,[RED,GOLD,BLUE,VTEAL],rot=-150,curl=30,cr=0.3)}</g>
<circle cx="8" cy="6.3" r="2.1" fill="{SKY}"/><circle cx="8" cy="6.3" r="1.3" fill="{WHITE}"/>
</svg>''')
w("pinwheel-pin","apple-icon.svg",f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
<defs><clipPath id="p"><path d="{PIN32}"/></clipPath>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
<radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#17141f"/><stop offset="1" stop-color="#060609"/></radialGradient></defs>
<rect width="180" height="180" fill="url(#bg)"/>
<g transform="translate(18 17) scale(4.5)">
<g clip-path="url(#p)" filter="url(#b)" opacity=".55">{blades(16,12.4,24,[RED,GOLD,VTEAL,BLUE,PERI],rot=-108,curl=30,cr=0.3)}</g>
<g clip-path="url(#p)">{blades(16,12.4,24,[RED,GOLD,VTEAL,BLUE,PERI],rot=-108,curl=30,cr=0.3)}</g>
<circle cx="16" cy="12.4" r="3.6" fill="{SKY}"/><circle cx="16" cy="12.4" r="2" fill="{WHITE}"/></g>
<g fill="{WHITE}"><circle cx="30" cy="136" r="1.6" opacity=".6"/><circle cx="152" cy="142" r="1.3" opacity=".5"/><circle cx="156" cy="30" r="1.2" opacity=".5"/><circle cx="24" cy="44" r="1" opacity=".4"/></g>
</svg>''')

# ---------- render + sheets ----------
def sheet(slug):
    d=os.path.join(D,slug)
    for n,f,o in ((16,"icon-16.svg","r16.png"),(32,"icon.svg","r32.png"),(180,"apple-icon.svg","r180.png")):
        subprocess.run(["rsvg-convert","-w",str(n),"-h",str(n),os.path.join(d,f),"-o",os.path.join(d,o)],check=True)
    a=Image.open(os.path.join(d,"r16.png")).convert("RGBA"); b=Image.open(os.path.join(d,"r32.png")).convert("RGBA"); c=Image.open(os.path.join(d,"r180.png")).convert("RGBA")
    W=16+192+16+16+16+192+16+32+16+180+16+60; H=224
    S=Image.new("RGBA",(W,H*2),"#ffffff")
    for i,bg in enumerate(("#dee1e6","#202124")):
        st=Image.new("RGBA",(W,H),bg); x=16
        st.alpha_composite(a.resize((192,192),Image.NEAREST),(x,16)); x+=208
        st.alpha_composite(a,(x,16)); st.alpha_composite(a,(x,60)); x+=32
        st.alpha_composite(b.resize((192,192),Image.NEAREST),(x,16)); x+=208
        st.alpha_composite(b,(x,16)); x+=48
        st.alpha_composite(c,(x,16))
        S.alpha_composite(st,(0,i*H))
    S.convert("RGB").save(os.path.join(d,"sheet.png"))
    print(slug, os.path.getsize(os.path.join(d,"icon.svg")))
for s in ("comet-tail","rec-giant","pinwheel-pin"): sheet(s)
