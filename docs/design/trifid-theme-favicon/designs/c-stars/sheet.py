import sys, subprocess, os
from PIL import Image
d = sys.argv[1]
def r(svg, n, out):
    subprocess.run(["rsvg-convert","-w",str(n),"-h",str(n),os.path.join(d,svg),"-o",os.path.join(d,out)],check=True)
r("icon-16.svg",16,"r16.png"); r("icon.svg",32,"r32.png"); r("apple-icon.svg",180,"r180.png")
a=Image.open(os.path.join(d,"r16.png")).convert("RGBA"); b=Image.open(os.path.join(d,"r32.png")).convert("RGBA"); c=Image.open(os.path.join(d,"r180.png")).convert("RGBA")
W=16+192+32+192+180+6*20; H=232
sheet=Image.new("RGB",(W,H*2),"#ffffff")
for i,bg in enumerate(["#dee1e6","#202124"]):
    s=Image.new("RGBA",(W,H),bg); x=20
    for im in [a,a.resize((192,192),Image.NEAREST),b,b.resize((192,192),Image.NEAREST),c]:
        s.alpha_composite(im,(x,20)); x+=im.width+20
    sheet.paste(s.convert("RGB"),(0,i*H))
sheet.save(os.path.join(d,"sheet.png"))
