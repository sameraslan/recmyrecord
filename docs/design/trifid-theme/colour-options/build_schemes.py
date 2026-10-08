"""Build four colour schemes for the album map from descriptor meanings.

Run from this folder:
  OMP_NUM_THREADS=2 nice -n 10 ../../../../data-pipeline/.venv/bin/python build_schemes.py
Writes descriptor_meaning.csv, schemes.json, evaluation.json and preview_<scheme>_<palette>.png.
"""
import csv, json, sys
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter
from sklearn.neighbors import NearestNeighbors
from PIL import Image

HERE = Path(__file__).resolve().parent
WT = HERE.parents[3]
sys.path.insert(0, str(WT / "data-pipeline"))
sys.path.insert(0, str(HERE))
from rmr_pipeline.table import load_table, dedupe_table, descriptor_cols  # noqa: E402
from meaning import M  # noqa: E402

# ---------------------------------------------------------------- data
df, _ = dedupe_table(load_table())
dc = descriptor_cols(df)
albums = json.load(open(WT / "frontcreck/public/data/albums.json"))
N = len(albums)
assert len(df) == N and all(a["t"] == t for a, t in zip(albums[:50], df["Title"][:50]))
V = df[dc].astype(float).to_numpy()          # 0, or 0.52..1.5 by rank of the word on the album page
missing = [c for c in dc if c not in M]
assert not missing, missing
P = np.array(json.load(open(WT / "frontcreck/public/data/positions.json"))["balanced"]).reshape(-1, 2)
RG = json.load(open(WT / "docs/design/trifid-theme/regions/regions.json"))
AR = np.array([a or "" for a in RG["album_region"]])
REG = [(r["id"], r["name_space"]) for r in RG["regions"]]
CUR = json.load(open(WT / "docs/design/trifid-theme/regions/colour.json"))

val = np.array([M[c][0] for c in dc]); ene = np.array([M[c][1] for c in dc]); tem = np.array([M[c][2] for c in dc])
drv = np.array([M[c][5] for c in dc])

# sheet lookup for the meaning csv
sheet = {r["name"].lower(): r for r in csv.DictReader(open(HERE / "descriptors.csv"))}
with open(HERE / "descriptor_meaning.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["name", "albums", "on_site_vocab", "sheet_category", "sheet_path", "has_sheet_description", "kind",
                "valence_dark_to_bright", "energy_calm_to_intense", "warmth_cold_to_warm", "setting",
                "colour_drive", "s3_family", "s3_strength", "uncertain", "basis"])
    vocab = set(json.load(open(WT / "frontcreck/public/data/vocab.json")))
    for j in np.argsort(-(V > 0).sum(0)):
        c = dc[j]; m = M[c]; s = sheet.get(c.lower()) or sheet.get(c.lower().replace(" vocals", " vocalist"))
        basis = ("sheet description" if s and s["description"] else
                 "word meaning and RYM tree position (sheet row has no description)" if s else
                 "word meaning (not in sheet)")
        w.writerow([c, int((V[:, j] > 0).sum()), int(c in vocab), s["category"] if s else "", s["full_path"] if s else "",
                    int(bool(s and s["description"])), m[4], m[0], m[1], m[2], m[3], m[5], m[6], m[7], m[8], basis])

# ---------------------------------------------------------------- helpers
def wheel(xy, anchors_deg, r_ref):
    """Soft assignment by angle to the two nearest anchors; neutral share from low radius."""
    ang = np.degrees(np.arctan2(xy[:, 1], xy[:, 0])) % 360
    r = np.hypot(xy[:, 0], xy[:, 1])
    a = np.array(anchors_deg, float); K = len(a)
    W = np.zeros((len(xy), K))
    for i in range(K):
        j = (i + 1) % K
        span = (a[j] - a[i]) % 360
        d = (ang - a[i]) % 360
        m = d < span
        tt = d[m] / span
        tt = tt * tt * (3 - 2 * tt)          # smoothstep: a little more pure colour, still continuous
        W[m, i] += 1 - tt; W[m, j] += tt
    char = np.clip(r / r_ref, 0, 1)
    return np.hstack([W * char[:, None], (1 - char)[:, None]])

def pad(W):
    k = W.shape[1] - 1
    return np.hstack([W[:, :k], np.zeros((len(W), 6 - k)), W[:, -1:]])

