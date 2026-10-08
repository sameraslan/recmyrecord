"""Fetch the sources for the trial albums: the Wikipedia article (album, or the artist's article for albums without one)
and the album's Wikidata facts.

Wikipedia's own APIs throttled the cloud container this ran in, so articles come from the Internet Archive's latest
snapshot of the article page (the same text and licence, CC BY-SA 4.0). The revision id is read from the page. A real
build should fetch from Wikipedia directly.

usage: python3 fetch_sources.py albums.json wd2.json sources/
"""
import gzip, json, os, re, sys, time, urllib.parse, urllib.request
from bs4 import BeautifulSoup

ALBUMS, WD, OUT = sys.argv[1:4]
UA = "recmyrecord-research/0.1 (https://github.com/sameraslan/recmyrecord)"
os.makedirs(OUT, exist_ok=True)


def get(url, accept=None, tries=4):
    for a in range(tries):
        try:
            h = {"User-Agent": UA}
            if accept: h["Accept"] = accept
            r = urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=90)
            b = r.read()
            return gzip.decompress(b) if r.headers.get("Content-Encoding") == "gzip" or b[:2] == b"\x1f\x8b" else b
        except Exception as e:
            print("retry", url[:90], e, file=sys.stderr, flush=True); time.sleep(6 * (a + 1))
    return None


WDQS_OK = [True]


def sparql(q):
    if not WDQS_OK[0]: return []
    raw = get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q}), "application/sparql-results+json", tries=2)
    if raw is None:
        WDQS_OK[0] = False  # throttled: skip Wikidata from here on (the infobox has the same facts)
        print("Wikidata Query Service unavailable; continuing without it", file=sys.stderr, flush=True)
        return []
    return json.loads(raw)["results"]["bindings"]


CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "html")
os.makedirs(CACHE, exist_ok=True)


def wayback(lang, title):
    url = f"https://{lang}.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
    path = os.path.join(CACHE, urllib.parse.quote(f"{lang}:{title}", safe="") + ".html")
    if os.path.exists(path):
        return url, open(path, encoding="utf-8").read()
    raw = get("https://web.archive.org/web/2026id_/" + url)
    html = raw.decode("utf-8", "replace") if raw else None
    if html and "wgRevisionId" in html:
        open(path, "w", encoding="utf-8").write(html)
    return url, html




def parse(html):
    soup = BeautifulSoup(html, "lxml")
    m = re.search(r'"wgRevisionId":(\d+)', html)
    rev = int(m.group(1)) if m else None
    body = soup.select_one("#mw-content-text .mw-parser-output") or soup
    info = {}
    box = body.select_one("table.infobox")
    if box:
        for tr in box.select("tr"):
            th, td = tr.find("th"), tr.find("td")
            if th and td:
                for s in td.select("sup, style"): s.decompose()
                info[th.get_text(" ", strip=True)] = re.sub(r"\s+", " ", td.get_text(" ", strip=True))
    # track listings are tables: keep them as numbered lines before the tables go
    for tl in body.select("table.tracklist"):
        rows = []
        for tr in tl.select("tr"):
            cells = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)) for c in tr.find_all(["th", "td"])]
            if len(cells) >= 2 and re.match(r"^\d+\.?$", cells[0]):
                rows.append(f"{cells[0].rstrip('.')}. {cells[1]}")
        if rows:
            p_ = soup.new_tag("p"); p_.string = "Tracks: " + "; ".join(rows); tl.replace_with(p_)
    for el in body.select("table, sup.reference, style, .mw-editsection, figure, .thumb, .navbox, .reflist, .hatnote, .mw-empty-elt, ol.references"):
        el.decompose()
    for ul in body.find_all(["ul", "ol"]):
        items = [re.sub(r"\s+", " ", li.get_text(" ", strip=True)) for li in ul.find_all("li", recursive=False)]
        if items:
            p_ = soup.new_tag("p"); p_.string = "; ".join(items); ul.replace_with(p_)
    sections, cur = [], {"h": "Lead", "text": []}
    for el in body.find_all(["h2", "h3", "p", "dl", "div"], recursive=True):
        if el.name == "div" and "mw-heading" not in (el.get("class") or []):
            continue
        if el.name == "div" or el.name in ("h2", "h3"):
            h = el.find(["h2", "h3"]) if el.name == "div" else el
            if h is None: continue
            if cur["text"]: sections.append(cur)
            cur = {"h": h.get_text(" ", strip=True), "text": []}
            continue
        if el.find_parent(["table"]): continue
        t = re.sub(r"\s+", " ", el.get_text(" ", strip=True))
        t = re.sub(r"\s+([.,;:!?)])", r"\1", t)
        if t and not any(t in x for x in cur["text"]): cur["text"].append(t)
    if cur["text"]: sections.append(cur)
    return rev, info, sections


