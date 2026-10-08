import math, os, random
D=os.path.dirname(os.path.abspath(__file__))
SKY="#07060a"
def f(v,n=1):
    s=("%."+str(n)+"f")%v
    return s.rstrip("0").rstrip(".") if "." in s else s
def smooth(pts,closed=True):
    m=len(pts); d=f"M{f(pts[0][0])} {f(pts[0][1])}"
    for i in (range(m) if closed else range(m-1)):
        g=(lambda j: pts[j%m]) if closed else (lambda j: pts[max(0,min(m-1,j))])
        p0,p1,p2,p3=g(i-1),g(i),g(i+1),g(i+2)
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+=f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d+("Z" if closed else "")
def band(th0,sweep,r0,g,wf,n,t0=0.0,t1=1.0,wk=1.0):
    """Closed outline of a spiral band between t0 and t1; wf(t) is the half width."""
    out=[];inn=[]
    for i in range(n+1):
        t=t0+(t1-t0)*i/n; th=math.radians(th0+sweep*t); r=r0+g*sweep*t; w=wf(t)*wk
        out.append(((r+w)*math.sin(th),-(r+w)*math.cos(th))); inn.append(((r-w)*math.sin(th),-(r-w)*math.cos(th)))
    return out+inn[::-1]
def line(th0,sweep,r0,g,wf,n,t0,t1,off):
    """Open line along the band, displaced by off * half width (+ is outward)."""
    ps=[]
    for i in range(n+1):
        t=t0+(t1-t0)*i/n; th=math.radians(th0+sweep*t); r=r0+g*sweep*t+off*wf(t)
        ps.append((r*math.sin(th),-r*math.cos(th)))
    return ps
class Fit:
    def __init__(s,pts,S,T,shift=(0,0),snap=False):
        xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
        s.k=T/max(max(xs)-min(xs),max(ys)-min(ys))
        s.ox=S/2-s.k*(max(xs)+min(xs))/2+shift[0]; s.oy=S/2-s.k*(max(ys)+min(ys))/2+shift[1]
        if snap: s.ox=math.floor(s.ox)+.5; s.oy=math.floor(s.oy)+.5
    def __call__(s,pts): return [(x*s.k+s.ox,y*s.k+s.oy) for x,y in pts]
def rg(i,c,R,stops):
    return f'<radialGradient id="{i}" gradientUnits="userSpaceOnUse" cx="{f(c[0])}" cy="{f(c[1])}" r="{f(R)}">'+''.join(f'<stop offset="{o}" stop-color="{col}"'+(f' stop-opacity="{a}"' if a<1 else '')+'/>' for o,col,a in stops)+'</radialGradient>'
def blur(i,sd,pad=30): return f'<filter id="{i}" x="-{pad}%" y="-{pad}%" width="{100+2*pad}%" height="{100+2*pad}%"><feGaussianBlur stdDeviation="{f(sd,2)}"/></filter>'
def stars(seed,n,c,rmax):
    random.seed(seed); s=''
    for i in range(n):
        a=random.uniform(0,6.283); r=random.uniform(14,rmax)
        s+=f'<circle cx="{f(c[0]+r*math.cos(a))}" cy="{f(c[1]+r*math.sin(a))}" r="{[.7,.9,1.2,1.6,2.1,2.8][i%6]}" opacity="{[.9,.6,1,.75,.95,.85][i%6]}"/>'
    return f'<g fill="#fffaf4">{s}</g>'
TURB=lambda seed,scale,bf: f'<filter id="w" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="{bf}" numOctaves="4" seed="{seed}"/><feDisplacementMap in="SourceGraphic" scale="{scale}" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.2"/></filter>'
COL={"t":("#d9f3ee","#74c3c6","#3f8f9d"),"g":("#fdf3d8","#e9c98f","#c29c62"),"r":("#fbd3bb","#e08a6a","#c46d55")}
SLATE="#55749f"

# ---------------------------------------------------------------- eddy-v3
def wf3(wmax,peak=0.42,head=0.5):
    return lambda t: wmax*(head+(1-head)*math.sin(math.pi/2*t/peak)) if t<peak else wmax*math.cos(math.pi/2*(t-peak)/(1-peak))**0.8