def mood_plane(ax, ay, shrink, audio=None):
    """Weighted mean descriptor position, shrunk to the centre when evidence is thin."""
    w = V * drv
    den = w.sum(1) + shrink
    x = (w @ ax); y = (w @ ay)
    if audio is not None:
        x = x + audio[2] * audio[0]; y = y + audio[2] * audio[1]; den = den + audio[2]
    xy = np.c_[x / den, y / den]
    xy = xy - np.median(xy, 0)               # colour is relative to this catalogue
    return xy / xy.std(0)

def z(col):
    a = df[col].astype(float).to_numpy(); return np.clip((a - a.mean()) / a.std(), -2.5, 2.5)

# ---------------------------------------------------------------- S1 current
S1 = np.array(CUR["album_weights"], float)

# ---------------------------------------------------------------- S2 mood wheel (valence x energy)
aud = (z("valence") / 2.5, (z("energy") + z("loudness") - z("acousticness")) / 3 / 1.5, 3.0)
xy2 = mood_plane(val, ene, shrink=1.5, audio=aud)
A2 = [15, 75, 135, 190, 245, 310]
C2 = ["bright", "exuberant", "fierce", "tense", "sombre", "serene"]
S2 = wheel(xy2, A2, r_ref=np.percentile(np.hypot(*xy2.T), 45))

# ---------------------------------------------------------------- S3 hand-built families
C3 = ["fierce", "joyful", "tender", "dark", "dreamy", "nocturnal"]
F = np.zeros((len(dc), 6))
for j, c in enumerate(dc):
    if M[c][6]:
        F[j, C3.index(M[c][6])] = M[c][7]
GAIN3 = np.array([1.0, 1.0, 0.9, 0.9, 1.2, 1.7])   # lift the two small families so each leads at least 5% of albums
if len(sys.argv) > 1: GAIN3 = np.array([float(x) for x in sys.argv[1].split(",")])
sc = (V @ F) * GAIN3
tot = sc.sum(1)
sh = sc / np.maximum(tot[:, None], 1e-9)
sh = sh ** 2.0; sh = sh / np.maximum(sh.sum(1, keepdims=True), 1e-9)   # mild sharpening so blends stay coloured
char = np.clip(tot / np.percentile(tot, 25), 0, 1) * np.clip((sh.max(1) - 0.25) / 0.2, 0, 1)
S3 = np.hstack([sh * char[:, None], (1 - char)[:, None]])

# ---------------------------------------------------------------- S4 temperature x depth
xy4 = mood_plane(tem, val, shrink=1.5)
A4 = [40, 100, 160, 225, 310]   # warmth and brightness are correlated (r = 0.68), so amber sits on the warm-bright diagonal
C4 = ["amber", "cream", "teal", "deep blue", "dusty rose"]
S4 = wheel(xy4, A4, r_ref=np.percentile(np.hypot(*xy4.T), 45))

# ---------------------------------------------------------------- palettes
def hx(s): return [int(s[i:i + 2], 16) for i in (1, 3, 5)]
SCHEMES = [
 dict(id="s1", name="Current five families", channels=["fierce", "warm", "quiet", "dark", "urban"], W=S1,
      hot=[0], warmch=[1], palettes=[
        dict(id="current", hues=[hx("#d9627a"), hx("#e2b45c"), hx("#4fb3a5"), hx("#6f9bd8"), hx("#a884d6")], neutral=hx("#8a8580")),
        dict(id="emission", hues=[[255, 62, 98], [255, 176, 46], [36, 214, 186], [58, 120, 255], [178, 84, 255]], neutral=[120, 110, 105]),
        dict(id="dusty", hues=[[200, 100, 118], [208, 164, 92], [84, 160, 148], [98, 130, 192], [150, 116, 190]], neutral=[128, 120, 112])]),
 dict(id="s2", name="Mood wheel", channels=C2, W=S2, hot=[2], warmch=[0, 1], palettes=[
        dict(id="emission", hues=[[255, 200, 60], [255, 128, 48], [255, 48, 88], [190, 70, 255], [50, 110, 255], [30, 220, 190]], neutral=[120, 110, 105]),
        dict(id="dusty", hues=[[212, 176, 100], [212, 136, 92], [200, 96, 112], [150, 112, 186], [96, 128, 192], [88, 164, 152]], neutral=[128, 120, 112])]),
 dict(id="s3", name="Descriptor families", channels=C3, W=S3, hot=[0], warmch=[1], palettes=[
        dict(id="emission", hues=[[255, 72, 40], [255, 196, 50], [255, 110, 170], [40, 90, 255], [60, 225, 215], [160, 80, 255]], neutral=[120, 110, 105]),
        dict(id="dusty", hues=[[204, 104, 84], [214, 176, 100], [208, 132, 156], [84, 112, 184], [112, 180, 184], [142, 112, 190]], neutral=[128, 120, 112])]),
 dict(id="s4", name="Temperature and depth", channels=C4, W=S4, hot=[], warmch=[0, 1], palettes=[
        dict(id="emission", hues=[[255, 160, 40], [255, 236, 190], [40, 205, 200], [40, 90, 240], [240, 80, 110]], neutral=[120, 110, 105]),
        dict(id="dusty", hues=[[208, 150, 84], [226, 208, 176], [84, 156, 158], [64, 96, 168], [188, 108, 120]], neutral=[128, 120, 112])]),
]

