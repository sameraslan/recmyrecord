import sys, numpy as np, common, metrics, exp_llm
train=np.asarray(common.split_rows("train")); prior=(common.Y[train]>0).mean(0)
names=sys.argv[1:]
anns={m:exp_llm.load_annotations(m,"val") for m in names}
rows=np.array(sorted(set.intersection(*[set(a) for a,_ in anns.values()])))
vocab={d:j for j,d in enumerate(common.DESCRIPTORS)}
Y=common.Y[rows]; B=Y>0
print(f"paired on {len(rows)} albums; most_frequent cP@10 {metrics.evaluate(Y,np.tile(prior,(len(rows),1)))['cP@10']:.3f}")
S_all={}
for m,(a,s) in anns.items():
    S=exp_llm.score_matrix(a,rows,prior); S_all[m]=S; e=metrics.evaluate(Y,S)
    n=np.mean([len(a[int(r)]["d"]) for r in rows])
    sp=np.mean([np.mean([B[i,vocab[w]] for w in a[int(r)]["d"]]) for i,r in enumerate(rows)])
    f3=np.mean([np.mean([B[i,vocab[w]] for w in a[int(r)]["d"][:3]]) for i,r in enumerate(rows)])
    f5=np.mean([np.mean([B[i,vocab[w]] for w in a[int(r)]["d"][:5]]) for i,r in enumerate(rows)])
    print(f"  {m:18s} n_albums {len(a):3d} unk {s['unknown_words']:2d} | cP@10 {e['cP@10']:.3f} P@10 {e['precision@10']:.3f} nDCG@10 {e['ndcg@10']:.3f} mAP {e['mAP']:.3f} perfect {e['perfect@10']:.3f} | listed {n:.1f} set-prec {sp:.3f} first3 {f3:.3f} first5 {f5:.3f}")
if len(names)>1:
    # rank-average ensemble (Borda): mean of per-model scores
    S=np.mean([S_all[m] for m in names],0); e=metrics.evaluate(Y,S)
    print(f"  {'ENSEMBLE(mean)':18s}              | cP@10 {e['cP@10']:.3f} P@10 {e['precision@10']:.3f} nDCG@10 {e['ndcg@10']:.3f} mAP {e['mAP']:.3f} perfect {e['perfect@10']:.3f}")
