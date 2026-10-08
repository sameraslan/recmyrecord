"""Turn fetched sources into the packs the writer sees (packs/<id>.md), and the plain Wikipedia excerpt arm (out/excerpt/<id>.json).

usage: python3 make_packs.py sources/ packs/ out/excerpt/
"""
import json, os, sys

SRC, PACKS, EXC = sys.argv[1:4]
CAP = 4500  # words of article text per pack
SKIP = {"References", "External links", "Notes", "Sources", "Further reading", "See also", "Charts", "Certifications", "Release history",
        "Bibliography", "Citations", "Referencias", "Enlaces externos", "Referências", "Ligações externas", "Przypisy", "Linki zewnętrzne",
        "脚注", "出典", "外部リンク", "Lähteet", "Källor", "Externa länkar", "Notas", "Bibliografia", "Weekly charts", "Year-end charts", "Accolades"}
os.makedirs(PACKS, exist_ok=True); os.makedirs(EXC, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    r = json.load(open(os.path.join(SRC, f)))
    s = r["source"]
    lines = [f"ALBUM: {r['title']} by {r['artist']} ({r['year']})", ""]
    kind = "the artist's Wikipedia article (only the paragraphs that name this album)" if s.get("kind") == "artist_article" else "the album's Wikipedia article"
    lines.append(f"SOURCE: {kind}, {s.get('lang')} Wikipedia, \"{s.get('title')}\"" if s.get("title") else "SOURCE: no article found")
    lines.append("")
    if s.get("infobox"):
        lines.append("## Infobox")
        lines += [f"- {k}: {v}" for k, v in s["infobox"].items()]
        lines.append("")
    wdf = r["wikidata"]["facts"]
    if wdf:
        lines.append("## Wikidata")
        lines += [f"- {k}: {', '.join(v)}" for k, v in wdf.items()]
        lines.append("")
    used = 0
    for sec in [x for x in s.get("sections", []) if x["h"] not in SKIP]:
        if used >= CAP: break
        lines.append(f"## {sec['h']}")
        for t in sec["text"]:
            if used >= CAP: break
            lines.append(t); used += len(t.split())
        lines.append("")
    open(os.path.join(PACKS, r["id"] + ".md"), "w").write("\n".join(lines))
    json.dump(r, open(os.path.join(PACKS, r["id"] + ".json"), "w"), ensure_ascii=False)
    lead = next((sec["text"] for sec in s.get("sections", []) if sec["h"] == "Lead"), [])
    exc = []
    for t in lead:
        if sum(len(x.split()) for x in exc) > 120: break
        exc.append(t)
    json.dump({"id": r["id"], "lang": s.get("lang"), "title": s.get("title"), "kind": s.get("kind"), "paragraphs": exc if s.get("kind") != "artist_article" else []},
              open(os.path.join(EXC, r["id"] + ".json"), "w"), ensure_ascii=False, indent=1)
    print(r["id"], s.get("lang"), used, "words in pack")
