"""Derive named regions on the balanced layout. Run: arch -x86_64 python3 build_regions.py"""
from load import *
import sys
from sklearn.cluster import MeanShift
from sklearn.neighbors import NearestNeighbors
from scipy.spatial import ConvexHull
from scipy.spatial.distance import pdist
NON_MOOD={"male vocals","female vocals","androgynous vocals","vocal group","instrumental","concept album"}
albums,P,vocab,df,sid=load()
B=P['balanced']; N=len(B)
dcols=[c for c in df.columns if c not in META+AUDIO+LYRIC_DROP]
W=(df[dcols].astype(float).to_numpy()>0); base=W.mean(0)
A=df[AUDIO].astype(float).to_numpy(); Az=(A-A.mean(0))/A.std(0)
ms=MeanShift(bandwidth=0.12,bin_seeding=True).fit(B); seed=ms.labels_
# merges of adjacent mean-shift blobs with the same leading words (ids are mean-shift labels)
MERGE=json.load(open('merge.json'))
lab0=np.full(N,-1)
for rid,(key,spec) in enumerate(MERGE.items()):
    for s in spec['seeds']: lab0[seed==s]=rid
keys=list(MERGE)
# core trimming: interior points only (>=70% of 15 nearest 2D neighbours in the same region) and not a straggler
nn=NearestNeighbors(n_neighbors=16).fit(B); dist,nb=nn.kneighbors(B); nb=nb[:,1:]
same=(lab0[nb]==lab0[:,None]).mean(1)
strag=dist[:,10]>np.percentile(dist[:,10],97)
lab=np.where((lab0>=0)&(same>=0.7)&~strag,lab0,-1)
# drop the farthest 8% from each region's median centre
for r in range(len(keys)):
    m=np.flatnonzero(lab==r); c=np.median(B[m],0); d=np.linalg.norm(B[m]-c,axis=1)
    lab[m[d>np.percentile(d,92)]]=-1
print('assigned',np.mean(lab>=0), 'of seeded', np.mean(lab0>=0))
def cohesion(Pl,m):
    n=NearestNeighbors(n_neighbors=16).fit(Pl); _,k=n.kneighbors(Pl[m]); return m[k[:,1:]].mean()
