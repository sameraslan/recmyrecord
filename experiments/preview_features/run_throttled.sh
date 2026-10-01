#!/bin/bash
# Laptop-friendly extraction: two low-priority workers, three resumable stages run one after another.
#   1. every track of the stratified clip-length subset (results/clip_length_subset_rows.txt)
#   2. four spread tracks from every matched album (breadth-first pass 1)
#   3. up to eight tracks from every album (only with STAGE3=1)
# Safe to stop and rerun at any point; finished tracks are skipped.
cd "$(dirname "$0")" || exit 1
export PYTHONUNBUFFERED=1
run() { nice -n 19 .venv/bin/python extract.py --no-maest --workers "${WORKERS:-2}" "$@" >> cache/extract.log 2>&1; }
echo "== subset $(date +%T)" >> cache/extract.log; run --max-tracks-per-album 30 --rows "$(cat results/clip_length_subset_rows.txt)"
echo "== four-per-album $(date +%T)" >> cache/extract.log; run --max-tracks-per-album 4
if [ "${STAGE3:-0}" = 1 ]; then echo "== eight-per-album $(date +%T)" >> cache/extract.log; run --max-tracks-per-album 8; fi
echo "== done $(date +%T)" >> cache/extract.log
