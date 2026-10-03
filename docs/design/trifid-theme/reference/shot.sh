#!/bin/bash
# usage: shot.sh <abs path to .html> <abs path to out.png> [width] [height]
# Serialised via a lock so only one headless browser runs at a time (laptop overheats).
LOCK="$(dirname "$0")/.shot.lock"
for i in $(seq 1 300); do mkdir "$LOCK" 2>/dev/null && break; sleep 2; done
W="${3:-1600}"; H="${4:-1000}"; D="$(mktemp -d)"
rm -f "$2"
"/Users/saslan.19/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell" --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
  --window-size="$W,$H" --virtual-time-budget=8000 --user-data-dir="$D" --screenshot="$2" "file://$1" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 60); do kill -0 $PID 2>/dev/null || break; sleep 1; done
kill -9 $PID 2>/dev/null; rm -rf "$D"; rmdir "$LOCK" 2>/dev/null
ls -la "$2"
