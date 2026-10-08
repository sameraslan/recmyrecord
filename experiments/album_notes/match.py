"""Match catalog albums to Wikidata items via RYM path, Spotify, Apple Music and Deezer IDs; record sitelinks."""
import csv, json, re, sys, time, urllib.parse, urllib.request
CAT, OUT = sys.argv[1], sys.argv[2]
UA = "recmyrecord-research/0.1 (https://github.com/sameraslan/recmyrecord)"
rows = list(csv.DictReader(open(CAT)))
def ids(r):
    out = {}
    m = re.search(r"rateyourmusic\.com/release/(.+?)/?$", r["rym_url"] or "")
    if m: out["P8392"] = m.group(1).strip("/")
    m = re.search(r"album/([A-Za-z0-9]{22})", r["spotify_url"] or "")
    if m: out["P2205"] = m.group(1)
    m = re.search(r"/(\d+)(\?|$)", r["apple_music_url"] or "")
    if m: out["P2281"] = m.group(1)
    m = re.search(r"album/(\d+)", r["deezer_url"] or "")
    if m: out["P2723"] = m.group(1)
    return out
keys = {r["rym_id"]: ids(r) for r in rows}
def sparql(q):
    for a in range(5):
        try:
            req = urllib.request.Request("https://query.wikidata.org/sparql", data=urllib.parse.urlencode({"query": q}).encode(),
                headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            return json.load(urllib.request.urlopen(req, timeout=120))["results"]["bindings"]
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(5 * (a + 1))
    raise SystemExit("failed")
item_of = {}  # rym_id -> set(qid)
for prop in ["P8392", "P2205", "P2281", "P2723"]:
    val2rym = {}
    for rid, k in keys.items():
        if prop in k: val2rym.setdefault(k[prop], []).append(rid)
    vals = list(val2rym)
    for i in range(0, len(vals), 400):
        chunk = " ".join(json.dumps(v) for v in vals[i:i+400])
        for b in sparql(f"SELECT ?v ?i WHERE {{ VALUES ?v {{ {chunk} }} ?i wdt:{prop} ?v }}"):
            q = b["i"]["value"].rsplit("/", 1)[1]
            for rid in val2rym[b["v"]["value"]]:
                item_of.setdefault(rid, {}).setdefault(q, []).append(prop)
        time.sleep(1)
    print(prop, len(vals), "matched albums so far", len(item_of), file=sys.stderr)
qids = sorted({q for d in item_of.values() for q in d})
info = {}
for i in range(0, len(qids), 300):
    chunk = " ".join("wd:" + q for q in qids[i:i+300])
    for b in sparql(f"""SELECT ?i ?site ?title WHERE {{ VALUES ?i {{ {chunk} }}
        OPTIONAL {{ ?a schema:about ?i; schema:isPartOf ?site; schema:name ?title . FILTER(CONTAINS(STR(?site), "wikipedia.org")) }} }}"""):
        q = b["i"]["value"].rsplit("/", 1)[1]
        d = info.setdefault(q, {})
        if "site" in b: d[b["site"]["value"]] = b["title"]["value"]
    time.sleep(1)
for i in range(0, len(qids), 300):
    chunk = " ".join("wd:" + q for q in qids[i:i+300])
    for b in sparql(f"""SELECT ?i (COUNT(DISTINCT ?p) AS ?n) WHERE {{ VALUES ?i {{ {chunk} }} ?i ?p ?o .
        VALUES ?p {{ wdt:P162 wdt:P264 wdt:P483 wdt:P577 wdt:P2047 wdt:P136 wdt:P166 wdt:P10135 wdt:P1191 wdt:P495 }} }} GROUP BY ?i"""):
        q = b["i"]["value"].rsplit("/", 1)[1]
        info.setdefault(q, {})["_nfacts"] = int(b["n"]["value"])
    time.sleep(1)
json.dump({"item_of": item_of, "info": info}, open(OUT, "w"))
