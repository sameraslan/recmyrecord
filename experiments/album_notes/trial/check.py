"""Automatic checks on generated notes: lengths, banned words, dashes, sources cited, and copying from the source.

usage: python3 check.py packs/ out/<arm>/   (prints one line per album and a summary)
"""
import json, os, re, sys

PACKS, OUT = sys.argv[1:3]
BANNED = ["acclaim", "critic", "ranked", "best of", "greatest", "masterpiece", "seminal", "iconic", "legendary", "landmark", "classic",
          "groundbreaking", "influential", "essential", "haunting", "lush", "stunning", "gorgeous", "tapestry", "sonic journey",
          "soundscape", "timeless", "must-hear", "chart", "sold", "sales", "certified", "award", "grammy", "review", "praised", "notable", "noteworthy", "remarkable"]
DASH = re.compile(r"[–—]|\s-\s")
WORD = re.compile(r"[\w']+")


def ngrams(words, n):
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


def longest_copy(text, src_words, src_sets):
    # names and titles (capitalised words, numbers) may repeat the source; mask them so only shared phrasing counts
    raw = WORD.findall(text)
    w = [("\0" if (i and (x[0].isupper() or x[0].isdigit())) else x.lower()) for i, x in enumerate(raw)]
    best = 0
    for n in range(6, 30):
        grams = {g for g in ngrams(w, n) if g.count("\0") <= n // 4}
        grams = {tuple(x for x in g) for g in grams}
        hits = {g for g in ngrams([x.lower() for x in raw], n) if g in src_sets.setdefault(n, ngrams(src_words, n))}
        masked = {tuple(w[i:i + n]) for i in range(len(w) - n + 1) if tuple(x.lower() for x in raw[i:i + n]) in hits}
        if not (masked & grams): break
        best = n
    return best


def sentences(note):
    if note.get("hook", {}).get("text"): yield "hook", note["hook"]
    for s in note.get("sections", []):
        for x in s.get("sentences", []): yield s.get("heading", "?"), x
    for x in note.get("listen_for", []): yield "listen:" + x.get("track", "?"), x


tot = {"albums": 0, "sentences": 0, "flags": 0}
for f in sorted(os.listdir(OUT)):
    if not f.endswith(".json") or f.endswith(".verify.json"): continue
    aid = f[:-5]
    pack = json.load(open(os.path.join(PACKS, aid + ".json")))
    heads = {s["h"] for s in pack["source"].get("sections", [])} | {"Infobox", "Wikidata"}
    src_words = [x.lower() for s in pack["source"].get("sections", []) for t in s["text"] for x in WORD.findall(t)]
    sets = {}
    try:
        note = json.load(open(os.path.join(OUT, f)))
    except Exception as e:
        print(aid, "INVALID JSON", e); tot["flags"] += 1; continue
    flags = []
    hook = note.get("hook", {}).get("text", "")
    if note.get("tier") != "none" and not (80 <= len(hook) <= 130): flags.append(f"hook length {len(hook)}")
    n = 0
    for where, s in sentences(note):
        n += 1
        t = s.get("text", "")
        low = t.lower()
        for b in BANNED:
            if re.search(r"\b" + re.escape(b), low): flags.append(f"{where}: banned '{b}'")
        if DASH.search(t): flags.append(f"{where}: dash")
        if "!" in t: flags.append(f"{where}: exclamation")
        bad = [h for h in s.get("src", []) if h not in heads]
        if not s.get("src"): flags.append(f"{where}: no src")
        elif bad: flags.append(f"{where}: unknown src {bad}")
        c = longest_copy(t, src_words, sets)
        if c >= 8: flags.append(f"{where}: copies {c} words")
    for sec in note.get("sections", []):
        wc = sum(len(x.get("text", "").split()) for x in sec.get("sentences", []))
        if wc > 140: flags.append(f"section '{sec.get('heading')}' {wc} words")
    words = sum(len(t.get("text", "").split()) for _, t in sentences(note))
    tot["albums"] += 1; tot["sentences"] += n; tot["flags"] += len(flags)
    print(f"{aid} tier={note.get('tier')} hook={len(hook)}c sentences={n} words={words} flags={len(flags)}" + ("".join("\n    " + x for x in flags)))
print("summary", tot)