def norm(t):
    return re.sub(r"[^\w]+", " ", t.lower()).strip()


def facts(qid):
    props = {"P577": "released", "P264": "label", "P162": "producer", "P483": "recorded_at", "P10135": "recording_date",
             "P175": "performer", "P495": "country", "P407": "language"}
    out = {}
    vals = " ".join("wdt:" + p for p in props)
    for b in sparql(f"""SELECT ?p ?v ?vLabel WHERE {{ VALUES ?p {{ {vals} }} wd:{qid} ?p ?v .
                        SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,mul,es,pt,ja,pl,fi,sv,it,fr,de". }} }}"""):
        k = props[b["p"]["value"].rsplit("/", 1)[1]]
        v = b.get("vLabel", b["v"])["value"]
        if k == "released": v = v[:10]
        out.setdefault(k, [])
        if v not in out[k]: out[k].append(v)
    return out


def artist_article(names):
    vals = " ".join(json.dumps(n) + "@en" for n in names if n)
    for b in sparql(f"""SELECT ?p ?t WHERE {{ VALUES ?n {{ {vals} }} ?p rdfs:label ?n .
        ?p wdt:P31 ?c . VALUES ?c {{ wd:Q5 wd:Q215380 wd:Q5741069 wd:Q2088357 wd:Q105543609 }}
        ?a schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t . }} LIMIT 1"""):
        return b["t"]["value"]
    return None


albums = json.load(open(ALBUMS))
wd = json.load(open(WD))
for a in albums:
    path = os.path.join(OUT, a["id"] + ".json")
    if os.path.exists(path) and json.load(open(path))["source"].get("revid"): continue
    rec = {"id": a["id"], "rym_id": a["rym_id"], "artist": a["artist"], "title": a["title"], "year": a["year"], "kind": a["kind"]}
    qid = (a["wikidata"] or "").split()[0] if a["wikidata"] else None
    rec["wikidata"] = {"qid": qid, "facts": facts(qid) if qid else {}}
    if a["kind"] == "en":
        lang, title = "en", a["en_title"]
    elif a["kind"] == "other":
        sites = {s.split("//")[1].split(".")[0]: t for s, t in wd["info"].get(qid, {}).items() if s.startswith("https://")}
        lang = next(l for l in ["es", "pt", "ja", "it", "fr", "de", "pl", "sv", "fi", "ru"] + sorted(sites) if l in sites)
        title = sites[lang]
    else:
        lang, title = "en", artist_article([a["artist"], a["artist_latin"]])
        if not title:  # Wikidata unavailable: try the likely article titles through the archive
            for name in [n for n in (a["artist_latin"], a["artist"]) if n]:
                for cand in (name, name + " (band)", name + " (musician)"):
                    _, html = wayback("en", cand)
                    if html and norm(a["title_latin"] or a["title"]) in norm(BeautifulSoup(html, "lxml").get_text(" ")):
                        title = cand; break
                if title: break
    rec["source"] = {"kind": "artist_article" if a["kind"] == "artist" else "album_article", "lang": lang, "title": title}
    if title:
        url, html = wayback(lang, title)
        if html:
            rev, info, sections = parse(html)
            if a["kind"] == "artist":
                keys = [k for k in {a["title"], a["title_latin"]} if k and len(k) > 3]
                sections = [{"h": s["h"], "text": [t for t in s["text"] if any(norm(k) in norm(t) for k in keys)]} for s in sections]
                sections = [s for s in sections if s["text"]]
                info = {}
            rec["source"].update({"url": url, "revid": rev, "fetched_via": "web.archive.org latest 2026 snapshot", "infobox": info, "sections": sections,
                                  "words": sum(len(" ".join(s["text"]).split()) for s in sections)})
    json.dump(rec, open(path, "w"), ensure_ascii=False, indent=1)
    print(a["id"], a["kind"], lang, title, rec["source"].get("revid"), rec["source"].get("words"), flush=True)
    time.sleep(2)
