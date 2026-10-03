#!/bin/bash
# Render option images for the owner into ../options as JPG (quality 88), one headless browser at a time.
# usage: tools/options.sh <file with lines "name|hash[|width|height]">   (or the list on stdin)
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="$HERE/../../options"; mkdir -p "$OUT"
while IFS='|' read -r name hash w h; do
  [ -z "$name" ] && continue
  "$HERE/shot.sh" "$hash" "$OUT/$name.png" "${w:-1600}" "${h:-1000}" 12000 >/dev/null && echo "$name"
done < "${1:-/dev/stdin}"
arch -x86_64 python3 - "$OUT" <<'PY'
import sys, os, glob
from PIL import Image
for p in glob.glob(os.path.join(sys.argv[1], '*.png')):
    Image.open(p).convert('RGB').save(p[:-4] + '.jpg', quality=88, optimize=True); os.remove(p)
PY
