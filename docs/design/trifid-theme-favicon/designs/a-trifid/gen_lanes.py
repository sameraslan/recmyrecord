import os, random, math, sys
D=os.path.dirname(os.path.abspath(__file__))
def f(v,n=1):
    s=("%."+str(n)+"f")%v
    return s.rstrip("0").rstrip(".") if "." in s else s
SKY="#07060a"
def P(pts,k=1,ox=0,oy=0): return [(x*k+ox,y*k+oy) for x,y in pts]
def smooth(pts,closed=True):
    m=len(pts); d=f"M{f(pts[0][0])} {f(pts[0][1])}"
    rng=range(m) if closed else range(m-1)
    for i in rng:
        g=lambda j: pts[j%m] if closed else pts[max(0,min(m-1,j))]
        p0,p1,p2,p3=g(i-1),g(i),g(i+1),g(i+2)
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+=f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d+("Z" if closed else "")
def poly(pts): return "M"+"L".join(f(x)+" "+f(y) for x,y in pts)+"Z"
# cloud outline (the map's), 32-unit space
SIL=[(13,2.2),(18.5,2.6),(22.5,5),(26.5,5.2),(29,8.5),(28.2,12.5),(29.6,17),(27.5,22),(23,24.5),(20.5,28),(15.5,30.2),(10.5,28.6),(8.2,24.5),(4.2,21.5),(2.6,16),(4.4,10.5),(7.6,5.4)]
# main dust lane: enters at the top right of centre, S-bends down and out to the lower right
MAIN=[(22.5,0.5),(20.6,5.5),(21.2,9.5),(18.4,13.2),(18.8,16.6),(22,19.4),(24.6,22.6),(29.5,26)]
# branch: leaves the main lane and wanders out to the lower left
BR=[(18.5,14.6),(14.6,15.4),(12,18.4),(8.6,19.2),(6,22),(1,24)]
SPUR=[(12.4,17.8),(11,14.4),(12.2,11.6),(11.4,9.2)]
GOLDR=MAIN+[(40,26),(40,-6),(22.5,-6)]
TEALR=BR[::-1]+MAIN[4:]+[(34,40),(-6,40),(-6,24)]
C={"r":("#f9d2bc","#dd8768","#b0604c"),"g":("#fff6dc","#e8c98f","#b9955c"),"t":("#d6f2ec","#70c0c3","#3a8996"),"b":("#8ea3cf","#5873ad","#3d5488")}
def defs(k,ox,oy,feather,marble):
    j=(18.6*k+ox,15*k+oy); s=''
    for i,(a,m,d) in C.items():
        s+=f'<radialGradient id="{i}" gradientUnits="userSpaceOnUse" cx="{f(j[0])}" cy="{f(j[1])}" r="{f(17*k)}"><stop offset=".04" stop-color="{a}"/><stop offset=".5" stop-color="{m}"/><stop offset="1" stop-color="{d}"/></radialGradient>'
    sil=smooth(P(SIL,k,ox,oy))
    if feather:
        s+=f'<filter id="e" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="{f(feather,2)}"/></filter><mask id="c"><path d="{sil}" fill="#fff" filter="url(#e)"/></mask>'
        s+=f'<filter id="m" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{f(marble,2)}"/></filter>'
    else: s+=f'<clipPath id="c"><path d="{sil}"/></clipPath>'
    return s
def gas(k,ox,oy,S,marble=True):
    s=f'<rect width="{S}" height="{S}" fill="url(#r)"/><path fill="url(#g)" d="{poly(P(GOLDR,k,ox,oy))}"/><path fill="url(#t)" d="{poly(P(TEALR,k,ox,oy))}"/>'
    if marble:
        e=lambda cx,cy,rx,ry,rot,fill,op: f'<ellipse cx="{f(cx*k+ox)}" cy="{f(cy*k+oy)}" rx="{f(rx*k)}" ry="{f(ry*k)}" transform="rotate({rot} {f(cx*k+ox)} {f(cy*k+oy)})" fill="{fill}" opacity="{op}"/>'
        s+='<g filter="url(#m)">'+e(5.5,14.5,3.4,6,12,"url(#b)",.95)+e(8,23.5,4,2.6,30,"url(#b)",.85)+e(26.5,8,2.8,3.4,0,"#8f9fd6",.8)+e(13.5,8.5,4.6,1.5,-28,"#f6d9b8",.55)+e(24.5,15.5,1.6,4.2,18,"#fff4d6",.6)+e(15.5,24.5,3.6,1.5,-22,"#c9f0ea",.6)+e(15,12.5,1.3,3.2,30,"#e8c98f",.5)+'</g>'
    return s
