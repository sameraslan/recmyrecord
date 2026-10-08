import sys, subprocess, os
from PIL import Image
d = sys.argv[1]
def r(svg, n, out):
    subprocess.run(["rsvg-convert","-w",str(n),"-h",str(n),os.path.join(d,svg),"-o",os.path.join(d,out)],check=True)
    return Image.open(os.path.join(d,out)).convert("RGBA")
i16=r("icon-16.svg",16,"r16.png"); i32=r("icon.svg",32,"r32.png"); i180=r("apple-icon.svg",180,"r180.png")
m16=r("icon.svg",16,"r16-from-master.png")
W,H=860,460
sh=Image.new("RGBA",(W,H),"#ffffff")
for k,bg in enumerate(["#dee1e6","#202124"]):
    y=k*230
    strip=Image.new("RGBA",(660,230),bg); sh.paste(strip,(0,y))
    x=14
    for im in (i16,i32):
        sh.alpha_composite(im,(x,y+20)); x+=im.width+14
    sh.alpha_composite(i16,(x,y+20)); x+=30  # second copy spaced like a tab row
    b16=i16.resize((192,192),Image.NEAREST); b32=i32.resize((192,192),Image.NEAREST)
    sh.alpha_composite(b16,(120,y+19)); sh.alpha_composite(b32,(330,y+19))
    sh.alpha_composite(i32.resize((96,96),Image.LANCZOS),(540,y+19))
    sh.alpha_composite(i16.resize((48,48),Image.NEAREST),(540,y+130))
sh.paste(Image.new("RGBA",(200,460),"#101014"),(660,0))
sh.alpha_composite(i180,(670,20))
# iOS-style rounded preview
mask=Image.new("L",(180,180),0)
from PIL import ImageDraw
ImageDraw.Draw(mask).rounded_rectangle((0,0,179,179),radius=40,fill=255)
ro=Image.new("RGBA",(180,180),(0,0,0,0)); ro.paste(i180,(0,0),mask)
sh.alpha_composite(ro,(670,250))
sh.convert("RGB").save(os.path.join(d,"sheet.png"))
