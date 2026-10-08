"""Estimate how many still-unmatched albums do have an English Wikipedia article: search a random sample through WDQS's
MWAPI bridge, then accept a hit only if its Wikidata item is a release (P31 album-like) whose performer matches and whose title matches."""
import csv, json, random, re, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
CAT, PREV, OUT, N = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
UA = "recmyrecord-research/0.1 (https://github.com/sameraslan/recmyrecord; coverage study)"
rows = list(csv.DictReader(open(CAT))); d = json.load(open(PREV))
def norm(s): return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip()
def has_wiki(rid): return any(any(s.startswith("https://") for s in d["info"].get(q, {})) for q in d["item_of"].get(rid, {}))
pool = [r for r in rows if not has_wiki(r["rym_id"])]
random.seed(20261008); sample = random.sample(pool, N)
def sparql(q):
    for a in range(4):
        try:
            req = urllib.request.Request("https://query.wikidata.org/sparql", data=urllib.parse.urlencode({"query": q}).encode(),
                headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            return json.load(urllib.request.urlopen(req, timeout=90))["results"]["bindings"]
        except Exception as e:
            print("retry", e, file=sys.stderr, flush=True); time.sleep(8 * (a + 1))
    return None
def search(r):
    q = f'{r["title_latin"] or r["title"]} {r["artist_latin"] or r["artist"]}'.replace('"', " ")
    res = sparql(f"""SELECT ?title ?item WHERE {{ SERVICE wikibase:mwapi {{ bd:serviceParam wikibase:endpoint "en.wikipedia.org"; wikibase:api "Generator";
        mwapi:generator "search"; mwapi:gsrsearch {json.dumps(q)}; mwapi:gsrlimit "8"; wikibase:limit "once". ?title wikibase:apiOutput mwapi:title. ?item wikibase:apiOutputItem mwapi:item. }} }}""")
    return r["rym_id"], None if res is None else [(b["title"]["value"], b["item"]["value"].rsplit("/", 1)[1]) for b in res if "item" in b]
import os
HITS = OUT + ".hits.json"
hits = json.load(open(HITS)) if os.path.exists(HITS) else {}
todo = [r for r in sample if hits.get(r["rym_id"]) is None]
with ThreadPoolExecutor(3) as ex:
    for k, (rid, v) in enumerate(ex.map(search, todo)):
        hits[rid] = v
        if k % 25 == 0: print("searched", k, len(todo), file=sys.stderr, flush=True); json.dump(hits, open(HITS, "w"))
json.dump(hits, open(HITS, "w"))
items = sorted({q for v in hits.values() if v for _, q in v})
print("items", len(items), file=sys.stderr, flush=True)
meta = {}
ALB = "wd:Q482994 wd:Q208569 wd:Q209939 wd:Q169930 wd:Q222910 wd:Q1242743 wd:Q959309 wd:Q273057 wd:Q4176708 wd:Q217199 wd:Q24672043"
for i in range(0, len(items), 100):
    vals = " ".join("wd:" + q for q in items[i:i+100])
    res = sparql(f"""SELECT ?i ?p WHERE {{ VALUES ?i {{ {vals} }} ?i wdt:P31 ?c . FILTER(?c IN ({ALB.replace(" ", ", ")})) OPTIONAL {{ ?i wdt:P175 ?p }} }}""") or []
    perf = {}
    for b in res: perf.setdefault(b["i"]["value"].rsplit("/", 1)[1], set()).add(b.get("p", {}).get("value", "").rsplit("/", 1)[-1])
    pids = sorted({p for v in perf.values() for p in v if p})
    lab = {}
    if pids:
        for b in sparql(f"""SELECT ?p ?l WHERE {{ VALUES ?p {{ {" ".join("wd:" + p for p in pids)} }} ?p rdfs:label ?l . FILTER(LANG(?l) IN ("en", "mul")) }}""") or []:
            lab.setdefault(b["p"]["value"].rsplit("/", 1)[1], set()).add(b["l"]["value"])
    for q, ps in perf.items(): meta[q] = {l for p in ps for l in lab.get(p, {""})} or {""}
    print("meta", i, len(items), file=sys.stderr, flush=True)
out = {}
for r in sample:
    v = hits[r["rym_id"]]
    if v is None: out[r["rym_id"]] = "error"; continue
    artists = {norm(x) for x in (r["artist"], r["rym_artist"], r["artist_latin"]) if x}
    titles = {norm(x) for x in (r["title"], r["rym_title"], r["title_latin"]) if x}
    ok = None
    for title, q in v:
        if q not in meta: continue
        t = norm(re.sub(r"\(.*?\)", "", title))
        perf = {norm(p) for p in meta[q] if p}
        if any(x and (x == t or x in t or t in x) for x in titles) and (not perf or any(a and p and (a in p or p in a) for a in artists for p in perf)):
            ok = {"title": title, "qid": q, "perf": sorted(perf)}; break
    out[r["rym_id"]] = ok
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=0)
f = [k for k, v in out.items() if isinstance(v, dict)]; e = [k for k, v in out.items() if v == "error"]
print("sample", N, "found", len(f), "errors", len(e), file=sys.stderr)
