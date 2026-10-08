"""Second pass: match by exact English label of the album and of its performer (P175)."""
import csv, json, sys, time, urllib.parse, urllib.request, unicodedata
CAT, PREV, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
UA = "recmyrecord-research/0.1 (https://github.com/sameraslan/recmyrecord)"
rows = list(csv.DictReader(open(CAT)))
prev = json.load(open(PREV))
item_of, info = prev["item_of"], prev["info"]
def sparql(q):
    for a in range(6):
        try:
            req = urllib.request.Request("https://query.wikidata.org/sparql", data=urllib.parse.urlencode({"query": q}).encode(),
                headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            return json.load(urllib.request.urlopen(req, timeout=120))["results"]["bindings"]
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(5 * (a + 1))
    return []
pairs = {}
for r in rows:
    if r["rym_id"] in item_of: continue
    for t in {r["title"], r["rym_title"], r["title_latin"]} - {""}:
        for a in {r["artist"], r["rym_artist"], r["artist_latin"]} - {""}:
            pairs.setdefault((t, a), []).append(r["rym_id"])
keys = list(pairs)
print("pairs", len(keys), file=sys.stderr)
B = 80
for i in range(0, len(keys), B):
    vals = " ".join(f"({json.dumps(t)}@en {json.dumps(a)}@en)" for t, a in keys[i:i+B])
    q = f"""SELECT ?t ?a ?i WHERE {{ VALUES (?t ?a) {{ {vals} }} ?i rdfs:label ?t . ?i wdt:P175 ?p . ?p rdfs:label ?a .
      ?i wdt:P31 ?c . VALUES ?c {{ wd:Q482994 wd:Q208569 wd:Q209939 wd:Q169930 wd:Q222910 wd:Q1242743 wd:Q959309 wd:Q273057 }} }}"""
    for b in sparql(q):
        qid = b["i"]["value"].rsplit("/", 1)[1]
        for rid in pairs[(b["t"]["value"], b["a"]["value"])]:
            item_of.setdefault(rid, {}).setdefault(qid, []).append("label")
    if i % 2000 == 0: print(i, len(item_of), file=sys.stderr)
    time.sleep(0.5)
qids = sorted({q for d in item_of.values() for q in d} - set(info))
for i in range(0, len(qids), 300):
    chunk = " ".join("wd:" + q for q in qids[i:i+300])
    for b in sparql(f"""SELECT ?i ?site ?title WHERE {{ VALUES ?i {{ {chunk} }}
        OPTIONAL {{ ?a schema:about ?i; schema:isPartOf ?site; schema:name ?title . FILTER(CONTAINS(STR(?site), "wikipedia.org")) }} }}"""):
        q = b["i"]["value"].rsplit("/", 1)[1]
        d = info.setdefault(q, {})
        if "site" in b: d[b["site"]["value"]] = b["title"]["value"]
    for b in sparql(f"""SELECT ?i (COUNT(DISTINCT ?p) AS ?n) WHERE {{ VALUES ?i {{ {chunk} }} ?i ?p ?o .
        VALUES ?p {{ wdt:P162 wdt:P264 wdt:P483 wdt:P577 wdt:P2047 wdt:P136 wdt:P166 wdt:P10135 wdt:P1191 wdt:P495 }} }} GROUP BY ?i"""):
        info.setdefault(b["i"]["value"].rsplit("/", 1)[1], {})["_nfacts"] = int(b["n"]["value"])
    time.sleep(1)
json.dump({"item_of": item_of, "info": info}, open(OUT, "w"))
