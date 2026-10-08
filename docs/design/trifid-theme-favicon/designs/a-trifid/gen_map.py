import os, random, math
D=os.path.dirname(os.path.abspath(__file__))
def f(v,n=1):
    s=("%."+str(n)+"f")%v
    return s.rstrip("0").rstrip(".") if "." in s else s
def cr(pts,k=1,ox=0,oy=0,nd=1):
    pts=[(x*k+ox,y*k+oy) for x,y in pts]
    m=len(pts); d=f"M{f(pts[0][0],nd)} {f(pts[0][1],nd)}"
    for i in range(m):
        p0,p1,p2,p3=pts[(i-1)%m],pts[i],pts[(i+1)%m],pts[(i+2)%m]
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+=f"C{f(c1[0],nd)} {f(c1[1],nd)} {f(c2[0],nd)} {f(c2[1],nd)} {f(p2[0],nd)} {f(p2[1],nd)}"
    return d+"Z"
# the map's outline in 32-unit space: broad lumpy top, shoulder on the right, tail to the lower left
SIL=[(13,2.2),(18.5,2.6),(22.5,5),(26.5,5.2),(29,8.5),(28.2,12.5),(29.6,17),(27.5,22),(23,24.5),(20.5,28),(15.5,30.2),(10.5,28.6),(8.2,24.5),(4.2,21.5),(2.6,16),(4.4,10.5),(7.6,5.4)]
SIL16=[(12,1.6),(19,2.2),(24,4.6),(29,7.6),(29.2,13.5),(30.4,18.5),(27,22.6),(22,23.6),(19.6,28.6),(14.4,30.8),(9.6,28.6),(8.2,24),(4,21.5),(1.8,16),(3.6,9.6),(6.8,4.6)]
BLUE=[(-4,5),(6,7.5),(10.5,11),(11.5,15),(9.8,18.5),(11.5,22),(9.5,26),(6,34),(-4,34)]
GOLD=[(36,3),(26,7),(21,9.5),(17.2,13),(16.6,17),(19,20),(17.5,23),(21,26.5),(36,30)]
TEAL=[(2,36),(7.5,27),(10,23),(13.4,20.4),(17,20.2),(19.6,22.4),(23.5,22.6),(27,25),(30,36)]
PERI=[(23.5,3),(27.5,3.5),(31,7.5),(29.5,11.5),(25.6,11.2),(22.6,8.2)]
C={"r":("#ffa07a","#e8603c","#a83820"),"b":("#8fb0ee","#426ebe","#27457f"),"g":("#fff4d6","#f4be78","#c08440"),"t":("#d6f8f4","#5fcfd4","#267f92"),"p":("#c8d2ff","#788cdc","#5568b8")}
def defs(k,ox,oy,sil,nd):
    s=''
    for i,(a,m,d) in C.items():
        s+=f'<radialGradient id="{i}" gradientUnits="userSpaceOnUse" cx="{f(16.5*k+ox)}" cy="{f(16.5*k+oy)}" r="{f(15.5*k)}"><stop offset=".05" stop-color="{a}"/><stop offset=".5" stop-color="{m}"/><stop offset="1" stop-color="{d}"/></radialGradient>'
    s+=f'<clipPath id="c"><path d="{cr(sil,k,ox,oy,nd)}"/></clipPath>'
    return s
def gas(k,ox,oy,nd,peri=True):
    s=f'<rect width="{f(32*k+2*ox)}" height="{f(32*k+2*oy)}" fill="url(#r)"/>'
    s+=f'<path fill="url(#b)" d="{cr(BLUE,k,ox,oy,nd)}"/><path fill="url(#g)" d="{cr(GOLD,k,ox,oy,nd)}"/>'
    if peri: s+=f'<path fill="url(#p)" d="{cr(PERI,k,ox,oy,nd)}"/>'
    s+=f'<path fill="url(#t)" d="{cr(TEAL,k,ox,oy,nd)}"/>'
    return s
def icon(S,k,rim,sil,peri,extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>{defs(k,0,0,sil,1)}</defs>\n'
      f'<path d="{cr(sil,k)}" fill="#07060a" stroke="#07060a" stroke-width="{rim*2}" stroke-linejoin="round"/>\n'
      f'<g clip-path="url(#c)">{gas(k,0,0,1,peri)}{extra}</g></svg>')
out=os.path.join(D,"map-blobs")
wisp='<path d="M13.5 13.5q2 1.6 3.4 3.2 1.2-2 3-2.4-1.200 2.200-1.500 4.400 1.800 1.200 2.400 3-2.400-1.200-4.200-1-1.600-3.600-3.100-7.200z" fill="#07060a" opacity=".8"/>'.replace("00","")
open(out+"/icon.svg","w").write(icon(32,1.0,1.2,SIL,True,''))
open(out+"/icon-16.svg","w").write(icon(16,0.5,0.8,SIL16,False))
def apple():
    k=4.4;ox=19.6;oy=18.3
    random.seed(4); stars=''
    while stars.count('<')<55:
        x=random.uniform(34,146); y=random.uniform(30,146)
        if (x-92)**2+(y-91)**2>56**2: continue
        stars+=f'<circle cx="{f(x)}" cy="{f(y)}" r="{random.choice([.6,.7,.9,1.1,1.5])}" opacity="{random.choice([.5,.7,.85,1])}"/>'
    g=(f'<rect width="180" height="180" fill="url(#r)"/><g filter="url(#e)"><path fill="url(#b)" d="{cr(BLUE,k,ox,oy,0)}"/><path fill="url(#g)" d="{cr(GOLD,k,ox,oy,0)}"/>'
       f'<path fill="url(#p)" d="{cr(PERI,k,ox,oy,0)}"/><path fill="url(#t)" d="{cr(TEAL,k,ox,oy,0)}"/></g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><defs>{defs(k,ox,oy,SIL,0)}'
      '<filter id="w" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="4" seed="9"/><feDisplacementMap in="SourceGraphic" scale="26" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1"/></filter>'
      '<filter id="h" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>'
      '<filter id="e" filterUnits="userSpaceOnUse" x="0" y="0" width="180" height="180"><feGaussianBlur stdDeviation="3.5"/></filter></defs>\n'
      f'<rect width="180" height="180" fill="#060609"/>\n<g filter="url(#h)" opacity=".5"><g clip-path="url(#c)">{g}</g></g>\n'
      f'<g filter="url(#w)"><g clip-path="url(#c)">{g}</g></g>\n<g fill="#fffaf4">{stars}</g></svg>')
open(out+"/apple-icon.svg","w").write(apple())
