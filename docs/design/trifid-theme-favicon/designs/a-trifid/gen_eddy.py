import math, os, random
D=os.path.dirname(os.path.abspath(__file__))
def f(v,n=1): return (("%."+str(n)+"f")%v).rstrip("0").rstrip(".")
def arm(c, th0, sweep, r0, r1, wmax, n, p=0.85, peak=0.38, nd=1):
    """Tapered spiral arm: polygon from the core outwards. Angles in degrees, clockwise."""
    out=[];inn=[]
    for i in range(n+1):
        t=i/n
        th=math.radians(th0+sweep*t)
        r=r0+(r1-r0)*t**p
        # width: fat near 'peak', pointed tail, blunt head
        if t<peak: w=wmax*(0.55+0.45*math.sin(math.pi/2*t/peak))
        else: w=wmax*math.cos(math.pi/2*(t-peak)/(1-peak))**0.9
        out.append((c[0]+(r+w)*math.sin(th), c[1]-(r+w)*math.cos(th)))
        inn.append((c[0]+(r-w)*math.sin(th), c[1]-(r-w)*math.cos(th)))
    pts=out+inn[::-1]
    # smooth closed path through the points (Catmull-Rom to cubic)
    m=len(pts); d=f"M{f(pts[0][0],nd)} {f(pts[0][1],nd)}"
    for i in range(m):
        p0,p1,p2,p3=pts[(i-1)%m],pts[i],pts[(i+1)%m],pts[(i+2)%m]
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+=f"C{f(c1[0],nd)} {f(c1[1],nd)} {f(c2[0],nd)} {f(c2[1],nd)} {f(p2[0],nd)} {f(p2[1],nd)}"
    return d+"Z"
COL={"t":("#e2fbf6","#5fcfd4","#1f7890"),"g":("#fff6dc","#f4be78","#b87a3a"),"r":("#ffc4a0","#e8603c","#9c3520")}
def grads(c,R):
    s=''
    for k,(a,b,d) in COL.items():
        s+=f'<radialGradient id="{k}" gradientUnits="userSpaceOnUse" cx="{f(c[0])}" cy="{f(c[1])}" r="{f(R)}"><stop offset=".12" stop-color="{a}"/><stop offset=".5" stop-color="{b}"/><stop offset="1" stop-color="{d}"/></radialGradient>'
    return s
def arms(c,k,spec,n,nd=1):
    s=''
    for (col,th0,sweep,r0,r1,w) in spec:
        s+=f'<path fill="url(#{col})" d="{arm(c,th0,sweep,r0*k,r1*k,w*k,n,nd=nd)}"/>'
    return s
SPEC32=[("t",160,205,3.0,11.6,2.9),("g",280,195,3.0,11.4,2.6),("r",40,185,3.0,11.2,2.3)]
SPEC16=[("t",170,150,3.4,11.0,3.4),("g",290,150,3.4,11.0,3.2),("r",50,150,3.4,11.0,3.0)]
def icon(S,rx,c,k,spec,n,core):
    o=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>{grads(c,12.5*k)}</defs>\n<rect width="{S}" height="{S}" rx="{rx}" fill="#07060a"/>\n'
    o+=arms(c,k,spec,n)+f'\n<circle cx="{c[0]}" cy="{c[1]}" r="{f(core*k)}" fill="#fffaf4"/></svg>'
    return o
out=os.path.join(D,"eddy")
open(out+"/icon.svg","w").write(icon(32,7,(16,16),1.0,SPEC32,7,1.5))
open(out+"/icon-16.svg","w").write(icon(16,3.5,(8,8),0.5,SPEC16,5,0))
def apple():
    S=180;c=(90,91);k=4.35
    body=arms(c,k,SPEC32,12)
    random.seed(5); stars=''
    for n in range(40):
        a=random.uniform(0,6.283); r=random.uniform(10,70)
        stars+=f'<circle cx="{f(c[0]+r*math.cos(a))}" cy="{f(c[1]+r*math.sin(a))}" r="{random.choice([.6,.7,.9,1.1,1.4])}" opacity="{random.choice([.5,.7,.85,1])}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>{grads(c,12.5*k)}'
    '<filter id="w" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".024" numOctaves="3" seed="3"/><feDisplacementMap in="SourceGraphic" scale="15" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".8"/></filter>'
    '<filter id="h" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="12"/></filter>'
    '<radialGradient id="sg"><stop offset="0" stop-color="#fffaf4"/><stop offset=".3" stop-color="#fffaf4" stop-opacity=".5"/><stop offset="1" stop-color="#fffaf4" stop-opacity="0"/></radialGradient></defs>\n'
    f'<rect width="{S}" height="{S}" fill="#060609"/>\n<g filter="url(#h)" opacity=".55">{body}</g>\n<g filter="url(#w)">{body}</g>\n<g fill="#fffaf4">{stars}</g>\n'
    f'<circle cx="{c[0]}" cy="{c[1]}" r="14" fill="url(#sg)"/><circle cx="{c[0]}" cy="{c[1]}" r="3" fill="#fffaf4"/></svg>')
open(out+"/apple-icon.svg","w").write(apple())
