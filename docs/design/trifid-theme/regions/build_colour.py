"""Data-derived colour families. Run: arch -x86_64 python3 build_colour.py"""
from load import *
from sklearn.decomposition import NMF
from sklearn.neighbors import NearestNeighbors
albums,P,vocab,df,sid=load(); N=len(albums)
dcols=[c for c in df.columns if c not in META+AUDIO+LYRIC_DROP]
W=(df[dcols].astype(float).to_numpy()>0).astype(float); base=W.mean(0)
keep=[j for j,c in enumerate(dcols) if W[:,j].sum()>=40]
D=W[:,keep]*np.sqrt(np.log(1/base[keep])); dn=[dcols[j] for j in keep]
AF=["energy","loudness","acousticness","valence","danceability","instrumentalness","speechiness","liveness","tempo"]
A=df[AF].astype(float).to_numpy(); Azf=(A-A.mean(0))/A.std(0); Az=np.clip(Azf,-2.5,2.5)
Ax=np.hstack([np.maximum(Az,0),np.maximum(-Az,0)]); an=[f+"+" for f in AF]+[f+"-" for f in AF]
aw=np.sqrt((D**2).sum()/(Ax**2).sum()); X=np.hstack([D,Ax*aw])
g=json.load(open('regions.json')); ar=np.array([a or '' for a in g['album_region']]); R=g['regions']
errs={}
for k in (3,4,5,6):
    m=NMF(k,init='nndsvda',random_state=0,max_iter=600).fit(X); errs[k]=round(float(m.reconstruction_err_/np.linalg.norm(X)),3)
K=5
m=NMF(K,init='nndsvda',random_state=0,max_iter=800); H=m.fit_transform(X); C=m.components_
# seed stability: random inits, best-match cosine of components
stab=[]
for s in (1,2,3):
    C2=NMF(K,init='random',random_state=s,max_iter=800).fit(X).components_
    cs=(C/np.linalg.norm(C,axis=1,keepdims=True))@(C2/np.linalg.norm(C2,axis=1,keepdims=True)).T
    stab.append(cs.max(1))
stab=np.array(stab).min(0)
# identify components by anchor word (order from nndsvda is deterministic, anchors make it explicit)
anchor={"fierce":"aggressive","warm":"bittersweet","quiet":"acoustic","dark":"ominous","urban":"sampling"}
comp={f:int(np.argmax(C[:,dn.index(w)]/np.linalg.norm(C,axis=1))) for f,w in anchor.items()}
assert len(set(comp.values()))==K, comp
FAM=["fierce","warm","quiet","dark","urban"]
HEX={"fierce":"#d9627a","warm":"#e2b45c","quiet":"#4fb3a5","dark":"#6f9bd8","urban":"#a884d6"}
SKY={"fierce":"emission rose","warm":"gold","quiet":"teal","dark":"reflection blue","urban":"violet-mauve"}
order=[comp[f] for f in FAM]
Hn=(H*np.linalg.norm(C,axis=1))[:,order]; tot=Hn.sum(1); S=Hn/np.maximum(tot[:,None],1e-9)
# neutral: thin evidence (activation below the collection median) or no leading family (max share 0.2 = flat .. 0.4 = clear)
char=np.clip(tot/np.median(tot),0,1)*np.clip((S.max(1)-0.2)/0.2,0,1)
neutral=1-char; AW=np.hstack([S*char[:,None],neutral[:,None]])
nn=NearestNeighbors(n_neighbors=16).fit(P['balanced']); _,nb=nn.kneighbors(P['balanced'])
SM=0.5*AW+0.5*AW[nb[:,1:]].mean(1)
fam={}
for f,c in zip(FAM,order):
    o=np.argsort(-C[c,:len(dn)])[:9]; oa=np.argsort(-C[c,len(dn):])[:4]
    lead=S.argmax(1)==FAM.index(f); clear=lead&(neutral<0.5)
    fam[f]={"hex":HEX[f],"sky_colour":SKY[f],"top_words":[dn[j] for j in o],"audio":[an[j] for j in oa],
            "albums_leading":int(clear.sum()),"seed_stability_cosine":round(float(stab[c]),2)}
