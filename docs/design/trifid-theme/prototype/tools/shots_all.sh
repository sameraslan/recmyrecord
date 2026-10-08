#!/bin/bash
# Regenerate every screenshot used by screens.html, one headless browser at a time, then convert to JPG.
# usage: tools/shots_all.sh [name-prefix]   (only shots whose name starts with the prefix)
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="$HERE/../shots"; ONLY="$1"
SR='the-stone-roses-the-stone-roses'
while IFS='|' read -r name hash w h; do
  [ -z "$name" ] && continue; case "$name" in "$ONLY"*) ;; *) continue;; esac
  "$HERE/shot.sh" "$hash" "$OUT/$name.png" "${w:-1600}" "${h:-1000}" >/dev/null && echo "$name"
done <<LIST
map-overview|#/map
map-whole|#/map?fit=whole
map-names-all|#/map?names=all
map-explore-pick|#/map?pick=pet-sounds-the-beach-boys
album-5|#/album/$SR
album-10-hot|#/album/$SR?more=1&hover=3614
album-teal|#/album/bryter-layter-nick-drake
album-gold-covers|#/album/pet-sounds-the-beach-boys?cam=0.1675,-0.1043,5000
slider-sonic|#/map?stop=sonic
slider-mood|#/map?stop=mood
chrome-site-album|#/album/$SR?chrome=site
chrome-site-overview|#/map?chrome=site
zoom-b|#/map?cam=0.05,0.1,1838
zoom-c|#/map?cam=0.05,0.1,2600
zoom-d|#/map?cam=0.05,0.1,4400
search|#/map?q=stone
morph-25|#/map?stop=mood&morph=0.25&from=balanced
morph-50|#/map?stop=mood&morph=0.5&from=balanced
morph-75|#/map?stop=mood&morph=0.75&from=balanced
home|#/
about|#/about
notfound|#/404
phone-home|#/|390|844
phone-list-top|#/album/$SR|390|844
phone-list-strip|#/album/$SR?scroll=strip|390|844
phone-map-mode|#/album/$SR?view=map|390|844
phone-map-overview|#/map|390|844
phone-name-plate|#/album/$SR?view=map&plate=2|390|844
phone-explore-sheet|#/map?pick=pet-sounds-the-beach-boys|390|844
phone-search-sheet|#/map?q=stone|390|844
stress-overview|#/map?data=10k
stress-whole|#/map?data=10k&fit=whole
stress-covers|#/map?data=10k&cam=0.05,0.1,7800
gas-live-overview|#/map?gas=live
gas-live-band-c|#/map?gas=live&cam=0.05,0.1,3000
gas-baked-band-c|#/map?cam=0.05,0.1,3000
LIST
arch -x86_64 python3 - "$OUT" <<'PY'
import sys, os, glob
from PIL import Image
for p in glob.glob(os.path.join(sys.argv[1], '*.png')):
    Image.open(p).convert('RGB').save(p[:-4] + '.jpg', quality=85, optimize=True); os.remove(p)
PY