E32=[("t",150,205,2.4,0.052,2.25),("g",270,172,2.4,0.052,2.2),("r",30,150,2.4,0.052,2.15)]
E16=[("t",150,188,1.7,0.054,2.25),("g",270,162,1.7,0.054,2.25),("r",30,142,1.7,0.054,2.25)]
# streak inside each arm: (tint, t0, t1, offset, width factor)
STREAK={"t":[("#e6f8f3",.2,.7,.45,.5),("#4f8fa6",.35,.92,-.5,.5)],"g":[("#fff8e4",.15,.6,.4,.5),("#e08a6a",.4,.95,-.45,.5)],"r":[("#fde0cc",.2,.65,.4,.45),("#a85a56",.5,.95,-.5,.45)]}
def eddy(S,spec,n,T,rx,soft,core,rich,snap=False):
    allp=[p for (c,a,sw,r0,g,w) in spec for p in band(a,sw,r0,g,wf3(w),n)]
    F=Fit(allp,S,T,snap=snap); c=(F.ox,F.oy); k=F.k
    paths=''.join(f'<path fill="url(#{col})" d="{smooth(F(band(a,sw,r0,g,wf3(w),n)))}"/>' for (col,a,sw,r0,g,w) in spec)
    o=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>'
    for i,(a,b,d) in COL.items(): o+=rg(i,c,15.5*k,[(.1,a,1),(.55,b,1),(1,d,1)])
    if soft: o+=blur("s",soft)+blur("h",soft*4.5)+blur("m",soft*2.2)
    o+=rg("k",c,(3.1 if not soft else 3.4)*k,[(0,"#fff6dc",1),(.45,"#efd9ae",1),(.8,"#e2b48e",.9),(1,"#e2b48e",0)])
    o+=f'</defs>\n<rect width="{S}" height="{S}" rx="{rx}" fill="{SKY}"/>\n'
    if soft:
        st=''
        for (col,a,sw,r0,g,w) in spec:
            for (tint,t0,t1,off,wk) in STREAK[col]:
                st+=f'<path d="{smooth(F(line(a,sw,r0,g,wf3(w),2,t0,t1,off)),False)}" stroke="{tint}" stroke-width="{f(w*wk*k,2)}"/>'
        o+=f'<g filter="url(#h)" opacity=".7">{paths}</g>\n<g filter="url(#s)">{paths}</g>\n<g filter="url(#m)" fill="none" stroke-linecap="round" opacity=".75">{st}</g>\n'
    else: o+=paths+'\n'
    o+=f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="{f((3.1 if not soft else 3.4)*k)}" fill="url(#k)"/>'
    if core=="px": o+=f'<rect x="{f(c[0]-.5)}" y="{f(c[1]-.5)}" width="1" height="1" fill="#fff6dc"/>'
    elif core: o+=f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="{core}" fill="#fffaf4"/>'
    return o+'</svg>'
def eddy_apple():
    S=180; spec=E32; n=12
    allp=[p for (c,a,sw,r0,g,w) in spec for p in band(a,sw,r0,g,wf3(w),n)]
    F=Fit(allp,S,122,shift=(0,1)); c=(F.ox,F.oy); k=F.k
    paths=''.join(f'<path fill="url(#{col})" d="{smooth(F(band(a,sw,r0,g,wf3(w),n)))}"/>' for (col,a,sw,r0,g,w) in spec)
    st=''
    for (col,a,sw,r0,g,w) in spec:
        for (tint,t0,t1,off,wk) in STREAK[col]:
            st+=f'<path d="{smooth(F(line(a,sw,r0,g,wf3(w),7,t0,t1,off)),False)}" stroke="{tint}" stroke-width="{f(w*wk*k,2)}"/>'
    o=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>'
    for i,(a,b,d) in COL.items(): o+=rg(i,c,15.5*k,[(.1,a,1),(.55,b,1),(1,d,1)])
    o+=TURB(3,22,".02")+blur("h",10,40)+blur("m",3.4)+rg("k",c,3.6*k,[(0,"#fff6dc",1),(.4,"#efd9ae",.95),(.8,"#e2b48e",.7),(1,"#e2b48e",0)])
    o+=f'</defs>\n<rect width="{S}" height="{S}" fill="#060609"/>\n<g filter="url(#h)" opacity=".75">{paths}</g>\n'
    o+=f'<g filter="url(#w)">{paths}<g filter="url(#m)" fill="none" stroke-linecap="round" opacity=".8">{st}</g><circle cx="{f(c[0])}" cy="{f(c[1])}" r="{f(3.6*k)}" fill="url(#k)"/></g>\n'
    o+=stars(8,7,c,74)+f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="2" fill="#fffaf4"/></svg>'
    return o
