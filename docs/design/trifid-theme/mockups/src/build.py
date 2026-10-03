#!/usr/bin/env python3
# usage: build.py <concept-stem> <seed-index|title> <mode: album|overview> <out.html>
import json, math, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.abspath(HERE + '/../..')  # docs/design/trifid-theme
REPO = os.path.abspath(HERE + '/../../../../../frontcreck/public/data') + '/'
stem, seed, mode, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
a = json.load(open(REPO + 'albums.json'))
p = json.load(open(REPO + 'positions.json'))['balanced']
r = json.load(open(REPO + 'recs.json'))['balanced']
v = json.load(open(REPO + 'vocab.json'))
RG = json.load(open(SCR + '/regions/regions.json'))
COL = json.load(open(SCR + '/regions/colour.json'))
n = len(a)
seed = int(seed) if seed.isdigit() else next(i for i, x in enumerate(a) if x['t'] == seed)
P = [(p[2 * i], p[2 * i + 1]) for i in range(n)]
NREC = 7
recs = r[seed][:NREC]
def info(i):
    return {'i': i, 't': a[i]['t'], 'a': a[i]['a'], 'w': a[i]['w']}
sd = info(seed); sd['tags'] = [v[x] for x in a[seed]['d'][:6]]
rc = []
for j in recs:
    x = info(j)
    x['sh'] = [v[w] for w in a[seed]['d'] if w in a[j]['d']][:3]
    rc.append(x)
ids = [seed] + recs
xs = [P[j][0] for j in ids]; ys = [P[j][1] for j in ids]
if mode == 'album':
    W, H, PANEL, HDR = 1600, 1000, 660, 64
    s = min(600 / (max(xs) - min(xs)), 520 / (max(ys) - min(ys)))
    s = max(700, min(1150, s))
    view = {'x': (max(xs) + min(xs)) / 2, 'y': (max(ys) + min(ys)) / 2 - 20 / s, 's': s}
else:
    W, H, PANEL, HDR = 1600, 1000, 0, 64
    sx = sorted(q[0] for q in P); sy = sorted(q[1] for q in P)
    lo, hi = int(n * .003), int(n * .997)
    # fit to width; top and bottom run off the screen (the user pans)
    view = {'x': -0.17, 'y': 0.2, 's': 930}
# regions: hue order = angle on the energy/valence mood wheel (audio z-scores), spread over a sky palette
HUE = {'warm': 46, 'urban': 36, 'playful': 25, 'eclectic': 17, 'raw': 8, 'live': 358, 'epic': 349, 'aggressive': 338,
       'sombre': 266, 'hypnotic': 244, 'progressive': 226, 'ethereal': 206, 'quiet': 189, 'lonely': 171, 'pastoral': 148,
       'improv': 96, 'bittersweet': 60}
order = sorted(RG['regions'], key=lambda q: math.degrees(math.atan2(q['audio']['energy'], q['audio']['valence'])) % 360)
hs = [HUE[q['id']] for q in order]
assert all((hs[i] - hs[i + 1]) % 360 < 90 for i in range(len(hs) - 1)), 'hue order must follow the mood-wheel order'
regs = []
for q in RG['regions']:
    e = q['name_evidence']
    if 'word' in e:
        ev = f"{round(e['coverage'] * 100)}% of albums here are tagged {e['word']}, against {round(e['overall'] * 100)}% across the map."
    elif e['feature'] == 'liveness':
        ev = 'Concert recordings: far more crowd and room sound than anywhere else on the map.'
    else:
        ev = 'The quietest corner of the map: far lower loudness than anywhere else.'
    regs.append({'id': q['id'], 'name': q['name_space'], 'plain': q['label_plain'], 'strong': q['strength'] == 'strong',
                 'cx': q['cx'], 'cy': q['cy'], 'r': q['radius'], 'n': q['n'], 'ev': ev, 'hue': HUE[q['id']],
                 'fw': [COL['region_family'][q['id']]['weights'][f] for f in COL['family_order'][:5]] + [COL['region_family'][q['id']]['mean_neutral']], 'en': q['audio']['energy'], 'ac': q['audio']['acousticness'], 'va': q['audio']['valence']})
rix = {q['id']: i for i, q in enumerate(regs)}
ar = [rix[x] if x is not None else -1 for x in RG['album_region']]
# mood families from the handpicked words: fierce / cold-quiet / warm-bright
FAM = {'fire': {'energetic': .5, 'heavy': 1, 'raw': 1, 'aggressive': 1, 'angry': 1, 'noisy': 1, 'manic': 1, 'chaotic': 1, 'infernal': 1,
                'apocalyptic': 1, 'dissonant': .7, 'scary': .7, 'disturbing': .7, 'martial': .7, 'dense': .5, 'anxious': .4},
       'cold': {'atmospheric': .8, 'melancholic': .7, 'dark': .4, 'nocturnal': .8, 'sombre': 1, 'lonely': 1, 'cold': 1, 'ethereal': 1,
                'depressive': 1, 'calm': 1, 'soft': .7, 'sad': 1, 'winter': 1, 'sparse': 1, 'meditative': 1, 'peaceful': .8, 'soothing': .7,
                'minimalistic': .8, 'space': 1, 'funereal': 1, 'mysterious': .7, 'ominous': .5, 'rain': 1, 'aquatic': 1, 'lethargic': .8,
                'suspenseful': .7, 'hypnotic': .5},
       'gold': {'warm': 1, 'playful': 1, 'uplifting': 1, 'romantic': .8, 'summer': 1, 'sentimental': .7, 'bittersweet': .5, 'happy': 1,
                'party': 1, 'tropical': 1, 'sensual': .8, 'lush': .5, 'quirky': .7, 'triumphant': .8, 'spring': 1, 'mellow': .5,
                'rhythmic': .4, 'pastoral': .7, 'autumn': .6, 'passionate': .3, 'anthemic': .5}}
fam = []
for x in a:
    s = [sum(FAM[f].get(v[w], 0) for w in x['d']) for f in ('fire', 'cold', 'gold')]
    tot = sum(s)
    fam += [round(q / tot, 2) if tot else 0 for q in s]
trail = [a[r[recs[3]][2]]['t'], a[recs[1]]['t']]
D = {'mode': mode, 'W': W, 'H': H, 'PANEL': PANEL, 'HDR': HDR, 'view': view,
     'p': [round(x, 4) for x in p], 'acc': [x['w'][2] for x in a],
     'seed': sd, 'recs': rc, 'trail': trail, 'atlas': 'file://' + REPO,
     'regions': regs, 'ar': ar, 'cw': [x for w in COL['album_weights_balanced_smoothed'] for x in w], 'caption': COL['caption'], 't': {i: [a[i]['t'], a[i]['a']] for i in range(400)}}
tpl = open(HERE + '/template.html').read()
html = (tpl.replace('/*CSS*/', open(f'{HERE}/common.css').read() + open(f'{HERE}/{stem}.css').read())
           .replace('/*JS*/', open(f'{HERE}/common.js').read() + open(f'{HERE}/{stem}.js').read())
           .replace('/*DATA*/', json.dumps(D, separators=(',', ':'), ensure_ascii=False)))
open(out, 'w').write(html)
print(out, len(html) // 1024, 'KB', 'view', {k: round(x, 3) for k, x in view.items()}, sd['t'], [x['t'] for x in rc])
