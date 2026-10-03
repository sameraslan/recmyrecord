#!/bin/bash
# Screenshot or DOM-dump the prototype with one headless Chromium at a time (the laptop overheats).
# usage: shot.sh '<hash, e.g. #/map?region=playful>' <abs out.png | --dom> [width] [height] [virtual ms]
# A virtual time of 0 runs in real time (needed for bench=1, whose timings must be wall-clock).
# Copy of ../../reference/shot.sh that accepts a URL hash, a longer time budget and software WebGL.
HERE="$(cd "$(dirname "$0")" && pwd)"
PAGE="${PAGE:-$HERE/../index.html}"
LOCK="$HERE/../../reference/.shot.lock"
for i in $(seq 1 300); do mkdir "$LOCK" 2>/dev/null && break; sleep 2; done
W="${3:-1600}"; H="${4:-1000}"; T="${5:-9000}"; D="$(mktemp -d)"
BIN="/Users/saslan.19/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
FLAGS=(--disable-gpu --enable-unsafe-swiftshader --use-angle=swiftshader --hide-scrollbars --allow-file-access-from-files
  --force-device-scale-factor=1 --window-size="$W,$H" --user-data-dir="$D")
[ "$T" != "0" ] && FLAGS+=(--virtual-time-budget="$T")
URL="file://$PAGE$1"
if [ "$2" = "--dom" ]; then
  "$BIN" "${FLAGS[@]}" --dump-dom "$URL" 2>/dev/null > "$D/dom.html" &
else
  rm -f "$2"
  "$BIN" "${FLAGS[@]}" --screenshot="$2" "$URL" >/dev/null 2>&1 &
fi
PID=$!
for i in $(seq 1 120); do kill -0 $PID 2>/dev/null || break; sleep 1; done
kill -9 $PID 2>/dev/null
if [ "$2" = "--dom" ]; then grep -o '<html[^>]*>' "$D/dom.html" | head -1; grep -o 'id="proto-errors"[^<]*<[^<]*' "$D/dom.html" | head -3; [ -n "$GREP" ] && grep -o "$GREP" "$D/dom.html" | head -20; else ls -la "$2"; fi
rm -rf "$D"; rmdir "$LOCK" 2>/dev/null