out=os.path.join(D,"eddy-v3")
open(out+"/icon.svg","w").write(eddy(32,E32,5,26,7,0.4,0.7,True))
open(out+"/icon-16.svg","w").write(eddy(16,E16,6,13.9,3,0,"px",False,snap=True))
open(out+"/apple-icon.svg","w").write(eddy_apple())

# ---------------------------------------------------------------- eddy-gas
GA=dict(th0=205,sweep=430,r0=0.9,g=4.6/360)
def wg(t,lump=0.0):
    if t<.35: w=1.4+0.35*math.sin(math.pi/2*t/.35)
    elif t<.68: w=1.75
    else: w=1.75*math.cos(math.pi/2*(t-.68)/.32)**0.75
    return w*(1+lump*math.sin(t*23+1))
SEG16=[(0,.30,"#e08a6a"),(.27,.37,"#e6ab7e"),(.34,.60,"#ecd097"),(.57,.67,"#b4cbae"),(.64,1,"#74c3c6")]
def gas(S,T,rx,n,soft,lump,snap=False,apple=False):
    w=lambda t: wg(t,lump)
    a=(GA["th0"],GA["sweep"],GA["r0"],GA["g"])
    base=band(*a,w,n); F=Fit(base,S,T,snap=snap); c=(F.ox,F.oy); k=F.k
    arm=smooth(F(base))
    o=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><defs>'
    if soft:
        o+=blur("e",soft*.55)+blur("m",soft*1.6)+blur("d",soft*.9)+f'<mask id="c"><path d="{arm}" fill="#fff" filter="url(#e)"/></mask>'
        if apple: o+=TURB(5,20,".021")+blur("h",11,40)
        else: o+=blur("h",soft*2.6)
    else: o+=f'<clipPath id="c"><path d="{arm}"/></clipPath>'
    o+=rg("l",c,9*k,[(0,"#fff",.34),(.5,"#fff",.06),(1,"#000",.2)])
    o+=f'</defs>\n<rect width="{S}" height="{S}" rx="{rx}" fill="{"#060609" if apple else SKY}"/>\n'
    m=max(3,n//4)
    segs=''.join(f'<path fill="{col}" d="{smooth(F(band(*a,w,m,t0,t1,1.22 if soft else 1.0)))}"/>' for t0,t1,col in SEG16)
    if soft:
        ln=lambda t0,t1,off,col,wd,op: f'<path d="{smooth(F(line(*a,w,(6 if apple else 3),t0,t1,off)),False)}" stroke="{col}" stroke-width="{f(wd*k,2)}" opacity="{op}"/>'
        marb=ln(.5,.97,-.62,SLATE,.9,.95)+ln(.12,.34,-.5,"#b9625a",.7,.7)+ln(.36,.62,.5,"#fff8e2",.8,.8)+ln(.72,.95,.45,"#d6f3ee",.6,.8)+ln(.2,.42,.55,"#f6c9a8",.6,.7)
        dust=ln(.3,.62,-.05,SKY,.3,.7)+ln(.72,.94,.05,SKY,.24,.6)
        inner=f'<g mask="url(#c)"><g filter="url(#m)">{segs}</g><g filter="url(#m)" fill="none" stroke-linecap="round">{marb}</g><g filter="url(#d)" fill="none" stroke-linecap="round">{dust}</g><rect width="{S}" height="{S}" fill="url(#l)"/></g>'
        o=o.replace('</defs>',f'<g id="q">{segs}</g></defs>'); segs='<use href="#q"/>'
        inner=inner.replace(inner[inner.index('<g filter="url(#m)">')+20:inner.index('</g>')],segs)
        halo=f'<g filter="url(#h)" opacity="{.5 if apple else .32}">{segs}</g>'
        if apple:
            o+=halo+f'\n<g filter="url(#w)">{inner}</g>\n'+stars(2,7,c,76)+f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="1.8" fill="#fffaf4"/>'
        else: o+=halo+'\n'+inner
    else:
        o+=f'<g clip-path="url(#c)">{segs}<rect width="{S}" height="{S}" fill="url(#l)"/></g>'
    return o+'</svg>'
out=os.path.join(D,"eddy-gas")
open(out+"/icon.svg","w").write(gas(32,26.5,7,12,0.45,0.05))
open(out+"/icon-16.svg","w").write(gas(16,13.4,3,14,0,0,snap=False))
open(out+"/apple-icon.svg","w").write(gas(180,124,0,30,3.2,0.07,apple=True))