rng=np.random.default_rng(0)
samp=rng.choice(N,1500,replace=False)
scale={l:np.median(pdist(P[l][samp]))/np.median(pdist(B[samp])) for l in P}
regions=[]
cov_all=np.array([W[lab==r].mean(0) for r in range(len(keys))])
for r,key in enumerate(keys):
    m=lab==r; idx=np.flatnonzero(m); pts=B[idx]
    c=pts.mean(0); d=np.linalg.norm(pts-c,axis=1)
    cov=cov_all[r]; lift=cov/np.maximum(base,1e-9)
    sc=np.where((cov>=.25)&(lift>=1.5),cov*np.log2(np.maximum(lift,1e-9)),-9)
    o=[j for j in np.argsort(-sc) if sc[j]>0][:8]
    others=np.delete(cov_all,r,0)
    tw=[{"word":dcols[j],"coverage":round(float(cov[j]),3),"overall":round(float(base[j]),3),"lift":round(float(lift[j]),2),
         "max_other_region":round(float(others[:,j].max()),3),"mood_word":dcols[j] not in NON_MOOD} for j in o]
    z=Az[m].mean(0)
    hull=pts[ConvexHull(pts).vertices]
    while len(hull)>24:  # drop the vertex that removes least area
        n=len(hull); a=[abs(np.cross(hull[i]-hull[i-1],hull[(i+1)%n]-hull[i-1])) for i in range(n)]; hull=np.delete(hull,int(np.argmin(a)),0)
    from matplotlib_free import inpoly
    inside=inpoly(B,hull); hull_purity=float((lab0[inside]==r).mean())
    st={}
    for l in ('balanced','sonic','mood'):
        Pl=P[l]; q=Pl[idx]; s=rng.choice(len(idx),min(300,len(idx)),replace=False)
        ratio=np.median(pdist(q[s]))/np.median(pdist(pts[s]))/scale[l]
        cen=np.median(q,0); r90=np.percentile(d,90)*scale[l]*1.25
        frac=float((np.linalg.norm(q-cen,axis=1)<=r90).mean())
        st[l]={"spread_ratio":round(float(ratio),2),"knn_cohesion":round(float(cohesion(Pl,m)),2),"frac_in_blob":round(frac,2)}
    stable={l:bool(st[l]["knn_cohesion"]>=0.5 and st[l]["frac_in_blob"]>=0.7 and st[l]["spread_ratio"]<=1.6) for l in ('sonic','mood')}
    near=idx[np.argsort(d)][:8]; known=idx[:8]
    fmt=lambda i:f"{albums[i]['t']} — {albums[i]['a']}"
    spec=MERGE[key]; nw=spec["name_word"]
    if spec.get("named_from")=="audio":
        zz=float(z[AUDIO.index(nw)]); strength="strong" if abs(zz)>=1.5 else "fair" if abs(zz)>=1.0 else "weak"
        ev={"feature":nw,"z":round(zz,2)}; evline=f"{nw} z {zz:+.1f} (no mood word reaches 35% with 1.8x)"
    else:
        j=dcols.index(nw); cj,lj,oj=float(cov[j]),float(lift[j]),float(others[:,j].max())
        strength="strong" if (cj>=.40 and lj>=1.8 and oj<=0.8*cj) else "fair" if (cj>=.35 and lj>=1.8) else "weak"
        ev={"word":nw,"coverage":round(cj,3),"overall":round(float(base[j]),3),"lift":round(lj,2),"max_other_region":round(oj,3)}
        evline=f"{nw} {cj:.0%} vs {base[j]:.0%} overall, {lj:.1f}x (next region {oj:.0%})"
    regions.append({"id":key,"label_plain":spec.get("label_plain",""),"name_space":spec.get("name_space",""),"strength":strength,"name_evidence":ev,"evidence_line":evline,
        "named_from":spec.get("named_from","mood"),
        "cx":round(float(c[0]),3),"cy":round(float(c[1]),3),"radius":round(float(np.percentile(d,75)),3),
        "hull":[[round(float(x),3),round(float(y),3)] for x,y in hull],"hull_purity":round(hull_purity,2),
        "n":int(m.sum()),"mean_descriptors_per_album":round(float(W[m].sum(1).mean()),1),"top_words":tw,
        "audio":{AUDIO[j]:round(float(z[j]),2) for j in range(len(AUDIO))},
        "examples":[fmt(i) for i in near],"best_known":[fmt(i) for i in known],
        "stability":st,"stable_in":stable,"note":spec.get("note","")})
out={"layout":"balanced","method":"mean-shift (bandwidth 0.12) on balanced 2D positions; adjacent blobs with the same leading words merged; trimmed to interior cores (>=70% of 15 nearest neighbours in the same region, sparse stragglers and the farthest 8% removed). Coverage = share of the region's albums carrying the descriptor in the full feature table (any weight > 0); lift = coverage / share in all 4081 albums. Audio = mean z-score vs the collection. radius = 75th percentile distance of members from (cx, cy).",
     "regions":regions,"album_region":[keys[l] if l>=0 else None for l in lab]}
json.dump(out,open('regions.json','w'),ensure_ascii=False,indent=1)
for g in regions:
    zs=sorted(g['audio'].items(),key=lambda kv:-abs(kv[1]))[:4]
    print(f"\n## {g['id']} [{g['strength']}] {g['evidence_line']} n={g['n']} c=({g['cx']},{g['cy']}) r={g['radius']} hullpur={g['hull_purity']} desc/album={g['mean_descriptors_per_album']}")
    print("  words: "+"; ".join(f"{w['word']}{'' if w['mood_word'] else '*'} {w['coverage']:.0%} vs {w['overall']:.0%} {w['lift']}x (other max {w['max_other_region']:.0%})" for w in g['top_words']))
    print("  audio: "+", ".join(f"{k} {v:+.1f}" for k,v in zs))
    print("  stab: ",g['stability'],g['stable_in'])
    print("  near: "+" | ".join(g['examples'][:6])); print("  known: "+" | ".join(g['best_known'][:6]))
