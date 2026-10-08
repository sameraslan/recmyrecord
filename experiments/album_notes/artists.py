"""For every catalog artist: is there a Wikidata item with that English label that is a person or group with an English Wikipedia article?"""
import csv, json, sys, time, urllib.parse, urllib.request
CAT, OUT = sys.argv[1], sys.argv[2]
UA = "recmyrecord-research/0.1 (https://github.com/sameraslan/recmyrecord)"
rows = list(csv.DictReader(open(CAT)))
names = sorted({x for r in rows for x in (r["artist"], r["rym_artist"], r["artist_latin"]) if x})
def sparql(q):
    for a in range(6):
        try:
            req = urllib.request.Request("https://query.wikidata.org/sparql", data=urllib.parse.urlencode({"query": q}).encode(),
                headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            return json.load(urllib.request.urlopen(req, timeout=120))["results"]["bindings"]
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(5 * (a + 1))
    return []
found = {}
for i in range(0, len(names), 150):
    vals = " ".join(json.dumps(n) + "@en" for n in names[i:i+150])
    q = f"""SELECT ?n ?site WHERE {{ VALUES ?n {{ {vals} }} ?p rdfs:label ?n .
      {{ ?p wdt:P31 wd:Q5 }} UNION {{ ?p wdt:P31/wdt:P279* wd:Q2088357 }} UNION {{ ?p wdt:P31 wd:Q215380 }} UNION {{ ?p wdt:P31 wd:Q5741069 }}
      ?a schema:about ?p; schema:isPartOf ?site . FILTER(?site IN (<https://en.wikipedia.org/>)) }}"""
    for b in sparql(q): found[b["n"]["value"]] = True
    time.sleep(0.5)
json.dump(found, open(OUT, "w")); print(len(names), len(found), file=sys.stderr)
