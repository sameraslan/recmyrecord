"""Per-album coverage table and summary by rank band, from the Wikidata matches (match.py, match_labels.py) and the
artist lookup (artists.py)."""
import collections, csv, json, sys
CAT, WD, ART, OUT_CSV = sys.argv[1:5]
rows = list(csv.DictReader(open(CAT))); d = json.load(open(WD)); art = json.load(open(ART))
out = []
for r in rows:
    qs = d["item_of"].get(r["rym_id"], {})
    sites = {}
    for q in qs:
        for s, t in d["info"].get(q, {}).items():
            if s.startswith("https://"): sites.setdefault(s.split("//")[1].split(".")[0], t)
    artist_en = any(x in art for x in (r["artist"], r["rym_artist"], r["artist_latin"]))
    status = "en" if "en" in sites else "other" if sites else "artist_only" if artist_en else "none"
    out.append({"rym_id": r["rym_id"], "rank": r["rank"] if r["on_chart"] == "1" else "", "artist": r["artist"], "title": r["title"], "year": r["year"],
                "status": status, "wikidata": " ".join(sorted(qs)), "matched_by": " ".join(sorted({m for v in qs.values() for m in v})),
                "en_title": sites.get("en", ""), "other_wikis": " ".join(sorted(k for k in sites if k != "en")), "artist_en_article": int(artist_en)})
with open(OUT_CSV, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
def band(x):
    if not x["rank"]: return "off chart"
    k = int(x["rank"])
    return "1 to 1,000" if k <= 1000 else "1,001 to 2,500" if k <= 2500 else "2,501 to 5,000" if k <= 5000 else "5,001 to 10,000"
tab = collections.defaultdict(collections.Counter)
for x in out: tab[band(x)][x["status"]] += 1; tab["all"][x["status"]] += 1
order = ["1 to 1,000", "1,001 to 2,500", "2,501 to 5,000", "5,001 to 10,000", "off chart", "all"]
print("| Rank band | Albums | English article | Other language only | Artist article only | Nothing found |\n|---|---:|---:|---:|---:|---:|")
for b in order:
    c = tab[b]; n = sum(c.values())
    print(f"| {b} | {n:,} | " + " | ".join(f"{c[k]:,} ({100*c[k]/n:.0f}%)" for k in ["en", "other", "artist_only", "none"]) + " |")
json.dump({b: dict(tab[b]) for b in order}, open(OUT_CSV.replace(".csv", "_bands.json"), "w"))
