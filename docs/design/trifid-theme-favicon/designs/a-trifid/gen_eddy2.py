import math, os, random
D=os.path.dirname(os.path.abspath(__file__))
def f(v,n=1):
    s=("%."+str(n)+"f")%v
    return s.rstrip("0").rstrip(".") if "." in s else s
SKY="#07060a"
# dusty tones sampled towards the map: pale teal, cream gold, salmon
COL={"t":("#d9f3ee","#74c3c6","#3f8f9d"),"g":("#fdf3d8","#e9c98f","#c29c62"),"r":("#fbd3bb","#e08a6a","#c46d55")}
def arm_pts(th0,sweep,r0,g,wmax,n,peak=0.42,head=0.5):
    out=[];inn=[]
    for i in range(n+1):
        t=i/n; th=math.radians(th0+sweep*t); r=r0+g*sweep*t
        w=wmax*(head+(1-head)*math.sin(math.pi/2*t/peak)) if t<peak else wmax*math.cos(math.pi/2*(t-peak)/(1-peak))**0.8
        out.append(((r+w)*math.sin(th),-(r+w)*math.cos(th))); inn.append(((r-w)*math.sin(th),-(r-w)*math.cos(th)))
    return out+inn[::-1]
def smooth(pts,nd=1):
    m=len(pts); d=f"M{f(pts[0][0],nd)} {f(pts[0][1],nd)}"
    for i in range(m):
        p0,p1,p2,p3=pts[(i-1)%m],pts[i],pts[(i+1)%m],pts[(i+2)%m]
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+=f"C{f(c1[0],nd)} {f(c1[1],nd)} {f(c2[0],nd)} {f(c2[1],nd)} {f(p2[0],nd)} {f(p2[1],nd)}"
    return d+"Z"
def layout(spec,n,S,T,nd=1,shift=(0,0)):
    """Fit the swirl's bounding box into a T x T box centred in an S x S icon. Returns paths, core point, scale."""
    arms=[(c,arm_pts(*a,n)) for (c,*a) in spec]
    xs=[p[0] for _,ps in arms for p in ps]; ys=[p[1] for _,ps in arms for p in ps]
    k=T/max(max(xs)-min(xs),max(ys)-min(ys))
    ox=S/2-k*(max(xs)+min(xs))/2+shift[0]; oy=S/2-k*(max(ys)+min(ys))/2+shift[1]
    return [(c,smooth([(x*k+ox,y*k+oy) for x,y in ps],nd)) for c,ps in arms],(ox,oy),k
def grads(c,R):
    s=''
    for k,(a,b,d) in COL.items():
        s+=f'<radialGradient id="{k}" gradientUnits="userSpaceOnUse" cx="{f(c[0])}" cy="{f(c[1])}" r="{f(R)}"><stop offset=".1" stop-color="{a}"/><stop offset=".55" stop-color="{b}"/><stop offset="1" stop-color="{d}"/></radialGradient>'
    return s
# (colour, start angle, sweep, r0, growth per degree, half width): unequal sweeps make the outline uneven
SPEC32=[("t",150,205,2.4,0.052,2.25),("g",270,172,2.4,0.052,2.2),("r",30,150,2.4,0.052,2.15)]
SPEC16=[("t",150,195,2.5,0.052,2.3),("g",270,165,2.5,0.052,2.3),("r",30,145,2.5,0.052,2.3)]
def icon(S,spec,n,T,tile,rx,rim,core,soft,shift=(0,0)):
    arms,c,k=layout(spec,n,S,T,shift=shift)
    paths=''.join(f'<path fill="url(#{col})" d="{d}"/>' for col,d in arms)
    alld=''.join(d for _,d in arms)
    o=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>{grads(c,15.5*k)}'
    if soft: o+=f'<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="{soft}"/></filter><filter id="h" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="{soft*4}"/></filter>'
    o+='</defs>\n'
    if tile: o+=f'<rect width="{S}" height="{S}" rx="{rx}" fill="{SKY}"/>\n'
    else: o+=f'<path d="{alld}" fill="{SKY}" stroke="{SKY}" stroke-width="{rim*2}" stroke-linejoin="round"/>\n'
    if soft:
        if tile: o+=f'<g filter="url(#h)" opacity=".5">{paths}</g>\n'
        o+=f'<g filter="url(#s)">{paths}</g>\n'
    else: o+=paths+'\n'
    if core: o+=f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="{core}" fill="#fffaf4"/>'
    return o+'</svg>'
def apple():
    S=180; arms,c,k=layout(SPEC32,14,S,122,shift=(0,1))
    body=''.join(f'<path fill="url(#{col})" d="{d}"/>' for col,d in arms)
    random.seed(8); stars=''
    for n in range(42):
        a=random.uniform(0,6.283); r=random.uniform(9,72)
        stars+=f'<circle cx="{f(c[0]+r*math.cos(a))}" cy="{f(c[1]+r*math.sin(a))}" r="{random.choice([.6,.7,.9,1.1,1.4])}" opacity="{random.choice([.5,.7,.85,1])}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>{grads(c,15.5*k)}'
    '<filter id="w" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="4" seed="3"/><feDisplacementMap in="SourceGraphic" scale="19" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.3"/></filter>'
    '<filter id="h" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>'
    '<radialGradient id="sg"><stop offset="0" stop-color="#fffaf4"/><stop offset=".3" stop-color="#fffaf4" stop-opacity=".45"/><stop offset="1" stop-color="#fffaf4" stop-opacity="0"/></radialGradient></defs>\n'
    f'<rect width="{S}" height="{S}" fill="#060609"/>\n<g filter="url(#h)" opacity=".6">{body}</g>\n<g filter="url(#w)">{body}</g>\n<g fill="#fffaf4">{stars}</g>\n'
    f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="10" fill="url(#sg)"/><circle cx="{f(c[0])}" cy="{f(c[1])}" r="2.2" fill="#fffaf4"/></svg>')
out=os.path.join(D,"eddy-v2")
open(out+"/icon.svg","w").write(icon(32,SPEC32,7,26.6,True,7,0,0.8,0.4))
open(out+"/icon-16.svg","w").write(icon(16,SPEC16,6,14.3,True,3,0,0,0))
open(out+"/apple-icon.svg","w").write(apple())