MEAN={"fierce":"fierce: energetic, heavy, aggressive, raw, angry; loud and high-energy",
"warm":"warm: melodic, bittersweet, warm, playful, passionate, romantic; upbeat and danceable, sung",
"quiet":"quiet: acoustic, calm, mellow, soothing, soft, often instrumental; low energy, low loudness",
"dark":"dark: atmospheric, dark, ominous, sombre, hypnotic, cold; low valence, often instrumental",
"urban":"urban: urban, sampling, rhythmic, nocturnal; speech-heavy and danceable"}
for f in FAM: fam[f]["meaning"]=MEAN[f]
reg={}
for r in R:
    mk=ar==r['id']; w=S[mk].mean(0)*0+AW[mk,:K].sum(0)/AW[mk,:K].sum(); nt=float(neutral[mk].mean())
    o=np.argsort(-w); d=FAM[o[0]]; margin=float(w[o[0]]-w[o[1]])
    fit="clear" if (w[o[0]]>=0.5 and nt<0.45) else "mixed" if w[o[0]]>=0.4 and nt<0.45 else "weak"
    tw=", ".join(f"{t['word']} {t['coverage']:.0%}" for t in r['top_words'][:3]); au=", ".join(f"{k} {v:+.1f}" for k,v in sorted(r['audio'].items(),key=lambda kv:-abs(kv[1]))[:2])
    reg[r['id']]={"name_space":r['name_space'],"weights":{f:round(float(x),2) for f,x in zip(FAM,w)},"dominant":d,"second":FAM[o[1]],
        "margin":round(margin,2),"mean_neutral":round(nt,2),"share_of_albums_led_by_dominant":round(float((S[mk].argmax(1)==o[0]).mean()),2),"fit":fit,
        "why":f"{tw}; {au}"}
out={"method":"NMF (5 components, nndsvda init) on all 4,081 albums: descriptor presence (words on >= 40 albums, weighted by sqrt(log(1/frequency))) plus nine audio z-scores split into positive and negative parts, the two blocks scaled to equal total energy. Regions were not used to fit it. k = 5 is the smallest k at which dark/cold separates from fierce (at k = 3 and 4 Sombre Void lands in the heavy family). Album weight = share of that album's activation per family, scaled by a character score; the remainder is neutral (thin tagging or no leading family).",
 "relative_reconstruction_error_by_k":errs,"family_order":FAM+["neutral"],"neutral_hex":"#8a8580","families":fam,"region_family":reg,
 "caption":"Rose where the music is fierce, gold where it is warm, teal where it is quiet, blue where it is dark, violet where it is urban.",
 "album_weights":[[round(float(x),2) for x in row] for row in AW],
 "album_weights_balanced_smoothed":[[round(float(x),2) for x in row] for row in SM]}
json.dump(out,open('colour.json','w'),ensure_ascii=False,separators=(',',':'))
print(errs); print(comp)
for f in FAM: print(f, fam[f]['top_words'], fam[f]['audio'], fam[f]['albums_leading'], fam[f]['seed_stability_cosine'])
for k,v in reg.items(): print(f"{k:12s} {v['dominant']:7s} {v['fit']:6s} neu={v['mean_neutral']:.2f} led={v['share_of_albums_led_by_dominant']:.2f} "+" ".join(f"{f}={x:.2f}" for f,x in v['weights'].items()))
print('neutral>=0.5:',int((neutral>=.5).sum()),'neutral>=0.9:',int((neutral>=.9).sum()),'mean neutral',neutral.mean())
un=ar==''; print('unnamed albums: mean neutral',neutral[un].mean(),'named',neutral[~un].mean())
print('zero-descriptor albums',int((W.sum(1)==0).sum()),'their mean neutral',neutral[W.sum(1)==0].mean())
