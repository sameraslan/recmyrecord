#!/bin/bash
# The final evaluation: everything the report cites, from the real caches (read-only), one light
# process at a time. Safe while the extractor runs: the first step snapshots the albums analysed so
# far (OUT/pool_rows.txt) and every later step works on exactly those, with the first 4 tracks in
# priority order of each album.
#   ./run_evaluation.sh [OUT_DIR [PARQUET_DIR [SOLUTION_DIR]]]   defaults: results/ cache/ cache/solution/
# The parquets hold every analysed track of every album (the descriptor experiment reads
# embeddings.parquet). SOLUTION_DIR gets the fitted transform and the site-shaped recs.json.
set -euo pipefail
cd "$(dirname "$0")"
export OMP_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 PYTHONUNBUFFERED=1 PYTHONWARNINGS=ignore
OUT="${1:-results}"
PARQUET="${2:-cache}"
SOLUTION="${3:-cache/solution}"
ROWS="$OUT/pool_rows.txt"
py() { echo "== $* $(date +%T)"; nice -n 19 .venv/bin/python "$@"; }
mkdir -p "$OUT" "$PARQUET"
rm -f "$ROWS"
py aggregate.py --features "$PARQUET/album_features.parquet" --embeddings "$PARQUET/embeddings.parquet"
py solution.py fit --rows "$ROWS" --dir "$SOLUTION" --publish "$OUT"   # pool_rows.txt, transform.npz (+ OUT/solution_transform.npz)
py solution.py holdout --rows "$ROWS" --out "$OUT"                     # holdout.{md,json}: the new-album test
py solution.py recs --rows "$ROWS" --dir "$SOLUTION"                   # recs.json, meta.json
py evaluate.py --rows "$ROWS" --out "$OUT"                             # metrics.{md,json}, seeds.{md,json}, failure CSVs
py evaluate.py --rows "$ROWS" --subset clean --out "$OUT/clean"        # the same with the Ridge trained on clean matches only
py simbench.py --rows "$ROWS" --out "$OUT" --ref D64 \
   --reps A,B13v,Ball,Cvm,D16,D24,D32,D48,D64,Dn24,E,F,D24~mp,D64~mp,D64~ls   # simbench.{md,json}
py final_analyses.py --rows "$ROWS" --out "$OUT"                       # analyses.{md,json}
py tracks_per_album.py --rows "$ROWS" --out "$OUT"                     # tracks_per_album.{md,json}
py clip_length.py --mode full --out "$OUT"                             # clip_length.{md,json}
echo "== done $(date +%T)"
