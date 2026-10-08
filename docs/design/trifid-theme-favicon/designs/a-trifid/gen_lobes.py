import math, os, random
D=os.path.dirname(os.path.abspath(__file__))
RED=("#ffb48e","#e8603c","#a83820"); GOLD=("#fff2d0","#f4be78","#c08440"); TEAL=("#d6f8f4","#5fcfd4","#267f92")
def pol(c,ang,r):
    a=math.radians(ang); return (c[0]+r*math.sin(a), c[1]-r*math.cos(a))
def f(v): return ("%.2f"%v).rstrip("0").rstrip(".")
ARMS=[303,80,190]
def core(c, k, lanew, star, bumps=True, bend=1.0, L0=15.5):
    """defs, body for a cloud centred at c with unit scale k (k=1 is the 32 px master)."""
    lobes=[(ARMS[0],ARMS[1]+360,RED,8.6,5.0),(ARMS[1],ARMS[2],GOLD,7.6,5.3),(ARMS[2],ARMS[0],TEAL,7.2,5.2)]
    # secondary bumps (angle offset from lobe middle, distance, radius) give the cloud an uneven rim
    extra=[[(-38,8.6,4.4),(34,7.6,3.6)],[(26,8.4,3.6)],[(-24,8.6,3.4)]]
    defs=[];body=[]
    for i,(a,b,col,r,off) in enumerate(lobes):
        mid=(a+b)/2; g=pol(c,mid,off*0.3*k)
        defs.append(f'<radialGradient id="g{i}" gradientUnits="userSpaceOnUse" cx="{f(g[0])}" cy="{f(g[1])}" r="{f((off+r)*k)}"><stop offset="0" stop-color="{col[0]}"/><stop offset=".42" stop-color="{col[1]}"/><stop offset="1" stop-color="{col[2]}"/></radialGradient>')
        R=60*k
        pts=[c,pol(c,a,R),pol(c,mid,R),pol(c,b,R)]
        defs.append(f'<clipPath id="c{i}"><path d="M'+'L'.join(f(p[0])+' '+f(p[1]) for p in pts)+'Z"/></clipPath>')
        p=pol(c,mid,off*k)
        s=f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="{f(r*k)}"/>'
        if bumps:
            for (da,dist,rr) in extra[i]:
                q=pol(c,mid+da,dist*k); s+=f'<circle cx="{f(q[0])}" cy="{f(q[1])}" r="{f(rr*k)}"/>'
        body.append(f'<g fill="url(#g{i})" clip-path="url(#c{i})">{s}</g>')
    L=L0*k
    d1='';d2=''
    for j,a in enumerate(ARMS):
        sgn=(12,-14,16)[j]*bend
        e=pol(c,a+sgn*0.25,L); q=pol(c,a+sgn,L*0.5)
        d1+=f'M{f(c[0])} {f(c[1])}Q{f(q[0])} {f(q[1])} {f(e[0])} {f(e[1])}'
        e2=pol(c,a+sgn*0.8,L*0.45)
        d2+=f'M{f(c[0])} {f(c[1])}L{f(e2[0])} {f(e2[1])}'
    lane=f'<g fill="none" stroke="#07060a" stroke-linecap="round"><path d="{d1}" stroke-width="{f(lanew*k)}"/><path d="{d2}" stroke-width="{f(lanew*1.55*k)}"/></g>'
    st=f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="{f(star*k)}" fill="#fffaf4"/>' if star else ''
    return defs, body, lane, st
def icon(S, rx, c, k, lanew, star, bumps=True, bend=1.0):
    defs,body,lane,st=core(c,k,lanew,star,bumps,bend)
    return '\n'.join([f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">','<defs>']+defs+['</defs>',f'<rect width="{S}" height="{S}" rx="{rx}" fill="#07060a"/>']+body+[lane,st,'</svg>'])
def apple():
    S=180; c=(88,94); k=5.0
    defs,body,lane,st=core(c,k,1.2,0,L0=11.0)
    defs.append('<filter id="w" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".021" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="24" xChannelSelector="R" yChannelSelector="G"/></filter>')
    defs.append('<filter id="h" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="15"/></filter>')
    defs.append('<filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".7"/></filter>')
    defs.append('<radialGradient id="sg"><stop offset="0" stop-color="#fffaf4"/><stop offset=".25" stop-color="#fffaf4" stop-opacity=".55"/><stop offset="1" stop-color="#fffaf4" stop-opacity="0"/></radialGradient>')
    random.seed(11)
    stars=''
    for n in range(46):
        a=random.uniform(0,360); r=random.uniform(9,62)**1.0; p=pol(c,a,r)
        rad=random.choice([.6,.7,.8,.9,1.1,1.4]); op=random.choice([.55,.7,.85,1])
        stars+=f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="{rad}" opacity="{op}"/>'
    o=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">','<defs>']+defs+['</defs>',
       f'<rect width="{S}" height="{S}" fill="#060609"/>',
       '<g filter="url(#h)" opacity=".5">'+''.join(body)+'</g>',
       '<g filter="url(#w)"><g filter="url(#s)">'+''.join(body)+lane+'</g></g>',
       f'<g fill="#fffaf4">{stars}</g>',
       f'<circle cx="{c[0]}" cy="{c[1]}" r="11" fill="url(#sg)"/><circle cx="{c[0]}" cy="{c[1]}" r="2.6" fill="#fffaf4"/>',
       '</svg>']
    return '\n'.join(o)
out=os.path.join(D,"three-lobes")
open(out+"/icon.svg","w").write(icon(32,7,(15.7,17),1.06,1.45,1.15))
open(out+"/icon-16.svg","w").write(icon(16,3.5,(7.8,8.4),0.52,1.9,0,bumps=False,bend=0.6))
open(out+"/apple-icon.svg","w").write(apple())