def lanes(k,ox,oy,w,spur=True):
    a=smooth(P(MAIN,k,ox,oy),False); b=smooth(P(BR,k,ox,oy),False); c=smooth(P(SPUR,k,ox,oy),False)
    mid=smooth(P(MAIN[2:6],k,ox,oy),False)
    return (f'<g fill="none" stroke="{SKY}" stroke-linecap="round"><path d="{a}" stroke-width="{f(w*k,2)}"/><path d="{mid}{smooth(P(BR[:3],k,ox,oy),False)}" stroke-width="{f(w*1.7*k,2)}"/>'
            f'<path d="{b}" stroke-width="{f(w*.8*k,2)}"/>'+(f'<path d="{c}" stroke-width="{f(w*.55*k,2)}" opacity=".8"/>' if spur else '')+'</g>')
def icon32(tile):
    k=0.9 if tile else 1.0; ox=1.4 if tile else -0.1; oy=1.4 if tile else -0.2
    o=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs>{defs(k,ox,oy,0.55,1.1)}</defs>\n'
    if tile: o+=f'<rect width="32" height="32" rx="7" fill="{SKY}"/>\n'
    o+=f'<g mask="url(#c)">{gas(k,ox,oy,32)}{lanes(k,ox,oy,0.85,False)}</g></svg>'
    return o
# 16 px: lane drawn as whole pixels. Main lane and branch as (x,y) pixel cells.
LM=[(11,0),(11,1),(11,2),(10,3),(10,4),(10,5),(9,6),(9,7),(10,8),(11,9),(12,9),(13,10),(14,11),(15,11)]
LB=[(8,8),(7,8),(6,8),(5,9),(4,10),(3,10),(2,10),(1,11),(0,11)]
def icon16(tile):
    k=0.5; ox=-0.25; oy=-0.1
    cen=lambda q:[(x+.5,y+.5) for x,y in q]
    gold=cen(LM)+[(20,13.5),(20,-4),(10.5,-4)]
    teal=cen(LB)[::-1]+cen(LM[7:])+[(20,20),(-4,20),(-4,12.5)]
    j=(9.5,7.5); s=''
    for i,(a,m,d) in C.items():
        s+=f'<radialGradient id="{i}" gradientUnits="userSpaceOnUse" cx="{j[0]}" cy="{j[1]}" r="8.5"><stop offset=".05" stop-color="{a}"/><stop offset=".55" stop-color="{m}"/><stop offset="1" stop-color="{d}"/></radialGradient>'
    sil=smooth(P(SIL,k,ox,oy))
    o=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><defs>{s}<clipPath id="c"><path d="{sil}"/></clipPath></defs>\n'
    if tile: o+=f'<rect width="16" height="16" rx="3.5" fill="{SKY}"/>\n'
    px=''.join(f'M{x} {y}h1v1h-1z' for x,y in LM+LB)
    o+=f'<g clip-path="url(#c)"><rect width="16" height="16" fill="url(#r)"/><path fill="url(#g)" d="{poly(gold)}"/><path fill="url(#t)" d="{poly(teal)}"/><ellipse cx="2.6" cy="7.2" rx="1.9" ry="2.7" fill="url(#b)"/><path fill="{SKY}" d="{px}"/></g></svg>'
    return o
def apple():
    k=4.3;ox=21;oy=20;S=180
    random.seed(4); stars=''
    while stars.count('<')<50:
        x=random.uniform(30,150); y=random.uniform(28,150)
        if (x-90)**2+(y-90)**2>55**2: continue
        stars+=f'<circle cx="{f(x)}" cy="{f(y)}" r="{random.choice([.6,.7,.9,1.1,1.5])}" opacity="{random.choice([.5,.7,.85,1])}"/>'
    g=gas(k,ox,oy,S)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>{defs(k,ox,oy,3.2,5)}'
      '<filter id="w" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".019" numOctaves="4" seed="9"/><feDisplacementMap in="SourceGraphic" scale="30" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".9"/></filter>'
      '<filter id="h" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter></defs>\n'
      f'<rect width="{S}" height="{S}" fill="#060609"/>\n<g filter="url(#h)" opacity=".5"><g mask="url(#c)">{g}</g></g>\n'
      f'<g filter="url(#w)"><g mask="url(#c)">{g}{lanes(k,ox,oy,0.8)}</g></g>\n<g fill="#fffaf4">{stars}</g></svg>')
tile = (sys.argv[1]=="tile") if len(sys.argv)>1 else True
out=os.path.join(D,sys.argv[2] if len(sys.argv)>2 else "nebula-lanes")
os.makedirs(out,exist_ok=True)
open(out+"/icon.svg","w").write(icon32(tile)); open(out+"/icon-16.svg","w").write(icon16(tile)); open(out+"/apple-icon.svg","w").write(apple())
