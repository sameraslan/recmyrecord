import json, numpy as np, pandas as pd
R='/Users/saslan.19/Desktop/Tengs/reCreck/recmyrecord/.claude/worktrees/galaxy-theme-ui-1e2427/'
AUDIO=["danceability","energy","key","loudness","mode","speechiness","acousticness","instrumentalness","liveness","valence","tempo","duration_ms","time_signature"]
LYRIC_DROP=["abstract","alienation","conscious","crime","suicide","alcohol","educational","fantasy","folklore","hedonistic","history","Halloween","anti-religious","pagan","anarchism","protest","death","drugs","ideology","political","religious","Christian","Islamic","satanic","introspective","LGBT","love","breakup","misanthropic","mythology","nature","occult","paranormal","philosophical","existential","nihilistic","science fiction","self-hatred","sexual","sports","violence","war","apathetic","boastful","cryptic","deadpan","hateful","humorous","optimistic","pessimistic","poetic","rebellious","sarcastic","satirical","serious","vulgar"]
META=["Title","Artist","URI","Descriptor Count"]
def load():
    albums=json.load(open(R+'frontcreck/public/data/albums.json'))
    pos=json.load(open(R+'frontcreck/public/data/positions.json'))
    vocab=json.load(open(R+'frontcreck/public/data/vocab.json'))
    P={k:np.array(v).reshape(-1,2) for k,v in pos.items()}
    df=pd.read_pickle(R+'data-retrieval/Recommender/data/all_data_norm.pkl').reset_index(drop=True)
    df=df[~df['URI'].duplicated(keep='first')].reset_index(drop=True)
    sid=[str(u).split(':')[-1] for u in df['URI']]
    return albums,P,vocab,df,sid