# ---------------------------------------------------------------- evaluation
nn = NearestNeighbors(n_neighbors=16).fit(P); _, NB = nn.kneighbors(P); NB = NB[:, 1:]
rng = np.random.default_rng(0); RND = rng.integers(0, N, size=(N, 15))
# what each region name demands, in descriptor-meaning terms: (must not be hot, must be hot, must be warm/bright)
NOT_HOT = ["sombre", "lonely", "quiet", "ethereal", "pastoral", "hypnotic", "improv"]
MUST_HOT = ["aggressive", "raw"]
MUST_WARM = ["warm", "playful"]

def guard_pairs(hues):
    H = np.array(hues, float); out = []
    for i in range(len(H)):
        for j in range(i + 1, len(H)):
            mid = (H[i] + H[j]) / 2
            for k in range(len(H)):
                if k in (i, j): continue
                dk = np.linalg.norm(mid - H[k])
                if dk < 60 and dk < min(np.linalg.norm(mid - H[i]), np.linalg.norm(mid - H[j])):
                    out.append([i, j, k])
    return out

def evaluate(s):
    W = s["W"]; K = len(s["channels"]); ch = W[:, :K]; neu = W[:, -1]
    lead = ch.argmax(1)
    coloured = neu < 0.5
    lead_share = [float(((lead == k) & coloured).sum() / N) for k in range(K)]
    agree = float((lead[NB] == lead[:, None]).mean())
    chance = float(sum(np.mean(lead == k) ** 2 for k in range(K)))
    Wn = W / np.maximum(np.linalg.norm(W, axis=1, keepdims=True), 1e-9)
    cos_nb = float(np.einsum("ij,ikj->ik", Wn, Wn[NB]).mean())
    cos_rnd = float(np.einsum("ij,ikj->ik", Wn, Wn[RND]).mean())
    G = 0.5 * W + 0.5 * W[NB].mean(1)        # what the gas sees: album averaged with its 15 neighbours
    purity = float((G[:, :K].max(1) / np.maximum(G[:, :K].sum(1), 1e-9)).mean())
    regs = {}; flags = []
    for rid, name in REG:
        mk = AR == rid
        m = ch[mk].sum(0) / max(ch[mk].sum(), 1e-9); o = np.argsort(-m)
        regs[rid] = dict(name=name, lead=s["channels"][o[0]], share=round(float(m[o[0]]), 2),
                         second=s["channels"][o[1]], second_share=round(float(m[o[1]]), 2), neutral=round(float(neu[mk].mean()), 2),
                         mix={c: round(float(x), 2) for c, x in zip(s["channels"], m)})
        if rid in NOT_HOT and o[0] in s["hot"]: flags.append(f"{name} leads {s['channels'][o[0]]} (should not be hot)")
        if rid in MUST_HOT and s["hot"] and o[0] not in s["hot"]: flags.append(f"{name} leads {s['channels'][o[0]]} (should be hot)")
        if rid in MUST_WARM and o[0] not in s["warmch"]: flags.append(f"{name} leads {s['channels'][o[0]]} (should be warm or bright)")
    ev = dict(lead_share={c: round(x, 3) for c, x in zip(s["channels"], lead_share)},
              neutral_led=round(float((~coloured).mean()), 3), mean_neutral=round(float(neu.mean()), 3),
              knn15_same_lead=round(agree, 3), knn15_same_lead_chance=round(chance, 3),
              cos_neighbours=round(cos_nb, 3), cos_random_pairs=round(cos_rnd, 3), gas_purity=round(purity, 3), regions=regs, contradictions=flags, palettes={})
    for p in s["palettes"]:
        H = np.vstack([np.array(p["hues"], float), np.array(p["neutral"], float)])
        col = np.hstack([ch, neu[:, None]]) @ H
        dn = np.linalg.norm(col[NB] - col[:, None], axis=2).mean(); dr = np.linalg.norm(col[RND] - col[:, None], axis=2).mean()
        ev["palettes"][p["id"]] = dict(rgb_dist_neighbours=round(float(dn), 1), rgb_dist_random=round(float(dr), 1),
                                       ratio=round(float(dn / dr), 3), blend_passes_through=guard_pairs(p["hues"]))
    return ev

