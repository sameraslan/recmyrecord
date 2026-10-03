#!/usr/bin/env python3
"""Inline the app data and the region / colour analysis into data/data.js (window.RMR_DATA).

The prototype must open from disk (file://), where fetch() of local JSON is blocked, so everything it
needs is written into one classic script. Python 3 standard library only.

    python3 docs/design/trifid-theme/prototype/build_data.py [--auto-balanced]

Sources (read only):
  frontcreck/public/data/{albums,vocab,positions,recs}.json
  docs/design/trifid-theme/regions/{regions,colour}.json        hand-made Balanced regions, family weights
  docs/design/trifid-theme/scaling/out/regions_all.json         optional: automated regions per stop
  docs/design/trifid-theme/colour-options/schemes.json          optional: colour schemes -> data/schemes.js

Sonic and Mood regions come from regions_all.json when it exists, otherwise they are empty lists.
Balanced uses the hand-made file unless --auto-balanced is passed (and regions_all.json has it).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
THEME = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(THEME, '..', '..', '..'))
APP = os.path.join(REPO, 'frontcreck', 'public', 'data')
STOPS = ('sonic', 'balanced', 'mood')
AUTO_BALANCED = '--auto-balanced' in sys.argv


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


albums = load(os.path.join(APP, 'albums.json'))
vocab = load(os.path.join(APP, 'vocab.json'))
positions = load(os.path.join(APP, 'positions.json'))
recs = load(os.path.join(APP, 'recs.json'))
hand = load(os.path.join(THEME, 'regions', 'regions.json'))
colour = load(os.path.join(THEME, 'regions', 'colour.json'))
N = len(albums)
weights = colour['album_weights']  # N x 6: fierce, warm, quiet, dark, urban, neutral
assert len(weights) == N and colour['family_order'][:5] == ['fierce', 'warm', 'quiet', 'dark', 'urban']


def members_of(album_region, k):
    return [i for i, r in enumerate(album_region) if r == k]


def mean_weights(ids, src=None):
    if not ids:
        return [0, 0, 0, 0, 0, 1]
    return [round(sum(weights[src[i] if src else i][j] for i in ids) / len(ids), 3) for j in range(6)]


def nearest(ids, pos, cx, cy, k=6):
    return sorted(ids, key=lambda i: (pos[2 * i] - cx) ** 2 + (pos[2 * i + 1] - cy) ** 2)[:k]


def margin(ev):
    """How far the name word stands clear of the runner-up (the last tie-break of label priority)."""
    if 'word' in ev:
        return ev['coverage'] - ev.get('next', 0)
    return abs(ev.get('z', 0)) / 10


def finish(stop, regions, album_region, album_area=None, pos=None, src=None):
    """Fill the derived fields every region needs, whatever produced it. `priority`: higher shows first
    (the automated recipe's scale: broad areas about 12, strong regions 2 to 3, fair regions 1 to 2).
    `pos` and `src` are given for the synthetic stress data (its own positions; point -> real album)."""
    pos = pos or positions[stop]
    for k, r in enumerate(regions):
        ids = members_of(album_area if (r.get('level', 1) == 0 and album_area) else album_region, k)
        r.setdefault('level', 1)
        r.setdefault('parent', None)
        r['n'] = r.get('n') or len(ids)
        if not r.get('fw'):
            r['fw'] = mean_weights(ids, src)
        if not r.get('best_known'):
            r['best_known'] = sorted(ids)[:8]  # albums.json order follows chart rank for most of the list
        if not r.get('centre'):
            r['centre'] = nearest(ids, pos, r['cx'], r['cy'])
        r['top_words'] = [w if isinstance(w, str) else w.get('word') for w in r.get('top_words', [])][:4]
        if r.get('priority') is None:  # strong before fair, then size, then evidence margin
            r['priority'] = round((2 if r['strength'] == 'strong' else 1) + r['n'] / 1000 + margin(r['evidence']) / 100, 4)
        for key in ('needs_name', 'prev_id', 'overlap', 'status'):
            r.pop(key, None)
        r['cx'], r['cy'], r['radius'] = round(r['cx'], 4), round(r['cy'], 4), round(r['radius'], 4)
    return {'stop': stop, 'regions': regions, 'album_region': album_region}


def hand_made_balanced():
    ix = {r['id']: k for k, r in enumerate(hand['regions'])}
    album_region = [ix[x] if x is not None else -1 for x in hand['album_region']]
    out = []
    for r in hand['regions']:
        e = r['name_evidence']
        if 'word' in e:
            ev = {'word': e['word'], 'coverage': e['coverage'], 'overall': e['overall'], 'lift': e['lift'], 'next': e['max_other_region']}
        else:
            ev = {'feature': e['feature'], 'z': e['z']}
        out.append({
            'id': r['id'], 'level': 1, 'parent': None, 'word': e.get('word') or e.get('feature'), 'named_from': r.get('named_from', 'word'),
            'name': r['name_space'], 'plain': r['label_plain'], 'strength': r['strength'],
            'cx': r['cx'], 'cy': r['cy'], 'radius': r['radius'], 'hull': r['hull'], 'n': r['n'], 'evidence': ev,
            'top_words': r.get('top_words', []),
        })
    return finish('balanced', out, album_region)


auto_path = os.path.join(THEME, 'scaling', 'out', 'regions_all.json')
auto = load(auto_path) if os.path.exists(auto_path) else None
regions = {}
for stop in STOPS:
    use_auto = auto is not None and stop in auto and (stop != 'balanced' or AUTO_BALANCED)
    if use_auto:
        regions[stop] = finish(stop, auto[stop]['regions'], auto[stop]['album_region'], auto[stop].get('album_area'))
    elif stop == 'balanced':
        regions[stop] = hand_made_balanced()
    else:
        regions[stop] = {'stop': stop, 'regions': [], 'album_region': [-1] * N}

data = {
    'n': N,
    'albums': [{'t': a['t'], 'a': a['a'], 'slug': a['slug'], 's': a.get('s', ''), 'd': a['d'], 'w': a['w']} for a in albums],
    'vocab': vocab,
    'positions': {s: [round(v, 4) for v in positions[s]] for s in STOPS},
    'recs': {s: recs[s] for s in STOPS},
    # family weights as integers 0..100, flat, six per album: fierce, warm, quiet, dark, urban, neutral
    'weights': [round(v * 100) for w in weights for v in w],
    'families': colour['family_order'],
    'caption': colour['caption'],
    'regions': regions,
    'regionSource': {s: ('auto' if auto is not None and s in auto and (s != 'balanced' or AUTO_BALANCED) else ('hand' if s == 'balanced' else 'none')) for s in STOPS},
}
out = os.path.join(HERE, 'data', 'data.js')
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', encoding='utf-8') as f:
    f.write('// Generated by build_data.py. Do not edit.\nwindow.RMR_DATA=')
    json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
    f.write(';\n')
# Optional: the synthetic 10,000-point stress layout (Balanced only), from the scaling work.
synth_path = os.path.join(THEME, 'scaling', 'out', 'synth10k.json')
if os.path.exists(synth_path):
    sy = load(synth_path)
    conv = {'n': sy['n'], 'positions': [round(v, 4) for v in sy['positions']], 'src': sy['src']}
    for key in ('regions_default', 'regions_fine'):
        g = sy[key]
        conv[key] = finish('balanced', g['regions'], g['album_region'], g.get('album_area'), sy['positions'], sy['src'])
    sout = os.path.join(HERE, 'data', 'synth10k.js')
    with open(sout, 'w', encoding='utf-8') as f:
        f.write('// Generated by build_data.py from scaling/out/synth10k.json. Do not edit.\nwindow.RMR_SYNTH=')
        json.dump(conv, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';\n')
    print(sout, os.path.getsize(sout) // 1024, 'KB;', ', '.join(f"{k}: {len(conv[k]['regions'])} regions" for k in ('regions_default', 'regions_fine')))
# Optional: colour schemes (other channel sets and palettes for the gas), from the colour-options work.
# window.RMR_SCHEMES = {schemes: [{id, name, channels (at most 6), palettes: [{id, hues, neutral}], guard_pairs,
# weights: flat, 7 per album in albums.json order (six channels zero-padded, then neutral), integers 0..100}]}.
# The page loads this file only when the hash carries scheme=<id>.
schemes_path = os.path.join(THEME, 'colour-options', 'schemes.json')
if os.path.exists(schemes_path):
    conv = []
    for sc in load(schemes_path)['schemes']:
        w = sc['weights']
        assert len(sc['channels']) <= 6 and len(w) == 7 * N, sc['id']
        top = max(w) or 1
        conv.append({'id': sc['id'], 'name': sc['name'], 'channels': sc['channels'],
                     'palettes': [{'id': p['id'], 'hues': p['hues'], 'neutral': p['neutral']} for p in sc['palettes']],
                     'guard_pairs': sc.get('guard_pairs') or [],
                     'weights': [round(v * (100 if top <= 1.5 else 1)) for v in w]})
    cout = os.path.join(HERE, 'data', 'schemes.js')
    with open(cout, 'w', encoding='utf-8') as f:
        f.write('// Generated by build_data.py from colour-options/schemes.json. Do not edit.\nwindow.RMR_SCHEMES=')
        json.dump({'schemes': conv}, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';\n')
    print(cout, os.path.getsize(cout) // 1024, 'KB;', ', '.join(f"{c['id']}: {'/'.join(p['id'] for p in c['palettes'])}" for c in conv))
print(out, os.path.getsize(out) // 1024, 'KB;', ', '.join(f"{s}: {len(regions[s]['regions'])} regions ({data['regionSource'][s]})" for s in STOPS))
