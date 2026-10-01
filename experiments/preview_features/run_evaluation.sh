#!/bin/bash
# Everything the evaluation writes, from the real caches (read-only), one light process at a time.
#   ./run_evaluation.sh [OUT_DIR [PARQUET_DIR]]     defaults: results/ and cache/
# Safe while the extractor runs. The parquets hold every analysed track of every album (the
# descriptor experiment reads embeddings.parquet); the evaluation itself reads the track cache and
# uses the first 4 tracks in priority order of EVERY album, so all albums are treated alike.
set -euo pipefail
cd "$(dirname "$0")"
export OMP_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 PYTHONUNBUFFERED=1 PYTHONWARNINGS=ignore
OUT="${1:-results}"
PARQUET="${2:-cache}"
py() { echo "== $* $(date +%T)"; nice -n 19 .venv/bin/python "$@"; }
mkdir -p "$OUT" "$PARQUET"
py aggregate.py --features "$PARQUET/album_features.parquet" --embeddings "$PARQUET/embeddings.parquet"
py evaluate.py --out "$OUT"                          # metrics.{md,json}, seeds.md, the two failure CSVs
py evaluate.py --subset clean --out "$OUT/clean"     # the same with the Ridge trained on clean matches only
py tracks_per_album.py --out "$OUT"                  # tracks_per_album.{md,json}
py clip_length.py --mode full --out "$OUT"           # clip_length.{md,json}
echo "== done $(date +%T)"