def preview(s, p, path, size=1200, sigma=7.0):
    W = s["W"]; K = len(s["channels"])
    H = np.vstack([np.array(p["hues"], float), np.array(p["neutral"], float) * 0.55])
    col = np.hstack([W[:, :K], W[:, -1:]]) @ H
    lo = P.min(0); hi = P.max(0); span = (hi - lo).max(); m = 50
    px = ((P - (lo + hi) / 2) / span * (size - 2 * m) + size / 2)
    ix = np.clip(px[:, 0].astype(int), 0, size - 1); iy = np.clip(px[:, 1].astype(int), 0, size - 1)
    acc = np.zeros((size, size, 3)); den = np.zeros((size, size))
    np.add.at(acc, (iy, ix), col); np.add.at(den, (iy, ix), 1.0)
    img = np.zeros((size, size, 3))
    for sg, gain in ((sigma, 1.0), (sigma * 3.5, 0.6)):          # tight dots plus a wide haze
        a = np.stack([gaussian_filter(acc[..., c], sg) for c in range(3)], -1); d = gaussian_filter(den, sg)
        mean = a / np.maximum(d[..., None], 1e-12)
        b = 1 - np.exp(-d / np.percentile(d[d > 1e-9], 85) * 1.6)
        img += gain * mean * b[..., None]
    img = 255 * (1 - np.exp(-img / 255 * 1.3))
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path)

EV = {}
for s in SCHEMES:
    ev = evaluate(s); EV[s["id"]] = ev
    print(f"\n== {s['id']} {s['name']}")
    print(" lead share", ev["lead_share"], "neutral-led", ev["neutral_led"], "mean neutral", ev["mean_neutral"])
    print(" knn same lead", ev["knn15_same_lead"], "(chance", ev["knn15_same_lead_chance"], ") cos nb", ev["cos_neighbours"], "cos rnd", ev["cos_random_pairs"], "gas purity", ev["gas_purity"])
    for rid, r in ev["regions"].items():
        print(f"  {r['name']:22s} {r['lead']:10s} {r['share']:.2f}  {r['second']:10s} {r['second_share']:.2f}  neu {r['neutral']:.2f}")
    print(" contradictions:", ev["contradictions"] or "none")
    for p in s["palettes"]:
        print("  palette", p["id"], ev["palettes"][p["id"]])
        preview(s, p, HERE / f"preview_{s['id']}_{p['id']}.png")

GUARD = {"s1": [[0, 3]], "s2": [], "s3": [[0, 3], [2, 3]], "s4": []}
out = {"schemes": []}
for s in SCHEMES:
    W = np.round(pad(s["W"]), 2)
    out["schemes"].append(dict(id=s["id"], name=s["name"], channels=s["channels"],
                               palettes=s["palettes"], guard_pairs=GUARD[s["id"]],
                               weights=[float(x) for x in W.ravel()]))
json.dump(out, open(HERE / "schemes.json", "w"), separators=(",", ":"))
json.dump(EV, open(HERE / "evaluation.json", "w"), indent=1)
print("\nwrote schemes.json", (HERE / "schemes.json").stat().st_size, "bytes")
