"""Build the rating page's data: for each trial album, version "excerpt" (the plain Wikipedia opening, or the empty-state
line when there is no album article) and version "notes" (the frozen prompt's output), shown blind as A and B in a
fixed order per album.

usage: python3 build_rating_data.py albums.json out/excerpt out/haiku_v3 packs rating_data.json
"""
import hashlib, json, os, sys

ALBUMS, EXC, NOTES, PACKS, OUT = sys.argv[1:6]
EMPTY = "Not much has been written about this one yet, so you get to hear it with fresh ears. :)"
albums = json.load(open(ALBUMS))
rows = []
for a in albums:
    npath = os.path.join(NOTES, a["id"] + ".json")
    if not os.path.exists(npath):
        continue
    note = json.load(open(npath))
    if note.get("tier") == "none":
        continue  # nothing to compare: both versions would be the empty line
    exc = json.load(open(os.path.join(EXC, a["id"] + ".json")))
    pack = json.load(open(os.path.join(PACKS, a["id"] + ".json")))
    src = pack["source"]
    excerpt = {"kind": "excerpt", "lang": exc.get("lang"), "paragraphs": exc["paragraphs"]} if exc["paragraphs"] else {"kind": "empty", "paragraphs": [EMPTY]}
    notes = {"kind": "notes", "hook": note["hook"]["text"], "facts": note.get("facts", []),
             "sections": [{"heading": s["heading"], "text": " ".join(x["text"] for x in s["sentences"])} for s in note.get("sections", [])],
             "listen": [{"track": x["track"], "text": x["text"]} for x in note.get("listen_for", [])]}
    flip = int(hashlib.sha256(a["id"].encode()).hexdigest(), 16) % 2 == 1
    rows.append({"id": a["id"], "artist": a["artist"], "title": a["title"], "year": a["year"], "split": a["split"],
                 "source": {"lang": src.get("lang"), "title": src.get("title"), "url": src.get("url"), "revid": src.get("revid"), "kind": src.get("kind")},
                 "A": notes if flip else excerpt, "B": excerpt if flip else notes})
json.dump(rows, open(OUT, "w"), ensure_ascii=False, indent=1)
print(len(rows), "albums for rating")
